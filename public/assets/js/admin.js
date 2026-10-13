/* ============================================
   ADMIN.JS — User management + file access policies (ADR-009 phase 2)
   Admin Files Manager — Dimension Style

   Every dynamic value rendered here goes through escapeHtml before it
   reaches innerHTML (AGENTS.md rule 10) - usernames and paths come from an
   operator-controlled store, exactly like filenames do on the Files page.
   ============================================ */

'use strict';

const Admin = (() => {

    const { $, $$, Toast, Modal, escapeHtml, icon } = window.AFM;

    /* ══════════════════════════════════════════
       STATE
       ══════════════════════════════════════════ */

    let state = {
        users: [],
        policies: [],
        selectedPolicyPath: null,
    };

    // document/window listeners registered here, removed by destroy() so a
    // client-side navigation away from this page leaves nothing behind
    // (settings.js's pattern - elements inside .main-area die with the DOM
    // router.js replaces, so only document/window listeners need tracking).
    let globalListeners = [];

    function listen(target, type, handler) {
        target.addEventListener(type, handler);
        globalListeners.push([target, type, handler]);
    }

    /* ══════════════════════════════════════════
       ADMIN-ONLY GATE
       ══════════════════════════════════════════ */

    function showAdminNotice(message) {
        const notice = document.getElementById('adminNotice');
        const text = document.getElementById('adminNoticeText');
        if (text) text.textContent = message;
        if (notice) notice.hidden = false;
    }

    function hideAdminNotice() {
        const notice = document.getElementById('adminNotice');
        if (notice) notice.hidden = true;
    }

    /* ══════════════════════════════════════════
       USERS
       ══════════════════════════════════════════ */

    async function loadUsers() {
        try {
            state.users = await window.API.get('/admin/users', { silent: true });
            hideAdminNotice();
            renderUsersTable();
            populateGrantUserSelect();
        } catch (error) {
            if (error.status === 403) {
                showAdminNotice('You are signed in, but this account does not have administrator access.');
            }
            state.users = [];
            renderUsersTable();
        }
    }

    function renderUsersTable() {
        const body = document.getElementById('usersTableBody');
        if (!body) return;

        if (state.users.length === 0) {
            body.innerHTML = '<tr class="admin-table-empty"><td colspan="5">No accounts yet.</td></tr>';
            return;
        }

        body.innerHTML = state.users.map((user) => {
            const created = user.created_at ? new Date(user.created_at).toLocaleString() : '—';
            const name = escapeHtml(user.username);
            const roleBadge = user.role === 'admin'
                ? '<span class="admin-badge">Admin</span>'
                : '<span class="admin-badge is-muted">User</span>';
            const statusBadge = user.status === 'active'
                ? '<span class="admin-badge admin-badge-ok">Active</span>'
                : '<span class="admin-badge is-muted">Disabled</span>';
            const isActive = user.status === 'active';
            const toggleStatus = isActive ? 'disabled' : 'active';
            const toggleLabel = isActive ? 'Disable account' : 'Enable account';
            const toggleIcon = isActive ? 'userX' : 'userCheck';

            // Icon buttons with a data-tip label (house convention, AGENTS.md
            // 10a: row actions inside a scroll container use data-tip-pos="bottom"
            // so the tip opens downward, never clipping against the table header).
            // Delete is visually distinct (admin-danger-icon) - a destructive,
            // irreversible action must not look identical to the others.
            return `
                <tr${!isActive ? ' class="admin-row-disabled"' : ''} data-user-id="${user.id}">
                    <td>${name}</td>
                    <td>${roleBadge}</td>
                    <td>${statusBadge}</td>
                    <td>${escapeHtml(created)}</td>
                    <td class="admin-row-actions">
                        <button class="btn-icon btn-icon-sm" data-action="toggle-status" data-status="${toggleStatus}" data-id="${user.id}" data-username="${name}" data-tip="${toggleLabel}" data-tip-pos="bottom" aria-label="${toggleLabel} for ${name}">
                            ${icon(toggleIcon, 15)}
                        </button>
                        <button class="btn-icon btn-icon-sm" data-action="reset-password" data-id="${user.id}" data-username="${name}" data-tip="Reset password" data-tip-pos="bottom" aria-label="Reset password for ${name}">
                            ${icon('key', 15)}
                        </button>
                        <button class="btn-icon btn-icon-sm" data-action="revoke-sessions" data-id="${user.id}" data-username="${name}" data-tip="Revoke sessions" data-tip-pos="bottom" aria-label="Revoke sessions for ${name}">
                            ${icon('logout', 15)}
                        </button>
                        <button class="btn-icon btn-icon-sm admin-danger-icon" data-action="delete-user" data-id="${user.id}" data-username="${name}" data-tip="Delete account" data-tip-pos="bottom" aria-label="Delete account for ${name}">
                            ${icon('trash', 15)}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function populateGrantUserSelect() {
        const select = document.getElementById('grantUserId');
        if (!select) return;
        select.innerHTML = state.users.map((u) =>
            `<option value="${u.id}">${escapeHtml(u.username)}</option>`
        ).join('');
    }

    async function handleCreateUser(event) {
        event.preventDefault();
        const errorEl = document.getElementById('createUserError');
        errorEl.hidden = true;

        const username = document.getElementById('newUsername').value.trim();
        const password = document.getElementById('newPassword').value;
        const role = document.getElementById('newRole').value;

        try {
            await window.API.post('/admin/users', { username, password, role }, { silent: true });
            Toast.success('User created', `"${username}" can now sign in.`);
            event.target.reset();
            await loadUsers();
        } catch (error) {
            errorEl.textContent = error.message || 'Could not create the user.';
            errorEl.hidden = false;
        }
    }

    async function handleToggleStatus(id, username, nextStatus) {
        const confirmed = await Modal.confirm({
            title: nextStatus === 'disabled' ? 'Disable this account?' : 'Enable this account?',
            message: nextStatus === 'disabled'
                ? `"${escapeHtml(username)}" will be signed out immediately and unable to sign back in.`
                : `"${escapeHtml(username)}" will be able to sign in again.`,
            confirmText: nextStatus === 'disabled' ? 'Disable' : 'Enable',
            danger: nextStatus === 'disabled',
        });
        if (!confirmed) return;

        try {
            await window.API.post(`/admin/users/${id}/status`, { status: nextStatus });
            Toast.success('Updated', `"${username}" is now ${nextStatus}.`);
            await loadUsers();
        } catch (error) {
            Toast.error('Could not update account', error.message);
        }
    }

    async function handleResetPassword(id, username) {
        const password = await Modal.prompt({
            title: `Reset password for "${escapeHtml(username)}"`,
            label: 'New password',
            placeholder: 'At least 8 characters',
            confirmText: 'Reset',
        });
        if (!password) return;

        try {
            await window.API.post(`/admin/users/${id}/reset-password`, { password });
            Toast.success('Password reset', `"${username}"'s existing sessions were revoked.`);
        } catch (error) {
            Toast.error('Could not reset password', error.message);
        }
    }

    async function handleRevokeSessions(id, username) {
        try {
            await window.API.post(`/admin/users/${id}/revoke-sessions`, {});
            Toast.success('Sessions revoked', `"${username}" was signed out everywhere.`);
        } catch (error) {
            Toast.error('Could not revoke sessions', error.message);
        }
    }

    async function handleDeleteUser(id, username) {
        const confirmed = await Modal.confirm({
            title: 'Delete this account?',
            message: `"${escapeHtml(username)}" will be permanently deleted. This cannot be undone.`,
            confirmText: 'Delete',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await window.API.del(`/admin/users/${id}`);
            Toast.success('Deleted', `"${username}" was removed.`);
            await loadUsers();
        } catch (error) {
            Toast.error('Could not delete account', error.message);
        }
    }

    /* ══════════════════════════════════════════
       FILE ACCESS POLICIES
       ══════════════════════════════════════════ */

    async function loadPolicies() {
        try {
            state.policies = await window.API.get('/admin/files/policies', { silent: true });
            renderPoliciesTable();
        } catch (error) {
            state.policies = [];
            renderPoliciesTable();
        }
    }

    function renderPoliciesTable() {
        const body = document.getElementById('policiesTableBody');
        if (!body) return;

        if (state.policies.length === 0) {
            body.innerHTML = '<tr class="admin-table-empty"><td colspan="6">No files have a policy yet.</td></tr>';
            return;
        }

        body.innerHTML = state.policies.map((policy) => {
            const pathEsc = escapeHtml(policy.client_path);
            const publishedBadge = policy.is_published
                ? '<span class="admin-badge admin-badge-ok">Published</span>'
                : '<span class="admin-badge is-muted">Unpublished</span>';
            const lockedBadge = policy.is_locked
                ? '<span class="admin-badge admin-badge-warn">Locked</span>'
                : '<span class="admin-badge is-muted">Unlocked</span>';
            return `
                <tr data-policy-path="${pathEsc}">
                    <td class="admin-path-cell">${pathEsc}</td>
                    <td><span class="admin-badge">${escapeHtml(policy.access_mode)}</span></td>
                    <td>${publishedBadge}</td>
                    <td>${lockedBadge}</td>
                    <td class="admin-row-actions">
                        <button class="btn-icon btn-icon-sm" data-action="edit-policy" data-path="${pathEsc}" data-tip="Edit policy" data-tip-pos="bottom" aria-label="Edit policy for ${pathEsc}">
                            ${icon('edit', 15)}
                        </button>
                        <button class="btn-icon btn-icon-sm" data-action="manage-permissions" data-path="${pathEsc}" data-tip="Manage permissions" data-tip-pos="bottom" aria-label="Manage permissions for ${pathEsc}">
                            ${icon('userCheck', 15)}
                        </button>
                        <button class="btn-icon btn-icon-sm admin-danger-icon" data-action="delete-policy" data-path="${pathEsc}" data-tip="Remove policy" data-tip-pos="bottom" aria-label="Remove policy for ${pathEsc}">
                            ${icon('trash', 15)}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    /**
     * Pre-fills the "Set a policy" form with an existing row's current
     * values and scrolls it into view. Without this, re-saving a policy to
     * change just one field (e.g. access mode) would silently reset
     * Published/Locked to unchecked - a checkbox has no "leave unset" state,
     * unlike the API's own partial-update semantics.
     */
    function handleEditPolicy(path) {
        const policy = state.policies.find((p) => p.client_path === path);
        if (!policy) return;
        document.getElementById('policyPath').value = policy.client_path;
        document.getElementById('policyAccessMode').value = policy.access_mode;
        document.getElementById('policyPublished').checked = policy.is_published === 1;
        document.getElementById('policyLocked').checked = policy.is_locked === 1;
        document.getElementById('setPolicyForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('policyAccessMode').focus();
    }

    async function handleSetPolicy(event) {
        event.preventDefault();
        const errorEl = document.getElementById('setPolicyError');
        errorEl.hidden = true;

        const path = document.getElementById('policyPath').value.trim();
        const accessMode = document.getElementById('policyAccessMode').value;
        const isPublished = document.getElementById('policyPublished').checked;
        const isLocked = document.getElementById('policyLocked').checked;

        try {
            await window.API.put('/admin/files/policy', { path, accessMode, isPublished, isLocked }, { silent: true });
            Toast.success('Policy saved', `"${path}" is now ${accessMode}.`);
            event.target.reset();
            await loadPolicies();
        } catch (error) {
            errorEl.textContent = error.message || 'Could not save the policy.';
            errorEl.hidden = false;
        }
    }

    async function handleDeletePolicy(path) {
        const confirmed = await Modal.confirm({
            title: 'Remove this policy?',
            message: `"${escapeHtml(path)}" will no longer have an access policy or any per-user permissions.`,
            confirmText: 'Remove',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await window.API.del(`/admin/files/policy?path=${encodeURIComponent(path)}`);
            Toast.success('Policy removed', `"${path}" no longer has a policy.`);
            if (state.selectedPolicyPath === path) hidePermissionsPanel();
            await loadPolicies();
        } catch (error) {
            Toast.error('Could not remove policy', error.message);
        }
    }

    /* ── Per-user permissions for the selected policy ── */

    function hidePermissionsPanel() {
        state.selectedPolicyPath = null;
        const group = document.getElementById('permissionsGroup');
        if (group) group.hidden = true;
    }

    async function showPermissionsPanel(path) {
        state.selectedPolicyPath = path;
        const group = document.getElementById('permissionsGroup');
        const label = document.getElementById('permissionsPathLabel');
        if (label) label.textContent = path;
        if (group) group.hidden = false;
        await loadPermissions(path);
    }

    async function loadPermissions(path) {
        const body = document.getElementById('permissionsTableBody');
        if (!body) return;
        try {
            const permissions = await window.API.get(`/admin/files/permissions?path=${encodeURIComponent(path)}`, { silent: true });
            if (permissions.length === 0) {
                body.innerHTML = '<tr class="admin-table-empty"><td colspan="3">No per-user permissions yet.</td></tr>';
                return;
            }
            body.innerHTML = permissions.map((perm) => {
                const user = state.users.find((u) => u.id === perm.user_id);
                const username = escapeHtml(user ? user.username : `#${perm.user_id}`);
                return `
                    <tr>
                        <td>${username}</td>
                        <td><span class="admin-badge${perm.permission === 'deny' ? ' is-muted' : ''}">${escapeHtml(perm.permission)}</span></td>
                        <td class="admin-row-actions">
                            <button class="btn-icon btn-icon-sm admin-danger-icon" data-action="revoke-permission" data-user-id="${perm.user_id}" data-tip="Revoke" data-tip-pos="bottom" aria-label="Revoke permission for ${username}">
                                ${icon('trash', 15)}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch {
            body.innerHTML = '<tr class="admin-table-empty"><td colspan="3">Could not load permissions.</td></tr>';
        }
    }

    async function handleGrantPermission(event) {
        event.preventDefault();
        if (!state.selectedPolicyPath) return;

        const userId = document.getElementById('grantUserId').value;
        const permission = document.getElementById('grantPermission').value;

        try {
            await window.API.post('/admin/files/permissions', {
                path: state.selectedPolicyPath,
                userId: Number(userId),
                permission,
            });
            Toast.success('Permission saved');
            await loadPermissions(state.selectedPolicyPath);
        } catch (error) {
            Toast.error('Could not save permission', error.message);
        }
    }

    async function handleRevokePermission(userId) {
        if (!state.selectedPolicyPath) return;
        try {
            await window.API.del('/admin/files/permissions', { path: state.selectedPolicyPath, userId: Number(userId) });
            Toast.success('Permission revoked');
            await loadPermissions(state.selectedPolicyPath);
        } catch (error) {
            Toast.error('Could not revoke permission', error.message);
        }
    }

    /* ══════════════════════════════════════════
       PANE SWITCHING (settings.js's pattern)
       ══════════════════════════════════════════ */

    function bindPaneSwitching() {
        $$('.settings-nav-item[data-pane]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-pane');
                $$('.settings-nav-item').forEach((b) => b.classList.toggle('is-active', b === btn));
                $$('.settings-pane').forEach((p) => {
                    p.classList.toggle('is-active', p.getAttribute('data-pane-content') === target);
                });
            });
        });
    }

    /* ══════════════════════════════════════════
       DELEGATED ROW ACTIONS
       ══════════════════════════════════════════ */

    function bindTableDelegation() {
        const usersBody = document.getElementById('usersTableBody');
        if (usersBody) {
            usersBody.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                const id = Number(btn.dataset.id);
                const username = btn.dataset.username;
                switch (btn.dataset.action) {
                    case 'toggle-status': return handleToggleStatus(id, username, btn.dataset.status);
                    case 'reset-password': return handleResetPassword(id, username);
                    case 'revoke-sessions': return handleRevokeSessions(id, username);
                    case 'delete-user': return handleDeleteUser(id, username);
                }
            });
        }

        const policiesBody = document.getElementById('policiesTableBody');
        if (policiesBody) {
            policiesBody.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                const path = btn.dataset.path;
                if (btn.dataset.action === 'edit-policy') return handleEditPolicy(path);
                if (btn.dataset.action === 'manage-permissions') return showPermissionsPanel(path);
                if (btn.dataset.action === 'delete-policy') return handleDeletePolicy(path);
            });
        }

        const permissionsBody = document.getElementById('permissionsTableBody');
        if (permissionsBody) {
            permissionsBody.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action="revoke-permission"]');
                if (!btn) return;
                handleRevokePermission(btn.dataset.userId);
            });
        }
    }

    /* ══════════════════════════════════════════
       LIFECYCLE
       ══════════════════════════════════════════ */

    function init() {
        state = { users: [], policies: [], selectedPolicyPath: null };
        hideAdminNotice();
        bindPaneSwitching();
        bindTableDelegation();

        const createUserForm = document.getElementById('createUserForm');
        if (createUserForm) createUserForm.addEventListener('submit', handleCreateUser);

        const setPolicyForm = document.getElementById('setPolicyForm');
        if (setPolicyForm) setPolicyForm.addEventListener('submit', handleSetPolicy);

        const grantForm = document.getElementById('grantPermissionForm');
        if (grantForm) grantForm.addEventListener('submit', handleGrantPermission);

        loadUsers();
        loadPolicies();

        if (window.AFM && AFM.Notifications) AFM.Notifications.bindTopbarBell();
    }

    /** Client-side navigation away: drop the document/window listeners. */
    function destroy() {
        globalListeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler));
        globalListeners = [];
    }

    return {
        init, destroy,
        // Exposed for test/frontend/admin.test.js (pure-ish helpers, DOM-light).
        _internal: { renderUsersTable, renderPoliciesTable },
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page === 'admin') {
        Admin.init();
    }
});

window.Admin = Admin;
