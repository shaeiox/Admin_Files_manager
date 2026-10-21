// src/config/env.js
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { resolveDataDir } = require('./dataDir');

// dotenv never overrides a variable that is already set, so a value supplied by
// the process environment (e.g. a systemd EnvironmentFile) always wins over a
// .env discovered in the working directory. See .env.example.
// Under `node --test` (NODE_TEST_CONTEXT) a developer's .env is NOT read: the
// suites set every value they need, and a local NODE_ENV=production or data
// folder must not decide whether they pass (isolate-app-roots: hermetic tests).
if (!process.env.NODE_TEST_CONTEXT) dotenv.config();

/** Default upload ceiling: 5 GiB. Kept in step with UploadService's own default. */
const DEFAULT_UPLOAD_MAX_BYTES = 5 * 1024 * 1024 * 1024;

/** Default free-space watermark required before an upload stages bytes. */
const DEFAULT_UPLOAD_FREE_SPACE_BYTES = 100 * 1024 * 1024; // 100 MiB

/** Max distinct CORS origins accepted in the allowlist. */
const MAX_CORS_ORIGINS = 20;

/**
 * Session token lifetimes (access-refresh-session-tokens D9), in seconds:
 * [default, max]. A value outside 1..max is refused by validateStartup(),
 * never clamped. The grace window is how long a just-rotated refresh token is
 * still accepted as a retry (design D3); it is only safe because DPoP is
 * mandatory at refresh.
 */
const TOKEN_LIFETIMES = {
    AFM_ACCESS_TTL_SECONDS: [900, 3600],
    AFM_REFRESH_TTL_SECONDS: [2592000, 31536000],
    AFM_REFRESH_GRACE_SECONDS: [10, 60],
};

/** Hard absolute session cap: one year from login, never extended by rotation. */
const SESSION_ABSOLUTE_TTL_SECONDS = 31536000;

const env = process.env.NODE_ENV || 'development';

/** This application's own code folder (the release directory). Never state, never storage. */
const CODE_DIR = path.resolve(__dirname, '..', '..');

function parseLifetime(name, source = process.env) {
    const raw = source[name];
    if (raw === undefined || raw === null || raw.trim() === '') return TOKEN_LIFETIMES[name][0];
    const n = Number(raw);
    return /^\d+$/.test(raw.trim()) && n >= 1 && n <= TOKEN_LIFETIMES[name][1] ? n : undefined;
}

function parseBool(raw, fallback) {
    if (raw === undefined || raw === null || raw.trim() === '') return fallback;
    const v = raw.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function parseCorsAllowedOrigins(raw) {
    if (raw === undefined || raw === null || raw.trim() === '') return [];
    return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Minimum length of each AFM_PORTAL_SERVICE_TOKEN entry (isolate-app-roots D5). */
const MIN_SERVICE_TOKEN_LENGTH = 32;

/** Comma-separated service tokens; two entries allow rotation without downtime. Never trimmed inside. */
function parseServiceTokens(raw) {
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
    // Shown as the sidebar version label. APP_VERSION when set, else package.json.
    appVersion: (process.env.APP_VERSION || '').trim() || require('../../package.json').version,
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

    // File Portal integration contract (isolate-app-roots). No tokens: the
    // integration routes do not exist. No URL: the portal log falls back to
    // PORTAL_LOG_FILE and "Check access" is unavailable.
    portalIntegration: {
        serviceTokens: parseServiceTokens(process.env.AFM_PORTAL_SERVICE_TOKEN),
        portalUrl: (process.env.AFM_PORTAL_URL || '').trim().replace(/\/+$/, ''),
    },

    // Session token lifetimes in seconds. An out-of-range value reads as
    // undefined here and is refused by validateStartup() before listen.
    sessionTokens: {
        accessTtlSeconds: parseLifetime('AFM_ACCESS_TTL_SECONDS'),
        refreshTtlSeconds: parseLifetime('AFM_REFRESH_TTL_SECONDS'),
        refreshGraceSeconds: parseLifetime('AFM_REFRESH_GRACE_SECONDS'),
        absoluteTtlSeconds: SESSION_ABSOLUTE_TTL_SECONDS,
    },
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

    // Root isolation (isolate-app-roots): refused in production; server.js
    // reports the same findings as warnings everywhere else.
    if ((source.NODE_ENV || 'development') === 'production') problems.push(...isolationProblems(source));

    const limit = source.UPLOAD_MAX_BYTES;
    if (limit !== undefined && limit !== '') {
        const parsed = Number(limit);
        if (!/^\d+$/.test(limit.trim()) || !Number.isSafeInteger(parsed) || parsed <= 0) {
            problems.push(`UPLOAD_MAX_BYTES must be a positive integer number of bytes (at most ${Number.MAX_SAFE_INTEGER}); default ${DEFAULT_UPLOAD_MAX_BYTES}.`);
        }
    }

    for (const name of Object.keys(TOKEN_LIFETIMES)) {
        if (parseLifetime(name, source) === undefined) {
            const [fallback, max] = TOKEN_LIFETIMES[name];
            problems.push(`${name} must be an integer number of seconds from 1 to ${max}; default ${fallback}.`);
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

    // Portal integration: tokens long enough to resist guessing, never quoted;
    // the portal URL an origin only, so no path can be smuggled into requests.
    const serviceTokens = parseServiceTokens(source.AFM_PORTAL_SERVICE_TOKEN);
    if (serviceTokens.some((t) => t.length < MIN_SERVICE_TOKEN_LENGTH)) {
        problems.push(`AFM_PORTAL_SERVICE_TOKEN: every token must be at least ${MIN_SERVICE_TOKEN_LENGTH} characters.`);
    }
    const portalUrl = (source.AFM_PORTAL_URL || '').trim();
    if (portalUrl) {
        const problem = validateCorsOrigin(portalUrl.replace(/\/+$/, ''), false, false);
        if (problem) problems.push(`AFM_PORTAL_URL ${problem}`);
        else if (new URL(portalUrl).protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(portalUrl).hostname)) {
            // The service token would cross the network in clear text.
            problems.push('AFM_PORTAL_URL must use https unless the portal is on this host (127.0.0.1, ::1, localhost).');
        } else if (!serviceTokens.length) problems.push('AFM_PORTAL_URL requires AFM_PORTAL_SERVICE_TOKEN (the portal checks the same token).');
    }

    // Bootstrap-admin credentials (ADR-009): both or neither, never a
    // hardcoded default. A short password here would create an account
    // UserService itself would refuse to create through its own API.
    const bootstrapUsername = source.AFM_BOOTSTRAP_ADMIN_USERNAME;
    const bootstrapPassword = source.AFM_BOOTSTRAP_ADMIN_PASSWORD;
    if (Boolean(bootstrapUsername) !== Boolean(bootstrapPassword)) {
        problems.push('AFM_BOOTSTRAP_ADMIN_USERNAME and AFM_BOOTSTRAP_ADMIN_PASSWORD must be set together.');
    }
    if (bootstrapPassword && bootstrapPassword.length < 8) {
        problems.push('AFM_BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.');
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

/** realpath when the path exists, so a symlink cannot hide an overlap; else the resolved spelling. */
function realOrResolved(p) {
    try { return fs.realpathSync.native(p); } catch { return path.resolve(p); }
}

/** True when `child` is `parent` or inside it (case-folded on win32). */
function isWithin(parent, child) {
    const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
    const rel = path.relative(fold(parent), fold(child));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * The code folder holds no state, and the storage overlaps neither the code nor
 * the state (isolate-app-roots D2). Otherwise the file manager lists, serves and
 * can delete the application and its own database. Only absolute values are
 * judged; a relative one is already reported by validateStartup.
 *
 * @param {NodeJS.ProcessEnv} [source]
 * @param {string} [codeDir]
 * @returns {string[]}
 */
function isolationProblems(source = process.env, codeDir = CODE_DIR) {
    const problems = [];
    const code = realOrResolved(codeDir);
    const absolute = (v) => (v && path.isAbsolute(v) ? realOrResolved(v) : null);
    const data = absolute(source.AFM_DATA_DIR);
    if (data && isWithin(code, data)) {
        problems.push(`AFM_DATA_DIR (${data}) is inside the application folder (${code}); keep state outside the release.`);
    }
    const root = absolute(source.STORAGE_ROOT);
    if (root) {
        for (const [name, dir] of [['the application folder', code], ['AFM_DATA_DIR', data]]) {
            if (dir && (isWithin(root, dir) || isWithin(dir, root))) {
                problems.push(`STORAGE_ROOT (${root}) overlaps ${name} (${dir}); the file manager would expose it. Use a dedicated storage folder.`);
            }
        }
    }
    return problems;
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

/**
 * Interface the server binds. Production defaults to loopback: nginx is the only
 * intended client (it proxies to 127.0.0.1), and an all-interfaces bind exposed
 * port 3000 around nginx's TLS and basic-auth gate - where `trust proxy` also let
 * a direct caller forge X-Forwarded-For. HOST overrides; undefined = all interfaces.
 */
function listenHost(source = process.env) {
    if (source.HOST) return source.HOST;
    return (source.NODE_ENV || 'development') === 'production' ? '127.0.0.1' : undefined;
}

config.validateStartup = validateStartup;
config.isolationProblems = isolationProblems;
config.parseServiceTokens = parseServiceTokens;
config.CODE_DIR = CODE_DIR;
config.listenHost = listenHost;

module.exports = config;
