// test/api/trust-proxy.test.js
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-tp-'));
const ROOT = path.join(TMP, 'root');
fs.mkdirSync(ROOT, { recursive: true });

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_DATA = process.env.AFM_DATA_DIR;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_DATA_DIR = path.join(TMP, 'data');
fs.mkdirSync(process.env.AFM_DATA_DIR, { recursive: true });

let server;
let port;

function get(pathname, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, headers, agent: false },
            (res) => {
                let body = '';
                res.on('data', (c) => { body += c; });
                res.on('end', () => resolve({ status: res.statusCode, body }));
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

describe('trust proxy (nginx hop)', () => {
    // server.js sets the trust-proxy setting; the tests below verify that
    // setting's semantics (Express derives req.ip from X-Forwarded-For to the
    // configured hop depth) on an equivalent app, plus the configured value.
    test('server.js configures exactly one trusted hop', () => {
        assert.equal(server.app.get('trust proxy'), 1);
    });

    function echoApp() {
        const express = require('express');
        const a = express();
        a.set('trust proxy', server.app.get('trust proxy'));
        a.get('/ip', (req, res) => res.json({ ip: req.ip }));
        return a;
    }

    function get(app, pathname, headers = {}) {
        return new Promise((resolve, reject) => {
            const s = app.listen(0, async () => {
                const p = s.address().port;
                try {
                    const r = await new Promise((res, rej) => {
                        http.get({ host: '127.0.0.1', port: p, path: pathname, headers, agent: false }, (resp) => {
                            let b = '';
                            resp.on('data', (c) => { b += c; });
                            resp.on('end', () => res({ status: resp.statusCode, body: b }));
                        }).on('error', rej);
                    });
                    s.close(() => resolve(r));
                } catch (e) { s.close(() => reject(e)); }
            });
        });
    }

    test('a single X-Forwarded-For hop is honored for req.ip', async () => {
        const res = await get(echoApp(), '/ip', { 'X-Forwarded-For': '203.0.113.7' });
        assert.equal(res.status, 200);
        assert.equal(JSON.parse(res.body).ip, '203.0.113.7');
    });

    test('an older spoofed hop is dropped, not used, at the documented hop count', async () => {
        const res = await get(echoApp(), '/ip', { 'X-Forwarded-For': '203.0.113.7, 198.51.100.9' });
        assert.equal(res.status, 200);
        // trust proxy = 1: the closest forwarded hop (the one nginx appends,
        // i.e. the real client) is the key; the earlier attacker-supplied
        // value is ignored rather than trusted.
        assert.equal(JSON.parse(res.body).ip, '198.51.100.9');
    });
});
