// src/controllers/groups.controller.js
'use strict';

const GroupService = require('../services/GroupService');
const AuditLogRepository = require('../db/repositories/AuditLogRepository');

function audit(req, action, outcome, targetId) {
    AuditLogRepository.record({
        actorId: req.user ? req.user.id : null,
        action,
        outcome,
        targetType: 'group',
        targetId: targetId ?? null,
        ip: req.ip,
        userAgent: req.get('user-agent') || null,
    });
}

/** Runs a mutating handler with the envelope + audit every admin mutation uses. */
function mutation(action, status, run) {
    return (req, res, next) => {
        const id = req.params.id ? Number(req.params.id) : null;
        try {
            const result = run(req, id);
            audit(req, action, 'success', id ?? (result && result.group ? result.group.id : null));
            return res.status(status).json({ success: true, ...result });
        } catch (error) {
            audit(req, action, 'failure', id);
            return next(error);
        }
    };
}

/** GET /api/admin/groups -> bare array, each group with its members inline. */
function list(req, res, next) {
    try {
        return res.json(GroupService.list());
    } catch (error) {
        return next(error);
    }
}

/** POST /api/admin/groups -> envelope. Body: { name, description? }. */
const create = mutation('group.create', 201, (req) => ({ group: GroupService.create(req.body || {}) }));

/** PUT /api/admin/groups/:id -> envelope. Body: { name?, description? }. */
const update = mutation('group.update', 200, (req, id) => ({ group: GroupService.update(id, req.body || {}) }));

/** DELETE /api/admin/groups/:id -> envelope. Its grants go with it (cascade). */
const remove = mutation('group.delete', 200, (req, id) => {
    GroupService.remove(id);
    return {};
});

/** PUT /api/admin/groups/:id/members -> envelope. Body: { userIds: number[] } (full replace). */
const setMembers = mutation('group.members', 200, (req, id) => ({
    group: GroupService.setMembers(id, (req.body || {}).userIds),
}));

module.exports = { list, create, update, remove, setMembers };
