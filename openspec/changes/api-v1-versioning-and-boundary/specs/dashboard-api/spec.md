# Spec Delta

## MODIFIED Requirements

### Requirement: Route Registration Precedes Catch-All

The Dashboard surface SHALL be mounted in `server.js` at a position strictly earlier than the catch-all
middleware registered on the API prefix. The Dashboard surface SHALL be reachable under both the
versioned API prefix and the retained unversioned API prefix, and both mounts SHALL precede that
catch-all.

#### Scenario: Dashboard routes are reachable

- **WHEN** the server starts and a client requests `GET /api/dashboard/summary`
- **THEN** the response status is `200` and the body is the summary payload
- **AND** the response is NOT `{"success": false, "error": "API endpoint not found"}`

#### Scenario: Versioned Dashboard routes are reachable

- **WHEN** the server starts and a client requests `GET /api/v1/dashboard/summary`
- **THEN** the response status is `200` and the body is the summary payload
- **AND** the response is NOT `{"success": false, "error": "API endpoint not found"}`

#### Scenario: Both Dashboard mounts precede the catch-all

- **WHEN** the middleware registration order in `server.js` is inspected
- **THEN** the versioned surface and the unversioned surface are both registered before the catch-all
- **AND** neither Dashboard mount is shadowed by it

#### Scenario: Unknown API paths still reach the catch-all

- **WHEN** a client requests `GET /api/dashboard/does-not-exist`
- **THEN** the catch-all responds `404` with `{"success": false, "error": "API endpoint not found"}`

#### Scenario: Unknown versioned Dashboard paths still reach the catch-all

- **WHEN** a client requests `GET /api/v1/dashboard/does-not-exist`
- **THEN** the catch-all responds `404` with `{"success": false, "error": "API endpoint not found"}`

#### Scenario: Filesystem router is not remounted under the dashboard prefix

- **WHEN** routes are registered
- **THEN** the existing filesystem router is mounted only under the filesystem resource segment
- **AND** no filesystem mutation route (upload, rename, delete, folder, download) is reachable under
  either the versioned or the unversioned dashboard prefix

#### Scenario: Adding a version prefix does not republish filesystem mutations

- **GIVEN** the versioned API prefix is added
- **WHEN** the reachable route table is enumerated
- **THEN** the set of filesystem mutation routes reachable under the dashboard prefix is unchanged
- **AND** the version prefix introduces no additional mutation route under any resource segment

### Requirement: Filesystem Router Separation

The Dashboard endpoints SHALL be declared in a dedicated route module, and the Dashboard controller
SHALL compose existing services directly. The same route module SHALL serve every API prefix under
which the Dashboard is reachable.

#### Scenario: Dedicated route module

- **WHEN** Dashboard routes are declared
- **THEN** they are declared in a Dashboard-specific route module
- **AND** the existing filesystem route module is not extended with Dashboard paths

#### Scenario: No new service tier

- **WHEN** the Dashboard controller aggregates data
- **THEN** it composes existing filesystem and metadata services directly
- **AND** no new aggregate service layer is introduced between the controller and the existing services

#### Scenario: Route module contains no business logic

- **WHEN** the Dashboard route module is inspected
- **THEN** it contains only route declarations bound to controller handlers
- **AND** it performs no filesystem or metadata access

#### Scenario: The route module carries no version prefix

- **WHEN** the Dashboard route module is inspected
- **THEN** it declares no version segment in any of its paths
- **AND** the version prefix is applied only where the module is mounted, so one module serves every prefix
