// test/services/FileSystemService.copywalk.test.js
'use strict';

const { test, describe, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ENV_MODULE = require.resolve('../../src/config/env');
const PATHSERVICE_MODULE = require.resolve('../../src/services/PathService');
const SERVICE_MODULE = require.resolve('../../src/services/FileSystemService');
const AppError = require('../../src/utils/AppError');

const ORIGINAL_STORAGE_ROOT = process.env.STORAGE_ROOT;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-copywalk-'));
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

/** Collects every progress callback a copy emits. */
function recorder() {
    const events = { started: [], files: [], measured: [] };
    return {
        events,
        onProgress: {
            measured: (n) => events.measured.push(n),
            itemStart: (name) => events.started.push(name),
            fileDone: (_name, bytes) => events.files.push(bytes),
        },
    };
}

describe('copy - byte accounting is measured, never estimated', () => {
    test('the total is measured across a nested tree before any byte is written', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree', 'inner'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tree', 'a.txt'), '12345');
        fs.writeFileSync(path.join(root, 'tree', 'inner', 'b.txt'), '1234567');
        const FileSystemService = await load(root);
        const { events, onProgress } = recorder();

        await FileSystemService.copy('/tree', '/dest', onProgress);

        assert.deepEqual(events.measured, [12], 'total is the sum of the source tree');
    });

    test('transferred bytes end equal to the measured total', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tree', 'a.txt'), 'aaaa');
        fs.writeFileSync(path.join(root, 'tree', 'b.txt'), 'bb');
        const FileSystemService = await load(root);
        const { events, onProgress } = recorder();

        await FileSystemService.copy('/tree', '/dest', onProgress);

        assert.equal(events.measured[0], 6);
        assert.equal(events.files.reduce((a, b) => a + b, 0), 6);
    });

    test('a single file copy measures the file size', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'hello world');
        const FileSystemService = await load(root);
        const { events, onProgress } = recorder();

        await FileSystemService.copy('/a.txt', '/dest', onProgress);

        assert.deepEqual(events.measured, [11]);
        assert.deepEqual(events.files, [11]);
    });

    test('an empty folder measures zero bytes', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'empty'), { recursive: true });
        const FileSystemService = await load(root);
        const { events, onProgress } = recorder();

        await FileSystemService.copy('/empty', '/dest', onProgress);

        assert.deepEqual(events.measured, [0]);
        assert.equal(fs.existsSync(path.join(root, 'dest', 'empty')), true);
    });

    test('an unmeasurable total reports null, never zero', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tree', 'a.txt'), 'data');
        const FileSystemService = await load(root);
        const { events, onProgress } = recorder();

        // Break the measurement pass only: the copy itself still succeeds.
        const realLstat = fs.promises.lstat;
        let calls = 0;
        fs.promises.lstat = async (...args) => {
            calls += 1;
            if (calls === 1) throw new Error('simulated stat failure');
            return realLstat(...args);
        };
        try {
            await FileSystemService.copy('/tree', '/dest', onProgress);
        } finally {
            fs.promises.lstat = realLstat;
        }

        assert.deepEqual(events.measured, [null], 'unavailable is reported as null');
        assert.notEqual(events.measured[0], 0);
        assert.equal(fs.existsSync(path.join(root, 'dest', 'tree', 'a.txt')), true, 'the copy still happened');
    });

    test('copy without a progress callback still works and reports nothing', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'data');
        const FileSystemService = await load(root);

        const result = await FileSystemService.copy('/a.txt', '/dest');

        assert.equal(result.newPath, '/dest/a.txt');
        assert.equal(fs.readFileSync(path.join(root, 'dest', 'a.txt'), 'utf8'), 'data');
    });
});

describe('copy - the in-flight filename names a real file', () => {
    test('each file in the tree is announced before it is written', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tree', 'one.txt'), '1');
        fs.writeFileSync(path.join(root, 'tree', 'two.txt'), '22');
        const FileSystemService = await load(root);
        const { events, onProgress } = recorder();

        await FileSystemService.copy('/tree', '/dest', onProgress);

        assert.deepEqual(events.started.slice().sort(), ['one.txt', 'two.txt']);
    });

    test('a nested file is announced by name', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree', 'deep', 'deeper'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tree', 'deep', 'deeper', 'leaf.txt'), 'x');
        const FileSystemService = await load(root);
        const { events, onProgress } = recorder();

        await FileSystemService.copy('/tree', '/dest', onProgress);

        assert.ok(events.started.includes('leaf.txt'));
    });
});

describe('copy - the walk never follows a link', () => {
    /**
     * Create a link at `linkPath` pointing at `target`, trying every form this
     * platform supports. Returns true when one succeeded - the same probe
     * test/api/fs.symlink.test.js uses, because a plain symlink needs Developer
     * Mode on Windows while a junction does not.
     */
    function makeLink(linkPath, target) {
        fs.mkdirSync(path.dirname(linkPath), { recursive: true });
        const forms = process.platform === 'win32' ? ['junction', 'dir'] : ['dir'];
        for (const form of forms) {
            try {
                fs.symlinkSync(target, linkPath, form);
                return true;
            } catch { /* try the next form */ }
        }
        return false;
    }

    test('a link nested inside a copied tree is recreated, not followed', async (t) => {
        const root = freshRoot();
        const outside = path.join(TMP, `outside-${seq++}`);
        fs.mkdirSync(outside, { recursive: true });
        fs.writeFileSync(path.join(outside, 'secret.txt'), 'SECRET');
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tree', 'ok.txt'), 'ok');
        if (!makeLink(path.join(root, 'tree', 'link-out'), outside)) {
            return t.skip('this platform refused to create a link or junction');
        }
        const FileSystemService = await load(root);

        await FileSystemService.copy('/tree', '/dest');

        const copiedLink = path.join(root, 'dest', 'tree', 'link-out');
        assert.equal(fs.lstatSync(copiedLink).isSymbolicLink(), true, 'the link itself was recreated, not its target');
        assert.equal(fs.readFileSync(path.join(root, 'dest', 'tree', 'ok.txt'), 'utf8'), 'ok');
    });

    test('a link contributes no bytes to the measured total', async (t) => {
        const root = freshRoot();
        const outside = path.join(TMP, `outside-b-${seq++}`);
        fs.mkdirSync(outside, { recursive: true });
        fs.writeFileSync(path.join(outside, 'big.bin'), 'x'.repeat(500));
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tree', 'a.txt'), '12345');
        if (!makeLink(path.join(root, 'tree', 'link'), outside)) {
            return t.skip('this platform refused to create a link or junction');
        }
        const FileSystemService = await load(root);
        const { events, onProgress } = recorder();

        await FileSystemService.copy('/tree', '/dest', onProgress);

        assert.deepEqual(events.measured, [5], 'only real bytes are counted');
    });

    test('a link nested inside a copied tree adds no bytes to the walk', async (t) => {
        const root = freshRoot();
        const outside = path.join(TMP, `outside-c-${seq++}`);
        fs.mkdirSync(outside, { recursive: true });
        fs.writeFileSync(path.join(outside, 'big.bin'), 'x'.repeat(500));
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'tree'), { recursive: true });
        fs.writeFileSync(path.join(root, 'tree', 'a.txt'), '12345');
        if (!makeLink(path.join(root, 'tree', 'link'), outside)) {
            return t.skip('this platform refused to create a link or junction');
        }
        const FileSystemService = await load(root);
        const { events, onProgress } = recorder();

        await FileSystemService.copy('/tree', '/dest', onProgress);

        assert.equal(events.files.reduce((a, b) => a + b, 0), 5);
    });
});

describe('copy - walk parity with the previous fs.cp behaviour', () => {
    test('permissions are carried across', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        const src = path.join(root, 'a.sh');
        fs.writeFileSync(src, '#!/bin/sh\n');
        fs.chmodSync(src, 0o755);
        const FileSystemService = await load(root);

        await FileSystemService.copy('/a.sh', '/dest');

        const copied = path.join(root, 'dest', 'a.sh');
        assert.equal(fs.readFileSync(copied, 'utf8'), '#!/bin/sh\n');
        if (process.platform !== 'win32') {
            assert.equal(fs.statSync(copied).mode & 0o777, 0o755);
        }
    });

    test('an empty source folder is recreated as an empty folder', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.mkdirSync(path.join(root, 'empty'), { recursive: true });
        const FileSystemService = await load(root);

        await FileSystemService.copy('/empty', '/dest');

        assert.equal(fs.statSync(path.join(root, 'dest', 'empty')).isDirectory(), true);
        assert.deepEqual(fs.readdirSync(path.join(root, 'dest', 'empty')), []);
    });

    test('deep nesting is reproduced in full', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        const deep = path.join(root, 'tree', 'a', 'b', 'c');
        fs.mkdirSync(deep, { recursive: true });
        fs.writeFileSync(path.join(deep, 'leaf.txt'), 'bottom');
        const FileSystemService = await load(root);

        await FileSystemService.copy('/tree', '/dest');

        assert.equal(fs.readFileSync(path.join(root, 'dest', 'tree', 'a', 'b', 'c', 'leaf.txt'), 'utf8'), 'bottom');
    });

    test('copying into itself is still refused before anything is written', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'tree', 'child'), { recursive: true });
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.copy('/tree', '/tree/child'),
            (err) => err instanceof AppError && err.statusCode === 400
        );
        assert.deepEqual(fs.readdirSync(path.join(root, 'tree', 'child')), []);
    });

    test('a name collision is still a 409 and copies nothing', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a.txt'), 'source');
        fs.writeFileSync(path.join(root, 'dest', 'a.txt'), 'existing');
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.copy('/a.txt', '/dest'),
            (err) => err instanceof AppError && err.statusCode === 409
        );
        assert.equal(fs.readFileSync(path.join(root, 'dest', 'a.txt'), 'utf8'), 'existing');
    });

    test('an unreadable source still surfaces a 403 rather than a generic 500', async (t) => {
        if (process.platform === 'win32' || process.getuid?.() === 0) return t.skip('root bypasses permission bits');
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'dest'), { recursive: true });
        const src = path.join(root, 'locked.txt');
        fs.writeFileSync(src, 'data');
        fs.chmodSync(src, 0o000);
        const FileSystemService = await load(root);

        try {
            await assert.rejects(
                () => FileSystemService.copy('/locked.txt', '/dest'),
                (err) => err instanceof AppError && err.statusCode === 403
            );
        } finally {
            fs.chmodSync(src, 0o644);
        }
    });
});