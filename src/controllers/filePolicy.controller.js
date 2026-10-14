// src/controllers/filePolicy.controller.js
'use strict';

const FileAccessPolicyService = require('../services/FileAccessPolicyService');
const AuditLogRepository = require('../db/repositories/AuditLogRepository');

function audit(req, action, outcome, detail) {
    AuditLogRepository.record({
        actorId: req.user ? req.user.id : null,
        action,
        outcome,
        targetType: 'file',
        detail: detail || null,
        ip: req.ip,
        userAgent: req.get('user-agent') || null,
    });
}

/** GET /api/admin/files/policies -> bare array (read-only aggregate precedent, rule 6). */
function list(req, res, next) {
    try {
        return res.json(FileAccessPolicyService.list());
    } catch (error) {
        return next(error);
    }
}

/** GET /api/admin/files/policy?path=... -> bare object or null. */
function getPolicy(req, res, next) {
    try {
        return res.json(FileAccessPolicyService.getByPath(req.query.path));
    } catch (error) {
        return next(error);
    }
}

/**
 * PUT /api/admin/files/policy -> envelope. Body:
 * { path, isDirectory?, accessMode?, isPublished?, isLocked?, availableFrom?, availableUntil?, defaultLevel? }
 */
function setPolicy(req, res, next) {
    const { path: clientPath, isDirectory, accessMode, isPublished, isLocked, availableFrom, availableUntil, defaultLevel } = req.body || {};
    try {
        const policy = FileAccessPolicyService.setPolicy(clientPath, {
            isDirectory, accessMode, isPublished, isLocked, availableFrom, availableUntil, defaultLevel,
            actorId: req.user.id,
        });
        audit(req, 'file.policy.update', 'success', clientPath);
        return res.json({ success: true, policy });
    } catch (error) {
        audit(req, 'file.policy.update', 'failure', clientPath);
        return next(error);
    }
}

/** DELETE /api/admin/files/policy?path=... -> envelope. */
function deletePolicy(req, res, next) {
    const clientPath = req.query.path;
    try {
        FileAccessPolicyService.deletePolicy(clientPath);
        audit(req, 'file.policy.delete', 'success', clientPath);
        return res.json({ success: true });
    } catch (error) {
        audit(req, 'file.policy.delete', 'failure', clientPath);
        return next(error);
    }
}

/** GET /api/admin/files/permissions?path=... -> bare array. */
function listPermissions(req, res, next) {
    try {
        return res.json(FileAccessPolicyService.listPermissions(req.query.path));
    } catch (error) {
        return next(error);
    }
}

/**
 * POST /api/admin/files/permissions -> envelope.
 * Body: { path, userId | groupId, permission, level? } - level defaults to "download".
 */
function grantPermission(req, res, next) {
    const { path: clientPath, userId, groupId, permission, level } = req.body || {};
    try {
        if (groupId !== undefined) {
            const grant = FileAccessPolicyService.grantGroupPermission(clientPath, Number(groupId), permission, req.user.id, level);
            audit(req, 'file.permission.grant', 'success', `${clientPath} group:${groupId} ${permission}:${level || 'download'}`);
            return res.status(201).json({ success: true, permission: grant });
        }
        const grant = FileAccessPolicyService.grantPermission(clientPath, Number(userId), permission, req.user.id, level);
        audit(req, 'file.permission.grant', 'success', `${clientPath} user:${userId} ${permission}:${level || 'download'}`);
        return res.status(201).json({ success: true, permission: grant });
    } catch (error) {
        audit(req, 'file.permission.grant', 'failure', clientPath);
        return next(error);
    }
}

/** DELETE /api/admin/files/permissions -> envelope. Body: { path, userId | groupId }. */
function revokePermission(req, res, next) {
    const { path: clientPath, userId, groupId } = req.body || {};
    try {
        if (groupId !== undefined) FileAccessPolicyService.revokeGroupPermission(clientPath, Number(groupId));
        else FileAccessPolicyService.revokePermission(clientPath, Number(userId));
        audit(req, 'file.permission.revoke', 'success', clientPath);
        return res.json({ success: true });
    } catch (error) {
        audit(req, 'file.permission.revoke', 'failure', clientPath);
        return next(error);
    }
}

/** GET /api/admin/files/group-permissions?path=... -> bare array. */
function listGroupPermissions(req, res, next) {
    try {
        return res.json(FileAccessPolicyService.listGroupPermissions(req.query.path));
    } catch (error) {
        return next(error);
    }
}

/**
 * GET /api/admin/files/effective?path=...&userId=... -> bare { outcome, policies[] }:
 * what the File Portal decides. Omit userId for a visitor who is not signed in.
 */
function effectiveAccess(req, res, next) {
    try {
        const { userId } = req.query;
        return res.json(FileAccessPolicyService.portalAccess(req.query.path, userId ? Number(userId) : null));
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    list, getPolicy, setPolicy, deletePolicy,
    listPermissions, grantPermission, revokePermission, listGroupPermissions, effectiveAccess,
};
