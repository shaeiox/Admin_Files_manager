// test/api/upload.surface.test.js
'use strict';

/**
 * Upload error surface (openspec/changes/upload-pipeline-correctness, phase 2).
 *
 * Pins the error-disclosure contract the Upload page depends on, against a live
 * server with a temporary STORAGE_ROOT:
 *
 *   - no response carries a stack, in any configuration - including none at all
 *     (an unset NODE_ENV used to read as "development" and disclose stacks);
 *   - an authored AppError reason is forwarded verbatim;
 *   - any other failure, whatever its status, gets a fixed generic message
 *     (the superseded rule sanitised only 500s, and only in production);
 *   - the server log still records the error and where it was thrown;
 *   - each upload failure class answers with the status the page maps to a kind.
 *
 * Neither errorHandler.js nor env.js is edited by this change; this file only
 * holds them to the contract (design.md D9).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const REPO_DIR = path.resolve(__dirname, '..', '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-upsurf-'));
const ROOT = path.join(TMP, 'root');
fs.mkdirSync(path.join(ROOT, 'target'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'target', 'taken.txt'), 'ORIGINAL');
fs.writeFileSync(path.join(ROOT, 'plain.txt'), 'FILE');

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_LIMIT = process.env.UPLOAD_MAX_BYTES;

const UPLOAD_LIMIT = 32 * 1024;
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.UPLOAD_MAX_BYTES = String(UPLOAD_LIMIT);

// Never the repository's data/metadata.json (see AGENTS.md, "Tests never touch
// the real metadata store").
const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

let server;
let port;

/* ── transport ── */

function send(targetPort, method, pathname, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...headers };
        if (body !== undefined) finalHeaders['Content-Length'] = Buffer.byteLength(body);
        const req = http.request(
            { host: '127.0.0.1', port: targetPort, path: pathname, method, agent: false, headers: finalHeaders },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    let json = null;
                    try { json = JSON.parse(text); } catch { /* non-JSON */ }
                    resolve({ status: res.statusCode, body: text, json });
                });
            }
        );
        req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

/** Multipart with parts in exactly the given order (fields first, as the page sends them). */
function postUpload(targetPort, parts) {
    const boundary = `----afmsurface${Date.now().toString(16)}`;
    const CRLF = '\r\n';
    const chunks = [];
    for (const part of parts) {
        if (part.filename !== undefined) {
            chunks.push(Buffer.from(
                `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${part.filename}"${CRLF}` +
                `Content-Type: application/octet-stream${CRLF}${CRLF}`));
            chunks.push(Buffer.isBuffer(part.content) ? part.content : Buffer.from(part.content));
            chunks.push(Buffer.from(CRLF));
        } else {
            chunks.push(Buffer.from(
                `--${boundary}${CRLF}Content-Disposition: form-data; name="${part.name}"${CRLF}${CRLF}${part.value}${CRLF}`));
        }
    }
    chunks.push(Buffer.from(`--${boundary}--${CRLF}`));
    return send(targetPort, 'POST', '/api/fs/upload', {
        body: Buffer.concat(chunks),
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    });
}

const field = (name, value) => ({ name, value });
const file = (filename, content = 'X') => ({ filename, content });

/** Nothing that could disclose the server's layout or internals. */
function assertNoDisclosure(res, label) {
    assert.ok(!('stack' in (res.json || {})), `${label}: response carries a stack field`);
    assert.ok(!/"stack"/.test(res.body), `${label}: body mentions a stack`);
    assert.ok(!/(?:^|[\s"'`=(])[A-Za-z]:[\\/]/.test(res.body), `${label}: body leaks a drive-letter path`);
    for (const secret of [ROOT, TMP, REPO_DIR, ROOT.replace(/\\/g, '/'), REPO_DIR.replace(/\\/g, '/')]) {
        assert.ok(!res.body.includes(secret), `${label}: body contains ${secret}`);
    }
    assert.ok(!/node:internal/.test(res.body), `${label}: body leaks node internals`);
    assert.ok(!/\.js:\d+/.test(res.body), `${label}: body leaks a source line reference`);
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
    const restore = (key, value) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
    restore('STORAGE_ROOT', ORIGINAL_ROOT);
    restore('PORT', ORIGINAL_PORT);
    restore('UPLOAD_MAX_BYTES', ORIGINAL_LIMIT);
    fs.rmSync(TMP, { recursive: true, force: true });
});

/* ══════════════════════════════════════════
   2.2 / 2.5 — a rejected upload keeps its reason and loses its internals
   ══════════════════════════════════════════ */

describe('a rejected upload discloses its reason and nothing else', () => {
    test('an invalid name: no stack, no absolute path, the authored reason intact', async () => {
        const res = await postUpload(port, [field('destination', '/target'), file('bad..name')]);
        assert.equal(res.status, 400);
        assertNoDisclosure(res, 'invalid name');
        assert.equal(res.json.success, false);
        assert.equal(res.json.error, 'Name cannot contain slashes or parent references.');
    });

    test('a reserved device name keeps its own authored reason', async () => {
        const res = await postUpload(port, [field('destination', '/target'), file('CON.txt')]);
        assert.equal(res.status, 400);
        assertNoDisclosure(res, 'reserved name');
        assert.equal(res.json.error, 'Name is reserved by the operating system.');
    });

    test('a missing destination says so, without a path', async () => {
        const res = await postUpload(port, [field('destination', '/target/nope'), file('x.txt')]);
        assert.equal(res.status, 400);
        assertNoDisclosure(res, 'missing destination');
        assert.equal(res.json.error, 'Upload destination does not exist.');
        assert.equal(fs.existsSync(path.join(ROOT, 'target', 'nope')), false, 'an upload never creates a directory');
    });
});

/* ══════════════════════════════════════════
   0.3 — each failure class has a status the page can map without prose
   ══════════════════════════════════════════ */

describe('upload failure classes answer with distinct statuses', () => {
    test('a name collision without overwrite is 409 and leaves the original intact', async () => {
        const res = await postUpload(port, [field('destination', '/target'), field('overwrite', 'false'), file('taken.txt', 'NEW')]);
        assert.equal(res.status, 409);
        assertNoDisclosure(res, 'collision');
        assert.equal(fs.readFileSync(path.join(ROOT, 'target', 'taken.txt'), 'utf8'), 'ORIGINAL');
    });

    test('an oversize file is 413 and names the limit in effect', async () => {
        const res = await postUpload(port, [field('destination', '/target'), file('big.bin', Buffer.alloc(UPLOAD_LIMIT + 1, 1))]);
        assert.equal(res.status, 413);
        assertNoDisclosure(res, 'oversize');
        assert.ok(res.json.error.includes(String(UPLOAD_LIMIT)), 'the message carries the configured byte limit');
        assert.equal(fs.existsSync(path.join(ROOT, 'target', 'big.bin')), false);
    });

    test('a traversing destination is 403', async () => {
        const res = await postUpload(port, [field('destination', '/../..'), file('x.txt')]);
        assert.equal(res.status, 403);
        assertNoDisclosure(res, 'traversal');
    });

    test('a successful upload lands where it says it did', async () => {
        const res = await postUpload(port, [field('destination', '/target'), field('overwrite', 'false'), file('fresh.txt', 'FRESH')]);
        assert.equal(res.status, 201);
        assert.equal(res.json.data.path, '/target/fresh.txt');
        assert.equal(fs.readFileSync(path.join(ROOT, 'target', 'fresh.txt'), 'utf8'), 'FRESH');
    });
});

/* ══════════════════════════════════════════
   2.4 — a failure nobody anticipated gets the generic message, at ANY status
   ══════════════════════════════════════════ */

describe('a non-authored failure never leaks through a non-500 status', () => {
    test('malformed JSON (a framework 400 carrying raw parser text) answers generically', async () => {
        const res = await send(port, 'POST', '/api/fs/folder', {
            body: '{"path": "/x", <not json>',
            headers: { 'Content-Type': 'application/json' },
        });
        assert.equal(res.status, 400);
        assertNoDisclosure(res, 'malformed JSON');
        assert.equal(res.json.error, 'Request could not be processed.');
        assert.ok(!/JSON|token|position/i.test(res.json.error), 'no parser prose reaches the client');
    });

    test('the handler distinguishes the superseded rule: a raw 400 is sanitised in every environment', () => {
        const errorHandler = require('../../src/middlewares/errorHandler');
        const raw = Object.assign(new Error(`EACCES: permission denied, open '${ROOT}\\secret'`), { statusCode: 400 });
        let status = 0;
        let payload = null;
        const res = { status(c) { status = c; return this; }, json(b) { payload = b; return this; } };
        const original = console.error;
        console.error = () => {};
        try {
            errorHandler(raw, { method: 'POST', path: '/probe' }, res, () => {});
        } finally {
            console.error = original;
        }
        // The old condition (production && 500) would have forwarded this message.
        assert.equal(status, 400);
        assert.equal(payload.error, 'Request could not be processed.');
        assert.equal(payload.stack, undefined);
    });
});

/* ══════════════════════════════════════════
   2.6 — removing client disclosure did not remove diagnosis
   ══════════════════════════════════════════ */

describe('the server log keeps the detail the client no longer sees', () => {
    test('the logged entry carries the error and the location it was thrown from', () => {
        const errorHandler = require('../../src/middlewares/errorHandler');
        const err = new TypeError('probe failure for the log');
        const logged = [];
        const original = console.error;
        console.error = (...args) => logged.push(args.join(' '));
        try {
            errorHandler(err, { method: 'GET', path: '/probe' }, { status() { return this; }, json() { return this; } }, () => {});
        } finally {
            console.error = original;
        }
        const line = logged.join('\n');
        assert.match(line, /probe failure for the log/);
        assert.match(line, /upload\.surface\.test\.js:\d+/, 'the stack frame (file and line) is logged');
    });
});

/* ══════════════════════════════════════════
   2.3 — no configuration at all discloses nothing (the `npm start` path)
   ══════════════════════════════════════════ */

function freePort() {
    return new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port: p } = probe.address();
            probe.close(() => resolve(p));
        });
    });
}

describe('an unset environment selector discloses nothing', () => {
    test('`node server.js` with no NODE_ENV and no .env serves no stack', async (t) => {
        const childPort = await freePort();
        const env = { ...process.env, STORAGE_ROOT: ROOT, PORT: String(childPort), DOTENV_CONFIG_QUIET: 'true' };
        delete env.NODE_ENV;
        // cwd is the temp dir: no .env is found there (so nothing sets NODE_ENV),
        // and the metadata store resolves under it, not under the repository.
        const child = spawn(process.execPath, [path.join(REPO_DIR, 'server.js')], {
            cwd: TMP, env, stdio: ['ignore', 'pipe', 'pipe'],
        });
        // Windows locks a live process's cwd: wait for the exit, or the temp dir cannot be removed.
        t.after(async () => {
            if (child.exitCode !== null || child.signalCode !== null) return;
            const exited = new Promise((r) => child.once('exit', r));
            child.kill();
            await exited;
        });

        let out = '';
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`server did not start:\n${out}`)), 15000);
            const onData = (chunk) => {
                out += chunk;
                if (/Environment: .*\n/.test(out)) { clearTimeout(timer); resolve(); }
            };
            child.stdout.on('data', onData);
            child.stderr.on('data', onData);
            child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`server exited ${code}:\n${out}`)); });
        });
        assert.match(out, /Environment: development/, 'the unset selector really is read as the development default');

        const rejected = await postUpload(childPort, [field('destination', '/target'), file('bad..name')]);
        assert.equal(rejected.status, 400);
        assertNoDisclosure(rejected, 'child: invalid name');

        const malformed = await send(childPort, 'POST', '/api/fs/folder', {
            body: '{nope', headers: { 'Content-Type': 'application/json' },
        });
        assert.equal(malformed.status, 400);
        assertNoDisclosure(malformed, 'child: malformed JSON');
        assert.equal(malformed.json.error, 'Request could not be processed.');

    });
});
