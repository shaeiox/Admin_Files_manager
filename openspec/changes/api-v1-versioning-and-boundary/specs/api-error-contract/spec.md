# Spec Delta

## Purpose

Defines the failure contract of the versioned API: the single error envelope every v1 endpoint
produces, the status codes that carry meaning, the machine-readable failure kind that is reserved for
future use, and the absolute prohibition on disclosing filesystem paths, stack traces or other
internal detail in any error payload.

## ADDED Requirements

### Requirement: One Error Envelope

Every failing v1 request SHALL produce a response body that is a JSON object containing a boolean
`success` whose value is `false` and a string `error` carrying a human-readable message. No other
field is required for the envelope to be well-formed.

#### Scenario: A handled failure produces the envelope

- **WHEN** a request fails with a recognised cause
- **THEN** the response body is a JSON object with `success` set to `false`
- **AND** the body carries a non-empty string `error`

#### Scenario: The envelope holds no filesystem detail

- **WHEN** any error response is serialised
- **THEN** the `error` value is a static authored string
- **AND** it contains no absolute operating-system path, drive letter, UNC prefix or backslash-separated path
- **AND** it contains no raw system error text or errno description

#### Scenario: No stack trace is ever serialised

- **WHEN** an error response is produced in any runtime environment
- **THEN** the response body contains no stack trace field and no stack-trace text
- **AND** this holds in the development environment exactly as in production

#### Scenario: Unrecognised failures are masked by status band

- **WHEN** a failure was not raised as an application error
- **THEN** the client-visible message is the generic string for its status band
- **AND** a framework-originated failure does not relay the framework's own message text

#### Scenario: Full detail is retained server-side

- **WHEN** an error is serialised to the client
- **THEN** the complete error, including its stack, is written to the server log
- **AND** no diagnosis is lost by masking the client-visible message

### Requirement: Status Codes Carry The Contract

The status code of a v1 failure SHALL be one of the documented meanings and SHALL be chosen by the
failing condition rather than by the handler that noticed it.

#### Scenario: Documented statuses are used for their documented conditions

- **WHEN** a request is rejected
- **THEN** its status is `400` for invalid input, `403` for a forbidden path or denied permission,
  `404` for a missing item or unknown endpoint, `409` for a collision, `413` for an oversized body,
  and `5xx` for a server-side fault
- **AND** no other status is introduced for these conditions

#### Scenario: An unknown endpoint is a not-found in the error envelope

- **WHEN** a request addresses a path that no mounted route serves
- **THEN** the status is `404`
- **AND** the body is the error envelope rather than an HTML page

#### Scenario: A partial success is not reported as a success status

- **GIVEN** a bulk operation deletes some of the requested paths and fails others
- **WHEN** the response is produced
- **THEN** the response reports the per-path outcome in its payload
- **AND** a consumer can tell a partial failure from a complete one without inferring it from the status alone

### Requirement: Failure Kind Is Reserved And Stable

The error envelope SHALL reserve an optional string field for a machine-readable failure kind, matching
the token format `^[a-z][a-z-]*$`. The field SHALL be absent rather than populated with a guess, and its
absence SHALL be a valid, documented state.

#### Scenario: An absent kind is valid

- **WHEN** an error envelope carries no failure kind
- **THEN** the envelope is well-formed and the request is treated as classified by its status alone
- **AND** no kind is inferred from the message text

#### Scenario: A kind is a short stable token, not prose

- **WHEN** a failure kind is present
- **THEN** it matches `^[a-z][a-z-]*$`
- **AND** it is not a rewording of the human-readable message

#### Scenario: A kind takes precedence over the status for classification

- **GIVEN** an error envelope carries a failure kind
- **WHEN** a consumer classifies the failure
- **THEN** it uses the kind
- **AND** it does not re-derive the classification from the status or the message

#### Scenario: Reserving the field is not emitting it

- **GIVEN** no v1 endpoint emits a failure kind in this change
- **WHEN** the contract is delivered
- **THEN** every error response is still well-formed without the field
- **AND** adding a kind to an endpoint later is an additive change that does not alter the envelope

### Requirement: Errors Are Produced Centrally

Every v1 failure SHALL be serialised by one central error handler. No route or controller SHALL
construct an error response inline.

#### Scenario: Handlers delegate failure to the central handler

- **WHEN** a controller encounters a failure
- **THEN** it signals the failure for central serialisation
- **AND** it does not write an error status and body itself

#### Scenario: Handlers do not construct error prose

- **WHEN** a route or controller is inspected
- **THEN** it contains no literal error message text intended for a client
- **AND** every client-visible message originates from a single authored-message discipline

### Requirement: Degraded Success Is Not An Error

An endpoint that answers a successful status while reporting an unavailable capability SHALL NOT be
changed by this change, and its partial-failure signalling SHALL remain inside its success payload
rather than moving into the error envelope.

#### Scenario: Partial capability failure keeps its documented signalling

- **GIVEN** an endpoint that degrades per capability
- **WHEN** one capability is unavailable
- **THEN** the response is a success status
- **AND** unavailability is expressed in the success payload by an explicit flag and null values
- **AND** the error envelope is not used to express it

#### Scenario: Versioning does not alter failure semantics

- **WHEN** the same request is issued to the versioned and the unversioned path
- **THEN** both fail, or both degrade, under identical conditions
- **AND** versioning introduces no change in which conditions are errors and which are degraded successes
