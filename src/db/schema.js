// src/db/schema.js
'use strict';

/**
 * Admin database schema (ADR-009, admin-identity-and-access-control design.md).
 *
 * Migration 1 only: users, sessions, audit_logs. Migration 2 (files,
 * file_access_policies, user_file_permissions) is a later, separately-scoped
 * addition - see tasks.md group 4.
 *
 * Idempotent: migrate() records applied versions in schema_migrations and is
 * a no-op when the stored schema is already current. A stored version newer
 * than this module knows about is refused rather than silently ignored.
 */

const MIGRATIONS = [
    {
        version: 1,
        sql: `
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                email TEXT UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin','user')) DEFAULT 'user',
                status TEXT NOT NULL CHECK (status IN ('active','disabled')) DEFAULT 'active',
                failed_login_count INTEGER NOT NULL DEFAULT 0,
                locked_until INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                token_hash TEXT NOT NULL UNIQUE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                csrf_secret TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                revoked_at INTEGER,
                ip TEXT,
                user_agent TEXT
            );
            CREATE INDEX idx_sessions_user_id ON sessions(user_id);
            CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

            CREATE TABLE audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_id INTEGER REFERENCES users(id),
                action TEXT NOT NULL,
                outcome TEXT NOT NULL CHECK (outcome IN ('success','failure')),
                target_type TEXT,
                target_id INTEGER,
                detail TEXT,
                ip TEXT,
                user_agent TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX idx_audit_logs_actor_id ON audit_logs(actor_id);
            CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
        `,
    },
];

/** @param {import('node:sqlite').DatabaseSync} db */
function migrate(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        );
    `);

    const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get();
    const current = row && row.v ? row.v : 0;
    const latestKnown = MIGRATIONS[MIGRATIONS.length - 1].version;
    if (current > latestKnown) {
        throw new Error(`Admin database schema (v${current}) is newer than this release understands (v${latestKnown}).`);
    }

    for (const migration of MIGRATIONS) {
        if (migration.version <= current) continue;
        db.exec('BEGIN');
        try {
            db.exec(migration.sql);
            db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
                .run(migration.version, Date.now());
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }
}

module.exports = { migrate, MIGRATIONS };
