// test/api/portal-link.contract.test.js
'use strict';

/**
 * Admin -> File Portal calls (isolate-app-roots D7), against a LIVE admin and a
 * fake portal: the Logs pane and "Check access" ask the portal over HTTP with
 * the service token, and an unreachable portal is reported, never guessed.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-portal-link-'));
const ROOT = path.join(TMP, 'root');
fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });

const TOKEN = 't'.repeat(40);

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE = '1000';
process.env.AFM_PORTAL_SERVICE_TOKEN = TOKEN;
delete process.env.PORTAL_LOG_FILE;

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

const { applyBootstrapEnv, redirectAdminDb, login: authLogin } = require('../helpers/authenticated');
applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;
let headers;
let portal;
let portalPort;
/** What the fake portal saw last. */
const seen = [];

function get(pathname) {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: pathname, method: 'GET', agent: false, headers }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* non-JSON */ }
                resolve({ status: res.statusCode, json });
            });
        });
        req.on('error', reject);
        req.end();
    });
}

before(async () => {
    portal = http.createServer((req, res) => {
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
            seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
            if (req.headers.authorization !== `Bearer ${TOKEN}`) { res.writeHead(401); return res.end(); }
            res.setHeader('Content-Type', 'application/json');
            if (req.url.startsWith('/api/ops/log')) return res.end(JSON.stringify({ available: true, entries: [{ msg: 'b' }, { msg: 'a' }] }));
            if (req.url === '/api/ops/access-check') return res.end(JSON.stringify({ outcome: 'locked', policies: [{ path: '/docs', outcome: 'locked' }] }));
            res.writeHead(404); res.end();
        });
    });
    await new Promise((r) => portal.listen(0, '127.0.0.1', r));
    portalPort = portal.address().port;
    process.env.AFM_PORTAL_URL = `http://127.0.0.1:${portalPort}`;

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
    if (portal) await new Promise((r) => portal.close(r));
    require('../../src/db/connection').reset();
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('portal log over HTTP', () => {
    test('the Logs pane reads the portal, with the service token, never a file', async () => {
        const res = await get('/api/v1/admin/logs/portal?limit=5');
        assert.equal(res.status, 200);
        assert.deepEqual(res.json, { available: true, entries: [{ msg: 'b' }, { msg: 'a' }] });
        const call = seen.at(-1);
        assert.equal(call.url, '/api/ops/log?limit=5');
        assert.equal(call.auth, `Bearer ${TOKEN}`);
    });

    test('an unreachable portal is reported as such', async () => {
        const saved = process.env.AFM_PORTAL_URL;
        process.env.AFM_PORTAL_URL = 'http://127.0.0.1:1';
        try {
            const res = await get('/api/v1/admin/logs/portal');
            assert.equal(res.status, 200);
            assert.equal(res.json.available, false);
            assert.match(res.json.reason, /not reachable/);
        } finally {
            process.env.AFM_PORTAL_URL = saved;
        }
    });

    test('neither URL nor file: "not linked", unchanged', async () => {
        const saved = process.env.AFM_PORTAL_URL;
        delete process.env.AFM_PORTAL_URL;
        try {
            const res = await get('/api/v1/admin/logs/portal');
            assert.deepEqual(res.json, { available: false, reason: 'PORTAL_LOG_FILE is not set.', entries: [] });
        } finally {
            process.env.AFM_PORTAL_URL = saved;
        }
    });
});

describe('"Check access" asks the portal', () => {
    test('the portal decision is returned in the same shape', async () => {
        const res = await get('/api/v1/admin/files/effective?path=%2Fdocs%2Fa.txt');
        assert.equal(res.status, 200);
        assert.deepEqual(res.json, { outcome: 'locked', policies: [{ path: '/docs', outcome: 'locked' }] });
        assert.deepEqual(seen.at(-1).body, { clientPath: '/docs/a.txt', userId: null });
    });

    test('an unknown user is 404 before the portal is asked', async () => {
        const before = seen.length;
        const res = await get('/api/v1/admin/files/effective?path=%2Fdocs&userId=9999');
        assert.equal(res.status, 404);
        assert.equal(seen.length, before);
    });

    test('an unreachable portal is 503, never a guessed decision', async () => {
        const saved = process.env.AFM_PORTAL_URL;
        process.env.AFM_PORTAL_URL = 'http://127.0.0.1:1';
        try {
            const res = await get('/api/v1/admin/files/effective?path=%2Fdocs');
            assert.equal(res.status, 503);
            assert.match(res.json.error, /not reachable/);
        } finally {
            process.env.AFM_PORTAL_URL = saved;
        }
    });
});
