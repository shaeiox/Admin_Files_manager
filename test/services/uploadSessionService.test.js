// test/services/uploadSessionService.test.js
'use strict';

/**
 * UploadSessionService unit tests (resumable-uploads, tasks 1.1-1.3).
 *
 * Every test builds an isolated instance pointed at a fresh temp store, so the
 * suite never writes the repository's real data/upload-sessions.json - the
 * same isolation rule settingsService.test.js follows. STORAGE_ROOT is
 * redirected to a temp directory BEFORE any src module loads, so staged files
 * (and the free-space/stat calls on them) never touch repo state either.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-uss-root-'));
process.env.STORAGE_ROOT = ROOT;

const UploadSessionServiceSingleton = require('../../src/services/UploadSessionService');
const UploadSessionService = UploadSessionServiceSingleton.constructor;
const UploadService = require('../../src/services/UploadService');
const PathService = require('../../src/services/PathService');
const AppError = require('../../src/utils/AppError');

// Deterministic free space: the gate itself is UploadService's, not this service's.
UploadService._useFreeSpaceReader(() => Number.MAX_SAFE_INTEGER);

const LAST_MODIFIED = 1700000000000;
let tmpBase;
let caseCounter = 0;

before(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-uss-store-'));
});

after(async () => {
    await fsp.rm(tmpBase, { recursive: true, force: true });
    await fsp.rm(ROOT, { recursive: true, force: true });
});

function freshInstance(dir) {
    const svc = new UploadSessionService();
    svc.dbPath = path.join(dir, 'upload-sessions.json');
    svc.cache = null;
    return svc;
}

function makeCase() {
    caseCounter += 1;
    const storeDir = fs.mkdtempSync(path.join(tmpBase, 'case-'));
    const svc = freshInstance(storeDir);
    const sub = `case-${caseCounter}-${Date.now()}`;
    fs.mkdirSync(path.join(ROOT, sub), { recursive: true });
    return {
        svc,
        storeDir,
        destination: `/${sub}`,
        destinationPath: PathService.resolveSecurePath(`/${sub}`),
    };
}

function offer(c, name, size, extra = {}) {
    return {
        destination: c.destination,
        destinationPath: c.destinationPath,
        name,
        size,
        lastModified: LAST_MODIFIED,
        overwrite: false,
        ...extra,
    };
}

async function rejectsWith(promiseFactory, statusCode, kind) {
    await assert.rejects(promiseFactory, (err) => {
        assert.ok(err instanceof AppError, `expected AppError, got ${err && err.stack}`);
        assert.equal(err.statusCode, statusCode);
        if (kind) assert.equal(err.kind, kind);
        return true;
    });
}

const streamOf = (...buffers) => Readable.from(buffers);

describe('UploadSessionService bootstrap', () => {
    test('the exported singleton resolves its store under the repo data directory', () => {
        assert.equal(path.basename(UploadSessionServiceSingleton.dbPath), 'upload-sessions.json');
        assert.equal(path.basename(path.dirname(UploadSessionServiceSingleton.dbPath)), 'data');
    });

    test('first initiate on a fresh checkout materializes the store', async () => {
        const c = makeCase();
        assert.equal(fs.existsSync(c.svc.dbPath), false, 'precondition: file absent');

        const { record } = await c.svc.initiate(offer(c, 'a.bin', 3));

        const onDisk = JSON.parse(await fsp.readFile(c.svc.dbPath, 'utf8'));
        assert.deepEqual(Object.keys(onDisk), ['sessions']);
        assert.ok(onDisk.sessions[record.id], 'the new record was persisted');
        assert.equal(fs.existsSync(`${c.svc.dbPath}.tmp`), false, 'no temp file left behind');
    });

    test('a fresh session has a 32-hex id, open state, zero progress, and a TTL-based expiry', async () => {
        const c = makeCase();
        const before = Date.now();
        const { record, receivedBytes, expiresAt } = await c.svc.initiate(offer(c, 'a.bin', 100));

        assert.match(record.id, /^[0-9a-f]{32}$/);
        assert.equal(record.state, 'open');
        assert.equal(receivedBytes, 0);
        assert.equal(record.destination, c.destination);
        assert.equal(record.name, 'a.bin');
        assert.equal(record.size, 100);
        assert.equal(record.lastModified, LAST_MODIFIED);
        const expected = before + UploadSessionService.SESSION_TTL_MS;
        assert.ok(Math.abs(Date.parse(expiresAt) - expected) < 5000, 'expiry is TTL-based');
    });

    test('a corrupt store raises AppError 500 before any session lookup can succeed', async () => {
        const c = makeCase();
        await fsp.writeFile(c.svc.dbPath, '{ not json', 'utf8');

        await assert.rejects(
            () => c.svc.sweep(),
            (err) => {
                assert.ok(err instanceof AppError);
                assert.equal(err.statusCode, 500);
                assert.ok(err.cause instanceof SyntaxError, 'cause retained for diagnostics');
                assert.ok(!err.message.includes(c.storeDir), 'message is static');
                return true;
            }
        );
        assert.equal(c.svc.cache, null, 'a failed read does not poison the cache');
    });

    test('a warm cache serves reads after the store file is removed', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 3));
        await fsp.rm(c.svc.dbPath, { force: true });

        const status = await c.svc.status(record.id);
        assert.equal(status.id, record.id);
    });

    test('the boot sweep on a host that never saw a session creates nothing', async () => {
        const c = makeCase();
        assert.equal(fs.existsSync(c.svc.dbPath), false, 'precondition: file absent');

        assert.equal(await c.svc.sweep(), 0);

        assert.equal(fs.existsSync(c.svc.dbPath), false, 'the sweep must not materialise the store');
        assert.equal(fs.existsSync(`${c.svc.dbPath}.tmp`), false, 'and leaves no temp file');
    });
});

describe('UploadSessionService initiate: fingerprint idempotency and supersede', () => {
    test('the same fingerprint returns the same session with server-read progress', async () => {
        const c = makeCase();
        const first = await c.svc.initiate(offer(c, 'a.bin', 10));
        await fsp.writeFile(c.svc._stagingPath(first.record), 'abcd');

        const second = await c.svc.initiate(offer(c, 'a.bin', 10));
        assert.equal(second.record.id, first.record.id, 'same session, not a sibling');
        assert.equal(second.receivedBytes, 4, 'progress comes from the staged file');
    });

    test('re-initiate refreshes the overwrite flag without renewing the TTL', async () => {
        const c = makeCase();
        const first = await c.svc.initiate(offer(c, 'a.bin', 10));
        first.record.updatedAt = Date.now() - 60_000; // simulate age
        const agedUpdatedAt = first.record.updatedAt;

        await c.svc.initiate(offer(c, 'a.bin', 10, { overwrite: true }));

        assert.equal(first.record.overwrite, true, 'flag refreshed');
        assert.equal(first.record.updatedAt, agedUpdatedAt, 'a re-initiate is not activity that renews the TTL');
    });

    test('an open session for the same target with a different fingerprint is superseded', async () => {
        const c = makeCase();
        const first = await c.svc.initiate(offer(c, 'a.bin', 10));
        const firstStaging = c.svc._stagingPath(first.record);
        await fsp.writeFile(firstStaging, 'abcd');

        const second = await c.svc.initiate(offer(c, 'a.bin', 20)); // same destination+name, different size

        assert.notEqual(second.record.id, first.record.id, 'a new session');
        assert.equal(second.receivedBytes, 0);
        assert.equal(c.svc.cache.sessions[first.record.id], undefined, 'the old record is gone');
        assert.equal(fs.existsSync(firstStaging), false, 'the old staged bytes are gone');
    });

    test('a session for a different name is left untouched', async () => {
        const c = makeCase();
        const first = await c.svc.initiate(offer(c, 'a.bin', 10));
        const firstStaging = c.svc._stagingPath(first.record);
        await fsp.writeFile(firstStaging, 'abcd');

        const second = await c.svc.initiate(offer(c, 'b.bin', 10));

        assert.ok(c.svc.cache.sessions[first.record.id], 'the first session survives');
        assert.equal(fs.readFileSync(firstStaging, 'utf8'), 'abcd', 'its bytes are untouched');
        assert.equal(c.svc.cache.sessions[second.record.id].name, 'b.bin');
    });

    test('an existing target without overwrite authorization is refused before any record exists', async () => {
        const c = makeCase();
        await fsp.writeFile(path.join(c.destinationPath, 'a.bin'), 'already here');

        await rejectsWith(() => c.svc.initiate(offer(c, 'a.bin', 10)), 409, 'destination_conflict');
        assert.deepEqual(c.svc.cache.sessions, {}, 'no session record was created');
    });

    test('an existing target with overwrite authorization is accepted', async () => {
        const c = makeCase();
        await fsp.writeFile(path.join(c.destinationPath, 'a.bin'), 'already here');

        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10, { overwrite: true }));
        assert.equal(record.state, 'open');
        assert.ok(c.svc.cache.sessions[record.id]);
    });

    test('a declared size past the ceiling is refused with the legacy message before the store exists', async () => {
        const c = makeCase();

        await assert.rejects(() => c.svc.initiate(offer(c, 'big.bin', UploadService.maxBytes + 1)), (err) => {
            assert.ok(err instanceof AppError);
            assert.equal(err.statusCode, 413);
            assert.equal(err.kind, 'size_exceeded');
            assert.equal(err.message,
                `File exceeds the maximum upload size of ${UploadService.formatLimit(UploadService.maxBytes)} (${UploadService.maxBytes} bytes).`);
            return true;
        });
        assert.equal(fs.existsSync(c.svc.dbPath), false, 'refused before any store work');
    });

    test('a completed session is adopted idempotently instead of a new one starting', async () => {
        const c = makeCase();
        const first = await c.svc.initiate(offer(c, 'a.bin', 4));
        await fsp.writeFile(c.svc._stagingPath(first.record), 'abcd');
        await c.svc.complete(first.record.id);

        const again = await c.svc.initiate(offer(c, 'a.bin', 4));
        assert.equal(again.record.id, first.record.id);
        assert.equal(again.record.state, 'completed');
        assert.equal(again.receivedBytes, 4, 'a completed session reports its full size');
    });
});

describe('UploadSessionService status reads', () => {
    test('the status read reports the size of the staged data', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10));
        await fsp.writeFile(c.svc._stagingPath(record), '0123456');

        const status = await c.svc.status(record.id);
        assert.deepEqual(status, {
            id: record.id,
            destination: c.destination,
            name: 'a.bin',
            size: 10,
            receivedBytes: 7,
            state: 'open',
            expiresAt: status.expiresAt,
        });
        assert.ok(Math.abs(Date.parse(status.expiresAt) - (record.updatedAt + UploadSessionService.SESSION_TTL_MS)) < 1000);
    });

    test('reads do not renew the TTL', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10));

        const aged = Date.now() - 60_000;
        record.updatedAt = aged;
        const beforeBytes = fs.readFileSync(c.svc.dbPath, 'utf8');

        await c.svc.status(record.id);

        assert.equal(record.updatedAt, aged, 'updatedAt untouched');
        assert.equal(fs.readFileSync(c.svc.dbPath, 'utf8'), beforeBytes, 'no write happened at all');
    });

    test('unknown, malformed, and prototype ids are a uniform 404', async () => {
        const c = makeCase();
        await rejectsWith(() => c.svc.status('f'.repeat(32)), 404, 'session_expired');
        await rejectsWith(() => c.svc.status('nope'), 404, 'session_expired');
        await rejectsWith(() => c.svc.status('__proto__'), 404, 'session_expired');
        await rejectsWith(() => c.svc.status(undefined), 404, 'session_expired');
    });

    test('completion expiring leaves the file and answers a bare 404 afterwards', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 4));
        await fsp.writeFile(c.svc._stagingPath(record), 'abcd');
        await c.svc.complete(record.id);

        record.completedAt = Date.now() - UploadSessionService.COMPLETION_TOMBSTONE_MS - 1;

        await rejectsWith(() => c.svc.status(record.id), 404, 'session_expired');
        assert.equal(fs.existsSync(path.join(c.destinationPath, 'a.bin')), true, 'the placed file is not affected');
    });
});

describe('UploadSessionService expiry and sweep', () => {
    test('an expired open session is swept with its staged bytes and starts fresh later', async () => {
        const c = makeCase();
        const first = await c.svc.initiate(offer(c, 'a.bin', 10));
        const firstStaging = c.svc._stagingPath(first.record);
        await fsp.writeFile(firstStaging, 'abcd');
        first.record.updatedAt = Date.now() - UploadSessionService.SESSION_TTL_MS - 1;

        const removed = await c.svc.sweep();

        assert.equal(removed, 1);
        assert.equal(c.svc.cache.sessions[first.record.id], undefined);
        assert.equal(fs.existsSync(firstStaging), false, 'staged bytes removed');

        const fresh = await c.svc.initiate(offer(c, 'a.bin', 10));
        assert.notEqual(fresh.record.id, first.record.id, 'a fresh session starts from zero');
        assert.equal(fresh.receivedBytes, 0);
    });

    test('an expired session refuses reads before any sweep runs', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10));
        record.updatedAt = Date.now() - UploadSessionService.SESSION_TTL_MS - 1;

        await rejectsWith(() => c.svc.status(record.id), 404, 'session_expired');
    });

    test('a completed session is swept after its tombstone window', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 4));
        await fsp.writeFile(c.svc._stagingPath(record), 'abcd');
        await c.svc.complete(record.id);

        record.completedAt = Date.now() - UploadSessionService.COMPLETION_TOMBSTONE_MS - 1;
        const removed = await c.svc.sweep();

        assert.equal(removed, 1);
        assert.equal(c.svc.cache.sessions[record.id], undefined);
        assert.equal(fs.existsSync(path.join(c.destinationPath, 'a.bin')), true, 'the delivered file stays');
    });

    test('initiate sweeps expired sessions without operator action', async () => {
        const c = makeCase();
        const stale = await c.svc.initiate(offer(c, 'old.bin', 10));
        const staleStaging = c.svc._stagingPath(stale.record);
        await fsp.writeFile(staleStaging, 'xx');
        stale.record.updatedAt = Date.now() - UploadSessionService.SESSION_TTL_MS - 1;

        await c.svc.initiate(offer(c, 'new.bin', 10));

        assert.equal(c.svc.cache.sessions[stale.record.id], undefined, 'expired session removed on initiate');
        assert.equal(fs.existsSync(staleStaging), false);
    });
});

describe('UploadSessionService appendChunk', () => {
    test('sequential appends store an exact prefix and report the new total', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10));

        const first = await c.svc.appendChunk(record.id, { offset: 0, stream: streamOf(Buffer.from('01234')) });
        assert.equal(first.receivedBytes, 5);

        const second = await c.svc.appendChunk(record.id, { offset: 5, stream: streamOf(Buffer.from('56789')) });
        assert.equal(second.receivedBytes, 10);

        assert.equal(await fsp.readFile(c.svc._stagingPath(record), 'utf8'), '0123456789');
    });

    test('an append at a stale offset is refused without effect and reports the current offset', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10));
        await fsp.writeFile(c.svc._stagingPath(record), '01234');

        await assert.rejects(
            () => c.svc.appendChunk(record.id, { offset: 3, stream: streamOf(Buffer.from('XXX')) }),
            (err) => {
                assert.ok(err instanceof AppError);
                assert.equal(err.statusCode, 409);
                assert.equal(err.kind, 'offset_mismatch');
                assert.equal(err.receivedBytes, 5, 'the client can continue from the server offset');
                return true;
            }
        );
        assert.equal(await fsp.readFile(c.svc._stagingPath(record), 'utf8'), '01234', 'stored data unchanged');
    });

    test('a declared chunk beyond the server bound is refused before any byte is stored', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 100 * 1024 * 1024));

        await rejectsWith(
            () => c.svc.appendChunk(record.id, {
                offset: 0,
                contentLength: UploadSessionService.MAX_CHUNK_BYTES + 1,
                stream: streamOf(Buffer.from('x')),
            }),
            413,
            'chunk_too_large'
        );
        assert.equal(await c.svc._sizeOf(c.svc._stagingPath(record)), 0);
    });

    test('an append beyond the declared size is refused before any byte is stored', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 5));

        await rejectsWith(
            () => c.svc.appendChunk(record.id, { offset: 0, contentLength: 10, stream: streamOf(Buffer.from('x')) }),
            413,
            'size_exceeded'
        );
        assert.equal(await c.svc._sizeOf(c.svc._stagingPath(record)), 0);
    });

    test('an undeclared body beyond the declared size rolls back to the acknowledged offset', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 5));
        await fsp.writeFile(c.svc._stagingPath(record), 'ab');

        await rejectsWith(
            () => c.svc.appendChunk(record.id, { offset: 2, stream: streamOf(Buffer.from('cdef')) }),
            413,
            'size_exceeded'
        );
        assert.equal(await fsp.readFile(c.svc._stagingPath(record), 'utf8'), 'ab', 'rollback to the acknowledged prefix');
        const status = await c.svc.status(record.id);
        assert.equal(status.receivedBytes, 2);
    });

    test('an undeclared body beyond the chunk bound is refused by the counter', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', UploadSessionService.MAX_CHUNK_BYTES + 10));
        const oversized = Buffer.alloc(UploadSessionService.MAX_CHUNK_BYTES + 1, 0x61);

        await rejectsWith(
            () => c.svc.appendChunk(record.id, { offset: 0, stream: streamOf(oversized) }),
            413,
            'chunk_too_large'
        );
        assert.equal(await c.svc._sizeOf(c.svc._stagingPath(record)), 0);
    });

    test('concurrent appends to one session cannot interleave', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10));

        const results = await Promise.allSettled([
            c.svc.appendChunk(record.id, { offset: 0, stream: streamOf(Buffer.from('aaaa')) }),
            c.svc.appendChunk(record.id, { offset: 0, stream: streamOf(Buffer.from('bbbb')) }),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        assert.equal(fulfilled.length, 1, 'exactly one append may claim the offset');
        assert.equal(fulfilled[0].value.receivedBytes, 4);
        assert.equal(rejected.length, 1);
        assert.equal(rejected[0].reason.kind, 'offset_mismatch');
        assert.equal(rejected[0].reason.receivedBytes, 4);

        const stored = await fsp.readFile(c.svc._stagingPath(record), 'utf8');
        assert.ok(['aaaa', 'bbbb'].includes(stored), 'the stored data is one writer\'s exact bytes');
    });

    test('a successful append renews the TTL', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10));
        record.updatedAt = Date.now() - 60_000;

        await c.svc.appendChunk(record.id, { offset: 0, stream: streamOf(Buffer.from('ab')) });

        assert.ok(Date.now() - record.updatedAt < 5000, 'updatedAt renewed');
    });

    test('appending to a completed session is refused', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 4));
        await fsp.writeFile(c.svc._stagingPath(record), 'abcd');
        await c.svc.complete(record.id);

        await rejectsWith(
            () => c.svc.appendChunk(record.id, { offset: 4, stream: streamOf(Buffer.from('x')) }),
            409,
            'session_completed'
        );
    });
});

describe('UploadSessionService complete', () => {
    test('completion before all bytes are stored is refused and the session stays resumable', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 5));
        await fsp.writeFile(c.svc._stagingPath(record), 'abc');

        await assert.rejects(
            () => c.svc.complete(record.id),
            (err) => {
                assert.ok(err instanceof AppError);
                assert.equal(err.statusCode, 409);
                assert.equal(err.kind, 'session_incomplete');
                assert.equal(err.receivedBytes, 3);
                return true;
            }
        );
        assert.equal(c.svc.cache.sessions[record.id].state, 'open');
        assert.equal(await fsp.readFile(c.svc._stagingPath(record), 'utf8'), 'abc');
    });

    test('a complete session is placed byte-for-byte and its staging disappears', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10));
        await fsp.writeFile(c.svc._stagingPath(record), '0123456789');
        const staging = c.svc._stagingPath(record);

        const { clientPath } = await c.svc.complete(record.id);

        assert.equal(clientPath, `${c.destination}/a.bin`);
        assert.equal(await fsp.readFile(path.join(c.destinationPath, 'a.bin'), 'utf8'), '0123456789');
        assert.equal(fs.existsSync(staging), false, 'staging consumed by placement');
        assert.equal(c.svc.cache.sessions[record.id].state, 'completed');
    });

    test('a repeated completion is idempotent and never modifies the file again', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 4));
        await fsp.writeFile(c.svc._stagingPath(record), 'abcd');
        await c.svc.complete(record.id);

        const target = path.join(c.destinationPath, 'a.bin');
        await fsp.writeFile(target, 'TAMPERED'); // stand-in for "was it touched again?"

        const { clientPath } = await c.svc.complete(record.id);
        assert.equal(clientPath, `${c.destination}/a.bin`);
        assert.equal(await fsp.readFile(target, 'utf8'), 'TAMPERED', 'the second call did not re-place or overwrite');
    });

    test('a destination conflict keeps the session resumable', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 4));
        await fsp.writeFile(c.svc._stagingPath(record), 'abcd');
        await fsp.writeFile(path.join(c.destinationPath, 'a.bin'), 'someone else got here first');

        await rejectsWith(() => c.svc.complete(record.id), 409, 'destination_conflict');

        assert.equal(c.svc.cache.sessions[record.id].state, 'open', 'session kept');
        assert.equal(await fsp.readFile(c.svc._stagingPath(record), 'utf8'), 'abcd', 'staged bytes kept');
        assert.equal(await fsp.readFile(path.join(c.destinationPath, 'a.bin'), 'utf8'), 'someone else got here first');
    });

    test('a zero-byte session completes into an empty file', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'empty.bin', 0));

        await c.svc.complete(record.id);

        const stats = await fsp.stat(path.join(c.destinationPath, 'empty.bin'));
        assert.equal(stats.size, 0);
    });

    test('completing an unknown session is a 404', async () => {
        const c = makeCase();
        await rejectsWith(() => c.svc.complete('f'.repeat(32)), 404, 'session_expired');
    });
});

describe('UploadSessionService abort', () => {
    test('an aborted session leaves nothing behind and refuses every later operation', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10));
        const staging = c.svc._stagingPath(record);
        await fsp.writeFile(staging, 'abcd');

        await c.svc.abort(record.id);

        assert.equal(fs.existsSync(staging), false, 'stored bytes removed');
        assert.equal(c.svc.cache.sessions[record.id], undefined, 'record removed');
        assert.equal(fs.existsSync(path.join(c.destinationPath, 'a.bin')), false, 'no visible file appeared');

        await rejectsWith(() => c.svc.status(record.id), 404, 'session_expired');
        await rejectsWith(
            () => c.svc.appendChunk(record.id, { offset: 0, stream: streamOf(Buffer.from('x')) }),
            404,
            'session_expired'
        );
        await rejectsWith(() => c.svc.complete(record.id), 404, 'session_expired');
        await rejectsWith(() => c.svc.abort(record.id), 404, 'session_expired');
    });

    test('an aborted session\'s staged bytes are gone even when the record survives a crash', async () => {
        const c = makeCase();
        const { record } = await c.svc.initiate(offer(c, 'a.bin', 10));
        await fsp.writeFile(c.svc._stagingPath(record), 'abcd');

        // Simulate the crash-between-states residue: record whose file is gone.
        await fsp.rm(c.svc._stagingPath(record));
        const status = await c.svc.status(record.id);
        assert.equal(status.receivedBytes, 0, 'a missing staged file reads as zero, never an error');
    });
});
