// src/routes/admin.routes.js
'use strict';

const express = require('express');
const requireAdmin = require('../middlewares/requireAdmin');
const usersController = require('../controllers/users.controller');
const filePolicyController = require('../controllers/filePolicy.controller');
const systemController = require('../controllers/system.controller');

/**
 * Admin-only endpoints (ADR-009 phase 2): user management and
 * file-access-policy management. Mounted at /admin inside src/routes/api.js,
 * so `authenticate`/`csrf` (applied there) already cover every route here;
 * this router adds the `requireAdmin` role check on top (identity/rbac-lite
 * spec - one middleware, no per-route reimplementation).
 */
const router = express.Router();

router.use(requireAdmin);

router.get('/users', usersController.list);
router.post('/users', usersController.create);
router.post('/users/:id/status', usersController.setStatus);
router.post('/users/:id/reset-password', usersController.resetPassword);
router.post('/users/:id/revoke-sessions', usersController.revokeSessions);
router.delete('/users/:id', usersController.remove);

router.get('/files/policies', filePolicyController.list);
router.get('/files/policy', filePolicyController.getPolicy);
router.put('/files/policy', filePolicyController.setPolicy);
router.delete('/files/policy', filePolicyController.deletePolicy);
router.get('/files/permissions', filePolicyController.listPermissions);
router.post('/files/permissions', filePolicyController.grantPermission);
router.delete('/files/permissions', filePolicyController.revokePermission);

router.get('/portal/config', systemController.getPortalConfig);
router.put('/portal/config', systemController.setPortalConfig);
router.get('/portal/nav', systemController.getPortalNav);
router.put('/portal/nav', systemController.setPortalNav);
router.get('/logs/portal', systemController.getPortalLog);
router.get('/logs/audit', systemController.getAuditLog);

module.exports = router;
