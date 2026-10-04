// test/frontend/settings.test.js
'use strict';

/**
 * Settings page: markup ⇆ module contract, and the honesty pass
 * (openspec change settings-page-correctness, tasks 3.1 / 4.4).
 *
 * Two layers:
 *
 *   1. Source-level cross-assertions. The control names in settings.html and
 *      the keys settings.js hydrates/extracts must be the SAME set in BOTH
 *      directions: a name the module does not read can never be saved, and a key
 *      the module sends with no control behind it is a value the operator can
 *      never see. Either drift is a silent failure, so it is asserted here.
 *
 *   2. Behaviour, in a `vm` against a small DOM stub: save gating on store
 *      reachability, truthful discard, dirty rules, teardown, and the module's
 *      non-interference with the delegated theme picker.
 *
 * The module writes no markup at all (no innerHTML, no interpolation outside a
 * selector), which is asserted in source and re-checked by hydrating a
 * markup-significant settings value: it must stay a value.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT_DIR, ...p), 'utf8');
const SETTINGS_HTML = read('public', 'settings.html');
const SETTINGS_JS = read('public', 'assets', 'js', 'settings.js');

const settle = () => new Promise(r => setImmediate(r));
async function settleAll() { for (let i = 0; i < 6; i++) await settle(); }

/** settings.html as a browser would render it: comments are never rendered. */
const RENDERED_HTML = SETTINGS_HTML.replace(/<!--[\s\S]*?-->/g, '');

const DEFAULT_DOC = {
  general: { workspaceName: null, defaultUploadFolder: null },
  appearance: { defaultView: null },
};
const LOADED_DOC = {
  general: { workspaceName: 'Ops', defaultUploadFolder: '/media' },
  appearance: { defaultView: 'grid' },
};

const notFound = () => Promise.reject(Object.assign(new Error('API endpoint not found'), { status: 404 }));

/* ══════════════════════════════════════════
   SOURCE-LEVEL CROSS-ASSERTIONS
   ══════════════════════════════════════════ */

/**
 * Every control the page can address, read out of the markup. A control with no
 * name is a failure in itself: it cannot be hydrated or extracted.
 */
function markupControlNames() {
  const names = new Set();
  for (const m of RENDERED_HTML.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
    const name = (m[0].match(/\bname="([^"]+)"/) || [])[1];
    assert.ok(name, `a form control carries no name, so nothing can read or save it: ${m[0]}`);
    names.add(name);
  }
  // A segmented control is a container of buttons; the key lives in data-name
  // and each option in data-value, because a <button> has no name attribute.
  for (const m of RENDERED_HTML.matchAll(/<div class="segmented"[^>]*>/g)) {
    const name = (m[0].match(/\bdata-name="([^"]+)"/) || [])[1];
    assert.ok(name, `a segmented control carries no data-name: ${m[0]}`);
    names.add(name);
  }
  return names;
}

/** The key tables settings.js declares: key → settings section. */
function moduleFieldTables() {
  const table = (name) => {
    const m = SETTINGS_JS.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\};`));
    assert.ok(m, `settings.js does not declare a ${name} table`);
    return Object.fromEntries([...m[1].matchAll(/['"]?([A-Za-z][\w]*)['"]?:\s*'([^']+)'/g)].map(x => [x[1], x[2]]));
  };
  return { text: table('TEXT_FIELDS'), segmented: table('SEGMENTED_FIELDS') };
}

describe('markup and module agree on every key', () => {
  test('the control names in the markup and the module keys are the same set', () => {
    const markup = markupControlNames();
    const tables = moduleFieldTables();
    const moduleKeys = new Set([...Object.keys(tables.text), ...Object.keys(tables.segmented)]);

    // Direction 1: a rendered control the module never reads is dead weight the
    // operator can edit but never save.
    for (const name of markup) {
      assert.ok(moduleKeys.has(name), `settings.html renders "${name}" but settings.js neither hydrates nor extracts it`);
    }
    // Direction 2: a key the module sends with no control behind it is a value
    // the operator can never see or change.
    for (const key of moduleKeys) {
      assert.ok(markup.has(key), `settings.js hydrates/extracts "${key}" but settings.html has no control for it`);
    }
    assert.deepEqual([...markup].sort(), [...moduleKeys].sort());
  });

  test('each key is routed to a real section of the settings document', () => {
    const { text, segmented } = moduleFieldTables();
    for (const [key, section] of Object.entries(text)) assert.equal(section, 'general', key);
    for (const [key, section] of Object.entries(segmented)) assert.equal(section, 'appearance', key);
  });

  test('a loaded document hydrates every key into its control', async () => {
    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    page.Settings.init();
    await settleAll();

    assert.equal(page.dom.text.workspaceName.value, 'Ops');
    assert.equal(page.dom.text.defaultUploadFolder.value, '/media');
    assert.equal(page.dom.segments.defaultView.activeValue(), 'grid');
  });

  test('extraction sends the complete document, with null for unset values', async () => {
    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    page.Settings.init();
    await settleAll();

    // Blanking a text control and returning a segmented option to unset must
    // serialize as the explicit unset state, never as undefined or "".
    page.dom.text.workspaceName.value = '   ';
    page.dom.segments.defaultView.activate(null);
    page.els['#saveChanges'].fire('click');
    await settleAll();

    assert.equal(page.calls.put.length, 1);
    // The payload is built inside the vm realm, so compare its serialized form.
    const sent = JSON.parse(JSON.stringify(page.calls.put[0].body));
    assert.deepEqual(sent, {
      general: { workspaceName: null, defaultUploadFolder: '/media' },
      appearance: { defaultView: null },
    });
    assert.ok(!JSON.stringify(sent).includes('undefined'), 'undefined would be dropped by JSON.stringify and silently lost');
    assert.deepEqual(Object.keys(sent).sort(), ['appearance', 'general'], 'the PUT is a full replace: no section may be missing');
  });

  test('a value containing markup-significant characters stays a value', async () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const page = loadPage({ get: () => Promise.resolve({ ...LOADED_DOC, general: { ...LOADED_DOC.general, workspaceName: hostile } }) });
    page.Settings.init();
    await settleAll();

    assert.equal(page.dom.text.workspaceName.value, hostile, 'written as a value, verbatim');
    assert.deepEqual(page.dom.htmlWrites(), [], 'the module inserted no markup anywhere');
  });
});

/* ══════════════════════════════════════════
   DOM STUB + MODULE HARNESS
   ══════════════════════════════════════════ */

function makeClassList() {
  const set = new Set();
  return {
    set,
    add: (...c) => c.forEach(x => set.add(x)),
    remove: (...c) => c.forEach(x => set.delete(x)),
    contains: c => set.has(c),
    toggle: (c, force) => {
      const on = force === undefined ? !set.has(c) : !!force;
      if (on) set.add(c); else set.delete(c);
      return on;
    },
  };
}

function makeEl(tag = 'div', attrs = {}) {
  const el = {
    tagName: tag.toUpperCase(),
    attrs: { ...attrs },
    dataset: {},
    listeners: {},
    style: {},
    value: attrs.value === undefined ? '' : attrs.value,
    checked: false,
    hidden: false,
    textContent: '',
    classList: makeClassList(),
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
    },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn);
    },
    fire(type, event = {}) {
      (this.listeners[type] || []).forEach(fn => fn(Object.assign({ type, target: el }, event)));
    },
    click() { this.fire('click'); },
    focus() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    contains() { return false; },
    scrollIntoView() {},
  };
  if (attrs.class) attrs.class.split(/\s+/).filter(Boolean).forEach(c => el.classList.add(c));
  if (attrs.name !== undefined) el.name = attrs.name;
  el.htmlWrites = [];
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html || ''; },
    set(v) { el.htmlWrites.push(v); el._html = v; },
  });
  return el;
}

function makeSegment(name, values, activeValue) {
  const seg = makeEl('div', { class: 'segmented', 'data-name': name });
  seg.dataset.name = name;
  const buttons = values.map(v => {
    const b = makeEl('button', { 'data-value': v });
    b.dataset.value = v;
    b.closest = sel => (sel === 'button' || sel === 'button[data-value]') ? b : null;
    if (v === activeValue) b.classList.add('is-active');
    return b;
  });
  seg.buttons = buttons;
  seg.querySelectorAll = sel => (sel === 'button' || sel === 'button[data-value]') ? buttons : [];
  seg.contains = other => buttons.includes(other);
  seg.closest = sel => (sel === '.segmented' ? seg : null);
  seg.activeValue = () => {
    const on = buttons.find(b => b.classList.contains('is-active'));
    return on ? on.dataset.value : null;
  };
  seg.activate = value => buttons.forEach(b => b.classList.toggle('is-active', b.dataset.value === value));
  seg.button = value => buttons.find(b => b.dataset.value === value);
  return seg;
}

const PANES = ['general', 'appearance', 'storage', 'security', 'api'];

function buildDom({ fieldDefaults = {}, viewValues = ['list', 'grid'], viewActive = 'list' } = {}) {
  const text = {
    workspaceName: makeEl('input', { class: 'input', name: 'workspaceName', value: fieldDefaults.workspaceName }),
    defaultUploadFolder: makeEl('input', { class: 'input', name: 'defaultUploadFolder', value: fieldDefaults.defaultUploadFolder }),
  };
  const segments = { defaultView: makeSegment('defaultView', viewValues, viewActive) };
  const navItems = PANES.map(p => {
    const b = makeEl('button', { class: 'settings-nav-item', 'data-pane': p });
    if (p === 'general') b.classList.add('is-active');
    return b;
  });
  const panes = PANES.map(p => {
    const d = makeEl('div', { class: 'settings-pane', 'data-pane-content': p });
    if (p === 'general') d.classList.add('is-active');
    return d;
  });
  const themeCards = ['dark', 'light', 'system'].map(v => makeEl('button', { class: 'theme-option', 'data-theme-value': v }));
  const els = {
    '#settingsNotice': makeEl('div', { class: 'settings-notice', id: 'settingsNotice' }),
    '#saveBar': makeEl('div', { class: 'save-bar', id: 'saveBar' }),
    '#saveChanges': makeEl('button', { class: 'btn', id: 'saveChanges' }),
    '#discardChanges': makeEl('button', { class: 'btn', id: 'discardChanges' }),
    '.settings-content': makeEl('div', { class: 'settings-content' }),
  };
  els['#settingsNotice'].hidden = true;

  const docListeners = {};
  const doc = {
    body: { dataset: { page: 'settings' } },
    listeners: docListeners,
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    removeEventListener: (type, fn) => { docListeners[type] = (docListeners[type] || []).filter(f => f !== fn); },
    querySelector(sel) {
      if (Object.prototype.hasOwnProperty.call(els, sel)) return els[sel];
      const input = sel.match(/^input\[name="([^"]+)"\]$/);
      if (input) return text[input[1]] || null;
      const seg = sel.match(/^\.segmented\[data-name="([^"]+)"\]$/);
      if (seg) return segments[seg[1]] || null;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '.settings-nav-item[data-pane]' || sel === '.settings-nav-item') return navItems;
      if (sel === '.settings-pane') return panes;
      if (sel === '.segmented') return Object.values(segments);
      if (sel === '.theme-option') return themeCards;
      return [];
    },
    documentElement: { getAttribute: () => null, classList: makeClassList() },
    head: { appendChild() {} },
    createElement: () => makeEl(),
  };

  const all = [...Object.values(text), ...Object.values(segments), ...navItems, ...panes, ...themeCards, ...Object.values(els)];
  return {
    doc, text, segments, navItems, panes, themeCards, els,
    htmlWrites: () => all.flatMap(el => el.htmlWrites),
  };
}

function loadPage({ get = notFound, put = null, confirm = async () => true, dom = null } = {}) {
  const world = dom || buildDom();
  const winListeners = {};
  const toasts = [];
  const confirms = [];
  const calls = { get: [], put: [] };
  const bells = [];
  const sandbox = {
    console: { warn() {}, error() {}, log() {} },
    URLSearchParams,
    location: { search: '' },
    innerWidth: 1200,
    addEventListener: (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); },
    removeEventListener: (type, fn) => { winListeners[type] = (winListeners[type] || []).filter(f => f !== fn); },
    document: world.doc,
  };
  sandbox.window = sandbox;
  sandbox.AFM = {
    $: sel => world.els[sel] || null,
    $$: sel => world.doc.querySelectorAll(sel),
    Toast: {
      success: (t, m) => toasts.push({ type: 'success', t, m }),
      info: (t, m) => toasts.push({ type: 'info', t, m }),
      error: (t, m) => toasts.push({ type: 'error', t, m }),
      warn: (t, m) => toasts.push({ type: 'warn', t, m }),
    },
    Modal: { confirm: (opts) => { confirms.push(opts); return confirm(opts); } },
    Notifications: { bindTopbarBell: () => bells.push('bound') },
    escapeHtml: s => String(s),
  };
  sandbox.API = {
    get: (u, opts) => { calls.get.push({ u, opts }); return get(u, opts); },
    put: (u, body) => {
      calls.put.push({ u, body });
      return put ? put(u, body) : Promise.resolve({ success: true, settings: body });
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SETTINGS_JS, sandbox, { filename: 'settings.js' });

  return {
    Settings: sandbox.Settings,
    AFM: sandbox.AFM,
    dom: world,
    els: world.els,
    toasts,
    confirms,
    calls,
    bells,
    fire: (type, target) => (world.doc.listeners[type] || []).forEach(fn => fn({ type, target })),
    fireWindow: (type, event = {}) => (winListeners[type] || []).forEach(fn => fn(Object.assign({ type }, event))),
    docListenerCount: () => Object.values(world.doc.listeners).reduce((n, l) => n + l.length, 0),
    winListenerCount: () => Object.values(winListeners).reduce((n, l) => n + l.length, 0),
  };
}

/* ══════════════════════════════════════════
   SAVE IS GATED ON STORE REACHABILITY
   ══════════════════════════════════════════ */

describe('save is gated on the store answering', () => {
  test('the initial read is silent', async () => {
    const page = loadPage();
    page.Settings.init();
    await settleAll();
    assert.equal(page.calls.get[0].u, '/settings');
    assert.equal(page.calls.get[0].opts.silent, true, 'a missing store is reported in the page, not as an error toast');
  });

  test('the notice appears only when the store cannot be reached', async () => {
    const answering = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    answering.Settings.init();
    await settleAll();
    assert.equal(answering.els['#settingsNotice'].hidden, true, 'a working store must not raise the outage notice');

    const broken = loadPage({ get: notFound });
    broken.Settings.init();
    await settleAll();
    assert.equal(broken.els['#settingsNotice'].hidden, false);
  });

  test('saving while the initial read is in flight sends nothing and says it is loading', async () => {
    let release;
    const page = loadPage({ get: () => new Promise(resolve => { release = resolve; }) });
    page.Settings.init();
    await settle();

    page.els['#saveChanges'].fire('click');
    await settleAll();

    assert.equal(page.calls.put.length, 0, 'no write against an unknown store');
    assert.ok(page.toasts.some(t => t.type === 'info' && /still loading/i.test(t.m)));
    assert.ok(!page.toasts.some(t => t.type === 'success'));
    assert.ok(!page.toasts.some(t => t.type === 'error' && /network/i.test(t.m)), 'no raw network-error toast');

    release(LOADED_DOC);
    await settleAll();
  });

  test('saving against an unreachable store explains and sends nothing', async () => {
    const page = loadPage({ get: notFound });
    page.Settings.init();
    await settleAll();

    page.els['#saveChanges'].fire('click');
    await settleAll();

    assert.equal(page.calls.put.length, 0);
    assert.ok(page.toasts.some(t => t.type === 'info' && /cannot be saved/.test(t.m)));
    assert.ok(!page.toasts.some(t => t.type === 'success'));
  });

  test('a rejected save leaves the unsaved-changes indicator up', async () => {
    const page = loadPage({
      get: () => Promise.resolve(LOADED_DOC),
      put: () => Promise.reject(Object.assign(new Error('Settings rejected'), { status: 400 })),
    });
    page.Settings.init();
    await settleAll();

    page.fire('input', page.dom.text.workspaceName);
    page.els['#saveChanges'].fire('click');
    await settleAll();

    assert.ok(!page.toasts.some(t => t.type === 'success'), 'a refused write is never reported as saved');
    assert.ok(page.els['#saveBar'].classList.contains('is-visible'), 'still unsaved');
  });

  test('a successful save clears the indicator and applies the brand name hook', async () => {
    const applied = [];
    const page = loadPage({
      get: () => Promise.resolve(LOADED_DOC),
      put: (u, body) => Promise.resolve({ success: true, settings: body }),
    });
    page.Settings.init();
    page.AFM.applyWorkspaceName = name => applied.push(name);
    await settleAll();

    page.fire('input', page.dom.text.workspaceName);
    page.els['#saveChanges'].fire('click');
    await settleAll();

    assert.ok(page.toasts.some(t => t.type === 'success'));
    assert.ok(!page.els['#saveBar'].classList.contains('is-visible'));
    assert.deepEqual(applied, ['Ops'], 'the sidebar brand follows a rename without a reload');
  });

  test('after a save the form shows the document the store stored, not what was typed', async () => {
    const stored = {
      general: { workspaceName: 'Ops', defaultUploadFolder: null },
      appearance: { defaultView: 'grid' },
    };
    const page = loadPage({
      get: () => Promise.resolve(DEFAULT_DOC),
      put: () => Promise.resolve({ success: true, settings: stored }),
    });
    page.Settings.init();
    await settleAll();

    page.dom.text.workspaceName.value = '  Ops  ';
    page.dom.text.defaultUploadFolder.value = '/tmp';
    page.dom.segments.defaultView.activate('grid');
    page.els['#saveChanges'].fire('click');
    await settleAll();

    assert.equal(page.dom.text.workspaceName.value, 'Ops', 'the trimmed value the store holds');
    assert.equal(page.dom.text.defaultUploadFolder.value, '', 'a value the store did not keep is not left on screen');
    assert.equal(page.dom.segments.defaultView.activeValue(), 'grid');
  });
});

/* ══════════════════════════════════════════
   DISCARD TELLS THE TRUTH
   ══════════════════════════════════════════ */

describe('discard speaks about what actually happened', () => {
  test('with a loaded document it restores the last loaded values', async () => {
    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    page.Settings.init();
    await settleAll();

    page.dom.text.workspaceName.value = 'edited';
    page.dom.text.defaultUploadFolder.value = '/other';
    page.dom.segments.defaultView.activate('list');
    page.fire('input', page.dom.text.workspaceName);
    page.els['#discardChanges'].fire('click');
    await settleAll();

    assert.equal(page.dom.text.workspaceName.value, 'Ops');
    assert.equal(page.dom.text.defaultUploadFolder.value, '/media');
    assert.equal(page.dom.segments.defaultView.activeValue(), 'grid');
    assert.ok(!page.els['#saveBar'].classList.contains('is-visible'));
    assert.ok(page.toasts.some(t => t.type === 'info' && /discard/i.test(t.t)));
  });

  test('with no store it resets the markup defaults and claims nothing was saved', async () => {
    const page = loadPage({ get: notFound });
    page.Settings.init();
    await settleAll();

    page.dom.text.workspaceName.value = 'edited';
    page.dom.segments.defaultView.activate('grid');
    page.fire('input', page.dom.text.workspaceName);
    page.els['#discardChanges'].fire('click');
    await settleAll();

    assert.equal(page.dom.text.workspaceName.value, '', 'the markup default is restored, not the server state');
    assert.equal(page.dom.segments.defaultView.activeValue(), 'list');
    assert.ok(!page.els['#saveBar'].classList.contains('is-visible'));
    const said = page.toasts.filter(t => t.type === 'info');
    assert.ok(said.some(t => /nothing was saved/i.test(t.m)), 'says nothing was saved');
    assert.ok(!said.some(t => /discard/i.test(`${t.t} ${t.m}`)),
      'never claims edits were discarded against server state that never loaded');
  });

  test('a cancelled confirmation changes nothing', async () => {
    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC), confirm: async () => false });
    page.Settings.init();
    await settleAll();

    page.dom.text.workspaceName.value = 'edited';
    page.fire('input', page.dom.text.workspaceName);
    page.els['#discardChanges'].fire('click');
    await settleAll();

    assert.equal(page.dom.text.workspaceName.value, 'edited');
    assert.ok(page.els['#saveBar'].classList.contains('is-visible'));
  });
});

/* ══════════════════════════════════════════
   DIRTY STATE MEANS SOMETHING
   ══════════════════════════════════════════ */

describe('the unsaved-changes indicator tracks real differences', () => {
  const dirty = page => page.els['#saveBar'].classList.contains('is-visible');

  test('editing a covered control marks the page dirty', async () => {
    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    page.Settings.init();
    await settleAll();

    page.fire('input', page.dom.text.workspaceName);
    assert.ok(dirty(page));
  });

  test('clicking the already-active segmented option is not a change', async () => {
    const page = loadPage({ get: () => Promise.resolve(DEFAULT_DOC) });
    page.Settings.init();
    await settleAll();

    const seg = page.dom.segments.defaultView;
    seg.fire('click', { target: seg.button('list') });
    assert.ok(!dirty(page), 'the active option was already selected');

    seg.fire('click', { target: seg.button('grid') });
    assert.ok(dirty(page));
    assert.equal(seg.activeValue(), 'grid');
  });

  test('choosing a theme is not an unsaved edit', async () => {
    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    page.Settings.init();
    await settleAll();

    // The picker is delegated by theme.js on document; the page module must not
    // turn that click into an edit.
    page.fire('click', page.dom.themeCards[1]);
    assert.ok(!dirty(page));
    assert.equal(page.confirms.length, 0, 'no leave confirmation for a theme change');
    assert.equal(await page.Settings.beforeLeave(), true);
  });

  test('a control that is not in the payload does not mark the page dirty', async () => {
    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    page.Settings.init();
    await settleAll();

    const stray = makeEl('input', { class: 'input', name: 'somethingRemoved' });
    page.fire('change', stray);
    assert.ok(!dirty(page));
  });

  test('the segmented control reports its active option, not just a class', async () => {
    assert.match(RENDERED_HTML, /data-value="list" class="is-active" aria-pressed="true"/,
      'the markup ships the pressed state, not only the highlight');

    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    page.Settings.init();
    await settleAll();

    const seg = page.dom.segments.defaultView;
    assert.equal(seg.button('grid').getAttribute('aria-pressed'), 'true', 'the hydrated option is the pressed one');
    assert.equal(seg.button('list').getAttribute('aria-pressed'), 'false');

    seg.fire('click', { target: seg.button('list') });
    assert.equal(seg.button('list').getAttribute('aria-pressed'), 'true');
    assert.equal(seg.button('grid').getAttribute('aria-pressed'), 'false');
  });
});

/* ══════════════════════════════════════════
   TEARDOWN AND THE THEME PICKER
   ══════════════════════════════════════════ */

describe('teardown leaves nothing behind', () => {
  test('destroy removes every document and window listener the module added', async () => {
    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    // Registered once when the script is evaluated, not per visit: the bootstrap
    // that calls init() on DOMContentLoaded. destroy() does not own it.
    const docBaseline = page.docListenerCount();

    page.Settings.init();
    await settleAll();

    const docAdded = page.docListenerCount() - docBaseline;
    assert.ok(docAdded > 0, 'the module bound no document listener at all');
    assert.ok(page.winListenerCount() > 0, 'no hard-navigation guard');

    page.Settings.destroy();
    assert.equal(page.docListenerCount(), docBaseline);
    assert.equal(page.winListenerCount(), 0);

    // A router swap brings the page back: the second visit must add exactly the
    // listeners the first one did, not a duplicate set.
    page.Settings.init();
    await settleAll();
    assert.equal(page.docListenerCount() - docBaseline, docAdded);
    page.Settings.destroy();
    assert.equal(page.winListenerCount(), 0);
  });

  test('a destroyed page no longer guards the next one', async () => {
    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    page.Settings.init();
    await settleAll();

    page.fire('input', page.dom.text.workspaceName);
    await page.Settings.beforeLeave();
    assert.equal(page.confirms.length, 1, 'unsaved edits ask before a client-side navigation');

    page.Settings.destroy();
    const ev = { prevented: false, preventDefault() { ev.prevented = true; } };
    page.fireWindow('beforeunload', ev);
    assert.equal(ev.prevented, false, 'the leave guard went with the listeners');
  });

  test('the module does not intercept clicks on the theme cards', () => {
    assert.doesNotMatch(SETTINGS_JS, /stopPropagation/);
    assert.doesNotMatch(SETTINGS_JS, /theme-option/);
  });

  test('the shared topbar bell is still bound by the page module', async () => {
    const page = loadPage({ get: () => Promise.resolve(LOADED_DOC) });
    page.Settings.init();
    await settleAll();
    assert.deepEqual(page.bells, ['bound'], 'the bell belongs to AFM.Notifications, never to a one-off handler');
  });
});

/* ══════════════════════════════════════════
   THE SURVIVING PAGE RENDERS ONLY WHAT WORKS
   ══════════════════════════════════════════ */

describe('every rendered control is bound, and no dead UI ships', () => {
  test('no interactive control on the page lacks a handler', () => {
    const bound = [
      /^<a\b[^>]*href="/,                        // navigation with a real target
      /class="nav-item"/,                        // sidebar links
      /class="brand"/,                           // sidebar home
      /class="mobile-menu-btn"/,                 // sidebar.js
      /data-theme-toggle/,                       // theme.js topbar toggle
      /data-tip="Notifications"/,                // AFM.Notifications bell (delegated)
      /class="theme-option"/,                    // theme.js picker cards (delegated)
      /class="settings-nav-item/,                // the pane switcher
      /class="segmented"/,                       // container, not a control
      /data-value="/,                            // segmented option
      /\bname="(workspaceName|defaultUploadFolder)"/, // hydrate / extract / dirty
      /id="saveChanges"|id="discardChanges"/,    // the save bar actions
    ];
    const interactive = [...RENDERED_HTML.matchAll(/<(button|a|input|select)\b[^>]*>/g)].map(m => m[0]);
    const unbound = interactive.filter(tag => !bound.some(re => re.test(tag)));
    assert.deepEqual(unbound, [], 'controls rendered as enabled with no handler');
    assert.ok(!/href="#"/.test(RENDERED_HTML), 'no dead links');

    // The theme cards are delegated by theme.js, which resolves them by this
    // attribute: a card without it is a dead button wearing a picker style.
    for (const tag of interactive.filter(t => /class="theme-option"/.test(t))) {
      assert.match(tag, /data-theme-value="(dark|light|system)"/, `a theme card theme.js cannot resolve: ${tag}`);
    }
  });

  test('the removed capability claims are gone from the rendered page', () => {
    const gone = [
      'Workspace URL', 'Default language', 'Time zone',
      'Auto-organize', 'Auto-thumbnails', 'Auto-generate thumbnails', 'Deduplication',
      'Density', 'Reduce motion', 'Show file thumbnails',
      'Retention & lifecycle', 'Auto-purge',
      'Two-factor', 'Single sign-on', 'Session timeout', 'Encryption at rest',
      'Virus scanning', 'Password-protected', 'watermark', 'ClamAV',
      'Google Drive', 'Dropbox', 'Slack', 'Notion', 'Amazon S3', 'GitHub',
      'Webhook', 'Trigger events', 'Weekly summary', 'Failed uploads', 'New share links',
      'Empty trash', 'Revoke all', 'Transfer workspace', 'Delete workspace', 'Danger zone',
      'globalSearch', 'search-kbd',
    ];
    const present = gone.filter(g => RENDERED_HTML.includes(g));
    assert.deepEqual(present, [], 'a removed capability is still rendered');
  });

  test('the security area states plainly that no such subsystem exists here', () => {
    assert.match(RENDERED_HTML, /no authentication or security subsystem exists in this build/i);
    // The honest residue must not smuggle in a status of its own.
    assert.doesNotMatch(RENDERED_HTML, /badge-success[^>]*>\s*Enabled/i);
  });

  test('the module builds no markup and interpolates nothing into copy', () => {
    assert.doesNotMatch(SETTINGS_JS, /innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
    const interpolated = [...SETTINGS_JS.matchAll(/\$\{([^}]*)\}/g)].map(m => m[1].trim());
    for (const expr of interpolated) {
      assert.match(expr, /^name$/, `a dynamic value is interpolated into ${expr}; markup is never built here`);
    }
  });

  test('the page still loads the shared chrome in the order the chrome requires', () => {
    const srcs = [...SETTINGS_HTML.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    const at = name => srcs.indexOf(`assets/js/${name}`);
    assert.ok(at('api.js') < at('app.js'), 'window.API before window.AFM');
    assert.ok(at('sidebar.js') < at('router.js'), 'persistent chrome first');
    assert.ok(at('router.js') < at('settings.js'), 'the page module last');
    assert.ok(at('notifications.js') < at('settings.js'), 'the shared bell module before the page module');
    assert.equal([...SETTINGS_HTML.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].length, 0, 'no inline script');
  });
});