// src/controllers/auth.controller.js
'use strict';

const AppError = require('../utils/AppError');
const SessionService = require('../services/SessionService');
const config = require('../config/env');
const csrf = require('../middlewares/csrf');
const { ACCESS_COOKIE, REFRESH_COOKIE, readCookie, readToken } = require('../middlewares/authenticate');

/**
 * The refresh cookie is set once per auth mount (design D6). The two prefixes
 * are mutually exclusive, so a request carries at most one of them, and the
 * year-long credential never rides along on an ordinary API call.
 */
const REFRESH_COOKIE_PATHS = ['/api/v1/auth', '/api/auth'];

function cookie(name, value, { path, sameSite, maxAge, secure }) {
    const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, 'HttpOnly', `SameSite=${sameSite}`, `Max-Age=${maxAge}`];
    // Follows the real scheme (X-Forwarded-Proto via `trust proxy`), not NODE_ENV:
    // systemd pins production, and a Secure cookie on a plain-HTTP origin is
    // dropped by the browser - login then loops. Both shipped nginx configs set
    // X-Forwarded-Proto, so TLS deployments still get Secure.
    if (secure) parts.push('Secure');
    return parts.join('; ');
}

/** Emits afm_access (Path=/, Lax) and afm_refresh (auth paths, Strict). */
function setAuthCookies(req, res, { accessToken, refreshToken, session }) {
    const untilCap = Math.max(0, Math.floor((session.absolute_expires_at - Date.now()) / 1000));
    const accessAge = Math.min(config.sessionTokens.accessTtlSeconds, untilCap);
    const refreshAge = Math.min(config.sessionTokens.refreshTtlSeconds, untilCap);
    res.setHeader('Set-Cookie', [
        cookie(ACCESS_COOKIE, accessToken, { path: '/', sameSite: 'Lax', maxAge: accessAge, secure: req.secure }),
        ...REFRESH_COOKIE_PATHS.map((path) =>
            cookie(REFRESH_COOKIE, refreshToken, { path, sameSite: 'Strict', maxAge: refreshAge, secure: req.secure })),
    ]);
}

function clearAuthCookies(req, res) {
    res.setHeader('Set-Cookie', [
        cookie(ACCESS_COOKIE, '', { path: '/', sameSite: 'Lax', maxAge: 0, secure: req.secure }),
        ...REFRESH_COOKIE_PATHS.map((path) =>
            cookie(REFRESH_COOKIE, '', { path, sameSite: 'Strict', maxAge: 0, secure: req.secure })),
    ]);
}

/**
 * POST /api/auth/login
 * Mutating -> envelope response (rule 6). The identical response for "no
 * such account" and "wrong password" is enforced here: both reach
 * `result.ok === false` and raise the same AppError.
 */
function login(req, res, next) {
    try {
        const { username, password, dpopJwk } = req.body || {};
        const result = SessionService.login({
            username,
            password,
            dpopJwk,
            ip: req.ip,
            userAgent: req.get('user-agent') || null,
        });
        if (!result.ok) throw new AppError('Invalid username or password.', 401);

        // The body never carries a token: cookies only (session-tokens spec).
        setAuthCookies(req, res, result);
        return res.json({
            success: true,
            user: { id: result.user.id, username: result.user.username, role: result.user.role },
            csrfToken: result.csrfSecret,
        });
    } catch (error) {
        return next(error);
    }
}

/**
 * POST /api/auth/refresh
 * Mounted above `authenticate` (design D7): it is needed exactly when the
 * access token is dead. Self-gated by the refresh cookie + a DPoP proof
 * (header `DPoP`) bound to this path. No CSRF header: the refresh cookie is
 * SameSite=Strict and path-scoped, so a cross-site request cannot carry it.
 * Every failure is one identical 401. Mutating -> envelope; the csrfToken is
 * returned so a reloaded page can recover it in the same round trip.
 */
function refresh(req, res, next) {
    try {
        const result = SessionService.refresh({
            refreshToken: readCookie(req, REFRESH_COOKIE),
            proof: req.get('dpop'),
            method: req.method,
            path: req.originalUrl.split('?')[0],
        });
        if (!result.ok) throw new AppError('Session could not be renewed.', 401);
        setAuthCookies(req, res, result);
        return res.json({ success: true, csrfToken: result.csrfSecret });
    } catch (error) {
        return next(error);
    }
}

/**
 * POST /api/auth/logout
 * Mutating -> envelope. Self-gated (design D7): with a live access token it
 * requires the CSRF header as before; with only the refresh cookie (access
 * already expired) it revokes that family unproven - revocation can only
 * fail safe. Either way the session's whole token family is revoked.
 */
function logout(req, res, next) {
    const done = () => {
        clearAuthCookies(req, res);
        return res.json({ success: true });
    };
    try {
        const resolved = SessionService.validateSession(readToken(req));
        if (resolved) {
            req.session = resolved.session;
            return csrf(req, res, (error) => {
                if (error) return next(error);
                try {
                    SessionService.revokeSession(resolved.session.id, 'logout');
                    return done();
                } catch (err) {
                    return next(err);
                }
            });
        }
        if (!SessionService.revokeByRefreshToken(readCookie(req, REFRESH_COOKIE))) {
            throw new AppError('Authentication required.', 401);
        }
        return done();
    } catch (error) {
        return next(error);
    }
}

/**
 * GET /api/auth/me
 * Read-only -> bare shape (rule 6). Carries the session's csrfToken too, so
 * a page that reloads (losing api.js's in-memory copy) can recover it
 * without re-authenticating - the secret never leaves the session that
 * already holds it, the same session the HttpOnly cookie already proves.
 */
function me(req, res, next) {
    try {
        return res.json({
            id: req.user.id,
            username: req.user.username,
            role: req.user.role,
            status: req.user.status,
            csrfToken: req.session.csrf_secret,
            appVersion: config.appVersion,
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = { login, refresh, logout, me };
