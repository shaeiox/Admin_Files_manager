// src/services/MetadataService.js
'use strict';

const fs = require('fs/promises');
const path = require('path');
const AppError = require('../utils/AppError');

class MetadataService {
    constructor() {
        // Absolute path to the JSON database file
        this.dbPath = path.join(process.cwd(), 'data', 'metadata.json');
        this.cache = null; // In-memory cache to avoid excessive disk reads
    }

    /**
     * Creates the store from scratch: ensures the parent directory exists,
     * then writes an empty structure.
     *
     * The directory is created BEFORE the write, because writing into a
     * missing directory raises a second ENOENT - which, in the previous
     * implementation, was awaited from inside the ENOENT handler itself and
     * therefore escaped as a raw Error rather than an AppError.
     *
     * Failures are raised as AppError with static messages: no path or errno
     * detail reaches the client. The cache is left untouched on failure so a
     * later read retries initialization instead of staying permanently broken.
     */
    async _init() {
        try {
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
            await this._write({ downloads: {}, starred: [], activities: [] });
        } catch (error) {
            const wrapped = new AppError('Metadata store could not be initialized', 500);
            wrapped.cause = error;
            throw wrapped;
        }
    }

    /**
     * Reads the metadata file from disk or returns the cache.
     * Initializes the file if it doesn't exist.
     */
    async _read() {
        if (this.cache) return this.cache;

        try {
            const data = await fs.readFile(this.dbPath, 'utf8');
            this.cache = JSON.parse(data);
            return this.cache;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File or its directory doesn't exist - bootstrap and re-read
                // from cache, which _write has just populated.
                await this._init();
                return this.cache;
            }
            const wrapped = new AppError('Metadata store could not be read', 500);
            wrapped.cause = error;
            throw wrapped;
        }
    }

    /**
     * Writes data to the JSON file atomically to prevent corruption.
     * Uses a temporary file and renames it (atomic operation on most OS).
     */
    async _write(data) {
        const tempPath = `${this.dbPath}.tmp`;
        const jsonString = JSON.stringify(data, null, 2);

        // Write to temp file first
        await fs.writeFile(tempPath, jsonString, 'utf8');

        // Rename temp file to actual DB file (Atomic swap)
        await fs.rename(tempPath, this.dbPath);

        // Update cache
        this.cache = data;
    }

    /**
     * Get all metadata for a specific file path.
     * @param {string} clientPath 
     */
    async getFileMeta(clientPath) {
        const db = await this._read();
        return {
            downloads: db.downloads[clientPath] || 0,
            starred: db.starred.includes(clientPath)
        };
    }

    /**
     * Increment download count for a file.
     * @param {string} clientPath 
     */
    async incrementDownload(clientPath) {
        const db = await this._read();
        db.downloads[clientPath] = (db.downloads[clientPath] || 0) + 1;
        await this._write(db);
    }

    /**
     * Toggle the starred status of a file.
     * @param {string} clientPath 
     */
    async toggleStar(clientPath) {
        const db = await this._read();
        const index = db.starred.indexOf(clientPath);

        if (index === -1) {
            db.starred.push(clientPath);
        } else {
            db.starred.splice(index, 1);
        }

        await this._write(db);
        return db.starred.includes(clientPath);
    }

    /**
     * Log a new activity (upload, delete, rename, etc).
     * Keeps only the last 50 activities to prevent infinite growth.
     * @param {object} activity - { type, user, action, target, folder }
     */
    async addActivity(activity) {
        const db = await this._read();

        const newActivity = {
            ...activity,
            time: Date.now()
        };

        // Add to beginning of array
        db.activities.unshift(newActivity);

        // Cap the log size
        if (db.activities.length > 50) {
            db.activities = db.activities.slice(0, 50);
        }

        await this._write(db);
    }

    /**
     * Get recent activities for the dashboard.
     *
     * Entries whose timestamp is missing, non-numeric, non-finite, zero, or
     * negative are DROPPED rather than passed through. A null or absent timestamp
     * renders as 1 January 1970 and a non-numeric one as Invalid Date, both of
     * which are fabrications. This has no other callers, so sanitising here makes
     * the guarantee hold for every consumer of the activity feed.
     *
     * @param {number} limit
     * @returns {Promise<Array<object>>} Always an array, never null.
     */
    async getActivities(limit = 10) {
        const db = await this._read();
        if (!Array.isArray(db.activities)) return [];

        return db.activities
            .filter((activity) => activity
                && typeof activity.time === 'number'
                && Number.isFinite(activity.time)
                && activity.time > 0)
            .slice(0, limit);
    }

    /**
     * Top-N most-downloaded files, ranked server-side.
     *
     * Returns client paths and counts only - never an absolute OS path. Files
     * with a zero, negative, non-numeric, or non-finite counter are excluded: a
     * zero is not a "top" download, and a corrupt counter is not a measurement.
     *
     * max is recomputed from the RETAINED set, not from the global peak, so the
     * renderer can compute a bar proportion without re-deriving the maximum. When
     * a 
     * `retain` predicate is supplied (the controller uses it to drop entries
     * whose file no longer exists), max reflects what actually survives.
     *
     * Ties resolve deterministically by path, so repeated calls agree.
     *
     * @param {number} [limit=5]
     * @param {{retain?: (entry:{path:string,downloads:number}) => object[]|null}} [options]
     * @returns {Promise<Array<{path:string, downloads:number, max:number}>>}
     */
    async getTopDownloads(limit = 5, options = {}) {
        const db = await this._read();
        if (!db.downloads || typeof db.downloads !== 'object') return [];

        const candidates = Object.entries(db.downloads)
            .filter(([, count]) => typeof count === 'number'
                && Number.isFinite(count)
                && count > 0)
            .map(([path, downloads]) => ({ path, downloads }))
            .sort((a, b) => (b.downloads - a.downloads) || a.path.localeCompare(b.path));

        const bounded = candidates.slice(0, limit);
        const retained = typeof options.retain === 'function'
            ? options.retain(bounded)
            : bounded;

        if (!Array.isArray(retained) || retained.length === 0) return [];

        const max = retained.reduce((peak, e) => Math.max(peak, e.downloads), 0);

        return retained.map((entry) => ({
            path: entry.path,
            downloads: entry.downloads,
            max,
        }));
    }

    /**
     * When a file is renamed or moved, we must update its metadata keys.
     * @param {string} oldPath 
     * @param {string} newPath 
     */
    async renamePath(oldPath, newPath) {
        const db = await this._read();
        let hasChanges = false;

        // Update downloads count key
        if (db.downloads[oldPath] !== undefined) {
            db.downloads[newPath] = db.downloads[oldPath];
            delete db.downloads[oldPath];
            hasChanges = true;
        }

        // Update starred array
        const starIndex = db.starred.indexOf(oldPath);
        if (starIndex !== -1) {
            db.starred[starIndex] = newPath;
            hasChanges = true;
        }

        if (hasChanges) {
            await this._write(db);
        }
    }

    /**
     * When a file is deleted, clean up its metadata.
     * @param {string} clientPath 
     */
    async deletePath(clientPath) {
        const db = await this._read();
        let hasChanges = false;

        if (db.downloads[clientPath] !== undefined) {
            delete db.downloads[clientPath];
            hasChanges = true;
        }

        const starIndex = db.starred.indexOf(clientPath);
        if (starIndex !== -1) {
            db.starred.splice(starIndex, 1);
            hasChanges = true;
        }

        if (hasChanges) {
            await this._write(db);
        }
    }
}

// Export a Singleton instance so the cache is shared across the entire app
module.exports = new MetadataService();