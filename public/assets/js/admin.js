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

    /** Grant subject picker (users + groups) and the "Check access" user picker. */
    function populateGrantUserSelect() {
        const userOptions = (prefix) => state.users.map((u) =>
            `<option value="${prefix}${u.id}">${escapeHtml(u.username)}</option>`
        ).join('');

        const select = document.getElementById('grantUserId');
        if (select) {
            const groups = state.groups.map((g) => `<option value="group:${g.id}">${escapeHtml(g.name)}</option>`).join('');
            select.innerHTML = `<optgroup label="Users">${userOptions('user:')}</optgroup>`
                + (groups ? `<optgroup label="Groups">${groups}</optgroup>` : '');
        }
        const effective = document.getElementById('effectiveUserId');
        if (effective) effective.innerHTML = '<option value="">Visitor (not signed in)</option>' + userOptions('');
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
            await loadGroups();
        } catch (error) {
            Toast.error('Could not delete account', error.message);
        }
    }

    /* ══════════════════════════════════════════
       GROUPS
       ══════════════════════════════════════════ */

    async function loadGroups() {
        try {
            state.groups = await window.API.get('/admin/groups', { silent: true });
        } catch {
            state.groups = [];
        }
        renderGroupsTable();
        populateGrantUserSelect();
    }

    function renderGroupsTable() {
        const body = document.getElementById('groupsTableBody');
        if (!body) return;

        if (state.groups.length === 0) {
            body.innerHTML = '<tr class="admin-table-empty"><td colspan="4">No groups yet.</td></tr>';
            return;
        }

        body.innerHTML = state.groups.map((group) => {
            const name = escapeHtml(group.name);
            const members = group.members.length
                ? group.members.map((m) => `<span class="admin-badge">${escapeHtml(m.username)}</span>`).join(' ')
                : '<span class="admin-badge is-muted">No members</span>';
            return `
                <tr>
                    <td>${name}</td>
                    <td class="admin-member-badges">${members}</td>
                    <td>${escapeHtml(group.description || '')}</td>
                    <td class="admin-row-actions">
                        <button class="btn-icon btn-icon-sm" data-action="edit-members" data-id="${group.id}" data-tip="Edit members" data-tip-pos="bottom" aria-label="Edit members of ${name}">
                            ${icon('userCheck', 15)}
                        </button>
                        <button class="btn-icon btn-icon-sm admin-danger-icon" data-action="delete-group" data-id="${group.id}" data-tip="Delete group" data-tip-pos="bottom" aria-label="Delete group ${name}">
                            ${icon('trash', 15)}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function handleCreateGroup(event) {
        event.preventDefault();
        const errorEl = document.getElementById('createGroupError');
        errorEl.hidden = true;

        const name = document.getElementById('newGroupName').value.trim();
        const description = document.getElementById('newGroupDescription').value.trim();

        try {
            await window.API.post('/admin/groups', { name, description }, { silent: true });
            Toast.success('Group created', `Add members to "${name}", then grant it access on a policy.`);
            event.target.reset();
            await loadGroups();
        } catch (error) {
            errorEl.textContent = error.message || 'Could not create the group.';
            errorEl.hidden = false;
        }
    }

    async function handleDeleteGroup(id) {
        const group = state.groups.find((g) => g.id === id);
        if (!group) return;
        const confirmed = await Modal.confirm({
            title: 'Delete this group?',
            message: `"${escapeHtml(group.name)}" and every file grant it holds will be removed. Members lose any access that came only from this group.`,
            confirmText: 'Delete',
            danger: true,
        });
        if (!confirmed) return;

        try {
            await window.API.del(`/admin/groups/${id}`);
            Toast.success('Group deleted', `"${group.name}" was removed.`);
            if (state.editingGroupId === id) hideMembersEditor();
            await loadGroups();
            if (state.selectedPolicyPath) await loadPermissions(state.selectedPolicyPath);
        } catch (error) {
            Toast.error('Could not delete group', error.message);
        }
    }

    function hideMembersEditor() {
        state.editingGroupId = null;
        const form = document.getElementById('groupMembersForm');
        if (form) form.hidden = true;
    }

    function showMembersEditor(id) {
        const group = state.groups.find((g) => g.id === id);
        if (!group) return;
        state.editingGroupId = id;
        const inGroup = new Set(group.members.map((m) => m.id));
        document.getElementById('groupMembersLabel').textContent = group.name;
        document.getElementById('groupMembersList').innerHTML = state.users.map((u) => {
            const name = escapeHtml(u.username);
            return `
                <label class="admin-member-option">
                    <input type="checkbox" value="${u.id}"${inGroup.has(u.id) ? ' checked' : ''}>
                    <span>${name}</span>
                    ${u.role === 'admin' ? '<span class="admin-badge is-muted">admin</span>' : ''}
                </label>
            `;
        }).join('') || '<p class="admin-table-empty">No accounts yet.</p>';
        const form = document.getElementById('groupMembersForm');
        form.hidden = false;
        form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    async function handleSaveMembers(event) {
        event.preventDefault();
        const id = state.editingGroupId;
        if (!id) return;
        const userIds = $$('#groupMembersList input[type="checkbox"]:checked').map((c) => Number(c.value));
        try {
            await window.API.put(`/admin/groups/${id}/members`, { userIds });
            Toast.success('Members saved');
            hideMembersEditor();
            await loadGroups();
        } catch (error) {
            Toast.error('Could not save members', error.message);
        }
    }

    /* ══════════════════════════════════════════
       FILE ACCESS POLICIES
       ══════════════════════════════════════════ */

    async function loadPolicies() {
        try {
            state.policies = await window.API.get('/admin/files/policies', { silent: true });
            renderPoliciesTable();
            if (state.editingPolicyPath) setPolicyEditing(state.editingPolicyPath);
            if (state.selectedPolicyPath) {
                if (state.policies.some((p) => p.client_path === state.selectedPolicyPath)) renderPermissionsSummary();
                else hidePermissionsPanel();
            }
        } catch (error) {
            state.policies = [];
            renderPoliciesTable();
        }
    }

    const MODE_LABEL = { restricted: 'Restricted', authenticated: 'Signed-in users', public: 'Public' };
    const LEVEL_LABEL = { view: 'View', download: 'Download' };

    /** One state per policy, as the portal sees it: unpublished, outside its dates, or live. */
    function policyState(policy, now = Date.now()) {
        if (!policy.is_published) return { label: 'Unpublished', tone: 'is-muted' };
        if (policy.available_until !== null && now > policy.available_until) return { label: 'Expired', tone: 'is-muted' };
        if (policy.available_from !== null && now < policy.available_from) return { label: 'Scheduled', tone: 'is-muted' };
        return { label: 'Live', tone: 'admin-badge-ok' };
    }

    function renderPoliciesTable() {
        const body = document.getElementById('policiesTableBody');
        if (!body) return;
        const count = document.getElementById('policyCount');
        const filter = (state.policyFilter || '').trim().toLowerCase();
        const shown = filter
            ? state.policies.filter((p) => p.client_path.toLowerCase().includes(filter))
            : state.policies;
        if (count) {
            const total = state.policies.length;
            count.textContent = filter ? `${shown.length} of ${total}` : `${total} ${total === 1 ? 'policy' : 'policies'}`;
        }

        if (state.policies.length === 0) {
            body.innerHTML = '<tr class="admin-table-empty"><td colspan="5">No files have a policy yet. Set one above to restrict a file or folder.</td></tr>';
            return;
        }
        if (shown.length === 0) {
            body.innerHTML = `<tr class="admin-table-empty"><td colspan="5">No policy path contains "${escapeHtml(filter)}".</td></tr>`;
            return;
        }

        body.innerHTML = shown.map((policy) => {
            const pathEsc = escapeHtml(policy.client_path);
            const st = policyState(policy);
            const restricted = policy.access_mode === 'restricted';
            const level = restricted ? '<span class="policy-muted">Grants only</span>'
                : escapeHtml(LEVEL_LABEL[policy.default_level] || 'Download');
            const until = policy.available_until !== null && st.label === 'Live'
                ? `<span class="policy-muted">until ${escapeHtml(new Date(policy.available_until).toLocaleDateString())}</span>` : '';
            return `
                <tr data-policy-path="${pathEsc}">
                    <td class="admin-path-cell"><button type="button" class="policy-path-link" data-action="open-permissions" data-path="${pathEsc}" aria-label="Show who can reach ${pathEsc}">${pathEsc}</button></td>
                    <td>${escapeHtml(MODE_LABEL[policy.access_mode] || policy.access_mode)}</td>
                    <td>${level}</td>
                    <td><span class="admin-badge ${st.tone}">${st.label}</span>${policy.is_locked ? ' <span class="admin-badge admin-badge-warn" title="Visitors see the name with a lock and a sign-in prompt">Locked for visitors</span>' : ''} ${until}</td>
                    <td class="admin-row-actions">
                        <button class="btn-icon btn-icon-sm" data-action="manage-permissions" data-path="${pathEsc}" data-tip="Who can reach it" data-tip-pos="bottom" aria-label="Manage permissions for ${pathEsc}">
                            ${icon('userCheck', 15)}
                        </button>
                        <button class="btn-icon btn-icon-sm" data-action="edit-policy" data-path="${pathEsc}" data-tip="Edit policy" data-tip-pos="bottom" aria-label="Edit policy for ${pathEsc}">
                            ${icon('edit', 15)}
                        </button>
                        <button class="btn-icon btn-icon-sm admin-danger-icon" data-action="delete-policy" data-path="${pathEsc}" data-tip="Remove policy" data-tip-pos="bottom" aria-label="Remove policy for ${pathEsc}">
                            ${icon('trash', 15)}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
        markPolicyRows();
    }

    /** Re-applies the editing / selected marks after any re-render. */
    function markPolicyRows() {
        $$('#policiesTableBody tr[data-policy-path]').forEach((row) => {
            row.classList.toggle('is-editing', row.dataset.policyPath === state.editingPolicyPath);
            row.classList.toggle('is-selected', row.dataset.policyPath === state.selectedPolicyPath);
        });
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
        setPolicyMode(policy.access_mode);
        document.getElementById('policyPublished').checked = policy.is_published === 1;
        document.getElementById('policyLocked').checked = policy.is_locked === 1;
        document.getElementById('policyDefaultLevel').value = policy.default_level || 'download';
        setPolicyEditing(policy.client_path);
        document.getElementById('setPolicyForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
        document.querySelector('#setPolicyForm input[name="accessMode"]:checked').focus();
    }

    function policyMode() {
        const checked = document.querySelector('#setPolicyForm input[name="accessMode"]:checked');
        return checked ? checked.value : 'restricted';
    }

    function setPolicyMode(mode) {
        const radio = document.querySelector(`#setPolicyForm input[name="accessMode"][value="${mode}"]`);
        if (radio) radio.checked = true;
        syncDefaultLevel();
    }

    /**
     * The form says which path it is editing: the title, the button and a
     * cancel action change, and the edited row is marked in the table, so
     * "Save" is never mistaken for creating a second policy.
     */
    function setPolicyEditing(path) {
        state.editingPolicyPath = path;
        document.getElementById('policyFormTitle').textContent = path ? `Edit policy: ${path}` : 'Set a policy';
        document.getElementById('policySubmitLabel').textContent = path ? 'Update policy' : 'Save policy';
        document.getElementById('policyCancel').hidden = !path;
        markPolicyRows();
    }

    function resetPolicyForm() {
        document.getElementById('setPolicyForm').reset();
        document.getElementById('setPolicyError').hidden = true;
        setPolicyMode('restricted');
        setPolicyEditing(null);
    }

    async function handleSetPolicy(event) {
        event.preventDefault();
        const errorEl = document.getElementById('setPolicyError');
        errorEl.hidden = true;

        const path = document.getElementById('policyPath').value.trim();
        if (!path) {
            errorEl.textContent = 'Enter the path of a file or folder, starting with "/".';
            errorEl.hidden = false;
            document.getElementById('policyPath').focus();
            return;
        }
        const accessMode = policyMode();
        const isPublished = document.getElementById('policyPublished').checked;
        const isLocked = document.getElementById('policyLocked').checked;
        const body = { path, accessMode, isPublished, isLocked };
        // Restricted ignores the default level; leave the stored one as it was.
        if (accessMode !== 'restricted') body.defaultLevel = document.getElementById('policyDefaultLevel').value;

        try {
            await window.API.put('/admin/files/policy', body, { silent: true });
            Toast.success('Policy saved', `"${path}" is now ${accessMode}.`);
            resetPolicyForm();
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
            if (state.editingPolicyPath === path) resetPolicyForm();
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
        markPolicyRows();
    }

    /** What the selected policy already allows, before any grant below. */
    function renderPermissionsSummary() {
        const policy = state.policies.find((p) => p.client_path === state.selectedPolicyPath);
        const out = document.getElementById('permissionsSummary');
        if (!policy || !out) return;
        const level = LEVEL_LABEL[policy.default_level] || 'Download';
        const audience = policy.access_mode === 'public' ? 'everyone, visitors included,' : 'everyone who signs in';
        let text = policy.access_mode === 'restricted'
            ? 'Restricted: on the portal, only the users and groups below can reach it.'
            : `${MODE_LABEL[policy.access_mode]}: on the portal ${audience} gets ${level}. Add access to raise it for someone, or deny to hide it from them.`;
        if (policy.is_locked && policy.access_mode !== 'public') text += ' Visitors see its name with a lock and a sign-in prompt.';
        if (policy.is_locked && policy.access_mode === 'public') text += ' Visitors must sign in first; they see its name with a lock.';
        const st = policyState(policy);
        if (st.label !== 'Live') text += ` It is ${st.label.toLowerCase()} right now, so nobody can reach it on the portal.`;
        out.textContent = text;
    }

    async function showPermissionsPanel(path) {
        state.selectedPolicyPath = path;
        const group = document.getElementById('permissionsGroup');
        const label = document.getElementById('permissionsPathLabel');
        if (label) label.textContent = path;
        renderPermissionsSummary();
        markPolicyRows();
        if (group) {
            group.hidden = false;
            group.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        await loadPermissions(path);
        document.getElementById('grantUserId').focus({ preventScroll: true });
    }

    /** The Access select merges permission and level: "deny" or a level name. */
    function accessOptions(selected) {
        return [...Object.entries(LEVEL_LABEL), ['deny', 'Deny']]
            .map(([value, text]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${text}</option>`)
            .join('');
    }

    async function loadPermissions(path) {
        const body = document.getElementById('permissionsTableBody');
        if (!body) return;
        const query = `?path=${encodeURIComponent(path)}`;
        try {
            const [userPerms, groupPerms] = await Promise.all([
                window.API.get(`/admin/files/permissions${query}`, { silent: true }),
                window.API.get(`/admin/files/group-permissions${query}`, { silent: true }),
            ]);
            if (userPerms.length + groupPerms.length === 0) {
                const policy = state.policies.find((p) => p.client_path === path);
                const message = !policy || policy.access_mode === 'restricted'
                    ? 'Nobody has access yet. Add a user or group above.'
                    : `No exceptions: ${policy.access_mode === 'public' ? 'everyone' : 'every signed-in user'} gets ${LEVEL_LABEL[policy.default_level] || 'Download'}.`;
                body.innerHTML = `<tr class="admin-table-empty"><td colspan="3">${message}</td></tr>`;
                return;
            }
            const row = (iconName, name, sub, perm, subjectAttr) => {
                const choice = perm.permission === 'deny' ? 'deny' : (perm.level || 'download');
                return `
                    <tr class="${choice === 'deny' ? 'is-denied' : ''}">
                        <td>
                            <div class="perm-who">
                                <span class="perm-avatar" aria-hidden="true">${icon(iconName, 15)}</span>
                                <span><strong>${name}</strong><span class="field-hint">${sub}</span></span>
                            </div>
                        </td>
                        <td>
                            <select class="input perm-level" ${subjectAttr} aria-label="Access for ${name}">${accessOptions(choice)}</select>
                        </td>
                        <td class="admin-row-actions">
                            <button class="btn-icon btn-icon-sm admin-danger-icon" data-action="revoke-permission" ${subjectAttr} data-tip="Remove" data-tip-pos="bottom" aria-label="Remove access for ${name}">
                                ${icon('trash', 15)}
                            </button>
                        </td>
                    </tr>
                `;
            };
            body.innerHTML = groupPerms.map((perm) => {
                const groupName = escapeHtml(perm.group_name);
                const group = state.groups.find((g) => g.id === perm.group_id);
                const members = group ? group.members.length : 0;
                return row('users', groupName, `Group, ${members} ${members === 1 ? 'member' : 'members'}`, perm, `data-group-id="${perm.group_id}"`);
            }).join('') + userPerms.map((perm) => {
                const user = state.users.find((u) => u.id === perm.user_id);
                const username = escapeHtml(user ? user.username : `#${perm.user_id}`);
                const sub = user && user.role === 'admin' ? 'Administrator' : 'User';
                return row('user', username, sub, perm, `data-user-id="${perm.user_id}"`);
            }).join('');
        } catch {
            body.innerHTML = '<tr class="admin-table-empty"><td colspan="3">Could not load permissions.</td></tr>';
        }
    }

    /** Creates or updates one grant; `choice` is a level name or "deny". */
    async function saveGrant(subject, choice) {
        await window.API.post('/admin/files/permissions', {
            path: state.selectedPolicyPath,
            ...subject,
            permission: choice === 'deny' ? 'deny' : 'grant',
            level: choice === 'deny' ? 'view' : choice,
        });
    }

    async function handleGrantPermission(event) {
        event.preventDefault();
        if (!state.selectedPolicyPath) return;

        const [kind, id] = document.getElementById('grantUserId').value.split(':');
        const choice = document.getElementById('grantLevel').value;

        try {
            await saveGrant({ [kind === 'group' ? 'groupId' : 'userId']: Number(id) }, choice);
            Toast.success('Access saved');
            await loadPermissions(state.selectedPolicyPath);
        } catch (error) {
            Toast.error('Could not save access', error.message);
        }
    }

    async function handleChangeGrant(select) {
        const subject = select.dataset.groupId
            ? { groupId: Number(select.dataset.groupId) }
            : { userId: Number(select.dataset.userId) };
        try {
            await saveGrant(subject, select.value);
            Toast.success('Access updated');
        } catch (error) {
            Toast.error('Could not update access', error.message);
        }
        await loadPermissions(state.selectedPolicyPath);
    }

    /** "Default level" only applies to non-restricted policies. */
    function syncDefaultLevel() {
        const field = document.getElementById('policyDefaultLevelField');
        if (field) field.hidden = policyMode() === 'restricted';
    }

    /** What each portal outcome means to the person asking. */
    const OUTCOME_TEXT = {
        download: 'Can see it and download it.',
        view: 'Sees it listed, marked "View only", but cannot download it.',
        locked: 'Sees its name with a lock and is asked to sign in.',
        hidden: 'Cannot see it: to them it does not exist.',
        disabled: 'This account is disabled and cannot sign in to the portal.',
    };
    const OUTCOME_LABEL = { download: 'Download', view: 'View', locked: 'Locked', hidden: 'Hidden', disabled: 'Disabled' };

    async function handleEffectiveCheck(event) {
        event.preventDefault();
        const out = document.getElementById('effectiveResult');
        const userId = document.getElementById('effectiveUserId').value;
        const path = document.getElementById('effectivePath').value.trim();
        const query = `path=${encodeURIComponent(path)}${userId ? `&userId=${encodeURIComponent(userId)}` : ''}`;
        try {
            const result = await window.API.get(`/admin/files/effective?${query}`, { silent: true });
            const why = result.outcome === 'disabled' ? ''
                : result.policies.length === 0 ? 'No policy governs this path, so the portal serves it to everyone.'
                    : 'Decided by these policies (hidden beats locked, then the lowest level wins):';
            out.innerHTML = `
                <p><strong>${escapeHtml(OUTCOME_LABEL[result.outcome] || result.outcome)}</strong>: ${OUTCOME_TEXT[result.outcome] || ''}</p>
                ${why ? `<p class="policy-muted">${why}</p>` : ''}
                ${result.policies.length ? `<ul>${result.policies.map((p) =>
                    `<li><code>${escapeHtml(p.path)}</code> gives <strong>${escapeHtml(OUTCOME_LABEL[p.outcome] || p.outcome)}</strong></li>`).join('')}</ul>` : ''}
            `;
        } catch (error) {
            out.textContent = error.message || 'Could not check access.';
        }
        out.hidden = false;
    }

    async function handleRevokePermission(subject) {
        if (!state.selectedPolicyPath) return;
        try {
            await window.API.del('/admin/files/permissions', { path: state.selectedPolicyPath, ...subject });
            Toast.success('Access removed');
            await loadPermissions(state.selectedPolicyPath);
        } catch (error) {
            Toast.error('Could not revoke permission', error.message);
        }
    }

    /* ══════════════════════════════════════════
       FILE PORTAL (integration_settings in admin.sqlite; ADR-010)
       ══════════════════════════════════════════ */

    const PORTAL_AUTH_FIELDS = ['sessionMinutes', 'maxFailedAttempts', 'lockoutMinutes'];
    let portalSaved = null;

    /** What the portal's storage check sees, per volume.status from the server. */
    const VOLUME_TEXT = {
        missing: 'The storage marker .dimension-volume is missing from this server\'s storage root, so the file portal refuses to serve. If the storage root moved, point STORAGE_ROOT back at it; otherwise restore the marker with the volume id below (docs/DEPLOYMENT.md).',
        mismatch: 'The storage root holds a .dimension-volume marker for a different volume, so the file portal refuses to serve. STORAGE_ROOT probably points at the wrong directory (docs/DEPLOYMENT.md).',
        unwritable: 'The storage marker .dimension-volume could not be written to this server\'s storage root, so the file portal refuses to serve. Make STORAGE_ROOT writable and restart this server.',
    };

    /** The published portal folder's state, per portalRoot.status (unverified is covered by VOLUME_TEXT). */
    const ROOT_STATUS_TEXT = {
        missing: 'The portal folder no longer exists, so a portal host that sees only that folder cannot place itself. Choose the folder that host mounts now, or clear the field.',
        mismatch: 'The portal folder holds the marker of another storage volume. Choose another folder.',
    };

    /** `{ portalRootClientPath, releaseClientPath, auth }` from the form; empty fields are null. */
    function readPortalForm() {
        const root = document.getElementById('pPortalRoot').value.trim();
        const release = document.getElementById('pReleaseClientPath').value.trim();
        const auth = {};
        for (const field of PORTAL_AUTH_FIELDS) {
            const raw = document.getElementById(`p${field[0].toUpperCase()}${field.slice(1)}`).value.trim();
            auth[field] = raw === '' ? null : Number(raw);
        }
        return { portalRootClientPath: root && root !== '/' ? root : null, releaseClientPath: release || null, auth };
    }

    function fillPortalForm(settings) {
        document.getElementById('pPortalRoot').value = (settings.portalRoot && settings.portalRoot.clientPath) || '';
        document.getElementById('pReleaseClientPath').value = settings.releaseClientPath || '';
        for (const field of PORTAL_AUTH_FIELDS) {
            const value = settings.auth[field];
            document.getElementById(`p${field[0].toUpperCase()}${field.slice(1)}`).value = value == null ? '' : String(value);
        }
        portalSaved = readPortalForm();
        updatePortalDirty();
    }

    function updatePortalDirty() {
        const dirty = portalSaved && JSON.stringify(readPortalForm()) !== JSON.stringify(portalSaved);
        document.getElementById('portalSave').disabled = !dirty;
        document.getElementById('portalReset').disabled = !dirty;
    }

    function renderVolume(volume, portalRoot) {
        const notice = document.getElementById('portalVolume');
        const volumeText = VOLUME_TEXT[volume && volume.status];
        const rootText = !volumeText && portalRoot ? ROOT_STATUS_TEXT[portalRoot.status] : '';
        notice.hidden = !volumeText && !rootText;
        document.getElementById('portalVolumeText').textContent = volumeText
            ? `${volumeText}${volume.id ? ` Volume id: ${volume.id}` : ''}`
            : rootText ? `${rootText} Portal folder: ${portalRoot.clientPath}` : '';
    }

    async function loadPortal() {
        const form = document.getElementById('portalForm');
        if (!form) return;
        try {
            const settings = await window.API.get('/admin/portal/settings', { silent: true });
            renderVolume(settings.volume, settings.portalRoot);
            fillPortalForm(settings);
        } catch (error) {
            const errorEl = document.getElementById('portalError');
            errorEl.textContent = error.message || 'Could not read the portal settings.';
            errorEl.hidden = false;
        }
    }

    async function handlePortalSave(event) {
        event.preventDefault();
        const errorEl = document.getElementById('portalError');
        errorEl.hidden = true;
        const saveBtn = document.getElementById('portalSave');
        saveBtn.disabled = true;
        try {
            const res = await window.API.put('/admin/portal/settings', readPortalForm(), { silent: true });
            renderVolume(res.volume, res.portalRoot);
            fillPortalForm(res);
            Toast.success('Portal settings saved', 'The file portal applies them within seconds.');
        } catch (error) {
            errorEl.textContent = error.message || 'Could not save the portal settings.';
            errorEl.hidden = false;
            updatePortalDirty();
        }
    }

    /* ══════════════════════════════════════════
       PORTAL NAVBAR FOLDERS (admin.sqlite portal_nav_folders)
       ══════════════════════════════════════════ */

    let navSaved = null;

    function readNavRows() {
        return $$('#navFolderList .nav-folder').map((row) => ({
            path: row.querySelector('[data-f="path"]').value.trim(),
            label: row.querySelector('[data-f="label"]').value.trim(),
            hideFromHome: row.querySelector('[data-f="hide"]').checked,
        }));
    }

    function renderNavRows(folders) {
        const list = document.getElementById('navFolderList');
        list.innerHTML = folders.map((f, i) => `
            <li class="nav-folder">
                <input class="input input-mono" data-f="path" value="${escapeHtml(f.path)}" placeholder="/Downloads/PVM"
                    aria-label="Folder path ${i + 1}" autocomplete="off" spellcheck="false" required>
                <input class="input" data-f="label" value="${escapeHtml(f.label || '')}" placeholder="Folder name"
                    aria-label="Label ${i + 1}" maxlength="40" autocomplete="off">
                <label class="admin-switch-label" title="Hide this folder's card on the portal home page">
                    <span class="switch">
                        <input type="checkbox" data-f="hide" ${f.hideFromHome ? 'checked' : ''}>
                        <span class="track" aria-hidden="true"></span>
                    </span>
                    <span>Hide</span>
                </label>
                <span class="nav-folder-tools">
                    <button type="button" data-act="up" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('arrowUp', 15)}</button>
                    <button type="button" data-act="down" data-i="${i}" aria-label="Move down" ${i === folders.length - 1 ? 'disabled' : ''}>${icon('arrowDown', 15)}</button>
                    <button type="button" data-act="remove" data-i="${i}" aria-label="Remove">${icon('trash', 15)}</button>
                </span>
            </li>`).join('');
        document.getElementById('navFolderEmpty').hidden = folders.length > 0;
        document.getElementById('navFolderAdd').disabled = folders.length >= 12;
        updateNavDirty();
    }

    function updateNavDirty() {
        const dirty = navSaved !== null && JSON.stringify(readNavRows()) !== JSON.stringify(navSaved);
        document.getElementById('navFolderSave').disabled = !dirty;
        document.getElementById('navFolderReset').disabled = !dirty;
    }

    async function loadPortalNav() {
        if (!document.getElementById('portalNavForm')) return;
        try {
            const res = await window.API.get('/admin/portal/nav', { silent: true });
            navSaved = (res && res.folders) || [];
            renderNavRows(navSaved);
        } catch (error) {
            const errorEl = document.getElementById('navFolderError');
            errorEl.textContent = error.message || 'Could not read the navbar folders.';
            errorEl.hidden = false;
        }
    }

    function handleNavTool(event) {
        const btn = event.target.closest('button[data-act]');
        if (!btn) return;
        const rows = readNavRows();
        const i = Number(btn.dataset.i);
        if (btn.dataset.act === 'remove') rows.splice(i, 1);
        else {
            const j = btn.dataset.act === 'up' ? i - 1 : i + 1;
            [rows[i], rows[j]] = [rows[j], rows[i]];
        }
        renderNavRows(rows);
    }

    async function handleNavSave(event) {
        event.preventDefault();
        const errorEl = document.getElementById('navFolderError');
        errorEl.hidden = true;
        document.getElementById('navFolderSave').disabled = true;
        try {
            const res = await window.API.put('/admin/portal/nav', { folders: readNavRows() }, { silent: true });
            navSaved = res.folders;
            renderNavRows(navSaved);
            Toast.success('Navbar saved', 'The file portal shows it within a few seconds.');
        } catch (error) {
            errorEl.textContent = error.message || 'Could not save the navbar folders.';
            errorEl.hidden = false;
            updateNavDirty();
        }
    }

    /* ══════════════════════════════════════════
       LOGS (portal trace + admin audit)
       ══════════════════════════════════════════ */

    const LOG_LIMIT = 500;
    const LOG_POLL_MS = 5000;
    let logState = { source: 'portal', level: 'all', query: '', entries: [], available: true };
    let logTimer = null;

    /** Both sources reduced to one row shape: {t, level, title, detail}. */
    function normalizePortalEntry(e) {
        const level = ['error', 'warn'].includes(e.level) ? e.level : 'info';
        if (e.method) return { t: e.t, level, status: e.status, title: `${e.method} ${e.url || ''}`, detail: e.msg || '' };
        return { t: e.t, level, title: e.msg || '', detail: '' };
    }

    function normalizeAuditEntry(e) {
        const target = e.target_type ? `${e.target_type}${e.target_id != null ? ` #${e.target_id}` : ''}` : '';
        return {
            t: e.created_at,
            level: e.outcome === 'failure' ? 'warn' : 'info',
            status: e.outcome,
            title: e.action,
            detail: [e.actor_username || (e.actor_id ? `user #${e.actor_id}` : 'system'), target, e.ip].filter(Boolean).join(' · '),
        };
    }

    function filterLogEntries(entries, level, query) {
        const q = query.trim().toLowerCase();
        return entries.filter((e) => {
            if (level === 'error' && e.level !== 'error') return false;
            if (level === 'warn' && e.level === 'info') return false;
            return !q || `${e.title} ${e.detail} ${e.status ?? ''}`.toLowerCase().includes(q);
        });
    }

    function renderLogs() {
        const list = document.getElementById('logList');
        const meta = document.getElementById('logMeta');
        if (!list) return;
        const shown = filterLogEntries(logState.entries, logState.level, logState.query);
        meta.textContent = !logState.available
            ? `File portal log is not linked: ${logState.reason || 'PORTAL_LOG_FILE is not usable.'}`
            : `${shown.length} of ${logState.entries.length} most recent entries`;

        if (shown.length === 0) {
            list.innerHTML = `<li class="log-empty">${logState.entries.length ? 'No entries match the filter.' : 'No log entries yet.'}</li>`;
            return;
        }
        list.innerHTML = shown.map((e) => {
            const d = new Date(e.t);
            const valid = !Number.isNaN(d.getTime());
            const time = valid ? d.toLocaleTimeString([], { hour12: false }) : '—';
            const day = valid ? d.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
            const status = e.status != null ? `<span class="log-status">${escapeHtml(String(e.status))}</span>` : '';
            return `
                <li class="log-row" data-level="${escapeHtml(e.level)}">
                    <time class="log-time" datetime="${valid ? escapeHtml(d.toISOString()) : ''}"><span>${escapeHtml(day)}</span>${escapeHtml(time)}</time>
                    <span class="log-level">${escapeHtml(e.level)}</span>
                    <span class="log-body">${status}<span class="log-title">${escapeHtml(e.title)}</span>${e.detail ? `<span class="log-detail">${escapeHtml(e.detail)}</span>` : ''}</span>
                </li>`;
        }).join('');
    }

    async function loadLogs() {
        const source = logState.source;
        try {
            if (source === 'portal') {
                const res = await window.API.get(`/admin/logs/portal?limit=${LOG_LIMIT}`, { silent: true });
                if (source !== logState.source) return;
                logState.available = Boolean(res && res.available);
                logState.reason = res && res.reason;
                logState.entries = (res && res.entries ? res.entries : []).map(normalizePortalEntry);
            } else {
                const rows = await window.API.get(`/admin/logs/audit?limit=${LOG_LIMIT}`, { silent: true });
                if (source !== logState.source) return;
                logState.available = true;
                logState.entries = (rows || []).map(normalizeAuditEntry);
            }
            renderLogs();
        } catch (error) {
            const meta = document.getElementById('logMeta');
            if (meta) meta.textContent = `Could not load logs: ${error.message || 'request failed'}`;
        }
    }

    function setLogLive(on) {
        clearInterval(logTimer);
        logTimer = on ? setInterval(() => { if (!document.hidden) loadLogs(); }, LOG_POLL_MS) : null;
    }

    function bindLogs() {
        const panel = document.querySelector('[data-pane-content="logs"]');
        if (!panel) return;
        panel.addEventListener('click', (e) => {
            const src = e.target.closest('[data-log-source]');
            if (src) {
                logState.source = src.dataset.logSource;
                logState.entries = [];
                panel.querySelectorAll('[data-log-source]').forEach((b) => {
                    b.classList.toggle('is-active', b === src);
                    b.setAttribute('aria-selected', String(b === src));
                });
                renderLogs();
                loadLogs();
                return;
            }
            const lvl = e.target.closest('[data-log-level]');
            if (lvl) {
                logState.level = lvl.dataset.logLevel;
                panel.querySelectorAll('[data-log-level]').forEach((b) => b.classList.toggle('is-active', b === lvl));
                renderLogs();
            }
        });
        document.getElementById('logSearch').addEventListener('input', (e) => { logState.query = e.target.value; renderLogs(); });
        document.getElementById('logRefresh').addEventListener('click', loadLogs);
        document.getElementById('logLive').addEventListener('change', (e) => setLogLive(e.target.checked));
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
                if (target === 'logs') loadLogs();
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
                if (btn.dataset.action === 'manage-permissions' || btn.dataset.action === 'open-permissions') return showPermissionsPanel(path);
                if (btn.dataset.action === 'delete-policy') return handleDeletePolicy(path);
            });
        }

        const permissionsBody = document.getElementById('permissionsTableBody');
        if (permissionsBody) {
            permissionsBody.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action="revoke-permission"]');
                if (!btn) return;
                handleRevokePermission(btn.dataset.groupId
                    ? { groupId: Number(btn.dataset.groupId) }
                    : { userId: Number(btn.dataset.userId) });
            });
            permissionsBody.addEventListener('change', (e) => {
                if (e.target.matches('select.perm-level')) handleChangeGrant(e.target);
            });
        }

        const groupsBody = document.getElementById('groupsTableBody');
        if (groupsBody) {
            groupsBody.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                const id = Number(btn.dataset.id);
                if (btn.dataset.action === 'edit-members') return showMembersEditor(id);
                if (btn.dataset.action === 'delete-group') return handleDeleteGroup(id);
            });
        }
    }

    /* ══════════════════════════════════════════
       LIFECYCLE
       ══════════════════════════════════════════ */

    function init() {
        state = { users: [], groups: [], policies: [], selectedPolicyPath: null, editingGroupId: null };
        hideAdminNotice();
        bindPaneSwitching();
        bindTableDelegation();

        const createUserForm = document.getElementById('createUserForm');
        if (createUserForm) createUserForm.addEventListener('submit', handleCreateUser);

        const createGroupForm = document.getElementById('createGroupForm');
        if (createGroupForm) createGroupForm.addEventListener('submit', handleCreateGroup);

        const membersForm = document.getElementById('groupMembersForm');
        if (membersForm) {
            membersForm.addEventListener('submit', handleSaveMembers);
            document.getElementById('groupMembersCancel').addEventListener('click', hideMembersEditor);
        }

        const setPolicyForm = document.getElementById('setPolicyForm');
        if (setPolicyForm) {
            setPolicyForm.addEventListener('submit', handleSetPolicy);
            setPolicyForm.addEventListener('change', (e) => { if (e.target.name === 'accessMode') syncDefaultLevel(); });
            document.getElementById('policyCancel').addEventListener('click', resetPolicyForm);
        }

        const grantForm = document.getElementById('grantPermissionForm');
        if (grantForm) {
            grantForm.addEventListener('submit', handleGrantPermission);
            document.getElementById('permissionsClose').addEventListener('click', hidePermissionsPanel);
        }

        const policyFilter = document.getElementById('policyFilter');
        if (policyFilter) {
            policyFilter.addEventListener('input', () => {
                state.policyFilter = policyFilter.value;
                renderPoliciesTable();
            });
        }

        const effectiveForm = document.getElementById('effectiveForm');
        if (effectiveForm) effectiveForm.addEventListener('submit', handleEffectiveCheck);

        const portalForm = document.getElementById('portalForm');
        if (portalForm) {
            portalForm.addEventListener('submit', handlePortalSave);
            portalForm.addEventListener('input', updatePortalDirty);
            portalForm.addEventListener('change', updatePortalDirty);
            document.getElementById('portalReset').addEventListener('click', () => portalSaved && fillPortalForm(portalSaved));
        }
        const navForm = document.getElementById('portalNavForm');
        if (navForm) {
            navForm.addEventListener('submit', handleNavSave);
            navForm.addEventListener('input', updateNavDirty);
            navForm.addEventListener('change', updateNavDirty);
            document.getElementById('navFolderList').addEventListener('click', handleNavTool);
            document.getElementById('navFolderAdd').addEventListener('click', () => {
                renderNavRows([...readNavRows(), { path: '', label: '', hideFromHome: false }]);
                const inputs = $$('#navFolderList [data-f="path"]');
                inputs[inputs.length - 1].focus();
            });
            document.getElementById('navFolderReset').addEventListener('click', () => navSaved && renderNavRows(navSaved));
        }
        logState = { source: 'portal', level: 'all', query: '', entries: [], available: true };
        bindLogs();

        loadUsers();
        loadGroups();
        loadPolicies();
        loadPortal();
        loadPortalNav();

        if (window.AFM && AFM.Notifications) AFM.Notifications.bindTopbarBell();
    }

    /** Client-side navigation away: drop the document/window listeners. */
    function destroy() {
        globalListeners.forEach(([target, type, handler]) => target.removeEventListener(type, handler));
        globalListeners = [];
        setLogLive(false);
    }

    return {
        init, destroy,
        // Exposed for test/frontend/admin.test.js (pure-ish helpers, DOM-light).
        _internal: { renderUsersTable, renderPoliciesTable, normalizePortalEntry, normalizeAuditEntry, filterLogEntries },
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    if (document.body.dataset.page === 'admin') {
        Admin.init();
    }
});

window.Admin = Admin;
