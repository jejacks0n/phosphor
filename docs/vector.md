# Vector shapes

The **VECTOR** tab (between ANSI and SAUCE, at `/vector`) holds shapes and curves that stay editable: you
can move, scale, rotate and reshape them as often as you like, and the art underneath converts them to
characters as you go. The tab shows the art exactly as ANSI does, with the editing marks for the shapes on
top. Zoom and pan work as they do on ANSI: zoomed in as far as 800%, a cell is many screen pixels wide, for placing
points between cells.

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
  limits; linear and radial gradients, on fills and outlines (with their focal points, either units, their
  transforms and gradients that take from others; reflect and repeat come in as plain).
  Each element is one shape, and a path of several parts is one shape of several outlines, its holes
  kept. SVG strokes are always centered, so imported ones are too.
- **What doesn't:** text, images, filters, masks, clipping, patterns, markers and dashes (a dashed line comes in
  solid). When something is left out, a message says what. For text, convert it to curves (or paths) in the app
  it came from before exporting.
- **Limits:** a file that would go past 1,000 shapes in the frame, or 500 points in one shape, brings nothing in;
  the message says how many it has, so you can simplify it first. A file that isn't SVG says so and changes
  nothing.
- Nothing in the file runs or loads: it's read as data, never shown as a page.

## Snap to

**Snap to** in VECTOR's tool row (a magnet on a phone, lit while it snaps) puts the points you place or drag on
the cell grid, so a shape's edges fall on cell edges and turn into clean characters:

- **None** (to start with) leaves them where the pointer is.
- **Cells** puts them on cells' corners.
- **Half cells** puts them on cells' halves both ways: their corners, the middles of their edges and their
  centers, where half-blocks (▀ ▄ ▌ ▐) split a cell.

What snaps: the Pen's points (a curve's handles stay where you drag them), the Shape tool's two corners, a point
dragged with the Node tool (curve handles and a gradient's handles stay free), and with Vector select the corner
of the box nearest where you grabbed it, as you move, or the handle you drag, as you scale. Rotating doesn't
snap. With Shift held, its straight line comes first, and the point snaps along it where it can. Hold Cmd (Ctrl
on Windows and Linux) while you drag to place or move without snapping. The choice lasts until you reload.

## Vector select (V)

- Click a shape to select it. Shift-click adds a shape to the selection, or takes it away.
- Drag a box over empty canvas to select every shape it touches; with Shift, they're added to the selection.
- The selection gets a box. Drag inside it to move the shapes (hold Shift once you're moving to keep them
  straight across, straight up and down, or at 45°), drag one of its eight handles to scale them
  from the opposite side (Shift keeps the proportions), or drag the knob above it to rotate them (Shift
  keeps one shape at an angle in steps of 15°, so a turned one can be squared up again; several turn in steps of
  15° from where they were). One shape's box turns with it; several shapes share one box, square to the grid.
- With one shape selected whose fill or outline is a gradient, its gradient's handles show too, as the
  [Node tool](#node-a)'s do: drag an end to stretch and turn it, or a stop to slide or remove it, and click a
  stop to select it (its chip's color box then sets its color; Delete, Backspace or the row's Delete removes it,
  and Esc lets it go). Its line isn't a handle here: a drag inside the box still moves the shape, and stops are
  added with the Node tool. Where a gradient's end sits on one of the box's handles (a Linear gradient's ends are
  on the left and right ones), the gradient's end comes first; click again in the same place for the box's handle. With both
  a gradient fill and outline, **Fill** and **Stroke** in the options row choose which one's handles show.
- Click empty canvas to deselect. Cmd+A (Ctrl+A) selects every shape on the frame, from any VECTOR tool (it
  switches to Vector select), finishing a Pen shape under way first.
- Cmd+C (Ctrl+C) copies the selected shapes and Cmd+X cuts them; Cmd+V pastes them on top, selected with
  Vector select, to drag into place. They land where they were copied from, so a paste onto another frame
  keeps their place; where the frame already has copies of them there, a little right of and below those, so
  you see them land. The options row has the same Copy, Cut and Paste buttons as Select's. The paste is one
  undo step, and goes to whatever frame is showing. Cmd+V (Ctrl+V) also pastes shapes copied on VECTOR in
  another Phosphor tab, where they were in that drawing; the row's Paste button pastes only what this tab
  copied, and says so when it hasn't copied anything.
- Double-click (or double-tap) a shape to edit its points with the Node tool (below), or press A.
- The arrow keys nudge the selection a pixel (with Shift, 10). Delete or Backspace deletes it. Esc deselects.

Each drag, nudge or delete is one undo step, and so is each change of what's selected (a click, a box, Esc,
Select all), so undo brings back a selection lost to a stray click. Undoing an edit brings back the shapes that
were selected when it began.

## Node (A)

The Node tool edits a shape's points and, when it has one, its gradient.

Press a shape to edit its points (a press on one of them takes it at
once, so a two-point path's ends can be dragged straight away); choosing the tool with shapes selected edits
the first one's. Its points and their curve handles show over it, those of every outline of a shape of
several (a letter's counters, a ring's hole):

- Drag a point to move it, its handles with it. Drag a handle to bend the curves beside its point; on a
  smooth point the other handle turns with it. Alt-drag (Option-drag on a Mac) a handle to break it from its
  partner: it moves alone, and from then on the point's two handles bend the curves on their own. The status
  bar says so while you edit points.
- Hold Shift while you drag to keep a point on a line from where it was, straight across, straight up and down,
  or at 45°, or a handle on such a line from its point.
- A press on a gradient's handle (an end or a stop) takes it, even with a point or a curve handle as near or
  nearer (a gradient's end on a corner, say); otherwise it takes the point or curve handle nearest. Handles on top of each other part as you zoom in; or click (or tap)
  again in the same place for the next one there, and again for the one after; a drag then moves the one picked.
  The status bar says so while you edit points.
- Click the outline to add a point there; the curve stays where it was, and the new point is selected.
- The options row: **Smooth**, **Free** or **Sharp**, the selected point's, one of them lit. Smooth: its handles
  stay in line (drag one and the other turns with it; a point with no handles gets some). Free: its handles each
  move on their own, as an Alt-dragged handle leaves them (a point with no handles gets some), so a phone can do it
  too. Sharp: its handles go. And **Delete** (the point; Delete or Backspace
  too; an outline left with fewer than two points goes, and the shape with its last one).
- Click empty canvas or press Esc to stop editing points; the shape stays selected. Press another shape to edit
  its points instead. Choosing another tool stops too.

A shape whose fill or outline is a gradient ([Gradients](#gradients)) also shows the gradient's handles, with its
points: for a
linear one, a line from where it starts to where it ends, a square at each end; for a radial one, a square at its
middle and one at its edge, joined by a line. Each color stop is a dot on the line, in its color. A press on
a point or a curve handle is the point's; then the gradient's handles; then the outline. When the fill and outline are both gradients, **Fill** and **Stroke** in the options row choose which one's
handles show; a gradient you've just made is the one shown.

- **Drag the line** (or a radial gradient's middle) to move the gradient.
- **Drag an end** (or the edge) to stretch it and turn it about the other end (or the middle). Shift keeps it
  across, up and down, or at 45°.
- **Click the line** to add a stop there, in the color the gradient has there.
- **Click a stop** to select it (it's ringed); the color box of its chip (Fill
  or Stroke) then sets that stop's color. **Drag a stop** along the line to slide it, or well off the line to
  remove it (a gradient keeps at least two). Delete or Backspace removes the
  selected stop; Esc lets it go. A stop or a point is selected, not both, and the row's **Delete** (the trash can) removes whichever it is.

Each drag, added point or stop, and change is one undo step. This works on rotated and scaled shapes too: a point
or a gradient goes where the pointer is.

## Pen (P)

- Click for a corner point. Press and drag for a smooth point: its handles follow the pointer, one on each side.
- The path so far shows as a thin line while you draw, whatever its fill and outline, so a tap on a phone shows
  where it goes before there's anything to fill.
- Hold Shift to keep the next point straight across, straight up and down, or at 45° from the last one, and a
  smooth point's handles at those angles too. The dashed line to the pointer shows where the point will go.
- The shape fills (or strokes) on the canvas as you draw it, with a dashed line from the last point to the
  pointer.
- Click the first point (with three or more) to close the shape. **Enter** or **Esc** leaves it an open curve,
  which has no fill and is stroked in its Stroke color, or the foreground color if it has none.
- **Backspace** or undo takes the last point away; taking the last one leaves nothing, not even an undo step.
- Choosing another tool or tab, moving to another frame or a save also leave it an open curve. Holding a
  tool for a moment (the Hand on Space) doesn't.

A finished shape is selected, as the Shape tool's is, so the color pair changes it. The whole shape is one undo
step.

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
Shift+Ctrl+X) swaps each shape's Fill and Stroke. A shape the Pen or the Shape tool just drew is selected, so a
change goes to it; with the Pen or the Shape tool, the next shape gets it too. While the Pen is drawing a shape,
or with nothing selected, they're what the next shape gets. Until you change them, the next shape is filled with the
foreground color and has no outline; a shape with neither gets the foreground color as its fill. ANSI's and
PIXEL's colors are left as they were.

### The outline

The Stroke side of the color box also sets how the outline is drawn, again the selected shapes' or the next
shape's:

- **Stroke width**, the outline's width in pixels: the slider goes from 0.5 to 16 in tenths, and the box beside it
  takes any width from 0.5 to 64.
- **Align**, where that width goes: inside the outline, centered on it, or outside it. Centered, a stroke
  straddles its outline, so a rectangle snapped to cells and stroked 1 wide covers half of two cells at each
  side; inside, it fills exactly the column of cells just within each side (top and bottom, the half cells), and
  outside, the one just past it. An open path has no inside, so its buttons are Left, Center and Right instead:
  the whole width on one side of the line, left or right of the way it was drawn (a mirrored path keeps its side).
  A closed shape set to Left or Right keeps those buttons too.
- **Cap**, the ends of an open outline: butt (cut off at the end point), round, or square (squared off half the
  width past it).
- **Join**, the corners: miter (a sharp point), round, or bevel (cut across).
- **Miter**, the limit for miter joins (1 to 100): how far a sharp corner's point may reach, in stroke widths,
  before it's cut off as a bevel. It's only for miter joins.

Drawn shapes start with round caps, round joins and centered strokes. Each press is one undo step; a Stroke width drag is one step
when you let go.

### Gradients

A fill or an outline can be a **gradient**: linear (bands of color across the shape) or radial (rings from a
middle point out). It moves, scales and turns with its shape, and goes through the palette and dithering as any
color does. Make one on either side of the color box, with shapes selected, then place it with the Node
tool ([Node](#node-a)):

- **Linear** makes the fill (or outline) a gradient across the shape's box, left to right, from its color to the
  background color. **Radial** makes it one from the box's middle out to its farthest corner. Switching between
  the two keeps the colors.
- **Solid** makes it a single color again: the gradient's first color. Picking any color in the box does the
  same, with that color.
- Each is one undo step. With nothing selected they're off: the next shape's fill and outline are always single
  colors.
- The chip shows the gradient's colors. Swapping Fill and Stroke swaps the gradients too.
- An outline's gradient runs across the shape as a fill's does, so the outline takes the colors of the bands it
  crosses.

Gradients from an SVG file come in as gradients ([Importing SVG](#importing-svg)).

## The options row

With Vector select, **Copy**, **Cut** and **Paste**, and with shapes selected:

- **Forward** and **Back** move the shapes just above the nearest shape they overlap, or just beneath it;
  every other shape keeps its place.
- **Join** makes the selected shapes one shape: the bottom one, with its colors and place, and every outline of
  the rest. An outline inside another becomes a hole, so an "o" and a smaller circle inside it make a ring.
  **Separate** takes a shape of several outlines apart, each outline a shape of its own in the same colors.
- **Add** makes the selected shapes one shape that covers everything they covered, and **Subtract** cuts the
  shapes above out of the bottom one (a shape cut out of the middle of another leaves a hole). The result is
  the bottom shape, with its colors, outline and place; the others are gone, and curves stay curves. Edges that
  meet exactly, as Snap to leaves them, join with no seam and no extra points. They take two or more shapes whose
  outlines are all closed. A Subtract that leaves nothing deletes them all. The first one you use takes a moment
  to load.
- **Delete** deletes the shapes.

The buttons are icons, each named when you hover it. Each change is one undo step. On a phone the row is the
same, without the hint; a double tap on a shape edits its points.

## Eyedropper (I)

On VECTOR the Eyedropper picks the color the art shows under the pointer and makes it the selected
shapes' Fill or Stroke, as one undo step: **Fill** or **Stroke** in the options row chooses which (Fill to start
with), and Shift picks for the other one (while you hold it, that one is lit); the status bar says so. With nothing selected, it sets the next
shape's.
