// Medals (your survey, records, achievements) and About (sources and credits).
import { ACHIEVEMENTS } from '../game/achievements.js';
import { MODES } from '../game/modes.js';
import { progress } from '../game/progress.js';
import { getUnits } from '../game/geo.js';
import { lessonsDone } from './learn.js';
import { esc, fmt, medalSvg } from './dom.js';

const REGIONS = ['Europe', 'Asia', 'Africa', 'Americas', 'Oceania'];

export function showMedals(app) {
  const { data, globe, panel, sfx, course } = app;
  const s = progress.get();
  const streak = progress.streak();
  globe.setInteractive(false);
  globe.clearHighlights();
  globe.clearMarks();
  globe.showLabels(null);
  globe.setRegionFocus(null);
  app.applySurvey(true);
  globe.idle(true);

  const total = data.sovereign.length;
  const done = progress.surveyedCount(data.sovereign.map((c) => c.iso3));
  const bars = REGIONS.map((r) => {
    const list = data.sovereign.filter((c) => c.region === r);
    const n = list.filter((c) => (s.mastery[c.iso3] ?? 0) > 0).length;
    return `<div><dt>${r}</dt><span class="track" style="--fill:${(n / list.length) * 100}%"></span><dd>${n} / ${list.length}</dd></div>`;
  }).join('');

  const records = Object.entries(s.records)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => {
      const [mode, region, diff] = k.split(':');
      const label = [MODES[mode]?.name || mode, region, diff && diff[0].toUpperCase() + diff.slice(1)].filter(Boolean).join(' · ');
      return `<li><span>${esc(label)}</span> <span class="r-pts">${fmt(v)}</span></li>`;
    })
    .join('');

  const unlocked = ACHIEVEMENTS.filter((a) => s.achievements[a.id]).length;
  const acc = s.stats.answers ? Math.round((s.stats.correct / s.stats.answers) * 100) : null;

  panel.render({
    left: 'Medals',
    right: `${unlocked} / ${ACHIEVEMENTS.length} earned`,
    back: '/',
    body: `
      <h2 class="place" style="--place-size:30px">${done} of ${total} surveyed</h2>
      <p class="hint">Countries you’ve answered right print in colour on your globe. Misses lower a country’s mastery, so it comes back more often.</p>
      <dl class="region-bars">${bars}</dl>
      <dl class="facts">
        <div><dt>Games</dt><dd><span class="num">${fmt(s.stats.games)}</span></dd></div>
        <div><dt>Accuracy</dt><dd><span class="num">${acc == null ? '—' : `${acc}%`}</span></dd></div>
        <div><dt>Best streak</dt><dd><span class="num">${fmt(s.bestStreak)}</span></dd></div>
        <div><dt>Field course</dt><dd><span class="num">${lessonsDone(course)} / ${course.total}</span> lessons</dd></div>
        <div><dt>Days in a row</dt><dd><span class="num">${fmt(streak.current)}</span></dd></div>
        <div><dt>Fastest right answer</dt><dd><span class="num">${s.stats.fastest ? `${(s.stats.fastest / 1000).toFixed(2)} s` : '—'}</span></dd></div>
      </dl>
      ${records ? `<div><span class="field-label">Best scores</span><ul class="sources">${records}</ul></div>` : ''}
      <ul class="medals">${ACHIEVEMENTS.map((a) => {
        const got = s.achievements[a.id];
        return `<li class="medal ${got ? '' : 'is-locked'}">${medalSvg(!got)}<div><b>${esc(a.name)}</b><span>${esc(a.text)}</span></div></li>`;
      }).join('')}</ul>
      <p class="small-print">Distances are shown in ${getUnits() === 'mi' ? 'miles' : 'kilometres'}. <button class="linkish" type="button" data-action="units">Switch to ${getUnits() === 'mi' ? 'kilometres' : 'miles'}</button></p>
      <p class="small-print">Progress is saved in this browser only. <button class="linkish" type="button" data-action="reset">Erase my progress</button></p>`,
  });

  panel.body().querySelector('[data-action="units"]').addEventListener('click', () => {
    app.switchUnits();
    showMedals(app);
  });

  const reset = panel.body().querySelector('[data-action="reset"]');
  reset.addEventListener('click', () => {
    if (reset.dataset.armed) {
      progress.reset();
      sfx.play('miss');
      showMedals(app);
      return;
    }
    reset.dataset.armed = '1';
    reset.textContent = 'Tap again to erase everything';
    sfx.play('tap');
  });
}

export function showAbout(app) {
  const { data, globe, panel } = app;
  globe.setInteractive(false);
  globe.clearHighlights();
  globe.clearMarks();
  globe.showLabels('auto');
  globe.setRegionFocus(null);
  globe.setSurveyed(null);
  globe.idle(true);

  const sources = (data.sources || [])
    .map((s) => `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.name)}</a> <span>· ${esc(s.licence.split(',')[0])} · retrieved ${esc(s.retrieved)}</span></li>`)
    .join('');

  panel.render({
    left: 'About',
    right: 'World Survey',
    back: '/',
    body: `
      <div class="prose">
        <p>Every question is answered on the globe: find the country, pin the capital, match the flag, guess which country has more people. After each answer the globe flies to the right place and shows how far off you were, with the country’s neighbours and a few facts.</p>
        <p>Countries you get right print in colour on your own globe. Misses come back more often until they stick, and the <a href="/review/">review</a> asks them again after a day, three days and two weeks.</p>
        <p>New to the map? The <a href="/learn/">field course</a> teaches all 195 countries in short lessons of neighbours, with their flags and capitals.</p>
        <p>Every country also has a reference page with its map, figures and neighbours: <a href="/countries/">browse all 195</a>, or see them ranked in the <a href="/lists/">lists</a>. The <a href="/sitemap/">site map</a> links to every page.</p>
        <h2>The 195</h2>
        <p>The game asks about the 193 UN member states plus Vatican City and Palestine. Other places on the map, like Greenland or Taiwan, can be tapped and named but are never asked.</p>
        <h2>Your data</h2>
        <p>No account, no ads and no cookies. Scores and progress stay in this browser’s local storage.</p>
        <p>The site counts page visits and finished games with cookie-free Plausible analytics, to see which modes get played. It records no personal data, and it is skipped when your browser sends Do Not Track or Global Privacy Control.</p>
        <h2>Sources</h2>
      </div>
      <ul class="sources">${sources}</ul>
      <p class="small-print">Country facts are derived from world-countries under the <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noopener" target="_blank">Open Database License</a>; World Bank figures are used under <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener" target="_blank">CC BY 4.0</a>.</p>
      <p class="small-print">Population, GDP and life expectancy are the most recent values the World Bank publishes, so years differ between countries. Borders follow Natural Earth, which shows de facto boundaries; they are not a position on any dispute.</p>
      <p class="small-print">Drawn with three.js (MIT). Type: Archivo, Source Serif 4 and JetBrains Mono, under the SIL Open Font License.</p>
      <p class="small-print">Made by <a href="https://aimantas.com/" rel="noopener">Aimantas</a>.</p>`,
  });
}
