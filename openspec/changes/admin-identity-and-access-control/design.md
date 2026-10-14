# Design

## Context

The verified current state: an Express 5 application with no identity, no authorization, no
database; two JSON stores (`metadata.json`, `settings.json`) owned by `MetadataService` and
`SettingsService`; a single path-traversal chokepoint (`PathService.resolveSecurePath` /
`resolveSecureRealPath`) hardwired to one global `STORAGE_ROOT`; and a separate, unimplemented
proposal (`openspec/changes/saas-identity-and-tenancy/`) that modeled the identity gap as part of
a multi-tenant pivot this application does not currently need. `node:sqlite` is available and
unused (Node engine pinned `>=24.0.0 <25`); the repo's exact-dependency-list guardrail
(`test/integration/repo-guardrails.test.js`) pins exactly seven runtime packages, none of them a
database driver.

This document records the decisions for the admin-only identity/RBAC/file-policy slice. Requirement-
level detail lives in `specs/`; this document must be detailed enough that a separate
implementation pass can act without re-deriving the architecture.

## Goals / Non-Goals

**Goals:**

- Close ADR-003 §9's open Critical with real authentication: hashed credentials, server-side
  sessions, CSRF defense, login throttle.
- Distinguish administrator from ordinary user with the smallest mechanism that does the job.
- Model per-file publication control (publish/unpublish, lock/unlock, access mode, availability
  window) and per-user permission grants, administrable today even though nothing yet enforces
  them against a real download.
- Add a database that introduces no new runtime dependency and sits alongside — not instead of —
  the existing JSON stores.
- Keep the diff away from this application's existing god-nodes (`PathService`,
  `validateClientPath`/`validateFileName`, `FileSystemService`) entirely; none of them change.

**Non-Goals:**

- A `Tenant` entity or any tenant-scoped boundary. There is one shared file pool.
- A permission catalogue with scoped role-permission grants. Two roles need no catalogue.
- Directory-inherited access policies. Policies are per-file.
- Migrating `metadata.json`/`settings.json` into the new database.
- Enforcing the new policies against `fs.routes.js`'s read endpoints, or against the Files portal.
  There is no decided consumer yet.
- MFA, SSO/OIDC, password-reset email flows (an admin resets a user's password directly; there is
  no self-service recovery in this slice).

## Decisions

### D1. Role is a two-value column, not a permission catalogue

**Decision.** `users.role` is `CHECK (role IN ('admin', 'user'))`. Every authorization check in
this change is one comparison: `req.user.role === 'admin'`. There is no `Role`/`Permission`/
`UserRole` table.

**Rationale.** The superseded proposal's RBAC existed to separate platform-admin from tenant-admin
from tenant-member *across tenants*. None of that exists here — there is one admin tier and one
ordinary tier, full stop. A catalogue built for two values is unused machinery; if a third role is
ever needed, an enum-to-join-table migration is a contained, well-understood step.

**Alternatives rejected.** A full permission catalogue (rejected: oversized for two values). A
boolean `is_admin` flag instead of an enum (rejected: a `CHECK`-constrained `TEXT` enum reads the
same at the call site and leaves room for a future `status`-like third value without a schema
type change, at no extra cost).

### D2. File-access policy is per-file; `files` is sparse

**Decision.** `files` holds one row per client path an administrator has set a policy on — not one
row per path in `STORAGE_ROOT`. A path with no row has no policy and is governed by whatever the
rest of the application already does for that path (today: nothing restricts it; see D5).
`file_access_policies` is a 1:1 extension of `files` (unique `file_id`). There is no directory-row
concept and no policy inheritance.

**Rationale.** The motivating requirement (admin brief §6) describes per-file publication control:
a specific file is public, authenticated-only, or restricted to named users, with a start/end
availability window. It does not describe directory-scoped policy inheritance. Keeping `files`
sparse matches this application's own "the filesystem is the database" identity statement — the
new table augments the filesystem for governed paths; it does not shadow or mirror the whole tree,
which would create a continuously-stale index the moment a file moves outside this change's own
mutation paths (a `rename`/`delete` through the existing `fs.routes.js` endpoints, which this
change does not alter).

**Consequence — reconciling with `FileSystemService.rename`/`remove`.** A `files` row's
`client_path` can go stale if the underlying file is renamed or deleted through the existing,
unmodified filesystem endpoints. This change adds exactly one piece of connective behavior:
`FileSystemService.rename`/`remove` already fire-and-forget into `MetadataService.renamePath`/
`deletePath` today (AGENTS.md rule 7) — the same fire-and-forget call is extended to also update
or remove a matching `files` row via `FileAccessPolicyService`, never making the filesystem
operation's success depend on it. A policy whose file was deleted without going through a
mutation path this change observes (e.g. direct host filesystem access) is simply a policy on a
path that no longer exists; the admin UI's list view treats a missing path the same way the
existing Files page treats any vanished entry — it's just not retained silently as a phantom
success. This is the one point of contact between this change and existing filesystem code; it
does not touch `PathService`, `validateClientPath`, or any god-node's public signature.

### D3. Session mechanics: cookie + bearer, flat expiry

**Decision.** `sessions.token_hash` stores only a hash of a high-entropy opaque token. The raw
token is delivered once, at login, in an `HttpOnly`; `Secure` (production); `SameSite=Lax` cookie.
The same raw token is also accepted as `Authorization: Bearer <token>` for non-browser clients.
Expiry is a single flat `expires_at` (recommend 24h) — no tiered absolute/sliding/step-up policy.
`csrf_secret` is per-session; every non-GET request must present a matching CSRF header derived
from it.

**Rationale.** This is the original Phase-1 authentication design, carried forward unchanged
except for the `role` check layered on top at the route level. A flat expiry is a smaller, more
easily-tested diff than a tiered policy, and nothing in the admin-only brief requires step-up
re-authentication for a specific class of destructive operation.

**Alternatives rejected.** JWTs (rejected, same reasoning as the superseded proposal: an opaque,
server-revocable token is simpler to reason about and to revoke immediately on disable/logout — a
JWT would need its own revocation list to get the same property). Tiered session lifetime
(deferred — a smaller diff now; revisit if real usage shows a need).

### D4. Database substrate: `node:sqlite`, additive, repository-bounded

**Decision.** A new `src/db/` module owns a `node:sqlite` connection and exposes named repository
operations (`UserRepository`, `SessionRepository`, `FileAccessPolicyRepository`,
`UserFilePermissionRepository`, `AuditLogRepository`) — no controller or service issues SQL
directly. A versioned, idempotent schema-advancement step (a `schema_migrations` ledger, same
mechanic as the superseded proposal's design, re-running as a no-op when already current) is
wired into `scripts/deploy.sh` between dependency install and the release's test-suite gate, and
the deploy script's existing store-presence guard gains a check for this database file alongside
its existing JSON-store checks (it does not replace them — `metadata.json`/`settings.json` still
need to exist, same as today).

**Rationale.** `node:sqlite` is stdlib in the pinned Node range — zero new dependency, satisfying
the exact-dependency-list guardrail without an exception. A repository boundary keeps the engine
swappable later without rewriting controllers, matching this application's existing
service-owns-its-store pattern (`MetadataService`, `SettingsService` each own their file; these
new repositories own their tables the same way).

**Alternatives rejected.** `better-sqlite3` or another npm package (rejected: adds a dependency and
a native build step for no capability `node:sqlite` lacks for this scope). Folding the new tables
into `metadata.json`/`settings.json` instead of a real database (rejected: neither supports
relational integrity — a `UNIQUE (file_id, user_id)` constraint, a `FOREIGN KEY ... ON DELETE
CASCADE` — that this data model needs).

### D5. No enforcement wiring in this change

> **Amendment (2026-10-14): superseded — policies are now enforced.** The operator asked for the
> backend to honour policies, so the "decided consumer" is this application itself.
> `FileAccessPolicyService.checkerFor(req.user)` is consulted by every `/fs` endpoint, the
> thumbnail and the dashboard summary. Admins bypass; an unpolicied path stays open; otherwise every
> policy on the path (ancestors included) must allow — which also amends the "per-file, not
> inherited" requirement, since a folder ZIP or listing would otherwise leak a locked child. Hidden
> items answer `404` like missing ones. Rules: `docs/CONTRACTS.md` → "What a policy enforces".
> The original decision is kept below for the record.

**Decision.** `fs.routes.js`'s existing read endpoints (`GET /list`, `GET /tree`, `GET /download`,
`GET /download-zip`, `GET /thumbnail`) are **not** modified to consult `file_access_policies` or
`user_file_permissions`. This change adds the schema and the admin CRUD surface only.

**Rationale.** There is no decided consumer: the Files portal is a separate, un-inspected
codebase, and wiring this application's own filesystem endpoints to the new tables without
knowing whether Files will read the same database or call a central API would risk building the
wrong enforcement shape twice. Building the data model and admin tooling now — ahead of any
consumer — lets a later, separately-scoped enforcement decision land as wiring, not a schema
rewrite.

**Consequence.** Until a follow-up change adds enforcement, a policy an administrator sets through
this change's UI has no effect on what this application actually serves. The admin UI must say so
plainly (no success-implying copy like "file is now protected" without that caveat) — this is a
Files-page-correctness-style truthfulness requirement, not optional polish.

### D6. Audit logging: flat, fixed retention

**Decision.** `audit_logs` is one flat table with an index on `created_at`, pruned by a simple
fixed-window job (e.g., delete rows older than N days) rather than the superseded proposal's
class-based (per-action-category) retention.

**Rationale.** Class-based retention solves a compliance-grade problem — different legal retention
requirements per action type — that nothing in the motivating brief raised. A flat table with a
simple prune is sufficient for an internal admin tool's own accountability trail.

### D7. Bootstrap: operator-supplied, never a default

**Decision.** The first admin account is created from operator-supplied configuration (an
environment variable pair or a one-off CLI script reading a credential file) at first boot. There
is no hardcoded default admin credential, and nothing is printed to stdout.

**Rationale.** A predictable or hardcoded bootstrap credential would undermine the entire change —
this is the same discipline `AGENTS.md` already applies to `STORAGE_ROOT`/`AFM_DATA_DIR` ("never
created automatically," operator error if missing) extended to the one secret this change
introduces.

## Migration Steps

1. Schema migration 1: `users`, `sessions`, `audit_logs`, wired into `scripts/deploy.sh`'s schema
   stage (idempotent; a second run is a no-op).
2. `authenticate` middleware + CSRF + login throttle, applied once in `src/routes/api.js` after
   `/health` and before the existing routers.
3. Bootstrap-admin creation path (config-driven, documented in `.env.example` and
   `docs/DEPLOYMENT.md`).
4. Schema migration 2: `files`, `file_access_policies`, `user_file_permissions` — buildable in
   parallel with steps 2-3 once migration 1 exists, since it only needs `users.id` for FK columns.
5. Admin UI Part A (user management) and Part B (file-policy management) — buildable in parallel
   once steps 2 and 4 land.

Every step before step 5 is revertible by reverting its commit; nothing in this sequence removes
or rewrites `metadata.json`/`settings.json`.
