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

    test('rejects a non-boolean flag instead of storing its truthiness', () => {
        // Regression: the string "false" is truthy, so it was stored as 1 -
        // isPublished: "false" PUBLISHED the file on the portal.
        for (const flags of [{ isPublished: 'false' }, { isLocked: 'false' }, { isDirectory: 0 }]) {
            assert.throws(
                () => FileAccessPolicyService.setPolicy('/flags.txt', { ...flags, actorId }),
                (err) => err instanceof AppError && err.statusCode === 400,
                JSON.stringify(flags)
            );
        }
        assert.equal(FileAccessPolicyService.getByPath('/flags.txt'), null, 'nothing was stored');
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

describe('FileAccessPolicyService.portalAccess (mirror of the portal decision)', () => {
    const GroupService = require('../../src/services/GroupService');
    const NOW = 1_000_000;
    let alice; // member of "team"
    let bob; // member of "team", individually denied on /pa/team/notes
    let carol; // no group
    let off; // disabled
    let team;

    before(() => {
        const mk = (username, extra = {}) => UserRepository.create({ username, passwordHash: hashPassword('x-password-1'), ...extra });
        alice = mk('pa-alice');
        bob = mk('pa-bob');
        carol = mk('pa-carol');
        off = mk('pa-off');
        UserRepository.setStatus(off.id, 'disabled');
        team = GroupService.create({ name: 'PA team' });
        GroupService.setMembers(team.id, [alice.id, bob.id]);

        const pub = { isPublished: true, isDirectory: true, actorId };
        FileAccessPolicyService.setPolicy('/pa/team', { ...pub, accessMode: 'restricted', isLocked: true });
        FileAccessPolicyService.grantGroupPermission('/pa/team', team.id, 'grant', actorId, 'view');
        FileAccessPolicyService.grantPermission('/pa/team', alice.id, 'grant', actorId, 'download');
        FileAccessPolicyService.setPolicy('/pa/team/notes', { ...pub, accessMode: 'authenticated' });
        FileAccessPolicyService.grantPermission('/pa/team/notes', bob.id, 'deny', actorId);
        FileAccessPolicyService.setPolicy('/pa/show', { ...pub, accessMode: 'public', defaultLevel: 'view' });
        FileAccessPolicyService.setPolicy('/pa/members', { ...pub, accessMode: 'authenticated' });
        FileAccessPolicyService.setPolicy('/pa/draft', { ...pub, accessMode: 'public', isPublished: false });
        FileAccessPolicyService.setPolicy('/pa/window', { ...pub, accessMode: 'public', availableFrom: NOW, availableUntil: NOW + 10 });
    });

    const at = (p, user) => FileAccessPolicyService.portalAccess(p, user ? user.id : null, NOW).outcome;

    test('a restricted folder: grantees at their highest level, others hidden, visitors see the lock', () => {
        assert.equal(at('/pa/team/a.iso', alice), 'download', 'user grant beats the lower group grant');
        assert.equal(at('/pa/team/a.iso', bob), 'view', 'through the group');
        assert.equal(at('/pa/team/a.iso', carol), 'hidden');
        assert.equal(at('/pa/team/a.iso', null), 'locked');
    });

    test('a deny hides it from that member even inside a granted folder', () => {
        assert.equal(at('/pa/team/notes/x', bob), 'hidden');
        assert.equal(at('/pa/team/notes/x', alice), 'download');
    });

    test('public and signed-in modes, default level, unpublished and the window', () => {
        assert.equal(at('/pa/show/demo.iso', null), 'view');
        assert.equal(at('/pa/show/demo.iso', carol), 'view');
        assert.equal(at('/pa/members/x', null), 'hidden', 'not locked: visitors see nothing');
        assert.equal(at('/pa/members/x', carol), 'download', 'the default level');
        assert.equal(at('/pa/draft/x', carol), 'hidden');
        assert.equal(FileAccessPolicyService.portalAccess('/pa/window/x', null, NOW + 10).outcome, 'download', 'bounds inclusive');
        assert.equal(FileAccessPolicyService.portalAccess('/pa/window/x', null, NOW + 11).outcome, 'hidden');
        assert.equal(at('/pa/no-policy/x', null), 'download');
    });

    test('administrators get no bypass on the portal; disabled accounts cannot sign in', () => {
        assert.equal(at('/pa/team/a.iso', { id: actorId }), 'hidden');
        assert.equal(at('/pa/team/a.iso', off), 'disabled');
    });

    test('it explains which policy gave what', () => {
        const { policies } = FileAccessPolicyService.portalAccess('/pa/team/notes/x', bob.id, NOW);
        assert.deepEqual(policies, [{ path: '/pa/team', outcome: 'view' }, { path: '/pa/team/notes', outcome: 'hidden' }]);
    });

    test('levels and group names are validated', () => {
        const bad = (fn) => assert.throws(fn, (err) => err instanceof AppError && err.statusCode === 400);
        bad(() => FileAccessPolicyService.setPolicy('/pa/show', { defaultLevel: 'manage', actorId }));
        bad(() => FileAccessPolicyService.grantPermission('/pa/team', carol.id, 'grant', actorId, 'upload'));
        bad(() => GroupService.create({ name: '  ' }));
        assert.throws(() => GroupService.create({ name: 'pa TEAM' }), (err) => err.statusCode === 409, 'names are case-insensitive');
        assert.throws(() => GroupService.setMembers(team.id, [999999]), (err) => err.statusCode === 404);
    });

    test('removing a member or deleting a group removes the access it gave', () => {
        GroupService.setMembers(team.id, [alice.id]);
        assert.equal(at('/pa/team/a.iso', bob), 'hidden');
        const temp = GroupService.create({ name: 'PA temp' });
        GroupService.setMembers(temp.id, [carol.id]);
        FileAccessPolicyService.grantGroupPermission('/pa/team', temp.id, 'grant', actorId, 'view');
        assert.equal(at('/pa/team/a.iso', carol), 'view');
        GroupService.remove(temp.id);
        assert.equal(at('/pa/team/a.iso', carol), 'hidden');
    });
});
