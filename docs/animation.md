# Animation

Phosphor can turn a document into a movie: a row of frames, each drawn with the same tools as a still,
played back in place. The base layer (your image, with its pixels and pins) stays under every frame. Only the
edit layer changes from frame to frame.

## Turning it on

The **Animate** switch is on the tab bar, beside the color picker. Turning it on shows the bar under the
canvas, on the PIXEL and ANSI tabs. Turning it off keeps the frames, and the canvas stays on the frame it was on, but
everything of animation goes out of sight: the bar, the Keys panel, the ghost, the animated exports, the Animation
shortcuts and their keys, and VECTOR's outlines of the shapes a Blank frame carries. A document opened with more than one
frame has it on.

The switch is off in a room and on a canvas over 40,000 cells, and clicking or tapping it says why. A document with more than one
frame can't start a room.

## The bar

Left to right: play and pause, step back and forward, which frame you're on, the scrubber, **Add frame** (a frame of
film with a plus), a menu to move or delete the frame, frames per second, this frame's hold, **Ghost** (a ghost, lit
while it's on, opening a box that turns it on and off and sets its strength), and on VECTOR **Keys** (a diamond, lit
while the Keys panel is open; see [Tweens](#tweens)). On a narrow screen the bar takes two lines: the frame you're on,
the scrubber and the menus first, then play and the steps with the timing, **Ghost** and **Keys**.

The marks under the scrubber say what each frame is: a tall tick where something was drawn, a short tick where
nothing was, a block for a Duplicate, and a diamond for a Wipe. With a shape selected, its tweens show too: a band
from key frame to key frame, with a dot for each frame between.

The keys, with Animate on and not while you're typing: **L** plays and pauses, **,** and **.** step, wrapping around the
ends, and **N** adds a frame after the one showing, of the same kind (hold it to add several). **Alt+,** and **Alt+.** (Option on a Mac) step too, and work while you're typing, where , and . type: the cursor
stays where it is, so you can type on one frame, step, and go on typing on the next. Any other key pauses first, and so does starting to draw, so what you do lands on the frame showing. Changing a setting while it plays (a slider, the art style) goes on playing with the change, from the frame showing, after a moment to build the frames again.

## The three kinds of frame

| Kind | While drawing it | When it plays | A later fix on an earlier frame |
| --- | --- | --- | --- |
| **Blank** | Earlier frames show as a ghost | They show solid | Carries through |
| **Duplicate** | Everything shows solid, as yours | The same | Stops here |
| **Wipe** | A clean slate, with no ghost | Earlier frames are gone | Stops here |

## Carrying and owning a cell

A frame keeps only what changed on it. On a Blank, everything else carries from the frame before, so fixing a
cell on frame 2 fixes it on every frame after that hasn't changed that cell itself.

Changing a cell makes the frame own it, all of it: its character, its colors and both halves' paint. A fix on an
earlier frame stops at a frame that owns the cell. Erasing is a change too, and it carries forward like any other.

Editing a cell back to exactly what the frame before shows returns it to inherited: the frame no longer owns it, and fixes
carry through it again.

**Clear layer** on a frame means empty: it stops the carry of the picked layer there. Nothing that layer has on earlier
frames shows on the cleared frame, or on the Blank frames after it, not even what you draw on those earlier frames
later, and no ghost of it shows either. What you then draw on the cleared frame is its own and carries on as usual.
The frame stays a Blank, so the other layers and the shapes still carry into it. Undo puts the carry back.

Moving a frame keeps its changes, not its look. A Blank moved earlier or later sits over different frames, so
what it shows can change.

Undo works across frames: it goes back to the frame the edit was made on and undoes it there.

### Cells that stay on their frame

Carrying suits a picture that mostly stays put while something changes over it. For things that move (a word
over a bouncing ball, a figure drawn pose by pose) it leaves a trail: what you typed on frame 5 is still there on
frame 6. **Frame actions** on the bar has **New cells**: **Carry on to later frames** (the default, as above) or
**Stay on their frame**. It's how what you draw from then on behaves, like a brush's setting: each cell keeps the way
it was drawn, so switching it never changes anything already drawn, and one movie can have both: a background that
carries through every frame, with a word drawn to stay on each.

A cell drawn to stay shows on its frame only. The frame after shows what was there before it: type P over a carried
HELLO's second L to make HELPO, and the next frame shows HELLO again. Drawing over a staying cell to carry makes it carry
from then on, and drawing over a carried one to stay covers it on that frame alone. Undo and redo put each cell back the
way it was drawn, whatever New cells says now. The picture under the cells and the shapes carry on as ever.

On the frame after, a staying cell shows as the ghost to draw by ([The ghost](#the-ghost)), but it isn't that frame's:
selecting, moving or copying there doesn't pick it up, it doesn't play, and with **Ghost** off it doesn't show. To keep
a character on the next frame too, type it there again. A Duplicate copies what its frame shows, staying cells and all,
but not what they were over: after it, those spots show what's under the edit layer. Deleting a frame keeps the frames
after it as they were, cells that stay or not. Projects and autosave keep which cells stay; a project saved when this
was one choice for the whole movie opens with every cell staying, if that's what it said.

Shapes ([Vector shapes](vector.md)) belong to frames by their parts. A Blank frame carries the shapes before it;
changing one there makes that frame a **key frame** for it, and the frame keeps only the parts you changed:

- its position, size and turn
- its outline (its points, and the fill rule)
- its fill
- its stroke color
- its stroke width
- its stroke's style (cap, join and alignment)
- where it's stacked

Everything else still comes from the frames before, and follows them. Move a ball on frames 7 and 13, then give it a
gradient on frame 1: every frame shows the gradient, and the moves stay where you made them. A part you set on a key
frame stays its own until you change it back to what the frame would show without it.

The frame a shape first appears on keeps all of it, and so does a Duplicate, which starts with its own copy of every
shape; a Wipe starts with none. Deleting a shape carries forward too. If the frames a key frame carries from go (the
shape deleted before it, say), it keeps the shape as it last looked there.

## Tweens

A tween moves a shape ([Vector shapes](vector.md)) from one of its keys to the next, so you don't draw the frames
between. A **key** sets one part of a shape on one frame; the parts are Transform (where it is, its size and turn),
Outline, Fill, Stroke, Width, Style (caps, joins and alignment) and Stack (its place among the shapes). A shape's first
frame keys every part, and so does a Duplicate or Wipe that has it; changing a shape on a frame keys only the parts you
changed. Place a ball on frame 1, add Blank frames, move it down on frame 7, select it, and in the **Keys** panel click
the Transform key on frame 1 and choose an easing: frames 2 to 6 now show it on its way down.

### The Keys panel

On VECTOR with Animate on, the Keys panel sits over the bar, its frames lined up with the scrubber's. **Keys** on the bar
opens and folds it, as does the **▾** at its top left; it stays as you left it. It shows the selected shape (with several
selected, the first); with none, it says so.

Where the panel is too narrow for that and its buttons beside it (a tablet with the side panel open, say), the top line
stays one line: the part names, **+ Add key** and Delete keep their room, the easing menu shows only its curve, and the
lanes and their ruler narrow to what's left, still lined up with each other, scrolling and zooming as below. A row's
values scroll sideways when they don't all fit.

With more frames than fit at a usable width (about 14 pixels a frame, 10 on a phone), the lanes become a window onto
the movie: scroll it with the wheel or trackpad (Shift-wheel too) or by dragging the ruler of frame numbers where
there's no number, and zoom with **−** and **+** on the top line, or Cmd/Ctrl-wheel over the lanes (or a trackpad
pinch, in Chrome and Firefox), around the pointer. Zoomed out until every frame fits again, the lanes line up with the scrubber once more. When frames are
tight their numbers thin out to every 5th or 10th. Stepping, playing and scrubbing keep the frame showing in view, and
the scrubber, still the whole movie, shows the stretch in view as a band; drag the band to scroll the panel. A key
dragged to either end of the window scrolls it, faster the closer you go, and lands on a frame in view. The zoom
is remembered, like the fold. While the movie plays, the rows are those of the frame playing, so past a Wipe they show
the shape's life there.

Each part that changes is a row: its name; **◀** and **▶**, which show the part's previous and next key; and between
them **◇**, which keys the part on the frame showing with the value it has there (lit **◆** when there's a key there,
which a click deletes). Then the lane: a diamond for each key, a bar where the part tweens (with its easing's curve in
the middle), a thin line where it holds, and a line across the lanes at the frame showing. A Duplicate's keys are drawn
in its color. Frames outside the shape's life (before it starts, after a Wipe or Duplicate without it, or after it's
erased) are dimmed. **+ Add key** offers the parts with no row, and keys the one you pick on the frame showing.

On a wide screen each row ends with the part's value on the frame showing. Transform has **X** and **Y** (where the
middle of the shape is, in grid pixels), **Turn** (degrees), and **W** and **H** (its width and height in percent,
along the shape's own axes, so a turned shape stretches along itself; a negative H flips it). Width is a number, Fill
and Stroke are color chips that open the color box, Outline and Style are text (the Node tool edits them) and Stack is
the shape's place among the shapes, as "3 of 5". Type a value and press Enter, or leave the field, and the part is keyed
on the frame showing with it, as if you had edited the shape there; undo takes it back.

**Start** and **End** are the stretch of a shape's outline that is drawn, as percents of its length (0 to 100; a typed
value is held to that). They come after Style in **+ Add key**, and a shape has them like its other parts, keyed and
tweened on their own. With one shape selected on VECTOR that has a Start or End row, a round handle sits on its outline
at each, above the selection box, and the stretch not drawn shows dashed in the shape's stroke color. Drag a handle
along the outline in Vector select and the part is set to the share of the outline nearest the pointer, keyed on the
frame showing, with a label (such as "End 55%") while you drag; a drag is one undo step. Where a handle sits over one of
the box's handles, the Start and End handle wins, and a click in the same place again picks the one beneath. The
handles show only with Animate on, as the rows do.

To draw a line on: key **Start** at 0 on its first frame and **End** from 0 on that frame to 100% on a later one, eased
as you like, and the line grows out along its length. To run a streak along it: key **End** from 0 to 100% over frames 1
to 15, and **Start** from 0 to 100% over frames 1 to 20, so the streak's head leads and its tail follows and the line is
gone by frame 20.

### Following a path

A shape or an art layer can follow a path ([Following a path](vector.md#following-a-path)): with it selected, **+ Add
key** ends with **Follow a path…**, and a click on the line or shape to follow links them. A follower always has an
**Along** row, whatever its keys: how far along the path its middle is, as a percent of the path's length (measured
along its curves, so a steady Along moves it at a steady speed). Key it and ease it like the others: Along at 0% on
frame 1 and 100% on frame 20 moves the follower along the whole path over those frames. On a closed path, past 100%
comes around again, so an elastic tween springs around the loop and back; on an open one it stops at the ends. The
row's value is a typed percent; dragging the follower along its path on VECTOR, or the arrow keys, key it on the frame
showing too.

The row's name, **Along ▾**, is the menu that sets how it follows: **Moves**, **Face the path**, **Motion** and **Stop
following**. Moving **With the line's end** (or start), the follower sits on the path's End (or Start) on every frame
whatever its own Along keys say: they're kept, but don't apply while it rides. Its value shows that tip's percent,
grayed out, and dragging it does nothing.

To ride a dot on a spark's tip: draw the spark's line and key its **End** from 0 to 100% (its **Start** too, for a
streak that runs off, as above). Draw a dot, choose **Follow a path…** and click the line, then **Along ▾ → With the
line's end**. The dot stays on the tip whatever you do to the line's timing or easing. Make the line a **Guide** and
only the dot shows, moving along the curve.

To move a shape along a curve: draw the curve, have the shape follow it, key Along at 0% on the first frame and 100%
on the last, and choose an easing; **Face the path** turns it as the curve turns, and **Guide** hides the curve.

An [art layer](vector.md#art-layers) has only two parts, Transform and Stack (and Along while it follows a path), so
those are its only rows and all **+ Add key** offers, with **Follow a path…**. Its Transform has just **X** and **Y**,
its top left corner: X a column, Y in grid pixels, two to a line. A value typed between cells lands on the nearest
whole cell.

On a phone there's no values column and no **◀** or **▶**: a **◇** (lit **◆** where there's a key) ends each row and does
what the one between them does on a wide screen. The top line is the **▾**, **+ Add key**, then the easing, the motion and
Delete; the ruler, with **−** and **+**, has the line under it. The diamonds are taller, for a finger.

Click a diamond to select it and show its frame; Shift-click adds or removes one; click a frame number to select every
key on that frame; click an empty lane to select none. Then, along the top:

| Easing | The part, from the key to its next |
| --- | --- |
| **No tween** | Stays as the key has it, then jumps (as without tweens) |
| **Linear** | Moves at one speed |
| **Ease in** | Starts slow and speeds up, as a ball falls |
| **Ease out** | Starts fast and slows down, as a ball rising to its peak |
| **Ease in and out** | Speeds up, then slows down |
| **Elastic** | Springs past the next key and back, settling there, as a ball on a rubber band |

The easing goes to the tween leaving each selected key. With keys selected that have different easings, the menu says **Mixed** and checks none. A part's last key has no tween to ease, so with only last keys
selected the easing is off; a key that becomes its part's last (its next deleted) loses its easing, and undo brings it
back. The trash can (or Delete or Backspace, with the keys selected and the panel focused) deletes the selected keys:
each part then tweens from the key before to the key after, eased as the key before is. A shape's first key stays
(delete the shape for that), and so do a Duplicate's. Each of these is one undo step.

Drag a diamond along its row to move the key, a frame at a time; selected keys move together, keeping their spacing,
and dragging a frame number moves every key on that frame. A finger drags them too. The easing goes with the key, the
tweens on either side stretch or shrink, and the canvas follows as you drag. A key can pass the part's other keys, and
dropped on one, it replaces it. Keys stay within the shape's life, and a Duplicate's don't move. Dragging the first key
of any row moves when the shape appears, and every part's first key with it: dragged later, the frames it leaves no
longer show the shape (if the frame showing was one of them, the frame it now begins on shows); dragged earlier, it goes
back as far as the frame after the Wipe, or the Duplicate without it, before it. It stops a frame short of the shape's
next key. Escape, before you let go, puts the keys back. A drag is one undo step.

What tweens: the shape's position, size and rotation (it turns the short way round, so more than half a turn between two
key frames goes back the other way), its points and curve handles when both key frames have as many in each outline,
its fill and stroke colors, gradients of the same kind with as many stops, and its stroke width. What can't go part way
(a different number of points, a solid fill against a gradient, the cap, join or alignment) changes half way.

A tween's timing goes by frames: half way through is the middle frame, whatever the holds. It runs only across Blank
frames that don't change the shape; a Duplicate or a Wipe ends it. Change a key frame and the frames between follow.
Changing a part on a frame between keys it there: its tween splits in two, both halves with its easing.
Tweens play, and the exports show them; projects and autosave keep them.

Each part of a shape tweens on its own: from a key frame that set it to the next one that sets it, eased as that first
key frame says for it, and a key frame between that sets only other parts changes nothing about it. A ball moving from
frame 1 to frame 13 with Ease in and out, with a point of its outline dragged on frame 7: frame 7 sets only the outline,
and the ball still moves in one ease from frame 1 to 13, without slowing on frame 7, while the outline goes there and
back. A part with no easing on its key holds until its next key, then jumps. Projects saved before each part had its
own easing keep each key frame's easing, on the parts that key frame set.

For a steadier, older look, the menu beside the easing sets how a move goes: **Smoothly** (the default), **By half
cells** or **By whole cells**. Snapped, a shape on its way jumps from cell to cell (or half cell), the way characters
move on a terminal, rather than gliding and smearing across the cells it straddles. It's kept on a Transform key, for
the tween leaving it, so it's off unless an eased Transform key is selected (one undo step), and a ball can snap on its
way down and glide back up. Splitting a tween keeps it on both halves. Only the move snaps: size,
rotation, colors and the rest still tween smoothly, and key frames stay where you put them. Projects and autosave keep
it.

An art layer always moves a whole cell at a time, so its hand-drawn characters never smear: on each frame between its
keys it sits on the whole cell nearest where its easing puts it. The motion menu is off for it.

## The ghost

On a Blank frame, what's inherited shows dimmed on the PIXEL and ANSI tabs, in its own colors, so you can see what you're
drawing over. What you draw on this frame shows at full strength, as soon as you draw it. The ghost is only there to draw by:
it never plays and never reaches an export. What you draw stays solid even in exactly the color a cell inherited, and the
project file and autosave keep it that way; undoing that drawing dims it again. **Ghost** on the bar opens a box: its checkbox turns it off, and inherited cells show solid; the slider beside it sets how strongly they dim.

Cells the frame just before drew to stay ([Cells that stay on their frame](#cells-that-stay-on-their-frame)) aren't
inherited, so they show as a picture of that frame instead, dimmed over this one wherever this frame shows nothing. It's
only on screen: this frame's cells are its own, and **Ghost** off hides the picture too.

The slider beside **Ghost** sets how strong the ghost is, from 0% (it doesn't show) to 100% (solid). It starts at 35%, and this browser remembers it.

## Timing

One frames-per-second number holds for the whole movie (8 to begin with, 1 to 60). A frame with a **hold**, in seconds
(up to 60), stays that long instead of one tick. Playback loops.

## What's off with frames, and why

- **Merge down** and **Into the image**: they put one frame into the layer under it, which is under all of them.
- **Rooms**: a room holds one still document, and frames don't travel.
- **Size**: at most 1,000 frames and 40,000 cells a frame, and 4 million cells across the frames, so a 200 x 200 canvas
  holds 100. The grid can only grow as far as the frames allow. Those keep a movie where every cell changes on every frame within
  what a browser tab can hold.

**Bake** works on every frame. **Flatten** is off, since it replaces the picture under every frame. Moving a slider changes every frame, since they all sit on the same base.
With a Color count palette, there's one palette for the whole movie, picked from every frame, so colors stay
put from frame to frame ([Layers](layers.md)). Dither touches the picture under the frames, which holds still, and the
shapes, which are dithered where each frame has them: with Floyd–Steinberg, a shape that moves can shift the pattern
below and to its right. Your frames' drawing is paint and keeps its own colors.

## Saving

A project file keeps the frames, their holds, the frames per second and the frame you were on, and autosave and
Versions do too. A copy of Phosphor from before animation opens such a file as a still, of the frame that was showing.
A file whose frames are damaged or too large opens that way too, and says so; saving it then keeps only the still. Going from frame to frame isn't an edit, so it doesn't count toward a new version.

## Exporting

The usual exports, .ans, .utf8ans and .png, write the frame showing. With more than one frame and Animate on there are four more:

- **Animated .ans** (an ANSiMation): the art draws itself in a viewer or terminal, frame by frame. A file like this has no
  clock, so timing is lost and its speed depends on the viewer. It moves the cursor instead of scrolling, so
  rows past the bottom of the terminal can't be reached; the dialog says so above 80 x 25. It's CP437, like any
  .ans, and the dialog lists the characters on any frame that it has to replace.
- **Animated .utf8ans**: the same, in UTF-8, for a modern terminal. Every character is kept, so there's nothing to
  replace. `cat` writes it faster than the eye can follow; something that slows it down plays it, like
  `pv -qL 20000 art.utf8ans`.
- **.cast** (an asciinema recording): exact timing, and every character, in a terminal or on the web. It
  needs a terminal or player at least as wide and tall as the art.
- **.gif**: a looping picture of the art in its font, for anywhere an image goes. It holds 256 colors, one
  palette for the whole movie, and browsers slow delays under 2 hundredths of a second. The largest is 500
  million pixels across the frames; the dialog says if it's over.
