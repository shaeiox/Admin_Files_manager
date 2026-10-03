# CONTRACTS.md — API & Data Contracts

> The stable surface between frontend and backend. Changing anything here is a breaking change —
> update this file in the same commit.

## Conventions

- **Base URL:** `/api`
- **Success shape — a rule, not an exception.** Read-only **aggregate** endpoints return a
  **bare top-level shape** (the payload *is* the body, no wrapper). **Mutating** endpoints return
  the `{ "success": true, "data": ... }` envelope. `GET /api/dashboard/summary` and
  `GET /api/dashboard/health` are read-only aggregates, so they follow the bare precedent like
  `tree` and `list` do — they are **not** exceptions to it:

  | Endpoint | Kind | Body |
  |---|---|---|
  | `GET /api/fs/tree` | read | `[rootNode]` — bare array |
  | `GET /api/fs/list` | read | `{ items, total, counts }` — bare object |
  | `GET /api/dashboard/summary` | read | bare object |
  | `GET /api/dashboard/health` | read | bare array |
  | `POST /api/fs/folder` | write | `{ success, data }` |
  | `POST /api/fs/upload` | write | `{ success, data }` |
  | `PUT /api/fs/rename` | write | `{ success, data }` |
  | `DELETE /api/fs/delete` | write | `{ success, data }` |

  (Verified against every `res.json` call in `fs.controller.js` and `dashboard.controller.js`.
  `GET /api/fs/download` and `POST /api/fs/download-zip` are streams and return no JSON body.)
- **Error:** any status with `{ "success": false, "error": "human-readable message" }`
  (+ `stack` string in development only, from `errorHandler`).
- **Dashboard failure semantics (separate from the shape rule):** the dashboard endpoints answer
  **`200` with per-capability degradation** for the *filesystem* and *volume* capabilities — an
  unreadable volume or an unreadable subtree removes only its own contribution instead of failing
  the response. This is the **one genuine departure** from the project's all-or-nothing error
  model: every other endpoint either succeeds wholly or fails wholly with a non-2xx status. The
  **metadata** capability is the exception and still fails wholly with `500`. See *Failure
  semantics* below.
- **Client paths** are POSIX-style strings rooted at `/` relative to `STORAGE_ROOT`
  (e.g. `/media/videos/clip.mp4`). The server rejects anything that escapes the root (`403`).
- **Timestamps:** file `modified` is a **millisecond epoch number**; activity `time` is ms epoch.

## Endpoints

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/api/health` | ✅ live | Boot/env check — **unchanged by the dashboard work**, byte-identical payload |
| GET | `/api/dashboard/summary` | ✅ live | Read-only aggregate; bare object, `200` with per-capability degradation |
| GET | `/api/dashboard/health` | ✅ live | Read-only aggregate; bare array of runtime metric objects |
| GET | `/api/fs/tree` | ✅ live | Sidebar tree, 2 levels deep |
| GET | `/api/fs/list` | ✅ live | Directory listing, filter/sort/paginate |
| GET | `/api/fs/download` | ✅ live | Stream single file attachment |
| POST | `/api/fs/folder` | ✅ live | Create directory |
| POST | `/api/fs/upload` | ✅ live | Multipart upload (Multer → disk) |
| PUT | `/api/fs/rename` | ✅ live | Same-directory rename |
| DELETE | `/api/fs/delete` | ✅ live | Bulk delete (≤500 paths) |
| POST | `/api/fs/download-zip` | ❌ **404** | Controller exists and is exported, but the route is **commented out** at `fs.routes.js:16`. `API.downloadZip()` still posts to it, so **ZIP download 404s in the UI today.** Re-enable the route to fix — see ADR-001 follow-ups. |

### GET /api/health

Liveness + environment probe. **Unchanged by the dashboard work — byte-identical payload**, and it
keeps the envelope because it is not an aggregate. Returns the `env` string that the sidebar
identity block renders; it is **not** a source of runtime metrics.

```json
{ "success": true, "message": "Dimension API is running", "env": "development" }
```

### GET /api/dashboard/summary → `200`

Read-only aggregate over the managed tree, its volume, and the metadata store. **Bare object**, no
envelope (see *Conventions → Success shape*). **Every figure is instantaneous** — see *No history is
retained* below. Filesystem and volume sources degrade to a `200` with reduced content; a corrupt
metadata store fails the whole request with `500` (see *Failure semantics*).

Top-level keys, all always present and **none ever `null`**: `stats`, `storage`,
`storageBreakdown`, `activities`, `topFiles`, `health`. The five arrays are **always arrays**, never
`null` and never absent.

| Field | Type | Unit | Nullable | Meaning |
|---|---|---|---|---|
| `stats` | `array` | — | no (always `[]` or populated) | Headline tiles. Order: `files`, `folders`, `treeBytes`, then `volume` **only if capacity was readable**. |
| `stats[].key` | `string` | — | no | Stable identifier: `files` \| `folders` \| `treeBytes` \| `volume`. |
| `stats[].label` | `string` | — | no | Display label, e.g. `Total files`. |
| `stats[].icon` | `string` | — | no | Icon token; must exist in `AFM.Icons`: `file`, `folder`, `database`, `hardDrive`. (Camel-case — there is no `hard-drive` and no `memory` key.) |
| `stats[].unit` | `string` | — | no | **Present on every entry:** `count` \| `bytes` \| `GB`. |
| `stats[].value` | `number` | per `unit` | no | **The true reading. May legitimately be `0`** — zero is a measurement, never a placeholder, and stats are not floored at 1. Integer. |
| `stats[].trendAvailable` | `boolean` | — | no | **Always `false`.** No history is retained, so there is no trend. |
| `stats[].totalGb` | `number` | GB | **yes — omitted unless `key === 'volume'`** | Rounded volume capacity, companion to the `volume` value. |
| `storage` | `object` | — | no | See the `storage` sub-table. |
| `storage.treeBytes` | `number` | bytes | no | Sum of **regular files** under `STORAGE_ROOT`. Directory entry sizes, dotfiles, links/junctions, and folders excluded. |
| `storage.usedBytes` | `number` | bytes | **`null` when capacity is unreadable** | Volume usage `= bsize * (blocks - bavail)`. `bavail` is pinned, not `bfree` (ext4 reserves blocks). |
| `storage.totalBytes` | `number` | bytes | **`null` when capacity is unreadable** | Volume capacity `= bsize * blocks`. `bsize` is used exactly as reported — never assumed to be a power of two. |
| `storage.volumeAvailable` | `boolean` | — | no | The server's own declaration that it could read the volume. **`false` ⇒ `usedBytes` and `totalBytes` are `null`.** `null` is never substituted with `0`, because `0` reads as a real measurement. |
| `storage.truncated` | `boolean` | — | no | `true` when the walk hit its budget (100,000 entries / 2,000 ms). **A truncated total is a wrong total**, so it must be surfaced to the user, not styled away. |
| `storageBreakdown` | `array` | — | no (always `[]` or populated) | Donut rows, by taxonomy category. **Rows with `bytes === 0` are omitted**, and **folders never appear** (a folder has no bytes to attribute). |
| `storageBreakdown[].key` | `string` | — | no | Taxonomy category: `image` \| `video` \| `document` \| `audio` \| `archive` \| `code` \| `other`. Never `folder`. |
| `storageBreakdown[].label` | `string` | — | no | Capitalised category name. |
| `storageBreakdown[].bytes` | `number` | **bytes** | no | Raw bytes for this category. Travels alongside `valueGb` so the breakdown **reconciles exactly with `storage.treeBytes`**, and so zero-rows are filtered on raw bytes rather than a rounded GB figure. |
| `storageBreakdown[].valueGb` | `number` | **gigabytes (10⁹)** | no | **The unit exception:** delivered in GB (6 dp) because the renderer appends a literal `" GB"` suffix after `Format.compact()` and performs no conversion. Every other byte quantity in this contract is in bytes. |
| `storageBreakdown[].color` | `string` | — | no | A CSS colour **value** (e.g. `#3b82f6`), **never a class name**. |
| `storageBreakdown[].percentage` | `number` | percent (1 dp) | no | Share of the retained rows' total. `0` when the total is `0`. |
| `activities` | `array` | — | no (always `[]`) | Newest-first activity feed (≤ 8). Existing `data/metadata.json` shape **plus** a valid `time` (finite epoch ms, `> 0`). Entries with a missing, non-numeric, non-finite, or non-positive `time` are dropped. |
| `topFiles` | `array` | — | no (always `[]`) | Most-downloaded files, ≤ 5, sorted descending by `downloads` (ties break by path). Entries whose file no longer exists are **dropped before** `max` is computed. |
| `topFiles[].path` | `string` | — | no | **Client path** (POSIX, rooted at `/`). Never an absolute OS path. |
| `topFiles[].downloads` | `number` | count | no | Counter from metadata; only files with `count > 0` are eligible. |
| `topFiles[].max` | `number` | count | no | Server-computed maximum over the **retained** set (not the global peak), so a renderer can compute bar proportions without re-deriving it. |
| `health` | `array` | — | no (always `[]`) | Same rows as `GET /api/dashboard/health`. See below. |

**Live sample** (captured from the running server):

```json
{
  "stats": [
    { "key": "files",     "label": "Total files",   "icon": "file",      "unit": "count", "value": 3,    "trendAvailable": false },
    { "key": "folders",   "label": "Total folders", "icon": "folder",    "unit": "count", "value": 1,    "trendAvailable": false },
    { "key": "treeBytes", "label": "Storage used",  "icon": "database",  "unit": "bytes", "value": 5100, "trendAvailable": false },
    { "key": "volume",    "label": "Volume used",   "icon": "hardDrive", "unit": "GB",    "value": 159,  "trendAvailable": false, "totalGb": 171 }
  ],
  "storage": { "treeBytes": 5100, "usedBytes": 106000000000, "totalBytes": 171000000000, "volumeAvailable": true, "truncated": false },
  "storageBreakdown": [
    { "key": "document", "label": "Document", "bytes": 3400, "valueGb": 0.0000034, "color": "#ef4444", "percentage": 66.7 }
  ],
  "activities": [ { "type": "upload", "user": "system", "action": "uploaded", "target": "a.txt", "folder": "/", "time": 1758500000000 } ],
  "topFiles": [ { "path": "/a.txt", "downloads": 7, "max": 7 } ],
  "health": [
    { "name": "Memory used", "value": 97.3, "unit": "%", "icon": "cpu" },
    { "name": "Uptime", "value": 3, "unit": "s", "icon": "clock" }
  ]
}
```

- The three storage quantities are **distinct and not collapsible**: `treeBytes` (what the managed
  tree weighs) ≠ `usedBytes` (what the volume has consumed) ≠ `totalBytes` (volume capacity). A
  small tree on a nearly-full volume legitimately reports `treeBytes ≈ 0.01%` of `totalBytes`.
- The response never contains an absolute OS path, a drive letter, or a backslash separator.
- **The sidebar volume card calls this endpoint** (`app.js`) because capacity is only available
  here — `/api/dashboard/health` has no configured-root context. It therefore pays for the bounded
  tree walk on every page load; this cost is accepted rather than worked around with a second
  endpoint. See ADR-002.

### GET /api/dashboard/health → `200`

Read-only aggregate of **dashboard runtime metrics**. **Bare array**, no envelope.

| Field | Type | Unit | Nullable | Meaning |
|---|---|---|---|---|
| `health[]` | `array` | — | no (always `[]` or populated) | Top-level body **is** the array. |
| `health[].name` | `string` | — | no | Display name, e.g. `Memory used`, `Uptime`. |
| `health[].value` | `number` | per `unit` | no | The true reading. |
| `health[].unit` | `string` | — | no | `%` for memory; `s` for uptime. **Uptime is a duration, not a ratio.** |
| `health[].icon` | `string` | — | no | Icon token that must exist in `AFM.Icons`: `cpu`, `clock`. |

```json
[
  { "name": "Memory used", "value": 97.3, "unit": "%", "icon": "cpu" },
  { "name": "Uptime", "value": 3, "unit": "s", "icon": "clock" }
]
```

- **No `status` / `level` field.** There is no repository or platform source defining memory or
  uptime thresholds, so asserting `healthy`/`warning`/`critical` would be inventing a judgement.
- **No load average, on any platform.** `os.loadavg()` *exists* on Windows and returns
  `[0, 0, 0]` — a plausible-looking fabricated reading with no error to detect. There is no
  portable capability probe and platform gating is forbidden, so the metric is **omitted entirely**
  rather than reported as a healthy `0%`.
- **Only metrics backed by real platform data.** Anything unsupported or failed is omitted, never
  zero-filled: an absent row means "unavailable", and a present row means a measurement.
- Row set is deterministic for a given process state, so repeated polls must not flicker.
- Capacity-dependent metrics are deliberately absent here — the Dashboard renders disk usage from
  the **summary** payload instead.

### `/api/health` vs `/api/dashboard/health` — two different endpoints

| | `GET /api/health` | `GET /api/dashboard/health` |
|---|---|---|
| Purpose | Liveness + environment | Dashboard runtime metrics |
| Shape | `{success, message, env}` — **envelope** | **bare array** of metric objects |
| Consumers | sidebar identity block (`app.js`) | `dashboard.js` poll |
| Changes in the dashboard work | **NO — byte-identical** | newly added |

`/api/health` was **not** repurposed. Anything that needs the environment string (`env`) uses
`/api/health`; anything that needs a metric uses `/api/dashboard/health`.

### Failure semantics (a departure from the Error Model)

The two dashboard endpoints answer **`200` with per-capability degradation**. A failed source
removes only its own contribution:

| Source that fails | Effect on the response |
|---|---|
| Volume unreadable / degenerate `statfs` | `storage.usedBytes: null`, `storage.totalBytes: null`, `storage.volumeAvailable: false`, and the `volume` entry is **omitted from `stats[]`** — still `200` |
| A single unreadable subtree | Recorded as a diagnostic by the walk; the rest of the walk completes — still `200` |
| Walk budget exhausted (100k entries / 2 s) | Partial totals with `storage.truncated: true` — still `200` |
| **Metadata store corrupt or unreadable** | **⚠️ `500`, not a degraded `200`.** `MetadataService._read` throws `AppError('Metadata store could not be read', 500)` and `getSummary` awaits its four sources via `Promise.all`, so the rejection takes the whole response down. *Degradation is therefore **not** uniform across capabilities — do not extend the pattern without deciding the behaviour per capability.* |

**Consequence for consumers: a `200` does not by itself mean every field is populated.** Check
`volumeAvailable` and `truncated` before rendering.

**`0` is never substituted for "unavailable."** `usedBytes`/`totalBytes` are `number | null`, and
`null` reads as an absence while `0` reads as a real measurement. Conversely, `0` **is** a valid
reading for `treeBytes` or `stats[].value`: an empty tree reports 0 files, 0 folders, 0 bytes.

This is the **one genuine departure** in the API, and it is recorded separately from the
response-shape rule because it concerns *failure* semantics, not *shape*: every other endpoint
either succeeds wholly or fails wholly with a non-2xx status through `AppError` → `errorHandler`.
Degradation applies to the **filesystem and volume** capabilities only — metadata still fails
wholly. See ADR-002.

### No history is retained — every Dashboard figure is instantaneous

There is **no** time-series store, snapshot table, or history file anywhere in the project, and
`morgan('dev')` writes to stdout only, so there is no log to parse either. Consequently:

- 14-day traffic charts, trend percentages, sparklines, and period-over-period comparisons **cannot
  be produced honestly**, so their affordances were **removed rather than faked** (`traffic`,
  `renderChart`, and `renderLegend` are deleted; there is no `chartData` or `serverHealth` field).
- There is no `trend`, `trendPercent`, or `delta` field on any `stats[]` entry.
  `stats[].trendAvailable` is **always `false`** and always will be, until a retention decision is
  made deliberately.
- **Every number on the Dashboard is a live measurement at request time.** Refreshing produces new
  readings, never deltas.

### GET /api/fs/tree → `200`

```json
[
  {
    "id": "/",
    "name": "All Files",
    "path": "/",
    "icon": "hardDrive",
    "children": [
      { "id": "/media", "name": "media", "path": "/media", "children": [ /* depth ≤ 2 */ ] }
    ]
  }
]
```
Hidden files (dot-prefixed) are excluded; folders sorted by name.

### GET /api/fs/list

**Query:** `path` (default `/`), `page` (default 1), `limit` (default 20), `sort`
(`modified|name|size` — any item field; default `modified`), `dir` (`asc|desc`, default `desc`),
`search` (substring, case-insensitive), `type` (`all|folder|image|video|document|audio|archive|code`).

**Response `200`:**
```json
{
  "items": [
    {
      "id": "/docs/report.pdf",
      "name": "report.pdf",
      "path": "/docs/report.pdf",
      "isFolder": false,
      "size": 48213,
      "modified": 1758500000000,
      "downloads": 7,
      "starred": false,
      "status": "internal"
    }
  ],
  "total": 1,
  "counts": { "all": 1, "folder": 0, "image": 0, "video": 0, "document": 1, "audio": 0, "archive": 0, "code": 0 }
}
```
- Folders sort before files; `downloads` is `null` for folders; `counts` reflects the whole
  directory *before* pagination (after search/type filter).
- `_extKey` is internal-only and stripped before the response.

### GET /api/fs/download?path=...

- Streams `application/octet-stream` attachment; sets `Content-Disposition` (UTF-8 encoded
  filename), `Content-Length`, `Cache-Control: no-cache`.
- Directories: `400`. Increment download counter on stream open (fire-and-forget).

### POST /api/fs/folder

**Body:** `{ "path": "/media/new-folder" }` → **`201`**
```json
{ "success": true, "data": { "path": "/media/new-folder" } }
```
Errors: `400` invalid name/path · `404` parent missing · `409` name exists.

### POST /api/fs/upload

`multipart/form-data`: file field **`file`** (single), plus field `destination` (client path,
default `/`). → **`201`**
```json
{ "success": true, "data": { "name": "a.pdf", "path": "/docs/a.pdf", "size": 48213 } }
```
Errors: `400` no file / invalid destination / invalid filename. Filenames are sanitized via
`validateFileName`; destination must already exist (`404`-class failure otherwise). Overwrites are
currently **allowed silently** (known gap — see ADR-001).

### PUT /api/fs/rename

**Body:** `{ "oldPath": "/docs/old.txt", "newName": "new.txt" }` (name only — no path) → **`200`**
```json
{ "success": true, "data": { "oldPath": "/docs/old.txt", "newPath": "/docs/new.txt" } }
```
Errors: `404` source missing · `409` target exists · `400` invalid name. Metadata keys migrate
best-effort after disk rename.

### DELETE /api/fs/delete

**Body:** `{ "paths": ["/a.txt", "/b folder"] }` (≤500) → **`200`**
```json
{
  "success": true,
  "data": {
    "deleted": ["/a.txt"],
    "failed": [ { "path": "/b folder", "error": "Item not found: /b folder", "statusCode": 404 } ]
  }
}
```
- Per-item failure never aborts the batch; total failure (`deleted` empty, `failed` non-empty)
  surfaces the first error with its status. Deletion is **permanent** (recursive `fs.rm`).
- Errors: `400` empty/oversized batch.

### POST /api/fs/download-zip — ⚠️ currently `404`

**Not reachable as shipped.** The route line is **commented out** at `fs.routes.js:16`:

```js
// router.post('/download-zip', fsController.downloadZip);
```

`downloadZip` is implemented in `fs.controller.js` and exported, and `API.downloadZip()` in
`public/assets/js/api.js` builds a hidden form posting to `${BASE_URL}/fs/download-zip`
(`api.js:263`) into a hidden iframe — so **every ZIP download in the UI currently 404s** at the
`/api` catch-all. Uncommenting the route line is the whole fix.

The contract below is the behaviour **once re-enabled**:

**Body:** `{ "paths": [...] }` — JSON or form-urlencoded (`paths` = JSON string; the SPA posts a
urlencoded form targeted at a hidden iframe). ≤500 paths. → **`200`** `application/zip` stream,
filename `download-YYYY-MM-DD.zip`. Increments download counters (files only). Directory entries
become recursive ZIP folders. Tracked as a follow-up in ADR-001 and ADR-002.

## Error Model

| Status | Meaning | Typical triggers |
|---|---|---|
| `400` | Invalid input | Bad name/path, no file, non-directory for readDir/download, empty batch |
| `403` | Forbidden | Path traversal attempt; storage-root deletion; OS permission denial (`EACCES`/`EPERM`) |
| `404` | Not found | Missing item/parent, `ENOENT` |
| `409` | Conflict | Create/rename collides with existing item |
| `500` | Server error | Unmapped fs error. Message sanitized to a generic string in production |

All errors are produced by throwing `AppError(message, statusCode)` and are serialized centrally by
`src/middlewares/errorHandler.js`. In production, `500` messages are masked; `stack` is dev-only.

**Exception:** the two Dashboard endpoints do **not** follow this model. They answer `200` with
per-capability degradation, so a partial failure is expressed in the payload
(`volumeAvailable: false`, `truncated: true`, empty arrays) rather than in a status code. See
*Failure semantics* under `GET /api/dashboard/summary`.

## Data Schemas

### `data/metadata.json` (MetadataService)

```json
{
  "downloads": { "/docs/a.pdf": 3 },
  "starred": ["/docs/a.pdf"],
  "activities": [
    { "type": "upload|folder|edit|delete", "user": "system", "action": "uploaded", "target": "a.pdf", "folder": "/docs", "time": 1758500000000 }
  ]
}
```
- Written atomically (temp file + rename); cached in memory (singleton instance).
- `activities` capped at 50 entries. Keys in `downloads` / entries in `starred` are client paths;
  they are migrated on rename and removed on delete (best-effort).

### File item (API + frontend)

`{ id, name, path, isFolder, size, modified, downloads, starred, status }` — `id === path` is the
client path and doubles as the stable identifier across API and UI.

### Frontend module registry (window globals)

| Global | Source | Responsibility |
|---|---|---|
| `API` | `assets/js/api.js` | `get/post/put/del/upload/downloadFile/downloadZip`, `BASE_URL` |
| `AFM` | `assets/js/app.js` | Shared helpers namespace (`Toast`, `Modal`, `Format`, `Icons`, DOM utils) |
| `Icons` / `icon()` / `hydrateIcons()` | `assets/js/app.js` | Inline SVG system (`<i data-icon="name">`) |
| `Format` | `assets/js/app.js` | bytes/duration/relative-time/number formatters |
| `Toast`, `Modal`, `Dropdown`, `ContextMenu` | `assets/js/app.js` | UI primitives |
| `theme.js` | self-contained | Applies `[data-theme]` before paint; no dependencies |

### Known gaps: frontend calls without a backend

Some UI modules call endpoints that **do not exist** on the server yet (they hit the `/api`
404 catch-all and surface an error toast):

- `settings.js` → `GET|PUT /settings`, `POST /settings/action`
- `app.js` → `GET /user/profile`, `GET /storage/quota`

**No Dashboard endpoint is in this list any more.** `GET /dashboard/summary` and
`GET /dashboard/health` are live and documented above; `dashboard.js` and `app.js` are fully
backed. The old `POST /folders` and `POST /shares` calls are gone — folder creation now uses the
**live** `POST /api/fs/folder`, and the share affordance was removed along with the other fabricated
UI rather than left as a dangling call.

Still broken, but not a missing backend — see the endpoint table for the route status:

- `files.js` → `API.downloadZip` posts to `POST /api/fs/download-zip`, whose route is commented
  out at `fs.routes.js:16`, so **ZIP download 404s**.

When implementing a gap, add the route/controller, then move it from this list into the endpoint
table above.

### File-type taxonomy (shared contract)

Classification is by lowercase file extension. **`src/utils/fileTypes.js` is the single
server-side source of truth** — it exports `CATEGORIES`, `EXTENSION_MAP`, `classifyFile(name)`, and
`emptyBreakdown()`, and it is what both `FileSystemService.getTreeStats` (the Dashboard donut) and
`fs.controller.js` (`_extKey`, the listing filter) are meant to classify through, so a file cannot
count as `document` in the donut and `other` in the file list.

Server map (client map in `app.js` `FileTypes` is a superset):
`image` jpg/jpeg/png/gif/webp/svg · `video` mp4/mkv/mov/avi/webm · `document` pdf/doc/docx/txt/xlsx/csv ·
`audio` mp3/wav/flac/ogg · `archive` zip/rar/7z/tar/gz · `code` js/html/css/json/py/php ·
`other` (fallback). When extending one side, mirror it on the other.

**Known drift (deliberately not collapsed yet):** `fs.controller.js` still carries its own **inline
copy** of the map at lines ~97-103 instead of importing `src/utils/fileTypes.js`, and the client
map in `app.js` is still hand-mirrored. Collapsing the inline copy is a ~12-line removal that was
left alone because that file is outside the dashboard phase's ownership — it is tracked as an
escalation, not silently resolved. Until then the two server-side copies can drift, and **nothing
fails when they do**. (`src/utils/fileTypes.js` documents a `test/services/fileTypes.test.js` that
pins the shared module; that file does not currently exist, so no test guards either copy. Adding
it is a tracked follow-up.)

Folders are not in the taxonomy: `classifyFile` is only meaningful for regular files, and a folder
has no bytes to attribute, so folders never appear in the Dashboard breakdown.
