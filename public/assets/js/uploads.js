/* ============================================
   UPLOADS.JS — Upload Manager Page Logic
   Admin Files Manager — Dimension Style

   Every number this page renders is either measured or shown as unavailable
   ("—", the Format.duration convention), and every capability it names is one
   the server implements. The derivations behind the numbers are pure functions
   exposed on `Uploads.pure` so the suite can assert them without a DOM
   (test/frontend/uploads.test.js); see openspec/changes/upload-pipeline-correctness.
   ============================================ */

'use strict';

const Uploads = (() => {

  const { $, $$, icon, Format, Toast, Modal, resolveType, uid, clamp, escapeHtml } = window.AFM;

  /** The application-wide marker for a value that could not be measured. */
  const UNAVAILABLE = Format.duration(null);

  /* ══════════════════════════════════════════
     PRESETS
     A preset changes exactly one thing: how many files transfer at once. Its
     tags are derived from that setting, so a tag cannot name an effect the
     page does not apply. (Presets that advertised processing nothing on the
     client or the server performed were removed; see docs/CONTRACTS.md.)
     ══════════════════════════════════════════ */

  const presets = [
    { key: 'fast', name: 'Fast', desc: 'Eight files transfer at the same time', icon: 'zap', concurrency: 8 },
    { key: 'balanced', name: 'Balanced', desc: 'Three files at a time — the default', icon: 'sliders', concurrency: 3 },
    { key: 'sequential', name: 'One at a time', desc: 'Files transfer in turn — easiest on a slow or shared connection', icon: 'clock', concurrency: 1 },
  ];
  const DEFAULT_PRESET = 'balanced';

  function presetTags(preset) {
    return [`${preset.concurrency} parallel`];
  }

  /** Options the page presents. Each one is either sent to the server or acts in this page. */
  const DEFAULT_OPTIONS = Object.freeze({
    autoStart: true,   // page behaviour: start transfers as soon as files are added
    overwrite: false,  // sent as the `overwrite` multipart field
  });

  /* ══════════════════════════════════════════
     STATE
     ══════════════════════════════════════════ */

  const state = {
    // { id, name, size, uploaded, speed, status, type, icon, destination, error,
    //   errorKind, errorDetail, savedPath, startTime, endTime, file, abort, attempt }
    // status: queued | uploading | paused | held | done | failed
    queue: [],
    concurrency: presets.find(p => p.key === DEFAULT_PRESET).concurrency,
    activeCount: 0,
    running: DEFAULT_OPTIONS.autoStart,
    destination: '/',
    preset: DEFAULT_PRESET,
    options: { ...DEFAULT_OPTIONS },
    // Destination verdicts, keyed by client path: { status, detail?, promise? }.
    verdicts: new Map(),
    // Session accumulator for the summary tiles. It is fed by completions, not
    // read off the live queue, so clearing completed rows does not reset it.
    session: { completed: 0, bytes: 0 },
    speedHistory: new Array(20).fill(0),
    ticker: null,
    recent: { status: 'loading', items: [], message: '' },
    pendingCreate: null,
    outcomes: { done: [], failed: 0, timer: null },
    announce: { last: '', timer: null, pending: '' },
  };

  /* ══════════════════════════════════════════
     PURE DERIVATIONS
     ══════════════════════════════════════════ */

  /** Percentage of an item transferred: always finite, always within 0..100. */
  function computeProgressPct(item) {
    if (!item) return 0;
    if (item.status === 'done') return 100;
    const size = Number(item.size);
    if (!(size > 0)) return 0;
    const sent = Number(item.uploaded);
    if (!Number.isFinite(sent)) return 0;
    return clamp((sent / size) * 100, 0, 100);
  }

  /** Seconds left for an uploading item, or null when no speed has been measured. */
  function computeRemainingSeconds(item) {
    if (!item || item.status !== 'uploading') return null;
    if (!(item.speed > 0)) return null;
    const size = item.size > 0 ? item.size : 0;
    const sent = clamp(Number(item.uploaded) || 0, 0, size);
    return (size - sent) / item.speed;
  }

  /** A computed remaining time is labelled as an estimate; an unknown one is not. */
  function formatRemaining(seconds) {
    if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return `${UNAVAILABLE} left`;
    return `${Format.duration(seconds)} left (estimate)`;
  }

  /**
   * XHR progress counts the whole multipart body (boundaries, headers, other
   * fields), which is larger than the file. Scale it onto the file's size so the
   * transferred count never exceeds the declared size.
   */
  function scaleTransferred(loaded, total, size) {
    if (!(size > 0) || !(total > 0) || !Number.isFinite(loaded)) return 0;
    return Math.round(clamp(loaded / total, 0, 1) * size);
  }

  function computeQueueCounts(queue) {
    const counts = { uploading: 0, queued: 0, paused: 0, held: 0, done: 0, failed: 0, total: 0 };
    for (const item of queue) {
      if (Object.prototype.hasOwnProperty.call(counts, item.status)) counts[item.status]++;
      counts.total++;
    }
    return counts;
  }

  /**
   * Summary tiles. Completed count and bytes come from the session accumulator
   * (completed items only, their own sizes); speed and active count are read
   * off the live queue at this instant.
   */
  function computeQueueTiles(queue, session) {
    let speed = 0;
    let active = 0;
    for (const item of queue) {
      if (item.status !== 'uploading') continue;
      active++;
      if (item.speed > 0) speed += item.speed;
    }
    return {
      speed,
      active,
      completed: session ? session.completed : 0,
      bytes: session ? session.bytes : 0,
    };
  }

  /**
   * Overall progress over accounted work only. A failed item contributes to
   * neither side of the fraction; its count is reported separately so a bar
   * that stops short of 100% is explained. Returns null for an empty queue.
   */
  function computeGlobalProgress(queue) {
    if (!queue.length) return null;
    let totalBytes = 0;
    let sentBytes = 0;
    let speed = 0;
    let failed = 0;
    let done = 0;
    let counted = 0;
    for (const item of queue) {
      if (item.status === 'failed') { failed++; continue; }
      const size = item.size > 0 ? item.size : 0;
      counted++;
      totalBytes += size;
      if (item.status === 'done') {
        done++;
        sentBytes += size;
      } else if (item.status === 'uploading') {
        sentBytes += clamp(Number(item.uploaded) || 0, 0, size);
        if (item.speed > 0) speed += item.speed;
      }
    }
    let pct;
    if (totalBytes > 0) pct = clamp((sentBytes / totalBytes) * 100, 0, 100);
    else pct = counted > 0 && done === counted ? 100 : 0;
    const eta = speed > 0 ? (totalBytes - sentBytes) / speed : null;
    return { pct, sentBytes, totalBytes, speed, eta, failed, counted };
  }

  /* ── Failure kinds ── */

  /**
   * One lookup from machine-readable kind to display text. A kind arrives as
   * the server's `kind` field when it sends one, otherwise from the HTTP status
   * or from the transport (api.js tags network failures). Nothing here reads
   * the human-readable message to decide the kind.
   */
  const FAILURE_LABELS = {
    conflict: 'A file with this name is already in the destination. Turn on “Replace files with the same name” to overwrite it.',
    'too-large': 'Larger than the server’s upload size limit.',
    forbidden: 'The server refused access to the destination.',
    destination: 'The destination folder cannot be used.',
    'invalid-name': 'The server does not accept this file name.',
    network: 'Network error: the connection dropped before the server answered.',
    server: 'Server error: the file was not saved.',
  };
  /** Kinds whose server message carries a figure worth showing (the size limit, say). */
  const FAILURE_SHOWS_DETAIL = new Set(['too-large', 'server']);
  const STATUS_KINDS = { 403: 'forbidden', 409: 'conflict', 413: 'too-large' };

  function failureKind(err) {
    if (!err) return null;
    if (typeof err.kind === 'string' && err.kind) return err.kind;
    if (typeof err.status === 'number') {
      if (Object.prototype.hasOwnProperty.call(STATUS_KINDS, err.status)) return STATUS_KINDS[err.status];
      if (err.status >= 500) return 'server';
    }
    return null;
  }

  /** { kind, text, detail }. An unrecognised kind keeps the server's own message. */
  function describeFailure(err) {
    const kind = failureKind(err);
    const message = err && typeof err.message === 'string' ? err.message : '';
    if (kind && Object.prototype.hasOwnProperty.call(FAILURE_LABELS, kind)) {
      return { kind, text: FAILURE_LABELS[kind], detail: message };
    }
    return { kind: kind || 'unknown', text: message || 'Upload failed.', detail: '' };
  }

  /* ── Destination ── */

  /**
   * Client-side shape check for a typed destination. The server stays the
   * authority (PathService); this only refuses what can never be a client path,
   * so it is not echoed back as if it were one.
   */
  function normalizeDestination(raw) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) {
      return { ok: false, reason: 'empty', message: 'Enter a folder path, or choose a folder from the list.' };
    }
    if (/^[A-Za-z]:/.test(value) || value.includes('\\')) {
      return { ok: false, reason: 'os-path', message: 'That is an operating-system path. Use a path inside the storage root, such as /media/photos.' };
    }
    if (!value.startsWith('/')) {
      return { ok: false, reason: 'relative', message: 'A destination starts at the storage root, “/”, for example /media.' };
    }
    if (value.length > 4096 || /[\x00-\x1F]/.test(value)) {
      return { ok: false, reason: 'invalid', message: 'That path is too long or contains control characters.' };
    }
    const segments = value.split('/').filter(Boolean);
    if (segments.some(s => s === '.' || s === '..')) {
      return { ok: false, reason: 'traversal', message: 'A destination cannot contain “.” or “..” segments.' };
    }
    return { ok: true, path: '/' + segments.join('/') };
  }

  /** Plain-text reason for a destination verdict. Callers escape or use textContent. */
  function describeVerdict(path, verdict) {
    switch (verdict && verdict.status) {
      case 'missing': return `“${path}” does not exist.`;
      case 'not-folder': return `“${path}” is a file, not a folder.`;
      case 'denied': return `“${path}” cannot be written to: the server refused access to it.`;
      case 'unreachable': return `“${path}” could not be checked${verdict.detail ? ` (${verdict.detail})` : ''}.`;
      case 'checking': return `Checking “${path}”…`;
      default: return '';
    }
  }

  /** Flatten GET /api/fs/tree. That endpoint stops two levels below the root. */
  function flattenTree(tree) {
    const out = [];
    const walk = (nodes, depth) => {
      if (!Array.isArray(nodes)) return;
      for (const node of nodes) {
        if (!node || typeof node.path !== 'string') continue;
        out.push({ path: node.path, label: node.path === '/' ? '/ (storage root)' : node.path, depth });
        walk(node.children, depth + 1);
      }
    };
    walk(tree, 0);
    return out;
  }

  /* ── Recent uploads ── */

  /** Upload records from GET /api/dashboard/summary `activities`. They carry no size. */
  function selectRecentUploads(activities) {
    if (!Array.isArray(activities)) return null;
    return activities
      .filter(a => a && a.type === 'upload' && typeof a.target === 'string' && a.target)
      .map(a => ({
        name: a.target,
        folder: typeof a.folder === 'string' && a.folder ? a.folder : null,
        time: Number.isFinite(a.time) && a.time > 0 ? a.time : null,
      }));
  }

  /* ── Announcements and drag state ── */

  /**
   * Live-region text. Progress is bucketed to quarters so the once-per-second
   * tick does not re-announce every intermediate percentage.
   */
  function buildAnnouncement(counts, progress) {
    if (!counts.total) return 'Upload queue is empty.';
    const parts = [`${counts.uploading} uploading`, `${counts.queued} queued`, `${counts.done} complete`];
    if (counts.paused) parts.push(`${counts.paused} paused`);
    if (counts.held) parts.push(`${counts.held} on hold`);
    if (counts.failed) parts.push(`${counts.failed} failed`);
    let text = parts.join(', ') + '.';
    if (progress && progress.counted) text += ` Overall ${Math.floor(progress.pct / 25) * 25}%.`;
    return text;
  }

  /**
   * Page-wide drag highlight. Entering a child fires its dragenter before the
   * parent's dragleave, so a depth counter survives movement across children;
   * a dragleave whose relatedTarget is outside the document resets it, and the
   * counter can never go below zero.
   */
  function createDragState() {
    let depth = 0;
    return {
      enter(hasFiles) { if (hasFiles) depth++; return depth > 0; },
      leave(stillInside) { depth = stillInside ? Math.max(0, depth - 1) : 0; return depth > 0; },
      reset() { depth = 0; return false; },
      get active() { return depth > 0; },
    };
  }

  /* ══════════════════════════════════════════
     ROW MARKUP
     Every interpolated value goes through escapeHtml.
     ══════════════════════════════════════════ */

  function uploadingMeta(item) {
    const speed = item.speed > 0 ? Format.speed(item.speed) : `${UNAVAILABLE} speed`;
    return `${Format.bytes(item.uploaded)} of ${Format.bytes(item.size)}
      <span class="sep"></span> ${speed}
      <span class="sep"></span> ${formatRemaining(computeRemainingSeconds(item))}
      <span class="sep"></span> to <span class="qi-dest">${escapeHtml(item.destination)}</span>`;
  }

  function actionButton(act, iconName, label, name, id) {
    return `<button type="button" class="btn-icon btn-icon-sm" data-act="${act}" data-id="${id}" data-tip="${label}" data-tip-pos="bottom" aria-label="${label}: ${name}">${icon(iconName, 15)}</button>`;
  }

  function renderItemHTML(item) {
    const pct = computeProgressPct(item);
    const t = resolveType(item.name);
    const name = escapeHtml(item.name);
    const id = escapeHtml(item.id);
    const dest = escapeHtml(item.destination);
    const to = `<span class="sep"></span> to <span class="qi-dest">${dest}</span>`;

    let statusEl;
    let meta;
    let actions;

    switch (item.status) {
      case 'uploading':
        statusEl = '<span class="qi-status uploading">Uploading</span>';
        meta = uploadingMeta(item);
        actions = actionButton('pause', 'pause', 'Pause', name, id) + actionButton('cancel', 'x', 'Cancel', name, id);
        break;
      case 'paused':
        statusEl = '<span class="qi-status paused">Paused</span>';
        meta = `${Format.bytes(item.size)} <span class="sep"></span> Restarts from the beginning when resumed ${to}`;
        actions = actionButton('resume', 'play', 'Resume', name, id) + actionButton('cancel', 'x', 'Remove', name, id);
        break;
      case 'held':
        statusEl = '<span class="qi-status paused">On hold</span>';
        meta = `${Format.bytes(item.size)} <span class="sep"></span> Not sent: destination unusable ${to}`;
        actions = actionButton('cancel', 'x', 'Remove', name, id);
        break;
      case 'done': {
        const took = item.endTime && item.startTime ? Format.duration((item.endTime - item.startTime) / 1000) : UNAVAILABLE;
        const saved = item.savedPath ? `Saved as <span class="qi-dest">${escapeHtml(item.savedPath)}</span>` : `Saved ${to}`;
        meta = `${Format.bytes(item.size)} <span class="sep"></span> ${saved} <span class="sep"></span> took ${took}`;
        statusEl = '<span class="qi-status done">Complete</span>';
        actions = actionButton('cancel', 'x', 'Remove from list', name, id);
        break;
      }
      case 'failed': {
        const detail = FAILURE_SHOWS_DETAIL.has(item.errorKind) && item.errorDetail
          ? ` <span class="qi-detail">${escapeHtml(item.errorDetail)}</span>` : '';
        statusEl = '<span class="qi-status failed">Failed</span>';
        meta = `<span class="err">${escapeHtml(item.error || 'Upload failed.')}</span>${detail} ${to}`;
        actions = actionButton('retry', 'refresh', 'Retry', name, id) + actionButton('cancel', 'x', 'Remove', name, id);
        break;
      }
      default: // queued
        statusEl = '<span class="qi-status queued">Queued</span>';
        meta = `${Format.bytes(item.size)} <span class="sep"></span> Waiting for a slot ${to}`;
        actions = actionButton('cancel', 'x', 'Remove', name, id);
    }

    const stateClass = {
      uploading: 'is-uploading',
      done: 'is-done',
      failed: 'is-failed',
      paused: 'is-paused',
      held: 'is-paused',
    }[item.status] || '';

    return `
      <div class="queue-item ${stateClass}" data-item-id="${id}">
        <div class="qi-icon ftype-icon ${escapeHtml(t.key)}">${icon(t.icon, 17)}</div>
        <div class="qi-body">
          <div class="qi-top">
            <div class="qi-name" title="${name}">${name}</div>
            <div class="qi-state">
              ${statusEl}
              <div class="qi-pct">${Math.round(pct)}%</div>
            </div>
          </div>
          <div class="qi-bar" aria-hidden="true"><div class="qi-fill" style="width:${pct}%"></div></div>
          <div class="qi-meta">${meta}</div>
        </div>
        <div class="qi-actions">${actions}</div>
      </div>
    `;
  }

  /* ══════════════════════════════════════════
     DROPZONE AND PAGE-WIDE DROP
     Files may be dropped anywhere on the page; the copy says so. Every drop is
     prevented from navigating the page away, file-bearing or not.
     ══════════════════════════════════════════ */

  const drag = createDragState();

  const dragHasFiles = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));

  function paintDrag() {
    $('#dropzone')?.classList.toggle('is-dragover', drag.active);
  }

  function onDragEnter(e) {
    drag.enter(dragHasFiles(e));
    paintDrag();
  }

  function onDragOver(e) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = dragHasFiles(e) ? 'copy' : 'none';
  }

  function onDragLeave(e) {
    const root = document.documentElement;
    drag.leave(!!(e.relatedTarget && root && root.contains(e.relatedTarget)));
    paintDrag();
  }

  function onDragEnd() {
    drag.reset();
    paintDrag();
  }

  function onDrop(e) {
    e.preventDefault();
    drag.reset();
    paintDrag();
    if (!dragHasFiles(e)) return;
    return filesFromDataTransfer(e.dataTransfer).then(({ files, unreadable }) => addFiles(files, unreadable));
  }

  /**
   * Collect dropped files, walking dropped folders. Entries must be taken
   * synchronously inside the drop event, before the first await.
   */
  function filesFromDataTransfer(dt) {
    const items = dt && dt.items ? Array.from(dt.items) : [];
    const entries = items.map(i => (i && i.kind === 'file' && typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null));
    if (!entries.length || !entries.every(Boolean)) {
      return Promise.resolve({ files: Array.from((dt && dt.files) || []), unreadable: [] });
    }
    const files = [];
    const unreadable = [];
    return Promise.all(entries.map(entry => walkEntry(entry, files, unreadable))).then(() => ({ files, unreadable }));
  }

  function walkEntry(entry, files, unreadable) {
    if (entry.isFile) {
      return new Promise(resolve => entry.file(
        f => { files.push(f); resolve(); },
        () => { unreadable.push(entry.name); resolve(); }
      ));
    }
    if (!entry.isDirectory) return Promise.resolve();
    const reader = entry.createReader();
    return new Promise(resolve => {
      const batch = () => reader.readEntries(
        list => {
          if (!list.length) return resolve();
          Promise.all(list.map(child => walkEntry(child, files, unreadable))).then(batch);
        },
        () => { unreadable.push(entry.name); resolve(); }
      );
      batch();
    });
  }

  function initDropzone() {
    const dz = $('#dropzone');
    const input = $('#fileInput');
    const folderInput = $('#folderInput');
    if (!dz) return;

    // Pointer activation of the zone itself; its own controls handle themselves.
    dz.addEventListener('click', e => {
      if (e.target.closest('button, a, input, label')) return;
      input?.click();
    });

    // Keyboard activation. Only when the zone itself has focus, so Enter on a
    // button inside it does not open the picker a second time.
    dz.addEventListener('keydown', e => {
      if (e.target !== dz) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault(); // Space would otherwise scroll the page
        input?.click();
      }
    });

    $('#browseFiles')?.addEventListener('click', e => { e.stopPropagation(); input?.click(); });
    $('#browseFolder')?.addEventListener('click', e => { e.stopPropagation(); folderInput?.click(); });

    // A cancelled picker fires no change event (or an empty one): nothing is added.
    [input, folderInput].forEach(inp => inp?.addEventListener('change', e => {
      addFiles(Array.from(e.target.files || []));
      e.target.value = '';
    }));

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', onDragEnd);
  }

  /* ══════════════════════════════════════════
     ADD FILES → QUEUE
     ══════════════════════════════════════════ */

  function addFiles(files, unreadable = []) {
    const list = Array.isArray(files) ? files : [];
    if (unreadable.length) {
      const shown = unreadable.slice(0, 5).join(', ');
      const more = unreadable.length > 5 ? ` and ${unreadable.length - 5} more` : '';
      Toast.warning(`${unreadable.length} item${unreadable.length !== 1 ? 's' : ''} could not be read`, `${shown}${more}`);
    }
    if (!list.length) return 0;

    // The destination is captured per item now, so changing it later never
    // moves files that are already queued.
    const destination = state.destination;
    list.forEach(f => {
      const type = resolveType(f.name);
      state.queue.push({
        id: uid('up'),
        name: f.name,
        size: f.size,
        uploaded: 0,
        speed: 0,
        status: 'queued',
        type: type.key,
        icon: type.icon,
        destination,
        error: null,
        errorKind: null,
        errorDetail: null,
        savedPath: null,
        startTime: null,
        endTime: null,
        file: f,
        attempt: 0,
      });
    });

    Toast.success(`${list.length} file${list.length !== 1 ? 's' : ''} added to the queue`, `Destination: ${destination}`);
    renderQueue();
    if (state.options.autoStart) state.running = true;
    fillActive();
    renderSummaries();
    return list.length;
  }

  /* ══════════════════════════════════════════
     DESTINATION CHECKS
     A destination is checked once before anything is sent to it. While the
     check runs its items wait; if it fails they are held together under one
     notice instead of each failing with the same reason.
     ══════════════════════════════════════════ */

  async function checkDestination(path) {
    try {
      await window.API.get(`/fs/list?path=${encodeURIComponent(path)}&limit=1`, { silent: true });
      return { status: 'ok' };
    } catch (err) {
      const status = err && err.status;
      if (status === 404) return { status: 'missing' };
      if (status === 400) return { status: 'not-folder' };
      if (status === 403) return { status: 'denied' };
      return { status: 'unreachable', detail: (err && err.message) || '' };
    }
  }

  function verifyDestination(path, { force = false } = {}) {
    const known = state.verdicts.get(path);
    if (known && known.status === 'checking') return known.promise;
    if (known && !force) return Promise.resolve(known);
    const entry = { status: 'checking' };
    entry.promise = checkDestination(path).then(verdict => {
      state.verdicts.set(path, verdict);
      return verdict;
    });
    state.verdicts.set(path, entry);
    return entry.promise;
  }

  function releaseHeld(path) {
    let released = 0;
    state.queue.forEach(item => {
      if (item.status === 'held' && item.destination === path) {
        item.status = 'queued';
        released++;
      }
    });
    if (released) {
      renderQueue();
      state.running = true;
      fillActive();
    }
    renderSummaries();
    return released;
  }

  async function createFolder(path) {
    try {
      await window.API.post('/fs/folder', { path }, { silent: true });
    } catch (err) {
      return { ok: false, message: `“${path}” could not be created: ${(err && err.message) || 'request failed'}.` };
    }
    const verdict = await verifyDestination(path, { force: true });
    if (verdict.status !== 'ok') return { ok: false, message: describeVerdict(path, verdict) };
    return { ok: true };
  }

  /* ══════════════════════════════════════════
     UPLOAD ENGINE
     ══════════════════════════════════════════ */

  function startUploads() {
    state.running = true;
    fillActive();
    renderSummaries();
  }

  function fillActive() {
    let held = false;
    const unchecked = new Set();
    for (const item of state.queue) {
      if (item.status !== 'queued') continue;
      const verdict = state.verdicts.get(item.destination);
      if (!verdict) unchecked.add(item.destination);
      else if (verdict.status !== 'ok' && verdict.status !== 'checking') {
        item.status = 'held';
        held = true;
      }
    }
    unchecked.forEach(dest => verifyDestination(dest).then(() => fillActive()));
    if (held) {
      renderQueue();
      renderSummaries();
    }

    if (!state.running) return;
    // Lowering the concurrency never aborts a transfer: nothing new starts until
    // the in-flight count is back within the limit.
    while (state.activeCount < state.concurrency) {
      const next = state.queue.find(q => q.status === 'queued' && state.verdicts.get(q.destination)?.status === 'ok');
      if (!next) break;
      state.activeCount++;
      processUpload(next);
    }
  }

  async function processUpload(item) {
    item.attempt = (item.attempt || 0) + 1;
    const attempt = item.attempt;
    Object.assign(item, {
      status: 'uploading', startTime: Date.now(), endTime: null, lastBytes: 0, lastTime: Date.now(),
      speed: 0, uploaded: 0, error: null, errorKind: null, errorDetail: null, savedPath: null,
    });
    renderQueueItem(item.id);
    ensureTicker();

    // Fields BEFORE the file part: the server then validates the destination
    // before writing a single byte (see docs/CONTRACTS.md, POST /api/fs/upload).
    const form = new FormData();
    form.append('destination', item.destination);
    form.append('overwrite', String(!!state.options.overwrite));
    form.append('file', item.file);

    const { promise, abort } = window.API.upload('/fs/upload', form, (loaded, total) => {
      if (item.attempt !== attempt || item.status !== 'uploading') return;
      const sent = scaleTransferred(loaded, total, item.size);
      const now = Date.now();
      const elapsed = (now - item.lastTime) / 1000;
      if (elapsed > 0.5) { // sample speed at most twice a second to avoid jitter
        item.speed = Math.max(0, (sent - item.lastBytes) / elapsed);
        item.lastBytes = sent;
        item.lastTime = now;
      }
      item.uploaded = sent;
      updateItemProgress(item);
    });
    item.abort = abort;

    try {
      const response = await promise;
      if (item.attempt === attempt && item.status === 'uploading') {
        const data = response && response.data;
        item.status = 'done';
        item.uploaded = item.size;
        item.endTime = Date.now();
        item.speed = 0;
        item.savedPath = data && typeof data.path === 'string' ? data.path : null;
        state.session.completed++;
        state.session.bytes += data && Number.isFinite(data.size) ? data.size : item.size;
        noteOutcome('done', item);
      }
    } catch (err) {
      // A pause or cancel aborts on purpose and has already set the status.
      if (item.attempt === attempt && item.status === 'uploading') {
        const failure = describeFailure(err);
        item.status = 'failed';
        item.speed = 0;
        item.error = failure.text;
        item.errorKind = failure.kind;
        item.errorDetail = failure.detail;
        noteOutcome('failed', item);
        if (mayBeDestinationFailure(err, failure.kind)) recheckAfterFailure(item);
      }
    } finally {
      if (item.abort === abort) item.abort = null;
      state.activeCount--;
      if (state.queue.includes(item)) renderQueueItem(item.id);
      afterSettled();
    }
  }

  function mayBeDestinationFailure(err, kind) {
    if (kind === 'conflict' || kind === 'too-large' || kind === 'network') return false;
    const status = err && err.status;
    return status === 400 || status === 403 || status === 404;
  }

  /**
   * A destination valid at queue time may have gone since. Re-check it once
   * (its other items wait meanwhile); if it is unusable this item carries the
   * destination reason and the rest are held, not retried blindly.
   */
  function recheckAfterFailure(item) {
    const dest = item.destination;
    verifyDestination(dest, { force: true }).then(verdict => {
      if (verdict.status !== 'ok') {
        item.errorKind = 'destination';
        item.error = `${FAILURE_LABELS.destination} ${describeVerdict(dest, verdict)}`;
        item.errorDetail = '';
        if (state.queue.includes(item)) renderQueueItem(item.id);
      }
      fillActive();
      renderSummaries();
    });
  }

  function afterSettled() {
    fillActive();
    const counts = computeQueueCounts(state.queue);
    if (!state.options.autoStart && !counts.queued && !counts.uploading) state.running = false;
    renderSummaries();
  }

  /** Completions and failures are announced once per burst, not once per file. */
  function noteOutcome(kind, item) {
    const o = state.outcomes;
    if (kind === 'done') o.done.push(item.name);
    else o.failed++;
    if (o.timer) return;
    o.timer = setTimeout(flushOutcomes, 1200);
  }

  function flushOutcomes() {
    const o = state.outcomes;
    o.timer = null;
    const done = o.done.splice(0);
    const failed = o.failed;
    o.failed = 0;
    if (done.length === 1) Toast.success('Upload complete', done[0]);
    else if (done.length > 1) Toast.success(`${done.length} uploads complete`, `Latest: ${done[done.length - 1]}`);
    if (failed) Toast.error(`${failed} upload${failed !== 1 ? 's' : ''} failed`, 'The reason is shown on each row.');
    if (done.length) loadRecent();
  }

  function ensureTicker() {
    if (!state.ticker) state.ticker = setInterval(tick, 1000);
  }

  function tick() {
    const tiles = computeQueueTiles(state.queue, state.session);
    state.speedHistory.shift();
    state.speedHistory.push(tiles.speed);
    if (!tiles.active) {
      clearInterval(state.ticker);
      state.ticker = null;
    }
    renderSummaries();
  }

  /* ══════════════════════════════════════════
     ITEM ACTIONS
     ══════════════════════════════════════════ */

  const findItem = id => state.queue.find(q => q.id === id);

  /** Pausing aborts the request: transfer is not chunked, so resuming restarts at 0. */
  function pauseItem(id) {
    const item = findItem(id);
    if (!item || item.status !== 'uploading') return;
    item.status = 'paused';
    item.speed = 0;
    item.uploaded = 0;
    if (typeof item.abort === 'function') item.abort();
    renderQueueItem(id);
    renderSummaries();
  }

  function resumeItem(id) {
    const item = findItem(id);
    if (!item || item.status !== 'paused') return;
    item.status = 'queued';
    item.uploaded = 0;
    renderQueueItem(id);
    startUploads();
  }

  function retryItem(id) {
    const item = findItem(id);
    if (!item || item.status !== 'failed') return;
    item.status = 'queued';
    item.error = null;
    item.errorKind = null;
    item.errorDetail = null;
    item.uploaded = 0;
    renderQueueItem(id);
    startUploads();
  }

  function cancelItem(id) {
    const item = findItem(id);
    if (!item) return;
    const wasUploading = item.status === 'uploading';
    item.status = 'cancelled';
    if (wasUploading && typeof item.abort === 'function') item.abort();
    state.queue = state.queue.filter(q => q !== item);

    const node = document.querySelector(`[data-item-id="${item.id}"]`);
    if (node && state.queue.length) node.remove();
    else renderQueue();
    fillActive();
    renderSummaries();
  }

  function clearCompleted() {
    if (!state.queue.some(q => q.status === 'done')) return;
    state.queue = state.queue.filter(q => q.status !== 'done');
    renderQueue();
    renderSummaries();
  }

  function retryAllFailed() {
    let n = 0;
    state.queue.forEach(item => {
      if (item.status !== 'failed') return;
      item.status = 'queued';
      item.error = null;
      item.errorKind = null;
      item.errorDetail = null;
      item.uploaded = 0;
      n++;
    });
    if (!n) return;
    Toast.info(`Retrying ${n} failed upload${n !== 1 ? 's' : ''}`);
    renderQueue();
    startUploads();
  }

  function pauseAll() {
    let n = 0;
    state.queue.forEach(item => {
      if (item.status !== 'uploading') return;
      item.status = 'paused';
      item.speed = 0;
      item.uploaded = 0;
      if (typeof item.abort === 'function') item.abort();
      n++;
    });
    if (!n) return;
    renderQueue();
    renderSummaries();
  }

  function resumeAll() {
    let n = 0;
    state.queue.forEach(item => {
      if (item.status !== 'paused') return;
      item.status = 'queued';
      item.uploaded = 0;
      n++;
    });
    if (!n) return;
    renderQueue();
    startUploads();
  }

  function startQueued() {
    if (!state.queue.some(q => q.status === 'queued')) return;
    startUploads();
  }

  async function cancelAll() {
    const pending = state.queue.filter(q => q.status !== 'done');
    if (!pending.length) return;

    const inFlight = pending.filter(q => q.status === 'uploading').length;
    const waiting = pending.length - inFlight;
    const done = state.queue.length - pending.length;
    const plural = (n, word) => `${n} ${word}${n !== 1 ? 's' : ''}`;
    const message = [
      inFlight ? `${plural(inFlight, 'transfer')} in progress will be stopped; the server discards the partial data, so no half-written file is left behind.` : '',
      waiting ? `${plural(waiting, 'queued, paused, held or failed item')} will be removed from the queue.` : '',
      `${plural(done, 'completed file')} stay${done === 1 ? 's' : ''} on the server.`,
    ].filter(Boolean).join(' ');

    // Modal.confirm inserts title and message as HTML: escape what is passed.
    const ok = await Modal.confirm({
      title: escapeHtml('Cancel all pending uploads?'),
      message: escapeHtml(message),
      confirmText: 'Cancel uploads',
      cancelText: 'Keep uploading',
      danger: true,
    });
    if (!ok) return;

    pending.forEach(item => {
      const wasUploading = item.status === 'uploading';
      item.status = 'cancelled';
      if (wasUploading && typeof item.abort === 'function') item.abort();
    });
    state.queue = state.queue.filter(q => q.status === 'done');
    if (!state.options.autoStart) state.running = false;
    renderQueue();
    renderSummaries();
  }

  /* ══════════════════════════════════════════
     RENDER — QUEUE
     One delegated listener on #queueList; a state change rewrites one row.
     ══════════════════════════════════════════ */

  function renderQueue() {
    const wrap = $('#queueList');
    if (!wrap) return;

    if (!state.queue.length) {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:48px 24px;">
          <div class="empty-icon">${icon('inbox', 26)}</div>
          <div class="empty-title">Upload queue is empty</div>
          <div class="empty-desc">Drop files anywhere on this page, or use Choose files above.</div>
        </div>
      `;
      return;
    }
    wrap.innerHTML = state.queue.map(renderItemHTML).join('');
  }

  function renderQueueItem(id) {
    const item = findItem(id);
    if (!item) return;
    const node = document.querySelector(`[data-item-id="${item.id}"]`);
    if (!node) { renderQueue(); return; }
    const hadFocus = typeof node.contains === 'function' && node.contains(document.activeElement);
    node.outerHTML = renderItemHTML(item);
    if (hadFocus) {
      // Keep keyboard users on the row whose control they just used.
      const next = document.querySelector(`[data-item-id="${item.id}"] [data-act]`);
      if (next && typeof next.focus === 'function') next.focus();
    }
  }

  function updateItemProgress(item) {
    const node = document.querySelector(`[data-item-id="${item.id}"]`);
    if (!node) return;
    const pct = computeProgressPct(item);
    const fill = node.querySelector('.qi-fill');
    const pctEl = node.querySelector('.qi-pct');
    const meta = node.querySelector('.qi-meta');
    if (fill) fill.style.width = pct + '%';
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    if (meta && item.status === 'uploading') meta.innerHTML = uploadingMeta(item);
  }

  function onQueueClick(e) {
    const btn = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-act]') : null;
    if (!btn) return;
    // Read from the matched button, not e.target: a click on the icon inside
    // the button must still resolve.
    const act = btn.getAttribute('data-act');
    const id = btn.getAttribute('data-id');
    if (act === 'pause') pauseItem(id);
    else if (act === 'resume') resumeItem(id);
    else if (act === 'retry') retryItem(id);
    else if (act === 'cancel') cancelItem(id);
  }

  /* ══════════════════════════════════════════
     HELD-DESTINATION NOTICE
     ══════════════════════════════════════════ */

  function heldGroups() {
    const groups = new Map();
    state.queue.forEach(item => {
      if (item.status === 'held') groups.set(item.destination, (groups.get(item.destination) || 0) + 1);
    });
    return [...groups.entries()].map(([dest, count]) => ({ dest, count }));
  }

  function renderNotice() {
    const wrap = $('#queueNotice');
    if (!wrap) return;
    const groups = heldGroups();
    if (!groups.length) {
      wrap.hidden = true;
      wrap.innerHTML = '';
      return;
    }
    wrap.hidden = false;
    wrap.innerHTML = groups.map(({ dest, count }) => {
      const verdict = state.verdicts.get(dest);
      const reason = describeVerdict(dest, verdict) || FAILURE_LABELS.destination;
      const d = escapeHtml(dest);
      return `
        <div class="queue-notice-row">
          <span class="queue-notice-ico">${icon('alert', 15)}</span>
          <div class="queue-notice-text">
            <strong>${count} upload${count !== 1 ? 's' : ''} on hold.</strong>
            ${escapeHtml(reason)} Nothing was sent.
          </div>
          <div class="queue-notice-actions">
            ${verdict && verdict.status === 'missing' ? `<button type="button" class="btn btn-primary btn-sm" data-notice-act="create" data-dest="${d}">Create folder</button>` : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-notice-act="recheck" data-dest="${d}">Check again</button>
            <button type="button" class="btn btn-ghost btn-sm" data-notice-act="discard" data-dest="${d}">Remove from queue</button>
          </div>
        </div>`;
    }).join('');
  }

  async function onNoticeClick(e) {
    const btn = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-notice-act]') : null;
    if (!btn) return;
    const act = btn.getAttribute('data-notice-act');
    const dest = btn.getAttribute('data-dest');
    if (act === 'discard') {
      state.queue = state.queue.filter(q => !(q.status === 'held' && q.destination === dest));
      renderQueue();
      renderSummaries();
    } else if (act === 'recheck') {
      const verdict = await verifyDestination(dest, { force: true });
      if (verdict.status === 'ok') releaseHeld(dest);
      else renderSummaries();
    } else if (act === 'create') {
      const result = await createFolder(dest);
      if (result.ok) {
        Toast.success('Folder created', dest);
        releaseHeld(dest);
      } else {
        Toast.error('Folder not created', result.message);
        renderSummaries();
      }
    }
  }

  /* ══════════════════════════════════════════
     STATS, GLOBAL PROGRESS, METRICS, LIVE REGION
     ══════════════════════════════════════════ */

  function renderSummaries() {
    const counts = computeQueueCounts(state.queue);
    const progress = computeGlobalProgress(state.queue);
    renderQueueStats(counts);
    renderGlobalProgress(progress);
    renderMetrics();
    renderNotice();
    syncBusy(counts);
    announce(buildAnnouncement(counts, progress));
  }

  function renderQueueStats(counts = computeQueueCounts(state.queue)) {
    const wrap = $('#queueStats');
    if (!wrap) return;
    const stat = (dot, n, label) => `<div class="qstat"><span class="qstat-dot ${dot}" aria-hidden="true"></span> <span class="val">${n}</span> ${label}</div>`;
    wrap.innerHTML = [
      stat('active', counts.uploading, 'uploading'),
      stat('queued', counts.queued, 'queued'),
      stat('done', counts.done, 'complete'),
      counts.paused ? stat('queued', counts.paused, 'paused') : '',
      counts.held ? stat('failed', counts.held, 'on hold') : '',
      counts.failed ? stat('failed', counts.failed, 'failed') : '',
    ].join('');
  }

  function renderGlobalProgress(progress = computeGlobalProgress(state.queue)) {
    const wrap = $('#queueGlobal');
    if (!wrap) return;
    if (!progress) {
      wrap.style.display = 'none';
      wrap.innerHTML = '';
      return;
    }
    wrap.style.display = '';
    const pct = Math.round(progress.pct);
    wrap.innerHTML = `
      <div class="qg-top">
        <div class="qg-label">${icon('uploadCloud', 15)} Overall progress</div>
        <div class="qg-right">
          <span>${Format.bytes(progress.sentBytes)} / ${Format.bytes(progress.totalBytes)}</span>
          ${progress.speed > 0 ? `<span aria-hidden="true">·</span><span>${Format.speed(progress.speed)}</span>` : ''}
          ${progress.eta != null ? `<span aria-hidden="true">·</span><span>${formatRemaining(progress.eta)}</span>` : ''}
          ${progress.failed ? `<span aria-hidden="true">·</span><span class="qg-failed">${progress.failed} failed, not counted</span>` : ''}
          <span class="qg-pct">${pct}%</span>
        </div>
      </div>
      <div class="progress" role="progressbar" aria-label="Overall upload progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <div class="progress-bar ${progress.speed > 0 ? 'is-striped' : ''}" style="width:${progress.pct}%"></div>
      </div>
    `;
  }

  const TILES = [
    { key: 'speed', icon: 'zap', label: 'Current speed', graph: true },
    { key: 'active', icon: 'activity', label: 'Uploading now' },
    { key: 'completed', icon: 'checkCircle', label: 'Completed since this page opened' },
    { key: 'bytes', icon: 'hardDrive', label: 'Uploaded since this page opened' },
  ];

  let metricWrap = null;
  let metricNodes = null;

  /** Built once; afterwards only values change, so focus and hover survive the tick. */
  function buildMetrics(wrap) {
    wrap.innerHTML = TILES.map(t => `
      <div class="metric-tile" data-metric="${t.key}">
        <div class="metric-ico">${icon(t.icon, 16)}</div>
        <div class="metric-body">
          <div class="metric-value">${UNAVAILABLE}</div>
          <div class="metric-label">${t.label}</div>
        </div>
        ${t.graph ? `<div class="speed-graph" aria-hidden="true" title="Last 20 seconds">${'<div class="speed-bar"></div>'.repeat(state.speedHistory.length)}</div>` : ''}
      </div>
    `).join('');
    metricWrap = wrap;
    metricNodes = {};
    TILES.forEach(t => { metricNodes[t.key] = wrap.querySelector(`[data-metric="${t.key}"] .metric-value`); });
    metricNodes.bars = Array.from(wrap.querySelectorAll('.speed-bar') || []);
  }

  function renderMetrics() {
    const wrap = $('#uploadMetrics');
    if (!wrap) return;
    if (metricWrap !== wrap || !metricNodes) buildMetrics(wrap);

    const tiles = computeQueueTiles(state.queue, state.session);
    const values = {
      speed: tiles.speed > 0 ? Format.speed(tiles.speed) : UNAVAILABLE,
      active: String(tiles.active),
      completed: String(tiles.completed),
      bytes: Format.bytes(tiles.bytes),
    };
    Object.keys(values).forEach(key => {
      const node = metricNodes[key];
      if (node && node.textContent !== values[key]) node.textContent = values[key];
    });

    const max = Math.max(...state.speedHistory, 1);
    metricNodes.bars.forEach((bar, i) => {
      bar.style.height = clamp((state.speedHistory[i] / max) * 100, 6, 100) + '%';
    });
  }

  /** aria-busy on the rows while anything transfers. */
  function syncBusy(counts) {
    const wrap = $('#queueList');
    if (wrap) wrap.setAttribute('aria-busy', counts.uploading > 0 ? 'true' : 'false');
  }

  /** Throttled: at most one live-region update every 2 seconds, and only on change. */
  function announce(text) {
    const a = state.announce;
    a.pending = text;
    if (a.timer || text === a.last) return;
    const node = $('#queueAnnounce');
    if (node) node.textContent = text;
    a.last = text;
    a.timer = setTimeout(() => {
      a.timer = null;
      if (a.pending !== a.last) announce(a.pending);
    }, 2000);
  }

  /* ══════════════════════════════════════════
     PRESETS
     ══════════════════════════════════════════ */

  function renderPresets() {
    const wrap = $('#presetGrid');
    if (!wrap) return;
    wrap.innerHTML = presets.map(p => `
      <button type="button" class="preset-card ${state.preset === p.key ? 'is-active' : ''}" data-preset="${p.key}" aria-pressed="${state.preset === p.key}">
        <div class="preset-top">
          <div class="preset-ico">${icon(p.icon, 15)}</div>
          <div class="preset-name">${escapeHtml(p.name)}</div>
        </div>
        <div class="preset-desc">${escapeHtml(p.desc)}</div>
        <div class="preset-tags">
          ${presetTags(p).map(t => `<span class="preset-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      </button>
    `).join('');
  }

  function applyPreset(key) {
    const p = presets.find(x => x.key === key);
    if (!p) return;
    state.preset = key;
    state.concurrency = p.concurrency;
    renderPresets();
    renderConcurrency();
    Toast.info(`Preset: ${p.name}`, `${p.concurrency} file${p.concurrency !== 1 ? 's' : ''} at a time`);
    fillActive();
  }

  function onPresetClick(e) {
    const btn = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-preset]') : null;
    if (btn) applyPreset(btn.getAttribute('data-preset'));
  }

  function renderConcurrency() {
    const node = $('#concurrencyValue');
    if (node) node.textContent = `${state.concurrency} parallel transfer${state.concurrency !== 1 ? 's' : ''}`;
  }

  /* ══════════════════════════════════════════
     RECENT UPLOADS — recorded server activity, never a canned list
     ══════════════════════════════════════════ */

  async function loadRecent() {
    try {
      const summary = await window.API.get('/dashboard/summary', { silent: true });
      const items = selectRecentUploads(summary && summary.activities);
      state.recent = items
        ? { status: 'ok', items, message: '' }
        : { status: 'error', items: [], message: 'the response carried no activity list' };
    } catch (err) {
      state.recent = { status: 'error', items: [], message: (err && err.message) || 'request failed' };
    }
    renderRecent();
  }

  function renderRecent() {
    const wrap = $('#recentUploads');
    if (!wrap) return;
    const r = state.recent;

    if (r.status === 'loading') {
      wrap.innerHTML = '<div class="recent-empty">Loading recent uploads…</div>';
      return;
    }
    if (r.status === 'error') {
      wrap.innerHTML = `
        <div class="recent-empty is-error" data-recent-error>
          Recent uploads could not be loaded: ${escapeHtml(r.message)}.
          <button type="button" class="btn btn-ghost btn-sm" data-recent-retry>Retry</button>
        </div>`;
      return;
    }
    if (!r.items.length) {
      wrap.innerHTML = '<div class="recent-empty" data-recent-empty>No uploads are among the recently recorded server activity.</div>';
      return;
    }
    wrap.innerHTML = r.items.map(item => {
      const t = resolveType(item.name);
      const meta = [
        item.folder ? `in ${escapeHtml(item.folder)}` : '',
        item.time ? escapeHtml(Format.relative(item.time)) : '',
      ].filter(Boolean).join(' · ');
      return `
        <div class="recent-card">
          <div class="recent-thumb">
            <div class="ftype-icon ${escapeHtml(t.key)}">${icon(t.icon, 18)}</div>
          </div>
          <div class="recent-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
          <div class="recent-meta">${meta || UNAVAILABLE}</div>
        </div>
      `;
    }).join('');
  }

  function onRecentClick(e) {
    const btn = e.target && typeof e.target.closest === 'function' ? e.target.closest('[data-recent-retry]') : null;
    if (!btn) return;
    state.recent = { status: 'loading', items: [], message: '' };
    renderRecent();
    loadRecent();
  }

  /* ══════════════════════════════════════════
     DESTINATION PICKER / OPTIONS
     ══════════════════════════════════════════ */

  function renderDestination() {
    const dp = $('#destPath');
    if (dp) dp.innerHTML = `${icon('folder', 13)} <span class="dest-path-text">${escapeHtml(state.destination)}</span>`;
  }

  function setDestination(path) {
    state.destination = path;
    renderDestination();
  }

  function setPickerMessage(text, tone = '') {
    const msg = $('#destMsg');
    if (!msg) return;
    msg.textContent = text;
    msg.setAttribute('data-tone', tone);
  }

  function showCreate(path) {
    state.pendingCreate = path;
    const btn = $('#createDestination');
    if (btn) {
      btn.hidden = !path;
      btn.textContent = path ? `Create “${path}”` : '';
    }
  }

  function openPicker() {
    const picker = $('#destPicker');
    if (!picker) return;
    picker.hidden = false;
    $('#changeDestination')?.setAttribute('aria-expanded', 'true');
    const input = $('#destInput');
    if (input) input.value = state.destination;
    setPickerMessage('');
    showCreate(null);
    loadFolderOptions();
    $('#destSelect')?.focus();
  }

  function closePicker() {
    const picker = $('#destPicker');
    if (!picker || picker.hidden) return;
    picker.hidden = true;
    const change = $('#changeDestination');
    change?.setAttribute('aria-expanded', 'false');
    setPickerMessage('');
    showCreate(null);
    change?.focus();
  }

  async function loadFolderOptions() {
    const select = $('#destSelect');
    const note = $('#destTreeNote');
    if (!select) return;
    select.disabled = true;
    select.innerHTML = '<option value="">Loading folders…</option>';
    try {
      const folders = flattenTree(await window.API.get('/fs/tree', { silent: true }));
      select.innerHTML = '<option value="">Choose a folder…</option>' + folders.map(f =>
        `<option value="${escapeHtml(f.path)}"${f.path === state.destination ? ' selected' : ''}>${escapeHtml(f.label)}</option>`
      ).join('');
      select.disabled = false;
      if (note) note.textContent = 'Folders up to two levels below the root are listed. Type a path to use a deeper folder.';
    } catch (err) {
      select.innerHTML = '<option value="">Folder list unavailable</option>';
      if (note) note.textContent = `The folder list could not be loaded (${(err && err.message) || 'request failed'}). You can still type a path.`;
    }
  }

  /** Validate, check on the server, and only then make it current. */
  async function applyDestination(raw) {
    showCreate(null);
    const norm = normalizeDestination(raw);
    if (!norm.ok) {
      setPickerMessage(`${norm.message} The destination was not changed.`, 'error');
      return false;
    }
    setPickerMessage(`Checking “${norm.path}”…`);
    const verdict = await verifyDestination(norm.path, { force: true });
    if (verdict.status === 'ok') {
      setDestination(norm.path);
      closePicker();
      Toast.success('Destination updated', norm.path);
      releaseHeld(norm.path);
      return true;
    }
    setPickerMessage(`${describeVerdict(norm.path, verdict)} The destination was not changed.`, 'error');
    if (verdict.status === 'missing') showCreate(norm.path);
    return false;
  }

  /** Create a missing destination with POST /api/fs/folder, then make it current. */
  async function createAndUseDestination(path) {
    if (!path) return false;
    setPickerMessage(`Creating “${path}”…`);
    const result = await createFolder(path);
    if (!result.ok) {
      setPickerMessage(`${result.message} The destination was not changed.`, 'error');
      return false;
    }
    setDestination(path);
    closePicker();
    Toast.success('Folder created', `${path} is now the destination`);
    releaseHeld(path);
    return true;
  }

  function initDestination() {
    renderDestination();
    $('#changeDestination')?.addEventListener('click', () => {
      const picker = $('#destPicker');
      if (picker && picker.hidden) openPicker(); else closePicker();
    });
    $('#destSelect')?.addEventListener('change', e => {
      const input = $('#destInput');
      if (input && e.target.value) input.value = e.target.value;
      setPickerMessage('');
      showCreate(null);
    });
    $('#destInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); applyDestination(e.target.value); }
    });
    $('#destPicker')?.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closePicker(); }
    });
    $('#applyDestination')?.addEventListener('click', () => applyDestination($('#destInput')?.value));
    $('#createDestination')?.addEventListener('click', () => createAndUseDestination(state.pendingCreate));
    $('#cancelDestination')?.addEventListener('click', closePicker);

    $$('[data-option]').forEach(input => {
      const key = input.getAttribute('data-option');
      if (!Object.prototype.hasOwnProperty.call(DEFAULT_OPTIONS, key)) return;
      input.checked = !!state.options[key];
      input.addEventListener('change', () => {
        state.options[key] = input.checked;
        if (key === 'autoStart' && input.checked) startUploads();
      });
    });
  }

  /* ══════════════════════════════════════════
     BIND
     ══════════════════════════════════════════ */

  function bindGlobalActions() {
    $('#pauseAll')?.addEventListener('click', pauseAll);
    $('#resumeAll')?.addEventListener('click', resumeAll);
    $('#startQueued')?.addEventListener('click', startQueued);
    $('#retryFailed')?.addEventListener('click', retryAllFailed);
    $('#clearDone')?.addEventListener('click', clearCompleted);
    $('#cancelAll')?.addEventListener('click', cancelAll);
    $('#queueList')?.addEventListener('click', onQueueClick);
    $('#queueNotice')?.addEventListener('click', onNoticeClick);
    $('#presetGrid')?.addEventListener('click', onPresetClick);
    $('#recentUploads')?.addEventListener('click', onRecentClick);
  }

  /* ══════════════════════════════════════════
     INIT
     ══════════════════════════════════════════ */

  function init() {
    initDropzone();
    initDestination();
    renderPresets();
    renderConcurrency();
    bindGlobalActions();
    renderQueue();
    renderSummaries();
    renderRecent();
    loadRecent();
    verifyDestination(state.destination);
    if (window.AFM && AFM.Notifications) AFM.Notifications.bindTopbarBell();
  }

  /**
   * Client-side navigation away (router.js). The queue and any transfers in
   * flight are kept: they continue in the background and are shown again when
   * the page is revisited. Only the page-wide drop handlers go.
   */
  function destroy() {
    window.removeEventListener('dragenter', onDragEnter);
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('dragleave', onDragLeave);
    window.removeEventListener('drop', onDrop);
    window.removeEventListener('dragend', onDragEnd);
    drag.reset();
    metricWrap = null;
    metricNodes = null;
  }

  return {
    init,
    destroy,
    presets,
    DEFAULT_PRESET,
    DEFAULT_OPTIONS,
    FAILURE_LABELS,
    pure: {
      computeProgressPct, computeRemainingSeconds, formatRemaining, scaleTransferred,
      computeQueueCounts, computeQueueTiles, computeGlobalProgress,
      failureKind, describeFailure, normalizeDestination, describeVerdict, flattenTree,
      selectRecentUploads, buildAnnouncement, createDragState, presetTags,
      renderItemHTML, uploadingMeta,
    },
    _controller: {
      getState: () => state,
      addFiles, fillActive, startUploads, startQueued,
      pauseItem, resumeItem, retryItem, cancelItem, clearCompleted,
      retryAllFailed, pauseAll, resumeAll, cancelAll,
      applyPreset, applyDestination, createAndUseDestination, verifyDestination,
      onQueueClick, onNoticeClick, onDrop, onDragEnter, onDragLeave, onDragOver,
      renderQueue, renderQueueItem, updateItemProgress, renderMetrics, renderSummaries,
      renderRecent, loadRecent, flushOutcomes, tick,
    },
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'uploads') {
    Uploads.init();
  }
});

window.Uploads = Uploads;
