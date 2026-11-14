// The base layer's own pixels and pins: erasing (black, with a pinned space), flipping a cell's
// halves, and writing pixels. Base edits are exact: over the image as the pipeline shows it, never
// resampled or put through the effects. Each is part of the current edit; the caller commits it.
import { withPins } from '@/document/baseRecords.js';
import { BLANK, cellKey, parseKey } from '@/document/editCells.js';
import { ctx2d } from '@/lib/Canvas.js';
import { hex2rgb } from '@/lib/ColorUtils.js';

export const baseLayerActions = {
  // Erase the base in these cells: black, with a pinned space (and no 256-color index).
  eraseBase(cells) {
    if (!cells.length) return;
    const pixels = cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row, hex: BLANK.bg }, { x: col, y: 2 * row + 1, hex: BLANK.bg }]);
    this.writeBase(pixels);
    this.setBaseRecords(withPins(this.baseRecords, cells.map(({ col, row }) => ({ col, row, char: ' ' }))));
    const { cols, rows } = this;
    this.recompose(pixels.filter(({ x, y }) => x < cols && y < rows)); // with their pins (the cells were rebuilt before them)
  },

  // Write whole cells into the base ({ col, row, char, fg, bg, fgIndex?, bgIndex? }), as Merge down does: the
  // background as the top pixel, the foreground as the bottom one, and every character pinned with its colors' indexes.
  writeBaseCells(cells) {
    if (!cells.length) return;
    const pixels = cells.flatMap(({ col, row, fg, bg }) => [{ x: col, y: 2 * row, hex: bg }, { x: col, y: 2 * row + 1, hex: fg }]);
    this.writeBase(pixels);
    this.setBaseRecords(withPins(this.baseRecords, cells));
    const { cols, rows } = this;
    this.recompose(pixels.filter(({ x, y }) => x < cols && y < rows));
  },

  // Erase base pixels (the Pixel view): black, the characters left as they are.
  eraseBasePixels(pixels) {
    this.writeBase(pixels.map(({ x, y }) => ({ x, y, hex: BLANK.bg })));
  },

  // Flip the base in these cells: swap each cell's two halves (background and foreground), every
  // pixel of each (basePixelsOf), so the flipped cell shows the colors it showed, swapped.
  flipBase(cells) {
    if (!cells.length) return;
    this.ensureLayer();
    this.beginEdit();
    const k = this.baseLayer.scale;
    for (const { col, row } of cells) {
      const cell = this.basePixelsOf({ c0: col, r0: row, c1: col, r1: row });
      const flipped = document.createElement('canvas');
      flipped.width = k;
      flipped.height = 2 * k;
      const ctx = ctx2d(flipped);
      ctx.drawImage(cell, 0, k, k, k, 0, 0, k, k);
      ctx.drawImage(cell, 0, 0, k, k, 0, k, k, k);
      this.baseLayer.pasteCells(flipped, col, row, 1, 1);
    }
    const { pins, indexes } = this.baseRecords; // a pinned cell's indexes swap with its halves
    const swapped = indexes.size ? cells.filter(({ col, row }) => indexes.has(cellKey(col, row))) : [];
    if (swapped.length) {
      this.setBaseRecords(withPins(this.baseRecords, swapped.map(({ col, row }) => {
        const { fgIndex, bgIndex } = indexes.get(cellKey(col, row));
        return { col, row, char: pins.get(cellKey(col, row)), fgIndex: bgIndex, bgIndex: fgIndex };
      })));
    }
    this.refreshCells(cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]));
  },

  // Paint grid pixels ({ x, y, r, g, b, alpha }) onto the base's own pixels at an opacity, stacking or not, as a cells
  // layer's paint goes (PaintLayer.paint): the Brush with the base picked. Off-grid ones are skipped.
  paintBasePixels(pixels, opacity = 100, stack = false) {
    const { cols, rows } = this;
    const inGrid = pixels.filter(({ x, y }) => x >= 0 && y >= 0 && x < cols && y < rows);
    if (!inGrid.length) return;
    this.ensureLayer();
    this.beginEdit();
    this.baseLayer.paint(inGrid, opacity, stack);
    dropIndexes(this, inGrid);
    this.refreshCells(inGrid);
  },

  // Set base pixels ({ x, y, hex } in grid pixels; off-grid ones are skipped) and show them.
  writeBase(pixels) {
    const { cols, rows } = this; // read once: a store getter per pixel adds up over a fill
    const inGrid = pixels.filter(({ x, y }) => x >= 0 && y >= 0 && x < cols && y < rows);
    if (!inGrid.length) return;
    this.ensureLayer();
    this.beginEdit();
    this.baseLayer.erase(inGrid); // so a pixel left part-covered by a merge is replaced, not blended
    this.baseLayer.paint(inGrid.map(({ x, y, hex }) => ({ x, y, ...hex2rgb(hex), alpha: 1 })));
    dropIndexes(this, inGrid);
    this.refreshCells(inGrid);
  },
};

// Pixels written over a pinned cell's half drop that color's 256-color index: it's the pixel's own color now (the Brush
// paints 0's black, never 16's).
function dropIndexes(project, pixels) {
  const { pins, indexes } = project.baseRecords;
  if (!indexes.size) return;
  const left = new Map();
  for (const { x, y } of pixels) {
    const key = cellKey(x, y >> 1), kept = left.get(key) ?? indexes.get(key);
    if (kept) left.set(key, { ...kept, [y % 2 ? 'fgIndex' : 'bgIndex']: undefined });
  }
  if (left.size) project.setBaseRecords(withPins(project.baseRecords, [...left].map(([key, kept]) => ({ ...parseKey(key), char: pins.get(key), ...kept }))));
}
