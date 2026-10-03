# cross-platform-contract Specification

## Purpose
Guarantees that the Dashboard behaves identically on Windows and Linux, and that the HTTP contract is platform-neutral: no drive letter, no backslash-separated absolute path, no platform-specific unit assumption, and no platform-dependent aggregation behaviour may appear in a response or differ between hosts.

## Requirements

### Requirement: Identical HTTP Contract On Every Host

The Dashboard response contract SHALL be field-for-field identical on Windows and Linux.

#### Scenario: Same fields, same types, same nullability

- **WHEN** the summary endpoint is served on Windows and on Linux
- **THEN** the response contains the same field names with the same types
- **AND** the same fields are nullable on both hosts
- **AND** no field exists on one host and not the other

#### Scenario: Same units

- **WHEN** any byte quantity is delivered
- **THEN** it is expressed in the same unit on both hosts
- **AND** no host-specific rescaling is applied

#### Scenario: Unavailability is expressed the same way

- **WHEN** a capability cannot be provided on a host
- **THEN** its absence is expressed with the same null and flag values on every host
- **AND** it is not expressed by omitting a field on one host

### Requirement: No Platform-Specific Detail In Responses

No response value SHALL reveal the host platform or a native filesystem path.

#### Scenario: No drive letters

- **WHEN** any response is serialised on Windows
- **THEN** no value contains a drive-letter prefix such as a letter followed by a colon

#### Scenario: No backslash-separated absolute paths

- **WHEN** any response is serialised on Windows
- **THEN** no value contains a backslash-separated absolute path

#### Scenario: No UNC paths

- **WHEN** any response is serialised on Windows
- **THEN** no value contains a UNC prefix

#### Scenario: No POSIX absolute paths for managed content

- **WHEN** a managed file or folder is referenced
- **THEN** the reference is a POSIX client path rooted at a forward slash
- **AND** it is never a native absolute path, on either host

#### Scenario: Platform is not advertised

- **WHEN** a response is serialised
- **THEN** it contains no field whose sole purpose is to expose the host platform to the browser
- **AND** capability unavailability is communicated through the documented null and flag values instead

### Requirement: Native Semantics Are Used Internally

Platform-native filesystem semantics SHALL be used for resolution, containment, and enumeration, and SHALL NOT be emulated with hardcoded separators.

#### Scenario: Native separator is used for containment

- **WHEN** containment is evaluated
- **THEN** the platform's native path separator is used
- **AND** no separator character is hardcoded to a single platform's convention

#### Scenario: Native path module is used for resolution

- **WHEN** a client path is resolved
- **THEN** the host platform's own path resolution routine is used
- **AND** no platform branch selects between a Windows rule and a POSIX rule

#### Scenario: Forward slashes in client paths are accepted on both hosts

- **WHEN** a client path uses forward slashes
- **THEN** it resolves identically on Windows and on Linux
- **AND** a backslash supplied by a client is not treated as a separator

### Requirement: Link Handling Is Uniform Across Hosts

The link-skipping policy SHALL produce the same result on Windows and Linux, despite the two hosts exposing links differently.

#### Scenario: Host-specific link creation does not change behaviour

- **GIVEN** a link entry produced by the host's native mechanism, whether a directory junction or a symbolic link
- **WHEN** aggregation runs
- **THEN** it is detected and skipped identically
- **AND** it does not contribute bytes, files, or folders

#### Scenario: Link-to-directory is not descended

- **WHEN** a link entry resolves to a directory
- **THEN** aggregation does not descend into it
- **AND** this holds even where the host's metadata API would otherwise classify it as a directory

### Requirement: Byte Accounting Is Platform-Neutral

Tree byte totals SHALL be computed identically on Windows and Linux for identical file content.

#### Scenario: Directory entry size is excluded on both hosts

- **WHEN** directories exist in the tree
- **THEN** their reported entry size contributes nothing to the total on either host
- **AND** this matters because directory entry sizes differ between hosts for identical content

#### Scenario: Identical content yields identical totals

- **GIVEN** two hosts holding identical file content organised differently
- **WHEN** aggregation runs on each
- **THEN** the reported tree byte totals are identical

#### Scenario: No block-size inflation of tree bytes

- **WHEN** tree bytes are accumulated
- **THEN** each file contributes its reported logical size
- **AND** no allocation-unit or block-size rounding is applied

### Requirement: Capacity Degrades Without Platform Branching

Volume capacity SHALL be obtained through the platform's own filesystem-statistics interface, and SHALL NOT be gated on a platform check.

#### Scenario: No operating-system detection gate

- **WHEN** capacity is read
- **THEN** the read is attempted unconditionally
- **AND** no code path checks the host platform name to decide whether to attempt it

#### Scenario: Unsupported interface yields unavailability

- **GIVEN** a host whose filesystem-statistics interface does not provide the required fields
- **WHEN** capacity is read
- **THEN** the result is an explicit unavailability
- **AND** it is not a zero reading and not a guessed value

#### Scenario: Fields unavailable on a host are handled generically

- **GIVEN** a host reports zero or absent values for the free-space fields
- **WHEN** capacity is computed
- **THEN** the computation is expressed in terms of blocks available to an unprivileged process
- **AND** the result remains a real reading on that host rather than an error
