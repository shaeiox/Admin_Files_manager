// src/middlewares/rateLimit.js
'use strict';

/**
 * Fixed-window per-client rate limiting for the API surface.
 *
 * WHY NOT A DEPENDENCY. `test/integration/repo-guardrails.test.js` pins the
 * runtime manifest to exactly seven packages, and no installed package does
 * rate limiting. A fixed-window counter is a few lines, so a new runtime
 * dependency would cost more than it saves. This follows the same pattern as
 * UploadService, which reads its own limit from the environment at module load.
 *
 * THE KEY IS req.ip, which is only the real client address because server.js
 * sets `trust proxy` to the single documented nginx hop (task 1.3). Behind no
 * proxy it is the socket address, which is correct for a single-operator host.
 *
 * WRITE AND READ KEEP SEPARATE BUCKETS, not just separate numbers: a burst of
 * reads must not consume the mutation allowance, and vice versa. That is the
 * contract in the api-security spec ("read routes SHALL remain available within
 * their own, separate allowance").
 *
 * ponytail: a fixed window lets a client send 2x the allowance across a window
 * boundary. Fine for abuse control on an admin tool; a sliding window or token
 * bucket is the upgrade if a limit ever has to be financially exact.
 */

const AppError = require('../utils/AppError');

/** Counting window. One minute, matching the *_PER_MINUTE variable names. */
const WINDOW_MS = 60 * 1000;

/** Mutations: the tighter budget, since every one is an unauthenticated write. */
const DEFAULT_WRITE_PER_MINUTE = 60;

/** Reads: much looser, so a browsing session and the dashboard polling never notice. */
const DEFAULT_READ_PER_MINUTE = 600;

/** 0 disables the limiter; any other invalid value falls back to the default. */
function perMinute(raw, fallback) {
    if (raw === undefined || raw === null || raw.trim() === '') return fallback;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 0 ? n : fallback;
}

const WRITE_PER_MINUTE = perMinute(process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE, DEFAULT_WRITE_PER_MINUTE);
const READ_PER_MINUTE = perMinute(process.env.AFM_RATE_LIMIT_READ_PER_MINUTE, DEFAULT_READ_PER_MINUTE);

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Build the limiter. Exported as a factory so the test can construct one with
 * known, tiny budgets instead of mutating module-level state.
 *
 * @param {{writePerMinute?: number, readPerMinute?: number}} [options]
 * @returns {import('express').RequestHandler}
 */
function createRateLimit(options = {}) {
    const writeMax = options.writePerMinute ?? WRITE_PER_MINUTE;
    const readMax = options.readPerMinute ?? READ_PER_MINUTE;

    // `class:ip` -> { count, resetAt }. Swept lazily so the map cannot grow
    // without bound on a long-lived process.
    const buckets = new Map();
    let lastSweep = Date.now();

    function sweep(now) {
        if (now - lastSweep < WINDOW_MS) return;
        for (const [key, bucket] of buckets) {
            if (bucket.resetAt <= now) buckets.delete(key);
        }
        lastSweep = now;
    }

    return function rateLimit(req, res, next) {
        const isWrite = WRITE_METHODS.has(req.method);
        const max = isWrite ? writeMax : readMax;
        // An explicit 0 opts out of limiting that class.
        if (max === 0) return next();

        const now = Date.now();
        sweep(now);

        const key = `${isWrite ? 'write' : 'read'}:${req.ip || 'unknown'}`;
        let bucket = buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + WINDOW_MS };
            buckets.set(key, bucket);
        }
        bucket.count += 1;

        if (bucket.count > max) {
            const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
            res.setHeader('Retry-After', String(retryAfter));
            return next(new AppError('Too many requests. Try again shortly.', 429));
        }
        return next();
    };
}

module.exports = {
    createRateLimit,
    WINDOW_MS,
    DEFAULT_WRITE_PER_MINUTE,
    DEFAULT_READ_PER_MINUTE,
};