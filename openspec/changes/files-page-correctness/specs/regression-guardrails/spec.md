# Regression Guardrails

## Purpose

Requires that every defect this change addresses has a test that fails before the fix and passes after, that the test command cannot be broken from outside the test directory, and that the project's own documentation reflects the shipped contract. This capability exists because `files.js` — the largest, most stateful and only mutating module in the application — had **zero** test coverage, and because a leftover scratch file made the suite red.

## ADDED Requirements

### Requirement: The Files Page Module Has Automated Coverage

The Files page module SHALL have automated coverage of its pure and DOM-reachable logic, using the repository's existing zero-dependency test approach.

#### Scenario: Coverage exists for the module

- **WHEN** the test suite runs
- **THEN** a suite exercises the Files page module's behaviour
- **AND** it uses the established test runner and assertion library with no new dependency

#### Scenario: The established approach is followed

- **WHEN** the module is loaded under test
- **THEN** the same minimal global stubbing approach used by the existing frontend suites is used
- **AND** no browser automation harness and no new dependency is introduced

#### Scenario: Both view modes are covered

- **WHEN** the module's rendering is exercised
- **THEN** both the list rendering path and the grid rendering path are covered

### Requirement: Every Regressed Defect Has A Failing-First Test

Each defect addressed by this change SHALL be covered by a test that fails against the pre-change code.

#### Scenario: Upload misfiling is pinned

- **WHEN** the upload suite runs
- **THEN** it asserts the on-disk location of an uploaded file for the client's field ordering
- **AND** the assertion is on the filesystem, not on the response body

#### Scenario: ZIP availability is pinned

- **WHEN** the API contract suite runs
- **THEN** it asserts the ZIP endpoint is reachable and returns an archive content type

#### Scenario: Single-handler rule is pinned

- **WHEN** the frontend suite runs
- **THEN** it asserts the bulk-download control is bound exactly once

#### Scenario: Partial delete reporting is pinned

- **WHEN** the API contract suite runs
- **THEN** it asserts a mixed-result delete reports both the surviving and the failed path

#### Scenario: Taxonomy agreement is pinned

- **WHEN** the taxonomy suite runs
- **THEN** it asserts the server and client extension sets are identical

#### Scenario: Error-versus-empty is pinned

- **WHEN** the frontend suite runs
- **THEN** it asserts a rejected request renders an error state and not the empty-directory message

#### Scenario: Navigation consistency is pinned

- **WHEN** the frontend suite runs
- **THEN** it asserts the tree's active node follows navigation for every entry point

#### Scenario: Selection retention is pinned

- **WHEN** the frontend suite runs
- **THEN** it asserts a selection survives a sort

#### Scenario: Page clamping is pinned

- **WHEN** the frontend suite runs
- **THEN** it asserts deleting the sole entry on the final page lands on a page with entries

#### Scenario: Escaping is pinned

- **WHEN** the frontend suite runs
- **THEN** it asserts a markup-bearing entry name renders as text

#### Scenario: Dead-surface removal is pinned

- **WHEN** the frontend suite runs
- **THEN** it asserts no hardcoded share URL, no phase-referencing user-visible string, and no `window.open` call remain

### Requirement: The Test Command Is Scoped And Green

The test command SHALL discover only the project's tests and SHALL exit successfully when they pass.

#### Scenario: Scratch files cannot break the suite

- **GIVEN** a test-shaped file outside the test directory
- **WHEN** the test command runs
- **THEN** that file is not discovered
- **AND** the command's result is determined solely by the project's tests

#### Scenario: The suite is green

- **WHEN** the test command runs on a clean checkout
- **THEN** it exits zero

#### Scenario: No new dependency is introduced

- **WHEN** this change lands
- **THEN** the dependency manifest is unchanged except for the test command itself
- **AND** no test-only dependency is added

### Requirement: Source-Level Guards For Structural Defects

Defects that are structural rather than behavioural — duplicate handlers, uncalled functions, inline styles, unbound controls, orphaned handlers — SHALL be pinned by assertions over the source, because no runtime test observes them.

#### Scenario: Structural assertions exist and run in the suite

- **WHEN** the test suite runs
- **THEN** it asserts the absence of duplicate control bindings, uncalled functions, inline style attributes, unbound interactive controls, and handlers targeting non-existent elements

#### Scenario: Source-level assertions are not brittle substitutes for behaviour tests

- **WHEN** a structural assertion is added
- **THEN** a behavioural test accompanies it where the defect is observable at runtime

### Requirement: The Full Suite Is Re-Green After Every Contract Change

A change to the listing contract, the taxonomy, or a response shape SHALL be accompanied by a full-suite run, and any pre-existing expectation that the change invalidates SHALL be updated deliberately.

#### Scenario: Contract change is validated against the whole suite

- **WHEN** a change alters a response shape or an extension classification
- **THEN** the entire suite is run
- **AND** any failing expectation is inspected to determine whether the change or the expectation is wrong

#### Scenario: Weakened assertions are prohibited

- **WHEN** a pre-existing test fails after a legitimate contract change
- **THEN** its assertion is updated to the new correct contract with a stated reason
- **AND** it is not deleted, skipped, narrowed, or replaced with a weaker assertion to reach green

### Requirement: Documentation Reflects The Shipped Contract

Project documentation SHALL describe the behaviour this change ships.

#### Scenario: Contract documentation is updated

- **WHEN** this change lands
- **THEN** the project's contract documentation describes the reconciled taxonomy, the unclassified bucket, the delete endpoint's partial-failure semantics, the ZIP endpoint, the star endpoint, and the upload field-ordering constraint

#### Scenario: Stale gap notes are removed

- **WHEN** this change lands
- **THEN** notes describing the inline taxonomy copy as an open escalation are removed, because they are no longer accurate

#### Scenario: Test-count and suite-status claims are accurate

- **WHEN** project documentation states the test suite's size or status
- **THEN** the statement matches the suite as it stands after this change

#### Scenario: Decision records are added

- **WHEN** this change lands
- **THEN** a decision record exists covering the security posture deferral and the taxonomy reconciliation direction

## Regression Requirements

- A test SHALL assert the Files page module suite exists and is discovered by the test command.
- A test SHALL assert the test command's discovery is scoped to the test directory.
- A test SHALL assert the dependency manifest lists no dependency introduced by this change.
- A test SHALL assert `.gitignore` excludes both the environment file and the scratch directory.
- `npm test` SHALL exit zero on a clean checkout with this change applied.