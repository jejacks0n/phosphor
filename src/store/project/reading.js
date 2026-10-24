// Reading the document without changing it: the colors under a grid pixel (the image, the base, the
// paint), what's under a cell, edit cells, and rects on the grid.
import { cellKey, parseKey } from "@/document/editCells.js";
import { cellIndex, charRowsOf } from "@/lib/Cells.js";
import { rgb2hex, hex2rgb } from "@/lib/ColorUtils.js";
import { over } from "@/store/project/shared.js";

export const readingActions = {
  // The color under grid pixel (x, y) before adjustments: paint if there is any, else the source.
  rawColorAt(x, y) {
    if (!this.image) return '#000000';
    this.ensureLayer();
    x = Math.floor(x);
    y = Math.floor(y);
    const painted = this.paintLayer?.colorAt(x, y);
    return painted ? rgb2hex(painted) : this.baseColorAt(x, y);
  },

  // The base layer's color at grid pixel (x, y), as stored (before adjustments): its own pixel
  // over the image as the pipeline shows it.
  baseColorAt(x, y) {
    const own = this.baseLayer?.pixelAt(x, y);
    if (!own || own.a >= 1) return own ? rgb2hex(own) : this.imageColorAt(x, y);
    return rgb2hex(over(hex2rgb(this.imageColorAt(x, y)), own));
  },

  // The image under grid pixel (x, y) before adjustments, as the pipeline downsamples it.
  imageColorAt(x, y) {
    const source = this.renderer.imageAt(x, y, this.cols, this.rows);
    return source ? rgb2hex(source) : '#000000';
  },

  // What's under a cell, as stored colors (pre-adjustment), for the eyedropper, flip and merge up.
  // Stored, not as displayed: a picked or merged-up color keeps following the adjustments, as the
  // picture's own colors do (picking a displayed color would apply the adjustments twice).
  // withPaint: paint (on top) wins per half; otherwise edit-cell attributes, then the source image.
  underlyingAt(col, row, { withPaint = true } = {}) {
    const entry = this.editCellAt(col, row) ?? {};
    const half = (y, attr) => {
      const painted = withPaint && this.paintLayer?.colorAt(col, y);
      if (painted) return rgb2hex(painted);
      return entry[attr] ?? this.baseColorAt(col, y);
    };
    const i = cellIndex(col, row, this.cols);
    const shown = withPaint ? this.cells[i] : null;
    return {
      char: shown?.char ?? entry.char ?? this.renderedCells[i]?.char ?? ' ',
      bg: half(2 * row, 'bg'),
      fg: half(2 * row + 1, 'fg'),
    };
  },

  editCellAt(col, row) {
    return this.editCells.get(cellKey(col, row));
  },

  // The whole grid as a rect (Merge up and Select all with no selection).
  gridRect() {
    return { c0: 0, r0: 0, c1: this.cols - 1, r1: charRowsOf(this.rows) - 1 };
  },

  // The base layer's cell (no edits, no paint), as stored colors: the converter's character (or
  // the pinned one) on the base's colors (bg the top half, fg the bottom).
  baseCellAt(col, row) {
    return {
      char: this.baseRecords.pins.get(cellKey(col, row)) ?? this.renderedCells[cellIndex(col, row, this.cols)]?.char ?? ' ',
      bg: this.baseColorAt(col, 2 * row),
      fg: this.baseColorAt(col, 2 * row + 1),
    };
  },

  clipRect({ c0, r0, c1, r1 }) {
    const rect = { c0: Math.max(0, c0), r0: Math.max(0, r0), c1: Math.min(this.cols - 1, c1), r1: Math.min(charRowsOf(this.rows) - 1, r1) };
    return rect.c0 <= rect.c1 && rect.r0 <= rect.r1 ? rect : null;
  },

  cellHasPaint(col, row) {
    return !!(this.paintLayer?.colorAt(col, 2 * row) || this.paintLayer?.colorAt(col, 2 * row + 1));
  },

  // Whether anything is drawn inside a cell rect (an edit cell or paint): something to merge.
  hasEditsIn(rect) {
    for (const key of this.editCells.keys()) {
      const { col, row } = parseKey(key);
      if (col >= rect.c0 && col <= rect.c1 && row >= rect.r0 && row <= rect.r1) return true;
    }
    return !!this.paintLayer?.hasPaintIn(rect);
  },
};
