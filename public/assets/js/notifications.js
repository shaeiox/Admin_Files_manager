/* ============================================
   NOTIFICATIONS.JS — Shared topbar bell panel

   Wires the bell button on a page to the REAL activity feed already
   exposed by GET /api/dashboard/summary (MetadataService.getActivities).
   No unread dot is rendered: the feed carries no read/unread signal.

   States are distinct and honest: loading, rows, an empty state, and an
   unavailable state with a retry control. All filesystem-derived strings
   go through escapeHtml before reaching markup.

   The panel closes on Escape (focus returns to the bell), on outside
   click, and on page navigation (router.js calls close()).
   ============================================ */

'use strict';

const AFMNotifications = (() => {
  let panel = null;
  let boundBell = null;
  let listening = false;

  function $(sel) { return document.querySelector(sel); }

  function bells() {
    return [...document.querySelectorAll('.topbar [data-tip="Notifications"]')];
  }

  function ensurePanel() {
    if (panel && panel.parentElement) return panel;
    panel = AFM.el('div', {
      class: 'notif-panel',
      id: 'notifPanel',
      role: 'dialog',
      'aria-label': 'Recent activity',
      hidden: true,
    });
    document.body.appendChild(panel);
    return panel;
  }

  function positionUnder(bell) {
    const r = bell.getBoundingClientRect();
    const p = ensurePanel();
    p.style.top = `${Math.round(r.bottom + 8)}px`;
    // right-align to the bell; clamp to the viewport on narrow screens
    const width = Math.min(360, window.innerWidth - 16);
    p.style.width = `${width}px`;
    const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
    p.style.left = `${Math.round(left)}px`;
  }

  function renderLoading() {
    ensurePanel().innerHTML = `
      <div class="notif-panel-header"><h3>Recent activity</h3></div>
      <div class="notif-panel-body" aria-busy="true">
        <div class="notif-empty">Loading…</div>
      </div>`;
  }

  function renderError() {
    ensurePanel().innerHTML = `
      <div class="notif-panel-header"><h3>Recent activity</h3></div>
      <div class="notif-panel-body">
        <div class="notif-empty">Activity is unavailable right now.</div>
        <button type="button" class="btn btn-ghost btn-sm notif-retry">Retry</button>
      </div>`;
    const retry = panel.querySelector('.notif-retry');
    if (retry) retry.addEventListener('click', () => load());
  }

  function renderRows(activities) {
    const usable = (Array.isArray(activities) ? activities : [])
      .filter((row) => row && typeof row === 'object' && typeof row.action === 'string');
    if (usable.length === 0) {
      ensurePanel().innerHTML = `
        <div class="notif-panel-header"><h3>Recent activity</h3></div>
        <div class="notif-panel-body">
          <div class="notif-empty">No recent activity</div>
        </div>`;
      return;
    }
    const rows = usable.slice(0, 10).map((row) => {
      const target = typeof row.target === 'string' && row.target ? ` <strong>${AFM.escapeHtml(row.target)}</strong>` : '';
      const folder = typeof row.folder === 'string' && row.folder.trim() !== ''
        ? `${AFM.escapeHtml(row.folder.trim())} · ` : '';
      const when = typeof row.time === 'number' && Number.isFinite(row.time) && row.time > 0
        ? AFM.escapeHtml(AFM.Format.date(new Date(row.time))) : '';
      return `<div class="notif-item">
        <div class="notif-item-text">${AFM.escapeHtml(row.action)}${target}</div>
        <div class="notif-item-meta">${folder}${when}</div>
      </div>`;
    }).join('');
    ensurePanel().innerHTML = `
      <div class="notif-panel-header"><h3>Recent activity</h3></div>
      <div class="notif-panel-body">${rows}</div>`;
  }

  async function load() {
    renderLoading();
    try {
      const payload = await window.API.get('/dashboard/summary', { silent: true });
      renderRows(payload && Array.isArray(payload.activities) ? payload.activities : []);
    } catch (e) {
      console.error('[Notifications] summary request failed:', e);
      renderError();
    }
  }

  function isOpen() {
    return panel && !panel.hidden;
  }

  function open(bell) {
    boundBell = bell || boundBell;
    const p = ensurePanel();
    positionUnder(boundBell || bells()[0]);
    p.hidden = false;
    requestAnimationFrame(() => p.classList.add('is-open'));
    bells().forEach((b) => b.setAttribute('aria-expanded', 'true'));
    load();
    const first = p.querySelector('.notif-panel-body') || p;
    if (first && typeof first.focus === 'function') {
      p.setAttribute('tabindex', '-1');
      p.focus({ preventScroll: true });
    }
  }

  function close() {
    if (!panel || panel.hidden) return;
    panel.classList.remove('is-open');
    panel.hidden = true;
    bells().forEach((b) => b.setAttribute('aria-expanded', 'false'));
    if (boundBell && document.contains(boundBell)) {
      boundBell.focus({ preventScroll: true });
    }
  }

  function toggle(bell) {
    if (isOpen() && boundBell === bell) close();
    else open(bell);
  }

  /**
   * Bind once (page modules call this on every init): delegated click on the
   * bell, outside-click close, and Escape close with focus return.
   */
  function bindTopbarBell() {
    bells().forEach((b) => {
      b.setAttribute('aria-expanded', isOpen() ? 'true' : 'false');
      if (!b.getAttribute('aria-controls')) b.setAttribute('aria-controls', 'notifPanel');
    });
    if (listening) return;
    listening = true;

    document.addEventListener('click', (e) => {
      const bell = e.target.closest('.topbar [data-tip="Notifications"]');
      if (bell) {
        e.preventDefault();
        toggle(bell);
        return;
      }
      if (isOpen() && panel && !e.target.closest('#notifPanel')) close();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) {
        e.stopPropagation();
        close();
      }
    });
  }

  return { bindTopbarBell, open, close, isOpen };
})();

if (window.AFM) window.AFM.Notifications = AFMNotifications;
