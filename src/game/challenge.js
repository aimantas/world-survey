// Challenge links: a finished game packed into a short code, so a friend plays the same countries
// with the same answer options and sees the score to beat. Nothing is stored anywhere but the link.
import { hashString, mulberry32 } from './rng.js';

const DIFF = { e: 'easy', n: 'normal', h: 'hard' };
const order = (data) => data.sovereign.map((c) => c.iso3).sort();

export const newSeed = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');

// Every round draws its options from its own stream, so round 7 is the same whoever plays it.
export const roundRand = (seed, index) => mulberry32(hashString(`${seed}:${index}`));

export function encodeChallenge({ difficulty, seed, iso3s, score }, data) {
  const list = order(data);
  const codes = iso3s.map((iso) => list.indexOf(iso).toString(36).padStart(2, '0')).join('');
  return [difficulty[0], seed, codes, Math.max(0, Math.round(score))].join('.');
}

export function decodeChallenge(code, data) {
  const [d, seed, codes, score] = String(code || '').split('.');
  if (!DIFF[d] || !/^[a-z0-9]{4,10}$/.test(seed || '') || !/^([a-z0-9]{2}){3,20}$/.test(codes || '') || !/^\d{1,7}$/.test(score || '')) return null;
  const list = order(data);
  const iso3s = codes.match(/../g).map((c) => list[parseInt(c, 36)]);
  if (iso3s.some((iso) => !iso)) return null;
  return { difficulty: DIFF[d], seed, iso3s, beat: Number(score) };
}
