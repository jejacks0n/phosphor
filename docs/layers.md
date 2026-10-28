# Layers

Everything in a Phosphor drawing lives on one of two layers: the **base layer** underneath and the
**edit layer** on top. Knowing which is which explains what the tools, Merge and the eraser do.

## The base layer

The base layer is your image. When you load a picture (or start with a blank canvas), Phosphor's
**converter** turns it into character cells:

1. It shrinks the picture to the grid, two colors per cell: one for the top half and one for the
   bottom half.
2. It picks a character for each cell from your **Characters** set — at random from the
   **Character seed** (the dice re-rolls it), or by weight in the ASCII styles: Monochrome ASCII
   by brightness, and Color ASCII by intensity (a cell's strongest color), so pure red, green or blue
   gets as heavy a character as white.

The color transforms, adjustments and effects in the sidebar (Brightness, Contrast, Hue Rotation,
Colorize, Edges, Flatten, Sharpen…) change the picture before it's converted.

You can edit the base like pixels in an image editor. Erasing, flipping, moving, pasting and
merging down change the base's own pixels, laid over the converted image. They're exact: never
resampled, blurred or put through the effects, so a moved block keeps its hard edges and an erased
cell stays black (or the palette's darkest color, with a color-count palette made from a picture
that has no black). The effects keep working on the parts of the image you haven't edited; content
you move takes the look it had where it came from. A moved, pasted or flipped part of the picture
keeps every pixel the converter made from it, so it shows the same colors where it lands, with the
color adjustments and the color palette (CGA and VGA too) applying to it as they do to the rest of
the picture. With Sharpen on it can differ a little, since sharpening looks at the pixels around it.
Your original image is never changed, unless you bake (below).

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

**Bake** (the flame button in the toolbar, beside Merge down and Clear edit layer; Bake in the
Actions menu on narrow screens) makes the picture as it looks now your image, and
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
instead. Typing or drawing cells (a line box, a Character or Full block shape) over paint replaces
the paint in those cells, so what you wrote shows; with the background set to None, each cell keeps
the background color the paint gave it, as it keeps the picture's or an earlier cell's.

The Pencil and Brush paint over each cell's own character, which shows through: **Normal mode**,
the default in their **Draw with** (ANSI view). With **Half-block** each cell they paint becomes a ▄
instead, and the paint colors its two halves, so you draw clean half-blocks. The half you don't
paint keeps its color.

The Pencil's **Single** and **Double** (ANSI view) draw box-drawing lines as you drag from cell to
cell: each cell gets the piece its path needs (─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼), so the line turns corners and
joins itself where it crosses back, in the foreground color (and the background color, unless it's
None). A diagonal drag becomes a staircase. With **Connect** on it joins the lines it crosses (┼)
or ends on (┬), and the ones that point into it; off, it draws over them.

**Opacity** is how much one stroke lays at most: going back over the same spot within a stroke
doesn't add more, but with **Stack opacity** on (the default) strokes stack, so two strokes at 50%
make the paint solid. With it off, Opacity is a ceiling: paint never gets more solid than it, and
more strokes only change its color. Within a stroke, **Flow** is how quickly it builds up.

Color adjustments apply to the edit layer too: moving Brightness or Hue changes your edits along
with the picture. The color palette (CGA, VGA, a color count) applies to everything, so an
`.ans` export always fits it. With **Color count**, the colors are picked from everything you see (the
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
    merged picture, so some colors can shift. When the graphics card can't process a picture as
    long as the grid (most handle the full 5000 lines; some phones stop at 2000 or 4000), it merges
    exactly instead.
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
(Base), leaving the characters as they are, except a ▄ that Half-block made to show paint
(one with no colors of its own): when its cell's last paint is erased, the cell gets its own
character back.

## The Select tool

The Select tool (**M**) selects a rectangle of whole cells, in either view. In the pixel view a cell
is a pixel wide and two tall, so the rectangle's top and bottom keep to every second pixel row there;
it's the same selection in both views, and it stays when you switch. Everything below works the
same in both.

The Select tool's **Layers** toggles (**Base**, **Edit**) choose what Copy, Cut, Delete, moving and
nudging act on:

- **Base** is the base's colors and any pinned characters. Moving the base moves those and
  leaves the area it came from erased (black, with pinned spaces). Characters the converter picked
  stay where they are, and your edits on top stay too.
- **Edit** is your typed and drawn cells and paint.
- With both on, each layer moves, copies and pastes as itself. Pasting puts base content back on
  the base and edit content on the edit layer.
- **Delete** erases the base (with Base on) and removes your edits (with Edit on).

**Moving** (dragging inside the selection, or the arrow keys) floats the contents over the canvas
until you're done: you can let go, drag again and nudge as often as you like, and whatever the
block passes over or pauses on comes back as it moves on. It's set down when you deselect (Escape,
**Deselect**, a click outside), select something else, or make any other change, and the whole move
is one undo step. A paste floats the same way, so you can paste and then drag it into place. The
block follows the pointer as you drag, and dragging it (or a new selection) to the edge of the view
scrolls the view, faster the further you go.

**Copy and Cut** also put the selection's characters on your system clipboard as plain text, a line
per row, so you can paste them into a terminal, a chat or a text editor. **Paste** (Cmd/Ctrl+V)
pastes whatever you copied last: the block you copied in Phosphor, with its colors and layers; or,
if you've copied text anywhere else since, that text, typed in. Either lands at the Edit Mode
cursor in Edit Mode, or else at the selection, or the top-left of the view. The **Paste** button always pastes the block you copied in
Phosphor, whatever's on your system clipboard.

**Stamp** (**S**, or **C** as in Moebius) leaves a copy of the selection where it is and floats the
block on from there, so you can drag or nudge it away and stamp again. Each stamp is its own undo
step. With a selection, **E** deletes it too, and **Enter** sets the block down, like Escape.

**Flip horizontally** (a mirror), **Flip vertically** and **Rotate 90°** clockwise turn the
selection in place, on the chosen layers. The characters turn with it: box lines (┌ → ┐, ╒ → ╖),
half-blocks and quadrants (▀ → ▄, ▌ → ▐), arrows and triangles (→ ←, ▲ ▼), and brackets and
slashes (( ), < >, / \). Letters, digits and shades stay as they are. A rotated block is as many
cells wide as it was tall, from the same top-left corner (moved back onto the canvas if it would
run off it), so it looks stretched: a cell is twice as tall as it's wide. The turned block floats
like a moved one: drag or nudge it on and whatever it covered comes back, and the turns and moves
together are one undo step.

In Edit Mode, dragging across cells switches to the Select tool and selects them, the way dragging
selects text in a text editor; a plain click still just places the cursor. With a pen (the Apple
Pencil), a tap can wobble a few pixels, even across a cell's edge, and still only place the cursor.

The selection stays as you change tools, and the painting tools (Pencil, Brush, Eraser, Paint
Bucket, Shapes, Flip FG/BG), in either view, change only what's inside it; typing in Edit Mode isn't limited. Every
tool's options row ends with **Deselect** while there's a selection, and Escape drops it too.

## The Magic Wand

The **Magic Wand** (**W**, in both views) selects what matches the cell or pixel you click. In the
ANSI view, **Match** chooses what a cell must share with the one you click: its **FG**, **BG** and/or
character (**Char**); FG and Char to start. In the pixel view it's the pixel's color: the picture and
paint, not the ANSI layer drawn over them. **Tolerance** (0–100, 10 to start) is how far a color may
be from the one you clicked and still match; characters match exactly. With **Contiguous** on it
selects only what touches the click (sharing a side, as the Paint Bucket fills); off, every match.
**Shift**-click adds to the selection. A Select rectangle you made first keeps the wand inside it,
and the wand's selection takes its place.

The selection shows as a tint on every selected cell and a dashed line around it, so a scattered
selection (every other cell) shows as a pattern. Like the rectangle, it stays as you change tools,
and the painting tools change only what's in it: the Paint Bucket inside it recolors just the
selected cells or pixels. It belongs to the view you made it in: switching views drops it, and so do
**Escape**, **Deselect**, a new rectangle, a grid change and a new document.

**Delete** on the wand's options row (or the Delete or Backspace key, except while typing in Edit
Mode) takes away what's drawn in the selection: the edit cells and paint, in one undo step.

## Flip FG/BG

Flip's **Flip** toggles (**Base**, **Edit**) choose what it flips. **Edit** (the default) swaps an
edit cell's colors or the paint there; on a cell with neither, the flip goes on the edit layer as
paint. **Base** swaps the two halves of each cell's base colors. With both on, both layers flip.

## Other tools

- **Shapes** draw their outline in the foreground color and fill the inside with the background
  color; set the background to None for an outline only. In Character mode the shape is the
  character in the foreground color, the cells' backgrounds are left alone, and **Fill** fills the
  inside with the character too. A Single or Double box with **Connect** on joins its frame to the
  lines it crosses or meets, the ones you can see: a line hidden under paint isn't joined.
  **Line** draws a straight line from where you start dragging to where you let go, in the
  foreground color: one pixel thick in the Pixel view (half-blocks in the ANSI view), or whole cells
  in Full block or Character. Single and Double lines run straight across or down, whichever your
  drag is closer to, and join the lines they cross with Connect. **Anti-aliased** lines and ellipses
  share their edges between pixels, or shade cells ░▒▓ in Full block.
- Lines and ellipses in Half-block or Full block can use **Vertical half blocks**: each block is
  placed to the nearest half cell across, so one that falls between two columns is drawn as the
  right half of one cell and the left half of the next (▐▌), and a steep line or a round edge steps
  by half a cell instead of a whole one. In Half-block the blocks are half a cell tall, so the halves
  are quadrants (▝▘, ▗▖). They're always block characters: the parts of a cell the shape doesn't
  cover show the cell's background color, and a filled shape's inside is the background color
  you've picked.
- **Paint Bucket** fills what you see, in the foreground color. Text and lines you've drawn (any
  edit cell whose character isn't a space, █, ▀ or ▄) are walls: a fill stops at them and never
  covers them, so it stays inside a box and leaves your text readable. A line hidden under paint
  isn't a wall, since you can't see it. With a selection, the fill stays inside it, and a click
  outside it fills nothing. In the ANSI view its **Fill** dropdown also offers **Cells**: whole
  cells instead of the color you see. **Match** chooses what a cell must share with the one you
  click (its **FG**, **BG** and/or character, **Char**; all three to start, so cells that look the
  same), with the colors within the **Tolerance**, and **Set** what the fill gives the cells: your
  foreground color (to start), background color and/or character, as edit cells. **Contiguous**
  works as in Normal mode; there's no Feathering. Cells fills text and lines too, since it's
  matching cells rather than flowing around them.
- **Color Picker**'s **FG** and **BG** toggles choose what a pick sets; both lit sets both.
- **The status bar** follows the tool: Edit Mode shows the cell under the cursor, Select the
  selection's size and place, and the Color Picker its last pick and where each color came from.
  On the right it shows the held-key shortcuts for the tool. When the view is too narrow for all of
  it, the bar scrolls sideways, like the toolbar's options row.

### Tool keys

A letter chooses a tool, as in Photoshop, with Moebius's keys where it has the same tool: **P**
Pencil, **B** Brush, **E** Eraser, **G** Paint Bucket, **U** Shapes, **I** Color Picker, **H** Hand,
**Z** Zoom, **W** Magic Wand, **T** or **K** Edit Mode, **F** Flip and **M** Select, in the views that have the tool
(Zoom is the pixel view's; Edit Mode and Flip the ANSI view's). Each tool's button shows its key.
In Edit Mode letters type, so press **Escape** to put the cursor away first; with the Select tool
and a selection, E, S, C and Enter act on it (see the Select tool). The letters do nothing in text fields.

### Held keys

These work in both the ANSI and the pixel view, for as long as you hold the key:

- **Alt** (Option on a Mac), with the Pencil, Brush, Paint Bucket or Shapes: the Color Picker. A
  click picks the foreground color; add **Shift** to pick the background color instead.
- **Shift**, with the Pencil or Brush: a click draws a straight line from where your last stroke
  ended (with either of them, in either view) to where you click, and keeps going if you drag.
- **Space**, with any tool: the Hand, to drag the view around (the middle mouse button does too).
  Space still types in Edit Mode and in text fields.

Let go in the middle of a drag and the tool comes back when the drag ends, so a pick or a pan never
turns into a stroke.

### All the shortcuts

Press **?** for the list of every keyboard shortcut (in Edit Mode, where ? types, press **Alt+?**,
Option+? on a Mac).

### Color keys

As in Moebius, these work with any tool, in Edit Mode while you type too (they never type a
character):

- **Alt+F** (Option+F), or Moebius's **Alt+A**: open the color box on the foreground.
- **Alt+B**: open it on the background.
- In the color box, the **arrow keys** move between the swatches (starting on the current color),
  **Enter** picks one and closes the box, **Space** picks one and leaves it open, and **Escape**
  closes it. With a palette (CGA, VGA, Color count or Color list), every swatch paints its palette
  color whatever the color adjustments are, unless the adjustments can't make that color at all
  (Saturation at 0 makes only grays).
- **Shift+Cmd+X** (Shift+Ctrl+X): swap the foreground and background. Plain **X** swaps them too,
  except in Edit Mode, where it types.

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

The grid can be up to **300 columns** wide and **5000 lines** tall, with **500,000 cells** in all,
so narrow art can run long: 80 and 100 columns reach the full 5000 lines, 160 columns stops at 3125
and 300 at 1666. A picture opens at the current width, or narrower if that's what it takes to fit
its shape.
