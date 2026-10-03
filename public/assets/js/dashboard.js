/* ============================================
   DASHBOARD.JS — Enterprise Dashboard Logic
   Admin Files Manager — Dimension Style

   Every figure on this page comes from the API. The application keeps no
   history (no time series, no snapshots, no retained logs), so nothing here
   renders a chart, a period comparison, a percentage change or a health
   verdict: each of those would be a number nothing measured. Panels report
   what they know, including when they know nothing.

   See openspec/changes/dashboard-real-data/p6-contract.md for the seams.
   ============================================ */

'use strict';

const Dashboard = (() => {

  const { $, icon, Format, Toast, Modal, escapeHtml } = window.AFM;

  /* ══════════════════════════════════════════
     CONFIG
     ══════════════════════════════════════════ */

  /** Only the cheap metrics endpoint is polled; the summary walks the tree. */
  const HEALTH_POLL_MS = 5000;

  /** Rendered in place of a figure that was never measured. Never "0". */
  const UNAVAILABLE_MARK = '—';

  /**
   * `stats[].value` carries no unit field for counts and byte totals, so the
   * value kind is read off the server's own `key`. An unknown key falls back to
   * the declared `unit`, then to a plain count.
   */
  const STAT_VALUE_KINDS = {
    files: 'count',
    folders: 'count',
    treeBytes: 'bytes',
    volume: 'gigabytes',
  };

  /** Server icon tokens that are not keys in AFM.Icons. */
  const ICON_ALIASES = {
    'hard-drive': 'hardDrive',
    harddrive: 'hardDrive',
    hdd: 'hardDrive',
    disk: 'hardDrive',
    storage: 'hardDrive',
    memory: 'cpu',
    ram: 'cpu',
  };

  /** Only these activity types reach the stylesheet as a class name. */
  const ACTIVITY_TYPE_CLASSES = ['upload', 'download', 'delete', 'edit', 'folder'];

  const ACTIVITY_ICONS = {
    upload: 'upload',
    download: 'download',
    delete: 'trash',
    edit: 'edit',
    folder: 'folderPlus',
  };

  /** A breakdown colour is a CSS value, so only a real hex colour is used. */
  const CSS_HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  /**
   * Static navigation shortcuts. Every entry here maps to an endpoint or page
   * that exists: there is no share service, no cloud importer, no user list and
   * no permission model in this application, so no shortcut claims one.
   */
  const quickActions = [
    { label: 'Upload files', desc: 'Write files into the storage root', icon: 'uploadCloud', href: 'uploads.html' },
    { label: 'New folder', desc: 'Create a directory at the storage root', icon: 'folderPlus', action: 'newFolder' },
    { label: 'Browse files', desc: 'List, rename and delete stored files', icon: 'folder', href: 'files.html' },
    { label: 'Server health', desc: 'Re-read memory and uptime metrics', icon: 'gauge', action: 'health' },
  ];

  /**
   * What this application actually does, each entry gated on the evidence the
   * summary payload carries for it. These are statements about the code
   * (FileSystemService.getTreeStats, buildStorageBreakdown, MetadataService,
   * getVolumeStats, getHealthMetrics) — not measurements, so none of them
   * carries a figure.
   */
  const CAPABILITIES = [
    {
      name: 'Files and folders counted by a bounded scan of the storage root',
      evidence: (d) => d.hasFilesStat && d.hasFoldersStat,
    },
    {
      name: 'Storage measured by file type from that same scan',
      evidence: (d) => d.hasBreakdown,
    },
    {
      name: 'Download counts and stars kept in a JSON metadata store',
      evidence: (d) => d.hasTopFiles || d.hasActivities,
    },
    {
      name: 'Volume capacity reported only when the platform exposes it',
      evidence: (d) => d.hasStorage,
    },
    {
      name: 'Memory and uptime read from the host on every health poll',
      evidence: (d) => d.hasHealth,
    },
  ];

  /* ══════════════════════════════════════════
     STATE
     ══════════════════════════════════════════ */

  /**
   * `null` means "the server did not send this field" (→ unavailable); `[]`
   * means "the server sent an empty collection" (→ empty). Collapsing the two
   * is what made a missing reading look like a real zero.
   */
  let state = {
    loading: true,
    errored: false,
    healthLoading: true,
    healthErrored: false,
    stats: null,
    storage: null,
    storageBreakdown: null,
    activities: null,
    topFiles: null,
    health: null,
  };

  let healthPollingTimer = null;

  /* ══════════════════════════════════════════
     PURE HELPERS — no DOM, no request
     ══════════════════════════════════════════ */

  function finiteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  /**
   * Map a panel's inputs onto exactly one of the seven allowed states.
   *
   * Precedence is deliberate: an in-flight panel is `loading` even if it is
   * also broken, a failed request is `error` even if the field was missing,
   * and a field the server never sent is `unavailable` even when rows exist.
   *
   * @param {{loading?:boolean, errored?:boolean, available?:boolean,
   *          renderable?:number, dropped?:number}} input
   * @returns {'loading'|'success'|'empty'|'unavailable'|'partial'|'error'}
   */
  function resolvePanelState(input) {
    const i = input || {};
    if (i.loading === true) return 'loading';
    if (i.errored === true) return 'error';
    if (i.available === false) return 'unavailable';
    if ((finiteNumber(i.renderable) || 0) <= 0) return 'empty';
    if ((finiteNumber(i.dropped) || 0) > 0) return 'partial';
    return 'success';
  }

  /**
   * Panel state for the metrics panel.
   *
   * Pure, so the precedence is checkable without a browser. A failed summary
   * also fails the metrics read, because the metrics request never ran: without
   * that, a failed first load would leave this panel on a skeleton forever.
   *
   * @param {{healthLoading?:boolean, healthErrored?:boolean, errored?:boolean,
   *          health:Array|null, renderable:number, dropped:number}} view
   */
  function resolveHealthPanelState(view) {
    const v = view || {};
    return resolvePanelState({
      loading: v.healthLoading === true,
      errored: v.healthErrored === true || v.errored === true,
      available: Array.isArray(v.health),
      renderable: v.renderable,
      dropped: v.dropped,
    });
  }

  /**
   * Decide the volume line shown on the storage card.
   *
   * The unavailable-vs-measured decision belongs to AFM.resolveStorageDisplay
   * (the shared sidebar resolver); this only decides what to do with its answer
   * so a panel never re-derives it. An unmeasured capacity renders the dash,
   * never "0" and never "0.0%".
   *
   * @param {object|null} storage - summary.storage
   * @param {Function|null} [resolver] - defaults to AFM.resolveStorageDisplay
   * @returns {{state:'measured'|'unavailable', text:string, meta:string}}
   */
  function resolveVolumeLine(storage, resolver) {
    const decide = resolver || (window.AFM && window.AFM.resolveStorageDisplay) || null;
    let view = null;
    try {
      view = decide ? decide(storage) : null;
    } catch (e) {
      view = null;
    }
    if (!view || view.available !== true) {
      return { state: 'unavailable', text: UNAVAILABLE_MARK, meta: 'Volume usage unavailable' };
    }
    const text = typeof view.pctText === 'string' && view.pctText.trim() !== ''
      ? view.pctText.trim()
      : UNAVAILABLE_MARK;
    return {
      state: 'measured',
      text,
      meta: typeof view.meta === 'string' ? view.meta : UNAVAILABLE_MARK,
    };
  }

  /**
   * Format a GIGABYTE figure.
   *
   * `storageBreakdown[].valueGb` is already gigabytes, so this consumes it as
   * sent and appends the suffix: no multiplication, no re-derivation. Decimals
   * follow magnitude so a real but small category can never collapse into a
   * fabricated "0 GB". `bytesHint` is only used to tell a genuine zero apart
   * from one that fell below the server's 1e-6 GB resolution.
   *
   * @returns {string|null} null when the figure is unusable
   */
  function formatGb(valueGb, bytesHint) {
    const gb = finiteNumber(valueGb);
    if (gb === null || gb < 0) return null;
    if (gb === 0) {
      const bytes = finiteNumber(bytesHint);
      return bytes !== null && bytes > 0 ? '<0.000001 GB' : '0 GB';
    }
    if (gb < 0.000001) return '<0.000001 GB';

    const abs = Math.abs(gb);
    const decimals = abs < 0.001 ? 6 : abs < 0.1 ? 4 : abs < 10 ? 2 : abs < 1000 ? 1 : 0;
    let text = gb.toFixed(decimals);
    // Trim only fractional padding: "1200" must not become "12".
    if (decimals > 0) text = text.replace(/0+$/, '').replace(/\.$/, '');
    return `${text} GB`;
  }

  /**
   * Bar width as a percentage of the SERVER-computed maximum.
   *
   * The maximum is never recomputed here: it is ranked over the full retained
   * set on the server, so a browser-side max over the returned page would be a
   * different number. Anything unusable yields 0% rather than NaN or Infinity.
   */
  function toProportion(value, max) {
    const v = finiteNumber(value);
    const m = finiteNumber(max);
    if (v === null || m === null || m <= 0 || v <= 0) return 0;
    return Math.min((v / m) * 100, 100);
  }

  /**
   * Format one health metric in its own unit.
   *
   * The API sends no status and no level, so none is inferred: a bar is drawn
   * only where the metric genuinely is a percentage of a real denominator, and
   * it is never coloured against an invented threshold. A duration stays a
   * duration — dividing seconds by two to fake a percentage is exactly the
   * kind of invention this page refuses.
   *
   * @returns {object|null} null when the metric cannot be rendered truthfully
   */
  function formatMetric(metric, fmt) {
    const f = fmt || Format;
    const value = finiteNumber(metric && metric.value);
    if (value === null || value < 0) return null;

    const unit = typeof metric.unit === 'string' ? metric.unit : '';
    const name = typeof metric.name === 'string' ? metric.name : '';

    if (unit === '%') {
      return {
        name, value, unit,
        text: `${value}%`,
        bar: true,
        barWidth: Math.min(Math.max(value, 0), 100),
      };
    }
    if (unit === 's') {
      return { name, value, unit, text: f.duration(value), bar: false, barWidth: null };
    }
    return { name, value, unit, text: `${value}${unit}`, bar: false, barWidth: null };
  }

  /**
   * Format an epoch from the metadata store.
   *
   * A missing, zero, negative or non-numeric timestamp is an absence, so it
   * renders the dash rather than 1 January 1970 or "Invalid Date". Anything
   * before 2009 is not a timestamp this application can have produced.
   */
  function formatTimestamp(ms, fmt) {
    const f = fmt || Format;
    const t = finiteNumber(ms);
    if (t === null || t < Date.UTC(2009, 0, 1)) return UNAVAILABLE_MARK;
    const text = f.dateTime(new Date(t));
    return (typeof text === 'string' && text !== '' && !/invalid/i.test(text))
      ? text
      : UNAVAILABLE_MARK;
  }

  /**
   * Format one stat value in the unit its `key` implies.
   * @returns {{kind:string, text:string}|null}
   */
  function formatStatValue(stat, fmt) {
    const f = fmt || Format;
    const value = finiteNumber(stat && stat.value);
    if (value === null || value < 0) return null;

    const key = (stat && typeof stat.key === 'string') ? stat.key : '';
    const unit = (stat && typeof stat.unit === 'string') ? stat.unit : '';
    const kind = Object.prototype.hasOwnProperty.call(STAT_VALUE_KINDS, key)
      ? STAT_VALUE_KINDS[key]
      : (unit === 'GB' ? 'gigabytes' : 'count');

    if (kind === 'gigabytes') return { kind, text: formatGb(value) };
    if (kind === 'bytes') return { kind, text: f.bytes(value, 1) };
    return { kind, text: f.number(value) };
  }

  /**
   * Split a client path into a display name and its folder.
   * Client paths are POSIX strings rooted at "/"; a root-level file keeps "/".
   */
  function splitClientPath(clientPath) {
    if (typeof clientPath !== 'string' || clientPath.trim() === '') {
      return { name: UNAVAILABLE_MARK, folder: UNAVAILABLE_MARK };
    }
    const trimmed = clientPath.trim().replace(/\/+$/, '');
    if (trimmed === '') return { name: UNAVAILABLE_MARK, folder: '/' };
    const cut = trimmed.lastIndexOf('/');
    if (cut < 0) return { name: trimmed, folder: '/' };
    return {
      name: trimmed.slice(cut + 1),
      folder: cut === 0 ? '/' : trimmed.slice(0, cut),
    };
  }

  /**
   * Map a server icon token onto a key that exists, else the fallback.
   *
   * Uses an own-property check rather than a truthiness test: `Icons` is an
   * object literal, so a token like "constructor" would otherwise resolve to an
   * inherited function and get interpolated straight into the markup.
   */
  function resolveIconName(name, fallback) {
    const def = fallback || 'activity';
    if (typeof name !== 'string' || name === '') return def;
    const icons = (window.AFM && window.AFM.Icons) || null;
    if (!icons) return def;
    if (Object.prototype.hasOwnProperty.call(icons, name)) return name;
    const alias = ICON_ALIASES[name];
    if (alias && Object.prototype.hasOwnProperty.call(icons, alias)) return alias;
    return def;
  }

  /** A breakdown colour is applied as a style VALUE, never as a class name. */
  function safeColor(value) {
    const text = typeof value === 'string' ? value.trim() : '';
    return CSS_HEX.test(text) ? text : 'var(--border-secondary)';
  }

  /** Metadata strings are free-form: escape before any HTML insertion. */
  function text(value) {
    if (typeof value !== 'string') return UNAVAILABLE_MARK;
    const trimmed = value.trim();
    return escapeHtml(trimmed === '' ? UNAVAILABLE_MARK : trimmed);
  }

  /* ══════════════════════════════════════════
     PANEL CHROME — existing .skeleton / .empty-state only
     ══════════════════════════════════════════ */

  const PANEL_NOTICE = {
    unavailable: {
      iconName: 'helpCircle',
      title: 'Not reported',
      desc: 'The server did not report this. Nothing was measured, so no figure is shown.',
    },
    empty: {
      iconName: 'inbox',
      title: 'Nothing recorded',
      desc: 'The server answered with a real, empty result.',
    },
    error: {
      iconName: 'alert',
      title: 'Could not load',
      desc: 'The request failed, so nothing here is known. Use Refresh to try again.',
    },
  };

  function panelNotice(stateName, noun) {
    const copy = PANEL_NOTICE[stateName] || PANEL_NOTICE.error;
    const title = noun ? `${copy.title} — ${noun}` : copy.title;
    return `
      <div class="empty-state" style="padding:40px 24px;">
        <div class="empty-icon">${icon(resolveIconName(copy.iconName, 'info'), 26)}</div>
        <div class="empty-title">${escapeHtml(title)}</div>
        <div class="empty-desc">${escapeHtml(copy.desc)}</div>
      </div>
    `;
  }

  /** A partial panel keeps its real rows and explains what it could not show. */
  function partialNote(message) {
    return `
      <div class="empty-state" style="padding:16px 24px 0;">
        <div class="empty-desc">${escapeHtml(message)}</div>
      </div>
    `;
  }

  function skeletonLines(count, extraClass) {
    const cls = extraClass ? `skeleton ${extraClass}` : 'skeleton';
    return Array.from({ length: count }, () => `<div class="${cls} skeleton-text"></div>`).join('');
  }

  /* ══════════════════════════════════════════
     DATA
     ══════════════════════════════════════════ */

  /** An array field, or null when the server did not send one at all. */
  function pickArray(payload, key) {
    return payload && Array.isArray(payload[key]) ? payload[key] : null;
  }

  /**
   * Load the summary.
   *
   * Resolves to a boolean instead of rejecting: the caller must be able to tell
   * a failed load from a successful one without an unhandled rejection, and
   * `init()` must never start a polling timer on a failure.
   *
   * @returns {Promise<boolean>}
   */
  async function loadSummary() {
    state.loading = true;
    state.errored = false;
    renderAll();

    try {
      // Both dashboard endpoints answer with a bare body: there is no envelope
      // to unwrap and no `.data` to reach for.
      const payload = await window.API.get('/dashboard/summary');

      state.stats = pickArray(payload, 'stats');
      state.storageBreakdown = pickArray(payload, 'storageBreakdown');
      state.activities = pickArray(payload, 'activities');
      state.topFiles = pickArray(payload, 'topFiles');
      state.health = pickArray(payload, 'health');
      state.storage = (payload && typeof payload.storage === 'object' && payload.storage !== null)
        ? payload.storage
        : null;

      state.loading = false;
      state.errored = false;
      state.healthLoading = false;
      state.healthErrored = false;
      renderAll();
      return true;
    } catch (error) {
      console.error('[Dashboard] Summary request failed:', error);
      state.loading = false;
      state.errored = true;
      // The metrics request never ran, so this panel must leave `loading` too -
      // otherwise it would sit on a skeleton forever.
      state.healthLoading = false;
      renderAll();
      return false;
    }
  }

  /**
   * Read the metrics endpoint.
   *
   * The only endpoint polled: it reports memory and uptime from the host and
   * performs no filesystem walk.
   *
   * @returns {Promise<'skipped'|true|false>} false means the read failed
   */
  async function readHealth() {
    // Skip while the tab is hidden so a background tab costs nothing.
    if (document.visibilityState !== 'visible') return 'skipped';

    try {
      const metrics = await window.API.get('/dashboard/health');
      if (!Array.isArray(metrics)) {
        throw new Error('Metrics response was not an array');
      }
      state.health = metrics;
      state.healthLoading = false;
      state.healthErrored = false;
      renderHealth();
      return true;
    } catch (error) {
      console.warn('[Dashboard] Health read failed:', error && error.message);
      state.healthLoading = false;
      state.healthErrored = true;
      renderHealth();
      return false;
    }
  }

  /* ══════════════════════════════════════════
     RENDERERS
     ══════════════════════════════════════════ */

  function renderAll() {
    renderVolumeLine();
    renderStats();
    renderDonut();
    renderActivity();
    renderTopFiles();
    renderCapabilities();
    renderHealth();
    renderQuickActions();
  }

  /* ── STAT CARDS ─────────────────────────── */

  function renderStats() {
    const wrap = $('#statsGrid');
    if (!wrap) return;

    const rows = Array.isArray(state.stats) ? state.stats : [];
    const usable = [];
    let dropped = 0;
    rows.forEach((stat) => {
      const view = formatStatValue(stat);
      if (view) usable.push({ stat, view });
      else dropped++;
    });

    const panel = resolvePanelState({
      loading: state.loading,
      errored: state.errored,
      available: Array.isArray(state.stats),
      renderable: usable.length,
      dropped,
    });

    if (panel === 'loading') {
      wrap.innerHTML = Array.from({ length: 4 }, () => `
        <div class="stat-card">
          <div class="stat-top"><div class="skeleton skeleton-circle"></div></div>
          <div class="stat-main">
            <div class="skeleton skeleton-title" style="width:45%;"></div>
            <div class="skeleton skeleton-text" style="width:65%;"></div>
          </div>
        </div>
      `).join('');
      return;
    }
    if (panel !== 'success' && panel !== 'partial') {
      wrap.innerHTML = panelNotice(panel, 'key metrics');
      return;
    }

    const cards = usable.map(({ stat, view }, i) => {
      const total = formatGb(stat.totalGb);
      return `
        <div class="stat-card" style="animation-delay:${i * 60}ms">
          <div class="stat-top">
            <div class="stat-icon">${icon(resolveIconName(stat.icon, 'file'), 18)}</div>
          </div>
          <div class="stat-main">
            <div class="stat-value">${escapeHtml(view.text)}${
              total !== null ? `<span class="unit">of ${escapeHtml(total)}</span>` : ''
            }</div>
            <div class="stat-label">${text(stat.label)}</div>
          </div>
        </div>
      `;
    }).join('');

    wrap.innerHTML = cards + (
      panel === 'partial'
        ? partialNote('Some metrics were left out: the server sent a value that is not a usable number.')
        : ''
    );
  }

  /* ── STORAGE DONUT ──────────────────────── */

  function renderVolumeLine() {
    const el = $('#storageVolume');
    if (!el) return;

    if (state.loading) {
      el.textContent = 'Reading…';
      el.setAttribute('data-state', 'loading');
      return;
    }
    if (state.errored) {
      el.textContent = 'Volume usage unavailable';
      el.setAttribute('data-state', 'unavailable');
      el.title = '';
      return;
    }

    const line = resolveVolumeLine(state.storage);
    el.textContent = line.state === 'measured'
      ? `${line.text} of volume used`
      : 'Volume usage unavailable';
    el.setAttribute('data-state', line.state);
    el.title = line.meta;
  }

  function renderDonut() {
    const wrap = $('#storageDonut');
    if (!wrap) return;

    const rows = Array.isArray(state.storageBreakdown) ? state.storageBreakdown : [];
    const usable = [];
    let dropped = 0;
    rows.forEach((row) => {
      const share = finiteNumber(row && row.percentage);
      const label = formatGb(row && row.valueGb, row && row.bytes);
      // A row needs a server-computed share to size its arc. Without one there
      // is no honest width to draw, so it is dropped rather than guessed.
      if (share === null || share < 0 || label === null) {
        dropped++;
        return;
      }
      usable.push({ row, share, label });
    });

    const panel = resolvePanelState({
      loading: state.loading,
      errored: state.errored,
      available: Array.isArray(state.storageBreakdown),
      renderable: usable.length,
      dropped,
    });

    if (panel === 'loading') {
      wrap.innerHTML = '<div class="skeleton skeleton-card"></div>';
      return;
    }
    if (panel !== 'success' && panel !== 'partial') {
      wrap.innerHTML = panelNotice(panel, 'storage breakdown');
      return;
    }

    const RADIUS = 60;
    const CIRC = 2 * Math.PI * RADIUS;
    let offset = 0;
    const rings = usable.map(({ row, share }, i) => {
      const dash = (Math.min(share, 100) / 100) * CIRC;
      const arc = `<circle
        cx="75" cy="75" r="${RADIUS}"
        stroke="${safeColor(row.color)}"
        stroke-dasharray="${dash} ${CIRC}"
        stroke-dashoffset="${-offset}"
        data-seg="${i}"
      />`;
      offset += dash;
      return arc;
    }).join('');

    // The centre reconciles parts against the whole, so it is the one place the
    // raw byte total belongs: the per-category labels above stay in gigabytes.
    const treeBytes = finiteNumber(state.storage && state.storage.treeBytes);
    const centreValue = treeBytes !== null && treeBytes >= 0 ? Format.bytes(treeBytes, 1) : UNAVAILABLE_MARK;

    wrap.innerHTML = `
      <div class="donut-wrap">
        <div class="donut">
          <svg viewBox="0 0 150 150">${rings}</svg>
          <div class="donut-center">
            <div class="donut-value">${escapeHtml(centreValue)}</div>
            <div class="donut-label">Scanned</div>
          </div>
        </div>
        <div class="donut-legend">
          ${usable.map(({ row, label }, i) => `
            <div class="donut-legend-row" data-idx="${i}">
              <span class="legend-swatch" style="background:${safeColor(row.color)}"></span>
              <span class="name">${text(row.label)}</span>
              <span class="val">${escapeHtml(label)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` + (
      panel === 'partial'
        ? partialNote('Some file types were left out: the server sent a share that is not a usable number.')
        : ''
    );

    // Legend hover highlights the matching arc.
    wrap.querySelectorAll('.donut-legend-row').forEach((row) => {
      row.addEventListener('mouseenter', () => {
        const idx = row.getAttribute('data-idx');
        wrap.querySelectorAll('circle').forEach((arc) => {
          arc.style.opacity = arc.getAttribute('data-seg') === idx ? '1' : '0.25';
        });
      });
      row.addEventListener('mouseleave', () => {
        wrap.querySelectorAll('circle').forEach((arc) => { arc.style.opacity = '1'; });
      });
    });
  }

  /* ── ACTIVITY FEED ──────────────────────── */

  function renderActivity() {
    const wrap = $('#activityFeed');
    if (!wrap) return;

    const rows = Array.isArray(state.activities) ? state.activities : [];
    const usable = rows.filter((row) => row && typeof row === 'object' && typeof row.action === 'string');
    const dropped = rows.length - usable.length;

    const panel = resolvePanelState({
      loading: state.loading,
      errored: state.errored,
      available: Array.isArray(state.activities),
      renderable: usable.length,
      dropped,
    });

    if (panel === 'loading') {
      wrap.innerHTML = skeletonLines(5);
      return;
    }
    if (panel !== 'success' && panel !== 'partial') {
      wrap.innerHTML = panelNotice(panel, 'recent activity');
      return;
    }

    wrap.innerHTML = usable.map((row) => {
      const type = typeof row.type === 'string' ? row.type : '';
      const cls = ACTIVITY_TYPE_CLASSES.indexOf(type) >= 0 ? type : 'activity';
      const folder = typeof row.folder === 'string' && row.folder.trim() !== '' ? row.folder : '';
      return `
        <div class="activity-item">
          <div class="activity-ico ${cls}">${icon(resolveIconName(ACTIVITY_ICONS[type], 'activity'), 14)}</div>
          <div class="activity-body">
            <div class="activity-text">
              ${text(row.action)} <strong>${text(row.target)}</strong>
            </div>
            <div class="activity-meta">
              ${folder ? `<span>${escapeHtml(folder.trim())}</span><span class="sep"></span>` : ''}
              <span>${escapeHtml(formatTimestamp(row.time))}</span>
            </div>
          </div>
        </div>
      `;
    }).join('') + (
      panel === 'partial'
        ? partialNote('Some entries were left out: they carried no readable action.')
        : ''
    );
  }

  /* ── TOP DOWNLOADS ──────────────────────── */

  function renderTopFiles() {
    const wrap = $('#topFiles');
    if (!wrap) return;

    const rows = Array.isArray(state.topFiles) ? state.topFiles : [];
    const usable = [];
    let dropped = 0;
    rows.forEach((row) => {
      const downloads = finiteNumber(row && row.downloads);
      const max = finiteNumber(row && row.max);
      if (!row || typeof row.path !== 'string' || downloads === null) {
        dropped++;
        return;
      }
      usable.push({ row, downloads, max });
    });

    const panel = resolvePanelState({
      loading: state.loading,
      errored: state.errored,
      available: Array.isArray(state.topFiles),
      renderable: usable.length,
      dropped,
    });

    if (panel === 'loading') {
      wrap.innerHTML = skeletonLines(5);
      return;
    }
    if (panel !== 'success' && panel !== 'partial') {
      wrap.innerHTML = panelNotice(panel, 'download counts');
      return;
    }

    wrap.innerHTML = usable.map(({ row, downloads, max }, i) => {
      const seg = splitClientPath(row.path);
      return `
        <div class="rank-row">
          <div class="rank-num">${Format.pad(i + 1)}</div>
          <div class="rank-info">
            <div class="rank-name">${escapeHtml(seg.name)}</div>
            <div class="rank-sub">${escapeHtml(seg.folder)}</div>
          </div>
          <div class="rank-bar-wrap">
            <div class="progress progress-sm">
              <div class="progress-bar" style="width:${toProportion(downloads, max).toFixed(1)}%"></div>
            </div>
          </div>
          <div class="rank-count">${escapeHtml(Format.number(downloads))}</div>
        </div>
      `;
    }).join('') + (
      panel === 'partial'
        ? partialNote('Some entries were left out: they carried no readable path or download count.')
        : ''
    );
  }

  /* ── CAPABILITIES ───────────────────────── */

  function renderCapabilities() {
    const wrap = $('#capabilities');
    if (!wrap) return;

    const statKeys = new Set(
      (Array.isArray(state.stats) ? state.stats : [])
        .filter((s) => s && typeof s.key === 'string')
        .map((s) => s.key)
    );
    const evidence = {
      hasFilesStat: statKeys.has('files'),
      hasFoldersStat: statKeys.has('folders'),
      hasBreakdown: Array.isArray(state.storageBreakdown) && state.storageBreakdown.length > 0,
      hasTopFiles: Array.isArray(state.topFiles) && state.topFiles.length > 0,
      hasActivities: Array.isArray(state.activities) && state.activities.length > 0,
      hasStorage: state.storage !== null,
      hasHealth: Array.isArray(state.health) && state.health.length > 0,
    };

    const supported = CAPABILITIES.filter((c) => {
      try {
        return c.evidence(evidence) === true;
      } catch (e) {
        return false;
      }
    });
    const dropped = CAPABILITIES.length - supported.length;

    const panel = resolvePanelState({
      loading: state.loading,
      errored: state.errored,
      available: Array.isArray(state.stats),
      renderable: supported.length,
      dropped,
    });

    if (panel === 'loading') {
      wrap.innerHTML = skeletonLines(5, 'skeleton-title');
      return;
    }
    if (panel !== 'success' && panel !== 'partial') {
      wrap.innerHTML = panelNotice(panel, 'capabilities');
      return;
    }

    wrap.innerHTML = supported.map((c, i) => `
      <div class="numbered-row">
        <div class="numbered-name">${escapeHtml(c.name)}</div>
        <div class="numbered-index">${Format.pad(i + 1)}</div>
      </div>
    `).join('') + (
      panel === 'partial'
        ? partialNote('Entries the current response could not evidence were left out.')
        : ''
    );
  }

  /* ── SERVER HEALTH ──────────────────────── */

  function renderHealth() {
    const wrap = $('#serverHealth');
    if (!wrap) return;

    const rows = Array.isArray(state.health) ? state.health : [];
    const usable = [];
    let dropped = 0;
    rows.forEach((row) => {
      const view = formatMetric(row);
      if (view) usable.push({ row, view });
      else dropped++;
    });

    const panel = resolveHealthPanelState({
      healthLoading: state.healthLoading,
      healthErrored: state.healthErrored,
      errored: state.errored,
      health: state.health,
      renderable: usable.length,
      dropped,
    });

    if (panel === 'loading') {
      wrap.innerHTML = skeletonLines(3, 'skeleton-title');
      return;
    }
    if (panel !== 'success' && panel !== 'partial') {
      wrap.innerHTML = panelNotice(panel, 'server metrics');
      return;
    }

    wrap.innerHTML = usable.map(({ row, view }) => `
      <div class="health-row">
        <div class="health-top">
          <div class="health-name">
            ${icon(resolveIconName(row.icon, 'gauge'), 14)}
            ${escapeHtml(view.name)}
          </div>
          <div class="health-val">${escapeHtml(view.text)}</div>
        </div>
        ${view.bar ? `
          <div class="progress progress-sm">
            <div class="progress-bar" style="width:${view.barWidth}%"></div>
          </div>
        ` : ''}
      </div>
    `).join('') + (
      panel === 'partial'
        ? partialNote('Some metrics were left out: the server sent a value that is not a usable number.')
        : ''
    );
  }

  /* ── QUICK ACTIONS ──────────────────────── */

  function renderQuickActions() {
    const wrap = $('#quickActions');
    if (!wrap) return;

    const panel = resolvePanelState({
      loading: false,
      errored: false,
      available: quickActions.length > 0,
      renderable: quickActions.length,
      dropped: 0,
    });

    if (panel !== 'success') {
      wrap.innerHTML = panelNotice(panel, 'shortcuts');
      return;
    }

    wrap.innerHTML = quickActions.map((q) => `
      <${q.href ? 'a' : 'button'} class="quick-tile" ${q.href ? `href="${q.href}"` : ''} ${q.action ? `data-quick="${q.action}"` : ''}>
        <div class="quick-tile-ico">${icon(resolveIconName(q.icon, 'activity'), 16)}</div>
        <div>
          <div class="quick-tile-title">${escapeHtml(q.label)}</div>
          <div class="quick-tile-desc">${escapeHtml(q.desc)}</div>
        </div>
      </${q.href ? 'a' : 'button'}>
    `).join('');
  }

  /* ══════════════════════════════════════════
     POLLING — self-terminating
     ══════════════════════════════════════════ */

  function stopHealthPolling() {
    if (healthPollingTimer === null) return;
    clearInterval(healthPollingTimer);
    healthPollingTimer = null;
  }

  /**
   * One tick. A failed read stops the loop for good: the timer is cleared and
   * the panel shows its error state, so a 5-second interval can never become an
   * endless failing loop. A hidden tab is a skip, not a failure.
   */
  async function healthTick() {
    const result = await readHealth();
    if (result === false) stopHealthPolling();
  }

  function startHealthPolling() {
    if (healthPollingTimer !== null) return;
    healthPollingTimer = setInterval(healthTick, HEALTH_POLL_MS);
  }

  /* ══════════════════════════════════════════
     BIND ACTIONS
     ══════════════════════════════════════════ */

  function setRefreshing(active) {
    const btn = $('#refreshDashboard');
    if (!btn) return;
    btn.style.pointerEvents = active ? 'none' : '';
    btn.style.opacity = active ? '0.5' : '1';
  }

  function bindActions() {
    // Quick action tiles (delegated)
    document.addEventListener('click', async (e) => {
      const tile = e.target.closest('[data-quick]');
      if (!tile) return;

      switch (tile.getAttribute('data-quick')) {
        case 'newFolder': {
          const name = await Modal.prompt({
            title: 'Create new folder',
            label: 'Folder name',
            placeholder: 'e.g. Marketing Assets',
            confirmText: 'Create',
            hint: 'Created at the root of the storage directory',
          });
          if (!name) break;
          try {
            // The only folder endpoint is POST /api/fs/folder, which takes a
            // client path. Validation happens server-side.
            await window.API.post('/fs/folder', { path: `/${name}` });
            Toast.success('Folder created', `/${name}`);
            await loadSummary();
          } catch (err) {
            // api.js has already raised exactly one error toast.
          }
          break;
        }
        case 'health': {
          const ok = await readHealth();
          if (ok === true) {
            // One success toast only when the read actually succeeded; a failure
            // is reported by api.js alone, and it stops the poll loop.
            Toast.success('Metrics refreshed');
            startHealthPolling();
          }
          if (ok === false) stopHealthPolling();
          break;
        }
      }
    });

    // Refresh: the summary performs the tree walk, so it runs on demand only.
    const refreshBtn = $('#refreshDashboard');
    refreshBtn?.addEventListener('click', async () => {
      setRefreshing(true);
      const ok = await loadSummary();
      setRefreshing(false);
      // A successful refresh also resumes polling if an earlier read had
      // stopped it, which is what the error state asks the reader to do.
      if (ok) {
        startHealthPolling();
        Toast.success('Dashboard updated');
      }
      // On failure api.js has already raised exactly one error toast.
    });
  }

  /* ══════════════════════════════════════════
     LIFECYCLE
     ══════════════════════════════════════════ */

  /**
   * @returns {Promise<void>} resolves once the first load has settled, so the
   * page's rendered state is observable rather than assumed
   */
  function init() {
    renderQuickActions();
    bindActions();
    renderAll();

    // The timer starts only after a load that actually succeeded.
    return loadSummary().then((ok) => {
      if (ok) startHealthPolling();
    });
  }

  /* ══════════════════════════════════════════
     EXPORTS
     ══════════════════════════════════════════ */

  return {
    init,
    // Pure helpers, exported so they can be reasoned about without a browser.
    resolvePanelState,
    resolveHealthPanelState,
    resolveVolumeLine,
    formatGb,
    toProportion,
    formatMetric,
    formatTimestamp,
    formatStatValue,
    splitClientPath,
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'dashboard') {
    Dashboard.init();
  }
});

window.Dashboard = Dashboard;