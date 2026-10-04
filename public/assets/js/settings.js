/* ============================================
   SETTINGS.JS — Settings Form
   Admin Files Manager — Dimension Style

   The page persists exactly the settings the rest of
   the application actually reads:

     general.workspaceName       → the sidebar brand (app.js)
     general.defaultUploadFolder → the Uploads page destination
     appearance.defaultView      → a fresh visit to All Files

   The theme stays browser-local in theme.js and is applied
   through that controller's delegated listener; this module
   neither owns nor intercepts it.
   ============================================ */

'use strict';

const Settings = (() => {

    const { $, $$, Toast, Modal } = window.AFM;

    /* ══════════════════════════════════════════
       FIELD TABLES — the one source of truth

       Each key maps to the section it belongs to in the
       settings document. Hydration and extraction both
       read these tables, so a control cannot be rendered
       but never sent, nor a key sent with no control
       behind it. settings.html names every control to
       match; a test asserts the two directions agree.
       ══════════════════════════════════════════ */

    // input[name="…"]
    const TEXT_FIELDS = {
        workspaceName: 'general',
        defaultUploadFolder: 'general',
    };

    // .segmented[data-name="…"] > button[data-value="…"]
    const SEGMENTED_FIELDS = {
        defaultView: 'appearance',
    };

    /* ══════════════════════════════════════════
       STATE
       ══════════════════════════════════════════ */

    let state = {
        // The last document the store gave us (or accepted). null until the
        // first GET settles, and when the store cannot be reached at all.
        config: null,
        isDirty: false,
        // Tri-state reachability of GET /api/settings:
        //   null  — the initial read is still in flight
        //   true  — the store answered; saving is possible
        //   false — the store could not be reached; nothing can be saved
        serverBacked: null,
    };

    // The controls as the markup shipped, captured before the first hydration.
    // This is what Discard restores when no server state exists to restore.
    let defaults = null;

    // Document/window listeners registered by bindUI, removed by destroy() so a
    // client-side navigation away from this page leaves nothing behind.
    let globalListeners = [];

    function listen(target, type, handler) {
        target.addEventListener(type, handler);
        globalListeners.push([target, type, handler]);
    }

    /* ══════════════════════════════════════════
       CONTROL ACCESS
       ══════════════════════════════════════════ */

    function textControl(name) {
        return document.querySelector(`input[name="${name}"]`);
    }

    function segmentedButtons(name) {
        const seg = document.querySelector(`.segmented[data-name="${name}"]`);
        return seg ? Array.from(seg.querySelectorAll('button[data-value]')) : [];
    }

    function buttonValue(btn) {
        return btn.dataset.value;
    }

    /** The active option is the one the operator picked: class for paint, aria-pressed for assistive tech. */
    function markSegmentedOption(name, active) {
        segmentedButtons(name).forEach(b => {
            const on = b === active;
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }

    function readText(name) {
        const el = textControl(name);
        const raw = el ? el.value : '';
        const trimmed = typeof raw === 'string' ? raw.trim() : '';
        // An empty field is the explicit unset state, not an empty string: the
        // store records null and the consumer falls back to its own default.
        return trimmed === '' ? null : trimmed;
    }

    function readSegmented(name) {
        const active = segmentedButtons(name).find(b => b.classList.contains('is-active'));
        return active ? buttonValue(active) : null;
    }

    function setSegmented(name, value) {
        const buttons = segmentedButtons(name);
        if (!buttons.length) return;
        // null means unset: the control falls back to the markup default, which
        // is the same fallback the consumer applies.
        const wanted = value === null || value === undefined
            ? (defaults ? defaults[name] : null)
            : String(value);
        const target = buttons.find(b => buttonValue(b) === wanted)
            || buttons.find(b => b.classList.contains('is-active'))
            || buttons[0];
        markSegmentedOption(name, target);
    }

    /* ══════════════════════════════════════════
       HYDRATION / EXTRACTION
       ══════════════════════════════════════════ */

    /** Snapshot the markup defaults, before the store has said anything. */
    function captureDefaults() {
        defaults = {};
        Object.keys(TEXT_FIELDS).forEach(name => {
            const el = textControl(name);
            defaults[name] = el ? String(el.value) : '';
        });
        Object.keys(SEGMENTED_FIELDS).forEach(name => {
            defaults[name] = readSegmented(name);
        });
    }

    function hydrateInto(config) {
        const doc = config && typeof config === 'object' ? config : {};
        Object.keys(TEXT_FIELDS).forEach(name => {
            const el = textControl(name);
            if (!el) return;
            const value = doc[TEXT_FIELDS[name]] ? doc[TEXT_FIELDS[name]][name] : null;
            el.value = value === null || value === undefined ? '' : String(value);
        });
        Object.keys(SEGMENTED_FIELDS).forEach(name => {
            const section = doc[SEGMENTED_FIELDS[name]];
            setSegmented(name, section ? section[name] : null);
        });
    }

    function applyDefaults() {
        if (!defaults) return;
        Object.keys(TEXT_FIELDS).forEach(name => {
            const el = textControl(name);
            if (el) el.value = defaults[name] || '';
        });
        Object.keys(SEGMENTED_FIELDS).forEach(name => {
            const target = segmentedButtons(name).find(b => buttonValue(b) === defaults[name]);
            markSegmentedOption(name, target || null);
        });
    }

    /**
     * The complete settings document, exactly as PUT /api/settings validates it:
     * every section, every key, no extras (an unknown key is a 400), and null for
     * every value the operator has left unset.
     */
    function extractPayload() {
        const payload = {};
        const assign = (section, key, value) => {
            if (!payload[section]) payload[section] = {};
            payload[section][key] = value;
        };
        Object.keys(TEXT_FIELDS).forEach(name => assign(TEXT_FIELDS[name], name, readText(name)));
        Object.keys(SEGMENTED_FIELDS).forEach(name => assign(SEGMENTED_FIELDS[name], name, readSegmented(name)));
        return payload;
    }

    /* ══════════════════════════════════════════
       LOADING
       ══════════════════════════════════════════ */

    async function loadSettings() {
        try {
            // silent: an unreachable store is reported once, in the page notice,
            // rather than as an error toast on every visit.
            const config = await window.API.get('/settings', { silent: true });
            state.config = config && typeof config === 'object' ? config : null;
            state.serverBacked = true;
            hydrateInto(state.config);
        } catch (e) {
            state.serverBacked = false;
            state.config = null;
            const notice = $('#settingsNotice');
            if (notice) notice.hidden = false;
            if (e && e.status !== 404) {
                Toast.error('Settings could not be loaded', (e && e.message) || 'Request failed');
            }
        }
    }

    /* ══════════════════════════════════════════
       SAVE / DISCARD
       ══════════════════════════════════════════ */

    function markDirty() {
        if (state.isDirty) return;
        state.isDirty = true;
        const bar = $('#saveBar');
        if (bar) bar.classList.add('is-visible');
    }

    function markClean() {
        state.isDirty = false;
        const bar = $('#saveBar');
        if (bar) bar.classList.remove('is-visible');
    }

    async function saveChanges() {
        // The store has not answered yet: say so rather than firing a write at an
        // endpoint whose existence is still unknown (which is how a save during
        // the initial load used to produce a bare "Network Error").
        if (state.serverBacked === null) {
            Toast.info('Still loading', 'Settings are still loading from the server, so nothing was sent. Try again in a moment.');
            return;
        }
        if (state.serverBacked === false) {
            Toast.info('Not saved', 'The settings store cannot be reached right now, so changes on this page cannot be saved.');
            return;
        }

        const btn = $('#saveChanges');
        if (btn) {
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.5';
        }

        try {
            const payload = extractPayload();
            const result = await window.API.put('/settings', payload);
            // The store answers with the document it stored, normalized (a trimmed
            // name, an empty value as the explicit unset state). Adopt it so the
            // form, Discard and the brand all speak about the same thing.
            const stored = result && typeof result === 'object' && result.settings
                ? result.settings
                : null;
            state.config = stored || payload;
            Toast.success('Settings saved', 'Your preferences were stored on the server.');
            markClean();
            if (stored) hydrateInto(stored);
            // The sidebar brand is shared chrome: apply the new name in place so
            // the rename is visible without a reload. The hook is optional — the
            // page must not depend on it to be correct.
            window.AFM.applyWorkspaceName?.(state.config.general ? state.config.general.workspaceName : null);
        } catch (e) {
            // api.js reports the failure; nothing is marked saved and the edits stay.
        } finally {
            if (btn) {
                btn.style.pointerEvents = '';
                btn.style.opacity = '1';
            }
        }
    }

    async function discardChanges() {
        const ok = await Modal.confirm({
            title: 'Discard changes?',
            message: 'Your unsaved edits will be lost.',
            confirmText: 'Discard',
            danger: true,
        });

        if (!ok) return;

        if (state.config) {
            // Restore what the store last returned, and say so.
            hydrateInto(state.config);
            markClean();
            Toast.info('Changes discarded', 'The controls were restored to the last settings the server returned.');
        } else {
            // No server state exists to restore. Resetting to the markup defaults
            // is a local operation; claiming edits were "discarded" against a
            // store that never answered would describe something that did not happen.
            applyDefaults();
            markClean();
            Toast.info('Edits cleared', 'The controls were reset to their defaults. Nothing was saved — no settings store answered.');
        }
    }

    /* ══════════════════════════════════════════
       UI BINDINGS & LISTENERS
       ══════════════════════════════════════════ */

    /** True only for a control the payload covers, so a stray event cannot dirty the page. */
    function isCoveredControl(target) {
        if (!target) return false;
        if (typeof target.name === 'string' && Object.prototype.hasOwnProperty.call(TEXT_FIELDS, target.name)) {
            return true;
        }
        const seg = typeof target.closest === 'function' ? target.closest('.segmented') : null;
        return !!(seg && seg.dataset && Object.prototype.hasOwnProperty.call(SEGMENTED_FIELDS, seg.dataset.name));
    }

    function bindUI() {
        // 1. Pane Switcher — every nav entry has a pane in the markup.
        $$('.settings-nav-item[data-pane]').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-pane');
                $$('.settings-nav-item').forEach(b => b.classList.toggle('is-active', b === btn));
                $$('.settings-pane').forEach(p => {
                    p.classList.toggle('is-active', p.getAttribute('data-pane-content') === target);
                });

                // Scroll into view on mobile
                if (window.innerWidth <= 860) {
                    document.querySelector('.settings-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });

        // Deep-link support (?pane=…). The value is compared, never interpolated
        // into a selector. A pane that no longer exists is ignored and General —
        // the pane the markup opens on — stays visible.
        const paneParam = new URLSearchParams(location.search).get('pane');
        if (paneParam) {
            $$('.settings-nav-item[data-pane]')
                .find(b => b.getAttribute('data-pane') === paneParam)
                ?.click();
        }

        // 2. Watch the covered controls. A button (a theme card, a pane entry, a
        //    segmented option) fires neither change nor input, and an event from
        //    a control outside the payload is ignored — so neither can mark the
        //    page dirty on its own.
        listen(document, 'change', e => {
            if (isCoveredControl(e.target)) markDirty();
        });

        listen(document, 'input', e => {
            if (isCoveredControl(e.target)) markDirty();
        });

        // 3. Prevent a hard navigation from losing edits
        listen(window, 'beforeunload', e => {
            if (state.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // 4. Segmented controls. Re-selecting the active option is not a change,
        //    so it does not make the page dirty.
        $$('.segmented').forEach(seg => {
            seg.addEventListener('click', e => {
                const btn = e.target.closest('button[data-value]');
                if (!btn || !seg.contains(btn)) return;
                const wasActive = btn.classList.contains('is-active');
                seg.querySelectorAll('button[data-value]').forEach(b => {
                    const on = b === btn;
                    b.classList.toggle('is-active', on);
                    b.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
                if (!wasActive) markDirty();
            });
        });

        // 5. Save / Discard actions
        $('#saveChanges')?.addEventListener('click', saveChanges);
        $('#discardChanges')?.addEventListener('click', discardChanges);
    }

    /* ══════════════════════════════════════════
       INIT
       ══════════════════════════════════════════ */

    function init() {
        state.config = null;
        state.isDirty = false;
        state.serverBacked = null;
        captureDefaults();
        bindUI();
        loadSettings();
        // The topbar bell belongs to the shared notifications module.
        if (window.AFM && AFM.Notifications) AFM.Notifications.bindTopbarBell();
    }

    /** Client-side navigation away: drop the document/window listeners. */
    function destroy() {
        globalListeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler));
        globalListeners = [];
    }

    /** A client-side navigation cannot use beforeunload; ask before dropping edits. */
    async function beforeLeave() {
        if (!state.isDirty) return true;
        return Modal.confirm({
            title: 'Leave without saving?',
            message: 'Your unsaved edits on this page will be lost.',
            confirmText: 'Leave',
            danger: true,
        });
    }

    return { init, destroy, beforeLeave };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page === 'settings') {
        Settings.init();
    }
});

window.Settings = Settings;