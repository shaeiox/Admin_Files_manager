# Markup Escaping And Security Boundary

## Purpose

Requires every filesystem-derived string to be escaped before markup insertion, and requires the substrate-level security posture of an unauthenticated, origin-open API to be a recorded decision rather than an undiscovered one. This capability exists because filenames and paths reached the page's `innerHTML` unescaped at six sites, the content security policy is disabled, cross-origin access to every mutating endpoint is unrestricted, and the environment file is tracked by a repository whose ignore rules exclude it only as a commented-out line.

## ADDED Requirements

### Requirement: Filesystem-Derived Strings Are Escaped Before Insertion

Any string originating from the filesystem, the metadata store, or a client path SHALL be escaped before it is inserted into markup.

#### Scenario: Names containing markup characters are inert

- **GIVEN** an entry inside the storage root whose name contains markup-significant characters, present by any means that does not pass through upload validation
- **WHEN** it is rendered in the list, the grid, the drawer, or a breadcrumb
- **THEN** it renders as text
- **AND** it introduces no markup or script into the document

#### Scenario: Paths are escaped

- **WHEN** an entry's client path is rendered
- **THEN** the path is escaped before insertion

#### Scenario: Breadcrumb segments are escaped

- **WHEN** a breadcrumb segment is rendered from a directory name
- **THEN** the segment is escaped before insertion

#### Scenario: Metadata-derived strings are escaped

- **WHEN** a value originating from the metadata store is rendered
- **THEN** it is escaped before insertion

#### Scenario: Escaping is applied uniformly, not at remembered sites

- **WHEN** the module is inspected
- **THEN** every interpolation of a filesystem- or metadata-derived value into markup is escaped
- **AND** escaping is not applied at only the one site that previously remembered to

#### Scenario: Escaping is not relied on as the only control

- **WHEN** upload-time filename validation is considered
- **THEN** it remains in place as a control
- **AND** rendering-time escaping is treated as a second, independent layer, because the storage root is operator-controlled and may be populated out of band

### Requirement: Response Messages Do Not Disclose Filesystem Detail

Client-visible error messages SHALL be static strings that do not interpolate a filesystem path or a raw system error message.

#### Scenario: Upload errors do not disclose absolute paths

- **WHEN** an upload fails
- **THEN** the message does not contain an absolute filesystem path
- **AND** this holds in every environment, not only in production

#### Scenario: Path validation errors do not disclose the root

- **WHEN** a client path is refused
- **THEN** the message does not reveal the configured storage root

### Requirement: The Authentication Posture Is A Recorded Decision

The absence of authentication on the API SHALL be recorded as a deliberate design position with a named follow-up, not left implicit.

#### Scenario: The posture is documented

- **WHEN** the API's security posture is described in project documentation
- **THEN** it states that the API is unauthenticated
- **AND** it states that this is current design with a required follow-up before non-localhost exposure

#### Scenario: A follow-up is identified

- **WHEN** the decision record is written
- **THEN** it names authentication as required before the service is exposed beyond a trusted host
- **AND** it is not recorded as a closed item

### Requirement: Cross-Origin Access Is A Recorded Decision

The cross-origin policy on the API SHALL be recorded, and its interaction with the absence of authentication SHALL be stated explicitly.

#### Scenario: The current policy is documented

- **WHEN** the cross-origin policy is described
- **THEN** it states that any origin is permitted
- **AND** it states that combined with the absence of authentication, any page the operator visits can invoke every mutating endpoint

#### Scenario: The exposure is not understated

- **WHEN** the decision record is written
- **THEN** the cross-origin finding is recorded at the same severity as the missing authentication, not as a lesser hardening note

### Requirement: A Content Security Policy Is A Recorded Decision

The disabled content security policy SHALL be recorded as a decision, together with what it currently compensates for.

#### Scenario: The disabled policy and its consequence are documented

- **WHEN** the policy decision is recorded
- **THEN** it states that the policy is disabled
- **AND** it states that markup-injection escaping is therefore the only remaining layer for filesystem-derived content

#### Scenario: No claim is made that escaping alone is sufficient

- **WHEN** the decision record is written
- **THEN** it does not assert that escaping fully compensates for the absence of a policy

### Requirement: Secrets And Scratch Artefacts Are Excluded

The environment file and scratch directories SHALL be excluded from version control.

#### Scenario: Environment file is untracked

- **WHEN** the repository is checked fresh
- **THEN** the environment file is not tracked
- **AND** the ignore rule that excludes it is active rather than commented out

#### Scenario: Scratch directories are ignored and undiscoverable by the test runner

- **GIVEN** a scratch directory containing a test-shaped file outside the test directory
- **WHEN** the test command runs
- **THEN** that file is not discovered
- **AND** the scratch directory is excluded from version control

## Regression Requirements

- A test SHALL place an entry whose name contains markup-significant characters into the storage root without going through upload validation, list it, and assert the rendered output contains no injected element.
- A test SHALL assert the rendered output of the list, the grid, the drawer and the breadcrumb are all escaped for such an entry.
- A source-level test SHALL enumerate the interpolation sites in `files.js` and assert each filesystem- or metadata-derived value passes through the escaping helper.
- A test SHALL assert upload and validation error responses contain no absolute filesystem path.
- A test SHALL assert `.env` is reported as ignored by the repository's ignore rules.
- A test SHALL assert a scratch test file outside the test directory does not affect the test command's exit status.
- `docs/CONTRACTS.md` SHALL record the authentication posture, the cross-origin policy, and the disabled content security policy as stated limitations.
- A decision record SHALL be added under `docs/decisions/` covering the security posture, and SHALL cross-reference the existing open question about the environment file so the two are not tracked separately.