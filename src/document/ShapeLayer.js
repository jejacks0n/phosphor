/**
 * The base layer with the vector layer's shapes drawn over it, at the base layer's scale: what the Renderer
 * reads in its place while there are shapes, so they go through everything the base layer's own pixels do
 * (the color adjustments, the palette, dither and By shape's samples; not the effects) and partial redraws
 * stay exact. It looks like a PaintLayer to the Renderer: canvas, scale, cols, rows, version, hasPaint and
 * changedSince.
 *
 * Shapes are drawn into a canvas of their own, then over a copy of the base's rect. A redraw covers whole
 * cells and draws every shape that reaches the rect, unclipped, so a part comes out as the whole would; it
 * reads back which cells any shape covers, where a pinned character gives way to the conversion
 * (Renderer.pinAt).
 * ponytail: two canvases the base layer's size while shapes exist (up to MAX_LAYER_DIM a side); tile them
 * if that's too much memory on large documents.
 */
import { ctx2d } from '../lib/Canvas.js';
import { charRowsOf } from '../lib/Cells.js';
import { dirtyRect, pathData, shapeBounds, stacked, strokeOf } from './shapes.js';

const newCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export default class ShapeLayer {
  #base;
  #shapes = new Map();
  #order = [];          // [key, shape, bounds] in stacking order
  #own = null;          // the shapes alone, right inside each rect last drawn
  canvas = null;        // the base with the shapes over it
  #size = null;         // the base canvas's size and scale they're drawn for
  #seen = -1;           // the base's version drawn
  #pending = [];        // grid rects to draw again
  #covered = null;      // a byte a cell: some shape draws in it
  #paths = new WeakMap(); // shape -> { k, path }
  version = 0;
  #changes = [];

  constructor(baseLayer) {
    this.#base = baseLayer;
  }

  get scale() { return this.#base.scale; }
  get cols() { return this.#base.cols; }
  get rows() { return this.#base.rows; }
  get drawsShapes() { return this.#shapes.size > 0; }
  get hasPaint() { return this.#base.hasPaint || this.drawsShapes; }

  // The shapes to draw (the store's map). The grid rect that changed, or null when none did.
  set(shapes) {
    if (shapes === this.#shapes) return null;
    const bounds = [];
    for (const [key, shape] of shapes) {
      const was = this.#shapes.get(key);
      if (was === shape) continue;
      bounds.push(shapeBounds(shape));
      if (was) bounds.push(shapeBounds(was));
    }
    for (const [key, shape] of this.#shapes) if (!shapes.has(key)) bounds.push(shapeBounds(shape));
    this.#shapes = shapes;
    this.#order = stacked(shapes).map(([key, shape]) => [key, shape, shapeBounds(shape)]);
    const rect = dirtyRect(...bounds);
    if (rect) this.#pending.push(rect);
    return rect;
  }

  // Everything drawn again on the next sync.
  reset() {
    this.#size = null;
  }

  // Catch up with the base layer and the shapes set since.
  sync() {
    if (!this.drawsShapes) return;
    const base = this.#base, k = base.scale, { width, height } = base.canvas;
    const size = `${width}x${height}x${k}`;
    if (size !== this.#size) {
      this.#size = size;
      this.#own = newCanvas(width, height);
      this.canvas = newCanvas(width, height);
      this.#covered = new Uint8Array(base.cols * charRowsOf(base.rows));
      this.#pending = [];
      this.#seen = base.version;
      this.#draw({ x: 0, y: 0, w: width, h: height });
      this.#changed(null);
      return;
    }
    const rects = [];
    if (this.#seen !== base.version) {
      const since = base.changedSince(this.#seen);
      rects.push(since ? this.#cellsOf(since) : { x: 0, y: 0, w: width, h: height });
      this.#seen = base.version;
    }
    for (const r of this.#pending) rects.push(this.#cellsOf({ x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k }));
    this.#pending = [];
    for (const rect of rects) {
      const clipped = this.#clip(rect);
      if (!clipped) continue;
      this.#draw(clipped);
      this.#changed(clipped);
    }
  }

  // Whether any shape draws in cell (col, row).
  covers(col, row) {
    if (!this.drawsShapes) return false;
    this.sync();
    return col < this.#base.cols && !!this.#covered[row * this.#base.cols + col];
  }

  // The base layer with the shapes keys (a Set) pressed in, drawn as this layer draws them (alone, then over
  // the base's bytes), so nothing shown changes: { canvas, covered }, covered the cells ({ col, row }) they draw in.
  pressed(keys) {
    const base = this.#base, k = base.scale, { width, height } = base.canvas;
    const own = newCanvas(width, height), ownCtx = ctx2d(own);
    for (const [key, shape] of this.#order) if (keys.has(key)) this.#paint(ownCtx, shape, k);
    const canvas = newCanvas(width, height), ctx = ctx2d(canvas);
    ctx.putImageData(ctx2d(base.canvas).getImageData(0, 0, width, height), 0, 0);
    ctx.drawImage(own, 0, 0);
    const { data } = ownCtx.getImageData(0, 0, width, height), covered = [];
    offHalfSteps(ctx, data, width, height);
    for (let row = 0; row < charRowsOf(base.rows) && 2 * k * (row + 1) <= height; row++) {
      for (let col = 0; col < base.cols && k * (col + 1) <= width; col++) {
        let any = false;
        for (let py = 2 * k * row; py < 2 * k * (row + 1) && !any; py++) {
          for (let px = k * col; px < k * (col + 1); px++) if (data[(py * width + px) * 4 + 3]) { any = true; break; }
        }
        if (any) covered.push({ col, row });
      }
    }
    return { canvas, covered };
  }

  changedSince(version) {
    if (version === this.version) return { x: 0, y: 0, w: 0, h: 0 };
    const since = this.#changes.filter((change) => change.version > version);
    if (since.length !== this.version - version || since.some(({ rect }) => !rect)) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const { rect: { x, y, w, h } } of since) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  #changed(rect) {
    this.version++;
    this.#changes.push({ version: this.version, rect });
    if (this.#changes.length > 32) this.#changes.shift();
  }

  // A layer-pixel rect grown to whole cells (k wide, 2k tall).
  #cellsOf({ x, y, w, h }) {
    const k = this.#base.scale, cw = k, ch = 2 * k;
    const x0 = Math.floor(x / cw) * cw, y0 = Math.floor(y / ch) * ch;
    return { x: x0, y: y0, w: Math.ceil((x + w) / cw) * cw - x0, h: Math.ceil((y + h) / ch) * ch - y0 };
  }

  #clip({ x, y, w, h }) {
    const { width, height } = this.#base.canvas;
    const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(width, x + w), y1 = Math.min(height, y + h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }

  #path(shape, k) {
    let held = this.#paths.get(shape);
    if (held?.k !== k) this.#paths.set(shape, held = { k, path: new Path2D(pathData(shape, k, k)) });
    return held.path;
  }

  #paint(ctx, shape, k) {
    paintShape(ctx, shape, k, this.#path(shape, k));
  }

  // Draw a rect (layer pixels, whole cells, inside the canvas) again: the shapes that meet it, then the base
  // under them, then which cells they cover.
  #draw(rect) {
    const k = this.#base.scale, { x, y, w, h } = rect;
    const grid = { x: x / k - 1, y: y / k - 1, w: w / k + 2, h: h / k + 2 }; // a grid pixel around: an edge's antialiasing reaches past its bounds
    // Unclipped and untranslated: either would antialias an edge a little differently from a drawing of the
    // whole. Shapes that reach past the rect leave pixels outside it on this canvas; only the rect is read, and
    // a later rect is cleared before it's drawn.
    const own = ctx2d(this.#own);
    own.clearRect(x, y, w, h);
    for (const [, shape, bounds] of this.#order) if (meets(bounds, grid)) this.#paint(own, shape, k);

    // The base's bytes, not a drawImage of its canvas: two canvases that read back the same can hold a
    // semi-transparent pixel premultiplied a little differently (an undo puts tiles back with putImageData),
    // and the shapes over it would then come out a shade apart.
    const ctx = ctx2d(this.canvas);
    ctx.putImageData(ctx2d(this.#base.canvas).getImageData(x, y, w, h), x, y);
    ctx.drawImage(this.#own, x, y, w, h, x, y, w, h);

    const { data } = own.getImageData(x, y, w, h), cols = this.#base.cols, rows = charRowsOf(this.#base.rows);
    const c0 = x / k, r0 = y / (2 * k), cw = w / k, rh = h / (2 * k);
    for (let r = 0; r < rh; r++) {
      if (r0 + r >= rows) break;
      for (let c = 0; c < cw; c++) {
        if (c0 + c >= cols) break;
        let any = 0;
        for (let py = r * 2 * k; py < (r + 1) * 2 * k && !any; py++) {
          for (let px = c * k, o = (py * w + px) * 4 + 3; px < (c + 1) * k; px++, o += 4) if (data[o]) { any = 1; break; }
        }
        this.#covered[(r0 + r) * cols + c0 + c] = any;
      }
    }
  }
}

// A partly transparent pixel is held premultiplied, and one whose color comes out halfway between two values when
// it's unpremultiplied (a soft edge over a soft base can) is read as either, depending on what else Chromium has
// done to the canvas: a cell could change a shade with nothing drawn on it, and an undo wouldn't read back the same.
// Each such color the shapes drew (own: their pixels alone) moves a step down, which no one can see.
function offHalfSteps(ctx, own, width, height) {
  const image = ctx.getImageData(0, 0, width, height), { data } = image;
  let moved = false;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (!own[i + 3] || !a || a === 255) continue;
    for (let j = i; j < i + 3; j++) {
      const held = Math.round((data[j] * a) / 255);
      if ((510 * held) % (2 * a) !== a) continue;
      data[j] = Math.round(((held - 1) * 255) / a);
      moved = true;
    }
  }
  if (moved) ctx.putImageData(image, 0, 0);
}

// One shape drawn at k canvas pixels per grid pixel (path: its pathData at that scale, as a Path2D): its fill
// under its fill rule, then its stroke with its width, caps, joins and miter limit.
export function paintShape(ctx, shape, k, path = new Path2D(pathData(shape, k, k))) {
  const { rule, cap, join, miter } = strokeOf(shape);
  if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill(path, rule);
  }
  if (shape.stroke && shape.width > 0) {
    ctx.strokeStyle = shape.stroke;
    ctx.lineWidth = shape.width * k;
    ctx.lineJoin = join;
    ctx.lineCap = cap;
    ctx.miterLimit = miter;
    ctx.stroke(path);
  }
}
