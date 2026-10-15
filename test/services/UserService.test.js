// test/services/UserService.test.js
'use strict';

/**
 * UserService unit tests (ADR-009). Redirects the AdminDatabase singleton
 * at an isolated temp file per suite, the same isolation pattern
 * MetadataService/SettingsService tests already use for their stores.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AdminDatabase = require('../../src/db/connection');
const UserService = require('../../src/services/UserService');
const AppError = require('../../src/utils/AppError');

let tmp;

before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-userservice-'));
    AdminDatabase.dbPath = path.join(tmp, 'admin.sqlite');
    AdminDatabase.reset();
});

after(() => {
    AdminDatabase.reset();
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe('UserService.create', () => {
    test('creates a user with the default "user" role', () => {
        const user = UserService.create({ username: 'alice', password: 'alice-password' });
        assert.equal(user.username, 'alice');
        assert.equal(user.role, 'user');
        assert.equal(user.status, 'active');
    });

    test('never returns password_hash or throttle bookkeeping', () => {
        const user = UserService.create({ username: 'bob', password: 'bob-password' });
        assert.equal(user.password_hash, undefined);
        assert.equal(user.failed_login_count, undefined);
        assert.equal(user.locked_until, undefined);
    });

    test('rejects a short password', () => {
        assert.throws(
            () => UserService.create({ username: 'short-pw', password: 'short' }),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });

    test('rejects a duplicate username (case-insensitive)', () => {
        UserService.create({ username: 'carol', password: 'carol-password' });
        assert.throws(
            () => UserService.create({ username: 'CAROL', password: 'another-password' }),
            (err) => err instanceof AppError && err.statusCode === 409
        );
    });

    test('rejects a role outside admin/user', () => {
        assert.throws(
            () => UserService.create({ username: 'dave', password: 'dave-password', role: 'superadmin' }),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });
});

describe('UserService.list / setStatus / resetPassword / delete', () => {
    test('list includes every created user, newest last, with no password_hash', () => {
        const before = UserService.list().length;
        UserService.create({ username: 'erin', password: 'erin-password' });
        const after = UserService.list();
        assert.equal(after.length, before + 1);
        assert.ok(after.every((u) => u.password_hash === undefined));
    });

    test('setStatus disables an account', () => {
        const user = UserService.create({ username: 'frank', password: 'frank-password' });
        const updated = UserService.setStatus(user.id, 'disabled');
        assert.equal(updated.status, 'disabled');
    });

    test('setStatus rejects a value outside active/disabled', () => {
        const user = UserService.create({ username: 'gina', password: 'gina-password' });
        assert.throws(
            () => UserService.setStatus(user.id, 'banned'),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });

    test('setStatus on a missing id is a 404', () => {
        assert.throws(
            () => UserService.setStatus(999999, 'disabled'),
            (err) => err instanceof AppError && err.statusCode === 404
        );
    });

    test('resetPassword replaces the stored hash', () => {
        const user = UserService.create({ username: 'henry', password: 'henry-password' });
        const updated = UserService.resetPassword(user.id, 'a-new-password');
        assert.equal(updated.id, user.id);
        assert.equal(updated.password_hash, undefined);
    });

    test('delete removes the user', () => {
        const user = UserService.create({ username: 'ivan', password: 'ivan-password' });
        UserService.delete(user.id);
        assert.throws(
            () => UserService.setStatus(user.id, 'disabled'),
            (err) => err instanceof AppError && err.statusCode === 404
        );
    });
});

describe('the last active admin cannot be removed', () => {
    function freshDb(name) {
        AdminDatabase.reset();
        AdminDatabase.dbPath = path.join(tmp, `${name}.sqlite`);
    }

    // Regression: disabling or deleting the only active admin locked the admin
    // panel for good - bootstrap only runs when the user table is EMPTY.
    test('disable and delete of the last active admin are refused with 409', () => {
        freshDb('last-admin-1');
        const admin = UserService.create({ username: 'only-admin', password: 'only-admin-pw', role: 'admin' });
        UserService.create({ username: 'plain-user', password: 'plain-user-pw' });
        assert.throws(() => UserService.setStatus(admin.id, 'disabled'), (e) => e instanceof AppError && e.statusCode === 409);
        assert.throws(() => UserService.delete(admin.id), (e) => e instanceof AppError && e.statusCode === 409);
    });

    test('another admin may still be disabled or deleted while one stays active', () => {
        freshDb('last-admin-2');
        UserService.create({ username: 'admin-a', password: 'admin-a-password', role: 'admin' });
        const b = UserService.create({ username: 'admin-b', password: 'admin-b-password', role: 'admin' });
        assert.equal(UserService.setStatus(b.id, 'disabled').status, 'disabled');
        UserService.delete(b.id);
    });
});

describe('deleting a user who left an audit trail', () => {
    // Regression: audit_logs.actor_id (and the policy/grant author columns)
    // reference users(id) with no ON DELETE action, so deleting anyone who had
    // ever acted failed with a constraint error -> raw 500.
    test('succeeds and keeps the audit row with its actor cleared', () => {
        AdminDatabase.reset();
        AdminDatabase.dbPath = path.join(tmp, 'audit-delete.sqlite');
        const AuditLogRepository = require('../../src/db/repositories/AuditLogRepository');
        UserService.create({ username: 'keeper', password: 'keeper-password', role: 'admin' });
        const gone = UserService.create({ username: 'leaver', password: 'leaver-password', role: 'admin' });
        AuditLogRepository.record({ actorId: gone.id, action: 'user.create', outcome: 'success' });

        UserService.delete(gone.id);

        const row = AuditLogRepository.list().find((r) => r.action === 'user.create');
        assert.ok(row, 'the audit row survives');
        assert.equal(row.actor_id, null);
    });
});
