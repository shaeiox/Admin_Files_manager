// src/controllers/preview.controller.js
'use strict';

const PreviewService = require('../services/PreviewService');
const { validateClientPath } = require('../utils/validators');

/**
 * GET /api/fs/thumbnail/capability
 * Read-only, bare shape (rule 6): { available, formats, maxSize }.
 * The Files page reads it once so it never requests a preview the server
 * cannot produce.
 */
function getThumbnailCapability(req, res) {
    res.json(PreviewService.capability());
}

/**
 * GET /api/fs/thumbnail?path=/media/a.png&size=256
 * Responds with a bounded image, or an error envelope carrying the explicit
 * marker header `X-Preview: unavailable` (no transformer, non-image, folder,
 * oversized source, or a decode failure).
 */
async function getThumbnail(req, res, next) {
    try {
        const clientPath = req.query.path;
        validateClientPath(clientPath);
        const size = PreviewService.parseSize(req.query.size);

        const { buffer, contentType } = await PreviewService.render(clientPath, size);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Cache-Control', 'private, max-age=60');
        res.end(buffer);
    } catch (error) {
        res.setHeader('X-Preview', 'unavailable');
        next(error);
    }
}

module.exports = { getThumbnailCapability, getThumbnail };
