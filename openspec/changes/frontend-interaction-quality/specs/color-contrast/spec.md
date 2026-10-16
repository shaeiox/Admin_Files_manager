# Spec Delta

## Purpose

Defines the minimum legibility bar for every piece of text and every user-selected region the interface renders, in both the light and dark themes, and requires that bar to be measured rather than assumed.

## ADDED Requirements

### Requirement: Secondary And Tertiary Text Meets AA In Both Themes

Every token used to render body-size text SHALL reach a contrast ratio of at least 4.5:1 against the background it is placed on, in both the light and the dark theme.

#### Scenario: Tertiary text is legible in the dark theme

- **WHEN** tertiary text is rendered on the primary background in the dark theme
- **THEN** its measured contrast ratio is at least 4.5:1

#### Scenario: Tertiary text is legible in the light theme

- **WHEN** tertiary text is rendered on the primary background in the light theme
- **THEN** its measured contrast ratio is at least 4.5:1

#### Scenario: The bar holds against the surface it actually sits on

- **WHEN** a text token is used on the secondary background, on an input surface, or inside a card
- **THEN** its measured contrast ratio against that surface is at least 4.5:1

#### Scenario: Meeting AA does not require dropping to the primary text token

- **WHEN** tertiary text is corrected to meet the minimum
- **THEN** it remains visually distinct from primary text
- **AND** the tertiary role is still usable for de-emphasised metadata

### Requirement: Placeholders And Column Headers Meet AA

Placeholder text and table column headers SHALL meet the same 4.5:1 minimum as body text, in both themes.

#### Scenario: Input placeholders are legible

- **WHEN** an input renders its placeholder in either theme
- **THEN** the placeholder's measured contrast ratio against the input surface is at least 4.5:1

#### Scenario: Column headers are legible

- **WHEN** a data table renders its column headers in either theme
- **THEN** each header's measured contrast ratio against its background is at least 4.5:1

#### Scenario: Form helper text is legible

- **WHEN** a form field renders helper text beneath its input in either theme
- **THEN** the helper text's measured contrast ratio against the section background is at least 4.5:1

### Requirement: Selected Text Is Legible

Text a user selects SHALL remain readable in both themes; the selection highlight SHALL NOT reduce the selected text below 4.5:1 against the colours it is drawn over.

#### Scenario: Selection is readable in the dark theme

- **WHEN** a user selects text in the dark theme
- **THEN** the selected text's measured contrast ratio against the selection highlight is at least 4.5:1

#### Scenario: Selection is readable in the light theme

- **WHEN** a user selects text in the light theme
- **THEN** the selected text's measured contrast ratio against the selection highlight is at least 4.5:1

#### Scenario: The highlight is visibly a highlight

- **WHEN** the selection colours are chosen to meet the minimum
- **THEN** a selected region is still visually distinguishable from unselected text in the same theme

### Requirement: Link Text Meets AA

A token used to render link text SHALL reach at least 4.5:1 against the page background in every theme in which it is used.

#### Scenario: Links are legible in the light theme

- **WHEN** link text is rendered on the primary background in the light theme
- **THEN** its measured contrast ratio is at least 4.5:1

#### Scenario: The hovered link state is also legible

- **WHEN** link text is rendered in its hover or active state
- **THEN** that state's measured contrast ratio is at least 4.5:1

### Requirement: Contrast Is Measured, Not Assumed

The contrast of every text token, placeholder, column header and selection state SHALL be verified by computing the ratio from the declared colour values in each theme, so a change to any token cannot silently lower it.

#### Scenario: Both themes are checked

- **WHEN** contrast is verified
- **THEN** every themed value pair declared for the light theme and the dark theme is measured

#### Scenario: A failing token fails the check

- **WHEN** any measured pair falls below its required minimum
- **THEN** the check reports which token and which theme failed
- **AND** it does not pass on the basis that the failure is small

#### Scenario: The accent is checked against the surface it labels

- **WHEN** the accent colour is used as text or as a background carrying text
- **THEN** that pairing's measured ratio is reported against its applicable minimum