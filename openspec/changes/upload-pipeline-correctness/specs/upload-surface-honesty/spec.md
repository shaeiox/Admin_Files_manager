# Upload Surface Honesty

## Purpose

Defines the rule that the upload page reports only outcomes and capabilities the system actually has, and the removal of fabricated content, unimplemented capability claims, and labels that do not match the measurement.

## ADDED Requirements

### Requirement: No Fabricated Content Is Rendered

The page SHALL NOT render a file name, size, timestamp, count, or attribution that was not obtained from the system.

#### Scenario: No hardcoded file list is presented as real

- **WHEN** a list of recently uploaded files is shown
- **THEN** every entry originates from recorded server activity
- **AND** no entry is a literal embedded in the page's source

#### Scenario: Sizes are real measurements

- **WHEN** a size is displayed
- **THEN** it is a value reported by the system
- **AND** it is not a plausible-looking constant

#### Scenario: Timestamps are real observations

- **WHEN** a relative or absolute time is displayed
- **THEN** it derives from a recorded event time
- **AND** it is not computed from the current clock at render time to simulate history

#### Scenario: A count of zero is rendered as zero

- **WHEN** there are no recorded events
- **THEN** the section reports that there are none
- **AND** no illustrative row is shown in its place

#### Scenario: User attribution is not invented

- **WHEN** a section's subtitle attributes its content to people or accounts
- **THEN** the system actually resolves those identities
- **AND** where no identity exists, the attribution is removed

### Requirement: A Section With No Real Source Is Removed

A section whose content cannot be sourced from real data SHALL be absent from the page rather than populated with placeholder content.

#### Scenario: Real activity replaces the fabricated feed, or the section goes

- **WHEN** the recent-uploads section is implemented
- **THEN** it is populated from recorded server activity, or it is not rendered
- **AND** a hardcoded array is not an acceptable implementation of either outcome

#### Scenario: Absent data is reported as absent

- **WHEN** the section's source returns nothing
- **THEN** an empty state explains that nothing has been recorded
- **AND** the empty state offers the action that produces such records

#### Scenario: A source failure is not an empty state

- **WHEN** the section's source cannot be reached
- **THEN** the failure is distinguishable from an empty result
- **AND** a retry is offered

### Requirement: Capability Claims Match Server Behaviour

Every statement on the page describing what the system will do SHALL correspond to behaviour the server implements, or SHALL be gated behind a capability flag that the server reports.

#### Scenario: Unimplemented claims are removed

- **WHEN** the page states a capability involving checksum verification, content-delivery distribution, encryption, automatic retry, transfer resumption, compression, deduplication, or a quantified space saving
- **THEN** the server implements that behaviour, or the statement is not rendered

#### Scenario: A size cap is server-enforced before it is stated

- **WHEN** the page states a maximum permitted file size
- **THEN** the server enforces that maximum
- **AND** a client that ignores the page's own check is refused by the server

#### Scenario: A parallel-upload cap is not stated as a fixed fact

- **WHEN** the page states a maximum number of parallel uploads
- **THEN** that number reflects the value actually in effect

#### Scenario: A claim is gated when its availability varies

- **WHEN** a capability may be present or absent depending on server configuration
- **THEN** the claim is rendered only when the server reports the capability as available
- **AND** it is absent, not merely greyed, when it is unavailable

#### Scenario: Resumption claims match the transfer model

- **WHEN** the page states that transfers resume after an interruption or from a checkpoint
- **THEN** transfers genuinely resume from the last transferred byte
- **AND** a pause does not silently discard already-transferred bytes

#### Scenario: Encryption claims are verifiable or absent

- **WHEN** the page states that content is encrypted in transit
- **THEN** the encryption is performed by a component this system controls and can be verified
- **AND** where it is not, the statement is absent

### Requirement: Guidance Text Describes Actual Behaviour

Instructional copy that tells the operator how to use the system SHALL describe what the system does.

#### Scenario: Tips correspond to real presets

- **WHEN** the page recommends a preset for a workload
- **THEN** the named preset exists
- **AND** selecting it produces the described effect

#### Scenario: Quantified savings are not asserted

- **WHEN** the page states a percentage saving
- **THEN** the saving is produced by a mechanism this system implements
- **AND** no percentage is asserted without one

#### Scenario: Folder-structure claims match the transfer

- **WHEN** the page states that dropping a folder preserves its structure
- **THEN** the resulting directory tree matches the dropped folder's structure
- **AND** files with identical names in different folders both survive

#### Scenario: Retry claims match the retry behaviour

- **WHEN** the page states that failures are retried automatically
- **THEN** a retry occurs without operator action
- **AND** where retry is manual only, the page states that

### Requirement: Labels Describe The Quantity Displayed

Every label, tile caption, and section subtitle SHALL describe the quantity rendered beside it, using the same terms as the underlying source.

#### Scenario: Tile captions match their values

- **WHEN** a summary tile is rendered
- **THEN** its caption names the quantity shown
- **AND** the caption introduces no qualifier the source does not supply

#### Scenario: Instantaneous values are not described as trends

- **WHEN** a value is a single instantaneous reading
- **THEN** it is not captioned as a trend, a rate of change, or a comparison against a prior period

#### Scenario: No comparison is shown without a baseline

- **WHEN** the page shows a percentage change
- **THEN** both the current and the baseline value were measured
- **AND** a comparison against a value the system never recorded is not rendered

#### Scenario: Preset tags describe real settings

- **WHEN** a preset displays setting tags
- **THEN** each tag names a setting that is actually applied
