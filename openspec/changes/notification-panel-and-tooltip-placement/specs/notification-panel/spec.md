# Spec Delta

## Purpose

A notification surface gives the operator quick access to the same real activity feed the dashboard shows, and it distinguishes loading, empty, and unavailable states with no fabricated content.

## ADDED Requirements

### Requirement: The bell opens a real activity panel
The topbar bell button on pages that render it SHALL open a dropdown panel listing recent activity entries from `GET /api/dashboard/summary` (`activities`), using the same underlying store (`MetadataService.getActivities`). The panel SHALL NOT invent entries: when the feed is empty it SHALL render an empty state, not placeholder rows.

#### Scenario: Panel lists real activity
- **WHEN** the user opens the bell panel on a page where the bell is rendered
- **THEN** the panel requests `GET /api/dashboard/summary` and renders each entry's real label and timestamp, newest first

#### Scenario: Empty feed renders an honest empty state
- **WHEN** the activity feed is empty
- **THEN** the panel renders "No recent activity" and no rows

#### Scenario: Failure renders an unavailable state
- **WHEN** the summary request fails
- **THEN** the panel renders an unavailable state with a retry control, not an empty panel and not a toast-only failure

### Requirement: The bell panel is operable and dismissable
The panel SHALL be operable by keyboard, closable with Escape, closed by outside click, and closed when the page navigates. Focus SHALL move into the panel on open and return to the bell on close. The bell SHALL expose `aria-expanded` and `aria-controls` reflecting panel state.

#### Scenario: Escape closes and restores focus
- **WHEN** the panel is open and the user presses Escape
- **THEN** the panel closes and focus returns to the bell button

#### Scenario: Navigation closes the panel
- **WHEN** the user navigates between pages while the panel is open
- **THEN** the panel is closed and is not visible on the new page

### Requirement: No unread badge without a real signal
The bell SHALL NOT render a badge, dot, or any attention affordance unless a real unread signal exists. Today there is none, so no badge is rendered.

#### Scenario: No fabricated badge
- **WHEN** the bell renders on any page
- **THEN** no unread indicator is present

### Requirement: Dead notification controls are removed
Controls with no backing source SHALL NOT render: the hardcoded "Add event" button in Settings → Webhooks, and the hardcoded `Notifications on` integration status.

#### Scenario: Add event control absent
- **WHEN** Settings → Webhooks renders
- **THEN** no control labelled "Add event" is present

#### Scenario: Integration state is real or explicit
- **WHEN** Settings → Integrations renders the notifications integration
- **THEN** the rendered status reflects a real source or states that notifications are not configured
