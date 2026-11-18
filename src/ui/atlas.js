// Atlas: free exploration. Tap any country for its survey card; search by name.
import { progress } from '../game/progress.js';
import { esc, normalise, cardPlaceSize, isNarrow } from './dom.js';
import { factsHtml, slugOf } from './facts.js';

export function startAtlas(app, iso3) {
  const { data, globe, sfx, panel } = app;
  let current = null;
  // The atlas opens in full colour; your survey is one tap away.
  let showSurvey = false;

  globe.idle(false);
  globe.clearMarks();
  globe.setRegionFocus(null);
  globe.setInteractive(true);
  applySurvey();

  function applySurvey() {
    if (showSurvey) app.applySurvey(true);
    else globe.setSurveyed(null);
  }

  function renderIndex() {
    current = null;
    globe.clearHighlights();
    globe.showLabels('auto');
    const visited = Object.keys(progress.get().visited).length;
    panel.render({
      left: 'Atlas',
      right: `${visited} visited`,
      back: '/',
      body: `
        <h2 class="place" style="--place-size:${isNarrow() ? 26 : 32}px">The atlas</h2>
        <p class="hint">Tap any country on the globe, or search for one.</p>
        ${searchHtml()}
        ${toggleHtml()}`,
    });
    wire();
  }

  function searchHtml() {
    return `<div class="typed search"><input id="atlas-q" type="search" autocomplete="off" spellcheck="false" placeholder="Search a country or capital" aria-label="Search a country or capital" aria-controls="suggest"><ul class="suggest" id="suggest" role="listbox" hidden></ul></div>`;
  }

  function toggleHtml() {
    return `<button class="linkish" type="button" data-action="survey">${showSurvey ? 'Show every country in colour' : 'Show my survey'}</button>`;
  }

  function select(iso) {
    const c = data.get(iso);
    if (!c) return;
    current = iso;
    progress.visit(iso);
    globe.clearHighlights();
    globe.highlight(iso, 'focus');
    for (const nb of c.borders || []) globe.highlight(nb, 'neighbour');
    globe.showLabels([{ iso3: iso, text: c.name }, ...(c.borders || []).map((nb) => data.get(nb)).filter(Boolean).map((n) => ({ iso3: n.iso3, text: n.name }))]);
    if (c.capitalLatLng) {
      globe.clearMarks();
      globe.dropPin(c.capitalLatLng, 'capital');
    }
    sfx.play('whoosh', { intensity: 0.4 });
    globe.flyTo({ iso3: iso }, { duration: 1000 });
    history.replaceState(null, '', `/atlas/${slugOf(c.name)}/`);
    document.title = `${c.name} on the globe · World Survey`;

    const s = progress.get();
    const seen = s.seen[iso];
    const m = s.mastery[iso] ?? 0;
    const record = c.sovereign
      ? seen
        ? `You’ve answered it ${seen.right + seen.wrong} ${seen.right + seen.wrong === 1 ? 'time' : 'times'}: ${seen.right} right. ${m > 0 ? 'Surveyed.' : 'Not surveyed yet.'}`
        : 'Not asked yet.'
      : 'Not one of the 195 countries in the game, so it’s never asked.';

    panel.render({
      left: 'Atlas',
      right: c.sovereign ? esc(c.region) : 'Territory',
      back: '/atlas/',
      body: `
        ${m > 0 ? '<span class="stamp">Surveyed</span>' : ''}
        <div class="reveal-head">
          ${c.flag ? `<div class="flag-frame flag-frame--card"><img src="${esc(c.flag)}" alt="Flag of ${esc(c.name)}" width="120" height="90"></div>` : ''}
          <div><h2 class="place" style="--place-size:${cardPlaceSize(c.name, 28)}px">${esc(c.name)}</h2><p class="lede">${esc(c.official && c.official !== c.name ? c.official : c.subregion || '')}</p></div>
        </div>
        ${factsHtml(c, data)}
        <p class="small-print">${record}</p>
        ${searchHtml()}`,
    });
    wire();
  }

  function wire() {
    const body = panel.body();
    body.querySelectorAll('[data-fly]').forEach((b) =>
      b.addEventListener('click', () => {
        sfx.play('tap');
        select(b.dataset.fly);
      }),
    );
    body.querySelector('[data-action="survey"]')?.addEventListener('click', () => {
      showSurvey = !showSurvey;
      sfx.play('tap');
      applySurvey();
      renderIndex();
    });
    const input = body.querySelector('#atlas-q');
    const list = body.querySelector('#suggest');
    if (!input) return;
    const names = data.countries.map((c) => ({ c, n: normalise(c.name), k: normalise(c.capital || '') }));
    let matches = [];
    let sel = 0;
    const draw = () => {
      list.hidden = !matches.length;
      list.innerHTML = matches.map((c, i) => `<li role="option" data-iso="${c.iso3}" aria-selected="${i === sel}">${esc(c.name)}${c.capital ? ` <span class="r-sub">· ${esc(c.capital)}</span>` : ''}</li>`).join('');
    };
    input.addEventListener('input', () => {
      const q = normalise(input.value);
      sel = 0;
      matches = q ? names.filter((x) => x.n.startsWith(q) || x.n.includes(` ${q}`) || x.k.startsWith(q)).slice(0, 6).map((x) => x.c) : [];
      draw();
    });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, matches.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && matches[sel]) { e.preventDefault(); select(matches[sel].iso3); }
    });
    list.addEventListener('pointerdown', (e) => {
      const li = e.target.closest('li');
      if (li) { e.preventDefault(); select(li.dataset.iso); }
    });
  }

  const offPick = globe.on('pick', ({ iso3 }) => {
    if (iso3) {
      sfx.play('pin');
      select(iso3);
    }
  });

  if (iso3 && data.get(iso3)) select(iso3);
  else renderIndex();

  return {
    stop() {
      if (typeof offPick === 'function') offPick();
      globe.setInteractive(false);
    },
  };
}
