/* ============================================
   DASHBOARD.JS — Dashboard Page Logic
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Dashboard = (() => {

  /* ══════════════════════════════════════════
     MOCK DATA
     ══════════════════════════════════════════ */

  const stats = [
    {
      key: 'files',
      label: 'Total Files',
      value: 24837,
      unit: '',
      trend: +12.4,
      icon: 'file',
      spark: [4, 7, 5, 9, 8, 12, 10, 14, 13, 16, 15, 18],
    },
    {
      key: 'storage',
      label: 'Storage Used',
      value: 342,
      unit: 'GB',
      trend: +4.7,
      icon: 'hardDrive',
      spark: [8, 9, 11, 10, 12, 13, 12, 14, 15, 14, 16, 17],
    },
    {
      key: 'downloads',
      label: 'Downloads Today',
      value: 8412,
      unit: '',
      trend: -2.3,
      icon: 'download',
      spark: [12, 11, 14, 10, 13, 15, 12, 9, 11, 10, 8, 9],
    },
    {
      key: 'bandwidth',
      label: 'Bandwidth (24h)',
      value: 187,
      unit: 'GB',
      trend: +8.9,
      icon: 'activity',
      spark: [5, 7, 8, 6, 10, 12, 11, 14, 13, 15, 16, 18],
    },
  ];

  // Bar chart data (14 days)
  const chartData = {
    labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    series: [
      { name: 'Uploads',   values: [22,34,28,45,38,18,12,28,42,55,48,52,34,20], color: 'a' },
      { name: 'Downloads', values: [40,52,48,60,55,32,26,44,58,72,66,70,52,38], color: 'b' },
      { name: 'Shares',    values: [8, 12,10,14,12, 6, 4,10,15,18,16,17,11, 7], color: 'c' },
    ],
  };

  // Storage donut
  const storageBreakdown = [
    { name: 'Videos',    value: 145, color: '#a78bfa' },
    { name: 'Images',    value: 82,  color: '#f472b6' },
    { name: 'Documents', value: 54,  color: '#60a5fa' },
    { name: 'Archives',  value: 38,  color: '#fbbf24' },
    { name: 'Audio',     value: 15,  color: '#34d399' },
    { name: 'Other',     value: 8,   color: '#686868' },
  ];

  const activities = [
    { type: 'upload',   user: 'Sarah Chen',     action: 'uploaded',   target: 'Q4-Report-Final.pdf',      folder: '/reports/2025',   time: Date.now() - 3 * 60 * 1000 },
    { type: 'folder',   user: 'Marcus Weber',   action: 'created folder', target: 'Design Assets 2025',   folder: '/design',         time: Date.now() - 14 * 60 * 1000 },
    { type: 'download', user: 'Priya Ramesh',   action: 'downloaded', target: 'brand-kit-v2.zip',         folder: '/design/brand',   time: Date.now() - 42 * 60 * 1000 },
    { type: 'edit',     user: 'Alex Torres',    action: 'renamed',    target: 'launch-video-final.mp4',   folder: '/media/2025',     time: Date.now() - 1.5 * 3600 * 1000 },
    { type: 'delete',   user: 'System',         action: 'auto-purged', target: '17 expired files',        folder: '/temp',           time: Date.now() - 3 * 3600 * 1000 },
    { type: 'upload',   user: 'Yuki Tanaka',    action: 'uploaded',   target: 'user-research-notes.docx', folder: '/research',       time: Date.now() - 5 * 3600 * 1000 },
    { type: 'download', user: 'Elena Petrov',   action: 'downloaded', target: 'annual-review.pdf',        folder: '/hr/reviews',     time: Date.now() - 8 * 3600 * 1000 },
  ];

  const topFiles = [
    { name: 'installer-v4.2.dmg',        folder: '/releases/mac',  downloads: 3421, max: 3421 },
    { name: 'brand-guidelines-2025.pdf', folder: '/design/brand',  downloads: 2814 },
    { name: 'onboarding-video.mp4',      folder: '/media/hr',      downloads: 2103 },
    { name: 'api-reference.zip',         folder: '/docs/api',      downloads: 1877 },
    { name: 'launch-assets.zip',         folder: '/marketing',     downloads: 1544 },
  ];
  topFiles.forEach(f => { if (!f.max) f.max = topFiles[0].downloads; });

  const capabilities = [
    'Automated file lifecycle & retention',
    'Multi-tier storage optimization',
    'CDN edge distribution at 42 PoPs',
    'Granular permission management',
    'Real-time upload analytics & alerts',
    'Automated virus & malware scanning',
    'Version history with instant rollback',
  ];

  const serverHealth = [
    { name: 'CPU Load',      value: 42, unit: '%', icon: 'cpu',      status: 'ok' },
    { name: 'Memory',        value: 68, unit: '%', icon: 'server',   status: 'ok' },
    { name: 'Disk I/O',      value: 34, unit: '%', icon: 'hardDrive',status: 'ok' },
    { name: 'Network In',    value: 1.2,unit: 'GB/s', icon: 'wifi',  status: 'ok' },
    { name: 'Active Uploads',value: 47, unit: '',   icon: 'upload',  status: 'ok' },
  ];

  const quickActions = [
    { label: 'Upload Files',      desc: 'Add new files to storage',       icon: 'uploadCloud', href: 'uploads.html' },
    { label: 'New Folder',        desc: 'Organize with a new folder',     icon: 'folderPlus',  action: 'newFolder' },
    { label: 'Share Link',        desc: 'Generate a shareable URL',       icon: 'link',        action: 'newShare' },
    { label: 'Bulk Import',       desc: 'Import from cloud provider',     icon: 'download',    action: 'import' },
    { label: 'Manage Access',     desc: 'Users & permission settings',    icon: 'users',       href: 'settings.html' },
    { label: 'Server Health',     desc: 'View diagnostics & logs',        icon: 'gauge',       action: 'health' },
  ];

  /* ══════════════════════════════════════════
     RENDERERS
     ══════════════════════════════════════════ */

  const { $, $$, el, icon, Format, Toast, Modal, countUp } = window.AFM;

  function renderStats() {
    const wrap = $('#statsGrid');
    if (!wrap) return;

    wrap.innerHTML = stats.map((s, i) => {
      const trendUp   = s.trend > 0;
      const trendFlat = s.trend === 0;
      const trendCls  = trendFlat ? 'flat' : (trendUp ? 'up' : 'down');
      const trendIco  = trendFlat ? 'minus' : (trendUp ? 'trending' : 'trendingDown');
      const max       = Math.max(...s.spark);
      const bars      = s.spark.map(v => `<div class="spark-bar" style="height:${(v/max)*100}%"></div>`).join('');

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
    if (!wrap) return;

    const maxVal = Math.max(
      ...chartData.series.reduce((acc, s) => acc.concat(s.values), [])
    );

    // Build columns
    const cols = chartData.labels.map((label, i) => {
      const total = chartData.series.reduce((sum, s) => sum + s.values[i], 0);
      const stack = chartData.series.slice().reverse().map(s => {
        const h = (s.values[i] / maxVal) * 100;
        return `<div class="bar-seg ${s.color}" style="height:${h}%; animation-delay:${i * 40 + 100}ms"></div>`;
      }).join('');

      const tipRows = chartData.series.map(s =>
        `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
           <span style="opacity:.7">${s.name}</span>
           <span style="font-variant-numeric:tabular-nums;">${Format.number(s.values[i])}</span>
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

    // Grid lines (4 horizontal)
    const gridLines = [0, 25, 50, 75].map(p =>
      `<div class="chart-grid-line" style="bottom:${p + 6}%"></div>`
    ).join('');

    wrap.innerHTML = `${gridLines}<div class="bar-chart">${cols}</div>`;
  }

  function renderLegend() {
    const wrap = $('#chartLegend');
    if (!wrap) return;
    const colorMap = {
      a: 'var(--accent-primary)',
      b: 'rgba(107, 98, 242, 0.45)',
      c: 'rgba(107, 98, 242, 0.2)',
    };
    wrap.innerHTML = chartData.series.map(s => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${colorMap[s.color]}"></span>
        ${s.name}
      </div>
    `).join('');
  }

  function renderDonut() {
    const wrap = $('#storageDonut');
    if (!wrap) return;

    const total = storageBreakdown.reduce((s, x) => s + x.value, 0);
    const RADIUS = 60;
    const CIRC = 2 * Math.PI * RADIUS;

    let offset = 0;
    const rings = storageBreakdown.map((s, i) => {
      const frac = s.value / total;
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
            <div class="donut-value">${total}<span style="font-size:.7em;opacity:.6"> GB</span></div>
            <div class="donut-label">Used</div>
          </div>
        </div>
        <div class="donut-legend">
          ${storageBreakdown.map((s, i) => `
            <div class="donut-legend-row" data-idx="${i}">
              <span class="legend-swatch" style="background:${s.color}"></span>
              <span class="name">${s.name}</span>
              <span class="val">${s.value} GB</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Legend hover → highlight segment
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
    wrap.innerHTML = activities.map(a => `
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

  function iconForActivity(type) {
    return {
      upload: 'upload',
      download: 'download',
      delete: 'trash',
      edit: 'edit',
      folder: 'folderPlus',
    }[type] || 'activity';
  }

  function renderTopFiles() {
    const wrap = $('#topFiles');
    if (!wrap) return;
    wrap.innerHTML = topFiles.map((f, i) => `
      <div class="rank-row">
        <div class="rank-num">${Format.pad(i + 1)}</div>
        <div class="rank-info">
          <div class="rank-name">${f.name}</div>
          <div class="rank-sub">${f.folder}</div>
        </div>
        <div class="rank-bar-wrap">
          <div class="progress progress-sm">
            <div class="progress-bar" style="width:${(f.downloads / f.max) * 100}%"></div>
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
    if (!wrap) return;

    wrap.innerHTML = serverHealth.map(h => {
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
              <div class="progress-bar ${barClass}" style="width:${barWidth}%"></div>
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
    // Quick action tiles
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
          if (name) Toast.success('Folder created', `"${name}" is ready`);
          break;
        }
        case 'newShare': {
          const link = 'https://dl.dimension.io/s/' + Math.random().toString(36).slice(2, 10);
          await window.AFM.copyToClipboard(link, 'Share link copied');
          break;
        }
        case 'import':
          Toast.info('Bulk import', 'Choose a cloud provider to continue', 3200);
          break;
        case 'health':
          Toast.info('All systems operational', 'Uptime 99.98% · Response 42ms', 3200);
          break;
      }
    });

    // Refresh button
    $('#refreshDashboard')?.addEventListener('click', () => {
      Toast.info('Refreshing dashboard…');
      setTimeout(() => {
        renderStats();
        renderChart();
        Toast.success('Dashboard updated');
      }, 500);
    });
  }

  /* ══════════════════════════════════════════
     LIVE UPDATES — simulated realtime tick
     ══════════════════════════════════════════ */

  function startLiveUpdates() {
    // Simulate activity every 12–20 seconds
    setInterval(() => {
      const active = document.visibilityState === 'visible';
      if (!active) return;

      // Nudge server health values slightly
      serverHealth.forEach(h => {
        if (h.unit === '%') {
          const delta = (Math.random() - 0.5) * 6;
          h.value = window.AFM.clamp(Math.round(h.value + delta), 15, 92);
        } else if (h.unit === 'GB/s') {
          h.value = +(0.8 + Math.random() * 1.4).toFixed(1);
        } else {
          h.value = window.AFM.clamp(h.value + Math.round((Math.random() - 0.5) * 5), 10, 120);
        }
      });
      renderHealth();
    }, 4200);
  }

  /* ══════════════════════════════════════════
     INIT
     ══════════════════════════════════════════ */

  function init() {
    renderStats();
    renderChart();
    renderLegend();
    renderDonut();
    renderActivity();
    renderTopFiles();
    renderCapabilities();
    renderHealth();
    renderQuickActions();
    bindActions();
    startLiveUpdates();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'dashboard') {
    Dashboard.init();
  }
});

window.Dashboard = Dashboard;