# Proposal

## Why

The Files page works correctly (files-page-correctness closed 87/87 tasks) but it is hard to use: on a 1440x900
screen the header, toolbar and chips take ~270 px before the first row, the title says "All files" inside every
folder, there are two Upload buttons, each root row repeats its own name as a path, and on a phone the whole
folder tree sits above the list so the first file appears after about a screen and a half. A review against the
taste-skill rules (eyebrow, glass, gradients, outlined cards in cards, tracked uppercase labels) found the same
problems from the visual side.

## What Changes

- **Location-first header.** The `h1` names the folder being browsed (or the library view). The breadcrumb trail
  moves from the topbar into the header, under the title. The "• FILE BROWSER" eyebrow and the fixed subtitle
  go. Library views keep a one-line scope note, because their scope is not obvious.
- **One Upload action.** The page-header Upload stays as the single primary action. The topbar duplicate on
  files.html goes. New folder becomes a secondary button next to it.
- **One command bar.** Search, type filter, sort, view toggle and refresh share one flat row with no card around
  it. When items are selected, the same row turns into the selection toolbar with text labels (Download, Move,
  Copy, Star, Access policy, Delete), so the bulk bar no longer floats at the bottom with six icon-only buttons.
  Pending Cut/Copy shows as a strip in the same place ("2 items ready to move · Paste here · Cancel").
- **Honest search copy.** The search placeholder says "Search this folder and subfolders", which is what the
  server does (`FileSystemService.searchTree`). Today it says "in this folder".
- **Quieter rows.** The path line under the name only appears where location is not already known: search
  results and library views. Type is shown as plain muted text, not a pill. Rows drop from ~64 px to 48 px. The
  Downloads header stops truncating ("DOWNLO…").
- **Type chips show only what exists.** A chip with a count of 0 is hidden unless it is the active filter (the
  rule that already applies to "Other"). With no counts from the server, every chip shows, as it does today.
- **Code taxonomy fix.** `src/utils/fileTypes.js` lists C, C++, C#, Kotlin, Swift, Ruby, Lua, Dart, Haskell,
  Elixir, OCaml, Solidity, Svelte, Vue, TOML, PowerShell and similar as `code`. Today `sample.c` reads
  "File · C" next to "Code · CSS".
- **Flat surfaces.** One browser surface holds the tree and the list, split by a tone step instead of two bordered
  cards inside a page-level glow. Page-level gradients, backdrop blur on resting surfaces, and shadows on resting
  surfaces are removed from the Files page. The brand accent stays.
- **Tree on small screens.** Below 1024 px the folder tree is not stacked above the list. A "Folders" button in
  the header opens it as a sheet. On a phone, the first file row shows on the first screen and each row shows
  size and modified time on a second line.
- **Drawer actions.** The details drawer footer gets Rename, Move and Delete next to Star and Download/Open, so an
  item can be managed without going back to its row menu.

None of these change the API surface. The type fix changes the `type` value (`other` → `code`) for the newly
listed extensions. That is a classification fix inside v1, not a new field.

## Capabilities

### New Capabilities
- `files-browser-layout`: Page structure of the Files browser: what the header states, where the primary actions
  live, the command bar and its selection/clipboard modes, and how the tree and the list are arranged at each
  width.
- `files-entry-presentation`: How each entry is shown in the list, grid and drawer: which metadata appears in
  which context, type labelling, filter chip visibility, and the actions offered in the drawer.

### Modified Capabilities
- None in `openspec/specs/`. The in-flight `files-page-correctness` deltas (`files-ui-quality`,
  `surface-honesty`, `files-accessibility`) stay in force. Where this change touches them, design.md says how
  it stays consistent.

## Impact

- Frontend: `public/files.html`, `public/assets/js/files.js`, `public/assets/css/files.css`; Files-scoped rules
  in `layout.css` (page header, glow). The shared sidebar stays byte-identical.
- Backend: `src/utils/fileTypes.js` (extension list only).
- Tests: `test/frontend/files.test.js` (five assertions pin selectors that move), `test/frontend/tooltips.test.js`
  (bulk-bar tips become labelled buttons), and a services test for the new code extensions.
- Docs: `docs/CONTRACTS.md` (type taxonomy table), `docs/REPO_MAP.md` if any selector map changes.
- No new dependencies. No API, auth, or storage changes.
