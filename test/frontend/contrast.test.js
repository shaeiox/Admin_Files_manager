// test/frontend/contrast.test.js
'use strict';

// frontend-interaction-quality, slice 2 (color-contrast spec). Every ratio is
// computed from the values themes.css declares, in all four theme blocks.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { parseColor, over, contrast, loadThemes, surfaces } = require('../helpers/contrast');

const THEMES = loadThemes();
const AA = 4.5;
// Non-text / large-text minimum (WCAG 1.4.11, 1.4.3 large): icons, active
// markers and bold labels drawn in the accent.
const UI = 3;

/** Every failing pair, named by token, surface and theme - never just a count. */
function failures(token, min, pickSurfaces = s => s) {
    const out = [];
    for (const [theme, vars] of Object.entries(THEMES)) {
        for (const [surface, bg] of Object.entries(pickSurfaces(surfaces(vars)))) {
            const ratio = contrast(parseColor(vars[token]), bg);
            if (ratio < min) out.push(`${token} on ${surface} in ${theme}: ${ratio.toFixed(2)} < ${min}`);
        }
    }
    return out;
}

describe('contrast helper (2.1)', () => {
    test('reports a known pass and a known fail', () => {
        assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
        assert.ok(contrast('#767676', '#ffffff') >= AA, '#767676 on white is the classic AA pass');
        assert.ok(contrast('#777777', '#ffffff') < AA, '#777777 on white is the classic AA fail');
    });

    test('composites translucent surfaces before measuring', () => {
        const c = over('rgba(0, 0, 0, 0.5)', '#ffffff');
        assert.ok(Math.abs(c.r - 127.5) < 0.01 && c.a === 1);
    });

    test('reads all four theme blocks', () => {
        assert.equal(Object.keys(THEMES).length, 4);
        for (const vars of Object.values(THEMES)) assert.ok(vars['--text-tertiary'] && vars['--bg-primary']);
    });
});

describe('text tokens meet AA on every surface, both themes (2.2, 2.5)', () => {
    for (const token of ['--text-primary', '--text-secondary', '--text-tertiary', '--text-muted']) {
        test(`${token} (also placeholders, column headers, helper text)`, () => {
            assert.deepEqual(failures(token, AA), []);
        });
    }

    for (const token of ['--text-link', '--text-link-hover']) {
        test(`${token} on the page background`, () => {
            assert.deepEqual(failures(token, AA, s => ({ '--bg-primary': s['--bg-primary'] })), []);
        });
    }
});

describe('selection (2.4)', () => {
    for (const [theme, vars] of Object.entries(THEMES)) {
        test(`selected text is legible and the highlight is visible in ${theme}`, () => {
            const page = parseColor(vars['--bg-primary']);
            const highlight = over(vars['--selection-bg'], page);
            const ratio = contrast(parseColor(vars['--selection-text']), highlight);
            assert.ok(ratio >= AA, `selection text ${ratio.toFixed(2)} < ${AA}`);
            assert.ok(contrast(highlight, page) >= 1.25, 'the highlight is distinguishable from the page');
        });
    }
});

describe('accent pairings against their applicable minimum (2.6)', () => {
    test('text on an accent fill clears AA', () => {
        for (const [theme, vars] of Object.entries(THEMES)) {
            const ratio = contrast(vars['--text-on-accent'], vars['--accent-primary']);
            assert.ok(ratio >= AA, `${theme}: --text-on-accent on --accent-primary ${ratio.toFixed(2)}`);
        }
    });

    test('accent used as icon / marker / bold-label colour clears the 3:1 minimum', () => {
        // Body-size accent text belongs to --text-link, which is held to AA above.
        assert.deepEqual(failures('--accent-primary', UI), []);
    });
});

describe('the hierarchy is not flattened (2.7)', () => {
    const distinct = (a, b) => contrast(a, b) >= 1.15;

    test('no text token is indistinguishable from --text-primary', () => {
        for (const [theme, vars] of Object.entries(THEMES)) {
            for (const token of ['--text-secondary', '--text-tertiary', '--text-muted']) {
                assert.ok(distinct(vars[token], vars['--text-primary']), `${token} ~ --text-primary in ${theme}`);
            }
        }
    });

    test('the assertion fails if tertiary is set equal to primary', () => {
        const vars = THEMES['dark (:root)'];
        assert.equal(distinct(vars['--text-primary'], vars['--text-primary']), false);
    });
});
