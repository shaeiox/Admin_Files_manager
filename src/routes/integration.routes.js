// src/routes/integration.routes.js
'use strict';

const express = require('express');
const { perMinute } = require('../middlewares/rateLimit');
const { createServiceTokenGate } = require('../middlewares/serviceToken');
const integrationController = require('../controllers/integration.controller');

/**
 * File Portal integration contract v1 (isolate-app-roots, ADR-011). Mounted in
 * src/routes/api.js BEFORE `authenticate`/`csrf`: the caller is the portal
 * service, proven by its token, never a browser session.
 *
 *   GET  /snapshot             - users, policies, grants, nav, settings (ETag / 304)
 *   POST /credentials/verify   - a portal sign-in checked against this app's users
 *
 * Sign-in attempts are throttled per END USER address, not per portal: every
 * portal request comes from the portal's own IP, so keying on req.ip would let
 * one user's typos lock every other portal user out. The portal is
 * authenticated, so its `X-Portal-Client-IP` is trusted; it applies its own
 * trusted-proxy rules before sending it.
 */
const router = express.Router();

router.use(createServiceTokenGate());

const VERIFY_PER_MINUTE = perMinute(process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE, 10);
const verifyBuckets = new Map();

function verifyThrottle(req, res, next) {
    if (VERIFY_PER_MINUTE === 0) return next();
    const now = Date.now();
    const key = String(req.get('x-portal-client-ip') || req.ip || 'unknown').slice(0, 64);
    let bucket = verifyBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
        if (verifyBuckets.size > 10000) verifyBuckets.clear();
        bucket = { count: 0, resetAt: now + 60 * 1000 };
        verifyBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > VERIFY_PER_MINUTE) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
        return res.status(429).json({ success: false, error: 'Too many requests. Try again shortly.' });
    }
    return next();
}

router.get('/snapshot', integrationController.snapshot);
router.post('/credentials/verify', verifyThrottle, integrationController.verifyCredentials);

module.exports = router;
