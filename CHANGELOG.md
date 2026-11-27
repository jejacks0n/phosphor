# Changelog

What's changed in each version of Phosphor that someone using it would notice: new features, changes to how something
works, and fixes to bugs they could have hit. The newest version comes first, and what's on main but not released yet is
under Unreleased.

## Unreleased

### Added

- Export as BinaryText (`.bin`), beside `.ans` and `.xb`: the 16 CGA colors and CP437, its width in a SAUCE record that's
  always written, with a blank column added to an odd width.

### Changed

- The arrow keys move a selection past the canvas's edge, as dragging it does, so **Select all** and an arrow key move a
  whole layer a cell. A cell of the block always stays on the canvas, and what's past the edge comes back while it floats.
- The browser tab's icon is an SVG, so it's sharp at any size.

## 0.9.0-alpha (2026-11-26)

The first public release.
