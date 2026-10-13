// src/services/FileAccessPolicyService.js
'use strict';

const AppError = require('../utils/AppError');
const { validateClientPath } = require('../utils/validators');
const FileAccessPolicyRepository = require('../db/repositories/FileAccessPolicyRepository');
const UserFilePermissionRepository = require('../db/repositories/UserFilePermissionRepository');
const UserRepository = require('../db/repositories/UserRepository');

const ACCESS_MODES = new Set(['public', 'authenticated', 'restricted']);
const PERMISSIONS = new Set(['grant', 'deny']);

/**
 * Admin file-access-policy management (ADR-009 phase 2,
 * authorization/file-access-policy spec). Per-file, not directory-inherited.
 * This service enforces NO policy against a real download - fs.routes.js's
 * read endpoints are untouched by this change (design D5). It only lets an
 * administrator create, read, and edit the data model.
 */
class FileAccessPolicyService {
    list() {
        return FileAccessPolicyRepository.listPolicies();
    }

    getByPath(clientPath) {
        validateClientPath(clientPath);
        return FileAccessPolicyRepository.findPolicyByPath(clientPath);
    }

    setPolicy(clientPath, { isDirectory, accessMode, isPublished, isLocked, availableFrom, availableUntil, actorId }) {
        validateClientPath(clientPath);
        if (accessMode !== undefined && !ACCESS_MODES.has(accessMode)) {
            throw new AppError('access_mode must be "public", "authenticated", or "restricted".', 400);
        }
        if (availableFrom !== undefined && availableFrom !== null && !Number.isSafeInteger(availableFrom)) {
            throw new AppError('available_from must be an epoch-ms integer or null.', 400);
        }
        if (availableUntil !== undefined && availableUntil !== null && !Number.isSafeInteger(availableUntil)) {
            throw new AppError('available_until must be an epoch-ms integer or null.', 400);
        }
        if (Number.isSafeInteger(availableFrom) && Number.isSafeInteger(availableUntil) && availableFrom > availableUntil) {
            throw new AppError('available_from must not be after available_until.', 400);
        }

        const existing = FileAccessPolicyRepository.findPolicyByPath(clientPath);
        return FileAccessPolicyRepository.upsertPolicy(clientPath, {
            isDirectory: isDirectory ?? existing?.is_directory === 1,
            accessMode: accessMode ?? existing?.access_mode ?? 'restricted',
            isPublished: isPublished ?? (existing ? existing.is_published === 1 : false),
            isLocked: isLocked ?? (existing ? existing.is_locked === 1 : false),
            availableFrom: availableFrom !== undefined ? availableFrom : existing?.available_from ?? null,
            availableUntil: availableUntil !== undefined ? availableUntil : existing?.available_until ?? null,
            actorId,
        });
    }

    deletePolicy(clientPath) {
        validateClientPath(clientPath);
        FileAccessPolicyRepository.deletePolicy(clientPath);
    }

    grantPermission(clientPath, userId, permission, grantedBy) {
        validateClientPath(clientPath);
        if (!PERMISSIONS.has(permission)) throw new AppError('permission must be "grant" or "deny".', 400);
        if (!UserRepository.findById(userId)) throw new AppError('User not found.', 404);

        const file = FileAccessPolicyRepository.findFileByPath(clientPath);
        if (!file) throw new AppError('Set a policy on this file before granting a permission.', 409);

        return UserFilePermissionRepository.upsert(file.id, userId, permission, grantedBy);
    }

    revokePermission(clientPath, userId) {
        validateClientPath(clientPath);
        const file = FileAccessPolicyRepository.findFileByPath(clientPath);
        if (!file) return;
        UserFilePermissionRepository.revoke(file.id, userId);
    }

    listPermissions(clientPath) {
        validateClientPath(clientPath);
        const file = FileAccessPolicyRepository.findFileByPath(clientPath);
        if (!file) return [];
        return UserFilePermissionRepository.listForFile(file.id);
    }

    /**
     * Best-effort hook for FileSystemService.rename/remove (design D2/D3.3):
     * never throws, never makes the filesystem operation depend on it.
     */
    onPathRenamed(oldClientPath, newClientPath) {
        try {
            FileAccessPolicyRepository.renamePath(oldClientPath, newClientPath);
        } catch { /* best-effort; the rename itself already succeeded */ }
    }

    onPathDeleted(clientPath) {
        try {
            FileAccessPolicyRepository.deletePath(clientPath);
        } catch { /* best-effort; the delete itself already succeeded */ }
    }
}

module.exports = new FileAccessPolicyService();
