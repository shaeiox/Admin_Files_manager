# CONTRACTS.md — API & Data Contracts

> The stable surface between frontend and backend. Changing anything here is a breaking change —
> update this file in the same commit.

## Conventions

- **Base URL:** `/api`
- **Success:** `200/201` with `{ "success": true, "data": ... }` (list/tree endpoints additionally
  return their own top-level shape — see endpoint table).
- **Error:** any status with `{ "success": false, "error": "human-readable message" }`
  (+ `stack` string in development only, from `errorHandler`).
- **Client paths** are POSIX-style strings rooted at `/` relative to `STORAGE_ROOT`
  (e.g. `/media/videos/clip.mp4`). The server rejects anything that escapes the root (`403`).
- **Timestamps:** file `modified` is a **millisecond epoch number**; activity `time` is ms epoch.

## Endpoints

| Method | Path | Status | Notes |
|---|---|---|---|
| GET | `/api/health` | ✅ live | Boot/env check |
| GET | `/api/fs/tree` | ✅ live | Sidebar tree, 2 levels deep |
| GET | `/api/fs/list` | ✅ live | Directory listing, filter/sort/paginate |
| GET | `/api/fs/download` | ✅ live | Stream single file attachment |
| POST | `/api/fs/folder` | ✅ live | Create directory |
| POST | `/api/fs/upload` | ✅ live | Multipart upload (Multer → disk) |
| PUT | `/api/fs/rename` | ✅ live | Same-directory rename |
| DELETE | `/api/fs/delete` | ✅ live | Bulk delete (≤500 paths) |
| POST | `/api/fs/download-zip` | ✅ live | Stream ZIP of paths (route currently **commented out** in `fs.routes.js` — re-enable before frontend use) |

### GET /api/health

```json
{ "success": true, "message": "Dimension API is running", "env": "development" }
```

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

### POST /api/fs/download-zip

**Body:** `{ "paths": [...] }` — JSON or form-urlencoded (`paths` = JSON string; the SPA posts a
urlencoded form targeted at a hidden iframe). ≤500 paths. → **`200`** `application/zip` stream,
filename `download-YYYY-MM-DD.zip`. Increments download counters (files only). Directory entries
become recursive ZIP folders.

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

Some UI modules call endpoints that **do not exist** on the server yet (they currently hit the
`/api` 404 catch-all and surface an error toast):

- `dashboard.js` → `GET /dashboard/summary`, `GET /dashboard/health`, `POST /folders`, `POST /shares`
- `settings.js` → `GET|PUT /settings`, `POST /settings/action`
- `app.js` → `GET /user/profile`, `GET /storage/quota`

When implementing one, add the route/controller, then move it from this list into the endpoint
table above.

### File-type taxonomy (shared contract)

Both server (`fs.controller.js` `_extKey`) and client (`app.js` `FileTypes`) classify by extension.
Server map (client map is a superset):
`image` jpg/jpeg/png/gif/webp/svg · `video` mp4/mkv/mov/avi/webm · `document` pdf/doc/docx/txt/xlsx/csv ·
`audio` mp3/wav/flac/ogg · `archive` zip/rar/7z/tar/gz · `code` js/html/css/json/py/php ·
`other` (fallback). When extending one side, mirror it on the other.
