// test/frontend/dashboard.test.js
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DASHBOARD_SRC = path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'dashboard.js');
const INDEX_SRC = path.join(__dirname, '..', '..', 'public', 'index.html');

const dashboardSource = fs.readFileSync(DASHBOARD_SRC, 'utf8');
const indexSource = fs.readFileSync(INDEX_SRC, 'utf8');

const UNAVAILABLE = '\u2014';

/**
 * Mirror of the `window.AFM.Format` members the Dashboard relies on.
 *
 * app.js owns the real implementation; this is a stub, copied rather than
 * imported, because loading app.js in Node would execute its DOM bootstrap.
 * Kept byte-identical in behaviour to app.js so assertions stay meaningful.
 */
function createFormatStub() {
  return {
    bytes(bytes, decimals = 1) {
      if (bytes === 0 || bytes == null) return '0 B';
      const k = 1024;
      const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
      const val = bytes / Math.pow(k, i);
      return `${val.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
    },
    number(n) {
      return (n ?? 0).toLocaleString('en-US');
    },
    pad(n, len = 2) {
      return String(n).padStart(len, '0');
    },
    duration(sec) {
      if (sec == null || !isFinite(sec) || sec < 0) return UNAVAILABLE;
      if (sec < 60) return `${Math.round(sec)}s`;
      const m = Math.floor(sec / 60);
      const s = Math.round(sec % 60);
      if (m < 60) return `${m}m ${s}s`;
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m ${s}s`;
    },
    dateTime(d) {
      const date = d instanceof Date ? d : new Date(d);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
        ', ' +
        date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    },
  };
}

/**
 * Load public/assets/js/dashboard.js without a DOM.
 *
 * The module is a browser IIFE, so it is evaluated inside a vm context holding
 * only what it touches at load time: `window.AFM` (destructured, never called)
 * and `document.addEventListener`. No DOM is emulated - only the pure helpers
 * it exports are exercised.
 */
function loadDashboard(afmOverrides = {}) {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.AFM = Object.assign(
    {
      Icons: {},
      $: () => null,
      icon: () => '',
      Format: createFormatStub(),
      Toast: { info() {}, success() {}, warning() {}, error() {} },
      Modal: { prompt: async () => null, confirm: async () => false },
      escapeHtml: (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c])),
    },
    afmOverrides
  );
  sandbox.console = { warn() {}, error() {}, log() {} };
  sandbox.setInterval = () => 0;
  sandbox.clearInterval = () => {};
  sandbox.requestAnimationFrame = () => 0;
  sandbox.document = { addEventListener() {}, visibilityState: 'visible' };

  vm.createContext(sandbox);
  vm.runInContext(dashboardSource, sandbox, { filename: 'dashboard.js' });

  return sandbox.window.Dashboard;
}

const pure = loadDashboard();

/* ══════════════════════════════════════════
   PANEL STATE RESOLVER
   ══════════════════════════════════════════ */

describe('resolvePanelState', () => {
  const base = { loading: false, errored: false, available: true, renderable: 3, dropped: 0 };

  test('maps a completed panel with renderable rows to success', () => {
    assert.equal(pure.resolvePanelState({ ...base }), 'success');
  });

  test('maps an in-flight panel to loading, ahead of every other condition', () => {
    assert.equal(
      pure.resolvePanelState({ ...base, loading: true, errored: true, available: false, renderable: 0 }),
      'loading'
    );
  });

  test('maps a failed request to error, ahead of unavailable and empty', () => {
    assert.equal(
      pure.resolvePanelState({ ...base, errored: true, available: false, renderable: 0 }),
      'error'
    );
  });

  test('maps a field the server did not send to unavailable, even with rows', () => {
    assert.equal(pure.resolvePanelState({ ...base, available: false }), 'unavailable');
  });

  test('maps a real, server-returned empty collection to empty', () => {
    assert.equal(pure.resolvePanelState({ ...base, renderable: 0 }), 'empty');
    assert.equal(pure.resolvePanelState({ ...base, renderable: null }), 'empty');
  });

  test('maps a panel with some rows dropped to partial, never to success', () => {
    assert.equal(pure.resolvePanelState({ ...base, dropped: 1 }), 'partial');
    assert.equal(pure.resolvePanelState({ ...base, dropped: 0 }), 'success');
  });

  test('empty does not mask a partial: zero renderable rows is empty first', () => {
    assert.equal(pure.resolvePanelState({ ...base, renderable: 0, dropped: 4 }), 'empty');
  });

  test('every returned state is one of the seven allowed values', () => {
    const allowed = new Set(['loading', 'success', 'empty', 'unavailable', 'partial', 'error']);
    const inputs = [];
    for (const loading of [true, false]) {
      for (const errored of [true, false]) {
        for (const available of [true, false, undefined]) {
          for (const renderable of [0, 2, undefined, 'x']) {
            inputs.push({ loading, errored, available, renderable, dropped: 0 });
          }
        }
      }
    }
    for (const input of inputs) {
      assert.ok(allowed.has(pure.resolvePanelState(input)), `unexpected state for ${JSON.stringify(input)}`);
    }
  });
});

/* ══════════════════════════════════════════
   METRICS PANEL PRECEDENCE
   ══════════════════════════════════════════ */

describe('resolveHealthPanelState', () => {
  test('a healthy reading with rows renders', () => {
    assert.equal(
      pure.resolveHealthPanelState({
        healthLoading: false, healthErrored: false, errored: false,
        health: [{ name: 'Uptime', value: 5, unit: 's' }], renderable: 1, dropped: 0,
      }),
      'success'
    );
  });

  test('a failed first load leaves the loading state, so no skeleton can persist', () => {
    // The metrics request never ran, so the panel must read as errored, not loading.
    assert.equal(
      pure.resolveHealthPanelState({
        healthLoading: false, healthErrored: false, errored: true,
        health: null, renderable: 0, dropped: 0,
      }),
      'error'
    );
  });

  test('a failed poll reads as errored', () => {
    assert.equal(
      pure.resolveHealthPanelState({
        healthLoading: false, healthErrored: true, errored: false,
        health: [{ name: 'Uptime', value: 5, unit: 's' }], renderable: 1, dropped: 0,
      }),
      'error'
    );
  });

  test('a field the server never sent reads as unavailable, not empty', () => {
    assert.equal(
      pure.resolveHealthPanelState({
        healthLoading: false, healthErrored: false, errored: false,
        health: null, renderable: 0, dropped: 0,
      }),
      'unavailable'
    );
  });

  test('a real but empty metrics array reads as empty', () => {
    assert.equal(
      pure.resolveHealthPanelState({
        healthLoading: false, healthErrored: false, errored: false,
        health: [], renderable: 0, dropped: 0,
      }),
      'empty'
    );
  });

  test('loading still wins over everything', () => {
    assert.equal(
      pure.resolveHealthPanelState({
        healthLoading: true, healthErrored: true, errored: true,
        health: null, renderable: 0, dropped: 0,
      }),
      'loading'
    );
  });
});

/* ══════════════════════════════════════════
   UNAVAILABLE CAPACITY
   ══════════════════════════════════════════ */

describe('resolveVolumeLine', () => {
  const unavailableResolver = () => ({
    available: false,
    pctText: UNAVAILABLE,
    fillWidth: '0%',
    meta: 'Volume usage unavailable',
    state: 'unavailable',
  });

  const measuredResolver = () => ({
    available: true,
    pctText: '68.4%',
    fillWidth: '68.4%',
    meta: '68.4 GB of 100 GB used',
    state: 'measured',
  });

  test('an unmeasured capacity renders the unavailable mark, never 0 or 0.0%', () => {
    const line = pure.resolveVolumeLine({}, unavailableResolver);

    assert.equal(line.state, 'unavailable');
    assert.equal(line.text, UNAVAILABLE);
    assert.notEqual(line.text, '0');
    assert.doesNotMatch(line.text, /\b0(\.0+)?%?/);
    assert.doesNotMatch(line.text, /NaN|Infinity|undefined/);
  });

  test('a null storage payload is unavailable, not a zero reading', () => {
    const line = pure.resolveVolumeLine(null, unavailableResolver);
    assert.equal(line.state, 'unavailable');
    assert.doesNotMatch(line.text, /\d/);
  });

  test('a measured capacity keeps the server percentage and its unit', () => {
    const line = pure.resolveVolumeLine({}, measuredResolver);

    assert.equal(line.state, 'measured');
    assert.equal(line.text, '68.4%');
    assert.equal(line.meta, '68.4 GB of 100 GB used');
  });

  test('a missing resolver degrades to unavailable instead of throwing', () => {
    const line = pure.resolveVolumeLine({}, null);
    assert.equal(line.state, 'unavailable');
    assert.equal(line.text, UNAVAILABLE);
  });

  test('a resolver that reports available with a non-positive total cannot emit a figure', () => {
    // Guards the division: an unavailable capacity must never become 0.0%.
    const line = pure.resolveVolumeLine({}, () => ({ available: false, pctText: '0.0%', meta: '' }));
    assert.equal(line.text, UNAVAILABLE);
  });
});

/* ══════════════════════════════════════════
   GIGABYTE UNITS
   ══════════════════════════════════════════ */

describe('formatGb', () => {
  test('consumes valueGb as gigabytes with no byte conversion', () => {
    assert.equal(pure.formatGb(1.5), '1.5 GB');
    assert.equal(pure.formatGb(12), '12 GB');
    assert.notEqual(pure.formatGb(1.5), '1.5 B');
    assert.notEqual(pure.formatGb(1.5), '1500000000 B');
  });

  test('does not compact large gigabyte figures', () => {
    assert.equal(pure.formatGb(1200), '1200 GB');
    assert.equal(pure.formatGb(24800), '24800 GB');
  });

  test('never collapses a non-zero gigabyte figure to a fabricated zero', () => {
    assert.equal(pure.formatGb(0.000123), '0.000123 GB');
    assert.notEqual(pure.formatGb(0.000123), '0 GB');
    assert.notEqual(pure.formatGb(0.4), '0 GB');
  });

  test('reports a below-resolution non-zero figure as a bound, not as zero', () => {
    assert.equal(pure.formatGb(0, 1), '<0.000001 GB');
    assert.equal(pure.formatGb(0.0000001), '<0.000001 GB');
  });

  test('a genuine zero renders as zero', () => {
    assert.equal(pure.formatGb(0), '0 GB');
    assert.equal(pure.formatGb(0, 0), '0 GB');
  });

  test('an unusable figure returns null so the caller renders the unavailable mark', () => {
    assert.equal(pure.formatGb(null), null);
    assert.equal(pure.formatGb(undefined), null);
    assert.equal(pure.formatGb(NaN), null);
    assert.equal(pure.formatGb(Infinity), null);
    assert.equal(pure.formatGb(-1), null);
    assert.equal(pure.formatGb('12'), null);
    assert.equal(pure.formatGb({}), null);
  });

  test('no gigabyte figure ever renders NaN or Infinity', () => {
    for (const value of [0, 1e-9, 0.5, 1, 999.999, 1e6, -0.0001, null, NaN, Infinity, 'x']) {
      const text = pure.formatGb(value, 1);
      if (text !== null) assert.doesNotMatch(text, /NaN|Infinity|undefined/);
    }
  });
});

/* ══════════════════════════════════════════
   SERVER-OWNED MAXIMUM
   ══════════════════════════════════════════ */

describe('toProportion', () => {
  test('uses the server-computed maximum verbatim', () => {
    assert.equal(pure.toProportion(5, 10), 50);
    assert.equal(pure.toProportion(3, 3), 100);
    assert.equal(pure.toProportion(1, 4), 25);
  });

  test('clamps out-of-range input instead of emitting a broken width', () => {
    assert.equal(pure.toProportion(20, 10), 100);
    assert.equal(pure.toProportion(-5, 10), 0);
  });

  test('an absent or non-positive maximum yields 0%, never NaN or Infinity', () => {
    assert.equal(pure.toProportion(1, 0), 0);
    assert.equal(pure.toProportion(1, null), 0);
    assert.equal(pure.toProportion(1, undefined), 0);
    assert.equal(pure.toProportion(1, -10), 0);
    assert.equal(pure.toProportion(NaN, 10), 0);
    assert.equal(pure.toProportion(Infinity, 10), 0);
    assert.equal(pure.toProportion(1, NaN), 0);
  });

  test('never returns a non-finite proportion', () => {
    const values = [0, 1, -1, NaN, Infinity, -Infinity, 1e308];
    for (const value of values) {
      for (const max of [0, 1, -1, NaN, Infinity, null, 1e308]) {
        const result = pure.toProportion(value, max);
        assert.ok(Number.isFinite(result), `toProportion(${value}, ${max}) = ${result}`);
        assert.ok(result >= 0 && result <= 100);
      }
    }
  });
});

/* ══════════════════════════════════════════
   HEALTH METRICS (no status, no invented threshold)
   ══════════════════════════════════════════ */

describe('formatMetric', () => {
  test('a percentage metric renders its own unit and a bar at its own value', () => {
    const view = pure.formatMetric({ name: 'Memory used', value: 43.2, unit: '%', icon: 'memory' });

    assert.equal(view.text, '43.2%');
    assert.equal(view.bar, true);
    assert.equal(view.barWidth, 43.2);
  });

  test('no status or level is inferred, so no threshold colour is invented', () => {
    const view = pure.formatMetric({ name: 'Memory used', value: 99.9, unit: '%' });

    assert.equal(view.tone, undefined);
    assert.equal(view.status, undefined);
    assert.equal(view.level, undefined);
    assert.doesNotMatch(JSON.stringify(view), /is-error|is-warning|Healthy|Critical|thresholds?/i);
  });

  test('a duration metric renders its real unit and gets no bar at all', () => {
    const view = pure.formatMetric({ name: 'Uptime', value: 6000, unit: 's', icon: 'clock' });

    assert.equal(view.text, '1h 40m 0s');
    assert.equal(view.bar, false);
    assert.equal(view.barWidth, null);
  });

  test('a duration metric is never divided by two to fake a percentage', () => {
    const view = pure.formatMetric({ name: 'Uptime', value: 100, unit: 's' });

    assert.equal(view.text, '1m 40s');
    assert.doesNotMatch(view.text, /%/);
    assert.doesNotMatch(view.text, /50/);
    assert.equal(view.barWidth, null);
  });

  test('an unknown unit is passed through verbatim, without a bar', () => {
    const view = pure.formatMetric({ name: 'Threads', value: 12, unit: '' });

    assert.equal(view.text, '12');
    assert.equal(view.bar, false);
    assert.equal(pure.formatMetric({ name: 'Temp', value: 51, unit: 'C' }).text, '51C');
  });

  test('a missing or non-finite value is dropped, not rendered as NaN', () => {
    assert.equal(pure.formatMetric({ name: 'Uptime', value: null, unit: 's' }), null);
    assert.equal(pure.formatMetric({ name: 'Uptime', value: NaN, unit: 's' }), null);
    assert.equal(pure.formatMetric({ name: 'Uptime', value: 'x', unit: 's' }), null);
    assert.equal(pure.formatMetric({ name: 'Uptime', value: -1, unit: 's' }), null);
    assert.equal(pure.formatMetric(null), null);
  });

  test('a percentage bar stays inside 0..100 even if the server sends a bad figure', () => {
    assert.equal(pure.formatMetric({ value: 140, unit: '%' }).barWidth, 100);
    assert.equal(pure.formatMetric({ value: -20, unit: '%' }), null);
  });
});

/* ══════════════════════════════════════════
   TIMESTAMPS
   ══════════════════════════════════════════ */

describe('formatTimestamp', () => {
  test('a finite epoch is formatted as a real date and time', () => {
    const text = pure.formatTimestamp(Date.UTC(2025, 2, 14, 12, 30));

    assert.notEqual(text, UNAVAILABLE);
    assert.doesNotMatch(text, /Invalid|NaN|undefined/);
    assert.match(text, /2025/);
  });

  test('a zero, negative, or non-numeric epoch never becomes 1970 or Invalid Date', () => {
    for (const value of [0, 1, -1, -1e12, null, undefined, NaN, Infinity, '', 'now', {}]) {
      const text = pure.formatTimestamp(value);
      assert.equal(text, UNAVAILABLE, `formatTimestamp(${String(value)}) = ${text}`);
      assert.doesNotMatch(text, /1970|Invalid|NaN/);
    }
  });

  test('an implausible pre-2009 epoch is treated as unusable rather than printed', () => {
    // 1 Jan 1970 .. 2009 are not timestamps this application can produce.
    assert.equal(pure.formatTimestamp(Date.UTC(2005, 0, 1)), UNAVAILABLE);
    assert.notEqual(pure.formatTimestamp(Date.UTC(2024, 0, 1)), UNAVAILABLE);
  });

  test('no timestamp path can emit Invalid Date', () => {
    for (const value of [0, 1, -5, null, NaN, Infinity, 'x', [], true]) {
      assert.doesNotMatch(String(pure.formatTimestamp(value)), /Invalid|NaN|1970/);
    }
  });
});

/* ══════════════════════════════════════════
   STAT VALUE UNITS
   ══════════════════════════════════════════ */

describe('formatStatValue', () => {
  test('a count stat is grouped, not converted', () => {
    assert.equal(pure.formatStatValue({ key: 'files', label: 'Total files', value: 24800 }).text, '24,800');
    assert.equal(pure.formatStatValue({ key: 'folders', label: 'Total folders', value: 12 }).text, '12');
  });

  test('a byte stat renders in bytes', () => {
    assert.equal(pure.formatStatValue({ key: 'treeBytes', label: 'Storage used', value: 5100 }).text, '5.0 KB');
  });

  test('a volume stat is consumed as gigabytes, with no double conversion', () => {
    assert.equal(pure.formatStatValue({ key: 'volume', label: 'Volume used', value: 12, unit: 'GB' }).text, '12 GB');
    assert.equal(pure.formatStatValue({ key: 'volume', label: 'Volume used', value: 1.5, unit: 'GB' }).text, '1.5 GB');
  });

  test('an unknown key falls back to the declared unit, then to a count', () => {
    assert.equal(pure.formatStatValue({ key: 'mystery', value: 4, unit: 'GB' }).text, '4 GB');
    assert.equal(pure.formatStatValue({ key: 'mystery', value: 4 }).text, '4');
  });

  test('a non-numeric value is dropped rather than rendered as NaN', () => {
    assert.equal(pure.formatStatValue({ key: 'files', value: null }), null);
    assert.equal(pure.formatStatValue({ key: 'files', value: NaN }), null);
    assert.equal(pure.formatStatValue({ key: 'files', value: 'many' }), null);
    assert.equal(pure.formatStatValue(null), null);
  });

  test('no stat value ever renders NaN or undefined', () => {
    for (const stat of [{ key: 'files', value: 0 }, { key: 'treeBytes', value: 0 }, { key: 'volume', value: 0, unit: 'GB' }, { key: 'x', value: NaN }]) {
      const view = pure.formatStatValue(stat);
      if (view) assert.doesNotMatch(view.text, /NaN|undefined/);
    }
  });
});

/* ══════════════════════════════════════════
   CLIENT PATH SEGMENTATION
   ══════════════════════════════════════════ */

describe('splitClientPath', () => {
  // Compared field by field: the helpers run inside a vm context, so their
  // objects carry a different Object.prototype than this realm's. Structure is
  // asserted explicitly rather than through prototype-coupled deep equality.
  function assertSplit(actual, name, folder) {
    assert.equal(actual.name, name);
    assert.equal(actual.folder, folder);
  }

  test('splits a nested client path into a display name and folder', () => {
    assertSplit(pure.splitClientPath('/media/clip.mp4'), 'clip.mp4', '/media');
    assertSplit(pure.splitClientPath('/a/b/c/report.pdf'), 'report.pdf', '/a/b/c');
  });

  test('a root-level file keeps the storage root as its folder', () => {
    assertSplit(pure.splitClientPath('/notes.md'), 'notes.md', '/');
    assertSplit(pure.splitClientPath('notes.md'), 'notes.md', '/');
  });

  test('an unusable path degrades to the unavailable mark, never to undefined', () => {
    assertSplit(pure.splitClientPath('/'), UNAVAILABLE, '/');
    assertSplit(pure.splitClientPath(''), UNAVAILABLE, UNAVAILABLE);
    assertSplit(pure.splitClientPath(null), UNAVAILABLE, UNAVAILABLE);
    assertSplit(pure.splitClientPath(42), UNAVAILABLE, UNAVAILABLE);
  });

  test('a trailing separator never produces an empty display name', () => {
    assertSplit(pure.splitClientPath('/media/'), 'media', '/');
  });

  test('no path field can come back undefined', () => {
    for (const value of ['/', '', 'x', '/a', null, undefined, 0, {}, []]) {
      const seg = pure.splitClientPath(value);
      assert.equal(typeof seg.name, 'string');
      assert.equal(typeof seg.folder, 'string');
      assert.doesNotMatch(seg.name + seg.folder, /undefined/);
    }
  });
});

/* ══════════════════════════════════════════
   FABRICATION SWEEP (source level)
   ══════════════════════════════════════════ */

describe('no fabricated affordance survives in the shipped sources', () => {
  test('dashboard.js contains no historical / trend / "Live" rendering path', () => {
    for (const token of ['trend', 'spark', 'traffic', 'chartLegend', 'Live', 'last 14 days', 'last 30 days']) {
      assert.equal(
        dashboardSource.includes(token),
        false,
        `dashboard.js still contains "${token}"`
      );
    }
  });

  test('dashboard.js does not unwrap a response envelope that does not exist', () => {
    // Read the bare body directly: no `.data` / `["data"]` hop, no server-shaped
    // helper that would only exist if the payload were enveloped.
    assert.doesNotMatch(dashboardSource, /\.data\s*[.[]/);
    assert.doesNotMatch(dashboardSource, /res\.json\(/);
    assert.match(dashboardSource, /window\.API\.get\('\/dashboard\/summary'\)/);
    assert.match(dashboardSource, /window\.API\.get\('\/dashboard\/health'\)/);
  });

  test('dashboard.js never hands a request straight to setInterval', () => {
    assert.doesNotMatch(dashboardSource, /setInterval\(\s*fetch/);
    assert.doesNotMatch(dashboardSource, /setInterval\(\s*loadSummary/);
    assert.doesNotMatch(dashboardSource, /setInterval\(\s*pollSummary/);
  });

  test('dashboard.js never calls fetch() directly', () => {
    assert.doesNotMatch(dashboardSource, /[^.\w]fetch\(/);
  });

  test('dashboard.js does not re-implement the sidebar helpers Agent A owns', () => {
    assert.equal(dashboardSource.includes('function updateStorageUI'), false);
    assert.equal(dashboardSource.includes('function updateUserUI'), false);
  });

  test('index.html carries no fabricated literals', () => {
    const banned = [
      '24.8K', '217', 'Sarah Chen', 'Administrator', 'SC',
      '12.4 GB', 'Notifications', 'dimension.io', 'Marcus', 'brand-kit-v2',
      'Last 30 days', '14 days', '30d', '7d', '24h',
      'All systems operational', 'Healthy',
      'CDN', 'PoPs', 'Multi-tier', 'multi-tier', 'audit trails',
      'Retention', 'retention', 'malware', 'Version history', 'rollback',
      'trafficChart', 'chartLegend', 'Traffic activity',
    ];
    for (const token of banned) {
      assert.equal(indexSource.includes(token), false, `index.html still contains "${token}"`);
    }
  });

  test('index.html contains no "Live" affordance', () => {
    assert.doesNotMatch(indexSource, /live/i);
    assert.doesNotMatch(indexSource, /notif-dot/i);
  });

  test('index.html asserts no storage figure before one is measured', () => {
    assert.doesNotMatch(indexSource, /style="width:\s*0%/);
    assert.doesNotMatch(indexSource, /storage-meta">[^<]*Loading/i);
    assert.doesNotMatch(indexSource, /storage-pct">\s*\d/);
  });

  test('index.html leaves the identity block empty for Agent A to populate', () => {
    assert.match(indexSource, /<div class="user-avatar"><\/div>/);
    assert.match(indexSource, /<div class="user-name"><\/div>/);
    assert.match(indexSource, /<div class="user-role"><\/div>/);
  });

  test('index.html keeps the storage element ids the shared contract fixes', () => {
    for (const cls of ['storage-pct', 'storage-fill', 'storage-meta', 'user-avatar', 'user-name', 'user-role']) {
      assert.ok(indexSource.includes(cls), `index.html lost .${cls}`);
    }
  });

  test('index.html keeps every panel container dashboard.js drives', () => {
    for (const id of ['statsGrid', 'storageDonut', 'activityFeed', 'topFiles', 'capabilities', 'serverHealth', 'quickActions', 'refreshDashboard']) {
      assert.ok(indexSource.includes(`id="${id}"`), `index.html lost #${id}`);
    }
  });
});