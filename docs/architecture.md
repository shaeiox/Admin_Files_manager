`ARCHITECT.md`

# Dimension Files Manager — Architecture Document

> **Purpose:** This document explains the complete architecture, conventions, and internal contracts of the Admin Files Manager codebase. It is written for an AI model (or developer) that will read, extend, or refactor the code without prior context.

---

## 1. Project Identity

**Name:** Dimension — Admin Files Manager for Download
**Type:** Multi-page vanilla HTML/CSS/JS admin panel (no build step, no framework)
**Design system:** "Dimension" — dusk-lit workspace with frosted glass panels
**Themes:** Dark (default) + Light + System
**Target:** Modern browsers (Chrome, Safari, Firefox, Edge — latest 2 versions)

The app is a **client-side prototype/UI shell**. All data is mocked in memory. There is no backend, no real upload endpoint, no persistence beyond `localStorage` for user preferences.

---

## 2. File Structure

```
admin-files-manager/
├── index.html              → Dashboard page
├── files.html              → File browser page
├── uploads.html            → Upload manager page
├── settings.html           → Settings page
│
├── css/
│   ├── tokens.css          → CSS custom properties (design tokens)
│   ├── base.css            → Reset + typography + utility classes
│   ├── themes.css          → Dark/light theme variable overrides
│   ├── layout.css          → App shell, sidebar, topbar, grids
│   ├── components.css      → Buttons, cards, inputs, modals, toasts
│   ├── dashboard.css       → Dashboard-specific (hero, stats, charts)
│   ├── files.css           → Files browser (table, grid, drawer, tree)
│   ├── uploads.css         → Uploads (dropzone, queue, presets)
│   └── settings.css        → Settings (nav, groups, theme picker)
│
└── js/
    ├── app.js              → Shared: icons, Format, Toast, Modal, Dropdown
    ├── theme.js            → Theme controller (light/dark/system)
    ├── sidebar.js          → Sidebar collapse/expand controller
    ├── dashboard.js        → Dashboard page logic
    ├── files.js            → File browser page logic
    └── uploads.js          → Upload manager page logic
```

### 2.1 Load Order

**CSS (in every HTML file, in this exact order):**
1. `tokens.css` — defines all `--color-*`, `--spacing-*`, `--radius-*` etc.
2. `base.css` — needs tokens
3. `themes.css` — overrides tokens per `data-theme`
4. `layout.css` — sidebar + topbar + grids
5. `components.css` — reusable UI
6. `<page>.css` — page-specific (only one per HTML)

**JS (in every HTML file, in this exact order):**
1. `app.js` — defines `window.AFM` global namespace
2. `theme.js` — depends on `AFM.Store`
3. `sidebar.js` — depends on `AFM.Store`
4. `<page>.js` — depends on all of the above

Every page-specific JS file guards itself with `document.body.dataset.page === '<name>'`.

---

## 3. Design System — Dimension

The visual system is defined in `design.md` (external reference). Key non-negotiable rules embedded in the code:

| Rule | Implementation |
|---|---|
| **Only violet accent (#6b62f2)** used as gradient wash, never solid button fill | `--gradient-dusk-violet` in tokens.css |
| **All primary CTAs use 9999px pill shape** | `--radius-pill: 9999px`, `.btn` uses it |
| **Weight 500 max for display headlines** | `--font-weight-medium: 500` in `.page-title`, `.hero-title` |
| **1px hairline borders, no heavy shadows** | `--border-primary` with 12% alpha, `--shadow-subtle` inset only |
| **Cards: 24px radius; large cards: 40px** | `--radius-cards: 24px`, `--radius-largecards: 40px` |
| **DM Sans for UI + display, Geist for section headings** | `--font-dm-sans`, `--font-geist` (falls back to Inter) |
| **Hero has only the warm→cool gradient** | `.hero-panel::before` in dashboard.css |
| **Frosted glass = rgba(212,212,212,0.08) + backdrop-blur** | `--bg-frosted`, `.frosted-panel` |

**⚠️ Never introduce new brand colors or bolder weights.** The 2% colorfulness is intentional.

---

## 4. Token System (`css/tokens.css`)

All design decisions live as CSS custom properties on `:root`. Themes override them via `[data-theme="dark|light"]` in `themes.css`.

### 4.1 Two-Layer Token Model

**Layer 1 — Raw palette (immutable):**
```css
--color-void-canvas: #0a0a0a;
--color-graphite: #161616;
--color-dusk-violet: #6b62f2;
```

**Layer 2 — Semantic tokens (themed):**
```css
--bg-primary: <resolves per theme>;
--text-primary: <resolves per theme>;
--border-primary: <resolves per theme>;
--accent-primary: <resolves per theme>;
```

**Rule:** Components **must consume Layer 2 tokens only**. Never use raw palette values inside components.css or page CSS. This makes theme switching automatic.

### 4.2 Categories

| Prefix | Purpose |
|---|---|
| `--color-*` | Raw palette |
| `--bg-*` | Background surfaces (primary, secondary, elevated, frosted, hover, input) |
| `--text-*` | Text colors (primary, secondary, tertiary, muted, inverse) |
| `--border-*` | Border colors (primary, secondary, hover, focus, active) |
| `--accent-*` | Violet accent variants (primary, hover, glow, subtle) |
| `--font-*` | Font families and weights |
| `--text-*` (size) | Type scale (caption → display) |
| `--spacing-N` | Spacing scale (4, 6, 8, 10, 12, 14, 16, 20, 22, 24, 28, 32, 40, 44, 48, 56, 64, 80) |
| `--radius-*` | Border radii (xs 4, sm 6, md 8, ui 10, lg 16, cards 24, largecards 40, panels 42, pill 9999) |
| `--shadow-*` | Shadows (subtle, float, card, dropdown, modal, glow) |
| `--z-*` | Z-index scale (base 1 → tooltip 700) |
| `--transition-*` | Timing tokens (fast 150ms, base 250ms, slow 400ms, sidebar 300ms) |

### 4.3 File-Type Colors

For file icons:
```css
--file-image: #f472b6;
--file-video: #a78bfa;
--file-audio: #34d399;
--file-document: #60a5fa;
--file-archive: #fbbf24;
--file-code: #fb923c;
```

Used in `.ftype-icon.image`, `.ftype-icon.video`, etc.

---

## 5. Theme System (`css/themes.css` + `js/theme.js`)

### 5.1 How It Works

- `<html data-theme="dark">` (or `"light"`) drives all styling
- `themes.css` defines both dark and light variable sets under `[data-theme="dark"]` and `[data-theme="light"]`
- `theme.js` toggles the attribute and persists the choice to `localStorage`

### 5.2 API — `window.Theme`

```js
Theme.init()          // called automatically on DOMContentLoaded
Theme.toggle()        // flip dark ↔ light
Theme.set('dark')     // explicitly set
Theme.get()           // → 'dark' | 'light'
Theme.isDark()        // → boolean
Theme.onChange(fn)    // subscribe; fn(newTheme, oldTheme)
```

### 5.3 System Preference

- If no stored preference exists, it reads `prefers-color-scheme`
- Users can pick "System" in Settings → this **removes** the stored key so the OS pref takes over
- Cross-tab sync via `storage` event

### 5.4 Toggle UI Patterns

Any element matching `.theme-toggle` or `[data-theme-toggle]` becomes a toggle. Icons `.icon-sun` / `.icon-moon` inside auto-swap visibility based on current theme.

Settings page uses `<button class="theme-option" data-theme-value="dark|light|system">` for the picker.

### 5.5 Meta Theme Color

The mobile browser chrome color updates via `<meta name="theme-color">` — dark = `#0a0a0a`, light = `#fafafa`.

---

## 6. Layout System (`css/layout.css`)

### 6.1 App Shell

```
.app-shell
├── .sidebar (fixed, left, 260px | 72px collapsed)
├── .sidebar-overlay (mobile only)
└── .main-area (margin-left matches sidebar width)
    ├── .topbar (sticky, 64px)
    └── .page (padded content area, max 1440px)
```

The `.main-area`'s `margin-left` transitions with the sidebar via `~` sibling selector:
```css
.sidebar.is-collapsed ~ .main-area { margin-left: 72px; }
```

### 6.2 Sidebar (`js/sidebar.js`)

**States:**
- **Desktop expanded** (default, 260px)
- **Desktop collapsed** (`is-collapsed` class, 72px) — labels hidden, tooltips shown on hover
- **Mobile hidden** (transform: translateX(-100%))
- **Mobile open** (`is-mobile-open` class + `.sidebar-overlay.is-visible`)

**Breakpoint:** `≤860px` = mobile mode.

**Interactions:**
| Trigger | Result |
|---|---|
| Click `.sidebar-collapse-btn` (desktop) | Toggle collapsed |
| Click `.mobile-menu-btn` (mobile) | Open drawer |
| Click overlay | Close drawer |
| Click any nav item (mobile) | Auto-close drawer after 150ms |
| Double-click `.brand` (desktop) | Toggle collapsed |
| Swipe right from left edge (mobile) | Open drawer |
| Swipe left on open drawer (mobile) | Close drawer |
| `Cmd/Ctrl + B` | Toggle |
| Arrow keys inside sidebar | Navigate nav items |
| Escape (mobile, open) | Close drawer |

**Persistence:** Desktop collapsed state → `localStorage['afm:sidebar-collapsed']`.

**API — `window.Sidebar`:**
```js
Sidebar.init()
Sidebar.toggle()
Sidebar.collapse()
Sidebar.expand()
Sidebar.getState()   // { collapsed, mobileOpen, mobile }
Sidebar.onChange(fn)
```

### 6.3 Sidebar Anatomy

```html
<aside class="sidebar">
  <div class="sidebar-header">        → brand + logo
  <div class="sidebar-body">           → scrollable nav area
    <div class="nav-group">
      <div class="nav-group-label">    → hidden when collapsed
      <a class="nav-item" data-nav="X"> → active state added by JS
        <span class="nav-icon">
        <span class="nav-label">       → hidden when collapsed
        <span class="nav-badge">       → hidden when collapsed
    <div class="storage-card">         → compact when collapsed
  <div class="sidebar-footer">
    <div class="sidebar-user">          → avatar-only when collapsed
```

**Active nav detection:** `js/app.js → markActiveNav()` reads `document.body.dataset.page` and adds `.is-active` to matching `.nav-item[data-nav="<page>"]`.

### 6.4 Topbar

Always contains:
- `.topbar-left`: mobile menu button + breadcrumb
- `.topbar-center`: global search (hidden on mobile)
- `.topbar-right`: theme toggle, notifications, primary CTA

Uses `backdrop-filter: blur(16px)` + `--bg-topbar` (translucent).

### 6.5 Grid Utilities

```css
.grid-stats           → auto-fit minmax(230px, 1fr)
.grid-2 / .grid-3 / .grid-4   → fixed columns
.grid-sidebar-split   → 1.6fr + 0.9fr (collapses to 1fr under 1200px)
.grid-files           → auto-fill minmax(190px, 1fr) for file cards
```

---

## 7. Component System (`css/components.css`)

All reusable components. Conventions:

### 7.1 Buttons

| Class | Purpose |
|---|---|
| `.btn` | Base — pill shape, 10px vertical padding |
| `.btn-primary` | White fill on dark / black fill on light |
| `.btn-accent` | Violet subtle background + accent border |
| `.btn-ghost` | Transparent + hairline border |
| `.btn-subtle` | No border, tag background |
| `.btn-danger` | Error color scheme |
| `.btn-sm` / `.btn-lg` | Size modifiers |
| `.btn-icon` | Square icon-only (36px), or `.btn-icon-sm` (28px) |
| `.btn-group` | Wraps multiple `.btn-icon`, e.g. list/grid toggle |

Icons inside buttons are 16×16 by default (14 for sm, 18 for lg).

### 7.2 Cards

```html
<div class="card">              → 24px radius, hairline border
  <div class="card-header">
    <h3 class="card-title">
    <p class="card-desc">
  <div class="card-body">
  <div class="card-footer">
```

Modifiers: `.card-hover`, `.card-flush`, `.card-sm`, `.card-accent` (adds violet gradient hairline on top).

### 7.3 Forms

- `.field` — vertical stack of label + input + hint
- `.input`, `.textarea`, `.select` — all use `--radius-ui: 10px`
- `.search-field` — pill-shaped with icon left, keyboard hint right
- `.checkbox` — custom, SVG check inside `.box`
- `.switch` — pill toggle with `.track`
- `.segmented` — pill group of small buttons

### 7.4 Overlays

| Component | Class | Notes |
|---|---|---|
| Modal | `.modal-backdrop` > `.modal` | `.is-open` triggers reveal |
| Toast | `.toast-stack` > `.toast.<type>` | Auto-dismiss, hover pauses |
| Dropdown | `.dropdown` > `.dropdown-menu` | Toggled by `[data-dropdown="id"]` |
| Tooltip | `[data-tip="text"]` | Pure CSS, positioned above |
| Context menu | `.context-menu` | Programmatic (see `AFM.ContextMenu`) |
| Drawer | `.drawer` | Slides in from right, `.is-open` |
| Drop overlay | `.drop-overlay` | Full-screen drag/drop hint |

### 7.5 Feedback

- `.badge` variants: `-accent`, `-success`, `-warning`, `-error`, `-info`, `-dot` (live dot prefix)
- `.tag` — 10px radius, not pill (per design system rule)
- `.progress` + `.progress-bar` (add `.is-striped` for shimmer)
- `.spinner` — 18px circular loader
- `.skeleton` — shimmer placeholder
- `.empty-state` — icon + title + description

### 7.6 Signature Components

**Frosted Glass Panel (`.frosted-panel`)**
```css
background: rgba(212, 212, 212, 0.08);
backdrop-filter: blur(10px);
border: 1px hairline;
border-radius: 24px;
```

**Status Banner Pill (`.status-banner`)**
Sparkle icon + text + arrow, hover translates arrow right.

**Numbered Feature Row (`.numbered-row`)**
```html
<div class="numbered-row">
  <div class="numbered-name">Feature name</div>
  <div class="numbered-index">01</div>
</div>
```
Hover reveals violet gradient underline (`::after` width transition).

---

## 8. Shared JavaScript (`js/app.js`)

Everything here is available as `window.AFM.*`.

### 8.1 Icon System

**Format:** Lucide-style, 1.6px stroke, 24×24 viewBox, `currentColor` fill.

**Usage patterns:**

1. **Inline JS:** `icon('folder', 18)` → returns SVG string
2. **HTML placeholder:** `<i data-icon="folder" data-icon-size="18"></i>` → replaced on DOM ready via `hydrateIcons()`

**To add a new icon:** append to the `Icons` object in `app.js` as a paths-only string (no `<svg>` wrapper).

### 8.2 DOM Helpers

```js
$(sel, ctx)           // querySelector
$$(sel, ctx)          // querySelectorAll → Array
el(tag, attrs, html)  // element factory
on(target, evt, sel, handler)  // event delegation
```

### 8.3 Format Utilities (`AFM.Format`)

| Method | Example |
|---|---|
| `bytes(n)` | `1536` → `"1.5 KB"` |
| `bytesParts(n)` | `{ value: "1.5", unit: "KB" }` |
| `compact(n)` | `1234567` → `"1.2M"` |
| `number(n)` | `1234567` → `"1,234,567"` |
| `speed(bps)` | → `"4.2 MB/s"` |
| `duration(s)` | `134` → `"2m 14s"` |
| `date(d)` | → `"Mar 14, 2025"` |
| `dateTime(d)` | → `"Mar 14, 14:32"` |
| `relative(d)` | → `"3 hours ago"` |
| `percent(r)` | `0.87` → `"87%"` |
| `pad(n)` | `3` → `"03"` |
| `middle(str, max)` | truncate middle preserving extension |

### 8.4 File Type Resolution

```js
resolveType('report.pdf')
// → { key: 'document', icon: 'fileText', label: 'Document', ext: 'pdf' }

resolveType('MyFolder', true)
// → { key: 'folder', icon: 'folder', label: 'Folder', ext: '' }
```

`key` matches CSS classes (`.ftype-icon.document`, `.ftype-icon.folder`, etc.).

### 8.5 Toast

```js
AFM.Toast.success(title, msg?, duration?)
AFM.Toast.error(title, msg?, duration?)
AFM.Toast.warning(title, msg?, duration?)
AFM.Toast.info(title, msg?, duration?)
```

Auto-creates `.toast-stack` container. Hover pauses auto-dismiss.

### 8.6 Modal

```js
Modal.open(id)        // string or element
Modal.close(id?)      // omit to close current
Modal.closeAll()

// Programmatic prompts return promises
await Modal.confirm({ title, message, confirmText, cancelText, danger, iconName })
// → boolean

await Modal.prompt({ title, label, value, placeholder, confirmText, hint })
// → string | null
```

**HTML declarative usage:**
```html
<button data-modal-open="myModal">Open</button>
<button data-modal-close>Close</button>  <!-- closes containing modal -->
```

### 8.7 Dropdown

```html
<button data-dropdown="menuId">Trigger</button>
<div class="dropdown-menu" id="menuId">...</div>
```

Auto-closes on outside click, Escape, or another dropdown opening. Managed by `Dropdown.init()`.

### 8.8 Context Menu

```js
ContextMenu.show(x, y, [
  { label: 'Preview',    icon: 'eye',   action: () => ... },
  { label: 'Download',   icon: 'download', shortcut: 'D', action: fn },
  { divider: true },
  { label: 'Delete',     icon: 'trash', danger: true, action: fn },
]);
ContextMenu.hide();
```

Auto-clamps position inside viewport.

### 8.9 Storage (`AFM.Store`)

Namespaced localStorage wrapper — all keys prefixed with `afm:`.

```js
Store.get('key', fallback)
Store.set('key', value)   // auto-JSON
Store.remove('key')
```

### 8.10 Other Utilities

```js
copyToClipboard(text, successMsg?)   // async, with Toast feedback
debounce(fn, wait)
throttle(fn, limit)
uid(prefix)                          // → "id_x8fg2k"
clamp(v, min, max)
randBetween(min, max)
escapeHtml(str)
countUp(node, target, opts)          // animated number
initScrollReveal(selector)           // IntersectionObserver reveal
```

### 8.11 Keyboard Shortcuts (`initShortcuts()`)

| Combo | Action |
|---|---|
| `Cmd/Ctrl + K` | Focus global search |
| `Cmd/Ctrl + B` | Toggle sidebar |
| `Cmd/Ctrl + J` | Toggle theme |
| `Escape` | Close modals, dropdowns, context menus |

Elements with class `.kbd-mod` auto-fill with `⌘` (Mac) or `Ctrl` (other).

### 8.12 Initialization Flow

`initApp()` runs on `DOMContentLoaded`:
1. `hydrateIcons()` — swap `<i data-icon>` for SVG
2. `Dropdown.init()`
3. `initModalBindings()` — bind `data-modal-open/close`
4. `initCopyButtons()` — bind `data-copy`
5. `initShortcuts()`
6. `attachRipples()` — Material-style click ripples
7. `markActiveNav()`
8. `initScrollReveal()`

---

## 9. Page-Specific Modules

Each page module is an IIFE-style singleton exposed on `window`. They only initialize if `document.body.dataset.page` matches.

### 9.1 Dashboard (`js/dashboard.js` — for `index.html`)

**Renders (all mock data inside module):**
- 4 stat cards with animated counters + sparklines
- 14-day stacked bar chart (Uploads/Downloads/Shares)
- Storage donut (SVG, 6 segments, animated stroke-dashoffset)
- Activity feed (7 items)
- Top downloads rank list (5 items)
- Numbered capabilities list (7 items)
- Server health (5 metrics with progress bars)
- Quick actions grid (6 tiles)

**Live updates:** `startLiveUpdates()` nudges server health values every 4.2s to simulate real-time.

**Interactions:**
- Quick action tiles with `data-quick` attribute → handled in `bindActions()`
- Refresh button → re-renders stats and chart
- Donut legend hover → highlights corresponding segment

### 9.2 Files Browser (`js/files.js` — for `files.html`)

**State object** owns everything:
```js
state = {
  all: [],              // full dataset
  filtered: [],         // after filter/search/sort
  view: 'list'|'grid',
  sort: { key, dir },
  filter: 'all'|'folder'|'image'|...,
  search: '',
  selected: Set<id>,
  page: number,
  perPage: number,
  currentFolder: 'root',
}
```

**Data flow:**
```
User action → mutate state → applyFilters() → renderView() → bindRowInteractions()
```

**Renderers:**
- `renderTree()` — recursive folder tree (nodes toggle via `.is-open`)
- `renderFilterChips()` — dynamic counts per type
- `renderList()` — table view with sortable columns
- `renderGrid()` — card view
- `renderFooter()` — pagination with smart ellipsis
- `renderEmpty()` — empty state

**Features:**
- Sortable columns (click header → toggle asc/desc)
- Filter chips (persist to `applyFilters`)
- Debounced search (180ms)
- Select all / individual (indeterminate state supported)
- Bulk action bar (`#bulkBar`) appears when `selected.size > 0`
- File details drawer (`#fileDrawer`) — opens on row click
- Right-click context menu — full action set
- Drag-and-drop overlay (`#dropOverlay`) — window-wide
- View mode persisted to `Store.get('files-view')`
- Breadcrumb reflects current folder

### 9.3 Uploads Manager (`js/uploads.js` — for `uploads.html`)

**Simulated upload engine** — no real network calls.

**State:**
```js
state = {
  queue: [{ id, name, size, uploaded, speed, status, ... }],
  concurrency: 3,
  activeCount: 0,
  destination: '/releases/2025',
  preset: 'balanced',
  options: { autoStart, overwrite, preservePath, compress },
  metrics: { totalFiles, totalUploaded, totalBytes, bytesUploaded, speedHistory },
  ticker: null,  // setInterval handle
}
```

**Upload lifecycle:**
```
addFiles() → status='queued'
  → startUploads() → setInterval(tick, 200ms)
    → fillActive() promotes queued to 'uploading' (up to concurrency)
    → tick() increments uploaded bytes with jitter, random 0.15% failure chance
    → on complete: status='done', Toast fires, next queued item starts
    → on error: status='failed', can be retried
  → when queue idle: clearInterval, ticker=null
```

**Item states:** `queued` → `uploading` → `done` | `failed` | `paused`

**UI updates:**
- `renderQueue()` — full re-render (used on add/remove)
- `renderQueueItem(id)` — targeted single-item re-render (status changes)
- `updateItemProgress(item)` — DOM-only micro-update per tick (no innerHTML)
- `renderGlobalProgress()` — overall bar + ETA
- `renderMetrics()` — 4 metric tiles + live speed graph

**Presets** — 4 configurations (Fast/Balanced/Optimize/Secure), each sets `concurrency` and `compress` on selection.

**Dropzone** binds to `#dropzone`, `#fileInput`, `#folderInput`. Whole-window drag-and-drop supported.

### 9.4 Settings (`settings.html` — inline `<script>`)

Uses a single inline IIFE (no separate `settings.js` file). This is intentional because settings logic is short and page-specific.

**Features:**
- Pane switcher: `.settings-nav-item[data-pane]` swaps `.settings-pane[data-pane-content]`
- Deep-link support: `?pane=security` auto-selects pane
- Sticky save bar (`#saveBar`) appears on any `change`/`input` in `.settings-content`
- `beforeunload` warning if dirty
- Danger zone confirmations via `Modal.confirm`
- Theme picker changes bypass dirty state (they're instant)

---

## 10. HTML Page Conventions

### 10.1 Every page includes:

```html
<html lang="en" data-theme="dark">
<body data-page="<pageId>">    <!-- dashboard|files|uploads|settings -->
  <div class="app-shell">
    <aside class="sidebar">...</aside>
    <main class="main-area">
      <header class="topbar">...</header>
      <div class="page">
        <!-- page content -->
      </div>
    </main>
  </div>
  <!-- Overlays: modals, toasts, drawers, dropdowns (outside .app-shell) -->
  <!-- Scripts in strict order -->
</body>
```

### 10.2 Sidebar HTML is duplicated across all 4 pages

**Why:** No template engine, no framework. Trade-off: if you add a nav item, update all 4 HTML files.

**Consistency check:** Every sidebar contains identical structure — nav-groups (Overview, Library, System) + storage-card + user footer.

### 10.3 Icons in HTML

Use the placeholder pattern:
```html
<i data-icon="folder" data-icon-size="18"></i>
```

`hydrateIcons()` in `app.js` replaces these with real SVG on load. **Never write SVG inline in HTML** except for the logo mark and hero mockup (which are one-offs).

### 10.4 Semantic ARIA

- Sidebar: `<aside aria-label="Primary navigation">`
- Topbar: `<header>`
- Buttons that trigger overlays: `aria-label`, `aria-expanded` where relevant
- Modals: `role="dialog" aria-modal="true"`
- Icons: `aria-hidden="true"` (they're decorative; text always accompanies)
- Live regions: `<div class="toast-stack" aria-live="polite">`

---

## 11. Responsive Breakpoints

| Breakpoint | Behavior |
|---|---|
| `≤1280px` | Reduced heading sizes |
| `≤1200px` | Sidebar-split grids collapse; 4-col → 2-col |
| `≤1024px` | 3-col → 2-col; some table columns hidden (`.col-downloads`, `.col-type`) |
| `≤860px` | **Mobile mode:** sidebar becomes drawer; grids stack; topbar center hidden; more table cols hidden |
| `≤560px` | Table `.col-size` hidden; hero actions stack; grids single-column |
| `≤480px` | Reduced body font, card padding |

Utility class `.hide-mobile` hides an element ≤768px.

---

## 12. Animation & Motion

### 12.1 Global Keyframes (in `base.css`)

- `fadeIn`, `fadeInUp`, `fadeInDown`
- `slideInRight`
- `scaleIn`
- `pulse`, `spin`
- `shimmer` (for skeletons and progress stripes)
- `ripple`

### 12.2 Timing

Use tokens, never hardcode:
```css
transition: all var(--transition-base);   /* 250ms */
```

### 12.3 Stagger Pattern

For grid reveals, animation-delay is set inline:
```html
<div class="stat-card" style="animation-delay:120ms">
```

Or utility classes `.stagger-1` (50ms) through `.stagger-6` (300ms).

### 12.4 Reduce Motion

Settings has a "Reduce motion" toggle, but currently only a UI stub — implement by adding `[data-motion="reduced"]` overrides if requested.

---

## 13. Adding a New Page — Checklist

1. Create `<newpage>.html` — copy sidebar + topbar from an existing page
2. Set `<body data-page="newpage">`
3. Create `css/<newpage>.css` — link it after `components.css`
4. Create `js/<newpage>.js` — guard init with `body.dataset.page === 'newpage'`
5. Add nav entry in the sidebar of **all 4 existing pages** with `data-nav="newpage"`
6. If it should appear active, use `data-nav` matching the page id

---

## 14. Adding a New Component — Checklist

1. Add styles to `components.css` (if reusable) or the page's CSS file
2. **Use semantic tokens only** — never raw palette values
3. If it needs an icon, add to `Icons` object in `app.js`
4. If interactive, prefer event delegation via `on(document, 'click', '.selector', fn)`
5. Add ARIA where needed
6. Test in both themes (`Theme.toggle()` from console)
7. Test at 860px, 560px, 480px breakpoints

---

## 15. Extension Points / Real Backend Integration

When wiring to a real backend, replace these mock-data sources:

| File | Mock function | Replace with |
|---|---|---|
| `dashboard.js` | `stats`, `chartData`, `storageBreakdown`, `activities`, `topFiles`, `serverHealth` arrays | API fetches |
| `files.js` | `makeFiles()`, `folderTree` const | `GET /api/files`, `GET /api/folders` |
| `uploads.js` | `tick()` simulation loop | Real `XMLHttpRequest` / `fetch` with progress events |
| `settings.html` | Inline mock save handlers | `PATCH /api/settings` |

**Upload engine:** Replace the `tick()` interval with per-file `XMLHttpRequest` (needed for progress events, which `fetch` doesn't natively support well). The state shape is already compatible.

---

## 16. Conventions Summary

| Concern | Convention |
|---|---|
| **CSS variables** | Semantic tokens only in components; raw palette only in `themes.css` |
| **JS module pattern** | IIFE with `return { publicApi }` + `window.<Name>` export |
| **Event binding** | Prefer delegation on `document` for dynamic content |
| **HTML structure** | Sidebar duplicated across pages — update in sync |
| **Icons** | `<i data-icon="name">` placeholders, hydrated on load |
| **Color usage** | Only Layer 2 tokens; violet only in gradients |
| **Border radius** | 4/6/8/10 for UI, 16 for compact cards, 24 for cards, 40 for hero, 9999 for pills |
| **Spacing** | Use tokens `--spacing-N` (multiples of 2 up to 80) |
| **Typography** | DM Sans for UI, Geist for section titles; never bolder than 600 |
| **Shadows** | Rarely used; prefer `--shadow-subtle` (1px inset) or `--shadow-card` (very soft) |
| **Focus** | `:focus-visible` with 2px violet outline, 2px offset |
| **Persistence** | `localStorage` via `AFM.Store` with `afm:` prefix |

---

## 17. Global Namespace Map

```
window.AFM = {
  Icons,           // icon path dictionary
  icon,            // (name, size, cls) → svg string
  hydrateIcons,    // (root) → replace <i data-icon>
  $, $$, el, on,   // DOM helpers
  Format,          // formatting utilities
  FileTypes, resolveType,
  Toast,           // .success/.error/.warning/.info
  Modal,           // .open/.close/.closeAll/.confirm/.prompt
  Dropdown,        // .init/.closeAll
  ContextMenu,     // .show/.hide
  copyToClipboard,
  Store,           // localStorage wrapper
  debounce, throttle, uid, clamp, randBetween, escapeHtml,
  countUp,
  initScrollReveal,
}

window.Theme = {
  init, toggle, set, get, isDark, onChange
}

window.Sidebar = {
  init, toggle, collapse, expand, getState, onChange
}

window.Dashboard = { init }   // only on dashboard page
window.Files     = { init }   // only on files page
window.Uploads   = { init }   // only on uploads page
```

---

## 18. Known Limitations & TODOs

- No routing — each page is a separate HTML file, no client-side routing
- No auth — user profile in sidebar is static ("Sarah Chen · Administrator")
- No real uploads — engine is simulated; replace `tick()` for production
- No i18n — English only; Language dropdown in Settings is UI-only
- No accessibility audit — ARIA is added best-effort; run axe DevTools before shipping
- Global search input is decorative — `Cmd+K` focuses it but nothing consumes the value
- Reduce Motion toggle is UI-only — needs implementation
- Sidebar HTML is duplicated 4x — a small build step (or SSI include) would DRY this up

---

## 19. Quick Debugging Reference

| Symptom | Check |
|---|---|
| Icons not appearing | Did `hydrateIcons()` run? Is the name in `Icons` dict? |
| Theme not persisting | Check `localStorage['afm:theme']` |
| Sidebar not collapsing | Check `.sidebar-collapse-btn` exists; check breakpoint (≤860 forces mobile mode) |
| Page module not running | Check `<body data-page="X">` matches guard in JS |
| Modal not opening | Check `.modal-backdrop.is-open` class applied; z-index conflict? |
| Dropdown not closing | Check `Dropdown.init()` ran (called in `initApp`) |
| Nav item not highlighting | Check `data-nav` attribute matches `body[data-page]` |
| Colors not switching in light mode | Component using raw palette instead of Layer 2 token |
| Chart not rendering | Check target element ID exists; check state.all is populated |
| Upload progress stuck | Check `state.ticker` is not null; `activeCount` might be off |

---

**End of architecture document.**

For the design system reference, see `design.md`.
For run instructions, see the main project README (or open any HTML file directly in a browser — no build required).
