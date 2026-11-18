// Build-time SVG locator maps in the survey-sheet style: orthographic, ocean disc in survey blue with two coast
// water lines, 15° graticule, pale land, dash-dot boundaries, the subject hatched in ink, the capital as a
// benchmark triangle, rings for states too small to see, and a location globe inset when zoomed in.
// Geometry is simplified per map scale (Visvalingam, spherical weights) and written as integer relative paths.
import { geoOrthographic, geoPath, geoGraticule, geoDistance, geoCentroid, geoContains } from 'd3-geo';
import * as topojson from 'topojson-client';
import { presimplify, simplify, sphericalTriangleArea } from 'topojson-simplify';
import polylabel from 'polylabel';
import { R_KM, bboxCentre, esc, int } from './lib.mjs';

export const W = 1000, H = 700;
const MARGIN = 30; // geometry is drawn past the frame so cut edges never show
const PAD = 10; // labels keep this far inside the frame
const SIMPLIFY_PX2 = 2.2; // Visvalingam threshold in viewBox units²
// Label sizes [desktop, mobile] in viewBox units; collisions use the larger. 0 = hidden on small screens.
const SIZE = { t: [30, 38], n: [18, 26], o: [15, 0], i: [15, 21], w: [18, 24], c: [17, 24] };
const CAP_W = 0.86, ITAL_W = 0.6; // average advance per character (em) for wide caps / spaced italic

// ---------- Compact path context ----------
class Ctx {
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

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
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

export function createMapper(topo, countries, marine) {
  const byIso = new Map(countries.map((c) => [c.iso3, c]));
  const pre = presimplify(topo, sphericalTriangleArea);
  const geoms = topo.objects.countries.geometries;

  // Spherical cull circles from the full-resolution features, plus every outer-ring vertex as a unit vector.
  const cull = new Map();
  const verts = [];
  const unit = ([lng, lat]) => { const l = (lng * Math.PI) / 180, p = (lat * Math.PI) / 180; return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]; };
  for (const g of geoms) {
    const f = topojson.feature(topo, g);
    const c = geoCentroid(f);
    let r = 0;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) for (const p of rings[0]) r = Math.max(r, geoDistance(c, p));
    cull.set(g.id, { c, r });
    for (const rings of polys) for (const p of rings[0]) verts.push([g.id, unit(p)]);
  }
  const water = [];
  for (const f of marine.features) {
    const raw = String(f.properties.name ?? '').trim();
    if (!raw) continue;
    const name = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b([a-z])/g, (x) => x.toUpperCase()).replace(/\b(Of|The|And)\b/g, (x) => x.toLowerCase()) : raw;
    const c = geoCentroid(f);
    let r = 0;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) for (const p of rings[0]) r = Math.max(r, geoDistance(c, p));
    water.push({ name, cls: f.properties.featurecla, feature: f, c, r });
  }
  const graticule = geoGraticule().step([15, 15])();

  const cache = new Map();
  function simplified(scale) {
    const key = Math.round(scale);
    if (cache.has(key)) return cache.get(key);
    if (cache.size > 40) cache.clear();
    const t = simplify(pre, SIMPLIFY_PX2 / (key * key));
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
    cache.set(key, out);
    return out;
  }

  // ---------- Layout helpers ----------
  function makeLabeller(reserved) {
    const boxes = [...reserved];
    const fits = (b) =>
      b.x0 >= PAD && b.y0 >= PAD && b.x1 <= W - PAD && b.y1 <= H - PAD &&
      !boxes.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    return {
      boxes,
      fits,
      box(cx, cy, w, h) { return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 }; },
      tryPlace(cands, w, h) {
        for (const [cx, cy] of cands) {
          const b = this.box(cx, cy, w, h);
          if (fits(b)) { boxes.push(b); return [cx, cy]; }
        }
        return null;
      },
      reserve(b) { boxes.push(b); },
    };
  }
  const labelDims = (lines, kind, italic = false) => {
    const size = Math.max(...SIZE[kind]);
    const len = Math.max(...lines.map((l) => l.length));
    return [len * size * (italic ? ITAL_W : CAP_W) + 6, lines.length * size * 1.12 + 4];
  };
  const textEl = (cls, [x, y], lines) => {
    if (lines.length === 1) return `<text class="${cls}" x="${Math.round(x)}" y="${Math.round(y)}">${esc(lines[0])}</text>`;
    const tx = Math.round(x);
    return `<text class="${cls}" x="${tx}" y="${Math.round(y)}"><tspan x="${tx}" dy="-.56em">${esc(lines[0])}</tspan><tspan x="${tx}" dy="1.12em">${esc(lines[1])}</tspan></text>`;
  };

  function scaleBar(scale) {
    const perKm = scale / R_KM;
    const target = 175 / perKm;
    const steps = [1, 2, 2.5, 5];
    let km = 1;
    for (let p = 1; p <= 1e5; p *= 10) for (const s of steps) if (s * p <= target) km = s * p;
    const len = km * perKm, x = 24, y = H - 34, seg = len / 4;
    let bars = '';
    for (let i = 0; i < 4; i += 2) bars += `<rect x="${(x + i * seg).toFixed(1)}" y="${y}" width="${seg.toFixed(1)}" height="7"/>`;
    return {
      svg: `<g class="m-sb"><rect class="m-sb__o" x="${x}" y="${y}" width="${len.toFixed(1)}" height="7"/>${bars}<text x="${x}" y="${y - 8}">0</text><text x="${(x + len).toFixed(1)}" y="${y - 8}" text-anchor="end">${int(km)} km</text></g>`,
      box: { x0: x - 6, x1: x + len + 8, y0: y - 30, y1: y + 14 },
    };
  }

  // Projected, label-clipped rings of a feature, its visible area and a pole of inaccessibility.
  function visible(labelPath, feature) {
    const ctx = new Ctx();
    labelPath.context(ctx)(feature);
    ctx.done();
    if (!ctx.rings.length) return null;
    let area = 0, big = null, bigA = 0;
    for (const r of ctx.rings) {
      const a = ringArea(r);
      area += a;
      if (a > bigA) { bigA = a; big = r; }
    }
    if (!big || area < 1) return null;
    const p = polylabel([big], 1);
    return { area, pt: [p[0], p[1]], dist: p.distance, ring: big };
  }

  /**
   * Render one map.
   * opts: { centre: [lng, lat], scale, subject: [iso3] (hatched), group: [iso3] (tinted, labelled; region maps),
   *         neighbours: [iso3], capital: {latLng, name}, rings: [{latLng}], title, label: {iso3, name, latLng} }
   */
  function render(opts) {
    const full = opts.scale <= H / 2 - 14;
    const scale = full ? H / 2 - 14 : opts.scale;
    const proj = geoOrthographic().rotate([-opts.centre[0], -opts.centre[1]]).scale(scale).translate([W / 2, H / 2])
      .clipExtent([[-MARGIN, -MARGIN], [W + MARGIN, H + MARGIN]]).precision(0.4);
    const lproj = geoOrthographic().rotate([-opts.centre[0], -opts.centre[1]]).scale(scale).translate([W / 2, H / 2])
      .clipExtent([[PAD, PAD], [W - PAD, H - PAD]]).precision(0.6);
    const path = geoPath(proj), lpath = geoPath(lproj);
    const draw = (obj) => { const ctx = new Ctx(); path.context(ctx)(obj); return ctx.done(); };
    const halfDiag = Math.hypot(W, H) / 2 / scale;
    const viewR = halfDiag >= 1 ? Math.PI / 2 : Math.asin(halfDiag);
    const inView = (iso3) => {
      const k = cull.get(iso3);
      return k && geoDistance(opts.centre, k.c) - k.r < viewR + 0.02;
    };
    const geo = simplified(scale);
    const project = ([lat, lng]) => (geoDistance(opts.centre, [lng, lat]) < Math.PI / 2 - 0.01 ? proj([lng, lat]) : null);

    const subject = new Set(opts.subject ?? []), group = new Set(opts.group ?? []), neigh = new Set(opts.neighbours ?? []);
    const sphere = draw({ type: 'Sphere' });
    const land = draw(geo.land);
    const grat = draw(graticule);
    const borders = draw(geo.borders);

    const reserved = [];
    const sb = scaleBar(scale);
    reserved.push(sb.box);

    // Inset location globe when zoomed in.
    let inset = '';
    if (!full && scale > 900) {
      const r = 64, cx = W - r - 22, cy = r + 22;
      const ip = geoOrthographic().rotate([-opts.centre[0], -opts.centre[1]]).scale(r).translate([cx, cy]).precision(2);
      const ipath = geoPath(ip);
      const idraw = (obj) => { const ctx = new Ctx(); ipath.context(ctx)(obj); return ctx.done(); };
      const ig = simplified(r * 1.4);
      const fw = (W * r) / scale, fh = (H * r) / scale;
      const mark = fw >= 7
        ? `<rect class="m-in__f" x="${(cx - fw / 2).toFixed(1)}" y="${(cy - fh / 2).toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}"/>`
        : `<circle class="m-in__f" cx="${cx}" cy="${cy}" r="5"/><circle class="m-in__d" cx="${cx}" cy="${cy}" r="1.8"/>`;
      inset = `<g class="m-in"><circle class="m-in__s" cx="${cx}" cy="${cy}" r="${r}"/><path class="m-in__l" d="${idraw(ig.land)}"/>${mark}<circle class="m-in__o" cx="${cx}" cy="${cy}" r="${r}"/></g>`;
      reserved.push({ x0: cx - r - 8, x1: cx + r + 8, y0: cy - r - 8, y1: cy + r + 8 });
    }

    // Country layers.
    const tinted = [], subj = [];
    const candidates = []; // for labels
    for (const g of geoms) {
      const iso3 = g.id;
      if (!inView(iso3)) continue;
      const isSub = subject.has(iso3), isGroup = group.has(iso3), isN = neigh.has(iso3);
      const c = byIso.get(iso3);
      if (isSub || isGroup || isN) {
        const f = geo.feature(iso3);
        const d = draw(f);
        if (d) (isSub ? subj : tinted).push(isSub ? `<path class="m-sub" fill="url(#${opts.id ?? 'm'}-h)" d="${d}"/>` : `<path class="${isGroup ? 'm-grp' : 'm-nb'}" d="${d}"/>`);
      }
      if (c && !isSub) candidates.push({ iso3, c, kind: isGroup ? 'g' : isN ? 'n' : 'o' });
    }

    const L = makeLabeller(reserved);
    const labels = [], marks = [];

    // Subject rings (tiny states) and capital.
    for (const r of opts.rings ?? []) {
      const p = project(r.latLng);
      if (!p) continue;
      const big = r.small ? 7 : 15;
      marks.push(r.small
        ? `<circle class="m-ring m-ring--s" cx="${Math.round(p[0])}" cy="${Math.round(p[1])}" r="${big}"/>`
        : `<circle class="m-ring" cx="${Math.round(p[0])}" cy="${Math.round(p[1])}" r="${big}"/><circle class="m-ring m-ring--o" cx="${Math.round(p[0])}" cy="${Math.round(p[1])}" r="${big + 7}"/>`);
      L.reserve(L.box(p[0], p[1], 2 * big + 16, 2 * big + 16));
    }
    let capPt = null;
    if (opts.capital) {
      capPt = project(opts.capital.latLng);
      if (capPt) {
        const [x, y] = capPt;
        marks.push(`<path class="m-cap" d="M${Math.round(x)} ${Math.round(y - 9)}l8 14h-16z"/>`);
        L.reserve(L.box(x, y - 2, 20, 20));
      }
    }

    // Subject label.
    if (opts.label) {
      const lines = splitName(opts.label.name.toUpperCase(), 14);
      const [w, h] = labelDims(lines, 't');
      const f = opts.label.iso3 ? geo.feature(opts.label.iso3) : null;
      const v = f ? visible(lpath, f) : null;
      const cands = [];
      if (v && v.dist * 2 > h * 0.9) {
        for (const [dx, dy] of [[0, 0], [0, h], [0, -h], [-w / 4, 0], [w / 4, 0], [-w / 4, h], [w / 4, h], [-w / 4, -h], [w / 4, -h], [0, 2 * h], [0, -2 * h]]) {
          if (Math.abs(dy) + h / 2 <= v.dist * 1.25) cands.push([v.pt[0] + dx, v.pt[1] + dy]);
        }
      }
      const anchor = v ? v.pt : project(opts.label.latLng) ?? [W / 2, H / 2];
      const off = Math.max(26, v ? Math.sqrt(v.area) / 2 : 0);
      cands.push([anchor[0], anchor[1] - off - h / 2], [anchor[0], anchor[1] + off + h / 2],
        [anchor[0] + off + w / 2, anchor[1]], [anchor[0] - off - w / 2, anchor[1]],
        [anchor[0], anchor[1] - off - h * 1.6], [anchor[0], anchor[1] + off + h * 1.6]);
      const at = L.tryPlace(cands, w, h);
      if (at) labels.push(textEl('m-l m-l--t', at, lines));
    }
    if (capPt && opts.capital) {
      const name = opts.capital.name;
      const [w, h] = labelDims([name], 'c', true);
      const [x, y] = capPt;
      const at = L.tryPlace([[x + 14 + w / 2, y], [x - 14 - w / 2, y], [x, y + 14 + h / 2], [x, y - 16 - h / 2]], w, h);
      if (at) labels.push(textEl('m-cap-l', at, [name]));
    }

    // Neighbour / group / context labels, biggest visible area first.
    const ranked = candidates
      .map((k) => { const f = geo.feature(k.iso3); return { ...k, v: f ? visible(lpath, f) : null }; })
      .filter((k) => k.v && k.v.area > 0)
      .sort((a, b) => ({ g: 0, n: 0, o: 1 }[a.kind] - { g: 0, n: 0, o: 1 }[b.kind]) || b.v.area - a.v.area);
    // Region maps: members too small to see get a ring and, where it fits, a small label beside it.
    const smallMembers = [];
    for (const iso3 of group) {
      const c = byIso.get(iso3);
      if (!c) continue;
      const f = c.inMap ? geo.feature(iso3) : null;
      const vis = f ? visible(lpath, f) : null;
      if (vis && vis.area >= 220 && !c.tiny) continue;
      const p = project(c.labelLatLng);
      if (!p || p[0] < PAD || p[0] > W - PAD || p[1] < PAD || p[1] > H - PAD) continue;
      marks.push(`<circle class="m-ring m-ring--s" cx="${Math.round(p[0])}" cy="${Math.round(p[1])}" r="7"/>`);
      L.reserve(L.box(p[0], p[1], 18, 18));
      smallMembers.push({ c, p });
    }
    const smallIso = new Set(smallMembers.map((m) => m.c.iso3));
    let islandLabels = 0;
    for (const k of ranked) {
      if (smallIso.has(k.iso3)) continue;
      // Context labels: big countries anywhere; around island states, the nearby islands too.
      const island = k.kind === 'o' && opts.isolated && k.v.area < (W * H) / 60;
      if (island && (k.v.area < 6 || islandLabels >= 6)) continue;
      const kind = island ? 'i' : k.kind === 'o' ? 'o' : 'n';
      const lines = splitName(k.c.name.toUpperCase());
      const [w, h] = labelDims(lines, kind);
      if (kind === 'o' && k.v.area < Math.max((W * H) / 60, w * h * 1.2)) continue;
      const [x, y] = k.v.pt;
      const r = Math.sqrt(k.v.area / Math.PI);
      const cands = island
        ? [[x, y - r - h / 2 - 4], [x, y + r + h / 2 + 4], [x + r + w / 2 + 6, y], [x - r - w / 2 - 6, y]]
        : [[x, y]];
      if (kind === 'n') cands.push([x, y - h * 0.9], [x, y + h * 0.9], [x + w * 0.35, y], [x - w * 0.35, y]);
      const at = L.tryPlace(cands, w, h);
      if (at) labels.push(textEl(`m-l m-l--${kind}${k.kind === 'g' && k.v.area < 400 ? ' m-l--sm' : ''}`, at, lines));
      if (at && island) islandLabels++;
    }
    for (const { c, p } of smallMembers) {
      const lines = splitName(c.name.toUpperCase(), 12);
      const [w, h] = labelDims(lines, 'i');
      const [x, y] = p;
      const at = L.tryPlace([[x + 12 + w / 2, y], [x - 12 - w / 2, y], [x, y - 12 - h / 2], [x, y + 12 + h / 2]], w, h);
      if (at) labels.push(textEl('m-l m-l--i m-l--g', at, lines));
    }

    // Water names, largest first, only where the whole label sits on water.
    const wl = [];
    for (const wtr of water) {
      if (geoDistance(opts.centre, wtr.c) - wtr.r > viewR + 0.02) continue;
      const v = visible(lpath, wtr.feature);
      if (!v || v.area < (W * H) / 40) continue;
      wl.push({ ...wtr, v });
    }
    wl.sort((a, b) => (a.cls === 'ocean' ? 0 : 1) - (b.cls === 'ocean' ? 0 : 1) || b.v.area - a.v.area);
    let placedWater = 0;
    for (const wtr of wl) {
      if (placedWater >= 3) break;
      const lines = splitName(wtr.name, 16);
      const [w, h] = labelDims(lines, 'w', true);
      if (wtr.v.dist < h * 0.75) continue;
      const [x, y] = wtr.v.pt;
      const cands = [[x, y]];
      const ring = wtr.v.ring;
      const grid = [];
      for (let gx = PAD + w / 2; gx <= W - PAD - w / 2; gx += 34) {
        for (let gy = PAD + h / 2; gy <= H - PAD - h / 2; gy += 30) if (inRing([gx, gy], ring)) grid.push([gx, gy]);
      }
      grid.sort((a, b) => Math.hypot(a[0] - x, a[1] - y) - Math.hypot(b[0] - x, b[1] - y));
      cands.push(...grid.slice(0, 70));
      for (const cand of cands) {
        const b = L.box(cand[0], cand[1], w, h);
        if (!L.fits(b)) continue;
        const samples = [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1], [cand[0], cand[1]], [b.x0, cand[1]], [b.x1, cand[1]]];
        const wet = samples.every((s) => {
          const ll = lproj.invert(s);
          return ll && geoDistance(opts.centre, ll) < Math.PI / 2 - 0.02 && !geoContains(geo.land, ll);
        });
        if (!wet) continue;
        const at = L.tryPlace([cand], w, h);
        if (at) { labels.push(textEl('m-w', at, lines)); placedWater++; break; }
      }
    }

    const id = opts.id ?? 'm';
    const limb = full || halfDiag >= 0.98 ? `<path class="m-limb" d="${sphere}"/>` : '';
    return {
      full,
      scale,
      svg:
        `<svg class="map" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t"><title id="${id}-t">${esc(opts.title)}</title>` +
        `<defs><pattern id="${id}-h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0v7"/></pattern>` +
        `<path id="${id}-S" d="${sphere}"/><path id="${id}-L" d="${land}"/><clipPath id="${id}-c"><use href="#${id}-S"/></clipPath></defs>` +
        `<use class="m-sea" href="#${id}-S"/><path class="m-grat" d="${grat}"/>` +
        `<g clip-path="url(#${id}-c)"><use class="m-wl m-wl--2" href="#${id}-L"/><use class="m-wl m-wl--2b" href="#${id}-L"/><use class="m-wl m-wl--1" href="#${id}-L"/><use class="m-wl m-wl--1b" href="#${id}-L"/></g>` +
        `<use class="m-land" href="#${id}-L"/>${tinted.join('')}` +
        `<path class="m-bd" d="${borders}"/>` +
        subj.join('') +
        `<use class="m-coast" href="#${id}-L"/>${limb}` +
        marks.join('') + labels.join('') + sb.svg + inset +
        `</svg>`,
    };
  }

  // ---------- Public: framing ----------
  function fitScale(centre, pts, fx = 0.6, fy = 0.7) {
    const p = geoOrthographic().rotate([-centre[0], -centre[1]]).scale(1).translate([0, 0]);
    let hx = 0, hy = 0;
    for (const q of pts) {
      if (geoDistance(centre, q) > Math.PI / 2 - 0.15) return 0; // wider than a hemisphere: full disc
      const [x, y] = p(q);
      hx = Math.max(hx, Math.abs(x));
      hy = Math.max(hy, Math.abs(y));
    }
    return Math.min((W / 2) * fx / Math.max(hx, 1e-6), (H / 2) * fy / Math.max(hy, 1e-6));
  }
  const bboxSamples = ([w, s, e, n]) => {
    const width = e >= w ? e - w : e + 360 - w;
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const lng = w + (width * i) / 8;
      for (let j = 0; j <= 4; j++) pts.push([lng, s + ((n - s) * j) / 4]);
    }
    return pts;
  };
  const MAX_SCALE = W / (1000 / R_KM); // the frame always spans at least 1,000 km

  function countryMap(c, { id = 'm' } = {}) {
    const centre = c.bbox ? bboxCentre(c.bbox) : [c.labelLatLng[1], c.labelLatLng[0]];
    let scale = c.bbox ? fitScale(centre, bboxSamples(c.bbox)) : MAX_SCALE;
    if (!scale || scale < H / 2 - 14) scale = 0;
    scale = Math.min(scale || 0, MAX_SCALE);
    // Mid-ocean states: zoom out until some other land is in the frame.
    const viewRadius = (sc) => { const hd = Math.hypot(W, H) / 2 / sc; return hd >= 1 ? Math.PI / 2 : Math.asin(hd); };
    const cu = unit(centre);
    const context = (sc) => {
      const cos = Math.cos(viewRadius(sc) * 0.75);
      const seen = new Set();
      for (const [iso3, v] of verts) {
        if (iso3 !== c.iso3 && v[0] * cu[0] + v[1] * cu[1] + v[2] * cu[2] > cos) seen.add(iso3);
        if (seen.size >= 2) return true;
      }
      return false;
    };
    while (scale > H / 2 && !context(scale)) scale /= 1.5;
    const tinyHere = c.tiny || !c.inMap;
    const r = render({
      id,
      centre,
      scale,
      subject: c.inMap ? [c.iso3] : [],
      neighbours: c.borders,
      capital: c.capitalLatLng ? { latLng: c.capitalLatLng, name: c.capital } : null,
      rings: tinyHere ? [{ latLng: c.labelLatLng }] : [],
      isolated: c.borders.length === 0,
      label: { iso3: c.inMap ? c.iso3 : null, name: c.name, latLng: c.labelLatLng },
      title: `Locator map of ${c.name}`,
    });
    return { ...r, centre };
  }

  function regionMap(region, members) {
    const view = REGION_VIEW[region];
    const centre = view.centre;
    const scale = view.widthKm ? W / (view.widthKm / R_KM) : 0; // 0 = whole disc
    const r = render({
      id: 'r',
      centre,
      scale,
      group: members.map((c) => c.iso3),
      title: `Map of the ${members.length} countries of ${region}`,
    });
    return { ...r, centre };
  }

  return { countryMap, regionMap };
}

// Hand-set views so each region reads as one block (frame width in km; null shows the whole disc).
const REGION_VIEW = {
  Europe: { centre: [17, 53], widthKm: 5600 },
  Asia: { centre: [88, 28], widthKm: null },
  Africa: { centre: [18, 2], widthKm: 11500 },
  Americas: { centre: [-80, 12], widthKm: null },
  Oceania: { centre: [162, -14], widthKm: 11000 },
};
