# Vector Shapes

The **VECTOR** workspace lets you draw scalable shapes, curves, and paths directly over your artwork. Vector shapes remain fully editable: you can move, scale, rotate, and reshape them at any time. As you work, Phosphor automatically converts your vector shapes into text characters and colors.

The **VECTOR** tab (at `/vector`) shows while a vector layer is picked in [LAYERS](layers.md#the-layers-list); **Add vector layer** adds one. It shows the art exactly as ANSI does, with the editing marks for the shapes on top. Zoom and pan work as they do on ANSI: zoomed in as far as 800%, a cell is many screen pixels wide, for placing points between cells.

---

## How Vector Shapes Work

Shapes are drawn into the artwork before it's converted, so the color adjustments, the palette, and dither apply to them as they do to the picture. The image filters (such as Blur) don't. A vector layer with character settings of its own (Dither included) converts its shapes with them ([Layers](layers.md#the-left-column)).

### Drawing Order

Shapes are drawn where their vector layer sits in the stack, and a new shape goes on the vector layer picked. The vector layer your first shape brings sits directly on the base layer, under the drawing layer, so a new drawing stacks like this:

`Picture → Base layer's own pixels → Vector shapes → Drawing layer cells → Paint`

A vector layer higher in the stack converts against everything below it: where a shape reaches a cell, the converter picks that cell's character from the shape's pixels over what the layers under it show there. The layers above then cover it as they cover anything.

### High-Detail Shapes

Vector shapes render at the picture's own detail, finer than the grid. With **By shape** choosing the characters ([Characters](characters.md#how-the-converter-picks-characters)), a shape's edge inside a cell can come out as a quadrant, `▌`, `▐`, or another partial block from your character set. Paint can't do that, because it covers whole half cells: shapes are the way to draw finer than half a cell.

### Shapes and the Rest of the Drawing

- **Pinned characters**: Where a shape covers a pinned character (one an opened `.ans` file set), the shape's conversion shows instead. Move the shape away and the character comes back.
- **Limit**: A drawing holds up to 1,000 shapes on a frame.
- **Undo**: Undo and redo take every change to shapes back one step at a time.
- **Clear layer**: Clearing a drawing layer leaves shapes alone.
- **Canvas size**: A drawing with shapes counts as drawn on when you resize the canvas: it grows or trims on the right and bottom, and shapes keep their place.
- **Hidden layers**: Shapes on a hidden vector layer can still be selected and edited on VECTOR.
- **Several vector layers**: The tools reach the shapes on every vector layer. A click picks the shape that shows on top there, whichever layer it's on, and the layer picked in LAYERS follows the shape you select, so the next shape you draw and **Merge down** act on that layer.

---

## Art Layers

An **art layer** is a block of hand-drawn cells stored on a vector layer as a shape is. You can select, move, copy, delete, and animate an art layer, and it stacks with the shapes, but it keeps your exact hand-drawn characters and colors instead of being converted.

### Creating an Art Layer

1. Use the **Select** tool (**M**) to select an area, or the **Magic Wand** (**W**) to select cells.
2. Click **Make art layer** in the options row.
3. What's drawn in the selection (typed cells, drawn cells, and paint on the drawing layer in use) moves to a new art layer on the vector layer directly above that layer, on top of its shapes, trimmed to the cells that have something in them. If the layer above isn't a vector layer, one is added there (unless the drawing already has the most layers it can hold, which Phosphor tells you).
4. The view switches to **VECTOR** with the new art layer selected.

Making an art layer is one undo step, and the canvas looks the same afterward:
- With the Magic Wand, only the cells it selected are taken, and the rest of the drawing stays.
- The base layer and shapes aren't taken along.
- With nothing drawn in the selection, nothing happens (with the Magic Wand, Phosphor says so).
- An art layer holds a limited amount. If the selection has more, Phosphor asks for a smaller area and leaves the drawing as it was.
- You can't make an art layer from a hidden drawing layer, or onto a hidden vector layer.

### How Art Layers Behave

- **Moving**: Drag an art layer anywhere in its box, or use the arrow keys. It moves by whole cells (an arrow moves one column across or one line down, and **Shift** moves ten times as far), whatever **Snap to** says. It has no size or rotation handles, and shapes selected with it move with it by whole cells.
- **See-through cells**: A cell you never drew on is see-through, and so is a half of a cell with no color of its own (text typed with only a foreground color has no background, so what's under it shows). A black background you drew is a color like any other: it covers what's under it.
- **Blending**: Each half of a cell shows its own color solid. Partly transparent paint comes into the layer solid when it's about half opaque or more, and is left out when it's less.
- **Characters**: A cell's character shows exactly as drawn wherever the art layer is the topmost thing at that cell. Where a shape sits above the layer, the converter picks the character there, as it does for shapes. Where two art layers overlap, the upper one's character shows; a cell of it with no character leaves the lower one's. A two-column character takes the next cell too, as it does on ANSI. A cell you painted without typing a character keeps the character it showed when you made the layer, so it no longer changes with what's under it.
- **Animation**: In an animation, an art layer starts on the frame you made it on, and a Blank frame carries it on, as it carries shapes. Its position and stacking key and tween as a shape's do, a whole cell at a time ([The Keys Panel](animation.md#the-keys-panel)).
- **Copies**: Copy and paste (**Cmd/Ctrl+C** and **Cmd/Ctrl+V** on VECTOR) make an independent art layer: changing one leaves the other as it was.
- **Boolean operations**: Join, Add, and Subtract don't take an art layer, since it has no outline.

### Editing an Art Layer

To draw inside an art layer, you step into it (like editing a symbol in Flash):

1. In the **VECTOR** view, double-click the art layer (or select it with Vector select and click **Edit art** in the options row).
2. The view switches to the ANSI editor. The bar under the tools says **Editing art layer**, with a **Done** button.
3. Use the usual drawing tools (Pencil, Brush, Edit Mode, Eraser, and the rest). They draw into the art layer only; the rest of the drawing shows dimmed and can't be changed from here.
4. When finished, click **Done** or press **Esc** to return to the VECTOR view with the layer selected. If the Text cursor is showing, the first **Esc** puts it away.

While you're inside an art layer:
- **Every frame**: An art layer is one drawing wherever it shows, so each edit changes it on every frame it's on.
- **Growing and shrinking**: Draw past the layer's edge and it grows to hold what you drew. Erase the cells at its edge and it shrinks to the cells that are left; the cells that stay don't move on the canvas. If an edit would make the layer too big on any frame it's on, nothing changes and Phosphor says so.
- **Fills**: A **Paint Bucket** fill or a **Gradient** started on the art layer's own drawing stays in it, whatever the **Tolerance**: the dimmed drawing around it is a wall. Started on the dimmed drawing, it reads that drawing's colors as usual, and the layer grows to hold what it fills.
- **Undo**: Each edit is one undo step, and undo goes back no further than where you stepped in. After you step out, the steps are in the history with the rest.
- **What's off**: The settings panel, picking the base layer, and the frame controls (the animation bar, and the keys that play, step, and add frames) are off. **Clear layer**, **Merge down** (and **Blend into source image**), **Bake**, and **Flatten** are off too, since they change the whole drawing: their tooltips say to exit the art layer first.
- **Stepping out**: Changing tabs, picking another drawing layer, opening or starting a document, resizing the canvas, turning **Animate** off, exporting, and **Make art layer** all step you out too.
- **In a room**: One person at a time draws in an art layer ([Rooms](#rooms)).

---

## Vector Tools

The tools' outlines, boxes, and handles are drawn in color over a dark rim, so they read over any art, light or dark.

### Vector Select (`V`)

Use Vector select to select, move, scale, and rotate shapes:
- **Select**: Click a shape to select it. **Shift**-click adds a shape to the selection, or removes it. Drag a box over empty canvas to select every shape it touches (with **Shift**, they're added). Click empty canvas or press **Esc** to deselect.
- **Select all**: **Cmd+A** (**Ctrl+A**) selects every shape on the frame, from any VECTOR tool (it switches to Vector select and finishes a Pen shape first).
- **Move**: Drag inside the selection box. Hold **Shift** once you're moving to keep it straight across, straight up and down, or at 45°. The arrow keys nudge the selection one pixel (with **Shift**, 10).
- **Scale**: Drag any of the 8 box handles to scale from the opposite side. Hold **Shift** to keep proportions locked, or **Alt** (**Option** on a Mac) to scale from the middle.
- **Rotate**: Drag the knob above the selection box. Hold **Shift** to snap one shape to angles in 15° steps (so a rotated one can be squared up again); several shapes turn in 15° steps from where they were. One shape's box turns with it; several shapes share one box, square to the grid.
- **Edit points**: Double-click (or double-tap) a shape to edit its points with the Node tool, or press **A**. Double-clicking an art layer steps into it.
- **Delete**: Press **Delete** or **Backspace**, or click the trash can in the options row.
- **Clipboard**: **Cmd+C** / **Ctrl+C** copies the selected shapes, **Cmd+X** / **Ctrl+X** cuts them, and **Cmd+V** / **Ctrl+V** pastes them on top, selected, ready to drag into place. The options row has the same Copy, Cut, and Paste buttons.

Pasted shapes land where they were copied from, so a paste onto another frame keeps their place. Where the frame already has copies of them there, they land a little right of and below those, so you see them land. **Cmd/Ctrl+V** also pastes shapes copied on VECTOR in another Phosphor tab; the options row's **Paste** button pastes only what this tab copied.

With one shape selected whose fill or outline is a [gradient](#gradients), its gradient's ends and stops show too: drag an end to stretch and turn it, drag a stop to slide or remove it, click a stop to select it, or double-click a stop or an end to open its color. The gradient's line isn't a handle here (a drag inside the box still moves the shape), so stops are added with the Node tool. Where a gradient's end sits on a box handle, the gradient's end comes first; click again in the same place (after a moment) for the box's handle.

Each drag, nudge, or delete is one undo step, and so is each change of what's selected (a click, a box, **Esc**, Select all), so undo brings back a selection lost to a stray click. Undoing an edit brings back the shapes that were selected when it began.

### Node (`A`)

The Node tool edits the points, curve handles, and gradient of a shape. It shares a toolbar slot with Vector select.

- **Choose a shape**: Click a shape to show its points and curve handles, those of every outline in a compound shape (a letter's counters, a ring's hole). A press on one of its points takes it at once. Choosing the tool with shapes selected edits the first one's points.
- **Move points**: Drag any point; its handles move with it. Hold **Shift** to constrain movement horizontally, vertically, or at 45°.
- **Select several points**: **Shift**-click a point to add it to the selection (or remove it), or drag a box from empty canvas (or from inside the shape) over points to select those in it (with **Shift**, they're added). Drag any selected point and they all move. With no shape being edited, a box edits the top shape with points in it.
- **Adjust curves**: Drag a curve handle to bend the curves beside its point; on a smooth point the other handle turns with it. Hold **Alt** (**Option** on a Mac) while dragging to break the handle from its partner, so each moves on its own from then on. The status bar says so while you hold **Alt**.
- **Add points**: Click the outline to add a point there. The curve keeps its shape, and the new point is selected.
- **Delete points**: Select points and press **Delete** or **Backspace**, or click the trash can in the options row. An outline left with fewer than two points goes, and so does the shape with its last one.
- **Point styles**: In the options row's **Point** group, choose **Smooth** (handles stay aligned), **Free** (handles move independently), or **Sharp** (a corner with no handles). The choice changes every selected point; a point with no handles gets some for Smooth or Free.
- **Overlapping handles**: Handles on top of each other separate as you zoom in. Or click again in the same place for the next one there; a drag then moves the one picked. Leave a moment between the clicks, since two quick clicks on a gradient's handle open its color.
- **Finish**: Click empty canvas or press **Esc** to stop editing points; the shape stays selected. Choosing another tool stops too.

A shape whose fill or outline is a [gradient](#gradients) also shows the gradient's handles: for a linear one, a line from start to end with a square at each end; for a radial one, a square at its middle and one at its edge, joined by a line. Each color stop is a dot on the line, in its color.
- **Move the gradient**: Drag the line (or a radial gradient's middle).
- **Stretch and turn**: Drag an end (or the edge) to stretch it and turn it about the other end (or the middle). **Shift** keeps it across, up and down, or at 45°.
- **Add a stop**: Click the line to add a stop there, in the color the gradient has there (up to 16 stops). Double-clicking the line adds a stop and opens its color.
- **Select a stop**: Click a stop to select it. The color box of its chip (Fill or Stroke) then sets that stop's color. **Esc** lets it go.
- **Slide or remove a stop**: Drag a stop along the line to slide it, or well off the line to remove it (a gradient keeps at least two). **Delete** or **Backspace** removes the selected stop.
- **Change a stop's color**: Double-click a stop to select it and open its color. Double-clicking an end opens the stop on it, or where there's none, the nearest stop whose color shows there.
- **Which gradient**: With both a gradient fill and outline, **Fill** and **Stroke** in the options row choose which one's handles show, as does the side open in the color box. A gradient you've just made is the one shown.

Each drag, added point or stop, and change is one undo step. Editing works on rotated and scaled shapes too: a point or a gradient handle goes where the pointer is.

### Pen (`P`)

Draw custom paths and curves point by point:
- **Corner point**: Click to place a sharp corner point.
- **Smooth curve**: Click and drag to create a smooth point; its handles follow the pointer, one on each side.
- **Straight lines**: Hold **Shift** to keep the next point straight across, straight up and down, or at 45° from the last one (and a smooth point's handles at those angles too).
- **Preview**: The shape fills (or strokes) on the canvas as you draw, with a thin line along the path and a dashed line from the last point to the pointer.
- **Close path**: Click the starting point (with three or more points) to close the shape.
- **Open curve**: Press **Enter** or **Esc** to finish without closing the shape. An open curve has no fill and is stroked in its Stroke color, or the foreground color if it has none.
- **Undo last point**: Press **Backspace** (or undo) to remove the previous point while drawing. Removing the last one leaves nothing, not even an undo step.

Choosing another tool or tab, moving to another frame, or saving also finishes the shape as an open curve; holding a tool for a moment (the Hand on **Space**) doesn't. A finished shape is selected, so a color change goes to it, and the whole shape is one undo step. Its box shows, and until you start the next shape its handles work without changing tools, as with [Vector select](#vector-select-v): drag a handle to scale, or the knob above the box to rotate. A click anywhere else, inside the box too, starts a new shape.

### Shape (`U`)

Drag from corner to corner to create a standard geometric shape. Choose the kind in the options row:
- **Rectangle**: Hold **Shift** for a square.
- **Ellipse**: Hold **Shift** for a circle.
- **Polygon**: Set the number of **Sides** (3 to 12) in the options row; the polygon fits the box you drag, its first corner at the top. Hold **Shift** for a regular polygon.
- **A plugin's shapes**: After Polygon, each with its options after the row while it's chosen; it fits the box you drag, and **Shift** makes the box square ([Writing a shape](plugins.md#writing-a-shape)).

The shape is drawn as you drag, becomes a path when you let go (so its points can be edited like any other), and is selected. A click without a drag makes nothing. Each shape is one undo step.

A polygon, or a plugin's shape, remembers its options. While it's selected with the Shape tool and its kind is the one chosen in the row (as it is right after drawing it), the options row shows its values, and changing one draws it again in the box it was drawn in. With another kind chosen, the row shows that kind's options, for the next shape; choose the shape's own kind to change it. It keeps where it was moved, scaled or turned to, and its colors. With several selected, every one of that kind changes. A change is the next shape's too, and a slider's drag, or a color picked, is one undo step. On a shape with [keys](animation.md), the change goes to the frame's key. Once you edit its points by hand it's a plain path, and its options are the tool's again. A plugin's shape whose plugin is off or not installed is a plain path until the plugin is back.

The selected shape's box shows, and its handles work without changing tools, as they do with [Vector select](#vector-select-v): drag a handle to scale (**Shift** keeps the proportions, **Alt** scales from the middle) or the knob above the box to rotate (**Shift**: steps of 15°). A drag anywhere else, inside the box too, draws a new shape, so shapes can go inside one another; to move a shape, use Vector select.

With one shape selected whose fill or outline is a [gradient](#gradients) (choose Linear or Radial in the color box right after drawing it, say), its gradient's ends and stops show and work as they do with [Vector select](#vector-select-v): drag them, click a stop to select it (**Delete** removes it, **Esc** lets it go), or double-click one to open its color. A drag anywhere else draws a new shape.

### Eyedropper (`I`)

Sample the color the art shows under the pointer and make it the selected shapes' **Fill** or **Stroke**, as one undo step. **Fill** or **Stroke** in the options row chooses which (Fill to start with). Hold **Shift** while sampling to set the other one; while you hold it, that one is lit and the status bar says so. With nothing selected, it sets the next shape's color.

### Snap To

**Snap to** in VECTOR's tool row (a magnet on a phone, lit while it snaps) puts the points you place or drag on the cell grid, so a shape's edges fall on cell edges and turn into clean characters:
- **None** (the default): Points stay where the pointer is.
- **Cells**: Points land on cell corners.
- **Half cells**: Points land on cell halves both ways (corners, the middles of edges, and centers), where half-blocks (`▀`, `▄`, `▌`, `▐`) split a cell.

What snaps: the Pen's points (curve handles stay where you drag them), the Shape tool's two corners, a point dragged with the Node tool (curve handles and gradient handles stay free), and with Vector select the corner of the box nearest where you grabbed it as you move, or the handle you drag as you scale. Rotating doesn't snap. With **Shift** held, the straight line comes first, and the point snaps along it where it can. Hold **Cmd** (**Ctrl** on Windows and Linux) while you drag to place or move without snapping. The choice lasts until you reload.

---

## Fill and Stroke

In the VECTOR view, the color pair at the start of the tool row holds the shapes' **Fill** (front chip) and **Stroke** (back chip):

- Click a chip (or press **Alt+F** or **Alt+B**) to open the color box and choose a color from the palette, the recent colors, or a color of your own. In Chrome, Edge and the desktop app, the eyedropper beside **Swap** takes a color from anywhere on your screen.
- Click **None** to make the fill or stroke transparent.
- Click **Swap** (or press **X**, or **Shift+Cmd+X** / **Shift+Ctrl+X**) to swap each selected shape's fill and stroke, gradients included.

With shapes selected, the chips show the first one's colors, and a color picked goes to every selected shape as one undo step. A shape the Pen or Shape tool just drew is selected, so a change goes to it, and with those tools the next shape gets it too. While the Pen is drawing, or with nothing selected, the chips set what the next shape gets. Until you change them, the next shape is filled with the foreground color and has no outline. ANSI's and PIXEL's colors are left as they were.

### Outline Options (Stroke)

The **Stroke** side of the color box also sets how the outline is drawn, for the selected shapes or the next shape:
- **Stroke width**: Outline thickness in pixels. The slider goes from 0.5 to 16 in tenths, and the box beside it takes any width from 0.5 to 64.
- **Align**: Where the width goes.
  - **Inside**: The outline sits entirely inside the shape path. A rectangle snapped to cells and stroked 1 wide fills exactly the column of cells just within each side (top and bottom, the half cells).
  - **Center**: The outline straddles the path, so that same rectangle covers half of two cells at each side.
  - **Outside**: The outline sits entirely outside the path.
  - An open path has no inside, so its choices are **Left**, **Center**, and **Right** of the way it was drawn (a mirrored path keeps its side). A closed shape set to Left or Right keeps those choices too.
- **Cap**: The ends of an open outline: **Butt** (cut off at the end point), **Round**, or **Square** (squared off half the width past it).
- **Join**: The corners: **Miter** (a sharp point), **Round**, or **Bevel** (cut across).
- **Miter**: The limit for miter joins (1 to 100): how far a sharp corner's point may reach, in stroke widths, before it's cut off as a bevel. At 1 every corner is beveled; a square corner turns sharp above about 1.4, and a star's points only well above 3. With the stroke inside or outside, a point reaches twice as far as it would centered.

New shapes start with round caps, round joins, centered strokes, and a miter limit of 4. Each change is one undo step; a Stroke width drag is one step when you let go.

**Start** and **End** set how much of the outline is drawn: the stretch between them, measured along the outline from its first point, 0 to 100%. A trimmed closed shape keeps its fill with it, and VECTOR still shows the whole outline, with the part not drawn dashed. They're animation properties: with **Animate** on, set them in the [Keys panel](animation.md#the-keys-panel) or drag their handles along the outline with Vector select.

### Gradients

A fill or an outline can be a gradient. It moves, scales, and turns with its shape, and goes through the palette and dithering as any color does. With shapes selected, choose one on either side of the color box:
- **Linear**: Bands of color across the shape's box, left to right, from its color to the background color.
- **Radial**: Rings of color from the box's middle out to its farthest corner.
- **Solid**: A single color again: the gradient's first color. Picking any color in the box does the same, with that color.

Switching between Linear and Radial keeps the colors. Each change is one undo step. With nothing selected the choices are off: a new shape's fill and outline always start as single colors. The chip shows the gradient's colors. An outline's gradient runs across the shape as a fill's does, so the outline takes the colors of the bands it crosses.

Use the [Node tool](#node-a) (or Vector select or the Shape tool, for one selected shape) to drag gradient start points, endpoints, and color stops. Double-click any color stop to change its color. With one shape selected, its gradient's line shows with any tool, as its box does.

---

## Shape Actions and Boolean Operations

With Vector select, the options row has **Copy**, **Cut**, and **Paste**, and with shapes selected:

- **Forward / Back**: Move the shapes just above the nearest shape they overlap on their own vector layer, or just beneath it. Every other shape keeps its place. Between two vector layers, the layers' order in LAYERS decides which shape is over which.
- **Join**: Combines two or more shapes into one compound shape: the bottom one as they show (on the lowest vector layer, when they're on several), with its colors, place, and layer, and every outline of the rest. An outline inside another becomes a cutout hole, so a circle and a smaller circle inside it make a ring.
- **Separate**: Splits a compound shape back into independent outlines, each a shape of its own in the same colors.
- **Add**: Merges two or more closed shapes into a single outline covering their combined area.
- **Subtract**: Cuts the upper closed shapes out of the bottom one (a shape cut out of the middle of another leaves a hole). A Subtract that leaves nothing deletes them all.
- **Delete**: Deletes the shapes (or, with a gradient stop selected, the stop).
- **Edit art**: With one art layer selected, steps into it ([Editing an Art Layer](#editing-an-art-layer)).

Add and Subtract keep the bottom shape's colors, outline, and place; the others are gone, and curves stay curves. Edges that meet exactly, as Snap to leaves them, join with no seam and no extra points. The first one you use takes a moment to load. A joined or combined shape can't have more than 500 points.

The buttons are icons, each named when you hover over it, and each change is one undo step. On a phone the row is the same, without the hint.

---

## Merge Down, Bake, and Flatten

- **Merge down** on VECTOR merges the picked vector layer into the layer under it. Onto the base, it presses the selected shapes (or, with none selected, all of them, and the layer goes) into the base layer's pixels, where they stop being shapes, with nothing on the canvas changing. Any shape beneath one of them that overlaps it is pressed too. Onto a drawing layer, the whole layer goes, its shapes becoming paint there (or, where paint would show differently by more than a step or two of rounding, cells frozen as they showed, which the converter leaves alone and the paint tools treat as paint), with nothing on the canvas changing. Onto another vector layer, the shapes move to that layer and stay shapes, above the ones already there, so they can still be edited: the selected shapes (the layer stays with the rest), or with none selected all of them, and the layer goes. That needs both vector layers to have the same character settings, since the shapes would look different under other ones. One undo brings the shapes back. A vector layer with its own character settings can't be pressed into the base, and Merge down is off in an animation.
- **Bake**, on a still, presses the shapes on vector layers directly on the base into it (not a layer with its own character settings); shapes higher in the stack stay shapes. In an animation, shapes stay shapes, with the sliders burned into their colors ([Baking](layers.md#baking)).
- **Flatten** turns every shape and art layer, with the rest of the drawing, into plain cells as they show, and the vector layers go ([Flattening](layers.md#flattening)).

---

## Animation

Each frame has its own shapes. A Blank frame carries the shapes before it, as it carries cells, and changing one there makes it that frame's own. With **Animate** on, the outlines of the shapes a Blank frame carries show dimmed on VECTOR. Playing and exports show each frame's shapes.

A shape can tween between its keys, moving, turning, reshaping, and changing color on the frames between. The **Keys** panel over the animation bar shows the selected shape's keys, part by part, to select, ease, add, and delete, and shows each part's value to type over ([Tweens](animation.md#tweens)).

---

## Following a Path

You can attach any shape or art layer to a line or another shape (its path) so it moves along that path during animation ([Following a Path in the Keys Panel](animation.md#following-a-path)):
1. Turn on **Animate**.
2. Select the one shape or art layer you want to animate, with Vector select.
3. In the **Keys** panel, open **+ Add key** and choose **Follow a path…** at the bottom.
4. Click the line or shape you want to follow. A shape that can be the path is drawn thick in the accent color under the pointer. The follower's middle goes onto the path at the point nearest where it was. **Esc**, a click on empty canvas, choosing another tool or tab, or turning Animate off cancels.
5. In the follower's **Along ▾** menu, choose how it follows the path.
6. Mark the path as a **Guide** if you want it to remain invisible in the final artwork.

An art layer can't be a path, nor can a shape that follows one itself, and a shape that others follow can't follow a path (a message says so). A path can have any number of followers.

### How Followers Behave

- **Every frame**: The link lasts the follower's whole life: it's on its path on every frame it's on, whatever is done to the path there (moved, reshaped, tweened). Where the path isn't on a frame, the follower sits where its own Transform has it.
- **On VECTOR**: A selected follower's path is outlined dashed in the accent color. Its own rotation and size still apply about its middle, and the box's handles rotate and scale it as for any shape.
- **Moving**: Dragging a follower with Vector select slides it along its path, to the point nearest where you drag it. The arrow keys step it along by 1%, with **Shift** by 10%. Its X and Y in the Keys panel show where it is, and can't be typed while it follows.
- **Editing**: The Node tool edits a follower's points where it shows; moving them moves its middle, and it re-centers on its path. Stepping into a following art layer draws in it where it shows; drawing outside its box grows the layer, and it re-centers on its path.
- **Copy and paste**: A follower copied with its path follows the pasted path. Pasted alone in the same document, it follows the original; in another document, or where the link can't be made, it follows nothing.
- **Join and Separate**: Join keeps the bottom shape's link; Separate gives it to the piece that keeps the shape.

### The Along Menu

- **Moves**: **Move along path using its own keys** (the Along row's keys say how far along it is), **Stay with line start**, or **Stay with line end** (it sits on the path's Start or End as the path is trimmed on each frame, with no keys of its own).
- **Rotate to face path**: The follower turns the way the path runs, its own rotation on top, so a shape drawn pointing right points along the path (shapes only).
- **Motion**: **Smoothly**, **By half cells**, or **By whole cells**, as a Transform tween's motion, for its place on the path (an art layer always lands on whole cells).
- **Stop following path**: The follower lets go of its path on every frame and goes back to where its own Transform has it. Undo brings the link back.

Each choice is one undo step, and the same on every frame of the follower's life.

### Guides

A guide is a path you don't want drawn. With a shape selected that others follow (or that's a guide already), **Guide** in the Keys panel's top line turns it into one. A guide draws nothing in the cells, the exports, Merge down, or Bake, and shows on VECTOR as a thin dashed outline, even with Animate off; click it on the outline, not inside. Merge down and Bake leave a guide a shape, and merging a path presses its followers with it.

---

## Rooms

In a room, everyone drawing can draw and change shapes, and everyone sees them as they're drawn. A shape is one piece of the drawing, like a cell: when two people change the same shape at once, the change heard last is the one that stays, and undo takes back only your own changes. **Merge down** and **Bake** are the host's. Watchers see the art the shapes make. A room's drawing can have as many vector layers as any drawing, up to its 64 layers in all.

Art layers travel the same way: each one is a single shape, and every edit made inside it reaches everyone as a change to that shape.
- **One at a time**: One person at a time draws in an art layer. While someone is inside one, everyone else sees its box on VECTOR, labeled with who it is (for example, **Ann is currently editing this layer**).
- **Locked for others**: Others can still select it, but they can't step in (**Edit art** is off, and its tooltip says who is drawing), move, restack, or delete it, or undo or redo a change to it. Phosphor says who's drawing there instead.
- **At the same moment**: If two people step into the same layer at once, the one the host hears first keeps it, and the other is stepped out and told who has it.
- **Host actions**: While anyone else is inside an art layer, the host can't **Clear layer**, **Merge down**, **Blend into source image**, **Bake**, **Flatten**, or change the canvas size, since those send everyone the whole document again.
- **Freeing a layer**: The layer is free again once that person steps out, leaves the room, or stops drawing. A host can free a layer held by someone who has gone idle inside it with **Back to watching** in that person's **⋯** menu in **N here** ([Drawing Together](social.md#drawing-together)); they can be made an artist again afterward.

---

## Saving

Shapes are saved as shapes: a `.phosphor` file, autosave, and Versions keep them editable, and an animation's frames each keep their own. Exports (`.ans`, PNG, GIF, and the rest) have the shapes' converted cells, as they show.

---

## Importing SVG

An `.svg` file comes in as shapes, never as a picture, so its curves stay editable: move and scale them, drag their points into line with the cells, recolor them, or change them from frame to frame.

- **From the start screen**: Drop an `.svg` file (or pick one with **Choose a file**) to open it as a new drawing on VECTOR, at the default size, named for the file.
- **Over a drawing**: Dropping one asks what to do. **Add to this drawing** puts its shapes on VECTOR, on the current frame; **Open as new project** replaces the current artwork. In a room, Add is the only choice.
- **Where it lands**: Art bigger than the canvas is scaled down to fit inside it (less a margin of 2 grid pixels), its proportions kept; art that fits keeps its size, one SVG unit to a grid pixel. Either way it's centered. Its size is the file's viewBox (or its width and height when there's no viewBox).
- **Selected**: Everything that came in is selected with Vector select, ready to scale. The whole import is one undo step.
- **Stroke widths**: They scale with the art when it comes in, once. After that they stay as they are when you scale the shapes, as every shape's do (between 0.5 and 64).
- **Colors are the file's**: Black art lands black, so paint the background first, or recolor the shapes with the Fill and Stroke chips.
- **What comes in**: Paths (every command, arcs included), rectangles (rounded too), circles, ellipses, lines, polylines, and polygons, inside groups, nested SVGs, and `use`; every transform; fills and strokes from attributes, `style` attributes, and style sheets, inherited as SVG has them; fill rules, caps, joins, and miter limits; linear and radial gradients on fills and outlines (with their focal points, either units, their transforms, and gradients that take from others; reflect and repeat come in as plain). Each element is one shape, and a path of several parts is one shape of several outlines, its holes kept. SVG strokes are always centered, so imported ones are too.
- **What doesn't**: Text, images, filters, masks, clipping, patterns, markers, and dashes (a dashed line comes in solid). When something is left out, a message says what. Convert text to paths in your vector software before exporting to SVG.
- **Limits**: A file that would go past 1,000 shapes on the frame, or 500 points in one shape, brings nothing in; the message says how many it has, so you can simplify it first. A file that isn't SVG says so and changes nothing.
- **Safety**: Nothing in the file runs or loads: it's read as data, never shown as a page.
