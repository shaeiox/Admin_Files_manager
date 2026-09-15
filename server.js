// server.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const config = require('./src/config/env');
const errorHandler = require('./src/middlewares/errorHandler');

const app = express();

/* ─── Security & Middlewares ─── */
app.use(helmet({
    contentSecurityPolicy: false // Disable CSP in dev to allow CDN fonts and inline scripts
}));
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

/* ─── Static Frontend Serving ─── */
app.use(express.static(path.join(__dirname, 'public')));

/* ─── API Routes (Placeholders for next phases) ─── */
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Dimension API is running', env: config.env });
});

// Catch-all for undefined API routes
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
app.listen(config.port, () => {
    console.log(`=========================================`);
    console.log(`🚀 Dimension Server running on port ${config.port}`);
    console.log(`📁 Target Storage Root: ${config.storageRoot}`);
    console.log(`🌍 Environment: ${config.env}`);
    console.log(`=========================================`);
});