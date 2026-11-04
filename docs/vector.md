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

## Importing SVG

An `.svg` file comes in as shapes, never as a picture, so its curves stay editable: move and scale them, drag
their points into line with the cells, recolor them, or change them from frame to frame.

- **From the start screen** (dropped, or chosen with **Browse Files**) it opens as a new drawing on VECTOR, at the
  default size, named for the file.
- **Over a drawing**, dropping one asks, as an ANSI file does: **Add to this drawing** puts its shapes on VECTOR,
  in the frame showing; **Open instead** opens it in place of this drawing. In a room, Add is the only choice.
- **Where it lands:** art bigger than the canvas is scaled down to fit inside it (less a margin of 2 grid pixels),
  its proportions kept; art that fits keeps its size, one SVG unit to a grid pixel. Either way it's centered.
  Its size is the file's viewBox (or its width and height when there's no viewBox).
- **Stroke widths** scale with the art when it comes in, once. After that they stay as they are when you scale
  the shapes, as every shape's do (and between 0.5 and 64).
- Everything that came in is **selected**, with Vector select, ready to scale. The whole import is one undo step.
- **Colors are the file's.** Black art lands black: paint the background first, or recolor the shapes with the
  Fill and Stroke chips.
- **What comes in:** paths (every command, arcs included), rectangles (rounded too), circles, ellipses, lines,
  polylines and polygons, inside groups, nested SVGs and `use`; every transform; fills and strokes from
  attributes, `style` attributes and style sheets, inherited as SVG has them; fill rules, caps, joins and miter
  limits; linear and radial gradient fills (with their focal points, either units, their transforms and
  gradients that take from others; reflect and repeat come in as plain), a gradient outline as its first color.
  Each element is one shape, and a path of several parts is one shape of several outlines, its holes
  kept.
- **What doesn't:** text, images, filters, masks, clipping, patterns, markers and dashes (a dashed line comes in
  solid). When something is left out, a message says what. For text, convert it to curves (or paths) in the app
  it came from before exporting.
- **Limits:** a file that would go past 1,000 shapes in the frame, or 500 points in one shape, brings nothing in;
  the message says how many it has, so you can simplify it first. A file that isn't SVG says so and changes
  nothing.
- Nothing in the file runs or loads: it's read as data, never shown as a page.

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

### Gradient fills

A fill can be a **gradient**: linear (bands of color across the shape) or radial (rings from a middle point
out). It moves, scales and turns with its shape, and goes through the palette and dithering as any color does.
On the Fill side of the color box, with shapes selected:

- **Linear** makes the fill a gradient across the shape's box, left to right, from the fill's color to the
  background color. **Radial** makes it one from the box's middle out to its farthest corner. Switching between
  the two keeps the colors.
- **Solid** makes it a single color again: the gradient's first color. Picking any color in the box does the
  same, with that color.
- Each is one undo step. With nothing selected they're off: the next shape's fill is always a single color.
- The Fill chip shows the gradient's colors. Swapping Fill and Stroke gives the outline the gradient's first
  color, since an outline is always a single color.

Gradients from an SVG file come in as gradients ([Importing SVG](#importing-svg)).

## The options row

**Stroke width** is the outline's width in pixels (0.5 to 64): the selected shapes', or the next shape's. With
shapes selected (Vector select):

**Stroke** opens a panel for how the outline is drawn, again the selected shapes' or the next shape's:

- **Cap**, the ends of an open outline: butt (cut off at the end point), round, or square (squared off half the
  width past it).
- **Join**, the corners: miter (a sharp point), round, or bevel (cut across).
- **Miter**, the limit for miter joins (1 to 100): how far a sharp corner's point may reach, in stroke widths,
  before it's cut off as a bevel. It's only for miter joins.

Drawn shapes start with round caps and round joins.

With shapes selected:

- **Forward** and **Back** move the shapes just above the nearest shape they overlap, or just beneath it;
  every other shape keeps its place.
- **Join** makes the selected shapes one shape: the bottom one, with its colors and place, and every outline of
  the rest. An outline inside another becomes a hole, so an "o" and a smaller circle inside it make a ring.
  **Separate** takes a shape of several outlines apart, each outline a shape of its own in the same colors.
- **Edit points** edits the first shape's points with the Node tool. **Delete** deletes the shapes.

Each change is one undo step (each press in the Stroke panel too); a Stroke width drag is one step when you let go.

On a phone the row keeps Stroke width, Stroke (its panel the window's width) and **Points**, and puts Forward, Back and Delete under ⋯.

## Eyedropper (I)

On VECTOR the Eyedropper picks the color the art shows under the pointer and makes it the selected
shapes' Fill (with Shift, their Stroke), as one undo step. With nothing selected, it sets the next shape's.
