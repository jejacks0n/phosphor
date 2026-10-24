# Characters

A cell holds one character, and Phosphor lays characters out the way a UTF-8 terminal does, so a
`.utf8ans` file looks in a console the way it looks in the editor. That means any script, symbol
or emoji a terminal can show, not only the 256 characters of classic DOS ANSI art (CP437).

## One column or two

Every character takes one or two columns, by the same Unicode rules terminals use:

- **One column**: letters and digits, punctuation, box drawing (`╬`), block elements (`▀ ▄ █ ░ ▒ ▓`),
  most symbols (`★ ☺ ♥`), half-width katakana (`ｱ`), and even very wide-looking ones like `﷽`,
  which a terminal squeezes into its single column.
- **Two columns**: Chinese, Japanese and Korean characters (`漢 か 가`), fullwidth forms (`Ａ`) and
  emoji (`👍🏽 🇯🇵`).

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

## Typing any script

With the Text tool, you can type with your system's input method (Japanese, Chinese, Korean...),
dead keys and accents, and the emoji picker, the same as in any text field.

You can also paste text. It types from the cursor; each new line starts on the next row at the
column where the paste began; and once a row is full, the rest of that line is dropped.
Characters a cell can't hold (tabs, invisible ones) are skipped. A paste is one undo step.

Cmd/Ctrl+V still pastes a Select-tool block when you've copied one.

## Saving: .utf8ans and .ans

- **.utf8ans** keeps every character. A two-column character is written once and the terminal moves
  two columns for it, so the rows line up.
- **.ans** is CP437 and can't hold most of these: each character it lacks is written as its closest
  lookalike or `?`, and Phosphor tells you which ones before you export. A two-column character
  becomes its stand-in plus a space, so the grid still lines up.

## When art looks wrong in someone's terminal

Some characters, including the block elements, are "ambiguous width" in Unicode. Most terminals
show them one column wide, but a terminal set to show ambiguous characters as wide (an option in
many terminals, sometimes the default for Chinese, Japanese or Korean setups) draws them two
columns wide, and block art falls apart there. That's the viewer's setting, not the file.

Terminals also differ on some newer emoji. Phosphor follows current Unicode, which recent terminals
do too.
