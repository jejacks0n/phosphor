# Lea: tries it on her phone

## Who

Lea is a student who tapped a link to Phosphor on her phone after a friend posted an ANSI selfie. She has never heard
of ANSI art, CP437, layers in this sense or a .pho file, and she won't read docs. She knows phone photo apps:
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

- The start screen: Choose a file, Start with a blank canvas, Pick up where you left off.
- The phone layout: the menu button (☰) that slides the settings out, the unfold button at the tab bar's right end that slides LAYERS in over
  the art ([The layers list](../../layers.md#the-layers-list)), the Actions menu, the status bar.
- The settings she can feel: Art style, Color palette, the Characters presets and the dice, Brightness and Contrast,
  Dimensions ([Layers](../../layers.md#the-left-column)).
- The Brush and Edit Mode, the color pair ([Other tools](../../layers.md#other-tools)).
- The Animate switch, Add frame, play, Ghost ([Animation](../../animation.md)).
- Export .gif, Export .png and Save project ([Characters](../../characters.md#saving-utf8ans-and-ans)).

## What makes them give up

- A screen where something is cut off, covered or off the edge, so she can't reach it.
- Not finding how to save or share the picture.
- Losing what she did when she switched apps or the tab reloaded.
- A word or a message she doesn't understand, or a tap that does nothing and says nothing.

## Sizes

- The default: her selfie opens at 80 columns by 54 pixel rows (27 lines, 2,160 cells); a blank canvas is 80 by 25
  (Dimensions 80 by 50, 2,000 cells).
- 1 or 2 layers: Base, and one she adds.
- An animation of 3 to 6 frames at 8 frames per second.
- Exports: a .gif of a few hundred KB, a .pho of a few hundred KB.

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
- Expects: the tab bar (☰, PIXEL, ANSI and SAUCE dimmed, and the Animate switch), the Phosphor logo, and under it
  Choose a file and "Start with a blank canvas" as two buttons the screen's width, one over the other, each tall enough
  for a thumb, with no dashed line around them (a phone has nothing to drop), all inside 390 wide with nothing cut
  off; no SOCIAL anywhere (a phone has no side panel).
- Probes: `free`: tap the Animate switch before anything is open (it says "Open an image or create a canvas to animate."); `interrupt`: turn the phone sideways and back, and check the start screen fits both ways;
  `out-of-order`: tap the dimmed ANSI tab.
- Rated: no (touch only: no keyboard shows here)

### 2. Open my selfie
- Does: taps Choose a file and picks `photo.jpg`.
- Expects: it opens on ANSI as character art, 80 columns wide, fitted to the screen's width; the unfold button at the tab bar's right
  end opens LAYERS over the art; the toolbar shows the color pair, the Pencil, Brush, Eraser, Paint Bucket, Shapes, a ⋯ for the rest,
  and Actions; the status bar says "Base"; LAYERS has only Base. Opening takes under the `file` budget.
- Probes: `out-of-order`: first pick `fonts/wide.ttf` by mistake (it says "Couldn't open … Make sure it's a supported
  image or .pho file."); `again`: press New project and open `p3.png`, then `photo.webp`, then `rgba.png`, then
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
in the status bar to see what they do, and try "Start with a blank canvas" from New project.

## Poking the settings

### 5. Find the settings
- Does: taps ☰.
- Expects: the art slides right and the settings column shows on the left, with ☰ turned into ✕; a tap on ✕ or on the
  slid-aside art slides it back; a swipe on the slid-aside art with the Pencil in hand slides it back too, and draws
  nothing (Undo stays off); the slide is quick and doesn't stutter; everything in the column fits its width.
- Probes: `again`: open and close it five times in a row; `interrupt`: open it, turn the phone sideways (the settings
  show beside the art on a wide screen), and back upright; `back-out`: open it and use the phone's Back
  (`page.goBack()`), and check where she lands.
- Rated: no (touch only: no keyboard shows here)

### 6. Try the looks
- Does: picks each Art style (ANSI, Color ASCII, Monochrome ASCII) and each Color palette from their pickers. On Custom
  color list she shuts the drawer, taps the color pair, then Palettes in the color layer, and edits This drawing there (on a phone
  it takes the whole window). Then she closes it and comes back to ANSI and Full
  color.
- Expects: each pick redraws the picture in under the `setting` budget; the pickers are the phone's own and readable;
  Limited count shows a Color count slider fitting the column, and the Palettes page's This drawing shows the colors as large
  swatches with their hex, a whole #rrggbb showing in the hex field; the move earlier and move later buttons, a fingertip wide on the line under it, move the picked color a place (a finger's drag on a swatch scrolls
  the page and moves nothing); the Palettes page takes the whole window, with its list above and the details below.
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
  Actions and check it puts the old size back, the picture as it was, and a second undo takes back her brush mark from
  step 4 (a size change is an undo step, and mustn't forget the steps before it); redo both. End at 40 columns.
- Rated: yes, wants return on the phone's keyboard

### 11. Undo, from a phone
- Does: makes three changes, then looks for Undo: opens Actions and taps Undo three times, then Redo once.
- Expects: Actions holds Undo, Redo, Bake, Flatten and Merge down, each named, the ones that can't act dimmed (Clear
  layer isn't there while Base is picked: it comes with a drawing layer, step 14); Undo takes back one step each time;
  the menu fits on screen.
- Probes: `speed`: tap Undo ten times as fast as the menu allows (does it close after each tap?); `undo-redo`: redo
  after a new change and check Redo is off.
- Rated: no (touch only: no keyboard shows here)

**Free time:** she'd press Reset all, try Colorize with its color, switch the language picker at the bottom of the
column to see the words change, switch the theme, and open About.

## Drawing on it

### 12. Paint on my selfie
- Does: picks the Brush, picks a color from the color pair, and paints a few strokes with a finger.
- Expects: the color box opens fitting the screen, and a pick closes it or shows which color she has; the strokes land
  where her finger went, after the short wait a touch has (in case of a pinch), on the picture itself (Base is
  picked); each stroke is one undo step; with the foreground set to None a stroke paints nothing and a toast says why
  ([Other tools](../../layers.md#other-tools), [Drawing on the Base](../../layers.md#drawing-on-the-base),
  [None](../../layers.md#color-keys)).
- Probes: `back-out`: open the color box and tap outside it; `speed`: scribble fast with `qa.frames`; `out-of-order`:
  set the foreground to None and paint.
- Rated: no (drawing)

### 13. Write a caption
- Does: opens ⋯ and picks Edit Mode, taps where the caption goes, types "me :)" on the phone's keyboard, presses
  return and types a second line; then tries to put the cursor away.
- Expects: the tap shows the cursor without moving the view and brings up the phone's keyboard; the letters land at the cursor in her colors;
  return goes to the next line; a run of typing is one undo step. To stop typing she has to tap another tool (Escape
  isn't on her keyboard).
- Probes: `extremes`: type an emoji, a few letters with accents and the digits 1 to 4 (they type: the tabs' keys,
  Alt+1 to 4, need an Alt her keyboard hasn't); `interrupt`: halfway through typing, switch to PIXEL and back, and keep
  typing; `back-out`: tap the art away from the cursor.
- Rated: yes, wants the phone keyboard's Done to put the cursor away

### 14. Add a layer and name it
- Does: taps Layers, taps Add layer (the header's cells icon with a plus), taps its name and types "doodles" on the
  phone's keyboard and presses return; hides it with its eye and shows it again; taps Done.
- Expects: the dialog fits at 390 wide, with the header's count and both add buttons and every row's name, eye and ⋯
  visible; "Layer 1" is added above Base and picked, and stays open after a pick; return keeps the new name; the status bar then says "doodles"
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

### 15b. Make a painted heart bigger
- Does: paints a small heart with the Brush, picks Select, drags a rectangle around it with a finger, then drags the
  rectangle's corner handle out to twice its size.
- Expects: the handles show on the rectangle (a finger takes one from a little farther than a pointer); the heart grows
  from the opposite corner, each of its pixels doubled, with no blur; Actions' undo takes it back in one step
  ([Resize](../../layers.md#resize)).
- Probes: `out-of-order`: type a letter in the rectangle first (the handles go); `interrupt`: lift and drag the corner
  again (it's drawn from the heart she first lifted, not the grown one).
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
- Expects: the box opens upward inside the screen with its checkbox, slider, Frames before and Frames after; tapping a
  count brings up the number keyboard without zooming the page; what the frame inherits shows solid whatever the
  strength, and the strength changes how dim the cells that stay on the frame before show; off hides those
  ([The ghost](../../animation.md#the-ghost)).
- Probes: `back-out`: tap outside the box; `extremes`: strength at 0% and 100%.
- Rated: no (touch only: no keyboard shows here)

**Free time:** she'd delete a frame from Frame actions, move one earlier, turn Animate off to see what happens to her
frames, and pinch while it plays.

## Sharing it

### 19. Save a picture to post
- Does: turns Animate off first (step 16 turned it on), then opens ☰, taps Export, picks PNG, leaves Text
  rendering on Hard-edged, and presses Export.
- Expects: a PNG of the art as it shows, saved to her phone; where the browser has a share sheet, **Share** beside
  Export, which fits at 390 wide, sends the PNG there instead (a run's browser can't answer the share sheet: check
  only that Share shows where `navigator.canShare` takes a PNG) ([Characters](../../characters.md#saving-utf8ans-and-ans)).
- Probes: `out-of-order`: look on SAUCE too; `free`: long-press the picture, as she would to save any image.
- Rated: no (touch only: no keyboard shows here)

### 20. Export a GIF
- Measured: export-gif
- Does: turns Animate on (with the frames from step 16), opens ☰, scrolls to Export .gif and taps it; renames the file
  on the phone's keyboard and presses Go.
- Expects: Export .gif shows only with Animate on and more than one frame; the dialog ("Looping animated GIF rendered in your display font, ready to share anywhere.") fits at 390 wide with its name, Cancel and Export; Go
  exports; the download is a GIF (`GIF89a`) within the `file` budget, of her frames, without the ghost
  ([Exporting](../../animation.md#exporting)).
- Probes: `again`: export twice in a row and check the names differ; `back-out`: rename, tap Cancel, reopen, and check
  the offered name; `extremes`: name it with emoji and slashes.
- Rated: yes, wants Go on the phone's keyboard

### 21. Keep my work for later
- Does: taps Save project, keeps the name and presses Go; then reloads the page.
- Expects: a .pho downloads; after the reload she's back where she was (autosave brought it back, with its
  frames, layers and settings), with the tool, colors and tool options she had (kept in the browser, not the drawing);
  New project afterwards asks about unsaved changes only if there are any, and keeps her tool and colors.
- Probes: `interrupt`: reload a second and a half after an edit without saving and check it came back; `back-out`:
  press New project with unsaved changes and Cancel Phosphor's "Start a new project?" question (Save project first,
  Start without saving or Cancel); `again`: start without saving, pick the drawing back up from "Pick up where you left
  off" (it says Changed), and press New project at once: nothing asks, and the list still says Changed.
- Rated: yes, wants Go on the phone's keyboard

### 22. Come back to it
- Does: presses New project (choosing Start without saving if it asks, as in step 21), then looks at the start
  screen.
- Expects: "Pick up where you left off" lists her work under Choose a file and Start with a blank canvas, with its time, whether
  it's Unchanged, Changed or Saved, and "Resume"; tapping the row brings it back; the list fits at 390 wide, every
  row two lines (the name, then the time and status) with Resume beside them.
- Probes: `out-of-order`: from the start screen, start a blank canvas first: Animate is off and no bar shows, though
  it was on in the drawing she left; then open her work again and check Animate is back on with its frames;
  `again`: open it twice, and check the two rows read apart (the seconds, Unchanged); `extremes`: save a
  project under a 60-character name with emoji and check it wraps to at most two lines, cut in the middle past that,
  keeping its end.
- Rated: no (touch only: no keyboard shows here)

### 23. Sign it on SAUCE
- Does: taps SAUCE and types her name as Author on the phone's keyboard, then a title, pressing return after each.
- Expects: SAUCE's fields fit at 390 wide; the phone's keyboard doesn't cover the field she's typing in; a title with
  digits in it ("selfie 2") types them and stays on SAUCE; return moves
  on or keeps what she typed; the fields hold their widths (Author 20 characters), with a count beside each label;
  Title and Author are still at the top, with Date, the For other viewers group and Export… below them to scroll to.
- Probes: `extremes`: type 40 characters into Author and see where it stops (20 / 20 turns the warning color above
  the field, and a line under it says only 20 characters fit, though it may need a scroll with the keyboard up); `interrupt`: switch to ANSI and back.
- Rated: yes, wants return on the phone's keyboard

**Free time:** she'd open Versions and look at its list, try Export .ans and wonder what it is, open About and the
Terms from it and check they fit, and look for a Share button.

## Rooms

### 24. Open a room link a friend sent
- Does: opens the app at a room's address (`/social?room=abc123`), as a link in a message would.
- Expects: it asks "Join this room?" with the lobby open over the art; Join takes her to ROOM with the host's art and
  the panel shut; the unfold button opens CHAT over the art, with what was said counted beside it, and a tap or a swipe on the strip of art shuts
  it, drawing nothing ([The Side Panel](../../social.md#the-side-panel)). Her work in progress is still there when she leaves.
- Probes: `interrupt`: open the link with work in progress, and check nothing was lost; `again`: open it twice.
- Rated: no (touch only: no keyboard shows here)

### 25. Turn the phone sideways
- Does: turns the phone sideways (844 by 390), looks for SOCIAL, opens it, and reads the question; taps Not now; turns
  it back upright.
- Expects: sideways is wide enough for the side panel, with LAYERS and Social (marked Beta)
  ([Social](../../social.md)); the question "Before you use Social rooms" fits the short screen and scrolls; Not now goes
  back to LAYERS; turned upright, the side panel goes behind the unfold button at the tab bar's right end, with nothing lost.
- Probes: `back-out`: open Social again and tap outside the question instead of Not now; `interrupt`: turn upright
  while the question is open.
- Rated: no (touch only: no keyboard shows here)

**Free time:** she'd open the Privacy Policy from About, turn sideways while drawing and while a dialog is open, open
the room link again while sideways (it asks first, as SOCIAL does; she taps Not now), and look at the address upright
and sideways.

## Plugins

### 26. Add a theme from a file
- Does: opens the settings, taps Plugins (it opens on Marketplace, as she has no plugins), taps the Installed tab, taps Install from a file… and picks `plugins/midnight/phosphor-plugin.json`;
  reads the question and taps Install; closes the dialog and picks Midnight in the select under the theme icons.
- Expects: the question says "Install Midnight 1.2.0?", "by Phosphor" and "Adds 1 theme. Runs no code."; the row shows
  Midnight, 1.2.0, by Phosphor, 1 theme and its homepage; with Midnight picked the whole app turns deep blue (the panels,
  borders and words, the glow behind the art, the buttons, with Install and Export a bright cyan) and no theme icon is
  checked; the language and the icons keep their row, a half each, with the select on its own row under them, fitting the column's width ([Plugins](../../plugins.md)).
- Probes: `out-of-order`: first pick `images/photo.jpg` (it says "That file isn't a plugin's manifest."); `again`:
  install the same file twice (the second asks "Replace Midnight 1.2.0 with 1.2.0?").
- Rated: no (touch only: no keyboard shows here)

### 27. Reload, switch it off, remove it
- Does: reloads with Midnight in use; opens Plugins (it opens on Installed now) and taps Midnight's switch to Off; taps it back On, picks Midnight
  again, then taps Midnight's trash can and Remove.
- Expects: the reload is deep blue from the first moment, with no flash of Dark; Off takes the theme away and the app
  goes Dark, with the Dark icon checked and the select gone; the trash can asks "Remove Midnight?" first, and after it the
  dialog says there are no plugins yet.
- Probes: `back-out`: tap Cancel at "Remove Midnight?"; `interrupt`: open the app at `/?plugins=off` with Midnight in
  use and check it's Dark, with the dialog saying plugins are off for this visit.
- Rated: no (touch only: no keyboard shows here)

### 28. Add Outlines
- Does: with her selfie open, opens the settings, taps Plugins and the Installed tab, taps Install from a file… and picks
  `tests/fixtures/plugins/outlines.zip` (a phone's file picker gives a .zip, not a folder, so this is how she installs it); reads the question and taps Install; then taps Install from a
  folder… to see what her phone offers.
- Expects: the question says "Install Outlines 1.0.2?", "by Phosphor" and "Adds a script.", with "⚠ This plugin runs
  code in Phosphor. Install it only if you trust where it came from." under it, all fitting 390 wide with Install and
  Cancel reachable; after Install the row shows Outlines, 1.0.0, by Phosphor and "Runs code", with no Reload or Follow file
  (a phone keeps no link to the file); Cancel leaves nothing in the list. The folder button opens her phone's own picker or
  does nothing it can explain, and either way leaves the dialog as it was (installing from a folder is checked in the
  end-to-end tests, not here) ([Installing a plugin](../../plugins.md#installing-a-plugin)).
- Probes: `back-out`: tap Cancel at the question, check the list is unchanged, and start again; `out-of-order`: pick
  `images/photo.jpg` with Install from a file… (it says "That file isn't a plugin's manifest." or that it isn't a
  readable .zip); `again`: install the zip twice (the second asks "Replace Outlines 1.0.2 with 1.0.2?").
- Rated: no (touch only: no keyboard shows here)

### 28b. Browse the Marketplace and install from it
- Does: with no plugins installed, opens the settings and taps Plugins (it opens on Marketplace, filling her phone's window);
  looks at the cards, types "fog" in Search plugins, clears it, picks Themes then Scripts in the Show menu, and picks
  All again; taps Install on Fog, reads the question and taps Install; taps the Installed tab; then back on Marketplace
  taps Install on Outlines, reads the question and taps Cancel. The app answers `/plugins.json` with the fixture list
  (`tests/fixtures/plugin-list.json`), and the development server serves the listed plugins' files from the checkout, so
  Install works there.
- Expects: the dialog fills the whole window (no page behind it showing at the sides) with the Marketplace and Installed
  tabs as its first line, the × at their right end (no "Plugins" title over them), the search and Show menu
  in reach of a thumb, and the cards in one column, each with its art band, name, version, Official or author, a description
  cut to two lines and its button, nothing wider than 390; Fog's button says Reading… (and does nothing when tapped)
  until its question shows; Fog's question names Fog, its author and "from the
  marketplace" with the repository; Outlines' question says it runs code, with the warning under it; after Install, Fog's
  card says Installed and its row on Installed says "From the marketplace"; Cancel leaves Outlines as Install; the search
  and the Show menu keep their choice after the question closes ([Plugins](../../plugins.md#the-marketplace)).
- Probes: `back-out`: close the dialog and open it again, and check it opens on Installed with Fog, the tab's last
  choice kept; `out-of-order`: search for something nothing matches ("No plugins match."); `interrupt`: turn the phone
  sideways with the dialog open and back upright (wider than 700 it's a dialog again, and nothing is lost); `again`:
  tap Install on Fog twice (the second time the button says Installed and does nothing).
- Rated: no (touch only: no keyboard shows here)

### 29. Draw her selfie in lines
- Does: closes the dialog, picks Outlines in Choose characters (under Random, Best match and By shape), and tries each
  of its options: drags Threshold from 0 to 100, picks Lines → Box drawing and back, picks Elsewhere → Blank and back,
  and taps Clean up off and on; then switches Art style to Color ASCII and Monochrome ASCII and picks the Classic ramp
  preset, and goes back to ANSI.
- Expects: Choose characters lists Outlines after the built-ins, and its four options (Threshold, Lines, Elsewhere,
  Clean up) show under it in its own words, fitting the column; the picture redraws with `- | / \` along its edges
  ("Working out the characters…" may show for a moment on a large drawing), fewer lines at a higher Threshold and none
  at 100; Box drawing swaps in `─ │ ╱ ╲`; Blank leaves flat cells where there's no line; Clean up off keeps stray
  lines; in Color ASCII and Monochrome ASCII it still draws lines, and the Classic ramp changes only what's elsewhere;
  every option change is one undo step; and a pinch or a stroke afterward still works.
  ([Characters](../../characters.md#plugin-solvers)).
- Probes: `speed`: drag Threshold back and forth for two seconds, and check the frames stay in the `frame` budget
  after she lets go; `undo-redo`: undo three option changes from Actions → Undo, then Redo, and check the options and
  the picture go back together; `extremes`: Threshold 0 and 100 with Elsewhere on Blank; `interrupt`: turn the phone
  sideways while a change is working out, and back upright.
- Rated: no (touch only: no keyboard shows here)

### 30. Take Outlines away
- Does: with Outlines chosen, opens Plugins and taps Outlines's switch to Off; looks at Choose characters and at LAYERS;
  taps Export .png and looks at the dialog before closing it; then taps the switch back On, and reloads the page.
- Expects: with it Off the picture is By shape's, Choose characters says "Outlines is off. Showing By shape." and
  LAYERS' Base row has a ⚠; the export dialog says "Base shows By shape in place of its plugin solver."; back On the
  look comes back with the options she had; after the reload Outlines is still chosen with its options, and the picture
  is the same. Hosting a room isn't on a phone, so Phosphor refusing to host while a layer uses a plugin solver is
  walked in Juno's step 3, not here ([Characters](../../characters.md#plugin-solvers)).
- Probes: `interrupt`: open the app at `/?plugins=off` with Outlines chosen and check the note says "Plugins are off
  for this visit. Showing By shape.", and the Plugins dialog says plugins are off for this visit; `again`: switch it Off and On three times; `back-out`: tap Remove, then Cancel at "Remove Outlines?", and check
  Outlines is still chosen.
- Rated: no (touch only: no keyboard shows here)

### 31. Install a brush, a shape and a filter
- Does: opens the settings, taps Plugins and the Marketplace tab, picks Scripts in the Show menu; taps Install on Smear,
  reads the question and taps Install; then the same for Superformula and Aberration; taps the Installed tab.
- Expects: Scripts shows the cards of the plugins with a script (Outlines, Smear, Superformula and Aberration), not
  Midnight, Rain or Fog; each question names the plugin ("Install Smear 1.0.4?"), says it's Official and "Adds a script.",
  with "⚠ This plugin runs code in Phosphor. Install it only if you trust where it came from." under it, fitting 390
  wide; each card then says Installed; on Installed the rows say what each script added: "1 brush", "1 shape" and "1
  filter", with the Official badge ([The Marketplace](../../plugins.md#the-marketplace)).
- Probes: `back-out`: tap Cancel at Smear's question and check its card still says Install; `again`: tap Install on
  Superformula once it says Installed (nothing happens).
- Rated: no (touch only: no keyboard shows here)

### 32. Smear her selfie
- Does: closes the dialog, picks her layer ("doodles") in Layers, opens ⋯ in the toolbar and picks Smear; drags a finger
  across her face, from her cheek out past its edge; sets Strength to 100 and Size to 12 and smears again; picks Reads →
  This layer and smears where she hasn't painted, then from her own doodle out past its edge; undoes the last three
  strokes from Actions → Undo.
- Expects: Smear is in ⋯ after the built-in tools, with its own icon, named "Smear (Smear)"; chosen, its options show in
  the options row in its words (Size, Strength, Reads), fitting 390 wide or folding into the row's own ⋯; a drag drags
  the colors under it along the way her finger went, a color trailing several pixels on and thinning as it goes, softer
  at the brush's edge, and in ANSI the smeared cells take the
  new colors in characters her layer's Characters settings choose, as for any converted cell, with no ▄ half-blocks
  (where it crosses her caption, its letters stay and are tinted; Colors only's paint, [R5](../../model.md#r5-colors-only-makes-paint-of-whats-paint-to-it-and-tints-a-character-of-someones-own));
  a higher Strength carries a color further (at 100 the whole way); with This layer a stroke where the layer has no
  paint changes nothing, one from her doodle out drags its colors into the clear layer past its edge, and one from
  the clear into her doodle thins it there; each stroke is one undo step ([Writing a brush](../../plugins.md#writing-a-brush)).
- Probes: `out-of-order`: tap once without dragging (a press alone changes nothing); `extremes`: Strength 0 (nothing
  changes) and Size 20; `again`: reload and check Smear's Size and Strength are as she left them (they're kept in the
  browser, not the drawing).
- Rated: no (drawing)

### 33. Draw a Superformula star
- Does: opens Layers and taps Add vector layer (the tabs go to VECTOR); picks the Shape tool, taps Superformula in its
  row of shapes, and drags a finger from corner to corner; with the star still selected, sets Points to 8 and drags
  Round about; drags another star; undoes the second.
- Expects: the row of shapes shows Superformula's star after Rectangle, Ellipse and Polygon, named "Superformula
  (Superformula)"; chosen, Points, Pinch and Round follow the row, fitting 390 wide; the drag draws a soft five-pointed
  star live in the next shape's style, centered in the box she drags with a point straight up, and selected when she lets go; Points 8 turns that
  star eight-pointed in the same box, and Round reshapes it as she drags, each one undo step; the second star comes out
  eight-pointed with her Round, as the first now is; each star is one undo step, and a path the Node tool can edit
  ([Shape](../../vector.md#shape-u), [Writing a shape](../../plugins.md#writing-a-shape)).
- Probes: `back-out`: tap without dragging (it makes nothing); `extremes`: Points 1 and 20, and Pinch 1; `undo-redo`:
  undo the star from Actions → Undo, then Redo; `out-of-order`: move a point of the first star with the Node tool, pick
  the Shape tool and change Points (that star stays as she edited it).
- Rated: no (drawing)

### 34. Set Aberration, save, and come back to it
- Does: picks Base in Layers, opens the settings and scrolls past Image filters to Aberration; drags Distance to 3 and
  picks a new Left color from its swatch; folds the group; then taps Save project, keeps the name and presses Go, and
  reloads the page.
- Expects: Aberration's group is after Image filters, titled Aberration with a PLUGIN chip and its own Reset, with
  Distance and the two colors (the colors beside the Distance slider), fitting the column's width; at Distance 3 the
  picture's edges split into her two colors; folded, the group says how many of its options are on; Distance and the
  color are each one undo step; a .pho downloads; after the reload Aberration is still at 3 with her color, and the
  picture is the same ([Writing a filter](../../plugins.md#writing-a-filter)).
- Probes: `undo-redo`: undo the Distance change from Actions → Undo, then Redo; `out-of-order`: pick her layer and check
  Aberration's group isn't shown there (only with Base picked); `extremes`: Distance 10.
- Rated: yes, wants Go on the phone's keyboard

### 35. Switch Aberration off
- Does: opens Plugins and taps Aberration's switch to Off; reads Aberration's group in the settings; taps Export .png
  and looks at the dialog before closing it; then taps the switch back On.
- Expects: with it Off the picture shows without the split, and the group is dimmed and says "Aberration is off. The
  picture shows without it.", keeping her values; the export dialog says "Left out: the plugin filter Aberration.";
  back On the split comes back with her values
  ([A drawing without the filter](../../plugins.md#a-drawing-without-the-filter)).
- Probes: `interrupt`: open the app at `/?plugins=off` and check the group says the same; `back-out`: tap Remove on
  Aberration, then Cancel at "Remove Aberration?", and check the group is as it was; `again`: switch it Off and On three
  times.
- Rated: no (touch only: no keyboard shows here)

**Free time:** she'd open Midnight's homepage link and How plugins work, switch the language with Midnight in use, and tap Remove on Outlines to see what her drawing says when its plugin is gone (the note then says "Outlines isn't installed", the plugin's name as the drawing kept it, and the choice reads "Outlines (not here)"), and remove Aberration to see its group say "Aberration isn't installed. The picture shows without it.", then press Reset on it.

## Telling them something broke

### 36. Report an issue from the beta
- Does: on a beta or an alpha version (About, from the logo, shows a version ending in `-beta` or `-alpha`), opens the
  settings from ☰ and reads the small screen under the logo; taps **Report an issue**; writes a line in **What were you doing?**
  and two lines in **What went wrong?**; reads the line under the checkbox and the note above Send; taps **Send**. Fake
  the server's answer first, so nothing leaves the computer: `await social.fakeIssueReports(page)`, which returns the
  list the report lands in. On a version that isn't a beta there's no screen under the logo: open the step with
  `rated: false` and note it (not a finding).
- Expects: under the logo there's a small dark screen with rounded corners, as wide as the drawer's column: "▓▒░ BETA ░▒▓"
  ("ALPHA" on an alpha) lit in the theme's accent, in the art's blocky font, and "Report an issue" on the line under
  it, with scanlines across both, nothing cut off or squeezed, and nothing to dismiss it; the word flickers now and then
  and a faint bar rolls down the screen (with reduced motion on, neither moves); the form fills the phone's screen, with focus in the first box and the phone's
  keyboard up; each box has its count and stops at its most (2,000 and 4,000); Send is off until **What went wrong?** has
  words; the checkbox is ticked and its line names her drawing, its size and how many steps ("selfie.pho, 240 KB ·
  52 steps"); the note says "What you write will create a public issue on GitHub. Your drawing and steps will only
  be visible to Phosphor's developer.", and under it which Phosphor and browser go too; nothing is in the list before Send; after it
  the form says "Sent. Thank you. It's issue #312 on GitHub." with the number a link, and the list has one report with
  her words, a `drawing` named for her file and a `steps` file listing what she did (her taps as steps, and no line of
  it holding anything typed into SOCIAL); **Close** puts her back in the settings, on **Report an issue**
  ([Betas and reporting an issue](../../README.md#betas-and-reporting-an-issue)).
- Probes: `back-out`: write half a line, tap × (or the phone's Back), open it again, and check the half line is still
  there; `again`: untick the checkbox, send a second report, and check it has no `drawing` and no `steps`; `extremes`:
  paste 5,000 characters into **What went wrong?** and check the box holds the first 4,000, its count reads 4000 / 4000
  in its warning color, and Send still sends; `interrupt`: answer the next Send with a refusal (`social.fakeIssueReports(page, { answer: () => [429, { error:
  'rate-limited' }] })`) and check it says "Too many reports just now. Wait a while and try again." with her words
  still in the boxes.
- Rated: no (touch only: the phone's keyboard has no key that sends the form)

**Free time:** she'd turn the phone sideways with the form open, switch the language and read the form again, open
About from the logo to compare the version with the one the note names, and send a report with no drawing open from the
start screen (the line then says only how many steps, and "No drawing is open.").

## Known
