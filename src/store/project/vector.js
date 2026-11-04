// The vector layer: shapes (document/shapes.js) drawn, changed, restacked and deleted, each change part of the
// edit that's open, or one of its own. this.shapes is copy-on-write, like editCells; the history, the ledger and
// rooms take a shape as a cell under its 'v:' key (sendSlice, applyChange, readCell). refreshShapes shows a
// change: only the cells the shapes covered before and after it are drawn again. The Pen's shape is one edit,
// marked _stroke.pen, from its first point until finishPen: any commit finishes it (commitEdit).
import { t } from '@/i18n';
import { toast } from '@/composables/useToast';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { IDENTITY, MOST_POINTS, MOST_SHAPES, joined, makeShape, newShapeKey, separated, shapeBounds, shapeFromStranger, stacked, styleColors, withShape } from '@/document/shapes.js';
import { withoutPins } from '@/document/baseRecords.js';
import { bytesHeld } from '@/store/project/shared.js';

// What the document holds is what a file, a project or a room takes back: one check for both.
const keeps = (shape) => !!shapeFromStranger(shape);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const vectorActions = {
  // The shapes as they now are, part of the edit that's open (or one begun for them).
  setShapes(next) {
    this.ensureLayer();
    if (!this.paintLayer || next === this.shapes) return;
    this.beginEdit();
    this.shapes = next;
    this.refreshShapes();
  },

  // Draw what the shapes changed: the grid rect they covered before and after, or every cell past a quarter of
  // the grid (a full composite is as quick then).
  refreshShapes() {
    const layer = this._shapeLayer, output = this.renderer.outputCanvas;
    if (!layer) return;
    const rect = layer.set(this.shapes);
    if (!rect || !output || output.width !== this.cols || output.height !== this.rows) return; // a render's on its way
    const x0 = Math.max(0, rect.x), y0 = Math.max(0, rect.y), x1 = Math.min(this.cols, rect.x + rect.w), y1 = Math.min(this.rows, rect.y + rect.h);
    if (x1 <= x0 || y1 <= y0) return;
    const area = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    if (this._stroke) this._stroke.shapeRect = union(this._stroke.shapeRect, area);
    if (area.w * area.h > (this.cols * this.rows) / 4) {
      if (!this.composite()) this.rebuildCells();
      return;
    }
    const pixels = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pixels.push({ x, y });
    this.refreshCells(pixels);
  },

  // A new shape on top of the rest; its key, or null at the most a document holds, or for one a file wouldn't keep.
  addShape(shape) {
    this.ensureLayer();
    if (!this.paintLayer) return null;
    if (this.shapes.size >= MOST_SHAPES) {
      toast(t('vector.tooMany', { count: MOST_SHAPES }));
      return null;
    }
    const key = newShapeKey(), own = ownsEdit(this);
    const z = Math.max(0, ...[...this.shapes.values()].map((s) => s.z + 1)), added = withShape(shape, { z });
    if (!keeps(added)) return null;
    this.setShapes(new Map(this.shapes).set(key, added));
    if (own) this.commitEdit();
    return key;
  },

  // [[key, Shape | null]]: each shape there replaced, or deleted with null. A key that's gone stays gone, and a
  // shape a file wouldn't keep (squashed flat, past the limits) stays as it was: a drag stops there.
  updateShapes(changes) {
    const own = ownsEdit(this);
    let next = this.shapes;
    for (const [key, shape] of changes) {
      if (!this.shapes.has(key) || this.shapes.get(key) === shape || (shape && !keeps(shape))) continue;
      if (next === this.shapes) next = new Map(this.shapes);
      if (shape) next.set(key, shape);
      else next.delete(key);
    }
    if (next === this.shapes) return;
    this.setShapes(next);
    if (own) this.commitEdit();
  },

  deleteShapes(keys) {
    this.updateShapes(keys.map((key) => [key, null]));
  },

  // The Pen: a point on the shape it's drawing, or a shape begun with it, in workspace.vectorStyle's colors (one
  // with neither gets the foreground as its fill). out: a smooth point's out handle, its in handle opposite.
  // The shape's key, or null.
  penPoint(x, y, out = null) {
    const point = out ? [x, y, -out.x, -out.y, out.x, out.y, 1] : [x, y, 0, 0, 0, 0, 0];
    const key = this._stroke?.pen, shape = key && this.shapes.get(key);
    if (shape) {
      if (shape.points.length < MOST_POINTS) this.updateShapes([[key, withShape(shape, { points: [...shape.points, point] })]]);
      return key;
    }
    this.beginEdit();
    if (!this._stroke) return null;
    const workspace = useWorkspaceStore(), style = styleColors(workspace);
    if (!style.fill && !style.stroke) style.fill = workspace.editFgColor;
    const added = this.addShape(makeShape({ points: [point], closed: false, m: IDENTITY, ...style }));
    if (!added) return null;
    this._stroke.pen = added;
    workspace.vectorPen = added;
    return added;
  },

  // Backspace while the Pen draws: its last point goes, and with it the last, the shape.
  penBack() {
    const key = this._stroke?.pen, shape = key && this.shapes.get(key);
    if (!shape) return;
    if (shape.points.length > 1) this.updateShapes([[key, withShape(shape, { points: shape.points.slice(0, -1) })]]);
    else this.finishPen();
  },

  // The Pen's shape as it's left: closed, or an open curve, which strokes (its stroke, or the foreground color)
  // and doesn't fill. One under two points goes, with no undo step unless some of it went out to a room.
  finishPen({ closed = false } = {}) {
    const stroke = this._stroke, key = stroke?.pen;
    if (!key) return;
    stroke.pen = null;
    const workspace = useWorkspaceStore(), shape = this.shapes.get(key);
    workspace.vectorPen = null;
    if (!shape || shape.points.length < 2) {
      if (!stroke.sent) return this.cancelEdit();
      if (shape) this.deleteShapes([key]);
    } else if (closed) this.updateShapes([[key, withShape(shape, { closed: true })]]);
    else {
      const fg = workspace.editFgNone ? null : workspace.editFgColor;
      this.updateShapes([[key, withShape(shape, { fill: null, stroke: shape.stroke ?? fg ?? shape.fill })]]);
    }
    this.commitEdit();
  },

  // The shapes keys, and every shape beneath one of them whose bounds overlap it, and so on down: what a merge
  // presses into the base together, so that nothing shown changes.
  pressedKeys(keys) {
    const order = stacked(this.shapes), pressed = new Set(keys.filter((key) => this.shapes.has(key)));
    for (let i = order.length - 1; i >= 0; i--) { // top down: each one added is below, and looked at later
      const [key, shape] = order[i];
      if (!pressed.has(key)) continue;
      const bounds = shapeBounds(shape);
      for (let j = i - 1; j >= 0; j--) if (!pressed.has(order[j][0]) && meets(bounds, shapeBounds(order[j][1]))) pressed.add(order[j][0]);
    }
    return pressed;
  },

  // The layers with the shapes pressed (a Set) in the base: { base (a snapshot), shapes (the rest), baseRecords
  // (without the pins they cover, since the shapes' pixels are what shows there) }.
  pressShapes(pressed) {
    this._shapeLayer.set(this.shapes);
    const { canvas, covered } = this._shapeLayer.pressed(pressed);
    const shapes = new Map([...this.shapes].filter(([key]) => !pressed.has(key)));
    return { base: { canvas, hasPaint: true }, shapes, baseRecords: withoutPins(this.baseRecords, covered) };
  },

  // VECTOR's Merge down: the shapes keys (or all of them), with those beneath that overlap them, pressed into the
  // base layer's pixels, where they stop being shapes. One whole-layer step. A still only: in an animation the
  // base is under every frame.
  mergeShapes(keys = null) {
    if (!this.image || this.hasFrames) return;
    this.ensureLayer();
    this.commitPending();
    const chosen = keys ?? [...this.shapes.keys()];
    if (!chosen.some((key) => this.shapes.has(key))) return;
    const before = { base: this.baseLayer.snapshot(), shapes: this.shapes, baseRecords: this.baseRecords };
    const after = this.pressShapes(this.pressedKeys(chosen));
    const apply = ({ base, shapes, baseRecords }) => {
      this.baseLayer.restore(base);
      this.shapes = shapes;
      this.setBaseRecords(baseRecords);
      this.render();
    };
    apply(after);
    this.pushWholeLayer(() => apply(before), () => apply(after), bytesHeld(before.base, after.base));
  },

  // Join: the shapes keys made one, the bottom one (its key, style and place) with every outline of the rest, so
  // that an outline inside another is a hole. One step; the key, or null with under two or past a shape's points.
  joinShapes(keys) {
    const order = stacked(this.shapes).filter(([key]) => keys.includes(key));
    if (order.length < 2) return null;
    const [[bottomKey, bottom], ...rest] = order, shape = joined(bottom, rest.map(([, s]) => s));
    if (!shape || !keeps(shape)) {
      toast(t('vector.joinTooBig', { count: MOST_POINTS }));
      return null;
    }
    this.updateShapes([[bottomKey, shape], ...rest.map(([key]) => [key, null])]);
    return bottomKey;
  },

  // Separate: each of the shape's outlines a shape of its own, the first keeping its key, all where it was in
  // the stacking order. One step; the keys, or null for a shape of one outline.
  separateShape(key) {
    const shape = this.shapes.get(key);
    if (!shape?.more) return null;
    const parts = separated(shape);
    if (this.shapes.size - 1 + parts.length > MOST_SHAPES) {
      toast(t('vector.tooMany', { count: MOST_SHAPES }));
      return null;
    }
    const keys = [key, ...parts.slice(1).map(() => newShapeKey())], own = ownsEdit(this);
    this.ensureLayer();
    if (!this.paintLayer) return null;
    const next = new Map(this.shapes);
    keys.forEach((k, i) => next.set(k, parts[i]));
    this.setShapes(next);
    if (own) this.commitEdit();
    return keys;
  },

  // Each shape moves in the stacking order to just above the nearest shape it overlaps above it (forward), or
  // just beneath the nearest beneath it (back); one with none there stays. Every other pair keeps its order:
  // the shapes are numbered again from the bottom, and those whose number changed are the step.
  restackShapes(keys, direction) {
    const order = stacked(this.shapes).map(([key]) => key);
    const moving = new Set(keys), up = direction === 'forward', sequence = up ? [...order].reverse() : [...order];
    for (const key of sequence) {
      if (!moving.has(key)) continue;
      const at = order.indexOf(key), bounds = shapeBounds(this.shapes.get(key));
      for (let i = at + (up ? 1 : -1); i >= 0 && i < order.length; i += up ? 1 : -1) {
        const other = order[i];
        if (moving.has(other) || !meets(bounds, shapeBounds(this.shapes.get(other)))) continue;
        order.splice(at, 1);
        order.splice(i, 0, key);
        break;
      }
    }
    this.updateShapes(order.flatMap((key, z) => (this.shapes.get(key).z === z ? [] : [[key, withShape(this.shapes.get(key), { z })]])));
  },
};

// Whether a change opens an edit of its own, committed with it: none's open, or a typing run is, which the
// change ends (beginEdit).
const ownsEdit = (store) => !store._stroke || (store._stroke.typing && !store._typingNow);

function union(a, b) {
  if (!a) return b;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
