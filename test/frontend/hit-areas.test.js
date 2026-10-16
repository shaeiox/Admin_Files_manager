// test/frontend/hit-areas.test.js
'use strict';

// frontend-interaction-quality, tasks 2.8-2.10 (control-hit-areas spec).
// No layout engine is installed, so geometry is computed from the declared
// sizes: the visible box from the base rules, the interactive area from the
// coarse-pointer ::before expansion, and spacing from the adjacency margin.
// The rendered check (narrow viewport, real pointer) is the browser pass in 5.3.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS_DIR = path.join(__dirname, '..', '..', 'public', 'assets', 'css');
const COMPONENTS = fs.readFileSync(path.join(CSS_DIR, 'components.css'), 'utf8');
const LAYOUT = fs.readFileSync(path.join(CSS_DIR, 'layout.css'), 'utf8');
const TOKENS = fs.readFileSync(path.join(CSS_DIR, 'tokens.css'), 'utf8');

const MIN = 44;

/** Body of the first top-level rule whose selector list is exactly `selector`. */
function rule(css, selector) {
    const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
    const m = css.match(re);
    assert.ok(m, `rule ${selector} exists`);
    return m[2];
}

const px = (body, prop) => {
    const m = body.match(new RegExp(`(?:^|[;\\s])${prop}:\\s*(\\d+)px`));
    assert.ok(m, `${prop} declared in px`);
    return Number(m[1]);
};

function coarseBlock() {
    const start = COMPONENTS.indexOf('@media (any-pointer: coarse)');
    assert.notEqual(start, -1, 'a coarse-pointer block exists in components.css');
    let depth = 0;
    for (let i = COMPONENTS.indexOf('{', start); i < COMPONENTS.length; i++) {
        if (COMPONENTS[i] === '{') depth++;
        if (COMPONENTS[i] === '}' && --depth === 0) return COMPONENTS.slice(start, i + 1);
    }
    throw new Error('unterminated coarse block');
}

const COARSE = coarseBlock();
const BUTTONS = {
    '.btn-icon': px(rule(COMPONENTS, '.btn-icon'), 'width'),
    '.btn-icon-sm': px(rule(COMPONENTS, '.btn-icon-sm'), 'width'),
    '.btn-group .btn-icon': px(rule(COMPONENTS, '.btn-group .btn-icon'), 'width'),
};

describe('every button reaches a 44x44 interactive area on touch (2.8, 2.9)', () => {
    test('the expansion is a centred ::before of at least 44px, on every button kind', () => {
        for (const sel of ['.btn::before', '.btn-icon::before', '.theme-toggle::before', '.mobile-menu-btn::before']) {
            assert.ok(COARSE.includes(sel), `${sel} is expanded`);
        }
        assert.match(COARSE, /width:\s*max\(100%,\s*44px\)/);
        assert.match(COARSE, /height:\s*max\(100%,\s*44px\)/);
        assert.match(COARSE, /transform:\s*translate\(-50%,\s*-50%\)/);
    });

    test('the expansion is transparent and out of flow - visible box, row and topbar heights unchanged', () => {
        assert.match(COARSE, /position:\s*absolute/);
        assert.doesNotMatch(COARSE, /background|border|box-shadow/, 'nothing visible is drawn');
        assert.doesNotMatch(COARSE, /(^|[\s;{])(min-)?(height|width|padding):\s*\d/m, 'no button box is resized');
        for (const [sel, size] of Object.entries(BUTTONS)) assert.ok(size < MIN, `${sel} visible box stays ${size}px`);
    });

    test('the area is not clipped: .btn drops overflow:hidden and every anchor is positioned', () => {
        assert.match(COARSE, /\.btn\s*\{\s*overflow:\s*visible/);
        assert.match(rule(COMPONENTS, '.btn'), /position:\s*relative/);
        assert.match(rule(COMPONENTS, '.btn-icon'), /position:\s*relative/);
        assert.match(COARSE, /\.mobile-menu-btn\s*\{\s*position:\s*relative/);
    });

    test('a 44px area fits inside the topbar without growing it', () => {
        const topbar = Number(TOKENS.match(/--topbar-height:\s*(\d+)px/)[1]);
        assert.ok(topbar >= MIN, `topbar ${topbar}px holds a ${MIN}px area`);
        assert.match(LAYOUT, /\.topbar\s*\{[^}]*height:\s*var\(--topbar-height\)/);
    });
});

describe('adjacent hit areas do not intersect (2.10)', () => {
    const margin = Number(COARSE.match(/\.btn-icon \+ \.btn-icon\s*\{\s*margin-inline-start:\s*(\d+)px/)[1]);

    // Two centred 44px areas are disjoint when their centres are >= 44px apart.
    for (const [a, wa] of Object.entries(BUTTONS)) {
        for (const [b, wb] of Object.entries(BUTTONS)) {
            test(`${a} next to ${b}`, () => {
                const centres = wa / 2 + margin + wb / 2; // container gap only adds to this
                assert.ok(centres >= MIN, `centres ${centres}px apart < ${MIN}px`);
            });
        }
    }

    test('the topbar and row-action containers use flex gap, which only widens the spacing', () => {
        assert.match(LAYOUT, /\.topbar-right\s*\{[^}]*gap:/);
        const files = fs.readFileSync(path.join(CSS_DIR, 'files.css'), 'utf8');
        assert.match(files, /\.row-actions\s*\{[^}]*gap:\s*\d+px/);
    });
});
