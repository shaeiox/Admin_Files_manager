// test/api/auth.contract.test.js
'use strict';

/**
 * Authentication API contract, exercised against a LIVE server (ADR-009).
 *
 * Isolation: one temporary STORAGE_ROOT and one temporary admin database for
 * the whole file, both chosen before server.js is required - the same
 * pattern every other live-server suite in this repo already follows for
 * MetadataService.dbPath.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-auth-'));
const ROOT = path.join(TMP, 'root');
fs.mkdirSync(ROOT, { recursive: true });

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
// This file logs in many times across many tests against one server
// instance; raise the login throttle well past the production default
// (AFM_LOGIN_RATE_LIMIT_PER_MINUTE, mirroring AFM_RATE_LIMIT_WRITE_PER_MINUTE's
// existing override pattern in rate-limit.test.js) so the suite tests login
// behavior itself, not the throttle.
process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE = '1000';

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

const { applyBootstrapEnv, redirectAdminDb, BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD, login: authLogin } = require('../helpers/authenticated');
applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;

function send(method, pathname, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...headers };
        if (body !== undefined) finalHeaders['Content-Length'] = Buffer.byteLength(body);
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, agent: false, headers: finalHeaders },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    let json = null;
                    try { json = JSON.parse(buffer.toString('utf8')); } catch { /* non-JSON */ }
                    resolve({ status: res.statusCode, headers: res.headers, json });
                });
            }
        );
        req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

function sendJson(method, pathname, payload, headers = {}) {
    return send(method, pathname, {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json', ...headers },
    });
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => {
        if (server.listening) return resolve();
        server.once('listening', resolve);
    });
    port = server.address().port;
});

after(async () => {
    if (server) {
        if (server.closeAllConnections) server.closeAllConnections();
        await new Promise((r) => server.close(r));
        server = null;
    }
    // The admin database holds the sqlite file (and its WAL/SHM sidecars)
    // open for the process lifetime; closing it first is required on
    // Windows, which refuses to remove a directory containing an open handle.
    require('../../src/db/connection').reset();
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('GET /api/v1/health stays public', () => {
    test('answers with no session', async () => {
        const res = await send('GET', '/api/v1/health');
        assert.equal(res.status, 200);
        assert.equal(res.json.success, true);
    });
});

describe('Every other route requires a session', () => {
    test('GET /api/v1/fs/list is 401 with no credential', async () => {
        const res = await send('GET', '/api/v1/fs/list?path=/');
        assert.equal(res.status, 401);
        assert.equal(res.json.success, false);
    });

    test('GET /api/v1/dashboard/summary is 401 with no credential', async () => {
        const res = await send('GET', '/api/v1/dashboard/summary');
        assert.equal(res.status, 401);
    });
});

describe('POST /api/v1/auth/login', () => {
    test('rejects a wrong password and a nonexistent username identically', async () => {
        const wrong = await sendJson('POST', '/api/v1/auth/login', { username: BOOTSTRAP_USERNAME, password: 'not-it' });
        const noUser = await sendJson('POST', '/api/v1/auth/login', { username: 'nobody', password: 'not-it' });
        assert.equal(wrong.status, 401);
        assert.equal(noUser.status, 401);
        assert.deepEqual(wrong.json, noUser.json);
    });

    test('succeeds with the bootstrap admin credentials and sets a cookie', async () => {
        const res = await sendJson('POST', '/api/v1/auth/login', { username: BOOTSTRAP_USERNAME, password: BOOTSTRAP_PASSWORD });
        assert.equal(res.status, 200);
        assert.equal(res.json.success, true);
        assert.equal(res.json.user.username, BOOTSTRAP_USERNAME);
        assert.equal(res.json.user.role, 'admin');
        assert.equal(typeof res.json.csrfToken, 'string');
        const setCookie = (res.headers['set-cookie'] || []).join(';');
        assert.match(setCookie, /afm_session=/);
        assert.match(setCookie, /HttpOnly/);
        assert.match(setCookie, /SameSite=Lax/);
    });

    test('the cookie is Secure exactly when the request arrived over https (X-Forwarded-Proto from nginx)', async () => {
        // Secure used to follow NODE_ENV, which the systemd unit pins to
        // production: behind the plain-HTTP nginx config the browser dropped the
        // cookie and login looped.
        const creds = { username: BOOTSTRAP_USERNAME, password: BOOTSTRAP_PASSWORD };
        const https = await sendJson('POST', '/api/v1/auth/login', creds, { 'X-Forwarded-Proto': 'https' });
        const http = await sendJson('POST', '/api/v1/auth/login', creds, { 'X-Forwarded-Proto': 'http' });
        assert.match((https.headers['set-cookie'] || []).join(';'), /;\s*Secure/);
        assert.doesNotMatch((http.headers['set-cookie'] || []).join(';'), /Secure/);
    });

    test('the session cookie authenticates a subsequent request', async () => {
        const auth = await authLogin(port);
        const res = await send('GET', '/api/v1/fs/list?path=/', { headers: { Cookie: auth.headers.Cookie } });
        assert.equal(res.status, 200);
    });

    test('the same token also works as a Bearer credential with no cookie', async () => {
        const auth = await authLogin(port);
        const token = auth.headers.Cookie.split('=')[1];
        const res = await send('GET', '/api/v1/fs/list?path=/', { headers: { Authorization: `Bearer ${token}` } });
        assert.equal(res.status, 200);
    });
});

describe('CSRF defense', () => {
    test('a mutating request with no CSRF header is refused', async () => {
        const auth = await authLogin(port);
        const res = await sendJson('POST', '/api/v1/fs/folder', { path: '/no-csrf-folder' }, { Cookie: auth.headers.Cookie });
        assert.equal(res.status, 403);
    });

    test('a mutating request with the correct CSRF header succeeds', async () => {
        const auth = await authLogin(port);
        const res = await sendJson('POST', '/api/v1/fs/folder', { path: '/with-csrf-folder' }, auth.headers);
        assert.equal(res.status, 201);
    });

    test('a GET request needs no CSRF header', async () => {
        const auth = await authLogin(port);
        const res = await send('GET', '/api/v1/fs/list?path=/', { headers: { Cookie: auth.headers.Cookie } });
        assert.equal(res.status, 200);
    });
});

describe('GET /api/v1/auth/me', () => {
    test('reports the authenticated principal as a bare shape (rule 6)', async () => {
        const auth = await authLogin(port);
        const res = await send('GET', '/api/v1/auth/me', { headers: auth.headers });
        assert.equal(res.status, 200);
        assert.equal(res.json.username, BOOTSTRAP_USERNAME);
        assert.equal(res.json.role, 'admin');
        assert.equal(res.json.success, undefined); // bare, not enveloped
    });

    test('401 with no session', async () => {
        const res = await send('GET', '/api/v1/auth/me');
        assert.equal(res.status, 401);
    });
});

describe('POST /api/v1/auth/logout', () => {
    test('revokes the session; it cannot be used again', async () => {
        const auth = await authLogin(port);
        const logoutRes = await send('POST', '/api/v1/auth/logout', { headers: auth.headers });
        assert.equal(logoutRes.status, 200);
        assert.equal(logoutRes.json.success, true);

        const after = await send('GET', '/api/v1/fs/list?path=/', { headers: { Cookie: auth.headers.Cookie } });
        assert.equal(after.status, 401);
    });

    test('requires a CSRF header (it mutates)', async () => {
        const auth = await authLogin(port);
        const res = await send('POST', '/api/v1/auth/logout', { headers: { Cookie: auth.headers.Cookie } });
        assert.equal(res.status, 403);
    });
});

describe('Both /api/v1 and /api secure identically (ADR-007 parity)', () => {
    test('the legacy alias requires a session too', async () => {
        const res = await send('GET', '/api/fs/list?path=/');
        assert.equal(res.status, 401);
    });

    test('the legacy alias accepts the same session', async () => {
        const auth = await authLogin(port);
        const res = await send('GET', '/api/fs/list?path=/', { headers: { Cookie: auth.headers.Cookie } });
        assert.equal(res.status, 200);
    });
});
