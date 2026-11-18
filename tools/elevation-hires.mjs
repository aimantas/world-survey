// Regional detail elevation for the globe's close zoom: 10° x 10° equirectangular tiles, loaded by the
// engine only when the camera is zoomed in (src/globe/detail.js). Built from AWS Terrain Tiles
// (Terrarium) zoom 6, which this script fetches into tools/.cache/terrarium/6/ (only tiles that touch
// land). Never shipped itself; writes assets/elevation-18k-cCCrRR.png and src/globe/detail-index.js.
//
//   node elevation-hires.mjs            # fetch (idempotent) + build every land tile
//   node elevation-hires.mjs plan       # list land tiles and the z6 tile count, no network
//   node elevation-hires.mjs fetch      # only download missing z6 tiles
//   node elevation-hires.mjs build [c09r02 ...]   # only build (all, or the named tiles)
//
// Tile grid: 36 columns x 18 rows of 10°; column c covers lon -180 + 10c .. -170 + 10c, row r covers
// lat 90 - 10r .. 80 - 10r. Each file is 512 x 512: 504 content pixels (0.01984°, about 2.2 km) plus a
// 4-pixel gutter on every side sampled from the neighbouring ground, so bilinear / bicubic taps never
// cross a tile edge. Pixel centres: lon = lon0 + (px - 4 + 0.5) * 10 / 504 (same for lat, downward).
// "18k" = the equivalent global width (36 x 504 = 18,144 px).
//
// Samples are cubic B-spline coefficients (bsplinePrefilter), so the engine's B-spline sampling
// interpolates the measured heights; ocean pixels keep the coefficients near the coast (ringing there
// is never drawn) and are exactly 0 m further out.
// Encoding: 16-bit greyscale PNG (big-endian), logarithmic so the steps follow what a hillshade needs:
// code = round(ZERO + sign(m) * ln(1 + |m| * K / S0) / K), decode m = sign(c - ZERO) * (exp(|c - ZERO| * K) - 1) * S0 / K.
// Steps are 0.5 m at sea level, 2.5 m at 1,000 m, 6.5 m at 3,000 m (codes stay under 4,096). Ocean (Natural Earth 50m land mask, the one the globe draws) is exactly 0 m. Land within two
// pixels of the sea, and all land outside a short list of real dry depressions (DEPRESSIONS: Dead Sea,
// Caspian shore, Qattara ...) is clamped to >= 0 m, so ice-shelf, fjord and lake beds never show as trenches.
// South of the Mercator limit (85.05°S) the Antarctic plateau comes from assets/elevation-2k.png
// (whose polar cap is itself synthetic; see tools/README.md).
import { readFile, writeFile, stat, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as topojson from 'topojson-client';
import { geoPath, geoEquirectangular } from 'd3-geo';

sharp.cache(false);
sharp.concurrency(4);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const cache = (p) => path.join(here, '.cache', p);

export const Z = 6;
export const COLS = 36, ROWS = 18, TILE_DEG = 10, CONTENT = 504, GUTTER = 4, SIZE = CONTENT + 2 * GUTTER;
export const ZERO = 2000, S0 = 0.5, K = 0.002, MIN_M = -500;
const encode = (m) => Math.round(ZERO + Math.sign(m) * Math.log(1 + Math.abs(m) * K / S0) / K);
const PX_DEG = TILE_DEG / CONTENT;
const MERC_MAX_LAT = 85.05112878;
const N = 2 ** Z;
const terrariumUrl = (x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`;
const tileName = (c, r) => `elevation-18k-c${String(c).padStart(2, '0')}r${String(r).padStart(2, '0')}.png`;

// [lat0, lat1, lon0, lon1] boxes where land really lies below sea level.
const DEPRESSIONS = [
  [29.5, 33.5, 34.8, 36.0],    // Dead Sea, Jordan valley
  [36.0, 48.5, 44.0, 58.0],    // Caspian depression, Karagiye, Akdzhakaya
  [27.5, 31.0, 24.0, 30.0],    // Qattara, Siwa
  [11.0, 15.0, 39.5, 43.0],    // Danakil, Lake Assal
  [42.0, 43.5, 88.0, 90.5],    // Turpan
  [32.5, 37.0, -117.5, -115.0], // Death Valley, Salton trough
  [51.3, 53.5, 3.5, 7.2],      // Dutch polders
  [33.5, 35.0, 5.5, 9.0],      // Chott Melrhir
  [-29.0, -27.5, 136.5, 138.5], // Kati Thanda-Lake Eyre
  [-50.0, -49.0, -68.6, -67.9], // Laguna del Carbón
];
const inDepression = (lat, lon) => DEPRESSIONS.some(([a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d);

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

// ---------- coarse land test from the shipped 2k coast SDF (0 = land) ----------
async function loadSdf() {
  const { data, info } = await sharp(path.join(root, 'assets/coast-sdf-2k.png')).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return { data, W: info.width, H: info.height };
}
function anyLand(sdf, lonA, lonB, latA, latB) { // lon range may exceed ±180 (wraps); lat clamped
  const { data, W, H } = sdf;
  const x0 = Math.floor(((lonA + 180) / 360) * W) - 1, x1 = Math.ceil(((lonB + 180) / 360) * W) + 1;
  const y0 = Math.max(0, Math.floor(((90 - latB) / 180) * H) - 1), y1 = Math.min(H - 1, Math.ceil(((90 - latA) / 180) * H) + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (data[y * W + (((x % W) + W) % W)] === 0) return true;
  return false;
}

// ---------- tiles ----------
function tileWindow(c, r) {
  const lon0 = -180 + TILE_DEG * c, lat0 = 90 - TILE_DEG * r;
  const g = GUTTER * PX_DEG;
  return { lon0, lat0, lonA: lon0 - g, lonB: lon0 + TILE_DEG + g, latA: lat0 - TILE_DEG - g, latB: lat0 + g };
}
export async function landTiles(sdf) {
  const out = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const w = tileWindow(c, r);
    if (anyLand(sdf, w.lonA, w.lonB, Math.max(-90, w.latA), Math.min(90, w.latB))) out.push([c, r]);
  }
  return out;
}
const mercY = (lat) => {
  const φ = Math.max(-MERC_MAX_LAT, Math.min(MERC_MAX_LAT, lat)) * Math.PI / 180;
  return ((1 - Math.log(Math.tan(Math.PI / 4 + φ / 2)) / Math.PI) / 2) * N; // in tiles
};
const mercLat = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y / N))) * 180) / Math.PI;
function z6Range(w) {
  const x0 = Math.floor(((w.lonA + 180) / 360) * N), x1 = Math.floor(((w.lonB + 180) / 360) * N - 1e-9);
  const y0 = Math.max(0, Math.floor(mercY(Math.min(MERC_MAX_LAT, w.latB)))), y1 = Math.min(N - 1, Math.floor(mercY(Math.max(-MERC_MAX_LAT, w.latA)) - 1e-9));
  return { x0, x1, y0, y1 };
}
function z6TouchesLand(sdf, x, y) {
  const lonA = (x / N) * 360 - 180, lonB = ((x + 1) / N) * 360 - 180;
  const latB = mercLat(y), latA = mercLat(y + 1);
  return anyLand(sdf, lonA - 0.2, lonB + 0.2, latA - 0.2, latB + 0.2);
}

// ---------- fetch ----------
async function download(url, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'geography-globe-data-build/0.1 (offline data build)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      return res.headers.get('x-amz-meta-x-imagery-sources');
    } catch (e) {
      if (i >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
}
export async function fetchZ6(sdf, tiles) {
  const want = new Set();
  for (const [c, r] of tiles) {
    const { x0, x1, y0, y1 } = z6Range(tileWindow(c, r));
    for (let xx = x0; xx <= x1; xx++) for (let y = y0; y <= y1; y++) {
      const x = ((xx % N) + N) % N;
      if (z6TouchesLand(sdf, x, y)) want.add(`${x}/${y}`);
    }
  }
  const srcPath = cache(`terrarium/sources-z${Z}.json`);
  const sources = (await exists(srcPath)) ? JSON.parse(await readFile(srcPath, 'utf8')) : {};
  const jobs = [...want];
  let fetched = 0, done = 0;
  const worker = async () => {
    while (jobs.length) {
      const key = jobs.pop();
      const [x, y] = key.split('/').map(Number);
      const dest = cache(`terrarium/${Z}/${x}/${y}.png`);
      if (!(await exists(dest)) || !(key in sources)) {
        sources[key] = await download(terrariumUrl(x, y), dest);
        fetched++;
      }
      if (++done % 200 === 0) console.log(`z${Z}: ${done}/${want.size}`);
    }
  };
  await Promise.all(Array.from({ length: 10 }, worker));
  await writeFile(srcPath, JSON.stringify(sources, null, 0));
  const datasets = new Set();
  for (const v of Object.values(sources)) for (const s of String(v || '').split(',')) if (s.trim()) datasets.add(s.trim().split('/')[0]);
  const manifestPath = cache('manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest[`terrarium:z${Z}`] = {
    url: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/{x}/{y}.png`,
    tiles: Object.keys(sources).length, note: 'only tiles touching land', datasets: [...datasets].sort(),
    retrieved: manifest[`terrarium:z${Z}`]?.retrieved && fetched === 0 ? manifest[`terrarium:z${Z}`].retrieved : new Date().toISOString().slice(0, 10),
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { wanted: want.size, fetched, datasets: [...datasets].sort() };
}

// ---------- build ----------
async function decodeTerrarium(file) {
  const { data } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const e = new Float32Array(256 * 256);
  for (let i = 0; i < e.length; i++) e[i] = data[i * 3] * 256 + data[i * 3 + 1] + data[i * 3 + 2] / 256 - 32768;
  return e;
}

// Land coverage for one tile window at 2x, box-downsampled (rotation keeps the antimeridian far away).
async function tileCoverage(landFeature, w) {
  const F = 3, S = SIZE * F;
  const pxRad = (PX_DEG / F) * Math.PI / 180;
  const centre = w.lon0 + TILE_DEG / 2;
  const proj = geoEquirectangular().rotate([-centre, 0]).scale(1 / pxRad)
    .translate([S / 2, (w.latB * Math.PI / 180) / pxRad]).precision(0.02)
    .clipExtent([[-4, -4], [S + 4, S + 4]]);
  const d = geoPath(proj).digits(2)(landFeature) || '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" fill="#000"/><path d="${d}" fill="#fff" fill-rule="nonzero"/></svg>`;
  const big = await sharp(Buffer.from(svg), { limitInputPixels: false, unlimited: true }).greyscale().raw().toBuffer();
  return sharp(big, { raw: { width: S, height: S, channels: 1 } }).resize(SIZE, SIZE, { kernel: 'linear', fit: 'fill' }).extractChannel(0).raw().toBuffer();
}

async function loadElev2k() {
  const { data, info } = await sharp(path.join(root, 'assets/elevation-2k.png')).extractChannel(0).raw().toBuffer({ resolveWithObject: true });
  return (lon, lat) => {
    const fx = ((lon + 180) / 360) * info.width - 0.5, fy = Math.min(info.height - 1.001, Math.max(0, ((90 - lat) / 180) * info.height - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const W = info.width, g = (x, y) => { const v = data[y * W + (((x % W) + W) % W)] / 255; return 8848 * v * v; };
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  };
}

// Cubic B-spline prefilter (Unser): after it, the shader's B-spline reconstruction passes through the
// original samples instead of blurring them by about a pixel. Separable causal + anticausal recursion,
// pole sqrt(3) - 2; the 4 px gutter holds the neighbouring ground, so edge effects stay below 0.5%.
function bsplinePrefilter(a, W, H) {
  const z = Math.sqrt(3) - 2, g = 6, line = new Float64Array(Math.max(W, H));
  const run = (n) => {
    let s = 0, zk = 1;
    for (let k = 0; k < Math.min(n, 12); k++) { s += zk * line[k]; zk *= z; } // causal init (mirror-free truncation)
    line[0] = s * g;
    for (let k = 1; k < n; k++) line[k] = line[k] * g + z * line[k - 1];
    line[n - 1] = (z / (z * z - 1)) * (line[n - 1] + z * line[n - 2]);
    for (let k = n - 2; k >= 0; k--) line[k] = z * (line[k + 1] - line[k]);
  };
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) line[x] = a[y * W + x]; run(W); for (let x = 0; x < W; x++) a[y * W + x] = line[x]; }
  for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) line[y] = a[y * W + x]; run(H); for (let y = 0; y < H; y++) a[y * W + x] = line[y]; }
}

export async function buildTile(c, r, { landFeature, elev2k }) {
  const w = tileWindow(c, r);
  const { x0, x1, y0, y1 } = z6Range(w);
  const nx = x1 - x0 + 1, ny = y1 - y0 + 1, MW = nx * 256, MH = ny * 256;
  const mosaic = new Float32Array(MW * MH); // missing (ocean-only) tiles stay 0
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = (((x0 + i) % N) + N) % N, y = y0 + j;
    const file = cache(`terrarium/${Z}/${x}/${y}.png`);
    if (!(await exists(file))) continue;
    const e = await decodeTerrarium(file);
    for (let row = 0; row < 256; row++) mosaic.set(e.subarray(row * 256, row * 256 + 256), (j * 256 + row) * MW + i * 256);
  }
  const sample = (lon, lat) => { // bilinear in Mercator pixel space of the local mosaic
    if (lat < -MERC_MAX_LAT) return elev2k(lon, lat);
    const fx = ((lon + 180) / 360) * N * 256 - x0 * 256 - 0.5;
    const fy = mercY(Math.min(MERC_MAX_LAT, lat)) * 256 - y0 * 256 - 0.5;
    const xi = Math.max(0, Math.min(MW - 2, Math.floor(fx))), yi = Math.max(0, Math.min(MH - 2, Math.floor(fy)));
    const tx = Math.max(0, Math.min(1, fx - xi)), ty = Math.max(0, Math.min(1, fy - yi));
    const k = yi * MW + xi;
    return (mosaic[k] * (1 - tx) + mosaic[k + 1] * tx) * (1 - ty) + (mosaic[k + MW] * (1 - tx) + mosaic[k + MW + 1] * tx) * ty;
  };
  const cov = await tileCoverage(landFeature, w);
  const land = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < land.length; i++) land[i] = cov[i] >= 128 ? 1 : 0;
  // ocean dilated by 2 px: land there is clamped to >= 0 m
  const near = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!land[y * SIZE + x]) continue;
    let n = 0;
    for (let dy = -2; dy <= 2 && !n; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < SIZE && yy < SIZE && !land[yy * SIZE + xx]) { n = 1; break; }
    }
    near[y * SIZE + x] = n;
  }
  const metres = new Float32Array(SIZE * SIZE); // ocean 0
  const zero = ZERO;
  let maxM = -Infinity, minM = Infinity, landPx = 0;
  for (let py = 0; py < SIZE; py++) {
    const latC = w.lat0 - (py - GUTTER + 0.5) * PX_DEG;
    const cl = Math.max(0.05, Math.cos(Math.max(-89.9, Math.min(89.9, latC)) * Math.PI / 180));
    const ss = Math.max(2, Math.min(5, Math.ceil(0.9 / cl + 0.5)));
    for (let px = 0; px < SIZE; px++) {
      const i = py * SIZE + px;
      if (!land[i]) continue;
      let sum = 0;
      for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
        const lon = w.lon0 + (px - GUTTER + (sx + 0.5) / ss) * PX_DEG;
        const lat = w.lat0 - (py - GUTTER + (sy + 0.5) / ss) * PX_DEG;
        sum += sample(lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon, Math.max(-90, Math.min(90, lat)));
      }
      let m = sum / (ss * ss);
      // below sea level only inside the known dry depressions; elsewhere negative land values are a
      // bed (ice shelves, fjords and lakes in ETOPO1 Bed), not a surface
      if (m < 0 && (near[i] || !inDepression(latC, w.lon0 + (px - GUTTER + 0.5) * PX_DEG))) m = 0;
      m = Math.max(MIN_M, m);
      landPx++;
      if (m > maxM) maxM = m;
      if (m < minM) minM = m;
      metres[i] = m;
    }
  }
  bsplinePrefilter(metres, SIZE, SIZE);
  const out = new Uint16Array(SIZE * SIZE);
  for (let i = 0; i < out.length; i++) out[i] = land[i] || Math.abs(metres[i]) > 0.25 ? encode(Math.max(MIN_M, metres[i])) : zero;
  const file = path.join(root, 'assets', tileName(c, r));
  await sharp(out, { raw: { width: SIZE, height: SIZE, channels: 1 } }).toColourspace('grey16')
    .png({ compressionLevel: 9, adaptiveFiltering: true, palette: false }).toFile(file);
  const bytes = (await stat(file)).size;
  return { c, r, file: tileName(c, r), bytes, landPx, maxM: Math.round(maxM), minM: Math.round(minM) };
}

async function writeIndex(results) {
  results.sort((a, b) => a.r - b.r || a.c - b.c);
  const total = results.reduce((s, t) => s + t.bytes, 0);
  const js = `// Generated by tools/elevation-hires.mjs. Do not edit by hand.
// Regional detail elevation tiles (Terrain Tiles on AWS, Terrarium z${Z}): ${results.length} land tiles, ${(total / 1e6).toFixed(1)} MB in total,
// fetched one by one only when zoomed in. File names are listed in full so the site build ships them.
export const DETAIL_GRID = { cols: ${COLS}, rows: ${ROWS}, tileDeg: ${TILE_DEG}, content: ${CONTENT}, gutter: ${GUTTER}, size: ${SIZE}, encoding: 'log', zero: ${ZERO}, s0: ${S0}, k: ${K} };
// [col, row, bytes, file]
export const DETAIL_TILES = [
${results.map((t) => `  [${t.c}, ${t.r}, ${t.bytes}, '${t.file}'],`).join('\n')}
];
`;
  await writeFile(path.join(root, 'src/globe/detail-index.js'), js);
  return total;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = ['fetch', 'build', 'plan'].includes(args[0]) ? args.shift() : 'all';
  const sdf = await loadSdf();
  const tiles = await landTiles(sdf);
  console.log(`${tiles.length} land tiles of ${COLS * ROWS}`);
  if (mode === 'plan') {
    const want = new Set();
    for (const [c, r] of tiles) {
      const { x0, x1, y0, y1 } = z6Range(tileWindow(c, r));
      for (let xx = x0; xx <= x1; xx++) for (let y = y0; y <= y1; y++) { const x = ((xx % N) + N) % N; if (z6TouchesLand(sdf, x, y)) want.add(`${x}/${y}`); }
    }
    console.log(tiles.map(([c, r]) => `c${c}r${r}`).join(' '));
    console.log(`z${Z} tiles touching land tiles: ${want.size}`);
    return;
  }
  if (mode !== 'build') console.log('fetch', await fetchZ6(sdf, tiles));
  if (mode === 'fetch') return;
  const only = args.length ? new Set(args) : null;
  const topo = JSON.parse(await readFile(path.join(root, 'data/world.json'), 'utf8'));
  const landFeature = topojson.feature(topo, topo.objects.land);
  const elev2k = await loadElev2k();
  const logPath = path.join(here, '.cache', `detail-z${Z}-log.json`);
  const prev = (await exists(logPath)) ? JSON.parse(await readFile(logPath, 'utf8')) : {};
  for (const [c, r] of tiles) {
    const key = `c${String(c).padStart(2, '0')}r${String(r).padStart(2, '0')}`;
    if (only && !only.has(key) && !only.has(`c${c}r${r}`)) continue;
    const t0 = Date.now();
    prev[key] = await buildTile(c, r, { landFeature, elev2k });
    console.log(key, prev[key].bytes, `${prev[key].minM}..${prev[key].maxM} m`, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await writeFile(logPath, JSON.stringify(prev, null, 1));
  const built = Object.values(prev).filter((t) => t.landPx > 0 && tiles.some(([c, r]) => c === t.c && r === t.r));
  for (const t of Object.values(prev)) if (!t.landPx) await rm(path.join(root, 'assets', t.file), { force: true });
  const total = await writeIndex(built);
  console.log(`index: ${built.length} tiles, ${(total / 1e6).toFixed(2)} MB`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
