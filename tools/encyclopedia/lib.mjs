// Shared helpers for the encyclopedia data step (fetch.mjs) and page generator (build.mjs). Pure functions.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const TOOLS = path.resolve(HERE, '..');
export const ROOT = path.resolve(TOOLS, '..');
export const CACHE = path.join(TOOLS, '.cache', 'encyclopedia');

export const SITE = 'https://geography.aimantas.com';
export const REGIONS = ['Europe', 'Asia', 'Africa', 'Americas', 'Oceania'];
// World Bank values older than this are shown with their year but left out of ranks and comparisons.
export const MIN_RANK_YEAR = 2018;

// The game builds the same slug from countries.json `name`; keep this rule exactly in step with it.
export const slug = (name) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const R_KM = 6371.0088;
const RAD = Math.PI / 180;

// Great-circle distance between two [lat, lng] points, km.
export function distanceKm([lat1, lng1], [lat2, lng2]) {
  const dp = (lat2 - lat1) * RAD, dl = (lng2 - lng1) * RAD;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dl / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function unitVec(lng, lat) {
  const l = lng * RAD, p = lat * RAD, c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}

export const wrapLng = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;

// [minLon, minLat, maxLon, maxLat]; minLon > maxLon when the box crosses the antimeridian.
export function bboxCentre([w, s, e, n]) {
  const width = e >= w ? e - w : e + 360 - w;
  return [wrapLng(w + width / 2), (s + n) / 2]; // [lng, lat]
}
export function inBbox([lng, lat], [w, s, e, n], pad = 0) {
  if (lat < s - pad || lat > n + pad) return false;
  if (e >= w) return lng >= w - pad && lng <= e + pad;
  return lng >= w - pad || lng <= e + pad;
}

// Stable 32-bit hash (FNV-1a) for deterministic phrasing choices.
export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
export const pick = (key, list) => list[hash(key) % list.length];

// Competition ranking (1, 2, 2, 4) over non-null values, largest first. Returns Map iso3 -> rank, and the count ranked.
export function rankBy(records, get) {
  const vals = records.map((r) => [r.iso3, get(r)]).filter(([, v]) => v != null && Number.isFinite(v));
  vals.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  const out = new Map();
  let prev = null, rank = 0;
  vals.forEach(([iso3, v], i) => {
    if (v !== prev) { rank = i + 1; prev = v; }
    out.set(iso3, rank);
  });
  return { ranks: out, of: vals.length };
}

// Planar even-odd point-in-polygon on lon/lat rings (for Natural Earth GeoJSON, already cut at the antimeridian).
export function pointInRings([x, y], rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

// ---------- Formatting ----------

const nf0 = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
export const int = (n) => nf0.format(Math.round(n));
export const fixed = (n, d = 1) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

export function ordinal(n) {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`;
}
// "largest", "2nd-largest" ...
export const nth = (n, word) => (n === 1 ? word : `${ordinal(n)}-${word}`);

export function people(n) {
  if (n == null) return null;
  if (n >= 1e9) return `${fixed(n / 1e9, 2)} billion`;
  if (n >= 1e7) return `${fixed(n / 1e6, 1)} million`;
  if (n >= 1e6) return `${fixed(n / 1e6, 2)} million`;
  return int(n);
}
export function usd(n) {
  if (n == null) return null;
  if (n >= 1e12) return `US$${fixed(n / 1e12, 2)} trillion`;
  if (n >= 1e9) return `US$${fixed(n / 1e9, 1)} billion`;
  if (n >= 1e6) return `US$${fixed(n / 1e6, 0)} million`;
  return `US$${int(n)}`;
}
// Near 0° one decimal would print "0.0°" for a point that is not on the line; show two.
export function latStr(lat, d = 1) {
  if (Math.abs(lat) < 0.005) return '0°';
  const dd = Math.abs(lat) < 1 ? Math.max(d, 2) : d;
  return `${fixed(Math.abs(lat), dd)}°${lat >= 0 ? 'N' : 'S'}`;
}
export function lngStr(lng, d = 1) {
  if (Math.abs(lng) < 0.005) return '0°';
  const dd = Math.abs(lng) < 1 ? Math.max(d, 2) : d;
  return `${fixed(Math.abs(lng), dd)}°${lng >= 0 ? 'E' : 'W'}`;
}
export const latLngStr = ([lat, lng], d = 1) => `${latStr(lat, d)} ${lngStr(lng, d)}`;

export function listAnd(items) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- Reading a built page back (for the verify scripts) ----------

export const unesc = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
export const textOf = (html) => unesc(html.replace(/<[^>]+>/g, ''));

// A country page's Questions section as [question, answer] text pairs: `visible` as printed on the page,
// `ld` as the FAQPage JSON-LD node states them. The two must be equal, word for word.
export function faqOf(html) {
  const sec = html.match(/<div class="faq">([\s\S]*?)<\/div><\/section>/)?.[1] ?? '';
  const visible = [...sec.matchAll(/<div><h3>([\s\S]*?)<\/h3><p>([\s\S]*?)<\/p><\/div>/g)].map((m) => [textOf(m[1]), textOf(m[2])]);
  let ld = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j;
    try { j = JSON.parse(m[1]); } catch { continue; }
    const node = (j['@graph'] ?? [j]).find((x) => x['@type'] === 'FAQPage');
    if (node) ld = (node.mainEntity ?? []).map((q) => [q.name, q.acceptedAnswer?.text]);
  }
  return { visible, ld };
}
