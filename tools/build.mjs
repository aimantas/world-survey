// Rebuilds data/ and the data-owned assets from tools/.cache and node_modules.
// Usage: node build.mjs [data] [flags] [relief] [land] [elevation] [coast]   (no args = everything)
// Run `node fetch.mjs` first; this script never touches the network.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld } from './build-world.mjs';
import { buildCountries } from './build-countries.mjs';
import { tiersMarkdown } from './tiers.mjs';
import { buildFlags } from './build-flags.mjs';
import { buildRelief, buildReliefLand, buildElevation, buildCoastSdf } from './build-rasters.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataDir = path.join(root, 'data');
const assetsDir = path.join(root, 'assets');
const steps = new Set(process.argv.slice(2));
const all = steps.size === 0;
const want = (s) => all || steps.has(s);

// The build date is the retrieval date of the cached sources (manifest), so rebuilding later from
// the same cache gives identical output.
const manifest = JSON.parse(await readFile(path.join(here, '.cache/manifest.json'), 'utf8'));
const today = Object.values(manifest).map((m) => m.retrieved).sort().pop();

await mkdir(dataDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });
const t = (label) => { const t0 = Date.now(); return () => console.log(`${label}: ${((Date.now() - t0) / 1000).toFixed(1)} s`); };

const { topo, features } = await buildWorld();
const report = {};

if (want('data') || want('flags')) {
  const done = t('data');
  const { json, log, tierInfo } = await buildCountries(topo, features, { today });
  if (want('data')) {
    await writeFile(path.join(dataDir, 'world.json'), JSON.stringify(topo));
    // One record per line: compact for the browser, still readable and diffable.
    const text = `{"generated":${JSON.stringify(json.generated)},\n"sources":[\n${json.sources.map((x) => JSON.stringify(x)).join(',\n')}\n],\n"countries":[\n${json.countries.map((x) => JSON.stringify(x)).join(',\n')}\n]}\n`;
    JSON.parse(text); // sanity
    await writeFile(path.join(dataDir, 'countries.json'), text);
    await writeFile(path.join(here, 'TIERS.md'), tiersMarkdown(tierInfo, today));
    await writeFile(path.join(here, 'build-log.json'), JSON.stringify(log, null, 2) + '\n');
    report.data = { countries: json.countries.length, sovereign: json.countries.filter((c) => c.sovereign).length, ...log };
  }
  done();
  if (want('flags')) {
    const d2 = t('flags');
    report.flags = await buildFlags(json.countries, path.join(assetsDir, 'flags'));
    d2();
  }
}
if (want('relief')) { const d = t('relief'); report.relief = await buildRelief(assetsDir); d(); }
if (want('land')) { const d = t('relief-land'); report.reliefLand = await buildReliefLand(assetsDir, topo); d(); }
if (want('elevation')) { const d = t('elevation'); report.elevation = await buildElevation(assetsDir, topo); d(); }
if (want('coast')) { const d = t('coast'); report.coast = await buildCoastSdf(assetsDir, topo); d(); }

console.log(JSON.stringify(report, null, 2));
