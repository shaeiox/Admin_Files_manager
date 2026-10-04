# Spec Delta

## Purpose

Guarantees that the service's two pieces of durable state — the metadata and settings store under
the repository's data directory, and the operator's file storage root — outlive any individual
release. Exists because both are currently resolved relative to a working directory that changes
with every deployment, and because the store silently reinitialises itself when it cannot find its
file.

## ADDED Requirements

### Requirement: Durable State Lives Outside The Release Directory

The metadata store, the settings store and the operator's file storage root SHALL be located outside
every release directory, so that activating, replacing or deleting a release cannot affect them.

#### Scenario: Replacing a release preserves the store

- **WHEN** one release is replaced by another
- **THEN** the metadata and settings documents are the same documents as before
- **AND** no download count, star or activity entry is lost

#### Scenario: Rolling back preserves the store

- **WHEN** a deployment is rolled back to a previous release
- **THEN** the metadata and settings documents are unchanged by the rollback

#### Scenario: Deleting a release cannot destroy the store

- **WHEN** a release directory is removed as part of retention pruning
- **THEN** the metadata and settings documents remain present and readable

### Requirement: Store Resolution Is Anchored To A Single Declared Location

The location of the metadata and settings stores SHALL derive from one declared base directory, and
that base SHALL be set explicitly by the deployment rather than inherited from wherever a process
happens to have been started.

#### Scenario: Store location does not follow the process working directory incidentally

- **WHEN** the service is started with an explicitly configured base directory
- **THEN** the store is resolved under that base directory
- **AND** changing the process working directory does not relocate the store

#### Scenario: An unset base directory is a configuration error

- **WHEN** no base directory is configured
- **THEN** the condition is reported as a configuration problem
- **AND** the service does not silently fall back to a working-directory-relative store

#### Scenario: Working directory must point at the active release

- **WHEN** the deployment documentation is followed
- **THEN** the service manager is configured with the working directory of the active release
- **AND** the requirement is documented as load-bearing rather than stylistic

### Requirement: Store Reinitialisation Never Masquerades As Success

When the store document is absent or unreadable, the service SHALL distinguish a first-run
initialisation from an inaccessible store, and SHALL NOT present a fresh empty store as though it
were the operator's existing data. A store that is expected to exist but cannot be read SHALL be
reported as a failure.

#### Scenario: First run initialises an empty store

- **WHEN** the store does not exist on a host that has never run the service
- **THEN** an empty store is created
- **AND** this first-run condition is distinguishable in logs from a later outage

#### Scenario: An unexpectedly absent store is not silently accepted

- **WHEN** the store is absent on a host where the deployment expects it to exist
- **THEN** the deployment's pre-activation validation detects the absence
- **AND** the release is not activated as though the condition were normal

#### Scenario: A corrupt store is a failure, not an empty store

- **WHEN** the store document exists but cannot be parsed
- **THEN** the service reports an error
- **AND** it does not continue as though the operator had no metadata

### Requirement: Store Files Are Owned By The Service Identity And Not Committed

The store documents SHALL be writable by the service identity and SHALL be excluded from version
control, including any backup or diagnostic copy of them that a recovery procedure may leave behind.

#### Scenario: The service can write its store

- **WHEN** the service runs under its production identity
- **THEN** it can create and atomically replace both store documents

#### Scenario: A store document left in the repository is a blocker

- **WHEN** the repository contains a tracked store document or a tracked copy of one
- **THEN** the item is recorded as a deployment blocker
- **AND** remediation removes it from version control

#### Scenario: Local storage inside the repository is not committable by accident

- **WHEN** a developer or an operator points the storage root inside the working tree
- **THEN** the version-control ignore rules cover that location
- **AND** a real storage root under the repository cannot be committed unnoticed

### Requirement: Store Recovery Is Possible

Because the store is a single document, a documented procedure SHALL exist to back it up and to
restore it, and the atomic replacement behaviour SHALL be understood by that procedure: a restore
that writes in place risks leaving a partially written document where the service expects a
complete one.

#### Scenario: A backup is a complete document

- **WHEN** the store is backed up
- **THEN** the backup is a single parseable document
- **AND** it is not a concatenation of two documents

#### Scenario: Restore is described in terms the atomic writer supports

- **WHEN** the restore procedure is followed
- **THEN** it does not leave a partially written document in place of a complete one
- **AND** it leaves no stale temporary file that a later write could collide with

### Requirement: Storage Root Contents Are Never Part Of A Release

Files inside the storage root SHALL NOT be copied into, staged in, or version-controlled with a
release. In-progress upload staging files are part of the storage root and are subject to this rule.

#### Scenario: Operator files are not duplicated into the application tree

- **WHEN** a release is produced
- **THEN** no file from the storage root is included in it
- **AND** the release does not depend on storage-root content to function

### Requirement: Production Prerequisites Are Declared To The Service

The service SHALL be able to report, in a machine-readable way, whether the capabilities that
require a readable storage root are actually available, so a deployment can validate readiness
without inferring it from the absence of an error.

#### Scenario: Unreadable storage root is reported as unavailability

- **WHEN** the storage root cannot be read
- **THEN** the capabilities that depend on it report themselves unavailable
- **AND** the reporting follows the project's existing rule that an unmeasurable quantity is
  reported as unavailable rather than as zero