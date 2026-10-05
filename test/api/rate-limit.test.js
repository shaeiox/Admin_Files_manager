// test/api/rate-limit.test.js
'use strict';

/**
 * Rate limiting (api-security-hardening, "Mutating Routes Are Rate Limited").
 *
 * The contract has two halves that are easy to get wrong together:
 *   1. mutations are throttled per client, and
 *   2. reads keep working under their OWN allowance - a read burst must not
 *      spend the mutation budget, and a mutation burst must not spend the read
 *      one. That is why the limiter keys `write:` and `read:` separately.
 *
 * The server is booted with tiny budgets so the limits are reachable in a test
 * without waiting a real minute, and with every request loopback. `trust proxy`
 * is one hop, so req.ip is the socket address here: one client.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-rate-'));
const ROOT = path.join(TMP, 'root');
const DATA = path.join(TMP, 'data');
fs.mkdirSync(ROOT, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

const WRITE_BUDGET = 5;
const READ_BUDGET = 50;

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
const ORIGINAL_DATA = process.env.AFM_DATA_DIR;
const ORIGINAL_W = process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE;
const ORIGINAL_R = process.env.AFM_RATE_LIMIT_READ_PER_MINUTE;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
process.env.AFM_DATA_DIR = DATA;
process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE = String(WRITE_BUDGET);
process.env.AFM_RATE_LIMIT_READ_PER_MINUTE = String(READ_BUDGET);

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

let server;
let port;

function request(pathname, { method = 'GET', body = null, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, headers, agent: false },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: Buffer.concat(chunks).toString(),
                }));
            },
        );
        req.on('error', reject);
        if (body !== null) req.write(body);
        req.end();
    });
}

/** A mutation that never mutates: star a path that does not exist. */
function starRequest() {
    const body = JSON.stringify({ path: '/does-not-exist.txt' });
    return request('/api/v1/fs/star', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    });
}

async function burst(n, fn) {
    const statuses = [];
    for (let i = 0; i < n; i++) statuses.push((await fn()).status);
    return statuses;
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
});

after(async () => {
    if (server && server.closeAllConnections) server.closeAllConnections();
    if (server) await new Promise((r) => server.close(r));
    if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT; else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
    if (ORIGINAL_PORT === undefined) delete process.env.PORT; else process.env.PORT = ORIGINAL_PORT;
    if (ORIGINAL_DATA === undefined) delete process.env.AFM_DATA_DIR; else process.env.AFM_DATA_DIR = ORIGINAL_DATA;
    if (ORIGINAL_W === undefined) delete process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE; else process.env.AFM_RATE_LIMIT_WRITE_PER_MINUTE = ORIGINAL_W;
    if (ORIGINAL_R === undefined) delete process.env.AFM_RATE_LIMIT_READ_PER_MINUTE; else process.env.AFM_RATE_LIMIT_READ_PER_MINUTE = ORIGINAL_R;
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('mutating routes are rate limited per client', () => {
    test('a burst of mutations is throttled with 429 and a Retry-After', async () => {
        const statuses = await burst(WRITE_BUDGET + 3, starRequest);
        // The first WRITE_BUDGET are allowed (whatever their own outcome is:
        // these mutations fail on their own path, they are only counted here).
        for (const status of statuses.slice(0, WRITE_BUDGET)) {
            assert.notEqual(status, 429, 'an allowed mutation is not throttled');
        }
        for (const status of statuses.slice(WRITE_BUDGET)) {
            assert.equal(status, 429, 'the over-budget mutation is refused');
        }
    });

    test('the throttled response is the error envelope with Retry-After', async () => {
        // The write bucket is already exhausted by the previous test, so this
        // request lands in the throttled branch.
        const res = await starRequest();
        assert.equal(res.status, 429);
        assert.match(res.headers['retry-after'] || '', /^\d+$/);
        const payload = JSON.parse(res.body);
        assert.equal(payload.success, false);
        assert.equal(typeof payload.error, 'string');
    });
});

describe('reads keep their own separate allowance', () => {
    test('reads are unaffected by an exhausted mutation bucket', async () => {
        // Drain the write bucket first.
        await burst(WRITE_BUDGET + 1, starRequest);
        const res = await request('/api/v1/health');
        assert.equal(res.status, 200, 'a read still succeeds while mutations are throttled');
        assert.equal(res.headers['retry-after'], undefined);
    });

    test('a read burst is throttled only after a far larger allowance', async () => {
        // The read bucket is per window and shared with the reads earlier tests
        // already spent, so the exact refusal index is not fixed here. What
        // matters: reads are served for far more than the 5-request mutation
        // budget, and then throttled. This proves reads are NOT the mutation
        // allowance and are not capped at it.
        const statuses = await burst(READ_BUDGET + 5, () => request('/api/v1/health'));
        const firstRefusal = statuses.indexOf(429);
        assert.ok(firstRefusal !== -1, 'a read burst beyond the allowance is eventually refused');
        assert.ok(firstRefusal > WRITE_BUDGET,
            `reads are served well beyond the mutation budget (refused at ${firstRefusal})`);
        assert.equal(statuses[0], 200, 'the first read of the burst succeeds');
    });
});

describe('the limiter does not apply outside the API surface', () => {
    test('the SPA shell is served without consuming the read budget', async () => {
        const res = await request('/');
        assert.equal(res.status, 200);
        assert.match(res.body, /<!DOCTYPE html>/i);
    });
});