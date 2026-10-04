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
  | `DELETE /api/fs/delete` | write | `{ success, data }` — **a `200` may still carry failures**, see below |
  | `POST /api/fs/star` | write | `{ success, data }` |
  | `GET /api/fs/thumbnail/capability` | read | `{ available, formats, maxSize }` — bare object |

  (Verified against every `res.json` call in `fs.controller.js`, `preview.controller.js` and
  `dashboard.controller.js`. `GET /api/fs/download`, `POST /api/fs/download-zip` and a successful
  `GET /api/fs/thumbnail` are streams/bytes and return no JSON body.)
- **Error:** any status with `{ "success": false, "error": "human-readable message" }`. Never a
  `stack`, in any environment: `errorHandler` forwards only `AppError` messages (authored static
  strings, no absolute path) and masks everything else.
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

### Security posture — stated limitations (ADR-003)

These are recorded decisions, not oversights, and none of them is closed:

- **The API is unauthenticated.** Every endpoint below, including upload, rename, delete and star,
  answers any caller. This is the current design for a trusted, single-operator host.
  **Authentication is required before the service is exposed beyond localhost** — a follow-up change.
- **Cross-origin access is open.** `server.js` mounts `cors()` with its defaults, which allow any
  origin. Combined with the absence of authentication, **any web page the operator visits can call
  every mutating endpoint.** Recorded at the same severity as the missing authentication.
- **The content security policy is disabled** (`helmet({ contentSecurityPolicy: false })`).
  Rendering-time escaping in the page modules is therefore the **only** layer between a
  filesystem-derived string and the DOM. Escaping does not fully compensate for the missing policy.
- **`.env` is excluded from version control** (`.gitignore`), closing the ADR-001 open question on
  the environment file; ADR-003 tracks the remainder.

## Endpoints

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/api/health` | ✅ live | Boot/env check — **unchanged by the dashboard work**, byte-identical payload |
| GET | `/api/dashboard/summary` | ✅ live | Read-only aggregate; bare object, `200` with per-capability degradation |
| GET | `/api/dashboard/health` | ✅ live | Read-only aggregate; bare array of runtime metric objects |
| GET | `/api/fs/tree` | ✅ live | Sidebar tree, exactly 2 levels below the root |
| GET | `/api/fs/list` | ✅ live | Directory listing, filter/sort/paginate, `starredOnly` |
| GET | `/api/fs/download` | ✅ live | Stream single file attachment |
| GET | `/api/fs/thumbnail/capability` | ✅ live | Whether previews can be produced (bare object) |
| GET | `/api/fs/thumbnail` | ✅ live | Bounded image preview, or an explicit unavailable marker |
| POST | `/api/fs/folder` | ✅ live | Create directory |
| POST | `/api/fs/upload` | ✅ live | Multipart upload — **field order matters**, see below |
| POST | `/api/fs/star` | ✅ live | Toggle or set the starred flag |
| POST | `/api/fs/download-zip` | ✅ live | Streams a ZIP of up to 500 paths |
| PUT | `/api/fs/rename` | ✅ live | Same-directory rename |
| DELETE | `/api/fs/delete` | ✅ live | Bulk delete (≤500 paths); a `200` can be a partial failure |

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
      { "id": "/media", "name": "media", "path": "/media", "children": [ /* one more level */ ] }
    ]
  }
]
```
- Hidden files (dot-prefixed) are excluded; folders sorted by name.
- **Depth is a constant: exactly two levels below the root** (`fs.controller.js` `scanFolders`
  stops at `depth > 2`; pinned by `test/api/fs.contract.test.js` and mirrored by `TREE_DEPTH` in
  `files.js`). A folder deeper than that is not in the tree; the Files page says so and the
  breadcrumb, which always shows the full path, is the way back up.

### GET /api/fs/list → `200`

**Query** (every parameter is validated; nothing is trusted):

| Param | Accepted | Default | Invalid value |
|---|---|---|---|
| `path` | client path | `/` | `400` |
| `page` | integer ≥ 1 | `1` | treated as `1` |
| `limit` | integer ≥ 1 | `20` | clamped to **`200`** (`LIST_MAX_LIMIT`) |
| `sort` | `name` \| `size` \| `modified` \| `downloads` | `modified` | falls back to `modified` |
| `dir` | `asc` \| `desc` | `desc` | anything but `asc` is `desc` |
| `search` | substring of the **name**, case-insensitive | — | — |
| `type` | `all` \| `folder` \| `image` \| `video` \| `document` \| `audio` \| `archive` \| `code` \| `other` | `all` | matches nothing |
| `starredOnly` | `true` | off | anything but `true` is off |

**Response:**
```json
{
  "items": [
    {
      "id": "/docs/report.pdf",
      "name": "report.pdf",
      "path": "/docs/report.pdf",
      "isFolder": false,
      "type": "document",
      "size": 48213,
      "modified": 1758500000000,
      "downloads": 7,
      "starred": false,
      "status": "internal"
    }
  ],
  "total": 1,
  "counts": { "all": 1, "folder": 0, "image": 0, "video": 0, "document": 1, "audio": 0, "archive": 0, "code": 0, "other": 0 }
}
```
- **Ordering:** folders always precede files, in both directions — a descending size sort ranks
  files only. Within each group the requested key decides; a missing value (`null`) sorts after
  every real value in both directions; ties break by name, then path. Order never depends on
  `readdir` or on completion order.
- **`type`** is the classification the `type` filter compares against (`folder`, or
  `classifyFile(name)`). The UI renders its badge from it, so a badge cannot disagree with its chip.
- **`size` is `null` for a folder.** A directory's `st_size` (4096 on ext4, 0 on NTFS) measures
  nothing about its contents, so the payload is identical on both platforms. `downloads` is also
  `null` for folders.
- **`counts`** covers every entry that survived `search` and `starredOnly` (before the `type`
  filter and pagination). `counts.all` equals the sum of every other key, **including `other`** —
  the unclassified bucket is counted, never dropped.
- `total` is the full matching count after the `type` filter; a `page` past the end returns
  `items: []` with the true `total`.
- An entry that vanishes between the directory read and its `stat` (or cannot be stat-ed) is
  skipped and logged; the request still answers `200`. An unreadable **target** directory fails the
  request (`404`/`403`).
- Per-entry enrichment runs with bounded concurrency (`LIST_ENRICH_CONCURRENCY = 16`); the metadata
  store is read once per listing.
- `status` is a constant placeholder (`"internal"`) kept for compatibility; it measures nothing and
  the Files page does not render it.

### GET /api/fs/download?path=...

- Streams `application/octet-stream` attachment; sets `Content-Disposition` (UTF-8 encoded
  filename), `Content-Length`, `Cache-Control: no-cache`.
- Directories: `400`. Increment download counter on stream open (fire-and-forget).
- Never use it as an image source: the forced octet-stream type is deliberate (it stops untrusted
  content rendering inline). Previews have their own endpoint.

### GET /api/fs/thumbnail/capability → `200`

`{ "available": false, "formats": [], "maxSize": 512 }` — `available` is `true` only when an image
transformer (`sharp`) is installed; this repository installs none, so as shipped previews are
unavailable and the UI says so. `formats` lists the extensions a preview can be produced for.

### GET /api/fs/thumbnail?path=...&size=...

Read-only. `size` is the long edge in pixels, clamped to `16..512` (default `256`); non-integer
`size` is `400`. On success: `200`, `image/webp`, bounded in both dimensions, never the original
bytes. Otherwise an error envelope with the explicit marker header **`X-Preview: unavailable`**:

| Status | When |
|---|---|
| `415` | Not a previewable raster format (decided from the **name**, before any byte is read; SVG is refused) or a folder |
| `404` | No transformer installed |
| `413` | Source larger than 50 MiB |
| `422` | The image could not be decoded |
| `403` | Path traversal |

### POST /api/fs/folder

**Body:** `{ "path": "/media/new-folder" }` → **`201`**
```json
{ "success": true, "data": { "path": "/media/new-folder" } }
```
Errors: `400` invalid name/path · `404` parent missing · `409` name exists.

### POST /api/fs/upload

`multipart/form-data` fields:

| Field | Required | Meaning |
|---|---|---|
| `destination` | no (default `/`) | Existing folder, client path |
| `overwrite` | no | `"true"` replaces an existing **file**; anything else (including absent) refuses with `409` |
| `file` | yes | One file |

**Multipart field order is load-bearing — send `destination` and `overwrite` BEFORE `file`.**
Multer resolves the storage destination when the first file chunk arrives, so a field sent after
the file part has not been parsed at that moment. The server now stages the bytes in a hidden
`.upload-<random>.part` file and decides the final location only after the whole body is parsed, so
a late `destination` is still honoured rather than misfiled — but a destination sent first is
validated **before any byte is written**, and every client in this repository sends it first.

→ **`201`**
```json
{ "success": true, "data": { "name": "a.pdf", "path": "/docs/a.pdf", "size": 48213 } }
```
- `data.path` is the path the file was actually written to, derived from the resolved destination
  — never from a form field re-read after the fact.
- `overwrite` refusal is atomic (`link()`, exclusive-copy fallback); replacement is a single
  `rename()`. A failed or refused upload leaves no staged or partial file and never touches an
  existing file. A name held by a folder is always `409`.
- **Size limit:** `UPLOAD_MAX_BYTES` environment variable (positive integer bytes), default
  **5 GiB**. Larger files fail with `413` naming the limit; the partial file is removed.

Errors (static messages, no absolute path): `400` no file / destination missing / destination not a
folder / invalid filename · `403` destination outside the root · `409` name exists (or held by a
folder) · `413` too large.

Placement semantics are owned by the shared `upload-destination-integrity` capability
(`openspec/changes/files-page-correctness`); they are not restated here.

#### Failure classes and kinds (consumed by the Upload page)

| Class | Status | Kind the page uses | Where the kind comes from |
|---|---|---|---|
| Name collision, `overwrite` not `"true"` | `409` | `conflict` | status |
| File over `UPLOAD_MAX_BYTES` | `413` | `too-large` | status (message names the limit in bytes) |
| Destination outside the root / access refused | `403` | `forbidden` | status |
| Unmapped server failure | `5xx` | `server` | status |
| No response (connection dropped) | — | `network` | transport (`api.js`) |
| Aborted by the operator (pause / cancel) | — | `aborted` | transport (`api.js`); never shown as a failure |
| Rejected name · missing destination · destination not a folder | `400` | *none* | — |

- **The server sends no `kind` field today.** The three `400` classes therefore share one status and
  are not distinguishable by a machine-readable signal; the page shows the server's own authored
  message for them rather than guessing. If the error body later carries a string `kind`, `api.js`
  attaches it to the rejected `Error` (`err.kind`) and it takes precedence over the status. The page
  never derives a kind from the human-readable message.
- `api.js` attaches `err.status` (HTTP status; `0` when no response arrived) to every rejected
  request, and `err.kind` when one is known. Additive: no signature or return shape changed.
- Kinds are short stable tokens (`^[a-z][a-z-]*$`), never reworded with the message.

#### Destination check and creation (Upload page)

The page checks a destination once before sending anything to it, with
`GET /api/fs/list?path=<dest>&limit=1`: `200` usable · `404` does not exist · `400` not a folder ·
`403` access refused · anything else "could not be checked". Items whose destination fails the check
are **held** under one notice — not failed one by one. A missing destination may be created on the
operator's request with the existing `POST /api/fs/folder` (non-recursive: a missing parent is a
`404`). **An upload never creates a directory as a side effect.** If an item later fails with a
`400`/`403`/`404`, the page re-checks its destination once; if it has become unusable the item carries
the destination reason and the remaining items for it are held rather than retried blindly. Write
permission cannot be probed without an upload, so "cannot be written to" is reported from a `403`.

### POST /api/fs/star

**Body:** `{ "path": "/docs/a.pdf", "starred"?: boolean }` → **`200`**
```json
{ "success": true, "data": { "path": "/docs/a.pdf", "starred": true } }
```
Without `starred` each call toggles once; with it the call is idempotent (sets that value).
`data.starred` is the value actually stored. Errors: `400` missing path or non-boolean `starred` ·
`404` path does not exist.

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
- **A `200` (and `success: true`) does NOT mean every path was deleted.** Per-item failure never
  aborts the batch; survivors are listed in `data.failed` with a reason. A client must read
  `data.deleted` / `data.failed` and report a partial failure as one — the count of deleted items is
  `data.deleted.length`, never the number of paths sent.
- Total failure (`deleted` empty, `failed` non-empty) is a non-2xx: the first error with its status.
- Deletion is **permanent** (recursive `fs.rm`): there is no trash and no restore.
- Errors: `400` empty/oversized batch.

### POST /api/fs/download-zip

**Body:** `{ "paths": [...] }` — JSON, or form-urlencoded with `paths` as a JSON string (the SPA
posts a hidden form targeted at a hidden iframe, so the page never navigates). → **`200`**
`application/zip` stream, `Content-Disposition: attachment; filename="download-YYYY-MM-DD.zip"`.
- 1–500 paths; empty or more than 500 is `400`.
- Every path is validated **before** the first byte is streamed: a traversing path is `403` and no
  archive is produced.
- A directory becomes a recursive folder entry under its own name. Download counters increment for
  files only.

## Error Model

| Status | Meaning | Typical triggers |
|---|---|---|
| `400` | Invalid input | Bad name/path, no file, non-directory for readDir/download, empty batch |
| `403` | Forbidden | Path traversal attempt; storage-root deletion; OS permission denial (`EACCES`/`EPERM`) |
| `404` | Not found | Missing item/parent, `ENOENT` |
| `409` | Conflict | Create/rename/upload collides with an existing item |
| `413` | Too large | Upload over `UPLOAD_MAX_BYTES`; preview source over 50 MiB |
| `415` | Unsupported | Preview requested for a non-image or a folder |
| `422` | Unprocessable | Preview could not be decoded |
| `500` | Server error | Unmapped fs error. Message masked to a generic string |

All errors are produced by throwing `AppError(message, statusCode)` and are serialized centrally by
`src/middlewares/errorHandler.js`. Only `AppError` messages reach the client; no `stack` is sent in
any environment.

**Error-disclosure rule (every endpoint, not only upload).**
- No `stack` field in **any** environment — including an unset `NODE_ENV`, which `env.js` still reads
  as `development`. There is no disclosure switch to set, and none should be added (ADR-004).
- An authored `AppError` message is forwarded verbatim (it carries no path, errno or system detail).
- Every other failure gets a fixed generic message **whatever its status**: `"Request could not be
  processed."` below 500, `"An unexpected error occurred on the server."` at 500+. A framework `400`
  (e.g. malformed JSON) does not leak its parser text.
- The server log (`console.error` in `errorHandler`) keeps the full error and its stack, so diagnosis
  is not lost. Pinned by `test/api/upload.surface.test.js` and `test/integration/error-disclosure.test.js`.

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

`{ id, name, path, isFolder, type, size, modified, downloads, starred, status }` — `id === path` is
the client path and doubles as the stable identifier across API and UI. `size` and `downloads` are
`null` for folders.

### Frontend module registry (window globals)

| Global | Source | Responsibility |
|---|---|---|
| `API` | `assets/js/api.js` | `get/post/put/del/upload/downloadFile/downloadMultipleFiles/downloadZip`, `BASE_URL` |
| `Files` | `assets/js/files.js` | Files page; `Files.pure` (renderers/helpers) and `Files._controller` are test seams |
| `Uploads` | `assets/js/uploads.js` | Upload page; `Uploads.pure` (derivations, row renderer) and `Uploads._controller` are test seams |
| `AFM` | `assets/js/app.js` | Shared helpers namespace (`Toast`, `Modal`, `Format`, `Icons`, DOM utils) |
| `Icons` / `icon()` / `hydrateIcons()` | `assets/js/app.js` | Inline SVG system (`<i data-icon="name">`) |
| `Format` | `assets/js/app.js` | bytes/duration/relative-time/number formatters |
| `Toast`, `Modal`, `Dropdown`, `ContextMenu` | `assets/js/app.js` | UI primitives |
| `theme.js` | self-contained | Applies `[data-theme]` before paint; no dependencies. `Theme.refresh()` re-syncs swapped-in toggles |
| `Router` | `assets/js/router.js` | Client-side navigation between the four pages (`navigate`, `resolve`); see below |
| `Dashboard`, `Settings` | `assets/js/dashboard.js`, `assets/js/settings.js` | Page modules |

#### Page-module contract (client-side navigation, ADR-005)

Each page module registers one global (`Dashboard`, `Files`, `Uploads`, `Settings`) exposing:

- `init()` — may run **more than once per document**: on first load, and again every time the page
  is navigated back to. It binds to the freshly swapped markup.
- `destroy()` — runs before the router swaps the page out. It removes every listener the module
  added to `window`/`document`, and stops its timers (Dashboard health polling). Listeners bound to
  elements inside `<main>` need no removal; that markup is discarded.
- `beforeLeave()` *(optional)* — returns `Promise<boolean>`; `false` cancels the navigation
  (Settings asks before dropping unsaved edits, since `beforeunload` does not fire).

Uploads are not cancelled by leaving the Upload page: the queue lives in the module and is shown
again on return. Shared chrome (`app.js`, `sidebar.js`, `theme.js`) is evaluated once per document
and must keep using delegated `document` listeners for controls that live in the swapped topbar.
`AFM.refreshChrome()` re-hydrates icons, the active nav entry and keyboard hints after a swap.

### Known gaps: frontend calls without a backend

Some UI modules call endpoints that **do not exist** on the server yet (they hit the `/api`
404 catch-all):

- `settings.js` → `GET /settings` (requested `silent`). A failure shows an on-page notice that
  settings are not stored; Save and the danger-zone actions then explain that they cannot run
  instead of sending `PUT /settings` / `POST /settings/action`. No error toast for the 404.
- `app.js` → `GET /user/profile`, `GET /storage/quota`

**No Dashboard endpoint is in this list any more.** `GET /dashboard/summary` and
`GET /dashboard/health` are live and documented above; `dashboard.js` and `app.js` are fully
backed. The old `POST /folders` and `POST /shares` calls are gone — folder creation now uses the
**live** `POST /api/fs/folder`, and the share affordance was removed along with the other fabricated
UI rather than left as a dangling call.

`uploads.js` is fully backed: `/fs/upload`, `/fs/list` (destination check), `/fs/tree` (folder
picker), `/fs/folder` (create a missing destination) and `/dashboard/summary` (recent uploads).

`files.js` is fully backed: every call it makes (`/fs/tree`, `/fs/list`, `/fs/folder`,
`/fs/upload`, `/fs/rename`, `/fs/delete`, `/fs/star`, `/fs/download-zip`, `/fs/download`,
`/fs/thumbnail/capability`) resolves.

When implementing a gap, add the route/controller, then move it from this list into the endpoint
table above.

### Upload page: capability claims removed (reversible inventory)

None of these was implemented by the client or the server, so each statement was deleted rather than
left standing. If a capability is built later, its claim can return with it.

| Removed claim | Where it was | Why |
|---|---|---|
| Checksum verification; CDN distribution across "42 edge points-of-presence" | dropzone description | No checksum, no CDN |
| "Auto-encrypted in transit" | dropzone pill | Transport is whatever the deployment provides; nothing here encrypts |
| "Auto-retry on failure" / "automatic retries" | dropzone pill + description | Retry is manual (row or bulk action) |
| "Uploads resume automatically after network interruptions" | queue footer | Transfer is not chunked; an interrupted file restarts from 0 |
| "Uploads resume from the last checkpoint" | tips | Same |
| "save up to 40% space"; "Compress & deduplicate before upload"; `compress`/`dedupe` tags | tips, Optimize Storage preset | Nothing compresses or deduplicates; the `compress` flag was never transmitted |
| "Client-side encryption enabled"; `encrypted`/`verified` tags | Secure Upload preset | Nothing encrypts or verifies |
| "Preserve folder structure" toggle; "the structure is preserved automatically" | options, tips | The server ignores `preservePath`; a folder's files land flat in the destination |
| "Max 5 GB per file" pill and the client-side 5 GB pre-check | dropzone | The limit is `UPLOAD_MAX_BYTES`, configurable and not reported to the client; the server's `413` names the limit in effect |
| "Up to 8 parallel" | dropzone pill | Replaced by the concurrency actually in effect, updated on preset change |
| "Uploaded today" tile | metrics | No source is scoped to a day; now "Completed since this page opened" |
| Seven hardcoded "Recently uploaded" files, "from all admins" | recent strip | Now real `upload` activities from `GET /api/dashboard/summary` (no size: activities carry none); no accounts exist |
| `/releases/2025` destination placeholder | destination strip | The real current destination is rendered from state |

### File-type taxonomy (shared contract)

Classification is by lowercase file extension. **`src/utils/fileTypes.js` is the single
server-side source of truth** — `CATEGORIES`, `EXTENSION_MAP`, `classifyFile(name)`,
`emptyBreakdown()` — and both `FileSystemService.getTreeStats` (the Dashboard donut) and
`fs.controller.js` `getList` (the listing's `type`, filter and `counts`) classify through it.

The server set was reconciled **upward** to the client's `FileTypes` table in `app.js` (the
superset), so every extension the UI badges is reachable by its chip:

| Category | Extensions |
|---|---|
| `image` | jpg jpeg png gif webp svg bmp ico avif heic |
| `video` | mp4 mkv mov avi webm flv wmv m4v |
| `audio` | mp3 wav flac aac ogg m4a wma |
| `document` | pdf doc docx txt rtf odt xls xlsx ppt pptx csv md |
| `archive` | zip rar 7z tar gz bz2 xz iso dmg |
| `code` | js ts jsx tsx html css scss json xml php py java go rs sh yml yaml sql |
| `other` | everything else, including extension-free and dot-prefixed names |

**Guarded by `test/utils/fileTypes.test.js`**, which asserts the server and client extension sets
are equal and that `fs.controller.js` carries no inline extension literal. Editing one side without
the other fails the suite.

Two breakdowns, two contracts — never cross-asserted:
- the **listing** `counts` include `folder` (the chip row presents folders as a browsable type) and
  `other`;
- the **storage** breakdown (`emptyBreakdown()`, Dashboard donut) has no `folder` key — a folder has
  no bytes to attribute.

Effect of the reconciliation on the Dashboard: files previously counted as `other` (e.g. `.ts`,
`.md`, `.bmp`) now fall into their real category, so the donut's slices shift. Recorded in ADR-003.
