# ADR-009 — Admin Identity, Database, and File-Access Policies

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Project maintainer
- **Tags:** backend, security, persistence, identity
- **Change:** `openspec/changes/admin-identity-and-access-control`

## Context

ADR-003 §9 recorded authentication as the application's one open Critical: there is no `User`
entity, no session, and no role anywhere in `src/` — any network caller that reaches the HTTP port
has full read/write/delete access to `STORAGE_ROOT`. The only gate is nginx `auth_basic` on one of
two documented deployments, declared in that config as "the ONLY gate... do not remove it until
real authentication lands in the app."

A separate, larger initiative was proposed at `openspec/changes/saas-identity-and-tenancy/` to
close that gap as part of a multi-tenant pivot shared with a second, separate "Files" portal
(`files.cloudavid.com`). That portal is not a Node application in this repository — it is
presently a static site served by nginx directly from `/var/www/html/files-server-web`, with its
own source elsewhere. Whether and how it will consume this application's identity and
file-access data is not yet decided, and is explicitly out of scope here.

This decision scopes down to what this application needs on its own: real authentication, a
two-tier role distinction (administrator vs. ordinary user), and a data model an administrator can
use to control who may download which file and when — without assuming a tenant concept this
application does not have, and without blocking on the Files-portal integration decision.

ADR-001 (`docs/decisions/ADR-001-architecture-baseline.md`) and ADR-006
(`docs/decisions/ADR-006-settings-store-and-scope.md`) both record a deliberate decision **not**
to introduce a database, on the grounds that the filesystem is the database and two small JSON
documents were sufficient for `metadata.json` and `settings.json`. Those documents have no
identity concept and cannot express a user, a session, or a per-file access policy. This ADR
supersedes that stance for the specific data this decision introduces; it does not touch
`metadata.json`, `settings.json`, or the services that own them.

## Decision

### 1. `node:sqlite` is the persistence engine, additive to the existing JSON stores

The application adopts the SQLite implementation built into its own Node runtime
(`engines.node: ">=24.0.0 <25"` already requires a version where it is stable) for identity,
session, and file-access-policy data. This adds no npm dependency, no native build step, and no
external database service — consistent with `test/integration/repo-guardrails.test.js`'s exact
seven-package dependency pin, which this decision does not change.

`data/metadata.json` (downloads, stars, activity — owned by `MetadataService`) and
`data/settings.json` (owned by `SettingsService`) are **not** absorbed into the new database and
are not touched by this decision. Their fire-and-forget, best-effort consistency model (AGENTS.md
rule 7) is a different contract than a policy table that must be correct, and merging them was not
asked for. The new database and the two JSON stores coexist as separate, independently-owned
stores, both under `AFM_DATA_DIR`.

### 2. A two-value `role` column, not a permission catalogue

`users.role` is `CHECK (role IN ('admin', 'user'))`. This application has exactly one distinction
to make — administrator vs. ordinary user — not a cross-tenant permission catalogue with scoped
role-permission grants. A `CHECK` enum answers every access check this decision needs
(`req.user.role === 'admin'` gates user-management and file-policy routes). If a third role is
ever needed, migrating an enum column to a join table is a contained, well-understood step; it is
not built now on the chance it is needed later.

### 3. File access policy is per-file, not per-directory-inherited

`file_access_policies` holds at most one row per `files.id`, with `access_mode` (`public` /
`authenticated` / `restricted`), `is_published`, `is_locked`, and an optional
`available_from`/`available_until` window. `user_file_permissions` holds per-user `grant`/`deny`
rows against a specific file. There is no directory-level inheritance and no `Resource` model
covering non-leaf paths — the brief that motivated this decision describes individually
publishable files, not a directory-scoped policy tree. `files` itself is a **sparse** table: a row
exists only once an administrator has set a policy on that path, not a mirror of every path under
`STORAGE_ROOT`. Keeping it sparse is consistent with this application's existing "the filesystem
is the database" identity statement (AGENTS.md) — the database augments the filesystem for the
paths an administrator has actually decided to govern; it does not shadow it.

### 4. The database has no consumer at the download path yet

This decision adds the schema and the admin-facing CRUD surface to create and manage policies. It
does **not** wire `fs.routes.js`'s read endpoints (`GET /list`, `GET /download`, etc.) to consult
`file_access_policies` or `user_file_permissions` before serving a file. There is currently nothing
that would consume that decision correctly — the public Files portal is a separate, un-inspected
codebase, and this application's own filesystem endpoints remain governed by ADR-003's existing
posture until a follow-up decision wires enforcement to a real caller. Building the data model and
the admin tooling now, ahead of any consumer, lets a later enforcement decision land as wiring
rather than a schema rewrite.

### 5. Sequencing: identity first, file-policy tables in parallel, enforcement deferred

Schema lands as two additive, idempotent migrations: `users`/`sessions`/`audit_logs` first,
`files`/`file_access_policies`/`user_file_permissions` second (the second only needs the first's
`users.id` to exist for its nullable FK/audit columns, so the two can be designed in parallel).
Authentication (login/logout/session cookie, CSRF, login throttle) is built directly against the
first migration's real tables once it lands, closing ADR-003's Critical with a role-aware check
rather than the flat "any session has full access" model an earlier, narrower plan had proposed.
An operator-bootstrapped first admin account is required before the admin UI has any user to log
in as.

## Alternatives rejected

- **Build the full `saas-identity-and-tenancy` proposal as originally scoped.** Rejected for now:
  its `Tenant`-owns-a-subtree shape does not match what this application's own admin panel needs
  (one shared pool with per-file policy, not isolated tenant subtrees), and its blast radius
  (18-call-site `PathService` refactor, ~799 affected tests, a 4-shell SPA rebuild, nginx
  proxy-bypass removal) is scoped to a cross-portal pivot that has not been decided.
- **A full RBAC permission catalogue (platform/tenant-scoped role-permission grants).** Rejected:
  there is one tier distinction to make, not several scopes across tenants; a catalogue would be
  unused machinery.
- **Directory-inherited access policies (`Resource` per directory).** Rejected: the motivating
  requirement is per-file publication control, not a directory-scoped policy tree with
  inheritance.
- **Migrate `metadata.json`/`settings.json` into the new database in the same change.** Rejected:
  out of scope for what this decision was asked to solve, and their consistency models differ from
  a policy table that must be correct.

## Consequences

- `openspec/changes/saas-identity-and-tenancy/` remains an unimplemented, recorded proposal with a
  scope note pointing here; it is not archived (nothing in it has shipped) and not edited to remove
  tenancy (that would misrepresent what was actually decided and when).
- A new database file is added under `AFM_DATA_DIR`, alongside
  `metadata.json` and `settings.json`, each independently owned.
- ADR-003's open Critical (no authentication) is closed by the authentication work this decision's
  sequencing enables, not by this ADR directly — this ADR records the data-model and engine
  decisions that work depends on.
- The Files-portal integration question (shared database vs. a central API) is explicitly left
  open, to be decided only once that portal's own source has been inspected.
