# Proposal

## Why

The Files page is the only page in this application that mutates data, and it is the only page with **no automated test coverage**. A full investigation of `public/files.html`, `public/assets/js/files.js`, `public/assets/css/files.css` and the server contract beneath them found **four reproduced defects that lose or misfile user data**, plus a broad layer of controls that report outcomes the system did not produce.

The four reproduced defects, each verified against a live server on Node v24.15.0 / win32 x64:

**1. Every upload from a subfolder is silently misfiled, and the API reports a path the file is not at.**
`files.js:111-114` appends the `file` part **before** the `destination` part. Multer's `diskStorage.destination` callback (`fs.controller.js:332-342`) reads `req.body.destination` at the moment the first file chunk arrives — at which point only the `file` field has been parsed, so the value is `undefined` and the destination resolves to `/` (the storage root). But `uploadFile` (`fs.controller.js:370-371`) computes the response path **after** multer completes, when the field *is* populated. Reproduced:

```
order=file,destination  -> HTTP 201 {"path":"/sub/asFilesJS.txt"}
   on disk: asFilesJS.txt              <-- storage ROOT, not /sub
order=destination,file  -> HTTP 201 {"path":"/sub/destinationFirst.txt"}
   on disk: sub/destinationFirst.txt  <-- correct
```

The response asserts a location that is not where the file went. The UI then refreshes the folder the user is *viewing*, sees nothing appear, and the operator concludes the upload failed.

**2. "Download as ZIP" does not work at all.** `fs.routes.js:16` is commented out. Verified: `POST /api/fs/download-zip` → `404 {"success":false,"error":"API endpoint not found"}`. `files.js:1169` calls `API.downloadZip(paths)` after toasting *"Preparing ZIP download…"* and then calls `clearSelection()` — a silent no-op that also destroys the selection.

**3. The bulk-download menu a user actually sees is the dead one.** `#bulkDownload` has two `click` listeners (`files.js:1148` working, `files.js:1230` a stub reading *"Backend ZIP streaming will be implemented in Phase 6/7"*). `stopPropagation()` does not suppress same-element listeners, so both fire, and `ContextMenu.show` reuses one singleton node via `menu.innerHTML` — the second overwrites the first. The working "Download as individual files" option, which uses the popup-safe `API.downloadMultipleFiles`, is unreachable; the reachable one uses `window.open`, which `AGENTS.md` rule 9 explicitly prohibits.

**4. Partial delete returns `success: true` and the UI reports total success.** Verified: `HTTP 200 {"success":true,"data":{"deleted":["/ok.png"],"failed":[{...,"statusCode":404}]}}`. `files.js:1070` toasts `` `${count} items deleted` `` from `state.selected.size` and never reads `data.failed`, though the controller treats partial failure as an expected outcome (`fs.controller.js:242`).

Beyond these, the page **fabricates state** in ways `AGENTS.md` names as red lines. A backend outage renders as *"No files found in this directory."* with an "Upload files" call to action (`files.js:80-85`, `564-580`), because the empty state cannot distinguish *empty* from *broken*. `loadTree`'s catch (`files.js:46-50`) substitutes a synthetic "All Files" tree that looks entirely valid. The 34 extensions the client badges with a coloured type chip (`app.js:277-284`, 43 extensions) are classified by the server filter as `other` (`fileTypes.js:31-38`, 28 extensions) — verified on a 13-file directory: `counts.all = 13`, the seven chips sum to `3`, and ten visible files belong to no chip at all. `app.ts`, `main.go`, `db.sql`, `cfg.yaml` each render a "Code · TS/GO/SQL/YAML" badge and then vanish when the Code chip is clicked. `#bulkShare` copies a hardcoded `https://dl.dimension.io/s/batch-xyz` and toasts success; `#bulkStar` toasts "Items starred" and does nothing, while `MetadataService.toggleStar` (`MetadataService.js:107-119`) sits fully implemented and unrouted.

It also renders nothing truthfully about capability. A missing feature is presented identically to a working one: `POST`-shaped dead buttons in the drawer footer and the ⋮ overflow menu, five sidebar entries (Downloads, Starred, Shared, Recent, Trash) that all load the identical unfiltered listing, and a topbar search field carrying a **⌘K** badge that nothing ever reads.

Finally the page is **structurally inaccessible**. Rows and cards carry click handlers with no `tabindex`, `role` or `keydown`, so no file can be opened or selected by keyboard. The drawer keeps `aria-hidden="true"` (`files.html:332`) while visible, has no dialog role, no focus trap, and no backdrop. Breadcrumb segments and tree items are `<span>` and `<div>`.

`npm test` is additionally **red**: 287 tests, 279 pass, 8 fail — all eight from `temp/upload-probe.test.js`, a leftover debug harness that `node --test` auto-discovers, so the suite exits `1`.

## What Changes

- **Correct upload field ordering** in `files.js` so `destination` and `overwrite` precede `file`, and stop deriving the response path from a field multer may not have parsed. The reported path must be the path the file was actually written to.
- **Restore the ZIP route** by uncommenting `fs.routes.js:16` — the single read-only streaming endpoint. Do **not** remount the filesystem router.
- **Remove the duplicate `#bulkDownload` listener** and route every single-file download through `API.downloadFile`.
- **Reconcile the file-type taxonomy** so `fs.controller.js` calls `classifyFile()` from the existing `src/utils/fileTypes.js`, the server and client extension sets agree, and an `other` bucket is counted and surfaced.
- **Report partial delete failure** to the operator instead of a blanket success toast.
- **Distinguish error from empty** in both `loadFiles` and `loadTree`, with an explicit retry, and stop synthesising a fallback tree.
- **Delete every control that cannot work**: fake sidebar navigation, the decorative topbar search, four fabricated bulk actions, dead drawer-footer and overflow-menu buttons, and the uncalled `handleTreeMutation`.
- **Make navigation state single-owner**: one `navigateTo()` for path, page, filter, search, breadcrumb and tree highlight; persisted tree expansion; a cancellable search debounce; correct depth handling.
- **Preserve selection across reloads**, clamp pagination, and remove the optimistic arithmetic that is immediately overwritten.
- **Meet WCAG 2.1 AA** for the list, grid, tree, breadcrumb, drawer, filter chips and sort headers.
- **Fix the layout and interaction defects**: table clipping, absent thumbnails, undifferentiated empty/loading states, inline styles, sticky-header collision, misleading "Select All", and an under-communicated irreversible delete.
- **Escape all filesystem-derived strings** before markup insertion.
- **Add `node:test` coverage for `files.js`** — currently zero — plus a taxonomy-pinning regression test and a test-scoped `npm test`.
- **Escalate, with a recorded decision**, the substrate-level security findings: wide-open `cors()` on an unauthenticated mutating API, disabled CSP, and a tracked `.env` that `.gitignore` does not exclude.

### Preserved, not changed

- The layered flow `routes → controllers → services → fs` (`AGENTS.md` rule 1) and the `PathService` path boundary (rule 2). This change adds no service and bypasses no boundary.
- The response-envelope convention (rule 6): `/fs/list` stays a bare `{items, total, counts}` object and `/fs/tree` stays a bare array. Only `POST /fs/starred` is added, and it follows the mutating `{success, data}` envelope.
- Rename remains same-directory only. No move capability is introduced.
- Deletion remains permanent. No trash, no undo, no soft delete.
- `MetadataService` fire-and-forget semantics (rule 7) are unchanged.
- `public/assets/js/api.js` is **not modified**. Its download helpers already implement the correct iframe/form pattern that `files.js` must start using.

## Capabilities

### New Capabilities

`openspec list --specs` reports `No specs found`, so this repository has no existing capability inventory and every capability below is introduced new.

- `upload-destination-integrity` — field ordering, truthful response paths, overwrite policy, size limits, abort, per-file errors, folder drops.
- `bulk-download-integrity` — the ZIP route, one handler per control, popup-free download triggers, honest selection behaviour.
- `type-taxonomy-consistency` — one server-side classifier, server/client agreement, the `other` bucket, and a pinning test.
- `mutation-result-truthfulness` — partial delete reporting, error-versus-empty states, no fabricated success.
- `files-list-resilience` — bounded-concurrency enrichment, folder size nullability, vanished-entry tolerance, and duplicate route registration.
- `navigation-state-consistency` — single-owner navigation, tree highlight, persisted expansion, depth handling, debounce cancellation, tree-scoped folder creation.
- `selection-and-pagination-integrity` — selection retention, page clamping, removal of discarded optimistic arithmetic, safe action dispatch.
- `surface-honesty` — removal of dead and fabricated controls across all four page sidebars and the Files page.
- `files-accessibility` — keyboard operability, drawer dialog semantics, names and roles for every control.
- `files-ui-quality` — layout, thumbnails, states, tokens, sticky offsets, select-all scope, destructive-action communication, responsive density.
- `markup-escaping-and-security-boundary` — escaping at every interpolation, and the recorded decision on CORS, CSP and `.env`.
- `regression-guardrails` — `files.js` test coverage, the taxonomy-pinning test, and test discovery scoped to `test/`.

### Modified Capabilities

None.

## Impact

**New files**
- `test/frontend/files.test.js`
- `test/api/fs.contract.test.js` (upload destination, partial delete, taxonomy, star route)
- `src/routes/star.routes.js` **or** a `router.post('/star')` binding in `src/routes/fs.routes.js` (see `design.md` D4)
- `src/controllers/star.controller.js` — or a handler in `fs.controller.js`
- `docs/decisions/ADR-003-files-page-integrity.md`

**Modified files**
- `public/assets/js/files.js` (the large majority of this change)
- `public/files.html`, `public/assets/css/files.css`
- `public/index.html`, `public/uploads.html`, `public/settings.html` (sidebar entries only)
- `src/controllers/fs.controller.js` (taxonomy call, folder `size`, partial-delete consumer contract, upload path derivation)
- `src/routes/fs.routes.js` (uncomment ZIP; add star binding)
- `server.js` (remove duplicate catch-all; record CORS decision)
- `package.json` (`test` script scoped to `test/` — **zero new dependencies**)
- `.gitignore` (`temp/`, `.env`)
- `AGENTS.md`, `docs/CONTRACTS.md`, `docs/REPO_MAP.md`

**Untouched:** `src/services/*`, `src/utils/validators.js`, `src/middlewares/errorHandler.js`, `src/config/env.js`, `public/assets/js/api.js`, `public/assets/js/app.js` (the shared `Format`, `escapeHtml` and `resolveType` already exist and are sufficient).

**Edited but narrowly:** `src/utils/fileTypes.js` — `EXTENSION_MAP` and `CATEGORIES` only, per `design.md` D3. Its header comment claiming the inline copy is an open escalation is removed as stale (task 6.2). `classifyFile`, `emptyBreakdown` and the reverse-index construction are not otherwise altered.

### Concurrent-change coordination

`openspec/changes/upload-pipeline-correctness` (Uploads page) was authored against this change and **explicitly lists `src/controllers/fs.controller.js` and `src/routes/fs.routes.js` as untouched, "both owned by `files-page-correctness`"**. The server-side upload defects that change reproduces — field ordering, the ignored overwrite flag, and the absent size limit — are therefore fixed **here**, in Phase 1 tasks 1.1, 1.2, 1.7, 1.8 and 1.9. That change owns `src/middlewares/errorHandler.js` and `src/config/env.js` for its stack-trace-disclosure defect, which this change does not claim and does not cover.

Consequence for implementation: **Phase 1 must not begin until `upload-pipeline-correctness` has confirmed it will not edit `fs.controller.js` or `fs.routes.js`.** Its server-side expectations then arrive satisfied by this change. Neither change edits `src/utils/fileTypes.js`, so there is no three-way conflict on the taxonomy.

**Merge-conflict hotspots:** `files.js` is the highest-degree file in the change and is written in six phases — phases touching it are strictly sequential. `server.js` is shared with the active `dashboard-real-data` change (109/112 tasks complete), which owns the mount ordering at `:33-48`; see `design.md` R4.

**Cross-platform:** Windows and Linux, field-for-field identical HTTP contract. Note that `stats.size` for a directory is `4096` on ext4 and `0` on NTFS, which is why folder size must be `null` rather than a number.

**Non-goals** are enumerated in `design.md`.

## Acceptance Criteria

Each criterion is independently verifiable. Confirmed defects are marked **[reproduced]**.

### Data integrity
- [ ] **[reproduced]** A multipart upload whose `destination` is `/sub` places the file in `/sub` on disk, asserted by inspecting the filesystem — not by reading the response body.
- [ ] **[reproduced]** The upload response `data.path` equals the path the file was actually written to.
- [ ] An upload whose `destination` field is absent defaults to the storage root and the response says so.
- [ ] An upload that would overwrite an existing file is rejected or renamed; it never silently truncates the existing file.
- [ ] `POST /api/fs/download-zip` with a valid `paths` payload returns `200` and `Content-Type: application/zip`.
- [ ] **[reproduced]** A delete of one existing and one non-existent path produces a visible failure report naming the surviving and failed paths — never an unqualified "N items deleted".
- [ ] **[reproduced]** When `/fs/list` or `/fs/tree` fails, the page renders an error state with a working retry, not an empty directory and not a synthetic tree.

### Truthfulness
- [ ] Every extension the client renders with a type badge is reachable by that type's filter chip.
- [ ] **[reproduced]** On a directory containing only unclassified extensions, `counts.all` equals the sum of all chip counts plus `other`, and an "Other" chip appears when `other > 0`.
- [ ] `fs.controller.js` contains no inline extension list; classification calls `classifyFile()`.
- [ ] No control in `files.html` or `files.js` copies a hardcoded URL, toasts an outcome it did not perform, or is rendered as enabled without a working handler.
- [ ] A control whose capability does not exist is removed from the markup, not disabled or stubbed.

### State and navigation
- [ ] Navigating by tree, breadcrumb, row click, context menu, or the back/forward-equivalent path all leave the tree highlighting the current folder.
- [ ] Tree expansion survives every `loadTree()` triggered by a create, rename or delete.
- [ ] Navigating 4+ levels deep leaves the user oriented: the current folder is indicated and reachable from the tree or breadcrumb.
- [ ] Every navigation entry point clears the search input, not just `state.search`.
- [ ] Typing in the search box and immediately navigating does not apply the stale term to the new folder.
- [ ] "New subfolder" invoked from a folder-tree context menu creates the folder inside the right-clicked node.
- [ ] Sorting, paginating, changing page size and changing filter preserve an existing selection; navigation and post-mutation refresh drop ids that no longer exist.
- [ ] Deleting the last row on the final page moves to the new final page instead of rendering an empty table under a valid page number.
- [ ] Bulk counts are derived from the paths actually sent, and never from a selection set that may diverge.

### Accessibility
- [ ] Every file row and card is reachable and activatable by keyboard, with a visible focus indicator.
- [ ] The drawer exposes `role="dialog"`, `aria-modal="true"`, and a correct `aria-hidden`; focus enters on open, is trapped while open, and returns to the trigger on close.
- [ ] Breadcrumb segments, tree items, and sort headers are real interactive elements with accessible names.
- [ ] Every checkbox and filter chip has an accessible name; filter chips expose `aria-pressed`; sort headers expose `aria-sort`.
- [ ] Row action buttons are visible on keyboard focus, not only on hover.
- [ ] The view toggle either implements the tab pattern correctly or drops the incorrect ARIA roles.
- [ ] `Escape` closes the drawer only when the drawer is open and no modal is open.

### UI quality
- [ ] The table scrolls horizontally instead of clipping; long filenames expose a tooltip.
- [ ] Grid cards and the drawer show a real thumbnail for previewable types and an explicit "preview unavailable" state otherwise.
- [ ] Empty, no-search-results, filter-mismatch, error and loading states are visually distinct; loading uses a skeleton that preserves layout.
- [ ] No inline `style` attributes remain in `files.js` or `files.html`; all values come from `tokens.css`.
- [ ] Sticky toolbar and sticky tree panel do not overlap at any scroll position.
- [ ] "Select All" either selects the entire filtered set or states that it selects the current page.
- [ ] The destructive-action confirmation names the count, total size, and the items, and states that the operation is irreversible.

### Security
- [ ] No filesystem-derived string is inserted into markup unescaped; `escapeHtml` is applied at every interpolation site in `files.js`.
- [ ] A recorded decision exists for the `cors()` policy, the disabled CSP, and the tracked `.env`, and `.gitignore` excludes `.env` and `temp/`.

### Guardrails
- [ ] `test/frontend/files.test.js` exists and covers every defect above that is observable without a browser.
- [ ] A test asserts the server and client extension sets are identical.
- [ ] `npm test` exits `0` and cannot be broken by a scratch file outside `test/`.
- [ ] `AGENTS.md` and `docs/CONTRACTS.md` reflect the shipped contract.