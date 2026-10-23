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

The base layer also remembers two things per cell, saved with your project:

- **Erased cells** show as a **blank cell**: a space, in light grey on black.
- **Pinned characters** are cells whose character the converter keeps instead of picking one, so
  rolling the seed or changing the character set doesn't change them. Merge down pins characters
  (see below).

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

- **Merge down** (top toolbar) puts the whole edit layer into the base image. Paint and cells
  become part of the picture, so the effects and adjustments now treat them like the rest of it.
  Your typed and drawn cells keep their characters: they're pinned on the base layer. Afterwards
  the edit layer is empty.
- **Merge up** (the Select tool's row) does the opposite for the base: what the base layer shows —
  its characters and colours, effects included — becomes edit cells, which the seed, character set
  and effects no longer change. With a selection it merges that area; without one, the whole
  canvas. Merging up over a pinned character moves it to the edit layer and removes the pin.
- **Clear edit layer** (top toolbar) removes everything you've drawn. The base layer isn't touched.

## Erasing

The eraser's **Erase** toggles choose what it erases: **Base**, **Edit**, or both (one is always on).

- **Edit** removes paint and edit cells.
- **Base** erases the base layer, leaving blank cells, and removes any pinned characters there.
  Your edits on top stay.
- **Layer aware** (shown while Edit is on, in the ANSI view) takes one layer per pass: the first
  pass removes paint, the next the cells under it, and — with Base on too — the next erases the
  base. Turn it off to erase every chosen layer in one pass.

In the Pixel view the eraser removes paint (Edit) and erases base cells (Base); erased cells show
black there.

## The Select tool

The Select tool's **Layers** toggles (**Base**, **Edit**) choose what Copy, Cut, Delete, moving and
nudging act on:

- **Copy** with Base on copies what the base shows; pasting puts it on the edit layer.
- **Delete** with Base on erases the base there (blank cells); with Edit on it removes your edits.
- **Moving** or nudging with both on moves everything you see and leaves blank cells behind.

## When the grid changes

Changing the grid size keeps the picture where it is relative to the canvas: paint, erased cells
and pinned characters move with it. (Edit cells stay at the same column and row.)
