// Home: today's expedition and the sheet index of modes.
import { MODES, INDEX, FLAG_PRESETS, CAPITAL_PRESETS, HL_PRESETS, recordKey } from '../game/modes.js';
import { REGIONS, DIFFICULTIES } from '../game/questions.js';
import { todayUTC, expeditionNumber } from '../game/daily.js';
import { progress } from '../game/progress.js';
import { esc, fmt, icon } from './dom.js';
import { go } from './nav.js';
import { nextLesson, lessonsDone, dueNow } from './learn.js';
import { playPath } from '../routes.js';

const dateLabel = (d) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function showHome(app, { turn = true } = {}) {
  const { panel, globe, data, course } = app;
  const s = progress.get();
  const date = todayUTC();
  const done = s.daily[date];
  const region = s.settings.region;
  const difficulty = s.settings.difficulty;

  globe.setInteractive(false);
  globe.clearHighlights();
  globe.clearMarks();
  globe.showLabels(null);
  globe.setRegionFocus(region === 'World' ? null : region);
  app.applySurvey();
  globe.idle(true);

  const best = (row) => {
    let v;
    if (row.chooser === 'flags') v = Math.max(0, ...FLAG_PRESETS.filter((id) => id !== 'flagblitz').map((id) => s.records[recordKey(id, region, difficulty)] || 0));
    else if (row.chooser === 'capitals') v = Math.max(0, ...CAPITAL_PRESETS.map((id) => s.records[recordKey(id, region, difficulty)] || 0));
    else if (row.chooser === 'higherlower') v = Math.max(0, ...Object.keys(HL_PRESETS).map((id) => s.records[recordKey('higherlower', region, difficulty, id)] || 0));
    else v = s.records[recordKey(row.id, region, difficulty)];
    return v ? `Best ${fmt(v)}` : '';
  };

  const expedition = done
    ? `<p class="expedition__done">Done today: ${fmt(done.score)} / 5,000</p>
       <button class="btn" type="button" data-action="share-daily">${icon.share}Share result</button>`
    : `<p>Five rounds, the same for everyone today.</p>
       <button class="btn btn--primary" type="button" data-action="daily">Start${icon.next}</button>`;

  // The week: one box per day, filled for days played. It only shows once there is something to show.
  const streak = progress.streak();
  const week = s.stats.games
    ? `<p class="week" aria-label="${streak.current ? `${streak.current}-day streak` : 'No streak yet'}">
        <span class="week__days" aria-hidden="true">${streak.week.map((d) => `<i class="${d.played ? 'on' : ''}${d.today ? ' today' : ''}">${d.letter}</i>`).join('')}</span>
        <span class="week__label">${streak.current
          ? `${streak.current}-day streak${streak.playedToday ? '' : ' · play today to keep it'}`
          : 'Play today to start a streak'}</span>
      </p>`
    : '';

  // Next up: the lesson you are on and anything due for review. One tap from the home sheet.
  const lesson = nextLesson(course);
  const taught = lessonsDone(course);
  const due = dueNow(data).length;
  const names = (l) => l.iso3.map((iso) => data.get(iso).name).join(', ');
  const nextUp = `
    <nav class="next-box" aria-label="Learn">
      <a class="index__row" href="${lesson ? lesson.path : '/learn/'}">
        <span class="index__name">Field course${lesson ? `<span class="tag">${taught ? 'Next' : 'Start here'}</span>` : ''}</span>
        <span class="index__best">${taught} / ${course.total}${icon.chevron}</span>
        <span class="index__blurb">${lesson ? `Lesson ${lesson.number} · ${esc(lesson.name)}: ${esc(names(lesson))}` : 'Every lesson done. Open the course to repeat one.'}</span>
      </a>
      ${due ? `<a class="next-box__side" href="/review/" aria-label="Review ${due} ${due === 1 ? 'country' : 'countries'} that are due">
        <span class="field-label">Review</span>
        <b>${due} due</b>
      </a>` : ''}
    </nav>`;

  panel.render({
    turn,
    left: 'Sheet index',
    right: `Expedition ${expeditionNumber(date)} · ${dateLabel(date)}`,
    body: `
      <section class="expedition">
        <h1>Survey the world</h1>
        ${expedition}
        ${week}
      </section>
      ${nextUp}
      <div class="settings-grid">
        <div class="settings-row">
          <span class="field-label" id="lbl-region">Region</span>
          <div class="seg seg--6 seg--region" role="group" aria-labelledby="lbl-region">
            ${REGIONS.map((r) => `<button type="button" data-region="${r}" aria-pressed="${r === region}">${r}</button>`).join('')}
          </div>
        </div>
        <div class="settings-row">
          <span class="field-label" id="lbl-diff">Difficulty</span>
          <div class="seg seg--3" role="group" aria-labelledby="lbl-diff">
            ${Object.entries(DIFFICULTIES).map(([k, d]) => `<button type="button" data-difficulty="${k}" aria-pressed="${k === difficulty}">${d.label}</button>`).join('')}
          </div>
        </div>
      </div>
      <ul class="index" aria-label="Game modes">
        ${INDEX.map((row) => {
          const name = row.name || MODES[row.id].name;
          const blurb = row.blurb || MODES[row.id].blurb;
          const b = best(row);
          return `
          <li><button type="button" ${row.chooser ? `data-chooser="${row.chooser}"` : `data-mode="${row.id}"`} ${row.chooser ? 'class="has-more"' : ''}>
            <span class="index__name">${esc(name)}</span>
            <span class="index__best">${b}${row.chooser ? icon.chevron : ''}</span>
            <span class="index__blurb">${esc(blurb)}</span>
          </button></li>`;
        }).join('')}
      </ul>
      <nav class="index index--ref" aria-label="Country pages">
        <a class="index__row" href="/countries/">
          <span class="index__name">Countries A to Z</span>
          <span class="index__best">${data.sovereign.length} pages${icon.chevron}</span>
        </a>
      </nav>
      <nav class="footer-links" aria-label="More">
        <a class="linkish" href="/learn/">Course</a>
        <a class="linkish" href="/atlas/">Atlas</a>
        <a class="linkish" href="/countries/">Countries</a>
        <a class="linkish" href="/lists/">Lists</a>
        <a class="linkish" href="/medals/">Medals</a>
        <a class="linkish" href="/about/">About</a>
        <a class="linkish" href="/sitemap/">Site map</a>
        <button class="linkish install-link" type="button" data-action="install">Install</button>
      </nav>`,
  });

  const body = panel.body();
  body.addEventListener('click', (e) => {
    if (e.target.closest('a')) app.sfx.play('tap');
    const t = e.target.closest('button');
    if (!t) return;
    app.sfx.play('tap');
    if (t.dataset.region) {
      progress.setting('region', t.dataset.region);
      showHome(app, { turn: false });
    } else if (t.dataset.difficulty) {
      progress.setting('difficulty', t.dataset.difficulty);
      showHome(app, { turn: false });
    } else if (t.dataset.mode) {
      go(playPath(t.dataset.mode, region));
    } else if (t.dataset.chooser) {
      go(t.dataset.chooser === 'higherlower' ? '/higher-or-lower/' : `/${t.dataset.chooser}/`);
    } else if (t.dataset.action === 'daily') {
      go('/daily/');
    } else if (t.dataset.action === 'install') {
      app.install?.();
    } else if (t.dataset.action === 'share-daily') {
      app.shareDaily(date);
    }
  });
}
