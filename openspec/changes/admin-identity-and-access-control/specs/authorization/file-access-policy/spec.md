# Spec Delta

## Purpose

Defines the per-file publication and access-policy data model an administrator manages: access
mode, publish/lock state, availability window, and per-user permission grants — and states
how it is enforced against every filesystem endpoint for non-administrator sessions.

## ADDED Requirements

### Requirement: A Policy Is Stored Per Path, And A Folder's Policy Covers Its Contents

An administrator SHALL be able to set an access policy on an individual file or folder path. Each
policy is stored on its own path only; at enforcement time a folder's policy also governs everything
below it (see "Policies Are Enforced For Every Non-Administrator Session").

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

A file's `is_published` and `is_locked` flags SHALL be independently settable. A locked file is
refused regardless of publication, so locking keeps the publication state and window intact for
when the lock is lifted.

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

### Requirement: Policies Are Enforced For Every Non-Administrator Session

Every filesystem endpoint (`GET /list`, `GET /tree`, `GET /download`, `POST /download-zip`,
`GET /thumbnail`, and the mutating `/fs` endpoints) and the dashboard summary SHALL consult the
caller's effective access before serving or changing a path. An administrator SHALL never be
restricted. A path with no policy on itself or any ancestor SHALL remain open to every signed-in
user. Otherwise every policy on the path, ancestors included, SHALL allow: not locked, published,
inside its availability window, and — for `restricted` — an explicit `grant` for that user.

#### Scenario: A locked file is refused like a missing one

- **GIVEN** a file with a locked policy
- **WHEN** a non-administrator requests it through `GET /download`
- **THEN** the response is `404` with the same body shape as a path that does not exist

#### Scenario: A folder's policy covers its contents

- **GIVEN** a folder with a locked policy and a file inside it with a permissive policy
- **WHEN** a non-administrator requests that file
- **THEN** the request is refused

#### Scenario: Hidden entries are omitted from a listing and its totals

- **WHEN** a non-administrator lists a folder holding hidden and visible entries
- **THEN** only the visible entries are returned, and `total`/`counts` count only them

#### Scenario: A subtree operation never acts on what the caller cannot see

- **GIVEN** a folder containing a hidden file
- **WHEN** a non-administrator deletes, moves, renames or copies that folder
- **THEN** the request is refused with `403` and nothing changes on disk

#### Scenario: An administrator is never restricted

- **GIVEN** a file with a locked policy
- **WHEN** an administrator downloads it
- **THEN** it is served

#### Scenario: The admin UI describes enforcement truthfully

- **WHEN** an administrator views the policies pane
- **THEN** the UI states who is restricted, that a folder's policy covers its contents, and that
  paths without a policy stay open