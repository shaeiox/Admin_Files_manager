// test/integration/security-docs.test.js
'use strict';

/**
 * The security posture is documented where an operator will actually read it
 * (api-security-hardening, tasks 9.1 / 9.2).
 *
 * Docs that describe the *previous* posture are worse than no docs: an operator
 * sizing a firewall or debugging a rejected upload reads "CORS admits any
 * origin" and believes the exposure is still open, or reads "CSP is disabled"
 * and misses a header they could have relied on. These tests fail when the prose
 * drifts from the behaviour, which is the only thing that keeps them true.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Every AFM_* / rate-limit variable the code actually reads. */
const SECURITY_VARS = [
    'AFM_CORS_ENABLED',
    'AFM_CORS_ALLOWED_ORIGINS',
    'AFM_CORS_ALLOW_WILDCARD',
    'AFM_UPLOAD_FREE_SPACE_BYTES',
    'AFM_UPLOAD_MAX_CONCURRENT',
    'AFM_RATE_LIMIT_WRITE_PER_MINUTE',
    'AFM_RATE_LIMIT_READ_PER_MINUTE',
];

describe('every security variable is documented for the operator', () => {
    test('.env.example names each one', () => {
        const example = read('.env.example');
        for (const name of SECURITY_VARS) {
            assert.ok(example.includes(name), `.env.example does not mention ${name}`);
        }
    });

    test('the runbook documents each one with its default', () => {
        const runbook = read('docs/DEPLOYMENT.md');
        for (const name of SECURITY_VARS) {
            assert.ok(runbook.includes(name), `DEPLOYMENT.md does not document ${name}`);
        }
        assert.match(runbook, /AFM_CORS_ENABLED[^\n]*\|[^\n]*`false`/,
            'the CORS default-off value is not stated next to its variable');
    });

    test('the runbook states that unset never widens access', () => {
        assert.match(read('docs/DEPLOYMENT.md'), /every default is the\s+s?afe one|never widens access/i);
    });
});

describe('the contract no longer claims the closed gaps are open', () => {
    const contracts = read('docs/CONTRACTS.md');

    test('CORS is described as same-origin by default, not open', () => {
        assert.match(contracts, /same-origin by default/i);
        assert.ok(!/CORS still admits any origin/i.test(contracts),
            'CONTRACTS.md still says CORS admits any origin');
        assert.ok(!/cors\(\) with its defaults/i.test(contracts),
            'CONTRACTS.md still describes the old permissive cors()');
    });

    test('CSP is described as enabled, with the inline-style gap recorded', () => {
        assert.match(contracts, /content security policy is enabled/i);
        assert.ok(!/The content security policy is disabled/i.test(contracts),
            'CONTRACTS.md still says the CSP is disabled');
        assert.match(contracts, /style-src[^\n]*unsafe-inline/i,
            'the remaining unsafe-inline gap must stay documented');
    });

    test('the symlink read-boundary rule is documented', () => {
        assert.match(contracts, /not followed on the read boundary/i);
        assert.match(contracts, /resolveSecureRealPath/);
    });

    test('rate limiting and upload governance are documented', () => {
        assert.match(contracts, /rate limited/i);
        assert.match(contracts, /507/);
    });

    test('the unauthenticated API is STILL documented as the open Critical', () => {
        assert.match(contracts, /The API is unauthenticated/i);
        assert.match(contracts, /required before the service is exposed beyond localhost|before the service is reachable beyond localhost/i,
            'the localhost-only requirement must not be quietly dropped');
    });

    test('the health response no longer documents an env field', () => {
        const healthSection = contracts.slice(
            contracts.indexOf('### GET /admin/health'),
            contracts.indexOf('### GET /admin/dashboard/summary'),
        );
        assert.ok(healthSection.length > 0, 'the health section is still present');
        assert.ok(!/"env"\s*:/.test(healthSection), 'the health example still shows an env field');
        assert.match(healthSection, /apiVersion/, 'apiVersion is the deploy gate and must stay');
    });
});

describe('the runbook does not overstate the posture', () => {
    const runbook = read('docs/DEPLOYMENT.md');

    test('it still says the service is not safe to expose', () => {
        assert.match(runbook, /not safe to expose publicly/i);
        assert.match(runbook, /unauthenticated/i);
    });

    test('the nginx template no longer claims CORS is open', () => {
        const nginx = read('scripts/nginx/dimension.conf');
        assert.ok(!/cors\(\)/i.test(nginx) || /same-origin/i.test(nginx),
            'the proxy template still describes open CORS as current');
        assert.match(nginx, /unauthenticated/i, 'the template must keep its warning');
    });
});

describe('ADR-003 records what was closed without rewriting its history', () => {
    const adr = read('docs/decisions/ADR-003-files-page-integrity.md');

    test('the original table is preserved verbatim', () => {
        assert.match(adr, /`cors\(\)` admits any origin/,
            'the historical row must survive for the reasoning to stay readable');
        assert.match(adr, /CSP disabled/);
    });

    test('a dated status update records which rows moved', () => {
        assert.match(adr, /Status update/);
        assert.match(adr, /No authentication[\s\S]{0,40}STILL OPEN/i);
    });
});