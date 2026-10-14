// src/services/FileAccessPolicyService.js
'use strict';

const AppError = require('../utils/AppError');
const { validateClientPath } = require('../utils/validators');
const FileAccessPolicyRepository = require('../db/repositories/FileAccessPolicyRepository');
const UserFilePermissionRepository = require('../db/repositories/UserFilePermissionRepository');
const UserRepository = require('../db/repositories/UserRepository');
const GroupRepository = require('../db/repositories/GroupRepository');

const ACCESS_MODES = new Set(['public', 'authenticated', 'restricted']);
const PERMISSIONS = new Set(['grant', 'deny']);

/**
 * Portal access levels, ordered: download includes view.
 * view     - listed in browse, search, categories, releases and the navbar
 * download - also downloaded, hashed, zipped, served as "latest"
 */
const LEVELS = ['view', 'download'];
/** 'view' -> 1, 'download' -> 2; anything else 0. */
const rank = (level) => LEVELS.indexOf(level) + 1;
const DENY = -1;

function assertLevel(level, field) {
    if (!LEVELS.includes(level)) throw new AppError(`${field} must be one of: ${LEVELS.join(', ')}.`, 400);
}

/**
 * The portal's comparison form (files-server-web lib/admin-db.js
 * normalizeClientPath): slashes collapsed, no trailing slash, case-folded on
 * Windows. Kept identical so "Check access" answers what the portal decides.
 */
function portalKey(clientPath) {
    let p = String(clientPath || '').replace(/\\/g, '/').replace(/\/+/g, '/');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return process.platform === 'win32' ? p.toLowerCase() : p;
}

/** `/a/b` -> ['/', '/a', '/a/b'] (portal access-policy governingPaths). */
function governingPaths(clientPath) {
    const parts = String(clientPath).replace(/\\/g, '/').split('/').filter(Boolean);
    const out = ['/'];
    for (let i = 1; i <= parts.length; i++) out.push('/' + parts.slice(0, i).join('/'));
    return out;
}

/** Folds grant rows into fileId -> DENY or the highest granted rank. */
function foldGrants(rows) {
    const out = new Map();
    for (const row of rows) {
        const prev = out.get(row.file_id);
        if (prev === DENY) continue;
        out.set(row.file_id, row.permission === 'deny' ? DENY : Math.max(prev || 0, rank(row.level)));
    }
    return out;
}

/**
 * File-access policies. They govern the File Portal (files-server-web) ONLY:
 * the portal reads them from admin.sqlite and enforces them on every endpoint.
 * This application never consults them - every signed-in account here sees
 * and manages the whole storage root. This service is their administration:
 * CRUD, grants, the best-effort rename/delete hooks that keep a policy on its
 * file, and `portalAccess`, a mirror of the portal's decision for the admin's
 * "Check access" tool.
 */
class FileAccessPolicyService {
    get LEVELS() { return LEVELS; }

    /**
     * What the portal decides for `userId` (or a visitor, when null) at
     * `clientPath`. Mirrors files-server-web lib/access-policy.js:
     *
     * - per policy: unpublished, before available_from or after available_until
     *   (both inclusive), or a deny for the user or one of their groups -> hidden;
     * - a visitor: locked -> "locked" (name shown, sign-in asked), public ->
     *   the default level, otherwise hidden;
     * - a signed-in user: restricted -> the highest level granted to them or a
     *   group; otherwise the default level, raised by a grant;
     * - over the path: hidden beats locked beats the lowest level. No policy ->
     *   download. The portal does not exempt administrators.
     */
    portalAccess(clientPath, userId = null, now = Date.now()) {
        validateClientPath(clientPath);
        let user = null;
        if (userId !== null) {
            user = UserRepository.findById(userId);
            if (!user) throw new AppError('User not found.', 404);
            if (user.status !== 'active') return { outcome: 'disabled', policies: [] };
        }

        const byKey = new Map();
        for (const row of FileAccessPolicyRepository.listPolicies()) {
            const key = portalKey(row.client_path);
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(row);
        }
        const grants = user ? foldGrants([
            ...UserFilePermissionRepository.listForUser(user.id),
            ...GroupRepository.listPermissionsForUser(user.id),
        ]) : new Map();

        const evaluate = (p) => {
            if (p.is_published !== 1) return 'hidden';
            if (p.available_from !== null && now < p.available_from) return 'hidden';
            if (p.available_until !== null && now > p.available_until) return 'hidden';
            const granted = grants.get(p.file_id);
            if (granted === DENY) return 'hidden';
            if (!user) {
                if (p.is_locked === 1) return 'locked';
                return p.access_mode === 'public' ? (p.default_level || 'download') : 'hidden';
            }
            const base = p.access_mode === 'restricted' ? 0 : rank(p.default_level || 'download');
            const r = Math.max(base, granted || 0);
            return r > 0 ? LEVELS[r - 1] : 'hidden';
        };

        const policies = [];
        let hidden = false;
        let locked = false;
        let level = LEVELS.length;
        for (const p of governingPaths(clientPath)) {
            for (const row of byKey.get(portalKey(p)) || []) {
                const outcome = evaluate(row);
                policies.push({ path: row.client_path, outcome });
                if (outcome === 'hidden') hidden = true;
                else if (outcome === 'locked') locked = true;
                else level = Math.min(level, rank(outcome));
            }
        }
        const outcome = hidden ? 'hidden' : locked ? 'locked' : LEVELS[level - 1];
        return { outcome, policies };
    }

    list() {
        return FileAccessPolicyRepository.listPolicies();
    }

    getByPath(clientPath) {
        validateClientPath(clientPath);
        return FileAccessPolicyRepository.findPolicyByPath(clientPath);
    }

    setPolicy(clientPath, { isDirectory, accessMode, isPublished, isLocked, availableFrom, availableUntil, defaultLevel, actorId }) {
        validateClientPath(clientPath);
        if (accessMode !== undefined && !ACCESS_MODES.has(accessMode)) {
            throw new AppError('access_mode must be "public", "authenticated", or "restricted".', 400);
        }
        if (defaultLevel !== undefined) assertLevel(defaultLevel, 'default_level');
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
            defaultLevel: defaultLevel ?? existing?.default_level ?? 'download',
            actorId,
        });
    }

    deletePolicy(clientPath) {
        validateClientPath(clientPath);
        FileAccessPolicyRepository.deletePolicy(clientPath);
    }

    /** The governed `files` row for a path, or 409 - a grant needs a policy to attach to. */
    _governedFile(clientPath) {
        const file = FileAccessPolicyRepository.findFileByPath(clientPath);
        if (!file) throw new AppError('Set a policy on this file before granting a permission.', 409);
        return file;
    }

    /** `level` defaults to 'download': what a grant meant before levels existed. */
    grantPermission(clientPath, userId, permission, grantedBy, level = 'download') {
        validateClientPath(clientPath);
        if (!PERMISSIONS.has(permission)) throw new AppError('permission must be "grant" or "deny".', 400);
        assertLevel(level, 'level');
        if (!UserRepository.findById(userId)) throw new AppError('User not found.', 404);
        const file = this._governedFile(clientPath);
        return UserFilePermissionRepository.upsert(file.id, userId, permission, grantedBy, level);
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

    grantGroupPermission(clientPath, groupId, permission, grantedBy, level = 'download') {
        validateClientPath(clientPath);
        if (!PERMISSIONS.has(permission)) throw new AppError('permission must be "grant" or "deny".', 400);
        assertLevel(level, 'level');
        if (!GroupRepository.findById(groupId)) throw new AppError('Group not found.', 404);
        const file = this._governedFile(clientPath);
        return GroupRepository.upsertPermission(file.id, groupId, permission, level, grantedBy);
    }

    revokeGroupPermission(clientPath, groupId) {
        validateClientPath(clientPath);
        const file = FileAccessPolicyRepository.findFileByPath(clientPath);
        if (!file) return;
        GroupRepository.revokePermission(file.id, groupId);
    }

    listGroupPermissions(clientPath) {
        validateClientPath(clientPath);
        const file = FileAccessPolicyRepository.findFileByPath(clientPath);
        if (!file) return [];
        return GroupRepository.listPermissionsForFile(file.id);
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
