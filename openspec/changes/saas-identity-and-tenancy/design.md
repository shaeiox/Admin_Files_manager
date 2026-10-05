# Design

## Context

The verified current state, gathered by reading the repository and confirmed by an audit
(re-run of `git ls-files`, grep, and a `graphify path` query) remains as summarized in the
proposal: an Express 5 application with **no identity, no authorization, no database**, a single
global `STORAGE_ROOT`, a single hardcoded `Authorization`-less path boundary, two JSON stores, and
an nginx deployment whose `files.cloudavid.com` vhost serves tenant content directly, bypassing
the application. Twelve test files re-point `MetadataService.dbPath` at a temp file; the
activation gate is `GET /api/v1/health` reporting `"apiVersion": 1`; ADR-001 and ADR-006 both
reject a database and both instruct supersession.

This design defines *how* the identity, tenancy, authorization, persistence and governance
capabilities are realized. Requirement-level detail lives in the `specs/` tree; this document
records the decisions and their rationale and must be detailed enough that a separate
implementation agent can act without re-deriving the architecture.

## Goals / Non-Goals

**Goals:**

- One shared identity system for Admin Web and Files Web: one account store, one session store,
  one login endpoint, one permission catalogue.
- A `Tenant` as the primary security boundary, derived from an authenticated session and never
  from client input.
- A `Resource` record for each directory and each tenant root — never one per file — holding the
  policy and access-state that govern everything beneath it.
- Time-bounded, inherited `AccessPolicy` grants to **authenticated principals only**.
- A database that replaces both JSON stores, that adds **no runtime dependency**, and that can be
  swapped for PostgreSQL without rewriting business logic.
- Tenant isolation that is enforced at the same single chokepoint the traversal guard already
  uses, not in fourteen separate places.
- Same behavior and same status codes for both `/api/v1` and `/api`, so the compatibility alias
  cannot become an authorization bypass.
- A deployment path that preserves the existing guarantees: activation gate on `/api/v1/health`,
  hermetic test suite inside the release, no state inside the release, graceful shutdown ordering.

**Non-Goals:**

- Public or anonymous share links, including any unauthenticated file-read path. `AccessPolicy`
  is authenticated-principal-only by design; a future change may add a share-token model as its
  own principal type.
- One `Resource` row per physical file.
- PostgreSQL as the initial engine, multi-process clustering, horizontal scale-out, MFA,
  SSO/OIDC, and any change to the no-build frontend model.
- Client-visible tenant selection in request bodies, query strings or headers. A host hint may
  select a tenant's login presentation but is always verified against the session and can never
  widen access.
- Wholesale migration of `metadata.json`'s advisory analytics (see §3).

## Decisions

### D1. The tenant boundary is the one chokepoint, reached by explicit parameter

**Decision.** Tenant resolution happens inside the single assembled router and is enforced again
at the existing path-resolution boundary. No controller, service, or route reads a tenant value
from the request. `PathService` resolves only against the established tenant's root and
re-checks containment there.

**Mechanism — explicit parameter, no ambient state.** The tenant root is passed **as an argument**
to every path-resolution call. It is NOT module-level state, NOT a module-scoped "current tenant",
and NOT `AsyncLocalStorage`. See **D13** for the full decision and the call-site inventory; this
entry states only that the chokepoint is reached by parameter.

**Why.** The traversal guard's value comes from living in one auditable function. Tenants are a
second, independent escape problem, and putting them in fourteen handlers would reproduce the
exact failure mode ADR-001 rejected (validation logic "scattered across handlers … where
traversal bugs breed"). A tenant derived from the session and used at the one resolution point
gives the same property for the second boundary.

**Alternatives considered.** (a) A per-route middleware that each handler invokes — rejected: one
missed registration silently opens a route, and the failure does not fail loud. (b) A client
header naming the tenant — rejected: trivially spoofable, and a contradiction of the requirement.
(c) A tenant path segment in the URL — rejected: it invites the client to choose the tenant and
breaks the existing client-path contract. (d) Ambient context — rejected in D13.

### D2. Directories are Resources; files are not

**Decision.** A `Resource` row exists for every directory and for each tenant root. Files are not
row. The filesystem answers existence, size and modification time; the `Resource` graph answers
*policy, inheritance, and write-state*. A path with no row of its own is governed by the nearest
recorded ancestor, falling back to the tenant root.

**Why.** Authorization needs a place to attach grants, validity windows, and a write-hold. The
smallest set of records that supports inheritance is the directory tree. Recording one row per
file would couple the database to the filesystem's full state and reintroduce the drift the JSON
stores were chosen to avoid.

**Alternatives considered.** (a) Row per file — rejected: a DB write on every filesystem
mutation, with a consistency problem on every out-of-band change. (b) No `Resource` table and a
path-string foreign key — rejected: paths are unstable under rename, and a tampered path string
cannot redirect I/O safely because the DB is not the authority on what a path resolves to.

### D3. SQLite through the runtime's own module, behind a repository boundary

**Decision.** The store is SQLite using the runtime's built-in `node:sqlite`, with all SQL and
engine specifics confined to a repository layer that exposes operations in application terms
(`TenantStore.get`, `SessionStore.revoke`, `AccessPolicyStore.evaluate`, …). Controllers and
services call repository *methods*; no engine type, SQL, or schema detail crosses that boundary.

**Why.** The suite must run on every deploy host inside a release with **no external service**,
which rules out PostgreSQL as the initial engine in this deployment. `better-sqlite3` would add a
native build surface that `node:sqlite` — present in the pinned runtime, as verified on this
machine — avoids entirely, and the project's own dependency guardrail asserts an exact package
list. The repository boundary keeps the engine replaceable: PostgreSQL becomes a second
implementation of the same port, not a rewrite.

**Alternatives considered and recorded for posterity.** Keeping the JSON stores (contradicts the
decision and cannot express atomic counters or multi-record transactions); shipping a second
repository layer per engine from day one (premature — a port with one adapter is a boundary, two
adapters is over-engineering); an ORM (adds the dependency the project's guardrail forbids and
scatters engine knowledge across models).

### D4. Sessions are server-side, opaque, and carry the tenant

**Decision.** A login creates a server-side `Session` row holding the hash of a high-entropy
opaque credential, an expiry, a revocation timestamp, the owning account, the **tenant**, and the
CSRF token bound to that session. The credential travels to a browser as an `HttpOnly; Secure;
SameSite=Lax` cookie and to a programmatic client as an `Authorization: Bearer` value on the same
endpoints. JWT is not the primary mechanism.

**Why.** The server must be able to revoke — and revocation of a stateless token requires a
denylist, which is just a session table again with worse semantics. Cookies plus a header-carried
CSRF token give the same XSS posture as a bearer token while keeping CSRF protection for the
browser. Storing only a hash means a database read does not recover a usable credential. The
tenant lives on the session because the tenant must be established from authenticated context, not
re-derived from a path per request.

**Alternatives considered.** Stateless JWT (no revocation, no server-side expiry check, and a
tangled rotation story); a tenant id inside the JWT (the client can influence it via a refresh);
separate admin and user token systems (synchronization problem the requirement explicitly rules
out).

### D5. One permission catalogue, two scopes, no `User.role` column

**Decision.** Permissions are data records. A `Role` groups permissions. `RolePermission` binds
them. `UserRole` binds a role to a membership **with an explicit `platform` or `tenant` scope and
never null**. A platform-scoped binding applies across the account's tenants; a tenant-scoped
binding applies within its own tenant only.

**Why.** A `User.role` column cannot represent "platform administrator" and "tenant administrator"
simultaneously, cannot express that the same account holds different roles in two tenants, and
turns every authorization question into a string compared in code. Reusing the project's existing
idiom — the settings validator uses an exact-name whitelist, the route table enumerates endpoints
— keeps the style consistent.

**Alternatives considered.** A single `is_admin` boolean per account (cannot represent
platform-vs-tenant, and conflates authentication with authorization); a role string on the
membership row (same problem, less structured).

### D6. Inheritance resolves nearest-ancestor-first, tenant root as the floor

**Decision.** An operation on a path is governed by the nearest recorded ancestor in its own
tenant, scanning upward to the tenant root. The tenant root is the floor — every tenant has one.
A more specific descendant policy overrides an ancestor's for the same principal and permission.

**Why.** Inheritance must be computable in one indexed lookup and must degrade to "the tenant
root's policy" rather than to "no policy", so that an out-of-band-created directory never lands
unguarded. Nearest-ancestor-first matches how people reason about a file tree and it is the
cheapest model to reason about for audit.

**Alternatives considered.** Copying the effective policy onto every child (cheap reads, but a
write storm when an ancestor policy changes, and a stale-copy risk at exactly the rename/delete
moments the system is busiest); evaluating the whole policy set per request (unbounded work).

### D7. `node:sqlite` because the deployment is single-node and self-contained

**Decision.** One database file under `AFM_DATA_DIR`, serving the single application process. WAL
mode for read-during-write; explicit transaction blocks for the multi-record operations (tenant
creation, directory move, role binding change). Counters are atomic single-row updates.

**Why.** This preserves every existing guarantee that depends on a single writable location — the
activation gate, the hermetic in-release suite, `ProtectSystem=strict` with a single writable
path, and the refusal to start against an absent store on a host that has run before. A
network-reachable database would add a credential class, a service to provisions, and a network
exposure the project has deliberately not had.

**Trade-offs accepted.** Single-writer so no horizontal scale; synchronous API so the event loop
is held for the duration of a query, which requires index discipline and requires that no query
run inside a long filesystem walk. The repository boundary is the documented exit.

### D8. Audit records are append-only, class-retained, and never carry secrets

**Decision.** Every state-changing request produces one `AuditLog` row as part of the request's
transaction, carrying tenant, actor, action, outcome, client-path resource, request id, and where
appropriate IP and user agent. Retention is class-based — security events are retained longest —
and a periodic reclamation step shrinks storage. The interface offers create and read only; there
is no update path and no caller-driven delete.

**Why.** An audit trail that can be edited is a defensible but weak control; the requirement asks
for tamper-evidence. The never-log list (passwords, hashes, tokens, headers, cookies, file
contents, secrets, raw absolute paths) is stated in the requirement and re-stated in the schema so
the constraint is visible where a field is added.

**Alternatives considered.** Log to the journal with the rest of the application (loses
queryability and retention classes, and forces secrets discipline onto the whole log pipeline);
a write-once external sink (adds an outbound dependency that conflicts with the self-contained
deployment).

### D9. `/api/v1/health` stays public; authentication wraps the rest

**Decision.** The liveness endpoint is registered inside the same assembled router that every other
endpoint lives in, and it is declared **before** the authentication and tenant-context middleware
that governs everything else. Because both `/api/v1` and `/api` mount that same assembly, both
prefixes serve the same health behaviour and neither bypasses authentication.

**Why.** A credentialed health endpoint cannot be polled by a deploy host that has no credential,
and a separate public health route mounted outside the assembly would not be covered by the alias
parity check. Keeping it in one router with the middleware *after* it gives both properties.

**Alternatives considered.** Remove health from the router and serve it from a separate public
path (loses alias parity and creates a second place to maintain the liveness shape); authenticate
health (deployment activation breaks).

### D19. Reconciliation removes vanished Resource records

**Decision.** An idempotent, bounded reconciliation pass removes `Resource` rows whose directories
no longer exist, scoped to one tenant at a time.

- **Trigger:** at startup, and on the `404`-on-an-existing-record path (lazily).
- **Behaviour:** verify each candidate directory with a filesystem existence check; remove the row
  only when the directory is absent. **A maximum number of rows per invocation**, so a pass is
  bounded and a partial pass leaves the remainder for the next one. Never blocks request handling.
- **Safety:** tenant-scoped — a pass for tenant A cannot remove tenant B's row. Idempotent — a
  second pass with no filesystem change removes nothing and still succeeds. Race-safe — a directory
  deleted mid-pass is treated exactly as one already deleted, never as an internal failure.
- **Verification:** the server log records the tenant and the count removed, and records "nothing to
  remove" when the count is zero, so a silently broken pass is distinguishable from a clean one.

**Why it exists.** Out-of-band directory deletion is explicitly in scope (AGENTS.md rule 10: the
storage root "may be populated out of band"). Without this, `Resource` rows accumulate forever
against directories that no longer exist, and D15's prefix query would keep matching stale
ancestors.

### D20. Upload concurrency is per tenant; free space stays per volume

**Decision.** The concurrent-upload ceiling becomes a **tenant-keyed counter**
(`Map<tenantId, count>`). The free-space watermark stays a **volume-level** gate.

**Why the distinction.** `AFM_UPLOAD_MAX_CONCURRENT` limits *in-flight requests*, which is a
per-caller concern: one tenant's uploads must not consume another's capacity. `AFM_UPLOAD_FREE_SPACE_BYTES`
limits *free bytes on the volume* — a property of the filesystem, not of any tenant. Modelling it as
per-tenant would mean either dividing one shared number N ways (inventing quota that does not
exist) or tracking per-tenant usage of a shared pool (which is a capacity policy, not a
measurement). The repository evidence is unambiguous: `UploadService._freeSpace` calls
`fsp.statfs(securePath)` and reads `bsize * bavail` for the **volume** backing the path.

**So:** concurrency → `Map<tenantId, count>`, evaluated and decremented per tenant. Free space →
unchanged, still read from the volume, still refusing with `507` **before any byte is staged**.

### D10. Two pools: governance first, streaming never buffered

**Decision.** Rate limiting is layered — origin for pre-authentication traffic, account and tenant
for authenticated traffic, a strict tier for administrative and destructive endpoints, separate
bounds for expensive file operations, and a process-wide ceiling. Expensive operations are bounded
**before** they start: an archive's entries are validated and authorized before the first byte is
piped, and a multi-resource batch is validated and authorized before any mutation.

**Ordering constraint (P1-12).** The **origin-keyed throttle for the login route ships in the same
group that makes the login route reachable**, not in a later one. A credential-accepting endpoint
that is live and unthrottled is a credential-stuffing target. The login throttle is keyed on the
attempt's **origin**, never on the submitted account name — keying on the submitted name would let
an attacker lock out a legitimate account by failing against it repeatedly.

**Why.** The current fixed-window limiter exists because a flood should be refused without paying
to parse it. With authenticated callers, keying the same request by account and tenant stops one
account or one tenant from spending another's allowance, and a login attempt must not lock out the
account being targeted. Authorization before work is the security rule; it also means the expensive
path never runs for a caller who will be refused.

**Alternatives considered.** One global bucket keyed on IP (a NAT of users shares it; a rotating
attacker resets it); throttling only reads (the destructive surface is exactly what needs it);
authorizing per item inside a batch (a partial batch has already run its first deletion).

### D11. CORS remains off by default, and credentials are a separate opt-in

**Decision.** No cross-origin access header is emitted unless explicitly enabled. When enabled,
origins come from a configured list, a wildcard is never permitted when credentials are also
permitted, and production refuses a wildcard unconditionally. Credentials are off until an operator
also configures them.

**Why.** With an authenticated cookie surface, a wildcard-plus-credentials combination turns any
site the operator visits into an authenticated driver of every tenant's data. The default-off
posture keeps the shipped SPA same-origin and needs nothing from any configuration. Credentials
must be a separate switch so enabling them is a deliberate, reviewable act.

**Alternatives considered.** Shipping cross-origin enabled for convenience (the drive-by surface
ADR-003 recorded as Critical); allowing a wildcard origin explicitly (incompatible with the
credential model this change introduces).

### D12. Both directories and files exist physically; the `Resource` table records directories

**Decision.** The `Resource` table records directories and tenant roots only. Files are resolved,
listed and authorized through the directory record that contains them and are otherwise absent
from the table.

**Why.** See D2. The resource table exists to carry policy and state, and policy is directory-
scoped by the inheritance model. Adding a row per file couples the two stores at every hot path
with no authorization benefit, because the nearest directory record already governs.

**Consequence.** A file that has no directory record is governed by its parent's record, which
always resolves upward to the tenant root — it is never left without a policy.

### D13. Tenant-root propagation is an explicit parameter at every call site

**Decision.** `PathService`'s three methods take the authorized boundary root as an **explicit
argument**. There is no module-level "current tenant", no `AsyncLocalStorage`, and no request-aware
global.

```js
PathService.resolveSecurePath(clientPath, root)
PathService.resolveSecureRealPath(clientPath, root)
PathService.toClientPath(absolutePath, root)
```

Every caller obtains `root` from the tenant context the router already established, and passes it
in. Controllers read it from `req.tenant`; services receive it as a parameter from their controller
caller.

**Why — this was undecided and is the highest-risk gap the review found.** Today all three methods
read `config.storageRoot` **internally** (`PathService.js:23`, `:64`, `:102`). The naive fix is an
ambient "current tenant", which would be a smaller diff — and is exactly wrong here, because
`fs.controller.getList` runs its enrichment under `mapWithConcurrency` at `LIST_ENRICH_CONCURRENCY
= 16`. An ambient value under a 16-way concurrent fan-out is precisely where a context-propagation
mistake becomes a cross-tenant leak, and it would be invisible in review because the code reads
correctly.

**Why not `AsyncLocalStorage`.** It would make the fan-out *look* safe while introducing a second,
implicit authority for the tenant — the class of bug D1 exists to prevent — and it would let a
service reach tenant state without the caller passing it, which is the ambient-coupling the
layering rule in AGENTS.md forbids.

**Complete call-site inventory** (17 sites; all must take the root):

| # | Site | Notes |
|---|---|---|
| 1-2 | `FileSystemService.getStats` `:30` (`resolveSecureRealPath`) | every read, download, ZIP entry, preview |
| 3 | `FileSystemService.createDirectory` `:93` | |
| 4 | `FileSystemService.rename` `:125` (source) | |
| 5 | `FileSystemService.rename` `:145` (`resolveSecurePath('/')` for the root) | **root-deletion guard** — must be the tenant root |
| 6-7 | `FileSystemService.rename` `:162-163` (`toClientPath`) | **missed by the original task 4.3** |
| 8 | `FileSystemService.remove` `:181` | |
| 9 | `FileSystemService.remove` `:184` (`resolveSecurePath('/')`) | **root-deletion guard** |
| 10 | `FileSystemService.getTreeStats` `:262` (start) | |
| 11 | `FileSystemService.getTreeStats` `:286` (per popped path) | inside the walk loop |
| 12 | `FileSystemService.getTreeStats` `:345` (**inside the per-entry loop**) | the hot path — see D14 |
| 13 | `FileSystemService.getVolumeStats` `:433` | |
| 14 | `FileSystemService.retainExisting` `:518` | dashboard top-files filter |
| 15 | `PreviewService.assertPreviewable` `:67` | |
| 16 | `UploadService.resolveDirectory` `:125` (`resolveSecureRealPath`) | upload destination |
| 17 | `UploadService.commit` `:157` | final placement |
| — | `UploadService.resolveDirectory` `:142` (`toClientPath`) | **18th site** — also missed |

Sites 5 and 9 are load-bearing: they derive the "cannot delete the storage root" guard from
`resolveSecurePath('/')`. Left pointing at the global root, the guard would compare against the
wrong boundary and either block every tenant-root delete or permit deleting a tenant root by a path
that resolves to the parent.

Sites 6, 7 and 18 are `toClientPath`, which converts an absolute path back to a client path. It
must use the **same root as the forward conversion**, or a client path produced under tenant A
would re-resolve under a different tenant on the next request.

**Propagation without services reading `req`.** Controllers (which may read `req`) extract
`req.tenant.root` once and pass it as an argument to their service call. Services never import
Express and never touch `req`; they receive the root as a parameter they thread to their own
internal calls. `getTreeStats` receives it once and threads it to sites 10-12.

### D14. Authorization is batched per listing, not per entry

**Decision.** A listing resolves the governing `Resource` rows and applicable `AccessPolicy` rows
for all entries in **one bounded number of queries per ancestor level**, then evaluates each entry
in memory.

**Why.** `getList` already fans out at `LIST_ENRICH_CONCURRENCY = 16` and already calls
`getTreeStats` per folder. Adding two synchronous `DatabaseSync` lookups per entry would serialise
the event loop N times inside a concurrent walk — and `node:sqlite` is synchronous (D7), so each
lookup holds the loop for its full duration. The design's own constraint ("no query run inside a
long filesystem walk") would be violated by construction.

**Strategy.** For a listing of N entries under one directory: collect the set of ancestor prefixes
(`/`, `/a`, `/a/b`, …) up to the tenant root, resolve them in a single prefix query against the
`(tenant_id, client_path)` unique index, fetch all `AccessPolicy` rows for `(tenant_id,
resource_id IN (…))` in one query, then decide each entry in memory. Same decision rule, same tenant
predicate, same 404/403 semantics — only the query count changes.

**Constraint preserved.** Batching is a query-count optimisation and must not weaken any tenant
check. The batch is pinned to the authenticated tenant; entries resolving outside it are refused
individually.

### D15. Nearest-ancestor resolution uses a prefix query, not a parent walk

**Decision.** Governing-record resolution is a **prefix query on the unique `(tenant_id,
client_path)` index**, not a walk of `parent_id`:

```sql
SELECT client_path FROM resource
 WHERE tenant_id = :t
   AND (client_path = :p OR client_path LIKE :p || '/%')
 ORDER BY length(client_path) DESC
 LIMIT 1
```

**Why.** The `UNIQUE (tenant_id, client_path)` constraint already materialises the index this
needs, so **no new index is required** — whereas a `parent_id` walk would need a second index and a
multi-step round trip per level. A path's ancestors are exactly its string prefixes, so the query
is both correct and served. It is also one round trip instead of depth-many.

**Recorded.** No `INDEX(parent_id)` is created. The prefix query is stated in the schema so the
strategy is not left to a general-purpose lookup.

### D16. Platform scope administers tenants; it does not read their content

**Decision.** Platform scope grants **administration of tenants, accounts and role bindings** — not
read, write or delete on tenant file content. Cross-tenant content access is a separate,
future capability (impersonation) with its own audit action and its own decision record. **This
Change does not implement it.**

**Why.** The current application has no notion of cross-tenant anything, and `config.storageRoot`
is a single global. Granting platform scope `fs.read` would make "read any tenant's files" an
implicit consequence of holding a role — the exact failure the isolation model exists to contain,
and one that would not be visible in a role definition's name.

**Permission split (answers the review's open question 2 with the existing code's own capability
set as the baseline):**

| Permission | tenant-admin | platform-admin |
|---|---|---|
| `fs.list` / `fs.read` / `fs.write` / `fs.delete` / `fs.upload` / `fs.rename` / `fs.download` / `fs.star` | ✅ | ❌ |
| `settings.read` / `settings.update` | ✅ (own tenant) | ❌ |
| `dashboard.read` (platform-scoped aggregate) | own tenant | ✅ |
| `audit.read` | own tenant | ✅ |
| `tenant.create` / `tenant.suspend` | ❌ | ✅ |
| `user.create` / `user.suspend` | own tenant | ✅ |
| `role.bind` / `role.unbind` | own tenant | ✅ |
| `resource.policy.manage` | own tenant | ❌ (tenant-scoped only) |

**Consequence.** An ordinary account holds no `UserRole` binding, its effective permission set is
empty, and every protected route refuses it — fail-closed by construction.

### D17. Session lifetime: 8 hours absolute, 30-day sliding, re-auth for destructive work

**Decision.** 8-hour absolute lifetime · 30-day sliding renewal on active use · re-authentication
required once the session passes a stated age for destructive operations.

**Why — repository evidence, not preference.** `docs/CONTRACTS.md:885` records the removed
*"Session timeout (15 min … Never)"* control, and states it was removed because *"No sessions exist
to expire."* That is a recorded statement of operator intent. The 15-minute figure was designed for
a security posture this system never had; adopting it now would be hostile to a file manager where a
5 GiB upload legitimately outlives 15 minutes. The 8-hour absolute bound still covers a working day
and bounds a stolen token, and re-authentication for destructive work targets the real risk
(delete, settings, role binding) rather than penalising reading.

### D18. A safe-method download records no counter

**Decision.** `GET /fs/download` performs **no stored write**. Download counting moves to an
explicit mutating request carrying the same protection as any other mutation.

**Why — this corrects a false claim in the original threat model.** That model asserted *"No GET
mutates."* The current code does the opposite: `incrementDownload` fires on the stream's `open`
event (`fs.controller.js:367-369`, and `:532` for ZIP entries). With a `SameSite=Lax` cookie — which
**does** attach on a cross-site top-level GET navigation — a cross-site `<a>`/`<img>` to
`/fs/download` writes to the counter while a header-carried CSRF token cannot protect a GET at all.
The claim was wrong about the code, so the requirement is corrected at the source rather than the
code being waved through.

**Cost, stated.** One extra request per download. Acceptable: the count is analytics, and the
alternative is an unprotected state change on a safe method.

## Data Model Specification

All tenant-owned tables carry a non-nullable `tenant_id`. Natural-key uniqueness is per tenant
(`UNIQUE (tenant_id, natural_key)`). Foreign keys are `ON DELETE RESTRICT` from tenant-owned
rows to their tenant, and `ON DELETE CASCADE` from a membership to its role bindings; audit rows
keep a nullable actor reference and are never cascade-deleted. Row Lifecycle: `Tenant.status`,
`Membership.status`, and `Session.revoked_at` govern availability; a record in non-active state is
invisible to its consumers.

### ER Shape

```text
Tenant ──< Membership >── User
  │            │
  │            └──< UserRole >── Role ──< RolePermission >── Permission
  │
  ├──< Session       (session = account + tenant + credential hash + expiry + revocation)
  │
  ├──< Resource      (directory | root; parent self-FK; a Resource inherits policy
  │   │                from its ancestors, nearest ancestor first)
  │   └──< AccessPolicy >── Permission     principal ∈ { account, role };
  │                                  AccessPolicy also carries its OWN tenant_id
  │                                  (non-nullable) — principal_id is polymorphic
  │                                  and therefore carries no FK
  ├──< Star          (per account, per tenant, on a resource path)
  ├──< DownloadCount (per tenant, per client path)
  ├──< Settings      (one per tenant)
  └──< AuditLog      (append-only, class-retained)
```

### Entity Reference

**Tenant.** Purpose: primary security boundary. Fields: `id` (PK), `slug` (unique, used as its
directory name and validated with the filename rules), `name`, `root` (absolute directory name
under `STORAGE_ROOT`), `status` (`active|suspended`), `created_at`. Lifecycle: created once,
status-managed, never hard-deleted while resources exist. Deletion behaviour: `restrict`.

**User.** Purpose: the single account identity shared by both surfaces. Fields: `id` (PK),
`email` (unique), `password_hash` (never plaintext), `password_algo`, `status`,
`failed_attempts`, `locked_until`, `last_login_at`, `created_at`. Scope: **global** — no
`tenant_id`. Lifecycle: created once, status-managed. Deletion behaviour: deactivation, not
deletion, because audit rows reference it.

**Membership.** Purpose: the account↔tenant relationship. Fields: `id` (PK), `user_id` (FK
→ User), `tenant_id` (FK → Tenant), `status` (`active|suspended`), `created_at`. Unique
`(user_id, tenant_id)`. Deletion behaviour: `restrict` on user or tenant; a membership may be
suspended, never silently detached.

**Session.** Purpose: an authenticated, revocable, expiring context. Fields: `id` (PK),
`token_hash` (unique), `user_id` (FK), `tenant_id` (FK), `csrf_token_hash`, `created_at`,
`expires_at`, `revoked_at` (nullable), `ip`, `user_agent`. Scope: per account **and** tenant.
Lifecycle: created at login or tenant switch, revoked on logout or administrative action, expired
by time. Deletion behaviour: hard-deleted after retention; audit rows referencing the account
persist.

**Role.** Purpose: a named bundle of permissions. Fields: `id` (PK), `key` (unique),
`description`. Scope: global. Note: a platform-admin and a tenant-admin differ by the **scope of
the binding**, not by a different role record, unless a distinct bundle of permissions is desired.

**Permission.** Purpose: a named capability. Fields: `id` (PK), `key` (unique), `description`.
Scope: global catalogue; no grants until bound.

**RolePermission.** Purpose: grant a permission to a role. Fields: `role_id` (FK),
`permission_id` (FK), PK `(role_id, permission_id)`. Lifecycle: additive, independent of any
account.

**UserRole.** Purpose: bind a role to a membership at an explicit scope. Fields: `id` (PK),
`membership_id` (FK), `role_id` (FK), `scope` (`platform|tenant`, **not null**, no default),
Unique `(membership_id, role_id, scope)`. Lifecycle: a grant can be created, suspended with the
membership, or removed (and removal invalidates authorization on the next request, per D5).

**Resource.** Purpose: a directory or tenant root carrying policy and state. Fields: `id` (PK),
`tenant_id` (FK, not nullable), `parent_id` (self-FK, nullable for the root), `name`, `kind`
(`root|directory`), `client_path` (not null), `write_held` (boolean, not null, default false),
`created_at`. Unique `(tenant_id, client_path)` — this **is** the governing-lookup index (D15); no
separate `parent_id` index is created. Deletion behaviour: when a directory and its descendants are
deleted, their records are deleted; audit rows are not. A record whose directory vanished
out-of-band is tolerated, treated as missing, and removed by the reconciliation pass (D19).

**AccessPolicy.** Purpose: a time-bounded grant of a permission on a resource to an
authenticated principal. Fields: `id` (PK), **`tenant_id` (FK, NOT NULL — see P0-7)**, `resource_id`
(FK), `principal_type` (`account|role`), `principal_id`, `permission_id` (FK), `effect`
(`allow|deny`), `valid_from` (nullable), `valid_to` (nullable), `created_by` (FK → User),
`created_at`. At least one of `valid_from`/`valid_to` SHALL be set or both null; a both-null window
means "always". Indexes: `(tenant_id, resource_id, principal_type, principal_id)` and
`(tenant_id, principal_type, principal_id)`.

**`tenant_id` is NOT NULL and is not derivable.** Without it the policy's tenant is reachable only
through `resource_id`, and because `principal_id` is polymorphic it carries **no referential
integrity** — so nothing in the schema stops a policy on a tenant-A resource naming an account that
is only a member of tenant B. `tenant_id` closes that: evaluation constrains
`AccessPolicy.tenant_id = :authenticatedTenant` **and** resolves the principal within that same
tenant.

**`principal_id` cannot have a conventional foreign key.** It holds either a `User.id` or a
`Role.id` depending on `principal_type`, and a single column cannot reference two tables. This is
stated in the schema so the absence is visible where a field is added. The compensating control is
the tenant-scoped evaluation query: a policy is only ever read with its `tenant_id` pinned to the
authenticated tenant, and an account principal is additionally required to hold an **active
membership** in that tenant before it can match.

**Precedence (P1-2, fail closed).** For one principal and one permission, across all applicable
levels:

```
deny at ANY applicable level            → DENY   (regardless of its validity window)
no deny; ≥1 allow whose window is open  → ALLOW
no deny; no open allow                  → DENY
unresolvable combination                → DENY   (recorded, never resolved toward allow)
```

**An expired `deny` is inert, never permissive.** It contributes nothing and cannot become an
allow; the decision falls through to the remaining policies, and absent an open allow the result is
deny. This is the sharp edge: an allow + expired-deny combination resolves by whether an allow
window is open, and it can never resolve to allow merely because the deny lapsed while no allow
exists.

**Star.** Purpose: a per-account mark on a path. Fields: `id` (PK), `user_id` (FK), `tenant_id`
(FK), `client_path` (not null), `created_at`. Unique `(user_id, tenant_id, client_path)`. Scope:
the owning account within its tenant — never visible to another account.

**Stale-mark behaviour (P1-6, deterministic).** The row carries no `Resource` FK, so a mark can
outlive its path. When a listing filtered to marks is served: a mark whose path no longer exists, or
which the marking account may no longer read, or which resolves into another tenant, is **omitted
from the results**. The omission is indistinguishable across all three cases — no status code,
field or message distinguishes "gone" from "not readable" from "another tenant" — and the row is
**retained**, so a temporarily unreadable mark reappears if access returns. Deletion happens only
with the owning account or the tenant.

**DownloadCount.** Purpose: per-tenant aggregate of times a client path was served. Fields:
`tenant_id` (FK), `client_path` (not null), `count` (not null, default 0), `updated_at`. PK
`(tenant_id, client_path)`. Updated atomically. Lifecycle: advisory; a stale row is the cost of a
file that was deleted, not an error; no automatic deletion.

**Settings.** Purpose: per-tenant operator preferences. Fields: `id` (PK), `tenant_id` (FK,
unique), `workspace_name`, `default_upload_folder`, `default_view`, `updated_at`, `updated_by`
(FK → User). Unique `(tenant_id)`. The conflict with the previous "three keys, one global
document" is resolved by scoping them per tenant.

**AuditLog.** Purpose: tamper-evident record of every state change and every denial. Fields:
`id` (PK), `tenant_id` (FK), `actor_user_id` (FK, nullable), `action`, `outcome`,
`resource_path`, `ip`, `user_agent`, `request_id`, `occurred_at`. Indexes: `(tenant_id,
occurred_at)` and `(actor_user_id, occurred_at)`. Not updateable, not deleteable through the
application. Retention: class-based, with security events retained longest and old records
reclaimed periodically.

### Cardinalities And Constraints (Summary)

| Edge | Cardinality | On delete |
|---|---|---|
| Tenant → Membership | 1:N | restrict |
| User → Membership | 1:N | restrict (deactivate, do not delete) |
| Membership → UserRole | 1:N | cascade |
| Role → UserRole | 1:N | restrict |
| Role → RolePermission | 1:N | cascade |
| Permission → RolePermission | 1:N | restrict |
| Tenant → Session | 1:N | cascade on tenant deletion |
| User → Session | 1:N | restrict |
| Tenant → Resource | 1:N | restrict |
| Resource → Resource (parent) | 1:N | cascade within one tenant |
| Resource → AccessPolicy | 1:N | cascade |
| Tenant → AccessPolicy | 1:N | cascade on tenant deletion |
| Tenant → Star | 1:N | cascade |
| Tenant → DownloadCount | 1:N | cascade |
| Tenant → Settings | 1:1 | cascade |
| Tenant → AuditLog | 1:N | restrict |

**Cascade scope.** A `cascade` from `Tenant` fires only on tenant deletion, which is itself
restricted while resources exist. No `cascade` can remove an `AuditLog` row. `Resource → Resource`
cascades **within one tenant only** — the child carries `tenant_id`, and a cross-tenant cascade is
structurally impossible because a child cannot reference a parent in another tenant.

Every FK that points at `Tenant` carries a tenant scope; no row is ever joinable to a row of
another tenant without an explicit tenant predicate.

## Authentication Flow (Where Each Decision Is Made)

```text
Browser
  │ Cookie: session=…;  X-CSRF-Token: …
  │ (or)  Authorization: Bearer …
  ▼
nginx (TLS, trust proxy = one hop)
  ▼
server.js
  ├─ helmet (CSP: script-src 'self')
  ├─ CORS (off by default; configured list only when enabled; credentials are a separate switch)
  ├─ GET /api/v1/health  → 200 { success, apiVersion }     ← PUBLIC, BEFORE auth
  ├─ rateLimit (origin-keyed for the pre-auth routes below)
  ├─ express.static + HTML fallback                        (no tenant data)
  └─ app.use(['/api/v1', '/api'], apiRoutes)
        └─ apiRoutes
             ├─ POST /auth/login     → SessionStore.create
             ├─ POST /auth/logout    → SessionStore.revoke
             ├─ GET  /auth/me        → current principal + effective permissions
             ├─ POST /auth/switch-tenant → membership check → new Session
             │
             ├─ authenticate()       → req.auth { userId, tenantId, sessionId }
             │     sessionStore.get(tokenHash)  → verify hash, not revoked, not expired,
             │     membership still active in that tenant; else 401
             │
             ├─ requireCsrf()        → for non-GET only; token in header matches session's
             │     csrf_token_hash; else 403
             │
             ├─ establishTenant()    → req.tenant { id, slug, root }
             │     tenantStore.get(session.tenantId); refused if suspended
             │     optional host hint verified against slug; mismatch → 403
             │
             ├─ rateLimit (account + tenant keys)
             │
             ├─ requirePermission('fs.read' | 'fs.write' | …)   per route
             │     effective = union(permissions of roles bound to this membership,
             │                      at scope platform | tenant matching the session)
             │
             └─ authorizeResource(req, clientPath)     ← the choke point
                  root     = req.tenant.root                 (EXPLICIT ARGUMENT — D13)
                  path     = PathService.resolveSecurePath(clientPath, root)
                  // listing path: ONE prefix query resolves all ancestor prefixes (D14/D15)
                  resource = governing Resource = the LONGEST client_path prefix of
                             `path` that has a row in this tenant; else the tenant-root row
                  allowed  = fail-closed precedence (D16):
                              any applicable deny            → DENY
                              else ≥1 allow with open window  → ALLOW
                              else / unresolvable            → DENY (recorded)
                  principal MUST hold an ACTIVE membership in this tenant to match a policy
                  cross-tenant / outside root → 404 (byte-identical to "not found")
                  THEN the controller performs the filesystem or database work
```

**Where the root comes from, without services reading `req`.** The router — the only layer permitted
to read `req` — extracts `req.tenant.root` and passes it as an argument into the controller's
service call. The service receives it as a parameter and threads it to its own internal
`PathService` calls. No service imports Express; no tenant state is ambient (D13).

**Where `getList` differs.** For a listing, `authorizeResource` is called once with the set of
entry paths: one prefix query resolves every ancestor (`WHERE tenant_id = :t AND client_path IN
(ancestors) ORDER BY length(client_path) DESC`), one query fetches the applicable policies, and
each entry is then decided in memory. Query count is bounded by the number of distinct ancestor
prefixes, not by the entry count (D14).

**Precisely where decisions occur:**

- **Security decision about liveness stays public:** in `apiRoutes`, the liveness route is declared
  before `authenticate()`, so no auth middleware ever runs for it.
- **"Who is making this request?"** — `authenticate()`.
- **"Which tenant is it for?"** — `establishTenant()`, from the session alone.
- **"Is the CSRF token right?"** — `requireCsrf()`, on the session, not the cookie.
- **"May this account do *that*?"** — `requirePermission()`, from the account's scoped bindings.
- **"May it do that *here*?"** — `authorizeResource()`, at the path boundary, using
  `AccessPolicy` and its validity window.
- **"Prove it did not happen unless it did."** — `AuditLog`, written in the same transaction.

## Tenant Isolation: Where It Is Enforced, And The Bypass Paths

| Layer | Enforcement | Bypass risk, and why this design closes it |
|---|---|---|
| **HTTP ingress** | one assembly mounted at both prefixes; no handler is reachable outside it | a second public surface would bypass; this change routes the previously-static nginx surface through it and removes `auth_basic` only after that surface is proxied |
| **Liveness** | declared before `authenticate()` but returns no tenant data | closes D9's tension: public and useful |
| **Authentication** | every non-liveness request runs `authenticate()`; session store failure → fail closed (§spec) | no silent anonymous fallback |
| **Tenant context** | `establishTenant()` reads only the session; client tenant values are ignored or contradicted → 403 | spoofed headers, body fields, query strings, and filesystem paths cannot select a tenant |
| **Authorization** | `requirePermission` + `authorizeResource` at the one path boundary | the boundary is in `PathService`, which every filesystem call already passes through; a handler that forgets the middleware is still bounded by the boundary |
| **Service layer** | services receive an established `req.auth`/`req.tenant` context and take tenant as an explicit argument | no service reads ambient global tenant or a request field |
| **Resource layer** | `Resource` rows carry `tenant_id`; nearest-ancestor resolution walks within the tenant; a path resolving outside the tenant root is 404, not 403 | no cross-tenant join is possible because every query carries the tenant predicate |
| **Database queries** | every tenant-owned table keyed by non-nullable `tenant_id`; repository methods require it | a tenant-less repository read is a code smell, caught in review and by tests |
| **Audit logging** | every tenant-owned record carries `tenant_id`; access requires an audit-read permission | audit cannot be used to infer another tenant's activity |
| **Downloads** | authorize the one resolved path before streaming | no `<img>` against the download endpoint |
| **ZIP** | validate and authorize every entry before the first byte is piped | no partial archive is ever streamed |
| **Delete** | validate all paths, authorize all, then mutate | no mixed-tenant batch is ever partially executed |
| **Health** | public, returns no tenant data; no tenant identifier, no environment, no counts | it cannot be an oracle for tenant existence |
| **CORS** | off by default; configured lists only; wildcard never with credentials; production refuses wildcard | cookies cannot be driven cross-origin unless an operator deliberately configures it |

**Named bypass paths, and their closures:**

1. **A request reaches a handler without `authenticate()`.** Impossible within this design:
   `authenticate()` is the first middleware in `apiRoutes` after liveness, and `apiRoutes` is the
   only router. Adding a new router outside it is a spec-level violation that the parity test and
   the middleware-ordering requirement catch.
2. **`/api` vs `/api/v1` drift.** Both mount one assembly with the same middleware. The versioning
   contract test asserts this; any divergence fails the suite.
3. **A controller reads a tenant from the request body.** The requirement forbids it; the
   integration test asserts a client-supplied tenant value is ignored or rejected where it
   contradicts the session.
4. **A stale `Resource` row redirects an I/O.** `Resource` records never determine a path;
   `PathService` resolves the path, and the row is looked up after. A stale row is tolerated
   (treated as missing), never obeyed.
5. **A symlink inside the root points outside it.** `resolveSecureRealPath` canonicalises with
   `fs.realpath` and re-checks containment at the tenant root.
6. **Directory traversal from one tenant's root.** Containment is judged against the *tenant* root,
   so `../../other-tenant` is rejected at the tenant boundary.
7. **A bulk batch names paths from two tenants.** Authorization is atomic across the batch; a
   mixed batch is refused wholesale, and no mutation happens for any member.
8. **A `Resource` directory is deleted out-of-band.** The record remains but the path resolves as
   missing; the operation does not proceed, and the record is cleaned up lazily.
9. **Another tenant's capacity is reachable.** Capacity is read for the tenant the caller is in;
   a tenant-scoped summary only carries that tenant's figures.

## Migration Plan

### Migration Principles

- Every step before the persistence cut-over is **revertible by reverting a commit**. The
  cut-over itself is split so the irreversible step is a single, identified commit.
- `deploy.sh` runs the full suite inside every release with production env unset
  (`env -u STORAGE_ROOT -u AFM_DATA_DIR …`, line 258), so the suite must not need either. Database
  access is therefore lazy and every suite points at its own temp database.
- `deploy.sh`'s store-presence guard (lines 236–241) must move from JSON files to the database,
  but its intent — *never start an empty store on a host that has run before* — is preserved. Note
  it currently checks **two** filenames; it becomes **one** database file.
- The suite's exact-dependency guardrail must continue to hold, which is the tie-breaker that
  selected `node:sqlite` over a driver.

### Deployment Sequence (P0-13) — the runner must be invoked

Verified current order in `scripts/deploy.sh`: completeness check (218) → configuration
prerequisites and store guard (228-241) → `npm ci --omit=dev` (244) → **in-release suite gate**
(257-260) → `chmod -R a-w` (266) → activate atomically (268+).

The schema step is inserted as its own numbered stage:

```
 1. completeness of the unpacked release
 2. configuration prerequisites + store-presence guard   (now checks the database file)
 3. npm ci --omit=dev
 4. >>> SCHEMA STEP <<<   apply outstanding versions; refuse if the stored schema is NEWER
 5. the project's own suite, unmodified, on this host     (per-suite temp databases)
 6. chmod -R a-w  →  atomic activation  →  health verification
```

**Placement rationale.** After `npm ci`, because the runner is part of the release. **Before** the
suite, so the gate exercises the real schema rather than a stale one. Before activation, so a
release that cannot advance the schema never serves. And: a stored schema **newer** than the
release understands is refused outright — the deploy script already refuses an older commit on
purpose (`DEPLOY_ALLOW_OLDER`), and an unknown-future schema is the same class of hazard.

**A runner that is never invoked is not a migration.** The task list wires this stage explicitly;
the capability alone does not satisfy it.

### What Migrates, What Is Discarded

| Previous state | New treatment |
|---|---|
| `metadata.json` → `starred[]` | **Discarded.** The list has no owner. There is no per-account data to attribute it to, so a wholesale import would create orphaned stars. Operators re-star in the UI. |
| `metadata.json` → `downloads{}` | **Discarded.** A global counter keyed by path had no tenant and no meaning now; counters start at zero per tenant. A defensible alternative — a one-time tenant-scoped import — is recorded but **not** taken, because the counter cannot be attributed to the correct tenant without a mapping the data does not contain. |
| `metadata.json` → `activities[]` | **Discarded for content.** The schema is replaced by `AuditLog`; the 50-row window is a retention class, not a migration. |
| `settings.json` | **Not migrated.** Three keys (`workspaceName`, `defaultUploadFolder`, `defaultView`) are re-entered per tenant. A one-line bootstrap may copy them when the first tenant is created, but this is an operator convenience, not a data contract. |
| `STORAGE_ROOT` contents | **Relocated.** Moved under `STORAGE_ROOT/<tenant-slug>/` with the directory created first. Link- and permission-preserving move where the host allows; otherwise copy-and-verify. The store's `root` column points at the new directory. |
| nginx static content locations | **Retired.** `/download/` and `/files/` stop serving from disk. See the nginx section below for the evidence-based determination and the compatibility impact. |
| nginx `/__list/` public listing | **Retired.** No directory listing of any content area survives. |
| nginx `auth_basic` on the admin vhost | **Removed last**, after runtime verification. Staged in four steps; a source-level grep is explicitly not accepted as verification. |

### Filesystem Relocation Strategy (P0-4, P0-12)

The relocation moves the operator's **real files**. It is therefore `copy → verify → switch`, never
an unverified destructive `mv`.

**Preflight — blocking, before any byte moves:**

1. Back up `STORAGE_ROOT` **and** `AFM_DATA_DIR`; the deployment has no backup code today
   (`deploy.sh` operates on releases only, never on data), so this is an operator action with no
   tooling behind it.
2. **Verify the backup by restoring it** to a scratch location and comparing counts — file
   existence alone proves nothing.
3. Record a **manifest**: file count, total bytes, and a checksum list, for both the source and the
   destination after the copy.
4. Rehearse the whole relocation against a **copy** of the tree.

**Execution:**

```
1. create <STORAGE_ROOT>/<tenant-slug>/       (empty)
2. copy every entry from <STORAGE_ROOT>/ into it        ← copy, not move
3. verify: manifest of source == manifest of destination (count, bytes, checksums)
4. on mismatch → ABORT. The original tree is untouched and still authoritative.
5. on match    → atomically switch the application to the tenant root
6. retain the original tree until the change is signed off, then remove it as a separate,
   deliberate operator action
```

**Half-completed migration: detection and recovery.** Because step 2 copies rather than moves, the
source is never partially consumed — a failure at any point leaves the original complete and
authoritative. Detection is the manifest comparison in step 3; recovery is to delete the incomplete
destination directory and re-run. There is no window in which the operator's only copy of their
files is incomplete, which is precisely what an in-place `mv` would create.

### Migration Steps (Deployable, Revertible-Ordered)

The order below is **authoritative and fixes the contradiction the review found** between this
design's step numbering and the task groups. The invariant: *no step changes filesystem or store
semantics before the tenant, its directory, and its content exist.*

| # | Step | Group | Reversible |
|---|---|---|---|
| 1 | ADRs + docs land | 1 | ✅ |
| 2 | DB port + adapter, **no caller** | 2 | ✅ |
| 3 | Schema step **wired into `deploy.sh`** after `npm ci`, before the in-release suite | 2 | ✅ |
| 4 | Shared authenticated test helper; suites converted | 2 | ✅ |
| 5 | Login route + **its origin throttle in the same group** | 3 | ✅ |
| 6 | Sessions, CSRF, switch-tenant (routes unreachable until step 12) | 3 | ✅ |
| 7 | `establishTenant` + **all 18 PathService call sites** take the root parameter | 4 | ✅ signature change only; behaviour unchanged while callers pass the global root |
| 8 | Tenant bootstrap: Tenant, root directory, root `Resource`, first admin | 4 | ✅ (delete the DB file) |
| 9 | **Relocate `STORAGE_ROOT` → `STORAGE_ROOT/<slug>/`** via copy-verify-switch | 4 | ✅ the original is retained |
| 10 | Retarget `MetadataService`/`SettingsService` to the DB **keeping the JSON fallback** | 5 | ✅ |
| 11 | Remove the JSON fallback | 5 | ❌ **irreversible — the point of no return** |
| 12 | Flip callers to pass the tenant root; enforce `requirePermission` | 5 | ❌ |
| 13 | Audit writes; reconciliation pass | 6 | ❌ |
| 14 | Retire the static proxy paths (staged, §nginx below) | 6 | ⚠️ |
| 15 | Remove `auth_basic` — **only after runtime verification** | 6 | ❌ |

Steps 1–10 are revertible. **Step 11 is the point of no return** — it is the single step that
changes which store is authoritative, and the previous stores still exist on disk through it.
Step 12 is the point at which requests actually require identity.

**Why step 10 splits.** The original plan made "retarget the services" and "remove the JSON
fallback" one commit, which is what made the boundary irreversible. Splitting them gives (a) a
single-step revert, and (b) a **defined degraded mode**: while both exist, an unreadable database
degrades the way `dashboard.controller` already degrades — the response omits that contribution,
rather than serving stale JSON as if it were current.

### Rollback

- **Before step 11:** revert the commit. The JSON stores are still authoritative and still being
  written; the original `STORAGE_ROOT` tree is retained by step 9.
- **After step 11:** the JSON stores are stale. A rollback re-activates the previous release, which
  will serve **pre-cut-over** stars and counters and drop everything written since — **and will
  come up apparently healthy, reporting no error.** This is the hazard the split is designed to
  bound, and it is why the discarded-data decision (below) must be confirmed with the operator
  rather than assumed: the data at risk is exactly the data the migration discards.

### Data Disposition — Confirmed Against The Repository

| Previous state | Disposition | Justification |
|---|---|---|
| `starred[]` | **discarded** | global list with no owner and no tenant; no attribution is recoverable |
| `downloads{}` | **discarded** | per-path counter with no tenant; cannot be attributed |
| `activities[]` | **discarded for content** | schema replaced by `AuditLog`; the 50-row window is a retention class |
| `settings.json` | **not migrated** | 3 keys, re-entered per tenant |
| `STORAGE_ROOT` | **relocated** | the operator's real files; copy-verify-switch |

The loss from discarding is small **precisely because it is analytics with no correctness value**.
That equivalence must be stated to the operator before step 11, not assumed.

## ADR Documentation

This change is the supersession of ADR-001 and ADR-006, not a contradiction of them. Each of the
following records its supersession explicitly in its header, following the instruction both ADRs
contain: *"When a change invalidates any statement above, update this ADR or open a superseding
one — do not silently diverge."* No accepted ADR is edited; new ADRs are added alongside.

- **ADR-009 — Identity and tenancy adopted** (new). Records that the application gains an
  application-level authentication and per-tenant storage boundary. Supersedes the relevant parts
  of ADR-001 §2 (the path boundary now resolves against the tenant root).
- **ADR-010 — Session-based authentication** (new). Records the session model, the cookie+bearer
  credential shape, the CSRF requirement, and the reasons JWT was not chosen.
- **ADR-011 — Database replaces the JSON stores** (new). Records that `node:sqlite` was selected
  for a single-node, no-external-service deployment, that a repository boundary is the portability
  seam, and that ADR-001 and ADR-006's "rejected database" statements are now superseded.
- **ADR-012 — Authorization is directory-resource scoped** (new). Records that `Resource` records
  directories, that `AccessPolicy` is time-bounded and inherited, and that files remain
  filesystem-authoritative.
- **ADR-013 — The compatibility alias is retained but secured** (new). Records that `/api`
  remains mounted, that authentication and tenant context are applied inside the one assembly so
  both prefixes are identical, and that alias removal stays blocked until its own decision.

Each new ADR references the previous one and restates, in one line, which sentence of which older
ADR it supersedes.

## Nginx: Determination, Compatibility And Staged Removal

### What the repository actually says

Three locations in `scripts/nginx/cloudavid.conf` serve filesystem content **without the
application**, all under `files.cloudavid.com`:

| Location | Line | Serves | Gate |
|---|---|---|---|
| `^~ /download/` | 151-157 | `/var/www/html/download/*` via `root /var/www/html` | **none** |
| `^~ /files/` | 159-165 | `/var/www/html/files/*` via `root /var/www/html` | **none** |
| `^~ /__list/` | 113-136 | **any file under `/var/www/html`** + `autoindex_format json` — a directory listing | **none** |

`scripts/nginx/README.md:8` classifies `files.cloudavid.com` as *"static … (none (public))"* and its
README troubleshooting entry (line 258) is explicit: *"the two content locations read
`/var/www/html/download` and `/var/www/html/files` (**siblings of `files-server-web`**)."*

### Determination: **Option A — retire**, and the evidence for it

The review asked whether the intent was (A) retire the static surface, or (B) migrate its content
into the tenant model, and said not to invent the answer. **The repository answers it: they are
different directories, so the static content is not tenant content.**

```
nginx content dirs   /var/www/html/download , /var/www/html/files
application storage  /srv/dimension/storage          ← STORAGE_ROOT (DEPLOYMENT.md:106)
```

No symlink, bind mount, or documented equivalence connects them — `grep` for `ln -s` in the nginx
README finds only the site-config enable. `STORAGE_ROOT` is *"the operator's files"*, owned
`dimension:dimension 0750`; the portal's content is served by nginx as world-readable.

Therefore **proxying `/download/` to the application would not protect those bytes — it would
serve different ones**, because the application would resolve `$STORAGE_ROOT/download/x` while nginx
was serving `/var/www/html/download/x`. The original task 6.6 would have "passed" its source check
while either breaking the published URLs or leaving the content public. **Option A it is: retire
the static surface.**

### Compatibility impact of retiring

- **Published URLs break.** Anything previously reachable at
  `https://files.cloudavid.com/download/…` or `/files/…` stops resolving. There is no in-repo
  consumer of those URLs — `grep` across `public/`, `src/` and every `*.md` finds no reference to
  `files.cloudavid` outside the proxy config and its README — so the application's own clients are
  unaffected. **External** bookmarks and links are not visible in the repository and are the
  operator's to assess.
- **Content must be moved by the operator** into `STORAGE_ROOT` if it is to remain reachable, where
  it becomes tenant-owned and inherits tenant policy. This is the correct outcome: content that was
  world-readable becomes access-controlled.
- **Rollback** is restoring the removed location blocks and re-running `nginx -t && systemctl reload
  nginx` — the content directories were never modified, only unserved.
- **The portal itself** (`files-server-web`, `location /`, the asset cache strategy) is **out of
  scope**: it is a static marketing/download site with no tenant content. This change removes the
  three content-serving locations, not the portal.

### Staged removal (P0-10) — four stages, runtime-verified

The four stages are **separate tasks with separate verifications**. A source-level grep is
explicitly insufficient, because every one of these blocks is syntactically present in the file both
before and after a wrong order.

```
Stage 1  Deploy the application with authentication, authorization, CSRF and audit
         enforcing. Nothing at the proxy changes yet — auth_basic still holds the line.
         VERIFY (runtime): anonymous request to /api/fs/list → 401;
                           authenticated-without-permission → 403;
                           cross-tenant path → 404;
                           audit row written for the denial.

Stage 2  Retire /__list/ (the widest bypass: autoindex over /var/www/html).
         VERIFY (runtime): GET /__list/download/ → 404 from the proxy.

Stage 3  Retire /download/ and /files/.
         VERIFY (runtime): GET /download/<file> → 404 from the proxy;
                           authenticated application download still serves.

Stage 4  ONLY THEN remove auth_basic from the admin vhost.
         VERIFY (runtime): the admin vhost now reaches the application, and an
                           anonymous application request is refused BY THE
                           APPLICATION (401), not by the proxy.
```

**Why runtime verification is mandatory here.** `auth_basic` is the only control standing between
the internet and full read/write on `STORAGE_ROOT`. A grep cannot tell you whether the application
is actually enforcing; only a request can. Removing it on the strength of a source check is the
difference between "the API returns 401" and "the API returns 200 to anyone".

**Interaction with the `admin.` vhost.** It is a pure `proxy_pass` to `127.0.0.1:3000` with no
document root, so it has no bypass of its own. `auth_basic` is removed from it, and nowhere else.
The `files.cloudavid.com` vhost never had `auth_basic` — it was public by design — so retiring its
content locations is what removes that exposure, not the gate.

**Proxying vs `X-Accel-Redirect`.** Normal proxying. `X-Accel-Redirect` would require the
application to emit a filesystem path in a header for nginx to read, reintroducing a second,
nginx-side path authority — the exact bypass class this change exists to close — and would break the
forced-`application/octet-stream` and `X-Preview` discipline ADR-003 established. `fs.createReadStream`
is already constant-memory, so there is nothing to gain.

## API Impact

### Classification

| Route | Today | This change |
|---|---|---|
| `GET /api/v1/health`, `GET /api/health` | public | **public — unchanged** |
| `GET /api/v1/fs/tree`, `GET /api/fs/tree` | public | authenticated, tenant-scoped |
| `GET /api/v1/fs/list`, `GET /api/fs/list` | public | authenticated, tenant-scoped |
| `GET /api/v1/fs/download`, `GET /api/fs/download` | public | authenticated, tenant-scoped, resource-authorized, **no counter written** (D18) |
| `GET /api/v1/fs/thumbnail`, `GET /api/fs/thumbnail` | public | authenticated, tenant-scoped, resource-authorized |
| `GET /api/v1/fs/thumbnail/capability`, `GET /api/fs/thumbnail/capability` | public | authenticated, tenant-scoped |
| `POST /api/v1/fs/folder`, `POST /api/fs/folder` | public | authenticated, tenant-scoped, CSRF-protected |
| `POST /api/v1/fs/upload`, `POST /api/fs/upload` | public | authenticated, tenant-scoped, CSRF-protected, per-tenant concurrency/quota |
| `POST /api/v1/fs/star`, `POST /api/fs/star` | public | authenticated, tenant-scoped, per-account |
| `POST /api/v1/fs/download-zip`, `POST /api/fs/download-zip` | public | authenticated, tenant-scoped, CSRF-protected, authorize-all-before-pipe |
| `PUT /api/v1/fs/rename`, `PUT /api/fs/rename` | public | authenticated, tenant-scoped, CSRF-protected, both endpoints authorized |
| `DELETE /api/v1/fs/delete`, `DELETE /api/fs/delete` | public | authenticated, tenant-scoped, CSRF-protected, validate+authorize-all-then-mutate |
| `GET /api/v1/dashboard/summary`, `GET /api/dashboard/summary` | public | authenticated, tenant-scoped, declared permission |
| `GET /api/v1/dashboard/health`, `GET /api/dashboard/health` | public | authenticated, tenant-scoped, declared permission |
| `GET /api/v1/settings`, `GET /api/settings` | public | authenticated, tenant-scoped, declared permission |
| `PUT /api/v1/settings`, `PUT /api/settings` | public | authenticated, tenant-scoped, declared permission, CSRF-protected |

New routes added inside the same assembly (not new routers, not new mounts):

| Route | Access |
|---|---|
| `POST /api/v1/auth/login` | public (origin-throttled) |
| `POST /api/v1/auth/logout` | authenticated |
| `GET /api/v1/auth/me` | authenticated |
| `POST /api/v1/auth/switch-tenant` | authenticated, membership-verified, new session |

### Request/Response Changes

- **Authentication.** A protected request without a credential returns `401` with the project's
  error envelope. This is a breaking change for any client that relied on anonymous access —
  accepted because none such should exist.
- **Tenant error semantics.** Cross-tenant and outside-root paths are **404**, indistinguishable
  from missing. Same-tenant but unauthorized is **403**. No path in any error body.
- **Batch operations.** A batch containing a malformed or unauthorized member is refused as a
  whole: validation first, then authorization, then mutation. The existing `data.failed` shape is
  preserved only for filesystem-level failures *after* authorization has passed.
- **Health parity.** Both prefixes return the same health body and the same error on unknown
  version (`404`, JSON envelope).
- **CSRF.** Mutating routes require the session-bound CSRF token in the header. Its absence is
  `403`. GET, HEAD, OPTIONS are never mutation-bearing.
- **Response shapes preserved.** Where a shape is already a contract (`GET /api/v1/health`, the
  dashboard summary's field set, the listing payload), it is **not** redesigned. Any field added
  later must be additive within v1; any removal becomes a v2.
- **The `/api` alias is retained.** It is served by the same assembly, the same middleware and the
  same permission declarations, and the versioning contract test asserts that across **every**
  protected route, not a sample. There is no compatibility reason to retire it, and retiring it
  would not reduce exposure.

### Frontend Impact (P0-5) — this is a build, not a patch

The review found **no task covering the SPA at all**, and the gap is large: `app.js loadGlobalData()`
fires three API calls on **every page load of all four shells**, and `api.js` renders any non-2xx as
`Toast.error('Network Error', …)`. After enforcement, an anonymous visit produces **two** error
toasts (`silent:true` suppresses the third), and there is no login view anywhere in the SPA —
`router.js` has no auth awareness at all.

**Required work:**

| Concern | Requirement |
|---|---|
| Authentication module | owns sign-in/sign-out state, the current principal, and the acting tenant |
| Login view | a shell reachable without a session; loads before the protected pages |
| `401` handling in `api.js` | a `status === 401` response raises an **auth-required** signal and is **never** surfaced as `Toast.error('Network Error', …)` |
| Redirect | the shell routes to the login view on auth-required |
| Destination preservation | the intended view is remembered across authentication and restored afterwards |
| Tenant switcher | issues `/auth/switch-tenant`; a successful switch re-enters the acting tenant and refreshes the view |
| Current-user display | the sidebar `.user-avatar` / `.user-name` / `.user-role` elements get a real consumer; `resolveIdentityDisplay` (`app.js:959-966`) currently ignores its argument and returns `{available:false}` |
| Delete-error rendering | `files.js` renders `data.failed`; under atomic batch authorization a denial refuses the whole batch rather than appearing per-path, and the rendering must match |
| `router.js` | teardown and init remain sound across the auth state change; no page module may assume an authenticated context it cannot verify |

**No fabricated identity.** The removed `"Two-factor authentication — Enabled"` badge is not
resurrected. The identity region shows only what the server reports.

## Security Threat Model

Each row names the threat, the consequence, and the mitigation this design provides.

| Threat | Consequence if unmitigated | Mitigation in this design |
|---|---|---|
| **Tenant breakout** | One tenant reads/writes another's files | Tenant derived only from the session; `PathService` resolves only against the tenant root; cross-tenant resolution is 404, not 403; the repository layer requires a non-null tenant argument on every query. No client tenant value is ever authority. |
| **Path traversal** | Escape `STORAGE_ROOT` | Two-layer boundary: `validateClientPath` then `resolveSecurePath` (separator-bounded containment) then `resolveSecureRealPath` (canonicalize and re-check). Tenant root replaces the global root as the containment target. Audited in one place. |
| **Symlink / junction escape** | A link inside the root reads outside it | `resolveSecureRealPath` re-checks containment against the tenant root after canonicalization; link targets outside the tenant are 404. |
| **IDOR / BOLA** | Swap a resource id to reach another tenant's data | There is one id space per tenant: `(tenant_id, client_path)` is the lookup key. A cross-tenant or missing resource resolves to 404 before any database row can redirect I/O. Batch routes validate and authorize all before mutation. |
| **Session theft** | Take over an account | Session token stored only as a hash; cookie is `HttpOnly`; TLS terminates at nginx with `Secure`; rotation on switch-tenant; revocation on logout; expiry enforced on every request. |
| **Session fixation** | Attach a pre-chosen token to a victim | A fresh opaque session is issued at login and at every tenant switch; the old session is revoked. Tokens are never derived from anything guessable. |
| **CSRF** | Execute a mutation as the signed-in user | Session-bound CSRF token required in a header on every non-GET; a cookie-only POST from another site cannot carry the header; SameSite=Lax as a second layer. The safe-method rule is corrected at the source: `GET /fs/download` no longer increments a counter (D18), because a `SameSite=Lax` cookie **is** attached on a cross-site top-level GET and a header token cannot protect a GET. |
| **CORS abuse** | Drive the API from an attacker's page | CORS off by default; when on, configured list only; wildcard never with credentials; production refuses wildcard. |
| **Privilege escalation via role or permission edit** | Grant oneself more power | Permission grants flow only through `RolePermission`; user bindings flow only through `UserRole` at a declared scope; the catalogue is the only source of permission names. A self-serve path for either is not provided. |
| **Cross-tenant access via policy** | A policy names a principal that spans tenants | `AccessPolicy` carries its **own non-nullable `tenant_id`**; evaluation pins `AccessPolicy.tenant_id = :authenticatedTenant`, and an account principal must additionally hold an **active membership** in that tenant to match. `principal_id` is polymorphic and carries no FK, so this tenant-scoped join is the compensating control, stated in the schema. |
| **Expired denial becoming an allowance** | A lapsed `deny` silently opens access | Precedence is fail-closed: a deny at any applicable level withholds access; an expired deny is **inert**, never permissive; with no open allow the result is deny; an unresolvable combination is recorded and denied (D16/P1-2). |
| **Platform scope reading tenant content** | Holding a platform role reads every tenant's files | Platform scope grants **no** `fs.read`/`fs.write`/`fs.delete`. Cross-tenant content access is a separate impersonation capability, explicitly out of this Change (D16). |
| **Information disclosure** | Discover another tenant's existence | Cross-tenant reads return the same 404 shape as missing; the health endpoint carries no environment, count, or identifier; denial responses do not enumerate the caller's permissions; a 404 body for a traversal attempt matches a 404 for a missing path. |
| **Rate-limit bypass** | Exhaust the process or the limiter map | Layers keyed on origin → account → tenant → global; a fixed window's 2× boundary effect is documented and accepted; the login throttle is keyed on origin, not on the submitted account, so it cannot lock out the target. |
| **ZIP/download abuse** | Stream a huge archive or byte-drain the host | Authorization per entry before the first byte is piped; entries validated up front; upload concurrency and free-space watermarks become per tenant; a real-zero vs unavailable distinction is preserved so an empty tenant is not misrepresented. |
| **Concurrent mutations** | A batch deletes part of a set | Validation → authorization → mutation, atomic across a batch; directory rename updates one row in one transaction; a counter increment is one row, never a whole-file rewrite. |
| **Stale authorization** | An old grant keeps working after revocation | Grants are evaluated at request time; `UserRole` removal and `AccessPolicy` edits take effect on the next request; effective permissions may be cached per session but the cache is invalidated on change, never across revocation. |
| **Audit tampering** | Edit history after the fact | The audit interface is create-and-read only; the row references its tenant and is never cascade-deleted; retention is the only removal path and it is age-based. Tampering with the SQLite file directly is a filesystem-permissions concern, not an application API. |

## Security Reviews Embedded In This Change

- The **never-log list** is part of the `AuditLog` schema, so any future field addition must either be justified against it or rejected in review.
- The **error disclosure rule** (no stack, no host path, no source line, no framework name in a response) is asserted by the existing error-disclosure tests and is extended by the new 404-parity test for cross-tenant paths.
- The **"no tenant id from the client"** rule is enforced by the tenant context requirement and asserted by an integration test that posts a contradictory tenant value and expects refusal.

## Migration, Compatibility and Risk (Restated For The Implementer)

- **Revertible-ordered plan** is the Migration Steps table above; the irreversible step is #11
  (removing the JSON fallback), not the retargeting.
- **The compatibility alias is secured, not weakened.** The parity assertion covers every protected
  route.
- **The dependency guardrail holds** because `node:sqlite` is runtime-provided; adding any driver
  would fail the existing assertion and force an explicit guardrail update.
- **If a decision here must change**, it belongs in an ADR delta, not a code-level improvisation.

## Resolved Decisions (formerly open questions)

Each of these was open in the first revision. Each is now decided, with the repository evidence
that decided it.

1. **Tenant slug naming — decided.** A tenant's directory name is its `slug`, stored exactly, and
   validated at creation with the existing `validateFileName` — which already rejects separators,
   `..`, `<>:"|?*\x00-\x1F`, reserved Windows device names, and leading/trailing dots and spaces
   (`src/utils/validators.js:14-52`), the cross-platform rules the repository already enforces
   everywhere. **Normalised to lowercase at creation; rejected on collision** — never silently
   disambiguated, because a renamed slug means a renamed directory and a broken operator
   expectation. Rejecting also sidesteps case-insensitive-volume aliasing (`Foo` vs `foo` as one
   directory on Windows/macOS).
2. **Platform-administrator permissions — decided (D16).** Administration of tenants, accounts and
   role bindings. **No `fs.read`/`fs.write`/`fs.delete`.** Cross-tenant content access is a separate
   impersonation capability, out of this Change. The baseline is the existing single-operator
   capability set, so the tenant-admin permissions are exactly today's fourteen routes.
3. **Ownership of the existing `STORAGE_ROOT` — decided.** It becomes **one** tenant. The
   repository shows exactly one operator, one root (`/srv/dimension/storage`, `dimension:dimension
   0750`, described as "the operator's files"), and one data directory. The bootstrap creates that
   tenant with an operator-chosen slug; the relocation moves the existing content under it by
   copy-verify-switch. There is no second tenant to invent.
4. **Trigger for a future share-links change — decided.** An explicit **product request recorded
   as a new `openspec/changes/` entry**, which is this repository's own mechanism for scoped
   architectural work. Not a runtime setting and not a threat-model trigger, because either would
   require building the share-token schema now — precisely what "do not add unused public
   share-link schema" forbids.
5. **Session duration — decided (D17).** 8-hour absolute · 30-day sliding renewal · re-authentication
   for destructive operations past a stated age. Grounded in `docs/CONTRACTS.md:885`, which records
   the removed *"Session timeout (15 min … Never)"* control and why it was removed.

## Open Questions

**None.** Every question the previous revision carried is now decided above with repository
evidence. Two items remain the **operator's to perform**, not architectural questions, and both are
recorded as steps rather than open design:

- the **slug** chosen for the first tenant (an operator choice, validated by the decided rule);
- the **operator confirmation** that discarding `starred`/`downloads`/`activities` is acceptable —
  which the data-disposition table quantifies, and which must be obtained before step 11.

No question above alters the requirement text in `specs/`; each is a deferral to an operational or
policy decision that a separate review can make without invalidating this design.