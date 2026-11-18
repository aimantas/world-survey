# Reference pages

Static, pre-rendered reference pages for World Survey, in the same sheet as the country pages:

- `/lists/` and one page per entry in `LISTS` (12 lists: population, area, GDP, GDP per capita, density, life expectancy, number of neighbours, the 30 smallest, landlocked, island, capital cities, flags).
- `/compare/` and one page per pair of the 195 countries that share a land border (314 pairs), at `/compare/<a>-vs-<b>/` with the two slugs in alphabetical order.

Everything on a page (figures, ranks, sentences, distances, the map) is computed at build time from `data/countries.json`, `data/encyclopedia.json` and `data/world.json`. No network. This folder is never shipped; only the generated HTML and `assets/reference.css` / `assets/reference.js` are.

## Run

```sh
node tools/reference/build.mjs dist            # build.py calls this after the encyclopedia step
node tools/reference/verify.mjs dist           # checks; exit 1 on failure
```

Scratch run without touching `dist/` (`_out/` is gitignored):

```sh
rsync -a --exclude 'elevation-18k-*' dist/ tools/reference/_out/
node tools/reference/build.mjs tools/reference/_out && node tools/reference/verify.mjs tools/reference/_out
python3 -m http.server 4479 --bind 127.0.0.1 --directory tools/reference/_out   # preview
node tools/reference/build.mjs tools/reference/_out --no-maps                   # development: about 1 s instead of 7
```

`build.mjs` deletes and rewrites `<outDir>/lists/` and `<outDir>/compare/`, copies the stylesheet and script to `<outDir>/assets/`, prints one summary line and exits non-zero on failure. Inputs are read from the source tree, or from `<outDir>/data/` when the source tree has none. The same inputs give byte-identical output. It needs `data/encyclopedia.json` (`node tools/encyclopedia/fetch.mjs --offline`).

| File | Role |
| --- | --- |
| `urls.mjs` | The URL contract: `LISTS`, `listPath`, `comparePath`, `comparePairs`, `referencePaths`. The country pages and the sitemap import it too, so do not change a path it produces |
| `data.mjs` | Loads the three data files into one record per country; shared number formatting |
| `lists.mjs` | The 12 list pages and `/lists/` |
| `compare.mjs` | The 314 comparison pages and `/compare/` |
| `map.mjs` | The locator map for a pair (d3-geo orthographic, topojson-simplify, polylabel), drawn with the country maps' CSS classes |
| `chrome.mjs` | Head, masthead, breadcrumbs, footer: a copy of the country pages' chrome |
| `build.mjs`, `verify.mjs` | Entry points |
| `../../assets/reference.css` | Loaded after `encyclopedia.css`; only what the tables, the flag sheet and the comparison need |
| `../../assets/reference.js` | Progressive enhancement on the list pages: column sort, region filter, name filter. The full tables are in the HTML |

## Rules the pages follow

- **Ranks** are the world ranks in `data/encyclopedia.json`, the same numbers the country pages print: largest first, equal values share a rank (1, 2, 2, 4). The smallest-countries list counts from the bottom instead.
- **Old figures**: a World Bank value older than `MIN_RANK_YEAR` (2018, from `tools/encyclopedia/lib.mjs`) is shown with its year below the ranking, marked "not ranked", and is not compared on a comparison page. On 3 Nov 2026 that is GDP and GDP per capita for Eritrea (2011) and South Sudan (2015).
- **No data** is printed as "no data" and sorts last; it is never a zero. Vatican City has no World Bank figures; North Korea has no GDP.
- **Years and sources**: every World Bank figure carries its year; `world-countries` gives no year for area and borders, and the pages say so. List pages with a measure add a `Dataset` JSON-LD node naming the source series and licence.
- **Density** is population ÷ area, ranked on the unrounded value.
- **Neighbours** are land borders among the 195 only. Kosovo, Western Sahara, Hong Kong and Macau are named as neighbouring areas, not counted.
- **Island countries** are the 38 the data flags as islands with no land border. Indonesia, Ireland and the United Kingdom are named as examples of countries left out because they share a border; Australia has no land border but is not flagged as an island.
- **Capital distances** are great-circle distances between the capital points, rounded to 1 km.
- **Comparison prose** is four or five sentences: where the two are and how far apart their capitals lie; area against population; the wider of the GDP and GDP per capita gaps; life expectancy or density when the gap is worth a sentence; what else they both border. Neutral sentences rotate through a few phrasings picked by a stable hash of the two ISO codes.
- **Differences** read as "2.4 times" from double upward and as a percentage below that.
- **Borders that need a note**: ten pairs get one under the map, from the flags in `data/encyclopedia.json` (the border is on an outlying part, or `world-countries` lists a border the 1:50m outlines do not draw: Botswana and Zambia, Djibouti and Somalia, Morocco and Spain, Spain and the United Kingdom).
- **Chrome** is copied from `tools/encyclopedia/build.mjs` (a script, so not importable). `tools/seo/verify.mjs` compares the footer with the encyclopedia's character for character; keep `MAST_NAV`, `FOOT_NAV` and the head in `chrome.mjs` in step. The Speculation Rules block is imported from `tools/encyclopedia/speculation.mjs`.

## What verify checks

Every path in `referencePaths()` has a file and nothing else is in `/lists/` or `/compare/`; one title, description, canonical, h1 and main per page; titles and descriptions unique within the two families and against every other page in the folder; descriptions 50 to 160 characters; Open Graph and Twitter tags match the title and description; one JSON-LD block that parses, with `WebPage` + `BreadcrumbList`, an `ItemList` on list pages, a `Dataset` with source and licence on the statistical lists, and `about` pointing at the two `Country` nodes on a comparison; every internal link and asset resolves (files for `/lists/`, `/compare/`, `/countries/`, `/assets/`; `src/routes.js` for game links); no document-relative URL, external resource, inline style, host off the allowlist or private marker; footer, masthead and speculation rules equal to the country pages'; table row counts, rank order, ranks equal to the country pages', figures equal to the data, years present, "no data" rows; every comparison links both country pages, both globe pages, the game, and every other comparison of either country; images carry width, height and alt.

## Limits

- One capital per country, as `world-countries` lists it first (Pretoria, Sucre, Amsterdam).
- Flags are drawn 4:3 by flag-icons, so official proportions are not shown.
- The map frames the two main landmasses and their shared border. Pairs with Russia show a whole hemisphere; France with Brazil or Suriname spans the Atlantic, with French Guiana hatched as France.
- `world.json` draws Somaliland apart from Somalia and has no polygon for some very short borders, hence the notes above.
- A page weighs about 31 KB (median); the list tables about 90 KB, the neighbours list 121 KB, mostly rows and links.
