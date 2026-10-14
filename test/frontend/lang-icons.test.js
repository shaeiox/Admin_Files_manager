'use strict';

// LangIcons (app.js) points code extensions at vendored SVGs. A value with no file
// would render a broken <img>; a key outside the code category would never be reached.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { addEventListener() {} };
require(path.join(ROOT, 'public', 'assets', 'js', 'app.js'));
const { LangIcons, FileTypes } = globalThis.window.AFM;

test('every language icon is vendored locally', () => {
  for (const [ext, name] of Object.entries(LangIcons)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'public', 'assets', 'icons', 'lang', `${name}.svg`)), `.${ext} -> ${name}.svg`);
  }
});

test('every mapped extension is classified as code', () => {
  for (const ext of Object.keys(LangIcons)) assert.ok(FileTypes.code.exts.includes(ext), `.${ext}`);
});
