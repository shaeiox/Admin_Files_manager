# AGENTS.md — Dimension Files Manager

> **Identity:** Dimension is a self-hosted **admin file manager**: an Express 5 REST API that exposes a
> sandboxed storage directory (`STORAGE_ROOT`) over HTTP, served alongside a no-build vanilla JS SPA
> (Dashboard / Files / Uploads / Settings). Node's filesystem **is** the database; a JSON file
> (`data/metadata.json`) tracks downloads, stars, and activity.
>
> **Read this first, then `docs/REPO_MAP.md` (navigation) and `docs/CONTRACTS.md` (API/data schemas).**
> Foundational decisions live in `docs/decisions/`.

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Node.js (CommonJS) | `"type": "commonjs"` — `require()`, **not** `import` |
| Framework | Express 5.x | Pathless middleware fallback (`app.use`) — Express 4 `app.get('*')` patterns will not work |
| Validation | Custom (`src/utils/validators.js`) | No Zod/Joi — validate via `validateFileName` / `validateClientPath` |
| Uploads | Multer 2.x (`diskStorage`, via `UploadService`) | Streams to a hidden staging file inside `STORAGE_ROOT`, then moved into place; never buffer into memory |
| Archiving | Archiver 8.x | ZIP streams are piped, never collected in memory |
| Persistence | JSON files via `MetadataService` / `SettingsService` | Atomic temp-file-then-rename writes; singleton instances; `data/*.json` is git-ignored |
| Frontend | Vanilla JS + CSS (no bundler) | Modules attach to `window` (`window.API`, `window.AFM.*`); `<script>` tag load order matters. `router.js` navigates between the four pages without a reload (ADR-005) |
| Logging | Morgan (`dev` format) | Errors also logged via `console.error` in `errorHandler` |
| Dev tooling | Nodemon | Ignores `data/*` and `public/*` |

## Essential Commands

```bash
npm run dev      # Start with nodemon (http://localhost:3000)
npm start        # Start in production mode
npm test         # node:test, zero dependencies, scoped to test/**/*.test.js. 772 tests, exits 0:
                 # services, API contracts (live server, incl. versioning.contract), frontend modules in a vm
                 # (incl. api-boundary), integration, guardrails.
```

- No lint/format/build/typecheck tooling is configured. Do not invent commands.
- **Required env:** `STORAGE_ROOT` (absolute path). The server refuses to boot without it
  (`src/config/env.js` calls `process.exit(1)`). Optional: `PORT` (default `3000`),
  `UPLOAD_MAX_BYTES` (positive integer bytes, default 5 GiB; read by `UploadService`).
- **Tests never touch the real stores.** `MetadataService` resolves `data/metadata.json` and
  `SettingsService` resolves `data/settings.json` from `process.cwd()`, and test files run in parallel
  processes, so every suite that boots the server points `MetadataService.dbPath` (and, if it touches
  settings, `SettingsService.dbPath` **and its in-memory cache**) at a temp file before requiring
  `server.js` (see `test/api/fs.contract.test.js`, `test/api/settings.contract.test.js`). Two suites
  writing the real store once corrupted it.
- Health check: `GET /api/v1/health` (alias `GET /api/health`); it reports `apiVersion: 1`.

## Architecture Rules (non-negotiable)

1. **Layered flow:** `routes → controllers → services → fs`.
   - Controllers parse/validate input and format responses.
   - Services own all filesystem access (`FileSystemService`, `MetadataService`, `PathService`,
     `UploadService`, `PreviewService`) and every store file (`SettingsService`).
   - Never register filesystem calls directly in `routes`; never bypass services from controllers.
2. **The path boundary is `PathService`.** Every client-supplied path must pass
   `PathService.resolveSecurePath()` (traversal guard) before touching disk. The API surface speaks
   only in **client paths** (POSIX strings rooted at `/`, e.g. `/media/clip.mp4`); absolute OS paths
   (`securePath`) never leave the services layer and never appear in API responses.
3. **All client paths and names are validated** with `validateClientPath` / `validateFileName`
   (`src/utils/validators.js`) before use. Reuse them; don't hand-roll regex checks.
4. **Async I/O only.** `fs/promises` or streams in services; `createReadStream` for downloads,
   Archiver for ZIPs. Never block the event loop with sync fs calls on the request path. The one
   deliberate synchronous service helper is `FileSystemService.getHealthMetrics` — it touches no
   filesystem, only `os.totalmem`/`os.freemem`/`process.uptime`, and must stay cheap and stable
   because it is on the Dashboard polling path. Do not "async-ify" it, and do not add fs access to it.
4a. **The API is versioned by mount prefix (ADR-007).** `/api/v1` is the contract; `/api` is a retained
   compatibility alias. Both are served by **one** assembly, `src/routes/api.js`, which `server.js` mounts
   once as `app.use(['/api/v1', '/api'], apiRoutes)` — **before** the `/api` catch-all, or every route is
   silently unreachable. Route modules never declare a version segment; a new resource router is mounted
   inside `api.js`, never with its own `app.use`. Within v1, changes are **additive only** (new endpoint,
   new optional field, new optional parameter that defaults to current behaviour); removals and retypes
   wait for a v2 mounted alongside. The `/api` alias must not be removed without its own decision — it is
   blocked on authentication, because removing it closes no exposure.
5. **Error contract:** throw `new AppError(message, statusCode)` from any layer; the global
   `errorHandler` middleware serializes it. Never `res.status(...).json(...)` an error inline from a
   route/controller, never `throw` raw strings or plain `Error` for expected failures.
6. **Response envelope — it depends on read vs. mutating.** The convention is deliberately not uniform:
   - **Mutating** endpoints return the envelope: `{ success: true, ... }`. (`POST /api/fs/folder`, `PUT /api/fs/rename`,
     `DELETE /api/fs/delete`, `POST /api/fs/upload`, `POST /api/fs/star`.) A `200` from `DELETE /api/fs/delete` can still
     carry failures in `data.failed` — read it; never report the number of paths sent as the number deleted.
   - **Read-only aggregate** endpoints return a **bare top-level shape** with no envelope. `GET /api/fs/tree` returns a bare
     array (`[rootNode]`); `GET /api/fs/list` returns a bare object (`{ items, total, counts }`); `GET /api/dashboard/summary`
     returns a bare object; `GET /api/dashboard/health` returns a bare array; `GET /api/fs/thumbnail/capability` returns a
     bare object; `GET /api/settings` returns the bare settings document. The dashboard endpoints follow that existing
     precedent — they are not an exception to it.
   - **Errors** always use `{ success: false, error: string }`, serialized by the global `errorHandler`.

   Match the row you are imitating, and document the shape in `docs/CONTRACTS.md` in the same change.
7. **Metadata is eventually consistent, not transactional.** Metadata writes (`incrementDownload`,
   `addActivity`, `deletePath`) are fire-and-forget (`.catch(() => {})`); they must never fail or
   block the filesystem operation they accompany. Don't add `await` chains that make metadata
   failures fatal.
8. **Frontend has no build step.** Plain HTML pages + IIFE modules on `window`. When adding shared
   UI, extend `app.js` (Toast/Modal/Format/Icons); when calling the API, go through `window.API`
   (`public/assets/js/api.js`) — do not call `fetch` ad hoc from page modules, and never build an API URL
   yourself: no `/api` literal and no `API.BASE_URL` concatenation outside `api.js`. A non-fetch transport
   (an `<img src>`, an iframe, a form) gets a named builder in `api.js` (e.g. `API.thumbnailUrl`).
   `API.BASE_URL` is resolved once at load — `window.AFM_API_BASE` → `<meta name="afm-api-base">` →
   `/api/v1` — and the shipped shells declare the same-origin default; `test/integration/repo-guardrails.test.js`
   enforces the boundary. (`router.js` fetches
   the static page HTML, not the API.) Pages are swapped in place by `router.js`, so a page module's
   `init()` can run many times per document: every `window`/`document` listener and timer it adds
   must be removed by its `destroy()`, and controls in the topbar must be bound by delegation in
   shared code. A new page must be added to `PAGES`/`MODULES` in `router.js` and load `router.js`
   after `sidebar.js` (see "Page-module contract" in `docs/CONTRACTS.md`).
9. **Downloads never navigate the main frame.** Single files use hidden iframes; ZIP uses a hidden
   form POST targeted at an iframe (see `api.js`). Keep this pattern: go through `API.downloadFile` /
   `API.downloadMultipleFiles` / `API.downloadZip`, never `window.open` (a test fails on `window.open(`
   in `files.js`). `POST /api/fs/download-zip` is live.
10. **Escape every filesystem-derived string before it reaches markup.** File names, paths and
   breadcrumb segments come from an operator-controlled root that may be populated out of band, and
   the content security policy is disabled, so `AFM.escapeHtml` at render time is the only layer.
   `Modal.prompt` / `Modal.confirm` insert their `title`, `message` and `value` as raw HTML — escape
   what you pass them. `test/integration/escaping.test.js` and `test/frontend/files.test.js` enforce it.
10a. **Tooltips follow placement rules.** The default `[data-tip]::after` opens *above* the control, which clips against the viewport for anything in the sticky topbar or the `top: 0` drawer, and clips inside `overflow: auto` containers (file table, queue list, drawer body). Every such control carries an explicit `data-tip-pos` (`bottom` for topbar/drawer-header/row/queue actions; `left` for the tree button; right-edge bars keep the default because a `bottom` tip would clip there). `test/frontend/tooltips.test.js` pins the audited set. The notification bell on Uploads/Settings opens the shared `AFM.Notifications` panel — never a one-off handler.

## Hard Constraints & Red Lines

- **No directory traversal, ever.** `resolveSecurePath` must stay the single choke point; any new
  path-consuming code path goes through it. Deletion of the storage root is explicitly blocked.
- **Do not run in read-only environments** without `STORAGE_ROOT` being writable; writes are
  expected to fail at runtime otherwise.
- **Do not commit:** `.env` (contains secrets; ignored by `.gitignore` — ADR-001 follow-up closed in ADR-003, but a
  file that was already tracked must also be removed from the index with `git rm --cached .env`),
  `data/*.json` (runtime metadata), `download/`, `temp/` (scratch; ignored and never discovered by `npm test`).
- **Multipart field order is load-bearing for uploads.** Send `destination` and `overwrite` BEFORE `file`:
  multer resolves the destination when the first file chunk arrives. `UploadService` stages bytes in a
  dot-prefixed `.upload-*.part` file and places the file only after the whole body is parsed, so a late
  `destination` is honoured rather than misfiled — but an early one is validated before any byte is written.
  `overwrite` other than `"true"` refuses with `409`; never write directly to the final name.
- **Previews are optional and bounded.** `GET /api/fs/thumbnail` produces ≤512 px images only if an image
  transformer is installed (none is; adding one is its own security-reviewed change). Non-images are refused
  from the name before any byte is read; failures carry `X-Preview: unavailable`. Never point an `<img>` at
  `/api/fs/download`, and never relax its `application/octet-stream`.
- **The API is unauthenticated and `cors()` admits any origin** — a recorded decision (ADR-003), not an
  oversight, and not closed. Authentication must land before the service is reachable beyond localhost.
- **Filename rules are cross-platform strict:** reject `[<>:"|?*\x00-\x1F]`, reserved Windows names
  (`CON`, `PRN`, `COM1-9`, ...), leading/trailing dots/spaces, and any `/` or `..`. Match
  `validateFileName`; don't loosen it for convenience.
- **Rename is same-directory only** by design (see `FileSystemService.rename`). Cross-directory
  moves need a dedicated, explicitly-designed API — do not silently extend rename.
- **Deletion is permanent** (`fs.rm` recursive, no trash/recycle). UI copy and confirm dialogs must
  reflect that.
- **Browser compatibility target is modern Chrome/Edge-class engines**; no transpilation, no IE support.
- **A count of `0` is a real reading, not a placeholder.** Never floor a stat to `1` (or to any non-zero stand-in) to
  make a panel look populated — an empty tree reports 0 files / 0 folders / 0 bytes. Conversely, a quantity that could
  **not** be measured must be reported as *explicitly unavailable* (`null` plus an `*Available: false` flag) and rendered
  as "unavailable", never as `0`. Substituting `0` for "unknown" invents a measurement. The same reasoning forbids
  asserting a `status`/`level` (healthy/warning/critical) when no real threshold source defines it — see
  `FileSystemService.getHealthMetrics`, which deliberately ships no status field and omits load average because
  `os.loadavg()` returns a fabricated `[0,0,0]` on Windows with no error to detect.
- **Never fabricate a metric to fill a UI slot.** There is no time-series store, no snapshot table, and no parseable log
  (`morgan('dev')` writes to stdout only), so trend percentages, sparklines, and period-over-period charts cannot be
  produced at all. When a number is unavailable, **remove the affordance that wanted it**; do not synthesise a plausible
  value. Every figure the Dashboard shows is instantaneous.
- **Dashboard reads degrade per capability and still answer HTTP 200 — but not for every capability.**
  `GET /api/dashboard/summary` drops only the contribution it could not obtain: `storage.usedBytes` / `storage.totalBytes`
  go `null` with `volumeAvailable: false` when the volume is unreadable, and an unreadable subdirectory is skipped by the
  tree walk. So a **200 does not by itself mean every field is populated** — check the per-capability flags before
  rendering. **Metadata is the exception:** `MetadataService._read` throws for a corrupt/unreadable store and `getSummary`
  uses `Promise.all`, so that case is a 500, not a degraded 200. Don't extend this pattern to sources that currently
  fail wholly without deciding which behaviour you want per capability.
- **Settings persist in a real store; the theme does not.** `SettingsService` keeps a JSON document at
  `data/settings.json` behind `GET`/`PUT /api/settings` (bare read, enveloped validated full replace;
  ADR-006). The Settings page persists exactly three keys — `general.workspaceName` (sidebar brand,
  applied at runtime by `applyWorkspaceName` in `app.js`), `general.defaultUploadFolder` (validated
  and stored, but **not yet read by any page**) and `appearance.defaultView` (the Files page's default
  layout). **The theme stays browser-local** in `theme.js`: it is the one preference deliberately
  absent from the document, and the page says so.
  Every control on that page either persists through that store or has been **removed** — there is no
  third option, and a control with no consumer is not a setting. Don't add a key to the document
  without a consumer that changes real behaviour. `dashboard.js`, `app.js`, `files.js`, `uploads.js`
  and `settings.js` are all fully backed; verify a called endpoint against `fs.routes.js`,
  `dashboard.routes.js`, `settings.routes.js` and `server.js` before assuming it 404s (see "Known
  gaps" in `docs/CONTRACTS.md`, which is currently empty).
- **The Files page renders only what exists.** No control without a working handler, no success message for an
  operation that did not happen, no fabricated fallback data (an outage is an error state with a retry, never an
  empty folder or a synthetic tree). Source-level tests in `test/frontend/files.test.js` pin this; a removed control
  takes its handler with it. The sidebar is duplicated byte-for-byte on four pages and a test asserts they match.

- **The Upload page invariants** (`uploads.js`, pinned by `test/frontend/uploads.test.js`):
  - A figure derived from the queue says its scope ("since this page opened"); no tile claims a time period no source
    provides.
  - Unknown is rendered unavailable (`—`, via `Format.duration(null)`), never as `0` — e.g. remaining time before a
    speed has been measured. A computed remaining time is labelled an estimate.
  - No capability is claimed without server behaviour (the removed-claim inventory is in `docs/CONTRACTS.md`). A
    preset's tags are derived from the one setting it applies (concurrency).
  - Every dynamic interpolation goes through `escapeHtml`, including the in-place progress patch.
  - Every icon-only control has an `aria-label`, renamed when its meaning changes (Pause → Resume).
  - Failure kinds come from a machine-readable signal (server `kind`, HTTP status, transport), never from message text.

## When You Change Code

- New **filesystem** endpoint: route in `src/routes/fs.routes.js` → handler in
  `src/controllers/fs.controller.js` → logic in a service → document it in `docs/CONTRACTS.md` in the same change.
- New **read-only aggregate** endpoint (Dashboard-style): route in `src/routes/dashboard.routes.js` → handler in
  `src/controllers/dashboard.controller.js` → **reuse the existing services** (`FileSystemService.getTreeStats` /
  `getVolumeStats` / `getHealthMetrics` / `retainExisting`, `MetadataService.getActivities` / `getTopDownloads`) instead of
  touching the filesystem or metadata from the controller. A new resource router is mounted inside `src/routes/api.js`
  (served on `/api/v1` and `/api` at once), and that assembly stays mounted in `server.js` **before** the `/api`
  catch-all: that catch-all is a two-argument middleware that never calls `next()`, so anything registered after it is
  unreachable. Do **not** remount the filesystem router into the dashboard router — that would republish upload/rename/delete/folder/
  download/ZIP under a second unauthenticated prefix. Return a **bare** payload (rule 6), and decide deliberately, per
  capability, whether the endpoint degrades with a 200 or fails wholly.
- New service module: follow the static-class singleton pattern used by `FileSystemService` /
  `PathService` (or instance singleton like `MetadataService`).
- New frontend module: IIFE attached to `window`, loaded after `app.js` and `api.js`, page-gated via
  `<body data-page="...">`.
- Keep `docs/REPO_MAP.md` and `docs/CONTRACTS.md` in sync — stale docs are treated as bugs.
- Stale-tree guard: `docs/STRUCTURE.md` describes the frontend-only era (pre-backend) and lists
  files that no longer exist at those paths; treat `docs/REPO_MAP.md` as the authoritative map.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
