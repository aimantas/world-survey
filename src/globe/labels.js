// HTML overlay labels: country names in map lettering (wide, letter-spaced caps, paper halo),
// italic blue ocean names, and arc distance labels in mono. Positions are projected once per frame
// only when the camera or the label set changed; DOM writes happen only when a value changes.
import { Vector3 } from './three.js';
import { latLngToVec3, slerpUnit } from './util.js';

const STYLE_ID = 'globe-engine-style';
const CSS = `
.globe-root{position:relative;width:100%;height:100%;overflow:hidden;contain:strict;-webkit-tap-highlight-color:transparent}
.globe-root canvas{display:block;width:100%;height:100%;touch-action:none;outline:none;cursor:grab}
.globe-root canvas.is-dragging{cursor:grabbing}
.globe-root canvas.is-pointing{cursor:pointer}
.globe-root.is-fading{transition:opacity .12s ease}
.globe-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.globe-label,.globe-label--ocean,.globe-arc-label{position:absolute;left:0;top:0;white-space:nowrap;will-change:transform,opacity;opacity:0;transition:opacity .18s ease;user-select:none}
.globe-label.is-on,.globe-label--ocean.is-on,.globe-arc-label.is-on{opacity:1}
.globe-label{font:600 11px/1 'Archivo',system-ui,sans-serif;font-stretch:125%;letter-spacing:.2em;text-transform:uppercase;color:#1b232b;
  text-shadow:0 0 2px #f4f5f0,0 0 2px #f4f5f0,1px 0 0 #f4f5f0,-1px 0 0 #f4f5f0,0 1px 0 #f4f5f0,0 -1px 0 #f4f5f0}
.globe-label[data-rank="1"]{font-size:13px;letter-spacing:.26em}
.globe-label[data-rank="3"]{font-size:9.5px;font-weight:600;letter-spacing:.16em}
.globe-label.is-strong{font-weight:800;color:#1b232b}
.globe-label--ocean{font:italic 400 14px/1 'Source Serif 4',Georgia,serif;letter-spacing:.24em;color:#2f6f99;opacity:0;
  text-shadow:0 0 3px rgba(169,210,228,.9)}
.globe-label--ocean.is-on{opacity:.85}
.globe-root.is-compact .globe-label{font-size:9.5px;letter-spacing:.16em}
.globe-root.is-compact .globe-label[data-rank="1"]{font-size:11px;letter-spacing:.2em}
.globe-root.is-compact .globe-label[data-rank="3"]{font-size:8.5px;letter-spacing:.12em}
.globe-root.is-compact .globe-label--ocean{font-size:12px;letter-spacing:.18em}
.globe-arc-label{font:600 12px/1 'JetBrains Mono',ui-monospace,monospace;color:#c3177b;background:#f4f5f0;padding:3px 6px 3px;border:1px solid #c3177b;border-radius:2px;letter-spacing:.02em}
`;

export function injectStyle(doc = document) {
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  doc.head.prepend(el); // prepend so page CSS overrides it
}

export const OCEANS = [
  { text: 'Pacific Ocean', lat: 12, lng: -148 },
  { text: 'Pacific Ocean', lat: -18, lng: -118 },
  { text: 'Pacific Ocean', lat: 24, lng: 160 },
  { text: 'Atlantic Ocean', lat: 27, lng: -44 },
  { text: 'Atlantic Ocean', lat: -24, lng: -16 },
  { text: 'Indian Ocean', lat: -22, lng: 78 },
  { text: 'Arctic Ocean', lat: 86, lng: 95 },
  { text: 'Southern Ocean', lat: -60, lng: 30 },
  { text: 'Southern Ocean', lat: -61, lng: -125 },
];

// Is a w x h box centred at (x, y) fully inside the globe disc (cx, cy, r) and the viewport?
function fits(x, y, w, h, ctx, disc) {
  const hw = w / 2, hh = h / 2;
  if (x - hw < 2 || x + hw > ctx.width - 2 || y - hh < 2 || y + hh > ctx.height - 2) return false;
  if (!disc) return true;
  const r2 = ctx.r * ctx.r;
  const dy = Math.max(Math.abs(y - hh - ctx.cy), Math.abs(y + hh - ctx.cy));
  const dx = Math.max(Math.abs(x - hw - ctx.cx), Math.abs(x + hw - ctx.cx));
  return dx * dx + dy * dy < r2;
}

export class Labels {
  constructor(root) {
    this.layer = document.createElement('div');
    this.layer.className = 'globe-labels';
    root.appendChild(this.layer);
    this.country = [];   // { el, pos, area, text, x, y, on, rank, w, h }
    this.oceans = [];
    this.arcs = new Map(); // id -> { el, a, b, lift, progress, on, x, y, w, h, t, perp }
    this.mode = null;
    this._v = new Vector3();
    this._boxes = [];
    this.oceanOn = true;
  }
  _make(cls, text) {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    this.layer.appendChild(el);
    return el;
  }
  setOceans(on) {
    this.oceanOn = on;
    if (!this.oceans.length && on) {
      for (const o of OCEANS) this.oceans.push({ el: this._make('globe-label--ocean', o.text), pos: latLngToVec3(o.lat, o.lng), on: false, x: -1e4, y: -1e4 });
    }
  }
  // list: array of { iso3, text, latLng?, strong? } or 'auto' or null
  setCountries(list, data) {
    for (const l of this.country) l.el.remove();
    this.country = [];
    this.mode = list === 'auto' ? 'auto' : list ? 'list' : null;
    if (!list) return;
    const src = list === 'auto'
      ? data.countries.filter((c) => c.inMap && c.labelLatLng && (c.sovereign || c.area > 40000)).map((c) => ({ iso3: c.iso3 }))
      : list;
    for (const item of src) {
      const c = data.byIso.get(item.iso3);
      const ll = item.latLng || c?.labelLatLng;
      if (!ll) continue;
      const area = c?.area || 1000;
      const rank = area > 1.5e6 ? 1 : area > 1.5e5 ? 2 : 3;
      const text = item.text ?? c?.name ?? item.iso3;
      const el = this._make('globe-label', text);
      el.dataset.rank = String(this.mode === 'list' ? Math.min(rank, 2) : rank);
      if (item.strong) el.classList.add('is-strong');
      // tiny states carry a ring on the globe: their name sits just below it instead of on top
      const ringed = !!(c?.tiny || !data.shapes.has(item.iso3));
      this.country.push({ el, iso3: item.iso3, pos: latLngToVec3(ll[0], ll[1]), area, text, x: -1e4, y: -1e4, on: false, rank, w: 0, h: 0, ringed });
    }
    // measure once (font may still be loading; re-measured lazily when width is 0)
    for (const l of this.country) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
    if (this.mode === 'auto') this.country.sort((a, b) => b.area - a.area);
  }
  // Arc distance chip. It sits on the lifted arc, at whichever point along it (or beside it) keeps it
  // clear of every other label; the chosen spot is kept while it stays clear, so it never jitters.
  addArc(id, a, b, lift, text) {
    const el = this._make('globe-arc-label', text);
    this.arcs.set(id, { el, a: a.clone(), b: b.clone(), lift, progress: 0, on: false, x: -1e4, y: -1e4, w: 0, h: 0, t: 0.5, perp: 0 });
  }
  setArcProgress(id, u) { const a = this.arcs.get(id); if (a) a.progress = u; }
  clearArcs() { for (const a of this.arcs.values()) a.el.remove(); this.arcs.clear(); }

  // Boxes of every label shown after the last update: flat [x0, y0, x1, y1, ...] in CSS px.
  get boxes() { return this._boxes; }

  // proj(v, out, lifted) -> writes css px into out.x/out.y and returns horizon visibility (>0 visible)
  update(project, ctx) {
    const v = this._v;
    const boxes = this._boxes;
    boxes.length = 0;
    // oceans
    for (const o of this.oceans) {
      const vis = this.oceanOn ? project(o.pos, v) : -1;
      if (vis > 0 && !o.w) { o.w = o.el.offsetWidth || 140; o.h = o.el.offsetHeight || 16; }
      const on = vis > 0.38 && fits(v.x, v.y, (o.w || 140) + 8, (o.h || 16) + 4, ctx, true);
      place(o, v, on);
      if (o.on) boxes.push(o.x - o.w / 2 - 4, o.y - o.h / 2 - 2, o.x + o.w / 2 + 4, o.y + o.h / 2 + 2);
    }
    // countries
    const auto = this.mode === 'auto';
    const kmPerPx = ctx.kmPerPx;
    let shown = 0;
    for (const l of this.country) {
      const vis = project(l.pos, v);
      let on = vis > (auto ? 0.15 : 0.05) && v.x > -200 && v.x < ctx.width + 200 && v.y > -50 && v.y < ctx.height + 50;
      if (on && !l.w) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
      if (l.ringed) v.y += 13 + l.h / 2;
      if (on) on = fits(v.x, v.y, l.w, l.h, ctx, auto);
      const hw = l.w / 2 + 4, hh = l.h / 2 + 3;
      if (on && auto) {
        const sizePx = Math.sqrt(l.area) / kmPerPx;
        on = sizePx > Math.max(30, l.w * 0.55) && shown < 70 && !overlaps(boxes, v.x, v.y, hw, hh);
        if (on) shown++;
      }
      place(l, v, on);
      if (on) boxes.push(v.x - hw, v.y - hh, v.x + hw, v.y + hh);
    }
    // arc chips last, so they can step around country and ocean names
    for (const a of this.arcs.values()) this._placeArc(a, project, ctx, boxes);
  }

  _placeArc(a, project, ctx, boxes) {
    const v = this._v;
    if (a.progress < 0.6) { place(a, v, false); return; }
    if (!a.w) { a.w = a.el.offsetWidth || 72; a.h = a.el.offsetHeight || 20; }
    const hw = a.w / 2 + 3, hh = a.h / 2 + 3;
    const P = this._p || (this._p = new Vector3()), Q = this._q || (this._q = new Vector3());
    const at = (t, out) => slerpUnit(a.a, a.b, t, out).multiplyScalar(1 + 0.0065 + a.lift * Math.sin(Math.PI * t));
    let best = null, bestScore = Infinity;
    const tryAt = (t, perp) => {
      if (t > a.progress) return false;
      at(t, P);
      if (project(P, v, true) <= 0) return false;
      let x = v.x, y = v.y;
      if (perp) {
        // offset perpendicular to the arc on screen
        at(Math.min(1, t + 0.02), Q);
        project(Q, Q, true);
        let tx = Q.x - x, ty = Q.y - y; const len = Math.hypot(tx, ty) || 1;
        tx /= len; ty /= len;
        x += -ty * perp; y += tx * perp;
      }
      if (!fits(x, y, a.w + 4, a.h + 4, ctx, false)) return false;
      const score = overlapArea(boxes, x, y, hw, hh) + (ctx.marks ? overlapArea(ctx.marks, x, y, hw, hh) : 0);
      if (score < bestScore) { bestScore = score; best = { x, y, t, perp }; }
      return score === 0;
    };
    const step = a.h + 10;
    const cands = [[a.t, a.perp], [0.5, 0], [0.42, 0], [0.58, 0], [0.34, 0], [0.66, 0], [0.26, 0], [0.74, 0],
      [0.5, step], [0.5, -step], [0.4, step], [0.6, -step], [0.5, 2 * step], [0.5, -2 * step]];
    for (const [t, perp] of cands) if (tryAt(t, perp)) break;
    if (!best) { place(a, v, false); return; }
    a.t = best.t; a.perp = best.perp;
    v.x = best.x; v.y = best.y;
    place(a, v, true);
    boxes.push(best.x - hw, best.y - hh, best.x + hw, best.y + hh);
  }

  dispose() { this.layer.remove(); }
}

function overlaps(boxes, x, y, hw, hh) {
  for (let i = 0; i < boxes.length; i += 4) {
    if (x + hw > boxes[i] && x - hw < boxes[i + 2] && y + hh > boxes[i + 1] && y - hh < boxes[i + 3]) return true;
  }
  return false;
}
function overlapArea(boxes, x, y, hw, hh) {
  let s = 0;
  for (let i = 0; i < boxes.length; i += 4) {
    const w = Math.min(x + hw, boxes[i + 2]) - Math.max(x - hw, boxes[i]);
    const h = Math.min(y + hh, boxes[i + 3]) - Math.max(y - hh, boxes[i + 1]);
    if (w > 0 && h > 0) s += w * h;
  }
  return s;
}

function place(item, v, on) {
  if (on) {
    const x = Math.round(v.x * 2) / 2, y = Math.round(v.y * 2) / 2;
    if (x !== item.x || y !== item.y) {
      item.el.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      item.x = x; item.y = y;
    }
  }
  if (on !== item.on) { item.el.classList.toggle('is-on', on); item.on = on; }
}
