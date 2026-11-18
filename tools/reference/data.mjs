// Loads the build inputs for the reference pages and turns them into one record per country.
// Inputs come from the source tree (data/) or, failing that, from <outDir>/data/. Never the network.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, MIN_RANK_YEAR, REGIONS, slug, distanceKm, int, fixed } from '../encyclopedia/lib.mjs';

const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

async function firstJson(rel, outDir) {
  for (const base of [ROOT, outDir].filter(Boolean)) {
    const p = path.join(base, rel);
    if (await exists(p)) return JSON.parse(await readFile(p, 'utf8'));
  }
  return null;
}

// "2026-11-03" -> "3 November 2026"
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

// A value with its year; `stale` marks World Bank values too old to rank or compare (same rule as the country pages).
const figure = (value, year = null) => (value == null ? null : { value, year, stale: year != null && year < MIN_RANK_YEAR });

export async function loadData(outDir) {
  const cj = await firstJson('data/countries.json', outDir);
  if (!cj) throw new Error('data/countries.json not found in the source tree or the output folder');
  const encDoc = await firstJson('data/encyclopedia.json', outDir);
  if (!encDoc) throw new Error('data/encyclopedia.json not found; run: node tools/encyclopedia/fetch.mjs --offline');
  const topo = await firstJson('data/world.json', outDir);

  const enc = encDoc.countries;
  const all = new Map(cj.countries.map((c) => [c.iso3, c]));
  const sovRaw = cj.countries.filter((c) => c.sovereign).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  if (sovRaw.length !== 195) throw new Error(`expected 195 countries, got ${sovRaw.length}`);

  const recs = sovRaw.map((c) => {
    const e = enc[c.iso3];
    if (!e) throw new Error(`data/encyclopedia.json has no ${c.iso3}; rerun tools/encyclopedia/fetch.mjs`);
    const pc = e.stats?.gdpPerCapita ?? null;
    const pop = figure(c.population, c.populationYear);
    const s = slug(c.name);
    return {
      c, e,
      iso3: c.iso3,
      name: c.name,
      slug: s,
      url: `/countries/${s}/`,
      flag: c.flag ? `/${c.flag}` : null,
      region: c.region,
      m: {
        population: pop,
        area: figure(c.area),
        gdp: figure(c.gdp, c.gdpYear),
        gdpPerCapita: pc ? figure(pc.value, pc.year) : null,
        // Unrounded, so equal-looking densities still rank the way the country pages rank them.
        density: pop && c.area ? { value: c.population / c.area, year: c.populationYear, stale: pop.stale } : null,
        lifeExpectancy: figure(c.lifeExpectancy, c.lifeExpectancyYear),
        neighbours: figure(e.sovereignNeighbourCount),
      },
      // World ranks as the country pages print them (largest first, equal values share a rank).
      rank: {
        population: e.ranks.population?.world ?? null,
        area: e.ranks.area?.world ?? null,
        gdp: e.ranks.gdp?.world ?? null,
        gdpPerCapita: e.ranks.gdpPerCapita?.world ?? null,
        density: e.ranks.density?.world ?? null,
        lifeExpectancy: e.ranks.lifeExpectancy?.world ?? null,
        neighbours: e.ranks.neighbourCount?.world ?? null,
      },
    };
  });
  const byIso = new Map(recs.map((r) => [r.iso3, r]));

  // A stale or missing value must carry no rank, and a fresh one must have one: the two files have to agree.
  for (const r of recs) {
    for (const k of Object.keys(r.m)) {
      const f = r.m[k];
      const ranked = Boolean(f && !f.stale);
      if (ranked !== (r.rank[k] != null)) throw new Error(`${r.iso3}: ${k} value and rank disagree between countries.json and encyclopedia.json`);
    }
  }

  // Sovereign land neighbours, and neighbouring areas outside the 195 (Kosovo, Western Sahara, ...).
  for (const r of recs) {
    r.nbs = r.c.borders.map((i) => byIso.get(i)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    r.otherAreas = r.c.borders.filter((i) => !byIso.has(i)).map((i) => all.get(i)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    if (r.nbs.length !== r.m.neighbours.value) throw new Error(`${r.iso3}: neighbour count ${r.m.neighbours.value} does not match its borders (${r.nbs.length})`);
  }

  const src = (rx, fallback) => {
    const s = (cj.sources ?? []).find((x) => rx.test(x.name)) ?? {};
    return { ...fallback, ...(s.name ? { full: s.name } : {}), retrieved: s.retrieved ?? null };
  };
  const SRC = {
    wb: src(/World Bank/, { short: 'World Bank', name: 'World Bank World Development Indicators', url: 'https://data.worldbank.org/', licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/' }),
    wc: src(/world-countries/, { short: 'world-countries', name: 'world-countries (mledoze/countries)', url: 'https://github.com/mledoze/countries', licence: 'ODbL 1.0', licenceUrl: 'https://opendatacommons.org/licenses/odbl/1-0/' }),
    ne: src(/Natural Earth 1:50m Admin/, { short: 'Natural Earth', name: 'Natural Earth', url: 'https://www.naturalearthdata.com/', licence: 'public domain' }),
    flags: src(/flag-icons/, { short: 'flag-icons', name: 'flag-icons', url: 'https://github.com/lipis/flag-icons', licence: 'MIT' }),
  };
  if (SRC.wc.full) SRC.wc.name = SRC.wc.full;
  if (SRC.flags.full) SRC.flags.name = SRC.flags.full.replace(/\s*\(lipis\)/, '');
  const wikidataCapitals = new Set(
    ((cj.sources ?? []).find((s) => /fallback/.test(s.what))?.what.split(':')[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  );

  return {
    cj, encDoc, enc, topo, all, recs, byIso, SRC, wikidataCapitals,
    generated: encDoc.generated ?? cj.generated,
    retrieved: longDate(SRC.wb.retrieved ?? cj.generated),
    REGIONS,
  };
}

// ---------- Formatting shared by the lists and the comparisons ----------

export const theRegion = (r) => (r === 'Americas' ? 'the Americas' : r);
export const densityStr = (d) => (d >= 100 ? int(d) : fixed(d, 1));
export const areaNum = (a) => (a < 10 ? fixed(a, 2) : int(a));
export const yearsOf = (figs) => {
  const ys = figs.filter((f) => f && f.year != null).map((f) => f.year);
  if (!ys.length) return null;
  const lo = Math.min(...ys), hi = Math.max(...ys);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
};
export const sum = (list) => list.reduce((s, v) => s + v, 0);
export function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
}

// "2.4 times", "24 times", "1,530 times"
export const timesStr = (r) => (r >= 9.95 ? `${int(r)} times` : `${fixed(r, 1).replace(/\.0$/, '')} times`);
// "18%", "0.4%"
export const pctStr = (r) => {
  const p = (r - 1) * 100;
  return p >= 0.95 ? `${Math.round(p)}%` : `${fixed(p, 1)}%`;
};
// A ratio reads as "times" from double upward and as a percentage below that; under 0.05% it is a tie.
export const ratioKind = (r) => (r >= 1.995 ? 'times' : (r - 1) * 100 >= 0.05 ? 'pct' : 'equal');

export const capitalKm = (a, b) => Math.round(distanceKm(a.c.capitalLatLng, b.c.capitalLatLng));

// A meta description that fits a search snippet (50 to 160 characters): the first candidate that does, or the
// first one cut back to whole sentences, then whole words. A data refresh must never break the build over a
// long name; verify.mjs still reports a description that ends up outside the range.
export function fitDesc(where, ...cands) {
  const ok = cands.find((t) => t.length >= 50 && t.length <= 160);
  if (ok) return ok;
  let t = cands[0];
  while (t.length > 160 && /[.;:] /.test(t)) t = t.slice(0, Math.max(t.lastIndexOf('. '), t.lastIndexOf('; '), t.lastIndexOf(': '))).replace(/[;:]$/, '') + '.';
  t = t.replace(/\.\.$/, '.');
  if (t.length > 160) t = `${t.slice(0, 159).replace(/\s+\S*$/, '')}…`;
  console.error(`warning: ${where}: no description candidate fits 50-160 characters; using "${t}"`);
  return t;
}
