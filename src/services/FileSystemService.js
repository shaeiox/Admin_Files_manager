// src/services/FileSystemService.js
'use strict';

const fs = require('fs/promises');
const AppError = require('../utils/AppError');
const PathService = require('./PathService');

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
            const items = await fs.readdir(securePath, { withFileTypes: true });
            return items; // Returns array of fs.Dirent objects
        } catch (error) {
            throw new AppError('Failed to read directory contents.', 500);
        }
    }

    /**
     * Check if a path exists on the disk.
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
}

module.exports = FileSystemService;