# Animation

Phosphor can turn a document into a movie: a row of frames, each drawn with the same tools as a still,
played back in place. The base layer (your image, with its pixels and pins) stays under every frame. Only the
edit layer changes from frame to frame.

## Turning it on

The **Animate** switch is on the tab bar, beside the color picker. Turning it on shows the bar under the
canvas, on the PIXEL and ANSI tabs. Turning it off hides the bar and keeps the frames; the canvas stays on the
frame it was on. A document opened with more than one frame has it on.

The switch is off, and says why, in a room and on a canvas over 40,000 cells. A document with more than one
frame can't start a room.

## The bar

Left to right: play and pause, step back and forward, which frame you're on, the scrubber, **Add frame** (a frame of
film with a plus), a menu to move or delete the frame, frames per second, this frame's hold, and **Ghost** (a ghost, lit
while it's on) with its strength beside it. On a narrow screen the controls from frames per second on take a second line.

The marks under the scrubber say what each frame is: a tall tick where something was drawn, a short tick where
nothing was, a block for a Duplicate, and a diamond for a Wipe.

The keys, with Animate on and not while you're typing: **L** plays and pauses, **,** and **.** step, wrapping around the
ends. Any other key pauses first, and so does starting to draw, so what you do lands on the frame showing.

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

## The ghost

On a Blank frame, what's inherited shows dimmed on the PIXEL and ANSI tabs, in its own colors, so you can see what you're
drawing over. What you draw on this frame shows at full strength, as soon as you draw it. The ghost is only there to draw by:
it never plays and never reaches an export. What you draw stays solid even in exactly the color a cell inherited, and the
project file and autosave keep it that way; undoing that drawing dims it again. **Ghost** on the bar turns it off, and inherited cells show solid. The slider
beside it sets how strong the ghost is, from 0% (inherited cells don't show) to 100% (solid). It starts at 35%, and this browser remembers it.

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
put from frame to frame ([Layers](layers.md)).

## Saving

A project file keeps the frames, their holds, the frames per second and the frame you were on, and autosave and
Versions do too. A copy of Phosphor from before animation opens such a file as a still, of the frame that was showing.
A file whose frames are damaged or too large opens that way too, and says so; saving it then keeps only the still. Going from frame to frame isn't an edit, so it doesn't count toward a new version.

## Exporting

The usual exports, .ans and .utf8ans, write the frame showing. With more than one frame there are three more:

- **Animated .ans** (an ANSiMation): the art draws itself in a viewer or terminal, frame by frame. A file like this has no
  clock, so timing is lost and its speed depends on the viewer. It moves the cursor instead of scrolling, so
  rows past the bottom of the terminal can't be reached; the dialog says so above 80 x 25. It's CP437, like any
  .ans, and the dialog lists the characters on any frame that it has to replace.
- **.cast** (an asciinema recording): exact timing, and every character, in a terminal or on the web. It
  needs a terminal or player at least as wide and tall as the art.
- **.gif**: a looping picture of the art in its font, for anywhere an image goes. It holds 256 colors, one
  palette for the whole movie, and browsers slow delays under 2 hundredths of a second. The largest is 500
  million pixels across the frames; the dialog says if it's over.
