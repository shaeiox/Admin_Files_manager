// src/controllers/integration.controller.js
'use strict';

const PortalContractService = require('../services/PortalContractService');

/**
 * GET /api/v1/integration/portal/snapshot -> contract v1 document (bare JSON).
 * A matching If-None-Match answers 304 with no body; the portal then keeps its copy.
 */
function snapshot(req, res, next) {
    try {
        const { body, etag } = PortalContractService.snapshot();
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'no-store');
        const presented = String(req.get('if-none-match') || '').split(',').map((s) => s.trim());
        if (presented.includes(etag)) return res.status(304).end();
        res.type('application/json').send(body);
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/v1/integration/portal/credentials/verify {username, password}
 * -> 200 { userId, credentialStamp } | 401 (uniform: never says which part failed).
 */
function verifyCredentials(req, res, next) {
    try {
        const { username, password } = req.body || {};
        const result = PortalContractService.verifyCredentials(username, password);
        if (!result) return res.status(401).json({ success: false, error: 'Invalid credentials' });
        res.setHeader('Cache-Control', 'no-store');
        return res.json(result);
    } catch (error) {
        next(error);
    }
}

module.exports = { snapshot, verifyCredentials };
