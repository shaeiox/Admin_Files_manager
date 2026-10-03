# Phase 7 — Verified Facts (normative for all P7 agents)

Captured from the **running server**, not from the plan. Several things changed during
P5/P6; anything below that contradicts an older document is correct.

## File ownership

| Agent | Owns |
|---|---|
| D | `docs/decisions/ADR-002-dashboard-data-architecture.md` (new), `docs/CONTRACTS.md` |
| E | `docs/REPO_MAP.md`, `docs/architecture.md` |
| F | `docs/backend-checklist.md`, `AGENTS.md` |

## The three storage quantities — do not conflate

| Field | Meaning |
|---|---|
| `treeBytes` | Bytes of regular files under `STORAGE_ROOT`. Directory entry sizes excluded. Links/junctions skipped entirely. Dotfiles excluded. |
| `usedBytes` | Volume usage: `bsize * (blocks - bavail)`. `bavail` is pinned, **not** `bfree` — on Windows they are equal, but ext4 reserves blocks so only `bavail` is cross-platform consistent. |
| `totalBytes` | Volume capacity: `bsize * blocks`. `bsize` is used **exactly as reported**; it is not assumed to be a power of two, so multiplying by 1024 would be wrong. |

When capacity cannot be read: `usedBytes: null`, `totalBytes: null`,
`volumeAvailable: false`, and the response is still **HTTP 200**. `0` is never
substituted for `null`, because 0 reads as a real measurement.

`truncated` is true when the walk hit its budget (100,000 entries / 2,000 ms). **A
truncated total is a wrong total**, so the flag must reach the user.

## Response envelope convention — correct the current documentation

`CONTRACTS.md:9` currently states success responses are `{success, data}`. That is
true for **mutating** endpoints only. The actual convention, verified by reading every
`res.json` call in `fs.controller.js`:

| Endpoint | Kind | Response |
|---|---|---|
| `GET /api/fs/tree` | read | `res.json([rootNode])` — bare array |
| `GET /api/fs/list` | read | `res.json({items, total, counts})` — bare object |
| `POST /api/fs/folder` | write | `{success: true, ...}` |
| `PUT /api/fs/rename` | write | `{success: true, ...}` |
| `DELETE /api/fs/delete` | write | `{success: true, ...}` |
| `POST /api/fs/upload` | write | `{success: true, ...}` |

**Rule: read-only aggregate endpoints return a bare top-level shape; mutating
endpoints return the envelope.** Promote this from the vague parenthetical at
`CONTRACTS.md:10` to a stated rule.

`GET /api/dashboard/summary` and `/health` are read-only aggregates, so they return
bare payloads. This is precedent, not an exception.

## The one genuine envelope exception

Dashboard endpoints return **HTTP 200 with per-capability degradation** when an
individual source fails (volume unreadable, metadata unreadable). No existing
endpoint does this — every other handler either succeeds wholly or fails wholly.
Document it as a deliberate **failure-semantics** departure, separate from the
response-shape rule above.

## Live payload — `GET /api/dashboard/summary`

Top-level keys: `stats`, `storage`, `storageBreakdown`, `activities`, `topFiles`, `health`.
None is ever `null`; all five arrays are always arrays.

```
stats[]:  { key, label, icon, unit, value, trendAvailable:false [, totalGb] }
          unit is 'count' | 'bytes' | 'GB' and is present on EVERY entry.
          value is the TRUE reading and may legitimately be 0.
          There is NO numeric trend field - no history is retained.

storage:  { treeBytes, usedBytes, totalBytes, volumeAvailable, truncated }

storageBreakdown[]: { key, label, bytes, valueGb, color, percentage }
          color is a CSS colour VALUE ('#3b82f6'), never a class name.
          valueGb is GIGABYTES because the renderer appends a literal " GB"
          suffix after Format.compact() with no conversion.
          bytes travels alongside so the breakdown reconciles exactly with treeBytes.
          rows with bytes === 0 are omitted; folders never appear.

topFiles[]:  { path, downloads, max }   max is server-computed over the RETAINED set
activities[]: existing metadata shape + time (finite epoch ms, > 0)

health[]:  { name, value, unit, icon }   NO status / level field.
```

Live sample:
```
stats: files/count/3 · folders/count/1 · treeBytes/bytes/5100 · volume/GB/159 (totalGb 171)
icons: file · folder · database · hardDrive      <- camelCase, matches AFM.Icons keys
health: {"name":"Memory used","value":97.3,"unit":"%","icon":"cpu"}
        {"name":"Uptime","value":3,"unit":"s","icon":"clock"}
```

### Two corrections made during P6 — document these, they are easy to get wrong

1. **`stats[].value` is NOT floored at 1.** An earlier version reported 1 file /
   1 folder / 1 byte for an *empty* tree. That was a fabrication; zero is a real
   reading and is now reported as `0`.
2. **Icon tokens must exist in `AFM.Icons`.** The server sends `file`, `folder`,
   `database`, `hardDrive`, `cpu`, `clock`. There is no `hard-drive` (hyphen) and
   no `memory` key at all.

## `/api/health` vs `/api/dashboard/health` — two different things

| | `/api/health` | `/api/dashboard/health` |
|---|---|---|
| Purpose | Liveness + environment | Dashboard runtime metrics |
| Payload | `{success, message, env}` | bare array of metric objects |
| Consumers | none in the frontend | dashboard.js poll |
| Changed by this work | **NO — byte-identical** | newly added |

## No history is retained

There is **no** time-series store, snapshot table, or history file. `morgan('dev')`
writes to stdout only, so there is no log to parse either. Therefore 14-day traffic
charts, trend percentages, sparklines, and period-over-period comparisons cannot be
produced honestly and their affordances were **removed, not faked**. Every figure the
Dashboard shows is instantaneous.

## Load average is deliberately absent

`os.loadavg()` EXISTS on Windows and returns `[0,0,0]` — a plausible but fabricated
reading with no error to detect. There is no portable capability probe and platform
gating is forbidden, so the metric is **omitted entirely** rather than reported as a
healthy 0%.

## Security boundary

`src/services/PathService.js` containment is
`target === root || target.startsWith(root + path.sep)` using native `path.sep`, in
both `resolveSecurePath` and `toClientPath`, with both sides produced by the same
resolution function. The previous naive `startsWith(rootPath)` allowed
`/../download-secret/x` to escape. Also note: containment is **case-sensitive**, so on
a case-insensitive volume a differently-cased spelling of the root is denied (fails
closed — a false rejection, not a bypass).

## Stale claims you must fix (all verified)

- `docs/REPO_MAP.md:36` references `public/PROJECT_FULL_CODE.md` — **does not exist**.
- `docs/REPO_MAP.md:55` lists `data/` as present — it is created lazily at runtime.
- `docs/architecture.md:765` names `chartData` and `serverHealth`. The real fields
  were `traffic` and `health`; `traffic`, `renderChart` and `renderLegend` are now
  **deleted entirely**. Correcting it is not a rename — it is a removal.
- `docs/backend-checklist.md:41` says "real **Linux** disk space" — the implementation
  is Windows and Linux compatible via `fs.statfs` with no platform gate.
- `docs/backend-checklist.md:42` says "calculate chart **mock data** or read from
  logs" — neither is acceptable and neither was done.
- `docs/backend-checklist.md:3` frames the backend as a bridge to "the Linux File
  System (`/download`)" — the app is cross-platform.
- `AGENTS.md` previously claimed tests did not exist; that is already corrected.

## New files that REPO_MAP must list

- `src/routes/dashboard.routes.js`
- `src/controllers/dashboard.controller.js`
- `src/utils/fileTypes.js` (shared file-type taxonomy, single server-side source)
- `data/.gitkeep`
- `test/services/{MetadataService,FileSystemService.tree,FileSystemService.rename,FileSystemService.volume}.test.js`
- `test/services/PathService.test.js`
- `test/api/dashboard.contract.test.js`
- `test/frontend/{app,dashboard}.test.js`

## Known pre-existing issues — record, do NOT fix in this phase

These are out of scope. List them so they are not mistaken for oversights:
`errorHandler.js:20` ships `err.stack` (absolute OS paths) outside production; CORS is
fully open; there is no authentication; `.env` is git-tracked and contains a
machine-specific `STORAGE_ROOT`; `_write` uses a fixed temp path (concurrent-write
corruption); `renamePath` overwrites download counts; client/server file-type taxonomy
drift persists because `fs.controller.js` still carries its own inline copy of the
taxonomy now living in `src/utils/fileTypes.js`; `router.post('/download-zip')` is
commented out in `fs.routes.js` while `api.js` calls it, so ZIP download 404s.