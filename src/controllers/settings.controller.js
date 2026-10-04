// src/controllers/settings.controller.js
'use strict';

const SettingsService = require('../services/SettingsService');

/**
 * Settings HTTP surface (settings-page-correctness, design D3/D4).
 *
 * The controller is deliberately thin: it hands the request body straight to
 * SettingsService, which owns validation (validateSettingsPayload) and
 * persistence. There are NO hand-rolled checks here - a second whitelist in this
 * layer would be a second place to forget an update, and the service is the
 * boundary that guarantees an invalid document cannot reach disk.
 *
 * Envelope convention (AGENTS.md rule 6):
 *   - GET is a read-only aggregate, so it answers a BARE object - the same shape
 *     as GET /api/fs/tree, /api/fs/list and the dashboard endpoints. No
 *     `success` field is added; consumers read the document directly.
 *   - PUT mutates, so it answers `{ success: true, settings }` - the shape every
 *     other mutating endpoint uses.
 *
 * Failures are never serialized inline. SettingsService raises AppError(400) for
 * a rejected document and AppError(500) for an unreadable store (design D5: a
 * corrupt document fails wholly rather than silently reverting to defaults),
 * and the global errorHandler turns either into `{ success: false, error }`.
 *
 * No PathService import and no filesystem access: `general.defaultUploadFolder`
 * is validated as a client path but never resolved here (design D7).
 */

/**
 * GET /api/settings
 * The complete settings document, bare.
 */
async function getSettings(req, res, next) {
    try {
        return res.json(await SettingsService.getAll());
    } catch (error) {
        return next(error);
    }
}

/**
 * PUT /api/settings
 * Strict full replace: the payload must be the whole whitelisted document.
 * Responds with the PERSISTED, normalized document, so a client never has to
 * reimplement the trim / ""-to-null rules to learn what was stored.
 */
async function replaceSettings(req, res, next) {
    try {
        // An absent or unparseable body arrives as undefined or a non-object and
        // is refused by the validator, not by a check duplicated in this layer.
        const settings = await SettingsService.replace(req.body);
        return res.json({ success: true, settings });
    } catch (error) {
        return next(error);
    }
}

module.exports = { getSettings, replaceSettings };
