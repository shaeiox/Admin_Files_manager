// test/api/operations.contract.test.js
'use strict';

/**
 * Tracked-operation API contract, against a LIVE server.
 *
 * Covers the additive async initiation of Copy and Move (POST/PUT with
 * `async: true`), the read-only status route, session scoping, retention-aware
 * unknown ids, and - critically - that the DEFAULT synchronous path is
 * byte-identical to what it was before tracking existed.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { applyBootstrapEnv, redirectAdminDb, login: authLogin } = require('../helpers/authenticated');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-ops-'));
const ROOT = path.join(TMP, 'root');

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE = '0';

fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'op-src.txt'), 'OPERATION-BYTES');
fs.mkdirSync(path.join(ROOT, 'op-tree', 'inner'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'op-tree', 'inner', 'leaf.txt'), 'LEAF-BYTES');
fs.mkdirSync(path.join(ROOT, 'op-dest'), { recursive: true });

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;
let authHeaders = {};

function send(method, pathname, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...authHeaders, ...headers };
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
                    resolve({ status: res.statusCode, headers: res.headers, buffer, json });
                });
            }
        );
        req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

function sendJson(method, pathname, payload) {
    return send(method, pathname, {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Poll until the operation reaches a terminal state, or give up. */
async function awaitTerminal(id, attempts = 60) {
    for (let i = 0; i < attempts; i++) {
        const res = await send('GET', `/api/v1/operations/${id}`);
        if (res.status !== 200) return res;
        if (['completed', 'partial', 'failed', 'cancelled'].includes(res.json.state)) return res;
        await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error('operation never reached a terminal state');
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
    authHeaders = (await authLogin(port)).headers;
});

after(async () => {
    if (server && server.closeAllConnections) server.closeAllConnections();
    if (server) await new Promise((resolve) => server.close(resolve));
    if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
    if (ORIGINAL_PORT === undefined) delete process.env.PORT;
    else process.env.PORT = ORIGINAL_PORT;
    require('../../src/db/connection').reset(); // release the sqlite file lock before rmSync (Windows)
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('initiation returns an operation identity before the work finishes', () => {
    test('an async copy returns an id rather than waiting for completion', async () => {
        const res = await sendJson('POST', '/api/v1/fs/copy', {
            paths: ['/op-src.txt'], destination: '/op-dest', async: true,
        });

        assert.equal(res.status, 200);
        assert.equal(res.json.success, true);
        assert.equal(typeof res.json.data.operationId, 'string');
        assert.ok(res.json.data.operationId.length > 0);
    });

    test('an async move returns an operation id', async () => {
        const res = await sendJson('PUT', '/api/v1/fs/move', {
            paths: ['/op-tree'], destination: '/op-dest', async: true,
        });

        assert.equal(res.status, 200);
        assert.equal(typeof res.json.data.operationId, 'string');

        const done = await awaitTerminal(res.json.data.operationId);
        assert.ok(['completed', 'partial'].includes(done.json.state));
        assert.equal(fs.existsSync(path.join(ROOT, 'op-dest', 'op-tree', 'inner', 'leaf.txt')), true);
    });

    test('a rejected request creates no operation', async () => {
        const before = await send('GET', '/api/v1/fs/list?path=/');
        const res = await sendJson('POST', '/api/v1/fs/copy', { paths: [], destination: '/op-dest', async: true });

        assert.equal(res.status, 400);
        assert.equal(res.json.success, false);
        assert.ok(!res.json.data, 'no operation id is issued for a rejected request');
        assert.equal(before.status, 200);
    });
});

describe('operation status is a bare, measured payload', () => {
    test('a status read is a bare object with no envelope', async () => {
        fs.mkdirSync(path.join(ROOT, 'op-dest2'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'bare.txt'), 'BARE');
        const start = await sendJson('POST', '/api/v1/fs/copy', {
            paths: ['/bare.txt'], destination: '/op-dest2', async: true,
        });
        const res = await awaitTerminal(start.json.data.operationId);

        assert.equal(res.status, 200);
        assert.equal(res.json.success, undefined, 'a status read carries no envelope');
        assert.equal(res.json.state, 'completed');
        assert.equal(typeof res.json.id, 'string');
    });

    test('a copy into a destination that does not exist fails with its reason', async () => {
        const start = await sendJson('POST', '/api/v1/fs/copy', {
            paths: ['/op-src.txt'], destination: '/no-such-dest-anywhere', async: true,
        });
        const res = await awaitTerminal(start.json.data.operationId);

        assert.equal(res.json.state, 'failed');
        assert.ok(Array.isArray(res.json.failures));
        assert.equal(res.json.failures.length, 1);
        assert.equal(res.json.failures[0].statusCode, 404);
    });

    test('a copy with a measurable source reports real byte totals', async () => {
        fs.mkdirSync(path.join(ROOT, 'op-dest3'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'sized.txt'), '0123456789');
        const start = await sendJson('POST', '/api/v1/fs/copy', {
            paths: ['/sized.txt'], destination: '/op-dest3', async: true,
        });
        const res = await awaitTerminal(start.json.data.operationId);

        assert.equal(res.json.state, 'completed');
        assert.equal(res.json.determinate, true);
        assert.equal(res.json.bytes.available, true);
        assert.equal(res.json.bytes.total, 10);
        assert.equal(res.json.bytes.transferred, 10);
        assert.equal(res.json.percent, 100);
        assert.equal(res.json.itemInProgress, null, 'a terminal operation has nothing in flight');
    });

    test('a move never offers a determinate percentage', async () => {
        fs.mkdirSync(path.join(ROOT, 'op-dest4'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'moving.txt'), 'abc');
        const start = await sendJson('PUT', '/api/v1/fs/move', {
            paths: ['/moving.txt'], destination: '/op-dest4', async: true,
        });
        const res = await awaitTerminal(start.json.data.operationId);

        assert.equal(res.json.operationKind, 'move');
        assert.equal(res.json.determinate, false, 'fs.rename has no intermediate state to report');
        assert.equal(res.json.percent, null);
        assert.equal(res.json.items.done, 1);
        assert.equal(res.json.items.total, 1);
    });

    test('a terminal state carries the per-item outcome', async () => {
        fs.mkdirSync(path.join(ROOT, 'op-dest5'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'both.txt'), 'x');
        fs.writeFileSync(path.join(ROOT, 'op-dest5', 'clash.txt'), 'existing');
        fs.writeFileSync(path.join(ROOT, 'clash.txt'), 'x');
        const start = await sendJson('POST', '/api/v1/fs/copy', {
            paths: ['/both.txt', '/clash.txt'], destination: '/op-dest5', async: true,
        });
        const res = await awaitTerminal(start.json.data.operationId);

        assert.equal(res.json.state, 'partial');
        assert.equal(res.json.items.done, 1);
        assert.equal(res.json.items.failed, 1);
        assert.equal(res.json.failures[0].path, '/clash.txt');
        assert.equal(res.json.failures[0].statusCode, 409);
        assert.equal(res.json.result.copied.length, 1);
    });
});

describe('operation status is scoped to its session', () => {
    test('an unauthenticated status read is refused', async () => {
        const start = await sendJson('POST', '/api/v1/fs/copy', {
            paths: ['/op-src.txt'], destination: '/op-dest', async: true,
        });
        await awaitTerminal(start.json.data.operationId);

        const res = await send('GET', `/api/v1/operations/${start.json.data.operationId}`, {
            headers: { Cookie: '', 'X-CSRF-Token': '' },
        });
        assert.equal(res.status, 401);
    });

    test('an unknown operation id reads as unknown', async () => {
        const res = await send('GET', '/api/v1/operations/00000000-0000-0000-0000-000000000000');
        assert.equal(res.status, 404);
        assert.equal(res.json.success, false);
    });

    test('the /api alias serves the same operation payload', async () => {
        fs.mkdirSync(path.join(ROOT, 'op-dest6'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'alias.txt'), 'a');
        const start = await sendJson('POST', '/api/fs/copy', {
            paths: ['/alias.txt'], destination: '/op-dest6', async: true,
        });
        const v1 = await send('GET', `/api/v1/operations/${start.json.data.operationId}`);
        const alias = await send('GET', `/api/operations/${start.json.data.operationId}`);

        assert.equal(alias.status, 200);
        assert.equal(alias.json.id, v1.json.id);
    });

    test('health still reports apiVersion 1', async () => {
        const res = await send('GET', '/api/v1/health');
        assert.equal(res.status, 200);
        assert.equal(res.json.apiVersion, 1);
    });
});

describe('the default synchronous contract is untouched', () => {
    test('a copy without async still returns data.copied and data.failed', async () => {
        fs.mkdirSync(path.join(ROOT, 'sync-dest'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'sync-a.txt'), 'A');
        const res = await sendJson('POST', '/api/v1/fs/copy', {
            paths: ['/sync-a.txt'], destination: '/sync-dest',
        });

        assert.equal(res.status, 200);
        assert.equal(res.json.success, true);
        assert.deepEqual(res.json.data.copied, [{ sourcePath: '/sync-a.txt', newPath: '/sync-dest/sync-a.txt' }]);
        assert.deepEqual(res.json.data.failed, []);
        assert.equal(res.json.data.operationId, undefined, 'no tracking is added to the sync path');
    });

    test('a synchronous partial copy still succeeds overall with per-item failures', async () => {
        fs.mkdirSync(path.join(ROOT, 'sync-dest2'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'sync-b.txt'), 'B');
        fs.writeFileSync(path.join(ROOT, 'sync-dest2', 'sync-c.txt'), 'C');
        fs.writeFileSync(path.join(ROOT, 'sync-c.txt'), 'C');
        const res = await sendJson('POST', '/api/v1/fs/copy', {
            paths: ['/sync-b.txt', '/sync-c.txt'], destination: '/sync-dest2',
        });

        assert.equal(res.status, 200);
        assert.equal(res.json.success, true);
        assert.equal(res.json.data.copied.length, 1);
        assert.equal(res.json.data.failed.length, 1);
        assert.equal(res.json.data.failed[0].statusCode, 409);
    });

    test('a synchronous move still returns data.moved', async () => {
        fs.mkdirSync(path.join(ROOT, 'sync-dest3'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'sync-m.txt'), 'M');
        const res = await sendJson('PUT', '/api/v1/fs/move', {
            paths: ['/sync-m.txt'], destination: '/sync-dest3',
        });

        assert.equal(res.status, 200);
        assert.deepEqual(res.json.data.moved, [{ oldPath: '/sync-m.txt', newPath: '/sync-dest3/sync-m.txt' }]);
    });

    test('a total synchronous failure is still the first error, status included', async () => {
        fs.mkdirSync(path.join(ROOT, 'sync-dest4'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'sync-dest4', 'dup.txt'), 'X');
        fs.writeFileSync(path.join(ROOT, 'dup.txt'), 'X');
        const res = await sendJson('POST', '/api/v1/fs/copy', {
            paths: ['/dup.txt'], destination: '/sync-dest4',
        });

        assert.equal(res.status, 409);
        assert.equal(res.json.success, false);
        assert.match(res.json.error, /already exists/i);
    });
});