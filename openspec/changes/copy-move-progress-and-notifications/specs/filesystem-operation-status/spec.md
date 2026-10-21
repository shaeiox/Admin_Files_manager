# Spec Delta

## Purpose

Defines how a long-running bulk filesystem operation — Copy or Move — reports its
identity, lifecycle, real progress, and terminal outcome, so a client can always tell
what is happening, which item is in flight, and what actually resulted, without any
figure being inferred that the system did not measure.

## ADDED Requirements

### Requirement: Operation Initiation Returns An Identity Immediately

When a client initiates a bulk Copy or Move, the system SHALL accept the request and
return an operation identifier without waiting for the operation to finish, so the
client can begin reporting state immediately.

#### Scenario: Initiation returns before the work completes

- **WHEN** a client initiates a bulk copy of many large files
- **THEN** the system responds with an operation identifier while the copy is still running
- **AND** no completion payload is required to obtain that identifier

#### Scenario: A rejected request has no operation

- **WHEN** a client initiates a copy with an empty path list, more than 500 paths, or an invalid destination
- **THEN** the system rejects the request with the existing client error
- **AND** no operation is created and no operation identifier is issued

### Requirement: Operation Progress Reports Only Measured Work

An operation's progress SHALL be derived solely from work the system has actually
completed. A quantity that has not been measured SHALL be reported as explicitly
unavailable rather than as zero, and the system SHALL NOT advance a completion
percentage on a timer or an estimate.

#### Scenario: An unmeasured byte total is unavailable, not zero

- **WHEN** an operation's total size cannot be determined before work begins
- **THEN** the system reports the byte fields as unavailable with an explicit availability flag
- **AND** no byte fraction is presented to the client

#### Scenario: Progress does not move on its own

- **WHEN** an operation has performed no new work
- **THEN** the reported progress values are identical to those previously reported for that operation

#### Scenario: A failed item does not inflate completion

- **WHEN** some items in an operation have failed
- **THEN** a failed item contributes to neither the completed count nor the total used for any percentage
- **AND** its count is reported separately so that a bar stopping short of completion is explained

### Requirement: Copy Reports Determinate Byte Progress

Copy SHALL report the name of the file currently being written, a count of completed
items against the total, and bytes transferred against total bytes, so a client can
render a determinate progress bar.

#### Scenario: The in-flight filename is reported

- **WHEN** a copy is writing a file inside a copied folder
- **THEN** the operation reports the name of that file as the item currently in progress

#### Scenario: Bytes accumulate as files complete

- **WHEN** a copy has finished writing part of its work
- **THEN** the reported transferred byte count equals the sum of the sizes of the files fully written

#### Scenario: Completion reaches exactly one hundred percent

- **WHEN** a copy has finished every item successfully
- **THEN** the reported percentage is 100 and the transferred bytes equal the total bytes

### Requirement: Move Reports No Fabricated Percentage

Move SHALL NOT report a determinate completion percentage or intra-item byte progress,
because relocating an item is a single atomic filesystem action with no intermediate
state to observe. Move SHALL report per-item completion and identify the item in
flight, and its progress indicator SHALL be indeterminate.

#### Scenario: No percentage is offered for a move

- **WHEN** a move operation is running
- **THEN** the operation exposes no determinate percentage for the operation as a whole

#### Scenario: Per-item completion is still reported

- **WHEN** some items in a move have been relocated and others have not
- **THEN** the operation reports how many items are done against the total

### Requirement: The Item In Flight Is Identified

An operation that is actively working SHALL expose which item it is currently
processing, and that item SHALL correspond to work actually underway rather than to a
client-side guess about ordering.

#### Scenario: The reported item belongs to the accepted request

- **WHEN** an operation reports an item in progress
- **THEN** that item is one of the paths the client submitted

#### Scenario: Completed operations report no item in flight

- **WHEN** an operation has reached a terminal state
- **THEN** it reports no item in progress

### Requirement: Every Operation Reaches A Terminal State

Every accepted operation SHALL reach exactly one terminal state — completed, partially
completed, failed, or cancelled — and SHALL NOT remain in a non-terminal state
indefinitely. A terminal state SHALL be final and SHALL NOT later change.

#### Scenario: A total failure terminates the operation

- **WHEN** every item in an operation fails
- **THEN** the operation reaches the failed state
- **AND** it is not reported as completed

#### Scenario: A terminal state is stable

- **WHEN** an operation has reported a terminal state and is read again
- **THEN** the reported state is the same terminal state

#### Scenario: A partial result is a terminal state

- **WHEN** some items succeed and some fail within one operation
- **THEN** the operation reaches a partially-completed state carrying both the successes and the failures

### Requirement: Cancellation Is Explicitly Reflected

A client that cancels an in-flight operation SHALL be able to distinguish cancellation
from completion and from failure, and the operation SHALL report the work that had
already finished before the cancellation took effect.

#### Scenario: A cancelled operation is not reported as successful

- **WHEN** a client cancels an operation that had not finished
- **THEN** the operation reaches the cancelled state
- **AND** the completed items are reported as completed, not as a fully successful outcome

#### Scenario: Cancelling an already-terminal operation is refused

- **WHEN** a client attempts to cancel an operation that has already reached a terminal state
- **THEN** the system refuses the cancellation
- **AND** the reported terminal state is unchanged

### Requirement: Failure Detail Survives To The Terminal State

The system SHALL preserve, per failing item, the reason it failed, and SHALL make that
detail available in the terminal state, so a client can report which items failed and
why rather than only that something failed.

#### Scenario: Each failure carries its own reason

- **WHEN** items in an operation fail for different reasons
- **THEN** the terminal state carries a separate reason for each failing item

#### Scenario: The first failure reason survives a total failure

- **WHEN** every item in an operation fails
- **THEN** the reported failure carries the reason of the first failure
- **AND** the remaining failures remain available

#### Scenario: Recognised failures remain distinguishable

- **WHEN** an item fails because of a name collision, a missing source, an invalid
  destination, or insufficient permission
- **THEN** the terminal state distinguishes those outcomes from one another

### Requirement: Operation Status Is Readable Only By An Authorised Session

Reading an operation's status SHALL require the same authentication as initiating the
operation, and an operation SHALL NOT be readable by a session that did not create it.

#### Scenario: An unauthenticated read is refused

- **WHEN** a client without a valid session reads an operation's status
- **THEN** the system refuses the read

#### Scenario: Another session's operation is not disclosed

- **WHEN** an authenticated session reads an operation created by a different session
- **THEN** the system refuses the read and discloses nothing about that operation

### Requirement: Retained Operations Do Not Accumulate Without Bound

The system SHALL bound how many terminal operations it retains, and SHALL stop serving
a status read for an operation it no longer retains, so a long-running instance cannot
grow without limit.

#### Scenario: An expired operation is no longer readable

- **WHEN** a client reads the status of an operation the system no longer retains
- **THEN** the system reports that the operation is unknown
- **AND** it does not report a status

#### Scenario: Retention is bounded

- **WHEN** many operations reach terminal states
- **THEN** the number of operations the system retains stays within a fixed bound

### Requirement: The Progress Surface Is Only Present While An Operation Is Running

The progress surface SHALL be absent whenever no operation is running, SHALL appear
when an operation is accepted, and SHALL be removed a short time after that operation
reaches a terminal state. A styled surface that overrides the hidden attribute would
leave the surface permanently visible, so its absence MUST hold in the rendered
stylesheet and not only in the markup.

#### Scenario: The surface is absent before any operation starts

- **WHEN** the page has no operation in flight
- **THEN** no progress surface is rendered
- **AND** its hidden state is enforced by the stylesheet, not by the markup alone

#### Scenario: The surface appears when an operation is accepted

- **WHEN** an operation is accepted and begins running
- **THEN** the progress surface becomes visible

#### Scenario: The surface clears shortly after completion

- **WHEN** an operation reaches a terminal state
- **THEN** its outcome remains visible for a short period
- **AND** the surface is removed once that period elapses

#### Scenario: The surface is absent again once it has cleared

- **WHEN** the surface has been removed after a completed operation
- **THEN** the page shows no progress surface until another operation is accepted

### Requirement: Copy And Move Preserve Their Existing Semantics

Introducing operation tracking and progress reporting SHALL NOT change what Copy and Move
do. Path validation, destination checks, name-collision refusal, permission handling,
refusal to operate through a link that escapes the storage root, and the partial-failure
contract in which a success response may still carry per-item failures SHALL all behave
exactly as they did before.

#### Scenario: A colliding name is still refused

- **WHEN** an item is copied or moved to a destination that already holds an item of the same name
- **THEN** that item fails with the name-collision outcome
- **AND** the other items proceed

#### Scenario: A success response may still carry per-item failures

- **WHEN** an operation completes with some items failed and some succeeded
- **THEN** the response reports success at the operation level and carries the per-item failures in its data

#### Scenario: An escaping link still writes nothing

- **WHEN** a copy or move is attempted through a link that resolves outside the storage root
- **THEN** the operation refuses that item and writes nothing outside the storage root

#### Scenario: Permissions are still enforced

- **WHEN** an item cannot be read or written due to filesystem permissions
- **THEN** the operation fails that item with the permission outcome

### Requirement: Progress Reporting Does Not Distort The Operation

The system SHALL NOT let progress reporting change the outcome of an operation: the
files produced, the metadata recorded, the access policies updated, and the errors
surfaced SHALL be identical whether or not progress was observed.

#### Scenario: Metadata follows a completed copy

- **WHEN** a copy completes with progress observed
- **THEN** the same activity record is written as when progress is not observed

#### Scenario: Metadata follows a completed move

- **WHEN** a move completes with progress observed
- **THEN** the same metadata migration and access-policy update occur as when progress is not observed