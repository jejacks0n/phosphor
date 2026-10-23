/**
 * The paint layer: a transparent canvas covering the whole grid at an integer number of pixels
 * per grid cell (scale), so each cell is a whole scale x scale block. Cell bounds use the same
 * floor partition as the pipeline's box filter (Canvas.drawManual), so paint never bleeds into
 * neighbouring cells once merged.
 *
 * Rect = { x, y, w, h } in layer pixels. Grid pixels are the cols x rows pipeline pixels.
 *
 * While a stroke is being recorded, the first time paint/erase touches a 64px tile its prior
 * pixels are saved; endStroke() returns those tiles with their new pixels as an undoable patch.
 * LayerPatch = { tiles: { x, y, before: ImageData, after: ImageData }[], hadPaint, hasPaint }
 */
import { ctx2d } from '../lib/Canvas.js';
import { rgb2hex } from '../lib/ColorUtils.js';
import { tilesForRect } from './History.js';

export const MAX_LAYER_DIM = 4000;

// Integer paint pixels per grid cell: at least the image's own resolution, capped so neither side exceeds MAX_LAYER_DIM.
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

// Where a saved paint PNG goes on load. Current saves store the whole grid-sized layer; older
// saves stored paint at the source image's size, aligned to the image (which sits at `fit`).
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

export default class EditLayer {
  #stroke = null; // { tiles: Map<'x,y', { x, y, w, h, before }>, hadPaint } while recording

  constructor({ cols, rows, scale }) {
    this.cols = cols;
    this.rows = rows;
    this.scale = scale;
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

  // How many grid pixels hold each paint colour, sampled one per grid pixel. Only (nearly) opaque
  // paint counts: soft edges and overlaps blend into one-off colours nobody picked.
  // ponytail: skips paint laid at under ~98% brush opacity; bucket it by colour if that matters.
  colorCounts() {
    const counts = new Map();
    if (!this.hasPaint) return counts;
    const ctx = ctx2d(newCanvas(this.cols, this.rows));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, 0, 0, this.cols, this.rows);
    const { data } = ctx.getImageData(0, 0, this.cols, this.rows);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 250) continue;
      const hex = rgb2hex({ r: data[i], g: data[i + 1], b: data[i + 2] });
      counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    return counts;
  }

  // pixels: { x, y, r, g, b, alpha }[] in grid pixels. Paint builds up to `opacity`, then blends.
  paint(pixels, opacity = 100) {
    const rects = [];
    for (const { x, y, r, g, b, alpha } of pixels) {
      const rect = this.#cellRect(x, y);
      if (rect) rects.push({ ...rect, r, g, b, a: Math.round(alpha * 255) });
    }
    if (!rects.length) return null;
    this.hasPaint = true;

    const bounds = unionRect(rects);
    this.#record(bounds);
    const ctx = ctx2d(this.canvas);
    const imageData = ctx.getImageData(bounds.x, bounds.y, bounds.w, bounds.h);
    const data = imageData.data;
    const maxA = Math.round((opacity / 100) * 255);

    for (const { x: cx, y: cy, w: cw, h: ch, r, g, b, a } of rects) {
      if (a === 0) continue;
      for (let py = cy; py < cy + ch; py++) {
        for (let px = cx; px < cx + cw; px++) {
          const idx = ((py - bounds.y) * bounds.w + (px - bounds.x)) * 4;
          const existingA = data[idx + 3];
          if (existingA >= maxA) {
            const blend = Math.min(1, a / 255);
            data[idx]     = Math.round(data[idx]     + (r - data[idx])     * blend);
            data[idx + 1] = Math.round(data[idx + 1] + (g - data[idx + 1]) * blend);
            data[idx + 2] = Math.round(data[idx + 2] + (b - data[idx + 2]) * blend);
          } else {
            data[idx + 3] = Math.min(maxA, existingA + a);
            data[idx]     = Math.round((data[idx]     * existingA + r * a) / (existingA + a));
            data[idx + 1] = Math.round((data[idx + 1] * existingA + g * a) / (existingA + a));
            data[idx + 2] = Math.round((data[idx + 2] * existingA + b * a) / (existingA + a));
          }
        }
      }
    }
    ctx.putImageData(imageData, bounds.x, bounds.y);
    return bounds;
  }

  // pixels: { x, y }[] in grid pixels.
  // Erases (and records) nothing where there's no paint, so a pass over bare cells isn't an undo step.
  erase(pixels) {
    const rects = pixels.map(({ x, y }) => this.#cellRect(x, y)).filter(Boolean);
    if (!rects.length || !this.hasPaint) return null;
    const bounds = unionRect(rects);
    if (!this.#anyPaint(bounds)) return null;
    this.#record(bounds);
    const ctx = ctx2d(this.canvas);
    for (const { x, y, w, h } of rects) ctx.clearRect(x, y, w, h);
    return bounds;
  }

  // Raw paint at grid pixel (x, y) with its alpha (0..1), or null where there's none.
  pixelAt(x, y) {
    const rect = this.#cellRect(x, y);
    if (!rect) return null;
    const [r, g, b, a] = ctx2d(this.canvas).getImageData(rect.x, rect.y, 1, 1).data;
    return a > 0 ? { r, g, b, a: a / 255 } : null;
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
  pasteCells(block, col, row, w, h) {
    const k = this.scale;
    const target = this.#layerRect({ c0: col, r0: row, c1: col + w - 1, r1: row + h - 1 });
    if (!target) return;
    this.#record(target);
    const ctx = ctx2d(this.canvas);
    ctx.clearRect(target.x, target.y, target.w, target.h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(block, col * k, 2 * row * k, w * k, 2 * h * k);
    if (!this.hasPaint) this.hasPaint = this.#anyPaint(target);
  }

  // Erases nothing (and records nothing, so no empty undo step) where there's no paint.
  eraseCells(rect) {
    const target = this.#layerRect(rect);
    if (!target || !this.hasPaint || !this.#anyPaint(target)) return;
    this.#record(target);
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

  // Remap paint to a new grid size so it stays on the same part of the image.
  resize(cols, rows, oldFit, newFit) {
    // Keep the scale unless the bigger grid would exceed MAX_LAYER_DIM (an infinitely large source hits only the cap)
    const scale = Math.min(this.scale, editScaleFor(Infinity, Infinity, cols, rows));
    const { offsetX, offsetY, scaleX, scaleY } = resizeTransform(oldFit, newFit);
    const next = newCanvas(cols * scale, rows * scale);
    const ctx = ctx2d(next);
    ctx.imageSmoothingEnabled = true;
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
  }

  // The image placed where the pipeline shows it (letterbox included, black), with paint on top.
  // The image with this layer's paint merged over it, as a new picture the size of the layer.
  // beneath(ctx, scale), if given, draws between the two (Merge down's cells).
  bake(image, fit, beneath) {
    const k = this.scale;
    const out = newCanvas(this.canvas.width, this.canvas.height);
    const ctx = ctx2d(out);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, fit.dx * k, fit.dy * k, fit.dw * k, fit.dh * k);
    beneath?.(ctx, k);
    ctx.drawImage(this.canvas, 0, 0);
    return out;
  }

  clear() {
    ctx2d(this.canvas).clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.hasPaint = false;
  }

  // paint: a saved paint PNG; image: { width, height } of the source image; fit: where it sits in the grid.
  load(paint, image, fit) {
    const { x, y, w, h } = savedPaintRect(paint, image, fit, this.scale, this.canvas.width, this.canvas.height);
    ctx2d(this.canvas).drawImage(paint, 0, 0, paint.width, paint.height, x, y, w, h);
    this.hasPaint = true;
  }

  toBlob() {
    return new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
  }

  get recording() {
    return !!this.#stroke;
  }

  beginStroke() {
    this.#stroke = { tiles: new Map(), hadPaint: this.hasPaint };
  }

  // Finish recording; null when the stroke changed nothing.
  endStroke() {
    const stroke = this.#stroke;
    this.#stroke = null;
    if (!stroke || !stroke.tiles.size) return null;
    const ctx = ctx2d(this.canvas);
    const tiles = [...stroke.tiles.values()].map(({ x, y, w, h, before }) => ({ x, y, before, after: ctx.getImageData(x, y, w, h) }));
    return { tiles, hadPaint: stroke.hadPaint, hasPaint: this.hasPaint };
  }

  applyPatch(patch, side) {
    const ctx = ctx2d(this.canvas);
    for (const tile of patch.tiles) ctx.putImageData(tile[side], tile.x, tile.y);
    this.hasPaint = side === 'before' ? patch.hadPaint : patch.hasPaint;
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
  }

  // Save the prior pixels of tiles this stroke hasn't touched yet.
  #record(rect) {
    if (!this.#stroke) return;
    const ctx = ctx2d(this.canvas);
    for (const tile of tilesForRect(rect, this.canvas.width, this.canvas.height)) {
      const key = `${tile.x},${tile.y}`;
      if (!this.#stroke.tiles.has(key)) {
        this.#stroke.tiles.set(key, { ...tile, before: ctx.getImageData(tile.x, tile.y, tile.w, tile.h) });
      }
    }
  }
}

function unionRect(rects) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { x, y, w, h } of rects) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
