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
| **Frozen cell** `{ …, frozen: true }` | Paint that Merge down wrote as the character and colors it showed, because it would convert otherwise in its new place. Paint to everything but the converter | Never again | As paint: mixes into its halves, converts (R3) |

The base is the picture plus pinned characters (`baseRecords.pins`); a pin is a character of someone's own. A frozen
cell merged onto the base becomes an ordinary pin.

## Rules

### R1. One answer to whose a character is.

`ownEntry(entry, renderStyle)` (`src/document/editCells.js`) says whether a cell holds a character of someone's own:
its entry is shown in this style (`shownEntry`: a paint block outside ANSI isn't) and not frozen (`isFrozen`). Every
path that treats someone's character differently from paint asks it, or the two it's made of; none asks
`entry.fg || entry.bg`, `cells.has(key)` or `char === '▄'` for that. The mark travels with the entry (`mergeEntry` keeps
it when a whole entry moves, as Merge down's `completeAt` does), goes when a character or color is written over it
(that's someone's own now), is accepted from files and the clipboard only as `true` (`cleanEntry`), and is part of a
room change's hash as any field is.

- Lives in: `src/document/editCells.js` (`isFrozen`, `ownEntry`, `mergeEntry`, `cleanEntry`, `sameEntry`).
- Checked by: `tests/unit/edit-cells.test.js › R1: …`.

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
up to the layer merged into with `ROUNDING` steps of tolerance per channel, characters exact) is it written as the cell
it showed (`frozenCells`), marked frozen. Because a frozen cell is paint to the layers above (R1: the Renderer's
`#exactUnder` and `#upperCell` lay their paint over it as over converted paint), the check up to the merged-into layer is
enough: what's above sees the same halves it saw. An art layer's characters are written as someone's own, unmarked.

- Lives in: `onCells`, `shapesOnCells`, `unlike`, `frozenCells`, `freezeUnlike` in `src/store/project/merging.js`; the
  Renderer's `#exactUnder`, `#upperCell` and `#composeOne` (`src/document/Renderer.js`); `storedLookAt`
  (`src/store/project/reading.js`) mirrors the walk's exactness.
- Checked by: `tests/browser/merge.test.js › R3: the report: …` (the fixture's two merges keep the canvas, the paint on
  the layer above included), `› Merge down of Colors only paint …`, `› a gradient shape merged down under By shape …`
  and `› Merge down of a vector layer into a cells layer puts its shapes in as paint …`.

### R4. Retouch keeps a character of someone's own and recolors it; a frozen cell is paint to it.

On a drawing layer, Blur, Dodge and Burn change the layer's paint pixel by pixel, recolor its characters of someone's own
a whole cell at a time (Blur spreads their colors into the clear around them as a glow), and read a frozen cell as its
two halves: the first pixel of one a stroke changes turns the cell back into the paint it showed (`unlockCells`), and the
stroke goes on over it, so a merged shape's edge fades like a painted one. A frozen cell the stroke doesn't change stays.
On the base, a pin is someone's own in the ANSI view (recolored) and its pixels in the PIXEL view.

- Lives in: `src/tools/retouch.js` (`coloredCellAt`, `retouchOwnPaint`, `recolorOwnCells`); `unlockCells` in
  `src/store/project/editLayer.js`.
- Checked by: `tests/browser/retouch.test.js › R4: …` (both views), `tests/browser/merge.test.js › R4: …` (a merged
  shape's edge), and the typed-character tests in `retouch.test.js`.

### R5. Colors only makes paint of what's paint to it, and tints a character of someone's own.

The Brush's and Pencil's Colors only makes a bare ▄ (a paint block) of each cell it reaches that shows no character
(R2's predicate for the layer's own cells with colors: their halves become paint first) and of each frozen cell, whatever
its character (`unlockCells`); a character of someone's own with ink keeps it and is tinted.

- Lives in: `paintStroke` in `src/store/project/editLayer.js` (`blockChars: 'plain'`).
- Checked by: `tests/browser/block-chars.test.js › R5: …` and `› …with Colors only, a layer's own cell that shows no
  character becomes a plain ▄ …`.

### R6. The PIXEL view's Overlay draws only what the pixels can't show.

The Overlay draws the cells of the layers (or every cell, with All cells) over the pixels. A cell that's paint in the
current style (a paint block outside ANSI) isn't drawn: its paint is already the pixels.

- Lives in: `updateOverlay` in `src/components/InputEditor.vue`, with `shownEntry`.
- Checked by: `tests/browser/pixel-overlay.test.js › in the ASCII styles a paint block isn't drawn over its paint …` and
  `… the report: the strokes under and over the shape …`.

## Known departures

- An upper layer mixes translucent paint with the shown cell's halves (a character's ink on black, in the ASCII styles);
  the lower group mixes it with the picture's pixels. The same soft stroke lands darker one layer up in Color ASCII, and
  merging it down freezes the cells that differ (R3). Left as is, documented in [layers.md](layers.md).
- `storedLookAt` and `layerOver` (`src/store/project/reading.js`) re-walk the stack by hand for stored colors; they follow
  the Renderer's exactness (R1) but count a paint block's ▄ in a completed look in every style.
- Merge into the picture (`mergeIntoPicture`) judges a paint block by its ▄ in the ASCII styles too (`mergeKind`), so
  Colors only's paint merges there as exact cells, out of the image filters' reach.
