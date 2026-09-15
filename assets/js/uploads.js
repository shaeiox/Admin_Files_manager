/* ============================================
   UPLOADS.JS — Upload Manager Page Logic
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Uploads = (() => {

  const { $, $$, el, icon, Format, Toast, Modal, resolveType, Store, uid, clamp, randBetween } = window.AFM;

  /* ══════════════════════════════════════════
     STATE
     ══════════════════════════════════════════ */

  const state = {
    queue: [],             // { id, name, size, uploaded, speed, status, ext, type, error, startTime, endTime, file, abort }
    concurrency: 3,
    activeCount: 0,
    destination: '/',      // Root path mapping to Linux /download
    preset: 'balanced',
    options: {
      autoStart: true,
      overwrite: false,
      preservePath: true,
      compress: false,
    },
    metrics: {
      totalFiles: 0,
      totalUploaded: 0,
      totalBytes: 0,
      bytesUploaded: 0,
      speedHistory: new Array(20).fill(0),
    },
    metricsTimer: null,    // Replaced 'ticker' with metrics loop
  };
  /* ══════════════════════════════════════════
     PRESETS
     ══════════════════════════════════════════ */

  const presets = [
    {
      key: 'fast',
      name: 'Fast Transfer',
      desc: 'Maximum speed, no processing',
      icon: 'zap',
      tags: ['no-compress', 'parallel-8'],
      concurrency: 8,
      compress: false,
    },
    {
      key: 'balanced',
      name: 'Balanced',
      desc: 'Recommended for most files',
      icon: 'sliders',
      tags: ['auto-compress', 'parallel-3'],
      concurrency: 3,
      compress: false,
    },
    {
      key: 'optimize',
      name: 'Optimize Storage',
      desc: 'Compress & deduplicate before upload',
      icon: 'package',
      tags: ['compress', 'dedupe'],
      concurrency: 2,
      compress: true,
    },
    {
      key: 'secure',
      name: 'Secure Upload',
      desc: 'Client-side encryption enabled',
      icon: 'shield',
      tags: ['encrypted', 'verified'],
      concurrency: 2,
      compress: false,
    },
  ];

  /* ══════════════════════════════════════════
     DROPZONE
     ══════════════════════════════════════════ */

  function initDropzone() {
    const dz = $('#dropzone');
    const input = $('#fileInput');
    const folderInput = $('#folderInput');
    if (!dz) return;

    // Click → open file picker
    dz.addEventListener('click', e => {
      if (e.target.closest('button, a')) return;
      input?.click();
    });

    // Browse buttons
    $('#browseFiles')?.addEventListener('click', e => { e.stopPropagation(); input?.click(); });
    $('#browseFolder')?.addEventListener('click', e => { e.stopPropagation(); folderInput?.click(); });

    // File input change
    input?.addEventListener('change', e => {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    });
    folderInput?.addEventListener('change', e => {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    });

    // Drag & drop
    ['dragenter', 'dragover'].forEach(evt => {
      dz.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.types.includes('Files')) {
          dz.classList.add('is-dragover');
        }
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      dz.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        if (evt === 'dragleave' && dz.contains(e.relatedTarget)) return;
        dz.classList.remove('is-dragover');
      });
    });

    dz.addEventListener('drop', e => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) addFiles(files);
    });

    // Whole-window drag & drop
    let winDragCount = 0;
    window.addEventListener('dragenter', e => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      winDragCount++;
      dz.classList.add('is-dragover');
    });
    window.addEventListener('dragleave', () => {
      winDragCount--;
      if (winDragCount <= 0) { winDragCount = 0; dz.classList.remove('is-dragover'); }
    });
    window.addEventListener('drop', () => { winDragCount = 0; dz.classList.remove('is-dragover'); });
    window.addEventListener('dragover', e => e.preventDefault());
  }

  /* ══════════════════════════════════════════
     ADD FILES → QUEUE
     ══════════════════════════════════════════ */

  function addFiles(files) {
    if (!files || !files.length) return;

    const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
    let added = 0;
    let skipped = 0;

    files.forEach(f => {
      if (f.size > MAX_SIZE) { skipped++; return; }
      const type = resolveType(f.name);
      state.queue.push({
        id: uid('up'),
        name: f.name,
        size: f.size,
        uploaded: 0,
        speed: 0,
        status: 'queued',                // queued | uploading | paused | done | failed
        type: type.key,
        icon: type.icon,
        ext: type.ext,
        error: null,
        startTime: null,
        endTime: null,
        file: f, // reference (not used for real upload here)
      });
      added++;
    });

    if (added) {
      state.metrics.totalFiles += added;
      state.metrics.totalBytes += files.reduce((s, f) => s + (f.size <= MAX_SIZE ? f.size : 0), 0);
      Toast.success(`${added} file${added !== 1 ? 's' : ''} added to queue`);
      renderQueue();
      renderMetrics();
      if (state.options.autoStart) startUploads();
    }

    if (skipped) {
      Toast.warning(`${skipped} file${skipped !== 1 ? 's' : ''} skipped`, 'Files exceed 5 GB maximum');
    }
  }

  /* ══════════════════════════════════════════
     UPLOAD ENGINE
     ══════════════════════════════════════════ */

  function startUploads() {
    if (!state.metricsTimer) {
      // Start a lightweight loop solely for updating speed metrics and global UI
      state.metricsTimer = setInterval(updateMetricsLoop, 1000);
    }
    fillActive();
  }

  function fillActive() {
    while (state.activeCount < state.concurrency) {
      const next = state.queue.find(q => q.status === 'queued');
      if (!next) return;

      state.activeCount++;
      processUpload(next);
    }
  }

  async function processUpload(item) {
    item.status = 'uploading';
    item.startTime = Date.now();
    item.lastBytes = 0;
    item.lastTime = Date.now();
    item.speed = 0;
    item.error = null;

    renderQueueItem(item.id);

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('destination', state.destination);
    formData.append('overwrite', state.options.overwrite.toString());
    formData.append('preservePath', state.options.preservePath.toString());

    // Call the XHR upload method defined in api.js
    const { promise, abort } = window.API.upload('/fs/upload', formData, (loaded, total) => {
      const now = Date.now();
      const deltaT = (now - item.lastTime) / 1000; // in seconds

      // Calculate speed every 500ms to avoid UI jitter
      if (deltaT > 0.5) {
        const deltaB = loaded - item.lastBytes;
        item.speed = deltaB / deltaT;
        item.lastBytes = loaded;
        item.lastTime = now;
      }

      item.uploaded = loaded;
      // Visually update the progress bar without re-rendering the whole row
      updateItemProgress(item);
    });

    // Store the abort function so it can be triggered by pause/cancel buttons
    item.abort = abort;

    try {
      // Wait for the network request to finish
      await promise;

      item.status = 'done';
      item.uploaded = item.size;
      item.endTime = Date.now();
      item.speed = 0;
      state.metrics.totalUploaded++;
      Toast.success('Upload complete', item.name, 2400);

    } catch (error) {
      // Differentiate between intentional cancellation and actual network failures
      if (item.status !== 'paused' && item.status !== 'cancelled') {
        item.status = 'failed';
        item.error = error.message || 'Network error';
      }
    } finally {
      // Cleanup and trigger the next file in the queue
      item.abort = null;
      state.activeCount--;
      renderQueueItem(item.id);
      fillActive();
    }
  }

  function updateMetricsLoop() {
    const activeItems = state.queue.filter(q => q.status === 'uploading');

    // Stop the loop if queue is completely idle
    if (activeItems.length === 0 && !state.queue.some(q => q.status === 'queued')) {
      clearInterval(state.metricsTimer);
      state.metricsTimer = null;
    }

    // Aggregate global speed
    const totalSpeed = activeItems.reduce((sum, q) => sum + (q.speed || 0), 0);
    state.metrics.speedHistory.shift();
    state.metrics.speedHistory.push(totalSpeed);

    state.metrics.bytesUploaded = state.queue.reduce((sum, q) => sum + q.uploaded, 0);

    renderMetrics();
    renderGlobalProgress();
    renderQueueStats();
  }

  /* ══════════════════════════════════════════
   ITEM ACTIONS
   ══════════════════════════════════════════ */

  function pauseItem(id) {
    const item = state.queue.find(q => q.id === id);
    if (!item) return;

    if (item.status === 'uploading') {
      item.status = 'paused';
      item.speed = 0;
      // Abort the ongoing XHR request
      if (typeof item.abort === 'function') item.abort();
    } else if (item.status === 'paused' || item.status === 'failed') {
      item.status = 'queued';
      item.error = null;
      item.uploaded = 0; // Standard pause without chunking restarts from 0
      startUploads();
    }
    renderQueueItem(id);
  }

  function retryItem(id) {
    const item = state.queue.find(q => q.id === id);
    if (!item) return;
    item.status = 'queued';
    item.error = null;
    item.uploaded = 0;
    startUploads();
    renderQueueItem(id);
  }

  function cancelItem(id) {
    const item = state.queue.find(q => q.id === id);
    if (!item) return;

    item.status = 'cancelled';
    // Abort network request if active
    if (typeof item.abort === 'function') item.abort();

    // Remove from queue
    state.queue = state.queue.filter(q => q.id !== id);
    renderQueue();
    renderMetrics();
    fillActive();
  }

  function clearCompleted() {
    state.queue = state.queue.filter(q => q.status !== 'done');
    renderQueue();
    renderMetrics();
  }

  function retryAllFailed() {
    let n = 0;
    state.queue.forEach(item => {
      if (item.status === 'failed') {
        item.status = 'queued';
        item.error = null;
        item.uploaded = 0;
        n++;
      }
    });
    if (n) {
      Toast.info(`Retrying ${n} failed upload${n !== 1 ? 's' : ''}`);
      startUploads();
      renderQueue();
    }
  }

  function pauseAll() {
    state.queue.forEach(item => {
      if (item.status === 'uploading') {
        item.status = 'paused';
        item.speed = 0;
        if (typeof item.abort === 'function') item.abort();
      }
    });
    renderQueue();
  }

  function resumeAll() {
    state.queue.forEach(item => {
      if (item.status === 'paused') {
        item.status = 'queued';
        item.uploaded = 0;
      }
    });
    startUploads();
    renderQueue();
  }

  async function cancelAll() {
    if (!state.queue.length) return;

    const ok = await Modal.confirm({
      title: 'Cancel all uploads?',
      message: 'This will abort all active transfers and clear the queue. Completed files will remain on the server.',
      confirmText: 'Cancel all',
      danger: true,
    });

    if (!ok) return;

    state.queue.forEach(item => {
      item.status = 'cancelled';
      if (typeof item.abort === 'function') item.abort();
    });

    state.queue = state.queue.filter(q => q.status === 'done');

    if (state.metricsTimer) {
      clearInterval(state.metricsTimer);
      state.metricsTimer = null;
    }

    renderQueue();
    renderMetrics();
  }

  /* ══════════════════════════════════════════
     RENDER — QUEUE
     ══════════════════════════════════════════ */

  function renderQueue() {
    const wrap = $('#queueList');
    if (!wrap) return;

    if (!state.queue.length) {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:48px 24px;">
          <div class="empty-icon">${icon('inbox', 26)}</div>
          <div class="empty-title">Upload queue is empty</div>
          <div class="empty-desc">Drop files anywhere on this page or click the dropzone to browse.</div>
        </div>
      `;
      renderQueueStats();
      renderGlobalProgress();
      return;
    }

    wrap.innerHTML = state.queue.map(item => renderItemHTML(item)).join('');
    bindQueueActions();
    renderQueueStats();
    renderGlobalProgress();
  }

  function renderItemHTML(item) {
    const pct = item.size ? (item.uploaded / item.size) * 100 : 0;
    const t = resolveType(item.name);

    let statusEl, timeInfo, actions;

    switch (item.status) {
      case 'uploading': {
        const remaining = item.speed ? (item.size - item.uploaded) / item.speed : 0;
        statusEl = `<span class="qi-status uploading">Uploading</span>`;
        timeInfo = `${Format.bytes(item.uploaded)} of ${Format.bytes(item.size)}
                    <span class="sep"></span> ${Format.speed(item.speed)}
                    <span class="sep"></span> ${Format.duration(remaining)} left`;
        actions = `
          <button class="btn-icon btn-icon-sm keep-mobile" data-act="pause" data-id="${item.id}" data-tip="Pause">${icon('pause', 15)}</button>
          <button class="btn-icon btn-icon-sm" data-act="cancel" data-id="${item.id}" data-tip="Cancel">${icon('x', 15)}</button>
        `;
        break;
      }
      case 'paused':
        statusEl = `<span class="qi-status paused">Paused</span>`;
        timeInfo = `${Format.bytes(item.uploaded)} of ${Format.bytes(item.size)} <span class="sep"></span> Paused by user`;
        actions = `
          <button class="btn-icon btn-icon-sm keep-mobile" data-act="pause" data-id="${item.id}" data-tip="Resume">${icon('play', 15)}</button>
          <button class="btn-icon btn-icon-sm" data-act="cancel" data-id="${item.id}" data-tip="Cancel">${icon('x', 15)}</button>
        `;
        break;
      case 'done':
        statusEl = `<span class="qi-status done">Complete</span>`;
        timeInfo = `${Format.bytes(item.size)} <span class="sep"></span> Uploaded in ${Format.duration((item.endTime - item.startTime) / 1000)}`;
        actions = `
          <button class="btn-icon btn-icon-sm" data-act="cancel" data-id="${item.id}" data-tip="Remove">${icon('x', 15)}</button>
        `;
        break;
      case 'failed':
        statusEl = `<span class="qi-status failed">Failed</span>`;
        timeInfo = `<span class="err">${item.error || 'Upload failed'}</span> <span class="sep"></span> ${Format.bytes(item.uploaded)} of ${Format.bytes(item.size)}`;
        actions = `
          <button class="btn-icon btn-icon-sm keep-mobile" data-act="retry" data-id="${item.id}" data-tip="Retry">${icon('refresh', 15)}</button>
          <button class="btn-icon btn-icon-sm" data-act="cancel" data-id="${item.id}" data-tip="Remove">${icon('x', 15)}</button>
        `;
        break;
      default: // queued
        statusEl = `<span class="qi-status queued">Queued</span>`;
        timeInfo = `${Format.bytes(item.size)} <span class="sep"></span> Waiting for slot`;
        actions = `
          <button class="btn-icon btn-icon-sm" data-act="cancel" data-id="${item.id}" data-tip="Remove">${icon('x', 15)}</button>
        `;
    }

    const stateClass = {
      uploading: 'is-uploading',
      done: 'is-done',
      failed: 'is-failed',
      paused: 'is-paused',
    }[item.status] || '';

    return `
      <div class="queue-item ${stateClass}" data-item-id="${item.id}">
        <div class="qi-icon ftype-icon ${t.key}">${icon(item.icon, 17)}</div>
        <div class="qi-body">
          <div class="qi-top">
            <div class="qi-name">${item.name}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              ${statusEl}
              <div class="qi-pct">${pct.toFixed(0)}%</div>
            </div>
          </div>
          <div class="qi-bar"><div class="qi-fill" style="width:${pct}%"></div></div>
          <div class="qi-meta">${timeInfo}</div>
        </div>
        <div class="qi-actions">${actions}</div>
      </div>
    `;
  }

  function renderQueueItem(id) {
    const item = state.queue.find(q => q.id === id);
    if (!item) return;
    const node = document.querySelector(`[data-item-id="${id}"]`);
    if (!node) { renderQueue(); return; }
    const fresh = el('div');
    fresh.innerHTML = renderItemHTML(item);
    node.replaceWith(fresh.firstElementChild);
    bindQueueActions();
  }

  function updateItemProgress(item) {
    const node = document.querySelector(`[data-item-id="${item.id}"]`);
    if (!node) return;
    const pct = (item.uploaded / item.size) * 100;
    const fill = node.querySelector('.qi-fill');
    const pctEl = node.querySelector('.qi-pct');
    const meta = node.querySelector('.qi-meta');
    if (fill) fill.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct.toFixed(0) + '%';
    if (meta && item.status === 'uploading') {
      const remaining = item.speed ? (item.size - item.uploaded) / item.speed : 0;
      meta.innerHTML = `${Format.bytes(item.uploaded)} of ${Format.bytes(item.size)}
                       <span class="sep"></span> ${Format.speed(item.speed)}
                       <span class="sep"></span> ${Format.duration(remaining)} left`;
    }
  }

  function bindQueueActions() {
    $$('#queueList [data-act]').forEach(btn => {
      btn.onclick = () => {
        const act = btn.getAttribute('data-act');
        const id = btn.getAttribute('data-id');
        if (act === 'pause') pauseItem(id);
        else if (act === 'retry') retryItem(id);
        else if (act === 'cancel') cancelItem(id);
      };
    });
  }

  /* ══════════════════════════════════════════
     STATS & GLOBAL PROGRESS
     ══════════════════════════════════════════ */

  function renderQueueStats() {
    const wrap = $('#queueStats');
    if (!wrap) return;

    const counts = {
      uploading: state.queue.filter(q => q.status === 'uploading').length,
      queued: state.queue.filter(q => q.status === 'queued').length,
      done: state.queue.filter(q => q.status === 'done').length,
      failed: state.queue.filter(q => q.status === 'failed').length,
    };

    wrap.innerHTML = `
      <div class="qstat"><span class="qstat-dot active"></span> <span class="val">${counts.uploading}</span> active</div>
      <div class="qstat"><span class="qstat-dot queued"></span> <span class="val">${counts.queued}</span> queued</div>
      <div class="qstat"><span class="qstat-dot done"></span> <span class="val">${counts.done}</span> done</div>
      ${counts.failed ? `<div class="qstat"><span class="qstat-dot failed"></span> <span class="val">${counts.failed}</span> failed</div>` : ''}
    `;
  }

  function renderGlobalProgress() {
    const wrap = $('#queueGlobal');
    if (!wrap) return;

    if (!state.queue.length) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';

    const totalBytes = state.queue.reduce((s, q) => s + q.size, 0);
    const uploaded = state.queue.reduce((s, q) => s + q.uploaded, 0);
    const pct = totalBytes ? (uploaded / totalBytes) * 100 : 0;
    const totalSpeed = state.queue
      .filter(q => q.status === 'uploading')
      .reduce((s, q) => s + q.speed, 0);
    const remainingBytes = totalBytes - uploaded;
    const eta = totalSpeed ? remainingBytes / totalSpeed : null;

    wrap.innerHTML = `
      <div class="qg-top">
        <div class="qg-label">
          ${icon('uploadCloud', 15)}
          Overall progress
        </div>
        <div class="qg-right">
          <span>${Format.bytes(uploaded)} / ${Format.bytes(totalBytes)}</span>
          ${totalSpeed ? `<span>·</span><span>${Format.speed(totalSpeed)}</span>` : ''}
          ${eta ? `<span>·</span><span>${Format.duration(eta)} left</span>` : ''}
          <span class="qg-pct">${pct.toFixed(0)}%</span>
        </div>
      </div>
      <div class="progress">
        <div class="progress-bar ${totalSpeed > 0 ? 'is-striped' : ''}" style="width:${pct}%"></div>
      </div>
    `;
  }

  /* ══════════════════════════════════════════
     METRICS TILES
     ══════════════════════════════════════════ */

  function renderMetrics() {
    const wrap = $('#uploadMetrics');
    if (!wrap) return;

    const totalSpeed = state.queue
      .filter(q => q.status === 'uploading')
      .reduce((s, q) => s + q.speed, 0);

    const uploadedCount = state.queue.filter(q => q.status === 'done').length;
    const totalBytesUp = state.queue
      .filter(q => q.status === 'done')
      .reduce((s, q) => s + q.size, 0);
    const activeCount = state.queue.filter(q => q.status === 'uploading').length;

    const maxSpeed = Math.max(...state.metrics.speedHistory, 1);
    const bars = state.metrics.speedHistory.map(v => {
      const h = clamp((v / maxSpeed) * 100, 6, 100);
      return `<div class="speed-bar" style="height:${h}%"></div>`;
    }).join('');

    const tiles = [
      {
        icon: 'zap',
        value: totalSpeed > 0 ? Format.speed(totalSpeed) : '—',
        label: 'Current speed',
        graph: true,
      },
      {
        icon: 'activity',
        value: activeCount,
        label: 'Active uploads',
      },
      {
        icon: 'checkCircle',
        value: uploadedCount,
        label: 'Uploaded today',
      },
      {
        icon: 'hardDrive',
        value: Format.bytes(totalBytesUp),
        label: 'Data transferred',
      },
    ];

    wrap.innerHTML = tiles.map(t => `
      <div class="metric-tile">
        <div class="metric-ico">${icon(t.icon, 16)}</div>
        <div class="metric-body">
          <div class="metric-value">${t.value}</div>
          <div class="metric-label">${t.label}</div>
        </div>
        ${t.graph ? `<div class="speed-graph">${bars}</div>` : ''}
      </div>
    `).join('');
  }

  /* ══════════════════════════════════════════
     PRESETS
     ══════════════════════════════════════════ */

  function renderPresets() {
    const wrap = $('#presetGrid');
    if (!wrap) return;

    wrap.innerHTML = presets.map(p => `
      <button class="preset-card ${state.preset === p.key ? 'is-active' : ''}" data-preset="${p.key}">
        <div class="preset-top">
          <div class="preset-ico">${icon(p.icon, 15)}</div>
          <div class="preset-name">${p.name}</div>
        </div>
        <div class="preset-desc">${p.desc}</div>
        <div class="preset-tags">
          ${p.tags.map(t => `<span class="preset-tag">${t}</span>`).join('')}
        </div>
      </button>
    `).join('');

    wrap.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-preset');
        const p = presets.find(x => x.key === key);
        if (!p) return;
        state.preset = key;
        state.concurrency = p.concurrency;
        state.options.compress = p.compress;
        wrap.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('is-active', b === btn));
        Toast.info(`Preset: ${p.name}`, `${p.concurrency} parallel · ${p.compress ? 'compression on' : 'no compression'}`);
      });
    });
  }

  /* ══════════════════════════════════════════
     RECENT UPLOADS STRIP
     ══════════════════════════════════════════ */

  function renderRecent() {
    const wrap = $('#recentUploads');
    if (!wrap) return;

    const recent = [
      { name: 'launch-video.mp4', size: 328 * 1024 * 1024, time: Date.now() - 6 * 60 * 1000 },
      { name: 'brand-kit.zip', size: 84 * 1024 * 1024, time: Date.now() - 22 * 60 * 1000 },
      { name: 'annual-report.pdf', size: 12 * 1024 * 1024, time: Date.now() - 55 * 60 * 1000 },
      { name: 'user-research.docx', size: 4.2 * 1024 * 1024, time: Date.now() - 2 * 3600 * 1000 },
      { name: 'ui-mockup.png', size: 3.8 * 1024 * 1024, time: Date.now() - 3 * 3600 * 1000 },
      { name: 'api-reference.zip', size: 45 * 1024 * 1024, time: Date.now() - 5 * 3600 * 1000 },
      { name: 'podcast-episode-14.mp3', size: 68 * 1024 * 1024, time: Date.now() - 9 * 3600 * 1000 },
    ];

    wrap.innerHTML = recent.map(r => {
      const t = resolveType(r.name);
      return `
        <div class="recent-card">
          <div class="recent-thumb">
            <div class="ftype-icon ${t.key}">${icon(t.icon, 18)}</div>
          </div>
          <div class="recent-name">${r.name}</div>
          <div class="recent-meta">${Format.bytes(r.size)} · ${Format.relative(r.time)}</div>
        </div>
      `;
    }).join('');
  }

  /* ══════════════════════════════════════════
     DESTINATION / OPTIONS
     ══════════════════════════════════════════ */

  function initDestination() {
    // Change destination folder
    $('#changeDestination')?.addEventListener('click', async () => {
      const path = await Modal.prompt({
        title: 'Change destination folder',
        label: 'Folder path',
        value: state.destination,
        placeholder: '/path/to/folder',
        confirmText: 'Set destination',
      });
      if (path) {
        state.destination = path;
        const el = $('#destPath');
        if (el) el.innerHTML = `${icon('folder', 13)} ${path}`;
        Toast.success('Destination updated', path);
      }
    });

    // Option toggles
    $$('[data-option]').forEach(input => {
      input.checked = state.options[input.getAttribute('data-option')] ?? false;
      input.addEventListener('change', () => {
        state.options[input.getAttribute('data-option')] = input.checked;
      });
    });
  }

  /* ══════════════════════════════════════════
     BIND FOOTER / GLOBAL ACTIONS
     ══════════════════════════════════════════ */

  function bindGlobalActions() {
    $('#pauseAll')?.addEventListener('click', pauseAll);
    $('#resumeAll')?.addEventListener('click', resumeAll);
    $('#retryFailed')?.addEventListener('click', retryAllFailed);
    $('#clearDone')?.addEventListener('click', clearCompleted);
    $('#cancelAll')?.addEventListener('click', cancelAll);
  }

  /* ══════════════════════════════════════════
     INIT
     ══════════════════════════════════════════ */

  function init() {
    initDropzone();
    initDestination();
    renderPresets();
    renderRecent();
    renderMetrics();
    renderQueue();
    bindGlobalActions();

    // Set destination path label
    const dp = $('#destPath');
    if (dp) dp.innerHTML = `${icon('folder', 13)} ${state.destination}`;
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'uploads') {
    Uploads.init();
  }
});

window.Uploads = Uploads;