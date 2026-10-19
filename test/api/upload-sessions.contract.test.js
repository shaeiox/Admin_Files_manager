// test/api/upload-sessions.contract.test.js
'use strict';

/**
 * Resumable upload-session contract, exercised against a LIVE server
 * (resumable-uploads, tasks 2.1-2.6).
 *
 * What is pinned here:
 *   - All five endpoints answer on both /api/v1 and /api, and one session
 *     governs calls made through either prefix.
 *   - Initiate: fingerprint adoption, overwrite refresh, early conflict,
 *     size ceiling (legacy message), the free-space seam, validation.
 *   - Append: sequential streaming, offset mismatch (with receivedBytes),
 *     declared-size overshoot, the chunk cap, chunked transfer-encoding,
 *     and that a concurrent pair leaves an exact prefix on disk.
 *   - Status/complete: the bare read shape, session_incomplete,
 *     destination_conflict (session kept), byte-for-byte placement,
 *     idempotent repeat, zero-byte transfer.
 *   - Abort and visibility: nothing partial ever appears in list/tree, and no
 *     staging file survives abort or completion.
 *   - Auth/CSRF: a refusal changes no session and no file state.
 *
 * Isolation: STORAGE_ROOT, MetadataService.dbPath, SettingsService.dbPath and
 * UploadSessionService.dbPath (plus all caches) are redirected to a temp tree
 * BEFORE server.js is required; admin.sqlite too, so the suite never writes the
 * repository's data/ (AGENTS.md).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { applyBootstrapEnv, redirectAdminDb, login: authLogin } = require('../helpers/authenticated');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-upsess-'));
const ROOT = path.join(TMP, 'root');
const STORE_PATH = path.join(TMP, 'upload-sessions.json');

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_MAX_BYTES = process.env.UPLOAD_MAX_BYTES;
const ORIGINAL_WRITE_LIMIT = process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
// A small, explicit ceiling so the oversize path is exercised without writing
// gigabytes. Read once when the upload module loads, so it is set before require.
const UPLOAD_LIMIT = 2048;
process.env.UPLOAD_MAX_BYTES = String(UPLOAD_LIMIT);
// This suite appends far more chunks per minute than a single real upload
// would trip once the dedicated allowance exists; 0 opts this class out
// entirely (rateLimit.js's documented escape hatch). The allowance's own
// behaviour is task group 3's test, not this file's.
process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE = '0';

const LAST_MODIFIED = 1700000000000;
fs.mkdirSync(path.join(ROOT, 'target'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'other'), { recursive: true });

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;
const SettingsService = require('../../src/services/SettingsService');
SettingsService.dbPath = path.join(TMP, 'settings.json');
SettingsService.cache = null;
const UploadSessionService = require('../../src/services/UploadSessionService');
UploadSessionService.dbPath = STORE_PATH;
UploadSessionService.cache = null;
const UploadService = require('../../src/services/UploadService');
applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;
let authHeaders = {};

/* ── transport ── */

function send(method, pathname, { body, headers = {}, auth = true, chunked = false } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...(auth ? authHeaders : {}), ...headers };
        if (body !== undefined && !chunked && finalHeaders['Content-Length'] === undefined) {
            finalHeaders['Content-Length'] = Buffer.byteLength(body);
        }
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

const sendJson = (method, pathname, payload, opts = {}) => send(method, pathname, {
    ...opts,
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
});

/** POST /fs/uploads with sane defaults; `payload` wins over the defaults. */
const initiateSession = (payload, prefix = '/api/v1') => sendJson('POST', `${prefix}/fs/uploads`, {
    destination: '/target',
    name: 'a.bin',
    size: 0,
    lastModified: LAST_MODIFIED,
    ...payload,
});

/** The raw-body append: exactly one octet-stream chunk. */
function appendChunk(id, offset, content, { headers = {}, ...opts } = {}) {
    return send('PUT', `/api/v1/fs/uploads/${id}/chunk?offset=${offset}`, {
        ...opts,
        body: Buffer.isBuffer(content) ? content : Buffer.from(content),
        headers: { 'Content-Type': 'application/octet-stream', ...headers },
    });
}

const statusOf = (id) => send('GET', `/api/v1/fs/uploads/${id}`);
const completeOf = (id, payload = {}) => sendJson('POST', `/api/v1/fs/uploads/${id}/complete`, payload);
const abortOf = (id) => send('DELETE', `/api/v1/fs/uploads/${id}`);

/* ── disk readers (the assertions about state inspect the disk, never prose) ── */

const stagingPath = (id, dir = 'target') => path.join(ROOT, dir, `.upload-${id}.part`);

function stagingLeftovers() {
    const out = [];
    const walk = (dir, prefix) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name.startsWith('.upload-') && entry.name.endsWith('.part')) out.push(`${prefix}/${entry.name}`);
            if (entry.isDirectory()) walk(path.join(dir, entry.name), `${prefix}/${entry.name}`);
        }
    };
    walk(ROOT, '');
    return out;
}

const readStore = () => (fs.existsSync(STORE_PATH) ? JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) : null);

/** Open a fresh session for one small transfer and hand back its id. */
async function openSession({ name, size, destination = '/target', overwrite = false }) {
    const res = await initiateSession({ name, size, destination, overwrite });
    assert.equal(res.status, 200, `initiate ${name} -> ${res.status} ${res.text || ''}`);
    return res.json.sessionId;
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
    authHeaders = (await authLogin(port)).headers;
});

after(async () => {
    if (server) {
        if (server.closeAllConnections) server.closeAllConnections();
        await new Promise((r) => server.close(r));
        server = null;
    }
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
   2.1 / 2.6 — surface and access control
   ══════════════════════════════════════════ */

describe('the upload-session surface (2.1)', () => {
    test('one session governs both prefixes: /api initiates, /api/v1 continues, /api aborts', async () => {
        const opened = await initiateSession({ name: 'alias.bin', size: 6 }, '/api');
        assert.equal(opened.status, 200, opened.json && opened.json.error);
        const id = opened.json.sessionId;

        const read = await statusOf(id);
        assert.equal(read.status, 200, 'the v1 status sees the alias-created session');
        assert.equal(read.json.name, 'alias.bin');

        await appendChunk(id, 0, 'abcdef');
        const aborted = await abortOf(id);
        assert.equal(aborted.status, 200);
        assert.equal((await statusOf(id)).status, 404, 'the session is gone whichever prefix asks');
    });

    test('an unauthenticated mutation is refused and changes no session state', async () => {
        const before = readStore();

        const bare = await sendJson('POST', '/api/v1/fs/uploads',
            { destination: '/target', name: 'unauth.bin', size: 3, lastModified: LAST_MODIFIED },
            { auth: false });
        assert.equal(bare.status, 401);
        assert.equal(bare.json.success, false);

        assert.deepEqual(readStore(), before, 'the refused call wrote nothing');
        assert.equal(fs.existsSync(path.join(ROOT, 'target', 'unauth.bin')), false);

        // Sanity: the same payload succeeds once authenticated.
        const authed = await initiateSession({ name: 'unauth.bin', size: 3 });
        assert.equal(authed.status, 200);
        await abortOf(authed.json.sessionId);
    });

    test('a CSRF-less mutation is refused and changes no session or file state', async () => {
        const id = await openSession({ name: 'csrf.bin', size: 10 });
        await appendChunk(id, 0, 'abcd');

        const cookieOnly = { Cookie: authHeaders.Cookie };
        const initiated = await sendJson('POST', '/api/v1/fs/uploads',
            { name: 'csrf-2.bin', size: 3 }, { auth: false, headers: cookieOnly });
        assert.equal(initiated.status, 403);
        assert.equal(initiated.json.success, false);

        const appended = await send('PUT', `/api/v1/fs/uploads/${id}/chunk?offset=4`, {
            auth: false,
            headers: { ...cookieOnly, 'Content-Type': 'application/octet-stream', 'Content-Length': 2 },
            body: 'EF',
        });
        assert.equal(appended.status, 403);

        const read = await statusOf(id);
        assert.equal(read.json.receivedBytes, 4, 'the refused append moved no byte');
        assert.equal(fs.readFileSync(stagingPath(id), 'utf8'), 'abcd');
    });
});

/* ══════════════════════════════════════════
   2.2 — initiate
   ══════════════════════════════════════════ */

describe('initiate (2.2)', () => {
    test('a new session opens with a 32-hex id, zero progress, and an ISO expiry', async () => {
        const res = await initiateSession({ name: 'fresh.bin', size: 5 });
        assert.equal(res.status, 200);
        assert.equal(res.json.success, true);
        assert.match(res.json.sessionId, /^[0-9a-f]{32}$/);
        assert.equal(res.json.receivedBytes, 0);
        assert.ok(!Number.isNaN(Date.parse(res.json.expiresAt)), 'expiresAt parses');

        const record = readStore().sessions[res.json.sessionId];
        assert.equal(record.destination, '/target');
        assert.equal(record.state, 'open');
        assert.equal(fs.existsSync(stagingPath(res.json.sessionId)), false, 'initiate stages no byte');
    });

    test('re-initiate with the same fingerprint adopts the session and reports server progress', async () => {
        const id = await openSession({ name: 'adopt.bin', size: 10 });
        await appendChunk(id, 0, 'abc');

        const again = await initiateSession({ name: 'adopt.bin', size: 10 });
        assert.equal(again.status, 200);
        assert.equal(again.json.sessionId, id, 'same session, not a sibling');
        assert.equal(again.json.receivedBytes, 3, 'progress is the staged size, not a client claim');
    });

    test('an existing target is refused 409 destination_conflict before the store changes', async () => {
        fs.writeFileSync(path.join(ROOT, 'target', 'taken.bin'), 'already here');
        const before = readStore();

        const refused = await initiateSession({ name: 'taken.bin', size: 4 });
        assert.equal(refused.status, 409);
        assert.equal(refused.json.kind, 'destination_conflict');
        assert.deepEqual(readStore(), before, 'no record was created');

        const authorized = await initiateSession({ name: 'taken.bin', size: 4, overwrite: true });
        assert.equal(authorized.status, 200, 'overwrite:true is the legacy early-refusal parity path');
    });

    test('re-initiating refreshes the overwrite flag without a new session', async () => {
        fs.writeFileSync(path.join(ROOT, 'target', 'refresh.bin'), 'existing');
        const id = await openSession({ name: 'refresh.bin', size: 4, overwrite: true });

        const refreshed = await initiateSession({ name: 'refresh.bin', size: 4, overwrite: false });
        assert.equal(refreshed.json.sessionId, id);
        assert.equal(readStore().sessions[id].overwrite, false, 'the re-initiate re-asserted the policy');
    });

    test('a declared size over the ceiling is refused 413 size_exceeded with the legacy message', async () => {
        const before = readStore();

        const res = await initiateSession({ name: 'big.bin', size: UPLOAD_LIMIT + 1 });
        assert.equal(res.status, 413);
        assert.equal(res.json.kind, 'size_exceeded');
        assert.equal(res.json.error,
            `File exceeds the maximum upload size of ${UploadService.formatLimit(UPLOAD_LIMIT)} (${UPLOAD_LIMIT} bytes).`);
        assert.deepEqual(readStore(), before);
    });

    test('the free-space gate refuses 507 before any byte is staged (seam)', async () => {
        const leftoversBefore = stagingLeftovers();
        const previous = UploadService._useFreeSpaceReader(() => 0);
        try {
            const before = readStore();
            const res = await initiateSession({ name: 'nospace.bin', size: 4 });
            assert.equal(res.status, 507);
            assert.match(res.json.error, /free space/i);
            assert.deepEqual(readStore(), before, 'the record is not created');
        } finally {
            UploadService._useFreeSpaceReader(previous);
        }
        assert.deepEqual(stagingLeftovers(), leftoversBefore, 'no staging file appeared');
    });

    test('an invalid destination, name, or size is refused before the store changes', async () => {
        const before = readStore();
        const cases = [
            [{ destination: '/no-such-dir', name: 'a.bin', size: 4 }, 400],
            [{ destination: '/../escape', name: 'a.bin', size: 4 }, 403],
            [{ name: '../a.bin', size: 4 }, 400],
            [{ name: 'CON', size: 4 }, 400],
            [{ name: 'a.bin', size: '4' }, 400],
            [{ name: 'a.bin', size: -1 }, 400],
            [{ name: 'a.bin', size: 4, lastModified: 'yesterday' }, 400],
        ];
        for (const [payload, expected] of cases) {
            const res = await initiateSession(payload);
            assert.equal(res.status, expected, `${JSON.stringify(payload)} -> ${res.status} ${res.json && res.json.error}`);
            assert.equal(res.json.success, false);
        }
        assert.deepEqual(readStore(), before);
    });
});

/* ══════════════════════════════════════════
   2.3 — append
   ══════════════════════════════════════════ */

describe('append (2.3)', () => {
    test('sequential chunks stream to staging and answer the server reading', async () => {
        const id = await openSession({ name: 'seq.bin', size: 10 });

        const first = await appendChunk(id, 0, '01234');
        assert.equal(first.status, 200);
        assert.deepEqual(first.json, { success: true, receivedBytes: 5 });

        const second = await appendChunk(id, 5, '56789');
        assert.deepEqual(second.json, { success: true, receivedBytes: 10 });
        assert.equal(fs.readFileSync(stagingPath(id), 'utf8'), '0123456789');
    });

    test('an offset that is not the stored size is refused 409 offset_mismatch with receivedBytes', async () => {
        const id = await openSession({ name: 'offset.bin', size: 10 });
        await appendChunk(id, 0, 'abcde');

        const res = await appendChunk(id, 3, 'XYZ');
        assert.equal(res.status, 409);
        assert.equal(res.json.kind, 'offset_mismatch');
        assert.equal(res.json.receivedBytes, 5, 'the refusal carries the server reading');
        assert.equal(fs.readFileSync(stagingPath(id), 'utf8'), 'abcde', 'nothing was written');
    });

    test('a declared chunk length over the 32 MiB cap is refused 413 chunk_too_large before reading', async () => {
        const id = await openSession({ name: 'cap.bin', size: 100 });
        // Only the DECLARED length triggers this pre-check, so the test declares
        // an oversized Content-Length but sends one byte - a real oversized
        // chunk would carry the same declaration, and the server refuses at the
        // header, before any body byte is read.
        const res = await appendChunk(id, 0, 'x', {
            headers: { 'Content-Length': String(32 * 1024 * 1024 + 1) },
        });
        assert.equal(res.status, 413);
        assert.equal(res.json.kind, 'chunk_too_large');
        assert.equal((await statusOf(id)).json.receivedBytes, 0);
    });

    test('a chunk that would push past the declared size is refused 413 size_exceeded', async () => {
        const id = await openSession({ name: 'overshoot.bin', size: 5 });

        const res = await appendChunk(id, 0, 'toobig');
        assert.equal(res.status, 413);
        assert.equal(res.json.kind, 'size_exceeded');
        assert.equal((await statusOf(id)).json.receivedBytes, 0, 'the refusal wrote nothing');
    });

    test('a chunked-transfer append with no content-length still lands', async () => {
        const id = await openSession({ name: 'chunked.bin', size: 6 });

        const res = await appendChunk(id, 0, 'ab', { chunked: true });
        assert.equal(res.status, 200, res.json && res.json.error);
        assert.equal(res.json.receivedBytes, 2);
        assert.equal(fs.readFileSync(stagingPath(id), 'utf8'), 'ab');
    });

    test('two concurrent appends at one offset leave exactly one winner and an exact prefix', async () => {
        const id = await openSession({ name: 'race.bin', size: 8 });

        const [r1, r2] = await Promise.all([
            appendChunk(id, 0, 'AAAA'),
            appendChunk(id, 0, 'BBBB'),
        ]);

        assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
        const loser = r1.status === 200 ? r2 : r1;
        const winnerBody = r1.status === 200 ? 'AAAA' : 'BBBB';
        assert.equal(loser.json.kind, 'offset_mismatch');
        assert.equal(loser.json.receivedBytes, 4);
        assert.equal(fs.readFileSync(stagingPath(id), 'utf8'), winnerBody,
            'the stored data is exactly one request\'s bytes, not a blend');
        assert.equal((await statusOf(id)).json.receivedBytes, 4);
    });

    test('an append to an unknown session is 404 session_expired', async () => {
        const res = await appendChunk('f'.repeat(32), 0, 'x');
        assert.equal(res.status, 404);
        assert.equal(res.json.kind, 'session_expired');
    });
});

/* ══════════════════════════════════════════
   2.4 — status and complete
   ══════════════════════════════════════════ */

describe('status and complete (2.4)', () => {
    test('the status read is bare and carries the server reading', async () => {
        const id = await openSession({ name: 'status.bin', size: 9 });
        await appendChunk(id, 0, 'wxyz');

        const res = await statusOf(id);
        assert.equal(res.status, 200);
        assert.equal(res.json.success, undefined, 'read-only aggregate: no envelope');
        assert.deepEqual(Object.keys(res.json).sort(),
            ['destination', 'expiresAt', 'id', 'name', 'receivedBytes', 'size', 'state']);
        assert.equal(res.json.id, id);
        assert.equal(res.json.state, 'open');
        assert.equal(res.json.receivedBytes, 4);
    });

    test('an incomplete session refuses completion 409 session_incomplete and keeps the bytes', async () => {
        const id = await openSession({ name: 'partial.bin', size: 10 });
        await appendChunk(id, 0, 'abcde');

        const res = await completeOf(id);
        assert.equal(res.status, 409);
        assert.equal(res.json.kind, 'session_incomplete');
        assert.equal(res.json.receivedBytes, 5);
        const read = await statusOf(id);
        assert.equal(read.json.state, 'open');
        assert.equal(read.json.receivedBytes, 5);
        assert.equal(fs.readFileSync(stagingPath(id), 'utf8'), 'abcde');
    });

    test('an interrupted transfer resumes by fingerprint and completes byte-for-byte', async () => {
        const content = '0123456789abcdef';
        const id = await openSession({ name: 'flow.bin', size: content.length });
        await appendChunk(id, 0, content.slice(0, 7)); // the connection drops here

        // The page reloaded: the queue is gone, re-selecting the file re-offers
        // the same fingerprint and is adopted mid-transfer.
        const again = await initiateSession({ name: 'flow.bin', size: content.length });
        assert.equal(again.json.sessionId, id);
        assert.equal(again.json.receivedBytes, 7);

        await appendChunk(id, 7, content.slice(7));
        const done = await completeOf(id);
        assert.equal(done.status, 200);
        assert.equal(done.json.path, '/target/flow.bin');
        assert.equal(fs.readFileSync(path.join(ROOT, 'target', 'flow.bin'), 'utf8'), content);
        assert.equal(fs.existsSync(stagingPath(id)), false, 'no staging file survives completion');
    });

    test('completing a completed session is idempotent within the tombstone', async () => {
        const id = await openSession({ name: 'repeat.bin', size: 3 });
        await appendChunk(id, 0, 'abc');
        const first = await completeOf(id);
        assert.equal(first.status, 200);

        const again = await completeOf(id);
        assert.equal(again.status, 200);
        assert.equal(again.json.path, first.json.path);
        assert.equal((await statusOf(id)).json.state, 'completed');
        assert.equal((await statusOf(id)).json.receivedBytes, 3);
    });

    test('a target that appeared mid-transfer refuses placement 409 destination_conflict, session kept', async () => {
        const id = await openSession({ name: 'blocked.bin', size: 4 });
        await appendChunk(id, 0, 'data');
        fs.writeFileSync(path.join(ROOT, 'target', 'blocked.bin'), 'squatter'); // appeared meanwhile

        const refused = await completeOf(id);
        assert.equal(refused.status, 409);
        assert.equal(refused.json.kind, 'destination_conflict');
        const read = await statusOf(id);
        assert.equal(read.json.state, 'open', 'still resumable');
        assert.equal(read.json.receivedBytes, 4);
        assert.equal(fs.readFileSync(stagingPath(id), 'utf8'), 'data');

        const authorized = await completeOf(id, { overwrite: true });
        assert.equal(authorized.status, 200, authorized.json && authorized.json.error);
        assert.equal(fs.readFileSync(path.join(ROOT, 'target', 'blocked.bin'), 'utf8'), 'data');
    });

    test('a zero-byte session completes into an empty file', async () => {
        const id = await openSession({ name: 'empty.bin', size: 0 });
        const done = await completeOf(id);
        assert.equal(done.status, 200);
        assert.equal(fs.readFileSync(path.join(ROOT, 'target', 'empty.bin'), 'utf8'), '');
        assert.equal(fs.existsSync(stagingPath(id)), false);
    });
});

/* ══════════════════════════════════════════
   2.5 — abort and visibility
   ══════════════════════════════════════════ */

describe('abort and visibility (2.5)', () => {
    test('staging is invisible to list and tree while the session is open', async () => {
        const id = await openSession({ name: 'hidden.bin', size: 10 });
        await appendChunk(id, 0, 'secre');

        const list = await send('GET', '/api/v1/fs/list?path=/target');
        assert.equal(list.status, 200);
        assert.ok(!list.json.items.some((i) => i.name.startsWith('.upload-')), 'staging is not listed');

        const tree = await send('GET', '/api/v1/fs/tree?path=/target');
        assert.equal(tree.status, 200);
        assert.ok(!JSON.stringify(tree.json).includes('.upload-'), 'staging is not walked');

        await abortOf(id); // leave the tree clean for the later suites
    });

    test('abort removes the staged bytes and the record; later calls read 404', async () => {
        const id = await openSession({ name: 'gone.bin', size: 10 });
        await appendChunk(id, 0, 'bytes');

        const res = await abortOf(id);
        assert.equal(res.status, 200);
        assert.deepEqual(res.json, { success: true });
        assert.equal(fs.existsSync(stagingPath(id)), false, 'staged bytes are gone');
        assert.equal(readStore().sessions[id], undefined, 'the record is gone');

        const read = await statusOf(id);
        assert.equal(read.status, 404);
        assert.equal(read.json.kind, 'session_expired');
        assert.equal((await completeOf(id)).status, 404);
    });

    test('aborting an unknown id answers 404 session_expired', async () => {
        const res = await abortOf('e'.repeat(32));
        assert.equal(res.status, 404);
        assert.equal(res.json.kind, 'session_expired');
    });
});
