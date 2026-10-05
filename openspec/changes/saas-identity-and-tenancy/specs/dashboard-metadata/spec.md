# Spec Delta

## Purpose

Replaces the JSON metadata store with database-backed repositories while **preserving** the two
observable contracts that page modules already depend on: the activity record shape and the
server-side download ranking. The store's lazy filesystem bootstrap and its fire-and-forget
discipline are narrowed, because both were properties of the JSON document rather than of the
behaviour.

## MODIFIED Requirements

### Requirement: Activity Shape Is Reused, Not Redesigned

The Dashboard SHALL consume the existing activity representation and SHALL NOT introduce a second
activity schema. The activity records presented to the client SHALL continue to carry the fields
the page modules read, so that no page module's parsing changes.

#### Scenario: Existing consumers keep parsing the same fields

- **GIVEN** a page module that reads an activity's type, target, folder and time
- **WHEN** activities are served from the new store
- **THEN** those fields are present with the same meaning
- **AND** the page module requires no change to parse them

#### Scenario: No second activity schema is introduced

- **WHEN** the activity surface is enumerated
- **THEN** exactly one activity representation is served to clients

#### Scenario: An activity now names a real actor

- **WHEN** an activity produced by an authenticated action is served
- **THEN** it identifies the account that performed the action
- **AND** it does not carry the placeholder identity the store used previously


#### Scenario: Existing activity fields are preserved

- **WHEN** an activity is returned to the Dashboard
- **THEN** it carries the fields the store already persists: action, target, timestamp, and type
- **AND** no field is renamed or restructured for Dashboard convenience

#### Scenario: Single activity schema exists

- **WHEN** both the Dashboard and the filesystem endpoints return activities
- **THEN** both use the same shape
- **AND** no parallel Dashboard-specific activity representation is introduced
### Requirement: Metadata Failures Never Block Filesystem Operations

A failure to record **advisory analytics** — a download counter or an activity record — SHALL NOT
cause the filesystem operation it accompanies to fail. This requirement is narrowed: a failure to
record an **audit** record for a mutating action is governed by the audit capability, not by this
one, and SHALL NOT be treated as a silently swallowed success.

#### Scenario: Download recording failure does not fail the download

- **WHEN** a download succeeds on the filesystem but recording its counter fails
- **THEN** the download response is still successful
- **AND** the failure is swallowed rather than propagated

#### Scenario: Activity recording failure does not fail the write

- **WHEN** a filesystem mutation succeeds but recording its activity fails
- **THEN** the mutation response is still successful
- **AND** no error is surfaced to the client

#### Scenario: The narrowing to audit is explicit

- **WHEN** a mutating action succeeds but its audit record cannot be persisted
- **THEN** the behaviour is the one the audit capability specifies
- **AND** it is not decided by this requirement

## REMOVED Requirements

### Requirement: Metadata Store Bootstraps Lazily

**Reason**: This requirement exists entirely because the store was a JSON document that had to
create its own directory and file on first use, on a fresh checkout, without raising a filesystem
error. A relational store under a data directory that the deployment contract already requires to
exist is not bootstrapped by the store; it is created by the deployment, and its absence on a host
that has run before is a refusal condition rather than a first-run condition.

**Migration**: The deployment contract for the store's location and its refusal behaviour is
specified in `persistence/database`.

## ADDED Requirements

### Requirement: Analytics Are Tenant-Scoped And Separated By Semantics

Analytics SHALL be scoped to the tenant, and per-account state SHALL be stored per account rather
than globally, so that one account's personal state is never visible to another.

#### Scenario: A star belongs to an account

- **GIVEN** an account that stars a file
- **WHEN** another account in the same tenant lists its starred files
- **THEN** the other account's starred view does not include that file

#### Scenario: Download Counters Are Tenant-Level

- **GIVEN** several accounts in one tenant downloading the same file
- **WHEN** the tenant's top-downloads ranking is computed
- **THEN** the counter reflects the tenant's aggregate
- **AND** it is not attributable to, or readable as, one account's activity

#### Scenario: Rankings Never Span Tenants

- **GIVEN** two tenants with download activity
- **WHEN** a top-downloads ranking is produced
- **THEN** it contains only the requesting tenant's files

#### Scenario: Per-Browser Preferences Are Not Migrated

- **GIVEN** per-browser view preferences held by a caller
- **WHEN** the database store is introduced
- **THEN** those preferences remain per-browser
- **AND** no server-side per-account preference record is created for them by this change