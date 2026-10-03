// test/services/FileSystemService.rename.test.js
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
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-rename-'));
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

describe('rename - legitimate operations', () => {
    test('renames a file in the same directory', async () => {
        const root = freshRoot();
        fs.writeFileSync(path.join(root, 'old.txt'), 'data');
        const FileSystemService = await load(root);

        const result = await FileSystemService.rename('/old.txt', 'new.txt');

        assert.equal(result.oldPath, '/old.txt');
        assert.equal(result.newPath, '/new.txt');
        assert.equal(fs.existsSync(path.join(root, 'new.txt')), true);
        assert.equal(fs.existsSync(path.join(root, 'old.txt')), false);
    });

    test('refuses to overwrite an existing item', async () => {
        const root = freshRoot();
        fs.writeFileSync(path.join(root, 'a.txt'), 'a');
        fs.writeFileSync(path.join(root, 'b.txt'), 'b');
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.rename('/a.txt', 'b.txt'),
            (err) => err instanceof AppError && err.statusCode === 409
        );
        assert.equal(fs.readFileSync(path.join(root, 'b.txt'), 'utf8'), 'b',
            'the existing file was not clobbered');
    });

    test('missing source is a 404', async () => {
        const root = freshRoot();
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.rename('/nope.txt', 'x.txt'),
            (err) => err instanceof AppError && err.statusCode === 404
        );
    });
});

describe('rename - traversal defence (F4)', () => {
    // The pre-fix re-validation was a silent no-op. These assert the corrected
    // containment check directly, without relying on upstream name validation,
    // so the defence-in-depth layer is genuinely exercised.
    // Only names that actually leave the root belong here. '../escaped.txt' from
    // a nested dir lands back INSIDE the root, so containment correctly allows it -
    // it is blocked a layer earlier, by validateFileName in the controller.
    for (const evilName of ['../../escaped.txt', '../../../escaped.txt', '..']) {
        test(`rejects a traversing newName at the service layer: ${evilName}`, async () => {
            const root = freshRoot();
            const subdir = path.join(root, 'sub');
            fs.mkdirSync(subdir, { recursive: true });
            fs.writeFileSync(path.join(subdir, 'file.txt'), 'data');
            const FileSystemService = await load(root);

            // Bypass the controller's validateFileName to reach the service
            // directly - this is the layer that was previously unprotected.
            await assert.rejects(
                () => FileSystemService.rename('/sub/file.txt', evilName),
                (err) => err instanceof AppError && err.statusCode === 403,
                `expected 403 for ${evilName}`
            );

            assert.equal(fs.existsSync(path.join(root, 'escaped.txt')), false,
                'nothing was written outside the root');
            assert.equal(fs.existsSync(path.join(subdir, 'file.txt')), true,
                'the original file is untouched');
        });
    }

    test('an in-root parent reference is allowed by containment but blocked upstream', async () => {
        const root = freshRoot();
        const subdir = path.join(root, 'sub');
        fs.mkdirSync(subdir, { recursive: true });
        fs.writeFileSync(path.join(subdir, 'file.txt'), 'data');
        const FileSystemService = await load(root);

        // Lands at <root>/escaped.txt - inside the root, so the containment layer
        // must permit it. The controller's validateFileName is what rejects '..'.
        // This test pins WHERE each control applies, so neither is assumed to
        // cover the other.
        await FileSystemService.rename('/sub/file.txt', '../escaped.txt');

        assert.equal(fs.existsSync(path.join(root, 'escaped.txt')), true,
            'stayed inside the root');

        const { validateFileName } = require('../../src/utils/validators');
        assert.throws(() => validateFileName('../escaped.txt'),
            'the controller layer is the one that rejects it');
    });

    test('a name-prefix sibling is not a valid rename target', async () => {
        const root = freshRoot();
        fs.writeFileSync(path.join(root, 'file.txt'), 'data');
        // sibling of the root, sharing its name prefix
        fs.mkdirSync(path.join(TMP, `${path.basename(root)}-backup`), { recursive: true });
        const FileSystemService = await load(root);

        await assert.rejects(
            () => FileSystemService.rename('/file.txt', `../${path.basename(root)}-backup/x.txt`),
            (err) => err instanceof AppError && err.statusCode === 403
        );
    });
});

describe('rename - storage root sentinel still holds', () => {
    test('the root itself is not a rename target', async () => {
        const root = freshRoot();
        const FileSystemService = await load(root);

        // Renaming the root's only child to '.' would resolve to the root.
        await assert.rejects(() => FileSystemService.rename('/', 'anything'),
            (err) => err instanceof AppError);
    });
});
