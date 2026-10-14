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

// checkerFor canonicalises paths against the storage root; any root works, nothing is read.
process.env.STORAGE_ROOT = process.env.STORAGE_ROOT || os.tmpdir();

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

describe('FileAccessPolicyService.onPathRenamed / onPathDeleted carry descendants', () => {
    test('renaming a folder re-keys the policies below it, not a name-prefix sibling', () => {
        FileAccessPolicyService.setPolicy('/dir/inner.txt', { actorId });
        FileAccessPolicyService.setPolicy('/dir-sibling.txt', { actorId });
        FileAccessPolicyService.onPathRenamed('/dir', '/renamed');
        assert.equal(FileAccessPolicyService.getByPath('/dir/inner.txt'), null);
        assert.ok(FileAccessPolicyService.getByPath('/renamed/inner.txt'));
        assert.ok(FileAccessPolicyService.getByPath('/dir-sibling.txt'), 'a sibling sharing the prefix is untouched');
    });

    test('deleting a folder removes the policies below it', () => {
        FileAccessPolicyService.setPolicy('/gone/inner.txt', { actorId });
        FileAccessPolicyService.onPathDeleted('/gone');
        assert.equal(FileAccessPolicyService.getByPath('/gone/inner.txt'), null);
    });
});

describe('FileAccessPolicyService.checkerFor (the access decision)', () => {
    const NOW = 1_000_000;
    let user;
    let other;

    before(() => {
        user = UserRepository.create({ username: 'checker-user', passwordHash: hashPassword('x-password-1') });
        other = UserRepository.create({ username: 'checker-other', passwordHash: hashPassword('x-password-1') });
        const open = { accessMode: 'authenticated', isPublished: true, actorId };
        FileAccessPolicyService.setPolicy('/k/open.txt', open);
        FileAccessPolicyService.setPolicy('/k/public.txt', { ...open, accessMode: 'public' });
        FileAccessPolicyService.setPolicy('/k/locked.txt', { ...open, isLocked: true });
        FileAccessPolicyService.setPolicy('/k/unpublished.txt', { ...open, isPublished: false });
        FileAccessPolicyService.setPolicy('/k/starts.txt', { ...open, availableFrom: NOW + 1 });
        FileAccessPolicyService.setPolicy('/k/ends.txt', { ...open, availableUntil: NOW });
        FileAccessPolicyService.setPolicy('/k/window.txt', { ...open, availableFrom: NOW, availableUntil: NOW + 1 });
        FileAccessPolicyService.setPolicy('/k/restricted.txt', { ...open, accessMode: 'restricted' });
        FileAccessPolicyService.grantPermission('/k/restricted.txt', user.id, 'grant', actorId);
        FileAccessPolicyService.setPolicy('/k/denied.txt', { ...open, accessMode: 'restricted' });
        FileAccessPolicyService.grantPermission('/k/denied.txt', user.id, 'deny', actorId);
        FileAccessPolicyService.setPolicy('/k/sealed', { ...open, isDirectory: true, isLocked: true });
        FileAccessPolicyService.setPolicy('/k/sealed/opened.txt', open);
    });

    test('each rule decides as documented', () => {
        const access = FileAccessPolicyService.checkerFor({ id: user.id, role: 'user' }, NOW);
        const expected = {
            '/k/no-policy.txt': true,
            '/k/open.txt': true,
            '/k/public.txt': true,
            '/k/locked.txt': false,
            '/k/unpublished.txt': false,
            '/k/starts.txt': false,
            '/k/ends.txt': false, // available_until is exclusive
            '/k/window.txt': true, // available_from is inclusive
            '/k/restricted.txt': true,
            '/k/denied.txt': false,
            '/k/sealed': false,
            '/k/sealed/opened.txt': false, // a locked ancestor wins over a permissive child
        };
        for (const [p, allowed] of Object.entries(expected)) assert.equal(access.canAccess(p), allowed, p);
    });

    test('a grant belongs to one user', () => {
        const access = FileAccessPolicyService.checkerFor({ id: other.id, role: 'user' }, NOW);
        assert.equal(access.canAccess('/k/restricted.txt'), false);
    });

    test('an administrator is never restricted', () => {
        const access = FileAccessPolicyService.checkerFor({ id: actorId, role: 'admin' }, NOW);
        assert.equal(access.canAccess('/k/locked.txt'), true);
        assert.equal(access.hidesAnythingBelow('/k'), false);
    });

    test('non-canonical spellings resolve to the governed path', () => {
        const access = FileAccessPolicyService.checkerFor({ id: user.id, role: 'user' }, NOW);
        for (const p of ['/k//locked.txt', '/k/./locked.txt', '/k/x/../locked.txt', '/k/locked.txt/']) {
            assert.equal(access.canAccess(p), false, p);
        }
    });

    test('a subtree operation is refused when the folder hides something, with 404 for the hidden item itself', () => {
        const access = FileAccessPolicyService.checkerFor({ id: user.id, role: 'user' }, NOW);
        assert.equal(access.hidesAnythingBelow('/k'), true);
        assert.throws(() => access.assertCanAccessTree('/k'), (err) => err.statusCode === 403);
        assert.throws(() => access.assertCanAccess('/k/locked.txt'), (err) => err.statusCode === 404);
        assert.doesNotThrow(() => access.assertCanAccessTree('/k/open.txt'));
    });
});
