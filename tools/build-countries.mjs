// data/countries.json per PLAN.md §4.1. Every value comes from a cached source or is derived from
// the Natural Earth geometry by a rule written here; anything unknown stays null.
import { readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as topojson from 'topojson-client';
import { ISO3_ALIASES, SPECIAL_FEATURES, nm } from './build-world.mjs';
import { polygonAreaKm2, polylabelSphere, bboxOf, pointInPolygon, ringVecs, withinKm, boxesNear, vec } from './lib/geo.mjs';
import { assignTiers } from './tiers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cache = (p) => path.join(here, '.cache', p);
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));

export const CLUSTER_KM = 300;       // single-linkage gap for "main landmass" clusters
export const TINY_KM2 = 2500;        // main polygon area below this => tiny (pin target)
export const ISLAND_MAX_KM2 = 2.5e6; // larger than Greenland, smaller than Australia (continent)

// Natural Earth populated places use some non-ISO adm0_a3 codes.
const NE_PLACE_CODE = { XKX: 'KOS', PSE: 'PSX', ESH: 'SAH', SSD: 'SDS' };
// mledoze capital name -> Natural Earth place name, where the spelling differs.
const CAPITAL_NAME_ALIASES = {
  AND: 'Andorra', GRD: "Saint George's", KIR: 'Tarawa', MNG: 'Ulaanbaatar', SMR: 'San Marino',
  PLW: 'Melekeok',   // NE marks Melekeok (the state containing Ngerulmud) as Palau's admin-0 capital
  ESH: 'Laayoune',   // El Aaiún; NE files it under Morocco as "Admin-0 capital alt"
};
// Capitals for features that mledoze does not cover, taken from NE admin-0 capitals.
const SPECIAL_CAPITALS = { SOL: 'Hargeisa' };
// Territories that world.json draws as part of another feature (for remapping mledoze borders).
const MERGED_INTO = { GUF: 'FRA', GLP: 'FRA', MTQ: 'FRA', MYT: 'FRA', REU: 'FRA', SJM: 'NOR', BES: 'NLD', GIB: 'GBR', CCK: 'IOA', CXR: 'IOA' };
// Verified corrections to mledoze borders (NE geometry agrees): Sri Lanka has no land boundary with India.
const BORDER_REMOVALS = [['LKA', 'IND']];

const norm = (s) => (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/^st\.?\s+/, 'saint ').replace(/[^a-z]/g, '');
const round = (x, d) => (x == null ? null : Math.round(x * 10 ** d) / 10 ** d);

async function exists(p) { try { await access(p); return true; } catch { return false; } }

function placeNames(q) {
  return [q.name, q.nameascii, q.namepar, q.ls_name, q.meganame, ...(q.namealt ? String(q.namealt).split('|') : [])].filter(Boolean);
}

function matchCapital({ iso3, iso2, capitalName }, places, wikidata, log) {
  if (!capitalName) return null;
  const wanted = norm(CAPITAL_NAME_ALIASES[iso3] ?? capitalName);
  const codes = new Set([iso3, NE_PLACE_CODE[iso3]].filter(Boolean));
  let cand = places.filter((q) => codes.has(q.adm0_a3) || (iso2 && q.iso_a2 === iso2));
  let hits = cand.filter((q) => placeNames(q).some((n) => norm(n) === wanted));
  if (!hits.length && CAPITAL_NAME_ALIASES[iso3]) hits = places.filter((q) => placeNames(q).some((n) => norm(n) === wanted));
  if (hits.length > 1) {
    const a0 = hits.filter((q) => String(q.featurecla).startsWith('Admin-0'));
    hits = (a0.length ? a0 : hits).sort((a, b) => (b.pop_max ?? 0) - (a.pop_max ?? 0));
  }
  if (hits.length) {
    if (CAPITAL_NAME_ALIASES[iso3]) log.capitalAliases.push(`${iso3}: "${capitalName}" matched NE "${hits[0].name}"`);
    return { latLng: [round(hits[0].latitude, 4), round(hits[0].longitude, 4)], source: 'ne' };
  }
  // Fallback: Wikidata capital (P36) coordinates (CC0), matched by name.
  const rows = wikidata.filter((r) => r.iso3 === iso3);
  const w = rows.find((r) => norm(r.label) === norm(capitalName))
    ?? rows.find((r) => norm(r.label).startsWith(norm(capitalName)) || norm(capitalName).startsWith(norm(r.label)));
  if (w) {
    log.capitalFallbacks.push(`${iso3}: "${capitalName}" from Wikidata "${w.label}" (${w.qid})`);
    return { latLng: [round(w.lat, 4), round(w.lon, 4)], source: 'wikidata' };
  }
  log.capitalMissing.push(`${iso3}: "${capitalName}"`);
  return null;
}

// Main landmass analysis for one feature: clusters polygons by single linkage at CLUSTER_KM,
// anchors on the cluster holding the capital (else the largest polygon), and returns the largest
// polygon of that cluster plus the cluster bbox.
export function analyseGeometry(geometry, capitalLatLng) {
  const coords = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const polys = coords.map((rings) => {
    const outer = rings.flat(); // all ring vertices: world-atlas may put a pole ring first (Antarctica)
    let w = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
    for (const [x, y] of outer) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
    return { rings, outer, area: polygonAreaKm2(rings), box: { w, e, s, n }, vecs: ringVecs(outer) };
  });
  const parent = polys.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) {
    if (find(i) === find(j)) continue;
    if (!boxesNear(polys[i].box, polys[j].box, CLUSTER_KM)) continue;
    if (withinKm(polys[i].vecs, polys[j].vecs, CLUSTER_KM)) parent[find(i)] = find(j);
  }
  let anchor = polys.reduce((b, p, i) => (p.area > polys[b].area ? i : b), 0);
  let anchoredBy = 'largest';
  if (capitalLatLng) {
    const pt = [capitalLatLng[1], capitalLatLng[0]];
    const inside = polys.findIndex((p) => pointInPolygon(pt, p.rings));
    if (inside >= 0) { anchor = inside; anchoredBy = 'capital-inside'; }
    else {
      const v = vec(pt[0], pt[1]);
      let best = Infinity;
      polys.forEach((p, i) => {
        for (let k = 0; k < p.vecs.length; k += 3) {
          const d = (p.vecs[k] - v[0]) ** 2 + (p.vecs[k + 1] - v[1]) ** 2 + (p.vecs[k + 2] - v[2]) ** 2;
          if (d < best) { best = d; anchor = i; }
        }
      });
      anchoredBy = 'capital-nearest';
    }
  }
  const root = find(anchor);
  const cluster = polys.filter((_, i) => find(i) === root);
  const main = cluster.reduce((b, p) => (p.area > b.area ? p : b), cluster[0]);
  const bbox = bboxOf(cluster.flatMap((p) => p.outer)).map((x) => round(x, 3));
  return {
    labelLatLng: polylabelSphere(main.rings).map((x) => round(x, 3)),
    bbox,
    mainAreaKm2: main.area,
    polygons: polys.length,
    clusterPolygons: cluster.length,
    anchoredBy,
  };
}

function wbIndex(json) {
  const out = new Map();
  for (const r of json[1] ?? []) if (r.value != null && r.countryiso3code) out.set(r.countryiso3code, { value: r.value, year: Number(r.date) });
  return out;
}

export async function buildCountries(topo, features, { today }) {
  const mledoze = JSON.parse(await readFile(nm('world-countries/countries.json'), 'utf8'));
  const byCca3 = new Map(mledoze.map((c) => [ISO3_ALIASES[c.cca3] ?? c.cca3, c]));
  const places = (await readJson(cache('ne/ne_10m_populated_places_simple.geojson'))).features.map((f) => f.properties);
  const wikidata = (await readJson(cache('wikidata/capitals.json'))).results.bindings.map((b) => {
    const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(b.coord.value);
    return { iso3: b.iso3.value, label: b.capLabel.value, qid: b.cap.value.split('/').pop(), lon: Number(m[1]), lat: Number(m[2]) };
  });
  const wb = {
    population: wbIndex(await readJson(cache('worldbank/SP.POP.TOTL.json'))),
    gdp: wbIndex(await readJson(cache('worldbank/NY.GDP.MKTP.CD.json'))),
    lifeExpectancy: wbIndex(await readJson(cache('worldbank/SP.DYN.LE00.IN.json'))),
  };
  const log = { capitalAliases: [], capitalFallbacks: [], capitalMissing: [], notInMap: [] };

  // 193 UN members (mledoze marks Vatican City as a member; it is an observer state) + VAT + PSE.
  const un = mledoze.filter((c) => c.unMember && c.cca3 !== 'VAT').map((c) => c.cca3);
  if (un.length !== 193) throw new Error(`Expected 193 UN members, got ${un.length}`);
  const sovereign = new Set([...un, 'VAT', 'PSE']);

  const geoms = topo.objects.countries.geometries;
  const neighbours = topojson.neighbors(geoms);
  const topoNeighbours = new Map(geoms.map((g, i) => [g.id, neighbours[i].map((j) => geoms[j].id)]));
  const geomByIso = new Map(geoms.map((g) => [g.id, g]));

  const entries = features.map((f) => ({ iso3: f.iso3, m: f.mledoze, special: f.special, name: f.name }));
  for (const iso3 of sovereign) {
    if (!geomByIso.has(iso3)) { entries.push({ iso3, m: byCca3.get(iso3), special: null, name: byCca3.get(iso3).name.common }); log.notInMap.push(iso3); }
  }
  const inSet = new Set(entries.map((e) => e.iso3));

  const records = [];
  for (const e of entries) {
    const { iso3, m, special } = e;
    const parent = special?.parent ? byCca3.get(special.parent) : null;
    const iso2 = m?.cca2 ?? null;
    const capitalName = m ? (m.capital?.[0] ?? null) : (SPECIAL_CAPITALS[iso3] ?? null);
    const cap = matchCapital({ iso3, iso2, capitalName }, places, wikidata, log);
    const g = geomByIso.get(iso3);
    const geo = g ? analyseGeometry(topojson.feature(topo, g).geometry, cap?.latLng) : null;

    let borders = null;
    if (m) {
      borders = [...new Set(m.borders.map((b) => ISO3_ALIASES[b] ?? MERGED_INTO[b] ?? b))].filter((b) => b !== iso3);
    } else if (g) {
      borders = topoNeighbours.get(iso3); // derived from shared NE boundaries for features mledoze lacks
    }
    const flagFile = iso2 ? `${iso2.toLowerCase()}.svg` : null;
    const flag = flagFile && (await exists(nm(`flag-icons/flags/4x3/${flagFile}`))) ? `assets/flags/${flagFile}` : null;
    const stat = (k) => wb[k].get(iso3) ?? null;
    const pop = stat('population'), gdp = stat('gdp'), le = stat('lifeExpectancy');

    records.push({
      iso3, iso2, ccn3: m?.ccn3 || null,
      name: e.name, official: m?.name?.official ?? null,
      sovereign: sovereign.has(iso3),
      region: (m ?? parent)?.region ?? null,
      subregion: ((m ?? parent)?.subregion || null),
      capital: capitalName, capitalLatLng: cap?.latLng ?? null,
      labelLatLng: geo?.labelLatLng ?? cap?.latLng ?? null,
      bbox: geo?.bbox ?? null,
      area: m?.area ?? null,
      population: pop?.value ?? null, populationYear: pop?.year ?? null,
      gdp: gdp ? Math.round(gdp.value) : null, gdpYear: gdp?.year ?? null,
      lifeExpectancy: le ? round(le.value, 1) : null, lifeExpectancyYear: le?.year ?? null,
      borders,
      languages: m ? Object.values(m.languages ?? {}) : null,
      currencies: m ? Object.values(m.currencies ?? {}).map((c) => c.name) : null,
      landlocked: m ? !!m.landlocked : null,
      island: null, tier: null,
      tiny: !g || geo.mainAreaKm2 < TINY_KM2,
      inMap: !!g,
      flag,
      _geo: geo, // stripped before writing
    });
  }

  // Border clean-up: corrections, then make the relation symmetric among records we ship.
  const byIso = new Map(records.map((r) => [r.iso3, r]));
  for (const [a, b] of BORDER_REMOVALS) {
    for (const [x, y] of [[a, b], [b, a]]) { const r = byIso.get(x); if (r?.borders) r.borders = r.borders.filter((c) => c !== y); }
  }
  for (const r of records) {
    if (!r.borders || !byIso.get(r.iso3).iso2) continue; // only mledoze-backed records propagate
    for (const b of r.borders) {
      const o = byIso.get(b);
      if (o && o.borders && o.iso2 && !o.borders.includes(r.iso3)) o.borders.push(r.iso3);
    }
  }
  for (const r of records) {
    if (r.borders) r.borders.sort();
    if (r.borders) r.dangling = r.borders.filter((b) => !inSet.has(b));
    // island: no land border, not a continent-sized landmass, not Antarctica.
    if (r.borders === null) r.island = null;
    else r.island = r.borders.length === 0 && r.region !== 'Antarctic' && (!r.inMap || r._geo.mainAreaKm2 < ISLAND_MAX_KM2);
  }

  const tierInfo = assignTiers(records);

  const order = ['iso3', 'iso2', 'ccn3', 'name', 'official', 'sovereign', 'region', 'subregion', 'capital', 'capitalLatLng', 'labelLatLng', 'bbox', 'area', 'population', 'populationYear', 'gdp', 'gdpYear', 'lifeExpectancy', 'lifeExpectancyYear', 'borders', 'languages', 'currencies', 'landlocked', 'island', 'tier', 'tiny', 'inMap', 'flag'];
  const diagnostics = records.map((r) => ({ iso3: r.iso3, name: r.name, sovereign: r.sovereign, geo: r._geo, dangling: r.dangling ?? [] }));
  const countries = records
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
    .map((r) => Object.fromEntries(order.map((k) => [k, r[k]])));

  const fallbackIsos = log.capitalFallbacks.map((s) => s.split(':')[0]);
  const sources = [
    { what: 'Country borders (geometry, world.json); labelLatLng, bbox, tiny, island derived from it', name: 'Natural Earth 1:50m Admin 0 Countries via world-atlas 2.0.2', url: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json', licence: 'Public domain (Natural Earth); world-atlas packaging ISC', retrieved: today },
    { what: 'Names, codes, region, subregion, area, borders, languages, currencies, landlocked, UN membership', name: 'world-countries 5.1.0 (mledoze/countries)', url: 'https://github.com/mledoze/countries', licence: 'ODbL 1.0', retrieved: today },
    { what: 'capitalLatLng', name: 'Natural Earth 1:10m Populated Places (simple), v5.1.2', url: 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson', licence: 'Public domain', retrieved: today },
    { what: `capitalLatLng fallback where Natural Earth has no point: ${fallbackIsos.join(', ') || 'none'}`, name: 'Wikidata (capital P36, coordinate P625)', url: 'https://query.wikidata.org/', licence: 'CC0 1.0', retrieved: today },
    { what: 'population (SP.POP.TOTL), gdp (NY.GDP.MKTP.CD, current US$), lifeExpectancy (SP.DYN.LE00.IN); most recent non-empty value, year stored', name: 'World Bank World Development Indicators, API v2', url: 'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=20000', licence: 'CC BY 4.0', retrieved: today },
    { what: 'Flags (assets/flags/*.svg, 4x3)', name: 'flag-icons 7.6.0 (lipis)', url: 'https://github.com/lipis/flag-icons', licence: 'MIT', retrieved: today },
    { what: 'Relief imagery (assets/relief-*.webp)', name: 'Natural Earth 1:50m Cross Blended Hypsometric Tints with Shaded Relief and Water (HYP_50M_SR_W, v2.0.0)', url: 'https://naturalearth.s3.amazonaws.com/50m_raster/HYP_50M_SR_W.zip', licence: 'Public domain', retrieved: today },
    { what: 'Elevation (assets/elevation-2k.png); zoom-4 tiles are built from GMTED2010 and ETOPO1 only', name: 'Terrain Tiles on AWS (Terrarium): GMTED2010 courtesy of the U.S. Geological Survey; ETOPO1, U.S. National Oceanic and Atmospheric Administration', url: 'https://registry.opendata.aws/terrain-tiles/', licence: 'Public domain source data, attribution required per https://github.com/tilezen/joerd/blob/master/docs/attribution.md', retrieved: today },
  ];
  return { json: { generated: today, sources, countries }, log, diagnostics, tierInfo };
}
