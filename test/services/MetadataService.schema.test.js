// test/services/MetadataService.schema.test.js
'use strict';

/**
 * Metadata store schema integrity (api-security-hardening, "The Metadata Store
 * Is Shape-Validated On Read").
 *
 * The store is a JSON file on disk that a human can edit and that a partially
 * completed write can leave odd, so the reader normalises rather than trusting.
 * The second requirement is that a client path is rooted at `/`, which keeps a
 * bare `__proto__`/`constructor` from ever becoming a store key.
 *
 * Every case here writes the fixture file directly, because the point is what
 * the reader does with a document it did not write.
 */

const { test, describe, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-meta-schema-'));
const DB = path.join(TMP, 'metadata.json');

const MetadataService = require('../../src/services/MetadataService');
const { validateClientPath } = require('../../src/utils/validators');

/** Point the singleton at the fixture and drop its cache. */
function useStore(contents) {
    MetadataService.dbPath = DB;
    MetadataService.cache = null;
    if (contents !== undefined) {
        fs.writeFileSync(DB, typeof contents === 'string' ? contents : JSON.stringify(contents));
    }
}

beforeEach(() => {
    fs.rmSync(DB, { force: true });
});

after(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('a store with a missing section is repaired, not indexed blind', () => {
    test('a document with only downloads still answers starred and activities', async () => {
        useStore({ downloads: { '/a.txt': 3 } });

        const meta = await MetadataService.getFileMeta('/a.txt');
        assert.equal(meta.downloads, 3);
        assert.equal(meta.starred, false, 'a missing starred reads as not-starred, not undefined');
        assert.deepEqual(await MetadataService.getActivities(), []);
        // A populated download map yields real rows; the point is it is a
        // well-formed array of well-formed rows rather than an index accident.
        const top = await MetadataService.getTopDownloads();
        assert.ok(Array.isArray(top));
        assert.deepEqual(top, [{ path: '/a.txt', downloads: 3, max: 3 }]);
    });

    test('a document that is entirely empty still answers every reader', async () => {
        useStore({});
        assert.deepEqual(await MetadataService.getFileMeta('/a.txt'), { downloads: 0, starred: false });
        assert.deepEqual(await MetadataService.getActivities(), []);
        assert.deepEqual(await MetadataService.getTopDownloads(), []);
    });

    test('a wrong-typed section is treated as empty, never as an index target', async () => {
        useStore({ downloads: 'not-an-object', starred: 'not-an-array', activities: 42 });

        const meta = await MetadataService.getFileMeta('/a.txt');
        assert.equal(meta.downloads, 0, 'a non-number counter reads as 0, not an object');
        assert.equal(meta.starred, false);
        assert.deepEqual(await MetadataService.getActivities(), []);
        assert.deepEqual(await MetadataService.getTopDownloads(), []);
    });

    test('an unknown top-level section is dropped rather than carried around', async () => {
        useStore({ downloads: {}, injected: { evil: true } });
        const db = await MetadataService._read();
        assert.deepEqual(Object.keys(db).sort(), ['activities', 'downloads', 'starred']);
        assert.ok(!('injected' in db));
    });

    test('a non-object document does not crash the reader', async () => {
        for (const junk of ['[1,2,3]', '"a string"', 'null', '7']) {
            useStore(junk);
            const meta = await MetadataService.getFileMeta('/a.txt');
            assert.equal(meta.downloads, 0, `junk ${junk} still yields a reading`);
            assert.equal(meta.starred, false);
        }
    });

    test('a corrupt counter is dropped rather than rendered as a measurement', async () => {
        useStore({ downloads: { '/good.txt': 4, '/nan.txt': 'NaN-ish', '/null.txt': null, '/inf.txt': Infinity } });
        const db = await MetadataService._read();
        assert.equal(db.downloads['/good.txt'], 4);
        assert.equal(db.downloads['/nan.txt'], undefined, 'a non-number counter is not stored');
        assert.equal(db.downloads['/null.txt'], undefined);
        assert.equal(db.downloads['/inf.txt'], undefined, 'Infinity is not a finite measurement');
    });

    test('a corrupt store still fails wholly rather than silently reverting', async () => {
        useStore('{ this is not json');
        await assert.rejects(() => MetadataService.getFileMeta('/a.txt'), (e) => e.statusCode === 500);
    });
});

describe('a store key can never collide with an inherited property', () => {
    test('a __proto__ key in the file stays inert data', async () => {
        // JSON.parse creates __proto__ as an OWN property; the normalised store is
        // null-prototype, so reading it back yields the stored value and never
        // Object.prototype.
        useStore('{"downloads":{"__proto__":7},"starred":[],"activities":[]}');

        const meta = await MetadataService.getFileMeta('__proto__');
        assert.equal(meta.downloads, 7, 'the stored value is returned as a plain number');
        assert.equal(typeof meta.downloads, 'number');
        assert.equal(Object.getPrototypeOf((await MetadataService._read()).downloads), null);
    });

    test('a constructor key in the file stays inert data', async () => {
        useStore({ downloads: { constructor: 5 } });
        const meta = await MetadataService.getFileMeta('constructor');
        assert.equal(meta.downloads, 5, 'not the Object constructor');
        assert.equal(typeof meta.downloads, 'number');
    });

    test('an unseeded key reads as a number, never as an object', async () => {
        useStore({ downloads: {} });
        const meta = await MetadataService.getFileMeta('__proto__');
        assert.equal(meta.downloads, 0, 'an absent key is 0, not Object.prototype');
    });
});

describe('client paths must be rooted at /', () => {
    test('an unrooted path is refused by the validator', () => {
        for (const bad of ['__proto__', 'constructor', 'a.txt', 'media/a.txt', './a', '../a']) {
            assert.throws(() => validateClientPath(bad), `expected "${bad}" to be refused`,
                );
        }
    });

    test('a rooted path is accepted unchanged', () => {
        for (const good of ['/', '/a.txt', '/media/a.txt', '/__proto__', '/constructor']) {
            assert.equal(validateClientPath(good), good);
        }
    });

    test('the refusal is a 400 naming the rule, not a path', () => {
        assert.throws(() => validateClientPath('__proto__'), (e) => {
            assert.equal(e.statusCode, 400);
            assert.equal(e.message, 'Path must be rooted at /.');
            return true;
        });
    });

    test('a nested path segment named __proto__ is still allowed and inert', () => {
        // Rooting at / is what matters: '/__proto__' is an ordinary path key.
        assert.equal(validateClientPath('/__proto__'), '/__proto__');
    });
});