# Animation

Phosphor lets you create frame-by-frame text animations. You can draw each frame by hand, animate vector shapes using keyframes and tweens, and export your animation as a GIF, asciinema recording, or animated ANSI file.

The base layer (your background image, with its pixels and pins) stays fixed beneath all animation frames. Your drawing layers and vector shapes change across frames, and every frame is drawn with the same tools as a still.

---

## Turning It On

- **Turn on**: Toggle the **Animate** switch on the tab bar, to the right of the tabs. The animation bar appears under the canvas on the PIXEL, ANSI, and VECTOR tabs.
- **Turn off**: Toggle the switch off. Your frames are kept and the canvas stays on the frame it was on, but everything of animation is hidden until you turn Animate back on: the bar, the Keys panel, the ghost, the animated exports, the Animation keys and their group in the shortcuts list (`?`), and VECTOR's dimmed outlines of the shapes a Blank frame carries.
- **Opening a movie**: A document opened with more than one frame has Animate on.
- **When it's off limits**: The switch is unavailable without an image or canvas, in a room, and on a canvas over 40,000 cells. Clicking or tapping it says why. A document with more than one frame can't start a room.

---

## The Bar

Left to right:

- **Play / Pause**: Start or pause playback. Playback loops.
- **Step back / forward**: Step one frame back or forward, wrapping around the ends.
- **Frame indicator and scrubber**: Shows which frame you're on (such as `3 / 12`). Click or drag along the scrubber to jump to any frame.
- **Add frame** (a frame of film with a plus): Adds a frame after the one showing, of the kind you pick ([The Three Kinds of Frame](#the-three-kinds-of-frame)).
- **Frame actions** (three squares): **Move earlier**, **Move later**, **Delete frame**, and the **New cells** setting ([Cells That Stay on Their Frame](#cells-that-stay-on-their-frame)).
- **fps**: Frames per second for the whole movie ([Timing](#timing)).
- **Hold**: How long this frame stays, in seconds.
- **Ghost** (a ghost, lit while it's on): Opens a box with **Show ghost** and the **Ghost opacity** slider ([The Ghost](#the-ghost)).
- **Keys** (a diamond, lit while the panel is open): On VECTOR only, opens and folds the Keys panel ([The Keys Panel](#the-keys-panel)).

Play and the steps are off until there are two frames. When the canvas can't take another frame, Add frame is off and the bar says why.

On a narrow screen the bar takes two lines: the frame indicator, the scrubber and the two menus first, then play and the steps with fps and Hold, with **Ghost** and **Keys** at the end of the line.

### Scrubber Marks

The marks under the scrubber say what each frame is:

- **Tall tick**: Something was drawn on this frame.
- **Short tick**: Nothing was.
- **Block**: A Duplicate.
- **Diamond**: A Wipe.

With a shape selected, its tweens show too: a band from key frame to key frame, with a dot for each frame between. While the Keys panel shows only part of a long movie, the stretch in view shows as a band you can drag.

### Playing

- **Pausing to draw**: Any other key pauses first, and so does starting to draw, so what you do lands on the frame showing.
- **Changing settings while playing**: Moving a slider or changing the art style keeps playing with the change, from the frame showing, after a moment to build the frames again.
- **Inside an art layer**: The bar's frame controls and the Animation keys are off. Exit the art layer to change frames.
- **The screen stays on** while it plays, where the browser allows it, and can sleep again once it's paused.

---

## The Three Kinds of Frame

Choose a kind from **Add frame** (or press **N** for another of the kind showing):

| Kind | While drawing it | When it plays | A later fix on an earlier frame |
| :--- | :--- | :--- | :--- |
| **Blank** | Earlier frames show dimmed, as the ghost | Earlier frames show solid | Carries through |
| **Duplicate** | A copy of everything the frame showing shows, solid and its own | The same | Stops here |
| **Wipe** | A clean slate, with no ghost | Earlier frames are gone | Stops here |

The first frame acts as a Wipe: there's nothing before it.

---

## Carrying and Owning a Cell

A frame keeps only what changed on it. On a Blank frame, everything else carries from the frame before, so fixing a cell on frame 2 fixes it on every later frame that hasn't changed that cell itself.

- **Owning a cell**: When you paint, erase, or type in a cell on a frame, that frame owns all of it: its character, its colors, and both halves' paint. A fix on an earlier frame stops at a frame that owns the cell.
- **Erasing**: Erasing is a change too, and it carries forward like any other.
- **Giving a cell back**: Edit a cell back to exactly what the frame before shows and it's inherited again: the frame no longer owns it, and fixes carry through it.
- **Clear layer**: On a Blank frame, **Clear layer** stops the carry of the picked layer there. Nothing that layer has on earlier frames shows on the cleared frame or the Blank frames after it, not even what you draw on those earlier frames later, and no ghost of it shows either. What you then draw on the cleared frame is its own and carries on as usual. The frame stays a Blank, so other layers and the shapes still carry into it. Undo puts the carry back.
- **Moving a frame**: A frame keeps its changes, not its look. A Blank moved earlier or later sits over different frames, so what it shows can change.
- **Deleting a frame**: The frames after it look the same as before.
- **Undo**: Undo works across frames. It goes back to the frame the edit was made on and undoes it there.

### Cells That Stay on Their Frame

Carrying suits a picture that mostly stays put while something changes over it. For things that move (a word over a bouncing ball, a figure drawn pose by pose) it leaves a trail: what you typed on frame 5 is still there on frame 6.

**Frame actions** has a **New cells** setting:

- **Carry forward to later frames** (default): Cells you draw carry on, as above.
- **Keep on this frame only**: Cells you draw show on their frame only.

It works like a brush setting. Each cell keeps the way it was drawn, so switching it never changes anything already drawn, and one movie can have both: a background that carries through every frame, with a word drawn to stay on each.

- **What the next frame shows**: The frame after a staying cell shows what was there before it. Type P over a carried HELLO's second L to make HELPO, and the next frame shows HELLO again.
- **Drawing over**: Drawing over a staying cell with Carry forward makes it carry from then on. Drawing over a carried cell with Keep on this frame only covers it on that frame alone.
- **Undo and redo**: Each cell comes back the way it was drawn, whatever New cells says now.
- **On the frame after**: A staying cell shows as the ghost to draw by ([The Ghost](#the-ghost)), but it isn't that frame's. Selecting, moving, or copying there doesn't pick it up, it doesn't play, and with the ghost off it doesn't show. To keep a character on the next frame too, type it there again.
- **Duplicates**: A Duplicate copies what its frame shows, staying cells and all, but not what they were over. After it, those spots show what's under the drawing layer.
- **Deleting a frame**: The frames after it stay as they were, staying cells or not.
- **What carries regardless**: The picture under the cells and the shapes carry on as ever.

### Shapes on Frames

Shapes ([Vector Shapes](vector.md)) belong to frames by their parts. A Blank frame carries the shapes before it. Changing a shape there makes that frame a **key frame** for it, and the frame keeps only the parts you changed:

- **Transform**: Its position, size, and rotation.
- **Outline**: Its points and the fill rule.
- **Fill**: Its fill color or gradient.
- **Stroke**: Its stroke color or gradient.
- **Width**: Its stroke width.
- **Style**: Its stroke's cap, join, and alignment.
- **Start** and **End**: How much of its outline is drawn.
- **Along**: How far along its path it is, while it follows one.
- **Stack**: Where it sits among the shapes.

Everything else still comes from the frames before, and follows them. Move a ball on frames 7 and 13, then give it a gradient on frame 1: every frame shows the gradient, and the moves stay where you made them. A part you set on a key frame stays its own until you change it back to what the frame would show without it.

- **Whole shapes**: The frame a shape first appears on keeps all of it. So does a Duplicate, which starts with its own copy of every shape. A Wipe starts with none.
- **Deleting a shape**: Deleting carries forward too. If the frames a key frame carries from go (the shape deleted before it, say), it keeps the shape as it last looked there.

---

## Tweens

On the **VECTOR** tab, a tween moves a shape from one of its keys to the next, so you don't draw the frames between. It works out movement, scaling, rotation, and color changes for you.

A **key** sets one part of a shape on one frame ([Shapes on Frames](#shapes-on-frames)). A shape's first frame keys every part, and so does a Duplicate or Wipe that has it. Changing a shape on a frame keys only the parts you changed.

**Example**: Place a ball on frame 1, add Blank frames, and move it down on frame 7. Select it, click its Transform key on frame 1 in the **Keys** panel, and choose an easing: frames 2 to 6 now show it on its way down.

### What Tweens

- **Smoothly**: Position, size, and rotation (it turns the short way round, so more than half a turn between two key frames goes back the other way); points and curve handles when both key frames have as many points in each outline; fill and stroke colors; gradients of the same kind with as many stops; stroke width; Start, End, and Along.
- **Half way**: What can't go part way (a different number of points, a solid fill against a gradient, the cap, join, or alignment, the fill rule, the stacking) changes half way.

### How Tweens Run

- **Timing by frames**: Half way through is the middle frame, whatever the holds.
- **Where they run**: Only across Blank frames that don't change the shape. A Duplicate or a Wipe ends a tween.
- **Following the keys**: Change a key frame and the frames between follow.
- **Splitting**: Changing a part on a frame between keys keys it there. Its tween splits in two, both halves with its easing.
- **Each part on its own**: A part tweens from a key frame that sets it to the next one that sets it, eased as that first key says. A key frame between that sets only other parts changes nothing about it. A ball moving from frame 1 to 13 with Ease in and out, with a point of its outline dragged on frame 7, still moves in one ease from 1 to 13, without slowing on frame 7, while the outline goes there and back.
- **No easing**: A part with no easing on its key holds until its next key, then jumps.
- **Everywhere**: Tweens play, and the exports show them.

### Easings

Easing controls how a part moves from a key to its next:

- **No tween**: Stays as the key has it, then jumps when the next key arrives.
- **Linear**: Moves at one steady speed.
- **Ease in**: Starts slowly and speeds up, as a ball falls.
- **Ease out**: Starts quickly and slows to a stop, as a ball rising to its peak.
- **Ease in and out**: Speeds up, then slows down.
- **Elastic**: Springs past the next key and back, settling there, as a ball on a rubber band.

### Motion (Snapping to Cells)

For a steadier, retro look, the menu beside the easing sets how a move goes:

- **Smoothly** (default): Glides across pixel positions.
- **By half cells**: Jumps from half cell to half cell.
- **By whole cells**: Jumps from cell to cell, the way characters move on a terminal, rather than smearing across the cells it straddles.

Motion is kept on a Transform key, for the tween leaving it, so the menu is on only while an eased Transform key is selected, and a ball can snap on its way down and glide back up. Splitting a tween keeps it on both halves. Only the move snaps: size, rotation, colors, and the rest still tween smoothly, and key frames stay where you put them.

An [art layer](vector.md#art-layers) always moves a whole cell at a time, so its hand-drawn characters never smear: on each frame between its keys it sits on the whole cell nearest where its easing puts it. The motion menu is off for it.

### The Keys Panel

On VECTOR with Animate on, the Keys panel sits over the bar, its frames lined up with the scrubber's. **Keys** on the bar opens and folds it, as does the **▾** at its top left, and it stays as you left it. It shows the selected shape (with several selected, the first). With none, it says "Select a shape to view its keyframes."

**Rows**: Each part that changes in the shape's life is a row:

- **Name**: The part.
- **◀** and **▶**: Go to the part's previous and next key.
- **◇**: Keys the part on the frame showing with the value it has there. It's lit **◆** when there's a key there, and a click deletes it.
- **Lane**: A diamond for each key, a bar where the part tweens (with its easing's curve in the middle), a thin line where it holds, and a line across the lanes at the frame showing. A Duplicate's keys are drawn in its color. Frames outside the shape's life (before it starts, after a Wipe or Duplicate without it, or after it's erased) are dimmed.

**+ Add key** offers the parts with no row, and keys the one you pick on the frame showing. While the movie plays, the rows are those of the frame playing, so past a Wipe they show the shape's life there.

**Values**: On a wide screen each row ends with the part's value on the frame showing:

- **Transform**: **X** and **Y** (the middle of the shape, in grid pixels), **Turn** (degrees), and **W** and **H** (width and height in percent, along the shape's own axes, so a turned shape stretches along itself; a negative H flips it).
- **Width**: A number, in grid pixels.
- **Fill** and **Stroke**: Color chips that open the color box.
- **Outline** and **Style**: Text, such as "4 points · edit with Node tool". The Node tool edits them.
- **Start**, **End**, and **Along**: Percents.
- **Stack**: The shape's place among the shapes, such as "3 of 5".

Type a value and press Enter, or leave the field, and the part is keyed on the frame showing with it, as if you had edited the shape there. Undo takes it back.

**Selecting keys**:

- **Click a diamond**: Selects it and shows its frame.
- **Shift-click**: Adds or removes one.
- **Click a frame number**: Selects every key on that frame.
- **Click an empty lane**: Selects none.

**Easing and deleting**: The easing menu on the top line sets the tween leaving each selected key. With keys selected that have different easings it says **Mixed**. A part's last key has no tween to ease, so with only last keys selected the easing is off; a key that becomes its part's last (its next deleted) loses its easing, and undo brings it back. The trash can (or **Delete** or **Backspace**, with keys selected and the panel focused) deletes the selected keys: each part then tweens from the key before to the key after, eased as the key before is. A shape's first key stays (delete the shape for that), and so do a Duplicate's. Each of these is one undo step.

**Dragging keys**:

- **Moving**: Drag a diamond along its row to move the key, a frame at a time. Selected keys move together, keeping their spacing, and dragging a frame number moves every key on that frame. A finger drags them too.
- **What follows**: The easing goes with the key, the tweens on either side stretch or shrink, and the canvas follows as you drag.
- **Passing and replacing**: A key can pass the part's other keys, and dropped on one, it replaces it.
- **Limits**: Keys stay within the shape's life, and a Duplicate's don't move.
- **The first key**: Dragging the first key of any row moves when the shape appears, and every part's first key with it. Dragged later, the frames it leaves no longer show the shape (if the frame showing was one of them, the frame it now begins on shows). Dragged earlier, it goes back as far as the frame after the Wipe, or the Duplicate without it, before it. It stops a frame short of the shape's next key.
- **Canceling**: Press **Escape** before you let go to put the keys back. A drag is one undo step.

**Long movies**: With more frames than fit at a usable width (about 14 pixels a frame, 10 on a phone), the lanes become a window onto the movie:

- **Scrolling**: Use the wheel or trackpad (Shift-wheel too), or drag the ruler of frame numbers where there's no number. On the scrubber, drag the band that shows the stretch in view.
- **Zooming**: Use **−** and **+** on the top line, or Cmd/Ctrl-wheel over the lanes (or a trackpad pinch, in Chrome and Firefox), around the pointer. Zoomed out until every frame fits again, the lanes line up with the scrubber once more. The zoom is remembered, like the fold.
- **Frame numbers**: When frames are tight their numbers thin out to every 5th or 10th. The frame showing always has its number.
- **Staying in view**: Stepping, playing, and scrubbing keep the frame showing in view. A key dragged to either end of the window scrolls it, faster the closer you go, and lands on a frame in view.

**Narrow panels**: Where the panel is too narrow for its lanes and its buttons beside them (a tablet with the side panel open, say), the top line stays one line: the part names, **+ Add key** and the trash can keep their room, the easing menu shows only its curve, and the lanes and their ruler narrow to what's left, still lined up with each other, scrolling and zooming as above. A row whose values don't fit beside it (Transform's, usually) has a button there instead that opens them in a box over the row. The box stays open while you type, and closes with Escape or a click outside it.

**On a phone**: There's no values column and no **◀** or **▶**. A **◇** (lit **◆** where there's a key) ends each row and does what the middle one does on a wide screen, and the button beside it opens the row's values in a box. The top line is the **▾**, **+ Add key**, then the easing, the motion, and the trash can; the ruler, with **−** and **+**, has the line under it. The diamonds are taller, for a finger.

### Start and End

**Start** and **End** are the stretch of a shape's outline that is drawn, as percents of its length (0 to 100; a typed value is held to that). They come after Style in **+ Add key**, and are keyed and tweened like any other part.

- **Handles**: With one shape selected on VECTOR that has a Start or End row, a round handle sits on its outline at each, above the selection box, and the stretch not drawn shows dashed in the shape's stroke color. The handles show only with Animate on and more than one frame.
- **Dragging**: Drag a handle along the outline with Vector select and the part is set to the share of the outline nearest the pointer, keyed on the frame showing, with a label (such as "End 55%") while you drag. A drag is one undo step.
- **Overlapping handles**: Where a Start or End handle sits over one of the box's handles, it wins, and a click in the same place again picks the one beneath.

**Draw a line on**: Key **Start** at 0 on its first frame, and **End** from 0 on that frame to 100% on a later one, eased as you like. The line grows out along its length.

**Run a streak along a line**: Key **End** from 0 to 100% over frames 1 to 15, and **Start** from 0 to 100% over frames 1 to 20. The streak's head leads, its tail follows, and the line is gone by frame 20.

### Following a Path

A shape or an art layer can follow a path ([Following a Path](vector.md#following-a-path)). With it selected, **+ Add key** ends with **Follow a path…**; click the line or shape to follow to link them (Esc cancels).

- **Along**: A follower always has an **Along** row, whatever its keys: how far along the path its middle is, as a percent of the path's length. It's measured along the path's curves, so a steady Along moves it at a steady speed. Key it and ease it like the others: Along at 0% on frame 1 and 100% on frame 20 moves the follower along the whole path over those frames.
- **Closed and open paths**: On a closed path, past 100% comes around again, so an elastic tween springs around the loop and back. On an open one it stops at the ends.
- **Moving it by hand**: Dragging the follower on VECTOR slides it along its path, and the arrow keys step its Along by 1% (Shift: 10%). Both key Along on the frame showing. Its X and Y in the Transform row aren't typed: the path decides them.

The row's name, **Along ▾**, is the menu that sets how it follows:

- **Move along path using its own keys** (default): Along's keys place it.
- **Stay with line start** / **Stay with line end**: The follower sits on the path's Start (or End) on every frame, whatever its own Along keys say. They're kept, but don't apply while it rides. Its Along value shows that tip's percent, grayed out, and dragging it does nothing.
- **Rotate to face path**: Turns the shape as the path turns, on top of its own turn. Not for an art layer.
- **Motion**: **Smoothly**, **By half cells**, or **By whole cells**, for how its middle moves along the path.
- **Stop following path**: Unlinks it.

A path that others follow, or one marked as a guide, has a **Guide** button on the panel's top line: a guide is a reference path that doesn't draw. An art layer can't be a path, a follower can't be followed, and a path others follow can't follow another.

**Ride a dot on a spark's tip**: Draw the spark's line and key its **End** from 0 to 100% (its **Start** too, for a streak that runs off). Draw a dot, choose **Follow a path…** and click the line, then **Along ▾ → Stay with line end**. The dot stays on the tip whatever you do to the line's timing or easing. Make the line a **Guide** and only the dot shows, moving along the curve.

**Move a shape along a curve**: Draw the curve, have the shape follow it, key Along at 0% on the first frame and 100% on the last, and choose an easing. **Rotate to face path** turns it as the curve turns, and **Guide** hides the curve.

### Art Layers

An [art layer](vector.md#art-layers) has only two parts, Transform and Stack (and Along while it follows a path), so those are its only rows and all **+ Add key** offers, with **Follow a path…**. Its Transform has just **X** and **Y**, its top left corner: X in columns, Y in grid pixels, two to a line. A value typed between cells lands on the nearest whole cell.

---

## The Ghost

Onion skinning shows earlier frames dimmed so you can use them as drawing references:

- **Where it shows**: On a Blank frame, what's inherited shows dimmed on the PIXEL and ANSI tabs, in its own colors, so you can see what you're drawing over. On VECTOR, the shapes a Blank frame carries show dimmed outlines (whether or not the ghost is on).
- **What you draw**: What you draw on this frame shows at full strength as soon as you draw it, even in exactly the color a cell inherited. The project file and autosave keep it that way; undoing that drawing dims it again.
- **Staying cells**: Cells the frame before drew to stay ([Cells That Stay on Their Frame](#cells-that-stay-on-their-frame)) aren't inherited, so they show as a picture of that frame instead, dimmed over this one wherever this frame shows nothing. It's only on screen: this frame's cells are its own.
- **Only a guide**: The ghost never plays and never reaches an export.

**Ghost** on the bar opens a box:

- **Show ghost** (on by default): Turn it off and inherited cells show solid, and the picture of staying cells goes.
- **Ghost opacity**: From 0% (it doesn't show) to 100% (solid). It starts at 35%, and this browser remembers it.

---

## Timing

- **fps**: One frames-per-second number holds for the whole movie: 8 to begin with, from 1 to 60.
- **Hold**: A frame with a hold, in seconds (up to 60), stays that long instead of one tick. A hold of 0 advances on the normal frame tick.
- **Looping**: Playback loops.

---

## What's Off With Frames, and Why

- **Merge down**: Off for every layer while there's more than one frame: merging into the base would put one frame's drawing under all of them, since the base is shared.
- **Flatten**: Off, since it replaces the picture under every frame.
- **Rooms**: A room holds one still document, and frames don't travel.
- **Size**: At most 1,000 frames, 40,000 cells a frame, and 4 million cells across the frames, so a 200 × 200 canvas holds 100 frames. The grid can only grow as far as the frames allow. Those limits keep a movie where every cell changes on every frame within what a browser tab can hold.

What still works across frames:

- **Bake**: Works on every frame. A movie's shapes stay shapes, in baked colors.
- **Sliders**: Moving a slider changes every frame, since they all sit on the same base.
- **Color count**: With a Color count palette, there's one palette for the whole movie, picked from every frame, so colors stay put from frame to frame.
- **Dither**: Touches the picture under the frames, which holds still, and the shapes, which are dithered where each frame has them. With Floyd–Steinberg, a shape that moves can shift the pattern below and to its right. Your frames' painting keeps its own colors.

---

## Saving

- **Project files**: A `.phosphor` project keeps the frames, their holds, the frames per second, the frame you were on, the tweens, easings and motion, and which cells stay. Autosave and Versions keep them too.
- **Not an edit**: Going from frame to frame isn't an edit, so it doesn't count toward a new version.
- **Older copies of Phosphor**: A copy from before animation opens such a file as a still, of the frame that was showing.
- **Damaged files**: A file whose frames are damaged or too large opens as a still too, and says so. Saving it then keeps only the still.
- **Older projects**: A project saved before each part had its own easing keeps each key frame's easing on the parts that key frame set. One saved when New cells was one choice for the whole movie opens with every cell staying, if that's what it said.

---

## Exporting

The still exports (**ANS**, **UTF-8 ANS**, and **PNG**) write the frame showing. With more than one frame and Animate on, the Export dialog's **Animated** group has up to five more (GIF is picked first):

- **GIF**: A looping picture of the art in your display font, for anywhere an image goes. It holds 256 colors, one palette for the whole movie. A frame shorter than 2 hundredths of a second is written as 2, since browsers slow anything shorter. The largest is 500 million pixels across the frames; exporting a larger one says so. While it's written, a bar beside the buttons shows how many frames are done.
- **Video** (`.mp4`): The art in your display font as a video, for the sites and phones that take a video better than a GIF. Every color is kept, though a video is compressed, so colors can shift slightly. Each pixel is doubled so cell edges stay sharp, and each frame keeps its own timing. It plays once, where a GIF loops. Your browser does the encoding: H.264, or VP9 where H.264 isn't available. It's offered only where the browser can encode video. If the browser can't encode an animation that large, the export says so. A bar shows the frames done, as with GIF.
- **Animated ANS** (an ANSiMation): Traditional CP437 animated ANSI file for BBS systems and retro terminal viewers. The art draws itself in a viewer or terminal, frame by frame. A file like this has no clock, so timing is lost and its speed depends on the viewer. It moves the cursor instead of scrolling, so rows past the bottom of the terminal can't be reached; the dialog warns above 80 × 25. The dialog lists the characters on any frame that it has to replace.
- **Animated UTF-8 ANS**: The same, in UTF-8, for a modern terminal. Every character is kept, so there's nothing to replace. `cat` writes it faster than the eye can follow; something that slows it down plays it, like `pv -qL 20000 art.utf8ans`.
- **Cast** (an asciinema recording): Plays back with exact frame timing and every character, in a terminal or on the web. It needs a terminal or player at least as wide and tall as the art.

The ANSI and Cast exports write 24-bit color, or the palette's own colors with the VGA or CGA palette.

---

## Keyboard Shortcuts

These work with Animate on, outside an art layer, and not while you're typing:

- **L**: Play or pause.
- **,** and **.**: Step back or forward a frame, wrapping around the ends.
- **N**: Add a frame after the one showing, of the same kind. Hold it to add several.
- **Alt+,** and **Alt+.** (Option on a Mac): Step too, and work while you're typing, where `,` and `.` type. The cursor stays where it is, so you can type on one frame, step, and go on typing on the next.

In the Keys panel, **Delete** or **Backspace** deletes the selected keys while the panel has focus, and **Escape** puts back keys you're dragging.
