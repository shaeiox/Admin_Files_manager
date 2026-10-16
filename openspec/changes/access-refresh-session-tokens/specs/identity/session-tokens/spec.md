# Spec Delta

## Purpose

Defines the credential lifecycle of a signed-in session: the separation of a short-lived
access token from a long-lived refresh token, the lifetimes and hard absolute cap that bound
them, the rotation and reuse detection that protect a long-lived refresh token, the device
proof that binds it to a key the client cannot extract, and the two `HttpOnly` transports
that carry them.

## ADDED Requirements

### Requirement: A Session Grants Two Distinct Credentials

A successful authentication SHALL grant exactly two credentials: an **access token** that
authorizes API calls, and a **refresh token** whose only permitted use is obtaining a new
access token. A refresh token SHALL never be accepted as a credential that authorizes an API
call.

#### Scenario: An access token authorizes an API call

- **WHEN** a request presents a valid, unexpired access token
- **THEN** it is treated as authenticated as that session's user

#### Scenario: A refresh token presented as an API credential is refused

- **WHEN** a request presents a refresh token as its access credential
- **THEN** it is refused with `401`

#### Scenario: A refresh token obtains a new access token only at the refresh endpoint

- **WHEN** a valid refresh token is presented to the refresh endpoint with a valid device proof
- **THEN** a new access token is issued
- **AND** no other endpoint accepts the refresh token

### Requirement: Access Tokens Are Short-Lived And Bounded By Configuration

An access token SHALL expire no later than its stated lifetime, which SHALL default to 15
minutes and SHALL be configurable up to a maximum of 1 hour. A configured value outside that
range SHALL be refused at startup rather than silently clamped.

#### Scenario: The default access-token lifetime is fifteen minutes

- **WHEN** a session is granted an access token and no access-token lifetime is configured
- **THEN** the token expires 15 minutes after it was issued

#### Scenario: An access token past its lifetime is refused

- **GIVEN** an access token older than its lifetime
- **WHEN** it is presented to authorize a request
- **THEN** the request is refused with `401`

#### Scenario: An out-of-range access-token lifetime is refused at startup

- **WHEN** the configured access-token lifetime exceeds 1 hour
- **THEN** the service refuses to start and names the out-of-range setting

### Requirement: Refresh Tokens Are Long-Lived And Bounded By Configuration

A refresh token SHALL expire no later than its stated lifetime, which SHALL default to 30 days
and SHALL be configurable up to a maximum of 1 year. A configured value outside that range
SHALL be refused at startup rather than silently clamped.

#### Scenario: The default refresh-token lifetime is thirty days

- **WHEN** a session is granted a refresh token and no refresh-token lifetime is configured
- **THEN** the token expires 30 days after it was issued

#### Scenario: An expired refresh token cannot obtain an access token

- **GIVEN** a refresh token older than its lifetime
- **WHEN** it is presented to the refresh endpoint
- **THEN** no access token is issued and the response is refused with `401`

#### Scenario: An out-of-range refresh-token lifetime is refused at startup

- **WHEN** the configured refresh-token lifetime exceeds 1 year
- **THEN** the service refuses to start and names the out-of-range setting

### Requirement: A Session Has A Hard Absolute Expiry That Rotation Never Extends

Every session SHALL carry an absolute expiry stamped when the session is first created. No
activity, refresh, or rotation SHALL extend it. Presenting any credential of a session past
its absolute expiry SHALL be refused.

#### Scenario: A session past its absolute expiry is refused

- **GIVEN** a session whose absolute expiry has passed, still holding a refresh token that has
  not itself expired
- **WHEN** that refresh token is presented
- **THEN** no new access token is issued and the response is refused with `401`

#### Scenario: Activity does not move the absolute expiry

- **GIVEN** a session actively used and refreshed repeatedly
- **WHEN** its absolute expiry is read
- **THEN** it equals the value stamped when the session was first created

### Requirement: Every Refresh Token Use Rotates The Token

Each successful refresh SHALL issue a new refresh token and mark the presented one used in the
same operation, so that at most one successor of any given refresh token exists.

#### Scenario: A refresh issues a new refresh token

- **WHEN** a refresh succeeds
- **THEN** a new refresh token is issued
- **AND** the presented refresh token is marked used

#### Scenario: The newest refresh token is the only one that works

- **WHEN** a refresh token that has already been rotated is presented outside the grace window
- **THEN** the refresh is refused with `401`

### Requirement: A Rotated Refresh Token Is Tolerated Inside A Short Grace Window

To survive a retried or duplicated request, a refresh token that was superseded moments ago
SHALL still be accepted during a short grace window and SHALL yield a usable successor rather
than failing the client. The window SHALL run from the token's first use; retries within it
SHALL neither extend nor reset it. Outside that window it SHALL be treated as reuse.

#### Scenario: A retry inside the grace window still yields a usable token

- **GIVEN** a refresh token rotated within the grace window
- **WHEN** it is presented again with the same valid device proof
- **THEN** the refresh succeeds and the client ends up holding a usable refresh token
- **AND** the session's token family is left intact

#### Scenario: A retry does not extend the grace window

- **GIVEN** a refresh token first used at time T and retried inside the window
- **WHEN** it is presented again after T plus the grace window
- **THEN** it is treated as reuse, even though the previous retry was recent

#### Scenario: A replay outside the grace window is refused

- **GIVEN** a refresh token rotated longer ago than the grace window
- **WHEN** it is presented again
- **THEN** the request is refused with `401`

### Requirement: Reuse Outside The Grace Window Revokes The Entire Token Family

When a refresh token already superseded beyond the grace window is presented, the server
SHALL treat it as evidence of theft and revoke every token in that session's family, so that
neither the stolen token nor its legitimate successor can obtain an access token.

#### Scenario: A stolen superseded token kills the whole session

- **GIVEN** a session whose refresh token was rotated beyond the grace window
- **WHEN** the superseded token is presented again
- **THEN** every refresh token in that session's family is revoked
- **AND** the most recent refresh token can no longer obtain an access token

#### Scenario: The theft is recorded

- **WHEN** reuse outside the grace window revokes a token family
- **THEN** the revocation is recorded with a reason identifying token reuse
- **AND** the record names no credential value

### Requirement: A Refresh Requires A Proof Signed By A Non-Extractable Device Key

The refresh endpoint SHALL require a proof signed by a private key the client cannot export,
SHALL bind that key to the session when the session is created, and SHALL refuse any proof
that does not verify against the key bound to the session presenting it. No client may
refresh without a proof, and a session's bound key never changes.

#### Scenario: A refresh with a valid proof succeeds

- **WHEN** a refresh presents a proof signed by the key bound to its session
- **THEN** the proof verifies and the refresh proceeds

#### Scenario: A refresh with no proof is refused

- **WHEN** a refresh presents no proof
- **THEN** the refresh is refused with `401`
- **AND** no token is issued

#### Scenario: A proof signed by a different key is refused

- **GIVEN** a refresh token bound to one device key
- **WHEN** the refresh presents a proof signed by another key
- **THEN** the refresh is refused with `401`

#### Scenario: A copied refresh token cannot be used without the device key

- **GIVEN** an attacker holds a valid, unexpired refresh token
- **WHEN** the attacker refreshes without the bound device key
- **THEN** the refresh is refused

### Requirement: Every Token Is Opaque And Judged By The Database

Every access token and refresh token SHALL be a cryptographically random opaque value whose
only persisted form is a hash. No token SHALL be self-describing or self-verifying. Whether a
token is valid SHALL be decided by a database record, never by the browser's possession of a
cookie.

#### Scenario: Only a hash of each token is stored

- **WHEN** the token store is inspected
- **THEN** every row holds a hash and no raw token value

#### Scenario: A cookie alone does not authenticate

- **GIVEN** a browser holding a cookie whose token has been revoked server-side
- **WHEN** it calls the API
- **THEN** the request is refused with `401`

### Requirement: Revoking A Session Invalidates Both Token Kinds Immediately

Revoking a session SHALL take effect on the next request that presents any of its
credentials, without waiting for any token's stated lifetime to elapse. This SHALL hold for
access tokens that were issued moments earlier.

#### Scenario: A just-issued access token dies with its session

- **GIVEN** a session whose access token was issued seconds ago
- **WHEN** the session is revoked and that access token is presented
- **THEN** the request is refused with `401`

#### Scenario: Logout revokes the session's whole token family

- **WHEN** a user logs out
- **THEN** every refresh token in that session's family is revoked
- **AND** the session's access tokens stop being accepted on the next request

### Requirement: Disabling A User Revokes Every One Of That User's Sessions

Setting a user's status to a non-active value SHALL revoke every token family belonging to
that user, and SHALL prevent the user from authenticating again.

#### Scenario: A disabled user's in-flight access token stops working

- **GIVEN** a user with an active session who is then disabled
- **WHEN** a request presents that session's access token
- **THEN** the request is refused with `401`

#### Scenario: A disabled user cannot refresh a long session back to life

- **GIVEN** a disabled user holding an unexpired refresh token
- **WHEN** the refresh endpoint is called
- **THEN** no access token is issued and the response is refused with `401`

### Requirement: The Access Credential Is Delivered Only As A Cookie Or Bearer Header

The access credential SHALL reach a browser only through an `HttpOnly` cookie, so that
script on the page cannot read it, and SHALL reach non-browser clients only through an
`Authorization: Bearer` header. It SHALL NOT be placed in any response body or in any
script-readable storage.

#### Scenario: The access cookie is not readable by script

- **WHEN** a session cookie is issued
- **THEN** it carries the `HttpOnly` attribute

#### Scenario: Access cookies on a secure request are marked secure

- **GIVEN** the request arrived over a scheme the server resolved as secure (directly, or via
  `X-Forwarded-Proto` from the one trusted proxy hop)
- **WHEN** the access cookie is issued
- **THEN** it carries the `Secure` attribute

#### Scenario: A plain-HTTP origin still receives a working cookie

- **GIVEN** the request arrived over plain HTTP
- **WHEN** the access cookie is issued
- **THEN** it does not carry the `Secure` attribute
- **AND** the browser sends it back on the next request

#### Scenario: A cross-site form submission does not carry the cookie

- **WHEN** a mutating request originates from another site
- **THEN** the access cookie is not attached to it by the browser

#### Scenario: The login response body carries no access credential

- **WHEN** authentication succeeds
- **THEN** the response body contains no access token and no refresh token

### Requirement: The Refresh Cookie Is Scoped To The Authentication Endpoints

The refresh token SHALL be delivered in its own `HttpOnly` cookie whose path is restricted to
the authentication endpoints, so that it is not attached to ordinary API calls. It SHALL carry
a stricter same-site policy than the access cookie.

#### Scenario: The refresh cookie is not sent with ordinary API calls

- **WHEN** the browser calls a non-authentication API endpoint
- **THEN** the refresh cookie is not attached to that request

#### Scenario: The refresh cookie is sent to the refresh endpoint

- **WHEN** the browser calls the refresh endpoint
- **THEN** the refresh cookie is attached to that request

#### Scenario: The refresh cookie is not readable by script

- **WHEN** the refresh cookie is issued
- **THEN** it carries the `HttpOnly` attribute

### Requirement: A Client Renews Transparently Once, Then Falls Back To The Login Page

When an API call is refused because the access token expired, the client SHALL make at most
one attempt to obtain a new access token and, on success, replay the original call once. If
that renewal does not succeed, the client SHALL send the user to the login page. The renewal
attempt SHALL NOT repeat indefinitely.

#### Scenario: An expired access token is renewed and the call is replayed

- **GIVEN** a session whose access token has expired but whose refresh token is valid
- **WHEN** the client makes an API call
- **THEN** the call is transparently renewed and then completed successfully

#### Scenario: An unrenewable session sends the user to login

- **GIVEN** a session that cannot be renewed
- **WHEN** the client makes an API call
- **THEN** the user is taken to the login page
- **AND** the page they were trying to reach is preserved as the destination

#### Scenario: Renewal is attempted at most once per call

- **WHEN** a call fails after a renewal attempt
- **THEN** the client does not attempt renewal again for that call

#### Scenario: A download transport that cannot observe a 401 is not renewed

- **GIVEN** an access token that has expired and no API call since
- **WHEN** a download starts through a hidden iframe or hidden form, which cannot observe a `401`
- **THEN** the client does not renew the session for that download and the download fails
- **AND** the user must make an API call first, which renews the session

### Requirement: The Token Lifetime Policy Is Stated

The application's documentation SHALL state the access-token lifetime, the refresh-token
lifetime, the hard absolute session cap, the reuse grace window, and the point at which a user
must re-enter credentials.

#### Scenario: The lifetime policy is documented

- **WHEN** the authentication documentation is read
- **THEN** it states the access-token lifetime, the refresh-token lifetime, the absolute cap,
  the grace window, and the re-authentication point

### Requirement: The Refresh Endpoint Is Rate-Limited

The refresh endpoint SHALL be rate-limited per client origin, reusing the application's
existing rate-limiting mechanism rather than a second one, with a stated default budget
(30 per minute) overridable by configuration.

#### Scenario: Exceeding the refresh budget is refused

- **WHEN** a client exceeds the refresh budget within the window
- **THEN** the request is refused with `429` and a `Retry-After` header

#### Scenario: A refresh inside the budget succeeds

- **WHEN** a client refreshes with a valid token and proof inside the budget
- **THEN** the refresh succeeds

#### Scenario: A throttled response does not disclose token validity

- **WHEN** the budget is exceeded
- **THEN** a valid and an invalid refresh token receive the identical `429` response
