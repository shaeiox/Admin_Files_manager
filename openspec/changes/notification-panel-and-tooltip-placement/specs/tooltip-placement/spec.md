# Spec Delta

## Purpose

Tooltips on icon-only controls must be fully readable in every context the controls appear in — topbar, drawer, scroll containers, and viewport edges — without clipping or off-screen rendering.

## ADDED Requirements

### Requirement: Topbar tooltips do not clip at the viewport top
Controls in the sticky topbar SHALL use `data-tip-pos="bottom"` (or render the tooltip below the control), so the tooltip appears inside the viewport.

#### Scenario: Topbar button tooltip opens downward
- **WHEN** the user hovers or focuses a topbar control such as Refresh, view toggles, or the bell
- **THEN** its tooltip renders below the control and is not clipped by the viewport top

### Requirement: Drawer-header tooltips do not clip
Controls in the drawer header (the close button) SHALL use a placement that renders inside the viewport.

#### Scenario: Drawer close tooltip visible
- **WHEN** the user hovers or focuses the drawer close button
- **THEN** its tooltip is fully visible, opening below or beside the control

### Requirement: Scroll-container tooltips are not clipped by the container
Controls inside `overflow: auto` containers (file rows, queue rows, drawer body) SHALL use a tooltip placement that is not clipped by that container, or the tooltip SHALL be rendered outside the container's clipping context.

#### Scenario: Row action tooltip survives the scroll container
- **WHEN** the user hovers a row-level action button in the file list or the upload queue
- **THEN** the tooltip is fully visible rather than clipped by the list container

### Requirement: Tooltips are bounded
`[data-tip]::after` SHALL declare a `max-width` and SHALL wrap or ellipsize rather than pushing past the viewport edge for edge-positioned controls.

#### Scenario: Long tip stays on screen
- **WHEN** a long tooltip text is shown on a control near the right viewport edge
- **THEN** the tooltip does not extend past the viewport

### Requirement: Grid "more actions" control matches its list counterpart
The grid card's secondary action button SHALL expose the same tooltip (`data-tip`) as its list-row counterpart.

#### Scenario: Grid more-actions tooltip present
- **WHEN** the Files page renders grid cards
- **THEN** each card's secondary action button carries a `data-tip`
