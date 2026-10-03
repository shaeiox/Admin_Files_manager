# ADR-004 — Upload Page Integrity: Consume the Shared Upload Contract, Real Activity or No Section

- **Status:** Accepted
- **Date:** 2026-10-03
- **Deciders:** Project maintainer (`openspec/changes/upload-pipeline-correctness`)
- **Tags:** uploads-page, api-contract, error-disclosure, testing, honesty

## Context

The Upload page is the only page whose whole purpose is to write user data, and it had no automated
coverage. An investigation found it misfiled uploads (a server defect shared with the Files page),
rendered seven invented "recently uploaded" files, claimed checksums, a CDN, encryption, automatic
retry, resumable transfer and compression that nothing implemented, showed `NaN` for a zero-byte file
and `0s left` before any speed was measured, inserted file names into `innerHTML` unescaped, and was
not operable by keyboard or below 560px. Separately, the error handler disclosed stack traces in
every documented start path.

## Decision

### D1 — Consume the shared upload contract; do not re-implement it

Upload placement (field order, truthful `data.path`, overwrite policy, size limit, abort cleanup) is
owned by `upload-destination-integrity` in `files-page-correctness` and implemented in
`UploadService` (ADR-003). This change verified that contract as a gate (placement checked on disk by
`test/api/fs.contract.test.js`) and built the page on top of it. Where the page needed more than the
server provides — a machine-readable failure `kind` — it uses what exists (the HTTP status and the
transport) and records the gap instead of editing the shared controller.

- Rejected: duplicating the server fix here (two changes editing `fs.controller.js` at once).
- Rejected: re-specifying the shared capability under the same spec path (would silently collide).

### D5 — Recent uploads are real recorded activity, or the section goes

The strip reads `activities` from the existing `GET /api/dashboard/summary`, filtered to
`type === 'upload'`. No endpoint was added. An activity carries no byte size, so the card shows none;
populated, empty and unreachable render as three distinct states.

- Rejected: keeping placeholder entries "until an endpoint exists" (a fabricated list is the defect).
- Rejected: resolving each size with `GET /api/fs/list` per folder (an N-request fan-out on page load
  for a figure the record does not contain).

### D9 — Never serialise a stack; no disclosure opt-in

`errorHandler.js` already removes the `stack` field in every environment, forwards only `AppError`
messages and gives everything else a generic message at any status (resolved in the working tree by
work outside this change, before it began). This change does **not** edit `errorHandler.js` or
`env.js`; it pins the behaviour with `test/api/upload.surface.test.js`, including a child
`node server.js` started with `NODE_ENV` unset and no `.env` — the configuration that used to
disclose.

- Rejected: a `DEBUG`-style opt-in that re-enables the stack (keeps a disclosure path on an
  unauthenticated API; the stack belongs in the server log, where it already is).
- Rejected: defaulting `NODE_ENV` to `production` (silently changes `config.env` for every consumer).

### D12 — Test discovery is scoped to `test/`

`npm test` runs `node --test "test/**/*.test.js"`, so a scratch `*.test.js` elsewhere cannot fail the
suite. (Landed with `files-page-correctness`; recorded here because this change relied on it.)

- Rejected: only ignoring a scratch directory in `.gitignore` (discovery would still find the file).

## Consequences

- The Upload page states only what it can measure, and shows `—` for what it cannot.
- Failure kinds for `409`, `413`, `403`, `5xx` and network loss are distinguishable; the three `400`
  classes (bad name, missing destination, destination not a folder) show the server's own message
  until the server sends a `kind`. `api.js` already honours one if it appears.
- The removed claims are inventoried in `docs/CONTRACTS.md` so they can return with a real capability.
- No route, controller or service was added by this change.
