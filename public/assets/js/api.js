/* ============================================
   API.JS — Enterprise Network Communication Layer
   Admin Files Manager — Dimension Style

   Responsibilities:
   - JSON REST (GET/POST/PUT/DELETE) via fetch
   - Multipart upload via XHR (progress + abort)
   - Binary downloads via isolated iframes / targeted forms
     (no main-frame navigation, no popup blockers, no RAM bloat)

   This module has no dependency on AFM except optional Toast on JSON errors.
   ============================================ */

'use strict';

const API = (() => {
    /** API prefix shared by all endpoints */
    const BASE_URL = '/api';

    /* ══════════════════════════════════════════
       INTERNAL: JSON REQUEST CORE
       ══════════════════════════════════════════ */

    /**
     * Core fetch wrapper for JSON APIs only.
     * Do NOT use this for binary streams (ZIP / file download).
     *
     * A rejected Error carries `status` (the HTTP status; 0 when no response
     * arrived) and, when the server supplied one, `kind` - a machine-readable
     * failure token. Callers branch on those, never on the message text.
     *
     * @param {string} endpoint - Path under BASE_URL (e.g. "/fs/list")
     * @param {RequestInit & { silent?: boolean }} options - `silent` suppresses the
     *   generic error toast, for callers that report the failure themselves.
     * @returns {Promise<any>}
     */
    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        const { silent = false, ...fetchOptions } = options;
        options = fetchOptions;
        const headers = { ...(options.headers || {}) };

        // FormData must set its own multipart boundary — never force JSON Content-Type
        if (!(options.body instanceof FormData) && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        try {
            const response = await fetch(url, { ...options, headers });

            let data = null;
            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch {
                    data = null;
                }
            } else {
                // Non-JSON error bodies still surface as text when possible
                try {
                    const text = await response.text();
                    data = text ? { error: text } : null;
                } catch {
                    data = null;
                }
            }

            if (!response.ok) {
                const errorMsg =
                    (data && (data.error || data.message)) ||
                    response.statusText ||
                    'Unknown Error';
                throw failure(errorMsg, response.status, data);
            }

            return data;
        } catch (error) {
            if (typeof error.status !== 'number') error.status = 0;
            if (!silent && window.AFM && window.AFM.Toast) {
                window.AFM.Toast.error(
                    'Network Error',
                    error.message || 'Failed to communicate with server'
                );
            }
            throw error;
        }
    }

    /**
     * Build a rejected-request Error. `kind` is copied only when the server sent
     * it as a string, so a missing token stays missing rather than guessed.
     */
    function failure(message, status, body) {
        const error = new Error(message);
        error.status = status;
        if (body && typeof body.kind === 'string' && body.kind) error.kind = body.kind;
        return error;
    }

    /* ══════════════════════════════════════════
       JSON CONVENIENCE METHODS
       ══════════════════════════════════════════ */

    const get = (endpoint, opts = {}) => request(endpoint, { ...opts, method: 'GET' });

    const post = (endpoint, body, opts = {}) =>
        request(endpoint, {
            ...opts,
            method: 'POST',
            body: body instanceof FormData ? body : JSON.stringify(body),
        });

    const put = (endpoint, body) =>
        request(endpoint, {
            method: 'PUT',
            body: body instanceof FormData ? body : JSON.stringify(body),
        });

    /**
     * DELETE with optional JSON body (used by bulk/single delete).
     * @param {string} endpoint
     * @param {object} [body]
     */
    const del = (endpoint, body) =>
        request(endpoint, {
            method: 'DELETE',
            body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        });

    /* ══════════════════════════════════════════
       UPLOAD (XHR — progress + abort)
       ══════════════════════════════════════════ */

    /**
     * Multipart upload with progress callback and abort handle.
     *
     * @param {string} endpoint
     * @param {FormData} formData
     * @param {(loaded: number, total: number) => void} [onProgress]
     * @returns {{ promise: Promise<any>, abort: () => void }}
     */
    const upload = (endpoint, formData, onProgress) => {
        const xhr = new XMLHttpRequest();
        const url = `${BASE_URL}${endpoint}`;

        const promise = new Promise((resolve, reject) => {
            xhr.open('POST', url);

            if (xhr.upload && typeof onProgress === 'function') {
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        onProgress(e.loaded, e.total);
                    }
                };
            }

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        resolve(JSON.parse(xhr.responseText));
                    } catch {
                        resolve(xhr.responseText);
                    }
                    return;
                }

                let message = xhr.statusText || 'Upload failed';
                let parsed = null;
                try {
                    parsed = JSON.parse(xhr.responseText);
                    message = parsed.error || parsed.message || message;
                } catch {
                    if (xhr.responseText) message = xhr.responseText;
                }
                // `status` and the server's optional `kind` ride along with the
                // human-readable message so callers never have to parse prose.
                reject(failure(message, xhr.status, parsed));
            };

            // No response at all: these kinds are produced here, by the transport.
            xhr.onerror = () => reject(failure('Upload failed due to network error', 0, { kind: 'network' }));
            xhr.onabort = () => reject(failure('Upload cancelled', 0, { kind: 'aborted' }));

            xhr.send(formData);
        });

        return {
            promise,
            abort: () => xhr.abort(),
        };
    };

    /* ══════════════════════════════════════════
       DOWNLOAD HELPERS — NATIVE STREAM TRIGGERS
       Why iframes / targeted forms?
       - form.submit() without target navigates the main document (reload)
       - window.open() multi-call is blocked as popups
       - fetch().blob() loads entire files into RAM and loses user-gesture context
       Isolated iframes keep the SPA alive and let the browser own the download bar.
       ══════════════════════════════════════════ */

    /**
     * Create a short-lived hidden iframe pointed at a download URL.
     * @param {string} url
     * @param {number} [ttlMs=60000]
     */
    function createDownloadIframe(url, ttlMs = 60000) {
        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        iframe.style.cssText =
            'position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
        iframe.src = url;
        document.body.appendChild(iframe);

        setTimeout(() => {
            if (iframe.parentNode) iframe.remove();
        }, ttlMs);

        return iframe;
    }

    /**
     * Download a single file via GET /api/fs/download (server streams attachment).
     * @param {string} clientPath - App path e.g. "/docs/a.pdf"
     */
    function downloadFile(clientPath) {
        if (!clientPath || typeof clientPath !== 'string') {
            throw new Error('downloadFile requires a valid client path string');
        }
        const url = `${BASE_URL}/fs/download?path=${encodeURIComponent(clientPath)}`;
        createDownloadIframe(url);
    }

    /**
     * Download multiple files as separate attachments.
     * Staggers iframe creation so Chrome/Edge can register each download.
     *
     * @param {string[]} filePaths
     * @param {{ gapMs?: number }} [options]
     */
    function downloadMultipleFiles(filePaths, options = {}) {
        if (!Array.isArray(filePaths) || filePaths.length === 0) return;

        const gapMs = typeof options.gapMs === 'number' ? options.gapMs : 400;
        const unique = [...new Set(filePaths.filter((p) => typeof p === 'string' && p))];

        unique.forEach((path, index) => {
            setTimeout(() => {
                downloadFile(path);
            }, index * gapMs);
        });
    }

    /**
     * Download many paths as one ZIP via POST /api/fs/download-zip.
     * Uses a hidden form targeted at a dedicated iframe so the SPA never navigates.
     *
     * @param {string[]} paths
     */
    function downloadZip(paths) {
        if (!Array.isArray(paths) || paths.length === 0) {
            throw new Error('downloadZip requires a non-empty paths array');
        }

        const safePaths = paths.filter((p) => typeof p === 'string' && p.length > 0);
        if (safePaths.length === 0) {
            throw new Error('downloadZip: no valid paths provided');
        }

        const token = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const iframeName = `dim_zip_${token}`;

        // Isolated navigation target — critical: prevents main-page reload
        const iframe = document.createElement('iframe');
        iframe.name = iframeName;
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        iframe.style.cssText =
            'position:fixed;width:0;height:0;border:0;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
        document.body.appendChild(iframe);

        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `${BASE_URL}/fs/download-zip`;
        form.target = iframeName;
        form.enctype = 'application/x-www-form-urlencoded';
        form.style.display = 'none';
        form.acceptCharset = 'UTF-8';

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'paths';
        // Server accepts JSON string in urlencoded body (see downloadZip controller)
        input.value = JSON.stringify(safePaths);

        form.appendChild(input);
        document.body.appendChild(form);

        // Submit while still inside the user-gesture call stack when possible
        form.submit();

        // Cleanup after the browser has started the attachment stream
        setTimeout(() => {
            if (form.parentNode) form.remove();
            if (iframe.parentNode) iframe.remove();
        }, 15000);
    }

    /* ══════════════════════════════════════════
       PUBLIC SURFACE
       ══════════════════════════════════════════ */

    return {
        BASE_URL,
        get,
        post,
        put,
        del,
        upload,
        downloadFile,
        downloadMultipleFiles,
        downloadZip,
    };
})();

window.API = API;