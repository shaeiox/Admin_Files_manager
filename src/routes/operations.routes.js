// src/routes/operations.routes.js
'use strict';

const express = require('express');
const operationsController = require('../controllers/operations.controller');
const { createRateLimit } = require('../middlewares/rateLimit');

const router = express.Router();

/**
 * Status reads for long-running Copy and Move operations.
 *
 * MOUNTED INSIDE src/routes/api.js, which server.js mounts once as
 * app.use(['/api/v1', '/api'], apiRoutes) - so this inherits `authenticate` and
 * `csrf` and needs no guard of its own, and is served identically on both
 * prefixes. Declares no version segment (ADR-007).
 *
 * ITS OWN READ ALLOWANCE. server.js already applies the global limiter to all
 * of /api, and polling must not spend the browsing session's shared budget:
 * a poller running a few times a second would otherwise throttle the user's own
 * file listings and dashboard. A dedicated instance means an operation being
 * polled can exhaust THIS allowance without ever consuming the global one.
 */
const STATUS_READS_PER_MINUTE = 240;

router.get(
    '/:id',
    createRateLimit({ readPerMinute: STATUS_READS_PER_MINUTE }),
    operationsController.getOperation
);

module.exports = router;