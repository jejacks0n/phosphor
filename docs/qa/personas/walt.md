# Walt: restores old ANSI files

## Who

Walt keeps an archive of scene packs and restores damaged or unfinished art: a wrong cell here, a missing SAUCE field
there, a file cut off mid-line. He knows the formats inside out (CP437, SAUCE, iCE colors, XBin, the long scrolling
member lists) and he's careful: he compares files byte for byte. He's used Phosphor a few times and trusts it only as
far as it's shown him it keeps files exact.

## Why they're here

He opens old and very long files, fixes a few cells, fills in SAUCE, and saves them back. Done is a file that differs
from what he opened only where he changed it, opened again by Phosphor and played in a terminal with no surprises, and
never a lost hour of work, whatever the browser does.

## What they bring

- The generated `long` file (the README's Files): 300 columns by 1,600 lines, 480,000 cells, about 10.6 MB, every
  color of the 256, SAUCE titled "QA Long". The same maker (`files.makeLongAns({ cols, lines })`) makes the over-limit
  files he tries: 300 by 1,700 (510,000 cells) and 301 by 100.
- The real packs in `input/qa/packs/` when they're there (`input/qa/README.txt` lists them): the biggest .ans
  (`blocktronics_blocktober/ungenannt_oceanvs.ans`, 137 KB), the longest (`acid-50a/RA-FIFTY.ANS`, about 1,675
  lines), the member list (`blocktronics_blocktober/__BLOCKTRONICS_BLOCKTOBER_MEMBERLIST_AND_STATS.ans`, about 240
  lines), .asc files from `acid-50a`, .txt from
  `impure88`, and the formats he'd try even though Phosphor may not open them: `.xb` (`acid-55a/ACID-55.XB`), `.sue`
  (`acid-55a/WE-WILL.SUE`), `.tnd` (`blocktronics_blocktober/_Pumpkin_by_TCF.tnd`), `.nfo` and `.diz`. When the folder
  is missing, those steps are skipped with a note.
- To drop a file: a headless browser can't drag from the desktop, so send the drop to the start screen's box or the
  canvas with the file in it, as `tests/e2e/art-files.spec.js` does (a DataTransfer holding the file).
- Habits: saves often, reloads to check things stuck, keeps two tabs open, uses Back and Forward, leaves the app
  open for hours.
- A desktop with a big screen, a mouse with a wheel.

## What they lean on

- Opening ANSI files with Edit artwork and Draw on top, the limits
  ([Opening ANSI and text files](../../layers.md#opening-ansi-and-text-files)).
- Edit Mode for one-cell fixes, the Eyedropper, scrolling and zoom.
- SAUCE, Export .ans, Save project ([Saving](../../characters.md#saving-utf8ans-and-ans)).
- Autosave, Versions, the start screen's "Pick up where you left off", the address with Back and Forward
  ([Saving](../../characters.md#saving-utf8ans-and-ans), [the address](../../README.md)).

## What makes them give up

- A round trip that changes a cell he didn't touch, or a SAUCE field cut short without warning.
- Work lost to a reload or a crash after he gave it time to save.
- A file that opens wrong, or doesn't open and says nothing.
- Waiting several seconds for every fix on a long file.

## Sizes

- 300 columns by 1,600 lines: 480,000 cells (the limits are 300 columns, 5,000 lines and 500,000 cells; at 300 columns
  1,666 lines). The .ans is about 10.6 MB; a .phosphor of it a few MB.
- Real files: 80 columns, up to about 1,675 lines (`RA-FIFTY.ANS`), up to 137 KB.
- SAUCE at its widths: Title 35, Author 20, Group 20 characters, comments up to 255 lines of 64.
- One or two layers. A session of an hour or more, with `qa.memory` at its start and end.

## Traits

All apply. He has no account and no partner. On a phone or tablet the long file is mostly scrolled by touch.

## Goals
- A file I fix and save differs from the one I opened only where I changed it: in the .ans export, when Phosphor reopens it or the project, and in a terminal.
- No SAUCE field is cut short without a warning, and SAUCE comes back the same after a round trip.
- A fix I gave time to save survives a reload.
- A fix on the long file shows as soon as I type it.
  Counted: ms on fix-cell, target 100, lower is better.

## Script

Each `##` heading after this one, up to Known, is a section of the script. Steps are numbered through the whole
script. Every section ends with Free time.

## The long file

### 1. Open the long file
- Does: takes `qa.memory`; writes the files; on the start screen chooses `long.ans` and picks Edit artwork, timing it from
  the choice to the art showing.
- Expects: 300 columns by 1,600 lines on Layer 1 over a black base, VGA (its colors are 256-color codes), SAUCE
  titled "QA Long"; nothing to undo; the view starts at the top-left, on line 1. Opening takes under the `file` budget;
  over it is a `performance` finding. While the file is read, and again while it opens, a note at the bottom says
  "Opening long.ans…" with a line moving under it, then goes.
- Probes: `back-out`: choose it and press Cancel at the question; `free`: drop it on the start screen's box instead.
- Rated: yes, wants Cmd+O, then Enter for Edit artwork

### 2. Scroll to the bottom and back
- Does: scrolls the ANSI view down to line 1,600 with the wheel (or a touch drag), then back to the top; then pans
  sideways to column 300 with Space held and a drag.
- Expects: the view keeps up with no long pauses: `qa.frames` keeps frames in the `frame` budget, with few over
  `longFrame`; the last line and column are reachable and drawn; Page Down, End and Home scroll it without a click
  first, after a click on a tab (PIXEL, then ANSI) too, and the shortcut list (?) names them under View.
- Probes: `speed`: scroll as fast as the wheel goes for three seconds; `interrupt`: switch to PIXEL and back mid-scroll
  and check where the view is.
- Rated: yes, wants Page Down and Home and End (or Cmd+arrows) to scroll the view, without clicking it first

### 3. See the whole file
- Does: zooms out with Cmd+minus, Ctrl+wheel (a pinch) or the Zoom tool (Z), then goes back to 100% with Cmd+0 and
  with the zoom in the status bar.
- Expects: the view zooms down to 25%; Cmd+minus halves the zoom about the middle of the view and Cmd+0 goes back to
  100%; with the Zoom tool, Alt-click (Option-click) zooms out a step around the point (100% to 50% to 25%), a click in
  a step, and the status bar's hint says so; the status bar shows the zoom away from 100% and pressing it goes back; zooming stays smooth at this size.
- Probes: `extremes`: zoom to 800% and to 25%; `speed`: zoom in and out quickly with `qa.frames`.
- Rated: yes, wants Cmd+minus and Cmd+0 (the app's own zoom keys in the art views, in place of the browser's)

### 4. Fix one cell
- Measured: fix-cell
- Does: goes to a cell near the middle (column 150, line 800) in Edit Mode, types one character over it.
- Expects: the character shows at once, within the `response` budget from the key; the status bar says Col 150 Row
  800, with Char, FG and BG, all of it in sight on the phone (the readout wraps; only its buttons scroll sideways, faded
  at the edge); moving the cursor doesn't change the bar's height; the rest of the file doesn't move.
- Probes: `undo-redo`: undo the fix, redo it, then type another and check redo is off, timing each against `response`;
  `again`: fix a second cell 1,000 lines away; `out-of-order`: with the caret still placed, press Cmd+O (the file
  chooser opens), then start a new project (no caret is left in it).
- Rated: yes, wants T, then a key to go to a cell (getting there by arrows is hundreds of keys)

### 5. Match a color and fix a cell's colors
- Does: with the Eyedropper (I), picks the colors of the cell next to his fix; then sets them on the fixed cell (Edit
  Mode retyping the character, or Set FG and Set BG on a one-cell selection: with Select and nothing selected, a tap on
  the cell selects it, and Set FG and Set BG are first on the row).
- Expects: the pick sets both colors; the status bar shows each color and where it came from; the recolor is one undo
  step and changes only that cell.
- Probes: `out-of-order`: Set FG with no selection (it's there but off, its tip says to select cells first, and the
  row says "Tap or drag to select, or:"); `undo-redo`: undo the recolor, then the one-cell selection.
- Rated: yes, wants I, or a key that picks the colors under the Edit Mode cursor

### 6. Save the project
- Does: presses Cmd+S, keeps the offered name, saves; times it.
- Expects: the dialog offers "long-" with the date and time, focus in the name; Enter saves; the download takes under
  the `file` budget, with "Saving long-….phosphor…" at the bottom if it takes over half a second; afterwards leaving the
  page doesn't ask once the latest edits are written.
- Probes: `again`: save twice and check the second name is new; `back-out`: open the dialog and press Escape, then
  check focus is where his keys work.
- Rated: yes, wants Cmd+S, then Enter

### 7. Export the .ans
- Does: presses Cmd+E (or Export .ans) and Enter in the file name; times it.
- Expects: nothing listed to replace (every character is CP437); Enter exports, as in Save project; it saves under the
  `file` budget; the shortcut list names Cmd+E.
- Probes: `again`: export twice and compare the two files' bytes (the same); `interrupt`: press a tool key while it's
  exporting and check the export still lands whole.
- Rated: yes, wants Cmd+E, then Enter

**Free time:** he'd hide Layer 1 and look at the black base, check the PIXEL tab at this size, select all with Cmd+A and
look at the status bar, and take `qa.memory` again.

## Exact round trips

### 8. The export plays the same in a terminal
- Does: plays the export in the headless terminal (cp437, 300 by 1,600) and compares with the cells on screen.
- Expects: `diffCells` empty after `normalizeHidden`.
- Probes: `extremes`: compare the original `long.ans` with the screen the same way.
- Rated: no (a check, outside the app)

### 9. Phosphor opens its own export unchanged
- Does: notes the cells on screen, starts a New project, opens the exported .ans with Edit artwork, and compares.
- Expects: `diffCells` empty: every character and color where it was, the fixes included; the SAUCE fields the same.
- Probes: `interrupt`: open it in a second tab instead and compare there; `undo-redo`: Cmd+Z after opening does nothing.
- Rated: yes, wants Cmd+O

### 10. The project reopens unchanged
- Does: opens the .phosphor saved in step 6 and compares its cells with the export's.
- Expects: New project shows the start screen (on a phone, the settings drawer closes); the same cells, the same
  SAUCE, the same size; opening takes under the `file` budget.
- Probes: `again`: open it twice in a row from the start screen's recent list, and check the rows can be told apart:
  each whole name with its extension (`.phosphor`, `.ans`), the seconds when two share a minute, and Unchanged,
  Changed or Saved; the drawing he saved in step 6 and then exported is listed under its `.phosphor` name, not the
  export's.
- Rated: yes, wants Cmd+O

### 11. Restore on top of the original
- Does: opens `long.ans` again with Draw on top, fixes a cell on Layer 1, exports, and reopens the export.
- Expects: the art is the base with every character pinned; his fix covers it on Layer 1; the export and its reopen
  differ from the original only at the fixed cell (a 256-color file's 16 and 231 come back as 16 and 231, not 0 and 15).
  Reopening the export asks once: an export isn't a save, so its Open choices say they replace his unsaved changes
  (the drawing stays under Pick up where you left off), and choosing one opens it with no second question.
- Probes: `out-of-order`: pick Base and erase a cell (black with a pinned space), then compare again; `undo-redo`: undo
  both fixes.
- Rated: yes, wants Cmd+O, then ↓ and Enter for Draw on top

**Free time:** he'd open the exported .ans as UTF-8 by renaming it .utf8ans (it should read as CP437, saying so), export .utf8ans and
compare it in the terminal, open `ansi/past-the-edge.ans` and judge its second row from the screenshot, and diff the
bytes of the original and the export outside the art.

## SAUCE at its limits

### 12. Fill the Title to the brim
- Does: on SAUCE, types a 40-character title.
- Expects: the field stops at 35, the count beside it reads 35 / 35, and a line under it says only 35 characters fit.
- Probes: `extremes`: paste 40 characters with `é`, `€` and an emoji (the emoji takes one of the 35, and the line
  says only 35 characters fit); `back-out`: type, press Escape, and check the field.
- Rated: yes, wants ← → with a tab focused, then Tab to Title

### 13. Author and Group at 20
- Does: types 25 characters into Author and Group each, with a CP437 accent and a character CP437 lacks.
- Expects: each stops at 20, with 20 / 20 beside it and a line saying only 20 characters fit; on export a character CP437 lacks is written as its stand-in or `?`,
  and the Export dialog lists it first, with what it becomes and the fields it's in.
- Probes: `undo-redo`: Cmd+Z in the field undoes his typing there; then outside it, Cmd+Z, and see what it undoes;
  `interrupt`: reload and check the fields came back; `extremes`: paste text with a tab, BEL and `ESC[31m` into
  Author: the control characters are left out, the line under the field says so, and the export has none.
- Rated: yes, wants Tab between the fields

### 14. Comments as long as SAUCE allows
- Does: pastes a long comment: 300 lines, some longer than 64 characters.
- Expects: the count under Comments says how many of 255 SAUCE lines the comments take and, past 255, from which line
  they won't be in the file; the Export dialog says the same before writing; the export's comments are lines of up to
  64, broken at a space, at most 255; reopening the export shows the comments back as the record holds them.
- Probes: `extremes`: paste 20,000 characters and check the field keeps them all (nothing cut silently); `again`:
  export twice and compare.
- Rated: yes, wants Tab to Comments

### 15. SAUCE survives the round trip
- Does: exports .ans, reopens it in a New project, and reads the SAUCE tab.
- Expects: Title, Author, Group, Date, Comments, Font name and Letter spacing as they were exported (with stand-ins
  for what CP437 lacks); long.ans's date (20261113) and font name (IBM VGA) show and come back unchanged.
- Probes: `interrupt`: save the project instead, reload, reopen it from the start screen, and check SAUCE there too.
- Rated: yes, wants Cmd+E, then Enter

**Free time:** he'd check the SAUCE Date, Font name and Letter spacing (type a 9-digit date and a 25-character font
name, set 9px and back to what the file had, and compare the export's record byte for byte), clear every field and
export (an empty SAUCE: an opened file's empty date and font name stay empty), compare
SAUCE in a .utf8ans export with what its Export dialog lists, and check SAUCE's help text.

## Autosave, Versions, Back and Forward

### 16. My fix survives a reload
- Does: fixes a cell, waits a second and a half, and reloads.
- Expects: the fix is back, the document says it has unsaved changes, the file name is kept, the address brings back
  the tab; Undo starts empty (by design, not a finding).
- Probes: `interrupt`: reload a second time right after a fix (the last second may be lost, and that's fine);
  `speed`: make ten fixes quickly, wait, reload, and check all ten.
- Rated: no (a check of autosave)

### 17. A second tab offers my work
- Does: opens the app in a second tab of the same browser and looks at the start screen; then closes it.
- Expects: "Pick up where you left off" lists his work, marked as already open in another tab ("Open in another tab");
  the first tab's work is as it was. Choose a file has focus as the page opens, so Down reaches the rest at once.
- Probes: `out-of-order`: open it in the second tab anyway, fix a cell there, close it, and see what the first tab has.
- Rated: yes, wants Tab to the entry, then Enter

### 18. Go back to an earlier version
- Does: opens Versions right after opening his file (none yet); fixes a cell and opens it again; then keeps fixing
  cells, a snippet at a time, until more than five minutes of work have passed and Versions lists another snapshot (or
  waits, with an edit every minute); then restores the oldest, "As opened", and opens Versions again.
- Expects: Versions with none yet says "No snapshots saved yet."; after his first fix it lists "As opened" (the file as
  he opened it) and a snapshot with the fix; then snapshots every 5 minutes while he works (the last 20, "As opened"
  among them); restoring "As opened" brings back the file as it opened, and keeps what he had in the list as "Before
  restoring".
- Probes: `back-out`: open Versions and press Escape; `undo-redo`: after restoring, Cmd+Z, and see what it does.
- Rated: yes, wants a key for Versions

### 19. Back and Forward between tabs
- Does: from ANSI goes to PIXEL, then SAUCE; presses the browser's Back twice, Forward once; reloads on SAUCE.
- Expects: the address names each tab; Back and Forward move between them; the reload comes back to SAUCE; Back with a
  dialog open (Export) closes the dialog and the tab stays.
- Probes: `again`: Back past the first tab to the start screen's address and Forward again; `interrupt`: Back while a
  dialog is open.
- Rated: yes, wants ← → with a tab focused. Back and Forward themselves are the browser's (Cmd+[ and Cmd+], which do
  nothing headless, so use `page.goBack()` and `page.goForward()`); rate the step by the app's own keys, `mouse` if it
  has none.

**Free time:** he'd close the tab and reopen the app, try Versions after a reload, check what autosave keeps of the
long file (time the reload), and press Back from a fresh start screen.

## Real packs and the edges

### 20. Open the biggest real files
- Does: opens `ungenannt_oceanvs.ans` (the biggest) and `RA-FIFTY.ANS` (the longest) with Edit artwork, timing each, and compares each with the terminal
  check and with the app's reopen of its own export.
- Expects: each opens under the `file` budget at its SAUCE width (or 80); the app's export reopens unchanged; where the
  original uses a move right past the last column, the app wraps and a modern terminal doesn't, so note it and judge
  from the screenshot.
- Probes: `again`: open the member list too; `extremes`: open them on a phone-sized view.
- Rated: yes, wants Cmd+O

### 21. Open .asc and .txt files
- Does: opens an .asc from `acid-50a` and a .txt from `impure88`.
- Expects: each opens at its widest line, read as UTF-8 when it looks like it and CP437 otherwise; box characters show
  as they should.
- Probes: `out-of-order`: drop one on an open drawing and pick Add to this drawing.
- Rated: yes, wants Cmd+O

### 22. Try the formats it may not open
- Does: drops `.xb`, `.sue`, `.tnd`, `.nfo` and `.diz` files on the start screen one at a time, then chooses one with
  Choose a file.
- Expects: each either opens, or is refused with a message saying why; nothing at all, or the wrong art, is a finding
  (the README's Files).
- Probes: `back-out`: Cancel any question it asks; `again`: drop the same file twice.
- Rated: yes, wants Cmd+O

### 23. Files over the limits are refused
- Does: makes a 300 by 1,700 file and a 301 by 100 file with `files.makeLongAns`, and with unsaved work drops each on
  his open drawing.
- Expects: neither opens; a message gives the file's size and the limits (300 columns, 5,000 lines, 500,000 cells)
  before anything is asked (no Add or Open question), and the drawing he had stays open,
  unchanged.
- Probes: `extremes`: an empty .ans (a 0-byte file written from the snippet: "There's no art in this file.");
  `again`: try the same file twice.
- Rated: yes, wants Cmd+O

### 24. Grow the grid to its limit
- Does: on the long file, sets Dimensions' lines to 1,700 (3,400 pixel rows), then 1,666; then turns Lock aspect ratio
  off and does it again.
- Expects: with the lock on, the size stays at 1,600 lines and a message says the lock keeps the shape, 300 × 3200 the
  largest it fits; with it off, it stops at what 300 columns allow (1,666 lines), adding lines at the bottom; it lands
  within the `setting` budget.
- Probes: `undo-redo`: undo after the grow and check it takes back his last cell fix and leaves
  the size (a size change isn't an undo step, and mustn't forget the steps before it), then redo it; `extremes`: 5,000 lines at 100 columns.
- Rated: yes, wants Tab to Dimensions

### 25. Memory after a long session
- Does: takes `qa.memory` and compares it with step 1's; reopens the long file once more and takes it again.
- Expects: no steady growth: reopening the same file doesn't add its size each time.
- Probes: `again`: open and close the long file three times, taking `qa.memory` after each.
- Rated: no (a check of memory)

**Free time:** he'd open a pack file with Draw on top and Flatten it, export a pack file and diff its bytes with
the original, try opening a .phosphor from an older version (`projects/live-main.phosphor`), and leave the session idle
for a few minutes and come back.

## Known

