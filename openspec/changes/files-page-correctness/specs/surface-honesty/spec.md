# Surface Honesty

## Purpose

Requires that every control the interface renders is either functional or absent, and that a capability which cannot be built is removed rather than stubbed with a message promising a future phase. This capability exists because the page shipped a fake share link, a star button that reported success without doing anything, five sidebar entries that loaded identical content, a topbar search field that nothing read, and eight markup buttons with no handler at all.

## ADDED Requirements

### Requirement: No Control Renders Without A Working Handler

Every interactive element in the page markup SHALL have a handler that performs the action the control names.

#### Scenario: No dead buttons

- **WHEN** the page markup is inspected
- **THEN** no button, link, or menu item renders without a bound handler
- **AND** no element renders as enabled while performing no action

#### Scenario: Menu items are all functional

- **WHEN** an overflow menu is opened
- **THEN** every item in it performs the action it names

#### Scenario: Drawer actions are functional

- **WHEN** the details drawer is open
- **THEN** each action in its footer performs the action it names

### Requirement: No Handler Reports An Outcome It Did Not Produce

A handler SHALL NOT emit a success message describing an operation it did not carry out, and SHALL NOT emit a roadmap or phase message in place of an action.

#### Scenario: No hardcoded values are presented as results

- **WHEN** a control copies a value to the clipboard
- **THEN** the copied value is derived from real state
- **AND** it is not a fixed string embedded in the source

#### Scenario: No placeholder success messages

- **WHEN** a handler completes
- **THEN** it emits a success message only for an operation it actually performed
- **AND** a control with no implemented operation is absent rather than reporting success

#### Scenario: No phase or roadmap text in the interface

- **WHEN** the interface is inspected
- **THEN** no user-visible string references a future phase, a pending implementation, or an unfinished integration

#### Scenario: No "coming soon" affordances

- **WHEN** the interface is inspected
- **THEN** no control exists whose only behaviour is to state that it is not yet available

### Requirement: Navigation Entries Lead To Distinct Content

A navigation entry SHALL lead to content distinct from every other entry pointing at the same page.

#### Scenario: Sidebar entries are either functional or absent

- **WHEN** a sidebar entry points at the file browser
- **THEN** it applies a distinct, implemented filter, sort, or scope
- **AND** entries with no distinct implemented behaviour are removed

#### Scenario: Removed entries are removed on every page

- **WHEN** the sidebar correction is applied
- **THEN** every page sharing the duplicated sidebar shows the same entries
- **AND** no two pages present differing sidebars for the same navigation

#### Scenario: A scope that contradicts the product is not offered

- **GIVEN** deletion is permanent and there is no recoverable-trash mechanism
- **WHEN** the sidebar is rendered
- **THEN** no entry offers a trash or recovery view
- **AND** no entry offers sharing, because no sharing primitive exists

#### Scenario: A supported capability is reachable from navigation

- **GIVEN** a filter or sort the listing already supports
- **WHEN** a sidebar entry for it is rendered
- **THEN** activating it applies that filter or sort
- **AND** the resulting view is visibly distinct from the unfiltered view

### Requirement: Search Fields Are Wired Or Absent

A search input SHALL either filter the page's data or not be rendered. A field that receives focus via a documented keyboard shortcut and produces no results is prohibited.

#### Scenario: Every search field filters

- **WHEN** the operator types into any search field on the page
- **THEN** the page's data is filtered by that input's value

#### Scenario: A shortcut that focuses a field is meaningful

- **WHEN** a keyboard shortcut focuses a search field
- **THEN** typing into that field produces filtered results

#### Scenario: Two search fields do not silently diverge

- **GIVEN** more than one search field exists on the page
- **THEN** each has a distinct, stated scope
- **AND** a field with no implemented scope is removed

#### Scenario: A decorative badge is not shown

- **WHEN** a field carries a keyboard-shortcut hint badge
- **THEN** the shortcut does what the badge claims

### Requirement: Dead Code Is Removed

Code that is unreachable, or that duplicates a live implementation, SHALL be removed rather than left to mislead the next reader.

#### Scenario: Unreachable handlers are gone

- **WHEN** the module's functions are inspected for reachability
- **THEN** no function exists that is never invoked

#### Scenario: Duplicate implementations are collapsed

- **GIVEN** two implementations of the same behaviour exist
- **WHEN** one is retained
- **THEN** the other is removed

#### Scenario: One handler per control is structurally enforced

- **WHEN** the toolbar initialisation is inspected
- **THEN** no control has more than one handler registered for the same event type

#### Scenario: Dead markup is removed with its handlers

- **WHEN** a control is removed from the interface
- **THEN** its handler is removed in the same change
- **AND** no orphaned handler for a non-existent element remains

## Regression Requirements

- A source-level test SHALL assert `files.js` contains no `window.open(` call and no hardcoded absolute URL literal being copied to the clipboard.
- A source-level test SHALL assert no user-visible string in `files.js` or `files.html` matches phase, roadmap, or "coming soon" phrasing.
- A source-level test SHALL assert every element id referenced by a query in `files.js` exists in `files.html`, so no handler targets a removed control.
- A source-level test SHALL assert every interactive element id in `files.html` is either bound in `files.js` or intentionally marked inert, and assert the count of unbound interactive elements is zero.
- A source-level test SHALL assert no uncalled function remains in `files.js`.
- A test SHALL assert the sidebar markup is identical across all four pages.
- A test SHALL assert `#globalSearch`, if present, is bound to a filtering behaviour; otherwise the element is absent and the shortcut badge is absent.