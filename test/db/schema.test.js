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
