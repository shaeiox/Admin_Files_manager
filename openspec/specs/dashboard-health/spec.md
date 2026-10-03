# dashboard-health Specification

## Purpose
Defines the Dashboard-scoped runtime health endpoint: the metric array it returns, the units and thresholds it is permitted to use, and the mandatory separation between Dashboard health reporting and the application's existing liveness endpoint.

## Requirements

### Requirement: Dashboard Health Is A Separate Endpoint From Liveness

The Dashboard SHALL obtain runtime health from its own endpoint, and the application's liveness endpoint SHALL remain unchanged.

#### Scenario: Liveness endpoint is unchanged

- **WHEN** a client issues `GET /api/health`
- **THEN** the response retains its existing shape, status, and semantics
- **AND** it continues to report liveness and environment information
- **AND** it is not repurposed, extended, or deprecated by this change

#### Scenario: Dashboard health has its own path

- **WHEN** a client issues `GET /api/dashboard/health`
- **THEN** the response contains runtime metrics for Dashboard display
- **AND** it is a distinct resource from the liveness endpoint

#### Scenario: Separation is documented

- **WHEN** the API contract is delivered
- **THEN** it states that the two endpoints have different purposes, different response shapes, and different consumers
- **AND** it states that neither is a substitute for the other

### Requirement: Health Response Is A Bare Metric Array

The Dashboard health endpoint SHALL return a top-level JSON array of metric objects.

#### Scenario: Metric object shape

- **WHEN** a metric is returned
- **THEN** it carries a display name, a numeric value, a unit, and an icon identifier
- **AND** the unit is one the renderer can display without inventing a conversion

#### Scenario: Array is never enveloped

- **WHEN** the response is serialised
- **THEN** the body is a JSON array
- **AND** it is not wrapped in an object with a success or data property

### Requirement: Metrics Are Honest About Units

Metrics SHALL NOT be presented with a unit they do not possess, and percentage semantics SHALL NOT be applied to a non-percentage quantity.

#### Scenario: Durations are not percentages

- **GIVEN** a metric whose value is a duration in seconds
- **WHEN** it is returned
- **THEN** it is not labelled with a percentage unit
- **AND** it is not rendered against a percentage progress scale
- **AND** the renderer does not divide the value by a percentage-oriented divisor

#### Scenario: Percentage metrics are real percentages

- **WHEN** a metric is labelled with a percentage unit
- **THEN** its value is a percentage of a real denominator
- **AND** the denominator is one the platform actually reports

#### Scenario: No unsupported healthy state

- **WHEN** a metric has no evidence-backed threshold
- **THEN** no healthy, warning, or critical state is asserted for it
- **AND** no default threshold constant is introduced to produce a status

#### Scenario: No invented thresholds

- **WHEN** health metrics are produced
- **THEN** threshold values are not hardcoded in the absence of a repository or platform source for them
- **AND** any threshold that is applied is traceable to platform-reported data or is subject to human approval

### Requirement: Health Reflects Real Platform Data

Every returned metric SHALL be derived from data the platform actually reports, and metrics that cannot be obtained SHALL be omitted rather than approximated.

#### Scenario: Unsupported metric is omitted

- **GIVEN** a candidate metric that the host platform does not expose portably
- **WHEN** the health endpoint is served
- **THEN** that metric is absent from the array
- **AND** no substituted or estimated value appears in its place

#### Scenario: Unavailable metric is omitted, not zeroed

- **GIVEN** a candidate metric whose read fails on this host
- **WHEN** the health endpoint is served
- **THEN** that metric is absent from the array
- **AND** it is not reported with a value of `0`, which would read as a healthy measurement

#### Scenario: Metric list is stable across polls

- **WHEN** the health endpoint is polled repeatedly on an unchanged host
- **THEN** the same set of metric names is returned each time
- **AND** metric rows do not appear and disappear between polls

### Requirement: Health Failures Do Not Corrupt The Summary

A failure to read a health metric SHALL NOT cause the whole summary response to fail.

#### Scenario: Health read failure degrades locally

- **WHEN** health metrics cannot be read while filesystem and metadata data are available
- **THEN** the summary response still succeeds
- **AND** the health array is empty
- **AND** all other summary fields are populated

#### Scenario: Health endpoint failure is explicit

- **WHEN** the health endpoint itself cannot produce any metric
- **THEN** it responds successfully with an empty array
- **AND** it does not respond with a server error that would trigger repeated client error toasts
