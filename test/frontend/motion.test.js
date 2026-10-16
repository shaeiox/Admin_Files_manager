// test/frontend/motion.test.js
'use strict';

// frontend-interaction-quality, slice 3 (frontend-motion spec) and task 4.9.
// No style engine is installed, so these read the stylesheets and scripts as
// text; the rendered pass (reduced motion on, navigation, upload bar) is 5.3.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ASSETS = path.join(__dirname, '..', '..', 'public', 'assets');
const CSS = Object.fromEntries(
    fs.readdirSync(path.join(ASSETS, 'css'))
        .filter(f => f.endsWith('.css'))
        .map(f => [f, fs.readFileSync(path.join(ASSETS, 'css', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')]),
);
const js = name => fs.readFileSync(path.join(ASSETS, 'js', name), 'utf8');

/** The body of the block opened by `opener` (balanced braces). */
function block(css, opener) {
    const start = css.indexOf(opener);
    if (start === -1) return null;
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++;
        if (css[i] === '}' && --depth === 0) return css.slice(css.indexOf('{', start) + 1, i);
    }
    return null;
}

const REDUCED = block(CSS['base.css'], '@media (prefers-reduced-motion: reduce)');
const LAYOUT_PROP = /^(width|height|min-width|min-height|max-width|max-height|top|left|right|bottom|inset|margin(-\w+)*|padding(-\w+)*|gap|flex(-basis)?)$/;

describe('reduced motion: one policy that stops every loop (3.1, 3.2)', () => {
    const infinite = [];
    for (const [file, css] of Object.entries(CSS)) {
        for (const m of css.matchAll(/([^{}]+)\{[^}]*animation:[^;]*infinite/g)) infinite.push(`${file}: ${m[1].trim()}`);
    }

    test('the infinite animations are enumerated', () => {
        assert.ok(infinite.length >= 10, infinite.join('\n'));
    });

    test('every one of them is neutralised by the universal reduced-motion rule', () => {
        assert.ok(REDUCED, 'base.css has a reduced-motion block');
        const universal = block(REDUCED, '*::after');
        assert.ok(universal, 'it targets *, *::before, *::after - so no selector can escape it');
        assert.match(universal, /animation-iteration-count:\s*1\s*!important/);
        assert.match(universal, /animation-duration:\s*0\.001ms\s*!important/);
        assert.match(universal, /transition-duration:\s*0\.001ms\s*!important/);
    });

    test('it is the only reduced-motion block (no per-file second source of truth)', () => {
        const blocks = Object.entries(CSS).flatMap(([f, css]) => (css.match(/prefers-reduced-motion/g) || []).map(() => f));
        assert.deepEqual(blocks, ['base.css']);
    });
});

describe('reduced motion: end states stay visible and progress stays readable (3.3)', () => {
    test('no entrance animation leaves its element hidden at rest', () => {
        for (const [file, css] of Object.entries(CSS)) {
            for (const m of css.matchAll(/([^{}]+)\{([^}]*animation:\s*(fadeIn\w*|slideIn\w*|scaleIn|toastIn|pageArrive)[^;]*);/g)) {
                assert.doesNotMatch(m[2], /(^|;)\s*opacity:\s*0\s*(;|$)/, `${file} ${m[1].trim()} rests invisible`);
                assert.doesNotMatch(m[2], /animation:[^;]*\b(forwards|both)\b/, `${file} ${m[1].trim()} pins a from-state`);
            }
        }
    });

    test('a determinate bar is a static scale, an indeterminate one a static pattern', () => {
        assert.match(CSS['components.css'], /\.progress-bar \{[^}]*transform:\s*scaleX\(var\(--progress, 0\)\)/);
        assert.match(CSS['components.css'], /\.progress-bar\.is-striped::after \{[^}]*background/);
        assert.match(CSS['uploads.css'], /\.queue-item\.is-done \.qi-fill\s*\{\s*background: var\(--color-success\)/);
    });
});

describe('press feedback (3.4)', () => {
    for (const sel of ['.btn', '.btn-icon', '.dropdown-item']) {
        test(`${sel}:active changes by transform only, and ${sel} transitions transform`, () => {
            const active = block(CSS['components.css'], `\n${sel}:active`); // may head a selector list
            assert.ok(active, `${sel}:active exists`);
            const props = [...active.matchAll(/([a-z-]+)\s*:/g)].map(m => m[1]);
            assert.deepEqual(props.filter(p => p !== 'transform' && p !== 'opacity'), []);
            assert.match(block(CSS['components.css'], `\n${sel} {`), /transition:[^;]*\btransform\b/);
        });
    }

    test('reduced motion makes the press instant, it does not remove it', () => {
        assert.doesNotMatch(REDUCED, /:active[^{]*\{[^}]*transform:\s*none/);
    });
});

describe('animated properties stay on the compositor (3.5, 3.6, 3.7)', () => {
    test('no transition or animation uses the all keyword', () => {
        for (const [file, css] of Object.entries(CSS)) {
            assert.doesNotMatch(css, /transition(-property)?\s*:\s*all\b/, file);
            assert.doesNotMatch(css, /transition(-property)?\s*:[^;]*,\s*all\b/, file);
        }
    });

    test('no transition names a layout property', () => {
        const bad = [];
        for (const [file, css] of Object.entries(CSS)) {
            for (const m of css.matchAll(/transition(?:-property)?\s*:([^;}]*)/g)) {
                for (const part of m[1].replace(/var\([^)]*\)|cubic-bezier\([^)]*\)/g, '').split(',')) {
                    const prop = part.trim().split(/\s+/)[0];
                    if (LAYOUT_PROP.test(prop)) bad.push(`${file}: ${prop}`);
                }
            }
        }
        assert.deepEqual(bad, []);
    });

    test('no keyframe animates a layout property', () => {
        const bad = [];
        for (const [file, css] of Object.entries(CSS)) {
            for (const m of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
                const body = block(css, m[0]);
                for (const p of body.matchAll(/([a-z-]+)\s*:/g)) if (LAYOUT_PROP.test(p[1])) bad.push(`${file} ${m[1]}: ${p[1]}`);
            }
        }
        assert.deepEqual(bad, []);
    });

    test('the sidebar collapse is a translateX glide on the content, not a width or margin transition', () => {
        const sidebar = js('sidebar.js');
        assert.match(sidebar, /function glide\(before\)/);
        assert.match(sidebar, /mainArea\.style\.transform = `translateX\(\$\{delta\}px\)`/);
        assert.match(CSS['layout.css'], /\.main-area \{[^}]*transition: transform var\(--transition-sidebar\)/);
    });

    test('the removed dashboard chart left no height-animated bars behind', () => {
        assert.doesNotMatch(CSS['dashboard.css'], /growBar|\.bar-seg|\.spark-bar/);
        assert.match(CSS['dashboard.css'], /\.numbered-row::after \{[^}]*transform: scaleX\(0\)/);
    });
});

describe('navigation is signalled and holds its indicator (3.9, 3.10)', () => {
    const router = js('router.js');
    const navigate = router.slice(router.indexOf('async function navigate'), router.indexOf('function onClick'));

    test('the indicator is cleared only after the swap - and on the fallback path', () => {
        assert.doesNotMatch(navigate, /finally/);
        const cleared = navigate.lastIndexOf("root.classList.remove('is-navigating')");
        assert.ok(cleared > navigate.indexOf('swap(doc)'), 'removed after the content lands');
        assert.ok(cleared > navigate.indexOf('.init()'), 'and after the page module has rendered');
        const fallback = navigate.slice(navigate.indexOf('catch (err)'), navigate.indexOf('teardown(leaving)'));
        assert.match(fallback, /root\.classList\.remove\('is-navigating'\)[\s\S]*location\.assign/);
    });

    test('the universal is-navigating selector is gone', () => {
        assert.doesNotMatch(CSS['components.css'], /is-navigating \*/);
        assert.match(CSS['components.css'], /html\.is-navigating body \{ cursor: progress; \}/);
    });

    test('scroll is reset instantly, not animated from the old position', () => {
        assert.match(router, /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'instant' \}\)/);
    });

    test('arriving content fades in by opacity alone and rests visible', () => {
        assert.ok(navigate.indexOf('signalArrival()') > navigate.indexOf('swap(doc)'));
        assert.match(CSS['components.css'], /main\.main-area\.is-arriving \{ animation: pageArrive \d+ms ease-out; \}/);
        const frames = block(CSS['components.css'], '@keyframes pageArrive');
        assert.match(frames, /from \{ opacity: 0\.\d+; \}/);
        assert.doesNotMatch(frames, /\bto\b|transform/);
    });
});

describe('tooltip open delay (3.11)', () => {
    test('hover waits for the token, keyboard focus does not', () => {
        assert.match(CSS['tokens.css'], /--tooltip-delay:\s*\d+ms/);
        assert.match(CSS['components.css'], /\[data-tip\]:hover::after \{ transition-delay: var\(--tooltip-delay\); \}/);
        assert.match(CSS['components.css'], /\[data-tip\]:focus-visible::after \{ transition-delay: 0ms; \}/);
    });

    test('reduced motion keeps the delay (it prevents strobing; it is not travel)', () => {
        assert.match(REDUCED, /\[data-tip\]:hover::after \{ transition-delay: var\(--tooltip-delay\) !important; \}/);
    });
});

describe('toast exit wait comes from the duration token (4.9)', () => {
    const vm = require('node:vm');
    const token = CSS['tokens.css'].match(/--transition-base:\s*([^;]+);/)[1];

    function loadToast(getComputedStyle) {
        const sandbox = { console, setTimeout, clearTimeout, getComputedStyle };
        sandbox.window = sandbox;
        sandbox.document = { addEventListener() {}, documentElement: {} };
        vm.createContext(sandbox);
        vm.runInContext(js('app.js'), sandbox);
        return sandbox.window.AFM.Toast;
    }

    test('the wait equals the token the exit animation uses', () => {
        assert.match(CSS['components.css'], /\.toast\.is-leaving \{[^}]*animation: toastOut var\(--transition-base\)/);
        const Toast = loadToast(() => ({ getPropertyValue: name => (name === '--transition-base' ? ` ${token}` : '') }));
        assert.equal(Toast.exitAnimationMs(), parseFloat(token));
        assert.doesNotMatch(js('app.js'), /EXIT_ANIMATION_MS\s*=\s*\d/);
    });

    test('with no stylesheet there is no animation, so nothing to wait for', () => {
        assert.equal(loadToast(() => ({ getPropertyValue: () => '' })).exitAnimationMs(), 0);
    });
});
