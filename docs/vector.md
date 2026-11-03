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

## Vector select (V)

- Click a shape to select it. Shift-click adds a shape to the selection, or takes it away.
- The selection gets a box. Drag inside it to move the shapes, drag one of its eight handles to scale them
  from the opposite side (Shift keeps the proportions), or drag the knob above it to rotate them (Shift
  turns in steps of 15°). One shape's box turns with it; several shapes share one box, square to the grid.
- Click empty canvas to deselect.
- Double-click a shape to edit its points.
- The arrow keys nudge the selection a pixel (with Shift, 10). Delete or Backspace deletes it. Esc stops
  editing points, then deselects.

Each drag, nudge or delete is one undo step.

## Shape (U)

Drag from corner to corner for a **Rectangle**, an **Ellipse** or a **Polygon** (**Sides**: 3 to 12). Shift
makes it a square, a circle or a regular polygon. The shape is drawn as you drag, becomes an ordinary
path when you let go (so its points can be edited like any other), and is selected. A click without a drag
makes nothing.

## The options row

With shapes selected (Vector select):

- **Fill** and **Stroke** open a color box: the palette, the recent colors, a color of your own, or
  **None**. **Width** is the outline's width in pixels (0.5 to 64).
- **Forward** and **Back** move the shapes one step up or down the stacking order.
- **Edit points** edits the first shape's points. **Delete** deletes the shapes.

Each change is one undo step; a Width drag is one step when you let go. With the Shape tool (or with
nothing selected), Fill, Stroke and Width are what the next shape gets. Until you change them, the next
shape is filled with the foreground color and has no outline; a shape with neither gets the foreground
color as its fill.

On a phone the row keeps Fill, Stroke, Width and **Points**, and puts Forward, Back and Delete under ⋯.

## Eyedropper (I)

On VECTOR the Eyedropper picks the color the art shows under the pointer and makes it the selected
shapes' Fill (with Shift, their Stroke), as one undo step. With nothing selected, it sets the next shape's.
