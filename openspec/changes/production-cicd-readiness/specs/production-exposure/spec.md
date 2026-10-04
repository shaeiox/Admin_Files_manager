# Spec Delta

## Purpose

Specifies the host-level posture required before the service is reachable by anyone but its operator:
which interface it binds, how the host firewall limits it, where TLS is terminated, and the
explicit statement that public exposure remains blocked on authentication landing first.

## ADDED Requirements

### Requirement: The Application Port Is Not Exposed To The Internet

The host SHALL prevent the application's own listening port from being reachable from outside the
host, and the only supported public entry point SHALL be the reverse proxy.

#### Scenario: Only the proxy ports are reachable

- **WHEN** the host's externally reachable ports are enumerated
- **THEN** they are the encrypted web ports served by the proxy
- **AND** the application's own port is not among them

#### Scenario: The application is reachable only from the host itself

- **WHEN** a request is made to the application's port from outside the host
- **THEN** it does not reach the service

### Requirement: Binding Is Addressed Explicitly Rather Than Left To Default

The interface the application binds SHALL be a deliberate, documented decision. Where the
application's bind address is not configurable, that limitation SHALL be recorded and the host
firewall SHALL be documented as the compensating control.

#### Scenario: The bind behaviour is documented

- **WHEN** an operator reads the deployment documentation
- **THEN** it states which interfaces the application binds
- **AND** it states whether that is configurable

#### Scenario: A default bind of all interfaces is recorded as a risk

- **WHEN** the application binds every interface by default
- **THEN** the exposure this creates is recorded
- **AND** a compensating control is specified

### Requirement: The Host Firewall Defaults To Deny

The host firewall SHALL default to denying unsolicited inbound traffic and SHALL permit only the
ports the deployment requires, including remote administration access.

#### Scenario: Only required ports are permitted

- **WHEN** the host firewall rules are inspected
- **THEN** the permitted inbound ports are limited to the proxy ports and the administration port

#### Scenario: Enabling the firewall is part of provisioning

- **WHEN** a host is provisioned
- **THEN** firewall enforcement is enabled as part of that provisioning
- **AND** it is not an optional later hardening step

### Requirement: Authentication Is A Precondition For Public Exposure

The service SHALL NOT be described as production-ready for public reachability while it remains
unauthenticated. Public exposure SHALL be gated on authentication being implemented, and the gate
SHALL be stated in the deployment documentation rather than left implicit.

#### Scenario: The gap is stated, not worked around

- **WHEN** the deployment documentation describes exposing the service
- **THEN** it states that the API is unauthenticated and that this blocks public exposure

#### Scenario: Access restriction is the interim control, and is stated to be interim

- **WHEN** the interim network restriction is described
- **THEN** it is documented as a compensating control that does not replace authentication
- **AND** its limitation is stated

#### Scenario: This change does not claim to close the gap

- **WHEN** the deployment documentation is reviewed after this change
- **THEN** it does not assert that the service is safe to expose publicly

### Requirement: Cross-Origin Policy Is Recorded As An Open Exposure

The service's permissive cross-origin policy SHALL be recorded as a known exposure with a named
owner, and the deployment documentation SHALL state that it is unchanged by the deployment work.

#### Scenario: The policy is documented, not silently inherited

- **WHEN** the deployment documentation describes the service's HTTP posture
- **THEN** it states that any origin is currently admitted
- **AND** it identifies this as an open item

#### Scenario: Content security policy status is documented

- **WHEN** the deployment documentation describes the HTTP security headers
- **THEN** it states that the content security policy is disabled and why the deployment does not
  change that

### Requirement: Browser-Only Admin Surface Is Not Reachable As A Data Service

Because the deployment exposes the service over HTTP, the documentation SHALL state which client
origins are supported and that no programmatic client is authenticated, so an operator does not
build an integration against an endpoint that has no access control.

#### Scenario: Supported access is stated

- **WHEN** an operator considers integrating with the service
- **THEN** the documentation states that the service is a browser admin surface with no
  authentication
- **AND** it does not present the API as a supported integration surface