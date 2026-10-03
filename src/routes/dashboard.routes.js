// src/routes/dashboard.routes.js
'use strict';

const express = require('express');
const dashboardController = require('../controllers/dashboard.controller');

const router = express.Router();

/**
 * Dashboard routes.
 *
 * Route declarations only - no filesystem or metadata access lives here.
 *
 * Mounted at /api/dashboard BEFORE the `/api` catch-all in server.js, because that
 * catch-all is a two-argument middleware that never calls next() and therefore
 * terminates the chain: anything mounted after it is unreachable.
 *
 * The filesystem router is deliberately NOT remounted here. Doing so would expose
 * all eight filesystem routes - upload, rename, delete, folder, download, ZIP -
 * under /api/dashboard on an unauthenticated server.
 */
router.get('/summary', dashboardController.getSummary);
router.get('/health', dashboardController.getHealth);

module.exports = router;
