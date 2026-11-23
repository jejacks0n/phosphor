/**
 * The paint layer: a transparent canvas covering the grid (and, after a canvas resize shrank the
 * grid, what's past its right and bottom edges) at an integer number of pixels per grid cell
 * (scale), so each cell is a whole scale x scale block. cols x rows is the layer's extent. Cell bounds use the same
 * floor partition as the pipeline's box filter (Canvas.drawManual), so paint never bleeds into
 * neighboring cells once merged.
 *
 * Rect = { x, y, w, h } in layer pixels. Grid pixels are the cols x rows pipeline pixels.
 *
 * While a stroke is being recorded, the first time paint/erase touches a 64px tile its prior
 * pixels are saved; endStroke() returns those tiles with their new pixels as an undoable patch.
 * strokeSlice() hands over what's changed so far and saves on from there, so before is then "as of the
 * last slice"; writeRuns (another's change, written mid-stroke) goes in the saved copy too, so what they
 * wrote is never part of the stroke.
 * LayerPatch = { tiles: { x, y, w, h, before: ImageData, after: ImageData }[], hadPaint, hasPaint }
 */
import { ctx2d, canvasPng, flatBlock } from '../lib/Canvas.js';
import { rgb2hex } from '../lib/ColorUtils.js';
import { eachPixel } from './changes.js';
import { TILE, tilesForRect } from './History.js';

export const MAX_LAYER_DIM = 4000;

// Integer paint pixels per grid cell: at least the image's own resolution, capped so neither side exceeds
// MAX_LAYER_DIM, but never below 1 (a grid longer than MAX_LAYER_DIM gets a layer that long).
export function editScaleFor(sw, sh, cols, rows) {
  const wanted = Math.ceil(Math.max(sw / Math.max(1, cols), sh / Math.max(1, rows)));
  return Math.max(1, Math.min(wanted, Math.floor(MAX_LAYER_DIM / Math.max(cols, rows))));
}

// Where old grid content lands in a new grid, in grid units, given where the image sat in each.
export function resizeTransform(oldFit, newFit) {
  const scaleX = newFit.dw / oldFit.dw;
  const scaleY = newFit.dh / oldFit.dh;
  return { offsetX: newFit.dx - oldFit.dx * scaleX, offsetY: newFit.dy - oldFit.dy * scaleY, scaleX, scaleY };
}

// Where a saved paint PNG goes on load, for files saved before the paint scale was: those stored
// the grid-sized layer, or (older still) paint at the source image's size, aligned to the image
// (which sits at `fit`). Current saves are the whole layer at its scale.
export function savedPaintRect(paint, image, fit, scale, layerWidth, layerHeight) {
  if (paint.width === image.width && paint.height === image.height) {
    return { x: fit.dx * scale, y: fit.dy * scale, w: fit.dw * scale, h: fit.dh * scale };
  }
  return { x: 0, y: 0, w: layerWidth, h: layerHeight };
}

const newCanvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
};

export default class PaintLayer {
  #stroke = null; // { tiles: Map<'x,y', { x, y, w, h, before }>, touched: Set<'x,y'>, hadPaint, erased } while recording
  version = 0;    // goes up with every change to the pixels (what's drawn from them can be cached)
  #changes = [];  // the latest changes: { version, rect } (layer pixels, null for all of it), for changedSince

  // smooth: a grid resize resamples smoothly (paint) or keeps hard pixel edges (the base layer's pixels).
  constructor({ cols, rows, scale, smooth = true }) {
    this.cols = cols;
    this.rows = rows;
    this.scale = scale;
    this.smooth = smooth;
    this.canvas = newCanvas(cols * scale, rows * scale);
    this.hasPaint = false;
  }

  // Layer-pixel rect of grid pixel (x, y), or null when it falls outside the layer.
  #cellRect(x, y) {
    const k = this.scale;
    const rx = Math.floor(x * k), ry = Math.floor(y * k);
    if (rx < 0 || ry < 0 || rx >= this.canvas.width || ry >= this.canvas.height) return null;
    return { x: rx, y: ry, w: Math.max(1, Math.floor((x + 1) * k) - rx), h: Math.max(1, Math.floor((y + 1) * k) - ry) };
  }

  // A grid pixel's paint is the average of its block of layer pixels (alpha-weighted color, mean alpha): what every read
  // of the layer at grid resolution gives (pixelAt, gridPixels, the Renderer's drawing of it), so paint drawn finer than
  // the grid (a shape merged down at its own detail) shows and reads as its average, as a vector layer's shapes do, and
  // paint laid a block at a time (the Brush's) reads back exactly. data: the layer pixels of a rect, from (x, y) in it.
  static average(data, width, x, y, w, h) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        const o = (py * width + px) * 4, al = data[o + 3];
        if (!al) continue;
        r += data[o] * al; g += data[o + 1] * al; b += data[o + 2] * al; a += al;
      }
    }
    if (!a) return null;
    return { r: Math.round(r / a), g: Math.round(g / a), b: Math.round(b / a), a: a / (w * h) / 255 };
  }

  // How many grid pixels hold each paint color, sampled one per grid pixel. Only (nearly) opaque
  // paint counts: soft edges and overlaps blend into one-off colors nobody picked.
  // ponytail: skips paint laid at under ~98% brush opacity; bucket it by color if that matters.
  colorCounts() {
    const counts = new Map();
    if (!this.hasPaint) return counts;
    const { data } = this.gridPixels();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 250) continue;
      const hex = rgb2hex({ r: data[i], g: data[i + 1], b: data[i + 2] });
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    return counts;
  }

  // The whole layer a grid pixel at a time, as the Renderer draws it (average): an ImageData cols x rows.
  gridPixels() {
    const { width, height } = this.canvas, { data } = ctx2d(this.canvas).getImageData(0, 0, width, height), out = new ImageData(this.cols, this.rows);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const rect = this.#cellRect(x, y), p = rect && PaintLayer.average(data, width, rect.x, rect.y, rect.w, rect.h);
        if (!p) continue;
        const o = (y * this.cols + x) * 4;
        out.data[o] = p.r; out.data[o + 1] = p.g; out.data[o + 2] = p.b; out.data[o + 3] = Math.round(p.a * 255);
      }
    }
    return out;
  }

  // Replace the layer with gridPixels' kind of image, each grid pixel a whole block. Unlike load, never smooths.
  loadGrid(image) {
    const grid = newCanvas(image.width, image.height);
    ctx2d(grid).putImageData(image, 0, 0);
    const ctx = ctx2d(this.canvas);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(grid, 0, 0, image.width * this.scale, image.height * this.scale);
    this.hasPaint = false;
    for (let i = 3; i < image.data.length && !this.hasPaint; i += 4) this.hasPaint = !!image.data[i];
    this.#changed(null);
  }

  // pixels: { x, y, r, g, b, alpha }[] in grid pixels. Paint builds up to `opacity`, then blends. With
  // stack, `opacity` is what one stroke (beginStroke to endStroke; outside one, this call) lays at
  // most, on top of what's there: strokes stack, as layers do, so two at 50% make it 75%.
  // Over a pixel with paint when a stroke reaches it (opaque: the base's, all of them, or a layer's solid paint; with
  // stack, any), the stroke builds up as it would on clear pixels (own: its paint, by cell rect) and is laid over what
  // the pixel was before it (beneath: per 64-pixel tile, its RGBA, the alpha + 1 so 0 is unsaved), so a stroke shows the
  // same on the base, or on a layer's paint, as on a layer over it; each dab blended into the opaque pixel made it
  // dimmer, and over paint partly see-through the alphas added up, hiding the picture under more than a layer does.
  paint(pixels, opacity = 100, stack = false) {
    const rects = [];
    for (const { x, y, r, g, b, alpha } of pixels) {
      const rect = this.#cellRect(x, y);
      if (rect) rects.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, r, g, b, a: Math.round(alpha * 255) });
    }
    if (!rects.length) return null;
    this.hasPaint = true;

    const bounds = unionRect(rects);
    this.#changed(bounds);
    this.#record(bounds);
    const ctx = ctx2d(this.canvas);
    const imageData = ctx.getImageData(bounds.x, bounds.y, bounds.w, bounds.h);
    const data = imageData.data;
    const maxA = Math.round((opacity / 100) * 255);
    const ceiling = stack ? 255 : maxA;
    const laid = this.#stroke?.laid ?? new Map(); // with stack: the alpha this stroke has added to each cell rect
    const own = this.#stroke?.own, beneath = this.#stroke?.beneath;
    let saved = null, savedKey = -1; // beneath's block for the tile last painted

    for (const { x: cx, y: cy, w: cw, h: ch, r, g, b, a } of rects) {
      if (a === 0) continue;
      const key = cx + cy * 65536, added = laid.get(key) ?? 0;
      const adds = stack ? Math.min(a, maxA - added) : a, weight = stack ? adds : a; // the new color's share
      if (stack && adds > 0) laid.set(key, added + adds);
      // The stroke's own paint in this rect, as on clear pixels: begun where the rect had paint (without stack, opaque
      // paint: Opacity is a ceiling on the layer's paint) when a dab first came.
      const first = ((cy - bounds.y) * bounds.w + (cx - bounds.x)) * 4;
      let mine = own?.get(key) ?? null; // null: the rect was clear at the first dab, and the stroke's paint is the pixels
      if (own && !own.has(key)) own.set(key, mine = data[first + 3] === 255 || (stack && data[first + 3]) ? { r, g, b, a: 0 } : null);
      if (mine) {
        if (adds <= 0 || mine.a >= ceiling) {
          const blend = Math.min(1, a / 255);
          mine.r += (r - mine.r) * blend;
          mine.g += (g - mine.g) * blend;
          mine.b += (b - mine.b) * blend;
        } else {
          const below = mine.a * (255 - weight) / 255;
          mine.r = (mine.r * below + r * weight) / (weight + below);
          mine.g = (mine.g * below + g * weight) / (weight + below);
          mine.b = (mine.b * below + b * weight) / (weight + below);
          mine.a = Math.min(ceiling, mine.a + adds);
        }
      }
      for (let py = cy; py < cy + ch; py++) {
        for (let px = cx; px < cx + cw; px++) {
          const idx = ((py - bounds.y) * bounds.w + (px - bounds.x)) * 4;
          const existingA = data[idx + 3];
          if (mine) {
            const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE), tileKey = tx + ty * 65536;
            if (tileKey !== savedKey) {
              savedKey = tileKey;
              saved = beneath.get(tileKey);
              if (!saved) beneath.set(tileKey, saved = new Uint16Array(TILE * TILE * 4));
            }
            const s = ((py - ty * TILE) * TILE + (px - tx * TILE)) * 4;
            if (!saved[s + 3]) { saved[s] = data[idx]; saved[s + 1] = data[idx + 1]; saved[s + 2] = data[idx + 2]; saved[s + 3] = existingA + 1; }
            // Its paint over what was there, as a layer's over the one under it.
            const under = (saved[s + 3] - 1) * (255 - mine.a) / 255, total = mine.a + under;
            if (!total) continue;
            data[idx + 3] = Math.round(total);
            data[idx]     = Math.round((mine.r * mine.a + saved[s] * under) / total);
            data[idx + 1] = Math.round((mine.g * mine.a + saved[s + 1] * under) / total);
            data[idx + 2] = Math.round((mine.b * mine.a + saved[s + 2] * under) / total);
          } else if (adds <= 0 || existingA >= ceiling) {
            // The paint is as opaque as it gets, or the stroke has laid its opacity: the color blends in.
            const blend = Math.min(1, a / 255);
            data[idx]     = Math.round(data[idx]     + (r - data[idx])     * blend);
            data[idx + 1] = Math.round(data[idx + 1] + (g - data[idx + 1]) * blend);
            data[idx + 2] = Math.round(data[idx + 2] + (b - data[idx + 2]) * blend);
          } else {
            // The alpha adds up; the color is the new over the old, which shows only through what the
            // new doesn't cover (a shape laid fully over a soft edge hides it).
            const under = existingA * (255 - weight) / 255;
            data[idx + 3] = Math.min(ceiling, existingA + adds);
            data[idx]     = Math.round((data[idx]     * under + r * weight) / (weight + under));
            data[idx + 1] = Math.round((data[idx + 1] * under + g * weight) / (weight + under));
            data[idx + 2] = Math.round((data[idx + 2] * under + b * weight) / (weight + under));
          }
        }
      }
    }
    ctx.putImageData(imageData, bounds.x, bounds.y);
    return bounds;
  }

  // pixels: { x, y, r, g, b, a }[] in grid pixels, a 0..1: each set to exactly that color and alpha, whatever was there
  // (Retouch on a layer's own paint), recorded as paint is. An a of 0 clears it.
  put(pixels) {
    const rects = [];
    for (const { x, y, r, g, b, a } of pixels) {
      const rect = this.#cellRect(x, y);
      if (rect) rects.push({ ...rect, rgba: [r, g, b, Math.round(a * 255)] });
    }
    if (!rects.length) return null;
    const bounds = unionRect(rects), clears = rects.some(({ rgba }) => !rgba[3]);
    this.#changed(bounds);
    this.#record(bounds, { erasing: clears });
    const ctx = ctx2d(this.canvas), image = ctx.getImageData(bounds.x, bounds.y, bounds.w, bounds.h), { data } = image;
    for (const { x, y, w, h, rgba } of rects) {
      for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) data.set(rgba, ((py - bounds.y) * bounds.w + px - bounds.x) * 4);
    }
    ctx.putImageData(image, bounds.x, bounds.y);
    if (rects.some(({ rgba }) => rgba[3])) this.hasPaint = true;
    else if (!this.#stroke) this.recheckPaint();
    return bounds;
  }

  // pixels: { x, y, alpha? }[] in grid pixels.
  // Erases (and records) nothing where there's no paint, so a pass over bare cells isn't an undo step. alpha (0..1, a
  // soft eraser's stamp): how much of the paint's alpha it takes, as paint() adds it, each stamp at least a step so a
  // faint one still gets to nothing; without one, all of it.
  erase(pixels) {
    const rects = [];
    for (const { x, y, alpha = 1 } of pixels) {
      const rect = this.#cellRect(x, y);
      if (rect) rects.push({ ...rect, a: Math.max(1, Math.round(alpha * 255)) });
    }
    if (!rects.length || !this.hasPaint) return null;
    const bounds = unionRect(rects);
    if (!this.#anyPaint(bounds)) return null;
    this.#record(bounds, { erasing: true });
    this.#changed(bounds);
    const ctx = ctx2d(this.canvas);
    if (rects.every(({ a }) => a >= 255)) {
      for (const { x, y, w, h } of rects) ctx.clearRect(x, y, w, h);
      return bounds;
    }
    const image = ctx.getImageData(bounds.x, bounds.y, bounds.w, bounds.h), { data } = image;
    for (const { x, y, w, h, a } of rects) {
      for (let py = y; py < y + h; py++) {
        for (let px = x; px < x + w; px++) {
          const at = ((py - bounds.y) * bounds.w + (px - bounds.x)) * 4 + 3;
          data[at] = Math.max(0, data[at] - a);
        }
      }
    }
    ctx.putImageData(image, bounds.x, bounds.y);
    return bounds;
  }

  // Raw paint at grid pixel (x, y) with its alpha (0..1): its block's average, or null where there's none.
  pixelAt(x, y) {
    const rect = this.#cellRect(x, y);
    if (!rect) return null;
    return PaintLayer.average(this.#pixels(), this.canvas.width, rect.x, rect.y, rect.w, rect.h);
  }

  // The layer's pixels as read back, kept and caught up only where they changed since (changedSince), so reads a pixel at
  // a time (Merge down's, a fill's walls) cost one getImageData, not one each. ponytail: a copy the canvas's size (16 MB
  // at 2000×2000); drop it when idle if memory matters.
  #read = null; // { canvas, version, data }
  #pixels() {
    const { canvas, version } = this, kept = this.#read;
    if (kept?.canvas === canvas && kept.version === version) return kept.data;
    const ctx = ctx2d(canvas), { width, height } = canvas;
    const area = kept?.canvas === canvas && kept.data.length === width * height * 4 ? this.changedSince(kept.version) : null;
    if (!area) {
      this.#read = { canvas, version, data: ctx.getImageData(0, 0, width, height).data };
      return this.#read.data;
    }
    // Out to whole pixels and one more, for a drawImage's edge at a scale that isn't whole.
    const x0 = Math.max(0, Math.floor(area.x) - 1), y0 = Math.max(0, Math.floor(area.y) - 1);
    const x1 = Math.min(width, Math.ceil(area.x + area.w) + 1), y1 = Math.min(height, Math.ceil(area.y + area.h) + 1);
    if (area.w && area.h && x1 > x0 && y1 > y0) {
      const part = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data, row = (x1 - x0) * 4;
      for (let y = y0; y < y1; y++) kept.data.set(part.subarray((y - y0) * row, (y - y0 + 1) * row), (y * width + x0) * 4);
    }
    kept.version = version;
    return kept.data;
  }

  // The paint of grid pixels x0..x1, y0..y1 read at once: a function giving each of them as pixelAt does (null outside
  // them), so many reads cost one getImageData.
  pixelsIn(x0, y0, x1, y1) {
    const a = this.#cellRect(x0, y0), b = this.#cellRect(x1, y1);
    if (!a || !b) return (x, y) => this.pixelAt(x, y); // past the layer's edge: a read each
    const w = b.x + b.w - a.x, { data } = ctx2d(this.canvas).getImageData(a.x, a.y, w, b.y + b.h - a.y);
    return (x, y) => {
      const rect = x >= x0 && x <= x1 && y >= y0 && y <= y1 && this.#cellRect(x, y);
      return rect ? PaintLayer.average(data, w, rect.x - a.x, rect.y - a.y, rect.w, rect.h) : null;
    };
  }

  // Selection blocks. A cell rect ({ c0, r0, c1, r1 }) is scale x 2·scale layer pixels per cell.
  // The paint over a cell rect, as its own canvas.
  copyCells({ c0, r0, c1, r1 }) {
    const k = this.scale;
    const copy = newCanvas((c1 - c0 + 1) * k, 2 * (r1 - r0 + 1) * k);
    ctx2d(copy).drawImage(this.canvas, -c0 * k, -2 * r0 * k);
    return copy;
  }

  // Replace the paint over w x h cells at (col, row) with a copied block, scaled to this layer (so
  // a block copied before a grid resize still fits) and clipped to it.
  // clip: a cell rect the paste stays inside (the grid, so nothing lands unseen past its edge).
  pasteCells(block, col, row, w, h, clip = { c0: col, r0: row, c1: col + w - 1, r1: row + h - 1 }) {
    const k = this.scale;
    const target = this.#layerRect({ c0: Math.max(col, clip.c0), r0: Math.max(row, clip.r0), c1: Math.min(col + w - 1, clip.c1), r1: Math.min(row + h - 1, clip.r1) });
    if (!target) return;
    this.#record(target, { erasing: true });
    this.#changed(target);
    const ctx = ctx2d(this.canvas);
    ctx.clearRect(target.x, target.y, target.w, target.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(target.x, target.y, target.w, target.h);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(block, col * k, 2 * row * k, w * k, 2 * h * k);
    ctx.restore();
    if (!this.hasPaint) this.hasPaint = this.#anyPaint(target);
  }

  // Erases nothing (and records nothing, so no empty undo step) where there's no paint.
  eraseCells(rect) {
    const target = this.#layerRect(rect);
    if (!target || !this.hasPaint || !this.#anyPaint(target)) return;
    this.#record(target, { erasing: true });
    this.#changed(target);
    ctx2d(this.canvas).clearRect(target.x, target.y, target.w, target.h);
  }

  #anyPaint({ x, y, w, h }) {
    const { data } = ctx2d(this.canvas).getImageData(x, y, w, h);
    for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
    return false;
  }

  // A cell rect's layer pixels, clipped to the layer; null when it's all outside.
  #layerRect({ c0, r0, c1, r1 }) {
    const k = this.scale;
    const x0 = Math.max(0, c0 * k), y0 = Math.max(0, 2 * r0 * k);
    const x1 = Math.min(this.canvas.width, (c1 + 1) * k), y1 = Math.min(this.canvas.height, 2 * (r1 + 1) * k);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  colorAt(x, y) {
    const p = this.pixelAt(x, y);
    return p && { r: p.r, g: p.g, b: p.b };
  }

  // Grow the layer to cover at least cols x rows grid pixels, keeping its content where it is (a
  // canvas resize: what's past the grid's edge stays, for when the grid grows back). Returns false
  // when the scale had to drop to stay under MAX_LAYER_DIM: the content was resampled, so recorded
  // strokes no longer fit it.
  extend(cols, rows) {
    const kept = this.keepsScale(cols, rows);
    cols = Math.max(this.cols, cols);
    rows = Math.max(this.rows, rows);
    if (cols === this.cols && rows === this.rows) return true;
    const scale = Math.min(this.scale, editScaleFor(Infinity, Infinity, cols, rows));
    const next = newCanvas(cols * scale, rows * scale);
    const ctx = ctx2d(next);
    ctx.imageSmoothingEnabled = this.smooth;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.canvas, 0, 0, this.cols * scale, this.rows * scale);
    Object.assign(this, { cols, rows, scale, canvas: next });
    this.#stroke = null;
    this.#changed(null);
    return kept;
  }

  // Whether extend(cols, rows) keeps the scale, and so the content as it is.
  keepsScale(cols, rows) {
    cols = Math.max(this.cols, cols);
    rows = Math.max(this.rows, rows);
    return (cols === this.cols && rows === this.rows) || editScaleFor(Infinity, Infinity, cols, rows) >= this.scale;
  }

  // What a grid change replaces, for its undo step to put back (putGrid): extend and resize draw onto a new canvas, so
  // the one held here stays as it was.
  gridState() {
    return { cols: this.cols, rows: this.rows, scale: this.scale, canvas: this.canvas, hasPaint: this.hasPaint };
  }

  putGrid(state) {
    Object.assign(this, state);
    this.#stroke = null;
    this.#changed(null);
  }

  // Remap paint to a new grid size so it stays on the same part of the image, at `scale` layer pixels
  // per grid pixel (the base layer follows the pipeline's processing scale).
  resize(cols, rows, oldFit, newFit, scale = this.scale) {
    // Keep the scale unless the bigger grid would exceed MAX_LAYER_DIM (an infinitely large source hits only the cap)
    scale = Math.min(scale, editScaleFor(Infinity, Infinity, cols, rows));
    const { offsetX, offsetY, scaleX, scaleY } = resizeTransform(oldFit, newFit);
    const next = newCanvas(cols * scale, rows * scale);
    const ctx = ctx2d(next);
    ctx.imageSmoothingEnabled = this.smooth;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      this.canvas,
      Math.round(offsetX * scale),
      Math.round(offsetY * scale),
      Math.round(this.cols * scaleX * scale),
      Math.round(this.rows * scaleY * scale)
    );
    Object.assign(this, { cols, rows, scale, canvas: next });
    this.#stroke = null; // recorded tiles describe the old canvas
    this.#changed(null);
  }

  // Another layer drawn over this one, a grid pixel at a time as the Renderer shows it (Merge down).
  // Both are in grid pixels from the same origin, whatever their scales and extents.
  drawOver(layer, rect = null) {
    const ctx = ctx2d(this.canvas);
    ctx.save();
    if (rect) { // only inside a cell rect (a selection's merge)
      ctx.beginPath();
      ctx.rect(...this.#rectPixels(rect));
      ctx.clip();
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(layer.canvas, 0, 0, layer.cols * this.scale, layer.rows * this.scale);
    ctx.restore();
    this.hasPaint ||= layer.hasPaint;
    this.#changed(rect && this.#rectOf(rect));
  }

  // Whether any paint lies inside a cell rect, sampled a grid pixel at a time as the Renderer draws
  // it (cheap enough to ask on every move of a selection drag).
  hasPaintIn(rect) {
    const target = this.hasPaint && this.#layerRect(rect);
    if (!target) return false;
    const k = this.scale, w = Math.ceil(target.w / k), h = Math.ceil(target.h / k);
    const scratch = newCanvas(w, h);
    const ctx = ctx2d(scratch);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, target.x, target.y, target.w, target.h, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4) if (data[i]) return true;
    return false;
  }

  // Clear a cell rect's pixels (what a selection's merge takes off the edit layer).
  clearCells(rect) {
    if (!this.hasPaint) return;
    ctx2d(this.canvas).clearRect(...this.#rectPixels(rect));
    this.#changed(this.#rectOf(rect));
    this.recheckPaint();
  }

  // A cell rect in this layer's pixels: [x, y, w, h].
  #rectPixels({ c0, r0, c1, r1 }) {
    const k = this.scale;
    return [c0 * k, 2 * r0 * k, (c1 - c0 + 1) * k, 2 * (r1 - r0 + 1) * k];
  }

  // The same as a rect ({ x, y, w, h }).
  #rectOf(cells) {
    const [x, y, w, h] = this.#rectPixels(cells);
    return { x, y, w, h };
  }

  // A change to the pixels in rect (layer pixels; null: maybe anywhere).
  #changed(rect) {
    this.version++;
    this.#changes.push({ version: this.version, rect });
    if (this.#changes.length > 32) this.#changes.shift();
  }

  // Where the pixels changed since version (a rect in layer pixels), or null when that's unknown
  // (anywhere, or too long ago to say): what's drawn from the layer catches up on only that.
  changedSince(version) {
    if (version === this.version) return { x: 0, y: 0, w: 0, h: 0 };
    const since = this.#changes.filter((change) => change.version > version);
    if (since.length !== this.version - version || since.some(({ rect }) => !rect)) return null;
    return unionRect(since.map(({ rect }) => rect));
  }

  // Whether any grid pixel's block of layer pixels holds more than one color (a picture merged down onto the base, a soft
  // stroke's edge): what Smoothing, which scales the base's own pixels to the grid, changes (#200). Kept a grid pixel at a
  // time and looked at again only where the pixels changed since it was last asked (changedSince); all of them after a
  // resize, or a change too long ago to say where.
  #fine = null; // { version, cols, rows, scale, flags: a byte a grid pixel, 1 where it's finer, count: how many are }
  finerThanGrid() {
    const { cols, rows, scale: k } = this;
    if (k === 1) return false; // a pixel a grid pixel: nothing finer
    let fine = this.#fine;
    if (fine?.version === this.version) return fine.count > 0;
    const same = fine && fine.cols === cols && fine.rows === rows && fine.scale === k;
    const changed = same ? this.changedSince(fine.version) : null;
    if (!changed) fine = this.#fine = { cols, rows, scale: k, flags: new Uint8Array(cols * rows), count: 0 };
    const x0 = changed ? Math.max(0, Math.floor(changed.x / k)) : 0, y0 = changed ? Math.max(0, Math.floor(changed.y / k)) : 0;
    const x1 = changed ? Math.min(cols, Math.ceil((changed.x + changed.w) / k)) : cols, y1 = changed ? Math.min(rows, Math.ceil((changed.y + changed.h) / k)) : rows;
    if (x1 > x0 && y1 > y0) {
      const width = (x1 - x0) * k, pixels = new Uint32Array(ctx2d(this.canvas).getImageData(x0 * k, y0 * k, width, (y1 - y0) * k).data.buffer);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = y * cols + x, was = fine.flags[i];
          fine.flags[i] = flatBlock(pixels, width, k, x - x0, y - y0) ? 0 : 1;
          fine.count += fine.flags[i] - was;
        }
      }
    }
    fine.version = this.version;
    return fine.count > 0;
  }

  clear() {
    ctx2d(this.canvas).clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasPaint = false;
    this.#changed(null);
  }

  // paint: a saved paint PNG; image: { width, height } of the source image; fit: where it sits in the
  // grid. Without an image, the PNG is the whole layer.
  load(paint, image, fit) {
    const { x, y, w, h } = image ? savedPaintRect(paint, image, fit, this.scale, this.canvas.width, this.canvas.height) : { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height };
    const ctx = ctx2d(this.canvas);
    ctx.imageSmoothingEnabled = this.smooth;
    ctx.drawImage(paint, 0, 0, paint.width, paint.height, x, y, w, h);
    this.hasPaint = true;
    this.#changed(null);
  }

  // The paint as a PNG (a promise of the blob): the one made last while the pixels haven't changed since (version), as
  // autosave asks for every layer's on every write.
  #png = null; // { version, blob }
  toBlob() {
    if (this.#png?.version !== this.version) {
      const blob = canvasPng(this.canvas);
      blob.catch(() => { if (this.#png?.blob === blob) this.#png = null; }); // an encode that failed isn't kept: the next try encodes again
      this.#png = { version: this.version, blob };
    }
    return this.#png.blob;
  }

  get recording() {
    return !!this.#stroke;
  }

  // Whether the stroke being recorded has drawn in a tile under grid pixel (x, y).
  // ponytail: by tile, so paint from before beside the stroke's can show held too; by pixel if that shows.
  strokeCovers(x, y) {
    if (!this.#stroke?.tiles.size) return false;
    const k = this.scale, px = x * k, py = y * k;
    for (const { x: tx, y: ty, w, h } of this.#stroke.tiles.values()) if (px < tx + w && px + k > tx && py < ty + h && py + k > ty) return true;
    return false;
  }

  beginStroke() {
    this.#stroke = { tiles: new Map(), touched: new Set(), hadPaint: this.hasPaint, erased: false, laid: new Map(), own: new Map(), beneath: new Map() };
  }

  // Finish recording; null when the stroke changed nothing. A stroke that erased may have left no
  // paint at all, so hasPaint is checked again.
  endStroke() {
    const stroke = this.#stroke;
    this.#stroke = null;
    if (!stroke || !stroke.tiles.size) return null;
    if (stroke.erased) this.recheckPaint();
    const ctx = ctx2d(this.canvas);
    const tiles = [...stroke.tiles].map(([key, { x, y, w, h, before }]) => ({ x, y, w, h, before, after: stroke.touched.has(key) ? ctx.getImageData(x, y, w, h) : before }));
    return { tiles, hadPaint: stroke.hadPaint, hasPaint: this.hasPaint };
  }

  // The tiles touched since the last slice ({ x, y, before, after }: ImageData, clipped to the layer).
  strokeSlice() {
    const stroke = this.#stroke;
    if (!stroke?.touched.size) return [];
    const ctx = ctx2d(this.canvas), slice = [];
    for (const key of stroke.touched) {
      const tile = stroke.tiles.get(key), after = ctx.getImageData(tile.x, tile.y, tile.w, tile.h);
      slice.push({ x: tile.x, y: tile.y, before: tile.before, after });
      tile.before = after;
    }
    stroke.touched.clear();
    return slice;
  }

  applyPatch(patch, side) {
    const ctx = ctx2d(this.canvas);
    for (const tile of patch.tiles) ctx.putImageData(tile[side], tile.x, tile.y);
    this.hasPaint = side === 'before' ? patch.hadPaint : patch.hasPaint;
    this.#changed(patch.tiles.length ? unionRect(patch.tiles.map(({ x, y, before }) => ({ x, y, w: before.width, h: before.height }))) : null);
  }

  // A tile's RGBA pixels: x and y TILE-aligned, always TILE x TILE, transparent past the layer's edge.
  readTile(x, y) {
    return ctx2d(this.canvas).getImageData(x, y, TILE, TILE).data;
  }

  // Set pixels to exact colors (runs: changes.js), without blending, whatever was there. Returns the tiles
  // written, as a patch has them. Tile by tile, since a soft stroke's runs are mostly a pixel long. A stroke
  // being recorded takes them in what it saved, and under the paint it lays (beneath): they aren't its own.
  writeRuns(runs) {
    const ctx = ctx2d(this.canvas), { width, height } = this.canvas, images = new Map(), beneath = this.#stroke?.beneath;
    let tile = null, erased = false;
    eachPixel(runs, (x, y, rgba) => {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const tx = x - x % TILE, ty = y - y % TILE;
      if (tile?.x !== tx || tile?.y !== ty) {
        const name = `${tx},${ty}`;
        tile = images.get(name);
        if (!tile) {
          const w = Math.min(TILE, width - tx), h = Math.min(TILE, height - ty);
          images.set(name, tile = { x: tx, y: ty, w, h, image: ctx.getImageData(tx, ty, w, h), saved: this.#stroke?.tiles.get(name)?.before.data });
        }
      }
      const i = ((y - ty) * tile.w + x - tx) * 4;
      setPixel(tile.image.data, i, rgba);
      if (tile.saved) setPixel(tile.saved, i, rgba);
      const under = beneath?.get(tx / TILE + (ty / TILE) * 65536), s = ((y - ty) * TILE + x - tx) * 4;
      if (under?.[s + 3]) { setPixel(under, s, rgba); under[s + 3] = (rgba & 0xff) + 1; }
      if (rgba) this.hasPaint = true;
      else erased = true;
    });
    const tiles = [...images.values()];
    if (!tiles.length) return { tiles };
    for (const { x, y, image } of tiles) ctx.putImageData(image, x, y);
    if (erased) this.recheckPaint();
    if (this.#stroke) this.#stroke.hadPaint = this.hasPaint;
    this.#changed(unionRect(tiles));
    return { tiles };
  }

  // Full copies, for edits that replace the whole layer (merge, clear).
  snapshot() {
    const copy = newCanvas(this.canvas.width, this.canvas.height);
    ctx2d(copy).drawImage(this.canvas, 0, 0);
    return { canvas: copy, hasPaint: this.hasPaint };
  }

  // snapshot: from snapshot(), or null for an empty layer
  restore(snapshot) {
    const ctx = ctx2d(this.canvas);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (snapshot) ctx.drawImage(snapshot.canvas, 0, 0);
    this.hasPaint = !!snapshot && snapshot.hasPaint;
    this.#changed(null);
  }

  // After erasing: whether any paint is left, sampled a grid pixel at a time as the Renderer
  // draws it (paint covers whole grid pixels).
  recheckPaint() {
    if (!this.hasPaint) return;
    const { data } = this.gridPixels();
    for (let i = 3; i < data.length; i += 4) if (data[i]) return;
    this.hasPaint = false;
  }

  // Save the prior pixels of tiles this stroke hasn't touched yet (erasing: it removes paint).
  #record(rect, { erasing = false } = {}) {
    if (!this.#stroke) return;
    if (erasing) this.#stroke.erased = true;
    const ctx = ctx2d(this.canvas);
    for (const tile of tilesForRect(rect, this.canvas.width, this.canvas.height)) {
      const key = `${tile.x},${tile.y}`;
      this.#stroke.touched.add(key);
      if (!this.#stroke.tiles.has(key)) {
        this.#stroke.tiles.set(key, { ...tile, before: ctx.getImageData(tile.x, tile.y, tile.w, tile.h) });
      }
    }
  }
}

// A tile's pixels from a patch (clipped to the layer it was read from) as readTile gives them.
export function wholeTile({ width, height, data }) {
  if (width === TILE && height === TILE) return data;
  const whole = new Uint8ClampedArray(TILE * TILE * 4);
  for (let y = 0; y < height; y++) whole.set(data.subarray(y * width * 4, (y + 1) * width * 4), y * TILE * 4);
  return whole;
}

function setPixel(data, i, rgba) {
  data[i] = rgba >>> 24;
  data[i + 1] = (rgba >>> 16) & 0xff;
  data[i + 2] = (rgba >>> 8) & 0xff;
  data[i + 3] = rgba & 0xff;
}

function unionRect(rects) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y, w, h } of rects) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
