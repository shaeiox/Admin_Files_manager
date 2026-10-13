// src/controllers/users.controller.js
'use strict';

const UserService = require('../services/UserService');
const SessionService = require('../services/SessionService');
const AuditLogRepository = require('../db/repositories/AuditLogRepository');

function audit(req, action, outcome, targetId) {
    AuditLogRepository.record({
        actorId: req.user ? req.user.id : null,
        action,
        outcome,
        targetType: 'user',
        targetId: targetId ?? null,
        ip: req.ip,
        userAgent: req.get('user-agent') || null,
    });
}

/** GET /api/admin/users -> bare array (read-only aggregate precedent, rule 6). */
function list(req, res, next) {
    try {
        return res.json(UserService.list());
    } catch (error) {
        return next(error);
    }
}

/** POST /api/admin/users -> envelope (mutating, rule 6). */
function create(req, res, next) {
    try {
        const { username, email, password, role } = req.body || {};
        const user = UserService.create({ username, email, password, role });
        audit(req, 'user.create', 'success', user.id);
        return res.status(201).json({ success: true, user });
    } catch (error) {
        audit(req, 'user.create', 'failure');
        return next(error);
    }
}

/** POST /api/admin/users/:id/status -> envelope. Body: { status: "active"|"disabled" }. */
function setStatus(req, res, next) {
    try {
        const id = Number(req.params.id);
        const user = UserService.setStatus(id, req.body && req.body.status);
        if (user.status === 'disabled') SessionService.revokeAllForUser(id);
        audit(req, 'user.status', 'success', id);
        return res.json({ success: true, user });
    } catch (error) {
        audit(req, 'user.status', 'failure', Number(req.params.id) || null);
        return next(error);
    }
}

/** POST /api/admin/users/:id/reset-password -> envelope. Body: { password }. */
function resetPassword(req, res, next) {
    try {
        const id = Number(req.params.id);
        const user = UserService.resetPassword(id, req.body && req.body.password);
        SessionService.revokeAllForUser(id);
        audit(req, 'user.reset_password', 'success', id);
        return res.json({ success: true, user });
    } catch (error) {
        audit(req, 'user.reset_password', 'failure', Number(req.params.id) || null);
        return next(error);
    }
}

/** POST /api/admin/users/:id/revoke-sessions -> envelope. */
function revokeSessions(req, res, next) {
    try {
        const id = Number(req.params.id);
        SessionService.revokeAllForUser(id);
        audit(req, 'user.revoke_sessions', 'success', id);
        return res.json({ success: true });
    } catch (error) {
        audit(req, 'user.revoke_sessions', 'failure', Number(req.params.id) || null);
        return next(error);
    }
}

/** DELETE /api/admin/users/:id -> envelope. */
function remove(req, res, next) {
    try {
        const id = Number(req.params.id);
        UserService.delete(id);
        SessionService.revokeAllForUser(id);
        audit(req, 'user.delete', 'success', id);
        return res.json({ success: true });
    } catch (error) {
        audit(req, 'user.delete', 'failure', Number(req.params.id) || null);
        return next(error);
    }
}

module.exports = { list, create, setStatus, resetPassword, revokeSessions, remove };
