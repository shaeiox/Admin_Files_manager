# Settings Form Integrity

## Purpose

Defines the contract between the Settings page markup and its module: every control is addressable and covered end to end, dirty state means what it says, save and discard tell the truth about what happened, and the module never interferes with shared chrome it does not own.

## ADDED Requirements

### Requirement: Every Surviving Control Is Addressable and Covered

Every form control the Settings module reads or writes SHALL carry a `name` attribute in the markup matching its settings key, and every `name` in the markup SHALL be covered by both hydration (server → form) and payload extraction (form → server). A source-level test SHALL cross-assert the two directions so a markup edit and a module edit cannot drift apart silently.

#### Scenario: Markup and module agree

- **WHEN** the settings page source is inspected
- **THEN** the set of control names in the markup equals the set of keys the module hydrates and extracts

#### Scenario: Saved values survive a reload

- **WHEN** the operator edits surviving controls, saves, and reloads the page
- **THEN** every surviving control renders the saved value

### Requirement: Save Is Gated on Store Reachability

The save action SHALL attempt a request only when the initial settings load has succeeded. While the load is in flight, save SHALL explain that settings are still loading. When the load has failed, save SHALL explain that nothing can be saved, and SHALL NOT send a request. A failed save SHALL never produce a success message, and a save that was never sent SHALL never produce a raw network-error toast.

#### Scenario: Save during the initial load

- **WHEN** the operator saves before the initial settings request has settled
- **THEN** the page reports that settings are still loading and sends no write request

#### Scenario: Save against an unreachable store

- **WHEN** the initial settings load failed and the operator saves
- **THEN** the page explains the store is unreachable, sends no request, and shows no success message

#### Scenario: Successful save

- **WHEN** the store accepted the write
- **THEN** the page confirms the save and the unsaved-changes indicator clears

### Requirement: Discard Restores Real Values and Speaks Truthfully

Discarding SHALL restore every control to the last successfully loaded or saved state. When no server state exists (store unreachable), discard SHALL reset controls to their markup defaults and describe the outcome accurately (edits cleared locally, nothing was saved), and SHALL NOT claim changes were discarded against a server state.

#### Scenario: Discard against a loaded state

- **WHEN** the operator edits controls and discards
- **THEN** every control shows the last loaded or saved value and the unsaved-changes indicator clears

#### Scenario: Discard with no reachable store

- **WHEN** the store is unreachable and the operator discards
- **THEN** controls return to their markup defaults
- **AND** the message states that edits were cleared and nothing was saved

### Requirement: Dirty State Tracks Real Unsaved Differences

The unsaved-changes indicator SHALL appear only when a control covered by the payload differs from its last known state. Activating an already-active segmented option SHALL NOT mark the page dirty. Controls excluded from the payload SHALL NOT mark the page dirty.

#### Scenario: Re-selecting the current option is not a change

- **WHEN** the operator clicks the already-active option of a segmented control
- **THEN** the unsaved-changes indicator does not appear

#### Scenario: Editing a covered control marks dirty

- **WHEN** the operator changes any payload-covered control away from its loaded value
- **THEN** the unsaved-changes indicator appears

### Requirement: Leave Guards Survive Both Navigation Kinds

Unsaved changes SHALL trigger a confirmation before client-side navigation away from the page and before hard navigation. All listeners the module adds to `document` or `window` SHALL be removed on page teardown, so repeated visits accumulate nothing.

#### Scenario: Client-side navigation asks first

- **WHEN** the operator navigates to another page with unsaved edits
- **THEN** a confirmation is shown and cancelling it keeps the operator on the page

#### Scenario: Teardown removes global listeners

- **WHEN** the page is swapped out and revisited repeatedly
- **THEN** each visit adds no duplicate `document` or `window` listeners from the module

### Requirement: The Module Does Not Interfere With the Theme Picker

The Settings module SHALL NOT attach any capturing or stopping click handler to theme-picker cards. Theme selection SHALL continue to work through the shared theme controller's delegated listener, and selecting a theme SHALL NOT mark the page dirty.

#### Scenario: Theme cards apply the theme

- **WHEN** the operator clicks a theme option in the Appearance pane
- **THEN** the selected theme is applied to the document and persisted by the theme controller

#### Scenario: Theme selection is not an unsaved edit

- **WHEN** the operator changes the theme
- **THEN** the unsaved-changes indicator does not appear
