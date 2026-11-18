// Small spherical helpers. Coordinates are [lat, lng] in degrees throughout the game.
const R = 6371; // km
const rad = (d) => (d * Math.PI) / 180;

export function distanceKm(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Planar point-in-polygon in lng/lat space. Natural Earth rings are cut at the antimeridian,
// so this matches what the globe draws.
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonsContain(polys, lat, lng) {
  for (const poly of polys) {
    if (!inRing(lng, lat, poly[0])) continue;
    let hole = false;
    for (let k = 1; k < poly.length; k++) if (inRing(lng, lat, poly[k])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

// Nearest vertex distance from a point to a set of polygons. Good enough at 1:50m density.
export function distanceToPolygonsKm(polys, point) {
  let best = Infinity;
  for (const poly of polys) for (const ring of poly) {
    for (let i = 0; i < ring.length; i += 1) {
      const d = distanceKm(point, [ring[i][1], ring[i][0]]);
      if (d < best) best = d;
    }
  }
  return best;
}

// Distances print in the player's unit. Everything is measured in km; miles are a display choice.
const KM_PER_MI = 1.609344;
let unit = 'km';
export const setUnits = (u) => { unit = u === 'mi' ? 'mi' : 'km'; };
export const getUnits = () => unit;
export const toUnit = (km) => (unit === 'mi' ? km / KM_PER_MI : km);
export const fromUnit = (v) => (unit === 'mi' ? v * KM_PER_MI : v);

// Kept as formatKm for its many callers: it takes km and prints km or miles.
export function formatKm(km) {
  const v = toUnit(km);
  if (v < 1) return `< 1 ${unit}`;
  if (v < 10) return `${v.toFixed(1)} ${unit}`;
  return `${Math.round(v).toLocaleString('en-GB')} ${unit}`;
}
