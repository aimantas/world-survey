// The /lists/ family: an index and one page per entry in LISTS (urls.mjs). Every sentence and figure is
// computed from data/countries.json and data/encyclopedia.json at build time; nothing is typed in by hand.
import { SITE, MIN_RANK_YEAR, REGIONS, esc, int, fixed, ordinal, people, usd, latStr, lngStr, listAnd, distanceKm } from '../encyclopedia/lib.mjs';
import { needsThe, areaStr } from '../encyclopedia/prose.mjs';
import { LISTS, LISTS_INDEX, COMPARE_INDEX, listPath, comparePath } from './urls.mjs';
import { head, mast, colophon, crumbs, breadcrumbLd, webSite, author, sourcesFooter, srcLink, licLink, ICON } from './chrome.mjs';
import { theRegion, densityStr, areaNum, yearsOf, sum, median, timesStr, pctStr, ratioKind, fitDesc } from './data.mjs';

const WB_INDICATOR = {
  population: ['SP.POP.TOTL', 'Population, total'],
  gdp: ['NY.GDP.MKTP.CD', 'GDP (current US$)'],
  gdpPerCapita: ['NY.GDP.PCAP.CD', 'GDP per capita (current US$)'],
  lifeExpectancy: ['SP.DYN.LE00.IN', 'Life expectancy at birth, total (years)'],
};
const indicatorUrl = (code) => `https://data.worldbank.org/indicator/${code}`;

// A country name as a link, with its article where English wants one ("the Netherlands").
const L = (r, start = false) => {
  const a = `<a href="${r.url}">${esc(r.name)}</a>`;
  return needsThe(r.name) ? `${start ? 'The' : 'the'} ${a}` : a;
};
const names = (list, start = false) => listAnd(list.map((r, i) => L(r, start && i === 0)));
const plain = (r, start = false) => (needsThe(r.name) ? `${start ? 'The' : 'the'} ${r.name}` : r.name);
const flagImg = (r, w = 24, h = 18, alt = '') => (r.flag ? `<img src="${r.flag}" width="${w}" height="${h}" alt="${esc(alt)}" loading="lazy">` : '');
const num = (s) => `<span class="num">${s}</span>`;
const yr = (y) => (y ? ` <span class="yr">${y}</span>` : '');
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const be = (n, one, many) => (n === 1 ? one : many);
const nCountries = (n) => `${n} ${n === 1 ? 'country' : 'countries'}`;

export function buildLists(D, assets) {
  const { recs, SRC } = D;
  const listBySlug = new Map(LISTS.map((l) => [l.slug, l]));
  const pages = [];
  const index = []; // one row per list for /lists/

  const ranked = (key) => recs.filter((r) => r.m[key] && !r.m[key].stale)
    .sort((a, b) => a.rank[key] - b.rank[key] || b.m[key].value - a.m[key].value || a.name.localeCompare(b.name, 'en'));
  const staleOf = (key) => recs.filter((r) => r.m[key]?.stale).sort((a, b) => b.m[key].value - a.m[key].value);
  const missingOf = (key) => recs.filter((r) => !r.m[key]);
  const v = (r, key) => r.m[key].value;
  const y = (r, key) => r.m[key].year;
  const regionCounts = (list) => REGIONS.map((reg) => [reg, list.filter((r) => r.region === reg).length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1] || REGIONS.indexOf(a[0]) - REGIONS.indexOf(b[0]));
  const byRegionText = (list) => listAnd(regionCounts(list).map(([reg, n]) => `${n} in ${theRegion(reg)}`));

  // ---------- Shared furniture ----------

  const otherLists = (current) => `<ul class="lnav">${LISTS.map((l) => `<li><a href="${listPath(l.slug)}"${l.slug === current ? ' aria-current="page"' : ''}>${esc(l.label)}</a></li>`).join('')}</ul>`;
  const sideCard = (current) => `<aside class="side block" aria-label="More lists">
<div class="tb-head"><span>More lists</span><span>${LISTS.length} sheets</span></div>
<div class="tb-body">
${otherLists(current)}
<div class="actions"><a class="btn" href="${COMPARE_INDEX}">Compare two neighbours</a><a class="btn" href="/countries/">All 195 country pages</a></div>
</div>
</aside>`;
  const actions = (primary, secondary = []) => `<div class="actions actions--after"><a class="btn btn--go" href="${primary[0]}">${ICON[primary[2] ?? 'play']}${esc(primary[1])}</a>${secondary.length ? `<div class="btn-pair">${secondary.map(([href, label, icon]) => `<a class="btn" href="${href}">${ICON[icon ?? 'globe']}${esc(label)}</a>`).join('')}</div>` : ''}</div>`;

  // cols: [{ head, sub, cls, sort, row }]; rows: [{ region, cells: [{ html, sort }] }]
  // `multi`: more than one figure column, so on phones a year drops under its figure instead of widening the row.
  // `tight`: a table of text columns that gives up its flags on the narrowest phones rather than scroll sideways.
  function table({ cols, rows, caption, multi = false, tight = false }) {
    const th = cols.map((c) => `<th scope="col"${c.cls ? ` class="${c.cls}"` : ''}${c.sort ? ` data-sort-type="${c.sort}"` : ''}>${c.head}${c.sub ? `<span class="src">${c.sub}</span>` : ''}</th>`).join('');
    const tr = rows.map((r) => `<tr data-region="${esc(r.region)}">${r.cells.map((cell, i) => {
      const c = cols[i];
      const attrs = `${c.cls ? ` class="${c.cls}"` : ''}${cell.sort != null ? ` data-sort="${esc(cell.sort)}"` : ''}`;
      return c.row ? `<th scope="row"${attrs}>${cell.html}</th>` : `<td${attrs}>${cell.html}</td>`;
    }).join('')}</tr>`).join('\n');
    return `<div class="table-wrap"><table class="ruled ctable rtable${multi ? ' multi' : ''}${tight ? ' tight' : ''}" data-enhance><caption>${caption}</caption><thead><tr>${th}</tr></thead><tbody>\n${tr}\n</tbody></table></div>`;
  }
  const COL = {
    rank: { head: 'Rank', cls: 'rk', sort: 'number' },
    flag: { head: '<span class="sr-only">Flag</span>', cls: 'flagcell' },
    country: { head: 'Country', cls: 'cn', sort: 'text', row: true },
    region: { head: 'Region', cls: 'rg hide-s', sort: 'text' },
  };
  const cell = {
    rank: (n, i) => ({ html: n ?? '—', sort: i + 1 }),
    flag: (r) => ({ html: flagImg(r) }),
    country: (r, extra = '') => ({ html: `<a href="${r.url}">${esc(r.name)}</a>${extra}`, sort: r.name }),
    region: (r) => ({ html: esc(r.region), sort: r.region }),
    none: () => ({ html: '<span class="nd">no data</span>', sort: '' }),
  };

  const wbSource = (keys) => {
    const inds = keys.map((k) => WB_INDICATOR[k]).filter(Boolean);
    return `${listAnd(inds.map(([code, label]) => `<a href="${indicatorUrl(code)}">${esc(label)}</a>`))}: ${srcLink(SRC.wb)}, latest value per country ${licLink(SRC.wb)}.`;
  };
  const wcSource = (what) => `${what}: ${srcLink(SRC.wc)} ${licLink(SRC.wc)}.`;
  const flagSource = `Flags: ${srcLink(SRC.flags)} <span>(${esc(SRC.flags.licence)})</span>.`;
  const retrieved = (what) => `Retrieved ${D.retrieved}. ${what}`;

  // One page. `spec.main` is the HTML between the summary and the sources.
  function add(slugName, spec) {
    const list = listBySlug.get(slugName);
    if (!list) throw new Error(`no list ${slugName} in urls.mjs`);
    const url = listPath(list.slug);
    const crumbItems = [['World Survey', '/'], ['Lists', LISTS_INDEX], [list.label, url]];
    const top10 = spec.items.slice(0, 10);
    const graph = [
      { '@type': 'WebPage', '@id': SITE + url, url: SITE + url, name: spec.title, description: spec.desc, inLanguage: 'en', dateModified: D.generated, isPartOf: webSite, author, mainEntity: { '@id': `${SITE}${url}#list` } },
      breadcrumbLd(crumbItems),
      {
        '@type': 'ItemList', '@id': `${SITE}${url}#list`, name: list.label, numberOfItems: spec.items.length,
        itemListOrder: spec.order ?? 'https://schema.org/ItemListOrderDescending',
        itemListElement: top10.map((r, i) => ({ '@type': 'ListItem', position: i + 1, name: r.name, url: SITE + r.url })),
      },
    ];
    if (spec.dataset) {
      const ds = spec.dataset;
      graph.push({
        '@type': 'Dataset', '@id': `${SITE}${url}#dataset`, name: ds.name ?? list.label, description: ds.description, url: SITE + url, inLanguage: 'en',
        isAccessibleForFree: true, dateModified: D.generated, creator: author, license: ds.sources.map((s) => s.licenceUrl),
        ...(ds.variable ? { variableMeasured: ds.variable } : {}),
        ...(ds.coverage ? { temporalCoverage: ds.coverage } : {}),
        isBasedOn: ds.sources.map((s) => ({ '@type': 'Dataset', name: s.title, url: s.url, license: s.licenceUrl, publisher: { '@type': 'Organization', name: s.publisher } })),
        citation: ds.sources.map((s) => `${s.publisher}: ${s.title} (${s.licence})`).join('; '),
      });
    }
    const body = `
${mast(LISTS_INDEX)}
<main class="page">
${crumbs(crumbItems)}
<header class="block title">
<div class="tb-head"><span>${spec.headL}</span><span>${spec.headR}</span></div>
<div class="tb-body"><h1 class="list">${esc(list.label)}</h1><p class="deck">${spec.deck}</p></div>
<dl class="tb-cells">${spec.cells.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join('')}</dl>
</header>
<div class="grid grid--ref">
<section class="prose measure${spec.wide ? ' wide' : ''}" aria-label="Summary">${spec.paras.map((p, k) => `<p${k === 0 ? ' class="lead"' : ''}>${p}</p>`).join('')}
${actions(spec.cta[0], spec.cta.slice(1))}</section>
${spec.main}
${spec.wide ? `<nav class="section wide" aria-label="More lists"><h2>More lists</h2>${otherLists(list.slug)}<div class="actions actions--after"><div class="btn-pair"><a class="btn" href="${COMPARE_INDEX}">Compare two neighbours</a><a class="btn" href="/countries/">All 195 country pages</a></div></div></nav>` : sideCard(list.slug)}
${sourcesFooter(spec.sources)}
</div>
</main>
${colophon}`;
    pages.push({ url, title: spec.title, desc: spec.desc, kind: 'list', html: head({ title: spec.title, desc: spec.desc, url, jsonld: { '@context': 'https://schema.org', '@graph': graph }, type: 'article', assets, script: true }) + body });
    index.push({ list, url, fig: spec.indexFig, blurb: spec.indexBlurb });
  }

  const wbDs = (key) => ({ publisher: 'World Bank', title: `World Development Indicators: ${WB_INDICATOR[key][1]} (${WB_INDICATOR[key][0]})`, url: indicatorUrl(WB_INDICATOR[key][0]), licence: SRC.wb.licence, licenceUrl: SRC.wb.licenceUrl });
  const wcDs = { publisher: 'world-countries contributors', title: SRC.wc.name, url: SRC.wc.url, licence: SRC.wc.licence, licenceUrl: SRC.wc.licenceUrl };
  const coverage = (list, key) => { const t = yearsOf(list.map((r) => r.m[key])); return t ? t.replace('–', '/') : null; };
  const staleNote = (key, what) => {
    const st = staleOf(key), no = missingOf(key);
    const out = [];
    if (st.length) out.push(`${listAnd(st.map((r, i) => `${L(r, i === 0)} (${y(r, key)})`))} ${be(st.length, 'has a figure', 'have figures')} older than ${MIN_RANK_YEAR}, shown below the ranking but not ranked.`);
    if (no.length) out.push(`The World Bank publishes no ${what} for ${names(no)}.`);
    return out.join(' ');
  };
  const tail = (key, fmt) => [
    ...staleOf(key).map((r) => ({ r, rank: null, fig: `${fmt(r)}${yr(y(r, key))}<span class="src">older than ${MIN_RANK_YEAR}, not ranked</span>`, sort: v(r, key) })),
    ...missingOf(key).map((r) => ({ r, rank: null, fig: null })),
  ];
  // The standard ranked table: rank, flag, country, one figure with its year, region.
  const rankedTable = ({ key, list, th, sub, fmt, caption, extra }) => {
    const rows = [...list.map((r) => ({ r, rank: r.rank[key], fig: `${fmt(r)}${yr(y(r, key))}`, sort: v(r, key) })), ...tail(key, fmt)];
    return table({
      cols: [COL.rank, COL.flag, COL.country, { head: th, sub, cls: 'r', sort: 'number' }, COL.region],
      rows: rows.map((row, i) => ({ region: row.r.region, cells: [cell.rank(row.rank, i), cell.flag(row.r), cell.country(row.r, extra ? extra(row.r) : ''), row.fig ? { html: row.fig, sort: row.sort } : cell.none(), cell.region(row.r)] })),
      caption,
    });
  };
  const section = (title, small, inner) => `<section class="section" id="list"><h2>${title} <small>${small}</small></h2>\n${inner}</section>`;
  const rankCaption = 'Ranks run from the largest value (1) among the countries with data; equal values share a rank.';
  const checkDesc = (slugName, ...cands) => fitDesc(`/lists/ ${slugName}`, ...cands);

  // ---------- Countries by population ----------
  {
    const key = 'population', list = ranked(key), N = list.length, [top, second] = list, bottom = list.at(-1);
    const vals = list.map((r) => v(r, key)), med = median(vals), yrs = yearsOf(list.map((r) => r.m[key]));
    const over100 = vals.filter((x) => x > 1e8).length, under1 = vals.filter((x) => x < 1e6).length, no = missingOf(key);
    const paras = [
      `${L(top, true)} has the largest population of the ${N} countries with World Bank data: ${people(v(top, key))} in ${y(top, key)}, ${people(v(top, key) - v(second, key))} more than ${L(second)} (${people(v(second, key))}, ${y(second, key)}).`,
      `In the same World Bank figures for ${yrs}, ${nCountries(over100)} ${be(over100, 'has', 'have')} more than 100 million people and ${under1} ${be(under1, 'has', 'have')} fewer than 1 million. The median is ${people(med)}: half of the countries have more, half fewer. ${L(bottom, true)} has the smallest population on the list, ${int(v(bottom, key))} (${y(bottom, key)}).`,
    ];
    if (no.length) paras.push(`${names(no, true)} ${be(no.length, 'is', 'are')} listed last, without a rank: the World Bank publishes no population figure for ${be(no.length, 'it', 'them')}.`);
    add('countries-by-population', {
      title: `Countries by population: all ${recs.length} ranked · World Survey`,
      desc: checkDesc(key, `All ${recs.length} countries ranked by population (World Bank, ${yrs}). ${plain(top, true)} leads with ${people(v(top, key))}, ${plain(second)} has ${people(v(second, key))}; the median is ${people(med)}.`),
      headL: `List · ${N} countries ranked`, headR: `World Bank · ${yrs}`,
      deck: `Every country by number of people, largest first, with the year of each figure`,
      cells: [['Largest', `${esc(top.name)} <small>${people(v(top, key))}</small>`], ['Smallest', `${esc(bottom.name)} <small>${int(v(bottom, key))}</small>`], ['Median', people(med)], ['Over 100 million', `${over100}`]],
      paras, cta: [['/higher-or-lower/population/', 'Play Higher or lower: population'], ['/play/find/', 'Find the country', 'globe'], [listPath('countries-by-population-density'), 'Population density list', 'flag']],
      main: section(`All ${recs.length} countries`, 'largest population first', rankedTable({ key, list, th: 'Population', sub: 'World Bank', fmt: (r) => num(int(v(r, key))), caption: `${rankCaption} Population: World Bank, latest value per country (year beside each figure), ${SRC.wb.licence}.` })),
      sources: [wbSource([key]), retrieved('Ranks, the median and the counts above are computed by World Survey from these figures.')],
      items: list, dataset: { description: `Population of ${N} countries, latest World Bank value per country (${yrs}), ranked from largest to smallest.`, variable: WB_INDICATOR[key][1], coverage: coverage(list, key), sources: [wbDs(key)] },
      indexFig: `${N} ranked`, indexBlurb: `${plain(top, true)} first with ${people(v(top, key))} (${y(top, key)}); ${plain(bottom)} last with ${int(v(bottom, key))}.`,
    });
  }

  // ---------- Countries by area ----------
  {
    const key = 'area', list = ranked(key), N = list.length, [top, second] = list, bottom = list.at(-1);
    const vals = list.map((r) => v(r, key)), med = median(vals), total = sum(vals);
    const big = list.filter((r) => v(r, key) > 1e6), share = (sum(big.map((r) => v(r, key))) / total) * 100;
    const r12 = v(top, key) / v(second, key);
    const lead = ratioKind(r12) === 'times' ? `${timesStr(r12)} the size of` : `${pctStr(r12)} larger than`;
    const paras = [
      `${L(top, true)} is the largest country by area at ${areaStr(v(top, key))}, ${lead} ${L(second)} (${areaStr(v(second, key))}). Areas are total area as listed by ${esc(SRC.wc.short)}, which gives no year for them.`,
      `${cap(nCountries(big.length))} cover more than 1 million km² each, and together they hold ${Math.round(share)}% of the combined area of all ${N}. The median country covers ${areaStr(med)}; the smallest, ${L(bottom)}, covers ${areaStr(v(bottom, key))}.`,
    ];
    add('countries-by-area', {
      title: `Countries by area: largest to smallest · World Survey`,
      desc: checkDesc(key, `All ${N} countries ranked by total area. ${plain(top, true)} is largest at ${areaStr(v(top, key))}, ${plain(second)} second at ${areaStr(v(second, key))}; the median is ${areaStr(med)}.`),
      headL: `List · ${N} countries ranked`, headR: esc(SRC.wc.short),
      deck: `Every country by total area in square kilometres, largest first`,
      cells: [['Largest', `${esc(top.name)} <small>${areaStr(v(top, key))}</small>`], ['Smallest', `${esc(bottom.name)} <small>${areaStr(v(bottom, key))}</small>`], ['Median', areaStr(med)], ['Over 1 million km²', `${big.length}`]],
      paras, cta: [['/higher-or-lower/area/', 'Play Higher or lower: area'], [listPath('smallest-countries'), 'The 30 smallest countries', 'flag'], ['/play/find/', 'Find the country', 'globe']],
      main: section(`All ${N} countries`, 'largest area first', rankedTable({ key, list, th: 'Area km²', sub: esc(SRC.wc.short), fmt: (r) => num(areaNum(v(r, key))), caption: `${rankCaption} Area: total area from ${esc(SRC.wc.name)}, ${SRC.wc.licence}; the source gives no year.` })),
      sources: [wcSource('Area'), retrieved('Ranks, the median and the shares above are computed by World Survey from these figures.')],
      items: list, dataset: { description: `Total area in square kilometres of ${N} countries, ranked from largest to smallest, from the world-countries dataset.`, variable: 'Total area (km²)', sources: [wcDs] },
      indexFig: `${N} ranked`, indexBlurb: `${plain(top, true)} first at ${areaStr(v(top, key))}; ${plain(bottom)} last at ${areaStr(v(bottom, key))}.`,
    });
  }

  // ---------- Countries by GDP ----------
  {
    const key = 'gdp', list = ranked(key), N = list.length, [top, second] = list, bottom = list.at(-1);
    const vals = list.map((r) => v(r, key)), med = median(vals), yrs = yearsOf(list.map((r) => r.m[key]));
    const trillion = vals.filter((x) => x > 1e12).length, r12 = v(top, key) / v(second, key);
    const lead = ratioKind(r12) === 'times' ? `${timesStr(r12)} that of` : `${pctStr(r12)} more than that of`;
    const paras = [
      `${L(top, true)} has the largest economy of the ${N} ranked here: a GDP of ${usd(v(top, key))} in ${y(top, key)} (World Bank, current US$), ${lead} ${L(second)} (${usd(v(second, key))}, ${y(second, key)}).`,
      `${cap(nCountries(trillion))} ${be(trillion, 'has', 'have')} a GDP above US$1 trillion, and the median is ${usd(med)}. The smallest economy on the list is ${L(bottom)}, at ${usd(v(bottom, key))} (${y(bottom, key)}). Each figure is the latest the World Bank publishes, so the years run from ${yrs.replace('–', ' to ')}.`,
    ];
    const note = staleNote(key, 'GDP figure');
    if (note) paras.push(note);
    add('countries-by-gdp', {
      title: `Countries by GDP: ${N} economies ranked · World Survey`,
      desc: checkDesc(key, `${N} countries ranked by GDP in current US$ (World Bank). ${plain(top, true)} leads with ${usd(v(top, key))} (${y(top, key)}), then ${plain(second)} with ${usd(v(second, key))}.`),
      headL: `List · ${N} countries ranked`, headR: `World Bank · ${yrs}`,
      deck: `Every economy by gross domestic product in current US dollars, largest first`,
      cells: [['Largest', `${esc(top.name)} <small>${usd(v(top, key))}</small>`], ['Smallest', `${esc(bottom.name)} <small>${usd(v(bottom, key))}</small>`], ['Median', usd(med)], ['Over US$1 trillion', `${trillion}`]],
      paras, cta: [['/higher-or-lower/economy/', 'Play Higher or lower: economy'], [listPath('countries-by-gdp-per-capita'), 'GDP per capita list', 'flag'], ['/play/find/', 'Find the country', 'globe']],
      main: section(`All ${recs.length} countries`, 'largest economy first', rankedTable({ key, list, th: 'GDP', sub: 'US$ million, World Bank', fmt: (r) => num(int(v(r, key) / 1e6)), caption: `${rankCaption} GDP: World Bank, current US$, in millions, latest value per country (year beside each figure), ${SRC.wb.licence}. Figures older than ${MIN_RANK_YEAR} are shown but not ranked.` })),
      sources: [wbSource([key]), retrieved('Ranks, the median and the counts above are computed by World Survey from these figures.')],
      items: list, dataset: { description: `Gross domestic product of ${N} countries in current US dollars, latest World Bank value per country (${yrs}), ranked from largest to smallest.`, variable: WB_INDICATOR[key][1], coverage: coverage(list, key), sources: [wbDs(key)] },
      indexFig: `${N} ranked`, indexBlurb: `${plain(top, true)} first with ${usd(v(top, key))} (${y(top, key)}); ${plain(bottom)} last with ${usd(v(bottom, key))}.`,
    });
  }

  // ---------- Countries by GDP per capita ----------
  {
    const key = 'gdpPerCapita', list = ranked(key), N = list.length, [top, second] = list, bottom = list.at(-1);
    const vals = list.map((r) => v(r, key)), med = median(vals), yrs = yearsOf(list.map((r) => r.m[key]));
    const rich = vals.filter((x) => x > 50000).length, poor = vals.filter((x) => x < 1000).length;
    const paras = [
      `${L(top, true)} has the highest GDP per capita of the ${N} countries ranked here, ${usd(v(top, key))} in ${y(top, key)} (World Bank, current US$), followed by ${L(second)} with ${usd(v(second, key))} (${y(second, key)}).`,
      `${cap(nCountries(rich))} ${be(rich, 'is', 'are')} above US$50,000 a head and ${poor} ${be(poor, 'is', 'are')} below US$1,000; the median is ${usd(med)}. At the other end of the list is ${L(bottom)}, with ${usd(v(bottom, key))} (${y(bottom, key)}): the top figure is ${timesStr(v(top, key) / v(bottom, key))} as high. The years run from ${yrs.replace('–', ' to ')}, the latest the World Bank publishes for each country.`,
    ];
    const note = staleNote(key, 'GDP per capita figure');
    if (note) paras.push(note);
    add('countries-by-gdp-per-capita', {
      title: `Countries by GDP per capita, ranked · World Survey`,
      desc: checkDesc(key, `${N} countries ranked by GDP per capita in current US$ (World Bank). ${plain(top, true)} is highest at ${usd(v(top, key))} (${y(top, key)}); the median is ${usd(med)}.`),
      headL: `List · ${N} countries ranked`, headR: `World Bank · ${yrs}`,
      deck: `Gross domestic product per person in current US dollars, highest first`,
      cells: [['Highest', `${esc(top.name)} <small>${usd(v(top, key))}</small>`], ['Lowest', `${esc(bottom.name)} <small>${usd(v(bottom, key))}</small>`], ['Median', usd(med)], ['Over US$50,000', `${rich}`]],
      paras, cta: [['/higher-or-lower/economy/', 'Play Higher or lower: economy'], [listPath('countries-by-gdp'), 'GDP list', 'flag'], [listPath('countries-by-life-expectancy'), 'Life expectancy list', 'flag']],
      main: section(`All ${recs.length} countries`, 'highest GDP per capita first', rankedTable({ key, list, th: 'GDP per capita', sub: 'US$, World Bank', fmt: (r) => num(int(v(r, key))), caption: `${rankCaption} GDP per capita: World Bank, current US$, latest value per country (year beside each figure), ${SRC.wb.licence}. Ranks use the unrounded values, so two countries can show the same rounded figure. Figures older than ${MIN_RANK_YEAR} are shown but not ranked.` })),
      sources: [wbSource([key]), retrieved('Ranks, the median and the counts above are computed by World Survey from these figures.')],
      items: list, dataset: { description: `Gross domestic product per person of ${N} countries in current US dollars, latest World Bank value per country (${yrs}), ranked from highest to lowest.`, variable: WB_INDICATOR[key][1], coverage: coverage(list, key), sources: [wbDs(key)] },
      indexFig: `${N} ranked`, indexBlurb: `${plain(top, true)} first with ${usd(v(top, key))} (${y(top, key)}); ${plain(bottom)} last with ${usd(v(bottom, key))}.`,
    });
  }

  // ---------- Countries by population density ----------
  {
    const key = 'density', list = ranked(key), N = list.length, [top, second] = list, bottom = list.at(-1);
    const vals = list.map((r) => v(r, key)), med = median(vals), yrs = yearsOf(list.map((r) => r.m[key]));
    const dense = vals.filter((x) => x > 1000).length, thin = vals.filter((x) => x < 10).length, no = missingOf(key);
    const paras = [
      `${L(top, true)} is the most densely populated country, with ${densityStr(v(top, key))} people per km² (population ${y(top, key)}, World Bank; area, ${esc(SRC.wc.short)}). ${L(second, true)} follows with ${densityStr(v(second, key))}.`,
      `On the same ${yrs} population figures, ${nCountries(dense)} ${be(dense, 'has', 'have')} more than 1,000 people per km² and ${thin} ${be(thin, 'has', 'have')} fewer than 10. The median is ${densityStr(med)} people per km². ${L(bottom, true)} is the most thinly populated, at ${densityStr(v(bottom, key))}.`,
    ];
    if (no.length) paras.push(`${names(no, true)} ${be(no.length, 'has', 'have')} no World Bank population figure, so no density is given for ${be(no.length, 'it', 'them')}.`);
    add('countries-by-population-density', {
      title: `Countries by population density · World Survey`,
      desc: checkDesc(key, `${N} countries ranked by people per km². ${plain(top, true)} is densest at ${densityStr(v(top, key))} (${y(top, key)} population); ${plain(bottom)} is last at ${densityStr(v(bottom, key))}. Median ${densityStr(med)}.`),
      headL: `List · ${N} countries ranked`, headR: `World Bank · ${esc(SRC.wc.short)}`,
      deck: `People per square kilometre: World Bank population divided by total area, densest first`,
      cells: [['Densest', `${esc(top.name)} <small>${densityStr(v(top, key))}</small>`], ['Most thinly populated', `${esc(bottom.name)} <small>${densityStr(v(bottom, key))}</small>`], ['Median', `${densityStr(med)} <small>per km²</small>`], ['Over 1,000 per km²', `${dense}`]],
      paras, cta: [['/higher-or-lower/density/', 'Play Higher or lower: density'], [listPath('countries-by-population'), 'Population list', 'flag'], [listPath('countries-by-area'), 'Area list', 'flag']],
      main: section(`All ${recs.length} countries`, 'densest first', rankedTable({ key, list, th: 'People per km²', sub: 'population year', fmt: (r) => num(densityStr(v(r, key))), caption: `${rankCaption} Density is the World Bank population (year beside each figure, ${SRC.wb.licence}) divided by the total area from ${esc(SRC.wc.name)} (${SRC.wc.licence}). Ranks use the unrounded values.` })),
      sources: [wbSource(['population']), wcSource('Area'), retrieved('Density, ranks and the median are computed by World Survey from these figures.')],
      items: list, dataset: { description: `Population density of ${N} countries in people per square kilometre: World Bank population (${yrs}) divided by world-countries total area.`, variable: 'Population density (people per km²)', coverage: coverage(list, key), sources: [wbDs('population'), wcDs] },
      indexFig: `${N} ranked`, indexBlurb: `${plain(top, true)} first with ${densityStr(v(top, key))} people per km²; ${plain(bottom)} last with ${densityStr(v(bottom, key))}.`,
    });
  }

  // ---------- Countries by life expectancy ----------
  {
    const key = 'lifeExpectancy', list = ranked(key), N = list.length, bottomV = v(list.at(-1), key);
    const tops = list.filter((r) => r.rank[key] === 1), bottoms = list.filter((r) => v(r, key) === bottomV);
    const top = tops[0], bottom = bottoms[0];
    const vals = list.map((r) => v(r, key)), med = median(vals), yrs = yearsOf(list.map((r) => r.m[key]));
    const eighty = vals.filter((x) => x >= 80).length, sixty = vals.filter((x) => x < 60).length, no = missingOf(key);
    const paras = [
      `Life expectancy at birth is highest in ${names(tops)}, at ${fixed(v(top, key), 1)} years in ${y(top, key)} (World Bank), and lowest in ${names(bottoms)}, at ${fixed(bottomV, 1)} years (${y(bottom, key)}): a gap of ${fixed(v(top, key) - bottomV, 1)} years.`,
      `In the same ${yrs} figures, ${eighty} of the ${N} countries with data reach 80 years or more and ${sixty} ${be(sixty, 'is', 'are')} below 60. The median is ${fixed(med, 1)} years. The World Bank figures are rounded to one decimal here, so countries with the same value share a rank.`,
    ];
    if (no.length) paras.push(`${names(no, true)} ${be(no.length, 'is', 'are')} listed last: the World Bank publishes no life expectancy figure for ${be(no.length, 'it', 'them')}.`);
    add('countries-by-life-expectancy', {
      title: `Countries by life expectancy, ranked · World Survey`,
      desc: checkDesc(key, `${N} countries ranked by life expectancy at birth (World Bank, ${yrs}). ${plain(top, true)} is highest at ${fixed(v(top, key), 1)} years, ${plain(bottom)} lowest at ${fixed(bottomV, 1)}; median ${fixed(med, 1)}.`),
      headL: `List · ${N} countries ranked`, headR: `World Bank · ${yrs}`,
      deck: `Life expectancy at birth in years, longest first`,
      cells: [['Highest', `${esc(top.name)} <small>${fixed(v(top, key), 1)} years</small>`], ['Lowest', `${esc(bottom.name)} <small>${fixed(bottomV, 1)} years</small>`], ['Median', `${fixed(med, 1)} <small>years</small>`], ['80 years or more', `${eighty}`]],
      paras, cta: [['/higher-or-lower/life-expectancy/', 'Play Higher or lower: life expectancy'], [listPath('countries-by-gdp-per-capita'), 'GDP per capita list', 'flag'], ['/play/find/', 'Find the country', 'globe']],
      main: section(`All ${recs.length} countries`, 'longest life expectancy first', rankedTable({ key, list, th: 'Years', sub: 'World Bank', fmt: (r) => num(fixed(v(r, key), 1)), caption: `${rankCaption} Life expectancy at birth: World Bank, latest value per country (year beside each figure), ${SRC.wb.licence}.` })),
      sources: [wbSource([key]), retrieved('Ranks, the median and the counts above are computed by World Survey from these figures.')],
      items: list, dataset: { description: `Life expectancy at birth in years for ${N} countries, latest World Bank value per country (${yrs}), ranked from highest to lowest.`, variable: WB_INDICATOR[key][1], coverage: coverage(list, key), sources: [wbDs(key)] },
      indexFig: `${N} ranked`, indexBlurb: `${plain(top, true)} first at ${fixed(v(top, key), 1)} years (${y(top, key)}); ${plain(bottom)} last at ${fixed(bottomV, 1)}.`,
    });
  }

  // ---------- Countries by number of neighbours ----------
  {
    const key = 'neighbours', list = ranked(key), N = list.length;
    const tops = list.filter((r) => r.rank[key] === 1), topN = v(tops[0], key);
    const nextN = v(list[tops.length], key), nexts = list.filter((r) => v(r, key) === nextN);
    const vals = list.map((r) => v(r, key)), med = median(vals);
    const none = vals.filter((x) => x === 0).length, one = vals.filter((x) => x === 1).length;
    const others = [...new Map(recs.flatMap((r) => r.otherAreas).map((o) => [o.iso3, o.name])).values()].sort((a, b) => a.localeCompare(b, 'en'));
    const paras = [
      `${names(tops, true)} ${be(tops.length, 'borders', 'each border')} ${topN} other countries by land, more than any other; ${names(nexts)} ${be(nexts.length, 'follows', 'follow')} with ${nextN}.`,
      `${none} of the ${N} countries have no land neighbour at all and ${one} ${be(one, 'has', 'have')} exactly one. The median is ${Number.isInteger(med) ? med : fixed(med, 1)}.`,
      `Counts are land borders with the other ${N - 1} countries, as listed by ${esc(SRC.wc.short)}, which gives no year for them.${others.length ? ` Neighbouring areas outside the ${N} (${listAnd(others.map(esc))}) are not counted.` : ''}`,
    ];
    const nbLinks = (r) => (r.nbs.length ? `<span class="src nbl">${r.nbs.map((o) => `<a href="${comparePath(r.c, o.c)}">${esc(o.name)}</a>`).join(', ')}</span>` : '');
    add('countries-by-number-of-neighbours', {
      title: `Countries by number of neighbours · World Survey`,
      desc: checkDesc(key, `All ${N} countries ranked by land neighbours. ${listAnd(tops.map((r) => r.name))} border ${topN} countries each; ${none} have none. Every neighbour links to a side-by-side comparison.`),
      headL: `List · ${N} countries ranked`, headR: esc(SRC.wc.short),
      deck: `How many of the other ${N - 1} countries each one touches by land, most first`,
      cells: [['Most', `${tops.map((r) => esc(r.name)).join(', ')} <small>${topN}</small>`], ['No land neighbour', `${none}`], ['Exactly one', `${one}`], ['Median', `${Number.isInteger(med) ? med : fixed(med, 1)}`]],
      paras, cta: [['/higher-or-lower/neighbours/', 'Play Higher or lower: neighbours'], [COMPARE_INDEX, 'Compare two neighbours', 'flag'], ['/learn/', 'Learn the countries', 'globe']],
      main: section(`All ${N} countries`, 'most land neighbours first', rankedTable({ key, list, th: 'Neighbours', sub: esc(SRC.wc.short), fmt: (r) => num(v(r, key)), extra: nbLinks, caption: `${rankCaption} Land borders: ${esc(SRC.wc.name)}, ${SRC.wc.licence}. Each neighbour's name opens the comparison of the two countries.` })),
      sources: [wcSource('Land borders'), retrieved('Counts, ranks and the median are computed by World Survey from the border lists.')],
      items: list, dataset: { description: `Number of land neighbours of each of ${N} countries, counted among the same ${N} from the border lists in the world-countries dataset.`, variable: 'Number of land neighbours', sources: [wcDs] },
      indexFig: `${N} ranked`, indexBlurb: `${listAnd(tops.map((r) => r.name))} first with ${topN} each; ${none} countries have no land neighbour.`,
    });
  }

  // ---------- The smallest countries in the world ----------
  {
    const key = 'area', N = 30;
    const asc = [...recs].sort((a, b) => v(a, key) - v(b, key) || a.name.localeCompare(b.name, 'en'));
    const list = asc.slice(0, N), [top, second] = list, last = list.at(-1);
    const total = sum(list.map((r) => v(r, key)));
    const bigger = asc.slice(N).find((r) => v(r, key) > total);
    const islands = list.filter((r) => r.c.island).length, locked = list.filter((r) => r.c.landlocked).length;
    const fromBottom = (r) => asc.filter((o) => v(o, key) < v(r, key)).length + 1;
    const side = (a) => { const km = Math.sqrt(a); return km < 1 ? `${int(km * 1000)} m` : `${fixed(km, 1)} km`; };
    const paras = [
      `${L(top, true)} is the smallest of the ${recs.length} countries at ${areaStr(v(top, key))}; ${L(second)}, second, is ${timesStr(v(second, key) / v(top, key))} its size at ${areaStr(v(second, key))}. Areas are total area as listed by ${esc(SRC.wc.short)}, which gives no year for them.`,
      `The ${N} smallest together cover ${areaStr(total)}${bigger ? `, less than ${L(bigger)} alone (${areaStr(v(bigger, key))}), which is ${nthSmallest(fromBottom(bigger))} by area` : ''}. ${islands} of the ${N} are island countries with no land border and ${locked} ${be(locked, 'is', 'are')} landlocked. By region, ${byRegionText(list).replace(' in ', ' are in ')}.`,
      `The largest on this list, ${L(last)}, covers ${areaStr(v(last, key))}. The Square column gives the side of a square with the same area, to make the sizes easier to picture.`,
    ];
    const rows = list.map((r, i) => ({
      region: r.region,
      cells: [cell.rank(fromBottom(r), i), cell.flag(r), cell.country(r), { html: num(areaNum(v(r, key))), sort: v(r, key) },
        r.m.population ? { html: `${num(int(r.m.population.value))}${yr(r.m.population.year)}`, sort: r.m.population.value } : cell.none(),
        { html: num(side(v(r, key))), sort: Math.sqrt(v(r, key)) }, cell.region(r)],
    }));
    add('smallest-countries', {
      title: `The ${N} smallest countries in the world · World Survey`,
      desc: checkDesc('smallest', `The ${N} smallest countries by area: ${top.name} (${areaStr(v(top, key))}), ${second.name} (${areaStr(v(second, key))}), ${list[2].name} (${areaStr(v(list[2], key))}) and ${N - 3} more, with population.`),
      headL: `List · the ${N} smallest of ${recs.length}`, headR: esc(SRC.wc.short),
      deck: `The ${N} countries with the least total area, smallest first`,
      cells: [['Smallest', `${esc(top.name)} <small>${areaStr(v(top, key))}</small>`], ['Second', `${esc(second.name)} <small>${areaStr(v(second, key))}</small>`], [`All ${N} together`, areaStr(total)], ['Island countries', `${islands}`]],
      paras, cta: [['/higher-or-lower/area/', 'Play Higher or lower: area'], [listPath('countries-by-area'), 'All countries by area', 'flag'], ['/play/find/', 'Find the country', 'globe']],
      main: section(`The ${N} smallest`, 'smallest area first', table({
        cols: [COL.rank, COL.flag, COL.country, { head: 'Area km²', sub: esc(SRC.wc.short), cls: 'r', sort: 'number' }, { head: 'Population', sub: 'World Bank', cls: 'r hide-s', sort: 'number' }, { head: 'Square', sub: 'side, same area', cls: 'r', sort: 'number' }, COL.region],
        rows,
        caption: `Rank 1 is the smallest. Area: ${esc(SRC.wc.name)}, ${SRC.wc.licence}; the source gives no year. Population: World Bank, latest value (year beside each figure), ${SRC.wb.licence}. Square: the side of a square with the same area.`,
      })),
      sources: [wcSource('Area, landlocked status and land borders'), wbSource(['population']), retrieved('Ranks, totals and the square sides are computed by World Survey from these figures.')],
      items: list, order: 'https://schema.org/ItemListOrderAscending',
      dataset: { name: `The ${N} smallest countries by area`, description: `The ${N} countries with the smallest total area in square kilometres, from the world-countries dataset, with World Bank population.`, variable: 'Total area (km²)', sources: [wcDs, wbDs('population')] },
      indexFig: `${N} listed`, indexBlurb: `${plain(top, true)} at ${areaStr(v(top, key))}, then ${plain(second)} at ${areaStr(v(second, key))}.`,
    });
  }

  // ---------- Landlocked countries ----------
  {
    const list = recs.filter((r) => r.c.landlocked), N = list.length;
    const byArea = [...list].sort((a, b) => v(b, 'area') - v(a, 'area'));
    const withPop = list.filter((r) => r.m.population && !r.m.population.stale).sort((a, b) => v(b, 'population') - v(a, 'population'));
    const double = list.filter((r) => r.c.borders.length && r.c.borders.every((i) => D.all.get(i)?.landlocked));
    const enclaved = list.filter((r) => r.c.borders.length === 1);
    const absent = REGIONS.filter((reg) => !list.some((r) => r.region === reg));
    const paras = [
      `${N} of the ${recs.length} countries are landlocked: ${byRegionText(list)}${absent.length ? `, and none in ${listAnd(absent.map(theRegion))}` : ''}.`,
      `The largest is ${L(byArea[0])} (${areaStr(v(byArea[0], 'area'))}) and the smallest is ${L(byArea.at(-1))} (${areaStr(v(byArea.at(-1), 'area'))}); ${L(withPop[0])} has the most people, ${people(v(withPop[0], 'population'))} in ${y(withPop[0], 'population')} (World Bank).`,
    ];
    if (double.length) paras.push(`${names(double, true)} ${be(double.length, 'is', 'are')} bordered only by other landlocked countries, so reaching the sea from ${be(double.length, 'it', 'either')} means crossing at least two borders.${enclaved.length ? ` ${names(enclaved, true)} ${be(enclaved.length, 'is', 'are each')} surrounded by a single country.` : ''}`);
    paras.push(`Landlocked status, areas and borders are as listed by ${esc(SRC.wc.short)}, which gives no year for them.`);
    const rows = list.map((r) => ({
      region: r.region,
      cells: [cell.flag(r), cell.country(r, r.nbs.length ? `<span class="src nbl">${r.nbs.map((o) => `<a href="${comparePath(r.c, o.c)}">${esc(o.name)}</a>`).join(', ')}</span>` : ''),
        { html: num(r.nbs.length), sort: r.nbs.length }, { html: num(areaNum(v(r, 'area'))), sort: v(r, 'area') },
        r.m.population ? { html: `${num(int(v(r, 'population')))}${yr(y(r, 'population'))}`, sort: v(r, 'population') } : cell.none(), cell.region(r)],
    }));
    add('landlocked-countries', {
      title: `Landlocked countries: full list of ${N} · World Survey`,
      desc: checkDesc('landlocked',
        `The ${N} landlocked countries, with neighbours, area and population. Largest: ${byArea[0].name} (${areaStr(v(byArea[0], 'area'))}). ${listAnd(double.map((r) => r.name))} ${be(double.length, 'is', 'are')} doubly landlocked.`,
        `The ${N} landlocked countries, with neighbours, area and population. The largest is ${byArea[0].name} at ${areaStr(v(byArea[0], 'area'))}.`),
      headL: `List · ${N} of ${recs.length} countries`, headR: esc(SRC.wc.short),
      deck: `Every landlocked country, with the neighbours that surround it`,
      cells: [['Landlocked', `${N} <small>of ${recs.length}</small>`], ['Largest', `${esc(byArea[0].name)}`], ['Smallest', `${esc(byArea.at(-1).name)}`], ['Most people', `${esc(withPop[0].name)}`]],
      paras, cta: [['/play/find/', 'Find the country on the globe', 'globe'], ['/higher-or-lower/neighbours/', 'Higher or lower: neighbours', 'play'], [listPath('island-countries'), 'Island countries', 'flag']],
      main: section(`The ${N} landlocked countries`, 'A–Z', table({
        multi: true,
        cols: [COL.flag, { ...COL.country, head: 'Country<span class="src">Land neighbours</span>' }, { head: 'Neighbours', cls: 'r hide-s', sort: 'number' }, { head: 'Area km²', sub: esc(SRC.wc.short), cls: 'r', sort: 'number' }, { head: 'Population', sub: 'World Bank', cls: 'r', sort: 'number' }, COL.region],
        rows,
        caption: `Landlocked status, land borders and area: ${esc(SRC.wc.name)}, ${SRC.wc.licence}; the source gives no year. Population: World Bank, latest value (year beside each figure), ${SRC.wb.licence}. Each neighbour's name opens the comparison of the two countries.`,
      })),
      sources: [wcSource('Landlocked status, land borders and area'), wbSource(['population']), retrieved('Counts and the notes on neighbours are computed by World Survey from these lists.')],
      items: list, order: 'https://schema.org/ItemListUnordered',
      indexFig: `${N} listed`, indexBlurb: `${cap(byRegionText(list))}; ${plain(byArea[0])} is the largest.`,
    });
  }

  // ---------- Island countries ----------
  {
    const list = recs.filter((r) => r.c.island), N = list.length;
    const byArea = [...list].sort((a, b) => v(b, 'area') - v(a, 'area'));
    const withPop = list.filter((r) => r.m.population && !r.m.population.stale).sort((a, b) => v(b, 'population') - v(a, 'population'));
    const noBorderNotIsland = recs.filter((r) => !r.c.island && r.c.borders.length === 0);
    // Countries named as examples of "has a land border, so not listed": only while the data still says so.
    const examples = ['IDN', 'IRL', 'GBR'].map((i) => D.byIso.get(i)).filter((r) => r && !r.c.island && r.nbs.length);
    const paras = [
      `${N} of the ${recs.length} countries are island countries with no land border: ${byRegionText(list)}.`,
      `The largest by area is ${L(byArea[0])} (${areaStr(v(byArea[0], 'area'))}) and the smallest is ${L(byArea.at(-1))} (${areaStr(v(byArea.at(-1), 'area'))}). ${L(withPop[0], true)} has the most people, ${people(v(withPop[0], 'population'))} in ${y(withPop[0], 'population')} (World Bank), and ${L(withPop.at(-1))} the fewest, ${int(v(withPop.at(-1), 'population'))}.`,
      `A country with any land border is left out, whatever its geography${examples.length ? `: ${names(examples)} ${be(examples.length, 'shares', 'each share')} one` : ''}.${noBorderNotIsland.length ? ` ${names(noBorderNotIsland, true)} ${be(noBorderNotIsland.length, 'has', 'have')} no land border either, but the data does not class ${be(noBorderNotIsland.length, 'it', 'them')} as an island country.` : ''} Borders and areas are as listed by ${esc(SRC.wc.short)}, which gives no year for them.`,
    ];
    const rows = list.map((r) => ({
      region: r.region,
      cells: [cell.flag(r), cell.country(r, r.c.subregion ? `<span class="src">${esc(r.c.subregion)}</span>` : ''), { html: num(areaNum(v(r, 'area'))), sort: v(r, 'area') },
        r.m.population ? { html: `${num(int(v(r, 'population')))}${yr(y(r, 'population'))}`, sort: v(r, 'population') } : cell.none(),
        r.m.density ? { html: num(densityStr(v(r, 'density'))), sort: v(r, 'density') } : cell.none(), cell.region(r)],
    }));
    add('island-countries', {
      title: `Island countries: list of all ${N} · World Survey`,
      desc: checkDesc('island', `The ${N} island countries with no land border, with area and population. ${plain(byArea[0], true)} is the largest (${areaStr(v(byArea[0], 'area'))}); ${plain(withPop[0])} has the most people (${people(v(withPop[0], 'population'))}).`),
      headL: `List · ${N} of ${recs.length} countries`, headR: `${esc(SRC.wc.short)} · World Bank`,
      deck: `Every island country that shares no land border with another`,
      cells: [['Island countries', `${N} <small>of ${recs.length}</small>`], ['Largest', `${esc(byArea[0].name)}`], ['Smallest', `${esc(byArea.at(-1).name)}`], ['Most people', `${esc(withPop[0].name)}`]],
      paras, cta: [['/play/find/', 'Find the country on the globe', 'globe'], ['/play/find/oceania/', 'Oceania map quiz', 'play'], [listPath('landlocked-countries'), 'Landlocked countries', 'flag']],
      main: section(`The ${N} island countries`, 'A–Z', table({
        multi: true,
        cols: [COL.flag, { ...COL.country, head: 'Country<span class="src">Subregion</span>' }, { head: 'Area km²', sub: esc(SRC.wc.short), cls: 'r', sort: 'number' }, { head: 'Population', sub: 'World Bank', cls: 'r', sort: 'number' }, { head: 'Per km²', cls: 'r hide-s', sort: 'number' }, COL.region],
        rows,
        caption: `Island countries here are those with no land border, derived from Natural Earth outlines and the ${esc(SRC.wc.short)} border lists. Area: ${esc(SRC.wc.name)}, ${SRC.wc.licence}; the source gives no year. Population: World Bank, latest value (year beside each figure), ${SRC.wb.licence}.`,
      })),
      sources: [wcSource('Land borders, subregion and area'), wbSource(['population']), `Outlines used to tell islands from mainland: ${srcLink(SRC.ne)} 1:50m <span>(${esc(SRC.ne.licence)})</span>.`, retrieved('Counts and densities are computed by World Survey from these figures.')],
      items: list, order: 'https://schema.org/ItemListUnordered',
      indexFig: `${N} listed`, indexBlurb: `${cap(byRegionText(list))}; ${plain(byArea[0])} is the largest.`,
    });
  }

  // ---------- Capital cities of the world ----------
  {
    const list = recs.filter((r) => r.c.capital && r.c.capitalLatLng), N = list.length;
    const lat = (r) => r.c.capitalLatLng[0];
    const north = [...list].sort((a, b) => lat(b) - lat(a))[0], south = [...list].sort((a, b) => lat(a) - lat(b))[0];
    const southern = list.filter((r) => lat(r) < 0).length;
    // Nearest other capital for each, to find the closest pair and the most isolated capital.
    const nearest = list.map((r) => {
      let best = null;
      for (const o of list) {
        if (o === r) continue;
        const km = distanceKm(r.c.capitalLatLng, o.c.capitalLatLng);
        if (!best || km < best.km) best = { o, km };
      }
      return { r, ...best };
    });
    const closest = [...nearest].sort((a, b) => a.km - b.km)[0], lonely = [...nearest].sort((a, b) => b.km - a.km)[0];
    const capOf = (r) => (r.c.capital === r.name ? L(r) : `${esc(r.c.capital)} (${L(r)})`);
    const kmStr = (km) => (km < 10 ? `${fixed(km, 1)} km` : `${int(km)} km`);
    const wiki = list.filter((r) => D.wikidataCapitals.has(r.iso3));
    const paras = [
      `The northernmost of the ${N} capitals is ${capOf(north)} at ${latStr(lat(north))}, and the southernmost is ${capOf(south)} at ${latStr(lat(south))}. ${southern} capitals lie south of the equator.`,
      `The two closest capitals are ${capOf(closest.r)} and ${capOf(closest.o)}, ${kmStr(closest.km)} apart in a straight line. The most isolated is ${capOf(lonely.r)}: the nearest other capital, ${esc(lonely.o.c.capital)}, is ${kmStr(lonely.km)} away.`,
      `Each country is listed with one capital, as ${esc(SRC.wc.short)} names it; coordinates are from Natural Earth${wiki.length ? ` (Wikidata for ${listAnd(wiki.map((r) => esc(r.c.capital)))})` : ''}, and the distances are great-circle distances computed from them.`,
    ];
    const rows = list.map((r) => ({
      region: r.region,
      cells: [cell.flag(r), cell.country(r), { html: esc(r.c.capital), sort: r.c.capital },
        { html: `${num(latStr(lat(r), 2))} ${num(lngStr(r.c.capitalLatLng[1], 2))}`, sort: lat(r) }, cell.region(r)],
    }));
    add('capital-cities', {
      title: `Capital cities of the world: all ${N} · World Survey`,
      desc: checkDesc('capitals', `The capital of each of the ${N} countries, with coordinates. Northernmost: ${north.c.capital} (${latStr(lat(north))}); southernmost: ${south.c.capital} (${latStr(lat(south))}). Sort by name or latitude.`),
      headL: `List · ${N} capitals`, headR: `${esc(SRC.wc.short)} · Natural Earth`,
      deck: `Every country with its capital city and where the capital is, by latitude and longitude`,
      cells: [['Capitals', `${N}`], ['Northernmost', `${esc(north.c.capital)} <small>${latStr(lat(north))}</small>`], ['Southernmost', `${esc(south.c.capital)} <small>${latStr(lat(south))}</small>`], ['South of the equator', `${southern}`]],
      paras, cta: [['/play/capitals/', 'Play Capital pin: drop a pin on each capital'], ['/learn/', 'Learn the countries', 'globe'], ['/play/find/', 'Find the country', 'globe']],
      main: section(`All ${N} capitals`, 'by country, A–Z', table({
        tight: true,
        cols: [COL.flag, COL.country, { head: 'Capital', cls: 'cp', sort: 'text' }, { head: 'Coordinates', sub: 'sorts north to south', cls: 'r coord', sort: 'number' }, COL.region],
        rows,
        caption: `Capital names: ${esc(SRC.wc.name)}, ${SRC.wc.licence}. Coordinates: Natural Earth 1:10m populated places, public domain${wiki.length ? `; Wikidata (CC0 1.0) for ${listAnd(wiki.map((r) => esc(r.c.capital)))}` : ''}.`,
      })),
      sources: [wcSource('Capital names'), `Capital positions: ${srcLink(SRC.ne)} 1:10m populated places <span>(public domain)</span>${wiki.length ? `; Wikidata <span>(CC0 1.0)</span> for ${listAnd(wiki.map((r) => esc(r.c.capital)))}` : ''}.`, retrieved('Distances between capitals are great-circle distances computed by World Survey.')],
      items: list, order: 'https://schema.org/ItemListOrderAscending',
      indexFig: `${N} listed`, indexBlurb: `From ${north.c.capital} at ${latStr(lat(north))} to ${south.c.capital} at ${latStr(lat(south))}, with coordinates.`,
    });
  }

  // ---------- Flags of the world ----------
  {
    const list = recs.filter((r) => r.flag), N = list.length;
    if (N !== recs.length) throw new Error(`flags: ${recs.length - N} countries have no flag file`);
    const counts = regionCounts(list);
    const paras = [
      `The flags of all ${N} countries, grouped by region: ${byRegionText(list)}. Each flag opens its country's page, with a map, the capital and the main figures.`,
      `Every flag here is drawn in the same 4:3 frame, from ${esc(SRC.flags.name)}, so official proportions are not shown.`,
    ];
    const main = REGIONS.map((reg) => {
      const members = list.filter((r) => r.region === reg);
      return `<section class="reg wide" id="${reg.toLowerCase()}"><h2 class="h2">Flags of ${esc(theRegion(reg))} <small class="num">${members.length}</small></h2><ul class="flaggrid">${members.map((r) => `<li data-name="${esc(r.name)}"><a href="${r.url}"><img src="${r.flag}" width="120" height="90" alt="Flag of ${esc(plain(r))}" loading="lazy"><span>${esc(r.name)}</span></a></li>`).join('')}</ul></section>`;
    }).join('\n');
    add('flags-of-the-world', {
      title: `Flags of the world: all ${N} country flags · World Survey`,
      desc: checkDesc('flags', `Flags of all ${N} countries on one page, grouped by region: ${counts.map(([reg, n]) => `${reg} ${n}`).join(', ')}. Each flag links to its country.`),
      headL: `List · ${N} flags`, headR: `${REGIONS.length} regions`,
      deck: `The flag of every country, by region, each linked to its country page`,
      cells: counts.slice(0, 5).map(([reg, n]) => [esc(reg), `${n} <small>flags</small>`]),
      paras, cta: [['/play/flagquiz/', 'Play the flag quiz', 'flag'], ['/play/lookalikes/', 'Lookalike flags', 'flag'], ['/flags/', 'All flag games', 'play']],
      wide: true,
      main: `<div class="wide" data-enhance data-items=".flaggrid li" data-groups=".reg"></div>\n${main}`,
      sources: [flagSource, wcSource('Country names and regions'), retrieved('')],
      items: list, order: 'https://schema.org/ItemListOrderAscending',
      indexFig: `${N} flags`, indexBlurb: `Every flag by region: ${counts.map(([reg, n]) => `${reg} ${n}`).join(', ')}.`,
    });
  }

  if (pages.length !== LISTS.length) throw new Error(`built ${pages.length} list pages for ${LISTS.length} entries in urls.mjs`);

  // ---------- /lists/ ----------
  {
    const url = LISTS_INDEX;
    const title = 'Lists of countries: rankings, capitals, flags · World Survey';
    const ordered = LISTS.map((l) => index.find((x) => x.list.slug === l.slug));
    const desc = checkDesc('index', `${LISTS.length} lists covering all ${recs.length} countries: population, area, GDP, density, life expectancy, neighbours, capitals and flags, each figure with its year and source.`);
    const crumbItems = [['World Survey', '/'], ['Lists', url]];
    const jsonld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', '@id': SITE + url, url: SITE + url, name: title, description: desc, inLanguage: 'en', dateModified: D.generated, isPartOf: webSite, author },
        breadcrumbLd(crumbItems),
        { '@type': 'ItemList', name: 'Lists of countries', numberOfItems: ordered.length, itemListElement: ordered.slice(0, 12).map((x, i) => ({ '@type': 'ListItem', position: i + 1, name: x.list.label, url: SITE + x.url })) },
      ],
    };
    const body = `
${mast(url)}
<main class="page">
${crumbs(crumbItems)}
<header class="block title">
<div class="tb-head"><span>List index · ${LISTS.length} sheets</span><span>${recs.length} countries</span></div>
<div class="tb-body"><h1 class="list">Lists of countries</h1><p class="deck">Rankings and reference lists for the ${recs.length} countries, built from the same figures as the country pages</p></div>
</header>
<div class="grid grid--ref">
<section class="prose measure wide"><p class="lead">These ${LISTS.length} lists rank or group all ${recs.length} countries in this atlas: the 193 member states of the United Nations plus Vatican City and Palestine. Figures come from the World Bank and from ${esc(SRC.wc.short)}; each one carries its year where the source gives one, and a country without a figure is listed as having no data, never as zero.</p><p>Each list links every country to its own page, and the tables can be sorted and filtered by region. For two countries side by side, see the <a href="${COMPARE_INDEX}">comparisons of neighbours</a>.</p></section>
<section class="section wide" id="lists"><h2>All lists <small>${LISTS.length} sheets</small></h2>
<ul class="index">${ordered.map((x) => `<li><div class="row"><a class="name" href="${x.url}">${esc(x.list.label)}</a><span class="fig">${esc(x.fig)}</span></div><div class="sub">${esc(x.blurb)}</div></li>`).join('')}</ul></section>
<nav class="wide" aria-label="More"><div class="actions"><div class="btn-pair"><a class="btn btn--go" href="/higher-or-lower/">${ICON.play}Play Higher or lower</a><a class="btn" href="${COMPARE_INDEX}">${ICON.flag}Compare two neighbours</a><a class="btn" href="/countries/">${ICON.globe}All ${recs.length} country pages</a></div></div></nav>
${sourcesFooter([wbSource(['population', 'gdp', 'gdpPerCapita', 'lifeExpectancy']), wcSource('Area, land borders, landlocked status, capitals, names and regions'), flagSource, retrieved('Ranks, medians, densities and distances are computed by World Survey from these sources.')])}
</div>
</main>
${colophon}`;
    pages.unshift({ url, title, desc, kind: 'lists-index', html: head({ title, desc, url, jsonld, assets }) + body });
  }
  return pages;
}

// "the 31st-smallest"
function nthSmallest(n) {
  return n === 1 ? 'the smallest' : `the ${ordinal(n)}-smallest`;
}
