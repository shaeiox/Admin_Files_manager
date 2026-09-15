/* ============================================
   SIDEBAR.JS — Collapsible Sidebar Controller
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Sidebar = (() => {

  /* ── Constants ── */
  const STORE_KEY = 'sidebar-collapsed';
  const MOBILE_BREAKPOINT = 860;

  /* ── State ── */
  let sidebarEl = null;
  let overlayEl = null;
  let collapseBtn = null;
  let mobileMenuBtn = null;
  let mainArea = null;
  let isCollapsed = false;
  let isMobileOpen = false;
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
          mobileMenuBtn?.focus();
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

    // Restore state on desktop
    if (!isMobile()) {
      const stored = AFM?.Store?.get(STORE_KEY, false);
      applyState(stored, false);
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

    // Mobile menu button
    mobileMenuBtn?.addEventListener('click', e => {
      e.preventDefault();
      if (isMobileOpen) closeMobile();
      else openMobile();
    });

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