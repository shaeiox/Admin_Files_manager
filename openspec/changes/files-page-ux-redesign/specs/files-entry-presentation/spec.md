# Spec Delta

## Purpose

Defines how each file or folder entry is presented in the Files browser's list, grid and details drawer: which
metadata shows in which context, how types are labelled and filtered, and which actions the drawer offers.

## ADDED Requirements

### Requirement: Path Line Only Where Location Is Unknown
A list row SHALL show the entry's full path under its name only when the listing can contain entries from more
than one folder: an active search or a library view. In a plain folder listing the path line SHALL be omitted.

#### Scenario: Plain folder
- **WHEN** the operator browses `/Projects` with no search
- **THEN** rows show the name only, without `/Projects/…` beneath it

#### Scenario: Search results
- **WHEN** the operator searches "summary" from `/`
- **THEN** each result row shows its full path, e.g. `/Projects/Q4 Reports/summary.pdf`

### Requirement: Type Is Plain Text
The list's Type column SHALL show the type label as plain secondary text, not as a bordered tag. The label SHALL
keep the existing form (`Folder`, `Code · CSS`, …) so list, grid and drawer agree.

#### Scenario: A code file
- **WHEN** `sample.css` is listed
- **THEN** its Type cell reads "Code · CSS" in secondary text with no border or fill

### Requirement: Column Headers Are Not Truncated
At 1280 px wide and above, every visible column header SHALL show its whole label.

#### Scenario: Downloads column
- **WHEN** the list renders at 1280 px
- **THEN** the header reads "Downloads", not "DOWNLO…"

### Requirement: Rows Are Compact
List rows SHALL be 48 px tall (±4 px) at desktop widths with the path line hidden, and still meet a 44 px touch
target for row actions below 768 px.

#### Scenario: Row height
- **WHEN** a plain folder listing renders at 1440 px
- **THEN** each body row measures between 44 and 52 px tall

### Requirement: Phone Rows Carry Size And Date
Below 768 px, where Size and Modified columns are hidden, each row SHALL show size and relative modified time as a
secondary line under the name.

#### Scenario: Phone row
- **WHEN** `budget-2026.csv` (5 B, modified yesterday) is listed at 375 px
- **THEN** its row shows "5 B · yesterday" under the name

### Requirement: Zero-Count Type Chips Are Hidden
When the server returns per-type counts, a type chip whose count is 0 SHALL be hidden unless it is the active
filter. "All" SHALL always show. When the server returns no counts, every chip SHALL show without a figure.

#### Scenario: Folder with only folders and one document
- **WHEN** counts are `{ folder: 9, document: 1, image: 0, video: 0, … }`
- **THEN** only All, Folders and Documents chips are shown

#### Scenario: Active filter reaches zero
- **WHEN** the Images filter is active and the folder has no images
- **THEN** the Images chip stays visible and active, and the filter empty state is shown

### Requirement: Common Source Languages Are Code
The server SHALL classify common source-code extensions as type `code`, including at least c, h, cpp, hpp, cs,
kt, swift, rb, lua, dart, hs, ex, exs, ml, sol, svelte, vue, toml, ps1, in addition to the current list. F# `.fs` is
excluded: the taxonomy guard rejects any quoted `'fs'` in the controller, which already requires `fs`.

#### Scenario: C source
- **WHEN** `GET /api/v1/fs/list` lists `sample.c`
- **THEN** the item's `type` is `code`, it is counted under `counts.code`, and the Code filter includes it

### Requirement: Grid Cards Do Not Repeat Preview Absence
In grid view, a card with no preview SHALL show its type glyph without a visible "No preview for this file type"
sentence. That sentence SHALL remain available as the glyph's accessible name and SHALL still be shown in the
details drawer.

#### Scenario: Grid of code files
- **WHEN** 30 code files render in grid view
- **THEN** no card shows the visible sentence, and each card's glyph exposes "No preview for this file type" to assistive technology

### Requirement: Drawer Offers Management Actions
The details drawer SHALL offer Rename, Move and Delete permanently alongside Star and Download (file) or Open
folder (folder). Each action SHALL behave the same as its row-menu counterpart, including confirmation and
outcome reporting.

#### Scenario: Rename from the drawer
- **WHEN** the operator opens details for `readme.txt` and chooses Rename
- **THEN** the same rename prompt as the row menu opens, and on success the drawer shows the new name
