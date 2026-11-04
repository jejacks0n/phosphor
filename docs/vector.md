# Vector shapes

The **VECTOR** tab (between ANSI and SAUCE, at `/vector`) holds shapes and curves that stay editable: you
can move, scale, rotate and reshape them as often as you like, and the art underneath converts them to
characters as you go. The tab shows the art exactly as ANSI does, with the editing marks for the shapes on
top. Zoom and pan work as they do on ANSI.

## Where shapes sit

Shapes are drawn over the base layer's own pixels and converted with the picture, so the color
adjustments, the palette and dither apply to them as they do to the picture (the image filters, such as
Blur, don't). Edit cells and paint stay on top of them:

the picture → the base layer's own pixels → shapes → edit cells → paint

Where a shape covers a pinned character (one an opened `.ans` file set), the shape's conversion shows
instead; move the shape away and the character comes back. A drawing holds up to 1,000 shapes.

Shapes are part of the edit layer: undo and redo take every change to them back one step at a time,
**Clear** on ANSI leaves them alone, and a drawing with shapes counts as drawn on when the canvas is
resized (it grows or trims on the right and bottom, and shapes keep their place).

## Bake and Merge down

- **Merge down** on VECTOR presses the selected shapes (or, with none selected, all of them) into the base
  layer's pixels, where they stop being shapes, with nothing on the canvas changing. Any shape beneath one of
  them that overlaps it goes too. One undo brings them back as shapes. In an animation it's off: the base is
  under every frame.
- **Merge down** on ANSI takes shapes along ([Layers](layers.md)); its dialog says so.
- **Bake** presses every shape in on a still; in an animation they stay shapes, with the sliders burnt into
  their colors.

## Animation

Each frame has its own shapes: a Blank frame carries the shapes before it, as it carries cells, and changing one
there makes it that frame's ([Animation](animation.md)). On VECTOR, the outlines of the shapes a Blank frame
carries show dimmed. Playing and the exports show each frame's shapes.

## Rooms

In a room, everyone drawing can draw and change shapes, and everyone sees them as they're drawn. A shape is one
piece of the drawing, like a cell: when two people change the same shape at once, the change heard last is the one
that stays, and undo takes back only your own changes (yours to a shape someone has changed since stays theirs).
Bake and Merge down are the host's. Watchers see the art the shapes make.

## Saving

Shapes are saved as shapes: a `.phosphor` file, autosave and Versions keep them editable, and an animation's
frames each keep their own. A copy of Phosphor from before shapes opens such a file without its shapes (the
art they made isn't there either), and drops them if it saves it. Exports (`.ans`, PNG, GIF and the rest)
have the shapes' converted cells, as they show.

## Vector select (V)

- Click a shape to select it. Shift-click adds a shape to the selection, or takes it away.
- The selection gets a box. Drag inside it to move the shapes (hold Shift once you're moving to keep them
  straight across, straight up and down, or at 45°), drag one of its eight handles to scale them
  from the opposite side (Shift keeps the proportions), or drag the knob above it to rotate them (Shift
  turns in steps of 15°). One shape's box turns with it; several shapes share one box, square to the grid.
- Click empty canvas to deselect.
- Double-click a shape (or press **Edit points**) to edit its points with the Node tool (below).
- The arrow keys nudge the selection a pixel (with Shift, 10). Delete or Backspace deletes it. Esc deselects.

Each drag, nudge or delete is one undo step.

## Node (A)

The Node tool edits a shape's points. Press a shape to edit its points (a press on one of them takes it at
once, so a two-point path's ends can be dragged straight away); choosing the tool with shapes selected edits
the first one's. Its points and their curve handles show over it:

- Drag a point to move it, its handles with it. Drag a handle to bend the curves beside its point; on a
  smooth point the other handle turns with it. Alt-drag (Option-drag on a Mac) a handle to break it from its
  partner: it moves alone, and from then on the point's two handles bend the curves on their own. The status
  bar says so while you edit points.
- Hold Shift while you drag to keep a point on a line from where it was, straight across, straight up and down,
  or at 45°, or a handle on such a line from its point.
- Click the outline to add a point there; the curve stays where it was, and the new point is selected.
- The options row: **Smooth** (the point's handles stay in line: drag one and the other turns with it; a
  point with no handles gets some), **Corner** (a sharp point: its handles go), and **Delete** (the point; Delete
  or Backspace too; a shape left with fewer than two points goes).
- Click empty canvas or press Esc to stop editing points; the shape stays selected. Press another shape to edit
  its points instead. Choosing another tool stops too.

Each drag, added point and change is one undo step. This works on rotated and scaled shapes too: a point goes
where the pointer is.

## Pen (P)

- Click for a corner point. Press and drag for a smooth point: its handles follow the pointer, one on each side.
- Hold Shift to keep the next point straight across, straight up and down, or at 45° from the last one, and a
  smooth point's handles at those angles too.
- The shape fills (or strokes) on the canvas as you draw it, with a dashed line from the last point to the
  pointer.
- Click the first point (with three or more) to close the shape. **Enter** or **Esc** leaves it an open curve,
  which has no fill and is stroked in its Stroke color, or the foreground color if it has none.
- **Backspace** takes the last point away; taking the last one leaves nothing, not even an undo step.
- Choosing another tool or tab, moving to another frame, undo or a save also leave it an open curve. Holding a
  tool for a moment (the Hand on Space) doesn't.

The whole shape is one undo step.

## Shape (U)

Drag from corner to corner for a **Rectangle**, an **Ellipse** or a **Polygon** (**Sides**: 3 to 12). Shift
makes it a square, a circle or a regular polygon. The shape is drawn as you drag, becomes an ordinary
path when you let go (so its points can be edited like any other), and is selected. A click without a drag
makes nothing.

## Fill and Stroke

On VECTOR the color pair is the shapes' **Fill** (the front chip) and **Stroke** (the back one). With shapes
selected, it shows the first one's colors, and a color picked there (the palette, the recent colors, a color
of your own, or **None**) goes to every selected shape, as one undo step. It's the color box the other tabs
have, with Fill and Stroke for FG and BG: Alt+F and Alt+B open it, and its **Swap** (or Shift+Cmd+X,
Shift+Ctrl+X) swaps each shape's Fill and Stroke. With the Pen or the Shape tool, or with
nothing selected, they're what the next shape gets. Until you change them, the next shape is filled with the
foreground color and has no outline; a shape with neither gets the foreground color as its fill. ANSI's and
PIXEL's colors are left as they were.

## The options row

**Stroke width** is the outline's width in pixels (0.5 to 64): the selected shapes', or the next shape's. With
shapes selected (Vector select):

- **Forward** and **Back** move the shapes just above the nearest shape they overlap, or just beneath it;
  every other shape keeps its place.
- **Join** makes the selected shapes one shape: the bottom one, with its colors and place, and every outline of
  the rest. An outline inside another becomes a hole, so an "o" and a smaller circle inside it make a ring.
  **Separate** takes a shape of several outlines apart, each outline a shape of its own in the same colors.
- **Edit points** edits the first shape's points with the Node tool. **Delete** deletes the shapes.

Each change is one undo step; a Stroke width drag is one step when you let go.

On a phone the row keeps Stroke width and **Points**, and puts Forward, Back and Delete under ⋯.

## Eyedropper (I)

On VECTOR the Eyedropper picks the color the art shows under the pointer and makes it the selected
shapes' Fill (with Shift, their Stroke), as one undo step. With nothing selected, it sets the next shape's.
