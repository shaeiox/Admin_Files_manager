# REPO_MAP.md — Repository Navigation Map

> Where things live and how they connect. Pair with `AGENTS.md` (rules) and `docs/CONTRACTS.md` (schemas).

## Directory Tree

```
admin-files-manager/
├── server.js                     # ⭐ ENTRY POINT — Express app assembly + boot
├── package.json                  # Scripts & dependencies (CommonJS); `test` is scoped to test/**/*.test.js
├── nodemon.json                  # Dev reload ignores data/*, public/*
├── .env                          # PORT, STORAGE_ROOT, optional UPLOAD_MAX_BYTES — git-ignored, never commit
├── temp/                         # Scratch (git-ignored; never discovered by npm test)
│
├── src/                          # ─── Backend ───
│   ├── config/
│   │   └── env.js                # Env loader + boot-time guard (exits if STORAGE_ROOT missing)
│   ├── routes/
│   │   ├── fs.routes.js          # /api/fs router — wires endpoints to controller fns
│   │   └── dashboard.routes.js   # /api/dashboard router — /summary + /health (read-only, no fs remount)
│   ├── controllers/
│   │   ├── fs.controller.js      # HTTP handlers: parse/validate → call services → respond (list, upload, star, ZIP…)
│   │   ├── preview.controller.js # GET /api/fs/thumbnail[/capability] — bounded previews or an explicit "unavailable"
│   │   └── dashboard.controller.js  # Composes services into the dashboard DTO; shapes the response
│   ├── services/                 # 🔒 All filesystem + metadata access (no Express here)
│   │   ├── PathService.js        # Client path ⇄ secure OS path; traversal guard (THE boundary)
│   │   ├── FileSystemService.js  # stat/readdir/mkdir/rename/rm/unlink → AppError; tree/volume/health aggregation
│   │   ├── MetadataService.js    # JSON-file DB (data/metadata.json), atomic writes, singleton
│   │   ├── UploadService.js      # Multer engine + staging: placement decided after the body is parsed; overwrite; size cap
│   │   └── PreviewService.js     # Thumbnail capability + bounded transform (only if a transformer is installed)
│   ├── middlewares/
│   │   └── errorHandler.js       # Global error serializer ({ success:false, error })
│   └── utils/
│       ├── AppError.js           # Error class carrying HTTP statusCode
│       ├── validators.js         # validateFileName / validateClientPath
│       ├── fileTypes.js          # File-type taxonomy (CATEGORIES/EXTENSION_MAP) — single server-side source, = client FileTypes
│       └── concurrency.js        # mapWithConcurrency — bounded, order-preserving async map (listing enrichment)
│
├── public/                       # ─── Frontend SPA (served statically, no build) ───
│   ├── index.html                # Dashboard page        (data-page="dashboard")
│   ├── files.html                # File browser page     (data-page="files")
│   ├── uploads.html              # Upload manager page   (data-page="uploads")
│   ├── settings.html             # Settings page         (data-page="settings")
│   └── assets/
│       ├── css/                  # Load order matters: tokens → base → themes → layout
│       │   ├── tokens.css        # Design tokens (colors/spacing/type)
│       │   ├── base.css          # Reset + utilities
│       │   ├── themes.css        # Dark/light theme overrides via [data-theme]
│       │   ├── layout.css        # App shell, sidebar, topbar
│       │   ├── components.css    # Buttons, modals, toasts, tables, dropdowns
│       │   └── dashboard|files|uploads|settings.css   # Page-specific styles
│       └── js/
│           ├── app.js            # ⭐ Shared core: Icons, Format, Toast, Modal, Dropdown, $
│           ├── api.js            # ⭐ API client (window.API): fetch wrapper, XHR upload, iframe downloads
│           ├── theme.js          # Theme controller (loaded first, pre-CSS)
│           ├── sidebar.js        # Sidebar collapse + mobile drawer
│           ├── dashboard.js      # Page module (index.html)
│           ├── files.js          # Page module (files.html) — see "Files page module" below
│           ├── uploads.js        # Page module (uploads.html) — queue, progress, presets, destination
│           │                     #   check/creation, recent uploads from activity; `Uploads.pure` +
│           │                     #   `Uploads._controller` are test seams
│           └── settings.js       # Page module (settings.html)
│
├── data/                         # ─── Runtime artifacts — NOT checked in ───
│   └── .gitkeep                  # Tracked placeholder so the dir exists. MetadataService
│                                   creates data/metadata.json LAZILY at first write; it does
│                                   not exist before the first run and is git-ignored
│                                   (`data/*.json`, `!data/.gitkeep`).
│
├── test/                         # ─── Tests (`npm test` → node:test, zero deps) ───
│   ├── services/
│   │   ├── PathService.test.js              # traversal / containment guard
│   │   ├── FileSystemService.tree.test.js   # bounded, link-skipping tree aggregation
│   │   ├── FileSystemService.rename.test.js # same-directory rename + metadata carry-over
│   │   ├── FileSystemService.volume.test.js # statfs → usedBytes/totalBytes, null degradation
│   │   ├── MetadataService.test.js
│   │   └── MetadataService.dashboard.test.js# activities / top-download ranking inputs
│   ├── api/
│   │   ├── dashboard.contract.test.js       # GET /api/dashboard/summary + /health payload shape
│   │   ├── fs.contract.test.js              # /api/fs/* against a live server: upload placement ON DISK,
│   │   │                                    #   overwrite/size, listing taxonomy + resilience, star, ZIP, previews
│   │   └── upload.surface.test.js           # upload error surface: no stack in any configuration (incl. a
│   │                                        #   child `node server.js` with NODE_ENV unset), authored reasons
│   │                                        #   forwarded, generic text for the rest, status per failure class
│   ├── integration/
│   │   ├── live-server.test.js              # traversal guard wired into the running app
│   │   ├── error-disclosure.test.js         # no stack / no path in error bodies
│   │   └── escaping.test.js                 # hostile name placed out of band → listed → rendered as text
│   ├── utils/
│   │   └── fileTypes.test.js                # server taxonomy == client FileTypes; no inline copy in the controller
│   └── frontend/
│       ├── app.test.js                      # shared core helpers (panel states, storage display)
│       ├── dashboard.test.js                # dashboard renderers, no-history guarantees
│       ├── files.test.js                    # files.js in a vm with stub DOM/API: states, navigation, selection,
│       │                                    #   a11y semantics, escaping, and source-level guards
│       └── uploads.test.js                  # uploads.js in a vm with stub DOM/API/XHR: queue derivations, failure
│                                            #   kinds, escaping, destination gate, honesty + a11y source guards
│
└── docs/                         # ─── Project brain (reference docs, NOT runtime code) ───
    ├── REPO_MAP.md               # ← you are here (this file is the authoritative map)
    ├── CONTRACTS.md              # API + data schemas
    ├── architecture.md           # Frontend-era deep-dive. Read its §0 "Status" first:
    │                             # design-system sections are current, "mock data" ones are not
    ├── STRUCTURE.md              # ⚠ Outdated frontend-era map (see AGENTS.md stale-tree guard)
    ├── backend-checklist.md      # Phase checklist
    ├── checklist..md             # Legacy checklist (typo name kept as-is)
    └── decisions/
        ├── ADR-001-architecture-baseline.md
        ├── ADR-002-dashboard-data-architecture.md
        └── ADR-003-files-page-integrity.md      # upload placement, taxonomy, star, page-scoped selection,
                                                 #   previews, list focus model, security posture
```

## Entry Points

| Entry | Trigger | What it does |
|---|---|---|
| `server.js` | `npm start` / `npm run dev` | Builds middleware chain (helmet → cors → json → urlencoded → morgan → static), then mounts `/api/health`, `/api/fs`, and `/api/dashboard`, adds the API 404 catch-all, HTML fallback for SPA, global `errorHandler`, listens on `config.port` |
| `src/config/env.js` | Imported first by `server.js` | Loads `.env`, hard-exits if `STORAGE_ROOT` is unset |
| `public/index.html` | Browser GET `/` | Dashboard; other pages are sibling HTML files |
| `test/**/*.test.js` | `npm test` (`node --test "test/**/*.test.js"`) | Zero-dependency `node:test` suites; discovery is scoped to `test/`, so a scratch `*.test.js` elsewhere cannot break the suite. Every server-booting suite points `MetadataService.dbPath` at a temp file — parallel test processes must never write the real `data/metadata.json` |

### ⚠ Mount order in `server.js` is load-bearing, not cosmetic

```
/api/health  →  /api/fs  →  /api/dashboard  →  app.use('/api', catch-all)  →  SPA fallback  →  errorHandler
```

The `/api` 404 catch-all is a **two-argument middleware** (`(req, res) => …`) that sends its
response and **never calls `next()`**. It therefore *terminates* the chain for every `/api/*` path
that reaches it. Anything mounted after it is **unreachable** — not "shadowed", not "deprioritised":
never invoked at all.

So `/api/dashboard` **must** be mounted *before* that catch-all. Mounting it after produces a
server that boots cleanly, logs no error, and 404s on every dashboard request — a silent failure
with no stack trace to follow. When adding a new router under `/api`, insert it above the catch-all
and verify the ordering in the same change.

## Module Boundaries

```
┌─────────────── Browser ────────────────┐
│  HTML pages (data-page="…")            │
│  page modules: files.js, uploads.js…   │
│        │ only via window.API           │
│  shared core: app.js, theme.js, …      │
└──────────────┬─────────────────────────┘
               │ HTTP JSON / multipart / streams
┌──────────────▼─────────────── Backend ────────────────────────┐
│ server.js (middleware chain)                                   │
│   → routes/fs.routes.js      [routing only]                    │
│     → controllers/fs.controller.js  [parse, validate, format]  │
│       → services/  [🔒 ALL disk + metadata access]             │
│         ├─ PathService  (client path → secure OS path)         │
│         ├─ FileSystemService (stat/readdir/mkdir/rename/rm)    │
│         ├─ UploadService (multer staging → final placement)    │
│         ├─ PreviewService (bounded thumbnails, optional)       │
│         └─ MetadataService (data/metadata.json, fire-and-forget)│
│       → utils/validators.js → utils/AppError.js                │
│   → middlewares/errorHandler.js (last middleware, catches all)  │
└────────────────────────────────────────────────────────────────┘
```

**Dependency rules**

- `routes → controllers → services → (fs | path | env)`; `utils` and `config` are shared leaves.
- Services never import Express, `req`, or `res` — they take/return plain data.
- Controllers may use `archiver` for HTTP-specific streaming but must not touch `fs` themselves
  except the download stream (`fs.createReadStream(stats.securePath)`), which is mediated by
  `PathService`. Multer's storage engine, staging and placement live in `UploadService`.
- Frontend page modules depend on `app.js` + `api.js`; they must not duplicate API calls.

## Read Path (dashboard aggregation)

There is **no `DashboardService`**, and that is deliberate. `dashboard.controller.js` composes the
existing services directly, matching the idiom already established in `fs.controller.js`. The
controller is the **only** place the dashboard DTO is shaped; services return raw values and never
build a response.

```
GET /api/dashboard/summary   (read-only aggregate → BARE body, no {success,data} envelope)
  dashboard.controller.getSummary
    ├─ FileSystemService.getTreeStats('/')     → files, folders, treeBytes, breakdown, truncated
    ├─ FileSystemService.getVolumeStats('/')   → usedBytes, totalBytes, volumeAvailable   (fs.statfs)
    ├─ MetadataService.getActivities(8)        → activities
    ├─ MetadataService.getTopDownloads(5)      → topFiles (pruned by FileSystemService.retainExisting)
    └─ FileSystemService.getHealthMetrics()    → health  (memory %, uptime s)

GET /api/dashboard/health    (read-only aggregate → BARE array)
  dashboard.controller.getHealth → FileSystemService.getHealthMetrics()

GET /api/health             (liveness + environment → {success, message, env}) — UNRELATED to the
                             endpoint above despite the shared path segment; nothing frontend
                             polls it except the sidebar's identity-less footer
```

Rules worth knowing before you touch this path:

- **Three different byte quantities, never interchangeable.** `treeBytes` = regular-file bytes
  under `STORAGE_ROOT` (directory entries and links excluded). `usedBytes` = *volume* usage
  (`bsize * (blocks - bavail)`). `totalBytes` = *volume* capacity (`bsize * blocks`, using `bsize`
  exactly as reported — it is not assumed to be a power of two). Conflating them produces a number
  that looks plausible and means nothing.
- **Unavailability is `null`, never `0`.** A capacity read that fails yields
  `usedBytes: null, totalBytes: null, volumeAvailable: false` and the response is still **HTTP 200**.
  `0` would read as a real measurement.
- **The tree walk is bounded and link-skipping** (100,000 entries / 2,000 ms). On exhaustion it
  returns the partial result with `truncated: true`. **A truncated total is a wrong total**, so the
  flag is part of the contract, not a diagnostic.
- **`/api/dashboard/*` degrades per capability, not all-or-nothing — but not for *every* capability.**
  An unavailable capacity reading, or an unreadable subtree inside the walk, removes only its own
  contribution and still answers 200. **Metadata is the exception:** `MetadataService._read` throws
  for a corrupt/unreadable store and `getSummary` awaits with `Promise.all`, so that case is a **500**,
  not a degraded 200. Do not extend the degradation pattern to a source that currently fails wholly
  without deciding deliberately which behaviour you want.

## Files page module (`public/assets/js/files.js`)

- **Pure layer** (`Files.pure`): helpers and renderers, state in → HTML string out. Every value from
  the filesystem or the metadata store passes through `esc()` (= `AFM.escapeHtml`) before markup.
- **Controller** (`Files._controller` is the test seam): one delegated listener per stable container
  (`#filesContainer`, `#folderTree`, `#breadcrumb`, `#filterChips`, `#fileDrawer`, …), bound once in
  `init()`. Re-rendering never re-binds, so no control can collect a second handler.
- **Navigation has one owner**, `navigateTo()` → `applyNavigation()`: path, page, filter, search,
  search box, pending-search cancellation, breadcrumb and tree highlight. The only other writer of
  `currentPath` is `syncAfterMutation()` (rename/delete of an ancestor). Tree expansion is state
  (`state.expanded`), not a render rule.
- **Selection is page-scoped** and pruned to rendered ids after every reload; navigation and
  mutations clear it deliberately.
- **List focus model — WAI-ARIA grid with a roving tab index** (recorded decision, ADR-003 §8): one
  tab stop per view (the last focused entry, else the first). Arrow keys / Home / End move; Enter
  opens; Space selects; F2 renames; Delete deletes; Shift+F10 / ContextMenu opens the menu. Only the
  active entry's checkbox and action buttons are tab stops. The tree uses the same pattern with
  ArrowRight/ArrowLeft for expansion.
- **Drawer** is a modal dialog; its Escape handler is registered in the capture phase so it runs
  before `app.js`'s global Escape and only closes the topmost layer.

## Request Lifecycle (typical mutation)

1. `server.js` middleware chain runs (`helmet`, `cors`, `morgan`, body parsing).
2. Route matched in `fs.routes.js` → controller handler.
3. Controller validates input (`validateClientPath`/`validateFileName`) and calls services.
4. `FileSystemService` resolves via `PathService.resolveSecurePath` (throws `403` on traversal) and
   performs async fs work, mapping OS errors (`ENOENT`→404, `EACCES/EPERM`→403) to `AppError`.
5. Metadata updates fire without blocking (`.catch(() => {})`).
6. Mutating endpoints answer with the `{ success: true, ... }` envelope; failures propagate via
   `next(error)` to `errorHandler`, which serialises `{ success: false, error }`.
   **Read-only aggregate endpoints return a bare top-level shape instead** — `GET /api/fs/tree`
   returns a bare array, `GET /api/fs/list` a bare object, `GET /api/dashboard/summary` a bare
   object, `GET /api/dashboard/health` a bare array. See CONTRACTS.md for the full rule.

## Where to Add Things

| Task | Location |
|---|---|
| New filesystem endpoint | `src/routes/fs.routes.js` + `src/controllers/fs.controller.js` |
| New dashboard/aggregate endpoint | `src/routes/dashboard.routes.js` + `src/controllers/dashboard.controller.js` — **mount the router in `server.js` ABOVE the `/api` catch-all** (see *Mount order*), keep it read-only, do **not** re-mount `fsRoutes` inside it |
| New disk operation | `src/services/FileSystemService.js` |
| New aggregation over the tree | `src/services/FileSystemService.js` (return raw values; shape the DTO in the controller) |
| New metadata/entity | `src/services/MetadataService.js` (+ the `data/metadata.json` shape in CONTRACTS.md) |
| New file-type category / extension | `src/utils/fileTypes.js` (`CATEGORIES` + `EXTENSION_MAP`) **and** `public/assets/js/app.js` `FileTypes` in the same change — `test/utils/fileTypes.test.js` fails if they differ. Both the listing and the Dashboard breakdown classify through `classifyFile()` |
| New validation rule | `src/utils/validators.js` |
| New error type / status | `src/utils/AppError.js` (throw it; never `res.status(...).json(...)` an error inline) |
| New shared UI component | `public/assets/js/app.js` + `public/assets/css/components.css` |
| New dashboard panel | `public/assets/js/dashboard.js` (renderer + a `resolvePanelState` input) + a container in `public/index.html` |
| New page module | new `public/assets/js/<page>.js`, gate on `document.body.dataset.page` |
| New page style | new `public/assets/css/<page>.css`, linked after `components.css` |
| Test for a service | `test/services/<Service>.<method>.test.js` (`node:test`, zero deps) |
| Test for an endpoint payload | `test/api/<area>.contract.test.js` |
| Test for frontend helpers | `test/frontend/<module>.test.js` (no browser; real `app.js` + the module in a `vm` context with stub DOM/API — see `files.test.js`) |
| Record a decision | `docs/decisions/ADR-NNN-*.md` + a pointer from this map |
