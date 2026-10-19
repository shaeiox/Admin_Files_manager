// src/services/UploadSessionService.js
'use strict';

const fs = require('fs/promises');
const { createWriteStream } = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Transform } = require('stream');
const { pipeline } = require('stream/promises');
const AppError = require('../utils/AppError');
const PathService = require('./PathService');
const UploadService = require('./UploadService');
const { resolveDataDir } = require('../config/dataDir');

/**
 * Resumable upload session store (resumable-uploads, design D2-D10).
 *
 * A single JSON document at data/upload-sessions.json, persisted with the
 * SettingsService discipline: singleton, in-memory cache, atomic
 * temp-file-then-rename writes, ENOENT bootstrap on first read, static
 * AppError messages for every failure. The document holds CLIENT values only:
 * `destination` is a client path, host paths never enter it, and
 * `receivedBytes` is not stored at all - progress is the size of the staged
 * file on disk, read fresh on every request (D2).
 *
 * Record lifecycle (D9):
 *   open -> (complete) -> completed [15-minute tombstone] -> swept
 *   open -> (7 days without an append) -> swept, staged file removed
 * `updatedAt` is renewed by successful appends only - reads never renew, so a
 * poll cannot keep a dead session alive.
 *
 * Staged bytes live at `<destination>/.upload-<sessionId>.part`, reusing the
 * UploadService naming convention and its discard retry (D4). `commit()` and
 * the free-space seam are UploadService's own.
 *
 * Concurrency (D10, single-process deployment): operations that touch a
 * session's staged file serialize on a per-session promise chain, so offset
 * validation, placement, and unlink never interleave; `_writeDoc` serializes
 * itself so two writers never share the temp file; `_activeAppends` lets the
 * sweep and the supersede path leave an in-flight session alone.
 * ponytail: in-process locks only, matching the one-Node-process deployment
 * contract (ADR-008); a second instance would need a shared lock.
 */

/** An open session with no append for this long is expired, TTL keyed on updatedAt. */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** A completed session answers idempotent re-completion for this long, then is swept. */
const COMPLETION_TOMBSTONE_MS = 15 * 60 * 1000;

/** Largest body one append accepts. Protocol invariant, not an env knob (D6). */
const MAX_CHUNK_BYTES = 32 * 1024 * 1024;

const SESSION_ID_PATTERN = /^[0-9a-f]{32}$/;

/** AppError carrying the machine-readable failure kind (and offset, where useful). */
function sessionError(message, statusCode, { kind, receivedBytes } = {}) {
    const error = new AppError(message, statusCode);
    if (kind) error.kind = kind;
    if (typeof receivedBytes === 'number') error.receivedBytes = receivedBytes;
    return error;
}

function joinClient(dir, name) {
    return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

class UploadSessionService {
    constructor() {
        // Absolute path to the JSON session store. Under AFM_DATA_DIR
        // (default <cwd>/data) - outside every release in production.
        this.dbPath = path.join(resolveDataDir(), 'upload-sessions.json');
        this.cache = null; // In-memory cache of the whole document
        this._docChain = Promise.resolve(); // Serializes document writes
        this._chains = new Map(); // Per-session promise chains
        this._activeAppends = new Set(); // Sessions with an operation touching staged bytes
    }

    /* ── Store plumbing (mirrors SettingsService) ───────────────────────── */

    /** Creates the store from scratch: parent directory, then the empty document. */
    async _init() {
        try {
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
            this.cache = { sessions: {} };
            await this._writeDoc();
            // First run is logged so it is distinguishable from a later outage in the journal.
            console.log(`[store] First run: initialised an empty upload-session store at ${this.dbPath}`);
        } catch (error) {
            const wrapped = new AppError('Upload session store could not be initialized.', 500);
            wrapped.cause = error;
            throw wrapped;
        }
    }

    /**
     * Reads the store from disk or returns the cache. A corrupt document fails
     * wholly (same choice as the settings and metadata stores).
     */
    async _read() {
        if (this.cache) return this.cache;

        try {
            const data = await fs.readFile(this.dbPath, 'utf8');
            const parsed = JSON.parse(data);
            if (!parsed || typeof parsed.sessions !== 'object' || parsed.sessions === null || Array.isArray(parsed.sessions)) {
                throw new Error('malformed session store');
            }
            this.cache = parsed;
            return this.cache;
        } catch (error) {
            if (error.code === 'ENOENT') {
                await this._init();
                return this.cache;
            }
            const wrapped = new AppError('Upload session store could not be read.', 500);
            wrapped.cause = error;
            throw wrapped;
        }
    }

    /**
     * Atomically persists the cache. Calls are chained, so concurrent writers
     * never share the temp file and the last write always reflects the latest
     * cache - every mutation lands on disk because each one schedules a write.
     */
    _writeDoc() {
        const run = this._docChain.then(
            () => this._writeDocNow(),
            () => this._writeDocNow()
        );
        this._docChain = run.then(() => {}, () => {});
        return run;
    }

    async _writeDocNow() {
        const tempPath = `${this.dbPath}.tmp`;
        await fs.writeFile(tempPath, JSON.stringify(this.cache, null, 2), 'utf8');
        await fs.rename(tempPath, this.dbPath);
    }

    /* ── Session locks and helpers ──────────────────────────────────────── */

    /** Runs fn after every previously queued operation for the same key. */
    _enqueue(key, fn) {
        const previous = this._chains.get(key) || Promise.resolve();
        const run = previous.then(fn, fn);
        const tail = run.then(() => {}, () => {});
        this._chains.set(key, tail);
        tail.then(() => {
            if (this._chains.get(key) === tail) this._chains.delete(key);
        });
        return run;
    }

    /** One writer per session: appends, complete, and abort serialize here. */
    _sessionLock(id, fn) {
        return this._enqueue(`session:${id}`, fn);
    }

    /** The staged file of a session: hidden, inside its destination, named per session. */
    _stagingPath(record) {
        const name = `${UploadService.STAGING_PREFIX}${record.id}${UploadService.STAGING_SUFFIX}`;
        return PathService.resolveSecurePath(joinClient(record.destination, name));
    }

    /** Size of a file, reading a missing one as 0 (D2: stat is the offset authority). */
    async _sizeOf(filePath) {
        try {
            return (await fs.stat(filePath)).size;
        } catch (error) {
            if (error.code === 'ENOENT') return 0;
            throw new AppError('Upload session storage could not be read.', 500);
        }
    }

    /** Server-authoritative progress: the staged file's size, or the full size once completed. */
    async _receivedBytesOf(record) {
        if (record.state === 'completed') return record.size;
        return this._sizeOf(this._stagingPath(record));
    }

    _expired(record, now) {
        if (record.state === 'completed') {
            return now - (record.completedAt || record.updatedAt) >= UploadSessionService.COMPLETION_TOMBSTONE_MS;
        }
        return now - record.updatedAt >= UploadSessionService.SESSION_TTL_MS;
    }

    _expiryOf(record) {
        const basis = record.state === 'completed'
            ? (record.completedAt || record.updatedAt) + UploadSessionService.COMPLETION_TOMBSTONE_MS
            : record.updatedAt + UploadSessionService.SESSION_TTL_MS;
        return new Date(basis).toISOString();
    }

    /** Loads a session or throws the uniform 404. Expired records read as unknown immediately. */
    async _mustGet(id) {
        if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) {
            throw sessionError('Upload session not found or expired.', 404, { kind: 'session_expired' });
        }
        await this._read();
        const record = this.cache.sessions[id];
        if (!record || this._expired(record, Date.now())) {
            throw sessionError('Upload session not found or expired.', 404, { kind: 'session_expired' });
        }
        return record;
    }

    /** Early placement refusal: target exists and overwriting is not authorized. */
    async _assertTargetPlaceable({ destination, name, overwrite }) {
        if (overwrite) return;
        const finalPath = PathService.resolveSecurePath(joinClient(destination, name));
        let stats = null;
        try {
            stats = await fs.lstat(finalPath);
        } catch (error) {
            if (error.code !== 'ENOENT') throw new AppError('Upload target could not be inspected.', 500);
        }
        if (stats) {
            const message = stats.isDirectory()
                ? 'A folder with that name already exists.'
                : 'A file with that name already exists.';
            throw sessionError(message, 409, { kind: 'destination_conflict' });
        }
    }

    /* ── Lifecycle ──────────────────────────────────────────────────────── */

    /**
     * Removes expired sessions and their staged bytes (D9). Runs at server
     * start (server.js) and on initiate; reads enforce expiry independently,
     * so an expired session can never be resumed even before the next sweep.
     *
     * A sweep never CREATES the store: on a host that has never seen a session
     * there is nothing to sweep, and boot must not materialise files in a data
     * directory (a test process that never touched sessions has no seam set).
     */
    async sweep() {
        if (!this.cache) {
            const present = await fs.access(this.dbPath).then(() => true, (error) => {
                if (error.code === 'ENOENT') return false;
                throw new AppError('Upload session store could not be read.', 500);
            });
            if (!present) return 0;
        }
        await this._read();
        const now = Date.now();
        let removed = 0;
        for (const [id, record] of Object.entries(this.cache.sessions)) {
            if (this._activeAppends.has(id)) continue;
            if (!this._expired(record, now)) continue;
            await UploadService.discard(this._stagingPath(record));
            delete this.cache.sessions[id];
            removed++;
        }
        if (removed > 0) await this._writeDoc();
        return removed;
    }

    /**
     * Opens or adopts a session for one file (D5). Idempotent per fingerprint
     * `(destination, name, size, lastModified)`: a matching session is
     * returned with its server-read progress, refreshing `overwrite`. An open
     * session for the same destination+name with a different fingerprint is
     * superseded - its bytes belong to a different file.
     *
     * @param {{destination: string, destinationPath: string, name: string,
     *   size: number, lastModified: number, overwrite: boolean}} offer
     * @returns {Promise<{record: object, receivedBytes: number, expiresAt: string}>}
     */
    async initiate(offer) {
        // Serialized: two rapid initiates for one file must not both pass the
        // match scan and create sibling sessions.
        return this._enqueue('initiate', () => this._initiateLocked(offer));
    }

    async _initiateLocked({ destination, destinationPath, name, size, lastModified, overwrite }) {
        if (size > UploadService.maxBytes) {
            // Legacy parity: the same refusal the multipart path produces.
            throw sessionError(
                `File exceeds the maximum upload size of ${UploadService.formatLimit(UploadService.maxBytes)} (${UploadService.maxBytes} bytes).`,
                413,
                { kind: 'size_exceeded' }
            );
        }
        await this._read();
        await this.sweep();

        const sessions = this.cache.sessions;
        const matchesFingerprint = (record) =>
            record.destination === destination &&
            record.name === name &&
            record.size === size &&
            record.lastModified === lastModified;

        const match = Object.values(sessions).find(matchesFingerprint);
        if (match) {
            if (match.state === 'completed') {
                // The file was placed; a client re-offering it completes idempotently.
                return { record: match, receivedBytes: match.size, expiresAt: this._expiryOf(match) };
            }
            await this._assertTargetPlaceable({ destination, name, overwrite: match.overwrite });
            if (match.overwrite !== overwrite) {
                match.overwrite = overwrite;
                await this._writeDoc();
            }
            return { record: match, receivedBytes: await this._receivedBytesOf(match), expiresAt: this._expiryOf(match) };
        }

        // A new session: refuse before any byte is stored, then supersede.
        await this._assertTargetPlaceable({ destination, name, overwrite });
        await UploadService._assertFreeSpace(destinationPath);

        for (const record of Object.values(sessions)) {
            if (record.state !== 'open' || record.destination !== destination || record.name !== name) continue;
            // A different fingerprint for the same target: those bytes are a different file.
            if (this._activeAppends.has(record.id)) continue; // in flight; leave it to its own flow
            await UploadService.discard(this._stagingPath(record));
            delete sessions[record.id];
        }

        const now = Date.now();
        const record = {
            id: crypto.randomBytes(16).toString('hex'),
            destination, name, size, lastModified, overwrite,
            state: 'open',
            createdAt: now,
            updatedAt: now,
        };
        sessions[record.id] = record;
        await this._writeDoc();
        return { record, receivedBytes: 0, expiresAt: this._expiryOf(record) };
    }

    /** The bare status read: never renews the TTL, always reads progress fresh. */
    async status(id) {
        const record = await this._mustGet(id);
        return {
            id: record.id,
            destination: record.destination,
            name: record.name,
            size: record.size,
            receivedBytes: await this._receivedBytesOf(record),
            state: record.state,
            expiresAt: this._expiryOf(record),
        };
    }

    /**
     * Appends one chunk at the session's current end. The offset must equal
     * the staged file's size (D2) or nothing is stored; the body is bounded by
     * MAX_CHUNK_BYTES and by the declared size, and any write failure rolls
     * the file back to the acknowledged offset so the session stays resumable.
     *
     * @param {string} id
     * @param {{offset: number, contentLength?: number, stream: import('stream').Readable}} input
     * @returns {Promise<{receivedBytes: number}>}
     */
    async appendChunk(id, { offset, contentLength, stream }) {
        this._activeAppends.add(id); // before any await, so sweep/supersede see it immediately
        try {
            return await this._sessionLock(id, async () => {
                const record = await this._mustGet(id);
                if (record.state !== 'open') {
                    throw sessionError('Upload session is already complete.', 409, { kind: 'session_completed' });
                }

                const staging = this._stagingPath(record);
                const current = await this._sizeOf(staging);
                if (offset !== current) {
                    throw sessionError('Append offset does not match the stored size.', 409, {
                        kind: 'offset_mismatch',
                        receivedBytes: current,
                    });
                }

                const remaining = record.size - current;
                if (typeof contentLength === 'number' && Number.isFinite(contentLength)) {
                    if (contentLength > UploadSessionService.MAX_CHUNK_BYTES) {
                        throw sessionError(
                            `Chunk exceeds the maximum append size of ${UploadSessionService.MAX_CHUNK_BYTES} bytes.`,
                            413,
                            { kind: 'chunk_too_large' }
                        );
                    }
                    if (contentLength > remaining) {
                        throw sessionError('Upload would exceed the declared file size.', 413, { kind: 'size_exceeded' });
                    }
                }

                // The counter is the bound even without a Content-Length: whatever
                // crosses the limit fails the pipeline before it can be persisted.
                const limit = Math.min(UploadSessionService.MAX_CHUNK_BYTES, remaining);
                let written = 0;
                const counter = new Transform({
                    transform(chunk, _encoding, callback) {
                        written += chunk.length;
                        if (written > limit) {
                            const bound = new Error('append bound exceeded');
                            bound.code = written > UploadSessionService.MAX_CHUNK_BYTES
                                ? 'AFM_CHUNK_TOO_LARGE'
                                : 'AFM_SIZE_EXCEEDED';
                            return callback(bound);
                        }
                        callback(null, chunk);
                    },
                });

                try {
                    await pipeline(stream, counter, createWriteStream(staging, { flags: 'a' }));
                } catch (error) {
                    // Roll back to the acknowledged offset; the session stays resumable there.
                    await fs.truncate(staging, current).catch(() => {});
                    if (error.code === 'AFM_CHUNK_TOO_LARGE') {
                        throw sessionError(
                            `Chunk exceeds the maximum append size of ${UploadSessionService.MAX_CHUNK_BYTES} bytes.`,
                            413,
                            { kind: 'chunk_too_large' }
                        );
                    }
                    if (error.code === 'AFM_SIZE_EXCEEDED') {
                        throw sessionError('Upload would exceed the declared file size.', 413, { kind: 'size_exceeded' });
                    }
                    if (error.code === 'ENOSPC') {
                        throw new AppError('Not enough free space on the server to accept this upload.', 507);
                    }
                    throw new AppError('Upload chunk could not be received.', 400);
                }

                // Renew the TTL only now: the append genuinely stored its bytes.
                record.updatedAt = Date.now();
                const total = await this._sizeOf(staging);
                await this._writeDoc();
                return { receivedBytes: total };
            });
        } finally {
            this._activeAppends.delete(id);
        }
    }

    /**
     * Places the completed file through UploadService.commit() (D11). Refuses
     * an incomplete session (409 session_incomplete) and a placement conflict
     * (409 destination_conflict) with the session kept; a repeated completion
     * of a completed session answers the same success without touching the
     * file again.
     *
     * @returns {Promise<{clientPath: string}>}
     */
    async complete(id, { overwrite } = {}) {
        this._activeAppends.add(id);
        try {
            return await this._sessionLock(id, async () => {
                const record = await this._mustGet(id);
                const clientPath = joinClient(record.destination, record.name);
                if (record.state === 'completed') {
                    return { clientPath };
                }

                const received = await this._receivedBytesOf(record);
                if (received < record.size) {
                    throw sessionError('Upload session is not complete.', 409, {
                        kind: 'session_incomplete',
                        receivedBytes: received,
                    });
                }
                if (typeof overwrite === 'boolean') record.overwrite = overwrite;

                const destination = await UploadService.resolveDirectory(record.destination);
                const staging = this._stagingPath(record);
                if (record.size === 0) {
                    // A zero-byte transfer may never have appended: give commit an empty source.
                    await fs.writeFile(staging, '').catch(() => {});
                }

                let placed;
                try {
                    placed = await UploadService.commit(staging, destination, record.name, {
                        overwrite: record.overwrite,
                    });
                } catch (error) {
                    // Placement refusals (file or folder in the way) keep the session resumable.
                    if (error instanceof AppError && error.statusCode === 409) {
                        error.kind = 'destination_conflict';
                    }
                    throw error;
                }

                const now = Date.now();
                record.state = 'completed';
                record.completedAt = now;
                record.updatedAt = now;
                await this._writeDoc();
                return { clientPath: placed.clientPath };
            });
        } finally {
            this._activeAppends.delete(id);
        }
    }

    /**
     * Abandons a session: staged file first, then the record (D9) - a crash
     * between the two leaves a record reading as 0 bytes, which is inert; the
     * reverse order could orphan a file forever.
     */
    async abort(id) {
        this._activeAppends.add(id);
        try {
            return await this._sessionLock(id, async () => {
                const record = await this._mustGet(id);
                await UploadService.discard(this._stagingPath(record));
                delete this.cache.sessions[record.id];
                await this._writeDoc();
                return { id: record.id };
            });
        } finally {
            this._activeAppends.delete(id);
        }
    }
}

UploadSessionService.SESSION_TTL_MS = SESSION_TTL_MS;
UploadSessionService.COMPLETION_TOMBSTONE_MS = COMPLETION_TOMBSTONE_MS;
UploadSessionService.MAX_CHUNK_BYTES = MAX_CHUNK_BYTES;

// Export a Singleton instance so the cache is shared across the entire app
module.exports = new UploadSessionService();
