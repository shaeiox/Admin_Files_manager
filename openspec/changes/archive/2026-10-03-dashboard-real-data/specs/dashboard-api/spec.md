# Dashboard API

## Purpose

Defines the two HTTP endpoints that serve real Dashboard data: their paths, mount ordering, bare (un-enveloped) response shapes, field types and units, nullability rules, and the partial-capability failure semantics used when an individual data source is unavailable.

## ADDED Requirements

### Requirement: Bare Response Envelope

Dashboard endpoints SHALL return the response payload directly as the HTTP body. They SHALL NOT wrap the payload in a `{ "success": true, "data": ... }` envelope.

#### Scenario: Summary response is a bare object

- **WHEN** a client issues `GET /api/dashboard/summary`
- **THEN** the response body is a JSON object whose top-level keys include `stats`, `storage`, `storageBreakdown`, `activities`, `topFiles`, and `health`
- **AND** the body does NOT contain a `success` property
- **AND** the body does NOT contain a `data` property

#### Scenario: Health response is a bare array

- **WHEN** a client issues `GET /api/dashboard/health`
- **THEN** the response body is a top-level JSON array
- **AND** the body is not wrapped in any object

#### Scenario: Enveloped response is rejected by contract

- **WHEN** either endpoint is implemented with a `success`/`data` wrapper
- **THEN** the contract test suite fails
- **AND** the Dashboard silently renders no data because the client reads top-level keys and defaults every one of them to an empty value

#### Scenario: Bare shape matches read-endpoint precedent

- **GIVEN** the existing filesystem read handlers return bare top-level shapes and the mutating handlers return the envelope
- **WHEN** a Dashboard response shape is chosen
- **THEN** the bare shape is selected, consistent with every other read-only aggregate endpoint
- **AND** the convention is stated as a rule rather than left implicit

### Requirement: Route Registration Precedes Catch-All

`/api/dashboard` SHALL be mounted in `server.js` at a position strictly earlier than the `/api` catch-all middleware.

#### Scenario: Dashboard routes are reachable

- **WHEN** the server starts and a client requests `GET /api/dashboard/summary`
- **THEN** the response status is `200` and the body is the summary payload
- **AND** the response is NOT `{"success": false, "error": "API endpoint not found"}`

#### Scenario: Unknown API paths still reach the catch-all

- **WHEN** a client requests `GET /api/dashboard/does-not-exist`
- **THEN** the catch-all responds `404` with `{"success": false, "error": "API endpoint not found"}`

#### Scenario: Filesystem router is not remounted under the dashboard prefix

- **WHEN** routes are registered
- **THEN** the existing filesystem router is mounted only at `/api/fs`
- **AND** no filesystem mutation route (upload, rename, delete, folder, download) is reachable under `/api/dashboard`

### Requirement: Summary Field Contract

`GET /api/dashboard/summary` SHALL return an object whose fields satisfy the following contract.

#### Scenario: Numeric stat values are raw numbers

- **WHEN** `stats` contains an entry
- **THEN** `value` is a JSON number
- **AND** `value` is not a formatted string such as `"1.2K"`
- **AND** `value` is an integer, which may legitimately be `0`

#### Scenario: A zero stat value is a real reading, never floored

- **WHEN** the managed tree is empty
- **THEN** file count, folder count, and tree bytes are reported as `0`
- **AND** they are NOT reported as `1` or any other non-zero placeholder
- **AND` the same applies to a volume reading that genuinely rounds to zero gigabytes

> **Corrected after Phase 6.** An earlier version required "magnitude at least 1"
> on the rationale that the renderer rounded every animation frame. Phase 6 removed
> that animation, which voided the rationale and left the flooring reporting a
> fabricated non-zero reading for an empty tree. Zero is honest; one is not.

#### Scenario: Every stat declares its own unit

- **WHEN** `stats` contains an entry
- **THEN` every entry carries a `unit` field
- **AND` the unit is one of `count`, `bytes` or `GB`, matching the quantity
- **AND` the client never has to infer the unit from the stat key
- **AND` a stat with a count, a byte total, and a gigabyte total can be rendered
  from one code path instead of three key-specific branches

#### Scenario: Trend availability is declared, never implied

- **WHEN** `stats` contains an entry
- **THEN** `trendAvailable` is present and is a JSON boolean
- **AND** in this release `trendAvailable` is always `false`
- **AND** no numeric trend field is present on any stat entry

#### Scenario: Activity timestamps are finite epoch milliseconds

- **WHEN** `activities` contains an entry
- **THEN** `time` is a finite JSON number representing milliseconds since the Unix epoch
- **AND** `time` is never `null` and never absent, because a null timestamp renders as 1 January 1970 and an absent timestamp renders as the literal text `Invalid Date`

#### Scenario: Top-file max is server-computed

- **WHEN** `topFiles` is non-empty
- **THEN** every entry carries a `max` property
- **AND** `max` is a number greater than zero
- **AND** `max` is computed by the backend across the returned set, so the first entry's `downloads` equals `max` when sorted descending

#### Scenario: Storage breakdown values are expressed in gigabytes

- **WHEN** `storageBreakdown` contains an entry
- **THEN** the numeric field is named `valueGb`
- **AND** its value is a JSON number of gigabytes (10^9 bytes), because the renderer appends a literal ` GB` suffix and performs no byte conversion
- **AND** `key` is one of the server file-type taxonomy keys
- **AND** `color` is a CSS color string, not a CSS class name

#### Scenario: Top-level arrays are never null

- **WHEN** the summary is returned
- **THEN** `stats`, `storageBreakdown`, `activities`, `topFiles`, and `health` are always JSON arrays
- **AND** none of them is `null`

### Requirement: No Operating-System Path Leakage

No field of any Dashboard response SHALL contain an absolute operating-system filesystem path.

#### Scenario: No drive letter reaches the client

- **WHEN** any Dashboard response is serialised
- **THEN** no string value matches a Windows drive-letter pattern
- **AND** no string value contains a backslash-separated absolute path
- **AND** no string value contains a UNC prefix

#### Scenario: Filenames are basenames only

- **WHEN** `topFiles` or `activities` reports a file
- **THEN** the reported name is a bare filename with no directory component
- **AND** the reported folder is a POSIX client path rooted at `/`, never a native path

#### Scenario: Server error messages carry no filesystem detail

- **WHEN** a Dashboard endpoint fails with a filesystem or capacity error
- **THEN** the serialized error message is a static string
- **AND** it does not interpolate an absolute path, an errno message, or a raw system error string

### Requirement: Partial Capability Failure

When an individual data source is unavailable, the summary endpoint SHALL still respond `200` and SHALL express that capability's unavailability within the payload rather than failing the whole response.

#### Scenario: Storage capacity unavailable

- **WHEN** volume capacity cannot be determined
- **THEN** the response status is `200`
- **AND** `storage.volumeAvailable` is `false`
- **AND** `storage.usedBytes` is `null` and `storage.totalBytes` is `null`
- **AND** all other fields are populated normally

#### Scenario: Storage root unreadable

- **WHEN** the configured storage root cannot be read
- **THEN** the response status is `200`
- **AND** `storage.treeBytes` is `0`, `storageBreakdown` is `[]`, and file/folder counts are `0`
- **AND** `activities` and `topFiles` are still populated from metadata

#### Scenario: Metadata store unavailable

- **WHEN** the metadata store cannot be read
- **THEN** the response status is `200`
- **AND** `activities` is `[]` and `topFiles` is `[]`
- **AND** filesystem-derived fields are still populated normally

#### Scenario: Partial-failure convention is documented

- **WHEN** the contract is delivered
- **THEN** the API contract document explicitly records that `200` with per-capability degradation is an intentional departure from the repository's previous convention, in which every handler either succeeded wholly or failed wholly
- **AND** the document distinguishes this failure-semantics departure from the read-endpoint response-shape convention, which the Dashboard follows rather than departs from

### Requirement: Summary Health Mirrors the Health Endpoint

The `health` array embedded in the summary SHALL be identical in content to the array returned by the health endpoint.

#### Scenario: Both endpoints offer the same metric row set

- **WHEN** both endpoints are queried and both succeed
- **THEN** both offer the same set of metrics, matched by name, unit, and icon
- **AND** neither endpoint omits a metric the other includes, because the client replaces the summary array wholesale on each poll and any difference causes rows to appear and disappear on a timer
- **AND** their VALUES are not required to match, because the two endpoints are separate requests sampled at different instants and a live metric such as memory usage legitimately changes between them
- **AND** no value is frozen, cached, or rounded to force agreement, since that would misrepresent a live reading

### Requirement: Filesystem Router Separation

The Dashboard endpoints SHALL be declared in a dedicated route module, and the Dashboard controller SHALL compose existing services directly.

#### Scenario: Dedicated route module

- **WHEN** Dashboard routes are declared
- **THEN** they are declared in a Dashboard-specific route module mounted at `/api/dashboard`
- **AND** the existing filesystem route module is not extended with Dashboard paths

#### Scenario: No new service tier

- **WHEN** the Dashboard controller aggregates data
- **THEN** it composes existing filesystem and metadata services directly
- **AND** no new aggregate service layer is introduced between the controller and the existing services

#### Scenario: Route module contains no business logic

- **WHEN** the Dashboard route module is inspected
- **THEN** it contains only route declarations bound to controller handlers
- **AND** it performs no filesystem or metadata access
