---
module: Metadata and Settings Stores
slug: metadata-and-settings-stores
purpose: JSON-file persistence for download counts, stars, activity log, and operator settings, with cached atomic writes.
roots:
  - src/services/
language: javascript
complexity: low
loc: 465
files:
  - src/services/MetadataService.js
  - src/services/SettingsService.js
analyzed-at: 2026-10-14T05:05:10Z
source-commit: e2698aedbe42c3c2c0cc24c38e3ef2b45c1843ae
---

<!-- c2d:s1 -->
### Architecture
Two sibling service classes, each exported as a module-level singleton instance, implementing a tiny document-store pattern over a single JSON file under the data directory (`resolveDataDir()`, i.e. `AFM_DATA_DIR`, default `<cwd>/data`):

- `MetadataService` owns `metadata.json` with shape `{ downloads: {<clientPath>: number}, starred: string[], activities: object[] }`.
- `SettingsService` owns `settings.json` with shape `{ general: { workspaceName, defaultUploadFolder }, appearance: { defaultView } }` (null = unset).

Both share the same internal skeleton: `_read()` (cache hit or read+parse; ENOENT triggers `_init()`), `_init()` (mkdir parent, write defaults, log first run), `_write()` (temp file then rename, then update cache). Control enters from controllers (`fs.controller.js`, `dashboard.controller.js` for metadata; `settings.controller.js` for settings) via public async methods and exits as plain objects/arrays or thrown `AppError`s. Neither service touches any filesystem object other than its own store file; neither imports `PathService` — keys/values are client paths only.

<!-- c2d:s2 -->
### Public API
`MetadataService` (singleton instance, `module.exports = new MetadataService()`):
```js
dbPath: string            // mutable; tests repoint it at a temp file
async getFileMeta(clientPath) -> { downloads: number, starred: boolean }
```
Per-file download count (0 if absent) and starred flag.
```js
async incrementDownload(clientPath) -> void
```
Increments the download counter and persists.
```js
async toggleStar(clientPath) -> boolean
```
Toggles membership in `starred`; returns the new starred state.
```js
async addActivity(activity: { type, user, action, target, folder }) -> void
```
Prepends the activity with `time: Date.now()`; caps the log at 50 entries.
```js
async getActivities(limit = 10) -> object[]
```
Recent activities, dropping entries with missing/non-finite/non-positive `time`.
```js
async getTopDownloads(limit = 5, options?: { retain?: (entries) => entries }) -> Array<{ path, downloads, max }>
```
Top-N by count (ties by path), excluding non-positive/corrupt counts; optional `retain` filter; `max` computed over retained set.
```js
async renamePath(oldPath, newPath) -> void
```
Moves the download-count key and starred entry to the new path; writes only if changed.
```js
async deletePath(clientPath) -> void
```
Removes download count and starred entry; writes only if changed.

`SettingsService` (singleton instance, `module.exports = new SettingsService()`):
```js
dbPath: string; cache: object | null   // tests repoint both
async getAll() -> object
```
Full settings document (served bare by the controller).
```js
async replace(payload: object) -> object
```
Validates via `validateSettingsPayload` (strict full replace; throws `AppError` 400), persists atomically, returns the normalized document.

<!-- c2d:s3 -->
### Internal Patterns
- **Singleton instances with in-memory cache:** `this.cache` populated on first read and on every write; never invalidated otherwise, so the process is assumed to be the sole writer.
- **Atomic write:** `writeFile(`${dbPath}.tmp`)` then `rename` over the store; cache updated only after the rename succeeds.
- **ENOENT bootstrap:** a missing file (or directory) triggers `_init()`, which creates the directory *before* writing so a second ENOENT cannot escape as a raw `Error`; first run is logged with `console.log('[store] First run: ...')`.
- **Static-message error wrapping:** non-ENOENT read failures and init failures become `AppError(..., 500)` with the original error on `.cause`; no path/errno leaks to clients. Cache is left untouched on init failure so a later read retries.
- **Fail-wholly on corruption:** both stores throw 500 on unparseable JSON rather than substituting defaults.
- **Shape normalization (metadata only):** `normalizeStore()` coerces the parsed JSON into the documented shape; `downloads` is built with `Object.create(null)` so client-path keys like `__proto__` stay inert, non-finite counts are dropped, non-string stars and non-object activities are filtered. `SettingsService` stores the parsed JSON raw on read and relies on validation at write time instead.
- **Read-side sanitization:** `getActivities` and `getTopDownloads` filter fabricated/corrupt values (zero or invalid timestamps and counts) instead of rendering them.
- **Read-modify-write without locking:** every mutator does `_read()` → mutate the cached object in place → `_write()`; concurrent calls share the same cached object and serialize only through the event loop. Callers treat metadata writes as fire-and-forget.
- **Defaults factory:** `defaultSettings()` returns a fresh object on each bootstrap so the cache never aliases a module constant.

<!-- c2d:s4 -->
### Dependencies
1. **Other project modules**
   - Server Bootstrap and Config — `resolveDataDir` from `src/config/dataDir.js` (store directory).
   - Storage Services — `AppError` from `src/utils/AppError.js` (error contract); `validateSettingsPayload` from `src/utils/validators.js` (settings document validation).
2. **Third-party packages** — none (only Node built-ins `fs/promises` and `path`).

<!-- c2d:s5 -->
### Complexity
Low. Two small files (~465 lines including extensive doc comments) with shallow, linear methods and only a handful of branches each; there are no functions near 100 lines and nesting rarely exceeds two levels. The most complex piece is `MetadataService.getTopDownloads`, which chains filter/map/sort with a deterministic tie-break, applies an optional caller-supplied `retain` predicate, and recomputes `max` over the surviving set. The subtlest behaviour is the shared mutable cache combined with unlocked read-modify-write and the temp-file-then-rename write, which uses a single fixed `.tmp` name per store.

<!-- c2d:s6 -->
### Key Files
- `src/services/MetadataService.js` — singleton JSON store for download counters, starred paths, and the capped activity log, with normalization and dashboard ranking queries.
- `src/services/SettingsService.js` — singleton JSON store for the operator settings document with validated full-replace writes.
- `src/utils/validators.js` — supplies `validateSettingsPayload`, which defines what a valid settings document is (external, imported).
- `src/config/dataDir.js` — supplies `resolveDataDir`, which determines where both store files live (external, imported).

<!-- c2d:s7 -->
### Limitations & Improvements

#### Bug or Risk — Concurrent writes share one fixed temp-file name (medium)
`src/services/MetadataService.js` 115-127, `src/services/SettingsService.js` 105-117.
`_write` always stages to `${dbPath}.tmp`. Mutators are unlocked read-modify-write, and metadata writes are fire-and-forget, so two writes routinely overlap (e.g. a download's `incrementDownload` and an `addActivity`, or two concurrent requests; also two concurrent first reads both entering `_init`). Overlapping writers both open the same temp file with truncation: if the later `JSON.stringify` is shorter (a delete/unstar), trailing bytes of the longer one survive and the renamed store is invalid JSON — which this module deliberately treats as a fatal 500 on the next cold read. The second `rename` can also fail with `ENOENT` (the first already moved the temp file) or, on Windows, `EPERM`/`EBUSY`. Fix: serialize writes per store through a promise chain (and/or use a unique temp name).
```js
// before
async _write(data) { const tempPath = `${this.dbPath}.tmp`; ... }
// after
_write(data) {
    this._queue = (this._queue || Promise.resolve()).catch(() => {}).then(async () => {
        const tempPath = `${this.dbPath}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
        await fs.rename(tempPath, this.dbPath);
        this.cache = data;
    });
    return this._queue;
}
```

#### Bug or Risk — Cache is mutated in place before the write succeeds (medium)
`src/services/MetadataService.js` 145-167, 174-191, 268-313.
Every metadata mutator edits `this.cache` directly and then calls `_write`. If the write fails (ENOSPC, EACCES, the rename race above), the in-memory state already reflects the change while disk does not; the next successful write silently persists it, and `toggleStar` reports a 500 even though the star *has* flipped in memory (a retry flips it back). The `_write` step "update cache only after rename" is therefore moot for metadata. Fix: mutate a copy (`structuredClone(db)`) and let `_write` install it, or reset `this.cache = null` in a catch so the next read reloads from disk.

#### Bug or Risk — Write failures escape as raw errors (low)
`src/services/MetadataService.js` 115-127, `src/services/SettingsService.js` 105-117, 140-144.
`_read` and `_init` wrap failures in `AppError(…, 500)` with static messages, but `_write` does not, so `toggleStar` and `SettingsService.replace` propagate a raw `Error` (with path/errno in its message) — inconsistent with the module's own static-message discipline and AGENTS.md rule 5. Fix: wrap in the mutators' write path.
```js
try { await this._write(validated); }
catch (error) { const e = new AppError('Settings store could not be written', 500); e.cause = error; throw e; }
```

#### Limitation — Rename/delete only touch the exact key, not descendants (medium)
`src/services/MetadataService.js` 268-313.
`renamePath` and `deletePath` match `clientPath` exactly, but the controller calls them for folders too (`FileSystemService.rename` of a directory, recursive `FileSystemService.remove`). Download counts and stars for files under a renamed folder are orphaned at the old prefix (stars lost from the user's view), and under a deleted folder they linger; if a folder with the old name is recreated, stale counts and stars reappear on the new files. Fix: also move/drop keys where `key.startsWith(oldPath + '/')`.
```js
for (const key of Object.keys(db.downloads)) {
    if (key === oldPath || key.startsWith(oldPath + '/')) {
        db.downloads[newPath + key.slice(oldPath.length)] = db.downloads[key];
        delete db.downloads[key]; hasChanges = true;
    }
}
```

#### Bug or Risk — Settings store is cached raw without shape checks (low)
`src/services/SettingsService.js` 80-99.
Unlike metadata (`normalizeStore`), settings are cached exactly as parsed. A hand-edited but valid-JSON document of the wrong shape (`null`, `[]`, missing `general`) is served to clients as-is; `null` in particular leaves `this.cache` falsy, so every read re-hits disk and `getAll()` returns `null`. Fix: run the parsed document through `validateSettingsPayload` on read (treat failure as the existing fail-wholly 500), or at least reject non-object roots.

#### Limitation — `getTopDownloads` can return fewer than `limit` entries (low)
`src/services/MetadataService.js` 247-252.
The `retain` filter (drop files that no longer exist) runs *after* `slice(0, limit)`. If some of the top-N were deleted out of band, fewer than N rows are returned even though valid lower-ranked entries exist. Fix: apply `retain` over all candidates (or over a larger window) and slice afterwards.

#### Limitation — Whole-document rewrite and unbounded download map (low)
`src/services/MetadataService.js` 115-127, 145-149.
Every download rewrites and re-serializes the entire store, and `downloads` keys are never pruned except via `deletePath` — files removed out of band leave entries forever, so write cost grows with history. Acceptable at current scale; a periodic prune against `FileSystemService.retainExisting` or a real embedded store is the upgrade path. No `fsync` is performed before `rename`, so durability across power loss is not guaranteed.

#### Improvement Opportunity — Duplicated store skeleton (low)
`src/services/MetadataService.js` 72-127, `src/services/SettingsService.js` 63-117.
`_init`/`_read`/`_write` are copied nearly verbatim between the two services (only messages, defaults and the normalizer differ). Any fix above (write queue, write wrapping) must be applied twice. Extract a small `JsonStore` helper taking `{ fileName, defaults, normalize, label }`.
