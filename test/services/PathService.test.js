// test/services/PathService.test.js
//
// Regression suite for the path-containment boundary.
//
// `PathService` is the single choke point every client-supplied path must pass
// through before touching disk (`AGENTS.md` architecture rule 2). Containment was
// previously a naive string-prefix test (`targetPath.startsWith(rootPath)`) with
// no separator boundary, so a sibling directory sharing the root's name prefix
// (`download` vs `download-backup`) was treated as contained.
//
// These tests were written and observed FAILING against the unfixed service
// before the containment correction was applied. See tests 4, 6, 7, 8 and 9 —
// those are the ones that reproduce the vulnerability.

'use strict';

// `config/env` calls dotenv.config() on every fresh require. dotenv 17 logs a
// random tip unless quieted, and this suite deliberately re-requires the config
// module once per storage-root spelling. Silence it for the test process only.
process.env.DOTENV_CONFIG_QUIET = 'true';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const AppError = require('../../src/utils/AppError');

const ENV_MODULE = require.resolve('../../src/config/env');
const SERVICE_MODULE = require.resolve('../../src/services/PathService');

const ORIGINAL_STORAGE_ROOT = process.env.STORAGE_ROOT;

/**
 * Loads a fresh `PathService` bound to `root`.
 *
 * `config/env` snapshots `process.env.STORAGE_ROOT` at require time, so the
 * module cache has to be purged for each spelling under test. dotenv never
 * overrides an already-set variable, so assigning first wins over `.env`.
 *
 * @param {string} root - Storage root in any spelling
 * @returns {typeof import('../../src/services/PathService')}
 */
function loadPathService(root) {
    process.env.STORAGE_ROOT = root;
    delete require.cache[ENV_MODULE];
    delete require.cache[SERVICE_MODULE];
    return require(SERVICE_MODULE);
}

/**
 * Classifies a client path as contained or rejected.
 * A rejection must be an `AppError` with status 403.
 *
 * @returns {'allow'|'deny'}
 */
function verdictFor(PathService, clientPath) {
    try {
        PathService.resolveSecurePath(clientPath);
        return 'allow';
    } catch (error) {
        assert.ok(
            error instanceof AppError,
            `expected AppError for ${JSON.stringify(clientPath)}, got ${error && error.name}`
        );
        assert.equal(error.statusCode, 403);
        return 'deny';
    }
}

/** Asserts a client path is rejected with `AppError` 403. */
function assertDenied(resolve, clientPath) {
    assert.throws(
        () => resolve(clientPath),
        (error) => {
            assert.ok(
                error instanceof AppError,
                `expected AppError for ${JSON.stringify(clientPath)}, got ${error && error.name}`
            );
            assert.equal(error.statusCode, 403);
            return true;
        },
        `expected ${JSON.stringify(clientPath)} to be rejected with 403`
    );
}

/**
 * Leaf name of a sibling of `root`, e.g. `download-backup` for root `D:\download`.
 * Derived with `path` so the escape case stays live on whatever host runs the suite.
 */
function siblingLeaf(root, siblingName) {
    const parent = path.dirname(path.resolve(root));
    return path.relative(parent, path.join(parent, siblingName));
}

/** Client path that resolves to a name-prefix sibling of `root`. */
function siblingEscapeClientPath(root, siblingName) {
    return `/../${siblingLeaf(root, siblingName)}/x`;
}

/** The five root spellings whose containment verdicts must be identical. */
const WINDOWS_ROOT_SPELLINGS = [
    'D:\\download',
    'D:\\download\\',
    'D:/download',
    'd:\\Download',
    'D:\\download\\.\\',
];

/**
 * The subset of spellings that differ only by a trailing separator or a
 * redundant `.` segment. These must normalise to the *identical* root string.
 *
 * `d:\Download` is deliberately excluded: `path.resolve` preserves the
 * configured letter case, and the single-resolution-basis rule (D5) forbids
 * canonicalising the root with `realpath` — which on a case-insensitive volume
 * would return a different case than the `resolve`-produced target and so
 * mismatch it. The case variant is therefore judged on verdict invariance only.
 */
const NORMALIZED_ROOT_SPELLINGS = [
    'D:\\download',
    'D:\\download\\',
    'D:/download',
    'D:\\download\\.\\',
];

let fixtureDir = null;
let realRoot = null;

test.before(async () => {
    // Fixtures live under the OS temp dir, never inside the repo.
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'afm-pathsvc-'));
    realRoot = path.join(fixtureDir, 'download');

    await fs.mkdir(path.join(realRoot, 'media'), { recursive: true });
    await fs.mkdir(path.join(realRoot, 'a', 'b'), { recursive: true });
    // Name-prefix siblings of the root — the attack targets.
    await fs.mkdir(path.join(fixtureDir, 'download-backup'), { recursive: true });
    await fs.mkdir(path.join(fixtureDir, 'download-2'), { recursive: true });

    await fs.writeFile(path.join(realRoot, 'media', 'a.txt'), 'a');
    await fs.writeFile(path.join(realRoot, 'a', 'b', 'c.txt'), 'c');
    await fs.writeFile(path.join(fixtureDir, 'download-backup', 'secret.txt'), 'secret');
    await fs.writeFile(path.join(fixtureDir, 'download-2', 'secret.txt'), 'secret');
});

test.after(async () => {
    if (fixtureDir) {
        await fs.rm(fixtureDir, { recursive: true, force: true });
    }
    if (ORIGINAL_STORAGE_ROOT === undefined) {
        delete process.env.STORAGE_ROOT;
    } else {
        process.env.STORAGE_ROOT = ORIGINAL_STORAGE_ROOT;
    }
});

// ---------------------------------------------------------------------------
// 1. Root itself is contained
// ---------------------------------------------------------------------------

test('1. root itself is contained', () => {
    const PathService = loadPathService(realRoot);

    assert.equal(PathService.resolveSecurePath('/'), path.resolve(realRoot));
    assert.equal(verdictFor(PathService, '/'), 'allow');
});

// ---------------------------------------------------------------------------
// 2. Direct child is contained
// ---------------------------------------------------------------------------

test('2. direct child is contained', () => {
    const PathService = loadPathService(realRoot);
    const root = path.resolve(realRoot);

    assert.equal(PathService.resolveSecurePath('/media'), path.resolve(root, 'media'));
    assert.equal(PathService.resolveSecurePath('/media/a.txt'), path.resolve(root, 'media', 'a.txt'));
    assert.equal(verdictFor(PathService, '/media'), 'allow');
});

// ---------------------------------------------------------------------------
// 3. Nested child is contained
// ---------------------------------------------------------------------------

test('3. nested child is contained', () => {
    const PathService = loadPathService(realRoot);
    const root = path.resolve(realRoot);

    assert.equal(PathService.resolveSecurePath('/a'), path.resolve(root, 'a'));
    assert.equal(PathService.resolveSecurePath('/a/b'), path.resolve(root, 'a', 'b'));
    assert.equal(PathService.resolveSecurePath('/a/b/c.txt'), path.resolve(root, 'a', 'b', 'c.txt'));
    assert.equal(verdictFor(PathService, '/a/b/c.txt'), 'allow');
});

// ---------------------------------------------------------------------------
// 4. Sibling-prefix path is rejected — the core case
// ---------------------------------------------------------------------------

test('4. sibling directory sharing the root name prefix is rejected', () => {
    const PathService = loadPathService(realRoot);
    const resolve = (p) => PathService.resolveSecurePath(p);
    const root = path.resolve(realRoot);

    // The escape lands on a real, existing directory outside the root.
    const escaped = path.resolve(root, '..', 'download-backup', 'secret.txt');
    assert.notEqual(escaped, root);
    assert.ok(!escaped.startsWith(root + path.sep), 'fixture sanity: escaped path must not be a real child');

    // This is exactly why the old guard was wrong: the escaped path IS a raw
    // string prefix-extension of the root, so `targetPath.startsWith(rootPath)`
    // returned true. Containment requires a separator boundary.
    assert.ok(
        escaped.startsWith(root),
        'documented flaw: the escaped path passes a naive string-prefix check'
    );

    assertDenied(resolve, '/../download-backup/secret.txt');
    assertDenied(resolve, '/../download-backup');
    assertDenied(resolve, '/../download-backup/');
    assertDenied(resolve, siblingEscapeClientPath(realRoot, 'download-backup'));

    assert.equal(verdictFor(PathService, '/../download-backup/x'), 'deny');
});

// ---------------------------------------------------------------------------
// 5. Classic `..` traversal is rejected
// ---------------------------------------------------------------------------

test('5. parent traversal above the root is rejected', () => {
    const PathService = loadPathService(realRoot);
    const resolve = (p) => PathService.resolveSecurePath(p);
    const root = path.resolve(realRoot);

    const escaped = path.resolve(root, '..', '..', 'escape', 'x');
    assert.ok(!escaped.startsWith(root));

    assertDenied(resolve, '/../../escape/x');
    assertDenied(resolve, '/../../../escape/x');
    assertDenied(resolve, '/media/../../../escape/x');
    assert.equal(verdictFor(PathService, '/../../escape/x'), 'deny');
});

// ---------------------------------------------------------------------------
// 6. Nested escape to a sibling prefix is rejected
// ---------------------------------------------------------------------------

test('6. nested escape to a sibling prefix is rejected', () => {
    const PathService = loadPathService(realRoot);
    const resolve = (p) => PathService.resolveSecurePath(p);
    const root = path.resolve(realRoot);

    // `/media/../../download-2/x` pops `media` and then `download`, landing on
    // `<root>/../download-2/x` — a name-prefix sibling of the root.
    const escaped = path.resolve(root, 'media', '..', '..', 'download-2', 'x');
    assert.equal(escaped, path.resolve(path.dirname(root), 'download-2', 'x'));
    assert.ok(escaped.startsWith(root), 'documented flaw: passes a naive string-prefix check');

    assertDenied(resolve, '/media/../../download-2/x');
    assertDenied(resolve, '/media/../../download-2/secret.txt');
    assertDenied(resolve, '/media/../../download-2');
    assert.equal(verdictFor(PathService, '/media/../../download-2/x'), 'deny');
});

// ---------------------------------------------------------------------------
// 7. Verdicts are invariant across Windows root spellings
// ---------------------------------------------------------------------------

test('7. containment verdicts are identical across five Windows root spellings', () => {
    const base = WINDOWS_ROOT_SPELLINGS[0];
    const cases = [
        { clientPath: '/', expected: 'allow' },
        { clientPath: '/media', expected: 'allow' },
        { clientPath: '/media/a.txt', expected: 'allow' },
        { clientPath: '/a/b/c.txt', expected: 'allow' },
        { clientPath: '/../escape/x', expected: 'deny' },
        { clientPath: siblingEscapeClientPath(base, 'download-backup'), expected: 'deny' },
        { clientPath: `/media/../../${siblingLeaf(base, 'download-2')}/x`, expected: 'deny' },
    ];

    const resolvedRoots = new Set();
    const observed = [];

    for (const { clientPath, expected } of cases) {
        const verdicts = WINDOWS_ROOT_SPELLINGS.map((spelling) => {
            const PathService = loadPathService(spelling);
            return verdictFor(PathService, clientPath);
        });
        observed.push({ clientPath, expected, verdicts });
    }

    // Trailing separators and redundant `.` segments are normalised away once.
    for (const spelling of NORMALIZED_ROOT_SPELLINGS) {
        resolvedRoots.add(loadPathService(spelling).resolveSecurePath('/'));
    }
    assert.equal(
        resolvedRoots.size,
        1,
        `trailing-separator spellings normalised to different roots: ` +
            NORMALIZED_ROOT_SPELLINGS.map((s) => `${s} -> ${loadPathService(s).resolveSecurePath('/')}`).join(' | ')
    );
    assert.equal([...resolvedRoots][0], path.resolve(base));

    for (const { clientPath, expected, verdicts } of observed) {
        assert.equal(
            new Set(verdicts).size,
            1,
            `verdict for ${JSON.stringify(clientPath)} varied across spellings: ` +
                WINDOWS_ROOT_SPELLINGS.map((s, i) => `${s}=${verdicts[i]}`).join(', ')
        );
        assert.equal(
            verdicts[0],
            expected,
            `all spellings agreed on ${verdicts[0]} for ${JSON.stringify(clientPath)}, expected ${expected}`
        );
    }
});

// ---------------------------------------------------------------------------
// 8. A POSIX-shaped root produces the matching verdict
// ---------------------------------------------------------------------------

test('8. a POSIX-shaped root produces the matching verdict', () => {
    const posixRoot = '/srv/download';
    const PathService = loadPathService(posixRoot);

    assert.equal(PathService.resolveSecurePath('/'), path.resolve(posixRoot));

    // Same verdicts as the Windows-root cases.
    assert.equal(verdictFor(PathService, '/'), 'allow');
    assert.equal(verdictFor(PathService, '/media/a.txt'), 'allow');
    assert.equal(verdictFor(PathService, '/a/b/c.txt'), 'allow');
    assert.equal(verdictFor(PathService, '/../download-secret/x'), 'deny');
    assert.equal(verdictFor(PathService, '/media/../../download-2/x'), 'deny');

    const escaped = path.resolve(posixRoot, '..', 'download-secret', 'x');
    assert.equal(escaped, path.resolve(path.dirname(path.resolve(posixRoot)), 'download-secret', 'x'));
    assert.ok(escaped.startsWith(path.resolve(posixRoot)), 'documented flaw: passes a naive string-prefix check');
});

// ---------------------------------------------------------------------------
// 9. toClientPath applies the same containment principle
// ---------------------------------------------------------------------------

test('9. toClientPath does not convert an outside-root absolute path', () => {
    const PathService = loadPathService(realRoot);
    const root = path.resolve(realRoot);

    // Outside the root -> no client path may represent that location.
    assert.equal(PathService.toClientPath(path.join(fixtureDir, 'download-backup', 'secret.txt')), '/');
    assert.equal(PathService.toClientPath(path.join(fixtureDir, 'download-2', 'secret.txt')), '/');
    assert.equal(PathService.toClientPath(path.resolve(root, '..', 'elsewhere')), '/');
    assert.equal(PathService.toClientPath(path.join(os.tmpdir(), 'unrelated', 'file.txt')), '/');

    // Inside the root -> POSIX forward-slash client path rooted at `/`.
    assert.equal(PathService.toClientPath(root), '/');
    assert.equal(PathService.toClientPath(path.join(root, 'media')), '/media');
    assert.equal(PathService.toClientPath(path.join(root, 'a', 'b', 'c.txt')), '/a/b/c.txt');

    const converted = PathService.toClientPath(path.join(root, 'a', 'b', 'c.txt'));
    assert.ok(converted.startsWith('/'));
    assert.ok(!converted.includes('\\'), 'client paths must use forward slashes');
});

// ---------------------------------------------------------------------------
// 10. Round-trip
// ---------------------------------------------------------------------------

test('10. client path -> resolve -> toClientPath returns the original', () => {
    const PathService = loadPathService(realRoot);

    for (const clientPath of ['/', '/media', '/media/a.txt', '/a', '/a/b', '/a/b/c.txt']) {
        const securePath = PathService.resolveSecurePath(clientPath);
        assert.equal(PathService.toClientPath(securePath), clientPath, `round-trip failed for ${clientPath}`);
    }
});
