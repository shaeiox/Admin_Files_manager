// test/frontend/notifications.test.js
'use strict';

/**
 * Notification panel contract (notification-panel-and-tooltip-placement).
 *
 * Source-level assertions in the repo's vm/source-assertion style: the bell
 * is wired to the shared AFM.Notifications module that renders the real
 * activity feed, and no fabricated notification UI ships.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT_DIR, ...p), 'utf8');

const UPLOADS_HTML = read('public', 'uploads.html');
const SETTINGS_HTML = read('public', 'settings.html');
const UPLOADS_JS = read('public', 'assets', 'js', 'uploads.js');
const SETTINGS_JS = read('public', 'assets', 'js', 'settings.js');
const NOTIF_JS = read('public', 'assets', 'js', 'notifications.js');
const ROUTER_JS = read('public', 'assets', 'js', 'router.js');

test('both pages load the shared notifications module', () => {
  assert.match(UPLOADS_HTML, /<script src="assets\/js\/notifications\.js" defer><\/script>/);
  assert.match(SETTINGS_HTML, /<script src="assets\/js\/notifications\.js" defer><\/script>/);
  // after the namespace module, before the page module
  for (const [html, pageMod] of [[UPLOADS_HTML, 'uploads.js'], [SETTINGS_HTML, 'settings.js']]) {
    const ni = html.indexOf(`assets/js/notifications.js`);
    const pi = html.indexOf(`assets/js/${pageMod}`);
    assert.ok(ni > -1 && pi > -1 && ni < pi, `${pageMod} page must load notifications.js first`);
  }
});

test('both page modules bind the shared bell handler', () => {
  assert.match(UPLOADS_JS, /AFM\.Notifications\.bindTopbarBell\(\)/);
  assert.match(SETTINGS_JS, /AFM\.Notifications\.bindTopbarBell\(\)/);
});

test('both bells expose aria-expanded and aria-controls', () => {
  for (const html of [UPLOADS_HTML, SETTINGS_HTML]) {
    const bell = html.match(/<button class="btn-icon"[^>]*data-tip="Notifications"[^>]*>/);
    assert.ok(bell, 'bell button present');
    assert.match(bell[0], /aria-expanded="false"/);
    assert.match(bell[0], /aria-controls="notifPanel"/);
  }
});

test('the notifications module renders the four honest states', () => {
  assert.match(NOTIF_JS, /Loading…/);
  assert.match(NOTIF_JS, /No recent activity/);
  assert.match(NOTIF_JS, /Activity is unavailable right now\./);
  assert.match(NOTIF_JS, /Retry/);
});

test('the notifications module uses the real activity source and escapes it', () => {
  assert.match(NOTIF_JS, /\/dashboard\/summary/);
  assert.match(NOTIF_JS, /AFM\.escapeHtml\(row\.action\)/);
  assert.match(NOTIF_JS, /window\.API\.get\('\/dashboard\/summary'/);
});

test('the panel closes on Escape, outside click, and navigation', () => {
  assert.match(NOTIF_JS, /e\.key === 'Escape'/);
  assert.match(NOTIF_JS, /!e\.target\.closest\('#notifPanel'\)/);
  assert.match(ROUTER_JS, /AFM\.Notifications\?\.close\(\)/);
});

test('no fabricated bell dot or hardcoded connected status ships', () => {
  assert.doesNotMatch(UPLOADS_HTML, /notif-dot/);
  assert.doesNotMatch(SETTINGS_HTML, /notif-dot/);
  assert.doesNotMatch(SETTINGS_HTML, /integration-status connected"><span class="dot"><\/span> Notifications on/);
  assert.doesNotMatch(SETTINGS_HTML, /data-tip="Add event"/);
  assert.match(SETTINGS_HTML, /Not configured/);
});

test('the close handler restores focus to the bell', () => {
  assert.match(NOTIF_JS, /boundBell\.focus/);
});
