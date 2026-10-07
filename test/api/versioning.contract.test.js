// test/api/versioning.contract.test.js
'use strict';

/**
 * Versioned API namespace, exercised against a LIVE server
 * (api-v1-versioning-and-boundary, tasks 1.1-1.3, 2.3-2.4, 5.1-5.5).
 *
 * What is pinned here:
 *   - Every documented endpoint answers on BOTH /api/v1/* and /api/* with the
 *     same status and the same response shape (one assembly, two prefixes).
 *   - /api/v1/health reports API version 1 and keeps the liveness fields.
 *   - An unknown version (/api/v2, /api/V1) is refused with the JSON 404
 *     envelope - never served by v1, never answered with the SPA shell.
 *   - No filesystem route is reachable under either dashboard prefix, and the
 *     versioned filesystem prefix serves only the filesystem's own routes.
 *   - Every error on the versioned prefix is the { success: false, error }
 *     envelope, discloses nothing, and carries no `kind` (reserved, not emitted).
 *
 * Isolation: STORAGE_ROOT, MetadataService.dbPath and SettingsService.dbPath
 * (plus both caches) are redirected to a temp tree BEFORE server.js is required,
 * so the suite never writes the repository's data/*.json (AGENTS.md).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-versioning-'));
const ROOT = path.join(TMP, 'root');
const SETTINGS_PATH = path.join(TMP, 'settings.json');
const REPO = path.join(__dirname, '..', '..');

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
fs.mkdirSync(path.join(ROOT, 'sub'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'notes.txt'), 'NOTES');
fs.writeFileSync(path.join(ROOT, 'a.png'), 'PNG-BYTES');

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;
const SettingsService = require('../../src/services/SettingsService');
SettingsService.dbPath = SETTINGS_PATH;
SettingsService.cache = null;

const NOT_FOUND = { success: false, error: 'API endpoint not found' };
const PREFIXES = ['/admin/v1', '/admin'];

let server;
let port;

/* ── transport ── */

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
                    const text = buffer.toString('utf8');
                    let json = null;
                    try { json = JSON.parse(text); } catch { /* not JSON */ }
                    resolve({ status: res.statusCode, headers: res.headers, buffer, text, json });
                });
            }
        );
        req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

const sendJson = (method, pathname, payload) => send(method, pathname, {
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' },
});

function postMultipart(pathname, parts) {
    const boundary = `----afmver${Date.now().toString(16)}`;
    const CRLF = '\r\n';
    const chunks = [];
    for (const part of parts) {
        if (part.filename !== undefined) {
            chunks.push(Buffer.from(
                `--${boundary}${CRLF}Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"${CRLF}` +
                `Content-Type: application/octet-stream${CRLF}${CRLF}`));
            chunks.push(Buffer.from(part.content));
            chunks.push(Buffer.from(CRLF));
        } else {
            chunks.push(Buffer.from(
                `--${boundary}${CRLF}Content-Disposition: form-data; name="${part.name}"${CRLF}${CRLF}${part.value}${CRLF}`));
        }
    }
    chunks.push(Buffer.from(`--${boundary}--${CRLF}`));
    return send('POST', pathname, {
        body: Buffer.concat(chunks),
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    });
}

/**
 * The type skeleton of a JSON value: what "same response shape" means when a
 * value legitimately moves between two calls (uptime, free memory).
 */
function shapeOf(value) {
    if (Array.isArray(value)) return value.map(shapeOf);
    if (value === null) return 'null';
    if (typeof value === 'object') {
        return Object.fromEntries(Object.keys(value).sort().map((k) => [k, shapeOf(value[k])]));
    }
    return typeof value;
}

/** An error body: the envelope, nothing more, nothing disclosed. */
function assertErrorEnvelope(res, where) {
    assert.ok(res.json, `${where}: the error body is JSON, not ${res.text.slice(0, 60)}`);
    assert.match(res.headers['content-type'] || '', /application\/json/, `${where}: JSON content type`);
    assert.deepEqual(Object.keys(res.json).sort(), ['error', 'success'], `${where}: envelope keys only`);
    assert.equal(res.json.success, false, where);
    assert.equal(typeof res.json.error, 'string', where);
    assert.ok(res.json.error.length > 0, `${where}: non-empty message`);
    assert.ok(!('kind' in res.json), `${where}: kind is reserved, not emitted`);
    assertDiscloses(res, where);
}

/** No stack, no on-disk path, no drive letter, no raw errno text. */
function assertDiscloses(res, where) {
    const body = res.text;
    assert.ok(!body.includes(ROOT) && !body.includes(TMP), `${where}: no storage path`);
    assert.ok(!body.includes(REPO), `${where}: no repository path`);
    assert.ok(!/[A-Za-z]:[\\/]/.test(body), `${where}: no drive letter`);
    // A backslash in a JSON body is serialised as `\\`; none belongs in an authored message.
    assert.ok(!body.includes('\\\\'), `${where}: no UNC prefix or backslash-separated path`);
    assert.ok(!/\n\s+at |"stack"/.test(body), `${where}: no stack trace`);
    assert.ok(!/\bE(NOENT|ACCES|PERM|ISDIR|NOTDIR|EXIST|NOTEMPTY|BUSY)\b|errno|syscall/.test(body),
        `${where}: no raw system error`);
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
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
   1.1 — both prefixes serve every documented endpoint
   ══════════════════════════════════════════ */

describe('the versioned namespace (api-versioning)', () => {
    test('GET /admin/v1/fs/list is reachable and is the listing payload', async () => {
        const res = await send('GET', '/api/v1/fs/list?path=/');
        assert.equal(res.status, 200);
        assert.notDeepEqual(res.json, NOT_FOUND);
        assert.ok(Array.isArray(res.json.items));
        assert.equal(typeof res.json.total, 'number');
    });

    test('every read endpoint answers identically on /admin/v1 and /admin', async () => {
        for (const endpoint of [
            '/health',
            '/fs/tree',
            '/fs/list?path=/',
            '/fs/list?path=/sub',
            '/fs/thumbnail/capability',
            '/dashboard/summary',
            '/dashboard/health',
            '/settings',
        ]) {
            const v1 = await send('GET', `/admin/v1${endpoint}`);
            const legacy = await send('GET', `/admin${endpoint}`);
            assert.equal(v1.status, 200, `/admin/v1${endpoint} -> ${v1.status} ${v1.text.slice(0, 80)}`);
            assert.equal(v1.status, legacy.status, `${endpoint}: same status`);
            assert.deepEqual(shapeOf(v1.json), shapeOf(legacy.json), `${endpoint}: same shape`);
        }
    });

    test('state-free reads are byte-identical across prefixes', async () => {
        for (const endpoint of ['/fs/tree', '/fs/list?path=/', '/fs/thumbnail/capability', '/settings']) {
            const v1 = await send('GET', `/admin/v1${endpoint}`);
            const legacy = await send('GET', `/admin${endpoint}`);
            assert.equal(v1.text, legacy.text, `${endpoint}: byte-identical body`);
        }
    });

    test('a file download streams the same bytes on both prefixes', async () => {
        for (const prefix of PREFIXES) {
            const res = await send('GET', `${prefix}/fs/download?path=%2Fnotes.txt`);
            assert.equal(res.status, 200, prefix);
            assert.equal(res.buffer.toString(), 'NOTES', prefix);
            assert.match(res.headers['content-type'], /application\/octet-stream/, prefix);
        }
    });

    test('a ZIP download is served on both prefixes', async () => {
        for (const prefix of PREFIXES) {
            const body = new URLSearchParams({ paths: JSON.stringify(['/notes.txt']) }).toString();
            const res = await send('POST', `${prefix}/fs/download-zip`, {
                body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            });
            assert.equal(res.status, 200, prefix);
            assert.equal(res.buffer.subarray(0, 2).toString(), 'PK', `${prefix}: a ZIP stream`);
        }
    });

    test('POST /admin/v1/fs/star returns the same envelope as POST /admin/fs/star', async () => {
        const v1 = await sendJson('POST', '/admin/v1/fs/star', { path: '/notes.txt', starred: true });
        const legacy = await sendJson('POST', '/admin/fs/star', { path: '/notes.txt', starred: true });
        assert.equal(v1.status, 200);
        assert.equal(v1.status, legacy.status);
        assert.deepEqual(v1.json, { success: true, data: { path: '/notes.txt', starred: true } });
        assert.deepEqual(v1.json, legacy.json, 'byte-compatible mutation envelope');
        await sendJson('POST', '/admin/v1/fs/star', { path: '/notes.txt', starred: false });
    });

    test('folder, upload, rename and delete round-trip on both prefixes with one shape', async () => {
        const shapes = {};
        for (const prefix of PREFIXES) {
            const tag = prefix === '/admin' ? 'legacy' : 'v1';

            const folder = await sendJson('POST', `${prefix}/fs/folder`, { path: `/dir-${tag}` });
            assert.equal(folder.status, 201, `${prefix} folder -> ${folder.text}`);
            assert.ok(fs.existsSync(path.join(ROOT, `dir-${tag}`)));

            const upload = await postMultipart(`${prefix}/fs/upload`, [
                { name: 'destination', value: `/dir-${tag}` },
                { name: 'overwrite', value: 'false' },
                { name: 'file', filename: 'up.txt', content: tag },
            ]);
            assert.equal(upload.status, 201, `${prefix} upload -> ${upload.text}`);
            assert.equal(fs.readFileSync(path.join(ROOT, `dir-${tag}`, 'up.txt'), 'utf8'), tag);

            const rename = await sendJson('PUT', `${prefix}/fs/rename`, { oldPath: `/dir-${tag}/up.txt`, newName: 'moved.txt' });
            assert.equal(rename.status, 200, `${prefix} rename -> ${rename.text}`);
            assert.ok(fs.existsSync(path.join(ROOT, `dir-${tag}`, 'moved.txt')));

            const del = await sendJson('DELETE', `${prefix}/fs/delete`, { paths: [`/dir-${tag}`] });
            assert.equal(del.status, 200, `${prefix} delete -> ${del.text}`);
            assert.equal(fs.existsSync(path.join(ROOT, `dir-${tag}`)), false);

            shapes[tag] = [folder, upload, rename, del].map((r) => [r.status, shapeOf(r.json)]);
        }
        assert.deepEqual(shapes.v1, shapes.legacy, 'every mutation has one status and one shape on both prefixes');
    });

    test('PUT /admin/v1/settings round-trips exactly as PUT /admin/settings', async () => {
        const current = (await send('GET', '/admin/v1/settings')).json;
        const v1 = await sendJson('PUT', '/admin/v1/settings', current);
        const legacy = await sendJson('PUT', '/admin/settings', current);
        assert.equal(v1.status, 200, v1.text);
        assert.deepEqual(v1.json, legacy.json);
    });

    test('a rejected request fails identically on both prefixes', async () => {
        for (const [method, endpoint, payload] of [
            ['GET', '/fs/list?path=/does-not-exist'],
            ['GET', '/fs/list?path=/..%2F..'],
            ['POST', '/fs/folder', { path: '/CON' }],
            ['PUT', '/settings', { nope: true }],
        ]) {
            const v1 = payload ? await sendJson(method, `/admin/v1${endpoint}`, payload) : await send(method, `/admin/v1${endpoint}`);
            const legacy = payload ? await sendJson(method, `/admin${endpoint}`, payload) : await send(method, `/admin${endpoint}`);
            assert.ok(v1.status >= 400, `${endpoint} fails`);
            assert.equal(v1.status, legacy.status, `${endpoint}: same status`);
            assert.deepEqual(v1.json, legacy.json, `${endpoint}: same envelope`);
        }
    });
});

describe('the version is discoverable', () => {
    test('GET /admin/v1/health reports API version 1 and keeps the liveness fields', async () => {
        const res = await send('GET', '/admin/v1/health');
        assert.equal(res.status, 200);
        assert.equal(res.json.apiVersion, 1);
        assert.equal(res.json.success, true);
        assert.equal(res.json.message, 'Dimension API is running');
        // `env` was removed by api-security-hardening: an unauthenticated caller
        // is no longer told which environment it is talking to. `apiVersion` is
        // the additive field ADR-007 added and is the deployment gate; it stays.
        assert.ok(!('env' in res.json), 'the runtime environment is no longer disclosed');
        assert.ok(!('environment' in res.json), 'and is not disclosed under another name');
    });

    test('the reported version equals the requested version segment', async () => {
        const res = await send('GET', '/admin/v1/health');
        assert.equal(`v${res.json.apiVersion}`, '/admin/v1/health'.split('/')[2]);
    });

    test('the legacy alias is the v1 contract and says so', async () => {
        const res = await send('GET', '/admin/health');
        assert.equal(res.json.apiVersion, 1);
    });
});

describe('an unknown version is refused (api-versioning)', () => {
    test('GET /admin/v2/fs/list is the JSON 404 envelope - no listing is performed', async () => {
        const res = await send('GET', '/admin/v2/fs/list?path=/');
        assert.equal(res.status, 404);
        assert.deepEqual(res.json, NOT_FOUND, 'the catch-all, not a listing');
        assert.ok(!('items' in res.json));
    });

    test('an unknown version is not answered with the SPA shell', async () => {
        const res = await send('GET', '/admin/v2/fs/list');
        assert.match(res.headers['content-type'], /application\/json/);
        assert.ok(!/<html|<!DOCTYPE/i.test(res.text));
    });

    test('a version segment differing in case is refused, not resolved to v1', async () => {
        for (const p of ['/admin/V1/fs/list?path=/', '/admin/V1/health']) {
            const res = await send('GET', p);
            assert.equal(res.status, 404, p);
            assert.deepEqual(res.json, NOT_FOUND, p);
        }
    });

    test('unknown paths under the versioned prefix reach the catch-all', async () => {
        for (const p of ['/admin/v1/fs/does-not-exist', '/admin/v1/nope', '/admin/v1/v1/health', '/admin/v1']) {
            const res = await send('GET', p);
            assert.equal(res.status, 404, p);
            assert.deepEqual(res.json, NOT_FOUND, p);
        }
    });

    test('unknown versioned Dashboard paths reach the catch-all', async () => {
        const res = await send('GET', '/admin/v1/dashboard/does-not-exist');
        assert.equal(res.status, 404);
        assert.deepEqual(res.json, NOT_FOUND);
    });
});

/* ══════════════════════════════════════════
   1.2 — a second prefix republishes nothing
   ══════════════════════════════════════════ */

describe('no filesystem route under any dashboard prefix (security)', () => {
    const FS_ROUTES = [
        ['POST', 'upload'], ['PUT', 'rename'], ['DELETE', 'delete'], ['POST', 'folder'],
        ['POST', 'star'], ['GET', 'download?path=%2Fnotes.txt'], ['POST', 'download-zip'],
        ['GET', 'thumbnail?path=%2Fa.png'], ['GET', 'thumbnail/capability'], ['GET', 'tree'], ['GET', 'list?path=/'],
    ];

    for (const prefix of ['/admin/v1/dashboard', '/admin/dashboard']) {
        test(`${prefix} serves no filesystem route`, async () => {
            for (const [method, route] of FS_ROUTES) {
                const res = method === 'GET'
                    ? await send(method, `${prefix}/${route}`)
                    : await sendJson(method, `${prefix}/${route}`, { path: '/notes.txt', oldPath: '/notes.txt', paths: ['/notes.txt'], newName: 'y' });
                assert.equal(res.status, 404, `${method} ${prefix}/${route} -> ${res.status}`);
                assert.deepEqual(res.json, NOT_FOUND, `${method} ${prefix}/${route}`);
            }
            assert.ok(fs.existsSync(path.join(ROOT, 'notes.txt')), 'nothing was deleted or renamed');
        });
    }

    test('/admin/v1/fs serves only the filesystem resource\'s own routes', async () => {
        for (const p of ['/admin/v1/fs/summary', '/admin/v1/fs/health', '/admin/v1/fs/settings', '/admin/v1/fs/dashboard/summary']) {
            const res = await send('GET', p);
            assert.equal(res.status, 404, p);
            assert.deepEqual(res.json, NOT_FOUND, p);
        }
    });

    test('settings exposes no destructive route under the versioned prefix', async () => {
        for (const [method, p] of [['POST', '/admin/v1/settings/action'], ['DELETE', '/admin/v1/settings'], ['POST', '/admin/v1/settings']]) {
            const res = await send(method, p);
            assert.equal(res.status, 404, `${method} ${p}`);
        }
    });
});

/* ══════════════════════════════════════════
   1.3 — the error contract on the versioned prefix
   ══════════════════════════════════════════ */

describe('the error contract on /admin/v1 (api-error-contract)', () => {
    test('every error path is the envelope, discloses nothing, and carries no kind', async () => {
        const cases = [
            [404, () => send('GET', '/admin/v1/nope')],
            [404, () => send('GET', '/admin/v1/fs/list?path=/does-not-exist')],
            [403, () => send('GET', '/admin/v1/fs/list?path=/..%2F..%2F..')],
            [400, () => sendJson('POST', '/admin/v1/fs/folder', { path: '/bad<name' })],
            [404, () => send('GET', '/admin/v1/fs/download?path=%2Fmissing.bin')],
            [400, () => sendJson('PUT', '/admin/v1/fs/rename', { oldPath: '/notes.txt', newName: '../x' })],
            [409, () => sendJson('POST', '/admin/v1/fs/folder', { path: '/sub' })],
            [400, () => sendJson('PUT', '/admin/v1/settings', { general: 'nope' })],
        ];
        for (const [status, run] of cases) {
            const res = await run();
            assert.equal(res.status, status, `${status}: got ${res.status} ${res.text}`);
            assertErrorEnvelope(res, `${status}`);
        }
    });

    test('a malformed JSON body does not relay the parser\'s own text', async () => {
        const res = await send('PUT', '/admin/v1/settings', {
            body: '{ not json', headers: { 'Content-Type': 'application/json' },
        });
        assert.equal(res.status, 400);
        assertErrorEnvelope(res, 'malformed JSON');
        assert.ok(!/Unexpected|JSON|position|token/i.test(res.json.error), `parser text relayed: ${res.json.error}`);
    });

    test('a corrupt settings store yields a static message, never parse detail', async (t) => {
        const original = fs.existsSync(SETTINGS_PATH) ? fs.readFileSync(SETTINGS_PATH) : null;
        t.after(() => {
            if (original) fs.writeFileSync(SETTINGS_PATH, original);
            else fs.rmSync(SETTINGS_PATH, { force: true });
            SettingsService.cache = null;
        });
        fs.writeFileSync(SETTINGS_PATH, '{ "general": ');
        SettingsService.cache = null;

        const res = await send('GET', '/admin/v1/settings');
        assert.equal(res.status, 500);
        assertErrorEnvelope(res, 'corrupt store');
        assert.equal(res.json.error, 'Settings store could not be read');
    });

    test('kind is absent today, and its absence is a well-formed envelope', async () => {
        const res = await send('GET', '/admin/v1/fs/list?path=/does-not-exist');
        assert.equal(res.json.success, false);
        assert.equal(res.json.kind, undefined);
    });

    test('src/ emits no kind token (reserved, not populated)', () => {
        const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
        for (const file of walk(path.join(REPO, 'src')).filter((f) => f.endsWith('.js'))) {
            const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
            assert.ok(!/\bkind\s*:/.test(code), `${path.relative(REPO, file)} emits a kind`);
        }
    });
});

/* ══════════════════════════════════════════
   5.1 / 5.2 / 5.5 — one implementation, no new capability
   ══════════════════════════════════════════ */

/** (method, path) pairs declared by the route modules, relative to the API prefix. */
function declaredEndpoints() {
    const read = (f) => fs.readFileSync(path.join(REPO, 'src', 'routes', f), 'utf8');
    const decls = (src) => [...src.matchAll(/router\.(get|post|put|delete)\(\s*'([^']*)'/g)]
        .map(([, m, p]) => [m.toUpperCase(), p]);
    const mounted = (prefix, file) => decls(read(file)).map(([m, p]) => `${m} ${prefix}${p === '/' ? '' : p}`);
    return [
        ...decls(read('api.js')).map(([m, p]) => `${m} ${p}`),
        ...mounted('/fs', 'fs.routes.js'),
        ...mounted('/dashboard', 'dashboard.routes.js'),
        ...mounted('/settings', 'settings.routes.js'),
    ].sort();
}

describe('the two prefixes are one implementation (legacy-api-compatibility)', () => {
    const EXPECTED = [
        'DELETE /fs/delete',
        'GET /dashboard/health',
        'GET /dashboard/summary',
        'GET /fs/download',
        'GET /fs/list',
        'GET /fs/thumbnail',
        'GET /fs/thumbnail/capability',
        'GET /fs/tree',
        'GET /health',
        'GET /settings',
        'POST /fs/download-zip',
        'POST /fs/folder',
        'POST /fs/star',
        'POST /fs/upload',
        'PUT /fs/rename',
        'PUT /settings',
    ];

    test('the served endpoint set is exactly the pre-change set - nothing added, removed or renamed', () => {
        assert.deepEqual(declaredEndpoints(), EXPECTED);
    });

    test('every endpoint is routed on both prefixes (no catch-all answer)', async () => {
        for (const entry of EXPECTED) {
            const [method, endpoint] = entry.split(' ');
            for (const prefix of PREFIXES) {
                const res = method === 'GET'
                    ? await send(method, `${prefix}${endpoint}`)
                    : await sendJson(method, `${prefix}${endpoint}`, {});
                assert.notDeepEqual(res.json, NOT_FOUND, `${method} ${prefix}${endpoint} reached the catch-all`);
            }
        }
    });

    test('no route module declares a version segment in any path', () => {
        for (const file of fs.readdirSync(path.join(REPO, 'src', 'routes'))) {
            const src = fs.readFileSync(path.join(REPO, 'src', 'routes', file), 'utf8');
            for (const [, p] of src.matchAll(/router\.(?:get|post|put|delete|use|all)\(\s*'([^']*)'/g)) {
                assert.ok(!/\/v\d+(\/|$)/i.test(p), `${file} declares a versioned path ${p}`);
            }
        }
    });

    test('a route added to the shared assembly is reachable on both prefixes at once', async (t) => {
        const surface = require('../../src/routes/api');
        surface.get('/__drift-probe', (req, res) => res.json({ probe: true }));
        t.after(() => { surface.stack = surface.stack.filter((l) => !(l.route && l.route.path === '/__drift-probe')); });
        for (const prefix of PREFIXES) {
            const res = await send('GET', `${prefix}/__drift-probe`);
            assert.deepEqual(res.json, { probe: true }, prefix);
        }
    });
});

describe('server.js mount order and posture (source)', () => {
    const SERVER = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');

    test('both prefixes are mounted strictly before the /admin catch-all', () => {
        const mount = SERVER.indexOf("app.use(['/admin/v1', '/admin'], apiRoutes)");
        // The catch-all is the JSON 404 two-argument middleware. Matching its shape
        // rather than any app.use('/admin', ...) keeps this check pointing at the
        // terminating handler, not at earlier /admin middleware (the rate limiter).
        const catchAll = SERVER.search(/app\.use\(\s*'\/admin'\s*,\s*\(\s*req\s*,\s*res\s*\)\s*=>/);
        assert.ok(mount > -1, 'the shared assembly is mounted at /admin/v1 and /admin, v1 first');
        assert.ok(catchAll > -1, 'the catch-all exists');
        assert.ok(mount < catchAll, 'the assembly precedes the terminating catch-all');
    });

    test('no router is mounted directly by server.js any more - one assembly serves every prefix', () => {
        assert.ok(!/require\('\.\/src\/routes\/(fs|dashboard|settings)\.routes'\)/.test(SERVER));
        assert.ok(!/app\.get\(\s*'\/admin/.test(SERVER), 'no inline API route');
    });

    test('CORS is config-gated, never a bare permissive cors() (api-security-hardening)', () => {
        // The versioning change left CORS alone; the security change made it
        // same-origin-by-default. server.js must not reintroduce a bare cors().
        assert.ok(!/app\.use\(cors\(\)\);/.test(SERVER), 'server.js has no bare cors()');
        assert.match(SERVER, /config\.cors\.enabled/, 'CORS registration is gated by config');
        // The allowlist lives in config/env.js, so server.js hardcodes no header.
        assert.ok(!/Access-Control-Allow-Origin/i.test(SERVER));
    });

    test('the frontend fallback still excludes /admin', () => {
        assert.ok(SERVER.includes("!req.path.startsWith('/admin')"));
    });
});
