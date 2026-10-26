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
import { processImage, processedImage, adjustedPixels, getPaletteColors, workingScale } from '../lib/ImageProcessor.js';
import { applyTransforms } from '../lib/PixelTransforms.js';
import { nearestColor, paletteIndex } from '../lib/ColorUtils.js';
import { effectiveColor } from '../lib/PixelTransforms.js';
import Canvas, { ctx2d, fitRect } from '../lib/Canvas.js';
import { buildCellsFromBytes, buildCell, brightnessChar, cellIndex, cellOfPixel, charRowsOf, composeCell, coverCell } from '../lib/Cells.js';
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
  #snapped = null;      // the whole output's bytes and palette entries, from the composite that just snapped it
  #effective = new Map(); // stored color -> displayed Color, until the next render
  #source = null;       // { key, data }: the image through the pipeline with color adjustments neutral (stored colors)
  #processed = null;    // { image, key, scale, canvas }: the processed picture in the grid at the base layer's scale (processed)
  #baseDrawn = null;    // { layer, version, key, data, canvas }: the base layer as drawn at grid resolution (#baseGrid)
  #baseStored = null;   // the same for its stored colors (#baseGrid, stored)
  #baseParams = null;   // the last render's baseParams

  // Forget the previous image's canvases so nothing paints against them before the next render.
  reset() {
    this.pipelineCanvas = this.outputCanvas = this.palette = null;
    this.#pipelineData = this.#baseData = this.#paintData = this.#source = this.#processed = this.#baseDrawn = this.#baseStored = this.#baseParams = this.#snapped = null;
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
    this.#baseParams = baseParams;
    const sp = baseParams ?? {};
    const sourceKey = [params.cols, params.rows, JSON.stringify(params.fit), params.smoothing, sp.quantize, sp.sharpen, sp.flatten, sp.edges, sp.edgeColor, sp.edgeThickness].join();
    if (baseParams && (this.#source?.image !== image || this.#source.key !== sourceKey)) {
      const { canvas: source } = await processImage(image, baseParams);
      this.#source = { image, key: sourceKey, data: ctx2d(source.canvas).getImageData(0, 0, params.cols, params.rows) };
    }
    const scale = this.baseLayer?.scale;
    if (baseParams && scale && (this.#processed?.image !== image || this.#processed.key !== sourceKey || this.#processed.scale !== scale)) {
      // An image smaller than the grid is processed at its own size and scaled up: there are no
      // whole processed pixels per grid pixel, and the stored colors (#source) are what shows.
      const canvas = workingScale(image, params) ? await this.#processedInGrid(image, baseParams, scale) : this.#sourceCanvas();
      this.#processed = { image, key: sourceKey, scale, canvas };
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

  #sourceCanvas() {
    const { data } = this.#source;
    const canvas = document.createElement('canvas');
    canvas.width = data.width;
    canvas.height = data.height;
    ctx2d(canvas).putImageData(data, 0, 0);
    return canvas;
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
  // The output's bytes are read once and snapped in place (no object per pixel: this runs over the
  // whole grid on every render and slider step).
  cellsFromOutput(params) {
    const { data, indexes } = this.#snapped ?? snapToPalette(this.outputCanvas, this.palette);
    return buildCellsFromBytes(data, params.cols, params.rows, {
      charset: params.chars,
      charMode: params.charMode || 'random',
      renderStyle: params.renderStyle || 'ansi',
      seed: params.seed,
    }, indexes && { indexes, palette: this.palette });
  }

  // Redraw outputCanvas: the pipeline image, then the base layer's pixels and the paint layer, each
  // with the color transforms applied. The Number palette (quantize 'count') is picked from what
  // that shows, so the drawing's colors have places in it; true when that changed the palette
  // (every cell may need its colors again, not just those under the change). hold: an edit is open
  // and the Number palette waits for it to end; meanwhile the paint shows in its own colors
  // (updateCells). rect: the grid pixels an edit changed ({ x, y, w, h }), the only ones redrawn
  // when what's kept from the last composite still fits (not when the Number palette is picked
  // again: that can change every pixel).
  composite(paintLayer, params, { hold = false, rect = null } = {}) {
    if (!this.outputCanvas || !this.pipelineCanvas) return false;

    const ctx = ctx2d(this.outputCanvas);
    const w = this.outputCanvas.width, h = this.outputCanvas.height;
    const base = !!this.baseLayer?.hasPaint, fits = (data) => data?.width === w && data.height === h;
    const partial = !!rect && !(params.quantize === 'count' && !hold) && this.pipelineCanvas.width === w && this.pipelineCanvas.height === h
      && (base ? fits(this.#baseData) && this.#baseData !== this.#pipelineData : true)
      && (!paintLayer || fits(this.#paintData)) && (!hold || this.#heldData?.length === w * h * 4);
    const area = partial ? clipped(rect, w, h) : { x: 0, y: 0, w, h };
    if (!area.w || !area.h) return false; // nothing on the grid changed
    const { x, y } = area;

    ctx.fillStyle = 'black';
    ctx.fillRect(x, y, area.w, area.h);
    ctx.drawImage(this.pipelineCanvas, x, y, area.w, area.h, x, y, area.w, area.h);

    if (base) this.#drawBase(ctx, this.baseLayer, params, area);
    if (!base) this.#baseData = this.#pipelineData;
    else if (partial) putRows(this.#baseData.data, w, ctx.getImageData(x, y, area.w, area.h).data, area);
    else this.#baseData = ctx.getImageData(0, 0, w, h);

    this.#paintData = paintLayer ? this.#drawLayer(ctx, paintLayer, params, partial ? area : null) : null;
    const changed = !hold && params.quantize === 'count' && this.#recount(params);
    if (!hold) this.#heldData = null;
    else if (partial) putRows(this.#heldData, w, ctx.getImageData(x, y, area.w, area.h).data, area);
    else this.#heldData = ctx.getImageData(0, 0, w, h).data;
    this.#snapped = paintLayer && this.palette?.length ? snapToPalette(this.outputCanvas, this.palette, area) : null;
    if (partial) this.#snapped = null; // only the area's
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

  // The base layer at grid resolution, the way the pipeline draws the picture: every pixel through
  // the color transforms or, with CGA/VGA, through the shader's adjustments and snap
  // (adjustedPixels: a moved block of the picture is snapped as the picture is), then each grid
  // pixel's block averaged as Canvas.drawManual averages, or with Low smoothing its nearest pixel as
  // the pipeline's drawImage picks it. A pixel that's partly see-through (soft paint merged down)
  // isn't snapped: it's blended over the picture and the output's palette snap takes it, as paint.
  // stored: with the color adjustments neutral (baseParams), the colors the base stands for; a
  // block of one color is that color (an exact pixel stays exact), one that isn't (a moved block of
  // the picture) is snapped, then averaged, as the picture's own stored colors are (#source).
  // Cached: a stroke recomposites on every move, and the base doesn't change under it; when it does
  // (an erase, a move), only the grid pixels over what changed are worked out again.
  #baseGrid(layer, params, stored = false) {
    const w = this.outputCanvas.width, h = this.outputCanvas.height, k = layer.scale;
    const palette = (params.quantize === 'cga' || params.quantize === 'vga') && this.palette?.length ? this.palette : null;
    const key = [w, h, params.smoothing, palette && params.quantize, ...COLOR_KEYS.map(key => params[key])].join();
    const cached = stored ? this.#baseStored : this.#baseDrawn;
    const same = cached?.layer === layer && cached.key === key;
    if (same && cached.version === layer.version) return cached;

    // With Low smoothing the grid is the browser's nearest-pixel scaling of the whole layer, which a
    // part of it doesn't reproduce exactly: that's worked out whole.
    const changed = same && params.smoothing !== 'low' && layer.changedSince(cached.version);
    const area = changed ? gridRectOf(changed, k, w, h) : { x: 0, y: 0, w, h };
    const result = changed ? cached : { layer, key, data: new ImageData(w, h), canvas: null };
    if (area.w && area.h) {
      const part = baseGridPart(layer, params, palette, area, stored);
      putRows(result.data.data, w, part.data, area);
      if (result.canvas) ctx2d(result.canvas).putImageData(result.data, 0, 0, area.x, area.y, area.w, area.h);
    }
    result.version = layer.version;
    if (stored) this.#baseStored = result;
    else this.#baseDrawn = result;
    return result;
  }

  #drawBase(ctx, layer, params, { x, y, w, h }) {
    const drawn = this.#baseGrid(layer, params);
    if (!drawn.canvas) {
      drawn.canvas = Object.assign(document.createElement('canvas'), { width: drawn.data.width, height: drawn.data.height });
      ctx2d(drawn.canvas).putImageData(drawn.data, 0, 0);
    }
    ctx.drawImage(drawn.canvas, x, y, w, h, x, y, w, h);
  }

  // The base layer's own color at grid pixel (x, y) as stored (before adjustments; see #baseGrid),
  // with its alpha (0..1), or null where it has none.
  baseStoredAt(x, y) {
    if (!this.baseLayer?.hasPaint || !this.outputCanvas || !this.#baseParams) return null;
    const { data } = this.#baseGrid(this.baseLayer, this.#baseParams, true);
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return null;
    const o = (y * data.width + x) * 4, p = data.data;
    return p[o + 3] ? { r: p[o], g: p[o + 1], b: p[o + 2], a: p[o + 3] / 255 } : null;
  }

  // Draw a layer at grid resolution (a grid pixel at a time) with the color transforms applied;
  // returns the transformed pixels. area: only those grid pixels (the rest of #paintData stays).
  #drawLayer(ctx, layer, params, area = null) {
    const w = this.outputCanvas.width, h = this.outputCanvas.height, k = layer.scale;
    const { x, y, w: aw, h: ah } = area ?? { x: 0, y: 0, w, h };

    // Persistent scratch canvas for downsampling and transforming a layer
    if (!this.#scratch) this.#scratch = document.createElement('canvas');
    if (this.#scratch.width !== w || this.#scratch.height !== h) {
      this.#scratch.width = w;
      this.#scratch.height = h;
    }

    const scratchCtx = ctx2d(this.#scratch);
    scratchCtx.clearRect(x, y, aw, ah);
    scratchCtx.imageSmoothingEnabled = false;
    scratchCtx.drawImage(layer.canvas, x * k, y * k, aw * k, ah * k, x, y, aw, ah); // the grid's part (a layer can reach past it)

    const pixels = scratchCtx.getImageData(x, y, aw, ah);
    if (transforms(params)) {
      applyTransforms(pixels.data, params.brightness, params.contrast, params.saturation, params.hue, params.invert, params.colorize, params.colorizeStrength);
      scratchCtx.putImageData(pixels, x, y);
    }
    ctx.drawImage(this.#scratch, x, y, aw, ah, x, y, aw, ah);
    if (!area) return pixels;
    putRows(this.#paintData.data, w, pixels.data, area);
    return this.#paintData;
  }

  // Rebuild only the cells under the given grid pixels from the (already composited) output canvas.
  // baseCells (the last full render) supplies a cell's character in random mode.
  updateCells(cells, pixels, params, editCells, baseCells) {
    if (!this.outputCanvas || !pixels.length) return cells;
    const next = cells.slice();
    const { cols, chars: charset, charMode, renderStyle } = params;
    const done = new Set();
    const pixelAt = this.#outputPixels(pixels);

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

      let top = pixelAt(col, 2 * row);
      if (!top) continue; // output canvas from an older grid size
      let bottom = pixelAt(col, 2 * row + 1) || top;
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

  // The output's pixels under the cells of these grid pixels, read once as one rect (an edit's
  // area, not the whole grid): (x, y) -> { r, g, b, a }, or undefined off the output.
  #outputPixels(pixels) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const { x, y } of pixels) {
      const row = Math.floor(y / 2);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, 2 * row); y1 = Math.max(y1, 2 * row + 1);
    }
    const { width, height } = this.outputCanvas;
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(width - 1, x1); y1 = Math.min(height - 1, y1);
    if (x0 > x1 || y0 > y1) return () => undefined;
    const w = x1 - x0 + 1, { data } = ctx2d(this.outputCanvas).getImageData(x0, y0, w, y1 - y0 + 1);
    return (x, y) => {
      if (x < x0 || x > x1 || y < y0 || y > y1) return undefined;
      const o = ((y - y0) * w + (x - x0)) * 4;
      return { r: data[o], g: data[o + 1], b: data[o + 2], a: data[o + 3] / 255 };
    };
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

// A canvas's pixels snapped to a palette in place, read and written once as bytes (no object per
// pixel: this runs over the whole output). Returns its bytes and each pixel's palette entry, or
// indexes null with no palette.
function snapToPalette(canvas, palette, { x, y, w, h } = { x: 0, y: 0, w: canvas.width, h: canvas.height }) {
  const ctx = ctx2d(canvas), image = ctx.getImageData(x, y, w, h), data = image.data;
  if (!palette?.length) return { data, indexes: null };
  const indexes = new Uint16Array(w * h);
  let last = -1, k = 0; // a pixel the color of the one before it (most are) skips the lookup
  for (let i = 0, o = 0; i < indexes.length; i++, o += 4) {
    const rgb = data[o] << 16 | data[o + 1] << 8 | data[o + 2];
    if (rgb !== last) k = paletteIndex(data[o], data[o + 1], data[o + 2], palette), last = rgb;
    indexes[i] = k;
    data[o] = palette[k].r; data[o + 1] = palette[k].g; data[o + 2] = palette[k].b;
    data[o + 3] ||= 255; // as Canvas.writePixels writes a see-through pixel
  }
  ctx.putImageData(image, x, y);
  return { data, indexes };
}

// A rect ({ x, y, w, h }) of rows (RGBA bytes, rect.w wide) put into a width-wide image's bytes.
function putRows(target, width, rows, { x, y, w, h }) {
  for (let row = 0; row < h; row++) target.set(rows.subarray(row * w * 4, (row + 1) * w * 4), ((y + row) * width + x) * 4);
}

// A rect clipped to a w x h grid.
function clipped(rect, w, h) {
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  return { x, y, w: Math.max(0, Math.min(w, rect.x + rect.w) - x), h: Math.max(0, Math.min(h, rect.y + rect.h) - y) };
}

// The grid pixels (w x h) over a rect of a layer at k pixels per grid pixel.
function gridRectOf(rect, k, w, h) {
  const x = Math.floor(rect.x / k), y = Math.floor(rect.y / k);
  return clipped({ x, y, w: Math.ceil((rect.x + rect.w) / k) - x, h: Math.ceil((rect.y + rect.h) / k) - y }, w, h);
}

// The base layer at grid resolution over area (#baseGrid has the why of each step).
function baseGridPart(layer, params, palette, area, stored) {
  const k = layer.scale, w = area.w, h = area.h;
  const full = document.createElement('canvas');
  full.width = w * k;
  full.height = h * k;
  const fullCtx = ctx2d(full);
  fullCtx.drawImage(layer.canvas, area.x * k, area.y * k, w * k, h * k, 0, 0, w * k, h * k);
  const raw = fullCtx.getImageData(0, 0, w * k, h * k).data;
  const pixels = new ImageData(new Uint8ClampedArray(raw), w * k, h * k), d = pixels.data;
  if (transforms(params)) applyTransforms(d, params.brightness, params.contrast, params.saturation, params.hue, params.invert, params.colorize, params.colorizeStrength);
  if (palette) {
    const snapped = adjustedPixels(full, params);
    for (let i = 0; i < d.length; i += 4) {
      if (raw[i + 3] === 255) d.set(snapped.subarray(i, i + 3), i);
    }
  }
  let data;
  if (params.smoothing === 'low') {
    fullCtx.putImageData(pixels, 0, 0);
    const nearest = ctx2d(Object.assign(document.createElement('canvas'), { width: w, height: h }));
    nearest.imageSmoothingEnabled = false;
    nearest.drawImage(full, 0, 0, w * k, h * k, 0, 0, w, h);
    data = nearest.getImageData(0, 0, w, h);
  } else {
    data = averaged(d, w, h, k, params.smoothing === 'medium' ? 2 : 1);
  }
  if (stored) keepUniform(data, raw, w, h, k);
  return data;
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

// Where a k x k block of raw (w*k x h*k) is one color, that color in the w x h grid data.
function keepUniform(data, raw, w, h, k) {
  const rowLength = w * k, o = data.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const first = (y * k * rowLength + x * k) * 4;
      let uniform = true;
      for (let sy = y * k; uniform && sy < (y + 1) * k; sy++) {
        for (let sx = x * k; sx < (x + 1) * k; sx++) {
          const i = (sy * rowLength + sx) * 4;
          if (raw[i] !== raw[first] || raw[i + 1] !== raw[first + 1] || raw[i + 2] !== raw[first + 2] || raw[i + 3] !== raw[first + 3]) {
            uniform = false;
            break;
          }
        }
      }
      if (uniform) o.set(raw.subarray(first, first + 4), (y * w + x) * 4);
    }
  }
}
