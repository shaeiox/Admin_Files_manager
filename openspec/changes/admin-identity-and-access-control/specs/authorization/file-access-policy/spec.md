# Spec Delta

## Purpose

Defines the per-file publication and access-policy data model an administrator manages: access
mode, publish/lock state, availability window, and per-user permission grants — and states
plainly that this change does not wire any of it into a real download decision.

## ADDED Requirements

### Requirement: A File-Access Policy Is Per-File, Not Inherited From A Directory

An administrator SHALL be able to set an access policy on an individual file path. There is no
directory-level policy and no inheritance from a parent path.

#### Scenario: Setting a policy on one file does not affect its siblings

- **GIVEN** two files in the same directory, neither with a policy
- **WHEN** an administrator sets a policy on one of them
- **THEN** the other file has no policy

#### Scenario: A path with no policy has no row

- **WHEN** a path an administrator has never touched is inspected
- **THEN** no `files` row and no `file_access_policies` row exists for it

### Requirement: Access Mode Has Exactly Three Values

A file's `access_mode` SHALL be one of `public`, `authenticated`, or `restricted`, enforced by a
database constraint.

#### Scenario: An out-of-range access mode is rejected

- **WHEN** a policy is written with an `access_mode` outside the three allowed values
- **THEN** the write is rejected by the database constraint

#### Scenario: A newly-created policy defaults to the most restrictive mode

- **WHEN** a policy is created without an explicit access mode
- **THEN** its access mode is `restricted`, not `public`

### Requirement: Publication And Lock Are Independent Flags

A file's `is_published` and `is_locked` flags SHALL be independently settable. A locked file's
intended behavior is "no access regardless of publication," even though this change does not yet
wire that intent into a real download path (see the enforcement note below).

#### Scenario: An unpublished file's policy can still be edited

- **GIVEN** a file whose policy has `is_published = false`
- **WHEN** an administrator changes its access mode or availability window
- **THEN** the change is saved without requiring publication first

#### Scenario: Locking and publication are set independently

- **WHEN** an administrator locks a published file
- **THEN** `is_locked` becomes true and `is_published` is unchanged

### Requirement: An Availability Window Is Optional And Independently Boundaryless

A policy MAY carry `available_from` and/or `available_until`. Either, both, or neither MAY be set;
an unset bound means no limit on that side.

#### Scenario: A policy with no availability window has no time limit

- **WHEN** a policy is created with both bounds unset
- **THEN** the policy's intended availability is unbounded in both directions

#### Scenario: Only a start bound is set

- **WHEN** a policy has `available_from` set and `available_until` unset
- **THEN** the policy's intended availability has a start time and no end time

### Requirement: A Restricted File's Per-User Permission Is An Explicit Grant Or Deny

For a `restricted` file, a specific user's access intent SHALL be recorded as exactly one row —
`grant` or `deny` — per `(file_id, user_id)` pair. Setting a new value for the same pair SHALL
replace the existing row, not create a second one.

#### Scenario: Granting a user permission creates one row

- **WHEN** an administrator grants a user permission on a restricted file
- **THEN** exactly one `user_file_permissions` row exists for that `(file, user)` pair with
  `permission = 'grant'`

#### Scenario: Changing a grant to a deny replaces the row

- **GIVEN** an existing `grant` row for a `(file, user)` pair
- **WHEN** an administrator sets that pair to `deny`
- **THEN** the same row is updated to `permission = 'deny'`
- **AND** no second row is created for that pair

#### Scenario: Revoking a permission removes the row

- **GIVEN** an existing permission row for a `(file, user)` pair
- **WHEN** an administrator revokes it
- **THEN** no row remains for that pair

### Requirement: A Policy Survives An Administrator-Initiated Rename, Not An Unobserved One

When a file governed by a policy is renamed or deleted through this application's existing
filesystem endpoints, the corresponding `files` row SHALL be kept in step on a best-effort basis,
without making the filesystem operation's success depend on it.

#### Scenario: Renaming a governed file updates its policy's path

- **GIVEN** a file with a policy, renamed through the existing rename endpoint
- **WHEN** the rename succeeds
- **THEN** the `files` row's `client_path` is updated to the new path on a best-effort basis
- **AND** the rename response is unaffected by whether that update succeeds

#### Scenario: Deleting a governed file removes its policy

- **GIVEN** a file with a policy, deleted through the existing delete endpoint
- **WHEN** the delete succeeds
- **THEN** the corresponding `files`/`file_access_policies`/`user_file_permissions` rows are
  removed on a best-effort basis
- **AND** the delete response is unaffected by whether that removal succeeds

### Requirement: This Change Enforces Nothing Against A Real Download

This change SHALL NOT modify any existing filesystem read endpoint (`GET /list`, `GET /tree`,
`GET /download`, `GET /download-zip`, `GET /thumbnail`) to consult a file's access policy or
permission before serving it. The admin UI SHALL disclose this plainly rather than implying a
policy currently restricts real access.

#### Scenario: An existing download endpoint ignores policy data

- **GIVEN** a file with a `restricted` policy and no granted users
- **WHEN** that file is requested through the existing, unmodified download endpoint
- **THEN** the request is served exactly as it would be with no policy at all

#### Scenario: The admin UI discloses that enforcement is not yet wired

- **WHEN** an administrator views or sets a file's policy in the admin UI
- **THEN** the UI states that the policy does not yet affect what this application serves
- **AND** no control or success message implies real access is currently restricted
