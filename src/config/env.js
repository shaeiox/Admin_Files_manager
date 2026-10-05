// src/config/env.js
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { resolveDataDir } = require('./dataDir');

// dotenv never overrides a variable that is already set, so a value supplied by
// the process environment (e.g. a systemd EnvironmentFile) always wins over a
// .env discovered in the working directory. See .env.example.
dotenv.config();

/** Default upload ceiling: 5 GiB. Kept in step with UploadService's own default. */
const DEFAULT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024;

/** Default free-space watermark required before an upload stages bytes. */
const DEFAULT_UPLOAD_FREE_SPACE_BYTES = 100 * 1024 * 1024; // 100 MiB

/** Max distinct CORS origins accepted in the allowlist. */
const MAX_CORS_ORIGINS = 20;

const env = process.env.NODE_ENV || 'development';

function parseBool(raw, fallback) {
    if (raw === undefined || raw === null || raw.trim() === '') return fallback;
    const v = raw.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function parseCorsAllowedOrigins(raw) {
    if (raw === undefined || raw === null || raw.trim() === '') return [];
    return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

function parseUploadFreeSpaceBytes(raw) {
    if (raw === undefined || raw === null || raw.trim() === '') return DEFAULT_UPLOAD_FREE_SPACE_BYTES;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n >= 0 ? n : undefined;
}

const config = {
    port: process.env.PORT || 3000,
    env,
    storageRoot: process.env.STORAGE_ROOT,
    // Base directory of the metadata and settings stores. Outside production an
    // unset value keeps the historical <cwd>/data; in production it is required
    // (validateStartup) so the store can never follow a release's working
    // directory and silently reinitialise empty (production-cicd-readiness D1).
    dataDir: resolveDataDir(),

    // Cross-origin access policy. Same-origin by default (disabled); the
    // operator must explicitly opt in and supply a validated allowlist before
    // any Access-Control-Allow-* header is emitted.
    cors: {
        enabled: parseBool(process.env.AFM_CORS_ENABLED, false),
        allowedOrigins: parseCorsAllowedOrigins(process.env.AFM_CORS_ALLOWED_ORIGINS),
        allowWildcard: parseBool(process.env.AFM_CORS_ALLOW_WILDCARD, false),
    },

    // Free-space watermark (bytes) required in the storage root before an
    // upload may stage bytes. Default keeps a small reserve; 0 disables the
    // admission check.
    uploadFreeSpaceBytes: parseUploadFreeSpaceBytes(process.env.AFM_UPLOAD_FREE_SPACE_BYTES),
};

config.DEFAULT_UPLOAD_FREE_SPACE_BYTES = DEFAULT_UPLOAD_FREE_SPACE_BYTES;

/**
 * Startup-time configuration checks, run by server.js BEFORE it listens - the
 * server never starts without a usable STORAGE_ROOT.
 *
 * Kept out of module evaluation on purpose, including the presence check that
 * used to exit here: service-level suites load this module with roots that exist
 * only as strings (e.g. '/srv/download', 'D:\\download') or with none at all, and
 * an exit at require time made the suite pass only where a developer's .env
 * happened to supply STORAGE_ROOT (production-cicd-readiness, found by the
 * release gate). A bad value must stop the SERVER, not every importer; without a
 * root, PathService fails closed (path.resolve(undefined) throws).
 *
 * Returns a list of problems; an empty list means the configuration is usable.
 * Nothing here creates a directory - a missing root is an operator error.
 *
 * @param {NodeJS.ProcessEnv} [source]
 * @returns {string[]}
 */
function validateStartup(source = process.env) {
    const problems = [];
    const root = source.STORAGE_ROOT;

    if (!root || !root.trim()) {
        problems.push('STORAGE_ROOT is not defined.');
    } else if (!path.isAbsolute(root) || (process.platform !== 'win32' && /^[A-Za-z]:[\\/]|\\/.test(root))) {
        // On POSIX a Windows spelling ('C:/x', 'C:\\x') is relative and would
        // silently resolve under the working directory.
        problems.push(`STORAGE_ROOT must be an absolute path on ${process.platform} (got a relative or foreign-platform path).`);
    } else {
        problems.push(...directoryProblems('STORAGE_ROOT', root));
    }

    if (source.AFM_DATA_DIR !== undefined && source.AFM_DATA_DIR !== '') {
        if (!path.isAbsolute(source.AFM_DATA_DIR)) {
            problems.push('AFM_DATA_DIR must be an absolute path.');
        } else {
            problems.push(...directoryProblems('AFM_DATA_DIR', source.AFM_DATA_DIR));
        }
    } else if ((source.NODE_ENV || 'development') === 'production') {
        problems.push('AFM_DATA_DIR is required when NODE_ENV=production (no working-directory fallback for the store).');
    }

    const limit = source.UPLOAD_MAX_BYTES;
    if (limit !== undefined && limit !== '') {
        const parsed = Number(limit);
        if (!/^\d+$/.test(limit.trim()) || !Number.isSafeInteger(parsed) || parsed <= 0) {
            problems.push(`UPLOAD_MAX_BYTES must be a positive integer number of bytes (at most ${Number.MAX_SAFE_INTEGER}); default ${DEFAULT_UPLOAD_MAX_BYTES}.`);
        }
    }

    // Upload free-space watermark: a non-negative safe-integer byte count, or
    // blank (which keeps the documented default). 0 explicitly disables the
    // admission check.
    const freeSpace = source.AFM_UPLOAD_FREE_SPACE_BYTES;
    if (freeSpace !== undefined && freeSpace !== '') {
        const parsed = Number(freeSpace);
        if (!/^\d+$/.test(freeSpace.trim()) || !Number.isSafeInteger(parsed)) {
            problems.push('AFM_UPLOAD_FREE_SPACE_BYTES must be a non-negative integer number of bytes.');
        }
    }

    // CORS allowlist: absolute http(s) origins only, no path/query/fragment,
    // no scheme-relative, no duplicates, bounded count. Wildcards require an
    // explicit opt-in and are refused in production regardless, because the
    // API is (by design) the only credential-protecting boundary.
    const allowWildcard = parseBool(source.AFM_CORS_ALLOW_WILDCARD, false);
    const isProduction = (source.NODE_ENV || 'development') === 'production';
    if (allowWildcard && isProduction) {
        problems.push('AFM_CORS_ALLOW_WILDCARD is refused when NODE_ENV=production.');
    }
    const origins = parseCorsAllowedOrigins(source.AFM_CORS_ALLOWED_ORIGINS);
    if (origins.length > MAX_CORS_ORIGINS) {
        problems.push(`AFM_CORS_ALLOWED_ORIGINS supports at most ${MAX_CORS_ORIGINS} origins.`);
    }
    const seen = new Set();
    for (const origin of origins) {
        const problem = validateCorsOrigin(origin, allowWildcard, isProduction);
        if (problem) problems.push(`AFM_CORS_ALLOWED_ORIGINS: "${origin}" ${problem}`);
        try {
            const key = new URL(origin).origin.toLowerCase();
            if (seen.has(key)) problems.push(`AFM_CORS_ALLOWED_ORIGINS: duplicate origin "${origin}".`);
            seen.add(key);
        } catch { /* validateCorsOrigin already reported */ }
    }

    return problems;
}

function validateCorsOrigin(value, allowWildcard, isProduction) {
    if (typeof value !== 'string' || value !== value.trim() || value === '') return 'must be a non-empty trimmed string.';
    if (value === '*') {
        if (isProduction) return 'wildcards are refused in production.';
        if (!allowWildcard) return 'requires AFM_CORS_ALLOW_WILDCARD=true.';
        return null;
    }
    if (value.startsWith('//')) return 'scheme-relative values are not allowed.';
    let url;
    try { url = new URL(value); } catch { return 'is not a valid absolute URL.'; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'must be http or https.';
    if (url.hostname === '') return 'must include a host.';
    if (url.pathname !== '/' && url.pathname !== '') return 'must not include a path.';
    if (url.search || url.hash) return 'must not include a query string or fragment.';
    return null;
}

/** A configured directory must exist, be a directory, and be readable and traversable. */
function directoryProblems(name, dir) {
    let stat;
    try {
        stat = fs.statSync(dir);
    } catch {
        return [`${name} does not exist (${dir}). It is never created automatically.`];
    }
    if (!stat.isDirectory()) return [`${name} is not a directory (${dir}).`];
    try {
        fs.accessSync(dir, fs.constants.R_OK | fs.constants.X_OK);
    } catch {
        return [`${name} is not readable and traversable by this process (${dir}).`];
    }
    return [];
}

config.validateStartup = validateStartup;

module.exports = config;
