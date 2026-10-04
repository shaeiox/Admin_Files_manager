# Spec Delta

## Purpose

Defines the versioned HTTP namespace: how `/api/v1` is assembled and mounted, the ordering
constraint that keeps it reachable, how an unknown version is refused, and the compatibility rules
that govern what may change inside v1 and what must instead become a v2.

## ADDED Requirements

### Requirement: Versioned Namespace Prefix

Every versioned API endpoint SHALL be reachable under the prefix `/api/v1`. The version segment SHALL
appear immediately after `/api` and before any resource segment.

#### Scenario: A versioned read endpoint is reachable

- **WHEN** a client issues `GET /api/v1/fs/list?path=/`
- **THEN** the response status is `200`
- **AND** the body is the directory-listing payload
- **AND** the response is NOT `{"success": false, "error": "API endpoint not found"}`

#### Scenario: The version segment precedes the resource segment

- **WHEN** the set of versioned endpoint paths is enumerated
- **THEN** every path matches `/api/v1/<resource>` where `<resource>` is one of `health`, `fs`,
  `dashboard`, or `settings`
- **AND** no versioned endpoint is exposed under a prefix where the resource precedes the version

#### Scenario: A versioned mutating endpoint is reachable

- **WHEN** a client issues `POST /api/v1/fs/star` with a valid body
- **THEN** the response is the mutation envelope the unversioned endpoint returns
- **AND** the versioned and unversioned paths produce the same status and the same response shape

### Requirement: One Assembled Surface Serves Every Prefix

The versioned surface and the unversioned surface SHALL be produced by a single shared assembly of the
same router instances. The route declarations SHALL NOT be duplicated per prefix.

#### Scenario: A route is declared exactly once

- **WHEN** the route declarations for the filesystem, dashboard and settings resources are inspected
- **THEN** each resource's routes are declared in exactly one route module
- **AND** no version-specific copy of a route declaration exists

#### Scenario: The two prefixes cannot drift

- **GIVEN** the shared assembly is mounted at both the versioned and the unversioned prefix
- **WHEN** any endpoint is exercised on the versioned prefix
- **THEN** the same handler, the same middleware chain and the same guards run as on the unversioned prefix
- **AND** adding a route to the shared assembly makes it reachable on every prefix at once

### Requirement: Version Prefix Is Mounted Before The API Catch-All

The versioned surface SHALL be registered in `server.js` at a position strictly earlier than the
catch-all registered on `/api`.

#### Scenario: The catch-all does not shadow the versioned surface

- **GIVEN** the catch-all on `/api` is a middleware that terminates the chain
- **WHEN** the server starts
- **THEN** the versioned surface is registered before that catch-all
- **AND** every versioned endpoint answers with its own handler rather than the catch-all's `404`

#### Scenario: Unknown paths under the versioned prefix still reach the catch-all

- **WHEN** a client requests `GET /api/v1/fs/does-not-exist`
- **THEN** the response status is `404`
- **AND** the body is the API error envelope

### Requirement: An Unknown Version Is Refused

A request whose version segment is not a supported version SHALL NOT be served by any other version's
routes, and SHALL NOT fall through to a non-API response.

#### Scenario: A future version is not silently served by v1

- **WHEN** a client requests `GET /api/v2/fs/list?path=/`
- **THEN** the response status is `404`
- **AND** the body is the API error envelope
- **AND** no filesystem listing is performed

#### Scenario: An unknown version is not answered with the SPA shell

- **WHEN** a client requests `GET /api/v2/fs/list`
- **THEN** the response is a JSON error envelope
- **AND** the response is not the HTML application shell

#### Scenario: A version segment is not interpreted case-insensitively as a match

- **WHEN** a client requests a path whose version segment differs in case from a supported version
- **THEN** the request is treated as an unknown version and refused
- **AND** it is not resolved to the supported version

### Requirement: Endpoint Naming Is Frozen Within v1

Introducing the version namespace SHALL NOT rename any existing endpoint or alter any existing
parameter name, request field, or response field.

#### Scenario: No endpoint is renamed by versioning

- **WHEN** the versioned resource paths are compared with the unversioned ones
- **THEN** the set of resource segments and their order is identical
- **AND** no path is renamed, shortened, pluralised or re-cased as part of versioning

#### Scenario: No response field changes shape in v1

- **WHEN** the same request is issued to the versioned and the unversioned path
- **THEN** both responses are byte-identical for the same underlying state
- **AND** no field is added, removed, renamed or retyped by this change

### Requirement: Changes Within v1 Are Additive Only

A change to a v1 endpoint SHALL be restricted to: a new endpoint under the versioned prefix, a new
optional response field, or a new optional request parameter whose absence reproduces the previous
behaviour.

#### Scenario: An additive parameter preserves prior behaviour

- **GIVEN** a request parameter is added to a v1 endpoint
- **WHEN** the parameter is omitted
- **THEN** the response is identical to the response before the parameter existed

#### Scenario: An additive response field does not break a consumer

- **GIVEN** a new optional field is added to a v1 response
- **WHEN** an existing consumer reads the response
- **THEN** the consumer's existing fields are unchanged
- **AND** the absence of the new field remains a valid response for that endpoint

#### Scenario: A removal is not made inside v1

- **WHEN** a field, parameter or endpoint must be removed or retyped
- **THEN** the removal is not performed under the v1 prefix
- **AND** it is deferred to a future version

### Requirement: Future Versions Are Mounted Alongside

A future version SHALL be introduced by mounting an additional prefix, leaving the earlier version's
prefix serving.

#### Scenario: Adding v2 does not repoint v1

- **GIVEN** a future version is introduced
- **WHEN** the server is started
- **THEN** the earlier version's prefix continues to serve its own contract
- **AND** the new prefix serves its own contract
- **AND** neither prefix is routed to the other's handlers

#### Scenario: A version is selected by the request path, not a header

- **WHEN** the version of an API request is determined
- **THEN** it is determined solely by the request path
- **AND** no request header, cookie, query parameter or content negotiation selects the version

### Requirement: The Version Is Discoverable

The API SHALL report its own version so that a consumer can confirm which contract it is talking to
without inferring it from a path it was configured with.

#### Scenario: A versioned health endpoint reports the version

- **WHEN** a client issues `GET /api/v1/health`
- **THEN** the response identifies API version `1` in a stable field
- **AND** the existing health fields remain present

#### Scenario: The reported version matches the requested version

- **GIVEN** the versioned health endpoint is queried
- **WHEN** its reported version is compared with the version segment of the requested path
- **THEN** they are equal
