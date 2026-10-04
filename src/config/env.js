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

const env = process.env.NODE_ENV || 'development';

const config = {
    port: process.env.PORT || 3000,
    env,
    storageRoot: process.env.STORAGE_ROOT,
    // Base directory of the metadata and settings stores. Outside production an
    // unset value keeps the historical <cwd>/data; in production it is required
    // (validateStartup) so the store can never follow a release's working
    // directory and silently reinitialise empty (production-cicd-readiness D1).
    dataDir: resolveDataDir(),
};

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

config.validateStartup = validateStartup;

module.exports = config;
