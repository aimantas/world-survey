// Screen-space fat lines: one instanced quad per segment, constant pixel width, AA edges, optional
// paper halo, solid / dash-dot / dashed patterns. Three uses: base line work (borders + coasts, one
// draw), highlight outlines (one draw), arcs (one draw, lifted in 3D with draw-on progress).
import {
  InstancedBufferGeometry, InstancedBufferAttribute, BufferAttribute, ShaderMaterial, Mesh, Color, Vector2,
  Sphere, Vector3, DoubleSide,
} from './three.js';
import { GLSL_COMMON } from './shaders.js';
import { DEG } from './util.js';

const MAX_STYLES = 8;
export const MAX_SLOTS = 32;

const VERT = /* glsl */ `
${GLSL_COMMON}
attribute vec3 iA;
attribute vec3 iB;
attribute vec2 iD;      // cumulative distance at A and B (world units)
attribute vec2 iS;      // x: style index, y: slot index (highlight fade / arc id)
#ifdef ARC
attribute vec2 iT;      // arc parameter at A and B (0..1)
#endif
uniform vec2 uRes;      // drawing buffer px
uniform float uDpr;
uniform float uPxPerUnit;
uniform float uLift;
uniform float uWidthScale;
uniform float uWidth[${MAX_STYLES}];
uniform float uHalo[${MAX_STYLES}];
uniform float uSlot[${MAX_SLOTS}];
varying float vSide;
varying float vDist;
varying float vFade;
varying float vT;
varying float vAlong;   // px along the segment, 0 at A, vLen at B (extends past both ends)
flat varying float vLen;
flat varying float vHalfW;
flat varying float vHaloW;
flat varying int vStyle;
flat varying float vSlotV;

void main() {
  int st = int(iS.x + 0.5);
  int sl = int(iS.y + 0.5);
  vStyle = st;
  vSlotV = uSlot[sl];
#ifdef ARC
  vec3 pa = iA, pb = iB;
  vFade = 1.0;
#else
  vec3 a = normalize(iA), b = normalize(iB);
  float va = horizonVis(a), vb = horizonVis(b);
  if (va < -0.02 && vb < -0.02) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 pa = a * (1.0 + uDisp * heightAt(a) + uLift * uLiftK);
  vec3 pb = b * (1.0 + uDisp * heightAt(b) + uLift * uLiftK);
  vFade = smoothstep(0.0, 0.07, position.x < 0.5 ? va : vb);
#endif
  vec4 ca = projectionMatrix * viewMatrix * vec4(pa, 1.0);
  vec4 cb = projectionMatrix * viewMatrix * vec4(pb, 1.0);
  vec2 sa = ca.xy / ca.w * uRes * 0.5;
  vec2 sb = cb.xy / cb.w * uRes * 0.5;
  vec2 dir = sb - sa;
  float len = length(dir);
  dir = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw = uWidth[st] * uWidthScale * uDpr * 0.5;
  float halo = uHalo[st] * uDpr;
  float ext = hw + halo + 1.0;
  float t = position.x;
  vec4 c = t < 0.5 ? ca : cb;
  vec2 off = nrm * position.y * ext + dir * (t * 2.0 - 1.0) * ext;
  c.xy += off / (uRes * 0.5) * c.w;
  gl_Position = c;
  vSide = position.y * ext;
  vAlong = t * len + (t * 2.0 - 1.0) * ext;
  vLen = len;
  vHalfW = hw;
  vHaloW = halo;
  float segWorld = iD.y - iD.x;
  float pxPerWorld = len / max(segWorld, 1e-7);
  float distPx = mix(iD.x, iD.y, t) * uPxPerUnit + (t * 2.0 - 1.0) * ext * (uPxPerUnit / max(pxPerWorld, 1e-3));
  vDist = distPx;
#ifdef ARC
  vT = mix(iT.x, iT.y, t) + (t * 2.0 - 1.0) * ext / max(len, 1e-3) * (iT.y - iT.x);
#else
  vT = 0.0;
#endif
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor[${MAX_STYLES}];
uniform int uPattern[${MAX_STYLES}];   // 0 solid, 1 dash-dot, 2 dashed
uniform float uAlpha[${MAX_STYLES}];
uniform vec3 uHaloColor;
uniform float uDpr;
uniform float uTime;
varying float vSide;
varying float vDist;
varying float vFade;
varying float vT;
varying float vAlong;
flat varying float vLen;
flat varying float vHalfW;
flat varying float vHaloW;
flat varying int vStyle;
flat varying float vSlotV;

float band(float q, float a, float b) {
  float d = max(a - q, q - b);
  return 1.0 - smoothstep(-0.5, 0.5, d);
}

void main() {
  float a = vFade * uAlpha[vStyle];
#ifdef ARC
  if (vT > vSlotV) discard;
#else
  a *= vSlotV;
#endif
  if (a < 0.002) discard;
  // round caps: past either end, distance is measured from the endpoint (gives round joins too)
  float over = max(-vAlong, vAlong - vLen);
  float d = over > 0.0 ? length(vec2(over, vSide)) : abs(vSide);
  float core = 1.0 - smoothstep(vHalfW - 0.5, vHalfW + 0.5, d);
  float outer = vHaloW > 0.0 ? 1.0 - smoothstep(vHalfW + vHaloW - 0.6, vHalfW + vHaloW + 0.6, d) : core;
  int p = uPattern[vStyle];
  float pat = 1.0;
  if (p == 1) {
    float P = 14.0 * uDpr;
    float q = mod(vDist, P);
    pat = max(band(q, 1.0 * uDpr, 7.5 * uDpr), band(q, 10.0 * uDpr, 11.4 * uDpr));
  } else if (p == 2) {
    float P = 9.0 * uDpr;
    float q = mod(vDist - uTime * 14.0 * uDpr, P);
    pat = band(q, 0.8 * uDpr, 5.8 * uDpr);
  }
#if defined(HALO_PASS)
  // paper casing only; the core pass draws on top, so joints never get notched
  if (vHaloW <= 0.0) discard;
  float alpha = outer * pat * a;
  vec3 col = uHaloColor;
#elif defined(CORE_PASS)
  float alpha = core * pat * a;
  vec3 col = uColor[vStyle];
#else
  float alpha = outer * pat * a;
  vec3 col = mix(uHaloColor, uColor[vStyle], core / max(outer, 1e-4));
#endif
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}
`;

// pass: 'both' (single draw, for lines without casing), 'halo' or 'core' (two draws sharing geometry
// and uniforms: casing first, then ink, so overlapping segment ends never cut notches).
export function createLineMaterial(sharedUniforms, styles, { arc = false, pass = 'both', uniforms: reuse = null } = {}) {
  const color = [], width = [], halo = [], pattern = [], alpha = [];
  for (let i = 0; i < MAX_STYLES; i++) {
    const s = styles[i] || styles[0];
    color.push(new Color(s.color)); width.push(s.width); halo.push(s.halo || 0);
    pattern.push(s.pattern || 0); alpha.push(s.alpha ?? 1);
  }
  const slots = new Array(MAX_SLOTS).fill(1);
  const defines = {};
  if (arc) defines.ARC = '';
  if (pass === 'halo') defines.HALO_PASS = '';
  if (pass === 'core') defines.CORE_PASS = '';
  const uniforms = reuse || {
    ...sharedUniforms,
    uWidthScale: { value: 1 },
    uLift: { value: 0.0006 },
    uColor: { value: color }, uWidth: { value: width }, uHalo: { value: halo },
    uPattern: { value: pattern }, uAlpha: { value: alpha },
    uHaloColor: { value: new Color('#f4f5f0') },
    uSlot: { value: slots },
  };
  return new ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: arc, side: DoubleSide,
    defines,
  });
}

// Base quad shared by all line geometries.
function quadAttributes(geo) {
  geo.setAttribute('position', new BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 0, 1, 0, 1, 1, 0]), 3));
  geo.setIndex([0, 2, 1, 2, 3, 1]);
}

// Builder that accumulates segments into typed arrays (grows geometrically).
export class SegmentBuffer {
  constructor(cap = 1024, arc = false) {
    this.arc = arc;
    this.n = 0;
    this._alloc(cap);
  }
  _alloc(cap) {
    const grow = (old, k) => { const a = new Float32Array(cap * k); if (old) a.set(old.subarray(0, this.n * k)); return a; };
    this.A = grow(this.A, 3); this.B = grow(this.B, 3); this.D = grow(this.D, 2); this.S = grow(this.S, 2);
    if (this.arc) this.T = grow(this.T, 2);
    this.cap = cap;
  }
  push(ax, ay, az, bx, by, bz, d0, d1, style, slot, t0 = 0, t1 = 0) {
    if (this.n >= this.cap) this._alloc(this.cap * 2);
    const i = this.n++;
    this.A[i * 3] = ax; this.A[i * 3 + 1] = ay; this.A[i * 3 + 2] = az;
    this.B[i * 3] = bx; this.B[i * 3 + 1] = by; this.B[i * 3 + 2] = bz;
    this.D[i * 2] = d0; this.D[i * 2 + 1] = d1;
    this.S[i * 2] = style; this.S[i * 2 + 1] = slot;
    if (this.arc) { this.T[i * 2] = t0; this.T[i * 2 + 1] = t1; }
  }
  toGeometry(geo = new InstancedBufferGeometry()) {
    const n = this.n;
    quadAttributes(geo);
    geo.setAttribute('iA', new InstancedBufferAttribute(this.A.slice(0, n * 3), 3));
    geo.setAttribute('iB', new InstancedBufferAttribute(this.B.slice(0, n * 3), 3));
    geo.setAttribute('iD', new InstancedBufferAttribute(this.D.slice(0, n * 2), 2));
    geo.setAttribute('iS', new InstancedBufferAttribute(this.S.slice(0, n * 2), 2));
    if (this.arc) geo.setAttribute('iT', new InstancedBufferAttribute(this.T.slice(0, n * 2), 2));
    geo.instanceCount = n;
    geo.boundingSphere = new Sphere(new Vector3(), 2);
    return geo;
  }
}

// True for the artificial edges Natural Earth adds when cutting rings at the antimeridian / poles.
// Coordinates are quantised (~0.0036°), so "on the antimeridian" means within 0.02° of it.
function cutEdge(lng0, lat0, lng1, lat1) {
  return Math.abs(lng1 - lng0) > 180 ||
    (Math.abs(lng0) >= 179.98 && Math.abs(lng1) >= 179.98) || (Math.abs(lat0) >= 89.98 && Math.abs(lat1) >= 89.98);
}

// Appends a [lng,lat] polyline (or closed ring) on the sphere, subdividing long segments in lng/lat
// space (that is how the polygons are defined) and skipping antimeridian / pole cut edges.
export function pushPolyline(buf, coords, style, slot, maxStepDeg = 0.6) {
  let dist = 0;
  let px = 0, py = 0, pz = 0, has = false;
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng0, lat0] = coords[i];
    const [lng1, lat1] = coords[i + 1];
    if (cutEdge(lng0, lat0, lng1, lat1)) { has = false; continue; }
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(lng1 - lng0), Math.abs(lat1 - lat0)) / maxStepDeg));
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const la0 = (lat0 + (lat1 - lat0) * t0) * DEG, lo0 = (lng0 + (lng1 - lng0) * t0) * DEG;
      const la1 = (lat0 + (lat1 - lat0) * t1) * DEG, lo1 = (lng0 + (lng1 - lng0) * t1) * DEG;
      let ax, ay, az;
      if (has && s === 0) { ax = px; ay = py; az = pz; }
      else { const c = Math.cos(la0); ax = c * Math.sin(lo0); ay = Math.sin(la0); az = c * Math.cos(lo0); }
      const c1 = Math.cos(la1);
      const bx = c1 * Math.sin(lo1), by = Math.sin(la1), bz = c1 * Math.cos(lo1);
      const seg = Math.hypot(bx - ax, by - ay, bz - az);
      if (seg < 1e-9) continue;
      buf.push(ax, ay, az, bx, by, bz, dist, dist + seg, style, slot);
      dist += seg;
      px = bx; py = by; pz = bz; has = true;
    }
  }
}

export function createLineMesh(material, geometry, renderOrder) {
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = renderOrder;
  return mesh;
}

export const LINE_RES = () => ({ uRes: { value: new Vector2(1, 1) } });
