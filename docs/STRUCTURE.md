`STRUCTURE.md`

# Dimension Files Manager — Project Structure

> **Quick-reference map of every file, its role, and how they connect.**
> For deep technical details, see [`ARCHITECT.md`](./ARCHITECT.md).
> For the design system spec, see [`design.md`](./design.md).

---

## 1. Directory Tree

```
admin-files-manager/
│
├── 📄 index.html                  ← Dashboard (home page)
├── 📄 files.html                  ← File browser
├── 📄 uploads.html                ← Upload manager
├── 📄 settings.html               ← Settings & preferences
│
├── 📁 css/
│   ├── 🎨 tokens.css              ← Design tokens (colors, spacing, radii, type)
│   ├── 🧱 base.css                ← Reset, typography, utilities, animations
│   ├── 🌓 themes.css              ← Dark + Light theme variable overrides
│   ├── 📐 layout.css              ← App shell, sidebar, topbar, grids, responsive
│   ├── 🧩 components.css          ← Buttons, cards, forms, modals, toasts, tabs
│   ├── 📊 dashboard.css           ← Hero panel, stat cards, charts, activity feed
│   ├── 📂 files.css               ← Toolbar, file table, grid, tree, drawer, DnD
│   ├── ☁️  uploads.css            ← Dropzone, upload queue, presets, metrics
│   └── ⚙️  settings.css           ← Settings nav, groups, theme picker, danger zone
│
├── 📁 js/
│   ├── 🔧 app.js                  ← Core: icons, formatting, Toast, Modal, helpers
│   ├── 🌓 theme.js                ← Theme toggle controller (dark/light/system)
│   ├── 📁 sidebar.js              ← Sidebar collapse/expand + mobile drawer
│   ├── 📊 dashboard.js            ← Dashboard data, charts, live updates
│   ├── 📂 files.js                ← File browser state, filters, table/grid, drawer
│   └── ☁️  uploads.js             ← Upload engine, queue, progress, presets
│
├── 📄 ARCHITECT.md                ← Deep technical architecture (for AI/devs)
├── 📄 STRUCTURE.md                ← This file (project map)
└── 📄 design.md                   ← Dimension design system reference (external)
```

---

## 2. File-by-File Index

### 2.1 HTML Pages

| File | Page ID | Purpose | Key Sections |
|---|---|---|---|
| `index.html` | `dashboard` | Main overview & analytics | Hero, stats, chart, donut, activity, health, quick actions |
| `files.html` | `files` | Browse & manage all files | Toolbar, folder tree, file table/grid, drawer, bulk bar, DnD overlay |
| `uploads.html` | `uploads` | Upload files with progress | Dropzone, destination strip, presets, queue, metrics, recent strip |
| `settings.html` | `settings` | Configure workspace | 8 panes (General, Appearance, Storage, Security, API, Integrations, Notifications, Danger) |

**Every HTML page contains:**
- Identical sidebar navigation (duplicated — no template engine)
- Identical topbar (search, theme toggle, notifications, CTA)
- Same CSS load order (6 files)
- Same JS load order (4 files)
- `<body data-page="...">` for JS module activation

---

### 2.2 CSS Files

| File | Lines (approx) | Depends On | Loaded By | Role |
|---|---|---|---|---|
| `tokens.css` | ~230 | Google Fonts | All pages | **Foundation.** All `--color-*`, `--spacing-*`, `--radius-*`, `--font-*`, `--shadow-*`, `--z-*`, `--transition-*` variables. Two layers: raw palette + semantic tokens. |
| `base.css` | ~380 | tokens | All pages | **Reset & utilities.** Box-sizing reset, scrollbar styling, typography scale (h1–h6), form resets, focus styles, selection, tables, utility classes (`.flex`, `.grid`, `.truncate`, `.text-*`, `.animate-*`), keyframes. |
| `themes.css` | ~280 | tokens | All pages | **Theme switching.** `[data-theme="dark"]` and `[data-theme="light"]` blocks that override all Layer 2 semantic tokens. Includes toggle button styles, skeleton variants, print media query. |
| `layout.css` | ~520 | tokens, base | All pages | **App shell.** `.app-shell` flex layout, `.sidebar` (fixed, 260px/72px), `.topbar` (sticky, 64px), `.page`, `.breadcrumb`, `.nav-item`, `.storage-card`, grid utilities, mobile overlay, 5 responsive breakpoints. |
| `components.css` | ~780 | tokens, base | All pages | **Reusable UI.** Buttons (6 variants + sizes), cards, forms (input/textarea/select/search/checkbox/switch/segmented), badges, tags, dropdowns, modals, toasts, progress bars, tooltips, tabs, avatars, empty states, skeletons, pagination, context menus. |
| `dashboard.css` | ~530 | all above | `index.html` only | **Dashboard.** Hero gradient panel + device mockup, stat cards with sparklines, bar chart, donut chart (SVG), activity feed, numbered list, rank list, quick actions grid, server health, live pulse dot. |
| `files.css` | ~490 | all above | `files.html` only | **Files.** Sticky toolbar, filter chips, bulk action bar, file table (list view) with sortable headers, file cards (grid view), folder tree panel, file details drawer, drag-and-drop overlay, table footer with pagination. |
| `uploads.css` | ~460 | all above | `uploads.html` only | **Uploads.** Dropzone with violet glow, destination strip, upload queue (items with progress bars + status stripes), global progress bar, metric tiles with speed graph, preset cards, recent uploads strip. |
| `settings.css` | ~430 | all above | `settings.html` only | **Settings.** Two-column layout (nav + content), settings groups with rows, theme picker with mini previews, storage quota visual, API token rows, integration cards, danger zone, sticky save bar. |

**CSS Load Order (critical):**

tokens → base → themes → layout → components → <page>
Each layer builds on the previous. Reordering will break specificity and variable resolution.

---

### 2.3 JavaScript Files

| File | Lines (approx) | Depends On | Loaded By | Role |
|---|---|---|---|---|
| `app.js` | ~620 | Nothing | All pages | **Core library.** Exposes `window.AFM`. Contains: 90+ icon SVGs, DOM helpers (`$`, `$$`, `el`, `on`), `Format` utilities (bytes, dates, numbers), `resolveType()` for file types, `Toast` system, `Modal` system (open/close/confirm/prompt), `Dropdown` controller, `ContextMenu`, clipboard, `Store` (localStorage), debounce/throttle/uid/clamp, `countUp` animation, scroll reveal, keyboard shortcuts, ripple effect, nav highlighting. |
| `theme.js` | ~160 | `AFM.Store` | All pages | **Theme controller.** Exposes `window.Theme`. Reads stored/system preference, applies `data-theme` attribute, syncs toggle UI, updates meta theme-color, handles cross-tab sync, provides `onChange` subscription. |
| `sidebar.js` | ~230 | `AFM.Store` | All pages | **Sidebar controller.** Exposes `window.Sidebar`. Manages collapse/expand on desktop, drawer open/close on mobile, swipe gestures, keyboard navigation, resize handling, tooltip generation for collapsed state, brand double-click toggle. |
| `dashboard.js` | ~380 | `AFM.*` | `index.html` only | **Dashboard logic.** Exposes `window.Dashboard`. Mock data (stats, chart, donut, activity, top files, health, capabilities, quick actions). Renders all dashboard sections. Animated counters. Live server health updates every 4.2s. Quick action handlers (new folder modal, share link copy). |
| `files.js` | ~620 | `AFM.*` | `files.html` only | **File browser logic.** Exposes `window.Files`. Full state management (filter, sort, search, pagination, selection). Mock data generator (32 files + 4 folders). Renders list view (table) and grid view (cards). Folder tree with recursive walk. Bulk actions. File details drawer. Right-click context menu. Drag-and-drop overlay. Breadcrumb navigation. |
| `uploads.js` | ~530 | `AFM.*` | `uploads.html` only | **Upload manager logic.** Exposes `window.Uploads`. Simulated upload engine with `setInterval` tick (200ms). File queue state machine (queued → uploading → done/failed/paused). Dropzone with drag-and-drop. Global progress + ETA. Per-item progress micro-updates. 4 upload presets. Metrics tiles with live speed graph. Pause/resume/retry/cancel controls. |

**JS Load Order (critical):**

app.js → theme.js → sidebar.js → <page>.js

`app.js` must load first — all other files depend on `window.AFM`.

---

## 3. Page → Asset Mapping

```
index.html
  ├── css/tokens.css
  ├── css/base.css
  ├── css/themes.css
  ├── css/layout.css
  ├── css/components.css
  ├── css/dashboard.css        ← unique to this page
  ├── js/app.js
  ├── js/theme.js
  ├── js/sidebar.js
  └── js/dashboard.js          ← unique to this page

files.html
  ├── css/tokens.css
  ├── css/base.css
  ├── css/themes.css
  ├── css/layout.css
  ├── css/components.css
  ├── css/files.css            ← unique to this page
  ├── js/app.js
  ├── js/theme.js
  ├── js/sidebar.js
  └── js/files.js              ← unique to this page

uploads.html
  ├── css/tokens.css
  ├── css/base.css
  ├── css/themes.css
  ├── css/layout.css
  ├── css/components.css
  ├── css/uploads.css          ← unique to this page
  ├── js/app.js
  ├── js/theme.js
  ├── js/sidebar.js
  └── js/uploads.js            ← unique to this page

settings.html
  ├── css/tokens.css
  ├── css/base.css
  ├── css/themes.css
  ├── css/layout.css
  ├── css/components.css
  ├── css/settings.css         ← unique to this page
  ├── js/app.js
  ├── js/theme.js
  ├── js/sidebar.js
  └── <inline script>          ← settings logic is inline (no separate file)
```

---

## 4. Dependency Graph

```
                        ┌─────────────┐
                        │  design.md  │  (external reference)
                        └──────┬──────┘
                               │ informs
                               ▼
                        ┌─────────────┐
                        │ tokens.css  │  Layer 1: raw palette
                        └──────┬──────┘  Layer 2: semantic tokens
                               │
                  ┌────────────┼────────────┐
                  ▼            ▼            ▼
            ┌──────────┐ ┌──────────┐ ┌──────────┐
            │ base.css │ │themes.css│ │layout.css│
            └────┬─────┘ └────┬─────┘ └────┬─────┘
                 │            │            │
                 └────────────┼────────────┘
                              ▼
                      ┌───────────────┐
                      │components.css │
                      └───────┬───────┘
                              │
            ┌─────────┬───────┼───────┬──────────┐
            ▼         ▼       ▼       ▼          ▼
      dashboard   files   uploads  settings   (future
        .css      .css     .css     .css      pages)


      ┌────────┐
      │ app.js │  window.AFM
      └───┬────┘
          │
     ┌────┴────┐
     ▼         ▼
 theme.js  sidebar.js    window.Theme, window.Sidebar
     │         │
     └────┬────┘
          │
    ┌─────┼─────┬──────────┐
    ▼     ▼     ▼          ▼
dashboard files uploads  settings
  .js     .js    .js    (inline)
```

---

## 5. Data Flow

### 5.1 Dashboard
```
Mock data arrays (inside dashboard.js)
  → renderStats() / renderChart() / renderDonut() / ...
    → DOM injection via innerHTML
      → countUp() animations
        → setInterval for live health updates
```

### 5.2 Files
```
makeFiles() → state.all[]
  → User action (filter/search/sort/select)
    → applyFilters() → state.filtered[]
      → renderView() → renderList() | renderGrid()
        → bindRowInteractions()
          → User clicks row → openDrawer()
          → User right-clicks → ContextMenu.show()
          → User checks box → state.selected.add()
            → updateBulkBar()
```

### 5.3 Uploads
```
Dropzone / File input → addFiles(File[])
  → state.queue[] (status: 'queued')
    → startUploads() → setInterval(tick, 200ms)
      → fillActive() promotes to 'uploading'
      → tick() increments bytes, updates DOM
        → on complete: status='done', Toast
        → on error: status='failed'
      → renderGlobalProgress() / renderMetrics()
```

### 5.4 Settings
```
User changes input/switch/select
  → 'change' event → markDirty()
    → saveBar.classList.add('is-visible')
      → User clicks Save → Toast.success → markClean()
      → User clicks Discard → Modal.confirm → markClean()
```

---

## 6. State Storage

| Key | Location | Set By | Read By |
|---|---|---|---|
| `afm:theme` | localStorage | `theme.js` | `theme.js` |
| `afm:sidebar-collapsed` | localStorage | `sidebar.js` | `sidebar.js` |
| `afm:files-view` | localStorage | `files.js` | `files.js` |

All other state is in-memory only (lost on refresh).

---

## 7. Global Namespace

```
window.AFM        ← Core library (icons, Format, Toast, Modal, etc.)
window.Theme      ← Theme controller
window.Sidebar    ← Sidebar controller
window.Dashboard  ← Dashboard module (index.html only)
window.Files      ← Files module (files.html only)
window.Uploads    ← Uploads module (uploads.html only)
```

No other globals are created. Settings uses an anonymous IIFE.

---

## 8. Key HTML Elements by Page

### Dashboard (`index.html`)
| ID / Selector | Purpose |
|---|---|
| `#statsGrid` | Stat cards container (rendered by JS) |
| `#trafficChart` | Bar chart container |
| `#chartLegend` | Chart legend |
| `#storageDonut` | SVG donut chart |
| `#activityFeed` | Activity list |
| `#topFiles` | Top downloads rank |
| `#capabilities` | Numbered feature list |
| `#serverHealth` | Health metrics |
| `#quickActions` | Quick action tiles |
| `#refreshDashboard` | Refresh button |
| `#globalSearch` | Search input |

### Files (`files.html`)
| ID / Selector | Purpose |
|---|---|
| `#filesContainer` | Table or grid (rendered by JS) |
| `#folderTree` | Folder tree panel |
| `#filterChips` | Type filter chips |
| `#filesSearch` | Filter input |
| `#breadcrumb` | Path breadcrumb |
| `#bulkBar` | Floating bulk action bar |
| `#fileDrawer` | File details side drawer |
| `#dropOverlay` | Full-screen DnD overlay |
| `#selectAll` | Header checkbox |
| `[data-view]` | List/grid toggle buttons |
| `[data-filter]` | Filter chip buttons |
| `[data-check]` | Row checkboxes |

### Uploads (`uploads.html`)
| ID / Selector | Purpose |
|---|---|
| `#dropzone` | Drop area |
| `#fileInput` | Hidden file input |
| `#folderInput` | Hidden folder input |
| `#browseFiles` | Browse files button |
| `#browseFolder` | Browse folder button |
| `#queueList` | Upload queue items |
| `#queueStats` | Queue status counts |
| `#queueGlobal` | Overall progress bar |
| `#uploadMetrics` | Metric tiles |
| `#presetGrid` | Preset cards |
| `#recentUploads` | Recent uploads strip |
| `#destPath` | Destination path label |
| `#changeDestination` | Change dest button |
| `#pauseAll` / `#resumeAll` | Global controls |
| `#retryFailed` / `#clearDone` / `#cancelAll` | Queue actions |
| `[data-option]` | Option toggle switches |
| `[data-preset]` | Preset selection buttons |

### Settings (`settings.html`)
| ID / Selector | Purpose |
|---|---|
| `.settings-nav-item[data-pane]` | Pane switcher buttons |
| `.settings-pane[data-pane-content]` | Pane content containers |
| `#saveBar` | Sticky unsaved changes bar |
| `#saveChanges` / `#discardChanges` | Save bar buttons |
| `.theme-option[data-theme-value]` | Theme picker cards |
| `[data-danger]` | Danger zone action buttons |
| `[data-option]` | (Not used here — settings uses native change events) |

---

## 9. CSS Class Naming Conventions

| Pattern | Meaning | Example |
|---|---|---|
| `.component` | Base component | `.card`, `.btn`, `.badge` |
| `.component-variant` | Style variant | `.btn-primary`, `.btn-ghost` |
| `.component-size` | Size modifier | `.btn-sm`, `.btn-lg` |
| `.component.is-state` | Boolean state | `.is-active`, `.is-open`, `.is-collapsed` |
| `.component.has-feature` | Feature flag | `.has-glow` (not currently used) |
| `.parent-child` | BEM-like nesting | `.stat-card` → `.stat-value`, `.stat-label` |
| `.prefix-abbreviation` | Short compound | `.qi-body` (queue item body), `.sg-head` (settings group head) |
| `.col-name` | Table column | `.col-check`, `.col-size`, `.col-modified` |
| `.ftype-name` | File type | `.ftype-icon.image`, `.ftype-icon.folder` |
| `[data-*]` | JS hooks | `data-page`, `data-nav`, `data-icon`, `data-filter`, `data-view` |

---

## 10. Responsive Breakpoint Map

```
  0px        480px      560px      768px      860px      1024px     1200px     1280px     ∞
   │           │          │          │          │          │          │          │         │
   │  mobile   │  small   │  medium  │  tablet  │  MOBILE  │  small   │  medium  │  large  │
   │  portrait │  phone   │  phone   │          │  BREAK   │  desktop │  desktop │  desktop│
   │           │          │          │          │  POINT   │          │          │         │
   │           │          │          │          │          │          │          │         │
   │           │          │  table   │  hide    │ sidebar  │  3-col   │  split   │  full   │
   │           │  font    │  cols    │  mobile  │ becomes  │  → 2-col │  grid    │  layout │
   │           │  shrink  │  hidden  │  class   │ drawer   │          │  → 1-col │         │
```

**Critical breakpoint: 860px** — sidebar switches from fixed panel to mobile drawer.

---

## 11. Quick Start

### Run locally (no build step)
```bash
# Option 1: Just open the file
open index.html

# Option 2: Local server (recommended for proper loading)
python3 -m http.server 8000
# Then visit http://localhost:8000

# Option 3: VS Code Live Server extension
# Right-click index.html → "Open with Live Server"
```

### Add a new page
1. Copy `index.html` → `newpage.html`
2. Change `<body data-page="newpage">`
3. Create `css/newpage.css` and `js/newpage.js`
4. Swap the page-specific CSS/JS links
5. Add `<a class="nav-item" href="newpage.html" data-nav="newpage">` to **all 4 sidebars**

### Add a new icon
1. Open `js/app.js`
2. Add to the `Icons` object: `myIcon: '<path d="..."/>'`
3. Use in HTML: `<i data-icon="myIcon" data-icon-size="18"></i>`

### Add a new theme color
1. Add raw value to `css/tokens.css` under `:root`
2. Add semantic mapping to `css/themes.css` under both `[data-theme="dark"]` and `[data-theme="light"]`
3. Use the semantic token in components

---

## 12. File Size Summary

| Category | Files | Total (approx) |
|---|---|---|
| HTML | 4 | ~2,400 lines |
| CSS | 9 | ~4,100 lines |
| JavaScript | 6 | ~2,540 lines |
| Documentation | 3 | ~1,800 lines |
| **Total** | **22** | **~10,840 lines** |
