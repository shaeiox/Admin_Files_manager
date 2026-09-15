# 📦 Project: css

> **Auto-generated code extraction for AI review and editing**
> 
> Generated on: 2026-09-15 11:51:06
> Total files: 9
> Total lines of code: 5829

---

## 🤖 Instructions for AI

This document contains the **complete source code** of the project.
Each file is clearly marked with:
- Its **full relative path** from the project root
- The **programming language** for syntax highlighting
- A **separator** between files for clarity

When suggesting edits, please reference files by their **full path** shown in the headers.

---

## 📊 Project Statistics

| Language | Files | Lines | Size |
|----------|-------|-------|------|
| CSS | 9 | 5829 | 164.3 KB |

---

## 🗂️ Project Structure

```
📦 css/
  ├── 📄 themes.css
  ├── 📄 settings.css
  ├── 📄 uploads.css
  ├── 📄 tokens.css
  ├── 📄 layout.css
  ├── 📄 components.css
  ├── 📄 base.css
  ├── 📄 files.css
  └── 📄 dashboard.css
```

---

## 📑 Table of Contents

1. [`base.css`](#file-1)
2. [`components.css`](#file-2)
3. [`dashboard.css`](#file-3)
4. [`files.css`](#file-4)
5. [`layout.css`](#file-5)
6. [`settings.css`](#file-6)
7. [`themes.css`](#file-7)
8. [`tokens.css`](#file-8)
9. [`uploads.css`](#file-9)

---

## 📝 Source Code Files

---

<a id="file-1"></a>

### 📄 File 1/9: `base.css`

| Property | Value |
|----------|-------|
| **Path** | `base.css` |
| **Language** | CSS |
| **Size** | 11.7 KB |
| **Lines** | 510 |

```css
/* ============================================
   BASE.CSS — Reset, Base Styles & Global Elements
   Admin Files Manager — Dimension Style
   ============================================ */

/* ── Modern Reset ── */
*,
*::before,
*::after {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  -webkit-text-size-adjust: 100%;
  -moz-text-size-adjust: 100%;
  text-size-adjust: 100%;
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  tab-size: 4;
  font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1;
}

body {
  font-family: var(--font-dm-sans);
  font-size: var(--text-body);
  font-weight: var(--font-weight-regular);
  line-height: var(--leading-body);
  color: var(--text-primary);
  background-color: var(--bg-primary);
  min-height: 100vh;
  overflow-x: hidden;
  transition: background-color var(--transition-slow),
              color var(--transition-slow);
}

/* ── Scrollbar Styling ── */
::-webkit-scrollbar {
  width: var(--scrollbar-width);
  height: var(--scrollbar-width);
}

::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: var(--radius-pill);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

/* ── Typography Base ── */
h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-geist);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  line-height: 1.2;
  letter-spacing: -0.02em;
}

h1 {
  font-size: var(--text-heading-lg);
  line-height: var(--leading-heading-lg);
  font-weight: var(--font-weight-medium);
  letter-spacing: -0.035em;
}

h2 {
  font-size: var(--text-heading);
  line-height: var(--leading-heading);
  font-weight: var(--font-weight-medium);
}

h3 {
  font-size: var(--text-heading-sm);
  line-height: var(--leading-heading-sm);
  font-weight: var(--font-weight-medium);
}

h4 {
  font-size: var(--text-subheading);
  line-height: var(--leading-subheading);
  font-weight: var(--font-weight-medium);
}

h5, h6 {
  font-size: var(--text-body);
  line-height: var(--leading-body);
  font-weight: var(--font-weight-medium);
}

p {
  color: var(--text-secondary);
  line-height: var(--leading-body);
  max-width: 65ch;
}

a {
  color: var(--text-primary);
  text-decoration: none;
  transition: color var(--transition-fast),
              opacity var(--transition-fast);
}

a:hover {
  color: var(--accent-primary);
}

strong, b {
  font-weight: var(--font-weight-semibold);
}

small {
  font-size: var(--text-caption);
  line-height: var(--leading-caption);
  letter-spacing: var(--tracking-caption);
}

code, pre {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: var(--text-body-sm);
}

code {
  background: var(--bg-frosted);
  padding: var(--spacing-2) var(--spacing-6);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
}

pre {
  background: var(--bg-secondary);
  padding: var(--spacing-16);
  border-radius: var(--radius-ui);
  border: 1px solid var(--border-primary);
  overflow-x: auto;
}

/* ── Lists ── */
ul, ol {
  list-style: none;
}

/* ── Media ── */
img, svg, video, canvas {
  display: block;
  max-width: 100%;
  height: auto;
}

/* ── Form Elements Base ── */
button, input, select, textarea {
  font-family: inherit;
  font-size: inherit;
  color: inherit;
  border: none;
  outline: none;
  background: none;
}

button {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

input, textarea, select {
  width: 100%;
}

input::placeholder,
textarea::placeholder {
  color: var(--text-tertiary);
  opacity: 1;
}

/* ── Focus Styles ── */
:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  border-radius: var(--radius-xs);
}

button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

/* ── Selection ── */
::selection {
  background-color: rgba(107, 98, 242, 0.3);
  color: var(--color-snow-white);
}

/* ── Table Base ── */
table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
}

th {
  font-family: var(--font-dm-sans);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  letter-spacing: var(--tracking-caption);
  text-transform: uppercase;
  color: var(--text-tertiary);
  text-align: left;
  padding: var(--spacing-12) var(--spacing-16);
  border-bottom: 1px solid var(--border-primary);
  white-space: nowrap;
  user-select: none;
}

td {
  padding: var(--spacing-14) var(--spacing-16);
  border-bottom: 1px solid var(--border-secondary);
  font-size: var(--text-body-sm);
  color: var(--text-secondary);
  vertical-align: middle;
}

tr {
  transition: background-color var(--transition-fast);
}

tbody tr:hover {
  background-color: var(--bg-hover);
}

/* ── Horizontal Rule ── */
hr {
  border: none;
  height: 1px;
  background: var(--border-primary);
  margin: var(--spacing-24) 0;
}

/* ── Hidden / SR-Only ── */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.hidden {
  display: none !important;
}

/* ── Utility: Text ── */
.text-caption {
  font-size: var(--text-caption);
  line-height: var(--leading-caption);
  letter-spacing: var(--tracking-caption);
}

.text-body-sm {
  font-size: var(--text-body-sm);
  line-height: var(--leading-body-sm);
}

.text-body {
  font-size: var(--text-body);
  line-height: var(--leading-body);
}

.text-subheading {
  font-size: var(--text-subheading);
  line-height: var(--leading-subheading);
}

.text-primary { color: var(--text-primary); }
.text-secondary { color: var(--text-secondary); }
.text-tertiary { color: var(--text-tertiary); }
.text-muted { color: var(--text-muted); }
.text-accent { color: var(--accent-primary); }
.text-success { color: var(--color-success); }
.text-warning { color: var(--color-warning); }
.text-error { color: var(--color-error); }

.font-medium { font-weight: var(--font-weight-medium); }
.font-semibold { font-weight: var(--font-weight-semibold); }

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Utility: Layout ── */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.items-end { align-items: flex-end; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.gap-4 { gap: var(--spacing-4); }
.gap-8 { gap: var(--spacing-8); }
.gap-12 { gap: var(--spacing-12); }
.gap-16 { gap: var(--spacing-16); }
.gap-20 { gap: var(--spacing-20); }
.gap-24 { gap: var(--spacing-24); }
.gap-32 { gap: var(--spacing-32); }
.flex-1 { flex: 1; }
.flex-shrink-0 { flex-shrink: 0; }

.grid { display: grid; }

.w-full { width: 100%; }
.h-full { height: 100%; }

/* ── Utility: Spacing ── */
.mt-4 { margin-top: var(--spacing-4); }
.mt-8 { margin-top: var(--spacing-8); }
.mt-12 { margin-top: var(--spacing-12); }
.mt-16 { margin-top: var(--spacing-16); }
.mt-24 { margin-top: var(--spacing-24); }
.mt-32 { margin-top: var(--spacing-32); }
.mb-4 { margin-bottom: var(--spacing-4); }
.mb-8 { margin-bottom: var(--spacing-8); }
.mb-16 { margin-bottom: var(--spacing-16); }
.mb-24 { margin-bottom: var(--spacing-24); }
.ml-auto { margin-left: auto; }

.p-8 { padding: var(--spacing-8); }
.p-12 { padding: var(--spacing-12); }
.p-16 { padding: var(--spacing-16); }
.p-24 { padding: var(--spacing-24); }
.p-28 { padding: var(--spacing-28); }

/* ── Utility: Visual ── */
.rounded-xs { border-radius: var(--radius-xs); }
.rounded-ui { border-radius: var(--radius-ui); }
.rounded-card { border-radius: var(--radius-cards); }
.rounded-pill { border-radius: var(--radius-pill); }

.opacity-0 { opacity: 0; }
.opacity-50 { opacity: 0.5; }
.opacity-100 { opacity: 1; }

.pointer-events-none { pointer-events: none; }
.cursor-pointer { cursor: pointer; }
.select-none { user-select: none; }

.relative { position: relative; }
.absolute { position: absolute; }
.sticky { position: sticky; }

.overflow-hidden { overflow: hidden; }
.overflow-auto { overflow: auto; }
.overflow-y-auto { overflow-y: auto; }

/* ── Transitions ── */
.transition-fast { transition: all var(--transition-fast); }
.transition-base { transition: all var(--transition-base); }
.transition-slow { transition: all var(--transition-slow); }

/* ── Backdrop ── */
.backdrop-blur {
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
}

/* ── Animation Keyframes ── */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeInDown {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideInRight {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes progressBar {
  0% { width: 0%; }
  100% { width: 100%; }
}

@keyframes ripple {
  0% {
    transform: scale(0);
    opacity: 0.5;
  }
  100% {
    transform: scale(4);
    opacity: 0;
  }
}

.animate-fadeIn { animation: fadeIn var(--transition-base) ease-out; }
.animate-fadeInUp { animation: fadeInUp var(--transition-slow) ease-out; }
.animate-fadeInDown { animation: fadeInDown var(--transition-base) ease-out; }
.animate-slideInRight { animation: slideInRight var(--transition-slow) ease-out; }
.animate-scaleIn { animation: scaleIn var(--transition-base) ease-out; }
.animate-pulse { animation: pulse 2s ease-in-out infinite; }
.animate-spin { animation: spin 1s linear infinite; }

/* ── Staggered Animation Delays ── */
.stagger-1 { animation-delay: 50ms; }
.stagger-2 { animation-delay: 100ms; }
.stagger-3 { animation-delay: 150ms; }
.stagger-4 { animation-delay: 200ms; }
.stagger-5 { animation-delay: 250ms; }
.stagger-6 { animation-delay: 300ms; }

/* ── Responsive Breakpoints ── */
@media (max-width: 1280px) {
  h1 { font-size: var(--text-heading); }
  h2 { font-size: var(--text-heading-sm); }
}

@media (max-width: 768px) {
  h1 { font-size: var(--text-heading-sm); }
  h2 { font-size: var(--text-subheading); }
  h3 { font-size: var(--text-body); }

  .hide-mobile { display: none !important; }
}

@media (max-width: 480px) {
  :root {
    --text-body: 15px;
    --card-padding: 20px;
  }
}
```

---

<a id="file-2"></a>

### 📄 File 2/9: `components.css`

| Property | Value |
|----------|-------|
| **Path** | `components.css` |
| **Language** | CSS |
| **Size** | 32.7 KB |
| **Lines** | 1358 |

```css
/* ============================================
   COMPONENTS.CSS — Buttons, Cards, Inputs, Modals
   Admin Files Manager — Dimension Style
   ============================================ */

/* ══════════════════════════════════════════
   BUTTONS
   ══════════════════════════════════════════ */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-8);
  font-family: var(--font-dm-sans);
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.01em;
  padding: var(--spacing-10) var(--spacing-16);
  border-radius: var(--radius-pill);
  border: 1px solid transparent;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  position: relative;
  overflow: hidden;
  transition: background-color var(--transition-fast),
              color var(--transition-fast),
              border-color var(--transition-fast),
              transform var(--transition-fast),
              opacity var(--transition-fast);
}

.btn:active {
  transform: scale(0.975);
}

.btn:disabled,
.btn.is-disabled {
  opacity: 0.45;
  pointer-events: none;
}

.btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* ── Primary (White Pill CTA) ── */
.btn-primary {
  background: var(--text-primary);
  color: var(--bg-primary);
  border-color: transparent;
}

[data-theme="dark"] .btn-primary {
  background: #ffffff;
  color: #161616;
}

[data-theme="light"] .btn-primary {
  background: #161616;
  color: #ffffff;
}

.btn-primary:hover {
  opacity: 0.88;
}

/* ── Accent (violet outline + wash) ── */
.btn-accent {
  background: var(--accent-subtle);
  color: var(--text-primary);
  border-color: var(--border-focus);
}

.btn-accent:hover {
  background: rgba(107, 98, 242, 0.18);
  border-color: var(--border-active);
}

/* ── Ghost (hairline pill) ── */
.btn-ghost {
  background: transparent;
  color: var(--text-primary);
  border-color: var(--border-primary);
}

.btn-ghost:hover {
  background: var(--bg-hover);
  border-color: var(--border-hover);
}

/* ── Subtle (no border) ── */
.btn-subtle {
  background: var(--bg-tag);
  color: var(--text-secondary);
  border-color: transparent;
}

.btn-subtle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* ── Danger ── */
.btn-danger {
  background: var(--color-error-bg);
  color: var(--color-error);
  border-color: var(--color-error-border);
}

.btn-danger:hover {
  background: var(--color-error);
  color: #ffffff;
  border-color: var(--color-error);
}

/* ── Sizes ── */
.btn-sm {
  font-size: var(--text-caption);
  padding: var(--spacing-6) var(--spacing-12);
}

.btn-sm svg {
  width: 14px;
  height: 14px;
}

.btn-lg {
  font-size: var(--text-body);
  padding: var(--spacing-12) var(--spacing-24);
}

.btn-block {
  width: 100%;
}

/* ── Icon Button ── */
.btn-icon {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: var(--radius-ui);
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  position: relative;
}

.btn-icon:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn-icon.is-bordered {
  border-color: var(--border-primary);
}

.btn-icon.is-bordered:hover {
  border-color: var(--border-hover);
}

.btn-icon.is-active {
  background: var(--bg-active);
  color: var(--accent-primary);
}

.btn-icon svg {
  width: 18px;
  height: 18px;
}

.btn-icon-sm {
  width: 28px;
  height: 28px;
}

.btn-icon-sm svg {
  width: 15px;
  height: 15px;
}

/* Notification dot on icon button */
.btn-icon .notif-dot {
  position: absolute;
  top: 7px;
  right: 8px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-primary);
  border: 2px solid var(--bg-topbar);
  box-shadow: 0 0 8px var(--accent-primary);
}

/* ── Button Group ── */
.btn-group {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-4);
  border-radius: var(--radius-ui);
  background: var(--bg-tag);
  border: 1px solid var(--border-secondary);
}

.btn-group .btn-icon {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-sm);
}

.btn-group .btn-icon.is-active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-card);
}

/* ══════════════════════════════════════════
   CARDS
   ══════════════════════════════════════════ */

.card {
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-cards);
  padding: var(--card-padding);
  position: relative;
  overflow: hidden;
  transition: background-color var(--transition-base),
              border-color var(--transition-base),
              transform var(--transition-base);
}

[data-theme="dark"] .card {
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.card-hover:hover {
  border-color: var(--border-hover);
  background: var(--bg-card-hover);
}

.card-flush {
  padding: 0;
}

.card-sm {
  padding: var(--spacing-20);
  border-radius: var(--radius-lg);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-16);
  padding: var(--spacing-20) var(--spacing-24);
  border-bottom: 1px solid var(--border-secondary);
}

.card-title {
  font-family: var(--font-geist);
  font-size: var(--text-subheading);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.card-desc {
  font-size: var(--text-caption);
  color: var(--text-tertiary);
  margin-top: var(--spacing-4);
}

.card-body {
  padding: var(--spacing-20) var(--spacing-24);
}

.card-footer {
  padding: var(--spacing-16) var(--spacing-24);
  border-top: 1px solid var(--border-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-12);
}

/* Card with top gradient hairline */
.card-accent::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--gradient-dusk-violet);
}

/* ══════════════════════════════════════════
   FORMS & INPUTS
   ══════════════════════════════════════════ */

.field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.field-label {
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  color: var(--text-secondary);
  letter-spacing: 0.01em;
  display: flex;
  align-items: center;
  gap: var(--spacing-6);
}

.field-label .req {
  color: var(--color-error);
}

.field-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.45;
}

.field-error {
  font-size: 12px;
  color: var(--color-error);
}

.input,
.textarea,
.select {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-ui);
  padding: var(--spacing-10) var(--spacing-14);
  font-size: var(--text-body-sm);
  color: var(--text-primary);
  transition: border-color var(--transition-fast),
              background-color var(--transition-fast),
              box-shadow var(--transition-fast);
}

.input:hover,
.textarea:hover,
.select:hover {
  border-color: var(--border-hover);
}

.input:focus,
.textarea:focus,
.select:focus {
  outline: none;
  border-color: var(--border-active);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}

.textarea {
  resize: vertical;
  min-height: 96px;
  line-height: 1.55;
}

.select {
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  padding-right: var(--spacing-32);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
}

.select option {
  background: var(--bg-dropdown);
  color: var(--text-primary);
}

/* ── Search Field (pill) ── */
.search-field {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.search-field svg.search-icon {
  position: absolute;
  left: var(--spacing-14);
  width: 16px;
  height: 16px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-pill);
  padding: var(--spacing-10) var(--spacing-16) var(--spacing-10) 40px;
  font-size: var(--text-body-sm);
  color: var(--text-primary);
  transition: all var(--transition-fast);
}

.search-input:focus {
  border-color: var(--border-active);
  box-shadow: 0 0 0 3px var(--accent-subtle);
  background: var(--bg-secondary);
}

.search-kbd {
  position: absolute;
  right: var(--spacing-10);
  display: flex;
  gap: var(--spacing-4);
  pointer-events: none;
}

.kbd {
  font-family: var(--font-dm-sans);
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-tag);
  border: 1px solid var(--border-secondary);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
  line-height: 1.6;
  min-width: 20px;
  text-align: center;
}

/* ── Checkbox ── */
.checkbox {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
}

.checkbox input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.checkbox .box {
  width: 17px;
  height: 17px;
  border-radius: 5px;
  border: 1px solid var(--border-hover);
  background: var(--bg-input);
  display: grid;
  place-items: center;
  transition: all var(--transition-fast);
}

.checkbox .box svg {
  width: 11px;
  height: 11px;
  color: #ffffff;
  opacity: 0;
  transform: scale(0.6);
  transition: all var(--transition-fast);
}

.checkbox input:checked + .box {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.checkbox input:checked + .box svg {
  opacity: 1;
  transform: scale(1);
}

.checkbox input:indeterminate + .box {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}

.checkbox input:indeterminate + .box::after {
  content: '';
  width: 9px;
  height: 2px;
  border-radius: 1px;
  background: #ffffff;
  position: absolute;
}

.checkbox input:indeterminate + .box svg {
  opacity: 0;
}

.checkbox:hover .box {
  border-color: var(--accent-primary);
}

/* ── Switch ── */
.switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.switch input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.switch .track {
  width: 40px;
  height: 22px;
  border-radius: var(--radius-pill);
  background: var(--toggle-bg);
  transition: background-color var(--transition-base);
  position: relative;
}

.switch .track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--toggle-knob);
  transition: transform var(--transition-base);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}

.switch input:checked + .track {
  background: var(--accent-primary);
}

.switch input:checked + .track::after {
  transform: translateX(18px);
}

.switch input:disabled + .track {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Segmented Control ── */
.segmented {
  display: inline-flex;
  padding: var(--spacing-4);
  gap: var(--spacing-2);
  border-radius: var(--radius-pill);
  background: var(--bg-tag);
  border: 1px solid var(--border-secondary);
}

.segmented button {
  padding: var(--spacing-6) var(--spacing-14);
  border-radius: var(--radius-pill);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  color: var(--text-tertiary);
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.segmented button:hover {
  color: var(--text-primary);
}

.segmented button.is-active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-card);
}

/* ══════════════════════════════════════════
   BADGES, TAGS, PILLS
   ══════════════════════════════════════════ */

.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-6);
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.02em;
  padding: 3px var(--spacing-10);
  border-radius: var(--radius-pill);
  background: var(--bg-tag);
  color: var(--text-secondary);
  border: 1px solid transparent;
  white-space: nowrap;
  line-height: 1.6;
}

.badge svg {
  width: 11px;
  height: 11px;
}

.badge-accent {
  background: var(--bg-badge);
  color: var(--accent-primary);
  border-color: rgba(107, 98, 242, 0.25);
}

.badge-success {
  background: var(--color-success-bg);
  color: var(--color-success);
  border-color: var(--color-success-border);
}

.badge-warning {
  background: var(--color-warning-bg);
  color: var(--color-warning);
  border-color: var(--color-warning-border);
}

.badge-error {
  background: var(--color-error-bg);
  color: var(--color-error);
  border-color: var(--color-error-border);
}

.badge-info {
  background: var(--color-info-bg);
  color: var(--color-info);
  border-color: var(--color-info-border);
}

.badge-dot::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}

/* Hairline ghost tag (10px radius, not pill) */
.tag {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-6);
  font-size: var(--text-caption);
  color: var(--text-muted);
  background: transparent;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-ui);
  padding: var(--spacing-6) var(--spacing-10);
  transition: all var(--transition-fast);
}

.tag:hover {
  color: var(--text-primary);
  border-color: var(--border-hover);
}

.tag-close {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  opacity: 0.6;
  transition: opacity var(--transition-fast);
}

.tag-close:hover {
  opacity: 1;
}

/* Status banner pill */
.status-banner {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-10);
  padding: var(--spacing-8) var(--spacing-16);
  border-radius: var(--radius-pill);
  background: var(--bg-frosted);
  border: 1px solid var(--border-primary);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  transition: all var(--transition-fast);
}

.status-banner:hover {
  border-color: var(--border-hover);
  transform: translateY(-1px);
}

.status-banner .sparkle {
  width: 14px;
  height: 14px;
  color: var(--accent-primary);
}

.status-banner .arrow {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
  transition: transform var(--transition-fast);
}

.status-banner:hover .arrow {
  transform: translateX(3px);
}

/* ══════════════════════════════════════════
   DROPDOWN / MENU
   ══════════════════════════════════════════ */

.dropdown {
  position: relative;
  display: inline-flex;
}

.dropdown-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 210px;
  background: var(--bg-dropdown);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-6);
  box-shadow: var(--shadow-dropdown);
  z-index: var(--z-dropdown);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-6px) scale(0.98);
  transform-origin: top right;
  transition: opacity var(--transition-fast),
              transform var(--transition-fast),
              visibility var(--transition-fast);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
}

.dropdown-menu.is-open {
  opacity: 1;
  visibility: visible;
  transform: translateY(0) scale(1);
}

.dropdown-menu.align-left {
  right: auto;
  left: 0;
  transform-origin: top left;
}

.dropdown-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  padding: var(--spacing-8) var(--spacing-10) var(--spacing-4);
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
  width: 100%;
  padding: var(--spacing-8) var(--spacing-10);
  border-radius: var(--radius-md);
  font-size: var(--text-body-sm);
  color: var(--text-secondary);
  text-align: left;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.dropdown-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.dropdown-item svg {
  width: 15px;
  height: 15px;
  opacity: 0.8;
  flex-shrink: 0;
}

.dropdown-item .shortcut {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}

.dropdown-item.is-danger {
  color: var(--color-error);
}

.dropdown-item.is-danger:hover {
  background: var(--color-error-bg);
}

.dropdown-divider {
  height: 1px;
  background: var(--border-secondary);
  margin: var(--spacing-6) var(--spacing-4);
}

/* ══════════════════════════════════════════
   MODAL
   ══════════════════════════════════════════ */

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-modal-backdrop);
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
  z-index: var(--z-modal-backdrop);
  display: grid;
  place-items: center;
  padding: var(--spacing-24);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--transition-base), visibility var(--transition-base);
}

.modal-backdrop.is-open {
  opacity: 1;
  visibility: visible;
}

.modal {
  width: 100%;
  max-width: 480px;
  max-height: calc(100vh - 80px);
  background: var(--bg-modal);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-cards);
  box-shadow: var(--shadow-modal);
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transform: scale(0.95) translateY(10px);
  opacity: 0;
  transition: transform var(--transition-base), opacity var(--transition-base);
}

.modal-backdrop.is-open .modal {
  transform: scale(1) translateY(0);
  opacity: 1;
}

.modal-lg { max-width: 680px; }
.modal-sm { max-width: 400px; }

.modal::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--gradient-dusk-violet);
}

.modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-16);
  padding: var(--spacing-24) var(--spacing-24) var(--spacing-16);
}

.modal-title {
  font-family: var(--font-geist);
  font-size: var(--text-subheading);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.modal-subtitle {
  font-size: var(--text-caption);
  color: var(--text-tertiary);
  margin-top: var(--spacing-4);
}

.modal-body {
  padding: 0 var(--spacing-24) var(--spacing-24);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-8);
  padding: var(--spacing-16) var(--spacing-24);
  border-top: 1px solid var(--border-secondary);
  background: var(--bg-tertiary);
}

/* ══════════════════════════════════════════
   TOAST
   ══════════════════════════════════════════ */

.toast-stack {
  position: fixed;
  bottom: var(--spacing-24);
  right: var(--spacing-24);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-10);
  z-index: var(--z-toast);
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  min-width: 290px;
  max-width: 400px;
  padding: var(--spacing-12) var(--spacing-16);
  border-radius: var(--radius-lg);
  background: var(--bg-dropdown);
  border: 1px solid var(--border-primary);
  box-shadow: var(--shadow-dropdown);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  pointer-events: auto;
  animation: toastIn var(--transition-base) cubic-bezier(0.22, 1, 0.36, 1);
}

.toast.is-leaving {
  animation: toastOut var(--transition-base) ease-in forwards;
}

@keyframes toastIn {
  from { opacity: 0; transform: translateX(40px) scale(0.96); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}

@keyframes toastOut {
  from { opacity: 1; transform: translateX(0) scale(1); }
  to   { opacity: 0; transform: translateX(40px) scale(0.96); }
}

.toast-icon {
  width: 30px;
  height: 30px;
  min-width: 30px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
}

.toast-icon svg { width: 15px; height: 15px; }

.toast.success .toast-icon { background: var(--color-success-bg); color: var(--color-success); }
.toast.error   .toast-icon { background: var(--color-error-bg);   color: var(--color-error); }
.toast.warning .toast-icon { background: var(--color-warning-bg); color: var(--color-warning); }
.toast.info    .toast-icon { background: var(--bg-badge);         color: var(--accent-primary); }

.toast-content { flex: 1; min-width: 0; }

.toast-title {
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  line-height: 1.35;
}

.toast-msg {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
  line-height: 1.4;
}

.toast-close {
  color: var(--text-tertiary);
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.toast-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toast-close svg { width: 14px; height: 14px; }

/* ══════════════════════════════════════════
   PROGRESS
   ══════════════════════════════════════════ */

.progress {
  width: 100%;
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--bg-progress-track);
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--accent-primary);
  transition: width var(--transition-base);
  position: relative;
  overflow: hidden;
}

.progress-bar.is-striped::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}

.progress-bar.is-success { background: var(--color-success); }
.progress-bar.is-error   { background: var(--color-error); }
.progress-bar.is-warning { background: var(--color-warning); }

.progress-sm { height: 4px; }
.progress-lg { height: 9px; }

/* Circular spinner */
.spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--border-primary);
  border-top-color: var(--accent-primary);
  animation: spin 0.7s linear infinite;
  flex-shrink: 0;
}

.spinner-lg { width: 28px; height: 28px; border-width: 3px; }

/* ══════════════════════════════════════════
   TOOLTIP
   ══════════════════════════════════════════ */

[data-tip] {
  position: relative;
}

[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  background: var(--bg-tooltip);
  color: #ffffff;
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  padding: var(--spacing-6) var(--spacing-10);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  z-index: var(--z-tooltip);
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-dropdown);
}

[data-tip]:hover::after {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ══════════════════════════════════════════
   TABS
   ══════════════════════════════════════════ */

.tabs {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  border-bottom: 1px solid var(--border-primary);
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar { display: none; }

.tab {
  position: relative;
  padding: var(--spacing-12) var(--spacing-16);
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-tertiary);
  white-space: nowrap;
  transition: color var(--transition-fast);
}

.tab:hover { color: var(--text-primary); }

.tab.is-active { color: var(--text-primary); }

.tab.is-active::after {
  content: '';
  position: absolute;
  left: var(--spacing-12);
  right: var(--spacing-12);
  bottom: -1px;
  height: 2px;
  border-radius: var(--radius-pill);
  background: var(--accent-primary);
  box-shadow: 0 0 10px var(--accent-primary);
}

.tab-count {
  margin-left: var(--spacing-8);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--bg-tag);
  color: var(--text-tertiary);
}

/* ══════════════════════════════════════════
   AVATAR
   ══════════════════════════════════════════ */

.avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  color: #ffffff;
  background: linear-gradient(135deg, #6b62f2, #2563eb);
  flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.1) inset;
  user-select: none;
}

.avatar-sm { width: 24px; height: 24px; font-size: 10px; }
.avatar-lg { width: 44px; height: 44px; font-size: 15px; }

.avatar-group {
  display: flex;
  align-items: center;
}

.avatar-group .avatar {
  margin-left: -8px;
  border: 2px solid var(--bg-primary);
}

.avatar-group .avatar:first-child { margin-left: 0; }

/* ══════════════════════════════════════════
   EMPTY STATE
   ══════════════════════════════════════════ */

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--spacing-56) var(--spacing-24);
  gap: var(--spacing-12);
}

.empty-icon {
  width: 60px;
  height: 60px;
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
  background: var(--bg-tag);
  border: 1px solid var(--border-secondary);
  color: var(--text-tertiary);
  margin-bottom: var(--spacing-4);
}

.empty-icon svg { width: 26px; height: 26px; }

.empty-title {
  font-family: var(--font-geist);
  font-size: var(--text-subheading);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.empty-desc {
  font-size: var(--text-body-sm);
  color: var(--text-tertiary);
  max-width: 40ch;
}

/* ══════════════════════════════════════════
   SKELETON
   ══════════════════════════════════════════ */

.skeleton {
  border-radius: var(--radius-md);
  min-height: 12px;
}

.skeleton-text { height: 12px; margin-bottom: 8px; }
.skeleton-title { height: 18px; width: 50%; margin-bottom: 12px; }
.skeleton-circle { border-radius: 50%; width: 32px; height: 32px; }
.skeleton-card { height: 120px; border-radius: var(--radius-lg); }

/* ══════════════════════════════════════════
   PAGINATION
   ══════════════════════════════════════════ */

.pagination {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
}

.page-btn {
  min-width: 32px;
  height: 32px;
  padding: 0 var(--spacing-8);
  border-radius: var(--radius-md);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  color: var(--text-tertiary);
  display: grid;
  place-items: center;
  transition: all var(--transition-fast);
  font-variant-numeric: tabular-nums;
}

.page-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.page-btn.is-active {
  background: var(--bg-active);
  color: var(--text-primary);
}

.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.page-btn svg { width: 15px; height: 15px; }

/* ══════════════════════════════════════════
   CONTEXT MENU
   ══════════════════════════════════════════ */

.context-menu {
  position: fixed;
  min-width: 200px;
  background: var(--bg-dropdown);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-6);
  box-shadow: var(--shadow-dropdown);
  z-index: var(--z-tooltip);
  opacity: 0;
  visibility: hidden;
  transform: scale(0.96);
  transform-origin: top left;
  transition: all var(--transition-fast);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
}

.context-menu.is-open {
  opacity: 1;
  visibility: visible;
  transform: scale(1);
}

/* ══════════════════════════════════════════
   MISC
   ══════════════════════════════════════════ */

.divider-v {
  width: 1px;
  height: 22px;
  background: var(--border-primary);
  flex-shrink: 0;
}

.frosted-panel {
  background: var(--bg-frosted);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-cards);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
}

.violet-glow {
  position: absolute;
  border-radius: 50%;
  background: var(--gradient-radial-spotlight);
  filter: blur(50px);
  pointer-events: none;
  z-index: 0;
}

.ripple {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  transform: scale(0);
  animation: ripple 0.6s linear;
  pointer-events: none;
}

/* Responsive */
@media (max-width: 560px) {
  .toast-stack {
    left: var(--spacing-16);
    right: var(--spacing-16);
    bottom: var(--spacing-16);
  }
  .toast { min-width: 0; max-width: 100%; }
  .modal-backdrop { padding: var(--spacing-16); }
}
```

---

<a id="file-3"></a>

### 📄 File 3/9: `dashboard.css`

| Property | Value |
|----------|-------|
| **Path** | `dashboard.css` |
| **Language** | CSS |
| **Size** | 24 KB |
| **Lines** | 1025 |

```css
/* ============================================
   DASHBOARD.CSS — Dashboard Page Specific
   Admin Files Manager — Dimension Style
   ============================================ */

/* ══════════════════════════════════════════
   HERO PANEL — Gradient Horizon
   ══════════════════════════════════════════ */

.hero-panel {
  position: relative;
  border-radius: var(--radius-largecards);
  overflow: hidden;
  padding: var(--spacing-40) var(--spacing-40);
  margin-bottom: var(--spacing-32);
  isolation: isolate;
  min-height: 250px;
  display: flex;
  align-items: center;
}

.hero-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    115deg,
    #f59e0b 0%,
    #ef7c35 18%,
    #c2478a 42%,
    #7c3aed 64%,
    #2563eb 85%,
    #1d4ed8 100%
  );
  z-index: -2;
}

/* Grain / dither overlay for depth */
.hero-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 80% 120% at 80% 0%, rgba(0,0,0,0.35), transparent 60%),
    radial-gradient(ellipse 60% 100% at 10% 100%, rgba(0,0,0,0.25), transparent 60%);
  z-index: -1;
  pointer-events: none;
}

[data-theme="light"] .hero-panel::before {
  filter: saturate(0.92) brightness(1.04);
}

.hero-inner {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: var(--spacing-40);
  align-items: center;
  width: 100%;
}

.hero-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-20);
  max-width: 560px;
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-8);
  align-self: flex-start;
  padding: var(--spacing-6) var(--spacing-14);
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.28);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.02em;
  color: #ffffff;
}

.hero-eyebrow svg {
  width: 13px;
  height: 13px;
}

.hero-title {
  font-family: var(--font-dm-sans);
  font-size: 46px;
  font-weight: var(--font-weight-medium);
  letter-spacing: -0.035em;
  line-height: 1.04;
  color: #ffffff;
  text-shadow: 0 2px 30px rgba(0, 0, 0, 0.2);
}

.hero-title .soft {
  color: rgba(255, 255, 255, 0.62);
}

.hero-desc {
  font-size: var(--text-body);
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.86);
  max-width: 48ch;
}

/* Bulleted feature rows */
.hero-bullets {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
  margin-top: var(--spacing-4);
}

.hero-bullet {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  font-size: var(--text-body-sm);
  color: rgba(255, 255, 255, 0.92);
}

.hero-bullet .bullet-icon {
  width: 20px;
  height: 20px;
  min-width: 20px;
  border-radius: var(--radius-icons);
  background: rgba(255, 255, 255, 0.92);
  display: grid;
  place-items: center;
  color: #161616;
}

.hero-bullet .bullet-icon svg {
  width: 12px;
  height: 12px;
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
  flex-wrap: wrap;
  margin-top: var(--spacing-8);
}

.btn-hero {
  background: #ffffff;
  color: #161616;
  border-radius: var(--radius-pill);
  padding: var(--spacing-12) var(--spacing-22);
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-8);
  border: 1px solid transparent;
  transition: all var(--transition-fast);
}

.btn-hero:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
}

.btn-hero svg { width: 16px; height: 16px; }

.btn-hero-ghost {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.34);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  border-radius: var(--radius-pill);
  padding: var(--spacing-12) var(--spacing-22);
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-8);
  transition: all var(--transition-fast);
}

.btn-hero-ghost:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.5);
}

.btn-hero-ghost svg { width: 16px; height: 16px; }

/* ── Hero Device Mockup ── */
.hero-mockup {
  position: relative;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: rgba(10, 10, 10, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-bottom: none;
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  overflow: hidden;
  align-self: end;
  transform: translateY(18px);
  box-shadow: 0 -10px 60px rgba(0, 0, 0, 0.25);
}

.mockup-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-6);
  padding: var(--spacing-10) var(--spacing-14);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
}

.mockup-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
}

.mockup-path {
  margin-left: var(--spacing-10);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  font-variant-numeric: tabular-nums;
}

.mockup-body {
  padding: var(--spacing-14);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.mockup-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
  padding: var(--spacing-8) var(--spacing-10);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.06);
  animation: fadeInUp 0.5s ease-out backwards;
}

.mockup-row:nth-child(1) { animation-delay: 0.1s; }
.mockup-row:nth-child(2) { animation-delay: 0.2s; }
.mockup-row:nth-child(3) { animation-delay: 0.3s; }
.mockup-row:nth-child(4) { animation-delay: 0.4s; }

.mockup-ico {
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.16);
  display: grid;
  place-items: center;
  color: #ffffff;
  flex-shrink: 0;
}

.mockup-ico svg { width: 12px; height: 12px; }

.mockup-line {
  height: 7px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.22);
}

.mockup-line.w-60 { width: 60%; }
.mockup-line.w-40 { width: 40%; }
.mockup-line.w-75 { width: 75%; }
.mockup-line.w-50 { width: 50%; }

.mockup-meta {
  margin-left: auto;
  height: 6px;
  width: 34px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.14);
  flex-shrink: 0;
}

/* ══════════════════════════════════════════
   STAT CARDS
   ══════════════════════════════════════════ */

.stat-card {
  position: relative;
  padding: var(--spacing-22);
  border-radius: var(--radius-cards);
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
  overflow: hidden;
  transition: all var(--transition-base);
  animation: fadeInUp 0.45s ease-out backwards;
}

[data-theme="dark"] .stat-card {
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.stat-card:hover {
  border-color: var(--border-hover);
  transform: translateY(-2px);
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--gradient-dusk-violet);
  opacity: 0;
  transition: opacity var(--transition-base);
}

.stat-card:hover::before { opacity: 1; }

.stat-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-12);
}

.stat-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-ui);
  display: grid;
  place-items: center;
  background: var(--bg-tag);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: all var(--transition-base);
}

.stat-card:hover .stat-icon {
  background: var(--bg-badge);
  color: var(--accent-primary);
  border-color: rgba(107, 98, 242, 0.25);
}

.stat-icon svg { width: 18px; height: 18px; }

.stat-trend {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  padding: 3px var(--spacing-8);
  border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
}

.stat-trend svg { width: 11px; height: 11px; }

.stat-trend.up {
  background: var(--color-success-bg);
  color: var(--color-success);
}

.stat-trend.down {
  background: var(--color-error-bg);
  color: var(--color-error);
}

.stat-trend.flat {
  background: var(--bg-tag);
  color: var(--text-tertiary);
}

.stat-main { display: flex; flex-direction: column; gap: var(--spacing-4); }

.stat-value {
  font-family: var(--font-dm-sans);
  font-size: 32px;
  font-weight: var(--font-weight-medium);
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.stat-value .unit {
  font-size: 17px;
  color: var(--text-tertiary);
  margin-left: 2px;
  letter-spacing: -0.01em;
}

.stat-label {
  font-size: var(--text-caption);
  color: var(--text-tertiary);
  letter-spacing: var(--tracking-caption);
}

/* Mini sparkline */
.stat-spark {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 28px;
  margin-top: var(--spacing-4);
}

.spark-bar {
  flex: 1;
  border-radius: 2px 2px 0 0;
  background: var(--bg-progress-track);
  transition: background-color var(--transition-base), height var(--transition-slow);
  min-height: 3px;
}

.stat-card:hover .spark-bar {
  background: rgba(107, 98, 242, 0.45);
}

.stat-card:hover .spark-bar:last-child {
  background: var(--accent-primary);
}

/* ══════════════════════════════════════════
   CHART PANEL
   ══════════════════════════════════════════ */

.chart-panel {
  padding: 0;
  overflow: hidden;
}

.chart-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-16);
  padding: var(--spacing-22) var(--spacing-24);
  border-bottom: 1px solid var(--border-secondary);
  flex-wrap: wrap;
}

.chart-legend {
  display: flex;
  align-items: center;
  gap: var(--spacing-16);
  flex-wrap: wrap;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-6);
  font-size: 12px;
  color: var(--text-tertiary);
}

.legend-swatch {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex-shrink: 0;
}

.chart-area {
  padding: var(--spacing-24);
  position: relative;
}

.chart-canvas-wrap {
  position: relative;
  height: 230px;
  width: 100%;
}

.chart-grid-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--border-secondary);
}

/* Bar chart (CSS-based) */
.bar-chart {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--spacing-8);
  height: 100%;
  position: relative;
  z-index: 1;
  padding-bottom: 26px;
}

.bar-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-8);
  height: 100%;
  justify-content: flex-end;
  position: relative;
  cursor: pointer;
}

.bar-stack {
  width: 100%;
  max-width: 34px;
  display: flex;
  flex-direction: column-reverse;
  gap: 2px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  transition: transform var(--transition-fast), filter var(--transition-fast);
}

.bar-col:hover .bar-stack {
  transform: scaleY(1.02);
  filter: brightness(1.15);
}

.bar-seg {
  width: 100%;
  transition: height var(--transition-slow) cubic-bezier(0.22, 1, 0.36, 1);
  animation: growBar 0.8s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}

@keyframes growBar {
  from { height: 0 !important; opacity: 0; }
}

.bar-seg.a { background: var(--accent-primary); }
.bar-seg.b { background: rgba(107, 98, 242, 0.45); }
.bar-seg.c { background: rgba(107, 98, 242, 0.2); }

.bar-label {
  position: absolute;
  bottom: 0;
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.bar-tip {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%) translateY(4px);
  background: var(--bg-tooltip);
  color: #fff;
  font-size: 11px;
  padding: var(--spacing-6) var(--spacing-10);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: all var(--transition-fast);
  z-index: 3;
  box-shadow: var(--shadow-dropdown);
}

.bar-col:hover .bar-tip {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

/* ══════════════════════════════════════════
   DONUT / STORAGE BREAKDOWN
   ══════════════════════════════════════════ */

.donut-wrap {
  display: flex;
  align-items: center;
  gap: var(--spacing-24);
  flex-wrap: wrap;
  justify-content: center;
}

.donut {
  position: relative;
  width: 150px;
  height: 150px;
  flex-shrink: 0;
}

.donut svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.donut circle {
  fill: none;
  stroke-width: 13;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s cubic-bezier(0.22, 1, 0.36, 1),
              opacity var(--transition-fast);
}

.donut-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  pointer-events: none;
}

.donut-value {
  font-family: var(--font-dm-sans);
  font-size: 24px;
  font-weight: var(--font-weight-medium);
  letter-spacing: -0.03em;
  color: var(--text-primary);
  line-height: 1;
}

.donut-label {
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.donut-legend {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
  flex: 1;
  min-width: 160px;
}

.donut-legend-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
  font-size: var(--text-caption);
  cursor: pointer;
  padding: var(--spacing-4) 0;
  transition: opacity var(--transition-fast);
}

.donut-legend-row:hover { opacity: 0.75; }

.donut-legend-row .name {
  color: var(--text-secondary);
  flex: 1;
}

.donut-legend-row .val {
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
}

/* ══════════════════════════════════════════
   ACTIVITY FEED
   ══════════════════════════════════════════ */

.activity-list {
  display: flex;
  flex-direction: column;
}

.activity-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-12);
  padding: var(--spacing-14) var(--spacing-24);
  border-bottom: 1px solid var(--border-secondary);
  transition: background-color var(--transition-fast);
  position: relative;
}

.activity-item:last-child { border-bottom: none; }

.activity-item:hover { background: var(--bg-hover); }

.activity-ico {
  width: 30px;
  height: 30px;
  min-width: 30px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  margin-top: 1px;
}

.activity-ico svg { width: 14px; height: 14px; }

.activity-ico.upload { background: var(--bg-badge); color: var(--accent-primary); }
.activity-ico.download { background: var(--color-info-bg); color: var(--color-info); }
.activity-ico.delete { background: var(--color-error-bg); color: var(--color-error); }
.activity-ico.edit { background: var(--color-warning-bg); color: var(--color-warning); }
.activity-ico.folder { background: var(--color-success-bg); color: var(--color-success); }

.activity-body { flex: 1; min-width: 0; }

.activity-text {
  font-size: var(--text-body-sm);
  color: var(--text-secondary);
  line-height: 1.45;
}

.activity-text strong {
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
}

.activity-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.activity-meta .sep {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}

.activity-time {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/* ══════════════════════════════════════════
   NUMBERED CAPABILITY LIST
   ══════════════════════════════════════════ */

.numbered-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-20);
}

.numbered-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-16);
  cursor: pointer;
  position: relative;
  padding-bottom: var(--spacing-8);
  transition: all var(--transition-fast);
}

.numbered-row::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: 0;
  height: 1px;
  background: var(--gradient-dusk-violet);
  transition: width var(--transition-slow);
}

.numbered-row:hover::after { width: 100%; }

.numbered-name {
  font-size: var(--text-body);
  color: var(--text-primary);
  font-weight: var(--font-weight-regular);
  transition: transform var(--transition-fast);
}

.numbered-row:hover .numbered-name {
  transform: translateX(4px);
}

.numbered-index {
  font-size: var(--text-body-sm);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

/* ══════════════════════════════════════════
   TOP FILES / RANK LIST
   ══════════════════════════════════════════ */

.rank-list {
  display: flex;
  flex-direction: column;
}

.rank-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  padding: var(--spacing-12) var(--spacing-24);
  border-bottom: 1px solid var(--border-secondary);
  transition: background-color var(--transition-fast);
}

.rank-row:last-child { border-bottom: none; }
.rank-row:hover { background: var(--bg-hover); }

.rank-num {
  width: 22px;
  font-size: 12px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rank-info { flex: 1; min-width: 0; }

.rank-name {
  font-size: var(--text-body-sm);
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-sub {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.rank-bar-wrap {
  width: 84px;
  flex-shrink: 0;
}

.rank-count {
  font-size: 12px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  min-width: 46px;
  text-align: right;
  flex-shrink: 0;
}

/* ══════════════════════════════════════════
   QUICK ACTIONS GRID
   ══════════════════════════════════════════ */

.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--spacing-12);
}

.quick-tile {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-10);
  padding: var(--spacing-16);
  border-radius: var(--radius-lg);
  background: var(--bg-tag);
  border: 1px solid var(--border-secondary);
  text-align: left;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}

.quick-tile:hover {
  border-color: var(--border-active);
  background: var(--accent-subtle);
  transform: translateY(-2px);
}

.quick-tile-ico {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
  transition: all var(--transition-fast);
}

.quick-tile:hover .quick-tile-ico {
  color: var(--accent-primary);
  border-color: rgba(107, 98, 242, 0.3);
}

.quick-tile-ico svg { width: 16px; height: 16px; }

.quick-tile-title {
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.quick-tile-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.45;
}

/* ══════════════════════════════════════════
   SERVER HEALTH
   ══════════════════════════════════════════ */

.health-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
}

.health-row {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.health-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-12);
}

.health-name {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  font-size: var(--text-caption);
  color: var(--text-secondary);
}

.health-name svg {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
}

.health-val {
  font-size: var(--text-caption);
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
}

/* Live pulse indicator */
.live-dot {
  position: relative;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-success);
  flex-shrink: 0;
}

.live-dot::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1px solid var(--color-success);
  opacity: 0;
  animation: livePulse 2s ease-out infinite;
}

@keyframes livePulse {
  0%   { transform: scale(0.6); opacity: 0.8; }
  100% { transform: scale(1.5); opacity: 0; }
}

/* ══════════════════════════════════════════
   RESPONSIVE
   ══════════════════════════════════════════ */

@media (max-width: 1100px) {
  .hero-inner { grid-template-columns: 1fr; gap: var(--spacing-32); }
  .hero-mockup { display: none; }
  .hero-title { font-size: 40px; }
}

@media (max-width: 860px) {
  .hero-panel {
    padding: var(--spacing-28) var(--spacing-24);
    border-radius: var(--radius-cards);
    min-height: 0;
  }
  .hero-title { font-size: 32px; }
  .hero-desc { font-size: var(--text-body-sm); }
  .stat-value { font-size: 27px; }
  .chart-canvas-wrap { height: 190px; }
  .donut-wrap { flex-direction: column; }
}

@media (max-width: 560px) {
  .hero-title { font-size: 27px; }
  .hero-actions { flex-direction: column; align-items: stretch; }
  .btn-hero, .btn-hero-ghost { justify-content: center; }
  .activity-item, .rank-row { padding-left: var(--spacing-16); padding-right: var(--spacing-16); }
  .chart-head, .chart-area { padding-left: var(--spacing-16); padding-right: var(--spacing-16); }
}
```

---

<a id="file-4"></a>

### 📄 File 4/9: `files.css`

| Property | Value |
|----------|-------|
| **Path** | `files.css` |
| **Language** | CSS |
| **Size** | 20.4 KB |
| **Lines** | 801 |

```css
/* ============================================
   FILES.CSS — File Browser Page Specific
   Admin Files Manager — Dimension Style
   ============================================ */

/* ══════════════════════════════════════════
   TOOLBAR
   ══════════════════════════════════════════ */

.files-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
  padding: var(--spacing-12) var(--spacing-16);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  margin-bottom: var(--spacing-16);
  flex-wrap: wrap;
  position: sticky;
  top: calc(var(--topbar-height) + 12px);
  z-index: 20;
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  margin-left: auto;
  flex-wrap: wrap;
}

.toolbar-search {
  min-width: 220px;
  flex: 1;
  max-width: 320px;
}

/* Filter chip */
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-6);
  padding: var(--spacing-6) var(--spacing-12);
  border-radius: var(--radius-pill);
  border: 1px solid var(--border-primary);
  background: transparent;
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  color: var(--text-tertiary);
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.filter-chip:hover {
  color: var(--text-primary);
  border-color: var(--border-hover);
  background: var(--bg-hover);
}

.filter-chip.is-active {
  background: var(--accent-subtle);
  color: var(--accent-primary);
  border-color: rgba(107, 98, 242, 0.35);
}

.filter-chip svg { width: 13px; height: 13px; }

.filter-chip .count {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: var(--radius-pill);
  background: var(--bg-tag);
  color: inherit;
  opacity: 0.8;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-6);
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.filter-row::-webkit-scrollbar { display: none; }

/* ══════════════════════════════════════════
   BULK ACTION BAR
   ══════════════════════════════════════════ */

.bulk-bar {
  position: fixed;
  bottom: var(--spacing-24);
  left: 50%;
  transform: translateX(-50%) translateY(120%);
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  padding: var(--spacing-10) var(--spacing-12) var(--spacing-10) var(--spacing-20);
  border-radius: var(--radius-pill);
  background: var(--bg-dropdown);
  border: 1px solid var(--border-primary);
  box-shadow: var(--shadow-modal);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  z-index: var(--z-dropdown);
  transition: transform var(--transition-base) cubic-bezier(0.22, 1, 0.36, 1),
              opacity var(--transition-base);
  opacity: 0;
}

.bulk-bar.is-visible {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}

.bulk-count {
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  white-space: nowrap;
}

.bulk-count .num {
  color: var(--accent-primary);
  font-variant-numeric: tabular-nums;
}

.bulk-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
}

/* ══════════════════════════════════════════
   FILE TABLE (LIST VIEW)
   ══════════════════════════════════════════ */

.files-table-wrap {
  border-radius: var(--radius-cards);
  border: 1px solid var(--border-card);
  background: var(--bg-card);
  overflow: hidden;
}

[data-theme="dark"] .files-table-wrap {
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.files-table {
  width: 100%;
  border-collapse: collapse;
}

.files-table thead th {
  position: sticky;
  top: 0;
  background: var(--bg-secondary);
  z-index: 2;
  font-size: 11px;
  letter-spacing: 0.06em;
  padding: var(--spacing-12) var(--spacing-16);
}

.files-table th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color var(--transition-fast);
}

.files-table th.sortable:hover { color: var(--text-primary); }

.sort-ind {
  display: inline-flex;
  margin-left: 4px;
  opacity: 0;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

.files-table th.sortable:hover .sort-ind { opacity: 0.45; }

.files-table th.is-sorted .sort-ind { opacity: 1; color: var(--accent-primary); }
.files-table th.is-sorted.desc .sort-ind { transform: rotate(180deg); }

.sort-ind svg { width: 12px; height: 12px; }

.files-table td {
  padding: var(--spacing-12) var(--spacing-16);
  border-bottom: 1px solid var(--border-secondary);
  font-size: var(--text-body-sm);
}

.files-table tbody tr {
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.files-table tbody tr:hover { background: var(--bg-hover); }

.files-table tbody tr.is-selected {
  background: var(--accent-subtle);
}

.files-table tbody tr.is-selected:hover {
  background: rgba(107, 98, 242, 0.14);
}

.files-table tbody tr:last-child td { border-bottom: none; }

.col-check { width: 44px; }
.col-size { width: 100px; }
.col-type { width: 110px; }
.col-downloads { width: 110px; }
.col-modified { width: 140px; }
.col-status { width: 110px; }
.col-actions { width: 60px; }

/* ── File name cell ── */
.fname-cell {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  min-width: 0;
}

.ftype-icon {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  border: 1px solid var(--border-secondary);
  position: relative;
  overflow: hidden;
}

.ftype-icon svg { width: 16px; height: 16px; position: relative; z-index: 1; }

.ftype-icon.folder   { background: rgba(245, 158, 11, 0.12); color: #f59e0b; border-color: rgba(245,158,11,0.2); }
.ftype-icon.image    { background: rgba(244, 114, 182, 0.12); color: var(--file-image); border-color: rgba(244,114,182,0.2); }
.ftype-icon.video    { background: rgba(167, 139, 250, 0.12); color: var(--file-video); border-color: rgba(167,139,250,0.2); }
.ftype-icon.audio    { background: rgba(52, 211, 153, 0.12); color: var(--file-audio); border-color: rgba(52,211,153,0.2); }
.ftype-icon.document { background: rgba(96, 165, 250, 0.12); color: var(--file-document); border-color: rgba(96,165,250,0.2); }
.ftype-icon.archive  { background: rgba(251, 191, 36, 0.12); color: var(--file-archive); border-color: rgba(251,191,36,0.2); }
.ftype-icon.code     { background: rgba(251, 146, 60, 0.12); color: var(--file-code); border-color: rgba(251,146,60,0.2); }
.ftype-icon.other    { background: var(--bg-tag); color: var(--text-tertiary); }

.fname-text { min-width: 0; display: flex; flex-direction: column; gap: 2px; }

.fname {
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fpath {
  font-size: 11px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono-num {
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

/* Row actions */
.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

tr:hover .row-actions,
tr.is-selected .row-actions { opacity: 1; }

@media (hover: none) {
  .row-actions { opacity: 1; }
}

/* ══════════════════════════════════════════
   FILE GRID (CARD VIEW)
   ══════════════════════════════════════════ */

.file-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
  padding: var(--spacing-16);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  cursor: pointer;
  transition: all var(--transition-base);
  overflow: hidden;
  animation: fadeInUp 0.35s ease-out backwards;
}

[data-theme="dark"] .file-card {
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.file-card:hover {
  border-color: var(--border-hover);
  transform: translateY(-3px);
}

.file-card.is-selected {
  border-color: var(--border-active);
  background: var(--accent-subtle);
}

.file-card-check {
  position: absolute;
  top: var(--spacing-12);
  left: var(--spacing-12);
  opacity: 0;
  transition: opacity var(--transition-fast);
  z-index: 2;
}

.file-card:hover .file-card-check,
.file-card.is-selected .file-card-check { opacity: 1; }

.file-card-menu {
  position: absolute;
  top: var(--spacing-8);
  right: var(--spacing-8);
  opacity: 0;
  transition: opacity var(--transition-fast);
  z-index: 2;
}

.file-card:hover .file-card-menu { opacity: 1; }

.file-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: var(--radius-md);
  background: var(--bg-tag);
  border: 1px solid var(--border-secondary);
  display: grid;
  place-items: center;
  overflow: hidden;
  position: relative;
}

.file-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-thumb .ftype-icon {
  width: 46px;
  height: 46px;
  border-radius: var(--radius-ui);
}

.file-thumb .ftype-icon svg { width: 22px; height: 22px; }

.file-ext-tag {
  position: absolute;
  bottom: var(--spacing-8);
  right: var(--spacing-8);
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px var(--spacing-6);
  border-radius: var(--radius-xs);
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}

.file-card-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.file-card-name {
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-card-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-6);
  font-size: 11px;
  color: var(--text-tertiary);
}

.file-card-meta .sep {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}

/* ══════════════════════════════════════════
   FOLDER TREE / SIDE PANE
   ══════════════════════════════════════════ */

.tree-panel {
  padding: var(--spacing-16);
  border-radius: var(--radius-cards);
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  position: sticky;
  top: calc(var(--topbar-height) + 12px);
  max-height: calc(100vh - var(--topbar-height) - 48px);
  overflow-y: auto;
}

.tree-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-8);
  margin-bottom: var(--spacing-12);
  padding: 0 var(--spacing-4);
}

.tree-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-tertiary);
  font-weight: var(--font-weight-medium);
}

.tree {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.tree-node { display: flex; flex-direction: column; }

.tree-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-6);
  padding: var(--spacing-6) var(--spacing-8);
  border-radius: var(--radius-md);
  font-size: var(--text-caption);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  user-select: none;
}

.tree-item:hover { background: var(--bg-hover); color: var(--text-primary); }

.tree-item.is-active {
  background: var(--accent-subtle);
  color: var(--accent-primary);
  font-weight: var(--font-weight-medium);
}

.tree-caret {
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--text-tertiary);
  transition: transform var(--transition-fast);
}

.tree-caret svg { width: 11px; height: 11px; }

.tree-node.is-open > .tree-item .tree-caret { transform: rotate(90deg); }

.tree-caret.is-empty { visibility: hidden; }

.tree-ico {
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #f59e0b;
}

.tree-ico svg { width: 14px; height: 14px; }

.tree-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-count {
  font-size: 10px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.tree-children {
  margin-left: 14px;
  padding-left: var(--spacing-8);
  border-left: 1px solid var(--border-secondary);
  display: none;
  flex-direction: column;
  gap: 1px;
}

.tree-node.is-open > .tree-children { display: flex; }

/* ══════════════════════════════════════════
   FILE DETAILS DRAWER
   ══════════════════════════════════════════ */

.drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 380px;
  max-width: 100vw;
  background: var(--bg-modal);
  border-left: 1px solid var(--border-primary);
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform var(--transition-base) cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: var(--shadow-modal);
}

.drawer.is-open { transform: translateX(0); }

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-12);
  padding: var(--spacing-20) var(--spacing-20) var(--spacing-16);
  border-bottom: 1px solid var(--border-secondary);
}

.drawer-title {
  font-family: var(--font-geist);
  font-size: var(--text-body);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-20);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-20);
}

.drawer-preview {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: var(--radius-lg);
  background: var(--bg-tag);
  border: 1px solid var(--border-secondary);
  display: grid;
  place-items: center;
  overflow: hidden;
  position: relative;
}

.drawer-preview img { width: 100%; height: 100%; object-fit: cover; }

.drawer-preview .ftype-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
}

.drawer-preview .ftype-icon svg { width: 26px; height: 26px; }

.drawer-filename {
  font-size: var(--text-body);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  word-break: break-word;
  line-height: 1.4;
}

.meta-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-16);
  padding: var(--spacing-10) 0;
  border-bottom: 1px solid var(--border-secondary);
  font-size: var(--text-caption);
}

.meta-row:last-child { border-bottom: none; }

.meta-key { color: var(--text-tertiary); white-space: nowrap; }

.meta-val {
  color: var(--text-primary);
  text-align: right;
  word-break: break-word;
  font-variant-numeric: tabular-nums;
}

/* Link copy box */
.link-box {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  padding: var(--spacing-8) var(--spacing-8) var(--spacing-8) var(--spacing-12);
  border-radius: var(--radius-ui);
  background: var(--bg-input);
  border: 1px solid var(--border-primary);
}

.link-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'SF Mono', monospace;
}

.drawer-footer {
  padding: var(--spacing-16) var(--spacing-20);
  border-top: 1px solid var(--border-secondary);
  display: flex;
  gap: var(--spacing-8);
  background: var(--bg-tertiary);
}

/* ══════════════════════════════════════════
   DRAG & DROP OVERLAY
   ══════════════════════════════════════════ */

.drop-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: grid;
  place-items: center;
  background: rgba(10, 10, 10, 0.72);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  opacity: 0;
  visibility: hidden;
  transition: all var(--transition-base);
}

[data-theme="light"] .drop-overlay {
  background: rgba(250, 250, 250, 0.8);
}

.drop-overlay.is-active { opacity: 1; visibility: visible; }

.drop-inner {
  padding: var(--spacing-48) var(--spacing-56);
  border-radius: var(--radius-largecards);
  border: 2px dashed var(--accent-primary);
  background: var(--accent-subtle);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-12);
  animation: scaleIn var(--transition-base) ease-out;
}

.drop-inner svg {
  width: 44px;
  height: 44px;
  color: var(--accent-primary);
  animation: pulse 1.6s ease-in-out infinite;
}

.drop-title {
  font-family: var(--font-geist);
  font-size: var(--text-heading-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.drop-desc { font-size: var(--text-body-sm); color: var(--text-tertiary); }

/* ══════════════════════════════════════════
   TABLE FOOTER / PAGINATION BAR
   ══════════════════════════════════════════ */

.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-16);
  padding: var(--spacing-12) var(--spacing-16);
  border-top: 1px solid var(--border-secondary);
  flex-wrap: wrap;
}

.footer-info {
  font-size: var(--text-caption);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.rows-select {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  font-size: var(--text-caption);
  color: var(--text-tertiary);
}

.rows-select select {
  width: auto;
  padding: var(--spacing-4) var(--spacing-24) var(--spacing-4) var(--spacing-8);
  font-size: var(--text-caption);
  background-position: right 6px center;
}

/* ══════════════════════════════════════════
   RESPONSIVE
   ══════════════════════════════════════════ */

@media (max-width: 1200px) {
  .tree-panel { position: static; max-height: none; }
}

@media (max-width: 1024px) {
  .col-downloads, .col-type { display: none; }
}

@media (max-width: 860px) {
  .files-toolbar { position: static; }
  .col-modified, .col-status { display: none; }
  .drawer { width: 100%; }
  .toolbar-search { max-width: none; min-width: 0; width: 100%; }
  .toolbar-right { margin-left: 0; width: 100%; }
}

@media (max-width: 560px) {
  .col-size { display: none; }
  .bulk-bar {
    left: var(--spacing-12);
    right: var(--spacing-12);
    transform: translateY(120%);
    justify-content: space-between;
  }
  .bulk-bar.is-visible { transform: translateY(0); }
  .files-table td, .files-table th {
    padding-left: var(--spacing-12);
    padding-right: var(--spacing-12);
  }
}
```

---

<a id="file-5"></a>

### 📄 File 5/9: `layout.css`

| Property | Value |
|----------|-------|
| **Path** | `layout.css` |
| **Language** | CSS |
| **Size** | 21.9 KB |
| **Lines** | 995 |

```css
/* ============================================
   LAYOUT.CSS — App Shell, Sidebar, Topbar, Grids
   Admin Files Manager — Dimension Style
   ============================================ */

/* ══════════════════════════════════════════
   APP SHELL
   ══════════════════════════════════════════ */

.app-shell {
  display: flex;
  min-height: 100vh;
  width: 100%;
  position: relative;
  isolation: isolate;
}

/* Ambient violet glow — signature accent */
.app-shell::before {
  content: '';
  position: fixed;
  top: -20%;
  left: 20%;
  width: 60vw;
  height: 60vh;
  background: var(--gradient-radial-spotlight);
  opacity: 0.6;
  pointer-events: none;
  z-index: -1;
  filter: blur(60px);
  transition: opacity var(--transition-slow);
}

[data-theme="light"] .app-shell::before {
  opacity: 0.35;
}

/* ══════════════════════════════════════════
   SIDEBAR
   ══════════════════════════════════════════ */

.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: var(--sidebar-width);
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  z-index: var(--z-sidebar);
  transition: width var(--transition-sidebar),
              transform var(--transition-sidebar),
              background-color var(--transition-slow);
  overflow: hidden;
}

/* Sidebar top accent wash */
.sidebar::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 240px;
  background: var(--gradient-sidebar-accent);
  pointer-events: none;
  z-index: 0;
}

/* Right edge hairline glow */
.sidebar::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 1px;
  height: 100%;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(107, 98, 242, 0.35) 30%,
    rgba(107, 98, 242, 0.15) 60%,
    transparent 100%
  );
  pointer-events: none;
  opacity: 0.8;
}

/* ── Collapsed State ── */
.sidebar.is-collapsed {
  width: var(--sidebar-collapsed-width);
}

/* ── Sidebar Header / Brand ── */
.sidebar-header {
  height: var(--topbar-height);
  min-height: var(--topbar-height);
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  padding: 0 var(--spacing-16);
  position: relative;
  z-index: 1;
  border-bottom: 1px solid var(--border-secondary);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  min-width: 0;
  flex: 1;
}

.brand-mark {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: var(--radius-ui);
  background: linear-gradient(135deg, #f59e0b 0%, #7c3aed 55%, #2563eb 100%);
  display: grid;
  place-items: center;
  position: relative;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
}

.brand-mark svg {
  width: 18px;
  height: 18px;
  color: #ffffff;
  position: relative;
  z-index: 1;
}

.brand-mark::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.28) 0%,
    transparent 55%
  );
}

.brand-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  opacity: 1;
  transition: opacity var(--transition-fast);
}

.brand-name {
  font-family: var(--font-dm-sans);
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  letter-spacing: -0.01em;
  color: var(--text-primary);
  white-space: nowrap;
  line-height: 1.2;
}

.brand-sub {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  white-space: nowrap;
  line-height: 1.4;
}

.sidebar.is-collapsed .brand-text {
  opacity: 0;
  pointer-events: none;
}

.sidebar.is-collapsed .sidebar-header {
  padding: 0;
  justify-content: center;
}

.sidebar.is-collapsed .brand {
  flex: 0;
  justify-content: center;
}

/* ── Sidebar Scroll Area ── */
.sidebar-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--spacing-16) var(--spacing-12);
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-24);
}

.sidebar.is-collapsed .sidebar-body {
  padding: var(--spacing-16) var(--spacing-12);
}

/* ── Nav Group ── */
.nav-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.nav-group-label {
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding: var(--spacing-8) var(--spacing-12) var(--spacing-6);
  white-space: nowrap;
  transition: opacity var(--transition-fast);
}

.sidebar.is-collapsed .nav-group-label {
  opacity: 0;
  height: 12px;
  padding: 0;
  overflow: hidden;
}

/* ── Nav Item ── */
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  padding: var(--spacing-10) var(--spacing-12);
  border-radius: var(--radius-ui);
  color: var(--text-secondary);
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  letter-spacing: 0.01em;
  white-space: nowrap;
  transition: background-color var(--transition-fast),
              color var(--transition-fast);
  cursor: pointer;
  user-select: none;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.nav-item:active {
  background: var(--bg-active);
}

.nav-item .nav-icon {
  width: 18px;
  height: 18px;
  min-width: 18px;
  display: grid;
  place-items: center;
  color: currentColor;
  opacity: 0.85;
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}

.nav-item:hover .nav-icon {
  opacity: 1;
}

.nav-item .nav-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: opacity var(--transition-fast);
}

/* Active nav item */
.nav-item.is-active {
  background: var(--bg-active);
  color: var(--text-primary);
}

.nav-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--accent-primary);
  box-shadow: 0 0 12px rgba(107, 98, 242, 0.7);
}

.nav-item.is-active .nav-icon {
  color: var(--accent-primary);
  opacity: 1;
}

/* Nav badge (counts) */
.nav-badge {
  font-size: 11px;
  font-weight: var(--font-weight-medium);
  padding: 2px var(--spacing-8);
  border-radius: var(--radius-pill);
  background: var(--bg-badge);
  color: var(--accent-primary);
  line-height: 1.5;
  transition: opacity var(--transition-fast);
}

.nav-badge.is-neutral {
  background: var(--bg-tag);
  color: var(--text-tertiary);
}

/* Collapsed nav */
.sidebar.is-collapsed .nav-item {
  justify-content: center;
  padding: var(--spacing-10);
}

.sidebar.is-collapsed .nav-label,
.sidebar.is-collapsed .nav-badge {
  opacity: 0;
  width: 0;
  overflow: hidden;
  pointer-events: none;
}

/* Tooltip on collapsed nav */
.sidebar.is-collapsed .nav-item::after {
  content: attr(data-tooltip);
  position: absolute;
  left: calc(100% + 14px);
  top: 50%;
  transform: translateY(-50%) translateX(-6px);
  background: var(--bg-tooltip);
  color: #ffffff;
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  padding: var(--spacing-6) var(--spacing-10);
  border-radius: var(--radius-md);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  z-index: var(--z-tooltip);
  transition: opacity var(--transition-fast), transform var(--transition-fast);
  box-shadow: var(--shadow-dropdown);
}

.sidebar.is-collapsed .nav-item:hover::after {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}

/* ── Storage Meter Card ── */
.storage-card {
  margin-top: auto;
  padding: var(--spacing-16);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-12);
  transition: opacity var(--transition-fast), padding var(--transition-sidebar);
  position: relative;
  overflow: hidden;
}

.storage-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--gradient-dusk-violet);
}

.storage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-8);
}

.storage-title {
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  white-space: nowrap;
}

.storage-pct {
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.storage-bar {
  height: 6px;
  border-radius: var(--radius-pill);
  background: var(--bg-progress-track);
  overflow: hidden;
  position: relative;
}

.storage-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: linear-gradient(90deg, #f59e0b, #7c3aed 60%, #2563eb);
  transition: width var(--transition-slow);
  position: relative;
}

.storage-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.35),
    transparent
  );
  background-size: 200% 100%;
  animation: shimmer 2.4s ease-in-out infinite;
}

.storage-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.sidebar.is-collapsed .storage-card {
  padding: var(--spacing-8);
  align-items: center;
}

.sidebar.is-collapsed .storage-head,
.sidebar.is-collapsed .storage-meta {
  display: none;
}

.sidebar.is-collapsed .storage-bar {
  width: 100%;
  height: 4px;
}

/* ── Sidebar Footer ── */
.sidebar-footer {
  padding: var(--spacing-12);
  border-top: 1px solid var(--border-secondary);
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
}

.sidebar-user {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
  padding: var(--spacing-8);
  border-radius: var(--radius-ui);
  cursor: pointer;
  transition: background-color var(--transition-fast);
  min-width: 0;
}

.sidebar-user:hover {
  background: var(--bg-hover);
}

.user-avatar {
  width: 30px;
  height: 30px;
  min-width: 30px;
  border-radius: var(--radius-pill);
  background: linear-gradient(135deg, #6b62f2, #2563eb);
  display: grid;
  place-items: center;
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  color: #ffffff;
  letter-spacing: 0.02em;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
}

.user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  transition: opacity var(--transition-fast);
}

.user-name {
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.user-role {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  line-height: 1.3;
}

.sidebar.is-collapsed .user-info,
.sidebar.is-collapsed .sidebar-user .chev {
  opacity: 0;
  width: 0;
  overflow: hidden;
}

.sidebar.is-collapsed .sidebar-user {
  justify-content: center;
}

/* ── Collapse Toggle Button ── */
.sidebar-collapse-btn {
  position: absolute;
  top: 78px;
  right: -13px;
  width: 26px;
  height: 26px;
  border-radius: var(--radius-pill);
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  display: grid;
  place-items: center;
  color: var(--text-secondary);
  z-index: 2;
  transition: all var(--transition-fast);
  box-shadow: var(--shadow-card);
}

.sidebar-collapse-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-hover);
  transform: scale(1.08);
}

.sidebar-collapse-btn svg {
  width: 14px;
  height: 14px;
  transition: transform var(--transition-sidebar);
}

.sidebar.is-collapsed .sidebar-collapse-btn svg {
  transform: rotate(180deg);
}

/* ══════════════════════════════════════════
   MAIN AREA
   ══════════════════════════════════════════ */

.main-area {
  flex: 1;
  min-width: 0;
  margin-left: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  transition: margin-left var(--transition-sidebar);
}

.sidebar.is-collapsed ~ .main-area {
  margin-left: var(--sidebar-collapsed-width);
}

/* ══════════════════════════════════════════
   TOPBAR
   ══════════════════════════════════════════ */

.topbar {
  position: sticky;
  top: 0;
  height: var(--topbar-height);
  min-height: var(--topbar-height);
  display: flex;
  align-items: center;
  gap: var(--spacing-16);
  padding: 0 var(--spacing-24);
  background: var(--bg-topbar);
  -webkit-backdrop-filter: blur(16px) saturate(160%);
  backdrop-filter: blur(16px) saturate(160%);
  border-bottom: 1px solid var(--border-primary);
  z-index: var(--z-topbar);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  min-width: 0;
}

.topbar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  max-width: 520px;
  margin: 0 auto;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  margin-left: auto;
}

.mobile-menu-btn {
  display: none;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-ui);
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  border: 1px solid var(--border-primary);
  transition: all var(--transition-fast);
}

.mobile-menu-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* ── Breadcrumb ── */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--spacing-6);
  font-size: var(--text-body-sm);
  min-width: 0;
  overflow: hidden;
}

.breadcrumb-item {
  color: var(--text-tertiary);
  white-space: nowrap;
  padding: var(--spacing-4) var(--spacing-8);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
  cursor: pointer;
}

.breadcrumb-item:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.breadcrumb-item.is-current {
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
  cursor: default;
}

.breadcrumb-item.is-current:hover {
  background: transparent;
}

.breadcrumb-sep {
  color: var(--text-tertiary);
  opacity: 0.5;
  display: grid;
  place-items: center;
}

.breadcrumb-sep svg {
  width: 14px;
  height: 14px;
}

/* ══════════════════════════════════════════
   PAGE CONTENT
   ══════════════════════════════════════════ */

.page {
  flex: 1;
  padding: var(--spacing-32) var(--spacing-24) var(--spacing-56);
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  animation: fadeIn var(--transition-base) ease-out;
}

.page-narrow {
  max-width: var(--page-max-width);
}

/* ── Page Header ── */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-24);
  margin-bottom: var(--spacing-32);
  flex-wrap: wrap;
}

.page-title-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
  min-width: 0;
}

.page-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-8);
  font-size: var(--text-caption);
  letter-spacing: var(--tracking-caption);
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.page-eyebrow .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 8px var(--accent-primary);
}

.page-title {
  font-family: var(--font-dm-sans);
  font-size: 40px;
  font-weight: var(--font-weight-medium);
  letter-spacing: -0.035em;
  line-height: 1.05;
  color: var(--text-primary);
}

.page-subtitle {
  font-size: var(--text-body);
  color: var(--text-secondary);
  max-width: 62ch;
}

.page-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  flex-wrap: wrap;
}

/* ── Section ── */
.section {
  margin-bottom: var(--section-gap);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-16);
  margin-bottom: var(--spacing-20);
  flex-wrap: wrap;
}

.section-title {
  font-family: var(--font-geist);
  font-size: var(--text-heading-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--text-primary);
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
}

.section-desc {
  font-size: var(--text-body-sm);
  color: var(--text-tertiary);
  margin-top: var(--spacing-4);
}

/* Accent divider line */
.accent-divider {
  height: 1px;
  width: 100%;
  background: var(--gradient-dusk-violet);
  margin: var(--spacing-32) 0;
}

/* ══════════════════════════════════════════
   GRID SYSTEM
   ══════════════════════════════════════════ */

.grid-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--spacing-16);
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-20);
}

.grid-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-20);
}

.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-16);
}

.grid-sidebar-split {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.9fr);
  gap: var(--spacing-20);
  align-items: start;
}

.grid-files {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: var(--spacing-16);
}

/* ══════════════════════════════════════════
   MOBILE OVERLAY
   ══════════════════════════════════════════ */

.sidebar-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
  z-index: calc(var(--z-sidebar) - 1);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--transition-base), visibility var(--transition-base);
}

.sidebar-overlay.is-visible {
  opacity: 1;
  visibility: visible;
}

/* ══════════════════════════════════════════
   RESPONSIVE
   ══════════════════════════════════════════ */

@media (max-width: 1200px) {
  .grid-sidebar-split {
    grid-template-columns: 1fr;
  }

  .grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 1024px) {
  .grid-3 {
    grid-template-columns: repeat(2, 1fr);
  }

  .topbar-center {
    max-width: 340px;
  }
}

@media (max-width: 860px) {
  .sidebar {
    transform: translateX(-100%);
    width: var(--sidebar-width) !important;
    box-shadow: var(--shadow-modal);
  }

  .sidebar.is-mobile-open {
    transform: translateX(0);
  }

  .sidebar.is-collapsed {
    width: var(--sidebar-width) !important;
  }

  .sidebar.is-collapsed .brand-text,
  .sidebar.is-collapsed .nav-label,
  .sidebar.is-collapsed .nav-badge,
  .sidebar.is-collapsed .nav-group-label,
  .sidebar.is-collapsed .user-info {
    opacity: 1;
    width: auto;
    height: auto;
    padding: revert;
  }

  .sidebar.is-collapsed .nav-item {
    justify-content: flex-start;
    padding: var(--spacing-10) var(--spacing-12);
  }

  .sidebar.is-collapsed .nav-item::after {
    display: none;
  }

  .sidebar.is-collapsed .storage-card {
    padding: var(--spacing-16);
    align-items: stretch;
  }

  .sidebar.is-collapsed .storage-head,
  .sidebar.is-collapsed .storage-meta {
    display: flex;
  }

  .sidebar-collapse-btn {
    display: none;
  }

  .main-area,
  .sidebar.is-collapsed ~ .main-area {
    margin-left: 0;
  }

  .mobile-menu-btn {
    display: flex;
  }

  .topbar {
    padding: 0 var(--spacing-16);
  }

  .topbar-center {
    display: none;
  }

  .page {
    padding: var(--spacing-24) var(--spacing-16) var(--spacing-48);
  }

  .page-title {
    font-size: 30px;
  }

  .grid-2,
  .grid-3,
  .grid-4 {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .breadcrumb .breadcrumb-item:not(.is-current):not(:first-child),
  .breadcrumb .breadcrumb-sep:not(:last-of-type) {
    display: none;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
  }

  .page-actions {
    width: 100%;
  }

  .grid-files {
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  }

  .grid-stats {
    grid-template-columns: 1fr;
  }
}
```

---

<a id="file-6"></a>

### 📄 File 6/9: `settings.css`

| Property | Value |
|----------|-------|
| **Path** | `settings.css` |
| **Language** | CSS |
| **Size** | 19 KB |
| **Lines** | 748 |

```css
/* ============================================
   SETTINGS.CSS — Settings Page Specific
   Admin Files Manager — Dimension Style
   ============================================ */

/* ══════════════════════════════════════════
   SETTINGS LAYOUT
   ══════════════════════════════════════════ */

.settings-layout {
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr);
  gap: var(--spacing-32);
  align-items: start;
}

/* ── Settings side nav ── */
.settings-nav {
  position: sticky;
  top: calc(var(--topbar-height) + 20px);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.settings-nav-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-tertiary);
  padding: var(--spacing-10) var(--spacing-12) var(--spacing-6);
  font-weight: var(--font-weight-medium);
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
  padding: var(--spacing-10) var(--spacing-12);
  border-radius: var(--radius-ui);
  font-size: var(--text-body-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  text-align: left;
  width: 100%;
}

.settings-nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.settings-nav-item svg {
  width: 16px;
  height: 16px;
  opacity: 0.8;
  flex-shrink: 0;
}

.settings-nav-item.is-active {
  background: var(--bg-active);
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
}

.settings-nav-item.is-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  border-radius: var(--radius-pill);
  background: var(--accent-primary);
  box-shadow: 0 0 10px var(--accent-primary);
}

.settings-nav-item.is-active svg {
  color: var(--accent-primary);
  opacity: 1;
}

/* ── Settings content pane ── */
.settings-content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-24);
  min-width: 0;
}

.settings-pane {
  display: none;
  flex-direction: column;
  gap: var(--spacing-20);
  animation: fadeInUp 0.35s ease-out;
}

.settings-pane.is-active { display: flex; }

/* ══════════════════════════════════════════
   SETTINGS GROUP / ROW
   ══════════════════════════════════════════ */

.settings-group {
  border-radius: var(--radius-cards);
  border: 1px solid var(--border-card);
  background: var(--bg-card);
  overflow: hidden;
}

[data-theme="dark"] .settings-group {
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.sg-head {
  padding: var(--spacing-20) var(--spacing-24) var(--spacing-16);
  border-bottom: 1px solid var(--border-secondary);
  position: relative;
}

.sg-head::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--gradient-dusk-violet);
  opacity: 0.6;
}

.sg-title {
  font-family: var(--font-geist);
  font-size: var(--text-subheading);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  letter-spacing: -0.01em;
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
}

.sg-desc {
  font-size: var(--text-caption);
  color: var(--text-tertiary);
  margin-top: var(--spacing-4);
  line-height: 1.55;
  max-width: 62ch;
}

.sg-body {
  display: flex;
  flex-direction: column;
}

.sg-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-12);
  padding: var(--spacing-14) var(--spacing-24);
  border-top: 1px solid var(--border-secondary);
  background: var(--bg-tertiary);
  flex-wrap: wrap;
}

.sg-footer-note {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ── Setting row ── */
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-24);
  padding: var(--spacing-18, 18px) var(--spacing-24);
  border-bottom: 1px solid var(--border-secondary);
  transition: background-color var(--transition-fast);
  flex-wrap: wrap;
}

.setting-row:last-child { border-bottom: none; }

.setting-row:hover { background: var(--bg-hover); }

.setting-row.is-stacked {
  flex-direction: column;
  align-items: stretch;
  gap: var(--spacing-12);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  min-width: 0;
  flex: 1;
}

.setting-name {
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  flex-wrap: wrap;
}

.setting-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.55;
  max-width: 58ch;
}

.setting-control {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
  flex-shrink: 0;
}

.setting-control .input,
.setting-control .select {
  min-width: 190px;
  width: auto;
}

.setting-control.is-wide { width: 100%; }

.setting-control.is-wide .input,
.setting-control.is-wide .select,
.setting-control.is-wide .textarea { width: 100%; }

/* ══════════════════════════════════════════
   THEME PICKER
   ══════════════════════════════════════════ */

.theme-picker {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--spacing-12);
  padding: var(--spacing-20) var(--spacing-24);
}

.theme-option {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-10);
  padding: var(--spacing-12);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-card);
  background: var(--bg-tag);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  text-align: left;
}

.theme-option:hover {
  border-color: var(--border-hover);
  transform: translateY(-2px);
}

.theme-option.is-active {
  border-color: var(--border-active);
  background: var(--accent-subtle);
}

.theme-option.is-active::after {
  content: '';
  position: absolute;
  top: var(--spacing-10);
  right: var(--spacing-10);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 10px rgba(107, 98, 242, 0.6);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
}

/* Mini theme preview */
.theme-preview {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--border-secondary);
  display: flex;
  position: relative;
}

.tp-side {
  width: 28%;
  height: 100%;
  border-right: 1px solid rgba(128, 128, 128, 0.22);
  padding: 6px 5px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tp-main {
  flex: 1;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tp-line {
  height: 4px;
  border-radius: 2px;
}

.tp-block {
  flex: 1;
  border-radius: 3px;
}

/* Dark preview */
.theme-preview.dark            { background: #0a0a0a; }
.theme-preview.dark .tp-side   { background: #111111; }
.theme-preview.dark .tp-line   { background: rgba(212,212,212,0.22); }
.theme-preview.dark .tp-line.accent { background: #6b62f2; }
.theme-preview.dark .tp-block  { background: rgba(212,212,212,0.08); }

/* Light preview */
.theme-preview.light            { background: #fafafa; }
.theme-preview.light .tp-side   { background: #ffffff; }
.theme-preview.light .tp-line   { background: rgba(0,0,0,0.16); }
.theme-preview.light .tp-line.accent { background: #6b62f2; }
.theme-preview.light .tp-block  { background: rgba(0,0,0,0.05); }

/* System preview — split */
.theme-preview.system { background: linear-gradient(105deg, #0a0a0a 0 50%, #fafafa 50% 100%); }
.theme-preview.system .tp-side { background: rgba(255,255,255,0.05); }
.theme-preview.system .tp-line { background: rgba(128,128,128,0.4); }
.theme-preview.system .tp-line.accent { background: #6b62f2; }
.theme-preview.system .tp-block { background: rgba(128,128,128,0.15); }

.theme-option-name {
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.theme-option-desc {
  font-size: 11px;
  color: var(--text-tertiary);
}

/* ══════════════════════════════════════════
   ACCENT SWATCHES (decorative / locked)
   ══════════════════════════════════════════ */

.swatch-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  flex-wrap: wrap;
}

.swatch {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-primary);
  cursor: pointer;
  position: relative;
  transition: transform var(--transition-fast);
}

.swatch:hover { transform: scale(1.1); }

.swatch.is-active {
  box-shadow: 0 0 0 2px var(--bg-card), 0 0 0 4px var(--accent-primary);
}

/* ══════════════════════════════════════════
   STORAGE / QUOTA VISUAL
   ══════════════════════════════════════════ */

.quota-panel {
  padding: var(--spacing-24);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
}

.quota-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-16);
  flex-wrap: wrap;
}

.quota-used {
  font-family: var(--font-dm-sans);
  font-size: 30px;
  font-weight: var(--font-weight-medium);
  letter-spacing: -0.03em;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.quota-used .of {
  font-size: 15px;
  color: var(--text-tertiary);
  letter-spacing: 0;
}

.quota-bar {
  height: 12px;
  border-radius: var(--radius-pill);
  background: var(--bg-progress-track);
  overflow: hidden;
  display: flex;
  gap: 2px;
}

.quota-seg {
  height: 100%;
  transition: width var(--transition-slow) cubic-bezier(0.22, 1, 0.36, 1);
  position: relative;
}

.quota-seg:first-child { border-radius: var(--radius-pill) 0 0 var(--radius-pill); }
.quota-seg:last-of-type { border-radius: 0 var(--radius-pill) var(--radius-pill) 0; }

.quota-legend {
  display: flex;
  align-items: center;
  gap: var(--spacing-20);
  flex-wrap: wrap;
}

.ql-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  font-size: var(--text-caption);
}

.ql-swatch {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex-shrink: 0;
}

.ql-name { color: var(--text-tertiary); }

.ql-val {
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
  font-variant-numeric: tabular-nums;
}

/* ══════════════════════════════════════════
   API KEYS / TOKEN LIST
   ══════════════════════════════════════════ */

.token-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-14);
  padding: var(--spacing-14) var(--spacing-24);
  border-bottom: 1px solid var(--border-secondary);
  transition: background-color var(--transition-fast);
}

.token-row:last-child { border-bottom: none; }
.token-row:hover { background: var(--bg-hover); }

.token-ico {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  background: var(--bg-badge);
  color: var(--accent-primary);
  border: 1px solid rgba(107, 98, 242, 0.2);
}

.token-ico svg { width: 15px; height: 15px; }

.token-body { flex: 1; min-width: 0; }

.token-name {
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
}

.token-key {
  font-family: 'SF Mono', monospace;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
}

.token-key .masked { letter-spacing: 0.08em; }

.token-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
  text-align: right;
  flex-shrink: 0;
}

/* ══════════════════════════════════════════
   DANGER ZONE
   ══════════════════════════════════════════ */

.danger-zone {
  border-radius: var(--radius-cards);
  border: 1px solid var(--color-error-border);
  background: var(--color-error-bg);
  overflow: hidden;
}

.danger-zone .sg-head {
  border-bottom-color: var(--color-error-border);
}

.danger-zone .sg-head::before {
  background: linear-gradient(
    90deg,
    transparent,
    transparent 40%,
    var(--color-error) 50%,
    transparent 60%,
    transparent
  );
  opacity: 0.7;
}

.danger-zone .sg-title { color: var(--color-error); }

.danger-zone .setting-row {
  border-bottom-color: var(--color-error-border);
}

.danger-zone .setting-row:hover {
  background: rgba(239, 68, 68, 0.06);
}

/* ══════════════════════════════════════════
   INTEGRATION / CONNECTION CARDS
   ══════════════════════════════════════════ */

.integration-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--spacing-12);
  padding: var(--spacing-20) var(--spacing-24);
}

.integration-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  padding: var(--spacing-14);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-card);
  background: var(--bg-tag);
  transition: all var(--transition-fast);
}

.integration-card:hover { border-color: var(--border-hover); }

.integration-ico {
  width: 36px;
  height: 36px;
  min-width: 36px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
}

.integration-ico svg { width: 17px; height: 17px; }

.integration-body { flex: 1; min-width: 0; }

.integration-name {
  font-size: var(--text-caption);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.integration-status {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: var(--spacing-6);
}

.integration-status .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--text-tertiary);
}

.integration-status.connected { color: var(--color-success); }
.integration-status.connected .dot {
  background: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
}

/* ══════════════════════════════════════════
   SAVE BAR (sticky)
   ══════════════════════════════════════════ */

.save-bar {
  position: sticky;
  bottom: var(--spacing-16);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-16);
  padding: var(--spacing-12) var(--spacing-12) var(--spacing-12) var(--spacing-20);
  border-radius: var(--radius-pill);
  background: var(--bg-dropdown);
  border: 1px solid var(--border-primary);
  box-shadow: var(--shadow-dropdown);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  z-index: 30;
  opacity: 0;
  transform: translateY(16px);
  visibility: hidden;
  transition: all var(--transition-base);
}

.save-bar.is-visible {
  opacity: 1;
  transform: translateY(0);
  visibility: visible;
}

.save-bar-text {
  font-size: var(--text-caption);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
}

.save-bar-text .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-warning);
  box-shadow: 0 0 8px var(--color-warning);
  animation: pulse 1.8s ease-in-out infinite;
}

.save-bar-actions { display: flex; gap: var(--spacing-8); }

/* ══════════════════════════════════════════
   RESPONSIVE
   ══════════════════════════════════════════ */

@media (max-width: 1024px) {
  .settings-layout { grid-template-columns: 190px minmax(0, 1fr); gap: var(--spacing-24); }
}

@media (max-width: 860px) {
  .settings-layout { grid-template-columns: 1fr; }

  .settings-nav {
    position: static;
    flex-direction: row;
    overflow-x: auto;
    gap: var(--spacing-4);
    padding-bottom: var(--spacing-8);
    border-bottom: 1px solid var(--border-primary);
    scrollbar-width: none;
  }

  .settings-nav::-webkit-scrollbar { display: none; }
  .settings-nav-label { display: none; }

  .settings-nav-item {
    white-space: nowrap;
    border-radius: var(--radius-pill);
    padding: var(--spacing-8) var(--spacing-14);
  }

  .settings-nav-item.is-active::before { display: none; }

  .setting-row {
    flex-direction: column;
    align-items: stretch;
    gap: var(--spacing-12);
    padding: var(--spacing-16);
  }

  .setting-control { width: 100%; }
  .setting-control .input,
  .setting-control .select { width: 100%; min-width: 0; }

  .sg-head, .sg-footer, .theme-picker,
  .integration-grid, .quota-panel, .token-row {
    padding-left: var(--spacing-16);
    padding-right: var(--spacing-16);
  }

  .save-bar {
    border-radius: var(--radius-lg);
    flex-wrap: wrap;
    padding: var(--spacing-12);
  }
}

@media (max-width: 560px) {
  .token-meta { display: none; }
  .quota-used { font-size: 24px; }
  .save-bar-actions { width: 100%; }
  .save-bar-actions .btn { flex: 1; justify-content: center; }
}
```

---

<a id="file-7"></a>

### 📄 File 7/9: `themes.css`

| Property | Value |
|----------|-------|
| **Path** | `themes.css` |
| **Language** | CSS |
| **Size** | 10 KB |
| **Lines** | 384 |

```css
/* ============================================
   THEMES.CSS — Light & Dark Theme System
   Admin Files Manager — Dimension Style
   ============================================ */

/* ── Dark Theme (Default) ── */
[data-theme="dark"] {
  --bg-primary: #0a0a0a;
  --bg-secondary: #161616;
  --bg-tertiary: rgba(212, 212, 212, 0.06);
  --bg-elevated: #161616;
  --bg-frosted: rgba(212, 212, 212, 0.08);
  --bg-hover: rgba(212, 212, 212, 0.1);
  --bg-active: rgba(212, 212, 212, 0.14);
  --bg-input: rgba(212, 212, 212, 0.06);
  --bg-sidebar: #111111;
  --bg-topbar: rgba(22, 22, 22, 0.8);
  --bg-card: rgba(212, 212, 212, 0.06);
  --bg-card-hover: rgba(212, 212, 212, 0.1);
  --bg-dropdown: #1a1a1a;
  --bg-modal: #161616;
  --bg-modal-backdrop: rgba(0, 0, 0, 0.6);
  --bg-tooltip: #2a2a2a;
  --bg-tag: rgba(212, 212, 212, 0.08);
  --bg-badge: rgba(107, 98, 242, 0.15);
  --bg-progress-track: rgba(212, 212, 212, 0.08);

  --text-primary: #ededed;
  --text-secondary: #c2c2c2;
  --text-tertiary: #686868;
  --text-muted: #b2b2b2;
  --text-inverse: #0a0a0a;
  --text-on-accent: #ffffff;
  --text-link: #8b83f7;
  --text-link-hover: #a9a3fa;

  --border-primary: rgba(229, 229, 229, 0.12);
  --border-secondary: rgba(229, 229, 229, 0.06);
  --border-hover: rgba(229, 229, 229, 0.2);
  --border-focus: rgba(107, 98, 242, 0.5);
  --border-active: rgba(107, 98, 242, 0.7);
  --border-card: rgba(229, 229, 229, 0.08);

  --accent-primary: #6b62f2;
  --accent-hover: #7d75f5;
  --accent-active: #5a51e0;
  --accent-glow: rgba(107, 98, 242, 0.15);
  --accent-subtle: rgba(107, 98, 242, 0.1);

  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.3),
                 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
  --shadow-dropdown: 0 8px 30px rgba(0, 0, 0, 0.4),
                     0 0 0 1px rgba(255, 255, 255, 0.06) inset;
  --shadow-modal: 0 24px 80px rgba(0, 0, 0, 0.5),
                  0 0 0 1px rgba(255, 255, 255, 0.06) inset;

  --scrollbar-thumb: rgba(212, 212, 212, 0.15);
  --scrollbar-thumb-hover: rgba(212, 212, 212, 0.25);

  --icon-primary: #ededed;
  --icon-secondary: #b2b2b2;
  --icon-tertiary: #686868;

  /* Status */
  --color-success: #22c55e;
  --color-success-bg: rgba(34, 197, 94, 0.12);
  --color-success-border: rgba(34, 197, 94, 0.2);
  --color-warning: #f59e0b;
  --color-warning-bg: rgba(245, 158, 11, 0.12);
  --color-warning-border: rgba(245, 158, 11, 0.2);
  --color-error: #ef4444;
  --color-error-bg: rgba(239, 68, 68, 0.12);
  --color-error-border: rgba(239, 68, 68, 0.2);
  --color-info: #3b82f6;
  --color-info-bg: rgba(59, 130, 246, 0.12);
  --color-info-border: rgba(59, 130, 246, 0.2);

  /* Chart colors */
  --chart-1: #6b62f2;
  --chart-2: #3b82f6;
  --chart-3: #22c55e;
  --chart-4: #f59e0b;
  --chart-5: #ef4444;

  /* Toggle */
  --toggle-bg: rgba(212, 212, 212, 0.15);
  --toggle-bg-active: var(--accent-primary);
  --toggle-knob: #ffffff;

  /* Dusk violet wash for decorative elements */
  --gradient-sidebar-accent: linear-gradient(
    180deg,
    rgba(107, 98, 242, 0.08) 0%,
    transparent 60%
  );
  --gradient-card-shine: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.03) 0%,
    transparent 50%
  );
}

/* ── Light Theme ── */
[data-theme="light"] {
  --bg-primary: #fafafa;
  --bg-secondary: #ffffff;
  --bg-tertiary: rgba(0, 0, 0, 0.03);
  --bg-elevated: #ffffff;
  --bg-frosted: rgba(255, 255, 255, 0.7);
  --bg-hover: rgba(0, 0, 0, 0.04);
  --bg-active: rgba(0, 0, 0, 0.07);
  --bg-input: rgba(0, 0, 0, 0.03);
  --bg-sidebar: #ffffff;
  --bg-topbar: rgba(255, 255, 255, 0.85);
  --bg-card: #ffffff;
  --bg-card-hover: rgba(0, 0, 0, 0.02);
  --bg-dropdown: #ffffff;
  --bg-modal: #ffffff;
  --bg-modal-backdrop: rgba(0, 0, 0, 0.3);
  --bg-tooltip: #1a1a1a;
  --bg-tag: rgba(0, 0, 0, 0.05);
  --bg-badge: rgba(107, 98, 242, 0.1);
  --bg-progress-track: rgba(0, 0, 0, 0.06);

  --text-primary: #161616;
  --text-secondary: #525252;
  --text-tertiary: #a3a3a3;
  --text-muted: #737373;
  --text-inverse: #ffffff;
  --text-on-accent: #ffffff;
  --text-link: #6b62f2;
  --text-link-hover: #5a51e0;

  --border-primary: rgba(0, 0, 0, 0.1);
  --border-secondary: rgba(0, 0, 0, 0.06);
  --border-hover: rgba(0, 0, 0, 0.15);
  --border-focus: rgba(107, 98, 242, 0.4);
  --border-active: rgba(107, 98, 242, 0.6);
  --border-card: rgba(0, 0, 0, 0.08);

  --accent-primary: #6b62f2;
  --accent-hover: #5a51e0;
  --accent-active: #4c43cc;
  --accent-glow: rgba(107, 98, 242, 0.12);
  --accent-subtle: rgba(107, 98, 242, 0.06);

  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.06),
                 0 0 0 1px rgba(0, 0, 0, 0.04);
  --shadow-dropdown: 0 8px 30px rgba(0, 0, 0, 0.12),
                     0 0 0 1px rgba(0, 0, 0, 0.06);
  --shadow-modal: 0 24px 80px rgba(0, 0, 0, 0.15),
                  0 0 0 1px rgba(0, 0, 0, 0.06);

  --scrollbar-thumb: rgba(0, 0, 0, 0.15);
  --scrollbar-thumb-hover: rgba(0, 0, 0, 0.25);

  --icon-primary: #161616;
  --icon-secondary: #525252;
  --icon-tertiary: #a3a3a3;

  /* Status */
  --color-success: #16a34a;
  --color-success-bg: rgba(22, 163, 74, 0.08);
  --color-success-border: rgba(22, 163, 74, 0.2);
  --color-warning: #d97706;
  --color-warning-bg: rgba(217, 119, 6, 0.08);
  --color-warning-border: rgba(217, 119, 6, 0.2);
  --color-error: #dc2626;
  --color-error-bg: rgba(220, 38, 38, 0.08);
  --color-error-border: rgba(220, 38, 38, 0.2);
  --color-info: #2563eb;
  --color-info-bg: rgba(37, 99, 235, 0.08);
  --color-info-border: rgba(37, 99, 235, 0.2);

  /* Chart colors */
  --chart-1: #6b62f2;
  --chart-2: #2563eb;
  --chart-3: #16a34a;
  --chart-4: #d97706;
  --chart-5: #dc2626;

  /* Toggle */
  --toggle-bg: rgba(0, 0, 0, 0.15);
  --toggle-bg-active: var(--accent-primary);
  --toggle-knob: #ffffff;

  /* Decorative gradients for light mode */
  --gradient-sidebar-accent: linear-gradient(
    180deg,
    rgba(107, 98, 242, 0.05) 0%,
    transparent 60%
  );
  --gradient-card-shine: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.8) 0%,
    transparent 50%
  );
}

/* ── Theme Transition Smoothing ── */
[data-theme="dark"],
[data-theme="light"] {
  transition:
    background-color var(--transition-slow),
    color var(--transition-slow),
    border-color var(--transition-slow),
    box-shadow var(--transition-slow);
}

/* Apply transitions to key elements during theme switch */
body,
.sidebar,
.topbar,
.card,
.btn,
.input,
.dropdown,
.modal,
.badge,
.tag,
table,
th,
td,
hr {
  transition:
    background-color var(--transition-slow),
    color var(--transition-slow),
    border-color var(--transition-slow),
    box-shadow var(--transition-slow);
}

/* ── Theme Toggle Button Visual States ── */
.theme-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--toggle-bg);
  border: 1px solid var(--border-primary);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  transition: background-color var(--transition-base),
              border-color var(--transition-base);
}

.theme-toggle::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--toggle-knob);
  transition: transform var(--transition-base);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

[data-theme="dark"] .theme-toggle::after {
  transform: translateX(20px);
}

[data-theme="light"] .theme-toggle::after {
  transform: translateX(0);
}

.theme-toggle:hover {
  border-color: var(--border-hover);
}

.theme-toggle .icon-sun,
.theme-toggle .icon-moon {
  position: absolute;
  width: 12px;
  height: 12px;
  transition: opacity var(--transition-base);
}

.theme-toggle .icon-sun {
  left: 6px;
  color: var(--color-warning);
}

.theme-toggle .icon-moon {
  right: 6px;
  color: var(--accent-primary);
}

[data-theme="dark"] .theme-toggle .icon-sun {
  opacity: 0.3;
}

[data-theme="dark"] .theme-toggle .icon-moon {
  opacity: 1;
}

[data-theme="light"] .theme-toggle .icon-sun {
  opacity: 1;
}

[data-theme="light"] .theme-toggle .icon-moon {
  opacity: 0.3;
}

/* ── Light Theme Specific Overrides ── */
[data-theme="light"] .violet-glow {
  opacity: 0.5;
}

[data-theme="light"] .frosted-panel {
  background: var(--bg-frosted);
  border: 1px solid var(--border-primary);
  box-shadow: var(--shadow-card);
}

[data-theme="dark"] .frosted-panel {
  background: var(--bg-frosted);
  border: 1px solid var(--border-primary);
  box-shadow: var(--shadow-subtle);
}

/* ── Logo Inversion for Light Theme ── */
[data-theme="light"] .logo-mark {
  filter: invert(1);
}

/* ── Gradient Adjustments per Theme ── */
[data-theme="light"] .gradient-accent-line {
  background: linear-gradient(
    90deg,
    transparent,
    transparent 35%,
    rgba(107, 98, 242, 0.3) 50%,
    transparent 65%,
    transparent
  );
}

[data-theme="dark"] .gradient-accent-line {
  background: var(--gradient-dusk-violet);
}

/* ── Skeleton Loading per Theme ── */
[data-theme="dark"] .skeleton {
  background: linear-gradient(
    90deg,
    rgba(212, 212, 212, 0.06) 0%,
    rgba(212, 212, 212, 0.12) 50%,
    rgba(212, 212, 212, 0.06) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

[data-theme="light"] .skeleton {
  background: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0.04) 0%,
    rgba(0, 0, 0, 0.08) 50%,
    rgba(0, 0, 0, 0.04) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

/* ── Print Media — Force Light ── */
@media print {
  :root {
    --bg-primary: #ffffff !important;
    --bg-secondary: #ffffff !important;
    --text-primary: #000000 !important;
    --text-secondary: #333333 !important;
    --border-primary: #cccccc !important;
  }

  .sidebar,
  .topbar,
  .theme-toggle,
  .btn-icon {
    display: none !important;
  }
}
```

---

<a id="file-8"></a>

### 📄 File 8/9: `tokens.css`

| Property | Value |
|----------|-------|
| **Path** | `tokens.css` |
| **Language** | CSS |
| **Size** | 5.9 KB |
| **Lines** | 200 |

```css
/* ============================================
   TOKENS.CSS — Design Tokens & CSS Custom Properties
   Admin Files Manager — Dimension Style
   ============================================ */

@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400;1,9..40,500&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

:root {
  /* ── Color Tokens ── */
  --color-void-canvas: #0a0a0a;
  --color-graphite: #161616;
  --color-frosted-glass: #d4d4d4;
  --color-ink-black: #000000;
  --color-snow-white: #ffffff;
  --color-bone: #ededed;
  --color-ash: #c2c2c2;
  --color-slate: #686868;
  --color-smoke: #b2b2b2;
  --color-hairline: #e5e5e5;
  --color-dusk-violet: #6b62f2;
  --color-dusk-violet-rgb: 107, 98, 242;

  /* ── Gradient Tokens ── */
  --gradient-dusk-violet: linear-gradient(
    90deg,
    rgba(0, 0, 0, 0),
    rgba(0, 0, 0, 0) 40%,
    rgba(107, 98, 242, 0.565) 50%,
    rgba(0, 0, 0, 0) 60%,
    rgba(0, 0, 0, 0)
  );
  --gradient-hero-horizon: linear-gradient(
    135deg,
    #d97706 0%,
    #ea580c 25%,
    #7c3aed 50%,
    #2563eb 75%,
    #1d4ed8 100%
  );
  --gradient-radial-spotlight: radial-gradient(
    circle at 50% 50%,
    rgba(107, 98, 242, 0.3) 0%,
    rgba(107, 98, 242, 0.05) 50%,
    transparent 70%
  );

  /* ── Typography — Font Families ── */
  --font-dm-sans: 'DM Sans', 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-geist: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-system-ui: system-ui, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* ── Typography — Scale ── */
  --text-caption: 13px;
  --leading-caption: 1.5;
  --tracking-caption: 0.33px;

  --text-body-sm: 14px;
  --leading-body-sm: 1.5;

  --text-body: 16px;
  --leading-body: 1.5;

  --text-subheading: 18px;
  --leading-subheading: 1.5;

  --text-heading-sm: 24px;
  --leading-heading-sm: 1.33;

  --text-heading: 36px;
  --leading-heading: 1.11;

  --text-heading-lg: 48px;
  --leading-heading-lg: 1;

  --text-display: 72px;
  --leading-display: 1;
  --tracking-display: -2.52px;

  /* ── Typography — Weights ── */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* ── Spacing Scale ── */
  --spacing-2: 2px;
  --spacing-4: 4px;
  --spacing-6: 6px;
  --spacing-8: 8px;
  --spacing-10: 10px;
  --spacing-12: 12px;
  --spacing-14: 14px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-22: 22px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-48: 48px;
  --spacing-56: 56px;
  --spacing-64: 64px;
  --spacing-80: 80px;

  /* ── Border Radius ── */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-ui: 10px;
  --radius-lg: 16px;
  --radius-2xl: 19px;
  --radius-cards: 24px;
  --radius-largecards: 40px;
  --radius-panels: 42px;
  --radius-pill: 9999px;
  --radius-icons: 4px;

  /* ── Shadows ── */
  --shadow-subtle: rgba(255, 255, 255, 0.1) 0px 0px 0px 1px inset;
  --shadow-float: rgba(255, 255, 255, 0.02) 0px 3px 4.5px,
                  rgba(0, 0, 0, 0.04) 0px 10px 8px,
                  rgba(0, 0, 0, 0.1) 0px 4px 3px;
  --shadow-glow: 0 0 40px rgba(107, 98, 242, 0.15);

  /* ── Layout ── */
  --page-max-width: 1200px;
  --sidebar-width: 260px;
  --sidebar-collapsed-width: 72px;
  --topbar-height: 64px;
  --section-gap: 64px;
  --card-padding: 28px;
  --element-gap: 16px;

  /* ── Transitions ── */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 250ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-slow: 400ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-sidebar: 300ms cubic-bezier(0.22, 1, 0.36, 1);

  /* ── Z-Index Scale ── */
  --z-base: 1;
  --z-sidebar: 100;
  --z-topbar: 200;
  --z-dropdown: 300;
  --z-modal-backdrop: 400;
  --z-modal: 500;
  --z-toast: 600;
  --z-tooltip: 700;

  /* ── Semantic Tokens (Dark Theme Default) ── */
  --bg-primary: var(--color-void-canvas);
  --bg-secondary: var(--color-graphite);
  --bg-tertiary: rgba(212, 212, 212, 0.06);
  --bg-elevated: var(--color-graphite);
  --bg-frosted: rgba(212, 212, 212, 0.08);
  --bg-hover: rgba(212, 212, 212, 0.1);
  --bg-active: rgba(212, 212, 212, 0.14);
  --bg-input: rgba(212, 212, 212, 0.06);

  --text-primary: var(--color-bone);
  --text-secondary: var(--color-ash);
  --text-tertiary: var(--color-slate);
  --text-muted: var(--color-smoke);
  --text-inverse: var(--color-void-canvas);

  --border-primary: rgba(229, 229, 229, 0.12);
  --border-secondary: rgba(229, 229, 229, 0.08);
  --border-hover: rgba(229, 229, 229, 0.2);
  --border-focus: rgba(107, 98, 242, 0.5);

  --accent-primary: var(--color-dusk-violet);
  --accent-glow: rgba(107, 98, 242, 0.15);
  --accent-subtle: rgba(107, 98, 242, 0.1);

  /* ── Status Colors ── */
  --color-success: #22c55e;
  --color-success-bg: rgba(34, 197, 94, 0.1);
  --color-warning: #f59e0b;
  --color-warning-bg: rgba(245, 158, 11, 0.1);
  --color-error: #ef4444;
  --color-error-bg: rgba(239, 68, 68, 0.1);
  --color-info: #3b82f6;
  --color-info-bg: rgba(59, 130, 246, 0.1);

  /* ── File Type Colors ── */
  --file-image: #f472b6;
  --file-video: #a78bfa;
  --file-audio: #34d399;
  --file-document: #60a5fa;
  --file-archive: #fbbf24;
  --file-code: #fb923c;
  --file-other: var(--color-slate);

  /* ── Scrollbar ── */
  --scrollbar-width: 6px;
  --scrollbar-track: transparent;
  --scrollbar-thumb: rgba(212, 212, 212, 0.15);
  --scrollbar-thumb-hover: rgba(212, 212, 212, 0.25);
}
```

---

<a id="file-9"></a>

### 📄 File 9/9: `uploads.css`

| Property | Value |
|----------|-------|
| **Path** | `uploads.css` |
| **Language** | CSS |
| **Size** | 18.8 KB |
| **Lines** | 764 |

```css
/* ============================================
   UPLOADS.CSS — Upload Manager Page Specific
   Admin Files Manager — Dimension Style
   ============================================ */

/* ══════════════════════════════════════════
   DROPZONE
   ══════════════════════════════════════════ */

.dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-16);
  min-height: 280px;
  padding: var(--spacing-48) var(--spacing-32);
  border-radius: var(--radius-largecards);
  border: 1.5px dashed var(--border-hover);
  background: var(--bg-card);
  text-align: center;
  cursor: pointer;
  overflow: hidden;
  isolation: isolate;
  transition: border-color var(--transition-base),
              background-color var(--transition-base),
              transform var(--transition-base);
}

[data-theme="dark"] .dropzone {
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

/* Violet radial glow behind the dropzone */
.dropzone::before {
  content: '';
  position: absolute;
  top: -30%;
  left: 50%;
  transform: translateX(-50%);
  width: 520px;
  height: 320px;
  background: var(--gradient-radial-spotlight);
  filter: blur(40px);
  opacity: 0.7;
  z-index: -1;
  pointer-events: none;
  transition: opacity var(--transition-slow);
}

.dropzone:hover {
  border-color: var(--accent-primary);
  background: var(--bg-card-hover);
}

.dropzone:hover::before { opacity: 1; }

.dropzone.is-dragover {
  border-color: var(--accent-primary);
  border-style: solid;
  background: var(--accent-subtle);
  transform: scale(1.005);
}

.dropzone.is-dragover .dz-icon {
  transform: translateY(-6px) scale(1.06);
  border-color: rgba(107, 98, 242, 0.5);
  color: var(--accent-primary);
}

/* Animated top hairline */
.dropzone::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: var(--gradient-dusk-violet);
  background-size: 200% 100%;
  animation: shimmer 4s linear infinite;
}

.dz-icon {
  width: 68px;
  height: 68px;
  border-radius: var(--radius-lg);
  display: grid;
  place-items: center;
  background: var(--bg-tag);
  border: 1px solid var(--border-primary);
  color: var(--text-secondary);
  transition: all var(--transition-base);
}

.dz-icon svg { width: 28px; height: 28px; }

.dz-title {
  font-family: var(--font-dm-sans);
  font-size: 26px;
  font-weight: var(--font-weight-medium);
  letter-spacing: -0.03em;
  color: var(--text-primary);
  line-height: 1.15;
}

.dz-title .accent { color: var(--accent-primary); }

.dz-desc {
  font-size: var(--text-body-sm);
  color: var(--text-tertiary);
  max-width: 46ch;
  line-height: 1.55;
}

.dz-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
  flex-wrap: wrap;
  justify-content: center;
  margin-top: var(--spacing-4);
}

.dz-specs {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  flex-wrap: wrap;
  justify-content: center;
  margin-top: var(--spacing-8);
}

.spec-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-6);
  padding: var(--spacing-6) var(--spacing-10);
  border-radius: var(--radius-ui);
  border: 1px solid var(--border-primary);
  font-size: 11px;
  color: var(--text-muted);
  background: transparent;
}

.spec-pill svg { width: 12px; height: 12px; opacity: 0.8; }

.dz-input { display: none; }

/* ══════════════════════════════════════════
   UPLOAD DESTINATION STRIP
   ══════════════════════════════════════════ */

.dest-strip {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  padding: var(--spacing-12) var(--spacing-16);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  margin-top: var(--spacing-16);
  flex-wrap: wrap;
}

.dest-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  font-size: var(--text-caption);
  color: var(--text-tertiary);
  white-space: nowrap;
}

.dest-label svg { width: 14px; height: 14px; }

.dest-path {
  display: flex;
  align-items: center;
  gap: var(--spacing-6);
  padding: var(--spacing-6) var(--spacing-12);
  border-radius: var(--radius-pill);
  background: var(--bg-tag);
  border: 1px solid var(--border-secondary);
  font-size: var(--text-caption);
  color: var(--text-primary);
  font-family: 'SF Mono', monospace;
}

.dest-path svg { width: 13px; height: 13px; color: #f59e0b; }

.dest-options {
  display: flex;
  align-items: center;
  gap: var(--spacing-16);
  margin-left: auto;
  flex-wrap: wrap;
}

.dest-opt {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  font-size: var(--text-caption);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

/* ══════════════════════════════════════════
   UPLOAD QUEUE
   ══════════════════════════════════════════ */

.queue-panel {
  border-radius: var(--radius-cards);
  border: 1px solid var(--border-card);
  background: var(--bg-card);
  overflow: hidden;
}

[data-theme="dark"] .queue-panel {
  -webkit-backdrop-filter: blur(6px);
  backdrop-filter: blur(6px);
}

.queue-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-16);
  padding: var(--spacing-16) var(--spacing-20);
  border-bottom: 1px solid var(--border-secondary);
  flex-wrap: wrap;
}

.queue-title-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
}

.queue-title {
  font-family: var(--font-geist);
  font-size: var(--text-body);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.queue-stats {
  display: flex;
  align-items: center;
  gap: var(--spacing-16);
  flex-wrap: wrap;
}

.qstat {
  display: flex;
  align-items: center;
  gap: var(--spacing-6);
  font-size: var(--text-caption);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.qstat .val {
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
}

.qstat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.qstat-dot.active   { background: var(--accent-primary); box-shadow: 0 0 6px var(--accent-primary); }
.qstat-dot.done     { background: var(--color-success); }
.qstat-dot.failed   { background: var(--color-error); }
.qstat-dot.queued   { background: var(--text-tertiary); }

/* ── Global progress bar ── */
.queue-global {
  padding: var(--spacing-14) var(--spacing-20);
  border-bottom: 1px solid var(--border-secondary);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
  background: var(--bg-tertiary);
}

.qg-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-12);
  font-size: var(--text-caption);
}

.qg-label {
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
}

.qg-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

.qg-pct {
  color: var(--text-primary);
  font-weight: var(--font-weight-medium);
}

/* ── Queue items ── */
.queue-list {
  display: flex;
  flex-direction: column;
  max-height: 560px;
  overflow-y: auto;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-14);
  padding: var(--spacing-14) var(--spacing-20);
  border-bottom: 1px solid var(--border-secondary);
  transition: background-color var(--transition-fast);
  position: relative;
  animation: fadeInUp 0.3s ease-out backwards;
}

.queue-item:last-child { border-bottom: none; }
.queue-item:hover { background: var(--bg-hover); }

/* Left status accent stripe */
.queue-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: transparent;
  transition: background-color var(--transition-base);
}

.queue-item.is-uploading::before { background: var(--accent-primary); }
.queue-item.is-done::before      { background: var(--color-success); }
.queue-item.is-failed::before    { background: var(--color-error); }
.queue-item.is-paused::before    { background: var(--color-warning); }

.qi-icon {
  width: 38px;
  height: 38px;
  min-width: 38px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  border: 1px solid var(--border-secondary);
  flex-shrink: 0;
  position: relative;
}

.qi-icon svg { width: 17px; height: 17px; }

.qi-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--spacing-6); }

.qi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-12);
}

.qi-name {
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.qi-pct {
  font-size: var(--text-caption);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex-shrink: 0;
}

.qi-bar {
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--bg-progress-track);
  overflow: hidden;
}

.qi-fill {
  height: 100%;
  border-radius: var(--radius-pill);
  background: var(--accent-primary);
  width: 0%;
  transition: width 300ms linear, background-color var(--transition-base);
  position: relative;
  overflow: hidden;
}

.qi-fill::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent);
  background-size: 200% 100%;
  animation: shimmer 1.2s linear infinite;
}

.queue-item.is-done .qi-fill   { background: var(--color-success); }
.queue-item.is-done .qi-fill::after,
.queue-item.is-failed .qi-fill::after,
.queue-item.is-paused .qi-fill::after { display: none; }

.queue-item.is-failed .qi-fill { background: var(--color-error); }
.queue-item.is-paused .qi-fill { background: var(--color-warning); }

.qi-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  font-size: 11px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
  flex-wrap: wrap;
}

.qi-meta .sep {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}

.qi-meta .err { color: var(--color-error); }

.qi-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

/* Status badge inside queue row */
.qi-status {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-4);
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 2px var(--spacing-8);
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.qi-status.uploading { background: var(--bg-badge); color: var(--accent-primary); }
.qi-status.done      { background: var(--color-success-bg); color: var(--color-success); }
.qi-status.failed    { background: var(--color-error-bg); color: var(--color-error); }
.qi-status.paused    { background: var(--color-warning-bg); color: var(--color-warning); }
.qi-status.queued    { background: var(--bg-tag); color: var(--text-tertiary); }

.queue-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-12);
  padding: var(--spacing-12) var(--spacing-20);
  border-top: 1px solid var(--border-secondary);
  background: var(--bg-tertiary);
  flex-wrap: wrap;
}

/* ══════════════════════════════════════════
   UPLOAD PRESETS / RULE CARDS
   ══════════════════════════════════════════ */

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--spacing-12);
}

.preset-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-10);
  padding: var(--spacing-16);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-card);
  background: var(--bg-tag);
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
}

.preset-card:hover {
  border-color: var(--border-hover);
  transform: translateY(-2px);
}

.preset-card.is-active {
  border-color: var(--border-active);
  background: var(--accent-subtle);
}

.preset-card.is-active::after {
  content: '';
  position: absolute;
  top: var(--spacing-12);
  right: var(--spacing-12);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 8px var(--accent-primary);
}

.preset-top {
  display: flex;
  align-items: center;
  gap: var(--spacing-10);
}

.preset-ico {
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.preset-ico svg { width: 15px; height: 15px; }

.preset-card.is-active .preset-ico { color: var(--accent-primary); }

.preset-name {
  font-size: var(--text-body-sm);
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
}

.preset-desc {
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1.5;
}

.preset-tags {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  flex-wrap: wrap;
  margin-top: var(--spacing-2);
}

.preset-tag {
  font-size: 10px;
  padding: 2px var(--spacing-6);
  border-radius: var(--radius-xs);
  background: var(--bg-elevated);
  border: 1px solid var(--border-secondary);
  color: var(--text-tertiary);
  font-family: 'SF Mono', monospace;
}

/* ══════════════════════════════════════════
   RECENT UPLOADS STRIP
   ══════════════════════════════════════════ */

.recent-strip {
  display: flex;
  gap: var(--spacing-12);
  overflow-x: auto;
  padding-bottom: var(--spacing-8);
  scrollbar-width: thin;
}

.recent-card {
  min-width: 168px;
  max-width: 168px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-10);
  padding: var(--spacing-12);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  flex-shrink: 0;
  transition: all var(--transition-fast);
  cursor: pointer;
}

.recent-card:hover {
  border-color: var(--border-hover);
  transform: translateY(-2px);
}

.recent-thumb {
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: var(--radius-md);
  background: var(--bg-tag);
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--border-secondary);
}

.recent-thumb .ftype-icon {
  width: 34px;
  height: 34px;
  border: none;
  background: transparent;
}

.recent-name {
  font-size: 12px;
  font-weight: var(--font-weight-medium);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-meta {
  font-size: 10px;
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* ══════════════════════════════════════════
   UPLOAD STATS ROW
   ══════════════════════════════════════════ */

.upload-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--spacing-12);
  margin-bottom: var(--spacing-24);
}

.metric-tile {
  padding: var(--spacing-16);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  display: flex;
  align-items: center;
  gap: var(--spacing-12);
  position: relative;
  overflow: hidden;
}

.metric-ico {
  width: 34px;
  height: 34px;
  min-width: 34px;
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  background: var(--bg-tag);
  border: 1px solid var(--border-secondary);
  color: var(--text-secondary);
}

.metric-ico svg { width: 16px; height: 16px; }

.metric-body { min-width: 0; }

.metric-value {
  font-size: 20px;
  font-weight: var(--font-weight-medium);
  letter-spacing: -0.02em;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.metric-value .unit {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-left: 2px;
}

.metric-label {
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.03em;
}

/* Live speed graph (mini) */
.speed-graph {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 26px;
  margin-left: auto;
  flex-shrink: 0;
}

.speed-bar {
  width: 3px;
  border-radius: 1.5px;
  background: rgba(107, 98, 242, 0.4);
  transition: height 400ms ease-out;
  min-height: 2px;
}

.speed-bar:last-child { background: var(--accent-primary); }

/* ══════════════════════════════════════════
   RESPONSIVE
   ══════════════════════════════════════════ */

@media (max-width: 860px) {
  .dropzone {
    min-height: 220px;
    padding: var(--spacing-32) var(--spacing-20);
    border-radius: var(--radius-cards);
  }
  .dz-title { font-size: 21px; }
  .dz-icon { width: 56px; height: 56px; }
  .dest-options { margin-left: 0; width: 100%; }
  .queue-item { padding: var(--spacing-12) var(--spacing-16); gap: var(--spacing-10); }
  .queue-head, .queue-global, .queue-footer {
    padding-left: var(--spacing-16);
    padding-right: var(--spacing-16);
  }
}

@media (max-width: 560px) {
  .dz-actions { flex-direction: column; width: 100%; }
  .dz-actions .btn { width: 100%; justify-content: center; }
  .qi-icon { display: none; }
  .queue-stats { gap: var(--spacing-10); }
  .qi-actions .btn-icon:not(.keep-mobile) { display: none; }
}
```

---

## ✅ End of Project Code

> Total files extracted: **9**
> Total lines of code: **5829**
> Generated by: **Project Code Extractor v2.1**


