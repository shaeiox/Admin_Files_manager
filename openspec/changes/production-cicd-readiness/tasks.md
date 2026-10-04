# Tasks

Phases are dependency-ordered. Phase N+1 assumes Phase N is green. Every task names its files, how to
verify it, and which of the three buckets it belongs to:

- **[READY]** — required for CI/CD readiness. Without it, automated deployment is not reliable.
- **[PREREQ]** — production prerequisite. Not needed to *automate* a deployment, required before the
  service is exposed beyond localhost.
- **[OPTIONAL]** — improvement. Not required for the first working CI/CD implementation.

Verification convention follows the repository: the suite is the authority, and a task that changes
source states the expected suite result. No task adds a dependency or edits an existing test.

**Two standing constraints on every task.** (1) `test/integration/repo-guardrails.test.js` asserts
the manifest is exactly seven prod + one dev package and asserts the `test` script string — no task
may add a dependency or edit that script. (2) No task may edit `uploads.js`, which the unarchived
`upload-pipeline-correctness` change owns.

---

## 0. Preconditions and ownership gates (read-only, no source changes)

- [x] 0.1 **[READY]** Record the baseline: working tree clean, branch, `git log -1`, and `npm test`
output (expected 772 pass / 0 fail). Verify: output captured in the change log.
Depends: none. Risk: none.
**Done:** Branch `master`, HEAD `418aec4`, tree clean except this change; `npm test` 772/772.
- [x] 0.2 **[READY]** Re-run `openspec list --json` and confirm no other change now owns any file
this change touches (`server.js`, `src/config/env.js`, `src/services/MetadataService.js`,
`src/services/SettingsService.js`, `docs/CONTRACTS.md`, `.gitignore`). Verify: no unexpected owner
recorded. Risk: none — read-only.
**Done:** No open task in upload-pipeline-correctness, settings-page-correctness or api-v1-versioning-and-boundary touches server.js, env.js, the stores, CONTRACTS.md or .gitignore.
- [x] 0.3 **[READY]** **OWNERSHIP GATE — `docs/CONTRACTS.md`.** Three changes touch this file. Confirm
`git diff --stat docs/CONTRACTS.md` is empty before Phase 5, and make all edits additive.
Verify: gate decision recorded. Risk: merge friction on a shared file.
**Done:** `git diff --stat docs/CONTRACTS.md` empty at gate time; final diff is 32 additions / 0 deletions.
- [x] 0.4 **[READY]** Inspect the committed `.env` content for any actual credential before deciding
whether history rewriting is needed. Verify: a written statement of whether a credential exists.
Depends: none. Risk: none — read-only. *(Done at proposal time: it contains a port, an environment
name and a local Windows path, and no credential. Re-confirm rather than assume.)*
**Done:** Re-confirmed: `.env` = PORT, NODE_ENV, a Windows STORAGE_ROOT. No credential → no history rewrite.
- [x] 0.5 **[READY]** Answer Open Questions 1 and 2 from `design.md`: can the Git server reach the
Linux host over SSH, and who can push to the deployment branch? Verify: both answered in the change
log. **Do not start Phase 3 without this** — the trigger location depends on it. Risk: none —
read-only, but blocks Phase 3.
**Done:** Maintainer: (1) the Git server CAN reach the host over SSH → post-receive is the primary trigger; (2) only this machine pushes → the post-receive deployment gate is sufficient, no pre-receive escalation.

---

## 1. Repository hygiene — blockers B1, B7, B8 [READY]

No host is running the application, so every task here is trivially revertible. Nothing in this phase
touches runtime behaviour.

- [x] 1.1 Untrack `.env` (`git rm --cached .env`) and commit an `.env.example` enumerating every
supported variable: `STORAGE_ROOT` (required), `PORT`, `NODE_ENV`, `UPLOAD_MAX_BYTES`,
`AFM_DATA_DIR` (added in Phase 2 — coordinate the two). Verify: `git ls-files --error-unmatch .env`
now fails; the example file contains no host value.
Depends: 0.1. Risk: a developer's local `.env` becomes untracked — intended; the file on disk is
untouched by `--cached`.
**Done:** `.env` untracked (`git rm --cached`); `.env.example` lists STORAGE_ROOT, PORT, NODE_ENV, AFM_DATA_DIR, UPLOAD_MAX_BYTES with required/default and no host value.
- [x] 1.2 Widen the `data/` ignore rules so a store document, a backup copy and a local storage root
inside the working tree are all covered, then untrack
`data/metadata.json.corrupt-backup`. Keep `data/.gitkeep` tracked. Verify: `git check-ignore -v`
matches a sample store document, a `.corrupt-backup` copy and `data/storage/`;
`git ls-files data/` lists only `.gitkeep`.
Depends: 0.1. Risk: none.
**Done:** `.gitignore` now `data/*` + `!data/.gitkeep`; check-ignore matches metadata.json, *.corrupt-backup, settings.json.tmp, data/storage/x; `git ls-files data/` = `.gitkeep` only.
- [x] 1.3 Add `.gitattributes` pinning `eol=lf` for `*.sh`, `*.service` and `*.conf` **only**.
Verify: a `git check-attr eol -- scripts/deploy.sh` reports `lf`; and confirm the working tree shows
no mass renormalisation diff for other file types.
Depends: none. Risk: a broader `* text=auto eol=lf` would renormalise every tracked file on a
Windows checkout and produce a large unrelated diff — that rule is deliberately excluded.
**Done:** `.gitattributes`: `*.sh`, `*.service`, `*.conf` and `scripts/git-hooks/*` (the extensionless hook needed its own rule) → `eol=lf`; other files unspecified, no renormalisation diff.
- [x] 1.4 Correct `package.json`'s `repository.url` to match the actual remote. Do **not** add
`engines` in this task (Phase 2 owns it, and the manifest is guardrail-pinned). Verify: the value
matches `git remote get-url origin`.
Depends: none. Risk: none.
**Done:** `repository.url` = `E:/GitServer/Admin-Files-Manager-fixed.git` (matches `origin`).
- [x] 1.5 Confirm the whole suite is still green and that untracking the two data files changed no
behaviour. Verify: `npm test` exits 0 with the test count unchanged.
**Done:** 772/772.

---

## 2. Application source changes — blockers B2, B4 [READY]

Four files, all additive. The suite is the gate; the test count must not decrease and no test file is
edited.

- [x] 2.1 `src/config/env.js`: resolve a store base directory from an explicit variable, defaulting
to today's `<cwd>/data` so local development and every existing suite are unchanged. Verify: a boot
with the variable unset behaves identically to today.
Depends: 1.1. Risk: a default change would break every suite; the default must be byte-identical.
**Done:** Resolved in side-effect-free `src/config/dataDir.js` (AFM_DATA_DIR or `<cwd>/data`), consumed by env.js — the stores cannot import env.js (it is loaded by suites without STORAGE_ROOT). Spec conflict resolved: the cwd fallback applies outside production only; `NODE_ENV=production` without AFM_DATA_DIR refuses startup (persistent-state "unset base directory is a configuration error").
- [x] 2.2 `src/services/MetadataService.js` and `src/services/SettingsService.js`: read the document
path from the resolved base directory instead of `process.cwd()` directly. Verify: `npm test` exits 0
with 772 pass — the suites that redirect `dbPath` directly are unaffected.
Depends: 2.1. Risk: a suite that asserts the store path implicitly could change; the guardrail
assertions on `data/` are the ones to watch.
**Done:** Both stores use `resolveDataDir()`; `_init()` logs `[store] First run: …` so first run is distinguishable from an outage. 772/772.
- [x] 2.3 `src/config/env.js`: replace the presence-only `STORAGE_ROOT` check with validation that
rejects a relative path and a value that is not a usable absolute path on the running platform, and
that detects a root which is absent or untraversable — reporting it as a startup configuration
failure rather than letting requests fail later. Verify: a new **assertion run** (not a committed
test) shows the process exits non-zero at startup for each rejected form, and starts normally for a
valid root.
Depends: none. Risk: over-rejection would refuse a legitimate root; check a symlinked root and a
path containing spaces both still start.
**Done:** `config.validateStartup()`, run by server.js before listen (NOT at module load — PathService suites load env.js with string-only roots). Assertion run (Windows): unset/relative/missing/file roots exit 1 with a named reason; root with spaces and a junction-linked root start. **Deviation:** the presence check moved out of env.js too — it made the suite non-hermetic (MetadataService.dashboard.test.js passed only via a developer .env; found by the release gate). The server still refuses to start without STORAGE_ROOT. POSIX rejection of `C:/…` not exercisable on Windows.
- [x] 2.4 `src/config/env.js`: validate the byte-limit variable as a positive integer within range,
failing startup otherwise rather than silently ignoring it. Verify: assertion run shows non-zero exit
for zero, negative, fractional and non-numeric values; a valid value starts normally.
Depends: none. Risk: none.
**Done:** UPLOAD_MAX_BYTES 0, -5, 1.5, abc, 1e9, 2^66 → exit 1; 1048576 → starts.
- [x] 2.5 Add `engines` to `package.json` declaring the supported runtime range, and add `.nvmrc`
pinning the verified version. Verify: the manifest is still exactly seven prod + one dev package —
`npm test` exits 0, because a guardrail test asserts the dependency list.
Depends: 1.4. Risk: adding a field the guardrail does not expect; it asserts keys of
`dependencies`/`devDependencies` only, not arbitrary manifest fields.
**Done:** `engines.node` `>=24.0.0 <25`; `.nvmrc` 24.15.0; manifest still 7 + 1; 772/772.
- [x] 2.6 `server.js`: register `SIGTERM`/`SIGINT` handlers that stop accepting connections, let
in-flight requests finish, and force-exit after a bounded grace period. Preserve `module.exports =
server` and the `app.listen(config.port)` signature. Verify: the six suites that close the listener
still pass unmodified; and an assertion run shows a process mid-request completes it on signal.
Depends: none. Risk: suites that `require` the entry module and close the handle are the regression
surface — they must not need edits.
**Done:** Assertion run: SIGTERM mid-upload → new connection ECONNREFUSED, the 1.9 MB upload completes 201 byte-exact, exit 0; a never-finishing request → forced exit at 30.03 s, logged, exit 1. Signals driven by `process.emit` (Windows cannot deliver a catchable SIGTERM).
- [x] 2.7 Confirm the graceful-shutdown timeouts are ordered: application grace period shorter than
the service manager's stop timeout, and the proxy read timeout longer than both. Verify: the three
values are recorded in a comment at the handler and in `scripts/systemd/dimension.service`.
Depends: 2.6. Risk: a reversed pair turns a graceful stop into a kill.
**Done:** 30 s (server.js) < 45 s (TimeoutStopSec) < 600 s (nginx), recorded in server.js, the unit and the nginx config.
- [x] 2.8 Full suite green after Phase 2. Verify: `npm test` exits 0, test count ≥ 772, zero failures,
and no test file modified (`git diff --name-only -- test/` is empty).
**Done:** 772/772; `git diff --name-only -- test/` empty.

---

## 3. Deployment artifacts [READY]

Version-controlled so a host's behaviour is diffable rather than hand-typed. Shell scripts are
invoked as `bash <path>` (D9 — the exec bit is not recorded in this repository).

- [x] 3.1 `scripts/deploy.sh`: accept an artifact path and a commit identifier; unpack into a
timestamped immutable release directory under the releases root. Verify: running it with a valid
tarball produces a new directory named for the commit.
Depends: 1.3. Risk: none.
**Done:** `releases/<UTC-stamp>-<sha12>`; verified under Git Bash.
- [x] 3.2 Extend `scripts/deploy.sh` with pre-activation validation: required runtime paths present
(entry point, API assembly, service layer, frontend assets); configured store base directory exists;
configured storage root exists and is a directory; production dependency install completed from the
committed lockfile with dev dependencies omitted; **and the project's own test suite passes in the
release directory**. Verify: each validation aborts with a distinct message when its condition is
falsified, and the suite run is confirmed not to write production `data/` or touch the storage root.
Depends: 3.1, 2.2, 2.3. Risk: a validation that is too strict blocks a legitimate release.
**Done:** Every validation verified to abort with its own message (missing artifact, missing public/, smuggled .env, no env file, absent root, Windows root, data dir inside APP_ROOT); `npm ci --omit=dev` + `npm test` in the release: 772/772, nodemon absent, production data dir and storage root untouched.
- [ ] 3.3 Extend `scripts/deploy.sh` with the activation sequence: capture the currently active
release, switch atomically, restart the service, then poll the versioned health endpoint for a bounded
window and assert the reported API version. Verify: an assertion run shows the pointer changing from
old to new with no intermediate absent state.
Depends: 3.2. Risk: a restart that succeeds but whose process dies immediately is only caught by the
health poll — keep the retry window generous.
**Status:** IMPLEMENTED, NOT VERIFIED: atomic `rename(2)` switch + restart + health poll. Needs Linux symlinks (Windows refuses them; WSL could not start — host out of memory).
- [ ] 3.4 Extend `scripts/deploy.sh` with automatic rollback: on restart failure or health-check
failure, re-activate the captured previous release, restart, and report the failure with the
distinct outcome. Verify: an assertion run with an unreachable health endpoint restores the previous
release and exits non-zero.
Depends: 3.3. Risk: a rollback that itself fails must not mask the original failure.
**Status:** IMPLEMENTED, NOT VERIFIED on Linux. Observed only the first-deploy branch (no previous → `rollback-failed`, exit 4).
- [ ] 3.5 Extend `scripts/deploy.sh` with retention pruning (default five releases) that never
removes the active or previous release, and never fails an otherwise successful deployment. Verify:
an assertion run with six releases leaves five and reports the active and previous ones present.
Depends: 3.4. Risk: pruning the active release would break rollback.
**Status:** IMPLEMENTED, NOT VERIFIED (needs symlinks).
- [x] 3.6 `scripts/trigger-deploy.sh`: package one commit with the declared exclusion list
(version-control metadata, installed dependencies, scratch directories, runtime store documents, the
local configuration file, agent-artifact trees), then ship it and invoke the deploy script.
Verify: a packaged artifact contains the runtime files and none of the excluded paths;
`tar -tzf` output inspected.
Depends: 1.2, 1.3, 3.1. Risk: an exclusion pattern that misses a path lets something unintended ship —
the required-path assertion in 3.2 is the backstop.
**Done:** Allow-list `git archive` of one commit (deviation from D3 recorded in ADR-008 §6): 80 of 492 tracked files, 296 KB; no .env/.git/node_modules/graphify-out/openspec/data/docs/.claude/.agents. Fixed a GNU-tar `C:` remote-host bug (read via stdin).
- [ ] 3.7 `scripts/systemd/dimension.service`: committed unit with `WorkingDirectory` at the active
release, an out-of-band `EnvironmentFile`, the unprivileged identity, an explicit restart policy and
delay, the stop timeout from 2.7, and output captured to the host log. Verify: `systemd-analyze
verify` accepts the unit.
Depends: 2.7. Risk: none.
**Status:** IMPLEMENTED; `systemd-analyze verify` NOT run (WSL unavailable).
- [ ] 3.8 `scripts/nginx/dimension.conf`: committed proxy configuration with a body ceiling
**above** the application limit, request-body and read timeouts longer than the longest legitimate
request, request bodies streamed rather than buffered, forwarded client and scheme headers, HTTP
redirected to TLS, and **no** SPA fallback. Verify: `nginx -t` accepts it against a test
configuration.
Depends: 2.7. Risk: a ceiling set equal to the application limit breaks uploads the moment the
limit is raised.
**Status:** IMPLEMENTED; `nginx -t` NOT run (no nginx available; the Docker image download was declined). `http2 on` dropped for nginx 1.24 compatibility.
- [x] 3.9 Shell-lint all four scripts for CRLF contamination and verify each runs under `bash -n`
with the repository's line endings. Verify: `file` reports no `CRLF`; `bash -n` exits 0 for each.
Depends: 1.3, 3.7, 3.8. Risk: this is the direct test of blocker B8.
**Done:** `bash -n` OK for deploy.sh, trigger-deploy.sh, post-receive; `file` reports no CRLF for all five artifacts.

---

## 4. Host provisioning and first manual deployment [PREREQ] except where marked

Deliberately **not** automated. This phase exists to produce the observation that the mechanism
works before anything triggers it unattended. Nothing in this phase is a CI/CD readiness blocker —
except 4.8, which proves the deployment path.

- [ ] 4.1 **[PREREQ]** Provision the host: runtime at the pinned version, `git`, `rsync`, `curl`,
the proxy, and a TLS certificate. Verify: `node -v` reports the pinned version.
Depends: 2.5. Risk: none.
- [ ] 4.2 **[PREREQ]** Create the dedicated non-login service identity and the directory layout:
releases root, shared store directory, storage root. Ownership: releases root not writable by the
service identity; store and storage root writable by it. Verify: an attempt to write inside a
release directory as the service identity is refused; a store write succeeds.
Depends: 3.7. Risk: wrong ownership either breaks the service or lets it modify its own code.
- [ ] 4.3 **[PREREQ]** Write the out-of-band configuration file outside every release directory, with
read access restricted to the service identity and the deployment mechanism and no world-readable
access. Verify: permissions inspect as intended; a world-readable check returns nothing.
Depends: 2.3, 2.4. Risk: a world-readable configuration file is a credential leak if one is ever
added.
- [ ] 4.4 **[PREREQ]** Install the systemd unit and the proxy configuration from the committed
artifacts, and validate the proxy configuration before applying it. Verify: the service reaches a
listening state; the proxy answers through the TLS endpoint.
Depends: 3.7, 3.8. Risk: none.
- [ ] 4.5 **[PREREQ]** Apply the deny-by-default host firewall permitting only the proxy ports and
the administration port, then confirm the application's own port is unreachable from outside the host.
Verify: an external reachability check fails while a loopback request succeeds.
Depends: 4.4. Risk: locking out administration access — verify the administration rule **before**
enabling enforcement.
- [ ] 4.6 **[READY]** Perform the **first deployment by hand** with `scripts/trigger-deploy.sh` and
watch it complete. This is the task that proves the deployment path; it is the last [READY] item.
Verify: the release directory exists, the service is active, and the versioned health endpoint
reports the expected API version.
Depends: 3.3, 4.4. Risk: none — this is the first exposure of the mechanism.
- [ ] 4.7 **[READY]** Verify persistence end to end: upload a file, star an entry, download it,
record the store documents, deploy again, and confirm the second release sees the same store and the
same files. Then verify retention pruning and single-command rollback against the real host.
Verify: store contents identical across the two releases; rollback returns to the previous release
and the service stays healthy.
Depends: 4.6. Risk: **this is the task that catches blocker B3 in production.** If the store resets,
stop and fix `AFM_DATA_DIR` wiring before continuing.
- [ ] 4.8 **[READY]** Verify the two behaviours the unit and handlers exist for: a restart during an
in-flight upload completes that upload, and a restart during an archive download does not sever it.
Verify: both transfers complete across a restart, observed once each.
Depends: 2.6, 4.6. Risk: this is the direct test of blocker B2 in production.

---

## 5. Trigger automation [READY]

- [ ] 5.1 Provision a deployment identity on the host whose privilege is limited to invoking
`scripts/deploy.sh`, and authorise it by key rather than by password. Verify: the identity can invoke
the deploy script and cannot obtain a general administrative shell.
Depends: 4.6. Risk: over-broad privilege defeats the point of the constraint.
- [ ] 5.2 Install the trigger on the Git server as a `post-receive` hook that packages the pushed
commit and invokes the deploy script, with the suite as the deployment gate.
Verify: a push to the deployment branch deploys; **a push whose suite fails deploys nothing**, and
the failure is visible in the hook output.
Depends: 0.5, 3.6, 5.1. Risk: a `post-receive` hook cannot reject a push — it gates the
**deployment**, not the push. If 0.5 found more than one pushing machine, escalate to a pre-receive
gate instead and record the change.
- [ ] 5.3 Confirm the first automated deployment **watched rather than unattended**, including the
health check and the outcome report. Verify: the outcome is machine-readable and distinguishes
success, pre-activation failure, and post-activation rollback.
Depends: 5.2. Risk: none.
- [ ] 5.4 Serialise overlapping deployments and confirm a stale commit cannot roll the service
backwards over a newer release. Verify: two rapid pushes produce serialised deployments, and the
newer release is the one left active.
Depends: 5.2. Risk: interleaved activation.
- [x] 5.5 **CONDITIONAL — only if an eligible hosted remote has been added.** Write the hosted CI
workflow: the suite gate on every push, deployment only from the deployment branch on a verified
push, pull requests verified but not deployed, runtime taken from the pinned version file, and
credentials read from the platform secret store. Verify: a workflow run gates on the suite and
deploys; a failing suite deploys nothing.
Depends: 0.5, 2.5, 5.2. Risk: writing this against the current remote would create a workflow with
nowhere to run. **Skip this task and record the skip if no hosted remote exists** — the deployment
mechanism from Phase 3 is unchanged either way.
**Done:** SKIPPED — no hosted remote exists (only `E:/GitServer/…`); the post-receive trigger is used instead (D8).

---

## 6. Documentation and decision record [READY] / [PREREQ]

- [x] 6.1 `docs/decisions/ADR-008-production-deployment.md`: the decision record — systemd over a
process manager, no Docker **with the demonstrated-requirement test stated**, the explicit data
directory over the cwd-symlink alternative, the artifact-plus-trigger split, and the trigger choice
given that no hosted remote exists. Verify: the record names an alternative and a rejection reason
for each decision.
Depends: 3.9, 5.2. Risk: none.
**Done:** `docs/decisions/ADR-008-production-deployment.md`.
- [x] 6.2 `docs/DEPLOYMENT.md`: the operator runbook — prerequisites, first install, the required
variable table, deploy, rollback, retention, log location, troubleshooting, and an explicit statement
that the API is **unauthenticated** and that public exposure is blocked on authentication landing.
Verify: an operator can provision a second host from the document alone, without asking a question.
Depends: 4.8, 5.3. Risk: a runbook written after the fact drifts; write it against what was observed.
**Done:** `docs/DEPLOYMENT.md`; its "Verification status" section states what was NOT observed on Linux.
- [x] 6.3 `docs/CONTRACTS.md`: **additive** deployment section — the configuration contract,
persistence guarantees, health endpoint as the activation gate, and the documented release/rollback
model. Restructure nothing. Gate on 0.3. Verify: `git diff --stat docs/CONTRACTS.md` shows additions
only.
Depends: 6.2. Risk: merge friction with three concurrent changes.
**Done:** Additive "Deployment contract (ADR-008)" section, 32 insertions / 0 deletions.
- [x] 6.4 `docs/REPO_MAP.md` and `AGENTS.md`: the new files, the new operational rules, and the
corrected `.env` guidance (a tracked file must also be removed from the index — now actually
enforced). Verify: no stale path remains in `REPO_MAP.md`.
Depends: 6.3. Risk: none.
**Done:** REPO_MAP: scripts/, dataDir.js, env.js role, .env.example/.nvmrc/.gitattributes, DEPLOYMENT.md, ADR-008. AGENTS: env/startup rule, AFM_DATA_DIR, .env actually untracked, deployment contract rule.
- [x] 6.5 Full verification: suite green with the count unchanged, no test modified, manifest still
exactly seven prod + one dev package, and `openspec validate` clean. Verify: all four checks
recorded.
Depends: 6.4. Risk: none.
**Done:** 772/772, no test modified, manifest 7 + 1 with the test script unchanged, `openspec validate --strict` clean.
- [ ] 6.6 **Linux verification of the suite.** The suite has been verified on Windows only; record
the platform and runtime it was verified on and state explicitly whether Linux was exercised. Run
it on the target host before trusting the gate. Verify: a recorded result on Linux.
Depends: 4.6. Risk: **the entire gate is unproven on the deployment platform until this runs.** A
platform-specific assertion would surface here, at the cost of a failed first deploy.
**Status:** NOT RUN. The suite is verified on Windows 10 / Node 24.15.0 only. Risk noted: PathService test 7 feeds Windows root spellings without platform gating.

---

## 7. Optional improvements [OPTIONAL]

None of these is required for the first working CI/CD implementation. Each is recorded so it is not
lost, not because it is needed now.

- [ ] 7.1 Change the request log format from development-oriented to production-oriented. One line,
no behavioural effect, but it touches request handling — so it is not bundled into a
deployment-readiness change.
- [ ] 7.2 Add a bind-host argument so the service can be restricted to loopback by configuration
rather than by firewall alone. Deferred to the authentication work (design D7) because the listen
call is load-bearing for suites that read `server.address().port`.
- [ ] 7.3 Structured logging with a machine-parseable stream. The service currently has no log file
and no parseable log, which limits what an incident can answer.
- [ ] 7.4 Normalise line endings repository-wide with a broader `.gitattributes` rule. Deliberately
excluded from 1.3 because it renormalises every tracked file on a Windows checkout.
- [ ] 7.5 Restore the tracked `data/metadata.json.corrupt-backup` diagnostic file's history value by
relocating it outside the repository. Not needed — the file holds no credential.
- [ ] 7.6 Add a host-side check that the configured byte limit and the proxy ceiling still agree, so
a future limit change cannot silently break uploads at the edge.
- [ ] 7.7 Exclude the agent-artifact directories from version control entirely, rather than only from
the release artifact. Correct hygiene, but a large diff orthogonal to deployment.

---

## Definition of done

- [ ] Every [READY] task is checked, and every skipped task records its skip reason.
- [ ] `npm test` exits 0, the test count has not decreased, and no file under `test/` is modified.
- [ ] The manifest is still exactly seven prod + one dev package, and the `test` script string is
unchanged.
- [ ] `uploads.js` is unmodified.
- [ ] A release has been deployed, rolled back, and pruned on a real host, and persistence across
deploys has been observed rather than assumed.
- [ ] `docs/CONTRACTS.md`, `docs/REPO_MAP.md`, `AGENTS.md`, `docs/DEPLOYMENT.md` and ADR-008 reflect
the shipped behaviour.
- [ ] The authenticated-exposure gap is documented as open, not as resolved.