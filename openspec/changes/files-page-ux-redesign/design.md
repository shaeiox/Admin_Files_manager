# Design

## Context

**Design read:** a dense admin app screen for one operator managing a storage root. The work is a light
evolution, not an overhaul: keep the brand, IA and copy voice, and remove friction and ornament.
Dials: `DESIGN_VARIANCE 3 / MOTION_INTENSITY 3 / VISUAL_DENSITY 7`. Both taste skills say they are for landing
pages, not app screens, so only their transferable rules apply here: audit first, no eyebrows, no glass or glow,
no cards inside cards, no tracked uppercase micro-labels, one primary action, and full loading, empty and error
states. Their landing-page rules (hero imagery, motion layer, picture floor) do not apply.

**Audit (2026-10-17, live at 1440x900 and 375x812, plus source):**

| Area | Observed |
|---|---|
| Header | Eyebrow "• FILE BROWSER" + 40 px "All files" + fixed subtitle. The title stays "All files" inside `/code-samples`. The path shows only as a small topbar breadcrumb. |
| Actions | Upload appears twice (topbar `#btnTopbarUpload`, header `#btnPageUpload`). |
| Toolbar | Search, view, sort and refresh sit inside a bordered, blurred card. The search field is ~240 px wide with a clipped placeholder ("Search names in this fo"). |
| Chips | Eight chips, most showing `0` (Images 0, Videos 0, Audio 0…). |
| Surfaces | Page glow gradient, then the toolbar card, then the tree card and the table card: three boxed layers. |
| Rows | ~64 px. The path line repeats the name at the root (`Archive` / `/Archive`). Type is a bordered pill on every row. The header is truncated to "DOWNLO…". |
| Taxonomy | `sample.c` reads "File · C" with a file glyph, while `sample.css` reads "Code · CSS" with a code glyph (`src/utils/fileTypes.js:31`). |
| Search copy | The placeholder says "in this folder", but `searchTree` recurses, and the empty state already says "and all its subfolders". |
| Bulk bar | Floats at the bottom with six icon-only actions. Their meaning comes only from tooltips. |
| Phone | Header + toolbar + chips + the full tree come first. The first file row sits ~1.4 screens down. Rows lose size and date. |
| Lint (taste-skill `lint.mjs`, files.html + files/layout/components css + files.js) | 55 FAIL / 68 WARN: shadow 24, hairline 20, gradient 7, mono 2, eyebrow 1, purple 1; glass 30, outlined-box 34. Table-row hairlines and the brand violet are exempt (real table; brand colour). |

What already works and must not regress: keyboard roving focus, `aria-live` announcements, skeletons, the
three empty states plus the error-with-retry state, honest preview absence, delete-outcome truthfulness,
column and tree resizers, drag-and-drop upload with the tray, and the Cut/Copy/Paste flow.

## Goals / Non-Goals

**Goals:**
- The first file row at 1440x900 sits within 220 px of the topbar (today ~270 px), and on a phone it is on the
  first screen.
- Every visible element earns its place: no repeated action, no repeated path, no zero chips.
- Pass the taste-skill lint for the Files-scoped CSS, except table hairlines and the brand accent.

**Non-Goals:**
- No change to the shared sidebar (it is byte-identical across five pages and pinned by a test), the dashboard,
  or other pages' topbars.
- No new settings (density toggle, column chooser). Add them only when someone asks.
- No storage warning colour at 96.6 %. AGENTS.md forbids a status without a threshold source.
- No destination picker for Move. The clipboard-style Cut/Paste stays the move mechanism.
- No previews. The thumbnail transformer stays absent.

## Decisions

### Wireframes

Desktop (≥1024):
```
┌ topbar ─────────────────────────────────────────────── [theme] ┐   (no Upload here)
│ Q4 Reports                                    [New folder] [Upload] │  h1 = folder
│ All files › Projects › Q4 Reports                                │  trail
│ [ Search this folder and subfolders……… ] [Type ▾|chips] [Sort] [≡|▦] [↻] │  command bar, no card
│ All 12 · Folders 3 · Documents 9                                   │  only non-zero chips
├──────────────┬───────────────────────────────────────────────────┤
│ tree         │ ☐ Name                 Size   Type        Downloads  Modified  ⋯ │
│ (tone step)  │ ☐ summary.pdf          2 B    Document·PDF  0        just now   ⋯ │  48 px rows
└──────────────┴───────────────────────────────────────────────────┘
```
With a selection the command bar becomes:
`2 selected on this page   [Download] [Move] [Copy] [Star] [Access policy] [Delete permanently]   [Clear]`

Phone (<768):
```
[☰] Files                      [theme]
Q4 Reports              [Folders] [Upload]
All files › Projects › Q4…
[ Search…………………… ] [Sort] [⋯]
☐ summary.pdf                       ⋯
  2 B · just now
```

### D1. The heading names the location; the trail moves into the header
`updateBreadcrumb` already builds the trail, and `applyLibraryView` already writes `#pageTitle`. Navigation
writes the base name into `#pageTitle` and renders the trail under it. The topbar keeps its static "Files" label
so the shared topbar markup does not diverge per page.
*Alternative:* keep the trail in the topbar and only fix the title. Rejected: the title and the path then sit
~100 px apart, and the topbar trail truncates first on narrow screens.

### D2. Remove `#btnTopbarUpload`, keep `#btnPageUpload`
The header button sits next to New folder and the content it affects. Only files.html has the topbar button
(uploads.html has its own page), so removing it changes no shared markup.
*Alternative:* keep the topbar one, drop the header one. Rejected: on phones the topbar is already crowded
(menu, title, theme).

### D3. One command bar with modes (listing → selection → clipboard)
The bulk bar's buttons move into the command bar's selection mode as labelled buttons. Their ids, handlers and
`aria-label`s stay, so wiring and tests carry over. The floating `#bulkBar` element is removed. The clipboard
strip reuses `#btnPaste` / `#btnCancelCut` with a count sentence. Below 768 px the selection actions collapse
to Download, Delete and a ⋯ menu for the rest.
*Alternative:* keep the floating bar and add labels. Rejected: it covers the last rows and the pagination, and
it is a second toolbar the operator has to find.

### D4. Chips stay chips, filtered by count
`renderChipsHtml` already hides "Other" at zero. That rule extends to every key except `all` and the active
filter. With `counts === null` nothing is hidden, which keeps the "no fabricated figure" behaviour. A Type
dropdown was considered, but it adds a click for the common case and hides the counts that are useful.

### D5. Context-dependent path line
`renderListHtml` emits `.fpath` only when `state.search` is non-empty or `state.library` is set. The grid already
omits it.

### D6. Type as text, header width fixed
`.tag` is dropped from the Type cell (the drawer badge stays). The Downloads column default width grows so its
label fits at ≥1280. Uppercase, tracked column headers become sentence-case 13 px secondary text, matching the
house "no tiny tracked caps" rule.

### D7. Flatten surfaces
Files-scoped CSS removes the page glow (`layout.css` page-header gradients, scoped by `[data-page="files"]` so
the dashboard is untouched), the toolbar card border and blur, and the tree and table card borders and shadows.
The tree column gets `--surface-2` against the listing's `--surface-1`. Overlays keep their shadows. Radius rule,
written once in files.css: interactive controls are pill, surfaces are 12 px.

### D8. Tree as a sheet below 1024 px
The existing `.tree-panel` node is reused: below 1024 px it is styled as a left sheet with a backdrop, toggled by
a new header "Folders" button, with the drawer's focus trap and inert-background pattern (`setBackgroundInert`).
`router.js` re-inits mean the listener goes through `listenGlobal` so `destroy()` removes it.
*Alternative:* a collapsible accordion above the list. Rejected: it still pushes content down and gives two
scroll regions on a phone.

### D9. Taxonomy fix lives in `fileTypes.js`
The server owns `item.type`, and the badge and the chip both read it (files.js `typeOf`). Adding extensions there
fixes the list, the grid, the drawer, the chip counts and the filter at once. The frontend `AFM.resolveType`
fallback mirrors the same list, so an item without `type` agrees.

### D10. Drawer actions reuse handlers
Rename → `renameItem`, Move → `cutItems` + close the drawer (the clipboard strip then shows), Delete →
`deleteItems`. They go in the footer behind a ⋯ menu on narrow drawers. No new code paths report outcomes.

## Risks / Trade-offs

- [In-flight `files-ui-quality` "Thumbnails Are Real Or Explicitly Unavailable"] The grid card stops showing the
  visible sentence → absence stays explicit through the glyph's accessible name and the drawer's visible
  sentence. The spec delta in this change states that, and `files.test.js` asserts the drawer copy.
- [`tooltips.test.js` pins the bulk-bar `data-tip-pos` set] Labelled buttons no longer need tips → update the
  audited set in the same task and keep tips only on icon-only controls.
- [Hiding zero chips moves chips between folders] Chip order stays fixed. Only presence changes, and the active
  chip never disappears.
- [`type` changes from `other` to `code` for some files] Any consumer filtering `other` sees fewer items. The
  File Portal does not read `type`. Recorded in CONTRACTS.md.
- [Removing the topbar Upload hurts muscle memory] The header button sits in the same corner region, and the
  drop overlay still works page-wide.
- [Selection mode hides search while items are selected] That is deliberate: actions act on the selection.
  Clear and Escape restore the bar, and the search value is kept.

## Migration Plan

Frontend-only apart from the extension list, so it ships in one release. Rollback is the previous release
directory (ADR-008). No store or schema change.
