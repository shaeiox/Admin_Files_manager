# Spec Delta

## Purpose

Defines the environment contract the running service depends on: which variables it requires, what
makes a value acceptable rather than merely present, how production configuration reaches a host
without entering version control, and which source of configuration wins when more than one is
available.

## ADDED Requirements

### Requirement: Required Configuration Is Declared And Enforced At Startup

The service SHALL declare every environment variable it requires, and SHALL refuse to start when a
required variable is absent. The refusal SHALL occur before the service begins accepting requests,
and SHALL identify the missing variable by name.

#### Scenario: Absent required variable prevents startup

- **WHEN** the service starts without a required variable set
- **THEN** it terminates before accepting any connection
- **AND** the message names the missing variable

#### Scenario: Present required variable permits startup

- **WHEN** all required variables are set
- **THEN** the service starts and accepts requests

### Requirement: Optional Variables Have Declared Defaults

Every optional environment variable SHALL have a documented default, so that an unconfigured
production host behaves identically to a configured one.

#### Scenario: Unset optional variable falls back to its default

- **WHEN** an optional variable is not set
- **THEN** the service uses its declared default
- **AND** behaviour is identical across hosts that omit it

#### Scenario: Set optional variable overrides the default

- **WHEN** an optional variable is set to a valid value
- **THEN** that value is used instead of the default

### Requirement: The Storage Root Is Validated, Not Merely Checked For Presence

The storage root SHALL be rejected at startup unless it is a syntactically usable absolute path for
the running platform and refers to a location the service can actually use. A value that is present
but unusable SHALL be treated as a startup failure, never as a working configuration.

#### Scenario: Unusable root prevents startup instead of failing per request

- **WHEN** the storage root is set to a value that is not a usable absolute path on the running
  platform
- **THEN** the service terminates before accepting any connection
- **AND** the message identifies the variable and the reason

#### Scenario: A relative root is rejected

- **WHEN** the storage root is a relative path
- **THEN** the service terminates at startup
- **AND** no request is served that would depend on an ambiguous base directory

#### Scenario: A root that is absent from the filesystem is detected before serving

- **WHEN** the configured root does not exist or is not traversable by the service identity
- **THEN** the condition is reported as a startup-time configuration problem
- **AND** the service does not present a healthy status while unable to use its storage root

### Requirement: The Storage Root Is Never Created Implicitly By The Service

The service SHALL NOT create its configured storage root as a side effect of starting. A missing
root is an operator error to be surfaced, not a condition to be papered over with a newly created
empty directory that would silently present an empty file listing as the truth.

#### Scenario: A mistyped root is surfaced, not silently created

- **WHEN** the configured root does not exist
- **THEN** the service does not create it
- **AND** the condition is reported rather than presenting an empty directory as valid state

### Requirement: Production Configuration Is Delivered Out Of Band

Production configuration SHALL be supplied to a host by a mechanism outside version control, and
SHALL NOT be read from a file inside a release. The delivery mechanism SHALL restrict read access to
the service identity and no more.

#### Scenario: Release does not carry production configuration

- **WHEN** a release directory is inspected on a production host
- **THEN** no production configuration file is present inside it

#### Scenario: Configuration file permissions are restricted

- **WHEN** the configuration file is written on a host
- **THEN** it is readable by the service identity and by the deployment mechanism
- **AND** it is not world-readable

#### Scenario: A repository-local configuration file cannot override production configuration

- **WHEN** production configuration is supplied by the service manager and a configuration file is
  also present in the working directory
- **THEN** the service-manager-supplied value is the one in effect

### Requirement: Configuration Precedence Is Deterministic

When configuration is available from more than one source, the precedence between those sources
SHALL be fixed and documented, so that the effective configuration does not depend on which files
happen to exist on a particular host.

#### Scenario: Explicitly supplied environment wins over file-discovered values

- **WHEN** a variable is present both in the process environment and in a discoverable configuration
  file
- **THEN** the process-environment value is in effect

#### Scenario: Precedence is documented

- **WHEN** an operator inspects the deployment documentation
- **THEN** the precedence between configuration sources is stated
- **AND** the statement matches the implemented behaviour

### Requirement: A Documented Configuration Template Exists

The repository SHALL carry a committed, secret-free template enumerating every supported environment
variable with its purpose, whether it is required, and its default. The template SHALL be safe to
commit and SHALL contain no real values from any host.

#### Scenario: Every variable is discoverable without reading source

- **WHEN** an operator reads the configuration template
- **THEN** every supported environment variable appears with its required-or-optional status
- **AND** its default is stated when it has one

#### Scenario: Template carries no host values

- **WHEN** the configuration template is inspected
- **THEN** it contains no filesystem path, credential or host-specific value from a real deployment

### Requirement: Size And Numeric Configuration Is Validated

A configuration value expressing a byte limit SHALL be rejected at startup unless it is a positive
integer within the representable range. An invalid value SHALL be a startup failure rather than a
silently ignored setting.

#### Scenario: Malformed byte limit prevents startup

- **WHEN** a byte-limit variable is set to a non-numeric, zero, negative or fractional value
- **THEN** the service terminates at startup
- **AND** the message identifies the variable and the accepted form

#### Scenario: Valid byte limit is applied

- **WHEN** a byte-limit variable is set to a positive integer
- **THEN** that limit governs upload acceptance

### Requirement: Configuration Is Read Once Per Process Start

Configuration values that bound resource consumption SHALL be resolved at startup and SHALL NOT be
re-read from the environment during a request. A change to such a value SHALL take effect only on
restart, and this SHALL be documented so an operator does not expect a live reload.

#### Scenario: Mid-request re-read cannot occur

- **WHEN** a request is served
- **THEN** the byte limit in force is the one resolved at startup
- **AND** no request path re-reads the variable from the environment

#### Scenario: Restart-only semantics are documented

- **WHEN** an operator reads the deployment documentation
- **THEN** it states that changing the byte limit requires a restart to take effect