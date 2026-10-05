# Spec Delta

## ADDED Requirements

### Requirement: Symbolic Links And Junctions Are Not Followed On Read Or Download

The read/download boundary SHALL refuse to follow a symbolic link or Windows
junction whose target lies outside the storage root, matching the rule the
aggregation walk already applies.

#### Scenario: An outside-target link is refused for download

- **GIVEN** a symbolic link or junction inside the storage root whose target
  lies outside the root
- **WHEN** the link's client path is requested for download
- **THEN** the request is refused with status `403`
- **AND** no byte from the link target is streamed

#### Scenario: An outside-target link is refused for preview

- **WHEN** the link's client path is requested for a thumbnail preview
- **THEN** the request is refused with status `403`
- **AND** no byte from the link target is read for transformation

#### Scenario: An outside-target link is refused for archiving

- **WHEN** the link's client path is included in a ZIP request
- **THEN** the ZIP response refuses or excludes the link target
- **AND** no byte from the link target is archived

#### Scenario: A link to a path inside the root still resolves

- **GIVEN** a symbolic link inside the storage root whose target also lies
  inside the root
- **WHEN** its client path is requested for download
- **THEN** the request succeeds
- **AND** no outside-root byte is ever streamed

#### Scenario: Broken links are refused, not streamed

- **GIVEN** a symbolic link or junction inside the storage root whose target no
  longer exists
- **WHEN** its client path is requested for download
- **THEN** the request is refused with a client-error status
- **AND** no arbitrary partial read is attempted
