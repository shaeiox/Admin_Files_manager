// test/api/upload-chunks.rate-limit.test.js
'use strict';

/**
 * The resumable chunk allowance (resumable-uploads, task 3.2).
 *
 * Two limits have to hold AT ONCE, and they are easy to blur together:
 *   1. MORE THAN 60 chunk appends per minute from one client pass - a large
 *      transfer must not spend the shared 60/min write bucket (server.js's
 *      general limiter skips the chunk route); and
 *   2. the chunk route carries its OWN allowance
 *      (AFM_RATE_LIMIT_CHUNK_PER_MINUTE) and EVERY OTHER mutation still hits
 *      the shared bucket - appends do not launder unlimited write capacity.
 *
 * Booted with tiny budgets so both refusals are reachable without waiting a
 * real minute: the write budget is 6 (login + initiate spend 2 of it) and the
 * chunk allowance is 64. Appends 1-64 pass - including the 61st - the 65th is
 * refused, and ordinary writes run out exactly four requests later, proving
 * the two buckets are separate.
 *
 * Isolation: STORAGE_ROOT and every store (metadata, settings, sessions,
 * admin.sqlite) are redirected to a temp tree BEFORE server.js is required.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { applyBootstrapEnv, redirectAdminDb, login: authLogin } = require('../helpers/authenticated');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-upsess-rate-'));
const ROOT = path.join(TMP, 'root');

const WRITE_BUDGET = 6;   // login + initiate consume 2 of it before the bursts
const CHUNK_BUDGET = 64;  // > 60 by construction: the "more than 60" proof

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_WRITE = process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE;
const ORIGINAL_CHUNK = process.env.AFM_RATE_LIMIT_CHUNK_PER_MINUTE;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE = String(WRITE_BUDGET);
process.env.AFM_RATE_LIMIT_CHUNK_PER_MINUTE = String(CHUNK_BUDGET);

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

function send(method, pathname, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...authHeaders, ...headers };
        if (body !== undefined && finalHeaders['Content-Length'] === undefined) {
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
                    resolve({ status: res.statusCode, headers: res.headers, json });
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

const appendChunk = (id, offset) => send('PUT', `/api/v1/fs/uploads/${id}/chunk?offset=${offset}`, {
    body: Buffer.from('x'),
    headers: { 'Content-Type': 'application/octet-stream' },
});

/** A mutation that never mutates: star a path that does not exist. */
const starRequest = () => sendJson('POST', '/api/v1/fs/star', { path: '/does-not-exist.txt' });

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
    authHeaders = (await authLogin(port)).headers; // spends write slot 1
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
    restore('AFM_RATE_LIMIT_WRITE_PER_MINUTE', ORIGINAL_WRITE);
    restore('AFM_RATE_LIMIT_CHUNK_PER_MINUTE', ORIGINAL_CHUNK);
    require('../../src/db/connection').reset(); // release the sqlite file lock before rmSync (Windows)
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('resumable appends carry their own allowance (3.2)', () => {
    test('more than 60 appends pass; the chunk allowance - not the write bucket - refuses the 65th', async () => {
        // The session is opened for 128 bytes; each append is one byte.
        const opened = await sendJson('POST', '/api/v1/fs/uploads', {
            destination: '/target', name: 'rate.bin', size: 128, lastModified: 1700000000000,
        });
        assert.equal(opened.status, 200, opened.json && opened.json.error); // spends write slot 2
        const id = opened.json.sessionId;

        // CHUNK_BUDGET appends: every one must pass. The write bucket holds 6
        // and would have run dry after 4 more mutations - so passing 61+ here
        // proves the general limiter SKIPS this route.
        for (let i = 0; i < CHUNK_BUDGET; i++) {
            const res = await appendChunk(id, i);
            assert.equal(res.status, 200, `append ${i + 1} -> ${res.status} ${JSON.stringify(res.json)}`);
            assert.equal(res.json.receivedBytes, i + 1, 'the response reports the server reading');
        }

        // The 65th append exceeds the chunk allowance: 429 with Retry-After,
        // the plain error envelope, and NO byte written.
        const refused = await appendChunk(id, CHUNK_BUDGET);
        assert.equal(refused.status, 429);
        assert.match(refused.headers['retry-after'] || '', /^\d+$/);
        assert.equal(refused.json.success, false);
        assert.equal(typeof refused.json.error, 'string');
        assert.equal(refused.json.kind, undefined, 'the limiter, not a session refusal');

        const status = await send('GET', `/api/v1/fs/uploads/${id}`);
        assert.equal(status.json.receivedBytes, CHUNK_BUDGET, 'the refused append wrote nothing');
    });

    test('ordinary writes still hit the shared bucket: appends did not launder it', async () => {
        // The write bucket has seen exactly login (1) and initiate (1); the
        // appends were skipped, so WRITE_BUDGET - 2 = 4 more mutations pass
        // and the fifth is refused.
        for (let i = 0; i < WRITE_BUDGET - 2; i++) {
            const res = await starRequest();
            assert.notEqual(res.status, 429, `star ${i + 1} is within the shared budget`);
        }
        const refused = await starRequest();
        assert.equal(refused.status, 429, 'a non-chunk write is still throttled by the shared bucket');
        assert.match(refused.headers['retry-after'] || '', /^\d+$/);
    });
});
