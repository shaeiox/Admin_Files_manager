// src/middlewares/authenticate.js
'use strict';

const AppError = require('../utils/AppError');
const SessionService = require('../services/SessionService');

/**
 * Cookie names (access-refresh-session-tokens D6). Only the access token
 * authenticates an API call; the refresh cookie is read solely by
 * /auth/refresh and /auth/logout. `afm_session` is retired.
 */
const ACCESS_COOKIE = 'afm_access';
const REFRESH_COOKIE = 'afm_refresh';

function readCookie(req, name) {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        if (part.slice(0, eq).trim() !== name) continue;
        try {
            return decodeURIComponent(part.slice(eq + 1).trim());
        } catch {
            return null; // a malformed value is "no credential" (401), not a URIError (500)
        }
    }
    return null;
}

function readToken(req) {
    const auth = req.get('authorization');
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return readCookie(req, ACCESS_COOKIE);
}

/**
 * Session authentication (ADR-009, identity/session-tokens spec). Accepts
 * the access token as the `afm_access` cookie or an `Authorization: Bearer`
 * header; a refresh token is refused by kind (SessionService.validateSession).
 * Attaches `req.user`/`req.session`.
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

module.exports = { authenticate, ACCESS_COOKIE, REFRESH_COOKIE, readCookie, readToken };
