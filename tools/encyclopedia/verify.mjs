// Checks a generated encyclopedia: node tools/encyclopedia/verify.mjs <outDir>   (exit 1 on failure)
// Page counts and slugs, internal links (game routes against src/routes.js, lessons against the course,
// lists and comparisons against tools/reference/urls.mjs), unique titles and descriptions, JSON-LD parses,
// the Questions section equal to its FAQPage JSON-LD, the shared footer, no script other than JSON-LD and one
// Speculation Rules block, no external requests, no private markers, sitemap coverage, page sizes.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, SITE, REGIONS, slug, faqOf } from './lib.mjs';
import { ROUTE_BY_PATH } from '../../src/routes.js';
import { buildCourse } from '../../src/game/course.js';
import { referencePaths, comparePath, LISTS_INDEX, COMPARE_INDEX, SITE_MAP } from '../reference/urls.mjs';

const out = path.resolve(process.cwd(), process.argv[2] ?? 'tools/encyclopedia/_out');
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const problems = [];
const fail = (m) => problems.push(m);

const cj = JSON.parse(await readFile(path.join(ROOT, 'data/countries.json'), 'utf8'));
const sov = cj.countries.filter((c) => c.sovereign);
const iso3s = new Set(sov.map((c) => c.iso3));
const countrySlugs = new Set(sov.map((c) => slug(c.name)));
const expected = new Map([['/countries/', 'index'], ...REGIONS.map((r) => [`/countries/${slug(r)}/`, 'region']), ...sov.map((c) => [`/countries/${slug(c.name)}/`, 'country'])]);
const modes = new Set([...(await readFile(path.join(ROOT, 'src/game/modes.js'), 'utf8')).matchAll(/id:\s*'([a-z]+)'/g)].map((m) => m[1]));
// Pages other steps write: lessons (tools/seo) and the reference pages. Links to them are checked against
// their URL contracts here, and against the files by tools/seo/verify.mjs once everything is built.
const course = buildCourse(cj.countries);
const lessonPaths = new Set(course.lessons.map((l) => l.path));
const lessonOf = new Map(course.lessons.flatMap((l) => l.iso3.map((iso) => [iso, l])));
const refPaths = new Set(referencePaths(cj.countries));
const byIso = new Map(cj.countries.map((c) => [c.iso3, c]));
const FOOTER = `<footer class="colophon"><nav class="foot" aria-label="World Survey"><a href="/countries/">Countries</a><a href="${LISTS_INDEX}">Lists</a><a href="${COMPARE_INDEX}">Compare</a><a href="/learn/">Learn</a><a href="/atlas/">Atlas</a><a href="/">Play</a><a href="/about/">About</a><a href="${SITE_MAP}">Site map</a></nav>`;

// Same pattern as build.py's generic private-marker check.
const ANALYTICS_TAG = '<script src="/assets/analytics.js" defer></script>';
const PRIVATE = /\/Users\/|localhost|127\.0\.0\.1|@gmail/i;

const pages = [];
for (const [url, kind] of expected) {
  const file = path.join(out, url, 'index.html');
  if (!(await exists(file))) { fail(`missing page ${url}`); continue; }
  pages.push({ url, kind, file, html: await readFile(file, 'utf8') });
}
const dirs = (await readdir(path.join(out, 'countries'), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => `/countries/${d.name}/`);
for (const d of dirs) if (!expected.has(d)) fail(`unexpected page ${d}`);

const titles = new Map(), descs = new Map();
const outbound = new Map();
const gameRoutes = new Map();
const otherPages = new Map();
let ldCount = 0, questionCount = 0;
for (const p of pages) {
  const h = p.html;
  const title = h.match(/<title>([^<]*)<\/title>/)?.[1];
  const desc = h.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const canon = h.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  if (!title) fail(`${p.url}: no title`);
  if (!desc) fail(`${p.url}: no description`);
  if (canon !== SITE + p.url) fail(`${p.url}: canonical ${canon}`);
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type']) if (!h.includes(`property="${tag}"`)) fail(`${p.url}: no ${tag}`);
  for (const tag of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) if (!h.includes(`name="${tag}"`)) fail(`${p.url}: no ${tag}`);
  if ((h.match(/<h1[\s>]/g) ?? []).length !== 1) fail(`${p.url}: expected one h1`);
  titles.set(title, [...(titles.get(title) ?? []), p.url]);
  descs.set(desc, [...(descs.get(desc) ?? []), p.url]);
  p.title = title;
  p.desc = desc;

  // JSON-LD
  const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!lds.length) fail(`${p.url}: no JSON-LD`);
  for (const m of lds) {
    try {
      const j = JSON.parse(m[1]);
      ldCount++;
      const types = (j['@graph'] ?? [j]).map((x) => x['@type']);
      if (p.kind === 'country' && !(types.includes('Country') && types.includes('BreadcrumbList') && types.includes('FAQPage'))) fail(`${p.url}: JSON-LD types ${types}`);
      if (p.kind === 'country') {
        const c = j['@graph'].find((x) => x['@type'] === 'Country');
        if (!c.name || !c.geo?.latitude == null || !c.containedInPlace) fail(`${p.url}: Country JSON-LD incomplete`);
      }
    } catch (e) { fail(`${p.url}: JSON-LD does not parse: ${e.message}`); }
  }
  // The only other script allowed is one Speculation Rules block (data for the browser, not code).
  const spec = [...h.matchAll(/<script type="speculationrules">([\s\S]*?)<\/script>/g)];
  if (spec.length !== 1) fail(`${p.url}: ${spec.length} speculation rules blocks, expected one`);
  else {
    try {
      const rules = JSON.parse(spec[0][1]);
      const pre = rules.prerender?.flatMap((r) => r.where?.href_matches ?? []) ?? [];
      if (!pre.includes('/countries/*') || pre.some((x) => !/^\/(countries|lists|compare|sitemap)\/\*$/.test(x))) fail(`${p.url}: prerender rules ${pre}`);
      if (![...(rules.prerender ?? []), ...(rules.prefetch ?? [])].every((r) => r.eagerness === 'moderate')) fail(`${p.url}: speculation rules eagerness`);
    } catch (e) { fail(`${p.url}: speculation rules do not parse: ${e.message}`); }
  }
  const analytics = h.split(ANALYTICS_TAG).length - 1;
  if (analytics !== 1) fail(`${p.url}: ${analytics} analytics tags, expected one`);
  if ((h.match(/<script/g) ?? []).length !== lds.length + spec.length + analytics) fail(`${p.url}: has a script that is not JSON-LD, speculation rules or the analytics loader`);
  if (!h.includes(FOOTER)) fail(`${p.url}: footer navigation is missing or changed`);
  if (/[?&](?:amp;)?region=/.test(h)) fail(`${p.url}: a "?region=" link (region quizzes are paths)`);

  // Resources must be same-origin; collect outbound links.
  // Tags that fetch: img/script/source/iframe src, and <link> unless it is only a canonical/alternate pointer.
  for (const m of h.matchAll(/<(img|script|source|iframe|link)\b([^>]*)>/g)) {
    if (m[1] === 'link' && /rel="(canonical|alternate)"/.test(m[2])) continue;
    const ref = m[2].match(/(?:src|href)="([^"]+)"/)?.[1];
    if (ref && /^(https?:)?\/\//.test(ref)) fail(`${p.url}: external resource ${ref}`);
  }
  if (/url\(\s*['"]?https?:/.test(h)) fail(`${p.url}: external url() in inline style`);
  for (const m of h.matchAll(/<a\b[^>]*href="(https?:\/\/[^"/]+)[^"]*"/g)) outbound.set(m[1], (outbound.get(m[1]) ?? 0) + 1);

  // Internal links and assets.
  for (const m of h.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    const ref = m[1];
    if (ref.startsWith('//')) continue;
    if (ref.startsWith('/#')) { fail(`${p.url}: legacy hash route ${ref}`); continue; }
    // Game routes are real paths from src/routes.js (pre-rendered by tools/seo/build.mjs, not by this step):
    // check them against the route contract instead of the output folder.
    const [routePath, query = ''] = ref.split('#')[0].split('?');
    const atlas = routePath.match(/^\/atlas\/([a-z0-9-]+)\/$/);
    if (ROUTE_BY_PATH.has(routePath) || atlas) {
      gameRoutes.set(ref, (gameRoutes.get(ref) ?? 0) + 1);
      if (atlas && !countrySlugs.has(atlas[1])) fail(`${p.url}: atlas route to unknown country ${atlas[1]}`);
      const mode = ROUTE_BY_PATH.get(routePath)?.mode;
      if (mode && !modes.has(mode)) fail(`${p.url}: route ${routePath} names unknown mode ${mode}`);
      if (query) fail(`${p.url}: game route with a query string ${ref}`);
      continue;
    }
    if (lessonPaths.has(routePath) || refPaths.has(routePath)) {
      otherPages.set(routePath, (otherPages.get(routePath) ?? 0) + 1);
      continue;
    }
    if (/^\/(learn|lists|compare)\//.test(routePath)) { fail(`${p.url}: ${ref} is not a lesson, list or comparison in the URL contracts`); continue; }
    const clean = decodeURI(routePath);
    const target = clean.endsWith('/') ? path.join(out, clean, 'index.html') : path.join(out, clean);
    if (!(await exists(target))) {
      const inGame = !clean.endsWith('/') && (await exists(path.join(ROOT, clean)));
      fail(`${p.url}: broken link ${ref}${inGame ? ' (exists in the project; run with --with-assets)' : ''}`);
    }
  }
  const pm = h.match(PRIVATE);
  if (pm) fail(`${p.url}: private marker "${pm[0]}"`);
  p.bytes = Buffer.byteLength(h);
}

// Data rules from the release review: sovereign-only neighbour counts, calling codes, no ranks on stale values,
// and no promise of World Bank figures where there are none.
const encDoc = JSON.parse(await readFile(path.join(ROOT, 'data/encyclopedia.json'), 'utf8'));
const MIN_YEAR = 2018;
for (const c of sov) {
  const e = encDoc.countries[c.iso3];
  const sovCount = c.borders.filter((b) => iso3s.has(b)).length;
  if (e.sovereignNeighbourCount !== sovCount || e.ranks.neighbourCount?.world == null) fail(`${c.iso3}: neighbour count ${e.sovereignNeighbourCount} vs ${sovCount}`);
  for (const code of e.callingCodes ?? []) if (/^\+\d$/.test(code) && !['+1', '+7'].includes(code)) fail(`${c.iso3}: calling code ${code}`);
  for (const [k, st] of Object.entries(e.stats)) if (st && st.year < MIN_YEAR && e.ranks[k]) fail(`${c.iso3}: ${k} from ${st.year} is ranked`);
  for (const [k, y] of [['population', c.populationYear], ['gdp', c.gdpYear], ['lifeExpectancy', c.lifeExpectancyYear]]) if (y != null && y < MIN_YEAR && e.ranks[k]) fail(`${c.iso3}: ${k} from ${y} is ranked`);
  const page = pages.find((p) => p.url === `/countries/${slug(c.name)}/`);
  if (!page) continue;
  const hasWB = c.population != null || c.gdp != null || c.lifeExpectancy != null || Object.values(e.stats).some(Boolean);
  if (!hasWB && /World Bank figures/.test(page.desc)) fail(`${c.iso3}: description promises World Bank figures`);
  const shown = page.html.match(/<dt>Neighbours<\/dt><dd>(\d+)<\/dd>/)?.[1];
  if (Number(shown) !== sovCount) fail(`${c.iso3}: title block shows ${shown} neighbours, expected ${sovCount}`);
  // Questions: five to seven, printed and in JSON-LD word for word; figures keep their year and source.
  const { visible, ld } = faqOf(page.html);
  questionCount += visible.length;
  if (visible.length < 5 || visible.length > 7) fail(`${c.iso3}: ${visible.length} questions, expected 5 to 7`);
  if (!ld || visible.length !== ld.length || visible.some(([q, a], i) => q !== ld[i][0] || a !== ld[i][1])) fail(`${c.iso3}: FAQPage JSON-LD differs from the visible Questions section`);
  if (c.population != null && !visible.some(([, a]) => a.includes(`in ${c.populationYear}, according to the World Bank`))) fail(`${c.iso3}: population answer without year and source`);
  if (c.population == null && visible.some(([q]) => /population/i.test(q))) fail(`${c.iso3}: a population question without a population figure`);
  if (!e.currencies.length && visible.some(([q]) => /currency/i.test(q))) fail(`${c.iso3}: a currency question without a currency`);
  // Onward links: one comparison per sovereign land neighbour, the lesson that teaches it, the region quizzes.
  const hrefs = new Set([...page.html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]));
  for (const b of c.borders.filter((x) => iso3s.has(x))) if (!hrefs.has(comparePath(c, byIso.get(b)))) fail(`${c.iso3}: no comparison link with ${b}`);
  if ([...hrefs].filter((x) => x.startsWith('/compare/') && x !== COMPARE_INDEX).length !== sovCount) fail(`${c.iso3}: comparison links do not match its ${sovCount} land neighbours`);
  if (!hrefs.has(lessonOf.get(c.iso3)?.path)) fail(`${c.iso3}: no link to the lesson that teaches it`);
  for (const m of ['find', 'flagquiz', 'capitals']) if (!hrefs.has(`/play/${m}/${slug(c.region)}/`)) fail(`${c.iso3}: no link to /play/${m}/${slug(c.region)}/`);
  // A row marked "not ranked" must show no rank.
  for (const row of page.html.matchAll(/<tr><th scope="row">[^<]*<\/th><td>(?:(?!<\/tr>).)*not ranked(?:(?!<\/tr>).)*<\/tr>/g)) {
    if (/class="rank">\d/.test(row[0])) fail(`${c.iso3}: a stale value is ranked in the table`);
  }
}

// Sitemap
const sm = await readFile(path.join(out, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (new Set(locs).size !== locs.length) fail('sitemap has duplicate URLs');
if (!locs.includes(`${SITE}/`)) fail('sitemap misses /');
for (const u of expected.keys()) if (!locs.includes(SITE + u)) fail(`sitemap misses ${u}`);
// build.py folds robots-sitemap.txt into robots.txt and removes it, so a full dist/ has only the latter.
if (await exists(path.join(out, 'robots-sitemap.txt'))) {
  const robots = (await readFile(path.join(out, 'robots-sitemap.txt'), 'utf8')).trim();
  if (robots !== `Sitemap: ${SITE}/sitemap.xml`) fail(`robots-sitemap.txt: ${robots}`);
} else if (!(await exists(path.join(out, 'robots.txt'))) || !(await readFile(path.join(out, 'robots.txt'), 'utf8')).includes(`Sitemap: ${SITE}/sitemap.xml`)) {
  fail('neither robots-sitemap.txt nor a robots.txt with the Sitemap line');
}
const css = await readFile(path.join(out, 'assets/encyclopedia.css'), 'utf8');
if (/url\(\s*['"]?https?:/.test(css) || /@import/.test(css)) fail('encyclopedia.css loads something external');
if (PRIVATE.test(css)) fail('encyclopedia.css has a private marker');

// Report
const dupT = [...titles].filter(([, u]) => u.length > 1), dupD = [...descs].filter(([, u]) => u.length > 1);
const countryPages = pages.filter((p) => p.kind === 'country');
const sizes = countryPages.map((p) => p.bytes).sort((a, b) => a - b);
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
const biggest = [...countryPages].sort((a, b) => b.bytes - a.bytes).slice(0, 3).map((p) => `${p.url} ${kb(p.bytes)}`);
const longT = pages.filter((p) => p.title.length > 60), dl = pages.map((p) => p.desc.length);
console.log(`pages: ${countryPages.length} country, ${pages.filter((p) => p.kind === 'region').length} region, ${pages.filter((p) => p.kind === 'index').length} index (expected 195 / 5 / 1)`);
console.log(`titles: ${titles.size} unique of ${pages.length}; duplicates: ${dupT.length ? dupT.map(([t, u]) => `${t} -> ${u.join(', ')}`).join('; ') : 'none'}; over 60 chars: ${longT.length ? longT.map((p) => `${p.url} (${p.title.length})`).join(', ') : 'none'}`);
console.log(`descriptions: ${descs.size} unique of ${pages.length}; duplicates: ${dupD.length ? dupD.map(([t, u]) => `${u.join(', ')}`).join('; ') : 'none'}; length ${Math.min(...dl)}-${Math.max(...dl)} chars`);
console.log(`JSON-LD blocks parsed: ${ldCount}; questions: ${questionCount} on ${countryPages.length} country pages, each equal to its FAQPage JSON-LD`);
console.log(`country page HTML: min ${kb(sizes[0])}, median ${kb(sizes[sizes.length >> 1])}, max ${kb(sizes.at(-1))}; over 70 KB: ${sizes.filter((b) => b > 70 * 1024).length}; largest ${biggest.join(', ')}`);
console.log(`other pages: ${pages.filter((p) => p.kind !== 'country').map((p) => `${p.url} ${kb(p.bytes)}`).join(', ')}`);
console.log(`sitemap: ${locs.length} URLs; game routes linked: ${gameRoutes.size} distinct; lessons, lists and comparisons linked: ${otherPages.size} distinct; outbound link hosts: ${[...outbound].map(([h, n]) => `${h} (${n})`).join(', ')}`);
if (problems.length) {
  console.log(`\nFAILED: ${problems.length} problems`);
  for (const p of problems.slice(0, 40)) console.log('  ' + p);
  process.exit(1);
}
console.log('\nverify ok');
