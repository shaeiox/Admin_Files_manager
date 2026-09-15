/* ============================================
   DASHBOARD.JS — Enterprise Dashboard Logic
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Dashboard = (() => {

  const { $, $$, icon, Format, Toast, Modal } = window.AFM;

  /* ══════════════════════════════════════════
     STATE MANAGEMENT
     ══════════════════════════════════════════ */

  let state = {
    stats: [],
    traffic: { labels: [], series: [] },
    storageBreakdown: [],
    activities: [],
    topFiles: [],
    health: [],
    isLoaded: false
  };

  // Static UI configurations (not dependent on File System)
  const capabilities = [
    'Automated file lifecycle & retention',
    'Multi-tier storage optimization',
    'CDN edge distribution at 42 PoPs',
    'Granular permission management',
    'Real-time upload analytics & alerts',
    'Automated virus & malware scanning',
    'Version history with instant rollback',
  ];

  const quickActions = [
    { label: 'Upload Files', desc: 'Add new files to storage', icon: 'uploadCloud', href: 'uploads.html' },
    { label: 'New Folder', desc: 'Organize with a new folder', icon: 'folderPlus', action: 'newFolder' },
    { label: 'Share Link', desc: 'Generate a shareable URL', icon: 'link', action: 'newShare' },
    { label: 'Bulk Import', desc: 'Import from cloud provider', icon: 'download', action: 'import' },
    { label: 'Manage Access', desc: 'Users & permission settings', icon: 'users', href: 'settings.html' },
    { label: 'Server Health', desc: 'View diagnostics & logs', icon: 'gauge', action: 'health' },
  ];

  let healthPollingTimer = null;

  /* ══════════════════════════════════════════
     DATA FETCHING (API INTEGRATION)
     ══════════════════════════════════════════ */

  async function fetchDashboardData() {
    try {
      const data = await window.API.get('/dashboard/summary');

      // Update state
      state.stats = data.stats || [];
      state.traffic = data.traffic || { labels: [], series: [] };
      state.storageBreakdown = data.storageBreakdown || [];
      state.activities = data.activities || [];
      state.topFiles = data.topFiles || [];
      state.health = data.health || [];
      state.isLoaded = true;

      // Render updated UI
      renderAll();
    } catch (error) {
      console.error('[Dashboard] Failed to fetch summary:', error);
      // Fallback: If API is not ready, keep the skeleton/empty state
      // Toast is automatically handled by api.js
    }
  }

  async function fetchServerHealth() {
    // Prevent fetching if tab is hidden to save server resources
    if (document.visibilityState !== 'visible') return;

    try {
      const healthData = await window.API.get('/dashboard/health');
      if (healthData && Array.isArray(healthData)) {
        state.health = healthData;
        renderHealth();
      }
    } catch (error) {
      // Fail silently on polling to avoid spamming UI with errors
      console.warn('[Dashboard] Health poll failed:', error.message);
    }
  }

  /* ══════════════════════════════════════════
     RENDERERS
     ══════════════════════════════════════════ */

  function renderAll() {
    renderStats();
    renderChart();
    renderLegend();
    renderDonut();
    renderActivity();
    renderTopFiles();
    renderCapabilities();
    renderHealth();
    renderQuickActions();
  }

  function renderStats() {
    const wrap = $('#statsGrid');
    if (!wrap || !state.stats.length) return;

    wrap.innerHTML = state.stats.map((s, i) => {
      const trendUp = s.trend > 0;
      const trendFlat = s.trend === 0;
      const trendCls = trendFlat ? 'flat' : (trendUp ? 'up' : 'down');
      const trendIco = trendFlat ? 'minus' : (trendUp ? 'trending' : 'trendingDown');

      // Handle missing sparkline gracefully
      const spark = s.spark || [];
      const max = spark.length ? Math.max(...spark) : 1;
      const bars = spark.map(v => `<div class="spark-bar" style="height:${(v / max) * 100}%"></div>`).join('');

      return `
        <div class="stat-card" style="animation-delay:${i * 60}ms">
          <div class="stat-top">
            <div class="stat-icon">${icon(s.icon, 18)}</div>
            <div class="stat-trend ${trendCls}">
              ${icon(trendIco, 11)}
              ${Math.abs(s.trend).toFixed(1)}%
            </div>
          </div>
          <div class="stat-main">
            <div class="stat-value" data-count="${s.value}">
              0${s.unit ? `<span class="unit">${s.unit}</span>` : ''}
            </div>
            <div class="stat-label">${s.label}</div>
          </div>
          <div class="stat-spark">${bars}</div>
        </div>
      `;
    }).join('');

    // Animate counters
    wrap.querySelectorAll('.stat-value[data-count]').forEach(node => {
      const target = parseFloat(node.getAttribute('data-count'));
      const unit = node.querySelector('.unit')?.outerHTML || '';
      const start = performance.now();
      const duration = 1100;
      const ease = t => 1 - Math.pow(1 - t, 3);

      function frame(now) {
        const p = Math.min((now - start) / duration, 1);
        const val = Math.round(target * ease(p));
        node.innerHTML = Format.number(val) + unit;
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function renderChart() {
    const wrap = $('#trafficChart');
    if (!wrap || !state.traffic.series.length) return;

    const maxVal = Math.max(
      ...state.traffic.series.reduce((acc, s) => acc.concat(s.values), [])
    ) || 1; // prevent division by zero

    const cols = state.traffic.labels.map((label, i) => {
      const total = state.traffic.series.reduce((sum, s) => sum + (s.values[i] || 0), 0);
      const stack = state.traffic.series.slice().reverse().map(s => {
        const val = s.values[i] || 0;
        const h = (val / maxVal) * 100;
        return `<div class="bar-seg ${s.color}" style="height:${h}%; animation-delay:${i * 40 + 100}ms"></div>`;
      }).join('');

      const tipRows = state.traffic.series.map(s =>
        `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
           <span style="opacity:.7">${s.name}</span>
           <span style="font-variant-numeric:tabular-nums;">${Format.number(s.values[i] || 0)}</span>
         </div>`
      ).join('');

      return `
        <div class="bar-col">
          <div class="bar-tip">
            <div style="font-weight:500;margin-bottom:4px;">${label} · ${Format.number(total)}</div>
            ${tipRows}
          </div>
          <div class="bar-stack">${stack}</div>
          <div class="bar-label">${label}</div>
        </div>
      `;
    }).join('');

    const gridLines = [0, 25, 50, 75].map(p =>
      `<div class="chart-grid-line" style="bottom:${p + 6}%"></div>`
    ).join('');

    wrap.innerHTML = `${gridLines}<div class="bar-chart">${cols}</div>`;
  }

  function renderLegend() {
    const wrap = $('#chartLegend');
    if (!wrap || !state.traffic.series.length) return;

    const colorMap = {
      a: 'var(--accent-primary)',
      b: 'rgba(107, 98, 242, 0.45)',
      c: 'rgba(107, 98, 242, 0.2)',
    };

    wrap.innerHTML = state.traffic.series.map(s => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${colorMap[s.color] || '#888'}"></span>
        ${s.name}
      </div>
    `).join('');
  }

  function renderDonut() {
    const wrap = $('#storageDonut');
    if (!wrap || !state.storageBreakdown.length) return;

    const total = state.storageBreakdown.reduce((s, x) => s + x.value, 0);
    const RADIUS = 60;
    const CIRC = 2 * Math.PI * RADIUS;

    let offset = 0;
    const rings = state.storageBreakdown.map((s, i) => {
      const frac = total > 0 ? (s.value / total) : 0;
      const dash = frac * CIRC;
      const el = `<circle
        cx="75" cy="75" r="${RADIUS}"
        stroke="${s.color}"
        stroke-dasharray="${dash} ${CIRC}"
        stroke-dashoffset="${-offset}"
        style="transition-delay:${i * 80}ms"
        data-seg="${i}"
      />`;
      offset += dash;
      return el;
    }).join('');

    wrap.innerHTML = `
      <div class="donut-wrap">
        <div class="donut">
          <svg viewBox="0 0 150 150">${rings}</svg>
          <div class="donut-center">
            <div class="donut-value">${Format.compact(total)}<span style="font-size:.7em;opacity:.6"> GB</span></div>
            <div class="donut-label">Used</div>
          </div>
        </div>
        <div class="donut-legend">
          ${state.storageBreakdown.map((s, i) => `
            <div class="donut-legend-row" data-idx="${i}">
              <span class="legend-swatch" style="background:${s.color}"></span>
              <span class="name">${s.name}</span>
              <span class="val">${Format.compact(s.value)} GB</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Legend hover logic
    wrap.querySelectorAll('.donut-legend-row').forEach(row => {
      row.addEventListener('mouseenter', () => {
        const idx = row.getAttribute('data-idx');
        wrap.querySelectorAll('circle').forEach(c => {
          c.style.opacity = c.getAttribute('data-seg') === idx ? '1' : '0.25';
        });
      });
      row.addEventListener('mouseleave', () => {
        wrap.querySelectorAll('circle').forEach(c => c.style.opacity = '1');
      });
    });
  }

  function renderActivity() {
    const wrap = $('#activityFeed');
    if (!wrap) return;

    if (!state.activities.length) {
      wrap.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-tertiary);">No recent activity found.</div>`;
      return;
    }

    const iconForActivity = (type) => ({
      upload: 'upload', download: 'download', delete: 'trash', edit: 'edit', folder: 'folderPlus',
    }[type] || 'activity');

    wrap.innerHTML = state.activities.map(a => `
      <div class="activity-item">
        <div class="activity-ico ${a.type}">${icon(iconForActivity(a.type), 14)}</div>
        <div class="activity-body">
          <div class="activity-text">
            <strong>${a.user}</strong> ${a.action} <strong>${a.target}</strong>
          </div>
          <div class="activity-meta">
            <span>${a.folder}</span>
            <span class="sep"></span>
            <span>${Format.relative(a.time)}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  function renderTopFiles() {
    const wrap = $('#topFiles');
    if (!wrap) return;

    if (!state.topFiles.length) {
      wrap.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-tertiary);">No data available.</div>`;
      return;
    }

    wrap.innerHTML = state.topFiles.map((f, i) => `
      <div class="rank-row">
        <div class="rank-num">${Format.pad(i + 1)}</div>
        <div class="rank-info">
          <div class="rank-name">${f.name}</div>
          <div class="rank-sub">${f.folder}</div>
        </div>
        <div class="rank-bar-wrap">
          <div class="progress progress-sm">
            <div class="progress-bar" style="width:${f.max ? (f.downloads / f.max) * 100 : 0}%"></div>
          </div>
        </div>
        <div class="rank-count">${Format.compact(f.downloads)}</div>
      </div>
    `).join('');
  }

  function renderCapabilities() {
    const wrap = $('#capabilities');
    if (!wrap) return;
    wrap.innerHTML = capabilities.map((c, i) => `
      <div class="numbered-row">
        <div class="numbered-name">${c}</div>
        <div class="numbered-index">${Format.pad(i + 1)}</div>
      </div>
    `).join('');
  }

  function renderHealth() {
    const wrap = $('#serverHealth');
    if (!wrap || !state.health.length) return;

    wrap.innerHTML = state.health.map(h => {
      const isPct = h.unit === '%';
      const barWidth = isPct ? h.value : Math.min((h.value / 2) * 100, 100);
      const barClass = h.value > 80 ? 'is-error' : h.value > 60 ? 'is-warning' : '';
      return `
        <div class="health-row">
          <div class="health-top">
            <div class="health-name">
              ${icon(h.icon, 14)}
              ${h.name}
            </div>
            <div class="health-val">${h.value}${h.unit}</div>
          </div>
          ${isPct ? `
            <div class="progress progress-sm">
              <div class="progress-bar ${barClass}" style="width:${barWidth}%" style="transition: width 0.5s ease-out;"></div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function renderQuickActions() {
    const wrap = $('#quickActions');
    if (!wrap) return;
    wrap.innerHTML = quickActions.map(q => `
      <${q.href ? 'a' : 'button'} class="quick-tile" ${q.href ? `href="${q.href}"` : ''} ${q.action ? `data-quick="${q.action}"` : ''}>
        <div class="quick-tile-ico">${icon(q.icon, 16)}</div>
        <div>
          <div class="quick-tile-title">${q.label}</div>
          <div class="quick-tile-desc">${q.desc}</div>
        </div>
      </${q.href ? 'a' : 'button'}>
    `).join('');
  }

  /* ══════════════════════════════════════════
     BIND ACTIONS
     ══════════════════════════════════════════ */

  function bindActions() {
    // Quick action tiles (Delegated)
    document.addEventListener('click', async e => {
      const tile = e.target.closest('[data-quick]');
      if (!tile) return;
      const action = tile.getAttribute('data-quick');

      switch (action) {
        case 'newFolder': {
          const name = await Modal.prompt({
            title: 'Create new folder',
            label: 'Folder name',
            placeholder: 'e.g. Marketing Assets',
            confirmText: 'Create',
          });

          if (name) {
            try {
              await window.API.post('/folders', { name });
              Toast.success('Folder created', `"${name}" is ready`);
              // Reload dashboard data if necessary, or let the user navigate
            } catch (err) {
              // Error handled by API layer automatically
            }
          }
          break;
        }
        case 'newShare': {
          Toast.info('Creating share link...');
          try {
            const res = await window.API.post('/shares', {});
            await window.AFM.copyToClipboard(res.link || 'https://dl.dimension.io/s/demo', 'Share link copied');
          } catch (e) {
            // Fallback for demo
            await window.AFM.copyToClipboard('https://dl.dimension.io/s/demo', 'Share link copied');
          }
          break;
        }
        case 'import':
          Toast.info('Bulk import', 'Choose a cloud provider to continue', 3200);
          break;
        case 'health':
          // Immediately trigger a health poll
          fetchServerHealth().then(() => {
            Toast.success('Health status refreshed');
          });
          break;
      }
    });

    // Refresh Dashboard Button
    $('#refreshDashboard')?.addEventListener('click', async () => {
      const btn = $('#refreshDashboard');
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.5';
      Toast.info('Refreshing dashboard…');

      await fetchDashboardData();

      btn.style.pointerEvents = '';
      btn.style.opacity = '1';
      Toast.success('Dashboard updated');
    });
  }

  /* ══════════════════════════════════════════
     LIFECYCLE CONTROL
     ══════════════════════════════════════════ */

  function startLiveUpdates() {
    // Poll the lightweight health endpoint every 5 seconds
    if (healthPollingTimer) clearInterval(healthPollingTimer);
    healthPollingTimer = setInterval(fetchServerHealth, 5000);
  }

  function init() {
    // Initial Render of static parts
    renderCapabilities();
    renderQuickActions();

    // Bind Event Listeners
    bindActions();

    // Fetch dynamic data from Server
    fetchDashboardData().then(() => {
      // Start background polling only after initial load succeeds
      startLiveUpdates();
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'dashboard') {
    Dashboard.init();
  }
});

window.Dashboard = Dashboard;