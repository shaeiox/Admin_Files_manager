# Settings Truthful UI

## Purpose

Defines the rule that the Settings page renders only capabilities the system actually has: every control works, every status is true, every action exists, and removed capability groups are either absent or explicitly marked unavailable — never implied.

## ADDED Requirements

### Requirement: No Fabricated Capability or Status Is Rendered

The page SHALL NOT render a control, toggle, badge, status, tag, or action for a capability the system does not implement, and SHALL NOT assert server-side state that does not exist. This includes, without exception: two-factor authentication, single sign-on, session management, encryption at rest, virus scanning, password-protected links, watermarking, third-party service connections, webhooks, notification channels, scheduled purging, auto-organization, automatic thumbnails, deduplication, trash, API keys, workspace ownership, and workspace deletion.

#### Scenario: Security claims are gone

- **WHEN** the Security area is rendered
- **THEN** it contains no authentication, encryption, scanning, session, or link-protection control or status
- **AND** any remaining content states explicitly that no such subsystem exists in this build, or the area is absent

#### Scenario: Integration statuses are gone

- **WHEN** the page is rendered
- **THEN** no third-party service is shown as connected, not connected, or connectable

#### Scenario: Danger actions are gone

- **WHEN** the page is rendered
- **THEN** no control offers to empty a trash, revoke API keys, transfer ownership, or delete a workspace

### Requirement: Every Rendered Control Has a Working Handler

A control that performs no action SHALL NOT be rendered as enabled. Removal of a control SHALL include removal of its handler, and removal of a handler SHALL include removal of its control. A decorative input that reads or changes nothing SHALL NOT be present.

#### Scenario: No dead buttons

- **WHEN** any button on the page is activated
- **THEN** it produces a real, observable effect backed by the system

#### Scenario: No decorative search field

- **WHEN** the page header is rendered
- **THEN** a search field is present only if typing in it filters the page's settings, and absent otherwise

### Requirement: Removed Groups Leave an Honest Residue or Nothing

A removed capability group SHALL either be absent entirely or be replaced by an explicit unavailable note stating the capability does not exist in this build. The note pattern follows the established quota-panel and API-keys precedent: it names what is unavailable and never implies a workaround that does not exist.

#### Scenario: Unavailability is stated, not implied

- **WHEN** a removed group has a residual note
- **THEN** the note states the capability does not exist in this build
- **AND** it contains no fabricated statuses, credentials, dates, or quotas

### Requirement: The Storage Notice States What Is Actually Stored

The page's storage notice SHALL appear only when the settings store is genuinely unreachable, and its copy SHALL accurately describe what is stored where: server-side settings persist on the server; the theme remains browser-local.

#### Scenario: Notice hidden when the store answers

- **WHEN** the settings store responds successfully
- **THEN** the notice is not visible

#### Scenario: Notice truthful when the store is unreachable

- **WHEN** the settings store cannot be reached
- **THEN** the notice appears and states that settings are not stored, with no claim about any other capability

### Requirement: No Platform Assumption in User-Facing Copy

User-facing copy SHALL NOT name a host operating system, disk, or platform unless the system has actually detected it. Destructive-action copy SHALL state permanence without platform references.

#### Scenario: No invented platform detail

- **WHEN** any confirmation or description on the page refers to deletion or storage
- **THEN** the copy contains no operating-system or disk reference
- **AND** irreversibility is stated plainly

### Requirement: Remaining Dynamic Interpolation Is Escaped

Any string inserted into markup by the page module SHALL be escaped unless it is a compile-time constant authored in the module itself.

#### Scenario: Server-supplied values render as text

- **WHEN** a settings value containing markup-significant characters is displayed
- **THEN** it renders as literal text, not markup
