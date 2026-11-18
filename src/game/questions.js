import { pickWeighted, shuffle } from './rng.js';

export const REGIONS = ['World', 'Europe', 'Asia', 'Africa', 'Americas', 'Oceania'];
export const DIFFICULTIES = {
  easy: { label: 'Easy', maxTier: 1, options: true, timer: false },
  normal: { label: 'Normal', maxTier: 2, options: true, timer: false },
  hard: { label: 'Hard', maxTier: 3, options: false, timer: true },
};

export function pool(countries, { region = 'World', difficulty = 'easy', need = [] } = {}) {
  const maxTier = DIFFICULTIES[difficulty]?.maxTier ?? 3;
  let list = countries.filter((c) => c.sovereign && (region === 'World' || c.region === region) && (c.tier ?? 3) <= maxTier);
  for (const field of need) list = list.filter((c) => c[field] != null && c[field] !== false);
  // Small regions on easy can be thin; widen to the next tier rather than repeat.
  if (list.length < 12 && maxTier < 3) return pool(countries, { region, difficulty: maxTier === 1 ? 'normal' : 'hard', need });
  return list;
}

const masteryWeight = [3, 2, 1.2, 0.6];

// Low mastery and recent misses come back more often.
export function nextCountry(list, progressState, used, rand = Math.random) {
  const fresh = list.filter((c) => !used.has(c.iso3));
  const candidates = fresh.length ? fresh : list;
  const now = Date.now();
  const weights = candidates.map((c) => {
    const m = progressState.mastery[c.iso3] ?? 0;
    const seen = progressState.seen[c.iso3];
    let w = masteryWeight[m];
    if (seen && seen.wrong > seen.right && now - seen.last < 1000 * 60 * 60 * 24 * 3) w *= 1.6;
    return w;
  });
  return pickWeighted(candidates, weights, rand);
}

// Three wrong options, preferring neighbours in the same subregion so the choice teaches.
export function distractors(answer, all, n = 3, rand = Math.random, key = 'name') {
  const others = all.filter((c) => c.sovereign && c.iso3 !== answer.iso3 && c[key] && c[key] !== answer[key]);
  const sameSub = shuffle(others.filter((c) => c.subregion === answer.subregion), rand);
  const sameRegion = shuffle(others.filter((c) => c.region === answer.region && c.subregion !== answer.subregion), rand);
  const rest = shuffle(others.filter((c) => c.region !== answer.region), rand);
  const out = [];
  for (const group of [sameSub.slice(0, 2), sameRegion, sameSub.slice(2), rest]) {
    for (const c of group) {
      if (out.length >= n) break;
      if (!out.some((o) => o[key] === c[key])) out.push(c);
    }
  }
  return out;
}

export const STATS = {
  population: { label: 'Population', unit: '', format: (v) => compact(v) },
  area: { label: 'Area', unit: 'km²', format: (v) => `${compact(v)} km²` },
  gdp: { label: 'GDP', unit: 'US$', format: (v) => `$${compact(v)}` },
  lifeExpectancy: { label: 'Life expectancy', unit: 'years', format: (v) => `${v.toFixed(1)} years` },
  density: { label: 'People per km²', unit: '/km²', format: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v).toLocaleString('en-GB')} per km²` },
};

export function statValue(c, stat) {
  if (stat === 'density') return c.population != null && c.area ? c.population / c.area : null;
  return c[stat] ?? null;
}

export function statYear(c, stat) {
  if (stat === 'density') return c.populationYear ?? null;
  return c[`${stat}Year`] ?? null;
}

export function compact(v) {
  if (v == null) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(abs >= 1e13 ? 1 : 2)} trillion`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(abs >= 1e10 ? 1 : 2)} billion`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(abs >= 1e7 ? 1 : 2)} million`;
  return Math.round(v).toLocaleString('en-GB');
}
