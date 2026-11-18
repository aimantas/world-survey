// Hand-picked groups of flags people mix up: same colours, same layout, or a swapped order.
// Lookalike flags draws its wrong answers from the group, so every choice is a near miss.
export const LOOKALIKE_GROUPS = [
  ['TCD', 'ROU', 'AND', 'MDA'],      // blue-yellow-red verticals
  ['IDN', 'MCO', 'POL', 'AUT'],      // red and white bands
  ['IRL', 'CIV', 'ITA', 'NER'],      // green, white and orange
  ['NLD', 'LUX', 'PRY', 'HRV'],      // red-white-blue horizontals
  ['AUS', 'NZL', 'FJI', 'TUV'],      // blue ensigns with stars
  ['SEN', 'MLI', 'GIN', 'CMR'],      // green-yellow-red verticals
  ['NOR', 'ISL', 'DNK', 'FIN', 'SWE'], // Nordic crosses
  ['COL', 'ECU', 'VEN'],             // yellow-blue-red
  ['EGY', 'SYR', 'IRQ', 'YEM'],      // red-white-black
  ['SVN', 'SVK', 'RUS', 'SRB'],      // white-blue-red with and without arms
  ['HND', 'NIC', 'SLV', 'ARG'],      // blue-white-blue
  ['QAT', 'BHR', 'LVA', 'AUT'],      // red or maroon with white
  ['JOR', 'PSE', 'SDN', 'KWT', 'ARE'], // pan-Arab colours with a hoist shape
  ['LBR', 'USA', 'MYS', 'TGO'],      // stripes with stars
  ['GHA', 'BOL', 'LTU', 'ETH'],      // red, yellow and green bands
  ['BEL', 'DEU', 'UGA'],             // black, yellow or gold, and red
  ['JPN', 'BGD', 'PLW', 'LAO'],      // a single disc
  ['TUR', 'TUN', 'DZA', 'MRT'],      // crescent and star
  ['HUN', 'IRN', 'TJK', 'BGR'],      // red, white and green bands
  ['CHN', 'VNM', 'MAR', 'KGZ'],      // red field with a yellow or green emblem
  ['CUB', 'URY', 'GRC', 'LBR'],      // stripes with a canton or triangle
  ['GAB', 'SLE', 'UKR', 'RWA'],      // horizontal blues, greens and yellows
  ['PER', 'CAN', 'LBN', 'AUT'],      // red-white-red
  ['PHL', 'CZE', 'BHS', 'SDN'],      // a triangle at the hoist
  ['KEN', 'SSD', 'MWI', 'LBY'],      // black, red and green
];

const byIso = new Map();
for (const g of LOOKALIKE_GROUPS) for (const iso of g) {
  if (!byIso.has(iso)) byIso.set(iso, new Set());
  for (const other of g) if (other !== iso) byIso.get(iso).add(other);
}

export function lookalikesOf(iso3) {
  return [...(byIso.get(iso3) || [])];
}

export const LOOKALIKE_ISOS = [...byIso.keys()];
