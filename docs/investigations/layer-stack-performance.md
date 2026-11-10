# Investigation: the layer stack's performance

Question: where does phase 2 of the layer stack (an ordered list of cells and vector layers, composed cell by cell
above a lower group) get slow or heavy, and what would it take to fix each place before tasks 6 to 10 build on it?

Written 2026-11-09 against `jejacks0n/ux-revisions` at `b63d7c30` (phase 2's tasks 1 to 5, from `08a1a84b`).
Investigation only: no app code or test changed. The numbers come from two scratch benchmarks kept outside the repo
(see [How this was measured](#how-this-was-measured)); the one in `bench/` was not changed.

**Measured** means a number from the scratch benchmark on this machine. **Estimate** means judgment from the code,
usually by multiplying a measured per-cell cost. Sizes are *cols x lines*; `rows` in the code counts pixel rows, two
per line. "The limit" is 300 columns, 5,000 lines, 500,000 cells (`src/lib/Cells.js:22`), measured here as
100 x 5,000 (500k cells). "An upper layer" is a layer above the lower group (`src/document/layerInfo.js:91-97`).

The plan's constraint was: an edit never redraws every layer, and an edit on an upper layer touches only the cells
in its rect. **Per edit, that holds** (a Pencil move on the top of 16 layers at the limit is 0.4 to 3.8 ms,
measured). **Per whole-grid pass, it doesn't yet:** every pass that lays the stack over the whole grid reads every
upper layer's paint one pixel at a time, and those passes are what a hide, a move, an undo of an add, a slider step
and every animation frame run. That one cost is behind five of the ten areas below.

## What was done (2026-11-09, `jejacks0n/ux-perf`, from `26d11788`)

The numbers under **Done** in each area below are from the same scratch benchmarks, run before and after on this branch
(`composeUpper` had already been moved to one read per layer per compose, so the "before" column here is that state,
not the 23.8 s of the first measurement). Everything else in the areas stands as written. Changes, each a commit:

| Area | Change | 100 x 5,000, 16 upper layers: before → after |
| --- | --- | --: |
| 11 | `reaching` searches a grid of what stored colors show | 190 µs → 18 µs a lookup; 9% → 0.2% of lookups more than 1 off |
| 1, 2 | a whole-grid compose visits only the cells the upper layers touch | 527 ms → 21 ms |
| 2 | hide, show, move, add of an upper layer: no pipeline (the output re-read) | 500 → 55 (hide), 50 (show), 71 (move) ms |
| 6 | a layer's PNG kept while its paint's version stands; a pick schedules no write | `projectParts` after a one-cell edit 103 → 6 ms |
| 3 | a rename keeps built frames | frames rebuilt on rename: yes → no |
| 5 | an upper-only undo or redo never runs the pipeline | undo of a whole-layer fill 85 to 129 → 55 to 82 ms |

Not done: areas 4 (memory), 7 (the drag's growth with layers), 8, 9 and 10; what's left is under each.

One deliberate output change: a Merge down of paint under Color ASCII with a slider off its default (area 11) now stores
a color that shows nearer the shown one than the old descent found, where the two differ. It shows the same or nearer;
no reference fixture changed.

## Summary

Ranked by how much a real user would feel each, worst first.

1. **`composeUpper` reads each upper layer's paint a pixel at a time, over the whole grid.** Measured: 2.7 µs a cell a
   layer; a whole-grid pass is 1.4 s with one upper layer at the limit and 24 s with 16. Everything below that runs
   whole inherits it.
2. **Showing, hiding, moving or un-adding a layer re-runs the whole pipeline and the whole compose.** Measured: 1.4 to
   24 s a click at the limit, 0.15 to 2.1 s at 300 x 150. Slider steps too.
3. **Animation builds and frame swaps scale with layers.** Measured at 200 x 100: building two frames 15 ms with no
   upper layer, 500 ms with four; a frame swap 33 ms to 250 ms. Playback and scrubbing stutter with a few layers.
4. **Memory: a full-size paint canvas per cells layer, made the moment a layer is picked, plus two grids per upper
   vector layer.** Measured 4 MB a layer at the limit (68 MB for 17); estimate 26 MB a layer, 1.7 GB at 64 layers,
   for a photo at 300 x 300. Task 6's delete and duplicate hold or copy these.
5. **Undo and redo of an upper-layer edit go through the lower group's pipeline**, and a large one falls into a full
   render. Measured 13 to 33 ms for a small stroke; estimate seconds for a fill's undo with many layers.
6. **Every autosave write encodes every layer.** Measured 9 ms (1 layer) to 192 ms (16 layers at the limit) per write,
   and picking a layer schedules one.
7. **Upper vector layers: a full canvas at the base's scale each, drawn whole on every grid change and hide, and a
   shape drag that walks every layer under its rect.** Measured: a drag step 8 ms with one cells layer, 46 ms with 16.
8. **Edits on the lower group now walk the upper layers and copy the whole cells array once more.** Measured 0.2 to
   0.6 ms a move at 45k; 2 ms per extra copy at the limit. Small today, grows with layers and Task 8's selections.
9. **Layer swaps (`useLayer`, `onLayer`) are cheap, but each one commits the open edit, bumps `_frameSwaps` and fires
   the sync watchers.** Fine alone; Task 8 will do two swaps and a slice per layer per selection move.
10. **The LAYERS list re-renders every row on every change, and a drag measures every row on every pointer move.**
    Estimate under 1 ms at 64 rows; the lowest priority, noted so Task 6's menu doesn't make it worse.

## 1. `composeUpper` reads paint a pixel at a time

**What's slow and when you'd feel it.** `Renderer.composeUpper` walks the cells it's given, bottom to top through
`this.upper`, and for each upper cells layer that has any paint anywhere (`painted = !!u.paint?.hasPaint`) it reads
the cell's two grid pixels with `paint.pixelAt`, which is a `getImageData(x, y, 1, 1)` on the layer's canvas. That's
two canvas readbacks per cell per layer, whether or not any paint is near the cell. Per edit the walk is the edit's
cells, so a stroke is fine. But a whole-grid walk (`indexes === null`) runs on every `applyEditCells`, which every
render, hide, show, move, add's undo, slider step, Number palette recount, and large shape change calls, and on
every animation frame built. A user with a few layers feels every one of those as a stall of seconds.

**Where.** `src/document/Renderer.js:741-755` (`composeUpper`), `:765-800` (`#upperCell`: `painted` and the two
`#upperPaintAt` calls at `:784-785`), `:827-833` (`#upperPaintAt`), `src/document/PaintLayer.js:182-187`
(`pixelAt`). Called whole from `src/store/project/rendering.js:180-184` (`overLower`) by `applyEditCells`
(`:227-238`), and from `src/document/FrameBuilder.js:143`.

**Evidence.**

Measured (upper layers each with a 40 x 40-cell patch of paint, so almost every cell has no paint over it):

| | 300 x 150 (45k) | 100 x 5,000 (500k) |
| --- | --: | --: |
| `composeUpper` whole, 1 upper layer | 123 ms | 1,436 ms |
| 4 upper layers | 491 ms | 5,755 ms |
| 16 upper layers | 2,059 ms | 23,815 ms |
| `applyEditCells` (composeAll + the above + rows) with 16 | 1,971 ms | 23,537 ms |
| Pencil move on the top layer, over the patch (16 layers) | 0.27 ms | 3.8 ms |
| Pencil move on the top layer, clean cells (16 layers) | 0.23 ms | 0.4 ms |

That's 2.7 to 2.9 µs per cell per painted layer, linear in both. The micro numbers: `pixelAt` 1.8 µs a call,
`getImageData(…, 1, 1)` 0.6 µs a call, and reading the **whole** 600 x 600 paint canvas once 0.3 ms
(`gridPixels` 0.3 ms at 45k, 1.3 ms at the limit). With one layer painted everywhere at 45k the whole walk is
153 ms (random characters), 204 ms under Best match and 315 ms under By shape, so `#upperChar` adds 1.4 to 3.9 µs a
converted cell on top. The transforms (brightness, say) add about 10% (`#upperPaintAt` runs `applyTransforms` on a
4-byte array per pixel).

Estimate: these were measured on headless Chromium's software 2D canvas. On a GPU-backed canvas a 1 x 1
`getImageData` is a GPU readback and commonly costs tens of microseconds, so a real browser may be several times
worse, not better.

Smaller costs in the same walk, measured: `cellKey` string building for the `exact` check and each layer's
`u.cells.get(cellKey(...))` (`:766, :784`) is 33 ms per 500k lookups per layer; `halfColors(cell)` and the
`[top, bottom]` array allocate per cell per vector layer (`:775-779`).

**How it scales.** Time = cells x painted upper layers x 2.8 µs. Frames multiply it again (area 3). Grid size is
linear. A layer with one dot of paint costs the same as one painted all over.

**Directions.**

- Read each upper layer's paint **once per compose** at grid resolution, as the lower path already keeps
  `#paintData` from `#drawLayer` (`Renderer.js:594-599`): a `gridPixels()`-style `ImageData` per upper layer, with
  the transforms applied once, cached by `paintLayer.version` and refreshed over `changedSince` rects the way
  `#gridOf` does (`:513-532`). Then `#upperCell` indexes bytes. Tradeoff: one `cols x rows x 4` buffer per upper
  cells layer (4 MB each at the limit; see area 4) and a cache to keep in step.
- Skip layers that can't reach a cell: keep a paint bounds rect per `PaintLayer` (grown in `#changed`) and a cells
  layer's key set, and walk only layers whose bounds or keys cover the cell. For a whole-grid pass, iterate the
  union of each layer's keys and painted rect instead of every cell. Tradeoff: bounds only shrink on `recheckPaint`,
  so a layer painted then erased stays "wide" until then.
- Task 7 (per-layer characters) will push whole layers out of the lower group, so a document whose edit layer has
  its own characters converts **all** of that layer's paint through `#upperChar` on every pass. Design the once-per-
  compose read before that, and give `#upperChar` a batch path (`resolveGrid` over the layer's painted rect, not one
  1 x 2 grid per cell: `:814`).
- Task 10's `countCanvas` should draw from the same per-layer grids, not re-read canvases.

**Done when** a whole-grid compose at the limit with 16 upper layers is under 500 ms (today 23.8 s), and under 60 ms at
45k (today 2.1 s; `composeAll` alone is about 20 ms there). Add a `bench/` row: `composeUpperFullMs` at 1, 4 and 16
upper layers, each with a small patch of paint.

**Done.** `composeUpper` with `indexes === null` now visits only the cells some upper layer touches (`#touched`: a cells
layer's keys and the pixels of its paint at grid resolution, a vector layer's `reachedCells`), and `#upperCell` builds
the cell's key once instead of once per layer. Measured, whole compose: 45k with 1 / 4 / 16 upper: 6.7 / 14 / 48 ms →
1.2 / 2 / 7 ms; the limit: 84 / 174 / 527 ms → 1.9 / 5.7 / 21 ms. A layer painted all over at 45k is unchanged (17 ms:
every cell is touched), as is a layer with its own character settings (the `layer-chars` bench, 24 to 119 ms: each cell
through `#upperChar`, which the character-picking work owns). Left: `#touched` scans each layer's grid bytes on every
whole compose (about 1 ms a layer at the limit); keep the touched list per paint version if that ever shows.

## 2. Showing, hiding, moving or un-adding a layer re-renders everything

**What's slow and when you'd feel it.** `setLayerHidden`, `moveLayer` and `addLayer`'s undo and redo all call
`this.render()`, which re-runs the WebGL pipeline on the picture, `cellsFromOutput` over the whole output, then
`applyEditCells` (area 1 whole). None of those changed the picture or its settings. A slider step does the same by
design, but now carries area 1 too. With a few layers, every eye click is a multi-second freeze; with one upper
layer at the limit it's 1.4 s.

**Where.** `src/store/project/layers.js:22-26` (`setLayerHidden` → `render`), `:38, :42` (`addLayer`'s `without`
and `withIt`), `:58` (`moveLayer`'s `order`); `src/store/project/rendering.js:125-149` (`render`), `:227-238`
(`applyEditCells`).

**Evidence.** Measured, with each upper layer carrying a 40 x 40 patch:

| | 300 x 150, 1 / 4 / 16 upper | 100 x 5,000, 1 / 4 / 16 upper |
| --- | --: | --: |
| Hide the top layer | 30 / 379 / 1,978 ms | 25 / 4,323 / 22,487 ms |
| Show it again | 156 / 531 / 2,103 ms | 1,429 / 5,881 / 23,905 ms |
| Move it (`moveLayer`) | 150 / 529 / 2,088 ms | 1,433 / 5,914 / 24,022 ms |
| Undo the move | 128 / 510 / 2,099 ms | 1,457 / 5,985 / 23,984 ms |
| A slider step (brightness) | 151 / 516 / 2,146 ms | 1,536 / 5,942 / 24,426 ms |

Hiding the only upper layer is cheap (no upper left to compose) and shows the pipeline's own cost: about 25 to
30 ms. Everything above that is area 1. Before layers, a slider step at 500k was 150 to 300 ms
(`viewport-rendering.md`).

**How it scales.** The pipeline part is linear in grid; the rest is area 1's cells x layers.

**Directions.**

- Don't call `render()` for a change that doesn't touch the picture or its settings. When the hidden or moved layer
  is upper and the lower group's membership is unchanged, `applyEditCells()` (or better, a `composeUpper` over the
  layer's painted rect and keys only) is enough. When the lower group changes (a layer joins or leaves it, the
  base's eye), `composite()` then `rebuildCells()` re-reads the output without re-running the shaders. Tradeoff: one
  more branch in `layers.js` that must agree with `lowerGroup`; a wrong branch shows stale cells, so cover it in
  `incremental-cells.test.js`'s "partial equals full" style.
- With area 1 fixed, the remaining whole-grid walk is `composeAll` plus a byte-indexed compose, so a slider step
  returns to its pre-layers cost plus a few ms per layer.
- Task 6: `deleteLayer` and `duplicateLayer` will land in the same place; route them through the same "lower group
  changed or not" decision, not `render()`.

**Done when** hide, show and move of an upper layer at the limit with 16 layers take under 100 ms, and a slider step
is within 50 ms of its single-layer cost. Add `hideTopMs`, `moveLayerMs` and `sliderMs` at 1, 4 and 16 upper layers to
`bench/`.

**Done.** `setLayerHidden`, `moveLayer` and `addLayer` (with its undo and redo) go through `redrawn` in `layers.js`:
when the lower group's membership and the base's eye are as they were, and the palette isn't the Number palette (it
counts every layer's pixels bottom to top, so a move over another layer's paint changes it), `syncShapeLayers` +
`rebuildCells` (the cells read again from the output as it is, then the upper layers over them) and no pipeline; else
`render()`. `applyEditCells` alone wasn't enough: it lays edits over the last full render's cells, which a stroke on the
lower group's layer leaves behind (the output canvas is current, `renderedCells` isn't), so a hide after such a stroke
showed the cell from before it. Measured at the limit with 1 / 4 / 16 upper: hide 35 / 188 / 500 → 38 / 39 / 55 ms,
show 130 / 218 / 514 → 33 / 43 / 50 ms (two frames of `settled`), move 140 / 241 / 522 → 59 / 41 / 71 ms; the
`cellsFromOutput` re-read is 20 to 30 ms of that at 500k cells. A slider step (`renderMs`) is 108 / 116 / 156 ms at
the limit, from 188 / 288 / 607: the pipeline plus a few ms a layer. Left:
`deleteLayer`, `duplicateLayer` and `addPictureToLayer` still `render()` through `stackStep` (they're one-off), and a
move of a layer with no paint and no cells still composes.

## 3. Animation: every frame built and every swap composes the stack whole

**What's slow and when you'd feel it.** `FrameBuilder.build` runs `composeUpper(cells, null, …)` over every cell for
every frame (area 1, once per frame), after `paintImage` makes a full `ImageData` and `loadGrid` redraws a full
scratch canvas for each upper cells layer. `arrive` (a frame swap) does `paintImage` + `loadGrid` + `gridPixels` per
cells layer, then a composite and `rebuildCells` (area 1 whole again). `liveStates`, run by `note` on every
`builtFrame`, reads `gridPixels()` per layer with paint and loops every pixel of it. Scrubbing and playing a movie
with a few layers lag; building a 24-frame movie with four upper layers at the animation limit (40k cells) is
estimated at 12 s before playback starts.

**Where.** `src/document/FrameBuilder.js:56-73` (`prepare`: a scratch `PaintLayer` and an alone `ShapeLayer` per
upper layer), `:78-97` (`#split`), `:129-153` (`build`: `loadGrid` at `:140`, `composeUpper` at `:143`,
`shownCanvas` copied at `:151`); `src/store/project/animation.js:41-69` (`liveStates`), `:84-128` (`arrive`:
`paintImage`/`loadGrid`/`gridPixels` per layer at `:103-113`, the composite at `:127`), `:488-494` (`buildKey`).

**Evidence.** Measured at 200 x 100 (20k cells), two frames, upper layers each with a 40 x 40 patch:

| upper layers | 0 | 1 | 4 |
| --- | --: | --: | --: |
| Show frame 0 / frame 1 | 34 / 33 ms | 83 / 67 ms | 251 / 248 ms |
| `noteFrame` | 2.0 ms | 2.5 ms | 6.6 ms |
| Build both frames, first time | 15 ms | 129 ms | 501 ms |
| Rebuild both (`staleFrames(0)`) | 3.9 ms | 119 ms | 483 ms |
| Renaming a layer invalidates every built frame | yes | yes | yes |

Per frame per upper layer that's about 57 ms at 20k cells: area 1's 2.8 µs a cell. Estimate at the 40k animation
limit, 24 frames, 4 upper layers: 24 x 4 x 40k x 2.8 µs ≈ 11 s to build, and each frame swap ≈ 0.5 s.

`buildKey` stringifies `project.layers`, names included (`:492`), so a rename, which changes nothing a frame shows,
drops every built frame (measured: true). `prepare` allocates a full `PaintLayer` and `ShapeLayer` per upper layer
per builder (and a builder is made again on every `buildKey` change).

**How it scales.** Build time = frames x cells x upper layers x 2.8 µs. Swaps = cells x upper layers x 2.8 µs plus a
`paintImage` + `loadGrid` (two full-grid buffers) per cells layer. `liveStates` is cells x painted layers per note.

**Directions.**

- Area 1's fix removes the dominant term from both `build` and `arrive`.
- In `build`, compose only the cells an upper layer's states name (its keys and painted pixels are already in
  `upper.get(id)`), not every cell: the states are the sparse truth of what's on that layer for that frame.
- `buildKey`: key on `layers.map(({ id, kind, hidden }) => …)`, not the whole object, so a rename keeps the frames.
- `arrive`: skip `paintImage`/`loadGrid` for a cells layer whose states didn't change between the frame leaving and
  the one arriving (compare the frame's resolved map identity per layer); `liveStates` likewise only for layers whose
  `paintLayer.version` moved since `_arrived`.
- Task 6 adds "every frame's keys on a layer" to delete and duplicate: do it as one pass over each frame's `changes`
  map keyed by `keyLayer`, never a frame swap per frame.

**Done when** building a 24-frame movie at 40k cells with four upper layers (small patches) is under 1 s and a frame
swap under 60 ms; a rename keeps built frames. Extend the `animations` case in `bench/` with 1 and 4 upper layers.

**Done in part.** `buildKey` keys the layers on id, kind, eye and own character settings, so a rename keeps every built
frame (measured: it did invalidate, now it doesn't). Area 1's fix took the dominant term out of `build` and `arrive`:
at 200 x 100 with 4 upper layers, building two frames 39 → 24 ms, rebuilding them 28 → 13 ms; a frame swap is 33 ms
at any layer count (two frames of waiting). Left: `arrive` still does `paintImage` + `loadGrid` per cells layer and
`liveStates` reads every painted layer per note (7.7 ms at 4 layers); not measured as a problem at the animation limit.

## 4. Memory: a paint canvas per cells layer, two grids per vector layer

**What's at risk and when you'd feel it.** Each cells layer above the bottom holds a `PaintLayer`, a canvas of
`cols x scale` by `rows x scale` pixels. `swapLayer` makes one the first time a layer is picked, paint or not
(`paintLayer: next.paintLayer ?? new PaintLayer(...)`), and `arrive` makes one for any frame that has paint on it. An
upper vector layer with shapes gets an alone `ShapeLayer` (its own canvas at the base layer's scale, plus a `#chars`
array of every cell, plus a scratch canvas while it has art) and, in the Renderer, an `ImageData` and a canvas at
grid resolution (`#upperGrids`). `lowerCells` is a fourth full cells array beside `cells`, `composedCells` and
`renderedCells`. Canvas memory is GPU or compositor memory, not the JS heap, so the heap numbers below hide it; the
tab dies or the page is evicted on iOS long before a heap profiler shows anything.

**Where.** `src/store/project/shared.js:61-70` (`swapLayer`, the layer made at `:68`), `src/store/project/animation.js:111`
(`arrive`), `src/document/PaintLayer.js:26-29` (`editScaleFor`), `:61-68`; `src/document/ShapeLayer.js:109-111`
(the alone canvas and `#chars`), `:277` (scratch); `src/document/Renderer.js:74, :506-510, :524, :859`
(`#upperGrids`: an `ImageData` and a canvas per layer); `src/store/ProjectStore.js:108` (`lowerCells`);
`src/document/layerInfo.js:57` (`MOST_LAYERS = 64`). `FrameBuilder.js:64-71` makes another scratch `PaintLayer` and
`ShapeLayer` per upper layer per builder.

**Evidence.** Measured (`editScaleFor` with a 400 x 400 picture):

| grid | scale | one paint canvas | 64 of them |
| --- | --: | --: | --: |
| 80 x 25 | 8 | 640 x 400, 1.0 MB | 66 MB |
| 300 x 150 | 2 | 600 x 600, 1.4 MB | 92 MB |
| 300 x 300 | 2 | 600 x 1200, 2.9 MB | 184 MB |
| 200 x 1,000 | 2 | 400 x 4000, 6.4 MB | 410 MB |
| 100 x 5,000 (the limit) | 1 | 100 x 10000, 4.0 MB | 256 MB |

Measured in the stack run: 17 canvases, 68 MB at the limit; picking 16 unpainted layers made 16 canvases in 0.01 ms
each (the allocation is lazy in Chromium, so the time hides the memory). The upper vector layer's alone canvas at
the limit was 200 x 20,000 (16 MB) plus the 4 MB grid `ImageData` and 4 MB canvas.

Estimate: `editScaleFor` wants the picture's own resolution, so a 4,000-pixel photo at 300 x 300 gives scale 6
(`floor(4000 / 600)`): 1800 x 3600 = 26 MB a layer, 1.66 GB at 64. The `MOST_LAYERS` comment says each layer can
hold a full canvas; nothing caps the total. iOS Safari caps total canvas memory per page far below that.

**How it scales.** Linear in cells layers picked or painted, in grid pixels and in scale². Frames don't multiply
it (one set of layers), but each `FrameBuilder` adds a full set for the upper layers.

**Directions.**

- Make a layer's `PaintLayer` on first **paint**, not first pick: `swapLayer` can leave `paintLayer` null and
  `paintEditPixels`/`eraseEditPixels` (through `ensureLayer`) make it. Tradeoff: every writer that reads
  `this.paintLayer` without `ensureLayer` first needs a null check (`beginEdit` returns early on `!this.paintLayer`
  at `history.js:26`, which would skip recording a typing edit on a fresh layer: fix that first).
- Free the canvas when `hasPaint` goes false after an erase or undo (`recheckPaint`), keeping only `editCells`.
- Cap the scale by the stack: `editScaleFor` could take the number of cells layers and lower the scale so
  `layers x canvas bytes` stays under a budget (say 256 MB, `MAX_HISTORY_BYTES`'s size), re-sampling existing paint
  as a canvas resize does (`extend`). Tradeoff: paint already laid at a higher scale softens; reference files may
  change. Decide before Task 6 (duplicate copies a canvas; delete keeps one in history).
- Task 6: `deleteLayer`'s undo entry must charge `bytesHeld({ canvas })` for the layer's paint on every frame
  (`addLayer`'s entry says `bytes: 0`, `layers.js:44`), or 50 deletes hold 50 canvases outside the 256 MB budget.
- Vector layers: the alone `ShapeLayer` draws at the base's scale so its shapes sample like the lower group's, but
  the Renderer then averages it down to grid resolution anyway (`#gridOf`); drawing alone layers at grid resolution
  (scale 1) would cut 16 MB to 4 MB at the limit at the cost of a visible difference in anti-aliasing against the
  lower vector layer's. Owner's call.

**Done when** picking a layer allocates nothing, a document with 16 unpainted layers holds one paint canvas, and a
budget test asserts total paint canvas bytes stay under a stated cap at the limit with `MOST_LAYERS` layers. Add a
`canvasMB` column to the `bench/` rows.

**Not done.** Only picked layers and painted frames make canvases, as before. Note for whoever takes it: Chromium (and
WebKit) don't commit a canvas's backing store until it's first drawn to or read, so an unpainted layer's `PaintLayer`
costs its JS object until the first stroke; the 68 MB in the table is width x height x 4, not memory held. The real
cost is painted layers at high scale (the 26 MB a layer estimate), which only a scale cap by layer count addresses. The
`this.paintLayer` readers (28 sites in `src/store/project`) are why "make it on first paint" wasn't attempted here.

## 5. Undo and redo of an upper-layer edit run the lower group's pipeline

**What's slow and when you'd feel it.** `applyChange` writes each layer's cells and runs where they live, then calls
`refreshChanged(...)` → `refreshCells(pixels)` → `composite({ rect })` + `recompose(pixels)`: a partial composite of
the lower group over the rect, `updateCells` reading the output there, then `overLower(indexes)`. For a change that
touched only upper layers that composite and read are wasted, and `runsPatch(runs)` is paired with `this.paintLayer`'s
scale for every layer's runs. Past a quarter of the grid `changedPixels` returns null and `refreshChanged` calls
`render()`: the whole pipeline and area 1 whole, for an undo of a fill on an upper layer. `commitEdit` has the same
shape under Number palette or dither (`history.js:104-108`).

**Where.** `src/store/project/history.js:207-251` (`applyChange`; `refreshChanged` at `:246`), `:283-287`
(`refreshChanged`), `:433-468` (`changedPixels`, the quarter at `:434`); `src/store/project/rendering.js:222-225`
(`refreshCells`), `:189-193` (`recomposeEdit`, which already routes by `editIsUpper` for live edits but isn't used
here).

**Evidence.** Measured, a 10-move Pencil stroke on the top layer undone and redone (includes a `settled` wait):

| | 300 x 150, 1 / 4 / 16 upper | 100 x 5,000, 1 / 4 / 16 upper |
| --- | --: | --: |
| Undo | 6.7 / 12.1 / 17.2 ms | 16 / 13 / 17 ms |
| Redo | 30.5 / 33.3 / 28.3 ms | 33 / 33 / 33 ms |

Small, and mostly the rect composite (redo's extra is `#ditherUnder`/`#resolveUnder` bookkeeping plus the
`settled` frames). Estimate: an upper-layer Paint Bucket fill of more than a quarter of the grid, undone, is a
`render()`: 1.4 s with one upper layer at the limit, 24 s with 16 (area 2's numbers), where the fill itself
(`refreshEdit` → `recomposeUpper`) walks only its own cells.

**How it scales.** Linear in the undone rect for small changes; a cliff to area 1 whole past a quarter of the grid.

**Directions.**

- In `applyChange`, group the changed pixels by `keyLayer`/run id and route as `recomposeEdit` does: if every
  changed layer is upper, `recomposeUpper(pixels)`; if any is the lower group's, today's path. Tradeoff: two code
  paths to keep equal, which `incremental-cells.test.js`'s "partial equals full with upper layers" already checks.
- Lift the quarter-of-the-grid cliff for upper layers: `recomposeUpper` over the layer's rect is cheaper than a
  render at any size once area 1 reads bytes.
- Task 6's delete/duplicate and Task 9's merges are `pushWholeLayer` steps whose undo calls `this.render()` by
  habit; give `pushWholeLayer`'s callers the same lower-or-upper routing.

**Done when** undo of an upper-layer fill covering the grid at the limit is under the fill's own cost (today a render)
and `renderer.composite` is never called for an undo whose keys are all upper (a spy test, as "an edit on an upper
layer doesn't run the lower group" does).

**Done.** `applyChange` groups the written layers; when none is the lower group's cells layer or the base, no base pixels
or pins changed, and the settings don't need the composite (Number palette, a carried error, held dither: as `commitEdit`
decides), and every written layer is there, it calls `recomposeUpper` over the changed pixels, or `rebuildCells` (the
output as it is, a whole sparse compose, no pipeline) past a quarter of the grid; a layer with no paint yet contributes
no runs. Measured, a fill of the whole top layer undone, at the limit with 1 / 4 / 16 upper:
85 / 115 / 129 → 59 / 68 / 82 ms; at 45k 36 / 31 / 35 → 29 / 22 / 29 ms. `renderer.composite` is never called for
such an undo (spy test in `layer-stack.test.js`). Left: redo of that fill is 300 to 433 ms at the limit, which is the
ledger's per-pixel runs (`writeRuns` over a million pixels), not the stack; `pushWholeLayer`'s callers (delete,
duplicate, merges) still `render()`.

## 6. Autosave writes every layer on every write

**What's slow and when you'd feel it.** Each autosave write runs `projectParts()`, which in the stack form encodes
**every** painted cells layer's canvas to PNG (`toBlob`) and serializes every layer's `editCells`, then
`writeProject` copies them into one blob, then `keepLedger`. The watcher that schedules a write fires on
`editCells` changing, and `swapLayer` replaces `editCells` on every pick, so picking a layer schedules a full write
(the `_frameSwaps` check only stops it counting as an edit). Writes happen `SAVE_AFTER_MS` after edits stop and at
least every `SAVE_AT_LEAST_EVERY_MS`, so a drawing session with many painted layers spends a growing slice of its idle
time encoding PNGs, on the main thread.

**Where.** `src/composables/useAutosave.js:200-214` (the watch; `JSON.stringify(project.layers)` at `:206`),
`:109-176` (`writeOnce`: `projectParts` at `:137`, `writeProject` at `:143`, `keepLedger` at `:149`);
`src/store/project/document.js:345-373` (`projectParts`: `paintBlobs` at `:367`); `src/document/projectIO.js:51-68`
(`writeProject`).

**Evidence.** Measured (each upper layer with a 40 x 40 patch, so the PNGs are small):

| | 300 x 150, 1 / 4 / 16 upper | 100 x 5,000, 1 / 4 / 16 upper |
| --- | --: | --: |
| `projectParts()` | 9 / 30 / 24 ms | 61 / 80 / 192 ms |
| `writeProject` | 0.5 / 0.4 / 0.9 ms | 0.4 / 0.6 / 0.7 ms |
| File size | 26 / 54 / 167 KB | 110 / 265 / 885 KB |
| `editLayerSum` (rooms only) | 2.3 / 6.9 / 21.9 ms | 4 / 13 / 39 ms |

A 600 x 600 canvas painted all over takes 35 ms to `toBlob` (micro). Estimate: 16 layers painted all over at
300 x 150 is about 560 ms per write; at the limit with scale 1 canvases, several seconds. The write is async
(`toBlob` encodes off the main thread in Chromium), but `projectParts` reads every canvas first and the JSON
serialize is on the main thread.

`JSON.stringify(project.layers)` in the sync watcher is 64 small objects: not a cost.

**How it scales.** Linear in painted layers x canvas pixels per write, regardless of what changed.

**Directions.**

- Cache each layer's PNG blob keyed by `paintLayer.version` (and its `editCells` map identity) on the store, so a
  write re-encodes only layers that changed since the last write. Tradeoff: one blob held per layer (the PNG bytes,
  small) and a cache to invalidate on `loadGrid`/`load`/frame swaps, which bump `version` already.
- Don't `schedule()` on a swap: in the watcher, when `_frameSwaps` moved and nothing else did, return without
  scheduling. Tradeoff: the record's `editId`-dependent parts (none today: `projectParts` writes by id) stay as
  written.
- Task 6's duplicate and delete are one write each; fine. Task 8's "picture added as paint" makes a layer painted
  all over, so a photo layer's PNG is re-encoded every write until the cache exists.

**Done when** a write after a one-cell edit encodes one PNG, and picking a layer schedules no write. Test: spy on
`toBlob` across two writes with 4 painted layers.

**Done.** `PaintLayer.toBlob` keeps the PNG promise while `version` stands (a failed encode isn't kept), so a write
encodes only the layers that changed; the autosave watcher skips a scheduling when only `editCells` changed, the frame
number didn't and `_frameSwaps` moved (a layer pick). Measured `projectParts`: a second call with nothing changed
0.1 ms at every size; after a one-cell edit, 45k 2 / 4.5 / 15 → 1 / 0.9 / 0.8 ms (1 / 4 / 16 upper), the limit
13 / 42 / 103 → 6.7 / 6.1 / 6.4 ms (the base and the parts' serialization). A pick schedules no write
(`autosave.test.js`). Left: a first write after opening still encodes every painted layer, as it must.

## 7. Upper vector layers: full canvases, whole redraws, and a drag that walks the stack

**What's slow and when you'd feel it.** Each upper vector layer with shapes gets an alone `ShapeLayer`: a canvas at
the base layer's scale (`cols·k x rows·k`), redrawn **whole** whenever its size changes (`grid()` after a canvas
resize) or `hideBase` flips, after which `#reach` reads the whole canvas back and scans every pixel for which cells
a shape reaches. The Renderer then keeps `#upperGrid`, averaging that canvas down to grid resolution over changed
rects (first time: the whole grid). `shapesOfStack` walks every shape and compares every map entry on every
`syncShapeLayers`, which every render and `refreshShapes` calls, and `stacked` sorts with `rank`, a
`layers.findIndex` per comparison. A shape drag's `recomposeUpper` over its rect walks every upper layer under the
rect per cell (area 1), so dragging a shape gets slower with every cells layer in the stack.

**Where.** `src/document/ShapeLayer.js:56-67` (alone, `grid`), `:103-134` (`sync`: whole draw at `:107-117`),
`:250-299` (`#draw`), `:302-319` (`#reach`), `:45-51` (`hideBase` → `reset`); `src/document/Renderer.js:506-532`
(`#upperGrid`, `#gridOf`), `:1075-1101` (`baseGridPart`); `src/store/project/shared.js:129-144` (`shapesOfStack`);
`src/store/project/vector.js:75-92` (`syncShapeLayers`, `rank` at `:79`), `:690-714` (`redrawRects`);
`src/document/shapes.js:315` (`stacked`).

**Evidence.** Measured:

| | 300 x 150, 1 / 4 / 16 cells layers under it | 100 x 5,000 |
| --- | --: | --: |
| Add a vector layer on top and a rect (first alone sync, grid, compose) | 22 / 45 / 50 ms | 106 ms (16 under), 85 ms (over `edit` alone) |
| One drag step of the rect (30 x 30 cells) | 8.3 / 9.4 / 39.9 ms | 3.2 / 15.4 / 46.4 ms |
| Alone layer: whole resync (`reset` + `sync`), 200 x 20,000 canvas | | 14 ms |
| `composeUpper` whole with only the vector layer upper | | 50 ms |
| Hide / show that vector layer (a render) | | 21 / 123 ms |

So the vector path itself is cheap (50 ms for a whole-grid compose at the limit, 14 ms for a whole alone redraw);
the drag's growth from 8 to 46 ms is the cells layers under the rect (area 1), and the 16 MB canvas is area 4.

Estimate: `#reach`'s pixel scan is `cols·k x rows·k` per whole draw, 4M pixels at the limit with k = 2: tens of ms,
only on grid changes and `hideBase` flips. `shapesOfStack`'s per-call compare is O(shapes), fine at `MOST_SHAPES`.

**How it scales.** Drag = rect cells x upper cells layers x 2.8 µs. Canvases = vector layers x grid x k². Whole
redraws are per vector layer per grid change.

**Directions.**

- Area 1's fix takes the drag back to its single-layer cost.
- `syncShapeLayers`: build `rank` as a `Map<id, index>` once per call instead of `findIndex` per compare. Small.
- Consider drawing alone layers at grid resolution (area 4's tradeoff).
- Task 6 and Task 9: `copyShapes` and "a vector layer merged down freezes what shows" both need every cell a shape
  reaches: read it from the alone `ShapeLayer`'s `#chars`/`#upperGrid` rather than redrawing shapes.

**Done when** a shape drag step on a vector layer above 16 cells layers is within 2x its cost above one, at both
sizes. Add a `shapeDragMs` row at 1 and 16 under-layers to `bench/`.

**Not done.** A shape drag step above 1 / 4 / 16 cells layers is 1.4 / 2.5 / 4.3 ms at the limit (was 1.3 / 2 / 3.4):
the rect's cells each walk every layer in the indexed compose. Under the 2x target it isn't; it's also under 5 ms. The
`rank` map wasn't changed: with one shape it measures nothing.

## 8. Edits on the lower group now walk the upper layers and copy the cells again

**What's slow and when you'd feel it.** A Pencil move or keystroke on the lower group's cells layer (`edit` in an
old document) runs today's path (`composite` rect, `updateCells`), then `overLower(indexes)` →
`composeUpper(lowerCells, indexes, palette, composedCells)`, which starts with `composed.slice()`: a copy of the
whole cells array, on top of `updateCells`'s own `cells.slice()` and `layoutWideRows`'s `laid.slice()`. Then each
edited cell walks every upper layer (area 1 per cell). `applyEditCells` also loops every key of every shown cells
layer with `parseKey` to find rows that may hold wide characters (`:233-236`). None of it is big yet; it's the per-
edit tax that grows with layers and that Task 8's selections (every visible layer written per move) multiply.

**Where.** `src/store/project/rendering.js:162-167` (`recompose`), `:180-184` (`overLower`), `:227-238`
(`applyEditCells`, the rows loop at `:233-236`); `src/document/Renderer.js:742` (the `slice`), `:633`
(`updateCells`'s); `src/lib/Cells.js:171-189` (`layoutWideRows`).

**Evidence.** Measured, one Pencil move (4 pixels) on `edit` with upper layers above (each a small patch):

| | 300 x 150, 1 / 4 / 16 upper | 100 x 5,000, 1 / 4 / 16 upper |
| --- | --: | --: |
| Move on the lower group's layer | 0.19 / 0.16 / 0.34 ms | 1.22 / 0.53 / 0.64 ms |
| Keystroke on it | 0.14 / 0.13 / 0.16 ms | 0.41 / 0.29 / 0.39 ms |
| Move on the top layer, clean cells | 0.08 / 0.09 / 0.23 ms | 1.75 / 1.02 / 0.38 ms |
| `lowerCells.slice()` | 0.02 ms | 2.0 ms |

(Before layers a pencil move at 800k was 29 ms, so the 500k numbers here are better than the earlier
investigation's, thanks to PR #20's rect composites; the layer stack adds about one slice per edit.)

**How it scales.** Per edit: edited cells x upper layers x 2.8 µs, plus two to three whole-array copies (2 ms each at
the limit). `applyEditCells`'s rows loop is linear in total entries across all layers (a layer with 100k typed
cells adds 100k `parseKey` calls per render).

**Directions.**

- Skip `composeUpper`'s `slice` when it's given indexes: write into a copy made once by the caller (`recompose`
  already has `next` from `updateCells`; pass it as `out`). Saves one full copy per lower edit.
- Keep per-layer "rows with entries" sets alongside `editCells` (or compute the rows loop from each layer's key set
  only when its map identity changed), so `applyEditCells` doesn't re-parse every key every render.
- Task 8: `selectionEdit` over N layers through `onLayer` should gather all layers' pixels and call one
  `recomposeEdit`, not one per layer.

**Done when** a lower-group Pencil move at the limit with 16 upper layers is within 0.5 ms of its single-layer cost,
and `applyEditCells` minus `composeAll` minus `composeUpper` is under 5 ms with 100k entries spread over 16 layers.

**Not done.** A lower-group Pencil move at the limit is 0.5 to 1 ms with 1 to 16 upper layers, within the target as
measured; the rows loop wasn't measured with 100k entries.

## 9. Layer swaps: cheap, but each commits, re-fires watchers and will multiply under Task 8

**What's at risk and when you'd feel it.** `useLayer`/`swapLayer` are a few map operations (measured 0.01 to 0.05 ms
a pick). What rides along: `useLayer` calls `commitPending()` first, so switching layers mid-typing ends the typing
run and its undo step (a design choice, but a user who types on two layers alternately gets a step per switch);
`swapLayer` bumps `_frameSwaps` and replaces `editCells`, so the autosave watcher (area 6) and every getter that
reads `editCells` or `_frameSwaps` (`hasEdits`, `hasEditLayer`, `shownCells`) recompute. `withLayer` swaps twice per
call, so `pushWholeLayer`'s undo and `onLayer` each cost two swaps and two watcher rounds; `onLayer` also sends a
slice on the way in and out. Task 8 plans every selection move to run over every visible cells layer through
`onLayer`, and `floatSelection`'s per-move `copySelection` to read `hasPaintIn(rect)` per layer (a scratch canvas
drawn and read per call) and `completeAt` per cell (pixelAt per half per layer below the pick).

**Where.** `src/store/project/layers.js:97-104` (`useLayer`), `src/store/project/shared.js:61-83` (`swapLayer`,
`withLayer`), `src/store/project/history.js:42-65` (`onLayer`: `sendSlice` at `:46, :58`), `:312-332`
(`pushWholeLayer`), `src/store/ProjectStore.js:172-175` (`hasEdits` reads `_frameSwaps` and iterates `_layerData`),
`src/document/PaintLayer.js:309-320` (`hasPaintIn`), `src/store/project/reading.js:101-110` (`underlyingAt`,
pixelAt per half).

**Evidence.** Measured: `pickLayer` 0.01 to 0.05 ms across 2 to 16 layers at both sizes; `hasPaintIn` over the whole
grid 0.3 ms at 45k, 1.5 ms at the limit; `pixelAt` 1.8 µs. Estimate for Task 8 as planned: a selection drag over
16 visible layers = 32 swaps + 16 slices + 16 `hasPaintIn` (24 ms at the limit) per pointer move, plus
`completeAt`'s pixel reads for a paste's "completed against what shows" (a 100 x 100 block = 20k cells x layers
below x 2 x 1.8 µs ≈ 72 ms per layer below).

**How it scales.** Linear in visible cells layers per selection operation; `completeAt` is cells x layers below.

**Directions.**

- Task 8: compute the selection's per-layer blocks in one pass over `layers` without swapping (read
  `cellsOf(id)`/`paintOf(id)` directly, as `applyChange` already writes `_layerData` directly), and swap only to
  write. Make `underlyingAt`/`completeAt` read each layer below once at grid resolution for the block's rect
  (`gridPixels` of a sub-rect), not `pixelAt` per half.
- Decide whether a layer pick should end a typing run; if not, `useLayer` can keep `_stroke.typing` open and let
  `onLayer` carry it.
- Batch the watcher rounds: `withLayer`'s two swaps could set `editCells` once when they net to the same map.

**Done when** a selection move over 16 visible layers at the limit costs under 20 ms per pointer move, measured by
a `bench/` row once Task 8 lands.

**Not done.** Nothing measured here changed.

## 10. The LAYERS list

**What's at risk and when you'd feel it.** `layers` is one computed over `project.layers` reversed, calling
`layerName(id)` (a `find` over `layers`) and `t(...)` per row, so any change to a layer's fields rebuilds every row's
data. A drag mutates `drag.value.slot` on every pointer move, which re-renders every row (`dropClass` per row), and
`dragMove` does `querySelectorAll('li')` plus `getBoundingClientRect` per row per move (a forced layout per move,
64 rects). Each row holds a `DropdownMenu` with three buttons; Task 6 adds Delete and Duplicate, Task 9 Merge down.

**Where.** `src/components/LayersList.vue:32-39` (`layers`), `:65, :74-86` (`drag`, `dragMove`), `:97` (`dropClass`),
`:136-170` (the row template); `src/composables/useLayerName.js:7-14`.

**Evidence.** Estimate only: 64 rows x `find` over 64 is 4k comparisons; 64 `getBoundingClientRect` after one layout
is under 1 ms; a 64-row Vue re-render with a menu each is on the order of 1 to 3 ms. Nobody will feel it.

**How it scales.** O(L²) on names (trivial), O(L) layout reads per pointer move, O(L) re-render per move.

**Directions.**

- Measure the row tops once at `dragStart` (rows don't move during a drag) and keep `slot` in a `shallowRef` separate
  from the `drag` object so a move changes one value. Lazy-render the ⋯ menu's items (Task 6 and 9 add to them).
- Leave `layerName` as is.

**Done when** a pointer move during a drag causes no layout read and re-renders only the two rows whose drop marker
changed (a Vue devtools or `onRenderTriggered` check); no number to hit.

**Not done.** No drag test exists to hang a change on; the estimate stands.

## 11. The nearest-color search under Color ASCII (added after the final review)

`reaching` (`src/store/project/reading.js`) finds a stored color that shows as a target under the sliders, for a
cells-into-cells Merge down of paint over cells and for a large Copy of shapes, in Color ASCII with a slider off its
default. It's marked `ponytail:`.

- **Cost:** about 0.15–0.3 ms per cell where the ±1 check fails, which is most cells under clipping sliders: about
  1 s for 80×50, 10–18 s for 300×200, minutes at 500k cells. About 200 entries per cell join the renderer's color
  cache until the next render.
- **Accuracy:** the local search stops at local minima under clipping sliders (Brightness 140, Hue 40): about 10% of
  random paint pairs end more than 1 off per channel, about 2.5% more than 20 off, though a stored color within 1.4
  exists. Some targets can't be shown exactly by any stored color.
- **Next:** start from a coarse color grid computed once per settings (about 8 ms in a probe; cells more than 5 off
  fell from about 7% to under 1%), or, if merged paint stays paint (the open owner question R22), drop the search.

**Done.** `storedShowingAs` in `PixelTransforms.js`: `paletteChoices`' 33³ grid through the adjustments and the palette,
indexed by what each color shows (4096 buckets of 16 levels a channel, built once per settings, 2 to 9 ms), the eight
grid colors showing nearest the target each stepped 4, 2, 1 a channel with all 26 moves in one `applyTransforms`
call, the nearest kept (the ring search stops one ring later than the first cut, as a target at its bucket's edge can
have a nearer color in the next ring). `reaching` is a per-settings, per-target cache over it (the renderer's color cache is no longer
flooded), and `shownAs` checks its 27 ±1 candidates in one call instead of 27 `effective` calls. Measured on 1,000
random reachable targets: Brightness 140 + Hue 40, 189 → 20 µs a lookup, more than 1 off 9.2% → 0.2% (max 81 → 2),
more than 20 off 2.8% → 0; Contrast 250, 121 → 9 µs, 61% → 0 more than 1 off; Invert + Saturation 150, 182 → 17 µs,
31% → 0. The misses left are targets a step inside a clip (253 under Brightness 140), shown as 255. A whole Merge down
of a layer painted all over, 300 x 200 under those sliders: 1.88 → 1.46 s (80 x 50: 242 → 111 ms); what's left is
`storedLookAt`'s own reads per cell (`baseCellAt` 3 to 4 µs, two `pixelAt` 2.4 µs a layer, conversions), 15 µs a cell
with no reaching at all. This is the one area whose output changes: where the old descent from `hex` stopped short,
the stored color is now a nearer one (it shows the same or nearer).

## 12. An upper layer's own Floyd–Steinberg (added with per-layer Dither)

Each layer now has its own Dither (`CHAR_KEYS`). An upper vector layer with Floyd–Steinberg on carries error between
the pixels its shapes cover, so `composeUpper` walks it a whole row at a time over every cell it visits
(`Renderer #ditherLayer`), not cell by cell; the layers between two such layers are still walked cell by cell. It's
marked `ponytail:` twice in `Renderer.js`.

- **During an edit** it holds still: the edit's cells are worked out with no error coming in, the rest stay. A drag of
  a 20 x 20 rect over a layer covering a 300 x 200 grid: 0.5 ms a move (measured).
- **At the edit's end** (`commitEdit`, and any compose outside an edit that reaches the layer: an undo, a heard
  change), the layer is worked out again over every cell it reaches (`#settled`), with every upper layer over those
  cells: **35 to 37 ms** for that 300 x 200 layer reaching 47k cells (measured; a whole `applyEditCells` of the same
  document is 24 to 35 ms). Nothing is spent for a layer with Dither off or Ordered (Bayer, a nudge by place, per
  cell).
- **Memory:** an error buffer the size of the grid (3 floats a grid pixel) per such layer per compose: about 1.4 MB at
  300 x 200, 6 MB at the limit, dropped after.
- **Next, if it shows:** keep two rows of the error buffer instead of the grid's; at the edit's end, start the walk at
  the first row the edit reached (the error before it is unchanged) instead of the layer's top.

## How this was measured

Two scratch Vitest browser benchmarks, kept outside the repo and not part of `npm test`:

- `/private/tmp/claude-501/-Users-jejacks0n-orca-workspaces-phosphor-ux-revisions/d7208473-7465-4848-add9-3c74a50bd979/scratchpad/perf/layer-stack.bench.js`:
  for 300 x 150 and 100 x 5,000 (the 500k limit), with 1, 4 and 16 upper cells layers above `edit`, each given a
  40 x 40-cell patch of red paint and one typed cell: whole-grid composes, Pencil moves and keystrokes on the top
  layer and on `edit`, undo/redo, picks, hide/show/move, autosave's parts, a vector layer and shape drag, a slider
  step, heap and canvas bytes. Plus a layer painted all over at 300 x 150, micro timings of the primitives, and
  2-frame animations at 200 x 100 with 0, 1 and 4 upper layers. Output: `.../perf/run1.log` (415 s).
- `/private/tmp/claude-501/-Users-jejacks0n-orca-workspaces-phosphor-ux-revisions/d7208473-7465-4848-add9-3c74a50bd979/scratchpad/perf/layer-stack-2.bench.js`:
  `shownCanvas` alone, Best match and By shape through `#upperChar`, `editScaleFor`'s canvases by grid, and an upper
  vector layer at the limit. Output: `.../perf/run2.log` (23 s).
- `/private/tmp/claude-501/-Users-jejacks0n-orca-workspaces-phosphor-ux-revisions/d7208473-7465-4848-add9-3c74a50bd979/scratchpad/perf/vitest.config.mjs`:
  `bench/vitest.config.js` with the include pointed at the scratchpad (and a `node_modules` symlink into the repo's).
  Run from the repo: `npx vitest run --config <that file> --silent=false`.

Both drive the real stores through `tests/support/app.js`'s `createTestApp` with no UI mounted, the way `bench/`
does; the documents are a blank black picture (`replaceImage` of a 400 x 400 canvas), so `editScaleFor` gave scale
2 at 300 x 150 and 1 at the limit. Times are `performance.now()` around the call, averaged over 10 moves or 2 to 5
repeats; the rows with `settled` include two or more animation frames of waiting. Read them as magnitudes: runs vary
by about 20%.

Machine: Apple M3 Pro, 36 GB, macOS (Darwin 27.2), Node 26.5.0, Vitest 5.0.5, Playwright 1.64.1's headless Chromium
with software WebGL (SwiftShader) and a software 2D canvas. The per-pixel `getImageData` cost (area 1) is the one
number most likely to be *worse* in a real browser, where a canvas may live on the GPU.

## Not covered

- **Rooms.** Task 4 holds a room to the old shape (the bottom, one vector layer, one cells layer), so nothing here
  multiplies by layers in a room; `editLayerSum` and the ledger's layer-named tiles were only checked for shape.
- **The stack file form's read side.** `readStack` decodes one PNG per painted layer (`loadImage` each,
  `document.js:32`), linear in layers and already async; not measured.
- **Best match and By shape over the lower group**, `#resolveUnder`, dither: unchanged by phase 2 beyond what
  `#upperChar` adds (area 1).
- **Pre-existing whole-document costs** (`cellsFromOutput`, `#recount`'s pixel objects, `layoutWide`, the DOM view):
  covered in `viewport-rendering.md`; Task 10's `countCanvas` will add every layer's pixels to `#recount`'s read, so
  area 1's per-layer grids should feed it.
- **iOS and real GPUs.** Not run; see the caveat above.
- **A quantified fix.** No change was tried; the "done when" numbers are targets, not results.
