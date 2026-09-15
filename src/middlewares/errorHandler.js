// src/middlewares/errorHandler.js
const config = require('../config/env');

const errorHandler = (err, req, res, next) => {
    // Log the actual error for server admins
    console.error(`[ERROR] ${req.method} ${req.path} >>`, err.message);

    const statusCode = err.statusCode || 500;

    // Security: Sanitize error messages in production to prevent path leakage
    let message = err.message || 'Internal Server Error';
    if (config.env === 'production' && statusCode === 500) {
        message = 'An unexpected error occurred on the server.';
    }

    res.status(statusCode).json({
        success: false,
        error: message,
        // Only send stack trace in development mode
        stack: config.env === 'development' ? err.stack : undefined
    });
};

module.exports = errorHandler;