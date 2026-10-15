// src/services/PortalService.js
'use strict';

const fs = require('fs/promises');
const path = require('path');
const AppError = require('../utils/AppError');

/**
 * The File Portal (files-server-web) seen from the admin side: its JSON-lines
 * trace log, read from PORTAL_LOG_FILE (the same file as the portal's LOG_FILE).
 *
 * The admin no longer reads or writes the portal's .env (ADR-010): shared values
 * live in admin.sqlite (IntegrationSettingsService) and host paths stay in each
 * app's own config. GET/PUT /admin/portal/config keep their v1 shapes and always
 * report "not linked" (ADR-007: no v1 response is retyped).
 */

const LOG_TAIL_BYTES = 512 * 1024;
const MAX_LOG_ENTRIES = 1000;

const CONFIG_RETIRED = 'The admin no longer edits the portal .env. Shared portal settings are at /api/v1/admin/portal/settings (Admin > File portal).';

class PortalService {
    /** Why the portal log cannot be read, or null when PORTAL_LOG_FILE is usable. */
    static logProblem() {
        const raw = String(process.env.PORTAL_LOG_FILE || '').trim();
        if (!raw) return 'PORTAL_LOG_FILE is not set.';
        if (!path.isAbsolute(raw)) return 'PORTAL_LOG_FILE must be an absolute path.';
        return null;
    }

    /** Retired: always "not linked", the shape GET /admin/portal/config has always had for that state. */
    static async getConfig() {
        return { available: false, reason: CONFIG_RETIRED, values: null };
    }

    /** Retired: always 503, as PUT /admin/portal/config answered when not linked. */
    static async setConfig() {
        throw new AppError(CONFIG_RETIRED, 503);
    }

    /**
     * Newest-first entries from the portal's trace (PORTAL_LOG_FILE).
     * Reads only the last 512 KiB, so a large log costs the same as a small one.
     */
    static async getLog(limit) {
        const reason = PortalService.logProblem();
        if (reason) return { available: false, reason, entries: [] };
        const n = Math.min(Math.max(Number.parseInt(limit, 10) || 200, 1), MAX_LOG_ENTRIES);
        let handle;
        const notAFile = { available: false, reason: 'PORTAL_LOG_FILE is a directory, not the log file.', entries: [] };
        try {
            handle = await fs.open(String(process.env.PORTAL_LOG_FILE).trim(), 'r');
        } catch (error) {
            if (error.code === 'ENOENT') return { available: true, entries: [] };
            if (error.code === 'EISDIR') return notAFile;
            throw new AppError('The portal log could not be read.', 500);
        }
        try {
            const stat = await handle.stat();
            if (!stat.isFile()) return notAFile;
            const { size } = stat;
            const length = Math.min(size, LOG_TAIL_BYTES);
            const buffer = Buffer.alloc(length);
            await handle.read(buffer, 0, length, size - length);
            const lines = buffer.toString('utf8').split('\n');
            if (size > length) lines.shift(); // first line is cut mid-way
            const entries = [];
            for (let i = lines.length - 1; i >= 0 && entries.length < n; i--) {
                try { entries.push(JSON.parse(lines[i])); } catch { /* blank or partial line */ }
            }
            return { available: true, entries };
        } finally {
            await handle.close();
        }
    }
}

module.exports = PortalService;
