# Spec Delta

## Purpose

Defines role-based access control as a data model rather than a column: the permission catalogue,
roles, the grants that connect them to accounts, the two administrative scopes, and the rule that
every protected endpoint declares the permission it requires.

## ADDED Requirements

### Requirement: Permissions Are A Named Catalogue

The application SHALL define permissions as named records in a catalogue, and SHALL express every
authorization decision in terms of those names rather than in terms of a role name or an account
attribute compared in code.

#### Scenario: Authorization decisions name a permission

- **WHEN** a protected endpoint declares what it requires
- **THEN** it declares one or more catalogue permission names
- **AND** it does not compare a role name or an account field directly

#### Scenario: The catalogue is data, not code branches

- **WHEN** a permission is added to the catalogue with no role bound to it
- **THEN** no endpoint behaviour changes
- **AND** the permission grants nothing until a role is bound to it

#### Scenario: Every catalogue name is unique

- **WHEN** two permissions are defined
- **THEN** they have distinct names

### Requirement: Roles Group Permissions

A role SHALL be a named grouping of catalogue permissions, and an account's effective permissions
SHALL be the union of the permissions of the roles bound to it within the acting scope.

#### Scenario: A role confers its permissions

- **GIVEN** a role bound to permissions `fs.read` and `fs.list`
- **WHEN** an account holding that role requests an endpoint requiring `fs.list`
- **THEN** the request is permitted

#### Scenario: Permissions from several roles are unioned

- **GIVEN** an account holding a role granting `fs.read` and a role granting `fs.write`
- **WHEN** its effective permission set is computed
- **THEN** the set contains both `fs.read` and `fs.write`

#### Scenario: A permission not granted by any held role is refused

- **GIVEN** an account whose held roles do not grant `fs.delete`
- **WHEN** it requests an endpoint requiring `fs.delete`
- **THEN** the request is refused with status `403`

### Requirement: Role Bindings Are Scoped To Platform Or Tenant

A role SHALL be bound to an account's membership with an explicit scope that is either platform or
tenant, so that a platform-wide grant and a tenant-local grant are distinguishable and neither is
inferred from the absence of a tenant.

#### Scenario: A tenant-scoped binding grants only within its tenant

- **GIVEN** an account holding a tenant-scoped role binding in tenant A
- **WHEN** it acts in tenant A
- **THEN** the role's permissions apply
- **WHEN** it acts in tenant B
- **THEN** the role's permissions do not apply

#### Scenario: A platform-scoped binding applies across tenants

- **GIVEN** an account holding a platform-scoped role binding
- **WHEN** it acts in any tenant it has a membership in
- **THEN** the role's permissions apply in each of those tenants

#### Scenario: Scope is never absent

- **WHEN** a role binding is persisted
- **THEN** it carries an explicit scope of `platform` or `tenant`
- **AND** no role binding is stored with an unspecified scope

#### Scenario: The same role may be bound at both scopes

- **GIVEN** a role bound to an account once with platform scope and once with tenant scope
- **WHEN** the account's effective permissions are computed for a given tenant
- **THEN** both bindings are considered
- **AND** the bindings remain distinguishable records

### Requirement: Platform And Tenant Administration Are Both Represented

The application SHALL support an account that administers the platform and an account that
administers a single tenant, and SHALL distinguish the two by scope rather than by a special
account kind.

#### Scenario: A platform administrator administers any tenant

- **GIVEN** an account holding a platform-scoped binding granting `admin.manage_tenants`
- **WHEN** it acts within any tenant it may access
- **THEN** the binding's permissions apply

#### Scenario: A tenant administrator administers only its own tenant

- **GIVEN** an account holding a tenant-scoped binding granting `settings.update` in tenant A
- **WHEN** it updates tenant A's settings
- **THEN** the request is permitted
- **WHEN** it attempts to update tenant B's settings
- **THEN** the request is refused

#### Scenario: Administration Is Not A User Column

- **WHEN** the account record is inspected
- **THEN** it carries no administrator flag, role name or privilege level column
- **AND** all administrative capability is expressed through scoped role bindings

#### Scenario: Platform And Tenant Administration Are Distinguished By Their Grants

- **GIVEN** a platform administrator and a tenant administrator
- **WHEN** the permissions each may exercise are enumerated
- **THEN** the platform administrator's set concerns tenants, accounts and role bindings
- **AND** the tenant administrator's set concerns its own tenant's content and settings
- **AND** the two sets are stated explicitly rather than implied by a role name

#### Scenario: Re-Authentication Is Required For Destructive Operations

- **GIVEN** an authenticated session
- **WHEN** the session's age exceeds the re-authentication threshold
- **AND** the caller attempts a destructive operation
- **THEN** the operation is refused until the session is re-authenticated
- **AND** a read-only operation is unaffected by the same threshold

### Requirement: Removing A Grant Takes Effect Without Waiting For Expiry

A permission decision SHALL NOT be cached for longer than the request on which it was made. When a
role binding or a role's permission grant is removed, the next request governed by it SHALL reflect
the removal.

#### Scenario: A revoked grant stops working on the next request

- **GIVEN** an account whose access to an endpoint depends on a role binding
- **WHEN** that binding is removed and the account repeats the request
- **THEN** the request is refused

#### Scenario: A removed permission stops working on the next request

- **GIVEN** a role granting a permission to an account's endpoint access
- **WHEN** that permission is removed from the role and the account repeats the request
- **THEN** the request is refused

#### Scenario: Per-account effective permissions may be cached within a session

- **GIVEN** an account's effective permission set has been computed for a session
- **WHEN** the same set is consulted again within that session
- **THEN** it MAY be served from a cache
- **AND** the cache MUST be invalidated when a grant or binding changes

### Requirement: Platform Scope Does Not Concede Cross-Tenant Content Access

A platform-scoped binding SHALL NOT by itself grant read or write access to another tenant's file
content. Cross-tenant content access SHALL be a separately designed capability, and its absence
SHALL be stated rather than left implicit in a role definition.

#### Scenario: A platform administrator cannot read a tenant's files by scope alone

- **GIVEN** an account holding a platform-scoped binding
- **WHEN** it requests a file belonging to a tenant it is not acting within
- **THEN** the request is refused
- **AND** the refusal is indistinguishable from the file not existing

#### Scenario: A platform administrator has No Cross-Tenant Content Permission

- **WHEN** the permissions granted by platform scope are enumerated
- **THEN** none of them grants read, write or delete on tenant file content
- **AND** that absence is recorded rather than left to be inferred

#### Scenario: Platform Scope Grants Administration, Not Content

- **GIVEN** an account holding a platform-scoped binding granting administration
- **WHEN** the administration capabilities it may exercise are enumerated
- **THEN** they concern tenants, accounts and role bindings
- **AND** they do not include reading the content those tenants hold

### Requirement: Every Protected Endpoint Declares Its Requirement

Each protected endpoint SHALL declare the catalogue permissions it requires, and the application
SHALL enforce that declaration before the endpoint's handler performs any filesystem or database
mutation or any expensive computation.

#### Scenario: A declared requirement is enforced before work begins

- **GIVEN** an endpoint declaring a permission the caller lacks
- **WHEN** the caller invokes it
- **THEN** the request is refused with status `403`
- **AND** no filesystem write, no archive construction and no streaming is started

#### Scenario: An endpoint with no declared requirement is not reachable

- **WHEN** the protected endpoints are enumerated
- **THEN** each declares the permissions it requires
- **AND** no protected endpoint is reachable without a declared requirement

### Requirement: Both API Prefixes Enforce Identical Permissions

The versioned surface and its compatibility alias SHALL run the same authorization middleware and
the same declared requirements, so that the alias cannot be used to reach an endpoint the versioned
prefix protects.

#### Scenario: The alias enforces the same permission as the versioned prefix

- **GIVEN** an endpoint requiring a permission the caller lacks
- **WHEN** it is invoked through the versioned prefix and through the alias
- **THEN** both are refused with the same status
- **AND** the same response body

#### Scenario: Parity Is Asserted Across The Whole Protected Surface

- **WHEN** the protected routes are enumerated
- **THEN** each one is exercised through both prefixes
- **AND** each pair answers with the same status and the same response shape
- **AND** the assertion covers every protected route rather than a sample

#### Scenario: Parity Holds For Anonymous Callers Too

- **WHEN** a protected route is requested without a credential through either prefix
- **THEN** both prefixes refuse identically
- **AND** neither prefix serves a protected route to an anonymous caller

#### Scenario: Authorization is applied inside the shared assembly

- **WHEN** the middleware ordering of the API assembly is inspected
- **THEN** authentication and tenant context are applied inside the single assembled router
- **AND** they are not attached to an individual route module that one prefix could bypass

#### Scenario: An unknown version cannot reach a protected handler

- **GIVEN** an unknown version prefix
- **WHEN** a protected endpoint is requested under it
- **THEN** it reaches the API catch-all and is refused
- **AND** no protected handler executes

### Requirement: Permission Denials Are Recorded

A request refused for want of permission SHALL be recorded as an audit event carrying the
authenticated caller, the tenant, the endpoint, the required permission and the outcome.

#### Scenario: A denial produces an audit event

- **WHEN** a request is refused for want of a permission
- **THEN** an audit event is written with outcome `denied`
- **AND** the event names the required permission and the endpoint

#### Scenario: The denial response does not enumerate the caller's missing permissions

- **WHEN** a request is refused for want of a permission
- **THEN** the response does not disclose which other permissions the caller holds or lacks