// src/controllers/dashboard.controller.js
'use strict';

const FileSystemService = require('../services/FileSystemService');
const MetadataService = require('../services/MetadataService');
const { CATEGORIES } = require('../utils/fileTypes');

/**
 * Dashboard aggregation.
 *
 * No DashboardService exists by design: the controller composes existing services
 * directly, matching the established idiom in fs.controller.js. DTO shaping lives
 * here and ONLY here - services return raw values and never shape a response.
 *
 * Response shape is BARE (no `{success, data}` envelope), following the existing
 * convention for read-only aggregate endpoints: GET /api/fs/tree returns a bare
 * array and GET /api/fs/list a bare object, while all four mutating handlers use
 * the envelope.
 */

/**
 * Donut colours, by taxonomy key. Values are CSS colours, never class names.
 */
const BREAKDOWN_COLORS = {
    image: '#3b82f6',
    video: '#8b5cf6',
    document: '#ef4444',
    audio: '#10b981',
    archive: '#f59e0b',
    code: '#06b6d4',
    other: '#64748b',
};

const TOP_FILES_LIMIT = 5;
const ACTIVITY_LIMIT = 8;
const GIGABYTE = 1e9;

/**
 * Build the `stats` array from real aggregates.
 *
 * Every `value` is a raw JSON number and may legitimately be 0 - a count of zero is
 * a real reading, not a placeholder. Every entry declares its own `unit`
 * ('count' | 'bytes' | 'GB') so the client never has to infer it from the key.
 * There is no trend field: the application retains no
 * history, so `trendAvailable` is always false and no numeric delta is emitted.
 */
function buildStats(tree, volume) {
    const stats = [
        // value is the TRUE reading, including 0. An empty root reports 0 files,
        // 0 folders and 0 bytes - it does NOT report 1 of each.
        { key: 'files', label: 'Total files', icon: 'file', unit: 'count', value: tree.files },
        { key: 'folders', label: 'Total folders', icon: 'folder', unit: 'count', value: tree.folders },
        { key: 'treeBytes', label: 'Storage used', icon: 'database', unit: 'bytes', value: tree.treeBytes },
    ];

    // Volume usage is only shown when the platform actually reported it.
    if (volume.volumeAvailable && volume.totalBytes !== null) {
        const usedGb = volume.usedBytes / GIGABYTE;
        const totalGb = volume.totalBytes / GIGABYTE;
        stats.push({
            key: 'volume',
            label: 'Volume used',
            icon: 'hardDrive',
            // Rounded for display; 0 GB used is a real reading, not a placeholder.
            // Full precision remains available in storage.usedBytes / totalBytes.
            value: Math.round(usedGb),
            unit: 'GB',
            totalGb: Math.round(totalGb),
        });
    }

    return stats.map((stat) => ({ ...stat, trendAvailable: false }));
}

/**
 * Convert the service breakdown into the donut payload.
 *
 * The renderer appends a literal " GB" suffix to a compact-formatted number and
 * performs no byte conversion, so this one field is delivered in gigabytes.
 * Every other byte quantity in the contract stays in bytes.
 */
function buildStorageBreakdown(breakdown) {
    // Filter on RAW BYTES, never on the converted value. Filtering on a rounded
    // GB figure would silently drop every category below ~1 MB, leaving a real
    // but small tree rendering as a completely empty donut.
    const rows = CATEGORIES
        .map((key) => {
            const bytes = breakdown[key] || 0;
            return {
                key,
                label: key.charAt(0).toUpperCase() + key.slice(1),
                bytes,
                // 6dp so a few kilobytes do not round away to exactly zero.
                valueGb: Math.round((bytes / GIGABYTE) * 1e6) / 1e6,
                color: BREAKDOWN_COLORS[key] || BREAKDOWN_COLORS.other,
            };
        })
        .filter((row) => row.bytes > 0);

    const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
    return rows.map((row) => ({
        ...row,
        percentage: totalBytes > 0
            ? Math.round((row.bytes / totalBytes) * 1000) / 10
            : 0,
    }));
}

/**
 * GET /api/dashboard/summary
 *
 * Degrades per capability and still answers 200: an unreadable tree, an
 * unavailable capacity reading, or an unreadable metadata store each remove only
 * their own contribution. No capability is allowed to fail the whole response.
 */
async function getSummary(req, res, next) {
    try {
        // Filesystem and metadata sources are aggregated SEPARATELY on purpose.
        // A metadata-store failure must not discard the filesystem figures, which
        // are independently obtainable - see the approved per-capability
        // degradation contract (A7).
        const [tree, volume] = await Promise.all([
            FileSystemService.getTreeStats('/'),
            FileSystemService.getVolumeStats('/'),
        ]);

        let activities = [];
        let rawTopFiles = [];
        try {
            [activities, rawTopFiles] = await Promise.all([
                MetadataService.getActivities(ACTIVITY_LIMIT),
                MetadataService.getTopDownloads(TOP_FILES_LIMIT),
            ]);
        } catch {
            // Metadata unavailable: degrade these two collections to empty and
            // keep the rest of the response. MetadataService._read throws for a
            // corrupt or unreadable store; that must not become a 500 here.
            activities = [];
            rawTopFiles = [];
        }

        // Drop metadata whose file no longer exists, then recompute the maximum
        // over what actually survives. Filesystem access belongs to a service.
        const topFiles = await FileSystemService.retainExisting(rawTopFiles);

        return res.json({
            stats: buildStats(tree, volume),
            storage: {
                treeBytes: tree.treeBytes,
                usedBytes: volume.volumeAvailable ? volume.usedBytes : null,
                totalBytes: volume.volumeAvailable ? volume.totalBytes : null,
                volumeAvailable: volume.volumeAvailable,
                truncated: tree.truncated,
            },
            storageBreakdown: buildStorageBreakdown(tree.breakdown),
            activities,
            topFiles,
            health: FileSystemService.getHealthMetrics(),
        });
    } catch (error) {
        return next(error);
    }
}

/**
 * GET /api/dashboard/health
 *
 * Separate from GET /api/health, which remains the liveness/environment endpoint.
 * This one returns dashboard-scoped runtime metrics as a bare array.
 */
async function getHealth(req, res, next) {
    try {
        return res.json(FileSystemService.getHealthMetrics());
    } catch (error) {
        return next(error);
    }
}

module.exports = { getSummary, getHealth };
