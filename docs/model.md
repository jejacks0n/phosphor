# Cells and paint: the model

What a drawing layer holds, how paint lays over each kind of thing, and what the operations that move them (Merge
down, Retouch, Colors only, the PIXEL view's Overlay) must keep. These are the engineering rules; [layers.md](layers.md)
describes the behavior for people who draw. When the code and this file disagree, this file wins and one of them is
fixed. A change to a rule changes this file in the same commit, and the tests named under it.

Every rule says where it lives (the one function every path goes through) and which tests hold it. A test that holds a
rule names it (`R2: …`), so a failure says which expectation broke, and `grep R2 tests/` finds every check of it.

## The kinds

A cells layer holds a sparse map of entries (`src/document/editCells.js`) and a paint layer of grid pixels with alpha.
Each cell of it is one of these:

| Kind | What it is | Converted? | Paint over it |
| --- | --- | --- | --- |
| **Paint** | Pixels with alpha, no character | Yes, where it lies, by its layer's settings | Mixes in, converts again |
| **Paint block** `{ char: '▄' }` | Paint with a hint: in ANSI, show my two halves as a ▄. Not a cell of anyone's; outside ANSI it's nothing (`shownEntry`) | As paint (ANSI shows the ▄) | As paint |
| **A character of someone's own** | A character someone chose: typed, opened from a file, pasted, pinned on the base, an art layer's | Never | Tints its ink; the character stays (R2) |
| **Frozen cell** `{ …, frozen: true }` | Paint, still there under it, with Merge down's pinned conversion of it over it: the character and colors it showed, kept because it would convert otherwise in its new place. Paint to everything but the converter, which shows the pin instead of converting the paint | Never again, until paint is written or erased in it: then the pin goes and it's paint | As paint: mixes into its halves, converts (R3) |

The base is the picture plus pinned characters (`baseRecords.pins`); a pin is a character of someone's own. A frozen
cell merged onto the base becomes an ordinary pin.

## Rules

### R1. One answer to whose a character is.

`ownEntry(entry, renderStyle)` (`src/document/editCells.js`) says whether a cell holds a character of someone's own:
its entry is shown in this style (`shownEntry`: a paint block outside ANSI isn't), not frozen (`isFrozen`), and not a
paint block (paint's, in any style). The Renderer asks the wider `tintedEntry` (shown and not frozen) for whether paint
above tints the cell or converts over it: a shown ▄ block tints as a solid glyph does, into a ▄ with the paint in it, so
Colors only's half-blocks stay half-blocks under paint above. Every
path that treats someone's character differently from paint asks it, or the two it's made of; none asks
`entry.fg || entry.bg`, `cells.has(key)` or `char === '▄'` for that. That includes every path that walks a layer's
entries to act on them (the Paint Bucket's walls, Rotate, Insert and Delete, Keep crisp cells): an entry in the map isn't
a cell until `ownEntry` says so. Insert and Delete move characters of someone's own along the row and leave paint, paint
blocks and frozen cells where they are; Rotate turns pixels and drops a frozen cell's pin with the paint it stood over. The mark travels with the entry (`mergeEntry` keeps
it when a whole entry moves, as Merge down's `completeAt` does), goes when a character or color is written over it
(that's someone's own now), is accepted from files and the clipboard only as `true` (`cleanEntry`), and is part of a
room change's hash as any field is.

- Lives in: `src/document/editCells.js` (`isFrozen`, `ownEntry`, `mergeEntry`, `cleanEntry`, `sameEntry`).
- Checked by: `tests/unit/edit-cells.test.js › R1: …`; `tests/unit/social-wire.test.js` (the mark through a room's change,
  as `cleanEntry` takes it); `tests/browser/bucket.test.js › R1: …`; `tests/browser/block-chars.test.js › R1: shiftCells …`;
  `tests/browser/selection-recolor.test.js › … Set FG over a frozen cell …`; `tests/browser/merge.test.js › R1: Keep crisp
  cells …`; `tests/browser/selection-turn.test.js › R3: a frozen cell in a rotated block …`.

### R2. Paint over a character tints its ink and never picks another character. With no ink to tint, the paint shows as paint.

A character of someone's own under paint keeps its character; the paint colors the half it lies on (the top half the
background, the bottom half the foreground). A character with no ink to tint is open: the paint shows there as paint
does in that style. In ANSI that's a ▄ with the paint in each half it covers (a solid or empty glyph, or one in its own
background color). In Color ASCII and Monochrome ASCII, which have no half-blocks, an open character (a space, or one in
its own background color) is converted over as paint over a cell with no character is: mixed into the cell's halves and
converted with the layer's settings. `█` has ink there and stays.

- Lives in: `Renderer.#paintOver` (`src/document/Renderer.js`), which every paint-over-cell path goes through: the lower
  group's `#composeOne`, a base pin under paint (`#paintedPin`) and the upper walk (`#upperCell`). The predicate is
  `opensToPaint` in `src/lib/Cells.js`; `coverCell` there is the tint. `storedLookAt` (`src/store/project/reading.js`)
  mirrors it in stored colors, and Colors only (`paintStroke` in `src/store/project/editLayer.js`) uses the predicate to
  tell which of the layer's own cells become paint blocks.
- Checked by: `tests/browser/layer-stack.test.js › R2: …` (a typed space and a letter under paint, on the layer and on
  one above, in both ASCII styles); `tests/browser/incremental-cells.test.js › composeAll lays every kind of entry …`
  (the one-by-one reference converts open cells); `tests/unit/compose.test.js` (coverCell's tint in ANSI).

### R3. Merge down moves each kind as itself, and nothing on the canvas changes.

A character of someone's own is completed against the look under it and written there (`completeAt`); paint is drawn
over the paint under it and stays paint; a paint block goes in as a block (where the layer under has no character of
its own there) and its paint as paint. Only where paint would convert otherwise in its new place (`unlike`, compared
up to the layer merged into with `ROUNDING` steps of tolerance per channel, characters exact) is it pinned: the paint
stays, and the cell it showed is written over it (`frozenCells`), marked frozen. The converter shows the pin and leaves
the paint under it alone (the Renderer's `#composeOne` and `#upperCell` lay no paint of the cell's own layer over a
frozen entry; `layerOver` in `reading.js` the same). Everything else sees paint: the PIXEL view draws the paint, the
layers above lay their paint over it as over converted paint (`#exactUnder`, `#upperCell`), so the check up to the
merged-into layer is enough, and paint written or erased in the cell (`paintEditPixels`, `putEditPixels`,
`eraseEditPixels`: every tool's one way in, Retouch and the Eraser included) drops the pin (`unfreeze`), so the paint
left converts as the layer converts paint. A frozen cell merged further down keeps its paint and its pin; merged onto the
base, its pin's colors go in and become a pin there, not the paint's. An art layer's characters are written as someone's
own, unmarked, the paint under them erased.

- Lives in: `onCells`, `onBase`, `shapesOnCells`, `unlike`, `frozenCells`, `freezeUnlike` in
  `src/store/project/merging.js`; `unfreeze` in `src/store/project/editLayer.js`; the Renderer's `#exactUnder`,
  `#upperCell` and `#composeOne` (`src/document/Renderer.js`); `layerOver` and `storedLookAt`
  (`src/store/project/reading.js`) mirror the walk; a paste keeps a frozen cell's paint (`src/store/project/selection.js`).
- Checked by: `tests/browser/merge.test.js › R3: the report: …` (two reports: the layer-blending file's two merges keep
  the canvas, the paint on the layer above included; the merge-dark-edge file's merge keeps the PIXEL view, the frozen
  cells over their paint), `› Merge down of Colors only paint …`, `› a gradient shape merged down under By shape …` and
  `› Merge down of a vector layer into a cells layer puts its shapes in as paint …`; `tests/browser/block-chars.test.js ›
  R3: the Eraser in the PIXEL view, or paint laid, in a frozen cell drops the mark …`.

### R4. Retouch keeps a character of someone's own and recolors it; a frozen cell is paint to it.

On a drawing layer, Blur, Dodge and Burn change the layer's paint pixel by pixel, a frozen cell's paint among it (the
first pixel of it a stroke writes drops the pin, R3, so a merged shape's edge fades like a painted one; a frozen cell the
stroke doesn't change stays), and recolor its characters of someone's own a whole cell at a time, their characters kept
(Blur spreads their colors into the clear around them as a glow). On the base, a pin is someone's own in the ANSI view
(recolored) and its pixels in the PIXEL view.

- Lives in: `src/tools/retouch.js` (`ownCellAt`, `retouchOwnPaint`, `recolorOwnCells`); `unfreeze` in
  `src/store/project/editLayer.js`.
- Checked by: `tests/browser/retouch.test.js › R4: …` (both views), `tests/browser/merge.test.js › R4: …` (a merged
  shape's edge), and the typed-character tests in `retouch.test.js`.

### R5. Colors only makes paint of what's paint to it, and tints a character of someone's own.

The Brush's and Pencil's Colors only makes a bare ▄ (a paint block) of each cell it reaches that shows no character
(R2's predicate for the layer's own cells with colors: their halves become paint first, `unlockCells`) and of each frozen
cell, whatever its character (its paint is under it already; the pin goes); a character of someone's own with ink keeps
it and is tinted.

- Lives in: `paintStroke` in `src/store/project/editLayer.js` (`blockChars: 'plain'`).
- Checked by: `tests/browser/block-chars.test.js › R5: …` and `› …with Colors only, a layer's own cell that shows no
  character becomes a plain ▄ …`.

### R7. The characters are a rendering of the pixels: an upper layer converts over the pixels under it.

Paint and shapes on an upper layer, where they don't tint a character of someone's own (R2), convert over the two
grid pixels the PIXEL view shows under that layer: the lower group's output (the picture with its paint, before the
palette) with each upper layer below laid over by its alpha. Never over the shown character's halves (in the ASCII
styles those are ink on black, far darker than the pixels, so a faint stroke one layer up came out dark). The lower
group's own paint converts over the picture the same way. So the ASCII view says what the PIXEL view shows, and paint
merged down converts to what it converted to above, except for the converter's own differences (a palette snapped at
another step, dither error, By shape's finer samples), which R3 freezes.

- Lives in: `Renderer.#pixelsUnder` (`src/document/Renderer.js`), used by `#upperCell` for shapes and for `#paintOver`'s
  convert path, with `#pictureUnder` for the lower group; `storedLookAt` (`src/store/project/reading.js`) tracks the
  stored pixels under the same way.
- Checked by: `tests/browser/layer-stack.test.js › R7: …` (faint red over white, in Color ASCII by intensity and By
  shape and in ANSI; the report's file).

### R8. Color ASCII is ANSI in spirit: a character of someone's own keeps its background, on the base too.

Color ASCII converts the picture to ink on black, but a typed cell with a background shows it, in Color ASCII as in
ANSI. The base holds a cell as two pixels and a pin, so a pin in Color ASCII shows its two pixels as background and ink
where they differ (`pinnedCell`), and Keep crisp cells writes a cell that shows a background (its own, or a pin's under
it) as its two colors, so the look survives the merge. Two pixels of one color show as that color's ink on black: what a
converted cell is, what Merge down wrote before pins kept a background, and what Set FG on the base writes (the base
can't easily be given a background by hand; a merge gives it one). The one cost: a cell whose character is its own
background's color (a plain colored box) merges as that color's ink on black.

- Lives in: `pinnedCell` in `src/lib/Cells.js`, used by `Renderer.#onBase`; `baseLook` (`src/store/project/reading.js`)
  completes an entry against such a pin with its background; `mergeCellOf` (`src/store/project/merging.js`) writes the
  pixels.
- Checked by: `tests/unit/compose.test.js › R8: …`; `tests/browser/merge.test.js › R8: …` (the report's file, and a
  typed cell with and without a background, and Set FG's two equal pixels).

### R6. The PIXEL view's Overlay draws only what the pixels can't show.

The Overlay draws the cells of the layers (or every cell, with All cells) over the pixels. A cell that's paint in the
current style (a paint block outside ANSI) isn't drawn: its paint is already the pixels.

- Lives in: `updateOverlay` in `src/components/InputEditor.vue`, with `shownEntry`.
- Checked by: `tests/browser/pixel-overlay.test.js › in the ASCII styles a paint block isn't drawn over its paint …` and
  `… the report: the strokes under and over the shape …`.

## Known departures

- An art layer's `▄` (what `artCellOf` makes of paint, paint blocks and solid glyphs) is kept as a character in every
  style (`Renderer.pinAt` applies the "▄ is pixels outside ANSI" rule to base pins only; `#upperCell`'s vector branch,
  `storedLookAt` and `shapesOnCells` don't). In Color ASCII, Make art layer over a Colors only stroke shows ▄ glyphs.
  The fix is one `shownChar(char, renderStyle)` beside `shownEntry`, used at those sites.
- `lookUnder` (`completeAt`'s look under a layer) lays only the cells layers under it, not an upper vector layer between
  them, as `underlyingAt` does; a BG None cell typed over such a shape merges down with the wrong background.
- `drawnIn` (`src/store/project/vector.js`, Make art layer) takes a frozen cell's paint halves over its pinned colors.
- Minor: `asCells` pastes a paint block from the base as an own `▄` in every style; `flatBlock` gives a paint block over a
  lower part's character that character; the Flip tool takes a frozen cell down the paint route.

- `storedLookAt` and `layerOver` (`src/store/project/reading.js`) re-walk the stack by hand for stored colors; they follow
  the Renderer's exactness (R1) but count a paint block's ▄ in a completed look in every style.
- Merge into the picture (`mergeIntoPicture`) judges a paint block by its ▄ in the ASCII styles too (`mergeKind`), so
  Colors only's paint merges there as exact cells, out of the image filters' reach.
