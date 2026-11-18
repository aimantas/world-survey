// Screen-aligned paper furniture drawn in one full-screen pass after the globe (depth-tested at the
// far plane, so it only shows where the globe did not draw): soft paper shadow, a pale printed
// atmosphere just outside the limb (a halo of pale blue ink, densest on the lit side, not a glow), ink
// outline circle at the silhouette, and an outer degree ring with graduated tick marks, like a
// meridian ring drawn on paper. Constant pixel line weights.
import { BufferGeometry, BufferAttribute, ShaderMaterial, Mesh, Color, Vector2, Sphere, Vector3, DoubleSide } from './three.js';

// A quad covering only the ring + shadow around the globe (not the whole screen).
const VERT = /* glsl */ `
uniform vec2 uCenter;
uniform float uR;
uniform float uDpr;
uniform vec2 uRes;
void main() {
  float ext = max(uR * 1.32, uR + max(9.0 * uDpr, uR * 0.045) + max(7.0 * uDpr, uR * 0.032) + 8.0 * uDpr) + 4.0;
  vec2 px = uCenter + position.xy * ext;
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.99999, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec2 uCenter;   // drawing-buffer px (gl_FragCoord space)
uniform float uR;       // silhouette radius, drawing-buffer px
uniform float uDpr;
uniform float uAlpha;   // ring fade (zoomed in = 0)
uniform float uShadowA;
uniform float uSpin;    // degrees: the ring's numbering follows the camera's longitude a little
uniform vec3 uInk, uShadow, uMagenta, uHalo;
uniform float uHaloA;
uniform float uMarkAngle; // magenta index mark (radians, screen), < -9 = hidden

float lineAt(float d, float w) { return 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, abs(d)); }

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float r = length(p);
  float dp = uDpr;

  // soft paper shadow, offset down-right (light from the upper left)
  vec2 sp = p - vec2(0.045, -0.075) * uR;
  float sd = length(sp * vec2(1.0, 1.04));
  float shadow = uShadowA * (1.0 - smoothstep(uR * 0.72, uR * 1.2, sd));
  shadow += uShadowA * 0.55 * (1.0 - smoothstep(uR * 0.96, uR * 1.04, sd));

  // pale printed atmosphere hugging the limb: a thin band fading out, a little denser toward the light
  float hw = max(3.0 * dp, uR * 0.022);
  float dr = r - uR;
  float lit = 0.5 + 0.5 * dot(p / max(r, 1.0), normalize(vec2(-0.55, 0.62)));
  float halo = uHaloA * step(0.0, dr) * exp(-dr / hw) * (0.55 + 0.45 * lit);

  // ink outline just outside the silhouette
  float ow = 1.35 * dp;
  float ink = lineAt(r - uR - ow * 0.5, ow);

  // degree ring
  float gap = max(9.0 * dp, uR * 0.045);
  float band = max(7.0 * dp, uR * 0.032);
  float r1 = uR + gap, r2 = r1 + band;
  float ringA = 0.0;
  ringA = max(ringA, lineAt(r - r1, 0.9 * dp));
  ringA = max(ringA, lineAt(r - r2, 0.9 * dp));
  float ang = atan(p.y, p.x);
  float deg = degrees(ang) + uSpin;
  float inBand = step(r1, r) * step(r, r2);
  float pxPerDeg = r * 0.0174533;
  // 1° micro ticks where they have room, 5° short, 15° full, 90° full + outer spur
  float d1 = abs(fract(deg + 0.5) - 0.5) * pxPerDeg;
  float d5 = abs(fract(deg / 5.0 + 0.5) - 0.5) * 5.0 * pxPerDeg;
  float d15 = abs(fract(deg / 15.0 + 0.5) - 0.5) * 15.0 * pxPerDeg;
  float d90 = abs(fract(deg / 90.0 + 0.5) - 0.5) * 90.0 * pxPerDeg;
  float tw = 0.85 * dp;
  float t = (r - r1) / band; // 0 inner .. 1 outer
  float micro = lineAt(d1, tw * 0.8) * step(t, 0.28) * smoothstep(3.5 * dp, 5.0 * dp, pxPerDeg) * 0.7;
  float minor = lineAt(d5, tw) * step(t, 0.5);
  float major = lineAt(d15, tw * 1.15);
  float ticks = max(max(micro, minor), major) * inBand;
  float spur = lineAt(d90, 1.2 * dp) * step(r2, r) * step(r, r2 + 5.0 * dp);
  ringA = max(ringA, max(ticks, spur));
  ringA *= 0.78;

  // magenta index mark on the ring (points at the active target bearing)
  float mark = 0.0;
  if (uMarkAngle > -9.0) {
    float da = abs(mod(ang - uMarkAngle + 3.14159265, 6.2831853) - 3.14159265) * r2;
    float tri = step(r2, r) * step(r, r2 + 7.0 * dp) * (1.0 - smoothstep(0.0, 1.0, da - (r2 + 7.0 * dp - r) * 0.7));
    mark = tri;
  }

  float lines = max(ink, ringA * uAlpha);
  // composite: halo over shadow, lines over both, mark over all (premultiplied)
  vec4 acc = vec4(uShadow * shadow, shadow);
  acc = vec4(uHalo * halo, halo) + acc * (1.0 - halo);
  acc = vec4(uInk * lines, lines) + acc * (1.0 - lines);
  acc = vec4(uMagenta * mark, mark) + acc * (1.0 - mark);
  if (acc.a < 0.002) discard;
  gl_FragColor = vec4(acc.rgb / acc.a, acc.a);
  #include <colorspace_fragment>
}
`;

export function createFrame() {
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0]), 3));
  geo.setIndex([0, 1, 2, 2, 1, 3]);
  geo.boundingSphere = new Sphere(new Vector3(), 1e3);
  const uniforms = {
    uCenter: { value: new Vector2() }, uR: { value: 100 }, uDpr: { value: 1 }, uAlpha: { value: 1 }, uRes: { value: new Vector2(1, 1) },
    uShadowA: { value: 0.16 }, uSpin: { value: 0 }, uMarkAngle: { value: -10 },
    uInk: { value: new Color('#1b232b') }, uShadow: { value: new Color('#2b3a4a') }, uMagenta: { value: new Color('#c3177b') },
    uHalo: { value: new Color('#bcd9e8') }, uHaloA: { value: 0.62 },
  };
  const material = new ShaderMaterial({
    uniforms, vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthTest: true, depthWrite: false, side: DoubleSide,
  });
  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;
  return { mesh, uniforms, material };
}
