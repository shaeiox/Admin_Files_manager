// test/integration/csp.test.js
'use strict';

/**
 * A Content-Security-Policy is enabled (api-security-hardening,
 * "A Content-Security-Policy Is Enabled").
 *
 * Two halves, and the second is the one that matters: the policy is only real if
 * the markup it applies to is compatible with it. A CSP the shipped pages violate
 * is a policy the operator will be tempted to switch off, so the shells are pinned
 * source-side: no inline <script>, no inline event handler, scripts external only.
 *
 * style-src is deliberately still 'unsafe-inline' (13 inline style= attributes live
 * in the page modules' innerHTML templates). That is asserted as a KNOWN gap so it
 * cannot quietly widen - and so the day the templates are cleaned, the failure
 * tells you to tighten the policy.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { applyBootstrapEnv, redirectAdminDb, login: authLogin } = require('../helpers/authenticated');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-csp-'));
const ROOT = path.join(TMP, 'root');
const DATA = path.join(TMP, 'data');
fs.mkdirSync(ROOT, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

const PAGES = ['index.html', 'files.html', 'uploads.html', 'settings.html', 'admin.html'];
const REPO = path.join(__dirname, '..', '..');

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_DATA = process.env.AFM_DATA_DIR;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_DATA_DIR = DATA;

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;
applyBootstrapEnv();
redirectAdminDb(path.join(TMP, 'admin.sqlite'));

let server;
let port;
let authHeaders = {};

function request(pathname) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: pathname, headers: authHeaders, agent: false }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }).on('error', reject);
    });
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
    authHeaders = (await authLogin(port)).headers;
});

after(async () => {
    if (server && server.closeAllConnections) server.closeAllConnections();
    if (server) await new Promise((r) => server.close(r));
    if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT; else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
    if (ORIGINAL_PORT === undefined) delete process.env.PORT; else process.env.PORT = ORIGINAL_PORT;
    if (ORIGINAL_DATA === undefined) delete process.env.AFM_DATA_DIR; else process.env.AFM_DATA_DIR = ORIGINAL_DATA;
    // Close the admin-db connection before recursively removing TMP: on Windows an
    // open node:sqlite handle (WAL file) makes the directory undeletable (EPERM).
    require('../../src/db/connection').reset();
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('every response carries a Content-Security-Policy', () => {
    test('a document response sends a real policy', async () => {
        const csp = (await request('/')).headers['content-security-policy'];
        assert.ok(csp, 'a CSP header is present');
        assert.match(csp, /default-src 'self'/);
    });

    test('script execution is same-origin, with no unsafe-inline and no eval', async () => {
        const csp = (await request('/')).headers['content-security-policy'];
        const scriptSrc = csp.match(/script-src ([^;]*)/);
        assert.ok(scriptSrc, 'the policy states script-src');
        assert.match(scriptSrc[1], /'self'/);
        assert.ok(!/'unsafe-inline'/.test(scriptSrc[1]),
            'script-src must not permit inline script - that is the whole point');
        assert.ok(!/unsafe-eval/.test(csp), 'no eval is permitted anywhere in the policy');
    });

    test('the base directives that stop hijacking are present', async () => {
        const csp = (await request('/')).headers['content-security-policy'];
        assert.match(csp, /object-src 'none'/);
        assert.match(csp, /base-uri 'self'/);
        assert.match(csp, /frame-ancestors 'self'/);
    });

    test('API responses carry the policy too', async () => {
        assert.ok((await request('/api/v1/health')).headers['content-security-policy'],
            'the policy is not document-only');
    });
});

describe('the shipped markup is compatible with the policy', () => {
    test('no page shell contains an inline <script> block', () => {
        for (const page of PAGES) {
            const html = fs.readFileSync(path.join(REPO, 'public', page), 'utf8');
            assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html),
                `${page} has an inline script`);
        }
    });

    test('no page shell contains an inline event handler attribute', () => {
        for (const page of PAGES) {
            const html = fs.readFileSync(path.join(REPO, 'public', page), 'utf8');
            assert.deepEqual(html.match(/\son[a-z]+\s*=/gi) || [], [], `${page} has an inline on* handler`);
        }
    });

    test('every page module is loaded as an external file', () => {
        for (const page of PAGES) {
            const html = fs.readFileSync(path.join(REPO, 'public', page), 'utf8');
            const scripts = html.match(/<script\b[^>]*>/gi) || [];
            assert.ok(scripts.length > 0, `${page} loads at least one script`);
            for (const tag of scripts) {
                assert.match(tag, /\bsrc=/i, `${page} loads a script without src`);
            }
        }
    });

    test('every referenced stylesheet and script actually exists', () => {
        for (const page of PAGES) {
            const html = fs.readFileSync(path.join(REPO, 'public', page), 'utf8');
            for (const [, ref] of html.matchAll(/(?:href|src)="(assets\/[^"]+)"/g)) {
                assert.ok(fs.existsSync(path.join(REPO, 'public', ref)), `${page} references missing ${ref}`);
            }
        }
    });
});

describe('the deliberate gap in style-src is recorded, not hidden', () => {
    test('style-src still permits inline styles, asserted here on purpose', async () => {
        const csp = (await request('/')).headers['content-security-policy'];
        const styleSrc = csp.match(/style-src ([^;]*)/);
        assert.ok(styleSrc, 'the policy states style-src');
        assert.match(styleSrc[1], /'unsafe-inline'/,
            "inline styles are still required by the renderers; if this fails, the "
            + 'templates were cleaned up and style-src should be tightened');
    });

    test('fonts are self-hosted, so no font or stylesheet host is allowed', async () => {
        const csp = (await request('/')).headers['content-security-policy'];
        assert.match(csp, /font-src 'self'(;|$)/, 'DM Sans and Inter are served from /assets/fonts');
        assert.doesNotMatch(csp, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
    });
});