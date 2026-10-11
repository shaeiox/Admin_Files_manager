// src/controllers/auth.controller.js
'use strict';

const AppError = require('../utils/AppError');
const SessionService = require('../services/SessionService');
const config = require('../config/env');
const { SESSION_COOKIE } = require('../middlewares/authenticate');

const SESSION_TTL_SECONDS = 24 * 60 * 60;

function setSessionCookie(res, token) {
    const parts = [
        `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${SESSION_TTL_SECONDS}`,
    ];
    if (config.env === 'production') parts.push('Secure');
    res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/**
 * POST /api/auth/login
 * Mutating -> envelope response (rule 6). The identical response for "no
 * such account" and "wrong password" is enforced here: both reach
 * `result.ok === false` and raise the same AppError.
 */
function login(req, res, next) {
    try {
        const { username, password } = req.body || {};
        const result = SessionService.login({
            username,
            password,
            ip: req.ip,
            userAgent: req.get('user-agent') || null,
        });
        if (!result.ok) throw new AppError('Invalid username or password.', 401);

        setSessionCookie(res, result.token);
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
 * POST /api/auth/logout
 * Mutating -> envelope response. Requires `authenticate`+`csrf` to have run.
 */
function logout(req, res, next) {
    try {
        SessionService.revokeSession(req.session.id);
        clearSessionCookie(res);
        return res.json({ success: true });
    } catch (error) {
        return next(error);
    }
}

/**
 * GET /api/auth/me
 * Read-only -> bare shape (rule 6).
 */
function me(req, res, next) {
    try {
        return res.json({ id: req.user.id, username: req.user.username, role: req.user.role, status: req.user.status });
    } catch (error) {
        return next(error);
    }
}

module.exports = { login, logout, me };
