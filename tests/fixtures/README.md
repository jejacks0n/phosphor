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
| `../../examples/*.phosphor` | real projects from earlier versions | committed by hand |
| `clipboard/moebius-16-colors.html` | Moebius's clipboard HTML, 16 colors only (the Advanced Color fork, 2026-11-02) | copied in Moebius, read from the Mac clipboard |
| `clipboard/moebius-24-bit.html` | the same with one cell in 24-bit color (`fg_rgb`, `fg_idx`) | copied in Moebius, read from the Mac clipboard |
| `ansi/past-the-edge.ans` | an ANSI file's line drawn past column 80, its second row indented by a move right from the edge (a report: the row lost its indent); the first 18 lines of VD-HUMA.ANS (veediot, 1995) | cut from the reporter's file |
| `ansi/256-colors.ans` | an 8×3 file in 256-color codes with a SAUCE record shaped like RA-FIFTY.ANS's (a QA report: export rewrote it): flags 0, no font name, a height of 5 past its 3 lines, two comments | made by hand (a short node script), since the report's pack is gone |
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
