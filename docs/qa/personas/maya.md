# Maya: turns her photos into ANSI art

## Who

Maya is a photographer and illustrator who found Phosphor through a friend's ANSI portrait. She knows what ANSI art
looks like and has seen the old BBS screens, but she has never drawn a cell by hand. She thinks in pictures: levels,
contrast, grain, dithering. She knows Photoshop well, so she reaches for its keys and its words (layers, merge down,
flatten, bake) and expects them to mean what they mean there.

## Why they're here

She wants a photo of hers to come out as ANSI art that looks good on its own: the right style and palette, the right
characters, smooth gradients instead of bands, then a few layers of paint, type and fills over it. Done is a PNG to
post, an .ans that opens the same in a terminal, and a .phosphor file she can reopen next week and keep tuning.

## What they bring

- Her photos: `images/photo.jpg` (the one she works on), `images/gradient.png` (a sky she tests dithering on),
  `images/rgba.png` (a cut-out with transparency), `images/p3.png` (straight from her camera, Display P3),
  `images/tall.png` (a phone panorama turned on its side, 40 × 1200), all from `tests/fixtures/` (`e2e.fixture`).
- An SVG mark she likes to put in a corner: `svg/rose-mark.svg`.
- Habits: tries every option of a menu once, one after another, and compares; undoes a lot; keeps sliders moving while
  the picture redraws; uses Photoshop's keys (B, G, Cmd+Z, Cmd+E for Merge down, Cmd+Shift+N for a new layer) without
  thinking.
- A desktop or a tablet, a mouse or a trackpad; the keys she knows from Photoshop.

## What they lean on

- The left column's settings: Dimensions, Art style, Color palette, Transforms, Adjustments, the Characters section
  (Choose characters, the Characters set, the seed, Solids, Pattern light, Dither style and Dither) and Image filters
  ([Layers](../../layers.md#the-left-column), [Characters](../../characters.md#how-the-converter-picks-characters)).
- LAYERS: + Layer, + Vector layer, picking, the eye, Merge down, Bake ([Layers](../../layers.md)).
- The Brush, Edit Mode, the Paint Bucket and its Gradient choice ([Layers](../../layers.md#other-tools)).
- VECTOR's Shape tool, Fill and Stroke, gradients and art layers ([Vector shapes](../../vector.md)).
- Save project, Export .ans and Export .png ([Characters](../../characters.md#saving-utf8ans-and-ans)).

## What makes them give up

- A picture that looks right on screen and wrong in the export (another palette, lost dithering, a missing layer).
- A merge or a bake that changes the picture when it said nothing would change, or that Undo doesn't bring back.
- A slider that lags so far behind her hand that she can't tell what it's doing.
- Reopening her project and finding her settings, layers or shapes gone.

## Sizes

- Her picture at the size it opens at: 80 columns, its rows from the photo's shape (`photo.jpg` opens at 80 by 54
  pixel rows, which is 27 lines: about 2,160 cells).
- Then 200 columns, rows from the shape again (about 13,000 cells for `photo.jpg`).
- `tall.png` at 80 columns, as tall as the limits let it (up to 5,000 lines).
- 4 layers at most: the base, two cells layers and one vector layer; 3 to 5 shapes; one art layer.
- Exports: a .phosphor of a few hundred KB, an .ans under 100 KB.

## Traits

All apply. She has no account and no partner: she doesn't use SOCIAL.

## Goals
- The PNG I post and the .ans I export look like my screen: the same palette, the dithering kept, no layer missing.
- A merge or a bake that says nothing will change changes nothing, and Undo brings back what any of them did.
- The level sliders keep up with my hand.
  Counted: ms on set-levels, target 250, lower is better.
- My saved project reopens with its settings, layers and shapes all there.

## Script

Each `##` heading after this one, up to Known, is a section of the script. Steps are numbered through the whole
script. Every section ends with Free time.

## Getting the picture in

### 1. Open my photo
- Does: on the start screen, chooses `photo.jpg` with Choose a file (or drops it on the box that says "Drop an image,
  .phosphor or ANSI file here").
- Expects: it opens on ANSI as character art, 80 columns wide with its rows from the photo's shape; LAYERS shows
  Layer 1 (picked) over Base; the Characters section is titled "Characters · Layer 1"; the address shows the ANSI tab.
  Opening takes under the `file` budget.
- Probes: `free`: drop the file on the box instead of using the button; `again`: press New project and open the same
  `photo.jpg` a second time, checking New project asks about unsaved changes only if there are any;
  `extremes`: open `tall.png` and `rgba.png` and look at where the transparency and the long edge land.
- Rated: yes, wants Cmd+O

### 2. Pick the picture itself, to tune it
- Does: picks Base in LAYERS, because a new drawing picks Layer 1 and she wants to change how the picture converts.
- Expects: the Characters section becomes "Characters · Base", and the Picture · Base and Image filters sections
  appear (they're hidden while another layer is picked); the tabs stay PIXEL, ANSI and SAUCE.
- Probes: `out-of-order`: before picking Base, change Choose characters on Layer 1 and see that the picture doesn't
  change (it's Layer 1's paint setting), then look for what told her so; `back-out`: pick Layer 1 again and back;
  `interrupt`: switch to PIXEL and back and check Base is still picked.
- Rated: yes, wants a key to step through the layers (Alt+[ and Alt+], as in Photoshop)

### 3. Try every art style
- Does: sets Art style to Color ASCII, then Monochrome ASCII, then back to ANSI, looking at each.
- Expects: Color ASCII draws colored characters on black; Monochrome ASCII white on black; Choose characters offers
  Random, Best match and By shape in ANSI, By intensity and By shape in Color ASCII, By brightness and By shape in
  Monochrome ASCII ([Characters](../../characters.md#how-the-converter-picks-characters)); each change lands within
  the `setting` budget.
- Probes: `undo-redo`: make a brush mark, change the style twice, then undo, and check it takes the mark back and leaves the
  style (a style change isn't an undo step); redo it;
  `speed`: arrow through the Art style menu as fast as it takes keys and check the picture ends on the last one.
- Rated: yes, wants Tab to Art style then the arrows

### 4. Try every palette
- Does: in Color palette, tries Full color (24-bit), VGA (256 colors), CGA (16 colors), Limited count (and moves its
  Color count) and Custom color list.
- Expects: each one recolors the picture to its colors; Limited count shows a Color count slider; Custom color list
  shows Palette colors to edit; Dither style and Dither appear in the Characters section once there's a palette.
- Probes: `extremes`: set Color count to its least and its most; `undo-redo`: undo back to Full color and check the
  Dither controls go away again; `again`: pick CGA twice in a row.
- Rated: yes, wants Tab to Color palette then the arrows

### 5. Let it choose the characters: Best match
- Does: on CGA, sets Choose characters to Best match, picks "Blocks & shades" from the Characters presets, and moves
  Solids and Pattern light.
- Expects: the picture's gradients come out in shades of the palette's colors (`▄ ░ ▒ ▓ █`), with the seed field gone
  (it shows only with Random); Solids makes more flat cells as it rises; Pattern light makes the shades read lighter;
  each slider move is one undo step ([Characters](../../characters.md#how-the-converter-picks-characters)).
- Probes: `again`: add the same character twice to the set and check nothing changes ("Repeating a character in your
  set makes no difference"); `back-out`: start typing in the Characters field, press Escape or click away, and check
  what's kept; `undo-redo`: type a set, press Cmd+Z while still in the field (it undoes her typing), then press Enter
  and Cmd+Z (it undoes the step, and the field shows what that leaves).
- Rated: yes, wants Tab to Choose characters then the arrows

### 6. Let it choose by shape
- Does: switches Choose characters to By shape, picks the "High-res" preset, then changes the Font (in Drawing) to
  IBM VGA and back to JetBrains Mono.
- Expects: edges inside cells come out as quadrants, `▐ ▌` and rising blocks; changing the font changes how the cells
  look, not which characters they hold ("The characters are measured in IBM VGA").
- Probes: `speed`: drag Pattern light back and forth for two seconds with `qa.frames` and check frames stay in the
  `frame` budget; `interrupt`: switch to PIXEL while it's redrawing and come back.
- Rated: yes, wants Tab to Choose characters then the arrows

### 7. Roll the seed
- Does: back on Random, rolls the seed's dice a few times, then types a seed of her own.
- Expects: each roll gives a new pattern; the same seed typed again gives the same pattern; the dice and a typed seed
  are each one undo step.
- Probes: `extremes`: type a 200-character seed with emoji in it, and an empty one; `undo-redo`: roll three times,
  undo three times, and check she's back to her first pattern.
- Rated: yes, wants Tab to the dice then Enter or Space

**Free time:** she'd try the presets she hasn't yet, compare Monochrome ASCII By brightness against By shape, open
the help (the i beside a label) for Choose characters, and try the same settings on `gradient.png`.

## The filters and their order

### 8. Soften the grain with Blur
- Does: moves Blur (in Image filters, with Base picked) up, then down to half.
- Expects: the picture's fine grain softens before it converts; the edit layer isn't changed; the move lands within the
  `setting` budget; a whole drag is one undo step.
- Probes: `out-of-order`: pick Layer 1 and look for Blur (it's hidden while another layer is picked); `undo-redo`:
  drag, undo, redo, and check the slider and the picture move together.
- Rated: yes, wants Tab to Blur then the arrows

### 9. Set the levels
- Measured: set-levels
- Does: moves Black point up, White point down, and Midtones both ways.
- Expects: tones at or below the black point go black, at or above the white point go white, and the rest spread
  across; Midtones lifts or deepens the middle without moving either end. Levels runs before the other adjustments,
  so Brightness and Contrast work on the leveled picture ([Layers](../../layers.md#the-base-layer)).
- Probes: `extremes`: put the black point above the white point and see what she gets; `speed`: nudge Midtones with
  the arrow keys twenty times quickly and check it's one undo step.
- Rated: yes, wants Tab to Black point then the arrows

### 10. Posterize, then Threshold
- Does: turns Posterize on at a few steps, then turns Threshold on and picks its Dark color and Light color.
- Expects: Posterize cuts each channel to that many steps; Threshold splits the picture into its two colors and runs
  last, after Posterize and the other adjustments, with the palette after it.
- Probes: `out-of-order`: with Threshold on, move Posterize and check what still changes (Threshold runs after it);
  `undo-redo`: undo both and check both sliders read Off again.
- Rated: yes, wants Tab to Posterize then the arrows

### 11. Check the order holds
- Does: with Blur up and Brightness raised, turns Edges on, then Sharpen; then folds Adjustments and Image filters by
  their titles.
- Expects: Edges traces the blurred picture (Blur is "Applied before the other effects"); Sharpen crisps only the edges
  (flat areas keep the colors Brightness gave them, and every color the picture shows is one the color picker can
  paint with); a folded section says how many of its sliders are on ("2 on"), and stays folded across a reload in this
  browser.
- Probes: `interrupt`: reload with sections folded and check they come back folded; `back-out`: press Reset on
  Adjustments, then undo it; `again`: Reset all twice.
- Rated: yes, wants a key to fold a section from its title (Enter or Space on the focused title)

**Free time:** she'd try Colorize and Hue shift on a photo with Threshold off, see whether Simplify plus Posterize
gives her a painterly look, look for a way to reorder the filters, and check the help text of each filter.

## Dithering

### 12. Dither a gradient smoothly
- Does: opens `gradient.png` (or keeps her photo), sets CGA, Choose characters Random, Dither style Floyd–Steinberg,
  and Dither from 0% up to 100%.
- Expects: the bands of the gradient break into a grain of the palette's colors; at 0% it's off; the move lands within
  the `setting` budget.
- Probes: `speed`: drag Dither for two seconds with `qa.frames`; `undo-redo`: undo the drag and check the slider and
  the picture both go back.
- Rated: yes, wants Tab to Dither then the arrows

### 13. Try the ordered dither
- Does: switches Dither style to Ordered (Bayer).
- Expects: a regular crosshatch instead of grain, staying put as she paints elsewhere.
- Probes: `again`: switch styles back and forth three times; `out-of-order`: set Full color and check the Dither
  controls go (they need a palette), then back to CGA and check her Dither came back as she left it.
- Rated: yes, wants Tab to Dither style then the arrows

### 14. Dither with Best match and By shape
- Does: with Dither on, switches Choose characters to Best match, then By shape, and tries both dither styles.
- Expects: Dither now works on the cells instead of the pixels: Floyd–Steinberg carries each cell's error on to the next
  cells, Ordered nudges each cell by its place ([Characters](../../characters.md#how-the-converter-picks-characters)).
- Probes: `extremes`: Dither at 100% with Solids at 100%; `interrupt`: switch to PIXEL and check what the Pixel tab
  shows for Best match's cells (each half its two colors blended).
- Rated: yes, wants Tab to Choose characters then the arrows

**Free time:** she'd try Limited count with 4 colors and each dither, paint a stroke on Layer 1 to see paint isn't
dithered, and compare the dither at 80 and at 200 columns.

## Layers to draw on

### 15. Add a layer to paint on
- Does: picks Layer 1, presses + Layer.
- Expects: "Layer 2" appears directly above Layer 1 and is picked; Characters says "Characters · Layer 2"; adding it
  is one undo step.
- Probes: `again`: add another right away (Layer 3), then delete it from its ⋯ menu; `undo-redo`: undo the add and
  check the layer goes and Layer 1 is picked again.
- Rated: yes, wants Shift+Cmd+N

### 16. Paint over the picture
- Does: picks the Brush, sets its Size and Opacity, and paints a few strokes on Layer 2.
- Expects: paint covers half cells and shows through each cell's character (Colors only); with Build up on, two strokes
  at 50% make it solid; the color adjustments tint the paint too.
- Probes: `out-of-order`: hide Layer 2 with its eye and try to paint ("Show the layer to draw on it"); `undo-redo`:
  undo one stroke, redo it, then paint and check redo is off; `speed`: draw fast scribbles with `qa.frames`.
- Rated: yes, wants B (the strokes themselves aren't rated), and ] or [ for the brush size

### 17. Type a caption over it
- Does: chooses Edit Mode, clicks where the caption goes, types a short caption, presses Escape.
- Expects: the letters land in her colors at the cursor; a run of typing is one undo step; Escape puts the cursor away
  so letters choose tools again.
- Probes: `extremes`: type a word in Japanese and an emoji; `interrupt`: halfway through typing, switch to PIXEL and
  back, then go on typing.
- Rated: yes, wants T

### 18. Fill an area with the Paint Bucket
- Does: picks the Paint Bucket, fills an area of Layer 2 in Fill's color mode, then switches Fill to Cells and fills
  again with Match and Set.
- Expects: the color fill stops at text and lines she's drawn (they're walls) and stays inside a selection; Cells fills
  whole cells that match the one she clicked (FG, BG and Char to start).
- Probes: `extremes`: Tolerance at 0 and at its most; `undo-redo`: undo the fill, redo it.
- Rated: yes, wants G

### 19. Fill with a gradient
- Does: in the Paint Bucket's Gradient choice, picks Linear and drags across an area, then Spherical, then holds Shift
  while dragging; then tries Cells with a gradient.
- Expects: Linear runs from her foreground where she pressed to her background where she let go; Spherical is a
  circle; Shift snaps the line to 45°; Cells builds it from █ ▓ ▒ ░ and a space; a gradient is one undo step; a drag
  with either color set to None fills nothing and says "A gradient needs both a foreground and a background color:
  neither can be None."
- Probes: `back-out`: start a gradient drag and press Escape before letting go; `out-of-order`: set the background to
  None and drag; `undo-redo`: undo the gradient and redo it.
- Rated: yes, wants G, then a key for the Gradient choice

### 20. Add a vector layer and draw a shape
- Does: presses + Vector layer, picks the Shape tool, drags an Ellipse with Shift held, then sets its Fill and its
  Stroke from the color box.
- Expects: "Vector 1" is added above the picked layer and picked, and the tabs become VECTOR and SAUCE; the shape is a
  circle, selected, converted with the picture (palette and dither reach it); a color picked with it selected goes to
  it as one undo step.
- Probes: `out-of-order`: with Vector 1 picked, look for ANSI to paint on (it isn't offered until a cells layer is
  picked) and record how she gets back; `again`: draw a second shape right away.
- Rated: yes, wants U

### 21. Give the shape a gradient
- Does: with the shape selected, opens the Fill side of the color box and picks Linear, then Radial; then uses the Node
  tool to drag the gradient's ends and add a stop on its line.
- Expects: the fill becomes a gradient from its color to the background color, across the shape's box; switching kind
  keeps the colors; the Node tool shows the gradient's handles; each change is one undo step.
- Probes: `undo-redo`: undo the stop, the drag and the gradient one at a time; `back-out`: open the color box and press
  Escape; `extremes`: drag a stop well off the line (it's removed, keeping at least two).
- Rated: yes, wants Alt+F, then a key for Linear (A for the Node tool)

### 22. Type into the vector layer: an art layer
- Does: picks Layer 2, types a short word, chooses Select, selects the word and presses Make art layer; then, on
  VECTOR, presses Edit art, types a letter more, and presses Done.
- Expects: the word moves into an art layer on the vector layer directly above Layer 2 (one is added if the layer
  above isn't a vector layer), the canvas looks the same and the view goes to VECTOR with it selected; Edit art goes to
  ANSI with "Editing art layer" and Done; the rest of the drawing shows dimmed; Done or Esc steps out
  ([Art layers](../../vector.md#art-layers)).
- Probes: `out-of-order`: press Make art layer with nothing drawn in the selection; `undo-redo`: undo inside the art
  layer back to where she stepped in, then step out and undo the Make art layer; `back-out`: press Escape with the Text
  cursor showing (the first Escape puts the cursor away).
- Rated: yes, wants M, then a key for Make art layer

### 23. Paint inside the art layer
- Does: steps into the art layer again (Edit art), paints a stroke with the Brush, fills an area with the Paint Bucket,
  drags a Linear gradient with the Bucket's Gradient choice, then presses Done.
- Expects: the usual ANSI tools draw into the art layer and only it
  ([Editing an art layer](../../vector.md#editing-an-art-layer)); drawing past its edge grows it; each edit is one undo
  step; the change shows on VECTOR once she's out, with the layer selected.
- Probes: `undo-redo`: undo the gradient, the fill and the stroke inside, and check undo stops where she stepped in;
  `out-of-order`: try to pick Base or change a setting in the left column while inside (they're off);
  `interrupt`: switch tabs while inside, which steps out, and check what she drew stayed.
- Rated: yes, wants B and G (the strokes themselves aren't rated), and Escape to step out

### 24. Give the vector layer its own dither
- Does: on CGA with the base's Dither at 0%, picks Vector 1, and in "Characters · Vector 1" sets Dither style to
  Ordered (Bayer) and Dither to 60%; then drags a shape a little.
- Expects: only the shapes take the pattern; the picture under them doesn't change; while she drags, the pattern
  outside what she drags holds still, and it settles over the layer when she lets go
  ([Layers](../../layers.md#the-edit-layer)); the change is an undo step on Vector 1.
- Probes: `undo-redo`: undo the Dither change and check the shapes go back to the base's; `interrupt`: pick Base and
  back, and check Vector 1 kept its own Dither.
- Rated: yes, wants Tab to Dither then the arrows

**Free time:** she'd drag Layer 2 above Vector 1 in LAYERS, rename a layer to a long name with emoji, duplicate the
vector layer, drop `rose-mark.svg` on the drawing and choose Add to this drawing, and hide each layer to see what it
held.

## Merging and baking

### 25. Merge my two paint layers
- Does: picks Layer 2, which sits directly above Layer 1, and presses Merge down (top toolbar), into Layer 1.
- Expects: no question: its cells and paint are written onto the layer under it, it leaves the stack, and nothing on
  the canvas changes; one undo brings it back, picked; redo merges it again.
- Probes: `undo-redo`: undo, redo, undo again, then paint and check redo is off; `out-of-order`: hide the layer under it
  and press Merge down ("Show the layer to merge it").
- Rated: yes, wants Cmd+E

### 26. Merge my paint into the picture, crisp
- Does: picks Layer 1, which sits directly on the base (anything between them she moves up first, with ⋯ and Move up
  or a drag in LAYERS), presses Merge down, and chooses Keep crisp cells.
- Expects: the question "Choose how to merge … into Base" with Keep crisp cells and Blend into source image; Keep crisp
  cells makes her paint and cells base pixels exactly as they show, typed cells pinned; nothing on the canvas changes;
  undo and redo work.
- Probes: `back-out`: press Escape at the question and check nothing merged; `undo-redo`: undo, redo, undo.
- Rated: yes, wants Cmd+E, then Enter on Keep crisp cells

### 27. Merge my paint into the image itself
- Does: picks Base, presses + Layer (it lands directly on the base), paints a few strokes and types a word on it,
  presses Merge down and chooses Blend into source image; then moves Edges and Sharpen.
- Expects: her paint becomes part of the picture (Into the image), so Edges outlines it and the sliders keep changing
  it; letters merge exactly; undo brings back the layer and the picture.
- Probes: `undo-redo`: undo the slider moves and then the merge, one step at a time, and redo them; `again`: merge a
  second time into the already blended picture.
- Rated: yes, wants Cmd+E, then the arrows to the second choice

### 28. Press the shapes into the picture
- Does: picks Vector 1, moves it directly onto the base if it isn't (⋯, Move down), and presses Merge down on VECTOR.
  Then, in "Characters · Vector 1", sets Dither style and Dither back to the base's, and presses Merge down again.
- Expects: the first press is refused, since step 24 gave Vector 1 a Dither of its own: a message says "Vector 1 has
  its own character settings, so its shapes can't be pressed into the layer under it", and nothing changes. With its
  settings the base's again, the second press presses its shapes into the base's pixels, where they stop being shapes
  (its art layer's characters pinned); nothing on the canvas changes, and one undo brings them back as shapes.
- Probes: `out-of-order`: try it with the vector layer hidden; `undo-redo`: undo and redo the press.
- Rated: yes, wants Cmd+E

### 29. Bake it
- Does: with the shapes pressed in the last step (or no vector layer directly on the base: a hidden one with shapes
  there refuses Bake, and one with settings of its own stays shapes), on CGA with a few sliders moved, presses Bake (the
  flame) and chooses Keep full color; undoes; bakes again choosing Snap to CGA colors; then turns Dither on and bakes
  once more.
- Expects: nothing on the canvas changes; the sliders go back to neutral; the palette stays; with Dither on it bakes
  exactly, without asking; undo brings the original image and the sliders back
  ([Baking](../../layers.md#baking)).
- Probes: `undo-redo`: bake, undo, redo, and compare the canvas each time; `again`: bake twice in a row.
- Rated: yes, wants a key for Bake

**Free time:** she'd look for a Merge visible (all layers into one) as Photoshop has, try Flatten to see how it differs
from Bake, merge with a selection, and check the merges are off with Animate on and more than one frame.

## Getting it out

### 30. Export a PNG to post
- Does: presses Export .png (in the left column, or on SAUCE), keeps Smooth when it asks about smooth text, and saves;
  then turns the status bar's Smooth off and exports again.
- Expects: a PNG of the art as it shows, same palette, dithering and layers
  ([Characters](../../characters.md#saving-utf8ans-and-ans)); with Smooth text off, no question, and a smaller file.
- Probes: `out-of-order`: look on every tab and in the Actions menu of a narrow window; `free`: try the browser's own
  right-click on the canvas.
- Rated: yes, wants a key for Export PNG

### 31. Export an .ans for the terminal
- Does: presses Export .ans, keeps the offered name, and saves; then checks it in the headless terminal against the
  screen (the README's Files).
- Expects: the dialog offers "photo-" with the date and time; any character CP437 lacks is listed with what it becomes
  and how many cells use it; the download saves within the `file` budget; the terminal shows every cell as the screen
  does, with hidden layers left out.
- Probes: `again`: export twice in a row and check the two names differ; `back-out`: change the name, press Escape,
  reopen and check the offered name; `extremes`: name the file with emoji and slashes.
- Rated: yes, wants a key for Export .ans

### 32. Save the project and reopen it
- Does: presses Cmd+S, saves; starts a New project; opens the saved .phosphor with Choose a file.
- Expects: everything comes back: the picture and its sliders, the palette and Dither, each layer with its name, its
  eye, its paint and its own character settings, the vector layer's shapes with their gradients, the art layer, the
  SAUCE fields; the font doesn't (it's this browser's, not the project's).
- Probes: `interrupt`: reload before reopening and check the start screen offers her work under "Pick up where you left
  off"; `undo-redo`: after reopening, press Cmd+Z (nothing to undo: opening isn't an edit).
- Rated: yes, wants Cmd+S, then Enter

**Free time:** she'd export .utf8ans and compare it with the .ans in the terminal, export with a layer hidden, open the
.ans back in Phosphor and compare it with her screen, and save under a name she typed and check the next save starts
from it.

## Bigger: 200 columns

### 33. Make it 200 columns wide
- Does: opens her photo fresh, sets Dimensions to 200 columns with Lock aspect ratio on.
- Expects: nothing drawn yet, so the picture is converted again at the new size and the rows follow its shape; the
  change lands within the `setting` budget.
- Probes: `extremes`: try 0, then 301, then 99999 columns and check where it stops (300 at most); `undo-redo`: undo the
  size change.
- Rated: yes, wants Tab to Dimensions (typing the number is content)

### 34. Tune it at the bigger size
- Does: at 200 columns, moves Brightness, Dither and Pattern light, switches Choose characters to By shape, and paints
  a stroke on Layer 1.
- Expects: each change lands within the `setting` budget; strokes draw without long frames; with a stroke drawn, a
  later size change grows or trims the canvas on the right and bottom instead of rescaling, and the lock goes off.
- Probes: `speed`: drag Brightness for two seconds with `qa.frames`; `interrupt`: change a size with paint on Layer 1
  and check the paint stays where it was.
- Rated: yes, wants Tab to Brightness then the arrows

**Free time:** she'd take `qa.memory`, try `tall.png` at 80 columns and scroll to its bottom, bake at 200 columns and
grow the grid afterwards to see what the working-size copy does, and export the bigger .ans and check it in the
terminal.

## Known

