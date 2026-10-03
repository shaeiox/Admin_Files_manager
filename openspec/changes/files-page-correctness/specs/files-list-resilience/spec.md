# Files List Resilience

## Purpose

Defines how the directory listing tolerates a changing filesystem and a large one: enrichment must not serialise, an entry that vanishes mid-request must not fail the whole page, folder size must be null rather than an invented number, and a route must not be registered twice.

## ADDED Requirements

### Requirement: Listing Survives Entries That Vanish Mid-Request

A directory entry that is removed between the directory read and its per-entry enrichment SHALL be skipped, not propagated as a failure of the whole request.

#### Scenario: Vanished entry is skipped

- **GIVEN** a directory containing an entry that is deleted after the directory is read but before its details are fetched
- **WHEN** the listing is requested
- **THEN** the request succeeds
- **AND** the vanished entry is absent from the result
- **AND** every sibling entry is present

#### Scenario: Sibling enrichment failures degrade per entry

- **GIVEN** one entry whose details cannot be read
- **WHEN** the listing is requested
- **THEN** the request succeeds
- **AND** the unreadable entry is either omitted or rendered with explicitly unavailable detail
- **AND** no fabricated value is substituted for the unreadable detail

#### Scenario: The whole request still fails when the target is unreadable

- **WHEN** the requested directory itself cannot be read
- **THEN** the request fails with an appropriate status
- **AND** the failure is not swallowed as an empty listing

### Requirement: Per-Entry Enrichment Does Not Serialise

Enrichment of the entries in a listing SHALL not perform one asynchronous filesystem or metadata operation at a time in a sequential loop when those operations are independent.

#### Scenario: Independent enrichments proceed concurrently

- **WHEN** a listing of many entries is produced
- **THEN** per-entry detail reads are issued concurrently rather than one after another
- **AND** the degree of concurrency is bounded so a very large directory cannot exhaust file handles

#### Scenario: Concurrency bound is a documented value

- **WHEN** the concurrency bound is chosen
- **THEN** it is an explicit, documented constant rather than unbounded parallelism

#### Scenario: Ordering is deterministic

- **WHEN** entries are enriched concurrently
- **THEN** the listing order is determined solely by the requested sort and pagination
- **AND** it does not depend on completion order

#### Scenario: Metadata reads do not each re-read the store

- **WHEN** per-entry metadata is fetched for a listing
- **THEN** the metadata store's cache is used
- **AND** the number of store reads does not scale with the number of entries

### Requirement: Folder Size Is Null

A directory entry SHALL NOT report a byte size. The filesystem's size for a directory is not a measurement of its contents.

#### Scenario: Directory size is null in the payload

- **WHEN** a listing includes a directory
- **THEN** that entry's size is null
- **AND** it is not the filesystem's reported directory size

#### Scenario: Cross-platform identical contract

- **WHEN** the same directory tree is listed on a filesystem that reports a non-zero directory size and on one that reports zero
- **THEN** the response is identical
- **AND** no consumer can distinguish the two platforms from the payload

#### Scenario: Unavailable is not zero

- **GIVEN** a quantity that is not measured
- **WHEN** it is serialised
- **THEN** it is null
- **AND** it is never `0`, because `0` is a real reading

### Requirement: Sort Keys Are Validated And Bounded

The listing SHALL accept only documented sort keys, and SHALL apply a documented directory-first policy.

#### Scenario: Unknown sort key is rejected or ignored deterministically

- **WHEN** a request supplies a sort key the listing does not support
- **THEN** the response is deterministic rather than dependent on the key's incidental meaning
- **AND** the key cannot reach a property lookup that was not intended for query input

#### Scenario: Directory-first ordering is documented

- **WHEN** a listing is sorted by any key in either direction
- **THEN** directories precede files
- **AND** this policy is documented so a descending-size sort is not read as including directories in the size ranking

#### Scenario: Missing sort values do not distort order

- **WHEN** two entries compare equal because one lacks the sort value
- **THEN** the resulting order is stable and deterministic
- **AND** an absent value is not silently coerced into a numeric zero that competes with real values

### Requirement: Pagination Bounds Are Validated

Page and limit parameters SHALL be validated rather than trusted, and an out-of-range page SHALL produce a defined result.

#### Scenario: Non-numeric page falls back to the first page

- **WHEN** the page parameter is not a number
- **THEN** the request behaves as the first page

#### Scenario: Excessive limit is bounded

- **WHEN** the limit parameter exceeds the documented maximum
- **THEN** the effective limit is the documented maximum
- **AND** the response does not attempt to serialise an unbounded page

#### Scenario: Page beyond the end returns an empty page, not an error

- **WHEN** the requested page starts beyond the final page
- **THEN** the response succeeds with an empty item list and the true total
- **AND** the total still reflects every matching entry, not just the returned page

### Requirement: A Route Is Registered Once

A route handler SHALL NOT be registered on the same path more than once.

#### Scenario: No duplicate catch-all

- **WHEN** the application middleware chain is inspected
- **THEN** no terminal handler for the API prefix is registered more than once
- **AND** removing the duplicate does not change the response of any request

#### Scenario: Filesystem router is mounted at exactly one prefix

- **WHEN** the middleware chain is inspected
- **THEN** the filesystem router is mounted under exactly one prefix
- **AND** no filesystem mutation route is reachable under any second, unauthenticated prefix

## Regression Requirements

- A test SHALL request a listing for a directory that becomes empty between the read and the enrichment and assert the response succeeds rather than failing with a not-found error. *Note: this defect is reachable but was not reproduced during the investigation — the probe returned a successful response at the timing used. The test asserts the guarantee, not a previously observed failure.*
- A test SHALL assert a directory entry's `size` is `null`, and that the payload is byte-identical across a filesystem reporting non-zero directory size and one reporting zero.
- A test SHALL assert an unknown sort key yields a deterministic result and does not throw.
- A test SHALL assert a page beyond the final page returns a successful response whose total is the full matching count.
- A test SHALL assert a limit above the documented maximum is clamped.
- A test SHALL assert the API catch-all is registered exactly once, by counting registrations in `server.js`.
- A source-level test SHALL assert no inline extension array remains in the listing handler, keeping the taxonomy from being re-inlined.