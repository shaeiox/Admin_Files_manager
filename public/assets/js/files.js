/* ============================================
   FILES.JS — File Browser
   Admin Files Manager — Dimension Style

   Structure
   - PURE HELPERS and RENDERERS: state in, string out. Every value that comes
     from the filesystem or the metadata store goes through `esc()` before it
     reaches markup — the storage root is operator-controlled and may be
     populated out of band, so upload-time name validation is not enough.
   - CONTROLLER: one delegated listener per stable container, bound once in
     init(). Re-rendering never re-binds, so no control can collect a second
     handler.
   - NAVIGATION has a single owner, navigateTo(). The tree highlight, the
     breadcrumb, the search box and the pending search are all derived from
     it, whichever entry point triggered it.

   Focus model (files-accessibility; recorded in docs/REPO_MAP.md)
   The list and the grid are each a WAI-ARIA grid with a ROVING TABINDEX:
   exactly one entry is a tab stop (the last one focused, else the first).
   Arrow keys / Home / End move between entries; Enter opens; Space selects;
   F2 renames; Delete deletes; Shift+F10 / ContextMenu opens the menu. The
   checkbox and action buttons of the active entry are tab stops too; those of
   every other entry are not, so a page costs at most four tab stops instead
   of three per row.
   ============================================ */

'use strict';

const Files = (() => {

  const AFM = window.AFM;
  const { $, el, icon, Format, Toast, Modal, ContextMenu, Dropdown, copyToClipboard, Store, FileTypes } = AFM;
  const esc = AFM.escapeHtml;

  /* ══════════════════════════════════════════
     CONSTANTS
     ══════════════════════════════════════════ */

  /**
   * Folder levels below the root that GET /api/fs/tree returns
   * (fs.controller.js getTree: scanFolders stops at depth > 2). Deeper folders
   * are reachable through the breadcrumb, never through the tree, and the tree
   * says so when the current folder is not in it.
   */
  const TREE_DEPTH = 2;

  const PAGE_SIZES = [10, 20, 50, 100];
  const SEARCH_DEBOUNCE_MS = 350;
  /** Grid cards fade in with a stagger; capped so a 100-card page has no long cascade. */
  const STAGGER_STEPS = 8;
  /** Rows shown by the loading skeleton when nothing has loaded yet. */
  const SKELETON_ROWS = 8;
  /** Names listed by name in a delete confirmation before "and N more". */
  const CONFIRM_NAME_LIMIT = 5;

  const SORT_LABELS = { name: 'Name', size: 'Size', modified: 'Date modified', downloads: 'Downloads' };
  /** The direction a column starts in when first chosen. */
  const SORT_DEFAULT_DIR = { name: 'asc', size: 'desc', modified: 'desc', downloads: 'desc' };
  const DEFAULT_SORT = { key: 'name', dir: 'asc' };

  /*
   * List-view columns. The table uses a fixed layout, so a long name never
   * reflows its neighbours: every cell truncates within its own column, and the
   * operator resizes columns like a spreadsheet (drag the header edge, or focus
   * it and use the arrow keys). `width: null` on Name means "fill what is left"
   * until the operator gives it a width. Widths persist per browser.
   */
  const COLUMNS = [
    { key: 'check', width: 44, fixed: true },
    { key: 'name', width: null, min: 140, label: 'Name' },
    { key: 'size', width: 110, min: 60, label: 'Size' },
    { key: 'type', width: 150, min: 60, label: 'Type' },
    { key: 'downloads', width: 128, min: 60, label: 'Downloads' },
    { key: 'modified', width: 150, min: 80, label: 'Modified' },
    { key: 'actions', width: 96, fixed: true },
  ];
  const COLUMN_MAX = 1200;
  const NAME_FILL_MIN = 176;   // the least an unsized Name column may shrink to (fits 1440px without sideways scroll)
  const COLUMN_STEP = 16;      // arrow key; Shift multiplies by 4
  const COLUMN_STORE_KEY = 'files-col-widths';
  // Mirrors the media queries in files.css that hide columns; the table's
  // minimum width must not count a column the stylesheet has hidden.
  const COLUMN_BREAKPOINTS = [
    { max: 1024, hide: ['type', 'downloads'] },
    { max: 860, hide: ['type', 'downloads', 'modified'] },
    { max: 767, hide: ['type', 'downloads', 'modified', 'size'] },
  ];

  /** Drag-resize range for the folder tree panel (arrow keys use the same step/shift as columns). */
  const TREE_WIDTH_MIN = 180;
  const TREE_WIDTH_MAX = 480;
  const TREE_WIDTH_DEFAULT = 240;
  const TREE_WIDTH_STEP = 16;
  const TREE_WIDTH_STORE_KEY = 'tree-panel-width';

  /** Filter chips, in display order. `other` is shown only when it has members. */
  const TYPE_CHIPS = [
    { key: 'all', label: 'All', icon: 'layers' },
    { key: 'folder', label: 'Folders', icon: 'folder' },
    { key: 'image', label: 'Images', icon: 'image' },
    { key: 'video', label: 'Videos', icon: 'video' },
    { key: 'document', label: 'Documents', icon: 'fileText' },
    { key: 'audio', label: 'Audio', icon: 'music' },
    { key: 'archive', label: 'Archives', icon: 'archive' },
    { key: 'code', label: 'Code', icon: 'code' },
    { key: 'other', label: 'Other', icon: 'file' },
  ];

  /**
   * Library views reached from the shared sidebar (files.html?view=...). Each is
   * a real listing parameter the server implements, so each view is distinct.
   * They apply to the folder being browsed: the listing reads one directory.
   */
  const LIBRARY_VIEWS = {
    starred: {
      title: 'Starred',
      subtitle: 'Starred files and folders in the folder you are browsing.',
      starredOnly: true,
      sort: { key: 'name', dir: 'asc' },
    },
    recent: {
      title: 'Recent',
      subtitle: 'Most recently modified first, in the folder you are browsing.',
      sort: { key: 'modified', dir: 'desc' },
    },
    downloads: {
      title: 'Top downloads',
      subtitle: 'Most downloaded first, in the folder you are browsing.',
      sort: { key: 'downloads', dir: 'desc' },
    },
  };

  /* ══════════════════════════════════════════
     PURE HELPERS
     ══════════════════════════════════════════ */

  function createState(overrides = {}) {
    return Object.assign({
      tree: [],
      treeLoaded: false,
      treeError: null,
      expanded: new Set(),      // tree nodes the operator has open; see initExpansion
      treeLoadingPaths: new Set(), // nodes with a loadTreeChildren() fetch in flight

      files: [],
      total: 0,
      counts: null,             // null = the server sent none; chips then show no figures
      loading: false,
      error: null,              // set only by a failed list load

      view: 'list',
      sort: { ...DEFAULT_SORT },
      filter: 'all',
      search: '',
      starredOnly: false,
      library: null,
      selected: new Set(),
      clipboardMode: null,       // null | 'cut' | 'copy' - what Paste will do
      clipboardPaths: new Set(), // paths pending the clipboard op (cut: grayed out; copy: not, like Explorer)
      clipboardItems: [],        // {name, path, isFolder} snapshot at cut/copy time, for reporting after navigating away
      inFlight: new Set(),    // payload keys ("kind|destination|paths") of operations now running - the double-paste guard
      activeId: null,           // the roving tab stop
      page: 1,
      perPage: 20,
      currentPath: '/',
      colWidths: {},            // operator-set list column widths (px), see COLUMNS
    }, overrides);
  }

  const columnDef = key => COLUMNS.find(c => c.key === key) || null;
  const isResizable = key => { const c = columnDef(key); return !!c && !c.fixed; };

  function clampColumnWidth(key, width) {
    const c = columnDef(key);
    const n = Math.round(Number(width));
    if (!c || !Number.isFinite(n)) return null;
    return Math.min(COLUMN_MAX, Math.max(c.min || 40, n));
  }

  /** Only finite widths for resizable columns survive; anything else is dropped. */
  function sanitizeColumnWidths(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const c of COLUMNS) {
      if (c.fixed || !Object.prototype.hasOwnProperty.call(raw, c.key)) continue;
      const w = clampColumnWidth(c.key, raw[c.key]);
      if (w !== null) out[c.key] = w;
    }
    return out;
  }

  /** The width in effect: the operator's, else the default (null = Name fills). */
  function columnWidth(widths, key) {
    if (widths && Object.prototype.hasOwnProperty.call(widths, key)) return widths[key];
    const c = columnDef(key);
    return c ? c.width : null;
  }

  /**
   * Stylesheet text for the current widths. Written into one <style> element
   * rather than inline styles. With Name unsized the table fills the panel and
   * never shrinks below its columns; once Name has a width the table is exactly
   * the sum of its columns (the panel scrolls sideways if it is wider).
   */
  function columnWidthsCss(widths) {
    const rules = COLUMNS.map(c => {
      const w = columnWidth(widths, c.key);
      return `.files-table col.col-${c.key} { width: ${w == null ? 'auto' : `${w}px`}; }`;
    });
    const nameWidth = columnWidth(widths, 'name');
    const tableRule = (hidden) => {
      const sum = COLUMNS
        .filter(c => !hidden.includes(c.key))
        .reduce((total, c) => total + (c.key === 'name' ? (nameWidth == null ? NAME_FILL_MIN : nameWidth) : columnWidth(widths, c.key)), 0);
      return nameWidth == null
        ? `.files-table { width: 100%; min-width: ${sum}px; }`
        : `.files-table { width: ${sum}px; min-width: 0; }`;
    };
    rules.push(tableRule([]));
    for (const bp of COLUMN_BREAKPOINTS) rules.push(`@media (max-width: ${bp.max}px) { ${tableRule(bp.hide)} }`);
    return rules.join('\n');
  }

  function joinPath(dir, name) {
    return dir === '/' ? `/${name}` : `${dir}/${name}`;
  }

  function parentPath(p) {
    if (!p || p === '/') return '/';
    const parts = p.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join('/')}` : '/';
  }

  function baseName(p) {
    return p.split('/').filter(Boolean).pop() || '';
  }

  /** True when `p` is `ancestor` or inside it — on a separator boundary, so /a is not inside /ab. */
  function isSameOrInside(p, ancestor) {
    if (ancestor === '/') return true;
    return p === ancestor || p.startsWith(`${ancestor}/`);
  }

  /** Every ancestor of a path, root first: '/a/b' -> ['/', '/a']. */
  function ancestorsOf(p) {
    const out = ['/'];
    const parts = p.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i++) out.push(`/${parts.slice(0, i).join('/')}`);
    return p === '/' ? [] : out;
  }

  /**
   * Where the displayed folder lives after a rename or delete.
   * @returns {string|null} the new path, or null when the displayed folder is unaffected.
   */
  function rewriteAfterMutation(current, action, oldPath, newPath) {
    if (!isSameOrInside(current, oldPath) || oldPath === '/') return null;
    if (action === 'rename' && newPath) return newPath + current.slice(oldPath.length);
    if (action === 'delete') return parentPath(oldPath);
    return null;
  }

  function extensionOf(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
  }

  /**
   * The type shown for an entry is the type the server filters it by
   * (`item.type`), so a badge can never disagree with the chip that filters it.
   */
  function typeOf(file) {
    if (file.isFolder) return { key: 'folder', icon: 'folder', label: 'Folder', ext: '' };
    const key = file.type || AFM.resolveType(file.name).key;
    const def = FileTypes[key];
    return {
      key,
      icon: def ? def.icon : 'file',
      label: def ? def.label : 'File',
      ext: extensionOf(file.name),
    };
  }

  /** One badge text for list, grid and drawer alike. */
  function typeLabel(file) {
    const t = typeOf(file);
    return t.ext ? `${t.label} · ${t.ext.toUpperCase()}` : t.label;
  }

  function pageCount(total, perPage) {
    return Math.max(1, Math.ceil(total / perPage));
  }

  function clampPage(page, total, perPage) {
    return Math.min(Math.max(1, page), pageCount(total, perPage));
  }

  /** Displayed range; start never exceeds end and an empty result is 0–0. */
  function footerRange(page, perPage, total) {
    if (!total) return { start: 0, end: 0 };
    const p = clampPage(page, total, perPage);
    return { start: (p - 1) * perPage + 1, end: Math.min(p * perPage, total) };
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

  /** Selection kept across a reload, minus anything that is no longer rendered. */
  function pruneSelection(selected, files) {
    const present = new Set(files.map(f => f.id));
    return new Set([...selected].filter(id => present.has(id)));
  }

  /** Why a successful listing is empty — each case offers a different next action. */
  function emptyKind(state) {
    if (state.search) return 'search';
    if (state.filter !== 'all') return 'filter';
    if (state.starredOnly) return 'starred';
    return 'empty';
  }

  function staggerIndex(i) {
    return Math.min(i, STAGGER_STEPS - 1);
  }

  /**
   * The single owner of navigation state. Returns false (and changes nothing)
   * when the target is the folder already displayed. Filter and search ALWAYS
   * reset here, never at the call site, so no entry point can diverge.
   */
  function applyNavigation(state, path) {
    if (typeof path !== 'string' || !path || path === state.currentPath) return false;
    state.currentPath = path;
    state.page = 1;
    state.filter = 'all';
    state.search = '';
    state.selected = new Set();
    state.activeId = null;
    return true;
  }

  /** Open the root on first render; expanding is otherwise the operator's call. */
  function initExpansion(state) {
    if (state.expanded.size === 0) state.expanded.add('/');
  }

  /**
   * A node is expandable if it has real children already, OR its children
   * were never read (childrenLoaded === false - the 2-level-per-request cap,
   * not a confirmed empty folder). The second case is what makes every
   * subdirectory depth reachable: expanding it fetches the next 2 levels
   * (loadTreeChildren), and after that it is judged by the same rule again.
   */
  function nodeIsExpandable(n) {
    return !!(n && ((Array.isArray(n.children) && n.children.length > 0) || n.childrenLoaded === false));
  }

  function treeContains(nodes, path) {
    for (const n of nodes || []) {
      if (n.path === path || treeContains(n.children, path)) return true;
    }
    return false;
  }

  /** Paths of the tree items currently visible, in display order. */
  function visibleTreePaths(nodes, expanded, out = []) {
    for (const n of nodes || []) {
      out.push(n.path);
      if (expanded.has(n.path)) visibleTreePaths(n.children, expanded, out);
    }
    return out;
  }

  function findTreeNode(nodes, path) {
    for (const n of nodes || []) {
      if (n.path === path) return n;
      const hit = findTreeNode(n.children, path);
      if (hit) return hit;
    }
    return null;
  }

  function listQuery(state) {
    const params = new URLSearchParams({
      path: state.currentPath,
      page: String(state.page),
      limit: String(state.perPage),
      sort: state.sort.key,
      dir: state.sort.dir,
      search: state.search,
      type: state.filter,
    });
    if (state.starredOnly) params.set('starredOnly', 'true');
    return params.toString();
  }

  function resolveLibraryView(search) {
    const view = new URLSearchParams(search || '').get('view');
    return Object.prototype.hasOwnProperty.call(LIBRARY_VIEWS, view) ? view : null;
  }

  /**
   * Turn a /fs/delete response into what the operator is told. A 2xx from that
   * endpoint does NOT mean every path was deleted: `data.failed` lists survivors.
   * Counts come from the response, never from the selection size.
   */
  function summarizeDelete(sentPaths, data) {
    const deleted = Array.isArray(data && data.deleted) ? data.deleted : [];
    const failed = Array.isArray(data && data.failed) ? data.failed : [];
    return {
      sent: sentPaths.length,
      deleted,
      failed,
      kind: failed.length === 0 ? 'complete' : 'partial',
    };
  }

  /** Copy for the irreversible-delete confirmation: count, names, permanence. Escaped. */
  function deleteConfirmCopy(items) {
    const count = items.length;
    const folders = items.filter(i => i.isFolder).length;
    const shown = items.slice(0, CONFIRM_NAME_LIMIT).map(i => `“${esc(i.name)}”${i.isFolder ? ' (folder and everything in it)' : ''}`);
    const more = count > CONFIRM_NAME_LIMIT ? ` and ${count - CONFIRM_NAME_LIMIT} more` : '';
    const noun = count === 1 ? 'item' : 'items';
    return {
      title: `Permanently delete ${count} ${noun}?`,
      message: `${shown.join(', ')}${more} will be deleted from the server disk${folders ? ', including all folder contents' : ''}. ` +
        'This cannot be undone: there is no trash and no restore.',
      confirmText: `Delete ${count} ${noun} permanently`,
    };
  }

  /* ══════════════════════════════════════════
     RENDERERS (state -> HTML string)
     ══════════════════════════════════════════ */

  function renderTreeHtml(state) {
    if (state.treeError) {
      return `
        <div class="state-panel state-panel-compact" role="alert">
          <div class="state-title">Folders could not be loaded</div>
          <div class="state-desc">${esc(state.treeError)}</div>
          <button type="button" class="btn btn-ghost btn-sm" data-retry="tree">${icon('refresh', 14)} Retry</button>
        </div>`;
    }
    if (!state.treeLoaded) {
      return `<div class="tree-skeleton" aria-hidden="true">${'<div class="skeleton skeleton-line"></div>'.repeat(4)}</div>`;
    }
    if (!state.tree.length) {
      return '<div class="state-desc">No folders.</div>';
    }

    let groupSeq = 0;
    function walk(nodes, level) {
      return nodes.map(n => {
        const children = Array.isArray(n.children) ? n.children : [];
        const expandable = nodeIsExpandable(n);
        const isOpen = expandable && state.expanded.has(n.path);
        const isLoading = isOpen && state.treeLoadingPaths.has(n.path);
        const isActive = n.path === state.currentPath;
        const groupId = expandable ? `tree-group-${++groupSeq}` : '';
        const name = esc(n.name);
        return `
          <div class="tree-node${isOpen ? ' is-open' : ''}" role="none">
            <div class="tree-item${isActive ? ' is-active' : ''}" role="treeitem" aria-level="${level}"
              ${expandable ? `aria-expanded="${isOpen}" aria-owns="${groupId}"` : ''}
              aria-selected="${isActive}" ${isActive ? 'aria-current="page"' : ''}
              tabindex="${isActive ? 0 : -1}" data-tree-path="${esc(n.path)}" title="${esc(n.path)}">
              ${expandable
                ? `<button type="button" class="tree-caret${isLoading ? ' is-loading' : ''}" tabindex="-1" data-tree-toggle="${esc(n.path)}" aria-label="${isLoading ? 'Loading' : isOpen ? 'Collapse' : 'Expand'} ${name}">${icon(isLoading ? 'refresh' : 'chevronRight', 11)}</button>`
                : '<span class="tree-caret is-empty" aria-hidden="true"></span>'}
              <span class="tree-ico" aria-hidden="true">${icon(n.icon || 'folder', 14)}</span>
              <span class="tree-name">${name}</span>
            </div>
            ${expandable ? `<div class="tree-children" role="group" id="${groupId}">${isLoading && children.length === 0 ? '<div class="tree-note tree-note-loading" aria-hidden="true">Loading…</div>' : walk(children, level + 1)}</div>` : ''}
          </div>`;
      }).join('');
    }

    const deepNote = treeContains(state.tree, state.currentPath) ? '' : `
      <p class="tree-note" role="note">
        The folder tree shows ${TREE_DEPTH} levels at a time below All Files. You are deeper, in
        <span class="tree-note-path">${esc(state.currentPath)}</span> — use the breadcrumb to move up,
        or expand folders above to reach it.
      </p>`;

    return walk(state.tree, 1) + deepNote;
  }

  function renderBreadcrumbHtml(path) {
    const parts = path.split('/').filter(Boolean);
    const crumbs = [{ label: 'All files', path: '/' }];
    let built = '';
    for (const part of parts) {
      built += `/${part}`;
      crumbs.push({ label: part, path: built });
    }
    return `<ol class="breadcrumb-list">${crumbs.map((c, i) => {
      const isCurrent = i === crumbs.length - 1;
      return `
        <li class="breadcrumb-entry">
          ${i > 0 ? `<span class="breadcrumb-sep" aria-hidden="true">${icon('chevronRight', 14)}</span>` : ''}
          <button type="button" class="breadcrumb-item${isCurrent ? ' is-current' : ''}" data-nav-path="${esc(c.path)}"
            ${isCurrent ? 'aria-current="page"' : ''} title="${esc(c.path)}">${esc(c.label)}</button>
        </li>`;
    }).join('')}</ol>`;
  }

  function renderChipsHtml(state) {
    const counts = state.counts;
    // With counts, a chip that would list nothing is hidden (All and the active
    // filter excepted); without counts nothing is known, so every chip shows.
    // `other` has no reading to show either way unless it has members.
    const hasCount = c => counts && Number.isFinite(counts[c.key]);
    return TYPE_CHIPS
      .filter(c => c.key === 'all' || state.filter === c.key ||
        (hasCount(c) ? counts[c.key] > 0 : c.key !== 'other'))
      .map(c => {
        const n = counts && Number.isFinite(counts[c.key]) ? counts[c.key] : null;
        const active = state.filter === c.key;
        const name = n === null ? `Show ${c.label.toLowerCase()}` : `Show ${c.label.toLowerCase()}, ${n} ${n === 1 ? 'item' : 'items'}`;
        return `
          <button type="button" class="filter-chip${active ? ' is-active' : ''}" data-filter="${c.key}"
            aria-pressed="${active}" aria-label="${esc(name)}">
            ${icon(c.icon, 13)}
            <span aria-hidden="true">${c.label}</span>
            ${n === null ? '' : `<span class="count" aria-hidden="true">${Format.compact(n)}</span>`}
          </button>`;
      }).join('');
  }

  function resizerHtml(state, key, label) {
    const c = columnDef(key);
    const w = columnWidth(state.colWidths, key);
    const value = w == null ? 'aria-valuetext="Fills the remaining width"' : `aria-valuenow="${w}"`;
    return `<span class="col-resizer" data-resize="${key}" role="separator" aria-orientation="vertical" tabindex="0"
      aria-label="Resize ${label} column" ${value} aria-valuemin="${c.min}" aria-valuemax="${COLUMN_MAX}"
      title="Drag to resize. Arrow keys resize, Delete resets."></span>`;
  }

  function sortHeader(state, key, label, cls = '') {
    const sorted = state.sort.key === key;
    const ariaSort = sorted ? (state.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
    const dirWord = state.sort.dir === 'asc' ? 'ascending' : 'descending';
    const next = sorted ? (state.sort.dir === 'asc' ? 'descending' : 'ascending') : (SORT_DEFAULT_DIR[key] === 'asc' ? 'ascending' : 'descending');
    return `
      <th scope="col" class="sortable${sorted ? ` is-sorted ${state.sort.dir}` : ''}${cls ? ` ${cls}` : ''}" aria-sort="${ariaSort}">
        <button type="button" class="sort-btn" data-sort="${key}"
          aria-label="${label}${sorted ? `, sorted ${dirWord}` : ''}. Sort ${next}.">
          <span class="sort-label">${label}</span><span class="sort-ind" aria-hidden="true">${icon('chevronUp', 12)}</span>
        </button>
        ${isResizable(key) ? resizerHtml(state, key, label) : ''}
      </th>`;
  }

  function entryTabIndex(state, file) {
    const active = state.activeId && state.files.some(f => f.id === state.activeId) ? state.activeId : (state.files[0] && state.files[0].id);
    return file.id === active ? 0 : -1;
  }

  function starMark(file) {
    return file.starred ? `<span class="star-mark" title="Starred">${icon('star', 12)}<span class="sr-only">Starred</span></span>` : '';
  }

  /** A listing can mix folders only during a search or in a library view. */
  function showsPaths(state) {
    return !!(state.search || state.library);
  }

  /** Size and age as one secondary line, for phones where those columns are hidden. */
  function metaLine(f) {
    const parts = [];
    if (f.size != null) parts.push(Format.bytes(f.size));
    parts.push(Format.relative(f.modified));
    return parts.join(' · ');
  }

  function renderListHtml(state) {
    const files = state.files;
    const withPaths = showsPaths(state);
    const selectedOnPage = files.filter(f => state.selected.has(f.id)).length;
    const allSelected = files.length > 0 && selectedOnPage === files.length;
    const scope = `Select all ${files.length} ${files.length === 1 ? 'item' : 'items'} on this page`;

    const rows = files.map((f, i) => {
      const t = typeOf(f);
      const isSel = state.selected.has(f.id);
      const isCut = state.clipboardMode === 'cut' && state.clipboardPaths.has(f.path);
      const tab = entryTabIndex(state, f);
      const name = esc(f.name);
      const id = esc(f.id);
      return `
        <tr data-entry data-id="${id}" class="${isSel ? 'is-selected' : ''}${isCut ? ' is-cut' : ''}" aria-selected="${isSel}" tabindex="${tab}"
          aria-label="${name}, ${esc(typeLabel(f))}${isCut ? ', ready to move' : ''}">
          <td class="col-check">
            <label class="checkbox">
              <input type="checkbox" data-check="${id}" ${isSel ? 'checked' : ''} tabindex="${tab}" aria-label="Select ${name}">
              <span class="box" aria-hidden="true">${icon('check', 11)}</span>
            </label>
          </td>
          <td class="col-name">
            <div class="fname-cell">
              <div class="ftype-icon ${esc(t.key)}" aria-hidden="true">${icon(t.icon, 16)}</div>
              <div class="fname-text">
                <div class="fname" title="${name}">${name}${starMark(f)}</div>
                ${withPaths ? `<div class="fpath" title="${esc(f.path)}">${esc(f.path)}</div>` : ''}
                <div class="fmeta" aria-hidden="true">${esc(metaLine(f))}</div>
              </div>
            </div>
          </td>
          <td class="col-size"><span class="mono-num">${f.size == null ? '<span aria-label="Size unavailable">—</span>' : Format.bytes(f.size)}</span></td>
          <td class="col-type"><span class="ftype-label">${esc(typeLabel(f))}</span></td>
          <td class="col-downloads"><span class="mono-num">${f.downloads != null ? Format.compact(f.downloads) : '<span aria-label="Not applicable">—</span>'}</span></td>
          <td class="col-modified"><span class="mono-num mono-sm" title="${esc(Format.dateTime(f.modified))}">${esc(Format.relative(f.modified))}</span></td>
          <td class="col-actions">
            <div class="row-actions">
              ${f.isFolder ? '' : `<button type="button" class="btn-icon btn-icon-sm" data-act="download" data-id="${id}" tabindex="${tab}" data-tip="Download" data-tip-pos="left" aria-label="Download ${name}">${icon('download', 15)}</button>`}
              <button type="button" class="btn-icon btn-icon-sm" data-act="more" data-id="${id}" tabindex="${tab}" data-tip="More" data-tip-pos="left" aria-label="More actions for ${name}">${icon('moreHorizontal', 15)}</button>
            </div>
          </td>
        </tr>`;
    }).join('');

    return `
      <div class="files-table-wrap">
        <table class="files-table" role="grid" aria-label="Files in ${esc(state.currentPath)}">
          <colgroup>${COLUMNS.map(c => `<col class="col-${c.key}">`).join('')}</colgroup>
          <thead>
            <tr>
              <th scope="col" class="col-check">
                <label class="checkbox" title="${scope}">
                  <input type="checkbox" id="selectAll" ${allSelected ? 'checked' : ''} aria-label="${scope}">
                  <span class="box" aria-hidden="true">${icon('check', 11)}</span>
                </label>
              </th>
              ${sortHeader(state, 'name', 'Name', 'col-name')}
              ${sortHeader(state, 'size', 'Size', 'col-size')}
              <th scope="col" class="col-type"><span class="th-label">Type</span>${resizerHtml(state, 'type', 'Type')}</th>
              ${sortHeader(state, 'downloads', 'Downloads', 'col-downloads')}
              ${sortHeader(state, 'modified', 'Modified', 'col-modified')}
              <th scope="col" class="col-actions"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${renderFooterHtml(state)}`;
  }

  function renderGridHtml(state) {
    const cards = state.files.map((f, i) => {
      const t = typeOf(f);
      const isSel = state.selected.has(f.id);
      const isCut = state.clipboardMode === 'cut' && state.clipboardPaths.has(f.path);
      const tab = entryTabIndex(state, f);
      const name = esc(f.name);
      const id = esc(f.id);
      return `
        <div class="file-card stagger-${staggerIndex(i)}${isSel ? ' is-selected' : ''}${isCut ? ' is-cut' : ''}" role="row" data-entry data-id="${id}"
          aria-selected="${isSel}" tabindex="${tab}" aria-label="${name}, ${esc(typeLabel(f))}${isCut ? ', ready to move' : ''}">
          <div class="file-card-cell" role="gridcell">
            <div class="file-card-check">
              <label class="checkbox">
                <input type="checkbox" data-check="${id}" ${isSel ? 'checked' : ''} tabindex="${tab}" aria-label="Select ${name}">
                <span class="box" aria-hidden="true">${icon('check', 11)}</span>
              </label>
            </div>
            <div class="file-card-menu">
              <button type="button" class="btn-icon btn-icon-sm" data-act="more" data-id="${id}" tabindex="${tab}" data-tip="More" data-tip-pos="bottom" aria-label="More actions for ${name}">${icon('moreHorizontal', 15)}</button>
            </div>
            ${renderThumbHtml(f, 'card')}
            <div class="file-card-info">
              <div class="file-card-name" title="${name}">${name}${starMark(f)}</div>
              <div class="file-card-meta">
                <span>${f.size == null ? '—' : Format.bytes(f.size)}</span>
                <span class="sep" aria-hidden="true"></span>
                <span title="${esc(Format.dateTime(f.modified))}">${esc(Format.relative(f.modified))}</span>
              </div>
              <span class="file-card-type">${esc(typeLabel(f))}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="grid-files" role="grid" aria-label="Files in ${esc(state.currentPath)}">${cards}</div>
      ${renderFooterHtml(state)}`;
  }

  /* ── previews ── */

  /** Set at init from GET /api/fs/thumbnail/capability. */
  let previewCapability = { available: false, formats: [], maxSize: 0 };

  function previewUrl(file, size) {
    return window.API.thumbnailUrl(file.path, size);
  }

  function canPreview(file) {
    return !file.isFolder && previewCapability.available &&
      previewCapability.formats.includes(extensionOf(file.name));
  }

  /** A real preview, or a stated absence — never a broken image, never a stand-in picture. */
  function renderThumbHtml(file, where) {
    const t = typeOf(file);
    const cls = where === 'drawer' ? 'drawer-preview' : 'file-thumb';
    const size = where === 'drawer' ? 512 : 256;
    if (canPreview(file)) {
      return `
        <div class="${cls}" data-preview>
          <img src="${esc(previewUrl(file, size))}" alt="Preview of ${esc(file.name)}" loading="lazy" decoding="async">
          <div class="ftype-icon ${esc(t.key)} preview-fallback" aria-hidden="true">${icon(t.icon, 22)}</div>
          <span class="preview-note preview-fallback">Preview could not be generated</span>
        </div>`;
    }
    let note = '';
    if (!file.isFolder) {
      note = t.key === 'image' && !previewCapability.available
        ? 'Previews are not enabled on this server'
        : 'No preview for this file type';
    }
    // A grid card states the absence through its glyph's accessible name rather
    // than repeating the sentence on every card; the drawer still shows it.
    if (where !== 'drawer' && note) {
      return `
      <div class="${cls}">
        <div class="ftype-icon ${esc(t.key)}" role="img" aria-label="${note}" title="${note}">${icon(t.icon, 22)}</div>
      </div>`;
    }
    return `
      <div class="${cls}">
        <div class="ftype-icon ${esc(t.key)}" aria-hidden="true">${icon(t.icon, 22)}</div>
        ${note ? `<span class="preview-note">${note}</span>` : ''}
      </div>`;
  }

  function renderFooterHtml(state) {
    const totalPages = pageCount(state.total, state.perPage);
    const { start, end } = footerRange(state.page, state.perPage, state.total);
    const pageNumbers = buildPageNumbers(state.page, totalPages);
    return `
      <div class="table-footer">
        <label class="rows-select">
          Show
          <select id="perPageSelect" aria-label="Rows per page">
            ${PAGE_SIZES.map(n => `<option value="${n}" ${state.perPage === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          rows
        </label>
        <div class="footer-info">
          Showing <strong>${start}–${end}</strong> of <strong>${Format.number(state.total)}</strong>
        </div>
        <nav class="pagination" aria-label="Pagination">
          <button type="button" class="page-btn" data-page="prev" aria-label="Previous page" ${state.page <= 1 ? 'disabled' : ''}>${icon('chevronLeft', 15)}</button>
          ${pageNumbers.map(p => p === '…'
            ? '<span class="page-btn page-gap" aria-hidden="true">…</span>'
            : `<button type="button" class="page-btn${p === state.page ? ' is-active' : ''}" data-page="${p}" aria-label="Page ${p}" ${p === state.page ? 'aria-current="page"' : ''}>${p}</button>`
          ).join('')}
          <button type="button" class="page-btn" data-page="next" aria-label="Next page" ${state.page >= totalPages ? 'disabled' : ''}>${icon('chevronRight', 15)}</button>
        </nav>
      </div>`;
  }

  /** Occupies the loaded content's footprint so the layout does not jump. */
  function renderSkeletonHtml(state) {
    const n = Math.max(1, Math.min(state.perPage, state.files.length || SKELETON_ROWS));
    if (state.view === 'grid') {
      return `<div class="grid-files" aria-hidden="true">${'<div class="file-card file-card-skeleton"><div class="skeleton skeleton-thumb"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line short"></div></div>'.repeat(n)}</div>
        <span class="sr-only">Loading files…</span>`;
    }
    const row = '<tr><td class="col-check"><div class="skeleton skeleton-box"></div></td><td class="col-name"><div class="skeleton skeleton-line"></div></td><td class="col-size"><div class="skeleton skeleton-line short"></div></td><td class="col-type"><div class="skeleton skeleton-line short"></div></td><td class="col-downloads"><div class="skeleton skeleton-line short"></div></td><td class="col-modified"><div class="skeleton skeleton-line short"></div></td><td class="col-actions"></td></tr>';
    return `
      <div class="files-table-wrap" aria-hidden="true">
        <table class="files-table files-table-skeleton"><tbody>${row.repeat(n)}</tbody></table>
      </div>
      <span class="sr-only">Loading files…</span>`;
  }

  function renderEmptyHtml(state) {
    const kind = emptyKind(state);
    const chip = TYPE_CHIPS.find(c => c.key === state.filter);
    let title;
    let desc;
    let actions;
    if (kind === 'search') {
      title = `Nothing here matches “${esc(state.search)}”`;
      desc = state.filter !== 'all'
        ? `The search is limited to ${esc(chip ? chip.label.toLowerCase() : state.filter)} in this folder and its subfolders.`
        : 'The search covers names in this folder and all its subfolders.';
      actions = `<button type="button" class="btn btn-ghost btn-sm" data-clear="search">Clear search${state.filter !== 'all' ? ' and filter' : ''}</button>`;
    } else if (kind === 'filter') {
      title = `No ${esc(chip ? chip.label.toLowerCase() : state.filter)} in this folder`;
      desc = 'Other kinds of files may be here.';
      actions = '<button type="button" class="btn btn-ghost btn-sm" data-clear="filter">Show all types</button>';
    } else if (kind === 'starred') {
      title = 'No starred items in this folder';
      desc = 'Star a file or folder from its menu or its details.';
      actions = '<a class="btn btn-ghost btn-sm" href="files.html">Browse all files</a>';
    } else {
      title = 'This folder is empty';
      desc = 'Upload files here or create a subfolder.';
      actions = `
        <button type="button" class="btn btn-ghost btn-sm" data-empty-act="newFolder">${icon('folderPlus', 15)} New folder</button>
        <button type="button" class="btn btn-primary btn-sm" data-empty-act="upload">${icon('upload', 15)} Upload files</button>`;
    }
    return `
      <div class="empty-state" data-empty-kind="${kind}">
        <div class="empty-icon" aria-hidden="true">${icon(kind === 'empty' ? 'inbox' : 'search', 26)}</div>
        <div class="empty-title">${title}</div>
        <div class="empty-desc">${desc}</div>
        <div class="state-actions">${actions}</div>
      </div>`;
  }

  function renderErrorHtml(message) {
    return `
      <div class="empty-state state-error" role="alert" data-error-state>
        <div class="empty-icon" aria-hidden="true">${icon('alert', 26)}</div>
        <div class="empty-title">This folder could not be loaded</div>
        <div class="empty-desc">${esc(message)}</div>
        <div class="state-actions">
          <button type="button" class="btn btn-primary btn-sm" data-retry="files">${icon('refresh', 15)} Retry</button>
        </div>
      </div>`;
  }

  function renderDrawerHtml(file) {
    const isFolder = file.isFolder;
    const where = parentPath(file.path);
    return `
      ${renderThumbHtml(file, 'drawer')}
      <div>
        <div class="drawer-filename">${esc(file.name)}${starMark(file)}</div>
        <div class="drawer-badges">
          <span class="badge">${esc(typeLabel(file))}</span>
        </div>
      </div>
      <dl class="meta-list">
        <div class="meta-row"><dt class="meta-key">Size</dt><dd class="meta-val">${file.size == null ? 'Unavailable' : Format.bytes(file.size)}</dd></div>
        <div class="meta-row"><dt class="meta-key">Type</dt><dd class="meta-val">${esc(typeLabel(file))}</dd></div>
        ${!isFolder && file.downloads != null ? `<div class="meta-row"><dt class="meta-key">Downloads</dt><dd class="meta-val">${Format.number(file.downloads)}</dd></div>` : ''}
        <div class="meta-row"><dt class="meta-key">Modified</dt><dd class="meta-val">${esc(Format.dateTime(file.modified))}</dd></div>
        <div class="meta-row meta-row-stack">
          <dt class="meta-key">Location</dt>
          <dd class="meta-val meta-path">
            <span class="meta-path-text">${esc(file.path)}</span>
            <button type="button" class="btn-icon btn-icon-sm" data-drawer-act="copy-path" aria-label="Copy location" data-tip="Copy location" data-tip-pos="bottom">${icon('copy', 14)}</button>
          </dd>
        </div>
        <div class="meta-row">
          <dt class="meta-key">In folder</dt>
          <dd class="meta-val"><button type="button" class="link-btn" data-drawer-act="open-parent" title="${esc(where)}">${esc(where === '/' ? 'All Files' : baseName(where))}</button></dd>
        </div>
      </dl>`;
  }

  function renderDrawerFooterHtml(file) {
    return `
      <div class="drawer-footer-row">
        <button type="button" class="btn btn-ghost btn-sm" data-drawer-act="star" aria-pressed="${!!file.starred}">
          ${icon('star', 14)} ${file.starred ? 'Unstar' : 'Star'}
        </button>
        ${file.isFolder
          ? `<button type="button" class="btn btn-primary btn-sm drawer-primary" data-drawer-act="open">${icon('folderOpen', 14)} Open folder</button>`
          : `<button type="button" class="btn btn-primary btn-sm drawer-primary" data-drawer-act="download">${icon('download', 14)} Download</button>`}
      </div>
      <div class="drawer-footer-row">
        <button type="button" class="btn btn-ghost btn-sm" data-drawer-act="rename">${icon('edit', 14)} Rename</button>
        <button type="button" class="btn btn-ghost btn-sm" data-drawer-act="move">${icon('move', 14)} Move</button>
        <button type="button" class="btn btn-ghost btn-sm drawer-danger" data-drawer-act="delete">${icon('trash', 14)} Delete permanently</button>
      </div>`;
  }

  /* ══════════════════════════════════════════
     CONTROLLER STATE
     ══════════════════════════════════════════ */

  let state = createState();
  let listRequestId = 0;
  let treeRequestId = 0;
  let searchTimer = null;
  let drawerFileId = null;
  let drawerOpener = null;
  let lastAnnouncement = '';
  /** Opening a folder from the list keeps keyboard users in the list it opens. */
  let focusListAfterLoad = false;
  const uploads = [];

  /* ══════════════════════════════════════════
     DATA LOADING
     ══════════════════════════════════════════ */

  async function loadTree() {
    const reqId = ++treeRequestId;
    state.treeError = null;
    try {
      const data = await window.API.get('/fs/tree');
      if (reqId !== treeRequestId) return;
      state.tree = Array.isArray(data) ? data : [];
      state.treeLoaded = true;
    } catch (e) {
      if (reqId !== treeRequestId) return;
      // No fallback tree: a fabricated hierarchy invites navigation into folders
      // the server may not hold.
      state.tree = [];
      state.treeError = (e && e.message) || 'The folder tree request failed.';
    }
    initExpansion(state);
    renderTree();
  }

  /**
   * @param {{ silent?: boolean }} [opts] silent: keep the current content on
   *   screen instead of the skeleton (used after a mutation).
   */
  async function loadFiles(opts = {}) {
    const reqId = ++listRequestId;
    state.error = null;
    if (!opts.silent) {
      state.loading = true;
      renderView();
    }

    try {
      const res = await window.API.get(`/fs/list?${listQuery(state)}`);
      if (reqId !== listRequestId) return;

      const files = Array.isArray(res && res.items) ? res.items : [];
      const total = Number.isFinite(res && res.total) ? res.total : files.length;

      // The result shrank under the current page (e.g. its last row was deleted):
      // move to the new final page instead of showing an empty table.
      if (files.length === 0 && total > 0 && state.page > pageCount(total, state.perPage)) {
        state.page = pageCount(total, state.perPage);
        return loadFiles(opts);
      }

      state.files = files;
      state.total = total;
      state.counts = res && res.counts && typeof res.counts === 'object' ? res.counts : null;
      state.selected = pruneSelection(state.selected, files);
      if (res && res.searchTruncated) {
        Toast.warning('Search stopped early', 'This folder tree is too large to search fully; results are partial.');
      }
    } catch (e) {
      if (reqId !== listRequestId) return;
      state.files = [];
      state.total = 0;
      state.counts = null;
      state.selected = new Set();
      state.error = (e && e.message) || 'The listing request failed.';
    }

    if (reqId !== listRequestId) return;
    state.loading = false;
    renderChips();
    renderView();
    updateBulkBar();
    announceListing();
    if (focusListAfterLoad) {
      focusListAfterLoad = false;
      if (state.files.length) focusEntry(state.files[0].id);
    }
  }

  async function loadPreviewCapability() {
    try {
      const cap = await window.API.get('/fs/thumbnail/capability');
      previewCapability = {
        available: !!(cap && cap.available === true),
        formats: Array.isArray(cap && cap.formats) ? cap.formats : [],
        maxSize: Number.isFinite(cap && cap.maxSize) ? cap.maxSize : 0,
      };
    } catch {
      previewCapability = { available: false, formats: [], maxSize: 0 };
    }
  }

  /**
   * Server-side default listing layout (Settings → appearance.defaultView),
   * applied on a fresh visit only. An explicit operator choice always wins:
   * the view toggle persists it as Store 'files-view', so any value found
   * there — including one written while this read is in flight — suppresses
   * the setting. The read is silent by contract: an unset value or an
   * unreachable store changes nothing and shows nothing, and the layout
   * keeps the same default it has always had.
   */
  async function applyDefaultViewSetting() {
    const hasExplicitChoice = () => {
      const v = Store.get('files-view', null);
      return v === 'list' || v === 'grid';
    };
    if (hasExplicitChoice()) return;
    let settings;
    try {
      settings = await window.API.get('/settings', { silent: true });
    } catch {
      return; // no toast, no console line: the current default stands
    }
    if (hasExplicitChoice()) return;
    const view = settings && settings.appearance ? settings.appearance.defaultView : null;
    if (view !== 'list' && view !== 'grid') return;
    if (view === state.view) return;
    state.view = view;
    renderView();
  }

  /* ══════════════════════════════════════════
     NAVIGATION (single owner)
     ══════════════════════════════════════════ */

  function cancelPendingSearch() {
    if (searchTimer !== null) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
  }

  /**
   * Every navigation entry point — tree, breadcrumb, row/card activation,
   * context menu, drawer link — goes through here.
   */
  function navigateTo(path) {
    if (!applyNavigation(state, path)) return false;
    cancelPendingSearch();
    syncSearchInput();
    for (const a of ancestorsOf(path)) state.expanded.add(a);
    closeTreeSheet();
    updateBreadcrumb();
    renderTree();
    renderChips();
    updateBulkBar();
    loadFiles();
    return true;
  }

  /**
   * After a rename or delete, the displayed folder may no longer exist at its
   * path. This is the one place outside applyNavigation that moves currentPath.
   */
  function syncAfterMutation(action, oldPath, newPath) {
    const next = rewriteAfterMutation(state.currentPath, action, oldPath, newPath);
    if (action === 'rename' && newPath) {
      state.expanded = new Set([...state.expanded].map(p =>
        (isSameOrInside(p, oldPath) && oldPath !== '/' ? newPath + p.slice(oldPath.length) : p)));
    }
    if (next === null) return false;
    state.currentPath = next;
    state.page = 1;
    updateBreadcrumb();
    return true;
  }

  function syncSearchInput() {
    const input = $('#filesSearch');
    if (input) input.value = state.search;
  }

  /* ══════════════════════════════════════════
     RENDER INTO THE DOM
     ══════════════════════════════════════════ */

  function renderTree() {
    const wrap = $('#folderTree');
    if (!wrap) return;
    const focusedPath = focusedTreePath(wrap);
    wrap.innerHTML = renderTreeHtml(state);
    if (focusedPath) focusTreeItem(focusedPath);
  }

  /** The heading names what is being browsed: the library view, else the folder. */
  function locationTitle(state) {
    if (state.library && LIBRARY_VIEWS[state.library]) return LIBRARY_VIEWS[state.library].title;
    return state.currentPath === '/' ? 'All files' : baseName(state.currentPath);
  }

  /** Heading and path trail, kept together on every navigation. */
  function updateBreadcrumb() {
    const bc = $('#breadcrumb');
    if (bc) bc.innerHTML = renderBreadcrumbHtml(state.currentPath);
    const title = $('#pageTitle');
    if (title) title.textContent = locationTitle(state);
  }

  function renderChips() {
    const wrap = $('#filterChips');
    if (wrap) wrap.innerHTML = renderChipsHtml(state);
  }

  function renderView() {
    const wrap = $('#filesContainer');
    if (!wrap) return;
    const focusedId = focusedEntryId(wrap);

    if (state.loading) wrap.innerHTML = renderSkeletonHtml(state);
    else if (state.error) wrap.innerHTML = renderErrorHtml(state.error);
    else if (!state.files.length) wrap.innerHTML = renderEmptyHtml(state);
    else wrap.innerHTML = state.view === 'grid' ? renderGridHtml(state) : renderListHtml(state);

    wrap.setAttribute('aria-busy', String(!!state.loading));
    syncSelectAll();
    syncSortMenu();
    syncViewToggle();
    if (focusedId) focusEntry(focusedId);
  }

  function syncSelectAll() {
    const box = $('#selectAll');
    if (!box) return;
    const selectedOnPage = state.files.filter(f => state.selected.has(f.id)).length;
    box.checked = state.files.length > 0 && selectedOnPage === state.files.length;
    box.indeterminate = selectedOnPage > 0 && selectedOnPage < state.files.length;
  }

  function syncSortMenu() {
    const menu = $('#sortDropdown');
    if (!menu) return;
    menu.querySelectorAll('[data-sort-act]').forEach(btn => {
      const key = btn.getAttribute('data-sort-act');
      const active = key === state.sort.key;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
      const dir = btn.querySelector('.sort-dir');
      if (dir) dir.textContent = active ? (state.sort.dir === 'asc' ? 'Ascending' : 'Descending') : '';
    });
    const label = $('#sortLabel');
    if (label) label.textContent = `${SORT_LABELS[state.sort.key]} ${state.sort.dir === 'asc' ? '↑' : '↓'}`;
    const trigger = $('#sortTrigger');
    if (trigger) {
      trigger.setAttribute('aria-label',
        `Sort: ${SORT_LABELS[state.sort.key]}, ${state.sort.dir === 'asc' ? 'ascending' : 'descending'}`);
    }
  }

  function syncViewToggle() {
    const toggles = document.querySelectorAll ? document.querySelectorAll('[data-view]') : [];
    toggles.forEach(b => {
      const on = b.getAttribute('data-view') === state.view;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function updateBulkBar() {
    const bar = $('#bulkBar');
    if (!bar) return;
    const count = selectedFiles().length;
    const wasVisible = bar.classList.contains('is-visible');
    // In the command bar: visible selection actions replace the listing controls (files.css :has).
    bar.classList.toggle('is-visible', count > 0);
    bar.setAttribute('aria-hidden', String(count === 0));
    if (count === 0) bar.setAttribute('inert', '');
    else bar.removeAttribute('inert');
    const num = bar.querySelector('.num');
    if (num) num.textContent = String(count);
    if (count > 0 && !wasVisible) {
      announce(`${count} selected on this page. Bulk actions toolbar available.`);
    }
  }

  /* ── live region ── */

  function announce(message) {
    const region = $('#filesStatus');
    if (!region || !message) return;
    region.textContent = message;
    lastAnnouncement = message;
  }

  function announceListing() {
    let message;
    if (state.error) message = 'The folder could not be loaded.';
    else {
      message = `${state.total} ${state.total === 1 ? 'item' : 'items'}`;
      if (state.search) message += ` matching “${state.search}”`;
      if (state.filter !== 'all') message += `, filtered by ${state.filter}`;
    }
    // Only changes the operator would otherwise miss: never re-announce.
    if (message !== lastAnnouncement) announce(message);
  }

  /* ══════════════════════════════════════════
     FOCUS HELPERS (roving tabindex)
     ══════════════════════════════════════════ */

  function entryElements() {
    const wrap = $('#filesContainer');
    return wrap && wrap.querySelectorAll ? Array.from(wrap.querySelectorAll('[data-entry]')) : [];
  }

  function focusedEntryId(wrap) {
    const active = document.activeElement;
    if (!active || !wrap.contains || !wrap.contains(active)) return null;
    const entry = active.closest ? active.closest('[data-entry]') : null;
    return entry ? entry.getAttribute('data-id') : null;
  }

  function setActiveEntry(id) {
    state.activeId = id;
    for (const el of entryElements()) {
      const on = el.getAttribute('data-id') === id;
      el.tabIndex = on ? 0 : -1;
      el.querySelectorAll('input[data-check], [data-act]').forEach(c => { c.tabIndex = on ? 0 : -1; });
    }
  }

  function focusEntry(id) {
    const el = entryElements().find(e => e.getAttribute('data-id') === id);
    if (!el) return;
    setActiveEntry(id);
    el.focus();
  }

  function focusedTreePath(wrap) {
    const active = document.activeElement;
    if (!active || !wrap.contains || !wrap.contains(active)) return null;
    const item = active.closest ? active.closest('[data-tree-path]') : null;
    return item ? item.getAttribute('data-tree-path') : null;
  }

  function focusTreeItem(path) {
    const wrap = $('#folderTree');
    if (!wrap || !wrap.querySelectorAll) return;
    const items = Array.from(wrap.querySelectorAll('[data-tree-path]'));
    const target = items.find(i => i.getAttribute('data-tree-path') === path);
    if (!target) return;
    items.forEach(i => { i.tabIndex = i === target ? 0 : -1; });
    target.focus();
  }

  /* ══════════════════════════════════════════
     SELECTION
     ══════════════════════════════════════════ */

  function selectedFiles() {
    return state.files.filter(f => state.selected.has(f.id));
  }

  function setSelected(id, on) {
    if (on) state.selected.add(id);
    else state.selected.delete(id);
    for (const el of entryElements()) {
      if (el.getAttribute('data-id') !== id) continue;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-selected', String(on));
      const box = el.querySelector('input[data-check]');
      if (box) box.checked = on;
    }
    syncSelectAll();
    updateBulkBar();
  }

  function selectAllOnPage(on) {
    for (const f of state.files) setSelected(f.id, on);
  }

  function clearSelection() {
    state.selected = new Set();
    renderView();
    updateBulkBar();
  }

  /* ══════════════════════════════════════════
     ACTIONS
     ══════════════════════════════════════════ */

  /** Entry-scoped actions need a rendered entry; the rest carry their own scope. */
  const SCOPED_ACTIONS = new Set(['newFolder', 'renameTree', 'deleteTree', 'bulkDelete', 'bulkStar', 'bulkMove', 'bulkCopy', 'bulkPolicy', 'paste']);

  /**
   * @param {string} act
   * @param {string} [id] entry id, or a folder path for tree-scoped actions
   * @param {{ anchor?: Element, event?: Event }} [opts]
   */
  async function handleAction(act, id, opts = {}) {
    const file = state.files.find(f => f.id === id);
    if (!file && !SCOPED_ACTIONS.has(act)) return; // stale or unknown id: nothing to act on

    switch (act) {
      case 'open': return activateEntry(file, opts.anchor);
      case 'details': return openDrawer(file.id, opts.anchor);
      case 'download': return downloadOne(file);
      case 'zip': return requestZip([file]);
      case 'more': return openContextFor(file, opts.anchor, opts.event);
      case 'copyPath': return copyToClipboard(file.path, 'Location copied');
      case 'star': return setStars([file], !file.starred);
      case 'rename': return renameItem(file);
      case 'cut': return cutItems(state.selected.size ? selectedFiles() : [file]);
      case 'copy': return copyItems(state.selected.size ? selectedFiles() : [file]);
      case 'delete': return deleteItems([file]);
      case 'newFolder': return createFolder(typeof id === 'string' && id ? id : state.currentPath);
      case 'renameTree': return renameItem({ name: baseName(id), path: id, isFolder: true });
      case 'deleteTree': return deleteItems([{ name: baseName(id), path: id, isFolder: true }]);
      case 'bulkDelete': return deleteItems(selectedFiles());
      case 'bulkStar': {
        const items = selectedFiles();
        return setStars(items, !items.every(f => f.starred));
      }
      case 'bulkMove': return cutItems(selectedFiles());
      case 'bulkCopy': return copyItems(selectedFiles());
      case 'bulkPolicy': return setAccessPolicy(selectedFiles());
      case 'paste': return pasteItems();
      default: return undefined;
    }
  }

  function activateEntry(file, opener) {
    if (!file) return;
    if (file.isFolder) {
      if (navigateTo(file.path)) focusListAfterLoad = !!opener;
    } else {
      openDrawer(file.id, opener);
    }
  }

  function downloadOne(file) {
    if (!file || file.isFolder) return;
    window.API.downloadFile(file.path);
    Toast.info('Download requested', file.name);
  }

  function requestZip(items) {
    if (!items.length) return;
    try {
      window.API.downloadZip(items.map(f => f.path));
    } catch (e) {
      Toast.error('ZIP download could not be requested', e.message);
      return;
    }
    Toast.info('ZIP download requested',
      `${items.length} ${items.length === 1 ? 'item' : 'items'}. Your browser shows the file once the server starts sending it.`);
  }

  function anchorPoint(anchor, event) {
    if (event && Number.isFinite(event.clientX) && (event.clientX || event.clientY)) {
      return { x: event.clientX, y: event.clientY };
    }
    if (anchor && anchor.getBoundingClientRect) {
      const r = anchor.getBoundingClientRect();
      return { x: r.left, y: r.bottom + 4 };
    }
    // No pointer and no anchor: a defined position rather than a dereference.
    return { x: Math.round((window.innerWidth || 800) / 2), y: Math.round((window.innerHeight || 600) / 3) };
  }

  function contextItems(file) {
    const items = [];
    if (file.isFolder) {
      items.push(
        { label: 'Open folder', icon: 'folderOpen', action: () => navigateTo(file.path) },
        { label: 'Folder details', icon: 'info', action: () => openDrawer(file.id) },
        { label: 'Download as ZIP', icon: 'archive', action: () => requestZip([file]) },
      );
    } else {
      items.push(
        { label: 'View details', icon: 'eye', action: () => openDrawer(file.id) },
        { label: 'Download', icon: 'download', action: () => downloadOne(file) },
      );
    }
    items.push(
      { label: 'Copy location', icon: 'copy', action: () => copyToClipboard(file.path, 'Location copied') },
      { label: file.starred ? 'Unstar' : 'Star', icon: 'star', action: () => setStars([file], !file.starred) },
      { divider: true },
      { label: 'Rename', icon: 'edit', shortcut: 'F2', action: () => renameItem(file) },
      { label: 'Cut', icon: 'scissors', shortcut: 'Ctrl+X', action: () => cutItems([file]) },
      { label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', action: () => copyItems([file]) },
      { label: 'Access policy…', icon: 'lock', action: () => setAccessPolicy([file]) },
      { label: 'Delete permanently', icon: 'trash', danger: true, shortcut: 'Del', action: () => deleteItems([file]) },
    );
    return items;
  }

  function openContextFor(file, anchor, event) {
    const { x, y } = anchorPoint(anchor, event);
    ContextMenu.show(x, y, contextItems(file));
    focusFirstMenuItem();
  }

  function focusFirstMenuItem() {
    const first = document.querySelector && document.querySelector('.context-menu.is-open [data-cm-action]');
    if (first) first.focus();
  }

  function openTreeContext(path, anchor, event) {
    const items = [{ label: 'New subfolder here', icon: 'folderPlus', action: () => createFolder(path) }];
    if (path !== '/') {
      items.push(
        { divider: true },
        { label: 'Rename folder', icon: 'edit', action: () => handleAction('renameTree', path) },
        { label: 'Delete folder permanently', icon: 'trash', danger: true, action: () => handleAction('deleteTree', path) },
      );
    }
    const { x, y } = anchorPoint(anchor, event);
    ContextMenu.show(x, y, items);
    focusFirstMenuItem();
  }

  /** Toolbar creation targets the displayed folder; tree creation targets its node. */
  async function createFolder(targetPath) {
    const name = await Modal.prompt({
      title: targetPath === state.currentPath ? 'Create folder' : `Create folder in ${esc(baseName(targetPath) || 'All Files')}`,
      label: 'Folder name',
      placeholder: 'e.g. New Project',
      confirmText: 'Create',
    });
    if (!name || !name.trim()) return;
    const folderName = name.trim();
    try {
      await window.API.post('/fs/folder', { path: joinPath(targetPath, folderName) });
    } catch {
      return; // api.js reports the server's reason
    }
    Toast.success('Folder created', joinPath(targetPath, folderName));
    state.expanded.add(targetPath);
    loadTree();
    if (targetPath === state.currentPath) {
      state.selected = new Set();
      loadFiles({ silent: true });
    }
  }

  async function renameItem(file) {
    const newName = await Modal.prompt({
      title: file.isFolder ? 'Rename folder' : 'Rename file',
      label: 'New name',
      value: esc(file.name),
      confirmText: 'Rename',
    });
    if (!newName || !newName.trim() || newName.trim() === file.name) return;
    let res;
    try {
      res = await window.API.put('/fs/rename', { oldPath: file.path, newName: newName.trim() });
    } catch {
      return;
    }
    const newPath = res && res.data ? res.data.newPath : joinPath(parentPath(file.path), newName.trim());
    Toast.success('Renamed', `${file.name} → ${baseName(newPath)}`);
    if (file.isFolder) {
      syncAfterMutation('rename', file.path, newPath);
      loadTree();
    }
    state.selected = new Set();
    await loadFiles({ silent: true });
    return newPath;
  }

  async function deleteItems(items) {
    if (!items.length) return;
    const paths = items.map(i => i.path);
    const copy = deleteConfirmCopy(items);
    const ok = await Modal.confirm({ ...copy, danger: true });
    if (!ok) return;

    let res;
    try {
      res = await window.API.del('/fs/delete', { paths });
    } catch {
      return; // every path failed: api.js shows the reason and nothing was removed
    }
    const summary = summarizeDelete(paths, res && res.data);
    reportDelete(summary, items);

    const deletedFolders = items.filter(i => i.isFolder && summary.deleted.includes(i.path));
    for (const folder of deletedFolders) {
      if (syncAfterMutation('delete', folder.path)) break;
    }
    if (deletedFolders.length) loadTree();
    state.selected = new Set();
    loadFiles({ silent: true });
  }

  function reportDelete(summary, items) {
    const nameOf = p => (items.find(i => i.path === p) || { name: baseName(p) }).name;
    const n = summary.deleted.length;
    if (summary.kind === 'complete') {
      Toast.success(`Deleted ${n} ${n === 1 ? 'item' : 'items'}`, summary.deleted.map(nameOf).join(', '));
      announce(`Deleted ${n} ${n === 1 ? 'item' : 'items'}.`);
      return;
    }
    const failures = summary.failed.map(f => `${nameOf(f.path)}: ${f.error || 'not deleted'}`).join('; ');
    Toast.warning(
      `Deleted ${n} of ${summary.sent} — ${summary.failed.length} not deleted`,
      `Not deleted: ${failures}`,
      12000
    );
    announce(`Deleted ${n} of ${summary.sent}. ${summary.failed.length} could not be deleted.`);
  }

  /* ── cut / copy / paste (cross-directory; rename itself stays same-directory only) ──
     Windows-Explorer-style clipboard. Cut marks items pending a MOVE, grayed
     out, never touching the filesystem by itself; Copy marks items pending a
     DUPLICATE, not grayed out (the original stays fully usable, exactly like
     Explorer). Only one pending op at a time - a new Cut/Copy replaces
     whatever was pending. Paste in any folder is what actually calls
     PUT /fs/move or POST /fs/copy, with destination = the folder being
     viewed. A copy never leaves the clipboard on its own (repeatable paste,
     like Explorer); a cut clears once every item has actually moved. */

  /** Shows/hides the toolbar Paste affordance and keeps its count current. */
  /** "2 items ready to move" - what the clipboard strip says is pending. */
  function clipboardSentence(mode, n) {
    return `${n} ${n === 1 ? 'item' : 'items'} ready to ${mode === 'copy' ? 'copy' : 'move'}`;
  }

  function updatePasteButton() {
    const btn = $('#btnPaste');
    const cancelBtn = $('#btnCancelCut');
    const strip = $('#clipboardStrip');
    const n = state.clipboardPaths.size;
    // Busy means "the clipboard's CURRENT payload is already running". A
    // different payload may well be in flight and must not lock this one out.
    // The mode is normalised the same way startTrackedOperation normalises it, or
    // a cut would never match the key it registered.
    const key = `${state.clipboardMode === 'copy' ? 'copy' : 'move'}|${state.currentPath}|${[...state.clipboardPaths].join(',')}`;
    const inFlight = state.inFlight.has(key);
    if (btn) {
      btn.hidden = n === 0;
      // Disabled, not hidden, while an operation runs: the control stays visible
      // and announces why it cannot be used, instead of vanishing mid-operation.
      btn.disabled = inFlight;
      btn.setAttribute('aria-busy', String(inFlight));
      const countEl = btn.querySelector('.paste-count');
      if (countEl) countEl.textContent = n > 0 ? `(${n})` : '';
    }
    if (cancelBtn) {
      cancelBtn.hidden = n === 0;
      cancelBtn.setAttribute('aria-label', state.clipboardMode === 'copy' ? 'Cancel copy' : 'Cancel move');
    }
    if (strip) {
      strip.hidden = n === 0;
      const text = strip.querySelector('.clipboard-text');
      if (text) text.textContent = n > 0 ? clipboardSentence(state.clipboardMode, n) : '';
    }
    renderClipboardMenu();
  }

  /** Fill the pending-items disclosure; empty it when nothing is queued. */
  function renderClipboardMenu() {
    const menu = $('#clipboardItemsDropdown');
    if (!menu) return;
    const items = state.clipboardItems;
    if (items.length === 0) { menu.innerHTML = ''; return; }
    const verb = state.clipboardMode === 'copy' ? 'copy' : 'move';
    // Every name and path is filesystem-derived: escaped before it reaches markup
    // (rule 10). Rows are informational - no menuitem semantics, no actions.
    menu.innerHTML =
      `<div class="dropdown-label">Ready to ${verb}</div>` +
      items.map(i => `<div class="dropdown-item clipboard-menu-item" title="${esc(i.path)}">` +
        `${icon(i.isFolder ? 'folder' : 'fileText', 14)}<span>${esc(i.name)}</span></div>`).join('');
  }

  /** Open/close the pending-items disclosure and keep its ARIA state truthful. */
  function setClipboardDisclosure(open) {
    const trigger = $('#clipboardTrigger');
    const menu = $('#clipboardItemsDropdown');
    if (!menu) return;
    if (open && state.clipboardPaths.size === 0) return;
    menu.classList.toggle('is-open', open);
    if (trigger) trigger.setAttribute('aria-expanded', String(open));
  }

  /** Mark items pending a clipboard op. Clears whatever was pending before. */
  function markClipboard(mode, items) {
    if (!items.length) return;
    state.clipboardMode = mode;
    state.clipboardPaths = new Set(items.map(i => i.path));
    state.clipboardItems = items.map(i => ({ name: i.name, path: i.path, isFolder: !!i.isFolder }));
    state.selected = new Set();
    renderView();
    updateBulkBar();
    updatePasteButton();
    const n = items.length;
    const verb = mode === 'copy' ? 'copy' : 'move';
    Toast.info(`${n} ${n === 1 ? 'item is' : 'items are'} ready to ${verb}`,
      'Go to a folder and Paste, or press Escape to cancel.');
  }

  function cutItems(items) { markClipboard('cut', items); }
  function copyItems(items) { markClipboard('copy', items); }

  /** @returns {boolean} whether there was a pending clipboard op to cancel */
  function cancelClipboard() {
    if (state.clipboardPaths.size === 0) return false;
    const mode = state.clipboardMode;
    state.clipboardMode = null;
    state.clipboardPaths = new Set();
    state.clipboardItems = [];
    renderView();
    updatePasteButton();
    Toast.info(mode === 'copy' ? 'Copy cancelled' : 'Move cancelled');
    return true;
  }

  /* ── tracked Copy/Move operations ──
     Copy and Move bytes move SERVER-side, so there is nothing on the wire to
     watch: the request that starts them returns as soon as the work is
     registered, and the outcome is read back by id. Everything drawn below is a
     figure the server actually measured - `determinate:false` renders a striped
     bar with NO aria-valuenow rather than inventing a percentage, and an
     unavailable byte total renders as such instead of as 0 B. */

  const TERMINAL_STATES = new Set(['completed', 'partial', 'failed', 'cancelled']);
  /** First interval, and the ceiling the backoff works up to while nothing changes. */
  const OPERATION_POLL_MS = 400;
  const OPERATION_POLL_MAX_MS = 1600;
  /** Consecutive transport failures tolerated before the UI is released anyway. */
  const OPERATION_MAX_POLL_FAILURES = 5;
  /**
   * How long a finished operation's outcome stays on the strip before it is
   * removed. Bounded, not permanent: the result is the thing the operator waited
   * for, but the toolbar must return to normal. Starting another operation
   * cancels the pending removal rather than queueing behind it.
   */
  const OPERATION_RESULT_TTL_MS = 5000;

  /** id -> { toast, timer, interval, failures, lastState, onSettled } */
  const operations = new Map();
  /** Release one payload key, refreshing the control. Idempotent. */
  function releaseInFlight(key) {
    state.inFlight.delete(key);
    updatePasteButton();
  }

  const operationEls = () => ({
    strip: $('#operationStrip'),
    verb: $('#operationVerb'),
    count: $('#operationCount'),
    file: $('#operationFile'),
    bytes: $('#operationBytes'),
    progress: $('#operationProgress'),
    bar: $('#operationBar'),
  });

  function stopOperationPoll(entry) {
    if (entry && entry.timer) clearTimeout(entry.timer);
    if (entry) entry.timer = null;
  }

  /** Pending removal timer for a finished operation's outcome. */
  let stripRemovalTimer = null;

  /** Cancel a pending removal - a new operation reuses the strip immediately. */
  function cancelStripRemoval() {
    if (stripRemovalTimer) clearTimeout(stripRemovalTimer);
    stripRemovalTimer = null;
  }

  /** Drop the progress surface entirely. Safe to call when nothing is running. */
  function clearOperationStrip() {
    cancelStripRemoval();
    const els = operationEls();
    if (els.strip) els.strip.hidden = true;
    if (els.progress) {
      els.progress.removeAttribute('aria-valuenow');
      els.progress.setAttribute('aria-busy', 'false');
    }
    if (els.bar) {
      els.bar.classList.remove('is-striped');
      els.bar.style.removeProperty('--progress');
    }
  }

  /**
   * Paint one status read. Every interpolated value is escaped: the filename and
   * the failure text are filesystem- and server-derived strings.
   */
  function renderOperation(snapshot, kind) {
    const els = operationEls();
    if (!els.strip) return;

    els.strip.hidden = false;
    const verb = kind === 'move' ? 'Moving' : 'Copying';
    const terminal = TERMINAL_STATES.has(snapshot.state);
    if (els.verb) {
      els.verb.textContent = terminal ? verb.replace(/ing$/, 'ed') : verb;
    }
    if (els.count) {
      els.count.textContent = `${snapshot.items.done} of ${snapshot.items.total}`;
    }
    if (els.file) {
      els.file.textContent = snapshot.itemInProgress
        ? snapshot.itemInProgress.name
        : (terminal ? '' : 'Working…');
    }
    if (els.bytes) {
      // An unmeasured total is stated as unavailable. It is never rendered as
      // "0 B / 0 B", which would be a real reading of zero that did not happen.
      els.bytes.textContent = snapshot.bytes.available
        ? `${AFM.Format.bytes(snapshot.bytes.transferred)} / ${AFM.Format.bytes(snapshot.bytes.total)}`
        : 'Size unavailable';
    }

    if (els.progress) {
      els.progress.setAttribute('aria-busy', String(snapshot.state === 'preparing'));
      if (snapshot.determinate && snapshot.percent != null) {
        els.progress.setAttribute('aria-valuenow', String(snapshot.percent));
      } else {
        // No measured percentage: the value is genuinely unknown, so the control
        // reports no value rather than a guess.
        els.progress.removeAttribute('aria-valuenow');
      }
    }
    if (els.bar) {
      if (snapshot.determinate && snapshot.percent != null) {
        els.bar.classList.remove('is-striped');
        els.bar.style.setProperty('--progress', String(snapshot.percent / 100));
      } else {
        els.bar.classList.add('is-striped');
        els.bar.style.setProperty('--progress', '1');
      }
    }
  }

  /** One terminal notification per operation, and only one. */
  function notifyTerminal(entry, snapshot, destination) {
    if (!entry || entry.notified) return;
    entry.notified = true;

    const nameOf = (p) => (entry.items.find((i) => i.path === p) || { name: baseName(p) }).name;
    const verb = entry.kind === 'move' ? 'move' : 'copy';
    const succeeded = snapshot.result && Array.isArray(snapshot.result[entry.kind === 'move' ? 'moved' : 'copied'])
      ? snapshot.result[entry.kind === 'move' ? 'moved' : 'copied']
      : [];
    const n = succeeded.length || snapshot.items.done;
    const failures = snapshot.failures || [];

    if (snapshot.state === 'completed') {
      entry.toast.update({
        type: 'success',
        title: `${entry.kind === 'move' ? 'Moved' : 'Copied'} ${n} ${n === 1 ? 'item' : 'items'}`,
        msg: `to ${destination}`,
      });
      announce(`${entry.kind === 'move' ? 'Moved' : 'Copied'} ${n} ${n === 1 ? 'item' : 'items'} to ${destination}.`);
      return;
    }

    if (snapshot.state === 'cancelled') {
      entry.toast.update({
        type: 'info',
        title: `${entry.kind === 'move' ? 'Move' : 'Copy'} cancelled`,
        msg: `${n} of ${snapshot.items.total} had already finished.`,
      });
      announce('Operation cancelled.');
      return;
    }

    const detail = failures
      .map((f) => `${nameOf(f.path)}: ${f.error || `not ${verb}d`}`)
      .join('; ');

    if (snapshot.state === 'partial') {
      entry.toast.update({
        type: 'warning',
        title: `${entry.kind === 'move' ? 'Moved' : 'Copied'} ${n} of ${snapshot.items.total} — ${failures.length} not ${verb}d`,
        msg: `Not ${verb}d: ${detail}`,
      });
      announce(`${entry.kind === 'move' ? 'Moved' : 'Copied'} ${n} of ${snapshot.items.total}. ${failures.length} failed.`);
      return;
    }

    entry.toast.update({
      type: 'error',
      title: `${entry.kind === 'move' ? 'Move' : 'Copy'} failed`,
      msg: detail || (failures[0] && failures[0].error) || `The items could not be ${verb}d.`,
    });
    announce(`${entry.kind === 'move' ? 'Move' : 'Copy'} failed.`);
  }

  /**
   * Reconcile the page from the operation's terminal result. Uses exactly the
   * data the synchronous contract has always returned, so the async and sync
   * paths cannot disagree about what landed.
   */
  function applyTerminalResult(entry, snapshot, destination) {
    const key = entry.kind === 'move' ? 'moved' : 'copied';
    const done = snapshot.result && Array.isArray(snapshot.result[key]) ? snapshot.result[key] : [];
    const items = entry.items;

    if (entry.kind === 'copy') {
      if (done.length && items.some((i) => i.isFolder)) loadTree();
      loadFiles({ silent: true });
      return;
    }

    const movedFolders = items.filter((i) => i.isFolder && done.some((m) => m.oldPath === i.path));
    for (const folder of movedFolders) {
      const entryMoved = done.find((m) => m.oldPath === folder.path);
      if (entryMoved && syncAfterMutation('rename', entryMoved.oldPath, entryMoved.newPath)) break;
    }
    if (movedFolders.length) loadTree();

    // Only what actually moved comes off the clipboard, so a failed item stays
    // pending and a retry is just "navigate, Paste again".
    const movedPaths = new Set(done.map((m) => m.oldPath));
    if (movedPaths.size) {
      state.clipboardPaths = new Set([...state.clipboardPaths].filter((p) => !movedPaths.has(p)));
      state.clipboardItems = state.clipboardItems.filter((i) => !movedPaths.has(i.path));
      if (state.clipboardPaths.size === 0) state.clipboardMode = null;
      updatePasteButton();
    }

    loadFiles({ silent: true });
  }

  /**
   * Hide the strip once nothing is running, after the result linger.
   *
   * A finished operation keeps its outcome on screen for
   * OPERATION_RESULT_TTL_MS: the result is what the operator waited for, and
   * removing it the instant it lands would be the only on-screen record of what
   * happened to each item. Re-checked at fire time, so an operation started
   * during the linger keeps the strip rather than losing it to a stale timer.
   */
  function scheduleStripRemoval() {
    cancelStripRemoval();
    if (operations.size) return;
    stripRemovalTimer = setTimeout(() => {
      stripRemovalTimer = null;
      if (operations.size) return;
      const els = operationEls();
      if (els.strip) els.strip.hidden = true;
      if (els.progress) {
        els.progress.removeAttribute('aria-valuenow');
        els.progress.setAttribute('aria-busy', 'false');
      }
      if (els.bar) {
        els.bar.classList.remove('is-striped');
        els.bar.style.removeProperty('--progress');
      }
    }, OPERATION_RESULT_TTL_MS);
  }

  /** Release every resource for an operation. Always safe, always idempotent. */
  function finishOperation(id, snapshot) {
    const entry = operations.get(id);
    if (!entry) return;

    stopOperationPoll(entry);
    operations.delete(id);
    // Release THIS operation's guard on every exit path. Leaving the key set
    // would disable Paste permanently after the first operation - the "stuck
    // loading" failure this tracking exists to prevent. Clearing the whole set
    // here instead would wrongly unblock a different operation still running.
    releaseInFlight(entry.key);

    if (snapshot) {
      notifyTerminal(entry, snapshot, entry.destination);
      applyTerminalResult(entry, snapshot, entry.destination);
    } else {
      // The operation became unreadable (restart, eviction, or a foreign id).
      // The UI must still reach a terminal state - it is never left "in progress".
      if (entry.toast && entry.toast.update) {
        entry.toast.update({
          type: 'warning',
          title: `${entry.kind === 'move' ? 'Move' : 'Copy'} status lost`,
          msg: 'The server no longer has this operation. Refresh to see what landed.',
        });
      }
    }

    // The strip is shared: once nothing is running, the outcome lingers briefly
    // and is then removed (or immediately, if a new operation takes it over).
    if (!operations.size) scheduleStripRemoval();
    updatePasteButton();
  }

  function scheduleNextPoll(entry, snapshot) {
    // Back off while nothing changes, and never past the ceiling: an operation
    // that takes minutes must not turn into a request flood.
    entry.interval = snapshot && entry.lastState === snapshot.state
      ? Math.min(entry.interval * 2, OPERATION_POLL_MAX_MS)
      : OPERATION_POLL_MS;
    entry.timer = setTimeout(() => pollOperation(entry.id), entry.interval);
  }

  async function pollOperation(id) {
    const entry = operations.get(id);
    if (!entry) return;

    let snapshot;
    try {
      snapshot = await window.API.getOperation(id);
      entry.failures = 0;
    } catch (error) {
      entry.failures += 1;
      const status = error && error.status;
      // 404 means unknown, expired, or someone else's: stop tracking rather than
      // poll forever. Anything else is transport noise and is retried, but only
      // for so long - the UI is never left loading indefinitely.
      if (status === 404 || entry.failures >= OPERATION_MAX_POLL_FAILURES) {
        finishOperation(id, null);
        return;
      }
      scheduleNextPoll(entry, entry.lastState);
      return;
    }

    if (!operations.has(id)) return;

    entry.lastState = snapshot.state;
    renderOperation(snapshot, entry.kind);

    if (TERMINAL_STATES.has(snapshot.state)) {
      finishOperation(id, snapshot);
      return;
    }
    scheduleNextPoll(entry, snapshot);
  }

  /**
   * @returns {boolean} false when THIS payload is already in flight - the guard
   *   that stops a double activation from firing two identical operations and
   *   reporting the second one's 409 as a failure. Keyed on the payload, not on
   *   "is anything running": a deliberate second operation into a different
   *   folder is a real, separate operation and must be allowed to run alongside.
   */
  async function startTrackedOperation(kind, items, destination) {
    const paths = items.map((i) => i.path);
    const verb = kind === 'move' ? 'Move' : 'Copy';
    const key = `${kind}|${destination}|${paths.join(',')}`;

    if (state.inFlight.has(key)) return false;
    cancelStripRemoval(); // this operation reuses the strip now, not after the last one's linger
    state.inFlight.add(key);
    updatePasteButton();

    let operationId;
    try {
      operationId = await window.API.startOperation(kind, { paths, destination });
    } catch (error) {
      // Refused before any operation existed: the server's own reason (a 409 name
      // collision, an invalid destination), not a transport failure.
      releaseInFlight(key);
      Toast.error(`${verb} failed`, (error && error.message) || `The item could not be ${kind === 'copy' ? 'copied' : 'moved'}.`);
      return false;
    }

    if (!operationId) {
      releaseInFlight(key);
      Toast.error(`${verb} could not start`, 'The server did not return an operation to track.');
      return false;
    }

    // Exactly one toast per operation. Its handle is what the terminal
    // notification retargets, so a start and its outcome never appear as a pair.
    const toast = Toast.info(`${verb} started`, `${items.length} ${items.length === 1 ? 'item' : 'items'} to ${destination}`);
    const entry = {
      id: operationId, kind, items, destination, toast, key,
      timer: null, interval: OPERATION_POLL_MS, failures: 0,
      lastState: null, notified: false,
    };
    operations.set(operationId, entry);

    renderOperation({
      state: 'preparing', determinate: false, percent: null,
      itemInProgress: null,
      items: { done: 0, total: items.length, failed: 0 },
      bytes: { available: false, transferred: null, total: null },
      failures: [],
    }, kind);

    announce(`${verb} started: ${items.length} ${items.length === 1 ? 'item' : 'items'}.`);
    pollOperation(operationId);
    return true;
  }

  /** Paste the pending clipboard op (cut or copy) into the currently displayed folder. */
  async function pasteItems() {
    if (state.clipboardPaths.size === 0) return;
    const mode = state.clipboardMode;
    const items = state.clipboardItems;
    const destination = state.currentPath;

    // Guard: a repeat of THIS payload while it is already running must not fire
    // a second identical operation. Its 409 collision would otherwise read as a
    // failure. Keyed on the payload, so a different folder is still allowed.
    const key = `${mode === 'copy' ? 'copy' : 'move'}|${destination}|${[...state.clipboardPaths].join(',')}`;
    if (state.inFlight.has(key)) return;

    if (mode === 'cut' && items.every(i => parentPath(i.path) === destination)) {
      // Nothing would actually move - say so instead of firing a no-op request.
      // Copy has no such case: pasting a copy into its own folder is a real
      // name collision, not a no-op, so it is left to the server to refuse.
      const here = destination === '/' ? 'the storage root' : destination;
      Toast.info('Already there', `${items.length === 1 ? 'It is' : 'They are'} already in ${here}.`);
      return;
    }

    await startTrackedOperation(mode === 'copy' ? 'copy' : 'move', items, destination);
  }

  /* ── access policy (admin-only; reuses PUT /admin/files/policy from the Admin page) ── */

  const ACCESS_MODES = [
    { value: 'restricted', label: 'Restricted' },
    { value: 'authenticated', label: 'Signed-in users' },
    { value: 'public', label: 'Public' },
  ];

  /**
   * Modal: set the file-access policy for one or more paths. No new endpoint -
   * this goes through window.API to the same PUT /admin/files/policy the
   * Admin page uses (AGENTS.md rule 8). Admin-only on the server; this page
   * shows the action to everyone and lets a 403 fail gracefully, the same
   * "always show, handle 403" pattern the Admin nav link itself already
   * follows rather than a second, client-side role gate.
   */
  function pickAccessPolicy(items) {
    return new Promise(resolve => {
      const count = items.length;
      const title = count === 1 ? `Access policy — ${esc(items[0].name)}` : `Access policy — ${count} items`;
      const backdrop = el('div', { class: 'modal-backdrop' }, `
        <div class="modal modal-sm" role="dialog" aria-modal="true" aria-labelledby="policyModalTitle">
          <div class="modal-header">
            <div>
              <div class="modal-title" id="policyModalTitle">${title}</div>
              <div class="modal-subtitle">Administrator only. Applies to the file portal, never to this
                app; a folder's policy covers everything inside it.</div>
            </div>
            <button class="btn-icon btn-icon-sm" data-act="cancel" aria-label="Cancel">${icon('x', 15)}</button>
          </div>
          <div class="modal-body">
            <div class="field">
              <label class="field-label" for="policyAccessMode">Access mode</label>
              <select class="input" id="policyAccessMode">
                ${ACCESS_MODES.map(m => `<option value="${m.value}">${m.label}</option>`).join('')}
              </select>
            </div>
            <div class="field admin-switch-field">
              <label class="admin-switch-label">
                <span class="switch">
                  <input type="checkbox" id="policyPublished">
                  <span class="track" aria-hidden="true"></span>
                </span>
                <span>Published</span>
              </label>
            </div>
            <div class="field admin-switch-field">
              <label class="admin-switch-label">
                <span class="switch">
                  <input type="checkbox" id="policyLocked">
                  <span class="track" aria-hidden="true"></span>
                </span>
                <span>Show locked to visitors</span>
              </label>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-sm" data-act="cancel">Cancel</button>
            <button class="btn btn-primary btn-sm" data-act="ok">Save policy</button>
          </div>
        </div>
      `);

      document.body.appendChild(backdrop);
      requestAnimationFrame(() => Modal.open(backdrop));

      const modeSelect = backdrop.querySelector('#policyAccessMode');
      const publishedBox = backdrop.querySelector('#policyPublished');
      const lockedBox = backdrop.querySelector('#policyLocked');

      const finish = val => {
        Modal.close(backdrop);
        setTimeout(() => backdrop.remove(), 300);
        resolve(val);
      };

      backdrop.querySelector('[data-act="ok"]').onclick = () => finish({
        accessMode: modeSelect.value,
        isPublished: publishedBox.checked,
        isLocked: lockedBox.checked,
      });
      backdrop.querySelectorAll('[data-act="cancel"]').forEach(b => b.onclick = () => finish(null));
      backdrop.addEventListener('click', e => { if (e.target === backdrop) finish(null); });

      // Prefill from the current policy when editing a single item - a bulk
      // apply to several items has no single "current" to show, so it starts
      // from the form's own defaults instead.
      if (count === 1) {
        window.API.get(`/admin/files/policy?path=${encodeURIComponent(items[0].path)}`, { silent: true })
          .then(policy => {
            if (!policy) return;
            modeSelect.value = policy.access_mode || 'restricted';
            publishedBox.checked = policy.is_published === 1;
            lockedBox.checked = policy.is_locked === 1;
          })
          .catch(() => { /* no existing policy, or not an admin - the form's defaults stand */ });
      }
    });
  }

  async function setAccessPolicy(items) {
    if (!items.length) return;
    const payload = await pickAccessPolicy(items);
    if (!payload) return;

    const results = await Promise.allSettled(items.map(f => window.API.put('/admin/files/policy', {
      path: f.path,
      isDirectory: !!f.isFolder,
      ...payload,
    }, { silent: true })));

    let saved = 0;
    const failed = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') saved++;
      else failed.push(`${items[i].name}: ${(r.reason && r.reason.message) || 'not saved'}`);
    });

    if (failed.length === 0) {
      Toast.success(`Access policy saved for ${saved} ${saved === 1 ? 'item' : 'items'}`);
    } else if (saved === 0) {
      Toast.error('Access policy was not saved', failed[0]);
    } else {
      Toast.warning(`Saved ${saved} of ${items.length}`, `Not saved: ${failed.join('; ')}`, 12000);
    }
  }

  /**
   * Star or unstar. The new state is shown at once, then replaced by what the
   * server actually stored; a failed request restores the previous value.
   */
  async function setStars(items, target) {
    if (!items.length) return;
    const previous = new Map(items.map(f => [f.path, !!f.starred]));
    for (const f of items) f.starred = target;
    refreshAfterStar();

    const results = await Promise.allSettled(items.map(f =>
      window.API.post('/fs/star', { path: f.path, starred: target })));

    let stored = 0;
    const failed = [];
    results.forEach((r, i) => {
      const f = items[i];
      if (r.status === 'fulfilled' && r.value && r.value.data && typeof r.value.data.starred === 'boolean') {
        f.starred = r.value.data.starred;
        stored++;
      } else {
        f.starred = previous.get(f.path);
        failed.push(f.name);
      }
    });
    refreshAfterStar();

    const verb = target ? 'Starred' : 'Unstarred';
    if (failed.length === 0) Toast.success(`${verb} ${stored} ${stored === 1 ? 'item' : 'items'}`);
    else Toast.warning(`${verb} ${stored} of ${items.length}`, `Unchanged: ${failed.join(', ')}`);
    if (state.starredOnly) loadFiles({ silent: true });
  }

  function refreshAfterStar() {
    renderView();
    if (drawerFileId) {
      const file = state.files.find(f => f.id === drawerFileId);
      if (file) fillDrawer(file);
    }
  }

  /* ── bulk download ── */

  function openBulkDownloadMenu(anchor) {
    const items = selectedFiles();
    if (!items.length) return;
    const files = items.filter(f => !f.isFolder);
    const folders = items.length - files.length;
    const { x, y } = anchorPoint(anchor);
    ContextMenu.show(x, y - 8, [
      {
        label: `Download ${items.length} ${items.length === 1 ? 'item' : 'items'} as ZIP`,
        icon: 'archive',
        action: () => { requestZip(items); clearSelection(); },
      },
      {
        label: folders ? `Download ${files.length} files individually (folders need ZIP)` : `Download ${files.length} files individually`,
        icon: 'file',
        action: () => {
          if (!files.length) {
            Toast.warning('Folders can only be downloaded as a ZIP',
              `${folders} selected ${folders === 1 ? 'folder' : 'folders'}: choose “Download as ZIP” to include ${folders === 1 ? 'it' : 'them'}.`);
            return;
          }
          window.API.downloadMultipleFiles(files.map(f => f.path));
          Toast.info('Downloads requested',
            `${files.length} ${files.length === 1 ? 'file' : 'files'}` +
            (folders ? `. ${folders} ${folders === 1 ? 'folder was' : 'folders were'} excluded — use “Download as ZIP” to include folders.` : '.'));
          clearSelection();
        },
      },
    ]);
    focusFirstMenuItem();
  }

  /* ══════════════════════════════════════════
     DRAWER (modal dialog)
     ══════════════════════════════════════════ */

  function isDrawerOpen() {
    const drawer = $('#fileDrawer');
    return !!drawer && drawer.classList.contains('is-open');
  }

  function fillDrawer(file) {
    const drawer = $('#fileDrawer');
    if (!drawer) return;
    const body = drawer.querySelector('.drawer-body');
    const footer = drawer.querySelector('.drawer-footer');
    const title = drawer.querySelector('#drawerTitle');
    if (title) title.textContent = file.isFolder ? 'Folder details' : 'File details';
    if (body) body.innerHTML = renderDrawerHtml(file);
    if (footer) footer.innerHTML = renderDrawerFooterHtml(file);
  }

  /** The bulk bar lives in the command bar inside .app-shell, so the shell covers it. */
  function setBackgroundInert(on) {
    const shell = $('.app-shell');
    if (!shell) return;
    if (on) shell.setAttribute('inert', '');
    else shell.removeAttribute('inert');
  }

  function openDrawer(id, opener) {
    const file = state.files.find(f => f.id === id);
    const drawer = $('#fileDrawer');
    if (!file || !drawer) return;

    fillDrawer(file);
    if (!isDrawerOpen()) drawerOpener = opener || document.activeElement || null;
    drawerFileId = id;

    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    const backdrop = $('#drawerBackdrop');
    if (backdrop) {
      backdrop.hidden = false;
      backdrop.classList.add('is-open');
    }
    setBackgroundInert(true);
    const close = drawer.querySelector('#drawerClose');
    if (close) close.focus();
    else if (drawer.focus) drawer.focus();
  }

  function closeDrawer() {
    const drawer = $('#fileDrawer');
    if (!drawer || !isDrawerOpen()) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    const backdrop = $('#drawerBackdrop');
    if (backdrop) {
      backdrop.hidden = true;
      backdrop.classList.remove('is-open');
    }
    setBackgroundInert(false);

    const fileId = drawerFileId;
    drawerFileId = null;
    const opener = drawerOpener;
    drawerOpener = null;
    if (opener && opener.isConnected !== false && document.contains && document.contains(opener)) opener.focus();
    else if (fileId) focusEntry(fileId);
  }

  function trapDrawerFocus(e) {
    trapFocusIn($('#fileDrawer'), e);
  }

  function trapFocusIn(container, e) {
    if (e.key !== 'Tab' || !container) return;
    const focusables = Array.from(container.querySelectorAll('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])'));
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /**
   * Escape closes ONLY the topmost layer. Registered in the capture phase so it
   * runs before app.js's global Escape (which closes modals): if a confirm,
   * menu or dropdown is open above the drawer, that layer is the one dismissed.
   * A pending clipboard op (Cut or Copy, no modal or drawer involved) is the
   * lowest-priority layer - Escape cancels it only once nothing else above it
   * needs closing, matching Windows Explorer (Esc drops a pending clipboard op).
   */
  function onEscape(e) {
    if (e.key !== 'Escape') return;
    const q = sel => document.querySelector && document.querySelector(sel);
    if (q('.modal-backdrop.is-open') || q('.context-menu.is-open') || q('.dropdown-menu.is-open')) return;
    if (isDrawerOpen()) return closeDrawer();
    if (isTreeSheetOpen()) return closeTreeSheet();
    if (state.selected.size > 0) return clearSelection();
    cancelClipboard();
  }

  /* ── folder tree as a sheet (below 1024px; the button is hidden above) ── */

  /** Everything behind the sheet; the sheet itself lives inside .app-shell. */
  const SHEET_BACKGROUND = ['.sidebar', '.topbar', '.files-header', '#filesToolbar', '#filterChips', '#filesContainer'];
  let treeSheetOpener = null;

  function isTreeSheetOpen() {
    const panel = $('#treePanel');
    return !!panel && panel.classList.contains('is-sheet-open');
  }

  function setSheetBackgroundInert(on) {
    for (const sel of SHEET_BACKGROUND) {
      const node = $(sel);
      if (!node) continue;
      if (on) node.setAttribute('inert', '');
      else node.removeAttribute('inert');
    }
  }

  function openTreeSheet() {
    const panel = $('#treePanel');
    if (!panel || isTreeSheetOpen()) return;
    treeSheetOpener = $('#btnTreeSheet');
    panel.classList.add('is-sheet-open');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    const backdrop = $('#treeSheetBackdrop');
    if (backdrop) backdrop.hidden = false;
    if (treeSheetOpener) treeSheetOpener.setAttribute('aria-expanded', 'true');
    setSheetBackgroundInert(true);
    const current = panel.querySelector('[aria-current="page"]') || panel.querySelector('[role="treeitem"]');
    if (current && current.focus) current.focus();
  }

  function closeTreeSheet() {
    const panel = $('#treePanel');
    if (!panel || !isTreeSheetOpen()) return;
    panel.classList.remove('is-sheet-open');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    const backdrop = $('#treeSheetBackdrop');
    if (backdrop) backdrop.hidden = true;
    setSheetBackgroundInert(false);
    const opener = treeSheetOpener;
    treeSheetOpener = null;
    if (opener) {
      opener.setAttribute('aria-expanded', 'false');
      if (opener.focus) opener.focus();
    }
  }

  /** Below 768px the selection's secondary actions are one menu. */
  function openBulkMoreMenu(anchor) {
    const items = selectedFiles();
    if (!items.length) return;
    const { x, y } = anchorPoint(anchor);
    ContextMenu.show(x, y, [
      { label: 'Move', icon: 'move', action: () => handleAction('bulkMove') },
      { label: 'Copy', icon: 'copy', action: () => handleAction('bulkCopy') },
      { label: items.every(f => f.starred) ? 'Unstar' : 'Star', icon: 'star', action: () => handleAction('bulkStar') },
      { label: 'Access policy…', icon: 'lock', action: () => handleAction('bulkPolicy') },
    ]);
    focusFirstMenuItem();
  }

  /**
   * Ctrl+V / Cmd+V pastes the pending clipboard op (cut or copy) into the
   * currently displayed folder, from anywhere on the page - not just a
   * focused row - mirroring Explorer, where Paste does not require anything
   * to be selected first. Skipped while typing in an editable field, where
   * Ctrl+V means paste text.
   */
  function onPasteShortcut(e) {
    if (e.key !== 'v' && e.key !== 'V') return;
    if (!e.ctrlKey && !e.metaKey) return;
    const tag = (e.target && e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (state.clipboardPaths.size === 0) return;
    e.preventDefault();
    pasteItems();
  }

  function onDrawerClick(e) {
    const btn = e.target.closest && e.target.closest('[data-drawer-act]');
    if (!btn) return;
    const file = state.files.find(f => f.id === drawerFileId);
    const act = btn.getAttribute('data-drawer-act');
    if (act === 'close') return closeDrawer();
    if (!file) return;
    if (act === 'download') downloadOne(file);
    else if (act === 'star') setStars([file], !file.starred);
    else if (act === 'copy-path') copyToClipboard(file.path, 'Location copied');
    else if (act === 'open') { closeDrawer(); navigateTo(file.path); }
    else if (act === 'open-parent') { closeDrawer(); navigateTo(parentPath(file.path)); }
    else if (act === 'rename') renameFromDrawer(file);
    else if (act === 'move') { closeDrawer(); cutItems([file]); }
    else if (act === 'delete') { closeDrawer(); deleteItems([file]); }
  }

  /** Same prompt and reporting as the row menu; the open drawer follows the new name. */
  async function renameFromDrawer(file) {
    const newPath = await renameItem(file);
    if (!newPath || !isDrawerOpen() || drawerFileId !== file.id) return;
    const renamed = state.files.find(f => f.path === newPath) ||
      Object.assign({}, file, { id: newPath, path: newPath, name: baseName(newPath) });
    drawerFileId = renamed.id;
    fillDrawer(renamed);
  }

  /* ══════════════════════════════════════════
     UPLOADS
     ══════════════════════════════════════════ */

  /**
   * Upload jobs one at a time. Multipart field order matters: `destination` and
   * `overwrite` go BEFORE `file` (see docs/CONTRACTS.md "POST /api/fs/upload").
   * The server also tolerates the other order now, but the client never relies on it.
   */
  async function runUploads(jobs, opts = {}) {
    if (!jobs.length) return;
    uploads.push(...jobs);
    renderUploadTray();
    Toast.info('Upload started', `${jobs.length} ${jobs.length === 1 ? 'file' : 'files'} to ${jobs[0].destination}`);

    for (const job of jobs) {
      if (job.status === 'cancelled') continue;
      job.status = 'uploading';
      renderUploadTray();
      const form = new FormData();
      form.append('destination', job.destination);
      form.append('overwrite', 'false');
      form.append('file', job.file, job.file.name);
      const { promise, abort } = window.API.upload('/fs/upload', form, (loaded, total) => {
        job.loaded = loaded;
        job.total = total;
        updateUploadRow(job);
      });
      job.abort = abort;
      try {
        const res = await promise;
        job.status = 'done';
        job.writtenPath = res && res.data ? res.data.path : joinPath(job.destination, job.file.name);
      } catch (e) {
        job.status = job.cancelRequested ? 'cancelled' : 'failed';
        job.error = e && e.message;
      }
      job.abort = null;
      renderUploadTray();
    }
    reportUploads(jobs, opts);
  }

  function reportUploads(jobs, { createdFolders = 0 } = {}) {
    const done = jobs.filter(j => j.status === 'done');
    const failed = jobs.filter(j => j.status === 'failed');
    const cancelled = jobs.filter(j => j.status === 'cancelled');

    if (done.length) Toast.success('Upload complete', `${done.length} of ${jobs.length} ${jobs.length === 1 ? 'file' : 'files'} uploaded.`);
    if (failed.length) {
      Toast.error(`${failed.length} ${failed.length === 1 ? 'upload' : 'uploads'} failed`,
        failed.map(j => `${j.file.name}: ${j.error || 'failed'}`).join('; '), 12000);
    }
    if (cancelled.length) Toast.info('Cancelled', cancelled.map(j => j.file.name).join(', '));
    announce(`Uploads finished: ${done.length} uploaded, ${failed.length} failed, ${cancelled.length} cancelled.`);

    // Refresh the folder(s) actually written to, from the paths the server reported.
    const written = new Set(done.map(j => parentPath(j.writtenPath)));
    if (written.has(state.currentPath) || createdFolders > 0) {
      state.selected = new Set();
      loadFiles({ silent: true });
    }
    const elsewhere = [...written].filter(p => !isSameOrInside(p, state.currentPath));
    if (elsewhere.length) Toast.info('Uploaded to another folder', elsewhere.join(', '));
    if (createdFolders > 0) loadTree();
  }

  function uploadRowHtml(job, index) {
    const pct = job.total ? Math.round((job.loaded / job.total) * 100) : 0;
    const status = {
      queued: 'Waiting',
      uploading: `${pct}%`,
      done: 'Uploaded',
      failed: `Failed: ${job.error || 'unknown error'}`,
      cancelled: 'Cancelled',
    }[job.status];
    const cancellable = job.status === 'queued' || job.status === 'uploading';
    return `
      <li class="upload-row is-${job.status}" data-upload-row="${index}">
        <div class="upload-row-head">
          <span class="upload-name" title="${esc(job.destination)}">${esc(job.file.name)}</span>
          <span class="upload-status">${esc(status)}</span>
          ${cancellable ? `<button type="button" class="btn-icon btn-icon-sm" data-upload-cancel="${index}" aria-label="Cancel upload of ${esc(job.file.name)}">${icon('x', 13)}</button>` : ''}
        </div>
        <progress max="100" value="${job.status === 'done' ? 100 : pct}" aria-label="${esc(job.file.name)} progress"></progress>
      </li>`;
  }

  function renderUploadTray() {
    const tray = $('#uploadTray');
    if (!tray) return;
    const list = tray.querySelector('.upload-list');
    tray.hidden = uploads.length === 0;
    if (list) list.innerHTML = uploads.map(uploadRowHtml).join('');
    const active = uploads.filter(j => j.status === 'queued' || j.status === 'uploading').length;
    const summary = tray.querySelector('.upload-summary');
    if (summary) summary.textContent = active ? `Uploading ${active} of ${uploads.length}` : `${uploads.length} finished`;
    const dismiss = tray.querySelector('[data-upload-dismiss]');
    if (dismiss) dismiss.hidden = active > 0;
  }

  function updateUploadRow(job) {
    const tray = $('#uploadTray');
    const index = uploads.indexOf(job);
    if (!tray || index < 0) return;
    const row = tray.querySelector(`[data-upload-row="${index}"]`);
    if (!row) return;
    const pct = job.total ? Math.round((job.loaded / job.total) * 100) : 0;
    const bar = row.querySelector('progress');
    if (bar) bar.value = pct;
    const status = row.querySelector('.upload-status');
    if (status) status.textContent = `${pct}%`;
  }

  function cancelUpload(index) {
    const job = uploads[index];
    if (!job) return;
    job.cancelRequested = true;
    if (job.status === 'queued') job.status = 'cancelled';
    if (job.abort) job.abort();
    renderUploadTray();
  }

  function jobsFromFiles(fileList, destination) {
    return Array.from(fileList || []).map(file => ({ file, destination, status: 'queued', loaded: 0, total: file.size }));
  }

  /** Read every entry of a dropped directory (readEntries returns batches). */
  function readAllEntries(dirEntry) {
    return new Promise((resolve) => {
      const reader = dirEntry.createReader();
      const all = [];
      const next = () => reader.readEntries(batch => {
        if (!batch.length) return resolve(all);
        all.push(...batch);
        next();
      }, () => resolve(all));
      next();
    });
  }

  function fileOf(entry) {
    return new Promise((resolve) => entry.file(resolve, () => resolve(null)));
  }

  /**
   * A dropped directory is uploaded with its structure: each folder is created
   * explicitly (POST /fs/folder) before its files are uploaded into it.
   * @returns {Promise<{ jobs: object[], createdFolders: number }>}
   */
  async function jobsFromEntries(entries, destination) {
    const jobs = [];
    let createdFolders = 0;
    async function walk(entry, dir, isTop) {
      if (entry.isFile) {
        const file = await fileOf(entry);
        if (file) jobs.push({ file, destination: dir, status: 'queued', loaded: 0, total: file.size });
        return;
      }
      if (!entry.isDirectory) return;
      const folderPath = joinPath(dir, entry.name);
      // A dropped folder whose name is already a folder here is merged into it;
      // uploads never overwrite (overwrite=false), so nothing existing is lost.
      const exists = isTop && state.files.some(f => f.isFolder && f.name === entry.name);
      if (!exists) {
        try {
          await window.API.post('/fs/folder', { path: folderPath });
          createdFolders++;
        } catch {
          return; // api.js reported why; this folder's files have nowhere to go
        }
      }
      for (const child of await readAllEntries(entry)) await walk(child, folderPath, false);
    }
    for (const entry of entries) await walk(entry, destination, true);
    return { jobs, createdFolders };
  }

  async function handleDrop(dataTransfer) {
    if (!dataTransfer) return;
    const entries = Array.from(dataTransfer.items || [])
      .map(i => (i.kind === 'file' && typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null))
      .filter(Boolean);
    const destination = state.currentPath;

    if (!entries.some(e => e.isDirectory)) {
      // An empty drop does nothing and says nothing.
      await runUploads(jobsFromFiles(dataTransfer.files, destination));
      return;
    }
    const { jobs, createdFolders } = await jobsFromEntries(entries, destination);
    if (jobs.length) await runUploads(jobs, { createdFolders });
    else if (createdFolders) {
      Toast.success('Folders created', `${createdFolders} empty ${createdFolders === 1 ? 'folder' : 'folders'}`);
      loadTree();
      loadFiles({ silent: true });
    }
  }

  /* ══════════════════════════════════════════
     EVENT WIRING (bound once)
     ══════════════════════════════════════════ */

  function toggleSort(key) {
    if (!SORT_LABELS[key]) return;
    if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
    else state.sort = { key, dir: SORT_DEFAULT_DIR[key] };
    state.page = 1;
    loadFiles();
  }

  function setFilter(key) {
    if (!TYPE_CHIPS.some(c => c.key === key) || key === state.filter) return;
    state.filter = key;
    state.page = 1;
    renderChips();
    loadFiles();
  }

  function setPage(p) {
    const total = pageCount(state.total, state.perPage);
    let next = state.page;
    if (p === 'prev') next = state.page - 1;
    else if (p === 'next') next = state.page + 1;
    else next = parseInt(p, 10);
    if (!Number.isFinite(next)) return;
    next = Math.min(Math.max(1, next), total);
    if (next === state.page) return;
    state.page = next;
    loadFiles();
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearSearchAndFilter(what) {
    if (what === 'search' || what === 'all') {
      cancelPendingSearch();
      state.search = '';
      syncSearchInput();
    }
    if (what === 'filter' || what === 'all' || (what === 'search' && state.filter !== 'all')) state.filter = 'all';
    state.page = 1;
    renderChips();
    loadFiles();
  }

  function onContainerClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;

    const retry = t.closest('[data-retry]');
    if (retry) return retry.getAttribute('data-retry') === 'tree' ? loadTree() : loadFiles();

    const clear = t.closest('[data-clear]');
    if (clear) return clearSearchAndFilter(clear.getAttribute('data-clear'));

    const emptyAct = t.closest('[data-empty-act]');
    if (emptyAct) {
      if (emptyAct.getAttribute('data-empty-act') === 'upload') openFilePicker();
      else handleAction('newFolder', state.currentPath);
      return undefined;
    }

    const sortBtn = t.closest('[data-sort]');
    if (sortBtn) return toggleSort(sortBtn.getAttribute('data-sort'));

    // Scoped to the pagination buttons: a bare [data-page] also matches <body data-page="files">.
    const pageBtn = t.closest('.page-btn[data-page]');
    if (pageBtn) return pageBtn.disabled ? undefined : setPage(pageBtn.getAttribute('data-page'));

    const actBtn = t.closest('[data-act]');
    if (actBtn) {
      e.stopPropagation();
      return handleAction(actBtn.getAttribute('data-act'), actBtn.getAttribute('data-id'), { anchor: actBtn, event: e });
    }

    // The checkbox handles itself through `change`; clicking it must not also open the entry.
    if (t.closest('label.checkbox, input[type="checkbox"]')) return undefined;

    const entry = t.closest('[data-entry]');
    if (entry) {
      const file = state.files.find(f => f.id === entry.getAttribute('data-id'));
      return activateEntry(file, entry);
    }
    return undefined;
  }

  function onContainerChange(e) {
    const t = e.target;
    if (!t) return;
    if (t.id === 'selectAll') return selectAllOnPage(!!t.checked);
    if (t.id === 'perPageSelect') {
      const n = parseInt(t.value, 10);
      if (!PAGE_SIZES.includes(n)) return undefined;
      state.perPage = n;
      Store.set('files-per-page', n);
      state.page = 1;
      return loadFiles();
    }
    if (t.hasAttribute && t.hasAttribute('data-check')) return setSelected(t.getAttribute('data-check'), !!t.checked);
    return undefined;
  }

  function gridColumns(entries) {
    if (state.view !== 'grid' || entries.length < 2 || !entries[0].getBoundingClientRect) return 1;
    const top = entries[0].getBoundingClientRect().top;
    const cols = entries.findIndex(el => el.getBoundingClientRect().top !== top);
    return cols > 0 ? cols : entries.length;
  }

  /* ── column resizing ── */

  let widthSheet = null;
  let resizeDrag = null;

  function applyColumnWidths() {
    if (!document.createElement || !document.head) return;
    if (!widthSheet) {
      widthSheet = document.createElement('style');
      widthSheet.id = 'filesColumnWidths';
      document.head.appendChild(widthSheet);
    }
    widthSheet.textContent = columnWidthsCss(state.colWidths);
  }

  function syncResizerValue(key) {
    const handle = document.querySelector && document.querySelector(`[data-resize="${key}"]`);
    if (!handle) return;
    const w = columnWidth(state.colWidths, key);
    if (w == null) {
      handle.removeAttribute('aria-valuenow');
      handle.setAttribute('aria-valuetext', 'Fills the remaining width');
    } else {
      handle.removeAttribute('aria-valuetext');
      handle.setAttribute('aria-valuenow', String(w));
    }
  }

  function setColumnWidth(key, width, { persist = true } = {}) {
    const w = clampColumnWidth(key, width);
    if (w === null || !isResizable(key)) return;
    state.colWidths = { ...state.colWidths, [key]: w };
    applyColumnWidths();
    syncResizerValue(key);
    if (persist) Store.set(COLUMN_STORE_KEY, state.colWidths);
  }

  function resetColumnWidth(key) {
    if (!isResizable(key)) return;
    const next = { ...state.colWidths };
    delete next[key];
    state.colWidths = next;
    applyColumnWidths();
    syncResizerValue(key);
    Store.set(COLUMN_STORE_KEY, state.colWidths);
  }

  /** The rendered width, for a column whose width is "fill" until first resized. */
  function measuredWidth(handle, key) {
    const th = handle && handle.closest ? handle.closest('th') : null;
    const rect = th && th.getBoundingClientRect ? th.getBoundingClientRect() : null;
    return rect && rect.width ? rect.width : (columnWidth(state.colWidths, key) || NAME_FILL_MIN);
  }

  function onResizePointerDown(e) {
    const handle = e.target && e.target.closest ? e.target.closest('[data-resize]') : null;
    if (!handle || (e.button !== undefined && e.button !== 0)) return;
    e.preventDefault();
    e.stopPropagation();
    const key = handle.getAttribute('data-resize');
    resizeDrag = { key, handle, startX: e.clientX, start: measuredWidth(handle, key) };
    if (handle.setPointerCapture && e.pointerId !== undefined) handle.setPointerCapture(e.pointerId);
    handle.classList.add('is-dragging');
    handle.addEventListener('pointermove', onResizePointerMove);
    handle.addEventListener('pointerup', onResizePointerEnd);
    handle.addEventListener('pointercancel', onResizePointerEnd);
  }

  function onResizePointerMove(e) {
    if (!resizeDrag) return;
    setColumnWidth(resizeDrag.key, resizeDrag.start + (e.clientX - resizeDrag.startX), { persist: false });
  }

  function onResizePointerEnd() {
    if (!resizeDrag) return;
    const { handle } = resizeDrag;
    handle.classList.remove('is-dragging');
    handle.removeEventListener('pointermove', onResizePointerMove);
    handle.removeEventListener('pointerup', onResizePointerEnd);
    handle.removeEventListener('pointercancel', onResizePointerEnd);
    resizeDrag = null;
    Store.set(COLUMN_STORE_KEY, state.colWidths);
  }

  function onResizeKeydown(e, handle) {
    const key = handle.getAttribute('data-resize');
    const step = e.shiftKey ? COLUMN_STEP * 4 : COLUMN_STEP;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      setColumnWidth(key, measuredWidth(handle, key) + (e.key === 'ArrowRight' ? step : -step));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      e.stopPropagation();
      resetColumnWidth(key);
    }
  }

  /* ── tree panel resizing (drag the divider between the folder tree and the files container) ──
     Same approach as column widths: one <style> element, never an inline style. */

  let treeResizeDrag = null;
  let treeWidthSheet = null;

  function clampTreeWidth(width) {
    const n = Math.round(Number(width));
    return Number.isFinite(n) ? Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, n)) : TREE_WIDTH_DEFAULT;
  }

  function setTreePanelWidth(width, { persist = true } = {}) {
    const w = clampTreeWidth(width);
    if (document.createElement && document.head) {
      if (!treeWidthSheet) {
        treeWidthSheet = document.createElement('style');
        treeWidthSheet.id = 'filesTreeWidth';
        document.head.appendChild(treeWidthSheet);
      }
      // Scoped to the breakpoint where the tree sits beside the files container;
      // below it .files-layout collapses to one column and this must not fight that.
      treeWidthSheet.textContent =
        `@media (min-width: 1024px) { .files-layout { grid-template-columns: ${w}px var(--spacing-12) minmax(0, 1fr); } }`;
    }
    const handle = $('#treePanelResizer');
    if (handle) handle.setAttribute('aria-valuenow', String(w));
    if (persist) Store.set(TREE_WIDTH_STORE_KEY, w);
    return w;
  }

  /** The rendered width, read back from the panel itself (no inline style to read). */
  function currentTreeWidth() {
    const panel = $('.tree-panel');
    const rect = panel && panel.getBoundingClientRect ? panel.getBoundingClientRect() : null;
    return rect && rect.width ? rect.width : TREE_WIDTH_DEFAULT;
  }

  function onTreeResizePointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const panel = $('.tree-panel');
    const handle = e.currentTarget;
    treeResizeDrag = {
      handle,
      startX: e.clientX,
      start: panel ? panel.getBoundingClientRect().width : TREE_WIDTH_DEFAULT,
    };
    if (handle.setPointerCapture && e.pointerId !== undefined) handle.setPointerCapture(e.pointerId);
    handle.classList.add('is-dragging');
    handle.addEventListener('pointermove', onTreeResizePointerMove);
    handle.addEventListener('pointerup', onTreeResizePointerEnd);
    handle.addEventListener('pointercancel', onTreeResizePointerEnd);
  }

  function onTreeResizePointerMove(e) {
    if (!treeResizeDrag) return;
    setTreePanelWidth(treeResizeDrag.start + (e.clientX - treeResizeDrag.startX), { persist: false });
  }

  function onTreeResizePointerEnd() {
    if (!treeResizeDrag) return;
    const { handle } = treeResizeDrag;
    handle.classList.remove('is-dragging');
    handle.removeEventListener('pointermove', onTreeResizePointerMove);
    handle.removeEventListener('pointerup', onTreeResizePointerEnd);
    handle.removeEventListener('pointercancel', onTreeResizePointerEnd);
    treeResizeDrag = null;
    Store.set(TREE_WIDTH_STORE_KEY, clampTreeWidth(currentTreeWidth()));
  }

  function onTreeResizeKeydown(e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const step = (e.shiftKey ? TREE_WIDTH_STEP * 4 : TREE_WIDTH_STEP) * (e.key === 'ArrowRight' ? 1 : -1);
    setTreePanelWidth(currentTreeWidth() + step);
  }

  function onContainerDblClick(e) {
    const handle = e.target && e.target.closest ? e.target.closest('[data-resize]') : null;
    if (!handle) return;
    e.preventDefault();
    resetColumnWidth(handle.getAttribute('data-resize'));
  }

  function onContainerKeydown(e) {
    const resizer = e.target && e.target.closest ? e.target.closest('[data-resize]') : null;
    if (resizer) return onResizeKeydown(e, resizer);
    const entry = e.target && e.target.closest ? e.target.closest('[data-entry]') : null;
    if (!entry) return;
    const id = entry.getAttribute('data-id');
    const file = state.files.find(f => f.id === id);
    const onEntryItself = e.target === entry;
    const entries = entryElements();
    const index = entries.indexOf(entry);
    const cols = gridColumns(entries);

    const move = (to) => {
      e.preventDefault();
      const target = entries[Math.min(Math.max(0, to), entries.length - 1)];
      if (target) focusEntry(target.getAttribute('data-id'));
    };

    switch (e.key) {
      case 'ArrowDown': return move(index + cols);
      case 'ArrowUp': return move(index - cols);
      case 'ArrowRight': return state.view === 'grid' ? move(index + 1) : undefined;
      case 'ArrowLeft': return state.view === 'grid' ? move(index - 1) : undefined;
      case 'Home': return move(0);
      case 'End': return move(entries.length - 1);
      case 'Enter':
        if (!onEntryItself) return undefined;
        e.preventDefault();
        return activateEntry(file, entry);
      case ' ':
        if (!onEntryItself) return undefined;
        e.preventDefault();
        return setSelected(id, !state.selected.has(id));
      case 'F2':
        e.preventDefault();
        return handleAction('rename', id);
      case 'Delete':
        if (!onEntryItself) return undefined;
        e.preventDefault();
        return handleAction('delete', id);
      case 'ContextMenu':
        e.preventDefault();
        return handleAction('more', id, { anchor: entry });
      default:
        if (e.key === 'F10' && e.shiftKey) {
          e.preventDefault();
          return handleAction('more', id, { anchor: entry });
        }
        if ((e.key === 'x' || e.key === 'X') && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          return handleAction('cut', id);
        }
        if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          return handleAction('copy', id);
        }
        return undefined;
    }
  }

  function onContainerFocusIn(e) {
    const entry = e.target && e.target.closest ? e.target.closest('[data-entry]') : null;
    if (entry) setActiveEntry(entry.getAttribute('data-id'));
  }

  function onContainerContextMenu(e) {
    const entry = e.target && e.target.closest ? e.target.closest('[data-entry]') : null;
    if (!entry) return;
    e.preventDefault();
    handleAction('more', entry.getAttribute('data-id'), { anchor: entry, event: e });
  }

  /** A preview that fails to decode falls back to its stated-absence state. */
  function onPreviewError(e) {
    const img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    const box = img.closest && img.closest('[data-preview]');
    if (box) box.classList.add('is-preview-failed');
  }

  /**
   * Fetch one more bounded level past the 2-level cap for a specific node
   * (GET /fs/tree?path=...) and merge the result into state.tree in place.
   * Composable: the fetched node's own leaf children come back marked
   * childrenLoaded:false too, so expanding again just repeats this call -
   * every subdirectory depth is reachable, never a dead end.
   */
  async function loadTreeChildren(path) {
    if (state.treeLoadingPaths.has(path)) return;
    state.treeLoadingPaths.add(path);
    renderTree();
    try {
      const data = await window.API.get(`/fs/tree?path=${encodeURIComponent(path)}`);
      const fetched = Array.isArray(data) ? data[0] : null;
      const node = findTreeNode(state.tree, path);
      if (node && fetched) {
        node.children = Array.isArray(fetched.children) ? fetched.children : [];
        node.childrenLoaded = true;
      }
    } catch {
      // api.js already reported the reason; collapse back to "not yet
      // confirmed" rather than leave an open node with nothing in it, so
      // expanding again retries instead of looking like a confirmed-empty folder.
      state.expanded.delete(path);
    } finally {
      state.treeLoadingPaths.delete(path);
      renderTree();
    }
  }

  function toggleTreeNode(path, open) {
    const node = findTreeNode(state.tree, path);
    if (!nodeIsExpandable(node)) return;
    const isOpen = state.expanded.has(path);
    const next = open === undefined ? !isOpen : open;
    if (next === isOpen) return;
    if (next) state.expanded.add(path);
    else state.expanded.delete(path);
    renderTree();
    if (next && node.childrenLoaded === false) loadTreeChildren(path);
  }

  function onTreeClick(e) {
    const t = e.target;
    if (!t || !t.closest) return;
    const retry = t.closest('[data-retry]');
    if (retry) return loadTree();
    const toggle = t.closest('[data-tree-toggle]');
    if (toggle) {
      e.stopPropagation();
      return toggleTreeNode(toggle.getAttribute('data-tree-toggle'));
    }
    const item = t.closest('[data-tree-path]');
    if (item) return navigateTo(item.getAttribute('data-tree-path'));
    return undefined;
  }

  function onTreeKeydown(e) {
    const item = e.target && e.target.closest ? e.target.closest('[data-tree-path]') : null;
    if (!item) return;
    const path = item.getAttribute('data-tree-path');
    const visible = visibleTreePaths(state.tree, state.expanded);
    const i = visible.indexOf(path);
    const node = findTreeNode(state.tree, path);
    const expandable = nodeIsExpandable(node);
    const go = (p) => { e.preventDefault(); if (p) focusTreeItem(p); };

    switch (e.key) {
      case 'ArrowDown': return go(visible[i + 1]);
      case 'ArrowUp': return go(visible[i - 1]);
      case 'Home': return go(visible[0]);
      case 'End': return go(visible[visible.length - 1]);
      case 'ArrowRight':
        e.preventDefault();
        if (expandable && !state.expanded.has(path)) return toggleTreeNode(path, true);
        // Still loading, or confirmed empty after the fetch - nothing to focus into yet.
        if (expandable && node.children && node.children.length) return focusTreeItem(node.children[0].path);
        return undefined;
      case 'ArrowLeft':
        e.preventDefault();
        if (expandable && state.expanded.has(path)) return toggleTreeNode(path, false);
        if (path !== '/') return focusTreeItem(parentPath(path));
        return undefined;
      case 'Enter':
      case ' ':
        e.preventDefault();
        return navigateTo(path);
      case 'ContextMenu':
        e.preventDefault();
        return openTreeContext(path, item);
      default:
        if (e.key === 'F10' && e.shiftKey) {
          e.preventDefault();
          return openTreeContext(path, item);
        }
        return undefined;
    }
  }

  function onTreeContextMenu(e) {
    const item = e.target && e.target.closest ? e.target.closest('[data-tree-path]') : null;
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    openTreeContext(item.getAttribute('data-tree-path'), item, e);
  }

  function onBreadcrumbClick(e) {
    const crumb = e.target && e.target.closest ? e.target.closest('[data-nav-path]') : null;
    if (crumb) navigateTo(crumb.getAttribute('data-nav-path'));
  }

  function onChipClick(e) {
    const chip = e.target && e.target.closest ? e.target.closest('[data-filter]') : null;
    if (chip) setFilter(chip.getAttribute('data-filter'));
  }

  function onSearchInput(e) {
    const value = e.target.value;
    cancelPendingSearch();
    searchTimer = setTimeout(() => {
      searchTimer = null;
      state.search = value.trim();
      state.page = 1;
      loadFiles();
    }, SEARCH_DEBOUNCE_MS);
  }

  function openFilePicker() {
    const input = $('#hiddenFileInput');
    if (input) input.click();
  }

  /** window/document listeners, removed by destroy() on client-side navigation. */
  let globalListeners = [];

  function listenGlobal(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    globalListeners.push([target, type, handler, options]);
  }

  function initDragDrop() {
    const overlay = $('#dropOverlay');
    if (!overlay) return;
    let dragDepth = 0;
    const carriesFiles = e => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));

    listenGlobal(window, 'dragenter', e => {
      if (!carriesFiles(e)) return;
      dragDepth++;
      overlay.classList.add('is-active');
    });
    listenGlobal(window, 'dragleave', e => {
      if (!carriesFiles(e)) return;
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) overlay.classList.remove('is-active');
    });
    listenGlobal(window, 'dragover', e => { if (carriesFiles(e)) e.preventDefault(); });
    listenGlobal(window, 'drop', e => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      overlay.classList.remove('is-active');
      handleDrop(e.dataTransfer);
    });
  }

  function applyLibraryView(view) {
    const def = LIBRARY_VIEWS[view];
    if (!def) return;
    state.library = view;
    state.starredOnly = !!def.starredOnly;
    state.sort = { ...def.sort };
    const title = $('#pageTitle');
    if (title) title.textContent = def.title;
    const subtitle = $('#pageSubtitle');
    if (subtitle) {
      subtitle.textContent = def.subtitle;
      subtitle.hidden = false;
    }
    if (document.title !== undefined) document.title = `${def.title} · Dimension Files Manager`;
    const navItems = document.querySelectorAll ? document.querySelectorAll('.nav-item') : [];
    navItems.forEach(item => {
      const on = item.getAttribute('data-nav-view') === view;
      item.classList.toggle('is-active', on);
      if (on) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function bind(sel, type, handler, options) {
    const el = $(sel);
    if (el) el.addEventListener(type, handler, options);
  }

  function bindEvents() {
    bind('#filesContainer', 'click', onContainerClick);
    bind('#filesContainer', 'change', onContainerChange);
    bind('#filesContainer', 'keydown', onContainerKeydown);
    bind('#filesContainer', 'pointerdown', onResizePointerDown);
    bind('#filesContainer', 'dblclick', onContainerDblClick);
    bind('#filesContainer', 'focusin', onContainerFocusIn);
    bind('#filesContainer', 'contextmenu', onContainerContextMenu);
    bind('#filesContainer', 'error', onPreviewError, true);

    bind('#folderTree', 'click', onTreeClick);
    bind('#folderTree', 'keydown', onTreeKeydown);
    bind('#folderTree', 'contextmenu', onTreeContextMenu);

    bind('#treePanelResizer', 'pointerdown', onTreeResizePointerDown);
    bind('#treePanelResizer', 'keydown', onTreeResizeKeydown);
    bind('#treePanelResizer', 'dblclick', () => setTreePanelWidth(TREE_WIDTH_DEFAULT));
    bind('#breadcrumb', 'click', onBreadcrumbClick);
    bind('#filterChips', 'click', onChipClick);
    bind('#filesSearch', 'input', onSearchInput);

    bind('#viewToggle', 'click', e => {
      const btn = e.target.closest && e.target.closest('[data-view]');
      if (!btn) return;
      state.view = btn.getAttribute('data-view') === 'grid' ? 'grid' : 'list';
      Store.set('files-view', state.view);
      renderView();
    });

    bind('#sortDropdown', 'click', e => {
      const btn = e.target.closest && e.target.closest('[data-sort-act]');
      if (!btn) return;
      toggleSort(btn.getAttribute('data-sort-act'));
      if (Dropdown && Dropdown.closeAll) Dropdown.closeAll();
    });

    bind('#btnRefresh', 'click', () => { loadTree(); loadFiles(); });
    bind('#btnNewFolder', 'click', () => handleAction('newFolder', state.currentPath));
    bind('#btnTreeNewFolder', 'click', () => handleAction('newFolder', state.currentPath));
    bind('#btnPaste', 'click', () => handleAction('paste'));
    bind('#btnCancelCut', 'click', cancelClipboard);

    // Pending-items disclosure (clipboard strip). The strip reuses the shared
    // `.dropdown-menu` mechanics - outside click and Escape are handled by
    // Dropdown in app.js - but owns its own trigger toggle so aria-expanded
    // stays truthful instead of one click behind. Hover opens it; leaving the
    // strip closes it (the menu is a child, so pointing at the list keeps it
    // open). Element listeners die with the page swap, so destroy() has
    // nothing to remove for these.
    bind('#clipboardStrip', 'mouseenter', () => setClipboardDisclosure(true));
    bind('#clipboardStrip', 'mouseleave', () => setClipboardDisclosure(false));
    bind('#clipboardTrigger', 'click', (e) => {
      e.stopPropagation(); // the shared document toggle must not double-toggle it
      setClipboardDisclosure(!$('#clipboardItemsDropdown').classList.contains('is-open'));
    });
    // Keyboard activation needs no handler: the trigger is a real button element,
    // so Enter and Space natively dispatch click. (A role-as-button span would
    // have needed one - and this page bans that pattern outright.)
    // Dropdown closes the menu on an outside click or Escape without knowing
    // about the trigger; this re-reads the menu state after those paths so the
    // announced state never drifts from the visible one.
    listenGlobal(document, 'click', () => setClipboardDisclosure($('#clipboardItemsDropdown').classList.contains('is-open')));
    listenGlobal(document, 'keydown', (e) => { if (e.key === 'Escape') setClipboardDisclosure(false); });
    bind('#btnPageUpload', 'click', openFilePicker);
    bind('#hiddenFileInput', 'change', e => {
      const jobs = jobsFromFiles(e.target.files, state.currentPath);
      e.target.value = '';
      runUploads(jobs);
    });

    bind('#bulkDownload', 'click', e => openBulkDownloadMenu(e.currentTarget));
    bind('#bulkStar', 'click', () => handleAction('bulkStar'));
    bind('#bulkMove', 'click', () => handleAction('bulkMove'));
    bind('#bulkCopy', 'click', () => handleAction('bulkCopy'));
    bind('#bulkPolicy', 'click', () => handleAction('bulkPolicy'));
    bind('#bulkDelete', 'click', () => handleAction('bulkDelete'));
    bind('#bulkMore', 'click', e => openBulkMoreMenu(e.currentTarget));
    bind('#bulkClear', 'click', clearSelection);

    bind('#btnTreeSheet', 'click', openTreeSheet);
    bind('#treeSheetBackdrop', 'click', closeTreeSheet);
    bind('#treePanel', 'keydown', e => { if (isTreeSheetOpen()) trapFocusIn($('#treePanel'), e); });

    bind('#fileDrawer', 'click', onDrawerClick);
    bind('#fileDrawer', 'keydown', trapDrawerFocus);
    bind('#drawerClose', 'click', closeDrawer);
    bind('#drawerBackdrop', 'click', closeDrawer);
    listenGlobal(document, 'keydown', onEscape, true);
    listenGlobal(document, 'keydown', onPasteShortcut);

    bind('#uploadTray', 'click', e => {
      const cancel = e.target.closest && e.target.closest('[data-upload-cancel]');
      if (cancel) return cancelUpload(parseInt(cancel.getAttribute('data-upload-cancel'), 10));
      if (e.target.closest && e.target.closest('[data-upload-dismiss]')) {
        uploads.splice(0, uploads.length);
        renderUploadTray();
      }
      return undefined;
    });
  }

  /* ══════════════════════════════════════════
     INIT
     ══════════════════════════════════════════ */

  function init() {
    state = createState({
      view: Store.get('files-view', 'list') === 'grid' ? 'grid' : 'list',
      perPage: PAGE_SIZES.includes(Store.get('files-per-page', 20)) ? Store.get('files-per-page', 20) : 20,
      colWidths: sanitizeColumnWidths(Store.get(COLUMN_STORE_KEY, {})),
    });
    applyColumnWidths();
    setTreePanelWidth(Store.get(TREE_WIDTH_STORE_KEY, TREE_WIDTH_DEFAULT), { persist: false });
    initExpansion(state);
    applyLibraryView(resolveLibraryView(window.location && window.location.search));

    bindEvents();
    initDragDrop();
    updateBreadcrumb();
    renderTree();
    renderChips();
    syncSearchInput();

    loadPreviewCapability().then(() => { if (!state.loading) renderView(); });
    applyDefaultViewSetting();
    loadTree();
    loadFiles();
  }

  /**
   * Client-side navigation away (router.js). Uploads already in flight keep
   * running; only page-scoped listeners, timers and the width sheet go.
   */
  function destroy() {
    globalListeners.forEach(([target, type, handler, options]) => target.removeEventListener(type, handler, options));
    globalListeners = [];
    cancelPendingSearch();
    onResizePointerEnd();
    onTreeResizePointerEnd();
    if (widthSheet && widthSheet.remove) widthSheet.remove();
    widthSheet = null;
    if (treeWidthSheet && treeWidthSheet.remove) treeWidthSheet.remove();
    treeWidthSheet = null;
    closeTreeSheet();
    // Pollers are timers this module owns. router.js swaps the page in place and
    // calls destroy(), so an unstopped poll would keep a detached page querying
    // the server - and would later re-render the strip over the NEW page.
    operations.forEach((entry) => stopOperationPoll(entry));
    operations.clear();
    state.inFlight.clear();
    // A pending removal left running would hide the strip belonging to the NEXT
    // page, or fire against a detached one.
    cancelStripRemoval();
    clearOperationStrip();
  }

  return {
    init,
    destroy,
    // Pure helpers and renderers, exercised by test/frontend/files.test.js.
    pure: {
      TREE_DEPTH, STAGGER_STEPS, PAGE_SIZES, LIBRARY_VIEWS, TYPE_CHIPS,
      createState, joinPath, parentPath, isSameOrInside, ancestorsOf, rewriteAfterMutation,
      typeOf, typeLabel, pageCount, clampPage, footerRange, buildPageNumbers, pruneSelection,
      emptyKind, staggerIndex, applyNavigation, initExpansion, treeContains, visibleTreePaths, nodeIsExpandable,
      listQuery, resolveLibraryView, summarizeDelete, deleteConfirmCopy,
      renderTreeHtml, renderBreadcrumbHtml, renderChipsHtml, renderListHtml, renderGridHtml,
      renderFooterHtml, renderSkeletonHtml, renderEmptyHtml, renderErrorHtml, renderDrawerHtml,
      renderDrawerFooterHtml, showsPaths, metaLine, locationTitle, clipboardSentence,
      COLUMNS, sanitizeColumnWidths, clampColumnWidth, columnWidth, columnWidthsCss,
    },
    // Controller seam for the same suite: drives the real handlers against a stub DOM.
    _controller: {
      getState: () => state,
      setPreviewCapability: (cap) => { previewCapability = cap; },
      loadTree, loadFiles, navigateTo, handleAction, openDrawer, closeDrawer, onEscape, onPasteShortcut,
      setSelected, selectAllOnPage, toggleSort, setFilter, setPage, toggleTreeNode, loadTreeChildren,
      onTreeClick, onTreeKeydown, onBreadcrumbClick, onContainerClick, onContainerKeydown, onDrawerClick, onSearchInput,
      syncAfterMutation, cancelPendingSearch, runUploads, handleDrop, openBulkDownloadMenu,
      setColumnWidth, resetColumnWidth, onResizeKeydown, onContainerDblClick,
      cutItems, copyItems, cancelClipboard, pasteItems, setAccessPolicy,
      startTrackedOperation, renderOperation, notifyTerminal, finishOperation,
      scheduleStripRemoval, clearOperationStrip,
      TERMINAL_STATES, OPERATION_POLL_MS, OPERATION_POLL_MAX_MS,
      OPERATION_MAX_POLL_FAILURES, OPERATION_RESULT_TTL_MS,
      openTreeSheet, closeTreeSheet, isTreeSheetOpen,
    },
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'files') {
    Files.init();
  }
});

window.Files = Files;
