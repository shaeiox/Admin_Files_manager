// test/frontend/navigation.test.js
'use strict';

/**
 * Shell-level behaviour shared by the four pages:
 *
 *   - router.js: client-side navigation (which clicks it takes, which it leaves
 *     to the browser, and that any failure falls back to a full page load);
 *   - page-module teardown hooks the router depends on;
 *   - the shared context menu does not close on the click that opened it
 *     (the Files bulk-download menu used to vanish immediately);
 *   - Settings: no inline script racing app.js, and a missing settings endpoint
 *     is stated on the page instead of raised as an error;
 *   - tooltip placement variants for controls inside clipping containers.
 *
 * No DOM harness and no dependency: scripts run in a `vm` context against stubs.
 * The real swap (DOMParser, adoptNode, stylesheet loading) was verified in a
 * browser; here the parser stub returns nothing usable, which exercises the
 * fallback path.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const read = (...p) => fs.readFileSync(path.join(PUBLIC, ...p), 'utf8');
const APP_SRC = read('assets', 'js', 'app.js');
const ROUTER_SRC = read('assets', 'js', 'router.js');
const SETTINGS_SRC = read('assets', 'js', 'settings.js');
const COMPONENTS_CSS = read('assets', 'css', 'components.css');
const PAGES = {
  'index.html': { module: 'dashboard.js', global: 'Dashboard' },
  'files.html': { module: 'files.js', global: 'Files' },
  'uploads.html': { module: 'uploads.js', global: 'Uploads' },
  'settings.html': { module: 'settings.js', global: 'Settings' },
};

const settle = () => new Promise(r => setImmediate(r));
async function settleAll() { for (let i = 0; i < 6; i++) await settle(); }

/* ══════════════════════════════════════════
   ROUTER
   ══════════════════════════════════════════ */

function loadRouter(href = 'http://localhost:3000/index.html') {
  const listeners = {};
  const winListeners = {};
  const calls = { fetch: [], assign: [], push: [], replace: [] };
  const here = new URL(href);
  const sandbox = {
    URL,
    console: { warn() {}, error() {}, log() {} },
    location: {
      get href() { return here.href; },
      get origin() { return here.origin; },
      assign: (u) => calls.assign.push(String(u)),
    },
    history: {
      pushState: (s, t, u) => calls.push.push(u),
      replaceState: (s, t, u) => calls.replace.push(u),
    },
    document: {
      body: { children: [], dataset: { page: 'dashboard' } },
      documentElement: { classList: { add() {}, remove() {} } },
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    // Parses to nothing usable, so every navigation takes the fallback path.
    DOMParser: function () { this.parseFromString = () => ({ body: null, querySelector: () => null }); },
    fetch: (u) => {
      calls.fetch.push(u);
      return Promise.resolve({ ok: true, text: () => Promise.resolve('<html></html>') });
    },
    addEventListener: (type, fn) => { (winListeners[type] ||= []).push(fn); },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(ROUTER_SRC, sandbox, { filename: 'router.js' });

  return {
    Router: sandbox.Router,
    calls,
    setLocation(next) { here.href = new URL(next, here).href; },
    popstate() { (winListeners.popstate || []).forEach(fn => fn({})); },
    click(link, extra = {}) {
      const ev = Object.assign({
        button: 0, defaultPrevented: false,
        target: { closest: sel => (sel === 'a[href]' ? link : null) },
        preventDefault() { this.defaultPrevented = true; },
      }, extra);
      (listeners.click || []).forEach(fn => fn(ev));
      return ev;
    },
  };
}

function link(href, attrs = {}) {
  return {
    href: new URL(href, 'http://localhost:3000/index.html').href,
    target: attrs.target || '',
    hasAttribute: name => Object.prototype.hasOwnProperty.call(attrs, name),
  };
}

describe('router: which links it takes', () => {
  test('resolves the four pages by file name, the root as the dashboard, and nothing else', () => {
    const { Router } = loadRouter();
    assert.equal(Router.resolve('/files.html').file, 'files.html');
    assert.equal(Router.resolve('/').file, 'index.html');
    assert.equal(Router.resolve('settings.html?pane=security').file, 'settings.html');
    assert.equal(Router.resolve('/api/fs/list'), null);
    assert.equal(Router.resolve('/notes.txt'), null);
    assert.equal(Router.resolve('https://example.com/files.html'), null, 'never another origin');
  });

  test('a plain click on a page link is handled in place, and replaces the history entry on start', async () => {
    const page = loadRouter();
    assert.equal(page.calls.replace.length, 1, 'the initial entry is marked as routable');
    const ev = page.click(link('files.html'));
    assert.equal(ev.defaultPrevented, true, 'the browser does not reload');
    await settleAll();
    assert.deepEqual(page.calls.fetch, ['/files.html']);
  });

  test('anything the page cannot be swapped from falls back to a full load', async () => {
    const page = loadRouter();
    page.click(link('files.html?view=starred'));
    await settleAll();
    assert.deepEqual(page.calls.assign, ['http://localhost:3000/files.html?view=starred']);
    assert.equal(page.calls.push.length, 0, 'no history entry for a navigation that did not happen in place');
  });

  test('modified clicks, new-tab targets, downloads and other origins are left to the browser', async () => {
    const page = loadRouter();
    const left = [
      page.click(link('files.html'), { ctrlKey: true }),
      page.click(link('files.html'), { metaKey: true }),
      page.click(link('files.html'), { shiftKey: true }),
      page.click(link('files.html'), { button: 1 }),
      page.click(link('files.html', { target: '_blank' })),
      page.click(link('files.html', { download: '' })),
      page.click(link('https://example.com/files.html')),
      page.click(link('/api/fs/download?path=/a.txt')),
    ];
    await settleAll();
    assert.ok(left.every(ev => !ev.defaultPrevented));
    assert.equal(page.calls.fetch.length, 0);
  });

  test('the current view does nothing; a fragment on it is the browser\'s to scroll to', async () => {
    const page = loadRouter('http://localhost:3000/index.html');
    assert.equal(page.click(link('index.html')).defaultPrevented, true);
    assert.equal(page.click(link('index.html#serverHealth')).defaultPrevented, false);
    await settleAll();
    assert.equal(page.calls.fetch.length, 0);
  });

  test('back/forward re-route between pages but ignore fragment-only entries', async () => {
    const page = loadRouter('http://localhost:3000/index.html');
    page.setLocation('/index.html#serverHealth');
    page.popstate();
    await settleAll();
    assert.equal(page.calls.fetch.length, 0);
    page.setLocation('/uploads.html');
    page.popstate();
    await settleAll();
    assert.deepEqual(page.calls.fetch, ['/uploads.html']);
  });

  test('page HTML is fetched once and reused', async () => {
    const page = loadRouter();
    page.click(link('files.html'));
    await settleAll();
    page.click(link('files.html'));
    await settleAll();
    assert.equal(page.calls.fetch.length, 1);
  });
});

describe('router: the pages it swaps between', () => {
  for (const [file, { module, global }] of Object.entries(PAGES)) {
    test(`${file} loads router.js after sidebar.js and before ${module}`, () => {
      const srcs = [...read(file).matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
      const at = name => srcs.indexOf(`assets/js/${name}`);
      assert.ok(at('router.js') > at('sidebar.js'), 'after the persistent chrome');
      assert.ok(at('router.js') < at(module), 'before the page module');
    });

    test(`${module} registers window.${global} with init and destroy`, () => {
      const src = read('assets', 'js', module);
      assert.match(src, new RegExp(`window\\.${global} = ${global};`));
      assert.match(src, /function destroy\(\)/, 'teardown for client-side navigation');
      assert.match(src, /return \{[\s\S]*?\binit,[\s\S]*?\bdestroy\b/);
    });
  }

  test('every page module the router names is one of the four pages', () => {
    for (const { global } of Object.values(PAGES)) assert.match(ROUTER_SRC, new RegExp(`'${global}'`));
  });

  test('swapping snapshots node lists before adopting them (adoptNode shrinks a live list)', () => {
    assert.match(ROUTER_SRC, /const incoming = Array\.from\(next\.childNodes\);/);
    assert.doesNotMatch(ROUTER_SRC, /Array\.from\([^)]*childNodes,\s*n => document\.adoptNode/);
  });
});


/* ══════════════════════════════════════════
   CONTEXT MENU — the opening click must not close it
   ══════════════════════════════════════════ */

function makeEl() {
  const classes = new Set();
  return {
    classes,
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c), toggle() {} },
    style: {},
    hidden: false,
    textContent: '',
    innerHTML: '',
    setAttribute() {},
    addEventListener() {},
    appendChild() {},
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 100, height: 60 }),
  };
}

function loadApp() {
  const docListeners = {};
  const created = [];
  let now = 0;
  const sandbox = {
    console: { warn() {}, error() {}, log() {} },
    performance: { now: () => now },
    innerWidth: 1200,
    innerHeight: 800,
    addEventListener() {},
    document: {
      body: { appendChild() {} },
      createElement: () => { const el = makeEl(); created.push(el); return el; },
      addEventListener: (type, fn) => { (docListeners[type] ||= []).push(fn); },
      querySelector: () => null,
      querySelectorAll: () => [],
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(APP_SRC, sandbox, { filename: 'app.js' });
  return {
    ContextMenu: sandbox.AFM.ContextMenu,
    menu: () => created[created.length - 1],
    setNow(t) { now = t; },
    documentClick(timeStamp) { (docListeners.click || []).forEach(fn => fn({ timeStamp, target: {} })); },
  };
}

describe('the shared context menu', () => {
  test('the click that opened the menu does not close it; a later click does', () => {
    const app = loadApp();
    app.setNow(1000);
    app.ContextMenu.show(10, 10, [{ label: 'Download as ZIP', action() {} }]);
    const menu = app.menu();
    assert.ok(menu.classes.has('is-open'));
    // The opening click was created before show() ran, so its timeStamp is earlier.
    app.documentClick(999);
    assert.ok(menu.classes.has('is-open'), 'still open after its own opening click');
    app.documentClick(1500);
    assert.ok(!menu.classes.has('is-open'), 'an outside click afterwards closes it');
  });

  test('reopening re-arms the guard', () => {
    const app = loadApp();
    app.setNow(10);
    app.ContextMenu.show(0, 0, [{ label: 'a', action() {} }]);
    app.documentClick(20);
    app.setNow(30);
    app.ContextMenu.show(0, 0, [{ label: 'b', action() {} }]);
    app.documentClick(29);
    assert.ok(app.menu().classes.has('is-open'));
  });
});

/* ══════════════════════════════════════════
   SETTINGS
   ══════════════════════════════════════════ */

const SETTINGS_HTML = read('settings.html');

function loadSettings(apiGet) {
  const els = {};
  const el = sel => {
    if (!els[sel]) {
      const node = makeEl();
      node.listeners = {};
      node.addEventListener = (t, fn) => { (node.listeners[t] ||= []).push(fn); };
      els[sel] = node;
    }
    return els[sel];
  };
  ['#settingsNotice', '#saveChanges', '#discardChanges', '#saveBar'].forEach(el);
  els['#settingsNotice'].hidden = true;
  const toasts = [];
  const calls = { get: [], put: [], post: [] };
  const sandbox = {
    console: { warn() {}, error() {}, log() {} },
    URLSearchParams,
    location: { search: '' },
    innerWidth: 1200,
    addEventListener() {},
    removeEventListener() {},
    document: {
      body: { dataset: { page: 'settings' } },
      addEventListener() {},
      removeEventListener() {},
      querySelector: () => null,
      querySelectorAll: () => [],
    },
  };
  sandbox.window = sandbox;
  sandbox.AFM = {
    $: sel => els[sel] || null,
    $$: () => [],
    Toast: {
      success: (t, m) => toasts.push({ type: 'success', t, m }),
      info: (t, m) => toasts.push({ type: 'info', t, m }),
      error: (t, m) => toasts.push({ type: 'error', t, m }),
    },
    Modal: { confirm: async () => true },
  };
  sandbox.API = {
    get: (u, opts) => { calls.get.push({ u, opts }); return apiGet(u); },
    put: (u) => { calls.put.push(u); return Promise.resolve({}); },
    post: (u) => { calls.post.push(u); return Promise.resolve({}); },
  };
  vm.createContext(sandbox);
  vm.runInContext(SETTINGS_SRC, sandbox, { filename: 'settings.js' });
  return { Settings: sandbox.Settings, els, toasts, calls };
}

const notFound = () => Promise.reject(Object.assign(new Error('API endpoint not found'), { status: 404 }));

describe('settings page', () => {
  test('no inline script: everything runs from settings.js after app.js has loaded', () => {
    const inline = [...SETTINGS_HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)];
    assert.equal(inline.length, 0, 'an inline script runs before the deferred app.js defines window.AFM');
  });

  test('a missing settings endpoint is stated on the page, not raised as an error', async () => {
    const page = loadSettings(notFound);
    page.Settings.init();
    await settleAll();
    assert.equal(page.calls.get[0].u, '/settings');
    assert.equal(page.calls.get[0].opts.silent, true, 'no generic error toast from api.js');
    assert.equal(page.els['#settingsNotice'].hidden, false);
    assert.equal(page.toasts.filter(t => t.type === 'error').length, 0);
  });

  test('without a settings store, Save explains instead of claiming success', async () => {
    const page = loadSettings(notFound);
    page.Settings.init();
    await settleAll();
    (page.els['#saveChanges'].listeners.click || []).forEach(fn => fn({}));
    await settleAll();
    assert.equal(page.calls.put.length, 0, 'no request to an endpoint known to be missing');
    assert.ok(page.toasts.some(t => t.type === 'info' && /cannot be saved/.test(t.m)));
    assert.ok(!page.toasts.some(t => t.type === 'success'));
  });

  test('any other load failure is reported', async () => {
    const page = loadSettings(() => Promise.reject(Object.assign(new Error('Service unavailable'), { status: 503 })));
    page.Settings.init();
    await settleAll();
    assert.ok(page.toasts.some(t => t.type === 'error' && /Service unavailable/.test(t.m)));
  });

  test('leaving with no edits needs no confirmation', async () => {
    const page = loadSettings(notFound);
    page.Settings.init();
    assert.equal(await page.Settings.beforeLeave(), true);
  });

  test('the notice ships hidden and states what is and is not stored', () => {
    const notice = SETTINGS_HTML.match(/<div class="settings-notice" id="settingsNotice"[^>]*>[\s\S]*?<\/div>/)[0];
    // The copy is wrapped across lines in the markup; compare it as one sentence.
    const words = notice.replace(/\s+/g, ' ');
    assert.match(notice, /\bhidden\b/);
    // Settings ARE stored server-side (GET/PUT /api/settings). The notice means
    // the store is unreachable, not that persistence does not exist — and the
    // theme is the one browser-local exception.
    assert.match(words, /normally stored on the server/);
    assert.match(words, /cannot be reached right now/);
    assert.match(words, /cannot be saved/);
    assert.match(words, /theme still applies/i);
    assert.doesNotMatch(SETTINGS_HTML, /not stored by the server/,
      'that claim is false now: the store exists, it is simply unreachable');
    assert.doesNotMatch(SETTINGS_HTML, /Changes\s+apply instantly/, 'no claim that edits take effect');
  });
});

/* ══════════════════════════════════════════
   TOOLTIPS INSIDE CLIPPING CONTAINERS
   ══════════════════════════════════════════ */

describe('tooltip placement', () => {
  test('a left and a bottom placement exist alongside the default', () => {
    assert.match(COMPONENTS_CSS, /\[data-tip\]\[data-tip-pos="left"\]::after \{[^}]*right: calc\(100% \+ 8px\);/);
    assert.match(COMPONENTS_CSS, /\[data-tip\]\[data-tip-pos="bottom"\]::after \{[^}]*top: calc\(100% \+ 8px\);/);
  });

  test('the folder panel new-folder button opens its tooltip sideways, inside the scrolling panel', () => {
    assert.match(read('files.html'), /id="btnTreeNewFolder"[^>]*data-tip-pos="left"/);
  });
});
