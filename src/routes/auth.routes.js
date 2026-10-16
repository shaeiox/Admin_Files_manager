// src/routes/auth.routes.js
'use strict';

const express = require('express');
const { createRateLimit, perMinute } = require('../middlewares/rateLimit');
const { authenticate } = require('../middlewares/authenticate');
const authController = require('../controllers/auth.controller');

/**
 * Authentication endpoints (ADR-009). Mounted in src/routes/api.js BEFORE
 * the global `authenticate`/`csrf` middleware, so each route states its own
 * requirement:
 *   - POST /login  - public (that's how a session is obtained at all),
 *     throttled by a dedicated, tight instance of the existing rate-limit
 *     factory rather than a second mechanism.
 *   - POST /refresh - self-gated by the refresh cookie + DPoP proof; it must
 *     stay here, above the blanket `authenticate`, or it is unreachable
 *     exactly when the access token has expired.
 *   - POST /logout - self-gated: access token + CSRF token, or the refresh
 *     cookie alone (see auth.controller.logout).
 *   - GET  /me     - requires a session; no CSRF needed (GET is safe).
 *
 * AFM_LOGIN_RATE_LIMIT_PER_MINUTE overrides the login budget, the same
 * override pattern AFM_RATE_LIMIT_WRITE_PER_MINUTE already uses - a suite
 * that logs in many times per test file raises this instead of fighting
 * the production default.
 *
 * AFM_REFRESH_RATE_LIMIT_PER_MINUTE (default 30, 0 disables) throttles
 * /refresh the same way: it is reachable with no credential and each call
 * costs a DB lookup plus an ECDSA verify. A real client refreshes about once
 * per access lifetime, so the default never touches an ordinary session.
 */
const router = express.Router();

const LOGIN_PER_MINUTE = perMinute(process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE, 10);
const loginThrottle = createRateLimit({ writePerMinute: LOGIN_PER_MINUTE, readPerMinute: 0 });

const REFRESH_PER_MINUTE = perMinute(process.env.AFM_REFRESH_RATE_LIMIT_PER_MINUTE, 30);
const refreshThrottle = createRateLimit({ writePerMinute: REFRESH_PER_MINUTE, readPerMinute: 0 });

router.post('/login', loginThrottle, authController.login);
router.post('/refresh', refreshThrottle, authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

module.exports = router;
