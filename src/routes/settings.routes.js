// src/routes/settings.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');

// Read operations
router.get('/', settingsController.getSettings);

// Write / mutation operations
router.put('/', settingsController.replaceSettings);

// Only GET and PUT exist. There is deliberately no POST /action, no DELETE and
// no reset endpoint: the Settings page holds no destructive control, and adding
// one without authentication (ADR-003) is out of scope by design D5/ADR-006.
// Anything else under /api/settings falls through to the /api catch-all 404.

module.exports = router;
