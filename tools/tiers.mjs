// Difficulty tiers for the 195 playable states. Reproducible from countries.json values plus one
// editorial list. Change the constants here, rebuild, and TIERS.md is regenerated.
//
// Ranks are 1 = largest among the 195 sovereign states; a null value has no rank.
//   Tier 1: population rank <= T1.pop OR area rank <= T1.area OR GDP rank <= T1.gdp OR in FAMOUS
//   Tier 2: not tier 1 AND (population rank <= T2.pop OR area rank <= T2.area OR GDP rank <= T2.gdp)
//   Tier 3: everything else
// Non-sovereign features get tier null (never asked).

export const T1 = { pop: 25, area: 15, gdp: 25 };
export const T2 = { pop: 90, area: 80, gdp: 90 };

// Editorial: widely known states that the size thresholds miss (judgement, adjust freely).
export const FAMOUS = ['AFG', 'AUT', 'CHL', 'COL', 'CUB', 'DNK', 'FIN', 'GRC', 'IRQ', 'ISL', 'ISR', 'JAM', 'KEN', 'MAR', 'MDG', 'MNG', 'NOR', 'NZL', 'PER', 'PRK', 'PRT', 'UKR', 'VEN'];

export function assignTiers(records) {
  const sov = records.filter((r) => r.sovereign);
  const rank = (k) => {
    const m = new Map();
    sov.filter((r) => r[k] != null).sort((a, b) => b[k] - a[k]).forEach((r, i) => m.set(r.iso3, i + 1));
    return m;
  };
  const rp = rank('population'), ra = rank('area'), rg = rank('gdp');
  const famous = new Set(FAMOUS);
  const info = { 1: [], 2: [], 3: [] };
  for (const r of records) {
    if (!r.sovereign) { r.tier = null; continue; }
    const p = rp.get(r.iso3) ?? Infinity, a = ra.get(r.iso3) ?? Infinity, g = rg.get(r.iso3) ?? Infinity;
    const why = [];
    if (p <= T1.pop) why.push(`pop #${p}`);
    if (a <= T1.area) why.push(`area #${a}`);
    if (g <= T1.gdp) why.push(`GDP #${g}`);
    if (famous.has(r.iso3)) why.push('famous');
    if (why.length) r.tier = 1;
    else if (p <= T2.pop || a <= T2.area || g <= T2.gdp) r.tier = 2;
    else r.tier = 3;
    const fmt = (x) => (Number.isFinite(x) ? x : '-');
    info[r.tier].push({ iso3: r.iso3, name: r.name, ranks: `${fmt(p)}/${fmt(a)}/${fmt(g)}`, why: why.join(', ') });
  }
  for (const k of [1, 2, 3]) info[k].sort((x, y) => x.name.localeCompare(y.name, 'en'));
  return info;
}

export function tiersMarkdown(info, today) {
  const list = (rows, withWhy) => rows.map((r) => `- ${r.name} (${r.iso3}) ${r.ranks}${withWhy && r.why ? ` — ${r.why}` : ''}`).join('\n');
  return `# Difficulty tiers

Generated ${today} by \`tools/build.mjs\` from \`data/countries.json\` values. Edit the thresholds or the
\`FAMOUS\` list in \`tools/tiers.mjs\` and rebuild; do not hand-edit this file.

## Rule

Ranks are computed among the 195 playable states only (1 = largest). A missing value has no rank.

- **Tier 1** (Easy): population rank ≤ ${T1.pop}, or area rank ≤ ${T1.area}, or GDP rank ≤ ${T1.gdp}, or in the editorial \`FAMOUS\` list.
- **Tier 2** (Normal adds these): not tier 1, and population rank ≤ ${T2.pop}, or area rank ≤ ${T2.area}, or GDP rank ≤ ${T2.gdp}.
- **Tier 3** (Hard adds these): everything else.

Inputs: population = World Bank SP.POP.TOTL (latest year), area = mledoze \`area\` (km²), GDP = World Bank NY.GDP.MKTP.CD (latest year, current US$).
\`FAMOUS\` (editorial judgement, the only non-mechanical input): ${FAMOUS.join(', ')}.

Each line shows population/area/GDP rank.

## Tier 1 (${info[1].length})

${list(info[1], true)}

## Tier 2 (${info[2].length})

${list(info[2], false)}

## Tier 3 (${info[3].length})

${list(info[3], false)}
`;
}
