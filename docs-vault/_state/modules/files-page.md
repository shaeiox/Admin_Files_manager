---
module: Files Page
slug: files-page
purpose: Browser SPA page for browsing, searching, uploading and mutating files under the storage root.
roots:
  - public/
language: javascript
complexity: high
loc: 4526
files:
  - public/files.html
  - public/assets/js/files.js
  - public/assets/css/files.css
analyzed-at: 2026-10-14T05:05:10Z
source-commit: e2698aedbe42c3c2c0cc24c38e3ef2b45c1843ae
---

<!-- c2d:s1 -->
### Architecture
A single IIFE module (`const Files = (() => { ... })()`, attached as `window.Files`) driving a static HTML shell (`files.html`, `<body data-page="files">`) styled by `files.css`. `files.js` is organised in labelled bands:

- **Constants** — tree depth (2, mirrors `GET /fs/tree` server cap), page sizes, sort labels/defaults, list `COLUMNS` with resize min/max, `COLUMN_BREAKPOINTS` mirroring `files.css` media queries, tree-panel width range, `TYPE_CHIPS`, `LIBRARY_VIEWS` (`?view=starred|recent|downloads`).
- **Pure helpers and renderers** — state in, HTML string out (`renderTreeHtml`, `renderListHtml`, `renderGridHtml`, `renderBreadcrumbHtml`, `renderChipsHtml`, `renderFooterHtml`, `renderSkeletonHtml`, `renderEmptyHtml`, `renderErrorHtml`, `renderDrawerHtml`, `renderDrawerFooterHtml`) plus path math (`joinPath`, `parentPath`, `ancestorsOf`, `rewriteAfterMutation`), pagination and `listQuery`. Every filesystem-derived value passes `esc()` (`AFM.escapeHtml`).
- **Data loading** — `loadTree`, `loadTreeChildren`, `loadFiles`, `loadPreviewCapability`, `applyDefaultViewSetting`, each guarded by a monotonically increasing request id so stale responses are dropped.
- **Navigation** — single owner `navigateTo(path)`; `syncAfterMutation` is the only other writer of `currentPath`.
- **Controller** — one delegated listener per stable container (`onContainerClick/Keydown/Change/DblClick/ContextMenu/FocusIn`, `onTreeClick/Keydown/ContextMenu`, `onBreadcrumbClick`, `onChipClick`, `onSearchInput`) bound once in `bindEvents()`; actions funnel through `handleAction(act, id, opts)` (a switch over open/details/download/zip/star/rename/cut/copy/paste/delete/newFolder/bulk*/tree actions).
- **Mutations** — `createFolder`, `renameItem`, `deleteItems`, `pasteItems` (cut→move / copy), `setStars`, `setAccessPolicy`, uploads (`runUploads`, `handleDrop`, folder-tree walk via `webkitGetAsEntry` readers).
- **UI chrome** — details drawer (focus trap, background `inert`), bulk bar, upload tray, drag-drop overlay, column and tree-panel pointer/keyboard resizers.

Control enters at `DOMContentLoaded` (when `data-page === 'files'`) or via `router.js` calling `Files.init()`; it exits through `Files.destroy()`, which removes every global listener, timer and injected width stylesheet (uploads in flight continue).

<!-- c2d:s2 -->
### Public API
```js
window.Files.init(): void
```
Builds state from `Store` (view, perPage, column widths, tree width), binds events, renders, and kicks off tree/list/capability/settings loads.

```js
window.Files.destroy(): void
```
Tears down page-scoped listeners, search timer, resize drags and injected `<style>` sheets (router page swap).

```js
window.Files.pure: { TREE_DEPTH, STAGGER_STEPS, PAGE_SIZES, LIBRARY_VIEWS, TYPE_CHIPS, COLUMNS, createState, joinPath, parentPath, isSameOrInside, ancestorsOf, rewriteAfterMutation, typeOf, typeLabel, pageCount, clampPage, footerRange, buildPageNumbers, pruneSelection, emptyKind, staggerIndex, applyNavigation, initExpansion, treeContains, visibleTreePaths, nodeIsExpandable, listQuery, resolveLibraryView, summarizeDelete, deleteConfirmCopy, render*Html..., sanitizeColumnWidths, clampColumnWidth, columnWidth, columnWidthsCss }
```
Pure helpers/renderers exposed for the frontend test suite.

```js
window.Files._controller: { getState, setPreviewCapability, loadTree, loadFiles, navigateTo, handleAction, openDrawer, closeDrawer, onEscape, onPasteShortcut, ... pasteItems, setAccessPolicy }
```
Test seam driving real handlers against a stub DOM; not used by other runtime modules.

HTTP endpoints consumed (via `window.API`, base `/api/v1`): `GET /fs/tree[?path=]`, `GET /fs/list?…`, `GET /fs/thumbnail/capability`, `GET /settings` (silent), `POST /fs/folder`, `PUT /fs/rename`, `DELETE /fs/delete`, `PUT /fs/move`, `POST /fs/copy`, `POST /fs/star`, `POST /fs/upload` (XHR with progress, `destination`/`overwrite` before `file`), `GET`/`PUT /admin/files/policy`; downloads via `API.downloadFile`, `API.downloadMultipleFiles`, `API.downloadZip`; previews via `API.thumbnailUrl`.

<!-- c2d:s3 -->
### Internal Patterns
- **Module-scoped mutable state** — one `state` object from `createState()` (currentPath, files, total, counts, selected Set, expanded Set, clipboard mode/paths/items, sort, filter, page, view, colWidths, loading/error) plus module vars (`uploads`, `previewCapability`, `globalListeners`, `searchTimer`, request ids).
- **Stale-response guard** — `++listRequestId` / `++treeRequestId` checked after every await; `loadFiles` re-issues itself when the page index falls past the new total.
- **Render-by-string + delegation** — containers are re-rendered with `innerHTML`; handlers are never re-bound (`bind`/`listenGlobal` track listeners for `destroy`).
- **Roving tabindex** WAI-ARIA grid for list/grid and a `role="tree"` folder tree with arrow-key navigation; status announcements via an `aria-live` region.
- **Partial-success reporting** — delete/move/copy/star responses are summarised (`summarizeDelete`, `summarizeMove`, `summarizeCopy`, `Promise.allSettled` for stars and policy) so toasts report what actually happened; cut clipboard only drops items that moved; copy keeps the clipboard.
- **Silent API calls** with page-specific toasts (`{ silent: true }`) to replace the generic network-error toast.
- **Persistence in `AFM.Store`** (browser-local): `files-view`, `files-per-page`, `files-col-widths`, `tree-panel-width`; the server `appearance.defaultView` only applies when no explicit local choice exists.
- **Injected `<style>` sheets** for column widths and tree-panel width (`widthSheet`, `treeWidthSheet`) rather than inline styles; breakpoints duplicated between JS (`COLUMN_BREAKPOINTS`) and CSS media queries.
- **Sequential upload queue** — jobs upload one at a time with abortable XHR; dropped folders are recreated with `POST /fs/folder` before their files.
- **Access policy action shown to everyone**, relying on a server 403 rather than a client role gate.

<!-- c2d:s4 -->
### Dependencies
1. **Other project modules**
   - **Frontend Core** — `window.AFM` (`$`, `el`, `icon`, `Format`, `Toast`, `Modal`, `ContextMenu`, `Dropdown`, `copyToClipboard`, `Store`, `FileTypes`, `escapeHtml`, `resolveType`) from `app.js`; `sidebar.js` and `router.js` (page swap calls `init`/`destroy`); `theme.js`; shared stylesheets `tokens.css`, `base.css`, `themes.css`, `layout.css`, `components.css`.
   - **HTTP API Layer** — `window.API` (`get`, `post`, `put`, `del`, `upload`, `downloadFile`, `downloadMultipleFiles`, `downloadZip`, `thumbnailUrl`) from `api.js`, and the `/fs/*` and `/settings` REST endpoints behind it.
   - **Auth and Access Control** — `GET`/`PUT /admin/files/policy` for the bulk "Set access policy" action.
2. **Third-party packages** — none (Google Fonts stylesheet via `<link>` only).

<!-- c2d:s5 -->
### Complexity
High. `files.js` alone is 2876 lines with roughly 580 branching constructs, one large closure holding shared mutable state mutated by concurrent async loaders, uploads, drag-drop and keyboard handlers, and many interacting UI subsystems (tree with lazy child loads, paginated list/grid, selection, clipboard cut/copy/paste, drawer focus trap, column and panel resizing, upload queue). The most complex function is `onContainerKeydown`/`onTreeKeydown` together with `pasteItems`: the keydown handlers implement full roving-focus grid and tree navigation, and `pasteItems` reconciles partial move results against the clipboard, current path and expanded-tree set.

<!-- c2d:s6 -->
### Key Files
- `public/assets/js/files.js` — the entire page module: state, pure renderers, loaders, delegated controller, mutations, uploads, drawer and resizers.
- `public/files.html` — page shell with toolbar, filter chips, folder tree, files container, bulk bar, drawer, upload tray and drop overlay; fixes script load order (`api.js`, `app.js`, `sidebar.js`, `router.js`, `files.js`).
- `public/assets/css/files.css` — toolbar, bulk bar, fixed-layout table, grid cards, tree, drawer, upload tray, resizer and responsive column-hiding rules.
- `public/assets/js/api.js` — (Frontend dependency) the only transport the page uses.
- `public/assets/js/app.js` — (Frontend dependency) `window.AFM` UI primitives and `escapeHtml`.

<!-- c2d:s7 -->
### Limitations & Improvements

**1. Dropped folder that already exists off the current page is skipped instead of merged** — *Bug or Risk*, severity **medium**
`public/assets/js/files.js` lines 2108-2134 (`jobsFromEntries`, check at 2121). The "already exists, merge into it" test looks only at `state.files`, which is one page of a paginated, sorted, searched and type-filtered listing (`listQuery`, lines 390-402). A dropped folder whose name already exists in the current directory but is not on the visible page (or is hidden by the search box or a type chip) is treated as new; `POST /fs/folder` then fails, the `catch` returns, and every file inside that folder is silently left out of the upload (only the generic folder-create error toast appears).
Fix: do not infer existence from the rendered page — attempt the create and treat a "folder already exists" refusal (409) as "merge":
```js
// before
const exists = isTop && state.files.some(f => f.isFolder && f.name === entry.name);
if (!exists) { try { await API.post('/fs/folder', { path: folderPath }); createdFolders++; } catch { return; } }
// after
try {
  await window.API.post('/fs/folder', { path: folderPath }, { silent: true });
  createdFolders++;
} catch (e) {
  if (e && e.status !== 409) { Toast.error('Folder not created', e.message); return; }
  // 409: it already exists - merge into it (uploads never overwrite)
}
```

**2. In-flight uploads are invisible after navigating away and back** — *Bug or Risk*, severity **low**
`public/assets/js/files.js` lines 2800-2822 (`init`) with 2046-2070 (`renderUploadTray` / `updateUploadRow`) and 2828-2839 (`destroy`). `destroy()` deliberately lets uploads continue and `uploads` is module-level, but `init()` never calls `renderUploadTray()`. The fresh `files.html` tray starts `hidden`, and `updateUploadRow` only patches rows that already exist, so after a router round-trip the tray stays hidden — no progress and no cancel button — until the current job finishes and `runUploads` re-renders.
Fix: call `renderUploadTray()` in `init()` after `bindEvents()`.

**3. "One at a time" upload queue is per drop, not global** — *Limitation*, severity **low**
`public/assets/js/files.js` lines 1967-1999 (`runUploads`). Each call pushes its jobs into the shared `uploads` array and runs its own `for … await` loop, so a second drop or picker selection while a batch is uploading starts a second, concurrent loop. The behaviour contradicts the "Upload jobs one at a time" doc comment and doubles bandwidth contention.
Fix: keep a single module-level drain loop (e.g. a `draining` flag; `runUploads` enqueues and starts the drain only if it is not already running), reporting per batch when its last job settles.

**4. Folder-drop read errors drop files silently** — *Bug or Risk*, severity **low**
`public/assets/js/files.js` lines 2086-2101 and 2112-2114. `readAllEntries` resolves with whatever it has read when `readEntries` errors, and `fileOf` resolves `null` on error, which `walk` ignores. A partially unreadable dropped folder is uploaded incompletely with a "complete" toast.
Fix: count skipped entries in `jobsFromEntries` and include them in `reportUploads` (e.g. "3 entries could not be read").

**5. Access-policy modal never settles when dismissed with Escape** — *Bug or Risk*, severity **low**
`public/assets/js/files.js` lines 1638-1720 (`pickAccessPolicy`). The global Escape handler in `app.js` calls `Modal.closeAll()`, which only removes `is-open`. The custom modal resolves only via its buttons or a backdrop click, so Escape leaves its promise pending forever and the hidden backdrop (with fixed ids `policyAccessMode`, `policyPublished`, `policyLocked`) in the DOM; the next open adds a second set of duplicate ids, so the `<label for>` associations point at the stale copy. The modal also re-implements `Modal.prompt`'s skeleton.
Fix: listen for Escape on the backdrop (or observe `is-open` removal) and call `finish(null)`; generate unique ids per instance.

**6. Policy prefill can overwrite the operator's edits** — *Bug or Risk*, severity **low**
`public/assets/js/files.js` lines 1709-1718. The single-item prefill `GET /admin/files/policy` resolves asynchronously after the modal is open; if the operator has already changed a field, the response overwrites it, and Save then persists values the operator did not choose.
Fix: disable the form until the prefill settles, or skip assigning fields that are already dirty (track an `input`/`change` flag).

**7. Star failures produce two toasts** — *Improvement Opportunity*, severity **low**
`public/assets/js/files.js` lines 1759-1760 (`setStars`). `API.post('/fs/star', …)` is not `{ silent: true }`, so a failure shows `api.js`'s generic error toast and then this function's own "Starred n of m / Unchanged: …" warning — unlike `pasteItems` and `setAccessPolicy`, which go silent and report once.
Fix: `window.API.post('/fs/star', { path: f.path, starred: target }, { silent: true })`.

**8. Column-hiding breakpoints duplicated between JS and CSS** — *Limitation*, severity **low**
`public/assets/js/files.js` lines 83-87 (`COLUMN_BREAKPOINTS`) and `public/assets/css/files.css` lines 1245-1265. The table minimum-width calculation must match the media queries that hide `type`/`downloads`/`modified`/`size`; they agree today, but nothing ties them together, so editing one silently mis-sizes the table.
Fix: drive the hiding from the JS-injected width sheet as well (it already emits `@media` rules at line 219), removing the `.col-*` `display:none` rules from `files.css` so there is one source.
