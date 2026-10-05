// test/api/cors.contract.test.js
'use strict';

/**
 * CORS is same-origin by default (api-security-hardening, CORS default-off).
 *
 * No AFM_CORS_* is set in this file, so `config.cors.enabled` is false and the
 * `cors()` middleware is never registered. The default SPA is same-origin
 * (`/api/v1`), so nothing legitimate depends on these headers; the point of the
 * test is that a foreign origin receives NO Access-Control-* header, and a
 * preflight is not answered permissively.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-cors-off-'));
const ROOT = path.join(TMP, 'root');
fs.mkdirSync(ROOT, { recursive: true });
const DATA = path.join(TMP, 'data');
fs.mkdirSync(DATA, { recursive: true });

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_DATA = process.env.AFM_DATA_DIR;
delete process.env.AFM_CORS_ENABLED;
delete process.env.AFM_CORS_ALLOWED_ORIGINS;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_DATA_DIR = DATA;

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

describe('CORS is disabled by default', () => {
    test('a cross-origin GET receives no Access-Control-Allow-Origin header', async () => {
        const res = await request('/api/v1/health', {
            headers: { Origin: 'https://evil.example' },
        });
        assert.equal(res.status, 200, 'the request still succeeds server-side');
        assert.equal(res.headers['access-control-allow-origin'], undefined,
            'but the browser is given no cross-origin grant');
    });

    test('a mutating preflight is not answered permissively', async () => {
        const res = await request('/api/v1/fs/delete', {
            method: 'OPTIONS',
            headers: {
                Origin: 'https://evil.example',
                'Access-Control-Request-Method': 'DELETE',
            },
        });
        assert.equal(res.headers['access-control-allow-origin'], undefined,
            'no allow-origin is granted');
        assert.equal(res.headers['access-control-allow-methods'], undefined,
            'no allow-methods is granted');
        assert.equal(res.headers['access-control-allow-credentials'], undefined,
            'no allow-credentials is granted');
    });
});
