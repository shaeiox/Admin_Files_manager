// src/db/repositories/FileAccessPolicyRepository.js
'use strict';

const AdminDatabase = require('../connection');

/**
 * Named operations over `files` + `file_access_policies` (ADR-009 phase 2,
 * authorization/file-access-policy spec). `files` is sparse: a row exists
 * only for a path an administrator has set a policy on.
 */
class FileAccessPolicyRepository {
    /** Finds (never creates) a `files` row by client path. */
    findFileByPath(clientPath) {
        return AdminDatabase.get().prepare('SELECT * FROM files WHERE client_path = ?').get(clientPath) || null;
    }

    /** Finds a file's policy, joined, or null if the path has no row at all. */
    findPolicyByPath(clientPath) {
        return AdminDatabase.get().prepare(
            `SELECT f.id AS file_id, f.client_path, f.is_directory,
                    p.id AS policy_id, p.access_mode, p.is_published, p.is_locked,
                    p.available_from, p.available_until, p.default_level, p.created_by, p.updated_by,
                    p.created_at, p.updated_at
             FROM files f
             JOIN file_access_policies p ON p.file_id = f.id
             WHERE f.client_path = ?`
        ).get(clientPath) || null;
    }

    listPolicies() {
        return AdminDatabase.get().prepare(
            `SELECT f.id AS file_id, f.client_path, f.is_directory,
                    p.id AS policy_id, p.access_mode, p.is_published, p.is_locked,
                    p.available_from, p.available_until, p.default_level, p.created_by, p.updated_by,
                    p.created_at, p.updated_at
             FROM files f
             JOIN file_access_policies p ON p.file_id = f.id
             ORDER BY f.client_path ASC`
        ).all();
    }

    /**
     * Creates the `files` row (if absent) and its policy in one step, or
     * updates the existing policy in place - never a second row for the
     * same path (design D2).
     */
    upsertPolicy(clientPath, { isDirectory = false, accessMode = 'restricted', isPublished = false, isLocked = false, availableFrom = null, availableUntil = null, defaultLevel = 'download', actorId = null }) {
        const db = AdminDatabase.get();
        const now = Date.now();

        db.exec('BEGIN');
        try {
            let file = this.findFileByPath(clientPath);
            if (!file) {
                const result = db.prepare(
                    'INSERT INTO files (client_path, is_directory, created_at, updated_at) VALUES (?, ?, ?, ?)'
                ).run(clientPath, isDirectory ? 1 : 0, now, now);
                file = { id: result.lastInsertRowid };
            }

            const existing = db.prepare('SELECT id FROM file_access_policies WHERE file_id = ?').get(file.id);
            if (existing) {
                db.prepare(
                    `UPDATE file_access_policies
                     SET access_mode = ?, is_published = ?, is_locked = ?, available_from = ?, available_until = ?,
                         default_level = ?, updated_by = ?, updated_at = ?
                     WHERE file_id = ?`
                ).run(accessMode, isPublished ? 1 : 0, isLocked ? 1 : 0, availableFrom, availableUntil, defaultLevel, actorId, now, file.id);
            } else {
                db.prepare(
                    `INSERT INTO file_access_policies
                        (file_id, access_mode, is_published, is_locked, available_from, available_until, default_level, created_by, updated_by, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).run(file.id, accessMode, isPublished ? 1 : 0, isLocked ? 1 : 0, availableFrom, availableUntil, defaultLevel, actorId, actorId, now, now);
            }
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }

        return this.findPolicyByPath(clientPath);
    }

    /**
     * Best-effort rename of a governed path (design D2) - never throws on a missing row.
     * Rows BELOW a renamed folder move with it: re-keying only the exact path would
     * strand their policies on a path that no longer exists, unprotecting the files.
     */
    renamePath(oldClientPath, newClientPath) {
        const prefix = `${oldClientPath}/`;
        AdminDatabase.get().prepare(
            `UPDATE files SET client_path = ? || substr(client_path, ?), updated_at = ?
             WHERE client_path = ? OR substr(client_path, 1, ?) = ?`
        ).run(newClientPath, oldClientPath.length + 1, Date.now(), oldClientPath, prefix.length, prefix);
    }

    /** Best-effort removal of a governed path and everything below it, policies/permissions included (cascade). */
    deletePath(clientPath) {
        const prefix = `${clientPath}/`;
        AdminDatabase.get().prepare('DELETE FROM files WHERE client_path = ? OR substr(client_path, 1, ?) = ?')
            .run(clientPath, prefix.length, prefix);
    }

    deletePolicy(clientPath) {
        const file = this.findFileByPath(clientPath);
        if (!file) return;
        AdminDatabase.get().prepare('DELETE FROM file_access_policies WHERE file_id = ?').run(file.id);
    }
}

module.exports = new FileAccessPolicyRepository();
