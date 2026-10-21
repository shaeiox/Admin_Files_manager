// test/config/env.test.js
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// config/env snapshots process.env at require time, and dotenv never overrides
// set vars, so values are read once. The repo .env carries no AFM_CORS_* /
// AFM_UPLOAD_FREE_SPACE_BYTES, so the documented defaults apply.
const config = require('../../src/config/env');

describe('config/env CORS defaults (same-origin)', () => {
    test('CORS is disabled by default', () => {
        assert.equal(config.cors.enabled, false);
    });

    test('default upload free-space watermark applies when unset', () => {
        // DEFAULT_UPLOAD_FREE_SPACE_BYTES is 100 MiB unless overridden.
        assert.equal(config.uploadFreeSpaceBytes, 100 * 1024 * 1024);
    });
});

describe('validateStartup: CORS allowlist', () => {
    function problems(source) {
        return config.validateStartup({ ...source });
    }

    test('an unset AFM_CORS_ENABLED leaves CORS off (no problem)', () => {
        const p = problems({ NODE_ENV: 'development' });
        assert.ok(!p.some((m) => m.includes('AFM_CORS')), p.join('\n'));
    });

    test('a malformed allowlist entry yields a problem', () => {
        const p = problems({
            NODE_ENV: 'development',
            AFM_CORS_ALLOWED_ORIGINS: 'not-a-url, https://example.com/path',
        });
        assert.ok(p.some((m) => m.includes('AFM_CORS_ALLOWED_ORIGINS')), p.join('\n'));
    });

    test('wildcards are refused when NODE_ENV=production', () => {
        const p = problems({
            NODE_ENV: 'production',
            AFM_CORS_ALLOW_WILDCARD: 'true',
        });
        assert.ok(p.some((m) => m.includes('AFM_CORS_ALLOW_WILDCARD')), p.join('\n'));
    });

    test('a valid https allowlist entry passes', () => {
        const p = problems({
            NODE_ENV: 'development',
            AFM_CORS_ENABLED: 'true',
            AFM_CORS_ALLOWED_ORIGINS: 'https://files.example.internal',
        });
        assert.ok(!p.some((m) => m.includes('AFM_CORS')), p.join('\n'));
    });
});

describe('validateStartup: upload free-space watermark', () => {
    test('a non-numeric value is a problem', () => {
        const p = config.validateStartup({ AFM_UPLOAD_FREE_SPACE_BYTES: 'abc' });
        assert.ok(p.some((m) => m.includes('AFM_UPLOAD_FREE_SPACE_BYTES')), p.join('\n'));
    });

    test('a negative value is a problem', () => {
        const p = config.validateStartup({ AFM_UPLOAD_FREE_SPACE_BYTES: '-5' });
        assert.ok(p.some((m) => m.includes('AFM_UPLOAD_FREE_SPACE_BYTES')), p.join('\n'));
    });
});

describe('validateStartup: bootstrap-admin credentials (ADR-009)', () => {
    test('neither variable set is not a problem', () => {
        const p = config.validateStartup({ NODE_ENV: 'development' });
        assert.ok(!p.some((m) => m.includes('AFM_BOOTSTRAP_ADMIN')), p.join('\n'));
    });

    test('both variables set with a long-enough password is not a problem', () => {
        const p = config.validateStartup({
            AFM_BOOTSTRAP_ADMIN_USERNAME: 'admin',
            AFM_BOOTSTRAP_ADMIN_PASSWORD: 'a-long-enough-password',
        });
        assert.ok(!p.some((m) => m.includes('AFM_BOOTSTRAP_ADMIN')), p.join('\n'));
    });

    test('username without password is a problem', () => {
        const p = config.validateStartup({ AFM_BOOTSTRAP_ADMIN_USERNAME: 'admin' });
        assert.ok(p.some((m) => m.includes('AFM_BOOTSTRAP_ADMIN_USERNAME and AFM_BOOTSTRAP_ADMIN_PASSWORD')), p.join('\n'));
    });

    test('password without username is a problem', () => {
        const p = config.validateStartup({ AFM_BOOTSTRAP_ADMIN_PASSWORD: 'a-long-enough-password' });
        assert.ok(p.some((m) => m.includes('AFM_BOOTSTRAP_ADMIN_USERNAME and AFM_BOOTSTRAP_ADMIN_PASSWORD')), p.join('\n'));
    });

    test('a password shorter than 8 characters is a problem', () => {
        const p = config.validateStartup({
            AFM_BOOTSTRAP_ADMIN_USERNAME: 'admin',
            AFM_BOOTSTRAP_ADMIN_PASSWORD: 'short',
        });
        assert.ok(p.some((m) => m.includes('AFM_BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters')), p.join('\n'));
    });
});

describe('listen address', () => {
    // Regression: the server bound every interface, so on the Linux host port
    // 3000 answered directly - around nginx's TLS and basic-auth gate, and with
    // `trust proxy` a direct caller could forge X-Forwarded-For past the login
    // rate limit. nginx proxies to 127.0.0.1, so production binds loopback.
    test('production binds loopback unless HOST says otherwise', () => {
        assert.equal(config.listenHost({ NODE_ENV: 'production' }), '127.0.0.1');
        assert.equal(config.listenHost({ NODE_ENV: 'production', HOST: '0.0.0.0' }), '0.0.0.0');
    });

    test('development keeps the historical all-interfaces bind', () => {
        assert.equal(config.listenHost({ NODE_ENV: 'development' }), undefined);
        assert.equal(config.listenHost({}), undefined);
    });
});

describe('validateStartup: session token lifetimes (access-refresh-session-tokens)', () => {
    test('defaults are 15 min access, 30 d refresh, 10 s grace, 1 y absolute cap', () => {
        assert.deepEqual(config.sessionTokens, {
            accessTtlSeconds: 900, refreshTtlSeconds: 2592000, refreshGraceSeconds: 10, absoluteTtlSeconds: 31536000,
        });
    });

    test('an out-of-range value is refused, naming the variable, never clamped', () => {
        for (const [name, bad] of [['AFM_ACCESS_TTL_SECONDS', '3601'], ['AFM_REFRESH_TTL_SECONDS', '31536001'],
            ['AFM_ACCESS_TTL_SECONDS', '0'], ['AFM_REFRESH_GRACE_SECONDS', 'ten']]) {
            const p = config.validateStartup({ [name]: bad });
            assert.ok(p.some((m) => m.startsWith(name)), `${name}=${bad}: ${p.join(' | ')}`);
        }
    });

    test('the maxima themselves are accepted', () => {
        const p = config.validateStartup({ AFM_ACCESS_TTL_SECONDS: '3600', AFM_REFRESH_TTL_SECONDS: '31536000' });
        assert.ok(!p.some((m) => /TTL_SECONDS/.test(m)), p.join(' | '));
    });
});

describe('validateStartup: root isolation (isolate-app-roots)', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');

    // A fake code folder with a space in its name, plus folders around it.
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-iso-'));
    const code = path.join(base, 'relocated app');
    const data = path.join(base, 'state');
    const storage = path.join(base, 'storage');
    for (const d of [code, path.join(code, 'data'), data, storage]) fs.mkdirSync(d, { recursive: true });

    const iso = (env) => config.isolationProblems(env, code);

    test('state and storage outside the code folder: no problem', () => {
        assert.deepEqual(iso({ AFM_DATA_DIR: data, STORAGE_ROOT: storage }), []);
    });

    test('AFM_DATA_DIR inside the code folder is reported', () => {
        const p = iso({ AFM_DATA_DIR: path.join(code, 'data'), STORAGE_ROOT: storage });
        assert.ok(p.some((m) => m.startsWith('AFM_DATA_DIR')), p.join('\n'));
    });

    test('STORAGE_ROOT containing the code folder is reported', () => {
        const p = iso({ AFM_DATA_DIR: data, STORAGE_ROOT: base });
        assert.ok(p.some((m) => m.includes('overlaps the application folder')), p.join('\n'));
        assert.ok(p.some((m) => m.includes('overlaps AFM_DATA_DIR')), p.join('\n'));
    });

    test('STORAGE_ROOT inside the code folder is reported', () => {
        const p = iso({ AFM_DATA_DIR: data, STORAGE_ROOT: path.join(code, 'data') });
        assert.ok(p.some((m) => m.includes('overlaps the application folder')), p.join('\n'));
    });

    test('a symlink cannot hide the overlap', (t) => {
        const link = path.join(base, 'link-to-code-data');
        try { fs.symlinkSync(path.join(code, 'data'), link, 'dir'); } catch { return t.skip('symlinks unavailable'); }
        const p = iso({ AFM_DATA_DIR: link, STORAGE_ROOT: storage });
        assert.ok(p.some((m) => m.startsWith('AFM_DATA_DIR')), p.join('\n'));
    });

    test('a sibling with a shared name prefix is not an overlap', () => {
        const sibling = code + '-storage';
        fs.mkdirSync(sibling, { recursive: true });
        assert.deepEqual(iso({ AFM_DATA_DIR: data, STORAGE_ROOT: sibling }), []);
    });

    test('production refuses, development does not', () => {
        const env = { STORAGE_ROOT: storage, AFM_DATA_DIR: path.join(config.CODE_DIR, 'data') };
        const prod = config.validateStartup({ ...env, NODE_ENV: 'production' });
        const dev = config.validateStartup({ ...env, NODE_ENV: 'development' });
        assert.ok(prod.some((m) => m.includes('inside the application folder')), prod.join('\n'));
        assert.ok(!dev.some((m) => m.includes('inside the application folder')), dev.join('\n'));
    });
});
