// test/frontend/api-boundary.test.js
'use strict';

/**
 * The client side of the API boundary (api-v1-versioning-and-boundary, task 1.4;
 * capabilities api-client-boundary and api-error-contract).
 *
 * The REAL public/assets/js/api.js is evaluated in a vm context with stubbed
 * window, document, fetch, XMLHttpRequest and FormData, and every URL it can
 * produce is captured: JSON requests, uploads, single and multi-file downloads,
 * the ZIP form, and the thumbnail <img src>.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const API_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'api.js'), 'utf8');

/**
 * @param {{ global?: any, meta?: string|null, fetchImpl?: Function }} [config]
 */
function loadApi({ global, meta = null, fetchImpl } = {}) {
    const seen = { fetch: [], xhr: [], iframes: [], forms: [], timers: [] };

    const element = (tag) => {
        const el = { tagName: tag.toUpperCase(), style: {}, children: [], setAttribute() {}, appendChild(c) { this.children.push(c); }, remove() {} };
        if (tag === 'form') el.submit = () => seen.forms.push({ action: el.action, method: el.method, target: el.target });
        return el;
    };

    const sandbox = {
        console: { warn() {}, error() {}, log() {} },
        setTimeout: (fn, ms) => { seen.timers.push({ fn, ms }); return seen.timers.length; },
        FormData: class FormData {},
        document: {
            createElement: element,
            body: { appendChild(el) { if (el.tagName === 'IFRAME' && el.src) seen.iframes.push(el.src); } },
            querySelector(selector) {
                if (meta === null || selector !== 'meta[name="afm-api-base"]') return null;
                return { getAttribute: (n) => (n === 'content' ? meta : null), content: meta };
            },
        },
        fetch: fetchImpl || (async (url, init) => {
            seen.fetch.push({ url, init });
            return {
                ok: true, status: 200, statusText: 'OK',
                headers: { get: () => 'application/json' },
                json: async () => ({ ok: true }),
                text: async () => '',
            };
        }),
        XMLHttpRequest: function () {
            this.upload = {};
            this.open = (method, url) => seen.xhr.push({ method, url });
            this.send = () => {};
            this.abort = () => {};
        },
    };
    sandbox.window = sandbox;
    if (global !== undefined) sandbox.AFM_API_BASE = global;
    vm.createContext(sandbox);
    vm.runInContext(API_SRC, sandbox, { filename: 'api.js' });
    return { API: sandbox.API, seen };
}

/** Every URL the client can produce, given its current configuration. */
async function everyUrl(API, seen) {
    await API.get('/fs/list?path=%2F');
    await API.post('/fs/folder', { path: '/x' });
    await API.put('/settings', {});
    await API.del('/fs/delete', { paths: ['/x'] });
    API.upload('/fs/upload', {});
    API.downloadFile('/a.txt');
    API.downloadMultipleFiles(['/b.txt']);
    seen.timers.forEach((t) => t.fn());
    API.downloadZip(['/a.txt']);
    return [
        ...seen.fetch.map((f) => f.url),
        ...seen.xhr.map((x) => x.url),
        ...seen.iframes,
        ...seen.forms.map((f) => f.action),
        API.thumbnailUrl('/pic.png', 256),
    ];
}

describe('BASE_URL is resolved configuration (api-client-boundary)', () => {
    test('the default is the same-origin versioned prefix /api/v1', () => {
        assert.equal(loadApi().API.BASE_URL, '/api/v1');
    });

    test('a window.AFM_API_BASE override is honoured', () => {
        assert.equal(loadApi({ global: '/proxy/api/v1' }).API.BASE_URL, '/proxy/api/v1');
    });

    test('a <meta name="afm-api-base"> override is honoured', () => {
        assert.equal(loadApi({ meta: '/api' }).API.BASE_URL, '/api');
    });

    test('the global beats the meta tag', () => {
        assert.equal(loadApi({ global: '/from-global', meta: '/from-meta' }).API.BASE_URL, '/from-global');
    });

    test('an empty or whitespace override falls back - never an empty prefix', () => {
        for (const value of ['', '   ', '\t\n']) {
            assert.equal(loadApi({ global: value }).API.BASE_URL, '/api/v1', `global ${JSON.stringify(value)}`);
            assert.equal(loadApi({ meta: value }).API.BASE_URL, '/api/v1', `meta ${JSON.stringify(value)}`);
        }
    });

    test('an empty global falls through to the meta tag, not straight to the default', () => {
        assert.equal(loadApi({ global: '  ', meta: '/api' }).API.BASE_URL, '/api');
    });

    test('a non-string global is ignored rather than stringified', () => {
        assert.equal(loadApi({ global: 42 }).API.BASE_URL, '/api/v1');
        assert.equal(loadApi({ global: null, meta: '/api' }).API.BASE_URL, '/api');
    });

    test('override values are trimmed', () => {
        assert.equal(loadApi({ meta: '  /api/v1  ' }).API.BASE_URL, '/api/v1');
    });

    test('a trailing slash never produces a doubled separator', async () => {
        for (const base of ['/api/v1/', '/api/v1///', 'https://files.example.test/api/v1/']) {
            const { API, seen } = loadApi({ global: base });
            for (const url of await everyUrl(API, seen)) {
                assert.ok(!/[^:]\/\//.test(url), `${base} -> ${url}`);
            }
        }
    });

    test('resolution happens once: BASE_URL is frozen and stable across requests', async () => {
        const { API, seen } = loadApi({ meta: '/api/v1' });
        const first = API.BASE_URL;
        await API.get('/health');
        Reflect.set(API, 'BASE_URL', '/elsewhere');
        await API.get('/health');
        assert.equal(API.BASE_URL, first);
        assert.ok(Object.isFrozen(API), 'the public surface is frozen');
        assert.deepEqual(seen.fetch.map((f) => f.url), ['/api/v1/health', '/api/v1/health']);
    });

    test('the module works with no document at all (meta lookup is optional)', () => {
        const sandbox = { console, FormData: class {} };
        sandbox.window = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(API_SRC, sandbox);
        assert.equal(sandbox.API.BASE_URL, '/api/v1');
    });
});

describe('every API URL is built inside the boundary', () => {
    test('thumbnailUrl builds under the resolved base and encodes both parameters', () => {
        const { API } = loadApi();
        assert.equal(API.thumbnailUrl('/My Pics/a&b.png', 256),
            '/api/v1/fs/thumbnail?path=%2FMy%20Pics%2Fa%26b.png&size=256');
        assert.equal(API.thumbnailUrl('/x.png', '5&x=1'), '/api/v1/fs/thumbnail?path=%2Fx.png&size=5%26x%3D1');
    });

    test('JSON, upload, download, multi-download, ZIP and thumbnail URLs all carry the resolved base', async () => {
        const { API, seen } = loadApi();
        const urls = await everyUrl(API, seen);
        assert.equal(urls.length, 9);
        for (const url of urls) assert.ok(url.startsWith('/api/v1/'), url);
        assert.deepEqual(urls, [
            '/api/v1/fs/list?path=%2F',
            '/api/v1/fs/folder',
            '/api/v1/settings',
            '/api/v1/fs/delete',
            '/api/v1/fs/upload',
            '/api/v1/fs/download?path=%2Fa.txt',
            '/api/v1/fs/download?path=%2Fb.txt',
            '/api/v1/fs/download-zip',
            '/api/v1/fs/thumbnail?path=%2Fpic.png&size=256',
        ]);
    });

    test('a base-URL change moves every URL at once', async () => {
        const { API, seen } = loadApi({ global: 'https://files.example.test/api/v1' });
        for (const url of await everyUrl(API, seen)) {
            assert.ok(url.startsWith('https://files.example.test/api/v1/'), url);
        }
    });

    test('rollback is configuration-only: pointing the base at /api moves every URL to the legacy alias', async () => {
        const { API, seen } = loadApi({ meta: '/api' });
        for (const url of await everyUrl(API, seen)) {
            assert.ok(url.startsWith('/api/') && !url.startsWith('/api/v1'), url);
        }
    });

    test('there is no general-purpose URL escape hatch', () => {
        const { API } = loadApi();
        assert.deepEqual(Object.keys(API).sort(), [
            'BASE_URL', 'del', 'downloadFile', 'downloadMultipleFiles', 'downloadZip',
            'get', 'post', 'put', 'thumbnailUrl', 'upload',
        ]);
    });
});

describe('the boundary normalises failures (api-error-contract)', () => {
    const respond = (status, body) => async () => ({
        ok: status >= 200 && status < 300, status, statusText: 'X',
        headers: { get: () => 'application/json' },
        json: async () => body,
        text: async () => JSON.stringify(body),
    });

    test('a failing response exposes its status, and no kind is invented', async () => {
        const { API } = loadApi({ fetchImpl: respond(404, { success: false, error: 'Item not found.' }) });
        await assert.rejects(API.get('/fs/list', { silent: true }), (err) => {
            assert.equal(err.status, 404);
            assert.equal(err.message, 'Item not found.');
            assert.equal(err.kind, undefined);
            assert.ok(!('kind' in err));
            return true;
        });
    });

    test('a string kind from the server is attached verbatim', async () => {
        const { API } = loadApi({ fetchImpl: respond(409, { success: false, error: 'Exists.', kind: 'conflict' }) });
        await assert.rejects(API.get('/fs/x', { silent: true }), (err) => err.kind === 'conflict' && err.status === 409);
    });

    test('a non-string kind is not attached', async () => {
        const { API } = loadApi({ fetchImpl: respond(400, { success: false, error: 'Bad.', kind: 7 }) });
        await assert.rejects(API.get('/fs/x', { silent: true }), (err) => !('kind' in err) && err.status === 400);
    });

    test('a transport failure carries status 0', async () => {
        const { API } = loadApi({ fetchImpl: async () => { throw new TypeError('Failed to fetch'); } });
        await assert.rejects(API.get('/health', { silent: true }), (err) => err.status === 0);
    });
});
