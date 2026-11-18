// Data-driven prose for the country pages. Every sentence states only what the record holds; structure
// depends on the facts (island, landlocked, enclaved, neighbour count, size and rank extremes, hemispheres,
// outlying or undrawn borders), and neutral sentences rotate through a few phrasings chosen by a stable hash
// of the ISO code, so pages read differently without any randomness between builds.
import { pick, int, fixed, ordinal, nth, people, usd, latStr, latLngStr, listAnd, esc, MIN_RANK_YEAR } from './lib.mjs';

const STATE_WORD = { VAT: 'state', PSE: 'state' };
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const count = (n) => (n >= 0 && n <= 10 ? WORDS[n] : int(n));

// Names that read with "the" in running text ("the United States", "the Marshall Islands").
export function needsThe(name) {
  return /^(United |Republic of |Central African |Dominican |Czech Republic)|Islands$|^(Netherlands|Philippines|Bahamas|Maldives|Gambia|DR Congo)$/.test(name);
}
export const theName = (name, start = false) => (needsThe(name) ? `${start ? 'The' : 'the'} ${name}` : name);

export function placePhrase(c) {
  const sr = c.subregion;
  if (!sr || sr.includes(c.name) || c.name.includes(sr)) return c.region === 'Americas' ? 'the Americas' : c.region;
  return sr === 'Caribbean' ? 'the Caribbean' : sr;
}

// Position from the bottom: 1 = smallest. Counts states with a strictly smaller value.
export function fromBottom(list, get, v) {
  return list.filter((o) => get(o) != null && get(o) < v).length + 1;
}

export const areaStr = (a) => `${a < 10 ? fixed(a, 2) : int(a)} km²`;
const LABEL = { population: 'population', gdp: 'GDP', lifeExpectancy: 'life expectancy', gdpPerCapita: 'GDP per capita', urbanPct: 'urban share', forestPct: 'forest area', popGrowthPct: 'population growth', internetPct: 'internet use', fertility: 'fertility rate' };
const freshPop = (o) => (o.population != null && o.populationYear >= MIN_RANK_YEAR ? o.population : null);
const ok = (stat) => stat && stat.ranked !== false;

// Sentence about neighbouring areas that are not among the 195, without a status claim; China's two SARs are
// described by the official names world-countries gives them.
export function otherAreasSentence(c, others, startName, escape = esc) {
  if (!others.length) return '';
  const names = others.map((x) => escape(x.name));
  const sar = c.iso3 === 'CHN' && others.every((x) => /Special Administrative Region of the People's Republic of China/.test(x.official ?? ''));
  return sar ? `${startName} also borders ${listAnd(names)}, its special administrative regions.` : `${startName} also borders ${listAnd(names)}.`;
}
const pct = (v) => `${fixed(v, 1)}%`;

// Which hemispheres the main landmass is in, as one sentence starting with `subject`.
export function hemisphereSentence(e, subject) {
  const h = e.hemispheres, x = e.extremes;
  const ns = h.main.filter((k) => k === 'Northern' || k === 'Southern');
  const ew = h.main.filter((k) => k === 'Eastern' || k === 'Western');
  const spans = [];
  if (ns.length === 2) spans.push('the equator');
  if (ew.length === 2) spans.push(x?.crossesAntimeridian ? 'the 180th meridian' : 'the prime meridian');
  if (!spans.length) return `${subject} lies entirely in the ${ns[0]} and ${ew[0]} hemispheres.`;
  if (spans.length === 2) return `${subject} has land on both sides of ${spans[0]} and of ${spans[1]}.`;
  return `${subject} has land on both sides of ${spans[0]}, in the ${ns.length === 1 ? ns[0] : ew[0]} Hemisphere.`;
}

export function makeProse(c, e, X) {
  const { link, all, enc } = X;
  const sov = [...all.values()].filter((o) => o.sovereign);
  const kind = STATE_WORD[c.iso3] ?? 'country';
  const where = placePhrase(c);
  const inRegion = c.region === 'Americas' ? 'the Americas' : c.region;
  const v = (key, list) => pick(`${c.iso3}:${key}`, list);
  // Subject names: N at the start of a sentence, n mid-sentence. L(iso3) links another country with its article.
  const N = esc(theName(c.name, true)), n_ = esc(theName(c.name));
  const L = (iso3, start = false) => {
    const o = all.get(iso3);
    const name = o?.name ?? iso3;
    return needsThe(name) ? `${start ? 'The' : 'the'} ${link(iso3, name)}` : link(iso3, name);
  };
  const allNbs = [...e.neighbours].sort((a, b) => a.name.localeCompare(b.name));
  const nbs = allNbs.filter((x) => x.sovereign); // counts and lists: the 195 only
  const others = allNbs.filter((x) => !x.sovereign);
  const nbNames = nbs.map((x) => L(x.iso3));
  const n = nbs.length;
  const R = e.ranks;
  const paras = [];

  // ---------- 1. Place, borders, size ----------
  {
    const s = [];
    if (c.island) {
      s.push(v('open', [
        `${N} is an island ${kind} in ${esc(where)}.`,
        `${N} is an island ${kind} in ${esc(where)}, with no land border.`,
        `An island ${kind} in ${esc(where)}, ${n_} shares no land border with another country.`,
      ]));
      const near = e.nearestCapitals[0];
      if (near && c.capital) {
        s.push(`Of the other 194 countries in this atlas, the nearest capital to ${esc(c.capital)} is ${esc(all.get(near.iso3).capital)}, in ${L(near.iso3)}, ${int(near.km)} km away.`);
      }
    } else if (c.landlocked && n === 1 && c.borders.length === 1) {
      s.push(`${N} is a landlocked ${kind} in ${esc(where)}, entirely surrounded by ${nbNames[0]}.`);
    } else if (c.landlocked) {
      s.push(v('open', [
        `${N} is a landlocked ${kind} in ${esc(where)}, bordered by ${listAnd(nbNames)}.`,
        `Landlocked in ${esc(where)}, ${n_} has ${count(n)} land neighbours: ${listAnd(nbNames)}.`,
      ]));
    } else if (n === 0) {
      s.push(others.length ? `${N} is a ${kind} in ${esc(where)} with no land border with another of the 195 countries.` : `${N} is a ${kind} in ${esc(where)} with no land border.`);
    } else if (n === 1) {
      s.push(v('open', [
        `${N} is a ${kind} in ${esc(where)} whose only land neighbour is ${nbNames[0]}.`,
        `${N} lies in ${esc(where)}, and its one land border is with ${nbNames[0]}.`,
      ]));
    } else {
      s.push(v('open', [
        `${N} is a ${kind} in ${esc(where)} bordered by ${listAnd(nbNames)}.`,
        `${N} lies in ${esc(where)} and shares land borders with ${listAnd(nbNames)}.`,
        `In ${esc(where)}, ${n_} has ${count(n)} land neighbours: ${listAnd(nbNames)}.`,
      ]));
    }
    const other = otherAreasSentence(c, others, 'It');
    if (other) s.push(other);
    const nr = R.neighbourCount;
    if (n >= 7 && nr) {
      const more = nr.world - 1;
      const tied = sov.filter((o) => o.iso3 !== c.iso3 && enc[o.iso3]?.sovereignNeighbourCount === n).map((o) => L(o.iso3));
      if (more === 0) s.push(tied.length ? `No country in this atlas has more land neighbours; ${listAnd(tied)} ${tied.length === 1 ? 'has' : 'have'} the same number.` : `No country in this atlas has more land neighbours.`);
      else s.push(`Only ${count(more)} ${more === 1 ? 'country has' : 'countries have'} more land neighbours.`);
    }
    // Borders that need a word of explanation.
    const outlying = allNbs.filter((x) => x.viaOutlyingSelf).map((x) => L(x.iso3));
    if (outlying.length) s.push(`The ${outlying.length === 1 ? 'border' : 'borders'} with ${listAnd(outlying)} ${outlying.length === 1 ? 'lies' : 'lie'} away from its main landmass.`);
    for (const x of allNbs.filter((y) => y.viaOutlyingOther && !y.viaOutlyingSelf)) {
      s.push(`The border with ${L(x.iso3)} is on a part of ${esc(theName(x.name))} away from that country's main landmass.`);
    }
    const undrawn = allNbs.filter((x) => !x.inGeometry).map((x) => L(x.iso3));
    if (undrawn.length) s.push(`The land ${undrawn.length === 1 ? 'border' : 'borders'} with ${listAnd(undrawn)} ${undrawn.length === 1 ? 'is' : 'are'} too small to draw at this map's scale.`);

    const ar = R.area, area = areaStr(c.area);
    const small = fromBottom(sov, (o) => o.area, c.area);
    const close = e.closestInArea.slice(0, 2).map((i) => L(i));
    if (ar.world === 1) s.push(`At ${area}, it is the largest country in the world by area.`);
    else if (ar.world <= 10) s.push(v('size', [`Its ${area} make it the ${nth(ar.world, 'largest')} country in the world.`, `At ${area}, it is the ${nth(ar.world, 'largest')} country on Earth by area.`]));
    else if (small <= 10) s.push(small === 1 ? `At ${area}, it is the smallest country in the world.` : `At ${area}, it is the ${nth(small, 'smallest')} of the 195 countries by area.`);
    else if (ar.region === 1) s.push(`It is the largest country in ${esc(inRegion)}, at ${area}, close in size to ${listAnd(close)}.`);
    else if (ar.region === ar.regionOf) s.push(`It is the smallest country in ${esc(inRegion)}, at ${area}.`);
    else {
      s.push(v('size', [
        `At ${area}, it ranks ${ordinal(ar.world)} of 195 by area, close in size to ${listAnd(close)}.`,
        `Its area of ${area} puts it ${ordinal(ar.world)} in the world and ${ordinal(ar.region)} of ${ar.regionOf} in ${esc(inRegion)}.`,
        `With ${area}, it is about the size of ${listAnd(close)} and ranks ${ordinal(ar.world)} of 195 by area.`,
      ]));
    }
    paras.push(s.join(' '));
  }

  // ---------- 2. People ----------
  {
    const s = [];
    if (c.population == null) {
      s.push(`The World Bank publishes no population or economic figures for ${n_}, so it is left out of those rankings here.`);
    } else if (R.population) {
      const pr = R.population, pop = people(c.population), yr = c.populationYear;
      const about = c.population >= 1e6 ? 'About ' : '';
      if (pr.world <= 3) s.push(`${N} has the ${nth(pr.world, 'largest')} population in the world: ${pop} people in ${yr}, according to the World Bank.`);
      else if (pr.region === 1) s.push(`With ${pop} people in ${yr}, it is the most populous country in ${esc(inRegion)}.`);
      else if (pr.region === pr.regionOf) s.push(`With ${pop} people in ${yr}, it has the smallest population in ${esc(inRegion)}.`);
      else if (pr.world > pr.worldOf / 2) {
        const small = fromBottom(sov, freshPop, c.population);
        s.push(v('pop', [
          `Its population was ${pop} in ${yr} (World Bank), the ${nth(small, 'smallest')} of the ${pr.worldOf} countries with data.`,
          `${about}${pop} people lived in ${n_} in ${yr}, according to the World Bank; ${small - 1 === 0 ? 'no country has fewer' : `only ${count(small - 1)} ${small - 1 === 1 ? 'country has' : 'countries have'} fewer`}.`,
        ]));
      } else {
        s.push(v('pop', [
          `${about}${pop} people lived in ${n_} in ${yr}, according to the World Bank, ${ordinal(pr.world)} of ${pr.worldOf} countries.`,
          `The World Bank counts ${pop} people in ${yr}: ${ordinal(pr.world)} of ${pr.worldOf} worldwide and ${ordinal(pr.region)} of ${pr.regionOf} in ${esc(inRegion)}.`,
          `Its population was ${pop} in ${yr} (World Bank), the ${nth(pr.world, 'largest')} of ${pr.worldOf}.`,
        ]));
      }
      const dr = R.density, d = e.density?.value;
      if (dr && d != null) {
        const lower = fromBottom(sov, (o) => enc[o.iso3]?.density?.value ?? null, d) - 1;
        const dTxt = d >= 10 ? int(d) : fixed(d, 1);
        if (dr.world <= 10) s.push(`That is ${dTxt} people per km², the ${nth(dr.world, 'highest')} density of the ${dr.worldOf}.`);
        else if (lower < 10) s.push(lower === 0 ? `With ${dTxt} people per km², no country is more thinly populated.` : `With ${dTxt} people per km², only ${count(lower)} ${lower === 1 ? 'country is' : 'countries are'} more thinly populated.`);
        else s.push(v('dens', [`That works out at ${dTxt} people per km².`, `On average, ${dTxt} people live on each km².`, `Density is ${dTxt} people per km².`]));
      }
      const u = ok(e.stats.urbanPct) && R.urbanPct ? e.stats.urbanPct : null;
      if (u) {
        if (R.urbanPct.world === 1) s.push(`Its urban share, ${pct(u.value)} in ${u.year}, is the highest of the ${R.urbanPct.worldOf}.`);
        else if (u.value < 50) s.push(`Most people live outside urban areas: the urban share was ${pct(u.value)} in ${u.year}.`);
        else s.push(v('urb', [`${pct(u.value)} of people lived in urban areas in ${u.year}.`, `The urban share of the population was ${pct(u.value)} in ${u.year}.`]));
      }
      const g = ok(e.stats.popGrowthPct) && R.popGrowthPct ? e.stats.popGrowthPct : null;
      if (g) {
        if (g.value < 0) s.push(`The population shrank by ${fixed(-g.value, 2)}% in ${g.year}.`);
        else if (R.popGrowthPct.world <= 15) s.push(`It grew by ${fixed(g.value, 2)}% in ${g.year}, the ${nth(R.popGrowthPct.world, 'fastest')} rate of the ${R.popGrowthPct.worldOf}.`);
      }
    }
    paras.push(s.join(' '));
  }

  // ---------- 3. Economy, health, land ----------
  {
    const s = [];
    const pc = e.stats.gdpPerCapita, r = R.gdpPerCapita;
    if (pc && r) {
      const regionTxt = r.region === 1 ? `the highest in ${esc(inRegion)}` : r.region === r.regionOf ? `the lowest in ${esc(inRegion)}` : `${ordinal(r.region)} of ${r.regionOf} in ${esc(inRegion)}`;
      s.push(v('gdp', [
        `GDP per capita was ${usd(pc.value)} in ${pc.year} (World Bank, current US$), ${ordinal(r.world)} of ${r.worldOf} and ${regionTxt}.`,
        `In ${pc.year}, GDP per capita stood at ${usd(pc.value)} in current US dollars: ${ordinal(r.world)} of ${r.worldOf} worldwide, ${regionTxt}.`,
      ]));
    } else if (c.population != null && !pc) {
      s.push(`The World Bank has no GDP per capita figure for ${n_}.`);
    }
    const le = c.lifeExpectancy, lr = R.lifeExpectancy;
    if (le != null && lr) {
      const lower = lr.worldOf - lr.world;
      const ext = lr.world <= 10 ? `, the ${nth(lr.world, 'highest')} of the ${lr.worldOf}` : lower < 10 ? (lower === 0 ? `, the lowest of the ${lr.worldOf}` : `; only ${count(lower)} ${lower === 1 ? 'country is' : 'countries are'} lower`) : lr.region === 1 ? `, the highest in ${esc(inRegion)}` : '';
      s.push(v('le', [`Life expectancy at birth was ${fixed(le, 1)} years in ${c.lifeExpectancyYear}${ext}.`, `Newborns in ${c.lifeExpectancyYear} had a life expectancy of ${fixed(le, 1)} years${ext}.`]));
    }
    const notable = [];
    const f = ok(e.stats.fertility) ? e.stats.fertility : null;
    if (f && (f.value >= 4 || f.value <= 1.3)) notable.push(`The fertility rate was ${fixed(f.value, 2)} births per woman in ${f.year}.`);
    const fo = ok(e.stats.forestPct) && R.forestPct ? e.stats.forestPct : null;
    if (fo && (fo.value >= 60 || R.forestPct.world <= 10)) notable.push(`Forest covers ${pct(fo.value)} of its land (${fo.year}).`);
    else if (fo && fo.value < 1) notable.push(fo.value === 0 ? `The World Bank records no forest area (${fo.year}).` : `Forest covers ${pct(fo.value)} of its land (${fo.year}).`);
    const it = ok(e.stats.internetPct) ? e.stats.internetPct : null;
    if (it && (it.value >= 98 || it.value < 25)) notable.push(`${pct(it.value)} of people used the internet in ${it.year}.`);
    s.push(...notable.slice(0, 2));
    // Values too old to compare: say so once, with their years, instead of ranking them.
    const stale = [
      ...(e.staleCore ?? []).map((x) => [x.key, x.year]),
      ...Object.entries(e.stats).filter(([, st]) => st && st.ranked === false).map(([k, st]) => [k, st.year]),
    ].filter(([k], i, arr) => arr.findIndex(([k2]) => k2 === k) === i);
    if (stale.length) {
      const parts = stale.map(([k, y]) => `${LABEL[k] ?? k} (${y})`);
      s.push(`The latest World Bank ${stale.length === 1 ? 'figure' : 'figures'} for ${listAnd(parts)} ${stale.length === 1 ? 'is' : 'are'} older than ${MIN_RANK_YEAR}, so ${stale.length === 1 ? 'it appears' : 'they appear'} in the table with ${stale.length === 1 ? 'its' : 'their'} year but ${stale.length === 1 ? 'is' : 'are'} not ranked or compared here.`);
    }
    if (s.length) paras.push(s.join(' '));
  }

  // ---------- 4. Where on Earth ----------
  {
    const s = [];
    const h = e.hemispheres, x = e.extremes;
    s.push(hemisphereSentence(e, c.inMap ? 'Its main landmass' : N));
    const extra = h.all.filter((k) => !h.main.includes(k));
    if (extra.length) s.push(`Territory away from the main landmass also reaches the ${listAnd(extra)} ${extra.length > 1 ? 'hemispheres' : 'Hemisphere'}.`);
    if (x && x.spanNorthSouthKm >= 100) {
      s.push(v('span', [
        `From ${latStr(x.south)} to ${latStr(x.north)}, it spans about ${int(x.spanNorthSouthKm)} km north to south.`,
        `North to south it runs about ${int(x.spanNorthSouthKm)} km, between ${latStr(x.south)} and ${latStr(x.north)}.`,
      ]));
    }
    const a = e.antipode;
    if (a && c.capital) {
      if (a.kind === 'land') {
        s.push(`Directly through the Earth from ${esc(c.capital)}, the antipode falls on land, in ${a.sovereign ? L(a.iso3) : esc(theName(a.name))}.`);
      } else {
        const water = a.name ? `the ${esc(a.name)}` : 'open ocean';
        const land = a.nearestLand.sovereign ? L(a.nearestLand.iso3) : esc(theName(a.nearestLand.name));
        s.push(v('anti', [
          `The point on the opposite side of the Earth from ${esc(c.capital)} lies in ${water}, about ${int(a.nearestLand.km)} km from the nearest land, ${land}.`,
          `${esc(c.capital)}'s antipode is in ${water}, about ${int(a.nearestLand.km)} km from ${land}, the nearest land.`,
        ]));
      }
    }
    paras.push(s.join(' '));
  }
  return paras.filter(Boolean);
}

// ---------- Questions ----------
// The questions people type about a country, each answered in one or two sentences from the same record as
// the rest of the sheet. Plain text, no markup: the page prints it and the FAQPage JSON-LD repeats it word for
// word. A question is left out when the record cannot answer it (no population for Vatican City, no currency
// for Micronesia); nothing is filled in.
export function makeQuestions(c, e, { all }) {
  const N = theName(c.name, true), n_ = theName(c.name);
  const plain = (s) => s;
  const named = (iso3) => theName(all.get(iso3)?.name ?? iso3);
  const sov = [...all.values()].filter((o) => o.sovereign);
  const sovNbs = e.neighbours.filter((x) => x.sovereign).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const nbs = sovNbs.map((x) => x.name);
  const others = e.neighbours.filter((x) => !x.sovereign);
  const n = nbs.length;
  const R = e.ranks;
  const qa = [];
  // "the largest", "the 19th-largest", and for the ten at the bottom "the 4th-smallest", which reads better
  // than "the 192nd-largest".
  const rankPhrase = (r, small, noun) => (r.world === 1 ? `the largest ${noun}` : small <= 10 ? `the ${nth(small, 'smallest')} ${noun}` : `the ${nth(r.world, 'largest')} ${noun}`);

  // Where: the region the data gives it, how many land neighbours, which hemispheres.
  {
    const where = placePhrase(c);
    const region = c.region === 'Americas' ? 'the Americas' : c.region;
    const partOf = where.includes(c.region) ? '' : `, part of ${region}`;
    const first = c.island ? `${N} is an island country in ${where}${partOf}.`
      : n ? `${N} is in ${where}${partOf}, and has ${count(n)} land ${n === 1 ? 'neighbour' : 'neighbours'}.`
      : `${N} is in ${where}${partOf}, and has no land border with another of the 195 countries in this atlas.`;
    qa.push([`Where is ${n_}?`, `${first} ${hemisphereSentence(e, c.inMap ? 'Its main landmass' : 'It')}`]);
  }

  if (c.capital) {
    qa.push([`What is the capital of ${n_}?`, `The capital of ${n_} is ${c.capital}${c.capitalLatLng ? `, at ${latLngStr(c.capitalLatLng, 2)}` : ''}.`]);
  }

  if (c.population != null && c.populationYear) {
    const r = R.population;
    const rank = r ? ` That is ${rankPhrase(r, fromBottom(sov, freshPop, c.population), 'population')} of the ${r.worldOf} countries with data.`
      : c.populationYear < MIN_RANK_YEAR ? ` The figure is older than ${MIN_RANK_YEAR}, so it is not ranked here.` : '';
    qa.push([`What is the population of ${n_}?`, `${N} had ${int(c.population)} people in ${c.populationYear}, according to the World Bank.${rank}`]);
  }

  {
    const r = R.area;
    const near = all.get(e.closestInArea[0]);
    const rank = rankPhrase(r, fromBottom(sov, (o) => o.area, c.area), 'area');
    const close = near ? ` The closest in size is ${theName(near.name)}, at ${areaStr(near.area)} (both areas from world-countries).` : '';
    qa.push([`How big is ${n_}?`, `${N} covers ${areaStr(c.area)}, ${rank} of the ${r.worldOf} countries in this atlas.${near ? '' : ' The area is from world-countries.'}${close}`]);
  }

  {
    const also = otherAreasSentence(c, others, 'It', plain);
    let a;
    if (n > 1) a = `${N} shares land borders with ${count(n)} countries: ${listAnd(nbs.map((x) => theName(x)))}.`;
    else if (n === 1) a = `${N} has one land neighbour: ${theName(nbs[0])}.`;
    else {
      const near = e.nearestCapitals?.[0];
      const nearest = near && c.capital ? ` The nearest capital to ${c.capital} is ${all.get(near.iso3).capital}, in ${named(near.iso3)}, ${int(near.km)} km away.` : '';
      a = c.island ? `None: ${n_} is an island country with no land border.${nearest}`
        : `None of the 195 countries in this atlas shares a land border with ${n_}.${nearest}`;
    }
    // A border that sits away from the main landmass (France and Brazil, through French Guiana) gets a word.
    const far = sovNbs.filter((x) => x.viaOutlyingSelf).map((x) => theName(x.name));
    const outlying = far.length ? ` The ${far.length === 1 ? 'border' : 'borders'} with ${listAnd(far)} ${far.length === 1 ? 'lies' : 'lie'} away from its main landmass.` : '';
    qa.push([`Which countries border ${n_}?`, `${a}${outlying}${also ? ` ${also}` : ''}`]);
  }

  if (c.languages?.length) {
    const k = c.languages.length;
    qa.push([`What languages are spoken in ${n_}?`, `The world-countries dataset lists ${count(k)} ${k === 1 ? 'language' : 'languages'} for ${n_}: ${listAnd(c.languages)}.`]);
  }

  if (e.currencies?.length) {
    // One currency reads as a sentence; several are given as the dataset lists them.
    const cur = e.currencies.map((x) => `${x.name === 'Euro' ? 'euro' : x.name} (${x.code})`);
    qa.push([`What currency does ${n_} use?`, cur.length === 1
      ? `${N} uses the ${cur[0]}, according to the world-countries dataset.`
      : `The world-countries dataset lists ${count(cur.length)} currencies for ${n_}: ${listAnd(cur)}.`]);
  }
  return qa;
}
