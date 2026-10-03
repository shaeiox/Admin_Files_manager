// src/middlewares/errorHandler.js
'use strict';

const AppError = require('../utils/AppError');

/**
 * Serialises an error into the project error envelope: { success: false, error }.
 *
 * Only AppError messages are forwarded to the client. AppError messages are
 * authored static strings - the Dashboard contract requires them to carry no path,
 * no errno and no system detail - so they are safe to display and are what makes
 * errors like "Access denied. Path traversal detected." useful.
 *
 * Any other error may embed absolute filesystem paths in its message (a raw fs
 * error reads "ENOENT: no such file or directory, open 'C:\\...'"), so those
 * clients receive a generic string instead. This holds in EVERY environment,
 * including development: a stack trace or a system path is never useful to a
 * browser and disclosing the server's on-disk layout is a real risk on an
 * application that ships with no authentication.
 *
 * The full error, including its stack, is always written to the server log, so
 * nothing is lost for debugging.
 */
const errorHandler = (err, req, res, next) => {
    // The stack is logged here and ONLY here - never serialised to the client.
    console.error(`[ERROR] ${req.method} ${req.path} >>`, err.stack || err.message);

    const statusCode = err.statusCode || 500;

    let message;
    if (err instanceof AppError) {
        message = err.message;
    } else if (statusCode >= 500) {
        message = 'An unexpected error occurred on the server.';
    } else {
        message = 'Request could not be processed.';
    }

    res.status(statusCode).json({
        success: false,
        error: message,
    });
};

module.exports = errorHandler;
