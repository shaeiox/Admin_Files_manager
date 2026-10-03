# Phase 6 — Shared Frontend Contract

Normative for all P6 agents. Read before writing any code.

## Why this file exists

Three agents edit the frontend concurrently. This contract fixes every seam they
could otherwise disagree on. **Do not change anything in here** — if a seam looks
wrong, report it instead.

## File ownership (no two agents touch the same file)

| Agent | Owns |
|---|---|
| A | `public/assets/js/app.js`, `test/frontend/app.test.js` |
| B | `public/assets/js/dashboard.js`, `public/index.html`, `test/frontend/dashboard.test.js` |
| C | `public/files.html`, `public/uploads.html`, `public/settings.html` |

## The API contract (frozen — do not renegotiate)

`GET /api/dashboard/summary` → **bare object**, no envelope:

```js
{
  stats: [ { key, label, icon, value, unit?, totalGb?, trendAvailable: false } ],
  storage: { treeBytes: Number, usedBytes: Number|null, totalBytes: Number|null,
             volumeAvailable: Boolean, truncated: Boolean },
  storageBreakdown: [ { key, label, bytes: Number, valueGb: Number, color: '#hex',
                        percentage: Number } ],
  activities: [ { type, action, target, folder?, time: Number } ],
  topFiles: [ { path, downloads: Number, max: Number } ],
  health: [ { name, value, unit, icon } ]
}
```

`GET /api/dashboard/health` → **bare array** of the same metric shape.

`window.API.get('/dashboard/summary')` — `api.js` prepends `/api`. It returns the
parsed body verbatim; there is **no `.data` to unwrap**.

## Seam 1 — Sidebar storage (Agent A implements; B and C only empty the markup)

Element IDs are identical on all four pages and MUST NOT be renamed:
`.storage-pct`, `.storage-fill`, `.storage-meta`.

`updateStorageUI(storage)` receives `summary.storage` directly.

```
volumeAvailable !== true, OR usedBytes === null, OR totalBytes === null:
    .storage-pct   -> an explicit unavailable marker (e.g. "—")
    .storage-fill  -> width 0% and a distinguishable unavailable style
    .storage-meta  -> text naming it unavailable, e.g. "Volume usage unavailable"

otherwise:
    pct = usedBytes / totalBytes * 100
    .storage-pct   -> pct.toFixed(1) + '%'
    .storage-fill  -> width pct + '%'
    .storage-meta  -> Format.bytes(usedBytes, 0) + ' of ' + Format.bytes(totalBytes, 0) + ' used'
```

**Forbidden:** rendering `0.0%`, `0 B of 0 B`, or any figure at all when the value
is unavailable. A zero reads as a real measurement.

## Seam 2 — Sidebar identity (Agent A implements; B and C only empty the markup)

Element IDs, unchanged: `.user-avatar`, `.user-name`, `.user-role`.

**There is no user API and no authentication in this application** (explicitly out
of scope). `/user/profile` does not exist and never will. So there is no person to
display. Showing initials or a name would be fabrication.

`updateUserUI(health)` receives the `/api/health` response:

```
health && health.env:
    .user-avatar -> '' (initials imply a person who does not exist)
    .user-name  -> health.env
    .user-role  -> 'Self-hosted'
otherwise:
    .user-avatar -> ''
    .user-name  -> 'Unknown'
    .user-role  -> 'Environment unavailable'
```

`'Self-hosted'` is a true statement about this application (see `AGENTS.md`).
`'Unknown'` is an honest absence. Neither invents a fact.

## Seam 3 — Data source for the sidebar

`loadGlobalData()` currently calls `/user/profile` and `/storage/quota`. **Neither
exists**, so both fallbacks always fire. Replace with:

- `window.API.get('/health')` → `updateUserUI(...)`
- `window.API.get('/dashboard/summary')` → `updateStorageUI(res.json.storage)`

**Known cost, accepted deliberately:** the summary endpoint performs a bounded
recursive tree walk, so every page load now pays for it just to fill the sidebar.
This is a consequence of the frozen contract (volume capacity is only available
from the summary endpoint). It is bounded at 100k entries / 2s. Flagged to the
user; do NOT "optimise" it by inventing a second endpoint.

## Seam 4 — Exported helpers (Agent A adds; Agent B consumes)

Add to the existing `window.AFM` export object:

```js
updateStorageUI,   // storage  -> sidebar volume card
updateUserUI,      // health   -> sidebar identity
```

Agent B may call `window.AFM.updateStorageUI` / `updateUserUI` but MUST NOT
re-implement them. Agent B must not modify `app.js`.

## Seam 5 — Historical affordances (Agent B removes; Agent C empties)

The application retains **no history**. There is no time series, no snapshot
store, no logs. Therefore these MUST be removed, never faked:

- the traffic chart (`#trafficChart`, `#chartLegend` in index.html; render code at
  `dashboard.js:159-217`)
- sparklines (`dashboard.js:116-119,136`)
- trend percentages (`dashboard.js:111-127`) — the API sends `trendAvailable: false`
  and **no** `trend` field, so `s.trend > 0` is always false
- the 30-day / 14-day period copy (index.html:321, :341)
- the non-functional tablist (index.html:323-327)
- `Live` badges

`stats[].value` is a raw integer >= 1. Format it for display; never re-derive it.

## Seam 6 — Storage donut units

`storageBreakdown[].valueGb` is **gigabytes**. The renderer appends a literal
`" GB"` after `Format.compact(...)` and performs **no** byte conversion — so
consume `valueGb` directly and append the suffix. Do **not** multiply by 1e9 and
do not use `bytes` for the label (keep `bytes` only for reconciliation maths).

`storageBreakdown[].color` is a CSS colour **value** (`#8b5cf6`). Apply it as
`style="background:<color>"` or `stroke="<color>"`. Never write it into a class
attribute.

## Seam 7 — Escaping

`window.AFM.escapeHtml` exists (`app.js:739`) and is currently used **zero** times
on the Dashboard. Every string derived from the filesystem or metadata store must
pass through it before HTML insertion. This includes activity `action`, `target`,
`folder`, and top-file paths. Metadata accepts free-form values.

## Seam 8 — Panel states

Each panel renders exactly one of: `loading`, `success`, `empty`, `unavailable`,
`partial`, `error`. Reuse the existing `.skeleton` and `.empty-state` primitives
already in the stylesheet. `unavailable` is visually distinct from a `0` reading.

## Seam 9 — Polling

Adopt the existing self-terminating interval pattern from
`public/assets/js/uploads.js:203-208` plus the existing `visibilityState` guard at
`dashboard.js:76`. On failure, stop polling and show the error state. Do not start
a timer after a swallowed rejection. One failure produces at most one toast.

Poll `GET /dashboard/health` only. The summary is fetched on load and on explicit
refresh (`#refreshDashboard`), never on the timer — the summary performs the tree
walk.

## Non-negotiables

- No fabricated values anywhere, including in comments or placeholder text.
- No `fetch(` outside `window.API`.
- No new dependency, no build step, no framework.
- Plain ES2020 in IIFEs attached to `window`; `<script>` order matters.
- Do not modify `public/assets/js/api.js` (Agent A/B/C all).
- Do not modify anything under `src/` or `server.js` (out of scope for P6).
- Do not modify the OpenSpec artifacts.
- Report contradictions instead of silently resolving them.
