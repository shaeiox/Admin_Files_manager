// src/db/repositories/AuditLogRepository.js
'use strict';

const AdminDatabase = require('../connection');

/** Named operations over the `audit_logs` table (ADR-009). Flat, fixed-window retention. */
class AuditLogRepository {
    record({ actorId = null, action, outcome, targetType = null, targetId = null, detail = null, ip = null, userAgent = null }) {
        AdminDatabase.get().prepare(
            `INSERT INTO audit_logs (actor_id, action, outcome, target_type, target_id, detail, ip, user_agent, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(actorId, action, outcome, targetType, targetId, detail, ip, userAgent, Date.now());
    }

    list({ limit = 100 } = {}) {
        return AdminDatabase.get().prepare(
            `SELECT a.*, u.username AS actor_username FROM audit_logs a
             LEFT JOIN users u ON u.id = a.actor_id
             ORDER BY a.created_at DESC, a.id DESC LIMIT ?`
        ).all(limit);
    }

    /** Deletes every row older than `olderThanMs` relative to now. */
    prune(olderThanMs) {
        const cutoff = Date.now() - olderThanMs;
        AdminDatabase.get().prepare('DELETE FROM audit_logs WHERE created_at < ?').run(cutoff);
    }
}

module.exports = new AuditLogRepository();
