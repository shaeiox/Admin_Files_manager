# Files UI Quality

## Purpose

Corrects the visual and interaction defects that hide data or mislead the operator: a table that clips rather than scrolls, absent thumbnails, indistinguishable empty and loading states, inline styles bypassing the design tokens, colliding sticky headers, a "select all" that does not select all, and an irreversible destructive action communicated without naming what it destroys.

## ADDED Requirements

### Requirement: Wide Content Is Reachable

The listing SHALL NOT clip content that exceeds its container.

#### Scenario: The table scrolls horizontally

- **WHEN** the table's content is wider than its container
- **THEN** the container scrolls horizontally
- **AND** no column or cell is permanently unreachable

#### Scenario: Rounded corners do not require clipping

- **WHEN** the table container uses rounded corners
- **THEN** the clipping that achieves them does not also prevent scrolling

#### Scenario: Long names are fully available

- **WHEN** an entry's name is truncated for display
- **THEN** the full name is available on hover and to assistive technology

#### Scenario: Column hiding at narrow widths is deliberate

- **WHEN** a breakpoint hides one or more columns
- **THEN** the hidden columns' information remains reachable at that width by another means
- **AND** the hiding is not the only way that information can be obtained

### Requirement: Thumbnails Are Real Or Explicitly Unavailable

Previewable entries SHALL render a real preview, and entries without one SHALL render an explicit unavailable state rather than a generic glyph or a broken image.

#### Scenario: Image entries render a preview

- **WHEN** an image entry is rendered in the grid or in the drawer
- **THEN** a preview of that image is rendered

#### Scenario: Preview endpoint is bounded

- **WHEN** a preview is requested
- **THEN** the generated preview is bounded in both dimensions
- **AND** the request is refused for a non-image without reading the file's bytes for transformation

#### Scenario: Non-previewable entries show an explicit state

- **WHEN** an entry's type has no preview
- **THEN** the interface states that a preview is unavailable
- **AND** it does not imply a preview failed to load

#### Scenario: A missing preview never breaks the card

- **WHEN** a preview is refused or fails
- **THEN** the card renders its fallback state
- **AND** no broken-image indicator is shown

#### Scenario: The download endpoint is not used as a preview source

- **WHEN** a preview is rendered
- **THEN** it does not rely on the download endpoint's content type, which forces a non-renderable type for every file

### Requirement: States Are Visually Distinct

Loading, empty, no-search-results, filter-mismatch and error SHALL be visually distinguishable.

#### Scenario: Loading preserves layout

- **WHEN** a listing is loading
- **THEN** a skeleton occupying the same footprint as the loaded content is shown
- **AND** the surrounding layout does not jump when content arrives

#### Scenario: No-results differs from no-files

- **WHEN** a search yields no matches in a folder that contains files
- **THEN** the message says so and offers to clear the search
- **AND** it is distinct from the message shown for a genuinely empty folder

#### Scenario: Filter mismatch differs from no-files

- **WHEN** a type filter yields no matches in a folder that contains files
- **THEN** the message names the active filter and offers to clear it

#### Scenario: Empty folder offers the appropriate next action

- **WHEN** a folder is genuinely empty
- **THEN** the offered action matches the situation
- **AND** a search or filter offer is not shown when none is active

#### Scenario: Error state offers a working retry

- **WHEN** the error state is shown
- **THEN** it offers a retry that re-issues the failed request

### Requirement: Styling Comes From The Token System

No component in the Files page SHALL carry hardcoded style values in markup or in inline style attributes.

#### Scenario: No inline style attributes

- **WHEN** the page markup and the page module are inspected
- **THEN** no element carries a hardcoded spacing, colour, or typography value

#### Scenario: Dynamic per-item styling is expressed as data

- **WHEN** a per-item visual offset is required, such as a staggered appearance
- **THEN** it is expressed as a data attribute or a class, not as an inline style
- **AND** the offset is bounded so a large page does not produce a long cascade

#### Scenario: Existing token primitives are reused

- **WHEN** a new surface is added
- **THEN** existing spacing, colour, radius and typography tokens are used
- **AND** no new one-off value is introduced

### Requirement: Sticky Surfaces Do Not Collide

Sticky positioning SHALL NOT cause two sticky surfaces to overlap each other.

#### Scenario: Toolbar and tree panel do not overlap

- **WHEN** both the toolbar and the tree panel are sticky and the page is scrolled
- **THEN** they do not occupy the same screen region

#### Scenario: Sticky table header remains visible below the toolbar

- **WHEN** the listing is scrolled
- **THEN** the table header remains visible and is not hidden behind the sticky toolbar

#### Scenario: Sticky behaviour is disabled at narrow widths

- **WHEN** the viewport is below the width at which sticky stacking is viable
- **THEN** sticky positioning is disabled rather than left to collide

### Requirement: Destructive Actions State Their Scope

A confirmation for an irreversible destructive action SHALL name what will be destroyed and SHALL state that it cannot be undone.

#### Scenario: Confirmation names the count

- **WHEN** a delete confirmation is shown
- **THEN** it states how many entries will be deleted

#### Scenario: Confirmation names the affected entries

- **WHEN** a delete confirmation is shown
- **THEN** it identifies the entries or folders that will be deleted

#### Scenario: Confirmation states irreversibility

- **WHEN** a delete confirmation is shown
- **THEN** it states that the deletion is permanent and cannot be undone

#### Scenario: Irreversibility is not contradicted elsewhere

- **WHEN** the interface is inspected
- **THEN** no control offers an undo, a restore, or a recovery for a deleted entry
- **AND** no entry offers a trash view

#### Scenario: Confirmation copy matches actual behaviour

- **WHEN** the confirmation describes the operation
- **THEN** the described scope matches the paths the operation transmits

### Requirement: Dense Controls Fit Narrow Viewports

The bulk action bar SHALL remain usable at the narrowest supported viewport.

#### Scenario: Bulk bar fits without clipping

- **WHEN** the viewport is at the narrowest supported width
- **THEN** every bulk control is visible and hit-testable
- **AND** no control is clipped or pushed outside the viewport

#### Scenario: Bulk bar does not overlap content

- **WHEN** the bulk bar is visible at a narrow viewport
- **THEN** it does not permanently obscure the content beneath it

### Requirement: Detail Views Are Consistent

Information available in one view of an entry SHALL be reachable in the equivalent view.

#### Scenario: Copyable path is reachable from the drawer

- **WHEN** an entry's location is shown in the drawer
- **THEN** it can be copied from there, as it can from the entry's context menu

#### Scenario: Type badge and filter agree in every view

- **WHEN** an entry's type is shown in the list, the grid and the drawer
- **THEN** the same classification is shown in all three

## Regression Requirements

- A test SHALL assert the table container permits horizontal scrolling rather than clipping.
- A test SHALL assert every rendered truncated name carries a full-name alternative.
- A test SHALL assert the preview endpoint refuses a non-image and returns an explicit unavailable marker.
- A test SHALL assert the unavailable-preview state renders for a non-previewable type.
- A source-level test SHALL assert no `style="` attribute remains in `files.html` and no inline style assignment remains in `files.js`.
- A test SHALL assert the staggered appearance offset is bounded.
- A source-level test SHALL assert the destructive confirmation contains a count, an irreversibility statement, and no undo affordance exists anywhere in the markup.
- A test SHALL assert every bulk control is reachable at the narrowest supported viewport.
- A test SHALL assert the drawer exposes a copy affordance for the entry's location.