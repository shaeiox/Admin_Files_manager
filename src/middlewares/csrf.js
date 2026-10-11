// src/middlewares/csrf.js
'use strict';

const AppError = require('../utils/AppError');

const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense (ADR-009 design D3, identity/authentication spec). Every
 * non-GET request must present the current session's csrf_secret in a
 * header; the cookie alone is not proof of intent for a state-changing
 * request. Must run after `authenticate`, which populates `req.session`.
 */
function csrf(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    const presented = req.get(CSRF_HEADER);
    if (!req.session || !presented || presented !== req.session.csrf_secret) {
        return next(new AppError('Missing or invalid CSRF token.', 403));
    }
    next();
}

module.exports = csrf;
module.exports.CSRF_HEADER = CSRF_HEADER;
