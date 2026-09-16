// src/utils/validators.js
'use strict';

const AppError = require('./AppError');

/**
 * Validates a file or folder name against OS-level and security rules.
 * Rejects path separators, traversal sequences, control chars, reserved
 * Windows names, and excessive length.
 * 
 * @param {string} name 
 * @throws {AppError} 400 if invalid
 */
function validateFileName(name) {
    if (typeof name !== 'string') {
        throw new AppError('Name must be a string.', 400);
    }

    const trimmed = name.trim();

    if (trimmed.length === 0) {
        throw new AppError('Name cannot be empty.', 400);
    }

    if (trimmed.length > 255) {
        throw new AppError('Name is too long (max 255 characters).', 400);
    }

    // Reject path separators and traversal
    if (/[\/\\]/.test(trimmed) || trimmed.includes('..')) {
        throw new AppError('Name cannot contain slashes or parent references.', 400);
    }

    // Reject control characters and characters illegal on Windows filesystems
    // (kept strict to ensure cross-platform safety even if Linux would allow them)
    if (/[<>:"|?*\x00-\x1F]/.test(trimmed)) {
        throw new AppError('Name contains invalid characters.', 400);
    }

    // Reject reserved Windows device names for cross-platform safety
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i;
    if (reservedNames.test(trimmed)) {
        throw new AppError('Name is reserved by the operating system.', 400);
    }

    // Reject leading/trailing dots and spaces (cause issues on Windows)
    if (/^[.\s]|[.\s]$/.test(trimmed)) {
        throw new AppError('Name cannot start or end with a dot or space.', 400);
    }

    return trimmed;
}

/**
 * Validates that a client path string is well-formed.
 * The actual security check happens later in PathService.
 * 
 * @param {string} clientPath 
 * @throws {AppError} 400 if invalid
 */
function validateClientPath(clientPath) {
    if (typeof clientPath !== 'string') {
        throw new AppError('Path must be a string.', 400);
    }
    if (clientPath.length === 0) {
        throw new AppError('Path cannot be empty.', 400);
    }
    if (clientPath.length > 4096) {
        throw new AppError('Path is too long.', 400);
    }
    return clientPath;
}

module.exports = {
    validateFileName,
    validateClientPath,
};