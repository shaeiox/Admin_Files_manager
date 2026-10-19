# Tasks

## 1. Session store and service

- [x] 1.1 Create `src/services/UploadSessionService.js` following the `SettingsService` pattern: singleton, `dbPath` + in-memory cache test seams, atomic temp-file-then-rename writes to `data/upload-sessions.json`. Verify: `node --test test/services/uploadSessionService.test.js` passes.
- [x] 1.2 Implement record lifecycle: open → completed (15-minute tombstone) → swept, 7-day inactivity TTL keyed on `updatedAt` (renewed by appends only), sweep entry point for boot/initiate. Verify: unit tests cover TTL expiry, tombstone expiry, and that reads do not renew.
- [x] 1.3 Implement `receivedBytes` derivation (`stat` of the staged file; missing file reads as 0) and fingerprint matching `(destination, name, size, lastModified)` including supersede of an open session with the same destination+name but a different fingerprint. Verify: unit tests for idempotent match, supersede, and missing-staging cases.
- [x] 1.4 Write the hermetic test suite `test/services/uploadSessionService.test.js` (temp `dbPath`, never the real `data/`) and add the store row to `docs/DATABASE.md` plus the new-file entries to `docs/REPO_MAP.md`. Verify: the suite passes and no file appears under the repo's `data/` afterwards.

## 2. Session endpoints end to end

- [x] 2.1 Register the five handlers in `src/routes/fs.routes.js` / `src/controllers/fs.controller.js` inside the existing assembly (no version segment, no new `app.use`), applying `validateClientPath` / `validateFileName` and `PathService.resolveSecurePath` to every client path. Verify: contract tests reach each endpoint on both `/api/v1` and `/api`.
- [x] 2.2 Implement initiate: fingerprint idempotency with `receivedBytes` in the response, early overwrite refusal on an existing target (legacy parity), size ceiling (`413`), free-space gate through the `_useFreeSpaceReader` seam (`507`), destination validation, `overwrite` refresh. Verify: contract tests assert each outcome; a free-space seam test proves the pre-flight gate.
- [x] 2.3 Implement append: stream the body straight to staging (no body parser may consume it — `application/octet-stream`), validate `offset` against the fresh `stat` (`409 offset_mismatch` carrying current `receivedBytes`), enforce the 32 MiB chunk cap (`413 chunk_too_large`) and declared-size overshoot (`413 size_exceeded`), keep the session on ENOSPC (`507`), and serialize per-session mutations with the promise-chain lock. Verify: contract tests cover each refusal and a concurrent-append test proves the stored data stays an exact prefix.
- [x] 2.4 Implement the bare status read and complete: status answers `{id, destination, name, size, receivedBytes, state, expiresAt}`; complete refuses `409 session_incomplete` and `409 destination_conflict` (session kept), places through `UploadService.commit()`, and answers repeated completion idempotently within the tombstone. Verify: contract tests assert each shape and status.
- [x] 2.5 Implement abort: staged file deleted before the record, `404` for unknown sessions, and nothing visible before completion. Verify: contract tests assert no `.upload-*.part` survives an abort and that `list`/`tree` never show staging.
- [x] 2.6 Attach machine-readable `kind` values to the ambiguous refusals (the three `409`s, both `413`s, `404` expiry) as an additive field on the error envelope, and cover auth/CSRF refusals. Verify: contract tests assert `kind` per outcome and that an unauthenticated or CSRF-less request changes no session or file state.
- [x] 2.7 Write the endpoint rows into `docs/CONTRACTS.md` (shapes, statuses, kinds) and author `docs/decisions/ADR-011-resumable-upload-protocol.md`. Verify: every status and kind in the contract suite appears in the documented tables, and the ADR records the rejected alternatives from `design.md`.

## 3. Rate limiting

- [x] 3.1 Add the optional `skip(req)` predicate to `createRateLimit` in `src/middlewares/rateLimit.js` without changing default behavior. Verify: the existing rate-limit suite stays green and a new unit case proves `skip` bypasses only the matching requests.
- [x] 3.2 Mount in `server.js`: the general limiter skips the chunk route on both prefixes, and the chunk route carries its own instance sized by `AFM_RATE_LIMIT_CHUNK_PER_MINUTE` (default `600`, `0` disables via `perMinute()`), applied after `authenticate` and before any file work. Verify: a live-server test proves >60 appends/min from one client pass, other writes still `429` past 60/min, appends `429` past the chunk allowance, and `.env.example` documents the variable.

## 4. Frontend transport

- [x] 4.1 Add the session builders to `public/assets/js/api.js` (initiate, status, chunk append with XHR progress and abort, complete, abort) including the CSRF header — no URL built anywhere else. Verify: `test/integration/repo-guardrails.test.js` stays green and the updated uploads tests assert the builders exist.
- [x] 4.2 Rework the transfer loop in `public/assets/js/uploads.js`: pause aborts only the in-flight chunk and keeps the session, resume/retry continue from the server's `receivedBytes`, cancel issues the DELETE, re-adding a file adopts a matching open session mid-transfer, unacknowledged bytes roll back on failure, and failure kinds come from status + `kind`. Verify: `node --test test/frontend/uploads.test.js` passes with updated pins.
- [x] 4.3 Update the copy and the tests that pin it: no string may still promise "restarts from the beginning"; resumed items display acknowledged progress. Verify: the old claim has no grep hit in `public/` or the tests, and the frontend suite stays green.
- [x] 4.4 Manual browser verification against a live server with a small `UPLOAD_MAX_BYTES`: interrupt a transfer (DevTools offline), retry continues; pause/resume preserves progress; reload + re-add adopts the session; cancel leaves nothing behind. Verify: each flow observed and recorded in the task's completion note.
  2026-10-18, Playwright-driven msedge against a live server (`UPLOAD_MAX_BYTES` 256 MiB). The harness's offline toggle proved inert, so the interrupt was the stronger real-world equivalent: a hard server kill mid-chunk, then retry after restart.
  - **Interrupt + retry**: row Failed while a 15,040,512-byte `.upload-*.part` prefix survived the kill; retry resumed at `offset=15040512` (server `stat`, not the client), stepped to complete — sha256 equals the fixture.
  - **Pause/resume**: "Paused … Resumes from where it stopped", 8,388,608 bytes staged at the acknowledged boundary, resume continued at `offset=8388608` — sha256 equals the fixture.
  - **Reload + re-add**: reload emptied the queue; re-selecting the same file adopted the session and chunk PUTs resumed at `offset=83886080` — sha256 equals the fixture.
  - **Cancel**: row gone, `DELETE /fs/uploads/1062a8b9…` 200, no delivered file, no `.upload-*.part`, no session record left.
  - Also observed live: the 413 size-ceiling copy ("File exceeds the maximum upload size of 64 MB (67108864 bytes)."), a mid-transfer 401 → refresh → retry, and idle-tab recovery.

## 5. Integration checks

- [x] 5.1 End-to-end test through the live server: interrupt a transfer, re-initiate by fingerprint, complete, and compare the delivered file byte-for-byte with the fixture; assert the staged file is gone. Verify: test exits green.
- [x] 5.2 Restart-durability test: boot a second server instance on the same `STORAGE_ROOT` and store between chunks, resume, complete, and compare bytes. Verify: test exits green.
- [x] 5.3 Run the whole suite and the change validator. Verify: `npm test` exits 0 (all suites, guardrails included) and `openspec validate resumable-uploads` passes.
  (2026-10-18: `npm test` exit 0 — 1341/1341 pass, 288 suites, no failures; `openspec validate resumable-uploads` → valid, with only the documented INFO that the `upload-pipeline-correctness` archive must land first.)

## Workflow follow-up

- Archive `upload-pipeline-correctness` first: the `upload-queue-integrity` delta modifies the capability that change carries, and the target spec must exist when this change is archived.
- Archive this change, then verify the merged specs: `openspec/specs/upload-queue-integrity/spec.md` contains the updated pause scenario and the replaced retry requirement, and `openspec/specs/upload-resumption/spec.md` exists.
- If a non-default chunk allowance is wanted in production, set `AFM_RATE_LIMIT_CHUNK_PER_MINUTE` in `/etc/dimension/dimension.env` (never in a release).
