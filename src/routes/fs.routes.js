// src/routes/fs.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const fsController = require('../controllers/fs.controller');

// GET /api/fs/tree
router.get('/tree', fsController.getTree);

// GET /api/fs/list
router.get('/list', fsController.getList);

module.exports = router;