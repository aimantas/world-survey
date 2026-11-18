// One-off GPU rasterisation of the country polygons into equirectangular textures:
//  - index map (RG8, NEAREST): country index per texel, 0 = sea. Drives survey/hover/region tint.
//  - land mask (R8, mipmapped): anti-aliased land coverage from N sub-texel jittered passes.
// Polygons are filled with the stencil-then-cover trick (triangle fans + INVERT, even-odd), so no
// triangulation of the whole world is needed. Rings are planar in lng/lat, exactly like the data
// (Natural Earth is cut at the antimeridian), so this matches `countryAt` and the vector lines.
import {
  WebGLRenderTarget, RawShaderMaterial, Mesh, Scene, OrthographicCamera, BufferGeometry, BufferAttribute,
  GLSL3, RGFormat, RedFormat, UnsignedByteType, NearestFilter, LinearFilter, LinearMipmapLinearFilter,
  RepeatWrapping, ClampToEdgeWrapping, AlwaysStencilFunc, NotEqualStencilFunc, InvertStencilOp, ZeroStencilOp,
  KeepStencilOp, CustomBlending, OneFactor, AddEquation, NoBlending, Uniform, Vector2, Vector3, Color, Sphere, DoubleSide,
} from './three.js';
import { unwrapRing } from './rings.js';

const FAN_VERT = /* glsl */ `
precision highp float;
in vec2 position;
uniform vec2 uJitter;
void main() { gl_Position = vec4(position + uJitter, 0.0, 1.0); }
`;
const FAN_FRAG = /* glsl */ `
precision highp float;
out vec4 outColor;
void main() { outColor = vec4(0.0); }
`;
const COVER_VERT = /* glsl */ `
precision highp float;
in vec2 position;
in vec2 code;
out vec2 vCode;
void main() { vCode = code; gl_Position = vec4(position, 0.0, 1.0); }
`;
const COVER_FRAG = /* glsl */ `
precision highp float;
in vec2 vCode;
uniform float uValue;
uniform float uUseCode;
out vec4 outColor;
void main() { outColor = uUseCode > 0.5 ? vec4(vCode, 0.0, 1.0) : vec4(uValue, uValue, uValue, uValue); }
`;

// Clip-space coordinates: x = lng/180, y = -lat/90, so texel row 0 is the north edge and
// v = 0.5 - lat/180 matches images uploaded without a flip.
function ringsToFan(polys) {
  // planar copies of every ring (antimeridian-unwrapped, pole caps closed, shifted copies)
  const rings = [];
  for (const poly of polys) for (const ring of poly) {
    const r = unwrapRing(ring);
    if (r) for (const s of r.shifts) rings.push([r.pts, s]);
  }
  let nv = 0, ni = 0;
  for (const [pts] of rings) { nv += pts.length; ni += Math.max(0, pts.length - 2) * 3; }
  const pos = new Float32Array(nv * 2);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let p = 0, q = 0, base = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [pts, s] of rings) {
    for (const [lng, lat] of pts) {
      const x = (lng + s) / 180, y = -lat / 90;
      pos[p++] = x; pos[p++] = y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    for (let i = 1; i < pts.length - 1; i++) { idx[q++] = base; idx[q++] = base + i; idx[q++] = base + i + 1; }
    base += pts.length;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 2));
  g.setIndex(new BufferAttribute(idx, 1));
  g.boundingSphere = new Sphere(new Vector3(), 2); // 2D positions: skip three's xyz bound computation
  g.userData.bounds = [Math.max(-1, x0), Math.max(-1, y0), Math.min(1, x1), Math.min(1, y1)];
  return g;
}

function quad(x0, y0, x1, y1, code) {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array([x0, y0, x1, y0, x1, y1, x0, y1]), 2));
  const c = code || [0, 0];
  g.setAttribute('code', new BufferAttribute(new Float32Array([...c, ...c, ...c, ...c]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.boundingSphere = new Sphere(new Vector3(), 2);
  return g;
}

function fanMaterial(jitter) {
  return new RawShaderMaterial({
    glslVersion: GLSL3, vertexShader: FAN_VERT, fragmentShader: FAN_FRAG,
    uniforms: { uJitter: new Uniform(jitter) },
    colorWrite: false, depthTest: false, depthWrite: false, side: DoubleSide, // fans wind both ways
    stencilWrite: true, stencilFunc: AlwaysStencilFunc, stencilRef: 0, stencilWriteMask: 0xff, stencilFuncMask: 0xff,
    stencilFail: KeepStencilOp, stencilZFail: InvertStencilOp, stencilZPass: InvertStencilOp,
  });
}
function coverMaterial({ value = 1, useCode = false, additive = false } = {}) {
  return new RawShaderMaterial({
    glslVersion: GLSL3, vertexShader: COVER_VERT, fragmentShader: COVER_FRAG,
    uniforms: { uValue: new Uniform(value), uUseCode: new Uniform(useCode ? 1 : 0) },
    depthTest: false, depthWrite: false, side: DoubleSide,
    stencilWrite: true, stencilFunc: NotEqualStencilFunc, stencilRef: 0, stencilWriteMask: 0xff, stencilFuncMask: 0xff,
    stencilFail: KeepStencilOp, stencilZFail: ZeroStencilOp, stencilZPass: ZeroStencilOp,
    blending: additive ? CustomBlending : NoBlending,
    blendSrc: OneFactor, blendDst: OneFactor, blendEquation: AddEquation,
    blendSrcAlpha: OneFactor, blendDstAlpha: OneFactor, blendEquationAlpha: AddEquation,
    transparent: false,
  });
}

function renderScene(renderer, scene, target) {
  const cam = new OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.autoClear = false;
  renderer.render(scene, cam);
  renderer.autoClear = prevAuto;
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
}

function disposeScene(scene) {
  scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
}

// shapes: Map iso3 -> polygons. Returns { indexRT, maskRT, isoToIdx, idxToIso, ms }.
export function bakeCountryMaps(renderer, shapes, { indexW = 4096, maskW = 4096, maskPasses = 8 } = {}) {
  const t0 = performance.now();
  const isoToIdx = new Map();
  const idxToIso = [null];
  for (const iso3 of shapes.keys()) { isoToIdx.set(iso3, idxToIso.length); idxToIso.push(iso3); }

  // ---- index map ----
  const indexRT = new WebGLRenderTarget(indexW, indexW / 2, {
    format: RGFormat, type: UnsignedByteType, depthBuffer: true, stencilBuffer: true,
    minFilter: NearestFilter, magFilter: NearestFilter, generateMipmaps: false,
    wrapS: RepeatWrapping, wrapT: ClampToEdgeWrapping,
  });
  indexRT.texture.name = 'globe-country-index';
  const sceneI = new Scene();
  const fanI = fanMaterial(new Vector2());
  const covI = coverMaterial({ useCode: true });
  let order = 0;
  for (const [iso3, polys] of shapes) {
    const idx = isoToIdx.get(iso3);
    const fanGeo = ringsToFan(polys);
    const [x0, y0, x1, y1] = fanGeo.userData.bounds;
    const fan = new Mesh(fanGeo, fanI);
    const cov = new Mesh(quad(x0 - 0.002, y0 - 0.002, x1 + 0.002, y1 + 0.002,
      [(idx & 255) / 255, (idx >> 8) / 255]), covI);
    fan.frustumCulled = cov.frustumCulled = false;
    fan.renderOrder = order++; cov.renderOrder = order++;
    sceneI.add(fan, cov);
  }
  renderScene(renderer, sceneI, indexRT);
  disposeScene(sceneI);

  // ---- land mask: union of all countries, jittered coverage ----
  const maskRT = new WebGLRenderTarget(maskW, maskW / 2, {
    format: RedFormat, type: UnsignedByteType, depthBuffer: true, stencilBuffer: true,
    minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, generateMipmaps: true,
    wrapS: RepeatWrapping, wrapT: ClampToEdgeWrapping,
  });
  maskRT.texture.name = 'globe-land-mask';
  const sceneM = new Scene();
  const all = [];
  for (const polys of shapes.values()) all.push(...polys);
  const fanGeo = ringsToFan(all);
  const coverGeo = quad(-1, -1, 1, 1);
  const covM = coverMaterial({ value: 1 / maskPasses, additive: true });
  // Rotated-grid sample pattern inside one texel (clip units: 2/W per texel).
  const tx = 2 / maskW, ty = 2 / (maskW / 2);
  order = 0;
  for (let k = 0; k < maskPasses; k++) {
    const a = (k + 0.5) / maskPasses;
    const b = ((k * 5 + 3) % maskPasses + 0.5) / maskPasses;
    const fan = new Mesh(fanGeo, fanMaterial(new Vector2((a - 0.5) * tx, (b - 0.5) * ty)));
    const cov = new Mesh(coverGeo, covM);
    fan.frustumCulled = cov.frustumCulled = false;
    fan.renderOrder = order++; cov.renderOrder = order++;
    sceneM.add(fan, cov);
  }
  renderScene(renderer, sceneM, maskRT);
  sceneM.traverse((o) => { if (o.material && o.material !== covM) o.material.dispose(); });
  fanGeo.dispose(); coverGeo.dispose(); covM.dispose();

  return { indexRT, maskRT, isoToIdx, idxToIso, ms: performance.now() - t0 };
}
