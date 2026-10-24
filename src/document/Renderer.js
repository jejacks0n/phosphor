/**
 * Turns the image + settings + base pixels + paint layer into cells. Owns the two canvases the
 * editors read: pipelineCanvas (processed image at cols x rows, nothing over it) and outputCanvas
 * (pipeline + base pixels + paint, quantized), which generated cells are built from.
 *
 * The base layer is the image through the pipeline with the base's own pixels over it (baseLayer,
 * a grid-resolution PaintLayer set by the store: erased, flipped, moved and merged-down pixels,
 * exact, and never put through the pipeline's resampling or effects). Edit cells (editCells, see
 * editCells.js) compose over the base, and paint draws over them: base -> edit cells -> paint. The
 * base layer's pins (baseRecords.js, set by the store) keep their characters.
 */
import { processImage, applyQuantization, getPaletteColors } from '../lib/ImageProcessor.js';
import { applyTransforms } from '../lib/PixelTransforms.js';
import { nearestColor } from '../lib/ColorUtils.js';
import { effectiveColor } from '../lib/PixelTransforms.js';
import Canvas, { ctx2d } from '../lib/Canvas.js';
import { buildCells, buildCell, brightnessChar, cellIndex, cellOfPixel, charRowsOf, composeCell, coverCell } from '../lib/Cells.js';
import { cellKey, parseKey } from './editCells.js';
import { EMPTY_BASE } from './baseRecords.js';

export default class Renderer {
  pipelineCanvas = null;
  outputCanvas = null;
  palette = null;
  baseRecords = EMPTY_BASE; // the store keeps this in step with its own
  baseLayer = null;         // the base layer's pixels (PaintLayer), the store's
  #scratch = null;
  #pipelineData = null; // pipelineCanvas pixels
  #baseData = null;     // the pipeline with the base layer's pixels over it, from the last composite(): what edit cells sit on
  #paintData = null;    // transformed paint at grid resolution, from the last composite()
  #heldData = null;     // the output before the palette snap, while a held composite's stroke is open
  #effective = new Map(); // stored colour -> displayed Color, until the next render
  #source = null;       // { key, data }: the image through the pipeline with colour adjustments neutral (stored colours)

  // Forget the previous image's canvases so nothing paints against them before the next render.
  reset() {
    this.pipelineCanvas = this.outputCanvas = this.palette = null;
    this.#pipelineData = this.#baseData = this.#paintData = this.#source = null;
    this.#effective = new Map();
  }

  // baseParams: params with the colour adjustments neutral (settings.baseParams).
  async render(image, params, paintLayer, baseParams) {
    const { canvas: pipeline, paletteColors } = await processImage(image, params);
    this.pipelineCanvas = pipeline.canvas;
    this.palette = paletteColors;
    this.#pipelineData = ctx2d(this.pipelineCanvas).getImageData(0, 0, params.cols, params.rows);
    this.#effective = new Map();

    // Underlying colours depend only on the image, grid, smoothing, effects and CGA/VGA, so colour
    // adjustments don't redo this.
    const sp = baseParams ?? {};
    const sourceKey = [params.cols, params.rows, JSON.stringify(params.fit), params.smoothing, sp.quantize, sp.sharpen, sp.flatten, sp.edges, sp.edgeColor, sp.edgeThickness].join();
    if (baseParams && (this.#source?.image !== image || this.#source.key !== sourceKey)) {
      const { canvas: source } = await processImage(image, baseParams);
      this.#source = { image, key: sourceKey, data: ctx2d(source.canvas).getImageData(0, 0, params.cols, params.rows) };
    }

    const output = document.createElement('canvas');
    output.width = params.cols;
    output.height = params.rows;
    ctx2d(output);
    this.outputCanvas = output;
    this.composite(paintLayer, params);
    return this.cellsFromOutput(params);
  }

  // The generated cells from the composited output (no edit cells): quantized to the palette, which
  // also gives the pixels their palette index (c), which the cells and CGA/VGA export rely on.
  cellsFromOutput(params) {
    const pixels = new Canvas(this.outputCanvas);
    if (this.palette) applyQuantization(pixels, this.palette);
    else pixels.loadPixels();

    const cells = buildCells(pixels.pixels, params.cols, params.rows, {
      charset: params.chars,
      charMode: params.charMode || 'random',
      renderStyle: params.renderStyle || 'ansi',
      seed: params.seed,
    });
    const rows = charRowsOf(params.rows);
    for (const key of this.baseRecords.pins.keys()) {
      const { col, row } = parseKey(key);
      if (col < params.cols && row < rows) cells[cellIndex(col, row, params.cols)] = this.#onBase(col, row, cells[cellIndex(col, row, params.cols)]);
    }
    return cells;
  }

  // Redraw outputCanvas: the pipeline image, then the base layer's pixels and the paint layer, each
  // with the colour transforms applied. The Number palette (quantize 'count') is picked from what
  // that shows, so the drawing's colours have places in it; true when that changed the palette
  // (every cell may need its colours again, not just those under the change). hold: a stroke is open
  // and the Number palette waits for it to end (trial: When you let go); meanwhile the paint shows in
  // its own colours (updateCells).
  composite(paintLayer, params, { hold = false } = {}) {
    if (!this.outputCanvas || !this.pipelineCanvas) return false;

    const ctx = ctx2d(this.outputCanvas);
    const w = this.outputCanvas.width, h = this.outputCanvas.height;

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this.pipelineCanvas, 0, 0, w, h);

    if (this.baseLayer?.hasPaint) this.#drawLayer(ctx, this.baseLayer, params);
    this.#baseData = this.baseLayer?.hasPaint ? ctx.getImageData(0, 0, w, h) : this.#pipelineData;

    this.#paintData = paintLayer ? this.#drawLayer(ctx, paintLayer, params) : null;
    const changed = !hold && params.quantize === 'count' && this.#recount(params);
    this.#heldData = hold ? ctx.getImageData(0, 0, w, h).data : null;
    if (paintLayer && this.palette?.length) applyQuantization(new Canvas(this.outputCanvas), this.palette);
    return changed;
  }

  // The Number palette from the output as composited (before it's quantized); true when it changed.
  #recount(params) {
    const next = getPaletteColors(params, new Canvas(this.outputCanvas));
    const key = (palette) => palette?.map((p) => p.hex).join();
    if (key(next) === key(this.palette)) return false;
    this.palette = next;
    this.#effective = new Map(); // displayed colours snap to the palette
    return true;
  }

  // Draw a layer at grid resolution (a grid pixel at a time) with the colour transforms applied;
  // returns the transformed pixels.
  #drawLayer(ctx, layer, params) {
    const w = this.outputCanvas.width, h = this.outputCanvas.height;
    const br = parseFloat(params.brightness) / 100;
    const ct = parseFloat(params.contrast) / 100;
    const sa = parseFloat(params.saturation) / 100;
    const hu = parseFloat(params.hue) / 360;
    const inv = parseFloat(params.invert) / 100;
    const czStr = parseFloat(params.colorizeStrength) / 100;
    const needsTransform = br !== 1 || ct !== 1 || sa !== 1 || hu !== 0 || inv !== 0 || czStr !== 0;

    // Persistent scratch canvas for downsampling and transforming a layer
    if (!this.#scratch) this.#scratch = document.createElement('canvas');
    if (this.#scratch.width !== w || this.#scratch.height !== h) {
      this.#scratch.width = w;
      this.#scratch.height = h;
    }

    const scratchCtx = ctx2d(this.#scratch);
    scratchCtx.clearRect(0, 0, w, h);
    scratchCtx.imageSmoothingEnabled = false;
    scratchCtx.drawImage(layer.canvas, 0, 0, w * layer.scale, h * layer.scale, 0, 0, w, h); // the grid's part (a layer can reach past it)

    if (needsTransform) {
      const id = scratchCtx.getImageData(0, 0, w, h);
      applyTransforms(id.data, params.brightness, params.contrast, params.saturation, params.hue, params.invert, params.colorize, params.colorizeStrength);
      scratchCtx.putImageData(id, 0, 0);
    }

    const data = scratchCtx.getImageData(0, 0, w, h);
    ctx.drawImage(this.#scratch, 0, 0);
    return data;
  }

  // Rebuild only the cells under the given grid pixels from the (already composited) output canvas.
  // baseCells (the last full render) supplies a cell's character in random mode.
  updateCells(cells, pixels, params, editCells, baseCells) {
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

      const entry = editCells.get(cellKey(col, row));
      if (entry) {
        next[i] = this.#composeOne(col, row, params, entry, baseCells);
        continue;
      }

      let top = canvas.pixels[cellIndex(col, 2 * row, cols)];
      if (!top) continue; // output canvas from an older grid size
      let bottom = canvas.pixels[cellIndex(col, 2 * row + 1, cols)] || top;
      // Quantize only the touched pixels instead of the entire canvas (held paint keeps its colours)
      if (this.palette) {
        top = this.#held(col, 2 * row, cols) ?? nearestColor(top, this.palette);
        bottom = this.#held(col, 2 * row + 1, cols) ?? nearestColor(bottom, this.palette);
      }

      // Random mode keeps the cell's rendered character
      const char = charMode === 'brightness' ? brightnessChar(top, bottom, charset) : (baseCells[i] ?? next[i]).char;
      next[i] = this.#onBase(col, row, buildCell(top, bottom, char, renderStyle));
    }
    return next;
  }

  // A painted grid pixel's colour before the palette snap, while a stroke is held; else null.
  #held(x, y, cols) {
    if (!this.#heldData || !this.paintAt(x, y)) return null;
    const o = (y * cols + x) * 4, d = this.#heldData;
    return { r: d[o], g: d[o + 1], b: d[o + 2], a: 1 };
  }

  // Generated cells with every in-grid edit cell composed in.
  composeAll(baseCells, editCells, params) {
    const cells = baseCells.slice();
    const rows = charRowsOf(params.rows);
    for (const [key, entry] of editCells) {
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

  // A grid pixel of the image downsampled by the pipeline with nothing applied, or null before the
  // first render. Black in the letterbox, as the pipeline fills it.
  // cols/rows: the current grid; between a resize and its render the cached pixels are stale.
  imageAt(x, y, cols, rows) {
    const data = this.#source?.data;
    if (!data || data.width !== cols || data.height !== rows || x < 0 || y < 0 || x >= cols || y >= rows) return null;
    const o = (y * data.width + x) * 4;
    return { r: data.data[o], g: data.data[o + 1], b: data.data[o + 2] };
  }

  // The base layer's cell (no edit cells, no paint): what an edit cell sits on. Null while the
  // pipeline pixels are stale (between a grid resize and its render).
  underCell(col, row, params, baseCells) {
    const { cols, chars: charset, charMode, renderStyle } = params;
    const data = this.#baseData;
    // Between a grid resize and the render it queues, the pipeline pixels are the old size.
    if (!data || data.width !== cols || data.height !== params.rows) return null;
    const pixelAt = (y) => {
      const o = (Math.min(y, params.rows - 1) * cols + col) * 4;
      const p = { r: data.data[o], g: data.data[o + 1], b: data.data[o + 2] };
      return this.palette ? nearestColor(p, this.palette) : p;
    };
    const top = pixelAt(2 * row), bottom = pixelAt(2 * row + 1);
    const char = charMode === 'brightness' ? brightnessChar(top, bottom, charset || '▄') : baseCells[cellIndex(col, row, cols)]?.char ?? ' ';
    return this.#onBase(col, row, buildCell(top, bottom, char, renderStyle));
  }

  // A converted cell with the base layer's pin (if any) as its character.
  #onBase(col, row, cell) {
    const pin = this.baseRecords.pins.get(cellKey(col, row));
    return pin ? { ...cell, char: pin } : cell;
  }

  // Spec "Paint and edit cells" (a trial rule, kept in this one place): the edit cell's entry
  // composes over the paint-free image, then any paint in the cell shows over it (coverCell), so
  // erasing the paint reveals the edit cell again.
  #composeOne(col, row, params, entry, baseCells) {
    const under = this.underCell(col, row, params, baseCells);
    if (!under) return baseCells[cellIndex(col, row, params.cols)];
    const cell = composeCell(under, entry, params.renderStyle, (hex) => this.effective(hex, params));
    return coverCell(cell, this.paintAt(col, 2 * row), this.paintAt(col, 2 * row + 1), {
      renderStyle: params.renderStyle,
      palette: this.palette,
    });
  }
}
