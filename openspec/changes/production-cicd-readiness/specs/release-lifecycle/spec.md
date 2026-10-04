# Spec Delta

## Purpose

Defines how a built release becomes the running release and how it is taken back when it misbehaves:
immutability of a release once activated, an atomic switch between releases, a single-command
rollback, bounded retention, and validation both before and after the switch.

## ADDED Requirements

### Requirement: An Activated Release Is Immutable

Once a release directory has served traffic, its contents SHALL NOT be modified in place. An update
SHALL be performed by activating a different release directory, never by editing the live one.

#### Scenario: Updates never mutate the live directory

- **WHEN** a new version is deployed over a running release
- **THEN** a distinct release directory is created and activated
- **AND** the previously active directory is left untouched

#### Scenario: The previous release remains runnable

- **WHEN** a new release is activated
- **THEN** the previous release directory still contains a complete, runnable application
- **AND** it can be started without any repair step

### Requirement: Switching Releases Is Atomic

Activating a release SHALL be a single indivisible filesystem operation, so that no observer can see
a moment in which the active release is missing or partially switched.

#### Scenario: No window with a missing active release

- **WHEN** a release is activated
- **THEN** the active-release pointer changes from the old target to the new target in one operation
- **AND** no intermediate state exists in which the pointer is absent

#### Scenario: The service manager always sees a resolvable release

- **WHEN** the service is restarted immediately after a switch
- **THEN** the working directory it is configured with resolves to a complete application

### Requirement: Rollback Is A Single Command

Returning to the previously active release SHALL be possible with one operator action, using only
what is already on the host, and without a rebuild, a re-install or network access.

#### Scenario: Rollback needs no rebuild

- **WHEN** rollback is invoked after a failed deployment
- **THEN** the previous release is activated from its existing directory
- **AND** no source retrieval or dependency installation is performed

#### Scenario: Rollback is automatic on a failed activation

- **WHEN** post-activation validation fails
- **THEN** the deployment mechanism restores the previously active release automatically
- **AND** the failure is reported as a failed deployment

### Requirement: Validation Happens Before And After Activation

A release SHALL be validated before it is activated, and the running service SHALL be validated after
activation. Both validations SHALL be able to fail the deployment.

#### Scenario: Pre-activation validation can stop a release

- **WHEN** pre-activation validation fails
- **THEN** the release is not activated
- **AND** the previously active release continues to serve traffic

#### Scenario: Post-activation validation uses a real endpoint

- **WHEN** a release has been activated and the service restarted
- **THEN** validation queries the service's own health endpoint
- **AND** a non-success response or an unreachable service fails the deployment

#### Scenario: Health validation is retried before it is declared failed

- **WHEN** the service has just been restarted
- **THEN** validation retries within a bounded window before concluding failure
- **AND** the retry window is long enough for a normal service start

#### Scenario: Validation reports readiness, not merely that a port is open

- **WHEN** health validation succeeds
- **THEN** the response is the service's versioned health contract
- **AND** the reported API version is the expected one

### Requirement: The Test Suite Gates Activation

The authoritative test suite SHALL pass on the release host before that release is activated, so a
release that fails the suite cannot reach traffic even if every other check passes.

#### Scenario: A failing suite blocks activation

- **WHEN** the test suite fails on a release
- **THEN** the release is not activated
- **AND** the previously active release continues to serve traffic

#### Scenario: The gate is the project's own command

- **WHEN** the deployment runs the gate
- **THEN** it invokes the project's existing test command unmodified
- **AND** no alternative or reduced test selection is used

#### Scenario: The gate does not touch production state

- **WHEN** the gate runs on a release host
- **THEN** it does not write to the production metadata or settings store
- **AND** it does not read or modify the production storage root

### Requirement: Retention Is Bounded And Never Removes What Is Needed

Old releases SHALL be pruned to a bounded count. Pruning SHALL NEVER remove the active release or the
release that rollback would select, and a pruning failure SHALL NOT fail an otherwise successful
deployment.

#### Scenario: The active and previous releases survive pruning

- **WHEN** pruning runs
- **THEN** the active release and the previous release are retained

#### Scenario: Pruning failure does not reverse a good deployment

- **WHEN** pruning fails after a successful activation
- **THEN** the deployment is still reported as successful
- **AND** the pruning failure is reported separately

#### Scenario: Disk exhaustion is bounded

- **WHEN** many deployments have occurred
- **THEN** the number of retained release directories is capped
- **AND** the cap is documented

### Requirement: The Deployment Is Idempotent And Re-runnable

Running the deployment mechanism repeatedly with the same inputs SHALL converge on the same running
version and SHALL NOT accumulate partial state.

#### Scenario: Re-running a successful deployment is safe

- **WHEN** the deployment is run again for the same commit without any code change
- **THEN** it completes without error
- **AND** the service ends up serving the same version

#### Scenario: An interrupted deployment leaves a recoverable state

- **WHEN** a deployment is interrupted partway through
- **THEN** the next deployment attempt can still complete
- **AND** the active-release pointer is left at either the old or the new release, never dangling

### Requirement: Deployment Secrets Are Not In The Release Or The Repository

Credentials used to trigger a deployment SHALL be supplied by the deployment mechanism's secret store,
SHALL NOT be committed to the repository, and SHALL NOT appear in deployment output.

#### Scenario: Deployment credentials come from a secret store

- **WHEN** a deployment authenticates to its target
- **THEN** the credential is read from the deployment mechanism's secret store
- **AND** no credential value is present in version control

#### Scenario: Credentials are not echoed

- **WHEN** a deployment runs
- **THEN** no secret value appears in its log output

#### Scenario: Deployment privilege is scoped

- **WHEN** the deployment identity's privileges are inspected
- **THEN** they are limited to invoking the deployment mechanism
- **AND** they are not a general root shell

### Requirement: Concurrent And Superseded Deployments Are Serialised

Deployments SHALL NOT interleave. A deployment started while another is in progress SHALL be
serialised behind it or refused, and a superseded deployment SHALL NOT overwrite a newer one.

#### Scenario: Overlapping deployments do not interleave

- **WHEN** a second deployment is triggered while one is running
- **THEN** only one deployment modifies the active release at a time

#### Scenario: A stale deployment cannot roll the service backwards

- **WHEN** a deployment for an older commit completes after a newer one has been activated
- **THEN** the newer release remains the active one

### Requirement: Deployment Outcome Is Observable

A deployment SHALL report a machine-readable outcome distinguishing success, a validation failure
before activation, and a post-activation failure that triggered rollback.

#### Scenario: Each failure mode is distinguishable

- **WHEN** a deployment fails
- **THEN** the reported outcome identifies whether the release was never activated or was activated
  and then rolled back

#### Scenario: The running version is discoverable after deployment

- **WHEN** a deployment completes
- **THEN** the active release identifier is available from the host
- **AND** it can be compared against the intended commit