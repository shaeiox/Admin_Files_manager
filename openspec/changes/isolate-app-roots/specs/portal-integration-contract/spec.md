# Spec Delta

## Purpose

The File Portal integrates through a versioned HTTP contract that this application owns, instead of
reading `admin.sqlite`. Neither application needs the other's paths, host or schema.

## ADDED Requirements

### Requirement: Service Token Guards Every Integration Route

Routes under `/api/v1/integration/portal/` SHALL require `Authorization: Bearer <token>`, where the
token matches one entry of `AFM_PORTAL_SERVICE_TOKEN` (comma-separated, each at least 32 characters,
compared in constant time). They SHALL NOT accept user sessions or require CSRF tokens.

#### Scenario: Integration disabled

- **WHEN** `AFM_PORTAL_SERVICE_TOKEN` is unset
- **THEN** every integration route answers `404`, and the rest of the application is unaffected

#### Scenario: Weak token

- **WHEN** any configured token is shorter than 32 characters
- **THEN** startup is refused without quoting the value

#### Scenario: Wrong or missing token

- **WHEN** a request carries no token or a token that does not match
- **THEN** it answers `401` with no body detail, and repeated failures from one IP are rate-limited

#### Scenario: Rotation

- **WHEN** two tokens are configured
- **THEN** either is accepted

### Requirement: Versioned Policy Snapshot

`GET /api/v1/integration/portal/snapshot` SHALL return one consistent JSON document (read in a single
transaction) containing:
- `contract`
- `volumeId`, `publishedRoot`, `releaseClientPath`
- `auth` tunables
- `users`, `policies`, `userGrants`, `groupMembers`, `groupGrants`
- `nav`

It SHALL send a strong `ETag` and `Cache-Control: no-store`, and it SHALL answer `304` to a matching
`If-None-Match`. It SHALL NOT include password hashes.

#### Scenario: Unchanged data

- **WHEN** the portal polls with the last `ETag` and nothing changed
- **THEN** the answer is `304` with an empty body

#### Scenario: Password changed

- **WHEN** a user's password changes
- **THEN** that user's `credentialStamp` changes in the next snapshot

#### Scenario: Schema migration

- **WHEN** a database migration adds or renames internal columns and the contract fields keep their meaning
- **THEN** `contract` stays the same and the portal needs no change

#### Scenario: Breaking contract change

- **WHEN** a field is removed or retyped
- **THEN** `contract` is incremented and documented in `docs/CONTRACTS.md`

### Requirement: Credential Verification For The Portal

`POST /api/v1/integration/portal/credentials/verify` SHALL check `{username, password}` with the same
rules as admin sign-in: bcrypt, account status, `locked_until`, and the per-IP login limiter. It
SHALL answer `200 {userId, credentialStamp}` or `401`, and the answer SHALL NOT reveal which part
failed.

#### Scenario: Valid portal sign-in

- **WHEN** an active user's correct credentials are sent
- **THEN** the answer is `200` with that user's id and current `credentialStamp`

#### Scenario: Disabled or locked user

- **WHEN** the user is disabled or locked
- **THEN** the answer is `401`, the same as for a wrong password

### Requirement: Portal Log And Access Check Come From The Portal

When `AFM_PORTAL_URL` is set, Admin → Logs → File portal SHALL read `GET <AFM_PORTAL_URL>/api/ops/log`,
and "Check access" SHALL ask `POST <AFM_PORTAL_URL>/api/ops/access-check`, both with the service token.
`PORTAL_LOG_FILE` SHALL remain a deprecated fallback for one release.

#### Scenario: Portal on another host

- **WHEN** the portal runs on another host and `AFM_PORTAL_URL` points to it
- **THEN** the log pane and "Check access" work, with no shared filesystem

#### Scenario: Portal unreachable

- **WHEN** the portal does not answer
- **THEN** the log pane reports "not reachable", and "Check access" answers `503` instead of a guessed decision

#### Scenario: Access check keeps its shape

- **WHEN** `GET /api/v1/admin/files/effective?path=&userId=` is called with `AFM_PORTAL_URL` set
- **THEN** it answers the same `{ outcome, policies[] }` shape, taken from the portal's decision
- **AND** this application holds no copy of the portal's decision rules (`portalKey`/`portalAccess` removed); the shared fixtures in `test/contract/portal-v1/` guard the contract

#### Scenario: Neither configured

- **WHEN** `AFM_PORTAL_URL` and `PORTAL_LOG_FILE` are both unset
- **THEN** the pane reports "not linked" (unchanged)
