// test/integration/relocation.test.js
'use strict';

/**
 * Root isolation guard (isolate-app-roots D1, D8).
 *
 * "Relocatable" is defined by this test, not by a convention:
 *   1. the code is copied to a fresh temp path with a space in its name, made
 *      read-only, and started in production mode with state and storage in
 *      other temp folders and no .env - it must answer /api/health and leave
 *      the copy byte-for-byte unchanged (checked by listing, so it also holds
 *      when the suite runs as root, where a read-only mode does not bind);
 *   2. no source, test, script or doc names a machine-specific path or a path
 *      inside the sibling File Portal repository.
 *
 * deploy.sh runs `npm test` inside every release directory, so this also runs
 * from a path the developer never chose.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..');

/** Never part of a release: dependencies are linked, state and tooling are not code. */
const NOT_CODE = new Set(['.git', 'node_modules', 'data', 'temp', 'graphify-out', 'docs-vault', '~', '.env',
    '.claude', '.opencode', '.agents', '.freebuff', 'portal.log']);

function copyCode(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        if (NOT_CODE.has(entry.name)) continue;
        const src = path.join(from, entry.name);
        const dst = path.join(to, entry.name);
        if (entry.isDirectory()) copyCode(src, dst);
        else if (entry.isFile()) fs.copyFileSync(src, dst);
    }
}

/** relative path -> size:mtime for every file and folder under `dir` (symlinks not followed). */
function listing(dir, base = dir, out = new Map()) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const st = fs.lstatSync(full);
        out.set(path.relative(base, full), `${st.size}:${st.mtimeMs}`);
        if (entry.isDirectory()) listing(full, base, out);
    }
    return out;
}

function setMode(dir, writable) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) setMode(full, writable);
        fs.chmodSync(full, entry.isDirectory() ? (writable ? 0o755 : 0o555) : (writable ? 0o644 : 0o444));
    }
    fs.chmodSync(dir, writable ? 0o755 : 0o555);
}

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
        srv.on('error', reject);
    });
}

function health(port) {
    return new Promise((resolve) => {
        const req = http.get({ host: '127.0.0.1', port, path: '/api/v1/health', agent: false }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
        });
        req.on('error', () => resolve(0));
        req.setTimeout(1000, () => req.destroy());
    });
}

describe('relocation: the code runs from any path, read-only, with no .env', () => {
    test('a copy under a fresh path starts in production and writes nothing into itself', async (t) => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-relocated-'));
        const code = path.join(base, 'relocated app');
        const state = path.join(base, 'state');
        const storage = path.join(base, 'storage');
        fs.mkdirSync(state);
        fs.mkdirSync(storage);
        copyCode(REPO, code);
        fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(code, 'node_modules'), 'dir');
        setMode(code, false);
        const before = listing(code);

        const port = await freePort();
        const env = { PATH: process.env.PATH, NODE_ENV: 'production', PORT: String(port), HOST: '127.0.0.1',
            STORAGE_ROOT: storage, AFM_DATA_DIR: state };
        const child = spawn(process.execPath, ['server.js'], { cwd: code, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', (c) => { output += c; });
        child.stderr.on('data', (c) => { output += c; });
        t.after(() => {
            child.kill('SIGKILL');
            setMode(code, true);
            fs.rmSync(base, { recursive: true, force: true });
        });

        let status = 0;
        for (let i = 0; i < 100 && status !== 200 && child.exitCode === null; i++) {
            await new Promise((r) => setTimeout(r, 100));
            status = await health(port);
        }
        assert.equal(status, 200, `relocated server did not become healthy:\n${output}`);
        child.kill('SIGTERM');
        await new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)));

        assert.deepEqual([...listing(code)].filter(([k, v]) => before.get(k) !== v), [], 'the code folder was written to');
        assert.ok(fs.existsSync(path.join(state, 'admin.sqlite')), 'state belongs in AFM_DATA_DIR');
    });

    test('production refuses state inside the relocated code folder', async (t) => {
        const base = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-relocated-'));
        t.after(() => fs.rmSync(base, { recursive: true, force: true }));
        const storage = path.join(base, 'storage');
        fs.mkdirSync(storage);
        const env = { PATH: process.env.PATH, NODE_ENV: 'production', PORT: '0', STORAGE_ROOT: storage,
            AFM_DATA_DIR: path.join(REPO, 'test') };
        const child = spawn(process.execPath, ['server.js'], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stderr.on('data', (c) => { output += c; });
        const code = await new Promise((r) => child.once('exit', r));
        assert.equal(code, 1);
        assert.match(output, /AFM_DATA_DIR .* is inside the application folder/);
    });
});

describe('relocation lint: no machine-specific or sibling paths', () => {
    // Built from parts so this file does not match itself.
    const RULES = [
        [new RegExp('/opt' + '/devel'), 'a developer machine path'],
        [new RegExp('[A-Za-z]:[\\\\/]+(Projects|GitServer|Users)[\\\\/]'), 'a Windows machine path'],
        [new RegExp('(files-server-web|Admin-Files-Manager-fixed)[\\\\/]'), 'a path inside a repository folder'],
    ];
    // scripts/nginx is host web-server configuration that serves BOTH products'
    // static files from their install paths; it is not read by this application.
    const SKIP = new Set([path.join('scripts', 'nginx'), path.join('docs', 'security-audit')]);
    const ROOTS = ['src', 'test', 'scripts', 'docs', 'server.js', '.env.example', 'package.json'];

    function* files(rel) {
        if (SKIP.has(rel)) return;
        const full = path.join(REPO, rel);
        if (!fs.existsSync(full)) return;
        if (fs.statSync(full).isFile()) { yield rel; return; }
        for (const entry of fs.readdirSync(full)) yield* files(path.join(rel, entry));
    }

    test('every tracked text file is free of them', () => {
        const hits = [];
        for (const root of ROOTS) {
            for (const rel of files(root)) {
                if (!/\.(js|md|json|sh|conf|service|example|html|css|ya?ml)$|^\.env\.example$|post-receive$/.test(path.basename(rel))) continue;
                fs.readFileSync(path.join(REPO, rel), 'utf8').split(/\r?\n/).forEach((line, i) => {
                    for (const [re, what] of RULES) if (re.test(line)) hits.push(`${rel}:${i + 1}: ${what}: ${line.trim().slice(0, 120)}`);
                });
            }
        }
        assert.deepEqual(hits, []);
    });
});
