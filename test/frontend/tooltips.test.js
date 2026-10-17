// test/frontend/tooltips.test.js
'use strict';

/**
 * Tooltip placement contract (notification-panel-and-tooltip-placement).
 *
 * Controls whose default "above" tooltip clips against the viewport, a sticky
 * header, or an overflow container must declare an explicit data-tip-pos, and
 * the tooltip rule must be bounded. Row action buttons in the Files/Uploads
 * scroll areas use data-tip-pos="bottom". The bulk actions sit in the command
 * bar as labelled buttons (files-page-ux-redesign), so they carry no tooltip.
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
  // List rows open to the left: a "bottom" tip on the last row spilled out of
  // the table's scroll box and gave short lists a stray scrollbar.
  assert.match(FILES_JS, /data-act="download"[^>]*data-tip="Download" data-tip-pos="left"/);
  assert.match(FILES_JS, /data-act="more"[^>]*data-tip="More" data-tip-pos="left"/);
  // The grid card menu sits at the card's top, so its tip opens inside the card.
  assert.match(FILES_JS, /file-card-menu">\s*<button[^>]*data-tip="More" data-tip-pos="bottom"/);
  assert.match(FILES_JS, /data-tip="Copy location" data-tip-pos="bottom"/);
  assert.match(UPLOADS_JS, /data-tip="\$\{label\}" data-tip-pos="bottom"/);
});

test('grid more-actions control matches its list counterpart', () => {
  const occurrences = FILES_JS.match(/data-tip="More"/g) || [];
  assert.strictEqual(occurrences.length, 2, 'list row and grid card both carry data-tip="More"');
});

test('bulk actions are labelled buttons in the command bar, so they need no tooltip', () => {
  // Their meaning is the visible label; a tip would only repeat it. The one
  // icon-only control (the narrow-screen overflow menu) keeps an aria-label.
  for (const id of ['bulkDownload', 'bulkStar', 'bulkMove', 'bulkCopy', 'bulkPolicy', 'bulkDelete', 'bulkClear']) {
    const m = FILES_HTML.match(new RegExp(`<button[^>]*id="${id}"[^>]*>[\\s\\S]*?</button>`));
    assert.ok(m, `${id} exists`);
    assert.doesNotMatch(m[0], /data-tip=/, `${id} carries no tooltip`);
    assert.match(m[0], /<span>[^<]+<\/span>/, `${id} has a visible label`);
  }
  assert.match(FILES_HTML, /id="bulkMore" aria-label="More actions for selected"/);
});
