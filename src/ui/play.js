// One game: builds rounds, asks on the globe, scores, reveals, and ends in the results sheet.
import { MODES, HL_PRESETS, CHALLENGE_MODES, recordKey } from '../game/modes.js';
import { pool, nextCountry, distractors, DIFFICULTIES, STATS, statValue, statYear } from '../game/questions.js';
import { timeBonus, nearMissPoints, pinPoints, streakMultiplier, grade } from '../game/scoring.js';
import { distanceKm, distanceToPolygonsKm, formatKm } from '../game/geo.js';
import { progress } from '../game/progress.js';
import { evaluate } from '../game/achievements.js';
import { dailyRounds, todayUTC, expeditionNumber } from '../game/daily.js';
import { LOOKALIKE_GROUPS, lookalikesOf } from '../game/lookalikes.js';
import { shuffle, pick, mulberry32 } from '../game/rng.js';
import { newSeed, roundRand, encodeChallenge } from '../game/challenge.js';
import { esc, fmt, icon, placeSize, cardPlaceSize, normalise, isNarrow } from './dom.js';
import { factsHtml, entryLink } from './facts.js';
import { scorePop, streakBanner } from './fx.js';
import { showResults } from './results.js';
import { go } from './nav.js';

const HARD_LIMIT = 15000;
// The reveal stays up this long after a guess before the next country comes up on its own.
const AUTO_NEXT_MS = 3000;
const HINT_COST = 250;
const compassIcon = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 3.2l1.8 4.8L8 12.8 6.2 8z" fill="currentColor" stroke="none"/></svg>';
const FLAG_MODES = ['flagquiz', 'lookalikes', 'flags', 'flagmatch'];

// `session` turns the game into a scripted one: a lesson, a review, a practice of your misses or a
// challenge from a link. It carries the rounds ({ mode, iso3 }), labels and what the results offer next.
export function startGame(app, { mode, region, difficulty, preset, session = null }) {
  const { data, globe, sfx, panel } = app;
  const def = MODES[mode];
  const backTo = session?.back || '/';
  const diff = DIFFICULTIES[difficulty] || DIFFICULTIES.easy;
  const isDaily = mode === 'daily';
  const isHL = mode === 'higherlower';
  const hlPreset = isHL ? (HL_PRESETS[preset] ? preset : 'mixed') : null;
  const timed = !isDaily && diff.timer && !isHL && !session?.untimed;
  const regionLabel = isDaily || mode === 'lookalikes' ? 'World' : region;
  const title = session?.title || (isDaily ? `Expedition ${expeditionNumber(todayUTC())}` : isHL ? `Higher or lower · ${HL_PRESETS[hlPreset].name}` : def.name);
  const sideLabel = session?.sideLabel || (isHL ? regionLabel : `${regionLabel} · ${mode === 'lookalikes' ? 'Tricky' : diff.label}`);
  // Mixed sessions name each round's kind in the header, as the daily does.
  const mixed = isDaily || !!session?.mixed;

  const g = {
    index: 0,
    total: def.endless ? Infinity : def.rounds,
    score: 0,
    streak: 0,
    bestStreak: 0,
    misses: 0,
    results: [],
    used: new Set(),
    round: null,
    awaiting: false,
    canAdvance: false,
    answeredAt: 0,
    auto: null,
    t0: 0,
    raf: 0,
    alive: true,
    hlA: null,
    prevA: null,
    lastGroup: -1,
    newlySurveyed: 0,
    seed: session?.seed || newSeed(),
    asked: [],
  };

  const masteryBefore = { ...progress.get().mastery };
  const daily = isDaily ? dailyRounds(data.countries) : null;
  // A script fixes the rounds in advance; a lesson can grow it by asking a missed country again.
  const script = session?.script ? session.script.slice() : daily;
  if (script) g.total = script.length;
  const pools = {};
  const poolFor = (sub, tierCap) => {
    const key = `${sub}:${tierCap ?? difficulty}`;
    if (!pools[key]) {
      const d = tierCap ? (tierCap === 1 ? 'easy' : tierCap === 2 ? 'normal' : 'hard') : difficulty;
      pools[key] = pool(data.countries, { region: regionLabel, difficulty: d, need: MODES[sub]?.needs || [] });
    }
    return pools[key];
  };

  globe.idle(false);
  globe.clearHighlights();
  globe.clearMarks();
  globe.showLabels(null);
  globe.setSurveyed(null);
  globe.setRegionFocus(regionLabel === 'World' ? null : regionLabel);

  // ---------- Round construction ----------

  function makeRound() {
    if (script) {
      const d = script[g.index];
      return build(d.mode, data.get(d.iso3), d.seed != null ? mulberry32(d.seed) : roundRand(g.seed, g.index), d);
    }
    if (isHL) return buildHL();
    if (mode === 'lookalikes') return buildLookalike();
    if (mode === 'streak') {
      const sub = pick(['find', 'name', 'flagmatch', 'flagquiz', 'flags', 'find']);
      const tier = g.streak < 5 ? 1 : g.streak < 15 ? 2 : 3;
      return build(sub, nextCountry(poolFor(sub, tier), progress.get(), g.used));
    }
    return build(mode, nextCountry(poolFor(mode), progress.get(), g.used), roundRand(g.seed, g.index));
  }

  function build(sub, country, rand = Math.random, d = null) {
    g.used.add(country.iso3);
    g.asked.push(country.iso3);
    const r = { sub, input: MODES[sub].input, country, retry: !!d?.retry };
    const flagged = data.countries.filter((c) => c.flag);
    if (r.input === 'choice-name') {
      if (!isDaily && difficulty === 'hard') r.input = 'typed';
      else r.options = shuffle([country, ...distractors(country, data.countries, 3, rand)], rand);
    }
    if (r.input === 'choice-flag') r.options = shuffle([country, ...distractors(country, flagged, 3, rand, 'flag')], rand);
    if (r.input === 'flag-name') r.options = shuffle([country, ...distractors(country, flagged, 3, rand)], rand);
    if (r.input === 'choice-capital') r.options = shuffle([country, ...distractors(country, data.countries.filter((c) => c.capital), 3, rand, 'capital')], rand);
    return r;
  }

  function buildLookalike() {
    let gi;
    do gi = Math.floor(Math.random() * LOOKALIKE_GROUPS.length);
    while (gi === g.lastGroup);
    g.lastGroup = gi;
    const group = LOOKALIKE_GROUPS[gi].map((iso) => data.get(iso)).filter((c) => c?.flag);
    const fresh = group.filter((c) => !g.used.has(c.iso3));
    const country = pick(fresh.length ? fresh : group);
    g.used.add(country.iso3);
    const others = shuffle(lookalikesOf(country.iso3).map((iso) => data.get(iso)).filter((c) => c?.flag)).slice(0, 3);
    const fill = others.length < 3 ? distractors(country, data.countries.filter((c) => c.flag && !others.includes(c)), 3 - others.length) : [];
    return { sub: 'lookalikes', input: 'flag-name', country, options: shuffle([country, ...others, ...fill]) };
  }

  function buildHL() {
    const list = poolFor('higherlower').filter((c) => c.population != null);
    const a = g.hlA || pick(hlPreset === 'neighbours' ? list.filter((c) => c.borders?.length) : list);
    const fixed = hlPreset !== 'mixed' && hlPreset !== 'neighbours' ? hlPreset : null;
    const stats = Object.keys(STATS).filter((s) => statValue(a, s) != null);
    const stat = fixed && statValue(a, fixed) != null ? fixed : g.index < 2 ? pick(['population', 'area']) : pick(stats);
    const va = statValue(a, stat);
    const differs = (c) => {
      if (!c || c.iso3 === a.iso3 || c.iso3 === g.prevA) return false;
      const v = statValue(c, stat);
      return v != null && Math.abs(v - va) / Math.max(v, va) > 0.06;
    };
    let candidates = [];
    if (hlPreset === 'neighbours') {
      candidates = (a.borders || []).map((iso) => data.get(iso)).filter((c) => c?.sovereign && differs(c));
      if (!candidates.length) candidates = data.sovereign.filter((c) => c.subregion === a.subregion && differs(c));
    }
    if (!candidates.length) candidates = list.filter(differs);
    return { sub: 'higherlower', input: 'hl', country: pick(candidates), other: a, stat };
  }

  // ---------- Asking ----------

  function cells() {
    const roundText = g.total === Infinity ? `${g.index + 1}` : `${g.index + 1}<small>/${g.total}</small>`;
    const c = [
      { label: 'Round', id: 'c-round', value: roundText },
      { label: isHL ? 'In a row' : 'Score', id: 'c-score', value: isHL ? fmt(g.streak) : fmt(g.score) },
    ];
    if (!isHL) c.push({ label: mode === 'streak' ? `Streak ×${streakMultiplier(g.streak)}` : 'Streak', id: 'c-streak', value: benchmarks() });
    c.push({ label: timed ? 'Time left' : 'Time', id: 'c-time', value: timed ? '15.0' : '0.0' });
    return c;
  }

  function benchmarks() {
    const n = 10;
    const lit = Math.min(n, g.streak);
    return `<span class="benchmarks" aria-label="Streak ${g.streak}">${Array.from({ length: n }, (_, i) => `<i class="${i < lit ? (i === lit - 1 ? 'on hot' : 'on') : ''}"></i>`).join('')}</span>`;
  }

  async function ask() {
    if (!g.alive) return;
    const r = (g.round = makeRound());
    if (window.__ws) window.__ws.game = g; // ?debug only: lets automated checks read the current round
    g.hint = false;
    app.compass?.clear();
    globe.clearHighlights();
    globe.clearMarks();
    globe.showLabels(null);

    panel.render({ left: title, right: mixed ? MODES[r.sub].name : sideLabel, back: backTo, body: promptHtml(r), cells: cells() });
    wirePrompt(r);

    if (r.input === 'country' || r.input === 'point') {
      const easyPin = r.input === 'point' && difficulty === 'easy' && !isDaily;
      if (easyPin) {
        globe.highlight(r.country.iso3, 'focus');
        globe.flyTo({ latLng: r.country.labelLatLng, distance: globe.distanceForSpan(Math.max(1800, countrySpanKm(r.country) * 2.4)) }, { duration: 1100 });
      } else if (session?.frame) {
        globe.flyTo(session.frame, { duration: 900 });
      } else if (regionLabel === 'World') {
        globe.overview({ duration: 900 });
      } else {
        globe.setRegionFocus(regionLabel);
      }
      globe.setInteractive(true);
    } else if (r.input === 'hl') {
      globe.setInteractive(false);
      globe.highlight(r.other.iso3, 'focus');
      globe.highlight(r.country.iso3, 'target');
      globe.drawArc(r.other.labelLatLng, r.country.labelLatLng, {});
      globe.showLabels([{ iso3: r.other.iso3, text: r.other.name }, { iso3: r.country.iso3, text: r.country.name }]);
      fitBoth(r.other, r.country);
    } else if (r.input === 'flag-name') {
      // No hint on the globe while you think; it flies to the flag's home after you answer.
      globe.setInteractive(false);
      globe.overview({ duration: 900 });
    } else {
      globe.setInteractive(false);
      globe.highlight(r.country.iso3, 'target');
      sfx.play('whoosh', { intensity: 0.5 });
      await globe.flyTo({ iso3: r.country.iso3 }, { duration: 1100 });
    }

    if (!g.alive) return;
    sfx.play('start');
    g.awaiting = true;
    g.t0 = performance.now();
    tick();
  }

  function fitBoth(a, b) {
    const km = distanceKm(a.labelLatLng, b.labelLatLng);
    const mid = midpoint(a.labelLatLng, b.labelLatLng);
    // Pairs on opposite sides of the world get the whole globe, centred on the arc.
    if (km > 8000) return globe.flyTo({ latLng: mid, distance: globe.overviewDistance() }, { duration: 1100 });
    globe.flyTo({ latLng: mid, distance: globe.distanceForSpan(Math.max(2600, km * 2.3)) }, { duration: 1100 });
  }

  function promptHtml(r) {
    const c = r.country;
    const size = (name) => `style="--place-size:${placeSize(name)}px"`;
    const flagImg = `<div class="flag-frame flag-frame--prompt"><img src="${esc(c.flag)}" alt="A national flag" width="400" height="300"></div>`;
    const nameOptions = (key = 'name') =>
      `<div class="options">${r.options.map((o, i) => `<button class="opt" type="button" data-iso="${o.iso3}"><span class="keycap">${i + 1}</span><span>${esc(o[key])}</span></button>`).join('')}</div>`;
    switch (r.sub) {
      case 'find':
        return `<h2 class="place" style="--place-size:${placeSize(`Find ${c.name}`)}px"><span class="place__verb">Find</span> ${esc(c.name)}</h2>
          <p class="hint">Tap it on the globe. Drag to turn, pinch or scroll to zoom.</p>${hintBtn()}`;
      case 'flags':
        return `<p class="lede">Whose flag is this?</p>${flagImg}<p class="hint">Tap its country on the globe.</p>${hintBtn()}`;
      case 'flagquiz':
        return `<p class="lede">Whose flag is this?</p>${flagImg}${nameOptions()}`;
      case 'lookalikes':
        return `<p class="lede">Careful: the others look almost the same.</p>${flagImg}${nameOptions()}`;
      case 'capitals': {
        const showCountry = isDaily || difficulty !== 'hard';
        return `<h2 class="place" style="--place-size:${placeSize(`Pin ${c.capital}`)}px"><span class="place__verb">Pin</span> ${esc(c.capital)}</h2>
          <p class="hint">${showCountry ? `Capital of ${esc(c.name)}. ` : ''}Tap the exact spot; closer scores more.</p>${hintBtn()}`;
      }
      case 'capitalquiz':
        return `<p class="lede">What is the capital of</p><h2 class="place" style="--place-size:${placeSize(`${c.name}?`)}px">${esc(c.name)}?</h2>${nameOptions('capital')}`;
      case 'name':
        if (r.input === 'typed') {
          return `<p class="lede">Which country is marked?</p>
            <div class="typed"><input id="typed" type="text" autocomplete="off" spellcheck="false" placeholder="Type a country" aria-label="Country name" aria-autocomplete="list" aria-controls="suggest"><ul class="suggest" id="suggest" role="listbox" hidden></ul></div>
            <p class="hint">Pick from the list or press <kbd>Enter</kbd>.</p>`;
        }
        return `<p class="lede">Which country is marked?</p>${nameOptions()}`;
      case 'flagmatch':
        return `<p class="lede">Pick the flag of the marked country.</p>
          <div class="options options--flags">${r.options.map((o, i) => `<button class="opt" type="button" data-iso="${o.iso3}" aria-label="Flag ${i + 1}"><span class="keycap">${i + 1}</span><img src="${esc(o.flag)}" alt="" width="200" height="150" loading="eager"></button>`).join('')}</div>`;
      case 'higherlower': {
        const st = STATS[r.stat];
        const a = r.other;
        const side = (x, value, id) => `
          <div class="hl__side">${x.flag ? `<img class="hl__flag" src="${esc(x.flag)}" alt="" width="60" height="45">` : ''}<div class="hl__name">${esc(x.name)}</div>
          <div class="hl__value ${id ? 'is-unknown' : ''}" ${id ? `id="${id}"` : ''}>${value}</div><div class="hl__year" ${id ? `id="${id}-year"` : ''}>${id ? '&nbsp;' : yearNote(x, r.stat)}</div></div>`;
        return `<p class="hl__stat">${esc(st.label)}: does ${esc(c.name)} have more or less?</p>
          <div class="hl">${side(a, st.format(statValue(a, r.stat)))}<div class="hl__vs" aria-hidden="true">vs</div>${side(c, '?', 'hl-b')}</div>
          <div class="hl-buttons">
            <button class="btn btn--primary" type="button" data-hl="higher">${icon.up}More</button>
            <button class="btn btn--primary" type="button" data-hl="lower">${icon.down}Less</button>
          </div>`;
      }
      default:
        return '';
    }
  }

  function hintBtn() {
    if (isDaily || difficulty === 'hard') return '';
    return `<button class="linkish hint-btn" type="button" data-action="hint">${compassIcon}Compass hint <span>−${HINT_COST}</span></button>`;
  }

  function yearNote(c, stat) {
    if (stat === 'area') return 'total area';
    const y = statYear(c, stat);
    return y ? `${y}, World Bank` : '';
  }

  function wirePrompt(r) {
    const body = panel.body();
    if (r.options) body.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => submitChoice(b.dataset.iso)));
    if (r.input === 'hl') body.querySelectorAll('[data-hl]').forEach((b) => b.addEventListener('click', () => submitHL(b.dataset.hl)));
    if (r.input === 'typed') wireTyped();
    const hint = body.querySelector('[data-action="hint"]');
    hint?.addEventListener('click', () => {
      if (!g.awaiting || g.hint) return;
      g.hint = true;
      app.compass?.point(r.sub === 'capitals' ? r.country.capitalLatLng : r.country.labelLatLng);
      hint.disabled = true;
      hint.innerHTML = `${compassIcon}The compass points the way <span>−${HINT_COST}</span>`;
    });
  }

  function wireTyped() {
    const input = document.getElementById('typed');
    const list = document.getElementById('suggest');
    const names = data.sovereign.map((c) => ({ c, n: normalise(c.name), o: normalise(c.official || '') }));
    let matches = [];
    let sel = 0;
    const draw = () => {
      list.hidden = !matches.length;
      list.innerHTML = matches.map((m, i) => `<li role="option" data-iso="${m.iso3}" aria-selected="${i === sel}">${esc(m.name)}</li>`).join('');
    };
    input.addEventListener('input', () => {
      const q = normalise(input.value);
      sel = 0;
      matches = q ? names.filter((x) => x.n.startsWith(q) || x.n.includes(` ${q}`) || x.o.includes(q)).slice(0, 6).map((x) => x.c) : [];
      draw();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, matches.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && matches[sel]) { e.preventDefault(); submitChoice(matches[sel].iso3); }
      e.stopPropagation();
    });
    list.addEventListener('pointerdown', (e) => {
      const li = e.target.closest('li');
      if (li) { e.preventDefault(); submitChoice(li.dataset.iso); }
    });
    if (!isNarrow()) setTimeout(() => input.focus(), 60);
  }

  function tick() {
    cancelAnimationFrame(g.raf);
    const step = () => {
      if (!g.awaiting || !g.alive) return;
      const ms = performance.now() - g.t0;
      if (timed) {
        const left = Math.max(0, HARD_LIMIT - ms);
        const d = panel.cell('c-time', `${(left / 1000).toFixed(1)}`);
        if (d) d.classList.toggle('is-hot', left < 4000);
        const sec = Math.ceil(left / 1000);
        if (left < 3000 && sec !== g.lastTick) { g.lastTick = sec; sfx.play('countdown', { step: sec }); }
        if (left <= 0) return timeout();
      } else {
        panel.cell('c-time', `${(ms / 1000).toFixed(1)}`);
      }
      g.raf = requestAnimationFrame(step);
    };
    g.raf = requestAnimationFrame(step);
  }

  // ---------- Answers ----------

  function onPick({ iso3, latLng }) {
    if (!g.awaiting || !latLng) return;
    const r = g.round;
    if (r.input === 'country') submitCountry(iso3, latLng);
    else if (r.input === 'point') submitPoint(latLng);
  }

  const elapsed = () => performance.now() - g.t0;

  function submitCountry(iso3, latLng) {
    const r = g.round;
    const ms = elapsed();
    const target = r.country;
    const correct = iso3 === target.iso3;
    const shapes = data.shapes.get(target.iso3);
    const km = correct ? 0 : shapes ? distanceToPolygonsKm(shapes, latLng) : distanceKm(latLng, target.labelLatLng);
    finish({ correct, ms, km, base: correct ? 1000 + timeBonus(ms) : nearMissPoints(km), pickedIso: iso3, guessLatLng: latLng });
  }

  function submitPoint(latLng) {
    const ms = elapsed();
    const km = distanceKm(latLng, g.round.country.capitalLatLng);
    const base = pinPoints(km) + (km <= 250 ? timeBonus(ms) : 0);
    finish({ correct: km <= 150, ms, km, base, guessLatLng: latLng, pickedIso: globe.countryAt(latLng[0], latLng[1]) });
  }

  function submitChoice(iso3) {
    if (!g.awaiting) return;
    const ms = elapsed();
    const correct = iso3 === g.round.country.iso3;
    finish({ correct, ms, base: correct ? 1000 + timeBonus(ms) : 0, pickedIso: iso3 });
  }

  function submitHL(dir) {
    if (!g.awaiting) return;
    const r = g.round;
    const va = statValue(r.other, r.stat);
    const vb = statValue(r.country, r.stat);
    finish({ correct: dir === 'higher' ? vb >= va : vb <= va, ms: elapsed(), base: 1, dir });
  }

  function timeout() {
    finish({ correct: false, ms: HARD_LIMIT, base: 0, timedOut: true, km: null, guessLatLng: null, pickedIso: null });
  }

  function finish(res) {
    if (!g.awaiting) return;
    g.awaiting = false;
    g.answeredAt = performance.now();
    cancelAnimationFrame(g.raf);
    globe.setInteractive(false);
    const r = g.round;

    const mult = mode === 'streak' ? streakMultiplier(g.streak) : 1;
    let points = isHL ? (res.correct ? 1 : 0) : res.correct ? Math.round(res.base * mult) : Math.round(res.base);
    res.hint = g.hint;
    if (g.hint && !isHL) points = Math.max(0, points - HINT_COST);
    app.compass?.clear();
    const gr = isHL ? (res.correct ? 'perfect' : 'miss') : res.correct ? (res.base >= 900 ? 'perfect' : 'close') : grade(points);

    if (res.correct) g.streak++;
    else {
      g.streak = 0;
      g.misses++;
      // A lesson asks a missed country once more before it ends.
      if (session?.retry && script && !r.retry) {
        script.push({ mode: r.sub, iso3: r.country.iso3, retry: true });
        g.total = script.length;
      }
    }
    g.bestStreak = Math.max(g.bestStreak, g.streak);
    g.score += points;

    let surveyed = { newlySurveyed: false };
    if (r.input !== 'hl') surveyed = progress.answer(r.country.iso3, res.correct, res.ms);
    if (surveyed.newlySurveyed) g.newlySurveyed++;

    g.results.push({ iso3: r.country.iso3, sub: r.sub, points, grade: gr, km: res.km, ms: res.ms, correct: res.correct, stat: r.stat, other: r.other?.iso3, retry: r.retry });

    queueMedals(evaluate(
      { type: 'answer', correct: res.correct, streak: g.streak, ms: res.ms, mode: r.sub, km: res.km ?? Infinity, iso3: r.country.iso3 },
      progress.get(),
      data,
      progress.unlock,
    ));

    if (res.correct) {
      sfx.play(gr === 'perfect' ? 'perfect' : 'correct', { intensity: Math.min(1, 0.6 + g.streak / 20) });
      if (g.streak >= 3) setTimeout(() => sfx.play('streak', { step: g.streak - 2 }), 260);
      if (streakBanner(g.streak)) navigator.vibrate?.(18);
    } else {
      sfx.play(points > 0 ? 'close' : 'miss');
      navigator.vibrate?.([10, 40, 10]);
    }
    if (!isHL && res.guessLatLng) {
      scorePop(globe, res.guessLatLng, points ? `+${fmt(points)}` : formatKm(res.km || 0), res.correct ? 'good' : points ? 'near' : 'miss');
    }
    reveal(r, res, points, surveyed.newlySurveyed);
  }

  function reveal(r, res, points, isNew) {
    const c = r.country;

    if (r.input === 'hl') {
      globe.clearHighlights();
      globe.highlight(r.other.iso3, 'focus');
      globe.highlight(c.iso3, res.correct ? 'correct' : 'wrong');
      return revealHL(r, res);
    }

    const labels = [{ iso3: c.iso3, text: c.name, strong: true }];
    if (res.guessLatLng) globe.dropPin(res.guessLatLng, 'guess');
    if (res.pickedIso && res.pickedIso !== c.iso3 && r.input !== 'point') {
      globe.highlight(res.pickedIso, 'wrong');
      const p = data.get(res.pickedIso);
      if (p) labels.push({ iso3: p.iso3, text: p.name });
    }
    globe.highlight(c.iso3, res.correct ? 'correct' : 'target');
    for (const nb of (c.borders || []).slice(0, 10)) if (nb !== res.pickedIso) globe.highlight(nb, 'neighbour');
    if (r.sub === 'capitalquiz' && c.capitalLatLng) globe.dropPin(c.capitalLatLng, 'capital');
    if (r.sub === 'capitals') {
      globe.dropPin(c.capitalLatLng, 'capital');
      if (res.guessLatLng) globe.drawArc(res.guessLatLng, c.capitalLatLng, { label: formatKm(res.km) });
    } else if (res.guessLatLng && !res.correct && res.km > 0) {
      // Short misses keep the label off the globe: the verdict already says how far, and it would sit on the country names.
      globe.drawArc(res.guessLatLng, nearestPoint(c, res.guessLatLng), res.km > 400 ? { label: formatKm(res.km) } : {});
    }
    globe.showLabels(labels);

    // Frame the answer with room for its neighbours and the pin, never filling the free area.
    let fly = { latLng: c.labelLatLng, distance: globe.distanceForSpan(Math.max(1600, countrySpanKm(c) * 2.1)) };
    if (r.sub === 'capitals' && res.guessLatLng) fly = { latLng: midpoint(res.guessLatLng, c.capitalLatLng), distance: globe.distanceForSpan(Math.max(2200, res.km * 2.4)) };
    else if (res.guessLatLng && res.km > 0) {
      const span = Math.max(countrySpanKm(c) * 2.1, res.km * 1.7, 1600);
      fly = { latLng: midpoint(res.guessLatLng, c.labelLatLng), distance: globe.distanceForSpan(span) };
    }
    // A short beat on the pin before the camera moves, so the hit lands first.
    setTimeout(() => {
      if (!g.alive) return;
      sfx.play('whoosh', { intensity: res.km ? Math.min(1, res.km / 6000) : 0.35 });
      globe.flyTo(fly, { duration: 1000 });
    }, res.guessLatLng ? 380 : 60);

    panel.body().querySelectorAll('.opt').forEach((b) => {
      b.disabled = true;
      if (b.dataset.iso === c.iso3) b.classList.add('is-right');
      else if (b.dataset.iso === res.pickedIso) b.classList.add('is-wrong');
      else b.classList.add('is-dim');
    });

    const over = (def.endless && !res.correct) || g.index + 1 >= g.total;
    // Let the marked options read for a moment before the card turns.
    setTimeout(() => {
      if (!g.alive) return;
      panel.render({
        left: title,
        right: mixed ? MODES[r.sub].name : sideLabel,
        back: backTo,
        body: revealHtml(r, res, points, isNew, over),
        cells: cells(),
        tone: res.correct ? 'good' : 'miss',
      });
      app.announce?.(panel.body().querySelector('.verdict')?.textContent || '');
      panel.cell('c-time', `${(res.ms / 1000).toFixed(1)}`);
      countUp('c-score', g.score, points);
      wireReveal();
    }, r.options ? 520 : 0);
  }

  // Higher or lower keeps its two-column card and fills in the answer.
  function revealHL(r, res) {
    const st = STATS[r.stat];
    const vb = statValue(r.country, r.stat);
    const va = statValue(r.other, r.stat);
    const el = document.getElementById('hl-b');
    if (el) {
      el.classList.remove('is-unknown');
      el.classList.add(res.correct ? 'is-right' : 'is-wrong');
      countValue(el, vb, st.format);
      document.getElementById('hl-b-year').textContent = yearNote(r.country, r.stat);
    }
    const A = esc(r.other.name);
    const B = esc(r.country.name);
    const big = Math.max(va, vb) / Math.min(va, vb);
    let line;
    if (big >= 1.95) line = vb >= va ? `${B} is ${big < 10 ? big.toFixed(1) : fmt(big)}× ${A}.` : `${A} is ${big < 10 ? big.toFixed(1) : fmt(big)}× ${B}.`;
    else line = vb >= va ? `${B} is ${Math.round((vb / va - 1) * 100)}% higher than ${A}.` : `${B} is ${Math.round((1 - vb / va) * 100)}% lower than ${A}.`;
    const over = !res.correct;
    panel.body().querySelector('.hl-buttons').outerHTML = `
      <p class="verdict hl-verdict ${res.correct ? 'is-right' : 'is-wrong'}"><b>${res.correct ? 'Right.' : 'Not this time.'}</b> ${line}</p>
      <div class="points-row"><div class="points">${fmt(g.streak)}<small>in a row</small></div><button class="btn btn--primary" type="button" data-action="next">${over ? 'See results' : 'Next'}${icon.next}</button></div>`;
    panel.el.dataset.tone = res.correct ? 'good' : 'miss';
    panel.cell('c-score', fmt(g.streak));
    app.announce?.(panel.body().querySelector('.verdict')?.textContent || '');
    wireReveal();
  }

  function wireReveal() {
    const body = panel.body();
    const next = body.querySelector('[data-action="next"]');
    next?.addEventListener('click', advance);
    body.querySelectorAll('[data-fly]').forEach((b) =>
      b.addEventListener('click', () => {
        sfx.play('tap');
        globe.flyTo({ iso3: b.dataset.fly }, { duration: 900 });
        globe.showLabels([{ iso3: b.dataset.fly, text: data.get(b.dataset.fly)?.name || '' }]);
      }),
    );
    if (!isNarrow()) next?.focus({ preventScroll: true });
    g.canAdvance = true;
    const last = g.results[g.results.length - 1];
    const over = (def.endless && !last?.correct) || g.index + 1 >= g.total;
    startAuto(next, over);
  }

  // Auto next: three seconds after the guess the next country comes up on its own. The Next button
  // drains while it waits. Touching the card or the globe, any key but Enter or Space, or leaving
  // the tab holds the card until Next. The last round never auto-advances: results wait for a tap.
  function startAuto(next, over) {
    stopAuto();
    if (over || !next) return;
    const left = Math.max(1200, AUTO_NEXT_MS - (performance.now() - g.answeredAt));
    next.style.setProperty('--auto-ms', `${Math.round(left)}ms`);
    next.classList.add('btn--auto');
    const hold = (e) => {
      if (e?.target?.closest?.('[data-action="next"]')) return;
      stopAuto();
    };
    const onHidden = () => { if (document.hidden) stopAuto(); };
    const targets = [[panel.el, 'pointerdown'], [panel.el, 'wheel'], [panel.el, 'focusin'], [globe.canvas, 'pointerdown'], [globe.canvas, 'wheel']];
    for (const [el, type] of targets) el?.addEventListener(type, hold, { passive: true });
    document.addEventListener('visibilitychange', onHidden);
    const timer = setTimeout(() => {
      stopAuto();
      advance({ auto: true });
    }, left);
    g.auto = {
      off() {
        clearTimeout(timer);
        for (const [el, type] of targets) el?.removeEventListener(type, hold);
        document.removeEventListener('visibilitychange', onHidden);
        next.classList.remove('btn--auto');
      },
    };
  }

  function stopAuto() {
    g.auto?.off();
    g.auto = null;
  }

  function revealHtml(r, res, points, isNew, over) {
    const c = r.country;
    const picked = res.pickedIso ? data.get(res.pickedIso) : null;
    const flagRound = r.input === 'flag-name' || r.sub === 'flags' || r.sub === 'flagmatch';
    let verdict = '';
    if (r.sub === 'capitalquiz') {
      verdict = res.correct
        ? `<p class="verdict"><b>${esc(c.capital)}</b> is the capital of ${esc(c.name)}.</p>`
        : res.timedOut
          ? `<p class="verdict">Out of time. The capital of ${esc(c.name)} is <b>${esc(c.capital)}</b>.</p>`
          : `<p class="verdict">${picked ? `${esc(picked.capital)} is the capital of ${esc(picked.name)}. ` : ''}The capital of ${esc(c.name)} is <b>${esc(c.capital)}</b>.</p>`;
    } else if (r.sub === 'capitals') {
      verdict = res.timedOut
        ? `<p class="verdict">Out of time. ${esc(c.capital)} is marked with the triangle.</p>`
        : `<p class="verdict">Your pin landed <span class="off">${formatKm(res.km)}</span> from ${esc(c.capital)}.</p>`;
    } else if (res.correct) {
      verdict = `<p class="verdict">${flagRound ? `That’s the flag of <b>${esc(c.name)}</b>.` : `<b>${esc(c.name)}</b>, right first time.`}</p>`;
    } else if (res.timedOut) {
      verdict = '<p class="verdict">Out of time. Here’s where it is.</p>';
    } else if (picked && r.input === 'country') {
      verdict = `<p class="verdict">You picked <b>${esc(picked.name)}</b>, <span class="off">${formatKm(res.km)} off</span>.</p>`;
    } else if (picked) {
      verdict = `<p class="verdict">You picked <b>${esc(picked.name)}</b>. This is ${esc(c.name)}.</p>`;
    } else if (res.km != null) {
      verdict = `<p class="verdict">That’s open water, <span class="off">${formatKm(res.km)} off</span>.</p>`;
    }

    // Side-by-side flags when one flag was mistaken for another.
    const compare = flagRound && !res.correct && picked?.flag && c.flag
      ? `<div class="compare">
          <figure><div class="flag-frame"><img src="${esc(c.flag)}" alt="Flag of ${esc(c.name)}" width="160" height="120"></div><figcaption><b>${esc(c.name)}</b>the answer</figcaption></figure>
          <figure class="is-picked"><div class="flag-frame"><img src="${esc(picked.flag)}" alt="Flag of ${esc(picked.name)}" width="160" height="120"></div><figcaption><b>${esc(picked.name)}</b>your pick</figcaption></figure>
        </div>`
      : '';

    const stamp = res.correct
      ? `<span class="stamp">Surveyed${isNew ? '<small>New</small>' : ''}</span>`
      : `<span class="stamp stamp--miss">${res.timedOut ? 'Time' : 'Missed'}</span>`;

    return `${stamp}
      <div class="reveal-head">
        ${c.flag && !compare ? `<div class="flag-frame flag-frame--card"><img src="${esc(c.flag)}" alt="Flag of ${esc(c.name)}" width="120" height="90"></div>` : ''}
        <div><h2 class="place" style="--place-size:${cardPlaceSize(c.name)}px">${esc(c.name)}</h2><p class="lede">${esc(c.subregion || c.region || '')}</p></div>
      </div>
      ${verdict}
      ${compare}
      ${factsHtml(c, data)}
      <div class="points-row"><div class="points ${points ? '' : 'is-zero'}">+${fmt(points)}<small>${pointsNote(res, points)}</small></div><div class="points-row__end">${entryLink(c)}<button class="btn btn--primary" type="button" data-action="next">${over ? 'See results' : 'Next'}${icon.next}</button></div></div>`;
  }

  function pointsNote(res, points) {
    if (!points) return res.timedOut ? 'no answer' : 'no points';
    const parts = [];
    if (mode === 'streak' && res.correct && streakMultiplier(Math.max(0, g.streak - 1)) > 1) parts.push(`×${streakMultiplier(g.streak - 1)} streak`);
    if (res.correct && res.ms < 12000) parts.push(`${fmt(timeBonus(res.ms))} time bonus`);
    if (!res.correct && points) parts.push('near miss');
    if (res.hint) parts.push(`hint −${HINT_COST}`);
    return parts.join(' · ') || '&nbsp;';
  }

  function nearestPoint(c, from) {
    const shapes = data.shapes.get(c.iso3);
    if (!shapes) return c.labelLatLng;
    let best = null;
    let bd = Infinity;
    for (const poly of shapes) for (const [lng, lat] of poly[0]) {
      const d = distanceKm(from, [lat, lng]);
      if (d < bd) { bd = d; best = [lat, lng]; }
    }
    return best || c.labelLatLng;
  }

  function countUp(id, to, delta) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!delta) { el.textContent = fmt(to); return; }
    const from = to - delta;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 650);
      el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(step);
    };
    el.classList.add('is-bump');
    setTimeout(() => el.classList.remove('is-bump'), 500);
    requestAnimationFrame(step);
  }

  function countValue(el, v, format) {
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      el.textContent = format(k < 1 ? v * (1 - Math.pow(1 - k, 3)) : v);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function advance(opts) {
    if (!g.canAdvance || !g.alive) return;
    g.canAdvance = false;
    stopAuto();
    if (opts?.auto !== true) sfx.play('tap');
    const last = g.results[g.results.length - 1];
    const over = (def.endless && !last.correct) || g.index + 1 >= g.total;
    if (isHL && last.correct) {
      g.prevA = g.round.other.iso3;
      g.hlA = g.round.country;
    }
    if (over) return summary();
    g.index++;
    ask();
  }

  // ---------- Results ----------

  function summary() {
    const kind = session?.kind || (isDaily ? 'daily' : 'game');
    const scored = kind === 'game' || kind === 'daily' || kind === 'challenge';
    const key = scored ? recordKey(mode, regionLabel, difficulty, hlPreset) : null;
    const finalScore = isHL ? g.bestStreak : g.score;
    const { isRecord, prev } = progress.finishGame(key, finalScore, g.bestStreak);
    window.plausible?.('Game Finished', { props: { mode, kind } });
    const firstTry = g.results.filter((x) => !x.retry);
    const right = firstTry.filter((x) => x.correct).length;
    let lessonFirst = false;
    if (session?.lesson) lessonFirst = progress.lesson(session.lesson.slug, { right, total: firstTry.length }).first;
    queueMedals(evaluate({ type: 'finish', rounds: firstTry.length, misses: g.misses, mode, kind, courseTotal: app.course?.total || 0 }, progress.get(), data, progress.unlock));
    sfx.play('finish');

    if (isDaily) progress.saveDaily(todayUTC(), { score: g.score, grades: g.results.map((x) => x.grade), n: expeditionNumber(todayUTC()) });

    const parts = [];
    if (isHL || mode === 'streak') parts.push(`${right} right before the first miss.`);
    else if (session?.retry) parts.push(`${right} of ${firstTry.length} right first time.`);
    else parts.push(`${right} of ${firstTry.length} right.`);
    if (session?.beat != null) {
      const gap = finalScore - session.beat;
      parts.push(gap > 0 ? `You beat the challenge by ${fmt(gap)}.` : gap === 0 ? `Level with the challenge on ${fmt(session.beat)}.` : `${fmt(-gap)} short of the challenge.`);
    }
    if (g.newlySurveyed) parts.push(`${g.newlySurveyed} new ${g.newlySurveyed === 1 ? 'country' : 'countries'} printed on your map.`);
    if (isRecord && prev) parts.push(`Previous best ${fmt(prev)}.`);
    if (lessonFirst) parts.push('Lesson added to your course.');
    const flagFamily = FLAG_MODES.includes(mode);
    const capFamily = mode === 'capitals' || mode === 'capitalquiz';

    // What comes next: the daily shares, a lesson leads to the next one, a game offers another go.
    const missed = [...new Map(g.results.filter((x) => !x.correct && x.sub !== 'higherlower').map((x) => [x.iso3, x])).values()];
    const canChallenge = (kind === 'game' || kind === 'challenge') && CHALLENGE_MODES.includes(mode) && g.asked.length >= 3;
    const next = session?.next || null;
    let primary;
    if (isDaily) primary = `<button class="btn btn--primary" type="button" data-action="share">${icon.share}Share result</button>`;
    else if (next) primary = `<a class="btn btn--primary" href="${esc(next.href)}">${esc(next.label)}${icon.next}</a>`;
    else primary = `<button class="btn btn--primary" type="button" data-action="again">${icon.replay}${session?.lesson ? 'Repeat lesson' : 'Play again'}</button>`;
    const secondary = [];
    if (missed.length && kind !== 'practice') secondary.push(`<button class="btn" type="button" data-action="practise"><span class="entry__long">Practise ${missed.length === 1 ? 'the one' : `the ${missed.length}`} you missed</span><span class="entry__short">Practise ${missed.length === 1 ? 'the miss' : `${missed.length} misses`}</span></button>`);
    if (session?.lesson && next && !secondary.length) secondary.push(`<button class="btn" type="button" data-action="again">${icon.replay}Repeat</button>`);

    const body = showResults(app, {
      mode,
      before: masteryBefore,
      results: g.results,
      bestStreak: g.bestStreak,
      newlySurveyed: g.newlySurveyed,
      title,
      right: isDaily ? 'Complete' : session?.doneLabel || sideLabel,
      score: finalScore,
      scoreLabel: isHL ? `${fmt(finalScore)} <small>in a row</small>` : `${fmt(finalScore)}${isDaily ? ' <small>/ 5,000</small>' : ''}`,
      isRecord,
      prev,
      line: parts.join(' '),
      primary,
      secondary: secondary.join(''),
      link: canChallenge ? `<button class="linkish challenge-link" type="button" data-action="challenge">${icon.share}Challenge a friend with these ${g.asked.length === 10 ? 'ten' : g.asked.length} countries</button>` : '',
      back: backTo,
      backHref: session?.backHref || (isHL ? '/higher-or-lower/' : flagFamily ? '/flags/' : capFamily ? '/capitals/' : '/'),
      backLabel: session?.backLabel || (isHL || flagFamily || capFamily ? 'Other modes' : 'Sheet index'),
    });
    body.querySelectorAll('[data-action="again"]').forEach((b) => b.addEventListener('click', () => {
      sfx.play('tap');
      app.restart();
    }));
    body.querySelector('[data-action="share"]')?.addEventListener('click', () => app.shareDaily(todayUTC()));
    body.querySelector('[data-action="practise"]')?.addEventListener('click', () => {
      sfx.play('tap');
      app.runSession({
        mode: 'review', region: regionLabel, difficulty: difficulty === 'hard' ? 'normal' : difficulty,
        session: {
          kind: 'practice', title: 'Practice', sideLabel: `${missed.length} missed`, doneLabel: 'Done', mixed: true, untimed: true,
          script: shuffle(missed).map((x) => ({ mode: x.sub, iso3: x.iso3 })),
          next: session?.next || { href: location.pathname + location.search, label: session?.lesson ? 'Repeat lesson' : 'Play again' },
          backHref: session?.backHref || '/', backLabel: session?.backLabel || 'Sheet index',
        },
      });
    });
    body.querySelector('[data-action="challenge"]')?.addEventListener('click', () => {
      const code = encodeChallenge({ difficulty, seed: g.seed, iso3s: g.asked, score: finalScore }, data);
      const url = `${location.origin}${location.pathname}?c=${code}`;
      app.share({
        text: `I scored ${fmt(finalScore)} in ${def.name}${regionLabel === 'World' ? '' : ` · ${regionLabel}`} on World Survey. Same ${g.asked.length} countries for you:`,
        url,
        copied: 'Challenge link copied',
      });
    });
  }

  function queueMedals(list) {
    list.forEach((m, i) =>
      setTimeout(() => {
        app.toastMedal(m);
        sfx.play('achievement');
      }, 900 + i * 900),
    );
  }

  // ---------- Input wiring ----------

  const offPick = globe.on('pick', onPick);
  function onKey(e) {
    if (e.target.matches('input')) return;
    const r = g.round;
    if (g.awaiting && r?.options && /^[1-4]$/.test(e.key)) {
      const o = r.options[Number(e.key) - 1];
      if (o) submitChoice(o.iso3);
    } else if (g.awaiting && r?.input === 'hl' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      submitHL(e.key === 'ArrowUp' ? 'higher' : 'lower');
    } else if (!g.awaiting && g.canAdvance && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      advance();
    } else if (g.auto && e.key !== 'Escape') {
      stopAuto();
    } else if (e.key === 'Escape') {
      go(backTo);
    }
  }
  window.addEventListener('keydown', onKey);

  ask();

  return {
    stop() {
      g.alive = false;
      g.awaiting = false;
      stopAuto();
      cancelAnimationFrame(g.raf);
      offPick();
      app.compass?.clear();
      window.removeEventListener('keydown', onKey);
      globe.setInteractive(false);
    },
  };
}

// Ground size of a country's main landmass in km, from its bbox.
export function countrySpanKm(c) {
  if (!c.bbox) return 400;
  let [x0, y0, x1, y1] = c.bbox;
  if (x0 > x1) x1 += 360;
  const midLat = ((y0 + y1) / 2) * (Math.PI / 180);
  return Math.max((y1 - y0) * 111, (x1 - x0) * 111 * Math.cos(midLat));
}

export function midpoint(a, b) {
  const rad = Math.PI / 180;
  const [la1, lo1] = [a[0] * rad, a[1] * rad];
  const [la2, lo2] = [b[0] * rad, b[1] * rad];
  const x = Math.cos(la1) * Math.cos(lo1) + Math.cos(la2) * Math.cos(lo2);
  const y = Math.cos(la1) * Math.sin(lo1) + Math.cos(la2) * Math.sin(lo2);
  const z = Math.sin(la1) + Math.sin(la2);
  return [Math.atan2(z, Math.hypot(x, y)) / rad, Math.atan2(y, x) / rad];
}
