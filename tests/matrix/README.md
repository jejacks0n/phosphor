# The review matrix

A way to walk layers, merging, blending, flattening and baking across everything a drawing can start from. A
**foundation** is the drawing a setup starts on: what it's made from, its art style and Choose characters, its palette,
and whether a slider is moved. A **setup** is what's drawn and done on it: the same 30-odd items on every foundation,
on Layer 1 and on Vector 1, each in its own place on a 120 × 50 grid. A **scenario** takes a setup through steps (a
merge, a Blend, a Flatten, a Bake) and looks at the picture after each.

Two things use it:

- **Pictures** (`tests/browser/matrix.test.js`, part of `npm test`): each built foundation's setup taken through each
  scenario, the picture after every step compared with a reference PNG
  ([Reference files](../../docs/testing.md#reference-files)).
- **Scripts** (this folder): building setups, counting the combinations, and probes that answer one question about a
  setup. They run the app in Chromium on a dev server of their own (port 5197), so they don't touch the one on 5173.

## Files

| File | What it does |
| --- | --- |
| `combos.mjs` | The axes (foundation and setup), the rules for what the app can't make, the counts, and `pairwise.csv`: runs that cover every pair of values. `node tests/matrix/combos.mjs` |
| `layout.mjs` | Where each setup item goes on the grid, numbered as the items below. |
| `page-setup.js` | Runs in the page: `foundation()` makes a foundation, `setup()` draws the items with the app's own tools (each checks it changed its region), `pho()` saves it. |
| `app.mjs` | Opens the app for a script: the dev server on 5197, a page, and `inPage(fn, arg)`. |
| `build-setup.mjs` | Builds a foundation and its setup and saves the `.pho`. |
| `inspect.mjs` | Prints a `.pho`'s layers and some cells. `node tests/matrix/inspect.mjs <file.pho> [col,row ...]` |
| `swap-sweep.mjs` | For several foundations, swaps Vector 1 under Layer 1 and counts what changed. |
| `make-ans.mjs`, `render-svg.mjs` | Make the inputs in `tests/fixtures/matrix/`: `scene.ans` (a 120 × 50 textmode scene) and `landscape.png` (from `landscape.svg`). |
| `probes/` | One question each, from the merge review (2026-11-25): `ascii-crisp` (half cells kept by Keep crisp cells in ASCII), `vector-base` (a vector layer with its own characters into Base), `merge-blur` (what Blur reaches after each merge), `circle18` and `circle18-crops` (the four circles through each merge, as a sheet of crops), `halfcol` (Half-column detail on a picture). |
| `out/` | What the scripts write. Ignored by git. |

## Building a setup

```bash
node tests/matrix/build-setup.mjs                                  # image ansi best vga none, into out/
node tests/matrix/build-setup.mjs base colorAscii shape cga none   # scene.ans with Draw on top, Color ASCII, By shape, CGA
node tests/matrix/build-setup.mjs image ansi best vga none --fixture   # into tests/fixtures/matrix/, for the pictures
```

The arguments are `from style mode palette adjust`, and the file is `setup-{from}-{style}-{mode}-{palette}-{adjust}.pho`:

- **from**: `image` (`landscape.png`), `blank`, or `scene.ans` opened with `edit` (Edit artwork), `base` (Draw on top)
  or `picture` (Open as an image).
- **style**: `ansi`, `colorAscii`, `ascii`.
- **mode**: the base's Choose characters: `random`, `best`, `shape`, `intensity`, `brightness`.
- **palette**: `none` (Full), `vga`, `cga`, `count` (Limited, 16).
- **adjust**: `none`, or a slider moved, `key=value` (`brightness=20`).

The base gets Blocks & shades (in ANSI) and Solids 10, and with a palette, Floyd–Steinberg at 3%. Building the same
foundation again gives the same cells and layers (only the layers' and shapes' ids differ).

## The setup's items

Layer 1: 1 the poem (lines with and without a background), 25 cells swapped on its first line, 30 block characters
typed by hand, 2 a Pencil curve with Colors only, 3 and 4 single and double Pencil lines crossing, 10 a fill and 11 a
gradient inside them, 5 to 7 Brush strokes (plain, Half-block, half opacity), 8 the Eraser, 12 Blur and 13 Dodge and Burn
across them, 9 a Half-block shape, 14 squares (Single, Double, Half-block on top and bottom halves), 15 to 18 circles in
Half-block and Full-block (18 is Half-column detail), 19 crossing lines, 20 to 24 lines in Half-block and Full-block,
26 a pen shape merged down, 26b a polygon merged down from a layer with its own characters (By shape, Hi-res).
Vector 1 (By shape, Hi-res, of its own): 27 to 29 a circle, a square and a line with snapping None, Cells and Half
cells, and one circle over the end of stroke 7, the one place the two layers overlap.

## Adding to the pictures

- **A foundation**: build it with `--fixture`, add its slug to `FOUNDATIONS` in `tests/browser/matrix.test.js`, run
  `UPDATE_REFERENCES=1 npx vitest run tests/browser/matrix.test.js`, and open every new PNG in
  `tests/fixtures/reference/matrix/{slug}/` before committing. A setup is about 0.6 MB and its pictures about 0.3 MB.
- **A scenario** (Flatten, Bake, Merge up, a selection's merge): a `describe` inside the foundations' loop, a
  `picture(project, foundation, step)` after each step, and a plain assertion wherever a step should change nothing.
  Its references are written and looked at the same way.
- **Rebuilding a setup that's already there** changes every picture of that foundation: only when the setup itself
  should change, with the new pictures looked at.

The pictures are drawn in CP437 8×16, a bitmap font, so they're the same on macOS and on Linux (CI).
