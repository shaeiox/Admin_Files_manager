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
│   │   └── fs.routes.js          # /api/fs router — wires endpoints to controller fns
│   ├── controllers/
│   │   └── fs.controller.js      # HTTP handlers: parse/validate → call services → respond
│   ├── services/                 # 🔒 All filesystem + metadata access (no Express here)
│   │   ├── PathService.js        # Client path ⇄ secure OS path; traversal guard (THE boundary)
│   │   ├── FileSystemService.js  # stat/readdir/mkdir/rename/rm/unlink, mapped to AppError
│   │   └── MetadataService.js    # JSON-file DB (data/metadata.json), atomic writes, singleton
│   ├── middlewares/
│   │   └── errorHandler.js       # Global error serializer ({ success:false, error })
│   └── utils/
│       ├── AppError.js           # Error class carrying HTTP statusCode
│       └── validators.js         # validateFileName / validateClientPath
│
├── public/                       # ─── Frontend SPA (served statically, no build) ───
│   ├── index.html                # Dashboard page        (data-page="dashboard")
│   ├── files.html                # File browser page     (data-page="files")
│   ├── uploads.html              # Upload manager page   (data-page="uploads")
│   ├── settings.html             # Settings page         (data-page="settings")
│   ├── PROJECT_FULL_CODE.md      # Docs snapshot (reference, not runtime code)
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
├── data/                         # Runtime artifacts (git-ignored JSON)
│   └── metadata.json             # MetadataService database: downloads, starred, activities
│
└── docs/                         # ─── Project brain ───
    ├── REPO_MAP.md               # ← you are here
    ├── CONTRACTS.md              # API + data schemas
    ├── architecture.md           # Legacy deep-dive notes
    ├── STRUCTURE.md              # ⚠ Outdated frontend-era map (see AGENTS.md stale-tree guard)
    ├── backend-checklist.md      # Phase checklist
    ├── checklist..md             # Legacy checklist (typo name kept as-is)
    └── decisions/
        └── ADR-001-architecture-baseline.md
```

## Entry Points

| Entry | Trigger | What it does |
|---|---|---|
| `server.js` | `npm start` / `npm run dev` | Builds middleware chain (helmet → cors → json → morgan → static), mounts `/api/health` + `/api/fs`, adds API 404 catch-all, HTML fallback for SPA, global `errorHandler`, listens on `config.port` |
| `src/config/env.js` | Imported first by `server.js` | Loads `.env`, hard-exits if `STORAGE_ROOT` is unset |
| `public/index.html` | Browser GET `/` | Dashboard; other pages are sibling HTML files |

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

## Request Lifecycle (typical mutation)

1. `server.js` middleware chain runs (`helmet`, `cors`, `morgan`, body parsing).
2. Route matched in `fs.routes.js` → controller handler.
3. Controller validates input (`validateClientPath`/`validateFileName`) and calls services.
4. `FileSystemService` resolves via `PathService.resolveSecurePath` (throws `403` on traversal) and
   performs async fs work, mapping OS errors (`ENOENT`→404, `EACCES/EPERM`→403) to `AppError`.
5. Metadata updates fire without blocking (`.catch(() => {})`).
6. Response uses the `{ success, data|error }` envelope; failures propagate via `next(error)` to
   `errorHandler`.

## Where to Add Things

| Task | Location |
|---|---|
| New API endpoint | `src/routes/fs.routes.js` + `src/controllers/fs.controller.js` |
| New disk operation | `src/services/FileSystemService.js` |
| New metadata/entity | `src/services/MetadataService.js` (+ `data/metadata.json` shape in CONTRACTS.md) |
| New validation rule | `src/utils/validators.js` |
| New shared UI component | `public/assets/js/app.js` + `public/assets/css/components.css` |
| New page module | new `public/assets/js/<page>.js`, gate on `document.body.dataset.page` |
| New page style | new `public/assets/css/<page>.css`, linked after `components.css` |
