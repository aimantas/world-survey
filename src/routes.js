// Every public URL of the game. The router reads this at runtime; tools/seo/build.mjs reads it at build time
// to pre-render one HTML file per route (title, description, canonical, structured data, crawlable intro).
// Country atlas pages (/atlas/<slug>/) are generated per country and canonicalise to /countries/<slug>/.

export const SITE = 'https://geography.aimantas.com';

export const HL_SLUGS = {
  mixed: 'mixed',
  population: 'population',
  area: 'area',
  economy: 'gdp',
  'life-expectancy': 'lifeExpectancy',
  density: 'density',
  neighbours: 'neighbours',
};

// Region pages: /play/find/europe/ is its own page with its own title, not a query on /play/find/.
export const REGION_SLUGS = { europe: 'Europe', asia: 'Asia', africa: 'Africa', americas: 'Americas', oceania: 'Oceania' };
export const REGION_COUNT = { Europe: 45, Asia: 47, Africa: 54, Americas: 35, Oceania: 14 };
export const regionSlug = (region) => Object.entries(REGION_SLUGS).find(([, v]) => v === region)?.[0] || null;
const ofRegion = (r) => (r === 'Americas' ? 'the Americas' : r);

const REGION_QUIZZES = {
  find: (r, n) => ({
    title: `${r} map quiz: find the countries · World Survey`,
    description: `Find the ${n} countries of ${ofRegion(r)} on a 3D relief globe. Tap each one; a miss shows how many kilometres off you were and where it really is.`,
    h1: `${r} map quiz`,
    intro: `A country of ${ofRegion(r)} is named and you tap it on a 3D relief globe. ${ofRegion(r) === r ? r : 'The region'} has ${n} countries; a game asks ten of them, and the ones you miss come back more often.`,
  }),
  capitals: (r, n) => ({
    title: `Capitals of ${ofRegion(r)} quiz on a 3D globe · World Survey`,
    description: `Drop a pin on the capital cities of ${ofRegion(r)}: ${n} capitals, scored by how close you land. The globe shows the real spot and the gap in kilometres.`,
    h1: `Capitals of ${ofRegion(r)}`,
    intro: `A capital city of ${ofRegion(r)} appears and you drop a pin where you think it is. Within 25 km scores the full 1,000 points, and the reveal draws the distance between your pin and the city.`,
  }),
  name: (r, n) => ({
    title: `Countries of ${ofRegion(r)} quiz · World Survey`,
    description: `The globe marks one of the ${n} countries of ${ofRegion(r)}; pick its name from four, or type it on Hard. Learn every shape and where it sits.`,
    h1: `Countries of ${ofRegion(r)} quiz`,
    intro: `The globe flies to a highlighted country of ${ofRegion(r)} and you name it. The wrong options are its neighbours, so each round teaches who sits next to whom.`,
  }),
  flagquiz: (r, n) => ({
    title: `Flags of ${ofRegion(r)} quiz · World Survey`,
    description: `Name the ${n} flags of ${ofRegion(r)}: a flag and four countries, then the globe flies to the right one. Wrong options come from the same part of the world.`,
    h1: `Flags of ${ofRegion(r)} quiz`,
    intro: `A flag of ${ofRegion(r)} and four country names. Pick the right one and the globe flies there, with the capital, the neighbours and a few facts.`,
  }),
};

export const ROUTES = [
  {
    path: '/', view: 'home',
    title: 'World Survey · a 3D geography game',
    description: 'Find countries, pin capitals and match flags on a 3D relief globe. Free, no sign-up, and your map of the world fills in as you learn it.',
    h1: 'World Survey',
    intro: 'A geography game played on a 3D relief globe. Every answer is given on the globe: find the country, drop a pin on the capital, match the flag. After each answer the globe flies to the right place and shows how far off you were. Countries you get right print in colour on your own map.',
  },
  {
    path: '/daily/', view: 'daily',
    title: 'Daily expedition · World Survey',
    description: 'Five geography rounds on a 3D globe, the same for everyone today: find a country, a flag, a capital and more. Share your score grid.',
    h1: 'Daily expedition',
    intro: 'Five rounds a day, the same for every player: find a country, place a flag, pin a capital, name a marked country and one harder find. Scores are out of 5,000 and you can share the result grid.',
  },
  {
    path: '/play/find/', view: 'play', mode: 'find',
    title: 'Find the country: map quiz on a 3D globe · World Survey',
    description: 'A country name appears; tap it on the globe. Misses score by distance, and the globe shows you where it really is. 195 countries, five regions.',
    h1: 'Find it',
    intro: 'A country name appears and you tap it on a 3D relief globe. Right answers score 1,000 plus a time bonus; near misses score by distance to the border, and the globe flies to the answer with the miss drawn in kilometres.',
  },
  {
    path: '/play/capitals/', view: 'play', mode: 'capitals',
    title: 'Capital cities quiz on a 3D globe · World Survey',
    description: 'Drop a pin on each capital city. 1,000 points within 25 km, fewer the further you land. Learn the world’s capitals on a 3D globe.',
    h1: 'Capital pin',
    intro: 'A capital city appears and you drop a pin where you think it is. Within 25 km scores the full 1,000; the score falls with distance to zero at 2,500 km, and the reveal shows the real spot and the gap.',
  },
  {
    path: '/capitals/', view: 'chooser', which: 'capitals',
    title: 'Capital city games: quiz and pin · World Survey',
    description: 'Two ways to learn the world’s capital cities: pick the capital from four names, or drop a pin on it on a 3D globe and see how close you were.',
    h1: 'Capitals',
    intro: 'Two capital city games. In the capital quiz a country is named and you pick its capital from four. In capital pin the city is named and you drop a pin where you think it is.',
  },
  {
    path: '/play/capitalquiz/', view: 'play', mode: 'capitalquiz',
    title: 'Capital cities quiz: pick the capital · World Survey',
    description: 'A country is named; pick its capital city from four. Wrong options are capitals from the same part of the world, and the globe flies to the answer.',
    h1: 'Capital quiz',
    intro: 'A country and four capital cities. Pick the right one, and the globe flies to the country and marks its capital. All 195 capitals, from easy to hard.',
  },
  {
    path: '/play/name/', view: 'play', mode: 'name',
    title: 'Name the country: geography quiz · World Survey',
    description: 'The globe marks a country; pick its name from four, or type it on Hard. A quick way to learn every country’s shape and place.',
    h1: 'Name it',
    intro: 'The globe flies to a highlighted country and you name it: four options on Easy and Normal, typed with suggestions on Hard.',
  },
  {
    path: '/play/streak/', view: 'play', mode: 'streak',
    title: 'Geography streak: one life, rising multiplier · World Survey',
    description: 'Mixed geography rounds with a multiplier up to ×5. One wrong answer ends the run. How long a streak can you survey?',
    h1: 'Streak',
    intro: 'Mixed rounds of finding, naming and flag questions. Each run of right answers raises the multiplier up to ×5; one miss ends it.',
  },
  {
    path: '/flags/', view: 'chooser', which: 'flags',
    title: 'Flag quiz games: lookalikes, blitz and more · World Survey',
    description: 'Five ways to learn the world’s flags: classic flag quiz, lookalike flags, a 60-second blitz, and finding each flag’s country on a globe.',
    h1: 'Flags',
    intro: 'Five flag games: a classic flag quiz with four names, lookalike flags where every wrong answer is a near twin, a 60-second blitz, and two modes played on the globe.',
  },
  {
    path: '/play/flagquiz/', view: 'play', mode: 'flagquiz',
    title: 'Flag quiz: guess the country from its flag · World Survey',
    description: 'See a flag, pick the country from four names, then watch the globe fly to it. Every country’s flag, from easy to hard.',
    h1: 'Flag quiz',
    intro: 'A flag and four country names. Pick the right one, and the globe flies to that country with its capital, neighbours and facts.',
  },
  {
    path: '/play/lookalikes/', view: 'play', mode: 'lookalikes',
    title: 'Lookalike flags quiz: Chad or Romania? · World Survey',
    description: 'Flags people mix up: Chad and Romania, Indonesia and Monaco, Ireland and Ivory Coast. Every wrong answer is a near twin, shown side by side.',
    h1: 'Lookalike flags',
    intro: 'Twenty-five groups of flags that are easy to confuse. Every wrong option is a lookalike, and a miss shows both flags side by side so you learn the difference.',
  },
  {
    path: '/play/flagblitz/', view: 'blitz', mode: 'flagblitz',
    title: 'Flag blitz: 60-second flag quiz · World Survey',
    description: 'Name as many flags as you can in 60 seconds. A wrong answer costs three seconds, and every right one lights its country on the globe.',
    h1: 'Flag blitz',
    intro: 'Sixty seconds on the clock. Name as many flags as you can from four options; a wrong answer costs three seconds and every right answer lights its country on the globe.',
  },
  {
    path: '/play/flags/', view: 'play', mode: 'flags',
    title: 'Flag hunt: find the flag’s country on a globe · World Survey',
    description: 'A flag appears; put your finger on its country on a 3D globe. Misses show the distance to the right answer.',
    h1: 'Flag hunt',
    intro: 'A flag appears and you tap its country on the globe. Near misses score by distance, and the reveal shows where the country really is.',
  },
  {
    path: '/play/flagmatch/', view: 'play', mode: 'flagmatch',
    title: 'Flag match: pick the marked country’s flag · World Survey',
    description: 'The globe marks a country and you choose its flag from four. Learn flags and locations together.',
    h1: 'Flag match',
    intro: 'The globe flies to a marked country and you pick its flag from four options.',
  },
  {
    path: '/higher-or-lower/', view: 'chooser', which: 'higherlower',
    title: 'Higher or lower: country statistics game · World Survey',
    description: 'Which country has more people, more land, a bigger economy or longer lives? Higher or lower with World Bank figures, on a 3D globe.',
    h1: 'Higher or lower',
    intro: 'Two countries, one number. Choose a measure: population, area, GDP, life expectancy, density, or neighbours only. One wrong guess ends the run, and every value shows its year and source.',
  },
  ...[
    ['mixed', 'Mixed measures', 'A different measure every round: population, area, GDP, life expectancy or density.'],
    ['population', 'Population', 'Which country has more people? Population figures from the World Bank, compared on a globe.'],
    ['area', 'Area', 'Which country is bigger on the ground? Total area in square kilometres, compared on a globe.'],
    ['economy', 'Economy', 'Which country has the larger GDP in US dollars? World Bank figures, compared on a globe.'],
    ['life-expectancy', 'Life expectancy', 'Where do people live longer? Life expectancy at birth from the World Bank, compared on a globe.'],
    ['density', 'Density', 'Where are people packed in tighter? People per square kilometre, compared on a globe.'],
    ['neighbours', 'Neighbours', 'Only countries that share a border, with mixed measures. Learn how neighbours compare.'],
  ].map(([slug, name, blurb]) => ({
    path: `/higher-or-lower/${slug}/`, view: 'play', mode: 'higherlower', preset: HL_SLUGS[slug],
    title: `Higher or lower: ${name.toLowerCase()} · World Survey`,
    description: `${blurb} One wrong guess ends the run.`,
    h1: `Higher or lower: ${name}`,
    intro: `${blurb} After each answer the game shows how many times higher or lower the second country is.`,
  })),
  ...Object.entries(REGION_QUIZZES).flatMap(([mode, make]) =>
    Object.entries(REGION_SLUGS).map(([slug, region]) => ({
      path: `/play/${mode}/${slug}/`, view: 'play', mode, region, ...make(region, REGION_COUNT[region]),
    }))),
  {
    path: '/learn/', view: 'learn',
    title: 'Learn the countries of the world: 39 lessons · World Survey',
    description: 'A free course on a 3D globe: 39 short lessons of neighbouring countries, with their flags and capitals. Study a few, then prove it on the map.',
    h1: 'Field course',
    intro: 'All 195 countries in 39 short lessons. Each lesson shows four to six neighbouring countries on the globe with their flags and capitals, then asks you to find and name them. A missed country is asked again before the lesson ends.',
  },
  ...Object.entries(REGION_SLUGS).map(([slug, region]) => ({
    path: `/learn/${slug}/`, view: 'learn', region,
    title: `Learn the countries of ${ofRegion(region)} · World Survey`,
    description: `Learn all ${REGION_COUNT[region]} countries of ${ofRegion(region)} in short lessons on a 3D globe: where each one is, its flag and its capital, a few neighbours at a time.`,
    h1: `Learn ${ofRegion(region)}`,
    intro: `The ${REGION_COUNT[region]} countries of ${ofRegion(region)}, a few neighbours at a time. Each lesson shows the countries on the globe with their flags and capitals, then checks that you can find and name them.`,
  })),
  {
    path: '/review/', view: 'review', noindex: true,
    title: 'Review your weak spots · World Survey',
    description: 'A short review of the countries you have missed, spaced out so they stick. Progress stays in this browser.',
    h1: 'Review',
    intro: 'Countries you missed come back here after a day, then three days, then a week. Each review asks up to ten of them.',
  },
  {
    path: '/atlas/', view: 'atlas',
    title: 'World atlas on a 3D globe · World Survey',
    description: 'Explore all 195 countries on a 3D relief globe: tap any country for its capital, population, area, neighbours and flag.',
    h1: 'Atlas',
    intro: 'Tap any country on the globe, or search by name or capital, to see its flag, capital, population, area, life expectancy and neighbours.',
  },
  {
    path: '/medals/', view: 'medals', noindex: true,
    title: 'Your survey and medals · World Survey',
    description: 'Countries you have surveyed, your records and the medals you have earned. Progress stays in this browser.',
    h1: 'Medals',
    intro: 'Your progress: countries surveyed by region, lessons finished, best scores, accuracy and medals. Everything is stored in this browser only.',
  },
  {
    path: '/about/', view: 'about',
    title: 'About World Survey · sources and credits',
    description: 'How World Survey works, where its data comes from (Natural Earth, World Bank, world-countries, flag-icons) and how your progress is kept.',
    h1: 'About World Survey',
    intro: 'World Survey is a geography game on a 3D relief globe, made by Aimantas. Data: Natural Earth, the World Bank, world-countries, flag-icons and AWS Terrain Tiles. No account, no ads; progress stays in your browser.',
  },
];

export const ROUTE_BY_PATH = new Map(ROUTES.map((r) => [r.path, r]));

// Turn a pathname into a route plus params. Unknown paths fall back to home.
export function resolve(pathname) {
  const path = pathname.endsWith('/') ? pathname : `${pathname}/`;
  if (ROUTE_BY_PATH.has(path)) return { ...ROUTE_BY_PATH.get(path) };
  const atlas = path.match(/^\/atlas\/([a-z0-9-]+)\/$/);
  if (atlas) return { ...ROUTE_BY_PATH.get('/atlas/'), path, slug: atlas[1] };
  // /learn/<lesson>/ is one lesson of the course; the lesson list lives in src/game/course.js.
  const lesson = path.match(/^\/learn\/([a-z0-9-]+)\/$/);
  if (lesson) return { ...ROUTE_BY_PATH.get('/learn/'), view: 'lesson', path, slug: lesson[1] };
  // Any play mode takes a region in its path; only the four with their own page above are indexed.
  const play = path.match(/^(\/play\/[a-z]+\/)([a-z]+)\/$/);
  if (play && ROUTE_BY_PATH.has(play[1]) && REGION_SLUGS[play[2]]) return { ...ROUTE_BY_PATH.get(play[1]), path, region: REGION_SLUGS[play[2]], canonical: play[1] };
  return { ...ROUTE_BY_PATH.get('/'), path: '/', unknown: true };
}

// Old hash links (#/play/find?region=Europe, #/atlas/LTU) map to their path equivalents.
export function fromHash(hash, isoToSlug) {
  const [p, q] = hash.replace(/^#/, '').split('?');
  const parts = p.split('/').filter(Boolean);
  const query = q ? `?${q}` : '';
  if (!parts.length) return null;
  if (parts[0] === 'play' && parts[1] === 'higherlower') {
    const stat = new URLSearchParams(q || '').get('stat');
    const slug = Object.entries(HL_SLUGS).find(([, v]) => v === stat)?.[0] || 'mixed';
    return `/higher-or-lower/${slug}/`;
  }
  if (parts[0] === 'play' && parts[1]) {
    const region = new URLSearchParams(q || '').get('region');
    return `/play/${parts[1]}/${region && regionSlug(region) ? `${regionSlug(region)}/` : ''}`;
  }
  if (parts[0] === 'higherlower') return '/higher-or-lower/';
  if (parts[0] === 'atlas' && parts[1]) return `/atlas/${isoToSlug(parts[1]) || ''}${isoToSlug(parts[1]) ? '/' : ''}`;
  if (['daily', 'flags', 'atlas', 'medals', 'about'].includes(parts[0])) return `/${parts[0]}/`;
  return null;
}

export const playPath = (mode, region) =>
  mode === 'higherlower' ? '/higher-or-lower/' : `/play/${mode}/${region && regionSlug(region) ? `${regionSlug(region)}/` : ''}`;
export const hlPath = (preset) => `/higher-or-lower/${Object.entries(HL_SLUGS).find(([, v]) => v === preset)?.[0] || 'mixed'}/`;
