# Spec Delta

## MODIFIED Requirements

### Requirement: Queue Items Have A Closed, Observable Lifecycle

Every queue item SHALL occupy exactly one of a fixed set of states at any moment, and every state transition SHALL be reachable through a user action or a network outcome that the page reports.

#### Scenario: Adding a file yields a queued item

- **WHEN** a user adds one or more files through any supported input
- **THEN** each accepted file appears as an item in the `queued` state
- **AND** each item reports its true byte size as reported by the browser
- **AND** a confirmation naming the number of files added is shown

#### Scenario: A file that cannot be queued is named, not merely counted

- **WHEN** one or more offered files are rejected before entering the queue
- **THEN** each rejected file is identified to the operator
- **AND** the reason for rejection is stated
- **AND** a bare count with no per-file identification is not the only feedback

#### Scenario: Pause and resume return an item to the queue

- **WHEN** an operator pauses an in-flight item and later resumes it
- **THEN** the item's transferred-byte count continues from the last byte the server acknowledged
- **AND** the count does not return to zero, because bytes the server acknowledged are retained
- **AND** the item re-enters the queue exactly once
- **AND** the item is not enqueued twice as a result of the resume action

#### Scenario: Cancelling removes the item from the queue

- **WHEN** an operator cancels an item
- **THEN** the item is removed from the queue
- **AND** its in-flight request is aborted
- **AND** its slot is released so a queued item may occupy it
- **AND** any partial data the server stored for it is discarded

#### Scenario: Clearing completed rows is distinct from cancelling

- **WHEN** an operator clears completed rows
- **THEN** only rows in the completed state are removed
- **AND** no in-flight or queued row is affected
- **AND** no summary tile derived from completed work changes as a result

## REMOVED Requirements

### Requirement: Retrying Is Idempotent And Resets Progress

**Reason**: Transfers now resume: the server holds acknowledged bytes, so a retry that resets progress no longer describes the system.

**Migration**: The retry contract is replaced by "Retrying Is Idempotent And Continues From The Last Acknowledged Byte" in the ADDED section below.

## ADDED Requirements

### Requirement: Retrying Is Idempotent And Continues From The Last Acknowledged Byte

Retrying a failed item SHALL restore it to a queued state, continue the transfer from the last byte the server acknowledged, and SHALL NOT enqueue a duplicate.

#### Scenario: Retry continues from the acknowledged offset

- **WHEN** a failed item is retried
- **THEN** its transfer continues from the last byte the server acknowledged
- **AND** bytes the server already stores for it are neither re-sent from zero nor discarded
- **AND** its recorded failure reason is cleared

#### Scenario: Retry enqueues exactly one copy

- **WHEN** a failed item is retried
- **THEN** the queue contains exactly one entry for that item
- **AND** the item is transferred once

#### Scenario: Bulk retry leaves non-failed items untouched

- **WHEN** an operator retries all failed items
- **THEN** only items in the failed state are re-queued
- **AND** completed, queued, paused, and in-flight items are unchanged
