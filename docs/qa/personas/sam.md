# Sam: makes banners for terminals

## Who

Sam is a developer who makes login banners, MOTDs and splash screens for command-line tools. Sam lives in a terminal,
knows ANSI escape codes and UTF-8 widths better than ANSI art history, and usually starts from text, not a picture.
Sam knows little of Phosphor and picks it up from the screen and the shortcut list.

## Why they're here

Sam wants a banner made of text, boxes and a few symbols, sized to a terminal, that prints in a terminal exactly as
it looks in Phosphor: `cat banner.utf8ans` for a modern terminal, an .ans for old tools, and a short animated splash
as a .cast. Done is an export the terminal check shows cell for cell as the screen, at 40 by 10 and at 132 by 50.

## What they bring

- No picture: a blank canvas and text Sam types or pastes in (a tool's name, a version line, a URL).
- Wide characters and emoji in the text: `漢字`, `★`, `😀`, `❤️`, `👍🏽`, `🇺🇸`.
- The terminal check from the README's Files: `terminal.terminalCells` for .utf8ans (one row more than the art) and
  .ans, `terminal.castFinalCells` for .cast. Its known differences from the app's widths (an emoji with a variation
  selector, skin-tone and joiner sequences, flags) are noted, not refiled.
- Copying out: Chromium's clipboard is readable once the context is given clipboard access
  (`context.grantPermissions(['clipboard-read', 'clipboard-write'])`, then `navigator.clipboard.readText()` in the page).
  Where it can't be read, note it and go on.
- Habits: types fast, pastes a lot, sizes things in exact columns, reads the shortcut list once and expects it to be
  right.
- A small laptop or a desktop, a trackpad or a mouse.

## What they lean on

- The blank canvas, Dimensions and the aspect lock ([When the grid changes](../../layers.md#when-the-grid-changes)).
- Edit Mode, pasting text, wide characters ([Characters](../../characters.md)).
- Shapes with Single line and Double line, the color keys ([Other tools](../../layers.md#other-tools)).
- The Font field ([The font](../../characters.md#the-font)).
- Export .utf8ans and .ans, SAUCE, Animate, frames and Export .cast ([Animation](../../animation.md#exporting)).
- Cmd+A and Cmd+C to copy text out ([The Select tool](../../layers.md#the-select-tool)).

## What makes them give up

- An export that's a column off in a terminal, or a wide character that pushes a row out of line.
- A .cast whose last frame isn't what Phosphor showed, or whose timing is lost.
- A canvas size that won't stay where it was typed.
- Text pasted in that lands somewhere else, or silently loses characters.

## Sizes

- 40 by 10 (400 cells; Dimensions 40 by 20 pixel rows): a small splash.
- 80 by 25 (2,000 cells): a classic terminal.
- 132 by 50 (6,600 cells; Dimensions 132 by 100): the widest banner.
- Animations: 4 to 12 frames at 40 by 10 and at 132 by 50 (well under 40,000 cells a frame).
- Exports of a few KB; one or two layers; no picture.

## Traits

All apply. Sam has no account and no partner.

## Script

Each `##` heading after this one, up to Known, is a section of the script. Steps are numbered through the whole
script. Every section ends with Free time.

## A banner from text

### 1. Start from a blank canvas
- Does: on the start screen, presses "Or start with a blank canvas".
- Expects: it opens on ANSI at 80 columns by 25 lines (Dimensions 80 and 50), black, with Layer 1 picked over Base;
  nothing to undo.
- Probes: `again`: start a New project and a blank canvas again; `back-out`: press New project with unsaved changes and
  cancel the question.
- Rated: yes, wants Cmd+N, or Tab to the button then Enter

### 2. Size it to 40 by 10
- Does: sets Dimensions to 40 columns and 20 pixel rows (10 lines).
- Expects: while Lock aspect ratio (the lock between the two numbers) is on, changing one number changes the other,
  so Sam unlocks it to set both; nothing is drawn yet, so it rescales; the sizes stay as typed; the field's help says
  the second number is pixel rows, two to a line.
- Probes: `extremes`: type 0, then 99999, then `-3` and `4.5` into each number; `back-out`: type a size, press Escape,
  and check what the field shows; `undo-redo`: undo the size change, redo it.
- Rated: yes, wants Tab to Dimensions

### 3. Type the banner
- Does: presses T, clicks the top-left cell, types the tool's name, presses Enter, types a version line.
- Expects: the letters land at the cursor in the foreground and background colors; Enter goes to the start of the
  next line; a pause ends the undo step.
- Probes: `undo-redo`: undo the second line, redo it, type and check redo is off; `speed`: type a long line fast,
  past the right edge, and see where the overflow goes; `interrupt`: switch to SAUCE halfway and come back to type on.
- Rated: yes, wants T

### 4. Paste lines of text in
- Does: puts three lines of text on the clipboard, places the cursor, presses Cmd+V.
- Expects: the text types from the cursor; each new line starts on the next row at the column where the paste began;
  what runs past a row's end or the last row is dropped; tabs and invisible characters are skipped; the paste is one
  undo step.
- Probes: `extremes`: paste a line with a tab, a zero-width joiner and an accent on its own; `again`: paste twice;
  `free`: drop a .txt of the same lines on the canvas instead and pick Add to this drawing.
- Rated: yes, wants Cmd+V

### 5. Box it in
- Does: presses U, picks Rectangle with Draw with set to Double line and Connect on, and drags a box around the text;
  then a Single line across under the title.
- Expects: the box frame in the foreground color, joined where lines meet (`╟`, `╢` and the like with Connect);
  with the background set to None it leaves the cells' backgrounds alone.
- Probes: `undo-redo`: undo the line and the box; `back-out`: start a drag and press Escape before letting go.
- Rated: yes, wants U, then a key for Draw with

### 6. Color it from the keys
- Does: Alt+F, the arrows, Enter; Alt+B, the arrows, Enter; Shift+Cmd+X to swap; Set FG on a selection of the title.
- Expects: the color box moves between swatches by the arrows, picks with Enter and closes; Shift+Cmd+X swaps in Edit
  Mode too, where X types.
- Probes: `back-out`: Escape out of the color box and check the keys still reach the canvas; `out-of-order`: press
  Alt+B on SAUCE.
- Rated: yes, wants Alt+F, then Enter

### 7. Pick a font that looks like my terminal
- Does: sets Font to IBM VGA, then Unscii, then Unifont, sets the size to 16, then 32; turns Smooth off in the status
  bar.
- Expects: the font changes how the cells look, not what they hold, in both views; the pixel fonts look sharpest at
  16 or 32; Smooth off makes them pixel-sharp; the font is kept in this browser, not in the project or the exports.
- Probes: `extremes`: set the size to 1 and to 200; `interrupt`: reload and check the font stayed.
- Rated: yes, wants Tab to Font then the arrows

**Free time:** Sam would press `?` and check the list, try Load font with a file that isn't monospaced
(`fonts/proportional.ttf`, refused with why), type a `﷽` and look at what it covers, and try Insert in the middle of the
title.

## Widths

### 8. Type wide characters
- Does: types `漢字` and `😀` in the middle of a line, then Backspace over one, Delete on another, and the arrows
  across them.
- Expects: each takes two columns and the cursor moves two; Backspace and Delete remove the whole character; the
  cursor never stops on a covered half; in Insert mode the rest of the row is pushed right by two
  ([Two-column characters](../../characters.md#two-column-characters)).
- Probes: `undo-redo`: undo and redo the wide characters; `out-of-order`: type a letter over the second half of `漢`
  (the other half turns into a space).
- Rated: no (typing the art)

### 9. Wide characters at the line's end
- Does: moves the cursor to the last column and types `漢`, then `😀`; then to the column before last and types `😀`.
- Expects: in the last column a two-column character does nothing and says "A two-column character won't fit in the
  last column."; one column earlier it fits, and covers the last column.
- Probes: `extremes`: type `❤️`, `👍🏽` and `🇺🇸` at the line's end and in the middle; `again`: try the last column twice.
- Rated: no (typing the art)

### 10. Copy a wide block and paste it at the edge
- Does: selects a block whose right edge cuts a wide character, copies it, and pastes it so it lands at the right edge.
- Expects: the wide character comes whole and still covers one cell past the paste; what runs past the canvas is cut.
- Probes: `back-out`: paste and press Escape; `undo-redo`: undo the paste.
- Rated: yes, wants M, Shift+arrows, Cmd+C, Cmd+V

**Free time:** Sam would type Japanese with the system's input method, paste a line of emoji from a chat, look at the
status bar's Col and Row as the cursor crosses wide characters, and try the Eraser on half of one.

## Exports that are exact

### 11. Name it in SAUCE
- Does: on the SAUCE tab, types a Title, Author and Group.
- Expects: the fields take 35, 20 and 20 characters; the exports carry them.
- Probes: `extremes`: type emoji into Author; `interrupt`: Back to ANSI with the browser's Back, then Forward.
- Rated: yes, wants ← → with a tab focused

### 12. Export .utf8ans
- Does: presses Export .utf8ans and saves under the offered name.
- Expects: the name is the document's with the date and time; it saves within the `file` budget; nothing is listed to
  replace (every character is kept).
- Probes: `again`: export twice and check the names differ; `back-out`: Escape from the dialog, then Cmd+S (the project
  dialog, not this one).
- Rated: yes, wants a key for Export .utf8ans

### 13. It prints the same in a terminal
- Does: plays the .utf8ans in the headless terminal, one row taller than the art, and compares the art's rows with the
  screen.
- Expects: no differences after `normalizeHidden`, except the README's known emoji differences, which are noted.
- Probes: `extremes`: add a wide character in the column before last and export again.
- Rated: no (a check, outside the app)

### 14. Export .ans for old tools
- Does: presses Export .ans.
- Expects: the dialog lists each character CP437 lacks (`漢`, `字`, `😀` and the rest), what it becomes and how many
  cells use it, with "Export as .utf8ans to keep exact characters."; a two-column character becomes its stand-in plus a
  space, so the grid still lines up.
- Probes: `back-out`: read the list, press Cancel, and check nothing downloaded; `again`: export after removing every
  wide character (nothing listed).
- Rated: yes, wants a key for Export .ans

### 15. The .ans lines up in a terminal
- Does: plays the .ans in the terminal (cp437) and compares with the screen.
- Expects: every cell matches except the replaced characters, each now its stand-in and a space; no row shifts.
- Probes: `extremes`: check the last column and the cell after each replaced character.
- Rated: no (a check, outside the app)

### 16. Copy it out for a terminal
- Does: with the Select tool, presses Cmd+A, then Cmd+C; reads the clipboard as plain text.
- Expects: plain text, a line per row, every character kept (a wide one once); a paste into another Phosphor tab brings
  the colors too.
- Probes: `out-of-order`: Cmd+C with nothing selected; `interrupt`: paste into a second tab's blank canvas and compare.
- Rated: yes, wants Cmd+A, Cmd+C

**Free time:** Sam would export with a layer hidden, copy just the title and paste it as text into SAUCE's comments,
open the .utf8ans back in Phosphor (Edit it) and compare cells, and look for a way to export without SAUCE.

## A short animated splash

### 17. Turn on Animate
- Does: turns on the Animate switch on the tab bar.
- Expects: the bar shows under the canvas: play, the steps, the frame, the scrubber, Add frame, Frame actions, frames
  per second, Hold, Ghost; the shortcut list gains Animation (L, comma and period, N).
- Probes: `again`: off and on again (the frames stay); `out-of-order`: try L and N with Animate off (nothing).
- Rated: yes, wants a key for Animate

### 18. Add frames and change each one
- Does: presses N three times, steps with comma and period, and types a different last character on each frame (a
  spinner: `|`, `/`, `-`, `\`), with Frame actions' New cells set to Stay on their frame.
- Expects: N adds a frame after the one showing, of its kind; on a Blank frame what's inherited shows dimmed as the
  ghost; a cell drawn to stay shows on its frame only; Alt+comma and Alt+period step while typing.
- Probes: `undo-redo`: undo across frames (it goes back to the frame the edit was made on); `speed`: hold N for a
  second and count the frames added, then delete the extras from Frame actions.
- Rated: yes, wants N, then Alt+. while typing

### 19. Set its timing
- Does: sets frames per second to 4 and a Hold of 1 second on the first frame; presses L to play, then any key.
- Expects: playback loops at 4 a second with the first frame held a second; any other key pauses on the frame showing.
- Probes: `extremes`: frames per second 0 and 999, Hold 61; `interrupt`: change a setting while it plays.
- Rated: yes, wants Tab to Frames per second (typing the number is content), and L to play

### 20. Export the .cast
- Does: presses Export .cast and saves.
- Expects: Export .cast (with Export animated .ans, animated .utf8ans and .gif) shows only with more than one frame
  and Animate on; the file keeps the frames' timing.
- Probes: `again`: export twice; `back-out`: Escape from the dialog.
- Rated: yes, wants a key for Export .cast

### 21. The .cast ends on my last frame
- Does: reads the .cast, runs `terminal.castFinalCells` on it, and compares with the last frame's cells on screen; looks
  at the events' times against the frames per second and the hold.
- Expects: the final screen matches the last frame, cell for cell (known emoji differences noted); the first frame's
  output comes a second before the next, then a quarter second apart.
- Probes: `extremes`: put a wide character on the last frame only and export again.
- Rated: no (a check, outside the app)

**Free time:** Sam would export animated .utf8ans and play it in the terminal, export a .gif and look at it, turn
Animate off and check the .cast export goes away, and save the project and reopen it to check the frames and holds.

## Up to 132 by 50

### 22. Grow it to 132 by 50
- Does: sets Dimensions to 132 and 100.
- Expects: with text on the edit layer, it's a canvas resize: columns and lines are added at the right and bottom, the
  banner stays where it is, every frame grows; it lands within the `setting` budget.
- Probes: `undo-redo`: undo the resize and redo it; `interrupt`: shrink to 40 by 10 and grow back, and check the cut-off
  text came back.
- Rated: yes, wants Tab to Dimensions

### 23. Fill the wide banner
- Does: stamps the title block a few times across with S, draws a Double line box around the whole canvas, and fills
  the space behind with the Paint Bucket's Cells fill and a `░`.
- Expects: each stamp is one undo step; the box joins with Connect; Cells fills whole cells matching the one clicked,
  setting the character and colors chosen.
- Probes: `speed`: press S twenty times quickly with the arrows between; `undo-redo`: mash Cmd+Z thirty times and then
  redo all of it, and check the canvas is as before.
- Rated: yes, wants S

### 24. Export everything again at 132 by 50
- Does: exports .utf8ans, .ans and .cast and checks each in the terminal.
- Expects: each matches the screen as before (a .cast's final screen the last frame); each saves within the `file`
  budget.
- Probes: `again`: export the .cast on a different frame showing and check it doesn't change the file.
- Rated: yes, wants a key for each export

### 25. Save and reopen the project
- Does: Cmd+S, saves; New project; opens the .phosphor.
- Expects: the frames, holds, frames per second, cells that stay, the SAUCE fields and the size all come back; the
  font is this browser's.
- Probes: `interrupt`: reload instead and check autosave brought it back; `undo-redo`: Cmd+Z after reopening does
  nothing.
- Rated: yes, wants Cmd+S, then Enter

**Free time:** Sam would try 300 columns to see the widest it goes, check the animated .ans dialog's warning at 132 by
50, paste a 200-line log into the canvas and see what's dropped, and look for Copy as ANSI escape codes.

## Known

