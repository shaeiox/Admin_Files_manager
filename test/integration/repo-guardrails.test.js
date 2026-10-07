// test/integration/repo-guardrails.test.js
'use strict';

/**
 * Repository-level guardrails (files-page-correctness, regression-guardrails).
 * Structural facts no runtime test observes: how the suite is discovered, what
 * the manifest depends on, and what version control ignores.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map((l) => l.trim());

describe('the test command', () => {
    test('discovery is scoped to the test directory', () => {
        assert.match(pkg.scripts.test, /^node --test "test\/\*\*\/\*\.test\.js"$/);
    });

    test('the Files page module suite exists where that glob discovers it', () => {
        assert.ok(fs.existsSync(path.join(ROOT, 'test', 'frontend', 'files.test.js')));
    });
});

describe('the dependency manifest', () => {
    test('lists no dependency introduced by this change', () => {
        assert.deepEqual(Object.keys(pkg.dependencies).sort(),
            ['archiver', 'cors', 'dotenv', 'express', 'helmet', 'morgan', 'multer']);
        assert.deepEqual(Object.keys(pkg.devDependencies || {}).sort(), ['nodemon']);
    });
});

describe('version control', () => {
    test('the environment file is ignored by an active (uncommented) rule', () => {
        assert.ok(gitignore.includes('.env'));
    });

    test('the scratch directory is ignored', () => {
        assert.ok(gitignore.includes('temp/'));
    });
});

/* ── api-v1-versioning-and-boundary (task 1.5, api-client-boundary) ──
   Additive only: the assertions above are unchanged. These pin that
   public/assets/js/api.js is the single frontend egress and the only place
   that knows where the API lives. */

describe('the frontend API boundary', () => {
    const JS_DIR = path.join(ROOT, 'public', 'assets', 'js');
    const modules = fs.readdirSync(JS_DIR).filter((f) => f.endsWith('.js'));
    /** Source with comments removed, so prose in a docblock neither passes nor fails a check. */
    const code = (file) => fs.readFileSync(path.join(JS_DIR, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

    test('the boundary module exists and the scan covers every page module', () => {
        for (const f of ['api.js', 'app.js', 'dashboard.js', 'files.js', 'notifications.js', 'router.js', 'settings.js', 'uploads.js']) {
            assert.ok(modules.includes(f), `${f} is scanned`);
        }
    });

    test('no frontend module other than api.js contains the /api prefix as a literal', () => {
        for (const f of modules.filter((m) => m !== 'api.js')) {
            assert.ok(!/['"`]\/api(\/|['"`])/.test(code(f)), `${f} hardcodes an /api path`);
        }
    });

    test('no page shell hardcodes an API path outside the base-URL meta tag', () => {
        for (const page of ['index.html', 'files.html', 'uploads.html', 'settings.html']) {
            const html = fs.readFileSync(path.join(ROOT, 'public', page), 'utf8')
                .replace(/<meta name="afm-api-base" content="[^"]*">/, '');
            assert.ok(!/["'`]\/api(\/|["'`])/.test(html), `${page} hardcodes an /api path`);
        }
    });

    test('only api.js and router.js call fetch(), and router.js fetches page markup only', () => {
        const callers = modules.filter((f) => /\bfetch\s*\(/.test(code(f))).sort();
        assert.deepEqual(callers, ['api.js', 'router.js']);
        const routerFetches = [...code('router.js').matchAll(/\bfetch\s*\(\s*([^,)]+)/g)].map((m) => m[1].trim());
        assert.deepEqual(routerFetches, ['path'], 'router.js fetches a page path, not an API endpoint');
    });

    test('no XMLHttpRequest outside api.js', () => {
        for (const f of modules.filter((m) => m !== 'api.js')) {
            assert.ok(!/new\s+XMLHttpRequest/.test(code(f)), `${f} opens its own XHR`);
        }
    });

    test('no module reads API.BASE_URL to build a path', () => {
        for (const f of modules.filter((m) => m !== 'api.js')) {
            assert.ok(!/\bBASE_URL\b/.test(code(f)), `${f} reads BASE_URL`);
        }
    });

    test('no consumer module carries its own version string', () => {
        for (const f of modules.filter((m) => m !== 'api.js')) {
            assert.ok(!/['"`]\/v\d+\//.test(code(f)), `${f} hardcodes a version segment`);
        }
    });

    test('the shipped configuration is same-origin: no absolute API base anywhere', () => {
        const api = code('api.js');
        assert.ok(!/https?:\/\//.test(api), 'api.js names no host');
        for (const page of ['index.html', 'files.html', 'uploads.html', 'settings.html']) {
            const html = fs.readFileSync(path.join(ROOT, 'public', page), 'utf8');
            const meta = html.match(/<meta name="afm-api-base" content="([^"]*)">/);
            assert.ok(meta, `${page} declares the API base`);
            assert.equal(meta[1], '/admin/v1', `${page} ships the same-origin default`);
            assert.ok(!/AFM_API_BASE/.test(html), `${page} sets no global override`);
        }
    });

    test('the dependency manifest is still exactly the pre-change list', () => {
        assert.deepEqual(Object.keys(pkg.dependencies).sort(),
            ['archiver', 'cors', 'dotenv', 'express', 'helmet', 'morgan', 'multer']);
    });
});

/* ── api-security-hardening (CORS default-off) ──
   Structural fact: server.js must never register the CORS middleware with its
   permissive defaults. Cross-origin access is opt-in via config.cors, so a bare
   `cors()` call is a regression even if runtime tests are skipped. */

describe('the CORS posture in server.js', () => {
    /** server.js with comments removed, so explanatory prose cannot satisfy the check. */
    const serverCode = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

    test('cors() is never registered with empty options', () => {
        assert.ok(!/cors\(\s*\)/.test(serverCode),
            'server.js calls cors() with defaults, which would re-enable open CORS');
    });

    test('the cors middleware is gated on config.cors.enabled', () => {
        assert.match(serverCode, /if\s*\(\s*config\.cors\.enabled\s*\)/,
            'CORS registration is not guarded by the enable flag');
    });
});
