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

    test('this change enforces nothing against a real download (design D5)', async () => {
        fs.writeFileSync(path.join(ROOT, 'blocked-in-theory.txt'), 'STILL READABLE');
        await sendJson('PUT', '/api/v1/admin/files/policy', { path: '/blocked-in-theory.txt', accessMode: 'restricted', isLocked: true }, adminHeaders);
        // Any authenticated session - not just one with a granted permission -
        // can still download it today, because nothing wires the policy into
        // the download endpoint yet.
        const res = await send('GET', '/api/v1/fs/download?path=%2Fblocked-in-theory.txt', { headers: adminHeaders });
        assert.equal(res.status, 200);
    });
});
