// src/services/MetadataService.js
'use strict';

const fs = require('fs/promises');
const path = require('path');

class MetadataService {
    constructor() {
        // Absolute path to the JSON database file
        this.dbPath = path.join(process.cwd(), 'data', 'metadata.json');
        this.cache = null; // In-memory cache to avoid excessive disk reads
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
                // File doesn't exist, create a default structure
                const defaultData = { downloads: {}, starred: [], activities: [] };
                await this._write(defaultData);
                return defaultData;
            }
            throw error;
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
     * @param {number} limit 
     */
    async getActivities(limit = 10) {
        const db = await this._read();
        return db.activities.slice(0, limit);
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