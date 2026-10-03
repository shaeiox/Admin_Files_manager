// test/frontend/files.test.js
'use strict';

/**
 * Files page module (public/assets/js/files.js) — files-page-correctness.
 *
 * No DOM harness and no new dependency (same approach as dashboard.test.js and
 * app.test.js): the real app.js and files.js are evaluated in a `vm` context.
 * app.js provides the real escapeHtml / Format / FileTypes / icon; the page
 * shell is a handful of stub elements that record what files.js writes into
 * them, and `window.API` is a scripted stub that records every request.
 *
 * What a stub cannot observe (layout, real focus traversal, the browser's own
 * event dispatch) was checked by hand in a browser; see tasks.md 4.13 / 5.11.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.join(__dirname, '..', '..');
const APP_SRC = fs.readFileSync(path.join(ROOT_DIR, 'public', 'assets', 'js', 'app.js'), 'utf8');
const FILES_SRC = fs.readFileSync(path.join(ROOT_DIR, 'public', 'assets', 'js', 'files.js'), 'utf8');
const FILES_HTML = fs.readFileSync(path.join(ROOT_DIR, 'public', 'files.html'), 'utf8');
const FILES_CSS = fs.readFileSync(path.join(ROOT_DIR, 'public', 'assets', 'css', 'files.css'), 'utf8');

const HOSTILE = '<img src=x onerror=alert(1)>"\'&.txt';

/* ══════════════════════════════════════════
   STUB DOM
   ══════════════════════════════════════════ */

function makeDocument() {
  const doc = {
    activeElement: null,
    title: '',
    listeners: {},
    openLayers: new Set(), // selectors document.querySelector should report as present
    body: null,
    addEventListener(type, fn, capture) { (doc.listeners[type] ||= []).push({ fn, capture: !!capture }); },
    querySelector(sel) { return doc.openLayers.has(sel) ? { sel } : null; },
    querySelectorAll() { return []; },
    contains(el) { return !!el && el.connected !== false; },
  };
  return doc;
}

class FakeEl {
  constructor(doc, id) {
    this.doc = doc;
    this.id = id;
    this.attrs = {};
    this.classes = new Set();
    this.listeners = {};
    this.html = '';
    this.value = '';
    this.hidden = false;
    this.checked = false;
    this.indeterminate = false;
    this.tabIndex = -1;
    this.textContent = '';
    this.children = {};
    this.connected = true;
  }
  set innerHTML(v) { this.html = String(v); }
  get innerHTML() { return this.html; }
  get classList() {
    const s = this.classes;
    return {
      add: (...c) => c.forEach(x => s.add(x)),
      remove: (...c) => c.forEach(x => s.delete(x)),
      toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; },
      contains: c => s.has(c),
    };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  querySelector(sel) { return this.children[sel] || null; }
  querySelectorAll() { return []; }
  contains(el) { return el === this; }
  focus() { this.doc.activeElement = this; }
  click() { this.clicked = (this.clicked || 0) + 1; }
  closest() { return null; }
  getBoundingClientRect() { return { left: 100, top: 100, bottom: 120, right: 140 }; }
}

/** A fake event target whose closest(sel) answers from a map of selector -> attributes. */
function target(matches, extra = {}) {
  const nodes = {};
  for (const [sel, attrs] of Object.entries(matches)) {
    nodes[sel] = {
      attrs,
      disabled: false,
      getAttribute: k => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null),
      getBoundingClientRect: () => ({ left: 10, top: 10, bottom: 30, right: 40 }),
    };
  }
  return Object.assign({
    closest: sel => nodes[sel] || null,
    hasAttribute: () => false,
  }, extra);
}

function event(t, extra = {}) {
  return Object.assign({
    target: t,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() {},
  }, extra);
}

/* ══════════════════════════════════════════
   LOADER
   ══════════════════════════════════════════ */

function file(p, extra = {}) {
  const name = p.split('/').filter(Boolean).pop();
  const isFolder = !!extra.isFolder;
  return Object.assign({
    id: p, path: p, name, isFolder,
    type: isFolder ? 'folder' : 'other',
    size: isFolder ? null : 10, modified: Date.now() - 60000,
    downloads: isFolder ? null : 0, starred: false, status: 'internal',
  }, extra);
}

const TREE = [{
  id: '/', name: 'All Files', path: '/', icon: 'hardDrive', children: [
    { id: '/docs', name: 'docs', path: '/docs', children: [] },
    { id: '/media', name: 'media', path: '/media', children: [
      { id: '/media/photos', name: 'photos', path: '/media/photos', children: [] },
    ] },
  ],
}];

/**
 * Load files.js against a stub page. `routes` maps a request prefix to a
 * response (or an Error to reject with, or a function of the url).
 */
function loadFiles({ routes = {}, location = '' } = {}) {
  const doc = makeDocument();
  const timers = [];
  const calls = { get: [], post: [], put: [], del: [], downloadFile: [], downloadMultipleFiles: [], downloadZip: [], upload: [] };
  const toasts = [];
  const menus = [];
  const copies = [];
  const modal = { confirm: true, prompt: null, lastConfirm: null, lastPrompt: null };

  function respond(url) {
    const key = Object.keys(routes).filter(k => url.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    let r = key ? routes[key] : {};
    if (typeof r === 'function') r = r(url);
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  }

  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.document = doc;
  sandbox.console = { warn() {}, error() {}, log() {} };
  sandbox.URLSearchParams = URLSearchParams;
  sandbox.FormData = FormData;
  sandbox.setTimeout = (fn, ms) => { timers.push({ fn, ms, id: timers.length + 1 }); return timers.length; };
  sandbox.clearTimeout = (id) => { const t = timers.find(x => x.id === id); if (t) t.cancelled = true; };
  sandbox.requestAnimationFrame = () => 0;
  sandbox.location = { search: location };
  sandbox.innerWidth = 1200;
  sandbox.innerHeight = 800;
  sandbox.scrollTo = () => {};
  sandbox.addEventListener = () => {};
  sandbox.navigator = { platform: 'test' };
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

  vm.createContext(sandbox);
  vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });

  const els = {};
  const el = (sel) => (els[sel] ||= new FakeEl(doc, sel));
  for (const sel of ['#filesContainer', '#folderTree', '#breadcrumb', '#filterChips', '#filesSearch', '#bulkBar',
    '#fileDrawer', '#drawerBackdrop', '#filesStatus', '#selectAll', '#pageTitle', '#pageSubtitle', '#sortDropdown',
    '#sortLabel', '#sortTrigger', '.app-shell', '#uploadTray', '#hiddenFileInput']) el(sel);
  const drawer = el('#fileDrawer');
  drawer.children['.drawer-body'] = new FakeEl(doc, '.drawer-body');
  drawer.children['.drawer-footer'] = new FakeEl(doc, '.drawer-footer');
  drawer.children['#drawerTitle'] = new FakeEl(doc, '#drawerTitle');
  drawer.children['#drawerClose'] = el('#drawerClose');
  el('#bulkBar').children['.num'] = new FakeEl(doc, '.num');
  doc.body = new FakeEl(doc, 'body');
  doc.body.dataset = { page: 'files' };

  const AFM = sandbox.AFM;
  AFM.$ = (sel) => els[sel] || null;
  AFM.Toast = {
    success: (t, m) => toasts.push({ type: 'success', t, m }),
    info: (t, m) => toasts.push({ type: 'info', t, m }),
    warning: (t, m) => toasts.push({ type: 'warning', t, m }),
    error: (t, m) => toasts.push({ type: 'error', t, m }),
  };
  AFM.Modal = {
    confirm: async (opts) => { modal.lastConfirm = opts; return modal.confirm; },
    prompt: async (opts) => { modal.lastPrompt = opts; return modal.prompt; },
  };
  AFM.ContextMenu = { show: (x, y, items) => menus.push({ x, y, items }), hide() {} };
  AFM.Dropdown = { closeAll() {} };
  AFM.copyToClipboard = (text) => { copies.push(text); return Promise.resolve(true); };
  AFM.Store = { get: (k, f) => f, set() {} };

  sandbox.API = {
    BASE_URL: '/api',
    get: (url) => { calls.get.push(url); return respond(url); },
    post: (url, body) => { calls.post.push({ url, body }); return respond(`POST ${url}`); },
    put: (url, body) => { calls.put.push({ url, body }); return respond(`PUT ${url}`); },
    del: (url, body) => { calls.del.push({ url, body }); return respond(`DELETE ${url}`); },
    upload: (url, form) => { calls.upload.push({ url, form }); return { promise: respond(`UPLOAD ${url}`), abort() {} }; },
    downloadFile: (p) => calls.downloadFile.push(p),
    downloadMultipleFiles: (ps) => calls.downloadMultipleFiles.push(ps),
    downloadZip: (ps) => calls.downloadZip.push(ps),
  };

  vm.runInContext(FILES_SRC, sandbox, { filename: 'files.js' });
  const Files = sandbox.Files;

  return {
    Files, pure: Files.pure, c: Files._controller, els, doc, calls, toasts, menus, copies, modal, timers,
    state: () => Files._controller.getState(),
    flushTimers() {
      const pending = timers.filter(t => !t.cancelled && !t.ran);
      pending.forEach(t => { t.ran = true; t.fn(); });
    },
    lastListQuery() {
      const url = [...calls.get].reverse().find(u => u.startsWith('/fs/list?'));
      return url ? new URLSearchParams(url.slice('/fs/list?'.length)) : null;
    },
  };
}

/** Objects from the vm realm have foreign prototypes; compare their data. */
const plain = (v) => JSON.parse(JSON.stringify(v));

const settle = () => new Promise(r => setImmediate(r));
async function settleAll() { for (let i = 0; i < 6; i++) await settle(); }

const LISTING = {
  items: [file('/docs', { isFolder: true }), file('/media', { isFolder: true }), file('/a.ts', { type: 'code' }), file('/b.png', { type: 'image' })],
  total: 4,
  counts: { all: 4, folder: 2, image: 1, video: 0, document: 0, audio: 0, archive: 0, code: 1, other: 0 },
};

/** A page booted with the standard listing and tree. */
async function booted(extraRoutes = {}) {
  const page = loadFiles({ routes: { '/fs/list': LISTING, '/fs/tree': TREE, '/fs/thumbnail/capability': { available: false, formats: [], maxSize: 512 }, ...extraRoutes } });
  page.Files.init();
  await settleAll();
  return page;
}

const html = (page, sel) => page.els[sel].innerHTML;

function activeTreePaths(treeHtml) {
  return [...treeHtml.matchAll(/<div class="tree-item[^"]*"[^>]*aria-current="page"[^>]*data-tree-path="([^"]*)"/g)].map(m => m[1]);
}

/* ══════════════════════════════════════════
   PHASE 2 — truthfulness
   ══════════════════════════════════════════ */

describe('error and empty are distinct states', () => {
  test('a rejected list request renders the error state, not the empty-directory message', async () => {
    const page = await booted({ '/fs/list': new Error('Service unavailable') });
    const out = html(page, '#filesContainer');
    assert.match(out, /data-error-state/);
    assert.match(out, /Service unavailable/);
    assert.doesNotMatch(out, /data-empty-kind/);
    assert.doesNotMatch(out, /Upload files/, 'no empty-folder call to action');
    assert.equal(page.state().error, 'Service unavailable');
  });

  test('retry re-issues the request; success clears the error and renders the listing', async () => {
    let fail = true;
    const page = await booted({ '/fs/list': () => (fail ? new Error('down') : LISTING) });
    const before = page.calls.get.filter(u => u.startsWith('/fs/list')).length;
    fail = false;
    page.c.onContainerClick(event(target({ '[data-retry]': { 'data-retry': 'files' } })));
    await settleAll();
    assert.equal(page.calls.get.filter(u => u.startsWith('/fs/list')).length, before + 1);
    assert.equal(page.state().error, null);
    assert.match(html(page, '#filesContainer'), /data-entry/);
    assert.doesNotMatch(html(page, '#filesContainer'), /data-error-state/);
  });

  test('a failed retry shows the error again, never the empty state', async () => {
    const page = await booted({ '/fs/list': new Error('still down') });
    page.c.onContainerClick(event(target({ '[data-retry]': { 'data-retry': 'files' } })));
    await settleAll();
    assert.match(html(page, '#filesContainer'), /data-error-state/);
    assert.doesNotMatch(html(page, '#filesContainer'), /data-empty-kind/);
  });

  test('a successful empty listing renders the empty state, distinguishable from the error', async () => {
    const page = await booted({ '/fs/list': { items: [], total: 0, counts: { all: 0 } } });
    const out = html(page, '#filesContainer');
    assert.match(out, /data-empty-kind="empty"/);
    assert.doesNotMatch(out, /data-error-state/);
  });

  test('a rejected tree request renders no synthetic node', async () => {
    const page = await booted({ '/fs/tree': new Error('tree down') });
    const tree = html(page, '#folderTree');
    assert.doesNotMatch(tree, /data-tree-path/);
    assert.match(tree, /data-retry="tree"/);
    assert.match(tree, /tree down/);
  });

  test('a listing without counts renders chips without figures', async () => {
    const page = await booted({ '/fs/list': { items: LISTING.items, total: 4 } });
    assert.doesNotMatch(html(page, '#filterChips'), /class="count"/);
  });

  test('a failed load clears the selection, since nothing remains to select', async () => {
    let fail = false;
    const page = await booted({ '/fs/list': () => (fail ? new Error('x') : LISTING) });
    page.c.setSelected('/a.ts', true);
    fail = true;
    await page.c.loadFiles();
    assert.equal(page.state().selected.size, 0);
  });
});

describe('the three empty cases are distinct', () => {
  const kinds = [
    [{ search: 'zzz' }, 'search', /Clear search/],
    [{ filter: 'video' }, 'filter', /Show all types/],
    [{ starredOnly: true }, 'starred', /Browse all files/],
    [{}, 'empty', /Upload files/],
  ];
  for (const [over, kind, action] of kinds) {
    test(`${kind}: its own message and only its own next action`, () => {
      const { pure } = loadFiles();
      const state = pure.createState(over);
      assert.equal(pure.emptyKind(state), kind);
      const out = pure.renderEmptyHtml(state);
      assert.match(out, new RegExp(`data-empty-kind="${kind}"`));
      assert.match(out, action);
      if (kind !== 'search') assert.doesNotMatch(out, /Clear search/);
      if (kind !== 'empty') assert.doesNotMatch(out, /Upload files/);
    });
  }
});

describe('partial delete is reported as partial failure', () => {
  test('one deleted and one missing path: a partial report naming both, no unqualified success', async () => {
    const page = await booted({
      'DELETE /fs/delete': { success: true, data: { deleted: ['/a.ts'], failed: [{ path: '/b.png', error: 'Item not found: /b.png', statusCode: 404 }] } },
    });
    page.c.setSelected('/a.ts', true);
    page.c.setSelected('/b.png', true);
    await page.c.handleAction('bulkDelete');
    await settleAll();
    const warning = page.toasts.find(t => t.type === 'warning');
    assert.ok(warning, 'a partial-failure report');
    assert.match(warning.t, /Deleted 1 of 2/);
    assert.match(warning.m, /b\.png: Item not found/);
    assert.ok(!page.toasts.some(t => t.type === 'success' && /Deleted 2/.test(t.t)), 'no "all deleted" claim');
  });

  test('the reported count comes from the response, not the selection size', async () => {
    const page = await booted({
      'DELETE /fs/delete': { success: true, data: { deleted: ['/a.ts'], failed: [] } },
    });
    page.state().selected = new Set(['/a.ts', '/stale-id-not-rendered']);
    await page.c.handleAction('bulkDelete');
    await settleAll();
    assert.deepEqual(plain(page.calls.del[0].body.paths), ['/a.ts'], 'only rendered entries are sent');
    assert.match(page.modal.lastConfirm.title, /delete 1 item/, 'the confirmation counts what is sent');
    const ok = page.toasts.find(t => t.type === 'success');
    assert.match(ok.t, /Deleted 1 item/);
  });

  test('an all-failed delete shows no success and leaves the item visible', async () => {
    const page = await booted({ 'DELETE /fs/delete': new Error('Item not found') });
    await page.c.handleAction('delete', '/a.ts');
    await settleAll();
    assert.ok(!page.toasts.some(t => t.type === 'success'));
    assert.ok(page.state().files.some(f => f.id === '/a.ts'), 'no optimistic removal');
  });

  test('summarizeDelete is complete only when nothing failed', () => {
    const { pure } = loadFiles();
    assert.equal(pure.summarizeDelete(['/a'], { deleted: ['/a'], failed: [] }).kind, 'complete');
    assert.equal(pure.summarizeDelete(['/a', '/b'], { deleted: ['/a'], failed: [{ path: '/b' }] }).kind, 'partial');
  });
});

describe('star reports the stored state and reverts on failure', () => {
  test('the displayed star is the value the server returned', async () => {
    const page = await booted({ 'POST /fs/star': { success: true, data: { path: '/a.ts', starred: false } } });
    await page.c.handleAction('star', '/a.ts'); // requests true; server stores false
    await settleAll();
    assert.equal(page.state().files.find(f => f.id === '/a.ts').starred, false);
  });

  test('a failed request restores the previous state and says so', async () => {
    const page = await booted({ 'POST /fs/star': new Error('metadata down') });
    await page.c.handleAction('star', '/a.ts');
    await settleAll();
    assert.equal(page.state().files.find(f => f.id === '/a.ts').starred, false);
    assert.ok(page.toasts.some(t => t.type === 'warning'));
    assert.ok(!page.toasts.some(t => t.type === 'success'));
  });

  test('bulk star sets every selected item to the same target', async () => {
    const page = await booted({ 'POST /fs/star': { success: true, data: { starred: true } } });
    page.c.setSelected('/a.ts', true);
    page.c.setSelected('/b.png', true);
    await page.c.handleAction('bulkStar');
    await settleAll();
    assert.deepEqual(plain(page.calls.post.map(p => p.body)), [{ path: '/a.ts', starred: true }, { path: '/b.png', starred: true }]);
  });
});

describe('downloads and action dispatch', () => {
  test('a single download goes through API.downloadFile and claims no success', async () => {
    const page = await booted();
    await page.c.handleAction('download', '/a.ts');
    assert.deepEqual(page.calls.downloadFile, ['/a.ts']);
    assert.ok(!page.toasts.some(t => t.type === 'success'));
  });

  test('an unknown identifier does nothing and does not throw', async () => {
    const page = await booted();
    const before = JSON.stringify(page.calls);
    await page.c.handleAction('download', '/no/such/id');
    await page.c.handleAction('more', '/no/such/id');
    await page.c.handleAction('rename', undefined);
    assert.equal(JSON.stringify(page.calls), before);
    assert.equal(page.menus.length, 0);
  });

  test('a menu action without a pointer event or anchor uses a defined position', async () => {
    const page = await booted();
    await page.c.handleAction('more', '/a.ts');
    const { x, y } = page.menus[0];
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
  });

  test('a folder-only selection cannot use the individual path, and is told to use the ZIP', async () => {
    const page = await booted();
    page.c.setSelected('/docs', true);
    page.c.openBulkDownloadMenu();
    page.menus.at(-1).items[1].action();
    assert.deepEqual(page.calls.downloadMultipleFiles, []);
    const warning = page.toasts.find(t => t.type === 'warning');
    assert.match(warning.m, /Download as ZIP/);
    assert.equal(page.state().selected.size, 1, 'nothing was downloaded, so the selection stays');
  });

  test('a mixed selection: individual downloads files only and names the excluded folders', async () => {
    const page = await booted();
    page.c.selectAllOnPage(true);
    page.c.openBulkDownloadMenu();
    page.menus.at(-1).items[1].action();
    assert.deepEqual(plain(page.calls.downloadMultipleFiles), [['/a.ts', '/b.png']]);
    const info = page.toasts.find(t => t.type === 'info');
    assert.match(info.m, /2 folders were excluded/);
    assert.ok(!page.toasts.some(t => t.type === 'success'), 'a request, not a completed outcome');
    assert.equal(page.state().selected.size, 0);
  });

  test('the ZIP path sends every selected path, folders included, then clears the selection', async () => {
    const page = await booted();
    page.c.selectAllOnPage(true);
    page.c.openBulkDownloadMenu();
    page.menus.at(-1).items[0].action();
    assert.deepEqual(plain(page.calls.downloadZip), [['/docs', '/media', '/a.ts', '/b.png']]);
    assert.equal(page.state().selected.size, 0);
  });

  test('with nothing selected, the bulk download does nothing', async () => {
    const page = await booted();
    page.c.openBulkDownloadMenu();
    assert.equal(page.menus.length, 0);
  });
});

/* ══════════════════════════════════════════
   PHASE 2 — dead surface (source-level guards)
   ══════════════════════════════════════════ */

describe('surface honesty — source-level guards', () => {
  test('files.js never opens a window', () => {
    assert.doesNotMatch(FILES_SRC, /window\.open\(/);
  });

  test('files.js contains no hardcoded absolute URL', () => {
    assert.doesNotMatch(FILES_SRC, /https?:\/\//);
  });

  test('no user-visible phase, roadmap or "coming soon" text', () => {
    const roadmap = /\b(phase \d|next phase|coming soon|will be implemented|not yet available|requires backend|will connect to api)\b/i;
    assert.doesNotMatch(FILES_SRC.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), roadmap);
    assert.doesNotMatch(FILES_HTML.replace(/<!--[\s\S]*?-->/g, ''), roadmap);
  });

  test('#bulkDownload is bound exactly once', () => {
    assert.equal((FILES_SRC.match(/#bulkDownload/g) || []).length, 1);
  });

  test('the removed fabricated controls are gone from markup and module', () => {
    for (const id of ['bulkMove', 'bulkShare', 'bulkRename', 'globalSearch']) {
      assert.ok(!FILES_HTML.includes(`id="${id}"`), `${id} in files.html`);
      assert.ok(!FILES_SRC.includes(`#${id}`), `${id} in files.js`);
    }
    assert.ok(!FILES_HTML.includes('search-kbd'), 'no shortcut badge for a removed field');
    assert.ok(!FILES_SRC.includes('handleTreeMutation'));
  });

  test('every id files.js queries exists in files.html or in a template files.js renders', () => {
    const rendered = new Set([...FILES_SRC.matchAll(/id="([A-Za-z][\w-]*)"/g)].map(m => m[1]));
    const queried = new Set([...FILES_SRC.matchAll(/['"`]#([A-Za-z][\w-]*)['"`]/g)].map(m => m[1]));
    for (const id of queried) {
      assert.ok(FILES_HTML.includes(`id="${id}"`) || rendered.has(id), `#${id} targets nothing`);
    }
  });

  test('every interactive element in files.html is bound, or is a documented shared hook', () => {
    const interactive = [...FILES_HTML.matchAll(/<(button|a|input|select)\b[^>]*>/g)].map(m => m[0]);
    const shared = [
      /class="nav-item"/, /class="brand"/, // links with real hrefs
      /data-theme-toggle/, // theme.js
      /class="mobile-menu-btn"/, // sidebar.js
      /data-dropdown="sortDropdown"/, // app.js Dropdown
      /data-sort-act=/, /data-view=/, // delegated: #sortDropdown, #viewToggle
      /data-upload-dismiss/, // delegated: #uploadTray
    ];
    const unbound = interactive.filter(tag => {
      if (shared.some(re => re.test(tag))) return false;
      const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
      return !id || !new RegExp(`['"\`]#${id}['"\`]`).test(FILES_SRC);
    });
    assert.deepEqual(unbound, [], 'interactive elements with no handler');
    assert.ok(!/href="#"/.test(FILES_HTML), 'no dead links');
  });

  test('no uncalled function remains in files.js', () => {
    const names = [...FILES_SRC.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
    const dead = names.filter(n => (FILES_SRC.match(new RegExp(`\\b${n}\\b`, 'g')) || []).length < 2);
    assert.deepEqual(dead, []);
  });

  test('no selector can match <body data-page="files"> by accident', () => {
    assert.doesNotMatch(FILES_SRC, /closest\(['"]\[data-page\]['"]\)/);
  });

  test('the sidebar is byte-identical on all four pages, with no Shared or Trash entry', () => {
    const slices = ['index.html', 'files.html', 'uploads.html', 'settings.html'].map(p => {
      const src = fs.readFileSync(path.join(ROOT_DIR, 'public', p), 'utf8').replace(/\r\n/g, '\n');
      const start = src.indexOf('<aside class="sidebar"');
      return src.slice(start, src.indexOf('</aside>', start));
    });
    for (const s of slices) assert.equal(s, slices[0]);
    assert.doesNotMatch(slices[0], />\s*(Shared|Trash|Analytics)\s*</);
    for (const view of ['starred', 'recent', 'downloads']) assert.match(slices[0], new RegExp(`files\\.html\\?view=${view}`));
  });

  test('each library view is a distinct, implemented listing', () => {
    const page = loadFiles();
    const views = page.pure.LIBRARY_VIEWS;
    const queries = Object.keys(views).map(v => {
      const state = page.pure.createState({ starredOnly: !!views[v].starredOnly, sort: { ...views[v].sort } });
      return page.pure.listQuery(state);
    });
    queries.push(page.pure.listQuery(page.pure.createState()));
    assert.equal(new Set(queries).size, queries.length, 'no two views request the same listing');
    assert.equal(page.pure.resolveLibraryView('?view=starred'), 'starred');
    assert.equal(page.pure.resolveLibraryView('?view=trash'), null);
  });
});

/* ══════════════════════════════════════════
   PHASE 3 — navigation
   ══════════════════════════════════════════ */

describe('one owner for navigation: every entry point leaves identical state', () => {
  const MEDIA_LISTING = { items: [file('/media/photos', { isFolder: true }), file('/media/clip.mp4', { type: 'video' })], total: 2, counts: {} };

  async function expectAt(page, p) {
    await settleAll();
    const s = page.state();
    assert.equal(s.currentPath, p);
    assert.equal(s.page, 1);
    assert.equal(s.filter, 'all');
    assert.equal(s.search, '');
    assert.equal(page.els['#filesSearch'].value, '', 'the search box is cleared too');
    assert.deepEqual(activeTreePaths(html(page, '#folderTree')), [p], 'exactly one active tree node, the current folder');
    assert.match(html(page, '#breadcrumb'), new RegExp(`data-nav-path="${p.replace(/\//g, '\\/')}"\\s*aria-current="page"`));
    assert.equal(page.lastListQuery().get('path'), p);
  }

  async function dirtied() {
    const page = await booted({ '/fs/list?path=%2Fmedia': MEDIA_LISTING });
    page.state().filter = 'code';
    page.state().search = 'stale';
    page.els['#filesSearch'].value = 'stale';
    page.state().page = 3;
    return page;
  }

  test('tree selection', async () => {
    const page = await dirtied();
    page.c.onTreeClick(event(target({ '[data-tree-path]': { 'data-tree-path': '/media' } })));
    await expectAt(page, '/media');
  });

  test('breadcrumb selection', async () => {
    const page = await dirtied();
    page.c.onBreadcrumbClick(event(target({ '[data-nav-path]': { 'data-nav-path': '/media' } })));
    await expectAt(page, '/media');
  });

  test('row activation', async () => {
    const page = await dirtied();
    page.c.onContainerClick(event(target({ '[data-entry]': { 'data-id': '/media' } })));
    await expectAt(page, '/media');
  });

  test('row activation by keyboard (Enter on the row)', async () => {
    const page = await dirtied();
    const t = target({ '[data-entry]': { 'data-id': '/media' } });
    const ev = event(t, { key: 'Enter' });
    t.closest = sel => (sel === '[data-entry]' ? t : null);
    t.getAttribute = k => (k === 'data-id' ? '/media' : null);
    page.c.onContainerKeydown(ev);
    await expectAt(page, '/media');
  });

  test('context-menu folder activation', async () => {
    const page = await dirtied();
    await page.c.handleAction('more', '/media');
    page.menus[0].items.find(i => i.label === 'Open folder').action();
    await expectAt(page, '/media');
  });

  test('in-drawer path link', async () => {
    const page = await booted({ '/fs/list?path=%2Fmedia': MEDIA_LISTING });
    page.c.navigateTo('/media');
    await settleAll();
    page.c.openDrawer('/media/clip.mp4');
    page.c.navigateTo('/'); // move away so the drawer link has somewhere to go back to
    await settleAll();
    page.state().files = MEDIA_LISTING.items;
    page.c.openDrawer('/media/clip.mp4');
    page.c.onDrawerClick(event(target({ '[data-drawer-act]': { 'data-drawer-act': 'open-parent' } })));
    await expectAt(page, '/media');
  });

  test('navigating to the folder already displayed is a no-op', async () => {
    const page = await booted();
    const before = page.calls.get.length;
    assert.equal(page.c.navigateTo('/'), false);
    assert.equal(page.calls.get.length, before);
  });

  test('exactly one place outside the owner assigns the current path', () => {
    const assignments = FILES_SRC.match(/state\.currentPath\s*=(?!=)/g) || [];
    assert.equal(assignments.length, 2, 'applyNavigation and syncAfterMutation only');
  });
});

describe('tree state', () => {
  test('expansion is persisted state and survives a tree reload', async () => {
    const page = await booted();
    page.c.toggleTreeNode('/media', true);
    await page.c.loadTree();
    assert.match(html(page, '#folderTree'), /aria-expanded="true" aria-owns="[^"]+"[^>]*data-tree-path="\/media"/);
  });

  test('the default expansion is an initialisation, not a depth rule in the renderer', () => {
    const { pure } = loadFiles();
    const state = pure.createState();
    assert.equal(state.expanded.size, 0);
    pure.initExpansion(state);
    assert.deepEqual([...state.expanded], ['/']);
    assert.doesNotMatch(FILES_SRC, /depth\s*===\s*0/);
  });

  test('the highlight is derived from state after a reload', async () => {
    const page = await booted();
    page.c.navigateTo('/docs');
    await page.c.loadTree();
    assert.deepEqual(activeTreePaths(html(page, '#folderTree')), ['/docs']);
  });

  test('the tree depth constant is pinned to the server cap', () => {
    const { pure } = loadFiles();
    assert.equal(pure.TREE_DEPTH, 2);
  });

  test('a folder deeper than the tree is qualified and the breadcrumb is complete and operable', () => {
    const { pure } = loadFiles();
    const state = pure.createState({ tree: TREE, treeLoaded: true, currentPath: '/media/photos/2024/summer' });
    assert.match(pure.renderTreeHtml(state), /tree-note/);
    const crumbs = pure.renderBreadcrumbHtml(state.currentPath);
    assert.equal((crumbs.match(/<button/g) || []).length, 5, 'Files + four segments, each a button');
    assert.match(crumbs, /data-nav-path="\/media\/photos\/2024\/summer"\s*aria-current="page"/);
  });
});

describe('pending search and the search box', () => {
  test('a pending debounced search is cancelled by navigation', async () => {
    const page = await booted();
    page.c.onSearchInput({ target: { value: 'clip' } });
    page.c.navigateTo('/docs');
    page.flushTimers();
    await settleAll();
    const searches = page.calls.get.filter(u => u.startsWith('/fs/list?')).map(u => new URLSearchParams(u.slice(9)).get('search'));
    assert.ok(!searches.includes('clip'), 'the stale term never reached the server');
    assert.equal(page.lastListQuery().get('path'), '/docs');
  });

  test('typing applies the term once the debounce fires', async () => {
    const page = await booted();
    page.c.onSearchInput({ target: { value: '  report ' } });
    page.flushTimers();
    await settleAll();
    assert.equal(page.state().search, 'report');
    assert.equal(page.lastListQuery().get('search'), 'report');
  });

  test('clearing filters from the empty state clears the box as well as the state', async () => {
    const page = await booted({ '/fs/list': { items: [], total: 0, counts: {} } });
    page.state().search = 'zzz';
    page.els['#filesSearch'].value = 'zzz';
    page.c.onContainerClick(event(target({ '[data-clear]': { 'data-clear': 'search' } })));
    await settleAll();
    assert.equal(page.state().search, '');
    assert.equal(page.els['#filesSearch'].value, '');
  });
});

describe('folder creation is scoped to its target', () => {
  test('from a tree node that is not displayed, the folder is created inside that node', async () => {
    const page = await booted({ 'POST /fs/folder': { success: true, data: {} } });
    page.modal.prompt = 'New';
    await page.c.handleAction('newFolder', '/media/photos');
    assert.deepEqual(plain(page.calls.post.at(-1)), { url: '/fs/folder', body: { path: '/media/photos/New' } });
  });

  test('from the toolbar, inside the displayed folder; at the root, at the root', async () => {
    const page = await booted({ 'POST /fs/folder': { success: true, data: {} } });
    page.modal.prompt = 'Top';
    await page.c.handleAction('newFolder', page.state().currentPath);
    assert.deepEqual(plain(page.calls.post.at(-1).body), { path: '/Top' });
  });
});

describe('rename and delete of the displayed folder update navigation', () => {
  test('pure rewrite respects the separator boundary', () => {
    const { pure } = loadFiles();
    assert.equal(pure.rewriteAfterMutation('/a/b', 'rename', '/a', '/z'), '/z/b');
    assert.equal(pure.rewriteAfterMutation('/a/b', 'delete', '/a'), '/');
    assert.equal(pure.rewriteAfterMutation('/ab/c', 'rename', '/a', '/z'), null, '/ab is not inside /a');
    assert.equal(pure.rewriteAfterMutation('/x', 'delete', '/a'), null);
  });

  test('renaming an ancestor rewrites the current path and the breadcrumb', async () => {
    const page = await booted();
    page.c.navigateTo('/media/photos');
    await settleAll();
    page.c.syncAfterMutation('rename', '/media', '/pictures');
    assert.equal(page.state().currentPath, '/pictures/photos');
    assert.match(html(page, '#breadcrumb'), /data-nav-path="\/pictures\/photos"/);
  });

  test('deleting an ancestor lands on the surviving parent', async () => {
    const page = await booted();
    page.c.navigateTo('/media/photos');
    await settleAll();
    page.c.syncAfterMutation('delete', '/media');
    assert.equal(page.state().currentPath, '/');
  });
});

/* ══════════════════════════════════════════
   PHASE 3 — selection and pagination
   ══════════════════════════════════════════ */

describe('selection survives non-navigational reloads', () => {
  test('a sort keeps the selection and the bulk count', async () => {
    const page = await booted();
    page.c.setSelected('/a.ts', true);
    page.c.setSelected('/b.png', true);
    page.c.toggleSort('size');
    await settleAll();
    assert.deepEqual([...page.state().selected].sort(), ['/a.ts', '/b.png']);
    assert.equal(page.els['#bulkBar'].children['.num'].textContent, '2');
  });

  test('a filter that hides entries prunes them from the selection', async () => {
    const page = await booted({ '/fs/list?path=%2F&page=1&limit=20&sort=name&dir=asc&search=&type=code': { items: [LISTING.items[2]], total: 1, counts: LISTING.counts } });
    page.c.setSelected('/a.ts', true);
    page.c.setSelected('/b.png', true);
    page.c.setFilter('code');
    await settleAll();
    assert.deepEqual([...page.state().selected], ['/a.ts']);
    assert.equal(page.els['#bulkBar'].children['.num'].textContent, '1');
  });

  test('a page-size change keeps entries still rendered', async () => {
    const page = await booted();
    page.c.setSelected('/a.ts', true);
    page.state().perPage = 50;
    await page.c.loadFiles();
    assert.deepEqual([...page.state().selected], ['/a.ts']);
  });

  test('switching view keeps the selection, and both views mark it', async () => {
    const page = await booted();
    page.c.setSelected('/a.ts', true);
    const { pure } = page;
    const list = pure.renderListHtml(page.state());
    const grid = pure.renderGridHtml(page.state());
    assert.match(list, /data-id="\/a\.ts" class="is-selected" aria-selected="true"/);
    assert.match(grid, /is-selected" role="row" data-entry data-id="\/a\.ts"\s*aria-selected="true"/);
  });

  test('navigation clears the selection', async () => {
    const page = await booted();
    page.c.setSelected('/a.ts', true);
    page.c.navigateTo('/docs');
    assert.equal(page.state().selected.size, 0);
  });

  test('the header checkbox is indeterminate on a partial selection', async () => {
    const page = await booted();
    page.c.setSelected('/a.ts', true);
    assert.equal(page.els['#selectAll'].indeterminate, true);
    assert.equal(page.els['#selectAll'].checked, false);
    page.c.selectAllOnPage(true);
    assert.equal(page.els['#selectAll'].indeterminate, false);
    assert.equal(page.els['#selectAll'].checked, true);
  });

  test('select-all states its page scope in its accessible name', () => {
    const { pure } = loadFiles();
    const out = pure.renderListHtml(pure.createState({ files: LISTING.items, total: 40 }));
    assert.match(out, /id="selectAll"[^>]*aria-label="Select all 4 items on this page"/);
    assert.match(FILES_HTML, /class="bulk-scope">on this page</);
  });
});

describe('pagination survives a shrinking result set', () => {
  test('deleting the sole entry on the final page lands on the new final page', async () => {
    const page = await booted({
      '/fs/list': (url) => {
        const p = new URLSearchParams(url.slice(9)).get('page');
        return p === '3' ? { items: [], total: 40, counts: {} } : { items: LISTING.items, total: 40, counts: {} };
      },
    });
    page.state().page = 3;
    await page.c.loadFiles();
    assert.equal(page.state().page, 2);
    assert.ok(page.state().files.length > 0);
    assert.equal(page.lastListQuery().get('page'), '2');
  });

  test('the footer range is never inverted and an empty result is 0–0', () => {
    const { pure } = loadFiles();
    assert.deepEqual(plain(pure.footerRange(1, 20, 0)), { start: 0, end: 0 });
    assert.deepEqual(plain(pure.footerRange(3, 20, 41)), { start: 41, end: 41 });
    assert.deepEqual(plain(pure.footerRange(9, 20, 41)), { start: 41, end: 41 }, 'a page past the end is clamped');
    for (let total = 0; total < 60; total++) {
      for (let page = 1; page < 5; page++) {
        const r = pure.footerRange(page, 20, total);
        assert.ok(r.start <= r.end, `${page}/${total}`);
      }
    }
  });

  test('page controls derive from the total, not the loaded page', () => {
    const { pure } = loadFiles();
    const out = pure.renderFooterHtml(pure.createState({ files: LISTING.items, total: 205, perPage: 20, page: 1 }));
    assert.match(out, /data-page="11"/);
    assert.doesNotMatch(out, /data-page="12"/);
  });
});

/* ══════════════════════════════════════════
   PHASE 4 — accessibility
   ══════════════════════════════════════════ */

describe('entries are keyboard operable (roving tabindex)', () => {
  for (const view of ['list', 'grid']) {
    test(`${view}: every entry is focusable, exactly one is a tab stop, and each has a role`, () => {
      const { pure } = loadFiles();
      const state = pure.createState({ files: LISTING.items, total: 4, view });
      const out = view === 'list' ? pure.renderListHtml(state) : pure.renderGridHtml(state);
      const entries = [...out.matchAll(/<(tr|div)\b[^>]*data-entry[^>]*>/g)].map(m => m[0]);
      assert.equal(entries.length, 4);
      assert.ok(entries.every(e => /tabindex="(0|-1)"/.test(e)));
      assert.equal(entries.filter(e => /tabindex="0"/.test(e)).length, 1);
      if (view === 'grid') assert.ok(entries.every(e => /role="row"/.test(e)));
      else assert.match(out, /<table class="files-table" role="grid"/);
    });
  }

  test('Space selects and does not open; Enter on an inner control does not activate the row', async () => {
    const page = await booted();
    const row = target({});
    row.closest = sel => (sel === '[data-entry]' ? row : null);
    row.getAttribute = k => (k === 'data-id' ? '/a.ts' : null);
    page.c.onContainerKeydown(event(row, { key: ' ' }));
    assert.ok(page.state().selected.has('/a.ts'));
    const inner = target({});
    inner.closest = sel => (sel === '[data-entry]' ? row : null);
    page.c.onContainerKeydown(event(inner, { key: 'Enter' }));
    assert.equal(page.state().currentPath, '/');
    assert.equal(page.els['#fileDrawer'].classes.has('is-open'), false);
  });

  test('a checkbox click does not also activate its row', async () => {
    const page = await booted();
    page.c.onContainerClick(event(target({ 'label.checkbox, input[type="checkbox"]': {}, '[data-entry]': { 'data-id': '/media' } })));
    await settleAll();
    assert.equal(page.state().currentPath, '/');
  });

  test('row actions are revealed on keyboard focus, not only on hover', () => {
    assert.match(FILES_CSS, /tr:focus-within \.row-actions/);
    assert.match(FILES_CSS, /\.file-card:focus-within \.file-card-menu/);
    assert.match(FILES_CSS, /tbody tr:focus-visible/);
  });
});

describe('the details drawer is a modal dialog', () => {
  test('markup: dialog role, modal state, labelled, hidden while closed', () => {
    const tag = FILES_HTML.match(/<aside class="drawer"[^>]*>/)[0];
    for (const attr of ['role="dialog"', 'aria-modal="true"', 'aria-labelledby="drawerTitle"', 'aria-hidden="true"']) {
      assert.ok(tag.includes(attr), attr);
    }
    assert.match(FILES_HTML, /id="drawerBackdrop"/);
  });

  test('aria-hidden is updated on open AND close; focus moves in, then back to the opener', async () => {
    const page = await booted();
    const opener = new FakeEl(page.doc, 'row');
    const drawer = page.els['#fileDrawer'];
    page.c.openDrawer('/a.ts', opener);
    assert.equal(drawer.getAttribute('aria-hidden'), 'false');
    assert.ok(drawer.classes.has('is-open'));
    assert.equal(page.doc.activeElement, page.els['#drawerClose']);
    assert.equal(page.els['.app-shell'].hasAttribute('inert'), true, 'the page behind is not operable');
    assert.equal(page.els['#drawerBackdrop'].hidden, false);

    page.c.closeDrawer();
    assert.equal(drawer.getAttribute('aria-hidden'), 'true');
    assert.ok(!drawer.classes.has('is-open'));
    assert.equal(page.doc.activeElement, opener);
    assert.equal(page.els['.app-shell'].hasAttribute('inert'), false);
  });

  test('Escape closes the open drawer', async () => {
    const page = await booted();
    page.c.openDrawer('/a.ts', new FakeEl(page.doc, 'row'));
    page.c.onEscape({ key: 'Escape' });
    assert.equal(page.els['#fileDrawer'].getAttribute('aria-hidden'), 'true');
  });

  test('Escape with the drawer closed changes nothing', async () => {
    const page = await booted();
    const before = JSON.stringify(page.els['#fileDrawer'].attrs);
    page.c.onEscape({ key: 'Escape' });
    assert.equal(JSON.stringify(page.els['#fileDrawer'].attrs), before);
  });

  test('Escape over an open confirmation leaves the drawer open', async () => {
    const page = await booted();
    page.c.openDrawer('/a.ts', new FakeEl(page.doc, 'row'));
    page.doc.openLayers.add('.modal-backdrop.is-open');
    page.c.onEscape({ key: 'Escape' });
    assert.equal(page.els['#fileDrawer'].getAttribute('aria-hidden'), 'false');
  });

  test('the Escape handler runs in the capture phase, ahead of app.js', async () => {
    const page = await booted();
    assert.ok(page.doc.listeners.keydown.some(l => l.capture && l.fn === page.c.onEscape));
  });
});

describe('names, roles and states', () => {
  test('every rendered checkbox and chip has a non-empty accessible name; chips expose pressed state', () => {
    const { pure } = loadFiles();
    const state = pure.createState({ files: LISTING.items, total: 4, counts: LISTING.counts });
    for (const out of [pure.renderListHtml(state), pure.renderGridHtml(state)]) {
      const boxes = [...out.matchAll(/<input type="checkbox"[^>]*>/g)].map(m => m[0]);
      assert.ok(boxes.length >= 4);
      assert.ok(boxes.every(b => /aria-label="[^"]+"/.test(b)), 'checkbox without a name');
    }
    const chips = [...pure.renderChipsHtml(state).matchAll(/<button[^>]*class="filter-chip[^>]*>/g)].map(m => m[0]);
    assert.ok(chips.length >= 8);
    assert.ok(chips.every(c => /aria-label="[^"]+"/.test(c) && /aria-pressed="(true|false)"/.test(c)));
  });

  test('the unclassified chip appears only when it has members', () => {
    const { pure } = loadFiles();
    const without = pure.renderChipsHtml(pure.createState({ counts: { ...LISTING.counts, other: 0 } }));
    const withOther = pure.renderChipsHtml(pure.createState({ counts: { ...LISTING.counts, other: 3 } }));
    assert.doesNotMatch(without, /data-filter="other"/);
    assert.match(withOther, /data-filter="other"/);
  });

  test('sortable headers expose state and direction, and the glyph points the right way', () => {
    const { pure } = loadFiles();
    const asc = pure.renderListHtml(pure.createState({ files: LISTING.items, sort: { key: 'name', dir: 'asc' } }));
    const desc = pure.renderListHtml(pure.createState({ files: LISTING.items, sort: { key: 'size', dir: 'desc' } }));
    assert.match(asc, /class="sortable is-sorted asc col-name" aria-sort="ascending"/);
    assert.match(desc, /class="sortable is-sorted desc col-size" aria-sort="descending"/);
    assert.equal((asc.match(/aria-sort="none"/g) || []).length, 3);
    assert.match(FILES_CSS, /th\.is-sorted\.desc \.sort-ind \{ transform: rotate\(180deg\)/);
    assert.doesNotMatch(FILES_CSS, /is-sorted\.asc \.sort-ind \{ transform/);
  });

  test('icon-only buttons have text names', () => {
    const { pure } = loadFiles();
    const out = pure.renderListHtml(pure.createState({ files: LISTING.items }));
    const iconButtons = [...out.matchAll(/<button[^>]*class="btn-icon[^>]*>/g)].map(m => m[0]);
    assert.ok(iconButtons.every(b => /aria-label="[^"]+"/.test(b)));
    const htmlIconButtons = [...FILES_HTML.matchAll(/<button[^>]*class="btn-icon[^"]*"[^>]*>/g)].map(m => m[0]);
    assert.ok(htmlIconButtons.every(b => /aria-label="[^"]+"/.test(b)), 'files.html icon buttons');
  });

  test('the view toggle exposes no incomplete tab pattern', () => {
    assert.doesNotMatch(FILES_HTML, /role="tab(list)?"/);
    assert.match(FILES_HTML, /data-view="list"[^>]*aria-pressed=/);
  });

  test('no element carries an interactive role without a keyboard handler', () => {
    const roles = new Set([...FILES_HTML.matchAll(/role="([a-z]+)"/g), ...FILES_SRC.matchAll(/role="([a-z]+)"/g)].map(m => m[1]));
    assert.ok(!roles.has('button'), 'role="button" on a non-button');
    if (roles.has('treeitem')) assert.match(FILES_SRC, /bind\('#folderTree', 'keydown'/);
    if (roles.has('row')) assert.match(FILES_SRC, /bind\('#filesContainer', 'keydown'/);
    assert.ok(!roles.has('menu') && !roles.has('menuitem') && !roles.has('tab'));
  });

  test('breadcrumb segments are buttons and the current one is marked current', () => {
    const { pure } = loadFiles();
    const out = pure.renderBreadcrumbHtml('/media/photos');
    assert.equal((out.match(/<button type="button" class="breadcrumb-item/g) || []).length, 3);
    assert.equal((out.match(/aria-current="page"/g) || []).length, 1);
    assert.match(FILES_HTML, /<nav class="breadcrumb" id="breadcrumb" aria-label="Breadcrumb">/);
  });

  test('the tree is a labelled tree of items carrying their paths and expansion', () => {
    const { pure } = loadFiles();
    const state = pure.createState({ tree: TREE, treeLoaded: true, expanded: new Set(['/']) });
    const out = pure.renderTreeHtml(state);
    assert.match(FILES_HTML, /id="folderTree" role="tree" aria-labelledby="treeTitle"/);
    const items = [...out.matchAll(/<div class="tree-item[^>]*>/g)].map(m => m[0]);
    assert.ok(items.every(i => /role="treeitem"/.test(i) && /data-tree-path="/.test(i) && /aria-level="\d"/.test(i)));
    assert.match(out, /aria-expanded="true"[^>]*data-tree-path="\/"/);
    assert.match(out, /aria-expanded="false"[^>]*data-tree-path="\/media"/);
  });

  test('result changes and the bulk bar appearing are announced once', async () => {
    const page = await booted();
    assert.equal(page.els['#filesStatus'].textContent, '4 items');
    page.c.setSelected('/a.ts', true);
    assert.match(page.els['#filesStatus'].textContent, /1 selected on this page/);
    page.c.setSelected('/b.png', true);
    assert.match(page.els['#filesStatus'].textContent, /1 selected/, 'not re-announced on every change');
    assert.match(FILES_HTML, /id="filesStatus" class="sr-only" role="status" aria-live="polite"/);
  });
});

/* ══════════════════════════════════════════
   PHASE 5 — UI quality
   ══════════════════════════════════════════ */

describe('UI quality', () => {
  test('the table container scrolls instead of clipping', () => {
    const rule = FILES_CSS.match(/\.files-table-wrap \{[^}]*\}/)[0];
    assert.match(rule, /overflow: auto/);
    assert.doesNotMatch(rule, /overflow: hidden/);
  });

  test('every truncated name carries its full name', () => {
    const { pure } = loadFiles();
    const state = pure.createState({ files: LISTING.items });
    const list = pure.renderListHtml(state);
    const grid = pure.renderGridHtml(state);
    assert.equal((list.match(/class="fname" title="/g) || []).length, 4);
    assert.equal((grid.match(/class="file-card-name" title="/g) || []).length, 4);
  });

  test('no inline style in files.html and no inline style in files.js', () => {
    assert.doesNotMatch(FILES_HTML, /style="/);
    assert.doesNotMatch(FILES_SRC, /style="/);
    assert.doesNotMatch(FILES_SRC, /\.style\./);
  });

  test('the stagger offset is bounded', () => {
    const { pure } = loadFiles();
    assert.equal(pure.staggerIndex(0), 0);
    assert.equal(pure.staggerIndex(500), pure.STAGGER_STEPS - 1);
    const many = Array.from({ length: 100 }, (_, i) => file(`/f${i}.txt`));
    const grid = pure.renderGridHtml(pure.createState({ files: many }));
    const steps = new Set([...grid.matchAll(/stagger-(\d+)/g)].map(m => Number(m[1])));
    assert.ok(Math.max(...steps) < pure.STAGGER_STEPS);
    assert.doesNotMatch(FILES_CSS, new RegExp(`stagger-${pure.STAGGER_STEPS}\\b`));
  });

  test('the loading skeleton keeps the footprint and hides from assistive technology', () => {
    const { pure } = loadFiles();
    const out = pure.renderSkeletonHtml(pure.createState({ files: LISTING.items, perPage: 20 }));
    assert.equal((out.match(/<tr>/g) || []).length, 4, 'as many rows as were on screen');
    assert.match(out, /aria-hidden="true"/);
    assert.match(out, /Loading files/);
  });

  test('previews: unavailable states are stated, never broken, never the download endpoint', () => {
    const page = loadFiles();
    const { pure } = page;
    const items = [file('/pic.png', { type: 'image' }), file('/notes.txt', { type: 'document' })];
    page.c.setPreviewCapability({ available: false, formats: [], maxSize: 512 });
    let grid = pure.renderGridHtml(pure.createState({ files: items }));
    assert.match(grid, /Previews are not enabled on this server/);
    assert.match(grid, /No preview for this file type/);
    assert.doesNotMatch(grid, /<img/);

    page.c.setPreviewCapability({ available: true, formats: ['png'], maxSize: 512 });
    grid = pure.renderGridHtml(pure.createState({ files: items }));
    assert.match(grid, /<img src="\/api\/fs\/thumbnail\?path=%2Fpic\.png&amp;size=256"/);
    assert.doesNotMatch(grid, /fs\/download/);
    assert.match(grid, /preview-fallback/, 'a decode failure has a stated fallback');
  });

  test('the destructive confirmation states count, names and permanence; no undo anywhere', () => {
    const { pure } = loadFiles();
    const copy = pure.deleteConfirmCopy([file('/a.txt'), file('/dir', { isFolder: true })]);
    assert.match(copy.title, /Permanently delete 2 items/);
    assert.match(copy.message, /“a\.txt”/);
    assert.match(copy.message, /“dir” \(folder and everything in it\)/);
    assert.match(copy.message, /cannot be undone/);
    const many = pure.deleteConfirmCopy(Array.from({ length: 9 }, (_, i) => file(`/f${i}`)));
    assert.match(many.message, /and 4 more/);
    assert.doesNotMatch(FILES_HTML + FILES_SRC, />\s*(Undo|Restore|Trash)\s*</);
  });

  test('the drawer offers a copy affordance for the location and the same type badge as list and grid', () => {
    const { pure } = loadFiles();
    const f = file('/src/app.ts', { type: 'code' });
    const label = pure.typeLabel(f);
    assert.equal(label, 'Code · TS');
    const drawer = pure.renderDrawerHtml(f);
    assert.match(drawer, /data-drawer-act="copy-path"/);
    for (const out of [drawer, pure.renderListHtml(pure.createState({ files: [f] })), pure.renderGridHtml(pure.createState({ files: [f] }))]) {
      assert.ok(out.includes(label), 'same badge text');
    }
  });

  test('the type shown is the type the server filters by', () => {
    const { pure } = loadFiles();
    // The server says "code"; a name-based guess would say "other".
    assert.equal(pure.typeOf({ name: 'Makefile', isFolder: false, type: 'code' }).key, 'code');
  });

  test('the bulk bar is laid out for the narrowest viewport', () => {
    const narrow = FILES_CSS.slice(FILES_CSS.indexOf('@media (max-width: 560px)'));
    assert.match(narrow, /\.bulk-bar \{[^}]*left: var\(--spacing-12\);[^}]*right: var\(--spacing-12\);/);
    assert.match(narrow, /\.bulk-bar \.divider-v \{ display: none; \}/);
    assert.match(FILES_CSS, /body\.has-bulk-bar \.page/);
  });

  test('sticky surfaces are offset, not stacked, and disabled at narrow widths', () => {
    assert.match(FILES_CSS, /top: calc\(var\(--topbar-height\) \+ 12px \+ var\(--files-toolbar-offset\)\)/);
    const narrow = FILES_CSS.slice(FILES_CSS.indexOf('@media (max-width: 860px)'));
    assert.match(narrow, /\.files-toolbar \{ position: static; \}/);
    assert.match(narrow, /\.tree-panel \{ position: static;/);
  });
});

/* ══════════════════════════════════════════
   ESCAPING (markup-escaping-and-security-boundary)
   ══════════════════════════════════════════ */

describe('filesystem-derived strings are escaped everywhere they are rendered', () => {
  const evil = file(`/${HOSTILE}`, { type: 'document' });
  const evilFolder = file(`/${HOSTILE.replace('.txt', '')}`, { isFolder: true });

  function assertInert(out, where) {
    assert.doesNotMatch(out, /<img src=x/, `${where}: raw markup`);
    assert.doesNotMatch(out, /onerror=alert\(1\)>"/, `${where}: attribute breakout`);
    assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;&quot;&#39;&amp;/, `${where}: escaped text`);
  }

  test('list, grid, drawer, breadcrumb, tree, empty-search and delete confirmation', () => {
    const { pure } = loadFiles();
    const state = pure.createState({ files: [evil, evilFolder], total: 2, currentPath: evilFolder.path, search: HOSTILE });
    assertInert(pure.renderListHtml(state), 'list');
    assertInert(pure.renderGridHtml(state), 'grid');
    assertInert(pure.renderDrawerHtml(evil), 'drawer');
    assertInert(pure.renderBreadcrumbHtml(evilFolder.path), 'breadcrumb');
    assertInert(pure.renderTreeHtml(pure.createState({
      treeLoaded: true, expanded: new Set(['/']), currentPath: evilFolder.path,
      tree: [{ ...TREE[0], children: [{ name: evilFolder.name, path: evilFolder.path, children: [] }] }],
    })), 'tree');
    assertInert(pure.renderEmptyHtml(pure.createState({ search: HOSTILE })), 'empty state');
    assertInert(pure.deleteConfirmCopy([evil]).message, 'delete confirmation');
  });

  test('every filesystem-derived interpolation in markup passes through esc()', () => {
    // A markup line is one that builds HTML. Toast/announce text is not markup:
    // Toast escapes its own title and message.
    const offenders = [];
    let checked = 0;
    FILES_SRC.split(/\r?\n/).forEach((line, i) => {
      if (!/<[a-z]|="\$\{/.test(line)) return;
      for (const m of line.matchAll(/\b(?:f|file|n|c|job\.file|j\.file)\.(?:name|path|id)\b/g)) {
        const before = line.slice(0, m.index);
        const open = before.lastIndexOf('${');
        if (open === -1) continue;
        checked++;
        if (!/(esc|encodeURIComponent)\([^)]*$/.test(before.slice(open + 2))) offenders.push(`${i + 1}: ${line.trim()}`);
      }
    });
    assert.ok(checked > 10, `the scan found the interpolation sites (${checked})`);
    assert.deepEqual(offenders, []);
  });
});
