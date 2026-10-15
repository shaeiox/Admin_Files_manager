// test/api/fs.symlink.test.js
'use strict';

/**
 * Symlinks and junctions are not followed on the read/download boundary
 * (api-security-hardening: "Symbolic Links And Junctions Are Not Followed On
 * Read Or Download").
 *
 * `resolveSecurePath` is lexical: it judges the path STRING. It cannot see that
 * an in-root entry is a link pointing elsewhere, and `fs.stat` follows links.
 * A live server, real links, and a target outside the root are the only honest
 * way to prove the escape is closed.
 *
 * Portability: on Windows a FILE symlink needs Developer Mode or elevation, but
 * a DIRECTORY junction needs neither, so the Windows path exercises a junction to
 * a directory. On POSIX a file symlink is used directly. Each build is attempted
 * in the forms this platform supports and the tests skip with a reason only if
 * every form was refused.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { applyBootstrapEnv, redirectAdminDb, login: authLogin } = require('../helpers/authenticated');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-link-'));
const ROOT = path.join(TMP, 'root');
const OUTSIDE_DIR = path.join(TMP, 'outside-dir');
const INSIDE_DIR = path.join(ROOT, 'inside-dir');

const SECRET = 'TOPSECRET-OUT-OF-ROOT';

fs.mkdirSync(ROOT, { recursive: true });
fs.mkdirSync(OUTSIDE_DIR, { recursive: true });
fs.mkdirSync(INSIDE_DIR, { recursive: true });
fs.writeFileSync(path.join(OUTSIDE_DIR, 'secret.txt'), SECRET);
fs.writeFileSync(path.join(INSIDE_DIR, 'ok.txt'), 'INSIDE-CONTENT');

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

/** True when this platform let us create at least one usable link. */
let linksAvailable = false;

/**
 * Link a name inside the root to a directory target, using every form this
 * platform supports. Returns true when at least one form succeeded.
 */
function makeDirLink(name, targetDir) {
    const linkPath = path.join(ROOT, name);
    const forms = process.platform === 'win32'
        ? ['junction', 'dir']
        : ['dir'];
    for (const type of forms) {
        try {
            fs.symlinkSync(targetDir, linkPath, type);
            return true;
        } catch { /* try the next form */ }
    }
    return false;
}

let server;
let port;
let authHeaders = {};

function request(pathname, { method = 'GET', body = null, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...authHeaders, ...headers };
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, headers: finalHeaders, agent: false },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks),
                }));
            },
        );
        req.on('error', reject);
        if (body !== null) req.write(body);
        req.end();
    });
}

before(async () => {
    const outside = makeDirLink('link-outside', OUTSIDE_DIR);
    const inside = makeDirLink('link-inside', INSIDE_DIR);
    const broken = makeDirLink('link-broken', path.join(TMP, 'never-existed'));
    linksAvailable = outside || inside || broken;

    applyBootstrapEnv();
    redirectAdminDb(path.join(TMP, 'admin.sqlite'));

    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
    authHeaders = (await authLogin(port)).headers;
});

after(async () => {
    if (server && server.closeAllConnections) server.closeAllConnections();
    if (server) await new Promise((r) => server.close(r));
    if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT; else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
    if (ORIGINAL_PORT === undefined) delete process.env.PORT; else process.env.PORT = ORIGINAL_PORT;
    require('../../src/db/connection').reset(); // release the sqlite file lock before rmSync (Windows)
    fs.rmSync(TMP, { recursive: true, force: true });
});

function noLinks(t) {
    return t.skip('this platform refused to create a symbolic link or junction');
}

describe('a link escaping the root is refused on every read path', () => {
    test('download through the link is refused and streams no outside bytes', async (t) => {
        if (!linksAvailable) return noLinks(t);
        const res = await request(`/api/v1/fs/download?path=${encodeURIComponent('/link-outside/secret.txt')}`);
        assert.equal(res.status, 403);
        assert.ok(!res.body.toString().includes(SECRET), 'no outside-target byte was streamed');
    });

    test('listing the link itself is refused, not followed', async (t) => {
        if (!linksAvailable) return noLinks(t);
        const res = await request(`/api/v1/fs/list?path=${encodeURIComponent('/link-outside')}`);
        assert.equal(res.status, 403);
        assert.ok(!res.body.toString().includes(SECRET));
    });

    test('the root listing exposes no outside-target byte', async (t) => {
        if (!linksAvailable) return noLinks(t);
        const res = await request('/api/v1/fs/list?path=/');
        assert.equal(res.status, 200);
        assert.ok(!res.body.toString().includes(SECRET), 'no outside-target byte is exposed by the listing');
    });

    test('a ZIP of the escaping link refuses rather than archiving the target', async (t) => {
        if (!linksAvailable) return noLinks(t);
        const body = JSON.stringify({ paths: ['/link-outside'] });
        const res = await request('/api/v1/fs/download-zip', {
            method: 'POST',
            body,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        });
        assert.equal(res.status, 403);
        assert.ok(!res.body.toString().includes(SECRET), 'the outside target is not in the archive');
    });

    test('a ZIP of a real folder does not follow a link nested inside it', async (t) => {
        if (!linksAvailable) return noLinks(t);
        const zipDir = path.join(ROOT, 'zipdir');
        fs.mkdirSync(zipDir, { recursive: true });
        fs.writeFileSync(path.join(zipDir, 'plain.txt'), 'PLAIN');
        try {
            fs.symlinkSync(OUTSIDE_DIR, path.join(zipDir, 'nested-out'), process.platform === 'win32' ? 'junction' : 'dir');
        } catch { return noLinks(t); }
        const body = JSON.stringify({ paths: ['/zipdir'] });
        const res = await request('/api/v1/fs/download-zip', {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        });
        // STORE or DEFLATE: neither the plain secret nor its file name may appear.
        assert.ok(!res.body.includes(Buffer.from(SECRET)), 'outside bytes are not archived');
        assert.ok(!res.body.includes(Buffer.from('nested-out/secret.txt')), 'outside entry is not archived');
    });
});

describe('a link escaping the root is refused on every write path', () => {
    // The read side canonicalised, the write side judged only the path STRING:
    // copy/move of '/link-outside/secret.txt' pulled the outside file into the
    // root (where download then served it), and folder/rename/move-into acted
    // on the outside directory.
    function json(method, pathname, payload) {
        const body = JSON.stringify(payload);
        return request(pathname, {
            method,
            body,
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        });
    }
    const outsideEntries = () => fs.readdirSync(OUTSIDE_DIR).sort();

    test('copy of a file reached through the link copies nothing into the root', async (t) => {
        if (!linksAvailable) return noLinks(t);
        await json('POST', '/api/v1/fs/copy', { paths: ['/link-outside/secret.txt'], destination: '/' });
        assert.equal(fs.existsSync(path.join(ROOT, 'secret.txt')), false, 'outside bytes were not copied in');
    });

    test('move of a file reached through the link leaves it where it is', async (t) => {
        if (!linksAvailable) return noLinks(t);
        await json('PUT', '/api/v1/fs/move', { paths: ['/link-outside/secret.txt'], destination: '/' });
        assert.equal(fs.existsSync(path.join(ROOT, 'secret.txt')), false);
        assert.deepEqual(outsideEntries(), ['secret.txt']);
    });

    test('copy and move INTO the link write nothing outside the root', async (t) => {
        if (!linksAvailable) return noLinks(t);
        await json('POST', '/api/v1/fs/copy', { paths: ['/inside-dir/ok.txt'], destination: '/link-outside' });
        await json('PUT', '/api/v1/fs/move', { paths: ['/inside-dir/ok.txt'], destination: '/link-outside' });
        assert.deepEqual(outsideEntries(), ['secret.txt']);
        assert.equal(fs.existsSync(path.join(INSIDE_DIR, 'ok.txt')), true, 'the source was not moved out');
    });

    test('creating a folder or renaming through the link is refused', async (t) => {
        if (!linksAvailable) return noLinks(t);
        const folder = await json('POST', '/api/v1/fs/folder', { path: '/link-outside/planted' });
        const rename = await json('PUT', '/api/v1/fs/rename', { oldPath: '/link-outside/secret.txt', newName: 'renamed.txt' });
        assert.equal(folder.status, 403);
        assert.equal(rename.status, 403);
        assert.deepEqual(outsideEntries(), ['secret.txt']);
    });
});

describe('links that stay inside the root, and broken links', () => {
    test('a link to an in-root target still resolves', async (t) => {
        if (!linksAvailable) return noLinks(t);
        const res = await request(`/api/v1/fs/list?path=${encodeURIComponent('/link-inside')}`);
        assert.equal(res.status, 200, 'an in-root link is not an escape');
        assert.match(res.body.toString(), /ok\.txt/);
    });

    test('a broken link is refused with a client error', async (t) => {
        if (!linksAvailable) return noLinks(t);
        const res = await request(`/api/v1/fs/list?path=${encodeURIComponent('/link-broken')}`);
        assert.ok(res.status === 404 || res.status === 403, `expected a client error, got ${res.status}`);
    });
});