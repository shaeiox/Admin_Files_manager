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

/* ── Settings document rules (settings-page-correctness, design D2/D4) ── */

/** Longest accepted workspace name, after trimming. */
const SETTINGS_WORKSPACE_NAME_MAX = 60;

/** Values the appearance default view accepts, besides the explicit null. */
const SETTINGS_VIEWS = ['list', 'grid'];

/** The exact top-level sections the document may carry - nothing else. */
const SETTINGS_SECTIONS = ['general', 'appearance'];

/**
 * Reads one required section of a settings payload and rejects unknown keys.
 * The whitelist is exact: every documented key must be present and nothing
 * else may appear - silent stripping would hide client drift behind a
 * successful-looking full replace.
 *
 * @param {object} payload
 * @param {string} name - section name ('general' | 'appearance')
 * @param {string[]} keys - the exact keys the section must contain
 * @throws {AppError} 400 if the section is missing, not an object, has a
 *   missing key, or carries an unknown key
 */
function settingsSection(payload, name, keys) {
    const section = payload[name];
    if (!section || typeof section !== 'object' || Array.isArray(section)) {
        throw new AppError(`Settings section "${name}" must be an object.`, 400);
    }
    for (const key of Object.keys(section)) {
        if (!keys.includes(key)) {
            throw new AppError(`Unknown setting "${name}.${key}".`, 400);
        }
    }
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(section, key)) {
            throw new AppError(`Missing setting "${name}.${key}".`, 400);
        }
    }
    return section;
}

/**
 * workspaceName: null, or a string of at most 60 characters. The value is
 * trimmed; an empty or whitespace-only string normalizes to the explicit
 * unset state (null), matching the repo's null-for-absence convention.
 */
function validateWorkspaceName(value) {
    if (value === null) return null;
    if (typeof value !== 'string') {
        throw new AppError('Workspace name must be a string or null.', 400);
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    if (trimmed.length > SETTINGS_WORKSPACE_NAME_MAX) {
        throw new AppError(`Workspace name is too long (max ${SETTINGS_WORKSPACE_NAME_MAX} characters).`, 400);
    }
    return trimmed;
}

/**
 * defaultUploadFolder: null, or a string that passes validateClientPath AND
 * reads as a client path - a POSIX string rooted at "/", never a host path.
 * Every segment must be a valid cross-platform name, which refuses traversal
 * (".."), dot segments, control characters and Windows-illegal characters.
 *
 * The value is VALIDATED here but never RESOLVED: PathService stays the only
 * resolution boundary, at the point of use (design D7). The accepted string
 * is returned verbatim so the store holds exactly what the client sent.
 */
function validateUploadFolder(value) {
    if (value === null) return null;
    validateClientPath(value);
    if (!value.startsWith('/') || value.includes('\\')) {
        throw new AppError('Default upload folder must be a client path rooted at /.', 400);
    }
    for (const segment of value.split('/')) {
        if (segment === '') continue;
        validateFileName(segment);
    }
    return value;
}

/** defaultView: null, "list", or "grid" - anything else is out of enum. */
function validateDefaultView(value) {
    if (value === null) return null;
    if (!SETTINGS_VIEWS.includes(value)) {
        throw new AppError('Default view must be "list", "grid", or null.', 400);
    }
    return value;
}

/**
 * Validates a complete settings document for a full replace.
 *
 * The payload must contain exactly the whitelisted sections and keys (all
 * present, none extra); unknown keys at any depth are rejected, never
 * stripped. Returns a freshly built, normalized document - the caller's
 * object is never aliased or mutated.
 *
 * @param {object} payload
 * @returns {{general: {workspaceName: string|null, defaultUploadFolder: string|null},
 *   appearance: {defaultView: string|null}}}
 * @throws {AppError} 400 if invalid
 */
function validateSettingsPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new AppError('Settings payload must be an object.', 400);
    }

    // Unknown SECTIONS are rejected first, so a stale client that still sends a
    // removed pane fails loudly instead of silently losing the keys it sent.
    for (const section of Object.keys(payload)) {
        if (!SETTINGS_SECTIONS.includes(section)) {
            throw new AppError(`Unknown settings section "${section}".`, 400);
        }
    }

    const general = settingsSection(payload, 'general', ['workspaceName', 'defaultUploadFolder']);
    const appearance = settingsSection(payload, 'appearance', ['defaultView']);

    return {
        general: {
            workspaceName: validateWorkspaceName(general.workspaceName),
            defaultUploadFolder: validateUploadFolder(general.defaultUploadFolder),
        },
        appearance: {
            defaultView: validateDefaultView(appearance.defaultView),
        },
    };
}

module.exports = {
    validateFileName,
    validateClientPath,
    validateSettingsPayload,
};