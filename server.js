// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const config = require('./src/config/env');
const errorHandler = require('./src/middlewares/errorHandler');
const { createRateLimit } = require('./src/middlewares/rateLimit');
const apiRoutes = require('./src/routes/api');

const app = express();

/* ─── Proxy trust ─── */
// The app runs behind a single nginx hop (scripts/nginx/dimension.conf sends
// X-Forwarded-For and terminates TLS). Trust exactly one hop so rate-limit
// keying can use the forwarded client address without letting a caller spoof
// extra hops. Keep this in step with the proxy deployment (ADR-008).
const NGINX_PROXY_HOPS = 1;
app.set('trust proxy', NGINX_PROXY_HOPS);

/* ─── Security & Middlewares ─── */
// Content-Security-Policy is ON (it was disabled because of CDN fonts and inline
// scripts; neither exists any more). Every directive below is derived from what
// the shipped SPA actually loads - this policy is measured, not guessed:
//
//   default-src 'self'  - everything falls back to same-origin.
//   script-src  'self'  - the strict part, and the reason this matters. All eight
//                         page modules are external files; there is no inline
//                         <script> and no on* handler anywhere in the shells.
//   style-src    ...    - 'unsafe-inline' is still REQUIRED: 13 inline style=
//                         attributes live in the page modules' innerHTML
//                         templates (app/dashboard/uploads). tokens.css also
//                         @imports Google Fonts. Script strictness is what blocks
//                         XSS; inline style is a far weaker vector, so this is the
//                         honest cost of not rewriting every renderer. Tighten to
//                         'self' once those templates stop emitting style=.
//   font-src     ...    - fonts.gstatic.com serves the @imported webfonts.
//   img-src      'self' data:  - thumbnails are same-origin; components.css uses
//                         data:image/svg+xml backgrounds.//   connect-src  'self'  - window.API is same-origin /admin/v1 (ADR-007). A cross-
//   origin deployment is blocked here by design; CORS
//   cannot relax CSP.
//   object-src/base-uri/frame-ancestors - no plugins, no base-tag hijack, no
//                         framing. frame-ancestors supersedes X-Frame-Options.
const CSP_DIRECTIVES = {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
    fontSrc: ["'self'", 'https://fonts.gstatic.com'],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'self'"],
};

app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
}));
/* ─── CORS ─── */
// Same-origin by default: unless explicitly enabled, no CORS middleware is
// registered at all, so the browser never receives an
// Access-Control-Allow-* header and every cross-origin call is refused at the
// browser layer. When enabled, reflect only allowlisted origins (validated
// once at startup in config.validateStartup); a same-origin request carries
// no Origin header and is answered with no CORS header.
if (config.cors.enabled) {
    app.use(cors({
        origin(requestOrigin, cb) {
            if (!requestOrigin) return cb(null, false);
            if (config.cors.allowWildcard) {
                return cb(null, '*');
            }
            return cb(null, config.cors.allowedOrigins.includes(requestOrigin) ? requestOrigin : false);
        },
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
        credentials: false,
    }));
}

/* ─── Rate limiting ─── */
// Mounted on /admin only, so the static shell and SPA fetches are never limited.
// Placed BEFORE the body parsers: a flood is refused without paying to parse it.
app.use('/admin', createRateLimit());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

/* ─── Static Frontend Serving ─── */
app.use(express.static(path.join(__dirname, 'public')));

/* ─── API Routes ─── */
// One assembly (health, fs, dashboard, settings - src/routes/api.js) served at
// two prefixes by a single registration: `/admin/v1` is the contract, `/admin` the
// retained compatibility alias (ADR-007). The array order matters - `/admin/v1` is
// tried first, so a v1 request is never re-interpreted under the alias - and the
// mount MUST precede the /admin catch-all below, because that catch-all is a
// two-argument middleware that never calls next() and so terminates the chain:
// anything mounted after it would be permanently unreachable.
// An unknown version (`/admin/v2/...`) matches the alias with no route, falls
// through, and gets the catch-all's JSON 404 - never v1's handlers.
app.use(['/admin/v1', '/admin'], apiRoutes);

// Catch-all for undefined API routes. Registered exactly once: it never calls
// next(), so a second copy below it was unreachable dead code.
app.use('/admin', (req, res) => {
    res.status(404).json({ success: false, error: 'API endpoint not found' });
});

/* ─── Frontend Fallback (Pathless Middleware compatible with Express 5 / Node 24) ─── */
app.use((req, res, next) => {
    // Only serve index.html for GET requests that expect HTML
    if (req.method === 'GET' && !req.path.startsWith('/admin')) {
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
// Expose the Express app alongside the HTTP listener so tests can assert
// middleware configuration (e.g. `trust proxy`) without re-booting.
module.exports.app = app;
