# Upload Error Disclosure

## Purpose

Defines what a client receives when an upload-related request fails: no stack traces and no internal paths by default, human-readable messages that are safe to display, and a disclosure path that must be opted into explicitly rather than reached by accident.

## ADDED Requirements

### Requirement: Stack Traces Are Never Disclosed

An error response SHALL NOT carry a stack trace. There is no configuration that turns disclosure on, because the application ships without authentication and a stack trace has no consumer in a browser.

#### Scenario: No configuration discloses a stack

- **WHEN** an upload request fails
- **THEN** the response body contains no `stack` field
- **AND** no frame reference appears anywhere in the body
- **AND** this holds in every runtime environment

#### Scenario: An unset environment selector discloses nothing

- **GIVEN** no environment selector is configured at all
- **WHEN** an upload request fails
- **THEN** no stack trace is disclosed
- **AND** the absence of configuration does not enable disclosure

#### Scenario: A development start discloses nothing

- **WHEN** the server is started through its development start script
- **THEN** no stack trace is disclosed

#### Scenario: A production start discloses nothing

- **WHEN** the server is started through its production start script
- **THEN** no stack trace is disclosed

#### Scenario: There is no disclosure switch to set

- **WHEN** the server's configuration is inspected
- **THEN** no setting exists whose purpose is to disclose a stack trace to clients
- **AND** no such setting is documented as available

### Requirement: Internal Paths Are Not Disclosed

No error response SHALL contain an absolute operating-system path, a drive letter, a backslash-separated path, or an internal module or frame reference.

#### Scenario: A validation failure discloses only its message

- **WHEN** an upload is rejected because the file name is invalid
- **THEN** the response body contains the rejection reason
- **AND** it contains no file path, no stack, and no internal location

#### Scenario: A destination failure does not echo the resolved path

- **WHEN** an upload is rejected because its destination is unusable
- **THEN** the response identifies the client path that was rejected
- **AND** it does not disclose the absolute path the client path resolved to

#### Scenario: An expected rejection keeps its own message

- **WHEN** a failure was raised deliberately by a request handler with an authored, human-readable reason
- **THEN** the client-visible message is that reason
- **AND** it is forwarded in every runtime environment, not only in production

#### Scenario: An unexpected failure discloses a generic message

- **WHEN** a failure was not anticipated by the handler
- **THEN** the client-visible message is a fixed string
- **AND** the underlying system message is not interpolated into it
- **AND** this holds in every runtime environment, not only in production

#### Scenario: A non-expected failure never leaks through a non-500 status

- **WHEN** a failure that was not anticipated by the handler carries a client-error status
- **THEN** the client-visible message is still the fixed generic string
- **AND** sanitisation is not conditioned on the status being a server error

#### Scenario: The underlying error is still recorded server-side

- **WHEN** any request fails
- **THEN** the underlying error and its location are written to the server log
- **AND** reducing client disclosure does not reduce server-side diagnosis

### Requirement: Failure Messages Are Displayable And Non-Volatile

A failure message SHALL be a stable, human-readable string that is safe to insert into the interface, and SHALL NOT vary between requests in a way that changes its meaning.

#### Scenario: The same failure yields the same message

- **WHEN** the same invalid request is submitted repeatedly
- **THEN** each response carries the same message text

#### Scenario: The message does not embed request-specific internals

- **WHEN** a failure message is produced
- **THEN** it does not embed a raw system message, a numeric code with no explanation, or a truncated response body

#### Scenario: Message length is bounded

- **WHEN** a failure message is produced from an oversized or binary upstream body
- **THEN** its length is bounded
- **AND** a large body is not echoed to the client

### Requirement: Upload Failures Carry A Machine-Readable Kind

An upload failure SHALL carry a stable, machine-readable kind alongside its human-readable message, so a client can distinguish failure classes without parsing prose.

#### Scenario: A name rejection is distinguishable

- **WHEN** an upload is rejected by name validation
- **THEN** the response carries the kind identifying a name rejection
- **AND** that kind differs from the kind for a size rejection

#### Scenario: A size rejection is distinguishable

- **WHEN** an upload is rejected because it exceeds the permitted size
- **THEN** the response carries the kind identifying a size rejection
- **AND** the status identifies the condition as a payload-size problem rather than a malformed request

#### Scenario: A collision is distinguishable

- **WHEN** an upload is rejected because the destination already holds that file and overwriting is disallowed
- **THEN** the response carries the kind identifying a collision
- **AND** the status identifies the condition as a conflict

#### Scenario: A missing destination is distinguishable

- **WHEN** an upload is rejected because its destination does not exist
- **THEN** the response carries the kind identifying a missing destination

#### Scenario: Kinds are stable identifiers, not sentences

- **WHEN** a failure kind is serialised
- **THEN** it is a short stable token
- **AND** it does not change when the human-readable message is reworded

#### Scenario: An unrecognised failure still serialises

- **WHEN** a failure has no assigned kind
- **THEN** the response still carries the standard error envelope
- **AND** the client can fall back to the human-readable message

### Requirement: Failure Bodies Are Of A Known Shape

Every upload failure SHALL serialise to the application's standard error envelope, and SHALL NOT vary its shape by failure class.

#### Scenario: The envelope is consistent across failure classes

- **WHEN** an upload fails for any reason
- **THEN** the body reports failure using the standard keys
- **AND** a client parses one shape regardless of the cause

#### Scenario: Status codes are specific where the class warrants it

- **WHEN** a failure belongs to a class with a specific status
- **THEN** that status is used rather than a single generic status for every failure
