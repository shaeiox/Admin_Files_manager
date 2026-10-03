# Upload Page Interaction

## Purpose

Defines how the upload surface responds to pointer and keyboard input: how files enter the queue, whether a dropped file outside the dropzone is accepted or refused, when drag highlighting appears and clears, and the contract for the page's option controls.

## ADDED Requirements

### Requirement: Files Enter The Queue Through Every Advertised Route

Every route the page advertises for adding files SHALL add those files to the queue with visible confirmation.

#### Scenario: Browsing for files queues them

- **WHEN** an operator activates the control that opens a file picker and selects files
- **THEN** each selected file appears in the queue
- **AND** the picker can be opened again immediately without the previous selection replaying

#### Scenario: Browsing for a folder queues its files

- **WHEN** an operator activates the control that opens a folder picker
- **THEN** each file in the chosen folder, including files in its subfolders, enters the queue

#### Scenario: Dropping on the dropzone queues the files

- **WHEN** files are dropped while the pointer is over the dropzone
- **THEN** each dropped file enters the queue
- **AND** the dropzone's highlighted state is cleared

#### Scenario: The same selection is not queued twice

- **WHEN** an operator re-opens a picker and cancels it without choosing anything
- **THEN** nothing is added to the queue

### Requirement: The Page-Wide Drop Contract Matches Its Copy

The page SHALL either accept a file dropped anywhere on the page, or contain no text claiming that it does.

#### Scenario: A page-wide drop is accepted

- **WHEN** the page states that files may be dropped anywhere on it
- **AND** files are dropped on a region outside the dropzone
- **THEN** the files enter the queue
- **AND** the drop is confirmed visibly

#### Scenario: A page-wide drop is refused without loss of trust

- **WHEN** the page does not state that files may be dropped anywhere on it
- **AND** files are dropped outside the dropzone
- **THEN** the drop is visibly refused with an explanation
- **AND** the browser does not navigate away, discarding the queue

#### Scenario: Dropping a non-file payload does not disturb the page

- **WHEN** a dragged selection containing no files is dropped anywhere on the page
- **THEN** no file is added
- **AND** the page does not navigate away

#### Scenario: The empty-state instruction matches the drop contract

- **WHEN** the queue is empty and its instruction text is shown
- **THEN** the instruction describes a route that actually works

### Requirement: Drag Highlighting Is Accurate

The dropzone's highlighted state SHALL appear while a file-bearing drag is over a region that will accept the drop, and SHALL NOT flicker while the pointer moves within the dropzone.

#### Scenario: Highlighting appears on entry

- **WHEN** a file-bearing drag enters the dropzone or the page
- **THEN** the dropzone presents its highlighted state

#### Scenario: Highlighting survives movement across child elements

- **WHEN** a file-bearing drag moves between child elements inside the dropzone
- **THEN** the highlighted state is not cleared
- **AND** it is not re-applied in a way that restarts any transition

#### Scenario: Highlighting clears on exit

- **WHEN** a file-bearing drag leaves the region entirely
- **THEN** the highlighted state is cleared

#### Scenario: A drag carrying no files produces no highlight

- **WHEN** a drag begins that carries no files
- **THEN** the dropzone does not present its highlighted state

#### Scenario: The highlight counter cannot go negative

- **WHEN** drag enter and drag leave events arrive in any interleaving
- **THEN** the highlight state is still correct
- **AND** an unbalanced count does not strand the highlight on

### Requirement: The Dropzone Is Operable By Keyboard

The dropzone SHALL be operable without a pointer.

#### Scenario: Keyboard activation opens the picker

- **WHEN** the dropzone has focus and <kbd>Enter</kbd> is pressed
- **THEN** the file picker opens

#### Scenario: The space key opens the picker

- **WHEN** the dropzone has focus and <kbd>Space</kbd> is pressed
- **THEN** the file picker opens
- **AND** the page does not scroll as a side effect

#### Scenario: Activation does not recurse

- **WHEN** a control inside the dropzone is activated by keyboard
- **THEN** the dropzone's own activation handler does not also fire and reopen the picker

#### Scenario: Focus is visible

- **WHEN** the dropzone or any control inside it has keyboard focus
- **THEN** a visible focus indicator is rendered

### Requirement: Option Controls Are Well Formed And Labelled

Every option control SHALL be a single valid label associated with its input, and its visible text SHALL be part of its hit area.

#### Scenario: No control nests inside another label

- **WHEN** the option controls are inspected
- **THEN** no label element contains another label element
- **AND** each input has exactly one associated label

#### Scenario: Clicking the visible text toggles the option

- **WHEN** an operator clicks the visible text of an option
- **THEN** the corresponding option toggles

#### Scenario: The control's name includes its text

- **WHEN** an option's accessible name is computed
- **THEN** it includes the option's visible text and not only the switch shape

#### Scenario: The state is exposed, not only drawn

- **WHEN** an option is on or off
- **THEN** its state is exposed to assistive technology through the control's checked state

### Requirement: Bulk Queue Actions Are Predictable

The page-level queue actions SHALL act only on the items their labels name, and SHALL report what they did.

#### Scenario: Pause all affects only in-flight items

- **WHEN** an operator activates the action that pauses everything
- **THEN** only items in the uploading state are paused
- **AND** no queued or completed item is affected

#### Scenario: Resume all affects only paused items

- **WHEN** an operator activates the action that resumes everything
- **THEN** only items in the paused state are queued again
- **AND** no completed item is re-transferred

#### Scenario: Cancel all requires confirmation and states the consequence

- **WHEN** an operator activates the action that cancels everything
- **THEN** a confirmation is required
- **AND** the confirmation states that completed files remain on the server
- **AND** the confirmation states what happens to partially transferred files

#### Scenario: An action on an empty queue is harmless

- **WHEN** a bulk action is activated while the queue is empty
- **THEN** nothing happens
- **AND** no error is reported

#### Scenario: Concurrency changes are reflected in the running queue

- **WHEN** the parallel-upload count is lowered below the number of items currently transferring
- **THEN** no new transfer starts until the count is back within the limit
- **AND** transfers already in flight are not aborted
