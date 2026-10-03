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
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  panelLeft: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronUp: '<path d="m18 15-6-6-6 6"/>',
  chevronsUpDown: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  moreVertical: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  moreHorizontal: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',

  // Files & folders
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  folderOpen: '<path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H22l-3.1 6.2A2 2 0 0 1 17.1 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>',
  folderPlus: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M12 10v6"/><path d="M9 13h6"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  video: '<path d="m16 13 5.22 3.03a.5.5 0 0 0 .78-.42V8.39a.5.5 0 0 0-.78-.42L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  archive: '<rect x="2" y="4" width="20" height="5" rx="2"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  hardDrive: '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',

  // Actions
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  uploadCloud: '<path d="M12 13v8"/><path d="M4 14.9A5 5 0 0 1 6.5 5.5a7 7 0 0 1 13.1 2.1A4.5 4.5 0 0 1 18 16.5"/><path d="m8 17 4-4 4 4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  move: '<path d="M5 9 2 12l3 3"/><path d="M9 5l3-3 3 3"/><path d="M15 19l-3 3-3-3"/><path d="M19 9l3 3-3 3"/><path d="M2 12h20"/><path d="M12 2v20"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  rotateCw: '<path d="M21 12a9 9 0 1 1-3.1-6.8"/><path d="M21 3v6h-6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',

  // UI
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  sort: '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  list: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  sparkle: '<path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="M12 7.5 13.5 12 18 13.5 13.5 15 12 19.5 10.5 15 6 13.5 10.5 12Z"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
  trending: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  trendingDown: '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  barChart: '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
  pieChart: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  server: '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  wifi: '<path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 20 0"/><line x1="12" x2="12.01" y1="20" y2="20"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  xCircle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  externalLink: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  helpCircle: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
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

const $ = (sel, ctx = document) => ctx.querySelector(sel);
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
  image: { exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'heic'], icon: 'image', label: 'Image' },
  video: { exts: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'm4v'], icon: 'video', label: 'Video' },
  audio: { exts: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma'], icon: 'music', label: 'Audio' },
  document: { exts: ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'md'], icon: 'fileText', label: 'Document' },
  archive: { exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'dmg'], icon: 'archive', label: 'Archive' },
  code: { exts: ['js', 'ts', 'jsx', 'tsx', 'html', 'css', 'scss', 'json', 'xml', 'php', 'py', 'java', 'go', 'rs', 'sh', 'yml', 'yaml', 'sql'], icon: 'code', label: 'Code' },
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
/* ══════════════════════════════════════════
   TOAST SYSTEM — Enterprise Lifecycle Architecture
   ══════════════════════════════════════════ */

const Toast = (() => {
  let stack = null;
  const EXIT_ANIMATION_MS = 250;
  // A burst (eight uploads finishing together) must not bury the page: past this
  // many visible toasts the oldest is dismissed to make room for the newest.
  const MAX_VISIBLE = 4;
  const activeToasts = new Map();
  let toastCounter = 0;

  function ensureStack() {
    if (!stack) {
      stack = $('.toast-stack') || el('div', { class: 'toast-stack', 'aria-live': 'polite' });
      if (!stack.parentElement) document.body.appendChild(stack);

      stack.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.toast-close, [data-toast-dismiss]');
        if (closeBtn) {
          const toastNode = closeBtn.closest('.toast');
          if (toastNode) dismiss(toastNode);
        }
      });

      stack.addEventListener('mouseenter', (e) => {
        const toastNode = e.target.closest('.toast');
        if (toastNode) pause(toastNode);
      }, true);

      stack.addEventListener('mouseleave', (e) => {
        const toastNode = e.target.closest('.toast');
        if (toastNode) resume(toastNode);
      }, true);
    }
    return stack;
  }

  const iconFor = {
    success: 'checkCircle',
    error: 'xCircle',
    warning: 'alert',
    info: 'info',
  };

  function dismiss(node) {
    const item = activeToasts.get(node);
    if (!item || item.state === 'exiting') return;

    item.state = 'exiting';
    if (item.timer) clearTimeout(item.timer);

    node.dataset.state = 'exiting';
    node.classList.add('is-leaving');

    setTimeout(() => {
      activeToasts.delete(node);
      node.remove();
    }, EXIT_ANIMATION_MS);
  }

  function pause(node) {
    const item = activeToasts.get(node);
    if (!item || item.state !== 'active' || !item.timer) return;

    item.state = 'paused';
    clearTimeout(item.timer);
    item.timer = null;
    const elapsed = Date.now() - item.startTime;
    item.remaining = Math.max(0, item.duration - elapsed);
  }

  function resume(node) {
    const item = activeToasts.get(node);
    if (!item || item.state !== 'paused' || item.remaining <= 0) return;

    item.state = 'active';
    item.startTime = Date.now();
    item.duration = item.remaining;
    item.timer = setTimeout(() => dismiss(node), item.remaining);
  }

  function show(type, title, msg = '', duration = 3800) {
    const container = ensureStack();
    const id = ++toastCounter;

    const node = el('div', {
      class: `toast ${type}`,
      role: 'status',
      'data-toast-id': id,
      'data-state': 'entering'
    }, `
      <div class="toast-icon">${icon(iconFor[type] || 'info', 15)}</div>
      <div class="toast-content">
        <div class="toast-title">${escapeHtml(title)}</div>
        ${msg ? `<div class="toast-msg">${escapeHtml(msg)}</div>` : ''}
      </div>
      <button class="toast-close" aria-label="Dismiss">${icon('x', 14)}</button>
    `);

    container.appendChild(node);

    const visible = [...activeToasts.entries()].filter(([, t]) => t.state !== 'exiting');
    visible.slice(0, Math.max(0, visible.length + 1 - MAX_VISIBLE)).forEach(([n]) => dismiss(n));

    requestAnimationFrame(() => {
      node.dataset.state = 'active';
    });

    const item = {
      id,
      node,
      state: 'active',
      duration,
      remaining: duration,
      startTime: Date.now(),
      timer: null
    };

    if (duration > 0) {
      item.timer = setTimeout(() => dismiss(node), duration);
    }

    activeToasts.set(node, item);

    return { dismiss: () => dismiss(node) };
  }

  return {
    success: (t, m, d) => show('success', t, m, d),
    error: (t, m, d) => show('error', t, m, d),
    warning: (t, m, d) => show('warning', t, m, d),
    info: (t, m, d) => show('info', t, m, d),
    dismiss,
    MAX_VISIBLE,
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
    const px = Math.min(x, window.innerWidth - rect.width - 12);
    const py = Math.min(y, window.innerHeight - rect.height - 12);
    menu.style.left = `${Math.max(8, px)}px`;
    menu.style.top = `${Math.max(8, py)}px`;

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
    try { localStorage.removeItem(this.prefix + key); } catch { }
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
    r.style.top = `${e.clientY - rect.top - size / 2}px`;
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
   SIDEBAR STATE — pure resolvers (no DOM)
   ══════════════════════════════════════════ */

/*
 * The sidebar volume card and identity block render exactly one of two states:
 * a measurement, or an explicit absence. There is no third state that renders a
 * figure - "0.0%" and "0 B of 0 B" are the dangerous outputs, because a zero
 * reads as a real reading. Whenever the server did not supply the numbers, the
 * UI says so instead of inventing them.
 */

// Rendered in place of a figure that was not measured.
const UNAVAILABLE_MARK = '—';
const UNAVAILABLE_VOLUME_META = 'Volume usage unavailable';
const UNAVAILABLE_IDENTITY_NAME = 'Unknown';
const UNAVAILABLE_IDENTITY_ROLE = 'Environment unavailable';

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Decide what the sidebar volume card shows, from a `GET /api/dashboard/summary`
 * `storage` payload. Pure - no DOM, no request - so it can be reasoned about
 * without a browser.
 * @param {object|null} storage - {treeBytes, usedBytes, totalBytes, volumeAvailable, truncated}
 * @returns {{available: boolean, pctText: string, fillWidth: string,
 *            meta: string, state: 'measured'|'unavailable'}}
 */
function resolveStorageDisplay(storage) {
  const s = (storage && typeof storage === 'object') ? storage : {};
  const used = finiteOrNull(s.usedBytes);
  const total = finiteOrNull(s.totalBytes);

  // `volumeAvailable` is the server's own declaration that it could read the
  // volume. A missing/negative/zero capacity is an absence, not a measurement,
  // and dividing by it would yield NaN, Infinity or a fabricated zero.
  if (s.volumeAvailable !== true || used === null || total === null || total <= 0) {
    return {
      available: false,
      pctText: UNAVAILABLE_MARK,
      fillWidth: '0%',
      meta: UNAVAILABLE_VOLUME_META,
      state: 'unavailable',
    };
  }

  const pct = (used / total) * 100;
  return {
    available: true,
    pctText: pct.toFixed(1) + '%',
    fillWidth: pct + '%',
    meta: `${Format.bytes(used, 0)} of ${Format.bytes(total, 0)} used`,
    state: 'measured',
  };
}

/**
 * Decide what the sidebar identity block shows. This application has no user
 * API and no authentication, so there is no person to name and no operator to
 * greet: the only true statements available are the environment the server runs
 * in, and that the application is self-hosted. Everything else is an absence.
 * @param {object|null} health - the `GET /api/health` response
 * @returns {{available: boolean, avatar: string, name: string, role: string}}
 */
function resolveIdentityDisplay(health) {
  const env = (health && typeof health === 'object') ? health.env : null;

  if (typeof env === 'string' && env.trim() !== '') {
    // The avatar stays empty: initials would assert a person who does not exist.
    return { available: true, avatar: '', name: env, role: 'Self-hosted' };
  }

  return {
    available: false,
    avatar: '',
    name: UNAVAILABLE_IDENTITY_NAME,
    role: UNAVAILABLE_IDENTITY_ROLE,
  };
}

/* ══════════════════════════════════════════
   GLOBAL DATA FETCHER (API)
   ══════════════════════════════════════════ */

async function loadGlobalData() {
  // Identity: /api/health is the only endpoint that reports the environment.
  // A failed call must leave the block honestly unknown, never filled in.
  try {
    updateUserUI(await window.API.get('/health'));
  } catch (e) {
    console.warn('[Sidebar] environment unavailable:', e?.message || e);
    updateUserUI(null);
  }

  // Volume card: the summary endpoint is the only source of volume capacity.
  // It performs a bounded tree walk on every page load; that cost is accepted
  // rather than worked around with a second endpoint.
  try {
    const summary = await window.API.get('/dashboard/summary');
    updateStorageUI(summary && summary.storage);
  } catch (e) {
    console.warn('[Sidebar] volume usage unavailable:', e?.message || e);
    updateStorageUI(null);
  }
}

/* ══════════════════════════════════════════
   SIDEBAR RENDERERS (thin DOM wrappers)
   ══════════════════════════════════════════ */

function updateUserUI(health) {
  const view = resolveIdentityDisplay(health);
  const avatarEl = document.querySelector('.user-avatar');
  const nameEl = document.querySelector('.user-name');
  const roleEl = document.querySelector('.user-role');

  if (avatarEl) avatarEl.textContent = view.avatar;
  if (nameEl) nameEl.textContent = view.name;
  if (roleEl) roleEl.textContent = view.role;
}

function updateStorageUI(storage) {
  const view = resolveStorageDisplay(storage);
  const pctEl = document.querySelector('.storage-pct');
  const fillEl = document.querySelector('.storage-fill');
  const metaEl = document.querySelector('.storage-meta');

  if (!pctEl || !fillEl || !metaEl) return;

  pctEl.textContent = view.pctText;
  fillEl.style.width = view.fillWidth;
  fillEl.setAttribute('data-state', view.state);

  // Distinguishable unavailable style: drop the gradient fill and outline the
  // empty track instead, so an unmeasured bar cannot be mistaken for a filled
  // one. Both are cleared when a real reading arrives.
  fillEl.style.background = view.available ? '' : 'transparent';
  fillEl.style.boxShadow = view.available ? '' : 'inset 0 0 0 1px var(--border-secondary)';

  metaEl.textContent = view.meta;
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
  loadGlobalData();
  
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
  // Sidebar (see the pure resolvers above): page modules reuse these rather
  // than re-implementing the unavailable-vs-measured distinction.
  resolveStorageDisplay, updateStorageUI,
  resolveIdentityDisplay, updateUserUI,
};