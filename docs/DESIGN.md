---
name: World Survey
description: A 3D geography game printed as a national survey map sheet. Survey Relief Atlas, seed a0a56610.
colors:
  paper: "#f4f5f0"
  paper-deep: "#e9ece3"
  card: "#fbfcf8"
  mat-white: "#ffffff"
  ink: "#1b232b"
  ink-2: "#48525c"
  ink-3: "#5f6870"
  hair: "rgba(27, 35, 43, 0.16)"
  overprint: "#c3177b"
  overprint-deep: "#a10f63"
  overprint-soft: "rgba(195, 23, 123, 0.09)"
  surveyed: "#3e7a45"
  surveyed-soft: "rgba(62, 122, 69, 0.12)"
  contour: "#8a5a33"
  water: "#a9d2e4"
  water-ink: "#2a6893"
  water-line: "#5d9cc0"
  graticule: "#4f8fbd"
  boundary: "#5b3654"
  plate-lo: "#bfc3c0"
  plate-hi: "#e4e6e1"
  ice-lo: "#adbecb"
  ice-hi: "#cad6de"
typography:
  wordmark:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 760
    lineHeight: 1
    letterSpacing: "0.2em"
    fontVariation: "'wdth' 125"
  display:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(24px, 2.3vw, 31px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 125"
  display-sheet:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "clamp(30px, 5.2vw, 60px)"
    fontWeight: 720
    lineHeight: 1.02
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 125"
  place:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "42px"
    fontWeight: 680
    lineHeight: 1.04
    letterSpacing: "0.12em"
    fontVariation: "'wdth' 125"
  place-list:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "14.5px"
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: "0.12em"
    fontVariation: "'wdth' 112"
  stamp:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 820
    lineHeight: 1
    letterSpacing: "0.22em"
    fontVariation: "'wdth' 125"
  banner:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "38px"
    fontWeight: 860
    lineHeight: 1
    letterSpacing: "0.14em"
    fontVariation: "'wdth' 125"
  label:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 640
    lineHeight: 1.2
    letterSpacing: "0.09em"
    fontVariation: "'wdth' 68"
  control:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 680
    lineHeight: 1.2
    letterSpacing: "0.16em"
    fontVariation: "'wdth' 80"
  body:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: "'wdth' 100"
  prose:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.62
    fontVariation: "'wdth' 100"
  lede:
    fontFamily: "Source Serif 4 Variable, Source Serif Pro, Georgia, serif"
    fontSize: "17px"
    fontWeight: 420
    lineHeight: 1.3
  note:
    fontFamily: "Source Serif 4 Variable, Source Serif Pro, Georgia, serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  measure:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.15
    fontFeature: "'tnum'"
  score:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1
    fontFeature: "'tnum'"
  coord:
    fontFamily: "JetBrains Mono Variable, JetBrains Mono, ui-monospace, Menlo, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.04em"
  globe-country:
    fontFamily: "Archivo Variable, Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 680
    lineHeight: 1
    letterSpacing: "0.22em"
    fontVariation: "'wdth' 125"
  globe-ocean:
    fontFamily: "Source Serif 4 Variable, Source Serif Pro, Georgia, serif"
    fontSize: "14px"
    fontWeight: 420
    lineHeight: 1
    letterSpacing: "0.32em"
rounded:
  none: "0px"
  key: "2px"
spacing:
  frame: "clamp(10px, 1.5vw, 22px)"
  frame-narrow: "7px"
  gutter: "clamp(14px, 1.6vw, 24px)"
  gutter-narrow: "10px"
  panel-width: "min(500px, 40vw)"
  panel-pad: "18px"
  panel-pad-narrow: "13px"
  stack: "14px"
  stack-narrow: "11px"
  option-gap: "8px"
  sheet-max: "1240px"
  measure: "68ch"
components:
  titleblock:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "{spacing.panel-pad}"
    width: "{spacing.panel-width}"
  titleblock-head:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    padding: "9px 16px 8px"
  titleblock-cell:
    textColor: "{colors.ink}"
    typography: "{typography.measure}"
    padding: "7px 12px 8px"
  button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "11px 20px 10px"
    height: "46px"
  button-hover:
    backgroundColor: "{colors.overprint-soft}"
    textColor: "{colors.overprint-deep}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.none}"
    padding: "11px 20px 10px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.overprint}"
    textColor: "{colors.mat-white}"
  button-go:
    backgroundColor: "{colors.overprint}"
    textColor: "{colors.mat-white}"
    typography: "{typography.control}"
    padding: "11px 16px 10px"
    height: "46px"
  button-go-hover:
    backgroundColor: "{colors.overprint-deep}"
    textColor: "{colors.mat-white}"
  option:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
    height: "52px"
  option-hover:
    backgroundColor: "{colors.overprint-soft}"
  option-right:
    backgroundColor: "{colors.surveyed-soft}"
    textColor: "#22532a"
  option-wrong:
    textColor: "{colors.overprint-deep}"
  segmented:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    padding: "8px 9px 7px"
    height: "36px"
  segmented-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  index-row:
    textColor: "{colors.ink}"
    typography: "{typography.place-list}"
    padding: "11px 6px 11px 18px"
  index-row-hover:
    backgroundColor: "{colors.overprint-soft}"
  typed-input:
    backgroundColor: "{colors.mat-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 14px"
    height: "48px"
  stamp:
    backgroundColor: "{colors.card}"
    textColor: "{colors.surveyed}"
    typography: "{typography.stamp}"
    padding: "6px 11px 5px"
  stamp-miss:
    textColor: "{colors.overprint}"
  stamp-rank-low:
    textColor: "{colors.contour}"
  score-pop:
    backgroundColor: "{colors.card}"
    textColor: "{colors.surveyed}"
    padding: "5px 8px 4px"
  streak-banner:
    textColor: "{colors.overprint}"
    typography: "{typography.banner}"
    padding: "10px 26px 9px"
  meter:
    textColor: "{colors.ink}"
    padding: "6px 10px 7px"
  icon-button:
    textColor: "{colors.ink}"
    size: "40px"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    padding: "4px 9px 3px"
  keycap:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.key}"
    padding: "2px 5px 1px"
  arc-label:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.overprint}"
    rounded: "{rounded.key}"
    padding: "3px 6px"
---

# Design System: World Survey

## Overview

**Creative North Star: "The Survey Sheet"**

Every screen is one printed national survey map sheet: cool map paper, black ink, a zebra neatline with coordinate ticks, a ruled title block in the bottom-left corner, marginalia in the bottom-right. The 3D globe is the map printed on that sheet, a hand-shaded hypsometric relief with water lines, dash-dot boundaries and a graduated degree ring. The UI is never a layer floating over a scene; it is the sheet's own furniture. The question lives in the title block, the legend explains the marks, the scale bar measures the world.

Colour is reserved for meaning, the way a survey printer reserves plates. Ink does the structure. Magenta overprint is the player's hand: guesses, arcs, distances, the active control, a miss. Green is the surveyor's approval: correct answers and countries you have surveyed. Blue belongs to water and to the italic serif voice. Land prints grey until you survey it, then prints in full colour, so the player's own map fills in as they learn.

Density is that of a well-set map sheet: small, tracked caps, hairline rules, measurements in mono, generous paper around the globe. It refuses the quiz-card grid with a flag on top and the glowing space Earth. The encyclopedia pages (`assets/encyclopedia.css`) are read mode on the same sheet: same tokens, same neatline, same title block, a static SVG map in place of the globe.

**Key Characteristics:**
- Light, flat print on cool paper (`#f4f5f0`); never cream, never dark, never space.
- Three type families with fixed jobs: Archivo caps for lettering and labels, Source Serif 4 italic for water and notes, JetBrains Mono for every measure.
- Square corners, hairline and double rules, one soft lift under the title block.
- Magenta overprint for the player, green stamp for surveyed, ink for answers.
- Motion behaves like print: the sheet turns, letters settle, stamps press once and stay, the camera flies great circles.

## Colors

A survey printer's plate set: one ink, one overprint, one approval green, water blues, and a grey base plate for land not yet surveyed.

### Primary
- **Survey Ink** (`{colors.ink}`): all structure. Neatline, title-block rules, borders, body text, the answer outline and hatching on the globe, capital triangles, the north arrow, the primary button fill. Secondary ink (`{colors.ink-2}`) carries labels, nav and meta; tertiary ink (`{colors.ink-3}`) carries years, sub-lines, leaders and bullets.

### Secondary
- **Magenta Overprint** (`{colors.overprint}`): the player's marks and the active control only. Guess pins, great-circle arcs and their distance labels, the ring index mark, focus outlines, hover states, the miss stamp, the streak banner, a low timer, "New best". Deep overprint (`{colors.overprint-deep}`) is magenta text on a soft-magenta hover; soft overprint (`{colors.overprint-soft}`) is every hover wash.

### Tertiary
- **Surveyed Green** (`{colors.surveyed}`): correct and surveyed. The SURVEYED stamp, the meter count and fill, region bars, correct-option border, correct globe fill, the cell bump, the round-list tick. Correct outlines on the globe use a deeper green (`#2f6537`) and correct-option text `#22532a` for contrast.
- **Contour Brown** (`{colors.contour}`): the near-miss. Score pops that earned partial points, the half-filled "close" round mark, the two lowest rank stamps.

### Neutral
- **Map Paper** (`{colors.paper}`): the sheet ground, label knockouts, line halos on the globe, text on ink.
- **Card** (`{colors.card}`): title block, buttons, options, toasts, stamps. One step lighter than paper so the block reads as pasted on.
- **Paper Deep** (`{colors.paper-deep}`): image placeholders behind flags.
- **Mat White** (`{colors.mat-white}`): the mat inside flag frames, typed inputs, text on magenta.
- **Hairline** (`{colors.hair}`): row dividers, timer tracks, inner seg dividers, faint borders.
- **Survey Blue** (`{colors.water}`) and **Water Ink** (`{colors.water-ink}`): ocean fill, and the blue voice for serif ledes, ocean names, small-print links and coastlines.
- **Base Plate** (`{colors.plate-lo}` to `{colors.plate-hi}`): unsurveyed land, mixed by relief luminance.
- **Boundary Violet** (`{colors.boundary}`): dash-dot international boundaries on the globe and in the legend. Drift: the encyclopedia's `--boundary` is `#5b4762`; reconcile to the globe value.

### Named Rules
**The Plate Rule.** Magenta means the player did it; green means the surveyor approved it; ink means it is the answer or the structure. No colour is used decoratively, and no fourth accent is introduced.

**The Grey Plate Rule.** Land the player has not surveyed prints grey; surveyed land prints in hypsometric colour by mastery (mix levels 0, 0.72, 0.88, 1). Colour on the globe is earned.

## Typography

**Display / Label Font:** Archivo Variable, width axis 62–125% (fallback Helvetica Neue, Arial)
**Note Font:** Source Serif 4 Variable, italic only (fallback Georgia)
**Measure Font:** JetBrains Mono Variable (fallback ui-monospace, Menlo)

**Character:** Map lettering. Wide, tracked caps name places the way a cartographer letters a country across its territory; condensed caps sit in the title-block cells like printed form labels. The blue italic serif is the hand annotation and the water. Every number is mono and tabular.

### Hierarchy
- **Wordmark** (760, 15px, 125% width, 0.2em): "World Survey" beside the globe mark.
- **Display** (700, clamp(24px, 2.3vw, 31px), 1.05, 125%, 0.1em): the home h1 "Survey the world". The encyclopedia h1 is the same voice larger (720, clamp(30px, 5.2vw, 60px)), stepping its width down to 112% and 100% for long names on phones.
- **Place** (680, 42px base, 1.04, 125%, 0.12em, balanced wrap): the place being asked for. Size steps with name length: ≤9 chars 42px, ≤13 ×0.84, ≤18 ×0.7, ≤26 ×0.6, longer ×0.5 (30px base on phones). The verb ("Find", "Pin") sits inside at weight 360 in secondary ink with 0.08em tracking. In the reveal the place drops to 26px max (22px on phones).
- **Place list** (680, 14.5px, 112%, 0.12em): mode names in the sheet index, neighbour names and pager names in the encyclopedia. Higher-or-lower names use 118% at 15px, 0.1em.
- **Section head** (encyclopedia, 700, 15px, 118%, 0.2em, 1.5px ink rule under).
- **Label** (640, 10–13.5px, 68% width, 0.09em, caps): title-block head (12.5px), cell and fact terms (11px), field labels (11.5px), segmented buttons (13px), nav (13.5px), meter label, region terms, toast titles.
- **Control** (680, 13.5px, 80% width, 0.16em, caps): buttons, text links (12px), region links in the encyclopedia (12px, 0.14em).
- **Body** (400, 15px/1.5; 14px on phones): hints, verdicts, blurbs. Encyclopedia prose 17px/1.62 at a 68ch measure; game prose 14.5px/1.55 at 62ch.
- **Lede** (serif italic 420, 17px/1.3, water ink): the question as a sentence ("Whose flag is this?"), the subregion under a revealed name, the "or" in higher or lower, the encyclopedia deck.
- **Note** (serif italic 400, 12–14px, tertiary ink): years, small print, legend labels (secondary ink), figure captions, colophon.
- **Measure** (mono 600, 17px, tabular): cell values. Points 700 at 26px (40px summary, clamp(40px, 4vw, 54px) results hero). Distances 650 13px in magenta. Coordinates and scale 500 at 10–11px. Keycaps 600 10.5px. Tags 650 9.5px caps.

### Named Rules
**The Two Caps Voices Rule.** Caps come in two voices. Wide (125%, generous tracking 0.1–0.22em) is for names: places, the wordmark, h1, stamps, the streak banner, globe country labels. Condensed (68%, 0.09em) is for labels: anything that names a field rather than a place. Controls sit at 80% / 0.16em. Do not add other widths; list-size place names may step down to 112–118% only to fit. Drift: `assets/encyclopedia.css` still sets its labels at 76% / 0.18em; the game's 68% / 0.09em is the rule.

**The Letter Settle Rule.** A new place name arrives tracked out at 0.34em and settles to its resting tracking over 0.7s, like lettering being placed on the sheet.

**The Mono Measure Rule.** Every count, score, distance, coordinate, time and scale fraction is JetBrains Mono with tabular figures. Prose never carries a raw number in the sans.

## Layout

**Desktop.** The sheet is fixed full-bleed with no page scroll. The neatline is inset by the frame (clamp(10px, 1.5vw, 22px)); the globe stage sits 10px inside it. The masthead runs along the top inside the gutter: wordmark and nav left, survey meter and sound button right. The title block anchors bottom-left at min(500px, 40vw), never taller than the viewport minus the frame and 110px; its body scrolls, its head and cells do not. Marginalia (legend, scale bar, representative fraction, north arrow) anchor bottom-right; toasts drop in top-right under the masthead. The globe disc is 0.86 of the smaller free dimension and re-centres into the area the title block leaves free, shifted right in proportion to the block's height.

**Rhythm.** Title-block body padding 18px, children stacked 14px apart, option grids 8px gaps, ruled rows 11px vertical padding. Masthead items and marginalia sit on translucent paper pads (90–92%) so ink stays legible over relief.

**Phones (≤760px).** Frame 7px, gutter 10px. Zebra strip 3px with 30px segments; the bottom-right coordinate hides. Nav hides; wordmark 11.5px at 0.14em; meter compacts, and drops its label at ≤400px; icon button 36px. The title block docks as a bottom sheet: full width less 8px each side, above the safe-area inset, max 54% of the height. The globe centres in the band between the masthead (56px) and the block's top. Marginalia hide entirely. Place base 30px, options 46px tall, settings stack to one column, segmented buttons 11px at 0.08em, medals one column, secondary facts collapse behind "More facts", the stamp moves onto the flag's corner, the streak banner centres at 16% from the top.

**Encyclopedia.** Scrolling page inside a fixed neatline whose paper casing masks content outside the frame. Content max 1240px, inner padding frame + clamp(16px, 3.2vw, 44px). At ≥1100px a main column plus a 340px side card (52px column gap, 34px row gap); below, one column. At ≤640px the title-block cells go two-up, the comparison table restacks as labelled rows, and map label sizes rise because the SVG scales down.

## Elevation & Depth

Flat print. Depth comes from rules, paper knockouts and the globe's own relief, not from shadows. The title block is the single lifted object; everything else is printed on the sheet.

### Shadow Vocabulary
- **Title block lift** (`box-shadow: 0 18px 40px -24px rgba(27, 35, 43, 0.45)`): only under the game's title block, as if the block were a pasted-on label.
- **Paper pad** (`box-shadow: 0 0 0 6px rgba(244, 245, 240, 0.9)`): extends a translucent paper knockout around masthead items; not a shadow, a halo.
- **Globe paper shadow** (shader): a soft `#2b3a4a` shadow at 16% offset down-right of the disc, consistent with the upper-left light.

The sheet itself carries a faint fractal paper grain (5% ink alpha) and a white light pool behind the globe (radial at 62% / 46%). Both live on the paper ground only; the encyclopedia is flat paper.

The build also carries hard 1–2px offset shadows (an ink `0 1px 0` under flag frames, a `0 2px 0` drop under the encyclopedia locator inset). They are defects to remove, not part of this vocabulary.

### Named Rules
**The Double Rule.** Raised furniture is marked by a double rule, not a shadow: a 1.5px ink border plus a 1px ink outline at 3px offset (2px on toasts and phones). Title block, toasts, encyclopedia blocks and the map frame use it.

## Shapes

Square corners everywhere (0px). The only radius is 2px, on keycaps and the globe's arc distance label. Borders are ink: 1px for rows, cells, options and inputs; 1.5px for buttons, title block and typed input; 2–3px only for stamps and the streak banner. Recurring silhouettes are cartographic: the benchmark triangle (9×8px clip-path) as bullet, streak pip and capital mark; the surveyor's target (circle and cross) as the player's mark; the zebra neatline; the dotted leader that runs from a name to its number; 45° hatching for answers and misses.

## Components

### Neatline
The sheet's frame. A 1px ink border at the frame inset, a zebra strip inside it (5px wide, 46px alternating ink segments, offset corners), and a 1px inner rule. Two mono coordinates (10px, secondary ink) sit on paper knockouts on the top-left and bottom-right rules, 64px from the corners, and re-label as the globe turns. The encyclopedia neatline is fixed and adds paper casing outside so scrolled content never shows past it.

### Title Block
The one panel every screen renders into. Card ground, double rule, title-block lift.
- **Head row:** label voice 12.5px; left the sheet name (or a back button with a 14px chevron), right meta in secondary ink. 1px ink rule under.
- **Body:** scrolls; sticky action rows at the bottom fade content under them with a 24px card gradient.
- **Cells:** a ruled row of equal columns along the bottom, 1px ink dividers. Term in label voice 11px; value in measure voice. Hot values print magenta; a gained value bumps (scale 1.16, green, 0.45s). Timer track 3px hairline with an ink fill that turns magenta when low. Streak pips are benchmark triangles: hairline, ink when earned, magenta and scaled 1.25 when hot.
- **Tone:** the block's border turns green on a correct reveal and magenta on a miss (0.3s).
- **Sheet turn:** the old block lifts off as a ghost (0.28s, cubic-bezier(0.4, 0, 1, 1), down 10px, scale 0.985, 1.5px blur); the new head enters over 0.38s, body children over 0.46s staggered 40ms to a 200ms cap, cells at 0.1s delay, each from 15% opacity and 9px down on the out-expo ease `cubic-bezier(0.16, 1, 0.3, 1)`. Place names also letter-settle.

### Buttons
- **Shape:** square, 1.5px ink border, 46px minimum height, 11px 20px 10px padding, control voice, 16px stroke icon at 10px gap.
- **Default:** card fill, ink text. Hover: soft magenta wash, magenta border, deep-magenta text. Active: down 1px.
- **Primary:** ink fill, paper text; hover becomes solid magenta with white text. Used for the one action that starts play ("Start", "Play again", "Share result").
- **Go (encyclopedia):** solid magenta, the single link from a read page back into play; hover deep magenta.
- **Text link:** control voice 12px, 1px underline at 3px offset, secondary ink, magenta on hover.
- **Icon button:** 40px square (36px on phones), translucent paper, 1px ink border, 20px stroke icon. Sound off swaps the waves for a magenta cross.

### Options
Multiple-choice answers in a two-column grid, 8px gap. Card, 1px ink border, 52px minimum, a mono keycap number on the left, 15px body at 580. Hover: soft magenta and magenta border. After answering: right is green border with a 1px inset, soft green fill and dark green text; wrong is magenta border, deep-magenta text and a 45° soft-magenta hatch (6px bands); the rest dim to 45%. Flag options use an auto-fill grid (min 118px) with the keycap pinned top-left over the flag.

### Segmented Control and Fields
A 1px ink box; buttons in label voice 13px, divided by hairlines. Pressed is solid ink with paper text. Field labels sit above in label voice 11.5px. Typed answers and search are white, 1.5px ink border, 48px tall; focus is a 2px magenta outline; suggestions hang below in a ruled white list with a soft-magenta selected row.

### Index Rows (the sheet index)
The home screen's list of modes, ruled with hairlines. Each row: a benchmark-triangle bullet (tertiary ink; magenta and scaled 1.3 on hover), the mode name in place-list voice, a 1.5px dotted leader running to the best score in mono with a chevron, and a 13.5px blurb beneath. Hover washes the row soft magenta. Preset rows add a mono tag (magenta border; water-ink for globe presets) and a flag strip of overlapping 30×22px flags.

### Next-up Strip, Week Strip and Lesson List
The field course sits on the home sheet as one ruled strip (1px ink, paper ground) above the settings: the course row on the left (magenta bullet, a mono "Start here" or "Next" tag, lessons done in mono, the next lesson's countries on at most two lines) and, only when countries are due, a ruled cell on the right with the label-voice word "Review" over the count in magenta mono. Under the daily line, the week strip prints one 18px box per day with its initial in mono: surveyed green once played, today ringed in magenta until it is, followed by the streak in mono. It appears only after the first finished game. A lesson's overview lists its countries as ruled rows: a 40×30px flag, the name in place-list voice and the capital in serif italic water-ink, each row a way into that country's study card. Study cards reuse the reveal card (flag, name, one locating sentence, facts) with a square Back button beside the primary Next.

### Stamp
The verdict, pressed onto the title block's top-right corner and left there. 2px border in the verdict colour, card ground, stamp voice. SURVEYED is green and rotated −9°; MISSED or TIME is magenta at +7°; a first-time survey adds a small mono "New" tab in green. It lands with one press: 0.42s from 1.9× scale and extra rotation, overshooting to 0.94 at 55%, on `cubic-bezier(0.2, 1, 0.3, 1)`. Rank stamps on the results sheet (Apprentice to Chief cartographer) print contour brown for the two lowest ranks and take a 3px border at the top rank. The stamp owns its corner: headings beside it are padded clear (128px). On phones it shrinks to 10.5px and lands on the flag's corner.

### Score Pop
Mono 760 at 20px on a card chip with a 1.5px border in its colour, launched from the pin's projected screen position. It springs up to 1.08, drifts upward and fades over 1.4s. Green for full points, contour brown for partial, magenta for a miss or a time penalty.

### Streak Banner
At streak milestones (3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100), a magenta overprint stamp lands over the globe: a 3px magenta border, card at 82% with multiply blend, rotated −6°, the count as a word in banner voice ("Five"), "in a row" in serif italic beneath. It presses in from 2.1× and fades after 1.6s. On phones it centres and drops to 28px.

### Survey Meter
Top-right in the masthead, linking to medals. 1px ink box on translucent paper: label "Surveyed", mono count with the surveyed number bold green, and a 5px bar with a green fill over ink ticks every 10%. The fill eases over 0.8s.

### Legend and Marginalia
Bottom-right on a 92% paper pad with a hairline ring. A two-column legend of 22×12px drawn swatches with serif italic labels: Your mark (magenta target), Capital (ink triangle), Answer (hatched ink box), Boundary (dash-dot brown-violet). Below it an alternating ink scale bar with mono end labels whose width and distance follow the zoom, the representative fraction in mono ("1 : 40 000 000"), and a half-filled north arrow. The scale bar is a button: pressing it switches every distance between kilometres and miles (miles are the default for US English).

### Toasts and Medals
Toasts are small title blocks (card, double rule at 2px offset): a 30px medal, a magenta label-voice title, the medal name at 14px. They drop in over 0.5s. The medal is a benchmark triangle in a ring: ink ring, dashed inner ring, magenta triangle; locked medals print grey (`#9aa1a7` ring, `#d9ddd6` triangle) at 55% opacity.

### The Globe (signature component)
The map on the sheet, drawn in WebGL with cartographic line work. Rendering is on demand.
- **Ocean:** survey blue painted in the shader, pale near the coast and a little deeper offshore (never navy), with a faint sheen that follows the view. Depth reads from distance to the coast, not bathymetry. Water lines run parallel to every coast from the coast distance field at distances 9 km × 1.55^k, in `{colors.water-line}`, 72% opaque near the coast fading to 12%, 0.65–1px wide with a slight hand-drawn wobble; they appear only where their screen spacing allows (≥ about 3px).
- **Graticule:** every 15°, `{colors.graticule}` at 62% over ocean and 22% over land.
- **Land:** Natural Earth hypsometric relief, displaced ×22 at the overview so mountains lift the limb, easing to ×9 when zoomed in so tilted terrain stays believable, with a dynamic hillshade lit from the upper left of the screen (shade clamped 0.45–1.35). Below about 5 km/px, 2.2 km elevation tiles stream in for the view (fade 0.45s): a crisper hillshade, contour lines in contour brown at 500, 200 and 100 m with every fifth line heavier (blue on ice, grey on unsurveyed land), and faint rock texture on steep high ground only. The low tier skips the tiles, contours and rock. Unsurveyed land is the grey base plate; polar ice is replaced by grey-blue (`{colors.ice-lo}` to `{colors.ice-hi}`) that takes the same hillshade.
- **Lines:** vector, constant pixel width at every zoom, each cased in a paper halo. Coastline 0.95px solid blue ink (`#2b6e98`); international boundary 1.2px dash-dot in `{colors.boundary}` (14px period: a 6.5px dash, a 1.4px dot).
- **Highlights:** crisp outlines with a 1.5–1.6px paper halo: target 2.6px ink, focus 2.4px ink, correct 2.4px deep green, wrong 2.3px magenta, neighbour 1.15px ink at 85%. Fills are screen-space hatching: target and focus a 45° ink hatch (7px spacing, 1.35px lines) that drifts slowly; correct a 30% green tint with a faint counter-hatch; wrong a magenta hatch on the opposite diagonal.
- **Marks:** screen-facing symbols. The guess is a magenta surveyor's target (circle and cross), the answer an ink target, a capital an ink benchmark triangle. Tiny states get ring targets that fade toward the limb and declutter. Marks drop 64px with a squash over 0.34s.
- **Arcs:** great-circle, 2px magenta with a 1.3px paper halo, dashed on a 9px period that marches at 14px/s. They draw on over 450–1100ms (scaled by angle) and carry a mono distance label on paper with a 1px magenta border.
- **Frame:** a pale halo just outside the limb, a touch stronger on the lit side, and a soft edge darkening; then a 1.35px ink circle at the silhouette and an outer degree ring (gap max(9px, 4.5% of the radius), band max(7px, 3.2%)) with 1°, 5° and 15° ticks and a spur every 90°, at 78% ink. Its numbering follows the camera's longitude, it fades out when zoomed in, and a magenta index triangle on the ring points at the target's bearing.
- **Labels:** HTML overlays. Country names in wide caps (680, 125%, 0.22em, ink, paper text-halo) at three ranks: 13px, 11px and 9.5px (11, 9.5 and 8.5px compact). Ocean names in serif italic water ink at 0.32em tracking and 85% opacity. Labels must fit inside the disc.
- **Camera:** 30° field of view. Heading turns with Q/E, right-drag or a two-finger rotate; the compass rose turns with it and a press sets north up. Close in, the camera tilts automatically from 6 km/px to 35°, capped so the screen corners never show the horizon. A flight follows the great circle for clamp(520ms + 4.2ms per degree + 120ms × |ln zoom ratio|, 450ms, 1200ms), position on ease-in-out cubic, zoom on ease-in-out sine. Hops over 12° zoom out mid-flight, reaching the full overview at about 102°. The intro flies 70° in from the west at 1.9× distance over 1.9s on ease-out cubic. Menus idle-spin at 4.5°/s, ramping in after 2.5s without input.
- **Reduced motion:** flights become cross-fades, no idle spin, no hatch drift or pin drop, arcs appear at once, and UI animations collapse to 0.01ms.

The encyclopedia's static SVG map flattens the same rules: survey-blue sea, a 32% graticule, two cased water-line rings (`#82b5d0`, `#5d97bb`), pale land (`#eceee6`), neighbours `#e1e4d9`, the subject outlined 2.4px in ink with a hatch pattern, dash-dot boundaries (7 3 1.6 3), capital triangles cased in paper, and labels with a 4px paper stroke.

## Do's and Don'ts

### Do:
- **Do** put every question, verdict and score inside the title block, and every key, scale and orientation aid in the marginalia. The sheet's furniture is the HUD.
- **Do** keep magenta for the player's marks and the active control, green for surveyed and correct, ink for answers and structure (The Plate Rule).
- **Do** letter place names in the wide caps voice, label fields in the condensed 68% voice, and set every number in JetBrains Mono with tabular figures.
- **Do** mark raised furniture with the double rule (1.5px border, 1px outline at 3px offset) and keep corners square.
- **Do** draw globe line work as constant-width vector lines with a paper halo, lit and shaded from the upper left.
- **Do** let verdicts land once and stay: stamp press 0.42s, then still.
- **Do** honour reduced motion with cross-fades instead of flights and no idle spin.

### Don't:
- **Don't** add kicker or eyebrow labels above headings. The title-block head row is the only label above content, ruled into the block; a question or subtitle is a serif italic sentence, never a caps tag.
- **Don't** use glyph or emoji icons, icon fonts or unicode arrows as icons. Icons are the authored inline SVG set: one 1.6–1.8px round-capped stroke family, plus cartographic symbols (target, benchmark triangle).
- **Don't** mask ink with noise. Stamps, banners, outlines and type print solid and clean. Noise appears only where the world uses it: the faint paper grain on the sheet ground and the wobble in hand-drawn water lines.
- **Don't** introduce cream or warm paper, dark mode, a starfield, a coloured atmosphere glow or a glossy specular ocean. The limb halo and water sheen stay pale and faint: this is a light sheet in daylight, not space.
- **Don't** build the quiz-card grid with a flag on top. Answers happen by touching the globe or in ruled options inside the title block.
- **Don't** round corners beyond the 2px on keycaps and the arc label, and don't add drop shadows beyond the title block lift.
- **Don't** add a fourth accent colour, a new font width or a fourth type family.
