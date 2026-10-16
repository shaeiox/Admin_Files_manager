// src/controllers/system.controller.js
'use strict';

const PortalService = require('../services/PortalService');
const PortalNavService = require('../services/PortalNavService');
const IntegrationSettingsService = require('../services/IntegrationSettingsService');
const AuditLogRepository = require('../db/repositories/AuditLogRepository');

const MAX_AUDIT_ENTRIES = 1000;

/** GET /api/admin/portal/config -> retired: always bare `{ available: false, reason, values: null }`. */
async function getPortalConfig(req, res, next) {
    try {
        return res.json(await PortalService.getConfig());
    } catch (error) {
        return next(error);
    }
}

/** PUT /api/admin/portal/config -> retired: always 503 (see /admin/portal/settings). */
async function setPortalConfig(req, res, next) {
    try {
        return await PortalService.setConfig();
    } catch (error) {
        return next(error);
    }
}

/** GET /api/admin/portal/settings -> bare `{ volume: { id, status }, portalRoot: { clientPath, status }, releaseClientPath, auth }`. */
async function getPortalSettings(req, res, next) {
    try {
        return res.json(await IntegrationSettingsService.get());
    } catch (error) {
        return next(error);
    }
}

/**
 * PUT /api/admin/portal/settings -> envelope `{ success, ...the GET document }`. Strict full replace of
 * `{ portalRootClientPath, releaseClientPath, auth }`; the portal applies it on its next snapshot (no restart).
 */
async function setPortalSettings(req, res, next) {
    const audit = (outcome, detail) => AuditLogRepository.record({
        actorId: req.user ? req.user.id : null,
        action: 'portal.settings',
        outcome,
        targetType: 'portal',
        detail: detail || null,
        ip: req.ip,
        userAgent: req.get('user-agent') || null,
    });
    try {
        const settings = await IntegrationSettingsService.set(req.body);
        audit('success', JSON.stringify({
            portalRoot: settings.portalRoot.clientPath, releaseClientPath: settings.releaseClientPath, auth: settings.auth,
        }));
        return res.json({ success: true, ...settings });
    } catch (error) {
        audit('failure');
        return next(error);
    }
}

/** GET /api/admin/portal/nav -> bare `{ folders }` in navbar order. */
function getPortalNav(req, res, next) {
    try {
        return res.json({ folders: PortalNavService.list() });
    } catch (error) {
        return next(error);
    }
}

/** PUT /api/admin/portal/nav -> envelope. Full replace; the portal picks it up on its next snapshot (no restart). */
async function setPortalNav(req, res, next) {
    const audit = (outcome, detail) => AuditLogRepository.record({
        actorId: req.user ? req.user.id : null,
        action: 'portal.nav',
        outcome,
        targetType: 'portal',
        detail: detail || null,
        ip: req.ip,
        userAgent: req.get('user-agent') || null,
    });
    try {
        const folders = await PortalNavService.set(req.body);
        audit('success', folders.map((f) => f.path).join(', '));
        return res.json({ success: true, folders });
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

module.exports = {
    getPortalConfig, setPortalConfig, getPortalSettings, setPortalSettings, getPortalNav, setPortalNav, getPortalLog, getAuditLog,
};
