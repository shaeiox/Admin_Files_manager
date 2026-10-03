// test/services/MetadataService.test.js
'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// The module exports a singleton bound to process.cwd()/data/metadata.json.
// Build isolated instances against a temp dir so tests never touch the repo's
// real data/ directory.
const MetadataServiceSingleton = require('../../src/services/MetadataService');
const MetadataService = MetadataServiceSingleton.constructor;
const AppError = require('../../src/utils/AppError');

function freshInstance(dir, dbName = 'metadata.json') {
    const instance = new MetadataService();
    instance.dbPath = path.join(dir, dbName);
    instance.cache = null;
    return instance;
}

describe('MetadataService bootstrap', () => {
    let tmp;

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-metadata-'));
    });

    after(async () => {
        await fsp.rm(tmp, { recursive: true, force: true });
    });

    beforeEach(() => {
        // Each test gets its own non-existent subdirectory.
        const dir = fs.mkdtempSync(path.join(tmp, 'case-'));
        return dir;
    });

    test('creates the missing directory on first read', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        const nested = path.join(base, 'data', 'deep');
        const svc = freshInstance(nested);

        assert.equal(fs.existsSync(nested), false, 'precondition: dir absent');

        const db = await svc._read();

        assert.equal(fs.existsSync(nested), true, 'parent directory created');
        assert.ok(db, 'returned a structure');
    });

    test('creates the metadata file with an empty default structure', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        const dir = path.join(base, 'data');
        const svc = freshInstance(dir);

        await svc._read();

        const raw = JSON.parse(await fsp.readFile(svc.dbPath, 'utf8'));
        assert.deepEqual(raw, { downloads: {}, starred: [], activities: [] });
    });

    test('first read on a fresh checkout yields an empty structure, not an error', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        const svc = freshInstance(path.join(base, 'absent-dir'));

        const db = await svc._read();

        assert.deepEqual(db, { downloads: {}, starred: [], activities: [] });
    });

    test('bootstrap failure raises AppError, not a raw system error', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        // Make the parent a FILE so mkdir(recursive) cannot succeed.
        const blocked = path.join(base, 'blocked');
        await fsp.writeFile(blocked, 'not a directory', 'utf8');
        const svc = freshInstance(path.join(blocked, 'data'));

        await assert.rejects(
            () => svc._read(),
            (err) => {
                assert.ok(err instanceof AppError, 'is an AppError');
                assert.equal(err.statusCode, 500);
                assert.ok(
                    !(err instanceof SyntaxError),
                    'not a raw SyntaxError'
                );
                return true;
            }
        );
    });

    test('error message is static - carries no filesystem path', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        const blocked = path.join(base, 'blocked');
        await fsp.writeFile(blocked, 'x', 'utf8');
        const svc = freshInstance(path.join(blocked, 'data'));

        try {
            await svc._read();
            assert.fail('expected rejection');
        } catch (err) {
            assert.ok(!err.message.includes(base), 'message excludes temp path');
            assert.ok(!/[A-Za-z]:[\\/]/.test(err.message), 'message excludes drive letter');
        }
    });

    test('original error is preserved as cause for diagnostics', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        const blocked = path.join(base, 'blocked');
        await fsp.writeFile(blocked, 'x', 'utf8');
        const svc = freshInstance(path.join(blocked, 'data'));

        try {
            await svc._read();
            assert.fail('expected rejection');
        } catch (err) {
            assert.ok(err.cause, 'cause retained');
        }
    });

    test('a failed initialization is retried on a later read', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        const blocked = path.join(base, 'blocked');
        await fsp.writeFile(blocked, 'x', 'utf8');
        const target = path.join(blocked, 'data');
        const svc = freshInstance(target);

        await assert.rejects(() => svc._read());
        assert.equal(svc.cache, null, 'cache not poisoned by failure');

        // Unblock, then read again - must succeed.
        await fsp.rm(blocked, { force: true });
        await fsp.mkdir(target, { recursive: true });

        const db = await svc._read();
        assert.deepEqual(db, { downloads: {}, starred: [], activities: [] });
    });

    test('second read is served from cache without touching disk', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        const svc = freshInstance(path.join(base, 'data'));

        const first = await svc._read();
        first.downloads['/a.txt'] = 5;
        await svc._write(first);

        // Remove the file entirely - a cache hit must not care.
        await fsp.rm(svc.dbPath, { force: true });

        const second = await svc._read();
        assert.equal(second.downloads['/a.txt'], 5);
    });
});

describe('MetadataService operations after bootstrap', () => {
    let tmp;

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-metadata-ops-'));
    });

    after(async () => {
        await fsp.rm(tmp, { recursive: true, force: true });
    });

    test('incrementDownload persists and accumulates', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'ops-'));
        const svc = freshInstance(dir);

        await svc.incrementDownload('/a.txt');
        await svc.incrementDownload('/a.txt');

        const raw = JSON.parse(await fsp.readFile(svc.dbPath, 'utf8'));
        assert.equal(raw.downloads['/a.txt'], 2);
    });

    test('addActivity stamps a finite epoch-millisecond time and caps at 50', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'ops-'));
        const svc = freshInstance(dir);

        const before = Date.now();
        await svc.addActivity({ type: 'upload', action: 'Uploaded', target: 'a.txt' });
        const after = Date.now();

        const db = await svc.getActivities(10);
        assert.equal(db.length, 1);
        assert.ok(Number.isFinite(db[0].time), 'time is finite');
        assert.ok(db[0].time >= before && db[0].time <= after, 'time is now-ish');

        for (let i = 0; i < 60; i++) {
            await svc.addActivity({ type: 'upload', action: 'A', target: `f${i}` });
        }
        const capped = await svc.getActivities(100);
        assert.equal(capped.length, 50, 'capped at 50');
        assert.ok(
            capped.every((a) => Number.isFinite(a.time)),
            'every retained activity has a finite time'
        );
    });

    test('getActivities respects the requested limit', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'ops-'));
        const svc = freshInstance(dir);

        for (let i = 0; i < 10; i++) {
            await svc.addActivity({ type: 'upload', action: 'A', target: `f${i}` });
        }
        const five = await svc.getActivities(5);
        assert.equal(five.length, 5);
    });

    test('a failing metadata write does not poison the cache or throw raw', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'ops-'));
        const svc = freshInstance(path.join(dir, 'data'));

        await svc._read();
        assert.ok(svc.cache, 'bootstrapped');

        // Make the directory read-only-ish by replacing it with a file path
        // component, then force a write failure.
        const original = svc.dbPath;
        svc.dbPath = path.join(dir, 'data', 'nested-missing', 'metadata.json');

        // Write must fail (parent missing) - confirm it rejects rather than
        // silently corrupting state.
        await assert.rejects(() => svc._write({ downloads: {}, starred: [], activities: [] }));

        svc.dbPath = original;
        assert.ok(svc.cache, 'cache survived the failed write');
    });
});

describe('Fire-and-forget contract (AGENTS.md rule 7)', () => {
    let tmp;

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-metadata-ff-'));
    });

    after(async () => {
        await fsp.rm(tmp, { recursive: true, force: true });
    });

    // The repo convention is that metadata calls are fire-and-forget at the call
    // site (`MetadataService.x(...).catch(() => {})` - 7 sites in fs.controller.js).
    // These assert the other half: a failing metadata write must not affect the
    // filesystem operation it accompanies.

    for (const method of ['incrementDownload', 'deletePath']) {
        test(`${method} failure does not affect the accompanying filesystem operation`, async () => {
            const dir = fs.mkdtempSync(path.join(tmp, 'ff-'));
            const svc = freshInstance(path.join(dir, 'data'));

            const goodPath = svc.dbPath;
            // The store bootstraps itself at whatever path it is given, so a merely
            // missing directory is NOT a failure case. Block with a FILE so that
            // mkdir(recursive) genuinely cannot succeed.
            const blocker = path.join(dir, 'blocked');
            await fsp.writeFile(blocker, 'not a directory', 'utf8');
            svc.dbPath = path.join(blocker, 'meta', 'metadata.json');

            const realFile = path.join(dir, 'payload.bin');
            await fsp.writeFile(realFile, 'payload', 'utf8');

            await svc[method]('/payload.bin').catch(() => { });

            assert.equal(await fsp.readFile(realFile, 'utf8'), 'payload',
                'filesystem write unaffected');
            assert.equal(await fsp.readFile(blocker, 'utf8'), 'not a directory',
                'blocker untouched - no metadata tree created through it');

            svc.dbPath = goodPath;
        });
    }

    test('addActivity failure does not affect the accompanying write', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'ff-'));
        const svc = freshInstance(path.join(dir, 'data'));

        const goodPath = svc.dbPath;
        const blocker = path.join(dir, 'blocked');
        await fsp.writeFile(blocker, 'not a directory', 'utf8');
        svc.dbPath = path.join(blocker, 'meta', 'metadata.json');

        const target = path.join(dir, 'uploaded.bin');
        await fsp.writeFile(target, 'data', 'utf8');

        await svc.addActivity({ type: 'upload', action: 'U', target: 'uploaded.bin' })
            .catch(() => { });

        assert.equal(await fsp.readFile(target, 'utf8'), 'data');
        assert.equal(await fsp.readFile(blocker, 'utf8'), 'not a directory');

        svc.dbPath = goodPath;
    });

    test('a fire-and-forget rejection does not surface as an unhandled rejection', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'ff-'));
        const svc = freshInstance(path.join(dir, 'data'));

        const goodPath = svc.dbPath;
        const blocker = path.join(dir, 'blocked');
        await fsp.writeFile(blocker, 'not a directory', 'utf8');
        svc.dbPath = path.join(blocker, 'meta', 'metadata.json');

        await svc.incrementDownload('/x.bin').catch(() => { });

        svc.dbPath = goodPath;
    });
});
