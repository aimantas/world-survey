// Tiny DOM helpers and the authored icon set (one 1.8 px stroke family).
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('en-GB'));

export const isNarrow = () => window.matchMedia('(max-width: 760px)').matches;
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Long names shrink so the title block keeps one or two lines.
export function placeSize(name) {
  const n = name.length;
  const narrow = isNarrow();
  const base = narrow ? 30 : 42;
  if (n <= 9) return base;
  if (n <= 13) return Math.round(base * 0.84);
  if (n <= 18) return Math.round(base * 0.7);
  if (n <= 26) return Math.round(base * 0.6);
  return Math.round(base * 0.5);
}

// Place names on fact cards: on phones the longest word must fit beside the flag and the stamp.
export function cardPlaceSize(name, desktopMax = 26) {
  if (!isNarrow()) return Math.min(desktopMax, placeSize(name) * 0.62);
  const longest = Math.max(...name.split(/\s+/).map((w) => w.length));
  return Math.max(13, Math.min(22, Math.floor(176 / (longest * 1.0))));
}

export const normalise = (s) =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const icon = {
  back: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3L5 8l5 5"/></svg>',
  next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg>',
  chevron: '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3l5 5-5 5"/></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M4 7l4-4 4 4"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M4 9l4 4 4-4"/></svg>',
  share: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2M5 5l3-3 3 3M3 8v5.5h10V8"/></svg>',
  replay: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v2.8h2.8"/></svg>',
  globe: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 1.8-3 3.8-3 6s1 4.2 3 6M8 2c2 1.8 3 3.8 3 6s-1 4.2-3 6"/></svg>',
};

// Survey medal: a benchmark triangle in a ring. Locked medals print without ink.
export function medalSvg(locked = false) {
  const ring = locked ? '#9aa1a7' : '#1b232b';
  const fill = locked ? '#d9ddd6' : '#c3177b';
  return `<svg viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="#fbfcf8" stroke="${ring}" stroke-width="1.5"/><circle cx="15" cy="15" r="9.5" fill="none" stroke="${ring}" stroke-width="0.8" stroke-dasharray="1.6 1.6"/><path d="M15 8.5l6 10.5H9z" fill="${fill}"/><circle cx="15" cy="16" r="1.4" fill="#fbfcf8"/></svg>`;
}

// Result marks for round lists: tick, near (half), cross.
export function markSvg(g) {
  if (g === 'perfect') return '<svg class="mark" viewBox="0 0 14 14"><path d="M2.5 7.5l3 3 6-7" fill="none" stroke="#3e7a45" stroke-width="2"/></svg>';
  if (g === 'close') return '<svg class="mark" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#8a5a33" stroke-width="1.6"/><path d="M7 2a5 5 0 0 1 0 10z" fill="#8a5a33"/></svg>';
  if (g === 'far') return '<svg class="mark" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5" fill="none" stroke="#c3177b" stroke-width="1.6"/></svg>';
  return '<svg class="mark" viewBox="0 0 14 14"><path d="M3 3l8 8M11 3l-8 8" stroke="#c3177b" stroke-width="2"/></svg>';
}
