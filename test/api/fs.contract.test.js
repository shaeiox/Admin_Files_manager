// test/api/fs.contract.test.js
'use strict';

/**
 * Filesystem API contract, exercised against a LIVE server (files-page-correctness).
 *
 * Every assertion about where a file landed inspects the DISK, never the response
 * body: the upload-misfiling defect was precisely a response that described a
 * location the file was not at.
 *
 * Isolation: one temporary STORAGE_ROOT for the whole file, chosen before
 * server.js is required, and the metadata singleton re-pointed at a temporary
 * store so the suite never writes the repository's data/metadata.json.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-fs-'));
const ROOT = path.join(TMP, 'root');

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';
// A small, explicit ceiling so the oversize path is exercised without writing
// gigabytes. Read once when the upload module loads, so it is set before require.
const UPLOAD_LIMIT = 64 * 1024;
process.env.UPLOAD_MAX_BYTES = String(UPLOAD_LIMIT);

function writeFile(rel, content) {
    const full = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
}

writeFile('a.png', 'PNG-BYTES');
writeFile('notes.txt', 'NOTES');
writeFile('media/b.mp4', 'VIDEO-BYTES');
writeFile('media/sub/c.txt', 'NESTED');
fs.mkdirSync(path.join(ROOT, 'sub'), { recursive: true });
writeFile('existing.txt', 'ORIGINAL-CONTENT');
fs.mkdirSync(path.join(ROOT, 'clash'), { recursive: true });
// Taxonomy fixture: one extension per category that only the CLIENT table used
// to know, plus an extension-free file and a folder.
for (const name of ['a.ts', 'b.md', 'c.bmp', 'd.flv', 'e.aac', 'f.bz2', 'noext', 'g.unknownext']) {
    writeFile(`tax/${name}`, 'X');
}
fs.mkdirSync(path.join(ROOT, 'tax', 'folder-entry'), { recursive: true });
// More entries than the documented maximum page size.
for (let i = 0; i < 205; i++) writeFile(`many/f${String(i).padStart(3, '0')}.txt`, 'M');


const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

let server;
let port;

/* ── transport helpers ── */

function send(method, pathname, { body, headers = {} } = {}) {
    return new Promise((resolve, reject) => {
        const finalHeaders = { ...headers };
        if (body !== undefined) finalHeaders['Content-Length'] = Buffer.byteLength(body);
        const req = http.request(
            { host: '127.0.0.1', port, path: pathname, method, agent: false, headers: finalHeaders },
            (res) => {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const buffer = Buffer.concat(chunks);
                    let json = null;
                    try { json = JSON.parse(buffer.toString('utf8')); } catch { /* binary or non-JSON */ }
                    resolve({ status: res.statusCode, headers: res.headers, buffer, json });
                });
            }
        );
        req.setTimeout(10000, () => req.destroy(new Error('request timed out')));
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

function sendJson(method, pathname, payload) {
    return send(method, pathname, {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
    });
}

/** Urlencoded POST, exactly as api.js downloadZip's hidden form submits it. */
function postZip(paths) {
    const body = new URLSearchParams({ paths: JSON.stringify(paths) }).toString();
    return send('POST', '/api/fs/download-zip', {
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
}

/**
 * Multipart POST with the parts in EXACTLY the given order. Wire order is the
 * thing under test, so FormData (which a test cannot reorder after the fact) is
 * deliberately not used.
 *
 * @param {Array<{name: string, value?: string, filename?: string, content?: Buffer|string}>} parts
 */
function postMultipart(pathname, parts) {
    const boundary = `----afmtest${Date.now().toString(16)}`;
    const CRLF = '\r\n';
    const chunks = [];
    for (const part of parts) {
        if (part.filename !== undefined) {
            chunks.push(Buffer.from(
                `--${boundary}${CRLF}Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"${CRLF}` +
                `Content-Type: application/octet-stream${CRLF}${CRLF}`));
            chunks.push(Buffer.isBuffer(part.content) ? part.content : Buffer.from(part.content));
            chunks.push(Buffer.from(CRLF));
        } else {
            chunks.push(Buffer.from(
                `--${boundary}${CRLF}Content-Disposition: form-data; name="${part.name}"${CRLF}${CRLF}${part.value}${CRLF}`));
        }
    }
    chunks.push(Buffer.from(`--${boundary}--${CRLF}`));
    return send('POST', pathname, {
        body: Buffer.concat(chunks),
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    });
}

const filePart = (filename, content) => ({ name: 'file', filename, content });
const field = (name, value) => ({ name, value });

/** Every file under ROOT, as client paths. Used to prove "nothing was written". */
function allClientFiles(dir = ROOT, prefix = '') {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = `${prefix}/${entry.name}`;
        if (entry.isDirectory()) out.push(...allClientFiles(path.join(dir, entry.name), rel));
        else out.push(rel);
    }
    return out;
}

const stagingLeftovers = () => allClientFiles().filter((p) => /\.upload-[^/]*\.part$/.test(p));

function getJson(pathname) {
    return send('GET', pathname).then((res) => {
        assert.equal(res.status, 200, `${pathname} -> ${res.status} ${res.buffer.toString()}`);
        return res.json;
    });
}

/** Entry names from a ZIP's local file headers. Enough to assert membership. */
function zipEntryNames(buffer) {
    const names = [];
    let offset = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    while (offset !== -1 && offset + 30 <= buffer.length) {
        const nameLength = buffer.readUInt16LE(offset + 26);
        names.push(buffer.toString('utf8', offset + 30, offset + 30 + nameLength));
        offset = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), offset + 30 + nameLength);
    }
    return names;
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => {
        if (server.listening) return resolve();
        server.once('listening', resolve);
    });
    port = server.address().port;
});

after(async () => {
    if (server) {
        if (server.closeAllConnections) server.closeAllConnections();
        await new Promise((r) => server.close(r));
        server = null;
    }
    if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
    if (ORIGINAL_PORT === undefined) delete process.env.PORT;
    else process.env.PORT = ORIGINAL_PORT;
    fs.rmSync(TMP, { recursive: true, force: true });
});

/* ══════════════════════════════════════════
   PHASE 0 — ZIP endpoint is reachable (bulk-download-integrity)
   ══════════════════════════════════════════ */

describe('POST /api/fs/download-zip', () => {
    test('a valid paths payload streams an archive', async () => {
        const res = await postZip(['/a.png', '/notes.txt']);
        assert.equal(res.status, 200);
        assert.match(res.headers['content-type'], /^application\/zip/);
        assert.match(res.headers['content-disposition'], /^attachment;/);
        const names = zipEntryNames(res.buffer);
        assert.ok(names.includes('a.png'), `a.png in ${names}`);
        assert.ok(names.includes('notes.txt'), `notes.txt in ${names}`);
    });

    test('a folder is included recursively under its own name', async () => {
        const res = await postZip(['/media']);
        assert.equal(res.status, 200);
        const names = zipEntryNames(res.buffer);
        assert.ok(names.includes('media/b.mp4'), `media/b.mp4 in ${names}`);
        assert.ok(names.includes('media/sub/c.txt'), `media/sub/c.txt in ${names}`);
    });

    test('an empty list is rejected with 400 and the error envelope', async () => {
        const res = await postZip([]);
        assert.equal(res.status, 400);
        assert.equal(res.json.success, false);
        assert.equal(typeof res.json.error, 'string');
    });

    test('more than 500 paths is rejected with 400', async () => {
        const paths = Array.from({ length: 501 }, () => '/a.png');
        const res = await postZip(paths);
        assert.equal(res.status, 400);
        assert.equal(res.json.success, false);
    });

    test('a traversing path is refused before any byte is streamed', async () => {
        const res = await postZip(['/a.png', '/../../outside.txt']);
        assert.notEqual(res.status, 200);
        assert.equal(res.json.success, false, 'an error envelope, not an archive');
        assert.equal(zipEntryNames(res.buffer).length, 0, 'no archive entries were streamed');
    });

    test('the filesystem router is reachable under exactly one prefix', async () => {
        const dashboardZip = await send('POST', '/api/dashboard/download-zip');
        assert.equal(dashboardZip.status, 404, 'ZIP is not republished under /api/dashboard');
        for (const [method, route] of [
            ['POST', '/api/dashboard/upload'],
            ['POST', '/api/dashboard/folder'],
            ['PUT', '/api/dashboard/rename'],
            ['DELETE', '/api/dashboard/delete'],
            ['GET', '/api/dashboard/download'],
        ]) {
            const res = await send(method, route);
            assert.equal(res.status, 404, `${method} ${route} must not exist`);
        }
    });
});

describe('API catch-all (registered once)', () => {
    test('an undefined API route returns the not-found envelope', async () => {
        const res = await send('GET', '/api/does-not-exist');
        assert.equal(res.status, 404);
        assert.deepEqual(res.json, { success: false, error: 'API endpoint not found' });
    });

    test('defined routes are unaffected', async () => {
        assert.equal((await send('GET', '/api/health')).status, 200);
        assert.equal((await send('GET', '/api/fs/list?path=/')).status, 200);
        assert.equal((await send('GET', '/api/dashboard/summary')).status, 200);
    });

    test('server.js registers the /api catch-all exactly once', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');
        // The catch-all is the JSON 404, a two-argument middleware. Matching its
        // shape (not every app.use('/api', ...)) keeps the real invariant - one
        // catch-all, never a duplicate - while tolerating legitimate /api
        // middleware such as the rate limiter.
        const catchAlls = source.match(/app\.use\(\s*'\/api'\s*,\s*\(\s*req\s*,\s*res\s*\)\s*=>/g) || [];
        assert.equal(catchAlls.length, 1);
    });
});

/* ══════════════════════════════════════════
   PHASE 1 — upload placement (upload-destination-integrity)
   ══════════════════════════════════════════ */

describe('POST /api/fs/upload - placement is decided by the destination, not by wire order', () => {
    test('file part BEFORE destination (the order files.js used) lands in the subfolder on disk', async () => {
        const res = await postMultipart('/api/fs/upload', [
            filePart('fileFirst.txt', 'FILE-FIRST'),
            field('destination', '/sub'),
            field('overwrite', 'false'),
        ]);
        assert.equal(res.status, 201, res.buffer.toString());
        assert.ok(fs.existsSync(path.join(ROOT, 'sub', 'fileFirst.txt')), 'written inside /sub');
        assert.ok(!fs.existsSync(path.join(ROOT, 'fileFirst.txt')), 'NOT written to the storage root');
        assert.equal(res.json.data.path, '/sub/fileFirst.txt');
    });

    test('destination BEFORE the file part lands in the subfolder on disk', async () => {
        const res = await postMultipart('/api/fs/upload', [
            field('destination', '/sub'),
            field('overwrite', 'false'),
            filePart('destFirst.txt', 'DEST-FIRST'),
        ]);
        assert.equal(res.status, 201, res.buffer.toString());
        assert.ok(fs.existsSync(path.join(ROOT, 'sub', 'destFirst.txt')));
        assert.equal(res.json.data.path, '/sub/destFirst.txt');
    });

    test('no destination field writes to the storage root and says so', async () => {
        const res = await postMultipart('/api/fs/upload', [filePart('rootDrop.txt', 'ROOT')]);
        assert.equal(res.status, 201, res.buffer.toString());
        assert.ok(fs.existsSync(path.join(ROOT, 'rootDrop.txt')));
        assert.equal(res.json.data.path, '/rootDrop.txt');
    });

    test('data.path, data.name and data.size describe the file actually on disk', async () => {
        const content = 'Z'.repeat(1234);
        const res = await postMultipart('/api/fs/upload', [
            field('destination', '/media/sub'),
            filePart('measured.bin', content),
        ]);
        assert.equal(res.status, 201, res.buffer.toString());
        const { path: clientPath, name, size } = res.json.data;
        const onDisk = path.join(ROOT, ...clientPath.split('/').filter(Boolean));
        assert.ok(fs.existsSync(onDisk), `${clientPath} exists on disk`);
        assert.equal(name, path.basename(onDisk));
        assert.equal(size, fs.statSync(onDisk).size);
        assert.equal(size, 1234);
    });

    test('a non-existent destination is a 400 and creates nothing anywhere', async () => {
        const before = allClientFiles().sort();
        const res = await postMultipart('/api/fs/upload', [
            field('destination', '/does/not/exist'),
            filePart('ghost.txt', 'GHOST'),
        ]);
        assert.equal(res.status, 400);
        assert.equal(res.json.success, false);
        assert.ok(!res.json.error.includes(ROOT) && !res.json.error.includes(TMP), 'no absolute path disclosed');
        assert.deepEqual(allClientFiles().sort(), before, 'filesystem unchanged');
    });

    test('a non-existent destination sent AFTER the file part is also a 400 with nothing left behind', async () => {
        const before = allClientFiles().sort();
        const res = await postMultipart('/api/fs/upload', [
            filePart('ghost2.txt', 'GHOST'),
            field('destination', '/nope'),
        ]);
        assert.equal(res.status, 400);
        assert.deepEqual(allClientFiles().sort(), before, 'staged bytes were discarded');
    });

    test('a destination that is a regular file is a 400', async () => {
        const res = await postMultipart('/api/fs/upload', [
            field('destination', '/notes.txt'),
            filePart('inside-a-file.txt', 'X'),
        ]);
        assert.equal(res.status, 400);
        assert.equal(fs.readFileSync(path.join(ROOT, 'notes.txt'), 'utf8'), 'NOTES');
    });

    test('a destination outside the storage root is refused and nothing is written outside', async () => {
        const res = await postMultipart('/api/fs/upload', [
            field('destination', '/../../'),
            filePart('escape.txt', 'ESCAPE'),
        ]);
        assert.ok(res.status >= 400 && res.status < 500, `client error, got ${res.status}`);
        assert.ok(!fs.existsSync(path.join(TMP, 'escape.txt')));
        assert.ok(!fs.existsSync(path.join(path.dirname(TMP), 'escape.txt')));
    });
});

describe('POST /api/fs/upload - existing files are never silently destroyed', () => {
    test('overwrite=false over an existing file is a 409 and the original bytes and mtime survive', async () => {
        const target = path.join(ROOT, 'existing.txt');
        const pastSeconds = Math.floor(Date.now() / 1000) - 60;
        fs.utimesSync(target, pastSeconds, pastSeconds);
        const mtimeBefore = fs.statSync(target).mtimeMs;

        const res = await postMultipart('/api/fs/upload', [
            field('destination', '/'),
            field('overwrite', 'false'),
            filePart('existing.txt', 'REPLACED'),
        ]);
        assert.equal(res.status, 409, res.buffer.toString());
        assert.equal(fs.readFileSync(target, 'utf8'), 'ORIGINAL-CONTENT');
        assert.equal(fs.statSync(target).mtimeMs, mtimeBefore);
    });

    test('an absent overwrite field defaults to refusing, not replacing', async () => {
        const res = await postMultipart('/api/fs/upload', [filePart('existing.txt', 'REPLACED')]);
        assert.equal(res.status, 409);
        assert.equal(fs.readFileSync(path.join(ROOT, 'existing.txt'), 'utf8'), 'ORIGINAL-CONTENT');
    });

    test('overwrite=true replaces the content completely', async () => {
        writeFile('replace-me.txt', 'OLD-CONTENT-THAT-IS-LONGER');
        const res = await postMultipart('/api/fs/upload', [
            filePart('replace-me.txt', 'NEW'),
            field('overwrite', 'true'),
        ]);
        assert.equal(res.status, 201, res.buffer.toString());
        assert.equal(fs.readFileSync(path.join(ROOT, 'replace-me.txt'), 'utf8'), 'NEW');
    });

    test('a name held by a folder is a 409 even with overwrite=true, and the folder survives', async () => {
        const res = await postMultipart('/api/fs/upload', [
            field('overwrite', 'true'),
            filePart('clash', 'NOT-A-FOLDER'),
        ]);
        assert.equal(res.status, 409);
        assert.ok(fs.statSync(path.join(ROOT, 'clash')).isDirectory());
    });

    test('no staging file is ever left behind', () => {
        assert.deepEqual(stagingLeftovers(), []);
    });
});

describe('POST /api/fs/upload - uploads are size-bounded', () => {
    test('an oversized file is refused with a client error naming the limit, and no partial file remains', async () => {
        const before = allClientFiles().sort();
        const res = await postMultipart('/api/fs/upload', [
            field('destination', '/sub'),
            filePart('huge.bin', Buffer.alloc(UPLOAD_LIMIT + 1, 7)),
        ]);
        assert.equal(res.status, 413, res.buffer.toString());
        assert.equal(res.json.success, false);
        assert.match(res.json.error, /64 KB|65536/, 'the message names the limit');
        assert.deepEqual(allClientFiles().sort(), before, 'no partial or staged file remains');
    });

    test('a file exactly at the limit is accepted', async () => {
        const res = await postMultipart('/api/fs/upload', [
            field('destination', '/sub'),
            filePart('exact.bin', Buffer.alloc(UPLOAD_LIMIT, 7)),
        ]);
        assert.equal(res.status, 201, res.buffer.toString());
        assert.equal(fs.statSync(path.join(ROOT, 'sub', 'exact.bin')).size, UPLOAD_LIMIT);
    });
});

/* ══════════════════════════════════════════
   PHASE 1 — listing (type-taxonomy-consistency, files-list-resilience)
   ══════════════════════════════════════════ */

const FileSystemService = require('../../src/services/FileSystemService');
const { emptyBreakdown } = require('../../src/utils/fileTypes');

describe('GET /api/fs/list - taxonomy and the unclassified bucket', () => {
    test('counts.all equals the sum of every per-type count, including other', async () => {
        const res = await getJson('/api/fs/list?path=/tax');
        const { all, ...perType } = res.counts;
        assert.ok('other' in perType, 'the unclassified bucket is reported');
        const sum = Object.values(perType).reduce((a, b) => a + b, 0);
        assert.equal(all, sum);
        assert.equal(all, 9, '8 files + 1 folder');
    });

    test('each client-only extension is reachable by its own chip', async () => {
        const expectations = {
            code: 'a.ts', document: 'b.md', image: 'c.bmp', video: 'd.flv', audio: 'e.aac', archive: 'f.bz2',
        };
        for (const [type, name] of Object.entries(expectations)) {
            const res = await getJson(`/api/fs/list?path=/tax&type=${type}`);
            assert.deepEqual(res.items.map((i) => i.name), [name], `${type} chip returns ${name}`);
            assert.equal(res.counts[type], 1);
        }
    });

    test('an extension-free file and an unknown extension land in other and are returned by its filter', async () => {
        const res = await getJson('/api/fs/list?path=/tax&type=other&sort=name&dir=asc');
        assert.deepEqual(res.items.map((i) => i.name), ['g.unknownext', 'noext']);
        assert.equal(res.counts.other, 2);
    });

    test('each item carries the type the filter compared against', async () => {
        const res = await getJson('/api/fs/list?path=/tax&limit=50');
        const byName = Object.fromEntries(res.items.map((i) => [i.name, i.type]));
        assert.equal(byName['a.ts'], 'code');
        assert.equal(byName.noext, 'other');
        assert.equal(byName['folder-entry'], 'folder');
        assert.ok(res.items.every((i) => !('_extKey' in i)), 'no internal key leaks');
    });

    test('the listing counts include folders', async () => {
        const res = await getJson('/api/fs/list?path=/tax');
        assert.equal(res.counts.folder, 1);
    });

    test('the storage breakdown omits folders (its own contract, asserted separately)', async () => {
        assert.ok(!('folder' in emptyBreakdown()));
        const summary = await getJson('/api/dashboard/summary');
        const keys = Array.isArray(summary.storageBreakdown)
            ? summary.storageBreakdown.map((s) => s.key || s.type || s.category)
            : Object.keys(summary.storageBreakdown);
        assert.ok(!keys.includes('folder'), `no folder slice in ${keys}`);
    });
});

/** Wrap getStats so a directory reports `dirSize`, whatever the platform says. */
function withDirectorySize(realGetStats, dirSize) {
    return async (p) => {
        const stats = await realGetStats.call(FileSystemService, p);
        return stats.isDirectory ? { ...stats, size: dirSize } : stats;
    };
}

describe('GET /api/fs/list - resilience', () => {
    test('a directory entry reports recursive content size, never the filesystem directory size', async () => {
        const res = await getJson('/api/fs/list?path=/tax');
        const folder = res.items.find((i) => i.isFolder);
        assert.equal(folder.sizeAvailable, true);
        assert.equal(folder.size, 0);
    });

    test('the payload is identical whether the filesystem reports 0 or 4096 for a directory', async () => {
        const realGetStats = FileSystemService.getStats;
        const query = '/api/fs/list?path=/tax&sort=name&dir=asc';
        try {
            FileSystemService.getStats = withDirectorySize(realGetStats, 0);
            const ntfs = (await send('GET', query)).buffer.toString();
            FileSystemService.getStats = withDirectorySize(realGetStats, 4096);
            const ext4 = (await send('GET', query)).buffer.toString();
            assert.equal(ntfs, ext4);
        } finally {
            FileSystemService.getStats = realGetStats;
        }
    });

    test('an entry that vanishes between the directory read and enrichment is skipped, siblings survive', async () => {
        const realRead = FileSystemService.readDirectory;
        try {
            FileSystemService.readDirectory = async (p) => {
                const entries = await realRead.call(FileSystemService, p);
                return [...entries, { name: 'vanished.txt', isDirectory: () => false, isFile: () => true }];
            };
            const res = await send('GET', '/api/fs/list?path=/tax&limit=50');
            assert.equal(res.status, 200, res.buffer.toString());
            const names = res.json.items.map((i) => i.name);
            assert.ok(!names.includes('vanished.txt'));
            assert.equal(names.length, 9, 'every sibling is present');
            assert.equal(res.json.counts.all, 9, 'the vanished entry is not counted');
        } finally {
            FileSystemService.readDirectory = realRead;
        }
    });

    test('an unreadable target directory is still a failure, not an empty listing', async () => {
        const res = await send('GET', '/api/fs/list?path=/no-such-dir');
        assert.equal(res.status, 404);
        assert.equal(res.json.success, false);
    });

    test('enrichment is concurrent but bounded', async () => {
        const fsController = require('../../src/controllers/fs.controller');
        const bound = fsController.LIST_ENRICH_CONCURRENCY;
        assert.ok(Number.isInteger(bound) && bound > 1, 'a documented, finite bound');

        const realGetStats = FileSystemService.getStats;
        let inFlight = 0;
        let peak = 0;
        try {
            FileSystemService.getStats = async (p) => {
                inFlight++;
                peak = Math.max(peak, inFlight);
                await new Promise((r) => setTimeout(r, 2));
                try { return await realGetStats.call(FileSystemService, p); } finally { inFlight--; }
            };
            await getJson('/api/fs/list?path=/many&limit=10');
        } finally {
            FileSystemService.getStats = realGetStats;
        }
        assert.ok(peak > 1, `concurrent (peak ${peak})`);
        assert.ok(peak <= bound, `bounded (peak ${peak} <= ${bound})`);
    });

    test('the metadata store is read once per listing, not once per entry', async () => {
        const fsp = require('node:fs/promises');
        const realReadFile = fsp.readFile;
        let storeReads = 0;
        MetadataService.cache = null;
        try {
            fsp.readFile = async (...args) => {
                if (args[0] === MetadataService.dbPath) storeReads++;
                return realReadFile.apply(fsp, args);
            };
            await getJson('/api/fs/list?path=/many&limit=10');
        } finally {
            fsp.readFile = realReadFile;
        }
        assert.ok(storeReads <= 1, `store read ${storeReads} times for 205 entries`);
    });

    test('ordering follows the requested sort, not completion order', async () => {
        const res = await getJson('/api/fs/list?path=/many&sort=name&dir=asc&limit=10');
        assert.deepEqual(res.items.map((i) => i.name), Array.from({ length: 10 }, (_, i) => `f00${i}.txt`));
    });
});

describe('GET /api/fs/list - sort and pagination bounds', () => {
    test('an unknown sort key is deterministic and does not throw', async () => {
        const a = await getJson('/api/fs/list?path=/tax&sort=__proto__');
        const b = await getJson('/api/fs/list?path=/tax&sort=constructor');
        const fallback = await getJson('/api/fs/list?path=/tax&sort=modified');
        assert.deepEqual(a.items.map((i) => i.name), fallback.items.map((i) => i.name));
        assert.deepEqual(b.items.map((i) => i.name), fallback.items.map((i) => i.name));
    });

    test('directories precede files in both directions', async () => {
        for (const dir of ['asc', 'desc']) {
            const res = await getJson(`/api/fs/list?path=/tax&sort=size&dir=${dir}&limit=50`);
            assert.equal(res.items[0].isFolder, true, `${dir}: folder first`);
        }
    });

    test('a limit above the documented maximum is clamped', async () => {
        const fsController = require('../../src/controllers/fs.controller');
        const max = fsController.LIST_MAX_LIMIT;
        assert.ok(Number.isInteger(max) && max >= 100, 'a documented maximum that covers the largest page size offered');
        const res = await getJson('/api/fs/list?path=/many&limit=100000');
        assert.equal(res.items.length, max);
        assert.equal(res.total, 205);
    });

    test('a non-numeric page behaves as the first page', async () => {
        const res = await getJson('/api/fs/list?path=/many&page=abc&sort=name&dir=asc&limit=5');
        assert.equal(res.items[0].name, 'f000.txt');
    });

    test('a page beyond the end is an empty page with the true total', async () => {
        const res = await getJson('/api/fs/list?path=/many&page=999&limit=20');
        assert.deepEqual(res.items, []);
        assert.equal(res.total, 205);
    });
});

/* ══════════════════════════════════════════
   PHASE 1 — star route (surface-honesty / mutation-result-truthfulness)
   ══════════════════════════════════════════ */

describe('POST /api/fs/star', () => {
    test('each call toggles once and reports the resulting state in the mutating envelope', async () => {
        const first = await sendJson('POST', '/api/fs/star', { path: '/notes.txt' });
        assert.equal(first.status, 200, first.buffer.toString());
        assert.deepEqual(first.json, { success: true, data: { path: '/notes.txt', starred: true } });

        const second = await sendJson('POST', '/api/fs/star', { path: '/notes.txt' });
        assert.deepEqual(second.json.data, { path: '/notes.txt', starred: false });
    });

    test('an explicit starred value is idempotent', async () => {
        for (let i = 0; i < 2; i++) {
            const res = await sendJson('POST', '/api/fs/star', { path: '/a.png', starred: true });
            assert.equal(res.json.data.starred, true, `call ${i + 1}`);
        }
        const listing = await getJson('/api/fs/list?path=/&limit=100');
        assert.equal(listing.items.find((i) => i.path === '/a.png').starred, true, 'the listing reflects it');
        const off = await sendJson('POST', '/api/fs/star', { path: '/a.png', starred: false });
        assert.equal(off.json.data.starred, false);
    });

    test('a path that does not exist is a 404 and is not starred', async () => {
        const res = await sendJson('POST', '/api/fs/star', { path: '/missing.txt' });
        assert.equal(res.status, 404);
        assert.equal(res.json.success, false);
    });

    test('a missing or non-boolean payload is a 400', async () => {
        assert.equal((await sendJson('POST', '/api/fs/star', {})).status, 400);
        assert.equal((await sendJson('POST', '/api/fs/star', { path: '/a.png', starred: 'yes' })).status, 400);
    });

    test('the star route is not reachable under a second prefix', async () => {
        const res = await sendJson('POST', '/api/dashboard/star', { path: '/a.png' });
        assert.equal(res.status, 404);
    });
});

describe('DELETE /api/fs/delete - partial failure is a 200 that is NOT full success', () => {
    test('a mixed request reports deleted and failed separately', async () => {
        writeFile('doomed.txt', 'BYE');
        const res = await sendJson('DELETE', '/api/fs/delete', { paths: ['/doomed.txt', '/never-existed.txt'] });
        assert.equal(res.status, 200);
        assert.equal(res.json.success, true);
        assert.deepEqual(res.json.data.deleted, ['/doomed.txt']);
        assert.equal(res.json.data.failed.length, 1);
        assert.equal(res.json.data.failed[0].path, '/never-existed.txt');
        assert.equal(res.json.data.failed[0].statusCode, 404);
        assert.ok(!fs.existsSync(path.join(ROOT, 'doomed.txt')));
    });
});

describe('POST /api/fs/upload - an aborted transfer leaves nothing behind', () => {
    test('destroying the request mid-body removes the staged bytes', async () => {
        const boundary = '----afmabort';
        const head = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="destination"\r\n\r\n/sub\r\n` +
            `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="aborted.bin"\r\n` +
            'Content-Type: application/octet-stream\r\n\r\n');
        await new Promise((resolve) => {
            const req = http.request({
                host: '127.0.0.1', port, path: '/api/fs/upload', method: 'POST', agent: false,
                headers: {
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': head.length + 40000,
                },
            });
            req.on('error', () => resolve());
            req.on('response', (res) => { res.resume(); resolve(); });
            req.write(head);
            req.write(Buffer.alloc(20000, 1));
            setTimeout(() => { req.destroy(); resolve(); }, 100);
        });
        // Give the server a moment to observe the closed socket and clean up.
        for (let i = 0; i < 50 && stagingLeftovers().length > 0; i++) {
            await new Promise((r) => setTimeout(r, 20));
        }
        assert.deepEqual(stagingLeftovers(), []);
        assert.ok(!fs.existsSync(path.join(ROOT, 'sub', 'aborted.bin')));
    });
});

/* ══════════════════════════════════════════
   PHASE 2 — starredOnly (surface-honesty: Starred library view)
   ══════════════════════════════════════════ */

describe('GET /api/fs/list?starredOnly=true', () => {
    test('returns only starred entries and composes with search, sort and type', async () => {
        writeFile('lib/alpha.ts', 'A');
        writeFile('lib/beta.ts', 'B');
        writeFile('lib/gamma.md', 'G');
        for (const p of ['/lib/alpha.ts', '/lib/gamma.md']) {
            await sendJson('POST', '/api/fs/star', { path: p, starred: true });
        }
        const all = await getJson('/api/fs/list?path=/lib&starredOnly=true&sort=name&dir=asc');
        assert.deepEqual(all.items.map((i) => i.name), ['alpha.ts', 'gamma.md']);
        assert.equal(all.total, 2);
        assert.equal(all.counts.all, 2, 'counts describe the starred view');

        const typed = await getJson('/api/fs/list?path=/lib&starredOnly=true&type=code');
        assert.deepEqual(typed.items.map((i) => i.name), ['alpha.ts']);

        const searched = await getJson('/api/fs/list?path=/lib&starredOnly=true&search=gam');
        assert.deepEqual(searched.items.map((i) => i.name), ['gamma.md']);

        const plain = await getJson('/api/fs/list?path=/lib');
        assert.equal(plain.total, 3, 'without the flag nothing is filtered');
    });
});

/* ══════════════════════════════════════════
   PHASE 3 — the tree depth is a documented, tested constant
   ══════════════════════════════════════════ */

describe('GET /api/fs/tree depth', () => {
    test('the tree reaches exactly two levels below the root', async () => {
        writeFile('deep1/deep2/deep3/deep4/leaf.txt', 'L');
        const tree = await getJson('/api/fs/tree');
        function maxDepth(nodes, depth) {
            return nodes.reduce((m, n) => Math.max(m, depth, maxDepth(n.children || [], depth + 1)), 0);
        }
        assert.equal(maxDepth(tree[0].children, 1), 2);
        const deep1 = tree[0].children.find((n) => n.name === 'deep1');
        assert.deepEqual(deep1.children.map((n) => n.name), ['deep2']);
        assert.deepEqual(deep1.children[0].children, [], 'deep3 is past the cap');
    });
});

/* ══════════════════════════════════════════
   PHASE 5 — previews (files-ui-quality: "Thumbnails Are Real Or Explicitly Unavailable")
   ══════════════════════════════════════════ */

describe('GET /api/fs/thumbnail', () => {
    const PreviewService = require('../../src/services/PreviewService');

    test('the capability is reported as unavailable when no transformer is installed', async () => {
        const previous = PreviewService._useTransformer(null);
        try {
            const cap = await getJson('/api/fs/thumbnail/capability');
            assert.deepEqual(cap, { available: false, formats: [], maxSize: 512 });
        } finally {
            PreviewService._useTransformer(previous);
        }
    });

    test('an image without a transformer is an explicit unavailable marker, not an image', async () => {
        const previous = PreviewService._useTransformer(null);
        try {
            const res = await send('GET', '/api/fs/thumbnail?path=/a.png');
            assert.equal(res.status, 404);
            assert.equal(res.headers['x-preview'], 'unavailable');
            assert.equal(res.json.success, false);
            assert.doesNotMatch(res.headers['content-type'], /^image\//);
        } finally {
            PreviewService._useTransformer(previous);
        }
    });

    test('a non-image is refused without reading the file', async () => {
        const realGetStats = FileSystemService.getStats;
        let statted = 0;
        let decoded = 0;
        const previous = PreviewService._useTransformer(() => { decoded++; throw new Error('must not decode'); });
        FileSystemService.getStats = async (...a) => { statted++; return realGetStats.apply(FileSystemService, a); };
        try {
            const res = await send('GET', '/api/fs/thumbnail?path=/notes.txt');
            assert.equal(res.status, 415);
            assert.equal(res.headers['x-preview'], 'unavailable');
            assert.equal(statted, 0, 'the file was not touched');
            assert.equal(decoded, 0);
        } finally {
            FileSystemService.getStats = realGetStats;
            PreviewService._useTransformer(previous);
        }
    });

    test('SVG is refused even though it is an image: it is a document, not pixels', async () => {
        writeFile('vector.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
        const previous = PreviewService._useTransformer(() => { throw new Error('must not decode'); });
        try {
            const res = await send('GET', '/api/fs/thumbnail?path=/vector.svg');
            assert.equal(res.status, 415);
        } finally {
            PreviewService._useTransformer(previous);
        }
    });

    test('with a transformer, the preview is bounded in both dimensions and typed as an image', async () => {
        const seen = [];
        const fake = (input) => {
            const chain = {
                rotate: () => chain,
                resize: (w, h, opts) => { seen.push({ input, w, h, opts }); return chain; },
                webp: () => chain,
                toBuffer: async () => Buffer.from('WEBP'),
            };
            return chain;
        };
        const previous = PreviewService._useTransformer(fake);
        try {
            const res = await send('GET', '/api/fs/thumbnail?path=/a.png&size=5000');
            assert.equal(res.status, 200);
            assert.equal(res.headers['content-type'], 'image/webp');
            assert.equal(seen[0].w, 512);
            assert.equal(seen[0].h, 512);
            assert.equal(seen[0].opts.fit, 'inside');
            assert.ok(!res.buffer.toString().includes('PNG-BYTES'), 'the original bytes are never returned');
        } finally {
            PreviewService._useTransformer(previous);
        }
    });

    test('a decode failure is an unavailable marker, and traversal is refused', async () => {
        const previous = PreviewService._useTransformer(() => ({
            rotate() { return this; }, resize() { return this; }, webp() { return this; },
            toBuffer: async () => { throw new Error('corrupt'); },
        }));
        try {
            const bad = await send('GET', '/api/fs/thumbnail?path=/a.png');
            assert.equal(bad.status, 422);
            assert.equal(bad.headers['x-preview'], 'unavailable');
            const escape = await send('GET', '/api/fs/thumbnail?path=/../../x.png');
            assert.equal(escape.status, 403);
        } finally {
            PreviewService._useTransformer(previous);
        }
    });

    test('a non-integer size is a 400', async () => {
        const res = await send('GET', '/api/fs/thumbnail?path=/a.png&size=big');
        assert.equal(res.status, 400);
    });
});

/* ══════════════════════════════════════════
   PHASE 6 — error responses disclose no filesystem detail
   ══════════════════════════════════════════ */

describe('upload and validation errors disclose no absolute path', () => {
    const cases = [
        ['an invalid file name', [field('destination', '/'), filePart('bad..name', 'X')]],
        ['a reserved device name', [field('destination', '/'), filePart('CON.txt', 'X')]],
        ['a traversing destination', [field('destination', '/../..'), filePart('x.txt', 'X')]],
        ['a missing destination', [field('destination', '/nope/nope'), filePart('x.txt', 'X')]],
        ['a destination that is a file', [field('destination', '/notes.txt'), filePart('x.txt', 'X')]],
    ];
    for (const [label, parts] of cases) {
        test(label, async () => {
            const res = await postMultipart('/api/fs/upload', parts);
            assert.ok(res.status >= 400 && res.status < 500, `${label}: client error, got ${res.status}`);
            const body = res.buffer.toString();
            for (const secret of [ROOT, TMP, ROOT.replace(/\\/g, '/'), process.cwd()]) {
                assert.ok(!body.includes(secret), `${label}: body contains ${secret}`);
            }
            assert.equal(res.json.stack, undefined, 'no stack trace');
        });
    }
});
