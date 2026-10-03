// src/utils/fileTypes.js
'use strict';

/**
 * File-type taxonomy — SHARED CONTRACT.
 *
 * Documented at docs/CONTRACTS.md "File-type taxonomy (shared contract)".
 * Both the directory listing (fs.controller.js `_extKey`) and the Dashboard
 * storage breakdown (FileSystemService.getTreeStats) must agree, otherwise the
 * donut and the file list disagree about the same file.
 *
 * The contract previously existed as an inline block in fs.controller.js plus a
 * hand-mirrored client map, with "when extending one side, mirror it on the
 * other" as the only enforcement. That is a silent-drift hazard: nothing failed
 * when the two sides diverged. This module is the single server-side source.
 *
 * KNOWN GAP (escalated, not silently resolved): fs.controller.js still carries
 * its own inline copy. Collapsing it to use this module is a ~12-line removal
 * and is tracked as an escalation, not applied unilaterally, because that file
 * is outside this phase's ownership.
 *
 * NO AUTOMATED GUARD EXISTS. `docs/CONTRACTS.md` ("File-type taxonomy (shared
 * contract)") is the only place the mapping is written down, and the copies are
 * reconciled by hand. A pinning test is the obvious next step, but a test over
 * this module alone would NOT catch the drift that matters: it would have to
 * compare fs.controller.js's inline copy against this one.
 */

const CATEGORIES = ['image', 'video', 'document', 'audio', 'archive', 'code', 'other'];

// Reconciled UPWARD to the client's type table (public/assets/js/app.js
// `FileTypes`), which was the superset: every extension the UI badges must be
// reachable by that type's filter chip. test/utils/fileTypes.test.js asserts the
// two sets are equal, so editing one side without the other fails the suite.
const EXTENSION_MAP = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic'],
    video: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'm4v'],
    audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'],
    document: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'md'],
    archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'],
    code: ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'json', 'xml', 'php', 'py', 'java', 'go', 'rs', 'sh', 'yml', 'yaml', 'sql'],
};

// Reverse index, built once. Extension keys are stored lowercase.
const EXTENSION_LOOKUP = new Map();
for (const [category, extensions] of Object.entries(EXTENSION_MAP)) {
    for (const extension of extensions) {
        EXTENSION_LOOKUP.set(extension, category);
    }
}

/**
 * Classify a regular file by name.
 *
 * @param {string} fileName - Basename of the file (not a path).
 * @returns {string} One of CATEGORIES. Falls back to 'other'.
 */
function classifyFile(fileName) {
    if (typeof fileName !== 'string') return 'other';

    // Mirror the listing's derivation exactly: extname, lowercase, drop the dot.
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex === fileName.length - 1) return 'other';

    const extension = fileName.slice(dotIndex + 1).toLowerCase();
    return EXTENSION_LOOKUP.get(extension) || 'other';
}

/**
 * A zeroed breakdown keyed by category. Folders are intentionally absent —
 * a folder has no file bytes to attribute, so it never appears in the donut.
 *
 * @returns {Object<string, number>}
 */
function emptyBreakdown() {
    const breakdown = {};
    for (const category of CATEGORIES) breakdown[category] = 0;
    return breakdown;
}

module.exports = {
    CATEGORIES,
    EXTENSION_MAP,
    classifyFile,
    emptyBreakdown,
};
