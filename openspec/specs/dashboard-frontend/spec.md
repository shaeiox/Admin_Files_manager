# dashboard-frontend Specification

## Purpose
Defines the client-side behaviour of the Dashboard: the explicit states every panel must represent, the prohibition on fabricating fallback values after a request fails, the polling lifecycle including self-termination, and the reuse of existing client and UI primitives.

## Requirements

### Requirement: Explicit Panel States

Every Dashboard panel SHALL represent exactly one of the following states, and SHALL never present a value that does not correspond to one of them.

#### Scenario: Loading state is visually distinct

- **WHEN** a panel's data is in flight
- **THEN** the panel shows the project's existing loading affordance
- **AND** it displays no numeric value

#### Scenario: Success state renders real values only

- **WHEN** real data is available
- **THEN** every displayed number derives from the response
- **AND** no displayed number is a hardcoded literal

#### Scenario: Empty state is distinct from error

- **WHEN** the request succeeds but the collection is empty
- **THEN** the panel shows the project's existing empty-state affordance
- **AND** it does not show an error message

#### Scenario: Unavailable state is distinct from zero

- **WHEN** a quantity is legitimately unavailable
- **THEN** the panel shows an explicit unavailable or unknown indication
- **AND** it does not display `0`, `0.0%`, or an empty-looking numeric as if it were a measurement

#### Scenario: Partial state is shown when some capabilities are unavailable

- **WHEN** the response succeeds but one capability is unavailable
- **THEN** the available panels render their real values
- **AND** the unavailable panel renders its unavailable state
- **AND** the response is not discarded because of one unavailable capability

#### Scenario: Error state is shown on request failure

- **WHEN** the request fails
- **THEN** the panel shows an error indication
- **AND** the last known real values, if any, are either retained with an explicit staleness marker or replaced by the error state

### Requirement: No Fabricated Fallback Values

After a request fails or returns an unusable payload, the Dashboard SHALL NOT substitute invented values.

#### Scenario: No client-side identity fabrication

- **WHEN** the Dashboard renders the current user
- **THEN** the displayed value derives from a real response
- **AND** no hardcoded name, role, or avatar initial is displayed when no value is available

#### Scenario: No client-side quota fabrication

- **WHEN** the Dashboard renders a storage or usage figure outside the Dashboard summary
- **THEN** the displayed value derives from a real response
- **AND** no hardcoded capacity or usage figure is displayed when no value is available

#### Scenario: No percentage from unavailable bytes

- **GIVEN** a usage figure whose capacity is unavailable
- **WHEN** the sidebar storage indicator is rendered
- **THEN** it does not display a percentage
- **AND** it does not display a zero denominator rendered as a full or empty bar

#### Scenario: No placeholder text substituted for a missing timestamp

- **WHEN** a timestamp is absent or invalid
- **THEN** the panel shows an unavailable or unknown indication
- **AND** it does not display a date in the distant past or the literal text for an invalid date

#### Scenario: No fabricated relative-time baseline

- **WHEN** a relative time cannot be computed
- **THEN** no relative label is displayed
- **AND** no fallback date is displayed in its place

### Requirement: Backend-Owned Values Are Not Re-Derived

Values the backend computes SHALL be rendered as supplied and SHALL NOT be recomputed in the browser.

#### Scenario: Bar maximum is not recomputed

- **WHEN** a proportional bar is rendered
- **THEN** the proportion is derived from the server-supplied maximum
- **AND** the client does not compute its own maximum across the returned set

#### Scenario: Byte quantities are formatted, not reinterpreted

- **WHEN** a byte quantity is displayed
- **THEN** the client applies display formatting only
- **AND** the client does not multiply, divide, or rescale the value to fit an assumed unit

#### Scenario: Display units match the delivered unit

- **WHEN** a value is delivered in gigabytes and rendered with a unit suffix
- **THEN** the suffix corresponds to the unit the server actually delivered
- **AND** no mismatch exists between the delivered unit and the appended suffix

### Requirement: Polling Is Bounded And Self-Termating

Periodic refresh SHALL terminate on failure and SHALL NOT generate an unbounded chain of failing requests or repeated error notifications.

#### Scenario: Polling stops after failure

- **WHEN** a periodic refresh fails
- **THEN** no further refresh is scheduled
- **AND** the panel shows its error state

#### Scenario: Polling does not restart after a swallowed rejection

- **WHEN** an initial load fails and the failure handler completes without rethrowing
- **THEN** no refresh timer is started as a result of that failed load

#### Scenario: Failure produces at most one notification

- **WHEN** polling fails
- **THEN** the client does not emit one error notification per failed attempt
- **AND** repeated failures do not accumulate notifications

#### Scenario: Polling respects page visibility

- **WHEN** the page is hidden
- **THEN** periodic refresh does not run
- **AND** refresh resumes when the page becomes visible

#### Scenario: Refresh is manual or explicitly bounded

- **WHEN** the user triggers a manual refresh
- **THEN** a refresh occurs
- **AND** any interval that refresh starts is finite rather than unbounded

### Requirement: Existing Client And UI Primitives Are Reused

The Dashboard SHALL use the existing API client and existing shared UI helpers rather than introducing parallel mechanisms.

#### Scenario: API access goes through the shared client

- **WHEN** the Dashboard calls the backend
- **THEN** it calls through the existing shared API client
- **AND** no direct ad-hoc request is issued from a page module

#### Scenario: No response-envelope unwrapping is added

- **WHEN** the shared client parses a Dashboard response
- **THEN** the client returns the parsed body as-is
- **AND** no envelope-unwrapping step is added to accommodate a wrapper the contract does not use

#### Scenario: Existing loading and empty affordances are reused

- **WHEN** a panel renders a loading or empty state
- **THEN** it uses the styling primitives already present in the project's shared stylesheet
- **AND** no new visual primitive is introduced for this change

#### Scenario: Server-supplied colours are applied as values

- **WHEN** a breakdown segment is coloured
- **THEN** the colour supplied by the server is applied
- **AND** it is not written into a class-name attribute

### Requirement: Markup Structure Is Valid

Rendered markup SHALL be structurally valid, and each rendered element SHALL have at most one style attribute.

#### Scenario: No duplicated style attributes

- **WHEN** an element is rendered
- **THEN** it has at most one style attribute
- **AND** no element is emitted with two competing style attributes

#### Scenario: Non-functional controls are not shipped

- **WHEN** a control has no bound behaviour
- **THEN** it is either given working behaviour or removed
- **AND** it is not left present with semantics that imply interactivity it does not have

### Requirement: Sidebar Is Consistent Across Pages

The shared sidebar surface SHALL present the same real values on every page that renders it.

#### Scenario: Identical surface on every page

- **WHEN** any page that renders the sidebar is loaded
- **THEN** the sidebar presents the same values for the same server state

#### Scenario: No page-specific literals in the sidebar

- **WHEN** the sidebar markup is inspected on any page
- **THEN** it contains no hardcoded user, quota, or usage figure

#### Scenario: Values embedded in page scripts are real

- **WHEN** a page's inline script references a sidebar figure
- **THEN** the referenced value comes from a real response or is absent
- **AND** no literal copy of a fabricated figure remains in the script
