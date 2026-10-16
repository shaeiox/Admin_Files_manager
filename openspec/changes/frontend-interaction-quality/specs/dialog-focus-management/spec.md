# Spec Delta

## Purpose

Defines how the shared programmatic dialogs used by every page behave for keyboard and assistive-technology users: where focus goes, where it cannot go, how a dialog is dismissed, what it is announced as, and how its caller-supplied content is rendered.

## ADDED Requirements

### Requirement: Focus Is Trapped Inside An Open Dialog

While a programmatic dialog is open, keyboard focus SHALL remain within the dialog and SHALL NOT reach any element outside it, in either tab direction.

#### Scenario: Tab does not leave an open dialog

- **WHEN** a dialog is open and focus is on its last focusable control
- **THEN** pressing Tab moves focus to the first focusable control within the dialog
- **AND** focus does not reach any element outside the dialog

#### Scenario: Reverse Tab does not leave an open dialog

- **WHEN** a dialog is open and focus is on its first focusable control
- **THEN** pressing Shift+Tab moves focus to the last focusable control within the dialog
- **AND** focus does not reach any element outside the dialog

#### Scenario: A dialog with no focusable control keeps focus on itself

- **WHEN** a dialog is open and contains no focusable control
- **THEN** focus remains on the dialog itself
- **AND** keyboard focus still cannot reach the page behind it

### Requirement: Focus Returns To The Trigger On Close

When a programmatic dialog closes, focus SHALL return to the element that was focused immediately before the dialog opened.

#### Scenario: Focus returns after a confirm dialog resolves

- **WHEN** a confirmation dialog is dismissed and removed
- **THEN** focus returns to the control that opened it

#### Scenario: Focus returns after a prompt dialog resolves

- **WHEN** a prompt dialog is dismissed and removed
- **THEN** focus returns to the control that opened it
- **AND** the returned element is the trigger rather than the document body

#### Scenario: Closing one dialog does not disturb a second

- **WHEN** two dialogs are open and the topmost one closes
- **THEN** focus moves into the dialog that is now topmost

### Requirement: A Dialog Is Dismissible By Keyboard

A programmatic dialog SHALL close when the Escape key is pressed while it is open, and SHALL close only the topmost open dialog.

#### Scenario: Escape closes the open dialog

- **WHEN** a dialog is open and the Escape key is pressed
- **THEN** the dialog closes
- **AND** the page behind it becomes operable again

#### Scenario: Escape acts on the topmost dialog only

- **WHEN** two dialogs are open and the Escape key is pressed once
- **THEN** only the topmost dialog closes
- **AND** the dialog beneath it remains open

#### Scenario: Escape with no dialog open changes nothing

- **WHEN** no dialog is open and the Escape key is pressed
- **THEN** no dialog opens and no state changes

### Requirement: A Dialog Is Announced With Its Own Title And Body

A programmatic dialog SHALL be exposed as a modal dialog with an accessible name and, when it has descriptive body text, an accessible description, both sourced from its own rendered content.

#### Scenario: The dialog has an accessible name

- **WHEN** a dialog is rendered
- **THEN** it is exposed with a modal dialog role
- **AND** it has a non-empty accessible name taken from its title

#### Scenario: The dialog body is associated with the dialog

- **WHEN** a dialog renders descriptive body text
- **THEN** that text is associated with the dialog as its accessible description

#### Scenario: A dialog with no body text is still valid

- **WHEN** a dialog is rendered without descriptive body text
- **THEN** it is still exposed with a non-empty accessible name
- **AND** it declares no accessible description

### Requirement: Caller-Supplied Dialog Text Is Rendered As Text

Every value a caller passes into a programmatic dialog SHALL be rendered as text content or an attribute value, never as markup, so that markup-significant characters in a file or folder name cannot alter the rendered dialog.

#### Scenario: A name containing a quote character renders correctly

- **WHEN** a prompt dialog is opened with a value containing a double quote character
- **THEN** the input displays that value exactly as supplied
- **AND** the dialog's structure is unchanged

#### Scenario: A name containing markup characters is not interpreted

- **WHEN** a prompt dialog is opened with a value containing angle brackets
- **THEN** the characters appear literally in the input
- **AND** no element is created from them

#### Scenario: Dialog title and body are not interpreted

- **WHEN** a confirmation dialog is opened with a title or message containing markup-significant characters
- **THEN** those characters appear literally in the dialog
- **AND** no element is created from them

### Requirement: Opening A Dialog Does Not Shift The Page

Opening or closing a programmatic dialog SHALL NOT move any content on the page, because the space the document scrollbar occupies is preserved while a dialog is open.

#### Scenario: Opening a dialog preserves horizontal layout

- **WHEN** a dialog is opened on a viewport where a document scrollbar is present
- **THEN** the horizontal position of every element outside the dialog is unchanged

#### Scenario: Closing a dialog preserves horizontal layout

- **WHEN** a dialog is closed
- **THEN** the horizontal position of every element outside the dialog is unchanged from before the dialog opened

#### Scenario: Scrolling the page behind a dialog is still prevented

- **WHEN** a dialog is open
- **THEN** the page behind it cannot be scrolled
- **AND** that prevention does not depend on removing the scrollbar