// src/db/schema.js
'use strict';

/**
 * Admin database schema (ADR-009, admin-identity-and-access-control design.md).
 *
 * Migration 1: users, sessions, audit_logs (phase 1).
 * Migration 2: files, file_access_policies, user_file_permissions (phase 2,
 * tasks.md group 4). files is sparse - a row exists only for a path an
 * administrator has set a policy on, not a mirror of the whole tree
 * (design D2).
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
    {
        version: 2,
        sql: `
            CREATE TABLE files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_path TEXT NOT NULL UNIQUE,
                is_directory INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE file_access_policies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
                access_mode TEXT NOT NULL CHECK (access_mode IN ('public','authenticated','restricted')) DEFAULT 'restricted',
                is_published INTEGER NOT NULL DEFAULT 0,
                is_locked INTEGER NOT NULL DEFAULT 0,
                available_from INTEGER,
                available_until INTEGER,
                created_by INTEGER REFERENCES users(id),
                updated_by INTEGER REFERENCES users(id),
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );

            CREATE TABLE user_file_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                permission TEXT NOT NULL CHECK (permission IN ('grant','deny')),
                granted_by INTEGER REFERENCES users(id),
                created_at INTEGER NOT NULL,
                UNIQUE (file_id, user_id)
            );
            CREATE INDEX idx_ufp_user_id ON user_file_permissions(user_id);
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
