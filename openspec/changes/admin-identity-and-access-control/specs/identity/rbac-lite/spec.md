# Spec Delta

## Purpose

Defines the two-value role distinction this application uses to gate administrator-only
functionality — deliberately not a permission catalogue, scoped role grants, or any
tenant-relative concept.

## ADDED Requirements

### Requirement: Role Is A Two-Value, Database-Enforced Enum

Every user SHALL carry exactly one role, `admin` or `user`, enforced by a database constraint, not
by application-level convention alone.

#### Scenario: Only two role values are accepted

- **WHEN** a user row is created or updated with a role outside `{admin, user}`
- **THEN** the write is rejected by the database constraint

#### Scenario: A new user defaults to the lower-privilege role

- **WHEN** a user is created without an explicit role
- **THEN** its role is `user`, never `admin`

### Requirement: Administrator-Only Routes Check Role At The Route Layer

Every route that creates, disables, deletes, or resets another user, or that manages a file-access
policy or permission, SHALL require the caller's role to be `admin`, checked by a shared
middleware rather than ad hoc per-controller logic.

#### Scenario: A non-admin session is refused an admin-only route

- **GIVEN** an authenticated session whose user has role `user`
- **WHEN** that session calls an admin-only route
- **THEN** the request is refused with `403`

#### Scenario: An admin session succeeds on an admin-only route

- **GIVEN** an authenticated session whose user has role `admin`
- **WHEN** that session calls an admin-only route
- **THEN** the request proceeds to its handler

#### Scenario: The same middleware gates every admin-only route

- **WHEN** the admin-only routes added by this change are inspected
- **THEN** each one applies the same `requireAdmin` middleware
- **AND** no route re-implements its own role comparison

### Requirement: An Ordinary User's Own Capability Is Unaffected By This Change

A `user`-role account's ability to use this application's existing, non-admin functionality SHALL
be governed by authentication alone (does a valid session exist), not by a per-feature permission
this change does not introduce.

#### Scenario: A non-admin user reaches ordinary, non-admin routes

- **GIVEN** an authenticated session whose user has role `user`
- **WHEN** that session calls an existing filesystem/dashboard/settings route unrelated to admin
  management
- **THEN** the request is not refused on account of role

### Requirement: There Is No Permission Catalogue

This change SHALL NOT introduce a `Role`, `Permission`, or `UserRole` table, or any scoped
(platform/tenant) grant model.

#### Scenario: No permission-catalogue table exists

- **WHEN** the database schema introduced by this change is inspected
- **THEN** no table expresses a configurable permission grant beyond the `users.role` column
