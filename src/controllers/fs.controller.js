// src/controllers/fs.controller.js
'use strict';

const path = require('path');
const fs = require('fs');
const FileSystemService = require('../services/FileSystemService');
const MetadataService = require('../services/MetadataService');
const PathService = require('../services/PathService');
const AppError = require('../utils/AppError');
const { validateFileName, validateClientPath } = require('../utils/validators');
const archiver = require('archiver');

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

/**
 * GET /api/fs/list
 * Returns directory contents, merged with metadata, supports filtering/sorting/pagination.
 */
async function getList(req, res, next) {
    try {
        const targetPath = req.query.path || '/';
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const sortKey = req.query.sort || 'modified';
        const sortDir = req.query.dir || 'desc';
        const search = (req.query.search || '').toLowerCase();
        const typeFilter = req.query.type || 'all';

        const rawItems = await FileSystemService.readDirectory(targetPath);
        const enrichedItems = [];

        const counts = {
            all: 0, folder: 0, image: 0, video: 0, document: 0, audio: 0, archive: 0, code: 0
        };

        for (const item of rawItems) {
            if (item.name.startsWith('.')) continue;

            const itemClientPath = targetPath === '/' ? `/${item.name}` : `${targetPath}/${item.name}`;
            const isFolder = item.isDirectory();

            const stats = await FileSystemService.getStats(itemClientPath);
            const meta = await MetadataService.getFileMeta(itemClientPath);

            let extKey = 'other';
            if (isFolder) {
                extKey = 'folder';
            } else {
                const ext = path.extname(item.name).toLowerCase().replace('.', '');
                if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) extKey = 'image';
                else if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) extKey = 'video';
                else if (['pdf', 'doc', 'docx', 'txt', 'xlsx', 'csv'].includes(ext)) extKey = 'document';
                else if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) extKey = 'audio';
                else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) extKey = 'archive';
                else if (['js', 'html', 'css', 'json', 'py', 'php'].includes(ext)) extKey = 'code';
            }

            const fileObj = {
                id: itemClientPath,
                name: item.name,
                path: itemClientPath,
                isFolder: isFolder,
                size: stats.size,
                modified: stats.modified,
                downloads: isFolder ? null : meta.downloads,
                starred: meta.starred,
                status: 'internal',
                _extKey: extKey
            };

            if (search && !fileObj.name.toLowerCase().includes(search)) continue;

            enrichedItems.push(fileObj);

            counts.all++;
            if (counts[extKey] !== undefined) counts[extKey]++;
        }

        let filteredItems = enrichedItems;
        if (typeFilter !== 'all') {
            filteredItems = filteredItems.filter(f => f._extKey === typeFilter);
        }

        filteredItems.sort((a, b) => {
            if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;

            let valA = a[sortKey] || 0;
            let valB = b[sortKey] || 0;

            if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }

            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        const total = filteredItems.length;
        const startIndex = (page - 1) * limit;
        const paginatedItems = filteredItems.slice(startIndex, startIndex + limit);

        paginatedItems.forEach(item => delete item._extKey);

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

// Add multer requirement at the top of fs.controller.js
const multer = require('multer');

// Configure Multer for streaming uploads directly to memory/disk
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        try {
            const clientDest = req.body.destination || '/';
            const secureDest = PathService.resolveSecurePath(clientDest);
            // Ensure the destination exists
            await fs.promises.access(secureDest);
            cb(null, secureDest);
        } catch (err) {
            cb(new AppError('Invalid upload destination.', 400));
        }
    },
    filename: (req, file, cb) => {
        try {
            const cleanName = validateFileName(file.originalname);
            // Optional: Add logic here to check overwrite flag and append (1) if needed
            cb(null, cleanName);
        } catch (err) {
            cb(err);
        }
    }
});

const uploadMiddleware = multer({ storage }).single('file');

/**
 * POST /api/fs/upload
 * Handles multipart/form-data file uploads
 */
async function uploadFile(req, res, next) {
    uploadMiddleware(req, res, (err) => {
        if (err) {
            return next(new AppError(err.message, 400));
        }

        if (!req.file) {
            return next(new AppError('No file provided.', 400));
        }

        const clientDest = req.body.destination || '/';
        const clientPath = clientDest === '/' ? `/${req.file.filename}` : `${clientDest}/${req.file.filename}`;

        // Log the activity
        MetadataService.addActivity({
            type: 'upload',
            user: 'system',
            action: 'uploaded',
            target: req.file.filename,
            folder: clientDest,
        }).catch(() => { });

        res.status(201).json({
            success: true,
            data: {
                name: req.file.filename,
                path: clientPath,
                size: req.file.size
            }
        });
    });
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

        const archive = archiver('zip', { zlib: { level: 5 } });

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
    downloadZip
};