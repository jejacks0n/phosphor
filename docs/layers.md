# Layers

Everything in Phosphor is organized into layers:
1. **Base Layer**: The bottom layer containing your background image, converted into character cells.
2. **Vector Layers**: Layers holding editable [vector shapes](vector.md), curves, and [art layers](vector.md#art-layers).
3. **Drawing Layers**: Layers where you draw, paint, and type text cells.

Layers stack from bottom to top. Upper layers cover the layers beneath them. A new drawing (a blank canvas or an
opened picture) has only the base, selected, and the tools draw on it ([Drawing on the Base](#drawing-on-the-base)).
A drawing layer comes when you add one: the first is the **edit layer** ("Layer 1"). Your first shape brings a vector
layer ("Vector 1"), placed directly on the base. You can add more of either kind and put them in any order. Knowing which is which explains what the
tools, Merge down and the Eraser do.

---

## The Layers List

The **LAYERS** panel in the right sidebar lists all layers in your drawing, starting from the top of the stack. It
shows while your art is showing. With nothing open, or on SAUCE, it says "Layers appear when an artwork is open."

- **Selecting a Layer**: Click any layer in the list to select it. The editor tabs update to match: selecting a
  drawing or base layer shows the **PIXEL** and **ANSI** views (**ASCII** in the ASCII art styles), while selecting a
  vector layer shows the **VECTOR** view. Selecting a drawing layer or the base from VECTOR takes you back to the art
  tab you last had.
- **What Tools Act On**: Every drawing tool acts on the selected layer, the base too
  ([Drawing on the Base](#drawing-on-the-base)), and every tool is offered whichever layer is selected.
  [Selections](#the-select-tool) are the exception: most of what they do acts on every drawing layer that shows.
- **Adding Layers**: The header over the list counts your layers ("3 of 64 layers", the base included), with two
  buttons on its right:
  - Click **Add layer** (the cells icon with a plus) to add a new drawing layer directly above the selected layer, or
    **Add vector layer** (the path icon with a plus) to add a new vector layer there. The new layer is selected. Each
    button says its name on hover, or why it's off.
  - New layers are named "Layer 2", "Vector 2" and so on.
  - A drawing can have up to 64 layers. At 64, **Add layer**, **Add vector layer** and **Duplicate** turn off.
  - A vector layer stays when its last shape is deleted.
  - Adding a layer is an undo step.
- **Reordering Layers**: Drag any layer up or down in the stack. A line shows where it will land: between two rows
  or directly above the base, never below it. A move is an undo step. Each layer keeps what's on it wherever it
  sits, and covers whatever is under it, cells, paint and shapes alike.
- **Layer Options (⋯)**: Every row except the base has a **⋯** menu:
  - **Rename**: Gives the layer a custom name.
  - **Duplicate**: Puts a copy directly above the original, named after it ("Layer 2 copy"), and selects it. A
    drawing layer's copy has its cells and paint. A vector layer's copy has its shapes as new shapes that move on
    their own (a shape following a path on the same layer follows the path's copy, and an art layer's drawing comes
    with it).
  - **Delete**: Deletes the layer and all its contents. Deleting the selected layer selects the one under it.
  - **Merge down**: See [Moving Things Between Layers](#moving-things-between-layers).
  - **Move up / Move down**: Shifts the layer one position up or down.
- **Undoing Duplicate and Delete**: Each is one undo step. In an animation, each works on every frame at once.
  Undoing a delete brings the layer back with its name and everything on every frame, selected again if it was, and
  the strokes you made on it before can then be undone too.
- **The Base**: The base has no ⋯ menu. It can't be deleted, duplicated or moved.
- **No Drawing Layer Left**: A new drawing starts this way, and deleting the last drawing layer comes back to it:
  the base is selected, so the tools draw there. In a room an artist can't draw on the base, so a stroke or typing
  says "Add a drawing layer before drawing." until a drawing layer is added. With a
  vector layer selected and no drawing layer to draw on, a paste or pasted text says "Add a drawing layer before
  drawing." A layer you add then starts empty.
- **Renaming**: Click the selected row's name, double-click any name, or press **F2** while its row has keyboard
  focus. A click on another row only selects it.
  - **Enter**, or leaving the box, keeps the new name. **Escape** keeps the old one.
  - A name can be up to 40 characters. A blank name puts the default back. A name too long for the row shows in full
    when you hover over it.
  - Names are saved with the drawing. A rename isn't an undo step.
- **On a Phone**: The side panel comes in over the art from the right. **«** at the right end of the tab bar opens it,
  and selecting a layer leaves it open, so you can select, rename or hide in one visit. **»**, **Escape** or a tap on the
  strip of art beside it shuts it ([The Side Panel](social.md#the-side-panel)).
- **In a Room**: A room starts from any stack, and everyone in it, the host and artists alike, changes the stack:
  **Add layer**, **Add vector layer**, **Duplicate**, **Delete**, **Move up**, **Move down**, dragging and renaming all
  work, and everyone sees the result. Artists draw on any layer but the bottom one.
  - **The Bottom Layer**: The bottom layer is the host's. An artist can't pick it or draw on it, and its row is off for
    an artist. **Merge down**, **Bake** and **Flatten** are the host's too.
  - **Not Undo Steps**: A change to the stack isn't an undo step in a room, as a rename and the eye aren't alone.
    Undoing strokes is as it always is.
  - **Delete Asks First**: In a room **Delete** asks "Delete {name} for everyone?" and says "Everyone in the room loses
    this layer and what's on it. This can't be undone." **Delete layer** deletes it for everyone; **Cancel** keeps it.
    Alone, Delete doesn't ask. A layer someone else has selected can't be deleted: Phosphor says "{name} is working on
    this layer.", with that person's name. A stroke that was on its way when its layer was deleted is left out
    quietly.
  - **Yours Alone**: The eye is each person's own, and so is which layer you've selected, though others see where you
    are by your cursor. A rename goes to everyone.
  - **Not Yet**: Adding a picture to a layer isn't supported in shared rooms yet.
- **Inside an Art Layer**: Inside an [art layer](vector.md#art-layers), its vector layer's row shows as selected,
  and that layer's eye decides whether you can step in and draw. The base row is off. Selecting the edit layer steps
  out of the art layer.
- **Saving**: A `.phosphor` file and autosave keep every layer with its contents, name, eye and character settings.
  - A saved file is compressed, so a drawing that's mostly characters is a fraction of its size as an `.ans`.
    Project files saved before that still open. A copy of Phosphor from before compressed files (a tab left open from
    then) refuses one as an invalid project file until you reload it.
  - Inside, a drawing with no more than the base, one vector layer above it and one drawing layer on top, all with
    the base's character settings, saves in the older form. One with more layers, or a layer with character settings
    of its own, saves in a newer form, which an older copy refuses rather than opening only part of it.

---

## Hiding and Showing Layers

Click the **eye icon** next to any layer to hide or show it:

- **What Hiding Does**: Hidden layers leave the screen and the exports, and the Select tool and Magic Wand leave
  them out of what they select. What you see and what you export is everything that shows.
- **Hiding the Base**: Hides the picture, the base's own pixels and its pinned characters, leaving black under
  everything above it.
- **Nothing Is Lost**: Hiding isn't an undo step, and it doesn't change what's drawn on the layer. Show it again and
  it's all there. Whether a layer is hidden is saved with the drawing.
- **The Palette**: A hidden layer still counts toward the **Limited count** palette. Its colors are picked from every
  layer, hidden ones and a hidden base's picture too, so showing or hiding a layer never changes the colors. In an
  animation, the palette for the whole movie counts every layer of every frame the same way.
- **Drawing on Hidden Layers**: You can't draw, erase, fill, swap colors, type, paste or stamp onto a hidden drawing
  layer or a hidden base. Phosphor tells you to "Make the layer visible to draw on it." **Make art layer** is refused
  the same way while the selected layer, or the vector layer above it, is hidden.
- **Hidden Vector Layers**: On VECTOR, the shapes of a hidden vector layer can still be selected and changed, but you
  can't step into an art layer on it (**Edit art**).
- **Merging**: These are refused with "Make the layer visible to merge it" while a layer they read or write is
  hidden, and nothing changes:
  - **Merge down** (either way), while the layer being merged or the one under it is hidden. A hidden vector layer
    only counts while it has shapes. Merge down says so when you press it, before it asks how to merge.
  - **Bake**, while the base is hidden, or a vector layer with shapes directly on it.

  What you hide never goes into another layer unseen.
- **Clear Layer**: Refused the same way while the selected layer is hidden, before it asks: what you can't see isn't
  erased.
- **Flatten**: Makes its cells from what shows, so a hidden layer is removed, with what's on it. Its dialog says so
  first, and Undo brings it back.

---

## The Base Layer

The base layer holds your source image. When you open a picture (or start a blank canvas), Phosphor's converter
turns it into character cells:

1. It shrinks the picture to the grid's columns and rows, taking two colors per cell: one for the top half and one for
   the bottom half.
2. It picks a character for each cell from your **Characters** set, the way **Choose characters** says. In ANSI the
   choices are **Random** (from the **Character seed**), **Best match** and **By shape**. In Color ASCII they're
   **By intensity** (a cell's strongest color picks the character's weight, so pure red, green or blue gets as heavy a
   character as white) and **By shape**. In Monochrome ASCII they're **By brightness** and **By shape**.
   [How the Converter Picks Characters](characters.md#how-the-converter-picks-characters) describes them all.

In Monochrome ASCII every cell shows white on black, but what you paint still picks the characters by its brightness
(or its shape, with By shape), so in the ANSI view your color pair shows the grays your colors act as.

The Transforms, Adjustments and Image filters in the sidebar change the picture before it's converted:

- **Levels** (**Black point**, **White point**, **Midtones**) runs before the other adjustments. Tones at or below
  the black point turn black, tones at or above the white point turn white, and the rest spread across the range.
  Midtones lifts or deepens the middle without moving either end.
- **Posterize** cuts each color channel to the number of steps you set (Off by default).
- **Threshold** splits the picture into its two colors (**Dark color** and **Light color**, black and white by
  default). Tones at or above the level take the light one.
- Posterize and Threshold run after the other adjustments, Threshold last, and the color palette after them.

### The Left Column

The settings on the left come in sections, each following a layer:

- **Drawing** (all layers): **Dimensions**, **Art style** (ANSI, Color ASCII, Monochrome ASCII), **Font**, and
  **Color palette** with its **Color count** or **Palette colors**. These belong to the whole drawing, whichever
  layer is selected.
- **Transforms**: **Colorize** (with its color), **Hue shift** and **Invert**.
- **Adjustments**: **Brightness**, **Contrast**, **Black point**, **White point**, **Midtones**, **Saturation**,
  **Posterize** and **Threshold** (with its **Dark color** and **Light color**).
- **Characters · (layer name)**: The selected layer's **Choose characters**, **Characters** set (with presets in
  its ▾ menu), **Character seed** (**Generate new seed** shuffles it), **Solids**, **Pattern light**, and for the base
  and a vector layer with a palette, **Dither style** and **Dither**. Inside an [art layer](vector.md#art-layers) it's
  its vector layer's. Some only show when they apply: the seed with Random, Pattern light with Best match or By shape,
  Solids in ANSI with Best match or By shape.
  - Each layer has its own ([Each Layer's Own Character Settings](characters.md#each-layers-own-character-settings)):
    changing them changes only how that layer's paint, picture or shapes become characters. A line under the title
    says so for a layer above the base.
  - A drawing layer has no Dither: paint is never dithered.
  - Every layer converts something (the base its picture, a drawing layer its paint, a vector layer its shapes), so
    the section is always there. A new drawing selects the base, so the picture's own settings show first: select a
    drawing layer to change how its paint becomes characters.
- **Picture · Base**: **Smoothing**. Only with the base selected, and only with a picture: a blank canvas has none.
- **Image filters**: **Blur**, **Simplify**, **Sharpen**, **Edges** (with its color) and **Edge thickness**, which
  work on the picture itself. Only with the base selected, and only while the picture is the one you opened: after a
  Bake, **Blend into source image** or Flatten, a note says image filters require an image instead.

Each section under Drawing folds and unfolds on its title, and your browser remembers which are folded. A folded
slider group says how many of its sliders are on.

A layer whose character settings differ from the base's makes a drawing that saves in the newer form (see
**Saving** under [The Layers List](#the-layers-list)).

### Editing the Base

You can edit the base like pixels in an image editor:

- **Exact Edits**: Painting, erasing, swapping colors and merging down change the base's own pixels, laid over the
  converted image. They're exact: never resampled, blurred or put through the image filters, so an erased cell stays
  black (or the palette's darkest color, with a Limited count palette made from a picture that has no black). The
  filters keep working on the parts of the image you haven't edited.
- **Moving the Picture**: A part of the picture you move, paste or flip with the Select tool stays on the base when
  moved, flipped or rotated, and lands as drawing-layer cells when pasted or stamped
  ([The Select Tool](#the-select-tool)). The color adjustments still apply to it, as they do to anything drawn.
- **Your Original Image**: Never changed, unless you [bake](#baking).

### Pinned Characters

The base layer also keeps **pinned characters**: cells whose character the converter keeps instead of picking one, so
generating a new seed or changing the character set doesn't change them.

- **What Pins**: Writing cells on the base (typing, the Pencil's lines, Shapes, a paste, **Set FG** and **Set
  BG**), Merge down's **Keep crisp cells**, opening a file or flattening with **Draw on top**, and erasing in the ANSI
  view (a pinned space).
- **What Doesn't**: Paint on the base's pixels, and erasing in the PIXEL view.
- **Everything Else**: Any other character belongs to its cell's position. The converter picks it there, whatever
  colors are underneath.

### The Sliders and Undo

Moving a slider in Transforms, Adjustments or Image filters is an undo step, like a brush stroke:

- **Slider Steps**: A whole drag is one step, a run of arrow-key nudges on one slider is one step, and so are
  **Reset**, **Reset all**, and picking the Colorize, Threshold or Edges colors. Undo goes back through slider moves
  and drawing in the order you made them.
- **Characters Steps**: The Characters section's settings are undo steps the same way, on the layer they belong to: a
  choice picked (Choose characters, a preset from ▾, Dither style), a Characters set or seed typed, **Generate new
  seed**, and a Solids, Pattern light or Dither drag or run of nudges.
- **Typing in a Field**: While you're typing in the Characters or seed field, **Cmd+Z** (**Ctrl+Z**) undoes your
  typing there, as in any text field. Once you've pressed **Enter** or left the field, it undoes the step.
- **In a Room**: Each layer keeps its own character settings, and they go to everyone. Only the host changes them: for
  an artist the Characters section shows the selected layer's settings, turned off, with "Only the host changes
  character settings in a room." A change to a layer's isn't an undo step in a room; a change to the base's is the
  host's undo step, as the sliders are.
- **Not Undo Steps**: The grid size, the Art style, the Color palette, the Color count, frames per second and a
  frame's hold. Changing one keeps the undo steps before it: **Cmd+Z** afterward takes back the edit you made before
  the change and leaves the setting as it is, and redo puts that edit back. One exception: paint is kept at up to the
  picture's own resolution, at most 4,000 pixels on a side, so on a large picture a grid grown past that resamples the
  paint, and that forgets the steps before it.

### Baking

**Bake** (the flame button in the toolbar, before Flatten, Merge down and Clear layer; in the **Actions** menu on
narrow screens) makes the picture as it looks now your image, and puts the Transforms, Adjustments and Image filters
sliders back to neutral, so you can start another round of Transforms and Adjustments on top of the result. With the
sliders at their defaults and no shapes to press in, there's nothing to bake: the button is off, and its tooltip says
so. Nothing on the canvas changes when you bake:

- **Your Drawing Keeps Its Colors**: The color sliders tint your paint, your drawing layers' cells and your edits to
  the base, so baking burns them in. The same goes for your color pair and anything you've copied.
- **The Palette Isn't Baked**: It keeps applying afterward.
- **Shapes**: [Shapes](vector.md) on a vector layer directly on the base are pressed into the base layer's pixels and
  stop being shapes, so shapes alone make Bake available. Shapes higher in the stack (over a drawing layer), and on a
  vector layer with its own [character settings](characters.md#each-layers-own-character-settings), stay shapes. In
  an animation they stay shapes, with the sliders burnt into their colors; where a shape's edge is soft (an outline's
  antialiasing), its cells can come out a different color.
- **Art Layers**: An [art layer](vector.md#art-layers) is pressed in the same way, its characters pinned wherever it
  showed them, so the base shows exactly what showed. In an animation it stays an art layer, with its colors burnt in.
- **CGA and VGA**: With the CGA or VGA palette, Bake asks how to keep the colors (not with Dither on, or with Best
  match or By shape: then it bakes exactly, as other palettes do):
  - **Keep full color** (the default): the picture keeps its in-between colors, so switching the palette later still
    has them. A few cells near the edges between palette colors can come out as the neighboring color, more with many
    sliders on.
  - **Snap to CGA colors** (or **Snap to VGA colors**): nothing on the canvas changes, but the picture keeps only the
    palette's colors, so switching to full color later won't bring the in-between shades back. Your drawing keeps its
    own colors either way.
- **Undo**: Brings the original image and the sliders back. Once you've baked, saving keeps only the baked image.
- **Working Size**: The baked image is the size Phosphor works from to make the preview, not your photo's full size,
  so making the grid bigger afterward works from that smaller image. The baked image counts as a working copy, so the
  **Image filters** section no longer shows.
- **In a Room**: Only the host can bake. With others in the room, Bake asks first and warns that baking cannot be
  undone in shared rooms.

### Flattening

**Flatten** (beside Bake in the toolbar; in the **Actions** menu on narrow screens) is for when the picture looks the
way you want and you're ready to work on it as ANSI. Everything the drawing shows becomes plain cells, each exactly
the character, foreground and background it shows now: the picture as converted (with its palette, sliders, effects,
character choice and Dither), [shapes and art layers](vector.md), your drawing layers' cells and your paint. Then the
image is removed. Nothing on the canvas changes, and nothing converts anymore, so the color you pick is the color you
see and the color you paint is the color you get.

It asks where the cells go, as opening an ANSI file does:

- **Edit artwork** (the default): the cells go on one drawing layer, over a black base, as if you'd drawn them.
- **Draw on top**: the cells are the base layer, every character pinned, and what you draw goes on top.

Afterward:

- **Your Layers**: Every other layer goes, its content now in those cells. A hidden layer goes too, with what's on
  it, since it doesn't show; the dialog says so first. The layer that's left shows, with the base's character
  settings.
- **Settings**: The Transforms, Adjustments and Image filters sliders are back at neutral, the Art style is ANSI,
  Dither is off and Choose characters is back to its default. The **Image filters** section no longer shows, since
  there's no image. Transforms and Adjustments still work, tinting what you draw.
- **The Palette Stays**: A Limited count palette is kept as the colors it had, so it isn't picked again. If the cells
  show a color the palette doesn't have (Color ASCII's in-between colors, or ASCII's white with a palette without
  it), it switches to full color, so nothing snaps. Changing the palette later can't bring back colors that are gone.
- **All Cells**: With **Draw on top**, **All cells** turns on in the PIXEL view, as it does for an opened ANSI file.
- **Undo**: Brings the image, the sliders and your layers back.

Unlike Bake, which keeps an image for the sliders to keep working on, Flatten ends the picture. It's off in an
animation, since the picture is under every frame. In a room only the host can flatten, and with others in the room
the dialog warns that flattening cannot be undone in shared rooms.

### Shapes in the Stack

The VECTOR tab's [shapes](vector.md) are drawn where their vector layer sits in the stack, and a new shape goes on the
selected vector layer. A new layer goes directly above the selected one; the vector layer a first shape brings sits
directly on the base, between the base layer's own pixels and the edit layer:

the picture → the base layer's own pixels → shapes → edit cells → paint

- **Converted With the Picture**: Shapes directly on the base are converted with the picture, so the color sliders,
  the palette and Dither reach them (the image filters don't). A shape over a pinned character shows its conversion
  there.
- **Pressed Into the Base**: When a shape is pressed into the base (Bake, Merge down), pins it covers go, since its
  pixels are what shows there now; an art layer's characters become pins instead.
- **Higher in the Stack**: A vector layer higher up converts against everything below it. Where a shape reaches a
  cell, the cell's two halves take the shape's pixels over what the layers under it show there (a typed character
  included), and the converter picks the character from them, with the layer's character settings. The layers above
  then cover it as they cover anything.
- **Paint on a Drawing Layer**: Behaves the same way: over a typed character or a pin it tints it, as paint does on
  the edit layer, and over converted pixels it's converted with them.

### Art Layers

An [art layer](vector.md#art-layers) (**Make art layer**, with the Select tool or the Magic Wand) takes the drawing in a
selection off the selected drawing layer and puts it on the vector layer directly above that layer, adding one there
when the layer above isn't a vector layer. So it's drawn where the cells were: over the layers under it and under the
ones above. Its cells keep their characters and colors exactly, where an art layer is the topmost thing at a cell.

---

## Opening ANSI and Text Files

Drop a `.ans`, `.utf8ans`, `.asc`, `.txt`, `.nfo` or `.diz` file on the start screen, or pick one with **Choose a
file**, and Phosphor asks what you'd like to do with the art, then opens it as a new document:

- **Edit artwork**: The art goes on a drawing layer, over a plain black base, as if you'd drawn it. Every cell is a
  drawing-layer cell, so the Eraser, **Clear layer** and everything else that works on what you've drawn works on it.
- **Draw on top**: The art is the base layer, and what you draw goes on top of it, on an empty Layer 1, selected.
- **Cancel**: Opens nothing.

Either way:

- **The Grid**: The file's size. Its width comes from the file's SAUCE record when that describes character art with
  a width; otherwise it's 80 columns for a `.ans` and the widest line for the others. Its height is as many lines as
  the art reaches. The ANSI view starts at the art's top-left, its first line, as a terminal shows it (centered when
  the whole file fits).
- **Every Cell Keeps Its Character and Colors**: So it looks just as the file does. Opening a file isn't an edit, so
  there's nothing to undo. With **Draw on top**, the art is the base layer as if you'd used Merge down, and the color
  sliders, the palette and Bake work on it as they do on any picture. **All cells** turns on in the PIXEL view, so
  each cell shows there as it looks rather than as its two colors.
- **The Palette**: Follows the file: CGA when every color is one of the 16 classic colors, VGA when it uses 256-color
  codes for the others, and full color when it uses a 24-bit code. An export writes the same kind of codes, 16 and 231
  (fixed black and white) among them, where 0 and 15 would follow a terminal's theme
  ([Saving .utf8ans and .ans](characters.md#saving-utf8ans-and-ans)).
- **SAUCE**: Fills the SAUCE tab: title, author, group, date, comments, font name and letter spacing. Your
  display font stays as you have it. An export writes the record back as it came, with only what you changed on the
  SAUCE tab, and the size after a resize.
- **Bright Backgrounds**: Kept bright. Blink isn't shown.
- **Characters**: A `.utf8ans` is UTF-8, even with a stray byte that isn't (shown as �). One that isn't UTF-8 at all
  (a `.ans` renamed, say) is read as CP437 at 80 columns, as a `.ans` is, and a message says so. The other types are
  read as UTF-8 when they're valid UTF-8 with characters beyond plain ASCII, and as CP437 otherwise.
- **Limits**: A file over 300 columns, 5,000 lines or 500,000 cells doesn't open. A message gives the file's size and
  the limits, and what you had open stays open. A file with no art in it doesn't open either. Either way the message
  comes first: Phosphor reads the file before it asks how to open it, or whether to leave unsaved work.
- **Animated Files**: An animated `.ans` (one that moves the cursor or clears the screen) opens as its last screen.

An `.svg` file opens on VECTOR as shapes instead ([Importing SVG](vector.md#importing-svg)).

### Drawing on the Base

With the base selected, every tool draws on the base itself, as Merge down's **Keep crisp cells** would leave it:

- **Cells**: The Pencil's lines, Shapes, the Paint Bucket's **Cells**, Edit Mode and a paste write each cell as it
  shows: its two colors go into the base's two pixels (the background the top, the foreground the bottom) and its
  character is pinned, so the converter keeps it. A cell given only a foreground keeps the background it showed.
- **Paint**: The Brush and other paint (the Pencil's **Colors only**, the Paint Bucket's **Colors only** fill) paint the
  base's own pixels, which the color sliders, the palette and the image filters then treat as the picture's. A stroke
  builds up there as it does on a layer over the picture: white at full Opacity is as white on the base as on a layer.
- **Typing**: Overwrites there. **Insert** doesn't push the characters after it along, and **Delete** does nothing.
- **Erasing and Swapping**: The Eraser turns cells black with a pinned space (ANSI view) or pixels black (PIXEL
  view), and **Swap cell FG/BG** swaps a cell's two halves.

### Adding a File to the Drawing

With a drawing open, dropping one of these files on it asks what to do:

- **Add to this drawing**: The file's art lands as a paste does, floating and selected with the Select tool, at the
  cell you dropped it on (or the top-left of the view, when it's dropped beside the drawing), to drag into place. It
  goes on the selected layer (written into the base, with the base selected), as one undo step. Whatever runs past
  the canvas edge is cut off. The drawing's SAUCE and palette stay as they are.
- **Open to edit** or **Open to draw on top**: It opens in place of this drawing, as **Edit artwork** or **Draw on
  top** do above. With unsaved changes, these choices say they replace them (the drawing stays in this browser,
  under Pick up where you left off), and choosing one opens the file without asking again.
- **Cancel**: Leaves everything as it was.

An `.svg` dropped on a drawing offers **Add to this drawing**, which adds its shapes to VECTOR on the current frame,
fitted to the canvas and selected, or **Open as new project**. In a room where opening isn't allowed, there's no
opening; adding works as pasting does. Dropping a file while an animation plays pauses it, so the art lands on the
frame showing.

A **picture** (a PNG, JPEG or other image) dropped on a still drawing asks the same way, outside a room:

- **Add to this drawing**: Puts it in as paint, fitted to the canvas as an opened picture is, over what's painted
  there. On a selected drawing layer it's added to that layer. With the base or a vector layer selected, it goes on a
  new drawing layer above it, named after the file and selected. It's one undo step; undoing a new layer's takes the
  layer away. It's refused while the selected drawing layer is hidden, or when a new layer would pass the 64-layer
  limit.
- **Open as new project**: Opens it in place of this drawing. With unsaved changes it says it replaces them, as
  above.
- **Cancel**: Leaves everything as it was.

In an animation, or in a room, a dropped picture isn't added: it opens in place of the drawing.

---

## The Edit Layer

The edit layer ("Layer 1", the first drawing layer you add, or the one an ANSI file opens with), like every drawing
layer, holds what you draw: typed text (Edit Mode), cells drawn with the
Pencil's lines and Shapes, pasted cells, and paint (Pencil, Brush, Paint Bucket). A drawing layer covers the layers
under it, and the last edit to a cell wins.

### Paint and Characters

- **Paint Shows Through**: Paint covers half-cells, so it shows through a cell's character: paint on the top half
  colors the cell's background, paint on the bottom half its foreground.
- **Nothing to Show Through**: A cell whose character is solid or empty (a space, █, ▀ or ▄), or doesn't show (drawn
  in its own background color), has nothing to show paint through, so under paint it becomes a ▄ half-block instead.
  The same goes for the base layer's pinned characters (an opened file's, or ones Merge down left), shown in the
  colors they show. In Color ASCII and Monochrome ASCII there are no half-blocks: a character with nothing to show
  paint through (a space, or one in its own background color) is converted with your ASCII characters, paint and all,
  as an empty cell under paint is, so painting over a typed or opened space shows the paint; a character with ink,
  `█` included, keeps it and is tinted. A pinned ▄ is its two colors, converted the same way.
- **Cells Over Paint**: Typing or drawing cells (a line box, a Character shape, block glyphs) over paint replaces the
  paint in those cells, so what you wrote shows. With the background set to None, each cell keeps the background
  color the paint gave it, as it keeps the picture's or an earlier cell's.
- **By Shape**: With **By shape** choosing the characters, paint doesn't show through a cell's character: the cell is
  chosen again with the paint in it, as it would be after Merge down
  ([How the Converter Picks Characters](characters.md#how-the-converter-picks-characters)).
- **Half a Cell at Most**: Paint is never finer than half a cell, so on its own it doesn't make quadrants or the
  rising blocks.

### Draw With

In the ANSI view, the Pencil and Brush have a **Draw with** menu:

- **Colors only** (the default): They paint over each cell's own character, which shows through. A cell that shows no
  character yet (a blank canvas's black, or the lines added when it grows) becomes a ▄ as they paint it, so a click
  there paints a plain half-block, not the character the converter put there unseen. So does a cell of the layer's
  own that shows no character (a space, or a character in its background's color), and so does a cell Merge down
  froze along a merged shape's edge, whatever its character: its colors become paint first, so the half you don't
  paint looks as it did. Painting in the PIXEL view does
  the same, so the view you paint in never changes what you get; only **Half-block** makes every cell a ▄. In Color
  ASCII and Monochrome ASCII there are no half-blocks: the paint becomes your ASCII characters, whichever style you
  painted it in, and its half-blocks show again when you switch back to ANSI.
- **Half-block**: Each cell they paint becomes a ▄, and the paint colors its two halves, so you draw clean
  half-blocks. The half you don't paint keeps its color.
- **Single line** and **Double line** (Pencil only): Draw box-drawing lines as you drag from cell to cell. Each cell
  gets the piece its path needs (─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼), so the line turns corners and joins itself where it crosses
  back, in the foreground color (and the background color, unless it's None). A diagonal drag becomes a staircase.
  With **Connect** on (the default) it joins the lines it crosses (┼) or ends on (┬), and the ones that point into
  it; off, it draws over them.

### Opacity, Build Up, and Flow

- **Opacity**: How much one stroke lays at most. Going back over the same spot within a stroke doesn't add more.
- **Build up** (on by default): Strokes stack, so two strokes at 50% make the paint solid. With it off, Opacity is a
  ceiling: paint never gets more solid than it, and more strokes only change its color.
- **Flow**: Within a stroke, how quickly the paint builds up.
- **Shared Settings**: The Pencil, Shapes' paint and the Paint Bucket's **Colors only** fill lay paint at the Brush's
  Opacity and Build up.

### Colors and the Palette

- **Adjustments Apply to Drawing Layers**: Moving Brightness or Hue shift changes your edits along with the picture,
  and with Threshold on, your paint splits into its two colors as the picture does.
- **The Palette Applies to Everything**: The color palette (CGA, VGA, Limited count, Custom color list) applies to
  every layer, so a `.ans` export always fits it. Paint and shapes show in the palette's colors in the PIXEL view too,
  on every layer, so they show there in the color of the swatch you painted with (characters show there as they look,
  their two colors blended).
- **Limited Count**: The colors are picked from everything you see (the picture, your base edits and your paint), so a
  color you paint with gets a place in the palette. The palette updates when you finish a stroke or a shape: while
  you're painting, the picture holds still and your stroke shows in its own colors. When the picture has no more
  colors than the number you set, it keeps exactly its own; when there are more, a new color can move some untouched
  cells to a neighboring palette color as the palette rebalances. Typed cells' colors don't count toward it yet.
- **Animation**: In an [animation](animation.md) there's one palette for the whole movie, picked from every frame, so
  colors stay put from frame to frame.

### Dither

**Dither** (in the Characters section once there's a palette, off at 0%) mixes the palette's colors in a fine pattern
where the picture falls between them, so a gradient comes out smooth instead of in flat bands
([Dither](characters.md#dither)):

- **Floyd–Steinberg**: Scatters them like grain.
- **Ordered (Bayer)**: Lays them in a regular crosshatch.
- **What It Works On**: The picture and your base edits, two pixels a cell like everything else, so more columns make
  a finer pattern.
- **Paint Isn't Dithered**: It snaps to its nearest palette color, so a color you paint with shows as that color, and
  painting doesn't stir the pattern around your stroke. Erasing or moving base pixels can: with Floyd–Steinberg, the
  pattern after the change shifts with it.
- **With Best Match or By Shape**: Dither works on the cells instead of the pixels. Floyd–Steinberg carries each
  cell's error on to the cells after it, and Ordered (Bayer) nudges each cell by its place in the grid.
- **Per Layer**: Each layer that converts like a picture has its own Dither and Dither style: the base for its picture,
  a vector layer for its shapes. A vector layer whose Dither is the base's converts with the picture, and dithers with
  it. One with its own dithers its shapes the same way: Ordered nudges each half its shapes cover by its place in the
  grid, so a shape shows the pattern it would on the base; Floyd–Steinberg carries the error between the pixels its
  shapes cover (not into what's under them). While you drag one of its shapes, the pattern outside what you drag holds
  still, and it settles over the whole layer when you let go.
- **Older Drawings**: A drawing from before layers had their own Dither gives every layer the one it had, so it looks
  the same.

---

## Moving Things Between Layers

### Merge Down

**Merge down** puts the selected layer into the layer under it, and the merged layer leaves the stack, so nothing on
the canvas changes. Undo brings it back, selected if it was.

- **Where It Is**: The toolbar, a row's **⋯** menu in LAYERS, and the Select tool's row. The toolbar and ⋯ always merge
  the whole layer. The Select tool's row merges only what's drawn inside the selection while there is one (the layer
  stays with the rest), or the whole layer without one.
- **When It's Off**: With the base selected (nothing is under it), and onto a vector layer, since cells can't become
  shapes: **Make art layer** does that ([Art Layers](#art-layers)). In an [animation](animation.md) with more than one
  frame it's off, since a layer is under every frame, so one frame can't go into it.
- **In a Room**: Only the host merges, into the layer under it, the base included. A layer emptied by a merge leaves the
  stack, as it does alone. With others in the room, the dialog warns that merging down cannot be undone in shared
  rooms. **Make art layer** needs a vector layer directly above the selected layer; without one it's off and says "Add a
  vector layer above {name} first."
- **A Drawing Layer Into a Drawing Layer**: Each of its cells is written on the layer under it as it shows, over that
  layer's paint, and its paint is drawn over that layer's paint. It stays paint, so Blur, Dodge, Burn and the Eraser
  work on it as on any. A cell where the paint would show differently after the merge (a palette or the character
  choice can convert it differently once it's on the layer under), by more than the step or two the same color can
  round apart when it's worked out another way, is written as the character and colors it showed instead, frozen: a
  later palette or character setting doesn't convert that cell again, but to everything else it's still paint. Paint
  on a layer above lays over it as it did, and Blur, Dodge, Burn and Colors only turn it back into paint where they
  reach it, so a merged edge fades like a painted one. The ▄s **Colors only**
  leaves on the cells it painted are paint too, and come down as they are, so in Color ASCII and Monochrome ASCII,
  where they aren't shown, the paint still shows as your ASCII characters.
- **A Vector Layer Into a Drawing Layer**: Its shapes become paint on the layer under it, in their own colors, so Blur
  and the other paint tools work on them as on any paint. A cell where that paint would show differently (the vector
  layer has character settings of its own, or a palette or the character choice converts it differently), by more
  than a step or two of rounding (By shape works a shape's colors out from finer samples than paint has, so a
  gradient comes out a step or two apart all over), is written
  as the cell it shows now, frozen as above (paint to everything but the converter); a cell an art layer gives a
  character is written as that character, yours to keep. It
  goes only whole: with shapes selected on VECTOR, deselect them to merge
  the layer. Its guides, which draw nothing, stay, and the vector layer with them.
- **A Vector Layer Into the Base**: Its shapes are pressed into the base layer's pixels. On VECTOR, with shapes
  selected, Merge down presses only those. A vector layer with its own character settings can't be pressed: it says
  so.
- **A Drawing Layer Into the Base**: Asks how, each time:
  - **Keep crisp cells**: Paint and cells become base pixels exactly as they show, and your typed and drawn cells keep
    their characters, pinned on the base layer. Nothing is resampled or re-filtered, and the image filters never touch
    it.
  - **Blend into source image**: Your drawing becomes part of the image itself, so every slider applies to it, live,
    like the photo. Paint and solid cells (space, █, ▀, ▄) go in as they show, pinned as ▄ so they keep showing their
    two halves; letters and other characters can't become picture pixels, so they merge exactly, as does anything
    drawn in the bars around a picture that doesn't fill the grid. Like Bake, the first time makes the picture the
    working-size copy the preview is made from, so growing the grid later works from that, effects like Edges can
    shift slightly that first time, and the **Image filters** section no longer shows. With a Limited count palette,
    the palette is worked out again from the merged picture, so some colors can shift. When the graphics card can't
    process a picture as long as the grid (most handle the full 5,000 lines; some phones stop at 2,000 or 4,000), it
    merges exactly instead. Shapes stay shapes.

### Clear Layer

**Clear layer** (toolbar) removes everything you've drawn on the selected drawing layer, after asking "Clear (layer
name)?". Undo brings it back.

- **What It Leaves**: The base layer isn't touched. With the base or a vector layer selected it's off, and it isn't on
  the toolbar on VECTOR. In a room only the host can clear, and not while others are drawing.
- **In an Animation**: It clears that layer on the frame showing and stops its carry there: what earlier frames have on
  that layer no longer shows on the cleared frame, even what's drawn on them later, until you draw on it
  ([Carrying and Owning a Cell](animation.md#carrying-and-owning-a-cell)). The frame's other layers and shapes stay.

---

## Erasing

The **Eraser** (**E**) erases the selected layer:

- **On a Drawing Layer**: Removes that layer's paint and cells. The layers over and under it stay.
- **On the Base**: Erases the base layer: the cells go black with a pinned space. Your edits on top stay.
- **Size 1**: Erases exactly what's under the pointer: one character in the ANSI view, one pixel in the PIXEL view.
- **In the PIXEL View**: The Eraser removes paint (on a drawing layer) and turns base pixels black (on the base),
  leaving the characters as they are, except a ▄ that Half-block made to show paint (one with no colors of its own):
  when its cell's last paint is erased, the cell gets its own character back.

---

## Drawing on the Canvas

Phosphor provides two drawing views of the same cells. Most tools work in both; [Other Tools](#other-tools) has the
details.

### ANSI View

In the **ANSI** view, you work with text characters, foreground colors, and background colors:
- **Edit Mode (`T` or `K`)**: Click anywhere on the grid to position the text cursor and type characters, accents, or
  emoji ([Typing Text Directly](characters.md#typing-text-directly)). Press **Insert** (or the Insert / Overwrite
  button in the status bar) to toggle between Insert and Overwrite modes. Edit Mode is only in the ANSI view.
- **Pencil (`P`)**: Paints the foreground color, or draws box-drawing lines with **Single line** and **Double line**
  ([Draw With](#draw-with)).
- **Paint Bucket (`G`)**: Fills the color you see, or with **Cells**, whole cells with your colors and character.
- **Eyedropper (`I`)**: Picks colors from a cell: both colors at first, or the one its **FG** and **BG** toggles
  choose.
- **Swap cell FG/BG (`F`)**: Swaps a cell's two colors ([Swap Cell FG/BG](#swap-cell-fgbg)).

### PIXEL View

The **PIXEL** view lets you paint directly onto the grid's half-cell pixels like a traditional digital painting
canvas:
- **Brush (`B`)**: Paints soft round strokes. Adjust **Size**, **Opacity**, **Flow**, **Hardness** and **Build up** in
  the options bar. It works in the ANSI view too.
- **Retouch Tools** (both views):
  - **Blur (`R`)**: Evens out colors with their neighbors.
  - **Dodge (`O`)**: Lightens colors in shadows, midtones, or highlights.
  - **Burn (`Shift+O`)**: Darkens colors in shadows, midtones, or highlights.
- **Overlay**: The slider in the options bar draws the cells of your layers (or every cell, with **All cells**) over
  the pixels, as the ANSI view shows them. Paint that the art style turns into characters (Colors only's ▄s, in Color
  ASCII and Monochrome ASCII) isn't drawn over: you see the paint itself, blended with what's under it.

---

## The Select Tool

The **Select** tool (**M**) selects a rectangle of whole cells, in either view. In the PIXEL view a cell is a pixel wide
and two tall, so the rectangle's top and bottom keep to every second pixel row there. It's the same selection in both
views, and it stays when you switch. With nothing selected, a click (a tap) selects the one cell under it, an undo
step as any new rectangle is; with a selection, a click outside it drops it, so the next click selects a cell again.
Everything below works the same in both.

### What a Selection Acts On

- **Every Layer That Shows**: Copy, Cut, **Delete**, nudging, **Stamp**, flipping, rotating, **Set FG** and **Set BG**
  act on every drawing layer that shows, the base among them, whatever is selected. Hide a layer (its eye in LAYERS)
  to leave it out. Moved, flipped or rotated, each layer's part stays on its own layer.
- **Dragging and All Layers**: Dragging inside the selection moves only the selected layer's part, unless **All
  layers** is on in the options row (it's off to start), which moves every visible layer. A pasted or stamped block
  drags as one block whatever the setting.
- **Shapes**: Shapes are VECTOR's. Cut, Delete and moves leave them whole where they are, but **Copy** also takes what
  the shapes on the vector layers that show show there, as cells, so a paste looks like what you copied.
- **The Base**: The base is the picture. Moved, flipped or rotated, its own pixels and pinned characters go with the
  block, on the base, and the area it came from is erased (black, with pinned spaces). Pasted or stamped, each cell
  lands as it showed: as drawing-layer cells that look just as they did where they came from (reduced colors, Best
  match's and By shape's characters, dithering and all), covering what's drawn there.
- **A Drawing Layer**: Your typed and drawn cells and paint. A cell with nothing typed, drawn or painted in it on that
  layer is see-through: moved, pasted or stamped, it leaves what it lands on showing, while it floats and once it's
  set down. A cell with anything in it, even half a cell of paint, covers the whole cell under it.
- **Delete**: The **Delete** button, or the **Delete**, **Backspace** or **E** key, removes your edits from each drawing
  layer that shows and erases the base, if it shows.

### Moving a Selection

**Moving** (dragging inside the selection, or the arrow keys) floats the contents over the canvas until you're done:

- **Floating**: You can let go, drag again and nudge as often as you like, and whatever the block passes over or pauses
  on comes back as it moves on.
- **Setting It Down**: It's set down when you deselect (**Escape**, **Enter**, **Deselect**, a click outside), select
  something else, or make any other change. With a button focused, Enter presses the button instead.
- **Undo**: The whole move is one undo step. Undo puts the block back where it started and redo where you left it,
  floating either way, so you can drag it on.
- **Edge Scrolling**: The block follows the pointer as you drag, and dragging it (or a new selection) to the edge of
  the view scrolls the view, faster the further you go.

### Copy, Cut, and Paste

**Copy** and **Cut** (**Cmd/Ctrl+C**, **Cmd/Ctrl+X**) also put the selection on your system clipboard, so it pastes
outside the tab:

- **Another Phosphor Tab** (or window): With everything: characters, colors and paint, what every layer you copied
  shows together, as one layer's. It lands in that document's grid, palette and font, and its color sliders apply to
  the pasted colors as to anything drawn there.
- **Moebius**: With its characters and colors. Moebius's Advanced Color fork shows the exact colors; the original
  Moebius shows the nearest of its 16. A character CP437 doesn't have goes as its closest lookalike (or `?`), as in a
  `.ans` export. Copy in Chrome for this: Safari and Firefox rewrite what a web page puts on the clipboard in ways
  Moebius can't read, so a copy made in either pastes into Moebius as characters only, in Moebius's colors.
- **A Terminal, Chat or Text Editor**: As plain text, a line per row. A cell that shows nothing (its character and
  background are the same color, black on black included) is a space, as in an export.

**Paste** (**Cmd/Ctrl+V**) pastes whatever you copied last, wherever you copied it:

- **From Phosphor**: A block, with its colors and layers.
- **From Moebius**: A block, with its characters and colors. A bright background comes in bright (iCE colors), not
  blinking. A Moebius file's own palette doesn't travel with a copy, so the colors are the standard ones.
- **From Anywhere Else**: Text, typed in. **PabloDraw** gives other apps only its characters, so art copied there comes
  in as text, in your colors.

Where a paste lands:

- **Floating**: A block lands floating and selected, so you can drag it into place. The paste is one undo step and
  moving it another, so undo puts the block back where it was pasted, and undo again takes it away.
- **Position**: At the Edit Mode cursor in Edit Mode, or else at the selection, or the top-left of the view. A block
  bigger than the canvas is cut at its edge.
- **Layer**: On the selected layer, as one: the base's cells, then each layer's cells and paint over the one under it,
  then what the shapes showed. With the base selected it's written into the base, as drawing there is
  ([Drawing on the Base](#drawing-on-the-base)). A block keeps floating on the layer it was pasted on, and a moved one
  on the layers it was lifted from, whatever you select meanwhile.
- **The Paste Button**: Pastes only what you copied in this tab. With nothing copied here it's off, and its tooltip
  points you to **Cmd/Ctrl+V**. If your browser doesn't let Phosphor write the clipboard, **Cmd/Ctrl+V** in the same
  tab still pastes the block you copied.

### Stamp, Flip, and Rotate

- **Stamp** (**S**, or **C** as in Moebius): Leaves a copy of the selection where it is and floats the block on from
  there, so you can drag or nudge it away and stamp again. Each stamp is its own undo step.
- **Flip horizontally** (a mirror) and **Flip vertically**: Turn the selection in place, on the layers that show. The
  characters turn with it: box lines (┌ → ┐, ╒ → ╕), half-blocks and quadrants (▀ → ▄, ▌ → ▐), arrows and triangles
  (→ ←, ▲ ▼), and brackets and slashes (( ), < >, / \). Letters, digits and shades stay as they are. They're buttons,
  with no key.
- **Rotate 90° clockwise**: Turns the picture: the paint and the base's pixels, by their real shape, so a square stays
  a square (two cells side by side, a cell being twice as tall as it's wide, turn into two cells side by side).
  - The turned picture lands as ▄ half-blocks in its pixels' colors, and a Half-block's ▄ goes with its paint.
  - Characters can't turn that way (a cell would land across half of two), so Rotate is off while the selection has
    any on the layers that show: typed or drawn characters on a drawing layer, or characters pinned on the base.
  - A block an odd number of cells wide turns into a row and a half; the half row left over keeps what was under it.
  - The rotated block starts at the same top-left corner (moved back onto the canvas if it would run off it).
  - It's a button, with no key.
- **After a Flip or Rotate**: The block floats like a moved one: drag or nudge it on and whatever it covered comes
  back, and the turns and moves together are one undo step (for a pasted block, one after the paste's own).

### Selecting From Edit Mode

- **Dragging**: In Edit Mode, dragging across cells switches to the Select tool and selects them, the way dragging
  selects text in a text editor. A plain click still just places the cursor. With a pen (the Apple Pencil), a tap can
  wobble a few pixels, even across a cell's edge, and still only place the cursor.
- **Shift and the Arrow Keys**: Do the same from the cursor's cell. With the Select tool, they grow or shrink the
  selection: they move its far corner, so it keeps the corner it started from (the top-left, for a selection drawn
  some other way). Each press is an undo step. The arrow keys alone then nudge the selection.
- **Back to Typing**: A selection made from Edit Mode, by dragging or with Shift and the arrows, takes you back there
  when you set it down (**Escape** or **Enter**), with the cursor where you left it.

### Selections and Other Tools

- **Painting Inside**: The selection stays as you change tools, and the painting tools (Pencil, Brush, Eraser, Paint
  Bucket, Gradient, Blur, Dodge, Burn, Shapes, Swap cell FG/BG), in either view, change only what's inside it.
- **Edit Mode Drops It**: Choosing Edit Mode drops the selection (and the Magic Wand's), since typing goes anywhere;
  undo brings it back.
- **Deselect**: Every tool's options row ends with **Deselect** while there's a selection, and **Escape** drops it too.

---

## The Magic Wand

The **Magic Wand** (**W**, in both views) selects what matches the cell or pixel you click:

- **Match** (ANSI view): Choose what a cell must share with the one you click: its **FG**, **BG** and/or character
  (**Char**). FG and Char to start.
- **In the PIXEL View**: It matches the pixel's color: the picture and paint, not the ANSI layer drawn over them.
- **Tolerance** (0–100, 10 to start): How far a color may be from the one you clicked and still match. Characters
  match exactly.
- **Contiguous**: On, it selects only what touches the click (sharing a side, as the Paint Bucket fills). Off, every
  match across the canvas.
- **Adding**: **Shift**-click adds to the selection.
- **Inside a Rectangle**: A Select rectangle you made first keeps the wand inside it, and the wand's selection takes its
  place.

How the selection behaves:

- **How It Shows**: A dashed line around it and, while the Magic Wand is the tool, a tint on every selected cell, so a
  scattered selection (every other cell) shows as a pattern.
- **Other Tools**: Like the rectangle, it stays as you change tools (the line stays, the tint goes, so you see what you
  draw), and the painting tools change only what's in it: the Paint Bucket inside it recolors just the selected cells
  or pixels.
- **Between Views**: A cell selected in the ANSI view is both its pixels in the PIXEL view, and a cell with either of
  its pixels selected is selected in the ANSI view.
- **Dropping It**: **Escape**, **Deselect**, a new rectangle, a grid change and a new document drop it.
- **Delete**: **Delete** on the wand's options row (or the **Delete** or **Backspace** key, with any tool but Edit Mode)
  takes away what's in the selection on the layers that show, in one undo step: from each drawing layer its cells and
  paint, from the base the picture, which turns black, as the Eraser does on the base (whole cells in the ANSI view,
  just the selected pixels in the PIXEL view).

### Recoloring a Selection

With the Magic Wand's selection (the wand being the tool) or a Select rectangle (Select being the tool), the options
row has **Set FG** and **Set BG** in the ANSI view. With the Select tool they're always first on its row; with nothing
selected they're there but off, after "Click or drag to select, or:" ("Tap" on a touch screen), and pressing them does
nothing until you select cells. With the wand they come at the end of its row, once it has selected something.

- **What Changes**: Every selected cell takes your foreground or background color, on the layers that show, in one
  undo step. Only that color changes: each cell keeps the character and the other color it shows, whatever picked them
  (Best match, By shape, dithering, the palette), and paint on it keeps showing the color it gave its half.
- **Which Layer**: Each cell is recolored on the topmost layer that shows with a cell or paint of its own there, else
  on the base. Hide a layer to leave it out.
- **On a Drawing Layer**: The cells take it as drawing-layer cells, replacing the paint there.
- **On the Base**: It goes into the picture's own colors (a cell's background is its top pixel, its foreground its
  bottom one), with the cell's character pinned, so the converter doesn't pick another for the new colors.
- **How It Shows**: Your color shows as the palette and the color sliders make it, as anything you draw does.
- **ASCII Styles**: They show each character on black in its two pixels' average, so there's no Set BG, and Set FG on
  the base recolors both pixels.
- **In the PIXEL View**: It's **Fill**: every selected pixel takes your foreground color, the picture's pixel on the
  base and paint on each drawing layer.
- **None**: A color set to None can't be set; choose one first.

### Selections and Undo

- **Selection Steps**: Making, changing or dropping a selection is an undo step too: a wand click, a new rectangle,
  moving the rectangle's outline, **Select all**, **Escape** and **Deselect**. Undo brings back the selection you had
  before, so a stray wand click is one undo away.
- **Not Changes**: These steps don't count as changes to the document (nothing new to save).
- **Moves and Pastes**: A move or paste keeps its selection with it: undoing a move puts the selection back where the
  block came from, undoing a pasted block's moves puts it back where the block was pasted, and redo puts it back on the
  block.
- **Rescaling**: A grid change that rescales drops the selection steps.

---

## Swap Cell FG/BG

**Swap cell FG/BG** (**F**, ANSI view) acts on the selected layer. On a drawing layer it swaps a cell's colors or the
paint there; on a cell with neither, the swap goes on that layer as paint, the colors it showed swapped. On the base it
swaps the two halves of each cell's base colors.

---

## Other Tools

- **Shapes** (**U**): **Rectangle**, **Ellipse** or **Line**. They draw their outline in the foreground color and fill
  the inside with the background color; set the background to None for an outline only. In the ANSI view, **Draw
  with** chooses how:
  - **Single line** and **Double line** (rectangles and lines; an ellipse set to them draws as Half-block): box-drawing
    frames. With **Connect** on, a box joins its frame to the lines it crosses or meets, the ones you can see: a line
    hidden under paint isn't joined.
  - **Half-block** and **Full-block**: paint over the cells, showing through their characters, at half-cell or whole-cell
    detail. **Write block glyphs** (off to start) writes real ▄ or █ characters instead.
  - **Character**: the shape is the active character in the foreground color, and the cells' backgrounds are left
    alone. **Fill** fills the inside with the character too. It isn't offered when the active character is ▀, ▄ or █.
- **Line**: Draws a straight line from where you start dragging to where you let go, in the foreground color: one pixel
  thick in the PIXEL view and in Half-block, or whole cells in Full-block or Character. Single and Double lines run
  straight across or down, whichever your drag is closer to, and with Connect join the lines they cross (╫) or end on
  (╟), never running past the line they end on.
- **Anti-aliased**: Lines and ellipses share their edges between pixels. In Full-block with **Write block glyphs**
  they shade cells ░▒▓.
- **Half-column detail**: Lines and ellipses in Half-block or Full-block can place each block to the nearest half cell
  across, so one that falls between two columns is drawn as the right half of one cell and the left half of the next
  (▌▐), and a steep line or a round edge steps by half a cell instead of a whole one. In Half-block the blocks are half
  a cell tall, so the halves are quadrants (▝▘, ▗▖). They're always block characters: the parts of a cell the shape
  doesn't cover show the cell's background color, and a filled shape's inside is the background color you've picked.
- **Paint Bucket** (**G**): Fills what you see, in the foreground color.
  - **Walls**: Text and lines you've drawn (any drawing-layer cell whose character isn't a space, █, ▀ or ▄) are walls:
    a fill stops at them and never covers them, so it stays inside a box and leaves your text readable. A line hidden
    under paint isn't a wall, since you can't see it.
  - **Options**: **Tolerance**, **Contiguous** (off fills every match across the canvas) and **Feather**, which softens
    the filled edge.
  - **Selections**: With a selection, the fill stays inside it, and a click outside it fills nothing.
  - **Cells**: In the ANSI view its **Fill** menu offers **Colors only** (to start) and **Cells**: whole cells instead of
    the color you see. **Match** chooses what a cell must share with the one you click (its **FG**, **BG** and/or
    character, **Char**; all three to start, so cells that look the same), with the colors within the Tolerance, and
    **Set** what the fill gives the cells: your foreground color (to start), background color and/or character. There's
    no Feather. Cells fills text and lines too, since it's matching cells rather than flowing around them.
- **Gradient** (**Shift+G**, sharing the Paint Bucket's button): Fills with a blend from your foreground color to your
  background color instead of one color.
  - **Shape**: **Linear** (to start) or **Spherical**. You drag a line, which shows while you drag, and the fill lands
    when you let go.
  - **The Area**: The Paint Bucket's usual one: the selection if there is one, otherwise what a click where the drag
    starts would fill, by the same Tolerance, Contiguous, Feather and Match.
  - **Linear**: Foreground where you press and background where you let go, with the bands square to the line, so a
    diagonal drag makes a diagonal gradient. Before the press it stays foreground, and past the release it stays
    background.
  - **Spherical**: A circle: foreground at the press, background as far out as the line is long, and evenly between.
  - **Shift** snaps the line to steps of 45°. A click without a drag fills nothing, and a drag with either color set to
    None fills nothing and says why.
  - **Colors**: In the PIXEL view, and in the ANSI view's **Colors only**, every grid pixel gets its own blended color
    (blended in sRGB), at the Brush opacity. With the CGA or VGA palette or a color list, the blend shows in the
    palette's colors, banded, as any paint does, and comes back smooth in full color.
  - **Cells**: In the ANSI view's **Cells**, the gradient is built from characters in your two colors only: █, ▓, ▒, ░
    and then a space in the background color. Where two of those meet, the cells mix them in an ordered pattern so the
    bands don't show as hard lines. Where the blend changes faster than a cell can show, a half-block (▀ ▄ ▌ ▐) puts
    the edge mid-cell. Set doesn't apply to a gradient: it gives each cell its character and both colors.
  - **Undo**: A gradient is one undo step.
- **Retouch** (one button): **Blur** (**R**), **Dodge** (**O**) and **Burn** (**Shift+O**), in both views. They're soft
  round brushes, like the Brush, that change colors instead of laying your own:
  - **Dodge** lightens, **Burn** darkens, and **Blur** evens each spot out with the ones around it.
  - **On a Drawing Layer**: They change only what that layer holds, never the layers under it: where it has nothing,
    nothing changes. Its empty parts count as clear, so Blur fades the edge of your paint out into the clear beside it
    (a little paint spreads just past the edge, in its own color), while a solid patch stays solid; Dodge and Burn
    keep paint as see-through as it was.
  - **On the Base**: They change the picture's colors as they show.
  - **Size** and **Hardness** work as the Brush's. **Strength** is how far one stroke goes, and going over a spot again
    in the same stroke adds nothing, so stroke again to go further.
  - **Range** (Dodge and Burn) chooses the colors they change most: **Shadows** the dark ones, **Highlights** the light
    ones, **Midtones** (to start) the ones between, leaving black and white alone.
  - **Characters Stay**: They change colors, never characters, in both views. On a drawing layer a cell with colors of
    its own (one you typed, or art you opened) keeps its character and has its colors changed, a whole cell at a time
    (a color set to None stays None), as a character pinned on the base does. Blur evens a cell's colors with the
    layer's other cells around it, foreground with foreground and background with background, and spreads them into
    the clear around it as paint, so text and ASCII art get a soft glow. A cell can't be partly see-through, so the
    cell itself doesn't fade. A cell Merge down froze (the edge of a merged shape) is paint to them: where a stroke
    changes it, it becomes the paint it showed and fades like the paint beside it. A cell the Brush made a ▄ holds
    only its character, its colors being paint, so its paint changes.
  - **In the PIXEL View**: Each grid pixel's color is changed and laid back (as the layer's paint, or the base's pixels;
    a character pinned on the base keeps its background in its top pixel and its foreground in its bottom one).
  - **In the ANSI View**: The same as in the PIXEL view, pixel by pixel, as the Brush paints: a small brush can change
    one half of a cell and leave the other. On the base the picture's pixels change and the characters follow, picked
    afresh from the new colors, with nothing pinned, so switching **Choose characters** afterward picks them again.
    A character pinned on the base stays: its cell's colors change, and Blur evens them with the cells around it,
    foreground with foreground and background with background (a pinned cell that shows no character still shows
    none).
  - They read the colors as stored, before the color adjustments, so with a palette the result shows in the palette's
    colors, as any paint does. With a selection, they stay inside it. A stroke is one undo step.
- **Eyedropper** (**I**): Its **FG** and **BG** toggles choose what a pick sets.
  - **In the ANSI View**: Both lit (to start) sets both. **Shift**-click picks only the foreground, **Alt**-click only
    the background.
  - **In the PIXEL View**: One is lit at a time, and **Shift** picks into the other one (while you hold it, that one is
    lit).
- **The Status Bar**: Starts with the name of the selected layer, so a folded panel or a phone still says which layer
  you're on. Then it follows the tool: Edit Mode shows the cell under the cursor, Select the selection's size and place,
  and the Eyedropper its last pick and where each color came from. On the right it shows that Space pans, and while you
  hold Alt (Option on a Mac) or Shift, what that key does with the tool, then its buttons: the zoom (away from 100%),
  **Overwrite** or **Insert** in Edit Mode, **Canvas** or **DOM**, and **Smooth**. When the view is too narrow for all
  of it, the readout wraps onto another line a part at a time (Col and Row, Char, FG, BG), so nothing in it is cut off,
  and only the buttons scroll sideways, faded at the edge while there are more. The readout keeps room for its largest
  numbers, so moving the cursor doesn't change how it wraps. A long layer name is cut short; hover it for the whole
  name.
- **Zoom** (**Z**): The ANSI view zooms from 25% of its cells' size to 800% (100% is the font at its size), with
  Ctrl+wheel (a trackpad pinch), a pinch on a touch screen, or the Zoom tool: drag left to zoom out, right to zoom in,
  by half or double every 300 pixels. **Cmd++** and **Cmd+−** (Ctrl on Windows and Linux) double or halve it around
  the center of the view, and **Cmd+0** goes back to 100%; in the PIXEL view they zoom it too, and Cmd+0 goes back to
  the zoom it opens at. In the art views these keys replace the browser's own zoom. Away from 100%, the status bar
  shows the zoom; press it to go back to 100%. A room's watchers see the art at up to 100%. The zoom stays when you go to the PIXEL view and back, and a new font or
  font size keeps it.

---

## Keyboard Shortcuts

- **Space**: Hold Space with any tool to pan the canvas (or use the middle mouse button). Space still types in Edit
  Mode and in text fields.
- **Alt / Option**: Hold Alt with the Pencil, Brush, Paint Bucket, Gradient or Shapes to switch to the Eyedropper
  ([Held Keys](#held-keys)).
- **Cmd / Ctrl + Z**: Undo your last action.
- **Cmd / Ctrl + Shift + Z**: Redo.
- **Cmd / Ctrl + C / X / V**: Copy, cut, and paste selections. **Cmd / Ctrl + A** selects the whole canvas.
- **Cmd / Ctrl + S**: Save the project. **Cmd / Ctrl + E**: Export.
- **F1 to F12**: In Edit Mode, type characters from your active character palette
  ([Typing Text Directly](characters.md#typing-text-directly)). On a Mac you may need to hold **Fn**, or turn on
  "Use F1, F2, etc. keys as standard function keys" in System Settings → Keyboard → Keyboard Shortcuts… → Function Keys.
- **?**: Opens the full keyboard shortcut list ([All the Shortcuts](#all-the-shortcuts)).

### Tool Keys

A letter chooses a tool, as in Photoshop, with Moebius's keys where it has the same tool: **P** Pencil, **B** Brush,
**E** Eraser, **G** Paint Bucket, **Shift+G** Gradient, **R** Blur, **O** Dodge, **Shift+O** Burn, **U** Shapes, **I**
Eyedropper, **H** Hand, **Z** Zoom, **W** Magic Wand, **T** or **K** Edit Mode, **F** Swap cell FG/BG and **M** Select,
in the views that have the tool (Edit Mode and Swap cell FG/BG are the ANSI view's). Each tool's tooltip shows its key.

- **Shared Buttons**: Some tools share a button: the Paint Bucket and Gradient; Blur, Dodge and Burn; Select and the
  Magic Wand; the Hand and Zoom; and on VECTOR the Vector select and Node tools. The button shows the one you chose
  last (the first until then); click it to use that one. Its corner, a long press or a right-click opens the rest, each
  with its key (not on a phone). A tool's key chooses it whichever one the button shows. When the toolbar is too
  narrow, the ⋯ menu lists the shared button's tools one by one.
- **Edit Mode**: Letters type, so press **Escape** to put the cursor away first. Choosing Edit Mode again brings the
  cursor back where it was if that's in view, or else to the top-left of the view (there the first time); choosing it
  never scrolls, nor does a click that places the cursor.
- **With a Selection**: With the Select tool and a selection, **E**, **S**, **C** and **Enter** act on it
  ([The Select Tool](#the-select-tool)).
- **Text Fields**: The letters do nothing in text fields.
- **Each View's Tool**: Each view remembers its own tool, except that Select and the Magic Wand go with you: leave the
  PIXEL or ANSI view with either of them chosen and the other view takes it too.

### Held Keys

These work in both the ANSI and the PIXEL view, for as long as you hold the key:

- **Alt** (Option on a Mac), with the Pencil, Brush, Paint Bucket, Gradient or Shapes: the Eyedropper. A click picks
  the foreground color; add **Shift** to pick the background color instead. In the ANSI view it reads the cell as the
  Eyedropper does, so on an opened `.ans` it gets the character's colors, not the picture under it.
- **Shift**, with the Pencil, Brush, Blur, Dodge or Burn: a click draws a straight line from where your last stroke
  ended (with any of them, in either view) to where you click, and keeps going if you drag.
- **Shift**, while dragging a shape: a Rectangle becomes a square and an Ellipse a circle, and a Line snaps to steps of
  45°. A Single or Double line runs only straight across or down, Shift or not.
- **Shift**, while dragging a Gradient: the line snaps to steps of 45°.
- **Space**, with any tool: the Hand, to drag the view around (the middle mouse button does too).

Let go in the middle of a drag and the tool comes back when the drag ends, so a pick or a pan never turns into a
stroke.

### Color Keys

As in Moebius, these work with any tool, in Edit Mode while you type too (they never type a character):

- **Alt+F** (Option+F), or Moebius's **Alt+A**: Open the color picker on the foreground.
- **Alt+B**: Open it on the background.
- **In the Color Picker**: The **arrow keys** move between the swatches (starting on the current color), **Enter**
  picks one and closes the picker, **Space** picks one and leaves it open, and **Escape** closes it.
- **Pick from the screen** (the eyedropper beside **Swap**, in Chrome, Edge and the desktop app): Click it, then click
  anywhere on your screen, another window or app included, to take that color for the side that's open. **Escape** puts
  the eyedropper away without choosing. The **Picker** tool (**I**) still takes colors from the drawing itself.
- **With a Palette** (CGA, VGA, Limited count or Custom color list): Every swatch paints its palette color whatever the
  color adjustments are. A color the adjustments can't make at all (Saturation at 0 makes only grays) shows under a "no"
  sign (a circle with a slash) and can't be picked, and the arrows, and **Alt+↑** and **Alt+↓** in Edit Mode, step past
  it.
- **Shift+Cmd+X** (Shift+Ctrl+X): Swap the foreground and background. Plain **X** swaps them too, except in Edit Mode,
  where it types.

### All the Shortcuts

- **The List**: Press **?** for the list of every keyboard shortcut (in Edit Mode, where ? types, press **Alt+?**,
  Option+? on a Mac). It doesn't open from a text field.
- **Opening a File**: **Cmd+O** (Ctrl+O) opens the file chooser, from anywhere in the app except while you type in a
  field or in Edit Mode's text. What you pick opens as a dropped file does, asking first where a drop would.
- **The Start Screen**: **Tab** reaches **Choose a file**, and **Enter** or **Space** presses it.
- **Scrolling**: **Page Up** and **Page Down** scroll the view one screen, and **Home** and **End** (or **Cmd+↑** and
  **Cmd+↓** on a Mac) scroll to its top and bottom. They reach the view whenever nothing else has focus, as after a file
  opens, so you don't need to click it first. In Edit Mode, while you type, Home and End move the cursor instead.
- **Saving and Exporting**: **Cmd+S** (Ctrl+S) saves the project and **Cmd+E** (Ctrl+E) opens Export. In either
  dialog, **Enter** in the file name saves or exports.

---

## When the Grid Changes

What a new grid size (**Dimensions**) does depends on what's drawn, and on what Undo could bring back:

- **Canvas Resize**: With anything drawn (cells, shapes or paint on any layer, or on the base: its pinned characters
  and its own pixels, from drawing on it, erasing it, Merge down or an ANSI file opened with Draw on top), or any drawing
  step to undo or redo (a cleared layer, a stroke you undid), resizing is a canvas resize. The picture and everything
  on it stay exactly where they are; columns and rows are added or removed at the right and bottom, and every undo step
  still fits. What a shrink cuts off isn't lost: it comes back when you make the grid bigger again, and it's saved with
  the project. **Lock aspect ratio** still works: on, the other number follows to keep the shape.
- **Rescale**: With nothing drawn and no drawing step to undo (slider, settings and selection steps don't count, nor
  adding or reordering layers), resizing rescales: the image is converted again at the new size.
- **Back to Rescaling**: Clearing or erasing everything on the drawing layers brings rescaling back once there's no
  drawing step left to undo, unless the base has been drawn on. A new document, or a project or file opened, starts
  with no steps to undo.
- **Limits**: The grid can be up to **300 columns** wide and **5,000 lines** tall, with **500,000 cells** in all, so
  narrow art can run long: 80 and 100 columns reach the full 5,000 lines, 160 columns stops at 3,125 and 300 at 1,666.
  With animation on, a drawing holds at most 40,000 cells, and the aspect ratio lock doesn't apply.
- **Lock Aspect Ratio**: The lock keeps the shape the grid had when you turned it on: unlock, set both numbers, lock
  again, and changing one number keeps the other in that shape, whether it rescales or resizes the canvas. It's saved
  with the project. A new picture starts with its own shape.
- **Blank Canvas**: A blank canvas is one color all over, so it fills the grid at any size, and the adjustments
  (Invert, Brightness and the rest) reach every cell.
- **Opening a Picture**: A picture opens at the current width, or narrower if that's what it takes to fit its shape.
