// test/services/FileAccessPolicyService.test.js
'use strict';

/**
 * FileAccessPolicyService unit tests (ADR-009 phase 2). Redirects the
 * AdminDatabase singleton at an isolated temp file, same pattern as
 * UserService.test.js.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AdminDatabase = require('../../src/db/connection');
const UserRepository = require('../../src/db/repositories/UserRepository');
const FileAccessPolicyService = require('../../src/services/FileAccessPolicyService');
const AppError = require('../../src/utils/AppError');
const { hashPassword } = require('../../src/utils/crypto');

let tmp;
let actorId;

before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-filepolicy-'));
    AdminDatabase.dbPath = path.join(tmp, 'admin.sqlite');
    AdminDatabase.reset();
    actorId = UserRepository.create({ username: 'admin', passwordHash: hashPassword('admin-password-1'), role: 'admin' }).id;
});

after(() => {
    AdminDatabase.reset();
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe('FileAccessPolicyService.setPolicy / getByPath', () => {
    test('a path with no policy returns null', () => {
        assert.equal(FileAccessPolicyService.getByPath('/never-touched.txt'), null);
    });

    test('creates a policy defaulting to restricted/unpublished/unlocked', () => {
        const policy = FileAccessPolicyService.setPolicy('/a.txt', { actorId });
        assert.equal(policy.access_mode, 'restricted');
        assert.equal(policy.is_published, 0);
        assert.equal(policy.is_locked, 0);
    });

    test('setting a policy again on the same path updates in place, not a duplicate', () => {
        FileAccessPolicyService.setPolicy('/b.txt', { accessMode: 'public', actorId });
        FileAccessPolicyService.setPolicy('/b.txt', { isPublished: true, actorId });
        const all = FileAccessPolicyService.list().filter((p) => p.client_path === '/b.txt');
        assert.equal(all.length, 1);
        assert.equal(all[0].access_mode, 'public', 'the earlier field is preserved across the partial update');
        assert.equal(all[0].is_published, 1);
    });

    test('rejects an invalid access_mode', () => {
        assert.throws(
            () => FileAccessPolicyService.setPolicy('/c.txt', { accessMode: 'superpublic', actorId }),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });

    test('rejects available_from after available_until', () => {
        assert.throws(
            () => FileAccessPolicyService.setPolicy('/d.txt', { availableFrom: 2000, availableUntil: 1000, actorId }),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });

    test('rejects a malformed client path', () => {
        assert.throws(
            () => FileAccessPolicyService.setPolicy('not-rooted.txt', { actorId }),
            (err) => err instanceof AppError && err.statusCode === 400
        );
    });
});

describe('FileAccessPolicyService.grantPermission / revokePermission / listPermissions', () => {
    test('granting requires a policy to exist first', () => {
        const user = UserRepository.create({ username: 'nopolicy-user', passwordHash: hashPassword('x-password-1') });
        assert.throws(
            () => FileAccessPolicyService.grantPermission('/never-has-a-policy.txt', user.id, 'grant', actorId),
            (err) => err instanceof AppError && err.statusCode === 409
        );
    });

    test('granting requires a real user', () => {
        FileAccessPolicyService.setPolicy('/e.txt', { accessMode: 'restricted', actorId });
        assert.throws(
            () => FileAccessPolicyService.grantPermission('/e.txt', 999999, 'grant', actorId),
            (err) => err instanceof AppError && err.statusCode === 404
        );
    });

    test('grant then revoke round-trips cleanly', () => {
        FileAccessPolicyService.setPolicy('/f.txt', { accessMode: 'restricted', actorId });
        const user = UserRepository.create({ username: 'grantee', passwordHash: hashPassword('x-password-1') });
        FileAccessPolicyService.grantPermission('/f.txt', user.id, 'grant', actorId);
        assert.equal(FileAccessPolicyService.listPermissions('/f.txt').length, 1);
        FileAccessPolicyService.revokePermission('/f.txt', user.id);
        assert.equal(FileAccessPolicyService.listPermissions('/f.txt').length, 0);
    });

    test('granting twice for the same (file, user) updates in place', () => {
        FileAccessPolicyService.setPolicy('/g.txt', { accessMode: 'restricted', actorId });
        const user = UserRepository.create({ username: 'flip-flopper', passwordHash: hashPassword('x-password-1') });
        FileAccessPolicyService.grantPermission('/g.txt', user.id, 'grant', actorId);
        FileAccessPolicyService.grantPermission('/g.txt', user.id, 'deny', actorId);
        const rows = FileAccessPolicyService.listPermissions('/g.txt');
        assert.equal(rows.length, 1);
        assert.equal(rows[0].permission, 'deny');
    });
});

describe('FileAccessPolicyService.onPathRenamed / onPathDeleted (best-effort hooks)', () => {
    test('onPathRenamed updates the governed path', () => {
        FileAccessPolicyService.setPolicy('/old-name.txt', { actorId });
        FileAccessPolicyService.onPathRenamed('/old-name.txt', '/new-name.txt');
        assert.equal(FileAccessPolicyService.getByPath('/old-name.txt'), null);
        assert.ok(FileAccessPolicyService.getByPath('/new-name.txt'));
    });

    test('onPathRenamed never throws for an ungoverned path', () => {
        assert.doesNotThrow(() => FileAccessPolicyService.onPathRenamed('/never-governed.txt', '/still-never.txt'));
    });

    test('onPathDeleted removes the governed row', () => {
        FileAccessPolicyService.setPolicy('/to-delete.txt', { actorId });
        FileAccessPolicyService.onPathDeleted('/to-delete.txt');
        assert.equal(FileAccessPolicyService.getByPath('/to-delete.txt'), null);
    });

    test('onPathDeleted never throws for an ungoverned path', () => {
        assert.doesNotThrow(() => FileAccessPolicyService.onPathDeleted('/never-governed-2.txt'));
    });
});
