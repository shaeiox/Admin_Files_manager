// test/api/system.contract.test.js
'use strict';

/**
 * Admin system endpoints against a LIVE server: the File Portal settings in
 * admin.sqlite (volume marker, release folder, tunables), the retired .env
 * editor, the portal trace log (PORTAL_LOG_FILE), the audit log, the version label.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-system-'));
const ROOT = path.join(TMP, 'root');
const PORTAL = path.join(TMP, 'portal');
const LOG_FILE = path.join(PORTAL, 'data', 'portal.log');
fs.mkdirSync(ROOT, { recursive: true });
fs.mkdirSync(path.join(PORTAL, 'data'), { recursive: true });
fs.writeFileSync(LOG_FILE, [
    JSON.stringify({ t: '2026-01-01T00:00:00.000Z', level: 'info', msg: 'Portal started' }),
    'not json',
    JSON.stringify({ t: '2026-01-01T00:00:01.000Z', level: 'warn', method: 'GET', status: 404, url: '/x', msg: '' }),
    '',
].join('\n'));

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.PORTAL_LOG_FILE = LOG_FILE;
process.env.PORTAL_ROOT = PORTAL; // retired: must have no effect
process.env.APP_VERSION = '9.8.7';
process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE = '1000';

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

const { applyBootstrapEnv, redirectAdminDb, login: authLogin } = require('../helpers/authenticated');
applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;
let headers;

function send(method, pathname, payload) {
    return new Promise((resolve, reject) => {
        const body = payload === undefined ? undefined : JSON.stringify(payload);
        const h = { ...headers };
        if (body !== undefined) Object.assign(h, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
        const req = http.request({ host: '127.0.0.1', port, path: pathname, method, agent: false, headers: h }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* non-JSON */ }
                resolve({ status: res.statusCode, json });
            });
        });
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

const AUTH_NULL = { sessionMinutes: null, maxFailedAttempts: null, lockoutMinutes: null };
const MARKER = path.join(ROOT, '.dimension-volume');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

before(async () => {
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
    require('../../src/db/connection').reset();
    fs.rmSync(TMP, { recursive: true, force: true });
});

test('startup stamps STORAGE_ROOT with the volume marker and stores the same id', async () => {
    const res = await send('GET', '/api/v1/admin/portal/settings');
    assert.equal(res.status, 200);
    assert.equal(res.json.volume.status, 'ok');
    assert.match(res.json.volume.id, UUID_RE);
    assert.deepEqual(JSON.parse(fs.readFileSync(MARKER, 'utf8')), { volumeId: res.json.volume.id, clientPath: '/' });
    assert.deepEqual(res.json.portalRoot, { clientPath: null, status: 'ok' });
    assert.equal(res.json.releaseClientPath, null);
    assert.deepEqual(res.json.auth, AUTH_NULL);
});

test('the /api alias serves the same settings', async () => {
    assert.equal((await send('GET', '/api/admin/portal/settings')).json.volume.status, 'ok');
});

test('the marker is never listed and no endpoint reaches it by any spelling', async () => {
    fs.mkdirSync(path.join(ROOT, 'dest'), { recursive: true });
    const before = fs.readFileSync(MARKER, 'utf8');
    const list = await send('GET', '/api/v1/fs/list?path=/');
    assert.equal(list.status, 200);
    assert.ok(!JSON.stringify(list.json).includes('.dimension-volume'));
    for (const spelling of ['/.dimension-volume', '/.DIMENSION-VOLUME', '/.dimension-volume.', '/.dimension-volume::$DATA']) {
        const q = encodeURIComponent(spelling);
        for (const [method, url, body] of [
            ['GET', `/api/v1/fs/download?path=${q}`],
            ['PUT', '/api/v1/fs/rename', { oldPath: spelling, newName: 'x.txt' }],
            ['DELETE', '/api/v1/fs/delete', { paths: [spelling] }],
            ['PUT', '/api/v1/fs/move', { paths: [spelling], destination: '/dest' }],
            ['POST', '/api/v1/fs/copy', { paths: [spelling], destination: '/dest' }],
        ]) {
            const res = await send(method, url, body);
            const refused = res.status >= 400 || (res.json && res.json.data && res.json.data.failed && res.json.data.failed.length === 1);
            assert.ok(refused, `${method} ${url} ${spelling} -> ${res.status} ${JSON.stringify(res.json)}`);
        }
    }
    assert.equal((await send('POST', '/api/v1/fs/folder', { path: '/.dimension-volume' })).status, 400);
    assert.equal(fs.readFileSync(MARKER, 'utf8'), before);
    assert.deepEqual(fs.readdirSync(path.join(ROOT, 'dest')), []);
});

test('a missing or foreign marker is reported, never re-stamped', async () => {
    const { id } = (await send('GET', '/api/v1/admin/portal/settings')).json.volume;
    fs.rmSync(MARKER);
    try {
        assert.deepEqual((await send('GET', '/api/v1/admin/portal/settings')).json.volume, { id, status: 'missing' });
        assert.equal(fs.existsSync(MARKER), false);
        fs.writeFileSync(MARKER, JSON.stringify({ volumeId: '00000000-0000-4000-8000-000000000000' }));
        assert.deepEqual((await send('GET', '/api/v1/admin/portal/settings')).json.volume, { id, status: 'mismatch' });
    } finally {
        fs.writeFileSync(MARKER, JSON.stringify({ volumeId: id, clientPath: '/' }) + '\n');
    }
    assert.equal((await send('GET', '/api/v1/admin/portal/settings')).json.volume.status, 'ok');
});

test('PUT /admin/portal/settings stores the release folder and tunables, and audits it', async () => {
    fs.mkdirSync(path.join(ROOT, 'release', 'pvm'), { recursive: true });
    const body = {
        portalRootClientPath: null,
        releaseClientPath: 'release\\pvm/',
        auth: { sessionMinutes: 45, maxFailedAttempts: 7, lockoutMinutes: null },
    };
    const res = await send('PUT', '/api/v1/admin/portal/settings', body);
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(res.json.success, true);
    assert.equal(res.json.releaseClientPath, '/release/pvm');
    assert.deepEqual(res.json.portalRoot, { clientPath: null, status: 'ok' });
    assert.deepEqual(res.json.auth, body.auth);
    const read = (await send('GET', '/api/v1/admin/portal/settings')).json;
    assert.equal(read.releaseClientPath, '/release/pvm');
    assert.deepEqual(read.auth, body.auth);
    const audit = (await send('GET', '/api/v1/admin/logs/audit')).json;
    const row = audit.find((r) => r.action === 'portal.settings' && r.outcome === 'success');
    assert.ok(row, JSON.stringify(audit));
    assert.equal(typeof row.actor_username, 'string');
});

test('PUT /admin/portal/settings refuses bad input and keeps what is stored', async () => {
    fs.writeFileSync(path.join(ROOT, 'file.txt'), 'x');
    fs.mkdirSync(path.join(ROOT, 'Docs'), { recursive: true });
    const ok = { portalRootClientPath: null, releaseClientPath: null, auth: AUTH_NULL };
    for (const [body, status] of [
        [[], 400],
        [{ auth: AUTH_NULL }, 400],
        [{ releaseClientPath: null, auth: AUTH_NULL }, 400],
        [{ ...ok, volume: {} }, 400],
        [{ ...ok, auth: { ...AUTH_NULL, extra: 1 } }, 400],
        [{ ...ok, auth: { sessionMinutes: null, maxFailedAttempts: null } }, 400],
        [{ ...ok, auth: { ...AUTH_NULL, sessionMinutes: 0 } }, 400],
        [{ ...ok, auth: { ...AUTH_NULL, maxFailedAttempts: 1.5 } }, 400],
        [{ ...ok, auth: { ...AUTH_NULL, lockoutMinutes: '15' } }, 400],
        [{ ...ok, releaseClientPath: '/' }, 400],
        [{ ...ok, releaseClientPath: '/release/../..' }, 400],
        [{ ...ok, releaseClientPath: '/file.txt' }, 400],
        [{ ...ok, releaseClientPath: '/missing' }, 404],
        [{ ...ok, portalRootClientPath: '/file.txt' }, 400],
        [{ ...ok, portalRootClientPath: '/missing' }, 404],
    ]) {
        const res = await send('PUT', '/api/v1/admin/portal/settings', body);
        assert.equal(res.status, status, JSON.stringify(body) + ' -> ' + JSON.stringify(res.json));
    }
    assert.equal((await send('GET', '/api/v1/admin/portal/settings')).json.releaseClientPath, '/release/pvm');
});

describe('published portal folder (optional marker for hosts that cannot see the storage root)', () => {
    const DL = path.join(ROOT, 'Downloads');
    const DL_MARKER = path.join(DL, '.dimension-volume');
    const put = (portalRootClientPath, releaseClientPath = null) =>
        send('PUT', '/api/v1/admin/portal/settings', { portalRootClientPath, releaseClientPath, auth: AUTH_NULL });
    let id;

    before(async () => {
        fs.mkdirSync(path.join(DL, 'pvm'), { recursive: true });
        fs.mkdirSync(path.join(ROOT, 'Shared'), { recursive: true });
        id = (await send('GET', '/api/v1/admin/portal/settings')).json.volume.id;
    });

    test('choosing /Downloads writes a marker that names it; the root marker stays', async () => {
        const res = await put('Downloads/', '/Downloads/pvm');
        assert.equal(res.status, 200, JSON.stringify(res.json));
        assert.deepEqual(res.json.portalRoot, { clientPath: '/Downloads', status: 'ok' });
        assert.equal(res.json.releaseClientPath, '/Downloads/pvm');
        assert.deepEqual(JSON.parse(fs.readFileSync(DL_MARKER, 'utf8')), { volumeId: id, clientPath: '/Downloads' });
        assert.deepEqual(JSON.parse(fs.readFileSync(MARKER, 'utf8')), { volumeId: id, clientPath: '/' });
    });

    test('the release folder is not tied to the published folder', async () => {
        const res = await put('/Downloads', '/release/pvm');
        assert.equal(res.status, 200, JSON.stringify(res.json));
        assert.equal(res.json.releaseClientPath, '/release/pvm');
        assert.equal((await put('/Downloads', '/Downloads/pvm')).status, 200);
    });

    test('the nested marker is unreachable too', async () => {
        for (const [method, url, body] of [
            ['GET', `/api/v1/fs/download?path=${encodeURIComponent('/Downloads/.dimension-volume')}`],
            ['DELETE', '/api/v1/fs/delete', { paths: ['/Downloads/.Dimension-Volume.'] }],
        ]) {
            const res = await send(method, url, body);
            assert.ok(res.status >= 400 || res.json.data.failed.length === 1, `${method} ${url} -> ${res.status}`);
        }
        assert.ok(fs.existsSync(DL_MARKER));
        const list = await send('GET', '/api/v1/fs/list?path=/Downloads');
        assert.ok(!JSON.stringify(list.json).includes('.dimension-volume'));
    });

    test('a lost portal-root marker is restored on read', async () => {
        fs.rmSync(DL_MARKER);
        const res = await send('GET', '/api/v1/admin/portal/settings');
        assert.deepEqual(res.json.portalRoot, { clientPath: '/Downloads', status: 'ok' });
        assert.ok(fs.existsSync(DL_MARKER));
    });

    test('renaming the portal root folder through the API keeps everything pointing at it', async () => {
        const res = await send('PUT', '/api/v1/fs/rename', { oldPath: '/Downloads', newName: 'Dl' });
        assert.equal(res.status, 200, JSON.stringify(res.json));
        const read = (await send('GET', '/api/v1/admin/portal/settings')).json;
        assert.deepEqual(read.portalRoot, { clientPath: '/Dl', status: 'ok' });
        assert.equal(read.releaseClientPath, '/Dl/pvm');
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'Dl', '.dimension-volume'), 'utf8')), { volumeId: id, clientPath: '/Dl' });
        assert.equal((await send('PUT', '/api/v1/fs/rename', { oldPath: '/Dl', newName: 'Downloads' })).status, 200);
    });

    test('a folder with another volume\'s marker is refused with 409', async () => {
        const foreign = path.join(ROOT, 'Shared', '.dimension-volume');
        fs.writeFileSync(foreign, JSON.stringify({ volumeId: '00000000-0000-4000-8000-000000000000', clientPath: '/' }));
        try {
            const res = await put('/Shared');
            assert.equal(res.status, 409, JSON.stringify(res.json));
            assert.equal((await send('GET', '/api/v1/admin/portal/settings')).json.portalRoot.clientPath, '/Downloads');
        } finally {
            fs.rmSync(foreign);
        }
    });

    test('moving the portal root elsewhere removes the old marker; back to the whole storage too', async () => {
        assert.equal((await put('/Shared')).status, 200);
        assert.equal(fs.existsSync(DL_MARKER), false);
        assert.ok(fs.existsSync(path.join(ROOT, 'Shared', '.dimension-volume')));
        const back = await put(null);
        assert.equal(back.status, 200);
        assert.deepEqual(back.json.portalRoot, { clientPath: null, status: 'ok' });
        assert.equal(fs.existsSync(path.join(ROOT, 'Shared', '.dimension-volume')), false);
        assert.ok(fs.existsSync(MARKER));
    });

    test('an unverified storage refuses a new portal root with 409', async () => {
        const body = fs.readFileSync(MARKER, 'utf8');
        fs.rmSync(MARKER);
        try {
            assert.equal((await put('/Downloads')).status, 409);
        } finally {
            fs.writeFileSync(MARKER, body);
        }
    });
});

test('the retired /admin/portal/config reports not linked and writes nothing', async () => {
    const res = await send('GET', '/api/v1/admin/portal/config');
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.json).sort(), ['available', 'reason', 'values']);
    assert.equal(res.json.available, false);
    assert.equal(res.json.values, null);
    assert.match(res.json.reason, /\/admin\/portal\/settings/);
    const put = await send('PUT', '/api/v1/admin/portal/config', { FILES_ROOT: '/x' });
    assert.equal(put.status, 503);
    assert.equal(put.json.success, false);
    assert.equal(fs.existsSync(path.join(PORTAL, '.env')), false, 'PORTAL_ROOT is never written');
});

test('GET /admin/logs/portal returns parsed entries newest first, skipping bad lines', async () => {
    const res = await send('GET', '/api/v1/admin/logs/portal?limit=10');
    assert.equal(res.status, 200);
    assert.equal(res.json.available, true);
    assert.deepEqual(res.json.entries.map((e) => e.level), ['warn', 'info']);
    assert.equal(res.json.entries[0].status, 404);
});

test('PUT /admin/portal/nav stores folders in order (normalized), GET returns them, audit records it', async () => {
    fs.mkdirSync(path.join(ROOT, 'Docs', 'Guides'), { recursive: true });
    fs.mkdirSync(path.join(ROOT, 'PVM'), { recursive: true });
    assert.deepEqual((await send('GET', '/api/v1/admin/portal/nav')).json, { folders: [] });

    const put = await send('PUT', '/api/v1/admin/portal/nav', { folders: [
        { path: 'PVM/', label: ' Releases ', hideFromHome: true },
        { path: '\\Docs\\Guides' },
    ] });
    assert.equal(put.status, 200, JSON.stringify(put.json));
    const expected = [
        { path: '/PVM', label: 'Releases', hideFromHome: true },
        { path: '/Docs/Guides', label: '', hideFromHome: false },
    ];
    assert.deepEqual(put.json.folders, expected);
    assert.deepEqual((await send('GET', '/api/v1/admin/portal/nav')).json.folders, expected);

    const audit = (await send('GET', '/api/v1/admin/logs/audit')).json;
    assert.ok(audit.some((r) => r.action === 'portal.nav' && r.outcome === 'success'));
});

test('PUT /admin/portal/nav refuses bad input with 400/403/404 and keeps the stored list', async () => {
    for (const [body, status] of [
        [{}, 400],
        [{ folders: [{ path: '/' }] }, 400],
        [{ folders: [{ path: '/PVM/../..' }] }, 400],
        [{ folders: [{ path: '/PVM' }, { path: '/pvm' }] }, 400],
        [{ folders: [{ path: '/PVM', label: 'x'.repeat(41) }] }, 400],
        [{ folders: [{ path: '/PVM', hideFromHome: 'yes' }] }, 400],
        [{ folders: [{ path: '/file.txt' }] }, 400],
        [{ folders: [{ path: '/missing' }] }, 404],
        [{ folders: Array.from({ length: 13 }, () => ({ path: '/PVM' })) }, 400],
    ]) {
        const res = await send('PUT', '/api/v1/admin/portal/nav', body);
        assert.equal(res.status, status, JSON.stringify(body) + ' -> ' + JSON.stringify(res.json));
    }
    assert.equal((await send('GET', '/api/v1/admin/portal/nav')).json.folders.length, 2);
});

test('GET /auth/me carries APP_VERSION as appVersion', async () => {
    const res = await send('GET', '/api/v1/auth/me');
    assert.equal(res.json.appVersion, '9.8.7');
});

test('PORTAL_LOG_FILE unset, relative or a directory is reported, not served as empty', async () => {
    try {
        for (const [value, reason] of [[undefined, /not set/], ['data/portal.log', /absolute/], [path.join(PORTAL, 'data'), /directory/]]) {
            if (value === undefined) delete process.env.PORTAL_LOG_FILE;
            else process.env.PORTAL_LOG_FILE = value;
            const log = await send('GET', '/api/v1/admin/logs/portal');
            assert.equal(log.status, 200, JSON.stringify(log.json));
            assert.equal(log.json.available, false, String(value));
            assert.match(log.json.reason, reason);
        }
    } finally {
        process.env.PORTAL_LOG_FILE = LOG_FILE;
    }
});
