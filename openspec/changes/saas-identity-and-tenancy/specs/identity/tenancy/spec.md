# Spec Delta

## Purpose

Defines the tenant as the primary security boundary for tenant-owned data: how a tenant is
created and identified, how the current tenant is established from authenticated context rather
than from anything the client supplies, how an account that belongs to several tenants moves
between them, and the rule that tenant-owned filesystem space is physically separated.

## ADDED Requirements

### Requirement: Tenant Context Is Derived From The Authenticated Session

The application SHALL establish the current tenant solely from the authenticated session record.
Tenant identity SHALL NOT be read from a request body, a query parameter, a form field, or a
header whose value the client chooses.

#### Scenario: The session determines the tenant

- **GIVEN** an authenticated session bound to a tenant
- **WHEN** any tenant-owned endpoint is called
- **THEN** the tenant used for that request is the one recorded on the session
- **AND** no client-supplied value participates in that determination

#### Scenario: A client-supplied tenant identifier is ignored

- **GIVEN** an authenticated session bound to tenant A
- **WHEN** the request additionally carries a tenant identifier naming tenant B
  in its body, query string or headers
- **THEN** the request is served against tenant A
- **AND** tenant B's data is neither read nor modified

#### Scenario: A client-supplied tenant identifier that contradicts the session is refused

- **GIVEN** an authenticated session bound to tenant A
- **WHEN** the request carries an explicit tenant identifier naming tenant B
- **THEN** the request is refused
- **AND** the refusal occurs before any filesystem or database access for either tenant

#### Scenario: No tenant identifier reaches a controller as authority

- **WHEN** the request-handling source is inspected
- **THEN** no controller reads a tenant identifier from the request to decide which tenant's data
  to operate on
- **AND** tenant selection reads only the established tenant context

### Requirement: Tenant-Owned Storage Is Physically Separated

Each tenant SHALL own a directory beneath the managed storage root, and the resolution of any
client path SHALL be confined to the current tenant's directory.

#### Scenario: Tenant data lives under the tenant's own directory

- **GIVEN** a tenant owning a directory beneath the storage root
- **WHEN** any tenant-owned file or folder is created, read, renamed or deleted
- **THEN** the operation is confined to that tenant's directory

#### Scenario: Tenant directories are siblings, never nested

- **WHEN** the tenant directories are enumerated
- **THEN** no tenant's directory lies inside another tenant's directory

#### Scenario: A client path cannot address another tenant's directory

- **GIVEN** two tenants, A and B, each owning a directory
- **WHEN** a client path that would resolve into tenant B's directory is presented while
  authenticated as tenant A
- **THEN** the resolution is refused
- **AND** no filesystem access occurs

#### Scenario: Traversal from a tenant root cannot reach a sibling tenant

- **GIVEN** two tenants, A and B
- **WHEN** a client path containing enough parent segments to climb out of tenant A's directory is
  resolved
- **THEN** the resolution is refused
- **AND** the containment check is evaluated against tenant A's directory, not the global root

### Requirement: A Tenant Directory Name Is Valid On Every Supported Host

A tenant's directory name SHALL satisfy the same filename rules the application already applies to
user-supplied names, so that tenant storage is manageable on every host in the cross-platform
contract.

#### Scenario: A directory name containing an illegal character is refused

- **WHEN** a tenant is created with a directory name containing a character the host reserves
- **THEN** the tenant creation is refused

#### Scenario: A reserved device name is refused

- **WHEN** a tenant is created with a directory name that is a reserved host device name
- **THEN** the tenant creation is refused

#### Scenario: The verdict does not depend on the host platform

- **WHEN** a tenant directory name is validated on each supported host
- **THEN** the accept-or-refuse verdict is the same on every host

### Requirement: Membership Is The Relationship Between An Account And A Tenant

An account SHALL relate to a tenant through an explicit membership that carries its own status, so
that access can be granted, suspended and withdrawn per tenant independently of the account.

#### Scenario: Membership status controls access

- **GIVEN** an account holding a membership in a tenant
- **WHEN** that membership is active and the account presents a session for that tenant
- **THEN** the request is authorized as a member
- **WHEN** that membership is suspended
- **THEN** the request is refused

#### Scenario: An account may belong to several tenants

- **GIVEN** an account holding active memberships in three tenants
- **WHEN** each tenant's data is requested in turn
- **THEN** each request is served against the tenant named by that request's session
- **AND** the memberships are independent records

#### Scenario: The same account identity is not duplicated per tenant

- **WHEN** an account holds memberships in several tenants
- **THEN** exactly one account record exists for it

### Requirement: Switching Tenants Issues A New Session

A request to act within a different tenant SHALL be served only after the application verifies a
membership in that tenant and issues a session bound to it. Switching SHALL NOT be achievable by
submitting a tenant identifier into an existing request.

#### Scenario: Switching to a tenant the account belongs to succeeds

- **GIVEN** an account with active memberships in tenant A and tenant B, holding a session for A
- **WHEN** it requests to switch to tenant B
- **THEN** the application verifies the membership in B
- **AND** issues a session bound to B
- **AND** subsequent requests are served against B

#### Scenario: Switching to a tenant the account does not belong to is refused

- **GIVEN** an account whose only membership is in tenant A
- **WHEN** it requests to switch to tenant B
- **THEN** the request is refused
- **AND** the existing session for A is unaffected
- **AND** the response does not disclose whether tenant B exists

#### Scenario: The superseded session no longer addresses the previous tenant

- **GIVEN** an account that has switched from tenant A to tenant B
- **WHEN** the previously issued credential is presented again
- **THEN** it does not grant access to tenant A

### Requirement: Tenant-Identifying Hints Are Verified, Never Trusted

When a deployment carries a tenant-identifying hint in the request, such as a subdomain or a
proxy-supplied host header, the application MAY use it to choose which tenant's login experience to
present, and SHALL verify it against the session. A hint SHALL NOT be able to widen access, and a
mismatch SHALL be refused.

#### Scenario: A matching hint is accepted

- **GIVEN** a session bound to tenant `acme` and a request whose host hint names `acme`
- **WHEN** the request is processed
- **THEN** the request is served against tenant `acme`

#### Scenario: A contradictory hint is refused

- **GIVEN** a session bound to tenant `acme` and a request whose host hint names `globex`
- **WHEN** the request is processed
- **THEN** the request is refused
- **AND** the request is not served against either tenant

#### Scenario: No hint is required

- **GIVEN** a session bound to a tenant and a request carrying no tenant-identifying hint
- **WHEN** the request is processed
- **THEN** the request is served against the session's tenant

### Requirement: Tenant Enumeration Is Not Possible From The Public Surface

The public surface SHALL NOT disclose the existence of tenants to an unauthenticated caller.

#### Scenario: An anonymous caller cannot enumerate tenants

- **GIVEN** a caller presenting no credential
- **WHEN** it requests a tenant listing, a tenant identifier, or a tenant slug
- **THEN** the response is refused
- **AND** the response discloses no tenant name, slug or identifier

#### Scenario: A tenant switch response discloses only the caller's own tenants

- **GIVEN** an account with memberships in tenants A and B
- **WHEN** it asks which tenants it may act in
- **THEN** the response lists A and B
- **AND** it discloses no other tenant

### Requirement: Tenant-Scoped Data Is Separated At Every Query

Every query that reads or writes tenant-owned records SHALL be constrained by the established
tenant, and the data-access layer SHALL require the tenant as an explicit input rather than
resolving it from ambient state.

#### Scenario: A tenant-scoped read returns only that tenant's records

- **GIVEN** records belonging to tenants A and B
- **WHEN** a read is issued on behalf of tenant A
- **THEN** the result contains only tenant A's records

#### Scenario: A cross-tenant write is refused by the data layer

- **GIVEN** a caller acting in tenant A
- **WHEN** an attempt is made to write a record owned by tenant B
- **THEN** the write is refused

#### Scenario: The tenant cannot be omitted from a tenant-owned query

- **WHEN** the data-access interface is inspected
- **THEN** every tenant-owned read and write requires a tenant argument
- **AND** no tenant-owned query resolves its tenant from process-global state