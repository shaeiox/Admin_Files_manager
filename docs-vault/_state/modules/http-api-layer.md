---
module: HTTP API Layer
slug: http-api-layer
purpose: Express routers and controllers exposing the versioned filesystem, dashboard and settings REST API.
roots:
  - src/routes/
  - src/controllers/
  - src/middlewares/
language: javascript
complexity: medium
loc: 1174
files:
  - src/routes/api.js
  - src/routes/fs.routes.js
  - src/routes/dashboard.routes.js
  - src/routes/settings.routes.js
  - src/controllers/fs.controller.js
  - src/controllers/dashboard.controller.js
  - src/controllers/settings.controller.js
  - src/controllers/preview.controller.js
  - src/middlewares/errorHandler.js
analyzed-at: 2026-10-14T05:05:10Z
source-commit: e2698aedbe42c3c2c0cc24c38e3ef2b45c1843ae
---

<!-- c2d:s1 -->
### Architecture
Classic layered MVC-without-views: `routes -> controllers -> services`. `src/routes/api.js` is the single API assembly; `server.js` mounts it at both `/api/v1` and `/api` (ADR-007). Inside the assembly the order is: a version-segment guard (rejects a foreign or case-mismatched version segment such as `/api/V1` via `next('router')`), the public `GET /health`, the self-gating `/auth` router (owned by Auth and Access Control), then blanket `authenticate` + `csrf` middleware, then the resource routers `/fs`, `/dashboard`, `/settings`, `/admin`. Route files hold declarations only; each maps a verb+path to a controller function. Controllers parse/validate input with `validateClientPath` / `validateFileName`, call static/singleton services, shape the DTO, and either `res.json(...)` or forward errors with `next(error)`. Control exits via a JSON response, a piped stream (file download, ZIP, thumbnail buffer), or the global `errorHandler` (registered by `server.js`), which serializes `{ success: false, error }`.

<!-- c2d:s2 -->
### Public API
Module exports:
```js
module.exports = router // src/routes/api.js — the assembled API router mounted at /api/v1 and /api
```
```js
errorHandler(err, req, res, next) // src/middlewares/errorHandler.js — global error serializer; only AppError messages reach the client, others get a generic string
```
```js
fsController: { getTree, getList, createFolder, renameItem, moveItems, copyItems, deleteItems, downloadFile, uploadFile, downloadZip, setStar, LIST_ENRICH_CONCURRENCY /*16*/, LIST_MAX_LIMIT /*200*/, LIST_SORT_KEYS }
```
```js
dashboardController: { getSummary, getHealth }; settingsController: { getSettings, replaceSettings }; previewController: { getThumbnailCapability, getThumbnail }
```
HTTP routes (each served under both `/api/v1` and `/api`):
```
GET    /health                    — public liveness: { success, message, apiVersion: 1 } (deploy activation gate)
GET    /fs/tree?path=             — bare [rootNode], 2-level folder tree with childrenLoaded flags
GET    /fs/list?path&page&limit&sort&dir&search&type&starredOnly — bare { items, total, counts }
GET    /fs/download?path=         — streams file as application/octet-stream attachment; increments download count
GET    /fs/thumbnail/capability   — bare { available, formats, maxSize }
GET    /fs/thumbnail?path&size    — bounded image buffer, or error with X-Preview: unavailable
POST   /fs/folder   {path}                              — 201 { success, data: { path } }
POST   /fs/upload   multipart destination,overwrite,file — 201 { success, data: { name, path, size } }
POST   /fs/star     {path, starred?}                    — { success, data: { path, starred } } (toggle, or idempotent set)
POST   /fs/download-zip {paths}                         — streams application/zip (paths may arrive as a JSON string from a form post)
PUT    /fs/rename   {oldPath, newName}                  — { success, data: { oldPath, newPath } } (same directory)
PUT    /fs/move     {paths, destination}                — { success, data: { moved, failed } }
POST   /fs/copy     {paths, destination}                — { success, data: { copied, failed } }
DELETE /fs/delete   {paths}                             — { success, data: { deleted, failed } }
GET    /dashboard/summary         — bare { stats, storage, storageBreakdown, activities, topFiles, health }
GET    /dashboard/health          — bare health-metrics value
GET    /settings                  — bare settings document
PUT    /settings                  — { success, settings } (strict full replace)
```

<!-- c2d:s3 -->
### Internal Patterns
- **Uniform controller shape:** every async handler is `try { ... } catch (e) { next(e) }`; expected failures are thrown as `AppError(message, status)` and never serialized inline.
- **Envelope split (rule 6):** read-only aggregates answer bare shapes; mutations answer `{ success: true, ... }`.
- **Bulk partial-failure contract:** `moveItems`, `copyItems`, `deleteItems` process up to 500 paths sequentially, collecting `{ path, error, statusCode }` per failure; a 200 can carry `data.failed`; only when every item fails is the first failure rethrown as an `AppError`. Per-item `error` is the raw `err.message` of whatever was thrown, so a non-AppError message is placed in `failed[]` without the sanitizing `errorHandler` applies (and an all-failed batch rethrows it as an AppError, so it also bypasses that sanitizing).
- **Fire-and-forget metadata:** `addActivity`, `incrementDownload`, `deletePath` are called with `.catch(() => {})`; `renamePath` is awaited but its failure is only logged. Rename/move/delete also notify `FileAccessPolicyService.onPathRenamed` / `onPathDeleted`.
- **Bounded concurrency:** `getList` primes the metadata cache with one read, then enriches entries via `mapWithConcurrency(..., 16)`; vanished/unreadable entries are skipped and counted, not fatal. Folder sizes become `null` + `sizeAvailable: false` when the recursive walk truncated or hit inaccessible entries.
- **Composable bounded recursion:** `getTree` walks only 2 levels; nodes past the cap return `childrenLoaded: false` so the client re-requests that path. Failure at the requested root propagates; failures deeper are logged and reported as empty-but-loaded.
- **Streaming:** downloads use `fs.createReadStream(stats.securePath).pipe(res)`; ZIP uses archiver 8 `ZipArchive` piped to `res`, aborted on `req` close. Stream errors go to `next` only if headers are unsent; otherwise the response is destroyed. Backslashes in `securePath` are normalized for archiver.
- **Header safety:** `downloadFile` re-validates the basename with `validateFileName` before placing it in `Content-Disposition`.
- **Upload callback bridge:** `uploadFile` is non-async and wraps `UploadService.middleware` (multer); on any failure it awaits `UploadService.discard(staged)` before `next(error)`.
- **Per-capability degradation (dashboard):** `getSummary` fetches tree/volume stats in one `Promise.all` (a failure there is a 500) but wraps the metadata fetch in its own try/catch, degrading `activities`/`topFiles` to `[]`. This deviates from AGENTS.md, which states that a corrupt metadata store makes the summary a 500. DTO shaping (`buildStats`, `buildStorageBreakdown`) lives only in the controller; no DashboardService exists by design.
- **Version guard:** `api.js` inspects `req.baseUrl` to reject case-mismatched or foreign version segments, because Express mount matching is case-insensitive.
- **Thin settings controller:** validation is delegated entirely to `SettingsService`.

<!-- c2d:s4 -->
### Dependencies
1. **Other project modules**
   - Storage Services — `FileSystemService` (readDirectory, getStats, getTreeStats, getVolumeStats, getHealthMetrics, retainExisting, createDirectory, rename, move, copy, remove), `UploadService` (middleware, stagedPathOf, toUploadError, resolveDirectory, commit, discard), `PreviewService` (capability, parseSize, render); shared utils `validators` (validateClientPath, validateFileName), `AppError`, `fileTypes` (classifyFile, emptyBreakdown, CATEGORIES), `concurrency` (mapWithConcurrency).
   - Metadata and Settings Stores — `MetadataService` (getFileMeta, getActivities, getTopDownloads, addActivity, incrementDownload, renamePath, deletePath, toggleStar), `SettingsService` (getAll, replace).
   - Auth and Access Control — `auth.routes`, `admin.routes`, and the `authenticate` and `csrf` middleware mounted in `api.js`; `FileAccessPolicyService.onPathRenamed` / `onPathDeleted` called from `fs.controller.js`.
2. **Third-party packages**
   - `express` ^5.2.1 — `express.Router()` for all route modules.
   - `archiver` ^8.0.0 — `ZipArchive` for streamed ZIP downloads.
   - `multer` ^2.4.0 — used indirectly through `UploadService.middleware`.

<!-- c2d:s5 -->
### Complexity
Medium. Route files and the settings/preview controllers are trivial declarations and thin pass-throughs, and the error handler is a single branch. Complexity concentrates in `src/controllers/fs.controller.js` (709 lines, 11 handlers), which carries input normalization, bulk partial-failure aggregation, streaming with error-after-headers handling, and metadata side effects. The single most complex function is `getList` (~90 lines): it combines query parsing with fallbacks, concurrent per-entry stat/metadata enrichment with skip accounting, folder-size availability logic, starred/type filtering, per-type counts, a null-aware multi-key comparator, and pagination. `getTree`'s nested recursive closure and `downloadZip`'s stream lifecycle (abort on client close, error routing by `headersSent`) are the next most intricate.

<!-- c2d:s6 -->
### Key Files
- `src/routes/api.js` — single API assembly: version guard, public health, auth gating order, and resource router mounts.
- `src/controllers/fs.controller.js` — all filesystem handlers: tree, list, CRUD, bulk move/copy/delete, star, upload, download and ZIP streaming.
- `src/controllers/dashboard.controller.js` — composes services into the bare dashboard summary/health DTOs with per-capability degradation.
- `src/middlewares/errorHandler.js` — global `{ success: false, error }` serializer that withholds non-AppError messages.
- `src/routes/fs.routes.js` — verb/path table for the 13 `/fs` endpoints.
- `src/controllers/preview.controller.js` — thumbnail capability and bounded preview rendering with the `X-Preview: unavailable` marker.

<!-- c2d:s7 -->
### Limitations & Improvements

**1. Bulk handlers leak unsanitized error messages** — Bug or Risk, medium
`src/controllers/fs.controller.js` lines 348-359 (move), 407-418 (copy), 464-475 (delete). Each per-item `catch` stores `err.message` verbatim in `data.failed[]`, whatever the error class. `errorHandler` deliberately replaces non-`AppError` messages with a generic string because raw fs errors embed absolute paths (`ENOENT: no such file or directory, rename 'D:\storage\...'`). The bulk path skips that rule twice: a partial failure returns the raw message in a 200 body, and an all-failed batch wraps the first raw message in a new `AppError`, which `errorHandler` then trusts and returns. That breaks rule 2 (absolute OS paths never leave the services layer). Fix: sanitize at the point of collection.
```js
// before
results.failed.push({ path: clientPath, error: err.message, statusCode: err.statusCode || 500 });
// after
const safe = err instanceof AppError ? err.message : 'Operation failed.';
results.failed.push({ path: clientPath, error: safe, statusCode: err.statusCode || 500 });
```

**2. Dashboard metadata failure is silent and indistinguishable from "empty"** — Bug or Risk, medium
`src/controllers/dashboard.controller.js` lines 127-140. The `catch {}` drops the error without logging it and degrades `activities`/`topFiles` to `[]`. A client cannot tell "no activity yet" from "store unreadable". AGENTS.md requires an unmeasurable quantity to be marked explicitly unavailable, never shown as a zero or empty reading. The same AGENTS.md section also still says a corrupt metadata store makes the summary a 500, so the code and the project rules disagree. Fix: log the error and add an `activityAvailable: false` flag (an additive field, allowed within v1), then update AGENTS.md/CONTRACTS.md.
```js
} catch (err) {
    console.error('[Dashboard] metadata unavailable:', err.message);
    metadataAvailable = false;
}
// ... res.json({ ..., activities, topFiles, metadataAvailable })
```

**3. getSummary doc comment overstates degradation** — Improvement Opportunity, low
`src/controllers/dashboard.controller.js` lines 110-125. The JSDoc says an unreadable tree "removes only its own contribution" and that "no capability is allowed to fail the whole response". But `getTreeStats`/`getVolumeStats` run in a bare `Promise.all`, so a rejection from either one is a 500. Fix: correct the comment, or deliberately wrap each one as its own capability.

**4. Non-atomic idempotent star set (read-then-toggle race)** — Bug or Risk, low
`src/controllers/fs.controller.js` lines 596-599. `setStar` reads `starred` and then calls `toggleStar` when the requested value differs. Two concurrent `{ starred: true }` requests can both read `false` and both toggle, so the file ends up unstarred even though both calls asked for "starred". Fix: add a `MetadataService.setStar(path, value)` that writes the absolute value inside the store's own write, and keep toggle only for the no-`starred` case.

**5. ZIP entries collide on duplicate basenames** — Bug or Risk, low
`src/controllers/fs.controller.js` lines 636-685. Each entry is archived under `path.posix.basename(clientPath)`. Selecting `/a/report.pdf` and `/b/report.pdf` (for example from a starred or search view across folders), or sending the same path twice, writes two ZIP entries with the same name. Extractors then overwrite or prompt. Fix: de-duplicate `rawPaths`, and suffix colliding names (`report (2).pdf`) before calling `archive.file`/`archive.directory`.

**6. downloadZip dereferences `req.body` without a guard** — Bug or Risk, low
`src/controllers/fs.controller.js` line 617. Under Express 5, `req.body` is `undefined` when no body parser matched (missing or unknown `Content-Type`), so `req.body.paths` throws a `TypeError` and the client gets a 500 instead of a 400. Every other handler uses `req.body || {}`.
```js
// before
let rawPaths = req.body.paths;
// after
let rawPaths = (req.body || {}).paths;
```

**7. Error responses inherit download headers** — Bug or Risk, low
`src/controllers/fs.controller.js` lines 508-527 and 650-662. `Content-Disposition: attachment` (and, for single files, `Content-Type: application/octet-stream`) is set before the stream opens. If the stream or archive errors before the first byte, `next(AppError)` runs and `errorHandler` writes JSON, but the attachment header is still there. The hidden download iframe then saves the `{ success:false }` JSON under the original file name. Fix: call `res.removeHeader('Content-Disposition')` before `next(...)` in the pre-headers branch, or have `errorHandler` clear it.

**8. Possible double `next()` on ZIP module errors** — Bug or Risk, low
`src/controllers/fs.controller.js` lines 656-662 and 687-690. The `archive.on('error')` listener calls `next(...)` when headers are unsent. `await archive.finalize()` can also reject with the same error, and the outer `catch` calls `next(error)` a second time, which can raise `ERR_HTTP_HEADERS_SENT`. Fix: let one path own the error, for example by tracking `let failed = false` in the listener and skipping `next` in the catch when it is already set.

**9. errorHandler does not guard `res.headersSent`** — Improvement Opportunity, low
`src/middlewares/errorHandler.js` lines 24-43. Any error that reaches the handler after a response has started streaming makes `res.status().json()` throw. Controllers guard this themselves today, but the global handler is the safety net. Fix:
```js
if (res.headersSent) return next(err); // let Express close the connection
```

**10. getList recursively walks every listed folder before paginating** — Limitation, medium
`src/controllers/fs.controller.js` lines 168-207 and 221-226. Every candidate folder in the directory gets a `FileSystemService.getTreeStats` walk (bounded by the service, 16 in flight), and pagination happens only after all of them finish. A page of 20 items in a directory of hundreds of large subfolders still pays for every walk on every request, including search keystrokes. Sorting by size needs the totals, but other sort keys do not. Fix: compute folder sizes only for `sort=size`, or only for the sliced page, and return `sizeAvailable: false` otherwise. Alternatively, cache tree stats briefly.

**11. Bulk partial-failure loop is triplicated** — Improvement Opportunity, low
`src/controllers/fs.controller.js` lines 311-485. `moveItems`, `copyItems` and `deleteItems` repeat the same array/size validation, the per-item try/catch, the `failed[]` shape and the all-failed rethrow. Fixing finding 1 has to be done three times. Fix: extract `runBulk(paths, worker)` returning `{ ok, failed }`, plus a shared `assertPathList(paths)`.

**12. Activity log always records `user: 'system'`** — Limitation, low
`src/controllers/fs.controller.js` lines 252-258, 288-294, 338-344, 398-404, 455-461, 556-562. The API now requires a session (ADR-009), and `authenticate` attaches `req.user`, yet every activity entry is hard-coded to `'system'`. The audit trail cannot say who renamed or deleted a file. Fix: pass the user's id or display name from `req.user`, falling back to `'system'`.
