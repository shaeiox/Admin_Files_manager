# Spec Delta

## Purpose

Cross-cutting HTTP API hardening: the CORS posture, rate limiting, the
Content-Security-Policy, upload resource governance, download-header hygiene,
and metadata-store schema integrity.

## ADDED Requirements

### Requirement: CORS Is Same-Origin By Default

The API SHALL NOT emit `Access-Control-Allow-Origin` or answer a permissive
CORS preflight unless cross-origin access is explicitly enabled through the
configuration environment.

#### Scenario: Default deployment answers no cross-origin request

- **WHEN** `AFM_CORS_ENABLED` is unset or `false`
- **THEN** a `GET` carries no `Access-Control-Allow-Origin` header
- **AND** an `OPTIONS` preflight for a mutating route from a foreign origin is
  not answered with permissive `Access-Control-Allow-*` headers

#### Scenario: An allowed origin is reflected

- **WHEN** `AFM_CORS_ENABLED=true` and the request `Origin` is in
  `AFM_CORS_ALLOWED_ORIGINS`
- **THEN** the response carries `Access-Control-Allow-Origin: <origin>`
- **AND** `Vary: Origin` is present

#### Scenario: A disallowed origin is not reflected

- **WHEN** `AFM_CORS_ENABLED=true` and the request `Origin` is not in the
  allowlist
- **THEN** the response carries no `Access-Control-Allow-Origin` header

#### Scenario: A malformed allowlist entry fails startup

- **WHEN** `AFM_CORS_ALLOWED_ORIGINS` contains a relative URL, a scheme-relative
  value, a wildcard, a duplicate, or a value with a path component
- **THEN** configuration validation reports a problem and the server does not
  accept connections

#### Scenario: Wildcards are refused in production

- **WHEN** `NODE_ENV=production` and the only allowed origin is `*`
- **THEN** configuration validation reports a problem

### Requirement: Mutating Routes Are Rate Limited

Every mutating route SHALL answer with a rate-limit response once a single
client exceeds its allowance; read routes SHALL remain available within their
own, separate allowance.

#### Scenario: A burst of mutations is throttled

- **WHEN** one client exceeds the mutating-route allowance
- **THEN** subsequent mutating requests from that client are refused with the
  configured rate-limit status
- **AND** the same client's read requests continue until its read allowance is
  reached

#### Scenario: Proxy forwarding is the key basis

- **WHEN** the request transits the deployed nginx proxy
- **THEN** rate-limit keying uses the forwarded client address at the documented
  hop count
- **AND** direct header spoofing beyond that trust boundary does not bypass the
  per-client key

### Requirement: A Content-Security-Policy Is Enabled

The API and the SPA shell SHALL be served with a Content-Security-Policy that
forbids inline scripts and restricts sources to the same origin.

#### Scenario: Document responses carry a policy

- **WHEN** any document request is answered
- **THEN** a `Content-Security-Policy` header is present
- **AND** its script policy is `'self'` with no `'unsafe-inline'`

#### Scenario: The page markup is CSP-compatible

- **WHEN** any of the four page shells is served
- **THEN** the shell contains no inline `<script>` element and no inline event
  handler attribute

### Requirement: Uploads Are Governed By Free Space And Concurrency

An upload SHALL be refused before any staging byte is written when free space
in the storage root falls below the configured watermark, and a burst of
uploads from one client SHALL be throttled.

#### Scenario: Low free space refuses early

- **GIVEN** free space in the storage root below the configured watermark
- **WHEN** an upload is accepted for placement
- **THEN** the request is refused before any `.upload-*.part` staging file is
  created
- **AND** the response is the upload-error envelope

#### Scenario: Excess concurrent uploads are throttled

- **WHEN** one client exceeds the configured concurrent-upload allowance
- **THEN** additional uploads from that client are refused with the configured
  throttling status

### Requirement: The Download Content-Disposition Name Is Valid

The download `Content-Disposition` header SHALL derive from a name that
satisfies the filename rules, so a control character or illegal name never
reach a server response header.

#### Scenario: An exotic-but-legal filename is refused, not a 500

- **GIVEN** a file whose name contains a control character or otherwise fails
  the filename rules
- **WHEN** it is requested for download
- **THEN** the request is refused with a client-error status
- **AND** no response header is built from the raw name

#### Scenario: A normal name yields a well-formed header

- **WHEN** a valid file is downloaded
- **THEN** the `Content-Disposition` header carries both the quoted `filename=`
  form and the encoded `filename*=UTF-8''` form

### Requirement: The Health Endpoint Does Not Disclose The Runtime Environment

`GET /api/v1/health` SHALL report the API contract version, and SHALL NOT
report `NODE_ENV` to an unauthenticated caller.

#### Scenario: Anonymous callers see the contract version only

- **WHEN** `GET /api/v1/health` is requested without a credential
- **THEN** the response includes `apiVersion`
- **AND** the response does not include a value that reveals the runtime
  environment

### Requirement: The Metadata Store Is Shape-Validated On Read

The metadata store SHALL be normalised to its documented shape on every read,
and client paths rooted at a non-`/` origin SHALL be rejected before they can
index the store.

#### Scenario: A missing section is repaired to empty

- **WHEN** the store file is missing `starred` or `activities`
- **THEN** the reader treats them as empty rather than indexing `undefined`

#### Scenario: An unrooted client path cannot reach the store

- **WHEN** a caller supplies a client path that does not begin with `/`
- **THEN** validation rejects it with a client-error status
- **AND** the request never reaches the metadata store
