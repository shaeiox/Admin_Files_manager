// src/controllers/fs.controller.js
'use strict';

const path = require('path');
const fs = require('fs');
const FileSystemService = require('../services/FileSystemService');
const MetadataService = require('../services/MetadataService');
const UploadService = require('../services/UploadService');
const AppError = require('../utils/AppError');
const { validateFileName, validateClientPath } = require('../utils/validators');
const { classifyFile, emptyBreakdown } = require('../utils/fileTypes');
const { mapWithConcurrency } = require('../utils/concurrency');
// Archiver 8 is ESM with named exports only. The v5-era callable
// factory no longer exists and calling it throws "archiver is not a function".
const { ZipArchive } = require('archiver');

/**
 * GET /api/fs/tree
 * Returns a 2-level deep folder hierarchy for the sidebar tree.
 */
async function getTree(req, res, next) {
    try {
        const rootPath = '/';
        const rootNode = {
            id: rootPath,
            name: 'All Files',
            path: rootPath,
            icon: 'hardDrive',
            children: []
        };

        async function scanFolders(clientPath, depth = 1) {
            if (depth > 2) return [];

            try {
                const items = await FileSystemService.readDirectory(clientPath);
                const folders = [];

                for (const item of items) {
                    if (item.name.startsWith('.')) continue;

                    if (item.isDirectory()) {
                        const childPath = clientPath === '/' ? `/${item.name}` : `${clientPath}/${item.name}`;
                        folders.push({
                            id: childPath,
                            name: item.name,
                            path: childPath,
                            children: await scanFolders(childPath, depth + 1)
                        });
                    }
                }

                return folders.sort((a, b) => a.name.localeCompare(b.name));
            } catch (error) {
                console.warn(`[Tree] Could not read ${clientPath}:`, error.message);
                return [];
            }
        }

        rootNode.children = await scanFolders(rootPath, 1);
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

        // Fails the whole request when the target itself is unreadable.
        const rawItems = await FileSystemService.readDirectory(targetPath);
        const candidates = rawItems.filter((item) =>
            !item.name.startsWith('.') && (!search || item.name.toLowerCase().includes(search)));

        // One store read primes the metadata cache, so the concurrent per-entry
        // lookups below are cache hits rather than N racing cold reads.
        await MetadataService.getFileMeta(targetPath);

        let skipped = 0;
        const enriched = await mapWithConcurrency(candidates, LIST_ENRICH_CONCURRENCY, async (item) => {
            const itemClientPath = targetPath === '/' ? `/${item.name}` : `${targetPath}/${item.name}`;

            let stats;
            try {
                stats = await FileSystemService.getStats(itemClientPath);
            } catch {
                // Vanished between readdir and stat, or unreadable. Not the
                // operator's error, and not a reason to fail the siblings.
                skipped++;
                return null;
            }
            const meta = await MetadataService.getFileMeta(itemClientPath);
            const isFolder = stats.isDirectory;

            return {
                id: itemClientPath,
                name: item.name,
                path: itemClientPath,
                isFolder,
                // The classification the type filter compares against - shipped so
                // the UI badge cannot disagree with the chip that filters it.
                type: isFolder ? 'folder' : classifyFile(item.name),
                // A directory's st_size is 4096 on ext4 and 0 on NTFS: neither is a
                // measurement of its contents, so it is reported as unavailable.
                size: isFolder ? null : stats.size,
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

        res.json({
            items: paginatedItems,
            total,
            counts
        });
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

        const fileName = path.posix.basename(clientPath);
        const encodedName = encodeURIComponent(fileName);

        res.setHeader(
            'Content-Disposition',
            `attachment; filename="${fileName.replace(/"/g, '')}"; filename*=UTF-8''${encodedName}`
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
    deleteItems,
    downloadFile,
    uploadFile,
    downloadZip,
    setStar,
    LIST_ENRICH_CONCURRENCY,
    LIST_MAX_LIMIT,
    LIST_SORT_KEYS,
};