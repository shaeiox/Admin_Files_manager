# filesystem-aggregation Specification

## Purpose
Defines how the Dashboard derives a truthful, bounded summary of the managed storage tree: what counts as a file and a folder, how total bytes are accumulated without platform-dependent distortion, how inaccessible subtrees are handled, and what budgets guarantee the walk terminates.

## Requirements

### Requirement: File And Folder Counting

Aggregation SHALL count regular files and directories reachable from the storage root by descending through directories.

#### Scenario: Regular files are counted

- **WHEN** the storage root contains regular files
- **THEN** each is counted once in the reported file total

#### Scenario: Directories are counted excluding the root

- **WHEN** the storage root contains subdirectories
- **THEN** each subdirectory is counted once in the reported folder total
- **AND** the storage root itself is not counted as a folder

#### Scenario: Dot-prefixed entries are excluded

- **GIVEN** the storage root contains dot-prefixed files or dot-prefixed directories
- **WHEN** aggregation runs
- **THEN** those entries are excluded from both counts and from the byte total
- **AND** the behaviour matches the exclusion already applied when listing a single directory

#### Scenario: Empty tree reports zeros

- **WHEN** the storage root contains no countable entries
- **THEN** file count, folder count, and total tree bytes are all zero
- **AND** the file-type breakdown is an empty array
- **AND** the endpoint responds successfully rather than failing

#### Scenario: Deeply nested tree is counted at every level

- **GIVEN** a tree nested several directories deep
- **WHEN** aggregation runs
- **THEN** files and folders at every level are counted

### Requirement: Byte Totals Exclude Directory Entry Size

The accumulated byte total SHALL sum only regular-file sizes.

#### Scenario: Directory entry sizes are not accumulated

- **GIVEN** the storage root contains directories
- **WHEN** the byte total is computed
- **THEN** the reported size of each directory entry is not added to the total
- **AND** the total is therefore identical for two trees with identical file content regardless of how many directories contain that content

#### Scenario: File sizes are real sizes

- **WHEN** a file's size is accumulated
- **THEN** the size reported for that file entry is used
- **AND** the size is read without following any link

### Requirement: Inaccessible Subtrees Degrade Gracefully

An unreadable directory SHALL NOT cause the whole aggregation to fail.

#### Scenario: Unreadable subdirectory is skipped

- **GIVEN** a directory within the storage root that cannot be read due to permissions
- **WHEN** aggregation runs
- **THEN** that subtree is skipped
- **AND** a diagnostic is recorded
- **AND** sibling directories are still counted
- **AND** the endpoint responds successfully

#### Scenario: Storage root itself unreadable

- **GIVEN** the storage root cannot be read at all
- **WHEN** the Dashboard is requested
- **THEN** counts and byte totals are zero
- **AND** the file-type breakdown is empty
- **AND** the endpoint responds successfully

### Requirement: Bounded Traversal

Aggregation SHALL terminate within a bounded traversal budget, and SHALL report when the budget is reached.

#### Scenario: Entry budget is enforced

- **GIVEN** a tree large enough to exceed the configured entry budget
- **WHEN** aggregation runs
- **THEN** traversal stops once the budget is reached
- **AND** it terminates without exhausting memory or hanging the request

#### Scenario: Time budget is enforced

- **GIVEN** a tree slow enough to exceed the configured time budget
- **WHEN** aggregation runs
- **THEN** traversal stops once the budget is reached
- **AND** the endpoint responds successfully with the partial result

#### Scenario: Budget exhaustion is deterministic

- **WHEN** aggregation runs twice against the same tree
- **THEN** both runs terminate and report comparable results

#### Scenario: Aggregation is not performed on the polled endpoint

- **WHEN** the Dashboard periodically refreshes runtime health
- **THEN** the periodic refresh does not trigger a full tree aggregation
- **AND** tree aggregation occurs only on an explicit summary request or manual reload

### Requirement: File-Type Breakdown Reuses The Existing Taxonomy

The file-type breakdown SHALL use the classification already applied when listing a single directory.

#### Scenario: Recognised extensions map to their category

- **GIVEN** files with recognised extensions
- **WHEN** the breakdown is produced
- **THEN** each file is attributed to the same category the single-directory listing assigns to it

#### Scenario: Unrecognised extensions fall back

- **GIVEN** a file whose extension is not in the taxonomy
- **WHEN** the breakdown is produced
- **THEN** it is attributed to the fallback category

#### Scenario: Breakdown totals reconcile with the tree total

- **WHEN** the breakdown is produced
- **THEN** the sum of all category values is consistent with the reported tree byte total
