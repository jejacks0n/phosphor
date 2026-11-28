# Changelog

What's changed in each version of Phosphor that someone using it would notice: new features, changes to how something
works, and fixes to bugs they could have hit. The newest version comes first, and what's on main but not released yet is
under Unreleased.

## Unreleased

### Added

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

- The rulers' corner is a **⋯** menu, with any tool: **Reset positions** puts both zeros back (a double-click on the
  corner did) and **Mirror mode** turns mirror mode on and off. A drag from the corner still moves both.
- A ruler's zero triangle shows a hand under the pointer, so it reads as something to drag.
- A ruler's zero moves by its triangle or the corner with any tool, without picking the Hand or holding Space. Guides
  are still placed and moved only with the Hand (or Space held).
- The arrow keys move a selection past the canvas's edge, as dragging it does, so **Select all** and an arrow key move a
  whole layer a cell. A cell of the block always stays on the canvas, and what's past the edge comes back while it floats.
- The browser tab's icon is an SVG, so it's sharp at any size.

### Fixed

- With the Brush or the Eraser picked, the pointer over the rulers was hidden and the tool's outline lay across them,
  and a press on a ruler drew or erased the art the outline reached. Over the rulers the pointer is now theirs, and the
  tool shows nothing there or while a guide or zero is dragged out of them.
- On a phone, the rulers could end up off to the side of the art after the settings drawer shut.
- The Brush's **Opacity** and **Build up** no longer carry over into the Pencil, Shapes, the Paint Bucket and the
  Gradient: with the Brush at 50%, a filled circle came out half see-through. They paint at full opacity.

## 0.9.0-alpha (2026-11-26)

The first public release.
