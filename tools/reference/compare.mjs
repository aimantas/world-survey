// The /compare/ family: an index and one page per pair of countries that share a land border (comparePairs in
// urls.mjs). Figures, differences, distances and sentences are all computed from the build data.
import { SITE, MIN_RANK_YEAR, esc, int, fixed, people, usd, latLngStr, listAnd, pick } from '../encyclopedia/lib.mjs';
import { needsThe, theName, count, areaStr, placePhrase } from '../encyclopedia/prose.mjs';
import { COMPARE_INDEX, LISTS_INDEX, comparePath, comparePairs, listPath } from './urls.mjs';
import { head, mast, colophon, crumbs, breadcrumbLd, webSite, author, sourcesFooter, srcLink, licLink, ICON } from './chrome.mjs';
import { theRegion, densityStr, timesStr, pctStr, ratioKind, capitalKm, fitDesc } from './data.mjs';

const N = (r, start = false) => esc(theName(r.name, start));
const L = (r, start = false) => {
  const a = `<a href="${r.url}">${esc(r.name)}</a>`;
  return needsThe(r.name) ? `${start ? 'The' : 'the'} ${a}` : a;
};
const num = (s) => `<span class="num">${s}</span>`;
const yr = (y) => (y ? ` <span class="yr">${y}</span>` : '');
const be = (n, one, many) => (n === 1 ? one : many);
const flagImg = (r, w, h, alt = '', lazy = true) => (r.flag ? `<img src="${r.flag}" width="${w}" height="${h}" alt="${esc(alt)}"${lazy ? ' loading="lazy"' : ''}>` : '');

// Numeric rows of the side-by-side table. `times` / `more` finish "2.4 times ..." and "18% ...".
const ROWS = [
  { key: 'population', label: 'Population', src: 'World Bank', fmt: (f) => int(f.value), times: 'as many people', more: 'more people' },
  { key: 'area', label: 'Area', src: 'world-countries', fmt: (f) => areaStr(f.value), times: 'the area', more: 'larger' },
  { key: 'density', label: 'Population density', src: 'population ÷ area', fmt: (f) => `${densityStr(f.value)} per km²`, times: 'as dense', more: 'denser' },
  { key: 'gdp', label: 'GDP', src: 'World Bank, current US$', fmt: (f) => usd(f.value), times: 'as large', more: 'larger' },
  { key: 'gdpPerCapita', label: 'GDP per capita', src: 'World Bank, current US$', fmt: (f) => usd(f.value), times: 'as high', more: 'higher' },
  { key: 'lifeExpectancy', label: 'Life expectancy', src: 'World Bank', fmt: (f) => `${fixed(f.value, 1)} years`, diff: 'years longer' },
  { key: 'neighbours', label: 'Land neighbours', src: 'world-countries', fmt: (f) => `${f.value}`, diff: 'more' },
];

// Which of two figures is larger and by what ratio; null when one is missing or too old to compare.
function versus(A, B, key) {
  const fa = A.m[key], fb = B.m[key];
  if (!fa || !fb || fa.stale || fb.stale) return null;
  const [hi, lo] = fa.value >= fb.value ? [A, B] : [B, A];
  const hv = hi.m[key].value, lv = lo.m[key].value;
  const yh = hi.m[key].year, yl = lo.m[key].year;
  return { hi, lo, hv, lv, yh, yl, r: lv > 0 ? hv / lv : Infinity, d: hv - lv, equal: hv === lv };
}
// "A against B in 2025", or "A in 2025 against B in 2023" when the two years differ.
const against = (vs, fmt) => (vs.yh === vs.yl ? `${fmt(vs.hv)} against ${fmt(vs.lv)}${vs.yh ? ` in ${vs.yh}` : ''}` : `${fmt(vs.hv)} in ${vs.yh} against ${fmt(vs.lv)} in ${vs.yl}`);

export function buildCompare(D, assets, mapper) {
  const { SRC } = D;
  const pairs = comparePairs(D.cj.countries).map((p) => ({ ...p, A: D.byIso.get(p.a.iso3), B: D.byIso.get(p.b.iso3) }));
  const pathOf = (x, o) => comparePath(x.c, o.c);
  const pages = [];
  const stats = [];

  for (const p of pairs) {
    const { A, B } = p;
    const url = p.path;
    const key = `${A.iso3}${B.iso3}`;
    const v = (k, list) => pick(`${key}:${k}`, list);
    const km = capitalKm(A, B);
    const ea = A.e.neighbours.find((n) => n.iso3 === B.iso3) ?? {};
    const shared = A.nbs.filter((o) => B.nbs.includes(o));
    const sharedOther = A.otherAreas.filter((o) => B.otherAreas.some((x) => x.iso3 === o.iso3));
    const sameSub = A.c.subregion && A.c.subregion === B.c.subregion;
    const where = sameSub ? placePhrase(A.c) : A.region === B.region ? theRegion(A.region) : null;
    const capA = esc(A.c.capital), capB = esc(B.c.capital);

    const ar = versus(A, B, 'area'), pr = versus(A, B, 'population');
    stats.push({ p, km, ar, pr, shared });

    // ---------- Sentences ----------
    const s1 = where
      ? v('s1', [
        `${L(A, true)} and ${L(B)} share a land border in ${esc(where)}, and their capitals, ${capA} and ${capB}, are ${int(km)} km apart in a straight line.`,
        `${L(A, true)} and ${L(B)} are neighbours in ${esc(where)}; ${capA} and ${capB}, the two capitals, lie ${int(km)} km apart in a straight line.`,
        `In ${esc(where)}, ${L(A)} and ${L(B)} share a land border, with ${int(km)} km in a straight line between their capitals, ${capA} and ${capB}.`,
      ])
      : `${L(A, true)}, in ${esc(theRegion(A.region))}, and ${L(B)}, in ${esc(theRegion(B.region))}, share a land border; their capitals, ${capA} and ${capB}, are ${int(km)} km apart in a straight line.`;

    const areaFig = `${areaStr(ar.hv)} against ${areaStr(ar.lv)}, ${esc(SRC.wc.short)}`;
    const popFig = pr ? `${against(pr, people)}, World Bank` : '';
    const kindA = ratioKind(ar.r), kindP = pr ? ratioKind(pr.r) : null;
    let s2, noFigures = false;
    if (!pr) {
      const gone = [A, B].filter((r) => !r.m.population || r.m.population.stale);
      noFigures = gone.every((r) => !r.m.gdp && !r.m.gdpPerCapita);
      s2 = `${N(ar.hi, true)} covers ${kindA === 'times' ? `${timesStr(ar.r)} the area of ${N(ar.lo)}` : `${pctStr(ar.r)} more area than ${N(ar.lo)}`} (${areaFig}). The World Bank publishes no population ${noFigures ? 'or GDP figures' : 'figure'} for ${listAnd(gone.map((r) => N(r)))}, so the two cannot be compared on people${noFigures ? ', density or economy' : ' or density'}.`;
    } else if (ar.hi === pr.hi) {
      const aPart = kindA === 'times' ? `${timesStr(ar.r)} the area` : kindA === 'pct' ? `${pctStr(ar.r)} more area` : 'the same area';
      const pPart = kindP === 'times' ? `${timesStr(pr.r)} the population` : kindP === 'pct' ? `${pctStr(pr.r)} more people` : 'the same population';
      s2 = v('s2', [
        `${N(ar.hi, true)} is the larger of the two on both counts, with ${aPart} (${areaFig}) and ${pPart} (${popFig}).`,
        `${N(ar.hi, true)} is both bigger and more populous: ${aPart} (${areaFig}) and ${pPart} (${popFig}).`,
      ]);
    } else {
      s2 = `${N(ar.hi, true)} covers ${kindA === 'times' ? `${timesStr(ar.r)} the area of ${N(ar.lo)}` : `${pctStr(ar.r)} more area than ${N(ar.lo)}`} (${areaFig}), but ${N(pr.hi)} has ${kindP === 'times' ? `${timesStr(pr.r)} as many people` : `${pctStr(pr.r)} more people`}: ${against(pr, people)} (World Bank).`;
    }

    // Economy: the wider of the two gaps, or a plain statement of why there is no comparison.
    const pc = versus(A, B, 'gdpPerCapita'), gd = versus(A, B, 'gdp');
    let s3 = '';
    if (pc || gd) {
      const usePc = pc && (!gd || Math.log(pc.r) >= Math.log(gd.r) * 0.8);
      if (usePc) {
        const k = ratioKind(pc.r), fig = `${against(pc, usd)} (World Bank, current US$)`;
        s3 = k === 'times' ? `GDP per capita in ${N(pc.hi)} is ${timesStr(pc.r)} that of ${N(pc.lo)}: ${fig}.`
          : k === 'pct' ? `GDP per capita is ${pctStr(pc.r)} higher in ${N(pc.hi)}: ${fig}.`
            : `GDP per capita is the same in both: ${fig}.`;
      } else {
        const k = ratioKind(gd.r), fig = `a GDP of ${against(gd, usd)} (World Bank, current US$)`;
        s3 = k === 'times' ? `The economy of ${N(gd.hi)} is ${timesStr(gd.r)} the size of that of ${N(gd.lo)}: ${fig}.`
          : `${N(gd.hi, true)} has the larger economy by ${pctStr(gd.r)}: ${fig}.`;
      }
    } else if (!noFigures) {
      const notes = [A, B].map((r) => {
        const f = r.m.gdp;
        if (!f) return `The World Bank publishes no GDP figure for ${N(r)}.`;
        if (f.stale) return `The latest World Bank GDP figure for ${N(r)} is from ${f.year}, too old to compare here.`;
        return '';
      }).filter(Boolean);
      s3 = notes.join(' ');
    }

    // One more fact where the gap is worth a sentence: life expectancy or density.
    const le = versus(A, B, 'lifeExpectancy'), de = versus(A, B, 'density');
    const leScore = le ? le.d / 4 : 0, deScore = de ? Math.log(de.r) * 0.6 : 0;
    let s4 = '';
    if (Math.max(leScore, deScore) >= 0.25) {
      if (leScore >= deScore) s4 = `Life expectancy at birth is ${fixed(le.d, 1)} years longer in ${N(le.hi)}: ${against(le, (x) => `${fixed(x, 1)} years`)} (World Bank).`;
      else s4 = `${N(de.hi, true)} is ${ratioKind(de.r) === 'times' ? `${timesStr(de.r)} as densely populated` : `${pctStr(de.r)} more densely populated`}, with ${densityStr(de.hv)} people per km² against ${densityStr(de.lv)}.`;
    }

    const otherTxt = sharedOther.length ? `${listAnd(sharedOther.map((o) => esc(o.name)))}, which ${be(sharedOther.length, 'is', 'are')} not among the 195 countries of this atlas` : '';
    let s5;
    if (A.nbs.length === 1 && B.nbs.length === 1) s5 = 'Each is the only land neighbour of the other.';
    else if (A.nbs.length === 1 || B.nbs.length === 1) {
      const [single, other] = A.nbs.length === 1 ? [A, B] : [B, A];
      s5 = `${N(other, true)} is the only land neighbour of ${N(single)}; ${N(other)} itself borders ${count(other.nbs.length)} countries.`;
    } else if (shared.length) {
      s5 = `Both also border ${listAnd(shared.map((o) => L(o)))}${otherTxt ? `, and ${otherTxt}` : ''}.`;
    } else {
      s5 = otherTxt
        ? `Both also border ${otherTxt}; among the 195 they have no other neighbour in common.`
        : `They have no other neighbour in common: ${N(A)} also borders ${count(A.nbs.length - 1)} other ${be(A.nbs.length - 1, 'country', 'countries')} and ${N(B)} ${count(B.nbs.length - 1)}.`;
    }
    const paras = [[s1, s2].join(' '), [s3, s4, s5].filter(Boolean).join(' ')];

    // Borders that need a word of explanation (same cases as on the country pages).
    const notes = [];
    if (ea.inGeometry === false) notes.push(`The ${esc(SRC.wc.short)} data lists a land border between ${N(A)} and ${N(B)}; the 1:50m outlines drawn on this map do not show one.`);
    if (ea.viaOutlyingSelf) notes.push(`The border lies on a part of ${N(A)} away from its main landmass.`);
    if (ea.viaOutlyingOther) notes.push(`The border lies on a part of ${N(B)} away from its main landmass.`);

    // ---------- Table ----------
    const rowHtml = ROWS.map((row) => {
      const fa = A.m[row.key], fb = B.m[row.key], vs = versus(A, B, row.key);
      const fig = (r, f) => {
        const big = vs && !vs.equal && vs.hi === r ? ' class="big"' : '';
        return `<td${big} data-label="${esc(r.name)}">${f ? `${num(row.fmt(f))}${yr(f.year)}` : '<span class="nd">no data</span>'}</td>`;
      };
      let d;
      if (!fa || !fb) d = `<span class="nd">no figure for ${listAnd([A, B].filter((r) => !r.m[row.key]).map((r) => N(r)))}</span>`;
      else if (!vs) d = `<span class="nd">not compared: the figure for ${listAnd([A, B].filter((r) => r.m[row.key].stale).map((r) => `${N(r)} is from ${r.m[row.key].year}`))}</span>`;
      else if (vs.equal) d = '<span class="who">Equal</span>';
      else if (row.diff) d = `<span class="who">${esc(vs.hi.name)}</span><span class="by">${row.key === 'neighbours' ? vs.d : fixed(vs.d, 1)} ${row.diff}</span>`;
      else {
        const k = ratioKind(vs.r);
        d = k === 'equal' ? '<span class="who">About equal</span>' : `<span class="who">${esc(vs.hi.name)}</span><span class="by">${k === 'times' ? `${timesStr(vs.r)} ${row.times}` : `${pctStr(vs.r)} ${row.more}`}</span>`;
      }
      if (vs && fa.year !== fb.year) d += `<span class="by">years differ: ${fa.year} and ${fb.year}</span>`;
      return `<tr><th scope="row">${row.label}<span class="src">${esc(row.src === 'world-countries' ? SRC.wc.short : row.src)}</span></th>${fig(A, fa)}${fig(B, fb)}<td class="d">${d}</td></tr>`;
    }).join('\n');
    const langs = (r) => (r.c.languages.length ? esc(r.c.languages.join(', ')) : '—');
    const curs = (r) => (r.e.currencies.length ? r.e.currencies.map((x) => `${esc(x.name)} <span class="num">(${esc(x.code)})</span>`).join(', ') : '—');
    const commonLang = A.c.languages.filter((l) => B.c.languages.includes(l));
    const commonCur = A.e.currencies.filter((x) => B.e.currencies.some((o) => o.code === x.code));
    const textRow = (label, src, a, b, d) => `<tr><th scope="row">${label}<span class="src">${esc(src)}</span></th><td class="txt" data-label="${esc(A.name)}">${a}</td><td class="txt" data-label="${esc(B.name)}">${b}</td><td class="d">${d}</td></tr>`;
    const textRows = [
      textRow('Capital', SRC.wc.short, capA, capB, `<span class="who">${num(`${int(km)} km`)}</span><span class="by">apart, in a straight line</span>`),
      textRow('Languages', SRC.wc.short, langs(A), langs(B), commonLang.length ? `<span class="who">In common</span><span class="by">${esc(listAnd(commonLang))}</span>` : '<span class="nd">none in common</span>'),
      textRow('Currency', SRC.wc.short, curs(A), curs(B), commonCur.length ? `<span class="who">In common</span><span class="by">${esc(listAnd(commonCur.map((x) => x.name)))}</span>` : '<span class="nd">none in common</span>'),
    ].join('\n');

    // ---------- Head ----------
    const pairName = `${A.name} vs ${B.name}`;
    const title = [': size, population and economy · World Survey', ': size and population · World Survey', ' compared · World Survey', ' · World Survey', '']
      .map((t) => `${pairName}${t}`).find((t) => t.length <= 60) ?? pairName;
    const pa = A.m.population ? `${people(A.m.population.value)} people, ` : '', pb = B.m.population ? `${people(B.m.population.value)} people, ` : '';
    const who = `${A.name} (${pa}${areaStr(A.c.area)}) and ${B.name} (${pb}${areaStr(B.c.area)})`;
    // Promise World Bank comparisons only when both countries have the figures.
    const full = pr && (pc || gd) && le;
    const desc = fitDesc(url,
      ...(full ? [
        `${who} compared: GDP, density, life expectancy, capitals ${int(km)} km apart and shared neighbours.`,
        `${who} compared: GDP, density, life expectancy and capitals ${int(km)} km apart.`,
      ] : [
        `${who} compared: area, capitals ${int(km)} km apart, languages, currency and the figures the World Bank publishes.`,
        `${who} compared: area, capitals ${int(km)} km apart, languages and currency.`,
      ]),
      `${who} compared side by side, with years and sources.`,
      `${A.name} (${areaStr(A.c.area)}) and ${B.name} (${areaStr(B.c.area)}) compared: population, GDP and capitals ${int(km)} km apart.`,
      `${A.name} and ${B.name} compared: ${areaStr(A.c.area)} against ${areaStr(B.c.area)}, capitals ${int(km)} km apart.`);
    const crumbItems = [['World Survey', '/'], ['Compare', COMPARE_INDEX], [`${A.name} and ${B.name}`, url]];
    const jsonld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', '@id': SITE + url, url: SITE + url, name: title, description: desc, inLanguage: 'en', dateModified: D.generated, isPartOf: webSite, author, about: [{ '@id': `${SITE}${A.url}#country` }, { '@id': `${SITE}${B.url}#country` }] },
        breadcrumbLd(crumbItems),
      ],
    };

    // ---------- Map ----------
    let figure = '';
    if (mapper) {
      const map = mapper.pairMap(A.c, B.c, shared.map((o) => o.iso3));
      const ringed = [A, B].filter((r) => r.c.tiny || !r.c.inMap);
      figure = `<figure class="figure" id="map"><div class="frame">${map.svg}</div><figcaption>${N(A, true)} and ${N(B)} hatched in opposite directions${ringed.length ? `, ${listAnd(ringed.map((r) => N(r)))} ringed` : ''}; ${capA} and ${capB} marked with triangles and joined by a dashed line${shared.length ? '; countries that border both are shaded' : ''}. Orthographic projection centred on <b>${latLngStr([map.centre[1], map.centre[0]])}</b>; the scale bar is true at that point.</figcaption>${notes.length ? `<p class="note">${notes.join(' ')}</p>` : ''}</figure>`;
    } else if (notes.length) figure = `<p class="note">${notes.join(' ')}</p>`;

    // ---------- Links ----------
    // Who leads on a measure; "not compared" when a figure is too old, "no data" when one is missing.
    const lead = (f, k) => (f && !f.equal ? esc(f.hi.name) : f ? 'Equal' : `<span class="nd">${A.m[k] && B.m[k] ? 'not compared' : 'no data'}</span>`);
    const facts = [
      ['Capitals apart', num(`${int(km)} km`)],
      ['Shared neighbours', num(shared.length)],
      ['Larger area', lead(ar, 'area')],
      ['More people', lead(pr, 'population')],
      ['Larger economy', lead(gd, 'gdp')],
      ['Longer life expectancy', lead(le, 'lifeExpectancy')],
    ];
    const others = (x, o) => x.nbs.filter((n) => n !== o);
    const otherBlock = (x, o) => {
      const list = others(x, o);
      if (!list.length) return `<h3 class="also">${N(x, true)} has no other land neighbour</h3>`;
      return `<h3 class="also">${N(x, true)} compared with its other ${be(list.length, 'neighbour', 'neighbours')}</h3><ul class="clist">${list.map((n) => `<li><a href="${pathOf(x, n)}">${flagImg(n, 28, 21)}<span>${esc(n.name)}</span></a></li>`).join('')}</ul>`;
    };
    const sharedHtml = shared.length
      ? `<section class="section measure" id="shared"><h2>Shared neighbours <small>${shared.length} ${be(shared.length, 'country borders', 'countries border')} both</small></h2><ul class="pairs">${shared.map((o) => `<li>${flagImg(o, 28, 21)}<span class="name"><a href="${o.url}">${esc(o.name)}</a></span><span class="vsl">compare with <a href="${pathOf(o, A)}">${esc(A.name)}</a> or <a href="${pathOf(o, B)}">${esc(B.name)}</a></span></li>`).join('')}</ul></section>`
      : '';

    const sources = [
      mapper ? `Boundaries and map: ${srcLink(SRC.ne)} 1:50m Admin 0 Countries via world-atlas <span>(public domain; packaging ISC)</span>.` : '',
      `Names, area, land borders, languages, currencies and capitals: ${srcLink(SRC.wc)} ${licLink(SRC.wc)}.`,
      `Capital positions: Natural Earth 1:10m populated places <span>(public domain)</span>${[A, B].some((r) => D.wikidataCapitals.has(r.iso3)) ? '; Wikidata <span>(CC0 1.0)</span>' : ''}.`,
      [A, B].some((r) => r.m.population || r.m.gdp || r.m.lifeExpectancy)
        ? `Population, GDP, GDP per capita and life expectancy: ${srcLink(SRC.wb)}, latest value per country, with the year beside each figure ${licLink(SRC.wb)}. Figures older than ${MIN_RANK_YEAR} are shown but not compared.`
        : '',
      `Flags: ${srcLink(SRC.flags)} <span>(${esc(SRC.flags.licence)})</span>.`,
      `Retrieved ${D.retrieved}. Density, differences, the distance between the capitals (great circle) and the shared neighbours are computed by World Survey from these sources.`,
    ];

    const body = `
${mast(COMPARE_INDEX)}
<main class="page">
${crumbs(crumbItems)}
<header class="block title">
<div class="tb-head"><span>Comparison · land neighbours</span><span>${esc(A.iso3)} · ${esc(B.iso3)}</span></div>
<div class="tb-body"><h1 class="pair">${N(A, true)} <i>and</i> ${N(B)} <i>compared</i></h1><p class="deck">${where ? `Two neighbours in ${esc(where)}` : `Neighbours across ${esc(theRegion(A.region))} and ${esc(theRegion(B.region))}`}: people, land, economy and capitals side by side</p></div>
<div class="tb-duo">${[A, B].map((r) => `<a href="${r.url}">${flagImg(r, 72, 54, `Flag of ${theName(r.name)}`, false)}<b>${esc(r.name)}</b><span>Capital: ${esc(r.c.capital)}</span></a>`).join('')}</div>
</header>
<div class="grid grid--ref">
${figure}
<section class="prose measure" aria-label="${esc(A.name)} and ${esc(B.name)}">${paras.map((t, k) => `<p${k === 0 ? ' class="lead"' : ''}>${t}</p>`).join('')}</section>
<aside class="side block" aria-label="At a glance">
<div class="tb-head"><span>At a glance</span><span>${esc(A.iso3)} · ${esc(B.iso3)}</span></div>
<div class="tb-body">
<div class="actions"><a class="btn btn--go" href="/higher-or-lower/neighbours/">${ICON.play}Play Higher or lower: neighbours</a><a class="btn" href="/atlas/${A.slug}/">${ICON.globe}Find ${N(A)} on the globe</a><a class="btn" href="/atlas/${B.slug}/">${ICON.globe}Find ${N(B)} on the globe</a></div>
<dl class="facts">${facts.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join('')}</dl>
</div>
</aside>
<section class="section" id="figures"><h2>Side by side <small>larger figure in bold</small></h2>
<div class="table-wrap"><table class="ruled vs"><caption>World Bank figures are the latest for each country, with the year beside each one; a figure older than ${MIN_RANK_YEAR} is shown but not compared. Area, land neighbours, capitals, languages and currencies: ${esc(SRC.wc.short)}, which gives no year. Density is population divided by area.</caption>
<thead><tr><th scope="col">Measure</th><th scope="col" class="c">${esc(A.name)}</th><th scope="col" class="c">${esc(B.name)}</th><th scope="col">Difference</th></tr></thead>
<tbody>
${rowHtml}
${textRows}
</tbody></table></div></section>
${sharedHtml}
<nav class="section" aria-label="More comparisons"><h2>More comparisons <small><a href="${COMPARE_INDEX}">all ${pairs.length} pairs</a></small></h2>
${otherBlock(A, B)}
${otherBlock(B, A)}
<div class="actions actions--after"><div class="btn-pair"><a class="btn" href="${A.url}">${ICON.flag}${esc(A.name)}: full country page</a><a class="btn" href="${B.url}">${ICON.flag}${esc(B.name)}: full country page</a></div></div>
</nav>
${sourcesFooter(sources)}
</div>
</main>
${colophon}`;
    pages.push({ url, title, desc, kind: 'compare', html: head({ title, desc, url, jsonld, type: 'article', assets }) + body });
  }

  // ---------- /compare/ ----------
  {
    const url = COMPARE_INDEX;
    const withNbs = D.recs.filter((r) => r.nbs.length);
    const title = `Compare countries: ${pairs.length} pairs of neighbours · World Survey`;
    const byPop = stats.filter((s) => s.pr).sort((a, b) => b.pr.r - a.pr.r);
    const byArea = [...stats].sort((a, b) => b.ar.r - a.ar.r);
    const byKm = [...stats].sort((a, b) => a.km - b.km);
    const lop = byPop[0], even = byPop.at(-1), wide = byArea[0], near = byKm[0], far = byKm.at(-1);
    const link = (s, text) => `<a href="${s.p.path}">${text}</a>`;
    const both = (s) => `${esc(s.p.A.name)} and ${esc(s.p.B.name)}`;
    const desc = fitDesc(url, `Side-by-side comparisons of all ${pairs.length} pairs of countries that share a land border: population, area, GDP, life expectancy and the distance between capitals.`);
    const crumbItems = [['World Survey', '/'], ['Compare', url]];
    const jsonld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', '@id': SITE + url, url: SITE + url, name: title, description: desc, inLanguage: 'en', dateModified: D.generated, isPartOf: webSite, author },
        breadcrumbLd(crumbItems),
        { '@type': 'ItemList', name: 'Comparisons of neighbouring countries', numberOfItems: pairs.length, itemListElement: pairs.slice(0, 10).map((p, i) => ({ '@type': 'ListItem', position: i + 1, name: `${p.A.name} and ${p.B.name} compared`, url: SITE + p.path })) },
      ],
    };
    const paras = [
      `Every pair of countries that share a land border has its own comparison: ${pairs.length} pairs among the ${withNbs.length} countries with at least one land neighbour. Each page sets the two side by side on population, area, density, GDP, GDP per capita and life expectancy, with the year and source of every figure, a map of both and the distance between their capitals.`,
      `The most lopsided pair by population is ${link(lop, both(lop))}: ${N(lop.pr.hi)} has ${timesStr(lop.pr.r)} as many people (${against(lop.pr, people)}, World Bank). The closest match is ${link(even, both(even))}, ${ratioKind(even.pr.r) === 'equal' ? 'level' : `${pctStr(even.pr.r)} apart`}. By area the widest gap is ${link(wide, both(wide))}, at ${timesStr(wide.ar.r)}.`,
      `The two capitals closest together are ${esc(near.p.A.c.capital)} and ${esc(near.p.B.c.capital)} (${link(near, both(near))}), ${near.km < 10 ? fixed(near.km, 0) : int(near.km)} km apart; the farthest apart are ${esc(far.p.A.c.capital)} and ${esc(far.p.B.c.capital)} (${link(far, both(far))}), at ${int(far.km)} km in a straight line.`,
    ];
    const rows = withNbs.map((r) => `<li>${flagImg(r, 28, 21)}<span class="name"><a href="${r.url}">${esc(r.name)}</a></span><span class="vsl">vs ${r.nbs.map((n) => `<a href="${pathOf(r, n)}">${esc(n.name)}</a>`).join(' · ')}</span></li>`).join('\n');
    const body = `
${mast(url)}
<main class="page">
${crumbs(crumbItems)}
<header class="block title">
<div class="tb-head"><span>Comparison index · ${pairs.length} pairs</span><span>${withNbs.length} countries</span></div>
<div class="tb-body"><h1 class="list">Compare neighbouring countries</h1><p class="deck">Two countries that share a border, side by side: people, land, economy and capitals</p></div>
<dl class="tb-cells"><div><dt>Pairs</dt><dd>${pairs.length}</dd></div><div><dt>Countries with a land neighbour</dt><dd>${withNbs.length} <small>of ${D.recs.length}</small></dd></div><div><dt>Closest capitals</dt><dd>${near.km < 10 ? fixed(near.km, 0) : int(near.km)} km</dd></div><div><dt>Farthest capitals</dt><dd>${int(far.km)} km</dd></div></dl>
</header>
<div class="grid grid--ref">
<section class="prose measure wide">${paras.map((t, k) => `<p${k === 0 ? ' class="lead"' : ''}>${t}</p>`).join('')}
<div class="actions actions--after"><a class="btn btn--go" href="/higher-or-lower/neighbours/">${ICON.play}Play Higher or lower: neighbours</a><div class="btn-pair"><a class="btn" href="${listPath('countries-by-number-of-neighbours')}">${ICON.flag}Countries by number of neighbours</a><a class="btn" href="${LISTS_INDEX}">${ICON.globe}All lists</a></div></div></section>
<section class="section wide" id="pairs"><h2>All comparisons <small>by country, A–Z</small></h2>
<ul class="pairs pairs--cols">
${rows}
</ul></section>
${sourcesFooter([
    `Land borders, names and area: ${srcLink(SRC.wc)} ${licLink(SRC.wc)}.`,
    `Population, GDP, GDP per capita and life expectancy: ${srcLink(SRC.wb)}, latest value per country ${licLink(SRC.wb)}.`,
    `Flags: ${srcLink(SRC.flags)} <span>(${esc(SRC.flags.licence)})</span>.`,
    `Retrieved ${D.retrieved}. Ratios and distances are computed by World Survey from these sources.`,
  ])}
</div>
</main>
${colophon}`;
    pages.unshift({ url, title, desc, kind: 'compare-index', html: head({ title, desc, url, jsonld, assets }) + body });
  }
  return pages;
}
