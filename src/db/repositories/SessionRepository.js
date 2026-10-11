// src/db/repositories/SessionRepository.js
'use strict';

const AdminDatabase = require('../connection');

/** Named operations over the `sessions` table (ADR-009). */
class SessionRepository {
    create({ tokenHash, userId, csrfSecret, expiresAt, ip, userAgent }) {
        const now = Date.now();
        const result = AdminDatabase.get().prepare(
            `INSERT INTO sessions (token_hash, user_id, csrf_secret, created_at, last_seen_at, expires_at, ip, user_agent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(tokenHash, userId, csrfSecret, now, now, expiresAt, ip || null, userAgent || null);
        return this.findById(result.lastInsertRowid);
    }

    findById(id) {
        return AdminDatabase.get().prepare('SELECT * FROM sessions WHERE id = ?').get(id) || null;
    }

    /** Only a session that is neither expired nor revoked, as of now. */
    findActiveByTokenHash(tokenHash) {
        return AdminDatabase.get().prepare(
            'SELECT * FROM sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?'
        ).get(tokenHash, Date.now()) || null;
    }

    touch(id) {
        AdminDatabase.get().prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(Date.now(), id);
    }

    revoke(id) {
        AdminDatabase.get().prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(Date.now(), id);
    }

    revokeAllForUser(userId) {
        AdminDatabase.get().prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(Date.now(), userId);
    }
}

module.exports = new SessionRepository();
