// test/services/SessionTokenService.test.js
'use strict';

/**
 * Access/refresh tokens, rotation, reuse detection, DPoP binding and
 * revocation (access-refresh-session-tokens, tasks 2-4). Isolated temp
 * admin database, same pattern as SessionService.test.js.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const AdminDatabase = require('../../src/db/connection');
const UserRepository = require('../../src/db/repositories/UserRepository');
const SessionService = require('../../src/services/SessionService');
const { hashPassword, hashToken, verifyDpopProof, publicJwkThumbprint } = require('../../src/utils/crypto');
const { deviceKey } = require('../helpers/dpop');

const REFRESH_PATH = '/api/v1/auth/refresh';
let tmp;
let n = 0;

const db = () => AdminDatabase.get();

/** A fresh user signed in with a device key. */
function signIn(key = deviceKey()) {
    n += 1;
    const username = `tok-user-${n}`;
    const user = UserRepository.create({ username, passwordHash: hashPassword('a-password-1'), email: null });
    const result = SessionService.login({ username, password: 'a-password-1', dpopJwk: key.jwk });
    assert.equal(result.ok, true);
    return { ...result, key, userId: user.id };
}

function refresh(refreshToken, key, overrides = {}) {
    return SessionService.refresh({ refreshToken, proof: key && key.proof(), method: 'POST', path: REFRESH_PATH, ...overrides });
}

const tokenRow = (raw) => db().prepare('SELECT * FROM session_tokens WHERE token_hash = ?').get(hashToken(raw));

before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-sessiontokens-'));
    AdminDatabase.dbPath = path.join(tmp, 'admin.sqlite');
    AdminDatabase.reset();
});

after(() => {
    AdminDatabase.reset();
    fs.rmSync(tmp, { recursive: true, force: true });
});

describe('verifyDpopProof', () => {
    const key = deviceKey();
    const thumbprint = publicJwkThumbprint(key.jwk);
    const check = (proof, extra = {}) => verifyDpopProof(proof, { method: 'POST', path: REFRESH_PATH, thumbprint, ...extra });

    test('a valid proof verifies', () => assert.equal(check(key.proof()), true));
    test('a tampered signature is refused', () => {
        const p = key.proof();
        const last = p.slice(-2) === 'AA' ? 'BB' : 'AA';
        assert.equal(check(p.slice(0, -2) + last), false);
    });
    test('an htu mismatch is refused', () => assert.equal(check(key.proof({ path: '/api/v1/fs/list' })), false));
    test('an htm mismatch is refused', () => assert.equal(check(key.proof({ method: 'GET' })), false));
    test('a stale iat is refused', () => assert.equal(check(key.proof({ iat: Math.floor(Date.now() / 1000) - 3600 })), false));
    test('a wrong-curve JWK is refused', () => {
        assert.equal(check(key.proof({ header: { jwk: { ...key.jwk, crv: 'P-384' } } })), false);
        assert.equal(publicJwkThumbprint({ ...key.jwk, crv: 'P-384' }), null);
    });
    test('a JWK carrying a private component is refused', () => {
        assert.equal(publicJwkThumbprint({ ...key.jwk, d: 'AAAA' }), null);
    });
    test('another key is refused', () => assert.equal(check(deviceKey().proof()), false));
    test('garbage never throws', () => {
        for (const p of [undefined, null, 42, '', 'a.b', 'a.b.c', '!!.!!.!!']) assert.equal(check(p), false);
    });
});

describe('login issues a token pair', () => {
    test('two token rows, a pinned thumbprint, an unchanged csrf secret', () => {
        const s = signIn();
        const rows = db().prepare('SELECT kind FROM session_tokens WHERE session_id = ? ORDER BY kind').all(s.session.id);
        assert.deepEqual(rows.map((r) => r.kind), ['access', 'refresh']);
        assert.equal(s.session.dpop_thumbprint, publicJwkThumbprint(s.key.jwk));
        assert.equal(s.session.csrf_secret, s.csrfSecret);
        assert.ok(s.session.absolute_expires_at > Date.now() + 364 * 24 * 3600 * 1000);
    });

    test('only hashes are stored', () => {
        const s = signIn();
        const dump = JSON.stringify(db().prepare('SELECT * FROM session_tokens').all());
        assert.ok(!dump.includes(s.accessToken) && !dump.includes(s.refreshToken));
    });

    test('an invalid JWK fails exactly like a bad password', () => {
        UserRepository.create({ username: 'badkey', passwordHash: hashPassword('a-password-1'), email: null });
        for (const dpopJwk of [{ kty: 'RSA' }, { ...deviceKey().jwk, d: 'x' }, 'jwk', 7]) {
            assert.deepEqual(SessionService.login({ username: 'badkey', password: 'a-password-1', dpopJwk }), { ok: false });
        }
    });

    test('a refresh token is not an access credential, and vice versa', () => {
        const s = signIn();
        assert.equal(SessionService.validateSession(s.refreshToken), null);
        assert.deepEqual(refresh(s.accessToken, s.key), { ok: false });
    });
});

describe('refresh rotates', () => {
    test('marks the predecessor used and inserts exactly one successor', () => {
        const s = signIn();
        const r = refresh(s.refreshToken, s.key);
        assert.equal(r.ok, true);
        const parent = tokenRow(s.refreshToken);
        assert.ok(parent.used_at);
        const children = db().prepare("SELECT * FROM session_tokens WHERE parent_id = ? AND kind = 'refresh'").all(parent.id);
        assert.equal(children.length, 1);
        assert.equal(children[0].token_hash, hashToken(r.refreshToken));
        assert.ok(SessionService.validateSession(r.accessToken));
    });

    test('rotation never moves the absolute cap', () => {
        const s = signIn();
        let token = s.refreshToken;
        for (let i = 0; i < 3; i++) token = refresh(token, s.key).refreshToken;
        const capNow = db().prepare('SELECT absolute_expires_at FROM sessions WHERE id = ?').get(s.session.id).absolute_expires_at;
        assert.equal(capNow, s.session.absolute_expires_at);
    });

    test('every failure mode is the same { ok: false }', () => {
        const unknown = refresh('not-a-token', deviceKey());

        const expired = signIn();
        db().prepare('UPDATE session_tokens SET expires_at = 1 WHERE token_hash = ?').run(hashToken(expired.refreshToken));

        const capped = signIn();
        db().prepare('UPDATE sessions SET absolute_expires_at = 1 WHERE id = ?').run(capped.session.id);

        const noProof = signIn();
        const wrongKey = signIn();
        const disabled = signIn();
        UserRepository.setStatus(disabled.userId, 'disabled');

        for (const result of [
            unknown,
            refresh(expired.refreshToken, expired.key),
            refresh(capped.refreshToken, capped.key),
            refresh(noProof.refreshToken, null),
            refresh(wrongKey.refreshToken, deviceKey()),
            refresh(disabled.refreshToken, disabled.key),
        ]) assert.deepEqual(result, { ok: false });
    });

    test('a session signed in without a key can never refresh', () => {
        const s = signIn();
        db().prepare('UPDATE sessions SET dpop_thumbprint = NULL WHERE id = ?').run(s.session.id);
        assert.deepEqual(refresh(s.refreshToken, s.key), { ok: false });
    });
});

describe('grace window and reuse detection', () => {
    test('a retry inside the grace window re-rotates and leaves the family intact', () => {
        const s = signIn();
        const first = refresh(s.refreshToken, s.key);
        const retry = refresh(s.refreshToken, s.key);
        assert.equal(retry.ok, true);
        assert.notEqual(retry.refreshToken, first.refreshToken);
        assert.equal(refresh(retry.refreshToken, s.key).ok, true);
        const revoked = db().prepare('SELECT COUNT(*) AS c FROM session_tokens WHERE session_id = ? AND revoked_at IS NOT NULL').get(s.session.id);
        assert.equal(revoked.c, 0);
    });

    test('reuse beyond the window revokes the whole family and is audited without the token', () => {
        const s = signIn();
        const next = refresh(s.refreshToken, s.key);
        db().prepare('UPDATE session_tokens SET used_at = ? WHERE token_hash = ?').run(Date.now() - 60000, hashToken(s.refreshToken));

        assert.deepEqual(refresh(s.refreshToken, s.key), { ok: false });

        const live = db().prepare("SELECT COUNT(*) AS c FROM session_tokens WHERE session_id = ? AND revoked_at IS NULL").get(s.session.id);
        assert.equal(live.c, 0);
        assert.deepEqual(refresh(next.refreshToken, s.key), { ok: false });
        assert.equal(SessionService.validateSession(next.accessToken), null);
        assert.equal(tokenRow(next.refreshToken).revoke_reason, 'token_reuse');

        const audit = db().prepare("SELECT * FROM audit_logs WHERE action = 'session.token_reuse' AND target_id = ?").get(s.session.id);
        assert.ok(audit);
        assert.equal(audit.detail, 'token_reuse');
        const dump = JSON.stringify(audit);
        assert.ok(!dump.includes(s.refreshToken) && !dump.includes(next.refreshToken));
    });
});

describe('revocation', () => {
    test('logout by refresh token needs no proof and revokes the family', () => {
        const s = signIn();
        assert.equal(SessionService.revokeByRefreshToken(s.refreshToken), true);
        assert.equal(tokenRow(s.refreshToken).revoke_reason, 'logout');
        assert.equal(SessionService.validateSession(s.accessToken), null);
        assert.deepEqual(refresh(s.refreshToken, s.key), { ok: false });
    });

    test('an access token issued moments ago dies with its session', () => {
        const s = signIn();
        assert.ok(SessionService.validateSession(s.accessToken));
        SessionService.revokeSession(s.session.id);
        assert.equal(SessionService.validateSession(s.accessToken), null);
    });

    test('revokeAllForUser cascades to every token of every session', () => {
        const a = signIn();
        const b = SessionService.login({ username: `tok-user-${n}`, password: 'a-password-1', dpopJwk: a.key.jwk });
        SessionService.revokeAllForUser(a.userId);
        const live = db().prepare(
            'SELECT COUNT(*) AS c FROM session_tokens WHERE revoked_at IS NULL AND session_id IN (?, ?)'
        ).get(a.session.id, b.session.id);
        assert.equal(live.c, 0);
        assert.deepEqual(refresh(b.refreshToken, a.key), { ok: false });
    });
});
