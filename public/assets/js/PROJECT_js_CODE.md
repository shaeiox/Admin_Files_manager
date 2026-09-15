# 📦 Project: js

> **Auto-generated code extraction for AI review and editing**
> 
> Generated on: 2026-09-15 11:52:17
> Total files: 6
> Total lines of code: 3142

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
| JavaScript | 6 | 3142 | 137.5 KB |

---

## 🗂️ Project Structure

```
📦 js/
  ├── 📄 sidebar.js
  ├── 📄 theme.js
  ├── 📄 uploads.js
  ├── 📄 app.js
  ├── 📄 dashboard.js
  └── 📄 files.js
```

---

## 📑 Table of Contents

1. [`app.js`](#file-1)
2. [`dashboard.js`](#file-2)
3. [`files.js`](#file-3)
4. [`sidebar.js`](#file-4)
5. [`theme.js`](#file-5)
6. [`uploads.js`](#file-6)

---

## 📝 Source Code Files

---

<a id="file-1"></a>

### 📄 File 1/6: `app.js`

| Property | Value |
|----------|-------|
| **Path** | `app.js` |
| **Language** | JavaScript |
| **Size** | 39.1 KB |
| **Lines** | 829 |

```javascript
/* ============================================
   APP.JS — Shared Utilities, Icons, Toasts, Modals
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

/* ══════════════════════════════════════════
   ICON LIBRARY — Lucide-style 1.5px stroke SVGs
   ══════════════════════════════════════════ */

const Icons = {
  // Brand / layout
  layers:      '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  dashboard:   '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  panelLeft:   '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight:'<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp:   '<path d="m18 15-6-6-6 6"/>',
  chevronsUpDown: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  arrowRight:  '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowUp:     '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowDown:   '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  arrowUpRight:'<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  menu:        '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  x:           '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check:       '<path d="M20 6 9 17l-5-5"/>',
  plus:        '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus:       '<path d="M5 12h14"/>',
  moreVertical:'<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  moreHorizontal:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',

  // Files & folders
  folder:      '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderOpen:  '<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H22l-3.1 6.2A2 2 0 0 1 17.1 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>',
  folderPlus:  '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="M9 13h6"/>',
  file:        '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  fileText:    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  image:       '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  video:       '<path d="m16 13 5.22 3.03a.5.5 0 0 0 .78-.42V8.39a.5.5 0 0 0-.78-.42L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  music:       '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  archive:     '<rect x="2" y="4" width="20" height="5" rx="2"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  code:        '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  database:    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  hardDrive:   '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',

  // Actions
  upload:      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  uploadCloud: '<path d="M12 13v8"/><path d="M4 14.9A5 5 0 0 1 6.5 5.5a7 7 0 0 1 13.1 2.1A4.5 4.5 0 0 1 18 16.5"/><path d="m8 17 4-4 4 4"/>',
  download:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  trash:       '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  edit:        '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  copy:        '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  move:        '<path d="M5 9 2 12l3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/>',
  share:       '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  link:        '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  eye:         '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  refresh:     '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  pause:       '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play:        '<polygon points="6 3 20 12 6 21 6 3"/>',
  rotateCw:    '<path d="M21 12a9 9 0 1 1-3.1-6.8"/><path d="M21 3v6h-6"/>',
  save:        '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',

  // UI
  search:      '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  filter:      '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  sort:        '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/>',
  grid:        '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  list:        '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  settings:    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  sliders:     '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/>',
  bell:        '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  user:        '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users:       '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  logout:      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  sun:         '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon:        '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor:     '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  sparkle:     '<path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="M12 7.5 13.5 12 18 13.5 13.5 15 12 19.5 10.5 15 6 13.5 10.5 12Z"/>',
  zap:         '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  shield:      '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  lock:        '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  key:         '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  globe:       '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  clock:       '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  calendar:    '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  trending:    '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  trendingDown:'<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  activity:    '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  barChart:    '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
  pieChart:    '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  cpu:         '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  server:      '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  wifi:        '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/>',
  alert:       '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
  info:        '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  xCircle:     '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  star:        '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  bookmark:    '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  tag:         '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  inbox:       '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  history:     '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  externalLink:'<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  command:     '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  helpCircle:  '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  cloud:       '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  gauge:       '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  scan:        '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  package:     '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  mail:        '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
};

/**
 * Build an inline SVG icon string.
 * @param {string} name - key of Icons
 * @param {number} [size=24] - viewBox is always 24; size controls width/height attrs
 * @param {string} [cls=''] - extra class names
 */
function icon(name, size = 24, cls = '') {
  const path = Icons[name];
  if (!path) {
    console.warn(`[Icons] "${name}" not found`);
    return '';
  }
  return `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** Replace every <i data-icon="name"></i> placeholder in the DOM with real SVG */
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    const size = parseInt(el.getAttribute('data-icon-size') || '24', 10);
    if (Icons[name]) {
      el.outerHTML = icon(name, size, el.className);
    }
  });
}

/* ══════════════════════════════════════════
   DOM HELPERS
   ══════════════════════════════════════════ */

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else node.setAttribute(k, v);
  });
  if (html) node.innerHTML = html;
  return node;
}

function on(target, evt, sel, handler) {
  // Delegated event binding: on(document, 'click', '.btn', fn)
  if (typeof sel === 'function') {
    target.addEventListener(evt, sel);
    return;
  }
  target.addEventListener(evt, e => {
    const match = e.target.closest(sel);
    if (match && target.contains(match)) handler.call(match, e, match);
  });
}

/* ══════════════════════════════════════════
   FORMAT UTILITIES
   ══════════════════════════════════════════ */

const Format = {
  /** 1536 → "1.5 KB" */
  bytes(bytes, decimals = 1) {
    if (bytes === 0 || bytes == null) return '0 B';
    const k = 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
    const val = bytes / Math.pow(k, i);
    return `${val.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
  },

  /** Split value + unit for styled rendering */
  bytesParts(bytes, decimals = 1) {
    const str = Format.bytes(bytes, decimals);
    const [v, u] = str.split(' ');
    return { value: v, unit: u };
  },

  /** 1234567 → "1.2M" */
  compact(n) {
    if (n == null) return '0';
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'K';
    if (n < 1e9) return (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M';
    return (n / 1e9).toFixed(1) + 'B';
  },

  /** 1234567 → "1,234,567" */
  number(n) {
    return (n ?? 0).toLocaleString('en-US');
  },

  /** bytes/sec → "4.2 MB/s" */
  speed(bps) {
    return Format.bytes(bps, 1) + '/s';
  },

  /** seconds → "2m 14s" */
  duration(sec) {
    if (sec == null || !isFinite(sec) || sec < 0) return '—';
    if (sec < 60) return `${Math.round(sec)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    if (m < 60) return `${m}m ${s}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  },

  /** Date → "Mar 14, 2025" */
  date(d) {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  /** Date → "Mar 14, 14:32" */
  dateTime(d) {
    const date = d instanceof Date ? d : new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
           ', ' +
           date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  },

  /** Date → "3 hours ago" */
  relative(d) {
    const date = d instanceof Date ? d : new Date(d);
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 45) return 'just now';
    if (diff < 90) return '1 min ago';
    if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
    if (diff < 7200) return '1 hour ago';
    if (diff < 86400) return `${Math.round(diff / 3600)} hours ago`;
    if (diff < 172800) return 'yesterday';
    if (diff < 604800) return `${Math.round(diff / 86400)} days ago`;
    if (diff < 2592000) return `${Math.round(diff / 604800)} wk ago`;
    return Format.date(date);
  },

  /** 0.8734 → "87%" */
  percent(ratio, decimals = 0) {
    return `${(ratio * 100).toFixed(decimals)}%`;
  },

  /** "01", "02", ... */
  pad(n, len = 2) {
    return String(n).padStart(len, '0');
  },

  /** Truncate middle: "verylongfilename.zip" → "verylo….zip" */
  middle(str, max = 28) {
    if (!str || str.length <= max) return str;
    const ext = str.includes('.') ? '.' + str.split('.').pop() : '';
    const head = str.slice(0, max - ext.length - 2);
    return `${head}…${ext}`;
  },
};

/* ══════════════════════════════════════════
   FILE TYPE RESOLUTION
   ══════════════════════════════════════════ */

const FileTypes = {
  image:    { exts: ['jpg','jpeg','png','gif','webp','svg','bmp','ico','avif','heic'], icon: 'image',    label: 'Image' },
  video:    { exts: ['mp4','mkv','mov','avi','webm','flv','wmv','m4v'],               icon: 'video',    label: 'Video' },
  audio:    { exts: ['mp3','wav','flac','aac','ogg','m4a','wma'],                     icon: 'music',    label: 'Audio' },
  document: { exts: ['pdf','doc','docx','txt','rtf','odt','xls','xlsx','ppt','pptx','csv','md'], icon: 'fileText', label: 'Document' },
  archive:  { exts: ['zip','rar','7z','tar','gz','bz2','xz','iso','dmg'],             icon: 'archive',  label: 'Archive' },
  code:     { exts: ['js','ts','jsx','tsx','html','css','scss','json','xml','php','py','java','go','rs','sh','yml','yaml','sql'], icon: 'code', label: 'Code' },
};

function resolveType(filename, isFolder = false) {
  if (isFolder) return { key: 'folder', icon: 'folder', label: 'Folder', ext: '' };
  const ext = (filename.split('.').pop() || '').toLowerCase();
  for (const [key, def] of Object.entries(FileTypes)) {
    if (def.exts.includes(ext)) return { key, icon: def.icon, label: def.label, ext };
  }
  return { key: 'other', icon: 'file', label: 'File', ext };
}

/* ══════════════════════════════════════════
   TOAST SYSTEM
   ══════════════════════════════════════════ */

const Toast = (() => {
  let stack = null;

  function ensureStack() {
    if (!stack) {
      stack = $('.toast-stack') || el('div', { class: 'toast-stack', 'aria-live': 'polite' });
      if (!stack.parentElement) document.body.appendChild(stack);
    }
    return stack;
  }

  const iconFor = {
    success: 'checkCircle',
    error:   'xCircle',
    warning: 'alert',
    info:    'info',
  };

  function show(type, title, msg = '', duration = 3800) {
    const wrap = ensureStack();
    const node = el('div', { class: `toast ${type}`, role: 'status' }, `
      <div class="toast-icon">${icon(iconFor[type] || 'info', 15)}</div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Dismiss">${icon('x', 14)}</button>
    `);

    wrap.appendChild(node);

    const dismiss = () => {
      node.classList.add('is-leaving');
      node.addEventListener('animationend', () => node.remove(), { once: true });
    };

    node.querySelector('.toast-close').addEventListener('click', dismiss);

    let timer = duration ? setTimeout(dismiss, duration) : null;
    node.addEventListener('mouseenter', () => timer && clearTimeout(timer));
    node.addEventListener('mouseleave', () => {
      if (duration) timer = setTimeout(dismiss, 1500);
    });

    return { dismiss };
  }

  return {
    success: (t, m, d) => show('success', t, m, d),
    error:   (t, m, d) => show('error',   t, m, d),
    warning: (t, m, d) => show('warning', t, m, d),
    info:    (t, m, d) => show('info',    t, m, d),
  };
})();

/* ══════════════════════════════════════════
   MODAL SYSTEM
   ══════════════════════════════════════════ */

const Modal = (() => {
  let activeBackdrop = null;

  function open(id) {
    const backdrop = typeof id === 'string' ? document.getElementById(id) : id;
    if (!backdrop) return;
    backdrop.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    activeBackdrop = backdrop;
    const focusTarget = backdrop.querySelector('[autofocus], input, button');
    setTimeout(() => focusTarget?.focus(), 120);
  }

  function close(id) {
    const backdrop = id
      ? (typeof id === 'string' ? document.getElementById(id) : id)
      : activeBackdrop;
    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
    if (activeBackdrop === backdrop) activeBackdrop = null;
  }

  function closeAll() {
    $$('.modal-backdrop.is-open').forEach(b => b.classList.remove('is-open'));
    document.body.style.overflow = '';
    activeBackdrop = null;
  }

  /** Programmatic confirm dialog. Returns a Promise<boolean>. */
  function confirm({
    title = 'Are you sure?',
    message = '',
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    danger = false,
    iconName = danger ? 'alert' : 'helpCircle',
  } = {}) {
    return new Promise(resolve => {
      const backdrop = el('div', { class: 'modal-backdrop' }, `
        <div class="modal modal-sm" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div style="display:flex;gap:12px;align-items:flex-start;">
              <div class="toast-icon" style="background:${danger ? 'var(--color-error-bg)' : 'var(--bg-badge)'};color:${danger ? 'var(--color-error)' : 'var(--accent-primary)'};">
                ${icon(iconName, 15)}
              </div>
              <div>
                <div class="modal-title">${title}</div>
                ${message ? `<div class="modal-subtitle">${message}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-sm" data-act="cancel">${cancelText}</button>
            <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm" data-act="ok">${confirmText}</button>
          </div>
        </div>
      `);

      document.body.appendChild(backdrop);
      requestAnimationFrame(() => open(backdrop));

      const finish = val => {
        close(backdrop);
        setTimeout(() => backdrop.remove(), 300);
        resolve(val);
      };

      backdrop.querySelector('[data-act="ok"]').onclick = () => finish(true);
      backdrop.querySelector('[data-act="cancel"]').onclick = () => finish(false);
      backdrop.addEventListener('click', e => { if (e.target === backdrop) finish(false); });
    });
  }

  /** Programmatic prompt dialog. Returns Promise<string|null>. */
  function prompt({
    title = 'Enter value',
    label = '',
    value = '',
    placeholder = '',
    confirmText = 'Save',
    hint = '',
  } = {}) {
    return new Promise(resolve => {
      const backdrop = el('div', { class: 'modal-backdrop' }, `
        <div class="modal modal-sm" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div>
              <div class="modal-title">${title}</div>
              ${hint ? `<div class="modal-subtitle">${hint}</div>` : ''}
            </div>
            <button class="btn-icon btn-icon-sm" data-act="cancel">${icon('x', 15)}</button>
          </div>
          <div class="modal-body">
            <div class="field">
              ${label ? `<label class="field-label">${label}</label>` : ''}
              <input class="input" type="text" value="${value}" placeholder="${placeholder}" autofocus>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost btn-sm" data-act="cancel">Cancel</button>
            <button class="btn btn-primary btn-sm" data-act="ok">${confirmText}</button>
          </div>
        </div>
      `);

      document.body.appendChild(backdrop);
      requestAnimationFrame(() => open(backdrop));

      const input = backdrop.querySelector('input');
      const finish = val => {
        close(backdrop);
        setTimeout(() => backdrop.remove(), 300);
        resolve(val);
      };

      backdrop.querySelector('[data-act="ok"]').onclick = () => finish(input.value.trim() || null);
      backdrop.querySelectorAll('[data-act="cancel"]').forEach(b => b.onclick = () => finish(null));
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') finish(input.value.trim() || null);
      });
      backdrop.addEventListener('click', e => { if (e.target === backdrop) finish(null); });
      setTimeout(() => { input.focus(); input.select(); }, 140);
    });
  }

  return { open, close, closeAll, confirm, prompt };
})();

/* ══════════════════════════════════════════
   DROPDOWN SYSTEM
   ══════════════════════════════════════════ */

const Dropdown = (() => {
  function closeAll(except = null) {
    $$('.dropdown-menu.is-open').forEach(m => {
      if (m !== except) m.classList.remove('is-open');
    });
  }

  function init() {
    document.addEventListener('click', e => {
      const trigger = e.target.closest('[data-dropdown]');
      if (trigger) {
        e.stopPropagation();
        const id = trigger.getAttribute('data-dropdown');
        const menu = document.getElementById(id) ||
                     trigger.parentElement.querySelector('.dropdown-menu');
        if (menu) {
          const isOpen = menu.classList.contains('is-open');
          closeAll(menu);
          menu.classList.toggle('is-open', !isOpen);
        }
        return;
      }
      if (!e.target.closest('.dropdown-menu')) closeAll();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeAll();
    });
  }

  return { init, closeAll };
})();

/* ══════════════════════════════════════════
   CONTEXT MENU
   ══════════════════════════════════════════ */

const ContextMenu = (() => {
  let node = null;

  function ensure() {
    if (!node) {
      node = el('div', { class: 'context-menu' });
      document.body.appendChild(node);
      document.addEventListener('click', hide);
      document.addEventListener('scroll', hide, true);
      window.addEventListener('resize', hide);
      document.addEventListener('keydown', e => e.key === 'Escape' && hide());
    }
    return node;
  }

  /**
   * @param {number} x @param {number} y
   * @param {Array<{label,icon?,danger?,divider?,shortcut?,action?}>} items
   */
  function show(x, y, items) {
    const menu = ensure();
    menu.innerHTML = items.map(it => {
      if (it.divider) return '<div class="dropdown-divider"></div>';
      if (it.label && it.header) return `<div class="dropdown-label">${it.label}</div>`;
      return `<button class="dropdown-item${it.danger ? ' is-danger' : ''}" data-cm-action>
        ${it.icon ? icon(it.icon, 15) : ''}
        <span>${it.label}</span>
        ${it.shortcut ? `<span class="shortcut">${it.shortcut}</span>` : ''}
      </button>`;
    }).join('');

    menu.classList.add('is-open');

    // Position with viewport clamping
    const rect = menu.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth  - rect.width  - 12);
    const py = Math.min(y, window.innerHeight - rect.height - 12);
    menu.style.left = `${Math.max(8, px)}px`;
    menu.style.top  = `${Math.max(8, py)}px`;

    // Bind actions
    const actionable = items.filter(i => !i.divider && !i.header);
    menu.querySelectorAll('[data-cm-action]').forEach((btn, i) => {
      btn.onclick = ev => {
        ev.stopPropagation();
        hide();
        actionable[i]?.action?.();
      };
    });
  }

  function hide() {
    node?.classList.remove('is-open');
  }

  return { show, hide };
})();

/* ══════════════════════════════════════════
   CLIPBOARD
   ══════════════════════════════════════════ */

async function copyToClipboard(text, successMsg = 'Copied to clipboard') {
  try {
    await navigator.clipboard.writeText(text);
    Toast.success(successMsg, Format.middle(text, 40));
    return true;
  } catch {
    // Fallback
    const ta = el('textarea', { style: 'position:fixed;opacity:0;' });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); Toast.success(successMsg); }
    catch { Toast.error('Copy failed', 'Your browser blocked clipboard access'); }
    ta.remove();
    return true;
  }
}

/* ══════════════════════════════════════════
   STORAGE (namespaced localStorage)
   ══════════════════════════════════════════ */

const Store = {
  prefix: 'afm:',
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); }
    catch (e) { console.warn('[Store] write failed', e); }
  },
  remove(key) {
    try { localStorage.removeItem(this.prefix + key); } catch {}
  },
};

/* ══════════════════════════════════════════
   MISC UTILITIES
   ══════════════════════════════════════════ */

function debounce(fn, wait = 250) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function throttle(fn, limit = 100) {
  let waiting = false;
  return function (...args) {
    if (waiting) return;
    fn.apply(this, args);
    waiting = true;
    setTimeout(() => (waiting = false), limit);
  };
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/** Animate a number from 0 → target */
function countUp(node, target, { duration = 900, format = Format.number, decimals = 0 } = {}) {
  const start = performance.now();
  const ease = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const p = clamp((now - start) / duration, 0, 1);
    const val = target * ease(p);
    node.textContent = decimals ? val.toFixed(decimals) : format(Math.round(val));
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/** Material-style ripple on buttons */
function attachRipples() {
  document.addEventListener('pointerdown', e => {
    const btn = e.target.closest('.btn, .quick-tile, .filter-chip');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const r = el('span', { class: 'ripple' });
    r.style.width = r.style.height = `${size}px`;
    r.style.left = `${e.clientX - rect.left - size / 2}px`;
    r.style.top  = `${e.clientY - rect.top  - size / 2}px`;
    btn.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  });
}

/** Reveal elements on scroll */
function initScrollReveal(selector = '[data-reveal]') {
  const items = $$(selector);
  if (!items.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-fadeInUp');
        entry.target.style.opacity = '';
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  items.forEach(i => { i.style.opacity = '0'; io.observe(i); });
}

/* ══════════════════════════════════════════
   GLOBAL SEARCH / COMMAND PALETTE SHORTCUT
   ══════════════════════════════════════════ */

function initShortcuts() {
  document.addEventListener('keydown', e => {
    const mod = e.metaKey || e.ctrlKey;

    // ⌘K / Ctrl+K → focus global search
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const search = $('#globalSearch') || $('.search-input');
      search?.focus();
      search?.select();
      return;
    }

    // ⌘B / Ctrl+B → toggle sidebar
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      window.Sidebar?.toggle();
      return;
    }

    // ⌘J / Ctrl+J → toggle theme
    if (mod && e.key.toLowerCase() === 'j') {
      e.preventDefault();
      window.Theme?.toggle();
      return;
    }

    // Escape → close overlays
    if (e.key === 'Escape') {
      Modal.closeAll();
      Dropdown.closeAll();
      ContextMenu.hide();
    }
  });
}

/* ══════════════════════════════════════════
   ACTIVE NAV HIGHLIGHT
   ══════════════════════════════════════════ */

function markActiveNav() {
  const page = document.body.dataset.page;
  if (!page) return;
  $$('.nav-item').forEach(item => {
    item.classList.toggle('is-active', item.dataset.nav === page);
  });
}

/* ══════════════════════════════════════════
   MODAL AUTO-BIND (data attributes)
   ══════════════════════════════════════════ */

function initModalBindings() {
  on(document, 'click', '[data-modal-open]', function () {
    Modal.open(this.getAttribute('data-modal-open'));
  });
  on(document, 'click', '[data-modal-close]', function () {
    const target = this.getAttribute('data-modal-close');
    Modal.close(target || this.closest('.modal-backdrop'));
  });
  // Click backdrop to dismiss
  document.addEventListener('click', e => {
    if (e.target.classList?.contains('modal-backdrop')) Modal.close(e.target);
  });
}

/* ══════════════════════════════════════════
   COPY BUTTONS (data-copy)
   ══════════════════════════════════════════ */

function initCopyButtons() {
  on(document, 'click', '[data-copy]', function () {
    copyToClipboard(this.getAttribute('data-copy'));
  });
}

/* ══════════════════════════════════════════
   BOOTSTRAP
   ══════════════════════════════════════════ */

function initApp() {
  hydrateIcons();
  Dropdown.init();
  initModalBindings();
  initCopyButtons();
  initShortcuts();
  attachRipples();
  markActiveNav();
  initScrollReveal();

  // Mark platform for kbd hints
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  $$('.kbd-mod').forEach(k => k.textContent = isMac ? '⌘' : 'Ctrl');

  document.documentElement.classList.add('is-ready');
}

document.addEventListener('DOMContentLoaded', initApp);

/* ══════════════════════════════════════════
   EXPORTS (global namespace)
   ══════════════════════════════════════════ */

window.AFM = {
  Icons, icon, hydrateIcons,
  $, $$, el, on,
  Format, FileTypes, resolveType,
  Toast, Modal, Dropdown, ContextMenu,
  copyToClipboard, Store,
  debounce, throttle, uid, clamp, randBetween, escapeHtml,
  countUp, initScrollReveal,
};
```

---

<a id="file-2"></a>

### 📄 File 2/6: `dashboard.js`

| Property | Value |
|----------|-------|
| **Path** | `dashboard.js` |
| **Language** | JavaScript |
| **Size** | 18.3 KB |
| **Lines** | 493 |

```javascript
/* ============================================
   DASHBOARD.JS — Dashboard Page Logic
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Dashboard = (() => {

  /* ══════════════════════════════════════════
     MOCK DATA
     ══════════════════════════════════════════ */

  const stats = [
    {
      key: 'files',
      label: 'Total Files',
      value: 24837,
      unit: '',
      trend: +12.4,
      icon: 'file',
      spark: [4, 7, 5, 9, 8, 12, 10, 14, 13, 16, 15, 18],
    },
    {
      key: 'storage',
      label: 'Storage Used',
      value: 342,
      unit: 'GB',
      trend: +4.7,
      icon: 'hardDrive',
      spark: [8, 9, 11, 10, 12, 13, 12, 14, 15, 14, 16, 17],
    },
    {
      key: 'downloads',
      label: 'Downloads Today',
      value: 8412,
      unit: '',
      trend: -2.3,
      icon: 'download',
      spark: [12, 11, 14, 10, 13, 15, 12, 9, 11, 10, 8, 9],
    },
    {
      key: 'bandwidth',
      label: 'Bandwidth (24h)',
      value: 187,
      unit: 'GB',
      trend: +8.9,
      icon: 'activity',
      spark: [5, 7, 8, 6, 10, 12, 11, 14, 13, 15, 16, 18],
    },
  ];

  // Bar chart data (14 days)
  const chartData = {
    labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun','Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    series: [
      { name: 'Uploads',   values: [22,34,28,45,38,18,12,28,42,55,48,52,34,20], color: 'a' },
      { name: 'Downloads', values: [40,52,48,60,55,32,26,44,58,72,66,70,52,38], color: 'b' },
      { name: 'Shares',    values: [8, 12,10,14,12, 6, 4,10,15,18,16,17,11, 7], color: 'c' },
    ],
  };

  // Storage donut
  const storageBreakdown = [
    { name: 'Videos',    value: 145, color: '#a78bfa' },
    { name: 'Images',    value: 82,  color: '#f472b6' },
    { name: 'Documents', value: 54,  color: '#60a5fa' },
    { name: 'Archives',  value: 38,  color: '#fbbf24' },
    { name: 'Audio',     value: 15,  color: '#34d399' },
    { name: 'Other',     value: 8,   color: '#686868' },
  ];

  const activities = [
    { type: 'upload',   user: 'Sarah Chen',     action: 'uploaded',   target: 'Q4-Report-Final.pdf',      folder: '/reports/2025',   time: Date.now() - 3 * 60 * 1000 },
    { type: 'folder',   user: 'Marcus Weber',   action: 'created folder', target: 'Design Assets 2025',   folder: '/design',         time: Date.now() - 14 * 60 * 1000 },
    { type: 'download', user: 'Priya Ramesh',   action: 'downloaded', target: 'brand-kit-v2.zip',         folder: '/design/brand',   time: Date.now() - 42 * 60 * 1000 },
    { type: 'edit',     user: 'Alex Torres',    action: 'renamed',    target: 'launch-video-final.mp4',   folder: '/media/2025',     time: Date.now() - 1.5 * 3600 * 1000 },
    { type: 'delete',   user: 'System',         action: 'auto-purged', target: '17 expired files',        folder: '/temp',           time: Date.now() - 3 * 3600 * 1000 },
    { type: 'upload',   user: 'Yuki Tanaka',    action: 'uploaded',   target: 'user-research-notes.docx', folder: '/research',       time: Date.now() - 5 * 3600 * 1000 },
    { type: 'download', user: 'Elena Petrov',   action: 'downloaded', target: 'annual-review.pdf',        folder: '/hr/reviews',     time: Date.now() - 8 * 3600 * 1000 },
  ];

  const topFiles = [
    { name: 'installer-v4.2.dmg',        folder: '/releases/mac',  downloads: 3421, max: 3421 },
    { name: 'brand-guidelines-2025.pdf', folder: '/design/brand',  downloads: 2814 },
    { name: 'onboarding-video.mp4',      folder: '/media/hr',      downloads: 2103 },
    { name: 'api-reference.zip',         folder: '/docs/api',      downloads: 1877 },
    { name: 'launch-assets.zip',         folder: '/marketing',     downloads: 1544 },
  ];
  topFiles.forEach(f => { if (!f.max) f.max = topFiles[0].downloads; });

  const capabilities = [
    'Automated file lifecycle & retention',
    'Multi-tier storage optimization',
    'CDN edge distribution at 42 PoPs',
    'Granular permission management',
    'Real-time upload analytics & alerts',
    'Automated virus & malware scanning',
    'Version history with instant rollback',
  ];

  const serverHealth = [
    { name: 'CPU Load',      value: 42, unit: '%', icon: 'cpu',      status: 'ok' },
    { name: 'Memory',        value: 68, unit: '%', icon: 'server',   status: 'ok' },
    { name: 'Disk I/O',      value: 34, unit: '%', icon: 'hardDrive',status: 'ok' },
    { name: 'Network In',    value: 1.2,unit: 'GB/s', icon: 'wifi',  status: 'ok' },
    { name: 'Active Uploads',value: 47, unit: '',   icon: 'upload',  status: 'ok' },
  ];

  const quickActions = [
    { label: 'Upload Files',      desc: 'Add new files to storage',       icon: 'uploadCloud', href: 'uploads.html' },
    { label: 'New Folder',        desc: 'Organize with a new folder',     icon: 'folderPlus',  action: 'newFolder' },
    { label: 'Share Link',        desc: 'Generate a shareable URL',       icon: 'link',        action: 'newShare' },
    { label: 'Bulk Import',       desc: 'Import from cloud provider',     icon: 'download',    action: 'import' },
    { label: 'Manage Access',     desc: 'Users & permission settings',    icon: 'users',       href: 'settings.html' },
    { label: 'Server Health',     desc: 'View diagnostics & logs',        icon: 'gauge',       action: 'health' },
  ];

  /* ══════════════════════════════════════════
     RENDERERS
     ══════════════════════════════════════════ */

  const { $, $$, el, icon, Format, Toast, Modal, countUp } = window.AFM;

  function renderStats() {
    const wrap = $('#statsGrid');
    if (!wrap) return;

    wrap.innerHTML = stats.map((s, i) => {
      const trendUp   = s.trend > 0;
      const trendFlat = s.trend === 0;
      const trendCls  = trendFlat ? 'flat' : (trendUp ? 'up' : 'down');
      const trendIco  = trendFlat ? 'minus' : (trendUp ? 'trending' : 'trendingDown');
      const max       = Math.max(...s.spark);
      const bars      = s.spark.map(v => `<div class="spark-bar" style="height:${(v/max)*100}%"></div>`).join('');

      return `
        <div class="stat-card" style="animation-delay:${i * 60}ms">
          <div class="stat-top">
            <div class="stat-icon">${icon(s.icon, 18)}</div>
            <div class="stat-trend ${trendCls}">
              ${icon(trendIco, 11)}
              ${Math.abs(s.trend).toFixed(1)}%
            </div>
          </div>
          <div class="stat-main">
            <div class="stat-value" data-count="${s.value}">
              0${s.unit ? `<span class="unit">${s.unit}</span>` : ''}
            </div>
            <div class="stat-label">${s.label}</div>
          </div>
          <div class="stat-spark">${bars}</div>
        </div>
      `;
    }).join('');

    // Animate counters
    wrap.querySelectorAll('.stat-value[data-count]').forEach(node => {
      const target = parseFloat(node.getAttribute('data-count'));
      const unit = node.querySelector('.unit')?.outerHTML || '';
      const start = performance.now();
      const duration = 1100;
      const ease = t => 1 - Math.pow(1 - t, 3);
      function frame(now) {
        const p = Math.min((now - start) / duration, 1);
        const val = Math.round(target * ease(p));
        node.innerHTML = Format.number(val) + unit;
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }

  function renderChart() {
    const wrap = $('#trafficChart');
    if (!wrap) return;

    const maxVal = Math.max(
      ...chartData.series.reduce((acc, s) => acc.concat(s.values), [])
    );

    // Build columns
    const cols = chartData.labels.map((label, i) => {
      const total = chartData.series.reduce((sum, s) => sum + s.values[i], 0);
      const stack = chartData.series.slice().reverse().map(s => {
        const h = (s.values[i] / maxVal) * 100;
        return `<div class="bar-seg ${s.color}" style="height:${h}%; animation-delay:${i * 40 + 100}ms"></div>`;
      }).join('');

      const tipRows = chartData.series.map(s =>
        `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;">
           <span style="opacity:.7">${s.name}</span>
           <span style="font-variant-numeric:tabular-nums;">${Format.number(s.values[i])}</span>
         </div>`
      ).join('');

      return `
        <div class="bar-col">
          <div class="bar-tip">
            <div style="font-weight:500;margin-bottom:4px;">${label} · ${Format.number(total)}</div>
            ${tipRows}
          </div>
          <div class="bar-stack">${stack}</div>
          <div class="bar-label">${label}</div>
        </div>
      `;
    }).join('');

    // Grid lines (4 horizontal)
    const gridLines = [0, 25, 50, 75].map(p =>
      `<div class="chart-grid-line" style="bottom:${p + 6}%"></div>`
    ).join('');

    wrap.innerHTML = `${gridLines}<div class="bar-chart">${cols}</div>`;
  }

  function renderLegend() {
    const wrap = $('#chartLegend');
    if (!wrap) return;
    const colorMap = {
      a: 'var(--accent-primary)',
      b: 'rgba(107, 98, 242, 0.45)',
      c: 'rgba(107, 98, 242, 0.2)',
    };
    wrap.innerHTML = chartData.series.map(s => `
      <div class="legend-item">
        <span class="legend-swatch" style="background:${colorMap[s.color]}"></span>
        ${s.name}
      </div>
    `).join('');
  }

  function renderDonut() {
    const wrap = $('#storageDonut');
    if (!wrap) return;

    const total = storageBreakdown.reduce((s, x) => s + x.value, 0);
    const RADIUS = 60;
    const CIRC = 2 * Math.PI * RADIUS;

    let offset = 0;
    const rings = storageBreakdown.map((s, i) => {
      const frac = s.value / total;
      const dash = frac * CIRC;
      const el = `<circle
        cx="75" cy="75" r="${RADIUS}"
        stroke="${s.color}"
        stroke-dasharray="${dash} ${CIRC}"
        stroke-dashoffset="${-offset}"
        style="transition-delay:${i * 80}ms"
        data-seg="${i}"
      />`;
      offset += dash;
      return el;
    }).join('');

    wrap.innerHTML = `
      <div class="donut-wrap">
        <div class="donut">
          <svg viewBox="0 0 150 150">${rings}</svg>
          <div class="donut-center">
            <div class="donut-value">${total}<span style="font-size:.7em;opacity:.6"> GB</span></div>
            <div class="donut-label">Used</div>
          </div>
        </div>
        <div class="donut-legend">
          ${storageBreakdown.map((s, i) => `
            <div class="donut-legend-row" data-idx="${i}">
              <span class="legend-swatch" style="background:${s.color}"></span>
              <span class="name">${s.name}</span>
              <span class="val">${s.value} GB</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Legend hover → highlight segment
    wrap.querySelectorAll('.donut-legend-row').forEach(row => {
      row.addEventListener('mouseenter', () => {
        const idx = row.getAttribute('data-idx');
        wrap.querySelectorAll('circle').forEach(c => {
          c.style.opacity = c.getAttribute('data-seg') === idx ? '1' : '0.25';
        });
      });
      row.addEventListener('mouseleave', () => {
        wrap.querySelectorAll('circle').forEach(c => c.style.opacity = '1');
      });
    });
  }

  function renderActivity() {
    const wrap = $('#activityFeed');
    if (!wrap) return;
    wrap.innerHTML = activities.map(a => `
      <div class="activity-item">
        <div class="activity-ico ${a.type}">${icon(iconForActivity(a.type), 14)}</div>
        <div class="activity-body">
          <div class="activity-text">
            <strong>${a.user}</strong> ${a.action} <strong>${a.target}</strong>
          </div>
          <div class="activity-meta">
            <span>${a.folder}</span>
            <span class="sep"></span>
            <span>${Format.relative(a.time)}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  function iconForActivity(type) {
    return {
      upload: 'upload',
      download: 'download',
      delete: 'trash',
      edit: 'edit',
      folder: 'folderPlus',
    }[type] || 'activity';
  }

  function renderTopFiles() {
    const wrap = $('#topFiles');
    if (!wrap) return;
    wrap.innerHTML = topFiles.map((f, i) => `
      <div class="rank-row">
        <div class="rank-num">${Format.pad(i + 1)}</div>
        <div class="rank-info">
          <div class="rank-name">${f.name}</div>
          <div class="rank-sub">${f.folder}</div>
        </div>
        <div class="rank-bar-wrap">
          <div class="progress progress-sm">
            <div class="progress-bar" style="width:${(f.downloads / f.max) * 100}%"></div>
          </div>
        </div>
        <div class="rank-count">${Format.compact(f.downloads)}</div>
      </div>
    `).join('');
  }

  function renderCapabilities() {
    const wrap = $('#capabilities');
    if (!wrap) return;
    wrap.innerHTML = capabilities.map((c, i) => `
      <div class="numbered-row">
        <div class="numbered-name">${c}</div>
        <div class="numbered-index">${Format.pad(i + 1)}</div>
      </div>
    `).join('');
  }

  function renderHealth() {
    const wrap = $('#serverHealth');
    if (!wrap) return;

    wrap.innerHTML = serverHealth.map(h => {
      const isPct = h.unit === '%';
      const barWidth = isPct ? h.value : Math.min((h.value / 2) * 100, 100);
      const barClass = h.value > 80 ? 'is-error' : h.value > 60 ? 'is-warning' : '';
      return `
        <div class="health-row">
          <div class="health-top">
            <div class="health-name">
              ${icon(h.icon, 14)}
              ${h.name}
            </div>
            <div class="health-val">${h.value}${h.unit}</div>
          </div>
          ${isPct ? `
            <div class="progress progress-sm">
              <div class="progress-bar ${barClass}" style="width:${barWidth}%"></div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function renderQuickActions() {
    const wrap = $('#quickActions');
    if (!wrap) return;
    wrap.innerHTML = quickActions.map(q => `
      <${q.href ? 'a' : 'button'} class="quick-tile" ${q.href ? `href="${q.href}"` : ''} ${q.action ? `data-quick="${q.action}"` : ''}>
        <div class="quick-tile-ico">${icon(q.icon, 16)}</div>
        <div>
          <div class="quick-tile-title">${q.label}</div>
          <div class="quick-tile-desc">${q.desc}</div>
        </div>
      </${q.href ? 'a' : 'button'}>
    `).join('');
  }

  /* ══════════════════════════════════════════
     BIND ACTIONS
     ══════════════════════════════════════════ */

  function bindActions() {
    // Quick action tiles
    document.addEventListener('click', async e => {
      const tile = e.target.closest('[data-quick]');
      if (!tile) return;
      const action = tile.getAttribute('data-quick');

      switch (action) {
        case 'newFolder': {
          const name = await Modal.prompt({
            title: 'Create new folder',
            label: 'Folder name',
            placeholder: 'e.g. Marketing Assets',
            confirmText: 'Create',
          });
          if (name) Toast.success('Folder created', `"${name}" is ready`);
          break;
        }
        case 'newShare': {
          const link = 'https://dl.dimension.io/s/' + Math.random().toString(36).slice(2, 10);
          await window.AFM.copyToClipboard(link, 'Share link copied');
          break;
        }
        case 'import':
          Toast.info('Bulk import', 'Choose a cloud provider to continue', 3200);
          break;
        case 'health':
          Toast.info('All systems operational', 'Uptime 99.98% · Response 42ms', 3200);
          break;
      }
    });

    // Refresh button
    $('#refreshDashboard')?.addEventListener('click', () => {
      Toast.info('Refreshing dashboard…');
      setTimeout(() => {
        renderStats();
        renderChart();
        Toast.success('Dashboard updated');
      }, 500);
    });
  }

  /* ══════════════════════════════════════════
     LIVE UPDATES — simulated realtime tick
     ══════════════════════════════════════════ */

  function startLiveUpdates() {
    // Simulate activity every 12–20 seconds
    setInterval(() => {
      const active = document.visibilityState === 'visible';
      if (!active) return;

      // Nudge server health values slightly
      serverHealth.forEach(h => {
        if (h.unit === '%') {
          const delta = (Math.random() - 0.5) * 6;
          h.value = window.AFM.clamp(Math.round(h.value + delta), 15, 92);
        } else if (h.unit === 'GB/s') {
          h.value = +(0.8 + Math.random() * 1.4).toFixed(1);
        } else {
          h.value = window.AFM.clamp(h.value + Math.round((Math.random() - 0.5) * 5), 10, 120);
        }
      });
      renderHealth();
    }, 4200);
  }

  /* ══════════════════════════════════════════
     INIT
     ══════════════════════════════════════════ */

  function init() {
    renderStats();
    renderChart();
    renderLegend();
    renderDonut();
    renderActivity();
    renderTopFiles();
    renderCapabilities();
    renderHealth();
    renderQuickActions();
    bindActions();
    startLiveUpdates();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'dashboard') {
    Dashboard.init();
  }
});

window.Dashboard = Dashboard;
```

---

<a id="file-3"></a>

### 📄 File 3/6: `files.js`

| Property | Value |
|----------|-------|
| **Path** | `files.js` |
| **Language** | JavaScript |
| **Size** | 35.4 KB |
| **Lines** | 906 |

```javascript
/* ============================================
   FILES.JS — File Browser Page Logic
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Files = (() => {

  const { $, $$, el, icon, Format, Toast, Modal, ContextMenu, copyToClipboard, resolveType, Store } = window.AFM;

  /* ══════════════════════════════════════════
     MOCK DATA
     ══════════════════════════════════════════ */

  const folderTree = [
    { id: 'root', name: 'All Files', icon: 'hardDrive', count: 24837, children: [
      { id: 'releases', name: 'Releases', count: 1240, children: [
        { id: 'mac',     name: 'macOS',   count: 340 },
        { id: 'win',     name: 'Windows', count: 512 },
        { id: 'linux',   name: 'Linux',   count: 388 },
      ]},
      { id: 'media', name: 'Media', count: 8912, children: [
        { id: 'videos',  name: 'Videos', count: 3402 },
        { id: 'images',  name: 'Images', count: 5510 },
      ]},
      { id: 'docs',     name: 'Documents', count: 4302 },
      { id: 'design',   name: 'Design',    count: 2144 },
      { id: 'reports',  name: 'Reports',   count: 981 },
      { id: 'archive',  name: 'Archive',   count: 7258 },
    ]},
    { id: 'shared',  name: 'Shared with me', icon: 'users',    count: 428 },
    { id: 'starred', name: 'Starred',        icon: 'star',     count: 34  },
    { id: 'recent',  name: 'Recent',         icon: 'clock',    count: 128 },
    { id: 'trash',   name: 'Trash',          icon: 'trash',    count: 217 },
  ];

  const fileNames = [
    'launch-video-final-v3.mp4',
    'brand-guidelines-2025.pdf',
    'installer-v4.2.dmg',
    'annual-report.pdf',
    'ui-mockup-dashboard.png',
    'product-shots-batch-04.zip',
    'onboarding-flow.fig',
    'api-reference-v2.zip',
    'quarterly-review.docx',
    'team-photo-2024.jpg',
    'demo-recording.mov',
    'roadmap-q1-q2.xlsx',
    'logo-primary-dark.svg',
    'user-research-notes.pdf',
    'marketing-assets.zip',
    'podcast-episode-14.mp3',
    'infrastructure-diagram.png',
    'config.yaml',
    'deploy-script.sh',
    'legal-agreement.pdf',
    'launch-checklist.md',
    'design-system.sketch',
    'analytics-export.csv',
    'server-logs-dec.gz',
    'welcome-banner.webp',
    'source-code-snapshot.tar',
    'meeting-recap.docx',
    'feature-spec.pdf',
  ];

  const authors = ['Sarah Chen', 'Marcus Weber', 'Priya Ramesh', 'Alex Torres', 'Yuki Tanaka', 'Elena Petrov', 'James Okonkwo', 'Mira Patel'];
  const statuses = ['public', 'internal', 'private'];

  function makeFiles() {
    const items = [];
    // Add a few folders first
    ['Marketing Assets', 'Product Design', 'Legal Documents', 'Beta Releases'].forEach((name, i) => {
      items.push({
        id: `fld_${i}`,
        name,
        isFolder: true,
        size: null,
        items: 40 + Math.floor(Math.random() * 300),
        downloads: null,
        modified: Date.now() - Math.random() * 14 * 86400 * 1000,
        author: authors[Math.floor(Math.random() * authors.length)],
        status: 'internal',
        starred: false,
        path: '/root',
      });
    });

    fileNames.forEach((name, i) => {
      items.push({
        id: `f_${i}`,
        name,
        isFolder: false,
        size: Math.round(Math.random() * 500 * 1024 * 1024) + 30000,
        downloads: Math.floor(Math.random() * 3500),
        modified: Date.now() - Math.random() * 30 * 86400 * 1000,
        author: authors[Math.floor(Math.random() * authors.length)],
        status: statuses[Math.floor(Math.random() * statuses.length)],
        starred: Math.random() < 0.15,
        path: '/root/media',
      });
    });
    return items;
  }

  /* ══════════════════════════════════════════
     STATE
     ══════════════════════════════════════════ */

  const state = {
    all: [],
    filtered: [],
    view: Store.get('files-view', 'list'),   // 'list' | 'grid'
    sort: { key: 'modified', dir: 'desc' },
    filter: 'all',                            // 'all'|'folder'|'image'|'video'|'audio'|'document'|'archive'|'code'
    search: '',
    selected: new Set(),
    page: 1,
    perPage: 20,
    currentFolder: 'root',
  };

  /* ══════════════════════════════════════════
     RENDER — FOLDER TREE
     ══════════════════════════════════════════ */

  function renderTree() {
    const wrap = $('#folderTree');
    if (!wrap) return;

    function walk(nodes, depth = 0) {
      return nodes.map(n => {
        const hasChildren = Array.isArray(n.children) && n.children.length > 0;
        const isOpen = depth === 0 || n.id === 'root' || n.id === 'media';
        const isActive = n.id === state.currentFolder;

        return `
          <div class="tree-node ${isOpen ? 'is-open' : ''}" data-id="${n.id}">
            <div class="tree-item ${isActive ? 'is-active' : ''}" data-tree-id="${n.id}">
              <span class="tree-caret ${hasChildren ? '' : 'is-empty'}">
                ${hasChildren ? icon('chevronRight', 11) : ''}
              </span>
              <span class="tree-ico">${icon(n.icon || 'folder', 14)}</span>
              <span class="tree-name">${n.name}</span>
              ${n.count != null ? `<span class="tree-count">${Format.compact(n.count)}</span>` : ''}
            </div>
            ${hasChildren ? `<div class="tree-children">${walk(n.children, depth + 1)}</div>` : ''}
          </div>
        `;
      }).join('');
    }

    wrap.innerHTML = walk(folderTree);

    // Bind clicks
    wrap.querySelectorAll('.tree-caret').forEach(c => {
      c.addEventListener('click', e => {
        e.stopPropagation();
        c.closest('.tree-node').classList.toggle('is-open');
      });
    });

    wrap.querySelectorAll('.tree-item').forEach(item => {
      item.addEventListener('click', () => {
        state.currentFolder = item.getAttribute('data-tree-id');
        wrap.querySelectorAll('.tree-item').forEach(i => i.classList.remove('is-active'));
        item.classList.add('is-active');
        updateBreadcrumb();
      });
    });
  }

  /* ══════════════════════════════════════════
     RENDER — FILTER CHIPS
     ══════════════════════════════════════════ */

  function renderFilterChips() {
    const wrap = $('#filterChips');
    if (!wrap) return;

    const counts = {
      all: state.all.length,
      folder: state.all.filter(f => f.isFolder).length,
      image: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'image').length,
      video: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'video').length,
      document: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'document').length,
      audio: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'audio').length,
      archive: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'archive').length,
      code: state.all.filter(f => !f.isFolder && resolveType(f.name).key === 'code').length,
    };

    const chips = [
      { key: 'all',      label: 'All',       icon: 'layers' },
      { key: 'folder',   label: 'Folders',   icon: 'folder' },
      { key: 'image',    label: 'Images',    icon: 'image' },
      { key: 'video',    label: 'Videos',    icon: 'video' },
      { key: 'document', label: 'Documents', icon: 'fileText' },
      { key: 'audio',    label: 'Audio',     icon: 'music' },
      { key: 'archive',  label: 'Archives',  icon: 'archive' },
      { key: 'code',     label: 'Code',      icon: 'code' },
    ];

    wrap.innerHTML = chips.map(c => `
      <button class="filter-chip ${state.filter === c.key ? 'is-active' : ''}" data-filter="${c.key}">
        ${icon(c.icon, 13)}
        ${c.label}
        <span class="count">${Format.compact(counts[c.key] || 0)}</span>
      </button>
    `).join('');
  }

  /* ══════════════════════════════════════════
     APPLY FILTERS / SORT
     ══════════════════════════════════════════ */

  function applyFilters() {
    let items = state.all.slice();

    // Type filter
    if (state.filter === 'folder') {
      items = items.filter(f => f.isFolder);
    } else if (state.filter !== 'all') {
      items = items.filter(f => !f.isFolder && resolveType(f.name).key === state.filter);
    }

    // Search
    if (state.search.trim()) {
      const q = state.search.toLowerCase();
      items = items.filter(f => f.name.toLowerCase().includes(q));
    }

    // Sort — folders always first
    items.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      let av = a[state.sort.key], bv = b[state.sort.key];
      if (av == null) av = 0;
      if (bv == null) bv = 0;
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
      if (av < bv) return state.sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return state.sort.dir === 'asc' ?  1 : -1;
      return 0;
    });

    state.filtered = items;
    state.page = Math.min(state.page, Math.max(1, Math.ceil(items.length / state.perPage)));
  }

  /* ══════════════════════════════════════════
     RENDER — LIST VIEW (table)
     ══════════════════════════════════════════ */

  function renderList() {
    const wrap = $('#filesContainer');
    if (!wrap) return;

    const start = (state.page - 1) * state.perPage;
    const pageItems = state.filtered.slice(start, start + state.perPage);
    const allSelected = pageItems.length && pageItems.every(f => state.selected.has(f.id));
    const anySelected = pageItems.some(f => state.selected.has(f.id));

    if (!pageItems.length) {
      wrap.innerHTML = renderEmpty();
      updateBulkBar();
      return;
    }

    const rows = pageItems.map(f => {
      const t = resolveType(f.name, f.isFolder);
      const isSel = state.selected.has(f.id);
      const statusBadge = f.isFolder
        ? `<span class="badge">${f.items} items</span>`
        : `<span class="badge badge-${statusColor(f.status)}">${f.status}</span>`;

      return `
        <tr data-id="${f.id}" class="${isSel ? 'is-selected' : ''}">
          <td class="col-check">
            <label class="checkbox">
              <input type="checkbox" data-check="${f.id}" ${isSel ? 'checked' : ''}>
              <span class="box">${icon('check', 11)}</span>
            </label>
          </td>
          <td>
            <div class="fname-cell">
              <div class="ftype-icon ${t.key}">${icon(t.icon, 16)}</div>
              <div class="fname-text">
                <div class="fname">${f.name} ${f.starred ? '<span style="color:#fbbf24">★</span>' : ''}</div>
                <div class="fpath">${f.path}</div>
              </div>
            </div>
          </td>
          <td><span class="mono-num">${f.isFolder ? '—' : Format.bytes(f.size)}</span></td>
          <td class="col-type"><span class="tag">${t.label}${t.ext ? '·' + t.ext.toUpperCase() : ''}</span></td>
          <td class="col-downloads"><span class="mono-num">${f.downloads != null ? Format.compact(f.downloads) : '—'}</span></td>
          <td class="col-modified"><span class="mono-num" style="font-size:12px;">${Format.relative(f.modified)}</span></td>
          <td class="col-status">${statusBadge}</td>
          <td class="col-actions">
            <div class="row-actions">
              <button class="btn-icon btn-icon-sm" data-tip="Download" data-act="download" data-id="${f.id}">${icon('download', 15)}</button>
              <button class="btn-icon btn-icon-sm" data-tip="More" data-act="more" data-id="${f.id}">${icon('moreHorizontal', 15)}</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <div class="files-table-wrap">
        <table class="files-table">
          <thead>
            <tr>
              <th class="col-check">
                <label class="checkbox">
                  <input type="checkbox" id="selectAll" ${allSelected ? 'checked' : ''}>
                  <span class="box">${icon('check', 11)}</span>
                </label>
              </th>
              <th class="sortable ${state.sort.key === 'name' ? 'is-sorted ' + state.sort.dir : ''}" data-sort="name">
                Name <span class="sort-ind">${icon('chevronDown', 12)}</span>
              </th>
              <th class="sortable ${state.sort.key === 'size' ? 'is-sorted ' + state.sort.dir : ''} col-size" data-sort="size">
                Size <span class="sort-ind">${icon('chevronDown', 12)}</span>
              </th>
              <th class="col-type">Type</th>
              <th class="sortable ${state.sort.key === 'downloads' ? 'is-sorted ' + state.sort.dir : ''} col-downloads" data-sort="downloads">
                Downloads <span class="sort-ind">${icon('chevronDown', 12)}</span>
              </th>
              <th class="sortable ${state.sort.key === 'modified' ? 'is-sorted ' + state.sort.dir : ''} col-modified" data-sort="modified">
                Modified <span class="sort-ind">${icon('chevronDown', 12)}</span>
              </th>
              <th class="col-status">Status</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${renderFooter()}
      </div>
    `;

    const selectAll = $('#selectAll');
    if (selectAll) {
      selectAll.indeterminate = anySelected && !allSelected;
    }

    bindRowInteractions();
    updateBulkBar();
  }

  /* ══════════════════════════════════════════
     RENDER — GRID VIEW
     ══════════════════════════════════════════ */

  function renderGrid() {
    const wrap = $('#filesContainer');
    if (!wrap) return;

    const start = (state.page - 1) * state.perPage;
    const pageItems = state.filtered.slice(start, start + state.perPage);

    if (!pageItems.length) {
      wrap.innerHTML = renderEmpty();
      updateBulkBar();
      return;
    }

    const cards = pageItems.map((f, i) => {
      const t = resolveType(f.name, f.isFolder);
      const isSel = state.selected.has(f.id);
      const ext = t.ext ? t.ext.toUpperCase() : (f.isFolder ? 'FOLDER' : '');

      return `
        <div class="file-card ${isSel ? 'is-selected' : ''}" data-id="${f.id}" style="animation-delay:${i * 20}ms">
          <div class="file-card-check">
            <label class="checkbox">
              <input type="checkbox" data-check="${f.id}" ${isSel ? 'checked' : ''}>
              <span class="box">${icon('check', 11)}</span>
            </label>
          </div>
          <div class="file-card-menu">
            <button class="btn-icon btn-icon-sm" data-act="more" data-id="${f.id}">${icon('moreHorizontal', 15)}</button>
          </div>
          <div class="file-thumb">
            <div class="ftype-icon ${t.key}">${icon(t.icon, 22)}</div>
            ${ext ? `<div class="file-ext-tag">${ext}</div>` : ''}
          </div>
          <div class="file-card-info">
            <div class="file-card-name">${f.name}</div>
            <div class="file-card-meta">
              <span>${f.isFolder ? f.items + ' items' : Format.bytes(f.size)}</span>
              <span class="sep"></span>
              <span>${Format.relative(f.modified)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    wrap.innerHTML = `<div class="grid-files">${cards}</div>${renderFooter()}`;
    bindRowInteractions();
    updateBulkBar();
  }

  /* ══════════════════════════════════════════
     FOOTER — Pagination
     ══════════════════════════════════════════ */

  function renderFooter() {
    const total = state.filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / state.perPage));
    const start = total === 0 ? 0 : (state.page - 1) * state.perPage + 1;
    const end = Math.min(state.page * state.perPage, total);

    const pageNumbers = buildPageNumbers(state.page, totalPages);

    return `
      <div class="table-footer">
        <div class="rows-select">
          Show
          <select id="perPageSelect">
            ${[10, 20, 50, 100].map(n => `<option value="${n}" ${state.perPage === n ? 'selected' : ''}>${n}</option>`).join('')}
          </select>
          rows
        </div>
        <div class="footer-info">
          Showing <strong>${start}–${end}</strong> of <strong>${Format.number(total)}</strong>
        </div>
        <div class="pagination">
          <button class="page-btn" data-page="prev" ${state.page === 1 ? 'disabled' : ''}>${icon('chevronLeft', 15)}</button>
          ${pageNumbers.map(p =>
            p === '…'
              ? `<span class="page-btn" style="cursor:default;pointer-events:none">…</span>`
              : `<button class="page-btn ${p === state.page ? 'is-active' : ''}" data-page="${p}">${p}</button>`
          ).join('')}
          <button class="page-btn" data-page="next" ${state.page === totalPages ? 'disabled' : ''}>${icon('chevronRight', 15)}</button>
        </div>
      </div>
    `;
  }

  function buildPageNumbers(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages = [1];
    if (current > 3) pages.push('…');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
    if (current < total - 2) pages.push('…');
    pages.push(total);
    return pages;
  }

  function renderEmpty() {
    return `
      <div class="empty-state">
        <div class="empty-icon">${icon('inbox', 26)}</div>
        <div class="empty-title">No files match your filters</div>
        <div class="empty-desc">Try clearing filters or uploading new files to get started.</div>
        <div style="margin-top:12px;display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" id="clearFilters">Clear filters</button>
          <a class="btn btn-primary btn-sm" href="uploads.html">${icon('upload', 15)} Upload files</a>
        </div>
      </div>
    `;
  }

  function statusColor(status) {
    return { public: 'success', internal: 'accent', private: 'warning' }[status] || '';
  }

  /* ══════════════════════════════════════════
     BREADCRUMB
     ══════════════════════════════════════════ */

  function updateBreadcrumb() {
    const bc = $('#breadcrumb');
    if (!bc) return;
    const active = findNode(folderTree, state.currentFolder);
    if (!active) return;

    // Simple path builder
    const path = pathTo(folderTree, state.currentFolder) || [];
    bc.innerHTML = path.map((n, i) => `
      <span class="breadcrumb-sep">${icon('chevronRight', 14)}</span>
      <span class="breadcrumb-item ${i === path.length - 1 ? 'is-current' : ''}" data-nav-id="${n.id}">${n.name}</span>
    `).join('');
    // Add home first
    bc.insertAdjacentHTML('afterbegin', `<span class="breadcrumb-item" data-nav-id="root">Files</span>`);
  }

  function findNode(list, id) {
    for (const n of list) {
      if (n.id === id) return n;
      if (n.children) {
        const found = findNode(n.children, id);
        if (found) return found;
      }
    }
  }

  function pathTo(list, id, trail = []) {
    for (const n of list) {
      const next = [...trail, n];
      if (n.id === id) return next;
      if (n.children) {
        const p = pathTo(n.children, id, next);
        if (p) return p;
      }
    }
    return null;
  }

  /* ══════════════════════════════════════════
     BULK BAR
     ══════════════════════════════════════════ */

  function updateBulkBar() {
    const bar = $('#bulkBar');
    if (!bar) return;
    const count = state.selected.size;
    bar.classList.toggle('is-visible', count > 0);
    const num = bar.querySelector('.num');
    if (num) num.textContent = count;
  }

  function clearSelection() {
    state.selected.clear();
    renderView();
  }

  /* ══════════════════════════════════════════
     ROW / CARD INTERACTIONS
     ══════════════════════════════════════════ */

  function bindRowInteractions() {
    // Checkbox individual
    $$('input[data-check]').forEach(cb => {
      cb.addEventListener('change', () => {
        const id = cb.getAttribute('data-check');
        if (cb.checked) state.selected.add(id); else state.selected.delete(id);
        renderView();
      });
    });

    // Select all
    $('#selectAll')?.addEventListener('change', e => {
      const start = (state.page - 1) * state.perPage;
      const pageItems = state.filtered.slice(start, start + state.perPage);
      if (e.target.checked) pageItems.forEach(f => state.selected.add(f.id));
      else pageItems.forEach(f => state.selected.delete(f.id));
      renderView();
    });

    // Sort headers
    $$('.files-table th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort.key = key;
          state.sort.dir = 'asc';
        }
        applyFilters();
        renderView();
      });
    });

    // Row click → open drawer
    $$('.files-table tbody tr, .file-card').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('input, .btn-icon, .checkbox, [data-act]')) return;
        openDrawer(row.getAttribute('data-id'));
      });

      // Right-click context menu
      row.addEventListener('contextmenu', e => {
        e.preventDefault();
        openContext(e.clientX, e.clientY, row.getAttribute('data-id'));
      });
    });

    // Row action buttons
    $$('[data-act]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const act = btn.getAttribute('data-act');
        handleAction(act, id, e);
      });
    });

    // Pagination
    $$('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = btn.getAttribute('data-page');
        const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
        if (p === 'prev') state.page = Math.max(1, state.page - 1);
        else if (p === 'next') state.page = Math.min(totalPages, state.page + 1);
        else state.page = parseInt(p, 10);
        renderView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // Per page
    $('#perPageSelect')?.addEventListener('change', e => {
      state.perPage = parseInt(e.target.value, 10);
      state.page = 1;
      renderView();
    });

    // Empty state clear
    $('#clearFilters')?.addEventListener('click', () => {
      state.filter = 'all';
      state.search = '';
      const searchInput = $('#filesSearch');
      if (searchInput) searchInput.value = '';
      renderFilterChips();
      applyFilters();
      renderView();
    });

    // Breadcrumb clicks
    $$('#breadcrumb [data-nav-id]').forEach(b => {
      b.addEventListener('click', () => {
        state.currentFolder = b.getAttribute('data-nav-id');
        updateBreadcrumb();
      });
    });
  }

  /* ══════════════════════════════════════════
     ACTIONS
     ══════════════════════════════════════════ */

  async function handleAction(act, id, event) {
    const file = state.all.find(f => f.id === id);
    if (!file) return;

    switch (act) {
      case 'download':
        Toast.success('Download started', file.name);
        break;

      case 'more': {
        const rect = event.target.getBoundingClientRect();
        openContext(rect.left, rect.bottom + 4, id);
        break;
      }

      case 'share': {
        const link = 'https://dl.dimension.io/f/' + Math.random().toString(36).slice(2, 10);
        await copyToClipboard(link, 'Share link copied');
        break;
      }

      case 'rename': {
        const newName = await Modal.prompt({
          title: 'Rename file',
          label: 'New name',
          value: file.name,
          confirmText: 'Rename',
        });
        if (newName && newName !== file.name) {
          file.name = newName;
          Toast.success('Renamed', newName);
          applyFilters();
          renderView();
        }
        break;
      }

      case 'delete': {
        const ok = await Modal.confirm({
          title: `Delete "${file.name}"?`,
          message: 'This will move the file to trash. You can restore it within 30 days.',
          confirmText: 'Move to trash',
          danger: true,
        });
        if (ok) {
          state.all = state.all.filter(f => f.id !== id);
          state.selected.delete(id);
          Toast.success('Moved to trash', file.name);
          renderFilterChips();
          applyFilters();
          renderView();
        }
        break;
      }

      case 'star':
        file.starred = !file.starred;
        Toast.info(file.starred ? 'Starred' : 'Unstarred', file.name);
        renderView();
        break;

      case 'copyLink': {
        const link = 'https://dl.dimension.io/f/' + file.id;
        await copyToClipboard(link, 'Link copied');
        break;
      }
    }
  }

  function openContext(x, y, id) {
    const file = state.all.find(f => f.id === id);
    if (!file) return;

    ContextMenu.show(x, y, [
      { label: 'Preview',      icon: 'eye',      action: () => openDrawer(id) },
      { label: 'Download',     icon: 'download', shortcut: 'D', action: () => handleAction('download', id) },
      { label: 'Copy link',    icon: 'link',     shortcut: '⌘C', action: () => handleAction('copyLink', id) },
      { label: 'Share',        icon: 'share',    action: () => handleAction('share', id) },
      { divider: true },
      { label: file.starred ? 'Unstar' : 'Star', icon: 'star', action: () => handleAction('star', id) },
      { label: 'Rename',       icon: 'edit',     shortcut: 'F2', action: () => handleAction('rename', id) },
      { label: 'Move to…',     icon: 'move',     action: () => Toast.info('Move dialog', 'Coming soon') },
      { divider: true },
      { label: 'Move to trash', icon: 'trash',   danger: true, action: () => handleAction('delete', id) },
    ]);
  }

  /* ══════════════════════════════════════════
     DRAWER (file details)
     ══════════════════════════════════════════ */

  function openDrawer(id) {
    const file = state.all.find(f => f.id === id);
    if (!file) return;
    const drawer = $('#fileDrawer');
    if (!drawer) return;

    const t = resolveType(file.name, file.isFolder);
    const shareLink = `https://dl.dimension.io/f/${file.id}`;

    drawer.querySelector('.drawer-body').innerHTML = `
      <div class="drawer-preview">
        <div class="ftype-icon ${t.key}">${icon(t.icon, 26)}</div>
      </div>
      <div>
        <div class="drawer-filename">${file.name}</div>
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
          <span class="badge">${t.label}</span>
          ${file.isFolder ? '' : `<span class="badge badge-${statusColor(file.status)}">${file.status}</span>`}
          ${file.starred ? '<span class="badge badge-warning">★ Starred</span>' : ''}
        </div>
      </div>

      <div class="meta-list">
        <div class="meta-row"><span class="meta-key">Size</span><span class="meta-val">${file.isFolder ? file.items + ' items' : Format.bytes(file.size)}</span></div>
        <div class="meta-row"><span class="meta-key">Type</span><span class="meta-val">${t.label}${t.ext ? ' · .' + t.ext : ''}</span></div>
        ${file.downloads != null ? `<div class="meta-row"><span class="meta-key">Downloads</span><span class="meta-val">${Format.number(file.downloads)}</span></div>` : ''}
        <div class="meta-row"><span class="meta-key">Modified</span><span class="meta-val">${Format.dateTime(file.modified)}</span></div>
        <div class="meta-row"><span class="meta-key">Author</span><span class="meta-val">${file.author}</span></div>
        <div class="meta-row"><span class="meta-key">Location</span><span class="meta-val">${file.path}</span></div>
        <div class="meta-row"><span class="meta-key">ID</span><span class="meta-val" style="font-family:'SF Mono',monospace;font-size:11px">${file.id}</span></div>
      </div>

      <div>
        <div class="field-label" style="margin-bottom:8px">Shareable link</div>
        <div class="link-box">
          <div class="link-text">${shareLink}</div>
          <button class="btn-icon btn-icon-sm" data-copy="${shareLink}" data-tip="Copy">${icon('copy', 15)}</button>
        </div>
      </div>
    `;

    drawer.querySelector('.drawer-title').textContent = 'File details';
    drawer.classList.add('is-open');
    drawer.setAttribute('data-current-id', id);
  }

  function closeDrawer() {
    $('#fileDrawer')?.classList.remove('is-open');
  }

  /* ══════════════════════════════════════════
     DRAG & DROP
     ══════════════════════════════════════════ */

  function initDragDrop() {
    const overlay = $('#dropOverlay');
    if (!overlay) return;
    let dragCount = 0;

    window.addEventListener('dragenter', e => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragCount++;
      overlay.classList.add('is-active');
    });
    window.addEventListener('dragleave', () => {
      dragCount--;
      if (dragCount <= 0) { dragCount = 0; overlay.classList.remove('is-active'); }
    });
    window.addEventListener('dragover', e => e.preventDefault());
    window.addEventListener('drop', e => {
      e.preventDefault();
      dragCount = 0;
      overlay.classList.remove('is-active');
      const count = e.dataTransfer?.files?.length || 0;
      if (count) Toast.success(`${count} file${count > 1 ? 's' : ''} ready to upload`, 'Redirecting to uploads…');
    });
  }

  /* ══════════════════════════════════════════
     RENDER SWITCH
     ══════════════════════════════════════════ */

  function renderView() {
    if (state.view === 'grid') renderGrid();
    else renderList();
  }

  /* ══════════════════════════════════════════
     BIND TOOLBAR
     ══════════════════════════════════════════ */

  function bindToolbar() {
    // View toggle
    $$('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.view = btn.getAttribute('data-view');
        Store.set('files-view', state.view);
        $$('[data-view]').forEach(b => b.classList.toggle('is-active', b === btn));
        renderView();
      });
    });

    // Search
    const search = $('#filesSearch');
    if (search) {
      search.addEventListener('input', window.AFM.debounce(e => {
        state.search = e.target.value;
        state.page = 1;
        applyFilters();
        renderView();
      }, 180));
    }

    // Filter chips
    document.addEventListener('click', e => {
      const chip = e.target.closest('[data-filter]');
      if (!chip) return;
      state.filter = chip.getAttribute('data-filter');
      state.page = 1;
      $$('[data-filter]').forEach(c => c.classList.toggle('is-active', c === chip));
      applyFilters();
      renderView();
    });

    // Drawer close
    $('#drawerClose')?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

    // Bulk bar actions
    $('#bulkClear')?.addEventListener('click', clearSelection);
    $('#bulkDownload')?.addEventListener('click', () => {
      Toast.success(`Downloading ${state.selected.size} files`, 'Preparing zip archive…');
    });
    $('#bulkDelete')?.addEventListener('click', async () => {
      const ok = await Modal.confirm({
        title: `Delete ${state.selected.size} items?`,
        message: 'These files will be moved to trash.',
        confirmText: 'Move to trash',
        danger: true,
      });
      if (ok) {
        state.all = state.all.filter(f => !state.selected.has(f.id));
        state.selected.clear();
        Toast.success('Files deleted');
        renderFilterChips();
        applyFilters();
        renderView();
      }
    });
  }

  /* ══════════════════════════════════════════
     INIT
     ══════════════════════════════════════════ */

  function init() {
    state.all = makeFiles();

    // Set initial view button state
    $$('[data-view]').forEach(b => b.classList.toggle('is-active', b.getAttribute('data-view') === state.view));

    renderTree();
    renderFilterChips();
    applyFilters();
    renderView();
    updateBreadcrumb();
    bindToolbar();
    initDragDrop();
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'files') {
    Files.init();
  }
});

window.Files = Files;
```

---

<a id="file-4"></a>

### 📄 File 4/6: `sidebar.js`

| Property | Value |
|----------|-------|
| **Path** | `sidebar.js` |
| **Language** | JavaScript |
| **Size** | 9.7 KB |
| **Lines** | 346 |

```javascript
/* ============================================
   SIDEBAR.JS — Collapsible Sidebar Controller
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Sidebar = (() => {

  /* ── Constants ── */
  const STORE_KEY = 'sidebar-collapsed';
  const MOBILE_BREAKPOINT = 860;

  /* ── State ── */
  let sidebarEl = null;
  let overlayEl = null;
  let collapseBtn = null;
  let mobileMenuBtn = null;
  let mainArea = null;
  let isCollapsed = false;
  let isMobileOpen = false;
  let listeners = [];

  /* ── Private ── */

  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  function applyState(collapsed, animate = true) {
    if (!sidebarEl) return;
    isCollapsed = collapsed;

    if (animate) {
      sidebarEl.style.transition = '';
      mainArea?.style && (mainArea.style.transition = '');
    } else {
      sidebarEl.style.transition = 'none';
      mainArea?.style && (mainArea.style.transition = 'none');
      requestAnimationFrame(() => {
        sidebarEl.style.transition = '';
        mainArea?.style && (mainArea.style.transition = '');
      });
    }

    sidebarEl.classList.toggle('is-collapsed', collapsed);

    // Update collapse button tooltip
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
      collapseBtn.setAttribute('title', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    }

    // Store state (only for desktop)
    if (!isMobile()) {
      AFM?.Store?.set(STORE_KEY, collapsed);
    }

    // Update nav item tooltips
    updateTooltips(collapsed);

    // Notify listeners
    listeners.forEach(fn => {
      try { fn({ collapsed, mobile: isMobile() }); } catch (e) { console.error('[Sidebar]', e); }
    });
  }

  function updateTooltips(collapsed) {
    if (!sidebarEl) return;
    sidebarEl.querySelectorAll('.nav-item').forEach(item => {
      if (collapsed && !isMobile()) {
        const label = item.querySelector('.nav-label');
        if (label) item.setAttribute('data-tooltip', label.textContent.trim());
      } else {
        item.removeAttribute('data-tooltip');
      }
    });
  }

  function openMobile() {
    if (!sidebarEl || !overlayEl) return;
    isMobileOpen = true;
    sidebarEl.classList.add('is-mobile-open');
    overlayEl.classList.add('is-visible');
    document.body.style.overflow = 'hidden';
  }

  function closeMobile() {
    if (!sidebarEl || !overlayEl) return;
    isMobileOpen = false;
    sidebarEl.classList.remove('is-mobile-open');
    overlayEl.classList.remove('is-visible');
    document.body.style.overflow = '';
  }

  function onResize() {
    if (!sidebarEl) return;

    if (isMobile()) {
      // On mobile, always show full sidebar when open (no collapsed state)
      sidebarEl.classList.remove('is-collapsed');
      if (!isMobileOpen) {
        closeMobile();
      }
    } else {
      // On desktop, restore stored collapse preference
      closeMobile();
      const stored = AFM?.Store?.get(STORE_KEY, false);
      applyState(stored, false);
    }
  }

  function buildCollapseBtn() {
    const btn = document.createElement('button');
    btn.className = 'sidebar-collapse-btn';
    btn.setAttribute('aria-label', 'Collapse sidebar');
    btn.setAttribute('title', 'Collapse sidebar');
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`;
    return btn;
  }

  function buildOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    return overlay;
  }

  /* ── Keyboard navigation inside sidebar ── */
  function handleSidebarKeydown(e) {
    if (!sidebarEl) return;

    const navItems = Array.from(sidebarEl.querySelectorAll('.nav-item'));
    const current = document.activeElement;
    const idx = navItems.indexOf(current);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (idx < navItems.length - 1) navItems[idx + 1]?.focus();
        else navItems[0]?.focus();
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (idx > 0) navItems[idx - 1]?.focus();
        else navItems[navItems.length - 1]?.focus();
        break;

      case 'Enter':
      case ' ':
        if (current?.classList.contains('nav-item')) {
          e.preventDefault();
          current.click();
        }
        break;

      case 'Escape':
        if (isMobile() && isMobileOpen) {
          closeMobile();
          mobileMenuBtn?.focus();
        }
        break;
    }
  }

  /* ── Public API ── */

  /** Initialize sidebar interactions */
  function init() {
    sidebarEl = document.querySelector('.sidebar');
    mainArea = document.querySelector('.main-area');
    mobileMenuBtn = document.querySelector('.mobile-menu-btn');

    if (!sidebarEl) {
      console.warn('[Sidebar] .sidebar element not found');
      return;
    }

    // Create collapse button if not present
    collapseBtn = sidebarEl.querySelector('.sidebar-collapse-btn');
    if (!collapseBtn) {
      collapseBtn = buildCollapseBtn();
      sidebarEl.appendChild(collapseBtn);
    }

    // Create overlay for mobile
    overlayEl = document.querySelector('.sidebar-overlay');
    if (!overlayEl) {
      overlayEl = buildOverlay();
      sidebarEl.parentElement.insertBefore(overlayEl, sidebarEl.nextSibling);
    }

    // Restore state on desktop
    if (!isMobile()) {
      const stored = AFM?.Store?.get(STORE_KEY, false);
      applyState(stored, false);
    }

    // ─── Event Bindings ───

    // Collapse toggle
    collapseBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (isMobile()) {
        closeMobile();
      } else {
        applyState(!isCollapsed);
      }
    });

    // Mobile menu button
    mobileMenuBtn?.addEventListener('click', e => {
      e.preventDefault();
      if (isMobileOpen) closeMobile();
      else openMobile();
    });

    // Overlay click → close mobile sidebar
    overlayEl.addEventListener('click', closeMobile);

    // Close mobile sidebar when nav item clicked
    sidebarEl.addEventListener('click', e => {
      const navItem = e.target.closest('.nav-item');
      if (navItem && isMobile() && isMobileOpen) {
        // Small delay for visual feedback
        setTimeout(closeMobile, 150);
      }
    });

    // Keyboard nav
    sidebarEl.addEventListener('keydown', handleSidebarKeydown);

    // Resize handler
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(onResize, 100);
    });

    // Swipe gesture for mobile
    initSwipeGesture();

    // Double-click brand to toggle
    const brand = sidebarEl.querySelector('.brand');
    if (brand) {
      brand.addEventListener('dblclick', e => {
        e.preventDefault();
        if (!isMobile()) applyState(!isCollapsed);
      });
    }
  }

  /** Swipe-from-edge to open, swipe-left to close */
  function initSwipeGesture() {
    let touchStartX = 0;
    let touchStartY = 0;
    let tracking = false;

    document.addEventListener('touchstart', e => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      // Only track if starting from left edge (open) or sidebar is open (close)
      if (touchStartX < 30 || isMobileOpen) {
        tracking = true;
      }
    }, { passive: true });

    document.addEventListener('touchmove', e => {
      if (!tracking || !isMobile()) return;
      // Prevent scrolling while swiping sidebar
    }, { passive: true });

    document.addEventListener('touchend', e => {
      if (!tracking || !isMobile()) { tracking = false; return; }

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = Math.abs(touch.clientY - touchStartY);

      // Require mostly horizontal swipe
      if (dy > Math.abs(dx)) { tracking = false; return; }

      const THRESHOLD = 70;

      if (dx > THRESHOLD && !isMobileOpen && touchStartX < 40) {
        // Swipe right from edge → open
        openMobile();
      } else if (dx < -THRESHOLD && isMobileOpen) {
        // Swipe left → close
        closeMobile();
      }

      tracking = false;
    }, { passive: true });
  }

  /** Toggle sidebar collapsed/expanded */
  function toggle() {
    if (isMobile()) {
      if (isMobileOpen) closeMobile();
      else openMobile();
    } else {
      applyState(!isCollapsed);
    }
  }

  /** Collapse sidebar */
  function collapse() {
    if (!isMobile()) applyState(true);
  }

  /** Expand sidebar */
  function expand() {
    if (isMobile()) openMobile();
    else applyState(false);
  }

  /** Get current collapsed state */
  function getState() {
    return {
      collapsed: isCollapsed,
      mobileOpen: isMobileOpen,
      mobile: isMobile(),
    };
  }

  /** Subscribe to state changes */
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return () => { listeners = listeners.filter(f => f !== fn); };
  }

  return { init, toggle, collapse, expand, getState, onChange };
})();

/* ── Auto-init ── */
document.addEventListener('DOMContentLoaded', () => {
  Sidebar.init();
});

/* Expose globally */
window.Sidebar = Sidebar;
```

---

<a id="file-5"></a>

### 📄 File 5/6: `theme.js`

| Property | Value |
|----------|-------|
| **Path** | `theme.js` |
| **Language** | JavaScript |
| **Size** | 6.7 KB |
| **Lines** | 230 |

```javascript
/* ============================================
   THEME.JS — Light / Dark Theme Toggle System
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Theme = (() => {

  /* ── Constants ── */
  const STORE_KEY = 'theme';
  const THEMES = ['dark', 'light'];
  const DEFAULT = 'dark';
  const TRANSITION_CLASS = 'theme-switching';

  /* ── State ── */
  let current = DEFAULT;
  let listeners = [];

  /* ── Private Methods ── */

  /** Read stored preference or system pref */
  function resolve() {
    const stored = AFM?.Store?.get(STORE_KEY);
    if (stored && THEMES.includes(stored)) return stored;

    // Check system preference
    if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light';
    return DEFAULT;
  }

  /** Apply theme to DOM */
  function apply(theme, animate = true) {
    const root = document.documentElement;
    const prev = current;

    // Short-circuit if already set
    if (prev === theme && root.getAttribute('data-theme') === theme) return;

    // Add transition-suppression class briefly when animating
    if (animate) {
      root.classList.add(TRANSITION_CLASS);
    }

    // Set the attribute
    root.setAttribute('data-theme', theme);
    current = theme;

    // Persist
    AFM?.Store?.set(STORE_KEY, theme);

    // Update meta theme-color for mobile browsers
    updateMetaColor(theme);

    // Update all toggle controls
    updateToggles(theme);

    // Update theme picker cards (settings page)
    updatePickerCards(theme);

    // Remove suppression after next frame
    if (animate) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          root.classList.remove(TRANSITION_CLASS);
        });
      });
    }

    // Notify listeners
    if (prev !== theme) {
      listeners.forEach(fn => {
        try { fn(theme, prev); } catch (e) { console.error('[Theme] listener error', e); }
      });
    }
  }

  /** Update the <meta name="theme-color"> for mobile browser chrome */
  function updateMetaColor(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#0a0a0a' : '#fafafa';
  }

  /** Sync toggle button states */
  function updateToggles(theme) {
    const isDark = theme === 'dark';

    // Theme toggle switches
    document.querySelectorAll('.theme-toggle').forEach(toggle => {
      toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      toggle.setAttribute('title', isDark ? 'Light mode' : 'Dark mode');
    });

    // Icon-based toggle buttons
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      const sunIcon = btn.querySelector('.icon-sun');
      const moonIcon = btn.querySelector('.icon-moon');
      if (sunIcon) sunIcon.style.display = isDark ? 'none' : 'block';
      if (moonIcon) moonIcon.style.display = isDark ? 'block' : 'none';
    });

    // Labeled text toggles
    document.querySelectorAll('.theme-label-text').forEach(el => {
      el.textContent = isDark ? 'Dark' : 'Light';
    });
  }

  /** Highlight active card in settings theme picker */
  function updatePickerCards(theme) {
    document.querySelectorAll('.theme-option').forEach(card => {
      const cardTheme = card.getAttribute('data-theme-value');
      card.classList.toggle('is-active', cardTheme === theme);
    });
  }

  /** Handle system preference change */
  function onSystemChange(e) {
    // Only auto-switch if the user hasn't explicitly set a preference
    const stored = AFM?.Store?.get(STORE_KEY);
    if (!stored) {
      apply(e.matches ? 'light' : 'dark');
    }
  }

  /* ── Public API ── */

  /** Initialize the theme system */
  function init() {
    current = resolve();
    apply(current, false);

    // Listen for system preference changes
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    if (mq?.addEventListener) {
      mq.addEventListener('change', onSystemChange);
    } else if (mq?.addListener) {
      mq.addListener(onSystemChange);
    }

    // Bind toggle buttons
    bindToggles();

    // Bind theme picker cards (settings page)
    bindPickerCards();

    // Listen for storage changes from other tabs
    window.addEventListener('storage', e => {
      if (e.key === (AFM?.Store?.prefix || 'afm:') + STORE_KEY) {
        const newTheme = JSON.parse(e.newValue);
        if (newTheme && THEMES.includes(newTheme)) apply(newTheme);
      }
    });
  }

  /** Bind click handlers for toggle buttons */
  function bindToggles() {
    document.addEventListener('click', e => {
      const toggle = e.target.closest('.theme-toggle, [data-theme-toggle]');
      if (!toggle) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
  }

  /** Bind click handlers for theme picker cards */
  function bindPickerCards() {
    document.addEventListener('click', e => {
      const card = e.target.closest('.theme-option[data-theme-value]');
      if (!card) return;
      const val = card.getAttribute('data-theme-value');

      if (val === 'system') {
        // Clear stored pref and use system
        AFM?.Store?.remove(STORE_KEY);
        const systemTheme = window.matchMedia?.('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
        apply(systemTheme);
        // Still mark system card as active
        document.querySelectorAll('.theme-option').forEach(c => {
          c.classList.toggle('is-active', c.getAttribute('data-theme-value') === 'system');
        });
      } else if (THEMES.includes(val)) {
        apply(val);
      }
    });
  }

  /** Toggle between light/dark */
  function toggle() {
    apply(current === 'dark' ? 'light' : 'dark');
  }

  /** Set a specific theme */
  function set(theme) {
    if (THEMES.includes(theme)) apply(theme);
  }

  /** Get current theme */
  function get() {
    return current;
  }

  /** Check if dark */
  function isDark() {
    return current === 'dark';
  }

  /** Subscribe to theme changes */
  function onChange(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return () => { listeners = listeners.filter(f => f !== fn); };
  }

  return { init, toggle, set, get, isDark, onChange };
})();

/* ── Auto-init ── */
document.addEventListener('DOMContentLoaded', () => {
  Theme.init();
});

/* Expose globally */
window.Theme = Theme;
```

---

<a id="file-6"></a>

### 📄 File 6/6: `uploads.js`

| Property | Value |
|----------|-------|
| **Path** | `uploads.js` |
| **Language** | JavaScript |
| **Size** | 28.3 KB |
| **Lines** | 785 |

```javascript
/* ============================================
   UPLOADS.JS — Upload Manager Page Logic
   Admin Files Manager — Dimension Style
   ============================================ */

'use strict';

const Uploads = (() => {

  const { $, $$, el, icon, Format, Toast, Modal, resolveType, Store, uid, clamp, randBetween } = window.AFM;

  /* ══════════════════════════════════════════
     STATE
     ══════════════════════════════════════════ */

  const state = {
    queue: [],             // { id, name, size, uploaded, speed, status, ext, type, error, startTime, endTime }
    concurrency: 3,
    activeCount: 0,
    destination: '/releases/2025',
    preset: 'balanced',
    options: {
      autoStart: true,
      overwrite: false,
      preservePath: true,
      compress: false,
    },
    metrics: {
      totalFiles: 0,
      totalUploaded: 0,
      totalBytes: 0,
      bytesUploaded: 0,
      speedHistory: new Array(20).fill(0),
    },
    ticker: null,
  };

  /* ══════════════════════════════════════════
     PRESETS
     ══════════════════════════════════════════ */

  const presets = [
    {
      key: 'fast',
      name: 'Fast Transfer',
      desc: 'Maximum speed, no processing',
      icon: 'zap',
      tags: ['no-compress', 'parallel-8'],
      concurrency: 8,
      compress: false,
    },
    {
      key: 'balanced',
      name: 'Balanced',
      desc: 'Recommended for most files',
      icon: 'sliders',
      tags: ['auto-compress', 'parallel-3'],
      concurrency: 3,
      compress: false,
    },
    {
      key: 'optimize',
      name: 'Optimize Storage',
      desc: 'Compress & deduplicate before upload',
      icon: 'package',
      tags: ['compress', 'dedupe'],
      concurrency: 2,
      compress: true,
    },
    {
      key: 'secure',
      name: 'Secure Upload',
      desc: 'Client-side encryption enabled',
      icon: 'shield',
      tags: ['encrypted', 'verified'],
      concurrency: 2,
      compress: false,
    },
  ];

  /* ══════════════════════════════════════════
     DROPZONE
     ══════════════════════════════════════════ */

  function initDropzone() {
    const dz = $('#dropzone');
    const input = $('#fileInput');
    const folderInput = $('#folderInput');
    if (!dz) return;

    // Click → open file picker
    dz.addEventListener('click', e => {
      if (e.target.closest('button, a')) return;
      input?.click();
    });

    // Browse buttons
    $('#browseFiles')?.addEventListener('click', e => { e.stopPropagation(); input?.click(); });
    $('#browseFolder')?.addEventListener('click', e => { e.stopPropagation(); folderInput?.click(); });

    // File input change
    input?.addEventListener('change', e => {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    });
    folderInput?.addEventListener('change', e => {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    });

    // Drag & drop
    ['dragenter', 'dragover'].forEach(evt => {
      dz.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.types.includes('Files')) {
          dz.classList.add('is-dragover');
        }
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      dz.addEventListener(evt, e => {
        e.preventDefault();
        e.stopPropagation();
        if (evt === 'dragleave' && dz.contains(e.relatedTarget)) return;
        dz.classList.remove('is-dragover');
      });
    });

    dz.addEventListener('drop', e => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) addFiles(files);
    });

    // Whole-window drag & drop
    let winDragCount = 0;
    window.addEventListener('dragenter', e => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      winDragCount++;
      dz.classList.add('is-dragover');
    });
    window.addEventListener('dragleave', () => {
      winDragCount--;
      if (winDragCount <= 0) { winDragCount = 0; dz.classList.remove('is-dragover'); }
    });
    window.addEventListener('drop', () => { winDragCount = 0; dz.classList.remove('is-dragover'); });
    window.addEventListener('dragover', e => e.preventDefault());
  }

  /* ══════════════════════════════════════════
     ADD FILES → QUEUE
     ══════════════════════════════════════════ */

  function addFiles(files) {
    if (!files || !files.length) return;

    const MAX_SIZE = 5 * 1024 * 1024 * 1024; // 5 GB
    let added = 0;
    let skipped = 0;

    files.forEach(f => {
      if (f.size > MAX_SIZE) { skipped++; return; }
      const type = resolveType(f.name);
      state.queue.push({
        id: uid('up'),
        name: f.name,
        size: f.size,
        uploaded: 0,
        speed: 0,
        status: 'queued',                // queued | uploading | paused | done | failed
        type: type.key,
        icon: type.icon,
        ext: type.ext,
        error: null,
        startTime: null,
        endTime: null,
        file: f, // reference (not used for real upload here)
      });
      added++;
    });

    if (added) {
      state.metrics.totalFiles += added;
      state.metrics.totalBytes += files.reduce((s, f) => s + (f.size <= MAX_SIZE ? f.size : 0), 0);
      Toast.success(`${added} file${added !== 1 ? 's' : ''} added to queue`);
      renderQueue();
      renderMetrics();
      if (state.options.autoStart) startUploads();
    }

    if (skipped) {
      Toast.warning(`${skipped} file${skipped !== 1 ? 's' : ''} skipped`, 'Files exceed 5 GB maximum');
    }
  }

  /* ══════════════════════════════════════════
     SIMULATED UPLOAD ENGINE
     ══════════════════════════════════════════ */

  function startUploads() {
    if (state.ticker) return;
    state.ticker = setInterval(tick, 200);
    fillActive();
  }

  function fillActive() {
    while (state.activeCount < state.concurrency) {
      const next = state.queue.find(q => q.status === 'queued');
      if (!next) return;
      next.status = 'uploading';
      next.startTime = Date.now();
      state.activeCount++;
    }
  }

  function tick() {
    let anyActive = false;
    const now = Date.now();

    state.queue.forEach(item => {
      if (item.status !== 'uploading') return;
      anyActive = true;

      // Simulated speed 2–30 MB/s per file, scaled inversely by size
      const baseSpeed = clamp(item.size / 10, 2_000_000, 30_000_000);
      const jitter = randBetween(0.7, 1.3);
      const chunk = (baseSpeed * jitter) * 0.2; // 200ms tick

      item.uploaded = Math.min(item.size, item.uploaded + chunk);
      item.speed = baseSpeed * jitter;

      // 1.5% chance of random failure past 30% (feels realistic, not annoying)
      if (item.uploaded > item.size * 0.3 && item.uploaded < item.size * 0.95) {
        if (Math.random() < 0.0015) {
          item.status = 'failed';
          item.error = 'Connection reset';
          item.endTime = now;
          state.activeCount--;
          renderQueueItem(item.id);
          fillActive();
          return;
        }
      }

      if (item.uploaded >= item.size) {
        item.uploaded = item.size;
        item.status = 'done';
        item.endTime = now;
        item.speed = 0;
        state.activeCount--;
        state.metrics.totalUploaded++;
        renderQueueItem(item.id);
        fillActive();
        Toast.success('Upload complete', item.name, 2400);
      } else {
        updateItemProgress(item);
      }
    });

    // Update global speed history
    const totalSpeed = state.queue
      .filter(q => q.status === 'uploading')
      .reduce((s, q) => s + q.speed, 0);
    state.metrics.speedHistory.shift();
    state.metrics.speedHistory.push(totalSpeed);

    // Recompute bytes uploaded
    state.metrics.bytesUploaded = state.queue.reduce((s, q) => s + q.uploaded, 0);

    renderMetrics();
    renderGlobalProgress();
    renderQueueStats();

    // Stop ticker when queue is idle
    if (!anyActive && !state.queue.some(q => q.status === 'queued')) {
      clearInterval(state.ticker);
      state.ticker = null;
    }
  }

  /* ══════════════════════════════════════════
     ITEM ACTIONS
     ══════════════════════════════════════════ */

  function pauseItem(id) {
    const item = state.queue.find(q => q.id === id);
    if (!item) return;
    if (item.status === 'uploading') {
      item.status = 'paused';
      state.activeCount--;
      fillActive();
    } else if (item.status === 'paused' || item.status === 'failed') {
      item.status = 'queued';
      item.error = null;
      if (state.ticker == null) startUploads();
      else fillActive();
    }
    renderQueueItem(id);
  }

  function retryItem(id) {
    const item = state.queue.find(q => q.id === id);
    if (!item) return;
    item.status = 'queued';
    item.error = null;
    item.uploaded = 0;
    if (state.ticker == null) startUploads();
    else fillActive();
    renderQueueItem(id);
  }

  function cancelItem(id) {
    const item = state.queue.find(q => q.id === id);
    if (!item) return;
    if (item.status === 'uploading') state.activeCount--;
    state.queue = state.queue.filter(q => q.id !== id);
    renderQueue();
    renderMetrics();
    fillActive();
  }

  function clearCompleted() {
    state.queue = state.queue.filter(q => q.status !== 'done');
    renderQueue();
    renderMetrics();
    Toast.info('Completed uploads cleared');
  }

  function retryAllFailed() {
    let n = 0;
    state.queue.forEach(item => {
      if (item.status === 'failed') {
        item.status = 'queued';
        item.error = null;
        item.uploaded = 0;
        n++;
      }
    });
    if (n) {
      Toast.info(`Retrying ${n} failed upload${n !== 1 ? 's' : ''}`);
      if (state.ticker == null) startUploads();
      else fillActive();
      renderQueue();
    }
  }

  function pauseAll() {
    state.queue.forEach(item => {
      if (item.status === 'uploading') {
        item.status = 'paused';
        state.activeCount--;
      }
    });
    renderQueue();
  }

  function resumeAll() {
    state.queue.forEach(item => {
      if (item.status === 'paused') item.status = 'queued';
    });
    if (state.ticker == null) startUploads();
    else fillActive();
    renderQueue();
  }

  async function cancelAll() {
    if (!state.queue.length) return;
    const ok = await Modal.confirm({
      title: 'Cancel all uploads?',
      message: 'This will remove all queued and active uploads. Completed files will remain uploaded.',
      confirmText: 'Cancel all',
      danger: true,
    });
    if (!ok) return;
    state.queue = state.queue.filter(q => q.status === 'done');
    state.activeCount = 0;
    if (state.ticker) { clearInterval(state.ticker); state.ticker = null; }
    renderQueue();
    renderMetrics();
    Toast.info('All pending uploads cancelled');
  }

  /* ══════════════════════════════════════════
     RENDER — QUEUE
     ══════════════════════════════════════════ */

  function renderQueue() {
    const wrap = $('#queueList');
    if (!wrap) return;

    if (!state.queue.length) {
      wrap.innerHTML = `
        <div class="empty-state" style="padding:48px 24px;">
          <div class="empty-icon">${icon('inbox', 26)}</div>
          <div class="empty-title">Upload queue is empty</div>
          <div class="empty-desc">Drop files anywhere on this page or click the dropzone to browse.</div>
        </div>
      `;
      renderQueueStats();
      renderGlobalProgress();
      return;
    }

    wrap.innerHTML = state.queue.map(item => renderItemHTML(item)).join('');
    bindQueueActions();
    renderQueueStats();
    renderGlobalProgress();
  }

  function renderItemHTML(item) {
    const pct = item.size ? (item.uploaded / item.size) * 100 : 0;
    const t = resolveType(item.name);

    let statusEl, timeInfo, actions;

    switch (item.status) {
      case 'uploading': {
        const remaining = item.speed ? (item.size - item.uploaded) / item.speed : 0;
        statusEl = `<span class="qi-status uploading">Uploading</span>`;
        timeInfo = `${Format.bytes(item.uploaded)} of ${Format.bytes(item.size)}
                    <span class="sep"></span> ${Format.speed(item.speed)}
                    <span class="sep"></span> ${Format.duration(remaining)} left`;
        actions = `
          <button class="btn-icon btn-icon-sm keep-mobile" data-act="pause" data-id="${item.id}" data-tip="Pause">${icon('pause', 15)}</button>
          <button class="btn-icon btn-icon-sm" data-act="cancel" data-id="${item.id}" data-tip="Cancel">${icon('x', 15)}</button>
        `;
        break;
      }
      case 'paused':
        statusEl = `<span class="qi-status paused">Paused</span>`;
        timeInfo = `${Format.bytes(item.uploaded)} of ${Format.bytes(item.size)} <span class="sep"></span> Paused by user`;
        actions = `
          <button class="btn-icon btn-icon-sm keep-mobile" data-act="pause" data-id="${item.id}" data-tip="Resume">${icon('play', 15)}</button>
          <button class="btn-icon btn-icon-sm" data-act="cancel" data-id="${item.id}" data-tip="Cancel">${icon('x', 15)}</button>
        `;
        break;
      case 'done':
        statusEl = `<span class="qi-status done">Complete</span>`;
        timeInfo = `${Format.bytes(item.size)} <span class="sep"></span> Uploaded in ${Format.duration((item.endTime - item.startTime) / 1000)}`;
        actions = `
          <button class="btn-icon btn-icon-sm" data-act="cancel" data-id="${item.id}" data-tip="Remove">${icon('x', 15)}</button>
        `;
        break;
      case 'failed':
        statusEl = `<span class="qi-status failed">Failed</span>`;
        timeInfo = `<span class="err">${item.error || 'Upload failed'}</span> <span class="sep"></span> ${Format.bytes(item.uploaded)} of ${Format.bytes(item.size)}`;
        actions = `
          <button class="btn-icon btn-icon-sm keep-mobile" data-act="retry" data-id="${item.id}" data-tip="Retry">${icon('refresh', 15)}</button>
          <button class="btn-icon btn-icon-sm" data-act="cancel" data-id="${item.id}" data-tip="Remove">${icon('x', 15)}</button>
        `;
        break;
      default: // queued
        statusEl = `<span class="qi-status queued">Queued</span>`;
        timeInfo = `${Format.bytes(item.size)} <span class="sep"></span> Waiting for slot`;
        actions = `
          <button class="btn-icon btn-icon-sm" data-act="cancel" data-id="${item.id}" data-tip="Remove">${icon('x', 15)}</button>
        `;
    }

    const stateClass = {
      uploading: 'is-uploading',
      done: 'is-done',
      failed: 'is-failed',
      paused: 'is-paused',
    }[item.status] || '';

    return `
      <div class="queue-item ${stateClass}" data-item-id="${item.id}">
        <div class="qi-icon ftype-icon ${t.key}">${icon(item.icon, 17)}</div>
        <div class="qi-body">
          <div class="qi-top">
            <div class="qi-name">${item.name}</div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
              ${statusEl}
              <div class="qi-pct">${pct.toFixed(0)}%</div>
            </div>
          </div>
          <div class="qi-bar"><div class="qi-fill" style="width:${pct}%"></div></div>
          <div class="qi-meta">${timeInfo}</div>
        </div>
        <div class="qi-actions">${actions}</div>
      </div>
    `;
  }

  function renderQueueItem(id) {
    const item = state.queue.find(q => q.id === id);
    if (!item) return;
    const node = document.querySelector(`[data-item-id="${id}"]`);
    if (!node) { renderQueue(); return; }
    const fresh = el('div');
    fresh.innerHTML = renderItemHTML(item);
    node.replaceWith(fresh.firstElementChild);
    bindQueueActions();
  }

  function updateItemProgress(item) {
    const node = document.querySelector(`[data-item-id="${item.id}"]`);
    if (!node) return;
    const pct = (item.uploaded / item.size) * 100;
    const fill = node.querySelector('.qi-fill');
    const pctEl = node.querySelector('.qi-pct');
    const meta = node.querySelector('.qi-meta');
    if (fill) fill.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct.toFixed(0) + '%';
    if (meta && item.status === 'uploading') {
      const remaining = item.speed ? (item.size - item.uploaded) / item.speed : 0;
      meta.innerHTML = `${Format.bytes(item.uploaded)} of ${Format.bytes(item.size)}
                       <span class="sep"></span> ${Format.speed(item.speed)}
                       <span class="sep"></span> ${Format.duration(remaining)} left`;
    }
  }

  function bindQueueActions() {
    $$('#queueList [data-act]').forEach(btn => {
      btn.onclick = () => {
        const act = btn.getAttribute('data-act');
        const id = btn.getAttribute('data-id');
        if (act === 'pause') pauseItem(id);
        else if (act === 'retry') retryItem(id);
        else if (act === 'cancel') cancelItem(id);
      };
    });
  }

  /* ══════════════════════════════════════════
     STATS & GLOBAL PROGRESS
     ══════════════════════════════════════════ */

  function renderQueueStats() {
    const wrap = $('#queueStats');
    if (!wrap) return;

    const counts = {
      uploading: state.queue.filter(q => q.status === 'uploading').length,
      queued:    state.queue.filter(q => q.status === 'queued').length,
      done:      state.queue.filter(q => q.status === 'done').length,
      failed:    state.queue.filter(q => q.status === 'failed').length,
    };

    wrap.innerHTML = `
      <div class="qstat"><span class="qstat-dot active"></span> <span class="val">${counts.uploading}</span> active</div>
      <div class="qstat"><span class="qstat-dot queued"></span> <span class="val">${counts.queued}</span> queued</div>
      <div class="qstat"><span class="qstat-dot done"></span> <span class="val">${counts.done}</span> done</div>
      ${counts.failed ? `<div class="qstat"><span class="qstat-dot failed"></span> <span class="val">${counts.failed}</span> failed</div>` : ''}
    `;
  }

  function renderGlobalProgress() {
    const wrap = $('#queueGlobal');
    if (!wrap) return;

    if (!state.queue.length) {
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';

    const totalBytes = state.queue.reduce((s, q) => s + q.size, 0);
    const uploaded   = state.queue.reduce((s, q) => s + q.uploaded, 0);
    const pct        = totalBytes ? (uploaded / totalBytes) * 100 : 0;
    const totalSpeed = state.queue
      .filter(q => q.status === 'uploading')
      .reduce((s, q) => s + q.speed, 0);
    const remainingBytes = totalBytes - uploaded;
    const eta = totalSpeed ? remainingBytes / totalSpeed : null;

    wrap.innerHTML = `
      <div class="qg-top">
        <div class="qg-label">
          ${icon('uploadCloud', 15)}
          Overall progress
        </div>
        <div class="qg-right">
          <span>${Format.bytes(uploaded)} / ${Format.bytes(totalBytes)}</span>
          ${totalSpeed ? `<span>·</span><span>${Format.speed(totalSpeed)}</span>` : ''}
          ${eta ? `<span>·</span><span>${Format.duration(eta)} left</span>` : ''}
          <span class="qg-pct">${pct.toFixed(0)}%</span>
        </div>
      </div>
      <div class="progress">
        <div class="progress-bar ${totalSpeed > 0 ? 'is-striped' : ''}" style="width:${pct}%"></div>
      </div>
    `;
  }

  /* ══════════════════════════════════════════
     METRICS TILES
     ══════════════════════════════════════════ */

  function renderMetrics() {
    const wrap = $('#uploadMetrics');
    if (!wrap) return;

    const totalSpeed = state.queue
      .filter(q => q.status === 'uploading')
      .reduce((s, q) => s + q.speed, 0);

    const uploadedCount = state.queue.filter(q => q.status === 'done').length;
    const totalBytesUp  = state.queue
      .filter(q => q.status === 'done')
      .reduce((s, q) => s + q.size, 0);
    const activeCount = state.queue.filter(q => q.status === 'uploading').length;

    const maxSpeed = Math.max(...state.metrics.speedHistory, 1);
    const bars = state.metrics.speedHistory.map(v => {
      const h = clamp((v / maxSpeed) * 100, 6, 100);
      return `<div class="speed-bar" style="height:${h}%"></div>`;
    }).join('');

    const tiles = [
      {
        icon: 'zap',
        value: totalSpeed > 0 ? Format.speed(totalSpeed) : '—',
        label: 'Current speed',
        graph: true,
      },
      {
        icon: 'activity',
        value: activeCount,
        label: 'Active uploads',
      },
      {
        icon: 'checkCircle',
        value: uploadedCount,
        label: 'Uploaded today',
      },
      {
        icon: 'hardDrive',
        value: Format.bytes(totalBytesUp),
        label: 'Data transferred',
      },
    ];

    wrap.innerHTML = tiles.map(t => `
      <div class="metric-tile">
        <div class="metric-ico">${icon(t.icon, 16)}</div>
        <div class="metric-body">
          <div class="metric-value">${t.value}</div>
          <div class="metric-label">${t.label}</div>
        </div>
        ${t.graph ? `<div class="speed-graph">${bars}</div>` : ''}
      </div>
    `).join('');
  }

  /* ══════════════════════════════════════════
     PRESETS
     ══════════════════════════════════════════ */

  function renderPresets() {
    const wrap = $('#presetGrid');
    if (!wrap) return;

    wrap.innerHTML = presets.map(p => `
      <button class="preset-card ${state.preset === p.key ? 'is-active' : ''}" data-preset="${p.key}">
        <div class="preset-top">
          <div class="preset-ico">${icon(p.icon, 15)}</div>
          <div class="preset-name">${p.name}</div>
        </div>
        <div class="preset-desc">${p.desc}</div>
        <div class="preset-tags">
          ${p.tags.map(t => `<span class="preset-tag">${t}</span>`).join('')}
        </div>
      </button>
    `).join('');

    wrap.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-preset');
        const p = presets.find(x => x.key === key);
        if (!p) return;
        state.preset = key;
        state.concurrency = p.concurrency;
        state.options.compress = p.compress;
        wrap.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('is-active', b === btn));
        Toast.info(`Preset: ${p.name}`, `${p.concurrency} parallel · ${p.compress ? 'compression on' : 'no compression'}`);
      });
    });
  }

  /* ══════════════════════════════════════════
     RECENT UPLOADS STRIP
     ══════════════════════════════════════════ */

  function renderRecent() {
    const wrap = $('#recentUploads');
    if (!wrap) return;

    const recent = [
      { name: 'launch-video.mp4',       size: 328 * 1024 * 1024, time: Date.now() - 6 * 60 * 1000 },
      { name: 'brand-kit.zip',          size: 84  * 1024 * 1024, time: Date.now() - 22 * 60 * 1000 },
      { name: 'annual-report.pdf',      size: 12  * 1024 * 1024, time: Date.now() - 55 * 60 * 1000 },
      { name: 'user-research.docx',     size: 4.2 * 1024 * 1024, time: Date.now() - 2 * 3600 * 1000 },
      { name: 'ui-mockup.png',          size: 3.8 * 1024 * 1024, time: Date.now() - 3 * 3600 * 1000 },
      { name: 'api-reference.zip',      size: 45  * 1024 * 1024, time: Date.now() - 5 * 3600 * 1000 },
      { name: 'podcast-episode-14.mp3', size: 68  * 1024 * 1024, time: Date.now() - 9 * 3600 * 1000 },
    ];

    wrap.innerHTML = recent.map(r => {
      const t = resolveType(r.name);
      return `
        <div class="recent-card">
          <div class="recent-thumb">
            <div class="ftype-icon ${t.key}">${icon(t.icon, 18)}</div>
          </div>
          <div class="recent-name">${r.name}</div>
          <div class="recent-meta">${Format.bytes(r.size)} · ${Format.relative(r.time)}</div>
        </div>
      `;
    }).join('');
  }

  /* ══════════════════════════════════════════
     DESTINATION / OPTIONS
     ══════════════════════════════════════════ */

  function initDestination() {
    // Change destination folder
    $('#changeDestination')?.addEventListener('click', async () => {
      const path = await Modal.prompt({
        title: 'Change destination folder',
        label: 'Folder path',
        value: state.destination,
        placeholder: '/path/to/folder',
        confirmText: 'Set destination',
      });
      if (path) {
        state.destination = path;
        const el = $('#destPath');
        if (el) el.innerHTML = `${icon('folder', 13)} ${path}`;
        Toast.success('Destination updated', path);
      }
    });

    // Option toggles
    $$('[data-option]').forEach(input => {
      input.checked = state.options[input.getAttribute('data-option')] ?? false;
      input.addEventListener('change', () => {
        state.options[input.getAttribute('data-option')] = input.checked;
      });
    });
  }

  /* ══════════════════════════════════════════
     BIND FOOTER / GLOBAL ACTIONS
     ══════════════════════════════════════════ */

  function bindGlobalActions() {
    $('#pauseAll')?.addEventListener('click',   pauseAll);
    $('#resumeAll')?.addEventListener('click',  resumeAll);
    $('#retryFailed')?.addEventListener('click', retryAllFailed);
    $('#clearDone')?.addEventListener('click',  clearCompleted);
    $('#cancelAll')?.addEventListener('click',  cancelAll);
  }

  /* ══════════════════════════════════════════
     INIT
     ══════════════════════════════════════════ */

  function init() {
    initDropzone();
    initDestination();
    renderPresets();
    renderRecent();
    renderMetrics();
    renderQueue();
    bindGlobalActions();

    // Set destination path label
    const dp = $('#destPath');
    if (dp) dp.innerHTML = `${icon('folder', 13)} ${state.destination}`;
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page === 'uploads') {
    Uploads.init();
  }
});

window.Uploads = Uploads;
```

---

## ✅ End of Project Code

> Total files extracted: **6**
> Total lines of code: **3142**
> Generated by: **Project Code Extractor v2.1**


