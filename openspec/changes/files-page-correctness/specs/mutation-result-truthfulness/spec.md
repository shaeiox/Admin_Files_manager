# Mutation Result Truthfulness

## Purpose

Defines what the UI is permitted to claim about the outcome of a failed or partial operation, and requires the distinction between *empty* and *broken* to be representable in state. This capability exists because a partial delete returned `success: true` and was reported as a complete success, and because any backend failure on the Files page rendered as a confident empty directory with an upload call to action.

## ADDED Requirements

### Requirement: Partial Failure Is Reported As Partial Failure

An operation that deletes, renames or writes a set of items SHALL report which items succeeded and which failed, and the client SHALL present both.

#### Scenario: Mixed-result delete reports both sides

- **GIVEN** a delete request containing one existing path and one path that does not exist
- **WHEN** the request completes successfully at the transport level
- **THEN** the response reports the surviving path as deleted and the missing path as failed, with a reason
- **AND** the client shows a partial-failure report
- **AND** no message states that all items were deleted

#### Scenario: The success count is derived from the response

- **WHEN** a bulk delete completes
- **THEN** the number reported as deleted equals the number of paths the response lists as deleted
- **AND** it is not derived from a selection count that may not match the paths sent

#### Scenario: The failure report names each failed path

- **WHEN** one or more items fail
- **THEN** each failed path is identified
- **AND** the server's reason for each failure is shown rather than a generic message

#### Scenario: A wholly failed operation is an error

- **WHEN** every path in a delete request fails
- **THEN** the request fails with an error status
- **AND** the client reports the error
- **AND** no success message is shown

#### Scenario: A successful operation is reported as successful

- **WHEN** every path in a delete request succeeds
- **THEN** the client reports the count actually deleted

### Requirement: Error And Empty Are Distinct States

A failed load SHALL be representable in state and SHALL render differently from a successful load that returned no items.

#### Scenario: Failed list load renders an error state

- **GIVEN** the list request fails for any reason
- **WHEN** the page renders
- **THEN** it shows an error state identifying the failure
- **AND** it does not show the empty-directory message
- **AND** it does not show the empty-directory call to action

#### Scenario: Successful empty load renders an empty state

- **GIVEN** the list request succeeds and returns zero items
- **WHEN** the page renders
- **THEN** it shows the empty state
- **AND** the operator can distinguish this from an error without reading the network panel

#### Scenario: Error state offers a retry that works

- **WHEN** the operator activates retry from an error state
- **THEN** the failed request is re-issued
- **AND** a successful retry renders the listing
- **AND** a failed retry renders the error state again rather than the empty state

#### Scenario: Error state is cleared by a successful load

- **WHEN** a load succeeds after a previous failure
- **THEN** the error state is cleared
- **AND** no stale error remains visible

#### Scenario: Failure of one capability does not fabricate another

- **GIVEN** the folder tree fails to load while the file list succeeds
- **WHEN** the page renders
- **THEN** the tree area shows an error or an explicitly empty state
- **AND** it does not show a synthesised tree structure

### Requirement: No Fabricated Fallback Data

Where a load fails, the page SHALL NOT substitute invented data. A synthetic structure that resembles real data is prohibited.

#### Scenario: No synthetic tree on tree failure

- **WHEN** the folder tree request fails
- **THEN** no placeholder tree node is fabricated
- **AND** no node implying a known hierarchy is rendered

#### Scenario: No invented counts

- **WHEN** the list response does not carry per-type counts
- **THEN** no count is displayed for any chip
- **AND** the chips render without counts rather than with a substituted value

#### Scenario: No placeholder values for unknown quantities

- **GIVEN** a quantity that could not be measured
- **WHEN** it is rendered
- **THEN** it is rendered as explicitly unavailable
- **AND** it is never rendered as zero or as any non-zero stand-in

### Requirement: Success Is Reported Only After The Operation Succeeds

No message SHALL assert that an operation completed before the operation has completed.

#### Scenario: No premature upload success

- **WHEN** an upload batch begins
- **THEN** the initial message describes the batch as started or in progress
- **AND** the completion message appears only after every file's outcome is known

#### Scenario: No premature download success

- **WHEN** a download is requested
- **THEN** no message asserts the file downloaded successfully before the transport has begun

#### Scenario: Star toggle reports its real outcome

- **WHEN** a star is toggled
- **THEN** the displayed star state reflects the value the server returned
- **AND** on failure the previous state is restored and the failure is shown

### Requirement: Mutation Failures Are Recoverable By Reload

When a mutation's outcome is unknown or the post-mutation refresh fails, the page SHALL return to a state consistent with the server rather than to an optimistic guess.

#### Scenario: Failed mutation does not leave a phantom row

- **WHEN** a delete fails
- **THEN** the item remains visible
- **AND** no optimistic removal is left on screen

#### Scenario: Failed refresh after a successful mutation re-reads

- **WHEN** a mutation succeeds but the subsequent listing refresh fails
- **THEN** the page shows the error state
- **AND** it does not present the stale pre-mutation listing as current

## Regression Requirements

- A test SHALL delete one existing and one missing path and assert the client-facing result is a partial-failure report containing both the surviving path and the failed path, and does not contain an unqualified success claim.
- A test SHALL assert the reported deleted count equals the response's deleted-list length for a selection whose size deliberately differs from the paths sent.
- A test SHALL drive a rejected list request and assert the rendered output is the error state, not the empty-directory message.
- A test SHALL drive a rejected tree request and assert no synthetic tree node is rendered.
- A test SHALL drive a successful empty list and assert the empty state renders and is distinguishable from the error state.
- A test SHALL assert the star toggle reverts its displayed state when the request fails.
- `docs/CONTRACTS.md` SHALL state explicitly that a successful status from the delete endpoint does not imply every path was deleted, since that is currently undocumented and is the root of the false-success defect.