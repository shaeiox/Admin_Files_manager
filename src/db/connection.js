// src/db/connection.js
'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const { resolveDataDir } = require('../config/dataDir');
const { migrate } = require('./schema');

/**
 * Admin identity/session/audit database (ADR-009).
 *
 * A separate node:sqlite database from the two existing JSON stores
 * (metadata.json, settings.json) under the same AFM_DATA_DIR - it does not
 * replace or touch either. Exported as a singleton instance so `dbPath` can
 * be redirected by a test before `server.js` is required, the same pattern
 * MetadataService/SettingsService already use (AGENTS.md: "tests never touch
 * the real stores").
 *
 * node:sqlite's API is synchronous (it has no promise variant) and this is
 * the idiomatic way to use it for a local, single-process file like this one
 * - a deliberate exception to "async I/O only" (AGENTS.md rule 4) for the
 * same reason FileSystemService.getHealthMetrics is: the operation itself is
 * cheap and has no async form, not a shortcut around a slow one.
 */
class AdminDatabase {
    constructor() {
        this.dbPath = path.join(resolveDataDir(), 'admin.sqlite');
        this._db = null;
    }

    /** Opens (once) and returns the connection, migrated to the current schema. */
    get() {
        if (!this._db) this._open();
        return this._db;
    }

    _open() {
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
        const db = new DatabaseSync(this.dbPath);
        // Default rollback-journal mode, not WAL: this app has exactly one
        // connection from one process at a time (both in production and in
        // every test), so WAL's benefit - concurrent readers/writers across
        // processes - does not apply here, and it costs two extra sidecar
        // file handles (-wal/-shm) per connection for nothing. node:sqlite's
        // own test-suite-wide concurrency (many short-lived connections
        // across parallel test processes) measurably destabilized on
        // Windows with WAL enabled; plain journal mode removed that.
        db.exec('PRAGMA foreign_keys = ON;');
        migrate(db);
        this._db = db;
    }

    /**
     * Closes the connection and drops the cached handle, so the next get()
     * re-opens (and re-migrates) it against whatever dbPath is current.
     * Test-only reset hook, mirroring MetadataService's `cache = null`.
     */
    reset() {
        if (this._db) {
            this._db.close();
            this._db = null;
        }
    }
}

module.exports = new AdminDatabase();
