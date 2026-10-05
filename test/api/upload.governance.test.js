// test/api/upload.governance.test.js
'use strict';

/**
 * Upload resource governance (api-security-hardening, "Uploads Are Governed By
 * Free Space And Concurrency").
 *
 * Two guarantees, one per admission point:
 *   1. below the free-space watermark the upload is refused BEFORE a byte is
 *      staged, so a full disk is never filled by the bytes meant to fill it;
 *   2. more concurrent uploads than the ceiling are refused.
 *
 * Free space is injected through the documented `_useFreeSpaceReader` seam
 * rather than by filling a real disk, so the refusal is deterministic and the
 * test asserts the thing that matters: no `.upload-*.part` survives.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-upload-gov-'));
const ROOT = path.join(TMP, 'root');
const DATA = path.join(TMP, 'data');
fs.mkdirSync(ROOT, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_DATA = process.env.AFM_DATA_DIR;
const ORIGINAL_CONCURRENT = process.env.AFM_UPLOAD_MAX_CONCURRENT;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_DATA_DIR = DATA;
process.env.AFM_UPLOAD_MAX_CONCURRENT = '2';

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

const UploadService = require('../../src/services/UploadService');

let server;
let port;
let restoreFreeSpace = null;

/** Staging files are dot-prefixed, so readdir sees them. */
function stagingFiles() {
    return fs.readdirSync(ROOT).filter((f) => f.startsWith(UploadService.STAGING_PREFIX));
}

function uploadRequest(filename, content = 'PAYLOAD', { fields = {} } = {}) {
    const boundary = '----afmgovernance';
    const head = Object.entries(fields)
        .map(([k, v]) => `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`)
        .join('');
    const body = Buffer.concat([
        Buffer.from(head + `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
        Buffer.from(content),
        Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1', port, path: '/api/v1/fs/upload', method: 'POST',
            headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length },
            agent: false,
        }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
        });
        req.on('error', reject);
        req.end(body);
    });
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
});

after(async () => {
    if (restoreFreeSpace) restoreFreeSpace();
    if (server && server.closeAllConnections) server.closeAllConnections();
    if (server) await new Promise((r) => server.close(r));
    if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT; else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
    if (ORIGINAL_PORT === undefined) delete process.env.PORT; else process.env.PORT = ORIGINAL_PORT;
    if (ORIGINAL_DATA === undefined) delete process.env.AFM_DATA_DIR; else process.env.AFM_DATA_DIR = ORIGINAL_DATA;
    if (ORIGINAL_CONCURRENT === undefined) delete process.env.AFM_UPLOAD_MAX_CONCURRENT; else process.env.AFM_UPLOAD_MAX_CONCURRENT = ORIGINAL_CONCURRENT;
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('free-space governance', () => {
    test('below the watermark the upload is refused and stages nothing', async () => {
        const before = stagingFiles().length;
        // Report 1 KiB free against a watermark far above it.
        restoreFreeSpace = UploadService._useFreeSpaceReader(async () => 1024);

        const res = await uploadRequest('refused.txt', 'PAYLOAD');

        assert.equal(res.status, 507);
        assert.equal(stagingFiles().length, before, 'no staging file was created or left behind');

        const payload = JSON.parse(res.body);
        assert.equal(payload.success, false);
        assert.equal(typeof payload.error, 'string');
        assert.ok(!/\\/i.test(payload.error), 'the error carries no absolute path');
        assert.ok(!fs.existsSync(path.join(ROOT, 'refused.txt')), 'the file was not committed either');
    });

    test('an unreadable capacity reading admits the upload rather than locking the operator out', async () => {
        restoreFreeSpace = UploadService._useFreeSpaceReader(async () => { throw new Error('statfs unavailable'); });
        const res = await uploadRequest('admitted.txt', 'PAYLOAD');
        assert.equal(res.status, 201, 'an unmeasurable capacity is not zero capacity');
        assert.equal(stagingFiles().length, 0, 'the committed upload left no staging file');
        assert.ok(fs.existsSync(path.join(ROOT, 'admitted.txt')));
    });

    test('with room to spare the upload is admitted', async () => {
        restoreFreeSpace = UploadService._useFreeSpaceReader(async () => Number.MAX_SAFE_INTEGER);
        const res = await uploadRequest('roomy.txt', 'PAYLOAD');
        assert.equal(res.status, 201);
        assert.ok(fs.existsSync(path.join(ROOT, 'roomy.txt')));
    });
});

describe('concurrency governance', () => {
    test('excess concurrent uploads are refused with the throttling status', async () => {
        // A generous free-space reading, but deliberately SLOW. The pause happens
        // before any byte is staged while the request is still in flight, which
        // makes the uploads genuinely overlap. Without it these tiny payloads
        // can serialize on a fast host, no request would ever exceed the ceiling,
        // and the assertion would depend on scheduling luck.
        restoreFreeSpace = UploadService._useFreeSpaceReader(
            () => new Promise((resolve) => setTimeout(() => resolve(Number.MAX_SAFE_INTEGER), 40)),
        );

        // The ceiling is 2 (AFM_UPLOAD_MAX_CONCURRENT). Fire 6 at once; with the
        // overlap above, more than two are always in flight together.
        const responses = await Promise.all(
            Array.from({ length: 6 }, (_, i) => uploadRequest(`burst-${i}.txt`, 'PAYLOAD')),
        );
        const throttled = responses.filter((r) => r.status === 429);
        assert.ok(throttled.length > 0, `expected some uploads to be refused, got ${responses.map((r) => r.status).join(',')}`);
        for (const r of throttled) {
            assert.equal(JSON.parse(r.body).success, false);
        }

        // And the refusal never leaves a staging file behind.
        assert.equal(stagingFiles().length, 0, 'a refused upload stages nothing');
    });

    test('the ceiling releases: uploads succeed again once the burst drains', async () => {
        restoreFreeSpace = UploadService._useFreeSpaceReader(async () => Number.MAX_SAFE_INTEGER);
        const res = await uploadRequest('after-burst.txt', 'PAYLOAD');
        assert.equal(res.status, 201, 'the slot returns when the response closes');
        assert.ok(fs.existsSync(path.join(ROOT, 'after-burst.txt')));
    });
});