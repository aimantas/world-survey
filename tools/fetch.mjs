// Downloads every remote source into tools/.cache/ (idempotent: existing files are kept).
// Downloaded files are treated as data only: nothing from the cache is executed.
// Usage: node fetch.mjs [--force-wb] [--force-wd]   (refresh the World Bank / Wikidata responses)
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = path.join(here, '.cache');
const force = new Set(process.argv.slice(2));

export const SOURCES = {
  places: {
    url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson',
    file: 'ne/ne_10m_populated_places_simple.geojson',
  },
  relief: {
    url: 'https://naturalearth.s3.amazonaws.com/50m_raster/HYP_50M_SR_W.zip',
    file: 'ne/HYP_50M_SR_W.zip',
  },
};
export const WB_INDICATORS = ['SP.POP.TOTL', 'NY.GDP.MKTP.CD', 'SP.DYN.LE00.IN'];
export const wbUrl = (ind) => `https://api.worldbank.org/v2/country/all/indicator/${ind}?format=json&mrnev=1&per_page=20000`;
// Fallback for capital coordinates missing from Natural Earth populated places (CC0).
export const WIKIDATA_CAPITALS_QUERY = 'SELECT ?iso3 ?cap ?capLabel ?coord WHERE { ?c wdt:P298 ?iso3 . ?c wdt:P36 ?cap . ?cap wdt:P625 ?coord . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }';
export const wikidataUrl = () => `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(WIKIDATA_CAPITALS_QUERY)}`;
export const TERRARIUM_Z = 4;
export const terrariumUrl = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

async function exists(p) { try { await stat(p); return true; } catch { return false; } }

async function download(url, dest, { retries = 3 } = {}) {
  await mkdir(path.dirname(dest), { recursive: true });
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'geography-globe-data-build/0.1 (offline data build)', Accept: 'application/sparql-results+json, application/json, */*' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(dest, buf);
      return buf;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function main() {
  await mkdir(cache, { recursive: true });
  const manifestPath = path.join(cache, 'manifest.json');
  const manifest = (await exists(manifestPath)) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
  const today = new Date().toISOString().slice(0, 10);
  const record = async (key, url, dest) => {
    const buf = await readFile(dest);
    manifest[key] = manifest[key] && manifest[key].sha256 === sha(buf)
      ? manifest[key]
      : { url, file: path.relative(cache, dest), bytes: buf.length, sha256: sha(buf), retrieved: today };
  };

  for (const [key, s] of Object.entries(SOURCES)) {
    const dest = path.join(cache, s.file);
    if (!(await exists(dest))) { console.log('fetch', s.url); await download(s.url, dest); }
    await record(key, s.url, dest);
  }

  // Unzip the relief raster (plain data extraction with the system unzip; nothing executed).
  const reliefDir = path.join(cache, 'ne/HYP_50M_SR_W');
  if (!(await exists(path.join(reliefDir, 'HYP_50M_SR_W.tif')))) {
    await mkdir(reliefDir, { recursive: true });
    execFileSync('unzip', ['-o', '-j', path.join(cache, SOURCES.relief.file), '*.tif', '*.tfw', '*.prj', '*.txt', '*.README*', '-d', reliefDir], { stdio: 'inherit' });
  }

  for (const ind of WB_INDICATORS) {
    const dest = path.join(cache, 'worldbank', `${ind}.json`);
    if (!(await exists(dest)) || force.has('--force-wb')) { console.log('fetch', wbUrl(ind)); await download(wbUrl(ind), dest); }
    await record(`wb:${ind}`, wbUrl(ind), dest);
  }

  {
    const dest = path.join(cache, 'wikidata', 'capitals.json');
    if (!(await exists(dest)) || force.has('--force-wd')) { console.log('fetch wikidata capitals'); await download(wikidataUrl(), dest); }
    await record('wikidata:capitals', 'https://query.wikidata.org/sparql (query in tools/fetch.mjs)', dest);
  }

  const z = TERRARIUM_Z, n = 2 ** z;
  let fetched = 0;
  const jobs = [];
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) jobs.push([x, y]);
  const worker = async () => {
    while (jobs.length) {
      const [x, y] = jobs.pop();
      const dest = path.join(cache, `terrarium/${z}/${x}/${y}.png`);
      if (!(await exists(dest))) { await download(terrariumUrl(z, x, y), dest); fetched++; }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  // Record which source datasets each tile was built from (S3 metadata header), for attribution.
  const srcPath = path.join(cache, `terrarium/sources-z${z}.json`);
  if (!(await exists(srcPath))) {
    const perTile = {};
    const heads = [];
    for (let x = 0; x < n; x++) for (let y = 0; y < n; y++) heads.push([x, y]);
    const headWorker = async () => {
      while (heads.length) {
        const [x, y] = heads.pop();
        for (let attempt = 0; ; attempt++) {
          try {
            const res = await fetch(terrariumUrl(z, x, y), { method: 'HEAD' });
            perTile[`${z}/${x}/${y}`] = res.headers.get('x-amz-meta-x-imagery-sources') ?? null;
            break;
          } catch (e) {
            if (attempt >= 4) throw e;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
      }
    };
    await Promise.all(Array.from({ length: 4 }, headWorker));
    await writeFile(srcPath, JSON.stringify(perTile, null, 1));
  }
  const perTile = JSON.parse(await readFile(srcPath, 'utf8'));
  const datasets = [...new Set(Object.values(perTile).flatMap((s) => (s ?? '').split(',').map((x) => x.trim().split('/')[0]).filter(Boolean)))].sort();
  manifest[`terrarium:z${z}`] = { url: terrariumUrl(z, '{x}', '{y}'), tiles: n * n, datasets, retrieved: manifest[`terrarium:z${z}`]?.retrieved ?? today };
  console.log(`terrarium z${z}: ${n * n} tiles (${fetched} downloaded now), source datasets: ${datasets.join(', ')}`);

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('manifest written', manifestPath);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
