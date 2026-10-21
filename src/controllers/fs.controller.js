// src/controllers/fs.controller.js
'use strict';

const path = require('path');
const fs = require('fs');
const FileSystemService = require('../services/FileSystemService');
const MetadataService = require('../services/MetadataService');
const FileAccessPolicyService = require('../services/FileAccessPolicyService');
const IntegrationSettingsService = require('../services/IntegrationSettingsService');
const OperationService = require('../services/OperationService');
const UploadService = require('../services/UploadService');
const AppError = require('../utils/AppError');
const { validateFileName, validateClientPath } = require('../utils/validators');
const { classifyFile, emptyBreakdown } = require('../utils/fileTypes');
const { mapWithConcurrency } = require('../utils/concurrency');
// Archiver 8 is ESM with named exports only. The v5-era callable
// factory no longer exists and calling it throws "archiver is not a function".
const { ZipArchive } = require('archiver');

/* ══════════════════════════════════════════
   TRACKED OPERATION SUPPORT (async Copy/Move)
   ══════════════════════════════════════════ */

/**
 * Register an operation before any work starts, so a status read issued while
 * the request is still running already has something truthful to report.
 *
 * @returns {string|null} the operation id, or null when tracking is unavailable
 */
function startTrackedOperation({ operationKind, paths, sessionId }) {
    try {
        return OperationService.create({
            operationKind,
            sessionId: sessionId || null,
            itemsTotal: paths.length,
            items: paths,
        }).id;
    } catch (error) {
        // Tracking must never be the reason a copy or move fails.
        console.error('[Operation] Could not register operation:', error.message);
        return null;
    }
}

/**
 * Drive a registered operation to a terminal state, whatever happens.
 *
 * The work runs detached from the request that started it, so the client can
 * read progress instead of blocking on one response. Every exit path ends in
 * exactly one terminal state: a failure inside `work` is recorded against the
 * operation rather than left to surface as an unhandled rejection, which is
 * what would otherwise strand a client polling a stalled operation forever.
 */
function runTrackedOperation(operationId, operationKind, work) {
    Promise.resolve()
        .then(work)
        .catch((error) => {
            console.error(`[Operation] ${operationKind} failed:`, error.message);
            try {
                OperationService.finish(operationId, { copied: 0, moved: 0, result: { error: error.message } });
            } catch { /* already terminal - nothing to settle */ }
        });
}

/**
 * Translate a service-level per-item progress sink into operation updates.
 *
 * `measured` is the pre-walk byte total: a real denominator, or null when the
 * source tree could not be measured (which is reported as unavailable, never 0).
 */
function operationItemProgress(operationId, clientPath, withBytes = false) {
    return {
        measured: (total) => {
            try { OperationService.setByteTotal(operationId, total); } catch { /* terminal */ }
        },
        itemStart: (name) => {
            try { OperationService.setInFlight(operationId, clientPath, name); } catch { /* terminal */ }
        },
        fileDone: (_name, bytes) => {
            try { OperationService.addFileBytes(operationId, bytes); } catch { /* terminal */ }
        },
        itemDone: () => {},
    };
}

/**
 * Settle the operation from the SAME per-item results the synchronous contract
 * has always returned, so the async outcome and the sync outcome cannot disagree.
 */
function settleTrackedOperation(operationId, results, key) {
    try {
        OperationService.finish(operationId, {
            [key]: results[key].length,
            result: { [key]: results[key], failed: results.failed },
        });
    } catch (error) {
        console.error('[Operation] Could not settle operation:', error.message);
    }
}

/**
 * GET /api/fs/tree?path=...
 * Returns a 2-level deep folder hierarchy rooted at `path` (default `/`) for
 * the sidebar tree. Every node also carries `childrenLoaded`: true once its
 * own children were actually read, false when the walk stopped at this
 * request's 2-level cap without checking. A node that comes back with
 * `childrenLoaded: false` may or may not have real children - the client
 * finds out, and gets one more bounded level, by calling this same endpoint
 * again with that node's own `path`. This is how the tree supports every
 * subdirectory depth while keeping each single request's work bounded: full
 * unlimited depth is a property of repeated, composable 2-level fetches, not
 * of any one response.
 */
async function getTree(req, res, next) {
    try {
        const rootPath = req.query.path === undefined ? '/' : req.query.path;
        if (rootPath !== '/') validateClientPath(rootPath);

        async function scanChildren(clientPath, depth) {
            // Past this request's cap: not read here - the caller can ask for
            // this exact path next, composably, for the next 2 levels.
            if (depth > 2) return { children: [], childrenLoaded: false };

            let items;
            if (depth === 1) {
                // The requested root itself: a real failure here (missing,
                // not a directory, no permission) is the caller's error, not
                // something to swallow into a silently empty tree.
                items = await FileSystemService.readDirectory(clientPath);
            } else {
                try {
                    items = await FileSystemService.readDirectory(clientPath);
                } catch (error) {
                    console.warn(`[Tree] Could not read ${clientPath}:`, error.message);
                    return { children: [], childrenLoaded: true }; // confirmed unreadable, not "unknown"
                }
            }

            const folders = [];
            for (const item of items) {
                if (item.name.startsWith('.')) continue;
                if (!item.isDirectory()) continue;

                const childPath = clientPath === '/' ? `/${item.name}` : `${clientPath}/${item.name}`;
                const sub = await scanChildren(childPath, depth + 1);
                folders.push({
                    id: childPath,
                    name: item.name,
                    path: childPath,
                    children: sub.children,
                    childrenLoaded: sub.childrenLoaded,
                });
            }

            return { children: folders.sort((a, b) => a.name.localeCompare(b.name)), childrenLoaded: true };
        }

        const scanned = await scanChildren(rootPath, 1);
        const rootNode = {
            id: rootPath,
            name: rootPath === '/' ? 'All Files' : (path.posix.basename(rootPath) || rootPath),
            path: rootPath,
            children: scanned.children,
            childrenLoaded: scanned.childrenLoaded,
        };
        if (rootPath === '/') rootNode.icon = 'hardDrive';

        res.json([rootNode]);
    } catch (error) {
        next(error);
    }
}

/* ── GET /api/fs/list bounds (documented in docs/CONTRACTS.md) ── */

/** Sort keys the listing accepts. Anything else falls back to the default. */
const LIST_SORT_KEYS = ['name', 'size', 'modified', 'downloads'];
const LIST_DEFAULT_SORT = 'modified';
const LIST_DEFAULT_LIMIT = 20;
/** Largest page served. Covers the largest page size the UI offers (100). */
const LIST_MAX_LIMIT = 200;
/** Per-entry stat calls in flight at once: concurrent, but cannot exhaust handles. */
const LIST_ENRICH_CONCURRENCY = 16;

function parsePositiveInt(raw, fallback) {
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** Lower-cased for strings; null/undefined stay null so they never pose as 0. */
function sortValue(entry, key) {
    const v = entry[key];
    if (v === null || v === undefined) return null;
    return typeof v === 'string' ? v.toLowerCase() : v;
}

/**
 * Directory-first, then the requested key in the requested direction. A missing
 * value sorts after every real value in BOTH directions, and ties break by name
 * then path, so the order never depends on readdir or completion order.
 */
function compareEntries(sortKey, sortDir) {
    const sign = sortDir === 'asc' ? 1 : -1;
    return (a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;

        const va = sortValue(a, sortKey);
        const vb = sortValue(b, sortKey);
        if (va !== null || vb !== null) {
            if (va === null) return 1;
            if (vb === null) return -1;
            if (va < vb) return -sign;
            if (va > vb) return sign;
        }

        const na = a.name.toLowerCase();
        const nb = b.name.toLowerCase();
        if (na !== nb) return na < nb ? -1 : 1;
        return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    };
}

/**
 * GET /api/fs/list
 * Returns directory contents, merged with metadata, supports filtering/sorting/pagination.
 */
async function getList(req, res, next) {
    try {
        const targetPath = req.query.path === undefined ? '/' : req.query.path;
        validateClientPath(targetPath);

        const page = parsePositiveInt(req.query.page, 1);
        const limit = Math.min(parsePositiveInt(req.query.limit, LIST_DEFAULT_LIMIT), LIST_MAX_LIMIT);
        const sortKey = LIST_SORT_KEYS.includes(req.query.sort) ? req.query.sort : LIST_DEFAULT_SORT;
        const sortDir = req.query.dir === 'asc' ? 'asc' : 'desc';
        const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase() : '';
        const typeFilter = typeof req.query.type === 'string' ? req.query.type : 'all';
        // Library "Starred" view. Composes with search, sort and type like any filter.
        const starredOnly = req.query.starredOnly === 'true';


        // Fails the whole request when the target itself is unreadable. A search
        // covers every subdirectory of the target (bounded walk); a plain
        // listing is the target's direct children.
        let searchTruncated = false;
        let found;
        if (search) {
            ({ matches: found, truncated: searchTruncated } = await FileSystemService.searchTree(targetPath, search));
        } else {
            found = (await FileSystemService.readDirectory(targetPath))
                .filter((item) => !item.name.startsWith('.'))
                .map((item) => ({ name: item.name, path: targetPath === '/' ? `/${item.name}` : `${targetPath}/${item.name}` }));
        }
        const candidates = found;

        // One store read primes the metadata cache, so the concurrent per-entry
        // lookups below are cache hits rather than N racing cold reads.
        await MetadataService.getFileMeta(targetPath);

        let skipped = 0;
        const enriched = await mapWithConcurrency(candidates, LIST_ENRICH_CONCURRENCY, async (item) => {
            const itemClientPath = item.path;

            let stats;
            try {
                stats = await FileSystemService.getStats(itemClientPath);
            } catch {
                // Vanished between readdir and stat, or unreadable. Not the
                // operator's error, and not a reason to fail the siblings.
                skipped++;
                return null;
            }
            const isFolder = stats.isDirectory;
            const folderStats = isFolder
                ? await FileSystemService.getTreeStats(itemClientPath)
                : null;
            const meta = await MetadataService.getFileMeta(itemClientPath);

            return {
                id: itemClientPath,
                name: item.name,
                path: itemClientPath,
                isFolder,
                // The classification the type filter compares against - shipped so
                // the UI badge cannot disagree with the chip that filters it.
                type: isFolder ? 'folder' : classifyFile(item.name),
                // Directory entry sizes are platform metadata, not content sizes.
                // Only expose a recursive total when the bounded walk completed.
                size: isFolder
                    ? (folderStats.truncated || folderStats.inaccessible > 0 ? null : folderStats.treeBytes)
                    : stats.size,
                sizeAvailable: isFolder
                    ? !(folderStats.truncated || folderStats.inaccessible > 0)
                    : true,
                modified: stats.modified,
                downloads: isFolder ? null : meta.downloads,
                starred: meta.starred,
                status: 'internal',
            };
        });

        if (skipped > 0) {
            console.warn(`[List] ${targetPath}: skipped ${skipped} entries that vanished or could not be read`);
        }

        const entries = enriched.filter((entry) => entry && (!starredOnly || entry.starred));

        const counts = { all: 0, folder: 0, ...emptyBreakdown() };
        for (const entry of entries) {
            counts.all++;
            counts[entry.type]++;
        }

        const filteredItems = typeFilter === 'all' ? entries : entries.filter((e) => e.type === typeFilter);
        filteredItems.sort(compareEntries(sortKey, sortDir));

        const total = filteredItems.length;
        const startIndex = (page - 1) * limit;
        const paginatedItems = filteredItems.slice(startIndex, startIndex + limit);

        const body = { items: paginatedItems, total, counts };
        if (search) body.searchTruncated = searchTruncated;
        res.json(body);
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/fs/folder
 * Body: { path: "/media/new-folder" }
 */
async function createFolder(req, res, next) {
    try {
        const { path: clientPath } = req.body || {};
        validateClientPath(clientPath);

        const folderName = path.posix.basename(clientPath);
        validateFileName(folderName);

        await FileSystemService.createDirectory(clientPath);

        MetadataService.addActivity({
            type: 'folder',
            user: 'system',
            action: 'created folder',
            target: folderName,
            folder: path.posix.dirname(clientPath),
        }).catch(() => { });

        res.status(201).json({
            success: true,
            data: { path: clientPath },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PUT /api/fs/rename
 * Body: { oldPath: "/media/old.txt", newName: "new.txt" }
 */
async function renameItem(req, res, next) {
    try {
        const { oldPath, newName } = req.body || {};
        validateClientPath(oldPath);
        const cleanNewName = validateFileName(newName);

        const { oldPath: from, newPath: to } = await FileSystemService.rename(oldPath, cleanNewName);

        try {
            await MetadataService.renamePath(from, to);
        } catch (metaErr) {
            console.error('[Metadata] Failed to migrate on rename:', metaErr.message);
        }
        FileAccessPolicyService.onPathRenamed(from, to);
        IntegrationSettingsService.onPathRenamed(from, to);

        MetadataService.addActivity({
            type: 'edit',
            user: 'system',
            action: 'renamed',
            target: cleanNewName,
            folder: path.posix.dirname(from),
        }).catch(() => { });

        res.json({
            success: true,
            data: { oldPath: from, newPath: to },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PUT /api/fs/move
 * Body: { paths: ["/media/a.txt", "/media/folder-b"], destination: "/archive" }
 * Bulk, same partial-failure contract as DELETE /api/fs/delete: a 200 can
 * still carry per-item failures in data.failed.
 *
 * ASYNC OPT-IN (additive, ADR-007). With `async: true` the work is registered as
 * a tracked operation and the response returns immediately with its id, so a
 * client can report real progress; the outcome is then read from
 * GET /api/fs/operations/:id. Without it the behaviour below is byte-identical
 * to what it has always been - the default path is untouched.
 */
async function moveItems(req, res, next) {
    try {
        const { paths, destination, async: asyncRequested } = req.body || {};

        if (!Array.isArray(paths) || paths.length === 0) {
            throw new AppError('At least one path must be provided.', 400);
        }
        if (paths.length > 500) {
            throw new AppError('Too many items in a single request (max 500).', 400);
        }
        validateClientPath(destination);

        const results = { moved: [], failed: [] };

        const operationId = asyncRequested
            ? startTrackedOperation({ operationKind: 'move', paths, sessionId: (req.session && req.session.id) || null })
            : null;

        if (operationId) {
            // Fire and forget, but never unobserved: a rejection anywhere below
            // still drives the operation to its one terminal state, so the client
            // is never left polling a stalled operation.
            runTrackedOperation(operationId, 'move', async () => {
                OperationService.start(operationId);
                for (const clientPath of paths) {
                    await runOneMove(operationId, clientPath, destination, results);
                }
                settleTrackedOperation(operationId, results, 'moved');
            });
            return res.json({ success: true, data: { operationId } });
        }

        for (const clientPath of paths) {
            await runOneMove(null, clientPath, destination, results);
        }

        if (results.moved.length === 0 && results.failed.length > 0) {
            const firstErr = results.failed[0];
            throw new AppError(firstErr.error, firstErr.statusCode);
        }

        res.json({
            success: true,
            data: results,
        });
    } catch (error) {
        next(error);
    }
}

/** Move one path, recording it against the operation when one is being tracked. */
async function runOneMove(operationId, clientPath, destination, results) {
    try {
        validateClientPath(clientPath);
        if (operationId) OperationService.setInFlight(operationId, clientPath, path.posix.basename(clientPath));
        const { oldPath: from, newPath: to } = await FileSystemService.move(
            clientPath,
            destination,
            operationId ? operationItemProgress(operationId, clientPath) : null
        );

        if (from !== to) {
            try {
                await MetadataService.renamePath(from, to);
            } catch (metaErr) {
                console.error('[Metadata] Failed to migrate on move:', metaErr.message);
            }
            FileAccessPolicyService.onPathRenamed(from, to);
            IntegrationSettingsService.onPathRenamed(from, to);

            MetadataService.addActivity({
                type: 'edit',
                user: 'system',
                action: 'moved',
                target: path.posix.basename(to),
                folder: path.posix.dirname(to),
            }).catch(() => { });
        }

        if (operationId) OperationService.completeItem(operationId, 0);
        results.moved.push({ oldPath: from, newPath: to });
    } catch (err) {
        const failure = { path: clientPath, error: err.message, statusCode: err.statusCode || 500 };
        if (operationId) OperationService.failItem(operationId, clientPath, err.message, failure.statusCode);
        results.failed.push(failure);
    }
}

/**
 * POST /api/fs/copy
 * Body: { paths: ["/media/a.txt", "/media/folder-b"], destination: "/archive" }
 * Bulk, same partial-failure contract as PUT /api/fs/move and DELETE
 * /api/fs/delete: a 200 can still carry per-item failures in data.failed.
 * The source is left in place; a copy is a new item, so unlike move it
 * carries no metadata/access-policy migration.
 *
 * ASYNC OPT-IN (additive, ADR-007). `async: true` registers a tracked
 * operation and returns its id immediately; see moveItems for the rationale.
 */
async function copyItems(req, res, next) {
    try {
        const { paths, destination, async: asyncRequested } = req.body || {};

        if (!Array.isArray(paths) || paths.length === 0) {
            throw new AppError('At least one path must be provided.', 400);
        }
        if (paths.length > 500) {
            throw new AppError('Too many items in a single request (max 500).', 400);
        }
        validateClientPath(destination);

        const results = { copied: [], failed: [] };

        const operationId = asyncRequested
            ? startTrackedOperation({ operationKind: 'copy', paths, sessionId: (req.session && req.session.id) || null })
            : null;

        if (operationId) {
            runTrackedOperation(operationId, 'copy', async () => {
                OperationService.start(operationId);
                for (const clientPath of paths) {
                    await runOneCopy(operationId, clientPath, destination, results);
                }
                settleTrackedOperation(operationId, results, 'copied');
            });
            return res.json({ success: true, data: { operationId } });
        }

        for (const clientPath of paths) {
            await runOneCopy(null, clientPath, destination, results);
        }

        if (results.copied.length === 0 && results.failed.length > 0) {
            const firstErr = results.failed[0];
            throw new AppError(firstErr.error, firstErr.statusCode);
        }

        res.json({
            success: true,
            data: results,
        });
    } catch (error) {
        next(error);
    }
}

/** Copy one path, recording real measured progress against the operation. */
async function runOneCopy(operationId, clientPath, destination, results) {
    try {
        validateClientPath(clientPath);
        if (operationId) OperationService.setInFlight(operationId, clientPath, path.posix.basename(clientPath));

        const progress = operationId
            ? operationItemProgress(operationId, clientPath, true)
            : null;

        const { sourcePath, newPath } = await FileSystemService.copy(clientPath, destination, progress);

        MetadataService.addActivity({
            type: 'edit',
            user: 'system',
            action: 'copied',
            target: path.posix.basename(newPath),
            folder: path.posix.dirname(newPath),
        }).catch(() => { });

        if (operationId) OperationService.completeItem(operationId, 0);
        results.copied.push({ sourcePath, newPath });
    } catch (err) {
        const failure = { path: clientPath, error: err.message, statusCode: err.statusCode || 500 };
        if (operationId) OperationService.failItem(operationId, clientPath, err.message, failure.statusCode);
        results.failed.push(failure);
    }
}

/**
 * DELETE /api/fs/delete
 * Body: { paths: ["/media/a.txt", "/media/folder-b"] }
 */
async function deleteItems(req, res, next) {
    try {
        const { paths } = req.body || {};

        if (!Array.isArray(paths) || paths.length === 0) {
            throw new AppError('At least one path must be provided.', 400);
        }
        if (paths.length > 500) {
            throw new AppError('Too many items in a single request (max 500).', 400);
        }

        const results = { deleted: [], failed: [] };

        for (const clientPath of paths) {
            try {
                validateClientPath(clientPath);
                await FileSystemService.remove(clientPath);

                MetadataService.deletePath(clientPath).catch(() => { });
                FileAccessPolicyService.onPathDeleted(clientPath);

                MetadataService.addActivity({
                    type: 'delete',
                    user: 'system',
                    action: 'deleted',
                    target: path.posix.basename(clientPath),
                    folder: path.posix.dirname(clientPath),
                }).catch(() => { });

                results.deleted.push(clientPath);
            } catch (err) {
                results.failed.push({
                    path: clientPath,
                    error: err.message,
                    statusCode: err.statusCode || 500,
                });
            }
        }

        if (results.deleted.length === 0 && results.failed.length > 0) {
            const firstErr = results.failed[0];
            throw new AppError(firstErr.error, firstErr.statusCode);
        }

        res.json({
            success: true,
            data: results,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/fs/download?path=/media/file.txt
 */
async function downloadFile(req, res, next) {
    try {
        const clientPath = req.query.path;
        validateClientPath(clientPath);

        const stats = await FileSystemService.getStats(clientPath);

        if (stats.isDirectory) {
            throw new AppError('Cannot download a directory.', 400);
        }

        const fileName = validateFileName(path.posix.basename(clientPath));
        const encodedName = encodeURIComponent(fileName);

        // The name becomes a response header, so it must satisfy the filename
        // rules rather than be merely quoted: Node rejects CR/LF in a header
        // value (an unhandled 500), and an illegal name has no business being
        // advertised. A refused download is a client error, not a server fault.
        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fileName}"; filename*=UTF-8''${encodedName}`
        );
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-cache');

        const stream = fs.createReadStream(stats.securePath);

        stream.once('open', () => {
            MetadataService.incrementDownload(clientPath).catch(() => { });
        });

        stream.on('error', (streamErr) => {
            if (!res.headersSent) {
                return next(new AppError('Failed to stream file.', 500));
            }
            res.destroy(streamErr);
        });

        stream.pipe(res);
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/fs/upload
 * Multipart fields: `file` (required), `destination` (client folder, default '/'),
 * `overwrite` ('true' to replace an existing file; anything else refuses).
 *
 * Placement is decided by UploadService AFTER the whole body is parsed, so the
 * file lands in `destination` whatever the field order, and `data.path` is the
 * path actually written - never a form field re-read after the fact.
 */
function uploadFile(req, res, next) {
    UploadService.middleware(req, res, async (err) => {
        const staged = UploadService.stagedPathOf(req);
        try {
            if (err) throw UploadService.toUploadError(err);
            if (!req.file) throw new AppError('No file provided.', 400);

            const destination = await UploadService.resolveDirectory(req.body.destination || '/');
            const overwrite = req.body.overwrite === 'true';
            const { clientPath, name } = await UploadService.commit(
                req.file.path, destination, req.file.targetName, { overwrite });

            MetadataService.addActivity({
                type: 'upload',
                user: 'system',
                action: 'uploaded',
                target: name,
                folder: destination.clientPath,
            }).catch(() => { });

            res.status(201).json({
                success: true,
                data: {
                    name,
                    path: clientPath,
                    size: req.file.size
                }
            });
        } catch (error) {
            await UploadService.discard(staged);
            next(error);
        }
    });
}

/**
 * POST /api/fs/star
 * Body: { path: "/media/a.png", starred?: boolean }
 * Without `starred` the flag is toggled; with it the call is idempotent.
 * Responds with the state actually stored, never the state requested.
 */
async function setStar(req, res, next) {
    try {
        const { path: clientPath, starred } = req.body || {};
        validateClientPath(clientPath);
        if (starred !== undefined && typeof starred !== 'boolean') {
            throw new AppError('starred must be a boolean when provided.', 400);
        }

        // 404 for a path that does not exist: a star on nothing is not an outcome.
        await FileSystemService.getStats(clientPath);

        const current = (await MetadataService.getFileMeta(clientPath)).starred;
        const result = starred === undefined || starred !== current
            ? await MetadataService.toggleStar(clientPath)
            : current;

        res.json({
            success: true,
            data: { path: clientPath, starred: result },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /api/fs/download-zip
 * Streams a ZIP archive directly to the client browser.
 * Normalizes Windows backslashes to POSIX slashes for Archiver compatibility.
 */
async function downloadZip(req, res, next) {
    try {
        let rawPaths = req.body.paths;

        if (typeof rawPaths === 'string') {
            try {
                rawPaths = JSON.parse(rawPaths);
            } catch (e) {
                rawPaths = [rawPaths];
            }
        }

        if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
            throw new AppError('At least one valid path must be provided.', 400);
        }

        if (rawPaths.length > 500) {
            throw new AppError('Too many items for a single ZIP request (max 500).', 400);
        }

        const entries = [];
        for (const clientPath of rawPaths) {
            validateClientPath(clientPath);
            const stats = await FileSystemService.getStats(clientPath);
            entries.push({
                clientPath,
                securePath: stats.securePath,
                isDirectory: stats.isDirectory,
                name: path.posix.basename(clientPath) || 'item',
            });
        }

        const stamp = new Date().toISOString().slice(0, 10);
        const zipName = `download-${stamp}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`);
        res.setHeader('Cache-Control', 'no-cache');

        const archive = new ZipArchive({ zlib: { level: 5 } });

        archive.on('error', (err) => {
            console.error('[ZIP Stream Error]:', err.message);
            if (!res.headersSent) {
                return next(new AppError('Failed to generate ZIP archive.', 500));
            }
            res.destroy(err);
        });

        req.on('close', () => {
            if (!res.writableEnded) {
                archive.abort();
            }
        });

        archive.pipe(res);

        for (const entry of entries) {
            // ✅ CROSS-PLATFORM FIX: Normalize Windows backslashes (\) to slashes (/) for Archiver library
            const normalizedPath = entry.securePath.replace(/\\/g, '/');

            if (entry.isDirectory) {
                archive.directory(normalizedPath, entry.name);
            } else {
                archive.file(normalizedPath, { name: entry.name });
            }

            if (!entry.isDirectory) {
                MetadataService.incrementDownload(entry.clientPath).catch(() => { });
            }
        }

        await archive.finalize();
    } catch (error) {
        next(error);
    }
}

// Single explicit export object — prevents module.exports vs exports override issues
module.exports = {
    getTree,
    getList,
    createFolder,
    renameItem,
    moveItems,
    copyItems,
    deleteItems,
    downloadFile,
    uploadFile,
    downloadZip,
    setStar,
    LIST_ENRICH_CONCURRENCY,
    LIST_MAX_LIMIT,
    LIST_SORT_KEYS,
};
