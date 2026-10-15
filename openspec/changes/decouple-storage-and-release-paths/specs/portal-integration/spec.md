# Spec Delta

## Purpose

Defines what the Admin Files Manager shares with the File Portal. It shares logical identifiers in
`admin.sqlite` and never physical paths, so storage, release folder and either app's release
directory can each live anywhere.

## ADDED Requirements

### Requirement: The Storage Volume Has A Verifiable Identity

The admin SHALL keep one storage volume UUID in `integration_settings.volume_id` and the same UUID
in a marker file `.dimension-volume` at `STORAGE_ROOT`. It SHALL create the marker only when the
database holds no volume UUID, and SHALL NOT overwrite an existing marker.

#### Scenario: First start stamps the storage

- **WHEN** the admin starts with no stored volume UUID and no marker at `STORAGE_ROOT`
- **THEN** it generates a UUID, creates `.dimension-volume` with it, and stores it in `integration_settings`

#### Scenario: Reinstall adopts existing storage

- **WHEN** the admin starts with no stored volume UUID and a valid marker at `STORAGE_ROOT`
- **THEN** it stores the marker's UUID and does not modify the marker

#### Scenario: A missing or foreign marker is reported, never repaired

- **WHEN** a volume UUID is stored and the marker is absent or holds a different UUID
- **THEN** the admin writes nothing to `STORAGE_ROOT`
- **AND** `GET /api/v1/admin/portal/settings` reports `volume.status` as `missing` or `mismatch`
- **AND** every other admin capability keeps working

#### Scenario: A read-only root is reported

- **WHEN** the marker cannot be created
- **THEN** `volume.status` is `unwritable` and the admin keeps running

#### Scenario: Clients cannot see or touch the marker

- **WHEN** a client lists, searches, renames, deletes or uploads to `/.dimension-volume`
- **THEN** the marker is absent from every listing and walk
- **AND** every mutation naming it is refused by `validateFileName`

### Requirement: The Release Folder Is A Client Path

The admin SHALL store the portal's release folder as a client path in
`integration_settings.release_client_path`, or null for none. A non-null value SHALL name an
existing folder inside `STORAGE_ROOT`.

#### Scenario: Setting the release folder

- **WHEN** `PUT /api/v1/admin/portal/settings` carries `releaseClientPath: "/release/pvm"` and that folder exists
- **THEN** it is stored normalized and returned in the envelope

#### Scenario: Invalid release folder

- **WHEN** the value is not a folder, escapes the root, or fails client-path validation
- **THEN** the request is refused with `400` and nothing is stored

### Requirement: Portal Tunables Are Shared Through The Database

The admin SHALL store the portal's session length, failed-attempt limit and lockout length in
`integration_settings`, with the ranges `PortalService` enforces today. It SHALL NOT read or write
any file belonging to the portal.

#### Scenario: Tunables apply without a portal restart

- **WHEN** an administrator saves new tunables
- **THEN** they are written to `admin.sqlite` only
- **AND** no file outside `AFM_DATA_DIR` is written

#### Scenario: Out-of-range values are refused

- **WHEN** a tunable is outside its range or not a whole number
- **THEN** the request is refused with `400`

### Requirement: The Legacy Portal Config Endpoint Reports Not Linked

`GET /api/v1/admin/portal/config` SHALL keep its response shape and always answer
`{ available: false, reason, values: null }`. `PUT` SHALL answer `503`. `PORTAL_ROOT` SHALL have no
effect.

#### Scenario: Old clients see a disabled capability, not an error shape

- **WHEN** a client calls `GET /api/v1/admin/portal/config`
- **THEN** it receives `200` with `available: false` and a `reason` naming `/admin/portal/settings`

#### Scenario: PORTAL_ROOT is ignored

- **WHEN** `PORTAL_ROOT` is set
- **THEN** the admin logs at startup that it is ignored and never opens a path under it

### Requirement: The Portal Log Is Read From A Configured File

The admin SHALL read the portal trace from the absolute path in `PORTAL_LOG_FILE`, and SHALL report
"not linked" when it is unset or relative.

#### Scenario: Log file configured

- **WHEN** `PORTAL_LOG_FILE` names an existing file
- **THEN** `GET /api/v1/admin/logs/portal` returns its newest entries

#### Scenario: Log file not configured

- **WHEN** `PORTAL_LOG_FILE` is unset
- **THEN** the endpoint answers `available: false` with a reason, never an empty list presented as a reading
