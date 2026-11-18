// Survey medals. Each check reads one event plus the saved state and returns true to unlock.
import { streakOf } from './progress.js';

const lessons = (s) => Object.keys(s.course || {}).length;
const MICRO = new Set(['VAT', 'MCO', 'SMR', 'LIE', 'AND', 'MLT', 'NRU', 'TUV']);

export const ACHIEVEMENTS = [
  { id: 'first', name: 'First benchmark', text: 'Get your first answer right.', check: (e) => e.type === 'answer' && e.correct },
  { id: 'streak5', name: 'Five in a row', text: 'Five correct answers in a row.', check: (e) => e.type === 'answer' && e.streak >= 5 },
  { id: 'streak10', name: 'Ten in a row', text: 'Ten correct answers in a row.', check: (e) => e.type === 'answer' && e.streak >= 10 },
  { id: 'streak25', name: 'Long traverse', text: 'Twenty-five correct answers in a row.', check: (e) => e.type === 'answer' && e.streak >= 25 },
  { id: 'quick', name: 'Quick draw', text: 'A correct answer in under two seconds.', check: (e) => e.type === 'answer' && e.correct && e.ms < 2000 },
  { id: 'perfect', name: 'Clean sheet', text: 'Finish a ten-round game without a miss.', check: (e) => e.type === 'finish' && e.rounds >= 10 && e.misses === 0 },
  { id: 'pin25', name: 'Dead reckoning', text: 'Pin a capital within 25 km.', check: (e) => e.type === 'answer' && e.mode === 'capitals' && e.km <= 25 },
  { id: 'micro', name: 'Microstate finder', text: 'Find Vatican City, Monaco, San Marino, Liechtenstein, Andorra, Malta, Nauru or Tuvalu.', check: (e) => e.type === 'answer' && e.correct && MICRO.has(e.iso3) },
  { id: 'island10', name: 'Island hopper', text: 'Survey ten island nations.', check: (e, s, data) => e.type === 'answer' && data.countries.filter((c) => c.island && s.mastery[c.iso3] > 0).length >= 10 },
  { id: 'hl15', name: 'Statistician', text: 'Fifteen in a row in Higher or lower.', check: (e) => e.type === 'answer' && e.mode === 'higherlower' && e.streak >= 15 },
  { id: 'survey50', name: 'Fifty surveyed', text: 'Survey 50 countries.', check: (e, s) => surveyed(s) >= 50 },
  { id: 'survey100', name: 'Hundred surveyed', text: 'Survey 100 countries.', check: (e, s) => surveyed(s) >= 100 },
  { id: 'survey195', name: 'The whole world', text: 'Survey all 195 countries.', check: (e, s, data) => data.sovereign.every((c) => s.mastery[c.iso3] > 0) },
  { id: 'region', name: 'Region complete', text: 'Survey every country in one region.', check: (e, s, data) => ['Europe', 'Asia', 'Africa', 'Americas', 'Oceania'].some((r) => data.sovereign.filter((c) => c.region === r).every((c) => s.mastery[c.iso3] > 0)) },
  { id: 'daily7', name: 'Seven expeditions', text: 'Play the daily expedition on seven days.', check: (e, s) => Object.keys(s.daily).length >= 7 },
  { id: 'days3', name: 'Three days running', text: 'Play on three days in a row.', check: (e, s) => e.type === 'finish' && streakOf(s.days || {}).current >= 3 },
  { id: 'days7', name: 'A week in the field', text: 'Play on seven days in a row.', check: (e, s) => e.type === 'finish' && streakOf(s.days || {}).current >= 7 },
  { id: 'lesson1', name: 'First lesson', text: 'Finish a lesson of the field course.', check: (e, s) => e.type === 'finish' && lessons(s) >= 1 },
  { id: 'lesson10', name: 'Ten lessons', text: 'Finish ten lessons of the field course.', check: (e, s) => e.type === 'finish' && lessons(s) >= 10 },
  { id: 'course', name: 'Course complete', text: 'Finish every lesson of the field course.', check: (e, s) => e.type === 'finish' && e.courseTotal > 0 && lessons(s) >= e.courseTotal },
];

const surveyed = (s) => Object.values(s.mastery).filter((m) => m > 0).length;

export function evaluate(event, state, data, unlock) {
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements[a.id]) continue;
    try {
      if (a.check(event, state, data) && unlock(a.id)) unlocked.push(a);
    } catch {
      /* a bad check never breaks a round */
    }
  }
  return unlocked;
}
