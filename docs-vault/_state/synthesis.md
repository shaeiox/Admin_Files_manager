---
project: dimension-files-manager
architecture-type: modular monolith
module-count: 9
synthesized-at: 2026-10-14T05:05:10Z
source-commit: e2698aedbe42c3c2c0cc24c38e3ef2b45c1843ae
---

<!-- c2d:y1 -->
## Architecture Narrative

Dimension is a self-hosted admin file manager. It runs as one Node.js (CommonJS) process: an Express 5 REST API in front of a single sandboxed directory (`STORAGE_ROOT`), plus a no-build vanilla JS single-page app served from `public/` by the same process. ADR-001 sets the founding idea: the filesystem *is* the database, and every client-supplied path has to pass one secured boundary. Two small JSON stores sit beside the files (download counts, stars, activity, operator settings). ADR-009 later added a SQLite database for identity, sessions, audit rows and file-access-policy data. The backend is layered `routes → controllers → services → fs`. The API speaks only in POSIX "client paths" rooted at `/`. Absolute OS paths never leave the services.

**Server Bootstrap and Config** is the entry point. `src/config/env.js` builds a plain config object at require time and never exits on its own. `server.js` calls `validateStartup()`, opens and migrates the admin database synchronously, assembles the middleware chain, mounts the API, and listens. On a signal it drains connections within a 30 s grace. Middleware order matters: the API assembly is mounted once as `app.use(['/api/v1', '/api'], ...)` (ADR-007) and has to come before the `/api` catch-all and the SPA fallback, or no route is reachable. **HTTP API Layer** holds the routers, controllers and the global `errorHandler`. Controllers validate input, throw `AppError`, and shape bare read payloads or `{ success: true }` mutation envelopes. **Auth and Access Control** plugs into that assembly. It supplies the `authenticate`, CSRF, rate-limit and `requireAdmin` middleware, the `/auth` and `/admin` routers, and a repository layer over `node:sqlite`. It is phase 1 of ADR-009: single-tenant and flat-authorization. File-access policies are stored but not enforced on reads yet.

All filesystem work goes through **Storage Services**. `PathService` is the traversal choke point. `FileSystemService` handles listings, bounded tree walks and mutations. `UploadService` handles multer staging into hidden `.upload-*.part` files, a free-space watermark and atomic placement. `PreviewService` handles optional thumbnails. The module also holds the shared `validators`, `fileTypes`, `concurrency` and `AppError` utilities. **Metadata and Settings Stores** keep `metadata.json` and `settings.json` under `AFM_DATA_DIR`. They use cached singletons with temp-file-then-rename writes. Metadata writes are deliberately fire-and-forget and must never fail the file operation they accompany. The settings store is ADR-006's validated full-replace document.

The browser side has three modules. **Frontend Core** is the shared runtime. `api.js` is the only place API URLs are built and the only holder of the CSRF token. `app.js` provides the toolkit (Toast, Modal, Format, Icons, Store). `router.js` swaps pages in place without a reload (ADR-005). The core also includes the sidebar, theme, notifications and the CSS design system. **Files Page** is the most complex single page: browse, search, upload by drag-and-drop, cut, copy and move, star, delete, and set access policies (ADR-003). **Feature Pages** contains Dashboard (ADR-002), Uploads (ADR-004), Settings (ADR-006), Admin and Login. Both page modules are IIFEs that `router.js` can `init()` and `destroy()` many times per document. They reach the backend only over HTTP through `window.API`.

**Deployment Scripts** run outside the process. They implement ADR-008: an allow-list `git archive` of one commit is shipped over SSH, unpacked into an immutable release directory, gated by the hermetic test suite, swapped in atomically through a `current` symlink, health-checked against `GET /api/v1/health`'s `apiVersion`, and rolled back on failure. Production config lives only in `/etc/dimension/dimension.env`. The receipt dependency graph contains real cycles, and they come from configuration. Server Bootstrap and Config depends on HTTP API Layer and Auth and Access Control, which it mounts. HTTP API Layer depends on Storage Services. Storage Services, Metadata and Settings Stores, and Auth and Access Control all `require` the config object back from Server Bootstrap and Config. That gives the cycle Server Bootstrap and Config → HTTP API Layer → Storage Services → Server Bootstrap and Config, a direct two-way edge between Server Bootstrap and Config and Auth and Access Control, and Server Bootstrap and Config → HTTP API Layer → Auth and Access Control → Server Bootstrap and Config. These are module-level cycles, not file-level `require` cycles. `env.js` and `dataDir.js` are leaves that import nothing from the app, and only `server.js` reaches upward. That is why the cycle is harmless at load time. It does mean "Server Bootstrap and Config" is two things: a leaf config provider and the root composer. Storage Services → Server Bootstrap and Config is also the edge that `UploadService` partly bypasses by re-reading `process.env`.

<!-- c2d:y2 -->
## Architecture Type

**Modular monolith.**

- **Why it is a monolith:** one deployable unit, one Node process, one release directory. The API, the static SPA assets, and the SQLite and JSON stores ship and run together. There is no inter-service network protocol.
- **Why it is modular:**
  - The backend modules have enforced seams: the layered rule `routes → controllers → services → fs`, `PathService` as the single path boundary, and `AppError` plus `errorHandler` as the single error channel.
  - The frontend is separated from the backend by a versioned HTTP contract (ADR-007), with `api.js` as the only client-side boundary. `test/integration/repo-guardrails.test.js` enforces that boundary.
  - Deployment is an external contract tied to the app only through `apiVersion` and the env file (ADR-008).
- **Why the other labels do not fit:**
  - *Plugin-based:* the one optional extension point, an image transformer probed with `require('sharp')`, is a capability probe, not a plugin system.
  - *Microservices or hybrid:* nothing runs out of process except the bash deploy tooling.
- **Caveat on the label:** the config cycle described in the narrative means the module boundaries are not a strict DAG. Server Bootstrap and Config is both a leaf dependency and the composition root.

<!-- c2d:y3 -->
## System-Wide Patterns

- **Singleton service objects.** Every stateful component is one process-wide instance with no DI container. Test seams are exposed so suites can redirect state before `server.js` loads: `dbPath`, `reset()`, `_useTransformer`, `_useFreeSpaceReader`, and the injectable `source` parameter of `validateStartup`.
  - Server Bootstrap and Config: a config object built at require time.
  - Storage Services: static-method classes.
  - Metadata and Settings Stores: `new X()` instances.
  - Auth and Access Control: services, repositories and `AdminDatabase`.
  - Frontend Core: IIFEs attached to `window`, with `API` frozen.
- **AppError error contract with static messages.** Expected failures are thrown as `AppError(message, status)` and serialized once by `errorHandler` as `{ success: false, error }`.
  - Storage Services maps errno codes to static messages.
  - Metadata and Settings Stores wrap read and init failures with the original error kept on `.cause`.
  - HTTP API Layer controllers are uniformly `try { } catch (e) { next(e) }`.
  - Auth and Access Control services throw it too.
  - The aim is that no absolute path or errno reaches a client. The gaps are listed under Issue Themes.
  - Modules: HTTP API Layer, Storage Services, Metadata and Settings Stores, Auth and Access Control.
- **Envelope split: bare reads, enveloped mutations.** This is AGENTS.md rule 6.
  - Read-only aggregates return bare shapes. Mutations return `{ success: true, ... }`.
  - A `200` from a bulk mutation can still carry `data.failed`.
  - Modules: HTTP API Layer, Auth and Access Control, Metadata and Settings Stores (settings `PUT`). Files Page and Feature Pages consume it.
- **Explicit unavailability: unknown is not zero.** A value that could not be measured is reported as `null` plus an `*Available: false` flag on the server, and rendered as `—` on the client. No status is asserted without a real threshold source. Dashboard rationale: ADR-002.
  - Storage Services: `volumeAvailable`, and health metrics left out rather than faked.
  - HTTP API Layer: `sizeAvailable` on truncated folder walks.
  - Frontend Core: `resolveStorageDisplay`.
  - Feature Pages: `UNAVAILABLE_MARK`, and `Format.duration(null)` on Uploads.
- **Bounded work.** Every potentially unbounded operation has a cap.
  - Storage Services:
    - `getTreeStats` has a 100k-entry / 2000 ms budget and reports truncation.
    - An in-process upload concurrency gate (default 4).
  - HTTP API Layer:
    - `mapWithConcurrency(..., 16)` for list enrichment.
    - A two-level `getTree` with `childrenLoaded: false`.
    - A 500-path bulk cap.
  - Auth and Access Control: an in-memory per-IP rate limiter and login lockout.
  - Feature Pages: an upload concurrency control, and a health poll that stops on its first failure.
- **Atomic replace writes.** State is never half-written in place.
  - Metadata and Settings Stores: `writeFile(tmp)` then `rename`, with the cache updated only after the rename.
  - Storage Services: staged uploads placed with `fs.link` (no-overwrite) or `fs.rename` (overwrite).
  - Deployment Scripts: `atomic_link` (`ln -sfn` to a temp name, then `mv -Tf`).
- **Re-entrant page lifecycle with delegated listeners.** Because `router.js` swaps pages in place (ADR-005), each page module's `init()` resets its state. Every global listener or timer it adds is tracked and removed in `destroy()`. Shared chrome binds by document-level delegation with double-bind guards. Stale async results are dropped with request ids or nav tokens.
  - Modules: Frontend Core, Files Page, Feature Pages.
- **Single client network boundary and silent calls.** All transports go through `window.API`, including named builders for iframe, form and `<img>`. Rejected errors carry machine-readable `status` and `kind`. Pages pass `{ silent: true }` when they report a failure themselves, and classify failures from `status` or `kind`, never from message text.
  - Modules: Frontend Core, Files Page, Feature Pages.
- **Partial-success reporting.** Outcomes are reported per item instead of as one boolean.
  - HTTP API Layer: bulk move, copy and delete collect `failed[]`.
  - Files Page: `summarizeDelete`, `summarizeMove`, `summarizeCopy`, and `Promise.allSettled` for stars and policies.
  - Feature Pages: Uploads batches its outcome toasts.
- **Fail-fast startup gates.** Problems are caught before serving.
  - Server Bootstrap and Config: `validateStartup()` before `listen`.
  - Auth and Access Control: synchronous migrations that refuse an unknown newer schema version.
  - Deployment Scripts: config sanity checks, required and forbidden path checks, and a hermetic `npm test` before activation.

<!-- c2d:y4 -->
## Cross-Cutting Themes

- **Path Containment and Client Paths.**
  - Every path consumer passes `validateClientPath` / `validateFileName` and `PathService.resolveSecurePath` (ADR-001). Absolute paths stay inside services.
  - Path-keyed state lives in three places, each kept in step by hooks on rename and delete: the filesystem (Storage Services), metadata keys (Metadata and Settings Stores), and policy rows (Auth and Access Control).
  - The frontend renders filesystem-derived strings and must escape them, because CSP is disabled.
  - Modules: Storage Services, HTTP API Layer, Metadata and Settings Stores, Auth and Access Control, Files Page.
- **Error Contract and Sanitization.**
  - `AppError` plus `errorHandler` on the server. Machine-readable `status` and `kind` on the client.
  - The rule that static messages hide absolute paths and errno values.
  - Streaming endpoints need special handling once headers are sent.
  - Modules: HTTP API Layer, Storage Services, Metadata and Settings Stores, Auth and Access Control, Frontend Core.
- **Truthful Reporting and Unavailability.** This is the project-wide integrity rule from AGENTS.md and ADRs 002–004:
  - No fabricated metrics, no `0` standing in for unknown, and no success message for an operation that did not happen.
  - No control without a consumer.
  - Runs from the bounded tree walk and the store read filters through the dashboard controller to every page.
  - Modules: Storage Services, HTTP API Layer, Metadata and Settings Stores, Frontend Core, Files Page, Feature Pages.
- **Authentication and CSRF.** This is ADR-009 phase 1.
  - Session cookie or bearer token, hashed tokens, scrypt passwords, a CSRF header on every non-GET request, rate limiting and lockout.
  - On the client, `api.js` holds the CSRF token in a closure and Login runs an open-redirect guard.
  - Authorization is flat. Policies are data only, and the Files page shows the policy action to everyone and relies on a server 403.
  - Modules: Auth and Access Control, Server Bootstrap and Config, HTTP API Layer, Frontend Core, Files Page, Feature Pages.
- **Concurrency and Consistency.** Behaviour rests on a single process and a single event loop:
  - Stores assume they are the sole writer.
  - Metadata is eventually consistent and fire-and-forget.
  - The upload gate is per process.
  - Clients use stale-response guards and attempt counters.
  - Shutdown is ordered by timeouts: app 30 s < systemd 45 s < nginx 600 s.

  Many of the issues found are races at these seams. Modules: Storage Services, Metadata and Settings Stores, HTTP API Layer, Server Bootstrap and Config, Files Page, Feature Pages, Deployment Scripts.

<!-- c2d:y5 -->
## Issue Themes

Ranked by severity. In total: 1 high, 25 medium, the rest low, across 88 records.

1. **Path containment is lexical where it needs to be canonical. Severity: high. Modules: 3 (+1 related).** The one high issue is in Storage Services:
   - `mutations-lexical-guard-only`: `createDirectory`, `rename`, `move` and `copy` rely only on lexical `resolveSecurePath`, so an in-root symlink or junction lets a write escape `STORAGE_ROOT`. This breaks the project's first red line.
   - `toclientpath-canonical-root-mismatch`: the same canonical-vs-lexical mismatch, triggered by a symlinked root.
   - The same habit of checking strings instead of resolved paths appears in Deployment Scripts (`app-root-containment-lexical`).
   - Related, in Feature Pages: the Login redirect guard has a string-check bypass (`login-open-redirect-backslash-bypass`).
   - Server Bootstrap and Config only checks readability, not writability (`dir-checks-skip-writability`).
2. **Path-keyed state drifts on folder rename and delete. Severity: medium. Modules: 2, which share the same flaw.** The rename and delete hooks match exact keys only, so entries under a renamed or deleted folder are left behind:
   - Metadata and Settings Stores: `rename-delete-ignore-descendants`.
   - Auth and Access Control: `policy-path-hooks-exact-match`.

   For access policies this goes beyond a cosmetic gap. A policy can silently stop applying, or attach to a later path that reuses the name.
3. **Unlocked read-modify-write and check-then-act races. Severity: medium. Modules: 6.**
   - Metadata and Settings Stores:
     - `shared-tmp-write-race`: concurrent writes share one fixed `.tmp` path.
     - `cache-mutated-before-write`: memory diverges from disk when a write fails.
   - HTTP API Layer: `star-set-race`, `zip-double-next`.
   - Storage Services: `rename-move-check-then-act`, and `copy-partial-tree-on-failure` (no cleanup).
   - Server Bootstrap and Config: `double-signal-false-clean-exit`.
   - Frontend side, in Files Page and Feature Pages: `upload-queue-not-global`, `router-concurrent-beforeleave`, `forced-verify-returns-stale-inflight`, `dashboard-poll-starts-after-destroy`.
   - Deployment Scripts: `lock-timeout-clobbers-record`.
   - Root cause: the system relies on event-loop serialization and per-process singletons but has no explicit locks or write queues.
4. **Expected failures escape as raw 500s or unsanitized messages. Severity: medium. Modules: 4.** The `AppError` contract has holes:
   - HTTP API Layer:
     - `bulk-raw-error-leak`: raw `err.message` goes into `failed[]` and is rethrown, bypassing sanitization. This can leak absolute paths.
     - `zip-unguarded-req-body`, `error-inherits-attachment-headers`, `errorhandler-no-headerssent-guard`.
   - Metadata and Settings Stores: `write-errors-not-apperror`.
   - Auth and Access Control:
     - `user-delete-fk-500`, `cookie-decode-throws`, `audit-in-catch-masks-error`.
     - The 500-vs-401 half of `login-enumeration`.
   - Storage Services: `nul-in-client-path-500`, `filename-length-not-bytes`.
5. **Silent failure and false success, against the project's own truthfulness rule. Severity: medium. Modules: 5.**
   - HTTP API Layer: `dashboard-metadata-silent-empty` turns a metadata failure into an unlogged `[]`, which contradicts AGENTS.md's claim that this case is a 500.
   - Frontend Core: `download-errors-invisible`, `clipboard-false-success`.
   - Files Page: `dropped-folder-exists-check-uses-current-page`, `folder-drop-read-errors-silent`.
   - Deployment Scripts: `manual-rollback-no-restore` exits 0 on an unhealthy release.
   - Many of these sit on transports where errors are hard to observe: iframe downloads, drag-and-drop folder reads, systemd.
6. **Admin identity edge cases. Severity: medium. Modules: 1 (Auth and Access Control).**
   - `no-last-admin-guard`.
   - `lockout-rearms-after-expiry`: lockout can last indefinitely.
   - `login-enumeration`: a timing leak.
   - `policy-flags-untyped`: `"false"` is stored as true.
   - `csrf-compare-not-constant-time`.

   This is new phase-1 code (ADR-009) and has not yet had the hardening the filesystem boundary has had.
7. **UI promise and lifecycle leaks. Severity: medium/low. Modules: 3.** Modal-style promises are left pending and router re-init skips rendering:
   - Frontend Core: `modal-closeall-strands-promises`, `body-overflow-uncoordinated`.
   - Files Page: `policy-modal-escape-never-resolves`, `upload-tray-hidden-after-reinit`.
   - Feature Pages: `dashboard-poll-starts-after-destroy`.

   These follow from the re-entrant lifecycle pattern (ADR-005). Every overlay and timer needs a resolution path on teardown.
8. **Doc and config drift. Severity: low, but treated as bugs by AGENTS.md. Modules: 6.**
   - Comments or docs that contradict the code:
     - Server Bootstrap and Config: `stale-datadir-comment`.
     - HTTP API Layer: `summary-doc-overstates-degradation`.
     - Deployment Scripts: `superseded-doc-mismatch`.
     - Feature Pages: `settings-header-claims-missing-consumer`.
   - Config read outside the validated config object, or duplicated:
     - Storage Services: `upload-limits-bypass-config`.
     - Auth and Access Control: `duplicated-ttl-and-parser`.
   - Duplicated skeletons:
     - Metadata and Settings Stores: `duplicated-store-skeleton`.
     - HTTP API Layer: `bulk-loop-triplicated`.
     - Files Page: `column-breakpoints-duplicated`.
9. **Unbounded growth and per-request cost. Severity: medium/low. Modules: 4.**
   - Metadata and Settings Stores: `full-rewrite-unbounded-downloads`, the full-store rewrite on every download.
   - Auth and Access Control: `no-session-audit-retention`, and `touch-write-every-request` (a synchronous SQLite write per request).
   - HTTP API Layer: `list-walks-all-folders-before-paging`, a recursive walk per folder before paging.
   - Deployment Scripts: `failed-releases-consume-retention`.
   - All are fine at single-operator scale but have no ceiling.
