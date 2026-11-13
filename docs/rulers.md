# Rulers and guides

Rulers count characters along the top and left of PIXEL, ANSI and VECTOR, and guides are lines you
drag out of them to line things up. They help you place art; they are never part of it.

## Turning them on

Choose the Hand. Its options row has a **Rulers** checkbox (off at first; this browser remembers your
choice) and a **Clear guides** button, which removes every guide on the drawing and leaves the zero
points where they are. With Rulers off, the rulers and the guides are hidden, not lost.

The top ruler counts columns and the left one counts rows. Ticks mark every character's edge, longer
at every fifth and tenth from zero, with a number at zero and every tenth (zoomed out, every 20th,
50th or 100th, so the numbers don't crowd). A purple label follows the pointer over the art with that
character's count, and a pink triangle on each ruler marks zero.

## Moving things

Only the Hand moves rulers and guides, or any tool while you hold Space, so a stray drag with the
Pencil never moves one.

- **Drag out of the top ruler** for a horizontal guide, **out of the left one** for a vertical guide.
- **Drag a guide** to move it. Drop it back on a ruler to remove it.
- **Drag a triangle** to move that ruler's zero. **Drag the corner square** to move both.
- **Double-click a triangle** to put its zero back at the top left; double-click the corner for both.

Guides and zero points snap to a character's edge or its middle.

## How the count reads

Zero on an edge: the characters either side are 1 and −1. Zero in the middle of a character: that
character is 0, and the ones beside it are 1 and −1. A guide's number is its distance from zero, such
as 12 or 12½.

- A 41-character-wide emblem with zero on its middle character reads −20 ... 0 ... 20 across its characters. A guide on each side edge
  reads 20½ and −20½, and one through the middle of an outer character reads 20 and −20.
- A 28-character-wide platform has no middle character: its middle is the edge between the 14th and
  15th, and a guide there is 14 characters in from either side.

## What is kept

Guides and zero points are kept for each drawing in this browser. A reload brings them back, and so do
autosave's recent list, Versions, and opening the drawing's saved `.phosphor` file again (every save
of a drawing carries the same id). They never go into exports, never to a room, and moving one is not
an edit: no unsaved mark, nothing to undo.

If a drawing becomes smaller, guides past its edge are hidden until it grows back. A zero past the
edge counts from the edge.
