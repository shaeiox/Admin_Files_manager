/* ============================================
   THEME.JS — Light / Dark / System Theme Controller
   Admin Files Manager — Dimension Style

   Architecture: Two-Phase Init
   Phase 1 (bootstrap): Runs immediately in <head>, before first Paint.
                        Reads localStorage and sets data-theme on <html>.
   Phase 2 (init):      Runs after DOMContentLoaded. Binds UI controls,
                        listens for system/storage changes.

   This file has ZERO dependencies on app.js or any other module.
   It uses localStorage directly for maximum independence.
   ============================================ */

'use strict';

const Theme = (() => {

  /* ── Constants ── */
  const STORE_KEY = 'afm:theme';
  const THEMES = ['dark', 'light'];
  const DEFAULT = 'dark';
  const TRANSITION_CLASS = 'theme-switching';

  /* ── State ── */
  let current = DEFAULT;
  let listeners = [];
  let initialized = false;

  /* ══════════════════════════════════════════
     PHASE 1 — IMMEDIATE BOOTSTRAP
     Runs the moment this file is parsed in <head>.
     No DOM dependency beyond documentElement.
     Goal: set correct theme BEFORE first Paint.
     ══════════════════════════════════════════ */

  function bootstrap() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const stored = raw ? JSON.parse(raw) : null;

      if (stored === 'light' || stored === 'dark') {
        current = stored;
      } else {
        // 'system' or no stored preference → follow OS
        const prefersLight = window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: light)').matches;
        current = prefersLight ? 'light' : 'dark';
      }
    } catch (e) {
      current = DEFAULT;
    }

    // Apply immediately — this prevents any flash
    document.documentElement.setAttribute('data-theme', current);
    updateMetaColor(current);
  }

  // ★ Execute bootstrap RIGHT NOW, before any CSS is parsed
  bootstrap();


  /* ══════════════════════════════════════════
     INTERNAL HELPERS
     ══════════════════════════════════════════ */

  function updateMetaColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#0a0a0a' : '#fafafa';
  }

  function updateToggles(theme) {
    const isDark = theme === 'dark';

    document.querySelectorAll('.theme-toggle').forEach(toggle => {
      toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      toggle.setAttribute('title', isDark ? 'Light mode' : 'Dark mode');
    });

    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      const sunIcon = btn.querySelector('.icon-sun');
      const moonIcon = btn.querySelector('.icon-moon');
      if (sunIcon) sunIcon.style.display = isDark ? 'none' : 'block';
      if (moonIcon) moonIcon.style.display = isDark ? 'block' : 'none';
    });

    document.querySelectorAll('.theme-label-text').forEach(el => {
      el.textContent = isDark ? 'Dark' : 'Light';
    });
  }

  function updatePickerCards(theme) {
    document.querySelectorAll('.theme-option').forEach(card => {
      const cardTheme = card.getAttribute('data-theme-value');
      card.classList.toggle('is-active', cardTheme === theme);
    });
  }

  function onSystemChange(e) {
    // Only auto-switch if user chose 'system' or has no stored pref
    try {
      const stored = localStorage.getItem(STORE_KEY);
      const val = stored ? JSON.parse(stored) : null;
      if (!val || val === 'system') {
        apply(e.matches ? 'light' : 'dark');
      }
    } catch (err) { /* ignore */ }
  }

  function onStorageChange(e) {
    if (e.key === STORE_KEY) {
      try {
        const newTheme = JSON.parse(e.newValue);
        if (newTheme && THEMES.includes(newTheme)) apply(newTheme);
      } catch (err) { /* ignore */ }
    }
  }


  /* ══════════════════════════════════════════
     PHASE 2 — FULL INIT (after DOM ready)
     Binds UI controls, resolves final state,
     sets up listeners.
     ══════════════════════════════════════════ */

  function init() {
    if (initialized) return;
    initialized = true;

    // Re-resolve to ensure consistency
    current = resolve();
    apply(current, false);

    // System preference listener
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', onSystemChange);
    } else if (mq && mq.addListener) {
      mq.addListener(onSystemChange);
    }

    // Cross-tab sync
    window.addEventListener('storage', onStorageChange);

    // Bind UI
    bindToggles();
    bindPickerCards();
  }

  function resolve() {
    // Priority 1: what bootstrap already set on <html>
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr && THEMES.includes(attr)) return attr;

    // Priority 2: localStorage
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const stored = raw ? JSON.parse(raw) : null;
      if (stored && THEMES.includes(stored)) return stored;
    } catch (e) { /* ignore */ }

    // Priority 3: OS preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }

    // Priority 4: project default
    return DEFAULT;
  }

  function apply(theme, animate) {
    if (animate === undefined) animate = true;
    const root = document.documentElement;
    const prev = current;

    if (prev === theme && root.getAttribute('data-theme') === theme) return;

    if (animate) root.classList.add(TRANSITION_CLASS);

    root.setAttribute('data-theme', theme);
    current = theme;

    // Persist
    try { localStorage.setItem(STORE_KEY, JSON.stringify(theme)); } catch (e) { /* ignore */ }

    updateMetaColor(theme);
    updateToggles(theme);
    updatePickerCards(theme);

    if (animate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          root.classList.remove(TRANSITION_CLASS);
        });
      });
    }

    if (prev !== theme) {
      listeners.forEach(fn => {
        try { fn(theme, prev); } catch (e) { console.error('[Theme] listener error', e); }
      });
    }
  }

  function bindToggles() {
    document.addEventListener('click', e => {
      const toggleEl = e.target.closest('.theme-toggle, [data-theme-toggle]');
      if (!toggleEl) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
  }

  function bindPickerCards() {
    document.addEventListener('click', e => {
      const card = e.target.closest('.theme-option[data-theme-value]');
      if (!card) return;
      const val = card.getAttribute('data-theme-value');

      if (val === 'system') {
        try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
        const systemTheme = window.matchMedia &&
          window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        apply(systemTheme);
        document.querySelectorAll('.theme-option').forEach(c => {
          c.classList.toggle('is-active', c.getAttribute('data-theme-value') === 'system');
        });
      } else if (THEMES.includes(val)) {
        apply(val);
      }
    });
  }


  /* ══════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════ */

  function toggle() {
    apply(current === 'dark' ? 'light' : 'dark');
  }

  function set(theme) {
    if (THEMES.includes(theme)) apply(theme);
  }

  function get() {
    return current;
  }

  function isDark() {
    return current === 'dark';
  }

  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return () => { listeners = listeners.filter(f => f !== fn); };
  }

  /** Re-sync toggle and picker state onto markup swapped in by router.js. */
  function refresh() {
    updateToggles(current);
    updatePickerCards(current);
  }

  return { init, toggle, set, get, isDark, onChange, refresh };
})();


/* ── Auto-init when DOM is ready ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => Theme.init());
} else {
  Theme.init();
}

/* Expose globally */
window.Theme = Theme;