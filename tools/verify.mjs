// Checks the built data and assets against PLAN.md §4 / §4.1. Exit code 1 on any hard failure.
// Usage: node verify.mjs
import { readFile, stat, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL ${msg}`); };
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

const world = JSON.parse(await readFile(path.join(root, 'data/world.json'), 'utf8'));
const data = JSON.parse(await readFile(path.join(root, 'data/countries.json'), 'utf8'));
const countries = data.countries;
const byIso = new Map(countries.map((c) => [c.iso3, c]));

const FIELDS = ['iso3', 'iso2', 'ccn3', 'name', 'official', 'sovereign', 'region', 'subregion', 'capital', 'capitalLatLng', 'labelLatLng', 'bbox', 'area', 'population', 'populationYear', 'gdp', 'gdpYear', 'lifeExpectancy', 'lifeExpectancyYear', 'borders', 'languages', 'currencies', 'landlocked', 'island', 'tier', 'tiny', 'inMap', 'flag'];
const REGIONS = new Set(['Europe', 'Asia', 'Africa', 'Americas', 'Oceania', 'Antarctic']);

console.log(`countries.json generated ${data.generated}, ${countries.length} records, ${data.sources.length} sources`);

// --- sovereign
const sov = countries.filter((c) => c.sovereign);
console.log(`\nSovereign (playable): ${sov.length} ${sov.length === 195 ? '(ok)' : ''}`);
if (sov.length !== 195) fail(`sovereign count ${sov.length} != 195`);
for (const iso of ['VAT', 'PSE']) if (!byIso.get(iso)?.sovereign) fail(`${iso} must be sovereign`);
for (const iso of ['TWN', 'XKX', 'ESH', 'GRL']) if (byIso.get(iso)?.sovereign) fail(`${iso} must not be sovereign`);
const byRegion = {};
for (const c of sov) byRegion[c.region] = (byRegion[c.region] ?? 0) + 1;
console.log(`  by region: ${Object.entries(byRegion).map(([k, v]) => `${k} ${v}`).join(', ')}`);
const byTier = {};
for (const c of sov) byTier[c.tier] = (byTier[c.tier] ?? 0) + 1;
console.log(`  by tier: ${Object.entries(byTier).map(([k, v]) => `tier ${k}: ${v}`).join(', ')}`);

// --- schema
let schemaErrors = 0;
for (const c of countries) {
  const keys = Object.keys(c);
  if (keys.join() !== FIELDS.join()) { schemaErrors++; if (schemaErrors < 5) fail(`${c.iso3} keys differ from §4.1`); }
  if (c.region !== null && !REGIONS.has(c.region)) fail(`${c.iso3} region ${c.region}`);
  if (!/^[A-Z]{3}$/.test(c.iso3)) fail(`${c.iso3} iso3 format`);
  for (const k of ['capitalLatLng', 'labelLatLng']) {
    const v = c[k];
    if (v !== null && !(Array.isArray(v) && v.length === 2 && Math.abs(v[0]) <= 90 && Math.abs(v[1]) <= 180)) fail(`${c.iso3} ${k} invalid`);
  }
  if (c.bbox !== null && !(c.bbox.length === 4 && c.bbox[1] <= c.bbox[3])) fail(`${c.iso3} bbox invalid`);
  for (const k of ['area', 'population', 'gdp', 'lifeExpectancy']) if (c[k] === 0) fail(`${c.iso3} ${k} is 0 (must be null when missing)`);
  for (const [v, y] of [['population', 'populationYear'], ['gdp', 'gdpYear'], ['lifeExpectancy', 'lifeExpectancyYear']]) if ((c[v] === null) !== (c[y] === null)) fail(`${c.iso3} ${v}/${y} mismatch`);
  if (c.sovereign && ![1, 2, 3].includes(c.tier)) fail(`${c.iso3} sovereign without tier`);
  if (!c.sovereign && c.tier !== null) fail(`${c.iso3} non-sovereign with tier`);
  if (c.flag && !(await exists(path.join(root, c.flag)))) fail(`${c.iso3} flag file missing ${c.flag}`);
  for (const b of c.borders ?? []) if (!byIso.has(b)) fail(`${c.iso3} border ${b} not in countries.json`);
}
console.log(`\nSchema: ${schemaErrors ? `${schemaErrors} records with wrong keys` : 'all records have exactly the §4.1 fields in order'}`);

// --- world.json vs countries.json
const geoms = world.objects.countries.geometries;
const noEntry = geoms.filter((g) => !byIso.has(g.properties?.iso3));
const noIso = geoms.filter((g) => !g.properties?.iso3);
console.log(`\nworld.json: ${geoms.length} features; without properties.iso3: ${noIso.length}; without countries.json entry: ${noEntry.length}${noEntry.length ? ' -> ' + noEntry.map((g) => g.properties?.iso3 ?? g.properties?.name).join(', ') : ''}`);
if (noIso.length || noEntry.length) fail('world.json features unmatched');
const notInMap = countries.filter((c) => !c.inMap);
console.log(`  countries.json records not in world.json (inMap false): ${notInMap.map((c) => c.iso3).join(', ') || 'none'}`);
for (const c of countries) if (c.inMap !== geoms.some((g) => g.id === c.iso3)) fail(`${c.iso3} inMap flag wrong`);

// --- flags
const noFlag = countries.filter((c) => !c.flag);
console.log(`\nWithout a flag: ${noFlag.length} -> ${noFlag.map((c) => `${c.iso3} (${c.name}${c.sovereign ? ', SOVEREIGN' : ''})`).join(', ') || 'none'}`);
if (noFlag.some((c) => c.sovereign)) fail('a sovereign country has no flag');

// --- nulls
console.log('\nNull counts per field (all records / sovereign only):');
for (const k of FIELDS) {
  const a = countries.filter((c) => c[k] === null).length, s = sov.filter((c) => c[k] === null).length;
  if (a) console.log(`  ${k.padEnd(19)} ${String(a).padStart(3)} / ${String(s).padStart(3)}${s && s <= 6 ? '  sovereign: ' + sov.filter((c) => c[k] === null).map((c) => c.iso3).join(', ') : ''}`);
}

// --- tiny / island
const tiny = sov.filter((c) => c.tiny);
console.log(`\nTiny sovereign (${tiny.length}): ${tiny.map((c) => c.iso3).join(', ')}`);
console.log(`Tiny non-sovereign (${countries.filter((c) => c.tiny && !c.sovereign).length}): ${countries.filter((c) => c.tiny && !c.sovereign).map((c) => c.iso3).join(', ')}`);
const isl = sov.filter((c) => c.island);
console.log(`Island sovereign (${isl.length}): ${isl.map((c) => c.iso3).join(', ')}`);
const anti = countries.filter((c) => c.bbox && c.bbox[0] > c.bbox[2]);
console.log(`Antimeridian-crossing bbox: ${anti.map((c) => c.iso3).join(', ') || 'none'}`);

// --- years
const years = (k) => { const m = {}; for (const c of sov) if (c[k] !== null) m[c[k]] = (m[c[k]] ?? 0) + 1; return Object.entries(m).map(([y, n]) => `${y}: ${n}`).join(', '); };
console.log(`\nData years (sovereign): population {${years('populationYear')}}; gdp {${years('gdpYear')}}; lifeExpectancy {${years('lifeExpectancyYear')}}`);
const oldGdp = sov.filter((c) => c.gdpYear !== null && c.gdpYear < 2022);
if (oldGdp.length) console.log(`  GDP older than 2022: ${oldGdp.map((c) => `${c.iso3} ${c.gdpYear}`).join(', ')}`);

// --- files
console.log('\nFiles:');
const FILES = [
  ['data/world.json', 800 * 1024],
  ['data/countries.json', null],
  ['assets/relief-2k.webp', 350 * 1024, [2048, 1024]],
  ['assets/relief-4k.webp', 1.3 * 1024 * 1024, [4096, 2048]],
  ['assets/relief-8k.webp', 4 * 1024 * 1024, [8192, 4096]],
  ['assets/relief-land-4k.webp', 1.3 * 1024 * 1024, [4096, 2048]],
  ['assets/elevation-2k.png', null, [2048, 1024], 1],
  ['assets/coast-sdf-2k.png', null, [2048, 1024], 1],
];
let initial = 0;
for (const [f, budget, dims, channels] of FILES) {
  const p = path.join(root, f);
  if (!(await exists(p))) { fail(`${f} missing`); continue; }
  const { size } = await stat(p);
  let extra = '';
  if (dims) {
    const m = await sharp(p, { limitInputPixels: false }).metadata();
    extra = ` ${m.width}x${m.height} ${m.channels}ch`;
    if (m.width !== dims[0] || m.height !== dims[1]) fail(`${f} is ${m.width}x${m.height}`);
    if (channels && m.channels !== channels) fail(`${f} has ${m.channels} channels`);
  }
  const over = budget && size > budget;
  if (over) fail(`${f} ${kb(size)} over budget ${kb(budget)}`);
  console.log(`  ${f.padEnd(28)} ${kb(size).padStart(8)}${budget ? ` (budget ${kb(budget)})` : ''}${extra}`);
  if (!f.includes('4k') && !f.includes('8k')) initial += size;
}
let flagBytes = 0, flagCount = 0, flagMax = ['', 0];
for (const c of countries) if (c.flag) { const { size } = await stat(path.join(root, c.flag)); flagBytes += size; flagCount++; if (size > flagMax[1]) flagMax = [c.flag, size]; }
console.log(`  assets/flags/*.svg            ${kb(flagBytes).padStart(8)} (${flagCount} files, largest ${path.basename(flagMax[0])} ${kb(flagMax[1])})`);
console.log(`  initial set (world + countries + relief-2k + elevation + coast-sdf): ${kb(initial)}`);

// --- raster consistency: coast-sdf == 0 exactly where elevation's land mask is
{
  const e = await sharp(path.join(root, 'assets/elevation-2k.png')).extractChannel(0).raw().toBuffer();
  const s = await sharp(path.join(root, 'assets/coast-sdf-2k.png')).extractChannel(0).raw().toBuffer();
  let oceanWithElev = 0, land = 0;
  for (let i = 0; i < e.length; i++) { if (s[i] > 0 && e[i] > 0) oceanWithElev++; if (s[i] === 0) land++; }
  console.log(`\nRaster masks: land pixels (sdf == 0) ${(100 * land / e.length).toFixed(1)}%; ocean pixels with elevation > 0: ${oceanWithElev}`);
  if (oceanWithElev) fail('elevation non-zero over ocean');
}

console.log(failures.length ? `\n${failures.length} FAILURE(S)` : '\nAll checks passed.');
process.exit(failures.length ? 1 : 0);
