# Spec Delta

## Purpose

Defines the durable, queryable record of who did what: which events are recorded, what each record
carries, what must never be recorded, how retention works, and the guarantee that a record cannot be
altered through the application.

## ADDED Requirements

### Requirement: Every State-Changing Action Is Recorded

Every operation that changes state SHALL produce an audit record, and SHALL produce it as part of
the request rather than as a detached side effect that a failure could discard.

#### Scenario: A successful mutation is recorded

- **WHEN** an authorized caller successfully creates, renames, uploads, downloads, stars or deletes
- **THEN** an audit record exists for that action
- **AND** it names the authenticated caller and the acting tenant

#### Scenario: A refused mutation is recorded

- **WHEN** a caller is refused because it lacks a permission
- **THEN** an audit record exists with outcome `denied`

#### Scenario: A failed mutation is recorded

- **WHEN** a mutation is attempted and fails for a reason other than authorization
- **THEN** an audit record exists with outcome `failed`

#### Scenario: Authentication events are recorded

- **WHEN** a login attempt succeeds, fails, or is refused for an active lockout
- **THEN** an audit record exists for the attempt

#### Scenario: The record is written before the response is returned

- **GIVEN** a mutating request
- **WHEN** the response is returned to the caller
- **THEN** its audit record has already been persisted

### Requirement: A Record Carries The Context Needed To Investigate

Each audit record SHALL carry the tenant, the authenticated actor, the action, the outcome, the
resource in client-path terms, the timestamp, a request identifier, and — where the caller is
authenticated — the originating address and user agent.

#### Scenario: A record identifies its actor and tenant

- **WHEN** an audit record is read
- **THEN** it names the acting account and the acting tenant

#### Scenario: A record identifies the resource without leaking a host path

- **WHEN** a record names the resource it concerns
- **THEN** it uses the client-path form
- **AND** it contains no absolute host path

#### Scenario: Correlating Fields Are Present

- **WHEN** an audit record is read
- **THEN** it carries a request identifier, a timestamp, an action, an outcome and a resource
- **AND** an authenticated action also carries an originating address and user agent

#### Scenario: Records Can Be Correlated With Server Logs

- **GIVEN** an audit record carrying a request identifier
- **WHEN** that identifier is searched for in the server log
- **THEN** the corresponding request can be located

### Requirement: Credentials And Secrets Are Never Recorded

The audit store SHALL NOT contain a plaintext password, a password hash, a session token, an
authorization header, a cookie, file content, or any other secret.

#### Scenario: A login attempt records no secret

- **WHEN** a login attempt is recorded
- **THEN** neither the submitted secret nor its hash appears in the record

#### Scenario: A session is recorded without its token

- **WHEN** a session creation or use is recorded
- **THEN** no session token appears in any record
- **AND** no field is capable of storing a recoverable token

#### Scenario: No credential material appears in any record

- **WHEN** the fields available to an audit record are enumerated
- **THEN** none of them can hold a password, a hash, a token, a header or a cookie

#### Scenario: File content is never recorded

- **WHEN** a file is uploaded, downloaded or deleted
- **THEN** no part of its content appears in any audit record

### Requirement: Records Are Append-Only Through The Application

The application SHALL provide no operation that updates or deletes an audit record, and removing an
account SHALL NOT cascade to the removal of the records that account produced.

#### Scenario: No update path exists

- **WHEN** the audit interface is enumerated
- **THEN** it offers creation and reading only
- **AND** it offers no update and no delete

#### Scenario: Removing an account preserves its records

- **GIVEN** an account with recorded actions
- **WHEN** that account is removed or deactivated
- **THEN** its audit records remain
- **AND** the actor reference is retained or anonymised rather than the record being deleted

#### Scenario: Retention Is The Only Mechanism That Discards Records

- **WHEN** audit records are removed
- **THEN** it is the retention policy acting on age
- **AND** no caller-driven deletion path exists

### Requirement: Retention Is Class-Based And Bounded

Audit records SHALL be retained for a period determined by their class, and the application SHALL
provide a mechanism that removes expired records and reclaims space.

#### Scenario: Security-relevant events are retained longest

- **WHEN** the retention periods are enumerated
- **THEN** authentication events and authorization denials are retained for the longest period of
  any class

#### Scenario: Expired Records Are Removed

- **WHEN** the retention mechanism runs
- **THEN** records older than their class's retention period are removed

#### Scenario: Space Is Reclaimed

- **WHEN** expired records have been removed
- **THEN** a reclamation step is performed so the store does not continue to occupy the removed
  space indefinitely

#### Scenario: A tenant's retention never removes another tenant's records

- **WHEN** retention runs
- **THEN** it removes only records belonging to tenants whose retention has elapsed

### Requirement: Audit Trail Completeness Is Verifiable

The application SHALL provide a way to determine whether audit recording is working, so that a
silent failure to record is detectable rather than invisible.

#### Scenario: A recording failure is detectable

- **WHEN** an audit record for a mutating action cannot be persisted
- **THEN** the failure is reported through the server log with the request identifier
- **AND** it is not reported as an unqualified success

#### Scenario: Recording health Can Be Inspected

- **WHEN** audit recording health is inspected
- **THEN** the result distinguishes a working recorder from a failing one

### Requirement: Audit Access Is Itself Controlled

Reading audit records SHALL require a permission, and audit records SHALL NOT be returned to a
caller who cannot read them.

#### Scenario: Reading the audit trail requires a permission

- **WHEN** a caller without the audit-read permission requests audit records
- **THEN** the request is refused

#### Scenario: An audit read is itself recorded

- **WHEN** an audit trail is read
- **THEN** that read is recorded as an audit event

#### Scenario: Audit records are scoped to the reader's tenant

- **GIVEN** two tenants
- **WHEN** a caller in tenant A reads the audit trail
- **THEN** the result contains only tenant A's records