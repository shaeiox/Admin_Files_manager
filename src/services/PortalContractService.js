// src/services/PortalContractService.js
'use strict';

const crypto = require('crypto');
const AdminDatabase = require('../db/connection');
const UserRepository = require('../db/repositories/UserRepository');
const { hashPassword, verifyPassword, randomToken } = require('../utils/crypto');

/**
 * The File Portal integration contract, version 1 (isolate-app-roots, ADR-011).
 *
 * The portal used to read admin.sqlite's tables directly, which tied it to this
 * host, this filesystem and every schema migration. It now reads ONE JSON
 * document, built here from the same rows in one read transaction:
 *
 *   { contract, volumeId, publishedRoot, releaseClientPath, auth,
 *     users, policies, userGrants, groupMembers, groupGrants, nav }
 *
 * Rules (docs/CONTRACTS.md):
 * - Values are this application's stored values, unvalidated: the portal keeps
 *   validating them exactly as it validated rows, so a decision cannot change
 *   with the transport.
 * - Adding a field keeps `contract`; removing or retyping one increments it.
 *   Schema migrations here never change it on their own.
 * - No password hash leaves this application. `credentialStamp` changes when a
 *   password changes (it ends that user's portal sessions) and reveals nothing:
 *   it is a domain-separated sha256 of the salted scrypt record.
 * - No timestamp of generation: the body, and so the ETag, only changes when
 *   the data does, which keeps the portal's 5 s poll a 304.
 */

const CONTRACT_VERSION = 1;

/** Answer for an unknown user, so a miss costs the same scrypt as a hit. */
const DUMMY_HASH = hashPassword(randomToken());

/** `null` stays null; anything else the integer it stores (admin tunables are validated on write). */
const intOrNull = (value) => (value === null || value === undefined ? null : Number(value));
const flag = (value) => value === 1;

function credentialStamp(passwordHash) {
    return crypto.createHash('sha256').update('afm-portal-credential-stamp-v1\0' + String(passwordHash)).digest('hex').slice(0, 32);
}

class PortalContractService {
    /** @returns {{ body: string, etag: string }} canonical JSON and its strong ETag. */
    snapshot() {
        const document = this.document();
        const body = JSON.stringify(document);
        const etag = '"' + crypto.createHash('sha256').update(body).digest('base64url') + '"';
        return { body, etag };
    }

    /** Reads every table the portal needs in one read transaction (consistent snapshot). */
    document() {
        const db = AdminDatabase.get();
        db.exec('BEGIN');
        try {
            const settings = new Map(db.prepare('SELECT key, value FROM integration_settings').all().map((r) => [r.key, r.value]));
            const revoked = new Map(db.prepare(
                "SELECT target_id, MAX(created_at) AS at FROM audit_logs " +
                "WHERE action = 'user.revoke_sessions' AND outcome = 'success' AND target_type = 'user' " +
                'GROUP BY target_id'
            ).all().map((r) => [Number(r.target_id), r.at]));

            return {
                contract: CONTRACT_VERSION,
                volumeId: settings.get('volume_id') ?? null,
                publishedRoot: settings.get('portal_root_client_path') ?? null,
                releaseClientPath: settings.get('release_client_path') ?? null,
                auth: {
                    sessionMinutes: intOrNull(settings.get('portal.auth_session_minutes')),
                    maxFailedAttempts: intOrNull(settings.get('portal.max_failed_attempts')),
                    lockoutMinutes: intOrNull(settings.get('portal.lockout_minutes')),
                },
                users: db.prepare('SELECT id, username, role, status, password_hash, locked_until FROM users ORDER BY id').all()
                    .map((u) => ({
                        id: u.id,
                        username: u.username,
                        role: u.role,
                        status: u.status,
                        lockedUntil: u.locked_until ?? null,
                        credentialStamp: credentialStamp(u.password_hash),
                        sessionsRevokedAt: revoked.get(u.id) ?? null,
                    })),
                policies: db.prepare(
                    'SELECT f.id AS file_id, f.client_path, f.is_directory, p.access_mode, p.is_published, p.is_locked, ' +
                    'p.available_from, p.available_until, p.default_level ' +
                    'FROM files f JOIN file_access_policies p ON p.file_id = f.id ORDER BY f.id'
                ).all().map((r) => ({
                    fileId: r.file_id,
                    clientPath: r.client_path,
                    isDirectory: flag(r.is_directory),
                    accessMode: r.access_mode,
                    isPublished: flag(r.is_published),
                    isLocked: flag(r.is_locked),
                    availableFrom: r.available_from ?? null,
                    availableUntil: r.available_until ?? null,
                    defaultLevel: r.default_level ?? null,
                })),
                userGrants: db.prepare('SELECT file_id, user_id, permission, level FROM user_file_permissions ORDER BY file_id, user_id').all()
                    .map((r) => ({ fileId: r.file_id, userId: r.user_id, permission: r.permission, level: r.level ?? null })),
                groupMembers: db.prepare('SELECT group_id, user_id FROM user_group_members ORDER BY group_id, user_id').all()
                    .map((r) => ({ groupId: r.group_id, userId: r.user_id })),
                groupGrants: db.prepare('SELECT file_id, group_id, permission, level FROM group_file_permissions ORDER BY file_id, group_id').all()
                    .map((r) => ({ fileId: r.file_id, groupId: r.group_id, permission: r.permission, level: r.level ?? null })),
                nav: db.prepare('SELECT client_path, label, hide_from_home FROM portal_nav_folders ORDER BY position ASC, id ASC').all()
                    .map((r) => ({ clientPath: r.client_path, label: r.label, hideFromHome: flag(r.hide_from_home) })),
            };
        } finally {
            db.exec('COMMIT');
        }
    }

    /**
     * A portal sign-in, checked with this application's rules: the password, an
     * active account, no running lock. A failure is uniform and records nothing
     * here - the portal keeps its own failed-attempt lockout, and a portal
     * brute force must not lock the account out of this application.
     *
     * @returns {{ userId: number, credentialStamp: string } | null}
     */
    verifyCredentials(username, password) {
        const user = typeof username === 'string' ? UserRepository.findByUsername(username.trim()) : null;
        const passwordOk = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
        if (!user || !passwordOk || user.status !== 'active') return null;
        if (user.locked_until && user.locked_until > Date.now()) return null;
        return { userId: user.id, credentialStamp: credentialStamp(user.password_hash) };
    }
}

module.exports = new PortalContractService();
module.exports.CONTRACT_VERSION = CONTRACT_VERSION;
module.exports.credentialStamp = credentialStamp;
