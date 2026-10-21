# Spec Delta

## Purpose

Defines how the Files page's clipboard strip discloses *which* files a pending Copy or
Move will act on, so the count in the strip is always backed by a readable list that
matches the clipboard exactly — never a superset, never a stale set, never an
unescaped filename.

## ADDED Requirements

### Requirement: The Clipboard Strip Discloses Its Pending Items

While a Copy or Move is pending, the clipboard strip SHALL offer a disclosure listing one
row per pending item, each row naming the item and showing its source path, and SHALL
open that list on hover or on activation of its trigger.

#### Scenario: A pending cut lists exactly its items

- **WHEN** two items are cut
- **THEN** hovering the strip or activating its trigger lists both item names with their source paths
- **AND** the list's header reflects the pending mode ("move" for a cut, "copy" for a copy)

#### Scenario: The list follows the clipboard

- **WHEN** the clipboard is cancelled
- **THEN** the list is emptied and the strip is hidden
- **AND** when a move completes, only the items that actually moved leave the list

#### Scenario: Keyboard and assistive technology can reach it

- **WHEN** the trigger receives focus and the user presses Enter or Space
- **THEN** the list toggles
- **AND** the trigger's expanded state tracks the list, including when the list closes on an outside click or Escape

### Requirement: The Disclosure Never Renders Unescaped Filesystem Data

Every item name and path is operator-controlled, so the disclosure SHALL render them as
inert text.

#### Scenario: A hostile filename is displayed literally

- **WHEN** an item named `<img src=x onerror=alert(1)>.mp4` is on the clipboard
- **THEN** the list shows that string as text
- **AND** no element is created from it

### Requirement: The Disclosure Stays Bounded

The list SHALL be anchored below the strip and capped in height and width so a large
selection scrolls instead of displacing the page, and a long filename ellipsizes instead
of stretching the panel.

#### Scenario: A large selection scrolls

- **WHEN** many items are pending
- **THEN** the list scrolls within its cap rather than extending past the viewport

#### Scenario: A long filename does not widen the panel

- **WHEN** a pending item has a very long name
- **THEN** the name ellipsizes inside the panel's maximum width
