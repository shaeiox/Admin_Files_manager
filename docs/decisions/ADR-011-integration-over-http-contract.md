# ADR-011 — File Portal Integration over a Versioned HTTP Contract

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Project maintainer
- **Tags:** integration, deployment, security
- **Change:** `openspec/changes/isolate-app-roots` (sibling change of the same name in the File Portal repository)
- **Supersedes:** ADR-010 decision 1 ("the two apps share logical identifiers only, through `admin.sqlite`")

## Context

ADR-010 removed the logical path coupling between this application and the File Portal. The
physical coupling remained:

- Each app's state lived inside its own code folder, and the other app named that folder. The
  portal's `ADMIN_DB_PATH` pointed into this repository, and this app's `PORTAL_LOG_FILE` pointed into the portal's.
- On the reference host the storage (`/opt/`) contained both applications. The admin database,
  the portal's state and both source trees were servable and deletable through the products themselves.
- The portal ran SQL against this application's private tables. As a result:
  - Every migration here could stop it.
  - Read-only WAL access tied both apps to one host, one filesystem and shared `-shm` permissions.
  - The portal received every bcrypt/scrypt password record.
- The access-decision rules existed in both repositories.

## Decision

1. **A code folder holds no state, and the storage overlaps no application.** In production,
   startup refuses an `AFM_DATA_DIR` inside the code folder, and a `STORAGE_ROOT` that contains or is
   contained by the code folder or `AFM_DATA_DIR`. Outside production these only warn.
2. **The portal integrates over HTTP**, through `/api/v1/integration/portal/*`, gated by
   `AFM_PORTAL_SERVICE_TOKEN`:
   - `GET /snapshot` returns contract v1: one JSON document with a strong ETag, built in one read
     transaction.
   - `POST /credentials/verify` checks a portal sign-in. No password record leaves this app. A
     `credentialStamp` ends a user's portal sessions when their password changes.
3. **The contract version is not the schema version.** Additive fields keep `contract: 1`, and
   removing or retyping a field increments it. Migrations here no longer affect the portal.
4. **The owner answers.** With `AFM_PORTAL_URL` set, the Logs pane reads `GET <portal>/api/ops/log`
   and "Check access" asks `POST <portal>/api/ops/access-check`. An unreachable portal is
   reported (`503` for "Check access"), never guessed.
5. **Tests are hermetic.** Under `node --test` a developer's `.env` is not read, so local
   configuration cannot decide whether the suites pass.
6. The storage keeps the ADR-010 `.dimension-volume` identity. The storage bytes are the one
   legitimately shared resource.

## Consequences

- Either application can be copied to any path, under any name, read-only, on another host,
  and still work. The only shared configuration is a URL and a token on each side.
- **Portal sign-in depends on this application being up.** This is accepted, because portal integration
  already fails closed without a fresh snapshot.
- **Size.** Polling builds the document every few seconds to compute its ETag. Measured: 2.1 KB / 0.4 ms
  on the reference data, and 2.0 MB / 59 ms at 10,000 policies.
- **Transitional (one release).**
  - The portal may still read `admin.sqlite` (`ADMIN_DB_PATH`).
  - This app still reads `PORTAL_LOG_FILE` when `AFM_PORTAL_URL` is unset, with a deprecation warning.
  - "Check access" still uses the local mirror when unlinked.

  All three are removed in the next release. After that, `admin.sqlite` is private to this application.
- **Rollout order:**
  1. This app (additive endpoints).
  2. The portal's HTTP source.
  3. Move state and storage, then set the tokens and URLs (see `docs/DEPLOYMENT.md`).
  4. Remove the transitional paths.

## Alternatives rejected

- **SQL views (`portal_v1_*`) in `admin.sqlite`.** They keep the same-host and permission coupling.
- **An exported SQLite file.** Same transport problem as above. An exported JSON file in the same contract format
  remains a possible future transport for hosts without HTTP between the apps.
- **Hiding `data/` folders by name in the file browser.** This treats a symptom: it misses renamed folders and
  still lets the application delete its own code.
