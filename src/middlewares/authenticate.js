// src/middlewares/authenticate.js
'use strict';

const AppError = require('../utils/AppError');
const SessionService = require('../services/SessionService');

/** Session cookie name (ADR-009 design D3). */
const SESSION_COOKIE = 'afm_session';

function readCookie(req, name) {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
    }
    return null;
}

function readToken(req) {
    const auth = req.get('authorization');
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return readCookie(req, SESSION_COOKIE);
}

/**
 * Session authentication (ADR-009, identity/authentication spec). Accepts
 * the session cookie or an `Authorization: Bearer` token - both resolve to
 * the same session. Attaches `req.user`/`req.session`.
 *
 * Mounted in src/routes/api.js after `/health` and `/auth`, in front of
 * every other router, so `/api/v1` and `/api` are secured identically
 * (AGENTS.md rule 4a).
 */
function authenticate(req, res, next) {
    const token = readToken(req);
    const resolved = token ? SessionService.validateSession(token) : null;
    if (!resolved) return next(new AppError('Authentication required.', 401));
    req.user = resolved.user;
    req.session = resolved.session;
    next();
}

module.exports = { authenticate, SESSION_COOKIE, readCookie };
