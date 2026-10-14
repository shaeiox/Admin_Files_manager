---
title: Getting Started
type: onboarding
language:
  - javascript
status: generated
complexity: low
dependencies:
  - "[[Server Bootstrap and Config]]"
related-notes:
  - "[[First Contribution]]"
  - "[[Debugging Guide]]"
  - "[[System Overview]]"
  - "[[Authentication and CSRF]]"
  - "[[Frontend Core]]"
  - "[[Feature Pages]]"
  - "[[Files Page]]"
canonical-source: server.js
generated-by: code-to-docs
generated-at: 2026-10-14T05:05:10Z
mode: full
tags:
  - code-docs
  - onboarding
---

# Getting Started

Dimension is a self-hosted admin file manager. It runs as a single Node.js process. That process serves an Express 5 REST API over one sandboxed directory (`STORAGE_ROOT`) and a vanilla JS single-page app from `public/`, with no build step. This note covers getting it running locally, signing in, and finding your way around.

> [!tip] Prerequisites
> - **Node.js 24.x.** `package.json` declares `"engines": { "node": ">=24.0.0 <25" }`, and `.nvmrc` pins `24.15.0`. The auth layer uses `node:sqlite`, which is why the version range is narrow.
> - npm (bundled with Node).
> - An existing directory that the server can expose as its storage root.

## 1. Install

```bash
npm install
cp .env.example .env
```

`.env` is git-ignored and untracked. Never commit it. `.env.example` is the template. Variables that are already set in the process environment always win, because dotenv only fills in unset ones. Every value is read once at startup, so a change needs a restart.

## 2. Configure `.env`

The names below come from `.env.example` and were checked against `src/config/env.js`, `src/services/UploadService.js`, `src/middlewares/rateLimit.js` and `src/routes/auth.routes.js`.

| Variable | Required? | Default | Notes |
|---|---|---|---|
| `STORAGE_ROOT` | **Yes** | none | Absolute path to an **existing**, readable, traversable directory. The service never creates it. |
| `PORT` | No | `3000` | Not validated by `validateStartup` (see [[Debugging Guide]]). |
| `NODE_ENV` | No | `development` | `production` additionally **requires** `AFM_DATA_DIR`. |
| `AFM_DATA_DIR` | Production only | `<cwd>/data` | Holds `metadata.json`, `settings.json` and `admin.sqlite`. |
| `UPLOAD_MAX_BYTES` | No | `5368709120` (5 GiB) | Must be a positive integer. Read by `UploadService`. |
| `AFM_BOOTSTRAP_ADMIN_USERNAME` / `AFM_BOOTSTRAP_ADMIN_PASSWORD` | Together, on first boot | unset | Creates the first admin account (ADR-009). Supply both or neither. |
| `AFM_CORS_ENABLED`, `AFM_CORS_ALLOWED_ORIGINS`, `AFM_CORS_ALLOW_WILDCARD` | No | off | Same-origin by default. A malformed origin stops startup. |
| `AFM_UPLOAD_FREE_SPACE_BYTES` | No | `104857600` | An upload is refused with `507` below this watermark. `0` disables the check. |
| `AFM_UPLOAD_MAX_CONCURRENT` | No | `4` | Uploads beyond this limit get `429`. |
| `AFM_RATE_LIMIT_WRITE_PER_MINUTE` / `AFM_RATE_LIMIT_READ_PER_MINUTE` | No | `60` / `600` | Separate buckets for writes and reads. |
| `AFM_LOGIN_RATE_LIMIT_PER_MINUTE` | No | `10` | Per IP, independent of the buckets above. |

A minimal local `.env` looks like this:

```dotenv
STORAGE_ROOT=D:/dimension-storage
AFM_BOOTSTRAP_ADMIN_USERNAME=admin
AFM_BOOTSTRAP_ADMIN_PASSWORD=<choose a local-only password>
```

> [!warning] The bootstrap pair is not a default
> No account is hardcoded. If both bootstrap variables are unset, startup still succeeds, but nobody can sign in until you set them and restart. The admin is created only once, when no admin exists yet.

## 3. Run

```bash
npm run dev    # nodemon on http://localhost:3000 (ignores data/* and public/*)
npm start      # plain node server.js
npm test       # node:test, zero dependencies, discovers test/**/*.test.js only
```

At boot, `server.js` does the following in order (see [[Server Bootstrap and Config]]):

1. Runs `config.validateStartup()`. Each problem is printed as `FATAL CONFIGURATION ERROR: ...` and the process exits with code 1.
2. Opens and migrates the SQLite admin database synchronously, then runs `ensureBootstrapAdmin()`.
3. Starts listening on `PORT`.

Health check: `GET /api/v1/health` (alias `/api/health`) returns `apiVersion: 1` and needs no session.

`npm test` is hermetic. It needs no `.env`, and every suite redirects the stores to temp files. See [[Debugging Guide]] for how that works.

## 4. First login

1. Open `http://localhost:3000/`. With no session, the API answers `401`, and `api.js` redirects to `login.html`.
2. Sign in with the bootstrap credentials. `POST /api/v1/auth/login` sets the `afm_session` cookie and returns a CSRF token. `api.js` keeps that token in a closure and sends it as `X-CSRF-Token` on every non-GET request.
3. Sessions expire after a flat 24 h. Ten failed logins lock the account. Details are in [[Authentication and CSRF]] and [[Auth and Access Control]].

## 5. Tour of the app

`router.js` swaps pages in place without a full reload (ADR-005). The sidebar is the same on every page.

| Page | File | What it does | Backed by |
|---|---|---|---|
| **Dashboard** | `index.html` / `dashboard.js` | Storage use, file and folder counts, recent activity, top downloads, a process health poll. Every figure is instantaneous: there are no trends, and a value that could not be measured shows as `—` (ADR-002). | `GET /api/dashboard/summary`, `/health` |
| **Files** | `files.html` / `files.js` | Tree and list browsing, search, drag-and-drop upload, cut, copy and move, star, rename (same directory only), permanent delete, ZIP download, access policies. | `/api/fs/*` |
| **Uploads** | `uploads.html` / `uploads.js` | Upload queue with progress, a concurrency preset, destination check and creation, and recent uploads taken from the activity log (ADR-004). | `POST /api/fs/upload` |
| **Settings** | `settings.html` / `settings.js` | Persists exactly three keys: `general.workspaceName`, `general.defaultUploadFolder` and `appearance.defaultView`. The theme stays browser-local (ADR-006). | `GET`/`PUT /api/settings` |
| Admin | `admin.html` / `admin.js` | User management and file-access-policy management, for admins only. Policies are stored but **not enforced** yet. | `/api/admin/*` |
| Login | `login.html` / `login.js` | A standalone page outside the router, with an open-redirect guard on `?redirect=`. | `/api/auth/*` |

> [!info] Deletion is permanent
> There is no trash. `DELETE /api/fs/delete` runs a recursive `fs.rm`.

## 6. Where to read next

1. `AGENTS.md` (repo root) covers the non-negotiable rules. Then `docs/REPO_MAP.md` for the map and `docs/CONTRACTS.md` for the API schemas.
2. In this vault: [[System Overview]] and [[Dependency Map]] for the big picture, then [[Index]].
3. [[First Contribution]] before changing code. [[Debugging Guide]] when something refuses to work.
4. Cross-cutting rules you will run into almost at once: [[Path Containment and Client Paths]], [[Error Contract and Sanitization]] and [[Truthful Reporting and Unavailability]].
5. `docs/decisions/ADR-001` through `ADR-009` for why things are the way they are. `docs/DEPLOYMENT.md` and [[Deployment Scripts]] for production.
