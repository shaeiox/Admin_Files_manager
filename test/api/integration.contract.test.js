// test/api/integration.contract.test.js
'use strict';

/**
 * File Portal integration contract v1 (isolate-app-roots), against a LIVE server:
 * the service-token gate, the snapshot document and its ETag, and the portal
 * credential check. No session cookie or CSRF token is ever sent - the caller
 * is a service.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-integration-'));
const ROOT = path.join(TMP, 'root');
fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(path.join(ROOT, 'governed.txt'), 'CONTENT');

const TOKEN_A = 'a'.repeat(40);
const TOKEN_B = 'b'.repeat(40);

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_PORTAL_SERVICE_TOKEN = `${TOKEN_A},${TOKEN_B}`;
process.env.AFM_LOGIN_RATE_LIMIT_PER_MINUTE = '1000';

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

const { applyBootstrapEnv, redirectAdminDb } = require('../helpers/authenticated');
applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;

function send(method, pathname, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...headers };
        if (body !== undefined) {
            finalHeaders['Content-Type'] = 'application/json';
            finalHeaders['Content-Length'] = Buffer.byteLength(body);
        }
        const req = http.request({ host: '127.0.0.1', port, path: pathname, method, agent: false, headers: finalHeaders }, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => {
                const text = Buffer.concat(chunks).toString('utf8');
                let json = null;
                try { json = JSON.parse(text); } catch { /* empty or non-JSON */ }
                resolve({ status: res.statusCode, headers: res.headers, text, json });
            });
        });
        req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

const SNAPSHOT = '/api/v1/integration/portal/snapshot';
const VERIFY = '/api/v1/integration/portal/credentials/verify';
const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const verify = (username, password, token = TOKEN_A) =>
    send('POST', VERIFY, { body: JSON.stringify({ username, password }), headers: bearer(token) });

let UserRepository;
let FileAccessPolicyService;
let hashPassword;

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
    UserRepository = require('../../src/db/repositories/UserRepository');
    FileAccessPolicyService = require('../../src/services/FileAccessPolicyService');
    ({ hashPassword } = require('../../src/utils/crypto'));
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

describe('service token gate', () => {
    test('either rotation token is accepted, with no session or CSRF', async () => {
        assert.equal((await send('GET', SNAPSHOT, { headers: bearer(TOKEN_A) })).status, 200);
        assert.equal((await send('GET', SNAPSHOT, { headers: bearer(TOKEN_B) })).status, 200);
    });

    test('a missing or wrong token is 401 with no detail', async () => {
        const missing = await send('GET', SNAPSHOT);
        const wrong = await send('GET', SNAPSHOT, { headers: bearer('c'.repeat(40)) });
        assert.equal(missing.status, 401);
        assert.equal(wrong.status, 401);
        assert.deepEqual(wrong.json, { success: false, error: 'Unauthorized' });
    });

    test('no token configured: the routes do not exist', async () => {
        const saved = process.env.AFM_PORTAL_SERVICE_TOKEN;
        delete process.env.AFM_PORTAL_SERVICE_TOKEN;
        try {
            const res = await send('GET', SNAPSHOT, { headers: bearer(TOKEN_A) });
            assert.equal(res.status, 404);
            assert.deepEqual(res.json, { success: false, error: 'API endpoint not found' });
        } finally {
            process.env.AFM_PORTAL_SERVICE_TOKEN = saved;
        }
    });

    test('a weak token refuses startup without quoting it', () => {
        const { validateStartup } = require('../../src/config/env');
        const problems = validateStartup({ STORAGE_ROOT: ROOT, AFM_PORTAL_SERVICE_TOKEN: 'short-secret' });
        const msg = problems.find((p) => p.startsWith('AFM_PORTAL_SERVICE_TOKEN'));
        assert.ok(msg, problems.join('\n'));
        assert.ok(!msg.includes('short-secret'));
    });

    test('AFM_PORTAL_URL must be an origin and needs a token', () => {
        const { validateStartup } = require('../../src/config/env');
        const withPath = validateStartup({ STORAGE_ROOT: ROOT, AFM_PORTAL_SERVICE_TOKEN: TOKEN_A, AFM_PORTAL_URL: 'http://127.0.0.1:4000/x' });
        const noToken = validateStartup({ STORAGE_ROOT: ROOT, AFM_PORTAL_URL: 'http://127.0.0.1:4000' });
        const ok = validateStartup({ STORAGE_ROOT: ROOT, AFM_PORTAL_SERVICE_TOKEN: TOKEN_A, AFM_PORTAL_URL: 'https://portal.example.com/' });
        const remotePlain = validateStartup({ STORAGE_ROOT: ROOT, AFM_PORTAL_SERVICE_TOKEN: TOKEN_A, AFM_PORTAL_URL: 'http://portal.example.com' });
        assert.ok(remotePlain.some((p) => p.includes('must use https')), remotePlain.join('\n'));
        assert.ok(withPath.some((p) => p.startsWith('AFM_PORTAL_URL')));
        assert.ok(noToken.some((p) => p.includes('requires AFM_PORTAL_SERVICE_TOKEN')));
        assert.ok(!ok.some((p) => p.includes('AFM_PORTAL')), ok.join('\n'));
    });
});

describe('snapshot document', () => {
    test('contract v1 shape, no password hashes anywhere', async () => {
        const res = await send('GET', SNAPSHOT, { headers: bearer(TOKEN_A) });
        assert.equal(res.status, 200);
        assert.equal(res.headers['cache-control'], 'no-store');
        const doc = res.json;
        assert.equal(doc.contract, 1);
        for (const key of ['volumeId', 'publishedRoot', 'releaseClientPath', 'auth', 'users', 'policies', 'userGrants', 'groupMembers', 'groupGrants', 'nav']) {
            assert.ok(key in doc, `missing ${key}`);
        }
        const admin = doc.users.find((u) => u.username === 'test-admin');
        assert.ok(admin && /^[0-9a-f]{32}$/.test(admin.credentialStamp));
        assert.ok(!res.text.includes('password_hash'));
        const stored = UserRepository.findByUsername('test-admin').password_hash;
        for (const part of stored.split(':')) assert.ok(!res.text.includes(part), 'a hash part leaked');
    });

    test('unchanged data answers 304 to its ETag; a change gives a new ETag', async () => {
        const first = await send('GET', SNAPSHOT, { headers: bearer(TOKEN_A) });
        const etag = first.headers.etag;
        assert.ok(etag);
        const again = await send('GET', SNAPSHOT, { headers: { ...bearer(TOKEN_A), 'If-None-Match': etag } });
        assert.equal(again.status, 304);
        assert.equal(again.text, '');

        FileAccessPolicyService.setPolicy('/governed.txt', { isDirectory: false, accessMode: 'restricted', isPublished: true });
        const changed = await send('GET', SNAPSHOT, { headers: { ...bearer(TOKEN_A), 'If-None-Match': etag } });
        assert.equal(changed.status, 200);
        assert.notEqual(changed.headers.etag, etag);
        const policy = changed.json.policies.find((p) => p.clientPath === '/governed.txt');
        assert.deepEqual(
            { accessMode: policy.accessMode, isPublished: policy.isPublished, isDirectory: policy.isDirectory, defaultLevel: policy.defaultLevel },
            { accessMode: 'restricted', isPublished: true, isDirectory: false, defaultLevel: 'download' }
        );
    });

    test('grants reference the policy by fileId', async () => {
        const id = UserRepository.create({ username: 'grantee', passwordHash: hashPassword('grantee-password-1') }).id;
        FileAccessPolicyService.grantPermission('/governed.txt', id, 'grant', null, 'view');
        const doc = (await send('GET', SNAPSHOT, { headers: bearer(TOKEN_A) })).json;
        const policy = doc.policies.find((p) => p.clientPath === '/governed.txt');
        assert.deepEqual(doc.userGrants.find((g) => g.userId === id), { fileId: policy.fileId, userId: id, permission: 'grant', level: 'view' });
    });

    test('a password change changes that user\'s credentialStamp only', async () => {
        const before = (await send('GET', SNAPSHOT, { headers: bearer(TOKEN_A) })).json.users;
        const user = UserRepository.findByUsername('grantee');
        UserRepository.setPasswordHash(user.id, hashPassword('a-new-password-2'));
        const after = (await send('GET', SNAPSHOT, { headers: bearer(TOKEN_A) })).json.users;
        const stamp = (list, name) => list.find((u) => u.username === name).credentialStamp;
        assert.notEqual(stamp(after, 'grantee'), stamp(before, 'grantee'));
        assert.equal(stamp(after, 'test-admin'), stamp(before, 'test-admin'));
    });
});

describe('credentials/verify', () => {
    test('right credentials: userId and the snapshot\'s credentialStamp', async () => {
        const res = await verify('grantee', 'a-new-password-2');
        assert.equal(res.status, 200);
        const doc = (await send('GET', SNAPSHOT, { headers: bearer(TOKEN_A) })).json;
        const user = doc.users.find((u) => u.username === 'grantee');
        assert.deepEqual(res.json, { userId: user.id, credentialStamp: user.credentialStamp });
    });

    test('wrong password, unknown user, disabled and locked users are one uniform 401', async () => {
        const id = UserRepository.create({ username: 'locked', passwordHash: hashPassword('locked-password-1') }).id;
        UserRepository.lockUntil(id, Date.now() + 60000);
        const disabled = UserRepository.create({ username: 'disabled', passwordHash: hashPassword('disabled-password-1') }).id;
        UserRepository.setStatus(disabled, 'disabled');
        const answers = [
            await verify('grantee', 'wrong-password'),
            await verify('nobody', 'whatever-password'),
            await verify('locked', 'locked-password-1'),
            await verify('disabled', 'disabled-password-1'),
        ];
        for (const res of answers) {
            assert.equal(res.status, 401);
            assert.deepEqual(res.json, { success: false, error: 'Invalid credentials' });
        }
    });

    test('a failed portal sign-in does not count against the admin account', async () => {
        const before = UserRepository.findByUsername('grantee').failed_login_count;
        await verify('grantee', 'wrong-password');
        assert.equal(UserRepository.findByUsername('grantee').failed_login_count, before);
    });

    test('a non-string password is a 401, not a 500', async () => {
        const res = await send('POST', VERIFY, { body: JSON.stringify({ username: 'grantee', password: { x: 1 } }), headers: bearer(TOKEN_A) });
        assert.equal(res.status, 401);
    });
});

describe('failed-token throttling (runs last: it blocks this client IP)', () => {
    test('repeated token failures from one IP become 429, even for a right token', async () => {
        const { FAILURES_PER_MINUTE } = require('../../src/middlewares/serviceToken');
        for (let i = 0; i < FAILURES_PER_MINUTE; i++) await send('GET', SNAPSHOT, { headers: bearer('wrong-' + 'x'.repeat(40)) });
        const res = await send('GET', SNAPSHOT, { headers: bearer(TOKEN_A) });
        assert.equal(res.status, 429);
        assert.ok(res.headers['retry-after']);
    });
});
