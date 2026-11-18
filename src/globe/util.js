// Small spherical helpers for the globe engine. Coordinates are [lat, lng] in degrees.
// World frame: unit sphere, +Y = north pole, (lat 0, lng 0) on +Z, lng 90E on +X.
import { Vector3 } from './three.js';

export const DEG = Math.PI / 180;
export const EARTH_KM = 6371;

export function latLngToVec3(lat, lng, out = new Vector3(), r = 1) {
  const la = lat * DEG, lo = lng * DEG, c = Math.cos(la);
  return out.set(r * c * Math.sin(lo), r * Math.sin(la), r * c * Math.cos(lo));
}

// Writes [lat, lng] into `out` (an array) to avoid allocations in hot paths.
export function vec3ToLatLng(v, out = [0, 0]) {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  out[0] = Math.asin(Math.max(-1, Math.min(1, v.y / len))) / DEG;
  out[1] = Math.atan2(v.x, v.z) / DEG;
  return out;
}

export function wrapLng(lng) {
  let l = ((lng + 180) % 360 + 360) % 360 - 180;
  if (l === -180 && lng > 0) l = 180;
  return l;
}

// Central angle between two unit vectors (radians).
export function angleBetween(a, b) {
  const d = Math.max(-1, Math.min(1, a.dot(b)));
  return Math.acos(d);
}

// Spherical interpolation of unit vectors, written into `out`.
export function slerpUnit(a, b, t, out) {
  const omega = angleBetween(a, b);
  if (omega < 1e-6) return out.copy(a);
  if (Math.PI - omega < 1e-4) {
    // Antipodal: pick any perpendicular axis through the equator plane.
    const axis = Math.abs(a.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
    const perp = axis.sub(a.clone().multiplyScalar(axis.dot(a))).normalize();
    const th = omega * t;
    return out.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(perp, Math.sin(th));
  }
  const s = Math.sin(omega);
  const wa = Math.sin((1 - t) * omega) / s, wb = Math.sin(t * omega) / s;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
}

// bbox = [minLon, minLat, maxLon, maxLat]; minLon > maxLon crosses the antimeridian.
export function bboxFrame(bbox) {
  let [x0, y0, x1, y1] = bbox;
  if (x0 > x1) x1 += 360;
  const lng = wrapLng((x0 + x1) / 2);
  const lat = (y0 + y1) / 2;
  const halfLat = (y1 - y0) / 2;
  // East-west half extent as a central angle at the widest latitude of the box.
  const widestCos = Math.cos(Math.min(Math.abs(y0), Math.abs(y1), y0 <= 0 && y1 >= 0 ? 0 : 90) * DEG);
  const halfLng = Math.asin(Math.min(1, Math.sin(Math.min(90, (x1 - x0) / 2) * DEG) * widestCos)) / DEG;
  return { lat, lng, halfLat, halfLng };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export function hexToLinear(color, hex) { return color.set(hex); } // THREE.Color handles sRGB -> linear

export const now = () => performance.now() / 1000;
