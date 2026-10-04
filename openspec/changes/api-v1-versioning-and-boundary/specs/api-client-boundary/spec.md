# Spec Delta

## Purpose

Defines the frontend's side of the API boundary: that one module is the only egress to the server,
that the server's base URL is resolved configuration rather than a hardcoded literal, and that every
API URL — including image and download URLs — is constructed inside the boundary so that relocating
the API is a configuration change and not a source rewrite.

## ADDED Requirements

### Requirement: One Client Egress

All API requests from the frontend SHALL be issued through the single API client module. No page
module, shared chrome module, or page shell SHALL issue an API request by any other means.

#### Scenario: Page modules issue no direct requests

- **WHEN** every frontend module other than the API client is inspected
- **THEN** none of them performs a network request to an API path
- **AND** each communicates with the server only through the API client's exported surface

#### Scenario: No hardcoded API prefix outside the boundary

- **GIVEN** the API's base path is changed
- **WHEN** the frontend is served
- **THEN** no module other than the API client contains the API prefix as a literal
- **AND** every call reaches the new prefix

#### Scenario: Static page navigation is not an API call

- **GIVEN** the client-side router retrieves a page shell
- **WHEN** that retrieval is classified
- **THEN** it is a retrieval of static application markup and not a call to a versioned API endpoint
- **AND** it is therefore not subject to the API base-URL configuration

### Requirement: Base URL Is Resolved Configuration

The API client's base URL SHALL be resolved at load time from an explicit configuration source when
one is present, and SHALL fall back to a documented default otherwise. The resolved value SHALL be
exposed as the client's base URL for consumers that need to build a URL.

#### Scenario: An explicit override is honoured

- **GIVEN** the document declares an API base URL before the client module is evaluated
- **WHEN** the client module initialises
- **THEN** the resolved base URL is the declared value
- **AND** every subsequent request is issued against it

#### Scenario: The default applies when nothing is declared

- **GIVEN** the document declares no API base URL
- **WHEN** the client module initialises
- **THEN** the resolved base URL is the versioned same-origin default
- **AND** the frontend functions without any configuration

#### Scenario: Resolution happens once, not per request

- **WHEN** the resolved base URL is read after initialisation
- **THEN** it is the same value the client used to build its first request
- **AND** it does not change between requests within one document

#### Scenario: A trailing separator in the override does not produce a doubled separator

- **GIVEN** the declared API base URL ends with a slash
- **WHEN** a request path is appended to it
- **THEN** exactly one separator appears between the base URL and the request path

#### Scenario: A malformed or empty override falls back rather than breaking the client

- **GIVEN** the declared API base URL is empty or whitespace only
- **WHEN** the client module initialises
- **THEN** the default is used
- **AND** the client does not issue requests against an empty prefix

### Requirement: Default Deployment Remains Same-Origin

The default API base URL SHALL be a root-relative path on the same origin that serves the
application. Configuring a different host SHALL NOT be a prerequisite for this change to function.

#### Scenario: No configuration is required in the shipped configuration

- **WHEN** the application is served with no API base URL declared
- **THEN** all API traffic is same-origin
- **AND** no cross-origin request is made
- **AND** no cross-origin permission is required from the browser

#### Scenario: A different host is not exercised by default

- **GIVEN** the shipped page shells
- **WHEN** they are inspected
- **THEN** they declare no absolute cross-origin API base URL

#### Scenario: Changing the base URL does not require a source change

- **GIVEN** the API is moved to a different host or path prefix
- **WHEN** only the configuration source is changed
- **THEN** the frontend addresses the new location
- **AND** no frontend module's request paths are edited

### Requirement: Every API URL Is Constructed Inside The Boundary

Every URL that addresses an API endpoint SHALL be produced by the API client. Consumers SHALL NOT
assemble API URLs by concatenating a base URL with a path.

#### Scenario: Image URLs are produced by the boundary

- **GIVEN** the frontend renders an element whose `src` addresses an API endpoint
- **WHEN** that URL is built
- **THEN** it is produced by the API client from the resolved base URL and an endpoint path
- **AND** the consumer does not concatenate the base URL itself

#### Scenario: Download URLs are produced by the boundary

- **GIVEN** the frontend triggers a file or archive download
- **WHEN** the request target is determined
- **THEN** it is produced by the API client
- **AND** no consumer assembles it from a base URL literal

#### Scenario: No consumer reads the base URL to build a path

- **WHEN** frontend modules are inspected
- **THEN** no module reads the client's base URL in order to append an endpoint path
- **AND** a change to the base URL cannot leave a stale hand-built URL behind

#### Scenario: A base-URL change moves every URL at once

- **GIVEN** the resolved base URL is changed
- **WHEN** every URL the frontend can produce is enumerated
- **THEN** all of them carry the new base URL
- **AND** none still points at the previous one

### Requirement: The Boundary Normalises Transport Failures

The API client SHALL attach the HTTP status, and a machine-readable failure kind when the server
supplied one, to every rejected request, so that consumers classify a failure without parsing prose.

#### Scenario: A failed request carries its status

- **WHEN** a request receives a response with a failing status
- **THEN** the rejection exposes that status
- **AND** a transport failure with no response exposes status `0`

#### Scenario: Consumers do not read message text to classify a failure

- **WHEN** a consumer decides what to show for a failure
- **THEN** it branches on the status or the machine-readable kind
- **AND** it does not match against the human-readable message text

#### Scenario: An absent machine-readable kind is not an error

- **GIVEN** the server sends an error envelope with no failure kind
- **WHEN** the client rejects the request
- **THEN** the rejection is still well-formed and carries its status
- **AND** the client does not invent, default or infer a kind
