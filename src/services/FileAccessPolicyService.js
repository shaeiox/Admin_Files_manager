// src/services/FileAccessPolicyService.js
'use strict';

const AppError = require('../utils/AppError');
const PathService = require('./PathService');
const { validateClientPath } = require('../utils/validators');
const FileAccessPolicyRepository = require('../db/repositories/FileAccessPolicyRepository');
const UserFilePermissionRepository = require('../db/repositories/UserFilePermissionRepository');
const UserRepository = require('../db/repositories/UserRepository');

const ACCESS_MODES = new Set(['public', 'authenticated', 'restricted']);
const PERMISSIONS = new Set(['grant', 'deny']);

/** Windows and macOS volumes are case-insensitive: `/Secret.txt` opens `/secret.txt`. */
const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

/**
 * The form a path is compared in. `validateClientPath` does not normalise, and
 * `/a//x`, `/x/../a`, `/a/` (and `\` on Windows) all reach the same file, so a
 * raw string lookup would be bypassable. Both sides go through this.
 * ponytail: lexical only - an in-root symlink to a governed file, or a Windows
 * trailing-dot alias, is not mapped back; canonicalise via realpath if those matter.
 */
function canonical(clientPath) {
    const key = PathService.toClientPath(PathService.resolveSecurePath(clientPath));
    return CASE_INSENSITIVE ? key.toLowerCase() : key;
}

/** `/a/b` -> ['/', '/a', '/a/b']: every path whose policy governs `/a/b`. */
function selfAndAncestors(key) {
    const out = ['/'];
    let at = 0;
    while ((at = key.indexOf('/', at + 1)) !== -1) out.push(key.slice(0, at));
    if (key !== '/') out.push(key);
    return out;
}

const ALLOW_ALL = Object.freeze({
    canAccess: () => true,
    assertCanAccess: () => {},
    assertCanAccessTree: () => {},
    hidesAnythingBelow: () => false,
});

/** Same answer as a path that does not exist, so a hidden file's existence is not disclosed. */
function notFound(clientPath) {
    return new AppError(`Item not found: ${clientPath}`, 404);
}

/**
 * File-access policies (ADR-009, authorization/file-access-policy spec):
 * administrator management of the data model, and `checkerFor`, the one
 * decision every fs/dashboard endpoint consults before serving or mutating
 * a path.
 */
class FileAccessPolicyService {
    /**
     * The access decision for one request's user, loaded once so a listing of N
     * entries is N map lookups, not N queries.
     *
     * - Administrators manage policies and are never restricted by them.
     * - A path with no policy on itself or any ancestor folder is open to every
     *   signed-in user (the behaviour before policies existed).
     * - Otherwise EVERY policy on the path (ancestors and self) must allow: so
     *   locking a folder locks everything beneath it. A policy allows when it is
     *   not locked, is published, `now` is inside [available_from, available_until),
     *   and - for `restricted` - the user holds an explicit `grant` on that policy's
     *   path. `public` and `authenticated` are equivalent: every route already
     *   requires a session, so there is no anonymous caller to distinguish.
     *
     * ponytail: reads every policy row per request; index by prefix if policies reach thousands.
     */
    checkerFor(user, now = Date.now()) {
        if (!user || user.role === 'admin') return ALLOW_ALL;

        const policies = new Map();
        for (const row of FileAccessPolicyRepository.listPolicies()) {
            try {
                policies.set(canonical(row.client_path), row);
            } catch (error) {
                // A stored path outside the root governs nothing reachable. Anything
                // else is a bug and must not silently disable enforcement.
                if (!(error instanceof AppError)) throw error;
            }
        }
        if (policies.size === 0) return ALLOW_ALL;

        const grants = new Map(UserFilePermissionRepository.listForUser(user.id)
            .map((row) => [row.file_id, row.permission]));

        const allows = (p) => p.is_locked !== 1
            && p.is_published === 1
            && (p.available_from === null || now >= p.available_from)
            && (p.available_until === null || now < p.available_until)
            && (p.access_mode !== 'restricted' || grants.get(p.file_id) === 'grant');

        // A traversal attempt throws its usual 403 from canonical(), unchanged.
        const canAccess = (clientPath) => {
            const key = canonical(clientPath);
            return selfAndAncestors(key).every((k) => !policies.has(k) || allows(policies.get(k)));
        };

        const hidesAnythingBelow = (clientPath) => {
            const key = canonical(clientPath);
            const base = key === '/' ? '/' : `${key}/`;
            for (const [k, row] of policies) {
                if (k !== key && k.startsWith(base) && !allows(row)) return true;
            }
            return false;
        };

        return {
            canAccess,
            hidesAnythingBelow,
            assertCanAccess(clientPath) {
                if (!canAccess(clientPath)) throw notFound(clientPath);
            },
            /**
             * For operations that act on a whole subtree (delete, move, rename, copy):
             * refusing is the only safe answer when it holds something this user
             * cannot see - deleting it would destroy it unseen, copying it would
             * publish an unprotected duplicate.
             */
            assertCanAccessTree(clientPath) {
                if (!canAccess(clientPath)) throw notFound(clientPath);
                if (hidesAnythingBelow(clientPath)) {
                    throw new AppError('This folder contains items you do not have access to.', 403);
                }
            },
        };
    }

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
