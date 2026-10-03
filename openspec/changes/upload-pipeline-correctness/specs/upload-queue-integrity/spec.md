# Upload Queue Integrity

## Purpose

Defines the observable contract of the upload queue: how an item moves through its lifecycle, how progress, percentage, and remaining time are computed, what the summary tiles measure and how they are labelled, how global progress behaves when items fail, and what the page must not spend rendering effort on.

## ADDED Requirements

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
- **THEN** the item's transferred-byte count returns to zero, because transfer is not chunked and there is no partial resume
- **AND** the item re-enters the queue exactly once
- **AND** the item is not enqueued twice as a result of the resume action

#### Scenario: Cancelling removes the item from the queue

- **WHEN** an operator cancels an item
- **THEN** the item is removed from the queue
- **AND** its in-flight request is aborted
- **AND** its slot is released so a queued item may occupy it

#### Scenario: Clearing completed rows is distinct from cancelling

- **WHEN** an operator clears completed rows
- **THEN** only rows in the completed state are removed
- **AND** no in-flight or queued row is affected
- **AND** no summary tile derived from completed work changes as a result

### Requirement: Progress Is Computed Defensively Against Degenerate Sizes

Percentage and byte-derived progress SHALL be defined for every representable item size, including zero.

#### Scenario: A zero-byte file produces a defined percentage

- **GIVEN** an accepted item whose byte size is zero
- **WHEN** its progress is rendered
- **THEN** the percentage is a finite number
- **AND** neither `NaN` nor `Infinity` appears in the percentage label or in the progress bar width
- **AND** the bar renders at a defined width rather than an invalid one

#### Scenario: Transferred bytes never exceed the item size

- **WHEN** progress is rendered for an item
- **THEN** the displayed percentage never exceeds one hundred
- **AND** never falls below zero

#### Scenario: An aborted transfer does not report more bytes than were sent

- **WHEN** a transfer is aborted after partial progress
- **THEN** the reported transferred-byte count does not exceed the item's declared size

### Requirement: Remaining Time Is Unavailable When Speed Is Unknown

Remaining time SHALL be derived from a measured speed. When no speed has been measured, the quantity is unknown and SHALL be rendered as unavailable rather than as a number.

#### Scenario: Zero measured speed yields an unavailable indicator

- **WHEN** an item is in the uploading state and no speed has been measured
- **THEN** remaining time renders as an unavailable marker
- **AND** it does not render as zero seconds
- **AND** it does not render as any bare number

#### Scenario: A measured speed yields a computed estimate

- **WHEN** an item is uploading and a non-zero speed has been measured
- **THEN** remaining time is computed from the bytes outstanding and the measured speed
- **AND** it is labelled as an estimate rather than as a measurement

#### Scenario: The unavailable marker matches the project's convention

- **WHEN** any quantity on this page is unavailable
- **THEN** it is rendered with the same marker the rest of the application uses for an unavailable value
- **AND** no other glyph, blank string, or zero is substituted

### Requirement: Summary Tiles Measure A Surviving Source

Every summary tile SHALL be derived from a source that does not disappear as a consequence of an ordinary user action, and its label SHALL describe the quantity actually displayed.

#### Scenario: Clearing completed rows does not reset the tiles

- **WHEN** an operator clears completed rows from the queue
- **THEN** the completed-count tile does not decrease
- **AND** the transferred-bytes tile does not decrease

#### Scenario: A tile never claims a time scope that no source provides

- **WHEN** a tile's label contains a time scope such as "today", "this week", or "last 24 hours"
- **THEN** the underlying source is scoped to that period
- **AND** if no such source exists, the label does not claim the scope

#### Scenario: A tile reflects only completed work

- **WHEN** the completed-count and transferred-bytes tiles are computed
- **THEN** both count items in the completed state only
- **AND** partially transferred bytes from failed or cancelled items are excluded

#### Scenario: A counter derived from the live queue is labelled as such

- **WHEN** a tile is derived from the current queue contents
- **THEN** its label states that scope
- **AND** it does not present a session-scoped or global figure as a total

### Requirement: Global Progress Reflects Only Accounted Work

The overall progress bar SHALL be computed from items that are in flight or complete, so that a failure cannot silently strand the bar below completion.

#### Scenario: A failed item does not reduce the completed fraction

- **WHEN** one item fails and others complete
- **THEN** the global percentage is computed from completed and in-flight bytes only
- **AND** the partially transferred bytes of the failed item are excluded from the numerator

#### Scenario: A stranded percentage is explained

- **WHEN** one or more items are in the failed state
- **THEN** the failed count is displayed alongside the global progress
- **AND** the operator can tell why the bar is not at one hundred percent

#### Scenario: An empty queue reports no progress

- **WHEN** the queue contains no items
- **THEN** the global progress region is not displayed

### Requirement: Failure Reasons Are Distinguishable

A failed item SHALL report a failure kind the operator can act on, rather than one undifferentiated message.

#### Scenario: Distinct server outcomes produce distinct failure kinds

- **WHEN** a transfer fails because the name was rejected, because the destination already holds a file and overwriting is disallowed, because the file exceeds the permitted size, or because of a network or server failure
- **THEN** each outcome renders as a distinguishable failure kind
- **AND** the four outcomes do not collapse into one identical string

#### Scenario: The failure kind is not derived from parsing prose

- **WHEN** the page determines a failure kind
- **THEN** it uses a machine-readable signal supplied by the server
- **AND** it does not pattern-match the human-readable error text

#### Scenario: An unrecognised failure is still reported

- **WHEN** a transfer fails with a signal the page does not recognise
- **THEN** the item is marked failed with the server's own message
- **AND** it is not reported as a success and not silently dropped

### Requirement: Retrying Is Idempotent And Resets Progress

Retrying a failed item SHALL restore it to a queued state with no residual progress and SHALL NOT enqueue a duplicate.

#### Scenario: Retry resets transferred bytes

- **WHEN** a failed item is retried
- **THEN** its transferred-byte count returns to zero
- **AND** its recorded failure reason is cleared

#### Scenario: Retry enqueues exactly one copy

- **WHEN** a failed item is retried
- **THEN** the queue contains exactly one entry for that item
- **AND** the item is transferred once

#### Scenario: Bulk retry leaves non-failed items untouched

- **WHEN** an operator retries all failed items
- **THEN** only items in the failed state are re-queued
- **AND** completed, queued, paused, and in-flight items are unchanged

### Requirement: Rendering Cost Does Not Scale With Queue Size Per Update

A change to one queue row SHALL NOT require re-rendering the entire queue, and the per-interval summary update SHALL NOT destroy and recreate its own DOM.

#### Scenario: A single-row update touches only that row

- **WHEN** one item's state changes
- **THEN** only that row's markup is updated
- **AND** the listeners on every other row are not re-registered

#### Scenario: Row actions are dispatched through a single listener

- **WHEN** the queue contains any number of rows
- **THEN** activating a row's control dispatches its action
- **AND** the number of registered listeners does not grow with the number of rows

#### Scenario: The interval update mutates values rather than replacing markup

- **WHEN** the periodic update runs
- **THEN** existing summary elements are updated in place
- **AND** their DOM nodes are not replaced, so focus and hover state survive

#### Scenario: A large queue remains operable

- **WHEN** several hundred items are queued
- **THEN** adding, pausing, cancelling, and clearing remain responsive
- **AND** the page does not freeze

### Requirement: Presets Affect Only What They Advertise

Selecting an upload preset SHALL change the behaviour the preset advertises, and SHALL NOT imply a capability the server does not provide.

#### Scenario: Concurrency selection changes the observable slot count

- **WHEN** an operator selects a preset advertising a parallel-upload count
- **THEN** the number of items transferring at once matches that count

#### Scenario: A preset effect that is not transmitted is not advertised

- **WHEN** a preset describes compression, encryption, deduplication, or any other server-side effect
- **THEN** that effect is transmitted to the server and performed
- **AND** if it cannot be performed, the description is removed from the preset rather than displayed

#### Scenario: The default preset is reflected in the interface

- **WHEN** the page loads
- **THEN** the preset marked active is the preset whose settings are in effect

### Requirement: Option Toggles Reach The Server

Every option the page presents SHALL either alter the request that is sent or be removed from the interface.

#### Scenario: A presented option is transmitted

- **WHEN** an operator toggles an upload option
- **THEN** the new value is included in the request for every subsequent upload
- **AND** the server acts on it

#### Scenario: An option with no server behaviour is removed

- **WHEN** an option has no corresponding server-side behaviour
- **THEN** it is removed from the interface
- **AND** it is not rendered in a state that implies it is doing something

### Requirement: Aborting A Transfer Leaves No Orphan File

An aborted transfer SHALL NOT leave a partial file that the file manager subsequently presents as a complete file.

#### Scenario: An aborted transfer leaves nothing behind

- **WHEN** a transfer is aborted before completion
- **THEN** no file of that name is created in the destination
- **AND** no truncated file of that name is created in the destination

#### Scenario: The destination listing reflects only completed transfers

- **WHEN** the destination is listed after an aborted transfer
- **THEN** the aborted item does not appear
