---
module: Storage Services
slug: storage-services
purpose: Sandboxed filesystem access, path containment, uploads, previews, and shared validation/error utilities for the API.
roots:
  - src/services/
  - src/utils/
language: javascript
complexity: medium
loc: 1615
files:
  - src/services/FileSystemService.js
  - src/services/PathService.js
  - src/services/UploadService.js
  - src/services/PreviewService.js
  - src/utils/validators.js
  - src/utils/fileTypes.js
  - src/utils/concurrency.js
  - src/utils/AppError.js
analyzed-at: 2026-10-14T05:05:10Z
source-commit: e2698aedbe42c3c2c0cc24c38e3ef2b45c1843ae
---

<!-- c2d:s1 -->
### Architecture
A service layer of static-class singletons (`FileSystemService`, `PathService`, `UploadService`, `PreviewService`) plus plain-function utility modules. It sits at the bottom of the `routes -> controllers -> services -> fs` flow: controllers call these services, and these services are the only code that touches `fs`/`fs/promises` for the storage tree.

`PathService` is the containment boundary every other service routes through. It converts client paths (POSIX strings rooted at `/`) to absolute OS paths under `config.storageRoot` and back. `resolveSecurePath` is a lexical guard (separator-boundary prefix check); `resolveSecureRealPath` additionally canonicalises with `fs.realpath` so an in-root symlink/junction pointing outside the root is refused. `toClientPath` is the inverse and collapses any out-of-root path to `/`.

`FileSystemService` owns CRUD (stat, readdir, mkdir, rename, move, copy, remove) and the Dashboard aggregates (`getTreeStats`, `getVolumeStats`, `computeCapacity`, `getHealthMetrics`, `retainExisting`). `UploadService` wraps Multer `diskStorage` with a staging-file scheme (dot-prefixed `.upload-<hex>.part`) and commits staged bytes to their final name after the whole multipart body has been parsed. `PreviewService` produces bounded WebP thumbnails only if `sharp` happens to be installed (it is not), otherwise refusing.

Utilities: `AppError` (Error + `statusCode`) is thrown from every layer and serialised by the global error handler elsewhere; `validators.js` holds name/path validation and the settings-document validator; `fileTypes.js` is the single server-side extension-to-category classifier; `concurrency.js` provides a bounded-parallel map.

Control enters via static method calls from controllers (and `UploadService.middleware` as Express middleware in a route) and exits as returned plain objects with client paths, or as thrown `AppError`s.

<!-- c2d:s2 -->
### Public API
```js
PathService.resolveSecurePath(clientPath: string): string
```
Lexical traversal guard; returns absolute path inside storage root or throws AppError 400/403.
```js
PathService.resolveSecureRealPath(clientPath: string): Promise<string>
```
Realpath-canonicalised guard; refuses symlink escapes (403), missing paths (404).
```js
PathService.toClientPath(absolutePath: string): string
```
Absolute OS path to POSIX client path; out-of-root returns `/`.
```js
FileSystemService.getStats(clientPath): Promise<{securePath, isDirectory, size, modified}>
```
Stat via realpath guard; 404/403/500 AppErrors.
```js
FileSystemService.readDirectory(clientPath): Promise<fs.Dirent[]>
```
Reads a directory (withFileTypes); 400 if not a directory.
```js
FileSystemService.exists(securePath): Promise<boolean>
```
Non-throwing `fs.access` check.
```js
FileSystemService.createDirectory(clientPath): Promise<{securePath}>
```
Non-recursive mkdir; 409 on existing, 404 on missing parent.
```js
FileSystemService.rename(oldClientPath, newName): Promise<{oldPath, newPath}>
```
Same-directory rename only; 409 on collision, 403 on escape/root target.
```js
FileSystemService.move(oldClientPath, destinationClientPath): Promise<{oldPath, newPath}>
```
Move into an existing directory, keeping the name; refuses root, self/descendant targets, collisions; same-location is a no-op.
```js
FileSystemService.copy(oldClientPath, destinationClientPath): Promise<{sourcePath, newPath}>
```
Recursive `fs.cp` into an existing directory; refuses self/descendant and collisions.
```js
FileSystemService.remove(clientPath): Promise<{isDirectory}>
```
Permanent delete (`fs.rm` recursive or `unlink`); storage root refused with 403.
```js
FileSystemService.getTreeStats(clientPath = '/', {maxEntries?, maxMs?}): Promise<{files, folders, treeBytes, breakdown, truncated, entriesScanned, skippedLinks, inaccessible, errors}>
```
Bounded iterative tree walk for the Dashboard; skips dotfiles and links.
```js
FileSystemService.computeCapacity(statfsResult): {usedBytes|null, totalBytes|null, volumeAvailable}
```
Pure capacity arithmetic from statfs fields.
```js
FileSystemService.getVolumeStats(clientPath = '/'): Promise<{usedBytes, totalBytes, volumeAvailable, raw?}>
```
`fs.statfs` capacity; degrades to nulls instead of throwing.
```js
FileSystemService.getHealthMetrics(): Array<{name, value, unit, icon}>
```
Synchronous memory-used % and uptime seconds; unsupported metrics omitted.
```js
FileSystemService.retainExisting(entries: {path, downloads}[]): Promise<{path, downloads, max}[]>
```
Filters ranked metadata entries to paths still on disk; recomputes `max`.
```js
UploadService.middleware(req, res, next)
```
Express middleware: concurrent-upload gate (429) then Multer `.single('file')` with staging storage.
```js
UploadService.resolveDirectory(clientDest): Promise<{securePath, clientPath}>
UploadService.commit(stagedPath, destination, name, {overwrite}): Promise<{clientPath, name}>
UploadService.discard(filePath): Promise<void>
UploadService.stagedPathOf(req): string|null
UploadService.toUploadError(err): AppError
```
Destination resolution (400 on missing/non-dir), final placement under overwrite policy (409), never-throwing cleanup, staged-path lookup, Multer error translation (413/400).
```js
UploadService.maxBytes / freeSpaceBytes / maxConcurrentUploads   // static getters
UploadService.STAGING_PREFIX, STAGING_SUFFIX, DEFAULT_MAX_BYTES, DEFAULT_FREE_SPACE_BYTES, DEFAULT_MAX_CONCURRENT_UPLOADS
UploadService._useFreeSpaceReader(fn)   // test seam
```
Limits, constants, and test seam.
```js
PreviewService.capability(): {available, formats, maxSize}
PreviewService.parseSize(raw): number
PreviewService.assertPreviewable(clientPath): void
PreviewService.render(clientPath, size): Promise<{buffer, contentType: 'image/webp'}>
PreviewService._useTransformer(next)   // test seam
PreviewService.PREVIEW_FORMATS, PREVIEW_MAX_SIZE, PREVIEW_DEFAULT_SIZE
```
Thumbnail capability probe, size clamp (16..512), name-only gate (415/404), sharp render (413/422).
```js
validateFileName(name): string
validateClientPath(clientPath): string
validateSettingsPayload(payload): {general:{workspaceName, defaultUploadFolder}, appearance:{defaultView}}
```
Cross-platform name rules; rooted-path shape check (<=4096 chars); exact-whitelist settings document validation.
```js
CATEGORIES, EXTENSION_MAP, classifyFile(fileName): string, emptyBreakdown(): object
```
Shared file-type taxonomy (mirrors client `FileTypes` in `public/assets/js/app.js`).
```js
mapWithConcurrency(items, limit, fn): Promise<R[]>
```
Bounded-parallel async map, results in input order (used by `fs.controller.js` listing enrichment).
```js
class AppError extends Error { constructor(message, statusCode) }
```
Expected-failure error carrying an HTTP status.

<!-- c2d:s3 -->
### Internal Patterns
- **Static-class singletons**: all four services are classes with only static methods, exported directly; mutable module state lives in closures (`transformer` in PreviewService, `inFlightUploads` in UploadService).
- **Error translation**: every fs call is wrapped and errno codes (`ENOENT`, `EACCES`, `EPERM`, `EEXIST`, `EXDEV`) are mapped to `AppError` with static messages, so no absolute path reaches clients.
- **Check-then-act collision checks**: create/rename/move/copy check `exists` before acting (non-atomic); uploads instead use atomic `fs.link` (EEXIST) for no-overwrite and `fs.rename` for overwrite, with exclusive-copy and copy-beside-then-rename fallbacks for no-hardlink and cross-device (EXDEV) cases.
- **Staging uploads**: the Multer `destination` callback validates an early `destination` field and asserts a free-space watermark (`fs.statfs`, 507) before any byte is written; files are staged under random dot-prefixed names (hidden from listings/tree walk) and placed later. Symbol-keyed request properties (`STAGED`, `STAGED_DIR`) track the staging path.
- **In-process concurrency gate**: a module-level counter limits concurrent uploads (default 4, `AFM_UPLOAD_MAX_CONCURRENT`), released once on `res` `close`/`finish` (explicitly marked `ponytail:` as per-process only).
- **Retrying cleanup**: `discard` retries unlink on `EBUSY`/`EPERM` with linear backoff (Windows handle release) and never throws.
- **Bounded traversal**: `getTreeStats` uses an explicit stack of client paths, a labelled `break walk`, entry and time budgets (100k entries / 2000 ms, time checked every 512 entries), an `lstat` re-check against link swaps, and per-entry degradation into an `errors` list with a `truncated` flag.
- **Explicit unavailability**: capacity and health metrics return `null` + `volumeAvailable: false` or omit metrics rather than reporting 0.
- **Optional dependency probing**: `require('sharp')` in try/catch at load; test seams (`_useTransformer`, `_useFreeSpaceReader`) swap implementations.
- **Deviations**: `FileSystemService` requires `path` lazily inside `rename`/`move`/`copy` rather than at module top; `UploadService` requires `config/env` mid-file and reads `UPLOAD_MAX_BYTES` / `AFM_UPLOAD_MAX_CONCURRENT` directly from `process.env` rather than via config. `validators.js` also holds settings-document validation (consumed by the settings store), beyond filesystem names/paths.

<!-- c2d:s4 -->
### Dependencies
1. **Other project modules**
   - Server Bootstrap and Config: `src/config/env` (`config.storageRoot` in PathService; `config.uploadFreeSpaceBytes`, `config.DEFAULT_UPLOAD_FREE_SPACE_BYTES` in UploadService).
   - No file in this module imports the Metadata and Settings Stores; the relationship runs the other way (stores and controllers consume `validators.js`/`AppError`, and `retainExisting` filters data produced by `MetadataService` but receives it as a plain argument).
2. **Third-party packages**
   - `multer` (^2.4.0): multipart parsing with `diskStorage` for uploads.
   - `sharp` (optional, not installed): image decode/resize/WebP encode for previews, loaded only if present.

<!-- c2d:s5 -->
### Complexity
Medium. Most methods are linear guard-then-act sequences with errno-to-AppError mapping; branching is moderate. The security-relevant logic (path containment, symlink canonicalisation, upload staging and atomic placement) is concentrated and well commented but requires careful reading because ordering matters (Multer resolves `destination` at the first file chunk). The single most complex function is `FileSystemService.getTreeStats` (~130 lines): an iterative labelled-loop walk with two budgets, dotfile/link/special-file filtering, an `lstat` race re-check that decrements counters, and per-entry error degradation. `UploadService` is the most intricate file overall, combining a Multer storage engine, a concurrency counter, a free-space gate, and three placement strategies (link, exclusive copy, rename with EXDEV fallback).

<!-- c2d:s6 -->
### Key Files
- `src/services/PathService.js`: the single containment choke point mapping client paths to OS paths and back, including the realpath-based symlink-escape guard.
- `src/services/FileSystemService.js`: all storage CRUD plus the Dashboard tree walk, volume capacity, health metrics, and stale-entry filtering.
- `src/services/UploadService.js`: Multer staging storage, free-space and concurrency gates, and atomic final placement under the overwrite policy.
- `src/services/PreviewService.js`: optional, bounded image thumbnails gated by file name and an installed transformer.
- `src/utils/validators.js`: cross-platform filename rules, client-path shape checks, and the settings-document validator.
- `src/utils/fileTypes.js`: the shared extension taxonomy used by listings and the Dashboard breakdown.
- `src/utils/AppError.js`: the status-carrying error type underpinning the API error contract.

<!-- c2d:s7 -->
### Limitations & Improvements

**1. Mutating operations use only the lexical guard, so an in-root link can carry them outside the root.** Bug or Risk, **high**
`src/services/FileSystemService.js` lines 92-301 (`createDirectory`, `rename`, `move`, `copy`). Reads, downloads, previews and upload destinations go through `PathService.resolveSecureRealPath`, which canonicalises and refuses a symlink/junction escape. The four mutations call only `resolveSecurePath`, which checks the path *string*. If the operator-populated root contains `/link -> /etc` (AGENTS.md notes the root may be populated out of band), then `copy('/link/passwd', '/')` passes the guard and `fs.cp` reads through the link, materialising an outside file inside the root where it can then be downloaded; `move('/docs/a.txt', '/link')` relocates an in-root item outside the root (`fs.stat` on the destination follows the link and reports a directory); `createDirectory('/link/x')` creates a directory outside the root. `remove` is safe only incidentally, because it calls `getStats` (realpath) first.
Fix: canonicalise every existing operand, and canonicalise the parent of every to-be-created target.
```js
// before
const oldSecurePath = PathService.resolveSecurePath(oldClientPath);
const destSecurePath = PathService.resolveSecurePath(destinationClientPath);
// after
const oldSecurePath = await PathService.resolveSecureRealPath(oldClientPath);   // 404/403 handled there
const destSecurePath = await PathService.resolveSecureRealPath(destinationClientPath);
// for createDirectory / rename targets: realpath the parent, then join the validated name
```
Canonicalising the source changes the basis of the self/descendant check, so both sides must come from `resolveSecureRealPath`.

**2. `toClientPath` compares a canonical path against the lexical root.** Bug or Risk, **medium**
`src/services/PathService.js` lines 101-118, consumed at `src/services/UploadService.js` lines 116-143 and 155-157. `resolveSecureRealPath` returns a path proven inside `realpath(root)`, but `toClientPath` checks containment against `path.resolve(root)`. When `STORAGE_ROOT` is itself a symlink or junction (e.g. `/srv/storage -> /mnt/disk1/storage`), or realpath spells the root differently from the configured string, every canonical path fails the prefix test and collapses to `/`. `resolveDirectory('/media')` then returns `clientPath: '/'`, and `commit` builds `finalPath` from that client path, so the upload is placed in the storage root instead of `/media` (the exact misfiling the staging scheme exists to prevent) and the response reports `/name`.
Fix: make `toClientPath` accept either basis, or have `resolveDirectory` return the validated client path instead of re-deriving it.
```js
// after (PathService.toClientPath)
for (const root of [path.resolve(config.storageRoot), realRootCached]) {
    if (absolutePath === root || absolutePath.startsWith(root + path.sep)) {
        const rel = absolutePath.substring(root.length).replace(/\\/g, '/');
        return rel.startsWith('/') ? rel : `/${rel}`;
    }
}
return '/';
```

**3. A failed recursive copy leaves a partial tree behind.** Bug or Risk, **medium**
`src/services/FileSystemService.js` lines 289-300. If `fs.cp` fails part-way (ENOSPC, EACCES on one nested file, a file removed mid-copy), the already-copied portion stays at `newSecurePath` and the method throws 500/403. The user sees a failure, but a half-populated copy now exists, and a retry is refused with 409 because the name is taken. Nothing in the catch cleans up.
Fix: copy to a dot-prefixed staging name in the destination (hidden from listings, like upload staging), then `fs.rename` into place; on failure `fs.rm` the staging tree.
```js
const staging = path.join(destSecurePath, `.copy-${crypto.randomBytes(8).toString('hex')}`);
try {
    await fs.cp(oldSecurePath, staging, { recursive: true, force: false, errorOnExist: true });
    await fs.rename(staging, newSecurePath);
} catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw mapCopyError(error);
}
```

**4. `errorOnExist: true` is a no-op in the copy call.** Improvement Opportunity, **low**
`src/services/FileSystemService.js` line 290. Node honours `errorOnExist` only when `force` is `false`; `force` defaults to `true`, so if a racing writer creates the target between the `exists` check (line 285) and `fs.cp`, existing files are silently overwritten despite the apparent intent. Fix: pass `force: false` alongside `errorOnExist: true` and map `ERR_FS_CP_EEXIST` to 409.

**5. Check-then-act collision checks can still overwrite on a race.** Limitation, **low**
`src/services/FileSystemService.js` lines 96-101, 155-160, 227-232. `rename`/`move` check `exists` and then call `fs.rename`, which on POSIX atomically replaces an existing file target. A concurrent upload or rename landing between the two calls is silently clobbered. Uploads already avoid this with `link()`/EEXIST; for file sources the same `link` + `unlink` pattern would close the gap. Directories cannot be hard-linked, so for them the window remains and should be documented.

**6. `validateFileName` silently trims instead of rejecting surrounding spaces.** Improvement Opportunity, **low**
`src/utils/validators.js` lines 14-52. The project rule is to reject leading/trailing spaces, and the final regex `/^[.\s]|[.\s]$/` looks like it does, but it runs on `trimmed`, so only dots can ever match. `" report.pdf "` is accepted and normalised to `"report.pdf"`. Callers that use the return value (uploads use `file.targetName`) therefore save under a different name than the client sent, without saying so. Either test the untrimmed `name` for the space rule, or document the trimming as intentional normalisation.
```js
// before
if (/^[.\s]|[.\s]$/.test(trimmed)) { ... }
// after
if (/^[.\s]|[.\s]$/.test(name)) { ... }
```

**7. Name length is measured in UTF-16 code units, not filesystem bytes.** Bug or Risk, **low**
`src/utils/validators.js` line 25 (`trimmed.length > 255`). ext4 and most POSIX filesystems cap a name at 255 bytes; a 120-character CJK name (360 UTF-8 bytes) passes validation, then the syscall fails with `ENAMETOOLONG`, which every service maps to a generic 500. Fix: `Buffer.byteLength(trimmed, 'utf8') > 255` returns a clear 400.

**8. A NUL byte in a client path becomes a 500.** Bug or Risk, **low**
`src/utils/validators.js` lines 66-80 and `src/services/PathService.js` lines 17-43. `validateClientPath` checks type, length and the leading `/`, but not control characters. A path containing `\0` passes both validators; Node's fs then throws `ERR_INVALID_ARG_VALUE`, which the services map to a "Failed to ..." 500. It is a malformed client request and should be a 400 at the validator: `if (clientPath.includes('\0')) throw new AppError('Path contains invalid characters.', 400);`.

**9. Upload limits bypass the validated config.** Improvement Opportunity, **low**
`src/services/UploadService.js` lines 52-57 and 103-107. `UPLOAD_MAX_BYTES` is parsed a second time here from `process.env` (`src/config/env.js` already validates it at startup), and `AFM_UPLOAD_MAX_CONCURRENT` is read from `process.env` on every request, although the comment above says both limits are "read from config, which validated their form at startup". Two parsers can drift. Fix: expose `uploadMaxBytes` / `uploadMaxConcurrent` on `config` and read them there, as `uploadFreeSpaceBytes` already is; move `require('../config/env')` to the top of the module.

**10. The free-space watermark checks the staging volume only, and not the file size.** Limitation, **low**
`src/services/UploadService.js` lines 256-271 and 315-327. When the file part arrives before `destination`, bytes are staged in the root and the watermark is checked on the root's volume; if the final destination is a different mount inside the root, `_moveReplacing`/`_moveExclusive` fall back to a copy onto a volume that was never checked. The watermark is also a fixed floor, so a single upload up to `UPLOAD_MAX_BYTES` can still consume space below it. Acceptable as a coarse guard; document it as such, or re-check capacity on the destination volume before the cross-device copy.

**11. Dead error branch in `getTreeStats`.** Improvement Opportunity, **low**
`src/services/FileSystemService.js` lines 388-398. `resolveSecurePath` only ever throws `AppError`, so the `UNRESOLVED` push is unreachable, and `startSecurePath` is assigned but never used. Replace the block with a bare `PathService.resolveSecurePath(startClientPath);`, since the guard call is the only effect needed.

Otherwise the module is carefully built: the errno-to-AppError mapping never leaks absolute paths, upload placement is atomic for the no-overwrite case, and the Dashboard aggregates honour the explicit-unavailability rule throughout.
