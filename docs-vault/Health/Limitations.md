---
title: Limitations
type: health
language:
  - javascript
  - bash
status: generated
complexity: medium
dependencies:
  - "[[Server Bootstrap and Config]]"
  - "[[HTTP API Layer]]"
  - "[[Storage Services]]"
  - "[[Metadata and Settings Stores]]"
  - "[[Auth and Access Control]]"
  - "[[Frontend Core]]"
  - "[[Files Page]]"
  - "[[Deployment Scripts]]"
related-notes:
  - "[[Health Summary]]"
  - "[[Code Review]]"
  - "[[Concurrency and Consistency]]"
  - "[[Truthful Reporting and Unavailability]]"
canonical-source: server.js
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - health
---

# Limitations

These are design and architecture constraints. They are not defects in the sense of [[Code Review]]; each one records something the current design cannot do, and what would have to change to lift it. There are 17 in total: 5 medium and 12 low, with no high. Bugs and improvement opportunities are listed in [[Code Review]], and the counts are summarised in [[Health Summary]].

## Medium severity

### Directory checks do not test writability

**Module:** [[Server Bootstrap and Config]]
**Severity:** medium
**File:** `src/config/env.js:184-199`

`directoryProblems` checks `STORAGE_ROOT` and `AFM_DATA_DIR` with `R_OK | X_OK` only. Uploads, folder creation, rename and delete all need a writable storage root. The metadata and settings stores need a writable data directory, because they write a temp file and then rename it. So a read-only directory passes startup validation, which defeats the purpose of the fail-fast boot check.

> [!warning] Impact
> A read-only root or data directory boots cleanly, then fails on every write request instead of refusing to start with a `FATAL CONFIGURATION ERROR`.

> [!tip] Possible Approach
> Add `W_OK` to the access mask for both directories, or add a separate writability check with its own message.

### getList walks every listed folder before paginating

**Module:** [[HTTP API Layer]]
**Severity:** medium
**File:** `src/controllers/fs.controller.js:168-226`

`getList` runs a recursive `FileSystemService.getTreeStats` walk for every candidate folder in the directory. The walk is bounded by the service at 16 in flight. Pagination happens only after every walk has finished. Only `sort=size` actually needs the folder totals.

> [!warning] Impact
> A 20-item page in a directory with hundreds of large subfolders pays for every walk on every request, and that includes search keystrokes. Latency grows with the size of the subtree, not with the size of the page.

> [!tip] Possible Approach
> Compute folder sizes only for `sort=size`, or only for the sliced page, and return `sizeAvailable: false` otherwise. Alternatively, cache tree stats briefly.

### Metadata rename and delete touch only the exact key, not descendants

**Module:** [[Metadata and Settings Stores]]
**Severity:** medium
**File:** `src/services/MetadataService.js:268-313`

`renamePath` and `deletePath` match `clientPath` exactly. The controller calls them for folders too: a directory rename, and a recursive remove. Keys under the folder's old prefix are left alone.

> [!warning] Impact
> When a folder is renamed, stars and download counts for the files inside it are orphaned under the old prefix, so stars disappear from the user's view. When a folder is deleted, its entries linger, and they come back if a folder with the same name is created later. Access policies have the same flaw ([[Code Review]], `policy-path-hooks-exact-match`).

> [!tip] Possible Approach
> Also move or drop keys where `key.startsWith(oldPath + '/')`, rewriting the prefix to `newPath`.

### Download failures are invisible to the user

**Module:** [[Frontend Core]]
**Severity:** medium
**File:** `public/assets/js/api.js:288-400`

`downloadFile`, `downloadMultipleFiles` and `downloadZip` load into hidden iframes, so downloads never navigate the main frame. A 401, 403 (for example a missing CSRF token on the ZIP form), 404 or 500 renders into a 0x0 iframe, and that iframe is removed after 60 s or 15 s. Callers get no promise and no error signal.

> [!warning] Impact
> When a download fails, the UI cannot report it. The operator just sees nothing happen. This conflicts with the project rule against silent failure.

> [!tip] Possible Approach
> Listen for the iframe `load` event. It fires only when the response rendered as a document, which means an error body rather than an attachment. Surface an error on that event, or return a promise that rejects on it.

### systemd write allow-list is hard-coded

**Module:** [[Deployment Scripts]]
**Severity:** medium
**File:** `scripts/systemd/dimension.service:52-54`

The unit sets `ProtectSystem=strict` with `ReadWritePaths=/var/lib/dimension /srv/dimension/storage`, so every other path is read-only for the service. `deploy.sh` accepts any existing absolute `STORAGE_ROOT` or `AFM_DATA_DIR` from the env file. `/api/v1/health` performs no write, so it cannot catch the mismatch.

> [!warning] Impact
> A host configured with different storage or data paths activates as "healthy", then fails every upload and every metadata write at runtime.

> [!tip] Possible Approach
> Have `deploy.sh` check that both paths fall under the unit's `ReadWritePaths` (for example via `systemctl show -p ReadWritePaths`). Alternatively, document the paths as fixed and refuse any others.

## Low severity

### Activity log always records user "system"

**Module:** [[HTTP API Layer]]
**Severity:** low
**File:** `src/controllers/fs.controller.js:252-562`

Every activity entry is hard-coded to `user: 'system'`. This is true even though every request is now authenticated (ADR-009) and `authenticate` attaches `req.user`.

> [!warning] Impact
> The activity trail cannot say which operator renamed, moved or deleted a file.

> [!tip] Possible Approach
> Pass the user's id or display name from `req.user`, and fall back to `'system'` when it is absent.

### Rename and move collision checks are check-then-act

**Module:** [[Storage Services]]
**Severity:** low
**File:** `src/services/FileSystemService.js:155-160`

`rename` and `move` check `exists` and then call `fs.rename`. On POSIX, `fs.rename` atomically replaces an existing file target. The same pattern appears at lines 96-101 and 227-232. Uploads already avoid this race by using `link()` and treating `EEXIST` as a collision.

> [!warning] Impact
> A concurrent upload or rename that lands between the check and the rename is silently overwritten.

> [!tip] Possible Approach
> For file sources, use the same `link` + `unlink` pattern that uploads use. Directories cannot be hard-linked, so for them the window remains and should be documented.

### Free-space watermark checks only the staging volume

**Module:** [[Storage Services]]
**Severity:** low
**File:** `src/services/UploadService.js:256-327`

If the file part arrives before `destination`, the bytes are staged in the root and the watermark is checked on the root's volume. If the final destination is a different mount inside the root, `_moveReplacing` or `_moveExclusive` falls back to copying onto a volume that was never checked. The watermark is also a fixed floor that ignores the size of the incoming file.

> [!warning] Impact
> A single upload of up to `UPLOAD_MAX_BYTES` can still push free space below the watermark. A cross-mount destination is not protected at all.

> [!tip] Possible Approach
> Document the watermark as a coarse guard, or re-check capacity on the destination volume before the cross-device copy.

### getTopDownloads can return fewer than limit entries

**Module:** [[Metadata and Settings Stores]]
**Severity:** low
**File:** `src/services/MetadataService.js:247-252`

The `retain` filter, which drops files that no longer exist, runs after `slice(0, limit)`.

> [!warning] Impact
> If some of the top N files were deleted out of band, the Dashboard shows fewer than N rows even when valid lower-ranked entries exist.

> [!tip] Possible Approach
> Apply `retain` over all candidates, or over a larger window, and slice afterwards.

### Whole-store rewrite and unbounded download map

**Module:** [[Metadata and Settings Stores]]
**Severity:** low
**File:** `src/services/MetadataService.js:115-149`

Every download re-serializes and rewrites the entire store. `downloads` keys are pruned only through `deletePath`, so files removed out of band leave entries forever. No `fsync` is performed before the rename.

> [!warning] Impact
> Write cost grows with history. Durability across a power loss is not guaranteed. Both are acceptable at single-operator scale.

> [!tip] Possible Approach
> Prune periodically against `FileSystemService.retainExisting`, or move to a real embedded store.

### Expired sessions and audit rows are never pruned

**Module:** [[Auth and Access Control]]
**Severity:** low
**File:** `src/db/repositories/SessionRepository.js:7-39`

Nothing deletes expired or revoked `sessions` rows. `AuditLogRepository.prune` exists, but nothing in `src/` or `server.js` calls it.

> [!warning] Impact
> Both tables grow without bound for the lifetime of the database.

> [!tip] Possible Approach
> At boot, and on a long interval, delete sessions where `expires_at < now` or `revoked_at IS NOT NULL`, and call `AuditLogRepository.prune(retentionMs)`.

### CSRF token exists only after /auth/me resolves, with no retry

**Module:** [[Frontend Core]]
**Severity:** low
**File:** `public/assets/js/api.js:55-113`

The client learns its CSRF token from the bootstrap `/auth/me` read. Some mutating requests go out without a valid token:
- requests issued before that read completes;
- requests issued after the token rotates, for example after a re-login in another tab.

These fail with 403. There is no refresh-and-retry, and `downloadZip` silently omits the field.

> [!warning] Impact
> Early or post-rotation mutations fail with a 403 that the operator has to resolve with a manual reload.

> [!tip] Possible Approach
> Expose a `ready` promise from the `/auth/me` read and have `request()` await it for non-GET methods. On a CSRF 403, refetch `/auth/me` once and retry.

### Page HTML cache never invalidates

**Module:** [[Frontend Core]]
**Severity:** low
**File:** `public/assets/js/router.js:35-70`

The router caches fetched page HTML for the lifetime of the document. Only failed fetches are evicted.

> [!warning] Impact
> A tab left open across a deploy keeps swapping in pre-deploy markup against the scripts it already loaded, until a full reload.

> [!tip] Possible Approach
> This is acceptable for an admin tool. If it matters across releases, key the cache on a version marker such as `apiVersion` from `/health`, or expire entries after N minutes.

### Fonts load from Google at runtime

**Module:** [[Frontend Core]]
**Severity:** low
**File:** `public/assets/css/tokens.css:6-7`

The self-hosted tool loads its fonts with a render-blocking `@import` from `fonts.googleapis.com`.

> [!warning] Impact
> Offline or air-gapped installs wait on a failing request before falling back to system fonts. Every page view exposes the operator's IP address to a third party.

> [!tip] Possible Approach
> Vendor the two font families under `public/assets/fonts/` with `@font-face` and `font-display: swap`.

### Upload queue is per drop, not global

**Module:** [[Files Page]]
**Severity:** low
**File:** `public/assets/js/files.js:1967-1999`

Each `runUploads` call pushes its jobs into the shared `uploads` array and runs its own `for … await` loop. A second drop or picker selection during a batch therefore starts a second, concurrent loop. This contradicts the "Upload jobs one at a time" doc comment.

> [!warning] Impact
> Overlapping batches upload concurrently and compete for bandwidth.

> [!tip] Possible Approach
> Keep a single module-level drain loop guarded by a `draining` flag. `runUploads` enqueues its jobs and starts the drain only when it is not already running, then reports each batch when its last job settles.

### Column-hiding breakpoints duplicated between JS and CSS

**Module:** [[Files Page]]
**Severity:** low
**File:** `public/assets/js/files.js:83-87`

`COLUMN_BREAKPOINTS` drives the table's minimum-width calculation. It must match the media queries in `public/assets/css/files.css` (lines 1245-1265) that hide the type, downloads, modified and size columns. The two agree today, but nothing ties them together.

> [!warning] Impact
> Editing one side without the other silently mis-sizes the file table.

> [!tip] Possible Approach
> Drive the column hiding from the JS-injected width sheet as well, since it already emits `@media` rules, and remove the `.col-*` `display:none` rules from `files.css`. That leaves one source of truth.

### Deployment runs synchronously inside the push

**Module:** [[Deployment Scripts]]
**Severity:** low
**File:** `scripts/git-hooks/post-receive:28-42`

The hook ships and deploys before it returns. The pushing client therefore waits through all of these:
- the deploy lock, up to `LOCK_WAIT` (default 1800 s);
- `npm ci`;
- the full test suite;
- the health wait.

> [!warning] Impact
> Pushes are slow. If the push session is interrupted, the SSH stream can be cut mid-deploy.

> [!tip] Possible Approach
> This is acceptable for a single pusher, as documented. If pushes become frequent, detach the trigger: run it in the background with output going to a log.
