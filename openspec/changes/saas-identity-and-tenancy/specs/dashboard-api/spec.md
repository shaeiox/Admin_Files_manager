# Spec Delta

## Purpose

Extends the Dashboard summary contract so that it is authenticated, tenant-scoped, and served only to
a caller holding a permission for it, while preserving the bare response envelope, the field
contract, the nullability rules and the partial-capability failure semantics it already has.

## MODIFIED Requirements

### Requirement: Summary Field Contract

The summary SHALL continue to answer with a bare top-level object carrying its declared fields, and
those fields SHALL describe the tenant the request was served against. No field SHALL be added to
carry a tenant identifier, because the tenant is already established server-side and a client has no
legitimate need to select it.

#### Scenario: The existing field set is preserved

- **WHEN** the summary is served
- **THEN** the fields the Dashboard page already reads are present with the same meaning
- **AND** the page requires no change to render it

#### Scenario: Figures describe the caller's tenant

- **WHEN** a caller established in tenant A receives the summary
- **THEN** its file count, folder count and byte figures describe tenant A
- **AND** no figure from another tenant appears

#### Scenario: No tenant selector is exposed in the payload

- **WHEN** the summary fields are enumerated
- **THEN** no field invites a client to choose a tenant


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
### Requirement: Partial Capability Failure

A failure in an individual data source SHALL remove only that source's contribution and the response
SHALL still succeed. This continues to hold for filesystem and capacity sources, and now also for
the advisory analytics sources. A failure in the **identity** sources that establish the caller and
the tenant is not a partial failure: it SHALL fail the request rather than produce a summary without
them.

#### Scenario: An unreadable subtree degrades the totals

- **GIVEN** a directory within the caller's tenant that cannot be read
- **WHEN** the summary is produced
- **THEN** the response is still successful
- **AND** the unreadable portion is excluded and declared

#### Scenario: An unavailable capacity reading is declared, not zeroed

- **WHEN** no capacity reading can be obtained
- **THEN** the capacity fields are null and unavailability is declared
- **AND** the response is still successful

#### Scenario: An analytics failure degrades only its own fields

- **WHEN** the activity or ranking source cannot be read
- **THEN** the response is still successful
- **AND** only those collections are emptied

#### Scenario: An identity failure is not a degradation

- **GIVEN** the store that establishes the caller's identity cannot be read
- **WHEN** a summary is requested
- **THEN** the request is refused
- **AND** no summary is produced without a caller


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
### Requirement: Filesystem Router Separation

The filesystem routes SHALL remain mounted only under the filesystem prefix and SHALL NOT be
republished under the dashboard prefix. This constraint is retained and strengthened: because the
filesystem routes are now the tenant's principal data surface, republishing them would publish the
tenant's entire storage under a second prefix.

#### Scenario: No filesystem route is reachable under the dashboard prefix

- **WHEN** a filesystem route path is requested under the dashboard prefix
- **THEN** it is not served
- **AND** no filesystem handler executes for it

#### Scenario: Authorization does not justify a second mount

- **GIVEN** the filesystem routes are permission-protected
- **WHEN** the router structure is considered for a reason of convenience
- **THEN** remounting the filesystem router elsewhere remains refused
- **AND** authorization is not treated as making republication acceptable


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
## ADDED Requirements

### Requirement: The Summary Requires Authentication And A Declared Permission

The summary SHALL require an authenticated session and SHALL declare the permissions it requires.
It SHALL NOT be served anonymously.

#### Scenario: An anonymous request is refused

- **GIVEN** a caller presenting no credential
- **WHEN** it requests the summary
- **THEN** the request is refused with status `401`

#### Scenario: An authenticated caller without the permission is refused

- **GIVEN** an authenticated caller lacking the summary's required permission
- **WHEN** it requests the summary
- **THEN** the request is refused with status `403`

#### Scenario: Both API prefixes behave identically

- **WHEN** the summary is requested through the versioned prefix and through the alias
- **THEN** both are served or both refused identically
- **AND** the statuses and bodies match

### Requirement: The Summary Does Not Disclose Other Tenants' Existence

The summary and its failure modes SHALL NOT reveal whether another tenant exists, including through
counts, error text, or timing-independent response shapes.

#### Scenario: The tenant's own figures do not leak another's

- **WHEN** a caller receives the summary
- **THEN** no field aggregates, counts or names another tenant

#### Scenario: A platform-wide view is permission-gated and labelled

- **WHEN** a summary includes figures aggregated across tenants
- **THEN** the caller holds a platform-scoped permission
- **AND** the response labels those figures as platform-wide
- **AND** it does not enumerate tenants the caller has no membership in