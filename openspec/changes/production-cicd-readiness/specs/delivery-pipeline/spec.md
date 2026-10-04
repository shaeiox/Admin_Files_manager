# Spec Delta

## Purpose

Specifies the automation that verifies a commit and, once verified, activates it: the test gate and
its runtime pinning, the conditions under which a deployment may be triggered automatically, the
credentials it uses, and the Git precondition without which no hosted automation can run at all.

## ADDED Requirements

### Requirement: Every Push Is Gated By The Authoritative Test Suite

Every push SHALL run the project's existing test command, unmodified, and a failing suite SHALL block
the change from reaching a deployment. The gate SHALL NOT be a reduced, filtered or substituted test
selection.

#### Scenario: A failing suite blocks deployment

- **WHEN** the suite fails on a pushed commit
- **THEN** no deployment of that commit occurs

#### Scenario: The gate is the project's own command

- **WHEN** the pipeline runs the gate
- **THEN** it invokes the project's existing test script
- **AND** no additional or alternative test tooling is introduced to satisfy the gate

#### Scenario: The gate runs on every push, not only on releases

- **WHEN** a commit is pushed to a deployment branch
- **THEN** the suite runs for that commit
- **AND** its result is recorded against that commit

### Requirement: The Suite Runs Without External Services Or Fixtures

The pipeline SHALL be able to run the suite in a clean environment with no pre-existing services, no
seeded data and no secret values, because the suite is self-contained. No pipeline step SHALL be
required to prepare storage, a store document or an environment variable for the tests to pass.

#### Scenario: Clean-checkout run needs no configuration

- **WHEN** the suite is run on a freshly created checkout
- **THEN** it passes with no environment variable set
- **AND** no directory or file must be created beforehand to make it pass

#### Scenario: Tests do not bind a fixed network port

- **WHEN** multiple suite processes run concurrently
- **THEN** each obtains its own network port
- **AND** no port collision can occur

#### Scenario: Tests do not read a local configuration file

- **WHEN** a checkout contains a local configuration file
- **THEN** the suite's result does not depend on its contents

### Requirement: Runtime Version Is Pinned And Enforced

The Node.js version the project is verified against SHALL be recorded in the repository in a form
both the pipeline and a human can read, and the pipeline SHALL use exactly that version rather than
whatever the runner image defaults to.

#### Scenario: The pipeline uses the recorded version

- **WHEN** the pipeline installs the runtime
- **THEN** it uses the version recorded in the repository
- **AND** it does not rely on a runner image's default

#### Scenario: A version constraint is discoverable from the manifest

- **WHEN** an operator inspects the package manifest
- **THEN** the supported runtime version range is declared there

#### Scenario: An unsupported runtime fails rather than behaving differently

- **WHEN** the service runs on a runtime version outside the declared range
- **THEN** the incompatibility is surfaced rather than left to produce subtly different behaviour

### Requirement: Production Installation Differs From Verification Installation

The dependency installation used for verification SHALL be distinguishable from the one used for
production, so that the tree that passed the suite is not the tree that ships.

#### Scenario: The production tree excludes development packages

- **WHEN** a production release is installed
- **THEN** development-only packages are absent

#### Scenario: The verified tree and the shipped tree are both reproducible

- **WHEN** either installation is reproduced from the same commit
- **THEN** it yields the same tree as the original run

### Requirement: Deployment Trigger Is Explicit And Bounded

A deployment SHALL be triggered only by a defined event on a defined branch, and SHALL NOT be
triggered by an event that has not been verified. A deployment SHALL be rejected while another
deployment for the same target is in progress.

#### Scenario: Only the deployment branch deploys

- **WHEN** a commit is pushed to a branch that is not a deployment branch
- **THEN** the suite runs
- **AND** no deployment occurs

#### Scenario: Pull requests are verified but not deployed

- **WHEN** a pull request is opened
- **THEN** the suite runs against it
- **AND** no deployment environment is affected

#### Scenario: Overlapping deployments are prevented

- **WHEN** a deployment is in progress and another is triggered
- **THEN** the second does not begin modifying the target until the first has finished

### Requirement: A Git Remote Capable Of Hosting Automation Is A Precondition

Automated deployment SHALL require a remote that the automation can reach and authenticate to. The
absence of such a remote SHALL be recorded as a blocker, and the deployment mechanism SHALL NOT be
assumed available merely because it is the common default.

#### Scenario: An unreachable remote is a recorded blocker

- **WHEN** the repository's only remote is not reachable by the automation
- **THEN** the absence of an eligible remote is recorded as a deployment blocker
- **AND** the plan states what must change before automation is possible

#### Scenario: The chosen mechanism is stated, not assumed

- **WHEN** the deployment mechanism is decided
- **THEN** the decision and its precondition are recorded
- **AND** if no eligible remote exists, a fallback that works with the current remote is recorded
  instead

#### Scenario: The manifest's declared repository matches reality

- **WHEN** the package manifest declares a repository location
- **THEN** it matches the repository the project actually uses

### Requirement: Deployment Credentials Are Scoped And External

Credentials used by automation SHALL be held in the automation platform's secret store, SHALL be
scoped to the minimum privilege the deployment needs, and SHALL NOT be readable from the repository.

#### Scenario: No credential material in the repository

- **WHEN** the repository is inspected
- **THEN** no deployment credential, key or token is present in any tracked file

#### Scenario: Privilege is limited to the deployment action

- **WHEN** the automation identity's permissions are inspected on the target
- **THEN** it can invoke the deployment mechanism
- **AND** it has no broader administrative privilege

#### Scenario: Host access is by key, not by password

- **WHEN** automation authenticates to the target
- **THEN** it uses a key-based mechanism
- **AND** no shared password is stored

### Requirement: Secrets Are Available To The Runtime Without Entering The Repository

Values the running service needs SHALL reach the host through the automation secret store or the
host's out-of-band configuration, and SHALL NOT be introduced by the deployment into a release
directory.

#### Scenario: The runtime configuration is never sourced from version control

- **WHEN** automation deploys a release
- **THEN** it does not write service configuration into the release directory from the repository

#### Scenario: Rotation does not require a code change

- **WHEN** a secret must be rotated
- **THEN** the rotation is performed in the secret store or host configuration
- **AND** no commit is required