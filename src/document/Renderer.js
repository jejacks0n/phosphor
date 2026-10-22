/**
 * Turns the image + settings + paint layer into cells. Owns the two canvases the editors read:
 * pipelineCanvas (processed image at cols x rows, no paint) and outputCanvas (pipeline + paint,
 * quantized), which cells are built from.
 */
import { processImage, applyQuantization } from '../lib/ImageProcessor.js';
import { applyTransforms } from '../lib/PixelTransforms.js';
import { nearestColor } from '../lib/ColorUtils.js';
import Canvas, { ctx2d } from '../lib/Canvas.js';
import { buildCells, buildCell, brightnessChar, cellIndex, cellOfPixel } from '../lib/Cells.js';

export default class Renderer {
  pipelineCanvas = null;
  outputCanvas = null;
  palette = null;
  #scratch = null;

  // Forget the previous image's canvases so nothing paints against them before the next render.
  reset() {
    this.pipelineCanvas = this.outputCanvas = this.palette = null;
  }

  async render(image, params, layer) {
    const { canvas: pipeline, paletteColors } = await processImage(image, params);
    this.pipelineCanvas = pipeline.canvas;
    this.palette = paletteColors;

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

    ctx.drawImage(this.#scratch, 0, 0);

    if (this.palette && this.palette.length > 0) {
      applyQuantization(new Canvas(this.outputCanvas), this.palette);
    }
  }

  // Rebuild only the cells under the given grid pixels from the (already composited) output canvas.
  // baseCells (the last full render) supplies a cell's character in random mode.
  updateCells(cells, pixels, params, charEdits, baseCells) {
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

      let top = canvas.pixels[cellIndex(col, 2 * row, cols)];
      if (!top) continue; // output canvas from an older grid size
      let bottom = canvas.pixels[cellIndex(col, 2 * row + 1, cols)] || top;
      // Quantize only the touched pixels instead of the entire canvas
      if (this.palette) {
        top = nearestColor(top, this.palette);
        bottom = nearestColor(bottom, this.palette);
      }

      // Char edits win; random mode keeps the cell's rendered character
      const char = charEdits.get(i) ?? (charMode === 'brightness' ? brightnessChar(top, bottom, charset) : (baseCells[i] ?? next[i]).char);
      next[i] = buildCell(top, bottom, char, renderStyle);
    }
    return next;
  }
}
