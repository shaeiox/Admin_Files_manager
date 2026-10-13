/* ============================================
   SIDEBAR.JS — Collapsible Sidebar Controller
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Sidebar = (() => {

  /* ── Constants ── */
  const STORE_KEY = 'sidebar-collapsed';
  const MOBILE_BREAKPOINT = 860;
  const WIDTH_STORE_KEY = 'sidebarWidth';
  const WIDTH_MIN = 200;
  const WIDTH_MAX = 420;
  const WIDTH_DEFAULT = 260;
  const WIDTH_STEP = 12;

  /* ── State ── */
  let sidebarEl = null;
  let overlayEl = null;
  let collapseBtn = null;
  let resizerEl = null;
  let mobileMenuBtn = null;
  let mainArea = null;
  let isCollapsed = false;
  let isMobileOpen = false;
  let resizeDrag = null;
  let listeners = [];

  /* ── Private ── */

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function applyState(collapsed, animate = true) {
    if (!sidebarEl) return;
    isCollapsed = collapsed;

    if (animate) {
      sidebarEl.style.transition = '';
      mainArea?.style && (mainArea.style.transition = '');
    } else {
      sidebarEl.style.transition = 'none';
      mainArea?.style && (mainArea.style.transition = 'none');
      requestAnimationFrame(() => {
        sidebarEl.style.transition = '';
        mainArea?.style && (mainArea.style.transition = '');
      });
    }

    sidebarEl.classList.toggle('is-collapsed', collapsed);

    // Update collapse button tooltip
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      collapseBtn.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    }

    // Store state (only for desktop)
    if (!isMobile()) {
      AFM?.Store?.set(STORE_KEY, collapsed);
    }

    // Update nav item tooltips
    updateTooltips(collapsed);

    // Notify listeners
    listeners.forEach(fn => {
      try { fn({ collapsed, mobile: isMobile() }); } catch (e) { console.error('[Sidebar]', e); }
    });
  }

  function updateTooltips(collapsed) {
    if (!sidebarEl) return;
    sidebarEl.querySelectorAll('.nav-item').forEach(item => {
      if (collapsed && !isMobile()) {
        const label = item.querySelector('.nav-label');
        if (label) item.setAttribute('data-tooltip', label.textContent.trim());
      } else {
        item.removeAttribute('data-tooltip');
      }
    });
  }

  function openMobile() {
    if (!sidebarEl || !overlayEl) return;
    isMobileOpen = true;
    sidebarEl.classList.add('is-mobile-open');
    overlayEl.classList.add('is-visible');
    document.body.style.overflow = 'hidden';
  }

  function closeMobile() {
    if (!sidebarEl || !overlayEl) return;
    isMobileOpen = false;
    sidebarEl.classList.remove('is-mobile-open');
    overlayEl.classList.remove('is-visible');
    document.body.style.overflow = '';
  }

  function onResize() {
    if (!sidebarEl) return;

    if (isMobile()) {
      // On mobile, always show full sidebar when open (no collapsed state)
      sidebarEl.classList.remove('is-collapsed');
      if (!isMobileOpen) {
        closeMobile();
      }
    } else {
      // On desktop, restore stored collapse preference
      closeMobile();
      const stored = AFM?.Store?.get(STORE_KEY, false);
      applyState(stored, false);
    }
  }

  function buildCollapseBtn() {
    const btn = document.createElement('button');
    btn.className = 'sidebar-collapse-btn';
    btn.setAttribute('aria-label', 'Collapse sidebar');
    btn.setAttribute('title', 'Collapse sidebar');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
    return btn;
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    return overlay;
  }

  function buildResizer() {
    const handle = document.createElement('div');
    handle.className = 'sidebar-resizer';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'vertical');
    handle.setAttribute('aria-label', 'Resize sidebar');
    handle.setAttribute('aria-valuemin', String(WIDTH_MIN));
    handle.setAttribute('aria-valuemax', String(WIDTH_MAX));
    handle.setAttribute('tabindex', '0');
    return handle;
  }

  /* ── Sidebar width (drag-to-resize) ── */

  function clampWidth(width) {
    const n = Math.round(Number(width));
    return Number.isFinite(n) ? Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, n)) : WIDTH_DEFAULT;
  }

  function setWidth(width, persist = true) {
    const w = clampWidth(width);
    document.documentElement.style.setProperty('--sidebar-width', `${w}px`);
    if (resizerEl) resizerEl.setAttribute('aria-valuenow', String(w));
    if (persist) AFM?.Store?.set(WIDTH_STORE_KEY, w);
    return w;
  }

  function currentWidth() {
    const raw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'));
    return Number.isFinite(raw) ? raw : WIDTH_DEFAULT;
  }

  function onResizerPointerDown(e) {
    if (isCollapsed || isMobile() || (e.button !== undefined && e.button !== 0)) return;
    e.preventDefault();
    resizeDrag = { startX: e.clientX, start: sidebarEl.getBoundingClientRect().width };
    if (resizerEl.setPointerCapture && e.pointerId !== undefined) resizerEl.setPointerCapture(e.pointerId);
    resizerEl.classList.add('is-dragging');
    sidebarEl.style.transition = 'none';
    if (mainArea) mainArea.style.transition = 'none';
    resizerEl.addEventListener('pointermove', onResizerPointerMove);
    resizerEl.addEventListener('pointerup', onResizerPointerEnd);
    resizerEl.addEventListener('pointercancel', onResizerPointerEnd);
  }

  function onResizerPointerMove(e) {
    if (!resizeDrag) return;
    setWidth(resizeDrag.start + (e.clientX - resizeDrag.startX), false);
  }

  function onResizerPointerEnd() {
    if (!resizeDrag) return;
    resizerEl.classList.remove('is-dragging');
    resizerEl.removeEventListener('pointermove', onResizerPointerMove);
    resizerEl.removeEventListener('pointerup', onResizerPointerEnd);
    resizerEl.removeEventListener('pointercancel', onResizerPointerEnd);
    sidebarEl.style.transition = '';
    if (mainArea) mainArea.style.transition = '';
    resizeDrag = null;
    AFM?.Store?.set(WIDTH_STORE_KEY, clampWidth(currentWidth()));
  }

  function onResizerKeydown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = (e.shiftKey ? WIDTH_STEP * 4 : WIDTH_STEP) * (e.key === 'ArrowRight' ? 1 : -1);
    setWidth(currentWidth() + step);
  }

  /** Revoke the session (best-effort) and return to the login page (ADR-009). */
  async function handleLogout() {
    try {
      await window.API.post('/auth/logout', undefined, { skipAuthRedirect: true, silent: true });
    } catch { /* best-effort: leave regardless of whether the server call succeeded */ }
    window.API.clearCsrfToken();
    window.location.href = 'login.html';
  }

  /* ── Keyboard navigation inside sidebar ── */
  function handleSidebarKeydown(e) {
    if (!sidebarEl) return;

    const navItems = Array.from(sidebarEl.querySelectorAll('.nav-item'));
    const current = document.activeElement;
    const idx = navItems.indexOf(current);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (idx < navItems.length - 1) navItems[idx + 1]?.focus();
        else navItems[0]?.focus();
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (idx > 0) navItems[idx - 1]?.focus();
        else navItems[navItems.length - 1]?.focus();
        break;

      case 'Enter':
      case ' ':
        if (current?.classList.contains('nav-item')) {
          e.preventDefault();
          current.click();
        }
        break;

      case 'Escape':
        if (isMobile() && isMobileOpen) {
          closeMobile();
          (document.querySelector('.mobile-menu-btn') || mobileMenuBtn)?.focus();
        }
        break;
    }
  }

  /* ── Public API ── */

  /** Initialize sidebar interactions */
  function init() {
    sidebarEl = document.querySelector('.sidebar');
    mainArea = document.querySelector('.main-area');
    mobileMenuBtn = document.querySelector('.mobile-menu-btn');

    if (!sidebarEl) {
      console.warn('[Sidebar] .sidebar element not found');
      return;
    }

    // Create collapse button if not present
    collapseBtn = sidebarEl.querySelector('.sidebar-collapse-btn');
    if (!collapseBtn) {
      collapseBtn = buildCollapseBtn();
      sidebarEl.appendChild(collapseBtn);
    }

    // Create overlay for mobile
    overlayEl = document.querySelector('.sidebar-overlay');
    if (!overlayEl) {
      overlayEl = buildOverlay();
      sidebarEl.parentElement.insertBefore(overlayEl, sidebarEl.nextSibling);
    }

    // Create resize handle if not present
    resizerEl = sidebarEl.querySelector('.sidebar-resizer');
    if (!resizerEl) {
      resizerEl = buildResizer();
      sidebarEl.appendChild(resizerEl);
    }

    // Restore state on desktop
    if (!isMobile()) {
      const stored = AFM?.Store?.get(STORE_KEY, false);
      applyState(stored, false);
      setWidth(AFM?.Store?.get(WIDTH_STORE_KEY, WIDTH_DEFAULT), false);
    }

    // ─── Event Bindings ───

    // Collapse toggle
    collapseBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (isMobile()) {
        closeMobile();
      } else {
        applyState(!isCollapsed);
      }
    });

    // Mobile menu button. Delegated: the button sits in the topbar, which
    // router.js replaces on every client-side navigation.
    document.addEventListener('click', e => {
      const btn = e.target.closest && e.target.closest('.mobile-menu-btn');
      if (!btn) return;
      e.preventDefault();
      mobileMenuBtn = btn;
      if (isMobileOpen) closeMobile();
      else openMobile();
    });

    // Drag-resize
    resizerEl.addEventListener('pointerdown', onResizerPointerDown);
    resizerEl.addEventListener('keydown', onResizerKeydown);
    resizerEl.addEventListener('dblclick', () => setWidth(WIDTH_DEFAULT));

    // Overlay click → close mobile sidebar
    overlayEl.addEventListener('click', closeMobile);

    // Close mobile sidebar when nav item clicked
    sidebarEl.addEventListener('click', e => {
      const navItem = e.target.closest('.nav-item');
      if (navItem && isMobile() && isMobileOpen) {
        // Small delay for visual feedback
        setTimeout(closeMobile, 150);
      }
    });

    // Log out (ADR-009). Revoke is best-effort — the user leaves either way,
    // since the point is to stop being logged in, not to prove the server
    // acknowledged it.
    sidebarEl.addEventListener('click', e => {
      const logoutBtn = e.target.closest('[data-action="logout"]');
      if (!logoutBtn) return;
      e.preventDefault();
      handleLogout();
    });

    // Keyboard nav
    sidebarEl.addEventListener('keydown', handleSidebarKeydown);

    // Resize handler
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResize, 100);
    });

    // Swipe gesture for mobile
    initSwipeGesture();

    // Double-click brand to toggle
    const brand = sidebarEl.querySelector('.brand');
    if (brand) {
      brand.addEventListener('dblclick', e => {
        e.preventDefault();
        if (!isMobile()) applyState(!isCollapsed);
      });
    }
  }

  /** Swipe-from-edge to open, swipe-left to close */
  function initSwipeGesture() {
    let touchStartX = 0;
    let touchStartY = 0;
    let tracking = false;

    document.addEventListener('touchstart', e => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      // Only track if starting from left edge (open) or sidebar is open (close)
      if (touchStartX < 30 || isMobileOpen) {
        tracking = true;
      }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!tracking || !isMobile()) return;
      // Prevent scrolling while swiping sidebar
    }, { passive: true });

    document.addEventListener('touchend', e => {
      if (!tracking || !isMobile()) { tracking = false; return; }

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = Math.abs(touch.clientY - touchStartY);

      // Require mostly horizontal swipe
      if (dy > Math.abs(dx)) { tracking = false; return; }

      const THRESHOLD = 70;

      if (dx > THRESHOLD && !isMobileOpen && touchStartX < 40) {
        // Swipe right from edge → open
        openMobile();
      } else if (dx < -THRESHOLD && isMobileOpen) {
        // Swipe left → close
        closeMobile();
      }

      tracking = false;
    }, { passive: true });
  }

  /** Toggle sidebar collapsed/expanded */
  function toggle() {
    if (isMobile()) {
      if (isMobileOpen) closeMobile();
      else openMobile();
    } else {
      applyState(!isCollapsed);
    }
  }

  /** Collapse sidebar */
  function collapse() {
    if (!isMobile()) applyState(true);
  }

  /** Expand sidebar */
  function expand() {
    if (isMobile()) openMobile();
    else applyState(false);
  }

  /** Get current collapsed state */
  function getState() {
    return {
      collapsed: isCollapsed,
      mobileOpen: isMobileOpen,
      mobile: isMobile(),
    };
  }

  /** Subscribe to state changes */
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return () => { listeners = listeners.filter(f => f !== fn); };
  }

  return { init, toggle, collapse, expand, getState, onChange };
})();

/* ── Auto-init ── */
document.addEventListener('DOMContentLoaded', () => {
  Sidebar.init();
});

/* Expose globally */
window.Sidebar = Sidebar;