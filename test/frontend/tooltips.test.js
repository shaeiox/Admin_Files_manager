// test/frontend/tooltips.test.js
'use strict';

/**
 * Tooltip placement contract (notification-panel-and-tooltip-placement).
 *
 * Controls whose default "above" tooltip clips against the viewport, a sticky
 * header, or an overflow container must declare an explicit data-tip-pos, and
 * the tooltip rule must be bounded. Row action buttons in the Files/Uploads
 * scroll areas use data-tip-pos="bottom"; the bulk bar keeps the default
 * because it floats near the viewport bottom (a "bottom" tip would clip).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT_DIR, ...p), 'utf8');

const COMPONENTS_CSS = read('public', 'assets', 'css', 'components.css');
const INDEX_HTML = read('public', 'index.html');
const FILES_HTML = read('public', 'files.html');
const UPLOADS_HTML = read('public', 'uploads.html');
const SETTINGS_HTML = read('public', 'settings.html');
const FILES_JS = read('public', 'assets', 'js', 'files.js');
const UPLOADS_JS = read('public', 'assets', 'js', 'uploads.js');

test('tooltip is bounded', () => {
  assert.match(COMPONENTS_CSS, /\[data-tip\]::after \{[^}]*max-width:/s);
  assert.match(COMPONENTS_CSS, /\[data-tip\]::after \{[^}]*text-overflow: ellipsis/s);
});

test('a right placement variant exists', () => {
  assert.match(COMPONENTS_CSS, /\[data-tip\]\[data-tip-pos="right"\]::after/);
});

test('every topbar control declares data-tip-pos="bottom"', () => {
  assert.match(INDEX_HTML, /id="refreshDashboard" data-tip="Refresh" data-tip-pos="bottom"/);
  assert.match(FILES_HTML, /data-view="list" data-tip="List view" data-tip-pos="bottom"/);
  assert.match(FILES_HTML, /data-view="grid" data-tip="Grid view" data-tip-pos="bottom"/);
  assert.match(FILES_HTML, /id="btnRefresh" data-tip="Refresh" data-tip-pos="bottom"/);
  assert.match(UPLOADS_HTML, /data-tip="Notifications" data-tip-pos="bottom"/);
  assert.match(SETTINGS_HTML, /data-tip="Notifications" data-tip-pos="bottom"/);
});

test('drawer close uses a viewport-safe placement', () => {
  assert.match(FILES_HTML, /id="drawerClose" data-tip="Close" data-tip-pos="bottom"/);
});

test('scroll-container action buttons declare a placement', () => {
  assert.match(FILES_JS, /data-tip="Download" data-tip-pos="bottom"/);
  assert.match(FILES_JS, /data-tip="More" data-tip-pos="bottom"/);
  assert.match(FILES_JS, /data-tip="Copy location" data-tip-pos="bottom"/);
  assert.match(UPLOADS_JS, /data-tip="\$\{label\}" data-tip-pos="bottom"/);
});

test('grid more-actions control matches its list counterpart', () => {
  const occurrences = FILES_JS.match(/data-tip="More"/g) || [];
  assert.strictEqual(occurrences.length, 2, 'list row and grid card both carry data-tip="More"');
});

test('bulk bar buttons intentionally keep the default above placement', () => {
  // The bulk bar floats near the viewport bottom; a bottom-opening tooltip
  // would clip. Guard against someone "fixing" this uniformly.
  for (const id of ['bulkDownload', 'bulkStar', 'bulkDelete', 'bulkClear']) {
    const m = FILES_HTML.match(new RegExp(`id="${id}" data-tip="[^"]+"`));
    assert.ok(m, `${id} has a tip`);
    assert.doesNotMatch(m[0], /data-tip-pos="bottom"/);
  }
});
