# Spec Delta

## Purpose

Defines how the operating system's service manager runs the application in production: how it stops
without corrupting work in flight, which identity it runs as, what it is allowed to write to, and
where its output goes.

## ADDED Requirements

### Requirement: The Service Shuts Down Gracefully On A Stop Signal

The service SHALL handle a termination signal by ceasing to accept new connections, allowing
in-flight requests to complete, and only then exiting. A stop SHALL NOT abandon an in-flight
transfer part-way.

#### Scenario: In-flight upload completes on stop

- **WHEN** the service receives a termination signal while an upload is streaming
- **THEN** it stops accepting new connections
- **AND** the in-flight upload is allowed to finish before the process exits

#### Scenario: In-flight download completes on stop

- **WHEN** the service receives a termination signal while a download or archive stream is in
  progress
- **THEN** the stream is allowed to finish before the process exits

#### Scenario: The stop signal path is the one the service manager uses

- **WHEN** the service manager stops the service
- **THEN** the signal the service handles is the one the service manager sends by default

#### Scenario: Shutdown does not depend on an interactive request

- **WHEN** no client is connected
- **THEN** the service still exits promptly on a termination signal

### Requirement: Shutdown Is Bounded And Cannot Hang

If in-flight work does not complete within a configured grace period, the service SHALL exit anyway,
so that a stuck transfer cannot block a deployment indefinitely. The service manager's stop timeout
SHALL be longer than the application's own grace period, so the application's bounded exit wins.

#### Scenario: A stuck transfer cannot block a deployment forever

- **WHEN** in-flight work does not complete within the grace period
- **THEN** the process exits by force
- **AND** the forced exit is logged

#### Scenario: The two timeouts are ordered so the application exits first

- **WHEN** the service manager's stop timeout is compared with the application's grace period
- **THEN** the service manager's timeout is the longer of the two

### Requirement: Shutdown Handling Does Not Change The Module Contract

The service's exported value SHALL remain the HTTP server handle, so that suites which start the
application in-process and close it continue to work unchanged.

#### Scenario: In-process consumers can still close the listener

- **WHEN** a test or an embedding process requires the entry module
- **THEN** it receives the server handle and can close it
- **AND** no test needs modification to shut the service down

### Requirement: The Service Runs Under An Unprivileged Identity

The service SHALL run as a dedicated non-login identity, and SHALL NOT run as root. That identity
SHALL have no interactive shell and no home directory requirement.

#### Scenario: The service is not root

- **WHEN** the running service's effective user is inspected
- **THEN** it is the dedicated service identity
- **AND** it is not the superuser

#### Scenario: The identity cannot be logged into interactively

- **WHEN** an operator attempts an interactive shell as the service identity
- **THEN** it is refused

### Requirement: Filesystem Access Follows Least Privilege

The service identity SHALL be able to write the two store documents and read and write the storage
root, and SHALL NOT be able to modify the release directories it executes from.

#### Scenario: Release directories are not writable by the service

- **WHEN** the service attempts to write inside its own release directory
- **THEN** the attempt is refused by filesystem ownership

#### Scenario: Store and storage root are writable

- **WHEN** the service creates or atomically replaces a store document
- **THEN** the operation succeeds under the service identity

#### Scenario: Configuration is not writable by the service

- **WHEN** the service attempts to modify its configuration file
- **THEN** the attempt is refused

### Requirement: The Working Directory And Configuration Are Declared To The Service Manager

The service manager SHALL be configured with the active release as the working directory and with an
out-of-band configuration source. This SHALL be treated as load-bearing rather than stylistic,
because the store location depends on it.

#### Scenario: Working directory points at the active release

- **WHEN** the service manager starts the service
- **THEN** the process working directory is the active release directory

#### Scenario: Configuration comes from outside the release

- **WHEN** the service manager starts the service
- **THEN** configuration is read from a path outside every release directory

### Requirement: Restart Policy Is Explicit

The service manager SHALL be configured with an explicit restart policy and a restart delay, so that
a crashed process recovers without manual intervention and a deliberate stop is not mistaken for a
failure.

#### Scenario: A crash recovers without intervention

- **WHEN** the process exits unexpectedly
- **THEN** the service manager restarts it after the configured delay

#### Scenario: A deliberate stop is not undone

- **WHEN** an operator or a deployment stops the service
- **THEN** the service manager does not immediately restart it against the operator's intent

### Requirement: Service Output Is Captured

Everything the service writes to standard output and standard error SHALL be captured by the host's
logging facility and be retrievable after the fact, because the application has no log file of its
own.

#### Scenario: Request logs are retrievable after the fact

- **WHEN** a request has been served
- **THEN** its log line is retrievable from the host's logging facility
- **AND** it remains retrievable after the process has restarted

#### Scenario: Startup diagnostics name the configuration in effect

- **WHEN** the service starts
- **THEN** it logs the port, the storage root and the environment name it is running with

### Requirement: A Deployment-Time Restart Is A Single Action

Activating a release and restarting the service into it SHALL be one action, so that the deployment
does not depend on a second manual step, and a restart failure is observable as a deployment failure
rather than as a later mystery.

#### Scenario: Restart failure fails the deployment

- **WHEN** the service manager fails to restart the service after a switch
- **THEN** the deployment is reported as failed
- **AND** the previously active release is restored