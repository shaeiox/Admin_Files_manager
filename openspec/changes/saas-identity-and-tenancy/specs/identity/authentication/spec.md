# Spec Delta

## Purpose

Defines the single application-level identity system shared by the Admin Web and Files Web
surfaces: how a caller proves who they are, how that proof is carried, how it expires or is
revoked, how cross-site request forgery is prevented, and the rule that no file-serving path
exists without an authenticated principal.

## ADDED Requirements

### Requirement: Credentials Are Verified Against A Stored Hash

The application SHALL authenticate a caller by verifying a submitted secret against a
per-account salted password hash persisted in the database, using a memory-hard algorithm, and
SHALL NOT store, log, echo or compare the secret in plaintext at any point.

#### Scenario: Valid credentials establish a session

- **GIVEN** an active account whose submitted secret verifies against its stored hash
- **WHEN** the caller submits credentials to the login endpoint
- **THEN** a session record is created
- **AND** the response carries an `HttpOnly` cookie containing an opaque session token
- **AND** the response body contains no secret material

#### Scenario: Invalid credentials are refused identically

- **GIVEN** no account matches the submitted identity
- **WHEN** the caller submits credentials to the login endpoint
- **THEN** the response status is the same as for a valid identity with an invalid secret
- **AND** the response body does not distinguish "no such account" from "wrong secret"
- **AND** no session record is created

#### Scenario: A password is never persisted or logged in plaintext

- **WHEN** any account is created or any credential is submitted
- **THEN** no persisted record and no log output contains the plaintext secret
- **AND** the persisted credential field contains only a salted hash

#### Scenario: Repeated failures lock the account without disclosing the counter

- **GIVEN** an account has exceeded the configured consecutive-failure threshold
- **WHEN** further login attempts are made
- **THEN** the attempt is refused without evaluating the secret
- **AND** the refusal does not reveal the remaining attempt count

### Requirement: Sessions Are Server-Side Records With Opaque Credentials

The application SHALL persist each session as a server-side record and SHALL issue the caller an
opaque, high-entropy token whose only persisted form is a hash. The token SHALL NOT be a
self-describing or self-verifying credential.

#### Scenario: Only a hash of the session token is stored

- **WHEN** a session is created
- **THEN** the persisted session record stores a hash of the issued token
- **AND** the token itself is not recoverable from any persisted record or queryable column

#### Scenario: A presented token resolves to its session

- **GIVEN** a session whose stored hash matches the hash of a presented token
- **WHEN** the token is presented on a subsequent request
- **THEN** the request resolves to that session's account and tenant
- **AND** the caller's resolved identity is available to the tenant-context step

#### Scenario: An unknown or tampered token is refused

- **WHEN** a request presents a token that matches no session record
- **THEN** the request is refused with status `401`
- **AND** no filesystem, metadata or settings read is attempted

### Requirement: Browser Sessions Travel In A Protected Cookie

A browser session SHALL be delivered in a cookie that is `HttpOnly`, `Secure` in production, and
carries an appropriate `SameSite` policy, so that script running in the page cannot read the
credential.

#### Scenario: Script cannot read the session cookie

- **WHEN** a page holding an authenticated session is inspected from script
- **THEN** the session cookie is not visible to that script

#### Scenario: Production cookies are marked secure

- **GIVEN** the application is running in production
- **WHEN** a session cookie is issued
- **THEN** the cookie carries the `Secure` attribute

#### Scenario: Cross-site form submission does not carry the cookie

- **WHEN** a mutating request originates from another site
- **THEN** the session cookie is not attached to it by the browser

### Requirement: Session Lifetime Is Bounded And Stated

Every session SHALL have a stated absolute lifetime, and an actively used session SHALL be renewed
within a stated sliding window, so that a session cannot live indefinitely.

#### Scenario: An Absolutely Expired Session Is Refused

- **GIVEN** a session older than the stated absolute lifetime
- **WHEN** its token is presented
- **THEN** the request is refused with status `401`

#### Scenario: Active Use Renews A Session Within The Sliding Window

- **GIVEN** a session used within the sliding window
- **WHEN** its token is presented
- **THEN** its expiry is renewed

#### Scenario: The Lifetime Policy Is Stated

- **WHEN** the session lifetime policy is documented
- **THEN** it states the absolute lifetime and the sliding renewal window
- **AND** it states the re-authentication threshold for destructive operations

### Requirement: One Identity System Serves Both Web Surfaces

The Admin Web and Files Web surfaces SHALL authenticate against the same account records, the same
session records and the same login endpoint. No surface SHALL maintain a separate user store,
credential store or session store.

#### Scenario: One account signs in to both surfaces

- **GIVEN** an account holding roles in two tenants
- **WHEN** it signs in through the Admin Web surface
- **AND** the same account signs in through the Files Web surface
- **THEN** both surfaces resolve the same account identifier
- **AND** no record is synchronized, copied or reconciled between them

#### Scenario: No per-surface account exists

- **WHEN** the account and session tables are inspected
- **THEN** there is no column, table or discriminator distinguishing an administrator account
  from a files account

### Requirement: Mutation Requires A CSRF Token

Every state-changing request SHALL carry a CSRF token that is bound to the caller's session and
is compared against a server-held value. The token SHALL be delivered in a request header rather
than a cookie, so that the browser does not attach it automatically.

#### Scenario: A mutation with a valid CSRF token is accepted

- **GIVEN** an authenticated caller holding a session-bound CSRF token
- **WHEN** a mutating request carries that token in the required header
- **THEN** the request proceeds to authorization

#### Scenario: A mutation without the CSRF token is refused

- **GIVEN** an authenticated caller
- **WHEN** a mutating request omits the CSRF header
- **THEN** the request is refused before any filesystem or database mutation is attempted

#### Scenario: A CSRF token from another session is refused

- **GIVEN** two authenticated sessions
- **WHEN** a request authenticated as one session presents the other session's CSRF token
- **THEN** the request is refused

#### Scenario: No state change is reachable by a safe method

- **WHEN** the HTTP methods used by any endpoint that changes state are enumerated
- **THEN** none of them is `GET`, `HEAD` or `OPTIONS`

#### Scenario: A Download Records No Counter

- **GIVEN** an authorized caller downloading a file with a safe method
- **WHEN** the download completes
- **THEN** no download counter is incremented by that request
- **AND** no activity or audit record describing a state change is written for it

#### Scenario: Counting A Download Is An Explicit Mutation

- **WHEN** download counting is required
- **THEN** it is recorded by an explicit mutating request
- **AND** that request carries the same protection any other mutation carries
- **AND** it is not performed as a side effect of a safe-method request

### Requirement: Sessions Expire And Can Be Revoked

Every session SHALL carry an expiry, SHALL be refused once expired, and SHALL be refusable
administratively without waiting for expiry.

#### Scenario: An expired session is refused

- **GIVEN** a session whose expiry is in the past
- **WHEN** its token is presented
- **THEN** the request is refused with status `401`

#### Scenario: A revoked session is refused immediately

- **GIVEN** a session that has been revoked but not yet expired
- **WHEN** its token is presented
- **THEN** the request is refused with status `401`
- **AND** the refusal does not wait for the expiry instant

#### Scenario: Revocation takes effect on the very next request

- **GIVEN** a session used successfully on one request
- **WHEN** that session is revoked and the next request presents the same token
- **THEN** the next request is refused

### Requirement: Logout Terminates The Presented Session

The logout endpoint SHALL revoke the session identified by the presented credential, and SHALL
cause subsequent presentation of that credential to be refused.

#### Scenario: Logging out ends the session

- **GIVEN** an authenticated caller
- **WHEN** it logs out
- **THEN** its session is revoked
- **AND** presenting the same token again is refused

#### Scenario: Logout revokes only the presented session

- **GIVEN** one account signed in from two devices, each with its own session
- **WHEN** one device logs out
- **THEN** the other device's session remains valid

### Requirement: Membership Is Re-Evaluated On Every Request

A session SHALL NOT confer access on its own. Every authenticated request SHALL confirm that the
account still holds an active membership in the session's tenant, so that deactivating an account
takes effect without waiting for expiry.

#### Scenario: Deactivated membership loses access at once

- **GIVEN** a valid, unexpired session for a membership that has been deactivated
- **WHEN** its token is presented
- **THEN** the request is refused

### Requirement: Authentication Failures Fail Closed

When the session store cannot be consulted, the application SHALL refuse authenticated requests
rather than admitting them, and SHALL NOT degrade to an unauthenticated or anonymous state.

#### Scenario: An unreadable session store refuses access

- **GIVEN** the session store cannot be read
- **WHEN** a request presents a session credential
- **THEN** the request is refused
- **AND** the failure is not reported as an anonymous success

### Requirement: Programmatic Clients Use The Same Credential

The application SHALL accept an opaque session token presented as a bearer credential on the same
endpoints that accept a browser cookie, so that API and CLI clients share the identity system
rather than a second one.

#### Scenario: A bearer credential authenticates a programmatic client

- **GIVEN** a valid session token
- **WHEN** it is presented as a bearer credential on a protected endpoint
- **THEN** the request is authenticated as that session's account and tenant

#### Scenario: A bearer credential is refused when invalid

- **WHEN** an invalid token is presented as a bearer credential
- **THEN** the request is refused with status `401`

### Requirement: No Unauthenticated File-Read Path Exists

The application SHALL NOT expose any endpoint that returns file content, file metadata, or a
listing of tenant-owned resources to a caller that has not been authenticated.

#### Scenario: Every file-serving endpoint requires a credential

- **WHEN** the endpoints that read file content or enumerate tenant-owned entries are enumerated
- **THEN** every one of them requires an authenticated session
- **AND** no exception is made for previews, downloads, archives or listings

#### Scenario: An anonymous caller learns nothing about tenant content

- **GIVEN** a caller presenting no credential
- **WHEN** it requests a tenant-owned file path, a listing, or a resource identifier
- **THEN** the response is refused with status `401`
- **AND** the response body reveals no file name, no path, and no tenant name