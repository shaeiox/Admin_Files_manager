# Settings Store

## Purpose

Defines the server-side settings store: a JSON document persisted under `data/`, the HTTP contract for reading and replacing it, the validation every write must pass, and the deliberate absence of any destructive "settings action" endpoint.

## ADDED Requirements

### Requirement: Settings Persist in a Dedicated JSON Document

The system SHALL persist operator settings in a single JSON document at `data/settings.json`, separate from the metadata store, with an in-memory cache and atomic writes (temp file then rename). On first read of a missing document, the system SHALL materialize the documented defaults. The store path SHALL be resolvable independently of the process working directory assumptions used in production, and test suites SHALL be able to redirect it to a temporary file so no test writes the real document.

#### Scenario: First run yields defaults

- **WHEN** `data/settings.json` does not exist and settings are requested
- **THEN** the system returns the documented default settings object
- **AND** the defaults include `general.workspaceName`, `general.defaultUploadFolder`, and `appearance.defaultView`

#### Scenario: Writes are atomic

- **WHEN** settings are saved
- **THEN** the document is written to a temporary file and renamed over the target
- **AND** no partially written JSON document is observable at the target path

#### Scenario: Tests never touch the real store

- **WHEN** the test suite runs
- **THEN** every suite that boots the server redirects the store path to a temporary file before the server module is required

### Requirement: Read Endpoint Returns the Whole Document Bare

`GET /api/settings` SHALL return `200` with the complete settings object as a bare top-level JSON payload (no `success` envelope), following the read-only aggregate precedent. When the store document is corrupt or unreadable, the endpoint SHALL fail wholly with a `500` error envelope — a deliberately chosen per-capability behaviour, not a degraded `200`.

#### Scenario: Fresh store reads as defaults

- **WHEN** a client requests `GET /api/settings` before any save
- **THEN** the response is `200` with the bare defaults object and no envelope field

#### Scenario: Saved settings read back

- **WHEN** a client saves settings and then requests `GET /api/settings`
- **THEN** the response body equals the most recently accepted settings object

#### Scenario: Corrupt store fails wholly

- **WHEN** the store document cannot be parsed
- **THEN** the endpoint responds `500` with `{ success: false, error }`
- **AND** no default or partial document is substituted in the response

### Requirement: Writes Are Validated Full Replaces

`PUT /api/settings` SHALL accept a complete settings object, validate it against a fixed whitelist of keys with type, enum, and length constraints, persist it atomically, and return `{ success: true, settings }` with the persisted object. Any violation SHALL produce `400 { success: false, error }` and leave the stored document byte-identical. Unknown keys at any depth SHALL be rejected, not silently stripped.

#### Scenario: Valid replace round-trips

- **WHEN** a client sends `PUT /api/settings` with a valid complete settings object
- **THEN** the response is `200` with `{ success: true, settings }` matching what was sent
- **AND** a later `GET` returns the same object

#### Scenario: Unknown key is rejected

- **WHEN** the payload contains a key outside the documented whitelist
- **THEN** the response is `400 { success: false, error }` and the stored document is unchanged

#### Scenario: Wrong type or out-of-enum value is rejected

- **WHEN** a value fails its type, enum, or length constraint
- **THEN** the response is `400 { success: false, error }` and the stored document is unchanged

### Requirement: Path-Valued Settings Are Validated but Never Resolved by the Store

A setting whose value is a client path (`general.defaultUploadFolder`) SHALL pass the shared client-path validator before persisting, and the settings layer SHALL NOT resolve it to a host filesystem path. Resolution through the secure path boundary happens only at the point of use, as with every other client path.

#### Scenario: Traversal is refused

- **WHEN** `defaultUploadFolder` contains `..`, an absolute OS path, or an illegal character
- **THEN** the write is rejected with `400` and the stored document is unchanged

#### Scenario: The store holds client paths only

- **WHEN** a path-valued setting is persisted and read back
- **THEN** the value is the same POSIX-style client path string that was sent
- **AND** no host-absolute path appears in the store or in any API response

### Requirement: The Settings Router Is Reachable and Contains No Destructive Action

The settings routes SHALL be mounted before the `/api` 404 catch-all. The system SHALL NOT expose `POST /api/settings/action` or any other destructive settings endpoint; such requests SHALL fall through to the catch-all `404`.

#### Scenario: Endpoints answer instead of the catch-all

- **WHEN** a client calls `GET` or `PUT /api/settings`
- **THEN** the response comes from the settings router, not the catch-all

#### Scenario: No danger action exists

- **WHEN** a client sends `POST /api/settings/action` with any body
- **THEN** the response is `404 { success: false, error: "API endpoint not found" }`
