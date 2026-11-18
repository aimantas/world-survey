// Static reference pages for World Survey: /lists/ (index + one page per list) and /compare/ (index + one page
// per pair of countries that share a land border). The URL contract is urls.mjs.
//
//   node tools/reference/build.mjs <outDir>             # write <outDir>/lists/**, <outDir>/compare/**, assets
//   node tools/reference/build.mjs <outDir> --no-maps   # development: skip the locator maps (much faster)
//
// Inputs: data/countries.json, data/encyclopedia.json and data/world.json from the source tree, or from
// <outDir>/data/ when the source tree has none. No network. The same inputs give byte-identical output.
import { readFile, writeFile, mkdir, copyFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { ROOT } from '../encyclopedia/lib.mjs';
import { loadData } from './data.mjs';
import { buildLists } from './lists.mjs';
import { buildCompare } from './compare.mjs';
import { createPairMapper } from './map.mjs';
import { referencePaths } from './urls.mjs';

const argv = process.argv.slice(2);
const outArg = argv.find((a) => !a.startsWith('--'));
if (!outArg) {
  console.error('usage: node tools/reference/build.mjs <outDir> [--no-maps]');
  process.exit(2);
}
const OUT = path.resolve(process.cwd(), outArg);
const NO_MAPS = argv.includes('--no-maps');
const exists = async (p) => { try { await stat(p); return true; } catch { return false; } };

async function main() {
  const t0 = Date.now();
  const D = await loadData(OUT);

  // Stylesheet and script are addressed by content hash, so a new build is never served from an old cache.
  const assets = {};
  const copies = [];
  for (const [key, file] of [['css', 'reference.css'], ['js', 'reference.js']]) {
    const src = path.join(ROOT, 'assets', file);
    if (!(await exists(src))) throw new Error(`assets/${file} is missing`);
    const hash = createHash('sha256').update(await readFile(src)).digest('hex').slice(0, 8);
    assets[key] = `/assets/${file}?v=${hash}`;
    copies.push([src, path.join(OUT, 'assets', file)]);
  }

  let mapper = null;
  if (NO_MAPS) console.error('note: --no-maps, comparison pages have no locator map');
  else if (!D.topo) console.error('warning: data/world.json not found; comparison pages have no locator map');
  else mapper = createPairMapper(D.topo, D.cj.countries);

  const pages = [...buildLists(D, assets), ...buildCompare(D, assets, mapper)];

  // The pages written must be exactly the URLs the contract promises to the sitemap and the country pages.
  const want = referencePaths(D.cj.countries), got = pages.map((p) => p.url);
  const missing = want.filter((u) => !got.includes(u)), extra = got.filter((u) => !want.includes(u));
  if (missing.length || extra.length || new Set(got).size !== got.length) {
    throw new Error(`pages do not match urls.mjs: missing ${missing.slice(0, 5).join(', ') || 'none'}; unexpected ${extra.slice(0, 5).join(', ') || 'none'}`);
  }

  for (const dir of ['lists', 'compare']) await rm(path.join(OUT, dir), { recursive: true, force: true });
  for (const p of pages) {
    const dir = path.join(OUT, p.url);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), p.html);
  }
  await mkdir(path.join(OUT, 'assets'), { recursive: true });
  for (const [from, to] of copies) await copyFile(from, to);

  const n = (kind) => pages.filter((p) => p.kind === kind).length;
  const sizes = pages.map((p) => Buffer.byteLength(p.html)).sort((a, b) => a - b);
  const total = sizes.reduce((s, b) => s + b, 0);
  console.log(`reference: ${pages.length} pages (${n('list')} lists + index, ${n('compare')} comparisons + index), ${(total / 1048576).toFixed(1)} MB, median ${(sizes[sizes.length >> 1] / 1024).toFixed(1)} KB, max ${(sizes.at(-1) / 1024).toFixed(1)} KB, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

main().catch((e) => {
  console.error(`reference build failed: ${e.message}`);
  process.exit(1);
});
