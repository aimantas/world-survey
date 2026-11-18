// The survey card's fact list. Every number names its year; unknown values print as a dash.
import { compact } from '../game/questions.js';
import { esc } from './dom.js';

const num = (v, unit = '') => (v == null ? '—' : `<span class="num">${compact(v)}${unit}</span>`);
const yr = (y, src = 'World Bank') => (y ? ` <span class="yr">${y}, ${src}</span>` : '');

// Matches the encyclopedia generator's slug rule exactly.
export const slugOf = (name) =>
  name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function entryLink(c) {
  if (!c.sovereign) return '';
  return `<a class="linkish entry" href="/countries/${slugOf(c.name)}/" title="Read the ${esc(c.name)} entry">Country page</a>`;
}

export function factsHtml(c, data, { neighbours = true } = {}) {
  const nb = (c.borders || []).map((iso) => data.get(iso)).filter(Boolean);
  // Count sovereign neighbours only; territories and regions are listed but not counted.
  const states = nb.filter((n) => n.sovereign).length;
  const others = nb.length - states;
  const label = !nb.length ? 'Borders'
    : `Borders ${states === 1 ? 'one country' : `${states} countries`}${others ? ` and ${others === 1 ? 'one territory' : `${others} territories`}` : ''}`;
  const rows = [
    ['Capital', esc(c.capital || '—')],
    ['Population', `${num(c.population)}${yr(c.populationYear)}`],
    ['Area', c.area == null ? '—' : `<span class="num">${Math.round(c.area).toLocaleString('en-GB')} km²</span>`],
    ['Life expectancy', c.lifeExpectancy == null ? '—' : `<span class="num">${c.lifeExpectancy.toFixed(1)} years</span>${yr(c.lifeExpectancyYear)}`],
  ];
  if (c.gdp != null) rows.push(['GDP', `<span class="num">$${compact(c.gdp)}</span>${yr(c.gdpYear)}`]);
  if (c.languages?.length) rows.push(['Languages', esc(c.languages.slice(0, 3).join(', '))]);
  // On phones, life expectancy, GDP and languages fold behind "More facts" to keep the reveal short.
  const items = rows.map(([k, v], i) => `<div${i > 2 ? ' class="opt-fact"' : ''}><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  const nbHtml = neighbours
    ? `<div class="wide"><dt>${label}</dt><dd>${
        nb.length
          ? `<div class="chips">${nb.map((n) => `<button class="chip" type="button" data-fly="${n.iso3}">${esc(n.name)}</button>`).join('')}</div>`
          : c.island ? (c.sovereign ? 'None. It’s an island nation.' : 'None. It’s an island.') : 'No land borders.'
      }</dd></div>`
    : '';
  return `<dl class="facts">${items}${nbHtml}</dl><button class="linkish more-facts" type="button" data-action="more-facts" aria-expanded="false">More facts</button>`;
}
