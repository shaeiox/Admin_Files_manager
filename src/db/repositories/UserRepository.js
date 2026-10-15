// src/db/repositories/UserRepository.js
'use strict';

const AdminDatabase = require('../connection');

/**
 * Named operations over the `users` table (ADR-009). No SQL and no
 * node:sqlite type crosses this boundary.
 */
class UserRepository {
    create({ username, email, passwordHash, role = 'user' }) {
        const now = Date.now();
        const result = AdminDatabase.get().prepare(
            `INSERT INTO users (username, email, password_hash, role, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`
        ).run(username, email || null, passwordHash, role, now, now);
        return this.findById(result.lastInsertRowid);
    }

    findById(id) {
        return AdminDatabase.get().prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
    }

    findByUsername(username) {
        return AdminDatabase.get().prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) || null;
    }

    list() {
        return AdminDatabase.get().prepare('SELECT * FROM users ORDER BY created_at ASC').all();
    }

    setStatus(id, status) {
        AdminDatabase.get().prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(status, Date.now(), id);
        return this.findById(id);
    }

    setPasswordHash(id, passwordHash) {
        AdminDatabase.get().prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, Date.now(), id);
        return this.findById(id);
    }

    recordLoginFailure(id) {
        AdminDatabase.get().prepare(
            'UPDATE users SET failed_login_count = failed_login_count + 1, updated_at = ? WHERE id = ?'
        ).run(Date.now(), id);
    }

    resetLoginFailures(id) {
        AdminDatabase.get().prepare(
            'UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?'
        ).run(Date.now(), id);
    }

    lockUntil(id, until) {
        AdminDatabase.get().prepare('UPDATE users SET locked_until = ?, updated_at = ? WHERE id = ?').run(until, Date.now(), id);
    }

    /**
     * The author columns below reference users(id) with no ON DELETE action, so
     * a plain DELETE of anyone who ever acted failed the foreign key (500). They
     * are cleared first - what ON DELETE SET NULL would do, without a
     * table-rebuild migration.
     */
    delete(id) {
        const db = AdminDatabase.get();
        db.exec('BEGIN');
        try {
            db.prepare('UPDATE audit_logs SET actor_id = NULL WHERE actor_id = ?').run(id);
            db.prepare('UPDATE file_access_policies SET created_by = NULL WHERE created_by = ?').run(id);
            db.prepare('UPDATE file_access_policies SET updated_by = NULL WHERE updated_by = ?').run(id);
            db.prepare('UPDATE user_file_permissions SET granted_by = NULL WHERE granted_by = ?').run(id);
            db.prepare('UPDATE group_file_permissions SET granted_by = NULL WHERE granted_by = ?').run(id);
            db.prepare('DELETE FROM users WHERE id = ?').run(id);
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }

    count() {
        return AdminDatabase.get().prepare('SELECT COUNT(*) AS n FROM users').get().n;
    }
}

module.exports = new UserRepository();
