/* ============================================
   FILES.JS — Enterprise File Browser Logic
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Files = (() => {

  const { $, $$, icon, Format, Toast, Modal, ContextMenu, copyToClipboard, resolveType, Store } = window.AFM;

  /* ══════════════════════════════════════════
     STATE
     ══════════════════════════════════════════ */

  const state = {
    tree: [],               // Folder hierarchy from API
    files: [],              // Current page items from API
    totalFiles: 0,          // Total items in current folder matching filters
    typeCounts: {},         // Counts for filter chips

    view: Store.get('files-view', 'list'), // 'list' | 'grid'
    sort: { key: 'modified', dir: 'desc' },
    filter: 'all',          // 'all'|'folder'|'image'|'video'|'audio'|'document'|'archive'|'code'
    search: '',
    selected: new Set(),
    page: 1,
    perPage: 20,
    currentPath: '/',       // Root is represented as '/'

    isLoading: false
  };

  /* ══════════════════════════════════════════
     DATA FETCHING (API INTEGRATION)
     ══════════════════════════════════════════ */

  // Request ID to prevent race conditions (Stale Response Issue)
  let currentRequestId = 0;

  async function loadTree() {
    try {
      const data = await window.API.get('/fs/tree');
      state.tree = Array.isArray(data) ? data : [data];
      renderTree();
    } catch (e) {
      console.warn('[Files] Failed to load tree, using fallback');
      state.tree = [{ id: '/', name: 'All Files', path: '/', icon: 'hardDrive', children: [] }];
      renderTree();
    }
  }

  async function loadFiles() {
    // Generate a unique ID for this specific fetch request
    const reqId = ++currentRequestId;

    state.isLoading = true;

    // Ensure page is always a valid number to prevent page=NaN errors
    state.page = parseInt(state.page, 10) || 1;

    renderView();

    try {
      const params = new URLSearchParams({
        path: state.currentPath,
        page: state.page,
        limit: state.perPage,
        sort: state.sort.key,
        dir: state.sort.dir,
        search: state.search,
        type: state.filter
      });

      const res = await window.API.get(`/fs/list?${params.toString()}`);

      // SECURITY/ARCHITECTURE CHECK: If a new request was made while this one was pending,
      // discard this stale response to prevent UI bouncing.
      if (reqId !== currentRequestId) return;

      state.files = res.items || [];
      state.totalFiles = res.total || 0;
      state.typeCounts = res.counts || {};

    } catch (e) {
      if (reqId !== currentRequestId) return;
      console.warn('[Files] Failed to load files list');
      state.files = [];
      state.totalFiles = 0;
      state.typeCounts = {};
    } finally {
      if (reqId === currentRequestId) {
        state.isLoading = false;
        state.selected.clear();
        updateBulkBar();
        renderFilterChips();
        renderView();
      }
    }
  }

  /* ══════════════════════════════════════════
     RENDER — FOLDER TREE
     ══════════════════════════════════════════ */

  function renderTree() {
    const wrap = $('#folderTree');
    if (!wrap) return;

    function walk(nodes, depth = 0) {
      if (!nodes) return '';
      return nodes.map(n => {
        const hasChildren = Array.isArray(n.children) && n.children.length > 0;
        const isOpen = depth === 0; // Keep root open by default
        const isActive = n.path === state.currentPath;

        return `
          <div class="tree-node ${isOpen ? 'is-open' : ''}" data-path="${n.path}">
            <div class="tree-item ${isActive ? 'is-active' : ''}" data-tree-path="${n.path}">
              <span class="tree-caret ${hasChildren ? '' : 'is-empty'}">
                ${hasChildren ? icon('chevronRight', 11) : ''}
              </span>
              <span class="tree-ico">${icon(n.icon || 'folder', 14)}</span>
              <span class="tree-name">${n.name}</span>
            </div>
            ${hasChildren ? `<div class="tree-children">${walk(n.children, depth + 1)}</div>` : ''}
          </div>
        `;
      }).join('');
    }

    wrap.innerHTML = walk(state.tree);

    // Bind tree clicks
    wrap.querySelectorAll('.tree-caret').forEach(c => {
      c.addEventListener('click', e => {
        e.stopPropagation();
        c.closest('.tree-node').classList.toggle('is-open');
      });
    });

    wrap.querySelectorAll('.tree-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const newPath = item.getAttribute('data-tree-path');
        if (newPath === state.currentPath) return; // Already there

        state.currentPath = newPath;
        state.page = 1;
        state.filter = 'all'; // Reset filter when navigating
        state.search = '';

        const searchInput = $('#filesSearch');
        if (searchInput) searchInput.value = '';

        wrap.querySelectorAll('.tree-item').forEach(i => i.classList.remove('is-active'));
        item.classList.add('is-active');

        updateBreadcrumb();
        loadFiles();
      });
    });
  }

  /* ══════════════════════════════════════════
     RENDER — FILTER CHIPS
     ══════════════════════════════════════════ */

  function renderFilterChips() {
    const wrap = $('#filterChips');
    if (!wrap) return;

    const chips = [
      { key: 'all', label: 'All', icon: 'layers' },
      { key: 'folder', label: 'Folders', icon: 'folder' },
      { key: 'image', label: 'Images', icon: 'image' },
      { key: 'video', label: 'Videos', icon: 'video' },
      { key: 'document', label: 'Documents', icon: 'fileText' },
      { key: 'audio', label: 'Audio', icon: 'music' },
      { key: 'archive', label: 'Archives', icon: 'archive' },
      { key: 'code', label: 'Code', icon: 'code' },
    ];

    wrap.innerHTML = chips.map(c => {
      // Show count if provided by API, otherwise omit it
      const countStr = state.typeCounts[c.key] !== undefined
        ? `<span class="count">${Format.compact(state.typeCounts[c.key])}</span>`
        : '';

      return `
        <button class="filter-chip ${state.filter === c.key ? 'is-active' : ''}" data-filter="${c.key}">
          ${icon(c.icon, 13)}
          ${c.label}
          ${countStr}
        </button>
      `;
    }).join('');
  }

  /* ══════════════════════════════════════════
     RENDER — LIST VIEW (TABLE)
     ══════════════════════════════════════════ */

  function renderList() {
    const wrap = $('#filesContainer');
    if (!wrap) return;

    if (state.isLoading) {
      wrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-tertiary);">Loading files...</div>`;
      return;
    }

    if (!state.files.length) {
      wrap.innerHTML = renderEmpty();
      updateBulkBar();
      return;
    }

    const allSelected = state.files.length > 0 && state.files.every(f => state.selected.has(f.id));
    const anySelected = state.files.some(f => state.selected.has(f.id));

    const rows = state.files.map(f => {
      const t = resolveType(f.name, f.isFolder);
      const isSel = state.selected.has(f.id);

      let statusBadge = '';
      if (f.isFolder) {
        statusBadge = `<span class="badge">${f.itemsCount !== undefined ? f.itemsCount + ' items' : 'Folder'}</span>`;
      } else if (f.status) {
        statusBadge = `<span class="badge badge-${statusColor(f.status)}">${f.status}</span>`;
      }

      return `
        <tr data-id="${f.id}" class="${isSel ? 'is-selected' : ''}">
          <td class="col-check">
            <label class="checkbox">
              <input type="checkbox" data-check="${f.id}" ${isSel ? 'checked' : ''}>
              <span class="box">${icon('check', 11)}</span>
            </label>
          </td>
          <td>
            <div class="fname-cell">
              <div class="ftype-icon ${t.key}">${icon(t.icon, 16)}</div>
              <div class="fname-text">
                <div class="fname">${f.name} ${f.starred ? '<span style="color:#fbbf24">★</span>' : ''}</div>
                <div class="fpath">${f.path}</div>
              </div>
            </div>
          </td>
          <td><span class="mono-num">${f.isFolder ? '—' : Format.bytes(f.size)}</span></td>
          <td class="col-type"><span class="tag">${t.label}${t.ext ? '·' + t.ext.toUpperCase() : ''}</span></td>
          <td class="col-downloads"><span class="mono-num">${f.downloads != null ? Format.compact(f.downloads) : '—'}</span></td>
          <td class="col-modified"><span class="mono-num" style="font-size:12px;">${Format.relative(f.modified)}</span></td>
          <td class="col-status">${statusBadge}</td>
          <td class="col-actions">
            <div class="row-actions">
              ${!f.isFolder ? `<button class="btn-icon btn-icon-sm" data-tip="Download" data-act="download" data-id="${f.id}">${icon('download', 15)}</button>` : ''}
              <button class="btn-icon btn-icon-sm" data-tip="More" data-act="more" data-id="${f.id}">${icon('moreHorizontal', 15)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <div class="files-table-wrap">
        <table class="files-table">
          <thead>
            <tr>
              <th class="col-check">
                <label class="checkbox">
                  <input type="checkbox" id="selectAll" ${allSelected ? 'checked' : ''}>
                  <span class="box">${icon('check', 11)}</span>
                </label>
              </th>
              <th class="sortable ${state.sort.key === 'name' ? 'is-sorted ' + state.sort.dir : ''}" data-sort="name">
                Name <span class="sort-ind">${icon('chevronDown', 12)}</span>
              </th>
              <th class="sortable ${state.sort.key === 'size' ? 'is-sorted ' + state.sort.dir : ''} col-size" data-sort="size">
                Size <span class="sort-ind">${icon('chevronDown', 12)}</span>
              </th>
              <th class="col-type">Type</th>
              <th class="sortable ${state.sort.key === 'downloads' ? 'is-sorted ' + state.sort.dir : ''} col-downloads" data-sort="downloads">
                Downloads <span class="sort-ind">${icon('chevronDown', 12)}</span>
              </th>
              <th class="sortable ${state.sort.key === 'modified' ? 'is-sorted ' + state.sort.dir : ''} col-modified" data-sort="modified">
                Modified <span class="sort-ind">${icon('chevronDown', 12)}</span>
              </th>
              <th class="col-status">Status</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${renderFooter()}
      </div>
    `;

    const selectAll = $('#selectAll');
    if (selectAll) selectAll.indeterminate = anySelected && !allSelected;

    bindRowInteractions();
    updateBulkBar();
  }

  /* ══════════════════════════════════════════
     RENDER — GRID VIEW
     ══════════════════════════════════════════ */

  function renderGrid() {
    const wrap = $('#filesContainer');
    if (!wrap) return;

    if (state.isLoading) {
      wrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-tertiary);">Loading files...</div>`;
      return;
    }

    if (!state.files.length) {
      wrap.innerHTML = renderEmpty();
      updateBulkBar();
      return;
    }

    const cards = state.files.map((f, i) => {
      const t = resolveType(f.name, f.isFolder);
      const isSel = state.selected.has(f.id);
      const ext = t.ext ? t.ext.toUpperCase() : (f.isFolder ? 'FOLDER' : '');

      return `
        <div class="file-card ${isSel ? 'is-selected' : ''}" data-id="${f.id}" style="animation-delay:${i * 20}ms">
          <div class="file-card-check">
            <label class="checkbox">
              <input type="checkbox" data-check="${f.id}" ${isSel ? 'checked' : ''}>
              <span class="box">${icon('check', 11)}</span>
            </label>
          </div>
          <div class="file-card-menu">
            <button class="btn-icon btn-icon-sm" data-act="more" data-id="${f.id}">${icon('moreHorizontal', 15)}</button>
          </div>
          <div class="file-thumb">
            <div class="ftype-icon ${t.key}">${icon(t.icon, 22)}</div>
            ${ext ? `<div class="file-ext-tag">${ext}</div>` : ''}
          </div>
          <div class="file-card-info">
            <div class="file-card-name">${f.name}</div>
            <div class="file-card-meta">
              <span>${f.isFolder ? (f.itemsCount || 0) + ' items' : Format.bytes(f.size)}</span>
              <span class="sep"></span>
              <span>${Format.relative(f.modified)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    wrap.innerHTML = `<div class="grid-files">${cards}</div>${renderFooter()}`;
    bindRowInteractions();
    updateBulkBar();
  }

  /* ══════════════════════════════════════════
     FOOTER — Pagination
     ══════════════════════════════════════════ */

  function renderFooter() {
    const totalPages = Math.max(1, Math.ceil(state.totalFiles / state.perPage));
    const start = state.totalFiles === 0 ? 0 : (state.page - 1) * state.perPage + 1;
    const end = Math.min(state.page * state.perPage, state.totalFiles);
    const pageNumbers = buildPageNumbers(state.page, totalPages);

    return `
      <div class="table-footer">
        <div class="rows-select">
          Show
          <select id="perPageSelect">
            ${[10, 20, 50, 100].map(n => `<option value="${n}" ${state.perPage === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          rows
        </div>
        <div class="footer-info">
          Showing <strong>${start}–${end}</strong> of <strong>${Format.number(state.totalFiles)}</strong>
        </div>
        <div class="pagination">
          <button class="page-btn" data-page="prev" ${state.page === 1 ? 'disabled' : ''}>${icon('chevronLeft', 15)}</button>
          ${pageNumbers.map(p =>
      p === '…'
        ? `<span class="page-btn" style="cursor:default;pointer-events:none">…</span>`
        : `<button class="page-btn ${p === state.page ? 'is-active' : ''}" data-page="${p}">${p}</button>`
    ).join('')}
          <button class="page-btn" data-page="next" ${state.page === totalPages ? 'disabled' : ''}>${icon('chevronRight', 15)}</button>
        </div>
      </div>
    `;
  }

  function buildPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push('…');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push('…');
    pages.push(total);
    return pages;
  }

  function renderEmpty() {
    let msg = 'No files found in this directory.';
    if (state.search) msg = `No results found for "${window.AFM.escapeHtml(state.search)}".`;
    else if (state.filter !== 'all') msg = `No files matching the "${state.filter}" filter.`;

    return `
      <div class="empty-state">
        <div class="empty-icon">${icon('inbox', 26)}</div>
        <div class="empty-title">${msg}</div>
        <div class="empty-desc">Adjust your filters or upload new files to this location.</div>
        <div style="margin-top:12px;display:flex;gap:8px;">
          ${(state.search || state.filter !== 'all') ? `<button class="btn btn-ghost btn-sm" id="clearFilters">Clear filters</button>` : ''}
          <a class="btn btn-primary btn-sm" href="uploads.html">${icon('upload', 15)} Upload files</a>
        </div>
      </div>
    `;
  }

  function statusColor(status) {
    return { public: 'success', internal: 'accent', private: 'warning' }[status] || '';
  }

  /* ══════════════════════════════════════════
     BREADCRUMB & OS PATHING
     ══════════════════════════════════════════ */

  function updateBreadcrumb() {
    const bc = $('#breadcrumb');
    if (!bc) return;

    // Split OS path: e.g. "/media/videos" -> ["media", "videos"]
    const parts = state.currentPath.split('/').filter(Boolean);

    let html = `<span class="breadcrumb-item ${parts.length === 0 ? 'is-current' : ''}" data-nav-path="/">Files</span>`;

    let currentBuiltPath = '';
    parts.forEach((part, i) => {
      currentBuiltPath += `/${part}`;
      html += `
        <span class="breadcrumb-sep">${icon('chevronRight', 14)}</span>
        <span class="breadcrumb-item ${i === parts.length - 1 ? 'is-current' : ''}" data-nav-path="${currentBuiltPath}">${part}</span>
      `;
    });

    bc.innerHTML = html;

    // Bind breadcrumb navigation
    bc.querySelectorAll('[data-nav-path]').forEach(b => {
      b.addEventListener('click', () => {
        const targetPath = b.getAttribute('data-nav-path');
        if (targetPath === state.currentPath) return;

        state.currentPath = targetPath;
        state.page = 1;
        state.filter = 'all'; // Reset filter when navigating
        state.search = '';

        updateBreadcrumb();
        loadFiles();
      });
    });
  }

  /* ══════════════════════════════════════════
     BULK BAR
     ══════════════════════════════════════════ */

  function updateBulkBar() {
    const bar = $('#bulkBar');
    if (!bar) return;
    const count = state.selected.size;
    bar.classList.toggle('is-visible', count > 0);
    const num = bar.querySelector('.num');
    if (num) num.textContent = count;
  }

  function clearSelection() {
    state.selected.clear();
    renderView();
  }

  /* ══════════════════════════════════════════
     ROW / CARD INTERACTIONS
     ══════════════════════════════════════════ */

  function bindRowInteractions() {

    // 1. Checkboxes (Individual Selection - No Re-render)
    $$('input[data-check]').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = cb.getAttribute('data-check');
        const row = e.target.closest('tr, .file-card');

        if (cb.checked) {
          state.selected.add(id);
          row?.classList.add('is-selected');
        } else {
          state.selected.delete(id);
          row?.classList.remove('is-selected');
        }

        updateBulkBar();

        const selectAll = $('#selectAll');
        if (selectAll) {
          const allSelected = state.files.length > 0 && state.files.every(f => state.selected.has(f.id));
          const anySelected = state.files.some(f => state.selected.has(f.id));
          selectAll.checked = allSelected;
          selectAll.indeterminate = anySelected && !allSelected;
        }
      });
    });

    // 2. Select All Checkbox (No Re-render)
    $('#selectAll')?.addEventListener('change', e => {
      const isChecked = e.target.checked;

      $$('.files-table tbody tr, .file-card').forEach(row => {
        const id = row.getAttribute('data-id');
        const cb = row.querySelector('input[data-check]');

        if (isChecked) {
          state.selected.add(id);
          row.classList.add('is-selected');
          if (cb) cb.checked = true;
        } else {
          state.selected.delete(id);
          row.classList.remove('is-selected');
          if (cb) cb.checked = false;
        }
      });

      updateBulkBar();
    });

    // 3. Sort headers
    $$('.files-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort.key = key;
          state.sort.dir = 'asc';
        }
        loadFiles();
      });
    });

    // 4. Centralized Row / Card Click Logic (Navigate or Details)
    $$('.files-table tbody tr, .file-card').forEach(row => {
      row.addEventListener('click', e => {
        // Prevent action if user is interacting with controls
        if (e.target.closest('label.checkbox, .btn-icon, [data-act]')) return;

        const id = row.getAttribute('data-id');
        const file = state.files.find(f => f.id === id);
        if (!file) return;

        if (file.isFolder) {
          // Folder: Navigate into it
          state.currentPath = file.path;
          state.page = 1;
          state.filter = 'all'; // Reset filter when navigating
          state.search = '';

          const searchInput = $('#filesSearch');
          if (searchInput) searchInput.value = '';

          updateBreadcrumb();
          loadFiles();
        } else {
          // File: Open details drawer
          openDrawer(id);
        }
      });

      // Context menu
      row.addEventListener('contextmenu', e => {
        e.preventDefault();
        openContext(e.clientX, e.clientY, row.getAttribute('data-id'));
      });
    });

    // 5. Action buttons (Download, More, etc.)
    $$('[data-act]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        handleAction(btn.getAttribute('data-act'), btn.getAttribute('data-id'), e);
      });
    });

    // 6. Pagination (Safely scoped to .pagination to avoid selecting <body>)
    $$('.pagination [data-page]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const p = btn.getAttribute('data-page');
        const totalPages = Math.max(1, Math.ceil(state.totalFiles / state.perPage));

        let newPage = state.page;

        if (p === 'prev') {
          newPage = Math.max(1, state.page - 1);
        } else if (p === 'next') {
          newPage = Math.min(totalPages, state.page + 1);
        } else {
          const parsed = parseInt(p, 10);
          if (!isNaN(parsed)) newPage = parsed;
        }

        if (!isNaN(newPage) && newPage !== state.page) {
          state.page = newPage;
          loadFiles();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    });

    $('#perPageSelect')?.addEventListener('change', e => {
      state.perPage = parseInt(e.target.value, 10);
      state.page = 1;
      loadFiles();
    });

    $('#clearFilters')?.addEventListener('click', () => {
      state.filter = 'all';
      state.search = '';
      const searchInput = $('#filesSearch');
      if (searchInput) searchInput.value = '';
      state.page = 1;
      loadFiles();
    });
  }

  /* ══════════════════════════════════════════
     CONTEXT MENU & DRAWER
     ══════════════════════════════════════════ */

  function openContext(x, y, id) {
    const file = state.files.find(f => f.id === id);
    if (!file) return;

    const items = [];

    if (file.isFolder) {
      items.push(
        {
          label: 'Open folder',
          icon: 'folderOpen',
          action: () => {
            state.currentPath = file.path;
            state.page = 1;
            state.filter = 'all';
            updateBreadcrumb();
            loadFiles();
          }
        },
        {
          label: 'Folder details',
          icon: 'info',
          action: () => openDrawer(id)
        }
      );
    } else {
      items.push(
        { label: 'View details', icon: 'eye', action: () => openDrawer(id) },
        { label: 'Download', icon: 'download', shortcut: 'D', action: () => handleAction('download', id) }
      );
    }

    items.push(
      { label: 'Copy path', icon: 'copy', shortcut: '⌘C', action: () => copyToClipboard(file.path, 'OS path copied') },
      { divider: true },
      { label: 'Rename', icon: 'edit', shortcut: 'F2', action: () => handleAction('rename', id) },
      { label: 'Delete', icon: 'trash', danger: true, action: () => handleAction('delete', id) }
    );

    ContextMenu.show(x, y, items);
  }

  function openDrawer(id) {
    const file = state.files.find(f => f.id === id);
    if (!file) return;

    const drawer = $('#fileDrawer');
    if (!drawer) return;

    const t = resolveType(file.name, file.isFolder);

    drawer.querySelector('.drawer-body').innerHTML = `
      <div class="drawer-preview">
        <div class="ftype-icon ${t.key}">${icon(t.icon, 26)}</div>
      </div>
      <div>
        <div class="drawer-filename">${file.name}</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
          <span class="badge">${file.isFolder ? 'Folder' : t.label}</span>
          ${file.status ? `<span class="badge badge-${statusColor(file.status)}">${file.status}</span>` : ''}
        </div>
      </div>
      <div class="meta-list">
        <div class="meta-row">
          <span class="meta-key">${file.isFolder ? 'Contents' : 'Size'}</span>
          <span class="meta-val">${file.isFolder ? (file.itemsCount !== undefined ? file.itemsCount + ' items' : 'Directory') : Format.bytes(file.size)}</span>
        </div>
        <div class="meta-row"><span class="meta-key">Type</span><span class="meta-val">${file.isFolder ? 'Directory' : t.label + (t.ext ? ' · .' + t.ext : '')}</span></div>
        ${!file.isFolder && file.downloads != null ? `<div class="meta-row"><span class="meta-key">Downloads</span><span class="meta-val">${Format.number(file.downloads)}</span></div>` : ''}
        <div class="meta-row"><span class="meta-key">Modified</span><span class="meta-val">${Format.dateTime(file.modified)}</span></div>
        <div class="meta-row"><span class="meta-key">Location</span><span class="meta-val" style="direction:ltr;word-break:break-all;">${file.path}</span></div>
      </div>
    `;

    drawer.classList.add('is-open');
  }

  function closeDrawer() {
    $('#fileDrawer')?.classList.remove('is-open');
  }

  /* ══════════════════════════════════════════
     ACTIONS (Mutations connected to API)
     ══════════════════════════════════════════ */

  async function handleAction(act, id, event) {
    const file = state.files.find(f => f.id === id);

    if (!file && act !== 'newFolder' && act !== 'bulkDelete') return;

    switch (act) {
      case 'download':
        window.open(`${window.API.BASE_URL}/fs/download?path=${encodeURIComponent(file.path)}`, '_blank');
        Toast.success('Download started', file.name);
        break;

      case 'more': {
        const rect = event.target.getBoundingClientRect();
        openContext(rect.left, rect.bottom + 4, id);
        break;
      }

      case 'newFolder': {
        const name = await Modal.prompt({
          title: 'Create new folder',
          label: 'Folder name',
          placeholder: 'e.g. New Project',
          confirmText: 'Create',
        });

        if (name && name.trim()) {
          const folderName = name.trim();
          const newPath = state.currentPath === '/'
            ? `/${folderName}`
            : `${state.currentPath}/${folderName}`;

          try {
            await window.API.post('/fs/folder', { path: newPath });
            Toast.success('Folder created', folderName);
            loadFiles();
            loadTree();
          } catch (e) {
          }
        }
        break;
      }

      case 'rename': {
        const newName = await Modal.prompt({
          title: 'Rename item',
          label: 'New name',
          value: file.name,
          confirmText: 'Rename',
        });

        if (newName && newName.trim() && newName !== file.name) {
          try {
            await window.API.put('/fs/rename', {
              oldPath: file.path,
              newName: newName.trim()
            });
            Toast.success('Item renamed', newName);
            loadFiles();
            if (file.isFolder) loadTree();
          } catch (e) { }
        }
        break;
      }

      case 'delete': {
        const ok = await Modal.confirm({
          title: `Delete "${file.name}"?`,
          message: 'This item will be permanently removed from the server disk.',
          confirmText: 'Delete permanently',
          danger: true,
        });

        if (ok) {
          try {
            await window.API.del(`/fs/delete`, { paths: [file.path] });
            Toast.success('Item deleted', file.name);
            loadFiles();
            if (file.isFolder) loadTree();
          } catch (e) { }
        }
        break;
      }

      case 'bulkDelete': {
        const count = state.selected.size;
        if (count === 0) return;

        const ok = await Modal.confirm({
          title: `Delete ${count} items?`,
          message: 'Selected items will be permanently removed from the server disk.',
          confirmText: 'Delete all',
          danger: true,
        });

        if (ok) {
          const pathsToDelete = state.files
            .filter(f => state.selected.has(f.id))
            .map(f => f.path);

          try {
            await window.API.del(`/fs/delete`, { paths: pathsToDelete });
            Toast.success(`${count} items deleted`);
            state.selected.clear();
            loadFiles();
            loadTree();
          } catch (e) { }
        }
        break;
      }
    }
  }

  /* ══════════════════════════════════════════
     RENDER SWITCH & BINDINGS
     ══════════════════════════════════════════ */

  function renderView() {
    if (state.view === 'grid') renderGrid();
    else renderList();
  }

  function bindToolbar() {
    // View toggle
    $$('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.view = btn.getAttribute('data-view');
        Store.set('files-view', state.view);
        $$('[data-view]').forEach(b => b.classList.toggle('is-active', b === btn));
        renderView();
      });
    });

    // Server-side Search (Debounced)
    const search = $('#filesSearch');
    if (search) {
      search.addEventListener('input', window.AFM.debounce(e => {
        state.search = e.target.value;
        state.page = 1;
        loadFiles();
      }, 350));
    }

    // Filter chips trigger API reload
    document.addEventListener('click', e => {
      const chip = e.target.closest('[data-filter]');
      if (!chip) return;

      state.filter = chip.getAttribute('data-filter');
      state.page = 1;

      $$('[data-filter]').forEach(c => c.classList.toggle('is-active', c === chip));
      loadFiles();
    });

    $('#drawerClose')?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

    // Toolbar Actions
    $('[data-quick="newFolder"]')?.addEventListener('click', () => {
      handleAction('newFolder');
    });

    // Bulk Actions
    $('#bulkClear')?.addEventListener('click', clearSelection);

    $('#bulkDownload')?.addEventListener('click', () => {
      Toast.info('Bulk download will be handled by ZIP streaming on backend');
    });

    $('#bulkDelete')?.addEventListener('click', () => {
      handleAction('bulkDelete');
    });
  }

  function initDragDrop() {
    const overlay = $('#dropOverlay');
    if (!overlay) return;
    let dragCount = 0;

    window.addEventListener('dragenter', e => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragCount++;
      overlay.classList.add('is-active');
    });
    window.addEventListener('dragleave', () => {
      dragCount--;
      if (dragCount <= 0) { dragCount = 0; overlay.classList.remove('is-active'); }
    });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
      e.preventDefault();
      dragCount = 0;
      overlay.classList.remove('is-active');
      const count = e.dataTransfer?.files?.length || 0;
      if (count) {
        Toast.info('Drop functionality', 'Ready to connect to Upload engine');
      }
    });
  }

  /* ══════════════════════════════════════════
     INIT
     ══════════════════════════════════════════ */

  function init() {
    $$('[data-view]').forEach(b => b.classList.toggle('is-active', b.getAttribute('data-view') === state.view));

    bindToolbar();
    initDragDrop();
    updateBreadcrumb();

    // Fetch data from API
    loadTree();
    loadFiles();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'files') {
    Files.init();
  }
});

window.Files = Files;