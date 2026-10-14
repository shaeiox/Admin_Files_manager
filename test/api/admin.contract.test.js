// test/api/admin.contract.test.js
'use strict';

/**
 * Admin API contract (ADR-009 phase 2), exercised against a LIVE server:
 * user management and file-access-policy management, both gated by
 * `requireAdmin` on top of the session+CSRF gate every route already has.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-admin-'));
const ROOT = path.join(TMP, 'root');
fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'governed.txt'), 'CONTENT');

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE = '1000';
process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE = '1000';

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

const { applyBootstrapEnv, redirectAdminDb, login: authLogin } = require('../helpers/authenticated');
applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;
let adminHeaders;

function send(method, pathname, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...headers };
        if (body !== undefined) finalHeaders['Content-Length'] = Buffer.byteLength(body);
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, agent: false, headers: finalHeaders },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    let json = null;
                    try { json = JSON.parse(buffer.toString('utf8')); } catch { /* non-JSON */ }
                    resolve({ status: res.statusCode, headers: res.headers, json });
                });
            }
        );
        req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

function sendJson(method, pathname, payload, headers = {}) {
    return send(method, pathname, { body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json', ...headers } });
}

async function createUser(username, password = 'a-password-123', role = 'user') {
    const res = await sendJson('POST', '/api/v1/admin/users', { username, password, role }, adminHeaders);
    assert.equal(res.status, 201, JSON.stringify(res.json));
    return res.json.user;
}

async function loginAs(username, password = 'a-password-123') {
    const res = await sendJson('POST', '/api/v1/auth/login', { username, password });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const setCookie = (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('afm_session='));
    return { Cookie: setCookie, 'X-CSRF-Token': res.json.csrfToken };
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
    adminHeaders = (await authLogin(port)).headers;
});

after(async () => {
    if (server) {
        if (server.closeAllConnections) server.closeAllConnections();
        await new Promise((r) => server.close(r));
        server = null;
    }
    require('../../src/db/connection').reset();
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('role gate (identity/rbac-lite)', () => {
    test('a non-admin session is refused every admin route with 403', async () => {
        await createUser('nonadmin1');
        const userHeaders = await loginAs('nonadmin1');
        const listUsers = await send('GET', '/api/v1/admin/users', { headers: userHeaders });
        assert.equal(listUsers.status, 403);
        const listPolicies = await send('GET', '/api/v1/admin/files/policies', { headers: userHeaders });
        assert.equal(listPolicies.status, 403);
    });

    test('no session at all is still refused with 401, not 403 (auth gate runs first)', async () => {
        const res = await send('GET', '/api/v1/admin/users');
        assert.equal(res.status, 401);
    });

    test('the admin session created at bootstrap can reach admin routes', async () => {
        const res = await send('GET', '/api/v1/admin/users', { headers: adminHeaders });
        assert.equal(res.status, 200);
    });
});

describe('user management', () => {
    test('create -> list -> disable -> sessions revoked -> delete', async () => {
        const created = await createUser('fulltest-user');
        const afterCreate = await send('GET', '/api/v1/admin/users', { headers: adminHeaders });
        assert.ok(afterCreate.json.some((u) => u.id === created.id));
        assert.equal(afterCreate.json.find((u) => u.id === created.id).password_hash, undefined);

        const userHeaders = await loginAs('fulltest-user');
        const disableRes = await sendJson('POST', `/api/v1/admin/users/${created.id}/status`, { status: 'disabled' }, adminHeaders);
        assert.equal(disableRes.status, 200);

        const afterDisable = await send('GET', '/api/v1/fs/list?path=/', { headers: userHeaders });
        assert.equal(afterDisable.status, 401, 'disabling a user must revoke their existing session immediately');

        const deleteRes = await send('DELETE', `/api/v1/admin/users/${created.id}`, { headers: adminHeaders });
        assert.equal(deleteRes.status, 200);
    });

    test('resetting a password revokes existing sessions', async () => {
        const created = await createUser('reset-pw-user');
        const userHeaders = await loginAs('reset-pw-user');
        const resetRes = await sendJson('POST', `/api/v1/admin/users/${created.id}/reset-password`, { password: 'a-new-password-1' }, adminHeaders);
        assert.equal(resetRes.status, 200);

        const oldSession = await send('GET', '/api/v1/fs/list?path=/', { headers: userHeaders });
        assert.equal(oldSession.status, 401);

        const newHeaders = await loginAs('reset-pw-user', 'a-new-password-1');
        const newSession = await send('GET', '/api/v1/fs/list?path=/', { headers: newHeaders });
        assert.equal(newSession.status, 200);
    });

    test('revoke-sessions ends a session without disabling the account', async () => {
        const created = await createUser('revoke-only-user');
        const userHeaders = await loginAs('revoke-only-user');
        const revokeRes = await send('POST', `/api/v1/admin/users/${created.id}/revoke-sessions`, { headers: adminHeaders });
        assert.equal(revokeRes.status, 200);
        const afterRevoke = await send('GET', '/api/v1/fs/list?path=/', { headers: userHeaders });
        assert.equal(afterRevoke.status, 401);

        const relogin = await loginAs('revoke-only-user');
        const stillActive = await send('GET', '/api/v1/fs/list?path=/', { headers: relogin });
        assert.equal(stillActive.status, 200, 'the account itself must still be active');
    });
});

describe('file-access-policy management', () => {
    test('a path with no policy returns null', async () => {
        const res = await send('GET', '/api/v1/admin/files/policy?path=/never-touched.txt', { headers: adminHeaders });
        assert.equal(res.status, 200);
        assert.equal(res.json, null);
    });

    test('set -> list -> update in place -> delete', async () => {
        const setRes = await sendJson('PUT', '/api/v1/admin/files/policy', { path: '/governed.txt', accessMode: 'restricted', isPublished: true }, adminHeaders);
        assert.equal(setRes.status, 200);
        assert.equal(setRes.json.policy.access_mode, 'restricted');

        const listRes = await send('GET', '/api/v1/admin/files/policies', { headers: adminHeaders });
        assert.equal(listRes.json.filter((p) => p.client_path === '/governed.txt').length, 1);

        const updateRes = await sendJson('PUT', '/api/v1/admin/files/policy', { path: '/governed.txt', isLocked: true }, adminHeaders);
        assert.equal(updateRes.json.policy.is_locked, 1);
        assert.equal(updateRes.json.policy.is_published, 1, 'untouched fields survive the partial update');

        const stillOne = await send('GET', '/api/v1/admin/files/policies', { headers: adminHeaders });
        assert.equal(stillOne.json.filter((p) => p.client_path === '/governed.txt').length, 1, 'no duplicate row from the second PUT');

        const deleteRes = await send('DELETE', '/api/v1/admin/files/policy?path=/governed.txt', { headers: adminHeaders });
        assert.equal(deleteRes.status, 200);
        const afterDelete = await send('GET', '/api/v1/admin/files/policy?path=/governed.txt', { headers: adminHeaders });
        assert.equal(afterDelete.json, null);
    });

    test('granting a permission requires a policy to exist first', async () => {
        const user = await createUser('permission-target-1');
        const res = await sendJson('POST', '/api/v1/admin/files/permissions', { path: '/no-policy-yet.txt', userId: user.id, permission: 'grant' }, adminHeaders);
        assert.equal(res.status, 409);
    });

    test('grant -> list -> revoke', async () => {
        await sendJson('PUT', '/api/v1/admin/files/policy', { path: '/perm-target.txt', accessMode: 'restricted' }, adminHeaders);
        const user = await createUser('permission-target-2');

        const grantRes = await sendJson('POST', '/api/v1/admin/files/permissions', { path: '/perm-target.txt', userId: user.id, permission: 'grant' }, adminHeaders);
        assert.equal(grantRes.status, 201);

        const listRes = await send('GET', '/api/v1/admin/files/permissions?path=/perm-target.txt', { headers: adminHeaders });
        assert.equal(listRes.json.length, 1);

        const revokeRes = await sendJson('DELETE', '/api/v1/admin/files/permissions', { path: '/perm-target.txt', userId: user.id }, adminHeaders);
        assert.equal(revokeRes.status, 200);
        const afterRevoke = await send('GET', '/api/v1/admin/files/permissions?path=/perm-target.txt', { headers: adminHeaders });
        assert.equal(afterRevoke.json.length, 0);
    });

    test('a policy follows a real rename through /api/v1/fs/rename', async () => {
        fs.writeFileSync(path.join(ROOT, 'before-rename.txt'), 'x');
        await sendJson('PUT', '/api/v1/admin/files/policy', { path: '/before-rename.txt', accessMode: 'public' }, adminHeaders);
        const renameRes = await sendJson('PUT', '/api/v1/fs/rename', { oldPath: '/before-rename.txt', newName: 'after-rename.txt' }, adminHeaders);
        assert.equal(renameRes.status, 200);

        const oldPolicy = await send('GET', '/api/v1/admin/files/policy?path=/before-rename.txt', { headers: adminHeaders });
        assert.equal(oldPolicy.json, null);
        const newPolicy = await send('GET', '/api/v1/admin/files/policy?path=/after-rename.txt', { headers: adminHeaders });
        assert.ok(newPolicy.json);
        assert.equal(newPolicy.json.access_mode, 'public');
    });

    test('a policy follows a real move through /api/v1/fs/move', async () => {
        fs.mkdirSync(path.join(ROOT, 'archive'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'before-move.txt'), 'x');
        await sendJson('PUT', '/api/v1/admin/files/policy', { path: '/before-move.txt', accessMode: 'public' }, adminHeaders);
        const moveRes = await sendJson('PUT', '/api/v1/fs/move', { paths: ['/before-move.txt'], destination: '/archive' }, adminHeaders);
        assert.equal(moveRes.status, 200);
        assert.deepEqual(moveRes.json.data.moved, [{ oldPath: '/before-move.txt', newPath: '/archive/before-move.txt' }]);

        const oldPolicy = await send('GET', '/api/v1/admin/files/policy?path=/before-move.txt', { headers: adminHeaders });
        assert.equal(oldPolicy.json, null);
        const newPolicy = await send('GET', '/api/v1/admin/files/policy?path=/archive/before-move.txt', { headers: adminHeaders });
        assert.ok(newPolicy.json);
        assert.equal(newPolicy.json.access_mode, 'public');
    });

    test('a policy below a renamed folder moves with it instead of being stranded', async () => {
        fs.mkdirSync(path.join(ROOT, 'old-dir'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'old-dir', 'inner.txt'), 'x');
        await sendJson('PUT', '/api/v1/admin/files/policy', { path: '/old-dir/inner.txt', isLocked: true }, adminHeaders);
        const renameRes = await sendJson('PUT', '/api/v1/fs/rename', { oldPath: '/old-dir', newName: 'new-dir' }, adminHeaders);
        assert.equal(renameRes.status, 200);

        const moved = await send('GET', '/api/v1/admin/files/policy?path=/new-dir/inner.txt', { headers: adminHeaders });
        assert.ok(moved.json, 'the descendant policy was re-keyed under the new folder name');
        assert.equal(moved.json.is_locked, 1);
    });
});

describe('policies never restrict this application (they govern the File Portal only)', () => {
    const q = (p) => encodeURIComponent(p);
    let userHeaders;

    before(async () => {
        const dir = path.join(ROOT, 'portal-only');
        fs.mkdirSync(path.join(dir, 'vault'), { recursive: true });
        for (const name of ['restricted.txt', 'locked.txt', 'draft.txt', 'denied.txt', 'expired.txt']) {
            fs.writeFileSync(path.join(dir, name), name);
        }
        fs.writeFileSync(path.join(dir, 'vault', 'secret.txt'), 'secret');

        const user = await createUser('portal-only-user');
        userHeaders = await loginAs('portal-only-user');

        const set = (p, fields) => sendJson('PUT', '/api/v1/admin/files/policy', { path: p, ...fields }, adminHeaders);
        await set('/portal-only/restricted.txt', { accessMode: 'restricted', isPublished: true });
        await set('/portal-only/locked.txt', { accessMode: 'authenticated', isPublished: true, isLocked: true });
        await set('/portal-only/draft.txt', { accessMode: 'public', isPublished: false });
        await set('/portal-only/denied.txt', { accessMode: 'public', isPublished: true });
        await set('/portal-only/expired.txt', { accessMode: 'public', isPublished: true, availableUntil: Date.now() - 1000 });
        await set('/portal-only/vault', { isDirectory: true, accessMode: 'restricted', isPublished: true });
        await sendJson('POST', '/api/v1/admin/files/permissions',
            { path: '/portal-only/denied.txt', userId: user.id, permission: 'deny' }, adminHeaders);
    });

    test('a non-admin account lists, downloads and zips every governed path', async () => {
        const list = await send('GET', `/api/v1/fs/list?path=${q('/portal-only')}&limit=200`, { headers: userHeaders });
        assert.equal(list.status, 200);
        assert.deepEqual(list.json.items.map((i) => i.name).sort(),
            ['denied.txt', 'draft.txt', 'expired.txt', 'locked.txt', 'restricted.txt', 'vault']);

        for (const p of ['restricted.txt', 'locked.txt', 'draft.txt', 'denied.txt', 'expired.txt', 'vault/secret.txt']) {
            const res = await send('GET', `/api/v1/fs/download?path=${q('/portal-only/' + p)}`, { headers: userHeaders });
            assert.equal(res.status, 200, p);
        }
        const tree = await send('GET', `/api/v1/fs/tree?path=${q('/portal-only')}`, { headers: userHeaders });
        assert.equal(tree.status, 200);
        assert.deepEqual(tree.json[0].children.map((c) => c.name), ['vault']);
    });

    test('a non-admin account can rename and delete governed items, and the policy follows', async () => {
        const renamed = await sendJson('PUT', '/api/v1/fs/rename', { oldPath: '/portal-only/vault', newName: 'vault2' }, userHeaders);
        assert.equal(renamed.status, 200, JSON.stringify(renamed.json));
        const moved = await send('GET', `/api/v1/admin/files/policy?path=${q('/portal-only/vault2')}`, { headers: adminHeaders });
        assert.equal(moved.json.access_mode, 'restricted');

        const del = await sendJson('DELETE', '/api/v1/fs/delete', { paths: ['/portal-only/locked.txt'] }, userHeaders);
        assert.equal(del.status, 200, JSON.stringify(del.json));
        assert.deepEqual(del.json.data.deleted, ['/portal-only/locked.txt']);
    });
});

describe('groups and portal access levels', () => {
    const q = (p) => encodeURIComponent(p);
    let viewer;
    let viewerHeaders;
    let group;
    const effective = async (p, userId) => (await send('GET',
        `/api/v1/admin/files/effective?path=${q(p)}${userId ? `&userId=${userId}` : ''}`, { headers: adminHeaders })).json;

    before(async () => {
        fs.mkdirSync(path.join(ROOT, 'levels'), { recursive: true });
        fs.writeFileSync(path.join(ROOT, 'levels', 'build.iso'), 'ISO');
        viewer = await createUser('level-viewer');
        viewerHeaders = await loginAs('level-viewer');
    });

    test('group CRUD: create -> members -> list -> duplicate -> admin only', async () => {
        const created = await sendJson('POST', '/api/v1/admin/groups', { name: 'Viewers' }, adminHeaders);
        assert.equal(created.status, 201, JSON.stringify(created.json));
        group = created.json.group;

        const members = await sendJson('PUT', `/api/v1/admin/groups/${group.id}/members`, { userIds: [viewer.id] }, adminHeaders);
        assert.equal(members.status, 200);
        assert.deepEqual(members.json.group.members.map((m) => m.username), ['level-viewer']);

        const listed = await send('GET', '/api/v1/admin/groups', { headers: adminHeaders });
        assert.ok(Array.isArray(listed.json), 'bare array');
        assert.ok(listed.json.some((g) => g.id === group.id));

        const dup = await sendJson('POST', '/api/v1/admin/groups', { name: 'viewers' }, adminHeaders);
        assert.equal(dup.status, 409);
        const forbidden = await send('GET', '/api/v1/admin/groups', { headers: viewerHeaders });
        assert.equal(forbidden.status, 403);
    });

    test('Check access answers with the portal decision, for members, others and visitors', async () => {
        await sendJson('PUT', '/api/v1/admin/files/policy',
            { path: '/levels', isDirectory: true, accessMode: 'restricted', isPublished: true, isLocked: true }, adminHeaders);
        const grant = await sendJson('POST', '/api/v1/admin/files/permissions',
            { path: '/levels', groupId: group.id, permission: 'grant', level: 'view' }, adminHeaders);
        assert.equal(grant.status, 201, JSON.stringify(grant.json));

        assert.equal((await effective('/levels/build.iso', viewer.id)).outcome, 'view');
        assert.equal((await effective('/levels/build.iso')).outcome, 'locked', 'a visitor sees the lock');
        assert.deepEqual((await effective('/levels/build.iso', viewer.id)).policies, [{ path: '/levels', outcome: 'view' }]);

        const perms = await send('GET', `/api/v1/admin/files/group-permissions?path=${q('/levels')}`, { headers: adminHeaders });
        assert.deepEqual(perms.json.map((p) => [p.group_name, p.level]), [['Viewers', 'view']]);
    });

    test('the same member is not restricted in this app', async () => {
        const dl = await send('GET', `/api/v1/fs/download?path=${q('/levels/build.iso')}`, { headers: viewerHeaders });
        assert.equal(dl.status, 200);
    });

    test('only portal levels are accepted', async () => {
        const bad = await sendJson('POST', '/api/v1/admin/files/permissions',
            { path: '/levels', groupId: group.id, permission: 'grant', level: 'manage' }, adminHeaders);
        assert.equal(bad.status, 400);
    });

    test('revoking the group grant hides the folder from the member on the portal', async () => {
        const res = await sendJson('DELETE', '/api/v1/admin/files/permissions', { path: '/levels', groupId: group.id }, adminHeaders);
        assert.equal(res.status, 200);
        assert.equal((await effective('/levels/build.iso', viewer.id)).outcome, 'hidden');
    });
});
