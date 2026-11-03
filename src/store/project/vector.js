// The vector layer: shapes (document/shapes.js) drawn, changed, restacked and deleted, each change part of the
// edit that's open, or one of its own. this.shapes is copy-on-write, like editCells; the history, the ledger and
// rooms take a shape as a cell under its 'v:' key (sendSlice, applyChange, readCell). refreshShapes shows a
// change: only the cells the shapes covered before and after it are drawn again.
import { t } from '@/i18n';
import { toast } from '@/composables/useToast';
import { MOST_SHAPES, newShapeKey, shapeBounds, stacked, withShape } from '@/document/shapes.js';

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

  // A new shape on top of the rest; its key, or null at the most a document holds.
  addShape(shape) {
    this.ensureLayer();
    if (!this.paintLayer) return null;
    if (this.shapes.size >= MOST_SHAPES) {
      toast(t('vector.tooMany', { count: MOST_SHAPES }));
      return null;
    }
    const key = newShapeKey(), own = ownsEdit(this);
    const z = Math.max(0, ...[...this.shapes.values()].map((s) => s.z + 1));
    this.setShapes(new Map(this.shapes).set(key, withShape(shape, { z })));
    if (own) this.commitEdit();
    return key;
  },

  // [[key, Shape | null]]: each shape there replaced, or deleted with null. A key that's gone stays gone.
  updateShapes(changes) {
    const own = ownsEdit(this);
    let next = this.shapes;
    for (const [key, shape] of changes) {
      if (!this.shapes.has(key) || this.shapes.get(key) === shape) continue;
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

  // Each shape swaps places in the stacking order with the nearest shape it overlaps above it (forward) or
  // beneath it (back); one with none there stays.
  restackShapes(keys, direction) {
    const order = stacked(this.shapes).map(([key]) => key);
    const moving = new Set(keys), z = new Map([...this.shapes].map(([key, shape]) => [key, shape.z]));
    const up = direction === 'forward', sequence = up ? [...order].reverse() : order;
    for (const key of sequence) {
      if (!moving.has(key)) continue;
      const at = order.indexOf(key), bounds = shapeBounds(this.shapes.get(key));
      for (let i = at + (up ? 1 : -1); i >= 0 && i < order.length; i += up ? 1 : -1) {
        const other = order[i];
        if (moving.has(other) || !meets(bounds, shapeBounds(this.shapes.get(other)))) continue;
        const [za, zb] = [z.get(key), z.get(other)];
        z.set(key, za === zb ? zb + (up ? 1 : -1) : zb);
        z.set(other, za);
        order.splice(at, 1);
        order.splice(i, 0, key);
        break;
      }
    }
    this.updateShapes([...z].filter(([key, value]) => value !== this.shapes.get(key).z).map(([key, value]) => [key, withShape(this.shapes.get(key), { z: value })]));
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
