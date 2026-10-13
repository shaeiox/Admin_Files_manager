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

    test('username is never interpolated into innerHTML markup without escapeHtml', () => {
        for (const fn of ['renderUsersTable', 'populateGrantUserSelect', 'loadPermissions']) {
            const body = functionBody(fn);
            const raw = [...body.matchAll(/\$\{(?!escapeHtml\()[^}]*username[^}]*\}/g)];
            assert.deepEqual(raw.map((m) => m[0]), [], `${fn}: an unescaped username interpolation exists`);
        }
    });

    test('client_path is never interpolated into innerHTML markup without escapeHtml', () => {
        for (const fn of ['renderPoliciesTable']) {
            const body = functionBody(fn);
            const raw = [...body.matchAll(/\$\{(?!escapeHtml\()[^}]*client_path[^}]*\}/g)];
            assert.deepEqual(raw.map((m) => m[0]), [], `${fn}: an unescaped client_path interpolation exists`);
        }
    });
});

describe('the data model vs. enforcement distinction is disclosed truthfully (design D5)', () => {
    test('the policies pane states plainly that nothing is enforced yet', () => {
        assert.match(ADMIN_HTML, /does not yet change what this application serves/i);
        assert.match(ADMIN_HTML, /nothing currently\s+checks it before a download/i);
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
