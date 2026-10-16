// test/db/schema.test.js
'use strict';

/**
 * Admin database schema/migration unit tests (ADR-009).
 *
 * Exercises migrate() directly against an in-memory node:sqlite database -
 * no singleton, no temp file, no server boot. schema.js takes a raw
 * DatabaseSync connection, so this is the narrowest possible check.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrate, MIGRATIONS } = require('../../src/db/schema');

describe('schema.migrate', () => {
    test('creates users, sessions, and audit_logs', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
        assert.ok(tables.includes('users'));
        assert.ok(tables.includes('sessions'));
        assert.ok(tables.includes('audit_logs'));
        assert.ok(tables.includes('schema_migrations'));
    });

    test('migration 5 creates integration_settings as a key/value table', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        const cols = db.prepare('PRAGMA table_info(integration_settings)').all();
        assert.deepEqual(cols.map((c) => [c.name, c.type, c.pk]), [['key', 'TEXT', 1], ['value', 'TEXT', 0]]);
        assert.ok(MIGRATIONS.some((m) => m.version === 5));
    });

    test('migration 6 adds the session cap, the DPoP thumbprint and session_tokens', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
        assert.ok(sessionCols.includes('absolute_expires_at'));
        assert.ok(sessionCols.includes('dpop_thumbprint'));
        const tokenCols = db.prepare('PRAGMA table_info(session_tokens)').all().map((c) => c.name);
        assert.deepEqual(tokenCols, ['id', 'session_id', 'kind', 'token_hash', 'parent_id', 'issued_at',
            'expires_at', 'used_at', 'revoked_at', 'revoke_reason']);
        const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'session_tokens'").all().map((r) => r.name);
        assert.ok(indexes.includes('idx_session_tokens_session_id'));
        assert.ok(indexes.includes('idx_session_tokens_expires_at'));
    });

    test('migration 6 backfills a legacy session cap from its expires_at', () => {
        const db = new DatabaseSync(':memory:');
        db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
        for (const m of MIGRATIONS.filter((x) => x.version <= 5)) {
            db.exec(m.sql);
            db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(m.version, Date.now());
        }
        db.prepare("INSERT INTO users (username, password_hash, created_at, updated_at) VALUES ('u', 'h', 1, 1)").run();
        db.prepare("INSERT INTO sessions (token_hash, user_id, csrf_secret, created_at, last_seen_at, expires_at) VALUES ('t', 1, 'c', 1, 1, 123456)").run();
        migrate(db);
        assert.equal(db.prepare('SELECT absolute_expires_at FROM sessions').get().absolute_expires_at, 123456);
    });

    test('records the applied version', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get();
        assert.equal(row.v, MIGRATIONS[MIGRATIONS.length - 1].version);
    });

    test('running twice is a no-op (idempotent)', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        migrate(db); // must not throw, must not duplicate tables/rows
        const row = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get();
        assert.equal(row.n, MIGRATIONS.length);
    });

    test('a role outside admin/user is rejected by the CHECK constraint', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        assert.throws(() => {
            db.prepare(
                'INSERT INTO users (username, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
            ).run('x', 'hash', 'superadmin', Date.now(), Date.now());
        });
    });

    test('a stored schema version newer than this module understands is refused', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        const future = MIGRATIONS[MIGRATIONS.length - 1].version + 1;
        db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(future, Date.now());
        assert.throws(() => migrate(db), /newer than this release understands/);
    });
});

describe('schema.migrate (migration 2: files/file_access_policies/user_file_permissions)', () => {
    test('creates the three tables', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
        assert.ok(tables.includes('files'));
        assert.ok(tables.includes('file_access_policies'));
        assert.ok(tables.includes('user_file_permissions'));
    });

    test('an access_mode outside public/authenticated/restricted is rejected', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        const now = Date.now();
        db.prepare('INSERT INTO files (client_path, created_at, updated_at) VALUES (?, ?, ?)').run('/a.txt', now, now);
        assert.throws(() => {
            db.prepare(
                'INSERT INTO file_access_policies (file_id, access_mode, created_at, updated_at) VALUES (1, ?, ?, ?)'
            ).run('superpublic', now, now);
        });
    });

    test('a file can have at most one policy (UNIQUE file_id)', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        const now = Date.now();
        db.prepare('INSERT INTO files (client_path, created_at, updated_at) VALUES (?, ?, ?)').run('/b.txt', now, now);
        db.prepare('INSERT INTO file_access_policies (file_id, created_at, updated_at) VALUES (1, ?, ?)').run(now, now);
        assert.throws(() => {
            db.prepare('INSERT INTO file_access_policies (file_id, created_at, updated_at) VALUES (1, ?, ?)').run(now, now);
        });
    });

    test('a (file, user) pair can have at most one permission row (UNIQUE)', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        const now = Date.now();
        db.prepare('INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run('x', 'h', now, now);
        db.prepare('INSERT INTO files (client_path, created_at, updated_at) VALUES (?, ?, ?)').run('/c.txt', now, now);
        db.prepare('INSERT INTO user_file_permissions (file_id, user_id, permission, created_at) VALUES (1, 1, ?, ?)').run('grant', now);
        assert.throws(() => {
            db.prepare('INSERT INTO user_file_permissions (file_id, user_id, permission, created_at) VALUES (1, 1, ?, ?)').run('deny', now);
        });
    });

    test('deleting a file cascades to its policy and permissions', () => {
        const db = new DatabaseSync(':memory:');
        migrate(db);
        // CASCADE requires this pragma; connection.js sets it for the real
        // singleton, but migrate() itself only applies schema, so it's set
        // explicitly here against this bare in-memory connection.
        db.exec('PRAGMA foreign_keys = ON;');
        const now = Date.now();
        db.prepare('INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)').run('y', 'h', now, now);
        db.prepare('INSERT INTO files (client_path, created_at, updated_at) VALUES (?, ?, ?)').run('/d.txt', now, now);
        db.prepare('INSERT INTO file_access_policies (file_id, created_at, updated_at) VALUES (1, ?, ?)').run(now, now);
        db.prepare('INSERT INTO user_file_permissions (file_id, user_id, permission, created_at) VALUES (1, 1, ?, ?)').run('grant', now);
        db.prepare('DELETE FROM files WHERE id = 1').run();
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM file_access_policies').get().n, 0);
        assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_file_permissions').get().n, 0);
    });
});
