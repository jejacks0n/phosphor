# Maya: turns her photos into ANSI art

## Who

Maya is a photographer and illustrator who found Phosphor through a friend's ANSI portrait. She knows what ANSI art
looks like and has seen the old BBS screens, but she has never drawn a cell by hand. She thinks in pictures: levels,
contrast, grain, dithering. She knows Photoshop well, so she reaches for its keys and its words (layers, merge down,
flatten, bake) and expects them to mean what they mean there.

## Why they're here

She wants a photo of hers to come out as ANSI art that looks good on its own: the right style and palette, the right
characters, smooth gradients instead of bands, then a few layers of paint, type and fills over it. Done is a PNG to
post, an .ans that opens the same in a terminal, and a .pho file she can reopen next week and keep tuning.

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
- LAYERS: its header (the count, Add layer, Add vector layer), picking, the eye, Merge down, Bake ([Layers](../../layers.md)).
- The Brush, Edit Mode, the Paint Bucket and the Gradient beside it ([Layers](../../layers.md#other-tools)).
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
- Exports: a .pho of a few hundred KB, an .ans under 100 KB.

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
- Does: on the start screen, chooses `photo.jpg` with Choose a file (or drops it on the box that says "Drop an image, .pho, or ANSI file here").
- Expects: it opens on ANSI as character art, 80 columns wide with its rows from the photo's shape, the photo filling
  the grid edge to edge (no dark strip of characters along the bottom line); LAYERS shows
  only Base, picked; the Characters section is titled "Characters · Base", with Picture · Base and Image filters
  under it; the address shows the ANSI tab.
  Opening takes under the `file` budget.
- Probes: `free`: drop the file on the box instead of using the button; `again`: nudge Brightness to 101%, press New
  project and open the same `photo.jpg` a second time, checking New project asks about unsaved changes only if there
  are any, that the start screen and the photo both show Brightness at 100%, and that the start screen's Characters
  section is "Characters · Base", with no Layer 1 named;
  `extremes`: open `tall.png` and `rgba.png` and look at where the transparency and the long edge land.
- Rated: yes, wants Cmd+O

### 2. Check the picture itself is what she's tuning
- Does: looks at LAYERS and the side panel before changing anything, since she wants to change how the picture
  converts.
- Expects: Base is picked (a new drawing picks it), Characters says "Characters · Base", and the Picture · Base and
  Image filters sections show (they're hidden while another layer is picked); the tabs are PIXEL, ANSI and SAUCE.
- Probes: `out-of-order`: press Add layer, change Choose characters on the new Layer 1 and see that the picture
  doesn't change (it's Layer 1's paint setting), then look for what told her so, and undo the add; `back-out`: pick
  Base again after the add, then undo it; `interrupt`: switch to PIXEL and back and check Base is still picked;
  `extremes`: on a blank canvas, check there's no Picture · Base (no picture for Smoothing to scale), then move a
  slider, Bake, and check there's still none, and no Image filters; then paint on Layer 1 and Blend into source image:
  Image filters show, Picture · Base doesn't; then add a photo as a layer and merge it down onto the base: Picture ·
  Base shows, and Smoothing changes the photo.
- Rated: yes, wants Alt+] and Alt+[ (Option on a Mac) to step through the layers, as in Photoshop

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
  Color count) and Custom color list, where she tabs to the swatches and arrows through them, and drags one onto another. Then, on CGA, opens
  the Manage link beside Color palette, searches for a palette, presses Use this palette on it and on another, and Put back.
- Expects: each one recolors the picture to its colors; Limited count shows a Color count slider; Custom color list
  the color layer's Palettes page shows This drawing as swatches to edit, one Tab stop where the arrow keys pick the next swatch (and Home and End
  the first and last), a swatch dragged shows a dashed outline where it will land and lands there picked, and Escape in the hex field puts back the color in use; Dither style and Dither appear in the
  Characters section once there's a palette. On the Palettes page the search narrows the
  list as she types; Use this palette recolors the picture behind it to that palette, its button says In use and the layer stays;
  Put back returns her to CGA and its line goes away.
- Probes: `extremes`: set Color count to its least and its most; `undo-redo`: undo back to Full color and check the
  Dither controls go away again; `again`: pick CGA twice in a row; `out-of-order`: on the Palettes page, press
  the search button with nothing typed under "Not here? Search Lospec.", and check it says to type a palette's name or
  id and asks nothing of lospec.com (a palette by name needs lospec.com, which a run doesn't reach).
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
  JetBrains Mono and back to IBM VGA.
- Expects: edges inside cells come out as quadrants, `▐ ▌` and rising blocks; changing the font changes how the cells
  look, not which characters they hold ("The characters are measured in IBM VGA").
- Probes: `speed`: drag Pattern light back and forth for two seconds with `qa.frames` and check frames stay in the
  `frame` budget; `interrupt`: switch to PIXEL while it's redrawing and come back; `out-of-order`: with Base picked,
  stroke Blur (R) over an edge in the ANSI view, then switch Choose characters to Best match and back, and check the
  blurred cells get Best match's characters and then By shape's again, not the ones they had when she blurred; the same
  with the Brush (Colors only) over a flat part, whose cells are matched to the paint, never left as a ▄; `scope`:
  with Base selected, drop a second picture on the drawing, choose Add to this drawing, and switch its new layer to By
  shape: its edges get `▐ ▌` and rising blocks as the base's do, not half blocks alone.
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
- Probes: `out-of-order`: press Add layer and look for Blur (it's hidden while another layer is picked), then undo
  the add; `undo-redo`:
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

**Free time:** she'd try Limited count with 4 colors and each dither, paint a stroke on a layer she adds to see paint isn't
dithered, and compare the dither at 80 and at 200 columns.

## Layers to draw on

### 15. Add a layer to paint on
- Does: with Base picked, presses Add layer twice.
- Expects: "Layer 1" appears directly above Base and is picked, then "Layer 2" directly above Layer 1, picked;
  Characters says "Characters · Layer 2"; each add is one undo step.
- Probes: `again`: add another right away (Layer 3), then delete it from its ⋯ menu; `undo-redo`: undo the last add and
  check the layer goes and Layer 1 is picked again.
- Rated: yes, wants Shift+Cmd+N (Photoshop's, which the browser keeps); Shift+Alt+N (Shift+Option+N) is Phosphor's

### 16. Paint over the picture
- Does: picks the Brush, sets its Size (] grows it, [ shrinks it) and Opacity (a digit: 5 is 50%, 4 then 5 quickly is
  45%), and paints a few strokes on Layer 2.
- Expects: paint covers half cells and shows through each cell's character (Colors only); with Choose characters on
  Random, as the base's is, a cell that shows none (one flat color) takes it in Random's characters (solid where the
  paint covers it whole), never a row of `▄`, and on Best match or By shape it's matched to the paint (on Best match a flat stroke shows as its nearest palette color, solid, not a shade); with Build up on, two strokes at 50% make it 75%, as two layers at 50% do;
  the color adjustments tint the paint too. A stroke painted in the PIXEL view comes out the same in ANSI; in Color ASCII the strokes become
  ASCII characters, never `▄`, and their ANSI characters show again back in ANSI. Half-block draws `▄`.
- Probes: `interrupt`: switch to PIXEL, paint a stroke on a flat part, and back in ANSI check it shows the characters an
  ANSI stroke there does, then set Art style to Color ASCII and back (no stripes, then the same characters again); `scope`: with the
  base on Best match, set Layer 2's Choose characters to Random, roll its seed, and paint over a flat part: every cell
  the stroke reaches gets Random's characters, never a row of `▄`, and they change with each roll; then, Layer 2 back on Best match, add a vector layer with its own By shape and drag it between the base and Layer 2: the strokes look as they did; `out-of-order`: hide Layer 2 with its eye and try to paint ("Make the layer visible to draw on it"); `undo-redo`:
  undo one stroke, redo it, then paint and check redo is off; `again`: in PIXEL, pick the Eraser, set it to Soft and
  rub a stroke's end at a low Flow (its outline is a circle, the paint fades a little with each pass and a few passes
  clear it), then set it back to Hard (a square, cleared at once), and move the pointer off the canvas's edge with each
  (the outline follows it), then try Soft in ANSI (the same circle and Flow, Size in px, and it fades the paint but
  leaves her caption's letters); `speed`: draw fast scribbles with `qa.frames`;
  `extremes`: with a Color list and Saturation at 0, paint on Layer 2 with a swatch that isn't gray and check the Pixel
  view shows the stroke in the swatch's color, as the ANSI view does.
- Rated: yes, wants B (the strokes themselves aren't rated), and ] or [ for the brush size

### 17. Type a caption over it
- Does: chooses Edit Mode, clicks where the caption goes, types a short caption, presses Escape.
- Expects: the click places the cursor without moving the view; the letters land in her colors at the cursor; a run
  of typing is one undo step; Escape puts the cursor away so letters choose tools again.
- Probes: `extremes`: type a word in Japanese and an emoji; `interrupt`: halfway through typing, switch to PIXEL and
  back, then go on typing.
- Rated: yes, wants T

### 18. Fill an area with the Paint Bucket
- Does: picks the Paint Bucket, fills an area of Layer 2 in Fill's color mode, then switches Fill to Cells and fills
  again with Match and Set.
- Expects: the color fill stops at text and lines she's drawn (they're walls) and stays inside a selection; Cells fills
  whole cells that match the one she clicked (FG, BG and Char to start).
- Probes: `extremes`: Tolerance at 0 and at its most; `undo-redo`: undo the fill, redo it; `scope`: with the Brush,
  paint a closed outline on Layer 2 over the photo, turn the Paint Bucket's All layers off and click inside it (the
  fill floods the inside of the outline and stops at it, whatever the photo looks like under it; on, it follows the
  photo's colors), then with it still off drag a Gradient inside the outline (the same area).
- Rated: yes, wants G

### 19. Fill with a gradient
- Does: opens the Paint Bucket's button (its corner, or a long press) and picks the Gradient, picks Linear and drags across an area, then Spherical (Shift+G again), then holds Shift
  while dragging; then tries Cells with a gradient.
- Expects: Linear runs from her foreground where she pressed to her background where she let go; Spherical is a
  circle; Shift snaps the line to 45°; Cells builds it from █ ▓ ▒ ░ and a space; a gradient is one undo step; a drag
  with either color set to None fills nothing and says "A gradient requires both a foreground and a background color. Neither color can be None.";
  Escape before letting go takes the line away, and the release fills nothing.
- Probes: `back-out`: start a gradient drag and press Escape before letting go; `out-of-order`: set the background to
  None and drag; `undo-redo`: undo the gradient and redo it.
- Rated: yes, wants Shift+G, then Shift+G again for Spherical

### 20. Dodge, burn and blur the paint
- Does: opens the Paint Bucket's neighbor, the Retouch button (its corner, or a long press), picks Dodge and strokes
  over a dark part of her paint, then Burn over a light part, switches the Range to Shadows and to Highlights, then
  Blur along an edge; then the same on the ANSI view, over the caption she typed.
- Expects: Dodge lightens and Burn darkens her paint, most in the Range picked (Midtones leaves black and white alone);
  Blur softens an edge, fading it into the clear beside it in the paint's own color, never the picture's under it;
  going over a spot again in one stroke adds nothing, a second stroke goes further; on the ANSI view the caption's
  letters stay under all three: Dodge and Burn lighten or darken their colors, and Blur evens them with the letters
  beside them and spreads them as a soft glow into the clear around the caption; each stroke is one undo step; a
  palette shows the result in its own colors; a blurred edge on a layer above white paint on the layer under it looks
  as light on the ANSI view as on the PIXEL view (in Color ASCII too, By shape or by intensity).
- Probes: `out-of-order`: stroke all three over a part of the layer with nothing on it (nothing changes, the picture
  under it included), hide the layer with its eye and stroke ("Make the layer visible to draw on it"), all three over
  the caption in the PIXEL view too (the same as on the ANSI view), Dodge with Size at 1 on the ANSI view (one half of a
  cell lightens, the other stays, as the Brush paints), and with Base picked type a letter and Dodge over it in the PIXEL
  view (the letter stays, its colors lighten), and in Color ASCII type a few spaces into the caption and brush white
  over them (the paint shows as characters there, as over empty cells; the letters beside them are tinted and stay);
  `undo-redo`: undo a stroke, redo it, and undo a Blur
  over the caption (its colors and the glow go back); `extremes`: Strength at 1% and at 100%.
- Rated: yes, wants O, Shift+O and R

### 21. Add a vector layer and draw a shape
- Does: presses Add vector layer, picks the Shape tool, drags an Ellipse with Shift held, then sets its Fill and its
  Stroke from the color box.
- Expects: "Vector 1" is added above the picked layer and picked, and the tabs become VECTOR and SAUCE; the shape is a
  circle, selected, converted with the picture (palette and dither reach it); a color picked with it selected goes to
  it as one undo step.
- Probes: `out-of-order`: with Vector 1 picked, look for ANSI to paint on (it isn't offered until a cells layer is
  picked) and record how she gets back; `again`: draw a second shape right away; `out-of-order`: still on the Shape tool,
  drag a corner handle of the new shape's box (it scales) and the knob above it (it turns), then drag inside the box
  (a new shape is drawn there, the first one stays put).
- Rated: yes, wants U

### 22. Give the shape a gradient
- Does: with the shape selected, opens the Fill side of the color box and picks Linear, then Radial; then uses the Node
  tool to drag the gradient's ends and add a stop on its line.
- Expects: the fill becomes a gradient from its color to the background color, across the shape's box; switching kind
  keeps the colors; its line, ends and stops show at once, still on the Shape tool, and its ends and stops drag there
  (a drag off them draws a new shape); the Node tool shows the gradient's handles; each change is one undo step.
- Probes: `undo-redo`: undo the stop, the drag and the gradient one at a time; `back-out`: open the color box and press
  Escape; `extremes`: drag a stop well off the line (it's removed, keeping at least two).
- Rated: yes, wants Alt+F, then a key for Linear (A for the Node tool)

### 23. Type into the vector layer: an art layer
- Does: picks Layer 2, types a short word, chooses Select, selects the word and presses Make art layer; then, on
  VECTOR, presses Edit art, types a letter more, and presses Done.
- Expects: the word moves into an art layer on the vector layer directly above Layer 2 (one is added if the layer
  above isn't a vector layer), the canvas looks the same and the view goes to VECTOR with it selected; Edit art goes to
  ANSI with "Editing art layer" and Done; the rest of the drawing shows dimmed; Done or Esc steps out
  ([Art layers](../../vector.md#art-layers)).
- Probes: `out-of-order`: press Make art layer with nothing drawn in the selection; `undo-redo`: undo inside the art
  layer back to where she stepped in, then step out and undo the Make art layer; `back-out`: press Escape with the Text
  cursor showing (the first Escape puts the cursor away).
- Rated: yes, wants M, then Cmd+K, `art layer` and Enter

### 24. Paint inside the art layer
- Does: steps into the art layer again (Edit art), paints a stroke with the Brush, fills an area with the Paint Bucket,
  drags a Linear gradient with the Gradient, then presses Done.
- Expects: the usual ANSI tools draw into the art layer and only it
  ([Editing an art layer](../../vector.md#editing-an-art-layer)); drawing past its edge grows it; a fill or gradient
  started on the layer's own paint stays in that paint at any Tolerance, with nothing selected; each edit is one undo
  step; the change shows on VECTOR once she's out, with the layer selected.
- Probes: `undo-redo`: undo the gradient, the fill and the stroke inside, and check undo stops where she stepped in;
  `out-of-order`: try to pick Base or change a setting in the left column while inside (they're off);
  `interrupt`: switch tabs while inside, which steps out, and check what she drew stayed.
- Rated: yes, wants B and G (the strokes themselves aren't rated), and Escape to step out

### 25. Give the vector layer its own dither
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
held (the shapes over a hidden layer keep their characters, but for a soft edge over what it hid).

## Merging and baking

### 26. Merge my two paint layers
- Does: picks Layer 2, which sits directly above Layer 1, and presses Merge down (top toolbar), into Layer 1. Then,
  with Layer 1 picked, strokes Blur along the edge of the paint that came down.
- Expects: no question: its cells and paint are written onto the layer under it, it leaves the stack, and nothing on
  the canvas changes, but a soft edge's cells, which stay paint, can come out a character or a color step different;
  one undo brings it back, picked; redo merges it again. The paint stays paint, so Blur fades its
  edge into the clear beside it, as on any paint.
- Probes: `undo-redo`: undo, redo, undo again, then paint and check redo is off; `out-of-order`: hide the layer under it
  and press Merge down ("Make the layer visible to merge it"); `again`: with Choose characters on By shape (Color
  ASCII too), add a vector layer over Layer 1, draw a shape with a gradient fill, Merge down, and Blur across it: it
  came down as paint, so it blurs and fades all over, its edge too (the cells written there as characters turn back
  into paint under the stroke); then paint along
  its edge with the Brush in Color ASCII: the paint shows as ASCII characters, never as half-blocks; then, on a layer
  above, brush white with Colors only over blank cells and Merge down: nothing changes, and no ▄ appears; `scope`:
  with a shape over paint on Layer 1 and a white stroke on a layer above crossing its edge, Merge down the shape
  into Layer 1: nothing on the canvas changes, the stroke above included, and the PIXEL view shows the shape's edge
  as before (no dark line where its cells were written as characters), with the Overlay at 100% too; then hide the
  base: no gray border of the picture's colors stays round the shape (and merged with the base hidden, no black one
  once it shows again).
  `again`: on a detailed photo with By shape, draw a soft-edged shape on a vector layer over Layer 1 and Merge down:
  nothing changes but a character or a color step along the soft edge, and Blur across the edge afterward fades all of it (nothing was written as characters).
  `scope`: in Color ASCII, brush white over a shape and again on a layer above it, then go to the PIXEL view with
  the Overlay at 100%: each stroke blends with what's under it, as with the Overlay at 0%; a typed letter still shows
  as its cell.
- Rated: yes, wants Cmd+E

### 27. Merge my paint into the picture, crisp
- Does: picks Layer 1, which sits directly on the base (anything between them she moves up first, with ⋯ and Move up
  or a drag in LAYERS), presses Merge down, and chooses Keep crisp cells.
- Expects: the question "Choose how to merge … into Base" with Keep crisp cells and Blend into source image; Keep crisp
  cells makes her paint and cells base pixels exactly as they show, typed cells pinned; nothing on the canvas changes,
  soft Brush and Blur strokes on a palette and the cells of a vector layer above included, and text typed with BG None
  over the photo with VGA on and Midtones at 2 (each letter's background stays the color it was); undo and redo work.
- Probes: `back-out`: press Escape at the question and check nothing merged; `undo-redo`: undo, redo, undo; `again`: in
  Color ASCII, type dark text over white paint on Layer 1 (its cells take the paint's color as their background), Blur
  across it, then Keep crisp cells: the text keeps its light background on the base, as it showed.
- Rated: yes, wants Cmd+E, then Enter on Keep crisp cells

### 28. Merge my paint into the image itself
- Does: picks Base, presses Add layer (it lands directly on the base), paints a few strokes and types a word on it,
  presses Merge down and chooses Blend into source image; then moves Edges and Sharpen.
- Expects: her paint becomes part of the picture (Into the image), so Edges outlines it and the sliders keep changing
  it (the Image filters section stays, with Base picked, as it does after Bake); her word stays pinned on the base,
  every letter still a letter, and Blur on Base recolors it; a Write block glyphs ellipse she draws first goes into the
  picture and comes back as the base's characters (the question said some can change, under "You give up:"), its
  solid blocks too, so Blur softens the whole ellipse; undo
  brings back the layer, its letters and the picture as they were.
- Probes: `undo-redo`: undo the slider moves and then the merge, one step at a time, and redo them; `again`: merge a
  second time into the already blended picture, then a third from a layer given its own Characters (Blend into source
  image lists her layer's custom characters under "You give up:", and choosing it still merges); `scope`: in Color ASCII, with a Colors only stroke and dark text typed
  over white paint on the layer, Blend into source image: the stroke goes into the picture with no new backgrounds
  anywhere, and the text goes in with its light background and comes back as ink on black; `extremes`: in Color ASCII with
  By shape, draws thin strokes on a vector layer over Layer 1, merges it down, then Blends Layer 1 into the base: the
  strokes keep their characters but for a look-alike here and there (Q for $, L for f), none turned to blocky $ q p.
- Rated: yes, wants Cmd+E, then the arrows to the second choice

### 29. Press the shapes into the picture
- Does: picks Vector 1, moves it directly onto the base if it isn't (⋯, Move down), and presses Merge down on VECTOR,
  choosing Keep crisp cells, then undoes it. Then, in "Characters · Vector 1", sets Dither style and Dither back to the
  base's, and presses Merge down again.
- Expects: step 25 gave Vector 1 a Dither of its own, and the first press still asks how: Keep crisp cells merges it
  in one step, its cells showing as they did but along the shapes' soft edges, and Blend into source image's choice lists "Vector 1's custom
  characters: its paint is redrawn in Base's." under "You give up:". With a shape selected on VECTOR, the press says
  to deselect it and nothing changes. With its settings the base's again, the second press asks how, as Layer 1's
  merge into the base does; she chooses Keep crisp
  cells, which presses its shapes into the base's pixels, where they stop being shapes (its art layer's characters
  pinned); nothing on the canvas changes, and one undo brings them back as shapes.
- Probes: `out-of-order`: try it with the vector layer hidden; `undo-redo`: undo and redo the press; `again`: undo,
  press Merge down and choose Blend into source image: the shapes go into the picture (the canvas shows as it did, the
  layer leaves the stack), Edges and Blur now reach them, and one undo brings them back as shapes; `scope`: before
  pressing, add a second vector layer over Vector 1, pick it and draw a shape (it's on the layer picked, not Vector 1),
  then Merge down: the shape moves to Vector 1, still a shape she can edit, over Vector 1's own, the second layer goes,
  and nothing on the canvas changes. With shapes overlapping on both vector layers, a click selects the one that shows
  on top and LAYERS picks its layer; Forward and Back change what she sees in one press.
- Rated: yes, wants Cmd+E

### 30. Bake it
- Does: with the shapes pressed in the last step (or no vector layer directly on the base: a hidden one with shapes
  there refuses Bake, and one with settings of its own stays shapes), on CGA with a few sliders moved, presses Bake (the
  flame) and chooses Keep full color; undoes; bakes again choosing Snap to CGA colors; then turns Dither on and bakes
  once more.
- Expects: nothing on the canvas changes; the sliders go back to neutral; the palette stays; with Dither on it bakes
  exactly, without asking; undo brings the original image and the sliders back
  ([Baking](../../layers.md#baking)).
- Probes: `undo-redo`: bake, undo, redo, and compare the canvas each time; `again`: bake twice in a row.
- Rated: yes, wants Cmd+K, then `bake` and Enter

**Free time:** she'd look for a Merge visible (all layers into one) as Photoshop has, try Flatten to see how it differs
from Bake, merge with a selection, and check the merges are off with Animate on and more than one frame.

## How my layers blend

She's learned the rules the layers follow and checks them when something looks off, since a wrong one costs her an
afternoon. Each step she does twice: in ANSI, and in Color ASCII with Choose characters on By shape over her photo. The
engineering rules behind these steps are docs/model.md (R1–R8); a finding here names the step and the view.

### 31. Paint blends the same on any layer
- Does: on Layer 1 paints a white patch; on Layer 2, above it, a soft red stroke (Opacity 40 with 4, Hardness low
  with Shift+[) across the patch's edge; then the same stroke on Layer 1 beside it. Drags Layer 2 below Layer 1 in
  LAYERS, then back.
- Expects: the stroke on Layer 2 looks like the one on Layer 1, the same characters and colors over the white and over
  the photo, in the ANSI and PIXEL views alike, over the white's soft edge and over white at Opacity 50 too (the photo
  shows through as much); in Color ASCII, soft paint over white comes out near-white, never a darker character; a
  layer dragged below another with nothing between them looks as it did.
- Probes: `scope`: the Overlay at 100% and at 0% show the same strokes; `again`: by intensity instead of By shape.
- Rated: no (drawing)

### 32. Merging changes nothing, and merged paint stays paint
- Does: merges Layer 2 down into Layer 1; then draws a soft-edged shape on a vector layer over Layer 1 (a gradient
  fill too) and merges it down; then, with a white stroke on a layer above crossing the shape's edge, merges the
  shape's layer down under it.
- Expects: each merge leaves the canvas as it was, the ANSI and PIXEL views alike and the stroke above included; the
  merged shape and paint are paint afterward (Blur fades them, the Eraser erases them, the Paint Bucket flows across
  them); nothing along the shape's edge is written as characters, or only a cell or two in ANSI, and those still
  look as they did.
- Probes: `undo-redo`: each merge; `again`: with the vector layer given its own character set first, so the merge has
  to write cells along the edge: the canvas still doesn't change, and Blur across the edge afterward fades those cells
  like the paint beside them.
- Rated: yes, wants Cmd+E

### 33. My letters stay letters
- Does: types a caption on Layer 1, then Blur, Dodge and Burn across it and across the merged shape's edge; then
  brushes with Colors only across both.
- Expects: the letters keep their characters under all three (their colors change; Blur spreads a glow into the clear
  around them); the merged edge fades and paints like paint; Colors only tints a letter and keeps it, and turns a cell
  the merge wrote into plain paint (a ▄ in ANSI, her ASCII characters in Color ASCII).
- Probes: `undo-redo`: a stroke of each; `extremes`: Strength at 100% ten times over the caption (the letters are still
  there).
- Rated: yes, wants R, O and Shift+O

### 34. Paint over letters and spaces
- Does: brushes a stroke across the caption and across a run of typed spaces beside it, with Colors only.
- Expects: in ANSI the letters are tinted and the spaces become ▄ of the paint; in Color ASCII the letters are tinted
  and the paint shows over the spaces as her ASCII characters, never hidden.
- Probes: `again`: over an opened .ans file's spaces (Draw on top) in Color ASCII; `scope`: with a flat-filled shape
  on a vector layer between the picture and her layer, one Colors only stroke from the picture across the shape (the
  same characters of her layer's on both, no ▄ over the shape), and while she drags a new shape across most of the
  canvas on a vector layer above Layer 1, Layer 1's strokes stay.
- Rated: no (drawing)

### 35. Color ASCII keeps my backgrounds
- Does: in Color ASCII, types dark text over white paint on Layer 1 (its cells take the paint's color as their
  background), Blur across it, and merges Layer 1 onto the base with Keep crisp cells; undoes; then on a fresh layer
  paints a Colors only stroke, types over the paint again, and merges with Blend into source image; then, with Base
  picked, Set FG on a few cells.
- Expects: the text keeps its light background after Keep crisp cells, and after Blend into source image too (it stays
  pinned as it showed); no cell anywhere gets a background it didn't show; the Colors only stroke goes into the picture as paint; Set FG on the base writes ink on black.
- Probes: `undo-redo`: each merge; `again`: the same in ANSI (backgrounds are ANSI's as ever).
- Rated: yes, wants Cmd+E

### 36. The PIXEL view tells the truth
- Does: after each of the steps above, compares the PIXEL view with the Overlay at 100%, 50% and 0% against the ANSI
  view.
- Expects: paint in the PIXEL view is the paint itself, blended with what's under it, never ASCII characters drawn
  over it (but see the Base's characters below); a typed letter shows in the Overlay; a merged shape's edge has no holes, dark lines or half-blocks that
  the ANSI view doesn't have; a character on the Base (typed there, or left by Keep crisp cells) shows as it looks at
  that scale with the Overlay at 0% too, a `█` solid and never a stripe of its background over its foreground. The one
  exception: paint over an open character on the Base shows as the cell the ANSI view makes of it, never as stripes:
  in an ASCII style, over a space or a character in its own background color; in ANSI, over such a character under a
  layer with characters of its own.
- Probes: `scope`: a stroke in the PIXEL view over a merged edge and over the caption, then the same stroke in
  ANSI (the same result).
- Rated: no (looking)

**Free time:** she'd try all of it in Monochrome ASCII, move a layer with a merged shape above a layer of paint and
back, hide the base under it all, and export the .ans after each merge to see it opens the same.

## Getting it out

### 37. Export a PNG to post
- Does: presses Export, picks PNG, keeps **Hard-edged** under Text rendering, and saves; then exports again with
  **Smooth** picked, and once more with the status bar's Smooth turned off.
- Expects: a PNG of the art as it shows, same palette, dithering and layers
  ([Characters](../../characters.md#exporting-png)); Text rendering there each time with Hard-edged picked first,
  whatever the status bar's Smooth is, and the Smooth file the bigger one.
- Probes: `out-of-order`: look on every tab and in the Actions menu of a narrow window; `free`: try the browser's own
  right-click on the canvas.
- Rated: yes, wants Cmd+K, then `exp png` and Enter

### 38. Export an .ans for the terminal
- Does: presses Export .ans, keeps the offered name, and saves; then checks it in the headless terminal against the
  screen (the README's Files).
- Expects: the dialog offers "photo-" with the date and time; any character CP437 lacks is listed with what it becomes
  and how many cells use it; the download saves within the `file` budget; the terminal shows every cell as the screen
  does, with hidden layers left out.
- Probes: `again`: export twice in a row and check the two names differ; `back-out`: change the name, press Escape,
  reopen and check the offered name; `extremes`: name the file with emoji and slashes; `scope`: set Art style to
  Monochrome ASCII and press Export: ASCII (.txt) is picked first, and the file is the characters alone, a line per row,
  with no color codes ([Saving .txt](../../characters.md#saving-txt)); pick ANS there and it says ASCII holds all of
  the drawing; back in ANSI, Export opens on ANS, and ASCII says the colors aren't kept.
- Rated: yes, wants Cmd+K, then `exp ans` and Enter

### 39. Save the project and reopen it
- Does: presses Cmd+S, saves; starts a New project; opens the saved .pho with Choose a file.
- Expects: everything comes back: the picture and its sliders, the palette and Dither, each layer with its name, its
  eye, its paint and its own character settings, the vector layer's shapes with their gradients, the art layer, the
  SAUCE fields, Font name and Letter spacing among them; the display font doesn't (it's this browser's, not the
  project's: SAUCE's Font name only tells other viewers).
- Probes: `interrupt`: reload before reopening and check the start screen offers her work under "Pick up where you left
  off"; `undo-redo`: after reopening, press Cmd+Z (nothing to undo: opening isn't an edit).
- Rated: yes, wants Cmd+S, then Enter

**Free time:** she'd copy a selection of the caption, press Cmd+K and run New from clipboard (it asks about her unsaved
work first; the new drawing is the selection's size, with it on Layer 1), then do the same with text copied from another
app. She'd also export .utf8ans and compare it with the .ans in the terminal, export with a layer hidden, open the
.ans back in Phosphor and compare it with her screen, and save under a name she typed and check the next save starts
from it.

## Bigger: 200 columns

### 40. Make it 200 columns wide
- Does: opens her photo fresh, sets Dimensions to 200 columns with Lock aspect ratio on.
- Expects: nothing drawn yet, so the picture is converted again at the new size and the rows follow its shape; the
  change lands within the `setting` budget.
- Probes: `extremes`: try 0, then 301, then 99999 columns and check where it stops (300 at most; 0 stays put, and a
  message gives the smallest size); `undo-redo`: undo the
  size change.
- Rated: yes, wants Tab to Dimensions (typing the number is content)

### 41. Tune it at the bigger size
- Does: at 200 columns, moves Brightness, Dither and Pattern light, switches Choose characters to By shape, and paints
  a stroke on Layer 1.
- Expects: each change lands within the `setting` budget; strokes draw without long frames; with a stroke drawn, a
  later size change grows or trims the canvas on the right and bottom instead of rescaling, the lock still keeping the
  grid's shape.
- Probes: `speed`: drag Brightness for two seconds with `qa.frames`; `interrupt`: change a size with paint on Layer 1
  and check the paint stays where it was.
- Rated: yes, wants Tab to Brightness then the arrows

**Free time:** she'd take `qa.memory`, try `tall.png` at 80 columns and scroll to its bottom, bake at 200 columns and
grow the grid afterwards to see what the working-size copy does, draw thin strokes on a Vector layer right on a new
photo's base and move a cells layer under it to check none of its characters change (one working scale for every
layer), and export the bigger .ans and check it in the terminal.

## Known

