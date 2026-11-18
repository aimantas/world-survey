// Spherical geometry helpers for the data build. Pure functions, no I/O.
import { geoArea, geoCentroid, geoAzimuthalEquidistant } from 'd3-geo';
import polylabel from 'polylabel';

export const R_KM = 6371.0088; // mean Earth radius (IUGG)
const RAD = Math.PI / 180;

export function vec(lon, lat) {
  const l = lon * RAD, p = lat * RAD, c = Math.cos(p);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
}

export function haversineKm([lon1, lat1], [lon2, lat2]) {
  const dp = (lat2 - lat1) * RAD, dl = (lon2 - lon1) * RAD;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dl / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Spherical area of one polygon (array of rings, d3/GeoJSON coordinates) in km².
// world-atlas follows d3's winding; if a ring set comes out inverted (> half the sphere), flip it.
export function polygonAreaKm2(rings) {
  let a = geoArea({ type: 'Polygon', coordinates: rings });
  if (a > 2 * Math.PI) a = 4 * Math.PI - a;
  return a * R_KM * R_KM;
}

// Planar point-in-ring (lon/lat, ray casting). Adequate for polygons already cut at the antimeridian.
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function pointInPolygon(pt, rings) {
  if (!pointInRing(pt, rings[0])) return false;
  for (let k = 1; k < rings.length; k++) if (pointInRing(pt, rings[k])) return false;
  return true;
}

// Minimal longitude interval covering all longitudes. Returns [west, east]; west > east when it
// crosses the antimeridian (e.g. Russia, Fiji).
export function lonInterval(lons) {
  const s = [...new Set(lons.map((l) => (l === -180 ? 180 : l)))].sort((a, b) => a - b);
  if (s.length === 1) return [s[0], s[0]];
  let gap = s[0] + 360 - s[s.length - 1], gi = s.length - 1; // the gap that wraps through ±180
  for (let i = 0; i < s.length - 1; i++) {
    const g = s[i + 1] - s[i];
    if (g > gap) { gap = g; gi = i; }
  }
  if (gap < 10) return [-180, 180]; // vertices all around the globe (Antarctica)
  if (gi === s.length - 1) return [s[0], s[s.length - 1]];
  return [s[gi + 1], s[gi]];
}

export function bboxOf(points) {
  const [w, e] = lonInterval(points.map((p) => p[0]));
  let s = Infinity, n = -Infinity;
  for (const p of points) { if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
  return [w, s, e, n];
}

// Pole of inaccessibility on a local azimuthal-equidistant projection centred on the polygon,
// so high-latitude shapes are not distorted the way plain lon/lat would be.
export function polylabelSphere(rings) {
  const c = geoCentroid({ type: 'Polygon', coordinates: rings });
  const proj = geoAzimuthalEquidistant().rotate([-c[0], -c[1]]).scale(R_KM).translate([0, 0]).clipAngle(null);
  // Spherical rings have no planar "outer" ring by position (world-atlas encodes Antarctica with a
  // tiny ring around the pole first); polylabel needs the largest planar ring first.
  const planarArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]); return Math.abs(a / 2); };
  const projected = rings.map((r) => r.map((p) => proj(p))).sort((a, b) => planarArea(b) - planarArea(a));
  const areaKm2 = polygonAreaKm2(rings);
  const precision = Math.max(0.05, Math.sqrt(areaKm2) / 2000); // km
  const pt = polylabel(projected, precision);
  const ll = proj.invert(pt);
  return [ll[1], ll[0]]; // [lat, lng]
}

// True when some vertex of a is within maxKm of some vertex of b (chord test on unit vectors).
export function withinKm(aVecs, bVecs, maxKm) {
  const chord = 2 * Math.sin(maxKm / (2 * R_KM));
  const c2 = chord * chord;
  for (let i = 0; i < aVecs.length; i += 3) {
    const ax = aVecs[i], ay = aVecs[i + 1], az = aVecs[i + 2];
    for (let j = 0; j < bVecs.length; j += 3) {
      const dx = ax - bVecs[j], dy = ay - bVecs[j + 1], dz = az - bVecs[j + 2];
      if (dx * dx + dy * dy + dz * dz <= c2) return true;
    }
  }
  return false;
}

export function ringVecs(ring) {
  const out = new Float64Array(ring.length * 3);
  ring.forEach(([lon, lat], i) => { const v = vec(lon, lat); out[i * 3] = v[0]; out[i * 3 + 1] = v[1]; out[i * 3 + 2] = v[2]; });
  return out;
}

// Expanded lon/lat box test used as a cheap prefilter before withinKm.
export function boxesNear(a, b, maxKm) {
  const dLat = maxKm / 111.2;
  if (a.s - dLat > b.n || b.s - dLat > a.n) return false;
  const lat = Math.max(Math.abs(a.s), Math.abs(a.n), Math.abs(b.s), Math.abs(b.n));
  const cosl = Math.cos(Math.min(89, lat + dLat) * RAD);
  const dLon = Math.min(180, maxKm / (111.2 * Math.max(cosl, 1e-3)));
  // circular interval overlap of [a.w - dLon, a.e + dLon] and [b.w, b.e] (no crossing within one polygon)
  const aw = a.w - dLon, ae = a.e + dLon;
  for (const shift of [-360, 0, 360]) if (aw <= b.e + shift && b.w + shift <= ae) return true;
  return false;
}
