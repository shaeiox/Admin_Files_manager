// src/services/PortalService.js
'use strict';

const fs = require('fs/promises');
const path = require('path');
const AppError = require('../utils/AppError');

/**
 * The File Portal (files-server-web) seen from the admin side: the six `.env`
 * keys an administrator may edit, and the portal's JSON-lines trace log.
 *
 * PORTAL_ROOT is the portal's project directory on this host. Unset means the
 * capability is unavailable - reported as such, never as an empty config.
 * Only the whitelisted keys are ever read back; secrets in the same file
 * (AUTH_JWT_SECRET, ...) never leave this module. The portal reads its .env
 * once at startup, so a saved change applies on the portal's next restart.
 */

const intIn = (min, max) => (v) => (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max ? null : `must be a whole number from ${min} to ${max}.`);
const pathValue = (required) => (v) => (required && !v ? 'is required.' : null);

const PORTAL_KEYS = {
    FILES_ROOT: pathValue(true),
    RELEASE_PVM: pathValue(false),
    AUTH_ENABLED: (v) => (v === 'true' || v === 'false' ? null : 'must be "true" or "false".'),
    AUTH_SESSION_MINUTES: intIn(1, 10080),
    AUTH_MAX_FAILED_ATTEMPTS: intIn(1, 1000),
    AUTH_LOCKOUT_MINUTES: intIn(1, 10080),
};

const LOG_TAIL_BYTES = 512 * 1024;
const MAX_LOG_ENTRIES = 1000;

class PortalService {
    static root() {
        const raw = String(process.env.PORTAL_ROOT || '').trim();
        return raw && path.isAbsolute(raw) ? raw : null;
    }

    /** Why the portal link is unusable, or null when PORTAL_ROOT is an existing directory. */
    static async problem() {
        if (!String(process.env.PORTAL_ROOT || '').trim()) return 'PORTAL_ROOT is not set.';
        const root = PortalService.root();
        if (!root) return 'PORTAL_ROOT must be an absolute path.';
        try {
            if (!(await fs.stat(root)).isDirectory()) return 'PORTAL_ROOT must be the portal project folder (the one holding its .env), not a file.';
        } catch {
            return 'PORTAL_ROOT does not exist on this server.';
        }
        return null;
    }

    static envPath() {
        return path.join(PortalService.root(), '.env');
    }

    /** Parses `KEY=value` lines (dotenv-style quotes stripped), whitelisted keys only. */
    static parseEnv(text) {
        const values = Object.fromEntries(Object.keys(PORTAL_KEYS).map((k) => [k, '']));
        for (const line of text.split(/\r?\n/)) {
            const m = /^\s*([A-Z0-9_]+)\s*=(.*)$/.exec(line);
            if (!m || !(m[1] in PORTAL_KEYS)) continue;
            values[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
        }
        return values;
    }

    /** Rewrites each key's line in place (comments, order and other keys preserved); appends a missing key. */
    static applyEnv(text, values) {
        const eol = text.includes('\r\n') ? '\r\n' : '\n';
        const lines = text === '' ? [] : text.split(/\r?\n/);
        for (const [key, value] of Object.entries(values)) {
            const i = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
            if (i >= 0) lines[i] = `${key}=${value}`;
            else {
                if (lines.length && lines[lines.length - 1] === '') lines.pop();
                lines.push(`${key}=${value}`, '');
            }
        }
        return lines.join(eol);
    }

    /** Throws AppError(400) unless `input` carries exactly the whitelisted keys with valid string values. */
    static validate(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Body must be an object of portal settings.', 400);
        const unknown = Object.keys(input).filter((k) => !(k in PORTAL_KEYS));
        if (unknown.length) throw new AppError(`Unknown portal setting: ${unknown.join(', ')}.`, 400);
        const out = {};
        for (const [key, check] of Object.entries(PORTAL_KEYS)) {
            const v = input[key];
            if (typeof v !== 'string') throw new AppError(`${key} must be a string.`, 400);
            const value = v.trim();
            if (/[\r\n\0]/.test(value)) throw new AppError(`${key} must be a single line.`, 400);
            const problem = check(value);
            if (problem) throw new AppError(`${key} ${problem}`, 400);
            out[key] = value;
        }
        return out;
    }

    static async getConfig() {
        const reason = await PortalService.problem();
        if (reason) return { available: false, reason, values: null };
        let text = '';
        try {
            text = await fs.readFile(PortalService.envPath(), 'utf8');
        } catch (error) {
            if (error.code !== 'ENOENT') throw new AppError('The portal .env file could not be read.', 500);
        }
        return { available: true, values: PortalService.parseEnv(text) };
    }

    static async setConfig(input) {
        const values = PortalService.validate(input);
        const reason = await PortalService.problem();
        if (reason) throw new AppError(reason, 503);
        const file = PortalService.envPath();
        let text = '';
        try {
            text = await fs.readFile(file, 'utf8');
        } catch (error) {
            if (error.code !== 'ENOENT') throw new AppError('The portal .env file could not be read.', 500);
        }
        // Written IN PLACE, not temp-then-rename: a rename swaps in a new inode owned
        // by this service at umask mode, so the portal's .env (which holds
        // AUTH_JWT_SECRET) lost its owner/0640 and became world-readable. In place
        // also needs write access to this one file only - the systemd unit grants
        // exactly that, not the portal directory (ProtectSystem=strict).
        // ponytail: a crash mid-write can truncate this small file; the operator
        // re-saves from the admin page.
        try {
            await fs.writeFile(file, PortalService.applyEnv(text, values), { encoding: 'utf8', mode: 0o600 });
        } catch {
            throw new AppError('The portal .env file could not be written.', 500);
        }
        return values;
    }

    /**
     * Newest-first entries from the portal's trace (LOG_FILE, default data/portal.log).
     * Reads only the last 512 KiB, so a large log costs the same as a small one.
     */
    static async getLog(limit) {
        const reason = await PortalService.problem();
        if (reason) return { available: false, reason, entries: [] };
        const root = PortalService.root();
        const n = Math.min(Math.max(Number.parseInt(limit, 10) || 200, 1), MAX_LOG_ENTRIES);
        let handle;
        try {
            handle = await fs.open(path.join(root, 'data', 'portal.log'), 'r');
        } catch (error) {
            if (error.code === 'ENOENT') return { available: true, entries: [] };
            throw new AppError('The portal log could not be read.', 500);
        }
        try {
            const { size } = await handle.stat();
            const length = Math.min(size, LOG_TAIL_BYTES);
            const buffer = Buffer.alloc(length);
            await handle.read(buffer, 0, length, size - length);
            const lines = buffer.toString('utf8').split('\n');
            if (size > length) lines.shift(); // first line is cut mid-way
            const entries = [];
            for (let i = lines.length - 1; i >= 0 && entries.length < n; i--) {
                try { entries.push(JSON.parse(lines[i])); } catch { /* blank or partial line */ }
            }
            return { available: true, entries };
        } finally {
            await handle.close();
        }
    }
}

PortalService.PORTAL_KEYS = Object.keys(PORTAL_KEYS);

module.exports = PortalService;
