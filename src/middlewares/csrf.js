// src/middlewares/csrf.js
'use strict';

const AppError = require('../utils/AppError');

const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defense (ADR-009 design D3, identity/authentication spec). Every
 * non-GET request must present the current session's csrf_secret, either as
 * a header (every fetch/XHR-based mutation) or as a `csrfToken` body field
 * (the one exception: `POST /fs/download-zip`'s hidden-form-POST transport,
 * api.js's `downloadZip`, cannot set a custom header at all - a same-origin
 * form can still carry the token as a field, which a cross-site attacker's
 * forged form cannot, since it never had the secret to begin with). The
 * cookie alone is never proof of intent for a state-changing request. Must
 * run after `authenticate`, which populates `req.session`.
 */
function csrf(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();
    const presented = req.get(CSRF_HEADER) || (req.body && req.body.csrfToken);
    if (!req.session || !presented || presented !== req.session.csrf_secret) {
        return next(new AppError('Missing or invalid CSRF token.', 403));
    }
    next();
}

module.exports = csrf;
module.exports.CSRF_HEADER = CSRF_HEADER;
