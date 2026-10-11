// src/middlewares/requireAdmin.js
'use strict';

const AppError = require('../utils/AppError');

/**
 * Gates the admin-only routes added by ADR-009 (identity/rbac-lite spec).
 * One comparison, no permission catalogue. Must run after `authenticate`.
 */
function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
        return next(new AppError('Administrator access required.', 403));
    }
    next();
}

module.exports = requireAdmin;
