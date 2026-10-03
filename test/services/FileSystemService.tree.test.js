// test/services/FileSystemService.tree.test.js
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-tree-'));
process.env.DOTENV_CONFIG_QUIET = 'true';

let seq = 0;
function freshRoot() {
    const dir = path.join(TMP, `root-${seq++}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function writeFile(root, relPath, contents) {
    const full = path.join(root, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
    return full;
}

/**
 * Loads a fresh FileSystemService bound to `root` and aggregates `clientPath`.
 *
 * There is deliberately NO `root` override in the production API - that would be
 * a backdoor around PathService. Instead `config/env` snapshots STORAGE_ROOT at
 * require time, so the module cache is purged and the service re-required. This
 * exercises the real resolution path, exactly as a request would.
 *
 * dotenv never overrides an already-set variable, so assigning first wins.
 */
async function stats(root, clientPath = '/', options = {}) {
    process.env.STORAGE_ROOT = root;
    // All three must be purged: PathService captures the config object at require
    // time, so purging only env leaves it bound to the previous root.
    delete require.cache[ENV_MODULE];
    delete require.cache[PATHSERVICE_MODULE];
    delete require.cache[SERVICE_MODULE];
    const FileSystemService = require(SERVICE_MODULE);
    return FileSystemService.getTreeStats(clientPath, options);
}

after(() => {
    if (ORIGINAL_STORAGE_ROOT === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = ORIGINAL_STORAGE_ROOT;
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('getTreeStats - counting and byte totals', () => {
    test('empty root reports zeros and succeeds', async () => {
        const stats_ = await stats(freshRoot());
        assert.equal(stats_.files, 0);
        assert.equal(stats_.folders, 0);
        assert.equal(stats_.treeBytes, 0);
        assert.equal(stats_.truncated, false);
        assert.deepEqual(stats_.errors, []);
    });

    test('counts regular files at the top level', async () => {
        const root = freshRoot();
        writeFile(root, 'a.txt', 'aaaa');
        writeFile(root, 'b.txt', 'bbbbbb');

        const s = await stats(root);
        assert.equal(s.files, 2);
        assert.equal(s.folders, 0);
        assert.equal(s.treeBytes, 10);
    });

    test('counts files and folders recursively', async () => {
        const root = freshRoot();
        writeFile(root, 'top.txt', 'a');
        writeFile(root, 'one/x.txt', 'bb');
        writeFile(root, 'one/two/y.txt', 'ccc');
        writeFile(root, 'one/two/three/z.txt', 'dddd');

        const s = await stats(root);
        assert.equal(s.files, 4, 'files at every level');
        assert.equal(s.folders, 3, 'one, one/two, one/two/three - root excluded');
        assert.equal(s.treeBytes, 10);
    });

    test('the root itself is never counted as a folder', async () => {
        const root = freshRoot();
        writeFile(root, 'only.txt', 'x');
        assert.equal((await stats(root)).folders, 0);
    });

    test('empty directories are counted but contribute zero bytes', async () => {
        const root = freshRoot();
        writeFile(root, 'file.txt', 'abc');
        fs.mkdirSync(path.join(root, 'empty-a'), { recursive: true });
        fs.mkdirSync(path.join(root, 'empty-b', 'nested-empty'), { recursive: true });

        const s = await stats(root);
        assert.equal(s.folders, 3, 'empty-a, empty-b, nested-empty');
        assert.equal(s.files, 1);
        assert.equal(s.treeBytes, 3);
    });

    test('dot-prefixed entries are excluded from counts and bytes', async () => {
        const root = freshRoot();
        writeFile(root, 'visible.txt', 'abc');
        writeFile(root, '.hidden', 'xxxxx');
        writeFile(root, '.hiddendir/inside.txt', 'yyyyyy');

        const s = await stats(root);
        assert.equal(s.files, 1, 'only the visible file');
        assert.equal(s.folders, 0, '.hiddendir excluded');
        assert.equal(s.treeBytes, 3);
    });

    test('aggregating a subdirectory reports only that subtree', async () => {
        const root = freshRoot();
        writeFile(root, 'inside/a.txt', 'abc');
        writeFile(root, 'outside.txt', 'zzzzzzzz');

        const s = await stats(root, '/inside');
        assert.equal(s.files, 1);
        assert.equal(s.treeBytes, 3, 'sibling file excluded');
    });
});

describe('getTreeStats - directory sizes are never accumulated', () => {
    // THE primary cross-platform correctness test. Directory entry size is 0 on
    // Windows but block-sized on ext4, so including it makes identical content
    // report different totals per host.
    test('identical content reports identical totals regardless of directory count', async () => {
        const flat = freshRoot();
        writeFile(flat, 'f1.bin', 'X'.repeat(1000));
        writeFile(flat, 'f2.bin', 'Y'.repeat(2000));

        const deep = freshRoot();
        writeFile(deep, 'a/b/c/d/e/f1.bin', 'X'.repeat(1000));
        writeFile(deep, 'g/h/i/j/k/l/m/n/f2.bin', 'Y'.repeat(2000));

        const flatStats = await stats(flat);
        const deepStats = await stats(deep);

        assert.equal(flatStats.treeBytes, 3000);
        assert.equal(deepStats.treeBytes, 3000, 'deep tree must match flat tree');
        assert.ok(deepStats.folders > flatStats.folders, 'folders ARE counted differently');
    });

    test('directory entry size is excluded even with many directories', async () => {
        const root = freshRoot();
        for (let i = 0; i < 25; i++) writeFile(root, `d${i}/file.txt`, 'ab');

        const s = await stats(root);
        assert.equal(s.files, 25);
        assert.equal(s.folders, 25);
        assert.equal(s.treeBytes, 50, 'exactly 25 x 2 bytes of file content');
    });
});

describe('getTreeStats - symbolic links and junctions', () => {
    const isWindows = process.platform === 'win32';
    // On Windows symlink('file') needs elevation (EPERM) but symlink('junction')
    // succeeds unelevated, so junction is what actually runs here.
    const link = (target, at) => fs.symlinkSync(target, at, 'junction');

    test('a junction to an outside directory is not traversed', { skip: !isWindows }, async () => {
        const outside = path.join(TMP, `outside-${seq++}`);
        fs.mkdirSync(path.join(outside, 'deep'), { recursive: true });
        fs.writeFileSync(path.join(outside, 'secret.txt'), 'S'.repeat(5000));
        fs.writeFileSync(path.join(outside, 'deep', 'more.txt'), 'M'.repeat(7000));

        const root = freshRoot();
        writeFile(root, 'legit.txt', 'ok');
        link(outside, path.join(root, 'escape'));

        const s = await stats(root);
        assert.equal(s.files, 1, 'only the real file');
        assert.equal(s.treeBytes, 2, 'no bytes from the link target');
        assert.ok(s.skippedLinks >= 1, 'link detected and skipped');
    });

    test('readdir reports the junction as a link while stat follows it', { skip: !isWindows }, () => {
        const outside = path.join(TMP, `outside-stat-${seq++}`);
        fs.mkdirSync(outside, { recursive: true });
        const root = freshRoot();
        link(outside, path.join(root, 'lnk'));

        const dirents = fs.readdirSync(root, { withFileTypes: true });
        assert.equal(dirents.find((d) => d.name === 'lnk').isSymbolicLink(), true,
            'readdir reports the link');
        assert.equal(fs.statSync(path.join(root, 'lnk')).isDirectory(), true,
            'stat follows it - this is why classification must not use stat');
    });

    test('a link cycle to an ancestor terminates and is skipped', { skip: !isWindows }, async () => {
        const root = freshRoot();
        const inner = path.join(root, 'inner');
        fs.mkdirSync(inner, { recursive: true });
        fs.writeFileSync(path.join(inner, 'file.txt'), 'abc');
        link(inner, path.join(inner, 'self'));

        const s = await stats(root);
        assert.equal(s.files, 1);
        assert.equal(s.treeBytes, 3);
        assert.ok(s.skippedLinks >= 1, 'cycle link skipped, never descended');
    });

    test('a broken link is skipped without error', { skip: !isWindows }, async () => {
        const root = freshRoot();
        writeFile(root, 'ok.txt', 'ab');
        link(path.join(root, 'does-not-exist'), path.join(root, 'broken'));

        const s = await stats(root);
        assert.equal(s.files, 1);
        assert.equal(s.treeBytes, 2);
        assert.deepEqual(s.errors, [], 'a broken link is not an error');
    });

    test('a link name never appears in the results', { skip: !isWindows }, async () => {
        const outside = path.join(TMP, `outside-name-${seq++}`);
        fs.mkdirSync(outside, { recursive: true });
        const root = freshRoot();
        link(outside, path.join(root, 'SENSITIVE-NAME'));

        assert.ok(!JSON.stringify(await stats(root)).includes('SENSITIVE-NAME'));
    });
});

describe('getTreeStats - graceful degradation', () => {
    test('an unreadable subtree is skipped while siblings survive', async () => {
        if (process.platform === 'win32') return; // Windows ACLs are not chmod-driven
        const root = freshRoot();
        writeFile(root, 'readable.txt', 'ab');
        const locked = path.join(root, 'locked');
        fs.mkdirSync(locked, { recursive: true });
        fs.writeFileSync(path.join(locked, 'hidden.txt'), 'xxxx');
        fs.chmodSync(locked, 0o000);

        try {
            const s = await stats(root);
            assert.equal(s.files, 1, 'readable sibling still counted');
            assert.equal(s.treeBytes, 2);
            assert.equal(s.folders, 1, 'the locked dir itself was seen');
            assert.ok(s.inaccessible >= 1);
            assert.ok(s.errors.length >= 1, 'diagnostic recorded');
        } finally {
            fs.chmodSync(locked, 0o755);
        }
    });

    test('diagnostics carry client paths, never absolute OS paths', async () => {
        const root = freshRoot();
        fs.writeFileSync(path.join(root, 'blocked'), 'not a directory', 'utf8');

        const s = await stats(root, '/blocked');
        assert.ok(s.errors.length >= 1, 'error recorded');

        const serialized = JSON.stringify(s);
        assert.ok(!/[A-Za-z]:[\\/]/.test(serialized), 'no drive letter leaked');
        assert.ok(!serialized.includes(TMP), 'no absolute temp path leaked');
        assert.ok(!serialized.includes('\\'), 'no backslash path leaked');
    });

    test('a missing start path degrades instead of throwing', async () => {
        const s = await stats(freshRoot(), '/nope');
        assert.equal(s.files, 0);
        assert.equal(s.treeBytes, 0);
        assert.ok(s.errors.length >= 1);
    });
});

describe('getTreeStats - bounded traversal', () => {
    test('the entry budget truncates and declares it', async () => {
        const root = freshRoot();
        for (let i = 0; i < 40; i++) writeFile(root, `f${i}.txt`, 'x');

        const s = await stats(root, '/', { maxEntries: 10 });
        assert.equal(s.truncated, true, 'truncation declared, never silent');
        assert.equal(s.entriesScanned, 10, 'stopped exactly at the budget');
        assert.ok(s.files <= 10);
    });

    test('the time budget truncates and declares it', async () => {
        const root = freshRoot();
        for (let i = 0; i < 200; i++) writeFile(root, `d${i}/f.txt`, 'x');

        const s = await stats(root, '/', { maxMs: 1 });
        assert.equal(s.truncated, true);
        assert.ok(s.entriesScanned <= 200);
    });

    test('a generous budget does not truncate a small tree', async () => {
        const root = freshRoot();
        writeFile(root, 'a.txt', 'x');
        assert.equal((await stats(root)).truncated, false);
    });

    test('truncation is deterministic for a fixed entry budget', async () => {
        const root = freshRoot();
        for (let i = 0; i < 50; i++) writeFile(root, `f${i}.txt`, 'x');

        const a = await stats(root, '/', { maxEntries: 17 });
        const b = await stats(root, '/', { maxEntries: 17 });

        assert.equal(a.entriesScanned, b.entriesScanned);
        assert.equal(a.files, b.files);
        assert.equal(a.treeBytes, b.treeBytes);
    });


});

describe('getTreeStats - no native path leakage', () => {
    test('the returned value contains no absolute path or drive letter', async () => {
        const root = freshRoot();
        writeFile(root, 'a/b/c.txt', 'abc');
        writeFile(root, 'd.txt', 'de');

        const serialized = JSON.stringify(await stats(root));
        assert.ok(!serialized.includes(root), 'no storage root path');
        assert.ok(!/[A-Za-z]:[\\/]/.test(serialized), 'no drive letter');
        assert.ok(!serialized.includes('\\'), 'no backslash separator');
    });

    test('error diagnostics reference client paths only', async () => {
        const root = freshRoot();
        fs.mkdirSync(path.join(root, 'a'), { recursive: true });
        fs.writeFileSync(path.join(root, 'a', 'b'), 'file-in-the-way', 'utf8');

        const s = await stats(root);
        for (const e of s.errors) {
            assert.ok(e.clientPath.startsWith('/'), `client path, got: ${e.clientPath}`);
        }
    });
});

describe('getTreeStats - file-type breakdown', () => {
    test('recognised extensions map to their documented category', async () => {
        const root = freshRoot();
        writeFile(root, 'a.jpg', '1');
        writeFile(root, 'b.PNG', '22');
        writeFile(root, 'c.mp4', '333');
        writeFile(root, 'd.pdf', '4444');
        writeFile(root, 'e.mp3', '55555');
        writeFile(root, 'f.zip', '666666');
        writeFile(root, 'g.js', '7777777');
        writeFile(root, 'h.unknownext', '8');

        const s = await stats(root);
        assert.equal(s.breakdown.image, 3, 'jpg + PNG, case-insensitive');
        assert.equal(s.breakdown.video, 3);
        assert.equal(s.breakdown.document, 4);
        assert.equal(s.breakdown.audio, 5);
        assert.equal(s.breakdown.archive, 6);
        assert.equal(s.breakdown.code, 7);
        assert.equal(s.breakdown.other, 1, 'unknown extension falls back (content is 1 byte)');
    });

    test('breakdown sums exactly to treeBytes', async () => {
        const root = freshRoot();
        writeFile(root, 'img/a.png', 'X'.repeat(10));
        writeFile(root, 'vid/b.mp4', 'Y'.repeat(20));
        writeFile(root, 'doc/c.pdf', 'Z'.repeat(30));
        writeFile(root, 'noext', 'W'.repeat(5));

        const s = await stats(root);
        const sum = Object.values(s.breakdown).reduce((a, b) => a + b, 0);
        assert.equal(sum, s.treeBytes, 'reconciles exactly');
        assert.equal(sum, 65);
    });

    test('folders never appear in the breakdown', async () => {
        const root = freshRoot();
        writeFile(root, 'folder/a.txt', 'ab');

        const s = await stats(root);
        assert.equal(s.folders, 1);
        assert.equal(s.breakdown.folder, undefined, 'no folder key');
        assert.equal(s.breakdown.document, 2);
    });
});
