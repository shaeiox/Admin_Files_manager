# Spec Delta

## Purpose

Defines the database substrate that replaces the JSON stores: the engine and the reason for it, the
boundary that keeps business logic independent of the engine, transactional integrity for the
counter and directory operations that the JSON stores could not express, tenant-scoped query
discipline, and the degradation contract that keeps analytics failures from becoming request
failures.

## ADDED Requirements

### Requirement: JSON Stores Are Replaced By A Database

The application SHALL persist identity, session, tenant, role, resource, policy, settings, star,
download-counter and audit data in a database, and SHALL NOT continue to persist them as JSON
documents under the data directory.

#### Scenario: The metadata document is no longer authoritative

- **WHEN** stars, download counters or activity are read or written
- **THEN** the database is the system of record
- **AND** no JSON metadata document is consulted or updated

#### Scenario: The settings document is no longer authoritative

- **WHEN** settings are read or written
- **THEN** the database is the system of record
- **AND** no JSON settings document is consulted or updated

#### Scenario: An existing JSON document is ignored rather than merged

- **GIVEN** a JSON store left over from a previous release
- **WHEN** the application starts and reads settings or stars
- **THEN** it does not import that document's contents
- **AND** it does not delete or rewrite that document

### Requirement: The Engine Is Selected From The Runtime And Adds No Dependency

The application SHALL use the SQLite implementation available in its own runtime and SHALL NOT add a
database package, a native build step, or an external database server to do so.

#### Scenario: No database package is added to the manifest

- **WHEN** the dependency manifest is inspected
- **THEN** it lists no database driver, query builder or ORM package

#### Scenario: No external service is required to run the suite

- **GIVEN** a host with no database server running
- **WHEN** the project's own test suite executes
- **THEN** it completes
- **AND** every suite operates against its own isolated database

#### Scenario: No native compilation is required at install time

- **WHEN** production dependencies are installed from the lockfile
- **THEN** no compiler, build toolchain or prebuilt binary download is required

### Requirement: Business Logic Is Independent Of The Engine

All database access SHALL pass through a repository boundary that expresses operations in
application terms, so that changing the engine does not require rewriting controllers, services or
authorization logic.

#### Scenario: Controllers and services issue no queries

- **WHEN** the request-handling and filesystem-service source is inspected
- **THEN** no statement text, query construction or engine-specific call appears in it

#### Scenario: A query is expressible without naming the engine

- **WHEN** a caller needs tenant settings
- **THEN** it invokes a named repository operation
- **AND** no engine-specific construct is passed through the boundary

#### Scenario: The engine is configured, not distributed

- **WHEN** the engine location is determined
- **THEN** it is read from configuration resolved once at startup
- **AND** the resolution is not spread across modules

### Requirement: Counters Are Updated Atomically

An increment SHALL be expressed as a single atomic database operation, so that concurrent
increments are not lost.

#### Scenario: Concurrent increments all land

- **GIVEN** a resource with a counter of `n`
- **WHEN** several increments are applied concurrently
- **THEN** the resulting counter is `n` plus the number of increments applied
- **AND** no increment is silently discarded

#### Scenario: An increment is not a whole-table rewrite

- **WHEN** a counter is incremented
- **THEN** the operation writes the counter row only
- **AND** it does not read and rewrite unrelated records

### Requirement: Multi-Record Operations Are Transactional

An operation that must change more than one record — a directory move, a tenant creation, or a role
grant change — SHALL apply atomically, so that a failure leaves no partial state.

#### Scenario: A directory move updates one record atomically

- **WHEN** a directory with a resource record is renamed within a tenant
- **THEN** the record's parent is updated in a single atomic step
- **AND** no intermediate state exposes the directory under two parents

#### Scenario: A failed multi-record operation leaves nothing applied

- **GIVEN** a multi-record operation whose final step fails
- **WHEN** the operation is rolled back
- **THEN** no part of it remains applied

#### Scenario: Tenant creation is all-or-nothing

- **WHEN** a tenant is created together with its root resource record and its administrator grant
- **THEN** all of it is applied atomically
- **AND** a failure leaves no tenant without its root record

### Requirement: Every Tenant-Owned Table Is Partitioned By Tenant

Every table holding tenant-owned records SHALL carry a tenant column that is not nullable, and the
access layer SHALL require it, so that a query cannot silently span tenants.

#### Scenario: A tenant column is mandatory

- **WHEN** the schema of a tenant-owned table is inspected
- **THEN** its tenant column is not nullable

#### Scenario: Tenant-scoped uniqueness is per tenant

- **GIVEN** two tenants
- **WHEN** each creates a record carrying the same natural key within its own tenant
- **THEN** both succeed
- **AND** the constraint does not collide across tenants

#### Scenario: An inner join cannot cross tenants accidentally

- **GIVEN** records in two tenants that satisfy the same join predicate
- **WHEN** the join is issued for one tenant
- **THEN** only that tenant's records participate

#### Scenario: Every tenant-owned table carries the tenant, including policies

- **WHEN** the schema of each tenant-owned table is enumerated, including access policies
- **THEN** every one of them carries a tenant column that is not nullable
- **AND** no tenant-owned table reaches its tenant only indirectly through another record

#### Scenario: A policy cannot name a principal from another tenant

- **GIVEN** an access policy attached to a resource in one tenant
- **WHEN** its principal is resolved during an access decision
- **THEN** the principal is resolved only within that same tenant
- **AND** an account holding no membership in that tenant is never treated as its principal

#### Scenario: A polymorphic principal is constrained by query, not by a foreign key

- **GIVEN** a policy's principal field can hold either an account or a role
- **WHEN** the schema and the evaluation query are inspected
- **THEN** the schema states that this field cannot carry a conventional foreign key
- **AND** the evaluation query constrains it to the same tenant as the policy, compensating for the
  absent referential integrity

### Requirement: Analytics Failures Degrade, Identity Failures Do Not

A failure to record advisory analytics SHALL NOT fail the filesystem operation it accompanies. A
failure to resolve the caller's identity or permissions SHALL fail the request.

#### Scenario: A counter write failure does not fail the download

- **WHEN** a file is streamed successfully but recording its counter fails
- **THEN** the download response is still successful

#### Scenario: An activity write failure does not fail the mutation

- **WHEN** a filesystem mutation succeeds but recording its activity fails
- **THEN** the mutation response is still successful

#### Scenario: A session store failure refuses the request

- **WHEN** the session store cannot be read
- **THEN** the request is refused
- **AND** it is not treated as an anonymous request

#### Scenario: An audit write failure for a mutating action is surfaced, not swallowed

- **WHEN** a mutating action succeeds but its audit record cannot be written
- **THEN** the failure is recorded in the server log with the request identifier
- **AND** the behaviour is the documented one rather than an implicit silent success

### Requirement: The Database Honours The Hardened Deployment Unit

The database file SHALL be stored inside the configured data directory, SHALL NOT live inside a
release, and SHALL be reachable for writing by the service identity that the deployment defines.
The write-ahead-log sidecar files the engine creates alongside the database SHALL be treated as part
of the same unit: the same directory SHALL be writable, and a backup of the database SHALL include
them.

#### Scenario: The database lives outside every release

- **GIVEN** a data directory configured outside the application root
- **WHEN** the database file is created
- **THEN** it is created inside that data directory

#### Scenario: The sidecar files share the writable directory

- **GIVEN** the engine is running in write-ahead-log mode
- **WHEN** it creates its log and shared-memory sidecar files
- **THEN** they are created beside the database file in the same directory
- **AND** that directory is one the deployment grants write access to

#### Scenario: A backup accounts for the sidecar files

- **WHEN** the data directory is backed up
- **THEN** the database file and any sidecar files present are all included
- **AND** the backup is taken from a database that is not mid-write, or via the engine's own
  consistent-backup facility

#### Scenario: A deployment refuses an absent store on a host that has run before

- **GIVEN** a host where a previous release ran and created the database
- **WHEN** the database file is absent at activation time
- **THEN** activation is refused
- **AND** the service is not started against an empty store

#### Scenario: The schema is brought forward before the new release is activated

- **WHEN** a release whose schema differs from the stored schema is deployed
- **THEN** the schema is advanced before the new release begins serving
- **AND** a failure to advance it prevents activation

#### Scenario: Advancing The Schema Is Idempotent

- **GIVEN** the stored schema is already at the version the release expects
- **WHEN** the schema step runs
- **THEN** it succeeds
- **AND** it changes nothing

#### Scenario: The Schema Step Runs Before The Release Is Activated

- **WHEN** a release is deployed
- **THEN** the schema is advanced after the release's dependencies are installed and before the
  release begins serving traffic
- **AND** a release whose schema cannot be advanced does not become active

#### Scenario: The Schema Step Is Invoked By The Deployment

- **WHEN** the deployment sequence is inspected
- **THEN** it contains an explicit invocation of the schema step
- **AND** the step is not a capability that exists only in the source and is never called

#### Scenario: The Suite Runs Against The Advanced Schema

- **WHEN** the deployment runs the project's own suite as its release gate
- **THEN** the schema has already been advanced
- **AND** the suite's per-suite databases are created independently of the production database

#### Scenario: A Schema The Release Does Not Expect Is Refused

- **GIVEN** a stored schema version newer than the release understands
- **WHEN** that release is deployed
- **THEN** activation is refused
- **AND** it does not proceed against a schema it cannot interpret

### Requirement: The Cut-Over To Database Authority Is A Single Reversible Step

The change from the previous document stores to the database SHALL be performed as a sequence in
which each step is individually revertible, and in which the database becomes authoritative in one
identified step. The previous stores SHALL NOT be removed in the same step that makes the database
authoritative.

#### Scenario: The Store Becomes Authoritative In One Step

- **WHEN** the cut-over sequence is enumerated
- **THEN** exactly one step changes which store is authoritative
- **AND** that step is separately identified as the point beyond which the previous stores go stale

#### Scenario: The Previous Stores Are Removed In A Later Step

- **WHEN** the step that makes the database authoritative runs
- **THEN** the previous document stores are still present on disk
- **AND** they are removed only by a later, separate step

#### Scenario: A Degraded Mode Is Defined While Both Stores Exist

- **GIVEN** the cut-over has run and the previous stores still exist
- **WHEN** the database cannot be read
- **THEN** the application's behaviour is the documented degraded behaviour
- **AND** that behaviour never presents stale data as current

#### Scenario: There Is No Undefined Dual-Write

- **WHEN** the cut-over sequence is inspected
- **THEN** no step writes the same record to both stores without a stated consistency rule
- **AND** if a compatibility step reads from both, it states which store wins and on what condition

### Requirement: Existing Store Data Is Not Migrated Wholesale

The application SHALL NOT import the previous JSON stores into the database, and SHALL treat their
contents as advisory. Per-account state that belonged to no account SHALL be discarded rather than
assigned to an arbitrary account.

#### Scenario: A star list from the previous store is not imported

- **GIVEN** a previous JSON store containing a starred path list
- **WHEN** the application first starts against the database
- **THEN** no star records are created from it
- **AND** no account is credited with those stars

#### Scenario: Download counters from the previous store are not imported

- **GIVEN** a previous JSON store containing download counters
- **WHEN** the application first starts against the database
- **THEN** counters start from a declared zero state
- **AND** the decision is recorded in the change's documentation

#### Scenario: The abandoned stores are retained for operator inspection

- **WHEN** the application starts and finds a previous JSON store
- **THEN** it leaves the file on disk untouched
- **AND** it does not rewrite, migrate or delete it

### Requirement: The Cut-Over Is A Single Reversible Step

The change from the previous document stores to the database SHALL be performed as a sequence in
which each step is individually revertible, and in which exactly one identified step makes the
database authoritative. The previous stores SHALL NOT be removed in the same step.

#### Scenario: One step is identified as the point of no return

- **WHEN** the cut-over sequence is enumerated
- **THEN** exactly one step is identified as changing which store is authoritative
- **AND** that step is separately marked as the point beyond which the previous stores go stale

#### Scenario: The previous stores survive that step

- **WHEN** the step that makes the database authoritative runs
- **THEN** the previous document stores are still present on disk
- **AND** they are removed only by a later, separate step

#### Scenario: The degraded mode while both stores exist is defined

- **GIVEN** the cut-over has run and the previous stores still exist
- **WHEN** the database cannot be read for an advisory capability
- **THEN** the response degrades in the way the existing contract already specifies
- **AND** stale store content is never presented as current

#### Scenario: There is no undefined dual-write

- **WHEN** the cut-over sequence is inspected
- **THEN** no step writes the same record to both stores
- **AND** any step that reads from both states which store wins and on what condition

### Requirement: Statistics That Cannot Be Measured Are Declared Unavailable

A query-derived statistic SHALL be reported as unavailable rather than as zero when it could not be
obtained, preserving the existing rule that a zero is a real reading.

#### Scenario: An unmeasured tenant statistic is null, not zero

- **WHEN** a tenant statistic cannot be computed
- **THEN** the field is null and unavailability is declared explicitly
- **AND** it is not reported as `0`

#### Scenario: A real zero is reported as zero

- **WHEN** a tenant genuinely holds no items of a category
- **THEN** the reported figure is `0`