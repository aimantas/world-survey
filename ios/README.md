# World Survey for iPhone

A native iOS version of World Survey (https://geography.aimantas.com). SwiftUI for the interface, SceneKit for the relief globe. It reuses the web game's country table, outlines, flags, field course and scoring rules, so both teach the same things the same way. It is in TestFlight now; tell me what it needs before the App Store version by opening an issue.

## What's in it

The app opens on four tabs along the bottom margin, with the globe above the panel on each:

| Tab | What it holds | The globe |
| --- | --- | --- |
| Play | Countries surveyed with a bar per region, day streak, medals and lessons (taps through to Progress); today's daily expedition beside the next step (countries due for review, else the next lesson); region and level chips that every game uses and that are kept between launches; six game tiles with your best at that region and level | Turns to the chosen region, or spins slowly for World |
| Learn | The field course: progress, the next lesson with its flags and a Start button, review if anything is due, then all 39 lessons by region | Frames the next lesson's countries with their names |
| Atlas | Search by country or capital, and the survey card of the selected country | Interactive |
| Progress | World surveyed by region, the week, saved records, field notes, and the 20 medals with the earned ones first | Whole globe, surveyed land in colour |

On every tab a tap on a country opens it in the Atlas. Find it, Name it and Streak start from their tile at once; Capitals, Flags and Higher or lower open a picker of their games or measures, and one tap starts. A game hides the tab bar; leaving it (back, Done or Again) returns to the tab it was started from.

| Game | How you answer |
| --- | --- |
| Find it | Tap the named country on the globe. A wrong tap scores by distance to the right one |
| Name it | The globe marks a country; pick its name from four |
| Flag quiz, Lookalike flags | A flag and four names. Lookalikes draws wrong answers from the 25 hand-picked groups |
| Flag hunt | A flag; tap its country on the globe |
| Capital quiz | A country and four capitals |
| Capital pin | Tap where the capital is; 1,000 within 25 km, 0 at 2,500 km |
| Higher or lower | Mixed, Population, Area, Economy, Life expectancy, Density or Neighbours; one miss ends it |
| Streak | Mixed rounds, multiplier up to ×5, one life |
| Daily expedition | Five seeded rounds, the same countries the website asks that UTC day, with a share grid |
| Field course | The site's 39 lessons: study cards, then find and name each country; a miss is asked once more |
| Review | Missed countries come back after ten minutes, a day, three days and two weeks |
| Atlas | Tap or search any country for its survey card, capital pin and neighbours |

After each answer the next country comes up by itself after three seconds; a rule drains along the bottom of Next while it waits. Touching or scrolling the card, touching the globe, opening a sheet or leaving the app keeps the card up until Next. The last round always waits for Results, it is off while VoiceOver is running, and Settings has a switch for it ("Next country by itself"). The web game does the same.

Around the games: the survey itself (land you have answered correctly prints in colour, the rest stays pale), mastery per country, records, a day streak, 20 medals, a results report with a rank stamp and the route drawn on the globe, practice of the countries just missed, kilometres or miles, sound and haptics. Progress is one record in UserDefaults. No account, no network calls, no analytics.

Not ported from the web: Flag match, Flag blitz, challenge links, the Hard mode typing input, the compass hint, on-globe country lettering for every country, and the encyclopedia pages (the answer card links to the country's page on the site instead).

## Run it

```bash
xcodegen generate
```

```bash
xcodebuild -project WorldSurvey.xcodeproj -scheme WorldSurvey -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build build
```

```bash
xcodebuild -project WorldSurvey.xcodeproj -scheme WorldSurvey -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath build test
```

Or open `WorldSurvey.xcodeproj` in Xcode and run. `project.yml` is the source of the project file. Bundle id `com.aimantas.WorldSurvey`, iPhone only, portrait, iOS 18 or later, Swift 6 with main-actor default isolation.

## Layout

```
project.yml            XcodeGen spec
tools/build-globe.py   bakes Resources/globe.jpg (8192 × 4096)
tools/build-data.mjs   writes Resources/*.json, the flag PNGs and the app icon
WorldSurvey/
  App/       app entry, AppModel (screens, starting games), Feedback (synthesized sound, haptics), DebugDriver
  Model/     Country, WorldData (table + outlines + course), TopoJSON reader, ProgressState/Store, Geo
  Game/      GameSession (one game from first question to results), Questions, Scoring, Daily, Medal, Rand
  Globe/     GlobeController (scene, camera, gestures, picking, marks), geometry and art builders, GlobeView
  UI/        RootView, then Home, Play, Results, Atlas, Course, Progress and shared Components
  Resources/ countries.json, world.json, course.json, globe.jpg (all generated)
WorldSurveyTests/      rules, data, daily seed, progress and distractor tests
```

Generated files are rebuilt from the web game's sources one folder up:

```bash
python3 tools/build-globe.py
```

```bash
node tools/build-data.mjs
```

`build-data.mjs` uses `sharp` from `../tools/node_modules` and imports `../src/game/course.js` and `lookalikes.js` directly, so lessons and lookalike groups cannot drift from the site.

## How the globe works

- One unit sphere with the baked texture: Natural Earth relief on land, flat survey blue at sea with a pale shelf and four water lines from the coast distance field. The land mask is drawn from the same outlines the app draws as lines, so paint and line work agree.
- Coast, borders, the graticule, highlight outlines and arcs are ribbons. Each vertex sits on the centre line and a geometry shader modifier pushes the two sides apart, so a line keeps its width in points at any zoom.
- A highlighted country is a patch of sphere over its bounding box, textured with a fill drawn in Core Graphics (tint plus diagonal hatching for answers).
- The pale plate over unsurveyed land is one 2048 × 1024 overlay redrawn when a country is first answered correctly.
- Pins, rings for small states, place labels and the distance label are camera-facing quads kept at a constant size in points.
- The camera orbits a still globe, north up. The focus point follows the middle of the free band between the masthead and the bottom panel, and whatever the game framed is re-framed when the panel changes height.
- Picking is a ray against the unit sphere, then point-in-polygon in longitude and latitude. Outlines are unwrapped across the antimeridian first: world-atlas stitches them, so Russia and Fiji would otherwise be wrong where they cross it. The 29 small states also count when their ring is within 26 points of the tap, and the round's target wins a tie.

## Checking a screen from the command line

Debug builds read a launch argument and jump to a named state (`App/DebugDriver.swift`). `-wsReset YES` clears saved progress first; `-wsAutoNext NO` turns auto next off (it is saved, like the switch in Settings).

```bash
xcrun simctl launch booted com.aimantas.WorldSurvey -wsDemo find-miss
```

States: `find-ask`, `find-miss`, `find-hit`, `name-ask`, `flag-ask`, `flag-miss`, `flaghunt-ask`, `capital-ask`, `pin-miss`, `hl-ask`, `hl-right`, `results`, `daily`, `atlas`, `atlas-pick` (a globe tap on the Play tab opening Kenya in the Atlas), `lesson`, `lesson-card`, `tab-learn`, `tab-progress`, `region-europe`, `region-world`, `settings`, `setup-flags` and `setup-hl` (the game pickers), `auto-test` (logs auto next: moves on at 3 s, held by a touch and by a globe drag, last round waits; all passed on 14 November), `pick-test` (logs projected-and-picked places; all six read back the right country at 0 km error on 14 November).

## What was checked, and what was not

Checked on 14 November 2026 in the simulator: every state above by screenshot at the default text size; the four tabs at an accessibility text size; real touch on the tab-era home: scrolling the Play tab, a tile starting its game and back returning to the Play tab; home, a missed round, a question and a lesson at an accessibility text size; real touch on the home screen, the setup sheet, a drag and a pinch on the globe; the daily expedition asks Hungary, Jordan, Mongolia, Costa Rica and Zimbabwe for 2026-11-14, the same five the site's code returns. Screenshots are in `screenshots/`.

Not checked: a physical iPhone (frame rate, memory, haptics, sound by ear), VoiceOver, iPad (the target is iPhone only for that reason), landscape, and a full hand-played game from the first tap to the results (the scripted run covers the logic, not the touch path).

## Honest limits

- The globe texture is an 8192 × 4096 JPEG decoded at launch. In the simulator the launch peak was 436 MB and the settled footprint 56 MB, but the simulator does not count GPU texture memory; on a phone expect roughly 180 MB for the texture and its mipmaps. An ASTC texture set would cut that to about a quarter.
- Zoomed in on a small country the relief is still soft; the line work stays crisp. Small states are framed with their surroundings for that reason.
- Find it, Flag hunt and Capital pin cannot be answered with VoiceOver: they need a tap on a map. The four-option games can.
- Statistics are the latest World Bank values per country, so years differ. Boundaries are Natural Earth 1:50m de facto lines.
- Numbers follow the device's region (decimal comma, grouping); the text is English only.
- To run on a device or upload, set `DEVELOPMENT_TEAM` in `project.yml` and `teamID` in `Config/ExportOptions-Upload.plist` to your own team, and change the bundle ID.
