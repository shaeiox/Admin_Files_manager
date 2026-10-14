// test/api/system.contract.test.js
'use strict';

/**
 * Admin system endpoints against a LIVE server: the File Portal .env editor
 * (PORTAL_ROOT), the portal trace log, the audit log, and the version label.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-system-'));
const ROOT = path.join(TMP, 'root');
const PORTAL = path.join(TMP, 'portal');
fs.mkdirSync(ROOT, { recursive: true });
fs.mkdirSync(path.join(PORTAL, 'data'), { recursive: true });
const ENV_TEXT = '# portal\r\nPORT=4000\r\nFILES_ROOT=/srv/files\r\nAUTH_ENABLED=true\r\nAUTH_JWT_SECRET=top-secret-value\r\nAUTH_SESSION_MINUTES=30\r\n';
fs.writeFileSync(path.join(PORTAL, '.env'), ENV_TEXT);
fs.writeFileSync(path.join(PORTAL, 'data', 'portal.log'), [
    JSON.stringify({ t: '2026-01-01T00:00:00.000Z', level: 'info', msg: 'Portal started' }),
    'not json',
    JSON.stringify({ t: '2026-01-01T00:00:01.000Z', level: 'warn', method: 'GET', status: 404, url: '/x', msg: '' }),
    '',
].join('\n'));

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.PORTAL_ROOT = PORTAL;
process.env.APP_VERSION = '9.8.7';
process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE = '1000';

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

const { applyBootstrapEnv, redirectAdminDb, login: authLogin } = require('../helpers/authenticated');
applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;
let headers;

function send(method, pathname, payload) {
    return new Promise((resolve, reject) => {
        const body = payload === undefined ? undefined : JSON.stringify(payload);
        const h = { ...headers };
        if (body !== undefined) Object.assign(h, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
        const req = http.request({ host: '127.0.0.1', port, path: pathname, method, agent: false, headers: h }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* non-JSON */ }
                resolve({ status: res.statusCode, json });
            });
        });
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

const VALID = {
    FILES_ROOT: '/srv/new-files',
    RELEASE_PVM: '/srv/new-files/release',
    AUTH_ENABLED: 'false',
    AUTH_SESSION_MINUTES: '45',
    AUTH_MAX_FAILED_ATTEMPTS: '7',
    AUTH_LOCKOUT_MINUTES: '20',
};

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
    headers = (await authLogin(port)).headers;
});

after(async () => {
    if (server) {
        if (server.closeAllConnections) server.closeAllConnections();
        await new Promise((r) => server.close(r));
    }
    require('../../src/db/connection').reset();
    fs.rmSync(TMP, { recursive: true, force: true });
});

test('GET /admin/portal/config returns only the six whitelisted keys, never the secret', async () => {
    const res = await send('GET', '/api/v1/admin/portal/config');
    assert.equal(res.status, 200);
    assert.equal(res.json.available, true);
    assert.deepEqual(Object.keys(res.json.values).sort(), Object.keys(VALID).sort());
    assert.equal(res.json.values.FILES_ROOT, '/srv/files');
    assert.equal(res.json.values.RELEASE_PVM, '');
    assert.ok(!JSON.stringify(res.json).includes('top-secret-value'));
});

test('PUT /admin/portal/config rewrites lines in place and keeps everything else', async () => {
    const res = await send('PUT', '/api/v1/admin/portal/config', VALID);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.success, true);
    assert.equal(res.json.restartRequired, true);
    const text = fs.readFileSync(path.join(PORTAL, '.env'), 'utf8');
    assert.ok(text.startsWith('# portal\r\nPORT=4000\r\nFILES_ROOT=/srv/new-files\r\nAUTH_ENABLED=false\r\nAUTH_JWT_SECRET=top-secret-value\r\nAUTH_SESSION_MINUTES=45\r\n'), text);
    assert.match(text, /RELEASE_PVM=\/srv\/new-files\/release\r\n/);
    assert.match(text, /AUTH_LOCKOUT_MINUTES=20\r\n/);
    assert.equal(text.match(/AUTH_SESSION_MINUTES=/g).length, 1);
});

test('PUT /admin/portal/config refuses invalid, unknown and multi-line values with 400', async () => {
    for (const bad of [
        { ...VALID, AUTH_ENABLED: 'yes' },
        { ...VALID, AUTH_SESSION_MINUTES: '0' },
        { ...VALID, AUTH_MAX_FAILED_ATTEMPTS: '1.5' },
        { ...VALID, FILES_ROOT: '' },
        { ...VALID, FILES_ROOT: '/a\nAUTH_JWT_SECRET=x' },
        { ...VALID, AUTH_JWT_SECRET: 'x' },
        { FILES_ROOT: '/x' },
    ]) {
        const res = await send('PUT', '/api/v1/admin/portal/config', bad);
        assert.equal(res.status, 400, JSON.stringify(bad));
    }
    assert.ok(fs.readFileSync(path.join(PORTAL, '.env'), 'utf8').includes('AUTH_JWT_SECRET=top-secret-value\r\n'));
});

test('GET /admin/logs/portal returns parsed entries newest first, skipping bad lines', async () => {
    const res = await send('GET', '/api/v1/admin/logs/portal?limit=10');
    assert.equal(res.status, 200);
    assert.equal(res.json.available, true);
    assert.deepEqual(res.json.entries.map((e) => e.level), ['warn', 'info']);
    assert.equal(res.json.entries[0].status, 404);
});

test('GET /admin/logs/audit lists the portal.config change with its actor', async () => {
    const res = await send('GET', '/api/v1/admin/logs/audit');
    assert.equal(res.status, 200);
    const row = res.json.find((r) => r.action === 'portal.config' && r.outcome === 'success');
    assert.ok(row, JSON.stringify(res.json));
    assert.equal(typeof row.actor_username, 'string');
});

test('GET /auth/me carries APP_VERSION as appVersion', async () => {
    const res = await send('GET', '/api/v1/auth/me');
    assert.equal(res.json.appVersion, '9.8.7');
});

test('PORTAL_ROOT pointing at a file (e.g. the log) is reported, not served as empty', async () => {
    process.env.PORTAL_ROOT = path.join(PORTAL, 'data', 'portal.log');
    try {
        const config = await send('GET', '/api/v1/admin/portal/config');
        assert.equal(config.json.available, false);
        assert.match(config.json.reason, /project folder/);
        const log = await send('GET', '/api/v1/admin/logs/portal');
        assert.equal(log.json.available, false);
        assert.equal((await send('PUT', '/api/v1/admin/portal/config', VALID)).status, 503);
    } finally {
        process.env.PORTAL_ROOT = PORTAL;
    }
});
