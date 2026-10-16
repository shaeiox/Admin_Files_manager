// test/frontend/api.test.js
'use strict';

/**
 * Client session renewal in the REAL public/assets/js/api.js
 * (access-refresh-session-tokens, task group 6), evaluated in a vm with
 * Node's WebCrypto and a Map-backed IndexedDB stand-in.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { verifyDpopProof, publicJwkThumbprint } = require('../../src/utils/crypto');

const API_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'api.js'), 'utf8');

/** IndexedDB over a Map that outlives one "page load" (pass the same Map again). */
function fakeIndexedDB(map) {
    return {
        open() {
            const req = {};
            queueMicrotask(() => {
                req.result = {
                    close() {},
                    transaction() {
                        const tx = {
                            objectStore: () => ({
                                get: (k) => ({ result: map.get(k) }),
                                put: (v, k) => { map.set(k, v); return { result: k }; },
                            }),
                        };
                        queueMicrotask(() => tx.oncomplete && tx.oncomplete());
                        return tx;
                    },
                };
                req.onsuccess();
            });
            return req;
        },
    };
}

/**
 * @param {(url: string, init: any, calls: any[]) => {status: number, body?: any}} respond
 */
function loadApi(respond, { store = new Map(), counters = { generated: 0 } } = {}) {
    const calls = [];
    const location = { pathname: '/files.html', search: '?path=%2Fdocs', href: 'http://app.test/files.html?path=%2Fdocs' };
    const subtle = Object.create(webcrypto.subtle);
    subtle.generateKey = (...args) => { counters.generated += 1; return webcrypto.subtle.generateKey(...args); };
    subtle.exportKey = (...args) => webcrypto.subtle.exportKey(...args);
    subtle.sign = (...args) => webcrypto.subtle.sign(...args);
    const sandbox = {
        console: { warn() {}, error() {}, log() {} },
        setTimeout,
        queueMicrotask,
        TextEncoder,
        URL,
        btoa,
        FormData: class FormData {},
        crypto: { subtle, randomUUID: () => webcrypto.randomUUID() },
        indexedDB: fakeIndexedDB(store),
        location,
        document: { querySelector: () => null },
        fetch: async (url, init = {}) => {
            calls.push({ url, init });
            const { status, body = {} } = respond(url, init, calls);
            return {
                ok: status >= 200 && status < 300, status, statusText: 'X',
                headers: { get: () => 'application/json' },
                json: async () => body,
                text: async () => JSON.stringify(body),
            };
        },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(API_SRC, sandbox, { filename: 'api.js' });
    return { API: sandbox.API, calls, location, store, counters };
}

const isRefresh = (url) => url.endsWith('/auth/refresh');

describe('401 renewal (single-flight, replay once)', () => {
    test('three concurrent 401s trigger exactly one refresh, and each call is replayed once', async () => {
        let renewed = false;
        const { API, calls } = loadApi((url) => {
            if (isRefresh(url)) { renewed = true; return { status: 200, body: { success: true, csrfToken: 'fresh' } }; }
            return renewed ? { status: 200, body: { url } } : { status: 401, body: { success: false, error: 'x' } };
        });
        const results = await Promise.all([API.get('/fs/list'), API.get('/dashboard/summary'), API.get('/auth/me')]);
        assert.equal(calls.filter((c) => isRefresh(c.url)).length, 1);
        assert.equal(calls.length, 7); // 3 originals + 1 refresh + 3 replays
        assert.deepEqual(results.map((r) => r.url), ['/api/v1/fs/list', '/api/v1/dashboard/summary', '/api/v1/auth/me']);
    });

    test('the refresh carries a DPoP proof that the server-side verifier accepts', async () => {
        const { API, calls, store } = loadApi((url) => (isRefresh(url) ? { status: 200 } : { status: calls.length > 2 ? 200 : 401 }));
        await API.get('/fs/list');
        const refresh = calls.find((c) => isRefresh(c.url));
        const pair = store.get('device');
        const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
        assert.equal(verifyDpopProof(refresh.init.headers.DPoP, {
            method: 'POST', path: '/api/v1/auth/refresh', thumbprint: publicJwkThumbprint(jwk),
        }), true);
        assert.equal(pair.privateKey.extractable, false);
    });

    test('a failed renewal goes to login and preserves the destination, without a replay', async () => {
        const { API, calls, location } = loadApi(() => ({ status: 401, body: { success: false, error: 'x' } }));
        await assert.rejects(API.get('/fs/list'), (e) => e.status === 401);
        assert.equal(calls.length, 2); // original + one refresh
        assert.equal(location.href, `login.html?redirect=${encodeURIComponent('/files.html?path=%2Fdocs')}`);
    });

    test('a 401 on the replay goes to login; renewal is not attempted again', async () => {
        const { API, calls, location } = loadApi((url) => (isRefresh(url) ? { status: 200 } : { status: 401 }));
        await assert.rejects(API.get('/fs/list'), (e) => e.status === 401);
        assert.equal(calls.filter((c) => isRefresh(c.url)).length, 1);
        assert.equal(calls.length, 3);
        assert.match(location.href, /^login\.html\?redirect=/);
    });

    test('skipAuthRedirect (the login form) never renews or redirects', async () => {
        const { API, calls, location } = loadApi(() => ({ status: 401, body: { success: false, error: 'Invalid' } }));
        await assert.rejects(API.post('/auth/login', {}, { skipAuthRedirect: true, silent: true }), (e) => e.status === 401);
        assert.equal(calls.length, 1);
        assert.equal(location.href, 'http://app.test/files.html?path=%2Fdocs');
    });
});

describe('device key persistence', () => {
    test('a second page load reuses the stored key instead of generating another', async () => {
        const store = new Map();
        const counters = { generated: 0 };
        const first = await loadApi(() => ({ status: 200 }), { store, counters }).API.devicePublicJwk();
        const second = await loadApi(() => ({ status: 200 }), { store, counters }).API.devicePublicJwk();
        assert.equal(counters.generated, 1);
        assert.equal(JSON.stringify(second), JSON.stringify(first)); // vm objects: compare by value
        assert.deepEqual(Object.keys(first).sort(), ['crv', 'kty', 'x', 'y']);
    });
});
