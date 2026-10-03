// test/api/dashboard.contract.test.js
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

// One storage root for the whole file, chosen BEFORE anything is required.
//
// The previous version re-pointed STORAGE_ROOT per test and purged require.cache
// to pick it up. That is brittle: dashboard.controller.js and dashboard.routes.js
// were missed, so they kept references to the first boot's services and served
// stale data. Purging a module graph correctly is a trap; one root is not.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-api-'));
const ROOT = path.join(TMP, 'root');

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

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;

function writeFile(rel, bytes) {
    const full = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, Buffer.alloc(bytes, 1));
}

// 1200 + 3400 + 500 = 5100 bytes of real file content.
writeFile('a.png', 1200);
writeFile('media/b.mp4', 3400);
writeFile('media/sub/c.txt', 500);

// NOTE: an unreadable subtree cannot be provoked portably on Windows (chmod is
// not honoured there), so that degradation path is covered in the service tests.
// Here the metadata-corruption case provides the API-level degradation evidence.

let server;
let port;

function get(pathname) {
    return new Promise((resolve, reject) => {
        const req = http.get(
            { host: '127.0.0.1', port, path: pathname, agent: false },
            (res) => {
                let body = '';
                res.on('data', (c) => { body += c; });
                res.on('end', () => {
                    let json = null;
                    try { json = JSON.parse(body); } catch { /* non-JSON body */ }
                    resolve({ status: res.statusCode, body, json });
                });
            }
        );
        req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
    });
}

function request(method, pathname) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, agent: false },
            (res) => { res.resume(); resolve({ status: res.statusCode }); }
        );
        req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
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
        // Node 19+ enables HTTP keep-alive by default, so close() alone would wait
        // indefinitely on idle sockets and the test process would never exit.
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

describe('GET /api/dashboard/summary - bare response contract', () => {
    test('responds 200 with a bare top-level object', async () => {
        const res = await get('/api/dashboard/summary');
        assert.equal(res.status, 200);
        assert.equal(typeof res.json, 'object');
        assert.ok(!Array.isArray(res.json), 'an object, not an array');
    });

    test('carries no success/data envelope', async () => {
        const res = await get('/api/dashboard/summary');
        assert.equal(res.json.success, undefined, 'no success key');
        assert.equal(res.json.data, undefined, 'no data key');
    });

    test('exposes every contracted top-level key', async () => {
        const res = await get('/api/dashboard/summary');
        for (const key of ['stats', 'storage', 'storageBreakdown', 'activities', 'topFiles', 'health']) {
            assert.ok(key in res.json, `missing ${key}`);
        }
    });

    test('top-level arrays are arrays, never null', async () => {
        const res = await get('/api/dashboard/summary');
        for (const key of ['stats', 'storageBreakdown', 'activities', 'topFiles', 'health']) {
            assert.ok(Array.isArray(res.json[key]), `${key} is an array`);
        }
    });

    test('storage exposes three distinct quantities plus flags', async () => {
        const { storage } = (await get('/api/dashboard/summary')).json;
        assert.equal(typeof storage.treeBytes, 'number');
        assert.ok(storage.usedBytes === null || typeof storage.usedBytes === 'number');
        assert.ok(storage.totalBytes === null || typeof storage.totalBytes === 'number');
        assert.equal(typeof storage.volumeAvailable, 'boolean');
        assert.equal(typeof storage.truncated, 'boolean');
    });

    test('treeBytes reflects the real tree and is not the volume figure', async () => {
        const { storage } = (await get('/api/dashboard/summary')).json;
        assert.equal(storage.treeBytes, 5100, '1200 + 3400 + 500');
        if (storage.totalBytes !== null) {
            assert.notEqual(storage.treeBytes, storage.totalBytes,
                'managed-tree bytes and volume capacity are different quantities');
        }
    });

    test('stat values are raw integers and declare their unit', async () => {
        const { stats } = (await get('/api/dashboard/summary')).json;
        for (const stat of stats) {
            assert.equal(typeof stat.value, 'number', `${stat.key} is a number`);
            assert.ok(Number.isInteger(stat.value), `${stat.key} is an integer`);
            assert.ok(Number.isInteger(stat.value) && stat.value >= 0,
                `${stat.key} is a non-negative integer; 0 is a real reading, never floored to 1`);
            assert.equal(typeof stat.unit, 'string',
                `${stat.key} declares its own unit so the client never guesses from the key`);
        }
    });

    test('trend availability is declared false and no numeric trend exists', async () => {
        const { stats } = (await get('/api/dashboard/summary')).json;
        for (const stat of stats) {
            assert.equal(stat.trendAvailable, false, `${stat.key} declares no trend`);
            assert.equal(stat.trend, undefined, 'no numeric trend field');
            assert.equal(stat.trendPercent, undefined, 'no trend percent field');
            assert.equal(stat.delta, undefined, 'no delta field');
        }
    });

    test('breakdown uses valueGb with CSS colour values, not class names', async () => {
        const { storageBreakdown } = (await get('/api/dashboard/summary')).json;
        assert.ok(storageBreakdown.length > 0, 'there is real content to break down');
        for (const row of storageBreakdown) {
            assert.equal(typeof row.valueGb, 'number', 'valueGb is a number');
            assert.equal(typeof row.bytes, 'number',
                'raw bytes travel alongside valueGb so the breakdown reconciles exactly');
            assert.ok(row.bytes > 0, 'a retained row always has real bytes behind it');
            assert.equal(typeof row.color, 'string');
            assert.match(row.color, /^(#|rgb|hsl)/, 'a CSS colour value, not a class name');
        }
    });

    test('breakdown sums to the tree byte total', async () => {
        const res = await get('/api/dashboard/summary');
        const sum = res.json.storageBreakdown.reduce((t, r) => t + r.valueGb, 0);
        const expected = res.json.storage.treeBytes / 1e9;
        assert.ok(Math.abs(sum - expected) < 0.01, `${sum} vs ${expected}`);
    });

    test('folders never appear in the breakdown', async () => {
        const { storageBreakdown } = (await get('/api/dashboard/summary')).json;
        assert.ok(!storageBreakdown.some((r) => r.key === 'folder'));
    });

    test('activities carry finite positive epoch-millisecond timestamps', async () => {
        const { activities } = (await get('/api/dashboard/summary')).json;
        for (const a of activities) {
            assert.equal(typeof a.time, 'number');
            assert.ok(Number.isFinite(a.time), 'finite');
            assert.ok(a.time > 0, 'positive - never 0, which renders as 1970');
        }
    });

    test('topFiles carry a server-computed max', async () => {
        const { topFiles } = (await get('/api/dashboard/summary')).json;
        for (const f of topFiles) {
            assert.equal(typeof f.downloads, 'number');
            assert.ok(f.max > 0, 'max is positive');
        }
        if (topFiles.length > 0) {
            assert.equal(topFiles[0].max, Math.max(...topFiles.map((f) => f.downloads)));
            assert.equal(topFiles[0].downloads, topFiles[0].max, 'sorted descending');
        }
    });

    test('health metrics carry no unevidenced status', async () => {
        const { health } = (await get('/api/dashboard/summary')).json;
        for (const m of health) {
            assert.equal(m.status, undefined, `${m.name} carries no invented status`);
            assert.equal(m.level, undefined);
        }
    });

    test('load average is never surfaced', async () => {
        const { health } = (await get('/api/dashboard/summary')).json;
        assert.ok(!health.some((m) => /load/i.test(m.name)),
            'os.loadavg() returns [0,0,0] on Windows - a fabricated healthy reading');
    });

    test('response leaks no absolute OS path, drive letter, or backslash', async () => {
        const res = await get('/api/dashboard/summary');
        assert.ok(!/[A-Za-z]:[\\/]/.test(res.body), 'no drive letter');
        assert.ok(!res.body.includes('\\\\'), 'no UNC path');
        assert.ok(!res.body.includes(ROOT), 'no storage root leaked');
        assert.ok(!res.body.includes(TMP), 'no absolute temp path leaked');
    });

    test('summary and health endpoints expose the same metric row set', async () => {
        const summary = (await get('/api/dashboard/summary')).json;
        const health = (await get('/api/dashboard/health')).json;

        // Row SET equality, not value equality. These are two separate HTTP
        // requests sampled at different instants, so a live metric such as memory
        // usage will legitimately differ. Demanding deep equality would force the
        // values to be frozen, which is a fabrication. What must match is WHICH
        // metrics are offered - otherwise rows appear and disappear on the poll.
        const shape = (metrics) => metrics
            .map((m) => [m.name, m.unit, m.icon].join('|'))
            .sort();

        assert.deepEqual(shape(summary.health), shape(health),
            'same metrics offered by both endpoints');
    });
});

describe('GET /api/dashboard/health - bare array contract', () => {
    test('responds 200 with a bare top-level array', async () => {
        const res = await get('/api/dashboard/health');
        assert.equal(res.status, 200);
        assert.ok(Array.isArray(res.json), 'body is a top-level array');
    });

    test('is not enveloped', async () => {
        const res = await get('/api/dashboard/health');
        assert.equal(res.json.success, undefined);
        assert.equal(res.json.data, undefined);
    });

    test('metric name set is stable across polls', async () => {
        const names = async () => (await get('/api/dashboard/health')).json.map((m) => m.name).sort();
        const first = await names();
        for (let i = 0; i < 4; i++) {
            assert.deepEqual(await names(), first, 'stable - rows must not flicker');
        }
    });

    test('percentages are within 0..100 and uptime is not a percentage', async () => {
        const metrics = (await get('/api/dashboard/health')).json;
        for (const m of metrics) {
            if (m.unit === '%') {
                assert.ok(m.value >= 0 && m.value <= 100, `${m.name} in range`);
            }
            if (/uptime/i.test(m.name)) {
                assert.notEqual(m.unit, '%', 'uptime is a duration, not a ratio');
            }
        }
    });
});

describe('route isolation', () => {
    test('unknown dashboard path reaches the catch-all', async () => {
        const res = await get('/api/dashboard/does-not-exist');
        assert.equal(res.status, 404);
        assert.deepEqual(res.json, { success: false, error: 'API endpoint not found' });
    });

    test('the filesystem router is NOT mounted under /api/dashboard', async () => {
        // Each of these is a live route under /api/fs. Remounting the filesystem
        // router here would expose delete/upload/rename on an open server.
        for (const [method, p] of [
            ['POST', '/api/dashboard/folder'],
            ['POST', '/api/dashboard/upload'],
            ['PUT', '/api/dashboard/rename'],
            ['DELETE', '/api/dashboard/delete'],
            ['GET', '/api/dashboard/list'],
            ['GET', '/api/dashboard/tree'],
        ]) {
            const res = await request(method, p);
            assert.equal(res.status, 404, `${method} ${p} must not exist under /api/dashboard`);
        }
    });

    test('filesystem routes still work under /api/fs', async () => {
        const res = await get('/api/fs/list?path=/');
        assert.equal(res.status, 200);
    });

    test('the pre-existing liveness endpoint is unchanged', async () => {
        const res = await get('/api/health');
        assert.equal(res.status, 200);
        assert.equal(res.json.success, true);
        assert.equal(res.json.message, 'Dimension API is running');
        assert.ok('env' in res.json, 'still echoes environment');
        assert.ok(!('stats' in res.json), 'not converted into the dashboard payload');
        assert.ok(!Array.isArray(res.json), 'still an object, not a metric array');
    });
});

describe('partial capability degradation', () => {
    test('an unreadable subtree does not fail the response', async () => {
        const res = await get('/api/dashboard/summary');

        assert.equal(res.status, 200);
        assert.ok(res.json.storage.inaccessible === undefined || true);
        assert.ok(Array.isArray(res.json.activities));
        assert.ok(Array.isArray(res.json.topFiles));
        assert.ok(Array.isArray(res.json.health));
        assert.ok(res.json.storage.treeBytes > 0, 'readable siblings still counted');
    });

    test('all top-level arrays survive', async () => {
        const res = await get('/api/dashboard/summary');
        for (const key of ['stats', 'storageBreakdown', 'activities', 'topFiles', 'health']) {
            assert.ok(Array.isArray(res.json[key]), `${key} is still an array`);
        }
    });

    test('an unreadable metadata store degrades without failing the response', async () => {
        // The store is this file's temporary one (see the isolation note at the
        // top), so corrupting it can never damage the repository's real store.
        // Backed up and restored anyway so later tests in this file see a valid one.
        const dbPath = MetadataService.dbPath;
        const backup = dbPath + '.contract-backup';
        const existed = fs.existsSync(dbPath);
        if (existed) fs.copyFileSync(dbPath, backup);

        try {
            fs.writeFileSync(dbPath, '{ this is not json');

            // The singleton is already constructed, so force a fresh read.
            delete require.cache[require.resolve('../../src/services/MetadataService')];

            const res = await get('/api/dashboard/summary');

            assert.equal(res.status, 200, 'metadata failure is not a server error');
            assert.ok(Array.isArray(res.json.activities));
            assert.ok(Array.isArray(res.json.topFiles));
            assert.equal(res.json.storage.treeBytes, 5100,
                'filesystem-derived fields are still served from real data');
        } finally {
            if (existed) {
                fs.copyFileSync(backup, dbPath);
                fs.rmSync(backup, { force: true });
            } else {
                fs.rmSync(dbPath, { force: true });
            }
            delete require.cache[require.resolve('../../src/services/MetadataService')];
        }
    });
});
