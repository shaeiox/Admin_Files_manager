// src/middlewares/serviceToken.js
'use strict';

const crypto = require('crypto');
const { parseServiceTokens } = require('../config/env');

/**
 * Guards the File Portal integration routes (isolate-app-roots D5).
 *
 * The caller is a service, not a person: it proves itself with
 * `Authorization: Bearer <token>` matching one entry of AFM_PORTAL_SERVICE_TOKEN,
 * compared in constant time. No session, no CSRF (there is no browser).
 *
 * Unset token: the routes do not exist (404, the same body as any unknown API
 * route), so a standalone admin exposes nothing. Read per request, like the
 * other env-driven guards' tests expect, so a suite can switch it.
 *
 * Failed attempts are counted per client IP; past FAILURES_PER_MINUTE the IP
 * gets 429 even with a right token, so the token cannot be guessed online.
 */

const WINDOW_MS = 60 * 1000;
const FAILURES_PER_MINUTE = 10;

/** sha256 both sides so timingSafeEqual sees equal lengths and leaks no length. */
function matches(presented, tokens) {
    const digest = (v) => crypto.createHash('sha256').update(v).digest();
    const got = digest(presented);
    let ok = false;
    for (const token of tokens) ok = crypto.timingSafeEqual(got, digest(token)) || ok;
    return ok;
}

function createServiceTokenGate() {
    const failures = new Map(); // ip -> { count, resetAt }

    return function serviceToken(req, res, next) {
        const tokens = parseServiceTokens(process.env.AFM_PORTAL_SERVICE_TOKEN);
        if (!tokens.length) return res.status(404).json({ success: false, error: 'API endpoint not found' });

        const now = Date.now();
        const key = req.ip || 'unknown';
        let bucket = failures.get(key);
        if (bucket && bucket.resetAt <= now) { failures.delete(key); bucket = undefined; }
        if (bucket && bucket.count >= FAILURES_PER_MINUTE) {
            res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
            return res.status(429).json({ success: false, error: 'Too many requests. Try again shortly.' });
        }

        const header = String(req.get('authorization') || '');
        const presented = /^Bearer /i.test(header) ? header.slice(7).trim() : '';
        if (presented && matches(presented, tokens)) return next();

        if (!bucket) { bucket = { count: 0, resetAt: now + WINDOW_MS }; failures.set(key, bucket); }
        bucket.count += 1;
        if (failures.size > 10000) failures.clear(); // bounded; a flood only resets counters
        console.warn(`[integration] rejected service token from ${key}`);
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    };
}

module.exports = { createServiceTokenGate, FAILURES_PER_MINUTE };
