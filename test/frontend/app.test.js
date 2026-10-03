// test/frontend/app.test.js
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Agent A (Phase 6, dashboard-real-data): the shared sidebar contract.
//
// app.js is a classic browser script, not a CommonJS module: it assigns
// window.AFM and registers a DOMContentLoaded listener when it is evaluated.
// The repository installs no DOM test harness and this change may not add one,
// so exactly two globals are stubbed - the minimum for the file to evaluate -
// and everything under test is either pure (resolve*) or reaches the DOM only
// through `document.querySelector`, which a four-line stub satisfies.

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'app.js');
const APP_SOURCE = fs.readFileSync(APP_PATH, 'utf8');

// The contract's unavailable marker is an em dash. Written as an escape so this
// assertion cannot be weakened by an encoding round-trip.
const UNAVAILABLE_MARK = '\u2014';

const GIB = 1024 ** 3;

globalThis.window = globalThis.window || {};
globalThis.document = { addEventListener() {} };
require(APP_PATH);

const AFM = globalThis.window.AFM;
const { resolveStorageDisplay, resolveIdentityDisplay, updateStorageUI, updateUserUI, Format } = AFM;

/* ── helpers ── */

function stubElement() {
    return {
        textContent: '',
        style: {},
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = String(value); },
    };
}

/** Install a stub document exposing only the selectors app.js actually queries. */
function mountSidebar(nodes) {
    globalThis.document = {
        addEventListener() {},
        querySelector(sel) {
            return Object.prototype.hasOwnProperty.call(nodes, sel) ? nodes[sel] : null;
        },
    };
    return nodes;
}

function sidebarNodes() {
    return mountSidebar({
        '.storage-pct': stubElement(),
        '.storage-fill': stubElement(),
        '.storage-meta': stubElement(),
        '.user-avatar': stubElement(),
        '.user-name': stubElement(),
        '.user-role': stubElement(),
    });
}

/** Everything the volume card would put on screen for one resolved view. */
function renderedVolume(view) {
    return [view.pctText, view.fillWidth, view.meta].join(' | ');
}

function volumeFixture(overrides) {
    return Object.assign({
        treeBytes: 250 * GIB,
        usedBytes: 250 * GIB,
        totalBytes: 500 * GIB,
        volumeAvailable: true,
        truncated: false,
    }, overrides);
}

/* ══════════════════════════════════════════
   SEAM 1 - sidebar volume card, capacity available
   ══════════════════════════════════════════ */

describe('resolveStorageDisplay - a measured volume', () => {
    test('renders the percentage to one decimal place', () => {
        const view = resolveStorageDisplay(volumeFixture({}));
        assert.equal(view.available, true);
        assert.equal(view.pctText, '50.0%', '250 of 500 GiB is exactly half');
    });

    test('bar width is the same percentage, suffixed with %', () => {
        const view = resolveStorageDisplay(volumeFixture({}));
        assert.ok(view.fillWidth.endsWith('%'), `${view.fillWidth} carries a unit`);
        assert.equal(view.fillWidth, '50%');
    });

    test('meta states used of total through Format.bytes', () => {
        const view = resolveStorageDisplay(volumeFixture({}));
        const expected = `${Format.bytes(250 * GIB, 0)} of ${Format.bytes(500 * GIB, 0)} used`;
        assert.equal(view.meta, expected);
        assert.equal(view.meta, '250 GB of 500 GB used');
    });

    test('a genuinely empty volume is still a reading, not an absence', () => {
        // usedBytes 0 with a known capacity IS a measurement. The dash is
        // reserved for "no measurement exists"; suppressing a real zero would be
        // its own kind of lie.
        const view = resolveStorageDisplay(volumeFixture({ usedBytes: 0, treeBytes: 0 }));
        assert.equal(view.available, true);
        assert.equal(view.pctText, '0.0%');
        assert.equal(view.meta, `0 B of ${Format.bytes(500 * GIB, 0)} used`);
        assert.ok(!view.meta.includes('0 B of 0 B'), 'total is a real capacity, not zero');
    });

    test('a full volume does not overflow the bar', () => {
        const view = resolveStorageDisplay(volumeFixture({ usedBytes: 500 * GIB }));
        assert.equal(view.pctText, '100.0%');
        assert.equal(parseFloat(view.fillWidth), 100);
    });
});

/* ══════════════════════════════════════════
   SEAM 1 - every unavailable path
   ══════════════════════════════════════════ */

describe('resolveStorageDisplay - unavailable states never render a figure', () => {
    const cases = {
        'volumeAvailable false (the server could not read the volume)':
            volumeFixture({ volumeAvailable: false }),
        'volumeAvailable missing entirely':
            { treeBytes: 10, usedBytes: 10, totalBytes: 500 * GIB },
        'volumeAvailable as a truthy string, not the boolean true':
            volumeFixture({ volumeAvailable: 'true' }),
        'usedBytes null':
            volumeFixture({ usedBytes: null }),
        'totalBytes null':
            volumeFixture({ totalBytes: null }),
        'both capacities null':
            volumeFixture({ usedBytes: null, totalBytes: null }),
        'totalBytes zero (a division by zero, not a measurement)':
            volumeFixture({ totalBytes: 0 }),
        'totalBytes negative':
            volumeFixture({ totalBytes: -1 }),
        'usedBytes NaN':
            volumeFixture({ usedBytes: NaN }),
        'totalBytes Infinity':
            volumeFixture({ totalBytes: Infinity }),
        'storage undefined':
            undefined,
        'storage null':
            null,
        'storage an empty object':
            {},
        'storage a string':
            'storage',
        'storage a number':
            42,
    };

    for (const [label, storage] of Object.entries(cases)) {
        test(`${label} -> explicit unavailable`, () => {
            const view = resolveStorageDisplay(storage);
            assert.equal(view.available, false, 'declared unavailable');
            assert.equal(view.pctText, UNAVAILABLE_MARK, 'an explicit marker, not a figure');
            assert.equal(view.fillWidth, '0%', 'the bar is empty');
            assert.match(view.meta, /unavailable/i, 'the meta text names the absence');
            assert.equal(view.state, 'unavailable', 'carries a state for styling');
        });

        test(`${label} -> renders neither "0.0%" nor "0 B of 0 B"`, () => {
            const view = resolveStorageDisplay(storage);
            const rendered = renderedVolume(view);
            assert.ok(!rendered.includes('0.0%'), `no zero percentage in "${rendered}"`);
            assert.ok(!rendered.includes('0 B of 0 B'), `no zero-of-zero in "${rendered}"`);
            // The width still ends in %, per the contract - it is the FIGURE that
            // must be absent, so pctText is asserted separately.
            assert.ok(!view.pctText.includes('%'), `no figure in the pct slot: "${view.pctText}"`);
            assert.ok(!rendered.includes('NaN'), `no NaN in "${rendered}"`);
        });
    }

    test('partial and junk input never throws', () => {
        for (const storage of [undefined, null, 0, '', [], NaN, {}, { totalBytes: 1 }, { usedBytes: 1 },
            { usedBytes: 1, totalBytes: 2 }, () => {}, { volumeAvailable: true }]) {
            assert.doesNotThrow(() => resolveStorageDisplay(storage), JSON.stringify(storage) ?? String(storage));
        }
    });
});

/* ══════════════════════════════════════════
   SEAM 2 - sidebar identity: there is no person
   ══════════════════════════════════════════ */

describe('resolveIdentityDisplay - the environment, never a person', () => {
    test('a real /api/health payload renders the environment', () => {
        const health = { success: true, message: 'Dimension API is running', env: 'production' };
        const view = resolveIdentityDisplay(health);
        assert.equal(view.available, true);
        assert.equal(view.name, 'production');
        assert.equal(view.role, 'Self-hosted');
    });

    test('no initials are rendered for any input', () => {
        // An avatar reading "PR" would assert an operator. There is none.
        for (const health of [{ env: 'production' }, { env: 'development' }, {}, null, undefined,
            { env: '' }, { env: '   ' }]) {
            assert.equal(resolveIdentityDisplay(health).avatar, '', JSON.stringify(health));
        }
    });

    test('a failed or missing health payload is an honest absence', () => {
        for (const health of [null, undefined, {}, { success: false }, { env: '' }, { env: '  ' },
            { env: null }, { env: 0 }, { env: false }, 'ok', 7, []]) {
            const view = resolveIdentityDisplay(health);
            assert.equal(view.available, false, JSON.stringify(health));
            assert.equal(view.name, 'Unknown');
            assert.equal(view.role, 'Environment unavailable');
        }
    });

    test('a user-shaped payload does not conjure a user', () => {
        // The old signature took a user object. If anything still passes one, the
        // sidebar must ignore its name rather than render it.
        const view = resolveIdentityDisplay({ name: 'Sarah Chen', role: 'Administrator', initials: 'SC' });
        assert.equal(view.name, 'Unknown');
        assert.equal(view.avatar, '');
    });

    test('never throws on partial input', () => {
        for (const health of [undefined, null, 0, '', [], NaN, {}, { env: {} }, { env: [] }]) {
            assert.doesNotThrow(() => resolveIdentityDisplay(health), String(health));
        }
    });
});

/* ══════════════════════════════════════════
   DOM wrappers - what actually lands on the four pages
   ══════════════════════════════════════════ */

describe('updateStorageUI - sidebar volume card', () => {
    test('writes percentage, bar width and meta on all four pages', () => {
        const nodes = sidebarNodes();
        updateStorageUI(volumeFixture({}));

        assert.equal(nodes['.storage-pct'].textContent, '50.0%');
        assert.equal(nodes['.storage-fill'].style.width, '50%');
        assert.equal(nodes['.storage-meta'].textContent, '250 GB of 500 GB used');
        assert.equal(nodes['.storage-fill'].attributes['data-state'], 'measured');
    });

    test('an unavailable volume paints no figure anywhere in the card', () => {
        const nodes = sidebarNodes();
        updateStorageUI(volumeFixture({ volumeAvailable: false, usedBytes: null, totalBytes: null }));

        assert.equal(nodes['.storage-pct'].textContent, UNAVAILABLE_MARK);
        assert.equal(nodes['.storage-fill'].style.width, '0%');
        assert.equal(nodes['.storage-meta'].textContent, 'Volume usage unavailable');

        const onScreen = [
            nodes['.storage-pct'].textContent,
            nodes['.storage-fill'].style.width,
            nodes['.storage-meta'].textContent,
        ].join(' | ');
        assert.ok(!onScreen.includes('0.0%'), onScreen);
        assert.ok(!onScreen.includes('0 B of 0 B'), onScreen);
    });

    test('an unavailable bar is styled distinguishably from a measured one', () => {
        const nodes = sidebarNodes();
        updateStorageUI(null);
        assert.equal(nodes['.storage-fill'].style.background, 'transparent');
        assert.ok(nodes['.storage-fill'].style.boxShadow.length > 0, 'an outline replaces the fill');
        assert.equal(nodes['.storage-fill'].attributes['data-state'], 'unavailable');
    });

    test('a later reading clears the unavailable styling', () => {
        const nodes = sidebarNodes();
        updateStorageUI(null);
        updateStorageUI(volumeFixture({}));
        assert.equal(nodes['.storage-fill'].style.background, '', 'gradient restored');
        assert.equal(nodes['.storage-fill'].style.boxShadow, '', 'outline removed');
        assert.equal(nodes['.storage-fill'].attributes['data-state'], 'measured');
    });

    test('a page without the volume card does not throw', () => {
        mountSidebar({ '.user-name': stubElement() });
        assert.doesNotThrow(() => updateStorageUI(volumeFixture({})));
    });
});

describe('updateUserUI - sidebar identity', () => {
    test('renders the environment name and self-hosted role', () => {
        const nodes = sidebarNodes();
        updateUserUI({ success: true, message: 'Dimension API is running', env: 'development' });

        assert.equal(nodes['.user-name'].textContent, 'development');
        assert.equal(nodes['.user-role'].textContent, 'Self-hosted');
        assert.equal(nodes['.user-avatar'].textContent, '');
    });

    test('a failed health call renders unknown, not a fabricated operator', () => {
        const nodes = sidebarNodes();
        updateUserUI(null);

        assert.equal(nodes['.user-name'].textContent, 'Unknown');
        assert.equal(nodes['.user-role'].textContent, 'Environment unavailable');
        assert.equal(nodes['.user-avatar'].textContent, '');

        const onScreen = [nodes['.user-name'].textContent, nodes['.user-role'].textContent].join(' | ');
        for (const invented of ['Linux Admin', 'System Operator', 'Sarah Chen', 'Administrator', 'SC', 'LA']) {
            assert.ok(!onScreen.includes(invented), `no "${invented}" in "${onScreen}"`);
        }
    });

    test('a payload without a name no longer throws', () => {
        // The previous implementation ran user.name.substring(0, 2) unguarded,
        // which threw for every payload the real /api/health endpoint returns.
        const nodes = sidebarNodes();
        assert.doesNotThrow(() => updateUserUI({ success: true }));
        assert.doesNotThrow(() => updateUserUI({ env: 'test' }));
        assert.doesNotThrow(() => updateUserUI(undefined));
        assert.equal(nodes['.user-name'].textContent, 'Unknown');
    });

    test('a page without the identity block does not throw', () => {
        mountSidebar({ '.storage-pct': stubElement() });
        assert.doesNotThrow(() => updateUserUI({ env: 'development' }));
    });
});

/* ══════════════════════════════════════════
   SEAM 3 + SEAM 4 - wiring and exports
   ══════════════════════════════════════════ */

describe('seam 3 - the sidebar reads endpoints that exist', () => {
    test('no request to the non-existent /user/profile', () => {
        assert.ok(!APP_SOURCE.includes('/user/profile'), '/user/profile is never requested');
    });

    test('no request to the non-existent /storage/quota', () => {
        assert.ok(!APP_SOURCE.includes('/storage/quota'), '/storage/quota is never requested');
    });

    test('no fabricated identity or capacity literals remain', () => {
        for (const invented of ['Linux Admin', 'System Operator', 'Sarah Chen',
            '342 * 1024', '500 * 1024', 'Administrator']) {
            assert.ok(!APP_SOURCE.includes(invented), `no "${invented}" in app.js`);
        }
    });

    test('the sidebar reads /health and /dashboard/summary instead', () => {
        assert.ok(APP_SOURCE.includes("window.API.get('/health')"), 'health drives the identity block');
        assert.ok(APP_SOURCE.includes("window.API.get('/dashboard/summary')"), 'summary drives the volume card');
    });

    test('no bare fetch() call was introduced', () => {
        assert.ok(!/\bfetch\(/.test(APP_SOURCE), 'all requests go through window.API');
    });
});

describe('seam 4 - helpers are exported for reuse', () => {
    test('window.AFM exposes both sidebar helpers', () => {
        assert.equal(typeof AFM.updateStorageUI, 'function');
        assert.equal(typeof AFM.updateUserUI, 'function');
    });

    test('the exported helpers are the DOM wrappers the sidebar itself calls', () => {
        const nodes = sidebarNodes();
        AFM.updateStorageUI(volumeFixture({}));
        assert.equal(nodes['.storage-pct'].textContent, '50.0%');
        AFM.updateUserUI({ env: 'production' });
        assert.equal(nodes['.user-name'].textContent, 'production');
    });
});