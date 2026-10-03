# Upload Markup Escaping

## Purpose

Defines the requirement that every string originating outside the page's own static markup is escaped before insertion into HTML, so that a file name, a server message, or a stored path cannot introduce markup or script into the document.

## ADDED Requirements

### Requirement: File Names Are Escaped Before Insertion

Any file name originating from a browser `File` object or from the server SHALL be escaped before it is inserted into markup.

#### Scenario: A name containing markup characters renders as text

- **GIVEN** a file whose name contains markup-significant characters, such as angle brackets, quotes, or ampersands
- **WHEN** the upload queue renders that file's name
- **THEN** the name is rendered as text
- **AND** no element is created from the name
- **AND** no attribute boundary is broken by the name

#### Scenario: A name that would otherwise execute does not execute

- **GIVEN** a file whose name contains an inline event handler or a script-bearing construct
- **WHEN** the upload queue renders that file's name
- **THEN** nothing executes
- **AND** the name remains visible to the operator as literal text

#### Scenario: Rendering happens before server validation completes

- **GIVEN** a file name the server would reject
- **WHEN** the name is rendered into the queue
- **THEN** it is escaped
- **AND** client-side rendering does not rely on the server having validated it

#### Scenario: Every queue render path escapes

- **WHEN** a row is rendered for the first time, re-rendered on a state change, or patched in place during progress
- **THEN** the name is escaped on every one of those paths

### Requirement: Server-Derived Text Is Escaped Before Insertion

Any message, reason, path, or other text returned by the server SHALL be escaped before insertion into markup.

#### Scenario: An error message is rendered as text

- **WHEN** a failed item's server-supplied reason is rendered
- **THEN** it is rendered as text
- **AND** it cannot introduce markup into the row

#### Scenario: A server string containing markup is inert

- **GIVEN** a server response whose text contains markup-significant characters
- **WHEN** that text is rendered
- **THEN** it is displayed literally
- **AND** it produces no elements

#### Scenario: Paths and identifiers are escaped

- **WHEN** a client path, folder name, or activity target is rendered
- **THEN** it is escaped

### Requirement: Escaping Is Applied At Every Interpolation Site

Every point at which a dynamic value is inserted into an HTML string on this page SHALL pass that value through the shared escaping helper.

#### Scenario: The page uses the shared helper rather than a private one

- **WHEN** any escaping is performed on this page
- **THEN** the application's shared escaping helper is used
- **AND** no page-local escaping implementation is introduced

#### Scenario: Values inserted through attributes are escaped

- **WHEN** a dynamic value is inserted into an attribute rather than into element content
- **THEN** it is escaped for that context
- **AND** a value cannot terminate the attribute and introduce a new one

#### Scenario: Values inserted as untrusted URLs are not interpolated blindly

- **WHEN** a dynamic value is used as a link target or resource address
- **THEN** it is validated for that context before use
- **AND** a value that is not a permitted form for that context is not used

### Requirement: Escaping Is Verified, Not Assumed

The escaping requirement SHALL be covered by an automated check that fails if an interpolation site is added without escaping.

#### Scenario: A regression test pins the escaping of file names

- **WHEN** the queue renders a name containing markup-significant characters
- **THEN** an automated check asserts the rendered output contains no injected element and no raw markup-significant sequence from the name

#### Scenario: A regression test pins the escaping of server text

- **WHEN** a failure reason containing markup-significant characters is rendered
- **THEN** an automated check asserts the rendered output contains no injected element

#### Scenario: The check covers the in-place patch path

- **WHEN** a row's metadata is patched during progress
- **THEN** the check asserts that path is escaped as well
- **AND** it is not assumed to inherit escaping from the full-row render
