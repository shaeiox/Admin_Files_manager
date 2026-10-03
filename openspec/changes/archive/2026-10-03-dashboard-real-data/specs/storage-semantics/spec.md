# Storage Semantics

## Purpose

Defines the three distinct, non-interchangeable storage quantities the Dashboard reports, the pinned formula used to derive volume usage, and the observable behaviour when the platform cannot supply capacity information. Prevents the historical conflation of "how much data the managed tree holds" with "how full the disk is".

## ADDED Requirements

### Requirement: Three Distinct Quantities

The Dashboard SHALL report three separate byte quantities that SHALL NOT be derived from one another or substituted for one another.

#### Scenario: Tree bytes describe the managed tree only

- **WHEN** `storage.treeBytes` is computed
- **THEN** it equals the sum of regular-file sizes reachable from the storage root
- **AND** it excludes directory entry sizes
- **AND** it excludes entries reachable only through a symbolic link or junction
- **AND** it is unrelated to how full the containing volume is

#### Scenario: Used bytes describe the volume

- **WHEN** `storage.usedBytes` is computed
- **THEN** it describes usage of the volume that contains the storage root
- **AND** it includes storage consumed by anything else on that volume, not only the managed tree

#### Scenario: Total bytes describe volume capacity

- **WHEN** `storage.totalBytes` is computed
- **THEN** it equals the capacity of the volume that contains the storage root
- **AND** it is greater than or equal to `usedBytes` whenever both are available

#### Scenario: Tree bytes are never presented as a volume figure

- **WHEN** the Dashboard renders the storage breakdown
- **THEN** it labels the figure as managed-tree content
- **AND** it does not present the figure as disk usage or as a percentage of capacity

### Requirement: Volume Usage Uses Available-Block Semantics

Volume usage SHALL be computed as the block size multiplied by the difference between total blocks and blocks available to an unprivileged process.

#### Scenario: Usage formula

- **WHEN** capacity information is available
- **THEN** `usedBytes` equals `bsize * (blocks - bavail)`
- **AND** `totalBytes` equals `bsize * blocks`

#### Scenario: Block size is read, never assumed

- **WHEN** capacity information is read from the platform
- **THEN** the block size reported by the platform is used as-is
- **AND** no fixed block size constant is substituted for the reported value
- **AND** no conversion factor of 1024 is introduced, because the reported block size is not required to be a power of two

#### Scenario: Reported values are JSON-safe numbers

- **WHEN** capacity values are serialised into the response
- **THEN** they are plain JSON numbers
- **AND** they are not serialised as bigint values, which cannot be represented in JSON

### Requirement: Capacity Is Nullable And Declared Unavailable

When the platform cannot supply capacity information, the capacity fields SHALL be null and unavailability SHALL be declared explicitly, and the response SHALL still succeed.

#### Scenario: Unavailable capacity yields nulls

- **WHEN** capacity information cannot be obtained
- **THEN** `storage.usedBytes` is `null`
- **AND** `storage.totalBytes` is `null`
- **AND** `storage.volumeAvailable` is `false`
- **AND** the response status is `200`

#### Scenario: Unavailable capacity is never zero-filled

- **WHEN** capacity is unavailable
- **THEN** `usedBytes` and `totalBytes` are not reported as `0`
- **AND** `volumeAvailable` is not reported as `true`
- **AND** no placeholder numeric value is substituted

#### Scenario: Tree bytes remain available when capacity is not

- **WHEN** capacity is unavailable but the tree is readable
- **THEN** `storage.treeBytes` is still populated with a real value
- **AND** `volumeAvailable` is `false`
- **AND** the two facts are independently reportable

### Requirement: Volume Availability Reflects A Real Reading

`volumeAvailable` SHALL be true only when a capacity reading actually succeeded, and SHALL not be inferred from the presence of the storage root.

#### Scenario: Available volume is declared available

- **WHEN** a capacity reading succeeds and returns positive capacity
- **THEN** `volumeAvailable` is `true`
- **AND** `usedBytes` and `totalBytes` are numbers

#### Scenario: Degenerate reading is not reported as available

- **WHEN** a capacity reading succeeds but yields a non-positive capacity
- **THEN** `volumeAvailable` is `false`
- **AND** the byte fields are null

### Requirement: Storage Root Containment Determines The Volume

Capacity SHALL be read for the volume that actually contains the configured storage root, not for a path assumed to hold it.

#### Scenario: Volume is resolved from the resolved root

- **WHEN** capacity is read
- **THEN** the path used is the resolved storage root
- **AND** a trailing separator or redundant current-directory segment in the configured value does not change which volume is measured

#### Scenario: Missing root does not produce a fabricated reading

- **GIVEN** the configured storage root does not exist
- **WHEN** capacity is requested
- **THEN** the result is either a real reading for the containing volume or an explicit unavailability
- **AND** no placeholder capacity is invented
