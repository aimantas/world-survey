// The results sheet: a survey report with a rank stamp, the round list and the route drawn on the globe.
import { MODES } from '../game/modes.js';
import { STATS } from '../game/questions.js';
import { distanceKm, formatKm } from '../game/geo.js';
import { progress } from '../game/progress.js';
import { esc, fmt, markSvg } from './dom.js';

const RANKS = ['Apprentice', 'Field assistant', 'Surveyor', 'Senior surveyor', 'Chief cartographer'];

export function rankFor({ mode, results, bestStreak, count }) {
  let level;
  if (mode === 'flagblitz') level = [6, 12, 20, 30].filter((n) => count >= n).length;
  else if (mode === 'higherlower' || mode === 'streak') level = [3, 8, 15, 25].filter((n) => bestStreak >= n).length;
  else {
    const acc = results.length ? results.filter((r) => r.correct).length / results.length : 0;
    level = [0.4, 0.6, 0.8, 1].filter((t) => acc >= t).length;
  }
  return { level, name: RANKS[level] };
}

export function showResults(app, o) {
  const { globe, panel, data, sfx } = app;
  const { mode, results } = o;
  const rank = rankFor({ mode, results, bestStreak: o.bestStreak, count: o.count });

  // The route: every round's country lit on the globe, joined in the order you played them.
  globe.clearMarks();
  globe.clearHighlights();
  globe.showLabels(null);
  const stops = results.map((r) => data.get(r.iso3)).filter((c) => c?.labelLatLng);
  for (const r of results) globe.highlight(r.iso3, r.correct ? 'correct' : 'wrong');
  // Join neighbouring stops only: long hops arc off the disc and clutter the sheet.
  if (mode !== 'flagblitz') {
    stops.slice(0, 12).forEach((c, i) => {
      if (i > 0 && distanceKm(stops[i - 1].labelLatLng, c.labelLatLng) < 4500) {
        setTimeout(() => globe.drawArc(stops[i - 1].labelLatLng, c.labelLatLng, { duration: 380 }), 260 + i * 140);
      }
    });
  }
  // Print the map: start from how it looked before the game, then let the new countries colour in.
  // Each newly surveyed country prints in turn, in the order you played them.
  const before = { ...(o.before || {}) };
  globe.setSurveyed(before, { animate: false });
  const after = progress.get().mastery;
  const order = [...new Set(results.map((r) => r.iso3))].filter((iso) => (after[iso] ?? 0) !== (before[iso] ?? 0));
  const map = { ...before };
  order.forEach((iso, i) => setTimeout(() => { map[iso] = after[iso]; globe.setSurveyed({ ...map }, { animate: true }); }, 650 + i * 160));
  // Face the part of the world you played in.
  if (stops.length) {
    let x = 0, y = 0, z = 0;
    for (const c of stops) {
      const la = (c.labelLatLng[0] * Math.PI) / 180;
      const lo = (c.labelLatLng[1] * Math.PI) / 180;
      x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
    }
    const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
    const lng = (Math.atan2(y, x) * 180) / Math.PI;
    globe.flyTo({ latLng: [Math.max(-50, Math.min(60, lat)), lng], distance: globe.overviewDistance() }, { duration: 1200 });
  } else globe.overview({ duration: 1200 });

  const times = results.map((r) => r.ms).filter((ms) => ms != null && ms < 60000);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
  const kms = results.map((r) => r.km).filter((k) => k != null && k > 0);
  const extra = [];
  if (kms.length) extra.push(`${mode === 'capitals' ? 'Average distance' : 'Average miss'} ${formatKm(kms.reduce((a, b) => a + b, 0) / kms.length).replace(' ', '\u00a0')}.`);
  else if (avg != null) extra.push(`Average answer ${(avg / 1000).toFixed(1)} s.`);
  if (o.bestStreak >= 2 && mode !== 'higherlower') extra.push(`Best streak ${fmt(o.bestStreak)}.`);

  const rows = results
    .map((x) => {
      const c = data.get(x.iso3);
      const sub = x.sub === 'higherlower' ? `${STATS[x.stat].label} vs ${esc(data.get(x.other)?.name || '')}` : MODES[x.sub]?.name || '';
      const flag = c.flag ? `<img class="r-flag" src="${esc(c.flag)}" alt="" width="28" height="21" loading="lazy">` : '<span class="r-flag"></span>';
      const pts = x.sub === 'higherlower' || mode === 'flagblitz' ? '' : `+${fmt(x.points)}`;
      return `<li><button type="button" data-fly="${x.iso3}">${markSvg(x.grade)}${flag}<span>${esc(c.name)} <span class="r-sub">· ${sub}${x.retry ? ' · second try' : ''}${x.km ? ` · ${formatKm(x.km)}` : ''}</span></span><span class="r-pts">${pts}</span></button></li>`;
    })
    .join('');

  panel.render({
    left: o.title,
    right: o.right,
    back: o.back || '/',
    tone: 'results',
    body: `
      <span class="stamp stamp--rank stamp--r${rank.level}">${rank.name}</span>
      <div class="summary-score"><div class="points points--hero" data-count="${o.score}">${o.scoreLabel}</div>${o.isRecord && o.prev ? '<span class="record-flag">New best</span>' : ''}</div>
      <p class="verdict">${o.line} ${extra.join(' ')}</p>
      <ul class="rounds">${rows}</ul>
      ${o.link ? `<p class="results-link">${o.link}</p>` : ''}
      <div class="btn-row btn-row--sticky">
        ${o.primary}${o.secondary || ''}
        <a class="btn" href="${o.backHref || '/'}">${o.backLabel || 'Sheet index'}</a>
      </div>`,
  });

  // Count the hero score up from zero.
  const hero = panel.body().querySelector('.points--hero');
  const target = Number(hero?.dataset.count || 0);
  if (hero && target > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const label = o.scoreLabel;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 900);
      const e = 1 - Math.pow(1 - k, 4);
      hero.textContent = k < 1 ? fmt(target * e) : '';
      if (k < 1) requestAnimationFrame(step);
      else hero.innerHTML = label;
    };
    requestAnimationFrame(step);
  }

  panel.body().querySelectorAll('[data-fly]').forEach((b) =>
    b.addEventListener('click', () => {
      sfx.play('tap');
      globe.flyTo({ iso3: b.dataset.fly }, { duration: 900 });
      globe.showLabels([{ iso3: b.dataset.fly, text: data.get(b.dataset.fly).name }]);
    }),
  );
  return panel.body();
}

