# Spec Delta

## Purpose

Defines the database substrate that backs identity, session, file-access-policy, and audit data:
the engine and why it adds no dependency, the boundary that keeps business logic independent of
it, transactional integrity for operations the JSON stores could not express, and its explicit
coexistence with the two existing JSON stores it does not replace.

## ADDED Requirements

### Requirement: A Database Is Added Alongside The Existing JSON Stores, Not Instead Of Them

The application SHALL persist user, session, file-access-policy, and audit data in a database, and
SHALL NOT alter, migrate, or absorb the existing `metadata.json` or `settings.json` documents.

#### Scenario: The JSON stores remain authoritative for what they already own

- **WHEN** stars, download counters, activity, or settings are read or written
- **THEN** `metadata.json`/`settings.json` remain the system of record for them
- **AND** no identity/session/file-policy operation reads or writes either JSON document

#### Scenario: The new tables are the system of record for identity and file-access-policy data

- **WHEN** a user, session, file-access-policy, or audit record is read or written
- **THEN** the database is the system of record
- **AND** no JSON document is consulted or updated for that operation

### Requirement: The Engine Is Selected From The Runtime And Adds No Dependency

The application SHALL use the SQLite implementation available in its own runtime and SHALL NOT add
a database package, a native build step, or an external database server to do so.

#### Scenario: No database package is added to the manifest

- **WHEN** the dependency manifest is inspected
- **THEN** it lists no database driver, query builder, or ORM package

#### Scenario: No external service is required to run the suite

- **GIVEN** a host with no database server running
- **WHEN** the project's own test suite executes
- **THEN** it completes
- **AND** every suite operates against its own isolated database file

### Requirement: Business Logic Is Independent Of The Engine

All database access SHALL pass through a repository boundary that expresses operations in
application terms, so controllers and services never issue SQL directly.

#### Scenario: Controllers and services issue no queries

- **WHEN** the request-handling source for the new identity/file-policy routes is inspected
- **THEN** no statement text, query construction, or engine-specific call appears in it

#### Scenario: A repository operation is named, not expressed as a query

- **WHEN** a caller needs to look up a user by username
- **THEN** it invokes a named repository operation
- **AND** no engine-specific construct crosses the boundary

### Requirement: Counters And Multi-Record Operations Are Atomic

A session-revocation or audit-count update SHALL be a single atomic operation. An operation that
changes more than one record — creating a user together with its bootstrap audit entry, for
example — SHALL apply atomically, so a failure leaves no partial state.

#### Scenario: A bulk session revoke is atomic

- **GIVEN** a user with several active sessions
- **WHEN** an administrator revokes all of that user's sessions
- **THEN** every session row is marked revoked in one atomic operation
- **AND** no session is left un-revoked by a partial failure

#### Scenario: A failed multi-record operation leaves nothing applied

- **GIVEN** a multi-record operation whose final step fails
- **WHEN** the operation is rolled back
- **THEN** no part of it remains applied

### Requirement: Identity Failures Fail The Request; Advisory-Analytics Rules Elsewhere Are Unchanged

A failure to resolve the caller's session or role SHALL fail the request. This requirement governs
only data owned by this change; it does not alter the existing fire-and-forget behavior of
`MetadataService`'s download/star/activity writes, which remain governed by their own existing
contract.

#### Scenario: A session-store failure refuses the request

- **WHEN** the session store cannot be read
- **THEN** the request is refused
- **AND** it is not treated as an anonymous or default-role request

#### Scenario: Existing metadata fire-and-forget behavior is untouched

- **WHEN** a filesystem mutation succeeds but `MetadataService`'s own activity write fails
- **THEN** the mutation response is still successful, exactly as before this change

### Requirement: The Database Honours The Hardened Deployment Unit

The database file SHALL be stored inside the configured data directory, SHALL NOT live inside a
release, and the write-ahead-log sidecar files it creates SHALL be treated as part of the same
writable, backed-up unit.

#### Scenario: The database lives outside every release

- **GIVEN** a data directory configured outside the application root
- **WHEN** the database file is created
- **THEN** it is created inside that data directory, alongside `metadata.json` and `settings.json`

#### Scenario: A deployment refuses an absent store on a host that has run before

- **GIVEN** a host where a previous release ran and created this database
- **WHEN** the database file is absent at activation time
- **THEN** activation is refused
- **AND** the existing JSON-store presence guard is not weakened or replaced, only extended

#### Scenario: The schema is advanced before the new release is activated

- **WHEN** a release whose schema differs from the stored schema is deployed
- **THEN** the schema is advanced before the new release begins serving
- **AND** a failure to advance it prevents activation

#### Scenario: Advancing the schema is idempotent

- **GIVEN** the stored schema is already at the version the release expects
- **WHEN** the schema step runs
- **THEN** it succeeds and changes nothing

### Requirement: Statistics That Cannot Be Measured Are Declared Unavailable

A query-derived figure in the admin UI SHALL be reported as unavailable rather than zero when it
could not be obtained, preserving the existing rule that a zero is a real reading.

#### Scenario: An unmeasured figure is null, not zero

- **WHEN** a figure in the admin UI cannot be computed
- **THEN** the field is null and unavailability is declared explicitly, not reported as `0`
