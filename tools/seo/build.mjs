// Search and AI-search layer for World Survey. Runs on a built dist/ after the encyclopedia step:
//
//   node tools/seo/build.mjs <dist>
//
// Writes, from the game shell <dist>/index.html, the route contract src/routes.js and the course the game
// builds (src/game/course.js):
//   <dist>/index.html and <dist><path>index.html     one pre-rendered shell per route: title, description,
//                                                     canonical, Open Graph, Twitter, robots, JSON-LD,
//                                                     Speculation Rules and a crawlable block in
//                                                     <main id="panel"> the app replaces. Region quiz pages
//                                                     list their countries, /learn/ pages their lessons
//   <dist>/learn/<lesson>/index.html                  one shell per lesson, indexable, self-canonical
//   <dist>/atlas/<slug>/index.html                    195 atlas shells, noindex, canonical to /countries/<slug>/
//   <dist>/sitemap.xml                                indexable routes and lessons, the encyclopedia's entries,
//                                                     and the reference pages when <dist>/lists/ is built
//   <dist>/robots.txt                                 allow all, named search and AI crawlers, Sitemap line
//   <dist>/llms.txt, <dist>/llms-full.txt             llmstxt.org summary and a fact line per country
//   <dist>/manifest.webmanifest, icons                web app manifest; icons copied from assets/icons/
//   <dist>/<key>.txt                                  the IndexNow key file (see indexnow.mjs)
//
// Idempotent: it strips what it added before, so running it twice gives the same files. No network.
// SOURCE_DATE_EPOCH (seconds) pins the build date used for <lastmod> and "Generated".
import { readFile, writeFile, mkdir, copyFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, SITE, REGION_SLUGS, REGION_COUNT, regionSlug } from '../../src/routes.js';
import { buildCourse } from '../../src/game/course.js';
import { FLAG_PRESETS, CAPITAL_PRESETS } from '../../src/game/modes.js';
import { SITE as ENC_SITE, REGIONS, slug, esc, int, fixed, people, usd, listAnd } from '../encyclopedia/lib.mjs';
import { areaStr, theName, count } from '../encyclopedia/prose.mjs';
import { speculationTag } from '../encyclopedia/speculation.mjs';
import { LISTS, LISTS_INDEX, COMPARE_INDEX, SITE_MAP, listPath, comparePairs, referencePaths } from '../reference/urls.mjs';
import { head as staticHead, mast as staticMast, colophon as staticFoot, crumbs as staticCrumbs, breadcrumbLd as staticCrumbLd, webSite as STATIC_SITE } from '../reference/chrome.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const outArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!outArg) {
  console.error('usage: node tools/seo/build.mjs <dist>');
  process.exit(2);
}
const OUT = path.resolve(process.cwd(), outArg);
const t0 = Date.now();

const fail = (msg) => {
  console.error(`seo build failed: ${msg}`);
  process.exit(1);
};
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
// Function replacements everywhere: page text contains "$" (US$) that a string replacement would expand.
const sub = (s, rx, fn) => s.replace(rx, fn);

if (SITE !== ENC_SITE) fail(`src/routes.js SITE ${SITE} differs from the encyclopedia's ${ENC_SITE}`);
const BUILD_DATE = (process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000) : new Date()).toISOString().slice(0, 10);

// ---------- Inputs ----------
const shellFile = path.join(OUT, 'index.html');
if (!(await exists(shellFile))) fail(`${shellFile} not found; run after build.py has copied the game`);
const SHELL = await readFile(shellFile, 'utf8');
const cj = await readJson(path.join(ROOT, 'data/countries.json'));
const encDoc = await readJson(path.join(ROOT, 'data/encyclopedia.json'));
const enc = encDoc.countries;
const all = new Map(cj.countries.map((c) => [c.iso3, c]));
const sov = cj.countries.filter((c) => c.sovereign).sort((a, b) => a.name.localeCompare(b.name, 'en'));
if (sov.length !== 195) fail(`expected 195 sovereign countries, got ${sov.length}`);
for (const c of sov) if (!enc[c.iso3]) fail(`data/encyclopedia.json has no ${c.iso3}`);
const slugs = new Set(sov.map((c) => slug(c.name)));
if (slugs.size !== 195) fail('two countries share a slug');

const byPath = new Map(ROUTES.map((r) => [r.path, r]));
for (const r of ROUTES) {
  if (!/^\/([a-z0-9-]+\/)*$/.test(r.path)) fail(`route path ${r.path} is not a /lower-case/trailing-slash/ path`);
  if (r.path.startsWith('/countries/')) fail(`route ${r.path} collides with the encyclopedia`);
  for (const k of ['title', 'description', 'h1', 'intro']) if (!r[k]) fail(`route ${r.path} has no ${k}`);
}
const HOME = byPath.get('/');
if (!HOME) fail('src/routes.js has no / route');

// ---------- Contract checks: regions and the course ----------
if (Object.values(REGION_SLUGS).slice().sort().join() !== REGIONS.slice().sort().join()) fail('REGION_SLUGS in src/routes.js does not name the five regions');
for (const r of REGIONS) {
  if (regionSlug(r) !== slug(r)) fail(`region slug for ${r} differs between src/routes.js and the encyclopedia`);
  const n = sov.filter((c) => c.region === r).length;
  if (REGION_COUNT[r] !== n) fail(`REGION_COUNT.${r} is ${REGION_COUNT[r]} in src/routes.js but the data has ${n} countries`);
}
const course = buildCourse(cj.countries);
const lessonOf = new Map();
for (const l of course.lessons) {
  if (byPath.has(l.path)) fail(`lesson ${l.path} collides with a route`);
  if (!/^\/learn\/[a-z0-9-]+\/$/.test(l.path)) fail(`lesson path ${l.path} is not /learn/<slug>/`);
  for (const iso of l.iso3) {
    if (!all.get(iso)?.sovereign) fail(`lesson ${l.slug} teaches ${iso}, which is not one of the 195`);
    if (lessonOf.has(iso)) fail(`${iso} is taught by two lessons`);
    lessonOf.set(iso, l);
  }
}
for (const c of sov) if (!lessonOf.has(c.iso3)) fail(`no lesson teaches ${c.iso3}`);
if (new Set(course.lessons.map((l) => l.path)).size !== course.lessons.length) fail('two lessons share a path');

// ---------- Route families (for breadcrumbs and the related-links list) ----------
// A chooser route (/flags/, /capitals/, /higher-or-lower/) is the parent of the games it offers; the game's own
// preset lists say which. A region quiz (/play/find/europe/) sits under its mode page, a region of the course
// under /learn/.
const modePath = (m) => `/play/${m}/`;
const CHOOSERS = {
  flags: { kids: FLAG_PRESETS.map(modePath), label: 'flag games' },
  capitals: { kids: CAPITAL_PRESETS.map(modePath), label: 'capital games' },
  higherlower: { kids: ROUTES.filter((r) => r.mode === 'higherlower').map((r) => r.path), label: 'Higher or lower games' },
};
const parentOf = new Map();
const HUBS = ROUTES.filter((r) => r.view === 'chooser').map((r) => r.path);
for (const p of HUBS) {
  const set = CHOOSERS[byPath.get(p).which];
  if (!set?.kids.length) fail(`chooser ${p} (which: ${byPath.get(p).which}) has no games listed; add its presets to CHOOSERS in tools/seo/build.mjs`);
  for (const k of set.kids) {
    if (!byPath.has(k)) fail(`${p} offers ${k}, which is not a route`);
    parentOf.set(k, p);
  }
}
const REGION_QUIZ = ROUTES.filter((r) => r.view === 'play' && r.region);
for (const r of REGION_QUIZ) {
  if (!byPath.has(modePath(r.mode)) || !REGIONS.includes(r.region)) fail(`region quiz ${r.path} has no mode page or an unknown region`);
  if (r.path !== `${modePath(r.mode)}${regionSlug(r.region)}/`) fail(`region quiz ${r.path} is not /play/<mode>/<region>/`);
  parentOf.set(r.path, modePath(r.mode));
}
const LEARN = '/learn/';
const LEARN_REGIONS = ROUTES.filter((r) => r.view === 'learn' && r.region);
for (const r of LEARN_REGIONS) parentOf.set(r.path, LEARN);
for (const p of [LEARN, '/atlas/', '/about/']) if (!byPath.has(p)) fail(`src/routes.js has no ${p}`);
for (const r of REGIONS) if (!byPath.has(`${LEARN}${slug(r)}/`)) fail(`src/routes.js has no ${LEARN}${slug(r)}/`);
// Games that stand on their own on the home sheet: the daily, and play modes outside a chooser.
const CORE = ROUTES.filter((r) => r.view === 'daily' || (['play', 'blitz'].includes(r.view) && !r.region && !parentOf.has(r.path))).map((r) => r.path);
const HL = CHOOSERS.higherlower.kids;

const theRegion = (r) => (r === 'Americas' ? 'the Americas' : r);
const regionUrl = (r) => `/countries/${slug(r)}/`;
const learnUrl = (r) => `${LEARN}${slug(r)}/`;
const countryUrl = (c) => `/countries/${slug(c.name)}/`;
const flagUrl = (c) => `/${c.flag}`;
const shortH1 = (r) => r.h1.replace(/^Higher or lower: /, '');
const crumbName = (r) => (r.mode === 'higherlower' ? shortH1(r) : r.h1);
const regionQuizzes = (where) => REGION_QUIZ.filter(where).map((r) => r.path);

const L = (href, label) => ({ href, label: label ?? byPath.get(href).h1 });
const maybe = (href, label) => (byPath.has(href) ? [L(href, label)] : []);
function related(r) {
  const others = (list) => list.filter((p) => p !== r.path).map((p) => L(p));
  const hub = HUBS.includes(parentOf.get(r.path)) ? parentOf.get(r.path) : null;
  const regionKids = regionQuizzes((x) => parentOf.get(x.path) === r.path).map((p) => L(p));
  if (r.path === '/') return { label: 'Games', items: [...[...CORE, ...HUBS, LEARN, '/atlas/'].map((p) => L(p)), L('/countries/', 'All 195 countries'), L(LISTS_INDEX, 'Lists and rankings'), L(COMPARE_INDEX, 'Compare neighbouring countries'), L('/about/'), L(SITE_MAP, 'Site map: every page')] };
  if (r.view === 'chooser') {
    const set = CHOOSERS[r.which];
    return r.which === 'higherlower'
      ? { label: 'Measures', items: set.kids.map((p) => L(p, shortH1(byPath.get(p)))) }
      : { label: set.label[0].toUpperCase() + set.label.slice(1), items: set.kids.map((p) => L(p)) };
  }
  if (r.view === 'play' && r.region) {
    const parent = byPath.get(parentOf.get(r.path));
    return {
      label: `More on ${theRegion(r.region)}`,
      items: [
        ...regionQuizzes((x) => x.region === r.region && x.path !== r.path).map((p) => L(p)),
        L(learnUrl(r.region)),
        L(regionUrl(r.region), `Countries of ${theRegion(r.region)}: map and facts`),
        ...regionQuizzes((x) => x.mode === r.mode && x.path !== r.path).map((p) => L(p)),
        L(parent.path, `${parent.h1}: all 195 countries`),
      ],
    };
  }
  if (hub && r.mode === 'higherlower') return { label: 'Other measures', items: [...HL.filter((p) => p !== r.path).map((p) => L(p, shortH1(byPath.get(p)))), L(hub, 'All Higher or lower games')] };
  if (hub) {
    const set = CHOOSERS[byPath.get(hub).which];
    return { label: `More ${set.label}`, items: [...others(set.kids), ...regionKids, L(hub, `All ${set.label}`)] };
  }
  if (CORE.includes(r.path)) return { label: 'More games', items: [...regionKids, ...others(CORE), ...HUBS.map((p) => L(p)), L(LEARN), L('/atlas/')] };
  if (r.path === LEARN) return { label: 'The course by region', items: [...LEARN_REGIONS.map((x) => L(x.path)), ...maybe('/review/'), L('/countries/', 'All 195 countries'), L('/', 'All games')] };
  if (r.view === 'learn' && r.region) {
    return {
      label: 'More of the course',
      items: [
        ...LEARN_REGIONS.filter((x) => x.path !== r.path).map((x) => L(x.path)),
        L(LEARN, `Field course: all ${course.total} lessons`),
        L(regionUrl(r.region), `Countries of ${theRegion(r.region)}: map and facts`),
        ...regionQuizzes((x) => x.region === r.region).map((p) => L(p)),
      ],
    };
  }
  if (r.path === '/review/') return { label: 'Learn', items: [L(LEARN), ...maybe('/daily/'), L('/', 'All games')] };
  if (r.path === '/atlas/') return { label: 'Country pages', items: [L('/countries/', 'All 195 countries'), ...REGIONS.map((g) => L(regionUrl(g), `Countries of ${theRegion(g)}`)), L(LISTS_INDEX, 'Lists and rankings'), ...maybe('/play/find/')] };
  if (r.path === '/medals/') return { label: 'Play', items: [...maybe('/daily/'), ...maybe('/play/find/'), L(LEARN), L('/atlas/'), L('/', 'All games')] };
  if (r.path === '/about/') return { label: 'Explore', items: [L('/', 'Play World Survey'), L('/countries/', 'All 195 countries'), L(LISTS_INDEX, 'Lists and rankings'), L(LEARN), L('/atlas/'), L(SITE_MAP, 'Site map: every page')] };
  return { label: 'Games', items: [L('/', 'All games')] };
}
function crumbsFor(r) {
  const chain = [];
  for (let p = r.path; p; p = parentOf.get(p)) chain.unshift(p);
  return [['World Survey', '/'], ...chain.map((p) => [crumbName(byPath.get(p)), p])];
}

// ---------- Crawlable content beyond the intro ----------
// What a region quiz covers, the course outline, a region's lessons. Plain lists with links to the country
// pages: the app replaces the whole block on boot, so this is for crawlers and readers without JavaScript.
const cname = (iso) => all.get(iso).name;
const flagImg = (c, w, h) => `<img src="${flagUrl(c)}" alt="Flag of ${esc(theName(c.name))}" width="${w}" height="${h}" loading="lazy">`;
const lessonItem = (l) => `<li><a href="${l.path}">${esc(l.name)}</a>: ${esc(listAnd(l.iso3.map(cname)))}</li>`;
const lessonList = (lessons) => `<ol class="seo-shell__list" start="${lessons[0].number}">${lessons.map(lessonItem).join('')}</ol>`;
function extraFor(r) {
  // Home: a direct link to every country page, so none is more than one link from the front door.
  if (r.path === '/') return `<h2>All ${sov.length} countries, A to Z</h2>\n<ul class="seo-shell__list">${sov.map((c) => `<li><a href="${countryUrl(c)}">${esc(c.name)}</a></li>`).join('')}</ul>\n`;
  if (r.view === 'play' && r.region) {
    const members = sov.filter((c) => c.region === r.region);
    const of = theRegion(r.region);
    if (r.mode === 'capitals') {
      const withCap = members.filter((c) => c.capital).sort((a, b) => a.capital.localeCompare(b.capital, 'en'));
      return `<h2>The ${withCap.length} capitals of ${esc(of)}</h2>\n<ul class="seo-shell__list">${withCap.map((c) => `<li>${esc(c.capital)}, <a href="${countryUrl(c)}">${esc(c.name)}</a></li>`).join('')}</ul>\n`;
    }
    if (r.mode === 'flagquiz') {
      const withFlag = members.filter((c) => c.flag);
      return `<h2>The ${withFlag.length} flags of ${esc(of)}</h2>\n<ul class="seo-shell__list">${withFlag.map((c) => `<li>${flagImg(c, 24, 18)}<a href="${countryUrl(c)}">${esc(c.name)}</a></li>`).join('')}</ul>\n`;
    }
    return `<h2>The ${members.length} countries of ${esc(of)}</h2>\n<ul class="seo-shell__list">${members.map((c) => `<li><a href="${countryUrl(c)}">${esc(c.name)}</a></li>`).join('')}</ul>\n`;
  }
  if (r.path === LEARN) {
    return LEARN_REGIONS.map((x) => {
      const lessons = course.byRegion(x.region);
      return `<h2><a href="${x.path}">${esc(x.region)}</a>: ${lessons.length} lessons, ${REGION_COUNT[x.region]} countries</h2>\n${lessonList(lessons)}\n`;
    }).join('');
  }
  if (r.view === 'learn' && r.region) {
    const lessons = course.byRegion(r.region);
    return `<h2>${lessons.length} lessons</h2>\n${lessonList(lessons)}\n`;
  }
  return '';
}

// ---------- Structured data ----------
const AUTHOR = { '@type': 'Person', name: 'Aimantas', url: 'https://aimantas.com/' };
const OG_IMAGE = `${SITE}/assets/og.png`;
const OG_ALT = 'World Survey: a shaded relief globe of Europe and Africa beside the sheet index of game modes';
const WEBSITE = { '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'World Survey', url: `${SITE}/` };
const breadcrumbLd = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + url })),
});
// What a play route is, in schema.org terms: a Quiz (a LearningResource) about a subject, free, in English,
// covering a region where the route has one. Every property used here exists on the type it is on.
const QUIZ_ABOUT = {
  find: 'Countries of the world', name: 'Countries of the world', streak: 'World geography',
  capitals: 'Capital cities', capitalquiz: 'Capital cities',
  flagquiz: 'Flags of the world', lookalikes: 'Flags of the world', flagblitz: 'Flags of the world', flags: 'Flags of the world', flagmatch: 'Flags of the world',
  higherlower: 'Country statistics',
};
const place = (region) => ({ '@type': 'Place', name: region });
const plainTitle = (r) => r.title.replace(/ · World Survey$/, '');
const webPage = (url, title, description, more = {}) => ({ '@type': 'WebPage', '@id': url, url, name: title, description, inLanguage: 'en', isPartOf: WEBSITE, ...more });
const quizLd = (r, url) => ({
  '@type': 'Quiz', '@id': `${url}#quiz`, name: plainTitle(r), description: r.description, url,
  about: { '@type': 'Thing', name: QUIZ_ABOUT[r.mode] ?? 'World geography' },
  educationalUse: 'self-assessment', learningResourceType: 'quiz', isAccessibleForFree: true, inLanguage: 'en',
  ...(r.region ? { spatialCoverage: place(r.region) } : {}),
  author: AUTHOR,
});
// The course: one Course on /learn/, a Syllabus section per region page, a LearningResource per lesson.
const COURSE_ID = `${SITE}${LEARN}#course`;
const courseRef = () => ({ '@type': 'Course', '@id': COURSE_ID, name: plainTitle(byPath.get(LEARN)), url: SITE + LEARN });
const lessonRef = (l) => ({ '@type': 'LearningResource', '@id': `${SITE}${l.path}#lesson`, name: l.name, url: SITE + l.path, position: l.number });
const sectionId = (r) => `${SITE}${r.path}#section`;

function routeLd(r) {
  const url = SITE + r.path;
  if (r.path === '/') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        { ...WEBSITE, description: r.description, inLanguage: 'en', publisher: AUTHOR },
        {
          '@type': 'VideoGame', '@id': `${SITE}/#game`, name: 'World Survey', description: r.description, url,
          genre: ['Educational', 'Quiz', 'Geography'], gamePlatform: 'Web browser', applicationCategory: 'GameApplication', operatingSystem: 'Any',
          isAccessibleForFree: true, inLanguage: 'en', author: AUTHOR, publisher: AUTHOR, image: OG_IMAGE,
        },
      ],
    };
  }
  const graph = [];
  if (r.mode) {
    graph.push(webPage(url, r.title, r.description, { mainEntity: { '@id': `${url}#quiz` } }), quizLd(r, url));
  } else if (r.path === LEARN) {
    graph.push(webPage(url, r.title, r.description, { mainEntity: { '@id': COURSE_ID } }), {
      ...courseRef(), description: r.description, provider: AUTHOR, inLanguage: 'en', isAccessibleForFree: true,
      about: { '@type': 'Thing', name: 'Countries of the world' },
      syllabusSections: LEARN_REGIONS.map((x) => ({
        '@type': 'Syllabus', '@id': sectionId(x), name: plainTitle(x), url: SITE + x.path,
        description: `${course.byRegion(x.region).length} lessons on the ${REGION_COUNT[x.region]} countries of ${theRegion(x.region)}.`,
      })),
      hasPart: course.lessons.map(lessonRef),
    });
  } else if (r.view === 'learn' && r.region) {
    graph.push(webPage(url, r.title, r.description, { mainEntity: { '@id': sectionId(r) } }), {
      '@type': 'Syllabus', '@id': sectionId(r), name: plainTitle(r), description: r.description, url,
      inLanguage: 'en', isAccessibleForFree: true, spatialCoverage: place(r.region), isPartOf: courseRef(),
      hasPart: course.byRegion(r.region).map(lessonRef),
    });
  } else {
    graph.push(webPage(url, r.title, r.description));
  }
  graph.push(breadcrumbLd(crumbsFor(r)));
  return { '@context': 'https://schema.org', '@graph': graph };
}

// ---------- Shell rendering ----------
const MANAGED_HEAD = [
  /<meta\s+name="description"[^>]*>\n?/g,
  /<meta\s+name="robots"[^>]*>\n?/g,
  /<link\s+rel="canonical"[^>]*>\n?/g,
  /<meta\s+property="og:[^"]*"[^>]*>\n?/g,
  /<meta\s+name="twitter:[^"]*"[^>]*>\n?/g,
  /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>\n?/g,
  /<script\s+type="speculationrules">[\s\S]*?<\/script>\n?/g,
];
const MAIN = /(<main\b[^>]*\bid="panel"[^>]*>)([\s\S]*?)(<\/main>)/;
const OLD_BLOCK = /<section class="seo-shell">[\s\S]*?<\/section>\n?/g;
if (!/<title>[\s\S]*?<\/title>/.test(SHELL)) fail('index.html has no <title>');
if (!MAIN.test(SHELL)) fail('index.html has no <main id="panel">');

function headBlock({ title, description, canonical, url, noindex, ld }) {
  const json = JSON.stringify(ld).replace(/</g, '\\u003c');
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    noindex ? '<meta name="robots" content="noindex,follow">' : null,
    `<link rel="canonical" href="${canonical}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="World Survey">',
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${OG_IMAGE}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(OG_ALT)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${OG_IMAGE}">`,
    `<meta name="twitter:image:alt" content="${esc(OG_ALT)}">`,
    `<script type="application/ld+json">${json}</script>`,
    speculationTag,
  ].filter(Boolean).join('\n') + '\n';
}

// The block must not contain a <section>: the strip pattern above ends at the first </section>.
function shellBlock({ h1, intro, extra = '', links }) {
  if (/<\/?section\b/.test(extra)) fail(`shell content for "${h1}" contains a <section>`);
  const li = links.items.map((i) => `<li><a href="${esc(i.href)}">${esc(i.label)}</a></li>`).join('');
  return `\n<section class="seo-shell">\n<h1>${esc(h1)}</h1>\n<p>${esc(intro)}</p>\n${extra}<nav class="seo-shell__links" aria-label="${esc(links.label)}"><ul>${li}</ul></nav>\n</section>\n`;
}

function render(page) {
  let h = sub(SHELL, /<!--[\s\S]*?-->\n?/g, () => ''); // design notes stay in source
  h = sub(h, /<title>[\s\S]*?<\/title>\n?/, () => '\u0000HEAD\u0000');
  for (const rx of MANAGED_HEAD) h = sub(h, rx, () => '');
  h = sub(h, '\u0000HEAD\u0000', () => headBlock(page));
  h = sub(h, MAIN, (_, open, inner, close) => `${open}${shellBlock(page)}${inner.replace(OLD_BLOCK, '').trim()}${close}`);
  return h;
}

async function writePage(urlPath, html) {
  const dir = path.join(OUT, urlPath);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), html);
}

// ---------- 1. Routes ----------
const pages = [];
for (const r of ROUTES) {
  const url = SITE + r.path;
  pages.push({
    path: r.path, kind: 'route', title: r.title, description: r.description, canonical: url, url, noindex: !!r.noindex,
    ld: routeLd(r), h1: r.h1, intro: r.intro, extra: extraFor(r), links: related(r),
  });
}

// ---------- 2. Lesson shells ----------
// One page per lesson of the course, made the way the atlas shells are but indexable and self-canonical:
// the game serves the lesson at the same address.
const groupPhrase = (l) => (l.group === 'Caribbean' ? 'the Caribbean' : l.group === 'More countries' ? theRegion(l.region) : l.group);
for (const l of course.lessons) {
  const members = l.iso3.map((iso) => all.get(iso));
  const names = listAnd(members.map((c) => c.name));
  const inProse = listAnd(members.map((c) => theName(c.name))); // "the Netherlands, Belgium ..." inside a sentence
  const n = members.length;
  const url = SITE + l.path;
  const title = [`${l.name}: learn ${n} countries · World Survey`, `${l.name}: ${n} countries · World Survey`].find((t) => t.length <= 60) ?? `${l.name}: ${n} countries · World Survey`;
  const lead = `Lesson ${l.number} of ${course.total}: ${names}.`;
  const description = [
    ' Learn where each country is, its flag and its capital on a 3D globe, then find and name them.',
    ' Learn where each one is, its flag and its capital on a 3D globe.',
    ' Learn them on a 3D globe.',
  ].map((t) => lead + t).find((d) => d.length <= 160) ?? lead;
  const intro = `Lesson ${l.number} of ${course.total} in the World Survey field course teaches ${count(n)} countries of ${groupPhrase(l)}: ${inProse}. Study each one on the 3D globe with its flag and capital, then find and name them; a missed country is asked again before the lesson ends.`;
  const prev = course.lessons[l.number - 2], next = course.lessons[l.number];
  const region = byPath.get(learnUrl(l.region));
  const crumbs = [['World Survey', '/'], [byPath.get(LEARN).h1, LEARN], [region.h1, region.path], [l.name, l.path]];
  const extra = `<h2>Countries in this lesson</h2>\n<ul class="seo-shell__list seo-shell__list--lesson">${members.map((c) => `<li>${c.flag ? flagImg(c, 32, 24) : ''}<a href="${countryUrl(c)}">${esc(c.name)}</a>${c.capital ? `, capital ${esc(c.capital)}` : ''}</li>`).join('')}</ul>\n`;
  pages.push({
    path: l.path, kind: 'lesson', title, description, canonical: url, url, noindex: false, h1: l.name, intro, extra,
    ld: {
      '@context': 'https://schema.org',
      '@graph': [
        webPage(url, title, description, { mainEntity: { '@id': `${url}#lesson` } }),
        {
          ...lessonRef(l), description, learningResourceType: 'lesson', educationalUse: 'instruction', isAccessibleForFree: true, inLanguage: 'en',
          teaches: `Where ${inProse} are on the globe, with their flags and capitals`,
          about: members.map((c) => ({ '@type': 'Country', '@id': `${SITE}${countryUrl(c)}#country`, name: c.name })),
          spatialCoverage: place(l.region), isPartOf: courseRef(), provider: AUTHOR,
        },
        breadcrumbLd(crumbs),
      ],
    },
    links: {
      label: 'More lessons',
      items: [
        ...(prev ? [L(prev.path, `Previous lesson: ${prev.name}`)] : []),
        ...(next ? [L(next.path, `Next lesson: ${next.name}`)] : []),
        L(region.path, `${region.h1}: all ${course.byRegion(l.region).length} lessons`),
        L(LEARN, `Field course: all ${course.total} lessons`),
        ...regionQuizzes((x) => x.region === l.region && x.mode === 'find').map((p) => L(p)),
      ],
    },
  });
}

// ---------- 3. Atlas country shells ----------
for (const c of sov) {
  const s = slug(c.name);
  const p = `/atlas/${s}/`;
  if (byPath.has(p)) fail(`atlas slug ${s} collides with a route`);
  const capital = c.capital ? ` (${c.capital})` : '';
  const h1 = `${c.name} on the globe`;
  const title = `${h1} · World Survey`;
  const description = `See ${c.name} on a 3D relief globe with its flag, capital${capital}, neighbours and key figures, in the free World Survey atlas.`;
  // "in Northern Europe", "in the Caribbean"; Oceania's subregions (Micronesia, Australia and New Zealand) read
  // badly after a country name, so those say "in Oceania".
  const where = !c.subregion || c.region === 'Oceania' ? theRegion(c.region) : c.subregion === 'Caribbean' ? 'the Caribbean' : c.subregion;
  const intro = `${c.name} is in ${where}${c.capital ? `; its capital is ${c.capital}` : ''}. Open it in the atlas to see it on the 3D relief globe with its neighbours outlined, or read the full country sheet with a locator map, flag, quick facts and rankings.`;
  const crumbs = [['World Survey', '/'], ['Atlas', '/atlas/'], [c.name, p]];
  pages.push({
    path: p, kind: 'atlas', title, description, canonical: SITE + countryUrl(c), url: SITE + p, noindex: true, h1, intro,
    ld: {
      '@context': 'https://schema.org',
      '@graph': [
        webPage(SITE + p, title, description, { about: { '@type': 'Country', '@id': `${SITE}${countryUrl(c)}#country`, name: c.name } }),
        breadcrumbLd(crumbs),
      ],
    },
    links: {
      label: `More about ${c.name}`,
      items: [
        L(countryUrl(c), `${c.name}: map, capital, flag and facts`),
        L(regionUrl(c.region), `Countries of ${theRegion(c.region)}`),
        ...regionQuizzes((x) => x.region === c.region && x.mode === 'find').map((q) => L(q)),
        L(lessonOf.get(c.iso3).path, `Learn it: lesson ${lessonOf.get(c.iso3).number}, ${lessonOf.get(c.iso3).name}`),
        L('/atlas/', 'Atlas'),
      ],
    },
  });
}

for (const p of pages) await writePage(p.path, render(p));

// ---------- 4. Sitemap and robots ----------
// Route and lesson entries are written fresh (lastmod = build date). Country pages keep the lastmod the
// encyclopedia gave them. The reference pages (/lists/, /compare/) are listed when they have been built into
// this folder; they are made from the same data as the country pages, so they carry the data's date.
const prevSitemap = (await exists(path.join(OUT, 'sitemap.xml'))) ? await readFile(path.join(OUT, 'sitemap.xml'), 'utf8') : '';
const prev = [...prevSitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
  loc: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1],
  lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1],
})).filter((e) => e.loc?.startsWith(`${SITE}/countries/`));
if (!prev.length) console.error('warning: no encyclopedia sitemap entries found in <dist>/sitemap.xml; writing routes only');

const HAS_REFERENCE = await exists(path.join(OUT, 'lists', 'index.html'));
const refPaths = HAS_REFERENCE ? referencePaths(cj.countries) : [];
const refMissing = [];
for (const p of refPaths) if (!(await exists(path.join(OUT, p, 'index.html')))) refMissing.push(p);
if (refMissing.length) console.error(`warning: ${refMissing.length} reference pages are in the URL contract but not in <dist> (${refMissing.slice(0, 3).join(', ')}${refMissing.length > 3 ? ' …' : ''}); the sitemap lists them and verify will fail`);

const bySlugUrl = new Map(sov.map((c) => [SITE + countryUrl(c), c]));
const regionUrls = new Set(REGIONS.map((r) => SITE + regionUrl(r)));
const lessonPaths = new Set(course.lessons.map((l) => l.path));
const listPaths = new Set([LISTS_INDEX, ...LISTS.map((l) => listPath(l.slug))]);
const priority = (loc) => {
  const p = loc.slice(SITE.length);
  if (p === '/') return '1.0';
  if ([...CORE, ...HUBS, LEARN, '/atlas/', '/countries/'].includes(p)) return '0.8';
  if (regionUrls.has(loc) || parentOf.has(p) || listPaths.has(p)) return '0.7';
  if (bySlugUrl.has(loc) || lessonPaths.has(p)) return '0.6';
  if (p.startsWith(COMPARE_INDEX) && p !== COMPARE_INDEX) return '0.4';
  return '0.5';
};
const entries = new Map();
const add = (loc, lastmod) => { if (!entries.has(loc)) entries.set(loc, { loc, lastmod, priority: priority(loc) }); };
for (const r of ROUTES) if (!r.noindex) add(SITE + r.path, BUILD_DATE);
for (const l of course.lessons) add(SITE + l.path, BUILD_DATE);
for (const e of prev) add(e.loc, e.lastmod || BUILD_DATE);
for (const p of refPaths) add(SITE + p, encDoc.generated || BUILD_DATE);
add(SITE + SITE_MAP, BUILD_DATE);
if (entries.size > 5000) fail(`${entries.size} URLs: split the sitemap into a sitemap index before going past 5,000`);
const imageFor = (loc) => {
  if (loc === `${SITE}/`) return OG_IMAGE;
  const c = bySlugUrl.get(loc);
  return c?.flag ? `${SITE}/${c.flag}` : null;
};
const xmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${[...entries.values()].map((e) => {
  const img = imageFor(e.loc);
  return `  <url><loc>${xmlEsc(e.loc)}</loc><lastmod>${e.lastmod}</lastmod><priority>${e.priority}</priority>${img ? `<image:image><image:loc>${xmlEsc(img)}</image:loc></image:image>` : ''}</url>`;
}).join('\n')}
</urlset>
`;
await writeFile(path.join(OUT, 'sitemap.xml'), sitemap);

// ---------- 4b. The HTML site map ----------
// One static page with a link to every URL in sitemap.xml, grouped the way the site is. It is made from the
// same `entries`, so the two cannot disagree (verify.mjs compares them). Country pages come first: this is the
// page that puts all 195 one link away, A to Z.
{
  const pairs = comparePairs(cj.countries);
  const label = new Map([['/', 'Home: all games'], ['/countries/', 'All countries, by region'], [LISTS_INDEX, 'All lists'], [COMPARE_INDEX, 'All comparisons']]);
  for (const r of ROUTES) if (!label.has(r.path)) label.set(r.path, r.h1);
  for (const l of course.lessons) label.set(l.path, `Lesson ${l.number}: ${l.name}`);
  for (const r of REGIONS) label.set(regionUrl(r), `Countries of ${theRegion(r)}`);
  for (const c of sov) label.set(countryUrl(c), c.name);
  for (const l of LISTS) label.set(listPath(l.slug), l.label);
  for (const x of pairs) label.set(x.path, `${x.a.name} vs ${x.b.name}`);

  const listed = [...entries.keys()].map((loc) => loc.slice(SITE.length)).filter((p) => p !== SITE_MAP);
  const left = new Set(listed);
  const take = (paths) => paths.filter((p) => left.delete(p));
  const flagOf = new Map(sov.map((c) => [countryUrl(c), c]));
  const sections = [
    { id: 'countries', title: 'Countries, A to Z', paths: take(sov.map(countryUrl)) },
    { id: 'regions', title: 'Countries by region', paths: take(['/countries/', ...REGIONS.map(regionUrl)]) },
    { id: 'games', title: 'Games', paths: take(ROUTES.filter((r) => !r.region && r.view !== 'learn').map((r) => r.path)) },
    { id: 'region-quizzes', title: 'Quizzes by region', paths: take(REGION_QUIZ.map((r) => r.path)) },
    { id: 'course', title: 'Field course', paths: take([LEARN, ...LEARN_REGIONS.map((r) => r.path), ...course.lessons.map((l) => l.path)]) },
    { id: 'lists', title: 'Lists', paths: take([LISTS_INDEX, ...LISTS.map((l) => listPath(l.slug))]) },
    { id: 'compare', title: 'Neighbours compared', paths: take([COMPARE_INDEX, ...pairs.map((x) => x.path)]) },
  ].filter((x) => x.paths.length);
  if (left.size) fail(`the site map has no section for ${left.size} sitemap URLs (first: ${[...left][0]})`);
  for (const p of listed) if (!label.has(p)) fail(`the site map has no label for ${p}`);

  const item = (p) => {
    const c = flagOf.get(p);
    return `<li><a href="${p}">${c?.flag ? `<img src="${flagUrl(c)}" width="28" height="21" alt="" loading="lazy">` : ''}<span>${esc(label.get(p))}</span></a></li>`;
  };
  const url = SITE_MAP;
  const title = 'Site map: every page · World Survey';
  const desc = `Every page on World Survey in one place: the games, ${course.total} lessons, ${sov.length} country pages, ${LISTS.length} lists and ${pairs.length} comparisons of neighbouring countries.`;
  const crumbItems = [['World Survey', '/'], ['Site map', url]];
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', '@id': SITE + url, url: SITE + url, name: 'Site map', description: desc, inLanguage: 'en', isPartOf: STATIC_SITE },
      staticCrumbLd(crumbItems),
    ],
  };
  const html = `${staticHead({ title, desc, url, jsonld })}
${staticMast(null)}
<main class="page">
${staticCrumbs(crumbItems)}
<header class="block title">
<div class="tb-head"><span>Site map</span><span>${listed.length} pages</span></div>
<div class="tb-body"><h1 class="l">Site map</h1><p class="deck">Every page on World Survey, one link away</p></div>
</header>
<div class="grid">
<section class="prose measure wide"><p class="lead">This page links to all ${listed.length} pages of World Survey: a page for each of the ${sov.length} countries, the games and the quizzes by region, the ${course.total} lessons of the field course, the lists and the comparisons of neighbouring countries. Search engines read the same list from <a href="/sitemap.xml">sitemap.xml</a>.</p><ul class="regions">${sections.map((x) => `<li><a href="#${x.id}">${esc(x.title)} <span class="num">${x.paths.length}</span></a></li>`).join('')}</ul></section>
${sections.map((x) => `<section class="reg wide" id="${x.id}"><h2 class="h2">${esc(x.title)} <small class="num">${x.paths.length}</small></h2><ul class="clist">${x.paths.map(item).join('')}</ul></section>`).join('\n')}
</div>
</main>
${staticFoot}`;
  await writePage(SITE_MAP, html);
}

const CRAWLERS = [
  'Googlebot', 'Bingbot', 'DuckDuckBot', 'Applebot',
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',
  'Claude-SearchBot', 'Claude-User', 'ClaudeBot',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended', 'CCBot',
];
const robots = `# World Survey, a geography game on a 3D globe: ${SITE}/
# Every public page may be crawled. Pages that should stay out of search results say so with
# <meta name="robots" content="noindex">, so nothing is disallowed here.
# Summary for language models: ${SITE}/llms.txt

User-agent: *
Allow: /

${CRAWLERS.map((ua) => `User-agent: ${ua}\nAllow: /\n`).join('\n')}
Sitemap: ${SITE}/sitemap.xml
`;
await writeFile(path.join(OUT, 'robots.txt'), robots);

// ---------- 5. llms.txt and llms-full.txt ----------
// llms.txt stays a short map (about 15 KB at most): what the site is, one line per page family, where the data
// comes from. The 195 country lines live in llms-full.txt.
const unesc = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
async function pageDesc(urlPath) {
  const f = path.join(OUT, urlPath, 'index.html');
  if (!(await exists(f))) fail(`${urlPath} not found in <dist>; run the encyclopedia (and reference) steps first`);
  const d = (await readFile(f, 'utf8')).match(/<meta name="description" content="([^"]*)"/)?.[1];
  if (!d) fail(`${urlPath} has no meta description`);
  return unesc(d);
}
const wbSource = encDoc.sources.find((s) => /World Bank/.test(s.name));
const wbUpdated = wbSource?.apiLastUpdated;
const retrieved = cj.sources[0]?.retrieved;
const fallbackIso = (cj.sources.find((s) => /fallback/.test(s.what))?.what.split(':')[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const fallbackSov = fallbackIso.filter((i) => all.get(i)?.sovereign).map((i) => all.get(i).name);
const regionCounts = REGIONS.map((r) => `${r} ${sov.filter((c) => c.region === r).length}`).join(', ');
const md = (label, href, note) => `- [${label}](${href}): ${note}`;
const listed = (paths) => paths.map((p) => md(byPath.get(p).h1, SITE + p, byPath.get(p).description));
const REGION_MODES = [...new Set(REGION_QUIZ.map((r) => r.mode))];
// Lists and comparisons are described from their own built pages, and only when they are in this folder.
let referenceSection = '';
if (HAS_REFERENCE && !refMissing.length) {
  const pairs = comparePairs(cj.countries);
  const example = pairs.find((x) => x.path.includes('peru')) ?? pairs[0];
  referenceSection = `## Lists

${md('All lists', SITE + LISTS_INDEX, await pageDesc(LISTS_INDEX))}
${(await Promise.all(LISTS.map(async (l) => md(l.label, SITE + listPath(l.slug), await pageDesc(listPath(l.slug)))))).join('\n')}

## Compare

${md('Compare countries', SITE + COMPARE_INDEX, await pageDesc(COMPARE_INDEX))}

Each pair of the 195 countries that share a land border has a page at ${SITE}/compare/<a>-vs-<b>/, with the two country names in alphabetical order (for example ${SITE}${example.path}): ${pairs.length} pairs.

`;
}

const llms = `# World Survey

> A free geography game on a 3D relief globe, made by Aimantas. Players find countries, pin capitals, match flags and compare country statistics, and every answer is given on the globe. It also has a static atlas with a page for each of the 195 countries. No account and no ads; progress stays in the player's browser.

World Survey covers 195 countries: the 193 member states of the United Nations plus the two UN observer states, Vatican City and Palestine (${regionCounts}). Every game mode, quiz region, lesson, country, list and comparison has its own address, and every address ends with a slash. Statistics are the latest World Bank value for each country, so years can differ between countries; every figure on the country pages shows its year.

## Game modes

${listed(['/', ...CORE]).join('\n')}
${HUBS.filter((h) => byPath.get(h).which !== 'higherlower').map((h) => listed([h, ...CHOOSERS[byPath.get(h).which].kids]).join('\n')).join('\n')}
${HUBS.filter((h) => byPath.get(h).which === 'higherlower').map((h) => `${listed([h])[0]} By measure: ${HL.map((p) => `[${shortH1(byPath.get(p))}](${SITE}${p})`).join(', ')}.`).join('\n')}
${listed(['/atlas/']).join('\n')}

## Quizzes by region

${count(REGION_MODES.length)[0].toUpperCase()}${count(REGION_MODES.length).slice(1)} of the quizzes have a page for each region, at ${SITE}/play/<quiz>/<region>/ with the region as europe, asia, africa, americas or oceania. Each page lists the countries it asks.

${REGION_MODES.map((m) => `- ${byPath.get(modePath(m)).h1} (${byPath.get(modePath(m)).title.replace(/ · World Survey$/, '')}): ${REGION_QUIZ.filter((r) => r.mode === m).map((r) => `[${r.region}](${SITE}${r.path})`).join(', ')}`).join('\n')}

## Field course

${listed([LEARN, ...LEARN_REGIONS.map((r) => r.path)]).join('\n')}

The course has ${course.total} lessons of four to six neighbouring countries. Each lesson has a page at ${SITE}/learn/<lesson>/ (for example ${SITE}${course.lessons[0].path}) naming its countries with their flags and capitals.

## Country encyclopedia

${md('Countries of the world', `${SITE}/countries/`, await pageDesc('/countries/'))}
${(await Promise.all(REGIONS.map(async (r) => md(r, SITE + regionUrl(r), await pageDesc(regionUrl(r)))))).join('\n')}

Every country has a page at ${SITE}/countries/<name>/ (for example ${SITE}/countries/peru/) with a locator map, flag, capital, population, area, neighbours, World Bank figures with their year, rankings and sources.

${referenceSection}## Data sources

- [Natural Earth](https://www.naturalearthdata.com/): 1:50m country boundaries (packaged as world-atlas 2.0.2), 1:10m populated places for capital positions, 1:50m relief imagery and marine area names. Public domain.
- [world-countries 5.1.0 (mledoze/countries)](https://github.com/mledoze/countries): country names, official names, codes, regions, area, land borders, languages, currencies, calling codes and demonyms. Open Database License 1.0 (https://opendatacommons.org/licenses/odbl/1-0/).
- [World Bank World Development Indicators](https://data.worldbank.org/): population, GDP, GDP per capita, life expectancy, urban population, forest area, population growth, internet use and fertility; the latest value per country, with its year${wbUpdated ? ` (data as updated by the World Bank on ${wbUpdated})` : ''}. CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
- [Wikidata](https://www.wikidata.org/): capital position where Natural Earth has no point${fallbackSov.length ? ` (${listAnd(fallbackSov)} among the 195)` : ''}. CC0 1.0.
- [flag-icons 7.6.0](https://github.com/lipis/flag-icons): flags. MIT.
- [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/): globe elevation. GMTED2010 terrain data courtesy of the U.S. Geological Survey; ETOPO1, U.S. National Oceanic and Atmospheric Administration.

Sources retrieved ${retrieved}.

## Optional

- [Country facts in one file](${SITE}/llms-full.txt): one plain-text line per country with official name, capital, region, population, area, GDP, life expectancy and neighbours, each figure with its year and source
- [About World Survey](${SITE}/about/): ${byPath.get('/about/').description}
- [Sitemap](${SITE}/sitemap.xml): every indexable page
- [Aimantas](https://aimantas.com/): the maker's site
`;
await writeFile(path.join(OUT, 'llms.txt'), llms);

const wb = (year) => `${year}, World Bank`;
function factLine(c) {
  const e = enc[c.iso3];
  const parts = [];
  parts.push(`capital ${c.capital ?? 'none listed'}`);
  parts.push(`${c.region}${c.subregion && c.subregion !== c.region ? `, ${c.subregion}` : ''}`);
  parts.push(c.population != null ? `population ${int(c.population)} (${wb(c.populationYear)})` : 'population: no World Bank figure');
  parts.push(`area ${areaStr(c.area)} (world-countries)`);
  parts.push(c.gdp != null ? `GDP ${usd(c.gdp)} (${wb(c.gdpYear)}, current US$)` : 'GDP: no World Bank figure');
  parts.push(c.lifeExpectancy != null ? `life expectancy ${fixed(c.lifeExpectancy, 1)} years (${wb(c.lifeExpectancyYear)})` : 'life expectancy: no World Bank figure');
  const sovNbs = e.neighbours.filter((n) => n.sovereign).map((n) => n.name).sort((a, b) => a.localeCompare(b, 'en'));
  const others = e.neighbours.filter((n) => !n.sovereign).map((n) => n.name);
  const nb = sovNbs.length ? `land neighbours ${sovNbs.join(', ')}` : 'no land neighbours among the 195';
  parts.push(`${nb}${others.length ? `; also borders ${others.join(', ')}` : ''} (world-countries)`);
  const official = e.official && e.official !== c.name ? ` (${e.official})` : '';
  return `- ${c.name}${official}: ${parts.join('; ')}. ${SITE}${countryUrl(c)}`;
}
const llmsFull = `# World Survey: facts for 195 countries

> One line for each of the 195 countries in World Survey (193 UN member states plus the observer states Vatican City and Palestine), from the same data as the country pages at ${SITE}/countries/. Every figure carries its year and source. Generated ${BUILD_DATE}; sources retrieved ${retrieved}.

Sources: population, GDP (current US$) and life expectancy at birth come from the World Bank World Development Indicators (CC BY 4.0), the latest value for each country, so years differ. Official names, capitals, regions, area and land borders come from world-countries 5.1.0 (mledoze/countries, Open Database License 1.0). Land neighbours count only the 195; other areas a country borders are listed after "also borders". A missing figure is marked as missing, not zero.

${sov.map(factLine).join('\n')}
`;
await writeFile(path.join(OUT, 'llms-full.txt'), llmsFull);

// ---------- 6. Manifest and icons ----------
const ICON_SRC = path.join(ROOT, 'assets', 'icons');
const ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.ico'];
for (const f of ICONS) if (!(await exists(path.join(ICON_SRC, f)))) fail(`assets/icons/${f} missing; run node tools/seo/icons.mjs`);
await mkdir(path.join(OUT, 'assets', 'icons'), { recursive: true });
for (const f of ICONS) await copyFile(path.join(ICON_SRC, f), path.join(OUT, 'assets', 'icons', f));
await copyFile(path.join(ICON_SRC, 'favicon.ico'), path.join(OUT, 'favicon.ico'));
await copyFile(path.join(ICON_SRC, 'apple-touch-icon.png'), path.join(OUT, 'apple-touch-icon.png'));
const manifest = {
  id: '/',
  name: 'World Survey: a 3D geography game',
  short_name: 'World Survey',
  description: HOME.description,
  lang: 'en',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#f4f5f0',
  theme_color: '#f4f5f0',
  categories: ['games', 'education'],
  icons: [
    { src: '/assets/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    { src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/assets/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
await writeFile(path.join(OUT, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);

// ---------- 7. IndexNow key file ----------
// IndexNow proves ownership by a key served at /<key>.txt. The key is not a secret (anyone can fetch it); it
// is made once and kept in indexnow-key.txt. Submitting URLs is a separate, manual step: see indexnow.mjs.
const keyFile = path.join(HERE, 'indexnow-key.txt');
let indexNowKey = null;
if (await exists(keyFile)) {
  indexNowKey = (await readFile(keyFile, 'utf8')).trim();
  if (!/^[a-f0-9]{32}$/.test(indexNowKey)) fail('tools/seo/indexnow-key.txt must hold one 32-character hexadecimal key');
  for (const f of await readdir(OUT)) if (/^[a-f0-9]{32}\.txt$/.test(f) && f !== `${indexNowKey}.txt`) await rm(path.join(OUT, f));
  await writeFile(path.join(OUT, `${indexNowKey}.txt`), `${indexNowKey}\n`);
} else {
  console.error('warning: tools/seo/indexnow-key.txt not found; no IndexNow key file written');
}

// ---------- Report ----------
const routeFiles = pages.filter((p) => p.kind === 'route').length;
const lessonFiles = pages.filter((p) => p.kind === 'lesson').length;
const atlasFiles = pages.filter((p) => p.kind === 'atlas').length;
const missingLinks = ['rel="manifest"', 'rel="apple-touch-icon"'].filter((t) => !SHELL.includes(t));
if (missingLinks.length) console.log(`note: index.html has no ${missingLinks.join(' / ')} link yet (see tools/seo/README.md)`);
console.log(`seo: ${routeFiles} route shells (incl. /), ${lessonFiles} lesson shells, ${atlasFiles} atlas shells, sitemap ${entries.size} URLs (${prev.length} country pages kept from the existing sitemap, ${refPaths.length} reference pages${HAS_REFERENCE ? '' : ': /lists/ not built'}), IndexNow key file ${indexNowKey ? 'written' : 'missing'}, robots ${CRAWLERS.length} named crawlers, llms.txt ${(Buffer.byteLength(llms) / 1024).toFixed(1)} KB, llms-full.txt ${sov.length} countries ${(Buffer.byteLength(llmsFull) / 1024).toFixed(1)} KB, manifest + ${ICONS.length} icons, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
