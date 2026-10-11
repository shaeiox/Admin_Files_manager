# Spec Delta

## Purpose

Defines server-side session authentication for this application: credential storage, session
issuance and revocation, CSRF defense, login throttling, and the two accepted credential
transports (cookie and bearer token).

## ADDED Requirements

### Requirement: Credentials Are Never Stored Or Logged In Plaintext

A user's password SHALL be stored only as a salted, memory-hard hash. A session token SHALL be
stored only as a hash of the token; the raw token exists only in transit and in the client's
possession. Neither a password nor a raw session token SHALL appear in a log line, error message,
or audit record.

#### Scenario: A password is never stored in plaintext

- **WHEN** the `users` table is inspected
- **THEN** no column contains a plaintext or reversibly-encrypted password

#### Scenario: A session token is never stored in plaintext

- **WHEN** the `sessions` table is inspected
- **THEN** it contains only a hash of each token, never the raw value

#### Scenario: A login failure's audit record contains no credential value

- **WHEN** a login attempt fails and is recorded in `audit_logs`
- **THEN** the record names the attempted username but never the attempted password

### Requirement: Session Issuance Uses An Opaque, High-Entropy Token

A successful login SHALL issue a new session backed by a cryptographically random, high-entropy
opaque token, delivered once in the response. The server SHALL be able to revoke a specific session
or every session belonging to a user without depending on a client to discard anything.

#### Scenario: A successful login issues a new session

- **WHEN** a correct username and password are submitted
- **THEN** a new session row is created with an expiry
- **AND** the raw token is returned exactly once, in the login response

#### Scenario: Logout revokes exactly one session

- **WHEN** a user logs out
- **THEN** that session's `revoked_at` is set
- **AND** a request later presenting that same token is refused

#### Scenario: An administrator can revoke every session for a user

- **WHEN** an administrator revokes a user's sessions
- **THEN** every currently-active session for that user is marked revoked
- **AND** a subsequent request using any of those tokens is refused

### Requirement: Two Credential Transports Are Accepted For The Same Session

The browser-facing transport SHALL be an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in
production). The same opaque token SHALL also be accepted as an `Authorization: Bearer` header for
non-browser clients. Both transports resolve to the same session record.

#### Scenario: A cookie-presented token authenticates a request

- **WHEN** a request carries the session cookie
- **THEN** it is treated as authenticated as that session's user

#### Scenario: A bearer-presented token authenticates a request with no cookie

- **WHEN** a request carries `Authorization: Bearer <token>` and no session cookie
- **THEN** it is treated as authenticated as that session's user

#### Scenario: An expired or revoked token is rejected regardless of transport

- **GIVEN** a session that is expired or revoked
- **WHEN** its token is presented by either transport
- **THEN** the request is refused with `401`

### Requirement: CSRF Defense Covers Every Non-GET Request

Every state-changing request SHALL require a session-bound CSRF token presented in a request
header, independent of the cookie. A request missing or presenting a mismatched token SHALL be
refused before any mutation occurs.

#### Scenario: A mutating request with no CSRF header is refused

- **WHEN** an authenticated POST/PUT/DELETE request carries no CSRF header
- **THEN** it is refused with `403` before any state change

#### Scenario: A mutating request with the correct CSRF header succeeds

- **WHEN** an authenticated POST/PUT/DELETE request carries the session's current CSRF token
- **THEN** the request proceeds to its handler

#### Scenario: A GET request needs no CSRF header

- **WHEN** an authenticated GET request is made
- **THEN** it is not refused for lacking a CSRF header

### Requirement: Repeated Login Failures Are Throttled

The login route SHALL throttle repeated failures keyed by request origin, active from the moment
the route exists, reusing the application's existing rate-limiting mechanism rather than a second
one.

#### Scenario: Repeated failed logins from one origin are throttled

- **GIVEN** a number of failed login attempts from one client within the throttle window
- **WHEN** the throttle threshold is exceeded
- **THEN** further login attempts from that origin are refused until the window resets

#### Scenario: A throttled response does not distinguish account existence

- **WHEN** a login attempt is throttled
- **THEN** the response does not reveal whether the submitted username exists

### Requirement: Account Existence Is Not Disclosed By A Failed Login

A failed login SHALL return the identical response whether the username does not exist or the
password is wrong.

#### Scenario: A nonexistent username and a wrong password look identical

- **GIVEN** one login attempt with a nonexistent username and one with a valid username and wrong
  password
- **WHEN** both are submitted
- **THEN** both receive the same status code and the same response body shape

### Requirement: A Disabled Account's Sessions Stop Working Immediately

Setting a user's status to `disabled` SHALL invalidate that user's ability to authenticate on
their next request, without waiting for session expiry.

#### Scenario: A disabled user's existing session is refused on its next use

- **GIVEN** a user with an active session who is then disabled
- **WHEN** a request presents that session's token
- **THEN** the request is refused with `401`

#### Scenario: A disabled user cannot log in again

- **GIVEN** a disabled user
- **WHEN** they submit correct credentials
- **THEN** the login is refused, and the response does not imply the password was wrong
