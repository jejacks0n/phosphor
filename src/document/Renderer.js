/**
 * Turns the image + settings + paint layer into cells. Owns the two canvases the editors read:
 * pipelineCanvas (processed image at cols x rows, no paint) and outputCanvas (pipeline + paint,
 * quantized), which generated cells are built from.
 *
 * Authored cells (cellEdits, see cellEdits.js) compose over the paint-free image, and paint draws
 * over them: image -> authored cells -> paint.
 */
import { processImage, applyQuantization } from '../lib/ImageProcessor.js';
import { applyTransforms } from '../lib/PixelTransforms.js';
import { nearestColor } from '../lib/ColorUtils.js';
import { effectiveColor } from '../lib/PixelTransforms.js';
import Canvas, { ctx2d } from '../lib/Canvas.js';
import { buildCells, buildCell, brightnessChar, cellIndex, cellOfPixel, charRowsOf, composeCell, coverCell } from '../lib/Cells.js';
import { cellKey, parseKey } from './cellEdits.js';

export default class Renderer {
  pipelineCanvas = null;
  outputCanvas = null;
  palette = null;
  #scratch = null;
  #pipelineData = null; // pipelineCanvas pixels: the image under authored cells
  #paintData = null;    // transformed paint at grid resolution, from the last composite()
  #effective = new Map(); // stored colour -> displayed Color, until the next render

  // Forget the previous image's canvases so nothing paints against them before the next render.
  reset() {
    this.pipelineCanvas = this.outputCanvas = this.palette = null;
    this.#pipelineData = this.#paintData = null;
    this.#effective = new Map();
  }

  async render(image, params, layer) {
    const { canvas: pipeline, paletteColors } = await processImage(image, params);
    this.pipelineCanvas = pipeline.canvas;
    this.palette = paletteColors;
    this.#pipelineData = ctx2d(this.pipelineCanvas).getImageData(0, 0, params.cols, params.rows);
    this.#effective = new Map();

    const output = document.createElement('canvas');
    output.width = params.cols;
    output.height = params.rows;
    ctx2d(output);
    this.outputCanvas = output;
    this.composite(layer, params);

    // Late-stage quantization (forced into the palette locked from the base image); this also
    // gives the pixels their palette index (c), which the cells and CGA/VGA export rely on.
    const pixels = new Canvas(output);
    if (this.palette) applyQuantization(pixels, this.palette);
    else pixels.loadPixels();

    return buildCells(pixels.pixels, params.cols, params.rows, {
      charset: params.chars,
      charMode: params.charMode || 'random',
      renderStyle: params.renderStyle || 'ansi',
      seed: params.seed,
    });
  }

  // Redraw outputCanvas: the pipeline image, then the paint layer with the colour transforms applied.
  composite(layer, params) {
    if (!this.outputCanvas || !this.pipelineCanvas) return;

    const ctx = ctx2d(this.outputCanvas);
    const w = this.outputCanvas.width, h = this.outputCanvas.height;

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this.pipelineCanvas, 0, 0, w, h);

    this.#paintData = null;
    if (!layer) return;

    const br = parseFloat(params.brightness) / 100;
    const ct = parseFloat(params.contrast) / 100;
    const sa = parseFloat(params.saturation) / 100;
    const hu = parseFloat(params.hue) / 360;
    const inv = parseFloat(params.invert) / 100;
    const czStr = parseFloat(params.colorizeStrength) / 100;
    const needsTransform = br !== 1 || ct !== 1 || sa !== 1 || hu !== 0 || inv !== 0 || czStr !== 0;

    // Persistent scratch canvas for downsampling and transforming the paint layer
    if (!this.#scratch) this.#scratch = document.createElement('canvas');
    if (this.#scratch.width !== w || this.#scratch.height !== h) {
      this.#scratch.width = w;
      this.#scratch.height = h;
    }

    const scratchCtx = ctx2d(this.#scratch);
    scratchCtx.clearRect(0, 0, w, h);
    scratchCtx.imageSmoothingEnabled = false;
    scratchCtx.drawImage(layer.canvas, 0, 0, w, h);

    if (needsTransform) {
      const id = scratchCtx.getImageData(0, 0, w, h);
      applyTransforms(id.data, params.brightness, params.contrast, params.saturation, params.hue, params.invert, params.colorize, params.colorizeStrength);
      scratchCtx.putImageData(id, 0, 0);
    }

    this.#paintData = scratchCtx.getImageData(0, 0, w, h);
    ctx.drawImage(this.#scratch, 0, 0);

    if (this.palette && this.palette.length > 0) {
      applyQuantization(new Canvas(this.outputCanvas), this.palette);
    }
  }

  // Rebuild only the cells under the given grid pixels from the (already composited) output canvas.
  // baseCells (the last full render) supplies a cell's character in random mode.
  updateCells(cells, pixels, params, cellEdits, baseCells) {
    if (!this.outputCanvas) return cells;
    const canvas = new Canvas(this.outputCanvas);
    const next = cells.slice();
    const { cols, chars: charset, charMode, renderStyle } = params;
    const done = new Set();

    for (const { x, y } of pixels) {
      const { col, row } = cellOfPixel(x, y);
      const i = cellIndex(col, row, cols);
      if (done.has(i) || !next[i]) continue;
      done.add(i);

      const entry = cellEdits.get(cellKey(col, row));
      if (entry) {
        next[i] = this.#composeOne(col, row, params, entry, baseCells);
        continue;
      }

      let top = canvas.pixels[cellIndex(col, 2 * row, cols)];
      if (!top) continue; // output canvas from an older grid size
      let bottom = canvas.pixels[cellIndex(col, 2 * row + 1, cols)] || top;
      // Quantize only the touched pixels instead of the entire canvas
      if (this.palette) {
        top = nearestColor(top, this.palette);
        bottom = nearestColor(bottom, this.palette);
      }

      // Random mode keeps the cell's rendered character
      const char = charMode === 'brightness' ? brightnessChar(top, bottom, charset) : (baseCells[i] ?? next[i]).char;
      next[i] = buildCell(top, bottom, char, renderStyle);
    }
    return next;
  }

  // Generated cells with every in-grid authored cell composed in.
  composeAll(baseCells, cellEdits, params) {
    const cells = baseCells.slice();
    const rows = charRowsOf(params.rows);
    for (const [key, entry] of cellEdits) {
      const { col, row } = parseKey(key);
      if (col < params.cols && row < rows) cells[cellIndex(col, row, params.cols)] = this.#composeOne(col, row, params, entry, baseCells);
    }
    return cells;
  }

  // A stored colour as it displays: colour adjustments, then the active palette.
  effective(hex, params) {
    let color = this.#effective.get(hex);
    if (!color) {
      color = effectiveColor(hex, params, this.palette);
      this.#effective.set(hex, color);
    }
    return color;
  }

  // Transformed paint at a grid pixel ({ r, g, b, a } with a in 0..1), or null where there's none.
  paintAt(x, y) {
    const data = this.#paintData;
    if (!data || x < 0 || y < 0 || x >= data.width || y >= data.height) return null;
    const o = (y * data.width + x) * 4;
    return data.data[o + 3] ? { r: data.data[o], g: data.data[o + 1], b: data.data[o + 2], a: data.data[o + 3] / 255 } : null;
  }

  // The generated cell from the image alone (no paint): what an authored cell sits on. Null while
  // the pipeline pixels are stale (between a grid resize and its render).
  underCell(col, row, params, baseCells) {
    const { cols, chars: charset, charMode, renderStyle } = params;
    const data = this.#pipelineData;
    // Between a grid resize and the render it queues, the pipeline pixels are the old size.
    if (!data || data.width !== cols || data.height !== params.rows) return null;
    const pixelAt = (y) => {
      const o = (Math.min(y, params.rows - 1) * cols + col) * 4;
      const p = { r: data.data[o], g: data.data[o + 1], b: data.data[o + 2] };
      return this.palette ? nearestColor(p, this.palette) : p;
    };
    const top = pixelAt(2 * row), bottom = pixelAt(2 * row + 1);
    const char = charMode === 'brightness' ? brightnessChar(top, bottom, charset || '▄') : baseCells[cellIndex(col, row, cols)].char;
    return buildCell(top, bottom, char, renderStyle);
  }

  // Spec "Paint and authored cells" (a trial rule, kept in this one place): the authored entry
  // composes over the paint-free image, then any paint in the cell draws over it, so erasing the
  // paint reveals the authored cell again.
  #composeOne(col, row, params, entry, baseCells) {
    const under = this.underCell(col, row, params, baseCells);
    if (!under) return baseCells[cellIndex(col, row, params.cols)];
    const cell = composeCell(under, entry, params.renderStyle, (hex) => this.effective(hex, params));
    return coverCell(cell, this.paintAt(col, 2 * row), this.paintAt(col, 2 * row + 1), {
      renderStyle: params.renderStyle,
      charset: params.chars,
      palette: this.palette,
    });
  }
}
