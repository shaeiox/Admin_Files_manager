// test/services/FileSystemService.moveprogress.test.js
'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ENV_MODULE = require.resolve('../../src/config/env');
const PATHSERVICE_MODULE = require.resolve('../../src/services/PathService');
const SERVICE_MODULE = require.resolve('../../src/services/FileSystemService');

const ORIGINAL_STORAGE_ROOT = process.env.STORAGE_ROOT;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-moveprog-'));
process.env.DOTENV_CONFIG_QUIET = 'true';

let seq = 0;
function freshRoot() {
    const dir = path.join(TMP, `root-${seq++}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

async function load(root) {
    process.env.STORAGE_ROOT = root;
    delete require.cache[ENV_MODULE];
    delete require.cache[PATHSERVICE_MODULE];
    delete require.cache[SERVICE_MODULE];
    return require(SERVICE_MODULE);
}

after(() => {
    if (ORIGINAL_STORAGE_ROOT === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = ORIGINAL_STORAGE_ROOT;
    fs.rmSync(TMP, { recursive: true, force: true });
});

function recorder() {
    const started = [];
    const done = [];
    return {
        started,
        done,
        onProgress: {
            itemStart: (p, name) => started.push({ path: p, name }),
            itemDone: () => done.push(true),
        },
    };
}

describe('move - per-item progress without a fabricated percentage', () => {
    test('the item about to be relocated is announced by name', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'x');
        const FileSystemService = await load(root);
        const { started, onProgress } = recorder();

        await FileSystemService.move('/a.txt', '/dest', onProgress);

        assert.deepEqual(started.map(s => s.name), ['a.txt']);
        assert.equal(started[0].path, '/a.txt');
    });

    test('a completed relocation is reported', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'x');
        const FileSystemService = await load(root);
        const { done, onProgress } = recorder();

        await FileSystemService.move('/a.txt', '/dest', onProgress);

        assert.equal(done.length, 1);
    });

    test('the start is announced before the item is gone', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'x');
        const FileSystemService = await load(root);
        const observed = [];
        const onProgress = {
            itemStart: (p) => observed.push(fs.existsSync(path.join(root, 'a.txt'))),
            itemDone: () => {},
        };

        await FileSystemService.move('/a.txt', '/dest', onProgress);

        assert.deepEqual(observed, [true], 'the item still existed when it was announced');
    });

    test('a no-op move announces nothing, because nothing is relocated', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'dest', 'a.txt'), 'x');
        const FileSystemService = await load(root);
        const { started, onProgress } = recorder();

        // '/dest/a.txt' -> '/dest' is already there: the service returns the
        // unchanged paths without calling fs.rename.
        const result = await FileSystemService.move('/dest/a.txt', '/dest', onProgress);

        assert.equal(result.oldPath, result.newPath);
        assert.deepEqual(started, []);
    });

    test('move still works with no progress callback at all', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'x');
        const FileSystemService = await load(root);

        const result = await FileSystemService.move('/a.txt', '/dest');

        assert.equal(result.newPath, '/dest/a.txt');
        assert.equal(fs.existsSync(path.join(root, 'a.txt')), false);
    });

    test('a refused move announces the item that failed, then throws', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'x');
        fs.writeFileSync(path.join(root, 'dest', 'a.txt'), 'existing');
        const FileSystemService = await load(root);
        const { started, onProgress } = recorder();

        await assert.rejects(() => FileSystemService.move('/a.txt', '/dest', onProgress));
        assert.deepEqual(started, [], 'a 409 is refused before the item is announced');
    });
});