// Raster assets: relief webp (2k/4k/8k), relief-land-4k, elevation-2k, coast-sdf-2k.
// All equirectangular 2:1, x = 0 at lon -180, y = 0 at lat +90, pixel-is-area.
import { readFile, writeFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as topojson from 'topojson-client';
import { geoPath, geoEquirectangular } from 'd3-geo';
import { R_KM } from './lib/geo.mjs';
import { TERRARIUM_Z } from './fetch.mjs';

sharp.cache(false);
const here = path.dirname(fileURLToPath(import.meta.url));
const cache = (p) => path.join(here, '.cache', p);
const RELIEF_TIF = cache('ne/HYP_50M_SR_W/HYP_50M_SR_W.tif');

export const RELIEF_BUDGETS = { 2048: 350 * 1024, 4096: 1.3 * 1024 * 1024, 8192: 4 * 1024 * 1024 };
export const NEUTRAL = [128, 128, 128];  // flat ocean fill in relief-land-4k
export const SDF_MAX_KM = 800;

// ---------- land mask ----------
// Rendered from the `land` object of data/world.json (Natural Earth 50m admin-0 merged by world-atlas),
// so the mask matches the vector coastlines the globe draws. d3's equirectangular path handles the
// Antarctica pole ring and antimeridian correctly. Returns coverage 0..255 per pixel.
export async function landCoverage(worldTopo, W, H) {
  const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]).precision(0.05);
  const d = geoPath(proj).digits(2)(topojson.feature(worldTopo, worldTopo.objects.land));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#000"/><path d="${d}" fill="#fff" fill-rule="nonzero"/></svg>`;
  const buf = await sharp(Buffer.from(svg), { limitInputPixels: false, unlimited: true }).greyscale().raw().toBuffer();
  if (buf.length !== W * H) throw new Error('mask size mismatch');
  return buf;
}

// Coverage rendered at factor x the target size, then box-downsampled: smoother, more accurate coast.
// All rasters use factor so that relief-land, elevation and coast-sdf agree on land/ocean.
export const MASK_FACTOR = { 2048: 4, 4096: 2 };
export async function coverageDown(worldTopo, W, H) {
  const f = MASK_FACTOR[W];
  const big = await landCoverage(worldTopo, W * f, H * f);
  // extractChannel: sharp promotes 1-channel raw input to sRGB on resize.
  const cov = await sharp(big, { raw: { width: W * f, height: H * f, channels: 1 } }).resize(W, H, { kernel: 'linear', fit: 'fill' }).extractChannel(0).raw().toBuffer();
  return { cov, big, bigW: W * f, bigH: H * f };
}

const PNG_OPTS = { compressionLevel: 9, adaptiveFiltering: true };

// ---------- webp with a size budget ----------
async function encodeWebpWithin(pipelineFactory, budget, { min = 40, max = 95 } = {}) {
  let lo = min, hi = max, best = null;
  while (lo <= hi) {
    const q = Math.floor((lo + hi) / 2);
    const buf = await pipelineFactory().webp({ quality: q, effort: 6, smartSubsample: true }).toBuffer();
    if (buf.length <= budget) { best = { q, buf }; lo = q + 1; } else hi = q - 1;
  }
  if (!best) throw new Error(`cannot meet budget ${budget}`);
  return best;
}

export async function buildRelief(outDir) {
  const meta = await sharp(RELIEF_TIF, { limitInputPixels: false }).metadata();
  const res = {};
  // Decode once into raw RGB, then derive each size from it.
  const raw = await sharp(RELIEF_TIF, { limitInputPixels: false }).removeAlpha().raw().toBuffer();
  const src = () => sharp(raw, { raw: { width: meta.width, height: meta.height, channels: 3 }, limitInputPixels: false });
  for (const W of [2048, 4096, 8192]) {
    const H = W / 2;
    const resized = await src().resize(W, H, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
    const fac = () => sharp(resized, { raw: { width: W, height: H, channels: 3 } });
    const { q, buf } = await encodeWebpWithin(fac, RELIEF_BUDGETS[W]);
    const name = `relief-${W / 1024}k.webp`;
    await writeFile(path.join(outDir, name), buf);
    res[name] = { quality: q, bytes: buf.length };
  }
  return { source: { width: meta.width, height: meta.height }, files: res };
}

export async function buildReliefLand(outDir, worldTopo) {
  const W = 4096, H = 2048;
  const rgb = await sharp(RELIEF_TIF, { limitInputPixels: false }).removeAlpha().resize(W, H, { kernel: 'lanczos3', fit: 'fill' }).raw().toBuffer();
  const { cov } = await coverageDown(worldTopo, W, H);
  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const a = cov[i] / 255;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = Math.round(rgb[i * 3 + c] * a + NEUTRAL[c] * (1 - a));
  }
  const fac = () => sharp(out, { raw: { width: W, height: H, channels: 3 } });
  const { q, buf } = await encodeWebpWithin(fac, RELIEF_BUDGETS[4096]);
  await writeFile(path.join(outDir, 'relief-land-4k.webp'), buf);
  return { 'relief-land-4k.webp': { quality: q, bytes: buf.length, neutral: `rgb(${NEUTRAL.join(',')})` } };
}

// ---------- elevation from Terrarium tiles ----------
async function terrariumMosaic(z) {
  const n = 2 ** z, T = 256, S = n * T;
  const elev = new Float32Array(S * S);
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) {
    const file = cache(`terrarium/${z}/${x}/${y}.png`);
    const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== T || info.height !== T) throw new Error(`unexpected tile size ${file}`);
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      const k = (j * T + i) * 3;
      elev[(y * T + j) * S + x * T + i] = data[k] * 256 + data[k + 1] + data[k + 2] / 256 - 32768;
    }
  }
  return { elev, S };
}

const MERC_MAX_LAT = 85.05112878;

export async function buildElevation(outDir, worldTopo) {
  const W = 2048, H = 1024, SS = 3; // 3x3 supersampling per output pixel
  const { elev, S } = await terrariumMosaic(TERRARIUM_Z);
  const sample = (lon, lat) => {
    // bilinear in mercator pixel space (pixel centres at +0.5), x wraps
    const φ = Math.max(-MERC_MAX_LAT, Math.min(MERC_MAX_LAT, lat)) * Math.PI / 180;
    const fx = ((lon + 180) / 360) * S - 0.5;
    const fy = ((1 - Math.log(Math.tan(Math.PI / 4 + φ / 2)) / Math.PI) / 2) * S - 0.5;
    const x0 = Math.floor(fx), y0 = Math.max(0, Math.min(S - 2, Math.floor(fy)));
    const tx = fx - x0, ty = Math.max(0, Math.min(1, fy - y0));
    const xa = ((x0 % S) + S) % S, xb = (xa + 1) % S;
    const e00 = elev[y0 * S + xa], e10 = elev[y0 * S + xb], e01 = elev[(y0 + 1) * S + xa], e11 = elev[(y0 + 1) * S + xb];
    return (e00 * (1 - tx) + e10 * tx) * (1 - ty) + (e01 * (1 - tx) + e11 * tx) * ty;
  };
  // South of the Mercator limit there are no tiles. Antarctica is best-effort there: the last tile row
  // is blended (smoothstep) toward that row's mean as latitude goes to -90, giving a smooth polar cap
  // instead of streaks. This cap is synthetic, not measured.
  // The boundary row is first smoothed along longitude (circular ±5.6° moving average) so ridges
  // that cross 85°S do not extend into streaks.
  const CAP_N = 4096, WIN = 64;
  const row = Float64Array.from({ length: CAP_N }, (_, k) => sample(-180 + ((k + 0.5) / CAP_N) * 360, -MERC_MAX_LAT));
  const capMean = row.reduce((x, y) => x + y, 0) / CAP_N;
  const smooth = new Float64Array(CAP_N);
  for (let k = 0; k < CAP_N; k++) { let acc = 0; for (let d = -WIN; d <= WIN; d++) acc += row[(k + d + CAP_N) % CAP_N]; smooth[k] = acc / (2 * WIN + 1); }
  const smoothAt = (lon) => {
    const f = ((lon + 180) / 360) * CAP_N - 0.5, k0 = Math.floor(f), t = f - k0;
    return smooth[(k0 + CAP_N) % CAP_N] * (1 - t) + smooth[(k0 + 1 + CAP_N) % CAP_N] * t;
  };
  const at = (lon, lat) => {
    if (lat >= -MERC_MAX_LAT) return sample(lon, lat);
    const t = Math.min(1, (-MERC_MAX_LAT - lat) / (90 - MERC_MAX_LAT)), s = t * t * (3 - 2 * t);
    const edge = sample(lon, -MERC_MAX_LAT), u = Math.min(1, t * 4);
    const base = edge * (1 - u) + smoothAt(lon) * u; // raw -> smoothed over the first ~1.2°
    return base * (1 - s) + capMean * s;
  };
  const { cov } = await coverageDown(worldTopo, W, H);
  const out = Buffer.alloc(W * H);
  let maxM = -Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (cov[i] < 128) { out[i] = 0; continue; } // ocean per the land mask
      let sum = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const lon = -180 + ((x + (sx + 0.5) / SS) / W) * 360;
        const lat = 90 - ((y + (sy + 0.5) / SS) / H) * 180;
        // North of the Mercator limit there is no data: 0 (it is all ocean in the mask anyway).
        if (lat > MERC_MAX_LAT) continue;
        sum += at(lon, lat);
      }
      const m = sum / (SS * SS);
      if (m > maxM) maxM = m;
      out[i] = Math.min(255, Math.round(255 * Math.sqrt(Math.max(0, m) / 8848)));
    }
  }
  await sharp(out, { raw: { width: W, height: H, channels: 1 } }).toColourspace('b-w').png(PNG_OPTS).toFile(path.join(outDir, 'elevation-2k.png'));
  return { 'elevation-2k.png': { bytes: (await stat(path.join(outDir, 'elevation-2k.png'))).size, maxMetresSampled: Math.round(maxM), southCapMeanMetres: Math.round(capMean), terrariumZoom: TERRARIUM_Z } };
}

// ---------- coast distance field ----------
// Coast points = edge midpoints between land and ocean pixels of an 8192x4096 mask (x wraps).
// For every ocean pixel of the 2048x1024 output, the great-circle distance to the nearest coast
// point is found with a 3D k-d tree on unit vectors (exact on the sphere, wraps the antimeridian).
class KDTree {
  constructor(pts /* Float64Array xyz */) {
    const n = pts.length / 3;
    this.pts = pts; this.idx = new Int32Array(n); for (let i = 0; i < n; i++) this.idx[i] = i;
    this.build(0, n, 0);
  }
  build(lo, hi, depth) {
    if (hi - lo <= 8) return;
    const ax = depth % 3, mid = (lo + hi) >> 1;
    this.select(lo, hi - 1, mid, ax);
    this.build(lo, mid, depth + 1); this.build(mid + 1, hi, depth + 1);
  }
  select(lo, hi, k, ax) { // quickselect on idx by coordinate ax
    const { idx, pts } = this;
    while (hi > lo) {
      const pv = pts[idx[(lo + hi) >> 1] * 3 + ax];
      let i = lo, j = hi;
      while (i <= j) {
        while (pts[idx[i] * 3 + ax] < pv) i++;
        while (pts[idx[j] * 3 + ax] > pv) j--;
        if (i <= j) { const t = idx[i]; idx[i] = idx[j]; idx[j] = t; i++; j--; }
      }
      if (k <= j) hi = j; else if (k >= i) lo = i; else return;
    }
  }
  nearest(x, y, z, maxD2) {
    this.best = maxD2; this.q = [x, y, z];
    this.search(0, this.idx.length, 0);
    return this.best;
  }
  search(lo, hi, depth) {
    const { idx, pts, q } = this;
    if (hi - lo <= 8) {
      for (let i = lo; i < hi; i++) {
        const p = idx[i] * 3, dx = pts[p] - q[0], dy = pts[p + 1] - q[1], dz = pts[p + 2] - q[2];
        const d = dx * dx + dy * dy + dz * dz; if (d < this.best) this.best = d;
      }
      return;
    }
    const ax = depth % 3, mid = (lo + hi) >> 1, p = idx[mid] * 3;
    const dx = pts[p] - q[0], dy = pts[p + 1] - q[1], dz = pts[p + 2] - q[2];
    const d = dx * dx + dy * dy + dz * dz; if (d < this.best) this.best = d;
    const diff = q[ax] - pts[p + ax];
    const [first, second] = diff < 0 ? [[lo, mid], [mid + 1, hi]] : [[mid + 1, hi], [lo, mid]];
    this.search(first[0], first[1], depth + 1);
    if (diff * diff < this.best) this.search(second[0], second[1], depth + 1);
  }
}

export async function buildCoastSdf(outDir, worldTopo) {
  const W = 2048, H = 1024;
  const { cov, big: fine, bigW: FW, bigH: FH } = await coverageDown(worldTopo, W, H);
  const isLand = (x, y) => fine[y * FW + (((x % FW) + FW) % FW)] >= 128;
  const toVec = (px, py, Wd, Hd, out, o) => {
    const lon = (px / Wd) * 2 * Math.PI - Math.PI, lat = Math.PI / 2 - (py / Hd) * Math.PI;
    const c = Math.cos(lat); out[o] = c * Math.cos(lon); out[o + 1] = c * Math.sin(lon); out[o + 2] = Math.sin(lat);
  };
  // collect edge midpoints (pixel-edge coordinates)
  const tmp = [];
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    const l = isLand(x, y);
    if (l !== isLand(x + 1, y)) tmp.push(x + 1, y + 0.5);
    if (y + 1 < FH && l !== isLand(x, y + 1)) tmp.push(x + 0.5, y + 1);
  }
  const n = tmp.length / 2, pts = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) toVec(tmp[i * 2], tmp[i * 2 + 1], FW, FH, pts, i * 3);
  const tree = new KDTree(pts);
  const chordMax = 2 * Math.sin((SDF_MAX_KM * 1.01) / (2 * R_KM));
  const out = Buffer.alloc(W * H), v = new Float64Array(3);
  let ocean = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (cov[i] >= 128) { out[i] = 0; continue; }
    ocean++;
    toVec(x + 0.5, y + 0.5, W, H, v, 0);
    const d2 = tree.nearest(v[0], v[1], v[2], chordMax * chordMax);
    const km = 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(d2) / 2));
    // Ocean is never 0, so `value == 0` is an exact land test at this resolution.
    out[i] = Math.max(1, Math.min(255, Math.round((km / SDF_MAX_KM) * 255)));
  }
  await sharp(out, { raw: { width: W, height: H, channels: 1 } }).toColourspace('b-w').png(PNG_OPTS).toFile(path.join(outDir, 'coast-sdf-2k.png'));
  return { 'coast-sdf-2k.png': { bytes: (await stat(path.join(outDir, 'coast-sdf-2k.png'))).size, coastPoints: n, oceanPixels: ocean } };
}
