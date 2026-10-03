# REPO_MAP.md — Repository Navigation Map

> Where things live and how they connect. Pair with `AGENTS.md` (rules) and `docs/CONTRACTS.md` (schemas).

## Directory Tree

```
admin-files-manager/
├── server.js                     # ⭐ ENTRY POINT — Express app assembly + boot
├── package.json                  # Scripts & dependencies (CommonJS)
├── nodemon.json                  # Dev reload ignores data/*, public/*
├── .env                          # PORT, STORAGE_ROOT (never commit)
│
├── src/                          # ─── Backend ───
│   ├── config/
│   │   └── env.js                # Env loader + boot-time guard (exits if STORAGE_ROOT missing)
│   ├── routes/
│   │   ├── fs.routes.js          # /api/fs router — wires endpoints to controller fns
│   │   └── dashboard.routes.js   # /api/dashboard router — /summary + /health (read-only, no fs remount)
│   ├── controllers/
│   │   ├── fs.controller.js      # HTTP handlers: parse/validate → call services → respond
│   │   └── dashboard.controller.js  # Composes services into the dashboard DTO; shapes the response
│   ├── services/                 # 🔒 All filesystem + metadata access (no Express here)
│   │   ├── PathService.js        # Client path ⇄ secure OS path; traversal guard (THE boundary)
│   │   ├── FileSystemService.js  # stat/readdir/mkdir/rename/rm/unlink → AppError; tree/volume/health aggregation
│   │   └── MetadataService.js    # JSON-file DB (data/metadata.json), atomic writes, singleton
│   ├── middlewares/
│   │   └── errorHandler.js       # Global error serializer ({ success:false, error })
│   └── utils/
│       ├── AppError.js           # Error class carrying HTTP statusCode
│       ├── validators.js         # validateFileName / validateClientPath
│       └── fileTypes.js          # File-type taxonomy (CATEGORIES/EXTENSION_MAP) — single server-side source
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
│           ├── files.js          # Page module (files.html) — table/grid, tree, drawer, DnD
│           ├── uploads.js        # Page module (uploads.html) — queue, progress, presets
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
│   │   └── dashboard.contract.test.js       # GET /api/dashboard/summary + /health payload shape
│   └── frontend/
│       ├── app.test.js                      # shared core helpers (panel states, storage display)
│       └── dashboard.test.js                # dashboard renderers, no-history guarantees
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
        └── ADR-002-dashboard-data-architecture.md
```

## Entry Points

| Entry | Trigger | What it does |
|---|---|---|
| `server.js` | `npm start` / `npm run dev` | Builds middleware chain (helmet → cors → json → urlencoded → morgan → static), then mounts `/api/health`, `/api/fs`, and `/api/dashboard`, adds the API 404 catch-all, HTML fallback for SPA, global `errorHandler`, listens on `config.port` |
| `src/config/env.js` | Imported first by `server.js` | Loads `.env`, hard-exits if `STORAGE_ROOT` is unset |
| `public/index.html` | Browser GET `/` | Dashboard; other pages are sibling HTML files |
| `test/**/*.test.js` | `npm test` (`node --test`) | Zero-dependency `node:test` suites; no build step, no test framework config |

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
│         └─ MetadataService (data/metadata.json, fire-and-forget)│
│       → utils/validators.js → utils/AppError.js                │
│   → middlewares/errorHandler.js (last middleware, catches all)  │
└────────────────────────────────────────────────────────────────┘
```

**Dependency rules**

- `routes → controllers → services → (fs | path | env)`; `utils` and `config` are shared leaves.
- Services never import Express, `req`, or `res` — they take/return plain data.
- Controllers may use `multer`/`archiver` for HTTP-specific streaming but must not touch `fs`
  themselves except the download stream (`fs.createReadStream(stats.securePath)`) and Multer
  destination setup — both already mediated by `PathService`.
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
| New file-type category | `src/utils/fileTypes.js` (`CATEGORIES` + `EXTENSION_MAP`) — one source, and `FileSystemService` breakdown keys must match it. ⚠ `fs.controller.js` still carries its own inline copy (known drift) |
| New validation rule | `src/utils/validators.js` |
| New error type / status | `src/utils/AppError.js` (throw it; never `res.status(...).json(...)` an error inline) |
| New shared UI component | `public/assets/js/app.js` + `public/assets/css/components.css` |
| New dashboard panel | `public/assets/js/dashboard.js` (renderer + a `resolvePanelState` input) + a container in `public/index.html` |
| New page module | new `public/assets/js/<page>.js`, gate on `document.body.dataset.page` |
| New page style | new `public/assets/css/<page>.css`, linked after `components.css` |
| Test for a service | `test/services/<Service>.<method>.test.js` (`node:test`, zero deps) |
| Test for an endpoint payload | `test/api/<area>.contract.test.js` |
| Test for frontend helpers | `test/frontend/<module>.test.js` (no browser; pure functions exported off `window.AFM`) |
| Record a decision | `docs/decisions/ADR-NNN-*.md` + a pointer from this map |
