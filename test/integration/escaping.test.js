// test/integration/escaping.test.js
'use strict';

/**
 * Markup escaping, end to end (markup-escaping-and-security-boundary).
 *
 * A hostile entry name is written straight into the storage root — never through
 * the upload endpoint, whose name validation would refuse it — then listed by a
 * LIVE server and rendered by the real files.js renderers. Rendering-time escaping
 * is the layer under test: the storage root is operator-controlled and may be
 * populated out of band, and the content security policy is disabled.
 *
 * Windows refuses `<`, `>` and `"` in file names, so there the hostile name is an
 * attribute breakout built from `'` and `&`, which Windows allows.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'afm-esc-'));
const ROOT = path.join(TMP, 'root');

const HOSTILE = process.platform === 'win32'
    ? "x' onmouseover='alert(1)' data-x='&amp;"
    : '<img src=x onerror=alert(1)>"\'&';

fs.mkdirSync(path.join(ROOT, HOSTILE), { recursive: true });
fs.writeFileSync(path.join(ROOT, `${HOSTILE}.txt`), 'X');

const ORIGINAL_ROOT = process.env.STORAGE_ROOT;
const ORIGINAL_PORT = process.env.PORT;
process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.STORAGE_ROOT = ROOT;
process.env.PORT = '0';

const MetadataService = require('../../src/services/MetadataService');
MetadataService.dbPath = path.join(TMP, 'metadata.json');
MetadataService.cache = null;

let server;
let port;

function getJson(pathname) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: pathname, agent: false }, (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });
}

/** The real renderers, evaluated with the real app.js helpers (escapeHtml, Format, icon). */
function loadRenderers() {
    const pub = path.join(__dirname, '..', '..', 'public', 'assets', 'js');
    const sandbox = {
        console: { warn() {}, error() {}, log() {} },
        URLSearchParams,
        document: { addEventListener() {} },
        navigator: { platform: 'test' },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(pub, 'app.js'), 'utf8'), sandbox);
    sandbox.API = { BASE_URL: '/api' };
    vm.runInContext(fs.readFileSync(path.join(pub, 'files.js'), 'utf8'), sandbox);
    return sandbox.Files.pure;
}

/**
 * Inert output: the hostile text appears only in escaped form, so no tag, no
 * attribute and no entity was introduced by it.
 */
function assertInert(out, where) {
    assert.ok(!out.includes(HOSTILE), `${where}: the raw name reached markup`);
    assert.ok(!/onmouseover='|onerror=alert\(1\)>/.test(out), `${where}: an attribute or tag was introduced`);
    assert.ok(out.includes('alert(1)'), `${where}: the name is still shown, as text`);
}

before(async () => {
    server = require('../../server.js');
    await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
    port = server.address().port;
});

after(async () => {
    if (server) {
        if (server.closeAllConnections) server.closeAllConnections();
        await new Promise((r) => server.close(r));
    }
    if (ORIGINAL_ROOT === undefined) delete process.env.STORAGE_ROOT;
    else process.env.STORAGE_ROOT = ORIGINAL_ROOT;
    if (ORIGINAL_PORT === undefined) delete process.env.PORT;
    else process.env.PORT = ORIGINAL_PORT;
    fs.rmSync(TMP, { recursive: true, force: true });
});

describe('a hostile name placed out of band renders as text', () => {
    test('list, grid, drawer, breadcrumb and tree', async () => {
        const pure = loadRenderers();
        const listing = await getJson('/api/fs/list?path=/&sort=name&dir=asc');
        assert.equal(listing.items.length, 2, 'the server lists both hostile entries');

        const state = pure.createState({ files: listing.items, total: listing.total });
        assertInert(pure.renderListHtml(state), 'list');
        assertInert(pure.renderGridHtml(state), 'grid');
        for (const item of listing.items) assertInert(pure.renderDrawerHtml(item), `drawer (${item.isFolder ? 'folder' : 'file'})`);

        const folder = listing.items.find((i) => i.isFolder);
        assertInert(pure.renderBreadcrumbHtml(folder.path), 'breadcrumb');

        const tree = await getJson('/api/fs/tree');
        const treeState = pure.createState({ tree, treeLoaded: true, expanded: new Set(['/']), currentPath: folder.path });
        assertInert(pure.renderTreeHtml(treeState), 'tree');
    });

    test('the delete confirmation, which the shared modal inserts as markup', async () => {
        const pure = loadRenderers();
        const listing = await getJson('/api/fs/list?path=/');
        assertInert(pure.deleteConfirmCopy(listing.items).message, 'confirmation');
    });
});
