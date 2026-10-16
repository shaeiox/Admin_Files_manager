# Spec Delta

## Purpose

Defines how the interface moves: what a user who has asked their operating system for reduced motion sees, what feedback an action produces, how a page change is signalled, and the rule that animated properties stay on the compositor.

## ADDED Requirements

### Requirement: Reduced Motion Is Honoured Across The Interface

When the operating system reports a reduced-motion preference, the interface SHALL render every animation, transition and continuous loop in its final visual state, with no movement, no looping and no periodic redraw.

#### Scenario: Looping animations stop

- **WHEN** the reduced-motion preference is active
- **THEN** no pulsing, shimmering, spinning or otherwise looping animation runs anywhere in the interface

#### Scenario: One-off entrance animations resolve to their end state

- **WHEN** the reduced-motion preference is active and a panel would animate in
- **THEN** the panel renders immediately in its final state
- **AND** it is not left invisible, transparent or scaled down

#### Scenario: Progress indication remains meaningful

- **WHEN** the reduced-motion preference is active and a determinate progress value is rendered
- **THEN** the progress value is shown in a form that does not require movement to read
- **AND** an indeterminate progress state remains distinguishable from a complete one

#### Scenario: The preference is honoured per theme and per page

- **WHEN** the reduced-motion preference is active
- **THEN** every page renders without movement, including pages reached by client-side navigation after the preference is set

### Requirement: An Action Produces Visible Feedback

Activating an interactive control SHALL produce a visible state change during the press, so that the user can confirm the control received the input.

#### Scenario: Buttons respond to press

- **WHEN** a button is pressed
- **THEN** its rendered appearance changes for the duration of the press

#### Scenario: The press feedback does not shift layout

- **WHEN** a control's press feedback is applied
- **THEN** the change is produced by transform or opacity
- **AND** no element surrounding the control changes size or position

#### Scenario: Press feedback is not itself animated

- **WHEN** the reduced-motion preference is active and a control is pressed
- **THEN** the press still produces a visible change
- **AND** that change is applied without a transition

### Requirement: A Page Change Is Signalled

When the user navigates between pages without a full document load, the interface SHALL signal the change and SHALL NOT present a progress indicator that has already cleared while the new page is still arriving.

#### Scenario: Incoming content is signalled

- **WHEN** a client-side navigation completes
- **THEN** the arriving content is distinguishable from the departing content by a brief transition rather than appearing with no transition at all

#### Scenario: The progress indicator covers the whole wait

- **WHEN** a client-side navigation is in flight
- **THEN** the progress indicator remains active until the new page's content is in place
- **AND** it does not clear before the content has been swapped in

#### Scenario: A failed navigation still resolves the indicator

- **WHEN** a client-side navigation fails and falls back to a full page load
- **THEN** the progress indicator does not remain stuck on

#### Scenario: Navigation does not animate scroll position

- **WHEN** a client-side navigation resets the scroll position
- **THEN** the new position is reached immediately
- **AND** the viewport does not animate from the previous position

### Requirement: Long-Running Progress Is Continuous

A progress indicator whose underlying value updates on a timer SHALL render as continuous movement rather than as a step that advances and then freezes between updates.

#### Scenario: The bar does not visibly stall between updates

- **WHEN** a progress value updates on a fixed interval
- **THEN** the rendered progress does not pause for a perceptible period between updates
- **AND** the movement reads as continuous rather than as discrete jumps

#### Scenario: Progress movement does not force layout

- **WHEN** progress is rendered
- **THEN** its advance is produced by a composited property
- **AND** it does not trigger a layout recalculation on each update

### Requirement: Animated Properties Stay On The Compositor

A transition or animation SHALL name the properties it animates, and every property it names SHALL be one the compositor can handle without triggering layout or paint.

#### Scenario: No transition animates every property

- **WHEN** the stylesheets are inspected
- **THEN** no transition or animation declaration uses the all keyword to stand for its property list

#### Scenario: Animated properties are restricted

- **WHEN** a transition or animation names a property
- **THEN** that property is opacity, a transform component, or a compositor-safe paint property
- **AND** it is not width, height, top, left, margin or padding

#### Scenario: Utility classes name their properties

- **WHEN** a shared transition utility class is applied
- **THEN** it transitions a named property list rather than every property

#### Scenario: A panel resize is compositor-driven

- **WHEN** a collapsible region's size changes
- **THEN** the change is produced by a transform rather than by transitioning its width, height or margin

### Requirement: Presentation Overlays Delay Before Appearing

A tooltip or transient hint SHALL NOT appear on pointer entry alone, so that sweeping the pointer across a row of controls does not produce a flicker of hints.

#### Scenario: A hint does not strobe across a control row

- **WHEN** the pointer sweeps across several adjacent hint-bearing controls in under a second
- **THEN** at most one hint is shown at a time
- **AND** a hint that is entered and immediately left does not flash

#### Scenario: A hint still appears for a deliberate hover

- **WHEN** the pointer rests on a hint-bearing control
- **THEN** the hint appears after a short delay

#### Scenario: Keyboard focus is not delayed

- **WHEN** a hint-bearing control receives keyboard focus
- **THEN** the hint appears without the pointer-entry delay