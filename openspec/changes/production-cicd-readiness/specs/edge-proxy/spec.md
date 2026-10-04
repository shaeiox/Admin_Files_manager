# Spec Delta

## Purpose

Specifies the reverse proxy that sits in front of the application: the request-size and timeout
ceilings it must not impose below the application's own limits, how it forwards client identity to
the application, and where it must not duplicate behaviour the application already provides.

## ADDED Requirements

### Requirement: Proxy Request Size Is Not Lower Than The Application Limit

The proxy's maximum accepted request body size SHALL be greater than or equal to the application's
own upload limit. A request the application would accept SHALL NOT be rejected by the proxy.

#### Scenario: A maximum-size upload reaches the application

- **WHEN** an upload at exactly the application's configured limit is sent through the proxy
- **THEN** the proxy forwards it
- **AND** the application, not the proxy, decides whether to accept it

#### Scenario: The default proxy ceiling is not inherited silently

- **WHEN** the proxy is deployed without an explicit body-size ceiling
- **THEN** the resulting ceiling is recorded as a deployment defect
- **AND** it is documented as such rather than accepted as the default

#### Scenario: Size rejection is attributed correctly

- **WHEN** a request is rejected for exceeding a size ceiling
- **THEN** the rejection is attributable to a known ceiling with a known owner

### Requirement: Proxy Timeouts Exceed The Longest Legitimate Request

The proxy's request-body and response-read timeouts SHALL be longer than the longest request the
application is expected to serve, so that a large upload or a large archive download is not severed
mid-transfer by the proxy.

#### Scenario: A long upload is not severed

- **WHEN** an upload takes longer than a typical web request but within the documented ceiling
- **THEN** the proxy does not terminate it
- **AND** the transfer completes

#### Scenario: A long archive download is not severed

- **WHEN** a multi-file archive download is in progress
- **THEN** the proxy does not terminate the response mid-stream

#### Scenario: Proxy and application stop ordering is consistent

- **WHEN** the proxy's read timeout and the application's graceful-shutdown grace period are
  compared
- **THEN** the proxy will not sever a request that the application is still legitimately serving
  within its own shutdown grace period

### Requirement: Request Bodies Are Not Duplicated In Proxy Buffers

The proxy SHALL NOT fully buffer a large request body in its own temporary storage before forwarding
it, because the application already streams uploads to its own staging file inside the storage root.

#### Scenario: A large upload streams through

- **WHEN** a large upload is sent through the proxy
- **THEN** its bytes are forwarded to the application as they arrive
- **AND** no second full copy is written to proxy-owned temporary storage

#### Scenario: Proxy temporary storage is not the upload bottleneck

- **WHEN** upload throughput is measured
- **THEN** no limit is imposed by proxy-side buffering ahead of the application's own limit

### Requirement: Client Identity Is Forwarded

The proxy SHALL forward the information the application needs to describe the client connection,
and SHALL set the header that identifies the scheme the client used.

#### Scenario: Client address reaches the application

- **WHEN** a request is served through the proxy
- **THEN** the application can identify the originating client address from forwarded headers

#### Scenario: The forwarded chain is additive

- **WHEN** a request arrives through an additional proxy
- **THEN** the forwarding headers accumulate rather than overwrite the original client address

#### Scenario: Scheme is forwarded

- **WHEN** a request arrives over TLS
- **THEN** the application can determine that the client used TLS from a forwarded header

### Requirement: The Proxy Does Not Duplicate Single-Page-Application Fallback Behaviour

The proxy SHALL serve only the application's own static assets and API paths, and SHALL NOT
implement its own fallback that returns the application shell for unmatched paths. The application
already owns that behaviour.

#### Scenario: Unknown non-API paths reach the application

- **WHEN** a client requests a path that is not a static asset
- **THEN** the proxy forwards it to the application
- **AND** the application's own fallback decides what to serve

#### Scenario: The application shell is never served by the proxy directly

- **WHEN** the proxy handles a request
- **THEN** it does not return the application shell from its own configuration

### Requirement: Transport Security Is Terminated At The Proxy

The proxy SHALL be the point where TLS is terminated, and SHALL redirect plain HTTP to it, so that
the application's own port is never required to be exposed to the internet for the application to be
reachable securely.

#### Scenario: Plain HTTP is redirected

- **WHEN** a client requests the service over plain HTTP
- **THEN** it is redirected to the encrypted scheme

#### Scenario: The application port is not internet-facing

- **WHEN** the host's exposed ports are inspected
- **THEN** the application's own listening port is not reachable from outside the host

### Requirement: Proxy Configuration Is Version Controlled

The proxy configuration SHALL be stored in the repository as a reviewed, deployable artifact rather
than hand-typed on a host, so that a host's proxy behaviour is reproducible and diffable.

#### Scenario: A new host is configured from a committed artifact

- **WHEN** a second host is provisioned
- **THEN** its proxy configuration is applied from the repository's artifact
- **AND** no configuration is retyped by hand

#### Scenario: Configuration is validated before being applied

- **WHEN** proxy configuration is applied
- **THEN** it is validated first
- **AND** an invalid configuration is not applied