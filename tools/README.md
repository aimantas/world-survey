# Data tools

Builds `data/world.json`, `data/countries.json`, `assets/flags/`, `assets/relief-*`, `assets/elevation-2k.png` and `assets/coast-sdf-2k.png` for the geography globe (contract: `PLAN.md` §4 and §4.1). This folder is never shipped.

## Run

```sh
cd tools
npm ci --ignore-scripts   # sharp ships prebuilt binaries as optional deps; no install scripts needed
node fetch.mjs            # downloads into tools/.cache/ (idempotent; --force-wb / --force-wd refresh World Bank / Wikidata)
node build.mjs            # everything, offline from the cache; or a subset: data flags relief land elevation coast
node verify.mjs           # checks + report; exit 1 on failure
```

A full build takes about 55 s on an M-series Mac. `build.mjs` never touches the network, and its `generated` date comes from the cache manifest, so the same cache gives the same output. `tools/.cache/manifest.json` records URL, size, SHA-256 and retrieval date per source. `build-log.json` lists capital-name aliases and fallbacks from the last build. Downloaded files are only read as data and never executed.

| Step | Script | Output |
| --- | --- | --- |
| fetch | `fetch.mjs` | `.cache/` (NE places, NE relief zip + tif, World Bank JSON, Wikidata JSON, 256 Terrarium z4 tiles + their source headers) |
| data | `build-world.mjs`, `build-countries.mjs`, `tiers.mjs` | `data/world.json`, `data/countries.json`, `tools/TIERS.md` |
| flags | `build-flags.mjs` | `assets/flags/<iso2>.svg` |
| relief, land, elevation, coast | `build-rasters.mjs` | `assets/relief-{2k,4k,8k}.webp`, `assets/relief-land-4k.webp`, `assets/elevation-2k.png`, `assets/coast-sdf-2k.png` |

## Sources (retrieved 2026-11-03)

| What | Source | URL | Licence |
| --- | --- | --- | --- |
| Country geometry (`world.json`) | Natural Earth 1:50m Admin 0 Countries, packaged as world-atlas 2.0.2 `countries-50m.json` (npm) | https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json | Natural Earth: public domain. world-atlas packaging: ISC |
| Names, codes, region/subregion, area, borders, languages, currencies, landlocked, UN membership | world-countries 5.1.0 (mledoze/countries) (npm) | https://github.com/mledoze/countries | ODbL 1.0 (attribution and share-alike apply to the derived database) |
| Capital coordinates | Natural Earth 1:10m Populated Places (simple), natural-earth-vector v5.1.2 | https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_10m_populated_places_simple.geojson | Public domain |
| Capital coordinates, fallback only | Wikidata SPARQL: country (P298 ISO alpha-3) → capital (P36) → coordinates (P625); the query is in `fetch.mjs` | https://query.wikidata.org/ | CC0 1.0 |
| Population, GDP, life expectancy | World Bank WDI API v2: `SP.POP.TOTL`, `NY.GDP.MKTP.CD`, `SP.DYN.LE00.IN`, `mrnev=1` (latest non-empty value; year kept). API data last updated 2026-10-08 | https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&mrnev=1&per_page=20000 (same pattern for the other two) | CC BY 4.0 |
| Flags | flag-icons 7.6.0, `flags/4x3` (npm) | https://github.com/lipis/flag-icons | MIT |
| Relief imagery | Natural Earth 1:50m Cross Blended Hypsometric Tints with Shaded Relief and Water, `HYP_50M_SR_W` v2.0.0 (10800×5400) | https://naturalearth.s3.amazonaws.com/50m_raster/HYP_50M_SR_W.zip | Public domain |
| Land mask (relief-land, elevation, coast SDF) | The `land` object in `data/world.json`, which world-atlas merged from the same Natural Earth 50m countries | (as above) | Public domain |
| Elevation | Terrain Tiles on AWS, Terrarium encoding, zoom 4 (256 tiles). The `x-amz-meta-x-imagery-sources` header of every z4 tile lists only GMTED2010 (`gmted/*_mea300.tif`) and ETOPO1 (`etopo1/ETOPO1_Bed_g.tif`); see `.cache/terrarium/sources-z4.json` | https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png · https://registry.opendata.aws/terrain-tiles/ | Open data. Attribution required per https://github.com/tilezen/joerd/blob/master/docs/attribution.md. For these tiles: "GMTED2010 terrain data courtesy of the U.S. Geological Survey; ETOPO1, U.S. National Oceanic and Atmospheric Administration." |
| Elevation detail | Terrain Tiles on AWS, Terrarium zoom 6, built by `elevation-hires.mjs` into `assets/elevation-18k-cXXrYY.png` (405 land tiles of 10°, about 2.2 km per pixel) and the generated `src/globe/detail-index.js`. Same GMTED2010 and ETOPO1 sources as zoom 4, so the credit line below is unchanged | (as above) | (as above) |

The shipped credits page needs: Natural Earth; mledoze/countries (ODbL); World Bank (CC BY 4.0); flag-icons (MIT); the GMTED2010/USGS and ETOPO1/NOAA line above. `countries.json` `sources` carries the same list, so the game can render it.

**Relief variant.** At 1:50m, Natural Earth publishes `HYP_50M_SR` (no water), `HYP_50M_SR_W` (with water) and the separate `OB_50M` (ocean bottom only). There is no 50m hypsometric raster with ocean bottom or drainages: `HYP_50M_SR_OB_DR`, `HYP_50M_SR_W_DR` and `HYP_50M_SR_OB` all return 404. The ocean-bottom-plus-drainages version exists only at 1:10m (`10m_raster/HYP_LR_SR_OB_DR.zip`, 240 MB, 21600×10800). I used `HYP_50M_SR_W` as specified. The globe paints its own ocean anyway (PLAN §6).

## Data decisions

**Codes.** `iso3` is the ISO 3166-1 alpha-3 from mledoze, with these exceptions:
- Kosovo uses `XKX`, the code the World Bank and EU use; mledoze has the user-assigned `UNK`. `iso2` is `XK`.
- Five world-atlas features have no ISO code: Somaliland `SOL`, Northern Cyprus `CYN`, Indian Ocean Territories `IOA` (Christmas Island and Cocos), Siachen Glacier `KAS` and Ashmore and Cartier Islands `ATC`. They use Natural Earth ADM0_A3 codes, with `iso2`, `ccn3`, `flag`, `area` and demographics all null. Their region and subregion come from SOM, CYP, CXR, IND and AUS respectively. Their borders are the features they share boundary arcs with in world.json. Ashmore and Cartier shares world-atlas id 036 with Australia, so it is told apart by name.

`world.json` sets every geometry `id` and `properties.iso3` to the iso3 above, and `properties.name` to the countries.json name. The geometry and quantization are exactly world-atlas's: no re-simplification, and polygons stay cut at the antimeridian as Natural Earth has them. The `land` object is kept.

**Sovereign (playable).** The 193 UN members, plus `VAT` and `PSE`, make 195. mledoze marks Vatican City as a UN member; it is an observer, so the build takes mledoze `unMember` minus VAT, asserts 193, then adds VAT and PSE. Tuvalu is a UN member, but world-atlas 50m has no polygon for it. It is included with `inMap: false`, `bbox: null`, `labelLatLng` = its capital and `tiny: true`. Every other world.json feature is `sovereign: false` (47 of them). mledoze territories that world.json draws as part of another feature (French Guiana, Réunion, Svalbard and others) are not separate records.

**Names.** mledoze `name.common`, for example "Ivory Coast", "DR Congo", "Türkiye", "Czechia" and "Republic of the Congo". The lead may want display overrides.

**Capitals.** The capital name is mledoze `capital[0]`. Coordinates come from Natural Earth places for the same country code, matched by name, preferring "Admin-0 capital". Seven spellings are aliased: AND "Andorra", GRD "Saint George's", KIR "Tarawa", MNG "Ulaanbaatar", SMR "San Marino", PLW "Melekeok" (NE's point for Ngerulmud's state) and ESH "Laayoune". mledoze has no capital coordinates, so it cannot be the fallback the brief asked for. Wikidata (CC0) is used instead, for 21 records where NE has no point: NRU (Yaren District) plus 20 territories. HKG ("City of Victoria") has no match in either source and stays null.

Every sovereign capital point is within 15 km of a Wikidata capital, with one exception: Equatorial Guinea. mledoze says Malabo; Wikidata lists Ciudad de la Paz. The record keeps Malabo; the lead should decide.

**Main landmass** (`labelLatLng`, `bbox`, `tiny`):
1. The country's polygons are clustered by single linkage. Polygons whose nearest vertices are ≤ 300 km apart are one cluster.
2. The cluster containing the capital is the main landmass. If the capital point falls outside every polygon, the cluster nearest to it is used. With no capital, it is the cluster of the largest polygon.
3. `labelLatLng` = polylabel (pole of inaccessibility) of the largest polygon in that cluster. It is computed on a local azimuthal-equidistant projection, so high latitudes are not stretched.
4. `bbox` covers the whole cluster, with the minimal longitude interval. Fiji and Russia cross the antimeridian (`minLon > maxLon`). Antarctica is `[-180, -90, 180, -61.1]`.
5. Results: France → metropolitan France plus Corsica; USA → the contiguous states; Norway → mainland without Svalbard; Netherlands → European part; Malaysia → peninsula (Borneo's Malaysian part is the larger polygon, but the capital decides); Equatorial Guinea → Bioko plus Río Muni, labelled on Río Muni; Denmark → labelled on Jutland.
6. Antimeridian cases: New Zealand's Chatham Islands are about 840 km out and Kiribati's groups are about 1,000+ km apart, so neither main landmass crosses 180°. Kiribati's is the Gilbert group around Tarawa.
7. `tiny`: the main polygon's spherical area is below 2,500 km², or `inMap` is false.

**Borders.** mledoze, with three adjustments:
- Codes for territories that world.json merges into a parent are remapped. French Guiana → FRA, so Brazil and Suriname list France; Gibraltar → GBR.
- One verified error is removed: Sri Lanka–India. There is no land boundary, and the NE geometry agrees.
- The relation is made symmetric.

Disputed NE features (Somaliland, N. Cyprus, Siachen) are not added to sovereign states' borders. Three real borders are too small to appear in the 50m geometry but stay listed, because mledoze has them: Zambia–Botswana (Kazungula), Spain–Morocco (Ceuta and Melilla) and Spain–UK (Gibraltar).

**Island.** No land border, not Antarctica, and the main polygon is under 2.5 M km². Greenland counts; Australia (a continent) does not. Following the brief literally, island states that share an island with a neighbour are `false`: UK, Ireland, Indonesia, Haiti, Dominican Republic, Papua New Guinea, Timor-Leste. Relax the rule if "island hopper" should count them.

**Stats.** World Bank `mrnev=1` values, each with its own year:
- Population is 2025 for 194 states.
- Life expectancy is 2024 for 194 states.
- GDP is 2025 for 181 states, an older year for 12 (the oldest: CUB 2020, YEM 2018, SSD 2015, ERI 2011) and missing for 2.
- Null: VAT (all three), PRK (GDP) and Taiwan (no World Bank data).
- GDP is rounded to whole US$; life expectancy to 0.1 year.

`area` is mledoze's total area in km². Missing values are null, never 0.

**Tiers.** The rule and the resulting lists are in `TIERS.md`, generated from `tiers.mjs`: 63 / 67 / 65.

## Raster conventions

All rasters are equirectangular and 2:1. Pixel (0,0) is the north-west corner: lon -180, lat +90. Pixels are areas, so the centre of pixel x is at lon = -180 + (x + 0.5) · 360 / W.

- **`relief-{2k,4k,8k}.webp`**: `HYP_50M_SR_W` resampled with Lanczos3. WebP quality is binary-searched to the highest value (cap 95) under each budget: 2k q95 314 KB, 4k q95 1,101 KB, 8k q92 3,162 KB.
- **`relief-land-4k.webp`**: the same relief, with ocean blended to flat neutral `rgb(128,128,128)` by land-mask coverage. The mask is rendered at 8192×4096 and box-downsampled, so the coast edge is antialiased. Lakes inside country polygons stay as relief; the Caspian is ocean. No alpha channel: browsers can lose RGB under alpha 0 when uploading to WebGL.
- **`elevation-2k.png`**: 8-bit grey. `v = round(255 · sqrt(max(0, m) / 8848))`; decode with `m = 8848 · (v/255)²`.
  - Sampled from the Terrarium z4 mosaic (decode `R·256 + G + B/256 − 32768`), Web Mercator → equirectangular, bilinear, 3×3 supersampling per pixel.
  - Ocean, per the land mask, is 0. Land at or below sea level (for example the Caspian depression and the Dead Sea) is also 0.
  - The maximum sampled is 6,229 m. Zoom 4 (about 10 km pixels) plus 2k averaging flattens peaks: Everest reads about 6.2 km, not 8.8 km. Use exaggeration, not absolute heights.
  - North of 85.05° there is no data; it is all ocean, so 0.
  - South of −85.05° (Antarctic plateau) there are no tiles either. The last row is smoothed along longitude and blended to its mean (2,250 m) at the pole. This polar cap is synthetic.
- **`coast-sdf-2k.png`**: 8-bit grey. Over ocean, `v = clamp(round(km / 800 · 255), 1, 255)`; land = 0.
  - Distance is great-circle, exact on the sphere and wrapped at the antimeridian. It is measured from each 2k pixel centre to the nearest land/ocean edge midpoint of the 8192×4096 mask (217,142 edge points, 3D k-d tree).
  - Ocean is clamped to ≥ 1, so `v == 0` is an exact land mask at 2k. It matches elevation-2k: verify checks there is no ocean pixel with elevation > 0.
  - 1 unit ≈ 3.1 km. Lakes inside country polygons count as land, so they get no water lines.
- **Flags**: svgo preset-default (multipass). Each optimised flag is rasterised against its original; any visible difference would keep the original, and none did. The set saves 3%: flag-icons is already optimised. The largest is `rs.svg` at 175 KB (coat of arms).

## Known limits

- Tuvalu has no polygon in 50m world-atlas. It must be drawn as a pin target from `labelLatLng`.
- Kiribati, New Zealand, Chile, Ecuador and others have outlying islands outside their main bbox. Picking still works, because it uses all polygons in world.json.
- Hong Kong's capital is null. Macau, Antarctica and Heard Island have no capital in mledoze.
- The Equatorial Guinea capital (Malabo vs Ciudad de la Paz) needs a decision.
- Wikidata's NRU point is the Yaren District centroid, not a building.
- Terrain z5 would double elevation detail: 1,024 tiles, about 80 MB of cache, set with `TERRARIUM_Z` in `fetch.mjs`.
