# Spec Delta

## Purpose

Extends the Dashboard health contract so that the endpoint is authenticated and tenant-aware, that
host-level metrics are explicitly distinguished from tenant-level ones, and that the mandatory
separation between Dashboard health and the public liveness endpoint is preserved under
authentication.

## MODIFIED Requirements

### Requirement: Dashboard Health Is A Separate Endpoint From Liveness

The Dashboard SHALL obtain runtime health from its own endpoint, and the application's liveness
endpoint SHALL remain unchanged and unauthenticated. Authentication SHALL NOT be applied to the
liveness endpoint, and the Dashboard health endpoint SHALL NOT be made public to compensate.

#### Scenario: Liveness stays public and uncredentialed

- **GIVEN** a caller presenting no credential
- **WHEN** it requests the liveness endpoint
- **THEN** the request succeeds
- **AND** it reports the API version the deployment gate depends on

#### Scenario: Dashboard health is not public

- **GIVEN** a caller presenting no credential
- **WHEN** it requests the Dashboard health endpoint
- **THEN** the request is refused

#### Scenario: The two endpoints remain distinct under authentication

- **WHEN** the middleware protecting the Dashboard health endpoint is inspected
- **THEN** it does not also protect the liveness endpoint
- **AND** it is not mounted in a way that makes the liveness endpoint reachable only through it


#### Scenario: Liveness endpoint is unchanged

- **WHEN** a client issues `GET /api/health`
- **THEN** the response retains its existing shape, status, and semantics
- **AND** it continues to report liveness and environment information
- **AND** it is not repurposed, extended, or deprecated by this change

#### Scenario: Dashboard health has its own path

- **WHEN** a client issues `GET /api/dashboard/health`
- **THEN** the response contains runtime metrics for Dashboard display
- **AND** it is a distinct resource from the liveness endpoint

#### Scenario: Separation is documented

- **WHEN** the API contract is delivered
- **THEN** it states that the two endpoints have different purposes, different response shapes, and different consumers
- **AND** it states that neither is a substitute for the other
### Requirement: Health Reflects Real Platform Data

Every returned metric SHALL be derived from data the platform actually reports for the scope being
described, and metrics that cannot be obtained SHALL be omitted rather than approximated. A metric
describing the host SHALL be labelled as such rather than presented as the tenant's own figure.

#### Scenario: A host-level metric is labelled

- **WHEN** a returned metric describes host-wide state such as total memory or process uptime
- **THEN** it is labelled as a host-level or platform-level metric
- **AND** it is not presented as the tenant's usage

#### Scenario: A tenant-level metric describes that tenant

- **WHEN** a returned metric describes the tenant's storage
- **THEN** it is derived from the current tenant's data

#### Scenario: A metric that cannot be obtained is omitted

- **WHEN** the platform does not report a quantity
- **THEN** no entry for it appears in the array
- **AND** no placeholder value appears in its place


#### Scenario: Unsupported metric is omitted

- **GIVEN** a candidate metric that the host platform does not expose portably
- **WHEN** the health endpoint is served
- **THEN** that metric is absent from the array
- **AND** no substituted or estimated value appears in its place

#### Scenario: Unavailable metric is omitted, not zeroed

- **GIVEN** a candidate metric whose read fails on this host
- **WHEN** the health endpoint is served
- **THEN** that metric is absent from the array
- **AND** it is not reported with a value of `0`, which would read as a healthy measurement

#### Scenario: Metric list is stable across polls

- **WHEN** the health endpoint is polled repeatedly on an unchanged host
- **THEN** the same set of metric names is returned each time
- **AND** metric rows do not appear and disappear between polls
## ADDED Requirements

### Requirement: Dashboard Health Requires Authentication And A Declared Permission

The Dashboard health endpoint SHALL require an authenticated session and SHALL declare the
permissions it requires.

#### Scenario: An anonymous request is refused

- **GIVEN** a caller presenting no credential
- **WHEN** it requests the Dashboard health endpoint
- **THEN** the request is refused with status `401`

#### Scenario: An authenticated caller without the permission is refused

- **GIVEN** an authenticated caller lacking the endpoint's required permission
- **WHEN** it requests it
- **THEN** the request is refused with status `403`

#### Scenario: Both API prefixes behave identically

- **WHEN** the endpoint is requested through the versioned prefix and through the alias
- **THEN** both are served or both refused identically

### Requirement: Health Does Not Become A Tenant Enumeration Channel

The Dashboard health endpoint SHALL NOT disclose whether a tenant exists, and SHALL NOT report
per-tenant figures for tenants the caller has no membership in.

#### Scenario: One tenant's health reveals nothing about another's

- **WHEN** a caller in tenant A requests health
- **THEN** the response describes only tenant A and host-level figures
- **AND** no other tenant's name, identifier or figure appears

#### Scenario: A host-level figure is not a tenant-existence oracle

- **WHEN** the response reports host-level metrics
- **THEN** those metrics do not vary in a way that reveals how many tenants exist or whether a
  particular tenant exists