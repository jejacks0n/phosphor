/**
 * The base layer with the vector layer's shapes drawn over it, at the base layer's scale: what the Renderer
 * reads in its place while there are shapes, so they go through everything the base layer's own pixels do
 * (the color adjustments, the palette, dither and By shape's samples; not the effects) and partial redraws
 * stay exact. It looks like a PaintLayer to the Renderer: canvas, scale, cols, rows, version, hasPaint and
 * changedSince.
 *
 * Shapes are drawn into a canvas of their own, then over a copy of the base's rect. A redraw covers whole
 * cells and draws every shape that reaches the rect, unclipped, so a part comes out as the whole would; it
 * reads back each cell's character (charAt): an art layer's where it's the topmost thing there, the conversion's
 * where a shape reaches over it (or over a pinned character), the base's pin otherwise (Renderer.pinAt).
 * ponytail: two canvases the base layer's size while shapes exist (up to MAX_LAYER_DIM a side), a third while
 * an art layer does; tile them if that's too much memory on large documents.
 *
 * Alone (no base layer: a vector layer above the lower group), it's the shapes' own drawing at the grid it's told
 * (grid), copied a rect at a time as over a base, and the Renderer lays it over the cells under it (composeUpper).
 */
import { ctx2d } from '../lib/Canvas.js';
import { charRowsOf } from '../lib/Cells.js';
import { isArt } from './artLayers.js';
import { dirtyRect, invert, isGradient, multiply, pathData, scaling, shapeBounds, stacked, strokeAlign, strokeOf } from './shapes.js';
import { sidePath } from '../lib/shapeHits.js';
import { measure } from './pathLength.js';

const newCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.max(1, w), height: Math.max(1, h) });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export default class ShapeLayer {
  #base;
  #shapes = new Map();
  #order = [];          // [key, shape, bounds] in stacking order
  #own = null;          // the shapes alone, right inside each rect last drawn
  canvas = null;        // the base with the shapes over it
  #size = null;         // { width, height, k }: the base canvas's size and scale they're drawn for
  #seen = -1;           // the base's version drawn
  #pending = [];        // grid rects to draw again
  #chars = null;        // a cell's character (charAt): undefined, null or an art layer's
  #scratch = null;      // a band of shapes between art layers drawn alone, for which cells it covers
  #hasArt = false;
  #paths = new WeakMap(); // shape -> { k, path }
  version = 0;
  #changes = [];
  #hideBase = false;

  // The base's eye is shut: the shapes are drawn over nothing, and everything's drawn again on the next sync.
  get hideBase() { return this.#hideBase; }
  set hideBase(hidden) {
    if (hidden === this.#hideBase) return;
    this.#hideBase = hidden;
    this.reset();
  }

  #alone = false;

  // baseLayer: the base it draws over, or null to draw alone (then grid says its size).
  constructor(baseLayer) {
    this.#alone = !baseLayer;
    this.#base = baseLayer ?? { cols: 0, rows: 0, scale: 1, canvas: { width: 0, height: 0 }, hasPaint: false, version: 0, changedSince: () => ({ x: 0, y: 0, w: 0, h: 0 }) };
  }

  // Alone: the grid it draws for, at scale canvas pixels a grid pixel (the base layer's, so its shapes are sampled as the
  // lower group's are). A change draws everything again on the next sync.
  grid(cols, rows, scale) {
    const b = this.#base;
    if (!this.#alone || (b.cols === cols && b.rows === rows && b.scale === scale)) return;
    Object.assign(b, { cols, rows, scale, canvas: { width: cols * scale, height: rows * scale } });
  }

  get scale() { return this.#base.scale; }
  get cols() { return this.#base.cols; }
  get rows() { return this.#base.rows; }
  get drawsShapes() { return this.#shapes.size > 0; }
  get hasPaint() { return this.#base.hasPaint || this.drawsShapes; }
  get hasArt() { return this.#hasArt; }

  // The shapes to draw (the store's map), and rank(shape), their layers' order when they're from several vector layers
  // (shapes.js: stacked). The grid rect that changed, or null when none did.
  set(shapes, rank = null) {
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
    this.#order = stacked(shapes, rank).map(([key, shape]) => [key, shape, shapeBounds(shape)]);
    this.#hasArt = this.#order.some(([, shape]) => isArt(shape));
    if (!this.#hasArt) this.#scratch = null;
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
    const held = this.#size;
    if (held?.width !== width || held.height !== height || held.k !== k) {
      this.#size = { width, height, k };
      this.#own = newCanvas(width, height);
      this.canvas = newCanvas(width, height);
      this.#chars = new Array(base.cols * charRowsOf(base.rows));
      this.#scratch = null;
      this.#pending = [];
      this.#seen = base.version;
      this.#draw({ x: 0, y: 0, w: width, h: height });
      this.#changed(null);
      return;
    }
    if (this.#seen === base.version && !this.#pending.length) return; // asked once a cell (Renderer.pinAt): nothing made
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

  // Cell (col, row)'s character, worked out bottom up: undefined where nothing sets one (the base's pin, if any,
  // shows), null where a shape reaches over it (the converter picks), or the character of the topmost art layer
  // over it. An art cell with no character leaves the one under it.
  charAt(col, row) {
    if (!this.drawsShapes) return undefined;
    this.sync();
    return col < this.#base.cols ? this.#chars[row * this.#base.cols + col] : undefined;
  }

  // The cells (as row * cols + col) where charAt isn't undefined: a shape reaches or an art layer gives a character. What
  // a whole-grid compose visits of this layer.
  reachedCells() {
    if (!this.drawsShapes) return [];
    this.sync();
    const cells = [];
    this.#chars.forEach((char, i) => { if (char !== undefined) cells.push(i); }); // forEach skips the holes
    return cells;
  }

  // The grid cells ('col,row') an art layer gives a character: where the Renderer looks past its pins.
  artCells() {
    const cells = new Set(), cols = this.#base.cols, rows = charRowsOf(this.#base.rows);
    for (const [, shape] of this.#order) {
      if (!isArt(shape)) continue;
      const { m, art } = shape;
      for (const [i, char] of art.cells) {
        const col = m[4] + (i % art.cols), row = m[5] / 2 + Math.floor(i / art.cols);
        if (char !== null && col >= 0 && row >= 0 && col < cols && row < rows) cells.add(`${col},${row}`);
      }
    }
    return cells;
  }

  // The base layer with the shapes keys (a Set) pressed in, drawn as this layer draws them (alone, then over
  // the base's bytes), so nothing shown changes: { canvas, covered, pins }. covered: the cells ({ col, row }) a pressed
  // shape reaches over, where the converter picks (a base pin there goes); pins: the characters ({ col, row, char })
  // their art layers show, where nothing pressed is over them. An art cell with no character leaves a pin under it.
  pressed(keys) {
    const base = this.#base, k = base.scale, { width, height } = base.canvas;
    const own = newCanvas(width, height), ownCtx = ctx2d(own);
    for (const [key, shape] of this.#order) if (keys.has(key)) this.#paint(ownCtx, shape, k);
    const canvas = newCanvas(width, height), ctx = ctx2d(canvas);
    ctx.putImageData(ctx2d(base.canvas).getImageData(0, 0, width, height), 0, 0);
    ctx.drawImage(own, 0, 0);
    offHalfSteps(ctx, ownCtx.getImageData(0, 0, width, height).data, width, height);
    return { canvas, ...this.#pressedChars(keys) };
  }

  // The characters the art layers among keys show, worked out as #draw does (a shape stacked above has the converter
  // pick): { pins, covered } for pressed. The pins' colors are the base's pixels, which hold their halves' colors.
  #pressedChars(keys) {
    const base = this.#base, k = base.scale, { width, height } = base.canvas, cols = base.cols, rows = charRowsOf(base.rows);
    const chars = [], scratch = ctx2d(newCanvas(width, height)), whole = { x: 0, y: 0, w: width, h: height };
    let band = false;
    const flush = () => {
      if (!band) return;
      this.#reach(scratch, whole, chars);
      scratch.clearRect(0, 0, width, height);
      band = false;
    };
    for (const [key, shape] of this.#order) {
      if (!keys.has(key)) continue;
      if (!isArt(shape)) {
        this.#paint(scratch, shape, k);
        band = true;
        continue;
      }
      flush();
      const { m, art } = shape;
      for (const [i, char] of art.cells) {
        const col = m[4] + (i % art.cols), row = m[5] / 2 + Math.floor(i / art.cols);
        if (char !== null && col >= 0 && col < cols && row >= 0 && row < rows) chars[row * cols + col] = char;
      }
    }
    flush();
    const pins = [], covered = [];
    chars.forEach((char, i) => (char === null ? covered : pins).push({ col: i % cols, row: Math.floor(i / cols), ...(char && { char }) }));
    return { pins, covered };
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
    if (held?.k !== k) this.#paths.set(shape, held = { k, path: trimmedPath(shape, k) });
    return held.path;
  }

  #paint(ctx, shape, k) {
    paintShape(ctx, shape, k, isArt(shape) ? null : this.#path(shape, k));
  }

  // Draw a rect (layer pixels, whole cells, inside the canvas) again: the shapes that meet it, then the base
  // under them, then the characters of its cells (charAt).
  // ponytail: with art in the rect, each band of shapes between art layers is drawn again alone and read back;
  // fold bands that no art cell's character sits over if that shows up in profiles.
  #draw(rect) {
    const k = this.#base.scale, { x, y, w, h } = rect;
    const grid = { x: x / k - 1, y: y / k - 1, w: w / k + 2, h: h / k + 2 }; // a grid pixel around: an edge's antialiasing reaches past its bounds
    // Unclipped and untranslated: either would antialias an edge a little differently from a drawing of the
    // whole. Shapes that reach past the rect leave pixels outside it on this canvas; only the rect is read, and
    // a later rect is cleared before it's drawn.
    const own = ctx2d(this.#own), drawn = this.#order.filter(([, , bounds]) => meets(bounds, grid)).map(([, shape]) => shape);
    own.clearRect(x, y, w, h);
    for (const shape of drawn) this.#paint(own, shape, k);

    // The base's bytes, not a drawImage of its canvas: two canvases that read back the same can hold a
    // semi-transparent pixel premultiplied a little differently (an undo puts tiles back with putImageData),
    // and the shapes over it would then come out a shade apart. Alone, over nothing: the rect of the shapes'
    // own, so what's read (a whole re-read too) never has a shape's edge drawn twice past an earlier rect.
    const ctx = ctx2d(this.canvas);
    if (this.#alone || this.#hideBase) ctx.clearRect(x, y, w, h);
    else ctx.putImageData(ctx2d(this.#base.canvas).getImageData(x, y, w, h), x, y);
    ctx.drawImage(this.#own, x, y, w, h, x, y, w, h);

    const cols = this.#base.cols, rows = charRowsOf(this.#base.rows);
    const c0 = x / k, r0 = y / (2 * k), c1 = Math.min(cols, c0 + w / k), r1 = Math.min(rows, r0 + h / (2 * k));
    for (let row = r0; row < r1; row++) this.#chars.fill(undefined, row * cols + c0, row * cols + c1);
    if (!drawn.some(isArt)) {
      this.#reach(own, rect);
      return;
    }
    const scratch = ctx2d(this.#scratch ??= newCanvas(this.#own.width, this.#own.height));
    let band = [];
    const flush = () => {
      if (!band.length) return;
      scratch.clearRect(x, y, w, h);
      for (const shape of band) this.#paint(scratch, shape, k);
      this.#reach(scratch, rect);
      band = [];
    };
    for (const shape of drawn) {
      if (!isArt(shape)) {
        band.push(shape);
        continue;
      }
      flush();
      const { m, art } = shape;
      for (const [i, char] of art.cells) {
        const col = m[4] + (i % art.cols), row = m[5] / 2 + Math.floor(i / art.cols);
        if (char !== null && col >= c0 && col < c1 && row >= r0 && row < r1) this.#chars[row * cols + col] = char;
      }
    }
    flush();
  }

  // The cells of rect that what's drawn on ctx reaches (any alpha) given over to the conversion: null.
  #reach(ctx, { x, y, w, h }, chars = this.#chars) {
    const k = this.#base.scale, { data } = ctx.getImageData(x, y, w, h), cols = this.#base.cols, rows = charRowsOf(this.#base.rows);
    const c0 = x / k, r0 = y / (2 * k), cw = w / k, rh = h / (2 * k);
    for (let r = 0; r < rh; r++) {
      if (r0 + r >= rows) break;
      for (let c = 0; c < cw; c++) {
        if (c0 + c >= cols) break;
        for (let py = r * 2 * k, any = false; py < (r + 1) * 2 * k && !any; py++) {
          for (let px = c * k, o = (py * w + px) * 4 + 3; px < (c + 1) * k; px++, o += 4) {
            if (!data[o]) continue;
            chars[(r0 + r) * cols + c0 + c] = null;
            any = true;
            break;
          }
        }
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

// An art layer at k canvas pixels per grid pixel: each cell's halves as solid blocks in their colors, nothing for
// a see-through one. It sits on whole cells, so nothing is smoothed.
function paintArt(ctx, { m, art }, k) {
  for (const [i, , top, bottom] of art.cells) {
    const x = (m[4] + (i % art.cols)) * k, y = (m[5] + 2 * Math.floor(i / art.cols)) * k;
    if (top) {
      ctx.fillStyle = top;
      ctx.fillRect(x, y, k, k);
    }
    if (bottom) {
      ctx.fillStyle = bottom;
      ctx.fillRect(x, y + k, k, k);
    }
  }
}

const share = (v) => Math.min(Math.max(v, 0), 1);
const isTrimmed = ({ start = 0, end = 1 }) => share(start) > 0 || share(end) < 1;

// What a shape draws, at k canvas pixels per grid pixel, as a Path2D: its outlines, or only their stretch from
// Start to End (each clamped to 0 to 1; a tween can overshoot) as open outlines. Nothing when End isn't past Start.
export function trimmedPath(shape, k) {
  if (!isTrimmed(shape)) return new Path2D(pathData(shape, k, k));
  const [first, ...rest] = measure(shape).cut(share(shape.start ?? 0), share(shape.end ?? 1));
  return first ? new Path2D(pathData({ ...shape, points: first.points, closed: false, more: rest.map((o) => [o.closed, o.points]) }, k, k)) : new Path2D();
}

// One shape drawn at k canvas pixels per grid pixel (path: what it draws at that scale, as a Path2D, trimmedPath):
// its fill under its fill rule, then its stroke with its width, caps, joins and miter limit, centered on the
// outline or inside or outside it (strokeAlign), the sides worked out from the whole outline. An art layer, its
// cells (paintArt).
export function paintShape(ctx, shape, k, path = trimmedPath(shape, k)) {
  if (isArt(shape)) return paintArt(ctx, shape, k);
  const { rule, cap, join, miter } = strokeOf(shape);
  if (isGradient(shape.fill)) paintGradient(ctx, shape, k, path, rule);
  else if (shape.fill) {
    ctx.fillStyle = shape.fill;
    ctx.fill(path, rule);
  }
  if (shape.stroke && shape.width > 0) {
    const align = strokeAlign(shape);
    const styled = (c) => Object.assign(c, { lineWidth: shape.width * k * (align === 'center' ? 1 : 2), lineJoin: join, lineCap: cap, miterLimit: miter });
    if (isGradient(shape.stroke) || align !== 'center') paintMaskedStroke(ctx, shape, k, path, styled, align, rule);
    else {
      ctx.strokeStyle = shape.stroke;
      styled(ctx).stroke(path);
    }
  }
}

// A canvas gradient for a shape's fill or stroke, in its own unit space.
function canvasGradient(ctx, { type, stops, f = [0, 0] }) {
  const gradient = type === 'linear' ? ctx.createLinearGradient(0, 0, 1, 0) : ctx.createRadialGradient(f[0], f[1], 0, 0, 0, 1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  return gradient;
}

// A gradient stroke, or one inside or outside the outline: stroked solid into a mask over the shape's bounds (an
// aligned one at twice its width, then cut to the fill's inside or outside, under its rule, or to its side), its color or gradient
// filled into that (a gradient under its unit space's transform, as a fill's is), and the mask drawn over. Drawn
// in the gradient's space, as a fill is, the stroke's width would stretch with it. The mask is a ctx2d canvas, as
// the layer's are: one the GPU might draw would come out a shade apart from one drawing to the next.
function paintMaskedStroke(ctx, shape, k, path, styled, align, rule) {
  const b = shapeBounds(shape), x = Math.max(0, Math.floor(b.x * k)), y = Math.max(0, Math.floor(b.y * k));
  const w = Math.min(ctx.canvas.width, Math.ceil((b.x + b.w) * k)) - x, h = Math.min(ctx.canvas.height, Math.ceil((b.y + b.h) * k)) - y;
  if (w <= 0 || h <= 0) return;
  const mask = ctx2d(new OffscreenCanvas(w, h));
  mask.translate(-x, -y);
  styled(mask).stroke(path); // the stretch drawn; the sides and the inside and outside are the whole outline's
  if (align === 'left' || align === 'right') {
    mask.globalCompositeOperation = 'destination-in';
    mask.fill(sidePath(shape, align, 0, k));
  } else if (align !== 'center') {
    mask.globalCompositeOperation = align === 'inside' ? 'destination-in' : 'destination-out';
    mask.fill(isTrimmed(shape) ? new Path2D(pathData(shape, k, k)) : path, rule);
  }
  mask.globalCompositeOperation = 'source-in';
  if (!isGradient(shape.stroke)) {
    mask.fillStyle = shape.stroke;
    mask.fillRect(x, y, w, h);
    ctx.drawImage(mask.canvas, x, y);
    return;
  }
  const t = multiply(multiply(scaling(k, k), shape.m), shape.stroke.m), back = invert(t);
  const corners = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].map(([px, py]) => [back[0] * px + back[2] * py + back[4], back[1] * px + back[3] * py + back[5]]);
  const xs = corners.map(([u]) => u), ys = corners.map(([, v]) => v);
  mask.transform(...t);
  mask.fillStyle = canvasGradient(mask, shape.stroke);
  mask.fillRect(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  ctx.drawImage(mask.canvas, x, y);
}

// A gradient fill, drawn in its own unit space: the path carried into that space, then filled there under the
// gradient's transform, so it lands where it was and any stretch or turn of the gradient is exact (and its edges
// as smooth as a solid fill's).
function paintGradient(ctx, shape, k, path, rule) {
  const t = multiply(multiply(scaling(k, k), shape.m), shape.fill.m), inUnits = new Path2D();
  inUnits.addPath(path, new DOMMatrix(invert(t)));
  ctx.save();
  ctx.transform(...t);
  ctx.fillStyle = canvasGradient(ctx, shape.fill);
  ctx.fill(inUnits, rule);
  ctx.restore();
}
