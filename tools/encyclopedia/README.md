# Encyclopedia pages

Static, pre-rendered country pages for World Survey: `/countries/<slug>/` for the 195 countries, `/countries/` (index by region), `/countries/<region>/` for Europe, Asia, Africa, Americas and Oceania, plus `sitemap.xml` and `robots-sitemap.txt`. No JavaScript, no external requests: every asset URL is root-absolute on the same origin (`/assets/encyclopedia.css`, `/assets/fonts/…`, `/assets/flags/…`, `/assets/icon.svg`, `/assets/og.png`). The one inline block that is not JSON-LD is Speculation Rules, which is data for the browser, not code. This folder is never shipped; only the generated HTML is.

Links out of the pages are built from the same sources as their targets, so they cannot drift: game routes from `src/routes.js` (region quizzes are paths, `/play/find/europe/`, never `?region=`), lessons from `buildCourse()` in `src/game/course.js`, list and comparison pages from `tools/reference/urls.mjs`. Those targets are written by other steps (`tools/seo`, `tools/reference`); `verify.mjs` here checks the links against the contracts, and `tools/seo/verify.mjs` checks them against the files once everything is built.

## Run

```sh
cd tools && npm ci --ignore-scripts && cd ..        # once; adds topojson-simplify to the data tools' deps
node tools/encyclopedia/fetch.mjs                     # data/encyclopedia.json (downloads into tools/.cache/encyclopedia/ if missing)
node tools/encyclopedia/fetch.mjs --offline           # same, never touches the network
node tools/encyclopedia/build.mjs dist                # pages into dist/ (build.py calls this after copying the game)
node tools/encyclopedia/build.mjs tools/encyclopedia/_out --with-assets   # local preview: also copies fonts, flags, icon, og.png
node tools/encyclopedia/verify.mjs tools/encyclopedia/_out                # checks; exit 1 on failure
python3 -m http.server 4472 --bind 127.0.0.1 -d tools/encyclopedia/_out   # preview
```

`build.mjs` takes about 25-35 s. It deletes and rewrites `<outDir>/countries/`, writes `<outDir>/sitemap.xml`, `<outDir>/robots-sitemap.txt` (just the `Sitemap:` line, for build.py to append to robots.txt) and copies `assets/encyclopedia.css` to `<outDir>/assets/`. The same inputs give byte-identical output. `--only=PER,LIE` renders just those country pages, for development.

| File | Role |
| --- | --- |
| `fetch.mjs` | Downloads six World Bank indicators and the Natural Earth marine polygons (cached, manifest with SHA-256), then derives `data/encyclopedia.json` |
| `build.mjs` | Page templates, titles, descriptions, JSON-LD, onward links, sitemap |
| `map.mjs` | Build-time SVG locator maps (d3-geo orthographic, topojson-simplify, polylabel label placement) |
| `prose.mjs` | Data-driven paragraphs, and the Questions section (`makeQuestions`) |
| `speculation.mjs` | The Speculation Rules block shared with the route shells (`tools/seo`) |
| `lib.mjs` | Slug rule, distances, ranking, formatting; `faqOf()` reads a page's questions back for the verify scripts |
| `verify.mjs` | Counts, links (game routes, lessons, lists and comparisons against their contracts), uniqueness, JSON-LD, Questions equal to the FAQPage node, the shared footer, sizes, external requests, private markers, sitemap; and the release-review rules: sovereign-only neighbour counts, calling codes, no ranks on pre-2018 values, no World Bank promise without data |
| `../../assets/encyclopedia.css` | Standalone stylesheet (survey-sheet tokens and fonts copied from `styles.css`); also opts the static pages in to cross-document view transitions |

## Page sections added for search

**Questions** (country pages, after "Where on Earth"): five to seven questions, each answered in one or two sentences from the same record as the rest of the sheet. In order: where it is (region, land-neighbour count, hemispheres), capital (with coordinates), population (figure, year, World Bank, rank), size (area, rank, the country closest in area), which countries border it (or, for an island, the nearest capital), languages and currency (both as world-countries lists them). A question is left out when the record cannot answer it: Vatican City has no population question, Micronesia no currency question. The answers are plain text; the `FAQPage` JSON-LD node (`@id` `…#questions`) repeats them word for word, and both verify scripts compare the two.

**More on …** (country pages, before the pager):

| Block | Links |
| --- | --- |
| Compare with a neighbour | One per sovereign land neighbour, to `comparePath(c, neighbour)`. Absent for countries with none |
| See it in the lists | The list pages the country is on. A ranking list is linked only when the country has a rank in it, and the link shows that rank; landlocked, island, capital and flag lists follow the data flag; "smallest countries" links only from the 30 smallest, the number that list shows |
| Learn it | The lesson of the field course that teaches the country, with the countries taught alongside |
| Quiz yourself | The region's quiz pages (`/play/find/<region>/`, `/play/capitals/<region>/`, `/play/name/<region>/`, `/play/flagquiz/<region>/`) and `/play/capitalquiz/` |

**Learn and play** (region pages, after the table): the region's lessons with their countries, its quizzes, every list and the comparison index.

**Footer** (every page, identical, no current-page marker):

```html
<footer class="colophon"><nav class="foot" aria-label="World Survey"><a href="/countries/">Countries</a><a href="/lists/">Lists</a><a href="/compare/">Compare</a><a href="/learn/">Learn</a><a href="/atlas/">Atlas</a><a href="/">Play</a><a href="/about/">About</a></nav><p>World Survey, a geography game on a 3D globe. Made by <a href="https://aimantas.com/">Aimantas</a>.</p></footer>
```

**Share image**: when `assets/og/<slug>.png` exists (drawn by `tools/seo/og.mjs`), the country page names it in `og:image` and `twitter:image` with its width (1200), height (630) and alt text, and `build.mjs` copies the images into `<outDir>/assets/og/`. Other pages, and country pages without a file, use `/assets/og.png`.

**Navigation between static pages**: each page carries the Speculation Rules block from `speculation.mjs` (prerender on hover for `/countries/`, `/lists/` and `/compare/` links, prefetch only for links into the game), and `encyclopedia.css` sets `@view-transition { navigation: auto; }` with a 0.16 s cross-fade, switched off under `prefers-reduced-motion: reduce`. Any static page that loads `encyclopedia.css` takes part.

## Slug rule

The game links to the same URLs, so keep this exactly (on `countries.json` `name`):

```js
name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
```

`fetch.mjs` and `build.mjs` fail if two countries share a slug or a country slug equals a region slug (`europe`, `asia`, `africa`, `americas`, `oceania`).

## Sources (retrieved 2026-11-03)

| What | Source | URL | Licence |
| --- | --- | --- | --- |
| Official name, alternative spellings, native official names, demonym, calling code, TLD, currencies (name, code, symbol) | world-countries 5.1.0 (mledoze/countries), the npm package the data tools already install | https://github.com/mledoze/countries | ODbL 1.0 |
| GDP per capita, current US$ | World Bank WDI API v2 `NY.GDP.PCAP.CD`, `mrnev=1`, year kept per value; API last updated 2026-10-08 | https://api.worldbank.org/v2/country/all/indicator/NY.GDP.PCAP.CD?format=json&mrnev=1&per_page=20000 | CC BY 4.0 |
| Urban population, % of total | World Bank WDI `SP.URB.TOTL.IN.ZS` (as above) | https://api.worldbank.org/v2/country/all/indicator/SP.URB.TOTL.IN.ZS?format=json&mrnev=1&per_page=20000 | CC BY 4.0 |
| Forest area, % of land area | World Bank WDI `AG.LND.FRST.ZS` | https://api.worldbank.org/v2/country/all/indicator/AG.LND.FRST.ZS?format=json&mrnev=1&per_page=20000 | CC BY 4.0 |
| Population growth, annual % | World Bank WDI `SP.POP.GROW` | https://api.worldbank.org/v2/country/all/indicator/SP.POP.GROW?format=json&mrnev=1&per_page=20000 | CC BY 4.0 |
| Individuals using the Internet, % of population | World Bank WDI `IT.NET.USER.ZS` | https://api.worldbank.org/v2/country/all/indicator/IT.NET.USER.ZS?format=json&mrnev=1&per_page=20000 | CC BY 4.0 |
| Fertility rate, births per woman | World Bank WDI `SP.DYN.TFRT.IN` | https://api.worldbank.org/v2/country/all/indicator/SP.DYN.TFRT.IN?format=json&mrnev=1&per_page=20000 | CC BY 4.0 |
| Sea and ocean names (map labels, antipodes) | Natural Earth 1:50m Marine Areas (`geography_marine_polys`), natural-earth-vector v5.1.2 | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_geography_marine_polys.geojson | Public domain |
| Geometry, capitals, population, GDP, life expectancy, area, borders, flags | `data/countries.json`, `data/world.json`, `assets/flags/` (see `tools/README.md`) | — | as listed there |
| Build tool (not shipped) | topojson-simplify 3.0.3 | https://github.com/topojson/topojson-simplify | ISC |

`tools/.cache/encyclopedia/manifest.json` records URL, bytes, SHA-256, retrieval date and the World Bank `lastupdated` per file. Each page's Sources footer names the sources, licences, the World Bank years it shows, and the retrieval date.

## Derived data (`data/encyclopedia.json`, build-time only, never shipped)

- **Ranks**: competition ranking (1, 2, 2, 4), largest first, among the 195 with a value; region ranks within the region. Ranked: population, area, GDP, GDP per capita, density, life expectancy, the five other indicators and land-neighbour count. Years can differ between countries; pages say so.
- **Old values** (`MIN_RANK_YEAR` = 2018 in `lib.mjs`): World Bank values older than 2018 stay in the data (`stats.*.ranked: false`, `staleCore`) and in the comparison table with their year, marked "not ranked", but get no rank and no comparison sentence; the prose names them once with their years. Ten values on 3 Nov 2026: ERI GDP and GDP per capita 2011, SSD GDP and GDP per capita 2015, internet use PRK 2004, WSM 2014, VUT 2015, TKM 2016, SDN 2017, TUV 2017.
- **Neighbour counts** are sovereign neighbours among the 195 only (`sovereignNeighbourCount`, `ranks.neighbourCount`). Kosovo, Western Sahara, Hong Kong and Macau are listed after them as other areas, not counted or ranked, in neutral wording ("also borders Kosovo"); China's two use the official names world-countries gives them ("its special administrative regions"). China and Russia tie on 14.
- **Density**: `countries.json` population ÷ world-countries area.
- **Closest in area / population**: smallest absolute log ratio among the other 194.
- **Distances**: great circle between capital points, R = 6,371 km, rounded to 1 km. Islands list the three nearest capitals instead of neighbours.
- **Hemispheres**: `main` from the main-landmass bbox; `all` from every polygon `world.json` draws for the state (France's overseas regions, Kiribati's Line Islands, Alaska's Aleutians).
- **Extremes**: the main-landmass bbox; north-south span is the meridian arc between the extreme latitudes.
- **Antipode** of the capital: spherical point-in-polygon on `world.json` (19 fall on land); otherwise the smallest Natural Earth marine polygon containing it (all other 176 did, so the "open-ocean" fallback is unused), plus the nearest `world.json` vertex, rounded to 10 km and printed as "about".
- **Neighbour notes**: `inGeometry: false` when world-countries lists a land border the 1:50m polygons don't share (Spain–Morocco, Spain–UK, Zambia–Botswana); `viaOutlyingSelf/Other` when every shared boundary lies on polygons outside that state's main-landmass bbox (France–Brazil and France–Suriname via French Guiana). Pages explain both.
- **Calling codes**: root + suffix when there is one suffix; the root alone only for the shared +1 and +7 zones; otherwise root + each suffix as given (Vatican: +3906698, +379).
- **Meta descriptions** mention World Bank figures only when the page has at least one (not Vatican City).
- **One correction**: world-countries gives Zimbabwe's South African rand the symbol "Rs"; the same dataset uses "R" for ZAR in South Africa, Lesotho, Namibia and Eswatini, so the build uses "R".

## Known gaps and limits

- Vatican City has no World Bank data at all (population, GDP and all six extra indicators): its page says so and it is left out of those ranks. North Korea has no GDP or GDP per capita. Micronesia has no currency in world-countries. Tuvalu has no polygon at 1:50m: its map is a ring at the capital with the surrounding islands, and it has no extremes.
- Kosovo, Western Sahara, Hong Kong and Macau appear as neighbouring areas without a page (they are not among the 195).
- world-countries 5.1.0 currency lists can lag reality (Zimbabwe's list is long and older). Shown as published, with the source.
- `world.json` has no lakes, so maps show none (Lake Geneva, Victoria). Coastlines are 1:50m, simplified per map scale.
- Region pages for Europe (76 KB), Asia (77 KB) and Africa (74 KB) sit over the 70 KB page target; all 195 country pages are under it (largest Russia, 67 KB).
- The answers in the Questions section state what the datasets hold. "Which region" follows world-countries (Cyprus under Europe, Türkiye under Asia), and currency lists are that dataset's, which can lag (Zimbabwe).
- Links to `/lists/`, `/compare/` and `/learn/<lesson>/` point at pages other steps write. A build without `tools/reference/build.mjs` leaves the first two dead; build.py prints a warning when that happens.
