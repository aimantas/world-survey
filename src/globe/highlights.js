// Country highlights: crisp overlay geometry for just the highlighted countries.
// Fill = earcut triangulation (three's ShapeUtils) subdivided to ~1.2° so it hugs the curved,
// displaced surface; screen-space hatching / tint in the shader. Outline = fat lines with a paper
// halo. All highlighted countries share one fill draw and one outline draw.
import {
  BufferGeometry, BufferAttribute, ShaderMaterial, Mesh, Color, Vector2, ShapeUtils, Sphere, Vector3,
  DoubleSide, InstancedBufferGeometry,
} from './three.js';
import { GLSL_COMMON } from './shaders.js';
import { SegmentBuffer, pushPolyline, createLineMaterial, MAX_SLOTS } from './lines.js';
import { DEG } from './util.js';
import { planarPolygons } from './rings.js';

// style ids shared by fill + outline shaders
export const HSTYLE = { target: 0, focus: 1, correct: 2, wrong: 3, neighbour: 4 };

export const OUTLINE_STYLES = [
  { color: '#1b232b', width: 2.6, halo: 1.6 },          // target
  { color: '#1b232b', width: 2.4, halo: 1.6 },          // focus
  { color: '#2f6537', width: 2.4, halo: 1.5 },          // correct
  { color: '#c3177b', width: 2.3, halo: 1.5 },          // wrong
  { color: '#1b232b', width: 1.15, halo: 0, alpha: 0.85 }, // neighbour
];

const FILL_VERT = /* glsl */ `
${GLSL_COMMON}
attribute float aSlot;
uniform float uSlotA[${MAX_SLOTS}];
uniform int uSlotStyle[${MAX_SLOTS}];
varying float vVis;
flat varying int vStyle;
flat varying float vA;
void main() {
  vec3 d = normalize(position);
  int s = int(aSlot + 0.5);
  vStyle = uSlotStyle[s];
  vA = uSlotA[s];
  vVis = horizonVis(d);
  vec3 p = d * (1.0 + uDisp * heightAt(d) + 0.0008 * uLiftK);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FILL_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uInk, uMagenta, uGreen;
uniform float uDpr, uTime, uReduced;
varying float vVis;
flat varying int vStyle;
flat varying float vA;

float stripes(float u, float spacing, float width) {
  float f = abs(fract(u) - 0.5) * spacing;
  return 1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.5, f);
}

void main() {
  float vis = smoothstep(0.0, 0.05, vVis);
  if (vis <= 0.0 || vA <= 0.001) discard;
  vec2 fc = gl_FragCoord.xy;
  float sp = 7.0 * uDpr;
  float w = 1.35 * uDpr;
  vec3 col = uInk;
  float a = 0.0;
  if (vStyle == 0 || vStyle == 1) {          // target / focus: animated ink hatching
    float drift = uReduced > 0.5 ? 0.0 : uTime * (vStyle == 0 ? 0.9 : 0.5);
    float u = (fc.x + fc.y) / (sp * 1.41421) - drift;
    a = stripes(u, sp, w) * 0.62 + 0.07;
  } else if (vStyle == 2) {                  // correct: green tint
    col = uGreen;
    float u = (fc.x - fc.y) / (sp * 1.41421);
    a = 0.30 + stripes(u, sp, w * 0.8) * 0.12;
  } else if (vStyle == 3) {                  // wrong: magenta hatch the other way
    col = uMagenta;
    float u = (fc.x - fc.y) / (sp * 1.41421);
    a = stripes(u, sp, w) * 0.5 + 0.06;
  } else {
    discard;
  }
  a *= vA * vis;
  if (a < 0.003) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}
`;

// Triangulate a country's polygons in lng/lat (antimeridian-safe planar copies) and subdivide
// long triangles so the fill follows the sphere.
function triangulateCountry(polys, maxDeg = 1.2) {
  const out = [];
  const v = new Vector2();
  for (const { outer, holes: hs } of planarPolygons(polys)) {
    const toV2 = (ring) => {
      const pts = ring.map(([x, y]) => new Vector2(x, y));
      if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop();
      return pts;
    };
    const contour = toV2(outer);
    if (contour.length < 3) continue;
    const holes = hs.map(toV2).filter((h) => h.length >= 3);
    const tris = ShapeUtils.triangulateShape(contour, holes);
    const all = contour.concat(...holes);
    for (const [a, b, c] of tris) {
      const A = all[a], B = all[b], C = all[c];
      const e = Math.max(A.distanceTo(B), B.distanceTo(C), C.distanceTo(A));
      const n = Math.min(24, Math.max(1, Math.ceil(e / maxDeg)));
      if (n === 1) { out.push(A.x, A.y, B.x, B.y, C.x, C.y); continue; }
      const P = (i, j) => {
        v.set(A.x + (B.x - A.x) * (i / n) + (C.x - A.x) * (j / n), A.y + (B.y - A.y) * (i / n) + (C.y - A.y) * (j / n));
        return [v.x, v.y];
      };
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n - j; i++) {
          out.push(...P(i, j), ...P(i + 1, j), ...P(i, j + 1));
          if (i + j < n - 1) out.push(...P(i + 1, j), ...P(i + 1, j + 1), ...P(i, j + 1));
        }
      }
    }
  }
  // to unit vectors
  const pos = new Float32Array((out.length / 2) * 3);
  for (let i = 0, k = 0; i < out.length; i += 2) {
    const lng = out[i] * DEG, lat = out[i + 1] * DEG, c = Math.cos(lat);
    pos[k++] = c * Math.sin(lng); pos[k++] = Math.sin(lat); pos[k++] = c * Math.cos(lng);
  }
  return pos;
}

export class Highlights {
  constructor(shared, shapes) {
    this.shapes = shapes;
    this.cache = new Map(); // iso3 -> Float32Array of triangle positions
    this.entries = new Map(); // iso3 -> { style, slot, alpha, target }
    this.slotA = new Array(MAX_SLOTS).fill(0);
    this.slotStyle = new Array(MAX_SLOTS).fill(0);
    this.fillUniforms = {
      ...shared,
      uSlotA: { value: this.slotA },
      uSlotStyle: { value: this.slotStyle },
      uInk: { value: new Color('#1b232b') },
      uMagenta: { value: new Color('#c3177b') },
      uGreen: { value: new Color('#3e7a45') },
    };
    this.fillMaterial = new ShaderMaterial({
      uniforms: this.fillUniforms, vertexShader: FILL_VERT, fragmentShader: FILL_FRAG,
      transparent: true, depthTest: false, depthWrite: false, side: DoubleSide,
    });
    this.fill = new Mesh(new BufferGeometry(), this.fillMaterial);
    this.fill.frustumCulled = false;
    this.fill.renderOrder = 3;
    this.fill.visible = false;
    this.lineMaterial = createLineMaterial(shared, OUTLINE_STYLES, { pass: 'halo' });
    this.lineMaterial.uniforms.uSlot.value = this.slotA;
    this.lineMaterial.uniforms.uLift.value = 0.0012;
    this.coreMaterial = createLineMaterial(shared, OUTLINE_STYLES, { pass: 'core', uniforms: this.lineMaterial.uniforms });
    this.outline = new Mesh(new InstancedBufferGeometry(), this.lineMaterial);
    this.outline.frustumCulled = false;
    this.outline.renderOrder = 5;
    this.outline.visible = false;
    this.outlineCore = new Mesh(this.outline.geometry, this.coreMaterial);
    this.outlineCore.frustumCulled = false;
    this.outlineCore.renderOrder = 5.5;
    this.outlineCore.visible = false;
    this.dirty = false;
  }

  set(iso3, style) {
    if (!this.shapes.has(iso3)) return false;
    const sid = HSTYLE[style] ?? HSTYLE.target;
    const e = this.entries.get(iso3);
    if (e) {
      if (e.style !== sid) { e.style = sid; this.slotStyle[e.slot] = sid; e.alpha = Math.min(e.alpha, 0.35); this.dirty = true; }
      e.target = 1;
      return true;
    }
    const used = new Set([...this.entries.values()].map((x) => x.slot));
    let slot = 0;
    while (used.has(slot) && slot < MAX_SLOTS) slot++;
    if (slot >= MAX_SLOTS) return false;
    this.entries.set(iso3, { style: sid, slot, alpha: 0, target: 1 });
    this.slotStyle[slot] = sid;
    this.slotA[slot] = 0;
    this.dirty = true;
    return true;
  }
  clear() {
    for (const e of this.entries.values()) e.target = 0;
  }
  // Returns true while fading.
  update(dt) {
    let busy = false;
    for (const [iso3, e] of this.entries) {
      const k = 1 - Math.exp(-dt * (e.target ? 14 : 18));
      e.alpha += (e.target - e.alpha) * k;
      if (Math.abs(e.alpha - e.target) < 0.004) e.alpha = e.target;
      else busy = true;
      this.slotA[e.slot] = e.alpha;
      if (e.target === 0 && e.alpha === 0) { this.entries.delete(iso3); this.slotA[e.slot] = 0; this.dirty = true; }
    }
    if (this.dirty) this.rebuild();
    return busy;
  }
  rebuild() {
    this.dirty = false;
    const list = [...this.entries.entries()];
    // fills
    let total = 0;
    const parts = [];
    for (const [iso3, e] of list) {
      if (e.style === HSTYLE.neighbour) continue;
      let tri = this.cache.get(iso3);
      if (!tri) { tri = triangulateCountry(this.shapes.get(iso3)); this.cache.set(iso3, tri); }
      parts.push([tri, e.slot]);
      total += tri.length / 3;
    }
    const pos = new Float32Array(total * 3), slot = new Float32Array(total);
    let o = 0;
    for (const [tri, s] of parts) {
      pos.set(tri, o * 3);
      slot.fill(s, o, o + tri.length / 3);
      o += tri.length / 3;
    }
    const fg = new BufferGeometry();
    fg.setAttribute('position', new BufferAttribute(pos, 3));
    fg.setAttribute('aSlot', new BufferAttribute(slot, 1));
    fg.boundingSphere = new Sphere(new Vector3(), 1.1);
    this.fill.geometry.dispose();
    this.fill.geometry = fg;
    this.fill.visible = total > 0;
    // outlines (draw neighbours first so bold outlines sit on top)
    const buf = new SegmentBuffer(4096);
    list.sort((a, b) => (b[1].style === HSTYLE.neighbour) - (a[1].style === HSTYLE.neighbour));
    for (const [iso3, e] of list) {
      for (const poly of this.shapes.get(iso3)) for (const ring of poly) pushPolyline(buf, ring, e.style, e.slot, 0.6);
    }
    this.outline.geometry.dispose();
    this.outline.geometry = this.outlineCore.geometry = buf.toGeometry();
    this.outline.visible = this.outlineCore.visible = buf.n > 0;
  }
  // Animated hatching needs continuous frames.
  animating() {
    for (const e of this.entries.values()) if (e.target && (e.style === HSTYLE.target || e.style === HSTYLE.focus)) return true;
    return false;
  }
  styleOf(iso3) { const e = this.entries.get(iso3); return e && e.target ? e.style : null; }
  dispose() {
    this.fill.geometry.dispose(); this.fillMaterial.dispose();
    this.outline.geometry.dispose(); this.lineMaterial.dispose(); this.coreMaterial.dispose();
    this.cache.clear();
  }
}
