// The field course: the course sheet, one region's lessons, a lesson's study cards and quiz,
// and the review of countries that are due again.
import { progress } from '../game/progress.js';
import { COURSE_REGIONS } from '../game/course.js';
import { REGION_COUNT, regionSlug } from '../routes.js';
import { shuffle } from '../game/rng.js';
import { distanceKm } from '../game/geo.js';
import { esc, icon, markSvg, cardPlaceSize, isNarrow } from './dom.js';
import { factsHtml } from './facts.js';
import { startGame, countrySpanKm } from './play.js';
import { go } from './nav.js';

const RAD = Math.PI / 180;
const WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
const regionPath = (region) => `/learn/${regionSlug(region)}/`;
const ofRegion = (r) => (r === 'Americas' ? 'the Americas' : r);

export const nextLesson = (course) => course.lessons.find((l) => !progress.get().course[l.slug]) || null;
export const lessonsDone = (course, region) =>
  (region ? course.byRegion(region) : course.lessons).filter((l) => progress.get().course[l.slug]).length;
export const dueNow = (data) => progress.due(data.sovereign.map((c) => c.iso3));

function quiet(app) {
  const { globe } = app;
  globe.setInteractive(false);
  globe.clearHighlights();
  globe.clearMarks();
  globe.showLabels(null);
}

const flagStrip = (list) =>
  `<span class="strip">${list.filter((c) => c?.flag).map((c) => `<img src="${esc(c.flag)}" alt="" width="36" height="27" loading="lazy">`).join('')}</span>`;

// ---------- /learn/ : the course by region ----------

export function showCourse(app) {
  const { data, globe, panel, course, sfx } = app;
  quiet(app);
  globe.setRegionFocus(null);
  app.applySurvey();
  globe.idle(true);

  const done = lessonsDone(course);
  const next = nextLesson(course);
  const due = dueNow(data).length;
  const rows = COURSE_REGIONS.map((region) => {
    const lessons = course.byRegion(region);
    const n = lessonsDone(course, region);
    const groups = [...new Set(lessons.map((l) => l.group))];
    return `<li><a class="index__row" href="${regionPath(region)}">
      <span class="index__name">${esc(region)}</span>
      <span class="index__best">${n === lessons.length ? markSvg('perfect') : ''}${n} / ${lessons.length}${icon.chevron}</span>
      <span class="index__blurb">${REGION_COUNT[region]} countries · ${esc(groups.join(', '))}</span>
    </a></li>`;
  }).join('');

  panel.render({
    left: 'Field course',
    right: `${done} / ${course.total} lessons`,
    back: '/',
    body: `
      <h2 class="place" style="--place-size:${isNarrow() ? 26 : 32}px">Learn the world</h2>
      <p class="hint">All 195 countries in ${course.total} short lessons. Study a few neighbours with their flags and capitals, then find and name them on the globe.</p>
      ${next
        ? `<a class="btn btn--primary btn--wide next-up" href="${next.path}"><span><small>${done ? 'Continue' : 'Start'} · Lesson ${next.number}</small>${esc(next.name)}</span>${icon.next}</a>`
        : '<p class="expedition__done">Course complete: every lesson done.</p>'}
      <ul class="index index--presets">${rows}</ul>
      ${due ? `<p class="small-print"><a href="/review/">Review ${due} ${due === 1 ? 'country' : 'countries'}</a> you have missed before the next lesson.</p>` : ''}`,
  });
  panel.body().addEventListener('click', (e) => { if (e.target.closest('a')) sfx.play('tap'); });
}

// ---------- /learn/<region>/ : one region's lessons ----------

export function showCourseRegion(app, region) {
  const { data, globe, panel, course, sfx } = app;
  quiet(app);
  app.applySurvey();
  globe.idle(false);
  globe.setRegionFocus(region);

  const lessons = course.byRegion(region);
  const st = progress.get().course;
  const next = lessons.find((l) => !st[l.slug]);
  const rows = lessons.map((l) => {
    const rec = st[l.slug];
    const list = l.iso3.map((iso) => data.get(iso));
    const status = rec
      ? `${markSvg(rec.right === rec.total ? 'perfect' : 'close')}${rec.right} / ${rec.total}`
      : l === next ? '<span class="tag">Next</span>' : '';
    return `<li><a class="index__row" href="${l.path}">
      <span class="index__name">${esc(l.name)}</span>
      <span class="index__best">${status}</span>
      <span class="index__blurb">${esc(list.map((c) => c.name).join(', '))}</span>
      <span class="index__strip">${flagStrip(list)}</span>
    </a></li>`;
  }).join('');

  panel.render({
    left: 'Field course',
    right: `${lessons.filter((l) => st[l.slug]).length} / ${lessons.length} lessons`,
    back: '/learn/',
    body: `
      <h2 class="place" style="--place-size:${isNarrow() ? 26 : 32}px">${esc(region)}</h2>
      <p class="hint">The ${REGION_COUNT[region]} countries of ${esc(ofRegion(region))} in ${lessons.length} lessons. Take them in order, or start anywhere.</p>
      <ul class="index index--presets">${rows}</ul>
      <p class="small-print">Know them already? Try the <a href="/play/find/${regionSlug(region)}/">${esc(region)} map quiz</a> or the <a href="/play/flagquiz/${regionSlug(region)}/">flag quiz</a>.</p>`,
  });
  panel.body().addEventListener('click', (e) => { if (e.target.closest('a')) sfx.play('tap'); });
}

// ---------- /learn/<lesson>/ : overview, study cards, then the quiz ----------

function frameOf(globe, list) {
  let x = 0, y = 0, z = 0;
  for (const c of list) {
    const [la, lo] = [c.labelLatLng[0] * RAD, c.labelLatLng[1] * RAD];
    x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
  }
  const centre = [Math.atan2(z, Math.hypot(x, y)) / RAD, Math.atan2(y, x) / RAD];
  const reach = Math.max(...list.map((c) => distanceKm(centre, c.labelLatLng) + countrySpanKm(c) / 2));
  return { latLng: centre, distance: globe.distanceForSpan(Math.min(9000, Math.max(1500, reach * 2.5))) };
}

export function startLesson(app, lesson) {
  const { data, globe, panel, sfx, course } = app;
  const list = lesson.iso3.map((iso) => data.get(iso));
  const n = list.length;
  const back = regionPath(lesson.region);
  const frame = frameOf(globe, list);
  const after = course.lessons[lesson.number] || null; // lesson.number is 1-based, so this is the next one
  let step = -1; // -1 overview, 0..n-1 study cards
  let game = null;
  let alive = true;

  globe.idle(false);
  globe.setSurveyed(null);
  globe.setRegionFocus(null);

  function overview() {
    step = -1;
    quiet(app);
    for (const c of list) globe.highlight(c.iso3, 'neighbour');
    globe.showLabels(list.map((c) => ({ iso3: c.iso3, text: c.name })));
    globe.flyTo(frame, { duration: 1100 });
    const rec = progress.get().course[lesson.slug];
    panel.render({
      left: `Lesson ${lesson.number} of ${course.total}`,
      right: lesson.region,
      back,
      body: `
        <h2 class="place" style="--place-size:${cardPlaceSize(lesson.name, 30)}px">${esc(lesson.name)}</h2>
        <p class="hint">${WORDS[n] || n} countries, about two minutes. Study each one, then find and name them. A miss is asked again before the lesson ends.${rec ? ` Your best: ${rec.right} of ${rec.total} first time.` : ''}</p>
        <ul class="lesson-list">${list.map((c, i) => `<li><button type="button" data-step="${i}">
          <img src="${esc(c.flag)}" alt="" width="40" height="30">
          <b>${esc(c.name)}</b><span>${esc(c.capital || '')}</span>
        </button></li>`).join('')}</ul>
        <div class="btn-row btn-row--sticky">
          <button class="btn btn--primary" type="button" data-action="study">Start${icon.next}</button>
          <button class="btn" type="button" data-action="quiz">Skip to the quiz</button>
        </div>`,
    });
    wire();
  }

  function study(i) {
    step = i;
    const c = list[i];
    quiet(app);
    globe.highlight(c.iso3, 'focus');
    for (const nb of c.borders || []) globe.highlight(nb, 'neighbour');
    const labels = [{ iso3: c.iso3, text: c.name, strong: true }];
    for (const nb of (c.borders || []).slice(0, 8)) { const o = data.get(nb); if (o) labels.push({ iso3: o.iso3, text: o.name }); }
    globe.showLabels(labels);
    if (c.capitalLatLng) globe.dropPin(c.capitalLatLng, 'capital');
    sfx.play('whoosh', { intensity: 0.4 });
    globe.flyTo({ latLng: c.labelLatLng, distance: globe.distanceForSpan(Math.max(1500, countrySpanKm(c) * 2.3)) }, { duration: 1000 });
    const last = i === n - 1;
    panel.render({
      left: lesson.name,
      right: `Study ${i + 1} / ${n}`,
      back,
      body: `
        <div class="reveal-head">
          <div class="flag-frame flag-frame--card"><img src="${esc(c.flag)}" alt="Flag of ${esc(c.name)}" width="120" height="90"></div>
          <div><h2 class="place" style="--place-size:${cardPlaceSize(c.name)}px">${esc(c.name)}</h2><p class="lede">${esc(c.subregion || c.region)}</p></div>
        </div>
        <p class="verdict">${esc(whereLine(c, data))}</p>
        ${factsHtml(c, data)}
        <div class="btn-row btn-row--sticky">
          <button class="btn btn--back" type="button" data-action="prev" aria-label="Back">${icon.back}</button>
          <button class="btn btn--primary" type="button" data-action="${last ? 'quiz' : 'next'}">${last ? 'Start the quiz' : 'Next'}${icon.next}</button>
        </div>`,
    });
    app.announce?.(`${c.name}. Capital ${c.capital || 'unknown'}.`);
    wire();
  }

  function quiz() {
    if (game) return;
    window.removeEventListener('keydown', onKey);
    const kinds = ['name', 'flagquiz', 'capitalquiz'];
    const second = shuffle(list).map((c, i) => ({ mode: kinds[(i + lesson.number) % kinds.length], iso3: c.iso3 }));
    const script = [...shuffle(list).map((c) => ({ mode: 'find', iso3: c.iso3 })), ...second];
    game = startGame(app, {
      mode: 'lesson', region: lesson.region, difficulty: 'normal',
      session: {
        kind: 'lesson', lesson, title: lesson.name, sideLabel: 'Quiz', doneLabel: 'Lesson complete',
        mixed: true, untimed: true, retry: true, script, frame, back,
        next: after ? { href: after.path, label: 'Next lesson' } : { href: '/learn/', label: 'Course' },
        backHref: back, backLabel: lesson.region,
      },
    });
  }

  function wire() {
    const body = panel.body();
    body.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => { sfx.play('tap'); study(Number(b.dataset.step)); }));
    body.querySelector('[data-action="study"]')?.addEventListener('click', () => { sfx.play('tap'); study(0); });
    body.querySelector('[data-action="next"]')?.addEventListener('click', () => { sfx.play('tap'); study(step + 1); });
    body.querySelector('[data-action="prev"]')?.addEventListener('click', () => { sfx.play('tap'); step > 0 ? study(step - 1) : overview(); });
    body.querySelectorAll('[data-action="quiz"]').forEach((b) => b.addEventListener('click', () => { sfx.play('tap'); quiz(); }));
    body.querySelectorAll('[data-fly]').forEach((b) => b.addEventListener('click', () => {
      sfx.play('tap');
      globe.flyTo({ iso3: b.dataset.fly }, { duration: 900 });
    }));
    if (!isNarrow()) body.querySelector('.btn--primary')?.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (!alive || game || e.target.matches('input')) return;
    if (e.key === 'ArrowRight' || (e.key === 'Enter' && !e.target.closest('button'))) {
      e.preventDefault();
      if (step < 0) study(0);
      else if (step < n - 1) study(step + 1);
      else quiz();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (step > 0) study(step - 1);
      else if (step === 0) overview();
    } else if (e.key === 'Escape') {
      go(back);
    }
  }
  window.addEventListener('keydown', onKey);

  overview();

  return {
    stop() {
      alive = false;
      window.removeEventListener('keydown', onKey);
      game?.stop();
    },
  };
}

// One plain sentence that places the country: its neighbours, or that it has none.
function whereLine(c, data) {
  const nb = (c.borders || []).map((iso) => data.get(iso)).filter((o) => o?.sovereign).map((o) => o.name);
  const where = c.subregion || c.region;
  if (!nb.length) return c.island ? `An island country in ${where}. Its capital is ${c.capital}.` : `A country in ${where} with no land borders. Its capital is ${c.capital}.`;
  const shown = nb.slice(0, 4);
  const names = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
  const more = nb.length - shown.length;
  return `In ${where}, next to ${names}${more > 0 ? ` and ${more} more` : ''}. Its capital is ${c.capital}.`;
}

// ---------- /review/ : countries that are due again ----------

const REVIEW_KIND = ['name', 'find', 'flagquiz', 'find'];

export function startReview(app) {
  const { data, globe, panel, course } = app;
  const due = dueNow(data);
  const next = nextLesson(course);
  if (!due.length) {
    quiet(app);
    globe.setRegionFocus(null);
    app.applySurvey(true);
    globe.idle(true);
    const seen = Object.keys(progress.get().seen).length;
    panel.render({
      left: 'Review',
      right: 'Nothing due',
      back: '/',
      body: `
        <h2 class="place" style="--place-size:${isNarrow() ? 26 : 32}px">All caught up</h2>
        <p class="hint">${seen ? 'Nothing is due right now.' : 'Nothing to review yet.'} A country you miss comes back here at once, then after a day, three days and two weeks, until it sticks.</p>
        <div class="btn-row">
          ${next ? `<a class="btn btn--primary" href="${next.path}">Lesson ${next.number}${icon.next}</a>` : ''}
          <a class="btn" href="/">Sheet index</a>
        </div>`,
    });
    return { stop() {} };
  }
  const batch = due.slice(0, 10);
  const script = shuffle(batch).map((d, i) => {
    const c = data.get(d.iso3);
    let mode = REVIEW_KIND[d.mastery] || 'find';
    if (mode === 'flagquiz' && i % 2) mode = 'capitalquiz';
    if ((mode === 'flagquiz' && !c.flag) || (mode === 'capitalquiz' && !c.capital)) mode = 'name';
    return { mode, iso3: d.iso3 };
  });
  return startGame(app, {
    mode: 'review', region: 'World', difficulty: 'normal',
    session: {
      kind: 'review', title: 'Review', sideLabel: `${batch.length} due`, doneLabel: 'Reviewed',
      mixed: true, untimed: true, script, back: '/',
      next: due.length > batch.length ? { href: '/review/', label: `Review ${due.length - batch.length} more` } : next ? { href: next.path, label: `Lesson ${next.number}` } : null,
      backHref: '/', backLabel: 'Sheet index',
    },
  });
}
