# Selection And Pagination Integrity

## Purpose

Defines how a selection survives a list reload and how page numbers behave when the result set shrinks underneath them. This capability exists because every reload unconditionally cleared the selection, and because deleting the last row on the final page left the operator on a valid page number showing an empty table.

## ADDED Requirements

### Requirement: Selection Survives Non-Navigational Reloads

A reload triggered by sorting, paging, changing page size, or changing the filter SHALL preserve the selection, pruned to entries still present.

#### Scenario: Sorting preserves the selection

- **GIVEN** several entries are selected
- **WHEN** the operator changes the sort
- **THEN** the same entries remain selected
- **AND** the bulk bar still reports the same count

#### Scenario: Changing page size preserves the selection

- **WHEN** the operator changes the number of rows shown while entries are selected
- **THEN** the selection is preserved for entries still rendered

#### Scenario: Changing the type filter prunes the selection

- **GIVEN** a selection spanning entries of different types
- **WHEN** the operator applies a type filter
- **THEN** entries no longer rendered are dropped from the selection
- **AND** the bulk bar count equals the number of currently selected, rendered entries
- **AND** the bulk bar states that scope rather than implying the whole filtered set

#### Scenario: Selection never references an unrendered entry

- **WHEN** any reload completes
- **THEN** every id in the selection corresponds to an entry currently rendered
- **AND** no bulk action can therefore act on an entry the operator cannot see

### Requirement: Navigation And Mutation Clear Selection Deliberately

Selection SHALL be cleared on navigation to a different folder and after a mutation, and that clearing SHALL be intentional rather than a side effect of reload bookkeeping.

#### Scenario: Folder navigation clears the selection

- **WHEN** the operator navigates to a different folder
- **THEN** the selection is cleared

#### Scenario: Post-mutation reload clears the selection

- **WHEN** a mutation succeeds and the listing reloads
- **THEN** the selection is cleared
- **AND** the bulk bar is hidden

#### Scenario: A failed load clears the selection

- **WHEN** a reload fails
- **THEN** the selection is cleared, because no rendered entries remain to select

### Requirement: Selection Reflects Rendered State In Both View Modes

Selection SHALL be reflected consistently in list and grid view, and switching view SHALL NOT silently discard it.

#### Scenario: Grid and list agree on selection

- **WHEN** entries are selected in one view and the view is switched
- **THEN** the same entries are selected in the other view

#### Scenario: Row and card visual state tracks the selection

- **WHEN** an entry is selected
- **THEN** both its row and its card, where present, show the selected state

#### Scenario: Header checkbox reflects partial selection

- **GIVEN** some but not all rendered entries are selected
- **WHEN** the header checkbox is rendered
- **THEN** it is indeterminate
- **AND** it is not reported as fully selected

### Requirement: Select-All States Its Scope

The select-all control SHALL either act on the entire filtered result set or state that it acts on the current page. It SHALL NOT imply a scope it does not implement.

#### Scenario: Scope is stated in the control's accessible name and tooltip

- **WHEN** the select-all control is rendered
- **THEN** its accessible name states what selecting it will select

#### Scenario: Bulk count matches what will be acted on

- **WHEN** the bulk bar is visible
- **THEN** the reported count equals the number of entries that the bulk action will actually operate on

#### Scenario: Selection is keyboard operable

- **WHEN** the operator focuses and activates a row or card checkbox
- **THEN** the entry is selected and the bulk bar updates

### Requirement: Pagination Survives A Shrinking Result Set

When the result set shrinks, the current page SHALL remain valid.

#### Scenario: Deleting the last entry on the final page moves to the new final page

- **GIVEN** the operator is on the final page, which contains exactly one entry
- **WHEN** that entry is deleted
- **THEN** the operator lands on the new final page
- **AND** that page shows its entries rather than an empty table

#### Scenario: Filtering away every entry on the current page lands on a valid page

- **WHEN** a filter or search yields no entries on the current page but entries exist elsewhere in the result set
- **THEN** the page number is corrected to a page that has entries

#### Scenario: Footer counts are never inverted

- **WHEN** the footer renders its displayed range
- **THEN** the start of the range is less than or equal to the end
- **AND** a zero-result listing reports a range of zero rather than a negative or inverted one

#### Scenario: Page-size change returns to the first page

- **WHEN** the operator changes the number of rows shown
- **THEN** the page number resets to the first page
- **AND** no empty page is shown

#### Scenario: Pagination controls reflect the true total

- **WHEN** pagination controls are rendered
- **THEN** the number of pages is derived from the total matching count, not from the number of currently loaded entries

### Requirement: Bulk Action Inputs Are Derived From What Is Sent

Any count shown for a bulk action SHALL be derived from the set of paths the action will transmit, not from a selection set that may diverge from it.

#### Scenario: Bulk delete count equals the transmitted path count

- **WHEN** a bulk delete is confirmed
- **THEN** the count shown equals the number of paths included in the request
- **AND** the reported deleted count equals the number the response lists as deleted

#### Scenario: An action invoked without a resolvable target does nothing

- **WHEN** an action is dispatched with an identifier that matches no rendered entry and is not one of the folder-scoped actions
- **THEN** nothing is performed
- **AND** no error is raised

#### Scenario: Actions that require a pointer event receive a defined fallback

- **WHEN** an action that positions a menu is dispatched without a pointer event
- **THEN** it falls back to a defined position rather than dereferencing an absent event

## Regression Requirements

- A test SHALL select entries, change the sort, and assert the selection survives. This test fails against the current code.
- A test SHALL select entries, change the filter to one that hides some of them, and assert the selection is pruned to the rendered set.
- A test SHALL switch view with a selection active and assert it is preserved.
- A test SHALL delete the only entry on the final page and assert the operator lands on a page with entries and that the footer range is not inverted.
- A test SHALL assert the footer reports a range of zero for an empty result rather than an inverted range.
- A test SHALL dispatch an action with an unknown identifier and assert it returns without throwing.
- A test SHALL assert the select-all control's accessible name states its scope.