// src/routes/api.js
'use strict';

const express = require('express');
const fsRoutes = require('./fs.routes');
const operationsRoutes = require('./operations.routes');
const dashboardRoutes = require('./dashboard.routes');
const settingsRoutes = require('./settings.routes');
const authRoutes = require('./auth.routes');
const adminRoutes = require('./admin.routes');
const integrationRoutes = require('./integration.routes');
const { authenticate } = require('../middlewares/authenticate');
const csrf = require('../middlewares/csrf');

/**
 * The API surface, assembled once (api-v1-versioning-and-boundary, ADR-007).
 *
 * server.js mounts THIS router at both `/api/v1` (the contract) and `/api` (the
 * retained compatibility alias). Both prefixes therefore run the same router
 * instances, handlers and guards - they cannot drift, and a fix lands on both.
 *
 * Route modules declare no version segment: the version is applied only at the
 * mount site. A future v2 is a separate assembly mounted alongside this one,
 * never a rewrite of `/api/v2` onto v1.
 *
 * The filesystem router is mounted only under `/fs`. It is deliberately NOT
 * remounted under `/dashboard`: that would republish upload/rename/delete/folder/
 * download/ZIP under a second unauthenticated prefix.
 */

/** The API contract version this assembly serves. */
const API_VERSION = 1;

const router = express.Router();

/**
 * Express matches mount paths case-insensitively, so `/api/V1/...` would
 * otherwise be served as v1. A version segment must match exactly; anything else
 * leaves this router and reaches the `/api` catch-all as an unknown version.
 * `req.baseUrl` is the text the mount actually matched (e.g. `/api/V1`).
 */
router.use((req, res, next) => {
    const segment = req.baseUrl.slice(req.baseUrl.lastIndexOf('/') + 1);
    if (/^v\d+$/i.test(segment) && segment !== `v${API_VERSION}`) return next('router');
    next();
});

// Liveness. Moved here from server.js so every prefix is served by one handler.
// `apiVersion` is the deployment activation gate (scripts/deploy.sh) and stays.
// `env` was REMOVED (api-security-hardening): it told an unauthenticated caller
// which environment it was talking to. This is a deliberate departure from the
// additive-only rule of ADR-007 - the field was informational, and hiding the
// runtime environment from an anonymous caller is the point of the change.
router.get('/health', (req, res) => {
    res.json({ success: true, message: 'Dimension API is running', apiVersion: API_VERSION });
});

// Auth routes self-gate (login is public; refresh/logout check their own
// credentials; me requires a session) and must stay mounted BEFORE the blanket
// `authenticate` below, or login and refresh could never be reached (ADR-009).
router.use('/auth', authRoutes);

// File Portal integration contract (isolate-app-roots): service-token gated,
// so it also stays above the session/CSRF guards. 404 when no token is set.
router.use('/integration/portal', integrationRoutes);

// Everything below requires a session - applied once, so /api/v1 and /api
// are secured identically (AGENTS.md rule 4a). /health and /auth/login stay
// reachable with no session.
router.use(authenticate);
router.use(csrf);

router.use('/fs', fsRoutes);
router.use('/operations', operationsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
