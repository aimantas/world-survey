# Search layer

Makes every public URL of World Survey a real, indexable file and adds the files search engines and AI crawlers look for. It runs on a built `dist/` after the encyclopedia and reference steps and never touches the network. This folder is never shipped.

It reads four contracts and hard-codes no page count:

| Contract | What it gives |
| --- | --- |
| `src/routes.js` | `ROUTES` (title, description, h1, intro, `mode`, `region`, `noindex`), `REGION_SLUGS`, `REGION_COUNT`, `regionSlug()` |
| `src/game/course.js` | `buildCourse(countries)`: the lessons, each with `slug`, `path`, `region`, `group`, `name`, `number`, `iso3` |
| `src/game/modes.js` | `FLAG_PRESETS`, `CAPITAL_PRESETS`: which games a chooser route (`/flags/`, `/capitals/`) offers |
| `tools/reference/urls.mjs` | `LISTS`, `listPath()`, `comparePath()`, `comparePairs()`, `referencePaths()`: the `/lists/` and `/compare/` URLs |

## Run

```sh
node tools/seo/icons.mjs                 # once, and again only when assets/icon.svg changes: PNG/ICO icons into assets/icons/
PLAYWRIGHT_DIR=<node_modules with playwright> node tools/seo/og.mjs   # once, and again when data, flags, fonts or the card change: assets/og/<slug>.png
python3 build.py                         # encyclopedia, then reference, then the line below, then its checks
node tools/seo/build.mjs dist            # the search layer on its own
node tools/seo/verify.mjs dist           # checks; exit 1 on failure, warnings printed separately
node tools/seo/indexnow.mjs dist         # IndexNow dry run: prints the request, sends nothing
```

Scratch run without touching `dist/`:

```sh
rsync -a --delete --exclude 'elevation-18k-*' dist/ tools/seo/_out/
node tools/encyclopedia/build.mjs tools/seo/_out && node tools/seo/build.mjs tools/seo/_out
node tools/seo/verify.mjs tools/seo/_out && node tools/encyclopedia/verify.mjs tools/seo/_out
```

`_out/` is gitignored. The build is idempotent: it strips what it added before, so running it twice gives byte-identical files. `SOURCE_DATE_EPOCH` (seconds) pins the build date used in `<lastmod>` and `llms-full.txt`.

build.py must call it **after** it writes `robots.txt` (this step overwrites that file), after the reference step (the sitemap and `llms.txt` list what is in the folder) and before `check()`.

## What it writes

| File | Content |
| --- | --- |
| `index.html`, `<path>/index.html` | One shell per `ROUTES` entry, from `dist/index.html`: `<title>`, description, canonical `SITE + path`, Open Graph (with image size and alt), Twitter, `noindex,follow` where the route says `noindex`, one JSON-LD block, one Speculation Rules block, and a `<section class="seo-shell">` at the start of `<main id="panel">`. HTML comments are removed. The app replaces the panel on boot |
| `learn/<lesson>/index.html` | One shell per lesson of the course (39), indexable and self-canonical: "Western Europe 1: learn 4 countries · World Survey", a description naming the countries, the lesson's countries with flag, capital and a link to each country page, and links to the previous and next lesson, the region page and the course |
| `atlas/<slug>/index.html` | 195 shells, "Name on the globe · World Survey", `noindex,follow`, canonical to `/countries/<slug>/` (the encyclopedia page is the indexable one); `og:url` stays the atlas URL so a shared link previews as the atlas. Links to the country page, the region, the region's map quiz and the lesson that teaches the country |
| `sitemap.xml` | Indexable routes and lessons (lastmod = build date), the country pages the encyclopedia listed (their own lastmod kept) and, when `<dist>/lists/index.html` exists, every path from `referencePaths()` (lastmod = the data's date). Priority 1.0 home; 0.8 stand-alone games, choosers, `/learn/`, atlas and the country index; 0.7 games inside a chooser, region quizzes, region pages and lists; 0.6 countries and lessons; 0.5 about and the comparison index; 0.4 comparisons. Image entries: `og.png` for home, the flag for each country page. The HTML site map `/sitemap/` is listed too (0.5). 291 URLs without the reference pages, 619 with them; one file, and the build stops if it ever passes 5,000 |
| `sitemap/index.html` | The HTML site map: a static page (the country pages' chrome, no script of its own) with one link per sitemap URL, grouped as countries A to Z, regions, games, region quizzes, the course, lists and comparisons. Built from the same entries as `sitemap.xml`; `verify.mjs` fails if a sitemap URL is not linked, a link is not in the sitemap, or a page is linked twice. The home shell also lists all 195 country pages in its crawlable block |
| `robots.txt` | `User-agent: *` / `Allow: /`, then one `Allow: /` group each for Googlebot, Bingbot, DuckDuckBot, Applebot, OAI-SearchBot, ChatGPT-User, GPTBot, Claude-SearchBot, Claude-User, ClaudeBot, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended and CCBot; `Sitemap:` line. Nothing disallowed: noindex is handled per page |
| `llms.txt` | llmstxt.org format: H1, blockquote summary, a paragraph on coverage and URLs, then Game modes, Quizzes by region, Field course (`/learn/` and the five region pages), Country encyclopedia, Lists and Compare (only when built; descriptions read from the generated pages, plus one sentence on the comparison URL pattern), Data sources with licences, Optional. Target: under 15 KB (10.7 KB without the reference pages, about 14 KB with) |
| `llms-full.txt` | One line per country: name, official name, capital, region and subregion, population, area, GDP, life expectancy (each with year and source), land neighbours by name, page URL. From `data/countries.json` and `data/encyclopedia.json` |
| `manifest.webmanifest` | `id`/`start_url`/`scope` `/`, standalone, `#f4f5f0`, SVG + 192 + 512 + maskable 512 icons |
| `assets/icons/*`, `favicon.ico`, `apple-touch-icon.png` | Copied from `assets/icons/` (generated by `icons.mjs`); the two root copies answer the automatic `/favicon.ico` and `/apple-touch-icon.png` requests |
| `<key>.txt` | The IndexNow key file, from `indexnow-key.txt` (see below) |

### The crawlable block

```html
<section class="seo-shell">
<h1>…</h1>
<p>intro</p>
<h2>…</h2><ul class="seo-shell__list">…</ul>          <!-- only on pages that list something -->
<nav class="seo-shell__links" aria-label="…"><ul><li><a href="…">…</a></li>…</ul></nav>
</section>
```

It never contains a nested `<section>`, inline style or script. What sits between the intro and the links:

| Page | Content |
| --- | --- |
| `/play/find/<region>/`, `/play/name/<region>/` | `<h2>The 45 countries of Europe</h2>` and a `<ul class="seo-shell__list">` of links to `/countries/<slug>/` |
| `/play/capitals/<region>/` | The same list as "Capital, Country", sorted by capital |
| `/play/flagquiz/<region>/` | The same list with `<img src="/assets/flags/xx.svg" alt="Flag of …" width="24" height="18" loading="lazy">` before each name |
| `/learn/` | Per region an `<h2>` linking to the region page and an `<ol class="seo-shell__list" start="n">` of lessons, each "lesson link: its countries" |
| `/learn/<region>/` | That region's lessons, same form |
| `/learn/<lesson>/` | `<ul class="seo-shell__list seo-shell__list--lesson">`: flag (32×24, lazy), link to the country page, ", capital …" |

The rules for these classes live in `styles.css` (`.seo-shell h2`, `.seo-shell__list`, `.seo-shell__list--lesson`, `.seo-shell__list img`, `.seo-shell__links ul`), next to the existing `.seo-shell` rules.

### Route families and breadcrumbs

A chooser route is the parent of the games it offers (`/flags/` of the five flag games, `/capitals/` of the capital quiz and capital pin, `/higher-or-lower/` of its measures); a region quiz sits under its mode page; a region of the course under `/learn/`; a lesson under `/learn/` and then its region page. So `/play/capitals/europe/` is World Survey › Capitals › Capital pin › Capitals of Europe. A new chooser needs one line in `CHOOSERS` in `build.mjs` (the build stops and says so).

### Structured data

Home is a `WebSite` plus a `VideoGame` (no `SearchAction`, as there is no search URL). Every other shell is a `WebPage` that `isPartOf` the WebSite, plus a `BreadcrumbList`, plus:

| Page | Node |
| --- | --- |
| Routes with a `mode` (all of `/play/…`, the Higher or lower measures) | `Quiz` (`@id` `…#quiz`): `name`, `description`, `url`, `about`, `educationalUse: "self-assessment"`, `learningResourceType: "quiz"`, `isAccessibleForFree`, `inLanguage`, `author`, and `spatialCoverage` (a `Place`) where the route has a region |
| `/learn/` | `Course` (`@id` `/learn/#course`): `provider` (the Person "Aimantas"), `about`, `syllabusSections` (one `Syllabus` per region page) and `hasPart` (one `LearningResource` per lesson, with `position`) |
| `/learn/<region>/` | `Syllabus` that `isPartOf` the course, with `spatialCoverage` and the region's lessons as `hasPart` |
| `/learn/<lesson>/` | `LearningResource` (`@id` `…#lesson`): `learningResourceType: "lesson"`, `educationalUse`, `teaches`, `position`, `about` (the `Country` nodes of the country pages), `spatialCoverage`, `isPartOf` the course, `provider` |
| `/atlas/<slug>/` | `WebPage.about` points at the encyclopedia's `Country` node |

`verify.mjs` holds the list of types and, per type, the schema.org properties these builders may use; anything else fails.

### Speculation Rules

Every shell and every encyclopedia page carries the same inline `<script type="speculationrules">` (from `tools/encyclopedia/speculation.mjs`): `prerender`, eagerness `moderate`, for links to `/countries/*`, `/lists/*` and `/compare/*`; `prefetch`, eagerness `moderate`, for links into the game (`/` and each top-level section of `ROUTES`: `/play/*`, `/atlas/*`, `/learn/*` and the rest). The game is never prerendered: starting WebGL on a hover would cost more than it saves. The site's CSP (`script-src 'self' 'unsafe-inline'`) allows the inline block; browsers without the API ignore it.

## Share images

`og.mjs` draws one 1200×630 PNG per country into `assets/og/<slug>.png`: the flag, the name in the sheet's wide caps, capital and subregion, population (with its year) and area, and the country page's own locator map. A country with no population figure (Vatican City) gets no population cell. It is run by hand, like `icons.mjs`; `tools/encyclopedia/build.mjs` copies the images into the output and points each country page's `og:image` and `twitter:image` at its own file, with width, height and alt, whenever the file exists. Without the files the pages keep the site image.

The card is an HTML page rendered by headless Chromium through Playwright, because the fonts are variable woff2 files that sharp cannot load; the browser sets them exactly as the site does. Playwright is not a dependency of this project: point `PLAYWRIGHT_DIR` at any `node_modules` folder that has it. Every request the card makes is answered from `assets/` and anything else is refused, so the run needs no network. The screenshot is reduced to a palette PNG without dithering (quality 100, stepping down to 90 for the three busiest maps: Canada, China, Russia) so that every file is under 60 KB: 22 to 54 KB, 7.1 MB in all. Two runs on the same machine and browser build give byte-identical files; another Chromium version may anti-alias differently, so regenerate all 195 together rather than a few. `--only=PER,LIE --out=<dir>` renders a sample elsewhere to look at.

## IndexNow

`indexnow-key.txt` holds one 32-character hexadecimal key, generated once. It is not a secret: the protocol publishes it, and `build.mjs` writes it to `<dist>/<key>.txt` on every build. `indexnow.mjs` reads a built sitemap and prints the request it would send to `https://api.indexnow.org/indexnow`; it needs `--send` to send anything, and before sending it checks that the live site already serves the key. `--since=YYYY-MM-DD` limits the list to URLs whose `lastmod` is that day or later. Nothing in the build runs it. Submitting is the site owner's decision, after a deploy.

## Head tags the shell needs

`build.mjs` does not add these (they belong in `index.html`); `verify.mjs` warns until they are there:

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
```

## What verify checks

It passes with or without the reference pages; when `lists/` or `compare/` is in the folder, every path from `referencePaths()` must be there and is held to the page rules.

- **Contracts**: `REGION_SLUGS` names the five regions, `REGION_COUNT` matches the data, the course teaches each of the 195 once and its numbers and paths are in step.
- **Pages**: every route, lesson, atlas, encyclopedia and (when built) reference file exists; titles and descriptions are unique across all of them; canonical is right (self, or the country page for atlas shells); exactly one title, description, canonical and h1; noindex exactly where intended; no document-relative `src`/`href` or importmap entries.
- **Shells**: Open Graph and Twitter tags match the title and description; one JSON-LD block with the nodes above; breadcrumbs resolve and follow the families; one Speculation Rules block that prerenders the static sections only and prefetches the game only (tested with `URLPattern`); the crawlable block has the h1 and intro, no inline style, links that resolve; a region quiz lists exactly its region's countries (count from the data), "Capital, Country" for capitals, a sized lazy flag for flags; `/learn/` and its region pages list exactly the lessons of `buildCourse()` with their countries; a lesson lists its countries in order with flag and capital and links to the previous lesson, the next, its region page and the course.
- **Country pages**: 5 to 7 questions whose text equals the `FAQPage` JSON-LD exactly; one comparison link per sovereign land neighbour; a link to its lesson and to the region quizzes; the shared footer. Region pages link to their lessons, quizzes and every list.
- **Links**: every link to `/lists/` or `/compare/`, on any page and in `llms.txt`, is a member of `referencePaths()` and, when those folders are built, resolves; a country page that says it is on a list is linked back from that list page; no `?region=` anywhere in the HTML, text and XML this layer and the page generators write.
- **Site files**: every sitemap URL resolves to an indexable, self-canonical page and every indexable page is listed; lessons 0.6, lists 0.7, comparisons 0.4; home is the single highest priority; robots groups for `*` and the 15 crawlers, no `Disallow`; `llms.txt` sections in order, links resolve, every indexable route linked, size (warning over 15 KB, failure over 18 KB); `llms-full.txt` has one line per country, each figure with year and source; manifest fields and icon sizes; the IndexNow key file is served and matches; `assets/encyclopedia.css` opts in to view transitions and switches them off for reduced motion; share images exist and have the declared size.
- **Privacy**: private markers (`/Users/`, `localhost`, `127.0.0.1`, `@gmail`, plus any names you list in a file named by `AIMANTAS_PRIVATE_MARKERS`) in every text file outside `vendor/`; outbound hosts on an allowlist (aimantas.com, schema.org, sitemaps.org, the data sources).

Warnings: titles over 60 or descriptions outside 50-160 characters, the missing head tags above, document-relative asset strings in `src/`, reference pages whose footer differs from the encyclopedia's, `robots-sitemap.txt` left in the folder.

## Limits

- Pre-rendered shells give crawlers a title, description, h1, intro, lists and links for each route; the game itself still needs JavaScript and WebGL.
- `lastmod` on routes and lessons is the build date, so it moves on every build even when the text does not change.
- Whether Cloudflare's zone settings (managed robots.txt, AI crawler blocking) alter what crawlers receive is checked only by fetching the live `robots.txt` after a deploy.
- Speculation Rules and cross-document view transitions are Chromium features today; other browsers load the pages as before.
- `indexnow.mjs --send` has not been run. Its dry run is tested; the POST itself is not.
- Share images exist for country pages only. Region pages, the index, the route shells and the lessons use the site image `assets/og.png`.
