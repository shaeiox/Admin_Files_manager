// test/services/FileSystemService.volume.test.js
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-volume-'));
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

describe('computeCapacity - arithmetic (pure, no syscall)', () => {
    test('uses bsize * (blocks - bavail) and bsize * blocks', async () => {
        const FileSystemService = await load(freshRoot());
        const result = FileSystemService.computeCapacity({
            bsize: 4096, blocks: 1000, bavail: 400,
        });

        assert.equal(result.totalBytes, 4096 * 1000);
        assert.equal(result.usedBytes, 4096 * (1000 - 400));
        assert.equal(result.usedBytes, 4096 * 600);
        assert.equal(result.volumeAvailable, true);
    });

    test('bsize is read verbatim - never multiplied by 1024', async () => {
        const FileSystemService = await load(freshRoot());
        // 1000 is deliberately NOT a power of two.
        const result = FileSystemService.computeCapacity({
            bsize: 1000, blocks: 100, bavail: 40,
        });

        assert.equal(result.totalBytes, 100000, 'not 102400000');
        assert.equal(result.usedBytes, 60000, 'not 61440000');
        assert.notEqual(result.totalBytes, 1000 * 1024 * 100,
            'a 1024 assumption would inflate by 1024x');
    });

    test('handles a non-power-of-two bsize like 512-byte or odd sectors', async () => {
        const FileSystemService = await load(freshRoot());
        for (const bsize of [512, 1000, 4096, 8192, 32768, 65536]) {
            const result = FileSystemService.computeCapacity({ bsize, blocks: 10, bavail: 4 });
            assert.equal(result.totalBytes, bsize * 10, `bsize ${bsize}`);
            assert.equal(result.usedBytes, bsize * 6, `bsize ${bsize}`);
        }
    });

    test('bavail semantics: available-to-unprivileged, not bfree', async () => {
        const FileSystemService = await load(freshRoot());
        // Where bfree !== bavail (ext4 reserves blocks), the contract is bavail.
        const result = FileSystemService.computeCapacity({
            bsize: 4096, blocks: 1000, bavail: 900, bfree: 1000,
        });

        assert.equal(result.usedBytes, 4096 * 100, 'uses bavail=900');
        assert.notEqual(result.usedBytes, 0, 'a bfree-based result would wrongly read 0 used');
    });

    test('a fully available volume reports zero used, not null', async () => {
        const FileSystemService = await load(freshRoot());
        const result = FileSystemService.computeCapacity({
            bsize: 4096, blocks: 100, bavail: 100,
        });

        assert.equal(result.usedBytes, 0);
        assert.equal(result.totalBytes, 409600);
        assert.equal(result.volumeAvailable, true, '0 used is a REAL reading here');
    });

    test('usedBytes never exceeds totalBytes', async () => {
        const FileSystemService = await load(freshRoot());
        for (const bavail of [0, 250, 500, 750, 1000]) {
            const r = FileSystemService.computeCapacity({ bsize: 4096, blocks: 1000, bavail });
            assert.ok(r.usedBytes <= r.totalBytes, `bavail=${bavail}`);
        }
    });
});

describe('computeCapacity - unavailability', () => {
    const unavailable = (result, label) => {
        assert.equal(result.volumeAvailable, false, label);
        assert.equal(result.usedBytes, null, `${label}: usedBytes is null, NOT 0`);
        assert.equal(result.totalBytes, null, `${label}: totalBytes is null, NOT 0`);
    };

    test('absent capacity fields yield nulls', async () => {
        const FileSystemService = await load(freshRoot());
        unavailable(FileSystemService.computeCapacity({}), 'empty object');
    });

    test('undefined result yields nulls', async () => {
        const FileSystemService = await load(freshRoot());
        unavailable(FileSystemService.computeCapacity(undefined), 'undefined');
    });

    test('null result yields nulls', async () => {
        const FileSystemService = await load(freshRoot());
        unavailable(FileSystemService.computeCapacity(null), 'null');
    });

    test('zero capacity yields nulls rather than a zero-volume reading', async () => {
        const FileSystemService = await load(freshRoot());
        unavailable(FileSystemService.computeCapacity({ bsize: 0, blocks: 0, bavail: 0 }), 'all zero');
    });

    test('a negative capacity yields nulls', async () => {
        const FileSystemService = await load(freshRoot());
        unavailable(
            FileSystemService.computeCapacity({ bsize: 4096, blocks: -5, bavail: 0 }),
            'negative blocks'
        );
    });

    test('a missing bsize yields nulls even with valid block counts', async () => {
        const FileSystemService = await load(freshRoot());
        unavailable(
            FileSystemService.computeCapacity({ blocks: 1000, bavail: 400 }),
            'bsize missing'
        );
    });

    test('a missing bavail yields nulls rather than assuming full availability', async () => {
        const FileSystemService = await load(freshRoot());
        unavailable(
            FileSystemService.computeCapacity({ bsize: 4096, blocks: 1000 }),
            'bavail missing'
        );
    });

    test('zero is never substituted for null', async () => {
        const FileSystemService = await load(freshRoot());
        const r = FileSystemService.computeCapacity({ bsize: 4096, blocks: 0, bavail: 0 });

        assert.notEqual(r.usedBytes, 0, '0 would read as a real measurement');
        assert.notEqual(r.totalBytes, 0, '0 would read as a real measurement');
        assert.ok(r.usedBytes === null && r.totalBytes === null);
    });

    test('unavailability carries no partial or fabricated values', async () => {
        const FileSystemService = await load(freshRoot());
        const r = FileSystemService.computeCapacity({ bsize: 4096, blocks: 1000 });

        assert.deepEqual(Object.keys(r).sort(), ['totalBytes', 'usedBytes', 'volumeAvailable']);
    });
});

describe('getVolumeStats - real platform reading', () => {
    test('reports a real capacity for the containing volume', async () => {
        const FileSystemService = await load(freshRoot());
        const result = await FileSystemService.getVolumeStats();

        assert.equal(result.volumeAvailable, true);
        assert.ok(Number.isFinite(result.totalBytes), 'totalBytes is a finite number');
        assert.ok(Number.isFinite(result.usedBytes), 'usedBytes is a finite number');
        assert.ok(result.totalBytes > 0, 'a real disk is not zero-capacity');
        assert.ok(result.usedBytes >= 0);
        assert.ok(result.usedBytes <= result.totalBytes);
    });

    test('values are plain JSON-safe numbers, never BigInt', async () => {
        const FileSystemService = await load(freshRoot());
        const result = await FileSystemService.getVolumeStats();

        assert.equal(typeof result.totalBytes, 'number');
        assert.equal(typeof result.usedBytes, 'number');
        // BigInt would throw here - this is the real reason bigint:true is avoided.
        assert.doesNotThrow(() => JSON.stringify(result), 'must be JSON-serialisable');
    });

    test('the raw statfs result is available for cross-checking', async () => {
        const FileSystemService = await load(freshRoot());
        const result = await FileSystemService.getVolumeStats();

        assert.ok(result.raw, 'raw statfs fields exposed');
        assert.equal(typeof result.raw.bsize, 'number');
        assert.equal(result.totalBytes, result.raw.bsize * result.raw.blocks);
        assert.equal(result.usedBytes, result.raw.bsize * (result.raw.blocks - result.raw.bavail));
    });
});

describe('getVolumeStats - volume resolution', () => {
    test('a trailing separator or ./ segment does not change the measurement', async () => {
        const root = freshRoot();

        const FileSystemService = await load(root);
        const plain = await FileSystemService.getVolumeStats();

        const fs2 = await load(`${root}${path.sep}`);
        const trailing = await fs2.getVolumeStats();

        const fs3 = await load(path.join(root, '.'));
        const dotted = await fs3.getVolumeStats();

        assert.equal(trailing.totalBytes, plain.totalBytes, 'trailing separator');
        assert.equal(dotted.totalBytes, plain.totalBytes, 'redundant . segment');
        assert.equal(trailing.volumeAvailable, true);
        assert.equal(dotted.volumeAvailable, true);
    });

    test('a subdirectory of the same volume reports the same capacity', async () => {
        const root = freshRoot();
        const nested = path.join(root, 'a', 'b');
        fs.mkdirSync(nested, { recursive: true });

        const FileSystemService = await load(root);
        const rootStats = await FileSystemService.getVolumeStats();

        const fs2 = await load(nested);
        const nestedStats = await fs2.getVolumeStats();

        assert.equal(nestedStats.totalBytes, rootStats.totalBytes, 'capacity is per-volume');
    });

    test('capacity describes the VOLUME, never the managed tree', async () => {
        const root = freshRoot();
        fs.writeFileSync(path.join(root, 'tiny.txt'), 'x');

        const FileSystemService = await load(root);
        const volume = await FileSystemService.getVolumeStats();
        const tree = await FileSystemService.getTreeStats('/');

        assert.notEqual(volume.totalBytes, tree.treeBytes,
            'volume capacity and tree size are different quantities');
        assert.ok(volume.totalBytes > tree.treeBytes);
    });
});

describe('getVolumeStats - graceful degradation', () => {
    test('an unresolvable root degrades to unavailability, not a throw', async () => {
        const root = freshRoot();
        const FileSystemService = await load(root);

        // A path that resolves inside the root but does not exist: statfs fails.
        const result = await FileSystemService.getVolumeStats('/definitely-not-here');

        assert.equal(result.volumeAvailable, false);
        assert.equal(result.usedBytes, null);
        assert.equal(result.totalBytes, null);
    });

    test('degradation does not fabricate a reading', async () => {
        const root = freshRoot();
        const FileSystemService = await load(root);

        const result = await FileSystemService.getVolumeStats('/definitely-not-here');
        assert.ok(result.usedBytes === null, 'never 0');
        assert.ok(result.totalBytes === null, 'never 0');
    });

    test('error detail carries no absolute path', async () => {
        const root = freshRoot();
        const FileSystemService = await load(root);

        const result = await FileSystemService.getVolumeStats('/definitely-not-here');
        if (result.error) {
            assert.ok(!/[A-Za-z]:[\\/]/.test(result.error), 'no drive letter');
            assert.ok(!result.error.includes(TMP), 'no absolute temp path');
        }
        assert.ok(!JSON.stringify(result).includes(TMP), 'nothing leaks the absolute root');
    });
});

describe('getVolumeStats - no platform gating', () => {
    test('the implementation contains no platform-name branch', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '..', '..', 'src', 'services', 'FileSystemService.js'),
            'utf8'
        );

        const volumeSection = source.slice(source.indexOf('getVolumeStats'));
        assert.ok(
            !/process\.platform|os\.type\(\)|win32|linux/.test(volumeSection),
            'capacity must be attempted unconditionally, never gated on platform'
        );
    });

    test('statfs is requested without bigint, so results stay JSON-safe', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '..', '..', 'src', 'services', 'FileSystemService.js'),
            'utf8'
        );

        assert.ok(
            !/statfs\([^)]*bigint/.test(source),
            'bigint:true would yield BigInt, which JSON.stringify cannot serialise'
        );
    });
});
