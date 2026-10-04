// src/services/SettingsService.js
'use strict';

const fs = require('fs/promises');
const path = require('path');
const AppError = require('../utils/AppError');
const { validateSettingsPayload } = require('../utils/validators');

/**
 * Operator settings store (settings-page-correctness, design D1/D2).
 *
 * A single JSON document at data/settings.json, persisted with the same
 * shape and discipline as MetadataService: an in-memory cache, atomic
 * temp-file-then-rename writes, ENOENT bootstrap on first read, and AppError
 * wrapping with static messages (no path or errno reaches the client).
 *
 * The document holds CLIENT values only. defaultUploadFolder is validated by
 * the shared validators but is never resolved to a host path here: this
 * service imports no PathService and touches no filesystem object other than
 * the store file (design D7). Resolution stays at the point of use, as with
 * every other client path.
 *
 * The store fails wholly on corruption (design D5): an unparseable document
 * throws AppError(500) rather than substituting defaults, which would
 * silently discard real configuration. The file is small and
 * operator-recoverable, so failing loudly is the deliberate per-capability
 * choice - the same one the metadata store makes.
 */

/**
 * The documented D2 defaults: every key present, every value explicitly
 * unset (null is the unset state; consumers fall back to static defaults).
 * A fresh copy is materialized on each bootstrap so the cache never shares
 * structure with a module-level constant.
 */
function defaultSettings() {
    return {
        general: { workspaceName: null, defaultUploadFolder: null },
        appearance: { defaultView: null },
    };
}

class SettingsService {
    constructor() {
        // Absolute path to the JSON settings file
        this.dbPath = path.join(process.cwd(), 'data', 'settings.json');
        this.cache = null; // In-memory cache to avoid excessive disk reads
    }

    /**
     * Creates the store from scratch: ensures the parent directory exists,
     * then writes the documented defaults.
     *
     * The directory is created BEFORE the write - the same ordering rule
     * MetadataService._init documents: writing into a missing directory
     * raises a second ENOENT that would escape as a raw Error.
     *
     * Failures are raised as AppError with static messages. The cache is left
     * untouched on failure so a later read retries initialization.
     */
    async _init() {
        try {
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
            await this._write(defaultSettings());
        } catch (error) {
            const wrapped = new AppError('Settings store could not be initialized', 500);
            wrapped.cause = error;
            throw wrapped;
        }
    }

    /**
     * Reads the settings file from disk or returns the cache.
     * Materializes the defaults if the file doesn't exist yet.
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
            // Includes JSON.parse failures: a corrupt store fails wholly.
            const wrapped = new AppError('Settings store could not be read', 500);
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

        // Rename temp file to actual settings file (Atomic swap)
        await fs.rename(tempPath, this.dbPath);

        // Update cache
        this.cache = data;
    }

    /**
     * The complete settings document. Bare read: the controller serializes
     * this object without an envelope (read-only aggregate precedent).
     */
    async getAll() {
        return this._read();
    }

    /**
     * Full-replace the settings document.
     *
     * Validation is owned by validateSettingsPayload (design D4) and happens
     * HERE, at the service boundary, so an invalid document can never reach
     * disk through any caller. The payload is a strict full replace: every
     * whitelisted key present, none extra; unknown keys are rejected, not
     * stripped. The normalized document is persisted atomically and returned.
     *
     * @param {object} payload - the complete candidate settings document
     * @returns {Promise<object>} the persisted, normalized document
     * @throws {AppError} 400 on any validation violation
     */
    async replace(payload) {
        const validated = validateSettingsPayload(payload);
        await this._write(validated);
        return validated;
    }
}

// Export a Singleton instance so the cache is shared across the entire app
module.exports = new SettingsService();
