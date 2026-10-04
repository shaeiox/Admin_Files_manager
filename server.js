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

/* ─── Boot Server ─── */
// The handle is exported so integration tests can read the bound port and close
// the listener. Without it every require() leaks a live server that keeps the
// event loop alive forever. HTTP behaviour is unchanged for normal startup.
const server = app.listen(config.port, () => {
    console.log(`=========================================`);
    console.log(`🚀 Dimension Server running on port ${config.port}`);
    console.log(`📁 Target Storage Root: ${config.storageRoot}`);
    console.log(`🌍 Environment: ${config.env}`);
    console.log(`=========================================`);
});

module.exports = server;
