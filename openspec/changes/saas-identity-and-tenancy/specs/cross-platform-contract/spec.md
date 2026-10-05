# Spec Delta

## Purpose

Extends the cross-platform contract to the two host-sensitive additions this change introduces: the
filesystem name used for a tenant directory, and the placement and permissions of the database file
under the hardened deployment unit.

## ADDED Requirements

### Requirement: Tenant Directories Are Usable On Every Supported Host

A tenant's directory name SHALL satisfy the same filename rules the application already applies to
user-supplied names, so that tenant storage is creatable, addressable and removable on every host in
this contract, and the accept-or-refuse verdict for a given name SHALL be identical on every host.

#### Scenario: The verdict does not depend on the host

- **WHEN** a tenant directory name is validated on each supported host
- **THEN** the same name is accepted on every host and refused on every host

#### Scenario: A host-reserved name is refused everywhere

- **WHEN** a tenant directory name is a reserved host device name
- **THEN** the tenant creation is refused

#### Scenario: A host-illegal character is refused everywhere

- **WHEN** a tenant directory name contains a character that is illegal on any supported host
- **THEN** the tenant creation is refused

#### Scenario: Separator And Traversal Rules Apply To Tenant Names

- **WHEN** a proposed tenant directory name contains a separator or a parent reference
- **THEN** the tenant creation is refused

#### Scenario: A Tenant Directory Remains Traversable By Its Name

- **GIVEN** a tenant created on one host and its directory used from another
- **WHEN** a client path is resolved within that tenant
- **THEN** the resolution succeeds
- **AND** the result does not depend on which host performed it

### Requirement: The Database File Is Placed And Permitted Uniformly

The database file SHALL be stored inside the configured data directory, SHALL NOT be located inside a
release, and SHALL be readable and writable by the identity the deployment runs as, on every
supported host.

#### Scenario: The file lives outside every release

- **WHEN** the database is created
- **THEN** it is created inside the configured data directory
- **AND** no release directory contains it

#### Scenario: The service identity can read and write it

- **GIVEN** the application running under the deployment's service identity
- **WHEN** it opens the database
- **THEN** the open succeeds

#### Scenario: Refusal Is Requested When The Store Is Absent On A Host That Has Run Before

- **GIVEN** a host where a previous release created the database
- **WHEN** the database is absent at activation time
- **THEN** activation is refused
- **AND** the refusal is raised by the deployment step rather than by a per-request error

### Requirement: Engine Behaviour Does Not Vary By Host In Its Answers

Where the same request is issued on different supported hosts, the **answers** — status codes,
field presence, nullability, ordering, and units — SHALL be identical. Whether an internal step
takes longer on one host is not part of this contract.

#### Scenario: Ordering Is Identical Across Hosts

- **WHEN** the same listing, ranking or activity query is issued on different hosts
- **THEN** the resulting order is identical

#### Scenario: Nullability Is Identical Across Hosts

- **WHEN** a statistic cannot be computed on any host
- **THEN** it is null on every host
- **AND** it is never reported as zero on one host and null on another

#### Scenario: Status Codes Are Identical Across Hosts

- **WHEN** the same refusal condition is exercised on different hosts
- **THEN** the status code is the same

### Requirement: No Platform-Specific Detail Enters Audit Or Diagnostic Output

Records and logs written by the application SHALL NOT embed platform identifiers, absolute host
paths, or host-specific error text, so that a record produced on one host is comparable with one
produced on another and discloses nothing about the host's filesystem layout.

#### Scenario: Audit Records Carry No Host Path

- **WHEN** an audit record naming a resource is read
- **THEN** it uses the client-path form
- **AND** it contains no absolute path and no drive letter

#### Scenario: A Host-Specific Error Does Not Reach The Client

- **WHEN** a failure originating in a host-specific filesystem or storage call produces a message
- **THEN** the client-facing response does not carry that message
- **AND** the server-side record retains it for diagnosis