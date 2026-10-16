// test/frontend/modal.test.js
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_PATH = path.join(__dirname, '..', '..', 'public', 'assets', 'js', 'app.js');
const APP_SRC = fs.readFileSync(APP_PATH, 'utf8');

describe('Modal focus management and escaping (tasks 1.1–1.5)', () => {
  test('Modal uses an openStack with per-dialog restoreTo', () => {
    assert.ok(/const openStack\s*=\s*\[/.test(APP_SRC), 'openStack exists');
    assert.ok(/const restoreTo\s*=\s*document\.activeElement/.test(APP_SRC), 'restoreTo captured');
  });

  test('Tab cycle is scoped to the topmost layer', () => {
    assert.ok(/const topEntry\s*=\s*\(\)\s*=>\s*openStack\[openStack\.length\s*-\s*1\]/s.test(APP_SRC));
    assert.ok(/if \(e\.key\s*!==\s*'Tab'\) return/.test(APP_SRC));
    assert.ok(/focusableIn\(top\.backdrop\)/.test(APP_SRC));
  });

  test('Escape is handled once at module load for the topmost dialog', () => {
    assert.ok(/document\.addEventListener\(['"]keydown['"],\s*onKeydown\)/.test(APP_SRC));
    assert.ok(/if \(e\.key\s*===\s*['"]Escape['"]\)/.test(APP_SRC));
    assert.ok(/close\(top\.backdrop\)/.test(APP_SRC));
  });

  test('aria-labelledby and aria-describedby are set from rendered nodes', () => {
    assert.ok(/aria-labelledby\s*=\s*["']\${titleId}["']/.test(APP_SRC));
    assert.ok(/aria-describedby\s*=\s*["']\${descId}["']/.test(APP_SRC));
  });

  test('caller-supplied strings are escaped in confirm and prompt', () => {
    assert.ok(/escapeHtml\(title\)/.test(APP_SRC));
    assert.ok(/escapeHtml\(message\)/.test(APP_SRC));
    assert.ok(/escapeHtml\(cancelText\)/.test(APP_SRC));
    assert.ok(/escapeHtml\(confirmText\)/.test(APP_SRC));
  });

  test('scrollbar-gutter: stable is present for modal layout shift fix', () => {
    const baseCss = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'css', 'base.css'), 'utf8');
    assert.ok(/scrollbar-gutter:\s*stable/.test(baseCss));
  });
});

describe('Reduced motion policy (tasks 3.1–3.2)', () => {
  const baseCss = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'assets', 'css', 'base.css'), 'utf8');

  test('single universal reduced-motion block exists', () => {
    assert.ok(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{/.test(baseCss));
    assert.ok(/\*,\s*\*::before,\s*\*::after\s*{/.test(baseCss));
    assert.ok(/animation-duration:\s*0\.001ms\s*!important/.test(baseCss));
    assert.ok(/animation-iteration-count:\s*1\s*!important/.test(baseCss));
    assert.ok(/transition-duration:\s*0\.001ms\s*!important/.test(baseCss));
  });

  test('transition utilities do not use "all"', () => {
    assert.ok(!/\.transition-fast\s*{[^}]*transition:\s*all/.test(baseCss));
    assert.ok(!/\.transition-base\s*{[^}]*transition:\s*all/.test(baseCss));
    assert.ok(!/\.transition-slow\s*{[^}]*transition:\s*all/.test(baseCss));
  });
});
