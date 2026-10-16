// test/frontend/dialog-drawer.test.js
'use strict';

// frontend-interaction-quality 5.2: the shared dialog layer (app.js Modal) and
// the Files drawer compose without either redefining the other. The real
// Modal runs against a minimal DOM: a dialog opened from a control inside the
// drawer owns focus and the keyboard, and closing it puts focus back in the
// drawer. (files.js deferring its own Escape while a dialog is open is pinned
// in files.test.js, "Escape over an open confirmation leaves the drawer open".)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'app.js'), 'utf8');

function setup() {
    const listeners = [];
    const timers = [];
    const doc = {
        activeElement: null,
        body: { style: {} },
        addEventListener: (type, fn) => listeners.push({ type, fn }),
        querySelectorAll: () => [],
    };
    const node = (name, children = []) => {
        const classes = new Set();
        const attrs = {};
        const n = {
            name, children, attrs,
            classList: { add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c) },
            hasAttribute: k => k in attrs,
            setAttribute: (k, v) => { attrs[k] = String(v); },
            focus() { doc.activeElement = n; },
            querySelector: () => children[0] || null,
            querySelectorAll: () => children,
            contains: x => x === n || children.includes(x),
        };
        return n;
    };
    const sandbox = { console, document: doc, setTimeout: fn => timers.push(fn), clearTimeout() {} };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(APP_SRC, sandbox);
    const key = (k, shiftKey = false) => {
        const e = { key: k, shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
        listeners.filter(l => l.type === 'keydown').forEach(l => l.fn(e));
        return e;
    };
    const flush = () => timers.splice(0).forEach(fn => fn());
    return { Modal: sandbox.window.AFM.Modal, doc, node, key, flush };
}

describe('a dialog above the Files drawer (5.2)', () => {
    test('owns focus while open, and closing it returns focus into the drawer', () => {
        const { Modal, doc, node, key, flush } = setup();
        const drawerDelete = node('drawer:delete');
        node('drawer', [node('drawer:close'), drawerDelete]);
        drawerDelete.focus();

        const cancel = node('dialog:cancel');
        const ok = node('dialog:ok');
        const dialog = node('dialog', [cancel, ok]);
        Modal.open(dialog);
        flush();
        assert.equal(doc.activeElement, cancel, 'the dialog takes focus');

        doc.activeElement = ok;
        const tab = key('Tab');
        assert.equal(tab.defaultPrevented, true);
        assert.equal(doc.activeElement, cancel, 'Tab wraps inside the dialog, never back into the drawer');

        key('Escape');
        assert.equal(dialog.classList.contains('is-open'), false, 'Escape closed the dialog');
        assert.equal(doc.activeElement, drawerDelete, 'focus is back on the drawer control that opened it');
    });

    test('Escape closes only the topmost dialog; the next one keeps the keyboard', () => {
        const { Modal, doc, node, key, flush } = setup();
        const lower = node('lower', [node('lower:btn')]);
        const upper = node('upper', [node('upper:btn')]);
        Modal.open(lower); flush();
        Modal.open(upper); flush();
        key('Escape');
        assert.equal(upper.classList.contains('is-open'), false);
        assert.equal(lower.classList.contains('is-open'), true);
        assert.equal(doc.activeElement, lower.children[0]);
        assert.equal(doc.body.style.overflow, 'hidden', 'the scroll lock is held until the last dialog closes');
    });

    test('Escape takes a programmatic dialog\'s cancel path, so its promise settles', () => {
        const { Modal, node, key, flush } = setup();
        const dialog = node('confirm', [node('confirm:ok')]);
        let dismissed = 0;
        Modal.open(dialog, { onDismiss: () => { dismissed++; Modal.close(dialog); } });
        flush();
        key('Escape');
        assert.equal(dismissed, 1);
        assert.equal(dialog.classList.contains('is-open'), false);
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'app.js'), 'utf8');
        assert.match(src, /open\(backdrop, \{ onDismiss: \(\) => finish\(false\) \}\)/, 'confirm() resolves false');
        assert.match(src, /open\(backdrop, \{ onDismiss: \(\) => finish\(null\) \}\)/, 'prompt() resolves null');
    });

    test('with no dialog open, Escape and Tab are left to the page', () => {
        const { key } = setup();
        assert.equal(key('Escape').defaultPrevented, false);
        assert.equal(key('Tab').defaultPrevented, false);
    });
});
