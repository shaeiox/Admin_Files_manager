# Settings Consumers

## Purpose

Defines the observable effects of the surviving settings outside the Settings page, and each consumer's behaviour when a setting is unset or the store is unreachable — a configured value must change real behaviour, and its absence must change nothing.

## ADDED Requirements

### Requirement: Workspace Name Renders in the Shared Brand

When `general.workspaceName` is set, the sidebar brand text on every page SHALL render it at runtime, applied by shared chrome without editing any page's sidebar markup. When the setting is unset or the store is unreachable, the brand SHALL render the static default already in the markup. The four pages' sidebar markup SHALL remain byte-for-byte identical regardless of the setting's value.

#### Scenario: A configured name appears

- **WHEN** `workspaceName` is saved and any page loads
- **THEN** the sidebar brand displays the configured name at runtime

#### Scenario: Unset or unreachable falls back to the markup default

- **WHEN** `workspaceName` is unset, or the settings store cannot be reached
- **THEN** the sidebar brand displays the static default text from the markup
- **AND** no error is shown for the brand area

#### Scenario: Markup identity is preserved

- **WHEN** the four pages' sidebar markup is compared
- **THEN** it is byte-for-byte identical with and without a configured name

### Requirement: Default Upload Folder Prefills the Upload Destination

When `general.defaultUploadFolder` is set, the Uploads page SHALL open with that client path as its initial destination. When the setting is unset or the store is unreachable, the Uploads page SHALL behave exactly as it does today. The setting SHALL NOT alter upload validation, overwrite policy, or queue behaviour, and the destination it prefills SHALL still pass through the secure path boundary at upload time like any other destination.

#### Scenario: A configured folder is the initial destination

- **WHEN** `defaultUploadFolder` is saved and the Uploads page opens
- **THEN** the destination control shows the configured client path

#### Scenario: Absence changes nothing

- **WHEN** `defaultUploadFolder` is unset or the store is unreachable
- **THEN** the Uploads page opens with the same initial destination as without the feature
- **AND** no request failure is surfaced to the operator

#### Scenario: The prefilled destination is still validated at use

- **WHEN** an upload is started from a prefilled destination
- **THEN** the destination passes the same validation and secure-path resolution as a manually entered one

### Requirement: Default View Selects the Files Listing Layout

When `appearance.defaultView` is set, the Files page SHALL open in that listing layout (list or grid) unless the operator has an explicit in-session or persisted view choice that takes precedence per the Files page's own rules. When the setting is unset or the store is unreachable, the Files page SHALL open in its current default layout.

#### Scenario: A configured view is the initial layout

- **WHEN** `defaultView` is saved as grid and the Files page opens fresh
- **THEN** the listing renders in grid layout

#### Scenario: Absence keeps the current default

- **WHEN** `defaultView` is unset or the store is unreachable
- **THEN** the Files page opens in the same layout as without the feature

### Requirement: Consumers Degrade Independently and Quietly

Each consumer SHALL fetch or receive settings in a way that a store failure degrades only that consumer's enhancement, never the host page's existing behaviour, and never raises an error toast for the settings read alone.

#### Scenario: Store outage is invisible outside the Settings page

- **WHEN** the settings store is unreachable and the Dashboard, Files, or Uploads page loads
- **THEN** each page behaves exactly as it does today
- **AND** no settings-related error toast appears
