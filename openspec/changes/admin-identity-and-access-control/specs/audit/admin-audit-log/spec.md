# Spec Delta

## Purpose

Defines the flat administrative audit trail: what gets recorded, what never does, and its
retention — deliberately simpler than a compliance-grade, class-based retention model.

## ADDED Requirements

### Requirement: Administrative Actions Are Recorded With Actor, Action, Outcome, And Target

Every user-management and file-policy-management action, and every login attempt, SHALL append
one `audit_logs` row recording the acting user (if any), the action taken, its outcome, and the
affected target.

#### Scenario: A successful user-disable action is recorded

- **WHEN** an administrator disables a user
- **THEN** an `audit_logs` row records that admin as actor, `user.disable` as action,
  `success` as outcome, and the disabled user as target

#### Scenario: A failed login is recorded with no actor

- **WHEN** a login attempt fails
- **THEN** an `audit_logs` row records `login.failure`, `failure` as outcome, and a null actor
  (the caller was never authenticated)

#### Scenario: A file-policy change is recorded with the file as target

- **WHEN** an administrator changes a file's access mode
- **THEN** an `audit_logs` row records that admin as actor, `file.policy.update` as action, and
  the affected file as target

### Requirement: A Credential Value Is Never Recorded

No `audit_logs` row SHALL contain a plaintext password, a raw session token, or a raw bearer
credential.

#### Scenario: A password-reset action records no password value

- **WHEN** an administrator resets a user's password
- **THEN** the audit record names the action and its target
- **AND** it does not contain the new or old password value

### Requirement: Retention Is A Simple Fixed Window, Not Class-Based

Audit records SHALL be retained for a single, fixed configured window and pruned uniformly, rather
than by a per-action-category retention policy.

#### Scenario: Records older than the retention window are eligible for pruning

- **GIVEN** an `audit_logs` row older than the configured retention window
- **WHEN** the prune routine runs
- **THEN** that row is removed

#### Scenario: Records within the retention window are not pruned

- **GIVEN** an `audit_logs` row within the configured retention window
- **WHEN** the prune routine runs
- **THEN** that row remains

#### Scenario: Retention applies uniformly, not per action type

- **WHEN** the retention configuration is inspected
- **THEN** it names a single window
- **AND** no action type is configured with a different retention period
