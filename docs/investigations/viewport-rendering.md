# Investigation: viewport rendering and very large documents

Question: what would it take to support documents of 80 x 10,000+ lines (maybe 1000 x 10,000), and
to let several people work in one file, each caring only about the area they're in?

Written 2026-10-25 against `main` at `e6852bd`. Investigation only: no app code changed. The one
thing added is a benchmark, `bench/` (see [Measuring](#how-this-was-measured)).

**Since then (PR #19, `13a1b8c`):** the grid's limit became 300 columns, 1,000 lines and 120,000
cells (`src/lib/Cells.js:23`). The canvas view now lowers its resolution to keep each side within
the GPU's largest drawing buffer (`backingScale`'s `maxSide`), instead of having the buffer cut
short. So a long grid now looks soft rather than wrong (`docs/layers.md`: soft past about 800
lines). Nothing below changes because of it. Stage 1 is still what makes long grids sharp, and the
whole-document costs in section 2 are what stand between 120,000 cells and more. The plan for
stage 1 is `docs/superpowers/plans/2026-10-25-viewport-rendering.md`.

**Measured** means a number from the benchmark on this machine. **Estimate** means judgment.
Sizes are given as *cols x lines*; `rows` in the code counts pixel rows, two per line
(`charRowsOf`, `src/lib/Cells.js:15`).

## Summary

- **Viewport-sized drawing is cheap** (estimate: 1 to 1.5 weeks) and worth doing on its own. The
  canvas view breaks long before 10,000 lines. At 80 columns on a retina screen, one canvas for
  the whole grid passes the GPU's 16,384 px per side somewhere between 500 lines (fine) and 1,000
  (broken) on an M3 Pro (measured; about 670 by the arithmetic), and at 8,192 px under
  SwiftShader. Its sharpness also drops as the document grows, since 16M
  device pixels get spread over the whole grid. Today's 300 x 150 already draws at 1.31 device px
  per CSS px instead of 2 (measured); 80 x 10,000 draws at 0.31. One viewport's worth of cells
  redraws in **1.4 ms**, against **90 ms** for 800k cells (measured). The tools already work in
  grid coordinates. Only the two views and their overlays measure against the canvas element,
  and keeping a full-size sizer element leaves even those as they are.
- **Viewport drawing alone doesn't make 80 x 10,000 usable.** Every edit still does work in
  proportion to the whole document. At 800k cells (measured): a pencil move takes 29 ms, or 98 ms
  with VGA; a keystroke 22 to 65 ms; undo 150 to 330 ms (it re-renders everything); a Paint
  Bucket fill 1.5 s; a slider step 150 to 300 ms. Most of that cost is a few specific
  whole-document passes (listed in [section 2](#2-what-still-scales-with-the-whole-document)).
  Fixing them takes medium effort (estimate: 2.5 to 3 weeks) and needs no new document model.
- **80 x 10,000 fits without tiling, on desktop at least.** The JS heap is about 213 MB after
  opening and 684 to 892 MB after a session of edits (measured). The layer, output and pipeline
  canvases total about 50 MB (computed from their measured sizes).
  Two hard walls are close above it. The base layer's canvas is `rows x 2` px tall, and Chromium
  refuses a canvas side over 65,535 (measured), so about 16,000 lines is the end. A picture
  stretched over the whole length breaks the WebGL pipeline (measured: every cell came out black).
- **1000 x 10,000 (10M cells) needs a new document model.** The tab ran out of memory while
  opening it (measured). Cells are JS objects at about 200 to 280 bytes each (measured: 172 to
  245 MB at 0.8 to 1M cells). A tiled model with typed-array cells is expensive (estimate: 5 to 8
  weeks) and reaches into most of `src/store/project/*` and `src/document/*`.
- **Collaboration is the most expensive part** (estimate: 2 to 4 months for an MVP, including a
  backend that doesn't exist). Region scoping helps: people in different regions never conflict,
  and nobody loads what they aren't looking at. But many operations are global: sliders, the
  palette (Color count is computed from the whole picture), Bake, Into the image, canvas resize,
  merges, fills. And today's undo swaps whole maps and whole tiles, so it would erase other
  people's work. Recommended MVP: row bands as regions, each person claims the region they edit,
  the server holds each region's version, and undo stays local to your own claimed region.
- **Recommendation:** do stage 1 (viewport drawing) now. It also fixes retina sharpness at
  today's sizes. Then do stage 2's top items in payoff order. Raise the limits after each stage
  ships. Decide on tiling only when 1M+ cells, iOS, or collaboration is actually committed to.

## How this was measured

`bench/large-documents.bench.js` drives the real stores in Chromium, the way the browser test
layer does (no UI mounted). `bench/vitest.config.js` keeps it out of `npm test`; it asserts
nothing and prints one JSON line per size.

```bash
npx vitest run --config bench/vitest.config.js --silent=false   # software WebGL, as the tests use
BENCH_GPU=1 npx vitest run --config bench/vitest.config.js --silent=false   # Metal on the GPU
BENCH_HUGE=1 ...                                                 # adds 1000 x 10,000 (crashes the tab)
```

The documents are a blank canvas: a black picture, so a fill covers the whole document (the worst
case). The views and the export use a varied drawing: characters and colors that differ from cell
to cell. Machine: Apple M3 Pro, Playwright's Chromium, devicePixelRatio 1 unless noted. The table
is the last full run. The 80 x 10,000 column shows ranges over five runs, because runs differ by up
to about 2x on the noisy rows (GC, machine load). Read the numbers as magnitudes. The first size's
"open" includes warm-up (shader compiles, font).

### Results (measured, software WebGL, ms unless noted)

| | 300 x 150 (45k, today's max) | 100 x 1,000 (100k) | 80 x 10,000 (800k) | 1000 x 1,000 (1M) |
| --- | --: | --: | --: | --: |
| Open a blank document | 736 | 87 | 376 to 841 | 877 |
| JS heap after opening | 11 MB | 33 MB | 172 to 228 MB | 200 MB |
| Full render (`Renderer.render`) | 20 | 28 | 124 to 207 | 278 |
| Slider step (full re-render) | 35 | 39 | 147 to 305 | 427 |
| Canvas view: redraw, whole grid | 6.0 | 11.6 | 89 (GPU: 90) | 116 |
| Canvas view: redraw, 200 x 60 viewport | 1.5 | 1.3 | 1.3 | 1.4 |
| DOM view: first render + layout | 113 | 199 | 1,540 to 1,999 | 2,585 |
| Pencil, one move (no palette) | 2.2 | 4.8 | 29 to 36 | 47 |
| Pencil, one move (VGA) | 4.0 | 11 | 98 | 123 |
| Pencil, one move / stroke end (Color count) | 5.7 / 21 | 13 / 38 | 129 / 284 | 134 / 319 |
| ... of which `layoutWide` over all cells | 0.5 | 1.4 | 8 to 16 | 18 |
| ... of which `updateCells` (reads the whole output) | 0.9 | 1.3 | 41 | 14 |
| Keystroke (`typeAt`) | 1.6 | 4.4 | 22 to 65 | 55 |
| Erase one base cell | 3 to 5 | 13 to 34 | 71 to 138 | 69 to 182 |
| Move a 10 x 10 selection (both layers) | 25 | 100 | 256 to 317 | 211 |
| Paint Bucket: `floodFill` alone | 18 | 61 | 375 to 443 | 130 |
| Paint Bucket: whole click | 71 | 145 | 1,433 to 1,728 | 1,553 |
| Undo the fill / redo it | 43 / 34 | 41 / 66 | 150 to 330 / 170 to 260 | 329 / 526 |
| Merge down (whole layer) | 50 | 176 | 300 to 527 | 439 |
| JS heap after those edits | 68 MB | 118 MB | 684 to 892 MB | 810 MB |
| Save (layer PNGs + .phosphor) | 3 (18 KB) | 10 (66 KB) | 39 to 44 (335 KB) | 8 (97 KB) |
| Load it back | 69 | 57 | 265 to 419 | 498 |
| Export .utf8ans | 54 (1.6 MB) | 119 (3.6 MB) | 999 to 1,047 (28.8 MB) | 1,279 (35.9 MB) |

At 1000 x 10,000 (10M cells) the tab crashed while opening the document: "Browser connection was
closed".

### Limits (measured)

| | SwiftShader (the test layers) | M3 Pro, Metal | Playwright WebKit (macOS) |
| --- | --: | --: | --: |
| WebGL MAX_TEXTURE_SIZE / MAX_VIEWPORT_DIMS | 8,192 | 16,384 | 16,384 |
| 2D canvas side | 65,535 works, 65,536 fails | same | 160 x 65,535 works |
| 2D canvas area | | | 1000 x 20,000 (20M px) works |

The 16,777,216-pixel ceiling in `src/lib/CellCanvas.js:25` didn't reproduce in Playwright's WebKit
on macOS. It's iOS Safari's limit, and iOS wasn't measured.

The canvas view's one canvas, 80 columns, dpr 2, on the M3 (measured): 500 lines is 1120 x 14000
and draws whole. 1,000 lines is 720 x 20000 with a drawing buffer of 720 x 16384, so the browser
stretches that buffer over the whole canvas and the picture is wrong. At 10,000 lines it's 240 x
60000 (0.31 device px per CSS px), a cell about 3 x 6 device pixels: unreadable even before the
side limit.

## 1. Viewport-only drawing

### What assumes the canvas is the whole grid

| Where | What it assumes |
| --- | --- |
| `src/lib/CellCanvas.js:30-33` (`backingScale`) | Caps the canvas area at 16M device px but not its sides, and spreads that over the whole grid, so sharpness falls as the grid grows. |
| `src/lib/CellCanvas.js:214-233` (`resize`) | Canvas and the four data textures are `cols x rows` cells; the CSS size is the whole grid. |
| `src/lib/CellCanvas.js:243-271` (`draw`) | Refuses cells unless `cells.length === cols * rows`; packs every cell (`packCells`, `layoutSpills`) and uploads full textures on every draw. |
| `src/lib/CellCanvas.js:143-149` (fragment shader) | Pixel `p` is the grid pixel: `c = p / uCell` is the cell, with no offset. |
| `src/lib/CellCanvas.js:136` | The shade dot pattern is aligned to the canvas origin. A scrolled canvas needs the scroll offset (in device px) so the dots don't crawl. |
| `src/components/AnsiEditor.vue:46-55, 65-80` | `ensureMetrics` and `render` size the canvas to `cols x charRowsOf(rows)` and draw all of `projectStore.cells`. |
| `src/components/AnsiEditor.vue:83-97` | The DOM view builds a buffer of every cell, and `TextRenderer.render` (`src/lib/TextRenderer.js:33-96`) makes a span per row for every row and diffs every cell on each update. |
| `src/components/AnsiEditor.vue:163` | Every change to `projectStore.cells` redraws the whole view. |
| `src/components/AnsiEditor.vue:100-121` | `coordsAt` and `cellOrigin` measure from the display element's box: the canvas/pre is assumed to sit where the grid's origin is. |
| `src/components/AnsiEditor.vue:124-159` | The text cursor, IME textarea and selection marquee are positioned in the display's coordinates; `scrollIntoView` on the cursor (`:146-149`) relies on that full-size layout. |
| `src/components/AnsiEditor.vue:196-209` (`publishOrigin`) | The top-left cell on screen comes from the display's box against the viewport's. |
| `src/components/InputEditor.vue:56-66` (`redrawDisplay`) | The pixel view's canvas is `cols x zoom` by `rows x zoom` and draws the whole output canvas every change. At 80 x 10,000 and the default zoom 5 that's 400 x 100,000 px, past the measured 65,535 limit, so the pixel view would draw nothing (inferred from the measured limit, not run in the view). |
| `src/components/InputEditor.vue:19-43` | The ANSI overlay is a full `cols x rows` ImageData built from every cell (`cellsToPixels`). |
| `src/components/InputEditor.vue:68-83, 116` | `coordsAt` and `contentSize` measure the display canvas as the whole grid at zoom. |
| `src/components/EditorViewport.vue:107-171` | The tool preview, eraser outline, cell highlight and shape ghost (`shapeDragStyle`) are absolute in the display's coordinates. |
| `src/components/EditorViewport.vue:181-190` | The pixel view's padded layout is sized from `contentSize` (the whole grid at zoom). |
| `src/components/EditorViewport.vue:194-210, 222-238` | Scroll restore, `handleResize` and the remembered center are scroll offsets over the whole content. |
| `src/composables/useEditorInteractions.js:130-141` | Pointer position comes from the display's box. |
| `src/composables/useEditorInteractions.js:168-173, 233-276` | `centerContent` and zoom-to-point use the scroll parent and the display's box (anchor as a fraction of it). |
| `src/composables/useEditorInteractions.js:336-345, 520-521` | Edge-scroll during a Select drag and wheel scroll move the scroll parent and report a pointer position against the display. |
| `tests/e2e/support.js:47-52` (`cellPoint`) | Every end-to-end test finds a cell by dividing `.ansi-editor .display`'s box by cols and lines. |
| `tests/browser/cell-canvas.test.js:73` | "a 200x300 grid at dpr 2 stays under the backing cap" tests the whole-grid canvas. |

Not on the list: the tools (`src/tools/*`) take grid positions and never measure the canvas.
`CharPaletteLayer.vue` doesn't measure the canvas either: its "drawing" source scans every cell
(`src/components/CharPaletteLayer.vue:60`), which is O(document) but cheap.

### The shape of the change

Keep a **sizer**: the element that's `.display` today, given the whole grid's CSS size (and the
dashed border) but drawing nothing. Inside it, a canvas with `position: sticky; top: 0; left: 0`,
sized to the viewport. The sizer's box is where the grid is, so `coordsAt`, `cellOrigin`, every
overlay, `publishOrigin`, `scrollIntoView`, edge-scroll, zoom-to-point and the e2e `cellPoint` keep
working unchanged. Only the drawing changes:

- `CellCanvas`: `resize(viewCols, viewRows, dpr)` for the cells in view (plus one), and
  `draw(cells, cols, { col0, row0, dx, dy })`, which packs only that window and passes the
  sub-cell offset and the shade origin as uniforms. Overflowing characters (﷽ draws about eleven
  columns, `src/lib/DrawnWidth.js`) need about 12 columns of margin on the left so a character
  just out of view still spills in. `backingScale` stays, but now applies to the viewport, which
  is always far under the cap, so text is at full dpr at every size.
- `AnsiEditor.vue`: redraw on scroll and resize (rAF-coalesced), not only on cells changing.
- `InputEditor.vue`: the same sizer, plus a sticky canvas that `drawImage`s only the visible
  source rect of `outputCanvas` at zoom. The overlay can stay full-size up to about 1M cells: a
  `cols x rows` canvas fits every measured limit at 80 x 10,000.
- The DOM view: it's the fallback when WebGL2 is missing (`AnsiEditor.vue:36-40`), so it needs
  virtualizing too. Draw the visible rows into a pre absolutely positioned in the sizer. Its first
  render at 800k cells is 1.5 to 2.0 s (measured).

**Risks:** iOS momentum scrolling runs ahead of scroll events, so a sticky canvas can show
stale edges for a frame (draw a margin of overscan). DPR changes and the remembered scroll need
re-testing. The e2e suite mostly carries over thanks to the sizer. **Estimate: 1 to 1.5 weeks**
including tests: a browser test for a scrolled draw (offset, spills, shade alignment) and an e2e
test that scrolls a long document and paints at the bottom.

## 2. What still scales with the whole document

With drawing viewport-sized, these still do work over the whole document. Cost columns are
measured (from the table above) unless marked. "Breaks" means a wrong result or a failure, not
slowness.

| What | Where | 80 x 10,000 | 1000 x 10,000 |
| --- | --- | --- | --- |
| **Cells as objects.** `cells`, `composedCells`, `renderedCells` share cell objects (`{ char, fg: {r,g,b,hex,c}, bg }`). | `src/lib/Cells.js:46-58, 74-88`; `src/store/ProjectStore.js:37-39` | Memory: 172 to 228 MB heap. | **Breaks**: the tab crashed opening it. About 2.5 GB of cells at the measured rate (estimate), plus the pixel objects below. |
| **Pixel objects.** `Canvas` keeps one `{ r, g, b, a, v }` per grid pixel, made on every render and on every `new Canvas(...)`. | `src/lib/Canvas.js:63-74, 111-163, 192-216` | Slow: part of every render. | Breaks with the cells (20M objects, estimate). |
| **Render and slider steps.** Full pipeline, cells rebuilt, `composeAll` over every edit cell. | `src/document/Renderer.js:54-85, 308-320`; `src/store/project/rendering.js:118-134` | Slow: 200 to 305 ms per slider step, so a slider drag stutters. | |
| **Paint move.** `refreshCells` recomposites the whole output, then `updateCells` reads the whole output into pixel objects (`new Canvas(this.outputCanvas)` at `Renderer.js:267`) to rebuild a few cells. Then `setCells` copies and re-lays every cell (`layoutWide`). | `src/store/project/rendering.js:137-158`; `src/document/Renderer.js:137-155, 236-261, 265-298`; `src/lib/Cells.js:95-110` | Slow: 29 ms a move, plus a 90 ms canvas redraw today (about 8 moves a second); about 30 ms once the view is viewport-sized. | |
| **Palettes.** VGA, CGA or a color list re-snaps the whole output on every move (`Renderer.js:153`). Color count re-picks its palette from the whole output when a stroke ends (`Renderer.js:158-165`, `Quantizer.js`). | `src/document/Renderer.js:151-153` | Slow: 98 ms a move (VGA); 284 ms at the end of a stroke (Color count). | |
| **Base layer.** Any base edit recomputes the whole base layer at its processing scale (`#baseGrid`: a full `getImageData`, the adjustments, the averaging). | `src/document/Renderer.js:177-213` | Slow: 71 to 138 ms per base edit, several per selection move (256 to 317 ms). The base canvas is 160 x 40,000; at m = 2 its height is `rows x 2`, so **it breaks past about 16,000 lines** (65,535 px, measured). | 2000 x 40,000 = 320 MB if the picture is processed at m = 2 (estimate). |
| **Image pipeline.** WebGL processes the picture at `dw*m x dh*m`, with m at least 2 when the image is big enough (`maxDim = 400`). | `src/lib/ImageProcessor.js:48-77`; `src/lib/WebGLProcessor.js:305-319` | Fine while the picture is letterboxed (a photo in a tall grid is small). **Breaks** when the picture is the grid's shape: an 80 x 20,000 px picture gave every cell `#000000` (measured), past the 16,384 texture limit. | Same. |
| **New blank canvas.** The blank picture is 10 px per grid pixel (`BLANK_CANVAS_SCALE`). | `src/store/project/shared.js:8`; `src/store/project/document.js:53-69` | **Breaks**: an 800 x 200,000 canvas can't be encoded: "Could not decode image" (measured). | Same. |
| **Paint layer.** One canvas. `editScaleFor` floors the scale to 1 once `max(cols, rows) > 4000`, so `MAX_LAYER_DIM` stops being a cap and the layer is `cols x rows`. | `src/document/PaintLayer.js:18-24, 55-62` | Memory: 6.4 MB. | 80 MB, and past iOS Safari's canvas area limit (estimate: not measured). |
| **History.** 50 entries (`ProjectStore.js:48`), no byte limit. Strokes keep 64 px tiles before and after (`PaintLayer.js:382-392`). Merges, Clear and Bake keep **whole-layer snapshots** (`merging.js:59, 233, 245, 289, 296`; `editLayer.js:207`). | `src/document/History.js:5-23, 55` | Memory: a whole-document fill is about 20 MB of tiles; each merge about 64 MB (both layers, both sides). Fifty merges would be about 3 GB (estimates from the layer sizes). The heap after a few edits was 684 to 892 MB (measured). | Each merge snapshot is hundreds of MB (estimate). |
| **Undo/redo.** Each step swaps whole maps (`editCells`, `baseRecords`) and calls `render()`, a full pipeline run, even for a one-pixel stroke. | `src/store/project/history.js:29-39` | Slow: 150 to 330 ms per undo. | |
| **Flood fill.** BFS with `queue.shift()` over `[x, y]` arrays, an object per filled pixel, then `paintStroke` maps them all again and `PaintLayer.paint` makes a rect for each. Reads the whole output (`bucket.js:40`). | `src/lib/FloodFill.js:53-97`; `src/tools/bucket.js:9-20, 40-43`; `src/store/project/editLayer.js:25-30`; `src/document/PaintLayer.js:91-134` | Slow: 1.4 to 1.7 s for a fill of the whole document. | |
| **Selection, merges.** `selectionEdit` recomposites the whole output (`selection.js:196-205`). Merge up and Into the image scan the whole grid (`merging.js:166-189`). Merge down snapshots both layers and re-renders. | `src/store/project/selection.js`; `src/store/project/merging.js` | Slow: 300 to 530 ms per merge. | |
| **Save, load.** Each layer as one PNG (`PaintLayer.toBlob`). `readProject` drops `fit` or `paintScale` above `MAX_LAYER_DIM` (`projectIO.js:57-60`). At 80 x 10,000 the fit's `dy` is about 9,960, so it's dropped, which is harmless until a canvas resize has moved the fit. | `src/store/project/document.js:142-210`; `src/document/projectIO.js:31-71` | Fine: 42 ms to save (mostly-empty layers compress well), 265 to 419 ms to load. The validation needs to follow the new limits. | A PNG per layer is fine up to the canvas limits. |
| **Export.** `AnsiFile` pushes every byte onto a JS number array before making the Blob. | `src/lib/AnsiFile.js:44-103` | Slow: 1.0 s for 28.8 MB. The array is about 8 bytes per byte (estimate). | Breaks, estimated: a file of about 360 MB is about 3 GB of array. |

What's clean: save and load are fast, and `editCells` and `baseRecords` are sparse maps that grow
with what's drawn, not with the grid. Generated cells are a pure function of the image, settings
and cell position (`cellRandom`, `src/lib/Cells.js:72`), so they never need storing or sending.

## 3. A chunked or tiled document model

**Not needed for 80 x 10,000.** Stage 2's fixes (dirty rects, touched-pixel reads, per-row
layout, a byte-capped history) bring the per-edit cost down to the size of the edit, and the
memory fits. The hard walls near there (the base canvas past about 16,000 lines, a tall picture
in the pipeline) can be handled without tiles: drop the base layer's scale to 1 for tall grids,
and stop letting the picture's processed size pass the texture limit. Both are decisions for the
limits work.

**Needed for 1000 x 10,000 and up, for iOS at large sizes, and as the unit of collaboration.**
What it would be:

- **Tiles are row bands** (for example 64 lines x all columns), not squares. Wide characters
  (`layoutWide`), overflowing glyphs (`layoutSpills`, up to about 11 columns) and box joins
  (`src/lib/BoxJoin.js`) look along a row, so a band never splits what they need. The documents
  in question are tall, so bands are also natural regions for people.
- **Cells per band as typed arrays:** a glyph index (Uint16/Uint32 into a per-document character
  table) and packed fg and bg (Uint32 each), about 12 bytes a cell against about 250 today.
  10M cells comes to about 120 MB (estimate). Edit cells stay a sparse map, keyed per band.
- **Pixel layers per band:** one canvas (or ImageData) per band for paint and for the base layer,
  made on first paint. An empty band costs nothing. This replaces `PaintLayer`'s single canvas,
  and History's 64 px tiles become band patches.
- **Derived cells computed per band, lazily for the bands in view.** The image pipeline is the
  hard part: Sharpen, Edges and Flatten read neighboring pixels, so a band needs a halo of those
  passes' radius. And Color count is a global statistic. The cheaper way out is a product
  decision: **the picture covers a bounded area** (it's letterboxed already), and the rest of a
  long document is canvas, so the pipeline stays one bounded WebGL pass.

How deep it goes (from a count of the code): about 48 sites in 16 files index the flat cell
arrays (`cellIndex`, `cells[...]`, `composedCells`, `renderedCells`), and 35 sites outside
`PaintLayer` use layer or output canvases directly (23 of them in `Renderer.js`). That covers:

- `src/document/Renderer.js`: the whole compositor works on one output canvas.
- `src/document/PaintLayer.js` and `History.js`: one canvas, snapshots, tiles.
- `src/store/project/rendering.js`, `editLayer.js`, `baseLayer.js`, `reading.js`, `selection.js`
  (blocks are canvases), `merging.js` (whole-layer snapshots, whole-grid scans), `document.js`
  (save and load).
- `src/document/projectIO.js`: the format becomes per-band, with a version bump, a migration from
  today's single PNGs, and new reference fixtures under `tests/fixtures/reference`.
- `src/lib/Cells.js`, `AnsiFile.js` (export by band, streaming), `CellCanvas.js` (packs from
  bands), `InputEditor.vue`, `src/tools/bucket.js` and `eraser.js`.

The actions mostly call a handful of primitives (`updateCells`, `setCells`, `composite`, layer
`paint`, `erase`, `pasteCells`, `snapshot`), so most of the work is behind those primitives. But
selection blocks, merges and undo entries all assume one canvas per layer.

**Estimate: 5 to 8 weeks**, high risk. It touches nearly every store action, the file format, the
reference outputs (exact-pixel claims that the whole test suite leans on) and Safari. Do it only
when 1M+ cells, iOS, or collaboration is committed to.

## 4. Several people in one file

Nothing exists to build on: the `networking` worktree (`~/orca/workspaces/phosphor/networking`)
has no collaboration code, the app is a static site, and there's no backend, accounts or
persistence.

### What scoping by region would buy

- **Loading and bandwidth.** A client subscribes to the bands in view (plus a margin). Edits
  elsewhere arrive as "band N is now version v" and are fetched only when scrolled to. Generated
  cells are derived from the image, settings and position, so only the image (once), the
  settings, and edits travel.
- **No conflicts between people in different bands.** Each band has its own version, and an edit
  applies to the version it was made against.
- **Undo that stays local.** Each person's undo is a log of their own ops. Undoing touches only
  the bands those ops touched.

### What it wouldn't

- **Global settings.** Sliders, effects, the palette, the seed, the character set and the render
  style re-render everyone's view. They're tiny to send but change everything, so they need one
  owner or a document-level lock, and each change is a shared history entry. **Color count**
  picks its palette from the whole composited picture (`Renderer.js:158-165`), so one person's
  stroke anywhere shifts everyone's colors. In collaboration it would have to be pinned (computed
  on demand, then fixed).
- **Operations on the whole document:** Bake and Into the image (they replace the image), a
  canvas resize or rescale, Merge down or up with no selection, Clear edit layer. These need the
  server to order them, with every client's bands bumped to a new document version, or they're
  blocked while others are editing.
- **Edits that cross regions.** A Paint Bucket fill has no bounds (it covered the whole document
  in the benchmark). It must be confined to loaded bands or a region, and its result sent as a
  mask, not as "fill from x, y". Paste and move touch a source and a destination, so the op
  covers two bands at once. Typing near a band edge can break a wide character, and Connect reads
  its neighbors, but row bands keep both inside one band horizontally. A box drawn across two
  bands is a two-band op.
- **Base pixels from moves aren't reproducible.** A moved block of the base copies the processed
  picture (`selection.js:41-58`), which comes from WebGL, and GPUs round differently
  (`docs/testing.md`, "Software WebGL"). So base edits have to be sent as pixels, not replayed as
  ops. Paint ops are integer math on ImageData (`PaintLayer.js:91-134`) and could replay exactly,
  but sending band patches is simpler and has no determinism risk.
- **Undo today.** A history entry closes over the whole `editCells` and `baseRecords` maps and
  swaps them back in (`history.js:13, 29-35`). Paint undo puts back whole 64 px tiles
  (`PaintLayer.js:346-351`). Merges, Clear and Bake restore whole-layer snapshots. With anyone
  else editing, each of these would erase their work, anywhere in the document for the maps, or
  in the same tile for paint. Undo has to become inverse ops per cell and per band patch, with a
  rule for "someone changed this since": skip it, or refuse with a message. That rewrite is worth
  having single-user anyway: it's what lets undo refresh only what it touched instead of
  re-rendering (150 to 330 ms today at 800k cells).

### Recommended shape for a first version

Use row bands as regions. A person **claims** a band range to edit, and others see it as taken,
with presence showing who's where. The server is authoritative per band and keeps a version and
an op log for each. Edits are cell ops (a sparse map per band: last write wins, with no conflicts
inside a claim) and band pixel patches. Global settings and whole-document operations go through
the server, one at a time. This matches what the owner described, "each view only cares about the
area it shows", and avoids a CRDT over pixels. Free-for-all concurrent editing in the same band
(CRDT or OT) can come later, if people actually want it.

## 5. Stages, sizes and what each unlocks

Sizes are for one developer who knows the codebase, with the tests and docs that AGENTS.md asks
for. They're estimates.

| Stage | What | Size | Unlocks | Risks |
| --- | --- | --- | --- | --- |
| **1. Viewport drawing** | Sizer plus sticky canvas in the ANSI view (`CellCanvas` window and offsets) and the pixel view; virtualized DOM view. **Done** on branch `jejacks0n/viewport-rendering-investigation`, in both views (the DOM view still draws the whole grid). A window redraw measured about 1.4 ms at any grid length (bench, `viewportRedrawMs`), against 90 ms for 800k cells drawn whole. | **1 to 1.5 weeks** (cheap) | No canvas-view ceiling: the ~1,000-line limit in the limits work goes away. Sharp text on retina at every size, today's 300 x 150 included. Constant 1.4 ms redraws. | iOS scroll lag on a sticky canvas; DPR changes; spills and shade alignment at the edges. |
| **1b. Limit follow-ups** | Blank canvas below the texture limit (`BLANK_CANVAS_SCALE`); a picture's processed size capped to the texture limit; base scale 1 for tall grids; `projectIO` validation against the new limits. | **2 to 3 days** | 80 x 10,000 and up opens, renders and round-trips. | Changing the processing scale changes outputs: reference files to regenerate and read. |
| **2. Edits cost what they touch** | In payoff order: `updateCells` reads only the touched pixels (`Renderer.js:267`, half a day). Undo and redo refresh the touched area instead of `render()` (1 to 2 days). Composite and palette snap a dirty rect (`Renderer.js:137-155`, 2 to 3 days). `layoutWide` and `setCells` only on changed rows, with views told which rows changed (2 days). `#baseGrid` per dirty band (2 days). Flood fill with a typed queue and a pixel mask instead of objects (2 days). Streaming export (half a day). History capped by bytes, not 50 steps (1 day). Color count from a sample or incremental histogram (1 to 2 days). | **2.5 to 3 weeks** (medium) | 80 x 10,000 feels like 300 x 150 does today. The cell cap can likely go to about 1M (estimate). | Reference outputs must stay byte-identical. Each item is separate and shippable on its own. |
| **3. Tiled document** | Row bands of typed-array cells and band canvases; band patches in history; per-band save format and migration; derived cells per band; a bounded picture area. | **5 to 8 weeks** (expensive) | 10M cells; iOS at large sizes; the unit for collaboration. | Touches most of `src/store/project/*` and `src/document/*`; file format; reference fixtures; performance regressions. |
| **4a. Op-based history** | Inverse ops per cell and band patch; "changed since" rule. | **2 to 3 weeks** (part of 3 if done together) | Collaboration-safe undo; cheaper undo single-user. | Behavior changes in undo that people rely on (floating moves, typing runs, slider steps). |
| **4b. Collaboration MVP** | Backend (rooms, persistence, auth), sync of settings and band ops, band claims, presence, server-ordered global ops. | **6 to 10 weeks** plus hosting and operations (expensive) | Several people in one file, each in their own region. | No backend today; product decisions (accounts, hosting, cost); global ops and Color count semantics; offline and reconnect. |

**Cheap:** stage 1, stage 1b, and most single items in stage 2. **Expensive:** stage 3 and stage 4.

**What to do first:** stage 1. It's self-contained, it improves today's documents (retina
sharpness), and it removes the reason the limits work stopped at about 1,000 lines. Then stage
1b and stage 2 in the order listed, raising the cell and line limits after each step ships with
its measurement. Stop there unless 1M+ cells, iOS at large sizes, or collaboration is wanted;
those are the only reasons for stage 3. If collaboration is wanted, plan stages 3 and 4a together
(both replace the same snapshot-based code) before any network work.

## Kept from this investigation

- `bench/large-documents.bench.js` and `bench/vitest.config.js`: the benchmark above, outside
  `npm test` (lint covers it). Rerun it after each stage to see the numbers move.
- No app code, tests or reference files were changed.
