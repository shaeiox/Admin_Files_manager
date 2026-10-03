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

        // SECURITY CHECK: Ensure the target path is strictly within the root path.
        // The separator boundary is load-bearing: a bare string prefix would treat a
        // name-prefix sibling (root `download` vs sibling `download-backup`) as
        // contained. Both sides come from `path.resolve`, so the comparison stays on a
        // single resolution basis — canonicalising only the root via realpath would
        // mismatch on case-insensitive volumes and fails on not-yet-existing paths.
        const contained = targetPath === rootPath || targetPath.startsWith(rootPath + path.sep);
        if (!contained) {
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

        // Mirror of the forward containment rule: same separator boundary, same
        // resolution basis. Without the boundary, an outside absolute path whose name
        // extends the root (`download-backup` vs `download`) was converted into a
        // client path that masqueraded as an in-tree location.
        const contained = absolutePath === rootPath || absolutePath.startsWith(rootPath + path.sep);
        if (!contained) {
            return '/';
        }

        let relative = absolutePath.substring(rootPath.length);
        // Standardize to POSIX slashes for the frontend UI
        relative = relative.replace(/\\/g, '/');

        return relative.startsWith('/') ? relative : `/${relative}`;
    }
}

module.exports = PathService;