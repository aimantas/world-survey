// Build-time SVG locator map for a pair of neighbouring countries, in the survey-sheet style of the country
// maps (tools/encyclopedia/map.mjs) and drawn with the same CSS classes: orthographic, survey-blue sea with two
// coast water lines, 15° graticule, pale land, dash-dot boundaries. Both countries are hatched in ink, in
// opposite directions; both capitals are benchmark triangles joined by a dashed great-circle line cased in paper; countries
// that border both are shaded. That file draws one subject per map, so this one stands on its own.
import { geoOrthographic, geoPath, geoGraticule, geoDistance, geoCentroid } from 'd3-geo';
import * as topojson from 'topojson-client';
import { presimplify, simplify, sphericalTriangleArea } from 'topojson-simplify';
import polylabel from 'polylabel';
import { R_KM, esc, int } from '../encyclopedia/lib.mjs';

export const W = 1000, H = 700;
const MARGIN = 30; // geometry is drawn past the frame so cut edges never show
const PAD = 10; // labels keep this far inside the frame
const SIMPLIFY_PX2 = 2.2; // Visvalingam threshold in viewBox units², as on the country maps
const FULL = H / 2 - 14; // scale of the whole-disc view
const MAX_SCALE = W / (1000 / R_KM); // the frame always spans at least 1,000 km
const FIT_X = 0.64, FIT_Y = 0.66; // share of the frame the two countries may fill
// Label sizes [desktop, mobile] in viewBox units; collisions use the larger. 0 = hidden on small screens.
const SIZE = { p: [24, 32], n: [18, 26], o: [15, 0], c: [17, 24] };
const CAP_W = 0.86, ITAL_W = 0.6; // average advance per character (em): wide caps / capital names
const RAD = Math.PI / 180;

// Path context that writes integer, relative coordinates and remembers closed rings.
class Pen {
  constructor() { this.parts = []; this.buf = null; this.rings = []; }
  moveTo(x, y) { this.flush(false); this.buf = [[Math.round(x), Math.round(y)]]; }
  lineTo(x, y) {
    const p = [Math.round(x), Math.round(y)], l = this.buf[this.buf.length - 1];
    if (l[0] !== p[0] || l[1] !== p[1]) this.buf.push(p);
  }
  closePath() { this.flush(true); }
  arc() {}
  flush(closed) {
    const b = this.buf;
    this.buf = null;
    if (!b) return;
    if (closed) {
      while (b.length > 1 && b[b.length - 1][0] === b[0][0] && b[b.length - 1][1] === b[0][1]) b.pop();
      if (b.length < 3) return;
    } else if (b.length < 2) return;
    let s = `M${b[0][0]} ${b[0][1]}l`;
    for (let i = 1; i < b.length; i++) {
      const dx = b[i][0] - b[i - 1][0], dy = b[i][1] - b[i - 1][1];
      s += (i === 1 || dx < 0 ? '' : ' ') + dx + (dy < 0 ? '' : ' ') + dy;
    }
    if (closed) { s += 'z'; this.rings.push(b); }
    this.parts.push(s);
  }
  done() { this.flush(false); return this.parts.join(''); }
}

const ringArea = (r) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2);
};

function splitName(name, max = 13) {
  if (name.length <= max || !name.includes(' ')) return [name];
  let best = null;
  for (let i = 0; i < name.length; i++) {
    if (name[i] !== ' ') continue;
    const a = name.slice(0, i), b = name.slice(i + 1);
    const score = Math.max(a.length, b.length);
    if (!best || score < best[0]) best = [score, [a, b]];
  }
  return best[1];
}

const unit = ([lng, lat]) => { const l = lng * RAD, p = lat * RAD, c = Math.cos(p); return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)]; };
const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const lngLat = (v) => [Math.atan2(v[1], v[0]) / RAD, Math.asin(Math.max(-1, Math.min(1, v[2]))) / RAD];

// [minLon, minLat, maxLon, maxLat] (may cross the antimeridian) -> a grid of points over the box.
function bboxSamples([w, s, e, n]) {
  const width = e >= w ? e - w : e + 360 - w;
  const pts = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 4; j++) pts.push([w + (width * i) / 8, s + ((n - s) * j) / 4]);
  return pts;
}

export function createPairMapper(topo, countries) {
  const byIso = new Map(countries.map((c) => [c.iso3, c]));
  const pre = presimplify(topo, sphericalTriangleArea);
  const geoms = topo.objects.countries.geometries;
  const hasGeom = new Set(geoms.map((g) => g.id));

  // Spherical cull circle per country, from the full-resolution outline.
  const cull = new Map();
  for (const g of geoms) {
    const f = topojson.feature(topo, g);
    const c = geoCentroid(f);
    let r = 0;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) for (const p of rings[0]) r = Math.max(r, geoDistance(c, p));
    cull.set(g.id, { c, r });
  }
  const graticule = geoGraticule().step([15, 15])();

  // Simplified geometry per scale step (steps of 1.25x, always at least as detailed as the map needs).
  const cache = new Map();
  function simplified(scale) {
    const step = Math.ceil(Math.log(scale) / Math.log(1.25));
    if (cache.has(step)) return cache.get(step);
    const k = 1.25 ** step;
    const t = simplify(pre, SIMPLIFY_PX2 / (k * k));
    const byId = new Map(t.objects.countries.geometries.map((g) => [g.id, g]));
    const feats = new Map();
    const out = {
      land: topojson.feature(t, t.objects.land),
      borders: topojson.mesh(t, t.objects.countries, (a, b) => a !== b),
      feature: (iso3) => {
        if (!feats.has(iso3)) { const g = byId.get(iso3); feats.set(iso3, g ? topojson.feature(t, g) : null); }
        return feats.get(iso3);
      },
    };
    cache.set(step, out);
    return out;
  }

  // The boundary the two share, at full resolution: keeps the border in frame when it lies on an outlying part.
  function sharedBorder(a, b) {
    const m = topojson.mesh(topo, topo.objects.countries, (x, y) => (x.id === a && y.id === b) || (x.id === b && y.id === a));
    return m.coordinates.flat();
  }

  // Centre (smallest enclosing circle, approximately) and scale that put every point inside the frame.
  function frame(points) {
    const vs = points.map(unit);
    let c = norm(vs.reduce((s, v) => [s[0] + v[0], s[1] + v[1], s[2] + v[2]], [0, 0, 0]));
    for (let i = 1; i <= 80; i++) {
      let far = vs[0], best = 2;
      for (const v of vs) { const d = dot(c, v); if (d < best) { best = d; far = v; } }
      c = norm([c[0] + (far[0] - c[0]) / (i + 1), c[1] + (far[1] - c[1]) / (i + 1), c[2] + (far[2] - c[2]) / (i + 1)]);
    }
    const centre = lngLat(c).map((v) => Math.round(v * 100) / 100);
    const whole = { centre, scale: FULL, translate: [W / 2, H / 2], full: true };
    const cu = unit(centre);
    let low = 1;
    for (const v of vs) low = Math.min(low, dot(cu, v));
    const reach = Math.acos(Math.max(-1, low));
    if (reach > Math.PI / 2 - 0.2) return whole;
    const p = geoOrthographic().rotate([-centre[0], -centre[1]]).scale(1).translate([0, 0]);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of points) {
      const [x, y] = p(q);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    let k = Math.min((W * FIT_X) / Math.max(x1 - x0, 1e-6), (H * FIT_Y) / Math.max(y1 - y0, 1e-6));
    if (k < FULL) return whole;
    k = Math.min(k, MAX_SCALE);
    return { centre, scale: k, translate: [W / 2 - (k * (x0 + x1)) / 2, H / 2 - (k * (y0 + y1)) / 2], full: false };
  }

  function makeLabeller(reserved) {
    const boxes = [...reserved];
    const fits = (b) =>
      b.x0 >= PAD && b.y0 >= PAD && b.x1 <= W - PAD && b.y1 <= H - PAD &&
      !boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    const box = (cx, cy, w, h) => ({ x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 });
    return {
      box,
      reserve(b) { boxes.push(b); },
      place(cands, w, h) {
        for (const [cx, cy] of cands) {
          const b = box(cx, cy, w, h);
          if (fits(b)) { boxes.push(b); return [cx, cy]; }
        }
        return null;
      },
    };
  }
  const dims = (lines, kind, italic = false) => {
    const size = Math.max(...SIZE[kind]);
    const len = Math.max(...lines.map((l) => l.length));
    return [len * size * (italic ? ITAL_W : CAP_W) + 6, lines.length * size * 1.12 + 4];
  };
  const textEl = (cls, [x, y], lines) => {
    const tx = Math.round(x), ty = Math.round(y);
    if (lines.length === 1) return `<text class="${cls}" x="${tx}" y="${ty}">${esc(lines[0])}</text>`;
    return `<text class="${cls}" x="${tx}" y="${ty}"><tspan x="${tx}" dy="-.56em">${esc(lines[0])}</tspan><tspan x="${tx}" dy="1.12em">${esc(lines[1])}</tspan></text>`;
  };

  function scaleBar(scale) {
    const perKm = scale / R_KM;
    const target = 175 / perKm;
    let km = 1;
    for (let p = 1; p <= 1e5; p *= 10) for (const s of [1, 2, 2.5, 5]) if (s * p <= target) km = s * p;
    const len = km * perKm, x = 24, y = H - 34, seg = len / 4;
    let bars = '';
    for (let i = 0; i < 4; i += 2) bars += `<rect x="${(x + i * seg).toFixed(1)}" y="${y}" width="${seg.toFixed(1)}" height="7"/>`;
    return {
      svg: `<g class="m-sb"><rect class="m-sb__o" x="${x}" y="${y}" width="${len.toFixed(1)}" height="7"/>${bars}<text x="${x}" y="${y - 8}">0</text><text x="${(x + len).toFixed(1)}" y="${y - 8}" text-anchor="end">${int(km)} km</text></g>`,
      box: { x0: x - 6, x1: x + len + 8, y0: y - 30, y1: y + 14 },
    };
  }

  // Rings of a feature as drawn inside the label frame, their area and a pole of inaccessibility.
  function visible(lpath, feature) {
    const pen = new Pen();
    lpath.context(pen)(feature);
    pen.done();
    if (!pen.rings.length) return null;
    let area = 0, big = null, bigA = 0;
    for (const r of pen.rings) {
      const a = ringArea(r);
      area += a;
      if (a > bigA) { bigA = a; big = r; }
    }
    if (!big || area < 1) return null;
    const p = polylabel([big], 1);
    return { area, pt: [p[0], p[1]], dist: p.distance };
  }

  /**
   * a, b: countries.json records; shared: iso3 codes of the countries that border both.
   * Returns { svg, centre: [lng, lat], full } (full = the whole disc is shown).
   */
  function pairMap(a, b, shared = [], { id = 'p' } = {}) {
    const points = [...sharedBorder(a.iso3, b.iso3)];
    for (const c of [a, b]) points.push(...(c.bbox ? bboxSamples(c.bbox) : [[c.labelLatLng[1], c.labelLatLng[0]]]));
    const { centre, scale, translate, full } = frame(points);
    const base = () => geoOrthographic().rotate([-centre[0], -centre[1]]).scale(scale).translate(translate);
    const proj = base().clipExtent([[-MARGIN, -MARGIN], [W + MARGIN, H + MARGIN]]).precision(0.4);
    const lproj = base().clipExtent([[PAD, PAD], [W - PAD, H - PAD]]).precision(0.6);
    const path = geoPath(proj), lpath = geoPath(lproj);
    const draw = (obj) => { const pen = new Pen(); path.context(pen)(obj); return pen.done(); };
    const geo = simplified(scale);
    const project = ([lat, lng]) => (geoDistance(centre, [lng, lat]) < Math.PI / 2 - 0.01 ? proj([lng, lat]) : null);
    const inFrame = (p) => p && p[0] >= PAD && p[0] <= W - PAD && p[1] >= PAD && p[1] <= H - PAD;
    // The frame may sit off the projection centre, so the cull radius reaches its farthest corner.
    const corner = Math.max(...[[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => Math.hypot(x - translate[0], y - translate[1]))) / scale;
    const viewR = corner >= 1 ? Math.PI / 2 : Math.asin(corner);
    const inView = (iso3) => { const k = cull.get(iso3); return k && geoDistance(centre, k.c) - k.r < viewR + 0.02; };

    const sphere = draw({ type: 'Sphere' });
    const land = draw(geo.land);
    const grat = draw(graticule);
    const borders = draw(geo.borders);

    const sb = scaleBar(scale);
    const reserved = [sb.box];

    // Inset location globe when zoomed in, with the frame marked on it.
    let inset = '';
    if (!full && scale > 900) {
      const r = 64, cx = W - r - 22, cy = r + 22;
      const ip = geoOrthographic().rotate([-centre[0], -centre[1]]).scale(r).translate([cx, cy]).precision(2);
      const ipath = geoPath(ip);
      const pen = new Pen();
      ipath.context(pen)(simplified(r * 1.4).land);
      const k = r / scale;
      const fx = cx + (W / 2 - translate[0]) * k, fy = cy + (H / 2 - translate[1]) * k, fw = W * k, fh = H * k;
      const mark = fw >= 7
        ? `<rect class="m-in__f" x="${(fx - fw / 2).toFixed(1)}" y="${(fy - fh / 2).toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}"/>`
        : `<circle class="m-in__f" cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="5"/><circle class="m-in__d" cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="1.8"/>`;
      inset = `<g class="m-in"><circle class="m-in__s" cx="${cx}" cy="${cy}" r="${r}"/><path class="m-in__l" d="${pen.done()}"/>${mark}<circle class="m-in__o" cx="${cx}" cy="${cy}" r="${r}"/></g>`;
      reserved.push({ x0: cx - r - 8, x1: cx + r + 8, y0: cy - r - 8, y1: cy + r + 8 });
    }

    // Country layers: the pair hatched, shared neighbours shaded.
    const pair = [a, b];
    const sharedSet = new Set(shared);
    const hatched = pair.map((c, i) => {
      const f = c.inMap && hasGeom.has(c.iso3) ? geo.feature(c.iso3) : null;
      const d = f ? draw(f) : '';
      return d ? `<path class="m-sub" fill="url(#${id}-h${i ? 'b' : 'a'})" d="${d}"/>` : '';
    }).join('');
    const tinted = shared.filter((iso3) => hasGeom.has(iso3) && inView(iso3)).map((iso3) => {
      const d = draw(geo.feature(iso3));
      return d ? `<path class="m-nb" d="${d}"/>` : '';
    }).join('');

    const L = makeLabeller(reserved);
    const marks = [], labels = [];

    // Rings for states too small to see, then the capitals and the line between them.
    for (const c of pair) {
      if (!(c.tiny || !c.inMap)) continue;
      const p = project(c.labelLatLng);
      if (!inFrame(p)) continue;
      marks.push(`<circle class="m-ring" cx="${Math.round(p[0])}" cy="${Math.round(p[1])}" r="15"/><circle class="m-ring m-ring--o" cx="${Math.round(p[0])}" cy="${Math.round(p[1])}" r="22"/>`);
      L.reserve(L.box(p[0], p[1], 46, 46));
    }
    const caps = pair.map((c) => (c.capitalLatLng ? project(c.capitalLatLng) : null));
    let link = '';
    if (a.capitalLatLng && b.capitalLatLng) {
      const d = draw({ type: 'LineString', coordinates: [[a.capitalLatLng[1], a.capitalLatLng[0]], [b.capitalLatLng[1], b.capitalLatLng[0]]] });
      if (d) link = `<path class="m-link-c" d="${d}"/><path class="m-link" d="${d}"/>`;
    }
    caps.forEach((p) => {
      if (!inFrame(p)) return;
      marks.push(`<path class="m-cap" d="M${Math.round(p[0])} ${Math.round(p[1] - 9)}l8 14h-16z"/>`);
      L.reserve(L.box(p[0], p[1] - 2, 20, 20));
    });

    // The two names: inside the country where there is room, beside it otherwise.
    pair.forEach((c) => {
      const lines = splitName(c.name.toUpperCase(), 14);
      const [w, h] = dims(lines, 'p');
      const f = c.inMap && hasGeom.has(c.iso3) && !c.tiny ? geo.feature(c.iso3) : null;
      const v = f ? visible(lpath, f) : null;
      const cands = [];
      if (v && v.dist * 2 > h * 0.9) {
        for (const [dx, dy] of [[0, 0], [0, h], [0, -h], [-w / 4, 0], [w / 4, 0], [-w / 4, h], [w / 4, h], [-w / 4, -h], [w / 4, -h], [0, 2 * h], [0, -2 * h]]) {
          if (Math.abs(dy) + h / 2 <= v.dist * 1.25) cands.push([v.pt[0] + dx, v.pt[1] + dy]);
        }
      }
      const anchor = v ? v.pt : project(c.labelLatLng) ?? [W / 2, H / 2];
      const off = Math.max(30, v ? Math.sqrt(v.area) / 2 : 0);
      for (const m of [1, 1.7, 2.6]) {
        const o = off * m;
        cands.push([anchor[0], anchor[1] - o - h / 2], [anchor[0], anchor[1] + o + h / 2], [anchor[0] + o + w / 2, anchor[1]], [anchor[0] - o - w / 2, anchor[1]],
          [anchor[0] + o + w / 2, anchor[1] - o], [anchor[0] - o - w / 2, anchor[1] - o], [anchor[0] + o + w / 2, anchor[1] + o], [anchor[0] - o - w / 2, anchor[1] + o]);
      }
      const at = L.place(cands, w, h);
      if (at) labels.push(textEl('m-l m-l--p', at, lines));
    });
    pair.forEach((c, i) => {
      const p = caps[i];
      if (!inFrame(p) || !c.capital) return;
      const [w, h] = dims([c.capital], 'c', true);
      const [x, y] = p;
      const cands = [];
      for (const g of [14, 30, 46]) cands.push([x + g + w / 2, y], [x - g - w / 2, y], [x, y + g + h / 2], [x, y - g - 2 - h / 2], [x + g + w / 2, y + h], [x - g - w / 2, y + h], [x + g + w / 2, y - h], [x - g - w / 2, y - h]);
      const at = L.place(cands, w, h);
      if (at) labels.push(textEl('m-cap-l', at, [c.capital]));
    });

    // Other names: the shared neighbours first, then the largest countries in view.
    const skip = new Set([a.iso3, b.iso3]);
    const others = [];
    for (const g of geoms) {
      const c = byIso.get(g.id);
      if (!c || skip.has(g.id) || !inView(g.id)) continue;
      const f = geo.feature(g.id);
      const v = f ? visible(lpath, f) : null;
      if (v) others.push({ c, v, kind: sharedSet.has(g.id) ? 'n' : 'o' });
    }
    others.sort((p, q) => (p.kind === q.kind ? q.v.area - p.v.area : p.kind === 'n' ? -1 : 1));
    for (const k of others) {
      const lines = splitName(k.c.name.toUpperCase());
      const [w, h] = dims(lines, k.kind);
      if (k.kind === 'o' && k.v.area < Math.max((W * H) / 60, w * h * 1.2)) continue;
      const [x, y] = k.v.pt;
      const cands = [[x, y]];
      if (k.kind === 'n') cands.push([x, y - h * 0.9], [x, y + h * 0.9], [x + w * 0.35, y], [x - w * 0.35, y]);
      const at = L.place(cands, w, h);
      if (at) labels.push(textEl(`m-l m-l--${k.kind}`, at, lines));
    }

    const limb = full || corner >= 0.98 ? `<path class="m-limb" d="${sphere}"/>` : '';
    const hatch = (name, deg) => `<pattern id="${id}-h${name}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(${deg})"><path d="M0 0v7"/></pattern>`;
    return {
      centre,
      full,
      svg:
        `<svg class="map map--pair" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t"><title id="${id}-t">Locator map of ${esc(a.name)} and ${esc(b.name)}</title>` +
        `<defs>${hatch('a', 45)}${hatch('b', -45)}<path id="${id}-S" d="${sphere}"/><path id="${id}-L" d="${land}"/><clipPath id="${id}-c"><use href="#${id}-S"/></clipPath></defs>` +
        `<use class="m-sea" href="#${id}-S"/><path class="m-grat" d="${grat}"/>` +
        `<g clip-path="url(#${id}-c)"><use class="m-wl m-wl--2" href="#${id}-L"/><use class="m-wl m-wl--2b" href="#${id}-L"/><use class="m-wl m-wl--1" href="#${id}-L"/><use class="m-wl m-wl--1b" href="#${id}-L"/></g>` +
        `<use class="m-land" href="#${id}-L"/>${tinted}<path class="m-bd" d="${borders}"/>${hatched}` +
        `<use class="m-coast" href="#${id}-L"/>${limb}${link}` +
        marks.join('') + labels.join('') + sb.svg + inset +
        `</svg>`,
    };
  }

  return { pairMap };
}
