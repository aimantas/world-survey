# Third-party data, imagery and code

The World Survey source code is MIT licensed (see [LICENSE](LICENSE)). The files below come from other projects, keep their own licences, and need the credits listed here when you reuse them. The game's About screen shows the same list from `data/countries.json` → `sources`.

## Data

`data/countries.json`, `data/encyclopedia.json` and their copies in `ios/WorldSurvey/Resources/` combine the sources below. Because they include facts from mledoze/countries, they are a derivative database **made available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)**. If you publish a database derived from them, share it under the ODbL too and keep these credits.

| What | Source | Licence |
| --- | --- | --- |
| Names, codes, regions, area, borders, languages, currencies, UN membership | [world-countries 5.1.0 (mledoze/countries)](https://github.com/mledoze/countries) | ODbL 1.0 |
| Population, GDP, life expectancy and the encyclopedia indicators | [World Bank World Development Indicators](https://data.worldbank.org/) | CC BY 4.0 |
| Capital coordinates | [Natural Earth](https://www.naturalearthdata.com/) 1:10m Populated Places | Public domain |
| Capital coordinates where Natural Earth has none | [Wikidata](https://www.wikidata.org/) | CC0 1.0 |
| Country outlines (`data/world.json`, `ios/WorldSurvey/Resources/world.json`) | Natural Earth 1:50m Admin 0 via [world-atlas 2.0.2](https://github.com/topojson/world-atlas) | Public domain; packaging ISC ([data/LICENSE-world-atlas.txt](data/LICENSE-world-atlas.txt)) |
| Sea and ocean names | Natural Earth 1:50m Marine Areas | Public domain |

Statistics are the latest World Bank value for each country, so years differ between countries; a missing value is `null`, never zero.

## Imagery

| What | Source | Licence |
| --- | --- | --- |
| Relief (`assets/relief-*.webp`, `ios/WorldSurvey/Resources/globe.jpg`) | Natural Earth 1:50m Cross Blended Hypsometric Tints with Shaded Relief and Water | Public domain |
| Elevation (`assets/elevation-2k.png`, `assets/elevation-18k-*.png`) | [Terrain Tiles on AWS](https://registry.opendata.aws/terrain-tiles/) | Open data, attribution required: "GMTED2010 terrain data courtesy of the U.S. Geological Survey; ETOPO1, U.S. National Oceanic and Atmospheric Administration." See [joerd attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md) |
| Flags (`assets/flags/*.svg`, `ios/WorldSurvey/Assets.xcassets/Flags`) | [flag-icons 7.6.0](https://github.com/lipis/flag-icons) | MIT ([assets/flags/LICENSE.txt](assets/flags/LICENSE.txt)) |

## Fonts

Archivo, Source Serif 4 and JetBrains Mono, SIL Open Font License 1.1. The licence texts are in `assets/fonts/`.

## Code

| What | Where | Licence |
| --- | --- | --- |
| three.js r170 | `vendor/three/` | MIT ([vendor/three/LICENSE](vendor/three/LICENSE)) |
| topojson-client | `vendor/topojson/` | ISC ([vendor/topojson/LICENSE](vendor/topojson/LICENSE)) |

The data tools in `tools/` install their own npm dependencies (`tools/package.json`); none of them ship in the game.
