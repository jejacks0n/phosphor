# Priya: animates with vector shapes

## Who

Priya is a motion designer who works in After Effects and used Flash years ago. She found Phosphor through an ANSI
loop someone posted and wants to make her own. She knows keys, easing, motion paths, onion skins and symbols you step
into; she doesn't know CP437 or SAUCE and doesn't care to. She has used Phosphor's VECTOR tab a few times, but never
its animation.

## Why they're here

She wants a short looping scene of 24 frames: a ball that eases down and bounces, a spark that draws itself along a
curve with a dot riding its tip, a few hand-drawn pieces (art layers) that slide in, all over an imported SVG. Done is
a GIF to post and a .cast that plays the same in a terminal, and a .phosphor she can reopen and keep retiming, with
every key, easing and path where she left it.

## What they bring

- An SVG from her design tool: `svg/gradients.svg` (two rectangles, a circle and an ellipse with linear and radial
  gradients, 200 by 160), and `svg/belle-verriere-mark.svg` (nine paths) for a heavier import, from `tests/fixtures/`
  (`e2e.fixture`).
- To drop a file over the drawing: a headless browser can't drag from the desktop, so send the drop to the canvas
  with the file in it, as `tests/e2e/art-files.spec.js` does (a DataTransfer holding the file).
- The checks for her exports, from the README's Files: `terminal.castFinalCells(text)` for the .cast, compared with
  the app's cells on the last frame (`terminal.normalizeHidden` first); for the .gif, its first six bytes
  (`GIF89a`) and its size.
- Habits: keys first, then timing; scrubs constantly and undoes from wherever the scrubber is; drags keys around in the
  timeline instead of retyping them; reaches for After Effects' keys (J and K for the previous and next key, U to show
  the keys, F9 for easy ease) and Flash's (F6 for a key frame, Enter to play, double-click to step into a symbol).
- A desktop or a laptop with a mouse or a trackpad; on a tablet or phone, a finger.

## What they lean on

- The Animate switch, the bar under the canvas, Add frame, Frame actions, frames per second and hold
  ([The bar](../../animation.md#the-bar), [Timing](../../animation.md#timing)).
- VECTOR's Shape tool, the Pen, Vector select and the Node tool, Fill and Stroke
  ([Vector shapes](../../vector.md)), and importing SVG ([Importing SVG](../../vector.md#importing-svg)).
- Art layers: Make art layer, Edit art, Done ([Art layers](../../vector.md#art-layers)).
- The Keys panel: keys per part, easings, motion, values, key drags ([Tweens](../../animation.md#tweens),
  [The Keys panel](../../animation.md#the-keys-panel)).
- Start and End, Follow a path…, Along ▾, Guide ([Following a path](../../animation.md#following-a-path),
  [Following a path on VECTOR](../../vector.md#following-a-path)).
- The ghost and its box ([The ghost](../../animation.md#the-ghost)).
- Export .gif and Export .cast, Save project ([Exporting](../../animation.md#exporting)).

## What makes them give up

- A key that moves, loses its easing or vanishes when she undoes, scrubs or reopens the project.
- An export that doesn't match what played on screen: a frame missing, the timing wrong, a guide drawn.
- Undo that acts on a frame she isn't looking at without showing her, or that takes back more than one step.
- A timeline that stutters while she drags a key, so she can't judge the motion.

## Sizes

- A blank canvas at its default size: 80 columns by 25 lines (Dimensions 80 by 50), 2,000 cells.
- 24 frames at 12 frames per second (8 to begin with), the last held for 0.5 s: 48,000 cells across the frames.
- 12 items on one vector layer: the 4 shapes from `gradients.svg`, a ball, a curve, a spark line, two dots that follow
  them, and 3 art layers (each a few cells to a 10 by 4 block).
- Three cells layers at most (Base, Layer 1 and one more); one vector layer.
- Bigger: 160 columns by 50 lines (8,000 cells, 192,000 across 24 frames).
- At the edge: 40,000 cells a frame, the most animation holds; 201 by 200 lines (40,200 cells) is just past it.
- Exports: a .gif of a few hundred KB, a .cast under 1 MB, a .phosphor of a few hundred KB.

## Traits

All apply. She has no account and no partner. On a phone, the Keys panel has no values column and no ◀ or ▶
([The Keys panel](../../animation.md#the-keys-panel)), so the steps that type values are done by dragging and keying
on the frame showing instead, and the bar takes two lines.

## Script

Each `##` heading after this one, up to Known, is a section of the script. Steps are numbered through the whole
script. Every section ends with Free time.

## Setting up the scene

### 1. Start a canvas and turn Animate on
- Does: on the start screen, presses "Or start with a blank canvas", then turns on the Animate switch on the tab bar.
- Expects: an 80 by 25 black canvas opens on ANSI with Layer 1 picked; with Animate on, the bar shows under the canvas
  with play and pause, the steps, "1 / 1", the scrubber, Add frame, Frame actions, frames per second (8), Hold and
  Ghost ([The bar](../../animation.md#the-bar)); the shortcut list (`?`) gains its Animation keys (L, `,` and `.`, N).
- Probes: `again`: turn Animate off and on twice and check nothing is lost; `out-of-order`: on the start screen, before
  anything is open, try the Animate switch (it says "Open an image or start a canvas to animate.");
  `interrupt`: turn Animate off with the shortcut list open and check its Animation keys go.
- Rated: yes, wants a key for Animate (Tab to the switch, then Space, is the path today)

### 2. Draw the ball
- Does: presses + Vector layer in LAYERS, picks the Shape tool (U), chooses Ellipse, drags a circle near the top with
  Shift held, then gives it a Fill from the color box (Alt+F).
- Expects: "Vector 1" is added above Layer 1 and picked, the tabs become VECTOR and SAUCE, and the Keys button (a
  diamond) appears on the bar; the circle is selected, and the color goes to it as one undo step
  ([Shape](../../vector.md#shape-u), [Fill and Stroke](../../vector.md#fill-and-stroke)).
- Probes: `again`: draw a second circle right away, then delete it with Delete; `undo-redo`: undo the fill and the
  shape one at a time, redo both, then draw something and check redo is off.
- Rated: yes, wants U, then a key for Ellipse

### 3. Bring in my SVG
- Does: drops `gradients.svg` on the drawing and chooses Add to this drawing; scales the import down by a corner
  handle with Shift held.
- Expects: the question offers Add to this drawing and Open instead; its four shapes land on VECTOR in the frame
  showing, with their gradients, all selected with Vector select. At 200 by 160 the art is bigger than the 80 by 50
  canvas, so it's scaled down to fit inside it less a margin of 2 grid pixels (about 58 by 46), its proportions kept,
  and centered; check the margin. The whole import is one undo step ([Importing SVG](../../vector.md#importing-svg)).
- Probes: `back-out`: drop it and press Escape at the question, and check nothing came in; `extremes`: drop
  `belle-verriere-mark.svg` too, time it against the `file` budget, then undo it (one step) so the layer is back to
  its items; `free`: drop `gradients.svg` again and choose Open instead, check what happens to the canvas she had (it
  asks about unsaved changes first, or says what it replaced), and cancel that question; if it opened anyway, reopen
  her scene from "Pick up where you left off" and note it.
- Rated: yes, wants Cmd+O, then Enter on Add to this drawing

### 4. Draw a curve to follow, and a spark line
- Does: picks the Pen (P), clicks and drags a few smooth points across the canvas, and presses Enter to leave it an
  open curve; then draws a short second line the same way, for the spark.
- Expects: the path shows as a thin line while she draws, Enter leaves it open, stroked in its Stroke color or the
  foreground; each finished shape is selected and is one undo step ([Pen](../../vector.md#pen-p)).
- Probes: `undo-redo`: press Backspace mid-curve to take the last point away, then undo the finished curve and redo
  it; `interrupt`: halfway through a curve, switch to SAUCE and back (choosing another tab leaves it an open
  curve); `extremes`: a curve of 60 points clicked quickly.
- Rated: yes, wants P (the points themselves aren't rated)

### 5. Make three art layers
- Does: picks Layer 1, types a short word in Edit Mode, presses Escape, picks Select (M), selects the word and presses
  Make art layer; does the same twice more with a block of drawn cells (the Pencil) and a line of paint (the Brush).
- Expects: each piece moves into an art layer on Vector 1 (directly above Layer 1), the canvas looks the same, the
  view goes to VECTOR with it selected; it's one undo step each; with nothing drawn in the selection nothing happens
  ([Art layers](../../vector.md#art-layers)).
- Probes: `out-of-order`: press Make art layer with an empty selection; `undo-redo`: undo a Make art layer and check
  the cells are back on Layer 1, then redo it; `again`: make an art layer from a selection that overlaps one already
  made.
- Rated: yes, wants M, then a key for Make art layer

### 6. Step into an art layer and back out
- Does: on VECTOR, selects an art layer and presses Edit art (or double-clicks it, as she would a Flash symbol), types
  a letter and paints a stroke, then presses Done; steps in again and presses Escape.
- Expects: the view goes to ANSI with "Editing art layer" and Done; the rest of the drawing shows dimmed; the
  animation bar and its keys are off while she's in ("Changing the picture or the frame would leave the dimmed drawing
  out of date"); an edit inside changes the layer on every frame it's on; Done or Escape goes back to VECTOR with the
  layer selected ([Editing an art layer](../../vector.md#editing-an-art-layer)).
- Probes: `out-of-order`: inside, press N, L and `.` and check each does nothing and says why (the bar's title);
  `undo-redo`: undo inside back to where she stepped in, and once more (it goes no further); `interrupt`: switch to
  SAUCE while inside, which steps out, and check what she drew stayed.
- Rated: yes, wants Enter to step in and Escape to step out

**Free time:** she'd duplicate Vector 1 from its ⋯ menu to see if the art layers come too, copy an art layer with
Cmd+C and paste it on VECTOR, try Join with an art layer selected (it's off), and turn Snap to Cells on before drawing
a Polygon.

## Frames

### 7. Add frames up to 24
- Does: on frame 1, presses N and holds it, then taps it until the bar says "24 / 24".
- Expects: each N adds a Blank frame after the one showing (of the same kind) and shows it; holding N adds several;
  the scrubber shows a short tick for each frame with nothing drawn; every frame shows the scene, carried from frame 1
  ([The bar](../../animation.md#the-bar)). Each frame swap stays under 60 ms (the README's Budgets).
- Probes: `speed`: hold N for two seconds with `qa.frames` and count what it added; `undo-redo`: undo the last three
  frames, then redo them; `extremes`: hold N on to 60 frames, then undo back to 24 and time the undos.
- Rated: yes, wants N

### 8. Add a Duplicate and a Wipe
- Does: on frame 12, opens Add frame and chooses Duplicate; on frame 20 chooses Wipe; then deletes both with Frame
  actions → Delete frame.
- Expects: the menu offers Blank, Duplicate and Wipe, each with a line saying what it is; a Duplicate shows everything
  solid and starts with its own copy of every shape, so no tween runs across it; a Wipe starts clean with no
  ghost; the scrubber shows a block for a Duplicate and a diamond for a Wipe
  ([The three kinds of frame](../../animation.md#the-three-kinds-of-frame)).
- Probes: `again`: on the Duplicate, press N and check it adds another Duplicate (the same kind), then delete it;
  `undo-redo`: undo the delete of the Duplicate and check its block comes back on the scrubber, then redo it.
- Rated: yes, wants a key for each kind (Shift+N, say)

### 9. Move a frame
- Does: on frame 5, opens Frame actions and presses Move later twice, then Move earlier once.
- Expects: the frame keeps its changes, not its look: a Blank moved sits over different frames, so what it shows can
  change; Move earlier is off on frame 1 and Move later on the last
  ([Carrying and owning a cell](../../animation.md#carrying-and-owning-a-cell)).
- Probes: `out-of-order`: on frame 1, look at Move earlier (off); `undo-redo`: undo the three moves, redo them, and
  check the scrubber's ticks follow.
- Rated: yes, wants a key to move the frame (Alt+Shift+`,` and `.`, say)

### 10. Set the timing
- Does: types 12 in frames per second, then on frame 24 types a hold of 0.5.
- Expects: the movie plays at 12 frames a second, with frame 24 staying half a second
  ([Timing](../../animation.md#timing)); each change is kept, and the project keeps it.
- Probes: `extremes`: type 0, 61 and 999 in frames per second (it holds to 1 to 60) and a hold of 61 and -1;
  `back-out`: type a number and press Escape or click away before Enter, and check what's kept; `undo-redo`: undo after
  the hold and check it takes back the edit before it and leaves the timing (timing isn't an undo step), then redo it. Then put back 12 frames per second and frame 24's hold of 0.5, which
  steps 26 and 29 rely on.
- Rated: yes, wants Tab to frames per second (typing the number is content)

**Free time:** she'd look for a way to select several frames and move them at once, set New cells to Stay on their
frame and type a word on three frames, look for a way to copy a frame's timing to another, and drag the scrubber with
the arrow keys once it has focus.

## Tweens and keys

### 11. Make the ball fall
- Does: on frame 1, selects the ball; opens the Keys panel with Keys on the bar; steps to frame 13 and drags the ball
  down; on the Transform row clicks the key on frame 1 and chooses Ease in from the easing menu.
- Expects: the Keys panel sits over the bar, its frames lined up with the scrubber's; moving the ball on frame 13
  keys only its Transform there; with Ease in on the key, frames 2 to 12 show it on its way down, starting slow; the
  lane shows a bar with the easing's curve; each change is one undo step ([Tweens](../../animation.md#tweens)).
- Probes: `undo-redo`: undo the easing, then the move, then redo both and check the frames between come back;
  `out-of-order`: with no shape selected, look at the panel ("Select a shape to see its keys."); `interrupt`: fold the
  panel with ▾ and reload, and check it comes back folded.
- Rated: yes, wants a key to open the Keys panel, then F9 or a key for the easing

### 12. Bounce it back up
- Does: on frame 24, drags the ball back to the top; selects the frame 13 key and chooses Ease out; then on frame 7
  gives the ball a new Fill color, and gives the Fill row's frame 1 key Linear.
- Expects: the ball rises from 13 to 24, starting fast; the frame 7 fill keys only Fill, so the ball still falls in
  one ease from 1 to 13 without slowing at 7; the color holds and jumps at frame 7 until its frame 1 key has an
  easing, then tweens from frame 1 to 7 ([Tweens](../../animation.md#tweens): each part tweens on its own).
- Probes: `again`: give it a second fill on frame 18, then undo it; `undo-redo`: undo the frame 7 fill and check only
  the Fill row's key goes, with the Transform tween as it was, then redo it; `extremes`: choose Elastic on the frame 1
  Transform key and check the ball springs past frame 13's place and back, then put Ease in back (steps 14 to 17 rely
  on it).
- Rated: yes, wants Alt+F, then the arrows to the color

### 13. Type a value into a key
- Does: on frame 13, in the Transform row's values, types 30 in Y and 45 in Turn, pressing Enter after each.
- Expects: each typed value keys the part on the frame showing, as if she had edited the shape there; undo takes it
  back; the Turn tweens the short way round ([The Keys panel](../../animation.md#the-keys-panel)).
- Probes: `extremes`: type -99999, 99999, an empty value and letters in X, undoing each that took; `back-out`: type
  a value and press Escape before Enter; `undo-redo`: undo the Turn, redo it, then type a W and check redo is off.
- Rated: yes, wants Tab to the field (the number is content)

### 14. Drag a key to retime it
- Does: drags the ball's Transform key from frame 13 to frame 10, timing the drag with `qa.frames`; then Shift-clicks
  two keys and drags them together; then drags one and presses Escape before letting go.
- Expects: the key moves a frame at a time, its easing with it, the tweens on either side stretch or shrink, and the
  canvas follows while she drags; frames stay in the `frame` budget; selected keys keep their spacing; Escape puts the
  keys back; a drag is one undo step ([The Keys panel](../../animation.md#the-keys-panel)).
- Probes: `speed`: drag a key back and forth across the whole lane for two seconds with `qa.frames`; `extremes`: drop
  a key onto another key of the same row (it replaces it) and drag the first key past the shape's next key (it stops a
  frame short), undoing both; `back-out`: Escape mid-drag.
- Rated: yes, wants a key to move the selected keys by a frame (Alt+arrows, say)

### 15. Give the move a stepped look
- Does: selects the ball's eased Transform key on frame 1 and sets the motion menu to By whole cells, then By half
  cells.
- Expects: on its way the ball jumps from cell to cell (or half cell), while size, turn and color still tween
  smoothly; the menu is off unless an eased Transform key is selected; one undo step
  ([Tweens](../../animation.md#tweens)).
- Probes: `out-of-order`: select a Fill key and look at the motion menu (off); `undo-redo`: undo it back to Smoothly.
- Rated: yes, wants Tab to the motion menu then the arrows

### 16. Slide an art layer in
- Does: selects an art layer, steps to frame 8, moves it with the arrow keys, then selects its frame 1 Transform key
  and gives it Ease out.
- Expects: an art layer's only rows are Transform and Stack (and Along while it follows a path); its X and Y are its
  top left, X a column, Y in grid pixels; on the frames between it lands on whole cells; the motion menu is off for it
  ([Tweens](../../animation.md#tweens), [Following a path](../../animation.md#following-a-path)).
- Probes: `extremes`: type an X of 3.5 (it lands on the nearest whole cell) and a Y past the canvas, then undo the Y;
  `speed`: press the arrow keys ten times quickly with Shift held and count the undo steps it takes.
- Rated: yes, wants the arrow keys

### 17. Delete keys
- Does: selects two keys in the panel, focuses the panel and presses Delete; then selects the ball's first key and
  presses Delete.
- Expects: each part then tweens from the key before to the key after, eased as the key before is; a shape's first
  key stays ("delete the shape for that"); a key that becomes its part's last loses its easing, and undo brings it back
  ([The Keys panel](../../animation.md#the-keys-panel)).
- Probes: `undo-redo`: undo the delete and check the easing came back; `out-of-order`: press Delete with no key
  selected and the panel focused (nothing, and no shape deleted).
- Rated: yes, wants Delete

### 18. Look at 24 frames in the panel
- Does: with the ball selected, zooms the Keys panel with − and +, and with Cmd held over the lanes and the wheel;
  steps with `,` and `.` and plays with L, watching the panel follow.
- Expects: when frames are tight the numbers thin out to every 5th or 10th; stepping and playing keep the frame
  showing in view; the scrubber shows the stretch in view as a band; the zoom is remembered
  ([The Keys panel](../../animation.md#the-keys-panel)).
- Probes: `extremes`: zoom out as far as it goes and in as far as it goes; `interrupt`: press N while zoomed in and
  check the new frame shows in view.
- Rated: yes, wants a key to zoom the panel (Cmd+`-` and Cmd+`=` over it, say)

**Free time:** she'd press J and K expecting the previous and next key, select every key on a frame by clicking its
number, try Mixed by selecting keys with different easings, and Shift-click a key on another row.

## Motion paths

### 19. Draw the spark on
- Does: selects the spark line; adds a Start key at 0 and an End key at 0 on frame 1, and End at 100 on frame 15,
  with Ease in and out; then drags the End handle on the canvas on frame 8.
- Expects: Start and End are offered after Style in + Add key; the line grows along its length over frames 1 to 15;
  with one shape selected, a round handle sits on its outline at each, the stretch not drawn shows dashed, and dragging
  shows a label such as "End 55%"; a drag is one undo step ([The Keys panel](../../animation.md#the-keys-panel)).
- Probes: `extremes`: type 150 and -10 into End (held to 0 to 100); `undo-redo`: undo the handle drag and check the
  frame 8 key goes; `again`: key Start from 0 to 100 over frames 1 to 20 so the streak runs off.
- Rated: yes, wants a key for + Add key, then the arrows

### 20. Have the dot follow the curve
- Does: draws a small dot; with it selected, chooses + Add key → Follow a path… and clicks the curve; keys Along at 0%
  on frame 1 and 100% on frame 24, and gives the frame 1 Along key Linear.
- Expects: the hint says "Follow a path: click the line or shape to follow. Esc cancels", and the curve shows thick
  under the pointer; the dot's middle goes onto the curve; an Along row appears, whatever its keys; the dot moves along
  the whole curve over the frames at a steady speed; the dot's X and Y can't be typed while it follows
  ([Following a path](../../vector.md#following-a-path)).
- Probes: `back-out`: choose Follow a path… and press Escape, then again and click empty canvas; `out-of-order`: try to
  have the curve follow the dot after (a shape that others follow can't follow one: a message says so) and pick an art
  layer as the path; `undo-redo`: undo the link and redo it.
- Rated: yes, wants a key for Follow a path…

### 21. Ride the spark's tip
- Does: draws a second dot, links it to the spark line, then opens Along ▾ and chooses With the line's end; then
  makes the spark line a Guide.
- Expects: the dot sits on the spark's End on every frame whatever its own Along keys say (they're kept); its value is
  grayed; Guide hides the line in the cells and the exports and shows it on VECTOR as a thin dashed outline
  ([Following a path](../../animation.md#following-a-path)). The vector layer now holds its 12 items.
- Probes: `interrupt`: change the spark's End easing to Elastic, check the dot still rides the tip, and put it back;
  `undo-redo`: undo Guide and the ride, one at a time, then redo both; `free`: try to select the Guide by clicking
  inside it (only its outline takes a click).
- Rated: yes, wants a key for the Along ▾ menu

### 22. Face the path, and step a follower by keys
- Does: has the ellipse from the SVG follow the curve too (Follow a path…), chooses Along ▾ → Face the path; then, on
  frame 10, presses the right arrow five times and Shift+right twice.
- Expects: the curve now has two followers; the ellipse turns the way the curve runs, its own turn on top; each arrow
  steps it along by 1% (10% with Shift), keyed on the frame showing; Stop following lets go of the path on every
  frame, and undo brings the link back ([Following a path](../../vector.md#following-a-path)).
- Probes: `speed`: hold the right arrow for two seconds and check how many steps undo needs; `out-of-order`: choose
  Face the path for an art layer (it's for shapes only).
- Rated: yes, wants the arrow keys

**Free time:** she'd move the curve on frame 12 to see the dot follow it, copy the dot and paste it alone (it follows
the original), have an art layer follow the curve as well (it lands on whole cells), and turn Animate off to
see what happens to a Follow a path… under way.

## Ghosts

### 23. Draw by the ghost
- Does: picks Layer 1, draws a few cells with the Pencil on frame 5, steps to frame 6 (a Blank) and draws a few more
  beside them, looking at the dimmed ones; opens Ghost's box, moves its strength to 70%, then unchecks it.
- Expects: inherited cells show dimmed on ANSI in their own colors; what she draws on this frame shows at full
  strength; the strength starts at 35% and this browser remembers it; Ghost off shows inherited cells solid; the ghost
  never plays or reaches an export ([The ghost](../../animation.md#the-ghost)).
- Probes: `extremes`: strength at 0% and 100%; `interrupt`: reload and check the strength came back; `back-out`: open
  the box and press Escape, and check where focus went.
- Rated: yes, wants a key for Ghost on and off

### 24. Check the outlines VECTOR carries
- Does: on VECTOR, on frame 6, looks at the dimmed outlines of the shapes the frame carries, then turns Animate off and
  on.
- Expects: VECTOR shows the outlines of carried shapes dimmed; Animate off hides them, with the bar, the Keys panel and
  the ghost, and keeps the frames ([Turning it on](../../animation.md#turning-it-on)).
- Probes: `interrupt`: turn Animate off with the Keys panel open and a key selected, and back on, and check the
  selection; `again`: off and on three times quickly.
- Rated: yes, wants a key for Animate

**Free time:** she'd look for an onion skin of the next frame as well as the last, set Ghost off and draw on a Wipe,
type a word with New cells set to Stay on their frame and look for its ghost on the frame after, and see whether the
ghost shows while playing (it doesn't).

## Playing it back

### 25. Scrub, then undo where I am
- Does: moves the ball on frame 13; scrubs to frame 3; presses Cmd+Z; then Shift+Cmd+Z; then steps with `,` and `.`
  across the ends.
- Expects: undo goes back to the frame the edit was made on and undoes it there (the bar shows frame 13), and redo does
  it again; going from frame to frame isn't an edit, so it isn't undone; `,` and `.` wrap around the ends
  ([Carrying and owning a cell](../../animation.md#carrying-and-owning-a-cell)).
- Probes: `undo-redo`: undo three edits on three frames from a fourth, then redo them, then draw and check redo is off;
  `speed`: press Cmd+Z thirty times as fast as the page takes it, then Shift+Cmd+Z thirty times, and check the scene
  ends as it started; `interrupt`: press Cmd+Z while it plays (it pauses first, then undoes).
- Rated: yes, wants Cmd+Z, and `,` and `.`

### 26. Play it while retiming
- Does: presses L to play; while it plays, drags one of the ball's Transform keys a frame earlier in the Keys panel,
  timing the drag with `qa.frames`; then presses a tool key, and presses L again.
- Expects: playback loops at 12 frames a second with frame 24 held half a second; starting to drag or any other key
  pauses first, so the change lands on the frame showing; frames stay in the `frame` budget and frame swaps under 60
  ms (the README's Budgets) ([The bar](../../animation.md#the-bar)).
- Probes: `speed`: press L ten times quickly; `interrupt`: open the shortcut list (`?`) while it plays.
- Rated: yes, wants L

### 27. Change a setting while it plays
- Does: plays, then picks CGA (16 colors) in Color palette and moves Dither, and stops.
- Expects: it goes on playing with the change, from the frame showing, after a moment to build the frames again; every
  frame takes the palette (they sit on the same base); the shapes dither where each frame has them
  ([What's off with frames, and why](../../animation.md#whats-off-with-frames-and-why)).
- Probes: `undo-redo`: undo while it plays and check it takes back the last edit and leaves the palette (a palette isn't an
  undo step), then redo; `extremes`: Limited count at its least while it plays.
- Rated: yes, wants Tab to Color palette then the arrows

**Free time:** she'd press Enter or Space expecting play as in Flash, look for a loop range or ping-pong, step with
Alt+`,` while typing in Edit Mode, and Bake with the sliders moved to see every frame change.

## Getting it out

### 28. Export a GIF
- Does: presses Export .gif in the left column, keeps the name and saves; checks the file.
- Expects: Export .gif shows only with more than one frame and Animate on; the dialog says "Looping animated GIF
  rendered in your current display font"; the download is a GIF (`GIF89a`) of the art as it plays, the guide not drawn
  and the ghost absent; it saves within the `file` budget ([Exporting](../../animation.md#exporting)).
- Probes: `again`: export twice and check the names differ; `back-out`: change the name, press Escape, reopen;
  `extremes`: name it with emoji and slashes.
- Rated: yes, wants a key for Export .gif

### 29. Export a .cast and play it in the terminal
- Does: presses Export .cast and saves; reads the file and plays it in the headless terminal with
  `terminal.castFinalCells(text)`; compares that screen with the app's cells on frame 24, the last.
- Expects: the cast's header is as wide and tall as the art; its events are spaced at 1/12 s with frame 24 held 0.5 s
  ("exact timing"); its last screen matches frame 24 cell for cell (after `terminal.normalizeHidden`), with the guide
  not drawn ([Exporting](../../animation.md#exporting)).
- Probes: `out-of-order`: hide Layer 1 and export, and check it's left out, then show it again; `again`: give frames
  22 and 24 holds with 23's at 0, export and check the timing, then type the holds back (22 and 23 at 0, 24 at 0.5): holds aren't undo steps.
- Rated: yes, wants a key for Export .cast

### 30. Save it and reopen it
- Does: presses Cmd+S and saves; starts a New project (if it asks about unsaved changes, that's a browser confirm:
  handle it with `page.once('dialog')`); opens the .phosphor with Choose a file.
- Expects: everything comes back: 24 frames, their holds, 12 frames per second, the frame she was on, every shape and
  art layer with its keys per part, easings, motions, Start and End, every follower's path and Along, the Guide, Face
  the path; Animate is on, since it has more than one frame ([Saving](../../animation.md#saving),
  [Saving](../../vector.md#saving)).
- Probes: `interrupt`: reload before reopening and check "Pick up where you left off" brings the movie back;
  `undo-redo`: after reopening press Cmd+Z (nothing to undo).
- Rated: yes, wants Cmd+S, then Enter

### 31. Make it bigger
- Does: sets Dimensions to 160 columns by 100 pixel rows; plays; then tries 201 by 400.
- Expects: with shapes drawn the canvas grows on the right and bottom and shapes keep their place; playback stays in
  budget at 8,000 cells a frame; past 40,000 cells a frame the grid won't grow ("The grid can
  only grow as far as the frames allow"); check what tells her why
  ([What's off with frames, and why](../../animation.md#whats-off-with-frames-and-why)).
- Probes: `extremes`: grow to the most the frames allow and take `qa.memory`; `undo-redo`: undo after the size change and
  check it takes back the edit before it (a size change isn't an undo step, and mustn't forget the steps before it),
  then redo it and check every frame's keys are where they were.
- Rated: yes, wants Tab to Dimensions (typing the number is content)

**Free time:** she'd export the GIF again at 160 by 50 and time it, export animated .utf8ans and play it in the
terminal, look for a PNG sequence or an MP4, try Merge down with frames (it's off: a layer is under every frame) and
say whether its title says why, and open the GIF in a second page to watch it loop.

## Known
