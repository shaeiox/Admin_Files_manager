# Bulk Download Integrity

## Purpose

Defines how selected items are downloaded, which transport each path uses, and the rule that a control has exactly one handler. This capability exists because the ZIP route was unreachable and because two competing click handlers on the bulk-download control meant the only menu a user could ever see was the non-functional one.

## ADDED Requirements

### Requirement: The ZIP Endpoint Is Reachable

A read-only endpoint that streams a ZIP archive of the requested paths SHALL be registered on the filesystem router.

#### Scenario: Valid ZIP request succeeds

- **GIVEN** one or more valid client paths
- **WHEN** `POST /api/fs/download-zip` is called with those paths
- **THEN** the response status is `200`
- **AND** the `Content-Type` is `application/zip`
- **AND** the `Content-Disposition` header names an attachment

#### Scenario: Empty path list is rejected

- **WHEN** the request carries no paths, or an empty array
- **THEN** the request fails with status `400`

#### Scenario: Oversized request is rejected

- **WHEN** the request carries more than the documented maximum number of paths
- **THEN** the request fails with status `400` and states the limit
- **AND** no archive is streamed

#### Scenario: A traversing path aborts the whole archive

- **GIVEN** a request whose path list contains one path that traverses outside the storage root
- **WHEN** the archive is assembled
- **THEN** the request fails
- **AND** no entry from the request is streamed

#### Scenario: Folders are included in the archive

- **GIVEN** a path list containing a directory
- **WHEN** the archive is streamed
- **THEN** the directory's contents are included as a named entry

#### Scenario: The main document is never navigated

- **WHEN** the ZIP download is triggered from the browser
- **THEN** the form submission targets an isolated hidden frame
- **AND** the page is not reloaded and the application state is preserved

### Requirement: One Handler Per Control

A control SHALL have exactly one registered handler for an event type. Two handlers on one element are a defect regardless of whether both currently execute.

#### Scenario: Duplicate registration is absent

- **WHEN** the Files page initialises
- **THEN** the bulk-download control has exactly one `click` handler
- **AND** no handler's copy text promises behaviour that is not implemented

#### Scenario: The visible menu is the implemented menu

- **GIVEN** any control that opens a context menu
- **WHEN** the menu is opened
- **THEN** every entry in it performs the action it names
- **AND** no entry is a placeholder, a roadmap note, or a phase reference

#### Scenario: A later registration cannot silently replace an earlier one

- **WHEN** a menu is opened by a control
- **THEN** the menu rendered is the one that control's single handler specified

### Requirement: Downloads Never Navigate the Main Frame and Are Not Popup-Blocked

Every single-file download SHALL be triggered through an isolated iframe or a targeted form, never through a new window or tab.

#### Scenario: Single-file download uses an isolated frame

- **WHEN** a single file is downloaded
- **THEN** the download is triggered by a hidden iframe pointed at the download URL
- **AND** no `window.open` call is involved
- **AND** the application is not navigated

#### Scenario: Multi-file download uses the frame transport

- **WHEN** several files are downloaded individually
- **THEN** each is triggered through the frame transport with a stagger between starts
- **AND** the stagger is applied by the shared download helper, not by ad-hoc timers in page code

#### Scenario: Repeated downloads are not suppressed

- **WHEN** the operator requests the same file twice
- **THEN** both downloads occur
- **AND** no state suppresses the second request

### Requirement: Selection Behaviour Around Downloads Is Predictable

A download SHALL have a defined effect on the current selection, and that effect SHALL be the same for every download path.

#### Scenario: Selection is cleared consistently

- **WHEN** a download of the current selection completes
- **THEN** the selection is cleared
- **AND** this holds for the ZIP path and the individual-files path alike

#### Scenario: Download is refused for an empty selection

- **WHEN** a download is requested with nothing selected
- **THEN** nothing is triggered
- **AND** no success message is shown

### Requirement: Download Outcomes Are Reported Honestly

A download SHALL NOT be reported as successful before the transport has begun, and a failure SHALL be surfaced.

#### Scenario: No premature success claim

- **WHEN** a download is requested
- **THEN** no message asserts that the file downloaded successfully before the request has been issued
- **AND** any message shown describes the request, not a completed outcome

#### Scenario: A refused download is reported

- **WHEN** a download request cannot be initiated, for example because a selected item is a directory and the individual-files path was chosen
- **THEN** the operator is told, and told which items cannot be downloaded that way
- **AND** the alternative that does work is named

### Requirement: Folder Selection Is Downloadable Only Via Archive

Selecting a directory SHALL be downloadable through the archive path, and the individual-files path SHALL say so rather than silently skipping directories.

#### Scenario: Mixed selection is handled explicitly

- **GIVEN** a selection containing both files and directories
- **WHEN** the individual-files path is chosen
- **THEN** the operator is told how many directories were excluded
- **AND** the message names the archive option as the way to include them

## Regression Requirements

- A test SHALL assert `POST /api/fs/download-zip` does not return the not-found envelope.
- A test SHALL assert the ZIP response `Content-Type` is `application/zip`.
- A test SHALL assert an empty and an oversized path list are both rejected with `400`.
- A test SHALL assert a traversing path in a ZIP request yields no streamed entries.
- A source-level test SHALL assert the bulk-download control is bound exactly once, by counting registrations for that element id in `files.js`.
- A source-level test SHALL assert `files.js` contains no `window.open(` call, so the popup-exposed transport cannot return unnoticed.