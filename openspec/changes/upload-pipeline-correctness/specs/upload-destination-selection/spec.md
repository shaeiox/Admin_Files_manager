# Upload Destination Selection

## Purpose

Defines how the operator chooses where uploads land, how a chosen destination is validated before bytes are sent, how a missing destination is created, and how the current destination is displayed truthfully.

## ADDED Requirements

### Requirement: The Destination Is Chosen From Real Folders

The destination SHALL be selectable from folders that actually exist in the managed tree, rather than only by typing an unchecked string.

#### Scenario: Existing folders are offered

- **WHEN** an operator opens the destination control
- **THEN** folders that exist in the managed tree are offered as choices
- **AND** the current destination is identifiable among them

#### Scenario: The offered depth is stated, not overstated

- **WHEN** the folder list is bounded to a limited depth
- **THEN** the bound is not presented as the complete set of folders
- **AND** an operator who needs a deeper folder has a stated way to reach it

#### Scenario: A typed path remains possible

- **WHEN** the operator types a destination path instead of choosing a listed folder
- **THEN** the path is accepted as input
- **AND** it is validated before any upload begins

#### Scenario: Choosing a destination requires no free-text guesswork

- **WHEN** an operator is choosing a destination
- **THEN** they are not required to know or spell an exact path to select a folder they can already see

### Requirement: The Destination Is Validated Before Bytes Are Sent

The page SHALL establish that the destination is usable before it begins transferring, so a bad destination does not produce one failure per queued file.

#### Scenario: An unusable destination is reported once

- **WHEN** the destination does not exist, is not a directory, or is not writable
- **THEN** the problem is reported before any transfer starts
- **AND** the queue does not accumulate one identical failure per file

#### Scenario: Validation failure is specific

- **WHEN** the destination is rejected
- **THEN** the message distinguishes a destination that does not exist from one that cannot be written to

#### Scenario: A destination that becomes invalid later is reported per item

- **WHEN** the destination was valid at queue time but is no longer usable when an item reaches the front of the queue
- **THEN** that item fails with the destination reason
- **AND** the remaining items are not each retried blindly against a destination already known to be unusable

### Requirement: A Missing Destination Can Be Created

The page SHALL offer to create the chosen destination when it does not exist, using the existing folder-creation capability, and SHALL NOT silently create directories as a side effect of an upload.

#### Scenario: Creation is offered, not assumed

- **WHEN** the chosen destination does not exist
- **THEN** the operator is offered to create it
- **AND** an upload is not silently redirected elsewhere

#### Scenario: A created destination becomes the current destination

- **WHEN** the operator elects to create the destination and creation succeeds
- **THEN** the destination becomes the current one
- **AND** the displayed destination reflects it

#### Scenario: Creation failure is reported and the destination is unchanged

- **WHEN** creation fails
- **THEN** the failure is reported
- **AND** the current destination is left as it was

#### Scenario: Upload alone never creates directories

- **WHEN** an upload is performed with a destination that does not exist
- **THEN** no directory is created as a side effect
- **AND** the request fails with the destination reason

### Requirement: The Displayed Destination Is The Real One

The destination shown in the interface SHALL be the destination that will actually be used, from the first render onward.

#### Scenario: No placeholder path is shown before the first render

- **WHEN** the page renders
- **THEN** the displayed destination is the real current destination
- **AND** no example, sample, or illustrative path is displayed

#### Scenario: A rejected destination is not displayed as current

- **WHEN** a destination is entered and rejected
- **THEN** the previously current destination remains displayed
- **AND** the rejected value is not shown as though it were in effect

#### Scenario: The displayed destination is escaped

- **WHEN** the destination is rendered
- **THEN** it is rendered as text

### Requirement: Destination State Survives Interaction With The Queue

The destination in effect SHALL be the one recorded for every item at the moment that item is queued.

#### Scenario: A destination change does not retroactively move queued items

- **WHEN** items are queued against one destination and the destination is then changed
- **THEN** items already queued continue to target the destination they were queued against
- **AND** items queued after the change target the new destination

#### Scenario: The operator can see which destination is in effect

- **WHEN** the queue contains items
- **THEN** the destination those items target is discoverable without inferring it

### Requirement: Destination Paths Speak Only The Client Path Form

Any destination displayed or transmitted SHALL be a client path rooted at `/`. No absolute operating-system path SHALL be accepted, displayed, or returned.

#### Scenario: A client path is displayed

- **WHEN** the destination is shown
- **THEN** it is a POSIX-style path rooted at `/`
- **AND** it contains no drive letter and no backslash-separated path

#### Scenario: An absolute path is rejected

- **WHEN** a destination is submitted as an absolute operating-system path
- **THEN** it is rejected
- **AND** the rejection does not echo the submitted value back into the page markup
