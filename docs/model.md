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
| **Paint block** `{ char: '▄' }` | Paint with a hint: in ANSI, show my two halves as a ▄ (the drawing font's lower half, drawn from whatever slot the font keeps it in; ▀ the same for its upper half). Not a cell of anyone's; outside ANSI it's nothing (`shownEntry`) | As paint (ANSI shows the ▄) | As paint |
| **A character of someone's own** | A character someone chose: typed, opened from a file, pasted, pinned on the base, an art layer's | Never | Tints its ink; the character stays (R2), except on the base in Monochrome ASCII, where paint takes the pin (R13) |
| **Frozen cell** `{ …, frozen: true }` | Paint, still there under it, with Merge down's pinned conversion of it over it: the character and colors it showed, kept because it would convert otherwise in its new place. Paint to everything but the converter, which shows the pin instead of converting the paint | Never again, until paint is written or erased in it: then the pin goes and it's paint | As paint: mixes into its halves, converts (R3) |
| **Laid block** `{ …, laid: true }` | A block a drawing tool laid: the Shapes tool's Half-column detail (`halfCells`: its ▌ ▐ █ and quadrants, and the BG spaces inside a filled ellipse). A character of someone's own to everything but the Soft Eraser and the PIXEL view's Eraser, which take it whole, as they take a paint block | Never | Tints its ink; the character stays (R2) |

The base is the picture plus pinned characters (`baseRecords.pins`); a pin is a character of someone's own. A frozen
cell merged onto the base becomes an ordinary pin, and so does a laid one.

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
pinned character is someone's own and every other pixel is paint). Lines and columns (`insertLine`, `deleteLine`, `insertColumn`, `deleteColumn` in `src/store/project/editLayer.js`) move the same way, a whole line or column of the picked layer at once: every entry and the paint, frozen cells and paint blocks with them, and on the base every cell's pixels as they show with its pin (`shiftBaseLines`, `shiftBaseColumns`), and what's pushed past the grid's edge goes. Rotate turns pixels and drops a frozen cell's pin with the paint it stood over. A font of another height (`newHeight` and `regrid` in `src/store/project/font.js`, through `followPicture`) keeps a character of someone's own at its column and line, and a pin there with its two base pixels (its colors), while the rest of the base's pixels and paint follow the picture; it moves a paint block with its paint, and drops a frozen cell's mark, whose paint converts where it lands. With nothing drawn it's a settings step, and the grid rescales as a Columns change does. A cell of another width (a font drawn at its own narrow width, or at 9 for Letter spacing 9px: `setDrawingFontWidth`) moves nothing: with something drawn or frames it's a settings step on the same grid, every cell where it was; with nothing drawn the lines refit as they do for a height. The mark travels with the entry (`mergeEntry` keeps
it when a whole entry moves, as Merge down's `completeAt` does), goes when a character or color is written over it
(that's someone's own now), is accepted from files and the clipboard only as `true` (`cleanEntry`), and is part of a
room change's hash as any field is.

A laid cell (`isLaid`) is a character of someone's own: `ownEntry` doesn't ask the mark, and only the Eraser does
(`eraser.move`). The Soft Eraser and the PIXEL view's Eraser clear a laid cell whole when any pixel of a stamp reaches
either of its halves, whatever the stamp's alpha, as they clear a paint block whose paint they take; the Hard Eraser in
the ANSI view clears whole cells anyway. A character typed by hand, the same ▌ or ▐, stays. The mark lives as the frozen
one does: `mergeEntry` keeps it when a whole entry moves (a moved, pasted, flipped or turned selection, the line still a
laid line; Merge down onto a layer, R3) and drops it when a character or color is written without it (a retype,
Retouch's recolor, R4, a selection's Set FG and Set BG, the Flip key) or paint is laid over it (Colors only's tint, R5,
or any stroke or fill: `unfreeze`), so a line laid over the
same typed character is laid. It's accepted from files and the clipboard (`cleanEntry`) and in a room's change
(`goodEntry`, `src/social/wire.js`) only as `true`, never as a cell by itself, and `sameEntry` tells a laid cell from a
typed one. Pins hold no mark: a laid line drawn on the base, merged onto it or flattened is pins (R11 says what the
erasers leave of one). Older files have no mark, and their cells stay characters of someone's own.

- Lives in: `src/document/editCells.js` (`isFrozen`, `isLaid`, `ownEntry`, `mergeEntry`, `cleanEntry`, `sameEntry`, `moveCells`,
  `followPicture`); `halfCells` in `src/tools/shapes.js`; `src/tools/eraser.js`; `unfreeze` in
  `src/store/project/editLayer.js` (paint over a laid cell drops its mark); `goodEntry` in `src/social/wire.js`.
- Checked by: `tests/unit/edit-cells.test.js › R1: …`; `tests/unit/social-wire.test.js` (the mark through a room's change,
  as `cleanEntry` takes it); `tests/browser/bucket.test.js › R1: …`; `tests/browser/block-chars.test.js › R1: shiftCells …`; `tests/browser/lines-columns.test.js › R1: …` (a line's paint, the base's pins);
  `tests/browser/selection-recolor.test.js › … Set FG over a frozen cell …`; `tests/browser/merge.test.js › R1: Keep crisp
  cells …`; `tests/browser/selection-turn.test.js › R3: a frozen cell in a rotated block …` (and in an 8×8 font);
  `tests/unit/edit-cells.test.js › R1: a font of another height …`; `tests/browser/font-height.test.js › R1: …`; `tests/browser/font-height.test.js › R1: 7 → 8 → 7 with art keeps every cell …`;
  `tests/unit/edit-cells.test.js › R1: a laid cell keeps its mark …`; `tests/unit/social-wire.test.js` (the laid mark
  through a room's change); `tests/browser/eraser.test.js › R1: …` (the Soft Eraser in ANSI and both erasers in PIXEL
  take a laid line and leave typed characters; a laid line moved; a laid cell typed over; one tinted by Colors only or
  painted over).

### R2. Paint over a character tints its ink and never picks another character. With no ink to tint, the paint shows as paint.

A character of someone's own under paint keeps its character; the paint colors the half it lies on (the top half the
background, the bottom half the foreground). A character with no ink to tint is open: in ANSI a solid or empty glyph
(a space, `█ ▀ ▄`) or one in its own background color; in Color ASCII and Monochrome ASCII one with no ink at all (a
space, or one in its own background color), `█` having ink there and staying. A layer's paint is its characters, so
over someone else's open character (a pin on the base, a lower layer's cell) it's converted with the layer's settings,
whether they're its own or the base's: in ANSI over the character's own two colors, in the ASCII styles over the
picture's pixels, as paint over a cell with no character is. A ▄ there would show the base's look in place of the
layer's, so a layer on Random painted half-blocks over a flattened drawing or an opened file, every cell of which is a
pin. In ANSI the paint over the layer's own open cells, a Half-block ▄ (a paint block, R5) among them, is a ▄ with the
paint in each half it covers; the ASCII styles convert those too. The base's own strokes are its pixels, not paint
over a cell (R7).

- Lives in: `Renderer.#paintOver` (`src/document/Renderer.js`), which every paint-over-cell path goes through: the lower
  group's `#composeOne` (the layer's own cells), a base pin under paint (`#paintedPin`) and the upper walk
  (`#upperCell`). In ANSI the last two hand an open character with no entry of the layer's own to the convert path over
  its halves (`halfColors`), and `#lookAt` follows them (R11). The predicate is `opensToPaint` in `src/lib/Cells.js`;
  `coverCell` there is the tint. `storedLookAt` (`src/store/project/reading.js`)
  mirrors it in stored colors, and Colors only (`paintStroke` in `src/store/project/editLayer.js`) uses the predicate to
  tell which of the layer's own cells become paint blocks.
- Checked by: `tests/browser/layer-stack.test.js › R2: …` (a typed space and a letter under paint, on the layer and on
  one above, in both ASCII styles); `tests/browser/incremental-cells.test.js › composeAll lays every kind of entry …`
  (the one-by-one reference converts open cells); `tests/unit/compose.test.js` (coverCell's tint in ANSI);
  `tests/browser/block-chars.test.js › R2: the report: paint on a layer with its own Random …` (a flattened drawing under
  a layer of its own Random, the Brush in ANSI), `› R2: paint on a layer that shares the base's Random …` (an opened
  file's spaces under the base's Random, then Merge down), `› R2: a layer's paint over pinned solid blocks …` (a █ and
  a ▄ keep their colors under a layer of its own Random) and `› R5: random: …` (a pinned space under the base's seed and
  its own), `› R2: in a font drawn at its own width of 7 …` (its █ measured over 7 columns, solid, so it opens to paint);
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
the paint at their own detail (the base layer's scale), not a grid pixel at a time, so By shape (and plugin solvers, R12) samples them as it
sampled the shapes (R7). The converter shows the pin and leaves the paint under it alone (the Renderer's `#composeOne` and `#upperCell` lay no paint of the cell's own layer over a
frozen entry; `layerOver` in `reading.js` the same). Everything else sees paint: the PIXEL view draws the paint, the
layers above lay their paint over it as over converted paint (`#exactUnder`, `#upperCell`), so the check up to the
merged-into layer is enough, and paint written or erased in the cell (`paintEditPixels`, `putEditPixels`,
`eraseEditPixels`: every tool's one way in, Retouch and the Eraser included) drops the pin (`unfreeze`), so the paint
left converts as the layer converts paint. A frozen cell merged further down keeps its paint and its pin; merged onto the
base, its pin's colors go in and become a pin there, not the paint's. A laid cell (R1) goes as the character of someone's
own it is: onto a layer it keeps its mark (`completeAt` merges the whole entry), onto the base it's a pin, which holds no
mark. An art layer's characters are written as someone's
own, unmarked, the paint under them erased. Merged onto the base (Keep crisp cells), entries and paint become the base's
pixels, which the base snaps to the palette a pixel at a time. A half an entry leaves to the base (a typed letter's with
no background, its top half) with no paint over it isn't written: the base keeps its own pixels there, which show as
they showed (`mergeCellOf`'s `kept`). Written as a stored color instead, it shifted a palette step under a slider: the
base snaps on the graphics card, which breaks a tie between two palette colors its own way (VGA's `d7` and `ff` under
Midtones 2), and a picture's cell can show a mix of its pixels' snaps that no one stored color makes (Posterize). Where a cell would show otherwise there (`unlike`, the
same check: soft paint over a cell mixed into its colors before the snap instead of after, paint with no cell under it
that the converter picks again from the snapped pixels), it's written as it showed instead (`frozenCells`): its stored
colors as its two pixels, its character pinned.

Blend into source image (`mergeIntoPicture`) is the one merge that lets characters change, so the image filters reach
them: a character of someone's own (an entry's, or a pin's under the layer's paint) is drawn into the picture as its
glyph (`drawGlyphCell`, in the drawing's font), its background mixed toward its foreground by the glyph's ink, each
half's paint laid over that half's pixels; its pin goes, and the converter picks the cell again, so it can come back as
another character. In ANSI a solid character (space, `█`, `▀`, `▄`) still goes in as its two halves, pinned `▄`; in the
ASCII styles, which show no halves, it's a glyph too. A frozen cell, a wide character (its glyph is two cells wide) and
anything in the letterbox merge exactly, pinned, as Keep crisp cells writes them (`mergeKind`).

- Lives in: `onCells`, `onBase`, `mergeCellOf`, `shapesOnCells`, `shapesOnVector`, `unlike`, `frozenCells`, `freezeUnlike`,
  `mergeIntoPicture` in `src/store/project/merging.js`; `mergeKind` in `src/document/editCells.js`; `drawGlyphCell` in
  `src/lib/glyphPicture.js`; `unfreeze` in `src/store/project/editLayer.js`; the Renderer's `#exactUnder`,
  `#upperCell` and `#composeOne` (`src/document/Renderer.js`); `layerOver` and `storedLookAt`
  (`src/store/project/reading.js`) mirror the walk; a paste keeps a frozen cell's paint (`src/store/project/selection.js`).
- Checked by: `tests/browser/merge.test.js › R3: the report: Keep crisp cells under soft paint …` (Keep crisp cells on
  CGA under Best match, soft Brush and Blur strokes and a dithered vector layer above); `› R3: the report: a shape
  merged into Layer 1 leaves no border …` (the soft edge stays paint, the base shown or hidden before or after) and
  `› … keeps every cell with a palette and Levels on, the soft edges paint`;
  `› R3: Merge down of text with no background onto the base with a palette and a slider moved: …` (#201: VGA and CGA
  under Levels, Posterize, Contrast, Saturation, Brightness, Hue, Invert, and none; Keep crisp cells keeps the canvas,
  and Blend into source image draws the letters into the picture as glyphs, a letter's block changed, none pinned);
  `› R3: Blend into source image draws a typed letter in as its glyph …` (unpinned, its ink and background in the
  picture, Blur reaching it, undo bringing back the layer, the pins and the picture), `› R3: the report: Blend into
  source image in ASCII puts the strokes over pinned spaces where Blur reaches them` (vector-strokes-ascii.phosphor) and
  `› at neutral: the same look but the letter …`; `tests/unit/edit-cells.test.js › R3: mergeKind: …`;
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
(Blur spreads their colors into the clear around them as a glow). A laid cell is recolored as a character of someone's
own, and the recolor drops its mark (R1): it's a recolored character now, which the Soft Eraser leaves. On the base, a
pin is someone's own in the ANSI view (recolored) and its pixels in the PIXEL view.

- Lives in: `src/tools/retouch.js` (`ownCellAt`, `retouchOwnPaint`, `recolorOwnCells`); `unfreeze` in
  `src/store/project/editLayer.js`.
- Checked by: `tests/browser/retouch.test.js › R4: …` (both views), `tests/browser/merge.test.js › R4: …` (a merged
  shape's edge), and the typed-character tests in `retouch.test.js`.

### R5. Colors only makes paint of what's paint to it, and tints a character of someone's own.

The Brush's and Pencil's Colors only (and a plugin brush, whose paint is always laid so, over the layer's paint as the
Brush's is: what its `own` reads is what its writes land on, so over a character of the layer's own with ink that's the
paint over the character, not the character's colors, and a write at less than full alpha tints it that much) makes a
bare ▄ (a paint block) of each cell it reaches that shows no character (R2's predicate for the layer's own cells with colors: their
halves become paint first, `unlockCells`) and of each frozen cell, whatever its character (its paint is under it
already; the pin goes); a character of someone's own with ink keeps it and is tinted, a laid cell among them, whose tint drops its mark (R1). A cell the converter drew is paint
to it in full and gets no ▄, on the base and on any layer, whatever chooses its characters (a ▄ isn't converted, so
one would outlast a change of how characters are chosen): its character is a rendering of the pixels (R7), and the paint
becomes the character the layer's settings choose over the pixels under it (on the base the paint goes into the pixels).
Under Random that brings out the character a blank cell held in its own background color, which is Random's: a stroke on
a blank canvas shows Random's characters (the base's Random had kept a ▄ there, so the default Brush painted
half-blocks on a fresh canvas). Half-block is the way to draw ▄, and its ▄ (the Shape tool's Write block glyphs'
too) is a paint block over any cell: the character it replaces goes with its foreground, which a ▄ kept would show in
its bottom half, a whole cell where the paint drew half of one. A background of the cell's own stays, as paint under the
layer's; on the base a pinned character's block takes its background in both pixels (a ▄ pinned already, a stroke
passing back over it, keeps its halves), and a cell the converter drew keeps its halves. A block on a layer above a
character of someone's own (on a layer under it, or a pin) shows the same in ANSI: it takes the character's place, a
textured character's halves its background and a solid glyph's its own halves (`blockOver` in `src/lib/Cells.js`), where
it had shown the character's foreground in its bottom half; Merge down puts it there (R3). The Shape tool's Half-block
with Write block glyphs off lays paint, which is the layer's characters over a cell the converter drew (Random's out of
a blank canvas), and in ANSI makes a block of each cell that shows a character of someone's own on the layer in use or
under it (`ownCharAt`): R2's tint there took the whole cell from an edge on its top half (the background) and only
recolored the character from one on its bottom half, so a box half a cell up or down crossed a line otherwise. A pinned
character on the base, or a cell of the layer's own, is someone's own, as anywhere; over a character of someone's own
under the layer the paint shows as R2 has it, with no entry. A ▄ on the base (Colors only's
over a pin that shows no character, Half-block's, Write block glyphs') is made of the cell's own two pixels in every art
style, as ANSI shows them. The ASCII styles show a pin on black or in no colors at all, and a ▄ written in those colors
turned its top pixel black under paint that never reached it: stripes in the PIXEL view.

A cell a shape covers under the layer (the topmost thing under it there is a vector layer's fill or stroke) is drawn
by the converter too and gets no ▄: a ▄ there made a stroke that crossed from the picture onto a shape switch from the
layer's Characters to half-blocks, so what a vector layer held changed how the layer above it painted. Inside an art
layer every cell is someone's own, and a blank one still takes a ▄ (`showsNoChar`).

- Lives in: `colorsOnlyCells` in `src/store/project/editLayer.js`, which `paintStroke` there calls for `blockChars: 'plain'`
  and a plugin brush for each call's writes that leave paint (`lay` in `src/tools/pluginBrush.js`; what it reads as the
  layer's own is `ownPaintAt` in `src/store/project/shared.js`, with `ownInked` there for a character that's tinted, and
  as what shows, `shownHalves` in `src/store/project/reading.js`: paint and cells both, so a write lands over what was
  read); `converted` says which cells the
  converter drew, with `showsNoChar` and `shapeUnder` there; Half-block's and Write block glyphs' ▄ in `writeBlocks`
  there (on the base both through `baseBlock`), which the Shape tool's Half-block asks for every cell with Write block glyphs on and for the cells `ownCharAt`
  (`src/store/project/reading.js`) names with it off (`apply` in `src/tools/shapes.js`); a block over a character under
  it in `blockOver` (`src/lib/Cells.js`), which the Renderer's `#upperCell` and
  `#composeOne`, `layerOver` in `src/store/project/reading.js` and Merge down's `onCells` use.
- Checked by: `tests/browser/block-chars.test.js › R5: …` (the base and a layer under Random, Best match and By shape;
  the reports: the Brush on a blank canvas under the base's Random, a layer with its own Random over a flat canvas; a
  flat shape under the layer; a second stroke on the base over a pin the first filled with one color, and a Half-block
  ▄ over a pinned character on the base, in each art style), `› with Colors only on the base, a cell that shows no character …`, `› with Colors only,
  a cell that shows no character (the black of an opened file's grown lines) …` and
  `› …with Colors only, a layer's own cell that shows no character becomes a plain ▄ …`; `› R5: the report: a Half-block
  box with Write block glyphs over a line box …`, `› R5: on the base, a Half-block box …`, `› R5: a Half-block box with
  Write block glyphs on the layer above a line …` (with Merge down and the stored look), `› blockOver: …`, `› R5: in a font
  drawn at its own width of 7 …` (blockOver over a narrow font's █ and ▀) and
  `› R5: the report: Half-block boxes over a line box …` (projects/boxes2.phosphor: the Shape tool and the Pencil, on the
  base and a layer, a half cell apart, Merge down and undo) and `› R5: the report: with Write block glyphs off …`
  (the crossings ▄s, Random's characters over the canvas, no ▄ written there); `tests/browser/plugin-brush.test.js › R5: in
  ANSI a put makes the cells Colors only would …` (a plugin brush's puts against the Brush's over the same pixels),
  `› R5: in PIXEL …` and `› R5: in ANSI a put at half alpha over a letter of the layer's own tints it as the Brush at 50%
  does`, `› own reads the paint a write lands on …`, `› shown reads what shows at a pixel …` and `› a put lands over what shown
  read …`; `tests/browser/plugin-examples.test.js › Smear: red dragged
  across a typed letter leaves it a letter, tinted, with either Reads`.

### R7. The characters are a rendering of the pixels: an upper layer converts over the pixels under it.

Paint and shapes on an upper layer, where they don't tint a character of someone's own (R2), convert over the two
grid pixels the PIXEL view shows under that layer: the lower group's output (the picture with its paint, before the
palette) with each upper layer below laid over by its alpha. In the ASCII styles never over the shown character's
halves (those are ink on black, far darker than the pixels, so a faint stroke one layer up came out dark). In ANSI,
under a character of someone's own (a pin, the lower cells layer's), the PIXEL view shows the character's look (R11), so
that's what's under: its halves, not the two pixels the base stores under it (its background over its foreground). A
circle's soft edge over an opened file's red box lines mixed into black on every top half and red on every bottom one,
olive and black stripes by turns. A vector layer right on the base draws its shapes into the converter's input, so
there each cell a shape takes holds the pin's look in place of its two pixels (each half the background and foreground
mixed by the glyph's ink in it), before the color settings, as the pixels would be; Merge down and Bake press them
into the base over that look, so nothing changes. Right on the base means in the whole stack, eyes aside: the lower
group is the whole stack's, and a hidden layer is only left out of it (`lowerGroup`'s `shows`). A vector layer
right on the base draws at the base's scale and one above at the paint's, so a cells layer hidden under a vector layer
that moved it onto the base would redraw its strokes at another scale, as other characters. The lower
group's own paint converts over the picture the same way. Under By shape (and plugin solvers, R12), which matches finer samples of the picture
(4 × 8 a cell), the layer above matches the same samples with the layers between and its own pixels laid over them
(`#fineUnder`), so a photo's detail under soft paint counts there as it does on the lower group; where the picture has no
samples (the lower group isn't By shape or a plugin solver) the two pixels stand in. Its own pixels are sampled as finely as they're drawn
(`#samplesAt`: a vector layer's shapes, and a cells layer's paint, which `#paintOver` is handed), so a picture added to
the layer, a block pasted on it or a shape merged into it keeps its detail there, as it would on the lower group; a
brush's paint, a grid pixel at a time, samples the same as its two pixels. An upper vector layer draws its shapes at the paint's
scale, and Merge down draws them into the paint as they are, so By shape (and plugin solvers, R12) samples the merged paint as it sampled the
shapes, and the PIXEL view, which shows a grid pixel of paint as its block's average, shows them as it did. So the ASCII view says what the PIXEL view shows, and paint
merged down converts to what it converted to above, except for the converter's own differences (a palette snapped at
another step, dither error, By shape's finer samples, a plugin solver's neighbors, R12), which R3 freezes.

- Lives in: `lowerGroup` (`src/document/layerInfo.js`), with its `shows` from `ProjectStore.lowerGroup` and
  `FrameBuilder.prepare`; `Renderer.#pixelsUnder` and `#fineUnder` (`src/document/Renderer.js`), used by `#upperCell` for shapes and
  for `#paintOver`'s convert path, with `pictureUnder` for the lower group; the look under a character of someone's own
  comes from `composeUpper`'s reader (`#lowerPx`), and `#fineUnder` steps aside there; on the bottom, `ShapeLayer`'s
  `#looks` (in `#draw` and `pressed`, turned on by `lookUnder` in ANSI), which draws a cell again when its pin changes
  alone (`#pinsChanged`), and `writeBaseCells` composites again after its pins; `storedLookAt` (`src/store/project/reading.js`)
  tracks the stored pixels under the same way.
- Checked by: `tests/browser/layer-stack.test.js › R7: …` (faint red over white, in Color ASCII by intensity and By
  shape and in ANSI; the report's file; a soft edge over pinned blocks, on a layer above or on the base, then Merge
  down; a pin changed alone under a shape, and its undo; the report `projects/vector-edge-over-pins.phosphor`; the report
  `projects/vector-strokes-ascii.phosphor`, a cells layer hidden under a vector layer); `tests/unit/layer-info.test.js ›
  lowerGroup: a hidden layer is left out of its part …`; `tests/browser/layer-hide.test.js › a cells layer with no paint
  hides and shows …`; `tests/browser/merge.test.js › R7: under By shape …` (soft paint over a photo
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
that color's ink on black. Blend into source image is the exception: it draws a typed cell into the picture as its
glyph (R3), and the converter's cells are ink on black, so the background goes into the picture's pixels and the cell
comes back as ink on black.

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

### R11. The PIXEL view shows a character on the base as it looks; what's stored stays its two pixels; fills and the Wand read the look.

The base holds a character of someone's own as a pin and two pixels: its background the top one, its foreground the
bottom one (`writeBaseCells`), whatever the character is. An art layer's cells are drawn the same way. Shown as they
are, every such cell is its background over its foreground: a `█` is half a cell, and a line of `█ ░ ▒ ▓` a row of
dashes. So the PIXEL view draws each one's look over those pixels: the cell the ANSI view shows there, at pixel scale.
Per half, its background blended toward its foreground by the ink the glyph has there (`halfColors`, as the Overlay
draws a layer's cell and `#showResolved` Best match's). `█` is solid, `▓ ▒ ░` are three quarters, a half and a quarter of the way, `▐ ▌` a half (a grid pixel is a
column wide, so it can't split sideways), `▄` as it was, a thin character faint. The cell is the one the art style
shows (`pinnedCell`: R8's background in Color ASCII, white on black in Monochrome ASCII).

Display only. The output, the cells, saved files and exports hold the two colors as before. The Eyedropper and the
drawing tools read and write those (`shownCanvas`, the base's own pixels), not the look: the Eyedropper on a gray `▒`
picks one of its two colors, and the Brush on the base over a `█`'s upper pixel changes its background, which doesn't
show. The Paint Bucket, the Gradient (through the Bucket's area) and the Magic Wand in PIXEL read the look
(`pixelsAsSeen`), with the characters of the layers above as the Overlay draws them (R6), at full strength whatever the
Overlay's opacity: a fill covers a cell of spaces whose two colors differ whole, stays inside a block of `░`, and stops
at text typed on a layer above. With All layers off, a fill on the base reads the base's own look (its pixels, its pins
as they look: `baseLook`). What a fill writes is still paint.

A pin an eraser leaves black is a black space. When the PIXEL view's Eraser or the Soft Eraser (in either view, both
through `eraseBasePixels`, as the Wand's Delete in PIXEL is) leaves both of a pinned cell's pixels black, the pin
becomes `' '` with no indexes, which is what the Hard Eraser in the ANSI view leaves (`eraseBase`). It looks the same,
black on black, and the file no longer keeps a character no one can see: it's saved, and sent to a room, as a space. It
holds for every pin, a laid line's (R1) among them. A pin left partly colored (a soft stroke's edge, one of its two
colors erased) keeps its character.

What's over the character counts, bottom to top, as the cell itself is laid (`#composeOne`, `#paintedPin`,
`#upperCell`), so the look stays the ANSI view's cell while that's still the character:

- **Paint on a layer above** (the lower group's, an upper cells layer's) tints the character as the ANSI view tints it
  (`coverCell`, R2): it goes into the cell's two colors, each snapped as paint is, and the glyph's ink blends them
  again. Over a solid or empty glyph that's a `▄` with the paint in the half it's in; over a shade or a letter the
  paint is in its background (upper half) or foreground (lower half) and shows through the whole cell by the ink. The
  blend itself is never snapped: a shade's mix isn't a palette color, and the first trace of paint (a soft stroke's
  edge) would turn it into one, a hard ring round every stroke. Where the paint doesn't tint the character but is
  converted over the cell's two pixels (R2: in ANSI an open character with no entry of the layer's, in the ASCII styles any), the look is the character it converts to, as the ANSI view shows it. The two pixels
  aren't shown: under a space they're its background over its foreground, so soft paint over an opened file's spaces
  showed as horizontal stripes.
- **A paint block over it** (a Half-block's `▄`, R5) takes its place, as `blockOver` has it: a solid glyph's own
  halves, a textured character's background in both.
- **A frozen cell over it** (R3) is its paint, and the pixels show.
- **A shape reaching the cell** takes it, and makes it a rendering of the pixels under it (R7), which in ANSI are the
  look's halves with the shape over them: under the lower group's shapes the pin gives way (`pinAt`) and the pixels
  show, the look drawn into them; under an upper vector layer's, those halves with the shape and what's above it over
  them show, snapped.
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

- Lives in: `looksCanvas`, `#lookAt`, `#lookPainted` and `baseLook` (`src/document/Renderer.js`); a pin erased black in
  `eraseBasePixels` (`src/store/project/baseLayer.js`); drawn by
  `redrawDisplay` and `drawVeil` (`src/components/InputEditor.vue`) and `FrameBuilder.build`; read by the fills and the
  Wand through `pixelsAsSeen` (`src/store/project/reading.js`), with the Overlay's cells (`ownIndexes`,
  `src/document/editCells.js`).
- Checked by: `tests/browser/pixel-characters.test.js › R11: …` (the report's file; a character written, written over
  and undone; paint over one on the layer above and on one above that, as the ANSI view tints it; on a palette, faint
  paint that leaves a shade as it was; an opened ANSI file under soft strokes, the same to the pixel with All cells off
  and on; soft paint over spaces with no ink in both ASCII styles and under a layer of its own characters, with no
  stripes; a Half-block `▄` over a character; a `█` under a layer with its own characters; shapes; a hidden base; both ASCII styles;
  a palette with Best match; art layers above and in the lower group; a built frame; the ghost; the Overlay; a redraw
  that asks no cell), and `tests/browser/look-read.test.js › R11: …` (spaces of two colors filled whole in both views,
  as in 022.xb; a `░`, a letter and a `█` filled whole with no leak; a `▀` by its top halves; the base's own look with
  All layers off; a fill on the base stopped by characters typed on a layer above with the Overlay at 0, and running
  under them with All layers off; the Wand selecting what the fill fills). Timed by `bench/pixel-view.bench.js`.
  A pin erased black: `tests/browser/eraser.test.js › R11: a pin left partly colored keeps its character …` and
  `› R11: the Soft Eraser on the base …`, with `› R11: on the base a laid line's pin …` (the PIXEL Eraser, and the
  Soft Eraser in the ANSI view).

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

### R12. A plugin solver is a kind of By shape: it sees the picture's neighbors, and paint and upper layers only its own cell.

A layer whose Choose characters is a plugin's solver ([plugins.md](plugins.md#writing-a-solver)) is sampled as By shape is:
the same 32 samples a cell, the same Bayer nudge, the same finer samples under an upper layer (R7), the same set, palette
and style holding its answer. So every rule here that says By shape covers it ("By shape (and plugin solvers, R12)").
What differs is what it may read. Over the picture, on the lower group, a solver reads the samples of the cells within its
`reach` (pass 1) and pass 1's characters within it (pass 2, the `refine`). Over paint, and on every layer above the lower
group, where a cell is matched one at a time over what's under it, it gets its own cell alone: reach 0, no pass 2
(`alone`). Neighbors through paint aren't read at all, so a cell's answer there doesn't depend on a neighbor's paint, and a
stroke's redraw needs no area grown by reach. Floyd–Steinberg's error is carried by pass 1's walk only; pass 2 has none.

The consequence is R3's. Paint merged onto the base is the base's pixels, which a solver reads with their neighbors, so
a cell of it can convert otherwise than it did over the picture: the solver saw that cell alone, and now sees what's beside it.
Merge down pins exactly those cells (`unlike`, `freezeUnlike`, R3) so the canvas stays as it showed, as it does for By
shape's finer samples. A solver that throws, or whose plugin is gone, off or doesn't do the style, is By shape for the
layer (a stand-in), and so the same rules.

- Lives in: `resolvePlugin` and `pluginMatcher` in `src/lib/PluginSolve.js` (`alone` is the own-cell case, and `origin`
  tells the solver the cell's place in the drawing); in the Renderer, `#resolveShapes` (the lower group: reach, pass 2,
  `resolvePluginBy`), `#resolvePainted` (paint over the picture: `alone`) and `#upperChar` / `#pluginCell` (an upper
  layer's cell, alone).
- Checked by: `tests/browser/plugin-render.test.js › R12: Merge down under a plugin solver freezes what it showed` (a
  white rect on Layer 1, merged onto the base: the cells that would convert otherwise are pinned and the canvas is the
  same; unlike R3's tests it merges the paint onto the base and checks the pins), and in the same file `› over paint
  and on an upper layer the solver sees only its own cell`, `› a stroke recomputes only the grown area, and the result
  equals a whole resolve` and `› a solver keyed on the cell's col and line draws an upper layer as it draws the lower
  group`.

### R13. In Monochrome ASCII, paint on the base takes the pins it lands on.

Monochrome ASCII shows every pin as its character in white on black, so R2's tint has nothing to show there: a pinned
character under the Brush stayed as it was, and a drawing whose every cell is a pin (Flatten's Draw on top, an opened
ANSI file) took paint nowhere but its pinned `▄`s. So in Monochrome ASCII, paint laid on the base (the Brush, the Paint
Bucket, Gradient, a Shape's fill, Retouch) and the Eraser's black in the PIXEL view or Soft take the pin of every
cell they reach, a part-covered one too, and the cell converts from its pixels again. As the pin goes, the cell's two
pixels take its look (the halves the PIXEL view drew for it, R11) in place of the background over foreground it was
stored as, and the paint lands on that: a half the paint misses shows as it did. Left bare, a pinned space's black over
white showed as bands along a soft stroke's edge. A cell written onto the base with no colors of its own (the Brush's
`▄` from Colors only over a cell it reaches) takes the same: Monochrome ASCII's look of a base cell is its character
alone, so the `▄` went in black, and a soft stroke over white painted before drew a black rim. A pinned `▄` stays: outside ANSI it's pixels already (`Renderer.pinAt`), and it keeps what ANSI
shows (Colors only pins one). The ANSI view's Hard Eraser still leaves a pinned space, and writing cells still pins.
The other styles show a pin's colors, so there the pin stays, recolored (R2, R4, R8). The pins go as part of the edit,
so Undo brings them back.

- Lives in: `takePins` (`src/store/project/shared.js`), called by `paintEditPixels` (`src/store/project/editLayer.js`)
  on the base and by `eraseBasePixels` (`src/store/project/baseLayer.js`); `colored` in `writeOnBottom`
  (`src/store/project/editLayer.js`).
- Checked by: `tests/browser/brush.test.js › R13: …` (the report's file, `projects/ascii-pinned-paint.phosphor`: a
  drawing flattened onto the base, every cell pinned; the Brush and the Eraser in Monochrome ASCII, a half-covered cell
  keeping its look in the other half, a soft stroke over white painted before staying white, a pinned `▄` kept, Undo,
  and ANSI and Color ASCII keeping their pins).

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
