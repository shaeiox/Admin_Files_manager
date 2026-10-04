# Settings Regression Coverage

## Purpose

Defines the automated tests and documentation updates that must accompany the settings work, so the repaired contract, the removed fabrications, and the store itself cannot silently regress.

## ADDED Requirements

### Requirement: The Store Has Service-Level Tests

The settings store SHALL have dedicated tests covering default materialization, save/read round-trip, atomic write behaviour, validation rejection, corrupt-document behaviour, and path-redirected isolation from the real document.

#### Scenario: Store suite covers the lifecycle

- **WHEN** the service test suite runs
- **THEN** it exercises defaults, a full replace round-trip, rejection of unknown keys and invalid values, corrupt-document handling, and confirms no test touches the real `data/settings.json`

### Requirement: The HTTP Contract Has Live-Server Tests

The settings endpoints SHALL have contract tests against a live server covering the bare read shape, the enveloped write shape, each validation failure class, mount ordering ahead of the catch-all, and the absence of a destructive settings action.

#### Scenario: Contract suite pins the envelope conventions

- **WHEN** the API contract suite runs
- **THEN** it asserts `GET` returns a bare object, `PUT` returns the success envelope, errors return the failure envelope, and `POST /api/settings/action` returns `404`

### Requirement: The Page Has Frontend Module Tests

The Settings page module SHALL have tests covering the markup/module name cross-assertion, hydration coverage, discard restoration, save gating on store reachability, dirty-tracking rules, teardown listener removal, and the absence of event-stopping handlers on theme-picker cards.

#### Scenario: Frontend suite pins the repaired contract

- **WHEN** the frontend suite runs
- **THEN** it fails if a control loses its `name`, if hydration or extraction drops a key, if discard misstates its outcome, if save fires while the store is unreachable, or if a theme-card click handler stops propagation

### Requirement: Removed Fabrications Are Pinned by the Page Scan

The live-server page-honesty scan SHALL be extended with settings-specific fabricated strings, so reintroducing a removed claim fails the suite.

#### Scenario: Fabrication scan rejects the removed claims

- **WHEN** the live-server scan serves `/settings.html`
- **THEN** the response contains none of the documented settings fabrication strings
- **AND** the scan continues to strip HTML comments before matching

### Requirement: Documentation Stays in Sync in the Same Change

The same change SHALL update the API contracts document with both endpoint shapes and the removed-claims inventory, remove the settings entry and the stale shared-chrome entries from the known-gaps list, refresh the repository map, record the storage-format and scope decisions in a new decision record, and adjust the project instructions' settings references.

#### Scenario: Docs match the shipped contract

- **WHEN** the change is complete
- **THEN** the contracts document lists `GET`/`PUT /api/settings` with their envelope shapes, the known-gaps section no longer lists settings or the stale shared-chrome endpoints, the repository map names the new files, and a decision record explains the JSON store and the persist-only-what-works scope rule
