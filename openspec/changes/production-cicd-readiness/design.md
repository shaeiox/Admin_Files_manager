# Design

## Context

See `proposal.md` — Why, for motivation. What follows is only the current state that constrains the
approach, and the decisions built on it. Requirements live in `specs/`; this document does not
restate them.

**Verified facts that shape the approach** (measured on `418aec4`, working tree clean):

| Fact | Consequence for design |
|---|---|
| `npm test` → 772 tests / 145 suites / 0 fail / ~6.7 s; passes with `STORAGE_ROOT`, `PORT` and `NODE_ENV` all unset | The CI gate needs no service, fixture or secret. The pipeline is `npm ci && npm test`. |
| Suites set `PORT='0'`, `DOTENV_CONFIG_QUIET=true`, `os.tmpdir()` trees, and redirect `MetadataService.dbPath` / `SettingsService.dbPath` + caches before requiring `server.js` | The suite is safe to run on the deploy host: it cannot touch production `data/` or `STORAGE_ROOT`. This is what makes a pre-activation gate on the host legitimate. |
| Guardrail suite asserts the manifest is exactly 7 prod + 1 dev packages, **twice**, and asserts the `test` script string | No dependency may be added and `npm test` may not be edited. A CI tool must come from the platform, never from `package.json`. |
| `MetadataService.dbPath` / `SettingsService.dbPath` = `path.join(process.cwd(), 'data', …)`, with `_init()` creating the document when absent | Release layout alone cannot make `data/` persistent. The location has to become explicit — see D1. |
| `src/config/env.js` tests `!config.storageRoot` only | A Windows path satisfies it. `STORAGE_ROOT=C:/…` boots cleanly on Linux and then fails per request. Widening this guard is the single highest-value source change in the change. |
| `app.listen(config.port)` passes no host | The service binds every interface. There is no configuration lever; the host firewall is the only compensating control — see D7. |
| No `engines` field, no `.nvmrc`, no toolchain file | Node is unpinned in both CI and production. |
| `UPLOAD_MAX_BYTES` is a module-level `const` read once at load (`UploadService.js:57`), default 5 GiB | Restart-only semantics; and the proxy ceiling must sit **above** it, not equal to it — see D6. |
| `git remote -v` → `E:/GitServer/Admin-Files-Manager-fixed.git`; `package.json.repository.url` → `…/Admin-Files-Manager.git` (drifted, no `-fixed`) | No hosted remote. A hosted CI service cannot be assumed — see D8. |
| `core.autocrlf=true`, `core.fileMode=false`, no `.gitattributes` | Shell scripts shipped from a Windows working tree arrive with CRLF and no exec bit — see D9. |
| 471 tracked files: 378 agent artifacts (8.6 MB) vs. 93 runtime files (1.7 MB) | Artifact hygiene is a real exclusion problem, not a formality — see D10. |
| `.env` tracked, committed 4×; `data/metadata.json.corrupt-backup` tracked; `data/storage/` not ignored | `.gitignore` rules that never took effect. Two of them are inert because a tracked file ignores its own ignore rule, and one because `data/*.json` does not match `*.json.corrupt-backup`. |
| `GET /api/v1/health` and `GET /api/health` both report `apiVersion: 1` | A ready-made post-activation gate that costs nothing. |
| `upload-pipeline-correctness` is 107/109 and **owns `uploads.js`, unarchived** | No task may touch `uploads.js`. Nothing in this change needs to — see "Concurrency" below. |

## Goals / Non-Goals

**Goals**

- A deploy is one command, produces one immutable release directory, and is reverted by one command.
- Every release passes the project's own 772-test suite **on the deploy host** before it can take traffic.
- A release that misbehaves is detected by the service's own health endpoint and rolled back without a human present.
- `data/` and `STORAGE_ROOT` cannot be destroyed by activating, rolling back or pruning a release.
- A mistaken configuration value fails at startup, not per request.
- The deployment mechanism has **no third-party dependency** and adds **no npm package**.

**Non-Goals** (design-level boundaries, beyond the proposal's scope list)

- Making the application a containerised workload, or adding an artifact registry.
- Introducing a configuration-management tool (Ansible, Puppet) or a secrets manager as a runtime dependency.
- Any change to how the service behaves while serving requests, other than the two startup-time and one shutdown-time changes in D1 and D5.
- Solving authentication, or reducing the API's exposure beyond host-level network restriction.

## Decisions

### D1 — The data directory becomes an explicit input, not a working-directory coincidence

`MetadataService` and `SettingsService` currently resolve their documents from `process.cwd()`.
Three properties are wanted at once: the store must outlive releases, its location must not depend on
where a process happened to start, and an unset location must be a configuration error rather than a
silent write into the current directory.

Both services read one variable, `AFM_DATA_DIR`, falling back to today's behaviour
(`<cwd>/data`) so local development and every existing test are unaffected:

```js
this.dbPath = path.join(config.dataDir, 'metadata.json');
```

where `config.dataDir = process.env.AFM_DATA_DIR || path.join(process.cwd(), 'data')` is resolved
once in `src/config/env.js` — the single place configuration already lives.

**Why not the symlink alternative** — symlink `releases/<id>/data → shared/data` and keep
`process.cwd()`. It needs no source change, and it was the first option considered. Rejected because
it makes correctness depend on a filesystem fact that exists only inside the deploy script: if the
symlink is missing or mistargeted, `_init()` writes a **fresh empty store** and the operator's
download counts, stars and activity are gone with no error. It also leaves `WorkingDirectory`
load-bearing, so a single systemd typo silently relocates the store. Making the location explicit
converts both from "silently wrong" into "refuses to start".

**Cost, stated plainly:** this widens the source footprint of the change from one file to three
(`env.js`, `MetadataService.js`, `SettingsService.js`) plus `server.js`. That is a deliberate trade of
a small, reviewable change for the removal of a data-loss mode.

**Consequence:** `data/` no longer needs to exist inside a release at all. `WorkingDirectory` becomes
conventional rather than load-bearing, and `persistent-state`'s "unset base directory is a
configuration error" requirement becomes implementable without changing the default.

### D2 — One deploy mechanism, pluggable triggers

The deploy mechanism is a single script on the host that accepts a release artifact and a commit
identifier, and does: unpack → validate → link → activate → restart → health-check → roll back on
failure. It knows nothing about git hosting, CI providers or the network path that got the artifact
there.

Triggers are separate and interchangeable:

| Trigger | Requires | Status |
|---|---|---|
| `post-receive` hook on the existing bare repo | SSH reachability from the Git server to the host | **Primary** — works with the remote that exists today |
| Hosted CI workflow | A reachable hosted remote | Conditional — created only if a hosted remote is added |
| Manual invocation | SSH access | Always available; the escape hatch |

The separation matters because the rollback and health-check logic needs to be co-located with the
previous releases on the host, while the trigger is the only part that is environment-specific.

**Why not rsync-over-SSH from CI directly.** It couples the trigger to knowledge of the host's
filesystem layout, and it makes "what changed" implicit. Shipping a self-contained artifact plus an
explicit commit identifier keeps the activation step a pure function of (artifact, commit id).

### D3 — The artifact is a tarball built from one commit, with a declared exclusion list

The trigger builds a tarball from the pushed commit, excluding: version-control metadata, installed
dependencies, scratch directories, runtime store documents, the local configuration file, and the
agent-artifact trees. The deploy script asserts that the unpacked release contains the entry point,
the API assembly, the service layer and the frontend assets, and aborts if any is missing.

**Why assert completeness rather than trust the tarball.** The failure this catches is the one that
matters most: a release that unpacks successfully but is missing `public/` boots, answers
`/api/v1/health`, and serves a broken UI. Health alone does not catch it; an explicit
required-path list does.

**Why not `git archive`.** It would avoid the exclusion list, but it requires git on the target host
and a reachable clone, and it would ship whatever is tracked — which today includes `.env`, a corrupt
store backup, and 378 agent-artifact files. Fixing that requires `git rm --cached` work that is
correct for source hygiene anyway but is a larger diff; the exclusion list is explicit, reviewable,
and works regardless of index state. Both are viable; the exclusion list is chosen because it does
not depend on the index being clean.

### D4 — systemd, not a process manager dependency

**Chosen:** systemd, with a committed unit file and a committed deploy script.

**Alternatives rejected.** `pm2` — a global npm install plus a second supervisor to reason about, for a
single process; it also introduces a package into a project whose manifest is guardrail-pinned.
Plain `nohup`/shell — no restart policy, no stop-timeout control, no log capture, no dedicated
identity; a deployment would then own process lifetime, which is exactly what should not be its job.
Docker — see D10.

systemd gives the four things the deployment needs and nothing more: an unprivileged identity,
`WorkingDirectory` plus an out-of-band `EnvironmentFile`, an explicit restart policy, and a stop
timeout that can be ordered against the application's own grace period (D5).

### D5 — Graceful shutdown, with the timeouts deliberately ordered

`server.js` registers `SIGTERM`/`SIGINT` handlers that call `server.close()`, letting in-flight
requests finish, plus a bounded timer that forces exit so a stuck transfer cannot wedge a deployment.
`module.exports = server` is preserved, so the six suites that close the listener keep working
unchanged.

Ordering is a requirement, not a detail:

| Component | Value | Relationship |
|---|---|---|
| Application grace period | 30 s | exits first |
| Service manager stop timeout | 45 s | must **exceed** the app's, or systemd `SIGKILL`s a draining process |
| Proxy read timeout | 600 s | must **exceed** the app's, or the proxy severs a request the app is still legitimately serving |

Without the handler, every automated restart abandons in-flight uploads and multi-file archive
downloads mid-transfer — which, on a 5 GiB upload path, is a data-integrity event, not a cosmetic one.

**Rejected:** `process.exit()` on signal (abandons in-flight work); `server.closeAllConnections()`
(terminates in-flight work rather than draining it); adding a shutdown library (a new dependency,
for ~15 lines).

### D6 — The proxy ceiling sits above the application limit, deliberately

The application's limit defaults to 5 GiB and nginx's default body ceiling is 1 MB, so an
unconfigured proxy rejects large uploads before the application ever sees them. The committed proxy
configuration sets the ceiling **above** the application limit rather than equal to it, so the
application remains the component that decides acceptance, and an operator raising
`UPLOAD_MAX_BYTES` cannot be defeated by a proxy ceiling that was set to match the old value.

Request bodies are streamed rather than buffered, because the application already stages uploads to
its own file inside `STORAGE_ROOT`; a second full copy in proxy-owned temporary storage would be a
new bottleneck the application never asked for.

**Rejected:** matching the ceiling exactly (a one-value change to the app silently breaks uploads, in
a way that surfaces as a bare proxy 413 with no application log line); disabling the ceiling (moves
the whole burden onto the application and risks filling proxy disk).

The proxy does **not** implement a fallback to the application shell. `server.js` already owns that
behaviour; a second implementation at the proxy would shadow it and could serve a shell for a path
the application intends to 404.

### D7 — Network restriction is a host-firewall decision, and its limitation is documented

`app.listen(config.port)` passes no host argument, so the service binds every interface and there is
no configuration lever to change that. The chosen control is a deny-by-default host firewall that
permits only the proxy ports and the administration port.

This is a **compensating control, not a fix**, and the documentation says so. It does not
authenticate anything: any host that can reach the port can use the API. The alternative — adding a
bind-host argument to `app.listen` — was rejected for this change because `server.js`'s listen call
is load-bearing for the test suites that read `server.address().port`, and changing it would need
those suites adjusted for a security improvement that belongs with the authentication work ADR-003
already gates. It is recorded as a follow-up, not silently dropped.

### D8 — The deployment trigger runs where the repository actually is

There is no hosted remote. The only remote is a bare repository on a Windows drive, and
`package.json.repository.url` has drifted from it. A hosted CI workflow therefore **cannot** be
assumed: there is nowhere for it to run from.

**Chosen:** a `post-receive` hook on the existing bare repository, which packages the pushed commit
and calls the deploy script on the host over SSH. This requires no third-party service and works with
the remote that exists today.

**Consequence, stated honestly:** a `post-receive` hook cannot reject a push — the push has already
landed by the time it runs. So the suite runs *in the hook* and gates the **deployment**, not the
push. A commit whose suite fails reaches the remote and deploys nowhere. Whether that is sufficient
depends on who can push; if pushes come from more than one machine, a pre-receive gate is the
stronger option and is recorded as an open question rather than decided here.

**Precondition to confirm before Phase 2:** the Git server must be able to reach the Linux host over
SSH. If it cannot, the fallback is a manual trigger (`scripts/trigger-deploy.sh <host> <ref>`) until
a hosted remote exists. Either way the deploy mechanism in D2 is unchanged.

A hosted workflow is written **only if** an eligible remote is added, and its creation is a separate
conditional task — not a step that assumes a repository that does not exist.

### D9 — Line endings and the exec bit are fixed at the source

`core.autocrlf=true`, `core.fileMode=false`, and no `.gitattributes`. Two concrete consequences for a
release produced from a Windows working tree:

1. Shell scripts, the systemd unit and the nginx configuration arrive with **CRLF** line endings.
   A CRLF bash script fails on Linux (`\r: command not found`); a CRLF systemd unit or nginx config
   fails to parse. This would surface as a deploy-time failure with an error that points at the
   script rather than at line endings.
2. The executable bit is not recorded, so `./deploy.sh` is not reliably executable.

Fixes: a `.gitattributes` pinning `eol=lf` for the shell, unit and config file types, and invoking
scripts as `bash <path>` rather than relying on the exec bit.

**Scope of the `.gitattributes` deliberately narrowed.** The obvious broader rule
(`* text=auto eol=lf`) would renormalise every tracked file in the working tree on the next checkout,
producing a large, noisy diff on a repository developed on Windows. Only the three file types that
actually break are pinned. The trade-off is that JavaScript and CSS keep arriving CRLF, which is
harmless — Node and browsers both accept it — and the wider normalisation is deferred.

### D10 — No Docker, and the test that justifies it

Rejected. The demonstrated-requirement test: does anything in this design need process isolation,
a reproducible filesystem layer, or an artifact registry?

- Process isolation — there is one process, supervised by systemd (D4).
- Reproducible filesystem layer — there is no build; the artifact is the committed tree plus a
  lockfile install (D3).
- Artifact registry — the artifact travels directly from the trigger to the host (D2).

All three fail, so the image would be a second thing to version, a second place for the tracked
`.env` defect to hide, and a registry to operate. It also contradicts ADR-001's commitment to a
deployment that stays trivially simple. Recorded in ADR-008 with the test stated, so the decision can
be revisited if a requirement that does need isolation ever appears.

### D11 — Hygiene is enforced by exclusion in the deploy path, not by index cleanliness

The 378 agent-artifact files and the two erroneously tracked data files are excluded by the release
exclusion list (D3), so a release is clean **regardless of index state**. Independently, the tracked
`.env` is untracked and the inert ignore rules are corrected, because that is a source-hygiene fix
that has to happen anyway and because `delivery-pipeline` requires a committed secret to be a
blocker.

Both are done, and the distinction is deliberate: the exclusion list is the *guarantee*, the index
cleanup is the *hygiene*. Relying on index cleanliness alone would mean one `git add -f` reintroduces
a secret into a release.

### D12 — Host-side gate: run the project's own suite before activation

The deploy script runs the full suite in the release directory before the switch. Verified safe:
the suites redirect `STORAGE_ROOT`, both `dbPath` values and both in-memory caches to temp trees, and
set `PORT='0'`, so the gate cannot write production `data/` or touch `STORAGE_ROOT`. It runs as the
deploying identity, writing only to the system temp directory.

Rejected: running the suite only in CI. CI does not exist yet (D8), and a host-side gate is what
makes the first deployment safe regardless of where it was triggered from. Once a hosted pipeline
exists, the host-side gate is still worth keeping — it catches a bad host, not just a bad commit.

### D13 — Repository hygiene fixes, precisely scoped

Four index operations, each tied to a specific rule that is currently inert:

| Item | Cause | Action |
|---|---|---|
| `.env` | Tracked files ignore their own ignore rule | `git rm --cached` |
| `data/metadata.json.corrupt-backup` | `data/*.json` does not match `*.json.corrupt-backup` | Untrack, widen rule to `data/` |
| `data/storage/` | Not covered by any rule | Covered by widening to `data/` |
| `AGENTS.md` rule "do not commit `.env`" | States the fix without the fact that a tracked file must also be removed from the index | Keep the rule; the change verifies it is now actually enforced |

`data/.gitkeep` stays tracked — it is the reason `data/` exists in a fresh checkout, and the guardrail
suite's assertions about `data/` behaviour depend on it.

The committed `.env` content was inspected: it contains a port, an environment name and a local
Windows storage path — **no credential**. So no rotation is required. History rewriting is therefore
**not** performed: it is a large, destructive operation with no secret to remove, and doing it would
risk more than it protects. Recorded as a deliberate decision, not an oversight.

## Risks / Trade-offs

**[A release could still lose metadata if the shared data path is misconfigured]** → D1 makes the
location explicit and unset-able only by omission; the deploy script asserts the configured path
exists and is a directory before activation, and the store's own write path is unchanged. Residual
risk: an operator pointing `AFM_DATA_DIR` at an empty directory. Mitigation: the pre-activation
validation checks the path is non-empty when a previous release's store is expected to exist.

**[First-run and outage look identical]** → `persistent-state` requires the distinction; `_init()` logs
first-run initialisation explicitly so the two are separable in the journal.

**[A passing suite on Windows does not prove a passing suite on Linux]** → The suite is
platform-aware (`process.platform` branches, temp dirs, no drive letters), and this change adds a
Linux verification step. The suite has **not** been executed on Linux in this environment — that gap
is recorded as a task, not glossed over.

**[The `post-receive` gate cannot reject a push]** → Accepted (D8); the deployment is gated, not the
push. Escalation to a pre-receive gate is an open question depending on who can push.

**[Three source files change, widening review surface]** → Each is small and additive: one variable
read in `env.js`, one line in each service, one signal handler in `server.js`. No request-path
behaviour changes, and the 772-test suite is the check. `deployment-artifact` and
`runtime-configuration` state the constraints that keep them honest.

**[The proxy ceiling drifting from the application limit]** → D6 sets the ceiling above the limit and
`edge-proxy` requires the mismatch to be recorded as a defect; the runbook documents that changing
`UPLOAD_MAX_BYTES` requires checking the proxy too.

**[Rollback restores code, not data shape]** → Rollback is a code-level operation only. A rollback
onto a release that expects a store document written by a newer release is not covered by any
requirement here; with a single-document store the practical risk is low, and the atomic-write
discipline in the store makes a torn document unlikely. Recorded rather than solved.

**[Health checks a liveness endpoint, not correctness]** → `/api/v1/health` confirms the process
answers and reports the expected API version. It does not prove the UI works or the storage root is
readable. The pre-activation completeness assertion (D3) and the storage-root prerequisite check
cover the gaps that are cheap to cover.

**[`npm ci` needs network access on the host]** → With seven dependencies this is the simplest
option, and it matches ADR-001. If the host is air-gapped, the fallback is to ship the installed
dependency tree inside the artifact; recorded as an open question, not a design change.

## Migration Plan

Phases are ordered so that no phase can damage an existing deployment, because there is no existing
deployment. **Phase 0 is the only phase with no rollback.**

**Phase 0 — Repository hygiene (no runtime effect, `master` only, trivially revertible).**
Untrack `.env` and the corrupt store backup, widen the `data/` ignore rules, add `.gitattributes`,
correct the manifest's repository URL. Nothing on any host is touched. Revert by re-adding the files.

**Phase 1 — Source changes (test-only until deployed).** Widen the `STORAGE_ROOT` guard, add
`AFM_DATA_DIR`, add the signal handlers. Full suite green. Still no deployment, so rollback is a
revert.

**Phase 2 — First manual deployment (single host, operator-driven).** Provision host, identity,
directories, out-of-band configuration, systemd unit, proxy configuration, firewall. Deploy the
initial release **by hand** with the deploy script. Verify persistence, upload at size, health,
rollback, and the restart-during-transfer behaviour. Do not automate what has not been observed to
work; this phase exists to produce that observation.

**Phase 3 — Trigger automation.** Install the trigger on the Git server. Gate is the host-side suite
(D12). First automated deployment is watched, not unattended.

**Phase 4 — Documentation and decision record.** Operator runbook and ADR-008 land with the
mechanism they describe, not before.

**Rollback strategy.** From Phase 2 onward, rollback is a single command that re-activates the
previous release directory and restarts the service — no rebuild, no network, no source retrieval. A
failed post-activation health check triggers it automatically. For Phases 0-1 there is nothing to roll
back: no host is running the application.

**Roll-forward for a bad release that passed the suite.** Ship a fix; the previous release stays
retained, so rollback remains available in the meantime.

## Concurrency With Other Changes

Checked against `openspec list` at creation time:

| Change | State | Interaction |
|---|---|---|
| `upload-pipeline-correctness` | 107/109, **owns `uploads.js`**, unarchived | **No overlap.** This change touches no frontend file. Its ownership of `uploads.js` is untouched. |
| `settings-page-correctness` | 23/25; task 5.4 blocked on the above | No overlap. Its `data/settings.json` concern is *strengthened*, not modified, by D1 — the store location becomes explicit rather than cwd-implicit. |
| `api-v1-versioning-and-boundary` | 41/42; task 4.4 blocked on `uploads.js` | **No overlap and no conflict.** `src/routes/api.js` and the `app.use(['/api/v1', '/api'], apiRoutes)` mount are untouched. This change *consumes* `/api/v1/health` as its post-activation gate and does not alter it. |
| `files-page-correctness` | Complete, unarchived | No overlap. |
| `notification-panel-and-tooltip-placement` | Complete, unarchived | No overlap. |

Two shared-file cautions:

- **`docs/CONTRACTS.md`** is touched by three changes. This change's edits are **additive** (a new
  deployment section); no existing section is restructured. Gate on a clean
  `git diff --stat docs/CONTRACTS.md` at the time of editing, exactly as
  `api-v1-versioning-and-boundary` task 0.4 did.
- **`test/integration/repo-guardrails.test.js`** asserts the manifest's dependency list twice and
  the `test` script string. This change adds **no** dependency and edits **no** test, so those
  assertions keep passing — but they are also the reason a CI tool must come from the platform
  rather than from `package.json`. Do not add a dependency to make CI more convenient.

No task in this change requires a file owned by an unarchived change, so no ownership gate is
blocked. If `upload-pipeline-correctness` archives mid-implementation, nothing here changes.

## Open Questions

Genuinely deferrable — answering any of these does not change the specs, the approach, or the task
breakdown.

1. **Can the Git server reach the Linux host over SSH?** Determines whether the primary trigger
   (D8) is usable as designed or the manual fallback is the starting point. The deploy mechanism is
   identical either way. *Confirm before Phase 3.*
2. **Who can push to the deployment branch?** If more than one machine, a pre-receive gate is
   stronger than the post-receive deployment gate. The trigger's location, not the deploy mechanism,
   is what would change.
3. **Will the host have outbound network access for the lockfile install?** If not, the artifact
   carries the installed dependency tree instead. Affects the artifact build step only.
4. **How many releases should be retained?** Five is chosen as a default. The retention count is a
   deploy-script constant and needs no design change to alter.
5. **Does an operator want a bind-host argument on the application?** Deliberately deferred to the
   authentication work (D7). Adding it would require adjusting suites that read
   `server.address().port`.
6. **Should the log format change from development-oriented to production-oriented?** A one-line
   change with no behavioural effect, but it touches request handling, so it is not bundled into a
   deployment-readiness change. Classified as an optional improvement.