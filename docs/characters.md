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

## The font

**Font**, in the side panel's Setup, sets the font the art is drawn in, in both views, and its size.
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

## Typing any script

With the Text tool, you can type with your system's input method (Japanese, Chinese, Korean...),
dead keys and accents, and the emoji picker, the same as in any text field.

You can also paste text. It types from the cursor; each new line starts on the next row at the
column where the paste began; and once a row is full, the rest of that line is dropped.
Characters a cell can't hold (tabs, invisible ones) are skipped. A paste is one undo step.

Cmd/Ctrl+V pastes whatever you copied last: a Select-tool block you copied in Phosphor, or text
you copied anywhere else since (see [Layers](layers.md#the-select-tool)).

## Saving: .utf8ans and .ans

- **.utf8ans** keeps every character. A two-column character is written once and the terminal moves
  two columns for it, so the rows line up.
- **.ans** is CP437 and can't hold most of these: each character it lacks is written as its closest
  lookalike or `?`. The export dialog lists every one, what it becomes and how many cells use it,
  before you export. A two-column character becomes its stand-in plus a space, so the grid still
  lines up.

Saving a project and both exports open the same dialog, where you name the file (Cmd/Ctrl+S opens it
for the project). The name you give becomes the document's name, so the next save starts from it.
Every browser saves it as a download with that name, Safari included.

## When art looks wrong in someone's terminal

Some characters, including the block elements, are "ambiguous width" in Unicode. Most terminals
show them one column wide, but a terminal set to show ambiguous characters as wide (an option in
many terminals, sometimes the default for Chinese, Japanese or Korean setups) draws them two
columns wide, and block art falls apart there. That's the viewer's setting, not the file.

Terminals also differ on some newer emoji. Phosphor follows current Unicode, which recent terminals
do too.
