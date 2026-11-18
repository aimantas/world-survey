// The field course: all 195 countries in short lessons of neighbours, region by region.
// Pure data in, pure data out: the game reads it at runtime and tools/seo reads it at build time,
// so a lesson has the same countries and the same URL in both.

export const COURSE_REGIONS = ['Europe', 'Asia', 'Africa', 'Americas', 'Oceania'];

// Teaching order inside each region. A group is one or more subregions taught together;
// subregions with two or three countries ride along with a neighbour.
const GROUPS = {
  Europe: [
    { name: 'Western Europe', subs: ['Western Europe'] },
    { name: 'Northern Europe', subs: ['Northern Europe'] },
    { name: 'Southern Europe', subs: ['Southern Europe'] },
    { name: 'Central Europe', subs: ['Central Europe'] },
    { name: 'Southeast Europe', subs: ['Southeast Europe'] },
    { name: 'Eastern Europe', subs: ['Eastern Europe'] },
  ],
  Asia: [
    { name: 'Eastern Asia', subs: ['Eastern Asia'] },
    { name: 'South-Eastern Asia', subs: ['South-Eastern Asia'] },
    { name: 'Southern Asia', subs: ['Southern Asia'] },
    { name: 'Central Asia', subs: ['Central Asia'] },
    { name: 'Western Asia', subs: ['Western Asia'] },
  ],
  Africa: [
    { name: 'Northern Africa', subs: ['Northern Africa'] },
    { name: 'Western Africa', subs: ['Western Africa'] },
    { name: 'Middle Africa', subs: ['Middle Africa'] },
    { name: 'Eastern Africa', subs: ['Eastern Africa'] },
    { name: 'Southern Africa', subs: ['Southern Africa'] },
  ],
  Americas: [
    { name: 'North and Central America', subs: ['North America', 'Central America'] },
    { name: 'Caribbean', subs: ['Caribbean'] },
    { name: 'South America', subs: ['South America'] },
  ],
  Oceania: [
    { name: 'Australia and Melanesia', subs: ['Australia and New Zealand', 'Melanesia'] },
    { name: 'Polynesia and Micronesia', subs: ['Polynesia', 'Micronesia'] },
  ],
};

const LESSON_MAX = 6;
const RAD = Math.PI / 180;

const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function km(a, b) {
  const dLat = (b[0] - a[0]) * RAD;
  const dLng = (b[1] - a[1]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Walk the group from its north-west corner, always stepping to the nearest country not yet visited,
// so each lesson is a cluster of neighbours rather than an alphabetical slice.
function chain(list) {
  const left = list.slice().sort((a, b) => a.name.localeCompare(b.name));
  const lng0 = Math.min(...left.map((c) => c.labelLatLng[1]));
  const lat0 = Math.max(...left.map((c) => c.labelLatLng[0]));
  let at = [lat0, lng0];
  const out = [];
  while (left.length) {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = km(at, left[i].labelLatLng);
      if (d < bd) { bd = d; best = i; }
    }
    const [c] = left.splice(best, 1);
    out.push(c);
    at = c.labelLatLng;
  }
  return out;
}

// Even chunks of at most LESSON_MAX: 17 countries become 6, 6 and 5.
function chunks(list) {
  const n = Math.ceil(list.length / LESSON_MAX);
  const out = [];
  let i = 0;
  for (let k = 0; k < n; k++) {
    const size = Math.ceil((list.length - i) / (n - k));
    out.push(list.slice(i, i + size));
    i += size;
  }
  return out;
}

export function buildCourse(countries) {
  const sovereign = countries.filter((c) => c.sovereign && c.labelLatLng);
  const lessons = [];
  for (const region of COURSE_REGIONS) {
    for (const group of GROUPS[region]) {
      const members = sovereign.filter((c) => c.region === region && group.subs.includes(c.subregion));
      if (!members.length) continue;
      const parts = chunks(chain(members));
      parts.forEach((part, k) => {
        const name = parts.length > 1 ? `${group.name} ${k + 1}` : group.name;
        lessons.push({
          id: slugify(name),
          slug: slugify(name),
          path: `/learn/${slugify(name)}/`,
          region,
          group: group.name,
          name,
          part: k + 1,
          parts: parts.length,
          iso3: part.map((c) => c.iso3),
        });
      });
    }
  }
  lessons.forEach((l, i) => { l.number = i + 1; });
  // Anything the groups missed (a new subregion in the data) still gets taught.
  const taught = new Set(lessons.flatMap((l) => l.iso3));
  const missed = sovereign.filter((c) => !taught.has(c.iso3));
  if (missed.length) {
    chunks(chain(missed)).forEach((part, k) => {
      const name = `More countries ${k + 1}`;
      lessons.push({ id: slugify(name), slug: slugify(name), path: `/learn/${slugify(name)}/`, region: part[0].region, group: 'More countries', name, part: k + 1, parts: 1, iso3: part.map((c) => c.iso3), number: lessons.length + 1 });
    });
  }
  return {
    lessons,
    total: lessons.length,
    bySlug: new Map(lessons.map((l) => [l.slug, l])),
    byRegion: (region) => lessons.filter((l) => l.region === region),
  };
}
