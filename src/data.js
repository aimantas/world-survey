// Loads the built country table and the 1:50m outlines, and indexes them for the game and the globe.
// topojson-client is loaded as a classic script (window.topojson).
import { polygonsContain } from './game/geo.js';

export async function loadData(base = '/') {
  const [table, topo] = await Promise.all([
    fetch(`${base}data/countries.json`).then((r) => r.json()),
    fetch(`${base}data/world.json`).then((r) => r.json()),
  ]);

  const countries = table.countries;
  // Asset paths are stored relative; pages live at nested URLs, so make them root-absolute.
  for (const c of countries) if (c.flag && !c.flag.startsWith('/')) c.flag = `/${c.flag}`;
  const byIso = new Map(countries.map((c) => [c.iso3, c]));
  const fc = window.topojson.feature(topo, topo.objects.countries || Object.values(topo.objects)[0]);

  // iso3 -> array of polygons (each polygon = [outer ring, ...holes], ring = [[lng, lat], ...])
  const shapes = new Map();
  const bounds = new Map();
  for (const f of fc.features) {
    const iso3 = f.properties?.iso3;
    if (!iso3 || !f.geometry) continue;
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const list = shapes.get(iso3) || [];
    list.push(...polys);
    shapes.set(iso3, list);
  }
  for (const [iso3, polys] of shapes) {
    bounds.set(iso3, polys.map((p) => ringBounds(p[0])));
  }

  const sovereign = countries.filter((c) => c.sovereign);

  return {
    sources: table.sources,
    generated: table.generated,
    topo,
    features: fc.features,
    countries,
    sovereign,
    byIso,
    shapes,
    get: (iso3) => byIso.get(iso3),
    // Which country contains this point (null over sea).
    countryAt(lat, lng) {
      for (const [iso3, polys] of shapes) {
        const b = bounds.get(iso3);
        const hits = [];
        for (let i = 0; i < polys.length; i++) {
          const [x0, y0, x1, y1] = b[i];
          if (lng >= x0 && lng <= x1 && lat >= y0 && lat <= y1) hits.push(polys[i]);
        }
        if (hits.length && polygonsContain(hits, lat, lng)) return iso3;
      }
      return null;
    },
  };
}

function ringBounds(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
