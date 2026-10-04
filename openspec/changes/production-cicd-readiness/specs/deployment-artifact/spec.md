# Spec Delta

## Purpose

Defines what a production release is made of: which files reach a deployment host, which are
excluded, and how the production dependency tree is produced. Exists so that a release is a
reproducible function of one commit, and so that repository-development artifacts and committed
secrets can never ride along into a running host.

## ADDED Requirements

### Requirement: A Release Is Derived From Exactly One Identified Commit

A deployment SHALL be traceable to one commit identifier, and that identifier SHALL be recorded in
the release directory name so the active version is readable from the filesystem alone.

#### Scenario: Active version is identifiable without a network call

- **WHEN** an operator inspects the production host
- **THEN** the currently active release directory name contains the commit identifier it was built from
- **AND** no additional metadata store is required to determine what is running

#### Scenario: Two deploys of the same commit are distinguishable

- **WHEN** the same commit is deployed more than once
- **THEN** each deployment produces a distinct release directory
- **AND** neither silently overwrites the other

### Requirement: No Build Step Is Introduced

The release SHALL consist of the committed source tree, installed verbatim. No transpilation,
compilation, bundling, asset pipeline or code generation SHALL be part of producing a release.

#### Scenario: Release contents are the committed files

- **WHEN** a release is produced from a commit
- **THEN** every application file in it is byte-identical to the committed file
- **AND** no intermediate artifact is required to produce it

#### Scenario: A frontend change requires no pipeline step

- **WHEN** a file under the frontend asset directory changes
- **THEN** the deployment requires no asset build command
- **AND** the file is served as committed

### Requirement: Production Dependencies Are Installed From The Committed Lockfile

The production dependency tree SHALL be installed from the committed lockfile by a deterministic
install, and development dependencies SHALL be excluded from a production installation.

#### Scenario: Install is reproducible from the lockfile

- **WHEN** a release is installed
- **THEN** the installed package versions are exactly those recorded in the committed lockfile
- **AND** resolution does not depend on the current state of a registry's latest-version tags

#### Scenario: Development dependencies are absent at runtime

- **WHEN** a production installation is inspected
- **THEN** no development-only package is present in the installed tree

#### Scenario: An out-of-date lockfile fails the deployment

- **WHEN** the committed manifest and the committed lockfile disagree
- **THEN** the deterministic install fails
- **AND** the deployment does not proceed with a partially resolved tree

### Requirement: Repository Secrets Are Absent From Every Release

No file containing environment secrets SHALL exist in a release. The deployment of an untracked
configuration file SHALL be a hard failure, not a silent inclusion.

#### Scenario: Configuration file is not shipped

- **WHEN** a release is produced
- **THEN** no tracked-or-untracked local configuration file is present in it

#### Scenario: A secret committed to the repository is treated as a blocker

- **WHEN** the repository contains a tracked local configuration file
- **THEN** the item is recorded as a deployment blocker
- **AND** remediation removes it from version control before any deployment proceeds

#### Scenario: Release contents are declared, not accidental

- **WHEN** a release is produced
- **THEN** the set of excluded path patterns is declared explicitly by the release process
- **AND** an undeclared path is never included by default

### Requirement: Development And Tooling Artifacts Are Excluded

Files that exist only to support local development or agent tooling SHALL NOT be present in a
release, including version-control metadata, dependency directories, scratch directories, generated
knowledge graphs, and specification-planning artifacts.

#### Scenario: Development-only trees are absent

- **WHEN** a release is inspected
- **THEN** it contains no version-control metadata directory
- **AND** it contains no installed dependency directory
- **AND** it contains no scratch or temporary working directory

#### Scenario: Planning and tooling artifacts are absent

- **WHEN** a release is inspected
- **THEN** it contains no generated knowledge-graph output
- **AND** it contains no change-planning artifact tree

#### Scenario: Runtime payload is a small, bounded set

- **WHEN** release contents are measured
- **THEN** the shipped runtime payload is a small fraction of the tracked repository
- **AND** the majority of tracked files are development-only

### Requirement: Runtime Payload Completeness Is Verifiable

A release SHALL be verifiable as complete before it is activated, by confirming that the entry
point, the API assembly, the service layer and the frontend assets are all present.

#### Scenario: An incomplete payload is rejected before activation

- **WHEN** a release is missing a required runtime directory or entry point
- **THEN** validation fails
- **AND** the release is never switched to serve traffic

#### Scenario: Runtime-only data is absent from the payload

- **WHEN** a release is produced
- **THEN** it contains no runtime store document, whether or not the repository ignores it