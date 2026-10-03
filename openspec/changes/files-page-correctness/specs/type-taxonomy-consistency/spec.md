# Type Taxonomy Consistency

## Purpose

Defines the single classification of a file by extension, requires the server and the client to agree on it exactly, and requires the count of unclassified files to be reported rather than discarded. This capability exists because three hand-maintained extension lists had diverged: the client rendered a typed badge for 43 extensions while the server filter recognised 28, so ten of thirteen files in a sample directory belonged to no filter chip at all.

## ADDED Requirements

### Requirement: One Server-Side Classifier

File classification SHALL be performed by the shared classifier module. No request handler SHALL contain an inline extension list.

#### Scenario: The listing uses the shared classifier

- **WHEN** a directory listing is produced
- **THEN** each entry's type is determined by the shared classifier
- **AND** no inline extension array appears in the listing handler

#### Scenario: A new extension is added in one place

- **GIVEN** an operator adds an extension to the shared classifier
- **WHEN** listings and storage aggregates are produced
- **THEN** both classify that extension identically
- **AND** no second edit is required

#### Scenario: Folders are classified as folders

- **WHEN** a directory entry is classified
- **THEN** it is reported as a folder
- **AND** the folder classification is decided by the entry's own kind, not by its name's extension

### Requirement: Server And Client Agree Exactly

The set of extensions the client renders with a typed badge SHALL be identical to the set the server classifies into that type. No extension may be badged but unfilterable.

#### Scenario: Every badged extension is reachable by its own chip

- **GIVEN** a file whose extension the client badges as a given type
- **WHEN** the operator selects that type's filter chip
- **THEN** the file is present in the filtered result
- **AND** it is not filtered out by the chip that describes it

#### Scenario: The chip count matches what the chip shows

- **WHEN** a filter chip is rendered with a count
- **THEN** that count equals the number of items the chip's filter returns
- **AND** the count is not computed from a different classification source than the filter

#### Scenario: Server and client sets are identical

- **WHEN** the extension sets declared by the server classifier and the client type table are compared
- **THEN** they are equal as sets, with no member present in one and absent from the other

#### Scenario: Reconciliation direction is upward

- **GIVEN** the server recognised a strict subset of the client's extensions
- **WHEN** the two are reconciled
- **THEN** the server set grows to cover the client set
- **AND** no correct type badge is removed from any other page in order to shrink the server set

### Requirement: Unclassified Files Are Counted And Surfaced

Files whose extension is in no category SHALL be counted in an explicit unclassified bucket, and that bucket SHALL be represented in the filter UI.

#### Scenario: The unclassified bucket reconciles the totals

- **WHEN** a listing's counts are produced
- **THEN** the total equals the sum of every per-type count plus the unclassified count
- **AND** the reported counts include an entry for the unclassified category

#### Scenario: The unclassified chip appears only when non-zero

- **WHEN** the unclassified count is zero
- **THEN** no chip is rendered for it
- **AND** when the unclassified count is greater than zero, a chip is rendered showing it

#### Scenario: An extension-free file is classified as unclassified

- **GIVEN** a regular file with no extension in its name
- **WHEN** it is listed
- **THEN** it is counted in the unclassified bucket
- **AND** it is reachable by that bucket's filter

#### Scenario: A leading-dot name is not treated as an extension

- **GIVEN** a regular file whose name begins with a dot
- **WHEN** it is classified by the shared classifier directly
- **THEN** it is unclassified
- **AND** dot-prefixed entries remain excluded from listings by the separate, pre-existing dotfile exclusion

### Requirement: Classification Is Counted, Not Inferred From Display

The type shown for an entry SHALL be the type used to filter and count it. A display-only classification is prohibited.

#### Scenario: Display and filter read the same value

- **WHEN** an entry's type chip is rendered
- **THEN** the type is the one the filter compares against
- **AND** the two cannot diverge

#### Scenario: The internal classification key is not leaked inconsistently

- **GIVEN** a listing response carries an internal classification field for filtering
- **WHEN** the response is serialised
- **THEN** the internal field is either consistently present or consistently absent
- **AND** its presence is documented rather than incidental

### Requirement: Aggregate And Listing Breakdowns Keep Their Own Contracts

The storage aggregate's per-type breakdown and the listing's per-type counts SHALL each keep their documented shape. Neither SHALL be rewritten to match the other.

#### Scenario: Folders are absent from the storage breakdown

- **WHEN** the storage aggregate's per-type breakdown is produced
- **THEN** it contains no folder category, because a directory has no file bytes to attribute
- **AND** this is asserted as its own contract, independently of the listing counts

#### Scenario: Folders are present in the listing counts

- **WHEN** the listing's per-type counts are produced
- **THEN** they include a folder count, because the filter chip row presents folders as a browsable type

#### Scenario: The two breakdowns are not cross-asserted

- **WHEN** tests pin the storage breakdown shape
- **THEN** they do not assert equality with the listing counts shape
- **AND** each is pinned against its own documented contract

## Regression Requirements

- A test SHALL enumerate every extension declared by the client type table and assert the server classifier maps each to the same category. This test is the guard that `fileTypes.js` states is currently absent, and it must fail if either side is edited without the other.
- A test SHALL assert `counts.all` equals the sum of all per-type counts including the unclassified bucket.
- A test SHALL assert a representative extension from each category is returned by that category's filter.
- A test SHALL assert an unrecognised extension is counted in the unclassified bucket and returned by its filter.
- A test SHALL assert the storage breakdown omits folders and the listing counts include them, as two separate assertions.
- The escalation recorded in `src/utils/fileTypes.js` and in `dashboard-real-data` `tasks.md:3.8` SHALL be removed once this capability lands, since it will no longer be accurate.
- `docs/CONTRACTS.md` SHALL record the reconciled extension set and the unclassified bucket as part of the `/fs/list` contract.