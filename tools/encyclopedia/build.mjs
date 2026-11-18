// Static encyclopedia pages for World Survey: /countries/<slug>/ for the 195 countries, /countries/ (index),
// /countries/<region>/ for the five regions, sitemap.xml and robots-sitemap.txt.
//
//   node tools/encyclopedia/build.mjs <outDir>                 # write pages into <outDir> (build.py: dist)
//   node tools/encyclopedia/build.mjs <outDir> --with-assets   # also copy fonts, flags, icon, og.png (local preview)
//
// Inputs: data/countries.json, data/world.json, data/encyclopedia.json (from fetch.mjs) and the cached Natural
// Earth marine polygons (water names on the maps). No network, no JavaScript in the output (the one inline
// block is Speculation Rules, which is data), no external requests: every asset URL is root-absolute on the
// same origin.
//
// Links out of these pages are made from the same sources as their targets: game routes from src/routes.js,
// lessons from src/game/course.js, list and comparison pages from tools/reference/urls.mjs.
import { readFile, writeFile, mkdir, copyFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, CACHE, SITE, REGIONS, MIN_RANK_YEAR, slug, esc, int, fixed, ordinal, nth, people, usd, latStr, lngStr, latLngStr, listAnd } from './lib.mjs';
import { createMapper } from './map.mjs';
import { makeProse, makeQuestions, placePhrase, areaStr, otherAreasSentence, fromBottom, theName } from './prose.mjs';
import { speculationTag } from './speculation.mjs';
import { ROUTES, ROUTE_BY_PATH, regionSlug as routeRegionSlug } from '../../src/routes.js';
import { buildCourse } from '../../src/game/course.js';
import { LISTS, LISTS_INDEX, COMPARE_INDEX, SITE_MAP, listPath, comparePath } from '../reference/urls.mjs';

const argv = process.argv.slice(2);
const outArg = argv.find((a) => !a.startsWith('--'));
if (!outArg) {
  console.error('usage: node tools/encyclopedia/build.mjs <outDir> [--with-assets]');
  process.exit(2);
}
const OUT = path.resolve(process.cwd(), outArg);
const WITH_ASSETS = argv.includes('--with-assets');
// Development only: --only=PER,LIE renders just those country pages (sitemap still lists every page).
const ONLY = new Set((argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean));

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

// ---------- Inputs ----------
const cj = await readJson(path.join(ROOT, 'data/countries.json'));
const topo = await readJson(path.join(ROOT, 'data/world.json'));
const encDoc = await readJson(path.join(ROOT, 'data/encyclopedia.json'));
const marinePath = path.join(CACHE, 'ne/ne_50m_geography_marine_polys.geojson');
let marine = { type: 'FeatureCollection', features: [] };
if (await exists(marinePath)) marine = await readJson(marinePath);
else console.error('warning: marine polygons not cached (run fetch.mjs); maps will have no water names');

const enc = encDoc.countries;
const all = new Map(cj.countries.map((c) => [c.iso3, c]));
const sov = cj.countries.filter((c) => c.sovereign).sort((a, b) => a.name.localeCompare(b.name, 'en'));
if (sov.length !== 195) throw new Error(`expected 195 countries, got ${sov.length}`);
for (const c of sov) if (!enc[c.iso3]) throw new Error(`data/encyclopedia.json has no ${c.iso3}; rerun fetch.mjs`);
const GENERATED = encDoc.generated;
const RETRIEVED = '3 November 2026';

const regionSlug = (r) => slug(r);
const theRegion = (r) => (r === 'Americas' ? 'the Americas' : r);
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const countryUrl = (c) => `/countries/${slug(c.name)}/`;
const regionUrl = (r) => `/countries/${regionSlug(r)}/`;
const reserved = new Set(REGIONS.map(regionSlug));
for (const c of sov) if (reserved.has(slug(c.name))) throw new Error(`country slug ${slug(c.name)} collides with a region page`);

const wikidataCapitals = new Set(
  (cj.sources.find((s) => /fallback/.test(s.what))?.what.split(':')[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
);

// ---------- Links into the game, the course and the reference pages ----------
const routeH1 = (p) => {
  const r = ROUTE_BY_PATH.get(p);
  if (!r) throw new Error(`src/routes.js has no ${p}`);
  return r.h1;
};
for (const r of REGIONS) if (routeRegionSlug(r) !== regionSlug(r)) throw new Error(`region slug for ${r} differs between src/routes.js and the encyclopedia`);
// Quizzes with a page per region (/play/find/europe/ ...), in the order src/routes.js lists them.
const REGION_MODES = [...new Set(ROUTES.filter((r) => r.view === 'play' && r.region).map((r) => r.mode))];
const quizUrl = (mode, region) => `/play/${mode}/${regionSlug(region)}/`;
for (const m of REGION_MODES) for (const r of REGIONS) routeH1(quizUrl(m, r));
for (const m of ['find', 'flagquiz', 'capitals']) if (!REGION_MODES.includes(m)) throw new Error(`src/routes.js has no region pages for /play/${m}/`);
const CAPITAL_QUIZ = ROUTE_BY_PATH.has('/play/capitalquiz/') ? '/play/capitalquiz/' : null;
const quizLinks = (region) => [
  ...REGION_MODES.map((m) => [quizUrl(m, region), routeH1(quizUrl(m, region))]),
  ...(CAPITAL_QUIZ ? [[CAPITAL_QUIZ, routeH1(CAPITAL_QUIZ)]] : []),
];
for (const p of ['/learn/', '/atlas/', '/about/', ...REGIONS.map((r) => `/learn/${regionSlug(r)}/`)]) routeH1(p);

const course = buildCourse(cj.countries);
const lessonOf = new Map();
for (const l of course.lessons) for (const iso of l.iso3) lessonOf.set(iso, l);
for (const c of sov) if (!lessonOf.has(c.iso3)) throw new Error(`no lesson in src/game/course.js teaches ${c.iso3}`);
const lessonNames = (l) => listAnd(l.iso3.map((iso) => esc(all.get(iso).name)));

// The list pages a country appears on. A ranking list links only when this country has a rank in it, and the
// link carries that rank; the others follow the flag the list is built from. "Smallest countries" is a short
// list (the 30 with the least area, as tools/reference/lists.mjs cuts it), so only those link to it.
// tools/seo/verify.mjs checks every one of these links against the built list page, so a rule that drifts
// from the reference builder fails there.
const RANK_KEY = { neighbours: 'neighbourCount' };
const SMALLEST_LINKED = 30;
const smallestFirst = [...sov].sort((a, b) => a.area - b.area || a.name.localeCompare(b.name, 'en')).slice(0, SMALLEST_LINKED);
const LIST_RULES = {
  'smallest-countries': (c) => (smallestFirst.includes(c) ? { note: nth(fromBottom(sov, (o) => o.area, c.area), 'smallest') } : null),
  'landlocked-countries': (c) => (c.landlocked ? {} : null),
  'island-countries': (c) => (c.island ? {} : null),
  'capital-cities': (c) => (c.capital ? {} : null),
  'flags-of-the-world': (c) => (c.flag ? {} : null),
};
for (const l of LISTS) if (!LIST_RULES[l.slug] && !l.measure) console.error(`warning: no membership rule for /lists/${l.slug}/; country pages will not link to it`);
function listsFor(c, e) {
  const out = [];
  for (const l of LISTS) {
    const rule = LIST_RULES[l.slug];
    if (rule) {
      const hit = rule(c, e);
      if (hit) out.push({ ...l, ...hit });
    } else if (l.measure) {
      const r = e.ranks[RANK_KEY[l.measure] ?? l.measure];
      if (r?.world) out.push({ ...l, rank: r });
    }
  }
  return out;
}

// Link to a country page when it is one of the 195; plain text otherwise.
const link = (iso3, label) => {
  const c = all.get(iso3);
  const text = esc(label ?? c?.name ?? iso3);
  return c?.sovereign ? `<a href="${countryUrl(c)}">${text}</a>` : text;
};

// Per-country share images: assets/og/<slug>.png, drawn once by tools/seo/og.mjs. A page names its own image
// only when the file is there; otherwise it keeps the site image.
const OG_W = 1200, OG_H = 630;
const ogDir = path.join(ROOT, 'assets', 'og');
const ogImages = new Set((await exists(ogDir)) ? (await readdir(ogDir)).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)) : []);
const ogAlt = (c) => `${c.name} on a World Survey sheet: its flag, a locator map${c.capital ? `, the capital ${c.capital}` : ''}${c.population != null ? ', population' : ''} and area`;

// ---------- Shared chrome ----------
const WORDMARK = `<a class="wordmark" href="/" aria-label="World Survey, play the game"><svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.5"/><path d="M3.5 16h25M16 3.5c-4 3.6-6 7.8-6 12.5s2 8.9 6 12.5M16 3.5c4 3.6 6 7.8 6 12.5s-2 8.9-6 12.5"/><path class="tri" d="M16 11.5l3.6 6.3h-7.2z"/></svg><span>World Survey</span></a>`;
const ICON = {
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c-2.8 2.4-4.2 5.2-4.2 8.5s1.4 6.1 4.2 8.5M12 3.5c2.8 2.4 4.2 5.2 4.2 8.5s-1.4 6.1-4.2 8.5"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5l11 6.5-11 6.5z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 21V4M5.5 4.5h12l-2.5 4 2.5 4h-12"/></svg>',
};

function head({ title, desc, url, jsonld, type = 'website', image = null }) {
  const ld = JSON.stringify(jsonld).replace(/</g, '\\u003c');
  // A page with its own share image says how big it is and what it shows; the rest share the site image.
  const og = image
    ? `<meta property="og:image" content="${SITE}${image.src}">
<meta property="og:image:width" content="${image.width}">
<meta property="og:image:height" content="${image.height}">
<meta property="og:image:alt" content="${esc(image.alt)}">`
    : `<meta property="og:image" content="${SITE}/assets/og.png">`;
  const tw = image
    ? `<meta name="twitter:image" content="${SITE}${image.src}">
<meta name="twitter:image:alt" content="${esc(image.alt)}">`
    : `<meta name="twitter:image" content="${SITE}/assets/og.png">`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta name="theme-color" content="#f4f5f0">
<meta name="color-scheme" content="light">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="World Survey">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}${url}">
${og}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
${tw}
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="preload" href="/assets/fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/encyclopedia.css">
<script type="application/ld+json">${ld}</script>
${speculationTag}
<script src="/assets/analytics.js" defer></script>
</head>
<body>
<div class="neat" aria-hidden="true"></div>`;
}

function mast(current) {
  const nav = [['Countries', '/countries/'], ...REGIONS.map((r) => [r, regionUrl(r)])]
    .map(([t, u]) => `<a href="${u}"${current === u ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  return `<header class="mast">${WORDMARK}<nav aria-label="Atlas">${nav}</nav><a class="btn play" href="/">${ICON.play}Play</a></header>`;
}

// The footer is the same on every static page (the reference pages copy it), so it marks no link as current.
const FOOT_NAV = [['Countries', '/countries/'], ['Lists', LISTS_INDEX], ['Compare', COMPARE_INDEX], ['Learn', '/learn/'], ['Atlas', '/atlas/'], ['Play', '/'], ['About', '/about/'], ['Site map', SITE_MAP]];
const colophon = `<footer class="colophon"><nav class="foot" aria-label="World Survey">${FOOT_NAV.map(([t, u]) => `<a href="${u}">${t}</a>`).join('')}</nav><p>World Survey, a geography game on a 3D globe. Made by <a href="https://aimantas.com/">Aimantas</a>.</p></footer>
</body>
</html>
`;

function crumbs(items) {
  const li = items.map(([name, url], i) => (i === items.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${url}">${esc(name)}</a></li>`)).join('');
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${li}</ol></nav>`;
}
const breadcrumbLd = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + url })),
});

const regionLinks = (current) =>
  `<ul class="regions">${REGIONS.map((r) => `<li><a href="${regionUrl(r)}"${current === r ? ' aria-current="page"' : ''}>${r} <span class="num">${sov.filter((c) => c.region === r).length}</span></a></li>`).join('')}</ul>`;

// ---------- Text helpers ----------
// Long single words get a narrower H1 on small screens so map lettering never breaks mid-word.
const h1Class = (name) => {
  const longest = Math.max(...name.split(/\s+/).map((w) => w.length));
  return longest >= 11 ? ' class="l"' : longest >= 9 ? ' class="m"' : '';
};
const yr = (y) => (y ? ` <span class="yr">${y}</span>` : '');
const rankCell = (r, key) => (r?.[key] ? `<span class="rank">${ordinal(r[key])} <small>of ${r[key === 'world' ? 'worldOf' : 'regionOf']}</small></span>` : '<span class="rank">—</span>');
const flagUrl = (c) => (c.flag ? `/${c.flag}` : null);
const capitalSrc = (c) => (wikidataCapitals.has(c.iso3) ? 'Wikidata (CC0 1.0)' : 'Natural Earth 1:10m populated places (public domain)');

function titleFor(c) {
  const tails = [': map, capital, flag and facts', ': map, capital and facts', ': map and facts', ' facts'];
  for (const t of tails) {
    const s = `${c.name}${t} · World Survey`;
    if (s.length <= 60) return s;
  }
  return `${c.name} · World Survey`;
}

function descFor(c, e) {
  const facts = [];
  if (c.capital) facts.push(`capital ${c.capital}`);
  if (c.population != null) facts.push(`${people(c.population)} people (${c.populationYear})`);
  facts.push(`${areaStr(c.area)}`);
  const lead = `${c.name}: ${facts.join(', ')}.`;
  const n = e.sovereignNeighbourCount;
  const shape = c.island ? `An island country in ${placePhrase(c)}.`
    : c.landlocked ? `Landlocked, with ${n} land ${n === 1 ? 'neighbour' : 'neighbours'}.`
    : n ? `Borders ${n === 1 ? e.neighbours.find((x) => x.sovereign).name : `${n} countries`}.` : '';
  // Promise World Bank figures only when the page has some.
  const hasWB = c.population != null || c.gdp != null || c.lifeExpectancy != null || Object.values(e.stats).some(Boolean);
  const tails = hasWB
    ? [' Locator map, flag, rankings and World Bank figures, then find it on a 3D globe.', ' Map, flag, rankings and facts, then find it on a 3D globe.', ' Map, flag and rankings.']
    : [' Locator map, flag, neighbours and facts, then find it on a 3D globe.', ' Map, flag and facts, then find it on a 3D globe.', ' Map, flag and facts.'];
  for (const withShape of [true, false]) {
    for (const t of tails) {
      const s = `${lead}${withShape && shape ? ' ' + shape : ''}${t}`;
      if (s.length <= 160) return s;
    }
  }
  return lead.slice(0, 160);
}

// ---------- Country page ----------
function countryPage(c, i, mapper) {
  const e = enc[c.iso3];
  const url = countryUrl(c);
  const title = titleFor(c);
  const desc = descFor(c, e);
  const prev = sov[(i - 1 + sov.length) % sov.length], next = sov[(i + 1) % sov.length];
  const R = e.ranks;
  const map = mapper.countryMap(c);
  const paras = makeProse(c, e, { link, all, enc });
  const crumbItems = [['World Survey', '/'], ['Countries', '/countries/'], [c.region, regionUrl(c.region)], [c.name, url]];
  const questions = makeQuestions(c, e, { all });
  const image = ogImages.has(slug(c.name)) ? { src: `/assets/og/${slug(c.name)}.png`, width: OG_W, height: OG_H, alt: ogAlt(c) } : null;

  const alternate = [...new Set([e.official, ...e.nativeNames.map((n) => n.official), ...e.altSpellings])].filter((s) => s && s !== c.name);
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Country',
        '@id': `${SITE}${url}#country`,
        name: c.name,
        alternateName: alternate,
        url: SITE + url,
        ...(flagUrl(c) ? { image: SITE + flagUrl(c) } : {}),
        geo: { '@type': 'GeoCoordinates', latitude: c.labelLatLng[0], longitude: c.labelLatLng[1] },
        containedInPlace: { '@type': 'Place', name: c.subregion || c.region, ...(c.subregion ? { containedInPlace: { '@type': 'Place', name: c.region } } : {}) },
        ...(c.capital && c.capitalLatLng ? { containsPlace: { '@type': 'City', name: c.capital, geo: { '@type': 'GeoCoordinates', latitude: c.capitalLatLng[0], longitude: c.capitalLatLng[1] } } } : {}),
      },
      breadcrumbLd(crumbItems),
      { '@type': 'WebPage', '@id': SITE + url, url: SITE + url, name: title, description: desc, inLanguage: 'en', dateModified: GENERATED, about: { '@id': `${SITE}${url}#country` }, isPartOf: { '@type': 'WebSite', name: 'World Survey', url: `${SITE}/` }, ...(image ? { primaryImageOfPage: { '@type': 'ImageObject', url: SITE + image.src, width: image.width, height: image.height } } : {}) },
      // The Questions section, word for word.
      {
        '@type': 'FAQPage',
        '@id': `${SITE}${url}#questions`,
        name: `Questions about ${theName(c.name)}`,
        inLanguage: 'en',
        isPartOf: { '@id': SITE + url },
        about: { '@id': `${SITE}${url}#country` },
        mainEntity: questions.map(([name, text]) => ({ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } })),
      },
    ],
  };

  // Questions, then the ways on from this sheet: a neighbour to compare with, the lists it is on, its lesson, the quizzes.
  const faqHtml = `<div class="faq">${questions.map(([qn, an]) => `<div><h3>${esc(qn)}</h3><p>${esc(an)}</p></div>`).join('')}</div>`;
  const compareNbs = c.borders.map((iso) => all.get(iso)).filter((o) => o?.sovereign).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const lists = listsFor(c, e);
  const lesson = lessonOf.get(c.iso3);
  const classmates = lesson.iso3.filter((iso) => iso !== c.iso3).map((iso) => link(iso));
  const more = [
    compareNbs.length ? `<div><h3>Compare with a neighbour</h3><ul class="regions">${compareNbs.map((o) => `<li><a href="${comparePath(c, o)}">${esc(c.name)} and ${esc(o.name)}</a></li>`).join('')}</ul></div>` : '',
    lists.length ? `<div><h3>See it in the lists</h3><ul class="ranked">${lists.map((l) => `<li><a href="${listPath(l.slug)}">${esc(l.label)}</a>${l.rank ? `<span class="rank">${ordinal(l.rank.world)} <small>of ${l.rank.worldOf}</small></span>` : l.note ? `<span class="rank">${esc(l.note)}</span>` : ''}</li>`).join('')}</ul></div>` : '',
    `<div><h3>Learn it</h3><p><a href="${lesson.path}">Lesson ${lesson.number} of ${course.total}: ${esc(lesson.name)}</a> in the field course teaches ${esc(theName(c.name))}${classmates.length ? ` with ${listAnd(classmates)}` : ''}: where each one is, its flag and its capital.</p></div>`,
    `<div><h3>Quiz yourself</h3><ul class="regions">${quizLinks(c.region).map(([u, t]) => `<li><a href="${u}">${esc(t)}</a></li>`).join('')}</ul></div>`,
  ].filter(Boolean).join('');

  // Quick facts
  const cur = e.currencies.length ? e.currencies.map((x) => `${esc(x.name)} <span class="num">(${esc(x.code)}${x.symbol ? `, ${esc(x.symbol)}` : ''})</span>`).join('<br>') : '—';
  const dem = e.demonym ? (e.demonym.m === e.demonym.f ? esc(e.demonym.m) : `${esc(e.demonym.m)} / ${esc(e.demonym.f)}`) : '—';
  const facts = [
    ['Capital', c.capital ? esc(c.capital) : '—'],
    ['Population', c.population != null ? `<span class="num">${int(c.population)}</span>${yr(c.populationYear)}` : '—'],
    ['Area', `<span class="num">${areaStr(c.area)}</span><br><span class="yr">${ordinal(R.area.world)} of 195</span>`],
    ['Region', `${esc(c.region)}<br><span class="yr">${esc(c.subregion || '')}</span>`],
    ['Languages', c.languages.length ? esc(c.languages.join(', ')) : '—', c.languages.length > 3],
    ['Currency', cur, e.currencies.length > 2],
    ['Demonym', dem],
    ['Calling code', e.callingCodes ? `<span class="num">${e.callingCodes.map(esc).join(', ')}</span>` : '—'],
    ['Internet domain', e.tld.length ? `<span class="num">${e.tld.map(esc).join(' ')}</span>` : '—'],
    ['ISO codes', `<span class="num">${esc(c.iso2 ?? '—')} · ${esc(c.iso3)}${c.ccn3 ? ` · ${esc(c.ccn3)}` : ''}</span>`],
  ];
  if (e.nativeNames.length) facts.push(['Official name in local languages', e.nativeNames.map((n) => `${esc(n.official)} <span class="yr">${esc(n.language)}</span>`).join('<br>'), true]);
  const factsHtml = facts.map(([k, val, wide]) => `<div${wide ? ' class="wide"' : ''}><dt>${k}</dt><dd>${val}</dd></div>`).join('');

  // How it compares
  const s = e.stats;
  const sovNbs = e.neighbours.filter((x) => x.sovereign), others = e.neighbours.filter((x) => !x.sovereign);
  const stale = (year) => year != null && year < MIN_RANK_YEAR;
  const wbRow = (label, val, year, key, unitNote = '') => [label, val, year ? `${year}, World Bank${unitNote}${stale(year) ? `; older than ${MIN_RANK_YEAR}, not ranked` : ''}` : null, stale(year) ? null : R[key]];
  const rows = [
    wbRow('Population', c.population != null ? `<span class="num">${int(c.population)}</span>` : null, c.populationYear, 'population'),
    ['Area', `<span class="num">${areaStr(c.area)}</span>`, 'world-countries', R.area],
    wbRow('GDP', c.gdp != null ? `<span class="num">${usd(c.gdp)}</span>` : null, c.gdpYear, 'gdp', ', current US$'),
    wbRow('GDP per capita', s.gdpPerCapita ? `<span class="num">${usd(s.gdpPerCapita.value)}</span>` : null, s.gdpPerCapita?.year, 'gdpPerCapita', ', current US$'),
    ['Population density', e.density ? `<span class="num">${e.density.value >= 10 ? int(e.density.value) : fixed(e.density.value, 1)} per km²</span>` : null, e.density ? `population ${e.density.populationYear}, World Bank; area, world-countries` : null, R.density],
    wbRow('Life expectancy', c.lifeExpectancy != null ? `<span class="num">${fixed(c.lifeExpectancy, 1)} years</span>` : null, c.lifeExpectancyYear, 'lifeExpectancy'),
    wbRow('Urban population', s.urbanPct ? `<span class="num">${fixed(s.urbanPct.value, 1)}%</span>` : null, s.urbanPct?.year, 'urbanPct'),
    wbRow('Forest area', s.forestPct ? `<span class="num">${fixed(s.forestPct.value, 1)}% of land</span>` : null, s.forestPct?.year, 'forestPct'),
    wbRow('Population growth', s.popGrowthPct ? `<span class="num">${s.popGrowthPct.value > 0 ? '+' : ''}${fixed(s.popGrowthPct.value, 2)}% a year</span>` : null, s.popGrowthPct?.year, 'popGrowthPct'),
    wbRow('Internet users', s.internetPct ? `<span class="num">${fixed(s.internetPct.value, 1)}%</span>` : null, s.internetPct?.year, 'internetPct'),
    wbRow('Fertility rate', s.fertility ? `<span class="num">${fixed(s.fertility.value, 2)} births per woman</span>` : null, s.fertility?.year, 'fertility'),
    ['Land neighbours', `<span class="num">${e.sovereignNeighbourCount}</span>`, `world-countries; among the 195${others.length ? `; also borders ${others.map((x) => x.name).join(', ')}` : ''}`, R.neighbourCount],
  ];
  const tableRows = rows.map(([label, val, src, r]) =>
    `<tr><th scope="row">${label}</th><td>${val ?? '<span class="num">—</span>'}${val && src ? `<span class="src">${esc(src)}</span>` : !val ? '<span class="src">No data</span>' : ''}</td><td class="r" data-label="World">${val ? rankCell(r, 'world') : '—'}</td><td class="r" data-label="${esc(c.region)}">${val ? rankCell(r, 'region') : '—'}</td></tr>`).join('');
  const nearList = (list) => listAnd(list.map((iso3) => link(iso3)));

  // Neighbours
  let nbHtml;
  if (e.neighbours.length) {
    nbHtml = `<ul class="nbs">${[...sovNbs, ...others].map((n) => {
      const nc = all.get(n.iso3);
      const notes = [];
      if (c.capital && n.capital) notes.push(`${esc(c.capital)} to ${esc(n.capital)}${n.capitalKm != null ? ', capital to capital' : ''}`);
      if (!n.sovereign) notes.push('no separate sheet: not one of the 195 countries in this atlas');
      if (!n.inGeometry) notes.push('border too short to draw at the 1:50m scale of this map');
      if (n.viaOutlyingSelf) notes.push(`the border is away from ${esc(c.name)}'s main landmass`);
      if (n.viaOutlyingOther) notes.push(`the border is with an outlying part of ${esc(nc?.name ?? n.name)}`);
      return `<li><div class="row"><span class="name">${link(n.iso3, n.name)}</span>${n.capitalKm != null ? `<span class="km">${int(n.capitalKm)} km</span>` : ''}</div>${notes.length ? `<div class="sub">${notes.join('; ')}</div>` : ''}</li>`;
    }).join('')}</ul>${others.length ? `<p class="note">${otherAreasSentence(c, others, esc(c.name))} ${others.length === 1 ? 'It is' : 'They are'} listed here but not counted or ranked as neighbours.</p>` : ''}`;
  } else {
    nbHtml = `<p class="note">No land borders. The nearest capitals:</p><ul class="nbs">${e.nearestCapitals.map((n) => {
      const nc = all.get(n.iso3);
      return `<li><div class="row"><span class="name">${link(n.iso3)}</span><span class="km">${int(n.km)} km</span></div><div class="sub">${esc(c.capital)} to ${esc(nc.capital)}</div></li>`;
    }).join('')}</ul>`;
  }

  // Where on Earth
  const h = e.hemispheres, x = e.extremes, a = e.antipode;
  const hemiTxt = `${listAnd(h.main)}${h.all.length > h.main.length ? `<br><span class="yr">outlying territory also: ${listAnd(h.all.filter((k) => !h.main.includes(k)))}</span>` : ''}`;
  let antiTxt = '—';
  if (a) {
    antiTxt = `<span class="num">${latLngStr(a.latLng, 2)}</span><br>`;
    antiTxt += a.kind === 'land'
      ? `on land, in ${a.sovereign ? link(a.iso3) : esc(a.name)}`
      : `in ${a.name ? `the ${esc(a.name)}` : 'open ocean'}, about <span class="num">${int(a.nearestLand.km)} km</span> from the nearest land (${a.nearestLand.sovereign ? link(a.nearestLand.iso3) : esc(a.nearestLand.name)})`;
  }
  const where = [
    ['Hemispheres', hemiTxt],
    ['Capital', c.capitalLatLng ? `${esc(c.capital)}<br><span class="num">${latLngStr(c.capitalLatLng, 2)}</span>` : '—'],
    ['Northernmost latitude', x ? `<span class="num">${latStr(x.north, 2)}</span>` : '—'],
    ['Southernmost latitude', x ? `<span class="num">${latStr(x.south, 2)}</span>` : '—'],
    ['Westernmost longitude', x ? `<span class="num">${lngStr(x.west, 2)}</span>` : '—'],
    ['Easternmost longitude', x ? `<span class="num">${lngStr(x.east, 2)}</span>` : '—'],
    ['North to south', x ? `about <span class="num">${int(x.spanNorthSouthKm)} km</span>` : '—'],
    [`Antipode of ${c.capital ? esc(c.capital) : 'the capital'}`, antiTxt],
  ];
  const whereHtml = where.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join('');

  // Sources: only the World Bank years this page shows.
  const years = [c.populationYear, c.gdpYear, c.lifeExpectancyYear, ...Object.values(s).map((v) => v?.year)].filter(Boolean);
  const yrRange = years.length ? (Math.min(...years) === Math.max(...years) ? `${Math.min(...years)}` : `${Math.min(...years)}–${Math.max(...years)}`) : null;
  const sources = [
    `Boundaries and map: <a href="https://www.naturalearthdata.com/">Natural Earth</a> 1:50m Admin 0 Countries via world-atlas 2.0.2 <span>(public domain; packaging ISC)</span>; sea and ocean names: Natural Earth 1:50m marine areas <span>(public domain)</span>.`,
    `Names, official name, languages, currencies, calling code, domain, demonym, area and land borders: <a href="https://github.com/mledoze/countries">world-countries 5.1.0 (mledoze/countries)</a> <span>(<a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL 1.0</a>)</span>.`,
    `Capital position: ${capitalSrc(c)}.`,
    yrRange
      ? `Population, GDP, GDP per capita, life expectancy, urban population, forest area, population growth, internet users and fertility: <a href="https://data.worldbank.org/">World Bank World Development Indicators</a>, latest value per indicator (${yrRange}) <span>(<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>)</span>.`
      : `World Bank World Development Indicators: no values for ${esc(c.name)} <span>(CC BY 4.0)</span>.`,
    `Flag: <a href="https://github.com/lipis/flag-icons">flag-icons 7.6.0</a> <span>(MIT)</span>.`,
    `Retrieved ${RETRIEVED}. Ranks, density, distances, hemispheres, extremes and the antipode are computed by World Survey from these sources; ranks compare each country's latest value, so years can differ.`,
  ];

  const body = `
${mast(regionUrl(c.region))}
<main class="page">
${crumbs(crumbItems)}
<header class="block title">
<div class="tb-head"><span>Sheet ${i + 1} of 195 · ${esc(c.region)}</span><span>${esc(c.iso3)} · ${latLngStr(c.labelLatLng)}</span></div>
<div class="tb-body"><h1${h1Class(c.name)}>${esc(c.name)}</h1><p class="deck">${esc(e.official)}${e.nativeNames.length === 1 ? ` <span>· ${esc(e.nativeNames[0].official)}</span>` : ''}</p></div>
<dl class="tb-cells"><div><dt>Capital</dt><dd>${c.capital ? esc(c.capital) : '—'}</dd></div><div><dt>Population</dt><dd>${c.population != null ? `${people(c.population)} <small>${c.populationYear}</small>` : '—'}</dd></div><div><dt>Area</dt><dd>${areaStr(c.area)}</dd></div><div><dt>Neighbours</dt><dd>${e.sovereignNeighbourCount}</dd></div></dl>
</header>
<div class="grid">
<figure class="figure" id="map"><div class="frame">${map.svg}</div><figcaption>${esc(c.name)} ${c.inMap ? 'hatched' : 'ringed (too small for this map’s 1:50m outlines)'}${c.inMap && c.tiny ? ' and ringed' : ''}${c.capital ? `, ${esc(c.capital)} marked with a triangle` : ''}${c.borders.length ? ', land neighbours shaded' : ''}. Orthographic projection centred on <b>${latLngStr([map.centre[1], map.centre[0]])}</b>; the scale bar is true at the centre.</figcaption></figure>
<section class="prose measure" aria-label="About ${esc(c.name)}">${paras.map((p, k) => `<p${k === 0 ? ' class="lead"' : ''}>${p}</p>`).join('')}</section>
<aside class="side block" aria-label="Quick facts">
<div class="tb-head"><span>Quick facts</span><span>${esc(c.iso3)}</span></div>
<div class="tb-body">
${flagUrl(c) ? `<figure class="flag"><img src="${flagUrl(c)}" width="300" height="225" alt="Flag of ${esc(c.name)}"><figcaption>Flag of ${esc(c.name)}</figcaption></figure>` : ''}
<div class="actions"><a class="btn btn--go" href="/atlas/${slug(c.name)}/">${ICON.globe}Find ${esc(c.name)} on the globe</a><div class="btn-pair"><a class="btn" href="${quizUrl('find', c.region)}">${ICON.play}${esc(routeH1(quizUrl('find', c.region)))}</a><a class="btn" href="${quizUrl('flagquiz', c.region)}">${ICON.flag}${esc(routeH1(quizUrl('flagquiz', c.region)))}</a></div></div>
<dl class="facts">${factsHtml}</dl>
</div>
</aside>
<section class="section measure" id="compare"><h2>How it compares <small>${esc(c.region)}: ${R.area.regionOf} countries</small></h2>
<div class="table-wrap"><table class="ruled cmp"><thead><tr><th scope="col">Measure</th><th scope="col">Figure</th><th scope="col" class="r">World</th><th scope="col" class="r">${esc(c.region)}</th></tr></thead><tbody>${tableRows}</tbody>
<caption>Ranks run from the largest value (1st) among the countries with data; equal values share a rank.</caption></table></div>
<div class="near"><p><b>Closest in area</b>${nearList(e.closestInArea)}</p>${e.closestInPopulation.length ? `<p><b>Closest in population</b>${nearList(e.closestInPopulation)}</p>` : ''}</div>
</section>
<section class="section measure" id="neighbours"><h2>Neighbours <small>${sovNbs.length ? `${sovNbs.length} ${sovNbs.length === 1 ? 'country' : 'countries'} by land${others.length ? ` and ${others.length} other ${others.length === 1 ? 'area' : 'areas'}` : ''}, nearest capital first` : others.length ? `${others.length} other ${others.length === 1 ? 'area' : 'areas'} by land` : 'none by land'}</small></h2>${nbHtml}</section>
<section class="section measure" id="where"><h2>Where on Earth <small>main landmass</small></h2><dl class="where">${whereHtml}</dl></section>
<section class="section measure" id="questions"><h2>Questions <small>answered from the figures on this sheet</small></h2>${faqHtml}</section>
<section class="section measure" id="more"><h2>More on ${esc(theName(c.name))} <small>compare, rank, learn, play</small></h2><div class="more">${more}</div></section>
<nav class="measure" aria-label="More countries"><div class="pager"><a href="${countryUrl(prev)}" rel="prev"><small>Previous sheet</small><span>${esc(prev.name)}</span></a><a href="${countryUrl(next)}" rel="next"><small>Next sheet</small><span>${esc(next.name)}</span></a></div>${regionLinks(c.region)}</nav>
<footer class="sources measure"><h2 class="h2">Sources</h2><ul>${sources.map((x) => `<li>${x}</li>`).join('')}</ul></footer>
</div>
</main>
${colophon}`;
  return { url, title, desc, html: head({ title, desc, url, jsonld, type: 'article', image }) + body };
}

// ---------- Region page ----------
function regionPage(region, mapper) {
  const members = sov.filter((c) => c.region === region);
  const url = regionUrl(region);
  const map = mapper.regionMap(region, members);
  const byArea = [...members].sort((a, b) => b.area - a.area);
  const withPop = members.filter((c) => c.population != null && c.populationYear >= MIN_RANK_YEAR).sort((a, b) => b.population - a.population);
  const landlocked = members.filter((c) => c.landlocked), islands = members.filter((c) => c.island);
  const totalArea = members.reduce((s, c) => s + c.area, 0);
  const subs = {};
  members.forEach((c) => { subs[c.subregion] = (subs[c.subregion] || 0) + 1; });
  const subList = Object.entries(subs).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const title = `Countries of ${region}: map, capitals and facts · World Survey`.length <= 60
    ? `Countries of ${region}: map, capitals and facts · World Survey`
    : `${region}: countries, map and capitals · World Survey`;
  const desc = `All ${members.length} countries of ${theRegion(region)} on one map, with capitals, population and area. Largest: ${byArea[0].name}; most populous: ${withPop[0].name}. Then play the ${region} quiz.`.slice(0, 160);
  const crumbItems = [['World Survey', '/'], ['Countries', '/countries/'], [region, url]];
  const lessons = course.byRegion(region);
  const learnUrl = `/learn/${regionSlug(region)}/`;
  const quizzes = quizLinks(region);

  const p = [];
  p.push(`${cap(theRegion(region))} ${region === 'Americas' ? 'have' : 'has'} ${members.length} of the 195 countries in this atlas, in ${subList.length} subregions: ${listAnd(subList.map(([s, n]) => `${esc(s)} (${n})`))}. Together they cover ${int(totalArea)} km².`);
  p.push(`The largest by area is ${link(byArea[0].iso3)} (${areaStr(byArea[0].area)}) and the smallest is ${link(byArea.at(-1).iso3)} (${areaStr(byArea.at(-1).area)}). ${link(withPop[0].iso3)} has the most people, ${people(withPop[0].population)} in ${withPop[0].populationYear}; ${link(withPop.at(-1).iso3)} has the fewest with World Bank data, ${people(withPop.at(-1).population)}.`);
  const shape = [];
  if (landlocked.length) shape.push(`${landlocked.length} ${landlocked.length === 1 ? 'is' : 'are'} landlocked${landlocked.length <= 8 ? ` (${listAnd(landlocked.map((c) => link(c.iso3)))})` : ''}`);
  if (islands.length) shape.push(`${islands.length} ${islands.length === 1 ? 'is an island country' : 'are island countries'} with no land border${islands.length <= 8 ? ` (${listAnd(islands.map((c) => link(c.iso3)))})` : ''}`);
  if (shape.length) p.push(`Of the ${members.length}, ${shape.join(', and ')}.`);

  const rows = members.map((c) => `<tr><td class="flagcell">${flagUrl(c) ? `<img src="${flagUrl(c)}" width="24" height="18" alt="" loading="lazy">` : ''}</td><th scope="row" data-sort="${esc(c.name)}"><a href="${countryUrl(c)}">${esc(c.name)}</a><span class="src">${c.capital ? esc(c.capital) : '—'}</span></th><td class="r" data-sort="${c.population ?? ''}">${c.population != null ? `<span class="num">${int(c.population)}</span><span class="src">${c.populationYear}</span>` : '—'}</td><td class="r" data-sort="${c.area}"><span class="num">${areaStr(c.area).replace(' km²', '')}</span></td></tr>`).join('');

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', '@id': SITE + url, url: SITE + url, name: title, description: desc, inLanguage: 'en', dateModified: GENERATED, isPartOf: { '@type': 'WebSite', name: 'World Survey', url: `${SITE}/` }, about: { '@type': 'Place', name: region } },
      breadcrumbLd(crumbItems),
      { '@type': 'ItemList', name: `Countries of ${region}`, numberOfItems: members.length, itemListElement: members.map((c, k) => ({ '@type': 'ListItem', position: k + 1, name: c.name, url: SITE + countryUrl(c) })) },
    ],
  };
  const body = `
${mast(url)}
<main class="page">
${crumbs(crumbItems)}
<header class="block title">
<div class="tb-head"><span>Region sheet · ${members.length} countries</span><span>${latLngStr([map.centre[1], map.centre[0]])}</span></div>
<div class="tb-body"><h1>${esc(region)}</h1><p class="deck">The ${members.length} countries of ${esc(theRegion(region))}: map, capitals, population and area</p></div>
</header>
<div class="grid">
<figure class="figure wide" id="map"><div class="frame">${map.svg}</div><figcaption>The ${members.length} countries of ${esc(theRegion(region))} shaded and outlined; small states ringed. Orthographic projection centred on <b>${latLngStr([map.centre[1], map.centre[0]])}</b>; the scale bar is true at the centre.</figcaption></figure>
<section class="prose measure">${p.map((x, k) => `<p${k === 0 ? ' class="lead"' : ''}>${x}</p>`).join('')}
<div class="actions actions--after"><a class="btn btn--go" href="${quizUrl('find', region)}">${ICON.play}${esc(routeH1(quizUrl('find', region)))}</a><div class="btn-pair"><a class="btn" href="${quizUrl('flagquiz', region)}">${ICON.flag}${esc(routeH1(quizUrl('flagquiz', region)))}</a><a class="btn" href="/atlas/">${ICON.globe}Open the atlas</a></div></div></section>
<section class="section measure" id="list"><h2>All ${members.length} countries <small>A–Z</small></h2>
<div class="table-wrap"><table class="ruled ctable"><thead><tr><th scope="col" class="flagcell"><span class="sr-only">Flag</span></th><th scope="col" aria-sort="ascending" data-sort-type="text">Country<span class="src">Capital</span></th><th scope="col" class="r" data-sort-type="number">Population</th><th scope="col" class="r" data-sort-type="number">Area km²</th></tr></thead><tbody>${rows}</tbody>
<caption>Population: World Bank, latest value (year under each figure), CC BY 4.0. Area and capitals: world-countries (ODbL 1.0).</caption></table></div></section>
<section class="section measure" id="learn"><h2>Learn and play <small>${lessons.length} lessons, ${quizzes.length} quizzes</small></h2><div class="more">
<div><h3><a href="${learnUrl}">${esc(routeH1(learnUrl))}</a>: ${lessons.length} lessons</h3><ol class="ranked lessons">${lessons.map((l) => `<li><a href="${l.path}">${esc(l.name)}</a><span class="sub">Lesson ${l.number} · ${lessonNames(l)}</span></li>`).join('')}</ol></div>
<div><h3>Quizzes</h3><ul class="regions">${quizzes.map(([u, t]) => `<li><a href="${u}">${esc(t)}</a></li>`).join('')}</ul></div>
<div><h3>Where its countries rank</h3><ul class="regions">${LISTS.map((l) => `<li><a href="${listPath(l.slug)}">${esc(l.label)}</a></li>`).join('')}<li><a href="${LISTS_INDEX}">All lists</a></li><li><a href="${COMPARE_INDEX}">Compare neighbours</a></li></ul></div>
</div></section>
<nav class="measure wide" aria-label="Regions"><h2 class="h2">Other regions</h2>${regionLinks(region)}</nav>
</div>
</main>
${colophon}`;
  return { url, title, desc, html: head({ title, desc, url, jsonld }) + body };
}

// ---------- Index ----------
function indexPage() {
  const url = '/countries/';
  const title = 'Countries of the world: maps, flags and facts · World Survey';
  const counts = REGIONS.map((r) => [r, sov.filter((c) => c.region === r).length]).sort((a, b) => b[1] - a[1]);
  const desc = `All 195 countries by region: ${counts.map(([r, n]) => `${r} ${n}`).join(', ')}. Each has a locator map, flag, capital, neighbours and facts.`;
  const crumbItems = [['World Survey', '/'], ['Countries', url]];
  const sections = REGIONS.map((r) => {
    const list = sov.filter((c) => c.region === r);
    return `<section class="reg wide" id="${regionSlug(r)}"><h2 class="h2"><a href="${regionUrl(r)}">${r}</a> <small class="num">${list.length}</small></h2><ul class="clist">${list.map((c) => `<li><a href="${countryUrl(c)}">${flagUrl(c) ? `<img src="${flagUrl(c)}" width="28" height="21" alt="" loading="lazy">` : ''}<span>${esc(c.name)}</span></a></li>`).join('')}</ul></section>`;
  }).join('');
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', '@id': SITE + url, url: SITE + url, name: title, description: desc, inLanguage: 'en', dateModified: GENERATED, isPartOf: { '@type': 'WebSite', name: 'World Survey', url: `${SITE}/` } },
      breadcrumbLd(crumbItems),
    ],
  };
  const body = `
${mast(url)}
<main class="page">
${crumbs(crumbItems)}
<header class="block title">
<div class="tb-head"><span>Sheet index · 195 countries</span><span>5 regions</span></div>
<div class="tb-body"><h1 class="l">Countries of the world</h1><p class="deck">A survey sheet for every country: locator map, flag, capital, neighbours and how it compares</p></div>
</header>
<div class="grid">
<section class="prose measure wide"><p class="lead">This atlas covers 195 countries: the 193 member states of the United Nations plus the two UN observer states, Vatican City and Palestine. Each sheet below has a locator map, the flag, quick facts, World Bank figures with their year where the World Bank publishes them, and a link to find the country on the World Survey globe.</p>${regionLinks(null)}</section>
${sections}
</div>
</main>
${colophon}`;
  return { url, title, desc, html: head({ title, desc, url, jsonld }) + body };
}

// ---------- Write ----------
async function copyDir(from, to, filter = () => true) {
  await mkdir(to, { recursive: true });
  for (const f of await readdir(from)) if (filter(f)) await copyFile(path.join(from, f), path.join(to, f));
}

const t0 = Date.now();
if (!ONLY.size) await rm(path.join(OUT, 'countries'), { recursive: true, force: true });
await mkdir(path.join(OUT, 'assets'), { recursive: true });
await copyFile(path.join(ROOT, 'assets/encyclopedia.css'), path.join(OUT, 'assets/encyclopedia.css'));
if (WITH_ASSETS) {
  await copyDir(path.join(ROOT, 'assets/fonts'), path.join(OUT, 'assets/fonts'));
  await copyDir(path.join(ROOT, 'assets/flags'), path.join(OUT, 'assets/flags'), (f) => f.endsWith('.svg'));
  for (const f of ['icon.svg', 'og.png']) if (await exists(path.join(ROOT, 'assets', f))) await copyFile(path.join(ROOT, 'assets', f), path.join(OUT, 'assets', f));
}
// The share images go with the pages that name them, so a page never points at a file that is not there.
if (ogImages.size) {
  if (!ONLY.size) await rm(path.join(OUT, 'assets/og'), { recursive: true, force: true });
  await copyDir(ogDir, path.join(OUT, 'assets/og'), (f) => f.endsWith('.png'));
}

const mapper = createMapper(topo, cj.countries, marine);
const pages = [];
pages.push(indexPage());
const urlsAll = ['/', '/countries/', ...REGIONS.map(regionUrl), ...sov.map(countryUrl)];
if (!ONLY.size) for (const r of REGIONS) pages.push(regionPage(r, mapper));
sov.forEach((c, i) => { if (!ONLY.size || ONLY.has(c.iso3)) pages.push(countryPage(c, i, mapper)); });

for (const p of pages) {
  const dir = path.join(OUT, p.url);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), p.html);
}

const urls = urlsAll;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${GENERATED}</lastmod></url>`).join('\n')}\n</urlset>\n`;
await writeFile(path.join(OUT, 'sitemap.xml'), sitemap);
await writeFile(path.join(OUT, 'robots-sitemap.txt'), `Sitemap: ${SITE}/sitemap.xml\n`);

const sizes = pages.map((p) => Buffer.byteLength(p.html)).sort((a, b) => a - b);
console.log(`encyclopedia: ${pages.length} pages (195 countries, 5 regions, index), sitemap ${urls.length} URLs, max ${(sizes.at(-1) / 1024).toFixed(1)} KB, median ${(sizes[sizes.length >> 1] / 1024).toFixed(1)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
