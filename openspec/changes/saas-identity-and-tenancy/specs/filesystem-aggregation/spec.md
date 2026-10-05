# Spec Delta

## Purpose

Extends bounded tree aggregation so that its scope is the authenticated tenant's subtree rather than
the whole storage root, and so that a platform-wide view aggregates tenant roots explicitly instead
of descending into each one and reporting its bytes again.

## MODIFIED Requirements

### Requirement: File And Folder Counting

Aggregation SHALL count regular files and directories reachable from the scope it is given, by
descending through directories. Its default scope SHALL be the current tenant's root, and a
platform-wide scope SHALL count each tenant root as one directory and SHALL NOT descend into it.

#### Scenario: Default aggregation counts the caller's tenant

- **GIVEN** an authenticated caller established in tenant A
- **WHEN** aggregation runs for that caller
- **THEN** it descends tenant A's subtree only
- **AND** no path belonging to another tenant is read

#### Scenario: A platform view counts tenant roots without descending

- **GIVEN** two tenants, each holding files
- **WHEN** aggregation runs with a platform scope
- **THEN** each tenant root is counted as a directory
- **AND** the files inside the tenants are not counted by that platform-wide pass

#### Scenario: A tenant's own byte total remains available

- **GIVEN** a platform view reports per-tenant directory counts but no tenant's inner bytes
- **WHEN** a caller within one tenant requests its own aggregation
- **THEN** that tenant's recursive byte total is reported


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
## ADDED Requirements

### Requirement: Aggregation Is Bounded Per Tenant

The traversal budget SHALL apply to each tenant's aggregation independently, so that one large
tenant cannot consume another's budget or cause another tenant's total to be reported as truncated.

#### Scenario: Budgets do not cross tenants

- **GIVEN** tenant A's subtree exceeds the entry budget and tenant B's does not
- **WHEN** each tenant's aggregation runs
- **THEN** tenant A's result declares truncation
- **AND** tenant B's result declares completion

#### Scenario: A truncated tenant total is declared, not presented as complete

- **WHEN** a tenant's traversal reaches its budget
- **THEN** the result carries an explicit truncation declaration
- **AND** the byte total is not presented as the tenant's true total

#### Scenario: The traversal never leaves the tenant root

- **WHEN** aggregation runs for a tenant
- **THEN** no path outside that tenant's root is read
- **AND** a symbolic link pointing outside the tenant root is skipped rather than followed

### Requirement: Aggregation Does Not Straddle A Tenant Boundary

Aggregation SHALL NOT follow a symbolic link, junction or bind mount from one tenant's directory
into another tenant's directory, because the link's target is outside the aggregating tenant's
authorized boundary.

#### Scenario: A link from one tenant into another is skipped

- **GIVEN** a symbolic link inside tenant A's directory pointing into tenant B's directory
- **WHEN** tenant A's aggregation runs
- **THEN** the link is skipped and counted as a skipped link
- **AND** no path inside tenant B is read

#### Scenario: The skipped link does not inflate the tenant's totals

- **WHEN** a link into another tenant is skipped during aggregation
- **THEN** the tenant's file count and byte total are unaffected by the link's target