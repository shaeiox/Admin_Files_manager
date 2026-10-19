# Upload Resumption

## Purpose

Defines the observable contract of resumable uploads: how an interrupted transfer is identified and continued, where transfer progress is measured, how partial data is bounded, stored, completed, abandoned, and expired, and how the protocol inherits the existing upload governance, authentication, and rate limiting.

## ADDED Requirements

### Requirement: Interrupted Transfers Resume From The Byte The Server Holds

An interrupted transfer SHALL be continuable without re-sending bytes the server already holds, across a failed request, a paused queue, a page reload, and a server restart.

#### Scenario: A failed request is retried from the acknowledged byte

- **WHEN** an append fails and the operator retries the item
- **THEN** the transfer continues from the last byte the server acknowledged
- **AND** the bytes the server already holds are neither re-sent from zero nor discarded

#### Scenario: Re-selecting the file after a reload continues the transfer

- **WHEN** the page is reloaded, its queue is lost, and the operator re-selects the same file for the same destination
- **THEN** the transfer continues from the last byte the server acknowledged
- **AND** the item reports its acknowledged progress rather than zero

#### Scenario: A server restart does not discard acknowledged bytes

- **WHEN** the server restarts while a transfer is incomplete and that transfer is resumed afterwards
- **THEN** it continues from the bytes held before the restart

#### Scenario: A different file never inherits another transfer's bytes

- **WHEN** a file whose destination, name, size, and last-modified time do not match an existing session is offered
- **THEN** a new session is started for it
- **AND** the existing session's stored bytes are left untouched

### Requirement: The Server Is The Source Of Truth For Transfer Progress

A session's resume offset SHALL be the size of the bytes the server actually holds, SHALL be reported by a status read, and SHALL never be advanced by a client's claim about its own progress.

#### Scenario: A status read reports the stored size

- **WHEN** the status of a session is requested
- **THEN** the reported transferred-bytes value equals the size of the data the server stores for that session

#### Scenario: An append at a stale offset is refused without effect

- **WHEN** an append arrives at an offset other than the current stored size
- **THEN** it is refused and none of its bytes are stored
- **AND** the session's stored data and state are unchanged
- **AND** a resuming client can continue from the server's current offset

### Requirement: Unacknowledged Bytes Are Never Reported As Stored

The Upload page SHALL NOT leave an item reporting more progress than the server acknowledged storing.

#### Scenario: An unacknowledged append rolls progress back

- **WHEN** an append fails or its response is lost
- **THEN** the item's reported progress returns to the server's last acknowledged offset
- **AND** the item does not remain marked as having transferred unacknowledged bytes

#### Scenario: A retry continues from acknowledged progress

- **WHEN** a failed item is retried
- **THEN** its displayed progress continues from the server's last acknowledged offset

### Requirement: Chunks Are Appended In Order Within Bounds

An accepted append SHALL store at most a bounded chunk of bytes at the session's current end, and concurrent appends to one session SHALL NOT interleave, duplicate, or reorder stored data.

#### Scenario: A chunk beyond the server's bound is refused

- **WHEN** an append body exceeds the server's chunk-size bound
- **THEN** it is refused and none of its bytes are stored
- **AND** the session remains resumable at its prior offset

#### Scenario: An append beyond the declared size is refused

- **WHEN** an append would carry the stored total past the session's declared size
- **THEN** it is refused and none of its bytes are stored
- **AND** the session remains resumable at its prior offset

#### Scenario: Concurrent appends cannot interleave

- **WHEN** two appends for one session are processed concurrently
- **THEN** the stored data remains an exact prefix of the file, with no interleaving, duplication, or reordering
- **AND** an append that no longer matches the stored size is refused without effect

### Requirement: Completion Is Atomic, Complete-Only, And Idempotent

A session SHALL create its destination file only when every declared byte is stored, SHALL create it exactly once, and SHALL answer a repeated completion of the same session with the same success.

#### Scenario: Completion before all bytes are stored is refused

- **WHEN** completion is requested while fewer bytes than declared are stored
- **THEN** it is refused and the session remains resumable

#### Scenario: Nothing partial is visible before completion

- **WHEN** the destination is listed or browsed while a session is incomplete
- **THEN** neither the target name nor any partial artefact under a visible name appears

#### Scenario: A repeated completion is idempotent

- **WHEN** completion is requested again for a session that already completed
- **THEN** the result reports the same success
- **AND** the destination file is not modified a second time

#### Scenario: A destination conflict leaves the session resumable

- **WHEN** completion finds an existing file at the target and overwriting was not authorized
- **THEN** completion is refused and the session is not discarded

### Requirement: Abandonment Discards The Session Without A Trace

Aborting a session SHALL remove its stored bytes and its session record, leaving no data and no further resumability.

#### Scenario: An aborted session leaves nothing behind

- **WHEN** a session is aborted
- **THEN** its stored bytes are removed from the filesystem
- **AND** no file of the target name exists in the destination
- **AND** subsequent reads, appends, and completions of that session are refused as unknown

### Requirement: Expired Sessions Are Swept And Start Fresh

An open session SHALL expire after a bounded period without activity; an expired session's stored bytes SHALL be removed, and its transfer SHALL start fresh if resumed later.

#### Scenario: An expired session is no longer resumable

- **WHEN** a session has been inactive beyond its expiry window and its file is offered again
- **THEN** a fresh session starts from zero
- **AND** the expired session's stored bytes are removed

#### Scenario: Expiry is enforced without operator action

- **WHEN** the server starts or a session is created
- **THEN** expired sessions and their stored bytes are removed without operator action

### Requirement: Session Creation Is Governed Like An Upload

Initiating a session SHALL enforce the same declared-size ceiling, free-space requirement, and destination validation as a single-request upload, refusing before any byte is stored.

#### Scenario: A declared size beyond the ceiling is refused before transfer

- **WHEN** a session is initiated for a size beyond the configured maximum
- **THEN** it is refused and no session record and no staged bytes are created

#### Scenario: Insufficient free space is refused before transfer

- **WHEN** the volume holding the destination cannot be shown to hold the declared size
- **THEN** the session is refused before any byte is stored

#### Scenario: An invalid destination is refused

- **WHEN** the destination is not a valid, existing directory under the platform's rules
- **THEN** the session is refused

#### Scenario: An unauthorized overwrite is refused before transfer

- **WHEN** a session is initiated for a target that already exists and overwriting is not authorized
- **THEN** it is refused before any byte is stored

### Requirement: Every Session Operation Is Authenticated And CSRF-Protected

Every session operation SHALL require the same authenticated session and CSRF header as the existing mutating filesystem routes, and an unauthorized request SHALL be refused before any session or file state changes.

#### Scenario: An unauthenticated request is refused without effect

- **WHEN** a session operation is attempted without valid authentication
- **THEN** it is refused and no session, stored byte, or destination file changes

#### Scenario: A mutating request without the CSRF header is refused

- **WHEN** an authenticated session mutation arrives without the CSRF header
- **THEN** it is refused

### Requirement: Chunk Appends Have Their Own Rate-Limit Allowance

Appends SHALL be limited by a dedicated allowance, separate from the general write allowance, sized so a transfer at the declared ceiling can complete without exhausting it, while every other mutating route keeps the general allowance.

#### Scenario: A large transfer is not refused by the general write allowance

- **WHEN** a transfer sends more appends within a minute than the general write allowance would permit
- **THEN** its appends continue while they stay within the append allowance
- **AND** the same client's other mutating requests remain governed by the general allowance

#### Scenario: Exceeding the append allowance is refused

- **WHEN** a client sends more appends than the append allowance permits
- **THEN** further appends are refused with the rate-limit response
- **AND** the session and its stored bytes are unaffected
