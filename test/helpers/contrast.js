// test/helpers/contrast.js
'use strict';

// WCAG 2.x contrast, computed from the colour values themes.css actually
// declares - so a token edit cannot lower a ratio without a test noticing.

const fs = require('node:fs');
const path = require('node:path');

const THEMES_PATH = path.join(__dirname, '..', '..', 'public', 'assets', 'css', 'themes.css');

/** '#rgb' | '#rrggbb' | 'rgb(a)(r, g, b[, a])' -> { r, g, b, a } (0-255, alpha 0-1). */
function parseColor(value) {
    const v = String(value).trim().toLowerCase();
    let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (m) {
        const hex = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
        return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
    }
    m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    throw new Error(`unparseable colour: ${value}`);
}

/** Composite a (possibly translucent) colour over an opaque one. */
function over(top, bottom) {
    const t = typeof top === 'string' ? parseColor(top) : top;
    const b = typeof bottom === 'string' ? parseColor(bottom) : bottom;
    const mix = k => t[k] * t.a + b[k] * (1 - t.a);
    return { r: mix('r'), g: mix('g'), b: mix('b'), a: 1 };
}

function luminance(color) {
    const c = typeof color === 'string' ? parseColor(color) : color;
    const lin = ch => {
        const s = ch / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

function contrast(fg, bg) {
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

/** Custom properties declared directly inside the first block opened by `opener`. */
function declarationsAfter(css, opener) {
    const start = css.indexOf(opener);
    if (start === -1) throw new Error(`theme block not found: ${opener}`);
    const body = css.slice(start + opener.length, css.indexOf('}', start));
    const vars = {};
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
    return vars;
}

/** The four theme blocks: two dark (default + forced), two light (media + forced). */
function loadThemes(css = fs.readFileSync(THEMES_PATH, 'utf8')) {
    return {
        'dark (:root)': declarationsAfter(css, ':root {'),
        'light (prefers-color-scheme)': declarationsAfter(css, ':root:not([data-theme="dark"]) {'),
        'light ([data-theme="light"])': declarationsAfter(css, '[data-theme="light"] {'),
        'dark ([data-theme="dark"])': declarationsAfter(css, '[data-theme="dark"] {'),
    };
}

/**
 * The opaque surfaces text is drawn on, per theme. Translucent surfaces
 * (inputs, cards) are composited over the page and over the secondary
 * surface, since both placements occur (a card on the page, an input in a dialog).
 */
function surfaces(vars) {
    const page = vars['--bg-primary'];
    const secondary = vars['--bg-secondary'];
    return {
        '--bg-primary': parseColor(page),
        '--bg-secondary': parseColor(secondary),
        '--bg-sidebar': parseColor(vars['--bg-sidebar']),
        '--bg-elevated': parseColor(vars['--bg-elevated']),
        '--bg-modal': parseColor(vars['--bg-modal']),
        '--bg-dropdown': parseColor(vars['--bg-dropdown']),
        '--bg-input on page': over(vars['--bg-input'], page),
        '--bg-input on secondary': over(vars['--bg-input'], secondary),
        '--bg-card on page': over(vars['--bg-card'], page),
        '--bg-card on secondary': over(vars['--bg-card'], secondary),
    };
}

module.exports = { parseColor, over, luminance, contrast, loadThemes, surfaces, THEMES_PATH };
