# Dashboard Historical Metrics

## Purpose

Establishes that the application retains no historical series, and therefore requires that every Dashboard affordance implying a time series — trend percentages, sparklines, period-over-period comparisons, date-ranged traffic charts — be removed rather than populated with invented data. Prevents the most damaging class of fabrication: numbers that look measured but are not.

## ADDED Requirements

### Requirement: Absence Of Retained History Is Acknowledged

The application SHALL NOT claim to retain historical series it does not retain, and no artifact of this change SHALL introduce such retention.

#### Scenario: No historical persistence is introduced

- **WHEN** this change is implemented
- **THEN** no time-series store, snapshot table, or history file is added
- **AND** no previously unrecorded quantity begins being recorded for future trend display

#### Scenario: Absence is documented

- **WHEN** the API contract is delivered
- **THEN** it states explicitly that no historical series is retained
- **AND** it states which Dashboard figures are therefore instantaneous rather than period-over-period

### Requirement: Trend Percentages Are Not Fabricated

No trend percentage SHALL be displayed, because no prior period exists to compare against.

#### Scenario: No numeric trend field

- **WHEN** a stat entry is delivered
- **THEN** no numeric trend or delta field is present
- **AND** no comparison baseline is present

#### Scenario: Trend is declared unavailable

- **WHEN** the Dashboard renders a stat that would otherwise carry a trend
- **THEN** it renders an explicit unavailable indication
- **AND** it does not render a percentage, an arrow, or a signed delta

#### Scenario: No non-finite trend rendering

- **WHEN** trend rendering is reached
- **THEN** the output is never the literal text for a non-finite number
- **AND** it is never a percentage sign with no number

### Requirement: Sparklines Are Removed

No sparkline SHALL be rendered, because no series exists to plot.

#### Scenario: Sparkline element is absent

- **WHEN** the Dashboard is rendered
- **THEN** no sparkline element is present
- **AND** no placeholder polyline, path, or canvas stands in for one

#### Scenario: Removal is complete

- **WHEN** the sparkline rendering code is inspected
- **THEN** the code that produced sparklines is removed rather than left to run on empty input
- **AND** no dead branch remains that would emit a degenerate shape

### Requirement: Period-Ranged Traffic Chart Is Removed

The traffic chart SHALL NOT be rendered, because no per-period traffic history exists.

#### Scenario: Chart element is absent

- **WHEN** the Dashboard is rendered
- **THEN** the traffic chart element is absent from the document
- **AND** its container and legend are absent as well

#### Scenario: Chart rendering code is removed

- **WHEN** the chart rendering path is inspected
- **THEN** it no longer exists
- **AND** no empty chart shell with axis labels implying a measured series remains

#### Scenario: Date-range copy is removed

- **WHEN** the Dashboard is rendered
- **THEN** no copy describes a chart spanning a period such as fourteen or thirty days
- **AND** no label such as a live badge or a period selector implies a measured time series

### Requirement: Period Selector Is Removed Or Made Functional

A control that selects a reporting period SHALL either work or be absent.

#### Scenario: Non-functional period tabs are absent

- **GIVEN** a tab control whose tabs have no bound behaviour
- **WHEN** the Dashboard is rendered
- **THEN** the control is absent
- **AND** it is not present with selectable semantics it does not implement

#### Scenario: No empty chart container remains

- **WHEN** the period control is removed
- **THEN** no orphaned container, legend, or axis scaffolding remains
- **AND** the surrounding section is either removed entirely or repurposed for a real instantaneous figure

### Requirement: Instantaneous Figures Are Labelled Honestly

Figures that are real but instantaneous SHALL be labelled so they are not read as period-over-period measurements.

#### Scenario: Real figures are not labelled with a period

- **WHEN** a real figure such as total files, total folders, or tree bytes is displayed
- **THEN** its label does not claim a change, a trend, or a period comparison

#### Scenario: Real figures are not removed

- **WHEN** historical affordances are removed
- **THEN** every figure that can be computed truthfully remains displayed
- **AND** removal is limited to affordances that cannot be satisfied honestly
