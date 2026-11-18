// world-atlas rings are stitched across the antimeridian: consecutive points can jump 360° in
// longitude (RUS, FJI) and Antarctica's coast ring winds a full turn around the south pole. That is
// valid on the sphere but wrong in planar lng/lat. These helpers turn rings into planar polygons:
//  - longitudes are unwrapped so no step exceeds 180°; the ring may then extend past ±180 and is
//    drawn again shifted by ∓360 (`shifts`), which the rasteriser clips to the map;
//  - a ring that winds around a pole is closed along that pole (a cap polygon);
//  - degenerate rings lying on the pole line are dropped.

export function unwrapRing(ring) {
  const n = ring.length;
  if (n < 3) return null;
  const pts = new Array(n);
  let off = 0, prev = ring[0][0], latSum = 0;
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (let i = 0; i < n; i++) {
    let x = ring[i][0] + off;
    if (i > 0) {
      const d = x - prev;
      if (d > 180) { off -= 360; x -= 360; } else if (d < -180) { off += 360; x += 360; }
    }
    const y = ring[i][1];
    pts[i] = [x, y];
    prev = x;
    latSum += y;
    if (x < minLng) minLng = x; if (x > maxLng) maxLng = x;
    if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
  }
  if (maxLat - minLat < 0.01) return null; // sliver on the pole line
  const winds = Math.abs(pts[n - 1][0] - pts[0][0]) > 180;
  if (winds) {
    const pole = latSum / n < 0 ? -90 : 90;
    pts.push([pts[n - 1][0], pole], [pts[0][0], pole]);
  }
  const shifts = [];
  for (let k = -2; k <= 2; k++) {
    const s = k * 360;
    if (maxLng + s > -180 && minLng + s < 180) shifts.push(s);
  }
  return { pts, shifts, winds, minLng, maxLng, minLat, maxLat };
}

// Planar polygons for triangulation: [{ outer: pts, holes: [pts...] }]. On the sphere one copy is
// enough (longitude is periodic), so `copies` is only for rasterising onto the flat map.
export function planarPolygons(polys, { copies = false } = {}) {
  const out = [];
  for (const poly of polys) {
    const rings = poly.map(unwrapRing);
    if (rings.some((r) => r && r.winds)) {
      // pole caps: each winding ring is its own polygon
      for (const r of rings) if (r && r.winds) for (const s of copies ? r.shifts : [0]) out.push({ outer: shift(r.pts, s), holes: [] });
      continue;
    }
    const outer = rings[0];
    if (!outer) continue;
    // align each hole to the outer ring's unwrapped longitude range
    const mid = (outer.minLng + outer.maxLng) / 2;
    const holes = rings.slice(1).filter(Boolean).map((h) => shift(h.pts, -360 * Math.round(((h.minLng + h.maxLng) / 2 - mid) / 360)));
    for (const s of copies ? outer.shifts : [0]) out.push({ outer: shift(outer.pts, s), holes: holes.map((h) => shift(h, s)) });
  }
  return out;
}

const shift = (pts, s) => (s === 0 ? pts : pts.map(([x, y]) => [x + s, y]));

// Exact, antimeridian-safe point-in-polygon index over the same planar polygons the globe draws.
// countryAt(lat, lng) -> iso3 | null. Bbox prefilter over flat typed arrays; ~0.05 ms per query.
export class CountryLookup {
  constructor(shapes) {
    this.polys = [];   // { iso3, rings: [Float64Array xy...] }
    const boxes = [];
    for (const [iso3, polys] of shapes) {
      for (const { outer, holes } of planarPolygons(polys, { copies: true })) {
        const rings = [outer, ...holes].map((r) => { const a = new Float64Array(r.length * 2); r.forEach(([x, y], i) => { a[i * 2] = x; a[i * 2 + 1] = y; }); return a; });
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i < rings[0].length; i += 2) {
          const x = rings[0][i], y = rings[0][i + 1];
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        this.polys.push({ iso3, rings });
        boxes.push(x0, y0, x1, y1);
      }
    }
    this.boxes = new Float64Array(boxes);
  }
  countryAt(lat, lng) {
    const b = this.boxes;
    for (let p = 0, n = this.polys.length; p < n; p++) {
      const o = p * 4;
      if (lat < b[o + 1] || lat > b[o + 3]) continue;
      // the polygon may live in unwrapped longitude: try the point at lng and lng ± 360
      for (let s = -360; s <= 360; s += 360) {
        const x = lng + s;
        if (x < b[o] || x > b[o + 2]) continue;
        if (inPoly(this.polys[p].rings, x, lat)) return this.polys[p].iso3;
      }
    }
    return null;
  }
}

function inRing(r, x, y) {
  let inside = false;
  for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
    const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inPoly(rings, x, y) {
  if (!inRing(rings[0], x, y)) return false;
  for (let k = 1; k < rings.length; k++) if (inRing(rings[k], x, y)) return false;
  return true;
}
