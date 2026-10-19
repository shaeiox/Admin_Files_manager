/* ============================================
   API.JS — Enterprise Network Communication Layer
   Admin Files Manager — Dimension Style

   Responsibilities:
   - JSON REST (GET/POST/PUT/DELETE) via fetch
   - Multipart upload and resumable chunk appends via XHR (progress + abort)
   - Binary downloads via isolated iframes / targeted forms
     (no main-frame navigation, no popup blockers, no RAM bloat)

   This module has no dependency on AFM except optional Toast on JSON errors.
   ============================================ */

'use strict';

const API = (() => {
    /** The same-origin versioned default (ADR-007). */
    const DEFAULT_BASE_URL = '/api/v1';

    /**
     * API prefix shared by all endpoints, resolved ONCE at load so every URL a
     * document builds points at the same place. First non-blank source wins:
     *   1. window.AFM_API_BASE - a global set before this script loads
     *   2. <meta name="afm-api-base" content="..."> in the page head
     *   3. DEFAULT_BASE_URL
     * Values are trimmed and trailing slashes stripped, so a path appended to it
     * always has exactly one separator. This module is the only place that knows
     * where the API lives; consumers pass endpoint paths, never URLs.
     */
    const BASE_URL = (() => {
        const clean = (value) =>
            (typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '');

        const fromGlobal = clean(window.AFM_API_BASE);
        if (fromGlobal) return fromGlobal;

        const meta = typeof document !== 'undefined' && typeof document.querySelector === 'function'
            ? document.querySelector('meta[name="afm-api-base"]')
            : null;
        const fromMeta = clean(meta && meta.getAttribute('content'));
        if (fromMeta) return fromMeta;

        return DEFAULT_BASE_URL;
    })();

    /* ══════════════════════════════════════════
       SESSION STATE (ADR-009, access-refresh-session-tokens)
       The access and refresh tokens live in HttpOnly cookies the browser
       already sends automatically - this module never touches them. The CSRF token is NOT a secret (it is useless without that
       cookie), but it must be attached to every mutating request by hand, so
       it is kept here, the one place that builds every request.
       ══════════════════════════════════════════ */

    let csrfToken = null;
    const SAFE_METHODS = new Set(['GET', 'HEAD']);

    /** Set after a successful login or an `/auth/me` refresh. Never persisted - a reload re-fetches it. */
    function setCsrfToken(token) {
        csrfToken = typeof token === 'string' && token ? token : null;
    }

    function clearCsrfToken() {
        csrfToken = null;
    }

    /**
     * A 401 means the session is missing or expired - every page but the
     * login page itself redirects there, preserving the page the caller was
     * trying to reach. The login form's own request passes
     * `skipAuthRedirect` so a wrong-password 401 shows an inline error
     * instead of bouncing the user to the page they are already on.
     */
    function redirectToLogin() {
        if (/\blogin\.html$/.test(window.location.pathname)) return;
        const dest = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `login.html?redirect=${dest}`;
    }

    /* ══════════════════════════════════════════
       DEVICE KEY + RENEWAL (access-refresh-session-tokens D5/D8)
       A non-extractable ECDSA P-256 key, generated once and kept in
       IndexedDB (a CryptoKey is structured-cloneable; localStorage cannot
       hold it). Its public half is pinned on the session at login; every
       refresh carries a DPoP proof signed by it. A key regenerated per load
       would have a new thumbprint and be refused, so it must persist.
       ══════════════════════════════════════════ */

    const DPOP_DB = 'afm-dpop';
    const DPOP_STORE = 'keys';
    const DPOP_KEY_ID = 'device';
    let deviceKeyPromise = null;
    let renewing = null;

    function keyStore(mode, operate) {
        return new Promise((resolve, reject) => {
            const open = indexedDB.open(DPOP_DB, 1);
            open.onupgradeneeded = () => open.result.createObjectStore(DPOP_STORE);
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
                const db = open.result;
                const tx = db.transaction(DPOP_STORE, mode);
                const req = operate(tx.objectStore(DPOP_STORE));
                tx.oncomplete = () => { db.close(); resolve(req.result); };
                tx.onerror = () => { db.close(); reject(tx.error); };
            };
        });
    }

    /** The persisted device keypair, generated only when none is stored. */
    function deviceKey() {
        if (!deviceKeyPromise) {
            deviceKeyPromise = (async () => {
                const stored = await keyStore('readonly', (store) => store.get(DPOP_KEY_ID));
                if (stored) return stored;
                const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
                await keyStore('readwrite', (store) => store.put(pair, DPOP_KEY_ID));
                return pair;
            })();
            deviceKeyPromise.catch(() => { deviceKeyPromise = null; });
        }
        return deviceKeyPromise;
    }

    function b64url(bytes) {
        let binary = '';
        for (const b of bytes) binary += String.fromCharCode(b);
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    const b64urlJson = (value) => b64url(new TextEncoder().encode(JSON.stringify(value)));

    /**
     * The public JWK sent once with the login body, or null where WebCrypto or
     * IndexedDB is unavailable (e.g. a plain-HTTP origin): that session still
     * works but cannot renew, so it ends when its access token does.
     */
    async function devicePublicJwk() {
        try {
            const { kty, crv, x, y } = await crypto.subtle.exportKey('jwk', (await deviceKey()).publicKey);
            return { kty, crv, x, y };
        } catch {
            return null;
        }
    }

    /** A DPoP proof (compact JWS, ES256) for one request; `htu` is the path only. */
    async function dpopProof(method, url) {
        const pair = await deviceKey();
        const jwk = await devicePublicJwk();
        const header = b64urlJson({ typ: 'dpop+jwt', alg: 'ES256', jwk });
        const payload = b64urlJson({
            htm: method,
            htu: new URL(url, window.location.href).pathname,
            iat: Math.floor(Date.now() / 1000),
            jti: crypto.randomUUID(),
        });
        const signature = await crypto.subtle.sign(
            { name: 'ECDSA', hash: 'SHA-256' }, pair.privateKey, new TextEncoder().encode(`${header}.${payload}`));
        return `${header}.${payload}.${b64url(new Uint8Array(signature))}`;
    }

    /**
     * Single-flight renewal: concurrent 401s share ONE refresh, because N
     * refreshes would rotate N times. Resolves true when a new access cookie
     * was issued; never rejects.
     */
    function renewSession() {
        if (!renewing) {
            renewing = (async () => {
                const url = `${BASE_URL}/auth/refresh`;
                const response = await fetch(url, { method: 'POST', headers: { DPoP: await dpopProof('POST', url) } });
                if (!response.ok) return false;
                const data = await response.json().catch(() => null);
                if (data && data.csrfToken) setCsrfToken(data.csrfToken);
                return true;
            })().catch(() => false).finally(() => { renewing = null; });
        }
        return renewing;
    }

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
     * A 401 first tries one session renewal and, on success, replays the call
     * once; only a failed renewal (or a 401 on the replay) goes to login.
     *
     * @param {RequestInit & { silent?: boolean, skipAuthRedirect?: boolean }} options -
     *   `silent` suppresses the generic error toast, for callers that report the
     *   failure themselves. `skipAuthRedirect` suppresses the renewal and the
     *   401-redirect-to-login behavior, for the login request itself.
     * @returns {Promise<any>}
     */
    async function request(endpoint, options = {}) {
        const url = `${BASE_URL}${endpoint}`;
        const original = options;
        const { silent = false, skipAuthRedirect = false, renewed = false, ...fetchOptions } = options;
        options = fetchOptions;
        const headers = { ...(options.headers || {}) };

        // FormData must set its own multipart boundary — never force JSON Content-Type
        if (!(options.body instanceof FormData) && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const method = (options.method || 'GET').toUpperCase();
        if (!SAFE_METHODS.has(method) && csrfToken && !headers['X-CSRF-Token']) {
            headers['X-CSRF-Token'] = csrfToken;
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
                if (response.status === 401 && !skipAuthRedirect) {
                    // Renew once and replay once; the replay carries `renewed`
                    // so a second 401 goes to login instead of looping. Returned, not
                    // awaited: the replay reports its own failure, never twice.
                    if (!renewed && await renewSession()) {
                        return request(endpoint, { ...original, renewed: true });
                    }
                    clearCsrfToken();
                    redirectToLogin();
                }
                const errorMsg =
                    (data && (data.error || data.message)) ||
                    response.statusText ||
                    'Unknown Error';
                throw failure(errorMsg, response.status, data);
            }

            return data;
        } catch (error) {
            if (typeof error.status !== 'number') error.status = 0;
            if (!silent && error.status !== 401 && window.AFM && window.AFM.Toast) {
                window.AFM.Toast.error(
                    'Network Error',
                    error.message || 'Failed to communicate with server'
                );
            }
            throw error;
        }
    }

    /**
     * Build a rejected-request Error. `kind` (and the session protocol's
     * `receivedBytes`, where the server sends it) are copied only when present,
     * so a missing value stays missing rather than guessed.
     */
    function failure(message, status, body) {
        const error = new Error(message);
        error.status = status;
        if (body && typeof body.kind === 'string' && body.kind) error.kind = body.kind;
        if (body && typeof body.receivedBytes === 'number' && Number.isFinite(body.receivedBytes)) {
            error.receivedBytes = body.receivedBytes;
        }
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

    const put = (endpoint, body, opts = {}) =>
        request(endpoint, {
            ...opts,
            method: 'PUT',
            body: body instanceof FormData ? body : JSON.stringify(body),
        });

    /**
     * DELETE with optional JSON body (used by bulk/single delete).
     * @param {string} endpoint
     * @param {object} [body]
     */
    const del = (endpoint, body, opts = {}) =>
        request(endpoint, {
            ...opts,
            method: 'DELETE',
            body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        });

    /* ══════════════════════════════════════════
       UPLOAD (XHR — progress + abort)
       ══════════════════════════════════════════ */

    /**
     * XHR request carrying a binary body (a multipart FormData or one raw
     * resumable chunk), with upload progress and an abort handle. BOTH binary
     * transports are built here so the CSRF header, the 401 renewal and the
     * status/kind failure contract live in one place - what `request()` is for
     * JSON.
     *
     * @param {'POST'|'PUT'} method
     * @param {string} endpoint
     * @param {FormData|Blob} body
     * @param {{ contentType?: string|null, onProgress?: (loaded: number, total: number) => void }} [options]
     * @returns {{ promise: Promise<any>, abort: () => void }}
     */
    const sendBinary = (method, endpoint, body, { contentType = null, onProgress } = {}) => {
        const xhr = new XMLHttpRequest();
        const url = `${BASE_URL}${endpoint}`;

        const promise = new Promise((resolve, reject) => {
            xhr.open(method, url);
            // FormData must set its own multipart boundary; a raw chunk declares
            // itself as opaque bytes.
            if (contentType) xhr.setRequestHeader('Content-Type', contentType);
            if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);

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

                // An upload is not replayed (the caller retries it); a 401
                // still renews the session so that retry can succeed.
                if (xhr.status === 401) {
                    renewSession().then((ok) => {
                        if (!ok) {
                            clearCsrfToken();
                            redirectToLogin();
                        }
                    });
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

            xhr.send(body);
        });

        return {
            promise,
            abort: () => xhr.abort(),
        };
    };

    /**
     * Multipart upload with progress callback and abort handle.
     *
     * @param {string} endpoint
     * @param {FormData} formData
     * @param {(loaded: number, total: number) => void} [onProgress]
     * @returns {{ promise: Promise<any>, abort: () => void }}
     */
    const upload = (endpoint, formData, onProgress) =>
        sendBinary('POST', endpoint, formData, { onProgress });

    /* ══════════════════════════════════════════
       RESUMABLE UPLOAD SESSIONS (ADR-011)
       The one place every session URL is built: consumers pass a session id,
       never a URL. `initiate`, `status`, `complete` and `abort` are JSON calls
       (CSRF and error kinds handled by `request()`); `append` streams one raw
       chunk through `sendBinary` so it keeps upload progress and an abort
       handle.
       ══════════════════════════════════════════ */

    const sessionPath = (id) => `/fs/uploads/${encodeURIComponent(id)}`;

    const uploadSession = Object.freeze({
        /** Open or adopt the session for one file; answers {sessionId, receivedBytes, expiresAt}. */
        initiate: (body) => post('/fs/uploads', body),
        /** The server's own reading of a session (bare read): {receivedBytes, state, ...}. */
        status: (id) => get(sessionPath(id)),
        /** Append exactly one chunk at the server's stored size. */
        append: (id, offset, chunk, onProgress) => sendBinary(
            'PUT',
            `${sessionPath(id)}/chunk?offset=${encodeURIComponent(offset)}`,
            chunk,
            { contentType: 'application/octet-stream', onProgress }
        ),
        /** Place the file once every declared byte is stored; answers {path}. */
        complete: (id, body) => post(`${sessionPath(id)}/complete`, body || {}),
        /** Abandon the session; its staged bytes are discarded. */
        abort: (id) => del(sessionPath(id)),
    });

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

        // A <form> POST cannot set a custom header, so the CSRF token rides
        // as a body field instead (ADR-009; csrf.js accepts either). Only a
        // same-origin page that already has the token can set this field.
        if (csrfToken) {
            const csrfInput = document.createElement('input');
            csrfInput.type = 'hidden';
            csrfInput.name = 'csrfToken';
            csrfInput.value = csrfToken;
            form.appendChild(csrfInput);
        }

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
       IMAGE URLS
       An <img src> cannot go through fetch, so the boundary hands out the URL
       instead - consumers never concatenate BASE_URL themselves.
       ══════════════════════════════════════════ */

    /**
     * URL of a bounded preview image (GET /fs/thumbnail).
     * @param {string} clientPath - App path e.g. "/media/a.png"
     * @param {number|string} size - Requested edge length in px
     * @returns {string}
     */
    function thumbnailUrl(clientPath, size) {
        return `${BASE_URL}/fs/thumbnail?path=${encodeURIComponent(clientPath)}&size=${encodeURIComponent(size)}`;
    }

    /* ══════════════════════════════════════════
       PUBLIC SURFACE
       Frozen: BASE_URL is resolved once and cannot be repointed mid-document.
       ══════════════════════════════════════════ */

    return Object.freeze({
        BASE_URL,
        get,
        post,
        put,
        del,
        upload,
        uploadSession,
        downloadFile,
        downloadMultipleFiles,
        downloadZip,
        thumbnailUrl,
        setCsrfToken,
        clearCsrfToken,
        redirectToLogin,
        devicePublicJwk,
    });
})();

window.API = API;