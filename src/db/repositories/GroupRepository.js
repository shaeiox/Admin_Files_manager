// src/db/repositories/GroupRepository.js
'use strict';

const AdminDatabase = require('../connection');

/**
 * Named operations over `user_groups`, `user_group_members` and
 * `group_file_permissions` (migration 4). A group is only a set of users that
 * one grant can cover; it carries no capability of its own.
 */
class GroupRepository {
    list() {
        const db = AdminDatabase.get();
        const groups = db.prepare('SELECT * FROM user_groups ORDER BY name COLLATE NOCASE ASC').all();
        const members = db.prepare(
            `SELECT m.group_id, u.id, u.username FROM user_group_members m
             JOIN users u ON u.id = m.user_id ORDER BY u.username COLLATE NOCASE ASC`
        ).all();
        return groups.map((g) => ({
            ...g,
            members: members.filter((m) => m.group_id === g.id).map(({ id, username }) => ({ id, username })),
        }));
    }

    findById(id) {
        return AdminDatabase.get().prepare('SELECT * FROM user_groups WHERE id = ?').get(id) || null;
    }

    findByName(name) {
        return AdminDatabase.get().prepare('SELECT * FROM user_groups WHERE name = ?').get(name) || null;
    }

    create(name, description) {
        const now = Date.now();
        const result = AdminDatabase.get().prepare(
            'INSERT INTO user_groups (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)'
        ).run(name, description, now, now);
        return this.findById(Number(result.lastInsertRowid));
    }

    update(id, name, description) {
        AdminDatabase.get().prepare('UPDATE user_groups SET name = ?, description = ?, updated_at = ? WHERE id = ?')
            .run(name, description, Date.now(), id);
        return this.findById(id);
    }

    remove(id) {
        AdminDatabase.get().prepare('DELETE FROM user_groups WHERE id = ?').run(id);
    }

    /** Full replace of a group's members in one transaction. */
    setMembers(groupId, userIds) {
        const db = AdminDatabase.get();
        const now = Date.now();
        db.exec('BEGIN');
        try {
            db.prepare('DELETE FROM user_group_members WHERE group_id = ?').run(groupId);
            const insert = db.prepare('INSERT INTO user_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)');
            for (const userId of userIds) insert.run(groupId, userId, now);
            db.exec('COMMIT');
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }

    upsertPermission(fileId, groupId, permission, level, grantedBy = null) {
        const db = AdminDatabase.get();
        db.prepare(
            `INSERT INTO group_file_permissions (file_id, group_id, permission, level, granted_by, created_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT (file_id, group_id) DO UPDATE SET permission = excluded.permission,
                 level = excluded.level, granted_by = excluded.granted_by`
        ).run(fileId, groupId, permission, level, grantedBy, Date.now());
        return db.prepare('SELECT * FROM group_file_permissions WHERE file_id = ? AND group_id = ?').get(fileId, groupId);
    }

    revokePermission(fileId, groupId) {
        AdminDatabase.get().prepare('DELETE FROM group_file_permissions WHERE file_id = ? AND group_id = ?').run(fileId, groupId);
    }

    listPermissionsForFile(fileId) {
        return AdminDatabase.get().prepare(
            `SELECT p.*, g.name AS group_name FROM group_file_permissions p
             JOIN user_groups g ON g.id = p.group_id WHERE p.file_id = ? ORDER BY g.name COLLATE NOCASE ASC`
        ).all(fileId);
    }

    /** Every group grant that reaches a user through membership. */
    listPermissionsForUser(userId) {
        return AdminDatabase.get().prepare(
            `SELECT p.file_id, p.permission, p.level FROM group_file_permissions p
             JOIN user_group_members m ON m.group_id = p.group_id WHERE m.user_id = ?`
        ).all(userId);
    }
}

module.exports = new GroupRepository();
