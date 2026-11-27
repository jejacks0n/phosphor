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
  left ruler's zero is moved. **Alt+M** (**Option+M** on a Mac) turns it on and off, as does **Mirror mode** in the
  **⋯** menu where the rulers meet. It's off each time the app loads.
- **Shade**, a **Draw with** choice for the Pencil and the Brush in the ANSI view: each pass steps the cells it crosses
  one shade further in the foreground color, `░` `▒` `▓` `█`, and **Lighter** (or holding Cmd, Ctrl on Windows and
  Linux) steps them back to a space. One step a cell a stroke, written as typed characters, in every art style.
- Export as BinaryText (`.bin`), beside `.ans` and `.xb`: the 16 CGA colors and CP437, its width in a SAUCE record that's
  always written, with a blank column added to an odd width.

### Changed

- The rulers' corner is a **⋯** menu, with any tool: **Reset positions** puts both zeros back (a double-click on the
  corner did) and **Mirror mode** turns mirror mode on and off. With the Hand, a drag from the corner still moves both.
- A ruler's zero triangle shows a hand under the pointer with the Hand tool, so it reads as something to drag.
- The arrow keys move a selection past the canvas's edge, as dragging it does, so **Select all** and an arrow key move a
  whole layer a cell. A cell of the block always stays on the canvas, and what's past the edge comes back while it floats.
- The browser tab's icon is an SVG, so it's sharp at any size.

### Fixed

- On a phone, the rulers could end up off to the side of the art after the settings drawer shut.
- The Brush's **Opacity** and **Build up** no longer carry over into the Pencil, Shapes, the Paint Bucket and the
  Gradient: with the Brush at 50%, a filled circle came out half see-through. They paint at full opacity.

## 0.9.0-alpha (2026-11-26)

The first public release.
