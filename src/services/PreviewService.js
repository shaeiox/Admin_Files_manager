// src/services/PreviewService.js
'use strict';

const path = require('path');
const FileSystemService = require('./FileSystemService');
const PathService = require('./PathService');
const AppError = require('../utils/AppError');
const { classifyFile } = require('../utils/fileTypes');

/**
 * Bounded image previews for the Files page (grid cards and the details drawer).
 *
 * NO NEW DEPENDENCY. A transformer is used only if one is already installed
 * (`sharp`); this repository installs none, so every preview request answers
 * "unavailable" and the UI says so. Adding a transformer is a separate,
 * security-reviewed change: decoding untrusted images is its own risk class.
 *
 * Never sourced from the download endpoint, whose `application/octet-stream`
 * cannot be rendered — and must not be relaxed, or downloads would render
 * untrusted content inline.
 */

/** Raster formats a transformer is asked to decode. SVG is excluded: it is a document, not pixels. */
const PREVIEW_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'];
const PREVIEW_DEFAULT_SIZE = 256;
/** Long-edge cap in pixels. Every preview is bounded in both dimensions by it. */
const PREVIEW_MAX_SIZE = 512;
const PREVIEW_MIN_SIZE = 16;
/** Source files larger than this are not decoded at all. */
const PREVIEW_MAX_INPUT_BYTES = 50 * 1024 * 1024;

function loadInstalledTransformer() {
    try {
        // eslint-disable-next-line global-require
        return require('sharp');
    } catch {
        return null;
    }
}

let transformer = loadInstalledTransformer();

class PreviewService {
    static capability() {
        return {
            available: transformer !== null,
            formats: transformer !== null ? [...PREVIEW_FORMATS] : [],
            maxSize: PREVIEW_MAX_SIZE,
        };
    }

    /** @returns {number} a size within [PREVIEW_MIN_SIZE, PREVIEW_MAX_SIZE] */
    static parseSize(raw) {
        if (raw === undefined || raw === '') return PREVIEW_DEFAULT_SIZE;
        const n = Number.parseInt(raw, 10);
        if (!Number.isFinite(n) || String(n) !== String(raw).trim()) {
            throw new AppError('size must be an integer number of pixels.', 400);
        }
        return Math.min(Math.max(n, PREVIEW_MIN_SIZE), PREVIEW_MAX_SIZE);
    }

    /**
     * Decide from the NAME alone whether a preview may be produced, so a
     * non-image is refused without a single byte of it being read.
     */
    static assertPreviewable(clientPath) {
        PathService.resolveSecurePath(clientPath); // traversal guard first
        const name = path.posix.basename(clientPath);
        const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
        if (classifyFile(name) !== 'image' || !PREVIEW_FORMATS.includes(ext)) {
            throw new AppError('No preview is produced for this file type.', 415);
        }
        if (transformer === null) {
            throw new AppError('Previews are not enabled on this server.', 404);
        }
    }

    /**
     * @returns {Promise<{ buffer: Buffer, contentType: string }>}
     */
    static async render(clientPath, size) {
        PreviewService.assertPreviewable(clientPath);

        const stats = await FileSystemService.getStats(clientPath);
        if (stats.isDirectory) throw new AppError('No preview is produced for a folder.', 415);
        if (stats.size > PREVIEW_MAX_INPUT_BYTES) {
            throw new AppError('The image is too large to preview.', 413);
        }

        try {
            const buffer = await transformer(stats.securePath, { limitInputPixels: 40_000_000 })
                .rotate()
                .resize(size, size, { fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 75 })
                .toBuffer();
            return { buffer, contentType: 'image/webp' };
        } catch {
            throw new AppError('The preview could not be generated.', 422);
        }
    }

    /** Test seam: substitute the transformer (null = none installed). Returns the previous one. */
    static _useTransformer(next) {
        const previous = transformer;
        transformer = next;
        return previous;
    }
}

PreviewService.PREVIEW_FORMATS = PREVIEW_FORMATS;
PreviewService.PREVIEW_MAX_SIZE = PREVIEW_MAX_SIZE;
PreviewService.PREVIEW_DEFAULT_SIZE = PREVIEW_DEFAULT_SIZE;

module.exports = PreviewService;
