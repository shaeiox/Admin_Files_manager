// src/db/bootstrap.js
'use strict';

const UserRepository = require('./repositories/UserRepository');
const { hashPassword } = require('../utils/crypto');

/**
 * Creates the first admin account from operator-supplied configuration
 * (ADR-009 design D7) when no account exists yet. Never a hardcoded
 * default, never printed to stdout. Idempotent: a later boot with an
 * account already present is a no-op.
 *
 * @param {NodeJS.ProcessEnv} [source]
 */
function ensureBootstrapAdmin(source = process.env) {
    if (UserRepository.count() > 0) return;

    const username = source.AFM_BOOTSTRAP_ADMIN_USERNAME;
    const password = source.AFM_BOOTSTRAP_ADMIN_PASSWORD;
    if (!username || !password) {
        console.warn(
            '[bootstrap] No admin account exists and AFM_BOOTSTRAP_ADMIN_USERNAME/' +
            'AFM_BOOTSTRAP_ADMIN_PASSWORD are not set; the admin panel is unreachable until one is created.'
        );
        return;
    }

    UserRepository.create({
        username,
        email: null,
        passwordHash: hashPassword(password),
        role: 'admin',
    });
    console.log(`[bootstrap] Created initial admin account "${username}".`);
}

module.exports = { ensureBootstrapAdmin };
