# Upload Regression Coverage

## Purpose

Defines the automated coverage the upload page and its server surface require so that the defects this change removes cannot silently return, and so that no scratch file outside the test directory can break the suite.

## ADDED Requirements

### Requirement: The Upload Page Has Dedicated Automated Coverage

The upload page's logic SHALL be covered by an automated suite. The page currently has none.

#### Scenario: A suite exists for the upload page

- **WHEN** the test command runs
- **THEN** a suite exercises the upload page's logic
- **AND** the suite is discovered by the project's test command

#### Scenario: The suite runs without a browser or a DOM library

- **WHEN** the upload page suite runs
- **THEN** it requires no headless browser and no new runtime dependency
- **AND** it stubs only the minimum host surface the page's script needs in order to be evaluated

#### Scenario: Pure logic is tested directly

- **WHEN** percentage, remaining-time, and tile-derivation logic is under test
- **THEN** it is exercised through its exported surface
- **AND** it is not tested by asserting on rendered markup where a direct call suffices

### Requirement: Every Removed Defect Has A Failing-Then-Passing Check

Every defect this change removes SHALL be pinned by a check that fails against the pre-change behaviour and passes after the fix.

#### Scenario: Degenerate-size checks fail before the fix

- **GIVEN** a queue item of zero bytes
- **WHEN** its progress is rendered
- **THEN** the check asserts the output contains neither `NaN` nor `Infinity`
- **AND** that check fails against the pre-change behaviour

#### Scenario: Unavailable-remaining-time checks fail before the fix

- **GIVEN** an uploading item whose measured speed is zero
- **WHEN** its remaining time is rendered
- **THEN** the check asserts an unavailable marker rather than a zero-second reading
- **AND** that check fails against the pre-change behaviour

#### Scenario: Tile-survival checks fail before the fix

- **GIVEN** completed items in the queue
- **WHEN** completed rows are cleared
- **THEN** the check asserts the completed-count and transferred-byte values are unchanged
- **AND** that check fails against the pre-change behaviour

#### Scenario: Global-progress checks fail before the fix

- **GIVEN** one failed item alongside completed items
- **WHEN** global progress is computed
- **THEN** the check asserts the failed item's partial bytes are excluded
- **AND** that check fails against the pre-change behaviour

#### Scenario: Escaping checks fail before the fix

- **GIVEN** a file name containing markup-significant characters
- **WHEN** the row for that item is rendered
- **THEN** the check asserts no element is introduced and the characters appear escaped
- **AND** that check fails against the pre-change behaviour

#### Scenario: Copy-absence checks fail before the fix

- **WHEN** the page's source is inspected
- **THEN** the check asserts no hardcoded recent-uploads array is present
- **AND** no unimplemented capability claim string is present
- **AND** those checks fail against the pre-change behaviour

#### Scenario: Well-formedness checks fail before the fix

- **WHEN** the page's markup is inspected
- **THEN** the check asserts no label element nests another label element
- **AND** that check fails against the pre-change behaviour

### Requirement: The Server Surface Is Pinned

The upload endpoint's error behaviour SHALL be pinned by a suite that runs against a live server.

#### Scenario: Error disclosure is pinned

- **WHEN** an upload is rejected
- **THEN** the check asserts the body carries no `stack` field and no absolute path

#### Scenario: Failure kinds are pinned

- **WHEN** each rejection class is provoked in turn
- **THEN** the check asserts the expected machine-readable kind and status for each

#### Scenario: The suite uses a temporary storage root

- **WHEN** the suite runs
- **THEN** it writes only inside a temporary directory
- **AND** it does not read or write the configured production storage root

### Requirement: Rendering-Cost Requirements Are Checkable

The requirement that per-update cost does not scale with queue size SHALL be expressed as something a check can observe.

#### Scenario: Row updates are bounded to one row

- **WHEN** one row's state changes in a queue of many rows
- **THEN** the check asserts only that row's markup was rewritten

#### Scenario: Listener count does not grow with rows

- **WHEN** row controls are bound in a queue of many rows
- **THEN** the check asserts the registered listener count is constant with respect to row count

#### Scenario: The interval update preserves node identity

- **WHEN** the interval update runs
- **THEN** the check asserts the summary elements are the same node objects as before

### Requirement: The Suite Cannot Be Broken From Outside The Test Directory

Test discovery SHALL be scoped so that a scratch or debug file outside the test directory cannot fail the run.

#### Scenario: A scratch file outside the test directory is ignored

- **GIVEN** a file outside the test directory that would fail if executed as a test
- **WHEN** the test command runs
- **THEN** that file is not discovered
- **AND** the command's exit status is unaffected

#### Scenario: The baseline suite remains green

- **WHEN** the test command runs after this change
- **THEN** every pre-existing test still passes
- **AND** no pre-existing test is removed or weakened to accommodate the new behaviour

### Requirement: Documentation Tracks The Shipped Behaviour

The repository's contract and navigation documents SHALL describe the upload page's behaviour as shipped.

#### Scenario: The contract document records the failure classes

- **WHEN** the upload contract is documented
- **THEN** each failure class, its status, and its machine-readable kind are recorded

#### Scenario: The navigation document lists new files

- **WHEN** files are added by this change
- **THEN** the repository map lists them

#### Scenario: The operating rules record the new invariants

- **WHEN** this change establishes an invariant the page must keep
- **THEN** that invariant is recorded in the project's operating rules
