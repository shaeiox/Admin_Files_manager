# Spec Delta

## Purpose

Extends the existing path-containment boundary so that containment is evaluated against the
**authenticated tenant's** root rather than one global storage root, and so that a resolution which
leaves the tenant's space is reported indistinguishably from a path that does not exist.

## MODIFIED Requirements

### Requirement: Separator-Boundary Path Containment

A resolved target SHALL be treated as contained within the authorized boundary only when the target
is exactly that boundary, or when the target begins with the boundary followed by the platform's
native path separator. The authorized boundary SHALL be the current tenant's root when a tenant is
established, and the configured storage root otherwise.

#### Scenario: Sibling directory sharing a name prefix is rejected

- **GIVEN** a tenant root whose final path segment is `download`
- **WHEN** a client path resolves to a sibling directory named `download-backup`
- **THEN** the resolution is rejected
- **AND** no filesystem access occurs

#### Scenario: Nested escape to a sibling prefix is rejected

- **GIVEN** a tenant root whose final path segment is `download`
- **WHEN** a client path such as `/media/../../download-2/x` is resolved
- **THEN** the resolution is rejected

#### Scenario: Classic parent traversal is rejected

- **WHEN** a client path containing enough `..` segments to escape the authorized boundary is
  resolved
- **THEN** the resolution is rejected
- **AND** it is reported as a missing path rather than as a distinct forbidden outcome

#### Scenario: Root itself is contained

- **WHEN** the client path `/` is resolved
- **THEN** the result is the current tenant's root and the resolution succeeds

#### Scenario: Direct and nested children are contained

- **WHEN** `/media/a.txt` or `/a/b/c.txt` is resolved
- **THEN** the resolution succeeds and the result lies within the current tenant's root

#### Scenario: Verdicts are identical across root spellings

- **WHEN** the tenant root is expressed as a Windows path with a trailing separator, with forward
  slashes, in a different letter case, or with a redundant current-directory segment
- **THEN** the containment verdict for any given client path is identical in every spelling

#### Scenario: Verdict is identical on a POSIX-shaped root

- **WHEN** the tenant root is expressed as a POSIX absolute path
- **THEN** the containment verdict for any given client path matches the Windows-root verdict

#### Scenario: Containment is judged per tenant, not globally

- **GIVEN** two tenants whose roots are siblings beneath the configured storage root
- **WHEN** a client path is resolved for each of them
- **THEN** each resolution is judged against that tenant's own root
- **AND** a path valid for one tenant is not valid for the other

#### Scenario: Climbing out of a tenant root into a sibling tenant is rejected

- **GIVEN** tenants A and B, and a path that resolves inside tenant B's directory
- **WHEN** it is resolved for a caller established in tenant A
- **THEN** the resolution is rejected
- **AND** no filesystem access occurs

## ADDED Requirements

### Requirement: Resolution Requires An Established Boundary

A client path SHALL be resolved only against a boundary that the request context has established.
Where no tenant has been established, resolution SHALL fall back to the configured storage root
rather than to a per-request value.

#### Scenario: The boundary comes from the established tenant context

- **GIVEN** a request whose tenant context is established
- **WHEN** a client path is resolved
- **THEN** the boundary used is the one recorded for that tenant

#### Scenario: The boundary is never taken from the request

- **WHEN** a request carries a value that resembles a storage location
- **THEN** that value does not become the resolution boundary
- **AND** the boundary remains the established tenant's root

#### Scenario: An unestablished context falls back to the configured root

- **GIVEN** a request with no established tenant context that nonetheless requires path resolution
- **WHEN** a client path is resolved
- **THEN** the configured storage root is used
- **AND** the resolution is confined to it