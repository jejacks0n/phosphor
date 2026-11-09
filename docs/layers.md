# Layers

Everything in a Phosphor drawing lives on a layer: the **base layer** underneath, which holds the picture, and a
stack of layers over it, each covering what's under it. A new drawing has one layer on the base, the **edit layer**
("Layer 1"); a **vector layer** holds the VECTOR tab's [shapes](vector.md), and the first shape brings one, directly
on the base. You can add more of either kind and put them in any order. Knowing which is which explains what
the tools, Merge and the eraser do.

## The layers list

**LAYERS**, in the side panel, lists the drawing's layers, the top of the stack first: for a new drawing the edit
layer ("Layer 1"), the vector layer ("Vector 1") if there is one, and the base ("Base"). It shows while the art
is showing; with nothing open, or on SAUCE, it says so instead.

- **Picking a row** picks that layer, and the tabs follow it. The base and the edit layer show PIXEL and
  ANSI; the vector layer shows VECTOR. Every drawing tool acts on the picked layer, the base too
  ([Drawing on the base](#drawing-on-the-base)), and every tool is offered whichever is picked.
  [Selections](#the-select-tool) act on every cells layer that shows, whatever is picked; to leave a layer out,
  hide it. Picking the edit layer or the base from VECTOR goes back to the art tab you last had.
- **+ Layer** and **+ Vector layer**, under the list, add a layer of cells or a vector layer directly above the
  picked one, and pick it. New layers are named "Layer 2", "Vector 2" and so on; a drawing holds at most 64. A
  drawing with shapes already has a vector layer, since its first shape brings it, and a vector layer stays when
  its last shape is deleted. Adding a layer is an undo step.
- **Reordering.** Every row but the base has a **⋯** menu with **Rename**, **Duplicate**, **Delete**, **Move up** and
  **Move down**, and the row drags (with the mouse) to another place in the stack: a line shows where it will land,
  between two rows or directly above the base, never below it. A move is an undo step, and what the drawing shows is
  laid over again in the new order: a layer covers whatever is under it, cells, paint and shapes alike. Each cells
  layer keeps its own cells and paint wherever it sits.
- **Duplicate** puts a copy of the layer directly above it and picks it, named after it ("Layer 2 copy"): a cells
  layer's cells and paint, or a vector layer's shapes, as new shapes that move on their own (one that follows a path
  on the same layer follows the path's copy, and an art layer's drawing comes with it). **Delete** removes the
  layer and what's on it; deleting the picked layer picks the one that was under it. In an animation both work on
  every frame at once, and each is one undo step: undoing a delete brings the layer back with its name and
  everything on every frame, and the strokes made on it before can then be undone too. The base has no ⋯: it
  can't be deleted, duplicated or moved. With the last cells layer above the base deleted, the base is picked and
  the tools draw there; with a vector layer picked meanwhile, there's no cells layer to draw on: a paste, pasted
  text and Merge up say "Add a layer to draw on it." Flatten's "Edit it" with the base picked goes on the topmost
  cells layer, and says the same when there's none. A layer added then starts empty.
- **Click the picked row's name** (or double-click any name, or press F2 on its row) to rename the layer; a
  click on another row only picks it. Enter, or leaving the box, keeps the new name; Escape keeps the old one.
  A name is up to 40 characters, and a blank one puts the default back; one too long for the row shows in
  full when you hover over it. Names are saved with the drawing, and a rename isn't an undo step.
- On a phone there's no side panel: a **Layers** button in the tab bar, left of Animate and there while the art
  shows, opens the same list in a dialog. A pick leaves it open, so a layer can be picked, renamed or hidden
  in one visit; **Done**, Escape or a tap outside closes it.
- In a room, only the host can pick the base: its row is off for an artist. A rename or an eye is yours
  alone there; someone joining gets the host's names, with every layer showing.
- Inside an [art layer](vector.md#art-layers) the vector row shows as picked and the base row is off;
  picking the edit layer steps out of the art layer.
- **Saving.** A `.phosphor` file and autosave keep every layer with what's on it, its name, its eye and its
  character settings. A drawing with no more than the base, one vector layer above it and one layer on top, all
  with the base's character settings, saves as it always has, so an older copy of Phosphor opens it. One with
  more layers, or a layer with settings of its own, saves in a newer form, which an older copy refuses ("Not a
  valid Phosphor project file") rather than opening only part of it.

### Hiding a layer

Each row's **eye** hides or shows its layer. A hidden layer leaves the screen and the exports: what you
see and what you export is everything that shows, with the hidden layer left out. Hiding the base takes
away the picture, the base's own pixels and its pinned characters, and leaves the grid blank under
everything above it. Hiding isn't an undo step, and it doesn't change what's drawn on the layer: show it
again and it's all there. Whether a layer is hidden is saved with the drawing.

- A hidden layer can't be drawn on. With it picked, drawing, erasing, a fill, Flip or typing does nothing,
  and a message says "Show the layer to draw on it". On VECTOR, the shapes of a hidden vector layer can
  still be selected and changed, but an art layer on it can't be stepped into (Edit art), with the same
  message.
- These merges are refused while a layer they read or write is hidden, with "Show the layer to merge it",
  and nothing changes:
  - **Merge up**, **Merge down** and **Into the image**, while the edit layer or the base is hidden;
  - **Bake** and VECTOR's **Merge down**, while the base is hidden;
  - **Bake**, VECTOR's **Merge down**, and a **Merge down** that would take shapes with it, while the vector
    layer is hidden and has shapes. What you hide never goes into the base unseen.

  With the edit layer or the base hidden, Merge down says so when you press it, before it asks how to
  merge.
- **Clear edit layer** is refused the same way while the picked layer is hidden, before it asks: what you can't
  see isn't erased.
- **Flatten** makes its cells from what shows, so a hidden layer's content is left out of the result
  (Undo brings it back).

## The base layer

The base layer is your image. When you load a picture (or start with a blank canvas), Phosphor's
**converter** turns it into character cells:

1. It shrinks the picture to the grid, two colors per cell: one for the top half and one for the
   bottom half.
2. It picks a character for each cell from your **Characters** set, the way **Choose characters**
   says: at random from the **Character seed** (the dice re-rolls it), or by weight in the ASCII
   styles: Monochrome ASCII by brightness, and Color ASCII by intensity (a cell's strongest color),
   so pure red, green or blue gets as heavy a character as white. **Best match** and **By shape**
   choose the character from the picture itself; [Characters](characters.md#how-the-converter-picks-characters)
   describes all three.

In Monochrome ASCII every cell shows white on black, but what you paint still picks the characters by its
brightness (or its shape, with By shape), so on the ANSI tab the foreground and background show as the grays they act as.

The color transforms, adjustments and effects in the sidebar (Brightness, Contrast, Levels, Hue Rotation,
Colorize, Posterize, Threshold, Blur, Edges, Simplify, Sharpen…) change the picture before it's converted.

- **Levels** (Black point, White point, Midtones) runs before the other adjustments: tones at or below the
  black point turn black, tones at or above the white point turn white, the rest spread across the range,
  and Midtones lifts or deepens the middle without moving either end.
- **Posterize** cuts each color channel to the number of steps you set (Off by default), and **Threshold**
  splits the picture into its two colors (black and white by default): tones at or above the level take
  the light one. They run after the other adjustments, Threshold last, and the color palette after them.

### The left column

The settings on the left come in three sections, each following a layer:

- **Drawing** (all layers): the grid's size, the Art style, the font, the color palette with its colors, Dither style
  and Dither, then Transforms and Adjustments. They're the whole drawing's, whichever layer is picked.
- **Characters**, with the picked layer's name (inside an [art layer](vector.md#art-layers), its vector layer's):
  Choose characters, the Characters set, the Character seed, Solids and Pattern light. Each layer has its own
  ([Characters](characters.md#how-the-converter-picks-characters)): changing them changes only how that layer's
  paint, picture or shapes become characters. A line under the title says so for a layer above the base.
- **Picture · Base**: Smoothing and the Image filters, which work on the picture itself. They change only with the
  base picked; with another layer picked they're dimmed, and a line says to pick the base.

A layer whose character settings differ from the base's makes a drawing that saves in the newer form (see **Saving**
under [The layers list](#the-layers-list)) and can't go live in a room, which has one set. In a room the Characters
section is always **Characters · Base**, whichever layer is picked, and every layer takes what you choose there.

You can edit the base like pixels in an image editor. Erasing, Flip FG/BG and merging down change
the base's own pixels, laid over the converted image. They're exact: never resampled, blurred or put
through the effects, so an erased cell stays black (or the palette's darkest color, with a
color-count palette made from a picture that has no black). The effects keep working on the parts of
the image you haven't edited. A part of the picture you move, paste or flip with the Select tool
lands on top of everything, as edit cells that look just as it did where it came from, the way Merge
up makes them ([The Select tool](#the-select-tool)); the color adjustments still apply to them, as
they do to anything drawn. Your original image is never changed, unless you bake (below).

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
- [Shapes](vector.md) are pressed into the base layer's pixels and stop being shapes, so shapes alone make
  Bake available. In an animation they stay shapes, with the sliders burnt into their colors; where a shape's
  edge is soft (an outline's antialiasing), its cells can come out a different color. An [art layer](vector.md#art-layers)
  is pressed in the same way, its characters pinned wherever it showed them, so the base shows exactly what showed; in an
  animation it stays an art layer, with its colors burnt in.
- With the CGA or VGA palette, Bake asks how to keep the colors (not with Dither on, or with Best match or By shape: then it bakes exactly, as other palettes do):
  - **Keep full color** (the default): the picture keeps its in-between colors, so switching the
    palette later still has them. A few cells near the edges between palette colors can come out
    as the neighboring color, more with many sliders on.
  - **Snap to palette colors**: nothing on the canvas changes, but the picture keeps only the
    palette's colors, so switching to full color later won't bring the in-between shades back.
    Your drawing keeps its own colors either way.
- Undo brings the original image and the sliders back. Once you've baked, saving keeps only the
  baked image.

The baked image is the size Phosphor works from to make the preview, not your photo's full size, so
making the grid bigger afterwards works from that smaller image.

### Flattening

**Flatten** (beside Bake in the toolbar; in the Actions menu on narrow screens) is for when the picture
looks the way you want and you're ready to work on it as ANSI. Everything the drawing shows becomes plain
cells, each exactly the character, foreground and background it shows now: the picture as converted (with its
palette, sliders, effects, character choice and Dither), [shapes and art layers](vector.md), your edit cells
and your paint. Then the image is removed. Nothing on the canvas changes, and nothing converts any more, so
the color you pick is the color you see and the color you paint is the color you get.

It asks where the cells go, as opening an ANSI file does:

- **Edit it** (the default): the cells go on the edit layer, over a black base, as if you'd drawn them.
- **Draw on top of it**: the cells are the base layer, every character pinned, and what you draw goes on top.

Afterwards the Transforms, Adjustments and Image Filters sliders are back at neutral, the art style is ANSI,
Dither is off and the character choice is back to its default, since there's nothing left for them to work
on. The palette stays: a Color count palette is kept as the colors it had, so it isn't picked again. If the cells
show a color the palette doesn't have (Color ASCII's in-between colors, or ASCII's white with a palette
without it), it switches to full color, so nothing snaps. With **Draw on top of it**, **All cells** turns on
in PIXEL, as it does for an opened ANSI file. Changing the
palette later can't bring back colors that are gone.

Unlike Bake, which keeps an image for the sliders and effects to keep working on, Flatten ends them. Undo brings
the image, the sliders and your layers back. It's off in an animation, since the picture is under every frame,
and in a room only the host can flatten. For one area, use **Merge up** with a selection: its cells look exactly
as they did, and the sliders keep working on them.

### Shapes

The VECTOR tab's [shapes](vector.md) are drawn where their vector layer sits in the stack, and a new shape goes on
the vector layer picked. A new layer goes directly above the picked one; the vector layer a first shape brings sits
directly on the base, between the base layer's own pixels and the edit layer:

the picture → the base layer's own pixels → shapes → edit cells → paint

They're converted with the picture, so the color sliders, the palette and dither reach them (the image filters
don't). A shape over a pinned character shows its conversion there. When a shape is pressed into the base (Bake,
Merge down), pins it covers go, since its pixels are what shows there now; an art layer's characters become pins instead.

A vector layer higher in the stack converts against everything below it: where a shape reaches a cell, the cell's two
halves take the shape's pixels over what the layers under it show there (a typed character included), and the
converter picks the character from them, with the drawing's character settings. The layers above then cover it as
they cover anything. A cells layer's paint behaves the same way: over a typed character or a pin it tints it, as
paint does on the edit layer, and over converted pixels it's converted with them.

### Art layers

An [art layer](vector.md#art-layers) (**Make art layer**, with the Select tool) takes the drawing in a selection off the
edit layer and puts it on VECTOR, where it's drawn with the shapes: above the base layer's own pixels, and below the edit
cells and paint you draw afterward. Its cells keep their characters and colors exactly, where an art layer is the
topmost thing at a cell.

## Opening ANSI and text files

Drop a `.ans`, `.utf8ans`, `.asc` or `.txt` file on the start screen, or choose one with **Browse Files**,
and it asks what you'd like to do with the art, then opens it as a new document:

- **Edit it**: the art goes on the edit layer, over a plain black base, as if you'd drawn it. Every cell
  is an edit cell, so the eraser on the edit layer, **Clear edit layer** and everything else that works on what
  you've drawn works on it.
- **Draw on top of it**: the art is the base layer, and what you draw goes on top of it. Merge up turns
  it into edit cells later, if you change your mind.
- **Cancel** opens nothing.

Either way:

- **The grid** is the file's size. Its width comes from the file's SAUCE record if it has one; otherwise
  it's 80 columns for a `.ans` and the widest line for the others. Its height is as many lines as the art
  reaches.
- **Every cell keeps its character and colors**, so it looks just as the file does. Opening a file isn't an
  edit, so there's nothing to undo. With **Draw on top of it**, the art is the base layer as if you'd used
  Merge down, and the color sliders, the palette and Bake work on it as they do on any picture. **All cells** turns on
  in the PIXEL view, so each cell shows there as it looks rather than as its two colors.
- **The palette** follows the file: CGA when every color is one of the 16 classic colors written as a 16-color code, otherwise full color.
- **SAUCE** fills the SAUCE tab: title, author, group, date, comments, font name and the 9px font setting.
  Your display font stays as you have it.
- **Bright backgrounds** are kept bright. Blink isn't shown.
- **Characters**: a `.utf8ans` is UTF-8. The other three are UTF-8 when they look like it, and CP437
  otherwise.
- **Limits**: a file over 300 columns, 5,000 lines or 500,000 cells doesn't open. A message says the file's
  size and the limits, and what you had open stays open. A file with no art in it doesn't open either.
- An animated `.ans` (one that moves the cursor or clears the screen) opens as its last screen.

An `.svg` file opens on VECTOR as shapes instead ([Vector shapes](vector.md#importing-svg)).

### Drawing on the base

With the base picked, every tool draws on the base itself, as Merge down's Keep crisp cells would leave it:

- The Pencil, Shapes, the Paint Bucket's Cells, Text and a paste write each cell as it shows: its two colors go
  into the base's two pixels (the background the top, the foreground the bottom) and its character is pinned, so
  the converter keeps it. A cell given only a foreground keeps the background it showed.
- The Brush and paint (the Pencil's Colors only, the Bucket's Normal fill) paint the base's own pixels, which
  the color sliders, the palette and the effects then treat as the picture's.
- Text overwrites there: Insert doesn't push the characters after it along, and Delete in Insert mode does
  nothing.
- The Eraser turns cells black with a pinned space (ANSI view) or pixels black (Pixel view), and Flip swaps a
  cell's two halves.

### Adding a file to the drawing

With a drawing open, dropping one of these files on it asks what to do:

- **Add to this drawing**: the file's art lands as a paste does, floating and selected with the Select tool, at
  the cell you dropped it on (or the top-left of the view, when it's dropped beside the drawing), to drag into
  place. It goes on the layer picked (written into the base, with the base picked), as one undo step. Whatever runs past the canvas edge is cut off. The
  drawing's SAUCE and palette stay as they are.
- **Open to edit** or **Open to draw on top**: it opens in place of this drawing, as **Edit it** or **Draw on
  top of it** do above, asking first if there are unsaved changes. (An `.svg` has one **Open instead**.)
- **Cancel** leaves everything as it was.

In a room where opening isn't allowed, there's no opening; adding works as pasting does.

A **picture** (a PNG, JPEG or other image) dropped on a still drawing asks the same way, outside a room:

- **Add to this drawing** puts it in as paint, fitted to the canvas as an opened picture is, over what's painted
  there: on the cells layer picked ("Add it to Layer 2 as paint, fitted to the canvas."), or, with the base or a
  vector layer picked, on a new cells layer above it, named after the file and picked ("Add it as a new layer,
  fitted to the canvas."). It's one undo step; undoing a new layer's takes the layer away.
- **Open instead** opens it in place of this drawing, asking first if there are unsaved changes.
- **Cancel** leaves everything as it was.

In an animation, or in a room, a dropped picture opens as it always has.

## The edit layer

The edit layer is everything you draw: typed text (Edit Mode), shapes, pasted cells and paint
(Pencil, Brush, Bucket). It always sits on top, and the last edit to a cell wins.

Paint covers half-cells, so it shows through a cell's character: paint on the top half colors the
cell's background, paint on the bottom half its foreground. A cell whose character is solid or
empty (a space, █, ▀ or ▄) has nothing to show through, so under paint it becomes a ▄ half-block
instead. The same goes for the base layer's pinned characters (an opened file's, or ones Merge down
left), shown in the colors they show. Typing or drawing cells (a line box, a Character or Full block shape) over paint replaces
the paint in those cells, so what you wrote shows; with the background set to None, each cell keeps
the background color the paint gave it, as it keeps the picture's or an earlier cell's.
With **By shape** choosing the characters, paint doesn't show through a cell's character: the cell
is chosen again with the paint in it, as it would be after Merge down
([Characters](characters.md#how-the-converter-picks-characters)). Paint is never finer than half a
cell, so on its own it doesn't make quadrants or the rising blocks.

The Pencil and Brush paint over each cell's own character, which shows through: **Colors only**,
the default in their **Draw with** (ANSI view). With **Half-block** each cell they paint becomes a ▄
instead, and the paint colors its two halves, so you draw clean half-blocks. The half you don't
paint keeps its color.

The Pencil's **Single line** and **Double line** (ANSI view) draw box-drawing lines as you drag from cell to
cell: each cell gets the piece its path needs (─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼), so the line turns corners and
joins itself where it crosses back, in the foreground color (and the background color, unless it's
None). A diagonal drag becomes a staircase. With **Connect** on it joins the lines it crosses (┼)
or ends on (┬), and the ones that point into it; off, it draws over them.

**Opacity** is how much one stroke lays at most: going back over the same spot within a stroke
doesn't add more, but with **Build up** on (the default) strokes stack, so two strokes at 50%
make the paint solid. With it off, Opacity is a ceiling: paint never gets more solid than it, and
more strokes only change its color. Within a stroke, **Flow** is how quickly it builds up.

Color adjustments apply to the edit layer too: moving Brightness or Hue changes your edits along
with the picture, and with Threshold on, your paint splits into its two colors as the picture does. The color palette (CGA, VGA, a color count) applies to everything, so an
`.ans` export always fits it. With **Color count**, the colors are picked from everything you see (the
picture, your base edits and your paint), so a color you paint with gets a place in the palette.
The palette updates when you finish a stroke or a shape: while you're painting, the picture holds
still and your stroke shows in its own colors. When the picture has no more colors than the number
you set, it keeps exactly its own; when there are more, a new color can move some untouched cells to
a neighboring palette color as the palette rebalances. (Typed cells' colors don't count toward it
yet.) In an [animation](animation.md) there's one palette for the whole movie, picked from every frame,
so colors stay put from frame to frame.

**Dither** (under the palette, off at 0%) mixes the palette's colors in a fine pattern where the
picture falls between them, so a gradient comes out smooth instead of in flat bands. **Floyd–Steinberg**
scatters them like grain; **Ordered (Bayer)** lays them in a regular crosshatch. It works on the
picture and your base edits, two pixels a cell like everything else, so more columns make a finer
pattern. Paint isn't dithered: it snaps to its nearest palette color, so a color you paint with
shows as that color, and painting doesn't stir the pattern around your stroke. Erasing or moving
base pixels can: with Floyd–Steinberg, the pattern after the change shifts with it.

With **Best match** or **By shape** choosing the characters, Dither works on the cells instead of
the pixels: Floyd–Steinberg carries each cell's error on to the cells after it, and Ordered (Bayer)
nudges each cell by its place in the grid. See [Characters](characters.md#how-the-converter-picks-characters).

## Moving things between layers

- **Merge down** (top toolbar, or the Select tool's row) puts the edit layer into the base layer.
  In an [animation](animation.md) with more than one frame it's off, Into the image too: the base is under
  every frame, so one frame can't go into it.
  With a selection, only what's drawn inside it goes; the rest of the edit layer stays. Each time,
  it asks how:
  - **Keep crisp cells**: paint and cells become base pixels exactly as they show, and your typed and drawn
    cells keep their characters, pinned on the base layer. Nothing is resampled or re-filtered, and
    the effects never touch it. [Shapes](vector.md) go too, first, under the cells and paint, and stop being
    editable: with a selection, every shape touching it goes whole, with any shape beneath one of those that
    overlaps it, so nothing on the canvas changes.
  - **Blend into source image**: your drawing becomes part of the image itself, so every effect applies
    to it, live, like the photo: Edges outlines it, Sharpen sharpens it, and moving the sliders keeps
    changing it. Paint and solid cells (space, █, ▀, ▄) go in as they show, pinned as ▄ so they keep
    showing their two halves; letters and other characters can't become picture pixels, so they
    merge exactly, as does anything drawn in the bars around a picture that doesn't fill the grid.
    Like Bake, the first time makes the picture the working-size copy the preview is made from, so
    growing the grid later works from that, and effects like Edges can shift slightly across the
    picture that first time. With a color-count palette, the palette is worked out again from the
    merged picture, so some colors can shift. When the graphics card can't process a picture as
    long as the grid (most handle the full 5000 lines; some phones stop at 2000 or 4000), it merges
    exactly instead. Shapes stay shapes.
- **Merge up** (the Select tool's row) does the opposite for the base: what the base layer shows —
  its characters and colors, effects included — becomes edit cells, which the seed, character set
  and effects no longer change. With a selection it merges that area; without one, the whole
  canvas. Merging up over a pinned character moves it to the edit layer and removes the pin.
- **Clear edit layer** (top toolbar) removes everything you've drawn on the picked layer. The base layer isn't touched,
  and with the base or a vector layer picked it's off.
  In an animation it clears that layer on the frame showing, what the frame inherits there included; the frame's
  other layers and shapes stay.

## Erasing

The eraser erases the picked layer (the one picked in LAYERS).

- On a **cells layer** (the edit layer or another) it removes that layer's paint and edit cells; the layers over
  and under it stay.
- On the **base** it erases the base layer: the cells go black with a pinned space. Your edits on top
  stay.

Size 1 erases exactly what's under the pointer: one character in the ANSI view, one pixel in
the Pixel view. In the Pixel view the eraser removes paint (on a cells layer) and turns base pixels black
(on the base), leaving the characters as they are, except a ▄ that Half-block made to show paint
(one with no colors of its own): when its cell's last paint is erased, the cell gets its own
character back.

## The Select tool

The Select tool (**M**) selects a rectangle of whole cells, in either view. In the pixel view a cell
is a pixel wide and two tall, so the rectangle's top and bottom keep to every second pixel row there;
it's the same selection in both views, and it stays when you switch. Everything below works the
same in both.

Copy, Cut, Delete, moving, nudging, flipping and rotating act on every cells layer that shows, the base among
them, whatever is picked: hide a layer (its eye in LAYERS) to leave it out. Moved, flipped or rotated, each
layer's part stays on its own layer. Shapes are VECTOR's: Cut, Delete and moves leave them whole where they are,
but **Copy** also takes what the shapes on the vector layers that show show there, as cells, so a paste looks
like what you copied.

- The **base** is the picture. Moved, flipped or rotated, its own pixels and pinned characters go with the block,
  on the base, and the area it came from is erased (black, with pinned spaces). Pasted or stamped, each cell
  lands as it showed: as edit cells that look just as they did where they came from (reduced colors, Best
  match's and By shape's characters, dithering and all), covering what's drawn there.
- A **cells layer** is your typed and drawn cells and paint. A cell with no edit of its own on that layer
  (nothing typed, drawn or painted in it) is see-through: moved, pasted or stamped, it leaves the edits it
  lands on showing, while it floats and once it's set down. A cell with anything in it, even half a cell of
  paint, covers the whole cell under it.
- A **paste** lands on the picked layer as one: the base's cells, then each layer's cells and paint over the
  one under it, then what the shapes showed. With the base picked it's written into the base, as drawing there
  is ([Drawing on the base](#drawing-on-the-base)). A block keeps floating on the layer it was pasted on, and a
  moved one on the layers it was lifted from, whatever you pick meanwhile.
- **Delete** removes your edits from each cells layer that shows and erases the base, if it shows.

**Moving** (dragging inside the selection, or the arrow keys) floats the contents over the canvas
until you're done: you can let go, drag again and nudge as often as you like, and whatever the
block passes over or pauses on comes back as it moves on. It's set down when you deselect (Escape,
**Deselect**, a click outside), select something else, or make any other change, and the whole move
is one undo step. Undo puts the block back where it started and redo where you left it, floating
either way, so you can drag it on. A paste floats the same way, so you can paste and then drag it
into place: the paste is one undo step and moving it another, so undo puts the block back where it
was pasted, and undo again takes it away. The block follows the pointer as you drag, and dragging it (or a new selection) to the edge of the view
scrolls the view, faster the further you go.

**Copy and Cut** also put the selection on your system clipboard, so it pastes outside the tab:

- into **another Phosphor tab** (or window) with everything: characters, colors and paint, what every layer
  you copied shows together, as one layer's. It lands in that document's grid, palette and font, and its color
  sliders apply to the pasted colors as to anything drawn there.
- into **Moebius** with its characters and colors. Moebius's Advanced Color fork shows the exact
  colors; the original Moebius shows the nearest of its 16. A character CP437 doesn't have goes as
  its closest lookalike (or `?`), as in a .ans export. Copy in Chrome for this: Safari and Firefox
  rewrite what a web page puts on the clipboard in ways Moebius can't read, so a copy made in
  either pastes into Moebius as characters only, in Moebius's colors.
- into a terminal, a chat or a text editor as plain text, a line per row.

**Paste** (Cmd/Ctrl+V) pastes whatever you copied last, wherever you copied it:

- a block copied in Phosphor, with its colors and layers;
- a block copied in **Moebius**, with its characters and colors. A bright background comes in
  bright (iCE colors), not blinking. A Moebius file's own palette doesn't travel with a copy, so the
  colors are the standard ones.
- text copied anywhere else, typed in. **PabloDraw** gives other apps only its characters, so art
  copied there comes in as text, in your colors.

A block lands floating and selected, so you can drag it into place, and the paste is one undo step
(moving it is another).
A paste lands at the Edit Mode cursor in Edit Mode, or else at the selection, or the top-left of
the view. A block bigger than the canvas is cut at its edge. The **Paste** button pastes only
what you copied in this tab; with nothing copied here it's off, and its tip points you to Cmd/Ctrl+V.
If your browser doesn't let Phosphor write the clipboard, Cmd/Ctrl+V in the same tab still pastes
the block you copied.

**Stamp** (**S**, or **C** as in Moebius) leaves a copy of the selection where it is and floats the
block on from there, so you can drag or nudge it away and stamp again. Each stamp is its own undo
step. With a selection, **E** deletes it too, and **Enter** sets the block down, like Escape.

**Flip horizontally** (a mirror) and **Flip vertically** turn the selection in place, on the
layers that show. The characters turn with it: box lines (┌ → ┐, ╒ → ╕), half-blocks and quadrants
(▀ → ▄, ▌ → ▐), arrows and triangles (→ ←, ▲ ▼), and brackets and slashes (( ), < >, / \).
Letters, digits and shades stay as they are.

**Rotate 90°** clockwise turns the picture: the paint and the base's pixels, by their real shape, so
a square stays a square (two cells side by side, a cell being twice as tall as it's wide, turn into
two cells side by side). The turned picture lands as ▄ half-blocks in its pixels' colors, and a
Half-block's ▄ goes with its paint. Characters can't turn that way (a cell would land across
half of two), so Rotate is off while the selection has any on the layers that show: typed or drawn
characters on a cells layer, or characters pinned on the base by merging down. A block an odd
number of cells wide turns into a row and a half; the half row left over keeps what was under it.
The rotated block starts at the same top-left corner (moved back onto the canvas if it would run
off it).

A flipped or rotated block floats like a moved one: drag or nudge it on and whatever it covered
comes back, and the turns and moves together are one undo step (for a pasted block, one after the
paste's own).

In Edit Mode, dragging across cells switches to the Select tool and selects them, the way dragging
selects text in a text editor; a plain click still just places the cursor. Shift and the arrow keys
do the same from the cursor's cell. With the Select tool, Shift and the arrow keys grow or shrink
the selection: they move its far corner, so it keeps the corner it started from (the top-left, for
a selection drawn some other way). Each press is an undo step. The arrow keys alone then nudge the
selection, as they always do with the Select tool. A selection made from Edit Mode, by dragging or
with Shift and the arrows, takes you back there when you set it down (**Escape** or **Enter**),
with the cursor where you left it. With a pen (the Apple
Pencil), a tap can wobble a few pixels, even across a cell's edge, and still only place the cursor.

The selection stays as you change tools, and the painting tools (Pencil, Brush, Eraser, Paint
Bucket, Shapes, Flip FG/BG), in either view, change only what's inside it. Choosing Edit Mode drops
it (and the Magic Wand's), since typing goes anywhere; undo brings it back. Every
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

The selection shows as a dashed line around it and, while the Magic Wand is the tool, a tint on
every selected cell, so a scattered selection (every other cell) shows as a pattern. Like the
rectangle, it stays as you change tools (the line stays, the tint goes, so you see what you draw),
and the painting tools change only what's in it: the Paint Bucket inside it recolors just the
selected cells or pixels. Like the rectangle, it goes with you between the views: a cell selected in
the ANSI view is both its pixels in the pixel view, and a cell with either of its pixels selected is
selected in the ANSI view. **Escape**, **Deselect**, a new rectangle, a grid change and a new
document drop it.

**Delete** on the wand's options row (or the Delete or Backspace key, except while typing in Edit
Mode) takes away what's in the selection on the layers that show, in one undo step: from each cells
layer its edit cells and paint, from the base the picture, which turns black, as the Eraser does on
the base (whole cells in the ANSI view, just the selected pixels in the pixel view).

### Recoloring a selection

With the Magic Wand's selection (the wand being the tool) or a Select rectangle (Select being the
tool), the options row has **Set FG** and **Set BG** in the ANSI view: every selected cell takes
your foreground or background color, on the layers that show (each cell where it shows), in one undo step. Only that color
changes: each cell keeps the character and the other color it shows, whatever picked them (Best
match, By shape, dithering, the palette), and paint on it keeps showing the color it gave its half.
Each cell is recolored on the topmost layer that shows with a cell or paint of its own there, else on the base;
hide a layer to leave it out. On a cells layer the cells take it as edit cells, replacing the paint there. On the base it goes into the
picture's own colors (a cell's background is its top pixel, its foreground its bottom one), with the
cell's character pinned, so the converter doesn't pick another for the new colors. Your color shows as the palette and the color sliders make it, as anything you draw
does. The ASCII styles show each character on black in its two pixels' average, so there's no Set
BG, and Set FG on the base recolors both pixels. In the pixel view it's **Fill**: every selected pixel takes your foreground
color, the picture's pixel on the base and paint on each cells layer. A color set to None can't be set; choose one
first.

### Selections and undo

Making, changing or dropping a selection is an undo step too: a wand click, a new rectangle, moving
the rectangle's outline, **Select all**, **Escape** and **Deselect**. Undo brings back the selection
you had before, so a stray wand click is one undo away. These steps don't count as changes to the
document (nothing new to save). A move or paste keeps its selection with it: undoing a move puts the
selection back where the block came from, undoing a pasted block's moves puts it back where the
block was pasted, and redo puts it back on the block. A grid change drops the selection steps, as it
drops the drawing ones.

## Flip FG/BG

Flip acts on the picked layer. On a cells layer it swaps an edit cell's colors or the paint there; on a
cell with neither, the flip goes on that layer as paint, the colors it showed swapped. On the base it swaps
the two halves of each cell's base colors.

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
- Lines and ellipses in Half-block or Full block can use **Half-column detail**: each block is
  placed to the nearest half cell across, so one that falls between two columns is drawn as the
  right half of one cell and the left half of the next (▌▐), and a steep line or a round edge steps
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
  works as in Colors only mode; there's no Feathering. Cells fills text and lines too, since it's
  matching cells rather than flowing around them.
- **Paint Bucket**'s **Gradient** choice fills with a blend from your foreground color to your
  background color instead of one color. **Solid** (to start) is the plain fill. In **Linear** and
  **Spherical** you drag a line, which shows while you drag, and the fill lands when you let go. The
  area is the bucket's usual one: the selection if there is one, otherwise what a click where the
  drag starts would fill, by the same Tolerance, Contiguous, Feathering and Match. **Linear** is
  foreground where you press and background where you let go, with the bands square to the line, so
  a diagonal drag makes a diagonal gradient. Before the press it stays foreground, and past the
  release it stays background. **Spherical** is a circle: foreground at the press, background as far
  out as the line is long, and evenly between. **Shift** snaps the line to steps of 45°. A click
  without a drag fills with solid foreground, and a drag with either color set to None fills nothing
  and says why. In the pixel view, and in the ANSI view's Colors only mode, every grid pixel gets its own
  blended color (blended in sRGB), at the Brush opacity. With the CGA or VGA palette or a color list,
  the blend shows in the palette's colors, banded, as any paint does, and comes back smooth in full
  color. In the ANSI view's **Cells**, the gradient is built from characters in your two colors
  only: █, ▓, ▒, ░ and then a space in the background color. Where two of those meet, the cells mix
  them in an ordered pattern so the bands don't show as hard lines. Where the blend changes faster
  than a cell can show, a half-block (▀ ▄ ▌ ▐) puts the edge mid-cell. Set doesn't apply to a
  gradient: it gives each cell its character and both colors. A gradient is one undo step.
- **Eyedropper**'s **FG** and **BG** toggles choose what a pick sets; in the ANSI view both lit sets both. In
  the pixel view one is lit at a time, and **Shift** picks into the other one (while you hold it, that one is
  lit).
- **The status bar** starts with the name of the picked layer, so a folded panel or a phone still says which
  layer you're on (it isn't there in the pixel view). Then it follows the tool: Edit Mode shows the cell
  under the cursor, Select the selection's size and place, and the Eyedropper its last pick and where
  each color came from.
  On the right it shows that Space pans, and while you hold Alt (Option on a Mac) or Shift, what that key
  does with the tool. When the view is too narrow for all of
  it, the bar scrolls sideways, like the toolbar's options row.
- **Zoom**: the ANSI view zooms from 25% of its cells' size to 800% (100% is the font at its size),
  with Ctrl+wheel (a trackpad pinch), a pinch on a touch screen, or the Zoom tool (**Z**): drag left
  to zoom out, right to zoom in, by half or double every 300 pixels. Away from 100%, the status bar
  shows the zoom; press it to go back to 100%. A room's watchers see the art at up to 100%. The zoom stays when you go to the pixel view and back, and a new font or font size keeps
  it.

### Tool keys

A letter chooses a tool, as in Photoshop, with Moebius's keys where it has the same tool: **P**
Pencil, **B** Brush, **E** Eraser, **G** Paint Bucket, **U** Shapes, **I** Eyedropper, **H** Hand,
**Z** Zoom, **W** Magic Wand, **T** or **K** Edit Mode, **F** Flip and **M** Select, in the views that have the tool
(Edit Mode and Flip are the ANSI view's). Each tool's button shows its key.
In Edit Mode letters type, so press **Escape** to put the cursor away first. Choosing Edit Mode
again brings the cursor back where it was (at the top-left the first time). With the Select tool
and a selection, E, S, C and Enter act on it (see the Select tool). The letters do nothing in text fields.

Each view remembers its own tool, except that Select and the Magic Wand go with you: leave the
pixel or ANSI view with either of them chosen and the other view takes it too.

### Held keys

These work in both the ANSI and the pixel view, for as long as you hold the key:

- **Alt** (Option on a Mac), with the Pencil, Brush, Paint Bucket or Shapes: the Eyedropper. A
  click picks the foreground color; add **Shift** to pick the background color instead.
- **Shift**, with the Pencil or Brush: a click draws a straight line from where your last stroke
  ended (with either of them, in either view) to where you click, and keeps going if you drag.
- **Shift**, while dragging a shape: a Rectangle becomes a square and an Ellipse a circle, and a Line
  snaps to steps of 45°. A Single or Double line runs only straight across or down, Shift or not.
- **Shift**, while dragging the Paint Bucket's Linear or Spherical gradient: the line snaps to steps
  of 45°.
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
