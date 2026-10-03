// test/integration/repo-guardrails.test.js
'use strict';

/**
 * Repository-level guardrails (files-page-correctness, regression-guardrails).
 * Structural facts no runtime test observes: how the suite is discovered, what
 * the manifest depends on, and what version control ignores.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());

describe('the test command', () => {
    test('discovery is scoped to the test directory', () => {
        assert.match(pkg.scripts.test, /^node --test "test\/\*\*\/\*\.test\.js"$/);
    });

    test('the Files page module suite exists where that glob discovers it', () => {
        assert.ok(fs.existsSync(path.join(ROOT, 'test', 'frontend', 'files.test.js')));
    });
});

describe('the dependency manifest', () => {
    test('lists no dependency introduced by this change', () => {
        assert.deepEqual(Object.keys(pkg.dependencies).sort(),
            ['archiver', 'cors', 'dotenv', 'express', 'helmet', 'morgan', 'multer']);
        assert.deepEqual(Object.keys(pkg.devDependencies || {}).sort(), ['nodemon']);
    });
});

describe('version control', () => {
    test('the environment file is ignored by an active (uncommented) rule', () => {
        assert.ok(gitignore.includes('.env'));
    });

    test('the scratch directory is ignored', () => {
        assert.ok(gitignore.includes('temp/'));
    });
});
