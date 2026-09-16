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

        // Re-validate the new path through PathService to block traversal via newName
        const newClientPath = PathService.toClientPath(newSecurePath);
        PathService.resolveSecurePath(newClientPath); // throws if unsafe

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
}

module.exports = FileSystemService;