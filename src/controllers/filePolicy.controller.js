// src/controllers/filePolicy.controller.js
'use strict';

const FileAccessPolicyService = require('../services/FileAccessPolicyService');
const AuditLogRepository = require('../db/repositories/AuditLogRepository');
const UserRepository = require('../db/repositories/UserRepository');
const PortalClient = require('../services/PortalClient');
const AppError = require('../utils/AppError');
const { validateClientPath } = require('../utils/validators');

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
 *
 * With AFM_PORTAL_URL the portal itself answers (`POST /api/ops/access-check`,
 * isolate-app-roots D7), so there is one owner of the decision. Unreachable:
 * 503, never a guess. Unlinked: the local mirror, until it is removed (task 3.3).
 */
async function effectiveAccess(req, res, next) {
    try {
        const clientPath = req.query.path;
        const userId = req.query.userId ? Number(req.query.userId) : null;
        if (!PortalClient.portalUrl()) return res.json(FileAccessPolicyService.portalAccess(clientPath, userId));

        validateClientPath(clientPath);
        if (userId !== null && !UserRepository.findById(userId)) throw new AppError('User not found.', 404);
        const answer = await PortalClient.call('POST', '/api/ops/access-check', { clientPath, userId });
        if (!answer.ok) throw new AppError(`The File Portal is ${answer.reason}; its decision cannot be checked.`, 503);
        const body = answer.json;
        if (answer.status !== 200 || !body || typeof body.outcome !== 'string' || !Array.isArray(body.policies)) {
            throw new AppError(`The File Portal answered HTTP ${answer.status}; its decision cannot be checked.`, 503);
        }
        return res.json({ outcome: body.outcome, policies: body.policies });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    list, getPolicy, setPolicy, deletePolicy,
    listPermissions, grantPermission, revokePermission, listGroupPermissions, effectiveAccess,
};
