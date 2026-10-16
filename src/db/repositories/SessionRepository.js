// src/db/repositories/SessionRepository.js
'use strict';

const AdminDatabase = require('../connection');

/**
 * Named operations over `sessions` and `session_tokens` (ADR-009,
 * access-refresh-session-tokens). A session is the token family: revoking it
 * revokes every token row with its session_id in one UPDATE.
 */
class SessionRepository {
    /**
     * `tokenHash` fills the legacy NOT NULL UNIQUE `sessions.token_hash`
     * column; the caller passes the hash of a discarded random value, so no
     * credential resolves through it (a rolled-back release fails closed).
     */
    create({ tokenHash, userId, csrfSecret, absoluteExpiresAt, dpopThumbprint, ip, userAgent }) {
        const now = Date.now();
        const result = AdminDatabase.get().prepare(
            `INSERT INTO sessions (token_hash, user_id, csrf_secret, created_at, last_seen_at, expires_at,
                                   absolute_expires_at, dpop_thumbprint, ip, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(tokenHash, userId, csrfSecret, now, now, absoluteExpiresAt, absoluteExpiresAt,
            dpopThumbprint || null, ip || null, userAgent || null);
        return this.findById(result.lastInsertRowid);
    }

    findById(id) {
        return AdminDatabase.get().prepare('SELECT * FROM sessions WHERE id = ?').get(id) || null;
    }

    createToken({ sessionId, tokenKind, tokenHash, parentId = null, expiresAt }) {
        const result = AdminDatabase.get().prepare(
            `INSERT INTO session_tokens (session_id, kind, token_hash, parent_id, issued_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run(sessionId, tokenKind, tokenHash, parentId, Date.now(), expiresAt);
        return Number(result.lastInsertRowid);
    }

    /**
     * A token row joined to its session. Session columns keep their own names
     * (`id` is the session id, so the row can stand in for a session); token
     * columns are prefixed `token_`. Judging validity is the caller's job.
     */
    findByTokenHash(tokenHash) {
        return AdminDatabase.get().prepare(
            `SELECT t.id AS token_id, t.kind AS token_kind, t.parent_id AS token_parent_id,
                    t.expires_at AS token_expires_at, t.used_at AS token_used_at,
                    t.revoked_at AS token_revoked_at, s.*
             FROM session_tokens t JOIN sessions s ON s.id = t.session_id
             WHERE t.token_hash = ?`
        ).get(tokenHash) || null;
    }

    /** Stamps first use only, so the grace window stays anchored to the first rotation. */
    markUsed(tokenId, now = Date.now()) {
        AdminDatabase.get().prepare('UPDATE session_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now, tokenId);
    }

    /** Runs `fn` in one transaction (rotation: mark used + insert successors). */
    transaction(fn) {
        const db = AdminDatabase.get();
        db.exec('BEGIN');
        try {
            const result = fn();
            db.exec('COMMIT');
            return result;
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }

    touch(id) {
        AdminDatabase.get().prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(Date.now(), id);
    }

    /** Revokes the session and its whole token family. */
    revokeSession(sessionId, reason) {
        const now = Date.now();
        this.transaction(() => {
            const db = AdminDatabase.get();
            db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, sessionId);
            db.prepare('UPDATE session_tokens SET revoked_at = ?, revoke_reason = ? WHERE session_id = ? AND revoked_at IS NULL')
                .run(now, reason, sessionId);
        });
    }

    /** Revokes every session of a user and every token in those families. */
    revokeAllForUser(userId, reason) {
        const now = Date.now();
        this.transaction(() => {
            const db = AdminDatabase.get();
            db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now, userId);
            db.prepare(
                `UPDATE session_tokens SET revoked_at = ?, revoke_reason = ?
                 WHERE revoked_at IS NULL AND session_id IN (SELECT id FROM sessions WHERE user_id = ?)`
            ).run(now, reason, userId);
        });
    }
}

module.exports = new SessionRepository();
