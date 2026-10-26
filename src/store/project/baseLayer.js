// The base layer's own pixels and pins: erasing (black, with a pinned space), flipping a cell's
// halves, and writing pixels. Base edits are exact: over the image as the pipeline shows it, never
// resampled or put through the effects. Each is part of the current edit; the caller commits it.
import { withPins } from '@/document/baseRecords.js';
import { BLANK } from '@/document/editCells.js';
import { ctx2d } from '@/lib/Canvas.js';
import { hex2rgb } from '@/lib/ColorUtils.js';

export const baseLayerActions = {
  // Erase the base in these cells: black, with a pinned space.
  eraseBase(cells) {
    if (!cells.length) return;
    const pixels = cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row, hex: BLANK.bg }, { x: col, y: 2 * row + 1, hex: BLANK.bg }]);
    this.writeBase(pixels);
    this.setBaseRecords(withPins(this.baseRecords, cells.map(({ col, row }) => ({ col, row, char: ' ' }))));
    const { cols, rows } = this;
    this.recompose(pixels.filter(({ x, y }) => x < cols && y < rows)); // with their pins (the cells were rebuilt before them)
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
    this.refreshCells(cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]));
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
    this.refreshCells(inGrid);
  },
};
