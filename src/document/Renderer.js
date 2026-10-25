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
 *
 * The base layer is at the pipeline's processing scale (m x m pixels per grid pixel), so a block of
 * the picture moved into it keeps every processed pixel (processed: the picture with its effects,
 * before the color adjustments and the palette), and it's drawn the way the pipeline draws the
 * picture: adjusted, snapped to CGA/VGA, then averaged down to the grid. It looks the same wherever
 * it goes. (Sharpen is the exception: the shader sharpens after the adjustments, from neighbors
 * that aren't adjusted, so a sharpened block can differ a little.)
 */
import { processImage, processedImage, adjustedPixels, applyQuantization, getPaletteColors } from '../lib/ImageProcessor.js';
import { applyTransforms } from '../lib/PixelTransforms.js';
import { nearestColor } from '../lib/ColorUtils.js';
import { effectiveColor } from '../lib/PixelTransforms.js';
import Canvas, { ctx2d, fitRect } from '../lib/Canvas.js';
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
  #effective = new Map(); // stored color -> displayed Color, until the next render
  #source = null;       // { key, data }: the image through the pipeline with color adjustments neutral (stored colors)
  #processed = null;    // { image, key, scale, canvas }: the processed picture in the grid at the base layer's scale (processed)
  #baseDrawn = null;    // { layer, version, key, canvas }: the base layer as drawn at grid resolution, until it or the settings change

  // Forget the previous image's canvases so nothing paints against them before the next render.
  reset() {
    this.pipelineCanvas = this.outputCanvas = this.palette = null;
    this.#pipelineData = this.#baseData = this.#paintData = this.#source = this.#processed = this.#baseDrawn = null;
    this.#effective = new Map();
  }

  // baseParams: params with the color adjustments neutral (settings.baseParams).
  async render(image, params, paintLayer, baseParams) {
    const { canvas: pipeline, paletteColors } = await processImage(image, params);
    this.pipelineCanvas = pipeline.canvas;
    this.palette = paletteColors;
    this.#pipelineData = ctx2d(this.pipelineCanvas).getImageData(0, 0, params.cols, params.rows);
    this.#effective = new Map();

    // Underlying colors depend only on the image, grid, smoothing, effects and CGA/VGA, so color
    // adjustments don't redo this.
    const sp = baseParams ?? {};
    const sourceKey = [params.cols, params.rows, JSON.stringify(params.fit), params.smoothing, sp.quantize, sp.sharpen, sp.flatten, sp.edges, sp.edgeColor, sp.edgeThickness].join();
    if (baseParams && (this.#source?.image !== image || this.#source.key !== sourceKey)) {
      const { canvas: source } = await processImage(image, baseParams);
      this.#source = { image, key: sourceKey, data: ctx2d(source.canvas).getImageData(0, 0, params.cols, params.rows) };
    }
    const scale = this.baseLayer?.scale;
    if (baseParams && scale && (this.#processed?.image !== image || this.#processed.key !== sourceKey || this.#processed.scale !== scale)) {
      this.#processed = { image, key: sourceKey, scale, canvas: await this.#processedInGrid(image, baseParams, scale) };
    }

    const output = document.createElement('canvas');
    output.width = params.cols;
    output.height = params.rows;
    ctx2d(output);
    this.outputCanvas = output;
    this.composite(paintLayer, params);
    return this.cellsFromOutput(params);
  }

  // The processed picture (see the top) where it sits in the grid, at `scale` pixels per grid pixel;
  // black around it, as the pipeline fills the letterbox. What a block of the base copies.
  get processed() {
    return this.#processed && { canvas: this.#processed.canvas, scale: this.#processed.scale };
  }

  async #processedInGrid(image, baseParams, scale) {
    const picture = await processedImage(image, baseParams, { m: scale });
    const { dx, dy } = baseParams.fit ?? fitRect(image.naturalWidth || image.width, image.naturalHeight || image.height, baseParams.cols, baseParams.rows);
    const canvas = document.createElement('canvas');
    canvas.width = baseParams.cols * scale;
    canvas.height = baseParams.rows * scale;
    const ctx = ctx2d(canvas);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(picture, dx * scale, dy * scale);
    return canvas;
  }

  // The generated cells from the composited output (no edit cells, no pins: each has the converter's
  // own character, which a pin covers only while it's there): quantized to the palette, which also
  // gives the pixels their palette index (c), which the cells and CGA/VGA export rely on.
  cellsFromOutput(params) {
    const pixels = new Canvas(this.outputCanvas);
    if (this.palette) applyQuantization(pixels, this.palette);
    else pixels.loadPixels();

    return buildCells(pixels.pixels, params.cols, params.rows, {
      charset: params.chars,
      charMode: params.charMode || 'random',
      renderStyle: params.renderStyle || 'ansi',
      seed: params.seed,
    });
  }

  // Redraw outputCanvas: the pipeline image, then the base layer's pixels and the paint layer, each
  // with the color transforms applied. The Number palette (quantize 'count') is picked from what
  // that shows, so the drawing's colors have places in it; true when that changed the palette
  // (every cell may need its colors again, not just those under the change). hold: an edit is open
  // and the Number palette waits for it to end; meanwhile the paint shows in its own colors
  // (updateCells).
  composite(paintLayer, params, { hold = false } = {}) {
    if (!this.outputCanvas || !this.pipelineCanvas) return false;

    const ctx = ctx2d(this.outputCanvas);
    const w = this.outputCanvas.width, h = this.outputCanvas.height;

    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(this.pipelineCanvas, 0, 0, w, h);

    if (this.baseLayer?.hasPaint) this.#drawBase(ctx, this.baseLayer, params);
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
    this.#effective = new Map(); // displayed colors snap to the palette
    return true;
  }

  // The base layer drawn the way the pipeline draws the picture: every pixel through the shader's
  // color transforms and CGA/VGA snap (adjustedPixels), then each grid pixel's block averaged as
  // Canvas.drawManual averages, or with Low smoothing its nearest pixel as the pipeline's drawImage
  // picks it. Cached: a stroke recomposites on every move, and the base doesn't change under it.
  #drawBase(ctx, layer, params) {
    const w = this.outputCanvas.width, h = this.outputCanvas.height, k = layer.scale;
    const palette = (params.quantize === 'cga' || params.quantize === 'vga') && this.palette?.length ? this.palette : null;
    const key = [w, h, params.smoothing, palette && params.quantize, ...COLOR_KEYS.map(key => params[key])].join();
    const drawn = this.#baseDrawn;
    if (drawn?.layer !== layer || drawn.version !== layer.version || drawn.key !== key) {
      const full = document.createElement('canvas');
      full.width = w * k;
      full.height = h * k;
      const fullCtx = ctx2d(full);
      fullCtx.drawImage(layer.canvas, 0, 0, w * k, h * k, 0, 0, w * k, h * k); // the grid's part (a layer can reach past it)
      const pixels = fullCtx.getImageData(0, 0, w * k, h * k);
      if (palette || transforms(params)) pixels.data.set(adjustedPixels(full, params));
      const d = pixels.data;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const gridCtx = ctx2d(canvas);
      if (params.smoothing === 'low') {
        fullCtx.putImageData(pixels, 0, 0);
        gridCtx.imageSmoothingEnabled = false;
        gridCtx.drawImage(full, 0, 0, w * k, h * k, 0, 0, w, h);
      } else {
        gridCtx.putImageData(averaged(d, w, h, k, params.smoothing === 'medium' ? 2 : 1), 0, 0);
      }
      this.#baseDrawn = { layer, version: layer.version, key, canvas };
    }
    ctx.drawImage(this.#baseDrawn.canvas, 0, 0);
  }

  // Draw a layer at grid resolution (a grid pixel at a time) with the color transforms applied;
  // returns the transformed pixels.
  #drawLayer(ctx, layer, params) {
    const w = this.outputCanvas.width, h = this.outputCanvas.height;
    const needsTransform = transforms(params);

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
      // Quantize only the touched pixels instead of the entire canvas (held paint keeps its colors)
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

  // A painted grid pixel's color before the palette snap, while a stroke is held; else null.
  #held(x, y, cols) {
    if (!this.#heldData || !this.paintAt(x, y)) return null;
    const o = (y * cols + x) * 4, d = this.#heldData;
    return { r: d[o], g: d[o + 1], b: d[o + 2], a: 1 };
  }

  // Generated cells with the base's pins and every in-grid edit cell composed in.
  composeAll(baseCells, editCells, params) {
    const cells = baseCells.slice();
    const rows = charRowsOf(params.rows);
    for (const key of this.baseRecords.pins.keys()) {
      const { col, row } = parseKey(key);
      if (col < params.cols && row < rows) cells[cellIndex(col, row, params.cols)] = this.#onBase(col, row, cells[cellIndex(col, row, params.cols)]);
    }
    for (const [key, entry] of editCells) {
      const { col, row } = parseKey(key);
      if (col < params.cols && row < rows) cells[cellIndex(col, row, params.cols)] = this.#composeOne(col, row, params, entry, baseCells);
    }
    return cells;
  }

  // A stored color as it displays: color adjustments, then the active palette.
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

  // An edit cell and paint in the same cell: the edit cell's entry composes over the paint-free
  // image, then any paint in the cell shows over it (coverCell), so erasing the paint reveals the edit
  // cell again. (A rule chosen to try out; it lives only here, so it's one place to change.)
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

// The color settings a layer is drawn with.
const COLOR_KEYS = ['brightness', 'contrast', 'saturation', 'hue', 'invert', 'colorize', 'colorizeStrength'];

// Whether any color transform is off neutral.
function transforms(params) {
  return parseFloat(params.brightness) !== 100 || parseFloat(params.contrast) !== 100 || parseFloat(params.saturation) !== 100
    || parseFloat(params.hue) !== 0 || parseFloat(params.invert) !== 0 || parseFloat(params.colorizeStrength) !== 0;
}

// RGBA pixels w*k x h*k averaged to w x h, a k x k block per pixel (every step-th pixel, as
// Canvas.drawManual samples), colors weighted by alpha so an empty pixel adds nothing.
function averaged(d, w, h, k, step) {
  const out = new ImageData(w, h), o = out.data, rowLength = w * k;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y * k; sy < (y + 1) * k; sy += step) {
        for (let sx = x * k; sx < (x + 1) * k; sx += step) {
          const i = (sy * rowLength + sx) * 4, al = d[i + 3];
          r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al;
          n++;
        }
      }
      if (!a) continue;
      const j = (y * w + x) * 4;
      o[j] = Math.round(r / a); o[j + 1] = Math.round(g / a); o[j + 2] = Math.round(b / a); o[j + 3] = Math.round(a / n);
    }
  }
  return out;
}
