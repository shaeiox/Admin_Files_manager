// test/utils/fileTypes.test.js
'use strict';

/**
 * The taxonomy guard that src/utils/fileTypes.js used to say did not exist.
 *
 * A test over fileTypes.js alone cannot catch the drift that matters, because the
 * drift is BETWEEN copies. So this file compares the server classifier against
 * the client's type table (public/assets/js/app.js `FileTypes`), and asserts at
 * source level that the listing handler does not re-grow an inline copy.
 *
 * It must fail if either side is edited without the other.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { CATEGORIES, EXTENSION_MAP, classifyFile, emptyBreakdown } = require('../../src/utils/fileTypes');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'app.js');
const CONTROLLER_PATH = path.join(__dirname, '..', '..', 'src', 'controllers', 'fs.controller.js');

// app.js is a classic browser script; two stubbed globals are enough to evaluate it.
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { addEventListener() {} };
require(APP_PATH);
const { FileTypes, resolveType } = globalThis.window.AFM;

describe('server classifier and client type table agree exactly', () => {
    test('every extension the client badges is classified identically by the server', () => {
        for (const [category, def] of Object.entries(FileTypes)) {
            for (const ext of def.exts) {
                assert.equal(classifyFile(`sample.${ext}`), category, `.${ext}: client says ${category}`);
                assert.equal(classifyFile(`SAMPLE.${ext.toUpperCase()}`), category, `.${ext} is case-insensitive`);
            }
        }
    });

    test('the two extension sets are equal as sets', () => {
        const client = new Set(Object.values(FileTypes).flatMap((d) => d.exts));
        const server = new Set(Object.values(EXTENSION_MAP).flat());
        const onlyClient = [...client].filter((e) => !server.has(e));
        const onlyServer = [...server].filter((e) => !client.has(e));
        assert.deepEqual(onlyClient, [], 'badged by the client but unfilterable on the server');
        assert.deepEqual(onlyServer, [], 'classified by the server but unbadged on the client');
    });

    test('the category sets agree (client categories plus the unclassified bucket)', () => {
        assert.deepEqual([...Object.keys(FileTypes), 'other'].sort(), [...CATEGORIES].sort());
    });

    test('client display and server classification agree for representative names', () => {
        for (const name of ['clip.MP4', 'a.tar.gz', 'deck.pptx', 'main.go', 'unknown.qqq']) {
            assert.equal(resolveType(name).key, classifyFile(name), name);
        }
    });
});

describe('classifier edge cases', () => {
    test('an extension-free name is unclassified', () => {
        assert.equal(classifyFile('Makefile'), 'other');
    });

    test('a leading-dot name is not treated as an extension', () => {
        assert.equal(classifyFile('.png'), 'other');
        assert.equal(classifyFile('.bashrc'), 'other');
    });

    test('a trailing dot is not an extension', () => {
        assert.equal(classifyFile('weird.'), 'other');
    });

    test('the storage breakdown keeps its own contract: no folder category', () => {
        assert.ok(!('folder' in emptyBreakdown()));
        assert.ok('other' in emptyBreakdown());
    });
});

describe('the listing handler does not carry its own taxonomy', () => {
    const source = fs.readFileSync(CONTROLLER_PATH, 'utf8');

    test('fs.controller.js classifies through the shared module', () => {
        assert.match(source, /require\(['"]\.\.\/utils\/fileTypes['"]\)/);
        assert.match(source, /classifyFile\(/);
    });

    test('fs.controller.js contains no inline extension list', () => {
        const allExtensions = Object.values(EXTENSION_MAP).flat();
        const inlined = allExtensions.filter((ext) => new RegExp(`['"\`]${ext}['"\`]`).test(source));
        assert.deepEqual(inlined, [], 'quoted extension literals in the controller');
    });
});
