# Spec Delta

## Purpose

Defines how the Files browser page is structured: what its header tells the operator, where its actions live,
and how the folder tree and the entry list share the screen at every width.

## ADDED Requirements

### Requirement: Header Names The Current Location
The page heading SHALL name the folder being browsed: its base name, or "All files" at the root. In a library view
it SHALL name the view. A breadcrumb trail of the full path SHALL appear directly under the heading, and every
segment except the last SHALL navigate to that folder.

#### Scenario: Inside a nested folder
- **WHEN** the operator opens `/Projects/Q4 Reports`
- **THEN** the heading reads "Q4 Reports"
- **AND** the trail reads All files › Projects › Q4 Reports, with "Projects" navigating to `/Projects`

#### Scenario: At the root
- **WHEN** the operator browses `/`
- **THEN** the heading reads "All files" and the trail has a single, current segment

#### Scenario: Library view
- **WHEN** the operator opens `files.html?view=starred` in `/Media`
- **THEN** the heading reads "Starred" and a one-line note states that the view covers the folder being browsed

### Requirement: Header Carries No Decorative Labels
The page header SHALL NOT render an eyebrow label, a status dot or a fixed descriptive subtitle above or below
the heading. The only text in the header is the heading, the trail, the library-view note when one applies, and
the action buttons.

#### Scenario: Default listing
- **WHEN** the Files page renders at the root
- **THEN** no "File Browser" label and no fixed "Browse, organize, and manage…" sentence is present

### Requirement: One Upload Action Per Page
The Files page SHALL offer exactly one visible control that opens the upload picker, placed in the page header
as the primary action. New folder SHALL sit beside it as a secondary action.

#### Scenario: Counting upload controls
- **WHEN** the Files page renders at any width
- **THEN** exactly one visible button opens the file picker
- **AND** the empty-folder state may still offer its own Upload action, because it replaces the listing

### Requirement: Command Bar Holds Listing Controls
Search, type filter, sort, view toggle and refresh SHALL share one row above the listing. That row SHALL NOT be
wrapped in a bordered or shadowed container.

#### Scenario: Desktop layout
- **WHEN** the page renders at 1440 px wide
- **THEN** search, filter, sort, view and refresh controls sit on one line
- **AND** the first listing row starts within 220 px of the bottom of the topbar

### Requirement: Selection Replaces The Command Bar
While one or more entries are selected, the command bar SHALL show the selection count and labelled actions
(Download, Move, Copy, Star, Access policy, Delete permanently, Clear) in place of the listing controls. When the
selection empties, the listing controls SHALL return unchanged.

#### Scenario: Selecting two files
- **WHEN** the operator checks two rows
- **THEN** the command bar reads "2 selected on this page" with each action visible as text and icon
- **AND** focus is not moved away from the row that was checked

#### Scenario: Clearing
- **WHEN** the operator presses Clear or Escape with a selection
- **THEN** the selection empties and search, filter, sort and view controls show their previous values

### Requirement: Pending Move Or Copy Is Shown In Place
While a Cut or Copy is pending, the command bar SHALL show what is pending (count and verb) with Paste here and
Cancel actions, and this SHALL stay visible after navigating to another folder.

#### Scenario: Cut then navigate
- **WHEN** the operator cuts two files and opens another folder
- **THEN** the bar reads "2 items ready to move" with "Paste here" and "Cancel"

### Requirement: Search Copy Matches Search Scope
The search field's label and placeholder SHALL describe the scope the server searches: the current folder and all
its subfolders.

#### Scenario: Placeholder
- **WHEN** the search field is empty
- **THEN** its placeholder reads "Search this folder and subfolders"

### Requirement: Tree And List Share One Surface
At widths of 1024 px and above, the folder tree and the listing SHALL sit side by side on one surface, separated
by a tone step and the existing resizer. Neither SHALL be a separately bordered card.

#### Scenario: Desktop surfaces
- **WHEN** the page renders at 1280 px wide
- **THEN** the tree and the listing are adjacent columns of one panel, and the tree stays resizable

### Requirement: Tree Is A Sheet Below 1024 px
Below 1024 px the folder tree SHALL NOT render above the listing. A "Folders" control in the header SHALL open it
as a modal sheet that closes on navigation, on Escape, and on backdrop click, and returns focus to its opener.

#### Scenario: Phone first screen
- **WHEN** the page renders at 375x812 in a folder with entries
- **THEN** the first entry row is visible without scrolling

#### Scenario: Navigating from the sheet
- **WHEN** the operator opens the Folders sheet and picks `/Media`
- **THEN** the sheet closes, `/Media` is listed, and focus returns to the Folders control

### Requirement: Resting Surfaces Carry No Glow, Blur Or Shadow
On the Files page, surfaces at rest (header, command bar, tree, listing, cards) SHALL NOT use gradient fills,
backdrop blur or drop shadows. Overlays (menus, drawer, sheet, dialogs, toasts, drop overlay) may.

#### Scenario: Computed styles
- **WHEN** the page is inspected at rest
- **THEN** the header, command bar, tree panel and listing report `background-image: none`, `backdrop-filter: none` and `box-shadow: none`
