// Everything the player has done lives in one versioned localStorage record.
// Storage can be missing (private windows, blocked site data), so every access is guarded
// and the game keeps working in memory.

const KEY = 'geo-survey:v1';

const blank = () => ({
  v: 1,
  created: new Date().toISOString(),
  mastery: {},        // iso3 -> 0..3
  seen: {},           // iso3 -> { right, wrong, last }
  records: {},        // recordKey -> best score
  bestStreak: 0,
  daily: {},          // 'YYYY-MM-DD' -> { score, grid, n }
  achievements: {},   // id -> ISO date unlocked
  visited: {},        // iso3 -> true (atlas)
  days: {},           // local 'YYYY-MM-DD' -> games finished that day
  course: {},         // lesson slug -> { done: ISO date, right, total, runs }
  stats: { games: 0, answers: 0, correct: 0, fastest: null },
  settings: { sound: true, volume: 0.7, difficulty: 'easy', region: 'World', labels: true, units: null },
});

// Days are counted on the player's own calendar, not UTC, so a streak follows their evenings.
export function localDay(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Consecutive days played, ending today or yesterday (today still counts as open until midnight).
export function streakOf(days, now = new Date()) {
  const at = (back) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
    return localDay(d);
  };
  const playedToday = !!days[at(0)];
  let current = 0;
  for (let i = playedToday ? 0 : 1; days[at(i)]; i++) current++;
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { date: localDay(d), played: !!days[localDay(d)], today: i === 6, letter: 'SMTWTFS'[d.getDay()] };
  });
  return { current, playedToday, week };
}

// Review schedule: a country comes back sooner the less you know it.
// Mastery 0 after a miss is due at once; then one day, three days, two weeks.
const DAY = 86400000;
const REVIEW_AFTER = [0, DAY, 3 * DAY, 14 * DAY];
export function dueOf(st, isoList, now = Date.now()) {
  const out = [];
  for (const iso of isoList) {
    const seen = st.seen[iso];
    if (!seen) continue;
    const m = st.mastery[iso] ?? 0;
    const wait = REVIEW_AFTER[m];
    const overdue = now - seen.last - wait;
    // A fresh miss waits ten minutes, so it is not asked again in the same breath.
    if (overdue >= (m === 0 ? 10 * 60000 : 0)) out.push({ iso3: iso, mastery: m, overdue });
  }
  return out.sort((a, b) => a.mastery - b.mastery || b.overdue - a.overdue);
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const parsed = JSON.parse(raw);
    if (parsed?.v !== 1) return blank();
    const base = blank();
    return { ...base, ...parsed, stats: { ...base.stats, ...parsed.stats }, settings: { ...base.settings, ...parsed.settings } };
  } catch {
    return blank();
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: keep playing in memory */
  }
  for (const fn of listeners) fn(state);
}

export const progress = {
  get: () => state,
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  setting(key, value) {
    if (value === undefined) return state.settings[key];
    state.settings[key] = value;
    save();
  },

  // Record one answer. `quality` is 1 for correct, 0 for wrong, fractional for near misses.
  answer(iso3, correct, ms) {
    const seen = state.seen[iso3] || { right: 0, wrong: 0, last: 0 };
    if (correct) seen.right++;
    else seen.wrong++;
    seen.last = Date.now();
    state.seen[iso3] = seen;
    const m = state.mastery[iso3] ?? 0;
    const before = m;
    state.mastery[iso3] = correct ? Math.min(3, Math.max(1, m + 1)) : Math.max(0, m - 1);
    state.stats.answers++;
    if (correct) {
      state.stats.correct++;
      if (ms != null && (state.stats.fastest == null || ms < state.stats.fastest)) state.stats.fastest = ms;
    }
    save();
    return { newlySurveyed: correct && before === 0, before, after: state.mastery[iso3] };
  },

  // `recordKey` null: a lesson or review, which counts as a game played but keeps no high score.
  finishGame(recordKey, score, streak) {
    state.stats.games++;
    const day = localDay();
    state.days[day] = (state.days[day] || 0) + 1;
    const prev = recordKey ? state.records[recordKey] ?? 0 : 0;
    const isRecord = !!recordKey && score > prev;
    if (isRecord) state.records[recordKey] = score;
    if (streak > state.bestStreak) state.bestStreak = streak;
    save();
    return { isRecord, prev };
  },

  saveDaily(date, entry) {
    state.daily[date] = entry;
    save();
  },

  lesson(slug, { right, total }) {
    const prev = state.course[slug];
    const better = !prev || right / total >= (prev.right || 0) / (prev.total || 1);
    state.course[slug] = {
      done: prev?.done || new Date().toISOString(),
      right: better ? right : prev.right,
      total: better ? total : prev.total,
      runs: (prev?.runs || 0) + 1,
    };
    save();
    return { first: !prev };
  },

  streak: () => streakOf(state.days),
  due: (isoList) => dueOf(state, isoList),

  visit(iso3) {
    if (state.visited[iso3]) return;
    state.visited[iso3] = true;
    save();
  },

  unlock(id) {
    if (state.achievements[id]) return false;
    state.achievements[id] = new Date().toISOString();
    save();
    return true;
  },

  surveyedCount(isoList) {
    let n = 0;
    for (const iso of isoList) if ((state.mastery[iso] ?? 0) > 0) n++;
    return n;
  },

  reset() {
    state = blank();
    save();
  },
};
