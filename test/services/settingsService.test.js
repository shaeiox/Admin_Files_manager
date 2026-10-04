// test/services/settingsService.test.js
'use strict';

/**
 * SettingsService unit tests (settings-page-correctness, tasks 1.1-1.3).
 *
 * The module exports a singleton bound to process.cwd()/data/settings.json.
 * Every test builds an isolated instance pointed at a fresh temp file, so the
 * suite never writes the repository's real data/settings.json - the same
 * isolation rule MetadataService.test.js follows for the metadata store.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const SettingsServiceSingleton = require('../../src/services/SettingsService');
const SettingsService = SettingsServiceSingleton.constructor;
const AppError = require('../../src/utils/AppError');
const { validateSettingsPayload } = require('../../src/utils/validators');

// The documented D2 defaults: every key present, every value explicitly unset.
const DEFAULT_SETTINGS = {
    general: { workspaceName: null, defaultUploadFolder: null },
    appearance: { defaultView: null },
};

const SAVED = {
    general: { workspaceName: 'Ops Console', defaultUploadFolder: '/inbox' },
    appearance: { defaultView: 'grid' },
};

function freshInstance(dir, dbName = 'settings.json') {
    const instance = new SettingsService();
    instance.dbPath = path.join(dir, dbName);
    instance.cache = null;
    return instance;
}

describe('SettingsService bootstrap (defaults materialize on first read)', () => {
    let tmp;

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-settings-'));
    });

    after(async () => {
        await fsp.rm(tmp, { recursive: true, force: true });
    });

    test('the exported singleton resolves its store under the repo data directory', () => {
        assert.equal(path.basename(SettingsServiceSingleton.dbPath), 'settings.json');
        assert.equal(path.basename(path.dirname(SettingsServiceSingleton.dbPath)), 'data');
    });

    test('first read on a fresh checkout materializes the documented defaults', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'case-'));
        const svc = freshInstance(dir);

        assert.equal(fs.existsSync(svc.dbPath), false, 'precondition: file absent');

        const settings = await svc.getAll();
        assert.deepEqual(settings, DEFAULT_SETTINGS);

        const onDisk = JSON.parse(await fsp.readFile(svc.dbPath, 'utf8'));
        assert.deepEqual(onDisk, DEFAULT_SETTINGS, 'defaults were written to disk');
    });

    test('the parent directory is created BEFORE the defaults are written', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        const nested = path.join(base, 'data', 'deep');
        const svc = freshInstance(nested);

        assert.equal(fs.existsSync(nested), false, 'precondition: dir absent');

        const settings = await svc.getAll();
        assert.deepEqual(settings, DEFAULT_SETTINGS);
        assert.equal(fs.existsSync(svc.dbPath), true, 'store written through the missing tree');
    });

    test('second read is served from cache without touching disk', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'case-'));
        const svc = freshInstance(dir);

        await svc.getAll();
        await fsp.rm(svc.dbPath, { force: true });

        const again = await svc.getAll();
        assert.deepEqual(again, DEFAULT_SETTINGS, 'a cache hit does not need the file');
    });

    test('bootstrap failure raises AppError 500, not a raw system error', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        // Make the parent a FILE so mkdir(recursive) cannot succeed.
        const blocked = path.join(base, 'blocked');
        await fsp.writeFile(blocked, 'not a directory', 'utf8');
        const svc = freshInstance(path.join(blocked, 'data'));

        await assert.rejects(
            () => svc.getAll(),
            (err) => {
                assert.ok(err instanceof AppError, 'is an AppError');
                assert.equal(err.statusCode, 500);
                assert.ok(!(err instanceof SyntaxError), 'not a raw SyntaxError');
                assert.ok(err.cause, 'cause retained for diagnostics');
                return true;
            }
        );
    });

    test('error messages are static - they carry no filesystem path', async () => {
        const base = fs.mkdtempSync(path.join(tmp, 'case-'));
        const blocked = path.join(base, 'blocked');
        await fsp.writeFile(blocked, 'x', 'utf8');
        const svc = freshInstance(path.join(blocked, 'data'));

        try {
            await svc.getAll();
            assert.fail('expected rejection');
        } catch (err) {
            assert.ok(!err.message.includes(base), 'message excludes temp path');
            assert.ok(!/[A-Za-z]:[\\/]/.test(err.message), 'message excludes drive letter');
        }
    });
});

describe('SettingsService save/read round-trip', () => {
    let tmp;

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-settings-ops-'));
    });

    after(async () => {
        await fsp.rm(tmp, { recursive: true, force: true });
    });

    test('replace persists and getAll reads back the same document', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'ops-'));
        const svc = freshInstance(dir);

        const returned = await svc.replace(SAVED);
        assert.deepEqual(returned, SAVED);
        assert.deepEqual(await svc.getAll(), SAVED);
        assert.deepEqual(JSON.parse(await fsp.readFile(svc.dbPath, 'utf8')), SAVED);
    });

    test('a second instance against the same file reads what the first wrote', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'ops-'));
        const writer = freshInstance(dir);
        await writer.replace(SAVED);

        const reader = freshInstance(dir);
        assert.deepEqual(await reader.getAll(), SAVED, 'persistence is on disk, not only in cache');
    });

    test('replace normalizes through the validator: trimmed name, "" becomes null', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'ops-'));
        const svc = freshInstance(dir);

        const padded = await svc.replace({
            general: { workspaceName: '  Ops Console  ', defaultUploadFolder: null },
            appearance: { defaultView: null },
        });
        assert.equal(padded.general.workspaceName, 'Ops Console');

        const blanked = await svc.replace({
            general: { workspaceName: '   ', defaultUploadFolder: null },
            appearance: { defaultView: null },
        });
        assert.equal(blanked.general.workspaceName, null);
    });

    test('a stored client path reads back as the exact string that was sent', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'ops-'));
        const svc = freshInstance(dir);

        await svc.replace(SAVED);
        const raw = await fsp.readFile(svc.dbPath, 'utf8');
        assert.ok(raw.includes('"/inbox"'), 'the POSIX client path is stored verbatim');
        assert.ok(!raw.includes(dir), 'no host-absolute path leaks into the store');
    });
});

describe('SettingsService atomic writes', () => {
    let tmp;

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-settings-atomic-'));
    });

    after(async () => {
        await fsp.rm(tmp, { recursive: true, force: true });
    });

    test('a replace goes through a temp file that is renamed over the target', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'atomic-'));
        const svc = freshInstance(dir);
        await svc.getAll(); // materialize

        const renames = [];
        const realRename = fsp.rename;
        fsp.rename = async (...args) => { renames.push(args); return realRename.apply(fsp, args); };
        try {
            await svc.replace(SAVED);
        } finally {
            fsp.rename = realRename;
        }

        assert.equal(renames.length, 1, 'exactly one rename per write');
        assert.equal(renames[0][0], `${svc.dbPath}.tmp`, 'from the temp file');
        assert.equal(renames[0][1], svc.dbPath, 'over the target');
        assert.equal(fs.existsSync(`${svc.dbPath}.tmp`), false, 'no temp file left behind');
        assert.deepEqual(JSON.parse(fs.readFileSync(svc.dbPath, 'utf8')), SAVED,
            'the target holds a complete document, never a partial one');
    });

    test('a failed write leaves the previous document byte-identical and the cache intact', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'atomic-'));
        const svc = freshInstance(dir);
        await svc.replace(SAVED);
        const beforeBytes = fs.readFileSync(svc.dbPath, 'utf8');

        const realWriteFile = fsp.writeFile;
        fsp.writeFile = async (...args) => {
            if (args[0] === `${svc.dbPath}.tmp`) throw new Error('simulated disk failure');
            return realWriteFile.apply(fsp, args);
        };
        try {
            await assert.rejects(() => svc.replace({
                general: { workspaceName: 'Other', defaultUploadFolder: null },
                appearance: { defaultView: 'list' },
            }));
        } finally {
            fsp.writeFile = realWriteFile;
        }

        assert.equal(fs.readFileSync(svc.dbPath, 'utf8'), beforeBytes, 'target untouched');
        assert.deepEqual(await svc.getAll(), SAVED, 'cache still holds the last good document');
    });
});

describe('SettingsService refuses what the validator refuses', () => {
    let tmp;

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-settings-refusal-'));
    });

    after(async () => {
        await fsp.rm(tmp, { recursive: true, force: true });
    });

    test('an invalid payload is rejected with AppError 400 before anything touches disk', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'refusal-'));
        const svc = freshInstance(dir);
        await svc.replace(SAVED);
        const beforeBytes = fs.readFileSync(svc.dbPath, 'utf8');

        await assert.rejects(
            () => svc.replace({
                general: { workspaceName: null, defaultUploadFolder: null },
                appearance: { defaultView: null },
                dangerZone: { deleteWorkspace: true },
            }),
            (err) => {
                assert.ok(err instanceof AppError, 'is an AppError');
                assert.equal(err.statusCode, 400);
                return true;
            }
        );

        assert.equal(fs.readFileSync(svc.dbPath, 'utf8'), beforeBytes, 'store byte-identical');
        assert.deepEqual(await svc.getAll(), SAVED, 'cache unchanged');
    });

    test('an invalid first write leaves no file behind', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'refusal-'));
        const svc = freshInstance(dir);

        await assert.rejects(() => svc.replace({
            general: { workspaceName: null, defaultUploadFolder: '/../../escape' },
            appearance: { defaultView: null },
        }), (err) => err instanceof AppError && err.statusCode === 400);

        assert.equal(fs.existsSync(svc.dbPath), false, 'validation precedes the bootstrap write');
    });
});

describe('SettingsService corrupt store fails wholly (design D5)', () => {
    let tmp;

    before(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-settings-corrupt-'));
    });

    after(async () => {
        await fsp.rm(tmp, { recursive: true, force: true });
    });

    test('corrupt JSON raises AppError 500 with a static message and a cause', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'corrupt-'));
        const svc = freshInstance(dir);
        await fsp.writeFile(svc.dbPath, '{ not json', 'utf8');

        await assert.rejects(
            () => svc.getAll(),
            (err) => {
                assert.ok(err instanceof AppError, 'is an AppError');
                assert.equal(err.statusCode, 500);
                assert.ok(!(err instanceof SyntaxError), 'the raw parse error does not escape');
                assert.ok(err.cause instanceof SyntaxError, 'cause retained for diagnostics');
                assert.ok(!err.message.includes(dir), 'message excludes the temp path');
                assert.ok(!/[A-Za-z]:[\\/]/.test(err.message), 'message excludes drive letter');
                return true;
            }
        );
    });

    test('no default or partial document is substituted for a corrupt store', async () => {
        const dir = fs.mkdtempSync(path.join(tmp, 'corrupt-'));
        const svc = freshInstance(dir);
        await fsp.writeFile(svc.dbPath, '{"general":', 'utf8');

        await assert.rejects(() => svc.getAll());
        assert.equal(svc.cache, null, 'a failed read does not poison the cache');
    });
});

describe('validateSettingsPayload (task 1.2)', () => {
    test('accepts the all-null defaults document and returns a fresh copy', () => {
        const input = {
            general: { workspaceName: null, defaultUploadFolder: null },
            appearance: { defaultView: null },
        };
        const out = validateSettingsPayload(input);
        assert.deepEqual(out, DEFAULT_SETTINGS);
        assert.notEqual(out, input, 'a normalized copy, not the caller object');
        assert.notEqual(out.general, input.general);
    });

    test('accepts a full valid document', () => {
        assert.deepEqual(validateSettingsPayload(SAVED), SAVED);
    });

    test('the workspace name is trimmed and bounded at 60 characters', () => {
        const doc = (name) => ({
            general: { workspaceName: name, defaultUploadFolder: null },
            appearance: { defaultView: null },
        });
        assert.equal(validateSettingsPayload(doc('a'.repeat(60))).general.workspaceName, 'a'.repeat(60));
        assert.throws(() => validateSettingsPayload(doc('a'.repeat(61))), AppError);
        assert.throws(() => validateSettingsPayload(doc(42)), AppError);
    });

    test('the default view is null, "list", or "grid" and nothing else', () => {
        const doc = (view) => ({
            general: { workspaceName: null, defaultUploadFolder: null },
            appearance: { defaultView: view },
        });
        assert.equal(validateSettingsPayload(doc(null)).appearance.defaultView, null);
        assert.equal(validateSettingsPayload(doc('list')).appearance.defaultView, 'list');
        assert.equal(validateSettingsPayload(doc('grid')).appearance.defaultView, 'grid');
        assert.throws(() => validateSettingsPayload(doc('cards')), AppError);
        assert.throws(() => validateSettingsPayload(doc(42)), AppError);
    });

    test('the default upload folder is null or a rooted POSIX client path', () => {
        const doc = (folder) => ({
            general: { workspaceName: null, defaultUploadFolder: folder },
            appearance: { defaultView: null },
        });
        assert.equal(validateSettingsPayload(doc(null)).general.defaultUploadFolder, null);
        assert.equal(validateSettingsPayload(doc('/')).general.defaultUploadFolder, '/');
        assert.equal(validateSettingsPayload(doc('/inbox')).general.defaultUploadFolder, '/inbox');
        assert.equal(validateSettingsPayload(doc('/a/b/c')).general.defaultUploadFolder, '/a/b/c');
    });

    test('traversal, host-absolute, and illegal-character folders are rejected', () => {
        const doc = (folder) => ({
            general: { workspaceName: null, defaultUploadFolder: folder },
            appearance: { defaultView: null },
        });
        for (const bad of [
            '/../../etc',
            '/a/../b',
            'inbox',               // not rooted at /
            'C:\\Windows\\Temp',   // host-absolute
            '\\\\server\\share',   // UNC
            '/bad/<dir>',
            '/bad/dir|name',
            42,
            '',
        ]) {
            assert.throws(() => validateSettingsPayload(doc(bad)), AppError, JSON.stringify(bad));
        }
    });

    test('unknown keys at any depth are rejected, not stripped', () => {
        const base = () => ({
            general: { workspaceName: null, defaultUploadFolder: null },
            appearance: { defaultView: null },
        });
        const top = base();
        top.dangerZone = {};
        assert.throws(() => validateSettingsPayload(top), AppError);

        const nestedGeneral = base();
        nestedGeneral.general.language = 'en';
        assert.throws(() => validateSettingsPayload(nestedGeneral), AppError);

        const nestedAppearance = base();
        nestedAppearance.appearance.density = 'compact';
        assert.throws(() => validateSettingsPayload(nestedAppearance), AppError);
    });

    test('missing required sections or keys are rejected', () => {
        assert.throws(() => validateSettingsPayload({
            appearance: { defaultView: null },
        }), AppError, 'general section missing');

        assert.throws(() => validateSettingsPayload({
            general: { workspaceName: null, defaultUploadFolder: null },
        }), AppError, 'appearance section missing');

        assert.throws(() => validateSettingsPayload({
            general: { workspaceName: null },
            appearance: { defaultView: null },
        }), AppError, 'defaultUploadFolder key missing');

        assert.throws(() => validateSettingsPayload({
            general: { workspaceName: null, defaultUploadFolder: null },
            appearance: {},
        }), AppError, 'defaultView key missing');

        assert.throws(() => validateSettingsPayload({}), AppError);
    });

    test('non-object payloads are rejected', () => {
        assert.throws(() => validateSettingsPayload(null), AppError);
        assert.throws(() => validateSettingsPayload(undefined), AppError);
        assert.throws(() => validateSettingsPayload([]), AppError);
        assert.throws(() => validateSettingsPayload('settings'), AppError);
        assert.throws(() => validateSettingsPayload(42), AppError);
    });
});
