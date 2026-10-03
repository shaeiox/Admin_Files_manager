# Design

## Context

The Files page is a no-build vanilla-JS SPA (`public/files.html` + `public/assets/js/files.js`) over an Express 5 API (`src/routes/fs.routes.js` → `src/controllers/fs.controller.js` → `src/services/*`). It is the only page that mutates data and the only page with no test coverage.

The investigation that produced this change classified every finding by how it was established:

| Class | Meaning | Count |
|---|---|---|
| **[reproduced]** | Verified by running a live server and probing it | 6 |
| **[certain]** | Certain from reading the code; a single unambiguous path | 18 |
| **[latent]** | Reachable but timing-dependent; an attempted reproduction did **not** fail | 2 |
| **[UX]** | Design-system, interaction and accessibility defect | 22 |

The `[latent]` pair are called out explicitly so they are not mistaken for live bugs. The TOCTOU listing failure (`fs.controller.js:90`) was probed at a 5 ms delay and returned `200`; it is reachable because `AppError 404` escapes the per-entry loop, but it is hardening, not an observed outage.

### Existing architecture involved

**Request path.** `server.js:33` mounts `fsRoutes` at `/api/fs`. `fs.routes.js:9-18` declares seven bindings; line 16 (ZIP) is commented out. `fs.controller.js` holds both read handlers (`getTree:17`, `getList:67`) returning **bare** shapes and all mutating handlers (`createFolder:165`, `renameItem:196`, `deleteItems:231`, `uploadFile:360`) returning `{success, data}`. `deleteItems` and `downloadZip` are additionally exported (`fs.controller.js:477-486`).

**Frontend state.** `files.js` is an IIFE attaching `window.Files`, gated by `document.body.dataset.page === 'files'` (`:1344-1348`). A single `state` object (`:16-32`) holds `tree`, `files`, `totalFiles`, `typeCounts`, `view`, `sort`, `filter`, `search`, `selected`, `page`, `perPage`, `currentPath`, `isLoading`. `loadFiles` (`:53-95`) is the sole list loader and carries a `currentRequestId` monotonic guard (`:39`, `:54`, `:74`) against stale responses. All rendering is `innerHTML` string concatenation.

**Shared helpers already available and unused by `files.js`.** `window.AFM.escapeHtml` (`app.js:739`, exported `:1049`) — used exactly once in `files.js:566`. `API.downloadFile` / `downloadMultipleFiles` / `downloadZip` (`api.js:205,220,239`) — all three implemented, `downloadZip` called at `files.js:1169`. `API.upload` returns `{promise, abort}` (`api.js:165-167`) — `abort` is discarded at `files.js:117`. `MetadataService.toggleStar` (`MetadataService.js:107-119`) — implemented, never routed. `src/utils/fileTypes.js` `classifyFile` (`:54-63`) — consumed by `FileSystemService.getTreeStats` (`:360`) but **not** by `fs.controller.js`.

**The taxonomy gap is a known, escalated one.** `fileTypes.js:17-26` states in its own header comment that `fs.controller.js` still carries an inline copy, that collapsing it is a ~12-line removal tracked as an escalation, and that no automated guard exists. `tasks.md:3.8` of `dashboard-real-data` records the same escalation as deliberately not applied. This change closes it, and closes the wider client/server half of it that no document currently records.

## Goals / Non-Goals

### Goals

1. No upload, delete, download or navigation action may report an outcome the system did not produce.
2. No filesystem-derived string reaches `innerHTML` unescaped.
3. Every rendered capability is real: no control is present without a working handler, and no handler fabricates a result.
4. The list, grid, tree, drawer and toolbar are operable by keyboard and expose correct semantics.
5. Every defect above has a regression test that fails before the fix.
6. Layout defects that hide data (table clipping, absent thumbnails, collapsed states) are corrected.

### Non-Goals

- **Authentication and authorisation.** The API has none. Adding it is an architectural change touching every route, the four page shells and the metadata store's per-user model. Recorded as escalated (R1), not implemented.
- **Cross-directory move.** `AGENTS.md` states rename is same-directory only by design. `#bulkMove` is removed rather than implemented.
- **Trash / undo.** Deletion stays permanent. The Trash sidebar entry is removed rather than faked.
- **Sharing.** No sharing primitive exists in the backend. `#bulkShare` and the drawer Share button are removed rather than faked.
- **Batch rename.** Requires a bulk API. The control is removed rather than stubbed.
- **Rebuilding `public/assets/js/api.js`.** It is correct; `files.js` is the consumer that is wrong.
- **A build step, a framework, a DOM test harness, or any new dependency.** `node:test` with the hand-rolled DOM stub already used by `test/frontend/app.test.js:27-29`.
- **Extending the tree beyond its current depth as a feature.** The depth cap becomes an honest, tested constraint with a documented escape hatch (breadcrumb), not a deeper fetch.
- **Touching `uploads.html` behaviour.** The `#bulkDownload` and upload defects are Files-page findings. `uploads.js` is referenced only where a shared helper is extracted.

## Architecture

### Root cause per defect

| ID | Defect | Root cause |
|---|---|---|
| R-A | Uploads misfiled; response path fabricated | Multipart field **wire order** is load-bearing but undocumented. `FormData` preserves append order; busboy parses in that order; multer fires `destination`/`filename` when the first file chunk arrives. `req.body` is therefore only partially populated at that moment. Nothing in the code or docs records this. |
| R-B | ZIP 404 | `fs.routes.js:16` commented out while `api.js:239` and `files.js:1169` remain live callers. No route-existence check exists at either end. |
| R-C | Dead bulk-download menu wins | Two `addEventListener('click')` registrations on one element. `stopPropagation` does not suppress same-element listeners (only `stopImmediatePropagation` does), and `ContextMenu.show` writes `menu.innerHTML` into a singleton node, so last-write-wins. No lint rule or test covers duplicate registration. |
| R-D | Partial delete reported as success | The controller's partial-failure contract (`fs.controller.js:242,269-272`) returns `200` with `data.failed` populated. The consumer awaits the promise and never inspects the body. Nothing in `docs/CONTRACTS.md` states that a `2xx` from `/fs/delete` does not imply full success. |
| R-E | Error renders as empty | `loadFiles`'s catch (`:80-85`) maps every failure to `files = []`, the same value the empty branch produces. `renderEmpty` (`:564`) has one message for all causes. No error state exists in the module. |
| R-F | Taxonomy drift | Three hand-maintained extension lists: client `FileTypes` (43), `fileTypes.js` (28), and an inline copy in `fs.controller.js:98-103` (28). Enforcement is a prose line in `docs/CONTRACTS.md`. `fileTypes.js:22-26` correctly notes that a test over the module alone would not catch it. |
| R-G | Selection wiped | `state.selected.clear()` sits in `loadFiles`'s `finally` (`:89`) — chosen so it also runs on the error path, but it therefore runs on every successful path too. |
| R-H | Tree desync | `is-active` is written only in the tree's own click handler (`:187-188`). Four other navigation paths exist and none of them writes it. |
| R-I | Tree expansion lost | `renderTree` derives open state from `depth === 0` (`:145`) — a rendering rule standing in for persisted state. |
| R-J | Fabricated controls | Several handlers were written against an API that does not exist, and `AGENTS.md`'s "some frontend calls are ahead of the backend" note was never turned into a removal pass. |
| R-K | Inaccessible rows | Click handlers were attached to `<tr>` and `<div>` with no keyboard equivalent, and no ARIA layer was added. |
| R-L | Layout defects | `.files-table-wrap { overflow: hidden }` (`files.css:154`) chosen for the card's rounded corners, silently disabling horizontal scroll. Thumbnail CSS (`:371`, `:605`) written for markup that was never emitted. |

### Exact components affected

**`public/assets/js/files.js`** — phases 0, 2, 3, 4, 5. Single writer; strictly sequential.
- `handleDirectUpload` (`:101-131`) — field order, progress, abort, per-file errors.
- `loadFiles` (`:53-95`) — error state, selection retention, page clamping, concurrency guard.
- `loadTree` (`:41-51`) — error state, no synthetic fallback.
- `renderTree` (`:137-216`) — expansion from state, highlight from state, tree-scoped create.
- `handleTreeMutation` (`:256-320`) — **delete**, uncalled.
- `renderList` (`:361-461`), `renderGrid` (`:467-517`), `renderFooter` (`:523-552`), `renderEmpty` (`:564-580`) — states, escaping, tokens, skeleton.
- `updateBreadcrumb` (`:590-625`) — delegation into `navigateTo`.
- `bindRowInteractions` (`:649-796`) — keyboard, select-all scope, safe dispatch.
- `openContext` (`:802-842`), `openDrawer` (`:844-877`), `closeDrawer` (`:879-881`) — dialog semantics.
- `handleAction` (`:887-1092`) — download via `API.downloadFile`, star, deleted optimistic paths, guarded event.
- `bindToolbar` (`:1103-1297`) — remove the duplicate listener (`:1229-1261`), remove four fabricated handlers, cancel the debounce.
- `initDragDrop` (`:1299-1323`) — drop scoping, folder entries, progress.

**`public/files.html`** — drawer semantics (`:332`), dead footer buttons (`:341-348`), dead overflow items (`:249-266`), bulk-bar buttons (`:307-318`), topbar search (`:151-156`), sidebar entries (`:64,72,76,80,84`), inline styles (`:113,125,201,273,277,345`).

**`public/assets/css/files.css`** — `:154` overflow, `:291` focus visibility, `:21`/`:443` sticky offsets, `:371`/`:605` thumbnails, `:195` sort glyph, `:216` tablist roles, `:772-801` responsive density.

**`src/controllers/fs.controller.js`** — `:93-104` inline taxonomy → `classifyFile()`; `:111` folder `size` → `null`; `:84-125` bounded-concurrency enrichment and vanished-entry tolerance; `:370-371` response path derivation.

**`src/routes/fs.routes.js`** — uncomment `:16`; add the star binding.

**`server.js`** — remove the duplicate catch-all at `:46-48`; record the CORS decision at `:19`.

**`package.json`** — scope the `test` script to `test/`.

### Data and control flow changes

**Upload (before → after).**

```
BEFORE  files.js:112   formData.append('file', file)        ← busboy sees file first
        files.js:113   formData.append('destination', p)
   → multer destination cb: req.body.destination === undefined
   → resolveSecurePath('/') → storage root
   → fs.controller.js:370  req.body.destination === '/sub'  (parsed by now)
   → responds { path: '/sub/x.txt' }                        ← fabricated

AFTER   files.js        formData.append('destination', p)   ← destination first
        files.js        formData.append('overwrite', policy)
        files.js        formData.append('file', file)
   → multer destination cb: req.body.destination === '/sub'
   → writes /sub/x.txt
   → fs.controller.js derives data.path from the resolved secure path actually used
   → responds { path: '/sub/x.txt' }                        ← true
```

**Navigation.** Five entry points (tree click, breadcrumb, row click, context menu, drawer link) currently each mutate a subset of `{currentPath, page, filter, search}` and only some update the breadcrumb and tree. After this change each calls one function:

```
navigateTo(path, {resetFilter, resetSearch})
  → cancel pending search debounce
  → state.currentPath / page / filter / search
  → sync #filesSearch.value          (was missing on 3 of 5 paths)
  → updateBreadcrumb()
  → syncTreeSelection()              (was missing on 4 of 5 paths)
  → loadFiles()
```

**List reload.** `loadFiles` gains `state.error`; the catch sets it instead of pretending emptiness; the `finally` prunes `state.selected` to ids present in the new page instead of clearing it; and a page clamp re-requests when `page > totalPages`.

**Delete.** `handleAction('delete' | 'bulkDelete')` reads `res.data.failed`; a non-empty `failed` renders a warning naming the survivors and the reasons. The optimistic `totalFiles`/`renderView()` pair at `:1010-1013` and `:1080-1083` is removed, because `loadFiles(true)` on the next line already overwrites it.

### Error handling

- **Backend unreachable.** `state.error` set; `renderError()` shows the message and a Retry button that re-invokes the failed loader. The empty state is reserved for a successful response with zero items.
- **Partial delete.** Success and failure reported separately. The success count is `data.deleted.length`, never `state.selected.size`.
- **Per-file upload failure.** The file name and the server's `err.message` are surfaced; the count-only summary is retained as a roll-up.
- **Vanished list entry.** Skipped silently (it is not the operator's error) and counted in a diagnostic; the request still returns `200`.
- **Thumbnail unavailable.** An explicit "preview unavailable" affordance, never a broken `<img>` and never a fabricated placeholder image.

## Decisions

### D1 - Order multipart fields before the file, and derive the response path from the resolved destination

Appending `destination`/`overwrite` before `file` is the whole fix for the misfiling; it is also the only fix that does not require reimplementing multer's storage layer. Independently, `fs.controller.js:370-371` must stop trusting `req.body.destination` for the response and instead compute `clientPath` from the `secureDest` the storage callback actually resolved, so a future ordering mistake produces a wrong *location* rather than a wrong *report*.

Rejected: switching to `multer.memoryStorage` — violates `AGENTS.md` rule 4 (never buffer into memory). Rejected: encoding the destination into the URL query string (`POST /fs/upload?destination=/sub`) — immune to field ordering, but splits one payload across two channels and diverges from the existing contract. Rejected: a custom `storage` engine — unnecessary complexity for a two-field problem.

### D2 - Uncomment the ZIP route; do not remount the filesystem router

`fs.routes.js:16` is commented while `api.js:239` and `files.js:1169` are live callers, so the intent is unambiguous. `downloadZip` (`fs.controller.js:398-474`) is already implemented and handles the urlencoded `paths` field that `api.js:273` sends. `AGENTS.md` warns specifically against remounting `fsRoutes` into a second prefix; uncommenting one read-only streaming route carries none of that risk.

Rejected: removing the ZIP affordance — it is the only way to download a folder, and the backend is already written.

### D3 - One server-side classifier; reconcile the map upward, not downward

`fs.controller.js:93-104` is replaced by `classifyFile()` from `src/utils/fileTypes.js`, which already backs `FileSystemService.getTreeStats` (`:360`) — so this change also removes the drift `fileTypes.js:17-26` and `tasks.md:3.8` escalated.

The direction of reconciliation matters. The client set (43 extensions) is the *superset*; the server set (28) is the subset. Narrowing the client to match the server would remove correct type badges from the Dashboard. So `EXTENSION_MAP` grows to the client set, and `CATEGORIES` gains `other` so `getList`'s `counts` can report the unclassified bucket that today has no chip at all.

`emptyBreakdown()` is deliberately **not** changed: it omits `folder` by design (`:66-68`, "a folder has no file bytes to attribute") because it feeds the Dashboard donut. `getList`'s counts *do* include `folder` because the chip row needs it. These two shapes are intentionally different and a pinning test must assert each against its own contract, not against the other.

### D4 - Star goes in `fs.routes.js` as `POST /fs/star`

`toggleStar` is implemented (`MetadataService.js:107-119`) and returns the new boolean, so the handler is a two-line composition. Registering it under `/api/fs` follows `AGENTS.md`'s "new filesystem endpoint: route → handler → service" rule and avoids a new router mounted into an area the active `dashboard-real-data` change also touches.

Contract: `POST /api/fs/star` with `{ path }` → `{ success: true, data: { path, starred } }` (envelope, per rule 6, because it mutates). The frontend then renders the star optimistically and reverts it on failure.

### D5 - Remove unbuildable capabilities rather than stub them

`#bulkShare`, `#bulkMove`, `#bulkStar`-without-backend (solved by D4), batch rename, the drawer Share/Download buttons, and four overflow-menu items are either removed from the markup or given real handlers. `AGENTS.md` is explicit: "When a number is unavailable, remove the affordance that wanted it; do not synthesise a plausible value." A disabled-looking button that toasts a fake success is the same defect wearing different clothes.

`#bulkStar` is the one exception and it gets a real implementation, because the service already exists.

### D6 - Sidebar entries: implement three, delete two

`Starred`, `Recent` and `Downloads` are each one query parameter away (`starredOnly=true`, `sort=modified&dir=desc`, `sort=downloads&dir=desc`) and all three are supported by the existing sort path. `Shared` has no backend primitive and `Trash` contradicts permanent deletion, so both are removed. The edit is applied to **all four pages**, because the sidebar is duplicated in each (`dashboard-real-data` D14) and a sidebar that differs per page is a new defect.

### D7 - Extract `navigateTo()`; make `loadTree` and `renderTree` read state instead of deriving it

Five navigation paths each own a different subset of the navigation state today. Collapsing them into one owner is what makes the tree highlight, search-input clearing, filter reset and debounce cancellation correct *by construction* rather than by five parallel edits.

Tree open/closed state moves into `state.expandedPaths` (a `Set`), read by `renderTree` and written by the caret handler. The root's default-open behaviour becomes an initialisation of that set, not a rendering rule.

### D8 - Keep selection across reloads by pruning, not by clearing

`loadFiles` prunes `state.selected` to ids present in the newly loaded page. Explicit navigation and post-mutation refresh additionally clear it. This preserves a user's multi-select across a sort or a page-size change, which is what they expect, without ever selecting an id that is no longer rendered — which is what makes the bulk ZIP and bulk delete payloads honest.

Cross-page selection stays impossible, because `state.files` holds only the current page. The UI must therefore say "Select all 20 on this page" rather than implying the whole filtered set (D9).

### D9 - "Select All" states its scope

Selecting the entire filtered set would require either a server-side "all matching ids" payload or a sentinel in the bulk endpoints — a real contract change with real cost. Since selection cannot cross pages, the header checkbox is relabelled to state its scope, and the bulk bar reports the count it will actually act on. This is the honest option available without a contract change; the alternative is recorded as a future capability.

### D10 - Optimistic update only where it is visible

The delete path applies `renderView()` and adjusts `totalFiles`, then calls `loadFiles(true)` on the very next line, which overwrites both — dead code with a misleading side effect. Optimistic removal is retained only where the request is not immediately followed by a reload, and the arithmetic is derived from `pathsToDelete.length` rather than `state.selected.size`.

### D11 - Drawer becomes a real modal dialog

`Modal.prompt` (`app.js:~431`) already establishes the house pattern: `role="dialog"`, `aria-modal="true"`, backdrop, Escape handling. The drawer adopts the same semantics, plus the correction that `aria-hidden` must be toggled in **both** directions — currently `files.html:332` ships `aria-hidden="true"` and `openDrawer` (`:876`) only adds a class, so assistive technology is told the drawer is hidden while it is on screen.

### D12 - Escape is scoped, not global

`files.js:1137` binds `document`-level Escape unconditionally. After this change it closes the drawer only when the drawer is open and no `Modal` backdrop is present, so it cannot dismiss a confirm dialog that happens to be open over the drawer.

### D13 - Thumbnails: a real endpoint with a hard size cap

`files.css:371` and `:605` already style `.file-thumb img` and `.drawer-preview img` for markup that is never emitted. The fix is a real endpoint rather than deleting the CSS, because a file manager whose grid shows only generic type glyphs reads as unfinished.

`GET /api/fs/thumbnail?path=&size=` streams through `sharp` if present, otherwise returns `404` with an explicit marker the client renders as "preview unavailable". The client **must** treat both a `404` and a decode failure as the same unavailable state. The endpoint is read-only, capped at 512 px on the long edge, and never returns the original bytes for a non-image — `Content-Type` is asserted before any transformation and a non-image request is refused without reading the file.

Rejected: rendering `<img src="/api/fs/download?...">` — `downloadFile` forces `Content-Type: application/octet-stream` (`fs.controller.js:305`), which no browser will decode. Changing that header globally would make the download endpoint render untrusted content inline, which is worse.

### D14 - Error state is a first-class render path, not a message variant

`state.error` is a distinct field, set only by a failed load and cleared on the next attempt. `renderError()` replaces neither the empty state nor the loading state; it is its own branch. This is the direct expression of `AGENTS.md`'s "a 200 does not by itself mean every field is populated — check the flags before rendering", applied to the list.

`loadTree`'s synthetic fallback node (`:46-50`) is deleted rather than corrected: a fabricated tree that looks valid is worse than an error message, because it invites navigation into a hierarchy that may not be what the server holds.

### D15 - Escape everything derived from the filesystem

`f.name` (`:402`, `:503`, `:858`), `f.path` (`:404`, `:872`) and breadcrumb segments (`:604`) reach `innerHTML` raw. `escapeHtml` exists and is used once. `validateFileName` rejects `<` and `>` (`validators.js:36`), so exploitation requires a file placed in `STORAGE_ROOT` out-of-band — but that root is operator-controlled, is commonly a network share, and CSP is disabled (`server.js:16-18`). Defence in depth, applied uniformly rather than at the one site that happened to remember.

### D16 - Scope `npm test` to `test/`

`node --test` discovers `temp/upload-probe.test.js`, which fails 8 assertions on a `FormData` misuse of its own making and turns the suite red. Scoping the glob to `test/` makes scratch harnesses incapable of breaking CI. The scratch file is deleted regardless.

### D17 - `count= 0` is a reading; an unknown is a flag

Per `AGENTS.md`: folder `size` becomes `null`, not the inode size (`4096` on ext4, `0` on NTFS — neither is a meaningful quantity). The `other` bucket is counted truthfully and shown as a chip when non-zero, rather than being dropped so the chips appear to reconcile. Where a quantity genuinely cannot be measured, the UI says "unavailable".

### D18 - CORS, CSP and `.env` are escalated with a recorded decision, not silently absorbed

`server.js:19` is `app.use(cors())` — origin-reflecting, on an API with **no authentication** that can delete, rename and upload. Any page the operator visits can drive it. CSP is disabled outright (`:16-18`), removing the backstop for D15. `.env` is tracked and `.gitignore:6` has the entry commented out (`#.env`), which `AGENTS.md` already flags as ADR-001 open.

Implementing auth is out of scope (see Non-Goals). What this change does commit to: (a) a written decision in `design.md` R1 and `ADR-003` recording that the API is unauthenticated and origin-open **by current design**, not by oversight; (b) `.gitignore` uncommenting `.env` and adding `temp/`; (c) `docs/CONTRACTS.md` stating the exposure so it is a recorded risk rather than an undiscovered one. Deferring without recording would leave the highest-severity finding in this audit invisible to the next agent.

## Risks / Trade-offs

**R1 - The API is unauthenticated and origin-open.** `cors()` reflects any origin; there is no auth; every Files-page mutation is reachable cross-origin. This is the highest-severity finding in the audit and is **not fixed here** — auth is architectural. Mitigation: recorded decision, documented in `ADR-003` and `docs/CONTRACTS.md`, `.env` untracked. A follow-up change must add authentication before this is exposed beyond localhost.

**R2 - Enabling the ZIP route widens the read surface.** `/api/fs/download-zip` accepts up to 500 paths and streams them. It is read-only and already implemented, but it is currently unreachable, so enabling it is a net-new reachable endpoint. Mitigation: contract tests pinning the 500-path cap and the `validateClientPath` per entry (`:420`), which is the traversal barrier.

**R3 - `fs.controller.js` is a degree-84 merge-conflict hotspot** and is not owned by the active `dashboard-real-data` change, which explicitly left it untouched (`proposal.md:67`). This change edits it. Mitigation: keep the edits to four small, locally-scoped hunks; do not reformat the file.

**R4 - `server.js` is concurrently owned by `dashboard-real-data`** (109/112 tasks complete), which places the dashboard mount relative to the `/api` catch-all at `:33-48`. Mitigation: this change touches only the duplicate catch-all at `:46-48` and adds no mount. **Do not move or reorder any mount.**

**R5 - Taxonomy reconciliation changes the Dashboard donut.** Growing `EXTENSION_MAP` to the client set reclassifies files previously counted as `other`. The donut's slices shift. This is a correction, but it is a visible change to an already-shipped surface, and `dashboard-real-data` tests may pin the old counts. Mitigation: run the full suite after task 1.4 and update any pinned expectation deliberately rather than by reflex.

**R6 - Adding `other` to `getList`'s `counts` is an additive contract change.** Any consumer asserting the exact seven-key shape breaks. Mitigation: it is additive and documented; `files.js` is the only consumer.

**R7 - `navigateTo()` extraction is the largest single frontend refactor** and touches five call sites plus the two tree renderers. Regression risk is behavioural (highlight, filter reset, search clearing) rather than syntactic. Mitigation: the navigation spec's scenarios are written to be individually testable against a stub DOM; land D7 before the visual phases so later work sits on stable state.

**R8 - Thumbnails add a new endpoint and an optional dependency.** `sharp` is not in `package.json` and this change adds **no** dependencies. The endpoint must therefore degrade cleanly to "unavailable" when no transformer is present, and that degraded path is the one the test suite covers. If a transformer is added later it is a separate, security-reviewed change — image decoding of untrusted input is its own risk class.

**R9 - Removing the fake sidebar entries is user-visible.** Operators who clicked "Starred" and got the root listing will find the entry gone until D6's replacement lands. Mitigation: D6 replaces three of the five in the same phase, so the net removal is `Shared` and `Trash` only.

**R10 - Keyboard operability on rows changes interaction semantics.** Making `<tr>` activatable requires choosing a focus model (roving `tabindex` vs `tabindex="0"` per row). Roving `tabindex` matches the WAI-ARIA grid pattern and avoids 20 tab stops per page, but is more code. Mitigation: the accessibility spec pins the chosen model so it is not decided ad hoc.

**R11 - `temp/upload-probe.test.js` was present at audit start and absent at audit end**, removed by something other than this session. `.gitignore` gains `temp/` so a scratch directory cannot be committed or discovered again.

**R12 - A concurrent change (`upload-pipeline-correctness`) touches the same subsystem from the other direction.** That change covers the Uploads page and independently reproduces three of the same server-side upload defects: field ordering, the ignored overwrite flag, and the absent size limit. It was authored against this one and lists `fs.controller.js` and `fs.routes.js` as untouched and owned here, so the boundary is agreed rather than contested.

The residual risk is ordering, not ownership. If both are implemented concurrently, two agents edit `fs.controller.js` — a degree-84 hotspot — with different approaches to the same three defects, and the second finds its work already done or half-done. The Uploads page's own findings (queue integrity, progress arithmetic, its own accessibility and honesty defects) are entirely disjoint and are that change's to implement.

Mitigation: this change's Phase 1 is the sole owner of those two files, and the other change's server-side expectations are satisfied by tasks 1.1, 1.2, 1.7, 1.8 and 1.9. Neither change edits `src/utils/fileTypes.js`, so the taxonomy carries no three-way conflict. Sequencing rule: complete Phase 1 before the other change's server-side work, or confirm the ownership split in writing first.

## Migration Plan

No data migration. The only behavioural change to stored state is the star array, which already exists in `data/metadata.json` and is only now reachable from the UI.

Rollout is a single merge; the phases are ordered by dependency, not by shippable increment, because Phases 0-2 are individually valuable and Phase 6 depends on Phase 1's contract.

| Phase | Content | Gate |
|---|---|---|
| 0 | Test scoping, ZIP route, upload ordering, duplicate listener | Suite green; upload and ZIP probes pass |
| 1 | Taxonomy, partial delete, error states, list resilience | Contract tests green against a live server |
| 2 | Remove dead and fabricated surface; sidebar | No control without a handler |
| 3 | `navigateTo`, expansion, selection, pagination | Navigation scenarios green |
| 4 | Accessibility | Keyboard walkthrough of every control |
| 5 | Layout, thumbnails, states, tokens, responsive | Breakpoint sweep at 320/768/1024/1440 |
| 6 | Docs and guardrails | `AGENTS.md`, `docs/CONTRACTS.md`, `ADR-003` |

**Rollback.** Phases 0-2 are independent and revertible per-hunk. Phase 3's `navigateTo` extraction is the only change where a partial revert could leave behaviour inconsistent; it lands as one commit.

## Human Approval Points

- **A1 — Enable the ZIP route (D2).** Net-new reachable endpoint. Confirm before implementation.
- **A2 — Taxonomy direction (D3).** Confirm the server map grows to the client set, accepting the Dashboard donut shift (R5).
- **A3 — Star route placement (D4).** Confirm `POST /api/fs/star` in `fs.routes.js` rather than a new router.
- **A4 — Sidebar deletions (D6).** Confirm removing `Shared` and `Trash`.
- **A5 — Thumbnail endpoint (D13).** Confirm a new read-only endpoint with a size cap and an explicit unavailable state, with no new dependency in this change.
- **A6 — CORS/auth deferral (D18, R1).** Confirm that recording the exposure without fixing it is acceptable for this change, and that a follow-up authentication change is required before non-localhost exposure.

**Approval record (2026-10-03).** A1, A2, A3, A4, A5 and A6 were all approved by the repository owner in the implementation session. The concurrent-change gate (R12) is satisfied in writing: `upload-pipeline-correctness/proposal.md` lists `src/controllers/fs.controller.js` and `src/routes/fs.routes.js` as untouched and "owned by `files-page-correctness`", and its `tasks.md` 0.1/0.2 only verify this change's upload placement.

## Open Questions

- **OQ1** — Should cross-page selection become real (server-side "all matching ids" sentinel), or is page-scoped selection with an honest label the intended end state? D9 assumes the latter for now.
- **OQ2** — Should `getTree`'s depth cap be lifted with lazy child loading, or is the breadcrumb the intended navigation past depth 3? The latter is assumed; the former is a separate capability.
- **OQ3** — `search` matches `item.name` only (`fs.controller.js:119`), so `media/` never matches `/media/photos/x.png`. Path search was confirmed **not** to be broken for folder names — `search=albums` does match a folder named `albums`. Should path matching be added, or is name-only search the intended contract to document?
- **OQ4** — Should `downloadFile`'s blanket `application/octet-stream` (`fs.controller.js:305`) become type-aware with `Content-Disposition: attachment` retained, enabling inline PDF/image viewing without a separate preview endpoint?
- **OQ5** — `toast.success('Upload started')` and similar are emitted before the browser has confirmed anything. Should `api.js` grow a completion signal for the download helpers so success can be reported honestly, or is fire-and-forget with no success toast the accepted contract?