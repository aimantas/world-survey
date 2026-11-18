import { hashString, mulberry32, shuffle } from './rng.js';

const EPOCH = Date.UTC(2026, 10, 3); // expedition No. 1

export function todayUTC(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function expeditionNumber(date = todayUTC()) {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Math.floor((t - EPOCH) / 86400000) + 1;
}

// Five rounds from one seed: three warm-ups from well-known countries, then two harder ones.
const PLAN = ['find', 'flags', 'capitals', 'name', 'find'];

export function dailyRounds(countries, date = todayUTC()) {
  const rand = mulberry32(hashString(`geo-daily:${date}`));
  const playable = countries.filter((c) => c.sovereign && c.inMap !== false);
  const easy = shuffle(playable.filter((c) => (c.tier ?? 3) <= 2), rand);
  const hard = shuffle(playable.filter((c) => (c.tier ?? 3) >= 2), rand);
  const used = new Set();
  return PLAN.map((mode, i) => {
    const source = i < 3 ? easy : hard;
    let c = source.find((x) => !used.has(x.iso3) && (mode !== 'flags' || x.flag) && (mode !== 'capitals' || x.capitalLatLng));
    used.add(c.iso3);
    return { mode, iso3: c.iso3, seed: Math.floor(rand() * 1e9) };
  });
}

const SQUARE = { perfect: '🟩', close: '🟨', far: '🟧', miss: '⬛' };

export function shareText({ date, score, grades }) {
  const n = expeditionNumber(date);
  return `World Survey · Expedition ${n}\n${score.toLocaleString('en-GB')} / 5,000\n${grades.map((g) => SQUARE[g]).join('')}\nhttps://geography.aimantas.com/daily/`;
}
