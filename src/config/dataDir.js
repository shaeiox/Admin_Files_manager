// src/config/dataDir.js
'use strict';

const path = require('path');

/**
 * Base directory of the metadata and settings stores.
 *
 * AFM_DATA_DIR when set; otherwise the historical `<cwd>/data`. Side-effect free
 * (unlike config/env, which exits without STORAGE_ROOT) so the store singletons
 * can resolve their path without dragging the whole configuration in. In
 * production an unset AFM_DATA_DIR is refused by env.validateStartup, so the
 * fallback only ever applies to development and the test suites.
 *
 * @param {NodeJS.ProcessEnv} [source]
 * @returns {string}
 */
function resolveDataDir(source = process.env) {
    return source.AFM_DATA_DIR
        ? path.resolve(source.AFM_DATA_DIR)
        : path.join(process.cwd(), 'data');
}

module.exports = { resolveDataDir };
