// test/frontend/files.operations.test.js
'use strict';

/**
 * Tracked Copy/Move on the Files page (copy-move-progress-and-notifications):
 * start notification, measured progress rendering, the in-flight filename, the
 * terminal notification lifecycle, de-duplication, concurrency, the double-paste
 * guard, and the guarantee that the UI always reaches a terminal state.
 *
 * Reuses the page harness from files.test.js's own module by requiring it is not
 * possible (it is a suite, not a helper), so this file stands on the same
 * conventions: a vm-run copy of app.js + files.js against a fake DOM.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const APP_SRC = fs.readFileSync(path.join(ROOT, 'public/assets/js/app.js'), 'utf8');
const FILES_SRC = fs.readFileSync(path.join(ROOT, 'public/assets/js/files.js'), 'utf8');
const FILES_HTML = fs.readFileSync(path.join(ROOT, 'public/files.html'), 'utf8');
const FILES_CSS = fs.readFileSync(path.join(ROOT, 'public/assets/css/files.css'), 'utf8');

const settle = () => new Promise(r => setImmediate(r));
async function settleAll() { for (let i = 0; i < 6; i++) await settle(); }
const plain = (v) => JSON.parse(JSON.stringify(v));

/* ── a minimal fake DOM, matching the conventions of files.test.js ── */

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
    this.tabIndex = -1;
    this.textContent = '';
    this.children = {};
    this.styleProps = {};
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
  get style() {
    const el = this;
    return {
      setProperty: (k, v) => { el.styleProps[k] = v; },
      removeProperty: (k) => { delete el.styleProps[k]; },
      getPropertyValue: (k) => el.styleProps[k],
    };
  }
}

function makePage() {
  const timers = [];
  const calls = { get: [], getRequests: [], post: [], put: [], del: [], upload: [], downloadFile: [], downloadMultipleFiles: [], downloadZip: [], operationStatus: [] };
  const toasts = [];
  const operations = new Map();
  let opSeq = 0;
  const store = {};
  const menus = [], copies = [];
  const modal = { confirm: true, prompt: '' };

  const doc = new FakeEl(null, 'document');
  doc.body = new FakeEl(doc, 'body');
  doc.body.dataset = { page: 'files' };
  doc.documentElement = new FakeEl(doc, 'html');
  doc.createElement = (tag) => new FakeEl(doc, tag);
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  doc.getElementById = () => null;

  const sandbox = { setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, JSON, console: { warn() {}, error() {}, log() {} } };
  sandbox.window = sandbox;
  sandbox.URLSearchParams = URLSearchParams;
  sandbox.FormData = FormData;
  sandbox.document = doc;
  sandbox.navigator = { platform: 'test' };
  sandbox.location = { search: '' };
  sandbox.innerWidth = 1200;
  sandbox.innerHeight = 800;
  sandbox.scrollTo = () => {};
  sandbox.addEventListener = () => {};
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sandbox.setTimeout = (fn, ms) => { timers.push({ fn, ms, id: timers.length + 1 }); return timers.length; };
  sandbox.clearTimeout = (id) => { const t = timers.find(x => x.id === id); if (t) t.cancelled = true; };
  sandbox.requestAnimationFrame = () => 0;

  vm.createContext(sandbox);
  vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });

  const els = {};
  const el = (sel) => (els[sel] ||= new FakeEl(doc, sel));
  for (const sel of ['#filesContainer', '#folderTree', '#breadcrumb', '#filterChips', '#filesSearch', '#bulkBar',
    '#fileDrawer', '#drawerBackdrop', '#filesStatus', '#selectAll', '#pageTitle', '#pageSubtitle', '#sortDropdown',
    '#sortLabel', '#sortTrigger', '#viewToggle', '.app-shell', '#uploadTray', '#hiddenFileInput',
    '#btnPaste', '#btnCancelCut', '#clipboardStrip', '#treePanel', '#treeSheetBackdrop', '#btnTreeSheet',
    '.sidebar', '.topbar', '.files-header', '#filesToolbar',
    '#operationStrip', '#operationVerb', '#operationCount', '#operationFile', '#operationBytes',
    '#operationProgress', '#operationBar']) el(sel);
  // files.html ships the strip with the `hidden` attribute; mirror that initial
  // state so "absent on load" is tested rather than assumed.
  el('#operationStrip').hidden = /\sid="operationStrip"[^>]*\shidden/.test(FILES_HTML);
  el('#btnPaste').children['.paste-count'] = new FakeEl(doc, '.paste-count');
  const clipText = new FakeEl(doc, '.clipboard-text');
  el('#clipboardStrip').children['.clipboard-text'] = clipText;
  els['#clipboardTrigger'] = clipText;
  el('#clipboardItemsDropdown');
  const drawer = el('#fileDrawer');
  drawer.children['.drawer-body'] = new FakeEl(doc, '.drawer-body');
  drawer.children['.drawer-footer'] = new FakeEl(doc, '.drawer-footer');
  drawer.children['#drawerTitle'] = new FakeEl(doc, '#drawerTitle');
  drawer.children['#drawerClose'] = el('#drawerClose');
  el('#bulkBar').children['.num'] = new FakeEl(doc, '.num');

  const AFM = sandbox.AFM;
  AFM.$ = (sel) => els[sel] || null;
  const makeToast = (type, t, m) => {
    const record = { type, t, m, updates: [] };
    toasts.push(record);
    return {
      dismiss() {},
      update(next) {
        record.updates.push(next);
        Object.assign(record, { type: next.type ?? record.type, t: next.title ?? record.t, m: next.msg ?? record.m });
      },
    };
  };
  AFM.Toast = {
    success: (t, m) => makeToast('success', t, m),
    info: (t, m) => makeToast('info', t, m),
    warning: (t, m) => makeToast('warning', t, m),
    error: (t, m) => makeToast('error', t, m),
  };
  AFM.Modal = {
    confirm: async (opts) => { modal.lastConfirm = opts; return modal.confirm; },
    prompt: async (opts) => { modal.lastPrompt = opts; return modal.prompt; },
  };
  AFM.ContextMenu = { show: (x, y, items) => menus.push({ x, y, items }), hide() {} };
  AFM.Dropdown = { closeAll() {} };
  AFM.copyToClipboard = (text) => { copies.push(text); return Promise.resolve(true); };
  AFM.Store = {
    get: (k, f) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : f),
    set(k, v) { store[k] = v; },
  };

  const LISTING = {
    items: [
      { name: 'docs', path: '/docs', isFolder: true, type: 'folder' },
      { name: 'a.ts', path: '/a.ts', isFolder: false, type: 'code' },
      { name: 'b.png', path: '/b.png', isFolder: false, type: 'image' },
    ],
    total: 3,
    counts: { all: 3, folder: 1, image: 1, video: 0, document: 0, audio: 0, archive: 0, code: 1, other: 0 },
  };

  sandbox.API = {
    BASE_URL: '/api/v1',
    thumbnailUrl: (p, size) => `/api/v1/fs/thumbnail?path=${encodeURIComponent(p)}&size=${encodeURIComponent(size)}`,
    get: (url) => {
      calls.get.push(url);
      if (url.startsWith('/fs/list')) return Promise.resolve(LISTING);
      if (url.startsWith('/fs/tree')) return Promise.resolve([]);
      if (url.startsWith('/fs/thumbnail/capability')) return Promise.resolve({ available: false, formats: [], maxSize: 512 });
      return Promise.resolve({});
    },
    post: (url, body) => { calls.post.push({ url, body }); return Promise.resolve({ success: true }); },
    put: (url, body) => { calls.put.push({ url, body }); return Promise.resolve({ success: true }); },
    del: (url, body) => { calls.del.push({ url, body }); return Promise.resolve({ success: true }); },
    upload: () => ({ promise: Promise.resolve({}), abort() {} }),
    downloadFile: () => {},
    downloadMultipleFiles: () => {},
    downloadZip: () => {},
    startOperation: (kind, payload) => {
      const id = `op-${++opSeq}`;
      operations.set(id, { id, kind, payload, polls: 0 });
      return Promise.resolve(id);
    },
    getOperation: (id) => {
      calls.operationStatus.push(id);
      const op = operations.get(id);
      if (!op) return Promise.reject(Object.assign(new Error('Operation not found.'), { status: 404 }));
      op.polls += 1;
      const next = typeof op.status === 'function' ? op.status(op.polls) : op.status;
      if (next === undefined) return Promise.resolve(inFlight(op));
      // An Error stands for a failed status read, which api.js surfaces as a
      // rejection; returning it as a value would test a path that cannot happen.
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  };

  function inFlight(op) {
    return {
      id: op.id, operationKind: op.kind, state: 'in_progress', determinate: false, percent: null,
      itemInProgress: null,
      items: { done: 0, total: op.payload.paths.length, failed: 0 },
      bytes: { transferred: null, total: null, available: false },
      failures: [], result: null, startedAt: 1, finishedAt: null,
    };
  }

  vm.runInContext(FILES_SRC, sandbox, { filename: 'files.js' });
  const Files = sandbox.Files;

  const page = {
    Files, c: Files._controller, els, doc, calls, toasts, operations, timers, modal,
    state: () => Files._controller.getState(),
    flushTimers() {
      timers.filter(t => !t.cancelled && !t.ran).forEach(t => { t.ran = true; t.fn(); });
    },
    pendingTimers: () => timers.filter(t => !t.cancelled && !t.ran),
  };

  page.Files.init();
  return page;
}

/** Drive the newest operation to `status`. */
async function advance(page, status) {
  await settleAll();
  const op = page.operations.get(`op-${page.operations.size}`);
  if (!op) throw new Error('no operation was started');
  if (status !== undefined) op.status = status;
  page.flushTimers();
  await settleAll();
  return op;
}

const ITEMS = (paths) => paths.map(p => ({ name: path.posix.basename(p), path: p, isFolder: false }));

async function startPaste(page, mode, items, dest = '/docs') {
  page.c.navigateTo(dest);
  await settleAll();
  if (mode === 'copy') page.c.copyItems(items); else page.c.cutItems(items);
  await page.c.pasteItems();
  await settleAll();
}

const terminal = (o = {}) => ({
  state: 'completed', determinate: false, percent: null, itemInProgress: null,
  items: { done: 1, total: 1, failed: 0 },
  bytes: { transferred: null, total: null, available: false },
  failures: [],
  result: { moved: [], copied: [], failed: [] },
  ...o,
});

/* ══════════════════════════════════════════
   START
   ══════════════════════════════════════════ */

describe('a Copy and a Move each announce that they started', () => {
  test('starting a copy produces one start notification naming the destination', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));

    const starts = page.toasts.filter(t => t.type === 'info' && /Copy started/.test(t.t));
    assert.equal(starts.length, 1, 'exactly one start notification');
    assert.match(starts[0].m, /1 item to \/docs/);
  });

  test('starting a move produces one start notification naming the destination', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'cut', ITEMS(['/a.ts', '/b.png']));

    const starts = page.toasts.filter(t => t.type === 'info' && /Move started/.test(t.t));
    assert.equal(starts.length, 1);
    assert.match(starts[0].m, /2 items to \/docs/);
  });

  test('the start notification appears before any terminal outcome', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));

    assert.equal(page.operations.size, 1, 'the operation is still being polled');
    assert.ok(page.toasts.some(t => /Copy started/.test(t.t)));
    assert.ok(!page.toasts.some(t => /Copited \d/.test(t.t)), 'no success reported yet');
  });
});

/* ══════════════════════════════════════════
   PROGRESS
   ══════════════════════════════════════════ */

describe('progress reflects the operation state the server measured', () => {
  test('the in-flight filename is displayed', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, {
      state: 'in_progress', determinate: true, percent: 50,
      itemInProgress: { path: '/a.ts', name: 'a.ts' },
      items: { done: 0, total: 1, failed: 0 },
      bytes: { transferred: 5, total: 10, available: true },
      failures: [],
    });

    assert.equal(page.els['#operationFile'].textContent, 'a.ts');
    assert.equal(page.els['#operationStrip'].hidden, false);
  });

  test('a determinate copy reports bytes and a percentage', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, {
      state: 'in_progress', determinate: true, percent: 40,
      itemInProgress: { path: '/a.ts', name: 'a.ts' },
      items: { done: 0, total: 1, failed: 0 },
      bytes: { transferred: 400, total: 1000, available: true },
      failures: [],
    });

    assert.equal(page.els['#operationProgress'].getAttribute('aria-valuenow'), '40');
    assert.equal(page.els['#operationBar'].styleProps['--progress'], '0.4');
    assert.match(page.els['#operationBytes'].textContent, /400 B \/ 1 kB|400 B \/ 1000 B/);
  });

  test('a move is shown indeterminate, with no percentage at all', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'cut', ITEMS(['/a.ts']));
    await advance(page, {
      state: 'in_progress', determinate: false, percent: null,
      itemInProgress: { path: '/a.ts', name: 'a.ts' },
      items: { done: 0, total: 1, failed: 0 },
      bytes: { transferred: null, total: null, available: false },
      failures: [],
    });

    assert.equal(page.els['#operationProgress'].getAttribute('aria-valuenow'), null, 'no invented value');
    assert.ok(page.els['#operationBar'].classes.has('is-striped'));
    assert.match(page.els['#operationCount'].textContent, /0 of 1/, 'per-item progress is still shown');
  });

  test('an unavailable byte total is stated as unavailable, never as zero', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, {
      state: 'in_progress', determinate: false, percent: null,
      itemInProgress: { path: '/a.ts', name: 'a.ts' },
      items: { done: 0, total: 1, failed: 0 },
      bytes: { transferred: null, total: null, available: false },
      failures: [],
    });

    assert.equal(page.els['#operationBytes'].textContent, 'Size unavailable');
    assert.doesNotMatch(page.els['#operationBytes'].textContent, /0 B \/ 0 B/);
  });

  test('a preparing operation is marked busy, and not yet claiming progress', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, {
      state: 'preparing', determinate: false, percent: null, itemInProgress: null,
      items: { done: 0, total: 1, failed: 0 },
      bytes: { transferred: null, total: null, available: false },
      failures: [],
    });

    assert.equal(page.els['#operationProgress'].getAttribute('aria-busy'), 'true');
  });

  test('a terminal operation reports no item in flight', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, terminal({
      result: { copied: [{ sourcePath: '/a.ts', newPath: '/docs/a.ts' }], moved: [], failed: [] },
      items: { done: 1, total: 1, failed: 0 },
    }));

    assert.equal(page.els['#operationFile'].textContent, '');
    assert.equal(page.els['#operationStrip'].hidden, false, 'the outcome is still shown briefly');
  });
});

/* ══════════════════════════════════════════
   TERMINAL NOTIFICATIONS
   ══════════════════════════════════════════ */

describe('exactly one terminal notification per operation', () => {
  test('a completed copy promotes its start toast to success', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, terminal({
      result: { copied: [{ sourcePath: '/a.ts', newPath: '/docs/a.ts' }], moved: [], failed: [] },
    }));

    const ok = page.toasts.find(t => t.type === 'success' && /Copied 1 item/.test(t.t));
    assert.ok(ok);
    assert.equal(page.toasts.filter(t => t.type === 'success').length, 1);
  });

  test('a partial result names the successes and the failures', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'cut', ITEMS(['/a.ts', '/b.png']));
    await advance(page, terminal({
      state: 'partial',
      items: { done: 1, total: 2, failed: 1 },
      failures: [{ path: '/b.png', error: 'An item with this name already exists at the destination.', statusCode: 409 }],
      result: {
        moved: [{ oldPath: '/a.ts', newPath: '/docs/a.ts' }], copied: [],
        failed: [{ path: '/b.png' }],
      },
    }));

    const warn = page.toasts.find(t => t.type === 'warning');
    assert.ok(warn);
    assert.match(warn.t, /Moved 1 of 2/);
    assert.match(warn.m, /b\.png: An item with this name already exists/);
  });

  test('a total failure reports the reason the server gave', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, terminal({
      state: 'failed',
      items: { done: 0, total: 1, failed: 1 },
      failures: [{ path: '/a.ts', error: 'Permission denied to copy item.', statusCode: 403 }],
      result: { copied: [], moved: [], failed: [{ path: '/a.ts' }] },
    }));

    const err = page.toasts.find(t => t.type === 'error');
    assert.ok(err);
    assert.equal(err.t, 'Copy failed');
    assert.match(err.m, /Permission denied to copy item/);
  });

  test('a cancelled operation is reported as cancelled, not as success', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts', '/b.png']));
    await advance(page, terminal({
      state: 'cancelled',
      items: { done: 1, total: 2, failed: 0 },
      result: { copied: [{ sourcePath: '/a.ts', newPath: '/docs/a.ts' }], moved: [], failed: [] },
    }));

    assert.ok(page.toasts.some(t => /Copy cancelled/.test(t.t)));
    assert.ok(!page.toasts.some(t => t.type === 'success'), 'cancellation is never a success');
  });

  test('polling past a terminal state does not produce a second notification', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, terminal({
      result: { copied: [{ sourcePath: '/a.ts', newPath: '/docs/a.ts' }], moved: [], failed: [] },
    }));
    const before = page.toasts.length;

    page.flushTimers();
    await settleAll();
    page.flushTimers();
    await settleAll();

    assert.equal(page.toasts.length, before, 'no duplicate terminal notification');
    assert.equal(page.calls.operationStatus.length, calls(page), 'polling stopped at the terminal state');
  });

  function calls(page) {
    return page.calls.operationStatus.length;
  }
});

/* ══════════════════════════════════════════
   GUARDS, CONCURRENCY, TERMINAL GUARANTEE
   ══════════════════════════════════════════ */

describe('the UI always reaches a terminal state', () => {
  test('a second Paste while an operation is in flight starts nothing', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'cut', ITEMS(['/a.ts']));

    await page.c.pasteItems();
    await settleAll();

    assert.equal(page.operations.size, 1, 'only one operation was ever registered');
  });

  test('the Paste control is disabled while running and restored after', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'cut', ITEMS(['/a.ts']));
    assert.equal(page.els['#btnPaste'].disabled, true, 'disabled while in flight');
    assert.equal(page.els['#btnPaste'].getAttribute('aria-busy'), 'true');

    await advance(page, terminal({ result: { moved: [{ oldPath: '/a.ts', newPath: '/docs/a.ts' }], copied: [], failed: [] } }));
    assert.equal(page.els['#btnPaste'].disabled, false, 'restored once the operation ended');
  });

  test('an operation that becomes unknown still releases the UI', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'cut', ITEMS(['/a.ts']));

    // The id disappears server-side (restart, eviction, or someone else's).
    const op = page.operations.get('op-1');
    delete page.operations.get('op-1');
    op.status = Object.assign(new Error('Operation not found.'), { status: 404 });
    page.flushTimers();
    await settleAll();

    // Released immediately as far as the operator's actions go: the guard is gone
    // and Paste works. The surface itself lingers for the result TTL.
    assert.equal(page.els['#btnPaste'].disabled, false, 'Paste works again');
    assert.equal(page.state().inFlight.size, 0);
    assert.ok(page.toasts.some(t => /status lost/.test(t.t)), 'the operator is told, not left guessing');

    page.flushTimers();
    await settleAll();
    assert.equal(page.els['#operationStrip'].hidden, true, 'and the surface clears on its own');
  });

  test('repeated transport failures stop the poller instead of looping forever', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'cut', ITEMS(['/a.ts']));
    const op = page.operations.get('op-1');
    op.status = Object.assign(new Error('Network Error'), { status: 0 });

    for (let i = 0; i < 8; i++) { page.flushTimers(); await settleAll(); }

    assert.equal(page.els['#operationStrip'].hidden, true, 'the strip is released');
    assert.equal(page.els['#btnPaste'].disabled, false, 'the control is usable again');
    assert.equal(page.state().inFlight.size, 0, 'the guard was released');
  });

  test('polling backs off while the reported state does not change', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'cut', ITEMS(['/a.ts']));
    await settleAll();

    const scheduled = () => page.pendingTimers().map(t => t.ms);
    const first = scheduled()[0];

    op_status_stays(page, 'in_progress');
    page.flushTimers();
    await settleAll();
    const second = scheduled()[0];

    assert.ok(second > first, `interval grew from ${first} to ${second}`);
  });

  function op_status_stays(page, state) {
    const op = page.operations.get('op-1');
    op.status = {
      id: 'op-1', operationKind: 'move', state, determinate: false, percent: null, itemInProgress: null,
      items: { done: 0, total: 1, failed: 0 },
      bytes: { transferred: null, total: null, available: false },
      failures: [], result: null, startedAt: 1, finishedAt: null,
    };
  }

  test('polling is capped so a long operation cannot flood the server', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'cut', ITEMS(['/a.ts']));
    const intervals = [];
    for (let i = 0; i < 12; i++) {
      op_status_stays(page, 'in_progress');
      page.flushTimers();
      await settleAll();
      const next = page.pendingTimers().map(t => t.ms);
      if (next.length) intervals.push(next[0]);
    }
    assert.ok(Math.max(...intervals) <= 1600, `never exceeded the cap: ${Math.max(...intervals)}`);
  });

  test('destroy stops every poller and releases the strip', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'cut', ITEMS(['/a.ts']));
    assert.ok(page.pendingTimers().length > 0, 'a poll was scheduled');

    page.Files.destroy();

    assert.equal(page.pendingTimers().filter(t => !t.cancelled).length, 0, 'no poll survives the page swap');
    assert.equal(page.els['#operationStrip'].hidden, true);
  });
});

describe('concurrent operations stay independent', () => {
  test('two operations report their own filename and outcome', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    const firstId = 'op-1';

    // A second operation on a different folder, while the first still runs.
    page.c.navigateTo('/media');
    await settleAll();
    page.c.copyItems(ITEMS(['/b.png']));
    await page.c.pasteItems();
    await settleAll();
    assert.equal(page.operations.size, 2);

    // Give each a different in-flight item.
    page.operations.get(firstId).status = {
      state: 'in_progress', determinate: false, percent: null,
      itemInProgress: { path: '/a.ts', name: 'a.ts' },
      items: { done: 0, total: 1, failed: 0 },
      bytes: { transferred: null, total: null, available: false }, failures: [],
    };
    page.operations.get('op-2').status = {
      state: 'in_progress', determinate: false, percent: null,
      itemInProgress: { path: '/b.png', name: 'b.png' },
      items: { done: 0, total: 1, failed: 0 },
      bytes: { transferred: null, total: null, available: false }, failures: [],
    };
    page.flushTimers();
    await settleAll();

    // Finish only the second: the first must keep polling and must not be
    // reported as finished.
    page.operations.get('op-2').status = terminal({
      result: { copied: [{ sourcePath: '/b.png', newPath: '/media/b.png' }], moved: [], failed: [] },
    });
    page.flushTimers();
    await settleAll();

    const copied = page.toasts.filter(t => t.type === 'success' && /Copied 1 item/.test(t.t));
    assert.equal(copied.length, 1, 'exactly one operation reported success');
    assert.match(copied[0].m, /\/media/, 'and it was the one that targeted /media');
  });
});

/* ══════════════════════════════════════════
   SOURCE + MARKUP INVARIANTS
   ══════════════════════════════════════════ */

/* ══════════════════════════════════════════
   SURFACE VISIBILITY
   ══════════════════════════════════════════ */

describe('the progress surface exists only while an operation runs', () => {
  test('nothing is rendered before an operation starts', async () => {
    const page = makePage();
    await settleAll();
    assert.equal(page.els['#operationStrip'].hidden, true, 'absent on load');
    assert.match(FILES_HTML, /id="operationStrip"[^>]*\shidden/, 'and the markup ships it hidden');
  });

  test('the styled strip declares [hidden] as none, so the attribute can actually hide it', () => {
    // .operation-strip sets `display: flex`, and an author declaration always
    // beats the UA default `[hidden] { display: none }`. Without this rule the
    // strip renders visible from page load and no attribute toggle can hide it -
    // the same defect files.css already documents for #clipboardStrip.
    const rule = FILES_CSS.match(/#clipboardStrip\[hidden\][\s\S]*?\}/);
    assert.ok(rule, 'the shared [hidden] rule still exists');
    assert.match(rule[0], /#operationStrip\[hidden\]/, 'the progress strip is covered by it');
    assert.match(rule[0], /display:\s*none/);
  });

  test('the pre-existing clipboard strip keeps its own escape hatch', () => {
    const rule = FILES_CSS.match(/#clipboardStrip\[hidden\][\s\S]*?\}/);
    for (const sel of ['#clipboardStrip[hidden]', '#btnPaste[hidden]', '#btnCancelCut[hidden]']) {
      assert.ok(rule[0].includes(sel), `${sel} is still declared`);
    }
  });

  test('the strip appears while an operation runs', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    assert.equal(page.els['#operationStrip'].hidden, false);
  });

  test('the outcome stays visible after completion, then clears on the result TTL', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, terminal({
      result: { copied: [{ sourcePath: '/a.ts', newPath: '/docs/a.ts' }], moved: [], failed: [] },
    }));

    assert.equal(page.els['#operationStrip'].hidden, false, 'the result is still shown');

    const linger = page.pendingTimers().map(t => t.ms).filter(ms => ms === 5000);
    assert.ok(linger.length === 1, `exactly one 5s removal was scheduled: ${linger}`);

    page.flushTimers();
    await settleAll();
    assert.equal(page.els['#operationStrip'].hidden, true, 'and it is gone once the linger elapses');
  });

  test('the linger is bounded, not open-ended', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, terminal({
      result: { copied: [{ sourcePath: '/a.ts', newPath: '/docs/a.ts' }], moved: [], failed: [] },
    }));
    const removals = page.pendingTimers().filter(t => t.ms > 0).map(t => t.ms);
    assert.ok(removals.every(ms => ms <= 5000), `no unbounded timer: ${removals}`);
  });

  test('starting another operation cancels the pending removal instead of queueing behind it', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, terminal({
      result: { copied: [{ sourcePath: '/a.ts', newPath: '/docs/a.ts' }], moved: [], failed: [] },
    }));
    assert.ok(page.pendingTimers().some(t => t.ms === 5000), 'a removal is pending');

    // A second, different operation takes the strip over immediately.
    page.c.navigateTo('/media');
    await settleAll();
    page.c.copyItems(ITEMS(['/b.png']));
    await page.c.pasteItems();
    await settleAll();

    assert.equal(page.els['#operationStrip'].hidden, false, 'the strip was reused');
    assert.equal(page.pendingTimers().some(t => t.ms === 5000), false, 'the stale removal was cancelled');
  });

  test('destroy cancels a pending removal so it cannot hide the next page', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, terminal({
      result: { copied: [{ sourcePath: '/a.ts', newPath: '/docs/a.ts' }], moved: [], failed: [] },
    }));
    assert.ok(page.pendingTimers().some(t => t.ms === 5000));

    page.Files.destroy();

    assert.equal(page.pendingTimers().some(t => t.ms === 5000 && !t.cancelled), false,
      'no removal survives the page swap');
  });

  test('a second operation starting after the linger is hidden shows the strip again', async () => {
    const page = makePage();
    await settleAll();
    await startPaste(page, 'copy', ITEMS(['/a.ts']));
    await advance(page, terminal({
      result: { copied: [{ sourcePath: '/a.ts', newPath: '/docs/a.ts' }], moved: [], failed: [] },
    }));
    page.flushTimers();
    await settleAll();
    assert.equal(page.els['#operationStrip'].hidden, true);

    page.c.navigateTo('/media');
    await settleAll();
    page.c.copyItems(ITEMS(['/b.png']));
    await page.c.pasteItems();
    await settleAll();

    assert.equal(page.els['#operationStrip'].hidden, false, 'shown again for the new operation');
  });
});

describe('the progress surface is wired honestly', () => {
  test('files.html carries the progress container with correct ARIA', () => {
    assert.match(FILES_HTML, /id="operationStrip"/);
    assert.match(FILES_HTML, /id="operationProgress"[^>]*role="progressbar"/);
    assert.match(FILES_HTML, /aria-valuemin="0"[^>]*aria-valuemax="100"/);
    assert.match(FILES_HTML, /id="operationBar"/);
    assert.doesNotMatch(FILES_HTML, /style="/, 'no inline style in the page');
  });

  test('the strip reuses the shared progress stylesheet, not a bespoke one', () => {
    assert.match(FILES_CSS, /\.operation-strip\b/);
    // The bar itself carries no files-page styling: it is the global .progress-bar.
    assert.doesNotMatch(FILES_CSS, /#operationBar\s*\{/);
  });

  test('the in-flight filename is rendered as text, never as markup', () => {
    // textContent assigns text without parsing markup, which is what makes a
    // filesystem-derived name safe here.
    assert.match(FILES_SRC, /els\.file\.textContent = snapshot\.itemInProgress/);
    assert.doesNotMatch(FILES_SRC, /operationFile['"]\)\.innerHTML/);
  });

  test('a hostile in-flight filename is shown as text and introduces no element', () => {
    const page = makePage();
    const hostile = '<img src=x onerror=alert(1)>.mp4';
    page.Files._controller.renderOperation({
      state: 'in_progress', determinate: false, percent: null,
      itemInProgress: { path: `/media/${hostile}`, name: hostile },
      items: { done: 0, total: 1, failed: 0 },
      bytes: { transferred: null, total: null, available: false },
      failures: [],
    }, 'copy');

    const file = page.els['#operationFile'];
    assert.equal(file.textContent, hostile, 'the name is shown verbatim as text');
    assert.equal(file.innerHTML, '', 'nothing was parsed into markup');
    assert.equal(file.children['.img'], undefined, 'no element was created from the name');
  });

  test('a hostile failure reason is shown as text and introduces no element', () => {
    const page = makePage();
    page.Files._controller.renderOperation({
      state: 'in_progress', determinate: false, percent: null, itemInProgress: null,
      items: { done: 0, total: 1, failed: 1 },
      bytes: { transferred: null, total: null, available: false },
      failures: [{ path: '/a', error: '<script>alert(1)</script>', statusCode: 403 }],
    }, 'copy');

    assert.equal(page.els['#operationStrip'].hidden, false);
    assert.equal(page.els['#operationFile'].innerHTML, '');
  });

  test('no percentage is invented on the client for an indeterminate operation', () => {
    const render = FILES_SRC.slice(
      FILES_SRC.indexOf('function renderOperation'),
      FILES_SRC.indexOf('function notifyTerminal'));
    assert.match(render, /snapshot\.determinate && snapshot\.percent != null/);
    assert.doesNotMatch(render, /Math\.round\(.*elapsed/i, 'no elapsed-time estimate');
    assert.doesNotMatch(render, /Date\.now\(\)\s*-\s*startedAt/, 'no elapsed-time estimate');
  });

  test('every dynamic interpolation in the operation surface is escaped or assigned as text', () => {
    const render = FILES_SRC.slice(
      FILES_SRC.indexOf('function renderOperation'),
      FILES_SRC.indexOf('function notifyTerminal'));
    assert.doesNotMatch(render, /\.innerHTML\s*=/, 'the progress surface never writes markup');
  });
});