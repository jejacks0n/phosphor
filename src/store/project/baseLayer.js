// The base layer's own pixels and pins: erasing (black, with a pinned space), flipping a cell's
// halves, and writing pixels. Base edits are exact: over the image as the pipeline shows it, never
// resampled or put through the effects. Each is part of the current edit; the caller commits it.
import { withPins } from '@/document/baseRecords.js';
import { BLANK } from '@/document/editCells.js';
import { hex2rgb } from '@/lib/ColorUtils.js';

export const baseLayerActions = {
  // Erase the base in these cells: black, with a pinned space.
  eraseBase(cells) {
    if (!cells.length) return;
    this.writeBase(cells.flatMap(({ col, row }) => [{ x: col, y: 2 * row, hex: BLANK.bg }, { x: col, y: 2 * row + 1, hex: BLANK.bg }]));
    this.setBaseRecords(withPins(this.baseRecords, cells.map(({ col, row }) => ({ col, row, char: ' ' }))));
  },

  // Erase base pixels (the Pixel view): black, the characters left as they are.
  eraseBasePixels(pixels) {
    this.writeBase(pixels.map(({ x, y }) => ({ x, y, hex: BLANK.bg })));
  },

  // Flip the base in these cells: swap each cell's two halves (background and foreground).
  flipBase(cells) {
    this.writeBase(cells.flatMap(({ col, row }) => [
      { x: col, y: 2 * row, hex: this.baseColorAt(col, 2 * row + 1) },
      { x: col, y: 2 * row + 1, hex: this.baseColorAt(col, 2 * row) },
    ]));
  },

  // Set base pixels ({ x, y, hex } in grid pixels; off-grid ones are skipped) and show them.
  writeBase(pixels) {
    const inGrid = pixels.filter(({ x, y }) => x >= 0 && y >= 0 && x < this.cols && y < this.rows);
    if (!inGrid.length) return;
    this.ensureLayer();
    this.beginEdit();
    this.baseLayer.erase(inGrid); // so a pixel left part-covered by a merge is replaced, not blended
    this.baseLayer.paint(inGrid.map(({ x, y, hex }) => ({ x, y, ...hex2rgb(hex), alpha: 1 })));
    this.refreshCells(inGrid);
  },
};
