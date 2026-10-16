# Spec Delta

## Purpose

Defines the minimum size and spacing of interactive controls so that every action in the interface is reachable and operable on a touch-capable viewport, including the icon-only and row-level controls that carry no visible label.

## ADDED Requirements

### Requirement: Buttons Meet A Minimum Hit Area

Every button SHALL present an interactive area of at least 44 by 44 CSS pixels on viewports where touch input is available, measured as the union of its box and any transparent padding around it.

#### Scenario: A default button meets the minimum

- **WHEN** a default-weight button is measured
- **THEN** its interactive area is at least 44 by 44 CSS pixels

#### Scenario: A small button meets the minimum

- **WHEN** a small-weight button is measured
- **THEN** its interactive area is at least 44 by 44 CSS pixels

#### Scenario: The minimum is met without enlarging the visible label

- **WHEN** a small button's hit area is raised to the minimum
- **THEN** its rendered text, icon size and surrounding layout are unchanged

### Requirement: Icon-Only Buttons Meet A Minimum Hit Area

A button whose only content is an icon SHALL present an interactive area of at least 44 by 44 CSS pixels, including when it is rendered at a reduced icon size.

#### Scenario: A topbar icon button meets the minimum

- **WHEN** an icon-only button in the topbar is measured
- **THEN** its interactive area is at least 44 by 44 CSS pixels
- **AND** it does not cause the topbar to exceed its maximum height

#### Scenario: A row-level icon button meets the minimum

- **WHEN** an icon-only button rendered inside a list row is measured
- **THEN** its interactive area is at least 44 by 44 CSS pixels
- **AND** it does not force the row's height beyond what the row's own content requires

#### Scenario: The minimum is met without a visible border

- **WHEN** an icon-only button's hit area is raised to the minimum
- **THEN** its border remains visually unchanged
- **AND** no filled background appears where the control previously had none

### Requirement: Hit Areas Do Not Overlap

Two adjacent interactive controls SHALL NOT have overlapping hit areas, so that activating one never triggers the other.

#### Scenario: Adjacent row actions do not overlap

- **WHEN** two icon-only controls sit next to each other in a list row
- **THEN** their hit areas do not intersect
- **AND** activating one does not activate the other

#### Scenario: Adjacent topbar controls do not overlap

- **WHEN** two icon-only controls sit next to each other in the topbar
- **THEN** their hit areas do not intersect

### Requirement: The Minimum Is Verified From Rendered Geometry

The hit area of every interactive control SHALL be verified from its measured rendered geometry, so that padding-based and pseudo-element-based hit area expansion is counted rather than only the visible box.

#### Scenario: Transparent expansion is counted

- **WHEN** a control reaches the minimum through transparent padding or an expanded pseudo-element rather than a larger visible box
- **THEN** that control is reported as meeting the minimum

#### Scenario: A control below the minimum is reported

- **WHEN** any interactive control measures below 44 by 44 CSS pixels on a touch-capable viewport
- **THEN** it is reported as failing, naming the control

#### Scenario: The check runs on the narrow viewport

- **WHEN** hit areas are verified
- **THEN** they are measured at the viewport width where the layout collapses to its single-column form