// Screen-facing SDF symbols in one instanced draw: surveyor's targets (guess / answer), benchmark
// triangles (capitals) and tiny-country ring targets. Crisp at any DPR, animated in the shader
// (drop with squash, pulse), faded at the horizon.
import {
  InstancedBufferGeometry, InstancedBufferAttribute, BufferAttribute, ShaderMaterial, Mesh, Color,
  Sphere, Vector3, DoubleSide,
} from './three.js';
import { GLSL_COMMON } from './shaders.js';

export const SHAPE = {
  guess: 0, answer: 1, capital: 2,
  tiny: 3, tinyTarget: 4, tinyCorrect: 5, tinyWrong: 6, tinyNeighbour: 7, tinyFocus: 8,
};

const VERT = /* glsl */ `
${GLSL_COMMON}
attribute vec3 iPos;
attribute vec4 iData;   // shape, start time, half-size (css px), country index
attribute float iHide;  // 1 = hidden (idle ring under a label)
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform float uHoverIdx;
uniform float uTinyAlpha;
uniform float uReduced;
varying vec2 vP;        // symbol space, css px, y up
varying vec2 vQ;        // anchor space, css px
flat varying int vShape;
varying float vFade;
varying float vAge;
varying float vDrop;
varying float vHover;
varying float vSize;

void main() {
  int shape = int(iData.x + 0.5);
  vShape = shape;
  vec3 d = normalize(iPos);
  vec3 p = d * (1.0 + uDisp * heightAt(d) + 0.0012 * uLiftK);
  vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float vis = horizonVis(d);
  vFade = smoothstep(0.0, 0.08, vis) * (shape == 3 ? uTinyAlpha : 1.0);
  // tiny-country rings fade out as the surface turns away (n.v) so they never stack at the limb
  float ndv = dot(d, normalize(cameraPosition - p));
  if (shape == 3) vFade *= smoothstep(0.3, 0.5, ndv);
  else if (shape >= 4) vFade *= smoothstep(0.08, 0.25, ndv);
  if (vis < -0.01 || iHide > 0.5 || (shape == 3 && ndv < 0.3)) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float age = uTime - iData.y;
  vAge = age;
  float size = iData.z;
  float hov = abs(iData.w - uHoverIdx) < 0.5 ? 1.0 : 0.0;
  vHover = hov;
  if (shape == 3) size *= 1.0 + 0.35 * hov;
  vSize = size;
  float drop = 0.0, sx = 1.0, sy = 1.0;
  if (shape <= 2 && uReduced < 0.5) {
    float T = 0.34;
    float tf = clamp(age / T, 0.0, 1.0);
    drop = (1.0 - tf * tf) * 64.0;
    float ts = age - T;
    if (ts > 0.0) {
      float k = exp(-ts * 8.0) * sin(ts * 24.0 + 0.4) * 1.2;
      sy = 1.0 - 0.34 * k; sx = 1.0 + 0.26 * k;
    } else { sy = 1.0 + 0.18 * tf; sx = 1.0 - 0.1 * tf; }
  }
  vDrop = drop;
  float hs = size * 1.45 + 3.0;
  vec2 corner = position.xy;
  vec2 local = vec2(corner.x * hs, mix(-hs, drop + hs, corner.y * 0.5 + 0.5));
  vQ = local;
  vP = vec2(local.x / sx, (local.y - drop + size) / sy - size);
  c.xy += local * uDpr / (uRes * 0.5) * c.w;
  gl_Position = c;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk, uMagenta, uGreen, uPaper;
uniform float uDpr;
uniform float uTime;
varying vec2 vP;
varying vec2 vQ;
flat varying int vShape;
varying float vFade;
varying float vAge;
varying float vDrop;
varying float vHover;
varying float vSize;

float sdRing(vec2 p, float r, float w) { return abs(length(p) - r) - w * 0.5; }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
// Surveyor's target: ring + cross with a centre gap, ticks reaching past the ring.
float sdTarget(vec2 p, float s, float w) {
  float ring = sdRing(p, s * 0.58, w);
  float h = sdBox(p, vec2(s, w * 0.5));
  float v = sdBox(p, vec2(w * 0.5, s));
  float gap = s * 0.22;
  float cross = max(min(h, v), gap - max(abs(p.x), abs(p.y)));
  return min(ring, cross);
}

void main() {
  float aa = 1.0 / uDpr;
  float s = vSize;
  float d = 1e3;
  vec3 col = uInk;
  float halo = 1.6;
  float alpha = 1.0;
  float fill = 0.0;
  int sh = vShape;
  if (sh == 0 || sh == 1) {
    col = sh == 0 ? uMagenta : uInk;
    d = sdTarget(vP, s, 1.7);
    float dotR = sh == 1 ? 2.3 : 1.3;
    d = min(d, length(vP) - dotR);
    alpha = clamp(vAge / 0.06, 0.0, 1.0);
  } else if (sh == 2) {
    col = uInk;
    float t = sdTri(vP - vec2(0.0, s * 0.1), s * 0.62);
    d = min(abs(t) - 0.85, length(vP - vec2(0.0, s * 0.1)) - 1.7);
    alpha = clamp(vAge / 0.06, 0.0, 1.0);
  } else {
    float r = s;
    float w = 1.2;
    if (sh == 3) { w = 1.1; col = uInk; halo = 1.2; }
    if (sh == 4 || sh == 8) { w = 2.2; r = s * (1.0 + 0.09 * sin(uTime * 5.0)); col = uInk; }
    if (sh == 5) { w = 2.2; col = uGreen; fill = 0.35; }
    if (sh == 6) { w = 2.2; col = uMagenta; fill = 0.28; }
    if (sh == 7) { w = 1.2; col = uInk; }
    d = sdRing(vP, r, w);
    if (sh == 4 || sh == 8) {
      // outer tick marks at the cardinal points, like a target reticle
      vec2 a = abs(vP);
      float tick = min(sdBox(vec2(a.x, a.y - r - 4.0), vec2(0.6, 2.6)), sdBox(vec2(a.x - r - 4.0, a.y), vec2(2.6, 0.6)));
      d = min(d, tick);
    }
    if (fill > 0.0 && length(vP) < r) alpha = 1.0;
    alpha *= clamp(vAge / 0.18, 0.0, 1.0);
    float k = clamp(vAge / 0.32, 0.0, 1.0);
    if (sh != 3) d += (1.0 - k) * (1.0 - k) * 6.0; // grows in
  }
  float core = clamp(0.5 - d / aa, 0.0, 1.0);
  float outer = clamp(0.5 - (d - halo) / aa, 0.0, 1.0);
  float inside = fill > 0.0 ? (1.0 - smoothstep(vSize - 0.5, vSize + 0.5, length(vP))) * fill : 0.0;
  // drop shadow under falling pins
  float shadow = 0.0;
  if (sh <= 2 && vDrop > 0.5) {
    vec2 q = vQ / vec2(s * 0.75, s * 0.28);
    shadow = (1.0 - smoothstep(0.6, 1.0, length(q))) * 0.22 * (1.0 - vDrop / 64.0);
  }
  // Layers bottom to top, premultiplied: shadow, fill, paper halo, ink core.
  vec4 acc = vec4(uInk * shadow, shadow);
  acc = vec4(col * inside, inside) + acc * (1.0 - inside);
  acc = vec4(uPaper * outer, outer) + acc * (1.0 - outer);
  acc = vec4(col * core, core) + acc * (1.0 - core);
  float a = acc.a * alpha * vFade;
  if (a < 0.003) discard;
  gl_FragColor = vec4(acc.rgb / max(acc.a, 1e-4), a);
  #include <colorspace_fragment>
}
`;

export class Sprites {
  constructor(shared, capacity = 192) {
    this.capacity = capacity;
    this.items = []; // { id, pos: Vector3, shape, start, size, idx, group }
    const geo = new InstancedBufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 2, 1, 3]);
    this.posAttr = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.dataAttr = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.hideAttr = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    geo.setAttribute('iPos', this.posAttr);
    geo.setAttribute('iData', this.dataAttr);
    geo.setAttribute('iHide', this.hideAttr);
    geo.instanceCount = 0;
    geo.boundingSphere = new Sphere(new Vector3(), 2);
    this.uniforms = {
      ...shared,
      uHoverIdx: { value: -1 },
      uTinyAlpha: { value: 1 },
      uInk: { value: new Color('#1b232b') },
      uMagenta: { value: new Color('#c3177b') },
      uGreen: { value: new Color('#3e7a45') },
      uPaper: { value: new Color('#f4f5f0') },
    };
    this.material = new ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthTest: false, depthWrite: false, side: DoubleSide,
    });
    this.mesh = new Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.geo = geo;
    this.dirty = false;
    this._nextId = 1;
  }
  add(pos, shape, { start = 0, size = 12, idx = -1, group = 'mark' } = {}) {
    const id = this._nextId++;
    this.items.push({ id, pos: pos.clone(), shape, start, size, idx, group });
    this.dirty = true;
    return id;
  }
  remove(pred) {
    const before = this.items.length;
    this.items = this.items.filter((it) => !pred(it));
    if (this.items.length !== before) this.dirty = true;
  }
  markHidden() { this.hideDirty = true; }
  sync() {
    if (this.hideDirty && !this.dirty) {
      const Hd = this.hideAttr.array;
      const n = Math.min(this.items.length, this.capacity);
      for (let i = 0; i < n; i++) Hd[i] = this.items[i].hidden ? 1 : 0;
      this.hideAttr.needsUpdate = true;
      this.hideDirty = false;
    }
    if (!this.dirty) return;
    const n = Math.min(this.items.length, this.capacity);
    const P = this.posAttr.array, D = this.dataAttr.array;
    for (let i = 0; i < n; i++) {
      const it = this.items[i];
      P[i * 3] = it.pos.x; P[i * 3 + 1] = it.pos.y; P[i * 3 + 2] = it.pos.z;
      D[i * 4] = it.shape; D[i * 4 + 1] = it.start; D[i * 4 + 2] = it.size; D[i * 4 + 3] = it.idx;
      this.hideAttr.array[i] = it.hidden ? 1 : 0;
    }
    this.posAttr.needsUpdate = true;
    this.hideAttr.needsUpdate = true;
    this.hideDirty = false;
    this.dataAttr.needsUpdate = true;
    this.geo.instanceCount = n;
    this.dirty = false;
  }
  // Latest start time among animated items, so the loop knows when animation has settled.
  busyUntil() {
    let t = 0;
    for (const it of this.items) {
      const dur = it.shape <= 2 ? 1.0 : it.shape === SHAPE.tiny ? 0.3 : 0.5;
      if (it.start + dur > t) t = it.start + dur;
    }
    return t;
  }
  hasPulse() { return this.items.some((it) => it.shape === SHAPE.tinyTarget || it.shape === SHAPE.tinyFocus); }
  dispose() { this.geo.dispose(); this.material.dispose(); }
}
