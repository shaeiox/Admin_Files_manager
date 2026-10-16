// test/api/auth-refresh.contract.test.js
'use strict';

/**
 * Access/refresh cookie contract and POST /auth/refresh against a LIVE
 * server (access-refresh-session-tokens, task group 5). Same isolation
 * pattern as auth.contract.test.js: temp STORAGE_ROOT, metadata and admin
 * database chosen before server.js is required.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-auth-refresh-'));
const ROOT = path.join(TMP, 'root');
fs.mkdirSync(ROOT, { recursive: true });

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE = '1000';
// Small refresh budget so the throttle test below can exceed it. The tests
// before it make 11 refresh calls in total, all inside this budget.
process.env.AFM_REFRESH_RATE_LIMIT_PER_MINUTE = '15';

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

const { applyBootstrapEnv, redirectAdminDb, BOOTSTRAP_USERNAME, BOOTSTRAP_PASSWORD } = require('../helpers/authenticated');
const { deviceKey } = require('../helpers/dpop');
applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;

function send(method, pathname, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...headers };
        if (body !== undefined) {
            finalHeaders['Content-Type'] = 'application/json';
            finalHeaders['Content-Length'] = Buffer.byteLength(body);
        }
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, agent: false, headers: finalHeaders },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    let json = null;
                    try { json = JSON.parse(raw); } catch { /* non-JSON */ }
                    resolve({ status: res.statusCode, headers: res.headers, json, raw });
                });
            }
        );
        req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

/** Set-Cookie headers of a response for one cookie name. */
const setCookies = (res, name) => (res.headers['set-cookie'] || []).filter((c) => c.startsWith(`${name}=`));
const value = (cookie) => cookie.split(';')[0].slice(cookie.indexOf('=') + 1);

async function signIn(key = deviceKey()) {
    const res = await send('POST', '/api/v1/auth/login', {
        body: JSON.stringify({ username: BOOTSTRAP_USERNAME, password: BOOTSTRAP_PASSWORD, dpopJwk: key.jwk }),
    });
    assert.equal(res.status, 200, res.raw);
    return {
        res,
        key,
        access: value(setCookies(res, 'afm_access')[0]),
        refresh: value(setCookies(res, 'afm_refresh')[0]),
        csrf: res.json.csrfToken,
    };
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
});

after(async () => {
    if (server) {
        if (server.closeAllConnections) server.closeAllConnections();
        await new Promise((r) => server.close(r));
        server = null;
    }
    require('../../src/db/connection').reset();
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('login cookies', () => {
    test('afm_access is Path=/, HttpOnly, SameSite=Lax, Max-Age=900', async () => {
        const { res } = await signIn();
        const access = setCookies(res, 'afm_access');
        assert.equal(access.length, 1);
        assert.match(access[0], /; Path=\/;/);
        assert.match(access[0], /; HttpOnly/);
        assert.match(access[0], /; SameSite=Lax/);
        assert.match(access[0], /; Max-Age=900(;|$)/);
    });

    test('afm_refresh is set once per auth mount, HttpOnly and SameSite=Strict', async () => {
        const { res } = await signIn();
        const refresh = setCookies(res, 'afm_refresh');
        assert.deepEqual(refresh.map((c) => c.match(/Path=([^;]+)/)[1]).sort(), ['/api/auth', '/api/v1/auth']);
        for (const c of refresh) {
            assert.match(c, /; HttpOnly/);
            assert.match(c, /; SameSite=Strict/);
        }
        assert.equal(value(refresh[0]), value(refresh[1]));
    });

    test('the login body carries neither token', async () => {
        const s = await signIn();
        assert.ok(!s.res.raw.includes(s.access));
        assert.ok(!s.res.raw.includes(s.refresh));
        assert.deepEqual(Object.keys(s.res.json).sort(), ['csrfToken', 'success', 'user']);
    });

    test('a malformed dpopJwk is the same 401 as a wrong password', async () => {
        const bad = await send('POST', '/api/v1/auth/login', {
            body: JSON.stringify({ username: BOOTSTRAP_USERNAME, password: BOOTSTRAP_PASSWORD, dpopJwk: { kty: 'EC', crv: 'P-256', x: 'a', y: 'b', d: 'c' } }),
        });
        const wrong = await send('POST', '/api/v1/auth/login', { body: JSON.stringify({ username: BOOTSTRAP_USERNAME, password: 'nope' }) });
        assert.equal(bad.status, 401);
        assert.deepEqual(bad.json, wrong.json);
    });
});

for (const prefix of ['/api/v1', '/api']) {
    describe(`POST ${prefix}/auth/refresh`, () => {
        const url = `${prefix}/auth/refresh`;

        test('renews with the refresh cookie + proof and no access cookie at all', async () => {
            const s = await signIn();
            const res = await send('POST', url, {
                headers: { Cookie: `afm_refresh=${s.refresh}`, DPoP: s.key.proof({ path: url }) },
            });
            assert.equal(res.status, 200, res.raw);
            assert.equal(res.json.success, true);
            assert.equal(res.json.csrfToken, s.csrf);
            const access = value(setCookies(res, 'afm_access')[0]);
            const refresh = value(setCookies(res, 'afm_refresh')[0]);
            assert.notEqual(refresh, s.refresh);
            assert.ok(!res.raw.includes(access) && !res.raw.includes(refresh));

            const list = await send('GET', `${prefix}/fs/list?path=/`, { headers: { Cookie: `afm_access=${access}` } });
            assert.equal(list.status, 200);
        });

        test('no proof, a proof for another path, or another key is 401', async () => {
            const s = await signIn();
            const cookie = `afm_refresh=${s.refresh}`;
            for (const headers of [
                { Cookie: cookie },
                { Cookie: cookie, DPoP: s.key.proof({ path: '/api/v1/fs/list' }) },
                { Cookie: cookie, DPoP: deviceKey().proof({ path: url }) },
            ]) {
                const res = await send('POST', url, { headers });
                assert.equal(res.status, 401);
                assert.equal(res.json.success, false);
            }
        });

        test('no refresh cookie is 401', async () => {
            const res = await send('POST', url, { headers: { DPoP: deviceKey().proof({ path: url }) } });
            assert.equal(res.status, 401);
        });
    });
}

describe('the refresh token is not an API credential', () => {
    test('as a Bearer header or as the access cookie it is 401', async () => {
        const s = await signIn();
        const bearer = await send('GET', '/api/v1/fs/list?path=/', { headers: { Authorization: `Bearer ${s.refresh}` } });
        const cookie = await send('GET', '/api/v1/fs/list?path=/', { headers: { Cookie: `afm_access=${s.refresh}` } });
        assert.equal(bearer.status, 401);
        assert.equal(cookie.status, 401);
    });
});

describe('logout with only the refresh cookie', () => {
    test('revokes the family without a proof or CSRF header, and clears every cookie', async () => {
        const s = await signIn();
        const res = await send('POST', '/api/v1/auth/logout', { headers: { Cookie: `afm_refresh=${s.refresh}` } });
        assert.equal(res.status, 200, res.raw);
        assert.equal(res.json.success, true);
        const cleared = [...setCookies(res, 'afm_access'), ...setCookies(res, 'afm_refresh')];
        assert.equal(cleared.length, 3);
        for (const c of cleared) assert.match(c, /Max-Age=0/);

        const renew = await send('POST', '/api/v1/auth/refresh', {
            headers: { Cookie: `afm_refresh=${s.refresh}`, DPoP: s.key.proof() },
        });
        assert.equal(renew.status, 401);
        const access = await send('GET', '/api/v1/fs/list?path=/', { headers: { Cookie: `afm_access=${s.access}` } });
        assert.equal(access.status, 401);
    });

    test('with neither credential it is 401', async () => {
        const res = await send('POST', '/api/v1/auth/logout');
        assert.equal(res.status, 401);
    });
});

// Must stay LAST in this file: it exhausts the refresh budget for 127.0.0.1.
describe('POST /auth/refresh is throttled (AFM_REFRESH_RATE_LIMIT_PER_MINUTE)', () => {
    test('a refresh inside the budget succeeds; past it, 429 with Retry-After that says nothing about the token', async () => {
        const s = await signIn();
        const first = await send('POST', '/api/v1/auth/refresh', {
            headers: { Cookie: `afm_refresh=${s.refresh}`, DPoP: s.key.proof() },
        });
        assert.equal(first.status, 200, first.raw);

        let res;
        for (let i = 0; i < 40; i++) {
            res = await send('POST', '/api/v1/auth/refresh', { headers: { DPoP: s.key.proof() } });
            if (res.status === 429) break;
        }
        assert.equal(res.status, 429);
        assert.match(String(res.headers['retry-after']), /^\d+$/);

        const valid = await send('POST', '/api/v1/auth/refresh', {
            headers: { Cookie: `afm_refresh=${value(setCookies(first, 'afm_refresh')[0])}`, DPoP: s.key.proof() },
        });
        const bogus = await send('POST', '/api/v1/auth/refresh', { headers: { Cookie: 'afm_refresh=not-a-token' } });
        assert.equal(valid.status, 429);
        assert.equal(bogus.status, 429);
        assert.deepEqual(valid.json, bogus.json);
    });
});
