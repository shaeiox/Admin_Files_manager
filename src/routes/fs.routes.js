// src/routes/fs.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const fsController = require('../controllers/fs.controller');

// Read operations
router.get('/tree', fsController.getTree);
router.get('/list', fsController.getList);
router.get('/download', fsController.downloadFile);

// Write / mutation operations
router.post('/folder', fsController.createFolder);
router.put('/rename', fsController.renameItem);
router.delete('/delete', fsController.deleteItems);

module.exports = router;