// test/integration/error-disclosure.test.js
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

/**
 * Regression guard for error information disclosure.
 *
 * Phase 8 confirmed live that error responses carried `err.stack`, exposing the
 * server's absolute on-disk layout:
 *   at deleteItems (D:\Projects\Admin-Files-Manager-fixed\src\controllers\fs.controller.js:271:19)
 *
 * Removing only the stack would not have been enough: `err.message` leaks too,
 * because a raw fs error reads "ENOENT: no such file or directory, open 'C:\...'".
 * So the contract enforced here is stricter and deliberate:
 *
 *   - ONLY AppError messages reach the client. Those are authored static strings.
 *   - Every other error yields a generic message.
 *   - No response ever contains a stack, a path, or a raw system message.
 */

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-err-'));
const ROOT = path.join(TMP, 'root');
fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'a.png'), 'REAL');

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';

// Test isolation: the metadata singleton defaults to <cwd>/data/metadata.json,
// which several test FILES used to write from parallel processes through one
// shared `.tmp` name - two interleaved writes corrupted the real store. Every
// server-booting test now points it at its own temporary file.
const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

let server;
let port;

function call(method, pathname, body) {
    return new Promise((resolve) => {
        const payload = body === undefined ? null : JSON.stringify(body);
        const headers = payload
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
            : {};
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, agent: false, headers },
            (res) => {
                let text = '';
                res.on('data', (c) => { text += c; });
                res.on('end', () => {
                    let json = null;
                    try { json = JSON.parse(text); } catch { /* non-JSON */ }
                    resolve({ status: res.statusCode, body: text, json, headers: res.headers });
                });
            }
        );
        req.setTimeout(10000, () => req.destroy(new Error('timeout')));
        req.on('error', () => resolve({ status: 0, body: '', json: null, headers: {} }));
        if (payload) req.write(payload);
        req.end();
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
    if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
    if (ORIGINAL_PORT === undefined) delete process.env.PORT;
    else process.env.PORT = ORIGINAL_PORT;
    fs.rmSync(TMP, { recursive: true, force: true });
});

/** Anything that could disclose server-side filesystem layout. */
function assertNoDisclosure(res, label) {
    assert.ok(!('stack' in (res.json || {})), `${label}: response must not carry a stack`);
    assert.ok(!/"stack"/.test(res.body), `${label}: body must not mention a stack`);

    // Absolute Windows path at a token boundary (not the "s:/" inside https://).
    assert.ok(!/(?:^|[\s"'`=(])[A-Za-z]:[\\/]/.test(res.body),
        `${label}: body leaks a drive-letter path`);
    // UNC prefix.
    assert.ok(!/(?:^|[\s"'`])\\\\[A-Za-z0-9._-]+/.test(res.body),
        `${label}: body leaks a UNC path`);
    // Node internals / source file references.
    assert.ok(!res.body.includes(REPO_DIR), `${label}: body leaks the repository path`);
    assert.ok(!res.body.includes(ROOT), `${label}: body leaks the storage root`);
    assert.ok(!/node:internal/.test(res.body), `${label}: body leaks node internals`);
    assert.ok(!/\.js:\d+/.test(res.body), `${label}: body leaks a source line reference`);
}

const REPO_DIR = path.resolve(__dirname, '..', '..');

describe('error responses never disclose server filesystem layout', () => {
    test('a 403 from path containment carries no stack and no path', async () => {
        const res = await call('DELETE', '/admin/fs/delete', { paths: ['/../root-secret/x'] });

        assert.equal(res.status, 403);
        assertNoDisclosure(res, '403 traversal');
        // The AppError message itself IS useful and must survive.
        assert.match(res.json.error, /traversal/i);
    });

    test('a 404 carries no stack and no path', async () => {
        const res = await call('GET', '/admin/fs/list?path=%2Fdoes-not-exist');
        assert.equal(res.status, 404);
        assertNoDisclosure(res, '404');
    });

    test('a 400 from input validation carries no stack', async () => {
        const res = await call('POST', '/admin/fs/folder', {});
        assert.equal(res.status, 400);
        assertNoDisclosure(res, '400');
    });

    test('an unexpected server error does not echo a raw system message', async () => {
        // No route throws an unmasked error on demand, so exercise the handler
        // directly with the two shapes that used to leak: a raw fs Error (whose
        // message embeds an absolute path) and a plain TypeError.
        const errorHandler = require('../../src/middlewares/errorHandler');

        const cases = [
            new Error(`ENOENT: no such file or directory, open '${ROOT}\\secret.txt'`),
            new TypeError("Cannot read properties of undefined (reading 'map')"),
        ];

        for (const err of cases) {
            let payload = null;
            let status = 0;
            const res = {
                status(c) { status = c; return this; },
                json(b) { payload = b; return this; },
            };
            const logged = [];
            const originalError = console.error;
            console.error = (...a) => logged.push(a);
            try {
                errorHandler(err, { method: 'GET', path: '/probe' }, res, () => {});
            } finally {
                console.error = originalError;
            }

            assert.equal(status, 500, 'a non-AppError is a 500');
            assert.equal(payload.success, false);
            assertNoDisclosure({ body: JSON.stringify(payload), json: payload }, `raw ${err.constructor.name}`);
            assert.equal(payload.stack, undefined, 'no stack in the payload');
            assert.ok(logged.length > 0, 'the real error is still logged server-side');
        }
    });

    test('AppError messages are still forwarded - the fix is not over-broad', async () => {
        const res = await call('GET', '/admin/fs/list?path=%2F..%2F..%2Fescape');
        assert.equal(res.status, 403);
        // Authored, static, path-free: this is the message a user needs.
        assert.equal(res.json.error, 'Access denied. Path traversal detected.');
        assertNoDisclosure(res, 'AppError forwarding');
    });

    test('the error envelope matches the documented contract', async () => {
        const res = await call('GET', '/admin/fs/list?path=%2Fdoes-not-exist');
        assert.deepEqual(
            Object.keys(res.json).sort(),
            ['error', 'success'],
            'the envelope is exactly { success, error } - no extra keys'
        );
    });
});