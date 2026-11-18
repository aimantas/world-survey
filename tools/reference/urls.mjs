// URL contract for the reference pages (/lists/ and /compare/). The page generator in this folder,
// the country pages (tools/encyclopedia) and the sitemap (tools/seo) all import from here, so a link
// and the page it points to can never drift apart.
import { slug } from '../encyclopedia/lib.mjs';

// One page per list at /lists/<slug>/. `measure` names the field the table ranks by, where there is one.
export const LISTS = [
  { slug: 'countries-by-population', label: 'Countries by population', measure: 'population' },
  { slug: 'countries-by-area', label: 'Countries by area', measure: 'area' },
  { slug: 'countries-by-gdp', label: 'Countries by GDP', measure: 'gdp' },
  { slug: 'countries-by-gdp-per-capita', label: 'Countries by GDP per capita', measure: 'gdpPerCapita' },
  { slug: 'countries-by-population-density', label: 'Countries by population density', measure: 'density' },
  { slug: 'countries-by-life-expectancy', label: 'Countries by life expectancy', measure: 'lifeExpectancy' },
  { slug: 'countries-by-number-of-neighbours', label: 'Countries by number of neighbours', measure: 'neighbours' },
  { slug: 'smallest-countries', label: 'The smallest countries in the world', measure: 'area' },
  { slug: 'landlocked-countries', label: 'Landlocked countries' },
  { slug: 'island-countries', label: 'Island countries' },
  { slug: 'capital-cities', label: 'Capital cities of the world' },
  { slug: 'flags-of-the-world', label: 'Flags of the world' },
];

export const LISTS_INDEX = '/lists/';
export const COMPARE_INDEX = '/compare/';
// The HTML site map: one page linking every URL in sitemap.xml. tools/seo/build.mjs writes it (it runs last and
// holds the full URL list); every static footer and the game's home sheet link to it.
export const SITE_MAP = '/sitemap/';
export const listPath = (listSlug) => `/lists/${listSlug}/`;

// Two countries always make the same URL whichever one you start from: slugs in alphabetical order.
export function comparePath(a, b) {
  const [x, y] = [slug(a.name), slug(b.name)].sort();
  return `/compare/${x}-vs-${y}/`;
}

// Every pair of sovereign countries that share a land border, once each.
export function comparePairs(countries) {
  const byIso = new Map(countries.map((c) => [c.iso3, c]));
  const seen = new Set();
  const pairs = [];
  for (const a of countries) {
    if (!a.sovereign) continue;
    for (const iso of a.borders || []) {
      const b = byIso.get(iso);
      if (!b?.sovereign) continue;
      const key = [a.iso3, b.iso3].sort().join('-');
      if (seen.has(key)) continue;
      seen.add(key);
      const [first, second] = [a, b].sort((p, q) => slug(p.name).localeCompare(slug(q.name)));
      pairs.push({ a: first, b: second, path: comparePath(first, second) });
    }
  }
  return pairs.sort((p, q) => p.path.localeCompare(q.path));
}

// Paths of every reference page, for the sitemap and llms.txt.
export function referencePaths(countries) {
  return [LISTS_INDEX, ...LISTS.map((l) => listPath(l.slug)), COMPARE_INDEX, ...comparePairs(countries).map((p) => p.path)];
}
