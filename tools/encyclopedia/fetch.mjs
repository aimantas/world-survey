// Builds data/encyclopedia.json: extra, build-time-only facts for the static country pages.
//
//   node tools/encyclopedia/fetch.mjs              # download what is missing into tools/.cache/encyclopedia/, then derive
//   node tools/encyclopedia/fetch.mjs --offline    # never touch the network (fails if the cache is incomplete)
//   node tools/encyclopedia/fetch.mjs --force-wb   # refresh the six World Bank responses
//
// Inputs: data/countries.json and data/world.json (the data agent's outputs), world-countries 5.1.0 from
// tools/node_modules (ODbL), six World Bank WDI indicators (CC BY 4.0) and Natural Earth 1:50m marine polygons
// (public domain) for naming the water an antipode falls in. Downloads are read as data only, never executed.
// The same cache gives byte-identical output: `generated` is the latest retrieval date in the manifest.
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import * as topojson from 'topojson-client';
import { geoContains, geoBounds } from 'd3-geo';
import worldCountries from 'world-countries';
import { CACHE, ROOT, REGIONS, MIN_RANK_YEAR, slug, distanceKm, unitVec, rankBy, pointInRings, inBbox, R_KM } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const OFFLINE = args.has('--offline');

export const WB_INDICATORS = {
  gdpPerCapita: 'NY.GDP.PCAP.CD',
  urbanPct: 'SP.URB.TOTL.IN.ZS',
  forestPct: 'AG.LND.FRST.ZS',
  popGrowthPct: 'SP.POP.GROW',
  internetPct: 'IT.NET.USER.ZS',
  fertility: 'SP.DYN.TFRT.IN',
};
const ROUND = { gdpPerCapita: 0, urbanPct: 1, forestPct: 1, popGrowthPct: 2, internetPct: 1, fertility: 2 };
export const wbUrl = (id) => `https://api.worldbank.org/v2/country/all/indicator/${id}?format=json&mrnev=1&per_page=20000`;
export const MARINE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_geography_marine_polys.geojson';

// One documented correction to world-countries: it gives Zimbabwe's South African rand the symbol "Rs";
// the same dataset gives ZAR the symbol "R" for South Africa, Lesotho, Namibia and Eswatini.
const CURRENCY_SYMBOL_FIX = { ZWE: { ZAR: 'R' } };

const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const round = (v, d) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

async function download(url, dest) {
  if (OFFLINE) throw new Error(`--offline and ${path.relative(ROOT, dest)} is not cached`);
  await mkdir(path.dirname(dest), { recursive: true });
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'world-survey-encyclopedia-build/0.1 (offline data build)', Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      JSON.parse(buf.toString('utf8')); // must be JSON; nothing else is accepted into the cache
      await writeFile(dest, buf);
      return;
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function fetchAll() {
  await mkdir(CACHE, { recursive: true });
  const manifestPath = path.join(CACHE, 'manifest.json');
  const manifest = (await exists(manifestPath)) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {};
  const today = new Date().toISOString().slice(0, 10);
  const record = async (key, url, rel, extra = {}) => {
    const buf = await readFile(path.join(CACHE, rel));
    const prev = manifest[key];
    manifest[key] = prev && prev.sha256 === sha(buf)
      ? { ...prev, ...extra }
      : { url, file: rel, bytes: buf.length, sha256: sha(buf), retrieved: today, ...extra };
  };

  for (const id of Object.values(WB_INDICATORS)) {
    const rel = `worldbank/${id}.json`;
    if (!(await exists(path.join(CACHE, rel))) || args.has('--force-wb')) {
      console.log('fetch', wbUrl(id));
      await download(wbUrl(id), path.join(CACHE, rel));
    }
    const json = JSON.parse(await readFile(path.join(CACHE, rel), 'utf8'));
    await record(`wb:${id}`, wbUrl(id), rel, { lastupdated: json[0]?.lastupdated ?? null, indicator: json[1]?.[0]?.indicator?.value ?? null });
  }
  {
    const rel = 'ne/ne_50m_geography_marine_polys.geojson';
    if (!(await exists(path.join(CACHE, rel)))) { console.log('fetch', MARINE_URL); await download(MARINE_URL, path.join(CACHE, rel)); }
    await record('ne:marine50m', MARINE_URL, rel);
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function wbIndex(json) {
  const out = new Map();
  for (const r of json[1] ?? []) if (r.value != null && r.countryiso3code) out.set(r.countryiso3code, { value: r.value, year: Number(r.date) });
  return out;
}

function callingCode(idd) {
  if (!idd?.root) return null;
  const suf = idd.suffixes ?? [];
  if (suf.length === 0) return [idd.root];
  if (suf.length === 1) return [idd.root + suf[0]];
  // Shared zones (+1 North America, +7 Russia/Kazakhstan) list area prefixes as suffixes; the country code is the root.
  if (['+1', '+7'].includes(idd.root)) return [idd.root];
  return suf.map((s) => idd.root + s);
}

async function main() {
  const manifest = await fetchAll();
  const countriesJson = JSON.parse(await readFile(path.join(ROOT, 'data/countries.json'), 'utf8'));
  const topo = JSON.parse(await readFile(path.join(ROOT, 'data/world.json'), 'utf8'));
  const marine = JSON.parse(await readFile(path.join(CACHE, 'ne/ne_50m_geography_marine_polys.geojson'), 'utf8'));
  const wb = {};
  for (const [k, id] of Object.entries(WB_INDICATORS)) wb[k] = wbIndex(JSON.parse(await readFile(path.join(CACHE, `worldbank/${id}.json`), 'utf8')));

  const all = countriesJson.countries;
  const byIso = new Map(all.map((c) => [c.iso3, c]));
  const sov = all.filter((c) => c.sovereign);
  if (sov.length !== 195) throw new Error(`expected 195 sovereign records, got ${sov.length}`);
  const mledoze = new Map(worldCountries.map((m) => [m.cca3, m]));
  const mOf = (iso3) => mledoze.get(iso3 === 'XKX' ? 'UNK' : iso3);

  // Slugs: unique, and never equal to a region page or the index.
  const slugs = new Map();
  const reserved = new Set([...REGIONS.map(slug), 'index']);
  for (const c of sov) {
    const s = slug(c.name);
    if (slugs.has(s)) throw new Error(`slug collision ${s}: ${slugs.get(s)} / ${c.iso3}`);
    if (reserved.has(s)) throw new Error(`slug ${s} of ${c.iso3} collides with a region page`);
    slugs.set(s, c.iso3);
  }

  // ---------- Geometry ----------
  const features = new Map();
  for (const g of topo.objects.countries.geometries) features.set(g.id, topojson.feature(topo, g));
  const featureList = [...features.values()];
  const fBounds = new Map(featureList.map((f) => [f.id, geoBounds(f)]));

  // Polygon-level arc ownership, to tell which polygons carry a shared boundary.
  const arcOwners = new Map(); // arc -> [{iso3, poly}]
  for (const g of topo.objects.countries.geometries) {
    const polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
    polys.forEach((rings, pi) => {
      for (const ring of rings) for (const a of ring) {
        const k = a < 0 ? ~a : a;
        if (!arcOwners.has(k)) arcOwners.set(k, []);
        arcOwners.get(k).push({ iso3: g.id, poly: pi });
      }
    });
  }
  const polygonsOf = (iso3) => {
    const f = features.get(iso3);
    if (!f) return [];
    return f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  };
  function sharedPolys(a, b) {
    const pa = new Set(), pb = new Set();
    for (const owners of arcOwners.values()) {
      const oa = owners.filter((o) => o.iso3 === a), ob = owners.filter((o) => o.iso3 === b);
      if (oa.length && ob.length) { oa.forEach((o) => pa.add(o.poly)); ob.forEach((o) => pb.add(o.poly)); }
    }
    return { a: [...pa], b: [...pb] };
  }
  // A polygon is "outlying" when none of its outer-ring vertices lie in the country's main-landmass bbox.
  const outlying = (iso3, polyIdx) => {
    const c = byIso.get(iso3);
    const poly = polygonsOf(iso3)[polyIdx];
    if (!c?.bbox || !poly) return false;
    return !poly[0].some((p) => inBbox(p, c.bbox, 0.01));
  };

  function countryAt([lat, lng]) {
    const pt = [lng, lat];
    for (const f of featureList) {
      const [[w, s], [e, n]] = fBounds.get(f.id);
      if (lat < s - 0.01 || lat > n + 0.01) continue;
      if (e >= w && (lng < w - 0.01 || lng > e + 0.01)) continue;
      if (geoContains(f, pt)) return f.id;
    }
    return null;
  }

  // Named water from Natural Earth marine polygons: the smallest polygon that contains the point.
  const marinePolys = [];
  for (const f of marine.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const rings of polys) {
      let area = 0;
      const r0 = rings[0];
      for (let i = 0, j = r0.length - 1; i < r0.length; j = i++) area += (r0[j][0] - r0[i][0]) * (r0[j][1] + r0[i][1]);
      // Natural Earth spells a few oceans in capitals ("INDIAN OCEAN"); print them in title case.
      const raw = String(f.properties.name ?? '').trim();
      const name = raw === raw.toUpperCase() ? raw.toLowerCase().replace(/\b([a-z])/g, (x) => x.toUpperCase()).replace(/\b(Of|The|And)\b/g, (x) => x.toLowerCase()) : raw;
      marinePolys.push({ name, cls: f.properties.featurecla, rings, area: Math.abs(area / 2) });
    }
  }
  function waterAt([lat, lng]) {
    let best = null;
    for (const m of marinePolys) if (pointInRings([lng, lat], m.rings) && (!best || m.area < best.area)) best = m;
    return best ? { name: best.name, featurecla: best.cls } : null;
  }

  // Every vertex of every world.json feature, for nearest-land distances.
  const verts = [];
  for (const f of featureList) {
    for (const rings of polygonsOf(f.id)) for (const ring of rings) for (const [x, y] of ring) verts.push([f.id, unitVec(x, y)]);
  }
  function nearestLand([lat, lng]) {
    const v = unitVec(lng, lat);
    let best = Infinity, id = null;
    for (const [iso3, u] of verts) {
      const d = (v[0] - u[0]) ** 2 + (v[1] - u[1]) ** 2 + (v[2] - u[2]) ** 2;
      if (d < best) { best = d; id = iso3; }
    }
    const chord = Math.sqrt(best);
    return { iso3: id, km: 2 * R_KM * Math.asin(Math.min(1, chord / 2)) };
  }

  const hemis = (lats, lngs) => {
    const h = [];
    if (lats.some((y) => y > 0)) h.push('Northern');
    if (lats.some((y) => y < 0)) h.push('Southern');
    if (lngs.some((x) => x > 0 && x < 180)) h.push('Eastern');
    if (lngs.some((x) => x < 0 && x > -180)) h.push('Western');
    return h;
  };

  // ---------- Ranks ----------
  // Ranks and comparisons use World Bank values from MIN_RANK_YEAR on; older values are still stored and shown.
  const fresh = (value, year) => (value != null && year != null && year >= MIN_RANK_YEAR ? value : null);
  const wbFresh = (k) => (c) => { const r = wb[k].get(c.iso3); return r ? fresh(r.value, r.year) : null; };
  const pop = (c) => fresh(c.population, c.populationYear);
  const density = (c) => (pop(c) != null && c.area ? pop(c) / c.area : null);
  // Neighbour counts and ranks are among the 195 only; other areas are listed separately.
  const sovNeighbours = (c) => c.borders.filter((b) => byIso.get(b)?.sovereign);
  const metric = {
    population: pop,
    area: (c) => c.area,
    gdp: (c) => fresh(c.gdp, c.gdpYear),
    gdpPerCapita: wbFresh('gdpPerCapita'),
    density,
    lifeExpectancy: (c) => fresh(c.lifeExpectancy, c.lifeExpectancyYear),
    urbanPct: wbFresh('urbanPct'),
    forestPct: wbFresh('forestPct'),
    popGrowthPct: wbFresh('popGrowthPct'),
    internetPct: wbFresh('internetPct'),
    fertility: wbFresh('fertility'),
    neighbourCount: (c) => sovNeighbours(c).length,
  };
  const worldRanks = {}, regionRanks = {};
  for (const [k, get] of Object.entries(metric)) {
    worldRanks[k] = rankBy(sov, get);
    regionRanks[k] = {};
    for (const r of REGIONS) regionRanks[k][r] = rankBy(sov.filter((c) => c.region === r), get);
  }

  const closest = (c, get) => {
    const v = get(c);
    if (v == null || v <= 0) return [];
    return sov
      .filter((o) => o.iso3 !== c.iso3 && get(o) != null && get(o) > 0)
      .map((o) => [o.iso3, Math.abs(Math.log(get(o) / v))])
      .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, 3)
      .map(([iso3]) => iso3);
  };

  // ---------- Per country ----------
  const out = {};
  const gaps = [];
  for (const c of [...sov].sort((a, b) => a.iso3.localeCompare(b.iso3))) {
    const m = mOf(c.iso3);
    if (!m) throw new Error(`no world-countries record for ${c.iso3}`);
    const languages = m.languages ?? {};
    const nativeNames = Object.entries(m.name?.native ?? {})
      .map(([code, n]) => ({ language: languages[code] ?? code, official: n.official, common: n.common }))
      .filter((n) => n.official && n.official !== m.name.official);
    const altSpellings = (m.altSpellings ?? []).filter((s) => s.length > 3 && s !== c.name && s !== m.name.official);
    const currencies = Object.entries(m.currencies ?? {}).map(([code, v]) => ({
      code,
      name: v.name,
      symbol: CURRENCY_SYMBOL_FIX[c.iso3]?.[code] ?? v.symbol ?? null,
    }));
    if (!currencies.length) gaps.push(`${c.iso3}: no currency in world-countries`);

    const stats = {};
    for (const k of Object.keys(WB_INDICATORS)) {
      const r = wb[k].get(c.iso3);
      stats[k] = r ? { value: round(r.value, ROUND[k]), year: r.year, ranked: r.year >= MIN_RANK_YEAR } : null;
      if (r && r.year < MIN_RANK_YEAR) gaps.push(`${c.iso3}: World Bank ${WB_INDICATORS[k]} is from ${r.year}, not ranked`);
      if (!r) gaps.push(`${c.iso3}: no World Bank ${WB_INDICATORS[k]}`);
    }
    const dens = density(c);
    for (const [k, y] of [['population', c.populationYear], ['gdp', c.gdpYear], ['lifeExpectancy', c.lifeExpectancyYear]]) {
      if (y != null && y < MIN_RANK_YEAR) gaps.push(`${c.iso3}: countries.json ${k} is from ${y}, not ranked`);
    }

    const ranks = {};
    for (const k of Object.keys(metric)) {
      const w = worldRanks[k], rr = regionRanks[k][c.region];
      ranks[k] = w.ranks.has(c.iso3) ? { world: w.ranks.get(c.iso3), worldOf: w.of, region: rr.ranks.get(c.iso3), regionOf: rr.of } : null;
    }

    const neighbours = c.borders.map((b) => {
      const n = byIso.get(b);
      const km = c.capitalLatLng && n?.capitalLatLng ? Math.round(distanceKm(c.capitalLatLng, n.capitalLatLng)) : null;
      const sp = sharedPolys(c.iso3, b);
      const inGeometry = sp.a.length > 0;
      return {
        iso3: b,
        name: n?.name ?? b,
        sovereign: !!n?.sovereign,
        official: n?.sovereign ? null : (mOf(b)?.name?.official ?? null),
        capital: n?.capital ?? null,
        capitalKm: km,
        inGeometry, // false: the land border is in world-countries but too small for the 1:50m geometry
        viaOutlyingSelf: inGeometry && sp.a.every((p) => outlying(c.iso3, p)),
        viaOutlyingOther: inGeometry && sp.b.length > 0 && sp.b.every((p) => outlying(b, p)),
      };
    }).sort((a, b) => (a.capitalKm ?? 1e9) - (b.capitalKm ?? 1e9) || a.name.localeCompare(b.name));

    const nearestCapitals = sov
      .filter((o) => o.iso3 !== c.iso3 && o.capitalLatLng)
      .map((o) => ({ iso3: o.iso3, km: Math.round(distanceKm(c.capitalLatLng, o.capitalLatLng)) }))
      .sort((a, b) => a.km - b.km || a.iso3.localeCompare(b.iso3))
      .slice(0, 3);

    // Hemispheres: main landmass (countries.json bbox) and everything world.json draws for the state.
    let mainH, allH;
    if (c.bbox) {
      const [w, s, e, n] = c.bbox;
      const lngs = e >= w ? [w, e, (w + e) / 2] : [w, e, 179.9, -179.9];
      mainH = hemis([s, n], lngs);
    } else {
      mainH = hemis([c.capitalLatLng[0]], [c.capitalLatLng[1]]);
    }
    const coords = polygonsOf(c.iso3).flatMap((rings) => rings[0]);
    allH = coords.length ? hemis(coords.map((p) => p[1]), coords.map((p) => p[0])) : mainH;

    const extremes = c.bbox
      ? {
          north: c.bbox[3], south: c.bbox[1], west: c.bbox[0], east: c.bbox[2],
          crossesAntimeridian: c.bbox[0] > c.bbox[2],
          spanNorthSouthKm: Math.round(((c.bbox[3] - c.bbox[1]) * Math.PI * R_KM) / 180),
        }
      : null;
    if (!extremes) gaps.push(`${c.iso3}: no polygon in world.json, so no extremes`);

    let antipode = null;
    if (c.capitalLatLng) {
      const [lat, lng] = c.capitalLatLng;
      const a = [-lat, lng > 0 ? lng - 180 : lng + 180];
      const land = countryAt(a);
      if (land) {
        const n = byIso.get(land);
        antipode = { latLng: [round(a[0], 3), round(a[1], 3)], kind: 'land', iso3: land, name: n?.name ?? land, sovereign: !!n?.sovereign };
      } else {
        const water = waterAt(a);
        const near = nearestLand(a);
        const nn = byIso.get(near.iso3);
        antipode = {
          latLng: [round(a[0], 3), round(a[1], 3)],
          kind: water ? 'water' : 'open-ocean',
          name: water ? water.name : null,
          featurecla: water ? water.featurecla : null,
          nearestLand: { iso3: near.iso3, name: nn?.name ?? near.iso3, sovereign: !!nn?.sovereign, km: Math.round(near.km / 10) * 10 },
        };
      }
    }

    out[c.iso3] = {
      iso3: c.iso3,
      slug: slug(c.name),
      official: m.name.official,
      altSpellings,
      nativeNames,
      demonym: m.demonyms?.eng ? { m: m.demonyms.eng.m, f: m.demonyms.eng.f } : null,
      callingCodes: callingCode(m.idd),
      tld: m.tld ?? [],
      currencies,
      stats,
      density: dens == null ? null : { value: round(dens, 1), populationYear: c.populationYear },
      sovereignNeighbourCount: sovNeighbours(c).length,
      staleCore: [['population', c.populationYear], ['gdp', c.gdpYear], ['lifeExpectancy', c.lifeExpectancyYear]].filter(([, y]) => y != null && y < MIN_RANK_YEAR).map(([k, y]) => ({ key: k, year: y })),
      ranks,
      closestInArea: closest(c, metric.area),
      closestInPopulation: closest(c, metric.population),
      neighbours,
      nearestCapitals,
      hemispheres: { main: mainH, all: allH },
      extremes,
      antipode,
    };
  }

  const retrieved = Object.values(manifest).map((m) => m.retrieved).filter(Boolean).sort();
  const wbMeta = (id) => manifest[`wb:${id}`];
  const generated = [countriesJson.generated, ...retrieved].sort().pop();
  const doc = {
    generated,
    note: 'Build-time data for the static country pages. Never shipped as a file. Missing values are null.',
    sources: [
      {
        what: 'Official name, alternative spellings, native names, demonym, calling code, top-level domain, currencies',
        name: 'world-countries 5.1.0 (mledoze/countries)', url: 'https://github.com/mledoze/countries', licence: 'ODbL 1.0',
        retrieved: countriesJson.sources.find((s) => /mledoze/.test(s.name))?.retrieved ?? null,
      },
      ...Object.entries(WB_INDICATORS).map(([k, id]) => ({
        what: `${k}: ${wbMeta(id).indicator} (${id}); most recent non-empty value, year kept`,
        name: 'World Bank World Development Indicators, API v2', url: wbUrl(id), licence: 'CC BY 4.0',
        retrieved: wbMeta(id).retrieved, apiLastUpdated: wbMeta(id).lastupdated,
      })),
      {
        what: 'Names of the sea or ocean at a capital\'s antipode (smallest containing polygon)',
        name: 'Natural Earth 1:50m Marine Areas (geography_marine_polys), natural-earth-vector v5.1.2', url: MARINE_URL, licence: 'Public domain',
        retrieved: manifest['ne:marine50m'].retrieved,
      },
      {
        what: 'Derived: ranks, density, distances, hemispheres, extremes, antipodes, closest countries (computed from data/countries.json and data/world.json)',
        name: 'Computed by tools/encyclopedia/fetch.mjs', url: null, licence: 'Inherits the inputs above', retrieved: generated,
      },
    ],
    method: {
      ranks: `Competition ranking (1, 2, 2, 4), largest first, among the 195 states with a value (region ranks among that region); years can differ between states. World Bank values older than ${MIN_RANK_YEAR} are stored (stats.*.ranked false, staleCore) but not ranked or compared. Ranked: population, area, gdp, gdpPerCapita, density, lifeExpectancy, the five other World Bank indicators and neighbourCount (sovereign neighbours among the 195 only).`,
      density: 'countries.json population divided by world-countries total area (km²).',
      closest: 'Smallest absolute log ratio among the other 195 states (relative closeness).',
      distances: 'Great-circle between capital points, mean Earth radius 6,371 km, rounded to 1 km.',
      hemispheres: 'main: from the main-landmass bbox; all: from every polygon world.json draws for the state.',
      extremes: 'Main-landmass bbox from countries.json; north-south span is the meridian arc between the extreme latitudes.',
      antipode: 'Point-in-polygon of the capital antipode against world.json (spherical); otherwise the smallest Natural Earth marine polygon containing it; otherwise "open-ocean". nearestLand is the nearest world.json vertex, rounded to 10 km.',
      neighbours: 'inGeometry false: world-countries lists the land border but the 1:50m polygons share no boundary. viaOutlying*: every shared boundary lies on polygons outside that state\'s main-landmass bbox.',
      callingCodes: 'idd root + suffix when there is one suffix; root only for the shared +1 and +7 zones; otherwise root + each suffix as given.',
      corrections: 'ZWE ZAR currency symbol "Rs" -> "R" (the symbol the same dataset gives ZAR for ZAF, LSO, NAM, SWZ).',
    },
    gaps,
    countries: out,
  };
  await writeFile(path.join(ROOT, 'data/encyclopedia.json'), JSON.stringify(doc, null, 1) + '\n');

  const kinds = {};
  for (const c of Object.values(out)) kinds[c.antipode?.kind ?? 'none'] = (kinds[c.antipode?.kind ?? 'none'] || 0) + 1;
  console.log(`data/encyclopedia.json: ${Object.keys(out).length} countries, generated ${generated}; antipodes ${JSON.stringify(kinds)}; ${gaps.length} gaps`);
}

main().catch((e) => { console.error(e); process.exit(1); });
