// src/services/PortalClient.js
'use strict';

const { parseServiceTokens } = require('../config/env');

/**
 * Calls the File Portal's ops endpoints (isolate-app-roots D7): the portal owns
 * its log and its access decisions, so this application asks it instead of
 * reading its files or copying its rules.
 *
 * Configured by AFM_PORTAL_URL (an origin) and AFM_PORTAL_SERVICE_TOKEN (the
 * first entry is sent). Read per call, like the token gate, so suites can switch
 * them. No redirects are followed: the token must only ever reach that origin.
 */

const TIMEOUT_MS = 3000;

/** The portal origin, or null when not linked. */
function portalUrl() {
    const raw = String(process.env.AFM_PORTAL_URL || '').trim().replace(/\/+$/, '');
    return raw || null;
}

/**
 * @param {'GET'|'POST'} method
 * @param {string} pathname  Starts with '/'.
 * @param {object} [body]
 * @returns {Promise<{ ok: true, status: number, json: any } | { ok: false, reason: string }>}
 *   ok:false means the portal could not be asked (unlinked, unreachable, refused us).
 */
async function call(method, pathname, body) {
    const base = portalUrl();
    if (!base) return { ok: false, reason: 'not linked' };
    const [token] = parseServiceTokens(process.env.AFM_PORTAL_SERVICE_TOKEN);
    try {
        const res = await fetch(base + pathname, {
            method,
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: {
                Authorization: `Bearer ${token || ''}`,
                Accept: 'application/json',
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401 || res.status === 404) {
            return { ok: false, reason: `the File Portal refused the service token (HTTP ${res.status})` };
        }
        let json = null;
        try { json = await res.json(); } catch { /* non-JSON */ }
        return { ok: true, status: res.status, json };
    } catch {
        return { ok: false, reason: 'not reachable' };
    }
}

module.exports = { call, portalUrl, TIMEOUT_MS };
