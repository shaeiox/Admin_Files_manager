// test/api/settings.contract.test.js
'use strict';

/**
 * Settings HTTP contract, exercised against a LIVE server
 * (settings-page-correctness, tasks 2.1-2.3).
 *
 * What is pinned here:
 *   - GET  /api/settings  -> 200 with a BARE object (read-only aggregate
 *     precedent: tree/list/summary/health/capability), never an envelope.
 *   - PUT  /api/settings  -> 200 with `{ success: true, settings }` (mutating
 *     precedent), and the read-back is byte-for-byte the normalized document.
 *   - Every rejected PUT answers 400 `{ success: false, error }` AND leaves the
 *     store BYTE-IDENTICAL - a refusal that half-writes is the real defect.
 *   - No destructive endpoint exists: POST /api/settings/action is 404 from the
 *     /api catch-all.
 *
 * Isolation: STORAGE_ROOT is redirected to a temp directory and
 * SettingsService.dbPath is re-pointed BEFORE server.js is required, so the
 * suite never writes the repository's data/settings.json (repo test-isolation
 * rule, AGENTS.md "Essential Commands"). The service singleton's in-memory cache
 * is cleared too, because the live server shares the module instance.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-settings-api-'));
const ROOT = path.join(TMP, 'root');
const SETTINGS_PATH = path.join(TMP, 'settings.json');

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
fs.mkdirSync(ROOT, { recursive: true });

// Required BEFORE server.js, which pulls in the settings router -> service.
const SettingsService = require('../../src/services/SettingsService');
SettingsService.dbPath = SETTINGS_PATH;
SettingsService.cache = null;

let server;
let port;

/* ── transport helpers (same shape as fs.contract.test.js) ── */

function send(method, pathname, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...headers };
        if (body !== undefined) finalHeaders['Content-Length'] = Buffer.byteLength(body);
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, agent: false, headers: finalHeaders },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    let json = null;
                    try { json = JSON.parse(buffer.toString('utf8')); } catch { /* not JSON */ }
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

/** Raw bytes of the store, or null when it does not exist. */
function storeBytes() {
    return fs.existsSync(SETTINGS_PATH) ? fs.readFileSync(SETTINGS_PATH, 'utf8') : null;
}

/** Puts the store into a known state so a refusal can be proven inert. */
async function seed() {
    const saved = {
        general: { workspaceName: 'Seed Console', defaultUploadFolder: '/seed' },
        appearance: { defaultView: 'list' },
    };
    SettingsService.cache = null;
    fs.rmSync(SETTINGS_PATH, { force: true });
    await SettingsService.replace(saved);
    return saved;
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

/* ══════════════════════════════════════════
   MOUNT ORDER
   ══════════════════════════════════════════ */

describe('mount order (the /admin catch-all terminates the chain)', () => {
    test('GET /admin/settings is not swallowed by the 404 catch-all', async () => {
        const res = await send('GET', '/admin/settings');
        assert.notEqual(res.status, 404,
            'the settings router must be mounted BEFORE the /admin catch-all');
        assert.equal(res.status, 200);
    });

    test('POST /admin/settings/action does not exist - no destructive settings endpoint', async () => {
        const res = await sendJson('POST', '/admin/settings/action', { action: 'deleteWorkspace' });
        assert.equal(res.status, 404);
        assert.equal(res.json.success, false);
        assert.match(res.json.error, /not found/i);
    });
});

/* ══════════════════════════════════════════
   GET /api/settings - BARE read (design D3)
   ══════════════════════════════════════════ */

describe('GET /admin/settings', () => {
    test('answers 200 with the bare settings object and NO envelope', async () => {
        const res = await send('GET', '/admin/settings');
        assert.equal(res.status, 200);
        assert.match(res.headers['content-type'], /application\/json/);

        assert.equal('success' in res.json, false,
            'a read-only aggregate is bare; a success envelope would be a contract break');
        assert.equal('data' in res.json, false);
        assert.equal(typeof res.json, 'object');
        assert.ok(!Array.isArray(res.json));

        assert.deepEqual(Object.keys(res.json).sort(), ['appearance', 'general'],
            'exactly the documented sections - nothing extra');
        assert.deepEqual(Object.keys(res.json.general).sort(),
            ['defaultUploadFolder', 'workspaceName']);
        assert.deepEqual(Object.keys(res.json.appearance), ['defaultView']);
    });

    test('materializes the documented defaults on a first read of an empty store', async () => {
        SettingsService.cache = null;
        fs.rmSync(SETTINGS_PATH, { force: true });

        const res = await send('GET', '/admin/settings');
        assert.equal(res.status, 200);
        assert.deepEqual(res.json, {
            general: { workspaceName: null, defaultUploadFolder: null },
            appearance: { defaultView: null },
        });
        assert.deepEqual(JSON.parse(storeBytes()), res.json,
            'the defaults were written to the store, not only returned');
    });

    test('reflects what PUT last persisted', async () => {
        const saved = await seed();
        const res = await send('GET', '/admin/settings');
        assert.equal(res.status, 200);
        assert.deepEqual(res.json, saved);
    });
});

/* ══════════════════════════════════════════
   PUT /api/settings - ENVELOPED full replace (design D3/D4)
   ══════════════════════════════════════════ */

describe('PUT /admin/settings with a valid full document', () => {
    test('answers 200 with { success: true, settings } and the persisted document', async () => {
        await seed();
        const doc = {
            general: { workspaceName: 'Ops Console', defaultUploadFolder: '/inbox/daily' },
            appearance: { defaultView: 'grid' },
        };

        const res = await sendJson('PUT', '/admin/settings', doc);
        assert.equal(res.status, 200);
        assert.equal(res.json.success, true);
        assert.deepEqual(res.json.settings, doc, 'the write echoes the persisted document');
    });

    test('a subsequent GET reads back exactly what was written', async () => {
        const doc = {
            general: { workspaceName: 'Round Trip', defaultUploadFolder: '/inbox' },
            appearance: { defaultView: 'grid' },
        };
        await sendJson('PUT', '/admin/settings', doc);

        const read = await send('GET', '/admin/settings');
        assert.equal(read.status, 200);
        assert.deepEqual(read.json, doc, 'read-back equality');
        assert.deepEqual(JSON.parse(storeBytes()), doc, 'and the store itself');
    });

    test('normalizes through the validator: trimmed name, "" becomes null', async () => {
        await seed();
        const res = await sendJson('PUT', '/admin/settings', {
            general: { workspaceName: '   ', defaultUploadFolder: null },
            appearance: { defaultView: null },
        });
        assert.equal(res.status, 200);
        assert.equal(res.json.settings.general.workspaceName, null,
            'a whitespace-only name is the explicit unset state');
    });

    test('a full replace drops nothing but is not a merge: omitted keys are rejected', async () => {
        const before = await seed();
        const res = await sendJson('PUT', '/admin/settings', {
            general: { workspaceName: 'Partial', defaultUploadFolder: null },
        });
        assert.equal(res.status, 400);
        assert.equal(storeBytes(), JSON.stringify(before, null, 2),
            'the partial document never reached disk');
    });
});

/* ══════════════════════════════════════════
   PUT refusals - 400 envelope AND a byte-identical store
   ══════════════════════════════════════════ */

describe('PUT /admin/settings refuses invalid documents without writing', () => {
    /** Seeds, runs the PUT, and asserts both halves of the refusal contract. */
    async function assertRefused(payload, label) {
        const before = storeBytes();
        const res = await sendJson('PUT', '/admin/settings', payload);

        assert.equal(res.status, 400, `${label}: status`);
        assert.equal(res.json.success, false, `${label}: envelope success`);
        assert.equal(typeof res.json.error, 'string', `${label}: envelope error`);
        assert.ok(res.json.error.length > 0, `${label}: non-empty error`);
        assert.equal('settings' in res.json, false, `${label}: no document echoed`);
        assert.equal(storeBytes(), before, `${label}: store byte-identical`);
        return res;
    }

    test('an unknown top-level section is rejected', async () => {
        await seed();
        await assertRefused({
            general: { workspaceName: null, defaultUploadFolder: null },
            appearance: { defaultView: null },
            dangerZone: { deleteWorkspace: true },
        }, 'unknown section');
    });

    test('an unknown key inside general is rejected', async () => {
        await seed();
        await assertRefused({
            general: { workspaceName: null, defaultUploadFolder: null, language: 'en' },
            appearance: { defaultView: null },
        }, 'unknown general key');
    });

    test('an unknown key inside appearance is rejected', async () => {
        await seed();
        await assertRefused({
            general: { workspaceName: null, defaultUploadFolder: null },
            appearance: { defaultView: null, density: 'compact' },
        }, 'unknown appearance key');
    });

    test('a wrong type is rejected', async () => {
        await seed();
        await assertRefused({
            general: { workspaceName: 42, defaultUploadFolder: null },
            appearance: { defaultView: null },
        }, 'numeric workspaceName');

        await assertRefused({
            general: { workspaceName: null, defaultUploadFolder: null },
            appearance: { defaultView: 7 },
        }, 'numeric defaultView');

        await assertRefused({
            general: { workspaceName: null, defaultUploadFolder: 42 },
            appearance: { defaultView: null },
        }, 'numeric defaultUploadFolder');

        await assertRefused('not-a-document', 'string document');
    });

    test('a defaultView outside the enum is rejected', async () => {
        await seed();
        await assertRefused({
            general: { workspaceName: null, defaultUploadFolder: null },
            appearance: { defaultView: 'cards' },
        }, 'out-of-enum defaultView');
    });

    test('an over-long workspaceName is rejected at 60 characters', async () => {
        await seed();
        await assertRefused({
            general: { workspaceName: 'a'.repeat(61), defaultUploadFolder: null },
            appearance: { defaultView: null },
        }, 'over-long workspaceName');
    });

    test('a traversal defaultUploadFolder is rejected', async () => {
        await seed();
        for (const bad of ['/../etc', '..', 'C:\\x', '/a/../b', 'inbox', '']) {
            await assertRefused({
                general: { workspaceName: null, defaultUploadFolder: bad },
                appearance: { defaultView: null },
            }, `folder ${JSON.stringify(bad)}`);
        }
    });

    test('a refusal message carries no host path or stack detail', async () => {
        await seed();
        const before = storeBytes();
        const res = await sendJson('PUT', '/admin/settings', {
            general: { workspaceName: null, defaultUploadFolder: '/../../etc' },
            appearance: { defaultView: null },
        });
        assert.equal(res.status, 400);
        assert.ok(!res.json.error.includes(TMP), 'no temp path leaks');
        assert.ok(!/[A-Za-z]:[\\/]/.test(res.json.error), 'no drive letter leaks');
        assert.ok(!res.json.error.includes('    at '), 'no stack frames');
        assert.equal(storeBytes(), before);
    });

    test('an invalid FIRST write leaves no store file behind at all', async () => {
        SettingsService.cache = null;
        fs.rmSync(SETTINGS_PATH, { force: true });

        const res = await sendJson('PUT', '/admin/settings', {
            general: { workspaceName: null, defaultUploadFolder: '/../../etc' },
            appearance: { defaultView: null },
        });
        assert.equal(res.status, 400);
        assert.equal(fs.existsSync(SETTINGS_PATH), false,
            'validation precedes the bootstrap write, so nothing is created');
    });

    test('a PUT with no body at all is refused, not crashed on', async () => {
        await seed();
        const before = storeBytes();

        const res = await send('PUT', '/admin/settings');
        assert.equal(res.status, 400);
        assert.equal(res.json.success, false);
        assert.equal(storeBytes(), before);
    });

    test('a malformed JSON body is a client 400, never a server 500', async () => {
        await seed();
        const before = storeBytes();

        const res = await send('PUT', '/admin/settings', {
            body: '{ not json',
            headers: { 'Content-Type': 'application/json' },
        });
        assert.equal(res.status, 400, 'a body-parser failure is not an internal error');
        assert.equal(res.json.success, false);
        assert.ok(!res.json.error.includes('    at '), 'no stack frames leak');
        assert.equal(storeBytes(), before);
    });
});

/* ══════════════════════════════════════════
   TASK 2.3 - the settings layer resolves no paths
   ══════════════════════════════════════════ */

describe('the settings layer never resolves client paths (design D7, task 2.3)', () => {
    const ROOT_DIR = path.join(__dirname, '..', '..');
    // Resolved eagerly: the assertions below must not depend on test order.
    const SOURCES = {
        'src/services/SettingsService.js': path.join(ROOT_DIR, 'src', 'services', 'SettingsService.js'),
        'src/controllers/settings.controller.js': path.join(ROOT_DIR, 'src', 'controllers', 'settings.controller.js'),
    };

    /** Strips comments so a prohibition is never satisfied by prose in a docblock. */
    const codeOf = (file) => {
        assert.ok(fs.existsSync(file), `${file} must exist`);
        return fs.readFileSync(file, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
    };

    for (const rel of Object.keys(SOURCES)) {
        test(`${rel} exists`, () => {
            assert.ok(fs.existsSync(SOURCES[rel]), `${rel} must exist`);
        });
    }

    test('neither source requires PathService', () => {
        for (const [rel, file] of Object.entries(SOURCES)) {
            assert.doesNotMatch(codeOf(file), /require\([^)]*PathService/,
                `${rel} must not import PathService (rule 2: it is the only resolution boundary)`);
            assert.doesNotMatch(codeOf(file), /resolveSecurePath/,
                `${rel} must not resolve a client path`);
        }
    });

    test('only SettingsService imports fs, and only for its own store file', () => {
        const controller = codeOf(SOURCES['src/controllers/settings.controller.js']);
        assert.doesNotMatch(controller, /require\((['"])fs(\/promises)?\1\)/,
            'the controller touches no filesystem at all');
        assert.doesNotMatch(controller, /readFile|writeFile|mkdir|rename|readdir|rm\(/,
            'the controller performs no filesystem operation');

        const service = codeOf(SOURCES['src/services/SettingsService.js']);
        const fsCalls = [...service.matchAll(/\bfs\.(mkdir|readFile|writeFile|rename|rm|readdir|stat|unlink|appendFile)\b/g)]
            .map((m) => m[1]);
        assert.deepEqual([...new Set(fsCalls)].sort(), ['mkdir', 'readFile', 'rename', 'writeFile'],
            `unexpected fs surface in the service: ${[...new Set(fsCalls)].join(', ')}`);

        // Locals derived from the store path (the atomic-write temp file) are
        // legitimate targets; a path built from anything else is not. Every
        // derivation must trace back to this.dbPath.
        const derived = new Set(['this.dbPath']);
        for (const m of service.matchAll(/const\s+(\w+)\s*=\s*`\$\{this\.dbPath\}([^`]*)`/g)) {
            derived.add(m[1]);
        }
        assert.ok(derived.has('tempPath') || derived.size === 1,
            'the temp-file alias must be derived from this.dbPath, not constructed');

        for (const line of service.split('\n')) {
            const call = line.match(/\bfs\.(mkdir|readFile|writeFile|rename)\(([^,]*),?/);
            if (!call) continue;
            const target = call[2].trim();
            // Permitted: this.dbPath, its parent directory (the D6 recursive
            // mkdir), or a local alias derived from this.dbPath (tempPath).
            const tracesToStore = target.includes('this.dbPath')
                || [...derived].some((name) => target === name);
            assert.ok(tracesToStore,
                `fs call must target the store path or a path derived from it, found: ${line.trim()}`);
        }
    });
});
