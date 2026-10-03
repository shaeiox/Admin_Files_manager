# 🚀 Dimension Files Manager — Node.js Backend Checklist

This document outlines the atomic steps to build a secure, high-performance Node.js backend that acts as a bridge between the Dimension UI and a sandboxed storage directory on the host filesystem.

**The storage root is not a fixed location and the app is not Linux-only.** The served directory is whatever absolute path the `STORAGE_ROOT` environment variable names at boot (`src/config/env.js` exits the process if it is unset). The server runs unchanged on Windows and Linux; capacity is read with `fs.promises.statfs` with **no platform gate**. Occurrences of `/download` elsewhere in this document are historical shorthand for "the storage root", not a literal path — do not take them as a platform requirement.

## 🏗️ Phase 1: Project Setup & Core Server
- [x] Initialize Node.js project (`npm init -y`).
- [x] Install core dependencies (`express`, `cors`, `dotenv`, `helmet`).
- [x] Setup standard folder structure (`/src/controllers`, `/src/routes`, `/src/services`, `/src/utils`).
- [x] Create basic Express server (`server.js`) with global error handling middleware.
- [x] Configure Environment Variables (`.env`) for the storage root path (e.g., `STORAGE_ROOT=/download`).

## 🛡️ Phase 2: Security & FS Service Layer
- [x] Create `PathService` to securely resolve and sanitize client paths against `STORAGE_ROOT` (Prevent Directory Traversal attacks).
- [x] Create `FileSystemService` wrapping Node's `fs/promises` (`stat`, `readdir`, `mkdir`, `rename`, `rm`).
- [x] Implement a safe `exists` and `isDirectory` check mechanism.

## 💾 Phase 3: Metadata Service (JSON Database)
- [x] Create `MetadataService` to manage `metadata.json` (stored outside the public download folder).
- [x] Implement read/write locks or atomic writes to prevent data corruption during concurrent requests.
- [x] Create methods to get/set stats (downloads count, starred status, activity logs) mapped to file paths.

## 📂 Phase 4: File Browser APIs (Read)
- [x] Implement `GET /api/fs/tree` (Scan directories up to depth 2 to build the sidebar tree).
- [x] Implement `GET /api/fs/list` (Read directory contents, merge with Metadata, handle sorting/filtering/pagination).
- [x] Mount these routes in `/src/routes/fs.routes.js`.

## ✍️ Phase 5: File Mutations APIs (Write)
- [x] Implement `POST /api/fs/folder` (Create new directory). Registered at `fs.routes.js:14` → `createFolder` (`fs.controller.js:165`).
- [x] Implement `PUT /api/fs/rename` (Rename). Registered at `fs.routes.js:17` → `renameItem` (`fs.controller.js:196`).
      - **Corrected from the original wording "Rename/Move".** Moving is not implemented and is not a bug: `FileSystemService.rename` is
        **same-directory only** by design, because only `newName` is accepted and a cross-directory move would need a dedicated,
        explicitly-designed API. Do not widen the request body to "just support moves".
      - Known defect (not fixed, see "Known pre-existing issues"): `MetadataService.renamePath` assigns
        `db.downloads[newPath] = db.downloads[oldPath]` instead of merging, so a rename onto a path that already had a
        download count silently discards that count.
- [x] Implement `DELETE /api/fs/delete` (Delete files/folders securely). Registered at `fs.routes.js:18` → `deleteItems` (`fs.controller.js:231`). Permanent (`fs.rm`, recursive) — no trash.
- [x] Implement `GET /api/fs/download` (Stream file to client with proper Content-Disposition headers). Registered at `fs.routes.js:11` → `downloadFile` (`fs.controller.js:286`), `createReadStream` + `pipe`.
- [ ] Implement `POST /api/fs/download-zip`. **Controller exists and is exported** (`downloadZip`, `fs.controller.js:398`, Archiver stream,
      `req.on('close')` cleanup at `:447`) but the route is **commented out** at `fs.routes.js:16`, while `api.js:263` still builds a form
      with `action = .../fs/download-zip` and `files.js:1169` calls `API.downloadZip(...)`. **Multi-file ZIP download therefore returns
      404.** Deliberately not fixed in this phase — see "Known pre-existing issues".

## 🚀 Phase 6: Streaming Upload Engine
- [x] Install streaming multipart parser. **`multer` 2.x** (`^2.4.0`), not busboy, and it lives in `fs.controller.js:328`.
- [x] Implement `POST /api/fs/upload` to pipe uploaded chunks directly to the storage root (Zero-memory-bloat streaming). Registered at `fs.routes.js:15`; `multer.diskStorage` (`:331`) resolves `req.body.destination` through `PathService.resolveSecurePath()` and streams to disk. Nothing is buffered in memory.
      - **Corrected from the original wording "directly to the Linux disk".** It writes to whatever `STORAGE_ROOT` names, on any host OS.
- [ ] Handle `overwrite` and `preservePath` logic from the frontend request. **Never implemented.** `fs.controller.js:346` still carries the
      TODO comment "Add logic here to check overwrite flag and append (1) if needed" and simply returns the sanitized name, so an upload to
      an existing path replaces it silently. The frontend sends neither field — `uploads.js:235` and `files.js:117` post `destination` only —
      so the parameters are dead in both directions. Left open.
- [~] Handle error handling for aborted requests or network drops during upload. **Partial only.** Multer errors are funnelled into
      `next(new AppError(err.message, 400))` (`fs.controller.js:363`) and a missing file yields 400, but there is **no** abort/close listener
      on the upload path, so a dropped connection can leave a truncated file behind with no cleanup. The only `req.on('close')` handler in the
      codebase is in the unmounted `downloadZip`. Left open.

## 📊 Phase 7: Dashboard & Telemetry APIs — **DONE (2 of 4 built, 2 deliberately not built)**

Shipped: `src/routes/dashboard.routes.js` → `src/controllers/dashboard.controller.js`, mounted at `/api/dashboard` in `server.js:38`
*before* the `/api` catch-all (that catch-all is a two-argument middleware which never calls `next()`, so anything mounted after it is
unreachable). The filesystem router is deliberately **not** remounted here.

- [x] Implement `GET /api/dashboard/summary` (real total files/folders, tree bytes, volume usage, activities, top downloads, storage
      breakdown, runtime health). `getSummary` (`dashboard.controller.js:114`).
      - Top-level keys: `stats`, `storage`, `storageBreakdown`, `activities`, `topFiles`, `health`. No key is ever `null`; the five
        arrays are always arrays.
      - **Three distinct quantities, not one.** `treeBytes` = bytes of regular files under `STORAGE_ROOT` (directory entry sizes,
        links/junctions and dotfiles excluded). `usedBytes` = `bsize * (blocks - bavail)`. `totalBytes` = `bsize * blocks`.
        `bsize` is used exactly as reported (it is not assumed to be a power of two, so multiplying by 1024 would be wrong) and
        `bavail` is pinned rather than `bfree`, because ext4 reserves blocks — only `bavail` is cross-platform consistent.
      - **No trend field exists.** `stats[].trendAvailable` is always `false`. See the struck item below for why.
      - `storage.truncated` is true when the tree walk hit its budget (100,000 entries / 2,000 ms). A truncated total is a *wrong*
        total, so the flag is surfaced rather than hidden.
- [x] Implement `GET /api/dashboard/health` (real CPU/RAM/Uptime metrics). `getHealth` (`dashboard.controller.js:152`) →
      `FileSystemService.getHealthMetrics()` (`:465`). Returns a bare array of `{name, value, unit, icon}`. **No `status`/`level`
      field** — no repository or platform source defines memory/uptime thresholds, so asserting healthy/warning/critical would be
      inventing one. **Load average is deliberately omitted**: `os.loadavg()` *exists* on Windows and returns `[0,0,0]`, a
      plausible-looking fabrication with no error to detect, and there is no portable capability probe.
- [ ] ~~Implement `GET /api/user/profile` (Return configured admin details).~~ **STRUCK — must never be built as described.**
      There is no authentication in this application, so "admin details" would be unauthenticated configuration disclosure. Identity
      is already derived from the single source of truth, `GET /api/health` (`server.js:29`), consumed by `app.js:960`. One endpoint,
      one source.
- [ ] ~~Create `GET /api/storage/quota`.~~ **STRUCK as a separate endpoint — it was never created and is not needed.**
      Capacity ships **inside** `GET /api/dashboard/summary` as `storage.{treeBytes, usedBytes, totalBytes, volumeAvailable, truncated}`.
      A dedicated quota route would have split one atomic snapshot of the volume across two requests that can disagree. Two corrections
      to the original wording, both important:
        1. The endpoint was **never created** — capacity did not move out of `/summary` and into `/storage/quota`.
        2. The original said "real **Linux** disk space". The implementation uses `fs.promises.statfs` with **no platform gate** and
           works identically on Windows and Linux. It degrades to explicit unavailability
           (`usedBytes: null`, `totalBytes: null`, `volumeAvailable: false`, still **HTTP 200**) on any host whose `statfs` lacks the
           required fields. `statfs` is called without `{bigint: true}` deliberately — BigInt values make `JSON.stringify` throw.
- [ ] ~~Calculate chart mock data or read from logs.~~ **STRUCK — fabricating a number is not an acceptable resolution, under any
      wording.** The original instruction offered mock data or log parsing as the fallback; both were rejected.
      Why neither was done: there is **no** retained history — no time-series store, no snapshot table, no history file — and
      `morgan('dev')` writes to stdout only, so there is no log to parse either. 14-day traffic charts, trend percentages, sparklines
      and period-over-period comparisons therefore cannot be produced honestly. The honest resolution was to **delete the chart
      affordance entirely** (`traffic`, `renderChart`, `renderLegend`), not to fill it with invented numbers. Every figure the Dashboard
      shows is instantaneous.

**Failure semantics — precise, and narrower than it looks.** These endpoints are read-only aggregates that return **bare**
top-level payloads (`GET /api/dashboard/summary` an object, `GET /api/dashboard/health` an array). No other read-only
aggregate deviates from whole-success/whole-failure, so the dashboard's per-capability degradation is deliberate — but note
**which** capabilities actually degrade, because `getSummary` uses `Promise.all`, not `allSettled`:

| Capability | On failure |
|---|---|
| Volume capacity | Degrades. `getVolumeStats` catches everything → `usedBytes: null`, `totalBytes: null`, `volumeAvailable: false`, **still HTTP 200**. |
| Tree walk | Degrades per directory. An unreadable subdirectory increments `inaccessible` and is skipped; siblings continue. Only a caller-error start path throws. |
| Metadata | **Does NOT degrade.** `MetadataService._read` throws `AppError(…, 500)` for any non-`ENOENT` read failure (corrupt/unreadable `metadata.json`), `getActivities`/`getTopDownloads` propagate it, `Promise.all` rejects, and `getSummary` calls `next(error)` → **HTTP 500**. A missing file is fine (`ENOENT` bootstraps an empty store). |

So a 200 means "the volume and the tree walk completed", not "every field is populated" and not "every source answered".

## ⚙️ Phase 8: Settings API & Final Polish
- [ ] Implement `GET /api/settings` and `PUT /api/settings` (Read/write from a `config.json`). **Not implemented.** `settings.js:28`
      and `settings.js:132` call these endpoints and get a 404 from the `/api` catch-all.
- [ ] Implement `POST /api/settings/action` (Handle Danger Zone actions). **Not implemented.** `settings.js:249` calls it and 404s.
- [x] Serve the Frontend static files (HTML/CSS/JS) via Express static middleware so the app runs on a single port. `app.use(express.static(...))` at `server.js:25`, plus the pathless `index.html` fallback at `server.js:51`.

---

## 🧯 Known pre-existing issues — deliberately NOT fixed

Recorded so they are not mistaken for oversights in Phase 7. All of these predate this work; fixing them was out of scope and would
have required decisions that belong in their own change.

| # | Issue | Where |
|---|---|---|
| 1 | `err.stack` is serialised to clients outside production, leaking absolute OS paths. | `src/middlewares/errorHandler.js:20` |
| 2 | CORS is fully open (`app.use(cors())`, no origin allow-list). | `server.js:19` |
| 3 | There is no authentication or authorization on any endpoint, including upload and delete. | whole app |
| 4 | `.env` is git-tracked and contains a machine-specific `STORAGE_ROOT`; `.gitignore:7` still has `#.env` commented out. | `.gitignore:7`, `.env` |
| 5 | `MetadataService._write` uses a **fixed** temp path, so concurrent writes can interleave and corrupt `metadata.json`. | `src/services/MetadataService.js` |
| 6 | `MetadataService.renamePath` assigns the source download count over the target's instead of merging, so renaming onto an already-counted path discards that count. | `src/services/MetadataService.js:220-229` |
| 7 | File-type taxonomy drift persists. `src/utils/fileTypes.js` is the canonical **server-side** source and `FileSystemService` + the Dashboard breakdown use it, but `fs.controller.js` still duplicates the extension lists inline (currently an exact copy — so a future edit to one side will silently diverge from the other) and `app.js` carries a third, already-diverged hand-mirrored map (e.g. `ts`/`rs`/`go` and `avif`/`heic` are client-only, so the server classes them as `other`). | `src/utils/fileTypes.js:26-33` · `src/controllers/fs.controller.js:98-103` · `public/assets/js/app.js:277-284` |
| 8 | `router.post('/download-zip')` is commented out while `api.js:263` still posts to it, so multi-file ZIP download 404s. | `fs.routes.js:16` |
| 9 | `server.js` registers the `/api` 404 catch-all **twice** (lines 41-43 and 46-48). Harmless today — the first one terminates the chain, so the second is dead code — but it is duplication that will mislead the next reader. | `server.js:40-48` |
| 10 | `files.js` single-file downloads use `window.open(..., '_blank')`, which bypasses the hidden-iframe download pattern used everywhere else and is exposed to popup blocking. | `files.js:895`, `files.js:1251` |
| 11 | (cosmetic) A stray newline splits the JSDoc of `getTopDownloads` mid-word: it reads `"When a \n etain predicate"` instead of `"When a retain predicate"`. Inside a comment, so it is syntactically harmless — but it means the file has been through a lossy round-trip at least once. | `src/services/MetadataService.js:178-179` |