# Changelog

What's changed in each version of Phosphor that someone using it would notice: new features, changes to how something
works, and fixes to bugs they could have hit. The newest version comes first, and what's on main but not released yet is
under Unreleased.

## Unreleased

### Added

- The Select tool adds to and takes away from a selection: **Shift**-drag adds a rectangle, **Alt**-drag (**Option** on a
  Mac) takes one away, and both together keep only the overlap, so two rectangles apart, or one with a hole, are one
  selection. The Magic Wand takes the same keys: **Alt**-click takes what matches away, **Shift+Alt**-click keeps only
  what matches inside the selection. The pointer shows **+**, **−** or **×** while a key is held.
- **Crop**, on the Select tool's options row beside **Set FG** and **Set BG** and in the command list, cuts the drawing to
  the selection: every layer's cells and paint, the base's pixels and pinned characters, the shapes and art layers on
  every frame, and the rulers' guides and zero move up and left to the corner, and the grid becomes the selection's
  size. The picture stays under the art as it was, its colors in every cell kept. One undo step brings back all of it,
  what was cut off too; in a room only the host crops, and is asked first.
- A selection of paint and picture pixels resizes by handles on its corners and sides, **Shift** keeping its shape. The
  pixels land as ▄ half-blocks, the block floats like a moved one, and the resizes and moves together are one undo step.
  The handles don't show while the selection has characters, as Rotate is off then.
- On a phone, **Commands** under **Plugins** at the bottom of the settings opens the command list, so a command with
  only a key can be reached.
- **Mirror mode**: what the drawing tools lay on one side of the rulers' zeros is laid again on the other, characters
  turned as Flip turns them: left to right down the middle (or at the top ruler's zero), and top to bottom too once the
  left ruler's zero is moved. **Alt+M** (**Option+M** on a Mac) turns it on and off, as do **Mirror mode** in the
  **⋯** menu where the rulers meet and **Mirror drawing** on the Hand's row. It's off each time the app loads.
- **Ink only**, a **Draw with** choice for the Pencil and the Brush in the ANSI view, in ANSI and Color ASCII: it
  recolors the characters a stroke crosses in the foreground color, as **Set FG** recolors a selection, and leaves their
  backgrounds and every cell with no character alone. On the base the recolored characters are pinned.
- **Shade**, a **Draw with** choice for the Pencil and the Brush in the ANSI view: each pass steps the cells it crosses
  one shade further in the foreground color, `░` `▒` `▓` `█`, and **Lighter** (or holding Cmd, Ctrl on Windows and
  Linux) steps them back to a space. One step a cell a stroke, written as typed characters, in every art style.
- Export as BinaryText (`.bin`), beside `.ans` and `.xb`: the 16 CGA colors and CP437, its width in a SAUCE record that's
  always written, with a blank column added to an odd width.
- Pen pressure for the Brush, the Soft Eraser and the Retouch tools: pressing harder with an Apple Pencil or another
  pen that senses it makes the Brush wider and lay more paint, the Soft Eraser take more and Blur, Dodge and Burn work
  more strongly.
- Once a pen has drawn on the art, fingers no longer draw: one finger pans the view and two pinch to zoom, so a hand
  resting on the screen leaves no marks.

### Changed

- The Magic Wand's selection works with the Select tool: copy, cut, **Delete**, moves, **Stamp**, flips and Rotate act
  on its cells alone, leaving the rest of the rectangle around them as it is. Drag one of its cells to move it.
- The rulers' corner is a **⋯** menu, with any tool: **Reset positions** puts both zeros back (a double-click on the
  corner did) and **Mirror mode** turns mirror mode on and off. With the Hand, a drag from the corner still moves both.
- A ruler's zero triangle shows a hand under the pointer with the Hand tool, so it reads as something to drag.
- The arrow keys move a selection past the canvas's edge, as dragging it does, so **Select all** and an arrow key move a
  whole layer a cell. A cell of the block always stays on the canvas, and what's past the edge comes back while it floats.
- The browser tab's icon is an SVG, so it's sharp at any size.
- Under **Best match** with **Full color**, **Pattern light** is hidden: there the half block already shows each cell's
  two halves exactly. It shows with a color palette, and with **By shape** on any palette, as before.

### Fixed

- On a phone, the rulers could end up off to the side of the art after the settings drawer shut.
- The Brush's **Opacity** and **Build up** no longer carry over into the Pencil, Shapes, the Paint Bucket and the
  Gradient: with the Brush at 50%, a filled circle came out half see-through. They paint at full opacity.

## 0.9.0-alpha (2026-11-26)

The first public release.
