// Shared GLSL. Everything that sits on the displaced surface samples the same height function,
// so line work, fills and pins hug the relief exactly as the globe mesh does.

export const GLSL_COMMON = /* glsl */ `
#define PI 3.141592653589793
#define TAU 6.283185307179586
uniform sampler2D uElev;
uniform vec2 uElevSize;
uniform float uDisp;      // world units per unit of (elevation^2)
uniform float uElevLod;   // mip used for displacement (smooths the mesh)
uniform float uHasElev;
uniform float uLiftK;     // 1 = full overlay lifts; smaller under tilt so lifted overlays stay registered

vec2 dirToUv(vec3 d) {
  return vec2(atan(d.x, d.z) / TAU + 0.5, 0.5 - asin(clamp(d.y, -1.0, 1.0)) / PI);
}
// Greenland and Antarctica ice sheets: exaggerated domes read as clouds at the limb, so their lift is
// capped (full up to ~2,500 m at half strength, very little above).
float iceSheet(vec3 d) {
  float lat = asin(clamp(d.y, -1.0, 1.0)) * 57.29578;
  float lng = atan(d.x, d.z) * 57.29578;
  float ant = 1.0 - smoothstep(-62.0, -58.0, lat);
  float grl = smoothstep(58.0, 61.0, lat) * smoothstep(-76.0, -72.0, lng) * (1.0 - smoothstep(-14.0, -10.0, lng));
  return max(ant, grl);
}
float heightAt(vec3 d) {
  if (uHasElev < 0.5) return 0.0;
  float e = textureLod(uElev, dirToUv(d), uElevLod).r;
  float h = e * e;
  const float k = 0.2826; // 2,500 m as a fraction of 8,848 m
  float iceH = 0.5 * min(h, k) + 0.05 * max(h - k, 0.0);
  return mix(h, iceH, iceSheet(d));
}
// > 0 on the visible hemisphere, 1 at the sub-camera point. Unit sphere, camera outside.
float horizonVis(vec3 d) {
  float cl = length(cameraPosition);
  float ch = 1.0 / cl;
  return (dot(d, cameraPosition / cl) - ch) / (1.0 - ch);
}
`;

export const GLSL_NOISE = /* glsl */ `
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i), n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0)), n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1)), n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1)), n111 = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
             mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
`;
