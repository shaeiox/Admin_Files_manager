// test/services/FileSystemService.copy.test.js
'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ENV_MODULE = require.resolve('../../src/config/env');
const PATHSERVICE_MODULE = require.resolve('../../src/services/PathService');
const SERVICE_MODULE = require.resolve('../../src/services/FileSystemService');
const AppError = require('../../src/utils/AppError');

const ORIGINAL_STORAGE_ROOT = process.env.STORAGE_ROOT;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-copy-'));
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

describe('copy - legitimate operations', () => {
    test('copies a file into an existing destination directory, source untouched', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'data');
        const FileSystemService = await load(root);

        const result = await FileSystemService.copy('/a.txt', '/dest');

        assert.equal(result.sourcePath, '/a.txt');
        assert.equal(result.newPath, '/dest/a.txt');
        assert.equal(fs.existsSync(path.join(root, 'a.txt')), true, 'the source survives');
        assert.equal(fs.readFileSync(path.join(root, 'dest', 'a.txt'), 'utf8'), 'data');
    });

    test('copies a folder and everything inside it, source untouched', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree', 'inner'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tree', 'inner', 'leaf.txt'), 'data');
        const FileSystemService = await load(root);

        const result = await FileSystemService.copy('/tree', '/dest');

        assert.equal(result.newPath, '/dest/tree');
        assert.equal(fs.existsSync(path.join(root, 'tree', 'inner', 'leaf.txt')), true, 'the source tree survives');
        assert.equal(fs.existsSync(path.join(root, 'dest', 'tree', 'inner', 'leaf.txt')), true);
    });

    test('refuses a name collision at the destination, and touches neither copy', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'source');
        fs.writeFileSync(path.join(root, 'dest', 'a.txt'), 'already there');
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.copy('/a.txt', '/dest'),
            (err) => err instanceof AppError && err.statusCode === 409
        );
        assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'source');
        assert.equal(fs.readFileSync(path.join(root, 'dest', 'a.txt'), 'utf8'), 'already there');
    });

    test('copying into the same directory is a 409, not a silent no-op (unlike move)', async () => {
        const root = freshRoot();
        fs.writeFileSync(path.join(root, 'a.txt'), 'data');
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.copy('/a.txt', '/'),
            (err) => err instanceof AppError && err.statusCode === 409
        );
        assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'data', 'the only copy is untouched');
    });

    test('missing source is a 404', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.copy('/nope.txt', '/dest'),
            (err) => err instanceof AppError && err.statusCode === 404
        );
    });

    test('missing destination is a 404, not an implicit mkdir', async () => {
        const root = freshRoot();
        fs.writeFileSync(path.join(root, 'a.txt'), 'data');
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.copy('/a.txt', '/no-such-folder'),
            (err) => err instanceof AppError && err.statusCode === 404
        );
        assert.equal(fs.existsSync(path.join(root, 'no-such-folder')), false);
    });

    test('a destination that is a file, not a folder, is a 400', async () => {
        const root = freshRoot();
        fs.writeFileSync(path.join(root, 'a.txt'), 'data');
        fs.writeFileSync(path.join(root, 'notafolder.txt'), 'data');
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.copy('/a.txt', '/notafolder.txt'),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });
});

describe('copy - a folder cannot be copied into itself or its own subtree', () => {
    test('destination equal to the source folder itself', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'tree'), { recursive: true });
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.copy('/tree', '/tree'),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });

    test('destination nested inside the source folder', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'tree', 'child'), { recursive: true });
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.copy('/tree', '/tree/child'),
            (err) => err instanceof AppError && err.statusCode === 400
        );
        const entries = fs.readdirSync(path.join(root, 'tree', 'child'));
        assert.deepEqual(entries, [], 'nothing was written into the tree');
    });

    test('a file with the same name prefix as the folder being copied is not mistaken for its child', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'tree'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree-sibling'), { recursive: true });
        const FileSystemService = await load(root);

        const result = await FileSystemService.copy('/tree', '/tree-sibling');
        assert.equal(result.newPath, '/tree-sibling/tree');
        assert.equal(fs.existsSync(path.join(root, 'tree')), true, 'the source survives');
    });

    test('the storage root cannot be copied into any destination within itself', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        const FileSystemService = await load(root);

        // Every valid destination resolves inside the root, so this is always
        // "into its own subtree" - no separate root sentinel is needed, unlike move.
        await assert.rejects(
            () => FileSystemService.copy('/', '/dest'),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });
});
