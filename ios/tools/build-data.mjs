// Builds the app's bundled data from the web game's sources:
//   Resources/countries.json  the country table (unchanged) plus the web slug of each country page
//   Resources/world.json      1:50m outlines (unchanged copy)
//   Resources/course.json     the 39 field-course lessons, from the same code the site runs
//   Assets.xcassets/Flags     one PNG per flag, rasterised from the flag-icons SVGs
//   Assets.xcassets/AppIcon   the app icon
//
// Run: node ios/tools/build-data.mjs   (uses sharp from ../../tools/node_modules)
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const app = path.resolve(here, '../WorldSurvey');
const require = createRequire(path.join(root, 'tools/package.json'));
const sharp = require('sharp');

const { buildCourse } = await import(path.join(root, 'src/game/course.js'));
const { LOOKALIKE_GROUPS } = await import(path.join(root, 'src/game/lookalikes.js'));

const slugOf = (name) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const table = JSON.parse(await readFile(path.join(root, 'data/countries.json'), 'utf8'));
const resources = path.join(app, 'Resources');
await mkdir(resources, { recursive: true });

// ---- data ----
const countries = table.countries.map((c) => ({ ...c, slug: c.sovereign ? slugOf(c.name) : null }));
await writeFile(path.join(resources, 'countries.json'), JSON.stringify({ generated: table.generated, sources: table.sources, countries }));
await copyFile(path.join(root, 'data/world.json'), path.join(resources, 'world.json'));

const course = buildCourse(table.countries);
const lessons = course.lessons.map(({ slug, region, group, name, number, iso3 }) => ({ slug, region, group, name, number, iso3 }));
await writeFile(path.join(resources, 'course.json'), JSON.stringify({ lessons, lookalikes: LOOKALIKE_GROUPS }));
console.log(`countries ${countries.length}, lessons ${lessons.length}, lookalike groups ${LOOKALIKE_GROUPS.length}`);

// ---- flags ----
const flagsDir = path.join(app, 'Assets.xcassets/Flags');
await rm(flagsDir, { recursive: true, force: true });
await mkdir(flagsDir, { recursive: true });
await writeFile(path.join(flagsDir, 'Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 }, properties: { 'provides-namespace': true } }, null, 2));
let flags = 0;
let bytes = 0;
for (const c of table.countries) {
  if (!c.flag || !c.iso2) continue;
  const code = c.iso2.toLowerCase();
  const svg = await readFile(path.join(root, c.flag));
  const png = await sharp(svg, { density: 300 }).resize(360, 270, { fit: 'fill' }).png({ compressionLevel: 9, palette: true, colours: 128 }).toBuffer();
  const set = path.join(flagsDir, `${code}.imageset`);
  await mkdir(set, { recursive: true });
  await writeFile(path.join(set, `${code}.png`), png);
  await writeFile(path.join(set, 'Contents.json'), JSON.stringify({
    images: [{ filename: `${code}.png`, idiom: 'universal', scale: '3x' }],
    info: { author: 'xcode', version: 1 },
  }, null, 2));
  flags += 1;
  bytes += png.length;
}
console.log(`flags ${flags}, ${(bytes / 1024).toFixed(0)} KB`);

// ---- app icon ----
// The site's mark, full bleed: a survey-blue globe in ink line work with the magenta benchmark triangle.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#f4f5f0"/>
  <g fill="none" stroke="#1b232b" stroke-opacity=".16" stroke-width="6">
    <path d="M0 256h1024M0 512h1024M0 768h1024M256 0v1024M512 0v1024M768 0v1024"/>
  </g>
  <circle cx="512" cy="512" r="372" fill="#fbfcf8" stroke="#1b232b" stroke-width="10"/>
  <circle cx="512" cy="512" r="330" fill="#a9d2e4" stroke="#1b232b" stroke-width="34"/>
  <g fill="none" stroke="#1b232b" stroke-width="24" stroke-linecap="round">
    <path d="M182 512h660"/>
    <path d="M512 182c-108 95-158 205-158 330s50 235 158 330"/>
    <path d="M512 182c108 95 158 205 158 330s-50 235-158 330"/>
  </g>
  <path d="M512 368l122 216H390z" fill="#c3177b" stroke="#fbfcf8" stroke-width="14" stroke-linejoin="round"/>
</svg>`;
const iconDir = path.join(app, 'Assets.xcassets/AppIcon.appiconset');
await mkdir(iconDir, { recursive: true });
await sharp(Buffer.from(icon)).resize(1024, 1024).flatten({ background: '#f4f5f0' }).png().toFile(path.join(iconDir, 'icon-1024.png'));
await writeFile(path.join(iconDir, 'Contents.json'), JSON.stringify({
  images: [{ filename: 'icon-1024.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
  info: { author: 'xcode', version: 1 },
}, null, 2));
await writeFile(path.join(app, 'Assets.xcassets/Contents.json'), JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2));
const accent = path.join(app, 'Assets.xcassets/AccentColor.colorset');
await mkdir(accent, { recursive: true });
await writeFile(path.join(accent, 'Contents.json'), JSON.stringify({
  colors: [{ idiom: 'universal', color: { 'color-space': 'srgb', components: { red: '0.765', green: '0.090', blue: '0.482', alpha: '1.000' } } }],
  info: { author: 'xcode', version: 1 },
}, null, 2));
console.log('icon and accent written');
