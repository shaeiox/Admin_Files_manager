# Spec Delta

## Purpose

The application's code folder can be placed at any path, under any name, read-only, next to or
far from the File Portal, and it still works. Nothing it needs lives inside that folder, and nothing
it serves overlaps it.

## ADDED Requirements

### Requirement: The Code Folder Holds No State In Production

With `NODE_ENV=production`, the server SHALL refuse to start when `AFM_DATA_DIR` is unset, relative,
or resolves (after symlinks) to the code folder or any folder inside it.

#### Scenario: Data folder outside the code folder

- **WHEN** `AFM_DATA_DIR=/var/lib/dimension` and the code folder is `/opt/dimension/releases/42`
- **THEN** the server starts and writes `admin.sqlite`, `metadata.json` and `settings.json` only under `/var/lib/dimension`

#### Scenario: Data folder inside the code folder

- **WHEN** `AFM_DATA_DIR` resolves to `<code folder>/data`
- **THEN** startup is refused with a message naming `AFM_DATA_DIR` and the code folder

#### Scenario: Development fallback

- **WHEN** `NODE_ENV` is not `production` and `AFM_DATA_DIR` is unset
- **THEN** `<cwd>/data` is used and a single warning says that production requires `AFM_DATA_DIR`

### Requirement: Storage Never Overlaps The Application

The server SHALL refuse to start in production, and warn otherwise, when `STORAGE_ROOT` (after
symlinks) equals, contains, or is contained by the code folder or `AFM_DATA_DIR`.

#### Scenario: Storage contains the application

- **WHEN** `STORAGE_ROOT=/opt/` and the code folder is `/opt/devel/Projects/<any name>`
- **THEN** production startup is refused with a message naming both paths
- **AND** no file-manager endpoint can then list, download, rename or delete the database or the source code

#### Scenario: Dedicated storage

- **WHEN** `STORAGE_ROOT=/srv/dimension/storage` and neither the code folder nor `AFM_DATA_DIR` is inside it
- **THEN** startup proceeds and behaviour is unchanged

### Requirement: No Reference To Another Application's Folder

The application SHALL NOT read, write or derive any path inside the File Portal's code or data
folder. Integration SHALL use only configured URLs and tokens (see `portal-integration-contract`).

#### Scenario: Portal folder moved

- **WHEN** the File Portal's code and data folders are moved or renamed and its URL is unchanged
- **THEN** this application keeps working with no configuration change

#### Scenario: Retired variable

- **WHEN** `PORTAL_ROOT` is set
- **THEN** it is ignored and a warning is logged (unchanged since ADR-010)

### Requirement: Relocation Is Verified In CI

CI SHALL copy the repository to a fresh temporary path with spaces in its name, make it read-only,
and run the test suite and a smoke start there. A lint step SHALL fail on references to the
sibling repository or to machine-specific absolute paths in `src`, `test`, `scripts` and `docs`.

#### Scenario: Hard-coded path introduced

- **WHEN** a commit adds `D:\Projects\…` or `/opt/devel/…` to a test
- **THEN** the relocation lint fails and names the file and line
