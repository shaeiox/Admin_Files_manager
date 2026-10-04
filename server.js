// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const config = require('./src/config/env');
const errorHandler = require('./src/middlewares/errorHandler');
const apiRoutes = require('./src/routes/api');

const app = express();

/* ─── Security & Middlewares ─── */
app.use(helmet({
    contentSecurityPolicy: false // Disable CSP in dev to allow CDN fonts and inline scripts
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

/* ─── Static Frontend Serving ─── */
app.use(express.static(path.join(__dirname, 'public')));

/* ─── API Routes ─── */
// One assembly (health, fs, dashboard, settings - src/routes/api.js) served at
// two prefixes by a single registration: `/api/v1` is the contract, `/api` the
// retained compatibility alias (ADR-007). The array order matters - `/api/v1` is
// tried first, so a v1 request is never re-interpreted under the alias - and the
// mount MUST precede the /api catch-all below, because that catch-all is a
// two-argument middleware that never calls next() and so terminates the chain:
// anything mounted after it would be permanently unreachable.
// An unknown version (`/api/v2/...`) matches the alias with no route, falls
// through, and gets the catch-all's JSON 404 - never v1's handlers.
app.use(['/api/v1', '/api'], apiRoutes);

// Catch-all for undefined API routes. Registered exactly once: it never calls
// next(), so a second copy below it was unreachable dead code.
app.use('/api', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
});

/* ─── Frontend Fallback (Pathless Middleware compatible with Express 5 / Node 24) ─── */
app.use((req, res, next) => {
    // Only serve index.html for GET requests that expect HTML
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    next();
});

/* ─── Global Error Handler ─── */
app.use(errorHandler);

/* ─── Startup Validation ─── */
// A present-but-unusable configuration (relative or foreign-platform
// STORAGE_ROOT, a root that does not exist, a malformed UPLOAD_MAX_BYTES, a
// production host without AFM_DATA_DIR) stops the process HERE, before any
// connection is accepted - never as a per-request failure later.
const configProblems = config.validateStartup();
if (configProblems.length > 0) {
    for (const problem of configProblems) console.error(`FATAL CONFIGURATION ERROR: ${problem}`);
    process.exit(1);
}

/* ─── Boot Server ─── */
// The handle is exported so integration tests can read the bound port and close
// the listener. Without it every require() leaks a live server that keeps the
// event loop alive forever. HTTP behaviour is unchanged for normal startup.
const server = app.listen(config.port, () => {
    console.log(`=========================================`);
    console.log(`🚀 Dimension Server running on port ${config.port}`);
    console.log(`📁 Target Storage Root: ${config.storageRoot}`);
    console.log(`🗄  Data Directory: ${config.dataDir}`);
    console.log(`🌍 Environment: ${config.env}`);
    console.log(`=========================================`);
});

/* ─── Graceful Shutdown ─── */
// On SIGTERM (what systemd sends) or SIGINT: stop accepting connections, let
// in-flight uploads and downloads finish, then exit. A stuck transfer cannot
// wedge a deployment: after the grace period the process exits by force.
//
// Timeouts are ORDERED (production-cicd-readiness D5) - keep them that way:
//   application grace period   30 s   (here)            exits first
//   systemd TimeoutStopSec     45 s   (scripts/systemd/dimension.service) > app, or systemd SIGKILLs a draining process
//   nginx proxy_read_timeout  600 s   (scripts/nginx/dimension.conf)       > app, or the proxy severs a live request
const SHUTDOWN_GRACE_MS = 30000;

function shutdown(signal) {
    console.log(`[shutdown] ${signal} received: no new connections; draining in-flight requests (grace ${SHUTDOWN_GRACE_MS / 1000}s).`);
    const force = setTimeout(() => {
        console.error(`[shutdown] Grace period elapsed with requests still in flight; forcing exit.`);
        process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    force.unref();
    server.close(() => {
        console.log('[shutdown] All connections closed; exiting.');
        process.exit(0);
    });
    // Idle keep-alive sockets carry no request; closing them lets close() finish.
    if (server.closeIdleConnections) server.closeIdleConnections();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

module.exports = server;
