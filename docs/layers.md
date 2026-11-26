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
  - **From the Keys**: **Alt+]** and **Alt+[** (Option on a Mac, as in Photoshop) select the layer above or below, from
    any tool and wherever the art shows, stopping at the top and the bottom (for an artist in a room, the layer above
    the base). In Edit Mode, while you type, they work too and keep to the drawing layers and the base, passing vector
    layers, so you stay in the ANSI view with the cursor where it was.
  - **Walking the Rows**: With a row focused (**Tab** to it), **↑** and **↓** select the row above or below as they go,
    and **Home** and **End** the top and the bottom (passing a row that's off). **←** and **→** do nothing there. Focus
    stays in the list, so Edit Mode's cursor doesn't move.
- **What Tools Act On**: Every drawing tool acts on the selected layer, the base too
  ([Drawing on the Base](#drawing-on-the-base)), and every tool is offered whichever layer is selected.
  The [Select tool](#the-select-tool) and the [Magic Wand](#the-magic-wand) act on the selected layer too, unless
  **All layers** is on in their options row, when they act on every drawing layer that shows.
- **Adding Layers**: The header over the list counts your layers ("3 of 64 layers", the base included), with two
  buttons on its right:
  - Click **Add layer** (the cells icon with a plus) to add a new drawing layer directly above the selected layer, or
    **Add vector layer** (the path icon with a plus) to add a new vector layer there. The new layer is selected. Each
    button says its name on hover, or why it's off.
  - **Shift+Alt+N** (Shift+Option+N) adds a drawing layer and **Shift+Alt+V** a vector layer, as the buttons do, and
    are off when they are. Not while you type in Edit Mode (press **Escape** first), and holding one adds only one.
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
- **On a Phone**: The side panel comes in over the art from the right. The unfold button at the right end of the tab bar opens it,
  and selecting a layer leaves it open, so you can select, rename or hide in one visit. The fold button, **Escape** or a touch on the
  strip of art beside it shuts it, and draws nothing ([The Side Panel](social.md#the-side-panel)).
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
- **Saving**: A `.pho` file and autosave keep every layer with its contents, name, eye and character settings.
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
- **Other Layers Convert as They Did**: Hiding a layer doesn't change how the layers above it are turned into
  characters. A vector layer's strokes over a hidden layer are drawn as they were while it showed; only a soft or
  see-through edge can come out differently, as it's turned into characters over what now shows under it.
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
  **Color palette** with its **Color count** (Limited count) and a **Manage** link beside the label, shown whatever the palette is set to. These belong to the whole
  drawing, whichever layer is selected. **Palettes** opens the color layer on its **Palettes** page (see
  [The Color Layer](#the-color-layer)), where the Custom color list is edited and the palettes are browsed; the column
  holds nothing more of them. It follows the rules of the Font field's **Manage**: the settings drawer shuts on a phone, from
  SAUCE it shows ANSI first, and with no drawing open it opens over the start screen, so the palette chosen is the one
  the next drawing starts with. It's off while the settings are locked.
- **Transforms**: **Colorize** (with its color), **Hue shift** and **Invert**.
- **Adjustments**: **Brightness**, **Contrast**, **Black point**, **White point**, **Midtones**, **Saturation**,
  **Posterize** and **Threshold** (with its **Dark color** and **Light color**).
- **Characters · (layer name)**: The selected layer's **Choose characters**, **Characters** set (with presets in
  its menu, a bitmap font's own sets first: [The Font's Sets](characters.md#the-fonts-sets)), **Character seed** (**Generate new seed** shuffles it), **Solids**, **Pattern light**, and for the base
  and a vector layer with a palette, **Dither style** and **Dither**. Inside an [art layer](vector.md#art-layers) it's
  its vector layer's. On the start screen, with no drawing open, it's the base's: the settings the next drawing starts
  with. Some only show when they apply: the seed with Random, Pattern light with Best match or By shape,
  Solids in ANSI with Best match or By shape.
  - Each layer has its own ([Each Layer's Own Character Settings](characters.md#each-layers-own-character-settings)):
    changing them changes only how that layer's paint, picture or shapes become characters. A line under the title
    says so for a layer above the base.
  - A drawing layer has no Dither: paint is never dithered.
  - Every layer converts something (the base its picture, a drawing layer its paint, a vector layer its shapes), so
    the section is always there. A new drawing selects the base, so the picture's own settings show first: select a
    drawing layer to change how its paint becomes characters.
- **Picture · Base**: **Smoothing**, how the picture and the base's own pixels are scaled to the grid. Only with the
  base selected, and only where it changes something: a picture, or a picture merged down onto the base (it lives in
  the base's pixels then, finer than a grid pixel). A blank canvas has none, and still has none after a Bake, after
  paint on the base, or after **Blend into source image** of paint laid a grid pixel at a time: Image filters work on
  that picture, but Smoothing has nothing finer to scale. Paint finer than that (a merged shape's edge, a thin stroke)
  goes into the picture at its own detail, and characters blended in are drawn as their glyphs, both finer than a grid
  pixel where the picture has more than one pixel a grid pixel, so Smoothing shows then.
- **Image filters**: **Blur**, **Simplify**, **Sharpen**, **Edges** (with its color) and **Edge thickness**, which work
  on the picture itself. Only with the base selected, and only with a picture: on a blank canvas, or after Flatten, a
  note says image filters require an image instead. After a Bake or **Blend into source image** the picture is a working
  copy, and the filters work on it as on the one you opened. A [plugin's filters](plugins.md#writing-a-filter) each have
  a group after this one, shown in the same places, and work on the picture after these: Bake bakes in those that are
  running, and Flatten clears them.

Each section under Drawing folds and unfolds on its title, and your browser remembers which are folded. A folded
slider group says how many of its sliders are on.

On a phone the settings slide out from **☰** at the left end of the tab bar, sliding the art aside. A touch on the strip
of art still showing only shuts them: nothing is drawn until they're shut. Opened with the keys, focus goes into them,
to the Phosphor logo, so **Tab** goes on to **Dimensions** (on a beta, to **Report an issue** under the logo first: [Betas and reporting an issue](README.md#betas-and-reporting-an-issue)). **Escape** shuts them and puts focus back on **☰**. In a field
you type in, such as Dimensions or the hex of the Custom color list, Escape is the field's: it puts back what was there,
and the settings stay open.

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
- **What Unpins**: In **Monochrome ASCII**, which shows every pinned character in white on black whatever its
  colors, paint on the base (the Brush, the Paint Bucket, Gradient, a Shape's fill, Retouch) and the PIXEL view's or
  the Soft Eraser take the pin off every cell they touch, so the paint shows as your ASCII characters. A pinned `▄`
  stays. In ANSI and Color ASCII the paint recolors a pinned character, and it stays pinned.
- **Everything Else**: Any other character belongs to its cell's position. The converter picks it there, whatever
  colors are underneath.
- **In Color ASCII**: The converter's cells are ink on black, but a pinned character whose two pixels differ shows them
  as its background and ink, as ANSI does, so a typed cell with a background keeps it when it's merged onto the base
  with **Keep crisp cells**. A pin whose two pixels are one color shows that color's ink on black (what **Set FG** on
  the base writes, and what older merges left).

### The Sliders and Undo

Moving a slider in Transforms, Adjustments or Image filters is an undo step, like a brush stroke:

- **Slider Steps**: A whole drag is one step, a run of arrow-key nudges on one slider is one step, and so are
  **Reset**, **Reset all**, and picking the Colorize, Threshold or Edges colors. Undo goes back through slider moves
  and drawing in the order you made them.
- **A New Drawing**: Starts with every slider back at its default, whatever the drawing before had them at: a picture,
  an SVG or a blank canvas, and the start screen after **New project**.
- **Characters Steps**: The Characters section's settings are undo steps the same way, on the layer they belong to: a
  choice picked (Choose characters, a preset from the menu, Dither style), a Characters set or seed typed, **Generate new
  seed**, and a Solids, Pattern light or Dither drag or run of nudges.
- **Typing in a Field**: While you're typing in the Characters or seed field, **Cmd+Z** (**Ctrl+Z**) undoes your
  typing there, as in any text field. Once you've pressed **Enter** or left the field, it undoes the step.
- **In a Room**: Each layer keeps its own character settings, and they go to everyone. Only the host changes them: for
  an artist the Characters section shows the selected layer's settings, turned off, with "Only the host changes
  character settings in a room." A change to a layer's isn't an undo step in a room; a change to the base's is the
  host's undo step, as the sliders are.
- **Not Undo Steps**: The Art style, the Color palette, the Color count, frames per second and a frame's hold.
  Changing one keeps the undo steps before it: **Cmd+Z** afterward takes back the edit you made before the change and
  leaves the setting as it is, and redo puts that edit back.
- **Dimensions**: A change of the grid's size is an undo step ([When the Grid Changes](#when-the-grid-changes)).

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
  so making the grid bigger afterward works from that smaller image. The **Image filters** keep working on it.
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
  there, over the colors the character shows in ANSI (a soft edge over a red █ blends with red, not with the black
  stored under it).
- **Pressed Into the Base**: When a shape is pressed into the base (Bake, Merge down), pins it covers go, since its
  pixels are what shows there now; an art layer's characters become pins instead.
- **Higher in the Stack**: A vector layer higher up converts against everything below it. Where a shape reaches a
  cell, the cell's two halves take the shape's pixels over what the layers under it show there (a typed character
  included; in ANSI a file's character counts as the colors it shows, so a soft edge over a red █ blends with red,
  not with the black stored under it), and the converter picks the character from them, with the layer's
  character settings. The layers above
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

Drop a `.ans`, `.utf8ans`, `.xb`, `.bin`, `.asc`, `.txt`, `.nfo` or `.diz` file on the start screen, or pick one with **Choose a
file**, and Phosphor asks what you'd like to do with the art, then opens it as a new document:

- **Edit artwork**: The art goes on a drawing layer, over a plain black base, as if you'd drawn it. Every cell is a
  drawing-layer cell, so the Eraser, **Clear layer** and everything else that works on what you've drawn works on it.
- **Draw on top**: The art is the base layer, and what you draw goes on top of it, on an empty Layer 1, selected.
- **Open as an image**: The art is drawn into the source image, each cell as its character looks in its two colors,
  so the image filters (Blur, Sharpen, Edges and the rest) and the color sliders work on it as on any picture. Nothing
  is pinned and the base has no pixels of its own: the base is all there is, as when you open a picture. **Choose
  characters** starts on **By shape** with the characters the file uses as the character set, so the converter picks
  each cell's character again from the picture, and some come out different from the file's: shades (`░ ▒ ▓`) can
  become solid blocks, a wide character becomes narrow ones, and thin characters can come out darker in ANSI. Spaces,
  the full block and the upper and lower half blocks (`█ ▀ ▄`) come back as they were.
- **Cancel**: Opens nothing.

**Edit artwork** and **Draw on top**:

- **Every Cell Keeps Its Character and Colors**: So it looks just as the file does. With **Draw on top**, the art is
  the base layer as if you'd used Merge down, and the color sliders, the palette and Bake work on it as they do on any
  picture. The PIXEL view shows each of its characters as it looks at that scale, paint over them included
  ([PIXEL View](#pixel-view)), so **All cells** stays as you left it.

All three:

- **The Grid**: The file's size. Its width comes from the file's SAUCE record when that describes character art with
  a width; otherwise it's 80 columns for a `.ans` and the widest line for the others. Its height is as many lines as
  the art reaches. The ANSI view starts at the art's top-left, its first line, as a terminal shows it (centered when
  the whole file fits).
- **Nothing to Undo**: Opening a file isn't an edit, so there's nothing to undo.
- **The Palette**: Follows the file: CGA when every color is one of the 16 classic colors, VGA when it uses 256-color
  codes for the others, and full color when it uses a 24-bit code. An export writes the same kind of codes, 16 and 231
  (fixed black and white) among them, where 0 and 15 would follow a terminal's theme
  ([Saving .utf8ans and .ans](characters.md#saving-utf8ans-and-ans)).
- **SAUCE**: Fills the SAUCE tab: title, author, group, date, comments, font name, letter spacing and iCE colors. Your
  display font stays as you have it. An export writes the record back as it came, with only what you changed on the
  SAUCE tab, and the size after a resize.
- **Bright Backgrounds**: Blink (in a `.ans`, the code that makes a background bright on DOS) is kept as the bright
  background it stands for. Whether it shows bright or blinks is the file's **iCE colors**: on when its SAUCE record
  says so, off when it doesn't ([iCE colors](characters.md#ice-colors)). A file with no record is on when it starts
  with the code that says so (`ESC[?33h`, as Phosphor writes it), off when it uses blink without it, and on when
  nothing in it blinks; a UTF-8 file with no record is on, since its bright backgrounds are colors of their own.
- **Characters**: A `.utf8ans` is UTF-8, even with a stray byte that isn't (shown as �). One that isn't UTF-8 at all
  (a `.ans` renamed, say) is read as CP437 at 80 columns, as a `.ans` is, and a message says so. The other types are
  read as UTF-8 when they're valid UTF-8 with characters beyond plain ASCII, and as CP437 otherwise.
- **Limits**: A file over 300 columns, 5,000 lines or 500,000 cells doesn't open. A message gives the file's size and
  the limits, and what you had open stays open. A file with no art in it doesn't open either. Either way the message
  comes first: Phosphor reads the file before it asks how to open it, or whether to leave unsaved work.
- **XBin Files**: An `.xb` opens with its cells, its font and its palette. A palette that's exactly the 16 classic colors opens as CGA, and any other opens as a **Custom** color list. A file whose header says its backgrounds are bright opens with iCE colors on; one that doesn't keeps that bit as a bright background and opens with iCE colors off, so it blinks. A file with no font opens with no bitmap font of its own. Added to a drawing with no bitmap font, a cell in the font's first slot (`␀`) comes in as a space, as classic CP437 shows it. A file that uses 512 characters is refused, with a message saying so, and so is one that's cut short or isn't XBin. Drawing with it, and saving one back, are in [Bitmap Fonts](characters.md#bitmap-fonts) and [Saving .xb](characters.md#saving-xb).
- **BinaryText Files**: A `.bin` is a character and its colors for each cell, with no escape codes, in CP437 and the 16
  classic colors, so it opens on CGA, in the font a `.ans` would open in. Its width comes from its SAUCE record,
  and its height is as many lines as the file holds (a last line cut short is filled with spaces). A background's top
  bit is a bright background, shown bright when the record says iCE colors and blinking when it doesn't. Since `.bin` is used for
  every kind of file, Phosphor opens one only when its SAUCE record says it's BinaryText, or, with no record, when it's
  a whole number of 160-column lines, the width BinaryText has without one; then a message says it had no SAUCE record
  and was read as BinaryText 160 columns wide (with iCE colors off). Any other `.bin` is refused: "*name* isn't
  a BinaryText file." A `.bin` that's really an XBin opens as one. Phosphor opens `.bin` files but doesn't save them.
- **Animated Files**: An animated `.ans` (one that moves the cursor or clears the screen) opens as its last screen.

An `.svg` file opens on VECTOR as shapes instead ([Importing SVG](vector.md#importing-svg)).

### Drawing on the Base

With the base selected, every tool draws on the base itself, as Merge down's **Keep crisp cells** would leave it:

- **Cells**: The Pencil's lines, Shapes, the Paint Bucket's **Cells**, Edit Mode and a paste write each cell as it
  shows: its two colors go into the base's two pixels (the background the top, the foreground the bottom) and its
  character is pinned, so the converter keeps it. A cell given only a foreground keeps the background it showed. The
  PIXEL view shows the cell as its character looks there, not as those two pixels ([PIXEL View](#pixel-view)).
- **Paint**: The Brush and other paint (the Pencil's **Colors only**, the Paint Bucket's **Colors only** fill) paint the
  base's own pixels, which the color sliders, the palette and the image filters then treat as the picture's. A stroke
  builds up there as it does on a layer over the picture: white at full Opacity is as white on the base as on a layer.
- **Typing**: The three typing modes work there as on a layer ([Typing Text Directly](characters.md#typing-text-directly)).
  **Insert** pushes every cell after the cursor along the row: its colors, the picture's among them, and its pinned
  character, as moving a selection there does, and the cell left empty at the row's end by **Delete** or **Backspace**
  is erased (black, with a pinned space). **Partial** pushes the pinned characters alone, each with its two colors,
  and leaves the rest of the base where it is; a cell a character leaves shows the picture again.
- **Erasing and Swapping**: The Eraser turns cells black with a pinned space (ANSI view) or pixels black (PIXEL
  view), and **Swap cell FG/BG** swaps a cell's two halves.

### Adding a File to the Drawing

With a drawing open, dropping one of these files on it asks what to do:

- **Add to this drawing**: The file's art lands as a paste does, floating and selected with the Select tool, at the
  cell you dropped it on (or the top-left of the view, when it's dropped beside the drawing), to drag into place. It
  goes on the selected layer (written into the base, with the base selected), as one undo step. Whatever runs past
  the canvas edge is cut off. The drawing's SAUCE, palette and font stay as they are, an `.xb`'s too: only its cells land.
- **Open to edit**, **Open to draw on top** or **Open as an image**: It opens in place of this drawing, as **Edit
  artwork**, **Draw on top** or **Open as an image** do above. With unsaved changes, these choices say they replace
  them (the drawing stays in this browser, under Pick up where you left off), and choosing one opens the file without
  asking again.
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
- **Paint Over Paint**: Where there's no character of your own under it, paint converts over what the PIXEL view
  shows under it (the picture, the paint and shapes of the layers below), on whichever layer it sits, so a soft stroke
  over white looks the same one layer up as it does on the same layer, in every art style.
- **Nothing to Show Through**: A cell whose character is solid or empty (a space, █, ▀ or ▄), or doesn't show (drawn
  in its own background color), has nothing to show paint through. Under paint on its own layer it becomes a ▄
  half-block instead. Under paint on a layer above it, and under paint over the base layer's pinned characters (an
  opened file's, or ones Merge down or Flatten left), the paint is converted with that layer's characters over the
  colors the cell shows, so a layer on Random draws Random's characters over an opened file as it does on a blank
  canvas. In Color ASCII and Monochrome ASCII there are no half-blocks: a character with nothing to show paint through
  (a space, or one in its own background color) is converted with your ASCII characters, paint and all, as an empty
  cell under paint is, so painting over a typed or opened space shows the paint; a character with ink, `█` included,
  keeps it and is tinted. A pinned ▄ is its two colors, converted the same way.
- **Cells Over Paint**: Typing or drawing cells (a line box, a Character shape, block glyphs) over paint replaces the
  paint in those cells, so what you wrote shows. With the background set to None, each cell keeps the background
  color the paint gave it, as it keeps the picture's or an earlier cell's.
- **By Shape**: With **By shape** choosing the characters, paint doesn't show through a cell's character: the cell is
  chosen again with the paint in it, as it would be after Merge down
  ([How the Converter Picks Characters](characters.md#how-the-converter-picks-characters)).
- **Half a Cell at Most**: Paint is never finer than half a cell, so on its own it doesn't make quadrants or the
  rising blocks.

### Draw With

In the ANSI view, the Pencil and Brush have a **Draw with** menu (**D** chooses the next one, **Shift+D** the one
before: [Tool Keys](#tool-keys)):

- **Colors only** (the default): They paint over each cell's own character, which shows through. A cell that shows no
  character yet (a blank canvas's black, or the lines added when it grows) takes the paint in the character **Choose
  characters** gives it, on the base or on a layer: on **Random**, a stroke over a blank canvas comes out in Random's
  characters, which show where a cell's two halves differ (a stroke's edge, a half-cell or soft stroke) and look solid
  where the paint covers the cell whole; under **Best match** and **By shape** the cell is matched to the paint. Nothing
  the converter drew becomes a ▄, so switching **Choose characters** afterward picks it afresh (on the base, the paint
  goes into the base's pixels), and a layer with character settings of its own paints in those. A shape on a vector
  layer under the layer is the same, even filled with one flat color: paint over it becomes the layer's characters, as
  it does over the picture. A cell of the layer's own that shows no character (a space, or a character in its
  background's color) becomes a ▄ as they paint it: its colors become paint first, so the half you don't paint looks as
  it did. So does a cell Merge down froze where a merged shape covered it, whatever its character, whose paint is under
  it already, and a pinned space on the base. Painting in the PIXEL view does the same, so the view you paint in never
  changes what you get. In Color ASCII and Monochrome ASCII there are no half-blocks: the paint becomes your ASCII
  characters, whichever style you painted it in, and what it showed in ANSI shows again when you switch back. For clean
  half-blocks, use **Half-block**.
- **Half-block**: Each cell they paint becomes a ▄, and the paint colors its two halves, so you draw clean
  half-blocks. The half you don't paint keeps the cell's background: a character there goes, and its color with it, so a
  stroke across a line you typed is a half block too, not a whole cell, whether the line is on the same layer or one
  under it.
- **Single line** and **Double line** (Pencil only): Draw box-drawing lines as you drag from cell to cell. Each cell
  gets the piece its path needs (─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼), so the line turns corners and joins itself where it crosses
  back, in the foreground color (and the background color, unless it's None). A diagonal drag becomes a staircase.
  With **Connect** on (the default) it joins the lines it crosses (┼) or ends on (┬), and the ones that point into
  it; off, it draws over them.
- **A bitmap font's own line styles** (Pencil and Shapes): With a bitmap font that has a line style of its own, with all
  eleven pieces set, the style is offered after **Double line** and draws as they do, joining only its own style
  ([The Font's Lines](characters.md#the-fonts-lines)).

### Opacity, Build Up, and Flow

- **Opacity**: How much one stroke lays at most. Going back over the same spot within a stroke doesn't add more.
- **Build up** (on by default): Strokes stack, as layers do: each lays over the paint already there as it would on a
  layer above it, so two strokes at 50% make the paint 75%, and a soft stroke over see-through paint looks the same on
  that paint's own layer as on the layer above. With it off, Opacity is a ceiling: paint never gets more solid than
  it, and more strokes only change its color.
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

## How Layers Blend

A few rules hold across every tool, view and art style, so what you see while you draw is what a merge, an export
and the PIXEL view give you:

- **Paint is paint on any layer.** A stroke converts over what's under it (the picture, and the paint and shapes of
  the layers below) the same way whichever layer it's on, in ANSI and in the ASCII styles. A layer moved up or down,
  with nothing between it and where it was, looks the same. (The base's own strokes are its pixels: under Best match
  they're matched with the picture before the palette, so soft paint there can give a shade a layer's wouldn't.)
- **Your characters stay yours.** A cell you typed, pasted or opened from a file keeps its character: paint over it
  tints it, Blur, Dodge and Burn recolor it, Colors only tints it. A character with nothing to tint (a space, or one
  drawn in its own background color) lets the paint show, converted with the characters of the layer the paint is on
  (in ANSI a ▄ when that's the character's own layer).
- **Merging changes nothing.** Merge down keeps paint as paint, so the paint tools keep working on it. Where the
  converter would have to pick a cell differently in its new place, the merge pins the cell as it showed, and that
  pin is paint to everything but the converter: the PIXEL view shows the paint, paint above lays over it as before,
  and painting, erasing, Blur or Colors only there takes the pin off. A soft edge, where the paint only partly covers
  a cell, isn't pinned: it stays paint over whatever is under it, so it can come out a character or a color step
  different.
- **Color ASCII is ANSI in spirit.** The converter's cells are ink on black, but a cell of yours with a background
  shows it, and keeps it when merged onto the base.
- **The PIXEL view is the pixels, and the base's characters as they look.** A character on the base is kept as two
  pixels, its background over its foreground; the PIXEL view shows it as it looks at that scale, tinted by paint from
  the layers above as the ANSI view shows it. Its Overlay draws only your characters, never the converter's over
  paint.

The engineering rules behind these, with where each lives in the code and the tests that hold it, are in
[docs/model.md](model.md); Maya's QA script walks them ([How my layers blend](qa/personas/maya.md#how-my-layers-blend)).

## Moving Things Between Layers

### Merge Down

**Merge down** puts the selected layer into the layer under it, and the merged layer leaves the stack, so nothing on
the canvas changes. Undo brings it back, selected if it was.

- **Where It Is**: The toolbar, a row's **⋯** menu in LAYERS, and the Select tool's row. The toolbar and ⋯ always merge
  the whole layer. The Select tool's row merges only what's drawn inside the selection while there is one (the layer
  stays with the rest), or the whole layer without one.
- **When It's Off**: With the base selected (nothing is under it), and for a drawing layer onto a vector layer, since
  cells can't become shapes: **Make art layer** does that ([Art Layers](#art-layers)). A vector layer does merge into a
  vector layer under it: its shapes move there and stay shapes ([Vector](vector.md)). In an [animation](animation.md) with more than one
  frame it's off, since a layer is under every frame, so one frame can't go into it.
- **In a Room**: Only the host merges, into the layer under it, the base included. A layer emptied by a merge leaves the
  stack, as it does alone. With others in the room, the dialog warns that merging down cannot be undone in shared
  rooms. **Make art layer** needs a vector layer directly above the selected layer; without one it's off and says "Add a
  vector layer above {name} first."
- **A Drawing Layer Into a Drawing Layer**: Each of its cells is written on the layer under it as it shows, over that
  layer's paint, and its paint is drawn over that layer's paint. It stays paint, so Blur, Dodge, Burn and the Eraser
  work on it as on any. A cell where the paint would show differently after the merge (a palette or the character
  choice can convert it differently once it's on the layer under), by more than the step or two the same color can
  round apart when it's worked out another way, keeps its paint and gets the character and colors it showed pinned
  over it, frozen: a later palette or character setting doesn't convert that cell again, but to everything else it's
  still paint. The PIXEL view shows the paint, paint on a layer above lays over it as it did, and any paint laid or
  erased in the cell (the Brush, the Paint Bucket, Blur, Dodge, Burn, the Eraser) takes the pin off, so a merged edge
  fades like a painted one. Only a cell the paint covers whole is pinned: a soft edge, which lets what's under it show,
  stays paint, so hiding or changing the base later shows through it as it does through any paint, though the cell can
  come out a character or a color step different than before the merge. The ▄s **Colors only**
  leaves on the cells it painted are paint too, and come down as they are, so in Color ASCII and Monochrome ASCII,
  where they aren't shown, the paint still shows as your ASCII characters.
- **A Vector Layer Into a Drawing Layer**: Its shapes become paint on the layer under it, in their own colors and at
  their own detail (finer than the grid, as paint is), so Blur and the other paint tools work on them as on any paint
  and By shape reads their edges as it did. A cell where that paint would show differently (the vector
  layer has character settings of its own, or a palette or the character choice converts it differently), by more
  than a step or two of rounding (By shape works a shape's colors out from finer samples than paint has, so a
  gradient comes out a step or two apart all over), is written
  as the cell it shows now, frozen as above (paint to everything but the converter), where the shapes cover it whole;
  along their soft edge it stays paint, as above, so no border of the base's colors stays round them; a cell an art layer gives a
  character is written as that character, yours to keep. It
  goes only whole: with shapes selected on VECTOR, deselect them to merge
  the layer. Its guides, which draw nothing, stay, and the vector layer with them.
- **A Vector Layer Into the Base**: Asks how, as a drawing layer does, when the whole layer merges and it has shapes:
  - **Keep crisp cells**: Its shapes are pressed into the base layer's pixels as they show, where they stop being
    shapes, and the image filters never touch them.
  - **Blend into source image**: Its shapes become part of the image, so every slider and image filter applies to
    them, live. They go in as a drawing layer's paint does (below), at their own detail, so the canvas shows as it
    did but for a color a step or two apart along their edges. A cell that paint would show differently is kept as it
    showed, and an art layer's characters go in as typed ones do.

  On VECTOR, with shapes selected, Merge down presses only those, without asking. A vector layer with its own
  character settings can't be merged into the base either way: it says so. In a room, a vector layer is pressed,
  without asking.
- **A Drawing Layer Into the Base**: Asks how, each time:
  - **Keep crisp cells**: Paint and cells become base pixels exactly as they show, and your typed and drawn cells keep
    their characters, pinned on the base layer (in Color ASCII and Monochrome ASCII, **Colors only**'s paint is paint:
    it becomes pixels, with nothing pinned; in Color ASCII a typed cell's background comes along, shown by its pin). Nothing is resampled or re-filtered, and the image filters never touch
    it. A letter typed with no background keeps the picture's own pixels behind it, so it looks the same under any
    palette and slider. The base snaps its pixels to the palette one at a time, so a cell soft paint or a Blur stroke would show
    otherwise as pixels is pinned as it showed.
  - **Blend into source image**: Your drawing becomes part of the image itself, so every slider and image filter applies
    to it, live, like the photo. Paint goes in as it shows, at its own detail over the picture's own pixels, so the
    characters picked from it come back as they were, but for a look-alike here and there (Q for $, L for f). Letters and other characters are drawn into the picture as
    they look, each in its two colors with your paint over it, and the converter picks them again from the picture, so
    some can come back as other characters (the question lists that under **You give up**). The same goes for the
    base's own characters under your paint, such as an opened file's, where the layer has none of its own: the question
    lists those too. In ANSI, solid cells
    (space, █, ▀, ▄) go in as they show, pinned as ▄ so they keep showing their two halves. A wide character (漢),
    anything drawn in the bars around a picture that doesn't fill the grid, and a cell a merge froze as it showed merge
    exactly. In Color ASCII and Monochrome ASCII, **Colors only**'s paint goes into the picture as paint, and a typed
    cell's background goes into the picture with it, so in Color ASCII it comes back as ink on black. Like Bake, the first time makes the picture the
    working-size copy the preview is made from, so growing the grid later works from that, effects like Edges can
    shift slightly that first time, and the **Image filters** work on it as on a picture you opened (on a blank canvas
    they appear once the picture is more than one color). With a Limited count palette,
    the palette is worked out again from the merged picture, so some colors can shift. When the graphics card can't
    process a picture as long as the grid (most handle the full 5,000 lines; some phones stop at 2,000 or 4,000), it
    merges exactly instead. Shapes stay shapes. A layer with character settings of its own loses them here: its paint is
    redrawn in the base's characters, and the choice lists that under **You give up**.

### Clear Layer

**Clear layer** (toolbar) removes everything you've drawn on the selected drawing layer, after asking "Clear (layer
name)?". Undo brings it back.

- **What It Leaves**: The base layer isn't touched: with the base selected, and on VECTOR, **Clear layer** isn't on the
  toolbar. In a room only the host can clear, and not while others are drawing.
- **In an Animation**: It clears that layer on the frame showing and stops its carry there: what earlier frames have on
  that layer no longer shows on the cleared frame, even what's drawn on them later, until you draw on it
  ([Carrying and Owning a Cell](animation.md#carrying-and-owning-a-cell)). The frame's other layers and shapes stay.

---

## Erasing

The **Eraser** (**E**) erases the selected layer:

- **On a Drawing Layer**: Removes that layer's paint and cells. The layers over and under it stay.
- **On the Base**: Erases the base layer: the cells go black with a pinned space. Your edits on top stay.
- **Size**: Each view has its own. In the ANSI view it counts cells (**Size · cells**, starting at 1): one click erases
  the character under the pointer, and size N erases an N by N square of cells around it (with an even N, the extra
  column is on the right and the extra row below). In the PIXEL view it counts pixels (**Size · px**, starting at 5),
  and size 1 is the one pixel under the pointer. Changing one leaves the other as it is.
- **In the PIXEL View**: The Eraser removes paint (on a drawing layer) and turns base pixels black (on the base),
  leaving the characters as they are, except a ▄ that Half-block made to show paint (one with no colors of its own):
  when its cell's last paint is erased, the cell gets its own character back. A block a line or ellipse drew with
  **Half-column detail** goes whole, a cell at a time, as soon as the Eraser touches either half of its cell, until it's
  typed over, recolored or painted over. Characters typed by hand stay. On the base, a character
  whose two colors are both erased to black becomes a black space, as the Hard Eraser leaves it in the ANSI view.
- **Hard or Soft**: **Hard**, as it starts, is a square that clears everything under it at once: pixels in the PIXEL
  view, whole cells with their characters in the ANSI view. **Soft** is round with a feathered edge, like the Brush,
  and takes paint away a little with each pass: its **Flow** sets how much, so a low Flow fades paint gently and a few
  passes clear it. On the base, where erasing is black, Soft lays the black the same way. **Shift+]** makes it Hard
  and **Shift+[** Soft ([Tool Keys](#tool-keys)).
- **Soft in the ANSI View**: Soft is the same eraser in both views, as the Brush is the same brush: it works in pixels,
  at the PIXEL view's **Size · px** (which the ANSI view's row shows in place of **Size · cells** while Soft is on).
  It takes paint, not characters: a character you typed or drew stays where it is, as it does under the Eraser in the
  PIXEL view, except the blocks of a line or ellipse drawn with **Half-column detail**, which go whole, a cell at a time, until
  they're typed over, recolored or painted over. To take other
  characters, use Hard.
- **Its Outline**: The pointer shows what the Eraser covers: the square of cells or pixels it would clear, or Soft's
  circle. Off the canvas, where there's nothing to erase, the outline still follows the pointer.

---

## Drawing on the Canvas

Phosphor provides two drawing views of the same cells. Most tools work in both; [Other Tools](#other-tools) has the
details.

### ANSI View

In the **ANSI** view, you work with text characters, foreground colors, and background colors:
- **Edit Mode (`T` or `K`)**: Click anywhere on the grid to position the text cursor and type characters, accents, or
  emoji ([Typing Text Directly](characters.md#typing-text-directly)). Press **Insert** or **Alt+Enter** (or the mode's
  button in the status bar) to go between Overwrite, Insert and Partial modes. Edit Mode is only in the ANSI view.
- **Pencil (`P`)**: Paints the foreground color, or draws box-drawing lines with **Single line** and **Double line**
  ([Draw With](#draw-with)).
- **Paint Bucket (`G`)**: Fills the color you see, or with **Cells**, whole cells with your colors and character. A fill
  that takes a while says "Filling…" at the bottom, and a click while it does fills nothing more.
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
- **A Plugin's Brushes** (both views): After the built-in tools, past a divider. They lay paint, as the Brush does,
  shown in the ANSI view as **Colors only** shows it ([Writing a brush](plugins.md#writing-a-brush)).
- **Overlay**: The slider in the options bar draws the cells of your layers (or every cell, with **All cells**) over
  the pixels, as the ANSI view shows them. Paint that the art style turns into characters (Colors only's ▄s, in Color
  ASCII and Monochrome ASCII) isn't drawn over: you see the paint itself, blended with what's under it.
- **Characters on the Base**: A character drawn, typed or opened on the base (and an art layer's) shows as it looks
  at this scale, whatever the Overlay is set to. Each of the cell's two pixels is its background blended toward its
  foreground by how much of that half the character inks: `█` is solid, `▓`, `▒` and `░` are three quarters, a half
  and a quarter of the way, `▐` and `▌` a half (a pixel here is one column wide, so it can't split sideways), `▄`
  is its two colors, and a thin character like `═` shows faintly. In Color ASCII and Monochrome ASCII it's the cell
  as that style shows it.
  - **Paint Above It**: Paint on a layer over the character tints it, as in the ANSI view: over a solid block the
    paint shows in the half you painted, and over a shade or a letter it colors the character's background (its upper
    half) or foreground (its lower half), which shows through the whole cell. So a soft stroke across an opened ANSI
    file looks the same with **All cells** on or off. A shape over the character takes the cell, as it does in the
    ANSI view.
  - **What the Tools Work On**: The **Paint Bucket**, the **Gradient** and the **Magic Wand** go by what the PIXEL view
    shows: an opened file's characters as they look, and with **All layers** on the characters typed on the layers
    above, even with the Overlay at 0%. The **Eyedropper** and the drawing tools work on each cell's two stored colors,
    its background in the upper pixel and its foreground in the lower one. The Eyedropper on a gray `▒` picks one of
    those two, and the Brush with the base picked changes the color of the half it touches, which the character may
    hide (a `█` shows only its foreground). Nothing saved or exported changes.

---

## The Select Tool

The **Select** tool (**M**) selects a rectangle of whole cells, in either view. In the PIXEL view a cell is a pixel wide
and two tall, so the rectangle's top and bottom keep to every second pixel row there. It's the same selection in both
views, and it stays when you switch. With nothing selected, a click (a tap) selects the one cell under it, an undo
step as any new rectangle is; with a selection, a click outside it drops it, so the next click selects a cell again.
Everything below works the same in both.

### What a Selection Acts On

- **The Selected Layer**: Copy, Cut, **Delete**, moving (a drag or the arrow keys), **Stamp**, flipping, rotating,
  **Set FG** and **Set BG** act on the selected layer alone. What other layers have there, under it or over it, stays
  as it is, so Select all and Delete empties one layer, not the drawing.
- **All Layers**: Turn on **All layers** in the options row (it's off to start) and all of those act on every drawing
  layer that shows, the base among them. Hide a layer (its eye in LAYERS) to leave it out. Moved, flipped or rotated,
  each layer's part stays on its own layer. A pasted or stamped block moves as one block whatever the setting.
- **Shapes**: Shapes are VECTOR's. Cut, Delete and moves leave them whole where they are. With **All layers** on,
  **Copy** and **Stamp** also take what the shapes on the vector layers that show show there, as cells, so a paste
  looks like what you copied.
- **The Base**: The base is the picture. Moved, flipped or rotated, its own pixels and pinned characters go with the
  block, on the base, and the area it came from is erased (black, with pinned spaces). Pasted or stamped, each cell
  lands as it showed: as drawing-layer cells that look just as they did where they came from (reduced colors, Best
  match's and By shape's characters, dithering and all), covering what's drawn there.
- **A Drawing Layer**: Your typed and drawn cells and paint. A cell with nothing typed, drawn or painted in it on that
  layer is see-through: moved, pasted or stamped, it leaves what it lands on showing, while it floats and once it's
  set down. A cell with anything in it, even half a cell of paint, covers the whole cell under it.
- **Delete**: The **Delete** button, or the **Delete**, **Backspace** or **E** key, removes what's drawn there on the
  selected layer (with the base selected, it erases the base). With **All layers** on it removes your edits from each
  drawing layer that shows and erases the base, if it shows.

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

Outside Phosphor there are no layers: Moebius and plain text get what the selection shows, whichever layers the copy
took.

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
  ([Drawing on the Base](#drawing-on-the-base)). A block keeps floating on the layer it was pasted on, whatever you
  select meanwhile. A moved one stays on the layers it was lifted from; with **All layers** off, selecting another
  layer sets it down, and the next move lifts that layer's part.
- **The Paste Button**: Pastes only what you copied in this tab. With nothing copied here it's off, and its tooltip
  points you to **Cmd/Ctrl+V**. If your browser doesn't let Phosphor write the clipboard, **Cmd/Ctrl+V** in the same
  tab still pastes the block you copied.

### Stamp, Flip, and Rotate

- **Stamp** (**S**, or **C** as in Moebius): Leaves a copy of the selection where it is and floats the block on from
  there, so you can drag or nudge it away and stamp again. Each stamp is its own undo step. It stamps the selected
  layer's own drawing; what's under it on other layers comes too only with **All layers** on.
- **Flip horizontally** (a mirror) and **Flip vertically**: Turn the selection in place, on the selected layer (with
  **All layers** on, on every layer that shows). The
  characters turn with it: box lines (┌ → ┐, ╒ → ╕), half-blocks and quadrants (▀ → ▄, ▌ → ▐), arrows and triangles
  (→ ←, ▲ ▼), and brackets and slashes (( ), < >, / \). Letters, digits and shades stay as they are. They're buttons,
  with no key.
- **Rotate 90° clockwise**: Turns the picture: the paint and the base's pixels, by their real shape, so a square stays
  a square (in a 1:2 cell, two cells side by side turn into two cells side by side; in an 8×8 font's square cells,
  into two cells one over the other).
  - The turned picture lands as ▄ half-blocks in its pixels' colors, and a Half-block's ▄ goes with its paint.
  - Characters can't turn that way (a cell would land across half of two), so Rotate is off while the selection has
    any on the layers it acts on: typed or drawn characters on a drawing layer, or characters pinned on the base.
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
  some other way). Each press that changes it is an undo step. The arrow keys alone then nudge the selection.
- **Back to Typing**: A selection made from Edit Mode, by dragging or with Shift and the arrows, takes you back there
  when you set it down (**Escape** or **Enter**), with the cursor where you left it.

### Selections and Other Tools

- **Painting Inside**: The selection stays as you change tools, and the painting tools (Pencil, Brush, Eraser, Paint
  Bucket, Gradient, Blur, Dodge, Burn, Shapes, Swap cell FG/BG), in either view, change only what's inside it.
- **Edit Mode Drops It**: Choosing Edit Mode drops the selection (and the Magic Wand's), since typing goes anywhere;
  undo brings it back.
- **Deselect**: Every tool's options row ends with **Deselect** while there's a selection (in its **⋯** when the row is
  short of room), and **Escape** drops it too.

---

## The Magic Wand

The **Magic Wand** (**W**, in both views) selects what matches the cell or pixel you click:

- **Match** (ANSI view): Choose what a cell must share with the one you click: its **FG**, **BG** and/or character
  (**Char**). FG and Char to start.
- **In the PIXEL View**: It selects by color as the view shows it: the picture and paint, an opened file's characters
  as they look, and with **All layers** on the characters typed on the layers above.
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
  takes away what's in the selection, in one undo step: from a drawing layer its cells and paint, from the base the
  picture, which turns black, as the Eraser does on the base (whole cells in the ANSI view, just the selected pixels in
  the PIXEL view).
- **All Layers**: The wand selects what shows, whichever layer it's on, but **Delete**, **Set FG** and **Set BG** act
  on the selected layer alone, as the Select tool's do. Once the wand has selected something, **All layers** is at the
  end of its row (it's the same setting as the Select tool's, off to start): on, they act on every drawing layer that
  shows, the base among them. So if Delete seems to do nothing, what you selected is on another layer: select that
  layer, or turn **All layers** on.

### Recoloring a Selection

With the Magic Wand's selection (the wand being the tool) or a Select rectangle (Select being the tool), the options
row has **Set FG** and **Set BG** in the ANSI view. With the Select tool they're always first on its row; with nothing
selected they're there but off, after "Click or drag to select, or:" ("Tap" on a touch screen), and pressing them does
nothing until you select cells. With the wand they come at the end of its row, once it has selected something.

- **What Changes**: Every selected cell takes your foreground or background color, in one undo step. Only that color changes: each cell keeps the character and the other color it shows, whatever picked them
  (Best match, By shape, dithering, the palette), and paint on it keeps showing the color it gave its half.
- **Which Layer**: With **All layers** off, every cell is recolored on the selected layer: one with nothing of its
  own there becomes a drawing-layer cell that looks as the cell did, in the new color. With it on, each cell is
  recolored on the topmost layer that shows with a cell or paint of its own there, else on the base; hide a layer to
  leave it out.
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
  before, so a stray wand click is one undo away. One that leaves the selection as it was (a second wand click on the
  same cell, **Select all** again) isn't a step.
- **Setting a Block Down**: Dropping the selection of a floating block (**Escape**, **Enter**, **Deselect**, a click
  outside) sets it down and isn't a step of its own: it belongs to the move or paste it ends, so the next undo takes
  that back, with the block floating and selected again. Redo leaves the block floating where you left it, to set down
  again. A new selection made while a block floats is still a step.
- **Not Changes**: These steps don't count as changes to the document (nothing new to save).
- **Moves and Pastes**: A move or paste keeps its selection with it: undoing a move puts the selection back where the
  block came from, undoing a pasted block's moves puts it back where the block was pasted, and redo puts it back on the
  block.
- **Rescaling**: A grid change that rescales drops the selection steps.

---

## Swap Cell FG/BG

**Swap cell FG/BG** (**F**, ANSI view) acts on the selected layer. On a drawing layer it swaps a cell's colors or the
paint there; on a cell with neither, the swap goes on that layer as paint, the colors it showed swapped. On the base it
swaps the two halves of each cell's base colors. In Edit Mode, **Alt+X** (Option+X) does the same to the cell under
the cursor, as one undo step, without leaving Edit Mode.

---

## Other Tools

- **Shapes** (**U**): **Rectangle**, **Ellipse** or **Line**. They draw their outline in the foreground color and fill
  the inside with the background color; set the background to None for an outline only, or the foreground for the fill
  alone ([None](#color-keys)). In the ANSI view, **Draw with** chooses how:
  - **Single line** and **Double line** (rectangles and lines; an ellipse set to them draws as Half-block): box-drawing
    frames. With **Connect** on, a box joins its frame to the lines it crosses or meets, the ones you can see: a line
    hidden under paint isn't joined.
  - **Half-block** and **Full-block**: paint over the cells at half-cell or whole-cell detail, which comes out in the
    layer's characters: on a blank canvas under Random, Random's. **Write block glyphs** (off to start) writes real ▄ or
    █ characters instead. In Half-block, each ▄ replaces the character it's written over, and that character's color,
    as the Pencil's and Brush's Half-block does. With it off, Half-block still makes a ▄ of each cell where the shape
    crosses a character someone drew (a line box, a letter), on its layer or one under it, so the crossing is a clean
    half-block whichever half of the cell the edge falls in; paint alone would fill the whole cell from one half and
    only recolor the character from the other.
  - **Character**: the shape is the character in the foreground color, and the cells' backgrounds are left alone.
    **Fill** fills the inside with the character too. It's always offered. Its field shows the character drawn: type
    one, or open the picker for the F-key palette's characters and every character the drawing's font has.
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
  In a bitmap font, which has no quarter blocks, Half-block draws ▌ ▐ and █ a whole cell tall instead. A line and its
  mirror image are drawn alike.
- **Paint Bucket** (**G**): Fills what you see, in the foreground color.
  - **Walls**: Text and lines you've drawn on the selected layer (any of its cells whose character isn't a space, █, ▀
    or ▄) are walls: a fill stops at them and never covers them, so it stays inside a box and leaves your text readable.
    A line hidden under paint isn't a wall, since you can't see it. Text on other layers isn't a wall: a fill on a
    layer above it covers it there, on the layer you're filling, and hiding that layer or erasing the fill shows the
    text again.
  - **What It Goes By**: A Normal fill goes by what the view shows, as the Magic Wand does: in the PIXEL view an opened
    file's characters as they look, and with **All layers** on the characters typed on the layers above.
  - **Options**: **Tolerance**, **Contiguous** (off fills every match across the canvas) and **Feather**, which softens
    the filled edge.
  - **Selections**: With a selection, the fill stays inside it, and a click outside it fills nothing.
  - **All Layers**: On, as it starts, the fill goes by what you see: every layer that shows, together. Off, it goes by
    the selected layer alone, and where that layer has nothing is a color of its own. So inside an outline you painted
    on a layer, a click fills the clear inside the outline, whatever the picture under it looks like, and a click on
    the layer's paint fills that paint and not the same color elsewhere in the picture. With the base selected, off
    goes by the picture alone, as if nothing were drawn over it. Either way the fill lands on the selected layer. It's
    the Paint Bucket's and the Gradient's own setting, apart from the Select tool's **All layers**.
  - **Cells**: In the ANSI view its **Fill** menu offers **Colors only** (to start) and **Cells**: whole cells instead of
    the color you see. **Match** chooses what a cell must share with the one you click (its **FG**, **BG** and/or
    character, **Char**; all three to start, so cells that look the same), with the colors within the Tolerance, and
    **Set** what the fill gives the cells: your foreground color (to start), background color and/or character. There's
    no Feather. Set → **Char** shows the same character field as the Shapes tool's Character. Cells fills text and lines too, since it's matching cells rather than flowing around them. With
    **All layers** off it matches the selected layer's own cells: a character with its own colors, a painted cell by
    its paint, and a cell with nothing on that layer only with other empty ones.
- **Gradient** (**Shift+G**, sharing the Paint Bucket's button): Fills with a blend from your foreground color to your
  background color instead of one color.
  - **Shape**: **Linear** (to start) or **Spherical**. You drag a line, which shows while you drag, and the fill lands
    when you let go.
  - **The Area**: The Paint Bucket's usual one: the selection if there is one, otherwise what a click where the drag
    starts would fill, by the same Tolerance, Contiguous, **All layers**, Feather and Match.
  - **Linear**: Foreground where you press and background where you let go, with the bands square to the line, so a
    diagonal drag makes a diagonal gradient. Before the press it stays foreground, and past the release it stays
    background.
  - **Spherical**: A circle: foreground at the press, background as far out as the line is long, and evenly between.
  - **Shift** snaps the line to steps of 45°. A click without a drag fills nothing, and a drag with either color set to
    None fills nothing and says why. **Escape** before you let go throws the drag away: the line goes, and nothing is
    filled.
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
    cell itself doesn't fade. A cell Merge down froze (the edge of a merged shape) is paint to them: its paint is
    still under it, and where a stroke changes it the pinned character comes off and it fades like the paint beside
    it. A cell the Brush made a ▄ holds only its character, its colors being paint, so its paint changes.
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
  - **In Color ASCII**: A cell the picture made is ink on black with no background of its own, so picking its
    background sets yours to **None**, not black. Only a cell you typed or drew with a background gives you that
    color. For a black background, choose black in the color picker.
- **The Status Bar**: Starts with the name of the selected layer, so a folded panel or a phone still says which layer
  you're on. Then it follows the tool: Edit Mode shows the cell under the cursor, Select the selection's size and place,
  and the Eyedropper its last pick and where each color came from. On the right it shows that Space pans, and while you
  hold Alt (Option on a Mac) or Shift, what that key does with the tool, then its buttons: the zoom (away from 100%),
  **Overwrite**, **Insert** or **Partial** in Edit Mode, **Canvas** or **DOM**, **iCE** in a 16-color drawing ([iCE colors](characters.md#ice-colors)), and **Smooth**. When the view is too narrow for all
  of it, the FG and BG hex codes go first (hover a swatch for its code), so the buttons stay whole; then the readout
  wraps onto another line a part at a time (Col and Row, Char, FG, BG), so nothing in it is cut off, and only the
  buttons scroll sideways, faded at the edge while there are more, with the mouse wheel too. The readout keeps room for its largest
  numbers, so moving the cursor doesn't change how it wraps. A long layer name is cut short; hover it for the whole
  name.
- **Zoom** (**Z**): The ANSI view zooms from 25% of its cells' size to 800% (100% is the font at its size), with
  Ctrl+wheel (a trackpad pinch), a pinch on a touch screen, or the Zoom tool. With the Zoom tool, a click (a tap) zooms
  in one step around the point clicked and **Alt**-click (**Option**-click on a Mac) zooms out one, the steps being the
  powers of two (25%, 50%, 100% … 800%; in the PIXEL view 1× to 16×), so from between steps a click goes to the next
  one; the cursor shows a minus while Alt is held. Drag left to zoom out, right to zoom in, smoothly, by half or double
  every 300 pixels: a press that moves more than a few pixels is a drag. **Cmd++** and **Cmd+−** (Ctrl on Windows and Linux) double or halve it around
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
- **Ctrl + Shift + F1 to F12**: In Edit Mode, puts the character under the cursor on that slot of your active character
  palette. It takes Shift because macOS keeps Ctrl+F1 to Ctrl+F8 for itself.
- **Ctrl + , and Ctrl + .**: In Edit Mode, the previous and next character palette (the F-key strip's arrows).
- **Alt + ↑ ↓ → ←** (Option on a Mac): In Edit Mode, as in Moebius, insert a line at the cursor, delete the cursor's
  line, insert a column, delete the cursor's column, on the layer you're typing on
  ([Typing Text Directly](characters.md#typing-text-directly)). Anywhere else the art shows, **Alt+←** and **Alt+→** do
  nothing, so the browser doesn't go back a page.
- **Alt + ] and Alt + [** (Option on a Mac): Select the layer above or below, in Edit Mode while you type too
  ([The Layers List](#the-layers-list)). **Shift+Alt+N** adds a drawing layer and **Shift+Alt+V** a vector layer.
- **Alt + 1 to 4** (Option on a Mac): The editor tabs, in order, as a click on the tab chooses it, so Back goes back to
  the one before: **Alt+1** PIXEL (VECTOR with a vector layer selected), **Alt+2** ANSI (or ASCII), **Alt+3** SAUCE, and
  **Alt+4** ROOM while you watch a room. A tab that isn't showing or is off (with nothing open, or ANSI with a vector
  layer selected) stays put, and the key does nothing. They work from SAUCE and ROOM too, but not from a text field, a
  dialog, or Edit Mode while you type, where Option's digits type their characters on a Mac (on a British Mac Option+3
  is #). On Linux, where the browser switches its own tabs on Alt+1 to 4, they do nothing where they don't apply (while
  you type, mid-stroke, with the color box open), outside a text field.
- **?**: Opens the full keyboard shortcut list ([All the Shortcuts](#all-the-shortcuts)).
- **Cmd + K** (Ctrl+K on Windows and Linux): Opens the command list, to find any command by name and run it
  ([The Command List](#the-command-list)).

### Tool Keys

A letter chooses a tool, as in Photoshop, with Moebius's keys where it has the same tool: **P** Pencil, **B** Brush,
**E** Eraser, **G** Paint Bucket, **Shift+G** Gradient, **R** Blur, **O** Dodge, **Shift+O** Burn, **U** Shapes, **I**
Eyedropper, **H** Hand, **Z** Zoom, **W** Magic Wand, **T** or **K** Edit Mode, **F** Swap cell FG/BG and **M** Select,
in the views that have the tool (Edit Mode and Swap cell FG/BG are the ANSI view's). Each tool's tooltip shows its key.

**]** and **[** grow and shrink the Size of the Brush, the Eraser (the Size its row shows: cells or pixels), Blur,
Dodge and Burn by 1 a press, from 1 to 20, as in Photoshop, and on VECTOR the Shape tool's Polygon **Sides**, from 3 to
12. In Edit Mode, while you type, these keys type, and so do the ones below.

- **The Tool's Key Again**: With the tool chosen, its key steps the tool's kind and wraps: **U** goes from Rectangle to
  Ellipse, then Line (on VECTOR, through its Shape row, a plugin's shapes too), **Shift+G** between Linear and
  Spherical, and **O** and **Shift+O** through Dodge's and Burn's Range. A tool with no kind (Blur, say) stays as it
  is. Holding the key down steps once.
- **D and Shift+D**: The next and previous **Draw with** ([Draw With](#draw-with)): the Pencil's, the Brush's and
  Shapes' in the ANSI view, and the Paint Bucket's and Gradient's **Fill**, past the choices the menu hides (an
  Ellipse has no line styles), wrapping.
- **The Digits**: Set the tool's amount, as in Photoshop: the Brush's **Opacity**, the Eraser's **Flow**, Blur's,
  Dodge's and Burn's **Strength**, and the Paint Bucket's, Gradient's and Magic Wand's **Tolerance**. **1** is 10, **9**
  is 90 and **0** is 100; two digits within a second set it exactly (**4** then **5** is 45, **0** then **5** is 5),
  within the slider's range.
- **Shift+[ and Shift+]**: Softer and harder: the Brush's and Blur's, Dodge's and Burn's **Hardness** by 10 a press,
  and the Eraser's edge, Soft or Hard.

- **Shared Buttons**: Some tools share a button: the Paint Bucket and Gradient; Blur, Dodge and Burn; Select and the
  Magic Wand; the Hand and Zoom; and on VECTOR the Vector select and Node tools. The button shows the one you chose
  last (the first until then); click it to use that one. Its corner, a long press or a right-click opens the rest, each
  with its key (not on a phone). A tool's key chooses it whichever one the button shows. When the toolbar is too
  narrow, the ⋯ menu lists the shared button's tools one by one.
- **The Options Row**: Under the tools, the chosen tool's options. When its buttons and checkboxes don't all fit, those
  at its end move into a **⋯** menu after the last one that fits, in the row's order, each as it is in the row: a button
  that's off stays off with its tooltip, and a checkbox shows a check when it's on. A row that's too wide even then (it's mostly sliders)
  keeps them all and scrolls sideways instead.
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
- **Ctrl+↑** and **Ctrl+↓** (**Ctrl+Option+↑** and **↓** on a Mac, which keeps Ctrl+arrows for Spaces): Step the
  foreground color to the palette's previous or next color. **Ctrl+←** and **Ctrl+→** (**Ctrl+Option+←** and **→**) do
  the same for the background. They work in the PIXEL and ANSI views with any tool, typing in Edit Mode too, but not in
  Monochrome ASCII, which has no colors, or in the middle of a stroke.
- **In the Color Picker**: The **arrow keys** move between the swatches (starting on the current color), **Enter**
  picks one and closes the picker, **Space** picks one and leaves it open, and **Escape** closes it.
- **Pick from the screen** (the eyedropper beside **Swap**, in Chrome, Edge and the desktop app): Click it, then click
  anywhere on your screen, another window or app included, to take that color for the side that's open. **Escape** puts
  the eyedropper away without choosing. The **Picker** tool (**I**) still takes colors from the drawing itself.
- **In Full Color**: The picker is your browser's own color picker, with the colors already in the drawing under it.
  While the side is **None**, the label beside it says None and the color it shows is the one None was laid over (black,
  for a new drawing's background). Pressing it chooses that color at once, so black is one press away, and whatever you
  pick in it after replaces it.
- **None**: Either side can be **None**, in every view, and None leaves what's there. Typing, line boxes, a Character
  shape and the Paint Bucket's **Cells** write characters, and a side set to None keeps the cell's own color (with
  only None colors lit in **Set**, **Cells** fills nothing and says why). The Brush, the Pencil's paint and the Paint
  Bucket's **Normal** paint in the foreground color, so with it None they paint nothing and say why. A shape painted
  or drawn in blocks with the foreground None is its fill alone, its edge in the background color too; with both None,
  or a line with the foreground None, it draws nothing and says why. With both None, typing still types, and a line
  box or a Character shape still draws, in the colors already there, and a toast says so.
- **With a Palette** (CGA, VGA, Limited count or Custom color list): Every swatch, in the grid and in **Recent**, paints
  its palette color whatever the color adjustments are. A color the adjustments can't make at all (Saturation at 0 makes
  only grays) shows under a "no" sign (a circle with a slash) and can't be picked, in **Recent** too, and the arrows, and
  the color steps (**Ctrl+arrows**), step past it. With [iCE colors](characters.md#ice-colors) off, the bright
  colors (8 to 15) on the BG side have a small spark in the corner, in **Recent** too: as the background of a character you type they blink. **Recent** keeps the palette colors you picked; a recent color
  the palette doesn't have (one picked in Full Color) shows as the palette's nearest. A palette with many colors (a
  list of 256 is 32 rows) scrolls by itself, so **None** and **Recent** under it stay in reach. With a Custom color
  list, the color layer's **Palettes** page edits it ([The Color Layer](#the-color-layer)).
- **Shift+Cmd+X** (Shift+Ctrl+X): Swap the foreground and background. Plain **X** swaps them too, except in Edit Mode,
  where it types.
- **Alt+U** (Option+U): Take the colors of the cell under the pointer, as the **Eyedropper** with both toggles lit
  does, in the PIXEL and ANSI views with any tool; in Edit Mode, the cell under the cursor. **Shift+Alt+U** takes its
  character too, for the tools that draw with one. In the PIXEL view a pixel has one color: **Alt+U** takes it as the
  foreground and **Shift+Alt+U** as the background. With the pointer off the art they do nothing. On a Mac they don't
  work while you type in Edit Mode, for now, since Option+U starts an umlaut (ü) there: the command list (**Cmd+K**)
  has them ([Typing Text Directly](characters.md#typing-text-directly)).

### The Color Layer

The color pair's box is a layer, as the character palette layer is: it opens under the pair, 282px across, with two tabs,
**Colors** and **Palettes**. **Colors** is the picker described above. **Palettes** is the layer's big size, laid out
like the Fonts page: a list on the left and the details of the chosen row on the right. It floats under the toolbar on a
big window; on a smaller one (under 1000px wide, or 520px tall) it opens as a dialog over the dimmed page, and on a
phone's width (under 700px) it takes the whole window. Opening the color layer closes the character palette layer, and
the other way round. **Escape** closes it (in a field you type in, the field's own Escape comes first), as does a click
outside it or the **×** at the top right of the dialog. **↓** and **↑** walk the list.

- **The List**: **This drawing** first (with no drawing open, **New drawings**: the palette the next drawing starts
  with), then **Favorites** and **Library**, a search narrowing the rows by name or author, and **Search Lospec** at the
  foot. **Library** holds the palettes from Lospec that come with Phosphor; **Favorites** the ones you starred or got from
  Lospec, kept in this browser, newest first. **Favorites** and **Library** fold on their titles, as the Fonts page's
  groups do, and stay folded in this browser; a palette you get from Lospec opens **Favorites** to show it.
- **The Details**: A palette's name and author, **Use this palette** (**In use** when its colors are the list, in the
  same order), **Favorite**, **Save .hex** (a file named after the palette, `Sweetie 16.hex`), **On Lospec** (its page),
  and its colors as swatches with their hex under them. **Use this palette** sets Color palette to Custom color list with those colors, and the layer stays open. A line
  at the details' foot says the drawing's colors were replaced, with **Put back**, which brings back the Color palette
  and the list as they were before the first Use, however many you tried. Closing the layer keeps what's in use.
- **This Drawing**: With a Custom color list it's the editor: **Import .hex** (replacing the list with a `.hex` or
  `.txt` file's colors; a file over 1 MB isn't read) and **Export .hex** as buttons, the colors as large swatches with
  their hex, a **+** that adds a copy of the picked color at the end, and under them the picked color's chip (the system
  color picker), its hex, the move earlier and move later buttons, and **Remove**. With a mouse a swatch can be dragged
  to another place: while it's dragged a dashed outline shows where it will land, and the others slide out of its way
  (as they slide for the move buttons, unless your system asks for reduced motion). With hundreds of colors the
  swatches scroll inside the details, so the buttons stay in reach, and a swatch dragged near their top or bottom (or
  past it) scrolls them. The swatches are one **Tab** stop, the picked one: from there
  **←** and **→** pick the one before or after, **↑** and **↓** the one a row away, and **Home** and **End** the first
  and last. A hex typed takes effect on **Enter** or leaving the field, and **Escape** puts back the one in use. A list
  of two or more colors typed or pasted there replaces every color. Each replacement says so in a toast with
  **Put back**. A changed color rewrites nothing drawn: paint and cells keep their colors and show as the nearest color
  in the list.
- **Any Other Palette**: **This drawing** shows its colors, read-only, and **Edit as a Custom color list** makes them the
  list (for Full color, the list kept from before). It's off for Limited count with no picture, and while the settings
  are locked. **Put back** undoes it. Any hand edit of the list, whether typed, picked, moved, imported or put back by
  its toast, ends **Put back**. Another drawing opening while the layer is open forgets it too.
- **Search Lospec**: A palette that isn't in the Library can be got: under **Not here? Search Lospec.**, the field takes
  a palette's name (`Sweetie 16`) or its id (`sweetie-16`, a lospec.com link works too), and the search button asks
  lospec.com for that one palette, and only when it's pressed; opening the layer, browsing and using the Library ask
  nothing of anyone. The palette is kept under Favorites, which then shows it first (one of more than 256 colors keeps
  its first 256, and says so). When Lospec has no palette by that name, can't be reached, or answers with something
  that isn't a palette, the line under the field says which and nothing is kept. In the browser a name Lospec doesn't
  have and Lospec out of reach get the same message, since Lospec's answer for a missing palette is one the page isn't
  allowed to read; the desktop app asks Lospec itself and tells them apart. A search changes nothing of the drawing, so
  it works while the settings are locked.
- **While the Settings Are Locked** (in a room, as an artist): the editor, **Use this palette** and **Put back** are off,
  with the reason shown. A lock that comes while the layer is open turns them off.

About's Licenses tab credits the palettes to Lospec's Palette List and their authors.

### All the Shortcuts

- **The List**: Press **?** for the list of every keyboard shortcut (in Edit Mode, where ? types, press **Alt+?**,
  Option+? on a Mac). It doesn't open from a text field.
- **Opening a File**: **Cmd+O** (Ctrl+O) opens the file chooser, from anywhere in the app except while you type in a
  field; with the Text tool's caret placed too. What you pick opens as a dropped file does, asking first where a drop
  would. A new or opened drawing starts with the caret put away.
- **The Start Screen**: A fresh tab starts with **Choose a file** focused, so **Tab** goes on from there, and **Enter** or
  **Space** presses it. From there **↓** and **↑** move between its buttons in order: **Choose a file**, **Start
  with a blank canvas**, and each drawing's **Resume** (not one that's open in another tab).
- **A Dialog's Choices**: Where a dialog lists its choices one under another (unsaved changes, opening an art file,
  Merge down, Bake, deleting a layer in a room), **↓** and **↑** move between the choices and **Cancel**, and **Enter**
  or **Space** presses the one with focus. They stop at the first and the last. The same goes for **Versions** (each
  **Restore**, then **Close**) and for the list of formats in **Export**, where the arrows move focus and Enter or
  Space picks the format. In a field, a slider or a menu, the arrows do what they do there.
- **Menus**: With a menu open from its button (**Enter** or **Space**: **Draw with**, a layer's menu, **⋯**), **↓** goes
  from the button to the first item, and **↓** and **↑** move between the items, past any that's off. They stop at the
  last item, and **↑** from the first goes back to the button. **Enter** or **Space** picks the item with focus and
  focus goes back to the button. **Escape** closes the menu.
- **Scrolling**: **Page Up** and **Page Down** scroll the view one screen, and **Home** and **End** (or **Cmd+↑** and
  **Cmd+↓** on a Mac) scroll to its top and bottom. They reach the view whenever nothing else has focus, as after a file
  opens, or what has it doesn't use them (a tab you just clicked, a checkbox), so you don't need to click the view
  first. In Edit Mode, while you type, Home and End move the cursor instead.
- **Keys and Focus**: A focused control keeps only the keys it uses, and the rest are the app's. A field you type in or
  a menu keeps every key; a slider its arrows, Home, End, Page Up and Page Down; a checkbox or a button Space and Enter
  (a radio button its arrows too, a tab ← and →, a LAYERS row its arrows, Home and End). So after you click **All
  layers**, say, Delete and Escape still work on the selection.
- **Saving and Exporting**: **Cmd+S** (Ctrl+S) saves the project and **Cmd+E** (Ctrl+E) opens Export. In either
  dialog, **Enter** in the file name saves or exports.

### The Command List

**Cmd+K** (Ctrl+K on Windows and Linux) opens a box for running a command by name, so the ones you use now and then
don't need a key or a trip to their button. In the desktop app it's also **Help > Command List…**. The start screen's
**Keyboard** box, in its bottom right corner (under the list on a phone), shows this key and **?** for the shortcuts
list, and opens either when clicked; it shows only with a mouse or trackpad, where there's likely a keyboard.

- **Finding**: Type a few letters of the command's words, in order but not necessarily together: **exa** finds
  **Export .ans**, and **save as** finds **Save the project as a new file**. Whole words you type come first, then the
  starts of words, then the rest. With nothing typed, the box shows the commands you ran from it last, then all of them
  by group.
- **Running**: **↑** and **↓** move between the rows while you go on typing, **Enter** runs the one picked (or click it),
  and **Escape** closes the box. The box closes before the command runs, so one that opens a dialog (Export, Versions)
  opens it on its own, and focus goes back where it was, Edit Mode's cursor too.
- **What's in it**: Every command the app has a key for, each with its key at the right so you can learn it, and the
  ones that have none, each doing what its button does (and asking what its button asks):
  - **File and panels**: **New project**, **New from clipboard** (a new drawing the size of what you copied:
    [Saving and Exporting](characters.md#saving-and-exporting)), **Versions**, **Export…** and each format on its own (**Export .ans**,
    **Export .png**, **Export .gif**…, which open Export on that format), **Layers**, **Social**, **Plugins…**,
    **Reload plugins** (each plugin you picked from a file or folder, read again) and **Reload with Plugins Off**.
  - **The drawing**: **Bake**, **Flatten**, **Merge down** (into the base it asks how, **Blend into source image**
    among the choices), **Dimensions** (the cursor in the field, its number picked), **Animate** (on or off) and
    **Manage fonts**.
  - **Layers**, on the picked one: **Layer: Rename**, **Layer: Duplicate**, **Layer: Delete**, **Layer: Hide** or
    **Layer: Show**, and **Layer: Pick the base**; and **Make art layer** from the selection.
  - **VECTOR**, on the selected shapes: **Selected shapes: Forward**, **Back**, **To front** and **To back** (the top or
    bottom of their own vector layer), and **Duplicate** (copies on top, selected, as a paste puts them, leaving the
    clipboard as it was).
  - **Rooms**: **Start a room**, **Join a Room…**, **Copy link** (**Copy address** in the desktop app), **Settings and
    stats**, **End room** (asked first), **Leave Room** and **Show others' cursors**.
  - **Tool options**: each tool's checkboxes, toggles and choices in the tab showing, with the tool's name first
    (**Magic Wand: Contiguous**, **Shapes: Ellipse**, **Magic Wand: Match BG**). Running one chooses the tool and sets
    the option, as the options row does.
  - **The tool's keys**: **Draw with: next** and **previous** (D and Shift+D), and **Softer** and **Harder** (Shift+[
    and Shift+]), on the chosen tool; the digits' amount is the keys' alone.

  The tools of the tab showing are there too, and inserting and deleting lines and columns at Edit Mode's cursor. A
  command that doesn't apply where you are (zooming on the start screen, VECTOR's on PIXEL) isn't listed.
- **Grayed Rows**: A command that can't run now shows grayed with the reason its button gives, such as **No drawing
  open**, **Not on the base layer** or **Only the host can do this**, and Enter does nothing on it. What you type finds
  the commands that can run first and the grayed ones under them, and the first that can run is the one picked, so
  Enter runs it.
- **Where It Opens**: From anywhere but another dialog, the color box or the character palette, while you type in Edit
  Mode or in a field too. On a Mac it's **Cmd**+K only, as **Ctrl+K** in a text field deletes to the end of the line.
  The commands you ran last are kept in this browser.

---

## When the Grid Changes

What a new grid size (**Dimensions**) does depends on what's drawn, and on what Undo could bring back. A size you type
applies when you press **Enter** or **Tab** or click elsewhere, not digit by digit; **Escape** puts the field back to
the grid's size. The stepper arrows and the **↑** and **↓** keys change the size at once, a step at a time.

- **Canvas Resize**: With anything drawn (cells, shapes or paint on any layer, or on the base: its pinned characters
  and its own pixels, from drawing on it, erasing it, Merge down or an ANSI file opened with Draw on top), or any drawing
  step to undo or redo (a cleared layer, a stroke you undid), resizing is a canvas resize. The picture and everything
  on it stay exactly where they are; columns and rows are added or removed at the right and bottom, and every undo step
  still fits. Paint is kept at up to the picture's own resolution, at most 4,000 pixels on a side, so on a large
  picture a grid grown past that resamples the paint. What a shrink cuts off isn't lost: it comes back when you make the grid bigger again, and it's saved with
  the project. **Lock aspect ratio** still works: on, the other number follows to keep the shape.
- **Rescale**: With nothing drawn and no drawing step to undo (slider, settings and selection steps don't count, nor
  adding or reordering layers), resizing rescales: the image is converted again at the new size.
- **Undo**: Each change of size is one undo step, and so is a run of them a moment apart (the stepper arrows or the
  **↑** and **↓** keys held), as a run of nudges on a slider is. Undo puts back the old size and everything on it as it was, pixel
  for pixel, every frame too (paint the resize resampled, and a picture that rescaled, aren't resized back, which
  would blur them), and the steps before it stay, so undo goes on past it. A size change of its own doesn't count as a
  drawing step: with nothing drawn, the next one rescales too. In a room a size change isn't an undo step: the host's
  new grid goes to everyone with the whole drawing and clears the host's undo history, so Dimensions asks first,
  "Changing the dimensions cannot be undone in shared rooms, and it clears your undo history.", once a change (as the
  field applies it, or at a stepper press); **Cancel** keeps the size, and the steps.
- **Back to Rescaling**: Clearing or erasing everything on the drawing layers brings rescaling back once there's no
  drawing step left to undo, unless the base has been drawn on. A new document, or a project or file opened, starts
  with no steps to undo.
- **Limits**: The grid can be up to **300 columns** wide and **5,000 lines** tall, with **500,000 cells** in all, so
  narrow art can run long: 80 and 100 columns reach the full 5,000 lines, 160 columns stops at 3,125 and 300 at 1,666.
  With animation on, a drawing holds at most 40,000 cells, and the aspect ratio lock doesn't apply.
- **Lock Aspect Ratio**: The lock keeps the shape the grid had when you turned it on: unlock, set both numbers, lock
  again, and changing one number keeps the other in that shape, whether it rescales or resizes the canvas. It's saved
  with the project. A new picture starts with its own shape. A number past the largest size that keeps the shape stops
  there, and a message says the lock held it: turn the lock off to grow one number alone, up to the limits. A number
  under 1 isn't taken, and a message gives the smallest size, 1 column by 1 pixel row.
- **Blank Canvas**: A blank canvas is one color all over, so it fills the grid at any size (a font of another height
  included), and the adjustments (Invert, Brightness and the rest) reach every cell. Into the image takes every cell
  of it into the picture, where the image filters reach it.
- **Opening a Picture**: A picture opens at the current width, or narrower if that's what it takes to fit its shape.
