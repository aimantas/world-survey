// The globe surface: one cube-sphere mesh, one shader. Land from the relief texture, ocean painted
// procedurally (survey blue shaded by distance to the coast, hand-drawn water lines from the coast
// distance field, a soft sheen), 15° graticule, exaggerated relief displacement with a screen-lit
// hillshade, survey/hover/region tinting from the per-country index map and palette. Zoomed in (DETAIL),
// a regional ~2.2 km elevation atlas (detail.js) drives a crisp hillshade, survey contours and, on
// steep high ground (MICRO), a procedural rock micro-relief.
import {
  BufferGeometry, BufferAttribute, ShaderMaterial, Mesh, Color, Vector2, Vector3, Vector4, Sphere,
} from './three.js';
import { GLSL_COMMON, GLSL_NOISE } from './shaders.js';

// Equal-angle cube sphere: (n+1)^2 vertices per face, no seam, near-uniform cells.
export function cubeSphereGeometry(n) {
  const faces = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const vpf = (n + 1) * (n + 1);
  const pos = new Float32Array(6 * vpf * 3);
  const idx = new Uint32Array(6 * n * n * 6);
  const v = new Vector3(), a = new Vector3(), b = new Vector3(), c = new Vector3();
  let p = 0, q = 0;
  faces.forEach(([N, U, V], f) => {
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const s = Math.tan(((i / n) * 2 - 1) * (Math.PI / 4));
        const t = Math.tan(((j / n) * 2 - 1) * (Math.PI / 4));
        v.set(N[0] + s * U[0] + t * V[0], N[1] + s * U[1] + t * V[1], N[2] + s * U[2] + t * V[2]).normalize();
        pos[p++] = v.x; pos[p++] = v.y; pos[p++] = v.z;
      }
    }
    // Orientation check on the first cell so every face winds outward.
    const base = f * vpf;
    const g = (i, j) => base + j * (n + 1) + i;
    a.fromArray(pos, g(0, 0) * 3); b.fromArray(pos, g(1, 0) * 3); c.fromArray(pos, g(0, 1) * 3);
    const outward = b.clone().sub(a).cross(c.clone().sub(a)).dot(a) > 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const i0 = g(i, j), i1 = g(i + 1, j), i2 = g(i, j + 1), i3 = g(i + 1, j + 1);
        if (outward) { idx[q++] = i0; idx[q++] = i1; idx[q++] = i3; idx[q++] = i0; idx[q++] = i3; idx[q++] = i2; }
        else { idx[q++] = i0; idx[q++] = i3; idx[q++] = i1; idx[q++] = i0; idx[q++] = i2; idx[q++] = i3; }
      }
    }
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.boundingSphere = new Sphere(new Vector3(), 1.06);
  return geo;
}

const VERT = /* glsl */ `
${GLSL_COMMON}
varying vec3 vDir;
varying vec3 vView;
void main() {
  vec3 d = normalize(position);
  vec3 p = d * (1.0 + uDisp * heightAt(d));
  vDir = d;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_COMMON}
${GLSL_NOISE}
uniform sampler2D uRelief;   uniform float uHasRelief; uniform vec2 uReliefSize;
uniform sampler2D uMask;     uniform float uHasMask;
uniform sampler2D uIndex;    uniform vec2 uIndexSize; uniform float uHasIndex;
uniform sampler2D uPalette;
uniform sampler2D uSdf;      uniform vec2 uSdfSize; uniform float uHasSdf; uniform float uSdfKm; uniform float uSdfGamma;
uniform float uSurveyMode;   // 1: unsurveyed land prints as the grey base plate
uniform float uDimDefault;   // dim for land without a country index while a region is focused
uniform float uDpr;
uniform float uShade;        // hillshade contrast
uniform float uShadeZ;       // hillshade vertical exaggeration
uniform float uBakedShade;   // 0..1: how much shading the relief texture already carries
uniform float uReliefSoft;   // 0..1: blur the relief's baked shading (map turned away from north up)
uniform float uKmPerUnit;
uniform vec3 uLight;         // view space, from the screen's upper left
uniform vec3 uOcean, uWater, uGrat, uPaper, uPlateLo, uPlateHi, uMagenta, uInk, uLimb, uIceLo, uIceHi;
uniform vec3 uShallow, uDeep, uHaze, uSheenCol;
uniform float uSheen;        // open-water sheen strength
uniform float uWL0, uWLr;    // water line series: D_k = uWL0 * uWLr^k km
#ifdef DETAIL
uniform sampler2D uDetail;   // R16F metres, atlas of 512 px tile slots (detail.js)
uniform sampler2D uDetailIdx; // one texel per 10° tile: r = slot + 1, g = fade-in
uniform vec4 uDetailGrid;    // cols, rows, content px, gutter px
uniform vec4 uDetailAtlas;   // slots across, slot px, 1 / atlas w, 1 / atlas h
uniform float uDetailOn;     // zoom fade 0..1
uniform vec2 uDetailZ;       // slope remap s' = B ln(1 + A s / B): x = A (gain on gentle slopes), y = B
uniform float uDetailShade;
uniform vec4 uContour;       // coarse interval m, fine interval m, fine mix, zoom fade
uniform vec4 uContourIdx;    // index intervals: coarse m, fine m, fine mix (w unused)
uniform vec3 uContourCol, uContourIce, uContourPlate;
uniform float uMicro;        // procedural rock micro-relief strength
#endif
varying vec3 vDir;
varying vec3 vView;

float elevH(vec2 uv, vec2 dx, vec2 dy) { float e = textureGrad(uElev, uv, dx, dy).r; return e * e; }

vec4 cubicW(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
}
float sdfSample(vec2 uv) {
#ifdef BICUBIC_SDF
  vec2 inv = 1.0 / uSdfSize;
  vec2 t = uv * uSdfSize - 0.5;
  vec2 f = fract(t);
  t -= f;
  vec4 xc = cubicW(f.x), yc = cubicW(f.y);
  vec4 c = t.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) * inv.xxyy;
  float s0 = textureLod(uSdf, o.xz, 0.0).r, s1 = textureLod(uSdf, o.yz, 0.0).r;
  float s2 = textureLod(uSdf, o.xw, 0.0).r, s3 = textureLod(uSdf, o.yw, 0.0).r;
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
#else
  return textureLod(uSdf, uv, 0.0).r;
#endif
}

#ifdef DETAIL
// Uniform cubic B-spline: weights and their derivatives. Within each pair (0,1) and (2,3) the weights
// share a sign, so value and both partial derivatives fold into 4 bilinear taps each (12 in total).
vec4 bsW(float f) { float g = 1.0 - f, f2 = f * f, f3 = f2 * f; return vec4(g * g * g, 3.0 * f3 - 6.0 * f2 + 4.0, -3.0 * f3 + 3.0 * f2 + 3.0 * f + 1.0, f3) * (1.0 / 6.0); }
vec4 bsD(float f) { float g = 1.0 - f; return vec4(-g * g, 3.0 * f * f - 4.0 * f, -3.0 * f * f + 2.0 * f + 1.0, f * f) * 0.5; }
float dTap(float x, float y, float lod) { return textureLod(uDetail, vec2(x, y) * uDetailAtlas.zw, lod).r; }
// x: metres, y / z: dh per detail pixel (east / south), w: tile fade (0 = no tile resident)
vec4 detailAt(vec2 uv, float lod) {
  vec2 t = vec2(fract(uv.x), clamp(uv.y, 0.0, 0.99999)) * uDetailGrid.xy;
  vec2 tid = min(floor(t), uDetailGrid.xy - 1.0);
  vec4 ix = texelFetch(uDetailIdx, ivec2(tid), 0);
  float slot = floor(ix.r * 255.0 + 0.5) - 1.0;
  if (slot < 0.0) return vec4(0.0);
  vec2 so = vec2(mod(slot, uDetailAtlas.x), floor(slot / uDetailAtlas.x)) * uDetailAtlas.y;
  vec2 q = so + (t - tid) * uDetailGrid.z + uDetailGrid.w - 0.5;
  vec2 i0 = floor(q), f = q - i0;
  vec4 wx = bsW(f.x), wy = bsW(f.y), ux = bsD(f.x), uy = bsD(f.y);
  vec2 gx = vec2(wx.x + wx.y, wx.z + wx.w), gy = vec2(wy.x + wy.y, wy.z + wy.w);
  vec2 ex = vec2(ux.x + ux.y, ux.z + ux.w), ey = vec2(uy.x + uy.y, uy.z + uy.w);
  vec2 hx = vec2(i0.x - 0.5 + wx.y / gx.x, i0.x + 1.5 + wx.w / gx.y);
  vec2 hy = vec2(i0.y - 0.5 + wy.y / gy.x, i0.y + 1.5 + wy.w / gy.y);
  vec2 kx = vec2(i0.x - 0.5 + ux.y / ex.x, i0.x + 1.5 + ux.w / ex.y);
  vec2 ky = vec2(i0.y - 0.5 + uy.y / ey.x, i0.y + 1.5 + uy.w / ey.y);
  float h = gy.x * (gx.x * dTap(hx.x, hy.x, lod) + gx.y * dTap(hx.y, hy.x, lod))
          + gy.y * (gx.x * dTap(hx.x, hy.y, lod) + gx.y * dTap(hx.y, hy.y, lod));
  float hdx = gy.x * (ex.x * dTap(kx.x, hy.x, lod) + ex.y * dTap(kx.y, hy.x, lod))
            + gy.y * (ex.x * dTap(kx.x, hy.y, lod) + ex.y * dTap(kx.y, hy.y, lod));
  float hdy = ey.x * (gx.x * dTap(hx.x, ky.x, lod) + gx.y * dTap(hx.y, ky.x, lod))
            + ey.y * (gx.x * dTap(hx.x, ky.y, lod) + gx.y * dTap(hx.y, ky.y, lod));
  return vec4(h, hdx, hdy, ix.g);
}
// Coverage of iso-lines at multiples of I metres, wpx device px wide; gs = metres per device px.
float isoLine(float h, float gs, float I, float wpx) {
  float spacing = I / max(gs, 1e-3);
  float d = abs(fract(h / I + 0.5) - 0.5) * spacing;
  float cov = clamp(0.5 * max(wpx, 1.0) + 0.5 - d, 0.0, 1.0) * min(wpx, 1.0);
  return cov * smoothstep(2.8, 5.5, spacing) * step(0.5 * I, abs(h));
}
#ifdef MICRO
// value noise with analytic gradient (xyz), value in w
vec4 vnoiseD(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  vec3 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
  float a = hash13(i), b = hash13(i + vec3(1, 0, 0)), c = hash13(i + vec3(0, 1, 0)), d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1)), g = hash13(i + vec3(1, 0, 1)), k = hash13(i + vec3(0, 1, 1)), m = hash13(i + vec3(1, 1, 1));
  float k1 = b - a, k2 = c - a, k3 = e - a, k4 = a - b - c + d, k5 = a - c - e + k, k6 = a - b - e + g, k7 = -a + b + c - d + e - g - k + m;
  return vec4(du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
                        k2 + k5 * u.z + k4 * u.x + k7 * u.z * u.x,
                        k3 + k6 * u.x + k5 * u.y + k7 * u.x * u.y),
              a + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z);
}
#endif
#endif

float decodeIdx(ivec2 t) {
  vec2 rg = texelFetch(uIndex, t, 0).rg;
  return floor(rg.r * 255.0 + 0.5) + floor(rg.g * 255.0 + 0.5) * 256.0;
}
// x: survey (0 grey plate .. 1 full colour), y: hover, z: region dim
vec3 countryState(float idx, vec3 n) {
  int i = int(idx);
  vec4 a = texelFetch(uPalette, ivec2(i, 0), 0); // sTo, hover, dim, progress
  if (a.w >= 0.999) return a.xyz;                 // no colour spread running: rows 1 and 2 are not needed
  vec4 b = texelFetch(uPalette, ivec2(i, 1), 0); // spread centre xyz, max radius (rad)
  float sFrom = texelFetch(uPalette, ivec2(i, 2), 0).x;
  float r = a.w * (b.w + 0.04);
  float ang = acos(clamp(dot(n, b.xyz), -1.0, 1.0));
  float soft = 0.05 * b.w + 0.003;
  float m = a.w >= 0.999 ? 1.0 : 1.0 - smoothstep(r - soft, r, ang);
  return vec3(mix(sFrom, a.x, m), a.y, a.z);
}
vec3 landState(vec2 uv, vec3 n) {
  vec3 def = vec3(uSurveyMode > 0.5 ? 0.0 : 1.0, 0.0, uDimDefault);
  if (uHasIndex < 0.5) return def;
  ivec2 sz = ivec2(uIndexSize);
#ifdef PALETTE_TAPS
  vec2 tc = uv * uIndexSize - 0.5;
  vec2 f = fract(tc);
  ivec2 i0 = ivec2(floor(tc));
  vec3 acc = vec3(0.0); float wsum = 0.0;
  for (int k = 0; k < 4; k++) {
    ivec2 o = ivec2(k & 1, k >> 1);
    ivec2 t = i0 + o;
    t.x = (t.x % sz.x + sz.x) % sz.x;
    t.y = clamp(t.y, 0, sz.y - 1);
    float w = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
    float id = decodeIdx(t);
    if (id > 0.5) { acc += countryState(id, n) * w; wsum += w; }
  }
  return wsum > 1e-4 ? acc / wsum : def;
#else
  ivec2 t = ivec2(uv * uIndexSize);
  t.x = (t.x % sz.x + sz.x) % sz.x;
  t.y = clamp(t.y, 0, sz.y - 1);
  float id = decodeIdx(t);
  return id > 0.5 ? countryState(id, n) : def;
#endif
}

vec3 fallbackLand(float h) {
  vec3 lo = vec3(0.50, 0.60, 0.40), mid = vec3(0.70, 0.64, 0.45), hi = vec3(0.60, 0.50, 0.40), top = vec3(0.86, 0.85, 0.83);
  vec3 c = mix(lo, mid, smoothstep(0.0, 0.06, h));
  c = mix(c, hi, smoothstep(0.06, 0.25, h));
  return mix(c, top, smoothstep(0.3, 0.6, h));
}

void main() {
  vec3 n = normalize(vDir);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lng = atan(n.x, n.z);
  vec2 uv = vec2(lng / TAU + 0.5, 0.5 - lat / PI);
  // Seam-free derivatives (Tarini): use whichever u parameterisation is continuous here.
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  float u2 = fract(uv.x + 0.5);
  float dx2 = dFdx(u2), dy2 = dFdy(u2);
  if (abs(dx2) + abs(dy2) < abs(dx.x) + abs(dy.x)) { dx.x = dx2; dy.x = dy2; }

  // ---- all derivative-based quantities at top level (uniform control flow) ----
  float latD = lat * 57.29578, lngD = lng * 57.29578;
  float fLat = max(fwidth(latD), 1e-6);
  float fLng = max(min(fwidth(lngD), fwidth(mod(lngD + 360.0, 360.0))), 1e-6);
  float kpp = uKmPerUnit * sqrt(max(length(dFdx(n)) * length(dFdy(n)), 1e-14)); // km per device px

  // ---- land mask: AA coverage, sharpened at the 0.5 isoline ----
  float m = uHasMask > 0.5 ? textureGrad(uMask, uv, dx, dy).r : 0.0;
  float fm = fwidth(m);
  float land = clamp((m - 0.5) / max(fm * 1.25, 1e-4) + 0.5, 0.0, 1.0);

  vec3 vS = normalize(mat3(viewMatrix) * n);
  vec3 V = normalize(-vView);
  // Land work only where there is land (all fetches below use explicit gradients, LODs or texelFetch,
  // so this branch is safe); open ocean pixels skip it.
  vec3 landCol = vec3(0.0);
  if (land > 0.0) {
    float cl = max(cos(lat), 0.03);
    vec3 east = vec3(cos(lng), 0.0, -sin(lng));
    vec3 north = vec3(-sin(lat) * sin(lng), cos(lat), -sin(lat) * cos(lng));

    // ---- regional detail sample first: its weight decides how the relief texture is read ----
    float wD = 0.0, hD = 0.0, gsPx = 0.0, rock = 0.0, hillDet = 0.0;
    vec2 g = vec2(0.0);
#ifdef DETAIL
    vec2 pxPerUv = uDetailGrid.xy * uDetailGrid.z;
    vec2 tdx = dx * pxPerUv, tdy = dy * pxPerUv;            // detail px per device px
    float lodD = log2(max(max(length(tdx), length(tdy)), 1e-4));
    if (uDetailOn > 0.0 && lodD < 1.6) {                     // (far, minified ground of a tilted view: skip)
      vec4 dd = detailAt(uv, clamp(lodD, 0.0, 1.5));
      wD = dd.w * uDetailOn * (1.0 - smoothstep(1.0, 1.6, lodD)) * (1.0 - smoothstep(84.0, 85.0, abs(latD)));
      if (wD > 0.0) {
        hD = dd.x;
        float pxM = TAU / (uDetailGrid.x * uDetailGrid.z) * 6371000.0;   // metres per detail px (north)
        g = vec2(dd.y / (pxM * cl), -dd.z / pxM);                         // slope east, north (m / m)
        gsPx = length(vec2(dot(dd.yz, tdx), dot(dd.yz, tdy)));            // metres per device px on screen
      }
    }
#endif

    // ---- relief colour + polar ice detection (before shading: ice gets a smoother hillshade) ----
    // Close in (and when the map is turned) the relief's baked, soft shading gives way to the dynamic
    // one: the single relief read is widened so only its colour carries.
    float soft = max(wD * 0.6, uReliefSoft);
    float wide = 1.0 + 5.0 * soft;
    vec3 relief = uHasRelief > 0.5 ? textureGrad(uRelief, uv, dx * wide, dy * wide).rgb : vec3(0.0);
    // polar ice: the relief's baked white-lavender reads as cloud; it is replaced by a pale grey-blue
    // that takes the same dynamic hillshade. Relief ice is blue-white (chroma up to ~0.2 where shaded);
    // neutral greys need a tighter test.
    float rl = dot(relief, vec3(0.2126, 0.7152, 0.0722));
    float chroma = max(max(relief.r, relief.g), relief.b) - min(min(relief.r, relief.g), relief.b);
    float blueDom = smoothstep(-0.01, 0.02, relief.b - max(relief.r, relief.g));
    float neutral = mix(1.0 - smoothstep(0.06, 0.12, chroma), 1.0 - smoothstep(0.24, 0.34, chroma), blueDom);
    float ice = smoothstep(0.40, 0.58, rl) * neutral * smoothstep(57.0, 62.0, abs(latD)) * uHasRelief;

    // ---- regional detail: sharper hillshade, rock texture ----
#ifdef DETAIL
    if (wD > 0.0) {
      rock = smoothstep(0.10, 0.30, length(g)) * smoothstep(500.0, 1500.0, hD) * (1.0 - 0.7 * ice);
#ifdef MICRO
      if (uMicro > 0.0 && rock > 0.0) {
        // crags: ridged noise, two octaves at fixed ground size, faded before they alias
        const float L1 = 2.2, L2 = 0.9;           // km
        float f1 = smoothstep(2.0, 5.0, L1 / kpp), f2 = smoothstep(2.0, 5.0, L2 / kpp);
        vec3 gr = vec3(0.0);
        if (f1 > 0.0) { vec4 n1 = vnoiseD(n * (6371.0 / L1)); gr = -2.0 * sign(n1.w - 0.5) * n1.xyz * (90.0 / (L1 * 1000.0)) * f1; }
        if (f2 > 0.0) { vec4 n2 = vnoiseD(n * (6371.0 / L2) + 17.0); gr += n2.xyz * (34.0 / (L2 * 1000.0)) * f2; }
        g += vec2(dot(gr, east), dot(gr, north)) * rock * uMicro;
      }
#endif
      // gentle local contrast: slopes are remapped logarithmically, so a 5 m rise in a plain still
      // shades while alpine walls keep their gradation instead of all saturating
      float gl = length(g);
      vec2 gz = gl > 1e-6 ? g * (uDetailZ.y * log(1.0 + uDetailZ.x * gl / uDetailZ.y) / gl) : vec2(0.0);
      vec3 nwD = normalize(-gz.x * east - gz.y * north + n);
      hillDet = (dot(normalize(mat3(viewMatrix) * nwD), uLight) - dot(vS, uLight)) * uDetailShade;
    }
#endif
    // ---- relief shading from the global elevation map ----
    float hC = 0.0;
    float hill = 0.0;
    if (uHasElev > 0.5 && wD > 0.999) {
      // the detail hillshade replaces this one: only the ~40 km mean height is needed (ice tint, local relief)
      hC = elevH(uv, dx * 2.0, dy * 2.0);
    } else if (uHasElev > 0.5) {
      vec2 ts = 1.0 / uElevSize;
      float smoothK = 1.0 + 2.0 * ice; // ice domes: wider footprint hides elevation-tile ripple noise
      float fpx = clamp(length(vec2(dx.x, dy.x)) * uElevSize.x * smoothK, smoothK, 64.0);
      float fpy = clamp(length(vec2(dx.y, dy.y)) * uElevSize.y * smoothK, smoothK, 64.0);
      vec2 ox = vec2(ts.x * fpx, 0.0), oy = vec2(0.0, ts.y * fpy);
      vec2 gdx = dx * smoothK, gdy = dy * smoothK;
      float hE = elevH(uv + ox, gdx, gdy), hW = elevH(uv - ox, gdx, gdy);
      float hN = elevH(uv - oy, gdx, gdy), hS = elevH(uv + oy, gdx, gdy);
      hC = (hE + hW + hN + hS) * 0.25;
      float k = 1.389e-3 * uShadeZ;  // (8848 m / 6371 km) * exaggeration
      float gE = (hE - hW) / (2.0 * ox.x * TAU * cl) * k;
      float gN = (hN - hS) / (2.0 * oy.y * PI) * k;
      vec3 nw = normalize(-gE * east - gN * north + n);
      vec3 vN = normalize(mat3(viewMatrix) * nw);
      hill = dot(vN, uLight) - dot(vS, uLight);
    }

    hill = mix(hill, hillDet, wD);
    hill *= 1.0 - smoothstep(80.0, 87.0, abs(latD)); // longitude sampling degenerates at the poles

    // ---- land colour ----
    vec3 iceCol = mix(uIceLo, uIceHi, smoothstep(0.03, 0.35, hC));
    if (uHasRelief < 0.5) relief = fallbackLand(hC);
    else {
      relief = mix(relief, iceCol, ice);
    }
    vec3 st = landState(uv, n);
    float lum = dot(relief, vec3(0.2126, 0.7152, 0.0722));
    vec3 plate = mix(uPlateLo, uPlateHi, smoothstep(0.05, 0.55, lum));
    landCol = mix(plate, relief, st.x);
    float baked = uBakedShade * (1.0 - ice) * (1.0 - soft);
    float shade = clamp(1.0 + hill * uShade * (1.0 - 0.5 * baked), 0.45, mix(1.35, 1.07, ice));
    landCol *= shade;
#ifdef DETAIL
    // local relief: ground above its ~40 km surroundings prints a little lighter, hollows a little deeper
    // (lowland uplands and valleys become legible without touching saturation)
    if (wD > 0.0) {
      float tpi = hD - hC * 8848.0;
      landCol *= 1.0 + 0.1 * wD * (1.0 - ice) * tanh(tpi / 120.0);
    }
#endif
    // printed relief convention: light slopes a touch warm, shadow slopes a touch cool (colour earned only)
    float tone = clamp(hill * uShade, -1.0, 1.0) * st.x * (1.0 - ice);
    landCol *= mix(vec3(1.0), tone > 0.0 ? vec3(1.025, 1.01, 0.965) : vec3(0.94, 0.965, 1.035), abs(tone));
#ifdef DETAIL
    if (wD > 0.0) {
      // bare rock reads grey-brown, a little less green
      landCol = mix(landCol, vec3(dot(landCol, vec3(0.3, 0.55, 0.15))) * vec3(1.03, 1.0, 0.95), 0.22 * rock * st.x * wD);
      if (uContour.w > 0.0) {
        float w0 = 0.6 * uDpr, w1 = 1.15 * uDpr;
        float c = max(isoLine(hD, gsPx, uContour.x, w0), isoLine(hD, gsPx, uContour.y, w0) * uContour.z) * 0.42;
        c = max(c, isoLine(hD, gsPx, uContourIdx.x, w1) * (1.0 - uContourIdx.z) * 0.62);
        c = max(c, isoLine(hD, gsPx, uContourIdx.y, w1) * uContourIdx.z * 0.62);
        vec3 cc = mix(mix(uContourPlate, uContourCol, st.x), uContourIce, ice);
        landCol = mix(landCol, cc * min(vec3(1.0), landCol * 0.25 + 0.8), c * uContour.w * wD);
      }
    }
#endif
    landCol = mix(landCol, uMagenta, 0.16 * st.y);
    landCol = mix(landCol, uPaper, 0.62 * st.z);
  }

  // ---- ocean: survey blue shaded by distance to the coast + hand-drawn water lines ----
  vec3 ocean = uOcean;
  float waterA = 0.0;
  if (uHasSdf > 0.5) {
    float s = sdfSample(uv);
    float dkm = pow(s, uSdfGamma) * uSdfKm;
    // depth from the coast distance: pale shelf, survey blue, a slightly deeper (never navy) open sea
    ocean = mix(uShallow, uOcean, smoothstep(3.0, 80.0, dkm));
    ocean = mix(ocean, uDeep, smoothstep(120.0, 700.0, dkm));
    float wob = 1.0 + 0.09 * (vnoise(n * 23.0) - 0.5) + 0.04 * (vnoise(n * 61.0) - 0.5);
    float dw = dkm * wob;
    float fw = max(fwidth(dw), 1e-4);
    float kppCss = kpp * uDpr;
    float k0 = floor(log(max(dw, 1e-3) / uWL0) / log(uWLr));
    for (int j = 0; j < 2; j++) {
      float kk = k0 + float(j);
      if (kk < 0.0) continue;
      float D = uWL0 * pow(uWLr, kk);
      float spacingCss = (D - D / uWLr) / kppCss;
      float coastCss = D / kppCss;
      float vis = smoothstep(2.6, 4.6, spacingCss) * (1.0 - smoothstep(16.0, 34.0, coastCss));
      float order = clamp((coastCss - 2.5) / 30.0, 0.0, 1.0);
      float alpha = mix(0.72, 0.12, order) * vis;
      float wpx = (0.65 + 0.35 * (1.0 - order)) * uDpr * (0.8 + 0.45 * vnoise(n * 90.0 + kk * 7.0));
      float distPx = abs(dw - D) / fw;
      float line = 1.0 - smoothstep(wpx * 0.5 - 0.5, wpx * 0.5 + 0.5, distPx);
      waterA = max(waterA, line * alpha);
    }
  }
  // soft sheen on open water: a broad highlight fixed to the light (it slides over the map as the view
  // turns) plus a faint brightening toward grazing angles
  float ndv = clamp(dot(vS, V), 0.0, 1.0);
  float sheen = (pow(max(dot(vS, normalize(uLight + V)), 0.0), 22.0) * 0.55 + pow(1.0 - ndv, 4.0) * 0.45) * uSheen;
  ocean = mix(ocean, uSheenCol, sheen);
  ocean = mix(ocean, uWater, waterA);

  // ---- graticule, 15° ----
  float gw = 0.75 * uDpr;
  float gLat = abs(fract(latD / 15.0 + 0.5) - 0.5) * 15.0 / fLat;
  float gLng = abs(fract(lngD / 15.0 + 0.5) - 0.5) * 15.0 / fLng;
  float grat = max(1.0 - smoothstep(gw * 0.5 - 0.5, gw * 0.5 + 0.5, gLat),
                   (1.0 - smoothstep(gw * 0.5 - 0.5, gw * 0.5 + 0.5, gLng)) * (1.0 - smoothstep(76.0, 84.0, abs(latD))));

  vec3 col = mix(ocean, landCol, land);
  col = mix(col, uGrat, grat * mix(0.62, 0.22, land));

  // ---- gentle sphere light, limb darkening and a pale printed atmosphere at the rim ----
  // from the angular distance to the horizon, so a close camera never vignettes the view
  float hv = clamp(horizonVis(n), 0.0, 1.0);
  float limb = pow(1.0 - hv, 2.4);
  vec2 sd = vS.xy / max(length(vS.xy), 1e-4);
  float away = 0.5 - 0.5 * dot(sd, normalize(uLight.xy)); // 1 on the side away from the light
  col *= 0.955 + 0.07 * dot(vS, uLight);
  col = mix(col, col * uLimb, limb * (0.36 + 0.34 * away));
  col = mix(col, uHaze, pow(1.0 - hv, 7.0) * (0.42 - 0.16 * away));

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export function createSurface(placeholders, params, shared) {
  const uniforms = {
    ...shared, // uElev, uElevSize, uDisp, uElevLod, uHasElev, uDpr, uTime ...
    uRelief: { value: placeholders.black }, uHasRelief: { value: 0 }, uReliefSize: { value: new Vector2(2048, 1024) },
    uMask: { value: placeholders.black }, uHasMask: { value: 0 },
    uIndex: { value: placeholders.black }, uIndexSize: { value: new Vector2(1, 1) }, uHasIndex: { value: 0 },
    uPalette: { value: placeholders.black },
    uSdf: { value: placeholders.black }, uSdfSize: { value: new Vector2(2048, 1024) }, uHasSdf: { value: 0 },
    uSdfKm: { value: 800 }, uSdfGamma: { value: 1 },
    uSurveyMode: { value: 0 }, uDimDefault: { value: 0 },
    uShade: { value: 1.7 }, uShadeZ: { value: 42 }, uBakedShade: { value: 0 }, uReliefSoft: { value: 0 },
    uKmPerUnit: { value: 6371 },
    uLight: { value: new Vector3(-0.55, 0.62, 0.56).normalize() },
    uOcean: { value: new Color('#a9d2e4') },
    uShallow: { value: new Color('#c2e0ec') },
    uDeep: { value: new Color('#97c3da') },
    uHaze: { value: new Color('#e6eff2') },
    uSheenCol: { value: new Color('#f3f8f8') },
    uSheen: { value: 0.16 },
    uWater: { value: new Color('#5d9cc0') },
    uGrat: { value: new Color('#4f8fbd') },
    uPaper: { value: new Color('#f4f5f0') },
    uPlateLo: { value: new Color('#bfc3c0') },
    uPlateHi: { value: new Color('#e4e6e1') },
    uMagenta: { value: new Color('#c3177b') },
    uInk: { value: new Color('#1b232b') },
    uLimb: { value: new Color('#9fb3c2') },
    uIceLo: { value: new Color('#adbecb') },
    uIceHi: { value: new Color('#cad6de') },
    uWL0: { value: 9 }, uWLr: { value: 1.55 },
    // regional detail (only read with the DETAIL define)
    uDetail: { value: placeholders.black }, uDetailIdx: { value: placeholders.black },
    uDetailGrid: { value: new Vector4(36, 18, 504, 4) }, uDetailAtlas: { value: new Vector4(8, 512, 1 / 4096, 1 / 4096) },
    uDetailOn: { value: 0 }, uDetailZ: { value: new Vector2(56, 0.6) }, uDetailShade: { value: 0.62 },
    uContour: { value: new Vector4(500, 200, 0, 0) }, uContourIdx: { value: new Vector4(2500, 1000, 0, 0) },
    uContourCol: { value: new Color('#8a5a33') }, uContourIce: { value: new Color('#4f8fbd') }, uContourPlate: { value: new Color('#6f6a63') },
    uMicro: { value: 0 },
  };
  const material = new ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    defines: defineSet(params),
  });
  const mesh = new Mesh(cubeSphereGeometry(params.sphereN), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 0;
  return { mesh, material, uniforms };
}

export function defineSet(params) {
  const d = {};
  if (params.paletteTaps) d.PALETTE_TAPS = '';
  if (params.bicubicSdf) d.BICUBIC_SDF = '';
  if (params.detail) d.DETAIL = '';
  if (params.detail && params.micro) d.MICRO = '';
  return d;
}
