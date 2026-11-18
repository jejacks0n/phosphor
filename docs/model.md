# Cells and paint: the model

What a drawing layer holds, how paint lays over each kind of thing, and what the operations that move them (Merge
down, Retouch, Colors only, the PIXEL view and its Overlay) must keep. These are the engineering rules; [layers.md](layers.md)
describes the behavior for people who draw. When the code and this file disagree, this file wins and one of them is
fixed. A change to a rule changes this file in the same commit, and the tests named under it.

Every rule says where it lives (the one function every path goes through) and which tests hold it. A test that holds a
rule names it (`R2: …`), so a failure says which expectation broke, and `grep R2 tests/` finds every check of it.

## The kinds

A cells layer holds a sparse map of entries (`src/document/editCells.js`) and a paint layer of grid pixels with alpha.
Each cell of it is one of these:

| Kind | What it is | Converted? | Paint over it |
| --- | --- | --- | --- |
| **Paint** | Pixels with alpha, no character, kept finer than the grid (a grid pixel of it reads and shows as its block's average: `PaintLayer.average`) | Yes, where it lies, by its layer's settings | Mixes in, converts again |
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
Colors only's half-blocks stay half-blocks under paint above. A ▄ block over a character of someone's own on a layer
under it, or a pin, takes that character's place (`blockOver`, R5). Every
path that treats someone's character differently from paint asks it, or the two it's made of; none asks
`entry.fg || entry.bg`, `cells.has(key)` or `char === '▄'` for that. That includes every path that walks a layer's
entries to act on them (the Paint Bucket's walls, Rotate, Insert and Delete, Keep crisp cells): an entry in the map isn't
a cell until `ownEntry` says so. Typing's Partial mode, and Delete in Overwrite, move characters of someone's own along
the row and leave paint, paint blocks and frozen cells where they are; its Insert mode moves everything the layer has
in the row, the paint and every entry with it, so it asks nothing (`shiftCells`; on the base `shiftBaseCells`, where a
pinned character is someone's own and every other pixel is paint); Rotate turns pixels and drops a frozen cell's pin with the paint it stood over. The mark travels with the entry (`mergeEntry` keeps
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
background color), except under a layer with character settings of its own, whose paint is its characters: there the
open character is converted over as in the ASCII styles. A ▄ would show the base's look in place of the layer's, so a
layer set to its own Random painted half-blocks over a flattened drawing, every cell of which is a pin. In Color ASCII
and Monochrome ASCII, which have no half-blocks, an open character (a space, or one in its own background color) is
converted over as paint over a cell with no character is: mixed into the cell's halves and converted with the layer's
settings. `█` has ink there and stays.

- Lives in: `Renderer.#paintOver` (`src/document/Renderer.js`), which every paint-over-cell path goes through: the lower
  group's `#composeOne`, a base pin under paint (`#paintedPin`) and the upper walk (`#upperCell`, which hands an open
  character under a layer of its own characters to the convert path: `ownChars` on the upper layers, from `upperOf` in
  `src/store/project/rendering.js` and `FrameBuilder.prepare`). The predicate is
  `opensToPaint` in `src/lib/Cells.js`; `coverCell` there is the tint. `storedLookAt` (`src/store/project/reading.js`)
  mirrors it in stored colors, and Colors only (`paintStroke` in `src/store/project/editLayer.js`) uses the predicate to
  tell which of the layer's own cells become paint blocks.
- Checked by: `tests/browser/layer-stack.test.js › R2: …` (a typed space and a letter under paint, on the layer and on
  one above, in both ASCII styles); `tests/browser/incremental-cells.test.js › composeAll lays every kind of entry …`
  (the one-by-one reference converts open cells); `tests/unit/compose.test.js` (coverCell's tint in ANSI);
  `tests/browser/block-chars.test.js › R2: the report: paint on a layer with its own Random …` (a flattened drawing under
  a layer of its own Random, the Brush in ANSI) and `› R5: random: …` (a pinned space under a layer of its own seed);
  `tests/browser/animation-build.test.js › built frames equal the still with a layer of its own characters …`.

### R3. Merge down moves each kind as itself, and nothing on the canvas changes but a soft edge, which stays paint.

A character of someone's own is completed against the look under it and written there (`completeAt`); paint is drawn
over the paint under it and stays paint; a paint block goes in as a block (where the layer under has no character of
its own there; in ANSI, where it has one, in its place, as it showed: its background goes into the paint under, as a
block written there does, R5) and its paint as paint. Only where paint would convert otherwise in its new place (`unlike`, compared
up to the layer merged into with `ROUNDING` steps of tolerance per channel, characters exact) and covers the cell whole
(both halves opaque, `freezeUnlike`) is it pinned: the paint stays, and the cell it showed is written over it
(`frozenCells`), marked frozen. A cell the paint covers only in part (a stroke's or a shape's soft edge) stays paint,
though it may convert otherwise (a character of the layer's own set, a color a step or a palette entry off): what it
showed held the colors under the paint (the picture's, or a hidden base's black), and a pin would keep them after they
changed, a gray or black border round a merged shape once the base is hidden or shown. A vector layer merged into a vector layer moves its shapes there as shapes, numbered to stay
above that layer's own (`shapesOnVector`), and only when the two layers' character settings are the same: under other
ones the shapes would convert otherwise, and there's nothing to freeze a shape into. A merged vector layer's shapes go into
the paint at their own detail (the base layer's scale), not a grid pixel at a time, so By shape samples them as it
sampled the shapes (R7). The converter shows the pin and leaves the paint under it alone (the Renderer's `#composeOne` and `#upperCell` lay no paint of the cell's own layer over a
frozen entry; `layerOver` in `reading.js` the same). Everything else sees paint: the PIXEL view draws the paint, the
layers above lay their paint over it as over converted paint (`#exactUnder`, `#upperCell`), so the check up to the
merged-into layer is enough, and paint written or erased in the cell (`paintEditPixels`, `putEditPixels`,
`eraseEditPixels`: every tool's one way in, Retouch and the Eraser included) drops the pin (`unfreeze`), so the paint
left converts as the layer converts paint. A frozen cell merged further down keeps its paint and its pin; merged onto the
base, its pin's colors go in and become a pin there, not the paint's. An art layer's characters are written as someone's
own, unmarked, the paint under them erased. Merged onto the base (Keep crisp cells), entries and paint become the base's
pixels, which the base snaps to the palette a pixel at a time. A half an entry leaves to the base (a typed letter's with
no background, its top half) with no paint over it isn't written: the base keeps its own pixels there, which show as
they showed (`mergeCellOf`'s `kept`). Written as a stored color instead, it shifted a palette step under a slider: the
base snaps on the graphics card, which breaks a tie between two palette colors its own way (VGA's `d7` and `ff` under
Midtones 2), and a picture's cell can show a mix of its pixels' snaps that no one stored color makes (Posterize). Where a cell would show otherwise there (`unlike`, the
same check: soft paint over a cell mixed into its colors before the snap instead of after, paint with no cell under it
that the converter picks again from the snapped pixels), it's written as it showed instead (`frozenCells`): its stored
colors as its two pixels, its character pinned.

- Lives in: `onCells`, `onBase`, `mergeCellOf`, `shapesOnCells`, `shapesOnVector`, `unlike`, `frozenCells`, `freezeUnlike` in
  `src/store/project/merging.js`; `unfreeze` in `src/store/project/editLayer.js`; the Renderer's `#exactUnder`,
  `#upperCell` and `#composeOne` (`src/document/Renderer.js`); `layerOver` and `storedLookAt`
  (`src/store/project/reading.js`) mirror the walk; a paste keeps a frozen cell's paint (`src/store/project/selection.js`).
- Checked by: `tests/browser/merge.test.js › R3: the report: Keep crisp cells under soft paint …` (Keep crisp cells on
  CGA under Best match, soft Brush and Blur strokes and a dithered vector layer above); `› R3: the report: a shape
  merged into Layer 1 leaves no border …` (the soft edge stays paint, the base shown or hidden before or after) and
  `› … keeps every cell with a palette and Levels on, the soft edges paint`;
  `› R3: Merge down of text with no background onto the base keeps the canvas with a palette and a slider moved`
  (#201: VGA and CGA under Levels, Posterize, Contrast, Saturation, Brightness, Hue, Invert, and none; Keep crisp cells
  and Blend into source image);
  `tests/browser/merge.test.js › R3: the report: …` (two reports: the layer-blending file's two merges keep
  the canvas, the paint on the layer above included; the merge-dark-edge file's merge keeps the PIXEL view, freezing
  nothing as saved (R7) and, with the shape's own characters, its frozen cells over their paint), `› Merge down of Colors only paint …`, `› a gradient shape merged down under By shape …` and
  `› Merge down of a vector layer into a cells layer puts its shapes in as paint …` and `› Merge down of a vector layer
  into the vector layer under it …`; `tests/browser/block-chars.test.js ›
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
it and is tinted. A cell the converter drew is paint to it in full and gets no ▄, on the base and on any layer, whatever
chooses its characters (a ▄ isn't converted, so one would outlast a change of how characters are chosen): its character
is a rendering of the pixels (R7), and the paint becomes the character the layer's settings choose over the pixels under
it (on the base the paint goes into the pixels). Under Random that brings out the character a blank cell held in its own
background color, which is Random's: a stroke on a blank canvas shows Random's characters
(the base's Random had kept a ▄ there, so the default Brush painted half-blocks on a fresh canvas). Half-block is the way
to draw ▄, and its ▄ (the Shape tool's Write block glyphs' too) is a paint block over any cell: the character it
replaces goes with its foreground, which a ▄ kept would show in its bottom half, a whole cell where the paint drew half
of one. A background of the cell's own stays, as paint under the layer's; on the base a pinned character's block takes
its background in both pixels (a ▄ pinned already, a stroke passing back over it, keeps its halves), and a cell the
converter drew keeps its halves. A block on a layer above a character of someone's own (on a layer under it, or a pin)
shows the same in ANSI: it takes the character's place, a textured character's halves its background and a solid
glyph's its own halves (`blockOver` in `src/lib/Cells.js`), where it had shown the character's foreground in its bottom
half; Merge down puts it there (R3). The Shape tool's Half-block with Write block glyphs off lays paint, which is the
layer's characters over a cell the converter drew (Random's out of a blank canvas), and in ANSI makes a block of each
cell that shows a character of someone's own on the layer in use or under it (`ownCharAt`): R2's tint there took the
whole cell from an edge on its top half (the background) and only recolored the character from one on its bottom half,
so a box half a cell up or down crossed a line otherwise. A pinned character on the base, or a cell of the layer's own, is someone's own, as anywhere; over a
character of someone's own under the layer the paint shows as R2 has it, with no entry.

A cell a shape covers under the layer (the topmost thing under it there is a vector layer's fill or stroke) is drawn
by the converter too and gets no ▄: a ▄ there made a stroke that crossed from the picture onto a shape switch from the
layer's Characters to half-blocks, so what a vector layer held changed how the layer above it painted. Inside an art
layer every cell is someone's own, and a blank one still takes a ▄ (`showsNoChar`).

- Lives in: `paintStroke` in `src/store/project/editLayer.js` (`blockChars: 'plain'`; `converted` says which cells the
  converter drew), with `showsNoChar` and `shapeUnder` there; Half-block's and Write block glyphs' ▄ in `writeBlocks`
  there, which the Shape tool's Half-block asks for every cell with Write block glyphs on and for the cells `ownCharAt`
  (`src/store/project/reading.js`) names with it off (`apply` in `src/tools/shapes.js`); a block over a character under
  it in `blockOver` (`src/lib/Cells.js`), which the Renderer's `#upperCell` and
  `#composeOne`, `layerOver` in `src/store/project/reading.js` and Merge down's `onCells` use.
- Checked by: `tests/browser/block-chars.test.js › R5: …` (the base and a layer under Random, Best match and By shape;
  the reports: the Brush on a blank canvas under the base's Random, a layer with its own Random over a flat canvas; a
  flat shape under the layer), `› with Colors only on the base, a cell that shows no character …`, `› with Colors only,
  a cell that shows no character (the black of an opened file's grown lines) …` and
  `› …with Colors only, a layer's own cell that shows no character becomes a plain ▄ …`; `› R5: the report: a Half-block
  box with Write block glyphs over a line box …`, `› R5: on the base, a Half-block box …`, `› R5: a Half-block box with
  Write block glyphs on the layer above a line …` (with Merge down and the stored look), `› blockOver: …` and
  `› R5: the report: Half-block boxes over a line box …` (projects/boxes2.phosphor: the Shape tool and the Pencil, on the
  base and a layer, a half cell apart, Merge down and undo) and `› R5: the report: with Write block glyphs off …`
  (the crossings ▄s, Random's characters over the canvas, no ▄ written there).

### R7. The characters are a rendering of the pixels: an upper layer converts over the pixels under it.

Paint and shapes on an upper layer, where they don't tint a character of someone's own (R2), convert over the two
grid pixels the PIXEL view shows under that layer: the lower group's output (the picture with its paint, before the
palette) with each upper layer below laid over by its alpha. Never over the shown character's halves (in the ASCII
styles those are ink on black, far darker than the pixels, so a faint stroke one layer up came out dark). The lower
group's own paint converts over the picture the same way. Under By shape, which matches finer samples of the picture
(4 × 8 a cell), the layer above matches the same samples with the layers between and its own pixels laid over them
(`#fineUnder`), so a photo's detail under soft paint counts there as it does on the lower group; where the picture has no
samples (the lower group isn't By shape) the two pixels stand in. Its own pixels are sampled as finely as they're drawn
(`#samplesAt`: a vector layer's shapes, and a cells layer's paint, which `#paintOver` is handed), so a picture added to
the layer, a block pasted on it or a shape merged into it keeps its detail there, as it would on the lower group; a
brush's paint, a grid pixel at a time, samples the same as its two pixels. An upper vector layer draws its shapes at the paint's
scale, and Merge down draws them into the paint as they are, so By shape samples the merged paint as it sampled the
shapes, and the PIXEL view, which shows a grid pixel of paint as its block's average, shows them as it did. So the ASCII view says what the PIXEL view shows, and paint
merged down converts to what it converted to above, except for the converter's own differences (a palette snapped at
another step, dither error, By shape's finer samples), which R3 freezes.

- Lives in: `Renderer.#pixelsUnder` and `#fineUnder` (`src/document/Renderer.js`), used by `#upperCell` for shapes and
  for `#paintOver`'s convert path, with `pictureUnder` for the lower group; `storedLookAt` (`src/store/project/reading.js`)
  tracks the stored pixels under the same way.
- Checked by: `tests/browser/layer-stack.test.js › R7: …` (faint red over white, in Color ASCII by intensity and By
  shape and in ANSI; the report's file); `tests/browser/merge.test.js › R7: under By shape …` (soft paint over a photo
  merges down with nothing frozen) and `› R3: the report (as saved) …` (a shape merged into an upper By shape layer,
  nothing frozen); `tests/browser/layer-chars.test.js › R7: By shape on a picture added as a layer …` (the same
  characters on its own layer as in the lower group).

### R8. Color ASCII is ANSI in spirit: a character of someone's own keeps its background, on the base too.

Color ASCII converts the picture to ink on black, but a typed cell with a background shows it, in Color ASCII as in
ANSI. The base holds a cell as two pixels and a pin, so a pin in Color ASCII shows its two pixels as background and ink
where they differ (`pinnedCell`), and Keep crisp cells writes a cell that shows a background (its own, or a pin's under
it) as its two colors, so the look survives the merge. Two pixels of one color show as that color's ink on black: what a
converted cell is, what Merge down wrote before pins kept a background, and what Set FG on the base writes (the base
can't easily be given a background by hand; a merge gives it one). A cell on black stays on black: the paint over it
is folded into its ink (the average of its two tinted halves, as it showed) rather than laid over each pixel, which would
make them differ. The one cost: a cell whose character is its own background's color (a plain colored box) merges as
that color's ink on black.

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

### R11. The PIXEL view shows a character on the base as it looks; what's stored, and what the tools read, stays its two pixels.

The base holds a character of someone's own as a pin and two pixels: its background the top one, its foreground the
bottom one (`writeBaseCells`), whatever the character is. An art layer's cells are drawn the same way. Shown as they
are, every such cell is its background over its foreground: a `█` is half a cell, and a line of `█ ░ ▒ ▓` a row of
dashes. So the PIXEL view draws each one's look over those pixels: the cell the ANSI view shows there, at pixel scale.
Per half, its background blended toward its foreground by the ink the glyph has there (`halfColors`, as the Overlay
draws a layer's cell and `#showResolved` Best match's). `█` is solid, `▓ ▒ ░` are three quarters, a half and a quarter of the way, `▐ ▌` a half (a grid pixel is a
column wide, so it can't split sideways), `▄` as it was, a thin character faint. The cell is the one the art style
shows (`pinnedCell`: R8's background in Color ASCII, white on black in Monochrome ASCII).

Display only. The output, the cells, saved files and exports hold the two colors as before, and every tool in the PIXEL
view reads and writes those (`shownCanvas`, the base's own pixels), not the look: the Eyedropper on a gray `▒` picks one
of its two colors, and the Brush on the base over a `█`'s upper pixel changes its background, which doesn't show.

What's over the character counts, bottom to top, as the cell itself is laid (`#composeOne`, `#paintedPin`,
`#upperCell`), so the look stays the ANSI view's cell while that's still the character:

- **Paint on a layer above** (the lower group's, an upper cells layer's) tints the character as the ANSI view tints it
  (`coverCell`, R2): it goes into the cell's two colors, each snapped as paint is, and the glyph's ink blends them
  again. Over a solid or empty glyph that's a `▄` with the paint in the half it's in; over a shade or a letter the
  paint is in its background (upper half) or foreground (lower half) and shows through the whole cell by the ink. The
  blend itself is never snapped: a shade's mix isn't a palette color, and the first trace of paint (a soft stroke's
  edge) would turn it into one, a hard ring round every stroke. Where the paint doesn't tint the character but is
  converted over the cell's two pixels (R2: a character with no ink, in the ASCII styles, and in ANSI under a layer
  with characters of its own), the pixels show, as the conversion reads them.
- **A paint block over it** (a Half-block's `▄`, R5) takes its place, as `blockOver` has it: a solid glyph's own
  halves, a textured character's background in both.
- **A frozen cell over it** (R3) is its paint, and the pixels show.
- **A shape reaching the cell** takes it, and the pixels show: under the lower group's shapes the pin gives way
  (`pinAt`), and an upper vector layer's shape makes the cell a rendering of the pixels (R7).
- **An upper art layer's character** has a look of its own, of the cell `#upperCell` builds there.
- **A hidden base** has no pins. A layer's own characters aren't pixels at all: the Overlay draws them (R6), over
  whatever is under them.
- **A frame built for playing** has the looks in its output (`FrameBuilder.build`), and the ghost dims an inherited
  cell toward the base's look where it has one (`baseLook`), not toward its two pixels.

So for a character on the base, All cells changes nothing: the look is, to the pixel, the cell the Overlay would draw
there, soft paint over it included. An opened ANSI file and Flatten's Draw on top, whose every cell is a pin, leave All
cells as it is (they turned it on while the base's characters showed as stripes).

The looks are one image the output's size (`looksCanvas`), see-through but in those cells. It's kept, and worked out
again only over the cells made again since (`#looksDirty`, marked by `composite`, `updateCells`, `composeAll` and
`composeUpper`: every way a cell is made), so a redraw is one more `drawImage` and an edit costs its own cells. A large
rect walks its pins, not its cells (`MOST_ASKED`): asking a cell for its pin makes a key, several times the cost of
reading one.

- Lives in: `looksCanvas`, `#lookAt`, `#lookPainted` and `baseLook` (`src/document/Renderer.js`); drawn by
  `redrawDisplay` and `drawVeil` (`src/components/InputEditor.vue`) and `FrameBuilder.build`.
- Checked by: `tests/browser/pixel-characters.test.js › R11: …` (the report's file; a character written, written over
  and undone; paint over one on the layer above and on one above that, as the ANSI view tints it; on a palette, faint
  paint that leaves a shade as it was; an opened ANSI file under soft strokes, the same to the pixel with All cells off
  and on; a Half-block `▄` over a character; a layer with its own characters; shapes; a hidden base; both ASCII styles;
  a palette with Best match; art layers above and in the lower group; a built frame; the ghost; the Overlay; a redraw
  that asks no cell). Timed by `bench/pixel-view.bench.js`.

### R9. A layer's change redraws what's over and under it, and changes nothing of theirs.

The views show one grid of cells, each a character and two colors, so the layers are composed into it: a shape drawn,
moved or deleted works out again the cells it covered, for the whole stack. That's all it does. It writes nothing on
another layer, and what it redraws over is the other layers as they are now.

An upper layer's redraw lays the upper layers over `lowerCells` as they stand (`recomposeUpper`, with pixels or, past
a quarter of the grid, every cell). It never goes through `applyEditCells`, which makes `lowerCells` again from
`renderedCells`: those are the last full render's, and paint laid on the lower group since is in the output and in
`lowerCells` (`updateCells`) but not in them. The report: with base, Layer 1 and a vector layer above it, a shape
dragged past a quarter of the grid made Layer 1's brush strokes vanish until the next render. `applyEditCells` is for
after `renderedCells` was made (`render`, `rebuildCells`).

- Lives in: `recomposeUpper` and `layUpper` in `src/store/project/rendering.js`; `redrawRects`
  (`src/store/project/vector.js`) and `commitEdit` (`src/store/project/history.js`) call it.
- Checked by: `tests/browser/layer-stack.test.js › R9: …`.

### R10. Which shape is over which is its vector layer's place first, then its number; a shape stays on its layer.

A shape's `z` is numbered across every vector layer, in the order the shapes were drawn: a shape on a lower layer can
have a higher `z` than one on a layer above it. So `stacked(shapes)` alone is not the order they show in. Everything
that asks what's on top or underneath asks `stacked(shapes, project.shapeRank)`: a click and a box (`shapeHits.js`),
the Node tool's box, Join's and Add/Subtract's bottom shape, a copy's order, Select all, the Keys panel's place. Bring
forward and Send back step only past a shape on the same layer (past one on another layer the press showed nothing).
Merge down between vector layers numbers every shape again in that order, so the moved ones stay over the layer's own.

A shape's `layer` field says which vector layer it's on (none: the first one, `'vector'`), and anything that builds a
shape's record again from parts must carry it: the Shape tool's drag and an art layer's drawing read back
(`setArtContent`) each dropped it once, and the shape jumped to the first vector layer. `withShape(shape, changes)` on
the stored shape keeps it; a record made from scratch needs `layer` named. A selection follows to its shape's layer
(`selectShapes` moves the pick), so the layer picked is where the selection is.

- Lives in: `shapeRank` (`src/store/ProjectStore.js`), `stacked` (`src/document/shapes.js`), `src/lib/shapeHits.js`,
  `restackShapes`, `joinShapes`, `combineShapes`, `setArtContent` (`src/store/project/vector.js`), `selectShapes`
  (`src/store/project/selection.js`), `src/tools/vshape.js`, `shapesOnVector` (`src/store/project/merging.js`).
- Checked by: `tests/browser/vector-render.test.js › R10: …`; `tests/browser/art-layers.test.js › R10: …`;
  `tests/browser/merge.test.js › Merge down of a vector layer into the vector layer under it …`.

## Where the rules are walked and what else they reach

Maya's QA script walks R2–R11 as a person would, in ANSI and in Color ASCII ([How my layers blend](qa/personas/maya.md#how-my-layers-blend));
Dex's step 26 walks typing, Blur and Colors only on one layer in ANSI, and his step 25 the base's characters in the
PIXEL view (R11). [layers.md](layers.md#how-layers-blend) says the
same in plain words. The rules reach past the stack view: animation frames are built by the same walk with the same
scales (FrameBuilder: a built frame equals the still, `tests/browser/animation-build.test.js`); a room's artists and
watchers compose with the same code; exports, Flatten and the thumbnail read the composed cells; copy and paste carry
entries and paint with their kinds, frozen cells included; a layer moved up or down converts the same (R7,
`tests/browser/layer-stack.test.js`).

## Known departures

- An art layer's `▄` (what `artCellOf` makes of paint, paint blocks and solid glyphs) is kept as a character in every
  style (`Renderer.pinAt` applies the "▄ is pixels outside ANSI" rule to base pins only; `#upperCell`'s vector branch,
  `storedLookAt` and `shapesOnCells` don't). In Color ASCII, Make art layer over a Colors only stroke shows ▄ glyphs.
  The fix is one `shownChar(char, renderStyle)` beside `shownEntry`, used at those sites.
- A frozen cell merged onto the base goes in as its pin's colors (R3), which an upper layer converting over the cell (a
  vector layer's soft shape edge) then converts over instead of the paint it saw there: that cell can show otherwise.
  The base holds a pin's colors as its pixels, so it can't keep both.
- `lookUnder` (`completeAt`'s look under a layer) lays only the cells layers under it, not an upper vector layer between
  them, as `underlyingAt` does; a BG None cell typed over such a shape merges down with the wrong background.
- `drawnIn` (`src/store/project/vector.js`, Make art layer) takes a frozen cell's paint halves over its pinned colors.
- Minor: `asCells` pastes a paint block from the base as an own `▄` in every style; `flatBlock` gives a paint block over a
  lower part's character that character; the Flip tool takes a frozen cell down the paint route.

- `storedLookAt` and `layerOver` (`src/store/project/reading.js`) re-walk the stack by hand for stored colors; they follow
  the Renderer's exactness (R1) but count a paint block's ▄ in a completed look in every style.
