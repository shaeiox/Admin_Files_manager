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

function request(pathname, { method = 'GET', body = null, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, headers, agent: false },
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

    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
});

after(async () => {
    if (server && server.closeAllConnections) server.closeAllConnections();
    if (server) await new Promise((r) => server.close(r));
    if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT; else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
    if (ORIGINAL_PORT === undefined) delete process.env.PORT; else process.env.PORT = ORIGINAL_PORT;
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