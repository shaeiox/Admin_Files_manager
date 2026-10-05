# Spec Delta

## Purpose

Extends the capacity contract so that volume figures are read for the volume actually containing the
**tenant's** root rather than the global storage root, and so that a tenant's reported capacity
reflects the tenant it belongs to.

## MODIFIED Requirements

### Requirement: Storage Root Containment Determines The Volume

Capacity SHALL be read for the volume that actually contains the root of the scope being reported —
the current tenant's root when a tenant is established, and the configured storage root otherwise.
It SHALL NOT be read for a path assumed to hold that root.

#### Scenario: A tenant's capacity is read for the tenant's own volume

- **GIVEN** an authenticated caller established in a tenant whose root sits on a particular volume
- **WHEN** capacity is reported for that tenant
- **THEN** the reading is taken from the volume containing that tenant's root
- **AND** it is not taken from the volume containing the configured storage root

#### Scenario: The fallback path still reads the configured root's volume

- **GIVEN** no tenant has been established for the reporting scope
- **WHEN** capacity is read
- **THEN** the reading is taken from the volume containing the configured storage root

#### Scenario: Tenants on one volume report consistent capacity

- **GIVEN** two tenants whose roots are on the same volume
- **WHEN** capacity is reported for each
- **THEN** both readings describe that volume
- **AND** neither is derived from the other's data


#### Scenario: Volume is resolved from the resolved root

- **WHEN** capacity is read
- **THEN** the path used is the resolved storage root
- **AND** a trailing separator or redundant current-directory segment in the configured value does not change which volume is measured

#### Scenario: Missing root does not produce a fabricated reading

- **GIVEN** the configured storage root does not exist
- **WHEN** capacity is requested
- **THEN** the result is either a real reading for the containing volume or an explicit unavailability
- **AND** no placeholder capacity is invented
## ADDED Requirements

### Requirement: Capacity Reporting Is Tenant-Scoped In The Response

A response carrying capacity SHALL carry it for the tenant the request was served against, so that a
caller cannot read one tenant's capacity in a response to a request about another.

#### Scenario: Capacity accompanies the caller's own tenant data

- **WHEN** a summary is returned to a caller
- **THEN** the capacity figures in it describe the caller's tenant
- **AND** no other tenant's capacity figure appears

#### Scenario: A caller cannot obtain another tenant's capacity

- **GIVEN** an authenticated caller established in tenant A
- **WHEN** it attempts to obtain tenant B's capacity
- **THEN** the attempt is refused
- **AND** no figure from tenant B's volume is disclosed in the refusal

#### Scenario: Volume-level figures are labelled as process-wide when process-wide

- **WHEN** a metric describes the host rather than the tenant
- **THEN** it is labelled as a host-level or platform-level figure
- **AND** it is not presented as the tenant's own usage