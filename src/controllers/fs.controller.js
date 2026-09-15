// src/controllers/fs.controller.js
'use strict';

const path = require('path');
const FileSystemService = require('../services/FileSystemService');
const MetadataService = require('../services/MetadataService');
const PathService = require('../services/PathService');
const AppError = require('../utils/AppError');

/**
 * GET /api/fs/tree
 * Returns a 2-level deep folder hierarchy for the sidebar tree.
 */
exports.getTree = async (req, res, next) => {
    try {
        const rootPath = '/';
        const rootNode = {
            id: rootPath,
            name: 'All Files',
            path: rootPath,
            icon: 'hardDrive',
            children: []
        };

        // Helper to scan a directory and return sub-folders
        async function scanFolders(clientPath, depth = 1) {
            if (depth > 2) return []; // Limit depth to avoid excessive scanning

            try {
                const items = await FileSystemService.readDirectory(clientPath);
                const folders = [];

                for (const item of items) {
                    // Skip hidden files/folders (starting with dot)
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

                // Sort folders alphabetically
                return folders.sort((a, b) => a.name.localeCompare(b.name));
            } catch (error) {
                console.warn(`[Tree] Could not read ${clientPath}:`, error.message);
                return [];
            }
        }

        rootNode.children = await scanFolders(rootPath, 1);

        res.json([rootNode]); // Frontend expects an array of roots
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/fs/list
 * Returns directory contents, merged with metadata, supports filtering/sorting/pagination.
 */
exports.getList = async (req, res, next) => {
    try {
        const targetPath = req.query.path || '/';
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const sortKey = req.query.sort || 'modified';
        const sortDir = req.query.dir || 'desc';
        const search = (req.query.search || '').toLowerCase();
        const typeFilter = req.query.type || 'all';

        // 1. Read Raw OS Items
        const rawItems = await FileSystemService.readDirectory(targetPath);
        const enrichedItems = [];

        // Counters for filter chips
        const counts = {
            all: 0, folder: 0, image: 0, video: 0, document: 0, audio: 0, archive: 0, code: 0
        };

        // 2. Enrich with OS Stats and JSON Metadata
        for (const item of rawItems) {
            if (item.name.startsWith('.')) continue; // Hide dot-files

            const itemClientPath = targetPath === '/' ? `/${item.name}` : `${targetPath}/${item.name}`;
            const isFolder = item.isDirectory();

            // Get OS Stats (Size, Date)
            const stats = await FileSystemService.getStats(itemClientPath);

            // Get JSON Metadata (Downloads, Starred)
            const meta = await MetadataService.getFileMeta(itemClientPath);

            // Determine "type" for filtering (Very basic extension matcher, mirrors frontend)
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
                status: 'internal', // Placeholder for now
                _extKey: extKey // Internal use for filtering
            };

            // Apply Search Filter
            if (search && !fileObj.name.toLowerCase().includes(search)) continue;

            enrichedItems.push(fileObj);

            // Update Counts (ignores type filter, but respects search)
            counts.all++;
            if (counts[extKey] !== undefined) counts[extKey]++;
        }

        // 3. Apply Type Filter
        let filteredItems = enrichedItems;
        if (typeFilter !== 'all') {
            filteredItems = filteredItems.filter(f => f._extKey === typeFilter);
        }

        // 4. Sort (Folders always first)
        filteredItems.sort((a, b) => {
            if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;

            let valA = a[sortKey] || 0;
            let valB = b[sortKey] || 0;

            if (typeof valA === 'string') { valA = valA.toLowerCase(); valB = valB.toLowerCase(); }

            if (valA < valB) return sortDir === 'asc' ? -1 : 1;
            if (valA > valB) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });

        // 5. Pagination
        const total = filteredItems.length;
        const startIndex = (page - 1) * limit;
        const paginatedItems = filteredItems.slice(startIndex, startIndex + limit);

        // Clean up internal keys before sending to client
        paginatedItems.forEach(item => delete item._extKey);

        res.json({
            items: paginatedItems,
            total,
            counts
        });

    } catch (error) {
        next(error);
    }
};