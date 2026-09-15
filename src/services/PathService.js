// src/services/PathService.js
'use strict';

const path = require('path');
const config = require('../config/env');
const AppError = require('../utils/AppError');

class PathService {
    /**
     * Safely resolves a client-provided path against the configured storage root.
     * Prevents Directory Traversal attacks (e.g., passing "../../etc/passwd").
     * 
     * @param {string} clientPath - The path provided by the frontend (e.g., "/media/videos")
     * @returns {string} The absolute, secure OS path
     */
    static resolveSecurePath(clientPath) {
        if (typeof clientPath !== 'string') {
            throw new AppError('Invalid path format provided.', 400);
        }

        // Resolve the absolute path of the storage root
        const rootPath = path.resolve(config.storageRoot);

        // Remove leading slashes so path.resolve joins it properly instead of treating it as absolute
        const normalizedClientPath = clientPath.replace(/^(\/|\\)+/, '');

        // Create the final absolute path
        const targetPath = path.resolve(rootPath, normalizedClientPath);

        // SECURITY CHECK: Ensure the target path is strictly within the root path
        if (!targetPath.startsWith(rootPath)) {
            throw new AppError('Access denied. Path traversal detected.', 403);
        }

        return targetPath;
    }

    /**
     * Converts an absolute OS path back to a relative client-friendly path.
     * 
     * @param {string} absolutePath - The full OS path
     * @returns {string} The relative path for the frontend (e.g., "/media")
     */
    static toClientPath(absolutePath) {
        const rootPath = path.resolve(config.storageRoot);
        if (!absolutePath.startsWith(rootPath)) {
            return '/';
        }

        let relative = absolutePath.substring(rootPath.length);
        // Standardize to POSIX slashes for the frontend UI
        relative = relative.replace(/\\/g, '/');

        return relative.startsWith('/') ? relative : `/${relative}`;
    }
}

module.exports = PathService;