# Upload Destination Integrity

## Purpose

Defines where an uploaded file is written, what the API reports about that write, and what happens when the destination is missing, occupied, oversized, aborted, or is a directory. This capability exists because a multipart field-ordering defect silently misfiles every upload made from a subfolder while the API reports a path the file is not at.

## ADDED Requirements

### Requirement: Destination Precedes the File Part

A multipart upload SHALL append every non-file field before appending the file part, because multipart field wire order determines which fields are parsed when the storage destination callback runs.

#### Scenario: Upload to a subfolder is written to that subfolder

- **GIVEN** a storage root containing an existing subfolder `/sub`
- **WHEN** a client uploads a file with the intended destination `/sub`
- **THEN** the file exists at `<STORAGE_ROOT>/sub/<name>` on disk
- **AND** this is asserted by inspecting the filesystem, not by reading the response body

#### Scenario: Upload with no destination lands in the storage root

- **GIVEN** a request that carries a file part and no destination field
- **WHEN** the upload is processed
- **THEN** the file is written to the storage root
- **AND** the reported path is `/<name>`

#### Scenario: Destination is honoured regardless of field order

- **GIVEN** a request that appends the destination field after the file part
- **WHEN** the upload is processed
- **THEN** the destination is either honoured or the request is rejected with a client error
- **AND** the file is never written to a location different from the one reported

### Requirement: The Reported Path Is the Path Actually Written

The response body SHALL describe the location the file was actually written to, derived from the resolved destination used by the storage layer rather than from a form field read at a different point in the request lifecycle.

#### Scenario: Reported path matches the on-disk location

- **WHEN** an upload succeeds
- **THEN** `data.path` equals the client path of the file that now exists on disk
- **AND** `data.name` equals its basename
- **AND** `data.size` equals its byte length

#### Scenario: Reported path never describes an unwritten location

- **WHEN** an upload succeeds
- **THEN** the reported path is not computed from a request field that may not have been parsed at the time the destination was resolved

### Requirement: Destination Must Exist and Be a Directory

The destination SHALL be resolved through the path boundary and SHALL be verified to be an existing directory before any bytes are written.

#### Scenario: Non-existent destination is rejected

- **WHEN** an upload specifies a destination that does not exist
- **THEN** the request fails with status `400`
- **AND** no file is created anywhere
- **AND** the error message does not contain an absolute filesystem path

#### Scenario: Destination that is a file is rejected

- **WHEN** an upload specifies a destination that resolves to a regular file
- **THEN** the request fails with status `400`

#### Scenario: Destination outside the storage root is rejected

- **WHEN** an upload specifies a destination that traverses outside the storage root
- **THEN** the request fails
- **AND** no bytes are written outside the root

### Requirement: Existing Files Are Never Silently Destroyed

An upload SHALL NOT truncate an existing file. The overwrite policy sent by the client SHALL be honoured rather than ignored.

#### Scenario: Colliding name with overwrite disallowed is refused

- **GIVEN** a file already exists at the destination path
- **WHEN** an upload arrives whose policy disallows overwriting
- **THEN** the request fails with a conflict-class status
- **AND** the existing file's bytes and modification time are unchanged

#### Scenario: Colliding name with overwrite allowed replaces atomically

- **GIVEN** a file already exists at the destination path
- **WHEN** an upload arrives whose policy allows overwriting
- **THEN** the new content replaces the old content completely
- **AND** a failure mid-write does not leave a partially written file at the destination path

#### Scenario: A failed upload leaves no partial file

- **WHEN** an upload fails after writing has begun
- **THEN** no partially written file remains at the destination path
- **AND** any pre-existing file at that path is intact

### Requirement: Uploads Are Size-Bounded

The upload middleware SHALL declare a maximum file size and SHALL reject oversized files without exhausting disk or memory.

#### Scenario: Oversized upload is refused

- **WHEN** a file exceeding the configured maximum is uploaded
- **THEN** the request fails with a client error naming the limit
- **AND** the partially written file is removed
- **AND** the limit is a documented, configurable value rather than an unbounded default

### Requirement: Upload Progress, Cancellation and Per-File Errors Are Surfaced

The client SHALL report progress, SHALL offer cancellation, and SHALL name each file that failed together with the server's reason.

#### Scenario: Progress reaches the operator

- **WHEN** a file is uploading
- **THEN** progress is reported as bytes transferred against total bytes
- **AND** the indication is visible for the duration of the upload

#### Scenario: Cancellation stops the transfer

- **GIVEN** an in-flight upload and a cancellation affordance
- **WHEN** the operator cancels
- **THEN** the transfer is aborted via the abort handle the upload API returns
- **AND** the partially written file is removed server-side
- **AND** the operator is told the upload was cancelled

#### Scenario: Each failure is named

- **WHEN** one or more files in a multi-file upload fail
- **THEN** each failed file is identified by name
- **AND** the server's error message for each is shown
- **AND** a count roll-up is shown alongside the detail, not instead of it

#### Scenario: Cancellation of one file does not abort the rest

- **GIVEN** a multi-file upload in which the operator cancels one file
- **WHEN** the remaining files complete
- **THEN** the remaining files are uploaded successfully
- **AND** the cancelled file is reported as cancelled, not as failed

### Requirement: Dropped Directories Are Uploaded

A drop that carries directory entries SHALL upload those directories rather than silently doing nothing.

#### Scenario: Dropping a directory uploads its contents

- **GIVEN** a drag-and-drop carrying a directory entry
- **WHEN** the drop is handled
- **THEN** the directory's files are enumerated and uploaded
- **AND** the destination path is preserved

#### Scenario: An empty drop is ignored

- **WHEN** a drop carries no files and no directory entries
- **THEN** nothing is uploaded
- **AND** no success or error message is shown

### Requirement: Upload Refreshes the Destination Actually Used

After an upload completes, the client SHALL refresh the folder the files were written to, not a folder inferred from pre-upload state.

#### Scenario: Newly uploaded files are visible without navigation

- **WHEN** an upload completes successfully into the current folder
- **THEN** the new files appear in the current listing without manual navigation

#### Scenario: A refresh of a different folder cannot hide a successful upload

- **GIVEN** an upload whose files were written to a location other than the folder currently displayed
- **WHEN** the listing refreshes
- **THEN** the operator is informed that the files were written to the reported location
- **AND** the reported location is the true one

## Regression Requirements

- A test SHALL upload with the field order used by the client and assert the **on-disk** location, not the response body.
- A test SHALL upload with the destination field appended after the file part and assert the file is either correctly placed or rejected.
- A test SHALL upload into a non-existent destination and assert status `400` with no filesystem change.
- A test SHALL upload over an existing file and assert the pre-existing bytes survive when overwrite is disallowed.
- A test SHALL assert `data.path` equals the client path of the file found on disk.
- `AGENTS.md` and `docs/CONTRACTS.md` SHALL record that multipart field order is load-bearing, so the constraint survives the next person who edits the upload path.