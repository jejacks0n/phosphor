# Dex: draws ANSI by hand, cell by cell

## Who

Dex has drawn ANSI art since the BBS days and still releases in packs. He draws in PabloDraw and Moebius, mostly
character by character, and knows CP437 by heart: which byte is `▀`, what iCE colors are, what a SAUCE record holds,
why a line runs past column 80. He's new to Phosphor. He lives on the keyboard and counts every trip to the mouse.

## Why they're here

He wants to open his own .ans files, put a group logo on a piece, fix and extend it by hand, and export an .ans that
opens exactly the same in other tools: the same characters in the same cells, the same colors, bright backgrounds
bright, his SAUCE intact. Done is an export the terminal shows cell for cell as Phosphor does, and that Phosphor opens
again unchanged.

## What they bring

- The generated files (the README's Files): `scene` (80 columns: CP437 characters, a move right, a saved and restored
  cursor, a bright background written as blink, a line running past column 80, SAUCE titled "QA Scene" by
  "Phosphor QA" of "QA") and `logo` (a 20 by 5 shape on black spaces, CGA).
- `ansi/past-the-edge.ans` from `tests/fixtures/`: a real file's first lines, with a move right from the edge that
  wraps.
- Real packs from `input/qa/packs/` when they're there: `blocktronics_blocktober/ungenannt_oceanvs.ans` (137 KB, the
  biggest), `fire-41/#41_FIRE.ANS`, and the `.xb` files beside them (`fire-41`, `impure88`).
- To drop a file on an open drawing: a headless browser can't drag from the desktop, so send the drop to the canvas
  with the file in it, as `tests/e2e/art-files.spec.js` does (a DataTransfer holding the file), at the cell he'd drop
  it on.
- Habits: Moebius's keys (F1 to F10 for characters, Alt+F, Alt+B, Alt+arrows for colors, C or S to stamp, Escape to
  set a block down); tries a shortcut before looking for a button; holds arrow keys down; mashes Cmd+Z.
- A desktop with a full keyboard; a mouse only when he must.

## What they lean on

- Edit Mode and its keys, the character palettes (F1 to F12, Ctrl+F-key, Alt+← and Alt+→), the color keys
  ([Layers](../../layers.md#tool-keys), [Color keys](../../layers.md#color-keys)).
- The Pencil's Half-block, the Eyedropper, the Select tool, Shift and the arrows, Stamp, the Magic Wand, Set FG and
  Set BG ([The Select tool](../../layers.md#the-select-tool), [The Magic Wand](../../layers.md#the-magic-wand)).
- Opening ANSI files, adding one to a drawing, Merge down and Flatten
  ([Opening ANSI and text files](../../layers.md#opening-ansi-and-text-files), [Flattening](../../layers.md#flattening)).
- SAUCE, Export .ans, and the shortcut list (`?`).

## What makes them give up

- An export whose cells differ from the screen, or that another tool opens differently: a shifted line, a lost bright
  background, a character swapped without telling him.
- An opened file that isn't what he drew: a wrong wrap, a lost indent, colors off by one.
- An action he does fifty times a session with no key, or a key that does nothing.
- Focus lost after a dialog, so his keys stop working until he clicks.

## Sizes

- 80 columns by 200 lines (16,000 cells; Dimensions 80 by 400 pixel rows): his scene grown to a full piece.
- The scene opens at 80 by 6 lines; the logo is 20 by 5; `past-the-edge.ans` is 80 by 18.
- Real files: 80 columns, a few hundred lines, up to 137 KB.
- 4 layers at most: Base, Layer 1 (his art), Layer 2 (a word to move) and Layer 3 (the logo).

## Traits

All apply. He has no account and no partner. On a touch device he still tries the keys first at every rated step, as
every run does.

## Goals
- My .ans export shows in a terminal cell for cell as Phosphor shows it: the same characters, the same colors, bright backgrounds still bright, my SAUCE intact.
- Phosphor opens my files as I drew them, and opens its own export again unchanged: no wrong wrap, no lost indent, no color off by one.
- Export my .ans from the keys in three presses or fewer.
  Counted: keys on export-ans, target 3, lower is better.
- When a dialog closes, my keys work again without a click.

## Script

Each `##` heading after this one, up to Known, is a section of the script. Steps are numbered through the whole
script. Every section ends with Free time.

## Opening my scene to edit it

### 1. Open my scene to edit it
- Does: writes the files (`files.writeFiles`), and on the start screen chooses `scene.ans`; at the question "Open
  scene.ans?" picks Edit it.
- Expects: it opens on ANSI at 80 columns by 6 lines, every cell an edit cell on Layer 1 over a black base; the line
  that runs past column 80 wraps onto the next line; Z sits ten columns past "ab", R right after Z where the cursor
  was saved; the `!` has a bright red background, not blinking; the palette is CGA; SAUCE shows "QA Scene", "Phosphor
  QA" and "QA"; Undo is off (opening isn't an edit). It opens within the `file` budget.
- Probes: `back-out`: choose the file and press Cancel at the question, and check the start screen is as it was;
  `free`: drop the file on the start screen's box instead of the button.
- Rated: yes, wants Cmd+O, then Enter for Edit it

### 2. Check it's my file, cell for cell
- Does: plays `scene.ans` in the headless terminal (`terminal.terminalCells`, cp437) and compares it with the cells on
  screen (`terminal.diffCells`, the app's side through `terminal.normalizeHidden`).
- Expects: no differences.
- Probes: `extremes`: open `ansi/past-the-edge.ans` the same way and look at its second row's indent on screen (a
  modern terminal doesn't wrap on a move right past the last column and the app does, so judge that file by its
  screenshot and note the terminal's difference).
- Rated: no (a check, outside the app)

### 3. Make room: 80 by 200
- Does: sets Dimensions' second number to 400 (200 lines).
- Expects: with art on the edit layer, it's a canvas resize: lines are added at the bottom, his art stays where it is,
  and the aspect lock is off; it lands within the `setting` budget.
- Probes: `extremes`: type 99999, then 0, and see where it stops (80 columns reach 5,000 lines); `undo-redo`: undo after the
  resize and check it takes back his last edit and leaves the size (a resize isn't an undo step, and mustn't forget
  the steps before it), then redo it; `interrupt`: shrink to 3 lines, then back to 200, and check the cut-off lines came back.
- Rated: yes, wants Tab to Dimensions

**Free time:** he'd press `?` and read the shortcut list, open the SAUCE tab to check the fields, try the PIXEL tab to
see what his art looks like there, and zoom to 200% and back by the status bar.

## Drawing character by character

### 4. Type a line of text
- Does: presses T, moves the cursor with the arrows, types a line, presses Insert and types into the middle of it,
  then Home, End, Backspace and Delete, then Enter.
- Expects: letters land in his colors; Insert pushes the row right and Overwrite replaces (the status bar says which);
  Enter goes to the start of the next line; a run of typing is one undo step, ending when he pauses or moves the
  cursor.
- Probes: `speed`: hold Backspace for two seconds; `undo-redo`: undo the typing, redo it, then type and check redo is
  off; `out-of-order`: press Delete at the end of a row and Backspace at column 0.
- Rated: yes, wants T

### 5. Draw with CP437 from the character palettes
- Does: in Edit Mode, types F1 to F12, switches palettes with Alt+→ and Alt+←, puts the character under the cursor on a
  slot with Ctrl+F5, and opens Character palettes to pick `╬` from CP437 onto a slot.
- Expects: each F-key types its slot's character; the strip under the tools shows each slot; Character palettes opens
  with CP437, Unicode, In this drawing and Recent; a character CP437 lacks is marked ("isn't in CP437"); a built-in
  palette edited makes his own copy and says so.
- Probes: `back-out`: open Character palettes and press Escape; check focus comes back so his keys work;
  `extremes`: put an emoji on a slot and type it in the last column ("A two-column character won't fit in the last
  column."); `again`: Alt+→ through every palette and round.
- Rated: yes, wants F1–F12 and Alt+→

### 6. Draw half blocks
- Does: presses P, sets Draw with to Half-block, and draws a small shape in two colors.
- Expects: each cell he paints becomes `▄`, and the half he doesn't paint keeps its color; a straight line with Shift
  from his last stroke.
- Probes: `undo-redo`: undo the shape stroke by stroke; `again`: draw over the same cells twice in another color.
- Rated: yes, wants P, then a key for Draw with

### 7. Set my colors from the keys
- Does: presses Alt+F, arrows to a color, Enter; Alt+B, arrows, Space, Escape; X to swap; in Edit Mode, Alt+↑ and
  Alt+↓ to step the foreground, with Shift for the background.
- Expects: the color box opens on the current color, the arrows move between swatches, Enter picks and closes, Space
  picks and stays, Escape closes; with CGA every swatch paints its CGA color; X swaps (in Edit Mode it types, so he uses
  Shift+Cmd+X there).
- Probes: `back-out`: open the box and press Escape, then check where focus is and that tool keys work; `speed`: hold
  Alt+↓ for two seconds; `extremes`: with Saturation at 0, open the box again: the colors that aren't gray show under
  a "no" sign, say why when hovered, can't be picked, and the arrows and Alt+↓ go past them to the grays.
- Rated: yes, wants Alt+F, then Enter

### 8. Pick a color off the art
- Does: presses I and clicks a cell; turns the FG and BG toggles on and off; then, with the Pencil, holds Alt and clicks
  a cell, and Alt+Shift for the background.
- Expects: with both lit it sets both colors from the cell; the status bar shows the pick and where each color came
  from; letting Alt go brings the Pencil back.
- Probes: `out-of-order`: pick from an empty cell of the grown canvas; `interrupt`: let Alt go in the middle of a drag.
- Rated: yes, wants I, or a key that picks the colors under the Edit Mode cursor

### 9. Recolor a block
- Does: presses M, selects a block of text with Shift and the arrows from a corner, presses Set FG, then Set BG.
- Expects: every selected cell takes his foreground (then background), keeping its character and its other color, in
  one undo step each; with a color set to None the button says to choose one first.
- Probes: `undo-redo`: undo Set BG, then Set FG; `out-of-order`: Set FG with the foreground set to None.
- Rated: yes, wants M, Shift+arrows, then a key for Set FG

**Free time:** he'd look for a key that toggles Draw with between modes, try the Pencil's Single line and Double line
with Connect, type a box with the F-keys' line characters, and check the shortcut list names every key he used.

## Blocks: select, copy, move

### 10. Copy a block and paste it
- Does: with Select, drags over a block, presses Cmd+C, moves the selection with the arrows, presses Cmd+V, nudges the
  pasted block with the arrows and sets it down with Enter.
- Expects: the paste lands floating and selected at the selection; arrows nudge it a cell; Enter sets it down; the
  paste is one undo step and the move another.
- Probes: `undo-redo`: undo the move (the block goes back where it was pasted, floating), undo again (it's gone);
  `again`: paste twice in a row; `speed`: hold an arrow for two seconds moving the block.
- Rated: yes, wants Cmd+C, Cmd+V

### 11. Move a block through empty cells
- Does: presses + Layer, types a word on Layer 2 with spaces around it, hides Layer 1 with its eye (a move takes every
  cells layer that shows), selects a block larger than the word, moves it with the arrows onto where his art is, sets
  it down with Enter, and shows Layer 1 again.
- Expects: the block's cells with nothing on Layer 2 are see-through: Layer 1's art shows through them; what the block
  passed over is as it was.
- Probes: `out-of-order`: move a block with Layer 1 showing too, and check each layer's part moves on its own layer;
  `back-out`: press Escape mid-move and check the block is set down where it is.
- Rated: yes, wants the arrows

### 12. Select from the cursor
- Does: in Edit Mode, presses Shift+→ five times and Shift+↓ twice, then Escape.
- Expects: the Select tool takes over from the cursor's cell; each press is an undo step; Escape sets the selection
  down and takes him back to Edit Mode with the cursor where he left it.
- Probes: `extremes`: Shift+→ past the last column; `undo-redo`: undo the presses one by one.
- Rated: yes, wants Shift+arrows

### 13. Stamp and erase
- Does: with a block selected, presses S, moves it with the arrows, presses C, moves again, then E on a selection.
- Expects: each stamp leaves a copy and floats the block on, one undo step each; E deletes the selection (Delete and
  Backspace too).
- Probes: `speed`: press S ten times quickly; `undo-redo`: undo the stamps one by one.
- Rated: yes, wants S

### 14. Select every cell of a color
- Does: presses W, sets Match to FG only, clicks a cell, Shift-clicks another color, then presses Delete; Escape.
- Expects: the wand selects what matches (Contiguous on: only what touches), tinted while the wand is the tool;
  Shift-click adds; Delete takes away what's in it on the layers that show, one undo step; Escape drops it.
- Probes: `out-of-order`: press Delete with nothing selected; `again`: click the same cell twice; `undo-redo`: undo the
  delete and the selections.
- Rated: yes, wants W, then a key for Match

**Free time:** he'd paste text copied from a text editor at the cursor, flip a block with box lines in it, try Rotate
on a block with characters (it's off, and says why), and look for Moebius's block keys he hasn't tried.

## Putting the logo on

### 15. Add a layer for the logo
- Does: picks his top layer (Layer 2, from step 11), presses + Layer.
- Expects: Layer 3 on top, picked.
- Probes: `again`: add one more and delete it from its ⋯ menu; `interrupt`: rename it with F2 on its row, Escape.
- Rated: yes, wants Shift+Cmd+N

### 16. Drop the logo on my piece
- Does: drops `logo.ans` on the canvas at a cell, and picks Add to this drawing.
- Expects: the question offers Add to this drawing, Open to edit, Open to draw on top and Cancel; Add lands the logo
  floating and selected at the cell he dropped it on, on Layer 3, as one undo step; the drawing's SAUCE and palette
  stay his.
- Probes: `back-out`: drop it and press Cancel; `extremes`: drop it near the right edge and check what runs past is cut
  off; `out-of-order`: drop an `.xb` from the packs and see what it says.
- Rated: yes, wants a key to add a file to the drawing

### 17. Move it into place by keys
- Does: moves the floating logo with the arrow keys, sets it down with Enter.
- Expects: a cell per press; it stops at the grid's edge rather than pushing off; Enter sets it down.
- Probes: `speed`: hold → for two seconds; `undo-redo`: undo the move (back where it landed, floating), redo.
- Rated: yes, wants the arrows

### 18. Merge the logo down
- Does: with Layer 3 picked, presses Merge down.
- Expects: no question (it's a cells layer into a cells layer): the logo's cells, its black spaces too, are written
  onto Layer 2 as they show, Layer 3 leaves the stack and nothing on the canvas changes; one undo brings Layer 3 back,
  picked. Merge down again puts Layer 2 into Layer 1 the same way.
- Probes: `undo-redo`: undo, redo, undo; `out-of-order`: Merge down with Layer 2 hidden ("Show the layer to merge it").
- Rated: yes, wants Cmd+E

**Free time:** he'd merge only a selection, drop the logo twice and merge both, drag the logo's row under Layer 1 and
look at what covers what, and check what Merge down's tooltip says.

## SAUCE, bright backgrounds, export

### 19. Fill in my SAUCE
- Does: goes to the SAUCE tab, types a Title, Author, Group and a two-line comment.
- Expects: the fields take up to 35, 20 and 20 characters; the comments are saved in the file; the address shows the
  SAUCE tab.
- Probes: `extremes`: paste 40 characters with `é`, `€` and an emoji into Title; `interrupt`: go to ANSI and back and
  check the fields kept what he typed.
- Rated: yes, wants ← → with a tab focused, then Tab to Title

### 20. Bright backgrounds stay bright
- Does: in Edit Mode, sets a bright CGA background (bright blue) and types a word over it.
- Expects: it shows bright, never blinking; the export writes it the classic way (blink, with SAUCE's iCE colors flag)
  so the terminal check and other viewers show it bright.
- Probes: `again`: set bright backgrounds on two lines with different colors; `out-of-order`: set the palette to Full
  color and back to CGA and check the bright colors held.
- Rated: yes, wants Alt+B, then Enter

### 21. Export my .ans
- Measured: export-ans
- Does: presses Export .ans, types a name, and saves; keeps the download in the run folder.
- Expects: the dialog offers the document's name with the date and time; a character CP437 lacks is listed with what it
  becomes and how many cells use it ("Export as .utf8ans to keep exact characters."); the name he typed becomes the
  document's name; it saves within the `file` budget.
- Probes: `back-out`: open the dialog, press Escape, and check focus lands where his keys still work; `again`: export
  twice; `extremes`: type `€` and `漢` in a cell first and check the list.
- Rated: yes, wants a key for Export .ans

### 22. The terminal shows what I see
- Does: plays the export in the headless terminal (cp437) and compares it with the screen.
- Expects: no differences after `normalizeHidden`; the replaced characters show as their stand-ins; the bright
  backgrounds read bright.
- Probes: `extremes`: hide Layer 1 before exporting and check the export leaves it out.
- Rated: no (a check, outside the app)

### 23. Phosphor opens it the same
- Does: notes the cells on screen, starts a New project, opens the export with Edit it, and compares cells.
- Expects: `diffCells` empty, apart from the characters the export replaced; the SAUCE fields come back as he typed
  them (substituted where CP437 lacks a character).
- Probes: `interrupt`: reload before reopening and check the start screen's recent list; `undo-redo`: after
  reopening, Cmd+Z does nothing.
- Rated: yes, wants Cmd+O

**Free time:** he'd export .utf8ans and compare, open a real pack file (`ungenannt_oceanvs.ans`) and check it against
the terminal, try opening a `.xb`, and time the export of the 200-line piece.

## Drawing on top, and Flatten

### 24. Open my scene to draw on top
- Does: starts a New project (it asks if there are unsaved changes), opens `scene.ans` and picks Draw on top of it.
- Expects: the art is the base, every character pinned; Layer 1 is empty above it; All cells is on in PIXEL, so each
  cell shows there as it looks; the sliders and the palette work on it as on a picture.
- Probes: `back-out`: at the unsaved-changes question, cancel and check nothing changed; `interrupt`: look at PIXEL
  and back.
- Rated: yes, wants Cmd+O, then a key for Draw on top of it

### 25. Fix the base and draw over it
- Does: picks Base, chooses the Eraser (E) and clicks a cell (it turns black with a pinned space), types over a cell
  in Edit Mode (it overwrites; Insert doesn't push there), then picks Layer 1 and types on top.
- Expects: on the base, the Pencil and text write each cell as it shows, pinned; Delete in Insert mode does nothing
  there; on Layer 1 his typing covers the base.
- Probes: `out-of-order`: press Insert on the base and type; `undo-redo`: undo the base edit and the typing in order.
- Rated: yes, wants a key to pick the base

### 26. Merge my layer into the base
- Does: picks Layer 1, presses Merge down, chooses Keep crisp cells.
- Expects: the question offers Keep crisp cells and Blend into source image; crisp keeps his typed cells pinned on the
  base, exactly as they show.
- Probes: `back-out`: press Escape at the question; `undo-redo`: undo and redo.
- Rated: yes, wants Cmd+E, then Enter

### 27. Flatten it to plain cells
- Does: presses Flatten, picks Edit it.
- Expects: everything that shows becomes plain cells on one layer over a black base; the sliders go back to neutral,
  the art style is ANSI, Dither is off, the palette stays CGA; nothing on the canvas changes; Undo brings back the image
  and his layers ([Flattening](../../layers.md#flattening)).
- Probes: `undo-redo`: flatten, undo, redo; `again`: flatten twice; `extremes`: hide a layer first and read what the
  dialog says ("The hidden layer is removed too.").
- Rated: yes, wants a key for Flatten

### 28. Export it again and check
- Does: exports .ans, plays it in the terminal and reopens it in Phosphor.
- Expects: the terminal and the reopen match the screen, as in steps 22 and 23.
- Probes: `again`: export twice and compare the two files' bytes (they should be the same).
- Rated: yes, wants a key for Export .ans

### 29. Find the middle of my logo
- Does: with the Hand, turns on Rulers, drags zero to the logo's middle character, drags a guide to each side and
  checks they read the same number ([Rulers and guides](../../rulers.md)).
- Expects: the two guides read the same number with opposite signs, and nothing marks the drawing unsaved.
- Probes: `extremes`: a 300-column drawing zoomed out.
- Rated: yes

**Free time:** he'd try Flatten's Draw on top of it, open `past-the-edge.ans` with Draw on top and fix its second row,
try the `.xb` and `.tnd` files from the packs, and check his keyboard path for everything he did today in the shortcut
list.

## Known

