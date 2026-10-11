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

    delete(id) {
        AdminDatabase.get().prepare('DELETE FROM users WHERE id = ?').run(id);
    }

    count() {
        return AdminDatabase.get().prepare('SELECT COUNT(*) AS n FROM users').get().n;
    }
}

module.exports = new UserRepository();
