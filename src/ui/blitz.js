// Flag blitz: sixty seconds, four names per flag, a wrong answer costs three seconds.
// Every flag you name lights its country on the globe, so the map fills in while you play.
import { MODES, recordKey } from '../game/modes.js';
import { pool, nextCountry, distractors } from '../game/questions.js';
import { progress } from '../game/progress.js';
import { evaluate } from '../game/achievements.js';
import { shuffle } from '../game/rng.js';
import { esc, fmt, icon } from './dom.js';
import { scorePop, streakBanner, flash } from './fx.js';
import { showResults } from './results.js';
import { go } from './nav.js';

const SECONDS = MODES.flagblitz.seconds;
const PENALTY = 3000;

export function startBlitz(app, { region, difficulty }) {
  const { data, globe, sfx, panel } = app;
  const list = pool(data.countries, { region, difficulty, need: ['flag'] });
  const flagged = data.countries.filter((c) => c.flag);
  const g = { alive: true, running: false, count: 0, streak: 0, bestStreak: 0, misses: 0, results: [], used: new Set(), deadline: 0, raf: 0, round: null, locked: false, newlySurveyed: 0, t0: 0 };

  globe.idle(true);
  globe.setInteractive(false);
  globe.clearHighlights();
  globe.clearMarks();
  globe.showLabels(null);
  globe.setSurveyed(null);
  const framed = region === 'World' ? (globe.setRegionFocus(null), globe.overview({ duration: 800 })) : globe.setRegionFocus(region);
  Promise.resolve(framed).then(() => { g.dist = globe.getView?.().distance; });

  const masteryBefore = { ...progress.get().mastery };
  const best = progress.get().records[recordKey('flagblitz', region)];
  panel.render({
    left: 'Flag blitz',
    right: `${region} · ${difficulty[0].toUpperCase()}${difficulty.slice(1)}`,
    back: '/flags/',
    body: `
      <h2 class="place" style="--place-size:40px">Flag blitz</h2>
      <p class="hint">Name as many flags as you can. Each right answer lights its country on the globe; a wrong one costs three seconds. Keys <kbd>1</kbd>–<kbd>4</kbd> work too.</p>
      <p class="small-print">${best ? `Your best here: ${fmt(best)} flags.` : 'No record here yet.'}</p>
      <div class="btn-row"><button class="btn btn--primary btn--wide" type="button" data-action="go">Start the clock${icon.next}</button></div>`,
  });
  panel.body().querySelector('[data-action="go"]').addEventListener('click', countdown);

  function countdown() {
    sfx.play('tap');
    let n = 3;
    const show = () => {
      if (!g.alive) return;
      if (n === 0) return begin();
      panel.render({ left: 'Flag blitz', right: 'Get ready', back: '/flags/', body: `<div class="countdown" aria-live="assertive">${n}</div>`, turn: false });
      sfx.play('countdown', { step: n });
      n--;
      setTimeout(show, 650);
    };
    show();
  }

  function begin() {
    g.running = true;
    g.deadline = performance.now() + SECONDS * 1000;
    sfx.play('start');
    panel.render({
      left: 'Flag blitz',
      right: region,
      back: '/flags/',
      body: `
        <div class="blitz-clock"><span id="bz-time">${SECONDS}.0</span><div class="timer-track"><i id="bz-bar"></i></div></div>
        <div class="blitz-stage" id="bz-stage"></div>`,
      cells: [
        { label: 'Named', id: 'bz-count', value: '0' },
        { label: 'Streak', id: 'bz-streak', value: '0' },
        { label: 'Missed', id: 'bz-miss', value: '0' },
      ],
    });
    next();
    clock();
  }

  function clock() {
    const step = () => {
      if (!g.alive || !g.running) return;
      const left = Math.max(0, g.deadline - performance.now());
      const t = document.getElementById('bz-time');
      const bar = document.getElementById('bz-bar');
      if (t) t.textContent = (left / 1000).toFixed(1);
      if (bar) {
        bar.style.transform = `scaleX(${left / (SECONDS * 1000)})`;
        bar.parentElement.classList.toggle('is-low', left < 10000);
      }
      const sec = Math.ceil(left / 1000);
      if (left < 5000 && sec !== g.lastTick) { g.lastTick = sec; sfx.play('countdown', { step: sec }); }
      if (left <= 0) return end();
      g.raf = requestAnimationFrame(step);
    };
    g.raf = requestAnimationFrame(step);
  }

  function next() {
    const c = g.upcoming || nextCountry(list, progress.get(), g.used);
    g.used.add(c.iso3);
    if (g.used.size >= list.length) g.used.clear();
    // Pick the following flag now and warm it, so the swap never flickers.
    g.upcoming = nextCountry(list, progress.get(), new Set([...g.used, c.iso3]));
    new Image().src = g.upcoming.flag;
    const options = shuffle([c, ...distractors(c, flagged, 3)]);
    g.round = { c, options };
    g.t0 = performance.now();
    g.locked = false;
    const stage = document.getElementById('bz-stage');
    if (!stage) return;
    stage.innerHTML = `
      <div class="flag-frame flag-frame--blitz"><img src="${esc(c.flag)}" alt="A national flag" width="400" height="300"></div>
      <div class="options">${options.map((o, i) => `<button class="opt" type="button" data-iso="${o.iso3}"><span class="keycap">${i + 1}</span><span>${esc(o.name)}</span></button>`).join('')}</div>`;
    stage.classList.remove('is-in');
    void stage.offsetWidth;
    stage.classList.add('is-in');
    stage.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => answer(b.dataset.iso)));
  }

  function answer(iso3) {
    if (!g.running || g.locked) return;
    g.locked = true;
    const { c } = g.round;
    const ms = performance.now() - g.t0;
    const correct = iso3 === c.iso3;
    const stage = document.getElementById('bz-stage');
    stage?.querySelectorAll('.opt').forEach((b) => {
      b.disabled = true;
      if (b.dataset.iso === c.iso3) b.classList.add('is-right');
      else if (b.dataset.iso === iso3) b.classList.add('is-wrong');
    });
    const surveyed = progress.answer(c.iso3, correct, ms);
    if (surveyed.newlySurveyed) g.newlySurveyed++;
    if (correct) {
      g.count++;
      g.streak++;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
      sfx.play('correct', { intensity: 0.45 + Math.min(0.5, g.streak / 20) });
      if (g.streak >= 3) sfx.play('streak', { step: Math.min(10, g.streak - 2) });
      streakBanner(g.streak);
      globe.highlight(c.iso3, 'correct');
      // Turn the globe toward each named flag without zooming in, so the lit countries add up.
      globe.flyTo({ latLng: c.labelLatLng, distance: g.dist || globe.getView?.().distance }, { duration: 650 });
    } else {
      g.misses++;
      g.streak = 0;
      g.deadline -= PENALTY;
      sfx.play('miss');
      flash('miss');
      scorePop(globe, null, '−3 s', 'miss');
      navigator.vibrate?.([10, 40, 10]);
    }
    g.results.push({ iso3: c.iso3, sub: 'flagblitz', points: correct ? 1 : 0, grade: correct ? 'perfect' : 'miss', ms, correct, pickedIso: iso3 });
    const unlocked = evaluate({ type: 'answer', correct, streak: g.streak, ms, mode: 'flagblitz', km: Infinity, iso3: c.iso3 }, progress.get(), data, progress.unlock);
    unlocked.forEach((m, i) => setTimeout(() => app.toastMedal(m), 300 + i * 900));
    panel.cell('bz-count', fmt(g.count));
    panel.cell('bz-streak', fmt(g.streak));
    panel.cell('bz-miss', fmt(g.misses));
    setTimeout(() => g.running && next(), correct ? 260 : 750);
  }

  function end() {
    g.running = false;
    cancelAnimationFrame(g.raf);
    sfx.play('finish');
    const { isRecord, prev } = progress.finishGame(recordKey('flagblitz', region), g.count, g.bestStreak);
    const body = showResults(app, {
      mode: 'flagblitz',
      before: masteryBefore,
      results: g.results,
      count: g.count,
      bestStreak: g.bestStreak,
      newlySurveyed: g.newlySurveyed,
      title: 'Flag blitz',
      right: `${region} · time’s up`,
      lede: 'Time’s up',
      score: g.count,
      scoreLabel: `${fmt(g.count)} <small>${g.count === 1 ? 'flag' : 'flags'}</small>`,
      isRecord,
      prev,
      line: `${g.count} named, ${g.misses} missed${g.misses ? ` (${g.misses * 3} seconds lost)` : ''}.${isRecord && prev ? ` Previous best ${fmt(prev)}.` : ''}${g.newlySurveyed ? ` ${g.newlySurveyed} new on your map.` : ''}`,
      primary: `<button class="btn btn--primary" type="button" data-action="again">${icon.replay}Go again</button>`,
      backHref: '/flags/',
      backLabel: 'Other modes',
    });
    body.querySelector('[data-action="again"]')?.addEventListener('click', () => {
      sfx.play('tap');
      app.restart();
    });
  }

  function onKey(e) {
    if (g.running && /^[1-4]$/.test(e.key) && g.round) {
      const o = g.round.options[Number(e.key) - 1];
      if (o) answer(o.iso3);
    } else if (e.key === 'Escape') go('/flags/');
  }
  window.addEventListener('keydown', onKey);

  return {
    stop() {
      g.alive = false;
      g.running = false;
      cancelAnimationFrame(g.raf);
      window.removeEventListener('keydown', onKey);
    },
  };
}
