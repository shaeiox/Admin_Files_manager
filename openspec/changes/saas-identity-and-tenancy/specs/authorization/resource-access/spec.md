# Spec Delta

## Purpose

Defines the resource model and the policy engine that decide whether an authenticated principal may
operate on a particular path: which filesystem entries carry a record, how directory records
inherit policy to descendants, how time-bounded policies are evaluated, and the rule that
authorization happens before any filesystem access rather than after.

## ADDED Requirements

### Requirement: Resource Records Cover Directories And The Tenant Root

The application SHALL persist a resource record for each directory within a tenant and for the
tenant root, and SHALL NOT persist a record for every individual physical file. Physical files
SHALL remain on the filesystem, and the filesystem SHALL remain authoritative for whether a file
exists and what it contains.

#### Scenario: A directory has a resource record

- **WHEN** a directory is created within a tenant
- **THEN** a resource record exists for it, carrying its tenant and its parent directory

#### Scenario: The tenant root has a resource record

- **WHEN** a tenant is created
- **THEN** a resource record exists for the tenant root, carrying no parent

#### Scenario: A file has no resource record

- **GIVEN** a tenant directory containing a regular file
- **WHEN** the resource records for that tenant are enumerated
- **THEN** no record exists for that file

#### Scenario: File existence is answered by the filesystem

- **WHEN** a file's presence, size or modification time is needed
- **THEN** that information is read from the filesystem
- **AND** no resource record is consulted or written for that purpose

### Requirement: A Resource Record Never Directs Filesystem Access On Its Own

A resource record SHALL NOT be used as the source of a filesystem path. Every path SHALL first be
resolved through the path-containment boundary and only then used to look up a resource record, so
that a stale or tampered record cannot redirect a read or a write.

#### Scenario: Resolution precedes record lookup

- **WHEN** an operation targets a client path
- **THEN** the path is resolved and verified against the tenant root first
- **AND** the resolved path is then used to find the governing resource record

#### Scenario: A record pointing outside the tenant root cannot redirect a write

- **GIVEN** a resource record whose recorded location lies outside its tenant root
- **WHEN** an operation uses that record to determine where to write
- **THEN** the write does not occur outside the tenant root

### Requirement: The Nearest Ancestor Record Governs A Path

For a path with no resource record of its own, the governing record SHALL be the nearest ancestor
that has one, so that a directory created outside the application still inherits policy.

#### Scenario: A file inherits its directory's record

- **GIVEN** a resource record for directory `/projects`
- **WHEN** a permission decision is made for `/projects/report.txt`
- **THEN** the record governing the decision is the one for `/projects`

#### Scenario: An unrecorded directory inherits its nearest recorded ancestor

- **GIVEN** a resource record for the tenant root
- **AND** a directory that has no record of its own
- **WHEN** a permission decision is made inside that directory
- **THEN** the tenant root's record governs the decision

#### Scenario: The tenant root is the final fallback

- **GIVEN** no ancestor of a path has a resource record other than the tenant root
- **WHEN** a permission decision is made
- **THEN** the tenant root's record governs the decision
- **AND** the decision is not left unevaluated

### Requirement: Policy Is Evaluated Before Any Filesystem Access

A permission decision against a specific resource SHALL be completed before the operation reads,
streams, creates, renames or deletes anything, and before any archive is constructed.

#### Scenario: A download is refused before the stream is opened

- **GIVEN** a caller lacking read permission on a directory
- **WHEN** it requests a file inside that directory
- **THEN** the request is refused with status `403`
- **AND** no filesystem read is issued for the file

#### Scenario: An archive is refused before construction

- **GIVEN** a caller requests an archive over several paths
- **AND** one of those paths resolves to a directory the caller may not read
- **WHEN** the request is processed
- **THEN** the request is refused
- **AND** no archive is constructed and no bytes of the archive are produced

#### Scenario: A destructive operation is refused before it runs

- **GIVEN** a caller lacking delete permission on a directory
- **WHEN** it requests deletion of a file inside that directory
- **THEN** the request is refused
- **AND** no filesystem deletion is issued

### Requirement: Authorization Is Atomic Across A Batch

When a request names several resources, the application SHALL validate and authorize **all** of
them before performing **any** mutation, so that a batch never partially succeeds because one of
its members failed authorization.

#### Scenario: One unauthorized member refuses the whole batch

- **GIVEN** a batch of paths where one resolves to a directory the caller may not modify
- **WHEN** the caller submits the batch
- **THEN** the request is refused with status `403`
- **AND** no member of the batch is deleted, renamed or written

#### Scenario: Validation precedes authorization

- **GIVEN** a batch containing a malformed path and a well-formed unauthorized path
- **WHEN** the caller submits the batch
- **THEN** the request is refused for the malformed path
- **AND** no mutation is attempted for any member

#### Scenario: Authorization precedes any mutation

- **WHEN** the order of a batch's validation, authorization and mutation phases is observed
- **THEN** every member is validated
- **AND** every member is authorized
- **AND** only then is any member mutated

### Requirement: Denials And Missing Resources Are Indistinguishable Across Tenants

A resource that belongs to another tenant SHALL produce the same observable response as a resource
that does not exist, so that a caller cannot enumerate another tenant's tree.

#### Scenario: Another tenant's resource reads as missing

- **GIVEN** a path that exists in tenant B
- **WHEN** it is requested while authenticated as tenant A
- **THEN** the response status is the not-found status
- **AND** the response body is identical to the response for a path that exists nowhere

#### Scenario: Same-tenant unauthorized access is distinguishable

- **GIVEN** a path that exists in the caller's own tenant
- **AND** the caller lacks the required permission on it
- **WHEN** it is requested
- **THEN** the response status is the forbidden status

#### Scenario: A traversal attempt and a missing path look alike

- **GIVEN** a client path that would escape the caller's tenant root
- **WHEN** it is requested
- **THEN** the response is the not-found status
- **AND** it is not reported as a successful resolution outside the tenant

### Requirement: Policy Evaluation Is Deterministic And Fails Closed

Where several policies apply to one decision — because a policy exists at more than one level of
the hierarchy, or because more than one policy names the same principal — the combination SHALL be
resolved by a stated precedence rule, and an unresolvable combination SHALL deny access.

#### Scenario: A denial at any applicable level withholds access

- **GIVEN** an allowing policy at an ancestor resource
- **AND** a denying policy at a more specific resource for the same principal and permission
- **WHEN** the access decision is made
- **THEN** access is denied
- **AND** the denial is not overridden by the ancestor's allowance

#### Scenario: A denial Outranks An Allowance Regardless Of Validity

- **GIVEN** an applicable denying policy and an applicable allowing policy
- **WHEN** the access decision is made
- **THEN** the denial determines the outcome
- **AND** the outcome is the same whether the denial's validity window is open or closed

#### Scenario: An Expired Denial Does Not Become An Allowance

- **GIVEN** a denying policy whose validity window has ended
- **AND** no applicable allowing policy
- **WHEN** the access decision is made
- **THEN** access is denied
- **AND** the elapsed window does not result in access being granted

#### Scenario: An Expired Allowance Does Not Grant Access

- **GIVEN** an allowing policy whose validity window has ended
- **WHEN** the access decision is made
- **THEN** that policy does not contribute to granting access

#### Scenario: Several Allowances Do Not Compound Into Something More

- **GIVEN** several applicable allowing policies at different levels
- **WHEN** the access decision is made
- **THEN** the outcome is a single allowance for the permission asked about
- **AND** it does not combine into any broader capability

#### Scenario: An Unresolvable Combination Denies

- **GIVEN** applicable policies whose combination cannot be resolved by the precedence rule
- **WHEN** the access decision is made
- **THEN** access is denied
- **AND** the ambiguity is recorded rather than resolved in favour of access

### Requirement: Resolution Uses A Stated Lookup Strategy

The governing record for a path SHALL be found by one stated, indexed strategy, and that strategy
SHALL be stated rather than left to a general-purpose lookup.

#### Scenario: The Governing Record Is Found By The Stated Strategy

- **WHEN** a path with no record of its own is resolved
- **THEN** its governing record is located by the documented strategy
- **AND** that strategy is served by a declared index

#### Scenario: The Lookup Does Not Scan The Whole Table

- **WHEN** the governing record for a path is resolved
- **THEN** the lookup is served by a declared index
- **AND** it does not require a full scan of the resource records

### Requirement: Authorization Is Batched For A Listing

A request that enumerates several entries SHALL resolve the governing records and applicable
policies for those entries in a bounded number of queries, rather than issuing a separate lookup per
entry, while still applying the same decision rule to each entry.

#### Scenario: A Listing Resolves In A Bounded Number Of Queries

- **WHEN** a directory listing of many entries is served
- **THEN** the number of data-store queries does not grow in proportion to the entry count
- **AND** each entry still receives an individual decision

#### Scenario: Batching Does Not Weaken The Decision

- **WHEN** entries in one listing resolve their governing records in a batch
- **THEN** an entry whose decision would be a denial is still individually refused
- **AND** an entry in another tenant is still refused

#### Scenario: A Batched Decision Cannot Straddle A Tenant

- **WHEN** a batched resolution is issued
- **THEN** it is constrained to the acting tenant
- **AND** no record from another tenant participates in any entry's decision

### Requirement: Policies Are Time-Bounded And Evaluated At Request Time

A policy SHALL be able to declare a validity window, and a policy whose window does not include the
moment of the request SHALL NOT contribute to granting access.

#### Scenario: A policy inside its window grants access

- **GIVEN** an allowing policy whose validity window includes the current time
- **WHEN** the caller requests the resource
- **THEN** access is granted

#### Scenario: A policy before its window does not grant access

- **GIVEN** an allowing policy whose validity window has not yet begun
- **WHEN** the caller requests the resource
- **THEN** that policy does not contribute to granting access

#### Scenario: A policy after its window does not grant access

- **GIVEN** an allowing policy whose validity window has ended
- **WHEN** the caller requests the resource
- **THEN** that policy does not contribute to granting access

#### Scenario: The window is evaluated per request

- **GIVEN** an allowing policy whose validity window is currently closed
- **WHEN** the window later opens and the caller repeats the request
- **THEN** access is then granted without any configuration change

### Requirement: Policies Inherit To Descendant Directories

A policy attached to a directory SHALL apply to that directory and to the resources beneath it,
unless a more specific policy at a descendant directory overrides it for the same principal and
permission.

#### Scenario: A directory policy applies to a descendant file

- **GIVEN** an allowing policy on directory `/projects`
- **WHEN** the caller requests `/projects/sub/deep/file.txt`
- **THEN** the directory's policy governs that decision

#### Scenario: A descendant policy takes precedence

- **GIVEN** an allowing policy on `/projects`
- **AND** a policy at `/projects/restricted` that withholds the same permission from the same
  principal
- **WHEN** the caller requests a file under `/projects/restricted`
- **THEN** the decision is governed by the policy at the more specific directory

#### Scenario: A policy on a sibling does not apply

- **GIVEN** an allowing policy on `/projects/a`
- **WHEN** the caller requests a file under `/projects/b`
- **THEN** the policy on `/projects/a` does not govern that decision

### Requirement: Policies Address Authenticated Principals Only

A policy SHALL name an authenticated principal — an account or a role — and the application SHALL
NOT provide a policy form that grants access to an unauthenticated caller. There SHALL be no
unauthenticated file-read path.

#### Scenario: A policy names an account or a role

- **WHEN** a policy is created
- **THEN** it names either an account or a role as its subject

#### Scenario: No anonymous or public policy form exists

- **WHEN** the policy model is enumerated
- **THEN** no policy subject denotes an unauthenticated or anonymous caller
- **AND** no endpoint grants file access without an authenticated principal

#### Scenario: An unauthenticated request is refused regardless of policy configuration

- **GIVEN** any policy configuration
- **WHEN** a caller presenting no credential requests a tenant-owned resource
- **THEN** the request is refused

### Requirement: An Active Operation May Be Declared On A Resource

A resource SHALL be able to carry a state that blocks new write operations on it, so that a
maintenance or hold state is representable without deleting or renaming content.

#### Scenario: A held resource refuses new writes

- **GIVEN** a resource whose state withholds writing
- **WHEN** an authorized caller attempts to write to it
- **THEN** the request is refused
- **AND** the refusal does not delete or move the resource's content

#### Scenario: Reads remain governed by read permissions alone

- **GIVEN** a resource whose state withholds writing
- **WHEN** an authorized caller reads it
- **THEN** the read succeeds
- **AND** the decision did not depend on the write-hold state

### Requirement: A Record For A Vanished Directory Is Tolerated

When a directory bearing a resource record no longer exists on the filesystem, the application
SHALL behave as it does for a missing path and SHALL NOT surface the stale record as an internal
failure.

#### Scenario: A stale record reads as missing

- **GIVEN** a resource record whose directory has been removed from the filesystem
- **WHEN** the path is requested
- **THEN** the response is the not-found status
- **AND** no internal error is reported to the caller

#### Scenario: The stale record does not authorize anything

- **WHEN** a permission decision involves a path whose directory is absent
- **THEN** the operation does not proceed

### Requirement: Vanished Resource Records Are Reconciled

Records whose directories no longer exist SHALL be removable by a reconciliation operation that is
idempotent, bounded, and observable, so that the record set converges on the filesystem instead of
accumulating indefinitely.

#### Scenario: Reconciliation Removes Only Records Without A Directory

- **WHEN** reconciliation runs
- **THEN** it removes the records whose directories are absent from the filesystem
- **AND** it retains every record whose directory is present

#### Scenario: Reconciliation Is Idempotent

- **WHEN** reconciliation runs twice in succession with no filesystem change between
- **THEN** the second run removes nothing
- **AND** both runs complete successfully

#### Scenario: Reconciliation Is Bounded And Non-Blocking

- **WHEN** reconciliation runs
- **THEN** it processes at most a stated number of records per invocation
- **AND** a partial pass leaves the remainder for the next invocation
- **AND** it does not block request handling

#### Scenario: Reconciliation Is Scoped To One Tenant At A Time

- **WHEN** reconciliation runs
- **THEN** it is constrained to the tenant it is run for
- **AND** it never removes a record belonging to another tenant

#### Scenario: Reconciliation Is Observable

- **WHEN** reconciliation removes records
- **THEN** the count removed and the tenant it ran for are recorded in the server log
- **AND** a run that removes nothing records that it found nothing to remove

#### Scenario: A Reconciliation Race With A Live Deletion Is Safe

- **GIVEN** a directory is being deleted while reconciliation runs
- **WHEN** reconciliation evaluates its record
- **THEN** the outcome is the same as evaluating a directory that is already gone
- **AND** no internal failure is produced

### Requirement: Stale Personal Annotations Are Defined

A stored mark that names a path SHALL have a stated, deterministic behaviour when that path no
longer exists or is no longer readable by the marking account, and that behaviour SHALL NOT reveal
whether the path exists in another tenant.

#### Scenario: A Mark On A Vanished Path Is Omitted From Results

- **GIVEN** an account marked a path that has since been deleted
- **WHEN** that account requests a listing filtered to its marks
- **THEN** the vanished path does not appear in the results
- **AND** no error is surfaced for it

#### Scenario: A Mark On A Path The Account May No Longer Read Is Omitted

- **GIVEN** an account marked a path it could once read
- **AND** a policy change means it may no longer read that path
- **WHEN** that account requests a listing filtered to its marks
- **THEN** the path does not appear
- **AND** the omission is indistinguishable from the path not existing

#### Scenario: Omission Does Not Reveal Another Tenant

- **GIVEN** a mark whose path resolves into another tenant
- **WHEN** the marking account requests its marked paths
- **THEN** the response contains no entry for it
- **AND** the response carries no status, field or message distinguishing that case from a path
  that never existed

#### Scenario: An Omitted Mark Is Retained For The Owner

- **GIVEN** a mark whose path is temporarily unreadable
- **WHEN** the account regains read access to that path
- **THEN** the mark is presented again
- **AND** the omission did not destroy it