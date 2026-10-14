// src/controllers/system.controller.js
'use strict';

const PortalService = require('../services/PortalService');
const AuditLogRepository = require('../db/repositories/AuditLogRepository');

const MAX_AUDIT_ENTRIES = 1000;

/** GET /api/admin/portal/config -> bare `{ available, values }` (read-only, rule 6). */
async function getPortalConfig(req, res, next) {
    try {
        return res.json(await PortalService.getConfig());
    } catch (error) {
        return next(error);
    }
}

/** PUT /api/admin/portal/config -> envelope (mutating). Full replace of the six keys. */
async function setPortalConfig(req, res, next) {
    const audit = (outcome) => AuditLogRepository.record({
        actorId: req.user ? req.user.id : null,
        action: 'portal.config',
        outcome,
        targetType: 'portal',
        ip: req.ip,
        userAgent: req.get('user-agent') || null,
    });
    try {
        const values = await PortalService.setConfig(req.body);
        audit('success');
        return res.json({ success: true, values, restartRequired: true });
    } catch (error) {
        audit('failure');
        return next(error);
    }
}

/** GET /api/admin/logs/portal?limit= -> bare `{ available, entries }`, newest first. */
async function getPortalLog(req, res, next) {
    try {
        return res.json(await PortalService.getLog(req.query.limit));
    } catch (error) {
        return next(error);
    }
}

/** GET /api/admin/logs/audit?limit= -> bare array, newest first. */
function getAuditLog(req, res, next) {
    try {
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 200, 1), MAX_AUDIT_ENTRIES);
        return res.json(AuditLogRepository.list({ limit }));
    } catch (error) {
        return next(error);
    }
}

module.exports = { getPortalConfig, setPortalConfig, getPortalLog, getAuditLog };
