// Reading the document without changing it: the colors under a grid pixel (the image, the base, the
// paint), what's under a cell, edit cells, and rects on the grid.
import { wholeTile } from '@/document/PaintLayer.js';
import { hashCell, hashPixel, pack } from '@/document/changes.js';
import { cellKey, parseKey } from '@/document/editCells.js';
import { isShapeKey } from '@/document/shapes.js';
import { keyLayer, layerKey } from '@/document/layerInfo.js';
import { TILE } from '@/document/History.js';
import { ctx2d } from '@/lib/Canvas.js';
import { cellIndex, charRowsOf } from '@/lib/Cells.js';
import { rgb2hex, hex2rgb } from '@/lib/ColorUtils.js';
import { paletteChoices } from '@/lib/PixelTransforms.js';
import { lowerEdits, lowerPaint, over } from '@/store/project/shared.js';

// For each palette color, a stored color that shows as it under the adjustments (paletteChoices), kept while
// the palette and the settings stay the same: asked once a cell by a whole grid's Merge up.
const storedFor = new WeakMap();
function storedOf(palette, params) {
  let held = storedFor.get(palette);
  if (held?.params !== params) {
    const choices = paletteChoices(params, palette);
    held = { params, map: new Map(palette.map((p, i) => [p.hex.toLowerCase(), choices[i]])) };
    storedFor.set(palette, held);
  }
  return held.map;
}

export const readingActions = {
  // What the ledger reads, the first time it meets a position: the value before what's being submitted.
  // sendSlice submits a slice that's already written, so for that long the answer is what the stroke
  // had as of its last slice, and only the tiles this slice touched can be asked for. An artist's change
  // waiting for its frame (sharing.js) is already what's there. Inside an art layer they're the drawing kept aside:
  // what's drawn in the layer goes as the layer, never as cells or paint (sendSlice).
  // Keys and tiles name their layer (layerInfo.js); the baseline is the layer in use's, the one a slice is of.
  readCell(key) {
    const heard = this._sharing?.heardCells;
    if (heard?.has(key)) return heard.get(key);
    if (isShapeKey(key)) return (this._baseline?.shapes ?? this.shapes).get(key);
    const { id, key: at } = keyLayer(key);
    if (id !== this.editId) return this.cellsOf(id).get(at);
    return (this._artInside?.editCells ?? this._baseline?.cells ?? this.editCells).get(at);
  },

  readTile(x, y, id = 'edit') {
    if (id !== this.editId) return this.paintOf(id)?.readTile(x, y) ?? new Uint8ClampedArray(TILE * TILE * 4);
    if (this._artInside) return this._artInside.paintLayer.readTile(x, y);
    const before = this._baseline?.tiles.get(`${x},${y}`);
    return before ? wholeTile(before) : this.paintLayer.readTile(x, y);
  },

  // The check over the drawn layers as they are (changes.js), the slow way: what a sum is seeded with. Inside an art layer,
  // over the drawing kept aside.
  editLayerSum() {
    let sum = 0;
    for (const [key, shape] of this.shapes) sum ^= hashCell(key, shape);
    for (const id of new Set([this.editId, ...this.layers.slice(1).filter((layer) => layer.kind === 'cells').map((layer) => layer.id)])) {
      const { editCells, paintLayer } = id === this.editId ? this._artInside ?? this : this._layerData.get(id) ?? {};
      for (const [key, entry] of editCells ?? []) sum ^= hashCell(layerKey(id, key), entry);
      if (!paintLayer?.hasPaint) continue;
      const { width, height } = paintLayer.canvas;
      const { data } = ctx2d(paintLayer.canvas).getImageData(0, 0, width, height);
      for (let i = 3, at = 0; i < data.length; i += 4, at++) {
        if (data[i]) sum ^= hashPixel(at % width, Math.floor(at / width), pack(data, i - 3));
      }
    }
    return sum;
  },

  // The color under grid pixel (x, y) before adjustments: paint (over the base, by its alpha) if
  // there is any, else the base.
  rawColorAt(x, y) {
    if (!this.image) return '#000000';
    this.ensureLayer();
    x = Math.floor(x);
    y = Math.floor(y);
    const painted = lowerPaint(this)?.pixelAt(x, y);
    if (!painted || painted.a >= 1) return painted ? rgb2hex(painted) : this.baseColorAt(x, y);
    return rgb2hex(over(hex2rgb(this.baseColorAt(x, y)), painted));
  },

  // The base layer's color at grid pixel (x, y), as stored (before adjustments): its own pixels
  // (as the Renderer stores them: a moved block of the picture keeps every processed pixel) over
  // the image as the pipeline shows it.
  baseColorAt(x, y) {
    const own = this.renderer.baseStoredAt(x, y);
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
  // withPaint: paint (on top, by its alpha) over each half; under it edit-cell attributes, then the
  // source image. A hidden layer isn't read (what shows is picked), unless evenHidden (an edit of the layer itself).
  underlyingAt(col, row, { withPaint = true, evenHidden = false } = {}) {
    const entry = (evenHidden ? this.editCells : lowerEdits(this)).get(cellKey(col, row)) ?? {};
    const paint = evenHidden ? this.paintLayer : lowerPaint(this);
    const half = (y, attr) => {
      const under = entry[attr] ?? this.baseColorAt(col, y);
      const painted = withPaint && paint?.pixelAt(col, y);
      return painted ? rgb2hex(over(hex2rgb(under), painted)) : under;
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

  // The base layer's cell (no edits, no paint), as stored colors (before adjustments): the character it
  // shows (or the pinned one), bg the top half, fg the bottom. With a palette, an ANSI cell's colors are
  // the ones it shows (dithered, or Best match's and By shape's, aren't its two pixels; and a pixel run
  // through the adjustments here can land on another palette color than the pipeline's): its own pixel
  // where that shows as it, so it follows the adjustments as the picture does, else one that does.
  baseCellAt(col, row) {
    const params = this.processParams, palette = this.renderer.palette;
    // underCell: as the cell shows now; the last full render's is stale after a base edit (until the pipeline's redone)
    const shown = this.renderer.underCell(col, row, params, this.renderedCells);
    const bg = this.baseColorAt(col, 2 * row), fg = this.baseColorAt(col, 2 * row + 1);
    if (shown && palette && this.renderStyle === 'ansi') {
      const stored = storedOf(palette, params);
      const as = (color, own) => {
        const hex = color.hex.toLowerCase();
        return this.renderer.effective(own, params).hex.toLowerCase() === hex ? own : stored.get(hex) ?? color.hex;
      };
      return { char: shown.char, bg: as(shown.bg, bg), fg: as(shown.fg, fg) };
    }
    return { char: shown?.char ?? this.renderer.pinAt(col, row) ?? this.renderedCells[cellIndex(col, row, this.cols)]?.char ?? ' ', bg, fg };
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
