/* ============================================
   FILES.JS — File Browser Page Logic
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Files = (() => {

  const { $, $$, el, icon, Format, Toast, Modal, ContextMenu, copyToClipboard, resolveType, Store } = window.AFM;

  /* ══════════════════════════════════════════
     MOCK DATA
     ══════════════════════════════════════════ */

  const folderTree = [
    { id: 'root', name: 'All Files', icon: 'hardDrive', count: 24837, children: [
      { id: 'releases', name: 'Releases', count: 1240, children: [
        { id: 'mac',     name: 'macOS',   count: 340 },
        { id: 'win',     name: 'Windows', count: 512 },
        { id: 'linux',   name: 'Linux',   count: 388 },
      ]},
      { id: 'media', name: 'Media', count: 8912, children: [
        { id: 'videos',  name: 'Videos', count: 3402 },
        { id: 'images',  name: 'Images', count: 5510 },
      ]},
      { id: 'docs',     name: 'Documents', count: 4302 },
      { id: 'design',   name: 'Design',    count: 2144 },
      { id: 'reports',  name: 'Reports',   count: 981 },
      { id: 'archive',  name: 'Archive',   count: 7258 },
    ]},
    { id: 'shared',  name: 'Shared with me', icon: 'users',    count: 428 },
    { id: 'starred', name: 'Starred',        icon: 'star',     count: 34  },
    { id: 'recent',  name: 'Recent',         icon: 'clock',    count: 128 },
    { id: 'trash',   name: 'Trash',          icon: 'trash',    count: 217 },
  ];

  const fileNames = [
    'launch-video-final-v3.mp4',
    'brand-guidelines-2025.pdf',
    'installer-v4.2.dmg',
    'annual-report.pdf',
    'ui-mockup-dashboard.png',
    'product-shots-batch-04.zip',
    'onboarding-flow.fig',
    'api-reference-v2.zip',
    'quarterly-review.docx',
    'team-photo-2024.jpg',
    'demo-recording.mov',
    'roadmap-q1-q2.xlsx',
    'logo-primary-dark.svg',
    'user-research-notes.pdf',
    'marketing-assets.zip',
    'podcast-episode-14.mp3',
    'infrastructure-diagram.png',
    'config.yaml',
    'deploy-script.sh',
    'legal-agreement.pdf',
    'launch-checklist.md',
    'design-system.sketch',
    'analytics-export.csv',
    'server-logs-dec.gz',
    'welcome-banner.webp',
    'source-code-snapshot.tar',
    'meeting-recap.docx',
    'feature-spec.pdf',
  ];

  const authors = ['Sarah Chen', 'Marcus Weber', 'Priya Ramesh', 'Alex Torres', 'Yuki Tanaka', 'Elena Petrov', 'James Okonkwo', 'Mira Patel'];
  const statuses = ['public', 'internal', 'private'];

  function makeFiles() {
    const items = [];
    // Add a few folders first
    ['Marketing Assets', 'Product Design', 'Legal Documents', 'Beta Releases'].forEach((name, i) => {
      items.push({
        id: `fld_${i}`,
        name,
        isFolder: true,
        size: null,
        items: 40 + Math.floor(Math.random() * 300),
        downloads: null,
        modified: Date.now() - Math.random() * 14 * 86400 * 1000,
        author: authors[Math.floor(Math.random() * authors.length)],
        status: 'internal',
        starred: false,
        path: '/root',
      });
    });

    fileNames.forEach((name, i) => {
      items.push({
        id: `f_${i}`,
        name,
        isFolder: false,
        size: Math.round(Math.random() * 500 * 1024 * 1024) + 30000,
        downloads: Math.floor(Math.random() * 3500),
        modified: Date.now() - Math.random() * 30 * 86400 * 1000,
        author: authors[Math.floor(Math.random() * authors.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        starred: Math.random() < 0.15,
        path: '/root/media',
      });
    });
    return items;
  }

  /* ══════════════════════════════════════════
     STATE
     ══════════════════════════════════════════ */

  const state = {
    all: [],
    filtered: [],
    view: Store.get('files-view', 'list'),   // 'list' | 'grid'
    sort: { key: 'modified', dir: 'desc' },
    filter: 'all',                            // 'all'|'folder'|'image'|'video'|'audio'|'document'|'archive'|'code'
    search: '',
    selected: new Set(),
    page: 1,
    perPage: 20,
    currentFolder: 'root',
  };

  /* ══════════════════════════════════════════
     RENDER — FOLDER TREE
     ══════════════════════════════════════════ */

  function renderTree() {
    const wrap = $('#folderTree');
    if (!wrap) return;

    function walk(nodes, depth = 0) {
      return nodes.map(n => {
        const hasChildren = Array.isArray(n.children) && n.children.length > 0;
        const isOpen = depth === 0 || n.id === 'root' || n.id === 'media';
        const isActive = n.id === state.currentFolder;

        return `
          <div class="tree-node ${isOpen ? 'is-open' : ''}" data-id="${n.id}">
            <div class="tree-item ${isActive ? 'is-active' : ''}" data-tree-id="${n.id}">
              <span class="tree-caret ${hasChildren ? '' : 'is-empty'}">
                ${hasChildren ? icon('chevronRight', 11) : ''}
              </span>
              <span class="tree-ico">${icon(n.icon || 'folder', 14)}</span>
              <span class="tree-name">${n.name}</span>
              ${n.count != null ? `<span class="tree-count">${Format.compact(n.count)}</span>` : ''}
            </div>
            ${hasChildren ? `<div class="tree-children">${walk(n.children, depth + 1)}</div>` : ''}
          </div>
        `;
      }).join('');
    }

    wrap.innerHTML = walk(folderTree);

    // Bind clicks
    wrap.querySelectorAll('.tree-caret').forEach(c => {
      c.addEventListener('click', e => {
        e.stopPropagation();
        c.closest('.tree-node').classList.toggle('is-open');
      });
    });

    wrap.querySelectorAll('.tree-item').forEach(item => {
      item.addEventListener('click', () => {
        state.currentFolder = item.getAttribute('data-tree-id');
        wrap.querySelectorAll('.tree-item').forEach(i => i.classList.remove('is-active'));
        item.classList.add('is-active');
        updateBreadcrumb();
      });
    });
  }

  /* ══════════════════════════════════════════
     RENDER — FILTER CHIPS
     ══════════════════════════════════════════ */

  function renderFilterChips() {
    const wrap = $('#filterChips');
    if (!wrap) return;

    const counts = {
      all: state.all.length,
      folder: state.all.filter(f => f.isFolder).length,
      image: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'image').length,
      video: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'video').length,
      document: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'document').length,
      audio: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'audio').length,
      archive: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'archive').length,
      code: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'code').length,
    };

    const chips = [
      { key: 'all',      label: 'All',       icon: 'layers' },
      { key: 'folder',   label: 'Folders',   icon: 'folder' },
      { key: 'image',    label: 'Images',    icon: 'image' },
      { key: 'video',    label: 'Videos',    icon: 'video' },
      { key: 'document', label: 'Documents', icon: 'fileText' },
      { key: 'audio',    label: 'Audio',     icon: 'music' },
      { key: 'archive',  label: 'Archives',  icon: 'archive' },
      { key: 'code',     label: 'Code',      icon: 'code' },
    ];

    wrap.innerHTML = chips.map(c => `
      <button class="filter-chip ${state.filter === c.key ? 'is-active' : ''}" data-filter="${c.key}">
        ${icon(c.icon, 13)}
        ${c.label}
        <span class="count">${Format.compact(counts[c.key] || 0)}</span>
      </button>
    `).join('');
  }

  /* ══════════════════════════════════════════
     APPLY FILTERS / SORT
     ══════════════════════════════════════════ */

  function applyFilters() {
    let items = state.all.slice();

    // Type filter
    if (state.filter === 'folder') {
      items = items.filter(f => f.isFolder);
    } else if (state.filter !== 'all') {
      items = items.filter(f => !f.isFolder && resolveType(f.name).key === state.filter);
    }

    // Search
    if (state.search.trim()) {
      const q = state.search.toLowerCase();
      items = items.filter(f => f.name.toLowerCase().includes(q));
    }

    // Sort — folders always first
    items.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      let av = a[state.sort.key], bv = b[state.sort.key];
      if (av == null) av = 0;
      if (bv == null) bv = 0;
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return state.sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return state.sort.dir === 'asc' ?  1 : -1;
      return 0;
    });

    state.filtered = items;
    state.page = Math.min(state.page, Math.max(1, Math.ceil(items.length / state.perPage)));
  }

  /* ══════════════════════════════════════════
     RENDER — LIST VIEW (table)
     ══════════════════════════════════════════ */

  function renderList() {
    const wrap = $('#filesContainer');
    if (!wrap) return;

    const start = (state.page - 1) * state.perPage;
    const pageItems = state.filtered.slice(start, start + state.perPage);
    const allSelected = pageItems.length && pageItems.every(f => state.selected.has(f.id));
    const anySelected = pageItems.some(f => state.selected.has(f.id));

    if (!pageItems.length) {
      wrap.innerHTML = renderEmpty();
      updateBulkBar();
      return;
    }

    const rows = pageItems.map(f => {
      const t = resolveType(f.name, f.isFolder);
      const isSel = state.selected.has(f.id);
      const statusBadge = f.isFolder
        ? `<span class="badge">${f.items} items</span>`
        : `<span class="badge badge-${statusColor(f.status)}">${f.status}</span>`;

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
              <button class="btn-icon btn-icon-sm" data-tip="Download" data-act="download" data-id="${f.id}">${icon('download', 15)}</button>
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
    if (selectAll) {
      selectAll.indeterminate = anySelected && !allSelected;
    }

    bindRowInteractions();
    updateBulkBar();
  }

  /* ══════════════════════════════════════════
     RENDER — GRID VIEW
     ══════════════════════════════════════════ */

  function renderGrid() {
    const wrap = $('#filesContainer');
    if (!wrap) return;

    const start = (state.page - 1) * state.perPage;
    const pageItems = state.filtered.slice(start, start + state.perPage);

    if (!pageItems.length) {
      wrap.innerHTML = renderEmpty();
      updateBulkBar();
      return;
    }

    const cards = pageItems.map((f, i) => {
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
              <span>${f.isFolder ? f.items + ' items' : Format.bytes(f.size)}</span>
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
    const total = state.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / state.perPage));
    const start = total === 0 ? 0 : (state.page - 1) * state.perPage + 1;
    const end = Math.min(state.page * state.perPage, total);

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
          Showing <strong>${start}–${end}</strong> of <strong>${Format.number(total)}</strong>
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
    return `
      <div class="empty-state">
        <div class="empty-icon">${icon('inbox', 26)}</div>
        <div class="empty-title">No files match your filters</div>
        <div class="empty-desc">Try clearing filters or uploading new files to get started.</div>
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="clearFilters">Clear filters</button>
          <a class="btn btn-primary btn-sm" href="uploads.html">${icon('upload', 15)} Upload files</a>
        </div>
      </div>
    `;
  }

  function statusColor(status) {
    return { public: 'success', internal: 'accent', private: 'warning' }[status] || '';
  }

  /* ══════════════════════════════════════════
     BREADCRUMB
     ══════════════════════════════════════════ */

  function updateBreadcrumb() {
    const bc = $('#breadcrumb');
    if (!bc) return;
    const active = findNode(folderTree, state.currentFolder);
    if (!active) return;

    // Simple path builder
    const path = pathTo(folderTree, state.currentFolder) || [];
    bc.innerHTML = path.map((n, i) => `
      <span class="breadcrumb-sep">${icon('chevronRight', 14)}</span>
      <span class="breadcrumb-item ${i === path.length - 1 ? 'is-current' : ''}" data-nav-id="${n.id}">${n.name}</span>
    `).join('');
    // Add home first
    bc.insertAdjacentHTML('afterbegin', `<span class="breadcrumb-item" data-nav-id="root">Files</span>`);
  }

  function findNode(list, id) {
    for (const n of list) {
      if (n.id === id) return n;
      if (n.children) {
        const found = findNode(n.children, id);
        if (found) return found;
      }
    }
  }

  function pathTo(list, id, trail = []) {
    for (const n of list) {
      const next = [...trail, n];
      if (n.id === id) return next;
      if (n.children) {
        const p = pathTo(n.children, id, next);
        if (p) return p;
      }
    }
    return null;
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
    // Checkbox individual
    $$('input[data-check]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-check');
        if (cb.checked) state.selected.add(id); else state.selected.delete(id);
        renderView();
      });
    });

    // Select all
    $('#selectAll')?.addEventListener('change', e => {
      const start = (state.page - 1) * state.perPage;
      const pageItems = state.filtered.slice(start, start + state.perPage);
      if (e.target.checked) pageItems.forEach(f => state.selected.add(f.id));
      else pageItems.forEach(f => state.selected.delete(f.id));
      renderView();
    });

    // Sort headers
    $$('.files-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort.key = key;
          state.sort.dir = 'asc';
        }
        applyFilters();
        renderView();
      });
    });

    // Row click → open drawer
    $$('.files-table tbody tr, .file-card').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('input, .btn-icon, .checkbox, [data-act]')) return;
        openDrawer(row.getAttribute('data-id'));
      });

      // Right-click context menu
      row.addEventListener('contextmenu', e => {
        e.preventDefault();
        openContext(e.clientX, e.clientY, row.getAttribute('data-id'));
      });
    });

    // Row action buttons
    $$('[data-act]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        handleAction(act, id, e);
      });
    });

    // Pagination
    $$('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-page');
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
        if (p === 'prev') state.page = Math.max(1, state.page - 1);
        else if (p === 'next') state.page = Math.min(totalPages, state.page + 1);
        else state.page = parseInt(p, 10);
        renderView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // Per page
    $('#perPageSelect')?.addEventListener('change', e => {
      state.perPage = parseInt(e.target.value, 10);
      state.page = 1;
      renderView();
    });

    // Empty state clear
    $('#clearFilters')?.addEventListener('click', () => {
      state.filter = 'all';
      state.search = '';
      const searchInput = $('#filesSearch');
      if (searchInput) searchInput.value = '';
      renderFilterChips();
      applyFilters();
      renderView();
    });

    // Breadcrumb clicks
    $$('#breadcrumb [data-nav-id]').forEach(b => {
      b.addEventListener('click', () => {
        state.currentFolder = b.getAttribute('data-nav-id');
        updateBreadcrumb();
      });
    });
  }

  /* ══════════════════════════════════════════
     ACTIONS
     ══════════════════════════════════════════ */

  async function handleAction(act, id, event) {
    const file = state.all.find(f => f.id === id);
    if (!file) return;

    switch (act) {
      case 'download':
        Toast.success('Download started', file.name);
        break;

      case 'more': {
        const rect = event.target.getBoundingClientRect();
        openContext(rect.left, rect.bottom + 4, id);
        break;
      }

      case 'share': {
        const link = 'https://dl.dimension.io/f/' + Math.random().toString(36).slice(2, 10);
        await copyToClipboard(link, 'Share link copied');
        break;
      }

      case 'rename': {
        const newName = await Modal.prompt({
          title: 'Rename file',
          label: 'New name',
          value: file.name,
          confirmText: 'Rename',
        });
        if (newName && newName !== file.name) {
          file.name = newName;
          Toast.success('Renamed', newName);
          applyFilters();
          renderView();
        }
        break;
      }

      case 'delete': {
        const ok = await Modal.confirm({
          title: `Delete "${file.name}"?`,
          message: 'This will move the file to trash. You can restore it within 30 days.',
          confirmText: 'Move to trash',
          danger: true,
        });
        if (ok) {
          state.all = state.all.filter(f => f.id !== id);
          state.selected.delete(id);
          Toast.success('Moved to trash', file.name);
          renderFilterChips();
          applyFilters();
          renderView();
        }
        break;
      }

      case 'star':
        file.starred = !file.starred;
        Toast.info(file.starred ? 'Starred' : 'Unstarred', file.name);
        renderView();
        break;

      case 'copyLink': {
        const link = 'https://dl.dimension.io/f/' + file.id;
        await copyToClipboard(link, 'Link copied');
        break;
      }
    }
  }

  function openContext(x, y, id) {
    const file = state.all.find(f => f.id === id);
    if (!file) return;

    ContextMenu.show(x, y, [
      { label: 'Preview',      icon: 'eye',      action: () => openDrawer(id) },
      { label: 'Download',     icon: 'download', shortcut: 'D', action: () => handleAction('download', id) },
      { label: 'Copy link',    icon: 'link',     shortcut: '⌘C', action: () => handleAction('copyLink', id) },
      { label: 'Share',        icon: 'share',    action: () => handleAction('share', id) },
      { divider: true },
      { label: file.starred ? 'Unstar' : 'Star', icon: 'star', action: () => handleAction('star', id) },
      { label: 'Rename',       icon: 'edit',     shortcut: 'F2', action: () => handleAction('rename', id) },
      { label: 'Move to…',     icon: 'move',     action: () => Toast.info('Move dialog', 'Coming soon') },
      { divider: true },
      { label: 'Move to trash', icon: 'trash',   danger: true, action: () => handleAction('delete', id) },
    ]);
  }

  /* ══════════════════════════════════════════
     DRAWER (file details)
     ══════════════════════════════════════════ */

  function openDrawer(id) {
    const file = state.all.find(f => f.id === id);
    if (!file) return;
    const drawer = $('#fileDrawer');
    if (!drawer) return;

    const t = resolveType(file.name, file.isFolder);
    const shareLink = `https://dl.dimension.io/f/${file.id}`;

    drawer.querySelector('.drawer-body').innerHTML = `
      <div class="drawer-preview">
        <div class="ftype-icon ${t.key}">${icon(t.icon, 26)}</div>
      </div>
      <div>
        <div class="drawer-filename">${file.name}</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
          <span class="badge">${t.label}</span>
          ${file.isFolder ? '' : `<span class="badge badge-${statusColor(file.status)}">${file.status}</span>`}
          ${file.starred ? '<span class="badge badge-warning">★ Starred</span>' : ''}
        </div>
      </div>

      <div class="meta-list">
        <div class="meta-row"><span class="meta-key">Size</span><span class="meta-val">${file.isFolder ? file.items + ' items' : Format.bytes(file.size)}</span></div>
        <div class="meta-row"><span class="meta-key">Type</span><span class="meta-val">${t.label}${t.ext ? ' · .' + t.ext : ''}</span></div>
        ${file.downloads != null ? `<div class="meta-row"><span class="meta-key">Downloads</span><span class="meta-val">${Format.number(file.downloads)}</span></div>` : ''}
        <div class="meta-row"><span class="meta-key">Modified</span><span class="meta-val">${Format.dateTime(file.modified)}</span></div>
        <div class="meta-row"><span class="meta-key">Author</span><span class="meta-val">${file.author}</span></div>
        <div class="meta-row"><span class="meta-key">Location</span><span class="meta-val">${file.path}</span></div>
        <div class="meta-row"><span class="meta-key">ID</span><span class="meta-val" style="font-family:'SF Mono',monospace;font-size:11px">${file.id}</span></div>
      </div>

      <div>
        <div class="field-label" style="margin-bottom:8px">Shareable link</div>
        <div class="link-box">
          <div class="link-text">${shareLink}</div>
          <button class="btn-icon btn-icon-sm" data-copy="${shareLink}" data-tip="Copy">${icon('copy', 15)}</button>
        </div>
      </div>
    `;

    drawer.querySelector('.drawer-title').textContent = 'File details';
    drawer.classList.add('is-open');
    drawer.setAttribute('data-current-id', id);
  }

  function closeDrawer() {
    $('#fileDrawer')?.classList.remove('is-open');
  }

  /* ══════════════════════════════════════════
     DRAG & DROP
     ══════════════════════════════════════════ */

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
      if (count) Toast.success(`${count} file${count > 1 ? 's' : ''} ready to upload`, 'Redirecting to uploads…');
    });
  }

  /* ══════════════════════════════════════════
     RENDER SWITCH
     ══════════════════════════════════════════ */

  function renderView() {
    if (state.view === 'grid') renderGrid();
    else renderList();
  }

  /* ══════════════════════════════════════════
     BIND TOOLBAR
     ══════════════════════════════════════════ */

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

    // Search
    const search = $('#filesSearch');
    if (search) {
      search.addEventListener('input', window.AFM.debounce(e => {
        state.search = e.target.value;
        state.page = 1;
        applyFilters();
        renderView();
      }, 180));
    }

    // Filter chips
    document.addEventListener('click', e => {
      const chip = e.target.closest('[data-filter]');
      if (!chip) return;
      state.filter = chip.getAttribute('data-filter');
      state.page = 1;
      $$('[data-filter]').forEach(c => c.classList.toggle('is-active', c === chip));
      applyFilters();
      renderView();
    });

    // Drawer close
    $('#drawerClose')?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

    // Bulk bar actions
    $('#bulkClear')?.addEventListener('click', clearSelection);
    $('#bulkDownload')?.addEventListener('click', () => {
      Toast.success(`Downloading ${state.selected.size} files`, 'Preparing zip archive…');
    });
    $('#bulkDelete')?.addEventListener('click', async () => {
      const ok = await Modal.confirm({
        title: `Delete ${state.selected.size} items?`,
        message: 'These files will be moved to trash.',
        confirmText: 'Move to trash',
        danger: true,
      });
      if (ok) {
        state.all = state.all.filter(f => !state.selected.has(f.id));
        state.selected.clear();
        Toast.success('Files deleted');
        renderFilterChips();
        applyFilters();
        renderView();
      }
    });
  }

  /* ══════════════════════════════════════════
     INIT
     ══════════════════════════════════════════ */

  function init() {
    state.all = makeFiles();

    // Set initial view button state
    $$('[data-view]').forEach(b => b.classList.toggle('is-active', b.getAttribute('data-view') === state.view));

    renderTree();
    renderFilterChips();
    applyFilters();
    renderView();
    updateBreadcrumb();
    bindToolbar();
    initDragDrop();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'files') {
    Files.init();
  }
});

window.Files = Files;