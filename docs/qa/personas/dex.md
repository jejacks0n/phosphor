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
- Habits: Moebius's keys (F1 to F10 for characters, Alt+F, Alt+B, Ctrl+arrows for colors, Alt+arrows for lines and columns, C or S to stamp, Escape to
  set a block down); tries a shortcut before looking for a button; holds arrow keys down; mashes Cmd+Z.
- A desktop with a full keyboard; a mouse only when he must.

## What they lean on

- Edit Mode and its keys, the character palettes (F1 to F12, Ctrl+Shift+F-key, Ctrl+, and Ctrl+.), lines and columns (Alt+arrows), the command list (Cmd+K), the color keys
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
  scene.ans?" picks Edit artwork.
- Expects: it opens on ANSI at 80 columns by 6 lines, every cell an edit cell on Layer 1 over a black base; the line
  that runs past column 80 wraps onto the next line; Z sits ten columns past "ab", R right after Z where the cursor
  was saved; the `!` has a bright red background, not blinking; the palette is CGA; SAUCE shows "QA Scene", "Phosphor
  QA" and "QA", and iCE colors checked (the scene's record says so); Undo is off (opening isn't an edit). It opens within the `file` budget.
- Probes: `back-out`: choose the file and press Cancel at the question, and check the start screen is as it was;
  `free`: drop the file on the start screen's box instead of the button.
- Rated: yes, wants Cmd+O, then Enter for Edit artwork

### 2. Check it's my file, cell for cell
- Does: plays `scene.ans` in the headless terminal (`terminal.terminalCells`, cp437) and compares it with the cells on
  screen (`terminal.diffCells`, the app's side through `terminal.normalizeHidden`).
- Expects: no differences.
- Probes: `extremes`: open `ansi/past-the-edge.ans` the same way and look at its second row's indent on screen (a
  modern terminal doesn't wrap on a move right past the last column and the app does, so judge that file by its
  screenshot and note the terminal's difference).
- Rated: no (a check, outside the app)

### 3. Make room: 80 by 200
- Does: turns Lock aspect ratio off, then sets Dimensions' second number to 400 (200 lines).
- Expects: with art on the edit layer, it's a canvas resize: lines are added at the bottom, his art stays where it is,
  and the width stays 80 (with the lock on, it would follow); the grid changes once, when he presses Enter or Tab, not
  as each digit lands; it lands within the `setting` budget.
- Probes: `back-out`: select the second number, type a few digits, press Escape, and check the grid never moved and the
  field shows its size again; `extremes`: type 99999, then 0, and see where it stops (80 columns reach 5,000 lines; 0
  stays put, and a message gives the smallest size); `undo-redo`: undo after the resize and check it puts the old size
  back with his art as it was, and a second undo takes back his last edit (a resize is an undo step, and mustn't forget
  the steps before it), then redo both; `interrupt`: shrink to 3 lines, then back to 200, and check the cut-off lines came back.
- Rated: yes, wants Tab to Dimensions

**Free time:** he'd press `?` and read the shortcut list, open the SAUCE tab to check the fields, try the PIXEL tab to
see what his art looks like there, and zoom to 200% and back by the status bar.

## Drawing character by character

### 4. Type a line of text
- Does: presses T, moves the cursor with the arrows, types a line, brushes a stroke across the row after it, presses
  Insert and types into the middle of the line, presses Alt+Enter (the same as Insert: Partial) and types there again, then Home, End,
  Backspace and Delete, then Enter.
- Expects: letters land in his colors, and a space takes his BG alone (the status bar's FG over it is what the cell had
  before); Insert pushes the rest of the row right, the stroke with the letters; Partial
  pushes the letters and leaves the stroke where it is; Overwrite replaces (the status bar says which of the three,
  its buttons whole at any width: short of room, the FG and BG hex codes give way, each on its swatch's hover);
  Enter goes to the start of the next line; a run of typing is one undo step, ending when he pauses or moves the
  cursor.
- Probes: `interrupt`: mid-line, pick another Font with the mouse and keep typing (the letters land on the canvas, not
  in the menu), then click the font's size, type a digit and press Escape (the size is put back and typing carries on
  at the cursor); `extremes`: in Insert mode, type five characters at the start of a full row so its end goes off the
  canvas, wait two seconds, then Backspace five times (the row's end comes back as it was, gaps included);
  `speed`: hold Backspace for two seconds; `undo-redo`: undo the typing, redo it, then type and check redo is
  off; `out-of-order`: press Delete at the end of a row and Backspace at column 0.
- Rated: yes, wants T

### 5. Draw with CP437 from the character palettes
- Does: in Edit Mode, types F1 to F12, switches palettes with Ctrl+. and Ctrl+,, puts the character under the cursor on a
  slot with Ctrl+Shift+F5, and opens Character palettes to pick `╬` from CP437 onto a slot.
- Expects: each F-key types its slot's character; the strip under the tools shows each slot; Character palettes opens
  with CP437, Unicode, In this drawing and Recent; a character CP437 lacks is marked ("isn't in CP437"), and with no legend under the sources, hovering one reads UTF-8 only, the slot it's already on, or "does not fit in one cell" for one that can't go in a cell; a built-in
  palette edited makes his own copy and says so.
- Probes: `back-out`: open Character palettes and press Escape; check focus comes back so his keys work;
  `extremes`: put an emoji on a slot and type it in the last column ("Two-column characters cannot fit in the last column."); `again`: Ctrl+. through every palette and round;
  on a Mac, the shortcut list says he may need to hold Fn, and where in System Settings to change that.
- Rated: yes, wants F1–F12 and Ctrl+.

### 6. Draw half blocks
- Does: presses P, then Shift+D, which steps Draw with back from Colors only round to Half-block, and draws a small
  shape in two colors.
- Expects: Draw with shows each step as he presses, D forward and Shift+D back, wrapping; each cell he paints becomes `▄`, and the half he doesn't paint keeps its color; a straight line with Shift
  from his last stroke.
- Probes: `undo-redo`: undo the shape stroke by stroke; `again`: draw over the same cells twice in another color, and
  across a box of double lines he typed, with the Pencil and with the Shape tool's Half-block, Write block glyphs on
  and off, the box's edge on the line's top half and on its bottom half: each crossed cell is a `▄` with the line gone,
  not a whole cell; with the checkbox off the rest of the box is the canvas's own characters.
- Rated: yes, wants P, then Shift+D

### 7. Set my colors from the keys
- Does: presses Alt+F, arrows to a color, Enter; Alt+B, arrows, Space, Escape; X to swap; Ctrl+↑ and Ctrl+↓
  (Ctrl+Option on a Mac) to step the foreground and Ctrl+← and Ctrl+→ the background, with the Pencil and then in Edit
  Mode.
- Expects: the color box opens on the current color, the arrows move between swatches, Enter picks and closes, Space
  picks and stays, Escape closes; with CGA every swatch paints its CGA color; X swaps (in Edit Mode it types, so he uses
  Shift+Cmd+X there).
- Probes: `back-out`: open the box and press Escape, then check where focus is and that tool keys work; `speed`: hold
  Ctrl+↓ for two seconds; `extremes`: with Saturation at 0, open the box again: the colors that aren't gray show under
  a "no" sign, say why when hovered, can't be picked, and the arrows and Ctrl+↓ go past them to the grays; the
  Recent row under the grid does the same.
- Rated: yes, wants Alt+F, then Enter

### 8. Pick a color off the art
- Does: presses I and clicks a cell; turns the FG and BG toggles on and off; then, with the Pencil, holds Alt and clicks
  a cell, and Alt+Shift for the background. Then, with the mouse over a cell and the Pencil, Alt+U, and Shift+Alt+U over
  another; in Edit Mode, Alt+U on the cursor's cell (on a Mac Option+U starts ü there for now, so Cmd+K), and Alt+X.
- Expects: with both lit it sets both colors from the cell; the status bar shows the pick and where each color came
  from; letting Alt go brings the Pencil back. Alt+U sets both colors from the cell under the mouse, Shift+Alt+U its
  character too (the one Fill and Shapes draw with), and nothing with the mouse off the art; Alt+X swaps the cursor
  cell's colors as Swap cell FG/BG does, types nothing, and is one undo step.
- Probes: `out-of-order`: pick from an empty cell of the grown canvas; `interrupt`: let Alt go in the middle of a drag.
- Rated: yes, wants Alt+U

### 9. Recolor a block
- Does: presses M, selects a block of text with Shift and the arrows from a corner, presses Set FG, then Set BG.
- Expects: every selected cell takes his foreground (then background), keeping its character and its other color, in
  one undo step each; with a color set to None the button says to choose one first.
- Probes: `undo-redo`: undo Set BG, then Set FG; `out-of-order`: Set FG with the foreground set to None.
- Rated: yes, wants M, Shift+arrows, then a key for Set FG

**Free time:** he'd press D through every Draw with mode and round, try the Pencil's Single line and Double line
with Connect, type a box with the F-keys' line characters, and check the shortcut list names every key he used.

## Blocks: select, copy, move

### 10. Copy a block and paste it
- Does: with Select, drags over a block, presses Cmd+C, moves the selection with the arrows, presses Cmd+V, nudges the
  pasted block with the arrows and sets it down with Enter.
- Expects: the paste lands floating and selected at the selection; arrows nudge it a cell; Enter sets it down; the
  paste is one undo step and the move another; with both side panels open, nothing in the Select row is past the view's
  edge: what doesn't fit (Deselect, All layers) is in the ⋯ just after the row's last button, and works from there (All layers shows a check
  when it's on).
- Probes: `undo-redo`: after Enter, undo the move (the block goes back where it was pasted, floating; no press only
  picks it up again), undo again (it's gone);
  `again`: paste twice in a row; `speed`: hold an arrow for two seconds moving the block.
- Rated: yes, wants Cmd+C, Cmd+V

### 11. Move a block through empty cells
- Does: presses Add layer, types a word on Layer 2 with spaces around it, selects a block larger than the word (All
  layers is off, so a move takes only Layer 2's part), moves it with the arrows onto where his art is, and sets it down
  with Enter.
- Expects: the block's cells with nothing on Layer 2 are see-through: Layer 1's art shows through them and stays where
  it is; what the block passed over is as it was.
- Probes: `out-of-order`: turn All layers on and move a block, and check each layer's part moves on its own layer;
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
- Expects: each stamp leaves a copy and floats the block on, one undo step each, with only the picked layer's own
  drawing in it (All layers is off); E deletes the selection on that layer (Delete and Backspace too).
- Probes: `speed`: press S ten times quickly; `undo-redo`: undo the stamps one by one.
- Rated: yes, wants S

### 14. Select every cell of a color
- Does: presses W, sets Match to FG only, clicks a cell, Shift-clicks another color, then presses Delete; Escape.
- Expects: the wand selects what matches (Contiguous on: only what touches), tinted while the wand is the tool;
  Shift-click adds; Delete takes away what's in it on the picked layer (All layers, at the end of the wand's row once
  it has selected, is off; on, on every layer that shows), one undo step; Escape drops it. Right after a tap on All
  layers or Contiguous, Delete and Escape work the same: the checkbox keeps only Space and Enter. A second click on the
  same cell selects the same cells and adds no undo step.
- Probes: `out-of-order`: press Delete with nothing selected; `again`: click the same cell twice; `undo-redo`: undo the
  delete and the selections.
- Rated: yes, wants W, then a key for Match

**Free time:** he'd paste text copied from a text editor at the cursor, flip a block with box lines in it, try Rotate
on a block with characters (it's off, and says why), and look for Moebius's block keys he hasn't tried.

## Putting the logo on

### 15. Add a layer for the logo
- Does: picks his top layer (Layer 2, from step 11), presses Add layer.
- Expects: Layer 3 on top, picked.
- Probes: `again`: add one more and delete it from its ⋯ menu; `interrupt`: rename it with F2 on its row, Escape.
- Rated: yes, wants Shift+Cmd+N (the browser keeps it); Shift+Alt+N (Shift+Option+N) is Phosphor's

### 16. Drop the logo on my piece
- Does: drops `logo.ans` on the canvas at a cell, and picks Add to this drawing.
- Expects: the question offers Add to this drawing, Open to edit, Open to draw on top, Open as an image and Cancel;
  Add lands the logo floating and selected at the cell he dropped it on, on Layer 3, as one undo step; the drawing's
  SAUCE and palette stay his.
- Probes: `back-out`: drop it and press Cancel; `extremes`: drop it near the right edge and check what runs past is cut
  off; `out-of-order`: drop an `.xb` from the packs and expect the same Add question; on Add its cells land, and his drawing's font and palette stay his.
- Rated: yes, wants Cmd+O, then Enter on Add to this drawing (Open asks, over a drawing)

### 17. Move it into place by keys
- Does: moves the floating logo with the arrow keys, sets it down with Enter.
- Expects: a cell per press; held past the grid's edge it goes on until one cell of it is left on, and brought back
  before Enter it comes back whole; Enter sets it down.
- Probes: `speed`: hold → for two seconds, then ← until it's back; `undo-redo`: undo the move (back where it landed, floating), redo.
- Rated: yes, wants the arrows

### 18. Merge the logo down
- Does: with Layer 3 picked, presses Merge down.
- Expects: no question (it's a cells layer into a cells layer): the logo's cells, its black spaces too, are written
  onto Layer 2 as they show, Layer 3 leaves the stack and nothing on the canvas changes; one undo brings Layer 3 back,
  picked. Merge down again puts Layer 2 into Layer 1 the same way.
- Probes: `undo-redo`: undo, redo, undo; `out-of-order`: Merge down with Layer 2 hidden ("Make the layer visible to merge it").
- Rated: yes, wants Cmd+E

**Free time:** he'd merge only a selection, drop the logo twice and merge both, drag the logo's row under Layer 1 and
look at what covers what, and check what Merge down's tooltip says.

## SAUCE, bright backgrounds, export

### 19. Fill in my SAUCE
- Does: goes to the SAUCE tab, types a Title, Author, Group and a two-line comment.
- Expects: the fields take up to 35, 20 and 20 characters, each with its count beside it; a paste past a field's
  width keeps what fits and a line under the field names the rest (an emoji takes one place); "2 of 255 SAUCE lines"
  shows under his comment; the comments are saved in the file; the address shows the
  SAUCE tab.
- Probes: `extremes`: paste 40 characters with `é`, `€` and an emoji into Title; `interrupt`: go to ANSI and back and
  check the fields kept what he typed.
- Rated: yes, wants ← → with a tab focused, then Tab to Title

### 20. Bright backgrounds stay bright
- Does: in Edit Mode, sets a bright CGA background (bright blue) and types a word over it.
- Expects: it shows bright, never blinking, since his scene keeps iCE colors on (the SAUCE tab's checkbox, checked);
  the BG swatches have no blink spark; the export writes it the classic way (blink, with SAUCE's iCE colors flag and
  `ESC[?33h` at the top) so the terminal check and other viewers show it bright.
- Probes: `again`: set bright backgrounds on two lines with different colors; `out-of-order`: set the palette to Full
  color and back to CGA and check the bright colors held.
- Rated: yes, wants Alt+B, then Enter

### 21. Export my .ans
- Measured: export-ans
- Does: presses Export .ans, types a name, and saves; keeps the download in the run folder.
- Expects: the dialog offers the document's name with the date and time; Include SAUCE is checked, and he leaves it
  so; a character CP437 lacks is listed with what it becomes and how many cells use it ("Export as .utf8ans to keep all
  original characters."); the name he typed becomes the document's name; it saves within the `file` budget.
- Probes: `back-out`: open the dialog, press Escape, and check focus lands where his keys still work; `again`: export
  twice; `extremes`: type `€` and `漢` in a cell first and check the list; `out-of-order`: pick BinaryText instead and
  export a `.bin` (Include SAUCE stays checked and can't be unchecked, a line saying why).
- Rated: yes, wants Cmd+K, then `exp ans` and Enter

### 22. The terminal shows what I see
- Does: plays the export in the headless terminal (cp437) and compares it with the screen.
- Expects: no differences after `normalizeHidden`; the replaced characters show as their stand-ins; the bright
  backgrounds read bright.
- Probes: `extremes`: hide Layer 1 before exporting and check the export leaves it out.
- Rated: no (a check, outside the app)

### 23. Phosphor opens it the same
- Does: notes the cells on screen, starts a New project, opens the export with Edit artwork, and compares cells.
- Expects: `diffCells` empty, apart from the characters the export replaced; the SAUCE fields come back as he typed
  them (substituted where CP437 lacks a character), and the export's date, font name (IBM VGA) and 8px letter spacing
  show on the SAUCE tab.
- Probes: `interrupt`: reload before reopening and check the start screen's recent list; `undo-redo`: after
  reopening, Cmd+Z does nothing.
- Rated: yes, wants Cmd+O

**Free time:** he'd export .utf8ans and compare, open a real pack file (`ungenannt_oceanvs.ans`) and check it against
the terminal, try opening a `.xb`, and time the export of the 200-line piece.

## Drawing on top, and Flatten

### 24. Open my scene to draw on top
- Does: starts a New project (it asks if there are unsaved changes), opens `scene.ans` and picks Draw on top.
- Expects: the art is the base, every character pinned; Layer 1 is empty above it; in PIXEL each character shows as it
  looks (a `█` solid, a `▒` a mix of its two colors) with All cells off, as it's left, and the same with it turned on
  or the Overlay at 0%; the sliders and the palette work on it as on a picture. At each question ↓ and ↑ move between
  the choices and Cancel, stopping at the ends, and Enter presses the one with focus.
- Probes: `back-out`: at the unsaved-changes question, cancel and check nothing changed; `interrupt`: look at PIXEL
  and back.
- Rated: yes, wants Cmd+O, then ↓ and Enter for Draw on top

### 25. Fix the base and draw over it
- Does: picks Base, chooses the Eraser (E) and clicks a cell at its starting size (Size · cells, 1: that one cell turns
  black with a pinned space, its neighbors stay), types over a cell in Edit Mode (it overwrites), then picks Layer 1 and
  types on top.
- Expects: on the base, the Pencil and text write each cell as it shows, pinned; on Layer 1 his typing covers the base.
  In PIXEL with the Overlay at 0%, a `█` he drew on the base is a whole solid cell, not half of one, and a line of
  `░ ▒ ▓` is shades, not dashes; a soft Brush stroke on Layer 1 across them tints them as the ANSI view shows, and
  looks the same with All cells on.
- Probes: `out-of-order`: press Insert on the base and type into the middle of a line with a Brush stroke after it (the
  whole row moves right, stroke and all), press Insert again for Partial and type (the letters move, the stroke
  stays), then Delete in each (the row comes back the same way; in Insert the cell at the row's end is black);
  `undo-redo`: undo the base edit and the typing in order; `scope`: on the base in Monochrome ASCII, a white Brush
  stroke across his characters and across the black shows wherever it goes as ASCII characters (the characters under
  it give way, a `▄` among them converting as it did), and in PIXEL a soft stroke's edge over the black is soft, with
  no dashes or bands, and a second soft stroke over the white the first one left stays white, with no dark rim; Undo brings the characters back, and in ANSI the same stroke tints the characters and keeps them. `again`: in PIXEL, the Eraser over both halves of a `█` on
  the base leaves a pinned black space, which the ANSI view shows as a space.
- Rated: yes, wants Cmd+K, then `pick base` and Enter

### 26. Merge my layer into the base
- Does: picks Layer 1, presses Merge down, chooses Keep crisp cells.
- Expects: the question offers Keep crisp cells and Blend into source image; crisp keeps his typed cells pinned on the
  base, exactly as they show.
- Probes: `back-out`: press Escape at the question; `undo-redo`: undo and redo; `again`: first, on Layer 1, type a
  word over a white Brush patch and Blur across it (the letters keep their characters, their colors even out, the
  patch's edge fades), then Colors only across the word (the letters are tinted, the spaces beside them become ▄),
  then Keep crisp cells: the word is pinned as it shows, nothing else changes (docs/model.md R2 to R4); then undo and
  choose Blend into source image instead: the question lists nothing about his characters, the word stays pinned as it
  showed (every letter still a letter), the patch goes into the picture, and Blur on Base recolors the word and fades
  the patch (docs/model.md R3); undo brings back his layer and the base's pins as they were; `scope`: with only a Brush
  stroke on Layer 1 across the scene's letters (nothing typed), Blend into source image keeps the scene's letters as
  they are; then a Half-column detail ellipse on Layer 1, and the question lists that its shape blocks are picked
  again; so does a Pencil Half-block stroke, and after the merge Blur on Base softens its blocks like the paint, none
  left pinned.
- Rated: yes, wants Cmd+E, then Enter

### 27. Flatten it to plain cells
- Does: presses Flatten, picks Edit artwork. Then adds a layer over the flattened art and brushes a stroke across the
  black, then gives it Characters of its own (Random, ░▒▓█) and brushes a stroke across the art and across the black.
- Expects: everything that shows becomes plain cells on one layer over a black base; the sliders go back to neutral,
  the art style is ANSI, Dither is off, the palette stays CGA; nothing on the canvas changes; Undo brings back the image
  and his layers ([Flattening](../../layers.md#flattening)). The new layer's first stroke shows the base's characters over
  the black and its second its ░▒▓█, not half-blocks ([Paint and Characters](../../layers.md#paint-and-characters)).
- Probes: `undo-redo`: flatten, undo, redo; `again`: flatten twice; `extremes`: hide a layer first and read what the
  dialog says ("The hidden layer will also be removed.").
- Rated: yes, wants Cmd+K, then `flatten` and Enter

### 28. Export it again and check
- Does: exports .ans, plays it in the terminal and reopens it in Phosphor.
- Expects: the terminal and the reopen match the screen, as in steps 22 and 23.
- Probes: `again`: export twice and compare the two files' bytes (they should be the same).
- Rated: yes, wants Cmd+K, then `exp ans` and Enter

### 29. Find the middle of my logo
- Does: with the Hand, turns on Rulers, drags zero to the logo's middle character, drags a guide to each side and
  checks they read the same number ([Rulers and guides](../../rulers.md)).
- Expects: the two guides read the same number with opposite signs, and nothing marks the drawing unsaved.
- Probes: `extremes`: a 300-column drawing zoomed out.
- Rated: yes

### 30. Make room in the middle of my art
- Does: in Edit Mode, puts the cursor in the middle of a drawn block and presses Alt+↑ twice, Alt+→ once, then Alt+↓
  and Alt+← (Option on a Mac), on a layer and then with the base picked; then picks the Pencil and presses Alt+←.
- Expects: Alt+↑ puts a line in at the cursor and the lines below move down, the last one off the bottom; Alt+↓ takes
  the cursor's line out and the ones below move up; Alt+→ and Alt+← do the same for a column; only the picked layer
  moves, its paint with it, the canvas keeps its size, and the cursor stays put; each press is one undo step
  ([Typing Text Directly](../../characters.md#typing-text-directly)). With the Pencil, Alt+← does nothing and the page
  stays.
- Probes: `undo-redo`: undo the four, redo them; `speed`: hold Alt+↑ for a second (a line a repeat); `extremes`: a
  column through a two-column character (it moves, or goes, whole).
- Rated: yes, wants Alt+↑ (Moebius's)

### 31. Export without the mouse
- Does: while typing in Edit Mode, presses Cmd+K (Ctrl+K), types `exp ans` and Enter, exports; then Cmd+K again, types
  `ins line` and Enter; then Cmd+K, Escape, and types on ([The Command List](../../layers.md#the-command-list)).
- Expects: the box opens over the art with focus in its field; Export opens on .ans once the box has gone; Insert a line
  at the cursor puts a line in where the cursor is, as Alt+↑ does; Escape closes the box and typing goes on at the
  cursor. Each row shows its key.
- Probes: `out-of-order`: Cmd+K with no drawing open (Export… is grayed, saying why, and Enter does nothing; `file`
  finds Open a file above the grayed Save As, and Enter opens a file);
  `undo-redo`: undo the line.
- Rated: yes, wants every command by name

**Free time:** he'd try Flatten's Draw on top, open `past-the-edge.ans` with Draw on top and fix its second row,
try the `.xb`, `.bin` and `.tnd` files from the packs, and check his keyboard path for everything he did today in the shortcut
list.

## Known

