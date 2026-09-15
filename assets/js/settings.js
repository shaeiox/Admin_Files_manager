/* ============================================
   SETTINGS.JS — Enterprise Configuration Logic
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Settings = (() => {

    const { $, $$, Toast, Modal } = window.AFM;

    /* ══════════════════════════════════════════
       STATE
       ══════════════════════════════════════════ */

    let state = {
        config: {},     // The configuration object fetched from the server
        isDirty: false, // Tracks if any changes have been made
        isLoading: true
    };

    /* ══════════════════════════════════════════
       DATA FETCHING & HYDRATION
       ══════════════════════════════════════════ */

    async function loadSettings() {
        try {
            state.config = await window.API.get('/settings');
            hydrateForm();
        } catch (e) {
            console.warn('[Settings] Failed to fetch settings from API. Using UI fallbacks.');
            // The HTML inherently contains fallbacks in the markup, 
            // but in a strict React/Vue environment, we would render from state.
            // Here, we just let the UI remain as-is if the API is offline.
        } finally {
            state.isLoading = false;
        }
    }

    // Maps the fetched JSON data to the respective DOM inputs
    function hydrateForm() {
        if (!state.config) return;

        // General
        if (state.config.general) {
            setInputValue('workspaceName', state.config.general.workspaceName);
            setInputValue('workspaceUrl', state.config.general.workspaceUrl);
            setSelectValue('language', state.config.general.language);
            setSelectValue('timezone', state.config.general.timezone);
            setInputValue('defaultFolder', state.config.general.defaultUploadFolder);
            setCheckboxValue('autoOrganize', state.config.general.autoOrganize);
            setCheckboxValue('autoThumbnails', state.config.general.autoThumbnails);
            setCheckboxValue('deduplication', state.config.general.deduplication);
        }

        // Storage
        if (state.config.storage) {
            setSelectValue('trashRetention', state.config.storage.trashRetention);
            setSelectValue('coldStorage', state.config.storage.coldStorage);
            setCheckboxValue('autoPurgeTemp', state.config.storage.autoPurgeTemp);
        }

        // Security
        if (state.config.security) {
            setSelectValue('sessionTimeout', state.config.security.sessionTimeout);
            setCheckboxValue('virusScan', state.config.security.virusScan);
            setCheckboxValue('requirePassword', state.config.security.requirePassword);
            setCheckboxValue('watermarking', state.config.security.watermarking);
        }

        // Notifications
        if (state.config.notifications) {
            setCheckboxValue('notifUpload', state.config.notifications.uploadComplete);
            setCheckboxValue('notifStorage', state.config.notifications.storageWarning);
            setCheckboxValue('notifFailed', state.config.notifications.failedUploads);
            setCheckboxValue('notifShare', state.config.notifications.newShareLinks);
            setCheckboxValue('notifSummary', state.config.notifications.weeklySummary);
        }
    }

    // Helper functions for Hydration
    // Note: To make this robust, inputs in HTML should ideally have id="workspaceName" etc.
    // We use [name="..."] or targeted selectors if IDs aren't present.
    function setInputValue(name, value) {
        const el = document.querySelector(`input[name="${name}"]`);
        if (el && value !== undefined) el.value = value;
    }
    function setSelectValue(name, value) {
        const el = document.querySelector(`select[name="${name}"]`);
        if (el && value !== undefined) el.value = value;
    }
    function setCheckboxValue(name, value) {
        const el = document.querySelector(`input[name="${name}"][type="checkbox"]`);
        if (el && value !== undefined) el.checked = value;
    }

    /* ══════════════════════════════════════════
       SAVE / DISCARD LOGIC
       ══════════════════════════════════════════ */

    function markDirty() {
        if (state.isDirty) return;
        state.isDirty = true;
        $('#saveBar')?.classList.add('is-visible');
    }

    function markClean() {
        state.isDirty = false;
        $('#saveBar')?.classList.remove('is-visible');
    }

    // Collects current form values to send back to the server
    function extractPayload() {
        // In a real app, you'd serialize the form elements.
        // For this prototype architecture, we mock the extraction structure.
        return {
            general: {
                workspaceName: document.querySelector(`input[name="workspaceName"]`)?.value,
                workspaceUrl: document.querySelector(`input[name="workspaceUrl"]`)?.value,
                // ... gather other fields
            }
        };
    }

    async function saveChanges() {
        const btn = $('#saveChanges');
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';

        try {
            const payload = extractPayload();
            await window.API.put('/settings', payload);

            Toast.success('Settings saved', 'Your preferences have been updated on the server.');
            markClean();
        } catch (e) {
            // Error handled by API layer
        } finally {
            btn.style.pointerEvents = '';
            btn.style.opacity = '1';
        }
    }

    async function discardChanges() {
        const ok = await Modal.confirm({
            title: 'Discard changes?',
            message: 'Your unsaved edits will be lost.',
            confirmText: 'Discard',
            danger: true,
        });

        if (ok) {
            hydrateForm(); // Re-apply the last known server state
            markClean();
            Toast.info('Changes discarded');
        }
    }

    /* ══════════════════════════════════════════
       UI BINDINGS & LISTENERS
       ══════════════════════════════════════════ */

    function bindUI() {
        // 1. Pane Switcher
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

        // Deep-link support (?pane=security)
        const params = new URLSearchParams(location.search);
        const paneParam = params.get('pane');
        if (paneParam) {
            const btn = document.querySelector(`.settings-nav-item[data-pane="${paneParam}"]`);
            btn?.click();
        }

        // 2. Watch for Form Changes (To show Save Bar)
        document.addEventListener('change', e => {
            // Don't mark dirty if user is just clicking theme picker or navigation
            if (e.target.closest('.settings-content') && !e.target.closest('.theme-picker')) {
                markDirty();
            }
        });

        document.addEventListener('input', e => {
            if (e.target.matches('.settings-content input[type="text"], .settings-content textarea') && !e.target.closest('.theme-picker')) {
                markDirty();
            }
        });

        // Prevent navigation if dirty
        window.addEventListener('beforeunload', e => {
            if (state.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // 3. Save / Discard Actions
        $('#saveChanges')?.addEventListener('click', saveChanges);
        $('#discardChanges')?.addEventListener('click', discardChanges);

        // 4. Danger Zone Actions (Connected to API)
        $$('[data-danger]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-danger');

                const configs = {
                    'empty-trash': {
                        title: 'Empty trash permanently?',
                        message: 'All files in the trash will be permanently deleted from the Linux disk. This action cannot be undone.',
                        confirmText: 'Empty trash',
                    },
                    'revoke-keys': {
                        title: 'Revoke all API keys?',
                        message: 'All active API keys will be invalidated immediately. Any integration using them will stop working.',
                        confirmText: 'Revoke all',
                    },
                    'delete-workspace': {
                        title: 'Delete this workspace?',
                        message: 'This will permanently delete the server deployment and all files. There is absolutely no recovery from this action.',
                        confirmText: 'Delete forever',
                    },
                };

                const cfg = configs[action];
                if (!cfg) return;

                const ok = await Modal.confirm({
                    title: cfg.title,
                    message: cfg.message,
                    confirmText: cfg.confirmText,
                    danger: true,
                });

                if (ok) {
                    try {
                        await window.API.post('/settings/action', { action });
                        Toast.success('Action completed successfully');
                    } catch (e) {
                        // Error handled by API layer
                    }
                }
            });
        });

        // Prevent Theme Picker from bubbling and triggering dirty state
        $$('.theme-option').forEach(opt => {
            opt.addEventListener('click', e => {
                e.stopPropagation();
            }, true);
        });

        // Segmented control UI behavior
        $$('.segmented').forEach(seg => {
            seg.addEventListener('click', e => {
                const btn = e.target.closest('button');
                if (!btn || !seg.contains(btn)) return;
                seg.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b === btn));
                markDirty();
            });
        });
    }

    /* ══════════════════════════════════════════
       INIT
       ══════════════════════════════════════════ */

    function init() {
        bindUI();
        loadSettings();
    }

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page === 'settings') {
        Settings.init();
    }
});

window.Settings = Settings;