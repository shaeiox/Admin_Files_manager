// test/services/SessionService.test.js
'use strict';

/**
 * SessionService unit tests (ADR-009 design D3). Redirects the
 * AdminDatabase singleton at an isolated temp file, same isolation pattern
 * as UserService.test.js.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AdminDatabase = require('../../src/db/connection');
const UserRepository = require('../../src/db/repositories/UserRepository');
const SessionService = require('../../src/services/SessionService');
const { hashPassword } = require('../../src/utils/crypto');

let tmp;

function createUser(username, password, extra = {}) {
    return UserRepository.create({ username, passwordHash: hashPassword(password), email: null, ...extra });
}

before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-sessionservice-'));
    AdminDatabase.dbPath = path.join(tmp, 'admin.sqlite');
    AdminDatabase.reset();
});

after(() => {
    AdminDatabase.reset();
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe('SessionService.login', () => {
    test('succeeds with the correct password and issues a session', () => {
        createUser('kate', 'kate-password-1');
        const result = SessionService.login({ username: 'kate', password: 'kate-password-1' });
        assert.equal(result.ok, true);
        assert.equal(typeof result.accessToken, 'string');
        assert.ok(result.accessToken.length >= 32);
        assert.equal(typeof result.csrfSecret, 'string');
    });

    test('a wrong password and a nonexistent username fail identically', () => {
        createUser('liam', 'liam-password-1');
        const wrongPassword = SessionService.login({ username: 'liam', password: 'not-it' });
        const noSuchUser = SessionService.login({ username: 'nobody-by-this-name', password: 'whatever' });
        assert.deepEqual(wrongPassword, { ok: false });
        assert.deepEqual(noSuchUser, { ok: false });
    });

    test('an unknown username costs the same password hash as a known one (no timing oracle)', () => {
        // Regression: an unknown name returned before scrypt ran, so response
        // time told an attacker which usernames exist.
        createUser('ned', 'ned-password-1');
        const nodeCrypto = require('node:crypto');
        const real = nodeCrypto.scryptSync;
        const count = (username) => {
            let calls = 0;
            nodeCrypto.scryptSync = (...args) => { calls += 1; return real(...args); };
            try { SessionService.login({ username, password: 'wrong-password' }); } finally { nodeCrypto.scryptSync = real; }
            return calls;
        };
        assert.equal(count('nobody-at-all'), count('ned'));
        assert.equal(count('nobody-at-all'), 1);
    });

    test('a disabled account cannot log in even with the correct password', () => {
        const user = createUser('mona', 'mona-password-1');
        UserRepository.setStatus(user.id, 'disabled');
        const result = SessionService.login({ username: 'mona', password: 'mona-password-1' });
        assert.deepEqual(result, { ok: false });
    });

    test('locks the account after repeated failures, even with the correct password', () => {
        createUser('noah', 'noah-password-1');
        for (let i = 0; i < 10; i++) {
            SessionService.login({ username: 'noah', password: 'wrong' });
        }
        const result = SessionService.login({ username: 'noah', password: 'noah-password-1' });
        assert.deepEqual(result, { ok: false });
    });

    test('an expired lock starts a fresh count: one failure does not re-lock', () => {
        // Regression: failed_login_count survived the lock, so after it expired a
        // single wrong guess re-locked for 15 minutes - an attacker could keep
        // the account locked with one request per lock period.
        const user = createUser('opal', 'opal-password-1');
        for (let i = 0; i < 10; i++) SessionService.login({ username: 'opal', password: 'wrong' });
        UserRepository.lockUntil(user.id, Date.now() - 1); // the lock has expired

        SessionService.login({ username: 'opal', password: 'wrong' });

        assert.equal(SessionService.login({ username: 'opal', password: 'opal-password-1' }).ok, true);
    });
});

describe('SessionService.validateSession / revokeSession', () => {
    test('a freshly issued session validates and resolves the user', () => {
        createUser('olga', 'olga-password-1');
        const { accessToken: token } = SessionService.login({ username: 'olga', password: 'olga-password-1' });
        const resolved = SessionService.validateSession(token);
        assert.ok(resolved);
        assert.equal(resolved.user.username, 'olga');
    });

    test('an unknown token does not validate', () => {
        assert.equal(SessionService.validateSession('not-a-real-token'), null);
    });

    test('revokeSession invalidates the session immediately', () => {
        createUser('pete', 'pete-password-1');
        const { accessToken: token, session } = SessionService.login({ username: 'pete', password: 'pete-password-1' });
        SessionService.revokeSession(session.id);
        assert.equal(SessionService.validateSession(token), null);
    });

    test('disabling the user invalidates their existing session', () => {
        const user = createUser('quinn', 'quinn-password-1');
        const { accessToken: token } = SessionService.login({ username: 'quinn', password: 'quinn-password-1' });
        UserRepository.setStatus(user.id, 'disabled');
        assert.equal(SessionService.validateSession(token), null);
    });
});
