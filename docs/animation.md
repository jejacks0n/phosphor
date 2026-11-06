# Animation

Phosphor can turn a document into a movie: a row of frames, each drawn with the same tools as a still,
played back in place. The base layer (your image, with its pixels and pins) stays under every frame. Only the
edit layer changes from frame to frame.

## Turning it on

The **Animate** switch is on the tab bar, beside the color picker. Turning it on shows the bar under the
canvas, on the PIXEL and ANSI tabs. Turning it off hides the bar and keeps the frames; the canvas stays on the
frame it was on. A document opened with more than one frame has it on.

The switch is off in a room and on a canvas over 40,000 cells, and clicking or tapping it says why. A document with more than one
frame can't start a room.

## The bar

Left to right: play and pause, step back and forward, which frame you're on, the scrubber, **Add frame** (a frame of
film with a plus), a menu to move or delete the frame, on VECTOR **Keys** (a diamond, lit while the Keys panel is open;
see [Tweens](#tweens)), frames per second, this frame's hold, and **Ghost** (a ghost, lit while it's on) with its
strength beside it. On a narrow screen the bar takes two lines: the frame you're on, the scrubber, the menus and **Keys**
first, then play and the steps with the timing and **Ghost**.

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

Each part that changes is a row: its name; **◀** and **▶**, which show the part's previous and next key; and between
them **◇**, which keys the part on the frame showing with the value it has there (lit **◆** when there's a key there,
which a click deletes). Then the lane: a diamond for each key, a bar where the part tweens (with its easing's curve in
the middle), a thin line where it holds, and a line across the lanes at the frame showing. A Duplicate's keys are drawn
in its color. Frames outside the shape's life (before it starts, after a Wipe or Duplicate without it, or after it's
erased) are dimmed. **+ Add key** offers the parts with no row, and keys the one you pick on the frame showing.

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

The easing goes to the tween leaving each selected key. A part's last key has no tween to ease, so with only last keys
selected the easing is off; a key that becomes its part's last (its next deleted) loses its easing, and undo brings it
back. The trash can (or Delete or Backspace, with the keys selected and the panel focused) deletes the selected keys:
each part then tweens from the key before to the key after, eased as the key before is. A shape's first key stays
(delete the shape for that), and so do a Duplicate's. Each of these is one undo step.

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

## The ghost

On a Blank frame, what's inherited shows dimmed on the PIXEL and ANSI tabs, in its own colors, so you can see what you're
drawing over. What you draw on this frame shows at full strength, as soon as you draw it. The ghost is only there to draw by:
it never plays and never reaches an export. What you draw stays solid even in exactly the color a cell inherited, and the
project file and autosave keep it that way; undoing that drawing dims it again. **Ghost** on the bar turns it off, and inherited cells show solid.

Cells the frame just before drew to stay ([Cells that stay on their frame](#cells-that-stay-on-their-frame)) aren't
inherited, so they show as a picture of that frame instead, dimmed over this one wherever this frame shows nothing. It's
only on screen: this frame's cells are its own, and **Ghost** off hides the picture too.

The slider beside **Ghost** sets how strong the ghost is, from 0% (it doesn't show) to 100% (solid). It starts at 35%, and this browser remembers it.

## Timing

One frames-per-second number holds for the whole movie (8 to begin with, 1 to 60). A frame with a **hold**, in seconds
(up to 60), stays that long instead of one tick. Playback loops.

## What's off with frames, and why

- **Merge down** and **Into the image**: they put one frame into the base, which is under all of them.
- **Rooms**: a room holds one still document, and frames don't travel.
- **Size**: at most 1,000 frames and 40,000 cells a frame, and 4 million cells across the frames, so a 200 x 200 canvas
  holds 100. The grid can only grow as far as the frames allow. Those keep a movie where every cell changes on every frame within
  what a browser tab can hold.

**Merge up** works on the frame showing, and **Bake** on every frame. Moving a slider changes every frame, since they all sit on the same base.
With a Color count palette, there's one palette for the whole movie, picked from every frame, so colors stay
put from frame to frame ([Layers](layers.md)). Dither touches the picture under the frames, which holds still, and the
shapes, which are dithered where each frame has them: with Floyd–Steinberg, a shape that moves can shift the pattern
below and to its right. Your frames' drawing is paint and keeps its own colors.

## Saving

A project file keeps the frames, their holds, the frames per second and the frame you were on, and autosave and
Versions do too. A copy of Phosphor from before animation opens such a file as a still, of the frame that was showing.
A file whose frames are damaged or too large opens that way too, and says so; saving it then keeps only the still. Going from frame to frame isn't an edit, so it doesn't count toward a new version.

## Exporting

The usual exports, .ans and .utf8ans, write the frame showing. With more than one frame there are four more:

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
