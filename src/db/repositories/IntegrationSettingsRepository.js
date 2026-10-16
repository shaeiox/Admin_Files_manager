// src/db/repositories/IntegrationSettingsRepository.js
'use strict';

const AdminDatabase = require('../connection');

/**
 * Named operations over `integration_settings` (migration 5): scalar values the
 * File Portal reads from admin.sqlite. Keys and validation live in
 * IntegrationSettingsService; this layer only stores strings.
 */
class IntegrationSettingsRepository {
    /** @returns {string|null} */
    get(key) {
        const row = AdminDatabase.get().prepare('SELECT value FROM integration_settings WHERE key = ?').get(key);
        return row ? row.value : null;
    }

    /** Sets each key, deleting those whose value is null, in one transaction. */
    setMany(entries) {
        const db = AdminDatabase.get();
        const remove = db.prepare('DELETE FROM integration_settings WHERE key = ?');
        const upsert = db.prepare(
            'INSERT INTO integration_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
        );
        db.exec('BEGIN');
        try {
            for (const [key, value] of Object.entries(entries)) {
                if (value === null) remove.run(key);
                else upsert.run(key, String(value));
            }
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }
}

module.exports = new IntegrationSettingsRepository();
