/* ============================================
   ROUTER.JS — Client-side navigation between the four pages
   Admin Files Manager — Dimension Style

   The pages stay plain HTML files (no build step, each still loads on its
   own), but moving between them no longer reloads the document:

   1. A click on a link to one of the four pages is intercepted.
   2. The target page's HTML is fetched (cached for the session) and parsed.
   3. Its page-specific stylesheet and scripts are loaded once.
   4. The current page module's destroy() runs; <main class="main-area"> and the
      page's own overlays (bulk bar, drawer, …) are swapped; the sidebar stays.
   5. History is updated, the shared chrome refreshed, and the new page
      module's init() runs. Back/forward replay the same steps.

   Anything unexpected (a failed fetch, an unknown page) falls back to a normal
   full page load, so navigation never breaks. This is a document fetch for
   static HTML, not an API call; API requests still go through window.API.
   ============================================ */

'use strict';

const Router = (() => {

  /** Routable files, and the window global each page module registers. */
  const PAGES = {
    'index.html': 'dashboard',
    'files.html': 'files',
    'uploads.html': 'uploads',
    'settings.html': 'settings',
  };
  const MODULES = { dashboard: 'Dashboard', files: 'Files', uploads: 'Uploads', settings: 'Settings' };

  const htmlCache = new Map();
  let pageExtras = [];      // page-owned <body> children outside .app-shell
  let navToken = 0;         // a newer navigation supersedes an older one
  let currentKey = '';
  let currentHref = '';

  /** { url, file } for a same-origin link to one of the pages, else null. */
  function resolve(href) {
    let url;
    try { url = new URL(href, window.location.href); } catch { return null; }
    if (url.origin !== window.location.origin) return null;
    const file = url.pathname.replace(/^.*\//, '') || 'index.html';
    return Object.prototype.hasOwnProperty.call(PAGES, file) ? { url, file } : null;
  }

  /** Same page and query = same view; only the fragment may differ. */
  const keyOf = target => target.file + target.url.search;

  function currentModule() {
    const name = MODULES[document.body.dataset.page];
    return name ? window[name] : null;
  }

  function fetchPage(target) {
    const path = target.url.pathname;
    if (!htmlCache.has(path)) {
      const pending = fetch(path, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        });
      pending.catch(() => htmlCache.delete(path));
      htmlCache.set(path, pending);
    }
    return htmlCache.get(path);
  }

  /* ── assets ── */

  async function addStyles(doc, base) {
    const have = new Set(Array.from(document.querySelectorAll('link[rel="stylesheet"]'), l => l.href));
    const loads = [];
    doc.querySelectorAll('head link[rel="stylesheet"]').forEach(link => {
      const href = new URL(link.getAttribute('href'), base).href;
      if (have.has(href)) return;
      const el = document.createElement('link');
      el.rel = 'stylesheet';
      el.href = href;
      loads.push(new Promise(r => { el.onload = r; el.onerror = r; }));
      document.head.appendChild(el);
    });
    // Waiting for the page stylesheet before swapping avoids a flash of unstyled markup.
    await Promise.all(loads);
  }

  function removeStaleStyles(doc, base) {
    const wanted = new Set(Array.from(doc.querySelectorAll('head link[rel="stylesheet"]'),
      l => new URL(l.getAttribute('href'), base).href));
    document.querySelectorAll('head link[rel="stylesheet"]').forEach(l => {
      if (!wanted.has(l.href)) l.remove();
    });
  }

  /** Load, in order, each script the target references that is not loaded yet. */
  async function addScripts(doc, base) {
    const have = new Set(Array.from(document.scripts, s => s.src).filter(Boolean));
    for (const s of doc.querySelectorAll('script[src]')) {
      const src = new URL(s.getAttribute('src'), base).href;
      if (have.has(src)) continue;
      await new Promise((resolveLoad, reject) => {
        const el = document.createElement('script');
        el.src = src;
        el.async = false;
        el.onload = resolveLoad;
        el.onerror = () => reject(new Error(`could not load ${src}`));
        document.body.appendChild(el);
      });
      have.add(src);
    }
  }

  /* ── swap ── */

  const isPageExtra = node => node.tagName !== 'SCRIPT' && !(node.classList && node.classList.contains('app-shell'));

  function teardown(mod) {
    try {
      if (mod && typeof mod.destroy === 'function') mod.destroy();
    } catch (err) {
      console.error('[Router] page teardown failed', err);
    }
    const AFM = window.AFM || {};
    AFM.ContextMenu?.hide();
    AFM.Dropdown?.closeAll();
    AFM.Modal?.closeAll();
  }

  function swap(doc) {
    const main = document.querySelector('main.main-area');
    const next = doc.querySelector('main.main-area');
    // The <main> node itself is kept: Sidebar holds a reference to it.
    // Snapshot the child lists before adopting: adoptNode removes each node from
    // its live NodeList, so adopting while iterating would skip every other node.
    const incoming = Array.from(next.childNodes);
    main.replaceChildren(...incoming.map(n => document.adoptNode(n)));

    pageExtras.forEach(n => n.remove());
    const anchor = document.querySelector('body > script');
    const extras = Array.from(doc.body.children).filter(isPageExtra);
    pageExtras = extras.map(n => document.adoptNode(n));
    pageExtras.forEach(n => document.body.insertBefore(n, anchor));

    document.title = doc.title;
    const desc = doc.querySelector('meta[name="description"]');
    const ownDesc = document.querySelector('meta[name="description"]');
    if (desc && ownDesc) ownDesc.setAttribute('content', desc.getAttribute('content') || '');
    document.body.dataset.page = doc.body.dataset.page;

    // State a page may have left behind on the shared shell (drawer, modal).
    const shell = document.querySelector('.app-shell');
    shell?.removeAttribute('inert');
    shell?.removeAttribute('aria-hidden');
    document.body.style.overflow = '';
  }

  function settleScroll(hash) {
    const main = document.querySelector('main.main-area');
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    if (target) {
      target.scrollIntoView();
      return;
    }
    window.scrollTo(0, 0);
    if (main) main.scrollTop = 0;
  }

  /** Move focus to the new page's heading, so keyboard and screen-reader users land in it. */
  function focusHeading() {
    const h1 = document.querySelector('main.main-area h1');
    if (!h1) return;
    if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
    h1.focus({ preventScroll: true });
  }

  /* ── navigation ── */

  async function navigate(href, { push = true } = {}) {
    const target = resolve(href);
    if (!target) {
      window.location.assign(href);
      return;
    }
    const token = ++navToken;
    const leaving = currentModule();

    if (leaving && typeof leaving.beforeLeave === 'function') {
      let ok = true;
      try { ok = await leaving.beforeLeave(); } catch { ok = true; }
      if (!ok) {
        // Back/forward already changed the URL: put the current page back.
        if (!push && currentHref) history.pushState({ router: true }, '', currentHref);
        return;
      }
      if (token !== navToken) return;
    }

    const root = document.documentElement;
    root.classList.add('is-navigating');
    let doc;
    try {
      const html = await fetchPage(target);
      if (token !== navToken) return;
      doc = new DOMParser().parseFromString(html, 'text/html');
      const page = doc.body && doc.body.dataset.page;
      if (!page || !MODULES[page] || !doc.querySelector('main.main-area')) throw new Error('not a routable page');
      await addStyles(doc, target.url);
      await addScripts(doc, target.url);
      if (token !== navToken) return;
      if (!window[MODULES[page]] || typeof window[MODULES[page]].init !== 'function') {
        throw new Error(`page module ${MODULES[page]} did not register`);
      }
    } catch (err) {
      console.warn('[Router] falling back to a full page load:', err && err.message);
      window.location.assign(target.url.href);
      return;
    } finally {
      if (token === navToken) root.classList.remove('is-navigating');
    }

    teardown(leaving);
    swap(doc);
    removeStaleStyles(doc, target.url);
    if (push) history.pushState({ router: true }, '', target.url.href);
    currentKey = keyOf(target);
    currentHref = target.url.href;

    window.AFM?.refreshChrome?.();
    window.Theme?.refresh?.();
    try {
      window[MODULES[doc.body.dataset.page]].init();
    } catch (err) {
      console.error('[Router] page init failed', err);
    }
    settleScroll(target.url.hash);
    focusHeading();
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
    const target = resolve(link.href);
    if (!target) return;
    if (keyOf(target) === currentKey) {
      // Same view: a fragment is the browser's to scroll to; otherwise nothing to do.
      if (!target.url.hash) e.preventDefault();
      return;
    }
    e.preventDefault();
    navigate(target.url.href);
  }

  function onPopState() {
    const target = resolve(window.location.href);
    if (!target) return;
    if (keyOf(target) === currentKey) return; // fragment-only history entry
    navigate(window.location.href, { push: false });
  }

  /** Warm the cache when a pointer or focus reaches a page link. */
  function onIntent(e) {
    const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    const target = link ? resolve(link.href) : null;
    if (target && keyOf(target) !== currentKey) fetchPage(target).catch(() => {});
  }

  function start() {
    const here = resolve(window.location.href);
    if (!here || !window.history || !window.history.pushState || !window.DOMParser || !window.fetch) return;
    currentKey = keyOf(here);
    currentHref = here.url.href;
    // Deferred scripts run after parsing and before any runtime overlay exists,
    // so every non-shell child of <body> right now belongs to this page.
    pageExtras = Array.from(document.body.children).filter(isPageExtra);
    history.replaceState({ router: true }, '', window.location.href);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', onIntent, { passive: true });
    document.addEventListener('focusin', onIntent);
    window.addEventListener('popstate', onPopState);
  }

  start();

  return { navigate, resolve };
})();

window.Router = Router;
