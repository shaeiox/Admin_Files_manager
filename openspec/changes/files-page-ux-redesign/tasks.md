# Tasks

## 1. Type taxonomy

- [x] 1.1 Add the source-code extensions from the spec to `code` in `src/utils/fileTypes.js` and mirror them in the frontend `AFM.resolveType` table; verify with a services test that `sample.c` lists as `type: 'code'` and is counted in `counts.code`
- [x] 1.2 Update the type taxonomy table in `docs/CONTRACTS.md` and note the `other` → `code` reclassification; verify the doc lists every extension in `fileTypes.js`

## 2. Header and actions

- [x] 2.1 Write the current folder's base name (or "All files" / library title) into `#pageTitle` on every navigation and render the breadcrumb trail under it; verify in `files.test.js` that `/Projects/Q4 Reports` yields heading "Q4 Reports" and a three-segment trail
- [x] 2.2 Remove the eyebrow and fixed subtitle; keep the library-view note; verify in `files.test.js` that no `.page-eyebrow` renders on files.html and that `?view=starred` shows its note
- [x] 2.3 Remove `#btnTopbarUpload` and its handler; verify that exactly one picker-opening control renders outside the empty state, and update the pinned selector assertions in `files.test.js`

## 3. Command bar

- [x] 3.1 Replace the toolbar card with an unboxed command bar row (search, chips/filter, sort, view, refresh); verify at 1440x900 in the browser that the first row starts ≤220 px below the topbar
- [x] 3.2 Change the search placeholder and label to "Search this folder and subfolders"; verify with a `files.test.js` string assertion
- [x] 3.3 Move the bulk actions into a selection mode of the command bar with text labels, keeping ids, handlers and aria-labels; remove the floating `#bulkBar`; verify that selecting, Clear and Escape restore the previous bar state, and update `tooltips.test.js`'s audited set
- [x] 3.4 Show pending Cut/Copy as an in-bar strip with count, Paste here and Cancel that survives navigation; verify with a `files.test.js` case that cuts two items, navigates and asserts the strip text

## 4. Entry presentation

- [x] 4.1 Render `.fpath` only during search or a library view; verify both branches in `files.test.js`
- [x] 4.2 Render Type as plain secondary text, use sentence-case column headers, and widen the Downloads default so it is not truncated at 1280 px; verify with a browser check at 1280 px
- [x] 4.3 Set desktop row height to 48 px and add the phone secondary line (size · modified); verify the measured row height at 1440 and the line text at 375 in the browser
- [x] 4.4 Hide zero-count chips except All and the active filter, and leave all chips visible when counts are null; verify the three cases in `files.test.js`
- [x] 4.5 Drop the visible preview-absence sentence from grid cards and keep it as the glyph's accessible name and in the drawer; verify in `files.test.js` and recheck the escaping tests still pass
- [x] 4.6 Add Rename, Move and Delete permanently to the drawer footer by reusing the row-menu handlers; verify that renaming from the drawer updates the drawer title and that Delete shows the same confirm copy

## 5. Surfaces and small screens

- [x] 5.1 Scope out the page glow, resting blur and shadows for `[data-page="files"]`, merge tree and listing into one panel with a tone step, and record the radius rule in files.css; verify with taste-skill `lint.mjs` on files.css (no gradient/glass/shadow FAIL outside overlays) and computed styles in the browser
- [x] 5.2 Below 1024 px, turn the tree into a sheet opened from a header "Folders" button, with a focus trap, Escape/backdrop close, close-on-navigate, and listeners removed in `destroy()`; verify at 375x812 that the first row is on the first screen and that focus returns to the opener
- [x] 5.3 Below 768 px, collapse selection actions to Download, Delete and ⋯; verify every action stays reachable by keyboard

## 6. Integration

- [x] 6.1 Run `npm test` and verify it exits 0 with the updated suites
- [x] 6.2 Capture before/after screenshots at 1440x900 and 375x812 in light and dark themes, and verify against the design.md audit table that each listed issue is resolved
- [x] 6.3 Update `docs/REPO_MAP.md` for moved or removed selectors (`#bulkBar`, `#btnTopbarUpload`) and run `graphify update .`; verify that no doc references a removed id
