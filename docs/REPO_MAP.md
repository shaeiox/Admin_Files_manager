# REPO_MAP.md — Repository Navigation Map

> Where things live and how they connect. Pair with `AGENTS.md` (rules) and `docs/CONTRACTS.md` (schemas).

## Directory Tree

```
admin-files-manager/
├── server.js                     # ⭐ ENTRY POINT — Express app assembly + boot
├── package.json                  # Scripts & dependencies (CommonJS); `test` is scoped to test/**/*.test.js
├── nodemon.json                  # Dev reload ignores data/*, public/*
├── .env                          # local dev config — git-ignored AND untracked; never commit (template: .env.example)
├── .env.example                  # every supported variable, required/optional, defaults; secret- and host-free
├── .nvmrc                        # pinned Node (24.15.0); package.json `engines` is >=24 <25
├── .gitattributes                # eol=lf for *.sh, *.service, *.conf, scripts/git-hooks/* ONLY (they break on Linux as CRLF)
├── scripts/                      # ─── Deployment artifacts (ADR-008; runbook docs/DEPLOYMENT.md) ───
│   ├── README.md                 # CI/CD guide: push → gate → activate → health → rollback; outcomes, commands
│   ├── deploy.sh                 # HOST side: unpack → validate → npm ci --omit=dev → npm test → atomic switch →
│   │                             #   restart → /api/v1/health gate → auto-rollback → prune; `rollback`, `status`, `ssh`
│   ├── trigger-deploy.sh         # REPO side: allow-list `git archive` of one commit, shipped over one SSH session
│   ├── git-hooks/post-receive    # bare-repo trigger: deploys pushes to the deployment branch (gates deploy, not push)
│   ├── systemd/dimension.service # unit: unprivileged identity, EnvironmentFile, TimeoutStopSec 45s, journal
│   ├── nginx/dimension.conf      # TLS proxy: body ceiling 6g (> app limit), 600s timeouts, streaming, no SPA fallback
│   ├── nginx/cloudavid.conf      # Two-domain live config: files. = static portal, admin. = basic-auth proxy to :3000
│   └── nginx/README.md           # Runbook for cloudavid.conf: install, certs, htpasswd, verification, troubleshooting
├── temp/                         # Scratch (git-ignored; never discovered by npm test)
│
├── src/                          # ─── Backend ───
│   ├── config/
│   │   ├── env.js                # Env loader + validateStartup() (run by server.js before listen; never exits on require)
│   │   └── dataDir.js            # Store base directory: AFM_DATA_DIR or <cwd>/data (side-effect free)
│   ├── routes/
│   │   ├── api.js                # THE assembly: health + auth + fs + dashboard + settings + admin, mounted by
│   │   │                         #   server.js at /api/v1 (contract) and /api (alias) — one router (ADR-007).
│   │   │                         #   authenticate+csrf applied once here, after /health and /auth (ADR-009)
│   │   ├── fs.routes.js          # /api/fs router — wires endpoints to controller fns
│   │   ├── dashboard.routes.js   # /api/dashboard router — /summary + /health (read-only, no fs remount)
│   │   ├── settings.routes.js    # /api/settings router — GET (bare read) + PUT (full replace) only;
│   │   │                         #   no POST /action, no destructive route (ADR-006)
│   │   ├── auth.routes.js        # /api/auth router (ADR-009) — login (public, throttled), logout, me;
│   │   │                         #   mounted BEFORE the blanket authenticate so login is reachable
│   │   └── admin.routes.js       # /api/admin router (ADR-009) — requireAdmin gates the whole router;
│   │                             #   user management + file-access-policy management
│   ├── controllers/
│   │   ├── fs.controller.js      # HTTP handlers: parse/validate → call services → respond (list, upload, star, ZIP…)
│   │   ├── preview.controller.js # GET /api/fs/thumbnail[/capability] — bounded previews or an explicit "unavailable"
│   │   ├── dashboard.controller.js  # Composes services into the dashboard DTO; shapes the response
│   │   ├── settings.controller.js   # GET → bare document; PUT → { success, settings }; no hand-rolled checks
│   │   ├── auth.controller.js    # login/logout/me — sets/clears the session cookie, returns the CSRF token
│   │   ├── users.controller.js   # admin user CRUD — never returns password_hash (UserService strips it)
│   │   └── filePolicy.controller.js  # admin file-access-policy CRUD + per-user permission grant/revoke
│   ├── services/                 # 🔒 All filesystem + metadata access (no Express here)
│   │   ├── PathService.js        # Client path ⇄ secure OS path; traversal guard (THE boundary)
│   │   ├── FileSystemService.js  # stat/readdir/mkdir/rename/move/copy/rm/unlink → AppError; tree/volume/health aggregation
│   │   ├── MetadataService.js    # JSON-file DB (data/metadata.json), atomic writes, singleton
│   │   ├── SettingsService.js    # JSON-file store (data/settings.json), atomic writes, defaults on first
│   │   │                         #   read, whitelist validation at the service boundary; singleton (ADR-006).
│   │   │                         #   Never imports PathService — it validates a client path, never resolves it
│   │   ├── UploadService.js      # Multer engine + staging: placement decided after the body is parsed; overwrite; size cap
│   │   ├── PreviewService.js     # Thumbnail capability + bounded transform (only if a transformer is installed)
│   │   ├── UserService.js        # Admin user management — validates, hashes (node:crypto), strips secrets on the way out
│   │   ├── SessionService.js     # Login/validateSession/logout/revoke — flat 24h expiry, lockout after 10 failures
│   │   └── FileAccessPolicyService.js  # Per-file policy CRUD + permission grants; onPathRenamed/onPathDeleted
│   │                             #   best-effort hooks called from fs.controller.js (enforces nothing, design D5)
│   ├── db/                       # ADR-009 — a separate node:sqlite database, not a JSON-store replacement
│   │   ├── connection.js         # Singleton; `dbPath` redirectable by tests like MetadataService.dbPath
│   │   ├── schema.js             # Migrations array (1: users/sessions/audit_logs; 2: files/policies/permissions)
│   │   ├── bootstrap.js          # ensureBootstrapAdmin() — creates the first admin from env config, once
│   │   └── repositories/         # One file per table; no SQL or node:sqlite type crosses this boundary
│   │       ├── UserRepository.js
│   │       ├── SessionRepository.js
│   │       ├── AuditLogRepository.js
│   │       ├── FileAccessPolicyRepository.js
│   │       └── UserFilePermissionRepository.js
│   ├── middlewares/
│   │   ├── errorHandler.js       # Global error serializer ({ success:false, error })
│   │   ├── authenticate.js       # Session cookie or Authorization: Bearer → req.user/req.session (ADR-009)
│   │   ├── csrf.js               # Non-GET requires a matching CSRF header (or csrfToken body field for
│   │   │                         #   the one form-POST transport that can't set headers: downloadZip)
│   │   └── requireAdmin.js       # req.user.role === 'admin' — gates admin.routes.js only
│   └── utils/
│       ├── AppError.js           # Error class carrying HTTP statusCode
│       ├── validators.js         # validateFileName / validateClientPath / validateSettingsPayload
│       ├── fileTypes.js          # File-type taxonomy (CATEGORIES/EXTENSION_MAP) — single server-side source, = client FileTypes
│       ├── concurrency.js        # mapWithConcurrency — bounded, order-preserving async map (listing enrichment)
│       └── crypto.js             # hashPassword/verifyPassword (scrypt), randomToken/hashToken — stdlib only
│
├── public/                       # ─── Frontend SPA (served statically, no build) ───
│   ├── index.html                # Dashboard page        (data-page="dashboard")
│   ├── files.html                # File browser page     (data-page="files")
│   ├── uploads.html              # Upload manager page   (data-page="uploads")
│   ├── settings.html             # Settings page         (data-page="settings")
│   ├── admin.html                # Admin page            (data-page="admin")  — user + file-policy mgmt (ADR-009)
│   ├── login.html                # Standalone sign-in page (data-page="login") — NOT in router.js's PAGES;
│   │                             #   reached by a real navigation/redirect, never an SPA swap. No sidebar.
│   └── assets/
│       ├── css/                  # Load order matters: tokens → base → themes → layout
│       │   ├── tokens.css        # Design tokens (colors/spacing/type)
│       │   ├── base.css          # Reset + utilities
│       │   ├── themes.css        # Dark/light theme overrides via [data-theme]
│       │   ├── layout.css        # App shell, sidebar, topbar
│       │   ├── components.css    # Buttons, modals, toasts, tables, dropdowns
│       │   ├── dashboard|files|uploads|settings.css   # Page-specific styles
│       │   ├── admin.css         # Admin page — reuses settings.css's pane/form shell, adds tables/notices
│       │   └── login.css         # Standalone sign-in card; not part of the shared app-shell layout
│       └── js/
│           ├── app.js            # ⭐ Shared core: Icons, Format, Toast, Modal, Dropdown, $. Also owns
│           │                     #   initApp()/loadGlobalData() — skipped on the login page (ADR-009)
│           ├── api.js            # ⭐ API client (window.API): fetch wrapper, XHR upload, iframe downloads.
│           │                     #   Also owns the CSRF token (setCsrfToken/clearCsrfToken) and the
│           │                     #   401 → redirectToLogin flow (ADR-009)
│           ├── theme.js          # Theme controller (loaded first, pre-CSS)
│           ├── sidebar.js        # Sidebar collapse + mobile drawer + the logout control (delegated, ADR-009)
│           ├── router.js         # Client-side navigation between the five shell pages: fetches the target
│           │                     #   page, swaps <main> + page overlays, calls destroy()/init() (ADR-005)
│           ├── dashboard.js      # Page module (index.html)
│           ├── files.js          # Page module (files.html) — see "Files page module" below
│           ├── uploads.js        # Page module (uploads.html) — queue, progress, presets, destination
│           │                     #   check/creation, recent uploads from activity; `Uploads.pure` +
│           │                     #   `Uploads._controller` are test seams
│           ├── settings.js       # Page module (settings.html) — hydrates/extracts exactly the persisted
│           │                     #   keys, gates Save on store reachability, truthful Discard; the theme
│           │                     #   picker belongs to theme.js and is deliberately not intercepted
│           ├── admin.js          # Page module (admin.html) — window.Admin; calls window.API.get/post/put/del
│           │                     #   directly (no named per-endpoint wrappers — see REPO_MAP "Where to Add
│           │                     #   Things"); every dynamic value is escapeHtml'd before reaching innerHTML
│           └── login.js          # login.html's own module — not registered in router.js. Owns the
│                                 #   open-redirect guard on `?redirect=` (root-relative paths only)
│
├── data/                         # ─── Runtime artifacts — NOT checked in ───
│   └── .gitkeep                  # Tracked placeholder so the dir exists. MetadataService
│                                   creates data/metadata.json LAZILY at first write; it does
│                                   not exist before the first run and is git-ignored
│                                   (`data/*.json`, `!data/.gitkeep`). SettingsService does the
│                                   same for data/settings.json on the first GET /api/settings.
│                                   AdminDatabase (ADR-009) creates data/admin.sqlite the same
│                                   way, on first boot — a separate store, not a JSON file, but
│                                   gitignored by the same `data/*` rule.
│
├── test/                         # ─── Tests (`npm test` → node:test, zero deps) ───
│   ├── services/
│   │   ├── PathService.test.js              # traversal / containment guard
│   │   ├── FileSystemService.tree.test.js   # bounded, link-skipping tree aggregation
│   │   ├── FileSystemService.rename.test.js # same-directory rename + metadata carry-over
│   │   ├── FileSystemService.volume.test.js # statfs → usedBytes/totalBytes, null degradation
│   │   ├── MetadataService.test.js
│   │   ├── MetadataService.dashboard.test.js# activities / top-download ranking inputs
│   │   ├── settingsService.test.js          # store: defaults on first read, atomic write, corrupt → 500,
│   │   │                                    #   and validateSettingsPayload (whitelist, bounds, client paths)
│   │   ├── UserService.test.js              # create validation, duplicate username, password_hash never returned
│   │   ├── SessionService.test.js           # login identical-failure shape, lockout, validateSession, revoke
│   │   └── FileAccessPolicyService.test.js  # upsert-in-place, grant/revoke, onPathRenamed/onPathDeleted hooks
│   ├── db/
│   │   └── schema.test.js                   # migrate() idempotency, CHECK/UNIQUE constraints, cascade deletes,
│   │                                        #   refuses a schema version newer than this code understands
│   ├── helpers/
│   │   └── authenticated.js                 # NOT a *.test.js - shared login helper every server-booting
│   │                                        #   suite imports (ADR-009); see AGENTS.md "Tests never touch
│   │                                        #   the real stores"
│   ├── api/
│   │   ├── versioning.contract.test.js      # /api/v1 vs /api on a live server: same status + shape for every
│   │   │                                    #   endpoint, /api/v2 + /api/V1 refused, no fs route under either
│   │   │                                    #   dashboard prefix, v1 error envelope (no kind, no disclosure),
│   │   │                                    #   endpoint set frozen, mount order + CORS pinned at source
│   │   ├── dashboard.contract.test.js       # GET /api/dashboard/summary + /health payload shape
│   │   ├── settings.contract.test.js        # GET/PUT /api/settings against a live server: bare read,
│   │   │                                    #   {success,settings} write, 400 leaves the store byte-identical,
│   │   │                                    #   POST /api/settings/action is a 404, mount order is reachable
│   │   ├── fs.contract.test.js              # /api/fs/* against a live server: upload placement ON DISK,
│   │   │                                    #   overwrite/size, listing taxonomy + resilience, star, ZIP, previews
│   │   ├── upload.surface.test.js           # upload error surface: no stack in any configuration (incl. a
│   │   │                                    #   child `node server.js` with NODE_ENV unset), authored reasons
│   │   │                                    #   forwarded, generic text for the rest, status per failure class
│   │   ├── auth.contract.test.js            # live-server: health/login stay public, every other route 401s
│   │   │                                    #   with no session, CSRF enforcement, cookie+bearer both work,
│   │   │                                    #   logout revokes, /api/v1 ↔ /api parity (ADR-009)
│   │   └── admin.contract.test.js           # live-server: requireAdmin (403 vs 401), full user-management
│   │                                        #   and file-policy CRUD flows, D5's "enforces nothing yet"
│   ├── integration/
│   │   ├── live-server.test.js              # traversal guard wired into the running app
│   │   ├── error-disclosure.test.js         # no stack / no path in error bodies
│   │   └── escaping.test.js                 # hostile name placed out of band → listed → rendered as text
│   ├── utils/
│   │   └── fileTypes.test.js                # server taxonomy == client FileTypes; no inline copy in the controller
│   └── frontend/
│       ├── api-boundary.test.js             # the real api.js in a vm: BASE_URL resolution (global → meta →
│       │                                    #   /api/v1), every URL builder carries the base, failures carry
│       │                                    #   status and never an invented kind
│       ├── app.test.js                      # shared core helpers (panel states, storage display)
│       ├── dashboard.test.js                # dashboard renderers, no-history guarantees
│       ├── files.test.js                    # files.js in a vm with stub DOM/API: states, navigation, selection,
│       │                                    #   a11y semantics, escaping, and source-level guards
│       ├── navigation.test.js               # router.js (which clicks it takes, full-load fallback), page
│       │                                    #   teardown hooks, context-menu open/close, Settings notice
│       ├── settings.test.js                 # settings.html ⇆ settings.js names cross-asserted in both
│       │                                    #   directions; save gating, truthful discard, dirty rules, teardown,
│       │                                    #   non-interference with the delegated theme picker
│       ├── uploads.test.js                  # uploads.js in a vm with stub DOM/API/XHR: queue derivations, failure
│       │                                    #   kinds, escaping, destination gate, honesty + a11y source guards
│       ├── admin.test.js                    # admin.html/js source-level: escaping scoped to the HTML-building
│       │                                    #   functions, API-boundary compliance, D5 disclosure copy pinned
│       └── login.test.js                    # login.html/js: standalone-page isolation, and a real functional
│                                            #   test of the open-redirect guard on `?redirect=`
│
└── docs/                         # ─── Project brain (reference docs, NOT runtime code) ───
    ├── REPO_MAP.md               # ← you are here (this file is the authoritative map)
    ├── CONTRACTS.md              # API + data schemas (+ deployment contract)
    ├── DEPLOYMENT.md             # Operator runbook: host layout, config table, install, deploy, rollback, logs
    ├── architecture.md           # Frontend-era deep-dive. Read its §0 "Status" first:
    │                             # design-system sections are current, "mock data" ones are not
    ├── STRUCTURE.md              # ⚠ Outdated frontend-era map (see AGENTS.md stale-tree guard)
    ├── backend-checklist.md      # Phase checklist
    ├── checklist..md             # Legacy checklist (typo name kept as-is)
    └── decisions/
        ├── ADR-001-architecture-baseline.md
        ├── ADR-002-dashboard-data-architecture.md
        ├── ADR-003-files-page-integrity.md      # upload placement, taxonomy, star, page-scoped selection,
        │                                        #   previews, list focus model, security posture
        ├── ADR-004-upload-page-integrity.md     # queue honesty, destination integrity, escaping, keyboard access
        ├── ADR-005-client-side-navigation.md   # router.js, the page-module lifecycle, destroy()/beforeLeave()
        ├── ADR-006-settings-store-and-scope.md # data/settings.json (JSON over XML), persist-only-what-works,
        │                                        #   strict whitelist + full replace, corrupt → 500,
        │                                        #   no credentials, danger zone deferred behind auth
        ├── ADR-007-api-versioning-and-boundary.md # /api/v1 as a mount prefix, one assembly mounted twice,
        │                                        #   alias retained (removal gated on auth), configurable
        │                                        #   API.BASE_URL, kind reserved, taxonomy endpoint deferred
        ├── ADR-008-production-deployment.md     # systemd (no Docker, with the test), AFM_DATA_DIR, startup
        │                                        #   validation, graceful shutdown, host-side suite gate,
        │                                        #   allow-list artifact, post-receive trigger, exposure still gated
        └── ADR-009-admin-identity-and-file-access-policies.md  # node:sqlite (no WAL - single connection,
                                                 #   single process, see src/db/connection.js), 2-value role
                                                 #   not a permission catalogue, per-file not per-directory
                                                 #   policies, no download enforcement yet — closes ADR-003's
                                                 #   open Critical; see openspec/changes/admin-identity-and-access-control/
```

## Entry Points

| Entry | Trigger | What it does |
|---|---|---|
| `server.js` | `npm start` / `npm run dev` | Builds middleware chain (helmet → cors → json → urlencoded → morgan → static), then mounts the `src/routes/api.js` assembly (`/health`, `/fs`, `/dashboard`, `/settings`) at `/api/v1` and `/api` in one registration, adds the API 404 catch-all, HTML fallback for SPA, global `errorHandler`, listens on `config.port` |
| `src/config/env.js` | Imported first by `server.js` | Loads `.env` (never overriding a set variable) and exposes `validateStartup()`, which `server.js` runs before `listen`: an unusable `STORAGE_ROOT` / `AFM_DATA_DIR` / `UPLOAD_MAX_BYTES` exits 1 with a named reason. `server.js` also drains on `SIGTERM`/`SIGINT` (30 s grace) |
| `scripts/deploy.sh` | `bash /opt/dimension/bin/deploy.sh <deploy / receive / rollback / status>` on the host | The release mechanism — see `docs/DEPLOYMENT.md` |
| `public/index.html` | Browser GET `/` | Dashboard; other pages are sibling HTML files |
| `test/**/*.test.js` | `npm test` (`node --test "test/**/*.test.js"`) | Zero-dependency `node:test` suites; discovery is scoped to `test/`, so a scratch `*.test.js` elsewhere cannot break the suite. Every server-booting suite points `MetadataService.dbPath` at a temp file — parallel test processes must never write the real `data/metadata.json` — and every suite that touches the settings store also repoints `SettingsService.dbPath` and clears its cache before requiring `server.js` |

### ⚠ Mount order in `server.js` is load-bearing, not cosmetic

```
app.use(['/api/v1', '/api'], apiRoutes)  →  app.use('/api', catch-all)  →  SPA fallback  →  errorHandler
             └─ src/routes/api.js: version-segment guard → /health → /fs → /dashboard → /settings
```

The `/api` 404 catch-all is a **two-argument middleware** (`(req, res) => …`) that sends its
response and **never calls `next()`**. It therefore *terminates* the chain for every `/api/*` path
that reaches it. Anything mounted after it is **unreachable** — not "shadowed", not "deprioritised":
never invoked at all.

So the API assembly (and with it `/api/v1`, `/api/dashboard` and `/api/settings`) **must** be mounted *before* that catch-all. Mounting either
after produces a server that boots cleanly, logs no error, and 404s on every request to it — a
silent failure with no stack trace to follow. When adding a new resource router, mount it **inside `src/routes/api.js`** — it is then reachable on
both prefixes at once — never as a separate `app.use` in `server.js`
(`test/api/versioning.contract.test.js` pins the ordering and the endpoint set;
`test/api/settings.contract.test.js` pins it for the settings router).

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
│         ├─ FileSystemService (stat/readdir/mkdir/rename/move/copy/rm) │
│         ├─ UploadService (multer staging → final placement)    │
│         ├─ PreviewService (bounded thumbnails, optional)       │
│         ├─ MetadataService (data/metadata.json, fire-and-forget)│
│         └─ SettingsService (data/settings.json; never resolves) │
│       → utils/validators.js → utils/AppError.js                │
│   → middlewares/errorHandler.js (last middleware, catches all)  │
└────────────────────────────────────────────────────────────────┘
```

**Dependency rules**

- `routes → controllers → services → (fs | path | env)`; `utils` and `config` are shared leaves.
- Services never import Express, `req`, or `res` — they take/return plain data.
- **A service that stores a client-path *value* is not a path consumer.** `SettingsService` validates
  `general.defaultUploadFolder` with the shared validators and stores the string verbatim; it imports
  no `PathService` and resolves nothing. Resolution happens at the point of use, so rule 2's choke
  point stays the single boundary.
- Controllers may use `archiver` for HTTP-specific streaming but must not touch `fs` themselves
  except the download stream (`fs.createReadStream(stats.securePath)`), which is mediated by
  `PathService`. Multer's storage engine, staging and placement live in `UploadService`.
- Frontend page modules depend on `app.js` + `api.js`; they must not duplicate API calls.
- **ADR-009 (`openspec/changes/admin-identity-and-access-control/`):** `src/db/` repositories
  (`UserRepository`, `SessionRepository`, `AuditLogRepository`, `FileAccessPolicyRepository`,
  `UserFilePermissionRepository`) each own a table in a new `node:sqlite` database, the same way
  `MetadataService`/`SettingsService` each own their JSON file — a separate store, not a
  replacement of either existing one. `src/middlewares/authenticate.js` and `csrf.js` sit in front
  of every router mounted in `src/routes/api.js` except `/health` and `POST /auth/login`;
  `src/middlewares/requireAdmin.js` additionally gates `src/routes/admin.routes.js` only.

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

## Settings store (read/write path)

`/api/settings` is deliberately tiny: three keys, one store, no destructive action. Its shape is
recorded in ADR-006; the mechanics:

```
GET /api/settings   (read-only aggregate → BARE document, no {success,…} envelope)
  settings.controller.getSettings → SettingsService.getAll() → _read()
    ├─ in-memory cache hit?  → return the cached document
    ├─ ENOENT                → _init(): mkdir data/ FIRST, then atomic write of the defaults
    └─ anything else         → AppError('Settings store could not be read', 500)  → errorHandler
                                (a corrupt document fails WHOLLY — defaults are never substituted)

PUT /api/settings   (mutating → { success: true, settings })
  settings.controller.replaceSettings → SettingsService.replace(req.body)
    → validateSettingsPayload(req.body)  [utils/validators.js]
        exact whitelist (general | appearance, every key present, none extra),
        workspaceName ≤ 60 after trim, defaultView ∈ {null,list,grid},
        defaultUploadFolder validated as a CLIENT path (never resolved)
    → _write(validated)   temp file + rename   (atomic)
    → respond with the persisted, normalized document
```

Rules worth knowing before you touch this path:

- **Unknown keys are a `400`, not a stripped key.** Silent stripping would let a stale client get a
  `200` from a full replace while dropping the values it sent.
- **Validation lives in `SettingsService.replace()`**, not in the controller, so no caller can reach
  disk with an invalid document. The controller carries no second whitelist.
- **A rejected write leaves `data/settings.json` byte-identical.**
- **`null` is the unset state** for all three keys; consumers fall back to their own defaults. A key
  is never absent.
- **Only `GET` and `PUT` are registered.** `POST /api/settings/action` (and any other sub-path)
  falls through to the `/api` catch-all → `404`. The Settings page holds no destructive control, and
  adding one without authentication would be an unauthenticated destructive endpoint (ADR-003).
- **No credential may ever be stored in this document** — the store is unauthenticated over HTTP and
  world-readable on disk.
- **`general.defaultUploadFolder` has no consumer yet.** It is persisted and validated; the Uploads
  page still starts at `/`. Do not document it as prefilling the destination until a page reads it.

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
6. Mutating endpoints answer with the `{ success: true, … }` envelope; failures propagate via
   `next(error)` to `errorHandler`, which serialises `{ success: false, error }`.
   **Read-only aggregate endpoints return a bare top-level shape instead** — `GET /api/fs/tree`
   returns a bare array, `GET /api/fs/list` a bare object, `GET /api/dashboard/summary` a bare
   object, `GET /api/dashboard/health` a bare array, `GET /api/settings` the bare settings
   document. See CONTRACTS.md for the full rule.

## Where to Add Things

| Task | Location |
|---|---|
| New filesystem endpoint | `src/routes/fs.routes.js` + `src/controllers/fs.controller.js` (no version segment in the path — the mount adds it; additive-only within v1) |
| New dashboard/aggregate endpoint | `src/routes/dashboard.routes.js` + `src/controllers/dashboard.controller.js` — keep it read-only, do **not** re-mount `fsRoutes` inside it |
| New API resource router | mount it in `src/routes/api.js` (served on `/api/v1` and `/api` at once); never `app.use` it from `server.js` after the catch-all |
| New API URL for a non-fetch transport (img, iframe, form) | a named builder in `public/assets/js/api.js` (like `thumbnailUrl`); page modules never read `API.BASE_URL` |
| New operator preference (persisted, with a real consumer) | `src/services/SettingsService.js` schema + defaults, `validateSettingsPayload` in `src/utils/validators.js`, a named control in the markup, and the module's field table — then document it in CONTRACTS.md. A preference with **no consumer** is not a setting; remove its control instead |
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
| New admin/identity endpoint | `src/routes/admin.routes.js` + a controller (`users.controller.js`/`filePolicy.controller.js`), mounted inside `src/routes/api.js`; every route in that router is admin-gated via `requireAdmin` |
| New DB-backed table/migration | `src/db/schema.js` (append a new `MIGRATIONS` entry, never edit a shipped one) + a named repository under `src/db/repositories/`; never raw SQL in a controller/service |
| New admin page | `public/admin.html` + `public/assets/js/admin.js`, gated on `document.body.dataset.page === 'admin'`, registered in `router.js`'s `PAGES`/`MODULES`. Adding a page means updating the byte-identical-sidebar copies in all five shells and the hardcoded shell-count arrays in `test/frontend/app.test.js`, `test/frontend/files.test.js`, `test/integration/csp.test.js`, and `test/integration/repo-guardrails.test.js` (two occurrences) |
