// src/services/SessionService.js
'use strict';

const UserRepository = require('../db/repositories/UserRepository');
const SessionRepository = require('../db/repositories/SessionRepository');
const { verifyPassword, randomToken, hashToken } = require('../utils/crypto');

/** Flat session expiry (design D3) - no tiered absolute/sliding/step-up policy. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** After this many consecutive failures, the account is locked for LOCKOUT_MS. */
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Session issuance/validation/revocation (ADR-009 design D3). An opaque,
 * high-entropy token; only its hash is persisted (identity/authentication
 * spec). The caller (auth.controller.js) is responsible for returning the
 * identical response whether login failed for a nonexistent username or a
 * wrong password - this service's `login()` already returns the same
 * `{ ok: false }` shape for every failure case, revealing nothing more.
 */
class SessionService {
    login({ username, password, ip, userAgent }) {
        const user = UserRepository.findByUsername(String(username || '').trim());
        if (!user || user.status !== 'active') return { ok: false };
        if (user.locked_until && user.locked_until > Date.now()) return { ok: false };

        if (!verifyPassword(password, user.password_hash)) {
            const failedCount = user.failed_login_count + 1;
            UserRepository.recordLoginFailure(user.id);
            if (failedCount >= MAX_FAILED_LOGINS) {
                UserRepository.lockUntil(user.id, Date.now() + LOCKOUT_MS);
            }
            return { ok: false };
        }

        UserRepository.resetLoginFailures(user.id);

        const token = randomToken();
        const csrfSecret = randomToken(16);
        const session = SessionRepository.create({
            tokenHash: hashToken(token),
            userId: user.id,
            csrfSecret,
            expiresAt: Date.now() + SESSION_TTL_MS,
            ip,
            userAgent,
        });
        return { ok: true, token, csrfSecret, session, user };
    }

    /** Resolves a raw token (from either transport) to its session + user, or null. */
    validateSession(token) {
        if (!token) return null;
        const session = SessionRepository.findActiveByTokenHash(hashToken(token));
        if (!session) return null;
        const user = UserRepository.findById(session.user_id);
        if (!user || user.status !== 'active') return null;
        SessionRepository.touch(session.id);
        return { session, user };
    }

    revokeSession(sessionId) {
        SessionRepository.revoke(sessionId);
    }

    revokeAllForUser(userId) {
        SessionRepository.revokeAllForUser(userId);
    }
}

module.exports = new SessionService();
