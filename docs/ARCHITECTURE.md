# How World Survey fits together

One sentence: you answer by touching a 3D relief globe, and the globe flies to show exactly where you were right or how far off you were.

## Layout

```
index.html, 404.html     app shell, one page with real paths (/play/find/europe/, /atlas/peru/)
styles.css               the whole sheet: paper, ink, title block, stamps, panels
src/main.js              boot: load data, create the globe, start the router
src/routes.js            every URL the game answers, with its title and description
src/data.js              loads data/countries.json and data/world.json, indexes shapes, countryAt()
src/globe/               the globe engine (three.js)
src/game/                rules: modes, questions, scoring, daily seed, course, progress, medals
src/ui/                  screens: home, play, results, learn, atlas, pages, panels
src/sfx.js               synthesized sound (WebAudio), no audio files
data/                    built data (see the contract below)
assets/                  relief and elevation rasters, flags, fonts, icons
vendor/                  three.js and topojson-client, vendored so nothing loads from a CDN
tools/                   data build, rasters, static page generators, service worker
build.py, serve.py       production build into dist/, local server
ios/                     the native iPhone app
```

## Data contract: `data/countries.json`

```json
{
  "generated": "YYYY-MM-DD",
  "sources": [{ "what": "...", "name": "...", "url": "...", "licence": "...", "retrieved": "YYYY-MM-DD" }],
  "countries": [{
    "iso3": "LTU", "iso2": "LT", "ccn3": "440",
    "name": "Lithuania", "official": "Republic of Lithuania",
    "sovereign": true,
    "region": "Europe", "subregion": "Northern Europe",
    "capital": "Vilnius", "capitalLatLng": [54.687, 25.28],
    "labelLatLng": [55.3, 23.9],
    "bbox": [20.9, 53.9, 26.8, 56.45],
    "area": 65300,
    "population": 2885891, "populationYear": 2024,
    "gdp": 84000000000, "gdpYear": 2024,
    "lifeExpectancy": 75.9, "lifeExpectancyYear": 2023,
    "borders": ["LVA", "BLR", "POL", "RUS"],
    "languages": ["Lithuanian"], "currencies": ["Euro"],
    "landlocked": false, "island": false,
    "tier": 1,
    "tiny": false,
    "inMap": true,
    "flag": "assets/flags/lt.svg"
  }]
}
```

- `sovereign` is true for the 195 playable states (193 UN members, Vatican City and Palestine). The other 47 records are territories the map draws; the globe names them when tapped but never asks about them.
- `tier` is 1 (well known), 2 or 3 (hard); Easy asks tier 1, Normal tiers 1–2, Hard all 195. The rule is in [tools/TIERS.md](../tools/TIERS.md).
- `tiny` marks states too small to tap; the globe draws a ring the player can hit instead.
- `bbox` is `[minLng, minLat, maxLng, maxLat]`; minLng > maxLng when a country crosses the antimeridian.
- Missing values are `null`, never zero.

`data/world.json` is TopoJSON (Natural Earth 1:50m) with `objects.countries` and `feature.properties.iso3`.

## The globe engine

`src/globe/globe.js` exports one class. The game talks to it only through this API, so you can restyle or replace the engine without touching the rules.

```js
const globe = new Globe(container, { data, quality: 'auto' })
await globe.ready                                  // textures loaded, first frame drawn
globe.on('pick', ({ iso3, latLng, screen }) => {}) // tap or click without a drag; iso3 is null over sea
globe.on('hover', ({ iso3, latLng }) => {})
globe.setInteractive(true)
globe.flyTo({ iso3 } | { latLng, distance }, { duration })  // eased great-circle flight, fits the country
globe.highlight(iso3, 'target' | 'correct' | 'wrong' | 'focus' | 'neighbour')
globe.dropPin(latLng, 'guess' | 'answer' | 'capital')
globe.drawArc(fromLatLng, toLatLng, { label: '1,140 km' })
globe.showLabels([{ iso3, text }])
globe.setSurveyed({ LTU: 2, PER: 1 })              // land you know prints in colour, the rest stays pale
globe.setRegionFocus('Europe')
globe.idle(true)                                   // slow spin on menus
globe.clearHighlights(); globe.clearMarks()
```

Picking is exact: a ray hits the sphere, the point becomes latitude and longitude, and `data.countryAt()` runs a point-in-polygon test against the outlines with a bounding-box prefilter. Relief comes from an elevation texture that displaces the mesh; coastlines, borders and highlights are drawn as vector lines that sample the same height, so they stay sharp at any zoom. `src/globe/detail.js` swaps in 10° elevation tiles when the camera is close.

## A round

1. `src/game/questions.js` picks a country from the pool for the region and level, weighted toward ones you have missed (`nextCountry`), and builds wrong options from the same subregion (`distractors`).
2. `src/ui/play.js` asks: on the globe for Find it, Flag hunt and Capital pin, from four options for the rest.
3. `src/game/scoring.js` scores it: 1,000 for a right answer plus up to 200 for speed; a wrong tap earns up to 600 by distance; a capital pin earns 1,000 within 25 km and nothing past 2,500 km.
4. The reveal flies to the answer, hatches it, draws the arc from your guess, outlines the neighbours and shows the facts. Three seconds later the next country comes up unless you touch the card.
5. `src/game/progress.js` records mastery per country (0–3), the review schedule (ten minutes, a day, three days, two weeks), records, streaks and medals in `localStorage`. There is no account and no server.

The daily expedition (`src/game/daily.js`) seeds an FNV-1a hash of the UTC date into mulberry32, so everyone gets the same five countries on the same day, on the web and on the iPhone.

## The iPhone app

`ios/` is a native port, not a web view. It reads the same `countries.json`, `world.json` and course, and its scoring, seeded random and daily expedition match the web code exactly; unit tests check the daily against values printed by the web code. The globe is SceneKit: one baked 8k texture, line work as screen-width ribbons, highlights as textured patches. [ios/README.md](../ios/README.md) has the details.

## Static pages

`python3 build.py` runs three generators after copying the game:

- `tools/encyclopedia/` writes one page per country from `data/encyclopedia.json` (ranks, neighbours, facts, FAQ data).
- `tools/reference/` writes ranked lists and neighbour comparisons.
- `tools/seo/` writes a shell per route, the sitemap, the HTML site map, llms.txt, the manifest and icons.

Each generator has a `verify.mjs` that fails the build on broken links, missing pages, outside hosts or private strings.

## Design

The visual system, from the paper and ink to the magenta overprint and the stamps, is written down in [DESIGN.md](DESIGN.md).
