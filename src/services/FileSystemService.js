// src/services/FileSystemService.js
'use strict';

const fs = require('fs/promises');
const os = require('os');
const AppError = require('../utils/AppError');
const PathService = require('./PathService');
const { classifyFile, emptyBreakdown } = require('../utils/fileTypes');

// Traversal budgets. Approved as A3 (2026-10-03).
// This walk runs on an unauthenticated endpoint, so worst-case work must be
// bounded. Whichever budget trips first stops the walk.
const DEFAULT_MAX_ENTRIES = 100000;
const DEFAULT_MAX_MS = 2000;

// How often the time budget is evaluated inside the entry loop. Calling
// Date.now() once per entry is wasteful on a 100k-entry tree.
const TIME_CHECK_INTERVAL = 512;

class FileSystemService {
    /**
     * Get file/folder statistics from the OS.
     * @param {string} clientPath 
     */
    static async getStats(clientPath) {
        const securePath = PathService.resolveSecurePath(clientPath);
        try {
            const stats = await fs.stat(securePath);
            return {
                securePath,
                isDirectory: stats.isDirectory(),
                size: stats.size,
                modified: stats.mtime.getTime(),
            };
        } catch (error) {
            if (error.code === 'ENOENT') {
                throw new AppError(`Item not found: ${clientPath}`, 404);
            }
            if (error.code === 'EACCES') {
                throw new AppError('Permission denied.', 403);
            }
            throw new AppError('Failed to read file details from disk.', 500);
        }
    }

    /**
     * Read directory contents.
     * @param {string} clientPath 
     */
    static async readDirectory(clientPath) {
        const { securePath, isDirectory } = await this.getStats(clientPath);

        if (!isDirectory) {
            throw new AppError('Requested path is not a directory.', 400);
        }

        try {
            return await fs.readdir(securePath, { withFileTypes: true });
        } catch (error) {
            if (error.code === 'EACCES') {
                throw new AppError('Permission denied to read directory.', 403);
            }
            throw new AppError('Failed to read directory contents.', 500);
        }
    }

    /**
     * Check if a path exists on the disk (no throw).
     * @param {string} securePath 
     */
    static async exists(securePath) {
        try {
            await fs.access(securePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Create a directory at the specified client path.
     * Uses recursive: false to prevent silent creation of parent chains
     * that the user did not explicitly request.
     * 
     * @param {string} clientPath - Target path (e.g., "/media/new-folder")
     * @returns {Promise<{securePath: string}>}
     */
    static async createDirectory(clientPath) {
        const securePath = PathService.resolveSecurePath(clientPath);

        // Check for existing entry to return a clean 409 Conflict
        if (await this.exists(securePath)) {
            throw new AppError('A file or folder with this name already exists.', 409);
        }

        try {
            await fs.mkdir(securePath, { recursive: false });
            return { securePath };
        } catch (error) {
            if (error.code === 'ENOENT') {
                // Parent directory does not exist
                throw new AppError('Parent directory does not exist.', 404);
            }
            if (error.code === 'EACCES' || error.code === 'EPERM') {
                throw new AppError('Permission denied to create folder.', 403);
            }
            throw new AppError('Failed to create folder on disk.', 500);
        }
    }

    /**
     * Rename a file or folder within the same parent directory.
     * Cross-directory moves are intentionally not supported here to
     * keep this operation predictable; use a dedicated move API for that.
     * 
     * @param {string} oldClientPath - Existing path (e.g., "/media/old.txt")
     * @param {string} newName - New filename only (e.g., "new.txt")
     * @returns {Promise<{oldPath: string, newPath: string}>}
     */
    static async rename(oldClientPath, newName) {
        const oldSecurePath = PathService.resolveSecurePath(oldClientPath);

        // Ensure source exists before proceeding
        if (!(await this.exists(oldSecurePath))) {
            throw new AppError('Source item not found.', 404);
        }

        // Build the new absolute path in the same parent directory
        const path = require('path');
        const parentDir = path.dirname(oldSecurePath);
        const newSecurePath = path.join(parentDir, newName);

        // Containment check for the derived target.
        //
        // This previously round-tripped through toClientPath -> resolveSecurePath
        // and could never throw: for an outside-root target toClientPath returns
        // '/', and resolveSecurePath('/') correctly returns the root, which the
        // target === root branch accepts. So the check was a silent no-op.
        // Filename validation upstream is what actually blocks traversal; this
        // check is defence in depth, and it now actually works.
        const rootPath = PathService.resolveSecurePath('/');
        if (newSecurePath === rootPath) {
            throw new AppError('Cannot rename onto the storage root.', 403);
        }
        const newPathContained = newSecurePath.startsWith(rootPath + path.sep);
        if (!newPathContained) {
            throw new AppError('Access denied. Path traversal detected.', 403);
        }

        // Prevent silent overwrite
        if (await this.exists(newSecurePath)) {
            throw new AppError('An item with the new name already exists.', 409);
        }

        try {
            await fs.rename(oldSecurePath, newSecurePath);
            return {
                oldPath: PathService.toClientPath(oldSecurePath),
                newPath: PathService.toClientPath(newSecurePath),
            };
        } catch (error) {
            if (error.code === 'EACCES' || error.code === 'EPERM') {
                throw new AppError('Permission denied to rename item.', 403);
            }
            throw new AppError('Failed to rename item on disk.', 500);
        }
    }

    /**
     * Permanently remove a file or folder.
     * Uses recursive + force for folders to remove non-empty trees.
     * 
     * @param {string} clientPath 
     * @returns {Promise<{isDirectory: boolean}>}
     */
    static async remove(clientPath) {
        const securePath = PathService.resolveSecurePath(clientPath);

        // Prevent accidental deletion of the storage root itself
        const rootPath = PathService.resolveSecurePath('/');
        if (securePath === rootPath) {
            throw new AppError('Cannot delete the storage root.', 403);
        }

        const stats = await this.getStats(clientPath);

        try {
            if (stats.isDirectory) {
                await fs.rm(securePath, { recursive: true, force: true });
            } else {
                await fs.unlink(securePath);
            }
            return { isDirectory: stats.isDirectory };
        } catch (error) {
            if (error.code === 'EACCES' || error.code === 'EPERM') {
                throw new AppError('Permission denied to delete item.', 403);
            }
            if (error.code === 'ENOENT') {
                throw new AppError('Item no longer exists.', 404);
            }
            throw new AppError('Failed to delete item on disk.', 500);
        }
    }

    /**
     * Aggregate statistics for the managed tree rooted at `clientPath`.
     *
     * Design constraints (see openspec/changes/dashboard-real-data):
     *  - Iterative depth-first with an EXPLICIT STACK. No recursion: a deep tree
     *    must not risk stack exhaustion, and budget enforcement needs a single
     *    place to stop.
     *  - The stack holds CLIENT paths only. Native paths are built at the syscall
     *    boundary, so an unvalidated path can never sit on the stack.
     *  - Symbolic links and Windows junctions are skipped ENTIRELY. Classification
     *    uses Dirent, which does not follow links; `fs.stat` does follow them and
     *    would report a junction as an ordinary directory.
     *  - Directory entry sizes are NEVER accumulated. Directory size is 0 on
     *    Windows but block-sized on ext4, so including it would make identical
     *    content report different totals per host.
     *  - An unreadable subtree degrades to a recorded diagnostic; it never fails
     *    the whole aggregation.
     *  - Traversal is bounded. On exhaustion it returns the partial result with
     *    `truncated: true` - a truncated total is a WRONG total, so it must be
     *    declared rather than presented as complete.
     *
     * The returned value contains no absolute OS path, drive letter, or
     * backslash separator.
     *
     * @param {string} [clientPath='/'] - Subtree to aggregate.
     * @param {{maxEntries?: number, maxMs?: number}} [options]
     * @returns {Promise<{files:number, folders:number, treeBytes:number,
     *   breakdown:Object<string,number>, truncated:boolean, entriesScanned:number,
     *   skippedLinks:number, inaccessible:number, errors:Array<{clientPath:string,code:string}>}>}
     */
    static async getTreeStats(clientPath = '/', options = {}) {
        const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
        const maxMs = options.maxMs ?? DEFAULT_MAX_MS;

        const startClientPath = clientPath === '' ? '/' : clientPath;
        const deadline = Date.now() + maxMs;

        const result = {
            files: 0,
            folders: 0,
            treeBytes: 0,
            breakdown: emptyBreakdown(),
            truncated: false,
            entriesScanned: 0,
            skippedLinks: 0,
            inaccessible: 0,
            errors: [],
        };

        // Resolve the start point once so a bad client path still raises the
        // normal AppError, and so a non-directory start is reported clearly.
        let startSecurePath;
        try {
            startSecurePath = PathService.resolveSecurePath(startClientPath);
        } catch (error) {
            // Containment rejection is a caller error - surface it as-is.
            if (error instanceof AppError) throw error;
            result.errors.push({ clientPath: startClientPath, code: 'UNRESOLVED' });
            return result;
        }

        // Explicit stack of CLIENT paths.
        const stack = [startClientPath];

        const budgetExhausted = () => (
            result.entriesScanned >= maxEntries ||
            Date.now() >= deadline
        );

        walk:
        while (stack.length > 0) {
            if (budgetExhausted()) {
                result.truncated = true;
                break;
            }

            const currentClientPath = stack.pop();
            const currentSecurePath = PathService.resolveSecurePath(currentClientPath);

            let dirents;
            try {
                dirents = await fs.readdir(currentSecurePath, { withFileTypes: true });
            } catch (error) {
                // Degrade: record and continue with siblings.
                result.inaccessible += 1;
                result.errors.push({
                    clientPath: currentClientPath,
                    code: error.code || 'UNKNOWN',
                });
                continue;
            }

            for (const dirent of dirents) {
                if (result.entriesScanned >= maxEntries) {
                    result.truncated = true;
                    break walk;
                }
                if (result.entriesScanned % TIME_CHECK_INTERVAL === 0 && Date.now() >= deadline) {
                    result.truncated = true;
                    break walk;
                }

                // Dot-prefixed entries are excluded, matching single-directory
                // listing behaviour. Checked before the budget is charged, so
                // dotfiles cannot consume the traversal allowance.
                if (dirent.name.startsWith('.')) continue;

                result.entriesScanned += 1;

                const childClientPath = currentClientPath === '/'
                    ? `/${dirent.name}`
                    : `${currentClientPath}/${dirent.name}`;

                // Links are skipped entirely: no descent, no count, no name.
                // Dirent does not follow the link, which is the whole point.
                if (dirent.isSymbolicLink()) {
                    result.skippedLinks += 1;
                    continue;
                }

                if (dirent.isDirectory()) {
                    result.folders += 1;
                    stack.push(childClientPath);
                    continue;
                }

                if (!dirent.isFile()) continue; // sockets, fifos, devices

                result.files += 1;

                // lstat, not stat: if the entry was swapped for a link between
                // readdir and now, lstat reveals it and we skip rather than
                // follow it out of the root.
                let size;
                try {
                    const entryStat = await fs.lstat(
                        PathService.resolveSecurePath(childClientPath)
                    );
                    if (entryStat.isSymbolicLink()) {
                        result.skippedLinks += 1;
                        result.files -= 1;
                        continue;
                    }
                    size = entryStat.size;
                } catch (error) {
                    result.inaccessible += 1;
                    result.errors.push({
                        clientPath: childClientPath,
                        code: error.code || 'UNKNOWN',
                    });
                    result.files -= 1;
                    continue;
                }

                result.treeBytes += size;
                const category = classifyFile(dirent.name);
                result.breakdown[category] += size;
            }
        }

        return result;
    }

    /**
     * Pure capacity arithmetic. No I/O, so the formula can be tested exhaustively
     * without a syscall backdoor.
     *
     * Contract (approved A1 + A2, 2026-10-03):
     *   totalBytes = bsize * blocks
     *   usedBytes  = bsize * (blocks - bavail)
     *
     * `bsize` is used EXACTLY as reported. It is not assumed to be a power of two,
     * so multiplying by 1024 would be wrong (for bsize=1000 that inflates by
     * 1024x). `bavail` is pinned rather than `bfree`: on Windows they are equal,
     * but ext4 reserves blocks, so `bavail` is the only value with consistent
     * cross-platform semantics.
     *
     * Anything that is not a real reading degrades to EXPLICIT unavailability.
     * `null` is never replaced with `0`, because 0 reads as a measurement.
     *
     * @param {{bsize?:number, blocks?:number, bavail?:number}|null|undefined} statfsResult
     * @returns {{usedBytes:number|null, totalBytes:number|null, volumeAvailable:boolean}}
     */
    static computeCapacity(statfsResult) {
        const unavailable = { usedBytes: null, totalBytes: null, volumeAvailable: false };

        if (!statfsResult || typeof statfsResult !== 'object') return unavailable;

        const { bsize, blocks, bavail } = statfsResult;
        if (typeof bsize !== 'number' || typeof blocks !== 'number' || typeof bavail !== 'number') {
            return unavailable;
        }
        if (!Number.isFinite(bsize) || !Number.isFinite(blocks) || !Number.isFinite(bavail)) {
            return unavailable;
        }

        const totalBytes = bsize * blocks;
        // A degenerate or nonsensical reading is not a measurement of zero volume.
        if (totalBytes <= 0 || blocks < 0 || bavail < 0 || bavail > blocks) return unavailable;

        return {
            usedBytes: bsize * (blocks - bavail),
            totalBytes,
            volumeAvailable: true,
        };
    }

    /**
     * Volume capacity for the volume containing `clientPath`.
     *
     * Attempted UNCONDITIONALLY - there is no platform-name gate. A host whose
     * statfs lacks the required fields simply degrades to unavailability, which is
     * why the platform-independence requirement needs no `if (win32)` branch.
     *
     * `statfs` is called without `{bigint:true}`: that returns BigInt values,
     * which JSON.stringify cannot serialise (TypeError: Do not know how to
     * serialize a BigInt). Plain numbers are JSON-safe by construction.
     *
     * @param {string} [clientPath='/']
     * @returns {Promise<{usedBytes:number|null, totalBytes:number|null,
     *   volumeAvailable:boolean, raw?:object}>}
     */
    static async getVolumeStats(clientPath = '/') {
        try {
            const securePath = PathService.resolveSecurePath(clientPath || '/');
            const raw = await fs.statfs(securePath);
            return { ...this.computeCapacity(raw), raw };
        } catch {
            // Degrade rather than throw: an unreadable capacity is a partial
            // capability, not a server failure. No path detail is exposed.
            return {
                usedBytes: null,
                totalBytes: null,
                volumeAvailable: false,
            };
        }
    }

    /**
     * Dashboard runtime health metrics.
     *
     * Deliberately SYNCHRONOUS and dependency-free: it is on the polling path and
     * must be cheap and stable. Capacity-dependent metrics are not included here
     * because the health endpoint has no configured-root context; the Dashboard
     * renders disk usage from the summary payload instead.
     *
     * Rules this implements:
     *  - Only metrics backed by real platform data. Anything unsupported or failed
     *    is OMITTED, never reported as 0 - a zero reads as a healthy measurement.
     *  - No `status`/`level` field. There is no repository or platform source for
     *    memory or uptime thresholds, so asserting healthy/warning/critical would
     *    be inventing one.
     *  - No load average. `os.loadavg()` EXISTS on Windows and returns [0,0,0] -
     *    a plausible-looking but fabricated reading with no error to detect. There
     *    is no portable capability probe, and platform gating is forbidden by the
     *    cross-platform contract, so the only honest option is to omit it.
     *  - Uptime is expressed in SECONDS. It is a duration, not a percentage.
     *
     * @returns {Array<{name:string, value:number, unit:string, icon:string}>}
     */
    static getHealthMetrics() {
        const metrics = [];

        // Memory: a real percentage of a real denominator.
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        if (typeof totalMem === 'number' && totalMem > 0 && typeof freeMem === 'number') {
            const usedPct = ((totalMem - freeMem) / totalMem) * 100;
            if (Number.isFinite(usedPct)) {
                metrics.push({
                    name: 'Memory used',
                    value: Math.round(usedPct * 10) / 10,
                    unit: '%',
                    icon: 'cpu',
                });
            }
        }

        // Uptime: real, but a duration. Never a percentage.
        const uptime = process.uptime();
        if (typeof uptime === 'number' && Number.isFinite(uptime) && uptime >= 0) {
            metrics.push({
                name: 'Uptime',
                value: Math.round(uptime),
                unit: 's',
                icon: 'clock',
            });
        }

        return metrics;
    }

    /**
     * Retain only the ranked entries whose path still resolves inside the managed
     * tree, then recompute the bar maximum over what survives.
     *
     * Lives here rather than in the controller because filesystem access belongs to
     * a service (AGENTS.md rule 1). Stale metadata for a deleted file must not be
     * presented as a current file.
     *
     * @param {Array<{path:string, downloads:number}>} entries
     * @returns {Promise<Array<{path:string, downloads:number, max:number}>>}
     */
    static async retainExisting(entries) {
        if (!Array.isArray(entries) || entries.length === 0) return [];

        const kept = [];
        for (const entry of entries) {
            try {
                const securePath = PathService.resolveSecurePath(entry.path);
                if (await this.exists(securePath)) {
                    kept.push({ path: entry.path, downloads: entry.downloads });
                }
            } catch {
                // Unresolvable or out-of-root path - treat as stale.
            }
        }

        if (kept.length === 0) return [];

        const max = kept.reduce((peak, e) => Math.max(peak, e.downloads), 0);
        return kept.map((e) => ({ path: e.path, downloads: e.downloads, max }));
    }
}

module.exports = FileSystemService;