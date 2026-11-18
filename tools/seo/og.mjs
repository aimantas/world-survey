// Share images for the country pages: one 1200×630 PNG per country in assets/og/<slug>.png, with the flag,
// the name in the sheet's wide caps, capital, region, population and area, and the page's own locator map.
//
//   PLAYWRIGHT_DIR=<a node_modules folder that has playwright> node tools/seo/og.mjs
//   ... node tools/seo/og.mjs --only=PER,LIE --out=<dir>     # a few countries into another folder, to look at
//
// Run once, and again when the data, the flags, the fonts or this template change (like icons.mjs). The build
// only copies the files; tools/encyclopedia/build.mjs points a country page at its image when the file exists.
//
// The card is an HTML page drawn by headless Chromium, because the fonts are variable woff2 files that sharp
// cannot load: the browser renders them exactly as the site does. Every request is answered from this
// project's files and anything else is refused, so nothing touches the network. The screenshot is then
// reduced to a palette of at most 256 colours with no dithering, which keeps each file small; the same
// machine and browser build give the same bytes on every run.
import { readFile, writeFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT, CACHE, slug, esc, people, latLngStr } from '../encyclopedia/lib.mjs';
import { areaStr } from '../encyclopedia/prose.mjs';
import { createMapper } from '../encyclopedia/map.mjs';

const W = 1200, H = 630;
const TARGET_KB = 60;
// Quantiser quality, tried in order until the file is within the target. 100 keeps a full 256-colour palette,
// which holds the flat map tints, the flag and the text edges exactly; a busy map (Russia, with half the
// Arctic in view) takes the next step down, which merges near-identical colours.
const QUALITIES = [100, 90, 80, 70];
const ORIGIN = 'http://world-survey.test'; // reserved TLD: never resolves; requests are answered from disk below

const argv = process.argv.slice(2);
const ONLY = new Set((argv.find((a) => a.startsWith('--only='))?.slice(7) ?? '').split(',').filter(Boolean));
const OUT = path.resolve(process.cwd(), argv.find((a) => a.startsWith('--out='))?.slice(6) ?? path.join(ROOT, 'assets', 'og'));
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };
const stop = (msg) => { console.error(`og: ${msg}`); process.exit(1); };

// ---------- Playwright: from PLAYWRIGHT_DIR, or wherever Node can resolve it from tools/ ----------
let chromium;
try {
  const from = process.env.PLAYWRIGHT_DIR ? path.join(path.resolve(process.env.PLAYWRIGHT_DIR), 'x.js') : path.join(ROOT, 'tools', 'x.js');
  ({ chromium } = createRequire(from)('playwright'));
} catch {
  stop('playwright not found. Set PLAYWRIGHT_DIR to a node_modules folder that contains it (it is not a dependency of this project).');
}

// ---------- Inputs ----------
const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const cj = await readJson(path.join(ROOT, 'data/countries.json'));
const topo = await readJson(path.join(ROOT, 'data/world.json'));
const marinePath = path.join(CACHE, 'ne/ne_50m_geography_marine_polys.geojson');
if (!(await exists(marinePath))) stop('marine polygons not cached (run tools/encyclopedia/fetch.mjs); the maps would lose their water names');
const mapper = createMapper(topo, cj.countries, await readJson(marinePath));
const sov = cj.countries.filter((c) => c.sovereign).sort((a, b) => a.name.localeCompare(b.name, 'en'));
const todo = sov.filter((c) => !ONLY.size || ONLY.has(c.iso3));
if (!todo.length) stop('no country matches --only');

// ---------- The card ----------
const WORDMARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="12.5"/><path d="M3.5 16h25M16 3.5c-4 3.6-6 7.8-6 12.5s2 8.9 6 12.5M16 3.5c4 3.6 6 7.8 6 12.5s-2 8.9-6 12.5"/><path class="tri" d="M16 11.5l3.6 6.3h-7.2z"/></svg>';
const CSS = `
/* Nothing may be in motion when the picture is taken. The site stylesheet gives every element a 0.01 ms
   transition under reduced motion, which is enough to make a size set by script read back as the old size. */
*, *::before, *::after { transition: none !important; animation: none !important; }
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: var(--paper); }
body { font: 400 16px/1.3 var(--sans); color: var(--ink); -webkit-font-smoothing: antialiased; }
.card { position: absolute; inset: 0; }
.frame { position: absolute; inset: 18px; border: 1.5px solid var(--ink); }
.frame::after { content: ''; position: absolute; inset: 5px; border: 1px solid var(--ink); }
.zebra { position: absolute; inset: 21px; --seg: 46px; background:
  repeating-linear-gradient(90deg, var(--ink) 0 var(--seg), transparent var(--seg) calc(var(--seg) * 2)) top left / 100% 3px no-repeat,
  repeating-linear-gradient(90deg, transparent 0 var(--seg), var(--ink) var(--seg) calc(var(--seg) * 2)) bottom left / 100% 3px no-repeat; }
.head { position: absolute; left: 52px; right: 52px; top: 44px; display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid var(--ink); }
.mark { display: flex; align-items: center; gap: 12px; font-weight: 760; font-stretch: 125%; font-size: 17px; letter-spacing: 0.2em; text-transform: uppercase; }
.mark svg { width: 30px; height: 30px; fill: none; stroke: var(--ink); stroke-width: 1.5; }
.mark svg .tri { fill: var(--overprint); stroke: none; }
.sheet { font-weight: 640; font-stretch: 76%; font-size: 14px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-2); }
.left { position: absolute; left: 52px; top: 118px; width: 560px; bottom: 52px; display: flex; flex-direction: column; }
.flag { width: 168px; height: 126px; border: 1px solid var(--ink); padding: 5px; background: #fff; box-shadow: 0 1px 0 var(--ink); }
.flag img { display: block; width: 100%; height: 100%; object-fit: cover; }
h1 { margin: 22px 0 0; font-weight: 720; font-stretch: 125%; line-height: 1.04; letter-spacing: 0.09em; text-transform: uppercase; overflow-wrap: normal; text-wrap: balance; }
.deck { margin: 12px 0 0; font: italic 420 25px/1.25 var(--serif); color: var(--water-ink); }
.cells { margin: auto 0 0; display: grid; grid-template-columns: 1.25fr 1fr; border: 1px solid var(--ink); background: var(--card); }
.cells div { padding: 10px 14px 11px; min-width: 0; }
.cells div + div { border-left: 1px solid var(--ink); }
.cells dt { font-weight: 640; font-stretch: 76%; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--ink-2); }
.cells dd { margin: 3px 0 0; font: 600 22px/1.2 var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cells dd small { font: italic 400 16px/1 var(--serif); color: var(--ink-3); }
dl { margin: 0; }
.right { position: absolute; right: 52px; top: 118px; width: 500px; }
.right .box { border: 1px solid var(--ink); outline: 1px solid var(--ink); outline-offset: 3px; background: var(--paper); line-height: 0; }
.right .map { display: block; width: 100%; height: auto; }
.right .coord { margin-top: 14px; display: flex; justify-content: space-between; font: 500 15px/1 var(--mono); color: var(--ink-2); }
/* The locator map at half its page width: use the lettering sizes the page uses on small screens. */
.map .m-l--t { font-size: 38px; }
.map .m-l--n { font-size: 26px; }
.map .m-l--sm { font-size: 20px; }
.map .m-l--o { display: none; }
.map .m-l--i { font-size: 21px; }
.map .m-w { font-size: 24px; }
.map .m-cap-l { font-size: 24px; }
.map .m-sb text { font-size: 22px; }
.map text { stroke-width: 5px; }
.map .m-in { filter: none; }
`;

function card(c, i) {
  const map = mapper.countryMap(c);
  const figures = [
    c.population != null ? ['Population', `${people(c.population)} <small>${c.populationYear}</small>`] : null,
    ['Area', areaStr(c.area)],
  ].filter(Boolean);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/assets/encyclopedia.css">
<style>${CSS}${figures.length === 1 ? '.cells { grid-template-columns: 1fr; }' : ''}</style>
</head>
<body>
<div class="card">
<div class="frame"></div><div class="zebra"></div>
<div class="head"><span class="mark">${WORDMARK}World Survey</span><span class="sheet">Sheet ${i + 1} of ${sov.length} · ${esc(c.region)}</span></div>
<div class="left">
${c.flag ? `<div class="flag"><img src="/${c.flag}" alt=""></div>` : ''}
<h1 id="name">${esc(c.name)}</h1>
<p class="deck">${c.capital ? `Capital ${esc(c.capital)}` : esc(c.region)}${c.capital && c.subregion ? ` · ${esc(c.subregion)}` : ''}</p>
<dl class="cells">${figures.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
</div>
<div class="right"><div class="box">${map.svg}</div><div class="coord"><span>${esc(c.iso3)}</span><span>${latLngStr(c.labelLatLng)}</span></div></div>
</div>
</body>
</html>`;
}

// ---------- Render ----------
const TYPES = { '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: 'light' });
const page = await context.newPage();
let html = '';
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== ORIGIN) return route.abort();
  if (url.pathname === '/card') return route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
  const file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(path.join(ROOT, 'assets') + path.sep) || !(await exists(file))) return route.abort();
  return route.fulfill({ contentType: TYPES[path.extname(file)] ?? 'application/octet-stream', body: await readFile(file) });
});

await mkdir(OUT, { recursive: true });
const t0 = Date.now();
const sizes = [];
for (const c of todo) {
  html = card(c, sov.indexOf(c));
  await page.goto(`${ORIGIN}/card`, { waitUntil: 'load' });
  // Fonts and the flag must be in before the name is fitted and the picture taken.
  const fitted = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    // Largest size at which the name sets in at most three lines with no word broken or overflowing.
    const h1 = document.getElementById('name');
    let size = 28;
    for (const px of [76, 70, 64, 58, 52, 47, 42, 38, 34, 31, 28]) {
      h1.style.fontSize = `${px}px`;
      const lines = Math.round(h1.getBoundingClientRect().height / (px * 1.04));
      if (h1.scrollWidth <= h1.clientWidth && lines <= (px > 52 ? 2 : 3)) { size = px; break; }
    }
    h1.style.fontSize = `${size}px`;
    const left = document.querySelector('.left').getBoundingClientRect(), cells = document.querySelector('.cells').getBoundingClientRect(), deck = document.querySelector('.deck').getBoundingClientRect();
    return { size, fonts: [...document.fonts].filter((f) => f.status === 'loaded').length, overlap: deck.bottom > cells.top - 6, overflow: cells.bottom > left.bottom + 1 };
  });
  if (!fitted.fonts) stop(`${c.name}: no web font loaded`);
  if (fitted.overlap || fitted.overflow) stop(`${c.name}: the card does not fit (name at ${fitted.size}px)`);
  const shot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
  let png = null, quality = 0;
  for (quality of QUALITIES) {
    png = await sharp(shot).png({ palette: true, quality, dither: 0, effort: 10, compressionLevel: 9 }).toBuffer();
    if (png.length <= TARGET_KB * 1024) break;
  }
  await writeFile(path.join(OUT, `${slug(c.name)}.png`), png);
  sizes.push([png.length, c.name, quality]);
}
await browser.close();

// A full run owns the folder: drop images of countries that are no longer in the data.
if (!ONLY.size) {
  const keep = new Set(sov.map((c) => `${slug(c.name)}.png`));
  for (const f of await readdir(OUT)) if (f.endsWith('.png') && !keep.has(f)) await rm(path.join(OUT, f));
}

sizes.sort((a, b) => a[0] - b[0]);
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;
const over = sizes.filter(([b]) => b > TARGET_KB * 1024);
const reduced = sizes.filter(([, , q]) => q !== QUALITIES[0]);
const where = path.relative(process.cwd(), OUT);
console.log(`og: ${sizes.length} images ${W}×${H} into ${where && !where.startsWith('..') ? where : OUT}, min ${kb(sizes[0][0])}, median ${kb(sizes[sizes.length >> 1][0])}, max ${kb(sizes.at(-1)[0])} (${sizes.at(-1)[1]}), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (reduced.length) console.log(`palette quality lowered to stay within ${TARGET_KB} KB: ${reduced.map(([, n, q]) => `${n} (${q})`).join(', ')}`);
if (over.length) {
  console.log(`over the ${TARGET_KB} KB target: ${over.map(([b, n]) => `${n} ${kb(b)}`).join(', ')}`);
  process.exit(1);
}
