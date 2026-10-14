// src/services/PortalNavService.js
'use strict';

const fs = require('fs/promises');
const AdminDatabase = require('../db/connection');
const PathService = require('./PathService');
const AppError = require('../utils/AppError');

/**
 * Navbar folders of the File Portal (table portal_nav_folders, migration 3).
 *
 * The admin only stores the list; the portal reads it from admin.sqlite on its
 * normal snapshot refresh (no restart) and decides each entry per caller with
 * the same file_access_policies as everything else - a link to a folder the
 * caller may not see is never sent. `hideFromHome` removes the folder from the
 * portal's home card grid only; it is a view choice, not an access rule.
 */

const MAX_FOLDERS = 12;
const MAX_LABEL = 40;

/** "/a/b" from any spelling ("a\\b/", "//a/b"); throws on "", "/", "." or "..". */
function normalizePath(raw) {
    if (typeof raw !== 'string') throw new AppError('Folder path must be a string.', 400);
    const parts = raw.replace(/\\/g, '/').split('/').filter(Boolean);
    if (!parts.length) throw new AppError('Folder path must name a folder inside the storage root.', 400);
    if (parts.some((p) => p === '.' || p === '..' || /[\0\r\n]/.test(p))) throw new AppError('Folder path is not valid.', 400);
    return '/' + parts.join('/');
}

class PortalNavService {
    /** Stored entries in navbar order. */
    static list() {
        return AdminDatabase.get()
            .prepare('SELECT client_path, label, hide_from_home FROM portal_nav_folders ORDER BY position ASC, id ASC')
            .all()
            .map((r) => ({ path: r.client_path, label: r.label || '', hideFromHome: r.hide_from_home === 1 }));
    }

    /** Validates `{ folders: [{ path, label?, hideFromHome? }] }`; every path must be an existing in-root folder. */
    static async validate(input) {
        const folders = input && Array.isArray(input.folders) ? input.folders : null;
        if (!folders) throw new AppError('Body must be { folders: [...] }.', 400);
        if (folders.length > MAX_FOLDERS) throw new AppError(`At most ${MAX_FOLDERS} navbar folders.`, 400);
        const seen = new Set();
        const out = [];
        for (const f of folders) {
            if (!f || typeof f !== 'object') throw new AppError('Each folder must be an object.', 400);
            const clientPath = normalizePath(f.path);
            const key = clientPath.toLowerCase();
            if (seen.has(key)) throw new AppError(`Duplicate folder: ${clientPath}.`, 400);
            seen.add(key);
            const label = f.label == null ? '' : f.label;
            if (typeof label !== 'string' || label.trim().length > MAX_LABEL || /[\0\r\n]/.test(label)) {
                throw new AppError(`Label of ${clientPath} must be a single line of at most ${MAX_LABEL} characters.`, 400);
            }
            if (f.hideFromHome !== undefined && typeof f.hideFromHome !== 'boolean') {
                throw new AppError('hideFromHome must be true or false.', 400);
            }
            const real = await PathService.resolveSecureRealPath(clientPath);
            if (!(await fs.stat(real)).isDirectory()) throw new AppError(`${clientPath} is not a folder.`, 400);
            out.push({ path: clientPath, label: label.trim(), hideFromHome: f.hideFromHome === true });
        }
        return out;
    }

    /** Full replace, in order, in one transaction. */
    static async set(input) {
        const folders = await PortalNavService.validate(input);
        const db = AdminDatabase.get();
        const now = Date.now();
        db.exec('BEGIN');
        try {
            db.exec('DELETE FROM portal_nav_folders');
            const insert = db.prepare(
                'INSERT INTO portal_nav_folders (client_path, label, position, hide_from_home, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
            );
            folders.forEach((f, i) => insert.run(f.path, f.label || null, i, f.hideFromHome ? 1 : 0, now, now));
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
        return folders;
    }
}

PortalNavService.MAX_FOLDERS = MAX_FOLDERS;

module.exports = PortalNavService;
