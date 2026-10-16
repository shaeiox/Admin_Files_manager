// src/services/SessionService.js
'use strict';

const UserRepository = require('../db/repositories/UserRepository');
const SessionRepository = require('../db/repositories/SessionRepository');
const AuditLogRepository = require('../db/repositories/AuditLogRepository');
const config = require('../config/env');
const {
    hashPassword, verifyPassword, randomToken, hashToken, publicJwkThumbprint, verifyDpopProof,
} = require('../utils/crypto');

/** Verified against when the username is unknown, so both paths cost one scrypt. */
const DUMMY_HASH = hashPassword(randomToken());

/** After this many consecutive failures, the account is locked for LOCKOUT_MS. */
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

const FAILED = Object.freeze({ ok: false });

/**
 * Session issuance/validation/rotation/revocation (ADR-009,
 * access-refresh-session-tokens). A session grants two opaque, high-entropy
 * tokens - a short-lived access token and a long-lived refresh token - and
 * only their hashes are persisted (session_tokens). The session row carries
 * the hard absolute cap and the DPoP key thumbprint pinned at login.
 *
 * Every failure is the same `{ ok: false }`, revealing nothing more; the
 * controller turns it into one identical response.
 */
class SessionService {
    /**
     * `dpopJwk` is the client's public P-256 key. A present-but-invalid key
     * fails like a bad password. An absent one still signs in (bearer/script
     * clients), but that session has no pinned key and so can never refresh.
     */
    login({ username, password, ip, userAgent, dpopJwk }) {
        const user = UserRepository.findByUsername(String(username || '').trim());
        // The password is hashed for EVERY attempt: answering an unknown username
        // without the scrypt cost let response time tell which accounts exist.
        const passwordOk = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
        if (!user || user.status !== 'active') return FAILED;
        if (user.locked_until && user.locked_until > Date.now()) return FAILED;

        if (!passwordOk) {
            // An expired lock starts a fresh count; otherwise one failure after
            // the lock re-locked at once (one request per period kept it locked).
            if (user.locked_until) UserRepository.resetLoginFailures(user.id);
            const failedCount = (user.locked_until ? 0 : user.failed_login_count) + 1;
            UserRepository.recordLoginFailure(user.id);
            if (failedCount >= MAX_FAILED_LOGINS) {
                UserRepository.lockUntil(user.id, Date.now() + LOCKOUT_MS);
            }
            return FAILED;
        }

        const keyPresented = dpopJwk !== undefined && dpopJwk !== null;
        const thumbprint = keyPresented ? publicJwkThumbprint(dpopJwk) : null;
        if (keyPresented && !thumbprint) return FAILED;

        UserRepository.resetLoginFailures(user.id);

        const csrfSecret = randomToken(16);
        const { session, accessToken, refreshToken } = SessionRepository.transaction(() => {
            const created = SessionRepository.create({
                tokenHash: hashToken(randomToken()), // legacy column; the raw value is discarded
                userId: user.id,
                csrfSecret,
                absoluteExpiresAt: Date.now() + config.sessionTokens.absoluteTtlSeconds * 1000,
                dpopThumbprint: thumbprint,
                ip,
                userAgent,
            });
            return { session: created, ...this._issue(created, null) };
        });
        return { ok: true, accessToken, refreshToken, csrfSecret, session, user };
    }

    /** Inserts an access + refresh token pair, neither outliving the session's absolute cap. */
    _issue(session, parentId) {
        const now = Date.now();
        const cap = session.absolute_expires_at;
        const accessToken = randomToken();
        const refreshToken = randomToken();
        SessionRepository.createToken({
            sessionId: session.id, tokenKind: 'access', tokenHash: hashToken(accessToken),
            expiresAt: Math.min(now + config.sessionTokens.accessTtlSeconds * 1000, cap),
        });
        SessionRepository.createToken({
            sessionId: session.id, tokenKind: 'refresh', tokenHash: hashToken(refreshToken), parentId,
            expiresAt: Math.min(now + config.sessionTokens.refreshTtlSeconds * 1000, cap),
        });
        return { accessToken, refreshToken };
    }

    /** True when the token row and its session are both live as of `now`. */
    _live(row, now) {
        return row.token_revoked_at === null && row.token_expires_at > now
            && row.revoked_at === null && row.absolute_expires_at > now;
    }

    /**
     * Resolves a raw ACCESS token (from either transport) to its session +
     * user, or null. A refresh token is refused by kind. The session join
     * means a revoked session kills a just-issued access token at once.
     */
    validateSession(token) {
        if (!token || typeof token !== 'string') return null;
        const row = SessionRepository.findByTokenHash(hashToken(token));
        if (!row || row.token_kind !== 'access' || !this._live(row, Date.now())) return null;
        const user = UserRepository.findById(row.user_id);
        if (!user || user.status !== 'active') return null;
        SessionRepository.touch(row.id);
        return { session: row, user };
    }

    /**
     * Rotates a refresh token (design D3/D4/D5). A token already used more
     * than the grace window ago is theft: the whole family is revoked and
     * audited, before the proof is even looked at - a leaked old token is
     * enough evidence. Inside the window it re-rotates. Otherwise the proof
     * must verify against the key pinned on the session.
     */
    refresh({ refreshToken, proof, method, path }) {
        if (!refreshToken || typeof refreshToken !== 'string') return FAILED;
        const now = Date.now();
        const row = SessionRepository.findByTokenHash(hashToken(refreshToken));
        if (!row || row.token_kind !== 'refresh' || !this._live(row, now)) return FAILED;

        if (row.token_used_at !== null && now - row.token_used_at > config.sessionTokens.refreshGraceSeconds * 1000) {
            SessionRepository.revokeSession(row.id, 'token_reuse');
            AuditLogRepository.record({
                actorId: row.user_id, action: 'session.token_reuse', outcome: 'failure',
                targetType: 'session', targetId: row.id, detail: 'token_reuse',
            });
            return FAILED;
        }

        if (!verifyDpopProof(proof, { method, path, thumbprint: row.dpop_thumbprint, now })) return FAILED;

        const user = UserRepository.findById(row.user_id);
        if (!user || user.status !== 'active') return FAILED;

        const tokens = SessionRepository.transaction(() => {
            SessionRepository.markUsed(row.token_id, now);
            return this._issue(row, row.token_id);
        });
        return { ok: true, ...tokens, csrfSecret: row.csrf_secret, session: row, user };
    }

    revokeSession(sessionId, reason = 'logout') {
        SessionRepository.revokeSession(sessionId, reason);
    }

    /** Logout with only the refresh cookie: revocation never needs a proof (design D7). */
    revokeByRefreshToken(refreshToken) {
        if (!refreshToken || typeof refreshToken !== 'string') return false;
        const row = SessionRepository.findByTokenHash(hashToken(refreshToken));
        if (!row || row.token_kind !== 'refresh') return false;
        SessionRepository.revokeSession(row.id, 'logout');
        return true;
    }

    revokeAllForUser(userId, reason = 'admin') {
        SessionRepository.revokeAllForUser(userId, reason);
    }
}

module.exports = new SessionService();
