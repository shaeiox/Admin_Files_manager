// src/services/IntegrationSettingsService.js
'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const config = require('../config/env');
const AppError = require('../utils/AppError');
const PathService = require('./PathService');
const PortalNavService = require('./PortalNavService');
const IntegrationSettingsRepository = require('../db/repositories/IntegrationSettingsRepository');

/**
 * What the admin shares with the File Portal: logical values only, in
 * admin.sqlite (ADR-010). The portal maps them onto its own host paths.
 *
 * - The storage volume: a UUID in `volume_id` and in STORAGE_ROOT/.dimension-volume
 *   (`{volumeId, clientPath: "/"}`). A portal locates itself by climbing from its
 *   FILES_ROOT to that marker, so it can serve any folder of the storage with
 *   nothing configured here (design D2).
 * - The portal folder (optional, `portal_root_client_path`): one folder that also
 *   gets a marker naming it, for portal hosts that cannot see the storage root
 *   (a container or share mounting only that folder). Nothing is checked against it.
 *   Markers are dot-prefixed, so never listed, and PathService.resolveSecurePath
 *   answers 404 for them at any depth: no client can read, rename, move, copy or
 *   delete one.
 * - The release folder, as a client path (each portal uses it only inside itself).
 * - Three portal auth tunables (null = the portal's own env/default applies).
 */

const { VOLUME_MARKER } = PathService;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** API field -> stored key and range (same ranges the portal enforces). */
const TUNABLES = {
    sessionMinutes: { key: 'portal.auth_session_minutes', min: 1, max: 10080 },
    maxFailedAttempts: { key: 'portal.max_failed_attempts', min: 1, max: 1000 },
    lockoutMinutes: { key: 'portal.lockout_minutes', min: 1, max: 10080 },
};

/** Client paths compare case-insensitively where the filesystem folds case. */
const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
/** True when `p` is `base` or inside it. */
const within = (p, base) => base === '/' || fold(p) === fold(base) || fold(p).startsWith(fold(base) + '/');

/** Absolute path of the marker in a folder; the folder is canonicalised so a link can never redirect the write. */
async function markerPath(clientPath) {
    if (clientPath === '/') return path.join(path.resolve(config.storageRoot), VOLUME_MARKER);
    const real = await PathService.resolveSecureRealPath(clientPath);
    if (!(await fs.stat(real)).isDirectory()) throw new AppError(`${clientPath} is not a folder.`, 400);
    return path.join(real, VOLUME_MARKER);
}

/** `{ exists, id, clientPath }`: id null when absent or not a valid volume file; clientPath '/' when the field is absent. */
async function readMarker(file) {
    let text;
    try {
        text = await fs.readFile(file, 'utf8');
    } catch (error) {
        return { exists: error.code !== 'ENOENT', id: null, clientPath: null };
    }
    try {
        const { volumeId, clientPath = '/' } = JSON.parse(text);
        const id = typeof volumeId === 'string' && UUID_RE.test(volumeId) ? volumeId.toLowerCase() : null;
        return { exists: true, id, clientPath: typeof clientPath === 'string' ? clientPath : null };
    } catch {
        return { exists: true, id: null, clientPath: null };
    }
}

const markerBody = (volumeId, clientPath) => JSON.stringify({ volumeId, clientPath }) + '\n';

class IntegrationSettingsService {
    /**
     * Gives the storage its identity when the database has none (design D1):
     * adopts a valid existing root marker, else creates one (`wx`: never overwrites).
     * A stored id is never re-stamped - a missing marker more likely means
     * STORAGE_ROOT now points elsewhere, and stamping would bless that directory.
     * Then restores a missing portal-root marker (D2). Never throws: a failure
     * shows up as a status instead.
     */
    static async stampVolume() {
        try {
            if (!IntegrationSettingsRepository.get('volume_id')) {
                const file = await markerPath('/');
                const marker = await readMarker(file);
                if (marker.exists) {
                    if (marker.id && marker.clientPath === '/') IntegrationSettingsRepository.setMany({ volume_id: marker.id });
                } else {
                    const id = crypto.randomUUID();
                    await fs.writeFile(file, markerBody(id, '/'), { flag: 'wx' });
                    IntegrationSettingsRepository.setMany({ volume_id: id });
                }
            }
            await IntegrationSettingsService.portalRoot();
        } catch (error) {
            console.warn(`[integration] Could not stamp ${VOLUME_MARKER} in STORAGE_ROOT: ${error.message}`);
        }
    }

    /** `{ id, status }`: ok | missing | mismatch | unwritable, read live from disk. */
    static async volume() {
        const id = IntegrationSettingsRepository.get('volume_id');
        const marker = await readMarker(await markerPath('/'));
        if (!id) return { id: null, status: marker.exists ? 'mismatch' : 'unwritable' };
        if (!marker.exists) return { id, status: 'missing' };
        return { id, status: marker.id === id.toLowerCase() && marker.clientPath === '/' ? 'ok' : 'mismatch' };
    }

    /**
     * `{ clientPath, status }` of the folder the portal serves (null = the storage root).
     * status: ok | missing (folder gone) | mismatch (another volume's marker) | unverified
     * (the storage identity itself is not ok). Our marker, missing or naming another
     * folder (moved outside the API), is rewritten: the storage is already verified.
     */
    static async portalRoot(volume) {
        const vol = volume || await IntegrationSettingsService.volume();
        const clientPath = IntegrationSettingsRepository.get('portal_root_client_path');
        if (vol.status !== 'ok') return { clientPath, status: 'unverified' };
        if (!clientPath) return { clientPath: null, status: 'ok' };
        let file;
        try {
            file = await markerPath(clientPath);
        } catch {
            return { clientPath, status: 'missing' };
        }
        const marker = await readMarker(file);
        if (marker.exists && marker.id !== vol.id.toLowerCase()) return { clientPath, status: 'mismatch' };
        if (!marker.exists || marker.clientPath !== clientPath) await fs.writeFile(file, markerBody(vol.id, clientPath));
        return { clientPath, status: 'ok' };
    }

    /** Bare read document for GET /admin/portal/settings. */
    static async get() {
        await IntegrationSettingsService.stampVolume();
        const auth = {};
        for (const [field, { key }] of Object.entries(TUNABLES)) {
            const raw = IntegrationSettingsRepository.get(key);
            auth[field] = raw === null ? null : Number(raw);
        }
        const volume = await IntegrationSettingsService.volume();
        return {
            volume,
            portalRoot: await IntegrationSettingsService.portalRoot(volume),
            releaseClientPath: IntegrationSettingsRepository.get('release_client_path'),
            auth,
        };
    }

    /**
     * Strict full replace of `{ portalRootClientPath, releaseClientPath, auth: { sessionMinutes,
     * maxFailedAttempts, lockoutMinutes } }`. null clears a value. Throws AppError(400/404/409) and
     * stores nothing on any problem. Returns the full settings document.
     */
    static async set(input) {
        const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
        const FIELDS = ['portalRootClientPath', 'releaseClientPath', 'auth'];
        if (!plain(input)) throw new AppError('Body must be an object of portal settings.', 400);
        const unknown = Object.keys(input).filter((k) => !FIELDS.includes(k));
        if (unknown.length) throw new AppError(`Unknown portal setting: ${unknown.join(', ')}.`, 400);
        if (!('portalRootClientPath' in input) || !('releaseClientPath' in input) || !plain(input.auth)) {
            throw new AppError('Body must carry portalRootClientPath, releaseClientPath and auth.', 400);
        }
        const unknownAuth = Object.keys(input.auth).filter((k) => !(k in TUNABLES));
        if (unknownAuth.length) throw new AppError(`Unknown portal setting: auth.${unknownAuth.join(', auth.')}.`, 400);

        const folder = async (raw) => {
            const clientPath = PortalNavService.normalizePath(raw);
            await markerPath(clientPath); // exists, in root, a folder
            return clientPath;
        };
        // Not checked against each other: a portal locates itself anywhere in the
        // storage (design D2), and uses the release folder only if it lies inside it.
        const portalRoot = input.portalRootClientPath === null ? null : await folder(input.portalRootClientPath);
        const releaseClientPath = input.releaseClientPath === null ? null : await folder(input.releaseClientPath);

        const entries = { portal_root_client_path: portalRoot, release_client_path: releaseClientPath };
        for (const [field, { key, min, max }] of Object.entries(TUNABLES)) {
            const v = input.auth[field];
            if (v === undefined) throw new AppError(`auth.${field} is required (null clears it).`, 400);
            if (v !== null && !(Number.isSafeInteger(v) && v >= min && v <= max)) {
                throw new AppError(`auth.${field} must be null or a whole number from ${min} to ${max}.`, 400);
            }
            entries[key] = v;
        }

        const previous = IntegrationSettingsRepository.get('portal_root_client_path');
        if (portalRoot !== previous) await IntegrationSettingsService.movePortalMarker(previous, portalRoot, () => {
            IntegrationSettingsRepository.setMany(entries);
        });
        else IntegrationSettingsRepository.setMany(entries);
        return IntegrationSettingsService.get();
    }

    /**
     * Writes our marker into `to` (409 unless the storage is verified, or when `to`
     * holds another volume's marker), runs `store`, then removes our marker from `from`.
     * The root marker is never removed.
     */
    static async movePortalMarker(from, to, store) {
        const vol = await IntegrationSettingsService.volume();
        if (to) {
            if (vol.status !== 'ok') throw new AppError(`The storage identity is ${vol.status}; fix it before choosing a portal root.`, 409);
            const file = await markerPath(to);
            const marker = await readMarker(file);
            if (marker.exists && marker.id !== vol.id.toLowerCase()) {
                throw new AppError(`${to} holds the marker of another storage volume; choose another folder.`, 409);
            }
            await fs.writeFile(file, markerBody(vol.id, to));
        }
        store();
        if (from) {
            try {
                const file = await markerPath(from);
                if ((await readMarker(file)).id === (vol.id || '').toLowerCase()) await fs.rm(file, { force: true });
            } catch { /* old folder gone: nothing to remove */ }
        }
    }

    /**
     * Best-effort rename/move hook (like FileAccessPolicyService.onPathRenamed): the
     * stored portal root and release folder follow their folder, and the portal-root
     * marker's clientPath is rewritten so the portal keeps verifying. Never throws.
     */
    static onPathRenamed(from, to) {
        try {
            const entries = {};
            for (const key of ['portal_root_client_path', 'release_client_path']) {
                const value = IntegrationSettingsRepository.get(key);
                if (value && from !== '/' && within(value, from)) entries[key] = to + value.slice(from.length);
            }
            if (!Object.keys(entries).length) return;
            IntegrationSettingsRepository.setMany(entries);
            if (entries.portal_root_client_path) IntegrationSettingsService.portalRoot().catch(() => { });
        } catch { /* best-effort; the rename itself already succeeded */ }
    }
}

IntegrationSettingsService.VOLUME_MARKER = VOLUME_MARKER;

module.exports = IntegrationSettingsService;
