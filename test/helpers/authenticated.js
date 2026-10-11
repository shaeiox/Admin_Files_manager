// test/helpers/authenticated.js
'use strict';

const http = require('node:http');

/**
 * Bootstrap-admin credentials every server-booting suite uses (ADR-009).
 * A suite must set these as AFM_BOOTSTRAP_ADMIN_USERNAME/PASSWORD env vars
 * BEFORE requiring server.js (applyBootstrapEnv does this), the same way it
 * already redirects MetadataService.dbPath before that require.
 */
const BOOTSTRAP_USERNAME = 'test-admin';
const BOOTSTRAP_PASSWORD = 'test-admin-password-0000';

function applyBootstrapEnv() {
    process.env.AFM_BOOTSTRAP_ADMIN_USERNAME = BOOTSTRAP_USERNAME;
    process.env.AFM_BOOTSTRAP_ADMIN_PASSWORD = BOOTSTRAP_PASSWORD;
}

/**
 * Points the admin database singleton at a temp file and drops any cached
 * connection, mirroring `MetadataService.dbPath = ...; MetadataService.cache
 * = null;`. Call BEFORE requiring server.js.
 *
 * @param {string} dbPath
 */
function redirectAdminDb(dbPath) {
    const AdminDatabase = require('../../src/db/connection');
    AdminDatabase.dbPath = dbPath;
    AdminDatabase.reset();
}

/**
 * Logs in as the bootstrap admin against a running server and returns
 * headers to merge into every subsequent request: the session `Cookie` and
 * the `X-CSRF-Token` required on every non-GET request. Safe to include on
 * GET requests too (csrf.js ignores it there).
 *
 * @param {number} port
 * @returns {Promise<{headers: {Cookie: string, 'X-CSRF-Token': string}, userId: number}>}
 */
function login(port) {
    const body = JSON.stringify({ username: BOOTSTRAP_USERNAME, password: BOOTSTRAP_PASSWORD });
    return new Promise((resolve, reject) => {
        const req = http.request(
            {
                host: '127.0.0.1',
                port,
                path: '/api/v1/auth/login',
                method: 'POST',
                agent: false,
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    if (res.statusCode !== 200) {
                        reject(new Error(`authenticated helper: login failed with status ${res.statusCode}: ${raw}`));
                        return;
                    }
                    let json;
                    try {
                        json = JSON.parse(raw);
                    } catch (error) {
                        reject(new Error(`authenticated helper: login response was not JSON: ${raw}`));
                        return;
                    }
                    const setCookie = res.headers['set-cookie'] || [];
                    const sessionCookie = setCookie.map((c) => c.split(';')[0]).find((c) => c.startsWith('afm_session='));
                    if (!sessionCookie) {
                        reject(new Error('authenticated helper: no session cookie in login response'));
                        return;
                    }
                    resolve({
                        headers: { Cookie: sessionCookie, 'X-CSRF-Token': json.csrfToken },
                        userId: json.user.id,
                    });
                });
            }
        );
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

module.exports = { BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD, applyBootstrapEnv, redirectAdminDb, login };
