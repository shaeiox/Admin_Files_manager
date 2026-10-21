// test/contract/portal-v1.test.js
'use strict';

/**
 * File Portal contract v1, pinned by fixtures shared with the portal
 * (test/contract/portal-v1/, byte-identical in both repositories).
 *
 *   snapshot.json - the document for a known database: this application must
 *                   produce exactly it; the portal must decide from it exactly
 *                   what it decides from the same rows in SQLite.
 *   cases.json    - decisions over snapshot.json. Until the local mirror is
 *                   removed (isolate-app-roots task 3.3) it must agree too.
 *
 * Changing either file means changing the contract: change both repositories.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FIXTURES = path.join(__dirname, 'portal-v1');
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'snapshot.json'), 'utf8'));
const CASES = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'cases.json'), 'utf8')).cases;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-contract-'));
const { redirectAdminDb } = require('../helpers/authenticated');
redirectAdminDb(path.join(TMP, 'admin.sqlite'));
const AdminDatabase = require('../../src/db/connection');

/** Writes snapshot.json's data as the admin stores it. Password records are fixed strings. */
function seed(doc) {
    const db = AdminDatabase.get();
    const T = 1;
    db.exec('BEGIN');
    for (const u of doc.users) {
        db.prepare('INSERT INTO users (id, username, password_hash, role, status, locked_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(u.id, u.username, `fixture-hash-${u.username}`, u.role, u.status, u.lockedUntil, T, T);
        if (u.sessionsRevokedAt !== null) {
            db.prepare("INSERT INTO audit_logs (action, outcome, target_type, target_id, created_at) VALUES ('user.revoke_sessions', 'success', 'user', ?, ?)")
                .run(u.id, u.sessionsRevokedAt);
        }
    }
    for (const p of doc.policies) {
        db.prepare('INSERT INTO files (id, client_path, is_directory, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
            .run(p.fileId, p.clientPath, p.isDirectory ? 1 : 0, T, T);
        db.prepare('INSERT INTO file_access_policies (file_id, access_mode, is_published, is_locked, available_from, available_until, default_level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .run(p.fileId, p.accessMode, p.isPublished ? 1 : 0, p.isLocked ? 1 : 0, p.availableFrom, p.availableUntil, p.defaultLevel, T, T);
    }
    for (const g of doc.userGrants) {
        db.prepare('INSERT INTO user_file_permissions (file_id, user_id, permission, level, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(g.fileId, g.userId, g.permission, g.level, T);
    }
    for (const groupId of new Set([...doc.groupMembers.map((m) => m.groupId), ...doc.groupGrants.map((g) => g.groupId)])) {
        db.prepare('INSERT INTO user_groups (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(groupId, `group-${groupId}`, T, T);
    }
    for (const m of doc.groupMembers) {
        db.prepare('INSERT INTO user_group_members (group_id, user_id, created_at) VALUES (?, ?, ?)').run(m.groupId, m.userId, T);
    }
    for (const g of doc.groupGrants) {
        db.prepare('INSERT INTO group_file_permissions (file_id, group_id, permission, level, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(g.fileId, g.groupId, g.permission, g.level, T);
    }
    doc.nav.forEach((n, i) => {
        db.prepare('INSERT INTO portal_nav_folders (client_path, label, position, hide_from_home, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
            .run(n.clientPath, n.label, i, n.hideFromHome ? 1 : 0, T, T);
    });
    const settings = {
        volume_id: doc.volumeId,
        portal_root_client_path: doc.publishedRoot,
        release_client_path: doc.releaseClientPath,
        'portal.auth_session_minutes': doc.auth.sessionMinutes,
        'portal.max_failed_attempts': doc.auth.maxFailedAttempts,
        'portal.lockout_minutes': doc.auth.lockoutMinutes,
    };
    db.prepare('DELETE FROM integration_settings').run();
    for (const [key, value] of Object.entries(settings)) {
        if (value !== null) db.prepare('INSERT INTO integration_settings (key, value) VALUES (?, ?)').run(key, String(value));
    }
    db.exec('COMMIT');
}

before(() => seed(SNAPSHOT));
after(() => {
    AdminDatabase.reset();
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('contract v1 fixtures (shared with the File Portal)', () => {
    test('the snapshot of the fixture database is exactly snapshot.json', () => {
        const PortalContractService = require('../../src/services/PortalContractService');
        assert.deepEqual(PortalContractService.document(), SNAPSHOT);
    });

    test('the transitional local mirror agrees with every shared decision case', () => {
        const FileAccessPolicyService = require('../../src/services/FileAccessPolicyService');
        for (const c of CASES) {
            const got = FileAccessPolicyService.portalAccess(c.clientPath, c.userId, c.now);
            assert.deepEqual(got, { outcome: c.outcome, policies: c.policies }, `${c.clientPath} as ${c.userId} at ${c.now}`);
        }
    });
});
