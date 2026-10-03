# Upload Page Accessibility

## Purpose

Defines the accessibility contract of the upload page: accessible names for every control, live-region announcement of transfer state, valid ARIA structure, and parity of queue controls across viewports.

## ADDED Requirements

### Requirement: Every Control Has An Accessible Name

Every interactive control on the page SHALL expose a non-empty accessible name, whether or not it has visible text.

#### Scenario: Icon-only queue controls are named

- **WHEN** a queue row's action control contains only an icon
- **THEN** the control has an accessible name stating the action
- **AND** the name reflects the action's current meaning, so a control that resumes is not named as a control that pauses

#### Scenario: A control whose meaning changes is renamed

- **WHEN** a row's control switches from pausing to resuming
- **THEN** its accessible name changes with it

#### Scenario: Icon-only controls elsewhere on the page are named

- **WHEN** any button on the page presents only an icon
- **THEN** it has an accessible name

### Requirement: Tooltips Are Available Without A Pointer

Where a control's purpose is conveyed by a tooltip, the tooltip SHALL be reachable by keyboard focus as well as by hover.

#### Scenario: Focus reveals the tooltip

- **WHEN** a control carrying a tooltip receives keyboard focus
- **THEN** the tooltip is revealed

#### Scenario: The tooltip is not the accessible name

- **WHEN** a control's purpose is conveyed by a tooltip
- **THEN** the control also carries an accessible name in its markup
- **AND** the name does not depend on the tooltip being rendered

### Requirement: Transfer State Is Announced

Changes to the state of the queue SHALL be exposed through a live region, so a non-sighted operator is not dependent on visual polling.

#### Scenario: Queue summary changes are announced

- **WHEN** the active, queued, completed, or failed counts change
- **THEN** the change is exposed through a live region

#### Scenario: Overall progress changes are announced

- **WHEN** the overall progress value changes materially
- **THEN** the change is exposed through a live region
- **AND** the region is not re-announced on every intermediate tick

#### Scenario: The list region is marked busy while transferring

- **WHEN** one or more transfers are in flight
- **THEN** the region containing the rows is marked busy
- **AND** that state is cleared when no transfer remains in flight

#### Scenario: Repeated completion does not flood the announcement

- **WHEN** several items complete in quick succession
- **THEN** completion is announced in a consolidated form rather than as one announcement per item

### Requirement: The Dropzone Exposes Valid Structure

The dropzone SHALL NOT present itself as a single control while containing other focusable controls.

#### Scenario: The dropzone is not a button containing buttons

- **WHEN** the dropzone's role and children are inspected
- **THEN** the dropzone is not given a button role while containing focusable controls
- **AND** the controls inside it remain individually reachable and individually named

#### Scenario: Assistive technology announces the real controls

- **WHEN** the dropzone's contents are traversed by assistive technology
- **THEN** the file and folder controls are announced as controls in their own right

#### Scenario: Hidden inputs are hidden from the accessibility tree

- **WHEN** the page's file inputs are inspected
- **THEN** they are not exposed as operable controls
- **AND** they remain reachable programmatically for the browse actions

#### Scenario: A labelled region still describes itself

- **WHEN** the dropzone is not itself a control
- **THEN** it still exposes an accessible description of what dropping there does

### Requirement: Decorative Icons Are Hidden

Icons that convey no information beyond the adjacent text SHALL be hidden from assistive technology.

#### Scenario: Icon glyphs are not announced

- **WHEN** an icon sits beside visible text that already states the meaning
- **THEN** the icon is hidden from the accessibility tree
- **AND** it is not announced as an unlabelled graphic

### Requirement: Queue Controls Are Available At Every Viewport

Every queue row SHALL offer the same set of actions at every supported viewport width.

#### Scenario: An in-flight transfer can be cancelled on a narrow viewport

- **WHEN** the page is rendered at a viewport of 320 pixels wide
- **AND** an item is in the uploading state
- **THEN** the control that cancels it is reachable and operable

#### Scenario: Every row state can be resolved on a narrow viewport

- **WHEN** the page is rendered at a viewport of 320 pixels wide
- **THEN** a queued, paused, failed, and completed row each expose a control that resolves that row

#### Scenario: Hiding a control is not how an action is removed

- **WHEN** an action is unavailable for a row state at a narrow viewport
- **THEN** the reason is stated
- **AND** the action is not simply absent with no explanation

#### Scenario: No horizontal overflow at the narrowest supported viewport

- **WHEN** the page is rendered at a viewport of 320 pixels wide
- **THEN** no content overflows horizontally
- **AND** no text is clipped without a way to read it in full

### Requirement: The Page Exposes One Coherent Heading Structure

The page SHALL expose a heading hierarchy that reflects its content, without skipping levels or using heading styles for non-heading text.

#### Scenario: The page has one primary heading

- **WHEN** the page is rendered
- **THEN** it exposes exactly one primary heading naming the page

#### Scenario: Section headings descend without skipping

- **WHEN** the page's sections are traversed
- **THEN** each section heading is one level below its parent heading
- **AND** no level is skipped
