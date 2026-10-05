# Spec Delta

## Purpose

Defines the governance of a request between the network edge and the domain: which endpoints stay
public, how the two API prefixes are kept equally protected, how cross-origin access is treated, how
throttling is layered so it cannot be side-stepped, and how errors are shaped so that refusals do
not disclose what exists.

## ADDED Requirements

### Requirement: Pre-Authentication Routes Are Throttled Before Exposure

A route that authenticates a caller by receiving a credential SHALL be bounded by an origin-keyed
throttle from the moment it becomes reachable, and SHALL NOT be deployed reachable before that
throttle is in force.

#### Scenario: A Login Route Is Throttled Before It Is Reachable

- **WHEN** a credential-accepting route is added to the reachable surface
- **THEN** the origin-keyed throttle for it is already in force
- **AND** the route is not reachable in an unthrottled state, even transiently

#### Scenario: The Throttle Key Is The Origin, Not The Submitted Account

- **GIVEN** attempts are made against an account that did not perform them
- **WHEN** the throttle refuses those attempts
- **THEN** the key is the attempt's origin
- **AND** the submitted account name is not part of the key

### Requirement: A Protected Surface Reached Without A Credential Is Presented As Such

A response indicating that a credential is required SHALL be distinguishable by the client from a
transport failure, so that the interface can route to authentication instead of reporting a
connectivity problem.

#### Scenario: A Credential-Required Response Is Not Reported As A Network Error

- **WHEN** the client receives a credential-required response
- **THEN** it is not surfaced as a generic network or connectivity failure
- **AND** the interface treats it as an authentication condition

#### Scenario: The Interface Routes To Authentication

- **WHEN** a protected request returns a credential-required response
- **THEN** the interface routes to the authentication view
- **AND** it does not present the failure as an error the operator must dismiss and retry

#### Scenario: The Intended Destination Survives Authentication

- **GIVEN** a caller was routed to authentication from a protected view
- **WHEN** it authenticates successfully
- **THEN** it is returned to the view it was attempting to reach

#### Scenario: The Current Caller Is Presented Truthfully

- **WHEN** an authenticated caller views the shared shell
- **THEN** the identity region names that account and its role in the acting tenant
- **AND** an unauthenticated caller sees an honest absence rather than a placeholder identity

### Requirement: The Liveness Endpoint Stays Public

The versioned liveness endpoint SHALL remain reachable without a credential, because deployment
activation polls it to decide whether a release may serve traffic.

#### Scenario: An anonymous caller reaches the liveness endpoint

- **GIVEN** a caller presenting no credential
- **WHEN** it requests the liveness endpoint under either API prefix
- **THEN** the response is successful
- **AND** the response reports the API version the deployment gate compares against

#### Scenario: The public endpoint reveals no environment detail

- **WHEN** the liveness response is read
- **THEN** it carries the liveness fields and the API version only
- **AND** it does not disclose the runtime environment, the tenant count, the store location or any
  deployment detail

#### Scenario: Readiness Is Not Conflated With Liveness

- **WHEN** a backing store is unreachable
- **THEN** the liveness endpoint still answers successfully
- **AND** dependency health is exposed through a separate, credentialed channel

### Requirement: Every Other Endpoint Requires A Credential

Every endpoint other than the liveness endpoint SHALL require an authenticated session, and no
endpoint SHALL be protected by convention, by obscurity of its path, or by being difficult to
discover.

#### Scenario: An anonymous caller is refused everywhere else

- **GIVEN** a caller presenting no credential
- **WHEN** it requests any endpoint other than the liveness endpoint
- **THEN** the request is refused with status `401`

#### Scenario: The static shell is not a data surface

- **WHEN** a caller requests the application's own HTML shell and static assets without a
  credential
- **THEN** the request is served
- **AND** no tenant-owned data is disclosed by serving them

### Requirement: Authentication Cannot Be Bypassed Through An API Alias

Both the versioned prefix and its compatibility alias SHALL run identical middleware, so that
reaching an endpoint through the alias cannot skip anything the versioned prefix enforces.

#### Scenario: Authentication is applied once, inside the shared assembly

- **WHEN** the middleware ordering of the API surface is inspected
- **THEN** authentication and tenant context are mounted inside the single assembled router
- **AND** no separate copy of the routing or the middleware exists per prefix

#### Scenario: The alias refuses what the versioned prefix refuses

- **GIVEN** an endpoint that refuses an unauthenticated or unauthorized caller
- **WHEN** it is requested through the versioned prefix and through the alias
- **THEN** both are refused
- **AND** the statuses and bodies are identical

#### Scenario: A catch-all cannot shadow the protected routes

- **WHEN** a protected endpoint is requested under a version the assembly does not serve
- **THEN** it is refused by the catch-all
- **AND** no protected handler executes

#### Scenario: Path case cannot be used to slip past the middleware

- **WHEN** a protected endpoint is requested with a differently-cased version segment
- **THEN** it does not reach the protected handler
- **AND** the response matches the behaviour for an unknown version

### Requirement: Cross-Origin Access Is Off Unless Explicitly Configured

Cross-origin access SHALL be disabled by default, and when enabled SHALL be limited to an explicitly
configured set of origins with no wildcard.

#### Scenario: The default configuration emits no cross-origin grant

- **GIVEN** the default configuration
- **WHEN** a cross-origin request is made
- **THEN** no cross-origin access header is emitted
- **AND** the browser refuses the call

#### Scenario: Only configured origins are granted

- **GIVEN** cross-origin access is enabled with a configured origin list
- **WHEN** a request arrives from an origin on that list
- **THEN** it is granted
- **WHEN** a request arrives from an origin not on that list
- **THEN** it is not granted

#### Scenario: Credentialed access and a wildcard cannot coexist

- **GIVEN** cross-origin access is configured to permit credentials
- **WHEN** the configuration is validated
- **THEN** a wildcard origin is refused
- **AND** enabling credentials is a separate, explicit setting that is off by default

#### Scenario: A wildcard is refused in production regardless

- **GIVEN** the application is running in production
- **WHEN** a wildcard origin is configured
- **THEN** startup refuses the configuration

### Requirement: Throttling Is Layered And Cannot Be Side-Stepped

Throttling SHALL be layered so that unauthenticated attempts are bounded by their origin,
authenticated traffic is bounded by the account and the tenant, and a total process ceiling
exists.

#### Scenario: Pre-authentication attempts are bounded by origin

- **WHEN** repeated login attempts are made from one origin without a valid credential
- **THEN** they are eventually refused
- **AND** the refusal is not dependent on any account identifier the attempt supplied

#### Scenario: A login throttle cannot lock out a legitimate account

- **GIVEN** attempts are made against an account that did not perform them
- **WHEN** the throttle refuses those attempts
- **THEN** the refusal does not disclose that the account exists
- **AND** the throttle key is the attempt's origin, not the submitted account name

#### Scenario: Authenticated traffic is bounded per account

- **WHEN** an authenticated account exceeds its allowance
- **THEN** its requests are refused
- **AND** the refusal is keyed to that account rather than to its origin

#### Scenario: One tenant cannot exhaust the process for others

- **GIVEN** a tenant exceeding its allowance
- **WHEN** another tenant makes a request
- **THEN** the other tenant's request is not refused because of the first tenant's traffic

#### Scenario: Sensitive Operations Are Bounded More Strictly

- **WHEN** the throttling configuration for administrative and destructive operations is compared
  with the configuration for ordinary reads
- **THEN** the administrative and destructive allowances are the stricter ones

#### Scenario: Expensive File Operations Are Bounded

- **WHEN** a caller repeatedly requests large archives or uploads
- **THEN** those operations are bounded by an allowance
- **AND** the bound is separate from the ordinary read allowance

#### Scenario: Upload Governance Is Per-Tenant

- **WHEN** one tenant reaches its concurrent upload limit
- **THEN** its excess uploads are refused
- **AND** another tenant's upload capacity is not consumed by it

#### Scenario: The Static Shell Is Not Throttled As API Traffic

- **WHEN** the application's own shell and assets are requested
- **THEN** they do not consume the API allowance
- **AND** loading a page does not consume an authenticated caller's read allowance

#### Scenario: Upload Governance Separates Concurrency From Free Space

- **GIVEN** several tenants uploading concurrently
- **WHEN** one tenant reaches its concurrent-upload limit
- **THEN** that tenant's excess uploads are refused
- **AND** another tenant's concurrent-upload capacity is unaffected

#### Scenario: Free Space Is Governed Per Volume, Not Per Tenant

- **GIVEN** a free-space watermark configured for the storage volume
- **WHEN** an upload is accepted for any tenant
- **THEN** the watermark is evaluated against the volume backing that tenant's root
- **AND** it is not tracked as a per-tenant quota, because free space is a property of the volume

### Requirement: A Read Endpoint Does Not Mutate Without Its Protection

A request that is safe by method SHALL NOT change stored state, or any state change it performs
SHALL be governed by the same protection as a mutation. Where an existing endpoint performs a
recorded write during a read, the application SHALL either move that write behind an explicit
mutation or state that the read is protected as a mutation is.

#### Scenario: A Read Performs No Recorded Write

- **WHEN** a request is issued with a safe method against any endpoint
- **THEN** no download counter, activity record or other stored value changes
- **AND** no audit event describing a state change is written

#### Scenario: A Download Does Not Change A Counter

- **WHEN** a file is downloaded
- **THEN** no stored counter is incremented by that request
- **AND** if the counter is to be incremented, it is done by an explicit mutation carrying the same
  protection a mutation carries

### Requirement: No Unauthenticated Surface Serves Tenant Content

The deployment SHALL NOT expose a path that serves tenant-owned file content without traversing the
application's authentication, tenant context and authorization. Any such path that exists today —
a proxy-served content directory, a directory-listing location, or a static document root that
overlaps tenant storage — SHALL be retired by this change.

#### Scenario: No Proxy Location Serves Tenant Content Directly

- **WHEN** the proxy configuration is inspected
- **THEN** no location serves bytes from the tenant storage area from the proxy itself
- **AND** every request for tenant content reaches the application

#### Scenario: No Public Directory Listing Of Tenant Content Exists

- **WHEN** the proxy configuration is inspected
- **THEN** no location enumerates the tenant storage area
- **AND** a public listing capability over tenant content no longer exists

#### Scenario: Previously Published Content Is Migrated, Not Left Reachable

- **GIVEN** content that was previously published through a proxy-served path
- **WHEN** that path is retired
- **THEN** the content is moved into the tenant storage model by an operator migration
- **AND** the previously published path no longer serves it

#### Scenario: The Existing Proxy Gate Is Removed Last

- **WHEN** the sequence of deploying this change is followed
- **THEN** the application is verified at runtime to be enforcing before any existing proxy gate is
  removed
- **AND** a source-level check alone is not accepted as that verification

#### Scenario: The Static Portal Is Not Tenant Content

- **GIVEN** a proxy configuration that serves a separate static site alongside the application
- **WHEN** its relationship to the application's tenant storage is determined
- **THEN** the storage locations are compared and the determination is recorded
- **AND** content in a different directory than the tenant storage area is not described as tenant
  content

### Requirement: Refusals Disclose As Little As Possible

A refusal SHALL NOT disclose whether a resource exists in another tenant, and SHALL NOT carry
internal detail such as a stack trace, an absolute host path, or a source location.

#### Scenario: Cross-tenant and missing resources are indistinguishable

- **GIVEN** a path that exists in another tenant
- **WHEN** it is requested
- **THEN** the response is identical to the response for a path that does not exist anywhere

#### Scenario: A refusal carries no internal detail

- **WHEN** a request is refused
- **THEN** the response body contains no stack trace, no absolute host path, no source location
  reference and no framework identifier

#### Scenario: Authored Messages Are Preserved

- **GIVEN** a refusal carrying an application-authored message
- **WHEN** the response is serialized
- **THEN** the authored message is forwarded
- **AND** the disclosure rule is not so broad that it suppresses intended, non-sensitive messages

#### Scenario: A Refusal Does Not Disclose The Caller's Standing

- **WHEN** a request is refused for want of a permission
- **THEN** the response does not enumerate the caller's other permissions or their absence

### Requirement: Downloads Are Authorized And Not Navigable

A file download SHALL be authorized before the stream is opened, SHALL be delivered as an attachment
with a neutral content type, and SHALL NOT cause the main frame to navigate away from the
application.

#### Scenario: An unauthorized download opens no stream

- **GIVEN** a caller without read permission on a file
- **WHEN** it requests the download
- **THEN** the request is refused
- **AND** no filesystem read is issued for the file

#### Scenario: A download is delivered as an attachment

- **WHEN** an authorized download succeeds
- **THEN** the response is marked as an attachment with a validated filename
- **AND** its content type is the neutral binary type rather than one a browser would render

#### Scenario: A preview Is Not Served From The Download Endpoint

- **WHEN** an inline image is requested
- **THEN** it is not served through the download endpoint's content type
- **AND** the download endpoint's content type is not relaxed to enable inline rendering

#### Scenario: A Symbolic Link Out Of The Tenant Root Is Refused

- **GIVEN** a symbolic link or junction inside the tenant root pointing outside it
- **WHEN** it is read through a download, a listing, an archive or a preview
- **THEN** the read is refused
- **AND** the refusal does not reveal the link's target

#### Scenario: An Archive Authorizes Every Entry Before Producing Output

- **GIVEN** an archive request over several paths
- **WHEN** every path has been resolved and authorized
- **THEN** the archive is constructed
- **AND** no archive output begins before that point