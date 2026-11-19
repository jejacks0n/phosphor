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
- To load a file: the font field's file box, as a person picks a file (`e2e.fixture` is for `tests/fixtures/`; her
  own files are written into the run folder).
- Habits: loads the font before anything else, saves often, opens her export again to check it.
- A desktop with a mouse and a pen tablet.

## What they lean on

- Load font and the bitmap fonts it takes, Save .F## and Save PNG
  ([Bitmap Fonts](../../characters.md#bitmap-fonts)).
- The character palette, the status bar's code, Best match and By shape
  ([How the Converter Picks Characters](../../characters.md#how-the-converter-picks-characters)).
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
- Does: starts a new canvas, clicks Load font, picks her `.F08` file.
- Expects: the font is chosen at once and listed under This drawing; the art is drawn in it; Save .F08 and Save PNG
  are offered; a failed file says why in words.
- Probes: `back-out`: open the file box and cancel; `extremes`: a file of the wrong size (100 bytes) says why it isn't a
  font.
- Rated: yes, wants a key or a drop on the page to load a font

### 2. Load a PNG sheet
- Does: loads her PNG sheet the same way, then the same file twice.
- Expects: the sheet becomes the drawing's font; the second load doesn't add a second copy to the list; a sheet that
  isn't 16 characters across and 16 down is refused with a reason.
- Probes: `again`: load the `.F16` after the sheet and check only one font is the drawing's; `extremes`: a sheet of
  the wrong size.
- Rated: no (drawing)

### 3. Take it off and undo
- Does: chooses a built-in font in the Font dropdown (that takes the font off the drawing), then undoes, then redoes.
  Remove, beside the dropdown, only clears the browser's copy of a loaded font: the drawing keeps its own.
- Expects: taking it off is one undo step; undo brings the font back with the art drawn in it; redo takes it off again; the
  characters she typed are the same ones after each.
- Probes: `undo-redo`: undo three times in a row and check nothing else was undone; `interrupt`: reload with the font
  set and check it's still the drawing's.
- Rated: yes, wants Cmd+Z

**Free time:** she'd save the font back as `.F08` and as PNG and load them again, switch between her fonts and a
built-in one, and check what the Font field says while the drawing has its own.

## Draw in it

### 4. Type a character my font lacks
- Does: in Edit Mode, types a letter with an accent and a character from another script, then chooses a built-in font in the Font dropdown.
- Expects: each shows as its nearest classic stand-in while the font is on, and the status bar's code is the font's
  slot or nothing; after the font is taken off the characters she typed are back as she typed them.
- Probes: `undo-redo`: undo the typing with the font on and off; `again`: type the same character in ten cells.
- Rated: yes, wants T, then typing

### 5. Pick from the palette's 256
- Does: opens the character palette and picks characters from it, then draws with them.
- Expects: the palette shows the font's 256 slots, not another set; what she picks is what lands; the status bar's
  code after Char is the slot of the character under the cursor, in decimal, and gives way on a narrow bar.
- Probes: `extremes`: pick the first and the last slot; `speed`: pick and type fast.
- Rated: yes, wants F1 to F12 for characters, as moebiusXBIN has them

### 6. The blocks and shades
- Does: draws full, half and shade blocks over a color, in her 8×8 font and in her 16 one.
- Expects: they're drawn from the font's own pixels and fill their cells; no lines between cells at 100% or 200%.
- Probes: `extremes`: zoom to 800% and to 25%.
- Rated: no (drawing)

**Free time:** she'd draw a short piece in her font, flip to the PIXEL tab, resize the grid, and check the font stays
the same through each.

## A photo in my font

### 7. Convert a photo
- Does: opens a photo from the fixtures with her font as the drawing's font, with Characters set to Best match, then
  By shape.
- Expects: the characters used are the font's glyphs (a photo of a face made of her own shapes), not the classic set;
  turning the font off changes how the cells look and which are chosen.
- Probes: `again`: convert a second photo; `undo-redo`: undo the conversion and check the font is still hers.
- Rated: no (drawing)

**Free time:** she'd turn the font on and off with a photo open, change the color palette to a Custom list of 16 and
see what that does to the same photo, and save a project and reopen it.

## Export my XBin and open it again

### 8. Export with CGA
- Does: with CGA as the Color palette, exports XBin (Export, then `.xb`), with and without SAUCE; reopens the file with
  Choose a file.
- Expects: it reopens with the same cells, the same font (hers) and CGA as the palette; with no font of her own the
  export holds IBM VGA 8×16; Include SAUCE is optional.
- Probes: `again`: export twice and open both; `back-out`: close the dialog without exporting.
- Rated: yes, wants Cmd+E

### 9. Export with a Custom list of 16
- Does: sets the Color palette to Custom with a list of 16 colors (Lospec style hex codes), exports XBin, reopens it.
- Expects: it reopens as a Custom list of the same 16 colors, in the same order, with the same cells and font.
- Probes: `extremes`: a list of one color, and of 16 with a repeated color.
- Rated: no (drawing)

### 10. Refuse the 17th color
- Does: sets a Custom list of 17 colors, then opens Export and looks at `.xb`; then tries Limited count at 32.
- Expects: the Export button is off for XBin and the dialog says XBin holds 16 colors and what to pick instead; the
  other formats still export.
- Probes: `out-of-order`: change the palette to 16 with the dialog open and check the button comes on.
- Rated: no (drawing)

**Free time:** she'd open a 16colo.rs XBin from the packs, check it against its picture, and export it back, and
change one cell on the way.

## Known

Until Phosphor draws other cell shapes, an 8×8 font's photo conversion is squashed and a font of odd height draws a
pixel off. Don't report either.
