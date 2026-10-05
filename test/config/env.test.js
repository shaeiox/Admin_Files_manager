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
