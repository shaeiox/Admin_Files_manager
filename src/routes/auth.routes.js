// src/routes/auth.routes.js
'use strict';

const express = require('express');
const { createRateLimit } = require('../middlewares/rateLimit');
const { authenticate } = require('../middlewares/authenticate');
const csrf = require('../middlewares/csrf');
const authController = require('../controllers/auth.controller');

/**
 * Authentication endpoints (ADR-009). Mounted in src/routes/api.js BEFORE
 * the global `authenticate`/`csrf` middleware, so each route states its own
 * requirement:
 *   - POST /login  - public (that's how a session is obtained at all),
 *     throttled by a dedicated, tight instance of the existing rate-limit
 *     factory rather than a second mechanism.
 *   - POST /logout - requires a session AND a CSRF token (it mutates).
 *   - GET  /me     - requires a session; no CSRF needed (GET is safe).
 *
 * AFM_LOGIN_RATE_LIMIT_PER_MINUTE overrides the login budget, the same
 * override pattern AFM_RATE_LIMIT_WRITE_PER_MINUTE already uses - a suite
 * that logs in many times per test file raises this instead of fighting
 * the production default.
 */
const router = express.Router();

function loginPerMinute(raw, fallback) {
    if (raw === undefined || raw === null || raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}

const LOGIN_PER_MINUTE = loginPerMinute(process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE, 10);
const loginThrottle = createRateLimit({ writePerMinute: LOGIN_PER_MINUTE, readPerMinute: 0 });

router.post('/login', loginThrottle, authController.login);
router.post('/logout', authenticate, csrf, authController.logout);
router.get('/me', authenticate, authController.me);

module.exports = router;
