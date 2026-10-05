// src/services/UploadService.js
'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const PathService = require('./PathService');
const AppError = require('../utils/AppError');
const { validateFileName } = require('../utils/validators');

/**
 * Multipart upload placement.
 *
 * WHY STAGING EXISTS. Multipart field wire order is load-bearing: multer resolves
 * the storage destination when the FIRST FILE CHUNK arrives, so any field sent
 * after the file part (`destination`, `overwrite`) has not been parsed yet. The
 * previous implementation wrote straight to `req.body.destination || '/'` at that
 * moment - every upload whose file part came first landed in the storage root,
 * while the response (computed later, once the field WAS parsed) reported the
 * subfolder. See docs/CONTRACTS.md "POST /api/fs/upload".
 *
 * So bytes are first streamed to a hidden staging file, and the final placement is
 * decided only after every field has been parsed:
 *
 *   1. destination field already parsed (sent before the file) -> validated
 *      BEFORE any byte is written, and the staging file lives inside it;
 *      otherwise the staging file lives in the storage root.
 *   2. after the request completes, the destination is resolved again from the
 *      fully-parsed body, verified to be an existing directory, and the staged
 *      file is moved to `<destination>/<name>` under the overwrite policy.
 *   3. any failure discards the staging file, so a refused or failed upload leaves
 *      nothing behind and never touches a pre-existing file.
 *
 * Staging names are dot-prefixed, so the listing and tree (which skip dotfiles)
 * never show an in-flight upload.
 */

const STAGING_PREFIX = '.upload-';
const STAGING_SUFFIX = '.part';
const DEFAULT_MAX_BYTES = 5 * 1024 ** 3; // 5 GiB, the ceiling the Uploads page advertises

const STAGED = Symbol('uploadStagingPath');
const STAGED_DIR = Symbol('uploadStagingDir');

/**
 * Configurable via UPLOAD_MAX_BYTES (a positive integer byte count). Read once at
 * module load. An absent or malformed value falls back to the documented default
 * rather than to "unbounded".
 */
function resolveMaxBytes(raw) {
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

const UPLOAD_MAX_BYTES = resolveMaxBytes(process.env.UPLOAD_MAX_BYTES);

/**
 * Free-space watermark honoured before an upload stages any byte, and the
 * concurrent-upload ceiling for one client. Both are read from config, which
 * validated their form at startup; an unusable value falls back to the default
 * rather than to "unbounded" or to a disk that is always full.
 *
 * ponytail: concurrency is a plain in-process counter. It is per-process by
 * design - a multi-process deployment behind one nginx hop needs a shared store,
 * which is a real upgrade, not a bug, until the app is ever run that way.
 */
const config = require('../config/env');
const DEFAULT_FREE_SPACE_BYTES = config.DEFAULT_UPLOAD_FREE_SPACE_BYTES;
const DEFAULT_MAX_CONCURRENT_UPLOADS = 4;

/** Uploads this process is currently accepting. Incremented on entry, decremented on close. */
let inFlightUploads = 0;

function formatLimit(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    const rounded = Math.round(value * 10) / 10;
    return `${rounded} ${units[unit]}`;
}

function joinClient(dir, name) {
    return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

class UploadService {
    static get maxBytes() {
        return UPLOAD_MAX_BYTES;
    }

    /** Free bytes required before an upload may stage any byte. 0 disables the gate. */
    static get freeSpaceBytes() {
        const configured = config.uploadFreeSpaceBytes;
        return typeof configured === 'number' ? configured : DEFAULT_FREE_SPACE_BYTES;
    }

    /** Concurrent uploads this process accepts. 0 disables the gate. */
    static get maxConcurrentUploads() {
        const configured = Number(process.env.AFM_UPLOAD_MAX_CONCURRENT);
        return Number.isSafeInteger(configured) && configured >= 0 ? configured : DEFAULT_MAX_CONCURRENT_UPLOADS;
    }

    /**
     * Resolve a client destination to an existing directory.
     * Error messages are static: no absolute path reaches the client.
     *
     * @param {string} clientDest
     * @returns {Promise<{ securePath: string, clientPath: string }>}
     */
    static async resolveDirectory(clientDest) {
        if (typeof clientDest !== 'string' || clientDest.length === 0) {
            throw new AppError('Upload destination must be a path string.', 400);
        }
        // Canonicalising keeps the link-escape guard, but it answers a missing
        // destination as 404. The upload contract is 400, so the boundary's 404 is
        // translated here; a 403 escape verdict is passed through unchanged.
        let securePath;
        try {
            securePath = await PathService.resolveSecureRealPath(clientDest);
        } catch (error) {
            if (error instanceof AppError && error.statusCode === 404) {
                throw new AppError('Upload destination does not exist.', 400);
            }
            throw error;
        }

        let stats;
        try {
            stats = await fsp.stat(securePath);
        } catch {
            throw new AppError('Upload destination does not exist.', 400);
        }
        if (!stats.isDirectory()) {
            throw new AppError('Upload destination is not a folder.', 400);
        }
        return { securePath, clientPath: PathService.toClientPath(securePath) };
    }

    /**
     * Move a staged upload to its final name under the overwrite policy.
     *
     * overwrite=false is enforced atomically with link() (fails with EEXIST if the
     * name was taken, even by a racing writer); filesystems without hard links fall
     * back to an exclusive copy. overwrite=true uses rename(), which replaces the
     * target in one step, so a reader never observes a half-written file.
     *
     * @returns {Promise<{ clientPath: string, name: string }>}
     */
    static async commit(stagedPath, destination, name, { overwrite }) {
        const clientPath = joinClient(destination.clientPath, name);
        const finalPath = PathService.resolveSecurePath(clientPath);

        let existing = null;
        try {
            existing = await fsp.lstat(finalPath);
        } catch (error) {
            if (error.code !== 'ENOENT') throw new AppError('Upload target could not be inspected.', 500);
        }
        if (existing && existing.isDirectory()) {
            throw new AppError('A folder with that name already exists.', 409);
        }
        if (existing && !overwrite) {
            throw new AppError('A file with that name already exists.', 409);
        }

        if (overwrite) {
            await UploadService._moveReplacing(stagedPath, finalPath);
        } else {
            await UploadService._moveExclusive(stagedPath, finalPath);
        }
        return { clientPath, name };
    }

    static async _moveExclusive(stagedPath, finalPath) {
        try {
            await fsp.link(stagedPath, finalPath);
        } catch (error) {
            if (error.code === 'EEXIST') throw new AppError('A file with that name already exists.', 409);
            // No hard links here (FAT, some network shares): exclusive copy instead.
            try {
                await fsp.copyFile(stagedPath, finalPath, fs.constants.COPYFILE_EXCL);
            } catch (copyError) {
                if (copyError.code === 'EEXIST') throw new AppError('A file with that name already exists.', 409);
                await UploadService.discard(finalPath); // ours: EXCL guarantees it did not pre-exist
                throw new AppError('Upload could not be saved.', 500);
            }
        }
        await UploadService.discard(stagedPath);
    }

    static async _moveReplacing(stagedPath, finalPath) {
        try {
            await fsp.rename(stagedPath, finalPath);
            return;
        } catch (error) {
            if (error.code !== 'EXDEV') throw new AppError('Upload could not be saved.', 500);
        }
        // Cross-device: copy beside the target first, then rename atomically over it.
        const sibling = path.join(path.dirname(finalPath), UploadService._stagingName());
        try {
            await fsp.copyFile(stagedPath, sibling);
            await fsp.rename(sibling, finalPath);
        } catch {
            await UploadService.discard(sibling);
            throw new AppError('Upload could not be saved.', 500);
        }
        await UploadService.discard(stagedPath);
    }

    /**
     * Remove a staging (or partial) file. Never throws: cleanup must not mask the
     * error that triggered it. Windows can briefly hold a just-closed handle, so a
     * busy file is retried a few times.
     */
    static async discard(filePath) {
        if (!filePath) return;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                await fsp.unlink(filePath);
                return;
            } catch (error) {
                if (error.code === 'ENOENT') return;
                if (error.code !== 'EBUSY' && error.code !== 'EPERM') return;
                await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
            }
        }
    }

    /** The staging file multer wrote for this request, if any (also set on failure). */
    static stagedPathOf(req) {
        return req[STAGED] || null;
    }

    /**
     * Refuse an upload when the volume backing the staging directory is below
     * the configured free-space watermark, BEFORE a byte is staged.
     *
     * multer resolves `destination` before the first file chunk, so refusing here
     * means a full disk can never be filled by the very bytes meant to fill it -
     * the alternative (checking afterwards) would have written them first.
     *
     * A capacity reading that cannot be obtained is NOT treated as zero free
     * space: this admits the upload, because refusing every upload on a host
     * whose statfs is unavailable would be a self-inflicted outage. The message
     * is static, so no path or errno reaches the client.
     *
     * @param {string} securePath - the directory the upload will be staged in
     * @returns {Promise<void>}
     */
    static async _assertFreeSpace(securePath) {
        const watermark = UploadService.freeSpaceBytes;
        if (watermark <= 0) return;

        let available;
        try {
            available = await UploadService._freeSpace(securePath);
        } catch {
            return; // unreadable capacity: admit rather than lock the operator out
        }
        if (typeof available !== 'number' || !Number.isFinite(available)) return;

        if (available < watermark) {
            throw new AppError('Not enough free space on the server to accept this upload.', 507);
        }
    }

    /** Bytes free on the volume holding `securePath`, or a rejected promise. */
    static async _freeSpace(securePath) {
        if (UploadService._freeSpaceFn) return UploadService._freeSpaceFn(securePath);
        const stat = await fsp.statfs(securePath);
        // bavail, not bfree: bfree counts blocks reserved for root.
        return stat.bsize * stat.bavail;
    }

    /**
     * Test seam: substitute the free-space reader (null = use statfs). Returns
     * the previous reader so a caller can restore it.
     */
    static _useFreeSpaceReader(fn) {
        const previous = UploadService._freeSpaceFn;
        UploadService._freeSpaceFn = fn || null;
        return previous;
    }

    /** Translate a multer/busboy failure into the error contract. */
    static toUploadError(err) {
        if (err instanceof AppError) return err;
        if (err && err.code === 'LIMIT_FILE_SIZE') {
            return new AppError(
                `File exceeds the maximum upload size of ${formatLimit(UPLOAD_MAX_BYTES)} (${UPLOAD_MAX_BYTES} bytes).`,
                413
            );
        }
        if (err && typeof err.code === 'string' && err.code.startsWith('LIMIT_')) {
            return new AppError('Upload request exceeds a request limit.', 400);
        }
        return new AppError('Upload request could not be processed.', 400);
    }

    static _stagingName() {
        return `${STAGING_PREFIX}${crypto.randomBytes(8).toString('hex')}${STAGING_SUFFIX}`;
    }
}

const storage = multer.diskStorage({
    // Runs when the first file chunk arrives. A destination sent BEFORE the file is
    // validated here, before any byte is written; otherwise bytes are staged in the
    // root and placement is decided once the whole body is parsed.
    destination: (req, file, cb) => {
        const early = req.body && req.body.destination;
        UploadService.resolveDirectory(early || '/').then(
            (dest) => UploadService._assertFreeSpace(dest.securePath).then(
                () => {
                    req[STAGED_DIR] = dest.securePath;
                    cb(null, dest.securePath);
                },
                (err) => cb(err)
            ),
            (err) => cb(err)
        );
    },
    // diskStorage calls this after `destination`, so the full staging path is known
    // here - before any byte is written, and therefore even if the write fails.
    filename: (req, file, cb) => {
        try {
            file.targetName = validateFileName(file.originalname);
        } catch (err) {
            return cb(err);
        }
        const staged = UploadService._stagingName();
        req[STAGED] = path.join(req[STAGED_DIR], staged);
        cb(null, staged);
    },
});

UploadService.middleware = (req, res, next) => {
    const max = UploadService.maxConcurrentUploads;
    if (max > 0 && inFlightUploads >= max) {
        return next(new AppError('Too many uploads in progress. Try again shortly.', 429));
    }

    if (max > 0) {
        inFlightUploads += 1;
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            inFlightUploads -= 1;
        };
        // close covers an aborted request, finish a completed one. Either way the
        // slot must return, or a single dropped connection would permanently
        // consume the ceiling.
        res.on('close', release);
        res.on('finish', release);
    }

    return parseMultipart(req, res, next);
};

const parseMultipart = multer({
    storage,
    limits: { fileSize: UPLOAD_MAX_BYTES, files: 1, fields: 20 },
}).single('file');

UploadService.STAGING_PREFIX = STAGING_PREFIX;
UploadService.STAGING_SUFFIX = STAGING_SUFFIX;
UploadService.DEFAULT_MAX_BYTES = DEFAULT_MAX_BYTES;
UploadService.DEFAULT_FREE_SPACE_BYTES = DEFAULT_FREE_SPACE_BYTES;
UploadService.DEFAULT_MAX_CONCURRENT_UPLOADS = DEFAULT_MAX_CONCURRENT_UPLOADS;

module.exports = UploadService;
