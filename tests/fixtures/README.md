# Test fixtures

Inputs the tests read, and (under `reference/`) the outputs they must reproduce.

## Inputs

| Fixture | What it covers | Made by |
| --- | --- | --- |
| `images/gradient.png` | the everyday case: an 8-bit PNG | `npm run fixtures` |
| `images/rgba.png` | transparency | `npm run fixtures` |
| `images/deep16.png` | 16 bits per channel | `npm run fixtures` |
| `images/one.png` | a 1×1 image | `npm run fixtures` |
| `images/tall.png` | a very tall image (40×1200) | `npm run fixtures` |
| `images/tiny.gif` | GIF | `npm run fixtures` |
| `images/photo.jpg`, `images/photo.webp` | JPEG, WebP | `npm run fixtures` (headless Chromium, kept once made) |
| `images/p3.png` | a PNG with an embedded Display P3 color profile | `npm run fixtures` (headless Chromium, kept once made) |
| `projects/pre-cell-layer.phosphor` | the oldest layout: typed characters as `charEditMap` | `npm run fixtures` |
| `projects/no-haspaint.phosphor` | paint with no `hasPaint` flag or paint scale | `npm run fixtures` |
| `projects/erased-cells.phosphor` | erased cells as a record, from before the base had its own pixels | `npm run fixtures` |
| `projects/charmode.phosphor` | a stored `charMode` (now derived from the art style) | `npm run fixtures` |
| `projects/animated.phosphor` | frames, holds and frames per second | saved by the app |
| `projects/live-main.phosphor` | a project saved by the live site's code (`main`) | `node tests/fixtures/capture-main.mjs` |
| `projects/one-sided-curve.phosphor` | an open curve with a sharp corner, stroked to its right with a miter limit of 8 (a report: the stroke showed on its left too) | saved by the app |
| `projects/colorize-sharpen.phosphor` | a face under Sharpen, Brightness, Contrast and Saturation, colorized red at 100% on CGA (a report: the red it showed couldn't be picked) | saved by the app |
| `projects/upper-paint-palette.phosphor` | a white, brown and black color list under Saturation 0, with Layer 1's own character settings making it an upper layer (a report: the brown swatch painted dark gray in the PIXEL view) | saved by the app |
| `projects/blur-ascii-test.phosphor` | Color ASCII with By shape: a gradient shape merged into Layer 1 over white paint and colored text, blurred, then Layer 1 merged into the base with Keep crisp cells and blurred again (a report: the blur was a little off; nearly the whole shape had come down as exact cells, then pins, from colors a step apart) | saved by the app |
| `projects/paint-over-merged-shape.phosphor` | Color ASCII with By shape: a shape merged into Layer 1, then painted along its edge with the Brush's Colors only (a report: the paint came out as half-blocks with banding; the edge's exact blank cells had become ▄s with colors of their own) | saved by the app |
| `projects/layer-blending-ascii.phosphor` | Color ASCII with By shape: a red shape over a white Brush stroke on Layer 1, and a white stroke on a layer above the shape (a report: neither layer seemed to blend with the one under it in the PIXEL view; the Overlay drew Colors only's ▄s as their ASCII cells, on black, over the paint) | saved by the app |
| `projects/merge-dark-edge.phosphor` | Color ASCII with By shape: a red shape on Vector 1 over white Brush strokes on Layer 3, with Layer 1 and Layer 2 under them (a report: Vector 1 merged into Layer 3 left dark lines along the shape's edge in the PIXEL view; the cells frozen there had lost their paint, and the Overlay drew their characters' ink) | saved by the app |
| `projects/blur-merged-upper.phosphor` | Color ASCII with By shape: a shape merged into Layer 3 and blurred, between Layer 1's white stroke and Layer 2's (a report: the blurred edge over Layer 1's white came out as dark cells while the PIXEL view showed near-white; the upper layer mixed its paint with the character's ink on black, not the pixels under it) | saved by the app |
| `projects/text-merge-base.phosphor` | Color ASCII with By shape: black text typed over white paint on Layer 1 (its cells with the paint's color as their background), blurred (a report: Layer 1 merged onto the base with Keep crisp cells turned the text black on black; the base held no background in Color ASCII) | saved by the app |
| `projects/merge-base-banding.phosphor` | Color ASCII with By shape over a photo: a shape merged into Layer 1 (51 cells frozen along its edge, where the photo's detail under the soft paint matched differently on the lower group than above it) and Colors only strokes (a report: Layer 1 merged onto the base showed half-blocks and banding in the PIXEL view, the frozen cells' pins written as pixels) | saved by the app |
| `projects/keep-crisp-under-vectors.phosphor` | a photo on CGA with Best match: Layer 1 with Brush paint, a typed caption and Blur strokes, under a vector layer with its own Ordered dither holding the rose SVG (a QA report: Layer 1 merged onto the base with Keep crisp cells changed dozens of cells; soft paint was mixed in before the palette's snap, and paint with no cell under it was picked again from the base's snapped pixels) | saved by the app |
| `projects/vector-into-layer-edge.phosphor` | a photo with Layer 1's paint, Vector 1 above it (By shape, its own characters) holding a green pentagon, and Layer 2's paint on top (a report: Vector 1 merged into Layer 1 froze the pentagon's soft edge with the photo's gray in it, so hiding the base showed a gray border, and merging with it hidden a black one) | saved by the app |
| `projects/random-layer-blocks.phosphor` | a white canvas under Best match with Brush strokes on the base and on Layer 1, and Layer 2 above with Random and a seed of its own (a report: Layer 2's strokes came out as half-blocks wherever the canvas under them was flat, since Colors only made a ▄ of each cell that showed no character, and as Random's characters only along the edges of what was under them) | saved by the app |
| `projects/random-over-pins.phosphor` | a flattened drawing (every base cell pinned, most in their own background color, a typed word among them) under Layer 1 with Random, ░▒▓█ and a seed of its own (a report: Layer 1's strokes came out as half-blocks in the ANSI view: paint over an open pinned character showed as a ▄, where Color ASCII converted it with the layer's characters) | saved by the app |
| `projects/blur-shape-issue.phosphor` | a shape merged down into Layer 1 (By shape, so most of its cells were written exactly) beside a painted circle, both blurred in the ANSI view (a report: the shape kept a hard edge and never faded into the clear) | saved by the app |
| `projects/base-character-lines.phosphor` | three diagonal lines drawn on the base with the Shape tool: a Full-block one of █ ░ ▒ ▓, a Half-column one of ▐ ▌ █ and a Half-block one, which is paint (a report: the first two showed in the PIXEL view as rows of dashes, each character cell its background over its foreground) | saved by the app |
| `../../examples/*.phosphor` | real projects from earlier versions | committed by hand |
| `clipboard/moebius-16-colors.html` | Moebius's clipboard HTML, 16 colors only (the Advanced Color fork, 2026-11-02) | copied in Moebius, read from the Mac clipboard |
| `clipboard/moebius-24-bit.html` | the same with one cell in 24-bit color (`fg_rgb`, `fg_idx`) | copied in Moebius, read from the Mac clipboard |
| `ansi/past-the-edge.ans` | an ANSI file's line drawn past column 80, its second row indented by a move right from the edge (a report: the row lost its indent); the first 18 lines of VD-HUMA.ANS (veediot, 1995) | cut from the reporter's file |
| `ansi/256-colors.ans` | an 8×3 file in 256-color codes with a SAUCE record shaped like RA-FIFTY.ANS's (a QA report: export rewrote it): flags 0, no font name, a height of 5 past its 3 lines, two comments | made by hand (a short node script), since the report's pack is gone |
| `ansi/fixed-black-white.ans` | a 4×2 file in 256-color codes using 16 and 0, 231 and 15 (fixed and theme black and white, the same colors), laid out as Phosphor writes a file, a character on 16 over 0 among them (a QA report: export rewrote every 16 as 0 and every 231 as 15) | made by hand (a short node script) |
| `fonts/wide.ttf` | ﷽ as a bar 7.5 columns wide (drawing over 8), for the overflow tests in any system's fonts | `python3 tests/fixtures/fonts/make-fonts.py` (needs fontTools) |
| `fonts/color.ttf` | 😀 as a two-color glyph (red, then green), for the canvas's color glyphs (emoji) in any system's fonts | `python3 tests/fixtures/fonts/make-fonts.py` |
| `fonts/tall.ttf` | a monospaced font taller than its em (ascent 1.1, descent 0.1), its `_` filling the descent: where the canvas puts the baseline, and a font you load | `python3 tests/fixtures/fonts/make-fonts.py` |
| `fonts/proportional.ttf` | the monospace check's ten characters at different widths: a font you load that's refused | `python3 tests/fixtures/fonts/make-fonts.py` |

The current `.phosphor` format is covered by the save-then-load tests (`tests/browser/projects.test.js`).

## Reference outputs (`reference/`)

What a test's output must equal: export bytes (`export/`), converted cells (`conversion/`) and loaded
projects' cells (`projects/`). They're written only by `npm run test:update`; a missing or different
one fails the test. A reference is a claim that today's output is right: read the diff before you
commit one. See [docs/testing.md](../../docs/testing.md).

## Turning a bug report into a test

1. Put the reporter's file here: an image under `images/`, a project under `projects/` (name it for
   the issue, e.g. `projects/issue-42.phosphor`).
2. Add it to the test for its kind: `IMAGES` in `tests/browser/images.test.js`, `FIXTURES` in
   `tests/browser/projects.test.js`, or a grid in `tests/unit/export.test.js` for an export problem.
3. Make the test say what should happen (a cell, a byte, a round trip), watch it fail, then fix the
   app until it passes. Write its reference with `npm run test:update` only once the output is right.
