# Files Accessibility

## Purpose

Requires the Files page's list, grid, tree, breadcrumb, drawer, chips and sort headers to be operable by keyboard and to expose correct semantics to assistive technology, meeting WCAG 2.1 AA. This capability exists because rows and cards carried click handlers with no keyboard equivalent, the drawer announced itself as hidden while visible, breadcrumb segments and tree items were non-interactive elements, and no checkbox or chip had an accessible name.

## ADDED Requirements

### Requirement: Every File Entry Is Keyboard Operable

Every file row and card SHALL be reachable by keyboard and activatable without a pointer.

#### Scenario: Entries are in the tab order

- **WHEN** the operator tabs through the page
- **THEN** every rendered entry is focusable
- **AND** the focus indicator is visible against both light and dark themes

#### Scenario: Entries are activatable by keyboard

- **WHEN** a focused row or card is activated with the keyboard
- **THEN** the same action occurs as with a pointer: a folder navigates, a file opens its details

#### Scenario: The focus model does not create excessive tab stops

- **WHEN** a page of entries is rendered
- **THEN** the number of tab stops per page is bounded by a documented pattern
- **AND** the pattern used is recorded rather than chosen per implementation

#### Scenario: Embedded controls remain separately operable

- **WHEN** a row contains a checkbox and action buttons
- **THEN** those controls are individually focusable and activatable
- **AND** activating one does not also activate the row

#### Scenario: Hover-revealed controls are visible on focus

- **GIVEN** row action buttons are visually hidden until hover
- **WHEN** a row action button receives keyboard focus
- **THEN** the button becomes visible
- **AND** a pointerless device is not the only case handled

### Requirement: Breadcrumb Segments Are Interactive Elements

Every breadcrumb segment SHALL be a natively interactive element with an accessible name and keyboard operation.

#### Scenario: Segments are focusable and activatable

- **WHEN** the operator tabs to a breadcrumb segment and activates it
- **THEN** navigation to that segment's folder occurs

#### Scenario: Current segment is identified

- **WHEN** the breadcrumb renders
- **THEN** the current segment is identified as current for assistive technology, not only by a visual style

#### Scenario: Breadcrumb is a labelled navigation landmark

- **WHEN** the breadcrumb renders
- **THEN** it exposes an accessible name identifying it as a breadcrumb

### Requirement: The Folder Tree Is Navigable And Announced

The folder tree SHALL expose its hierarchical structure and its expansion state.

#### Scenario: Tree is a labelled tree structure

- **WHEN** the tree renders
- **THEN** it exposes a tree role with a label
- **AND** each node exposes a tree-item role carrying its path

#### Scenario: Expansion state is announced

- **WHEN** a node has children
- **THEN** its expand control exposes whether it is currently expanded

#### Scenario: Active node is announced

- **WHEN** a node represents the current folder
- **THEN** it exposes that state to assistive technology, not only through a class name

#### Scenario: Tree nodes are keyboard operable

- **WHEN** the operator focuses a tree node and activates it
- **THEN** navigation occurs
- **AND** the expand control is separately operable

### Requirement: The Details Drawer Is A Modal Dialog

The details drawer SHALL expose dialog semantics, manage focus correctly, and announce its visibility truthfully.

#### Scenario: Drawer is announced as a dialog

- **WHEN** the drawer opens
- **THEN** it exposes a dialog role and modal state

#### Scenario: Visibility state is never stale

- **WHEN** the drawer opens and closes
- **THEN** its hidden state is updated on both transitions
- **AND** it is never reported as hidden while visible

#### Scenario: Focus enters the drawer

- **WHEN** the drawer opens
- **THEN** focus moves to a defined element inside it
- **AND** the element focused is the dialog itself or its first interactive control

#### Scenario: Focus is trapped while open

- **WHEN** focus is inside the open drawer
- **THEN** it cannot move outside the drawer by keyboard alone

#### Scenario: Focus returns to the trigger

- **WHEN** the drawer closes
- **THEN** focus returns to the element that opened it

#### Scenario: A backdrop accompanies the open drawer

- **WHEN** the drawer is open
- **THEN** a backdrop covers the page
- **AND** content behind the drawer is not simultaneously operable

#### Scenario: Drawer can be closed without a pointer

- **WHEN** the drawer is open
- **THEN** it can be dismissed by keyboard

### Requirement: Escape Is Scoped

The Escape key SHALL close only the topmost dismissible layer, and SHALL have no effect when there is nothing to dismiss.

#### Scenario: Escape closes an open drawer

- **GIVEN** the drawer is open and no modal is above it
- **WHEN** the operator presses Escape
- **THEN** the drawer closes

#### Scenario: Escape does not act on a closed drawer

- **GIVEN** the drawer is closed
- **WHEN** the operator presses Escape
- **THEN** nothing happens

#### Scenario: Escape does not reach past an open modal

- **GIVEN** a confirmation modal is open above the drawer
- **WHEN** the operator presses Escape
- **THEN** the topmost layer is dismissed
- **AND** the drawer beneath it is not also dismissed

### Requirement: Sort Headers Are Accessible Controls

Sortable column headers SHALL be focusable, keyboard operable, and expose the current sort state.

#### Scenario: Headers are focusable and activatable

- **WHEN** the operator focuses a sortable header and activates it
- **THEN** the sort changes

#### Scenario: Sort state is announced

- **WHEN** a table is sorted by a column
- **THEN** that column's header exposes the sort state and direction to assistive technology

#### Scenario: Sort indicator reflects the real direction

- **WHEN** the current sort direction is ascending
- **THEN** the indicator denotes ascending
- **AND** it is not a glyph that reads as descending in every direction

#### Scenario: The sort menu reflects the active sort

- **WHEN** the sort changes by any means
- **THEN** the sort menu shows which field and direction are active

### Requirement: Every Control Has An Accessible Name

Every checkbox, chip and icon-only button SHALL expose an accessible name.

#### Scenario: Row checkboxes are named

- **WHEN** a row checkbox is exposed to assistive technology
- **THEN** its name identifies the entry it selects

#### Scenario: Select-all checkbox is named with its scope

- **WHEN** the header checkbox is exposed
- **THEN** its name states what selecting it selects

#### Scenario: Filter chips expose their pressed state

- **WHEN** a filter chip is rendered
- **THEN** it exposes whether it is currently applied

#### Scenario: Icon-only buttons are named

- **WHEN** a button renders only an icon
- **THEN** it exposes a text name

### Requirement: No Incorrect ARIA

A role SHALL NOT be applied where the required companion roles and states are absent.

#### Scenario: Tab semantics are complete or absent

- **WHEN** a group is styled as a tab list
- **THEN** its children expose the tab role and selected state, and a corresponding panel exists
- **AND** otherwise the tab roles are removed rather than left incomplete

#### Scenario: Roles match actual behaviour

- **WHEN** a role is applied to an element
- **THEN** the element's behaviour matches what that role promises
- **AND** a non-interactive element is not given an interactive role without keyboard support

### Requirement: Dynamic Updates Are Announced

Content that changes in response to an operator action SHALL be announced where the change is not otherwise conveyed visually.

#### Scenario: Result count changes are announced

- **WHEN** a listing reload changes the number of results
- **THEN** the change is announced through a live region rather than conveyed by visual change alone

#### Scenario: Bulk action bar appearing is announced

- **WHEN** the bulk action bar becomes visible
- **THEN** its appearance is announced

#### Scenario: Live regions are not overused

- **WHEN** announcements are made
- **THEN** they are limited to changes the operator would otherwise miss
- **AND** they do not re-announce unchanged content

## Regression Requirements

- A test SHALL assert every rendered row and card is focusable and carries a tree-item-equivalent or button-equivalent role.
- A test SHALL assert the drawer's hidden state is updated on open and on close, and is never left contradicting its visibility.
- A test SHALL assert opening the drawer moves focus inside it and closing it restores focus to the trigger.
- A test SHALL assert Escape with the drawer closed performs no state change.
- A test SHALL assert every checkbox and chip in the rendered output carries a non-empty accessible name.
- A test SHALL assert each sortable header exposes a sort state and direction.
- A test SHALL assert the view toggle either exposes complete tab semantics or exposes no tab roles.
- A test SHALL assert no element carries an interactive role without a keyboard handler.
- `docs/REPO_MAP.md` SHALL record the chosen focus model for the file list, so the decision survives this change.