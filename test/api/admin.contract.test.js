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

describe('policy enforcement for a non-admin session', () => {
    const q = (p) => encodeURIComponent(p);
    let user;
    let userHeaders;

    async function policy(p, fields) {
        const res = await sendJson('PUT', '/api/v1/admin/files/policy', { path: p, ...fields }, adminHeaders);
        assert.equal(res.status, 200, JSON.stringify(res.json));
    }
    const download = (p, headers = userHeaders) => send('GET', `/api/v1/fs/download?path=${q(p)}`, { headers });
    async function listNames(dir) {
        const res = await send('GET', `/api/v1/fs/list?path=${q(dir)}&limit=200`, { headers: userHeaders });
        assert.equal(res.status, 200, JSON.stringify(res.json));
        return { names: res.json.items.map((i) => i.name).sort(), total: res.json.total };
    }

    before(async () => {
        const dir = path.join(ROOT, 'enforce');
        fs.mkdirSync(path.join(dir, 'vault', 'deep'), { recursive: true });
        for (const name of ['open.txt', 'locked.txt', 'draft.txt', 'shared.txt', 'granted.txt', 'denied.txt', 'future.txt', 'expired.txt']) {
            fs.writeFileSync(path.join(dir, name), name);
        }
        fs.writeFileSync(path.join(dir, 'vault', 'deep', 'secret.txt'), 'secret');

        user = await createUser('enforce-user');
        userHeaders = await loginAs('enforce-user');

        const hour = 3600 * 1000;
        await policy('/enforce/locked.txt', { accessMode: 'authenticated', isPublished: true, isLocked: true });
        await policy('/enforce/draft.txt', { accessMode: 'authenticated', isPublished: false });
        await policy('/enforce/shared.txt', { accessMode: 'authenticated', isPublished: true });
        await policy('/enforce/granted.txt', { accessMode: 'restricted', isPublished: true });
        await policy('/enforce/denied.txt', { accessMode: 'restricted', isPublished: true });
        await policy('/enforce/future.txt', { accessMode: 'authenticated', isPublished: true, availableFrom: Date.now() + hour });
        await policy('/enforce/expired.txt', { accessMode: 'authenticated', isPublished: true, availableUntil: Date.now() - hour });
        await policy('/enforce/vault', { isDirectory: true, accessMode: 'authenticated', isPublished: true, isLocked: true });

        await sendJson('POST', '/api/v1/admin/files/permissions', { path: '/enforce/granted.txt', userId: user.id, permission: 'grant' }, adminHeaders);
        await sendJson('POST', '/api/v1/admin/files/permissions', { path: '/enforce/denied.txt', userId: user.id, permission: 'deny' }, adminHeaders);
    });

    test('download: allowed exactly where every policy on the path allows', async () => {
        const expected = {
            '/enforce/open.txt': 200, // no policy: open to every signed-in user
            '/enforce/shared.txt': 200,
            '/enforce/granted.txt': 200,
            '/enforce/locked.txt': 404,
            '/enforce/draft.txt': 404,
            '/enforce/denied.txt': 404,
            '/enforce/future.txt': 404,
            '/enforce/expired.txt': 404,
            '/enforce/vault/deep/secret.txt': 404, // locked ancestor folder
        };
        for (const [p, status] of Object.entries(expected)) {
            assert.equal((await download(p)).status, status, p);
        }
    });

    test('a hidden file answers exactly like a missing one', async () => {
        const hidden = await download('/enforce/locked.txt');
        const missing = await download('/enforce/no-such-file.txt');
        assert.equal(hidden.status, missing.status);
        assert.equal(hidden.json.error.replace('locked', 'X'), missing.json.error.replace('no-such-file', 'X'));
    });

    test('non-canonical spellings of a hidden path are not a way around it', async () => {
        for (const p of ['/enforce//locked.txt', '/enforce/./locked.txt', '/enforce/vault/../locked.txt', '/enforce/locked.txt/', '/enforce/vault//deep/secret.txt']) {
            assert.notEqual((await download(p)).status, 200, p);
        }
    });

    test('list and tree omit hidden entries, and total/counts do not reveal them', async () => {
        const { names, total } = await listNames('/enforce');
        assert.deepEqual(names, ['granted.txt', 'open.txt', 'shared.txt']);
        assert.equal(total, 3);

        const tree = await send('GET', `/api/v1/fs/tree?path=${q('/enforce')}`, { headers: userHeaders });
        assert.equal(tree.status, 200);
        assert.deepEqual(tree.json[0].children.map((c) => c.name), [], 'the locked vault folder is not in the tree');

        assert.equal((await send('GET', `/api/v1/fs/list?path=${q('/enforce/vault')}`, { headers: userHeaders })).status, 404);
    });

    test('ZIP refuses a hidden path and leaves hidden descendants out of a folder', async () => {
        const zipHidden = await sendJson('POST', '/api/v1/fs/download-zip', { paths: ['/enforce/locked.txt'] }, userHeaders);
        assert.equal(zipHidden.status, 404);

        const raw = await new Promise((resolve, reject) => {
            const body = JSON.stringify({ paths: ['/enforce'] });
            const req = http.request({ host: '127.0.0.1', port, path: '/api/v1/fs/download-zip', method: 'POST', agent: false,
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...userHeaders } }, (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
            });
            req.on('error', reject);
            req.end(body);
        });
        assert.equal(raw.status, 200);
        const listing = raw.buffer.toString('latin1'); // ZIP stores entry names uncompressed
        assert.ok(listing.includes('enforce/open.txt'));
        for (const hidden of ['locked.txt', 'draft.txt', 'denied.txt', 'secret.txt']) {
            assert.ok(!listing.includes(hidden), `${hidden} must not be in the archive`);
        }
    });

    test('mutations refuse hidden items and folders hiding something', async () => {
        const del = await sendJson('DELETE', '/api/v1/fs/delete', { paths: ['/enforce/locked.txt'] }, userHeaders);
        assert.equal(del.status, 404);
        const delFolder = await sendJson('DELETE', '/api/v1/fs/delete', { paths: ['/enforce'] }, userHeaders);
        assert.equal(delFolder.status, 403, 'deleting a folder would destroy what the user cannot see');
        const copy = await sendJson('POST', '/api/v1/fs/copy', { paths: ['/enforce'], destination: '/' }, userHeaders);
        assert.equal(copy.status, 403, 'copying would publish an unprotected duplicate');
        const rename = await sendJson('PUT', '/api/v1/fs/rename', { oldPath: '/enforce/draft.txt', newName: 'x.txt' }, userHeaders);
        assert.equal(rename.status, 404);
        const move = await sendJson('PUT', '/api/v1/fs/move', { paths: ['/enforce/open.txt'], destination: '/enforce/vault' }, userHeaders);
        assert.equal(move.status, 404, 'cannot move into a hidden folder');
        const star = await sendJson('POST', '/api/v1/fs/star', { path: '/enforce/locked.txt' }, userHeaders);
        assert.equal(star.status, 404);
        const folder = await sendJson('POST', '/api/v1/fs/folder', { path: '/enforce/vault/new' }, userHeaders);
        assert.equal(folder.status, 404);
        assert.ok(fs.existsSync(path.join(ROOT, 'enforce', 'locked.txt')));
    });

    test('an administrator is never restricted by a policy', async () => {
        assert.equal((await download('/enforce/locked.txt', adminHeaders)).status, 200);
        assert.equal((await download('/enforce/vault/deep/secret.txt', adminHeaders)).status, 200);
    });

    test('changing the policy takes effect on the next request', async () => {
        await policy('/enforce/draft.txt', { isPublished: true });
        assert.equal((await download('/enforce/draft.txt')).status, 200);
        await sendJson('DELETE', '/api/v1/admin/files/permissions', { path: '/enforce/granted.txt', userId: user.id }, adminHeaders);
        assert.equal((await download('/enforce/granted.txt')).status, 404, 'a revoked grant closes a restricted file');
    });
});
