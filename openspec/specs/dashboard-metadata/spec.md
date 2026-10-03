# dashboard-metadata Specification

## Purpose
Defines how the Dashboard obtains activity history and download ranking from the existing metadata store: reuse of the existing activity shape, the server-side Top-N aggregation contract, and the lazy bootstrap that makes the metadata store usable on a fresh checkout.

## Requirements

### Requirement: Activity Shape Is Reused, Not Redesigned

The Dashboard SHALL consume the metadata store's existing activity representation and SHALL NOT introduce a second activity schema.

#### Scenario: Existing activity fields are preserved

- **WHEN** an activity is returned to the Dashboard
- **THEN** it carries the fields the store already persists: action, target, timestamp, and type
- **AND** no field is renamed or restructured for Dashboard convenience

#### Scenario: Single activity schema exists

- **WHEN** both the Dashboard and the filesystem endpoints return activities
- **THEN** both use the same shape
- **AND** no parallel Dashboard-specific activity representation is introduced

### Requirement: Activity Timestamps Are Explicit And Finite

Every returned activity SHALL carry a usable timestamp, and the absence of a timestamp SHALL be represented explicitly rather than defaulted.

#### Scenario: Every activity carries a finite timestamp

- **WHEN** any activity is returned
- **THEN** its timestamp is a finite number of milliseconds since the Unix epoch
- **AND** it is neither null nor absent

#### Scenario: Missing timestamp is not defaulted to the epoch

- **GIVEN** a stored activity record without a usable timestamp
- **WHEN** it is returned
- **THEN** the record is either excluded or carries an explicitly unavailable marker
- **AND** it is never presented with a timestamp that would render as 1 January 1970

#### Scenario: Future-dated or non-numeric timestamps are rejected

- **GIVEN** a stored activity whose timestamp is not a finite number
- **WHEN** it is returned
- **THEN** it does not produce an invalid date rendering in the client
- **AND** it is not passed through as a raw non-numeric value

### Requirement: Activity Retrieval Is Exposed

The metadata store's activity-read capability SHALL be reachable by the Dashboard.

#### Scenario: Activity read is invocable

- **WHEN** the Dashboard requests activity data
- **THEN** the activity read is performed through the metadata store's existing activity accessor
- **AND** the accessor is no longer unreachable code with zero callers

#### Scenario: Activity volume is bounded by the existing retention

- **WHEN** more activities have been recorded than the store retains
- **THEN** at most the retained number is returned
- **AND** no unbounded read is issued against the store

### Requirement: Download Ranking Is Computed Server-Side

The top-downloaded-files list SHALL be ranked by the backend, and the response SHALL carry the value the client needs to render a proportional bar.

#### Scenario: Ranking is sorted descending

- **WHEN** more than the requested number of files have recorded downloads
- **THEN** the returned entries are ordered by descending download count
- **AND** the entry with the highest count is first

#### Scenario: Maximum is supplied by the backend

- **WHEN** the top-files list is returned and is non-empty
- **THEN** every entry carries a maximum value equal to the highest download count in the returned set
- **AND** the client can compute each bar's proportion without recomputing the maximum

#### Scenario: Client does not re-rank

- **WHEN** the Dashboard renders top files
- **THEN** it renders the server-supplied order
- **AND** it does not sort or rank the entries again

#### Scenario: Zero-download files are excluded

- **GIVEN** files recorded in the store with a download count of zero
- **WHEN** the top-files list is produced
- **THEN** they are excluded from the ranked list
- **AND** an empty ranked list is returned when no file has any recorded download

#### Scenario: Result size is bounded

- **WHEN** the store contains many downloaded files
- **THEN** at most the requested maximum number of entries is returned

#### Scenario: Files with no surviving record are omitted

- **GIVEN** a recorded download entry whose file no longer exists in the managed tree
- **WHEN** the top-files list is produced
- **THEN** the entry is either omitted or its path is validated against the managed tree before being surfaced
- **AND** no stale entry is presented as a current file without validation

### Requirement: Metadata Store Bootstraps Lazily

The metadata store SHALL create its own storage location on first use, so that a fresh checkout without a pre-created data directory functions correctly.

#### Scenario: Missing directory is created on first write

- **GIVEN** the metadata directory does not exist
- **WHEN** the store performs its first write
- **THEN** the directory is created before the metadata file is written
- **AND** the write succeeds

#### Scenario: Missing file is initialised on first read

- **GIVEN** the metadata directory exists but contains no metadata file
- **WHEN** the store is read
- **THEN** the read succeeds and yields an empty default structure
- **AND** it does not raise a filesystem error to the caller

#### Scenario: First read on a fresh checkout does not produce a server error

- **GIVEN** neither the metadata directory nor the metadata file exists
- **WHEN** any endpoint that reads metadata is requested
- **THEN** the request succeeds
- **AND** it does not produce a generic server error caused by a second failed initialisation attempt

#### Scenario: Initialisation failure uses the project's error type

- **GIVEN** initialisation cannot complete
- **WHEN** the failure is raised
- **THEN** it is raised using the project's application error type rather than as a raw system error
- **AND** the response carries the project's error envelope

#### Scenario: Recovery is attempted after a failed initialisation

- **GIVEN** the first initialisation attempt fails
- **WHEN** a later request reads metadata
- **THEN** the store attempts initialisation again rather than remaining permanently broken

#### Scenario: Repository seed is restored

- **WHEN** the repository is checked out fresh
- **THEN** the metadata directory is present in the working tree via a tracked placeholder
- **AND** the ignore rules that anticipate that placeholder are honoured

### Requirement: Metadata Failures Never Block Filesystem Operations

A metadata read or write failure SHALL NOT cause the filesystem operation it accompanies to fail.

#### Scenario: Download recording failure does not fail the download

- **WHEN** a download succeeds on the filesystem but recording its counter fails
- **THEN** the download response is still successful
- **AND** the failure is swallowed rather than propagated

#### Scenario: Activity recording failure does not fail the write

- **WHEN** a filesystem mutation succeeds but recording its activity fails
- **THEN** the mutation response is still successful
- **AND** no error is surfaced to the client
