// Checks the generated reference pages: node tools/reference/verify.mjs <outDir>   (exit 1 on failure)
//
// Every page urls.mjs promises exists and nothing else sits in /lists/ or /compare/; one title, description,
// canonical and h1 each; titles and descriptions unique (within the two families and against every other page
// in <outDir>); descriptions 50-160 characters; JSON-LD parses with the expected nodes; every internal link and
// asset resolves (files for /lists/, /compare/, /countries/, /assets/; the route contract in src/routes.js for
// game links); no document-relative URLs, external resources, hosts off the allowlist or private markers; and
// the tables hold what the data says they should (row counts, rank order, "no data" never printed as zero).
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, SITE, MIN_RANK_YEAR, slug } from '../encyclopedia/lib.mjs';
import { LISTS, LISTS_INDEX, COMPARE_INDEX, SITE_MAP, listPath, comparePairs, referencePaths } from './urls.mjs';
import { loadData } from './data.mjs';
import { speculationTag } from './chrome.mjs';
import { resolve as resolveRoute } from '../../src/routes.js';

const OUT = path.resolve(process.cwd(), process.argv[2] ?? 'tools/reference/_out');
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const problems = [], warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

const PRIVATE = /\/Users\/|localhost|127\.0\.0\.1|@gmail/i;
// Same allowlist as tools/seo/verify.mjs, so these pages pass that check once they are in the full build.
const ALLOWED_HOSTS = new Set(['geography.aimantas.com', 'aimantas.com', 'schema.org', 'www.naturalearthdata.com', 'github.com', 'opendatacommons.org', 'data.worldbank.org', 'creativecommons.org', 'www.wikidata.org']);
const unesc = (s) => s?.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (h) => unesc(h.replace(/<[^>]+>/g, ''));
const count = (h, rx) => (h.match(rx) ?? []).length;
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

async function walk(dir, acc = []) {
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) await walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

// The chrome every static page shares: the footer as tools/seo/verify.mjs expects it, and the masthead nav of a
// country page already in <outDir>, when there is one to compare with.
const FOOTER = `<footer class="colophon"><nav class="foot" aria-label="World Survey"><a href="/countries/">Countries</a><a href="${LISTS_INDEX}">Lists</a><a href="${COMPARE_INDEX}">Compare</a><a href="/learn/">Learn</a><a href="/atlas/">Atlas</a><a href="/">Play</a><a href="/about/">About</a><a href="${SITE_MAP}">Site map</a></nav>`;
const sample = path.join(OUT, 'countries', 'index.html');
const MAST = (await exists(sample)) ? (await readFile(sample, 'utf8')).match(/<nav aria-label="Atlas">[\s\S]*?<\/nav>/)?.[0].replace(/ aria-current="page"/g, '') : null;

const D = await loadData(OUT);
const pairs = comparePairs(D.cj.countries);
const countrySlugs = new Set(D.recs.map((r) => r.slug));
const kindOf = (url) => (url === LISTS_INDEX ? 'lists-index' : url === COMPARE_INDEX ? 'compare-index' : url.startsWith('/lists/') ? 'list' : 'compare');
const expected = referencePaths(D.cj.countries);
if (expected.length !== LISTS.length + pairs.length + 2) fail(`urls.mjs lists ${expected.length} paths, expected ${LISTS.length + pairs.length + 2}`);

// ---------- Pages present, nothing unexpected ----------
const pages = [];
for (const url of expected) {
  const file = path.join(OUT, url, 'index.html');
  if (!(await exists(file))) { fail(`missing page ${url}`); continue; }
  pages.push({ url, kind: kindOf(url), file, html: await readFile(file, 'utf8') });
}
for (const family of ['lists', 'compare']) {
  const dir = path.join(OUT, family);
  if (!(await exists(dir))) continue;
  for (const f of await walk(dir)) {
    const rel = `/${path.relative(OUT, f).split(path.sep).join('/')}`;
    if (!rel.endsWith('/index.html') || !expected.includes(rel.slice(0, -'index.html'.length))) fail(`unexpected file ${rel}`);
  }
}

// ---------- Per page ----------
const titles = new Map(), descs = new Map(), hosts = new Map(), gameLinks = new Map();
const fileCache = new Map();
const hasFile = async (p) => { if (!fileCache.has(p)) fileCache.set(p, await exists(p)); return fileCache.get(p); };
let ldBlocks = 0, linksChecked = 0, images = 0;

for (const p of pages) {
  const h = p.html;
  const one = (label, rx) => { const n = count(h, rx); if (n !== 1) fail(`${p.url}: ${n} ${label}`); };
  one('title tags', /<title>/g);
  one('meta descriptions', /<meta name="description"/g);
  one('canonical links', /<link rel="canonical"/g);
  one('h1 elements', /<h1[\s>]/g);
  one('main elements', /<main[\s>]/g);
  const title = unesc(h.match(/<title>([^<]*)<\/title>/)?.[1]);
  const desc = unesc(h.match(/<meta name="description" content="([^"]*)"/)?.[1]);
  p.title = title ?? '';
  p.desc = desc ?? '';
  if (!title) fail(`${p.url}: empty title`);
  if (!desc) fail(`${p.url}: empty description`);
  if (h.match(/<link rel="canonical" href="([^"]*)"/)?.[1] !== SITE + p.url) fail(`${p.url}: canonical is not ${SITE + p.url}`);
  if (!/<html lang="en">/.test(h)) fail(`${p.url}: no <html lang="en">`);
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image', 'og:type', 'og:site_name']) if (!h.includes(`property="${tag}"`)) fail(`${p.url}: no ${tag}`);
  for (const tag of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) if (!h.includes(`name="${tag}"`)) fail(`${p.url}: no ${tag}`);
  if (unesc(h.match(/<meta property="og:title" content="([^"]*)"/)?.[1]) !== title) fail(`${p.url}: og:title differs from the title`);
  if (unesc(h.match(/<meta property="og:description" content="([^"]*)"/)?.[1]) !== desc) fail(`${p.url}: og:description differs from the description`);
  if (h.match(/<meta property="og:url" content="([^"]*)"/)?.[1] !== SITE + p.url) fail(`${p.url}: og:url`);
  if (h.match(/<meta property="og:image" content="([^"]*)"/)?.[1] !== `${SITE}/assets/og.png`) fail(`${p.url}: og:image`);
  if (/<meta name="robots"[^>]*noindex/.test(h)) fail(`${p.url}: carries noindex`);
  if (desc && (desc.length < 50 || desc.length > 160)) fail(`${p.url}: description is ${desc.length} characters`);
  titles.set(title, [...(titles.get(title) ?? []), p.url]);
  descs.set(desc, [...(descs.get(desc) ?? []), p.url]);
  const css = [...h.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1].split('?')[0]);
  if (css.join(' ') !== '/assets/encyclopedia.css /assets/reference.css') fail(`${p.url}: stylesheets are ${css.join(', ')}`);
  for (const part of ['<header class="mast">', '<nav class="crumbs"', '<div class="neat"']) if (!h.includes(part)) fail(`${p.url}: no ${part}`);
  if (!h.includes(FOOTER)) fail(`${p.url}: footer navigation differs from the country pages'`);
  if (MAST && !h.includes(MAST)) fail(`${p.url}: masthead navigation differs from the country pages'`);
  if (/Built by AI|built by AI|AI-generated/i.test(h)) fail(`${p.url}: mentions how the page was made`);
  if (/[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}]/u.test(h)) fail(`${p.url}: emoji or arrow glyph in the page`);
  if (/\b(neighbor|color|center)(s|ed|ing)?\b/.test(text(h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '')))) fail(`${p.url}: American spelling`);

  // JSON-LD
  const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (lds.length !== 1) fail(`${p.url}: ${lds.length} JSON-LD blocks`);
  for (const m of lds) {
    let j;
    try { j = JSON.parse(m[1]); ldBlocks++; } catch (e) { fail(`${p.url}: JSON-LD does not parse: ${e.message}`); continue; }
    if (j['@context'] !== 'https://schema.org') fail(`${p.url}: JSON-LD @context`);
    const graph = j['@graph'] ?? [j];
    const node = (type) => graph.find((x) => x['@type'] === type);
    const wp = node('WebPage'), bc = node('BreadcrumbList');
    if (!wp || !bc) { fail(`${p.url}: JSON-LD needs WebPage and BreadcrumbList`); continue; }
    if (wp.url !== SITE + p.url || wp.name !== title || wp.description !== desc) fail(`${p.url}: WebPage node does not match the page`);
    if (wp.isPartOf?.['@type'] !== 'WebSite') fail(`${p.url}: WebPage is not part of the WebSite`);
    if (wp.author?.name !== 'Aimantas') fail(`${p.url}: author is not Aimantas`);
    bc.itemListElement.forEach((it, i) => { if (it.position !== i + 1 || !it.item?.startsWith(SITE)) fail(`${p.url}: breadcrumb ${i + 1}`); });
    if (bc.itemListElement.at(-1)?.item !== SITE + p.url) fail(`${p.url}: last breadcrumb is not the page`);
    for (const it of bc.itemListElement.slice(1)) {
      const u = it.item.slice(SITE.length);
      if (!(await hasFile(path.join(OUT, u, 'index.html')))) fail(`${p.url}: breadcrumb ${u} has no file`);
    }
    if (p.kind !== 'compare') {
      const il = node('ItemList');
      if (!il || !il.itemListElement?.length || il.itemListElement.length > 12) fail(`${p.url}: ItemList missing or too long`);
      for (const it of il?.itemListElement ?? []) if (!(await hasFile(path.join(OUT, it.url.slice(SITE.length), 'index.html')))) fail(`${p.url}: ItemList item ${it.url} has no file`);
    }
    if (p.kind === 'list') {
      const list = LISTS.find((l) => listPath(l.slug) === p.url);
      const ds = node('Dataset');
      if (list.measure && !ds) fail(`${p.url}: statistical list without a Dataset node`);
      if (ds) {
        if (!ds.name || !ds.description || ds.description.length < 50) fail(`${p.url}: Dataset needs a name and a description of 50+ characters`);
        if (!ds.license?.length || !ds.isBasedOn?.length || !ds.citation) fail(`${p.url}: Dataset names no source or licence`);
        for (const s of ds.isBasedOn ?? []) if (!s.license || !s.publisher?.name || !s.url) fail(`${p.url}: Dataset source incomplete`);
      }
    }
    if (p.kind === 'compare') {
      const pair = pairs.find((x) => x.path === p.url);
      const want = [pair.a, pair.b].map((c) => `${SITE}/countries/${slug(c.name)}/#country`);
      const got = (wp.about ?? []).map((x) => x['@id']);
      if (got.join(' ') !== want.join(' ')) fail(`${p.url}: about is ${got.join(', ')}`);
    }
  }
  const scripts = [...h.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  for (const s of scripts) if (!/type="(application\/ld\+json|speculationrules)"/.test(s) && !/src="\/assets\/reference\.js\?v=[0-9a-f]{8}" defer/.test(s) && s.trim() !== 'src="/assets/analytics.js" defer') fail(`${p.url}: unexpected script ${s}`);
  if (h.split('<script src="/assets/analytics.js" defer></script>').length !== 2) fail(`${p.url}: the analytics tag is missing or repeated`);
  // Same Speculation Rules as the country pages, when that module is in the tree.
  const spec = h.match(/<script type="speculationrules">[\s\S]*?<\/script>/g) ?? [];
  if (speculationTag ? spec.length !== 1 || spec[0] !== speculationTag : spec.length) fail(`${p.url}: speculation rules differ from the country pages'`);

  // URLs: root-absolute only, same-origin resources, known hosts.
  for (const m of h.matchAll(/<(img|script|source|iframe|link|use|a)\b([^>]*)>/g)) {
    const ref = m[2].match(/\s(?:src|href)="([^"]*)"/)?.[1];
    if (ref == null) continue;
    const external = /^https?:\/\//.test(ref);
    if (!external && !ref.startsWith('/') && !ref.startsWith('#')) { fail(`${p.url}: document-relative URL ${ref}`); continue; }
    if (ref.startsWith('//')) { fail(`${p.url}: protocol-relative URL ${ref}`); continue; }
    if (external) {
      if (m[1] !== 'a' && !(m[1] === 'link' && /rel="canonical"/.test(m[2]))) fail(`${p.url}: external resource ${ref}`);
      continue;
    }
    if (ref.startsWith('#')) {
      if (m[1] !== 'use') fail(`${p.url}: fragment-only link ${ref}`);
      else if (!h.includes(`id="${ref.slice(1)}"`)) fail(`${p.url}: <use> points at missing ${ref}`);
      continue;
    }
    linksChecked++;
    const clean = decodeURI(ref.split('#')[0].split('?')[0]);
    if (clean === SITE_MAP) continue; // the HTML site map is written and checked by tools/seo, after this step
    if (/^\/(lists|compare|countries|assets)\//.test(clean)) {
      const target = clean.endsWith('/') ? path.join(OUT, clean, 'index.html') : path.join(OUT, clean);
      if (!(await hasFile(target))) fail(`${p.url}: broken link ${ref}`);
    } else {
      // Game routes are pre-rendered by tools/seo; check them against the route contract.
      const r = resolveRoute(clean);
      if (r.unknown) fail(`${p.url}: ${ref} is not a route in src/routes.js`);
      const atlas = clean.match(/^\/atlas\/([a-z0-9-]+)\/$/);
      if (atlas && !countrySlugs.has(atlas[1])) fail(`${p.url}: atlas link to unknown country ${atlas[1]}`);
      gameLinks.set(clean, (gameLinks.get(clean) ?? 0) + 1);
    }
  }
  if (/url\(\s*['"]?(https?:)?\/\//.test(h) || /\sstyle="/.test(h)) fail(`${p.url}: inline style or external url()`);
  for (const u of h.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    const host = u[1].toLowerCase();
    hosts.set(host, (hosts.get(host) ?? 0) + 1);
    if (!ALLOWED_HOSTS.has(host)) fail(`${p.url}: outbound host ${host} is not on the allowlist`);
  }
  for (const m of h.matchAll(/<img\b([^>]*)>/g)) {
    images++;
    if (!/\swidth="\d+"/.test(m[1]) || !/\sheight="\d+"/.test(m[1]) || !/\salt="/.test(m[1])) fail(`${p.url}: image without width, height or alt: ${m[1].slice(0, 60)}`);
  }
  const pm = h.match(PRIVATE);
  if (pm) fail(`${p.url}: private marker "${pm[0]}"`);
  p.bytes = Buffer.byteLength(h);
}

// ---------- Uniqueness, also against the rest of the output folder ----------
for (const [t, u] of titles) if (u.length > 1) fail(`duplicate title "${t}": ${u.join(', ')}`);
for (const [d, u] of descs) if (u.length > 1) fail(`duplicate description: ${u.join(', ')}`);
let otherPages = 0;
for (const f of (await walk(OUT)).filter((x) => x.endsWith('index.html'))) {
  const rel = `/${path.relative(OUT, f).split(path.sep).join('/')}`;
  if (/^\/(lists|compare|_[^/]*)\//.test(rel)) continue;
  const h = await readFile(f, 'utf8');
  otherPages++;
  const t = unesc(h.match(/<title>([^<]*)<\/title>/)?.[1]), d = unesc(h.match(/<meta name="description" content="([^"]*)"/)?.[1]);
  if (t && titles.has(t)) fail(`title "${t}" is also used by ${rel}`);
  if (d && descs.has(d)) fail(`description of ${descs.get(d)[0]} is also used by ${rel}`);
}

// ---------- Content against the data ----------
const page = (url) => pages.find((x) => x.url === url);
const rowsOf = (h) => [...(h.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '').matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
const sovereign = D.recs.length;
const wantRows = {
  'countries-by-population': sovereign, 'countries-by-area': sovereign, 'countries-by-gdp': sovereign, 'countries-by-gdp-per-capita': sovereign,
  'countries-by-population-density': sovereign, 'countries-by-life-expectancy': sovereign, 'countries-by-number-of-neighbours': sovereign,
  'smallest-countries': 30, 'landlocked-countries': D.recs.filter((r) => r.c.landlocked).length, 'island-countries': D.recs.filter((r) => r.c.island).length,
  'capital-cities': sovereign,
};
const measureKey = { population: 'population', area: 'area', gdp: 'gdp', gdpPerCapita: 'gdpPerCapita', density: 'density', lifeExpectancy: 'lifeExpectancy', neighbours: 'neighbours' };
for (const list of LISTS) {
  const p = page(listPath(list.slug));
  if (!p) continue;
  if (text(p.html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '') !== list.label) fail(`${p.url}: h1 is not "${list.label}"`);
  const paras = [...(p.html.match(/<section class="prose[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1]));
  if (paras.length < 2 || paras.join(' ').length < 200) fail(`${p.url}: summary prose is missing or too thin`);
  if (!/class="btn btn--go" href="\/(higher-or-lower|play)\//.test(p.html)) fail(`${p.url}: no call to action into the game`);
  for (const other of LISTS) if (!p.html.includes(`href="${listPath(other.slug)}"`)) fail(`${p.url}: no link to ${listPath(other.slug)}`);
  if (!p.html.includes(`href="${COMPARE_INDEX}"`)) fail(`${p.url}: no link to ${COMPARE_INDEX}`);
  if (list.slug === 'flags-of-the-world') {
    const flags = [...p.html.matchAll(/<li data-name="[^"]*"><a href="(\/countries\/[^"]+)"><img src="(\/assets\/flags\/[^"]+)" width="\d+" height="\d+" alt="Flag of [^"]+" loading="lazy">/g)];
    if (flags.length !== sovereign || new Set(flags.map((m) => m[1])).size !== sovereign) fail(`${p.url}: ${flags.length} flags, expected ${sovereign}`);
    continue;
  }
  const rows = rowsOf(p.html);
  if (rows.length !== wantRows[list.slug]) fail(`${p.url}: ${rows.length} table rows, expected ${wantRows[list.slug]}`);
  const linked = new Set(rows.map((r) => r.match(/<th scope="row"[^>]*><a href="(\/countries\/[^"]+)"/)?.[1]));
  if (linked.size !== rows.length || linked.has(undefined)) fail(`${p.url}: rows do not each link one country page`);
  for (const r of rows) if (/<img/.test(r) && !/<img [^>]*width="24" height="18"[^>]*loading="lazy"/.test(r)) fail(`${p.url}: a flag is not small and lazy-loaded`);
  if (!list.measure) continue;
  // Ranked tables: ranks never go down, equal ranks only for equal figures, no figure for a country without one.
  const key = measureKey[list.measure];
  const smallest = list.slug === 'smallest-countries';
  let prevRank = 0, prevSort = null, unranked = false;
  for (const r of rows) {
    const rank = r.match(/<td class="rk"[^>]*>([^<]*)<\/td>/)?.[1];
    const href = r.match(/<a href="(\/countries\/[^"]+)"/)[1];
    const rec = D.recs.find((x) => x.url === href);
    const f = rec.m[key];
    const sort = r.match(/<td class="r"[^>]* data-sort="([^"]*)"/)?.[1];
    if (rank === '—') {
      unranked = true;
      if (f && !f.stale) fail(`${p.url}: ${rec.name} has a current figure but no rank`);
      if (!f && !/no data/.test(r)) fail(`${p.url}: ${rec.name} has no figure but the row does not say "no data"`);
      if (!f && sort !== '') fail(`${p.url}: ${rec.name} has no figure but sorts as ${sort}`);
      if (f?.stale && !new RegExp(`older than ${MIN_RANK_YEAR}, not ranked`).test(r)) fail(`${p.url}: ${rec.name} is stale but not marked`);
      continue;
    }
    if (unranked) fail(`${p.url}: ranked row after the unranked ones (${rec.name})`);
    const n = Number(rank);
    if (!Number.isInteger(n) || n < prevRank) fail(`${p.url}: rank ${rank} out of order at ${rec.name}`);
    if (!smallest && n !== rec.rank[key]) fail(`${p.url}: ${rec.name} is ranked ${n}, the country page says ${rec.rank[key]}`);
    if (!f || f.stale) fail(`${p.url}: ${rec.name} is ranked without a current figure`);
    if (prevSort != null && n === prevRank && Number(sort) !== prevSort) fail(`${p.url}: ${rec.name} shares rank ${n} with a different figure`);
    if (f && Math.abs(Number(sort) - f.value) > 1e-6 * Math.max(1, Math.abs(f.value))) fail(`${p.url}: ${rec.name} figure ${sort} is not the data value ${f.value}`);
    if (f?.year && !r.includes(`<span class="yr">${f.year}</span>`)) fail(`${p.url}: ${rec.name} figure has no year`);
    prevRank = n;
    prevSort = Number(sort);
  }
}
{
  const p = page(LISTS_INDEX);
  if (p) for (const l of LISTS) if (!p.html.includes(`href="${listPath(l.slug)}"`)) fail(`${LISTS_INDEX}: no link to ${l.slug}`);
  const c = page(COMPARE_INDEX);
  if (c) for (const x of pairs) if (!c.html.includes(`href="${x.path}"`)) fail(`${COMPARE_INDEX}: no link to ${x.path}`);
}
let maps = 0;
for (const x of pairs) {
  const p = page(x.path);
  if (!p) continue;
  const h = p.html;
  const [sa, sb] = [x.a, x.b].map((c) => slug(c.name));
  for (const s of [sa, sb]) {
    if (!h.includes(`href="/countries/${s}/"`)) fail(`${p.url}: no link to /countries/${s}/`);
    if (!h.includes(`href="/atlas/${s}/"`)) fail(`${p.url}: no globe link for ${s}`);
  }
  if (!h.includes('href="/higher-or-lower/neighbours/"')) fail(`${p.url}: no call to action`);
  if (!h.includes(`href="${COMPARE_INDEX}"`)) fail(`${p.url}: no link to ${COMPARE_INDEX}`);
  if (count(h, /<div class="tb-duo">/g) !== 1 || count(h.match(/<div class="tb-duo">[\s\S]*?<\/div>/)?.[0] ?? '', /<img /g) !== 2) fail(`${p.url}: both flags are not in the title block`);
  if (!/<h1 class="pair">[^<]+ <i>and<\/i> [^<]+ <i>compared<\/i><\/h1>/.test(h)) fail(`${p.url}: h1 wording`);
  if (rowsOf(h).length !== 10) fail(`${p.url}: comparison table has ${rowsOf(h).length} rows, expected 10`);
  if (/<svg class="map map--pair"/.test(h)) maps++;
  const sentences = [...(h.match(/<section class="prose[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])).join(' ').split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s) => !/^D\.C\./.test(s));
  if (sentences.length < 3 || sentences.length > 6) warn(`${p.url}: ${sentences.length} sentences of prose`);
  // Each country's other neighbours must be linked as comparisons.
  for (const [me, other] of [[x.a, x.b], [x.b, x.a]]) {
    for (const n of D.byIso.get(me.iso3).nbs) {
      if (n.iso3 === other.iso3) continue;
      const want = pairs.find((q) => (q.a.iso3 === me.iso3 && q.b.iso3 === n.iso3) || (q.b.iso3 === me.iso3 && q.a.iso3 === n.iso3));
      if (!want || !h.includes(`href="${want.path}"`)) fail(`${p.url}: no link to ${me.name} and ${n.name}`);
    }
  }
}
if (maps !== 0 && maps !== pairs.length) fail(`${maps} of ${pairs.length} comparison pages have a map`);
if (maps === 0 && pairs.length) warn('comparison pages have no locator maps (built with --no-maps, or data/world.json is missing)');

// ---------- Assets ----------
for (const f of ['reference.css', 'reference.js']) {
  const built = path.join(OUT, 'assets', f), src = path.join(ROOT, 'assets', f);
  if (!(await exists(built))) { fail(`assets/${f} was not copied`); continue; }
  const t = await readFile(built, 'utf8');
  if (t !== (await readFile(src, 'utf8'))) fail(`assets/${f} in the output differs from the source`);
  if (/url\(\s*['"]?(https?:)?\/\//.test(t) || /@import/.test(t) || /https?:\/\//.test(t)) fail(`assets/${f} names something external`);
  if (PRIVATE.test(t)) fail(`assets/${f} has a private marker`);
}

// ---------- Report ----------
const by = (kind) => pages.filter((p) => p.kind === kind);
const sizes = pages.map((p) => p.bytes ?? 0).sort((a, b) => a - b);
const total = sizes.reduce((s, b) => s + b, 0);
const med = (list) => { const s = list.map((p) => p.bytes).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };
const biggest = [...pages].sort((a, b) => b.bytes - a.bytes).slice(0, 3).map((p) => `${p.url} ${kb(p.bytes)}`);
const longTitles = pages.filter((p) => p.title.length > 60);
const dl = pages.map((p) => p.desc.length);
console.log(`pages: ${by('list').length} lists, ${by('compare').length} comparisons, 2 indexes (expected ${LISTS.length} / ${pairs.length} / 2); maps: ${maps}`);
console.log(`titles: ${titles.size} unique of ${pages.length}, also unique against ${otherPages} other pages in the folder; over 60 characters: ${longTitles.length ? longTitles.map((p) => `${p.url} (${p.title.length})`).join(', ') : 'none'}`);
console.log(`descriptions: ${descs.size} unique of ${pages.length}; length ${Math.min(...dl)}-${Math.max(...dl)} characters`);
console.log(`JSON-LD blocks parsed: ${ldBlocks}; internal links and assets checked: ${linksChecked}; images: ${images}; game routes linked: ${gameLinks.size} distinct`);
console.log(`size: ${(total / 1048576).toFixed(1)} MB in all, median ${kb(sizes[sizes.length >> 1])} (lists ${kb(med(by('list')))}, comparisons ${kb(med(by('compare')))}); largest ${biggest.join(', ')}`);
console.log(`outbound hosts: ${[...hosts].map(([h, n]) => `${h} (${n})`).join(', ')}`);
if (warnings.length) {
  console.log(`\nwarnings: ${warnings.length}`);
  for (const w of warnings.slice(0, 20)) console.log('  ' + w);
  if (warnings.length > 20) console.log(`  … ${warnings.length - 20} more`);
}
if (problems.length) {
  console.log(`\nFAILED: ${problems.length} problems`);
  for (const p of problems.slice(0, 40)) console.log('  ' + p);
  if (problems.length > 40) console.log(`  … ${problems.length - 40} more`);
  process.exit(1);
}
console.log('\nverify ok');
