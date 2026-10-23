# Layers

Everything in a Phosphor drawing lives on one of two layers: the **base layer** underneath and the
**edit layer** on top. Knowing which is which explains what the tools, Merge and the eraser do.

## The base layer

The base layer is your image. When you load a picture (or start with a blank canvas), Phosphor's
**converter** turns it into character cells:

1. It shrinks the picture to the grid, two colours per cell: one for the top half and one for the
   bottom half.
2. It picks a character for each cell from your **Characters** set — at random from the
   **Character seed** (the dice re-rolls it), or by brightness in the ASCII styles.

The colour transforms, adjustments and effects in the sidebar (Brightness, Contrast, Hue Rotation,
Colorize, Edges, Flatten, Sharpen…) change the picture before it's converted.

You can edit the base like pixels in an image editor. Erasing, flipping, moving, pasting and
merging down change the base's own pixels, two per cell, laid over the converted image. They're
exact: never resampled, blurred or put through the effects, so a moved block keeps its hard edges
and an erased cell stays black (or the palette's darkest colour, with a colour-count palette
made from a picture that has no black). The effects keep working on the parts of the image you haven't
edited; content you move takes the look it had where it came from. Colour adjustments and the
colour palette still apply to everything. Your original image is never changed.

The base layer also remembers **pinned characters**: cells whose character the converter keeps
instead of picking one, so rolling the seed or changing the character set doesn't change them.
Merge down pins characters (see below), and erasing pins a space. Any other character belongs to
its cell's position: the converter picks it there, whatever colours are underneath.

## The edit layer

The edit layer is everything you draw: typed text (Edit Mode), shapes, pasted cells and paint
(Pencil, Brush, Bucket). It always sits on top, and the last edit to a cell wins.

Paint covers half-cells, so it shows through a cell's character: paint on the top half colours the
cell's background, paint on the bottom half its foreground. A cell whose character is solid or
empty (a space, █, ▀ or ▄) has nothing to show through, so under paint it becomes a ▄ half-block
instead.

Colour adjustments apply to the edit layer too: moving Brightness or Hue changes your edits along
with the picture. The colour palette (CGA, VGA, a colour count) applies to everything, so an
`.ans` export always fits it.

## Moving things between layers

- **Merge down** (top toolbar) puts the whole edit layer into the base layer exactly as it shows:
  paint and cells become base pixels, and your typed and drawn cells keep their characters, pinned
  on the base layer. Nothing is resampled or re-filtered. Afterwards the edit layer is empty.
- **Merge up** (the Select tool's row) does the opposite for the base: what the base layer shows —
  its characters and colours, effects included — becomes edit cells, which the seed, character set
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

- **Base** is the base's colours and any pinned characters. Moving the base moves those and
  leaves the area it came from erased (black, with pinned spaces). Characters the converter picked
  stay where they are, and your edits on top stay too.
- **Edit** is your typed and drawn cells and paint.
- With both on, each layer moves, copies and pastes as itself. Pasting puts base content back on
  the base and edit content on the edit layer.
- **Delete** erases the base (with Base on) and removes your edits (with Edit on).

Choosing another tool drops the selection.

## Flip FG/BG

Flip's **Flip** toggles (**Base**, **Edit**) choose what it flips. **Edit** (the default) swaps an
edit cell's colours or the paint there; on a cell with neither, the flip goes on the edit layer as
paint. **Base** swaps the two halves of each cell's base colours. With both on, both layers flip.

## Other tools

- **Shapes** draw their outline in the foreground colour and fill the inside with the background
  colour; set the background to None for an outline only. In Character mode the shape is the
  character in the foreground colour, the cells' backgrounds are left alone, and **Fill** fills the
  inside with the character too.
- **Color Picker**'s **FG** and **BG** toggles choose what a pick sets; both lit sets both.
- **The status bar** follows the tool: Edit Mode shows the cell under the cursor, Select the
  selection's size and place, and the Color Picker its last pick and where each colour came from.

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
