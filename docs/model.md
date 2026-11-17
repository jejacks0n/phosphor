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

The base is the picture plus pinned characters (`baseRecords.pins`); a pin is a character of someone's own.

## Rules

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

### R6. The PIXEL view's Overlay draws only what the pixels can't show.

The Overlay draws the cells of the layers (or every cell, with All cells) over the pixels. A cell that's paint in the
current style (a paint block outside ANSI) isn't drawn: its paint is already the pixels.

- Lives in: `updateOverlay` in `src/components/InputEditor.vue`, with `shownEntry`.
- Checked by: `tests/browser/pixel-overlay.test.js › in the ASCII styles a paint block isn't drawn over its paint …` and
  `… the report: the strokes under and over the shape …`.

## One question, one answer

"Whose character is this?" is answered by `shownEntry(entry, renderStyle)` in `src/document/editCells.js`: a paint block
outside ANSI is nobody's. "Does this character have ink to tint?" by `opensToPaint(cell, renderStyle)` in
`src/lib/Cells.js`. New code asks those, not `entry.fg || entry.bg`, `cells.has(key)` or `char === '▄'`.
