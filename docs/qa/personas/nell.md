# Nell: an artist from moebiusXBIN, drawing in her own fonts

## Who

Nell draws in moebiusXBIN and publishes her packs on 16colo.rs. She draws in Amiga Topaz 8×8 and in a font she drew
herself as a PNG sheet, and she knows XBin, its 16 colors and Lospec palettes well. She has never used Phosphor, and
she tries it the way she'd try any editor: load her font first, then see what it does to her art.

## Why they're here

She wants to draw in her own fonts and export an XBin that 16colo.rs shows exactly as Phosphor did. Done is an XBin
that reopens in Phosphor with the same cells, font and palette, and that looks the same on 16colo.rs.

## What they bring

- Her fonts: a `.F08` and a `.F16` file, and a PNG sheet (16 characters across, 16 down). Make them in the snippet:
  raw bytes for the `.F##` files (256 characters, one byte per pixel row, so 2,048 bytes for an 8×8 font), and
  `fontSheet` (from `src/lib/BitmapFont.js`) for the sheet. When `input/qa/` has packs, use the fonts and the XBins
  beside them instead, and say so in a note.
- A photo from `tests/fixtures/images/` for the conversion.
- To load a file: the Fonts page's + Load file box (reached by Manage fonts ▸), as a person picks a file (`e2e.fixture` is for `tests/fixtures/`; her
  own files are written into the run folder).
- Habits: loads the font before anything else, saves often, opens her export again to check it.
- A desktop with a mouse and a pen tablet.

## What they lean on

- Manage fonts ▸ and the Fonts page: + Load and the bitmap fonts it takes, Save .F## and Save PNG
  ([Managing Fonts](../../characters.md#managing-fonts), [Bitmap Fonts](../../characters.md#bitmap-fonts)).
- Palettes that belong to a font, Export palettes and Import
  ([Palettes That Belong to a Font](../../characters.md#palettes-that-belong-to-a-font)).
- The character palette, the status bar's code, Best match and By shape
  ([How the Converter Picks Characters](../../characters.md#how-the-converter-picks-characters)).
- Cells in the shape of her font: conversion, the PIXEL tab, switching heights and round tools
  ([Bitmap Fonts](../../characters.md#bitmap-fonts)).
- Color palette (CGA, Limited count, Custom), Export XBin and Include SAUCE
  ([Saving .xb](../../characters.md#saving-xb)), opening an XBin
  ([Opening ANSI and text files](../../layers.md#opening-ansi-and-text-files)).

## What makes them give up

- A font that loads and then isn't the one she sees, or a character that isn't the one she typed.
- An XBin that reopens with different cells, a different font or a different palette.
- An export button that's off and doesn't say why.
- Her font lost on a reload.

## Sizes

- 80 columns by 25 to 100 lines, one or two layers.
- A font file of 2,048 bytes (8×8) or 4,096 (8×16); a PNG sheet of 128 by 128 or 128 by 256 pixels.
- Palettes of 16 colors, and one of 17.

## Traits

All apply. She has no account and no partner. On a phone or tablet she loads her font from the device's files.

## Script

Each `##` heading after this one, up to Known, is a section of the script. Steps are numbered through the whole
script. Every section ends with Free time.

## Load my font

### 1. Load a raw font
- Does: on the start screen, before any drawing is open, clicks Manage fonts ▸ beside the Font field, clicks + Load on
  the Fonts page and picks her `.F08` file; closes the layer, reloads the page and starts a blank canvas.
- Expects: the font is chosen at once and listed under In use (its line says the next drawing's font), with its 256 slots shown when its row is chosen;
  the reload keeps it; the blank canvas starts in it (the Font field shows it, and the art is drawn in it); Save .F08 and Save PNG
  are offered, and save files named for hers without its `.F08` (`name.F08`, `name.png`); a failed file says why in
  words.
- Probes: `back-out`: open the file box and cancel, then close the layer with Escape and check her keys work; `extremes`: a file of the wrong size (100 bytes) says why it isn't a
  font.
- Rated: yes, wants a key or a drop on the page to load a font

### 2. Load a PNG sheet
- Does: loads her PNG sheet the same way (+ Load), then the same file twice.
- Expects: the sheet becomes the drawing's font; the second load doesn't add a second copy to the list; a sheet that
  isn't 16 characters across and 16 down is refused with a reason.
- Probes: `again`: load the `.F16` after the sheet and check only one font is the drawing's; `extremes`: a sheet of
  the wrong size.
- Rated: no (drawing)

### 3. Take it off and undo
- Does: chooses a built-in font in the Font dropdown (that takes the font off the drawing), then undoes, then redoes.
  Remove, on the Fonts page, only clears the browser's copy of a loaded font: the drawing keeps its own.
- Expects: taking it off is one undo step; undo brings the font back with the art drawn in it; redo takes it off again; the
  characters she typed are the same ones after each. Remove with the font chosen on the Fonts page leaves the art drawn in it,
  its cells as wide as before, the character palette too.
- Probes: `undo-redo`: undo three times in a row and check nothing else was undone, then export an XBin and open it while the font is loaded in the browser: it opens with the blocks the drawing shows after the undos, not the last ones she set; `interrupt`: reload with the font
  set and check it's still the drawing's.
- Rated: yes, wants Cmd+Z

**Free time:** she'd save the font back as `.F08` and as PNG and load them again, switch between her fonts and a
built-in one, and check what the Font field says while the drawing has its own.

## Draw in it

### 4. Type a character my font lacks
- Does: in Edit Mode, types a letter with an accent and a character from another script, then chooses a built-in font in the Font dropdown.
- Expects: each shows as its nearest classic stand-in while the font is on, and the status bar's code is the font's
  slot or nothing; a character with no stand-in in her font shows blank; after the font is taken off the characters she typed are back as she typed them.
- Probes: `undo-redo`: undo the typing with the font on and off; `again`: type the same character in ten cells.
- Rated: yes, wants T, then typing

### 5. Pick from the palette's 256
- Does: opens the character palette and picks characters from it, then draws with them.
- Expects: the palette shows the font's 256 slots, not another set; what she picks is what lands; the status bar's
  code after Char is the slot of the character under the cursor, in decimal, and gives way with the hex codes on a
  narrow bar.
- Probes: `extremes`: pick the first and the last slot; `speed`: pick and type fast.
- Rated: yes, wants F1 to F12 for characters, as moebiusXBIN has them

### 6. A palette made in my font
- Does: with her font as the drawing's font, opens the character palette layer on Palettes, makes a new palette with + New and fills a few slots, then picks JetBrains Mono in the Font field and looks at Palettes, then goes back to her font (undo, or Use this font on the Fonts page). Hides the built-in palettes with Hide under Built-in, flips the strip with Alt+← and Alt+→, picks JetBrains Mono and comes back, then shows them again. Exports the palette (Export in the editor head's … menu, beside Duplicate, and Export palettes on the Fonts page) and imports the file with Import, then does it again with her font not loaded in the browser (Remove on the Fonts page, in a drawing without it).
- Expects: the new palette is listed under For her font, first; it's gone in JetBrains Mono and back with her font, chosen as before; with the built-ins hidden, the list keeps Built-in with only Show under it, the strip flips only through her palettes, and JetBrains Mono still has the built-ins; the editor's head says For her font ▾ and offers Use with any font; the exported `name.palettes.json` imports with its name ("name (custom)" while she still has one called that), empty slots and font; with her font not loaded the import adds the palette under For fonts not loaded (N) and says "Added 1 palette for her font. Load that font to see it."; a file that isn't a palette file is refused with a reason.
- Probes: `undo-redo`: undo Use this font and check the palette she had chosen is in use again; `extremes`: import a broken file and a file with 13 glyphs, and check what she kept is unchanged; `again`: import the same file twice.
- Rated: no (drawing)

### 7. The blocks and shades
- Does: draws full, half and shade blocks over a color, in her 8×8 font and in her 16 one.
- Expects: they're drawn from the font's own pixels and fill their cells; no lines between cells at 100% or 200%.
- Probes: `extremes`: zoom to 800% and to 25%.
- Rated: no (drawing)

**Free time:** she'd draw a short piece in her font, flip to the PIXEL tab, resize the grid, and check the font stays
the same through each.

## My font's blocks

### 8. A font whose lower half is somewhere else
- Does: builds a copy of her `.F16` in the snippet with slots 220 and 240 swapped, loads it with + Load, opens Manage fonts ▸ and chooses its row, reads the Blocks row and the note under it, then paints with the Brush and the Paint Bucket and hovers over cells. Then builds another copy with slots 176, 177 and 178 blanked, loads it with + Load, exports an XBin in it and opens that.
- Expects: the Blocks row shows Lower at slot 240 and every other block at its CP437 slot; the note says the lower half was found at 240; the paint shows as half blocks; the status bar's code over a painted half cell is 240; the meta line doesn't say "blocks set by you"; the copy without shades, loaded and again as the XBin opens, brings a short toast: "This font has no Light, Medium, or Dark block, so those characters draw blank." with a **Set up its blocks** button that opens the Fonts page on that font with Light picked.
- Probes: `again`: load the same file twice and check one copy is listed and the blocks are the same; `undo-redo`: undo the font change (the drawing goes back to its previous font), and check the paint stays and still shows as half blocks, then redo.
- Rated: no (drawing)

### 9. Set a block by hand
- Does: with that font, paints, then picks the Lower tile and clicks slot 220 (≡) in the sheet, then undoes, redoes, and clicks Find blocks again. Picks Lower again and clicks slot 223 (Upper's). Then exports an XBin (Export, then `.xb`), opens it with Choose a file while the font is loaded in the browser, and again after Remove on the Fonts page.
- Expects: after the click on 220 the Lower tile shows 220, the paint she drew before now shows as ≡, Upper is unchanged at 223, and the meta line says "blocks set by you" (it does whenever any block differs from what the pixels say); undo and redo each undo or redo the whole change; Find blocks again puts Lower back at 240 and clears "blocks set by you"; clicking 223 with Lower picked gives Lower 223 and the Upper tile still shows 223 (the two share it, and hovering 223 names both), and clicking 220 again leaves Upper at 223; the XBin opens with the blocks as she set them while the font is loaded in the browser, and with the blocks found again after Remove.
- Probes: `undo-redo`: undo three times in a row and check nothing else was undone; `interrupt`: reload after setting a block and check it's still set; `extremes`: set a block to the slot that holds a space.
- Rated: yes, wants Cmd+Z

### 10. A font with no lower half
- Does: builds a copy of her `.F16` with slot 220 blanked and no other half-block shape in the font, loads it, reads the toast that comes up, then closes it with its × and looks at the tool buttons for Pencil, Brush, Paint Bucket, Shapes, Gradient, Retouch's Blur, Dodge and Burn, the Eraser, Text and Flip. She clicks the Brush (on a phone or tablet, taps it). Opens a photo in the blanked font. Then clicks **Set up its blocks** in the toast, clicks slot 254 (the small square) in the sheet, and paints again.
- Expects: a toast that stays says "This drawing's font, *name*, has no lower half block, so it can't be painted in yet." with a **Set up its blocks** button, and comes back after a reload; with the lower half missing those paint tools are off, with the reason as their tooltip; after × closes the toast, a click or tap on one of them brings it back with its button (a swipe over them shows none); the Eraser, Text and Flip stay on; the photo converts with Best match; Set up its blocks opens the Fonts page on her font with the Lower tile picked and outlined in red, the sheet outlined dashed, and the note saying "Lower is picked: click the slot in the sheet that should draw the lower half."; after the click on 254 a short toast says "Lower half set to slot 254. The paint tools are on.", the tools come on and paint draws as the small square.
- Probes: `out-of-order`: start a stroke with the tool just before it goes off; `speed`: tap an off button ten times fast; `back-out`: on a phone, start a swipe on a button that's off, slide off it, and check no toast shows; `undo-redo`: undo the slot and check the toast that stays comes back, then redo and check it goes.
- Rated: yes, wants the reason on the button as a tooltip on a phone too

**Free time:** she'd set every block to a slot of her own and export the XBin, undo the lot, and check the Blocks row after a reload.

## A photo in my font

### 11. Convert a photo
- Does: opens a photo from the fixtures with her font as the drawing's font, with Characters set to Best match, then
  By shape.
- Expects: the characters used are the font's glyphs (a photo of a face made of her own shapes), not the classic set;
  turning the font off changes how the cells look and which are chosen.
- Probes: `again`: convert a second photo; `undo-redo`: undo the conversion and check the font is still hers.
- Rated: no (drawing)

**Free time:** she'd turn the font on and off with a photo open, change the color palette to a Custom list of 16 and
see what that does to the same photo, and save a project and reopen it.

## Export my XBin and open it again

### 12. Export with CGA
- Does: with CGA as the Color palette, exports XBin (Export, then `.xb`), with and without SAUCE; reopens the file with
  Choose a file.
- Expects: it reopens with the same cells, the same font (hers, under In use named for the file without its
  `.xb`) and CGA as the palette; with no font of her own the export holds IBM VGA 8×16, its glyphs as crisp as the
  font's; Include SAUCE is optional, and the record names no font.
- Probes: `again`: export twice and open both; `back-out`: close the dialog without exporting; `again`: add the file
  to a new canvas with no font of its own, and check a cell in the font's first slot comes in as a space;
  `out-of-order`: open an `.ans` after the XBin and check her font stays, then an XBin with no font in it and check
  it's drawn in IBM VGA.
- Rated: yes, wants Cmd+E

### 13. Export with a Custom list of 16
- Does: sets the Color palette to Custom with a list of 16 colors (Lospec style hex codes), exports XBin, reopens it.
- Expects: it reopens as a Custom list of the same 16 colors, in the same order, with the same cells and font.
- Probes: `extremes`: a list of one color, and of 16 with a repeated color.
- Rated: no (drawing)

### 14. Refuse the 17th color
- Does: sets a Custom list of 17 colors, then opens Export and looks at `.xb`; then tries Limited count at 32.
- Expects: the Export button is off for XBin and the dialog says XBin holds 16 colors and what to pick instead; the
  other formats still export.
- Probes: `out-of-order`: change the palette to 16 with the dialog open and check the button comes on.
- Rated: no (drawing)

**Free time:** she'd open a 16colo.rs XBin from the packs, check it against its picture, and export it back, and
change one cell on the way.

## Square cells

### 15. A photo in Topaz
- Does: with her 8×8 font (Topaz) as the drawing's font and the aspect lock on, opens a 4:3 photo from the fixtures at 80 columns, then sets Columns to 40.
- Expects: at 80 columns the grid is 60 lines, and the photo isn't squashed; at 40 columns it's 30 lines and the photo keeps its shape.
- Probes: `again`: Columns 40 again, and back to 80; `undo-redo`: undo the Columns change and the open.
- Rated: no (drawing)

### 16. The PIXEL tab agrees
- Does: flips to the PIXEL tab on that drawing and compares it with the ANSI view at the same zoom, then clicks a cell with the Pencil.
- Expects: the same cells' halves line up in both views, each cell is square, and the Pencil's pixel lands under the pointer.
- Probes: `extremes`: zoom in to 800% and out to 25% and check the halves still line up.
- Rated: no (drawing)

### 17. Switch 8×16 ↔ 8×8 with drawn cells
- Does: in a drawing in her `.F16` font, types a line of text, draws a Brush stroke, then uses Use this font to switch to her `.F08` font, then undoes, redoes, and switches back.
- Expects: the typed text keeps its column and line, the lines double going to 8×8 and halve going back to 8×16, the columns stay, and one undo puts the drawing back as it was; the same switch in a drawing with frames is refused with a toast that says why.
- Probes: `out-of-order`: switch with a selection up; `undo-redo`: undo three times in a row and check nothing else was undone; `extremes`: on a photo with text typed over it, widen Columns to 100 (the canvas grows, the photo stays where it was), then switch: the photo stays under the text, as tall again, not grown to fill the wider grid.
- Rated: yes, wants Cmd+Z

### 18. Shapes and paint follow
- Does: in 8×16, draws a VECTOR circle and a Brush stroke, switches to 8×8, then draws a new circle with Shift in the VECTOR tab, gives it a thick stroke and clicks just inside the stroke's top edge, draws a stroke with the Brush, and looks at the Brush outline. Then loads an 8×11 font of her own (written in the snippet) and draws a Pencil stroke and a half block.
- Expects: the old circle and stroke stretch with the picture; the new Shift circle and the Brush outline are round on screen, the circle's stroke is as thick at its top as at its side, and the click on its edge selects it; in the 8×11 font a cell's halves are 5 and 6 rows, with nothing a pixel off at the seam.
- Probes: `again`: switch back to 8×16 and check the circle and stroke return to their shape.
- Rated: no (drawing)

### 19. Fill an XBin of spaces
- Does: in her `.F08`, writes in the snippet an XBin of red spaces with black ink (022's case) and opens it. Fills with the Paint Bucket in both views, then with All layers on types a word on Layer 1 and fills the base around it.
- Expects: whole cells fill, and the fill goes around the word.
- Probes: `again`: All layers off, and the fill runs under the word.
- Rated: no (drawing)

### 20. Half-column detail in her font
- Does: draws a Half-block ellipse and two steep lines, leaning left and right, with Half-column detail. Then the Soft Eraser goes over one, and she types over a cell of the other and erases it.
- Expects: ▌ ▐ █ only, the lines mirror images, the Soft Eraser takes the drawn cells, and the typed one stays.
- Probes: `again`: draw the same lines again and check they come out the same.
- Rated: no (drawing)

### 21. VECTOR in 8×8
- Does: draws a rect with a 2-wide stroke, makes a new Radial gradient, tweens a quarter turn and has a shape Follow a diagonal path with Rotate to face path.
- Expects: the stroke is as thick on top as at the side, the gradient is round, the turn doesn't bend the shape, and the follower faces along the path on screen.
- Probes: `again`: undo the tween and tween it again.
- Rated: no (drawing)

### 22. A switched file exports clean
- Does: opens an `.ans`, switches to her `.F08`, exports an XBin and reopens it.
- Expects: the lines the switch added are spaces, with no hidden characters.
- Probes: `again`: export and reopen once more.
- Rated: no (drawing)

**Free time:** she'd draw in 8×8 from the start, export an XBin, and reopen it.

## My font's lines and sets

### 23. Make a line style
- Does: with her `.F16` in use, opens Manage fonts ▸, chooses its row, opens **Lines**, clicks **+ New line style** and names it "Heavy". Clicks the first tile and then slots 1 to 11 in the sheet one after another, then goes to the drawing and opens the Pencil's **Draw with**. Draws a box with Shapes in it, then a Single line across it.
- Expects: after each click the next tile is picked and the note says how many pieces are to go; "Heavy" isn't under **Draw with** until the eleventh is set, then is offered after **Double line**, below a rule that the arrow keys pass over; clicking the slot that draws a block is refused with the slot's block named, and clicking a slot she already gave another of Heavy's pieces is refused with that piece named, her tile still picked; the box has her corners and tees, and where the Single line crosses it the crossing cell holds the new line's piece as if the other line weren't there (the Single line came last, so Single's ─; where hers comes last, her own piece), and drawn again over itself the box joins itself.
- Probes: `again`: draw the same box twice and check it's the same; `undo-redo`: undo the style and check it leaves **Draw with**, then redo.
- Rated: no (drawing)

### 24. Flip it and hide Double
- Does: selects the box and flips it, then back. On the Fonts page clicks **Hide** on Double, then **Show**.
- Expects: the flip turns her pieces into her own pieces (no Single or Double character appears); with Double hidden it leaves **Draw with** and **Show** brings it back, for her font only (another font still offers it).
- Probes: `extremes`: hide both Single and Double and check **Draw with** still offers hers.
- Rated: no (drawing)

### 25. Make a set
- Does: opens **Sets**, clicks **+ New set**, clicks into its characters, then clicks slots 3, 5, 3 in the sheet. Types an "a" in the field after them. Opens a photo and picks the set from the Characters field's ▾ with **Choose characters** on Random. Unchecks **Show stock sets** and reopens the ▾.
- Expects: the set holds the three slots with the repeat kept, and the typed character; the ▾ lists her set first, under her font's name, then **Stock**; the photo converts in only her characters; with **Show stock sets** off the stock sets leave the menu, and still show for a font with no sets of her own.
- Probes: `extremes`: empty the set with Backspace, leave the field and check it's no longer offered, and that one undo brings the whole set back; `undo-redo`: on a font of hers that's only in this browser (not the drawing's), delete a set and click **Undo** on the "Deleted …" toast, and check the set is back where it was.
- Rated: no (drawing)

### 26. All of it after a reload
- Does: reloads the page, then exports an XBin, reopens the project and checks the Fonts page. Then starts a room as host, has a second browser join as an artist and a third watch, and looks at the Fonts page in the host's and the artist's.
- Expects: the style, the sets, the hidden Double and **Show stock sets** are back after the reload, and with the project; in the room the Lines and Sets can't be changed, and say "A font's blocks, lines and sets can't change in a room."; the artist draws in her font and offers her style under **Draw with** and her sets under the Characters ▾; the watching browser sees the drawing in her font too, and so does the room's picture in the lobby.
- Probes: `interrupt`: reload right after the last slot click and check the style is whole.
- Rated: no (drawing)

### 27. Look in the library
- Does: on the Fonts page, waits for the Library group, types `amiga` in Search fonts…, then clears it; opens Tags ▾, picks Amiga and 8×8, removes one chip, then Clear; searches for something that matches nothing and clicks Clear; scrolls to Show 100 more; looks at FROGBLOCK's row.
- Expects: Library · N fonts becomes Library · N found while narrowed; each tag shows a count, and a tag no current match carries is off; Escape or a click outside closes the picker (Escape doesn't close the layer); no matches says so with Clear; Show 100 more adds the next 100; FROGBLOCK says "not included" with its credit; offline, the group says the library couldn't load and Try again works, with In use, Yours and Built-in unaffected.
- Probes: `back-out`: open Tags ▾ and press Escape; `extremes`: pick tags until the count is one; `speed`: type in the search while the library loads.
- Rated: no (library)

### 28. Use a library font
- Does: on the Fonts page, chooses a VileR font and a Mœbius font in the Library group; reads the tags, From and License lines; clicks a tag chip; presses Use this font on one and Add to Yours on the other; chooses the first again; chooses FROGBLOCK, follows Get it ↗, then uses + Load with the file.
- Expects: details say "Bitmap 8×h · Library" with both buttons; VileR says None given · credits in FONTS.TXT, Mœbius says Unknown · Know it? Tell us; a tag chip becomes the picked tag; Use this font makes it the drawing's font and puts it in Yours, Add to Yours only puts it in Yours; a font already in Yours shows its stored details with the same From and License lines and isn't added twice; FROGBLOCK says "not included" with Get it ↗, + Load and its credit, and the loaded file shows as FROGBLOCK with its credit under its name, and its credit shows under the settings panel's Font field while the drawing uses it.
- Probes: `interrupt`: reload right after Use this font and check the font is in Yours once; `offline`: Use this font with the network off says so and changes nothing.
- Rated: no (library)
- Also: uses Amiga Topaz 1+ from the library, opens the SAUCE tab, then presses undo; adds Amiga Topaz 2 to Yours, then uses it; exports an `.ans`, then opens a file whose SAUCE font name is Amiga Topaz 1+ (and one that says IBM VGA), and again with the network off.
- Also expects: Font name reads Amiga Topaz 1+ after Use this font and one undo takes the font and the name back together; Amiga Topaz 2 used after Add to Yours sets Font name to Amiga Topaz 2 too; the opened file shows in Amiga Topaz 1+ with that font in Yours and nothing to undo; the IBM VGA file opens as it always did; offline, the file still opens, in the font in use, with a note that the font couldn't be fetched.

**Free time:** she'd make a second style, draw a spiral with each, and undo the lot.

## Known

