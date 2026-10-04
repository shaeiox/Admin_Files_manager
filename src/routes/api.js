// src/routes/api.js
'use strict';

const express = require('express');
const config = require('../config/env');
const fsRoutes = require('./fs.routes');
const dashboardRoutes = require('./dashboard.routes');
const settingsRoutes = require('./settings.routes');

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

// Liveness. Moved here from server.js so every prefix is served by one handler;
// `apiVersion` is additive - success/message/env are unchanged.
router.get('/health', (req, res) => {
    res.json({ success: true, message: 'Dimension API is running', env: config.env, apiVersion: API_VERSION });
});

router.use('/fs', fsRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
