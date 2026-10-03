# Filesystem Security

## Purpose

Defines the path-containment boundary that every filesystem operation must pass through, including the corrected rule that replaces naive string-prefix matching, the consistency requirement for the reverse client-path conversion, and the prohibition on leaking absolute operating-system paths through the HTTP layer.

## ADDED Requirements

### Requirement: Separator-Boundary Path Containment

A resolved target SHALL be treated as contained within the storage root only when the target is exactly the root, or when the target begins with the root followed by the platform's native path separator.

#### Scenario: Sibling directory sharing a name prefix is rejected

- **GIVEN** a storage root whose final path segment is `download`
- **WHEN** a client path resolves to a sibling directory named `download-backup`
- **THEN** the resolution is rejected with status `403`
- **AND** no filesystem access occurs

#### Scenario: Nested escape to a sibling prefix is rejected

- **GIVEN** a storage root whose final path segment is `download`
- **WHEN** a client path such as `/media/../../download-2/x` is resolved
- **THEN** the resolution is rejected with status `403`

#### Scenario: Classic parent traversal is rejected

- **WHEN** a client path containing enough `..` segments to escape the root is resolved
- **THEN** the resolution is rejected with status `403`

#### Scenario: Root itself is contained

- **WHEN** the client path `/` is resolved
- **THEN** the result is the storage root and the resolution succeeds

#### Scenario: Direct and nested children are contained

- **WHEN** `/media/a.txt` or `/a/b/c.txt` is resolved
- **THEN** the resolution succeeds and the result lies within the root

#### Scenario: Verdicts are identical across root spellings

- **WHEN** the storage root is expressed as a Windows path with a trailing separator, with forward slashes, in a different letter case, or with a redundant current-directory segment
- **THEN** the containment verdict for any given client path is identical in every spelling

#### Scenario: Verdict is identical on a POSIX-shaped root

- **WHEN** the storage root is expressed as a POSIX absolute path
- **THEN** the containment verdict for any given client path matches the Windows-root verdict

### Requirement: Single Resolution Basis

Containment SHALL be computed from a single consistent path-resolution basis on both sides of the comparison.

#### Scenario: No mixed resolution basis

- **WHEN** containment is evaluated
- **THEN** both the root and the target are produced by the same resolution function
- **AND** a canonicalised form of the root is never compared against a non-canonicalised target, because on a case-insensitive filesystem the canonical form may differ in letter case or use a short name

#### Scenario: Trailing separators in configuration are harmless

- **WHEN** the configured storage root ends with a path separator, or contains a redundant current-directory segment
- **THEN** the resolved root is identical to the same path expressed without those segments
- **AND** containment verdicts are unaffected

#### Scenario: Separator normalisation and letter-case normalisation are distinct

- **WHEN** the configured storage root is expressed with a different letter case but otherwise identical segments
- **THEN** the resolved root **retains the configured letter case**, because path resolution does not case-fold
- **AND** only separator and current-directory normalisation is performed
- **AND** no documentation or test asserts that differently-cased spellings normalise to one identical root string, because that is not true

#### Scenario: Case-mismatched spellings fail closed

- **GIVEN** a case-insensitive volume where two spellings of the root name denote the same directory
- **WHEN** a client path re-enters the root using a different letter case
- **THEN** containment denies the path
- **AND** the denial is a false rejection of a legitimate path, not a security bypass
- **AND** normal client round-trips are unaffected, because paths handed to the client are derived from the configured root and therefore preserve its case

### Requirement: Reverse Client-Path Conversion Is Consistent

The conversion from an absolute path back to a client path SHALL apply the same containment principle as the forward conversion.

#### Scenario: Outside-root absolute path is not converted

- **GIVEN** an absolute path that lies outside the storage root
- **WHEN** it is converted to a client path
- **THEN** the conversion does not emit a client path representing that outside location
- **AND** the result does not masquerade the outside path as a path inside the managed tree

#### Scenario: Inside-root absolute path converts to a POSIX client path

- **WHEN** an absolute path within the root is converted
- **THEN** the result is a POSIX path rooted at `/`
- **AND** the result uses forward slashes regardless of the host platform

### Requirement: Storage Root Deletion Remains Blocked

The prohibition on deleting the storage root SHALL continue to hold after the containment rule changes.

#### Scenario: Root deletion is refused

- **WHEN** a delete operation targets the storage root itself
- **THEN** it is refused with status `403`
- **AND** the refusal is unchanged by the containment correction

#### Scenario: Rename rejects a traversing new name via name validation

- **GIVEN** a rename operation derives a target path from a caller-supplied name
- **WHEN** the name contains a path separator or a parent reference
- **THEN** the rename is rejected before any filesystem access
- **AND** the rejection originates from filename validation, which is the effective barrier

#### Scenario: The PathService re-validation inside rename is NOT the effective barrier

- **GIVEN** rename converts the derived target path to a client path and feeds it back through the forward conversion, intending to re-validate
- **WHEN** the derived target lies outside the root
- **THEN** the reverse conversion yields the root client path, and the forward conversion accepts it as the root
- **AND** the re-validation therefore succeeds silently rather than raising
- **AND** this is recorded as a known-ineffective defence-in-depth check, not as a working control
- **AND** no requirement anywhere depends on this check being effective, because filename validation is the control that actually holds

> **Scope note.** Making this re-validation effective requires changing `FileSystemService.rename`, which is outside Phase 1's file ownership. It is escalated rather than silently absorbed. Recorded during Phase 1 implementation.

### Requirement: Symbolic Links And Junctions Are Skipped

Recursive aggregation SHALL detect symbolic links and Windows junctions and SHALL exclude them entirely.

#### Scenario: Link to an outside directory is not traversed

- **GIVEN** a symbolic link or junction inside the storage root whose target lies outside the root
- **WHEN** aggregation runs
- **THEN** the link is not descended into
- **AND** no byte, file, or folder from the link target is counted

#### Scenario: Link name is never surfaced

- **WHEN** aggregation completes
- **THEN** no reported filename, folder name, or activity target derives from a link entry

#### Scenario: Link to an ancestor terminates

- **GIVEN** a link or junction inside the storage root whose target is an ancestor of that link
- **WHEN** aggregation runs
- **THEN** aggregation terminates within the configured traversal budget
- **AND** it does not recurse without bound

#### Scenario: Broken link is skipped

- **GIVEN** a link whose target does not exist
- **WHEN** aggregation runs
- **THEN** the entry is skipped without raising an error

#### Scenario: Link classification uses a non-following primitive

- **WHEN** a directory entry is classified
- **THEN** classification uses directory-entry metadata that reports symbolic-link status without following the link
- **AND** classification never relies on a call that follows links, because such a call reports a link as an ordinary directory

### Requirement: Filesystem-Derived Strings Are Escaped Before Markup Insertion

Any string derived from the filesystem or from the metadata store SHALL be escaped before it is inserted into HTML markup.

#### Scenario: Filenames containing markup characters are inert

- **GIVEN** a file inside the storage root whose name contains markup-significant characters, placed there by any means that does not pass through upload validation
- **WHEN** the Dashboard renders that name
- **THEN** the name is rendered as text
- **AND** it does not introduce markup or script into the document

#### Scenario: Metadata-derived strings are escaped

- **WHEN** an activity target, action, or folder is rendered
- **THEN** the value is escaped before insertion
- **AND** the metadata store, which accepts free-form values, cannot introduce markup into the page

### Requirement: No Absolute Path In Any Response

No Dashboard response SHALL expose an absolute operating-system path, in either the success payload or the error payload.

#### Scenario: Success payload is path-free

- **WHEN** a Dashboard response is serialised
- **THEN** no value contains an absolute path, a drive letter, or a backslash-separated path

#### Scenario: Error payload is path-free in every environment

- **WHEN** a Dashboard endpoint fails
- **THEN** the client-visible error message is a static string
- **AND** the message does not interpolate a filesystem path or a raw system error message
- **AND** this holds in every runtime environment, not only in production
