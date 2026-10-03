// test/frontend/uploads.test.js
'use strict';

/**
 * Upload page module (public/assets/js/uploads.js) — upload-pipeline-correctness.
 *
 * No DOM harness and no new dependency (the approach of app.test.js and
 * files.test.js): the real app.js and uploads.js are evaluated in a `vm`
 * context. window, document and XMLHttpRequest are stubs; the page shell is a
 * set of FakeEl objects that record what uploads.js writes into them, and
 * window.API is a scripted stub whose uploads the test resolves by hand.
 *
 * What a stub cannot observe — real focus order, screen-reader output, layout
 * at 320px, the browser's own drag-and-drop dispatch — is checked in a browser
 * and recorded in the change's tasks.md (§9).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT_DIR, ...p), 'utf8');
const APP_SRC = read('public', 'assets', 'js', 'app.js');
const API_SRC = read('public', 'assets', 'js', 'api.js');
const UPLOADS_SRC = read('public', 'assets', 'js', 'uploads.js');
const UPLOADS_HTML = read('public', 'uploads.html');
const UPLOADS_CSS = read('public', 'assets', 'css', 'uploads.css');
const COMPONENTS_CSS = read('public', 'assets', 'css', 'components.css');

const HOSTILE = '<img src=x onerror=alert(1)>"\'&.txt';
const UNAVAILABLE = '\u2014';

/* ══════════════════════════════════════════
   STUB DOM
   ══════════════════════════════════════════ */

class FakeEl {
  constructor(doc, id) {
    this.doc = doc;
    this.id = id;
    this.attrs = {};
    this.classes = new Set();
    this.listeners = {};
    this.html = '';
    this.htmlWrites = 0;
    this.outer = null;
    this.outerWrites = 0;
    this.textContent = '';
    this.style = {};
    this.children = {};
    this.all = {};
    this.hidden = false;
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this.clicks = 0;
    this.removed = false;
  }
  set innerHTML(v) { this.html = String(v); this.htmlWrites++; }
  get innerHTML() { return this.html; }
  set outerHTML(v) { this.outer = String(v); this.outerWrites++; }
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
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, ev) { (this.listeners[type] || []).forEach(fn => fn(ev)); }
  querySelector(sel) { return this.children[sel] || null; }
  querySelectorAll(sel) { return this.all[sel] || []; }
  contains(x) { return x === this || Object.values(this.children).includes(x); }
  focus() { this.doc.activeElement = this; }
  click() { this.clicks++; }
  remove() { this.removed = true; }
  closest() { return null; }
}

const PAGE_IDS = [
  '#queueList', '#queueStats', '#queueGlobal', '#queueNotice', '#queueAnnounce', '#uploadMetrics',
  '#presetGrid', '#recentUploads', '#destPath', '#dropzone', '#fileInput', '#folderInput', '#browseFiles',
  '#browseFolder', '#changeDestination', '#destPicker', '#destSelect', '#destInput', '#destMsg',
  '#applyDestination', '#createDestination', '#cancelDestination', '#destTreeNote', '#concurrencyValue',
  '#pauseAll', '#resumeAll', '#startQueued', '#retryFailed', '#clearDone', '#cancelAll',
];

class FakeFormData {
  constructor() { this.entries = []; }
  append(k, v) { this.entries.push([k, v]); }
  keys() { return this.entries.map(e => e[0]); }
  get(k) { const e = this.entries.find(x => x[0] === k); return e ? e[1] : null; }
}

const TREE = [{
  id: '/', name: 'All Files', path: '/', children: [
    { id: '/docs', name: 'docs', path: '/docs', children: [] },
    { id: '/media', name: 'media', path: '/media', children: [{ id: '/media/photos', name: 'photos', path: '/media/photos', children: [] }] },
  ],
}];

function httpError(status, message, kind) {
  const err = new Error(message);
  err.status = status;
  if (kind) err.kind = kind;
  return err;
}

/**
 * Load uploads.js against a stub page. `routes` maps a request prefix to a
 * response, an Error to reject with, or a function of the url.
 */
function loadUploads({ routes = {}, optionInputs = [] } = {}) {
  const doc = {
    activeElement: null,
    listeners: {},
    rows: {},
    documentElement: { contains: () => true },
    body: null,
    addEventListener(type, fn) { (doc.listeners[type] ||= []).push(fn); },
    querySelector(sel) { return doc.rows[sel] || null; },
    querySelectorAll() { return []; },
  };
  const timers = [];
  const intervals = [];
  const calls = { get: [], post: [], upload: [] };
  const toasts = [];
  const modal = { confirm: true, lastConfirm: null, confirms: 0 };
  const allRoutes = {
    '/fs/list': { items: [], total: 0, counts: { all: 0 } },
    '/fs/tree': TREE,
    '/dashboard/summary': { activities: [] },
    'POST /fs/folder': { success: true },
    ...routes,
  };

  function respond(url) {
    const key = Object.keys(allRoutes).filter(k => url.startsWith(k)).sort((a, b) => b.length - a.length)[0];
    let r = key ? allRoutes[key] : {};
    if (typeof r === 'function') r = r(url);
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  }

  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.document = doc;
  sandbox.console = { warn() {}, error() {}, log() {} };
  sandbox.FormData = FakeFormData;
  sandbox.XMLHttpRequest = function XMLHttpRequest() { throw new Error('uploads.js must go through window.API'); };
  sandbox.setTimeout = (fn, ms) => { timers.push({ fn, ms, id: timers.length + 1 }); return timers.length; };
  sandbox.clearTimeout = (id) => { const t = timers.find(x => x.id === id); if (t) t.cancelled = true; };
  sandbox.setInterval = (fn, ms) => { intervals.push({ fn, ms, id: intervals.length + 1 }); return intervals.length; };
  sandbox.clearInterval = (id) => { const t = intervals.find(x => x.id === id); if (t) t.cancelled = true; };
  sandbox.requestAnimationFrame = () => 0;
  sandbox.listeners = {};
  sandbox.addEventListener = (type, fn) => { (sandbox.listeners[type] ||= []).push(fn); };
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

  vm.createContext(sandbox);
  vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });

  const els = {};
  for (const sel of PAGE_IDS) els[sel] = new FakeEl(doc, sel);
  // Metric value nodes, so in-place updates are observable.
  const metrics = els['#uploadMetrics'];
  for (const key of ['speed', 'active', 'completed', 'bytes']) {
    metrics.children[`[data-metric="${key}"] .metric-value`] = new FakeEl(doc, `metric:${key}`);
  }
  doc.body = new FakeEl(doc, 'body');
  doc.body.dataset = { page: 'uploads' };

  const AFM = sandbox.AFM;
  AFM.$ = (sel) => els[sel] || null;
  AFM.$$ = (sel) => (sel === '[data-option]' ? optionInputs : []);
  AFM.Toast = {
    success: (t, m) => toasts.push({ type: 'success', t, m }),
    info: (t, m) => toasts.push({ type: 'info', t, m }),
    warning: (t, m) => toasts.push({ type: 'warning', t, m }),
    error: (t, m) => toasts.push({ type: 'error', t, m }),
  };
  AFM.Modal = {
    confirm: async (opts) => { modal.lastConfirm = opts; modal.confirms++; return modal.confirm; },
    prompt: async () => { throw new Error('the destination control no longer uses Modal.prompt'); },
  };

  sandbox.API = {
    BASE_URL: '/api',
    get: (url, opts) => { calls.get.push({ url, opts }); return respond(url); },
    post: (url, body, opts) => { calls.post.push({ url, body, opts }); return respond(`POST ${url}`); },
    upload: (url, form, onProgress) => {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      const rec = { url, form, onProgress, resolve, reject, aborted: false };
      rec.abort = () => { rec.aborted = true; reject(httpError(0, 'Upload cancelled', 'aborted')); };
      calls.upload.push(rec);
      return { promise, abort: rec.abort };
    },
  };

  vm.runInContext(UPLOADS_SRC, sandbox, { filename: 'uploads.js' });
  const Uploads = sandbox.Uploads;

  return {
    Uploads, pure: Uploads.pure, c: Uploads._controller, els, doc, calls, toasts, modal, timers, intervals, sandbox,
    state: () => Uploads._controller.getState(),
    flushTimers() {
      timers.filter(t => !t.cancelled && !t.ran).forEach(t => { t.ran = true; t.fn(); });
    },
    /** Register a row node so document.querySelector finds it, with its patchable parts. */
    mountRow(id) {
      const row = new FakeEl(doc, `row:${id}`);
      for (const sel of ['.qi-fill', '.qi-pct', '.qi-meta']) row.children[sel] = new FakeEl(doc, sel);
      doc.rows[`[data-item-id="${id}"]`] = row;
      return row;
    },
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));
const settle = () => new Promise(r => setImmediate(r));
async function settleAll() { for (let i = 0; i < 8; i++) await settle(); }
const fakeFile = (name, size = 100) => ({ name, size });

/** A page whose root destination has been checked and found usable. */
async function booted(opts) {
  const page = loadUploads(opts);
  page.Uploads.init();
  await settleAll();
  return page;
}

function clickTarget(attrs) {
  const btn = { getAttribute: k => (Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null) };
  return { closest: sel => (sel === '[data-act]' || sel === '[data-notice-act]' || sel === '[data-preset]' || sel === '[data-recent-retry]' ? btn : null) };
}

function keyEvent(key, targetEl) {
  return { key, target: targetEl, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
}

/* ══════════════════════════════════════════
   0.7 — the harness itself
   ══════════════════════════════════════════ */

describe('harness', () => {
  test('uploads.js evaluates against stubbed window, document and XMLHttpRequest', () => {
    const page = loadUploads();
    assert.equal(typeof page.Uploads.init, 'function');
    assert.equal(typeof page.pure.computeProgressPct, 'function');
    assert.equal(page.state().queue.length, 0);
  });
});

/* ══════════════════════════════════════════
   PHASE 1 — escaping
   ══════════════════════════════════════════ */

describe('every interpolated value is escaped', () => {
  const statuses = ['queued', 'uploading', 'paused', 'held', 'done', 'failed'];

  test('a hostile file name renders as text in every row state', () => {
    const { pure } = loadUploads();
    for (const status of statuses) {
      const out = pure.renderItemHTML({
        id: 'up_1', name: HOSTILE, size: 10, uploaded: 5, speed: 1, status, destination: '/d',
        startTime: 1, endTime: 2, error: 'x', savedPath: `/d/${HOSTILE}`,
      });
      assert.doesNotMatch(out, /<img/i, `${status}: no injected element`);
      assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;&quot;&#39;&amp;\.txt/, `${status}: name is escaped`);
    }
  });

  test('a server reason carrying markup is inert', () => {
    const { pure } = loadUploads();
    const out = pure.renderItemHTML({ id: 'up_1', name: 'a.txt', size: 1, uploaded: 0, status: 'failed', destination: '/', error: '<script>alert(1)</script>' });
    assert.doesNotMatch(out, /<script>/);
    assert.match(out, /&lt;script&gt;/);
  });

  test('a hostile destination is escaped where it is displayed and on every row', async () => {
    const page = await booted();
    const ok = await page.c.applyDestination('/a"<b>');
    assert.equal(ok, true);
    const shown = page.els['#destPath'].innerHTML;
    assert.doesNotMatch(shown, /<b>/);
    assert.match(shown, /\/a&quot;&lt;b&gt;/);
    const row = page.pure.renderItemHTML({ id: 'up_1', name: 'a', size: 1, uploaded: 0, status: 'queued', destination: '/a"<b>' });
    assert.doesNotMatch(row, /<b>/);
  });

  test('the in-place progress patch writes no NaN and no raw name', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile(HOSTILE, 0)]);
    const item = page.state().queue[0];
    const row = page.mountRow(item.id);
    item.status = 'uploading';
    item.uploaded = 0;
    page.c.updateItemProgress(item);
    assert.equal(row.children['.qi-fill'].style.width, '0%');
    assert.equal(row.children['.qi-pct'].textContent, '0%');
    assert.doesNotMatch(row.children['.qi-meta'].innerHTML, /NaN|Infinity|<img/);
  });

  test('the page uses the shared helper and no private escaping', () => {
    assert.match(UPLOADS_SRC, /escapeHtml\(item\.name\)/);
    assert.doesNotMatch(UPLOADS_SRC, /\.replace\(\/\[&<>/, 'no local replace-based escaper');
    assert.doesNotMatch(UPLOADS_SRC, /\$\{item\.(name|error|destination|savedPath)\}/, 'no raw item interpolation');
    assert.doesNotMatch(UPLOADS_SRC, /\$\{(path|state\.destination)\}`?\s*;?\s*$/m);
  });

  test('the destination control no longer feeds a value into Modal.prompt (its attribute is unescaped)', () => {
    assert.doesNotMatch(UPLOADS_SRC, /Modal\.prompt/);
  });
});

/* ══════════════════════════════════════════
   PHASE 2 — failure kinds
   ══════════════════════════════════════════ */

describe('failure kinds come from machine-readable signals', () => {
  test('collision, size, network and server outcomes are four distinct texts', () => {
    const { pure } = loadUploads();
    const texts = [
      pure.describeFailure(httpError(409, 'A file with that name already exists.')),
      pure.describeFailure(httpError(413, 'File exceeds the maximum upload size of 5 GB (5368709120 bytes).')),
      pure.describeFailure(httpError(0, 'Upload failed due to network error', 'network')),
      pure.describeFailure(httpError(500, 'Upload could not be saved.')),
    ];
    assert.deepEqual(texts.map(t => t.kind), ['conflict', 'too-large', 'network', 'server']);
    assert.equal(new Set(texts.map(t => t.text)).size, 4);
  });

  test('a server-sent kind wins over the status', () => {
    const { pure } = loadUploads();
    assert.equal(pure.describeFailure(httpError(400, 'Name is reserved by the operating system.', 'invalid-name')).kind, 'invalid-name');
  });

  test('an unrecognised signal falls back to the server message, not to a wrong label', () => {
    const { pure } = loadUploads();
    const unknownKind = pure.describeFailure(httpError(400, 'Some authored reason.', 'brand-new-kind'));
    assert.equal(unknownKind.text, 'Some authored reason.');
    const bare400 = pure.describeFailure(httpError(400, 'Upload destination does not exist.'));
    assert.equal(bare400.text, 'Upload destination does not exist.');
    assert.equal(bare400.kind, 'unknown');
  });

  test('the kind is never derived by reading the message', () => {
    const block = UPLOADS_SRC.slice(UPLOADS_SRC.indexOf('function failureKind'), UPLOADS_SRC.indexOf('/* ── Destination ── */'));
    assert.ok(block.length > 100);
    assert.doesNotMatch(block, /message\.(includes|match|startsWith|indexOf)|\.test\(\s*(err\.)?message/);
  });

  test('kinds are short stable tokens', () => {
    const { Uploads } = loadUploads();
    for (const kind of Object.keys(Uploads.FAILURE_LABELS)) {
      assert.match(kind, /^[a-z][a-z-]{1,19}$/, `${kind} is a token`);
    }
  });

  test('a failed upload records the kind on the row and keeps going', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile('dup.txt'), fakeFile('next.txt')]);
    assert.equal(page.calls.upload.length, 2);
    page.calls.upload[0].reject(httpError(409, 'A file with that name already exists.'));
    await settleAll();
    const [dup] = page.state().queue;
    assert.equal(dup.status, 'failed');
    assert.equal(dup.errorKind, 'conflict');
    assert.match(dup.error, /Replace files with the same name/);
  });
});

describe('api.js attaches status and kind to an upload failure (additive)', () => {
  function loadApi(xhrBehaviour) {
    const sandbox = { console: { warn() {}, error() {} } };
    sandbox.window = sandbox;
    sandbox.XMLHttpRequest = function () {
      const xhr = this;
      xhr.upload = {};
      xhr.open = () => {};
      xhr.send = () => setImmediate(() => xhrBehaviour(xhr));
      xhr.abort = () => xhr.onabort && xhr.onabort();
    };
    vm.createContext(sandbox);
    vm.runInContext(`${API_SRC}\nwindow.API = API;`, sandbox, { filename: 'api.js' });
    return sandbox.API;
  }

  test('a JSON error body yields message, status and kind', async () => {
    const API = loadApi(xhr => {
      xhr.status = 409; xhr.statusText = 'Conflict';
      xhr.responseText = JSON.stringify({ success: false, error: 'A file with that name already exists.', kind: 'conflict' });
      xhr.onload();
    });
    await assert.rejects(API.upload('/fs/upload', {}).promise, err => {
      assert.equal(err.message, 'A file with that name already exists.');
      assert.equal(err.status, 409);
      assert.equal(err.kind, 'conflict');
      return true;
    });
  });

  test('without a kind in the body, none is invented', async () => {
    const API = loadApi(xhr => {
      xhr.status = 413; xhr.statusText = 'Payload Too Large';
      xhr.responseText = JSON.stringify({ success: false, error: 'File exceeds the maximum upload size.' });
      xhr.onload();
    });
    await assert.rejects(API.upload('/fs/upload', {}).promise, err => {
      assert.equal(err.status, 413);
      assert.equal(err.kind, undefined);
      return true;
    });
  });

  test('a transport failure is tagged network; an abort is tagged aborted', async () => {
    const net = loadApi(xhr => xhr.onerror());
    await assert.rejects(net.upload('/fs/upload', {}).promise, err => err.kind === 'network' && err.status === 0);
    const ab = loadApi(() => {});
    const handle = ab.upload('/fs/upload', {});
    handle.abort();
    await assert.rejects(handle.promise, err => err.kind === 'aborted');
  });
});

/* ══════════════════════════════════════════
   PHASE 3 — derivations
   ══════════════════════════════════════════ */

describe('progress is defined for degenerate sizes', () => {
  test('a zero-byte file yields a finite percentage', () => {
    const { pure } = loadUploads();
    const pct = pure.computeProgressPct({ size: 0, uploaded: 0, status: 'uploading' });
    assert.ok(Number.isFinite(pct));
    assert.equal(pct, 0);
    assert.equal(pure.computeProgressPct({ size: 0, uploaded: 0, status: 'done' }), 100);
  });

  test('the percentage is clamped to 0..100', () => {
    const { pure } = loadUploads();
    assert.equal(pure.computeProgressPct({ size: 10, uploaded: 50, status: 'uploading' }), 100);
    assert.equal(pure.computeProgressPct({ size: 10, uploaded: -5, status: 'uploading' }), 0);
    assert.equal(pure.computeProgressPct({ size: 10, uploaded: NaN, status: 'uploading' }), 0);
  });

  test('multipart overhead never reports more bytes than the file holds', () => {
    const { pure } = loadUploads();
    assert.equal(pure.scaleTransferred(1200, 1200, 1000), 1000);
    assert.equal(pure.scaleTransferred(600, 1200, 1000), 500);
    assert.equal(pure.scaleTransferred(5, 0, 1000), 0);
  });
});

describe('remaining time is unavailable when speed is unknown', () => {
  test('zero measured speed yields null, not 0', () => {
    const { pure } = loadUploads();
    assert.equal(pure.computeRemainingSeconds({ status: 'uploading', size: 100, uploaded: 10, speed: 0 }), null);
    assert.equal(pure.computeRemainingSeconds({ status: 'uploading', size: 100, uploaded: 10, speed: 30 }), 3);
  });

  test('a computed time is labelled an estimate; the unavailable one is not', () => {
    const { pure } = loadUploads();
    const unknown = pure.formatRemaining(null);
    assert.equal(unknown, `${UNAVAILABLE} left`);
    assert.doesNotMatch(unknown, /estimate|0s/);
    assert.match(pure.formatRemaining(3), /^3s left \(estimate\)$/);
  });

  test('an uploading row with no speed yet shows the unavailable marker, never 0s', () => {
    const { pure } = loadUploads();
    const out = pure.renderItemHTML({ id: 'u', name: 'a', size: 100, uploaded: 0, speed: 0, status: 'uploading', destination: '/' });
    assert.match(out, new RegExp(`${UNAVAILABLE} left`));
    assert.doesNotMatch(out, /0s left/);
  });

  test('the in-place patch uses the same derivations as the row', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile('a.bin', 1000)]);
    const item = page.state().queue[0];
    const row = page.mountRow(item.id);
    page.calls.upload[0].onProgress(600, 1200);
    assert.equal(row.children['.qi-fill'].style.width, '50%');
    assert.equal(row.children['.qi-pct'].textContent, '50%');
    assert.match(row.children['.qi-meta'].innerHTML, new RegExp(`${UNAVAILABLE} left`));
  });
});

describe('summary tiles measure a surviving source', () => {
  test('clearing completed rows does not reset the completed tiles', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile('a.txt', 300), fakeFile('b.txt', 700)]);
    page.calls.upload[0].resolve({ success: true, data: { path: '/a.txt', size: 300 } });
    await settleAll();
    const before = plain(page.pure.computeQueueTiles(page.state().queue, page.state().session));
    page.c.clearCompleted();
    const after = plain(page.pure.computeQueueTiles(page.state().queue, page.state().session));
    assert.equal(before.completed, 1);
    assert.equal(before.bytes, 300, 'only the completed item, by its own size');
    assert.equal(after.completed, before.completed);
    assert.equal(after.bytes, before.bytes);
    assert.equal(page.els['#uploadMetrics'].children['[data-metric="completed"] .metric-value'].textContent, '1');
  });

  test('no tile caption claims a time scope that no source provides', () => {
    const tiles = UPLOADS_SRC.slice(UPLOADS_SRC.indexOf('const TILES'), UPLOADS_SRC.indexOf('let metricWrap'));
    assert.doesNotMatch(tiles + UPLOADS_HTML, /\btoday\b|this week|last 24 hours|yesterday/i);
    assert.match(tiles, /since this page opened/, 'the session-scoped tiles say so');
  });
});

describe('global progress reflects only accounted work', () => {
  test('a failed item is excluded from both sides of the fraction, and counted', () => {
    const { pure } = loadUploads();
    const g = pure.computeGlobalProgress([
      { status: 'done', size: 100, uploaded: 100 },
      { status: 'failed', size: 100, uploaded: 50 },
    ]);
    assert.equal(g.pct, 100);
    assert.equal(g.failed, 1);
    assert.equal(g.totalBytes, 100);
  });

  test('the bar shows the failed count beside it', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile('a', 10), fakeFile('b', 10)]);
    page.calls.upload[0].resolve({ data: { path: '/a', size: 10 } });
    page.calls.upload[1].reject(httpError(500, 'Upload could not be saved.'));
    await settleAll();
    assert.match(page.els['#queueGlobal'].innerHTML, /1 failed, not counted/);
    assert.match(page.els['#queueGlobal'].innerHTML, /100%/);
  });

  test('an empty queue reports no progress and hides the region', async () => {
    const page = await booted();
    assert.equal(page.pure.computeGlobalProgress([]), null);
    assert.equal(page.els['#queueGlobal'].style.display, 'none');
  });

  test('an unmeasured speed gives no overall estimate', () => {
    const { pure } = loadUploads();
    assert.equal(pure.computeGlobalProgress([{ status: 'uploading', size: 10, uploaded: 1, speed: 0 }]).eta, null);
  });
});

describe('retry, pause and bulk actions', () => {
  test('retry resets progress, clears the reason and enqueues exactly once', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile('a', 10)]);
    page.calls.upload[0].onProgress(6, 12);
    page.calls.upload[0].reject(httpError(500, 'boom'));
    await settleAll();
    const item = page.state().queue[0];
    page.c.retryItem(item.id);
    page.c.retryItem(item.id); // a second retry of an already-retried item is a no-op
    assert.equal(page.state().queue.length, 1);
    assert.equal(item.uploaded, 0);
    assert.equal(item.error, null);
    assert.equal(page.calls.upload.length, 2, 'one new transfer, not two');
  });

  test('bulk retry touches only failed items', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile('a', 10), fakeFile('b', 10), fakeFile('c', 10)]);
    page.calls.upload[0].resolve({ data: { path: '/a', size: 10 } });
    page.calls.upload[1].reject(httpError(500, 'x'));
    await settleAll();
    page.c.retryAllFailed();
    const statuses = page.state().queue.map(q => q.status);
    assert.deepEqual(plain(statuses), ['done', 'uploading', 'uploading']);
  });

  test('pause aborts, zeroes progress, and resume restarts from the beginning', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile('a', 1000)]);
    const item = page.state().queue[0];
    page.calls.upload[0].onProgress(600, 1200);
    page.c.pauseItem(item.id);
    await settleAll();
    assert.equal(page.calls.upload[0].aborted, true);
    assert.equal(item.status, 'paused');
    assert.equal(item.uploaded, 0);
    page.c.resumeItem(item.id);
    assert.equal(item.status, 'uploading');
    assert.equal(page.calls.upload.length, 2);
  });

  test('pause all affects only uploading items; resume all only paused ones', async () => {
    const page = await booted();
    page.c.applyPreset('sequential');
    page.c.addFiles([fakeFile('a', 10), fakeFile('b', 10)]);
    page.c.pauseAll();
    await settleAll();
    // The freed slot lets the queued item start; the queued one was not paused.
    assert.deepEqual(plain(page.state().queue.map(q => q.status)), ['paused', 'uploading']);
    page.c.resumeAll();
    assert.deepEqual(plain(page.state().queue.map(q => q.status)), ['queued', 'uploading']);
  });

  test('bulk actions on an empty queue do nothing', async () => {
    const page = await booted();
    page.c.pauseAll(); page.c.resumeAll(); page.c.retryAllFailed(); page.c.clearCompleted(); page.c.startQueued();
    await page.c.cancelAll();
    assert.equal(page.modal.confirms, 0, 'no confirmation for nothing');
    assert.equal(page.calls.upload.length, 0);
    assert.equal(page.toasts.length, 0);
  });

  test('cancel all confirms, states the consequence, and keeps completed files', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile('a', 10), fakeFile('b', 10), fakeFile('c', 10), fakeFile('d', 10)]);
    page.calls.upload[0].resolve({ data: { path: '/a', size: 10 } });
    await settleAll();
    await page.c.cancelAll();
    const msg = page.modal.lastConfirm.message;
    assert.match(msg, /in progress will be stopped/);
    assert.match(msg, /partial data/);
    assert.match(msg, /1 completed file stays on the server/);
    assert.deepEqual(plain(page.state().queue.map(q => q.status)), ['done']);
    assert.ok(page.calls.upload.slice(1).every(u => u.aborted));
  });

  test('dead metrics state and the unused helper are gone', () => {
    for (const dead of ['totalFiles', 'totalUploaded', 'bytesUploaded', 'randBetween', 'bindQueueActions']) {
      assert.ok(!UPLOADS_SRC.includes(dead), `${dead} removed`);
    }
  });
});

/* ══════════════════════════════════════════
   PHASE 4 — rendering cost
   ══════════════════════════════════════════ */

describe('rendering cost does not scale with the queue', () => {
  test('a state change rewrites only that row', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile('a', 10), fakeFile('b', 10)]);
    const [first] = page.state().queue;
    const row = page.mountRow(first.id);
    const listWrites = page.els['#queueList'].htmlWrites;
    page.calls.upload[0].resolve({ data: { path: '/a', size: 10 } });
    await settleAll();
    assert.equal(page.els['#queueList'].htmlWrites, listWrites, 'the list was not re-rendered');
    assert.ok(row.outerWrites >= 1);
    assert.match(row.outer, /Complete/);
  });

  test('one delegated listener serves every row, and resolves a click on the icon', async () => {
    const page = await booted();
    page.c.addFiles(Array.from({ length: 50 }, (_, i) => fakeFile(`f${i}`, 10)));
    assert.equal((page.els['#queueList'].listeners.click || []).length, 1);
    assert.doesNotMatch(UPLOADS_SRC, /\.onclick\s*=/);
    const target = page.state().queue[10];
    // The event target is the <svg> inside the button: closest() finds the button.
    page.c.onQueueClick({ target: clickTarget({ 'data-act': 'cancel', 'data-id': target.id }) });
    assert.equal(page.state().queue.length, 49);
    assert.ok(!page.state().queue.includes(target));
  });

  test('the interval update keeps the summary nodes and changes only their values', async () => {
    const page = await booted();
    const wrap = page.els['#uploadMetrics'];
    const node = wrap.children['[data-metric="active"] .metric-value'];
    const writes = wrap.htmlWrites;
    page.c.addFiles([fakeFile('a', 10)]);
    page.c.tick();
    page.c.tick();
    assert.equal(wrap.htmlWrites, writes, 'the tiles were not rebuilt');
    assert.equal(node.textContent, '1');
    assert.equal(wrap.children['[data-metric="active"] .metric-value'], node, 'same node object');
  });

  test('a burst of completions produces one consolidated toast', async () => {
    const page = await booted();
    page.c.applyPreset('fast');
    page.toasts.length = 0;
    page.c.addFiles(Array.from({ length: 8 }, (_, i) => fakeFile(`f${i}`, 10)));
    page.calls.upload.forEach((u, i) => u.resolve({ data: { path: `/f${i}`, size: 10 } }));
    await settleAll();
    page.flushTimers();
    const done = page.toasts.filter(t => t.type === 'success' && /complete/.test(t.t));
    assert.equal(done.length, 1);
    assert.equal(done[0].t, '8 uploads complete');
  });

  test('the shared toast stack is capped', () => {
    assert.match(APP_SRC, /const MAX_VISIBLE = \d+;/);
  });

  test('a several-hundred-item queue stays operable', async () => {
    const page = await booted();
    const started = Date.now();
    page.c.addFiles(Array.from({ length: 400 }, (_, i) => fakeFile(`f${i}`, 10)));
    page.c.pauseAll();
    page.c.onQueueClick({ target: clickTarget({ 'data-act': 'cancel', 'data-id': page.state().queue[200].id }) });
    page.c.clearCompleted();
    await settleAll();
    assert.equal(page.state().queue.length, 399);
    assert.ok(Date.now() - started < 2000, 'add, pause, cancel and clear stay fast');
  });
});

/* ══════════════════════════════════════════
   PHASE 5 — honesty
   ══════════════════════════════════════════ */

describe('the page claims only what exists', () => {
  test('no hardcoded recent-uploads list and no unimplemented capability claim', () => {
    for (const fabricated of ['launch-video.mp4', 'brand-kit.zip', 'podcast-episode-14.mp3']) {
      assert.ok(!UPLOADS_SRC.includes(fabricated), `${fabricated} removed`);
    }
    const claims = [
      /checksum/i, /\bCDN\b/, /points-of-presence/i, /encrypt/i, /auto-retry/i, /automatic retries/i,
      /resume automatically/i, /last checkpoint/i, /40%/, /dedup/i, /compress/i, /from all admins/i,
      /Max 5 GB/i, /structure is preserved/i, /\/releases\/2025/, /Optimize Storage/, /Secure Upload/,
    ];
    for (const re of claims) {
      assert.doesNotMatch(UPLOADS_HTML, re, `uploads.html: ${re}`);
      assert.doesNotMatch(UPLOADS_SRC, re, `uploads.js: ${re}`);
    }
  });

  test('the client no longer enforces a size cap the server may not share', () => {
    assert.doesNotMatch(UPLOADS_SRC, /5 \* 1024 \* 1024 \* 1024|MAX_SIZE/);
  });

  test('recent uploads come from recorded activity, filtered to uploads', async () => {
    const page = await booted({
      routes: {
        '/dashboard/summary': {
          activities: [
            { type: 'upload', user: 'system', action: 'uploaded', target: HOSTILE, folder: '/media', time: Date.now() - 60000 },
            { type: 'folder', user: 'system', action: 'created folder', target: 'x', folder: '/', time: Date.now() },
          ],
        },
      },
    });
    const out = page.els['#recentUploads'].innerHTML;
    assert.equal((out.match(/recent-card/g) || []).length, 1);
    assert.match(out, /in \/media/);
    assert.doesNotMatch(out, /<img/);
    assert.doesNotMatch(out, /\d+(\.\d+)? (B|KB|MB|GB)/, 'an activity has no size, so none is shown');
  });

  test('an empty and an unreachable source render differently', async () => {
    const empty = await booted();
    assert.match(empty.els['#recentUploads'].innerHTML, /data-recent-empty/);
    const down = await booted({ routes: { '/dashboard/summary': httpError(500, 'Service unavailable') } });
    const out = down.els['#recentUploads'].innerHTML;
    assert.match(out, /data-recent-error/);
    assert.match(out, /Service unavailable/);
    assert.doesNotMatch(out, /data-recent-empty/);
    assert.match(out, /data-recent-retry/);
  });

  test('preset tags are derived from the setting the preset applies', async () => {
    const page = await booted();
    for (const p of page.Uploads.presets) {
      assert.deepEqual(plain(page.pure.presetTags(p)), [`${p.concurrency} parallel`]);
      page.c.applyPreset(p.key);
      assert.equal(page.state().concurrency, p.concurrency);
    }
    assert.doesNotMatch(page.els['#presetGrid'].innerHTML, /compress|encrypt|dedupe|verified/i);
  });

  test('the preset marked active on load is the one in effect', async () => {
    const page = await booted();
    const active = page.Uploads.presets.find(p => p.key === page.Uploads.DEFAULT_PRESET);
    assert.equal(page.state().concurrency, active.concurrency);
    assert.match(page.els['#presetGrid'].innerHTML, new RegExp(`is-active" data-preset="${active.key}" aria-pressed="true"`));
    assert.equal(page.els['#concurrencyValue'].textContent, `${active.concurrency} parallel transfers`);
  });

  test('no placeholder destination is in the markup; the first render shows the real one', async () => {
    assert.match(UPLOADS_HTML, /<span class="dest-path" id="destPath"><\/span>/);
    const page = await booted();
    assert.match(page.els['#destPath'].innerHTML, /<span class="dest-path-text">\/<\/span>/);
  });

  test('the tips name presets that exist', () => {
    const tips = UPLOADS_HTML.slice(UPLOADS_HTML.indexOf('How uploads behave'));
    const { Uploads } = loadUploads();
    for (const [, name] of tips.matchAll(/"([^"]+)" \(\d+ parallel\)|or "([^"]+)"/g)) {
      if (name) assert.ok(Uploads.presets.some(p => p.name === name), `${name} is a preset`);
    }
    assert.match(tips, /"Fast" \(8 parallel\)/);
    assert.ok(Uploads.presets.some(p => p.name === 'Fast' && p.concurrency === 8));
    assert.ok(Uploads.presets.some(p => p.name === 'One at a time'));
  });
});

/* ══════════════════════════════════════════
   PHASE 6 — interaction
   ══════════════════════════════════════════ */

describe('option controls are well formed', () => {
  test('no label nests another label', () => {
    for (const [, inner] of UPLOADS_HTML.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)) {
      assert.doesNotMatch(inner, /<label\b/);
    }
  });

  test('each option input sits in exactly one label, with its visible text', () => {
    const options = [...UPLOADS_HTML.matchAll(/<label class="dest-opt">([\s\S]*?)<\/label>/g)].map(m => m[1]);
    assert.equal(options.length, 2);
    for (const inner of options) {
      assert.equal((inner.match(/data-option=/g) || []).length, 1);
      assert.match(inner, /<span>[A-Z][^<]+<\/span>/, 'visible text inside the same label');
    }
  });

  test('only options with real behaviour are presented', () => {
    const presented = [...UPLOADS_HTML.matchAll(/data-option="([^"]+)"/g)].map(m => m[1]).sort();
    const { Uploads } = loadUploads();
    assert.deepEqual(presented, Object.keys(Uploads.DEFAULT_OPTIONS).sort());
    assert.ok(!presented.includes('preservePath'), 'the server ignores preservePath, so it is not offered');
  });

  test('the request carries destination and overwrite before the file, and nothing unbacked', async () => {
    const page = await booted();
    page.state().options.overwrite = true;
    page.c.addFiles([fakeFile('a', 10)]);
    const form = page.calls.upload[0].form;
    assert.deepEqual(plain(form.keys()), ['destination', 'overwrite', 'file']);
    assert.equal(form.get('overwrite'), 'true');
    assert.equal(form.get('destination'), '/');
  });

  test('an option toggle is read from its checked state', async () => {
    const input = new FakeEl(null, 'opt');
    input.attrs['data-option'] = 'overwrite';
    const page = await booted({ optionInputs: [input] });
    assert.equal(input.checked, false);
    input.checked = true;
    input.dispatch('change', {});
    assert.equal(page.state().options.overwrite, true);
  });
});

describe('the dropzone is operable by keyboard', () => {
  test('Enter and Space on the zone open the picker; Space does not scroll', async () => {
    const page = await booted();
    const dz = page.els['#dropzone'];
    const enter = keyEvent('Enter', dz);
    dz.dispatch('keydown', enter);
    const space = keyEvent(' ', dz);
    dz.dispatch('keydown', space);
    assert.equal(page.els['#fileInput'].clicks, 2);
    assert.equal(space.defaultPrevented, true);
  });

  test('activating a control inside the zone does not also trigger the zone', async () => {
    const page = await booted();
    const dz = page.els['#dropzone'];
    dz.dispatch('keydown', keyEvent('Enter', page.els['#browseFolder']));
    assert.equal(page.els['#fileInput'].clicks, 0);
    dz.dispatch('click', { target: { closest: sel => (sel.includes('button') ? {} : null) } });
    assert.equal(page.els['#fileInput'].clicks, 0);
  });

  test('the dropzone is not a button containing buttons', () => {
    const tag = UPLOADS_HTML.match(/<div class="dropzone"[^>]*>/)[0];
    assert.doesNotMatch(tag, /role="button"/);
    assert.match(tag, /tabindex="0"/);
    assert.match(tag, /aria-describedby="dzDesc"/);
    assert.match(UPLOADS_CSS, /\.dropzone:focus-visible/);
  });
});

describe('page-wide drop', () => {
  const dropEvent = (types, files) => ({
    dataTransfer: { types, files, items: [] },
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  });

  test('files dropped anywhere enter the queue and the drop is confirmed', async () => {
    const page = await booted();
    const ev = dropEvent(['Files'], [fakeFile('a', 1), fakeFile('b', 1)]);
    await page.c.onDrop(ev);
    assert.equal(ev.defaultPrevented, true, 'the browser does not navigate to the file');
    assert.equal(page.state().queue.length, 2);
    assert.ok(page.toasts.some(t => /2 files added/.test(t.t)));
  });

  test('a non-file payload adds nothing and does not navigate', async () => {
    const page = await booted();
    const ev = dropEvent(['text/plain'], []);
    await page.c.onDrop(ev);
    assert.equal(ev.defaultPrevented, true);
    assert.equal(page.state().queue.length, 0);
  });

  test('the copy promises the drop route that works', () => {
    assert.match(UPLOADS_HTML, /dropped anywhere on this page/);
    assert.match(UPLOADS_SRC, /Drop files anywhere on this page/);
  });

  test('the highlight counter survives child crossings and never goes negative', () => {
    const { pure } = loadUploads();
    const d = pure.createDragState();
    assert.equal(d.enter(true), true);
    assert.equal(d.enter(true), true);          // into a child
    assert.equal(d.leave(true), true);          // out of the parent, still inside
    assert.equal(d.leave(false), false);        // left the window
    assert.equal(d.leave(true), false);         // stray leave: clamps at zero
    assert.equal(d.leave(true), false);
    assert.equal(d.enter(false), false);        // a drag with no files
    assert.equal(d.enter(true), true);
    assert.equal(d.reset(), false);
  });

  test('the window handlers are wired with the relatedTarget guard', async () => {
    const page = await booted();
    for (const type of ['dragenter', 'dragover', 'dragleave', 'drop', 'dragend']) {
      assert.equal((page.sandbox.listeners[type] || []).length, 1, type);
    }
    const files = { dataTransfer: { types: ['Files'] } };
    page.c.onDragEnter(files);
    page.c.onDragEnter(files);
    page.c.onDragLeave({ relatedTarget: {} });
    assert.ok(page.els['#dropzone'].classes.has('is-dragover'), 'crossing a child keeps the highlight');
    page.c.onDragLeave({ relatedTarget: null });
    assert.ok(!page.els['#dropzone'].classes.has('is-dragover'));
  });
});

describe('destination selection', () => {
  test('typed paths: OS paths, relative paths and traversal are rejected; others normalised', () => {
    const { pure } = loadUploads();
    for (const bad of ['C:\\data', 'D:/x', '\\\\server\\share', 'media', '/a/../b', '/./a', '']) {
      assert.equal(pure.normalizeDestination(bad).ok, false, bad);
    }
    assert.equal(pure.normalizeDestination('C:\\data').reason, 'os-path');
    assert.equal(pure.normalizeDestination(' /media//photos/ ').path, '/media/photos');
    assert.equal(pure.normalizeDestination('/').path, '/');
  });

  test('a rejected path is neither echoed into markup nor made current', async () => {
    const page = await booted();
    const before = page.els['#destPath'].innerHTML;
    assert.equal(await page.c.applyDestination('C:\\<b>evil</b>'), false);
    assert.equal(page.state().destination, '/');
    assert.equal(page.els['#destPath'].innerHTML, before);
    assert.match(page.els['#destMsg'].textContent, /operating-system path/);
  });

  test('the folder list comes from the tree, and its depth bound is stated', async () => {
    const page = await booted();
    page.els['#destPicker'].hidden = true;
    page.els['#changeDestination'].dispatch('click', {});
    await settleAll();
    const options = page.els['#destSelect'].innerHTML;
    assert.match(options, /value="\/media\/photos"/);
    assert.match(page.els['#destTreeNote'].textContent, /two levels/);
    assert.equal(page.els['#changeDestination'].getAttribute('aria-expanded'), 'true');
  });

  test('a missing destination is reported specifically and creation is offered', async () => {
    const page = await booted({ routes: { '/fs/list?path=%2Fnew': httpError(404, 'Item not found: /new') } });
    assert.equal(await page.c.applyDestination('/new'), false);
    assert.equal(page.state().destination, '/');
    assert.match(page.els['#destMsg'].textContent, /does not exist/);
    assert.equal(page.els['#createDestination'].hidden, false);
  });

  test('"does not exist" and "cannot be written to" are distinct messages', async () => {
    const page = await booted({
      routes: {
        '/fs/list?path=%2Fgone': httpError(404, 'Item not found: /gone'),
        '/fs/list?path=%2Flocked': httpError(403, 'Permission denied to read directory.'),
      },
    });
    await page.c.applyDestination('/gone');
    const missing = page.els['#destMsg'].textContent;
    await page.c.applyDestination('/locked');
    const denied = page.els['#destMsg'].textContent;
    assert.match(missing, /does not exist/);
    assert.match(denied, /cannot be written to/);
  });

  test('creating the destination uses POST /api/fs/folder and makes it current', async () => {
    let created = false;
    const page = await booted({
      routes: { '/fs/list?path=%2Fnew': () => (created ? { items: [] } : httpError(404, 'Item not found: /new')) },
    });
    await page.c.applyDestination('/new');
    created = true;
    assert.equal(await page.c.createAndUseDestination('/new'), true);
    assert.deepEqual(plain(page.calls.post.map(p => [p.url, p.body])), [['/fs/folder', { path: '/new' }]]);
    assert.equal(page.state().destination, '/new');
    assert.match(page.els['#destPath'].innerHTML, /\/new/);
  });

  test('a failed creation is reported and the destination is unchanged', async () => {
    const page = await booted({
      routes: {
        '/fs/list?path=%2Fa%2Fb': httpError(404, 'Item not found: /a/b'),
        'POST /fs/folder': httpError(404, 'Parent directory does not exist.'),
      },
    });
    assert.equal(await page.c.createAndUseDestination('/a/b'), false);
    assert.equal(page.state().destination, '/');
    assert.match(page.els['#destMsg'].textContent, /could not be created: Parent directory does not exist/);
  });

  test('an unusable destination is reported once and nothing is sent', async () => {
    const page = await booted({ routes: { '/fs/list?path=%2Fgone': httpError(404, 'Item not found: /gone') } });
    page.state().destination = '/gone'; // e.g. deleted elsewhere since it was chosen
    page.c.addFiles([fakeFile('a', 1), fakeFile('b', 1), fakeFile('c', 1)]);
    await settleAll();
    assert.equal(page.calls.upload.length, 0, 'no transfer started');
    assert.deepEqual(plain(page.state().queue.map(q => q.status)), ['held', 'held', 'held']);
    assert.equal(page.state().queue.filter(q => q.status === 'failed').length, 0, 'no identical failure per file');
    const notice = page.els['#queueNotice'];
    assert.equal(notice.hidden, false);
    assert.equal((notice.innerHTML.match(/queue-notice-row/g) || []).length, 1);
    assert.match(notice.innerHTML, /3 uploads on hold/);
    assert.match(notice.innerHTML, /data-notice-act="create"/);
  });

  test('a destination that disappears mid-queue fails one item and holds the rest', async () => {
    let gone = false;
    const page = await booted({
      routes: { '/fs/list?path=%2Fdocs': () => (gone ? httpError(404, 'Item not found: /docs') : { items: [] }) },
    });
    page.c.applyPreset('sequential');
    await page.c.applyDestination('/docs');
    page.c.addFiles([fakeFile('a', 1), fakeFile('b', 1), fakeFile('c', 1)]);
    await settleAll();
    assert.equal(page.calls.upload.length, 1);
    gone = true;
    page.calls.upload[0].reject(httpError(400, 'Upload destination does not exist.'));
    await settleAll();
    const [a, b, c] = page.state().queue;
    assert.equal(a.status, 'failed');
    assert.equal(a.errorKind, 'destination');
    assert.match(a.error, /does not exist/);
    assert.deepEqual([b.status, c.status], ['held', 'held']);
    assert.equal(page.calls.upload.length, 1, 'the rest were not retried blindly');
  });

  test('queued items keep the destination they were queued against', async () => {
    const page = await booted();
    page.c.applyPreset('sequential');
    page.c.addFiles([fakeFile('a', 1), fakeFile('b', 1)]);
    await page.c.applyDestination('/media');
    page.calls.upload[0].resolve({ data: { path: '/a', size: 1 } });
    await settleAll();
    assert.equal(page.calls.upload[1].form.get('destination'), '/');
    assert.match(page.pure.renderItemHTML(page.state().queue[1]), /to <span class="qi-dest">\/<\/span>/);
  });

  test('lowering concurrency aborts nothing and starts nothing until within the limit', async () => {
    const page = await booted();
    page.c.addFiles([fakeFile('a', 1), fakeFile('b', 1), fakeFile('c', 1), fakeFile('d', 1)]);
    assert.equal(page.calls.upload.length, 3);
    page.c.applyPreset('sequential');
    assert.ok(page.calls.upload.every(u => !u.aborted));
    page.calls.upload[0].resolve({ data: { path: '/a', size: 1 } });
    await settleAll();
    assert.equal(page.calls.upload.length, 3, 'two still in flight: no new start');
    page.calls.upload[1].resolve({ data: { path: '/b', size: 1 } });
    page.calls.upload[2].resolve({ data: { path: '/c', size: 1 } });
    await settleAll();
    assert.equal(page.calls.upload.length, 4);
  });

  test('with auto-start off, files wait until Start queued', async () => {
    const page = await booted();
    page.state().options.autoStart = false;
    page.state().running = false;
    page.c.addFiles([fakeFile('a', 1)]);
    await settleAll();
    assert.equal(page.calls.upload.length, 0);
    page.c.startQueued();
    assert.equal(page.calls.upload.length, 1);
  });
});

/* ══════════════════════════════════════════
   PHASE 7 — accessibility
   ══════════════════════════════════════════ */

describe('accessibility', () => {
  test('every icon-only row control is named, and the name follows its meaning', () => {
    const { pure } = loadUploads();
    const base = { id: 'u', name: 'a.txt', size: 10, uploaded: 0, destination: '/' };
    for (const status of ['queued', 'uploading', 'paused', 'held', 'done', 'failed']) {
      const out = pure.renderItemHTML({ ...base, status });
      const buttons = out.match(/<button[^>]*>/g) || [];
      assert.ok(buttons.length >= 1, `${status}: a control resolves the row`);
      for (const b of buttons) assert.match(b, /aria-label="[^"]+: a\.txt"/, `${status}: ${b}`);
    }
    assert.match(pure.renderItemHTML({ ...base, status: 'paused' }), /aria-label="Resume: a\.txt"/);
    assert.doesNotMatch(pure.renderItemHTML({ ...base, status: 'paused' }), /aria-label="Pause/);
  });

  test('tooltips appear on keyboard focus too', () => {
    assert.match(COMPONENTS_CSS, /\[data-tip\]:focus-visible::after/);
  });

  test('every button on the page has an accessible name', () => {
    for (const m of UPLOADS_HTML.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
      const [, attrs, inner] = m;
      if (/\bhidden\b/.test(attrs) && /id="createDestination"/.test(attrs)) continue; // named by uploads.js when shown
      const text = inner.replace(/<[^>]+>/g, '').trim();
      assert.ok(text || /aria-label="[^"]+"/.test(attrs), `unnamed button: ${attrs}`);
    }
  });

  test('queue state is announced through a throttled live region, and rows are marked busy', async () => {
    assert.match(UPLOADS_HTML, /id="queueAnnounce" role="status" aria-live="polite"/);
    const page = await booted();
    page.flushTimers(); // the throttle window opened by the initial announcement
    page.c.addFiles([fakeFile('a', 1000)]);
    assert.equal(page.els['#queueList'].getAttribute('aria-busy'), 'true');
    assert.match(page.els['#queueAnnounce'].textContent, /1 uploading/);
    page.calls.upload[0].resolve({ data: { path: '/a', size: 1000 } });
    await settleAll();
    assert.equal(page.els['#queueList'].getAttribute('aria-busy'), 'false');
    const { pure } = page;
    const counts = { uploading: 1, queued: 0, paused: 0, held: 0, done: 0, failed: 0, total: 1 };
    assert.equal(pure.buildAnnouncement(counts, { pct: 37, counted: 1 }), pure.buildAnnouncement(counts, { pct: 49, counted: 1 }),
      'intermediate percentages within a quarter do not re-announce');
  });

  test('a zero-byte file announces no NaN', () => {
    const { pure } = loadUploads();
    const queue = [{ status: 'uploading', size: 0, uploaded: 0, speed: 0 }];
    const text = pure.buildAnnouncement(pure.computeQueueCounts(queue), pure.computeGlobalProgress(queue));
    assert.doesNotMatch(text, /NaN|Infinity/);
  });

  test('hidden file inputs stay out of the accessibility tree', () => {
    for (const m of UPLOADS_HTML.matchAll(/<input type="file"[^>]*>/g)) {
      assert.match(m[0], /aria-hidden="true"/);
      assert.match(m[0], /class="dz-input"/);
    }
    assert.match(UPLOADS_CSS, /\.dz-input \{ display: none; \}/);
  });

  test('no rule hides row controls at narrow widths', () => {
    assert.doesNotMatch(UPLOADS_CSS, /keep-mobile/);
    assert.doesNotMatch(UPLOADS_SRC, /keep-mobile/);
    assert.doesNotMatch(UPLOADS_CSS, /\.qi-actions[^{]*\{[^}]*display:\s*none/);
  });

  test('one h1, and section headings descend without skipping a level', () => {
    const levels = [...UPLOADS_HTML.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
    assert.equal(levels.filter(l => l === 1).length, 1);
    assert.equal(levels[0], 1);
    for (let i = 1; i < levels.length; i++) {
      assert.ok(levels[i] <= levels[i - 1] + 1, `h${levels[i - 1]} → h${levels[i]} skips a level`);
    }
  });

  test('decorative icons in rows are hidden from assistive technology', () => {
    const { pure } = loadUploads();
    const out = pure.renderItemHTML({ id: 'u', name: 'a.txt', size: 10, uploaded: 0, status: 'queued', destination: '/' });
    for (const svg of out.match(/<svg[^>]*>/g) || []) assert.match(svg, /aria-hidden="true"/);
  });
});
