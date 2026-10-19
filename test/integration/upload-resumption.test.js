// test/integration/upload-resumption.test.js
'use strict';

/**
 * Resumable uploads, end to end (resumable-uploads, tasks 5.1-5.2).
 *
 * Two claims, each against a LIVE server and checked on disk:
 *   - 5.1 — a connection dropped mid-append rolls the staged file back to the
 *     acknowledged offset, the re-initiated transfer resumes by fingerprint,
 *     and the delivered file equals the fixture byte-for-byte.
 *   - 5.2 — a session and its staged bytes survive a server restart between
 *     chunks (fresh module instance, empty in-memory cache), and the resumed
 *     transfer still completes byte-for-byte.
 *
 * Isolation: STORAGE_ROOT and every store (Metadata, Settings, upload
 * sessions, admin.sqlite) point at a temp tree BEFORE server.js is required,
 * so the suite never writes the repository's data/ (AGENTS.md).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { applyBootstrapEnv, redirectAdminDb, login: authLogin } = require('../helpers/authenticated');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-resume-'));
const ROOT = path.join(TMP, 'root');

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_MAX_BYTES = process.env.UPLOAD_MAX_BYTES;
const ORIGINAL_WRITE_LIMIT = process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.UPLOAD_MAX_BYTES = String(256 * 1024);
process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE = '0';

const LAST_MODIFIED = 1700000000000;
fs.mkdirSync(path.join(ROOT, 'target'), { recursive: true });

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;
const SettingsService = require('../../src/services/SettingsService');
SettingsService.dbPath = path.join(TMP, 'settings.json');
SettingsService.cache = null;
const UploadSessionService = require('../../src/services/UploadSessionService');
UploadSessionService.dbPath = path.join(TMP, 'upload-sessions.json');
UploadSessionService.cache = null;
applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;
let authHeaders = {};

/** A deterministic payload; equality with the fixture is the whole point. */
function fixture(seed, size) {
    const buffer = Buffer.alloc(size);
    for (let i = 0; i < size; i++) buffer[i] = (i * 31 + seed) % 251;
    return buffer;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── transport ── */

function send(method, pathname, { body, headers = {}, auth = true } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...(auth ? authHeaders : {}), ...headers };
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
                    resolve({ status: res.statusCode, json });
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

const initiateSession = (payload) => sendJson('POST', '/api/v1/fs/uploads', {
    destination: '/target',
    lastModified: LAST_MODIFIED,
    overwrite: false,
    ...payload,
});

const appendChunk = (id, offset, body) => send('PUT', `/api/v1/fs/uploads/${id}/chunk?offset=${offset}`, {
    body: Buffer.isBuffer(body) ? body : Buffer.from(body),
    headers: { 'Content-Type': 'application/octet-stream' },
});

const statusOf = (id) => send('GET', `/api/v1/fs/uploads/${id}`);
const completeOf = (id) => sendJson('POST', `/api/v1/fs/uploads/${id}/complete`, {});

const stagingPath = (id) => path.join(ROOT, 'target', `.upload-${id}.part`);

/**
 * Send half a chunk, then drop the connection as a network failure would.
 * The response cannot arrive (the request is incomplete), so there is
 * deliberately nothing to read — only the server's recovery to observe.
 */
function appendAndDrop(id, offset, body) {
    return new Promise((resolve) => {
        const req = http.request(
            {
                host: '127.0.0.1', port, agent: false, method: 'PUT',
                path: `/api/v1/fs/uploads/${id}/chunk?offset=${offset}`,
                headers: { ...authHeaders, 'Content-Type': 'application/octet-stream', 'Content-Length': body.length },
            },
            () => { /* a response on a dropped connection is not the assertion */ }
        );
        req.on('error', () => resolve());
        req.write(body.subarray(0, Math.floor(body.length / 2)));
        setTimeout(() => { req.destroy(); resolve(); }, 75);
    });
}

/** Poll until the server-side rollback settles on the acknowledged offset. */
async function waitForReceivedBytes(id, expected, timeoutMs = 5000) {
    const started = Date.now();
    let last = null;
    while (Date.now() - started < timeoutMs) {
        const res = await statusOf(id);
        last = res.json && res.json.receivedBytes;
        if (last === expected) return;
        await delay(25);
    }
    assert.fail(`receivedBytes settled at ${last}, expected ${expected} after the interrupted append`);
}

async function bootServer() {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
    authHeaders = (await authLogin(port)).headers;
}

async function stopServer() {
    if (!server) return;
    if (server.closeAllConnections) server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    server = null;
}

before(bootServer);

after(async () => {
    await stopServer();
    const restore = (key, value) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    };
    restore('STORAGE_ROOT', ORIGINAL_ROOT);
    restore('PORT', ORIGINAL_PORT);
    restore('UPLOAD_MAX_BYTES', ORIGINAL_MAX_BYTES);
    restore('AFM_RATE_LIMIT_WRITE_PER_MINUTE', ORIGINAL_WRITE_LIMIT);
    require('../../src/db/connection').reset(); // release the sqlite file lock before rmSync (Windows)
    fs.rmSync(TMP, { recursive: true, force: true });
});

/* ══════════════════════════════════════════
   5.1 — an interruption resumes and completes byte-for-byte
   ══════════════════════════════════════════ */

describe('an interrupted transfer (5.1)', () => {
    test('a dropped append rolls back to the acknowledged offset, and the resumed transfer delivers the fixture', async () => {
        const content = fixture(11, 64 * 1024);
        const opened = await initiateSession({ name: 'dropped.bin', size: content.length });
        assert.equal(opened.status, 200, opened.json && opened.json.error);
        const id = opened.json.sessionId;

        // First chunk acknowledged: 16 KiB committed server-side.
        const first = await appendChunk(id, 0, content.subarray(0, 16 * 1024));
        assert.equal(first.json.receivedBytes, 16 * 1024);

        // Second chunk starts, then the connection dies mid-body.
        await appendAndDrop(id, 16 * 1024, content.subarray(16 * 1024, 32 * 1024));

        // The unacknowledged bytes must not survive as progress: the staged file
        // is rolled back to the acknowledged 16 KiB.
        await waitForReceivedBytes(id, 16 * 1024);

        // Recovery: re-selecting the file re-offers the same fingerprint and the
        // open session is adopted with the server's own reading.
        const again = await initiateSession({ name: 'dropped.bin', size: content.length });
        assert.equal(again.status, 200);
        assert.equal(again.json.sessionId, id, 'the interrupted session is adopted, not restarted');
        assert.equal(again.json.receivedBytes, 16 * 1024);

        // Resume from the acknowledged offset and finish.
        const rest = await appendChunk(id, 16 * 1024, content.subarray(16 * 1024));
        assert.equal(rest.json.receivedBytes, content.length);

        const done = await completeOf(id);
        assert.equal(done.status, 200, done.json && done.json.error);
        assert.equal(done.json.path, '/target/dropped.bin');

        assert.deepEqual(fs.readFileSync(path.join(ROOT, 'target', 'dropped.bin')), content,
            'the delivered file equals the fixture byte-for-byte');
        assert.equal(fs.existsSync(stagingPath(id)), false, 'the staged file is gone');
    });
});

/* ══════════════════════════════════════════
   5.2 — a session survives a server restart
   ══════════════════════════════════════════ */

describe('a server restart between chunks (5.2)', () => {
    test('the session and its staged bytes survive and the transfer completes byte-for-byte', async () => {
        const content = fixture(97, 48 * 1024);
        const opened = await initiateSession({ name: 'survivor.bin', size: content.length });
        assert.equal(opened.status, 200, opened.json && opened.json.error);
        const id = opened.json.sessionId;

        await appendChunk(id, 0, content.subarray(0, 24 * 1024));

        // Restart: the process ends and a fresh instance boots on the same
        // STORAGE_ROOT and the same store. Dropping the require cache and the
        // in-memory cache is the in-process equivalent of a new process — both
        // the record and the staged bytes must come back from disk.
        await stopServer();
        UploadSessionService.cache = null;
        delete require.cache[require.resolve('../../server.js')];
        await bootServer();

        const read = await statusOf(id);
        assert.equal(read.status, 200, 'the session survived the restart');
        assert.equal(read.json.name, 'survivor.bin');
        assert.equal(read.json.state, 'open');
        assert.equal(read.json.receivedBytes, 24 * 1024, 'progress came back from the staged file');

        const rest = await appendChunk(id, 24 * 1024, content.subarray(24 * 1024));
        assert.equal(rest.json.receivedBytes, content.length, 'the new instance accepted the remainder');

        const done = await completeOf(id);
        assert.equal(done.status, 200, done.json && done.json.error);
        assert.deepEqual(fs.readFileSync(path.join(ROOT, 'target', 'survivor.bin')), content,
            'the delivered file equals the fixture byte-for-byte');
        assert.equal(fs.existsSync(stagingPath(id)), false);
    });
});
