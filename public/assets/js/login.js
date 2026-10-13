/* ============================================
   LOGIN.JS — Sign-in form
   Admin Files Manager — Dimension Style

   Standalone page: no router.js (this page is reached by a real navigation,
   never an SPA swap), no sidebar. Depends only on api.js (API.post,
   API.setCsrfToken) and app.js (escapeHtml).
   ============================================ */

'use strict';

(function () {
    /**
     * Only a same-origin, root-relative path is honoured, never an absolute
     * URL — `?redirect=https://evil.example` must not be able to send a
     * successful login anywhere but this app (open-redirect guard).
     */
    function safeRedirectTarget() {
        const params = new URLSearchParams(window.location.search);
        const raw = params.get('redirect');
        if (!raw) return 'index.html';
        if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return 'index.html';
        return raw;
    }

    function showError(message) {
        const el = document.getElementById('loginError');
        if (!el) return;
        el.textContent = message;
        el.hidden = false;
    }

    function hideError() {
        const el = document.getElementById('loginError');
        if (el) el.hidden = true;
    }

    function setBusy(busy) {
        const button = document.getElementById('loginSubmit');
        if (!button) return;
        button.disabled = busy;
        button.setAttribute('aria-busy', busy ? 'true' : 'false');
    }

    async function handleSubmit(event) {
        event.preventDefault();
        hideError();

        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;
        if (!username || !password) {
            showError('Enter a username and password.');
            return;
        }

        setBusy(true);
        try {
            const result = await window.API.post('/auth/login', { username, password }, {
                skipAuthRedirect: true,
                silent: true,
            });
            window.API.setCsrfToken(result.csrfToken);
            window.location.href = safeRedirectTarget();
        } catch (error) {
            showError(error.status === 401 ? 'Invalid username or password.' : 'Could not sign in. Try again.');
        } finally {
            setBusy(false);
        }
    }

    function init() {
        const form = document.getElementById('loginForm');
        if (form) form.addEventListener('submit', handleSubmit);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
