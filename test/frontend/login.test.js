// test/frontend/login.test.js
'use strict';

/**
 * Login page contract (ADR-009). Source-level assertions, same style as
 * notifications.test.js: the open-redirect guard is the one property here
 * that actually matters for security, so it gets a real functional test,
 * not just a regex.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT_DIR = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(ROOT_DIR, ...p), 'utf8');

const LOGIN_HTML = read('public', 'login.html');
const LOGIN_JS = read('public', 'assets', 'js', 'login.js');
const APP_JS = read('public', 'assets', 'js', 'app.js');

describe('login.html is a standalone page, outside the router', () => {
    test('loads only api.js, app.js and login.js - no sidebar/router chrome', () => {
        for (const file of ['api.js', 'app.js', 'login.js']) {
            assert.match(LOGIN_HTML, new RegExp(`assets/js/${file.replace('.', '\\.')}`));
        }
        for (const file of ['sidebar.js', 'router.js', 'notifications.js']) {
            assert.doesNotMatch(LOGIN_HTML, new RegExp(`assets/js/${file.replace('.', '\\.')}`));
        }
    });

    test('declares the same-origin API base', () => {
        assert.match(LOGIN_HTML, /<meta name="afm-api-base" content="\/api\/v1">/);
    });

    test('is not registered in router.js PAGES (reached by real navigation, never SPA-swapped)', () => {
        const routerJs = read('public', 'assets', 'js', 'router.js');
        assert.doesNotMatch(routerJs, /'login\.html'/);
    });

    test('app.js skips initApp on the login page', () => {
        assert.match(APP_JS, /document\.body\.dataset\.page === 'login'/);
    });
});

describe('the login request never redirects itself or shows the generic error toast', () => {
    test('calls API.post with skipAuthRedirect and silent', () => {
        assert.match(LOGIN_JS, /skipAuthRedirect:\s*true/);
        assert.match(LOGIN_JS, /silent:\s*true/);
    });

    test('sets the CSRF token from the login response before navigating away', () => {
        assert.match(LOGIN_JS, /window\.API\.setCsrfToken\(result\.csrfToken\)/);
    });
});

describe('safeRedirectTarget - the open-redirect guard', () => {
    // login.js is an IIFE with no exports, so the guard is exercised the same
    // way the rest of this suite treats vanilla scripts: evaluate it in a vm
    // with a minimal window/document/location stub and call the function
    // through a reconstructed copy, since the real one is not exported.
    function extractFunctionSource(source, name) {
        const start = source.indexOf(`function ${name}(`);
        assert.ok(start > -1, `${name} is defined in login.js`);
        let depth = 0;
        let i = source.indexOf('{', start);
        const bodyStart = i;
        for (; i < source.length; i++) {
            if (source[i] === '{') depth++;
            else if (source[i] === '}') {
                depth--;
                if (depth === 0) break;
            }
        }
        return source.slice(start, i + 1);
    }

    function safeRedirectTarget(search) {
        const fnSource = extractFunctionSource(LOGIN_JS, 'safeRedirectTarget');
        const sandbox = { window: { location: { search } }, URLSearchParams };
        vm.createContext(sandbox);
        const script = new vm.Script(`(${fnSource})()`);
        return script.runInContext(sandbox);
    }

    test('no redirect param defaults to index.html', () => {
        assert.equal(safeRedirectTarget(''), 'index.html');
    });

    test('a root-relative path is honoured', () => {
        assert.equal(safeRedirectTarget('?redirect=%2Fadmin.html'), '/admin.html');
    });

    test('an absolute URL is refused (open-redirect guard)', () => {
        assert.equal(safeRedirectTarget('?redirect=' + encodeURIComponent('https://evil.example/phish')), 'index.html');
    });

    test('a protocol-relative URL is refused', () => {
        assert.equal(safeRedirectTarget('?redirect=' + encodeURIComponent('//evil.example/phish')), 'index.html');
    });

    test('a non-rooted path is refused', () => {
        assert.equal(safeRedirectTarget('?redirect=admin.html'), 'index.html');
    });

    test('a javascript: URL is refused (no leading slash)', () => {
        assert.equal(safeRedirectTarget('?redirect=' + encodeURIComponent('javascript:alert(1)')), 'index.html');
    });
});

describe('the error message is shown via textContent, never innerHTML', () => {
    test('showError sets textContent', () => {
        assert.match(LOGIN_JS, /el\.textContent = message/);
        assert.doesNotMatch(LOGIN_JS, /innerHTML/);
    });
});
