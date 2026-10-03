# Navigation State Consistency

## Purpose

Defines a single owner for the Files page's navigation state — current folder, page, filter, search, breadcrumb and tree highlight — so that all navigation entry points produce the same result. This capability exists because five entry points each mutated a different subset of that state, so the tree highlighted the folder the operator had left, the search box retained text that was no longer applied, and a folder created from the tree context menu appeared in the wrong place.

## ADDED Requirements

### Requirement: One Owner For Navigation State

All navigation SHALL pass through a single function that owns every piece of navigation state. No navigation entry point may set navigation state directly.

#### Scenario: Every entry point produces the same state

- **WHEN** navigation occurs by tree selection, breadcrumb selection, row activation, context-menu activation, or an in-drawer path link
- **THEN** the resulting current folder, page, filter, search, breadcrumb and tree highlight are identical to what the single owner produces for that path

#### Scenario: Navigation is idempotent

- **WHEN** navigation is requested for the folder already displayed
- **THEN** no reload is triggered and no state churn occurs

#### Scenario: Filter and search reset policy is explicit

- **WHEN** navigation occurs
- **THEN** the page number resets to the first page
- **AND** whether the type filter and search reset is decided by the single owner, not by each caller
- **AND** a caller cannot accidentally reset them when it meant to preserve them

### Requirement: The Tree Reflects The Current Folder

The folder tree SHALL indicate which folder is currently displayed, from whichever entry point navigation occurred.

#### Scenario: Tree highlight follows every navigation path

- **WHEN** navigation occurs by breadcrumb, row activation, or context menu
- **THEN** the tree node for the current folder carries the active state
- **AND** no other node carries it

#### Scenario: Root is highlighted at the root

- **WHEN** the current folder is the root
- **THEN** the root tree node carries the active state

#### Scenario: Highlight survives a tree reload

- **WHEN** the tree is reloaded after a create, rename or delete
- **THEN** the active node reflects the current folder
- **AND** the highlight is derived from navigation state rather than re-established by the click that triggered the reload

### Requirement: Tree Expansion Is Persisted State

Which tree nodes are expanded SHALL be stored in navigation state and read by the tree renderer, rather than being re-derived from node depth at render time.

#### Scenario: Expansion survives a tree reload

- **GIVEN** the operator has expanded a nested folder
- **WHEN** the tree reloads because of a create, rename or delete elsewhere
- **THEN** that folder is still expanded

#### Scenario: Caret toggles persisted state

- **WHEN** the operator activates a node's expand control
- **THEN** the expansion state for that node changes
- **AND** the change survives the next tree render

#### Scenario: Initial expansion is a state initialisation

- **GIVEN** no expansion state has been recorded
- **WHEN** the tree first renders
- **THEN** the default expansion is written into state
- **AND** it is not a special case inside the renderer

### Requirement: Deep Paths Remain Navigable

When the folder tree does not contain the current folder, the operator SHALL still be able to see where they are and navigate from there.

#### Scenario: Breadcrumb is authoritative past the tree's depth

- **GIVEN** the current folder is deeper than the tree represents
- **THEN** the breadcrumb shows the full path
- **AND** every breadcrumb segment is operable
- **AND** the tree does not claim to represent a hierarchy it cannot show

#### Scenario: Tree depth is a documented, tested limit

- **WHEN** the tree is built
- **THEN** the depth at which it stops descending is a documented constant
- **AND** it is covered by a test asserting the exact depth reached

#### Scenario: Operator is not left disoriented

- **WHEN** the current folder is absent from the tree
- **THEN** the page does not present the tree as the complete picture of the hierarchy without qualification
- **AND** the breadcrumb supplies the missing context

### Requirement: The Search Term Is Represented In Both Places

The search term SHALL be held in one place, and the search input SHALL be updated whenever that term changes, including on every navigation path.

#### Scenario: Navigation clears the search input

- **WHEN** navigation occurs
- **THEN** the search input's value matches the search term in state
- **AND** it is not left displaying text that is no longer applied

#### Scenario: Typing updates state

- **WHEN** the operator types in the search input
- **THEN** the search term in state matches the input's value

#### Scenario: Clear-filters updates both

- **WHEN** filters are cleared from the empty state
- **THEN** both the state and the input reflect the cleared search

### Requirement: Pending Search Is Cancelled By Navigation

A debounced search request that has not yet fired SHALL be cancelled when navigation occurs, so it cannot apply a stale term to a different folder.

#### Scenario: Typing then immediately navigating does not apply the stale term

- **GIVEN** the operator has typed into the search input and the debounce has not yet elapsed
- **WHEN** navigation occurs
- **THEN** the pending search does not fire against the new folder
- **AND** the listing for the new folder reflects the cleared search, not the typed one

#### Scenario: The debounce handle is retained

- **WHEN** the search input's debounce is created
- **THEN** its pending handle is retained so it can be cancelled
- **AND** it is not discarded, which would make cancellation impossible

### Requirement: Folder Creation Is Scoped To Its Target

Creating a folder from a folder-tree context menu SHALL create it inside the right-clicked node, not inside whatever folder happens to be displayed.

#### Scenario: Tree context-menu creation uses the right-clicked node

- **WHEN** the operator chooses "create subfolder" from a tree node's context menu
- **THEN** the new folder is created inside that node's path

#### Scenario: Toolbar creation uses the displayed folder

- **WHEN** the operator creates a folder from the toolbar
- **THEN** the new folder is created inside the currently displayed folder

#### Scenario: Root is a valid target for both

- **WHEN** creation is invoked on the root node
- **THEN** the new folder is created at the root

#### Scenario: Success refreshes the tree and the listing

- **WHEN** a folder is created
- **THEN** the tree is reloaded so the new folder is navigable
- **AND** the listing is reloaded when the new folder is in the displayed folder

### Requirement: Rename And Delete Of The Current Folder Update Navigation

When the folder currently displayed is renamed or deleted, navigation state SHALL be corrected rather than left pointing at a path that no longer exists.

#### Scenario: Renaming an ancestor of the current folder rewrites the path

- **WHEN** the displayed folder is inside a folder that is renamed
- **THEN** the current path is rewritten to the new prefix
- **AND** the breadcrumb reflects the new path

#### Scenario: Deleting an ancestor of the current folder navigates to a surviving parent

- **WHEN** the displayed folder is inside a folder that is deleted
- **THEN** navigation moves to the deleted folder's parent
- **AND** the listing reloads for that parent

#### Scenario: An unrelated rename does not move the operator

- **WHEN** a folder that does not contain the displayed folder is renamed
- **THEN** the current path is unchanged

#### Scenario: Prefix matching respects path boundaries

- **GIVEN** a displayed path whose text is a prefix of another path's text without a separator boundary
- **WHEN** an unrelated folder is renamed or deleted
- **THEN** the displayed path is not treated as being inside it

## Regression Requirements

- A test SHALL navigate by each of the five entry points and assert the tree's active node is the current folder in every case. This test fails against the current code for four of the five paths.
- A test SHALL expand a nested tree node, trigger a tree reload, and assert it is still expanded.
- A test SHALL navigate while a debounced search is pending and assert the stale term is not applied.
- A test SHALL invoke folder creation from a tree context menu on a non-displayed node and assert the new folder's path is inside that node.
- A test SHALL navigate by breadcrumb with a search term active and assert the search input is cleared.
- A test SHALL rename an ancestor of the displayed folder and assert the current path is rewritten.
- A test SHALL delete an ancestor of the displayed folder and assert navigation lands on the surviving parent.
- A test SHALL assert the tree depth constant, so a change to the cap is deliberate.
- A source-level test SHALL assert there is exactly one place in `files.js` that assigns the current path outside the navigation owner.