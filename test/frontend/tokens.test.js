// test/frontend/tokens.test.js
'use strict';

// frontend-interaction-quality, slice 4 (design-tokens spec).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseColor } = require('../helpers/contrast');

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const CSS_DIR = path.join(PUBLIC, 'assets', 'css');
const FONT_DIR = path.join(PUBLIC, 'assets', 'fonts');
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS = Object.fromEntries(fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css'))
    .map(f => [f, strip(fs.readFileSync(path.join(CSS_DIR, f), 'utf8'))]));
const TOKENS = CSS['tokens.css'];
const ROOT = TOKENS.slice(TOKENS.indexOf(':root {'));
const decl = name => (ROOT.match(new RegExp(`${name}:\\s*([^;]+);`)) || [])[1];

describe('palette excludes unusable values (4.1, 4.2)', () => {
    test('the pure-black and rainbow tokens are gone, and nothing references them', () => {
        for (const css of Object.values(CSS)) assert.doesNotMatch(css, /--color-ink-black|--gradient-hero-horizon/);
    });

    test('no colour token resolves to pure black', () => {
        for (const m of ROOT.matchAll(/(--color-[\w-]+):\s*([^;]+);/g)) {
            if (/-rgb$/.test(m[1])) continue;
            const c = parseColor(m[2]);
            assert.ok(c.r + c.g + c.b > 0, `${m[1]} is black`);
        }
    });

    test('every gradient stop is a palette colour (the violet accent, at some alpha)', () => {
        const violet = parseColor(decl('--color-dusk-violet'));
        for (const m of ROOT.matchAll(/(--gradient-[\w-]+):\s*([^;]+);/g)) {
            for (const stop of m[2].match(/rgba?\([^)]*\)|#[0-9a-f]{3,6}\b|\btransparent\b/gi)) {
                assert.notEqual(stop, 'transparent', `${m[1]}: transparent is black at zero alpha`);
                const c = parseColor(stop);
                assert.deepEqual([c.r, c.g, c.b], [violet.r, violet.g, violet.b], `${m[1]}: ${stop}`);
            }
        }
    });
});

describe('the accent is for interaction, not the primary fill (4.3)', () => {
    test('.btn-primary fills with the highest-contrast surface, never the accent', () => {
        for (const m of CSS['components.css'].matchAll(/\.btn-primary\s*\{([^}]*)\}/g)) {
            assert.doesNotMatch(m[1], /background[^;]*(accent|violet|#6b62f2)/i);
        }
    });
});

describe('typography is self-hosted (4.4, 4.5)', () => {
    test('both families ship as woff2 with their OFL notice', () => {
        for (const f of ['dm-sans-latin.woff2', 'inter-latin.woff2']) {
            assert.equal(fs.readFileSync(path.join(FONT_DIR, f)).subarray(0, 4).toString('latin1'), 'wOF2', f);
        }
        const ofl = fs.readdirSync(FONT_DIR).filter(f => /^OFL/.test(f))
            .map(f => fs.readFileSync(path.join(FONT_DIR, f), 'utf8')).join('\n');
        assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/);
        assert.match(ofl, /DM Sans Project Authors/);
        assert.match(ofl, /Inter Project Authors/);
    });

    test('no stylesheet imports or requests a third-party font', () => {
        for (const [f, css] of Object.entries(CSS)) {
            assert.doesNotMatch(css, /@import\s+url\(\s*['"]?https?:/, f);
            assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/, f);
        }
        for (const html of fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html'))) {
            assert.doesNotMatch(fs.readFileSync(path.join(PUBLIC, html), 'utf8'), /fonts\.googleapis\.com|fonts\.gstatic\.com/, html);
        }
    });

    test('each face swaps, is same-origin, and has a metric-matched fallback', () => {
        const faces = [...TOKENS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1]);
        for (const family of ['DM Sans', 'Inter']) {
            const face = faces.find(f => f.includes(`font-family: '${family}';`));
            assert.ok(face, `${family} @font-face`);
            assert.match(face, /font-display:\s*swap/);
            assert.match(face, /src:\s*url\('\.\.\/fonts\/[\w-]+\.woff2'\)\s*format\('woff2'\)/);
            const fallback = faces.find(f => f.includes(`font-family: '${family} Fallback';`));
            assert.match(fallback, /size-adjust:\s*\d+(\.\d+)?%/);
        }
    });
});

describe('font-family tokens name what they set (4.6)', () => {
    const stacks = [...ROOT.matchAll(/--font-(?!weight-)([\w-]+):\s*([^;]+);/g)];

    test('each token\'s first family is the family it is named for', () => {
        const named = { 'dm-sans': 'DM Sans', inter: 'Inter' };
        assert.deepEqual(stacks.map(m => m[1]).sort(), Object.keys(named).sort());
        for (const [, name, stack] of stacks) {
            assert.equal(stack.split(',')[0].trim().replace(/['"]/g, ''), named[name]);
        }
    });

    test('every token is used and no two stacks are identical', () => {
        const all = Object.values(CSS).join('\n') + Object.values(CSS).join('');
        for (const [, name] of stacks) assert.match(all, new RegExp(`var\\(--font-${name}\\)`), `--font-${name} is used`);
        assert.equal(new Set(stacks.map(m => m[2])).size, stacks.length);
    });
});

describe('corner radius follows the five-step scale (4.7, 4.8)', () => {
    const steps = [...ROOT.matchAll(/--radius-([\w-]+):\s*([^;]+);/g)].map(m => m[1]);

    test('exactly five steps are declared, and each is used', () => {
        assert.deepEqual(steps, ['sm', 'md', 'lg', 'xl', 'pill']);
        const usage = Object.entries(CSS).filter(([f]) => f !== 'tokens.css').map(([, c]) => c).join('\n');
        for (const s of steps) assert.match(usage, new RegExp(`var\\(--radius-${s}\\)`), `--radius-${s} is used`);
    });

    test('no component hardcodes a radius', () => {
        const bad = [];
        for (const [f, css] of Object.entries(CSS)) {
            for (const m of css.matchAll(/border(?:-[a-z]+)*-radius:\s*([^;}]+)/g)) {
                for (const part of m[1].trim().split(/\s+/)) {
                    if (part !== '0' && !new RegExp(`^var\\(--radius-(${steps.join('|')})\\)$`).test(part)) bad.push(`${f}: ${m[0]}`);
                }
            }
        }
        assert.deepEqual(bad, []);
    });

    test('the login card uses a scale token (16px before, --radius-lg = 16px after)', () => {
        assert.match(CSS['login.css'], /\.login-card\s*\{[^}]*border-radius:\s*var\(--radius-lg\)/);
        assert.equal(decl('--radius-lg'), '16px');
    });
});
