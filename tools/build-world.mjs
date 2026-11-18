// data/world.json: Natural Earth 1:50m admin-0 (via world-atlas@2.0.2) with ISO3 ids and names.
// Geometry is left exactly as world-atlas ships it (quantized, cut at the antimeridian like Natural Earth).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const nm = (p) => path.join(here, 'node_modules', p);

// Kosovo: mledoze uses the user-assigned cca3 "UNK"; we use "XKX" (the code the World Bank and the
// EU use), so the World Bank join is direct. Iso2 stays "XK".
export const ISO3_ALIASES = { UNK: 'XKX' };

// Features that world-atlas ships without a numeric id (or with a shared id). Codes are Natural Earth
// ADM0_A3 codes (not ISO 3166); `parent` supplies region/subregion only.
export const SPECIAL_FEATURES = {
  'Somaliland': { iso3: 'SOL', name: 'Somaliland', parent: 'SOM' },
  'Kosovo': { iso3: 'XKX', mledoze: 'UNK' },
  'N. Cyprus': { iso3: 'CYN', name: 'Northern Cyprus', parent: 'CYP' },
  'Indian Ocean Ter.': { iso3: 'IOA', name: 'Indian Ocean Territories', parent: 'CXR' },
  'Siachen Glacier': { iso3: 'KAS', name: 'Siachen Glacier', parent: 'IND' },
  'Ashmore and Cartier Is.': { iso3: 'ATC', name: 'Ashmore and Cartier Islands', parent: 'AUS' },
};

export async function loadMledoze() {
  return JSON.parse(await readFile(nm('world-countries/countries.json'), 'utf8'));
}

export async function buildWorld() {
  const topo = JSON.parse(await readFile(nm('world-atlas/countries-50m.json'), 'utf8'));
  const mledoze = await loadMledoze();
  const byCcn3 = new Map(mledoze.filter((c) => c.ccn3).map((c) => [c.ccn3, c]));
  const byCca3 = new Map(mledoze.map((c) => [c.cca3, c]));
  const features = []; // { iso3, name, mledoze|null, special|null, atlasName }
  const seen = new Set();
  for (const g of topo.objects.countries.geometries) {
    const atlasName = g.properties.name;
    let iso3, m = null, special = SPECIAL_FEATURES[atlasName] ?? null;
    if (special) {
      iso3 = special.iso3;
      if (special.mledoze) m = byCca3.get(special.mledoze) ?? null;
    } else {
      m = byCcn3.get(g.id);
      if (!m) throw new Error(`No mledoze match for world-atlas id ${g.id} (${atlasName})`);
      iso3 = ISO3_ALIASES[m.cca3] ?? m.cca3;
    }
    if (seen.has(iso3)) throw new Error(`Duplicate iso3 ${iso3} (${atlasName})`);
    seen.add(iso3);
    const name = special?.name ?? m.name.common;
    g.id = iso3;
    g.properties = { iso3, name };
    features.push({ iso3, name, mledoze: m, special, atlasName });
  }
  // Keep the `land` object (merged coastline topology from world-atlas); it only references shared arcs.
  return { topo, features };
}
