// Checks the search layer of a built World Survey: node tools/seo/verify.mjs <dist>   (exit 1 on failure)
//
// Expected pages come from the contracts, never from a hard-coded count: routes from src/routes.js, lessons
// from buildCourse() in src/game/course.js, atlas and country pages from data/countries.json, and the
// reference pages (/lists/, /compare/) from tools/reference/urls.mjs when those folders are in the output.
// It passes with or without the reference pages; when they are there, they are held to the same rules.
//
// Every page: unique title and description, the right canonical, noindex exactly where intended, no
// document-relative URLs. Shells (routes, lessons, atlas): Open Graph and Twitter tags, one JSON-LD block of
// the expected types with only known schema.org properties, breadcrumbs that resolve and follow the route
// families, Speculation Rules, and the crawlable block with its lists (a region quiz's countries, the course
// outline, a lesson's countries). Country pages: Questions section equal to its FAQPage JSON-LD, links to
// lists, comparisons, the lesson and the region quizzes, the shared footer. Site files: sitemap, robots.txt,
// llms.txt, llms-full.txt, manifest, icons, the IndexNow key file. No "?region=" link anywhere, no private
// markers, outbound hosts on an allowlist.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, SITE, REGION_SLUGS, REGION_COUNT, regionSlug } from '../../src/routes.js';
import { buildCourse } from '../../src/game/course.js';
import { FLAG_PRESETS, CAPITAL_PRESETS } from '../../src/game/modes.js';
import { REGIONS, slug, unesc as unescText, textOf, faqOf } from '../encyclopedia/lib.mjs';
import { LISTS, LISTS_INDEX, COMPARE_INDEX, SITE_MAP, listPath, comparePath, referencePaths } from '../reference/urls.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.resolve(process.cwd(), process.argv[2] ?? 'dist');
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const problems = [];
const warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

const PRIVATE = /\/Users\/|localhost|127\.0\.0\.1|@gmail/i;
const ANALYTICS_SCRIPT = '';
const ANALYTICS_TAG = '<script src="/assets/analytics.js" defer></script>';
const ALLOWED_HOSTS = new Set([
  'geography.aimantas.com', 'aimantas.com', 'schema.org', 'www.sitemaps.org', 'www.google.com',
  'www.naturalearthdata.com', 'github.com', 'opendatacommons.org', 'data.worldbank.org', 'creativecommons.org',
  'www.wikidata.org', 'registry.opendata.aws',
]);
const CRAWLERS = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'CCBot', 'DuckDuckBot'];
const LLMS_SOFT_KB = 15, LLMS_HARD_KB = 18;

async function walk(dir, acc = []) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) await walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
// URL path (or absolute URL on SITE) -> file in OUT, ignoring query and fragment.
const fileFor = (ref) => {
  let p = ref.startsWith(SITE) ? ref.slice(SITE.length) : ref;
  p = decodeURI(p.split('#')[0].split('?')[0]) || '/';
  return p.endsWith('/') ? path.join(OUT, p, 'index.html') : path.join(OUT, p);
};
const attr = (h, rx) => h.match(rx)?.[1];
const unesc = (s) => (s == null ? s : unescText(s));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------- The contracts ----------
const cj = JSON.parse(await readFile(path.join(ROOT, 'data/countries.json'), 'utf8'));
const sov = cj.countries.filter((c) => c.sovereign).sort((a, b) => a.name.localeCompare(b.name, 'en'));
const byIso = new Map(cj.countries.map((c) => [c.iso3, c]));
const countryPath = (c) => `/countries/${slug(c.name)}/`;
const byPath = new Map(ROUTES.map((r) => [r.path, r]));
const course = buildCourse(cj.countries);
const lessonOf = new Map();
for (const l of course.lessons) for (const iso of l.iso3) lessonOf.set(iso, l);

// Regions: the names, slugs and counts in src/routes.js against the data.
if (!same(Object.values(REGION_SLUGS).slice().sort(), REGIONS.slice().sort())) fail('REGION_SLUGS in src/routes.js does not name the five regions');
for (const r of REGIONS) {
  const n = sov.filter((c) => c.region === r).length;
  if (REGION_COUNT[r] !== n) fail(`REGION_COUNT.${r} is ${REGION_COUNT[r]} in src/routes.js, the data has ${n}`);
  if (regionSlug(r) !== slug(r)) fail(`region slug for ${r}: ${regionSlug(r)} in src/routes.js, ${slug(r)} in the encyclopedia`);
}
// The course: every country taught once, lesson numbers in order.
if (lessonOf.size !== sov.length || course.lessons.reduce((n, l) => n + l.iso3.length, 0) !== sov.length) fail(`the course teaches ${lessonOf.size} countries, expected ${sov.length} once each`);
course.lessons.forEach((l, i) => { if (l.number !== i + 1 || l.path !== `/learn/${l.slug}/`) fail(`lesson ${l.slug}: number ${l.number} or path ${l.path} out of step`); });

// Route families, derived the way the game groups them: a chooser's games, a mode's region pages, /learn/.
const modePath = (m) => `/play/${m}/`;
const CHOOSER_KIDS = { flags: FLAG_PRESETS.map(modePath), capitals: CAPITAL_PRESETS.map(modePath), higherlower: ROUTES.filter((r) => r.mode === 'higherlower').map((r) => r.path) };
const parentOf = new Map();
const HUBS = ROUTES.filter((r) => r.view === 'chooser');
for (const h of HUBS) for (const k of CHOOSER_KIDS[h.which] ?? []) parentOf.set(k, h.path);
for (const h of HUBS) if (!CHOOSER_KIDS[h.which]?.length) fail(`chooser ${h.path} (which: ${h.which}) has no known games`);
const REGION_QUIZ = ROUTES.filter((r) => r.view === 'play' && r.region);
for (const r of REGION_QUIZ) parentOf.set(r.path, modePath(r.mode));
const LEARN_REGIONS = ROUTES.filter((r) => r.view === 'learn' && r.region);
for (const r of LEARN_REGIONS) parentOf.set(r.path, '/learn/');
const chainOf = (p) => { const c = []; for (let x = p; x; x = parentOf.get(x)) c.unshift(x); return ['/', ...c]; };
// The mode pages every region must have (the country pages link to them).
for (const m of ['find', 'flagquiz', 'capitals']) for (const r of REGIONS) if (!byPath.has(`${modePath(m)}${slug(r)}/`)) fail(`src/routes.js has no ${modePath(m)}${slug(r)}/`);
for (const r of REGIONS) if (!byPath.has(`/learn/${slug(r)}/`)) fail(`src/routes.js has no /learn/${slug(r)}/`);

// Reference pages: part of the output only once their generator has run.
const HAS_LISTS = await exists(path.join(OUT, 'lists'));
const HAS_COMPARE = await exists(path.join(OUT, 'compare'));
const refPaths = referencePaths(cj.countries);
const refSet = new Set(refPaths);

// ---------- Expected pages ----------
const expected = new Map(); // url path -> { kind, noindex, canonical, ... }
for (const r of ROUTES) expected.set(r.path, { kind: 'route', noindex: !!r.noindex, canonical: SITE + r.path, route: r });
for (const l of course.lessons) {
  if (expected.has(l.path)) fail(`lesson ${l.path} collides with a route`);
  expected.set(l.path, { kind: 'lesson', noindex: false, canonical: SITE + l.path, lesson: l });
}
for (const c of sov) expected.set(`/atlas/${slug(c.name)}/`, { kind: 'atlas', noindex: true, canonical: SITE + countryPath(c), country: c });
expected.set('/countries/', { kind: 'encyclopedia', noindex: false, canonical: `${SITE}/countries/` });
for (const r of REGIONS) expected.set(`/countries/${slug(r)}/`, { kind: 'encyclopedia', noindex: false, canonical: `${SITE}/countries/${slug(r)}/`, region: r });
for (const c of sov) expected.set(countryPath(c), { kind: 'encyclopedia', noindex: false, canonical: SITE + countryPath(c), country: c });
if (HAS_LISTS || HAS_COMPARE) for (const p of refPaths) expected.set(p, { kind: 'reference', noindex: false, canonical: SITE + p });
expected.set(SITE_MAP, { kind: 'sitemap', noindex: false, canonical: SITE + SITE_MAP });
const want = { sitemap: 1, route: ROUTES.length, lesson: course.total, atlas: sov.length, encyclopedia: 1 + REGIONS.length + sov.length, reference: HAS_LISTS || HAS_COMPARE ? refPaths.length : 0 };

const pages = [];
for (const [url, meta] of expected) {
  const file = fileFor(url);
  if (!(await exists(file))) { fail(`missing ${url} (${path.relative(OUT, file)})`); continue; }
  pages.push({ url, ...meta, file, html: await readFile(file, 'utf8') });
}
const allFiles = await walk(OUT);
const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));
for (const f of htmlFiles) {
  const rel = `/${path.relative(OUT, f).split(path.sep).join('/')}`;
  if (rel === '/404.html') continue;
  const url = rel === '/index.html' ? '/' : rel.replace(/index\.html$/, '');
  if (!expected.has(url)) warn(`unexpected HTML page ${rel}`);
}

// ---------- Structured data: the types these builders emit and the schema.org properties each may carry ----------
const T = ['@type', '@id', 'name', 'description', 'url'];
const SCHEMA = {
  WebSite: [...T, 'inLanguage', 'publisher'],
  WebPage: [...T, 'inLanguage', 'isPartOf', 'about', 'mainEntity', 'dateModified', 'primaryImageOfPage'],
  CollectionPage: [...T, 'inLanguage', 'isPartOf', 'about', 'dateModified'],
  FAQPage: [...T, 'inLanguage', 'isPartOf', 'about', 'mainEntity'],
  Question: ['@type', 'name', 'acceptedAnswer'],
  Answer: ['@type', 'text'],
  VideoGame: [...T, 'genre', 'gamePlatform', 'applicationCategory', 'operatingSystem', 'isAccessibleForFree', 'inLanguage', 'author', 'publisher', 'image'],
  Quiz: [...T, 'about', 'educationalUse', 'learningResourceType', 'isAccessibleForFree', 'inLanguage', 'spatialCoverage', 'author'],
  Course: [...T, 'provider', 'inLanguage', 'isAccessibleForFree', 'about', 'syllabusSections', 'hasPart'],
  Syllabus: [...T, 'inLanguage', 'isAccessibleForFree', 'spatialCoverage', 'isPartOf', 'hasPart'],
  LearningResource: [...T, 'position', 'learningResourceType', 'educationalUse', 'isAccessibleForFree', 'inLanguage', 'teaches', 'about', 'spatialCoverage', 'isPartOf', 'provider'],
  BreadcrumbList: ['@type', 'itemListElement'],
  ItemList: ['@type', 'name', 'numberOfItems', 'itemListElement'],
  ListItem: ['@type', 'position', 'name', 'item', 'url'],
  Person: ['@type', 'name', 'url'],
  Thing: ['@type', 'name'],
  Place: ['@type', 'name', 'containedInPlace'],
  Country: [...T, 'alternateName', 'image', 'geo', 'containedInPlace', 'containsPlace'],
  City: ['@type', 'name', 'geo'],
  GeoCoordinates: ['@type', 'latitude', 'longitude'],
  ImageObject: ['@type', 'url', 'width', 'height'],
};
function checkSchema(node, where) {
  if (Array.isArray(node)) { for (const x of node) checkSchema(x, where); return; }
  if (!node || typeof node !== 'object') return;
  const type = node['@type'];
  if (type) {
    const allowed = SCHEMA[type];
    if (!allowed) fail(`${where}: JSON-LD type ${type} is not one this site is checked for`);
    else for (const k of Object.keys(node)) if (!allowed.includes(k)) fail(`${where}: ${type} has property "${k}", which is not on the checked list for that type`);
  } else if (Object.keys(node).some((k) => k !== '@id')) {
    fail(`${where}: JSON-LD node without @type: ${JSON.stringify(node).slice(0, 80)}`);
  }
  for (const [k, v] of Object.entries(node)) if (k !== '@context') checkSchema(v, where);
}

// ---------- Speculation Rules ----------
const STATIC_SAMPLES = [SITE_MAP, '/countries/', '/countries/peru/', '/lists/', '/lists/countries-by-area/', '/compare/', '/compare/bolivia-vs-peru/'];
const GAME_SAMPLES = ['/', ...ROUTES.map((r) => r.path).filter((p) => p !== '/'), '/atlas/peru/', course.lessons[0].path];
const matcher = (patterns) => {
  const list = [].concat(patterns ?? []);
  if (typeof URLPattern !== 'function') return null; // Node before 23.8: structure is still checked below
  const compiled = list.map((p) => new URLPattern(p, `${SITE}/`));
  return (p) => compiled.some((c) => c.test(SITE + p));
};
let speculationChecked = 0;
function checkSpeculation(p) {
  const blocks = [...p.html.matchAll(/<script type="speculationrules">([\s\S]*?)<\/script>/g)];
  if (blocks.length !== 1) { fail(`${p.url}: ${blocks.length} speculation rules blocks, expected one`); return; }
  let rules;
  try { rules = JSON.parse(blocks[0][1]); } catch (e) { fail(`${p.url}: speculation rules do not parse: ${e.message}`); return; }
  for (const k of Object.keys(rules)) if (!['prerender', 'prefetch'].includes(k)) fail(`${p.url}: speculation rules key ${k}`);
  for (const kind of ['prerender', 'prefetch']) {
    if (!Array.isArray(rules[kind]) || !rules[kind].length) { fail(`${p.url}: speculation rules have no ${kind}`); continue; }
    for (const r of rules[kind]) if (r.eagerness !== 'moderate' || !r.where?.href_matches) fail(`${p.url}: ${kind} rule is not a moderate document rule`);
  }
  const pre = matcher(rules.prerender?.flatMap((r) => r.where?.href_matches ?? []));
  const fetch = matcher(rules.prefetch?.flatMap((r) => r.where?.href_matches ?? []));
  if (!pre || !fetch) return;
  for (const s of STATIC_SAMPLES) {
    if (!pre(s)) fail(`${p.url}: static page ${s} is not prerendered`);
    if (fetch(s)) fail(`${p.url}: static page ${s} is also prefetched`);
  }
  for (const s of GAME_SAMPLES) {
    if (pre(s)) fail(`${p.url}: game page ${s} would be prerendered`);
    if (!fetch(s)) fail(`${p.url}: game page ${s} is not prefetched`);
  }
  speculationChecked++;
}

// ---------- Links to the reference pages ----------
let refLinks = 0;
async function checkRefLink(where, href) {
  const p = (href.startsWith(SITE) ? href.slice(SITE.length) : href).split('#')[0];
  if (!p.startsWith('/lists/') && !p.startsWith('/compare/')) return false;
  refLinks++;
  if (!refSet.has(p)) { fail(`${where}: ${p} is not a reference page (tools/reference/urls.mjs)`); return true; }
  const built = p.startsWith('/lists/') ? HAS_LISTS : HAS_COMPARE;
  if (built && !(await exists(fileFor(p)))) fail(`${where}: ${p} has no file`);
  return true;
}

const FOOTER = `<footer class="colophon"><nav class="foot" aria-label="World Survey"><a href="/countries/">Countries</a><a href="${LISTS_INDEX}">Lists</a><a href="${COMPARE_INDEX}">Compare</a><a href="/learn/">Learn</a><a href="/atlas/">Atlas</a><a href="/">Play</a><a href="/about/">About</a><a href="${SITE_MAP}">Site map</a></nav>`;

// ---------- Per page ----------
const titles = new Map(), descs = new Map();
const otherFooter = [];
let ldBlocks = 0, shellLinks = 0, faqPages = 0, faqQuestions = 0, ogOwn = 0;
const kindCount = { sitemap: 0, route: 0, lesson: 0, atlas: 0, encyclopedia: 0, reference: 0 };
const pngSize = async (f) => { const b = await readFile(f); return b.toString('ascii', 1, 4) === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };
const listBack = new Map(); // list path -> country paths that say they are on it

for (const p of pages) {
  const h = p.html;
  kindCount[p.kind]++;
  const shell = p.kind === 'route' || p.kind === 'lesson' || p.kind === 'atlas';
  const title = unesc(attr(h, /<title>([^<]*)<\/title>/));
  const desc = unesc(attr(h, /<meta name="description" content="([^"]*)"/));
  const canon = attr(h, /<link rel="canonical" href="([^"]*)"/);
  if (!title) fail(`${p.url}: no title`);
  if (!desc) fail(`${p.url}: no description`);
  if ((h.match(/<title>/g) ?? []).length !== 1) fail(`${p.url}: ${(h.match(/<title>/g) ?? []).length} title tags`);
  if ((h.match(/<meta name="description"/g) ?? []).length !== 1) fail(`${p.url}: description tag count`);
  if ((h.match(/<link rel="canonical"/g) ?? []).length !== 1) fail(`${p.url}: canonical tag count`);
  if (canon !== p.canonical) fail(`${p.url}: canonical ${canon}, expected ${p.canonical}`);
  if (!/<html lang="en">/.test(h)) fail(`${p.url}: no <html lang="en">`);
  const robots = attr(h, /<meta name="robots" content="([^"]*)"/);
  if (p.noindex && !/noindex/.test(robots ?? '')) fail(`${p.url}: should be noindex`);
  if (!p.noindex && /noindex/.test(robots ?? '')) fail(`${p.url}: indexable page carries noindex`);
  titles.set(title, [...(titles.get(title) ?? []), p.url]);
  descs.set(desc, [...(descs.get(desc) ?? []), p.url]);
  p.title = title;
  p.desc = desc;
  if (title && title.length > 60) warn(`${p.url}: title ${title.length} chars`);
  if (desc && (desc.length > 160 || desc.length < 50)) warn(`${p.url}: description ${desc.length} chars`);

  // Nested pages must not use document-relative URLs (they would resolve under /play/find/ and break).
  for (const m of h.matchAll(/\s(?:src|href)="([^"]*)"/g)) {
    const ref = m[1];
    if (!ref || /^(https?:|mailto:|data:|#|\/)/.test(ref)) continue;
    fail(`${p.url}: relative URL ${ref}`);
  }
  // Links to lists and comparisons, on whichever page they sit.
  for (const m of h.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) await checkRefLink(p.url, unesc(m[1]));
  // The other builder checks the rest of its own pages.
  if (p.kind === 'reference') {
    if (!h.includes(FOOTER)) otherFooter.push(p.url);
    continue;
  }
  // The HTML site map: static chrome like the country pages. Its links are compared with sitemap.xml below.
  if (p.kind === 'sitemap') {
    if (!h.includes(FOOTER)) fail(`${p.url}: footer navigation is missing or changed`);
    if ((h.match(/<h1[\s>]/g) ?? []).length !== 1) fail(`${p.url}: expected one h1`);
    if (h.split(ANALYTICS_TAG).length !== 2) fail(`${p.url}: expected the analytics loader exactly once`);
    const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    if (lds.length !== 1) fail(`${p.url}: ${lds.length} JSON-LD blocks`);
    for (const m of lds) {
      try { const j = JSON.parse(m[1]); ldBlocks++; checkSchema(j['@graph'] ?? [j], p.url); } catch (e) { fail(`${p.url}: JSON-LD does not parse: ${e.message}`); }
    }
    if ((h.match(/<script/g) ?? []).length !== 3) fail(`${p.url}: has a script that is not JSON-LD, speculation rules or the analytics loader`);
    checkSpeculation(p);
    continue;
  }

  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type']) if (!h.includes(`property="${tag}"`)) fail(`${p.url}: no ${tag}`);
  for (const tag of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) if (!h.includes(`name="${tag}"`)) fail(`${p.url}: no ${tag}`);
  if (shell) {
    if (unesc(attr(h, /<meta property="og:title" content="([^"]*)"/)) !== title) fail(`${p.url}: og:title differs from title`);
    if (unesc(attr(h, /<meta property="og:description" content="([^"]*)"/)) !== desc) fail(`${p.url}: og:description differs from description`);
    if (attr(h, /<meta property="og:url" content="([^"]*)"/) !== SITE + p.url) fail(`${p.url}: og:url`);
  }
  if ((h.match(/<h1[\s>]/g) ?? []).length !== 1) fail(`${p.url}: expected one h1, found ${(h.match(/<h1[\s>]/g) ?? []).length}`);

  // Share image: the file is there; a page with its own image states its real size and describes it.
  const ogImage = attr(h, /<meta property="og:image" content="([^"]*)"/);
  if (ogImage && !(ogImage.startsWith(`${SITE}/`) && (await exists(fileFor(ogImage))))) fail(`${p.url}: og:image ${ogImage} has no file`);
  if (ogImage && attr(h, /<meta name="twitter:image" content="([^"]*)"/) !== ogImage) fail(`${p.url}: twitter:image differs from og:image`);
  if (ogImage?.includes('/assets/og/')) {
    ogOwn++;
    const size = (await exists(fileFor(ogImage))) ? await pngSize(fileFor(ogImage)) : null;
    const w = attr(h, /<meta property="og:image:width" content="([^"]*)"/), hh = attr(h, /<meta property="og:image:height" content="([^"]*)"/);
    if (!size || `${size[0]}x${size[1]}` !== `${w}x${hh}`) fail(`${p.url}: og:image is ${size?.join('x')}, declared ${w}x${hh}`);
    if (!attr(h, /<meta property="og:image:alt" content="([^"]+)"/)) fail(`${p.url}: og:image has no alt`);
    if (ogImage !== `${SITE}/assets/og/${p.url.split('/')[2]}.png`) fail(`${p.url}: og:image ${ogImage} is another page's`);
  }

  // JSON-LD
  const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!lds.length) fail(`${p.url}: no JSON-LD`);
  if (shell && lds.length !== 1) fail(`${p.url}: ${lds.length} JSON-LD blocks`);
  let graph = [];
  for (const m of lds) {
    let j;
    try { j = JSON.parse(m[1]); ldBlocks++; } catch (e) { fail(`${p.url}: JSON-LD does not parse: ${e.message}`); continue; }
    if (j['@context'] !== 'https://schema.org') fail(`${p.url}: JSON-LD @context ${j['@context']}`);
    const g = j['@graph'] ?? [j];
    graph = graph.concat(g);
    checkSchema(g, p.url);
    for (const bc of g.filter((x) => x['@type'] === 'BreadcrumbList')) {
      bc.itemListElement.forEach((it, i) => {
        if (it.position !== i + 1) fail(`${p.url}: breadcrumb position ${it.position}`);
        if (!it.item?.startsWith(SITE)) fail(`${p.url}: breadcrumb item ${it.item}`);
      });
      for (const it of bc.itemListElement) if (!(await exists(fileFor(it.item)))) fail(`${p.url}: breadcrumb ${it.item} has no file`);
    }
  }
  const types = graph.map((x) => x['@type']);
  const node = (type) => graph.find((x) => x['@type'] === type);
  const crumbPaths = (node('BreadcrumbList')?.itemListElement ?? []).map((it) => it.item.slice(SITE.length));
  if (p.url === '/') {
    const game = node('VideoGame');
    if (!types.includes('WebSite') || !game) fail(`/: JSON-LD types ${types}`);
    if (graph.some((x) => x.potentialAction)) fail('/: potentialAction without a search URL');
    for (const k of ['name', 'description', 'url', 'genre', 'gamePlatform', 'applicationCategory', 'operatingSystem', 'isAccessibleForFree', 'inLanguage', 'author', 'publisher', 'image']) if (game?.[k] == null) fail(`/: VideoGame has no ${k}`);
    if (game && (game.author?.name !== 'Aimantas' || game.publisher?.name !== 'Aimantas')) fail('/: VideoGame author/publisher is not Aimantas');
  } else if (shell) {
    const wp = node('WebPage');
    if (!wp || !types.includes('BreadcrumbList')) fail(`${p.url}: JSON-LD types ${types}`);
    if (wp && wp.isPartOf?.['@type'] !== 'WebSite') fail(`${p.url}: WebPage is not isPartOf the WebSite`);
    if (wp && wp.url !== SITE + p.url) fail(`${p.url}: WebPage url ${wp.url}`);
    if (crumbPaths.at(-1) !== p.url || crumbPaths[0] !== '/') fail(`${p.url}: breadcrumb does not run from / to the page`);
  }
  if (p.kind === 'route' && p.url !== '/') {
    const r = p.route;
    // Breadcrumbs follow the families: flag and capital games under their chooser, region quizzes under their mode.
    if (!same(crumbPaths, chainOf(r.path))) fail(`${p.url}: breadcrumb ${crumbPaths.join(' > ')}, expected ${chainOf(r.path).join(' > ')}`);
    const quiz = node('Quiz');
    if (r.mode) {
      if (!quiz) fail(`${p.url}: play route without a Quiz node`);
      else {
        for (const k of ['name', 'description', 'url', 'about', 'educationalUse', 'isAccessibleForFree', 'inLanguage']) if (quiz[k] == null) fail(`${p.url}: Quiz has no ${k}`);
        if (quiz.isAccessibleForFree !== true || quiz.inLanguage !== 'en' || quiz.url !== SITE + p.url) fail(`${p.url}: Quiz free/language/url`);
        if ((quiz.spatialCoverage?.name ?? null) !== (r.region ?? null)) fail(`${p.url}: Quiz spatialCoverage ${quiz.spatialCoverage?.name}, route region ${r.region}`);
        if (node('WebPage')?.mainEntity?.['@id'] !== quiz['@id']) fail(`${p.url}: WebPage mainEntity is not the Quiz`);
      }
    } else if (quiz) fail(`${p.url}: Quiz node on a route that is not a play mode`);
    const lessonRefs = (list) => (list ?? []).map((x) => `${x['@id']}|${x.url}|${x.position}|${x.name}`);
    const lessonWant = (list) => list.map((l) => `${SITE}${l.path}#lesson|${SITE}${l.path}|${l.number}|${l.name}`);
    if (r.path === '/learn/') {
      const c = node('Course');
      if (!c) fail('/learn/: no Course node');
      else {
        if (c.provider?.name !== 'Aimantas') fail('/learn/: Course provider is not Aimantas');
        for (const k of ['name', 'description', 'url']) if (!c[k]) fail(`/learn/: Course has no ${k}`);
        if (!same(lessonRefs(c.hasPart), lessonWant(course.lessons))) fail('/learn/: Course hasPart does not match buildCourse()');
        if (!same((c.syllabusSections ?? []).map((x) => x.url), LEARN_REGIONS.map((x) => SITE + x.path))) fail('/learn/: Course syllabusSections are not the region pages');
      }
    } else if (r.view === 'learn' && r.region) {
      const s = node('Syllabus');
      if (!s || s.isPartOf?.['@type'] !== 'Course' || s.isPartOf?.['@id'] !== `${SITE}/learn/#course`) fail(`${p.url}: no Syllabus that is part of the course`);
      else if (!same(lessonRefs(s.hasPart), lessonWant(course.byRegion(r.region)))) fail(`${p.url}: Syllabus hasPart does not match the region's lessons`);
    }
  }
  if (p.kind === 'lesson') {
    const l = p.lesson, lr = node('LearningResource');
    if (!same(crumbPaths, ['/', '/learn/', `/learn/${slug(l.region)}/`, l.path])) fail(`${p.url}: breadcrumb ${crumbPaths.join(' > ')}`);
    if (!lr) fail(`${p.url}: no LearningResource node`);
    else {
      if (lr.isPartOf?.['@type'] !== 'Course' || lr.isPartOf?.['@id'] !== `${SITE}/learn/#course`) fail(`${p.url}: LearningResource is not isPartOf the course`);
      if (lr.position !== l.number || lr.name !== l.name || lr.url !== SITE + l.path) fail(`${p.url}: LearningResource name/position/url`);
      if (!same((lr.about ?? []).map((x) => x['@id']), l.iso3.map((iso) => `${SITE}${countryPath(byIso.get(iso))}#country`))) fail(`${p.url}: LearningResource about does not list the lesson's countries`);
      if (lr.spatialCoverage?.name !== l.region || lr.isAccessibleForFree !== true || lr.inLanguage !== 'en') fail(`${p.url}: LearningResource region/free/language`);
    }
    for (const iso of l.iso3) if (!desc?.includes(byIso.get(iso).name)) fail(`${p.url}: description does not name ${byIso.get(iso).name}`);
  }
  if (p.kind === 'atlas' && node('WebPage')?.about?.['@id'] !== `${p.canonical}#country`) fail(`${p.url}: WebPage about is not its country`);

  const importmap = h.match(/<script type="importmap">([\s\S]*?)<\/script>/)?.[1];
  if (importmap) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(importmap).imports ?? {})) if (!/^(\/|https?:)/.test(v)) fail(`${p.url}: importmap "${k}" is relative (${v})`);
    } catch (e) { fail(`${p.url}: importmap does not parse`); }
  }
  checkSpeculation(p);
  if (h.split(ANALYTICS_TAG).length !== 2) fail(`${p.url}: the analytics tag is missing or repeated`);

  // ---------- Encyclopedia pages ----------
  if (p.kind === 'encyclopedia') {
    if (!h.includes(FOOTER)) fail(`${p.url}: footer navigation is missing or changed`);
    const hrefs = new Set([...h.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => unesc(m[1])));
    for (const l of hrefs) if (l.startsWith('/') && !l.startsWith('/lists/') && !l.startsWith('/compare/') && !(await exists(fileFor(l)))) fail(`${p.url}: link ${l} has no file`);
    const region = p.country?.region ?? p.region;
    if (region) {
      for (const m of ['find', 'flagquiz', 'capitals']) if (!hrefs.has(`${modePath(m)}${slug(region)}/`)) fail(`${p.url}: no link to ${modePath(m)}${slug(region)}/`);
    }
    if (p.region) {
      for (const l of course.byRegion(p.region)) if (!hrefs.has(l.path)) fail(`${p.url}: no link to lesson ${l.path}`);
      for (const l of LISTS) if (!hrefs.has(listPath(l.slug))) fail(`${p.url}: no link to ${listPath(l.slug)}`);
      if (!hrefs.has(`/learn/${slug(p.region)}/`)) fail(`${p.url}: no link to /learn/${slug(p.region)}/`);
    }
    if (p.country) {
      const c = p.country;
      // Questions: five to seven, and the JSON-LD says exactly what the page prints.
      const { visible, ld } = faqOf(h);
      faqPages++;
      faqQuestions += visible.length;
      if (visible.length < 5 || visible.length > 7) fail(`${p.url}: ${visible.length} questions, expected 5 to 7`);
      if (!ld) fail(`${p.url}: no FAQPage JSON-LD`);
      else if (!same(visible.map((x) => x.join('\u0000')), ld.map((x) => x.join('\u0000')))) fail(`${p.url}: FAQPage JSON-LD differs from the visible Questions section`);
      for (const [q, a] of visible) if (!q.endsWith('?') || !a || /undefined|null|NaN/.test(q + a)) fail(`${p.url}: question "${q}" or its answer is malformed`);
      if (c.capital && !visible.some(([, a]) => a.includes(c.capital))) fail(`${p.url}: no answer names the capital`);
      if (c.population != null && !visible.some(([, a]) => a.includes(`in ${c.populationYear}, according to the World Bank`))) fail(`${p.url}: population answer without year and source`);
      // One comparison per sovereign land neighbour, the lesson that teaches it, the lists it says it is on.
      const nbs = c.borders.map((iso) => byIso.get(iso)).filter((o) => o?.sovereign);
      const compareLinks = [...hrefs].filter((l) => l.startsWith('/compare/') && l !== COMPARE_INDEX).sort();
      if (!same(compareLinks, nbs.map((o) => comparePath(c, o)).sort())) fail(`${p.url}: comparison links ${compareLinks.length}, expected one per land neighbour (${nbs.length})`);
      if (!hrefs.has(lessonOf.get(c.iso3).path)) fail(`${p.url}: no link to its lesson ${lessonOf.get(c.iso3).path}`);
      const more = h.match(/<section class="section measure" id="more">([\s\S]*?)<\/section>/)?.[1] ?? '';
      for (const m of more.matchAll(/<a href="(\/lists\/[^"]+)"/g)) listBack.set(m[1], [...(listBack.get(m[1]) ?? []), p.url]);
      if (!/<a href="\/lists\//.test(more)) fail(`${p.url}: "See it in the lists" has no list`);
    }
  }

  // ---------- Crawlable shell block (routes, lessons, atlas) ----------
  if (shell) {
    const block = h.match(/<main\b[^>]*\bid="panel"[^>]*>\s*<section class="seo-shell">([\s\S]*?)<\/section>/)?.[1];
    if (!block) { fail(`${p.url}: no seo-shell block at the start of <main id="panel">`); continue; }
    if (/\sstyle=/.test(block)) fail(`${p.url}: inline style in the shell block`);
    if (/<script/.test(block)) fail(`${p.url}: script in the shell block`);
    const h1 = unesc(block.match(/<h1>([^<]*)<\/h1>/)?.[1]);
    const intro = unesc(block.match(/<p>([^<]*)<\/p>/)?.[1]);
    if (p.route && h1 !== p.route.h1) fail(`${p.url}: shell h1 "${h1}", expected "${p.route.h1}"`);
    if (p.route && intro !== p.route.intro) fail(`${p.url}: shell intro differs from the route`);
    if (!h1 || !intro) fail(`${p.url}: shell has no h1 or intro`);
    if (!/<nav class="seo-shell__links" aria-label="[^"]+"><ul>(<li><a href="[^"]+">[^<]+<\/a><\/li>)+<\/ul><\/nav>/.test(block)) fail(`${p.url}: shell links are not a <nav><ul> list`);
    const links = [...block.matchAll(/<a href="([^"]+)"/g)].map((m) => unesc(m[1]));
    if (links.includes(p.url)) fail(`${p.url}: shell links to itself`);
    for (const l of links) {
      shellLinks++;
      if (l.startsWith('/lists/') || l.startsWith('/compare/')) continue; // checked above, with or without the files
      if (!(await exists(fileFor(l)))) fail(`${p.url}: shell link ${l} has no file`);
    }
    // The list of what the page covers: <li> items of the seo-shell__list.
    const list = block.match(/<[ou]l class="seo-shell__list[^"]*"[^>]*>([\s\S]*?)<\/[ou]l>/)?.[1] ?? '';
    const items = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
    const itemLinks = items.map((it) => it.match(/<a href="([^"]+)"/)?.[1]);
    const lazyFlag = (it, c, w, hgt) => it.includes(`<img src="/${c.flag}" alt="`) && it.includes(` width="${w}" height="${hgt}" loading="lazy">`) && !/alt=""/.test(it);

    if (p.kind === 'route') {
      const r = p.route;
      if (r.path === '/' && !links.includes('/countries/')) fail('/: shell does not link to /countries/');
      if (r.path === '/') for (const want of ['/learn/', LISTS_INDEX, ...HUBS.map((x) => x.path)]) if (!links.includes(want)) fail(`/: shell does not link to ${want}`);
      // A chooser links to each of its games; a mode page to each of its region pages.
      if (r.view === 'chooser') for (const k of CHOOSER_KIDS[r.which] ?? []) if (!links.includes(k)) fail(`${p.url}: shell does not link to ${k}`);
      for (const k of REGION_QUIZ.filter((x) => parentOf.get(x.path) === r.path)) if (!links.includes(k.path)) fail(`${p.url}: shell does not link to ${k.path}`);
      if (r.view === 'play' && r.region) {
        const members = sov.filter((c) => c.region === r.region);
        if (!same(itemLinks.slice().sort(), members.map(countryPath).sort())) fail(`${p.url}: lists ${items.length} countries, the region has ${members.length}`);
        if (!block.includes(`<h2>The ${members.length} `)) fail(`${p.url}: list heading does not give the count ${members.length}`);
        const bySlug = new Map(members.map((c) => [countryPath(c), c]));
        items.forEach((it, i) => {
          const c = bySlug.get(itemLinks[i]);
          if (!c) return;
          if (r.mode === 'capitals' && !textOf(it).startsWith(`${c.capital}, ${c.name}`)) fail(`${p.url}: item for ${c.name} is not "Capital, Country"`);
          if (r.mode === 'flagquiz' && !lazyFlag(it, c, 24, 18)) fail(`${p.url}: no sized, lazy-loaded flag beside ${c.name}`);
          if (!textOf(it).includes(c.name)) fail(`${p.url}: item does not name ${c.name}`);
        });
        for (const want of [parentOf.get(r.path), `/learn/${slug(r.region)}/`, `/countries/${slug(r.region)}/`]) if (!links.includes(want)) fail(`${p.url}: shell does not link to ${want}`);
      }
      if (r.path === '/learn/' || (r.view === 'learn' && r.region)) {
        const lessons = r.region ? course.byRegion(r.region) : course.lessons;
        const lessonItems = [...block.matchAll(/<li><a href="(\/learn\/[^"]+)">([^<]*)<\/a>: ([^<]*)<\/li>/g)].map((m) => `${m[1]}|${unesc(m[2])}|${unesc(m[3])}`);
        const wantItems = lessons.map((l) => `${l.path}|${l.name}|`);
        if (lessonItems.length !== lessons.length || !lessonItems.every((x, i) => x.startsWith(wantItems[i]))) fail(`${p.url}: lesson outline does not match buildCourse() (${lessonItems.length} of ${lessons.length})`);
        lessons.forEach((l, i) => { for (const iso of l.iso3) if (!lessonItems[i]?.includes(byIso.get(iso).name)) fail(`${p.url}: lesson ${l.slug} does not name ${byIso.get(iso).name}`); });
        if (r.region && !links.includes('/learn/')) fail(`${p.url}: shell does not link to /learn/`);
        if (!r.region) for (const x of LEARN_REGIONS) if (!links.includes(x.path)) fail(`/learn/: shell does not link to ${x.path}`);
      }
    }
    if (p.kind === 'lesson') {
      const l = p.lesson;
      const members = l.iso3.map((iso) => byIso.get(iso));
      if (h1 !== l.name) fail(`${p.url}: shell h1 "${h1}", expected "${l.name}"`);
      if (!intro?.includes(`Lesson ${l.number} of ${course.total}`)) fail(`${p.url}: intro does not say which lesson it is`);
      if (!same(itemLinks, members.map(countryPath))) fail(`${p.url}: countries listed do not match the lesson, in order`);
      items.forEach((it, i) => {
        const c = members[i];
        if (!c) return;
        if (!lazyFlag(it, c, 32, 24)) fail(`${p.url}: no sized, lazy-loaded flag for ${c.name}`);
        if (c.capital && !textOf(it).includes(`capital ${c.capital}`)) fail(`${p.url}: no capital for ${c.name}`);
      });
      const prev = course.lessons[l.number - 2], next = course.lessons[l.number];
      for (const want of [prev?.path, next?.path, `/learn/${slug(l.region)}/`, '/learn/'].filter(Boolean)) if (!links.includes(want)) fail(`${p.url}: shell does not link to ${want}`);
    }
    if (p.kind === 'atlas') {
      const c = p.country;
      for (const want of [countryPath(c), `/play/find/${slug(c.region)}/`, lessonOf.get(c.iso3).path]) if (!links.includes(want)) fail(`${p.url}: shell does not link to ${want}`);
    }
  }
}
if (otherFooter.length) warn(`${otherFooter.length} reference pages do not carry the encyclopedia's footer navigation (first: ${otherFooter[0]})`);
const dupT = [...titles].filter(([, u]) => u.length > 1);
const dupD = [...descs].filter(([, u]) => u.length > 1);
for (const [t, u] of dupT) fail(`duplicate title "${t}": ${u.join(', ')}`);
for (const [d, u] of dupD) fail(`duplicate description on ${u.join(', ')}`);
for (const k of Object.keys(want)) if (kindCount[k] !== want[k]) fail(`${kindCount[k]} ${k} pages, expected ${want[k]}`);

// A country page that says "see it in this list" must be on that list: the list page links back to it.
let backChecked = 0;
if (HAS_LISTS) {
  for (const [list, from] of listBack) {
    if (!(await exists(fileFor(list)))) continue; // already reported
    const listHtml = await readFile(fileFor(list), 'utf8');
    for (const u of from) {
      backChecked++;
      if (!listHtml.includes(`href="${u}"`)) fail(`${u} says it is on ${list}, but that list does not link to it`);
    }
  }
}

// ---------- No query-string region links anywhere ----------
const emitted = allFiles.filter((f) => /\.(html|txt|xml|webmanifest)$/.test(f) && !/^(src|vendor|assets|data)$/.test(path.relative(OUT, f).split(path.sep)[0]));
let regionQueries = 0;
for (const f of emitted) {
  const t = await readFile(f, 'utf8');
  if (/[?&](?:amp;)?region=|%3Fregion%3D/i.test(t)) { regionQueries++; fail(`${path.relative(OUT, f)}: a "?region=" link (region pages are paths: /play/find/europe/)`); }
}

// ---------- Static-page navigation: view transitions ----------
const cssFile = path.join(OUT, 'assets/encyclopedia.css');
const css = (await exists(cssFile)) ? await readFile(cssFile, 'utf8') : '';
if (!css) fail('no assets/encyclopedia.css');
else {
  if (!/@view-transition\s*\{\s*navigation:\s*auto;?\s*\}/.test(css)) fail('encyclopedia.css: no @view-transition { navigation: auto }');
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*@view-transition\s*\{\s*navigation:\s*none;?\s*\}/.test(css)) fail('encyclopedia.css: view transitions are not switched off for prefers-reduced-motion');
}

// ---------- Sitemap ----------
const smFile = path.join(OUT, 'sitemap.xml');
const sm = (await exists(smFile)) ? await readFile(smFile, 'utf8') : '';
if (!sm) fail('no sitemap.xml');
if (sm && !/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/.test(sm)) fail('sitemap.xml header');
const urls = [...sm.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
  loc: m[1].match(/<loc>([^<]+)<\/loc>/)?.[1], lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1],
  priority: m[1].match(/<priority>([^<]+)<\/priority>/)?.[1], images: [...m[1].matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map((x) => x[1]),
}));
const locs = urls.map((u) => u.loc);
const locSet = new Set(locs);
if (locSet.size !== locs.length) fail('sitemap has duplicate URLs');
if (urls.length > 5000) fail(`sitemap has ${urls.length} URLs: past 5,000 it should be a sitemap index`);
const byUrl = new Map(pages.map((p) => [SITE + p.url, p]));
const wantPriority = (p) => (p.kind === 'lesson' ? '0.6' : p.kind === 'reference' ? (p.url.startsWith('/lists/') ? '0.7' : p.url === COMPARE_INDEX ? '0.5' : '0.4') : null);
for (const u of urls) {
  if (!u.loc?.startsWith(`${SITE}/`)) { fail(`sitemap: off-site loc ${u.loc}`); continue; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(u.lastmod ?? '')) fail(`sitemap: ${u.loc} lastmod ${u.lastmod}`);
  const file = fileFor(u.loc);
  if (!(await exists(file))) { fail(`sitemap: ${u.loc} has no file`); continue; }
  const p = byUrl.get(u.loc);
  if (!p) { fail(`sitemap: ${u.loc} is not a known page`); continue; }
  if (p.noindex || /<meta name="robots" content="[^"]*noindex/.test(p.html)) fail(`sitemap: noindex page ${u.loc}`);
  if (p.canonical !== u.loc) fail(`sitemap: ${u.loc} canonicalises to ${p.canonical}`);
  if (wantPriority(p) && u.priority !== wantPriority(p)) fail(`sitemap: ${u.loc} priority ${u.priority}, expected ${wantPriority(p)}`);
  for (const img of u.images) if (!img.startsWith(SITE) || !(await exists(fileFor(img)))) fail(`sitemap: image ${img} has no file`);
}
for (const p of pages) if (!p.noindex && !locSet.has(SITE + p.url)) fail(`sitemap misses ${p.url}`);
// The HTML site map links every sitemap URL and nothing outside it (sitemap.xml itself aside).
const siteMapPage = pages.find((p) => p.kind === 'sitemap');
if (siteMapPage) {
  const main = siteMapPage.html.match(/<main[\s\S]*?<\/main>/)?.[0] ?? '';
  const hrefs = [...main.matchAll(/<a\b[^>]*\shref="([^"#][^"]*)"/g)].map((m) => (m[1].startsWith('/') ? SITE + m[1] : m[1]));
  const linked = new Set(hrefs);
  const unlinked = locs.filter((l) => l !== SITE + SITE_MAP && !linked.has(l));
  const outside = [...linked].filter((l) => !locSet.has(l) && l !== `${SITE}/sitemap.xml`);
  if (unlinked.length) fail(`${SITE_MAP}: ${unlinked.length} sitemap URLs are not linked (first: ${unlinked[0]})`);
  if (outside.length) fail(`${SITE_MAP}: links ${outside.length} pages that are not in sitemap.xml (first: ${outside[0]})`);
  if (hrefs.length !== linked.size + 1) fail(`${SITE_MAP}: ${hrefs.length - linked.size - 1} pages are linked twice`); // "/" sits in the breadcrumb and the list
}
const maxPri = Math.max(...urls.map((u) => Number(u.priority ?? 0)));
if (urls.find((u) => u.loc === `${SITE}/`)?.priority !== '1.0' || urls.filter((u) => Number(u.priority) === maxPri).length !== 1) fail('sitemap: home is not the single highest priority');

// ---------- robots.txt ----------
const robotsFile = path.join(OUT, 'robots.txt');
const robots = (await exists(robotsFile)) ? await readFile(robotsFile, 'utf8') : '';
if (!robots) fail('no robots.txt');
const groups = robots.split(/\n\s*\n/).map((g) => g.split('\n').filter((l) => l && !l.startsWith('#')));
const allowsAll = (ua) => groups.some((g) => g.some((l) => l.toLowerCase() === `user-agent: ${ua.toLowerCase()}`) && g.includes('Allow: /'));
for (const ua of ['*', ...CRAWLERS]) if (!allowsAll(ua)) fail(`robots.txt: no "Allow: /" group for ${ua}`);
for (const l of robots.split('\n')) if (/^Disallow:\s*\S/i.test(l)) fail(`robots.txt: ${l}`);
if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) fail('robots.txt: no Sitemap line');
if (await exists(path.join(OUT, 'robots-sitemap.txt'))) warn('robots-sitemap.txt still in dist (build.py normally consumes it)');

// ---------- llms.txt, llms-full.txt ----------
const llmsFile = path.join(OUT, 'llms.txt');
const llms = (await exists(llmsFile)) ? await readFile(llmsFile, 'utf8') : '';
if (!llms) fail('no llms.txt');
else {
  if (!/^# World Survey\n\n> \S/.test(llms)) fail('llms.txt: must open with "# World Survey" and a blockquote summary');
  const sections = ['## Game modes', '## Quizzes by region', '## Field course', '## Country encyclopedia', ...(HAS_LISTS ? ['## Lists'] : []), ...(HAS_COMPARE ? ['## Compare'] : []), '## Data sources', '## Optional'];
  let at = -1;
  for (const s of sections) {
    const i = llms.indexOf(`\n${s}\n`);
    if (i < 0) fail(`llms.txt: no "${s}" section`);
    else if (i < at) fail(`llms.txt: "${s}" is out of order`);
    at = Math.max(at, i);
  }
  if (llms.lastIndexOf('\n## ') !== llms.indexOf('\n## Optional')) fail('llms.txt: "Optional" must be the last section');
  const links = [...llms.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
  for (const l of links) {
    if (!l.startsWith(SITE)) continue;
    if (await checkRefLink('llms.txt', l)) continue;
    if (!(await exists(fileFor(l)))) fail(`llms.txt: link ${l} has no file`);
  }
  for (const r of ROUTES.filter((x) => !x.noindex && x.path !== '/about/')) if (!llms.includes(`](${SITE}${r.path})`)) fail(`llms.txt: no link to ${r.path}`);
  for (const r of REGIONS) if (!llms.includes(`](${SITE}/countries/${slug(r)}/)`)) fail(`llms.txt: no link to region ${r}`);
  if (!llms.includes(`${SITE}${course.lessons[0].path}`)) fail('llms.txt: the course section gives no lesson address');
  if (HAS_LISTS) for (const p of [LISTS_INDEX, ...LISTS.map((l) => listPath(l.slug))]) if (!llms.includes(`](${SITE}${p}): `)) fail(`llms.txt: no described link to ${p}`);
  if (HAS_COMPARE && !llms.includes(`](${SITE}${COMPARE_INDEX}): `)) fail('llms.txt: no described link to /compare/');
  if (HAS_COMPARE && !llms.includes(`${SITE}/compare/<a>-vs-<b>/`)) fail('llms.txt: no sentence on the comparison URL pattern');
  if (!HAS_LISTS && /\/lists\//.test(llms)) fail('llms.txt links to /lists/, which is not built');
  const kb = Buffer.byteLength(llms) / 1024;
  if (kb > LLMS_HARD_KB) fail(`llms.txt is ${kb.toFixed(1)} KB, over ${LLMS_HARD_KB} KB`);
  else if (kb > LLMS_SOFT_KB) warn(`llms.txt is ${kb.toFixed(1)} KB, over the ${LLMS_SOFT_KB} KB target`);
}
const fullFile = path.join(OUT, 'llms-full.txt');
const full = (await exists(fullFile)) ? await readFile(fullFile, 'utf8') : '';
if (!full) fail('no llms-full.txt');
else {
  const lines = full.split('\n').filter((l) => l.startsWith('- '));
  if (lines.length !== sov.length) fail(`llms-full.txt: ${lines.length} country lines, expected ${sov.length}`);
  for (const c of sov) {
    const url = SITE + countryPath(c);
    const line = lines.find((l) => l.endsWith(` ${url}`));
    if (!line) { fail(`llms-full.txt: no line for ${c.name}`); continue; }
    if (!line.startsWith(`- ${c.name}`)) fail(`llms-full.txt: line for ${url} does not start with the name`);
    if (c.population != null && !/population [\d,]+ \(\d{4}, World Bank\)/.test(line)) fail(`llms-full.txt: ${c.name} population without year and source`);
    if (c.gdp != null && !/GDP US\$[\d.,]+(?: (?:trillion|billion|million))? \(\d{4}, World Bank, current US\$\)/.test(line)) fail(`llms-full.txt: ${c.name} GDP without year and source`);
    if (c.lifeExpectancy != null && !/life expectancy [\d.]+ years \(\d{4}, World Bank\)/.test(line)) fail(`llms-full.txt: ${c.name} life expectancy without year and source`);
    if (!/area [\d.,]+ km² \(world-countries\)/.test(line)) fail(`llms-full.txt: ${c.name} area without source`);
    if (c.capital && !line.includes(`capital ${c.capital}`)) fail(`llms-full.txt: ${c.name} capital`);
  }
}

// ---------- Manifest and icons ----------
const manFile = path.join(OUT, 'manifest.webmanifest');
if (!(await exists(manFile))) fail('no manifest.webmanifest');
else {
  let man;
  try { man = JSON.parse(await readFile(manFile, 'utf8')); } catch (e) { fail(`manifest.webmanifest does not parse: ${e.message}`); }
  if (man) {
    if (man.short_name !== 'World Survey' || man.start_url !== '/' || man.display !== 'standalone' || man.background_color !== '#f4f5f0' || man.theme_color !== '#f4f5f0' || !man.name) fail('manifest: required fields');
    for (const want2 of [['192x192', null], ['512x512', null], ['512x512', 'maskable']]) if (!man.icons?.some((i) => i.sizes === want2[0] && i.type === 'image/png' && (i.purpose ?? null) === want2[1])) fail(`manifest: no ${want2[0]} ${want2[1] ?? 'any'} PNG icon`);
    for (const i of man.icons ?? []) {
      const f = fileFor(i.src);
      if (!(await exists(f))) { fail(`manifest icon ${i.src} has no file`); continue; }
      if (i.type === 'image/png') {
        const [w, hgt] = (await pngSize(f)) ?? [];
        if (`${w}x${hgt}` !== i.sizes) fail(`manifest icon ${i.src} is ${w}x${hgt}, declared ${i.sizes}`);
      }
    }
  }
}
const touch = path.join(OUT, 'assets/icons/apple-touch-icon.png');
if (!(await exists(touch))) fail('no assets/icons/apple-touch-icon.png');
else if ((await pngSize(touch))?.join('x') !== '180x180') fail('apple-touch-icon is not 180x180');
for (const f of ['favicon.ico', 'apple-touch-icon.png']) if (!(await exists(path.join(OUT, f)))) fail(`no /${f}`);
const homeShell = pages.find((p) => p.url === '/')?.html ?? '';
for (const [tag, rx] of [['manifest', /<link rel="manifest" href="\/manifest\.webmanifest">/], ['apple-touch-icon', /<link rel="apple-touch-icon" href="\/assets\/icons\/apple-touch-icon\.png">/], ['favicon.ico', /<link rel="icon" href="\/favicon\.ico" sizes="32x32">/]]) {
  if (!rx.test(homeShell)) warn(`index.html has no <link rel="${tag === 'favicon.ico' ? 'icon' : tag}"> for ${tag} yet`);
}

// ---------- IndexNow key file ----------
const keySrc = path.join(HERE, 'indexnow-key.txt');
let indexNow = 'no key';
if (!(await exists(keySrc))) warn('tools/seo/indexnow-key.txt is missing: no IndexNow key file is served');
else {
  const key = (await readFile(keySrc, 'utf8')).trim();
  if (!/^[a-f0-9]{32}$/.test(key)) fail('tools/seo/indexnow-key.txt is not a 32-character hexadecimal key');
  const served = path.join(OUT, `${key}.txt`);
  if (!(await exists(served))) fail('the IndexNow key file /<key>.txt is not in the output');
  else if ((await readFile(served, 'utf8')).trim() !== key) fail('the IndexNow key file does not contain the key');
  else indexNow = 'key file served at /<key>.txt';
  const strays = (await readdir(OUT)).filter((f) => /^[a-f0-9]{32}\.txt$/.test(f) && f !== `${key}.txt`);
  if (strays.length) fail(`stray IndexNow key files: ${strays.join(', ')}`);
}

// ---------- Privacy and outbound hosts ----------
const textFiles = allFiles.filter((f) => /\.(html|txt|xml|webmanifest|json|css|js|svg)$/.test(f) && !path.relative(OUT, f).split(path.sep).includes('vendor'));
const hosts = new Map();
for (const f of textFiles) {
  const t = await readFile(f, 'utf8');
  // The analytics loader names the one outside host the site loads; nothing else may.
  const rel = path.relative(OUT, f).split(path.sep).join('/');
  const m = (rel === 'assets/analytics.js' ? t.replace(ANALYTICS_SCRIPT, '') : t).match(PRIVATE);
  if (m) fail(`${rel}: private marker "${m[0]}"`);
  // Outbound hosts: pages and the files this layer writes (licence texts under assets/ name their own hosts).
  if (/\.(html|txt|xml|webmanifest)$/.test(f) && !/^(assets|data|vendor)$/.test(path.relative(OUT, f).split(path.sep)[0])) {
    for (const u of t.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
      const host = u[1].toLowerCase();
      hosts.set(host, (hosts.get(host) ?? 0) + 1);
      if (!ALLOWED_HOSTS.has(host)) fail(`${path.relative(OUT, f)}: outbound host ${host} is not on the allowlist`);
    }
  }
}
// The game's own modules: document-relative asset strings break on nested routes such as /play/find/.
const srcFiles = allFiles.filter((f) => f.endsWith('.js') && path.relative(OUT, f).startsWith(`src${path.sep}`));
const relRefs = [];
for (const f of srcFiles) {
  const t = await readFile(f, 'utf8');
  for (const m of t.matchAll(/['"`]((?:assets|data|vendor)\/[^'"`$\s]+\.[a-z0-9]+)['"`]/g)) relRefs.push(`${path.relative(OUT, f)}: ${m[1]}`);
  for (const m of t.matchAll(/fetch\(\s*['"`](?!\/|https?:|\$\{)([^'"`]+)['"`]/g)) relRefs.push(`${path.relative(OUT, f)}: fetch(${m[1]})`);
}
if (relRefs.length) warn(`document-relative asset URLs in src/ (break under nested routes unless resolved against "/"): ${[...new Set(relRefs)].slice(0, 12).join('; ')}${relRefs.length > 12 ? ` … ${relRefs.length} in all` : ''}`);

// ---------- Report ----------
const refState = HAS_LISTS || HAS_COMPARE ? `${kindCount.reference} reference` : 'reference pages not built';
console.log(`pages: ${kindCount.route} route, ${kindCount.lesson} lesson, ${kindCount.atlas} atlas, ${kindCount.encyclopedia} encyclopedia, ${refState} (expected ${want.route} / ${want.lesson} / ${want.atlas} / ${want.encyclopedia}${want.reference ? ` / ${want.reference}` : ''})`);
console.log(`titles: ${titles.size} unique of ${pages.length}; descriptions: ${descs.size} unique of ${pages.length}; JSON-LD blocks parsed: ${ldBlocks}; shell links checked: ${shellLinks}`);
console.log(`course: ${course.total} lessons teach ${lessonOf.size} countries; region quiz pages: ${REGION_QUIZ.length}; regions ${REGIONS.map((r) => `${r} ${REGION_COUNT[r]}`).join(', ')} match the data`);
console.log(`questions: ${faqQuestions} on ${faqPages} country pages, each equal to its FAQPage JSON-LD; speculation rules checked on ${speculationChecked} pages; pages with their own share image: ${ogOwn}`);
console.log(`links to /lists/ and /compare/: ${refLinks}, all in the URL contract${HAS_LISTS || HAS_COMPARE ? ' and resolving' : ' (files not built, so not resolved)'}${HAS_LISTS ? `; ${backChecked} list memberships confirmed on the list pages` : ''}; "?region=" links: ${regionQueries}`);
console.log(`sitemap: ${urls.length} URLs (${urls.filter((u) => u.images.length).length} with an image), all resolve; noindex pages: ${pages.filter((p) => p.noindex).length}, none in the sitemap`);
console.log(`robots.txt: ${CRAWLERS.length} named crawlers + *; llms.txt ${(Buffer.byteLength(llms) / 1024).toFixed(1)} KB; llms-full.txt ${(Buffer.byteLength(full) / 1024).toFixed(1)} KB; IndexNow: ${indexNow}`);
console.log(`outbound hosts: ${[...hosts].map(([h, n]) => `${h} (${n})`).join(', ')}`);
if (warnings.length) {
  console.log(`\nwarnings: ${warnings.length}`);
  for (const w of warnings.slice(0, 30)) console.log('  ' + w);
  if (warnings.length > 30) console.log(`  … ${warnings.length - 30} more`);
}
if (problems.length) {
  console.log(`\nFAILED: ${problems.length} problems`);
  for (const p of problems.slice(0, 40)) console.log('  ' + p);
  if (problems.length > 40) console.log(`  … ${problems.length - 40} more`);
  process.exit(1);
}
console.log('\nseo verify ok');
