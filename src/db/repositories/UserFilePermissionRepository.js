// src/db/repositories/UserFilePermissionRepository.js
'use strict';

const AdminDatabase = require('../connection');

/**
 * Named operations over `user_file_permissions` (ADR-009 phase 2). One row
 * per `(file_id, user_id)` pair - grant/deny plus an access `level`, never a
 * second row for the same pair (authorization/file-access-policy spec).
 */
class UserFilePermissionRepository {
    upsert(fileId, userId, permission, grantedBy = null, level = 'download') {
        const db = AdminDatabase.get();
        const now = Date.now();
        const existing = db.prepare('SELECT id FROM user_file_permissions WHERE file_id = ? AND user_id = ?').get(fileId, userId);
        if (existing) {
            db.prepare('UPDATE user_file_permissions SET permission = ?, level = ?, granted_by = ? WHERE id = ?')
                .run(permission, level, grantedBy, existing.id);
        } else {
            db.prepare(
                'INSERT INTO user_file_permissions (file_id, user_id, permission, level, granted_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
            ).run(fileId, userId, permission, level, grantedBy, now);
        }
        return db.prepare('SELECT * FROM user_file_permissions WHERE file_id = ? AND user_id = ?').get(fileId, userId);
    }

    revoke(fileId, userId) {
        AdminDatabase.get().prepare('DELETE FROM user_file_permissions WHERE file_id = ? AND user_id = ?').run(fileId, userId);
    }

    listForFile(fileId) {
        return AdminDatabase.get().prepare('SELECT * FROM user_file_permissions WHERE file_id = ?').all(fileId);
    }

    listForUser(userId) {
        return AdminDatabase.get().prepare('SELECT file_id, permission, level FROM user_file_permissions WHERE user_id = ?').all(userId);
    }
}

module.exports = new UserFilePermissionRepository();
