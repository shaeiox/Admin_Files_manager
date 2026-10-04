// test/integration/live-server.test.js
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');

/**
 * End-to-end checks against a LIVE server.
 *
 * These exist because unit tests proved the traversal guard works in isolation but
 * nothing proved it is actually wired into a running Express app. Two probe bugs
 * during Phase 8 are encoded here as explicit notes, because both silently
 * produced misleading "passing" results:
 *
 *   1. A request body is only parsed if Content-Length (or chunked encoding) is
 *      set. Omitting it made every write probe fall through to input validation,
 *      so a traversal attempt looked "blocked" when containment was never reached.
 *   2. The rename handler takes `{ oldPath, newName }` - NOT `{ path, newName }`.
 *      The wrong key produced "Path must be a string", which reads like a rejection
 *      but proves nothing about containment.
 */

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-live-'));
const ROOT = path.join(TMP, 'root');
// A sibling whose name shares the `root` prefix - the exact case the naive
// string-prefix containment check used to allow.
const OUTSIDE = path.join(TMP, 'root-secret');

fs.mkdirSync(path.join(ROOT, 'media'), { recursive: true });
fs.mkdirSync(OUTSIDE, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'a.png'), 'REAL-IMAGE');
fs.writeFileSync(path.join(ROOT, 'media', 'b.mp4'), 'REAL-VIDEO');
fs.writeFileSync(path.join(OUTSIDE, 'secret.txt'), 'SECRET');

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

/** Always sets Content-Length. Omitting it means the body is never parsed. */
function call(method, pathname, body) {
    return new Promise((resolve) => {
        const payload = body === undefined ? null : JSON.stringify(body);
        const headers = payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            }
            : {};

        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, agent: false, headers },
            (res) => {
                let text = '';
                res.on('data', (c) => { text += c; });
                res.on('end', () => {
                    let json = null;
                    try { json = JSON.parse(text); } catch { /* non-JSON */ }
                    resolve({ status: res.statusCode, body: text, json });
                });
            }
        );
        req.setTimeout(10000, () => req.destroy(new Error('timeout')));
        req.on('error', () => resolve({ status: 0, body: '', json: null }));
        if (payload) req.write(payload);
        req.end();
    });
}

const secretIntact = () => fs.readFileSync(path.join(OUTSIDE, 'secret.txt'), 'utf8') === 'SECRET';

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
        // Node 19+ enables keep-alive by default; close() alone would hang.
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

describe('traversal containment is enforced on the LIVE server', () => {
    const escapes = [
        '/../root-secret/secret.txt',
        '/media/../../root-secret/secret.txt',
        '/../../root-secret',
        '/../root-secret/nested/deep.txt',
    ];

    for (const p of escapes) {
        test(`GET /api/fs/list rejects ${p}`, async () => {
            const res = await call('GET', `/api/fs/list?path=${encodeURIComponent(p)}`);
            assert.ok(res.status === 403 || res.status === 404,
                `expected 403/404, got ${res.status}`);
            assert.ok(secretIntact(), 'the outside file must be untouched');
        });
    }

    test('DELETE cannot escape via a name-prefix sibling', async () => {
        const res = await call('DELETE', '/api/fs/delete', { paths: ['/../root-secret/secret.txt'] });

        assert.equal(res.status, 403, `expected 403 from containment, got ${res.status}`);
        assert.match(res.json.error, /traversal/i);
        assert.ok(secretIntact(), 'THE OUTSIDE FILE WAS DELETED');
    });

    test('DELETE cannot escape via a nested sibling', async () => {
        const res = await call('DELETE', '/api/fs/delete', { paths: ['/media/../../root-secret/secret.txt'] });

        assert.ok(res.status >= 400, `expected a rejection, got ${res.status}`);
        assert.ok(secretIntact());
    });

    test('RENAME cannot write outside the root (note: oldPath, not path)', async () => {
        const res = await call('PUT', '/api/fs/rename', {
            oldPath: '/a.png',
            newName: '../escaped.png',
        });

        assert.ok(res.status >= 400, `expected a rejection, got ${res.status}`);
        assert.equal(fs.existsSync(path.join(TMP, 'escaped.png')), false,
            'a file was created outside the root');
        assert.equal(fs.existsSync(path.join(ROOT, 'a.png')), true, 'the original is intact');
    });

    test('RENAME cannot read outside the root', async () => {
        const res = await call('PUT', '/api/fs/rename', {
            oldPath: '/../root-secret/secret.txt',
            newName: 'x.txt',
        });

        assert.ok(res.status >= 400, `expected a rejection, got ${res.status}`);
        assert.ok(secretIntact());
    });

    test('the storage root itself cannot be deleted', async () => {
        const res = await call('DELETE', '/api/fs/delete', { paths: ['/'] });

        assert.ok(res.status >= 400, `expected a rejection, got ${res.status}`);
        assert.ok(fs.existsSync(ROOT), 'the storage root still exists');
    });

    test('legitimate writes still work - the guard is not over-blocking', async () => {
        const renamed = await call('PUT', '/api/fs/rename', {
            oldPath: '/a.png',
            newName: 'renamed.png',
        });
        assert.equal(renamed.status, 200, `legitimate rename failed: ${renamed.body.slice(0, 120)}`);
        assert.equal(fs.existsSync(path.join(ROOT, 'renamed.png')), true);

        const folder = await call('POST', '/api/fs/folder', { path: '/created' });
        assert.ok(folder.status >= 200 && folder.status < 300,
            `legitimate mkdir failed: ${folder.status}`);
        assert.ok(fs.existsSync(path.join(ROOT, 'created')));

        const deleted = await call('DELETE', '/api/fs/delete', { paths: ['/renamed.png'] });
        assert.equal(deleted.status, 200);
        assert.equal(fs.existsSync(path.join(ROOT, 'renamed.png')), false);
    });
});

describe('the liveness endpoint is untouched', () => {
    test('GET /api/health keeps its exact shape and carries no dashboard fields', async () => {
        const res = await call('GET', '/api/health');

        assert.equal(res.status, 200);
        assert.equal(res.json.success, true);
        assert.equal(res.json.message, 'Dimension API is running');
        assert.ok('env' in res.json, 'still echoes the environment');
        assert.ok(!Array.isArray(res.json), 'still an object, not a metric array');
        for (const key of ['stats', 'storage', 'storageBreakdown', 'activities', 'topFiles']) {
            assert.ok(!(key in res.json), `${key} must not appear on the liveness endpoint`);
        }
        assert.ok(!('stack' in res.json), 'a success response carries no stack');
    });

    // Re-pinned by api-v1-versioning-and-boundary (task 2.1, ADR-007): the handler
    // moved from server.js into the shared assembly so /api/v1/health and
    // /api/health are one handler, and it gained the additive `apiVersion` field.
    // Everything else about it is still pinned byte-for-byte.
    test('the /api/health handler source is byte-identical to its pinned form', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '..', '..', 'src', 'routes', 'api.js'), 'utf8'
        );
        const i = source.indexOf("router.get('/health'");
        assert.ok(i > -1, 'handler present');

        // Extract the whole handler expression.
        const start = source.lastIndexOf('router.get', i);
        let depth = 0, end = start;
        for (; end < source.length; end++) {
            if (source[end] === '(') depth++;
            else if (source[end] === ')') { depth--; if (depth === 0) break; }
        }
        const handler = source.slice(start, end + 1);

        // Compare whitespace-normalised: the handler is written across several
        // lines, so a literal multi-line match would be brittle while a
        // single-line match would never fire.
        const normalise = (x) => x.replace(/\s+/g, ' ').trim();
        assert.equal(
            normalise(handler),
            normalise("router.get('/health', (req, res) => { res.json({ success: true, message: 'Dimension API is running', env: config.env, apiVersion: API_VERSION }); })"),
            'the liveness handler must not have been modified'
        );
    });
});

describe('dashboard read endpoints on the live server', () => {
    test('summary returns real, well-formed, path-free data', async () => {
        const res = await call('GET', '/api/dashboard/summary');

        assert.equal(res.status, 200);
        for (const key of ['stats', 'storage', 'storageBreakdown', 'activities', 'topFiles', 'health']) {
            assert.ok(key in res.json, `missing ${key}`);
        }
        for (const key of ['stats', 'storageBreakdown', 'activities', 'topFiles', 'health']) {
            assert.ok(Array.isArray(res.json[key]), `${key} is always an array`);
        }
        // Derived from the tree at assert time, not hardcoded: an earlier test in this
        // file legitimately deletes a fixture file, so a fixed total would make the
        // assertion depend on execution order.
        let expectedBytes = 0;
        const walk = (dir) => {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                if (entry.isSymbolicLink()) continue;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (entry.isFile()) expectedBytes += fs.statSync(full).size;
            }
        };
        walk(ROOT);
        assert.equal(res.json.storage.treeBytes, expectedBytes,
            'treeBytes must equal the real on-disk total');
        assert.ok(!/NaN|undefined|Infinity/.test(res.body), 'no non-finite values leak into JSON');
        assert.ok(!/[A-Za-z]:[\\/]/.test(res.body), 'no drive letter');
        assert.ok(!res.body.includes(ROOT), 'no storage root leaked');
    });

    test('health is a bare array with a stable metric set and no invented status', async () => {
        const first = await call('GET', '/api/dashboard/health');
        assert.equal(first.status, 200);
        assert.ok(Array.isArray(first.json), 'bare array');

        for (const m of first.json) {
            assert.equal(typeof m.value, 'number');
            assert.ok(Number.isFinite(m.value));
            assert.ok(!('status' in m), `${m.name} carries no invented status`);
            assert.ok(!('level' in m));
        }
        assert.ok(!first.json.some((m) => /load/i.test(m.name)),
            'load average must never be surfaced');

        const second = await call('GET', '/api/dashboard/health');
        const shape = (a) => a.map((m) => `${m.name}|${m.unit}|${m.icon}`).sort().join(',');
        assert.equal(shape(second.json), shape(first.json), 'metric row set is stable across polls');
    });

    test('every dashboard route is reachable - the mount precedes the catch-all', async () => {
        assert.equal((await call('GET', '/api/dashboard/summary')).status, 200);
        assert.equal((await call('GET', '/api/dashboard/health')).status, 200);

        const unknown = await call('GET', '/api/dashboard/nope');
        assert.equal(unknown.status, 404, 'unknown dashboard paths still reach the catch-all');
    });

    test('the filesystem router is not republished under /api/dashboard', async () => {
        for (const [method, p] of [
            ['GET', '/api/dashboard/list'],
            ['GET', '/api/dashboard/tree'],
            ['POST', '/api/dashboard/folder'],
            ['POST', '/api/dashboard/upload'],
            ['PUT', '/api/dashboard/rename'],
            ['DELETE', '/api/dashboard/delete'],
        ]) {
            const res = await call(method, p, method === 'GET' ? undefined : {});
            assert.equal(res.status, 404, `${method} ${p} must not exist under /api/dashboard`);
        }
    });
});

describe('every served page is honest and functional', () => {
    const FORBIDDEN = [
        'Sarah Chen', '24.8K', '12.4 GB', 'Linux Admin',
        'All systems operational', '342 GB of 500', '>SC<',
    ];
    const PAGES = ['/', '/files.html', '/uploads.html', '/settings.html'];

    for (const p of PAGES) {
        test(`GET ${p} serves with no fabricated value`, async () => {
            const res = await call('GET', p);

            assert.equal(res.status, 200, `${p} did not serve`);
            // Strip HTML comments before scanning. settings.html documents some of its
            // own removals inline, and a comment is never rendered, so scanning the raw
            // body would report a false positive.
            const rendered = res.body.replace(/<!--[\s\S]*?-->/g, '');
            const found = FORBIDDEN.filter((f) => rendered.includes(f));
            assert.deepEqual(found, [], `${p} still contains fabrications`);
        });
    }

    // Capability claims the Settings page used to make for subsystems this build
    // does not have. Scoped to /settings.html on purpose: "Transfer" is honest
    // copy on the Uploads page ("follow each transfer live"), so a cross-page
    // scan for it would report a false positive there.
    const SETTINGS_FORBIDDEN = [
        'ClamAV', 'AES-256', 'Two-factor', 'Google Drive', 'Dropbox', 'Slack',
        'webhook', 'Empty trash', 'Revoke all', 'Transfer', 'Delete workspace',
        'Linux disk', 'Auto-purge', 'Deduplication', 'Auto-organize',
    ];

    test('GET /settings.html serves with no fabricated capability', async () => {
        const res = await call('GET', '/settings.html');

        assert.equal(res.status, 200, '/settings.html did not serve');
        const rendered = res.body.replace(/<!--[\s\S]*?-->/g, '');
        const found = SETTINGS_FORBIDDEN.filter((f) => rendered.includes(f));
        assert.deepEqual(found, [], '/settings.html still claims capabilities this build does not have');
    });

    test('every script the dashboard page references actually parses', async () => {
        const page = (await call('GET', '/')).body;
        const sources = [...page.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);

        assert.ok(sources.length > 0, 'the page references scripts');

        for (const src of sources) {
            const file = path.join(__dirname, '..', '..', 'public', src.replace(/^\/+/, ''));
            assert.ok(fs.existsSync(file), `${src} is referenced but missing`);
            // A syntax error would kill the page silently.
            assert.doesNotThrow(
                () => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }),
                `${src} does not parse`
            );
        }
    });

    test('every script the settings page references actually parses', async () => {
        const page = (await call('GET', '/settings.html')).body;
        const sources = [...page.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);

        assert.ok(sources.length > 0, 'the page references scripts');

        for (const src of sources) {
            const file = path.join(__dirname, '..', '..', 'public', src.replace(/^\/+/, ''));
            assert.ok(fs.existsSync(file), `${src} is referenced but missing`);
            assert.doesNotThrow(
                () => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }),
                `${src} does not parse`
            );
        }
    });

    test('the dashboard does not ship the removed historical affordances', async () => {
        const page = (await call('GET', '/')).body;
        const js = fs.readFileSync(
            path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'dashboard.js'), 'utf8'
        );

        for (const gone of ['trafficChart', 'chartLegend', 'stat-spark', 'stat-trend']) {
            assert.ok(!page.includes(gone), `${gone} still present in the page`);
            assert.ok(!js.includes(gone), `${gone} still present in dashboard.js`);
        }
    });
});