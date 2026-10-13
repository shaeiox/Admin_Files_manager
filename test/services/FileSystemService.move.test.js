// test/services/FileSystemService.move.test.js
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-move-'));
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

describe('move - legitimate operations', () => {
    test('moves a file into an existing destination directory, name unchanged', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'data');
        const FileSystemService = await load(root);

        const result = await FileSystemService.move('/a.txt', '/dest');

        assert.equal(result.oldPath, '/a.txt');
        assert.equal(result.newPath, '/dest/a.txt');
        assert.equal(fs.existsSync(path.join(root, 'dest', 'a.txt')), true);
        assert.equal(fs.existsSync(path.join(root, 'a.txt')), false);
    });

    test('moves a folder and everything inside it', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree', 'inner'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tree', 'inner', 'leaf.txt'), 'data');
        const FileSystemService = await load(root);

        const result = await FileSystemService.move('/tree', '/dest');

        assert.equal(result.newPath, '/dest/tree');
        assert.equal(fs.existsSync(path.join(root, 'dest', 'tree', 'inner', 'leaf.txt')), true);
    });

    test('moving to its own current directory is a no-op, not an error', async () => {
        const root = freshRoot();
        fs.writeFileSync(path.join(root, 'a.txt'), 'data');
        const FileSystemService = await load(root);

        const result = await FileSystemService.move('/a.txt', '/');

        assert.equal(result.oldPath, '/a.txt');
        assert.equal(result.newPath, '/a.txt');
        assert.equal(fs.existsSync(path.join(root, 'a.txt')), true);
    });

    test('refuses a name collision at the destination, and touches neither copy', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'source');
        fs.writeFileSync(path.join(root, 'dest', 'a.txt'), 'already there');
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.move('/a.txt', '/dest'),
            (err) => err instanceof AppError && err.statusCode === 409
        );
        assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'source');
        assert.equal(fs.readFileSync(path.join(root, 'dest', 'a.txt'), 'utf8'), 'already there');
    });

    test('missing source is a 404', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.move('/nope.txt', '/dest'),
            (err) => err instanceof AppError && err.statusCode === 404
        );
    });

    test('missing destination is a 404, not an implicit mkdir', async () => {
        const root = freshRoot();
        fs.writeFileSync(path.join(root, 'a.txt'), 'data');
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.move('/a.txt', '/no-such-folder'),
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
            () => FileSystemService.move('/a.txt', '/notafolder.txt'),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });
});

describe('move - a folder cannot be moved into itself or its own subtree', () => {
    test('destination equal to the source folder itself', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'tree'), { recursive: true });
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.move('/tree', '/tree'),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });

    test('destination nested inside the source folder', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'tree', 'child'), { recursive: true });
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.move('/tree', '/tree/child'),
            (err) => err instanceof AppError && err.statusCode === 400
        );
        assert.equal(fs.existsSync(path.join(root, 'tree', 'child')), true, 'untouched');
    });

    test('a file with the same name prefix as the folder being moved is not mistaken for its child', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'tree'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree-sibling'), { recursive: true });
        const FileSystemService = await load(root);

        // '/tree-sibling' is not inside '/tree' - the separator-boundary rule
        // (same one PathService.resolveSecurePath enforces) must hold here too.
        const result = await FileSystemService.move('/tree', '/tree-sibling');
        assert.equal(result.newPath, '/tree-sibling/tree');
    });
});

describe('move - storage root sentinel', () => {
    test('the storage root itself cannot be moved', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        const FileSystemService = await load(root);

        await assert.rejects(() => FileSystemService.move('/', '/dest'),
            (err) => err instanceof AppError && err.statusCode === 403);
    });
});
