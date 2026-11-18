// Preset sheets: the flag modes, and Higher or lower by measure.
import { MODES, FLAG_PRESETS, CAPITAL_PRESETS, HL_PRESETS, recordKey } from '../game/modes.js';
import { progress } from '../game/progress.js';
import { LOOKALIKE_GROUPS } from '../game/lookalikes.js';
import { esc, fmt } from './dom.js';
import { hlPath, playPath } from '../routes.js';

// Small flag strips on each card show what the mode looks like, drawn from real flags.
const SAMPLES = {
  flagquiz: ['BRA', 'JPN', 'KEN', 'CAN'],
  lookalikes: ['TCD', 'ROU', 'IDN', 'MCO'],
  flagblitz: ['MEX', 'IND', 'SWE', 'ZAF', 'KOR', 'PER'],
  flags: ['NPL', 'ARG', 'NOR'],
  flagmatch: ['ITA', 'IRL', 'CIV'],
};
const CAP_SAMPLES = {
  capitalquiz: ['FRA', 'JPN', 'EGY', 'PER'],
  capitals: ['AUS', 'KEN', 'CAN'],
};
const HL_SAMPLES = {
  mixed: ['CHN', 'IND'],
  population: ['NGA', 'BRA'],
  area: ['CAN', 'AUS'],
  gdp: ['DEU', 'JPN'],
  lifeExpectancy: ['JPN', 'CHE'],
  density: ['SGP', 'MNG'],
  neighbours: ['FRA', 'ESP'],
};

export function showChooser(app, which) {
  const { data, globe, panel, sfx } = app;
  const s = progress.get();
  const region = s.settings.region;
  const difficulty = s.settings.difficulty;
  globe.setInteractive(false);
  globe.clearMarks();
  globe.showLabels(null);
  globe.clearHighlights();
  globe.idle(true);

  const flagStrip = (isos) => `<span class="strip">${isos.map((iso) => data.get(iso)).filter((c) => c?.flag).map((c) => `<img src="${esc(c.flag)}" alt="" width="36" height="27" loading="lazy">`).join('')}</span>`;

  let cards;
  if (which === 'flags') {
    // Light up the lookalike sets on the globe as a hint of what's inside.
    LOOKALIKE_GROUPS[0].forEach((iso) => globe.highlight(iso, 'neighbour'));
    cards = FLAG_PRESETS.map((id) => {
      const key = recordKey(id, region, difficulty);
      const best = s.records[key];
      const unit = id === 'flagblitz' ? ' flags' : '';
      return card({ href: playPath(id, id === 'lookalikes' ? null : region), name: MODES[id].name, blurb: MODES[id].blurb, best: best ? `Best ${fmt(best)}${unit}` : '', strip: flagStrip(SAMPLES[id]), tag: tagFor(id) });
    });
  } else if (which === 'capitals') {
    cards = CAPITAL_PRESETS.map((id) => {
      const best = s.records[recordKey(id, region, difficulty)];
      return card({ href: playPath(id, region), name: MODES[id].name, blurb: MODES[id].blurb, best: best ? `Best ${fmt(best)}` : '', strip: flagStrip(CAP_SAMPLES[id]), tag: id === 'capitals' ? '<span class="tag tag--globe">On the globe</span>' : '' });
    });
  } else {
    cards = Object.entries(HL_PRESETS).map(([id, p]) => {
      const best = s.records[recordKey('higherlower', region, difficulty, id)];
      return card({ href: hlPath(id), name: p.name, blurb: p.blurb, best: best ? `Best ${fmt(best)} in a row` : '', strip: flagStrip(HL_SAMPLES[id]), tag: '' });
    });
  }

  panel.render({
    left: which === 'flags' ? 'Flags' : which === 'capitals' ? 'Capitals' : 'Higher or lower',
    right: which === 'higherlower' ? 'One miss ends the run' : `${region} · ${difficulty[0].toUpperCase()}${difficulty.slice(1)}`,
    back: '/',
    body: `
      <ul class="index index--presets">${cards.join('')}</ul>
      <p class="small-print">${which === 'flags' ? 'Region and difficulty come from the sheet index. Lookalikes always uses the whole world.' : which === 'capitals' ? 'Region and difficulty come from the sheet index. New to them? The <a href="/learn/">field course</a> teaches every capital with its country.' : 'Figures are the latest the World Bank publishes, so years can differ between two countries; the year is shown under each value.'}</p>`,
  });
  panel.body().addEventListener('click', (e) => {
    if (e.target.closest('a')) sfx.play('tap');
  });
}

function tagFor(id) {
  if (id === 'flagblitz') return '<span class="tag">60 s</span>';
  if (id === 'lookalikes') return '<span class="tag">Tricky</span>';
  if (id === 'flags' || id === 'flagmatch') return '<span class="tag tag--globe">On the globe</span>';
  return '';
}

function card({ href, name, blurb, best, strip, tag }) {
  return `<li><a class="index__row" href="${href}">
    <span class="index__name">${esc(name)}${tag}</span>
    <span class="index__best">${best}</span>
    <span class="index__blurb">${esc(blurb)}</span>
    <span class="index__strip">${strip}</span>
  </a></li>`;
}
