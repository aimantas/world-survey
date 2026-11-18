// Points. Everything is out of 1,000 per round plus a time bonus, so modes compare.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const ROUND_MAX = 1000;
export const TIME_BONUS_MAX = 200;

// Full bonus inside 2 s, nothing after 12 s.
export function timeBonus(ms) {
  if (ms == null) return 0;
  return Math.round(TIME_BONUS_MAX * clamp(1 - (ms - 2000) / 10000, 0, 1));
}

// Tapped the wrong country: partial credit by distance to the right one.
export function nearMissPoints(km) {
  return Math.round(600 * clamp(1 - Math.log10(1 + km / 40) / Math.log10(1 + 4000 / 40), 0, 1));
}

// Capital pin: 1,000 within 25 km, 500 at 250 km, 0 at 2,500 km.
export function pinPoints(km) {
  if (km <= 25) return ROUND_MAX;
  return Math.round(ROUND_MAX * clamp(1 - Math.log10(km / 25) / 2, 0, 1));
}

export function streakMultiplier(streak) {
  return Math.min(5, 1 + Math.floor(streak / 3) * 0.5);
}

// Grade drives colour, sound and the daily share grid.
export function grade(points) {
  if (points >= 900) return 'perfect';
  if (points >= 500) return 'close';
  if (points > 0) return 'far';
  return 'miss';
}
