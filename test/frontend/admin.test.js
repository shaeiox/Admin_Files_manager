// test/frontend/admin.test.js
'use strict';

/**
 * Admin page contract (ADR-009 phase 2): source-level assertions in the
 * repo's existing style (notifications.test.js, tooltips.test.js) - regex
 * checks against the shipped source rather than a full DOM harness, since
 * admin.js's correctness is mostly "did every dynamic value get escaped"
 * and "is every control actually wired", both of which are visible in source.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT_DIR, ...p), 'utf8');

const ADMIN_HTML = read('public', 'admin.html');
const ADMIN_JS = read('public', 'assets', 'js', 'admin.js');
const ROUTER_JS = read('public', 'assets', 'js', 'router.js');

describe('admin.html is registered as a real page', () => {
    test('router.js knows the admin page', () => {
        assert.match(ROUTER_JS, /'admin\.html':\s*'admin'/);
        assert.match(ROUTER_JS, /admin:\s*'Admin'/);
    });

    test('loads the standard script set in the standard order', () => {
        const order = ['api.js', 'app.js', 'sidebar.js', 'router.js', 'notifications.js', 'admin.js'];
        let lastIndex = -1;
        for (const file of order) {
            const idx = ADMIN_HTML.indexOf(`assets/js/${file}`);
            assert.ok(idx > lastIndex, `${file} loads after the previous script`);
            lastIndex = idx;
        }
    });

    test('declares the same-origin API base, same as every other shell', () => {
        assert.match(ADMIN_HTML, /<meta name="afm-api-base" content="\/api\/v1">/);
    });

    test('registers window.Admin with init and destroy', () => {
        assert.match(ADMIN_JS, /window\.Admin\s*=\s*Admin/);
        assert.match(ADMIN_JS, /function init\(\)/);
        assert.match(ADMIN_JS, /function destroy\(\)/);
    });

    test('destroy() removes every listener init() registered on document/window', () => {
        assert.match(ADMIN_JS, /globalListeners\.forEach\(\(\[target, type, handler\]\) => target\.removeEventListener\(type, handler\)\)/);
    });

    // A direct load/refresh of admin.html never goes through router.js's
    // client-side navigation (which is the only other place that calls
    // Admin.init()) - without this, Users/Policies stay stuck on "Loading..."
    // forever on first visit. Every other page module has this same guard
    // (settings.js, dashboard.js, files.js, uploads.js).
    test('self-initializes on a hard page load, like every other page module', () => {
        assert.match(ADMIN_JS, /document\.addEventListener\('DOMContentLoaded',\s*\(\)\s*=>\s*\{\s*if\s*\(document\.body\.dataset\.page === 'admin'\)\s*\{\s*Admin\.init\(\);/);
    });
});

describe('every API call goes through window.API, never ad hoc', () => {
    test('no bare fetch() or XMLHttpRequest in admin.js', () => {
        assert.doesNotMatch(ADMIN_JS, /\bfetch\s*\(/);
        assert.doesNotMatch(ADMIN_JS, /new\s+XMLHttpRequest/);
    });

    test('every admin.js network call is one of window.API.get/post/put/del', () => {
        const calls = [...ADMIN_JS.matchAll(/window\.API\.(get|post|put|del)\(/g)].map((m) => m[1]);
        assert.ok(calls.length >= 8, `expected several API calls, found ${calls.length}`);
    });

    test('calls the real admin endpoints, under /admin', () => {
        for (const endpoint of [
            '/admin/users',
            '/admin/users/${id}/status',
            '/admin/users/${id}/reset-password',
            '/admin/users/${id}/revoke-sessions',
            '/admin/files/policies',
            '/admin/files/policy',
            '/admin/files/permissions',
        ]) {
            assert.ok(ADMIN_JS.includes(endpoint), `admin.js calls ${endpoint}`);
        }
    });
});

describe('every filesystem/account-derived value is escaped before it reaches markup', () => {
    test('escapeHtml is destructured from AFM and used, not innerHTML with a raw interpolation', () => {
        assert.match(ADMIN_JS, /const\s*\{[^}]*escapeHtml[^}]*\}\s*=\s*window\.AFM/);
    });

    // Scoped to the three functions that actually build innerHTML - Toast
    // messages elsewhere in the file are a different, already-safe sink
    // (Toast.show escapes title/msg itself, app.js:395-396), so scanning the
    // whole file would false-positive on those.
    function functionBody(name) {
        const start = ADMIN_JS.indexOf(`function ${name}(`);
        assert.ok(start > -1, `${name} is defined`);
        let depth = 0;
        let i = ADMIN_JS.indexOf('{', start);
        for (; i < ADMIN_JS.length; i++) {
            if (ADMIN_JS[i] === '{') depth++;
            else if (ADMIN_JS[i] === '}') { depth--; if (depth === 0) break; }
        }
        return ADMIN_JS.slice(start, i + 1);
    }

    test('populateGrantUserSelect escapes username inline', () => {
        const body = functionBody('populateGrantUserSelect');
        const raw = [...body.matchAll(/\$\{(?!escapeHtml\()[^}]*username[^}]*\}/g)];
        assert.deepEqual(raw.map((m) => m[0]), [], 'an unescaped username interpolation exists');
    });

    test('renderUsersTable escapes the username once into a reused variable, not inline per use', () => {
        // Repeated across 5+ attributes/cells (name, aria-labels, data-username);
        // escaping once and reusing it is both correct and the one-line-per-value
        // AFM.escapeHtml discipline every other render function in this file follows.
        const body = functionBody('renderUsersTable');
        assert.match(body, /const\s+name\s*=\s*escapeHtml\(user\.username\)/);
        // And every later use is the escaped variable, not the raw property again.
        assert.doesNotMatch(body, /\$\{user\.username\}/);
    });

    test('loadPermissions escapes the resolved username once into a reused variable', () => {
        const body = functionBody('loadPermissions');
        assert.match(body, /const\s+username\s*=\s*escapeHtml\(/);
        assert.doesNotMatch(body, /\$\{user\.username\}/);
        assert.doesNotMatch(body, /\$\{user \? user\.username/);
    });

    test('renderPoliciesTable escapes client_path once into a reused variable', () => {
        const body = functionBody('renderPoliciesTable');
        assert.match(body, /const\s+pathEsc\s*=\s*escapeHtml\(policy\.client_path\)/);
        assert.doesNotMatch(body, /\$\{policy\.client_path\}/);
    });
});

describe('destructive actions are visually distinct, not just same-colored buttons (ui-ux-pro-max pass)', () => {
    test('delete/revoke actions carry the admin-danger-icon class', () => {
        for (const action of ['delete-user', 'delete-policy', 'revoke-permission']) {
            const re = new RegExp(`class="[^"]*admin-danger-icon[^"]*"[^>]*data-action="${action}"`);
            assert.match(ADMIN_JS, re, `${action} is styled as a destructive action`);
        }
    });

    test('non-destructive row actions do not carry the danger class', () => {
        for (const action of ['toggle-status', 'reset-password', 'revoke-sessions', 'manage-permissions', 'edit-policy']) {
            const re = new RegExp(`class="[^"]*admin-danger-icon[^"]*"[^>]*data-action="${action}"`);
            assert.doesNotMatch(ADMIN_JS, re, `${action} should not read as destructive`);
        }
    });

    test('admin.css gives admin-danger-icon a non-hover, default red treatment', () => {
        const css = read('public', 'assets', 'css', 'admin.css');
        assert.match(css, /\.admin-danger-icon\s*\{[^}]*color:\s*var\(--color-error\)/s);
    });
});

describe('every row-action icon button declares an aria-label and a bottom-placed tip (AGENTS.md 10a)', () => {
    test('every data-action button in admin.js has both', () => {
        const buttons = [...ADMIN_JS.matchAll(/<button class="btn-icon btn-icon-sm[^>]*data-action="[a-z-]+"[^>]*>/g)].map((m) => m[0]);
        assert.ok(buttons.length >= 7, `expected several row-action buttons, found ${buttons.length}`);
        for (const btn of buttons) {
            assert.match(btn, /aria-label="/, `missing aria-label: ${btn}`);
            assert.match(btn, /data-tip="/, `missing data-tip: ${btn}`);
            assert.match(btn, /data-tip-pos="bottom"/, `missing data-tip-pos="bottom": ${btn}`);
        }
    });
});

describe('Published/Locked use the shared switch component, not raw checkboxes (ui-ux-pro-max pass)', () => {
    test('admin.html reuses the existing .switch/.track pattern (uploads.html precedent)', () => {
        assert.match(ADMIN_HTML, /id="policyPublished"[\s\S]{0,80}<span class="track" aria-hidden="true">/);
        assert.match(ADMIN_HTML, /id="policyLocked"[\s\S]{0,80}<span class="track" aria-hidden="true">/);
    });

    test('no bare, unlabelled checkbox remains for these two fields', () => {
        assert.doesNotMatch(ADMIN_HTML, /<input type="checkbox" id="policyPublished">\s*Published/);
        assert.doesNotMatch(ADMIN_HTML, /<input type="checkbox" id="policyLocked">\s*Locked/);
    });
});

describe('editing an existing policy does not silently reset Published/Locked to off', () => {
    test('handleEditPolicy pre-fills the form from the clicked row, including both flags', () => {
        assert.match(ADMIN_JS, /function handleEditPolicy\(path\)/);
        assert.match(ADMIN_JS, /policyPublished'\)\.checked = policy\.is_published === 1/);
        assert.match(ADMIN_JS, /policyLocked'\)\.checked = policy\.is_locked === 1/);
    });

    test('the policies table offers an edit action wired to it', () => {
        assert.match(ADMIN_JS, /data-action="edit-policy"/);
        assert.match(ADMIN_JS, /btn\.dataset\.action === 'edit-policy'.*handleEditPolicy/);
    });
});

describe('the policies pane describes enforcement truthfully', () => {
    test('it states who is restricted and what a missing policy means', () => {
        assert.match(ADMIN_HTML, /Policies are enforced for every non-administrator account/i);
        assert.match(ADMIN_HTML, /Paths with no policy stay open/i);
        assert.match(ADMIN_HTML, /administrators are never restricted/i);
        assert.ok(!/does not yet change what this application serves/i.test(ADMIN_HTML),
            'the stale "nothing is enforced" notice must not come back');
    });
});

describe('every icon-only control carries an aria-label', () => {
    test('the logout button has aria-label', () => {
        const btn = ADMIN_HTML.match(/<button[^>]*data-action="logout"[^>]*>/);
        assert.ok(btn, 'logout button present');
        assert.match(btn[0], /aria-label="Log out"/);
    });
});

describe('tables degrade to an honest empty state, never a silent blank', () => {
    test('users table has a loading/empty row', () => {
        assert.match(ADMIN_JS, /No accounts yet\./);
    });

    test('policies table has a loading/empty row', () => {
        assert.match(ADMIN_JS, /No files have a policy yet\./);
    });

    test('a 403 from an admin-only call surfaces the admin notice, not a silent failure', () => {
        assert.match(ADMIN_JS, /error\.status === 403/);
        assert.match(ADMIN_JS, /showAdminNotice/);
    });
});
