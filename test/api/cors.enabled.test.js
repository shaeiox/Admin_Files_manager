// test/api/cors.enabled.test.js
'use strict';

/**
 * CORS allowlist when explicitly enabled (api-security-hardening, CORS default-off).
 *
 * AFM_CORS_ENABLED=true plus a single allowlisted origin. The middleware is
 * registered at server require time from `config.cors`, so this case lives in
 * its own process (its sibling cors.contract.test.js covers the off default).
 *
 * The contract: an allowlisted origin is reflected with `Vary: Origin`; a
 * foreign origin receives no grant; same-origin (no Origin header) receives
 * no CORS header; credentials are never granted.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-cors-on-'));
const ROOT = path.join(TMP, 'root');
fs.mkdirSync(ROOT, { recursive: true });
const DATA = path.join(TMP, 'data');
fs.mkdirSync(DATA, { recursive: true });

const ALLOWED = 'https://files.example.internal';
const FOREIGN = 'https://evil.example';

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_DATA = process.env.AFM_DATA_DIR;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_DATA_DIR = DATA;
process.env.AFM_CORS_ENABLED = 'true';
process.env.AFM_CORS_ALLOWED_ORIGINS = ALLOWED;

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

let server;
let port;

function request(pathname, { method = 'GET', headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, headers, agent: false },
            (res) => {
                let body = '';
                res.on('data', (c) => { body += c; });
                res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
            },
        );
        req.on('error', reject);
        req.end();
    });
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
});

after(async () => {
    if (server && server.closeAllConnections) server.closeAllConnections();
    if (server) await new Promise((r) => server.close(r));
    if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT; else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
    if (ORIGINAL_PORT === undefined) delete process.env.PORT; else process.env.PORT = ORIGINAL_PORT;
    if (ORIGINAL_DATA === undefined) delete process.env.AFM_DATA_DIR; else process.env.AFM_DATA_DIR = ORIGINAL_DATA;
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('CORS allowlist when enabled', () => {
    test('an allowlisted origin is reflected with Vary: Origin', async () => {
        const res = await request('/api/v1/health', { headers: { Origin: ALLOWED } });
        assert.equal(res.status, 200);
        assert.equal(res.headers['access-control-allow-origin'], ALLOWED);
        assert.match(res.headers.vary || '', /Origin/);
    });

    test('a foreign origin receives no grant', async () => {
        const res = await request('/api/v1/health', { headers: { Origin: FOREIGN } });
        assert.equal(res.status, 200, 'server still answers; the browser is the gate');
        assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    test('credentials are never granted', async () => {
        const res = await request('/api/v1/health', { headers: { Origin: ALLOWED } });
        assert.equal(res.headers['access-control-allow-credentials'], undefined);
    });

    test('an allowlisted preflight is answered permissively', async () => {
        const res = await request('/api/v1/fs/delete', {
            method: 'OPTIONS',
            headers: {
                Origin: ALLOWED,
                'Access-Control-Request-Method': 'DELETE',
            },
        });
        assert.equal(res.headers['access-control-allow-origin'], ALLOWED);
        assert.match(res.headers['access-control-allow-methods'] || '', /DELETE/);
    });

    test('a same-origin request (no Origin header) receives no CORS grant', async () => {
        const res = await request('/api/v1/health');
        assert.equal(res.status, 200);
        assert.equal(res.headers['access-control-allow-origin'], undefined);
    });
});
