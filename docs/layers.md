# Layers

Everything in a Phosphor drawing lives on one of two layers: the **base layer** underneath and the
**edit layer** on top. Knowing which is which explains what the tools, Merge and the eraser do.

## The base layer

The base layer is your image. When you load a picture (or start with a blank canvas), Phosphor's
**converter** turns it into character cells:

1. It shrinks the picture to the grid, two colors per cell: one for the top half and one for the
   bottom half.
2. It picks a character for each cell from your **Characters** set — at random from the
   **Character seed** (the dice re-rolls it), or by brightness in the ASCII styles.

The color transforms, adjustments and effects in the sidebar (Brightness, Contrast, Hue Rotation,
Colorize, Edges, Flatten, Sharpen…) change the picture before it's converted.

You can edit the base like pixels in an image editor. Erasing, flipping, moving, pasting and
merging down change the base's own pixels, two per cell, laid over the converted image. They're
exact: never resampled, blurred or put through the effects, so a moved block keeps its hard edges
and an erased cell stays black (or the palette's darkest color, with a color-count palette
made from a picture that has no black). The effects keep working on the parts of the image you haven't
edited; content you move takes the look it had where it came from. Color adjustments and the
color palette still apply to everything. Your original image is never changed, unless you
bake (below).

The base layer also remembers **pinned characters**: cells whose character the converter keeps
instead of picking one, so rolling the seed or changing the character set doesn't change them.
Merge down pins characters (see below), and erasing pins a space. Any other character belongs to
its cell's position: the converter picks it there, whatever colors are underneath.

### The sliders and undo

Moving a slider in Transforms, Adjustments or Image Filters is an undo step, like a brush stroke:
a whole drag is one step, a run of arrow-key nudges on one slider is one step, and so are RESET,
RESET ALL and picking the Colorize or Edges color. Undo goes back through slider moves and drawing
in the order you made them.

### Baking

**Bake** (the flame button in the toolbar, beside Merge down and Clear edit layer; Bake Effects
in the Actions menu on narrow screens) makes the picture as it looks now your image, and
puts the Transforms, Adjustments and Image Filters sliders back to neutral, so you can start another
round on top of the result. Nothing on the canvas changes when you bake:

- Your drawing keeps its colors. The color sliders tint your paint, your edit cells and your
  edits to the base, so baking burns them in; the same goes for your color pair and anything
  you've copied.
- The color palette isn't baked: it keeps applying afterwards.
- With the CGA or VGA palette, Bake asks how to keep the colors:
  - **Keep full color** (the default): the picture keeps its in-between colors, so switching the
    palette later still has them. A few cells near the edges between palette colors can come out
    as the neighboring color, more with many sliders on.
  - **Lock to the palette**: nothing on the canvas changes, but the picture keeps only the
    palette's colors, so switching to full color later won't bring the in-between shades back.
    Your drawing keeps its own colors either way.
- Undo brings the original image and the sliders back. Once you've baked, saving keeps only the
  baked image.

The baked image is the size Phosphor works from to make the preview, not your photo's full size, so
making the grid bigger afterwards works from that smaller image.

## The edit layer

The edit layer is everything you draw: typed text (Edit Mode), shapes, pasted cells and paint
(Pencil, Brush, Bucket). It always sits on top, and the last edit to a cell wins.

Paint covers half-cells, so it shows through a cell's character: paint on the top half colors the
cell's background, paint on the bottom half its foreground. A cell whose character is solid or
empty (a space, █, ▀ or ▄) has nothing to show through, so under paint it becomes a ▄ half-block
instead.

Color adjustments apply to the edit layer too: moving Brightness or Hue changes your edits along
with the picture. The color palette (CGA, VGA, a color count) applies to everything, so an
`.ans` export always fits it. With **Number**, the colors are picked from everything you see (the
picture, your base edits and your paint), so a color you paint with gets a place in the palette.
The palette updates when you finish a stroke or a shape: while you're painting, the picture holds
still and your stroke shows in its own colors. When the picture has no more colors than the number
you set, it keeps exactly its own; when there are more, a new color can move some untouched cells to
a neighboring palette color as the palette rebalances. (Typed cells' colors don't count toward it
yet.)

## Moving things between layers

- **Merge down** (top toolbar, or the Select tool's row) puts the edit layer into the base layer.
  With a selection, only what's drawn inside it goes; the rest of the edit layer stays. Each time,
  it asks how:
  - **Exactly as is**: paint and cells become base pixels exactly as they show, and your typed and drawn
    cells keep their characters, pinned on the base layer. Nothing is resampled or re-filtered, and
    the effects never touch it.
  - **Into the image**: your drawing becomes part of the image itself, so every effect applies
    to it, live, like the photo: Edges outlines it, Sharpen sharpens it, and moving the sliders keeps
    changing it. Paint and solid cells (space, █, ▀, ▄) go in as they show, pinned as ▄ so they keep
    showing their two halves; letters and other characters can't become picture pixels, so they
    merge exactly, as does anything drawn in the bars around a picture that doesn't fill the grid.
    Like Bake, the first time makes the picture the working-size copy the preview is made from, so
    growing the grid later works from that, and effects like Edges can shift slightly across the
    picture that first time. With a color-count palette, the palette is worked out again from the
    merged picture, so some colors can shift.
- **Merge up** (the Select tool's row) does the opposite for the base: what the base layer shows —
  its characters and colors, effects included — becomes edit cells, which the seed, character set
  and effects no longer change. With a selection it merges that area; without one, the whole
  canvas. Merging up over a pinned character moves it to the edit layer and removes the pin.
- **Clear edit layer** (top toolbar) removes everything you've drawn. The base layer isn't touched.

## Erasing

The eraser's **Erase** toggles choose what it erases: **Base**, **Edit**, or both (one is always on).

- **Edit** removes everything on the edit layer: paint and edit cells.
- **Base** erases the base layer: the cells go black with a pinned space. Your edits on top
  stay.
- With both on, one pass erases both.

Size 1 erases exactly what's under the pointer: one character in the ANSI view, one pixel in
the Pixel view. In the Pixel view the eraser removes paint (Edit) and turns base pixels black
(Base), leaving the characters as they are.

## The Select tool

The Select tool's **Layers** toggles (**Base**, **Edit**) choose what Copy, Cut, Delete, moving and
nudging act on:

- **Base** is the base's colors and any pinned characters. Moving the base moves those and
  leaves the area it came from erased (black, with pinned spaces). Characters the converter picked
  stay where they are, and your edits on top stay too.
- **Edit** is your typed and drawn cells and paint.
- With both on, each layer moves, copies and pastes as itself. Pasting puts base content back on
  the base and edit content on the edit layer.
- **Delete** erases the base (with Base on) and removes your edits (with Edit on).

**Copy and Cut** also put the selection's characters on your system clipboard as plain text, a line
per row, so you can paste them into a terminal, a chat or a text editor. **Paste** (Cmd/Ctrl+V)
pastes whatever you copied last: the block you copied in Phosphor, with its colors and layers; or,
if you've copied text anywhere else since, that text, typed in at the Edit Mode cursor (or at the
selection, or the top-left of the view). The **Paste** button always pastes the block you copied in
Phosphor, whatever's on your system clipboard.

In Edit Mode, dragging across cells switches to the Select tool and selects them, the way dragging
selects text in a text editor; a plain click still just places the cursor.

Choosing another tool drops the selection.

## Flip FG/BG

Flip's **Flip** toggles (**Base**, **Edit**) choose what it flips. **Edit** (the default) swaps an
edit cell's colors or the paint there; on a cell with neither, the flip goes on the edit layer as
paint. **Base** swaps the two halves of each cell's base colors. With both on, both layers flip.

## Other tools

- **Shapes** draw their outline in the foreground color and fill the inside with the background
  color; set the background to None for an outline only. In Character mode the shape is the
  character in the foreground color, the cells' backgrounds are left alone, and **Fill** fills the
  inside with the character too.
- **Color Picker**'s **FG** and **BG** toggles choose what a pick sets; both lit sets both.
- **The status bar** follows the tool: Edit Mode shows the cell under the cursor, Select the
  selection's size and place, and the Color Picker its last pick and where each color came from.

## When the grid changes

What a new grid size does depends on the edit layer:

- **With anything on the edit layer** (typed cells, shapes, paint), resizing is a **canvas
  resize**. The picture and everything on it stay exactly where they are; columns and rows are
  added or removed at the right and bottom. What a shrink cuts off isn't lost: it comes back when
  you make the grid bigger again, and it's saved with the project. The aspect-ratio lock is off
  while this applies.
- **With nothing on the edit layer**, resizing **rescales**: the image is converted again at the
  new size. Base edits (erased, moved or merged-down pixels, pinned characters) scale with it, the
  pixels as hard-edged blocks and each pinned character to the cell over where it was.

Clearing or erasing everything on the edit layer brings rescaling back.
