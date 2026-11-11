# Lea: tries it on her phone

## Who

Lea is a student who tapped a link to Phosphor on her phone after a friend posted an ANSI selfie. She has never heard
of ANSI art, CP437, layers in this sense or a .phosphor file, and she won't read docs. She knows phone photo apps:
filters, sliders, undo, share. She finds things by tapping what looks tappable and long-pressing what doesn't.

## Why they're here

She wants her selfie to look like the one her friend posted, a little animated if that's easy, and to share it. Done
is a picture saved to her phone (a PNG, or a GIF that moves) within a few minutes, without having been stuck or
confused, and the work still there if she comes back to the tab later.

## What they bring

- Her photos, from `tests/fixtures/` (`e2e.fixture`): `images/photo.jpg` (her selfie, the one she works on, opening
  at 80 columns by 54 pixel rows), `images/photo.webp` (a picture saved from a chat), `images/p3.png` (straight from
  her phone's camera, Display P3), `images/rgba.png` (a sticker with transparency) and `images/tiny.gif` (a GIF a
  friend sent). A file she'd pick by mistake from the phone's picker, which isn't an image: `fonts/wide.ttf`.
- Her phone: always 390 by 844, touch. The phone's picker shows every file, since a touch screen gets no list of types
  (Choose a file).
- Touch moves (the README's Pointing and driving): a tap is `locator.tap()` or `page.touchscreen.tap(x, y)`; a drag
  goes through the DevTools protocol as the README shows. A long press is a touch held still:
  `touch('touchStart', x, y)`, `await page.waitForTimeout(800)`, `touch('touchEnd')`. A pinch is two touch points
  moving apart (or together), sent the same way:
  `cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - d, y }, { x: x + d, y }] })`
  for growing `d`, between a `touchStart` with both points and a `touchEnd` with none. Turning the phone sideways is
  `page.setViewportSize({ width: 844, height: 390 })`, and back upright `{ width: 390, height: 844 }`.
- Her keyboard is the phone's own, which shows only while a text field or Edit Mode's cursor has focus. It has
  letters, numbers, Backspace and the key that says return, Go or Done (Enter); it has no Escape, Tab, arrows or Cmd.
  Type on it with `page.keyboard` once the field has focus (`pressSequentially` or `page.keyboard.type`, then
  `page.keyboard.press('Enter')`).
- Habits: taps first and reads after; expects a share or save button where the picture is; long-presses things
  looking for a menu; pinches the picture to zoom; turns the phone sideways when something looks cramped; switches
  apps and comes back.

## What they lean on

- The start screen: the drop box, Choose a file, Or start with a blank canvas, Pick up where you left off.
- The phone layout: the menu button (☰) that slides the settings out, the Layers button that opens LAYERS in a dialog
  ([The layers list](../../layers.md#the-layers-list)), the Actions menu, the status bar.
- The settings she can feel: Art style, Color palette, the Characters presets and the dice, Brightness and Contrast,
  Dimensions ([Layers](../../layers.md#the-left-column)).
- The Brush and Edit Mode, the color pair ([Other tools](../../layers.md#other-tools)).
- The Animate switch, Add frame, play, Ghost ([Animation](../../animation.md)).
- Export .gif, Save project, and the PNG she expects among the exports ([Vector shapes](../../vector.md#saving) lists
  PNG among them).

## What makes them give up

- A screen where something is cut off, covered or off the edge, so she can't reach it.
- Not finding how to save or share the picture.
- Losing what she did when she switched apps or the tab reloaded.
- A word or a message she doesn't understand, or a tap that does nothing and says nothing.

## Sizes

- The default: her selfie opens at 80 columns by 54 pixel rows (27 lines, 2,160 cells); a blank canvas is 80 by 25
  (Dimensions 80 by 50, 2,000 cells).
- 2 or 3 layers: Base, Layer 1 and one she adds.
- An animation of 3 to 6 frames at 8 frames per second.
- Exports: a .gif of a few hundred KB, a .phosphor of a few hundred KB.

## Traits

Device and input don't vary: Lea is always a phone, 390 by 844, touch. Language, theme and interruption apply. She has
no account and no partner: rooms aren't on a phone.

Two things every step of hers does, on top of the README's Walking a step:

- **Every screenshot is checked for clipping and overlap**: text cut off or run together, a button under another or
  off the screen's edge, a dialog wider or taller than 390 by 844, a menu that opens off screen, a tap target smaller
  than a fingertip. Each one is a `visual` finding.
- **Rated steps use the phone's own keyboard.** A step is rated only where the app shows her that keyboard (a text
  field, or Edit Mode's cursor). It's rated by the README's ratings, counting the phone keyboard's keys only: the tap
  that brings the keyboard up is how a phone reaches a field, and isn't counted; from there, `keys` when its own
  return, Go or Done (one or two keys) finishes the step, and `mouse` when she has to tap something to finish it
  (Escape, Tab and the arrows aren't on it). Steps with no keyboard on screen are `Rated: no`.

## Goals
- I can save my selfie as a picture to post, from my phone, without getting stuck.
- Export a GIF of my little movie in four taps or fewer.
  Counted: taps on export-gif, target 4, lower is better.
- Every button I need is on the screen, not cut off or covered, and every tap shows me something happened.
- My work is still there when the tab reloads or I come back to it later.

## Script

Each `##` heading after this one, up to Known, is a section of the script. Steps are numbered through the whole
script. Every section ends with Free time.

## Landing cold

### 1. See what this is
- Does: opens the app and looks at the start screen without touching anything, then scrolls it.
- Expects: the tab bar (☰, PIXEL, ANSI and SAUCE dimmed, and the Animate switch), the Phosphor logo, the box that says
  "Drop an image, .phosphor or ANSI file here" with Choose a file, and "Or start with a blank canvas", all inside 390
  wide with nothing cut off; no SOCIAL anywhere (a phone has no side panel).
- Probes: `free`: tap the Animate switch before anything is open (it says "Open an image or start a canvas to
  animate."); `interrupt`: turn the phone sideways and back, and check the start screen fits both ways;
  `out-of-order`: tap the dimmed ANSI tab.
- Rated: no (touch only: no keyboard shows here)

### 2. Open my selfie
- Does: taps Choose a file and picks `photo.jpg`.
- Expects: it opens on ANSI as character art, 80 columns wide, fitted to the screen's width; the tab bar gains the
  Layers button; the toolbar shows the color pair, the Pencil, Brush, Eraser, Paint Bucket, Shapes, a ⋯ for the rest,
  and Actions; the status bar says "Layer 1". Opening takes under the `file` budget.
- Probes: `out-of-order`: first pick `fonts/wide.ttf` by mistake (it says "Couldn't open … Make sure it's a supported
  image or .phosphor file."); `again`: press New project and open `p3.png`, then `photo.webp`, then `rgba.png`, then
  `tiny.gif`, and come back to `photo.jpg`; `extremes`: look at where `rgba.png`'s transparency lands.
- Rated: no (touch only: no keyboard shows here)

### 3. Zoom in on my face
- Does: pinches the picture to zoom in, drags with one finger to look around, pinches back out, then taps the zoom in
  the status bar.
- Expects: a pinch zooms around her fingers from 25% to 800%, and draws nothing; the status bar shows the zoom away
  from 100% and a tap on it goes back to 100% ([Other tools](../../layers.md#other-tools)); frames stay in the
  `frame` budget while she pinches (`qa.frames`).
- Probes: `speed`: pinch in and out quickly five times; `extremes`: pinch as far out and in as it goes;
  `interrupt`: pinch while a tool that draws (the Brush) is picked, and check no stroke was left behind ("A stroke a
  pinch interrupted" is taken back).
- Rated: no (touch only: no keyboard shows here)

### 4. Long-press the picture
- Does: long-presses the picture with the Hand, then with the Brush picked, then on a toolbar button.
- Expects: no browser menu or text selection pops up over the art; with the Brush, a held finger draws where it is,
  as a short tap would; a long press on a button does what a tap does, or nothing, and leaves no stuck look.
- Probes: `back-out`: long-press with the Brush, then drag off the canvas before lifting; `undo-redo`: undo the mark
  from Actions → Undo, then Redo.
- Rated: no (touch only: no keyboard shows here)

**Free time:** she'd tap the PIXEL and SAUCE tabs to see what they are, pinch the PIXEL view too, tap DOM and Smooth
in the status bar to see what they do, and try "Or start with a blank canvas" from New project.

## Poking the settings

### 5. Find the settings
- Does: taps ☰.
- Expects: the art slides right and the settings column shows on the left, with ☰ turned into ✕; a tap on ✕ or on the
  slid-aside art slides it back; the slide is quick and doesn't stutter; everything in the column fits its width.
- Probes: `again`: open and close it five times in a row; `interrupt`: open it, turn the phone sideways (the settings
  show beside the art on a wide screen), and back upright; `back-out`: open it and use the phone's Back
  (`page.goBack()`), and check where she lands.
- Rated: no (touch only: no keyboard shows here)

### 6. Try the looks
- Does: picks each Art style (ANSI, Color ASCII, Monochrome ASCII) and each Color palette from their pickers, coming
  back to ANSI and Full color.
- Expects: each pick redraws the picture in under the `setting` budget; the pickers are the phone's own and readable;
  Limited count shows a Color count slider and Custom color list shows colors to edit, both fitting the column.
- Probes: `again`: pick the same style twice; `undo-redo`: undo the last three picks from Actions → Undo and check the
  pickers and the picture go back together.
- Rated: no (touch only: no keyboard shows here)

### 7. Drag the sliders
- Does: drags Brightness and Contrast with a finger, then Saturation to the far end, timing the drag with `qa.frames`.
- Expects: the value shows over the thumb while she drags (a finger covers the label row's value); the picture follows
  her finger; frames stay in the `frame` budget; a whole drag is one undo step; dragging a slider doesn't scroll the
  column or slide the settings away.
- Probes: `speed`: drag Brightness back and forth for two seconds; `extremes`: drag every slider in Adjustments to an
  end, then press Reset; `undo-redo`: undo the Reset from Actions.
- Rated: no (touch only: no keyboard shows here)

### 8. Make the characters mine
- Does: picks a few Characters presets ("Blocks & shades", "Half-blocks"), taps the dice a few times, then taps the
  seed field and types her name on the phone's keyboard and presses return.
- Expects: each preset and each roll changes the pattern; her name as the seed gives a pattern of its own, and the
  same name typed again gives the same one; each is one undo step
  ([Characters](../../characters.md#how-the-converter-picks-characters)).
- Probes: `extremes`: type a seed of 200 characters with emoji, and an empty one; `back-out`: start typing a seed and
  tap the art instead of return, and check what's kept.
- Rated: yes, wants return on the phone's keyboard

### 9. Fold what I don't use, and read a help
- Does: taps the Transforms and Adjustments titles to fold them, then taps the i beside Choose characters.
- Expects: a folded section says how many of its sliders are on ("2 on") and stays folded across a reload; the help
  opens readable inside 390 wide, and a tap away closes it.
- Probes: `interrupt`: reload with sections folded; `again`: fold and unfold the same section three times.
- Rated: no (touch only: no keyboard shows here)

### 10. Make it smaller
- Does: taps the first Dimensions number, types 40 on the phone's number keys and presses return.
- Expects: the picture converts again at 40 columns, its rows following the photo's shape (Lock aspect ratio is on);
  the change lands within the `setting` budget.
- Probes: `extremes`: type 0, then 999, and check where it stops (300 columns at most); `undo-redo`: undo from
  Actions and check it takes back her brush mark from step 4 and leaves the size (a size change isn't an undo step,
  and mustn't forget the steps before it); redo it. End at 40 columns.
- Rated: yes, wants return on the phone's keyboard

### 11. Undo, from a phone
- Does: makes three changes, then looks for Undo: opens Actions and taps Undo three times, then Redo once.
- Expects: Actions holds Undo, Redo, Bake, Flatten, Merge down and Clear layer, each named, the ones that can't act
  dimmed; Undo takes back one step each time; the menu fits on screen.
- Probes: `speed`: tap Undo ten times as fast as the menu allows (does it close after each tap?); `undo-redo`: redo
  after a new change and check Redo is off.
- Rated: no (touch only: no keyboard shows here)

**Free time:** she'd press Reset all, try Colorize with its color, switch the language picker at the bottom of the
column to see the words change, switch the theme, and open About.

## Drawing on it

### 12. Paint on my selfie
- Does: picks the Brush, picks a color from the color pair, and paints a few strokes with a finger.
- Expects: the color box opens fitting the screen, and a pick closes it or shows which color she has; the strokes land
  where her finger went, after the short wait a touch has (in case of a pinch); each stroke is one undo step
  ([Other tools](../../layers.md#other-tools)).
- Probes: `back-out`: open the color box and tap outside it; `speed`: scribble fast with `qa.frames`; `out-of-order`:
  pick a color of None and paint.
- Rated: no (drawing)

### 13. Write a caption
- Does: opens ⋯ and picks Edit Mode, taps where the caption goes, types "me :)" on the phone's keyboard, presses
  return and types a second line; then tries to put the cursor away.
- Expects: the tap shows the cursor and brings up the phone's keyboard; the letters land at the cursor in her colors;
  return goes to the next line; a run of typing is one undo step. To stop typing she has to tap another tool (Escape
  isn't on her keyboard).
- Probes: `extremes`: type an emoji and a few letters with accents; `interrupt`: halfway through typing, switch to
  PIXEL and back, and keep typing; `back-out`: tap the art away from the cursor.
- Rated: yes, wants the phone keyboard's Done to put the cursor away

### 14. Add a layer and name it
- Does: taps Layers, taps + Layer, taps its name and types "doodles" on the phone's keyboard and presses return; hides
  it with its eye and shows it again; taps Done.
- Expects: the dialog fits at 390 wide, with every row's name, eye and ⋯ visible; "Layer 2" is added above Layer 1 and
  picked, and stays open after a pick; return keeps the new name; the status bar then says "doodles"
  ([The layers list](../../layers.md#the-layers-list)).
- Probes: `extremes`: rename it to 40 characters with emoji and check the row, then back to "doodles"; `back-out`: start
  a rename and tap outside the dialog; `again`: add three layers in a row.
- Rated: yes, wants return on the phone's keyboard

### 15. Long-press a layer
- Does: in the Layers dialog, long-presses a layer's row, then taps its ⋯.
- Expects: a long press doesn't select page text or open the browser's menu (dragging to reorder is the mouse's); ⋯
  offers Rename, Duplicate, Delete, Move up and Move down, inside the screen.
- Probes: `out-of-order`: long-press Base (it has no ⋯); `undo-redo`: Delete a layer from ⋯, then undo from Actions.
- Rated: no (touch only: no keyboard shows here)

**Free time:** she'd try the Paint Bucket on her hair, use the Eraser, try Merge down from Actions, and look for a
sticker or emoji picker.

## A little movie

### 16. Make it move
- Does: taps the Animate switch, then Add frame and Blank; paints a little on frame 2; adds a third frame and paints
  again.
- Expects: the switch is an icon at this width; the bar shows on two lines: the frame she's on, the scrubber, Add
  frame and Frame actions first, then play, the steps, the timing and Ghost ([The bar](../../animation.md#the-bar)); the
  Add frame menu's three kinds fit on screen; frame 1 shows dimmed while she draws on frame 2.
- Probes: `out-of-order`: tap play with one frame (it's off); `again`: add frames until there are six; `back-out`:
  open Add frame and tap outside it.
- Rated: no (touch only: no keyboard shows here)

### 17. Play it and set the speed
- Does: taps play, then pause; drags the scrubber with a finger; taps the frames per second field, types 4 on the
  phone's number keys and presses return.
- Expects: it loops; the scrubber follows her finger; the new speed shows when she plays again; the bar's fields stay
  readable with the keyboard up.
- Probes: `extremes`: type 0 and 99 in frames per second, then 4 again; `interrupt`: reload, as when the phone drops a
  tab in the background, and check the frames came back with Animate on.
- Rated: yes, wants return on the phone's keyboard

### 18. Use the ghost
- Does: taps Ghost and moves its strength, then unchecks it.
- Expects: the box opens upward inside the screen with its checkbox and slider; the strength changes how dim earlier
  frames show; off shows them solid ([The ghost](../../animation.md#the-ghost)).
- Probes: `back-out`: tap outside the box; `extremes`: strength at 0% and 100%.
- Rated: no (touch only: no keyboard shows here)

**Free time:** she'd delete a frame from Frame actions, move one earlier, turn Animate off to see what happens to her
frames, and pinch while it plays.

## Sharing it

### 19. Save a picture to post
- Does: turns Animate off first (step 16 turned it on), then looks for a PNG: in the settings column's buttons, in
  Actions, and long-presses the picture.
- Expects: a way to save the art as a picture, which [Vector shapes](../../vector.md#saving) lists among the exports
  (PNG). If there's none, that's a `bug` finding, since the docs say it works (the README's
  [A step that can't be done](../README.md#a-step-that-cant-be-done)).
- Probes: `out-of-order`: look on SAUCE too; `free`: take the screenshot a phone person would (`qa.shot`) and note
  that's her only way.
- Rated: no (touch only: no keyboard shows here)

### 20. Export a GIF
- Measured: export-gif
- Does: turns Animate on (with the frames from step 16), opens ☰, scrolls to Export .gif and taps it; renames the file
  on the phone's keyboard and presses Go.
- Expects: Export .gif shows only with Animate on and more than one frame; the dialog ("Looping animated GIF rendered
  in your current display font—ready to share anywhere.") fits at 390 wide with its name, Cancel and Export; Go
  exports; the download is a GIF (`GIF89a`) within the `file` budget, of her frames, without the ghost
  ([Exporting](../../animation.md#exporting)).
- Probes: `again`: export twice in a row and check the names differ; `back-out`: rename, tap Cancel, reopen, and check
  the offered name; `extremes`: name it with emoji and slashes.
- Rated: yes, wants Go on the phone's keyboard

### 21. Keep my work for later
- Does: taps Save project, keeps the name and presses Go; then reloads the page.
- Expects: a .phosphor downloads; after the reload she's back where she was (autosave brought it back, with its
  frames, layers and settings); New project afterwards asks about unsaved changes only if there are any.
- Probes: `interrupt`: reload a second and a half after an edit without saving and check it came back; `back-out`:
  press New project with unsaved changes and cancel the question (a browser confirm: handle it with
  `page.once('dialog')`).
- Rated: yes, wants Go on the phone's keyboard

### 22. Come back to it
- Does: presses New project (accepting if it asks: a browser confirm, handled with `page.once('dialog')` as in step
  21), then looks at the start screen.
- Expects: "Pick up where you left off" lists her work with its time and an Open button; Open brings it back; the list
  fits at 390 wide, long names cut off neatly.
- Probes: `again`: open it twice; `extremes`: save a project under a 60-character name with emoji and check how it
  shows in the list.
- Rated: no (touch only: no keyboard shows here)

### 23. Sign it on SAUCE
- Does: taps SAUCE and types her name as Author on the phone's keyboard, then a title, pressing return after each.
- Expects: SAUCE's fields fit at 390 wide; the phone's keyboard doesn't cover the field she's typing in; return moves
  on or keeps what she typed; the fields hold their widths (Author 20 characters).
- Probes: `extremes`: type 40 characters into Author and see where it stops; `interrupt`: switch to ANSI and back.
- Rated: yes, wants return on the phone's keyboard

**Free time:** she'd open Versions and look at its list, try Export .ans and wonder what it is, open About and the
Terms from it and check they fit, and look for a Share button.

## Rooms

### 24. Open a room link a friend sent
- Does: opens the app at a room's address (`/#/social?room=abc123`), as a link in a message would.
- Expects: rooms aren't on a phone ([Not in this version](../../social.md#not-in-this-version): a link to a room
  opened on a narrow screen does nothing there), so she expects to be told so in plain words: that rooms need a bigger
  screen, or the phone turned sideways. Nothing saying so is an `oversight` finding; her work in progress must still be
  there either way.
- Probes: `interrupt`: open the link with work in progress, and check nothing was lost; `again`: open it twice.
- Rated: no (touch only: no keyboard shows here)

### 25. Turn the phone sideways
- Does: turns the phone sideways (844 by 390), looks for SOCIAL, opens it, and reads the question; taps Not now; turns
  it back upright.
- Expects: sideways is wide enough for the side panel, with LAYERS and Social (marked Beta)
  ([Social](../../social.md)); the question "Before you open SOCIAL" fits the short screen and scrolls; Not now goes
  back to LAYERS; turned upright, the side panel goes and the Layers button comes back, with nothing lost.
- Probes: `back-out`: open Social again and tap outside the question instead of Not now; `interrupt`: turn upright
  while the question is open.
- Rated: no (touch only: no keyboard shows here)

**Free time:** she'd open the Privacy Policy from About, turn sideways while drawing and while a dialog is open, open
the room link again while sideways (it asks first, as SOCIAL does; she taps Not now), and look at the address upright
and sideways.

## Known
