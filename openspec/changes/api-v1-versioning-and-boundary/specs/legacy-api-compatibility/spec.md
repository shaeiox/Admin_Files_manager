# Spec Delta

## Purpose

Defines the compatibility model for the existing unversioned API surface: that it continues to be
served by the same handlers as a deliberate alias rather than a frozen copy, that its removal is not
part of this change, and that reverting to it is a configuration-only step with no data migration.

## ADDED Requirements

### Requirement: The Unversioned Surface Continues To Serve

Every endpoint that exists today under the unversioned API prefix SHALL continue to answer, with the
same status codes and the same response shapes it has today.

#### Scenario: An existing read endpoint is unchanged

- **WHEN** a client issues a request to an endpoint's unversioned path
- **THEN** the response status and body shape are identical to its behaviour before this change

#### Scenario: An existing mutating endpoint is unchanged

- **GIVEN** an unauthenticated client issues a mutating request to an endpoint's unversioned path
- **WHEN** the request is processed
- **THEN** it performs the same operation, with the same guards and the same status codes, as before this change

#### Scenario: The alias adds no capability

- **WHEN** the set of handlers reachable under the unversioned prefix is compared with the set
  reachable before this change
- **THEN** the two sets are identical
- **AND** no new operation is reachable under the unversioned prefix

### Requirement: The Two Prefixes Are One Implementation

The unversioned prefix SHALL be served by the same router instances as the versioned prefix, so that a
fix or a guard applied to an endpoint applies to both simultaneously.

#### Scenario: A behaviour change lands on both prefixes together

- **GIVEN** a change is made to the handler, guard or middleware of an endpoint
- **WHEN** that endpoint is exercised
- **THEN** the change is observable on the versioned prefix and on the unversioned prefix
- **AND** no separate maintenance of the two paths is required

#### Scenario: The prefixes are not independently patchable

- **WHEN** the route declarations are inspected
- **THEN** there is no unversioned-only route declaration and no versioned-only route declaration
- **AND** the two prefixes cannot be given divergent behaviour by editing one of them

### Requirement: Removal Is Not Part Of This Change

The unversioned surface SHALL NOT be removed, disabled, or restricted by this change. Its removal
SHALL require a separate, explicitly approved decision.

#### Scenario: No unversioned endpoint is withdrawn

- **WHEN** this change is applied
- **THEN** every unversioned endpoint that answered before still answers
- **AND** no previously accepted request is now refused

#### Scenario: Removal requires its own decision record

- **GIVEN** a proposal to remove the unversioned surface
- **WHEN** it is raised
- **THEN** it is raised as a separate change with its own compatibility and migration analysis
- **AND** it is not folded into a versioning change

#### Scenario: Removal is blocked until authentication exists

- **GIVEN** the service has no authentication
- **WHEN** the removal of the unversioned surface is considered
- **THEN** removal is deferred, because removing an alias does not reduce the exposure that
  authentication is required to close
- **AND** the deferral is recorded rather than resolved by removing the alias

### Requirement: The Alias Is Not Presented As A Separate Contract

The unversioned surface SHALL be documented as a compatibility alias of the versioned contract, not
as an independently versioned contract that may drift.

#### Scenario: Consumers are directed to the versioned prefix

- **WHEN** the API documentation is read
- **THEN** the versioned prefix is presented as the contract consumers should use
- **AND** the unversioned prefix is documented as retained for existing callers

#### Scenario: The two prefixes are not free to diverge

- **GIVEN** documentation describes both prefixes
- **WHEN** a consumer compares them
- **THEN** the unversioned prefix is documented as serving the same contract
- **AND** no document claims the unversioned prefix may hold a different or older behaviour

### Requirement: Rollback Is Configuration-Only

Reverting the frontend to the unversioned surface SHALL require no data migration, no state change and
no server-side rollback, because both prefixes are served by the same unchanged handlers.

#### Scenario: A client can be pointed back at the unversioned prefix

- **GIVEN** the frontend is addressing the versioned prefix
- **WHEN** its API base URL configuration is changed to the unversioned prefix
- **THEN** every frontend feature works against the unversioned surface
- **AND** no stored data, setting or file is affected

#### Scenario: Rollback does not require a server change

- **WHEN** the frontend is reverted to the unversioned prefix
- **THEN** no server restart with different routes is required
- **AND** no endpoint is added, removed or reconfigured to make the revert work

#### Scenario: Forward and backward moves are both configuration-only

- **WHEN** the configured base URL is changed in either direction
- **THEN** no migration step is required in that direction either
