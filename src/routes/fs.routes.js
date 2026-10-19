// src/routes/fs.routes.js
'use strict';

const express = require('express');
const router = express.Router();
const fsController = require('../controllers/fs.controller');
const previewController = require('../controllers/preview.controller');

// Read operations
router.get('/tree', fsController.getTree);
router.get('/list', fsController.getList);
router.get('/download', fsController.downloadFile);
router.get('/thumbnail/capability', previewController.getThumbnailCapability);
router.get('/thumbnail', previewController.getThumbnail);

// Write / mutation operations
router.post('/folder', fsController.createFolder);
router.post('/upload', fsController.uploadFile);
router.post('/star', fsController.setStar);
router.post('/download-zip', fsController.downloadZip);
router.put('/rename', fsController.renameItem);
router.put('/move', fsController.moveItems);
router.post('/copy', fsController.copyItems);
router.delete('/delete', fsController.deleteItems);

// Resumable upload sessions (resumable-uploads, ADR-011): an additive surface
// beside the legacy single-request upload above, which is untouched.
router.post('/uploads', fsController.initiateUploadSession);
router.get('/uploads/:id', fsController.getUploadSession);
router.put('/uploads/:id/chunk', fsController.appendUploadChunk);
router.post('/uploads/:id/complete', fsController.completeUploadSession);
router.delete('/uploads/:id', fsController.abortUploadSession);

module.exports = router;