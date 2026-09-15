/* ============================================
   THEME.JS — Light / Dark Theme Toggle System
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Theme = (() => {

  /* ── Constants ── */
  const STORE_KEY = 'theme';
  const THEMES = ['dark', 'light'];
  const DEFAULT = 'dark';
  const TRANSITION_CLASS = 'theme-switching';

  /* ── State ── */
  let current = DEFAULT;
  let listeners = [];

  /* ── Private Methods ── */

  /** Read stored preference or system pref */
  function resolve() {
    const stored = AFM?.Store?.get(STORE_KEY);
    if (stored && THEMES.includes(stored)) return stored;

    // Check system preference
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
    return DEFAULT;
  }

  /** Apply theme to DOM */
  function apply(theme, animate = true) {
    const root = document.documentElement;
    const prev = current;

    // Short-circuit if already set
    if (prev === theme && root.getAttribute('data-theme') === theme) return;

    // Add transition-suppression class briefly when animating
    if (animate) {
      root.classList.add(TRANSITION_CLASS);
    }

    // Set the attribute
    root.setAttribute('data-theme', theme);
    current = theme;

    // Persist
    AFM?.Store?.set(STORE_KEY, theme);

    // Update meta theme-color for mobile browsers
    updateMetaColor(theme);

    // Update all toggle controls
    updateToggles(theme);

    // Update theme picker cards (settings page)
    updatePickerCards(theme);

    // Remove suppression after next frame
    if (animate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          root.classList.remove(TRANSITION_CLASS);
        });
      });
    }

    // Notify listeners
    if (prev !== theme) {
      listeners.forEach(fn => {
        try { fn(theme, prev); } catch (e) { console.error('[Theme] listener error', e); }
      });
    }
  }

  /** Update the <meta name="theme-color"> for mobile browser chrome */
  function updateMetaColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#0a0a0a' : '#fafafa';
  }

  /** Sync toggle button states */
  function updateToggles(theme) {
    const isDark = theme === 'dark';

    // Theme toggle switches
    document.querySelectorAll('.theme-toggle').forEach(toggle => {
      toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      toggle.setAttribute('title', isDark ? 'Light mode' : 'Dark mode');
    });

    // Icon-based toggle buttons
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      const sunIcon = btn.querySelector('.icon-sun');
      const moonIcon = btn.querySelector('.icon-moon');
      if (sunIcon) sunIcon.style.display = isDark ? 'none' : 'block';
      if (moonIcon) moonIcon.style.display = isDark ? 'block' : 'none';
    });

    // Labeled text toggles
    document.querySelectorAll('.theme-label-text').forEach(el => {
      el.textContent = isDark ? 'Dark' : 'Light';
    });
  }

  /** Highlight active card in settings theme picker */
  function updatePickerCards(theme) {
    document.querySelectorAll('.theme-option').forEach(card => {
      const cardTheme = card.getAttribute('data-theme-value');
      card.classList.toggle('is-active', cardTheme === theme);
    });
  }

  /** Handle system preference change */
  function onSystemChange(e) {
    // Only auto-switch if the user hasn't explicitly set a preference
    const stored = AFM?.Store?.get(STORE_KEY);
    if (!stored) {
      apply(e.matches ? 'light' : 'dark');
    }
  }

  /* ── Public API ── */

  /** Initialize the theme system */
  function init() {
    current = resolve();
    apply(current, false);

    // Listen for system preference changes
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (mq?.addEventListener) {
      mq.addEventListener('change', onSystemChange);
    } else if (mq?.addListener) {
      mq.addListener(onSystemChange);
    }

    // Bind toggle buttons
    bindToggles();

    // Bind theme picker cards (settings page)
    bindPickerCards();

    // Listen for storage changes from other tabs
    window.addEventListener('storage', e => {
      if (e.key === (AFM?.Store?.prefix || 'afm:') + STORE_KEY) {
        const newTheme = JSON.parse(e.newValue);
        if (newTheme && THEMES.includes(newTheme)) apply(newTheme);
      }
    });
  }

  /** Bind click handlers for toggle buttons */
  function bindToggles() {
    document.addEventListener('click', e => {
      const toggle = e.target.closest('.theme-toggle, [data-theme-toggle]');
      if (!toggle) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
  }

  /** Bind click handlers for theme picker cards */
  function bindPickerCards() {
    document.addEventListener('click', e => {
      const card = e.target.closest('.theme-option[data-theme-value]');
      if (!card) return;
      const val = card.getAttribute('data-theme-value');

      if (val === 'system') {
        // Clear stored pref and use system
        AFM?.Store?.remove(STORE_KEY);
        const systemTheme = window.matchMedia?.('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
        apply(systemTheme);
        // Still mark system card as active
        document.querySelectorAll('.theme-option').forEach(c => {
          c.classList.toggle('is-active', c.getAttribute('data-theme-value') === 'system');
        });
      } else if (THEMES.includes(val)) {
        apply(val);
      }
    });
  }

  /** Toggle between light/dark */
  function toggle() {
    apply(current === 'dark' ? 'light' : 'dark');
  }

  /** Set a specific theme */
  function set(theme) {
    if (THEMES.includes(theme)) apply(theme);
  }

  /** Get current theme */
  function get() {
    return current;
  }

  /** Check if dark */
  function isDark() {
    return current === 'dark';
  }

  /** Subscribe to theme changes */
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return () => { listeners = listeners.filter(f => f !== fn); };
  }

  return { init, toggle, set, get, isDark, onChange };
})();

/* ── Auto-init ── */
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
});

/* Expose globally */
window.Theme = Theme;