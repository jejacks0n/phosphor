# Characters

A cell holds one character, and Phosphor lays characters out the way a UTF-8 terminal does, so a
`.utf8ans` file looks in a console the way it looks in the editor. That means any script, symbol
or emoji a terminal can show, not only the 256 characters of classic DOS ANSI art (CP437).

## One column or two

Every character takes one or two columns, by the same Unicode rules terminals use:

- **One column**: letters and digits, punctuation, box drawing (`╬`), block elements (`▀ ▄ █ ░ ▒ ▓`),
  most symbols (`★ ☺ ♥`), half-width katakana (`ｱ`), and some that draw far wider than that, like
  `﷽`. A terminal gives `﷽` one column, then draws it at its full width over the characters after
  it, and Phosphor draws it the same way: the row keeps its columns, and the shape covers what
  follows (to the end of its row). This applies to any character drawing wider than its columns.
  How much wider depends on the fonts, so Phosphor measures it in the browser's; a terminal using
  other fonts can draw it a little wider or narrower.
- **Two columns**: Chinese, Japanese and Korean characters (`漢 か 가`), fullwidth forms (`Ａ`) and
  emoji (`👍🏽 🇯🇵`). Emoji draw in their own colors, as a terminal shows them: the cell's
  foreground color doesn't change them, and its background shows around them.

A character can be more than one code point: `👍🏽`, a flag, or a letter with a combining accent
is still one character in one cell.

## Two-column characters

A two-column character starts in its own cell and covers the cell to its right, whatever that cell
holds, just as a terminal draws it.

- **The last column** has no room for one: there it shows (and exports) as a space. Typing one in
  the last column does nothing and says why.
- **Typing** one moves the cursor two cells. In insert mode it pushes the rest of the row right by
  two.
- **Writing over either half** turns the other half into a space, the way a terminal does.
- **Backspace** over one, and **Delete** on one, removes the whole character.
- **The cursor** never stops on the covered half: moving right skips it, and clicking it puts the
  cursor on the character.
- **The eraser** erases the whole character from either half.
- **Selections** act on cells, and a two-column character belongs to the cell it starts in. A
  selection whose right edge cuts one copies it whole, and when it's pasted it still covers one
  cell past the paste.
- **Shapes, Fill and the F-keys** can draw with one: each cell gets it, and every other cell ends
  up covered, so a row of them reads as a row of characters.

## Generated characters

The converter only uses one-column characters: anything two columns wide in your **Characters**
set is skipped, so the cells it fills never overlap.

## How the converter picks characters

**Choose characters**, above the Characters field in the left column's **Characters** section, sets how the
converter picks each cell's character from your set. The section is the picked layer's (its name is in the title), and
a new drawing picks Layer 1: to change how the picture converts, pick Base in LAYERS ([Layers](layers.md#the-left-column)).
Each Art style offers its own ways:

| Art style | Ways |
| --- | --- |
| ANSI | Random, Best match, By shape |
| Color ASCII | By intensity, By shape |
| Monochrome ASCII | By brightness, By shape |

- **Random** (ANSI): a character from your set at random, by the **Character seed**. The seed shows only
  with Random, and only when the set has more than one character.
- **By intensity** (Color ASCII) and **By brightness** (Monochrome ASCII): the brighter or stronger the
  cell, the further along your set its character, darkest first. This is how these styles have always
  chosen.
- **Best match** (ANSI): for each cell, the character and its foreground and background colors that
  come closest to the picture, with both colors taken from the palette. Each character counts by how
  much ink it has in its top half and its bottom half, so `▄` shows one color above and another below,
  and `░ ▒ ▓` show one flat mix of the two colors. Repeating a character in your set makes no
  difference. With **Blocks & shades** (`▄░▒▓█`) and the CGA or VGA palette it draws gradients
  with shades of the palette's colors. Without a palette it mostly gives `▄` or solid cells,
  since it has no colors to mix.
- **By shape** (every style): each cell is compared at a finer detail than the grid, 4 × 8 samples, with
  the shape of each character in your set, and the closest wins. In ANSI it picks the character and
  both colors; in Color ASCII the character and its ink color, on black; in Monochrome ASCII the
  character alone, white on black. Smoothing doesn't change these samples: they're always averaged.

**Each layer has its own character settings**: Choose characters, the Characters set, the Character seed, Solids,
Pattern light, and (for the base and vector layers, with a palette) Dither style and Dither. The Characters section shows the layer picked in LAYERS, under its name, and what you change
there changes only how that layer's paint, picture or shapes become characters (the base's are its picture's). A
new layer starts with the picked layer's, and a drawing from before layers had their own gives every layer the ones
it had, so it looks the same. Where a layer's settings differ from the base's, a seam can show where its cells meet
the ones under it. A layer with its own Best match or By shape picks the way the base does: By shape samples a vector
layer's shapes inside each cell over what's under them, so a circle's edge gets the same characters on its own layer
as it would on the base's, and Best match mixes its colors before the palette, so a soft edge can get a shade. Paint
is matched by its halves (it covers whole half cells). On such a layer its own Ordered Dither nudges each cell by its
place, as on the base; its own Floyd–Steinberg doesn't carry error between Best match's or By shape's cells (they're
matched one at a time over what's under them), so there it does nothing. The Art style and the palette are the whole
drawing's ([Layers](layers.md#the-left-column)).

Two sliders tune Best match and By shape:

- **Solids** (ANSI): how strongly a plain solid cell (one color, whatever the character) is preferred
  over a shade or a half-block. At 0% every cell is whatever matches best; higher gives more flat
  cells. It isn't offered in the ASCII styles, where the background is always black.
- **Pattern light** (Best match and By shape, every style): how a character's ink mixes its two colors.
  At 0% the mix is a plain average; at 100% it's mixed as light mixes on a screen, so a shade reads
  lighter than the average.

**Dither** (in the Characters section, with a palette) still applies. With Random, By intensity and By brightness it dithers the
picture's pixels, as described in [Layers](layers.md). With Best match or By shape,
Floyd–Steinberg carries each cell's error on to the cells after it (it can lag on very large
documents, and while you edit the base layer, the cells under the edit settle when you let go), and
Ordered (Bayer) nudges each cell by its place in the grid.

Typed cells aren't touched by any of this, and a pinned character stays pinned. With Random and
Best match, paint colors a cell's halves through its character (or makes a `▄` over a solid cell).
With **By shape**, a cell with paint in it is matched again with the paint over the picture, so it
gets the character (and colors) it would have once merged down: white paint on black shows as
characters in Monochrome ASCII, and a stroke over part of a cell gets the shape that fits it. Erase
the paint and the cell is the picture's again. Paint covers whole half cells, though, so there's no
finer shape in it to find: on its own a stroke gives `▀`, `▄`, `█` and the like, as before, and the
finer characters (quadrants, `▐ ▌`, the rising blocks) come only where paint and the picture share
a cell. Detail finer than half a cell comes from the picture. Floyd–Steinberg's error doesn't pass through painted
cells; it does once they're merged down.

In ANSI with a palette, the Pixel tab shows the cells Best match or By shape chose, each half its
two colors blended by how much of it the character covers (as typed and drawn characters show
there), so a `▒` of black and white is a gray there even when the palette has no such gray, and the
Paint Bucket and Magic Wand go by what you see. Without a palette, and in the ASCII styles, the
Pixel tab shows the picture. With the CGA or
VGA palette, Bake bakes exactly, without asking how to keep the colors, when Dither is on or the
characters come from Best match or By shape.

**The characters are measured in IBM VGA**, whichever font you view the art in, so the font never
changes which characters are chosen: changing it changes how the cells look, not which characters
they hold. Where two choices come out almost exactly as close, another computer (its graphics card)
can now and then pick the other one, in a cell here and there.

## The font

**Font**, in the left column's Drawing section, sets the font the art is drawn in, in both views, and its size.
Phosphor has four:

- **JetBrains Mono**: the default.
- **IBM VGA**: the VGA font of old PC screens, with Unscii for the characters it lacks.
- **Unscii**: an 8-bit-style font with wide coverage, including Symbols for Legacy Computing.
- **Unifont**: GNU Unifont, which covers almost everything in its own plain style.

The last three are 8×16 pixel fonts that share one cell, so box drawing and blocks line up whichever
of them draws a character. In the canvas view, the block elements (`█ ▀ ▄ ▌ ▐` and the quadrants)
and the shades (`░ ▒ ▓`) aren't the font's: Phosphor draws them itself, as most terminals do, so
they fill their cells exactly and the shades' dots line up from cell to cell, in any font (a dot is
a sixteenth of the cell's height, the VGA's own pixel). Everything else is the font's: smoothed
(anti-aliased), or pixel-sharp with **Smooth** in the ANSI view's status bar turned off, in both
views. Pixel fonts look sharpest at their own size or a whole multiple of it (16 or 32). Wide characters (Chinese, Japanese, Korean) and emoji come from your system's fonts.

**Load custom**, beside the field's label, adds a font from your computer: TrueType, OpenType or
WOFF. It has to be monospaced, every character the same width as in a terminal; Phosphor checks ten
characters (`il.' MWm@0`) and says so when they differ. A loaded font starts at 16px, keeps its own
height (so a full block fills its cell), and stays in this browser until you remove it (**Remove**,
shown while it's the font in use). It isn't uploaded anywhere.

The font changes how the art looks in Phosphor. It also changes how the characters you draw look
in the Pixel tab, and in the image when you merge them into it: each cell blends its colors by how
much of it its character covers, measured in the font you see. It doesn't change how an image
converts, or what's saved or exported; a terminal or viewer draws the file in its own font. The
font and size are kept in this browser, not in the project.

While you draw in someone's room, the art is in the host's font and size, and follows them when they
change it; the field shows it, off, and yours comes back when you stop. A font the host loaded from
their computer can't be sent, so the room sees JetBrains Mono instead.

## Typing any script

With the Text tool, you can type with your system's input method (Japanese, Chinese, Korean...),
dead keys and accents, and the emoji picker, the same as in any text field.

A run of typing is one undo step: it ends when you pause for a second, move the cursor (a
click, the arrow keys, Enter, Home, End) or paste.

You can also paste text. It types from the cursor; each new line starts on the next row at the
column where the paste began; once a row is full, the rest of that line is dropped, and lines past
the last row are dropped too. Characters a cell can't hold (tabs, invisible ones, an accent on its
own) are skipped. A paste is one undo step.

Cmd/Ctrl+V pastes whatever you copied last: a Select-tool block you copied in Phosphor (in this tab
or another), a block copied in Moebius, or text you copied anywhere else, such as PabloDraw, which
gives other apps only its characters (see [Layers](layers.md#the-select-tool)).

## Saving: .utf8ans and .ans

- **.utf8ans** keeps every character. A two-column character is written once and the terminal moves
  two columns for it, so the rows line up.
- **.ans** is CP437 and can't hold most of these: each character it lacks is written as its closest
  lookalike or `?`. The export dialog lists every one, what it becomes and how many cells use it,
  before you export. A two-column character becomes its stand-in plus a space, so the grid still
  lines up.
- **Colors** are written as the Color palette says: CGA as the 16 classic colors, VGA as 256-color codes
  (`38;5`), and the rest as 24-bit ones (`38;2`). A file you opened keeps the palette it came with
  ([Opening a file](layers.md#opening-ansi-and-text-files)), so it comes out in the same kind of codes.
  Its black and white keep their codes too: 16 and 231 are fixed black and white in a terminal, while 0
  and 15 follow its theme, though Phosphor shows them alike. They stay 16 and 231 opened with **Edit it**
  or **Draw on top of it**, moved, copied, merged down (onto the base too), merged exactly into the image
  and flattened, through undo and a saved project. The VGA color box has 16 and 231 as swatches of their
  own, and the Color Picker picks them as they are: what you type, fill, draw with Shapes or set with Set
  FG and Set BG in them comes out as 16 or 231, and Alt+↑ and Alt+↓ step through them in order. The Brush
  paints pixels, so its black and white are always 0 and 15, and so is a 16 or 231 cell painted over;
  the recent colors keep only the color, as 0 or 15.
- **SAUCE**, the record after the art, says what's on the SAUCE tab: title, author, group and your
  comments. For a converted image or a blank canvas, Phosphor's own lines come first (Created with
  Phosphor, and the settings it was converted with), then a blank line and yours. A file you opened gets
  none of them: it comes out with its record as it went in, its date, flags (iCE colors, letter spacing),
  font name, size and comments changed only where you changed them on the SAUCE tab. A resize changes the
  size it gives. Comments are lines of up to 64 characters: a longer line breaks at a space, and only a
  word longer than 64 is split. The record holds at most 255 lines.
- **.png** is a picture of the art as the ANSI view draws it, in your display font, at one pixel per
  font pixel: the frame showing, with or without Animate. With Smooth text off (the status bar's
  **Smooth**) every pixel is one of the art's colors and the file is small. With it on, the export
  first asks: **Smooth** (picked first) keeps the anti-aliased edges, which add colors and make the file
  a few times bigger, and **Hard-edged** draws the text crisp, as with Smooth text off. It asks every
  time, and the answer doesn't change the setting.

Saving a project and the exports open the same dialog, where you name the file (Cmd/Ctrl+S opens it
for the project). It offers the document's name with the date and time (`art-20261030-131405`), so
each save is a new file; type over it for any other name. The name you give becomes the document's
name, so the next save starts from it, with a new time. Every browser saves it as a download with
that name, Safari included.

Phosphor also keeps your work in this browser as you go. A refresh brings it back, with an empty undo
history, and a new tab offers your recent work to pick up. **Versions** lists the snapshots it keeps
every 5 minutes while you work (the last 20): restore one and what you had stays in the list, as
"Before restoring" if it isn't there already. Once the art has been saved to a file or opened from one, leaving the page no longer asks unless the
latest edits haven't been written yet; a room you host always asks. Saving to a file is the real backup: clearing site data deletes
what's kept in the browser, Safari can also delete it after seven days of browser use without a visit,
and a private window's kept work is gone when the window closes.

## When art looks wrong in someone's terminal

Some characters, including the block elements, are "ambiguous width" in Unicode. Most terminals
show them one column wide, but a terminal set to show ambiguous characters as wide (an option in
many terminals, sometimes the default for Chinese, Japanese or Korean setups) draws them two
columns wide, and block art falls apart there. That's the viewer's setting, not the file.

Terminals also differ on some newer emoji. Phosphor follows current Unicode, which recent terminals
do too.
