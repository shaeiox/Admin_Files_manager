# Spec Delta

## Purpose

Defines the shared token layer every page reads from: where typography comes from, what each font-family token actually names, how many corner radii exist and which components may use them, and which palette values are not offered at all.

## ADDED Requirements

### Requirement: Typography Is Self-Hosted

The interface SHALL obtain its typefaces without contacting a third-party origin, so that a self-hosted deployment renders identically with or without outbound internet access.

#### Scenario: No third-party font request is made

- **WHEN** any page loads
- **THEN** no request is issued to a font host outside the application's own origin

#### Scenario: Text renders before the typeface is ready

- **WHEN** a typeface is still loading
- **THEN** text renders in the fallback stack and is then replaced when the typeface becomes available
- **AND** the stylesheet is not blocked from parsing by the typeface request

#### Scenario: Typeface delivery does not block first render

- **WHEN** a page is parsed
- **THEN** no stylesheet import waits on a network request to a font host

### Requirement: Font-Family Tokens Name What They Set

Each font-family token SHALL resolve to the typeface family it is named for, so that a reader of the stylesheet is not misled about the type system.

#### Scenario: A token resolves to its named family

- **WHEN** a font-family token's declared value is read
- **THEN** the first family in its stack is the family the token is named for
- **AND** no token named for one family declares a different family

#### Scenario: Each token has a distinct role

- **WHEN** the font-family tokens are enumerated
- **THEN** each is either used by at least one rule or documented as reserved
- **AND** no two tokens declare an identical stack under different names

### Requirement: Corner Radius Follows A Declared Scale

Corner radii SHALL be drawn from a single declared scale with a stated rule for which components may use which step, rather than from an open-ended set of ad-hoc values.

#### Scenario: Every radius value is a scale step

- **WHEN** the stylesheets are inspected
- **THEN** every declared corner-radius value resolves to a token on the declared scale
- **AND** no component hardcodes a radius in its own declaration

#### Scenario: Unused scale steps are removed or justified

- **WHEN** a scale step is declared
- **THEN** it is used by at least one rule or is documented as reserved for a named component

#### Scenario: The rule for choosing a step is written down

- **WHEN** the scale is documented
- **THEN** it states which components use which step
- **AND** a component that mixes steps does so under that documented rule

#### Scenario: Steps that differ without a reason are reconciled

- **WHEN** two scale steps differ only marginally and serve the same role
- **THEN** they are merged into one step

### Requirement: The Palette Excludes Unusable Values

A colour token SHALL NOT be defined for a value the interface is not permitted to use, and a gradient token SHALL NOT be declared unless every stop in it is a colour the palette actually uses.

#### Scenario: No pure-black token is offered

- **WHEN** the colour tokens are enumerated
- **THEN** no token resolves to pure black
- **AND** the darkest surface is an off-black

#### Scenario: Gradient tokens use palette colours

- **WHEN** a gradient token is declared
- **THEN** every colour stop in it is a colour the palette defines
- **AND** it does not introduce a hue family the palette otherwise avoids

#### Scenario: The accent is reserved for interaction

- **WHEN** the accent colour is applied
- **THEN** it is used for interactive state, focus and emphasis
- **AND** it is not the fill of a primary action when a higher-contrast surface fill is available

### Requirement: Motion Durations Have One Source

A duration expressed in behaviour SHALL resolve to the same token the stylesheet uses, so that a change to the token cannot leave behaviour and presentation out of step.

#### Scenario: Behaviour timing references the shared duration

- **WHEN** a behaviour waits for an animation to finish before removing or restoring an element
- **THEN** the wait uses the shared duration token's value
- **AND** it does not repeat the value as a separate literal

#### Scenario: A token change does not desynchronise behaviour

- **WHEN** the duration token's value changes
- **THEN** the behaviour's wait changes with it
- **AND** no element is removed before its animation has finished