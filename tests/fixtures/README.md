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
| `projects/live-main.phosphor` | a project saved by the live site's code (`main`) | `node tests/fixtures/capture-main.mjs` |
| `../../examples/*.phosphor` | real projects from earlier versions | committed by hand |
| `fonts/wide.ttf` | ﷽ as a bar 7.5 columns wide (drawing over 8), for the overflow tests in any system's fonts | `python3 tests/fixtures/fonts/make-wide.py` (needs fontTools) |

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
