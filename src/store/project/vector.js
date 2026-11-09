// The vector layer: shapes (document/shapes.js) drawn, changed, restacked and deleted, each change part of the
// edit that's open, or one of its own. this.shapes is copy-on-write, like editCells; the history, the ledger and
// rooms take a shape as a cell under its 'v:' key (sendSlice, applyChange, readCell). refreshShapes shows a
// change: only the cells the shapes covered before and after it are drawn again. The Pen's shape is one edit,
// marked _stroke.pen, from its first point until finishPen: any commit finishes it (commitEdit).
import { markRaw, watch } from 'vue';
import ShapeLayer from '@/document/ShapeLayer.js';
import { t } from '@/i18n';
import { toast } from '@/composables/useToast';
import { usePlayback } from '@/composables/usePlayback.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { IDENTITY, MOST_POINTS, MOST_SHAPES, allClosed, apply, isGradient, joined, multiply, makeShape, nearestOnOutline, newShapeKey, sameShape, separated, shapeBounds, shapeFromStranger, stacked, styleColors, withShape } from '@/document/shapes.js';
import { artBounds, artCellOf, artFromStranger, isArt } from '@/document/artLayers.js';
import { cellKey, parseKey } from '@/document/editCells.js';
import PaintLayer from '@/document/PaintLayer.js';
import { cellIndex, charRowsOf } from '@/lib/Cells.js';
import { withPins, withoutPins } from '@/document/baseRecords.js';
import { ctx2d } from '@/lib/Canvas.js';
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { bytesHeld, lockedAmong, putLayer, refusedHidden, shapesOfStack } from '@/store/project/shared.js';
import { lowerGroup } from '@/document/layerInfo.js';
import { centerOf, placedShapes } from '@/document/followers.js';
import { setPartsAt } from '@/document/tweens.js';
import { measure } from '@/document/pathLength.js';
import { readSvgFile, svgLeftOut, svgRefusal } from '@/lib/SvgFile.js';
import { combined } from '@/lib/shapeBooleans.js';
import { unitsOf, wandIn } from '@/lib/MagicWand.js';

// What the document holds is what a file, a project or a room takes back: one check for both.
const keeps = (shape) => !!shapeFromStranger(shape);

// The shapes that can press into the base: those on the vector layers directly on the bottom (hidden or not), placed
// (followers.js). One on a vector layer above a cells layer stays a shape through Bake and VECTOR's Merge down.
// ponytail: a merge for those (into the cells layer under them) is its own later merge.
const pressable = (project) => {
  const { vectors } = lowerGroup(project.layers, project.baseChars);
  return new Map([...placedShapes(project)].filter(([, shape]) => vectors.includes(shape.layer ?? 'vector')));
};
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// The vector layer a new shape goes on: the one picked, as its layer field (none for 'vector', the first one's id, which a
// shape without the field is on), else none.
function pickedVector(project) {
  const id = useWorkspaceStore().pickedLayer;
  return id !== 'vector' && project.layerById(id)?.kind === 'vector' ? id : undefined;
}

export const vectorActions = {
  // The shapes as they now are, part of the edit that's open (or one begun for them). Not while it changes an art
  // layer someone else in the room is drawing in (lockedBy): it can be selected, not moved, restacked or deleted, and
  // a toast says who's in it.
  setShapes(next) {
    this.ensureLayer();
    if (!this.paintLayer || next === this.shapes) return;
    const locked = lockedAmong(this, Object.values(this._locks).map(({ key }) => key).filter((key) => next.get(key) !== this.shapes.get(key)));
    if (locked) {
      toast(locked);
      return;
    }
    this.beginEdit();
    this.shapes = next;
    this.refreshShapes();
  },

  // Draw what the shapes changed: the grid rect they covered before and after, on the lower group's shape layer and on
  // the upper vector layers' (redrawRects).
  refreshShapes() {
    if (this.shapes.size && !this.hasVectorLayer) putLayer(this, 'vector', 'base'); // the first shape brings it
    if (this._shapeLayer) redrawRects(this, this.syncShapeLayers());
  },

  // Each shape layer told the shapes it draws (shapesOfStack): the lower group's over the base, in the layers' order, and
  // one alone for each vector layer above the group, made here when it first has shapes and dropped when the layer
  // leaves the stack. Sized to the grid. { lower, upper }: the grid rect each side changed, or null.
  syncShapeLayers() {
    const rects = { lower: null, upper: null };
    if (!this._shapeLayer) return rects;
    const { lower, upper } = shapesOfStack(this), layers = this.layers;
    const rank = (shape) => layers.findIndex((layer) => layer.id === (shape.layer ?? 'vector'));
    rects.lower = this._shapeLayer.set(lower, rank);
    for (const [id, shapes] of upper) {
      let layer = this._upperShapes.get(id);
      if (!layer) {
        if (!shapes.size) continue;
        this._upperShapes.set(id, layer = markRaw(new ShapeLayer(null)));
      }
      layer.grid(this.cols, this.rows, this.baseLayer.scale);
      const rect = layer.set(shapes);
      if (rect) rects.upper = union(rects.upper, rect);
    }
    for (const id of [...this._upperShapes.keys()]) if (!this.layerById(id)) this._upperShapes.delete(id);
    return rects;
  },

  // A new shape on top of the rest, on the vector layer picked; its key, or null at the most a document holds, or for one
  // a file wouldn't keep.
  addShape(shape) {
    this.ensureLayer();
    if (!this.paintLayer) return null;
    if (this.shapes.size >= MOST_SHAPES) {
      toast(t('vector.tooMany', { count: MOST_SHAPES }));
      return null;
    }
    const key = newShapeKey(), own = ownsEdit(this);
    const z = Math.max(0, ...[...this.shapes.values()].map((s) => s.z + 1)), added = withShape(shape, { z, layer: pickedVector(this) });
    if (!keeps(added)) return null;
    this.setShapes(new Map(this.shapes).set(key, added));
    if (own) this.commitEdit();
    return key;
  },

  // Shapes on top, in their order (a paste's copies, an SVG's art), on the vector layer picked, as one step; selected,
  // with Vector select. One a file wouldn't keep is left out; past a frame's shapes none come in, and a toast says so. fromKeys: the keys they
  // were copied from, in their order, so a follower that comes in with its path follows the path's copy; one whose link
  // couldn't be made now (its path isn't here, is an art layer, follows one itself, or is the shape) follows none. The
  // keys.
  addShapes(shapes, fromKeys = null) {
    if (this.shapes.size + shapes.length > MOST_SHAPES) {
      toast(t('vector.tooMany', { count: MOST_SHAPES }));
      return [];
    }
    this.ensureLayer();
    if (!this.paintLayer) return [];
    const own = ownsEdit(this), next = new Map(this.shapes), keys = [], workspace = useWorkspaceStore();
    let z = Math.max(0, ...[...this.shapes.values()].map((shape) => shape.z + 1));
    const copies = new Map(), layer = pickedVector(this); // a key copied from to its copy's
    shapes.forEach((shape, i) => {
      const made = makeShape({ ...shape, z, layer });
      if (!keeps(made)) return;
      const key = newShapeKey();
      next.set(key, made);
      keys.push(key);
      if (fromKeys?.[i]) copies.set(fromKeys[i], key);
      z++;
    });
    for (const key of keys) {
      const shape = next.get(key), to = shape.follow && copies.get(shape.follow.key);
      if (to) next.set(key, withShape(shape, { follow: { ...shape.follow, key: to } }));
    }
    for (const key of keys) {
      const shape = next.get(key), path = shape.follow && next.get(shape.follow.key);
      if (shape.follow && (!path || isArt(path) || path.follow || shape.follow.key === key)) next.set(key, withShape(shape, { follow: undefined, along: undefined }));
    }
    if (keys.length) this.setShapes(next);
    if (own) this.commitEdit();
    workspace.setActiveTool('vselect');
    workspace.vectorSelected = keys;
    return keys;
  },

  // An SVG file's art as shapes, on top, in the file's order (readSvgFile; it throws, with its userMessage, for a
  // file that isn't SVG). Art bigger than the grid (less 2 grid pixels each side) is scaled down into it,
  // proportions kept; any is centered. Each shape has its whole transform baked into its points (points round to
  // 1/100, and letters drawn in font units would lose their shape under a kept one), its gradient's with them, and
  // its stroke width scaled with it, once. One step; they're selected, with Vector select. Past a frame's shapes or a shape's points
  // nothing comes in, and a toast says by how much; what couldn't come in is said too. The keys.
  addSvg(text) {
    const art = readSvgFile(text), left = new Set(art.left);
    const refusal = svgRefusal(art, MOST_SHAPES - this.shapes.size);
    if (refusal) {
      toast(refusal);
      return [];
    }
    const room = (n) => Math.max(1, n - 4);
    const s = Math.min(1, ...[[this.cols, art.width], [this.rows, art.height]].filter(([, n]) => n > 0).map(([c, n]) => room(c) / n));
    const fit = [s, 0, 0, s, (this.cols - art.width * s) / 2, (this.rows - art.height * s) / 2];
    const shapes = art.items.map((item) => {
      const m = multiply(fit, item.m), [a, b, c, d] = m;
      const bake = (points) => points.map(([x, y, ix, iy, ox, oy, smooth]) => {
        const p = apply(m, x, y);
        return [p.x, p.y, a * ix + c * iy, b * ix + d * iy, a * ox + c * oy, b * ox + d * oy, smooth];
      });
      const [first, ...rest] = item.outlines, baked = (paint) => (isGradient(paint) ? { ...paint, m: multiply(m, paint.m) } : paint);
      return {
        closed: first.closed, points: bake(first.points), more: rest.map((o) => [o.closed, bake(o.points)]), m: IDENTITY,
        fill: baked(item.fill), stroke: baked(item.stroke), width: Math.min(64, Math.max(0.5, item.width * Math.sqrt(Math.abs(a * d - b * c)))),
        rule: item.rule, cap: item.cap, join: item.join, miter: item.miter,
      };
    });
    const keys = this.addShapes(shapes);
    if (keys.length < shapes.length) left.add('other');
    if (left.size) toast(svgLeftOut(left));
    return keys;
  },

  // [[key, Shape | null]]: each shape there replaced, or deleted with null. A key that's gone stays gone, one the
  // same as it was (an art layer given a Fill, which it hasn't) is no change, and a shape a file wouldn't keep
  // (squashed flat, past the limits) stays as it was: a drag stops there. An art layer with no room left for its
  // longer numbers (moved far, restacked high) says so.
  updateShapes(changes) {
    const own = ownsEdit(this);
    let next = this.shapes;
    for (const [key, shape] of changes) {
      if (!this.shapes.has(key) || sameShape(this.shapes.get(key), shape)) continue;
      if (shape && !keeps(shape)) {
        if (isArt(shape)) toast(t('art.tooBig'));
        continue;
      }
      if (next === this.shapes) next = new Map(this.shapes);
      if (shape) next.set(key, shape);
      else next.delete(key);
    }
    if (next === this.shapes) return;
    this.setShapes(next);
    if (own) this.commitEdit();
  },

  // An art layer's drawing (its art: cols, rows and cells) changed, and the layer moved by by ([dx, dy] grid pixels,
  // dy even: a drawing grown up or left keeps its cells where they were). It's one piece wherever the layer shows, so
  // with frames every frame it's on changes with it (setFramesArt). One step; false, and none, for a key that's no art
  // layer on the frame showing, or the drawing and place it has. Every copy of it (the frame showing's, and each frame's
  // own, at its own place and stacking) must be one a file would keep, or nothing changes and a toast says it's too big.
  setArtContent(key, art, [dx, dy] = [0, 0]) {
    const shape = this.shapes.get(key);
    if (!isArt(shape)) return false;
    const moved = ({ z, m, follow, along }) => artFromStranger({ z, m: [m[0], m[1], m[2], m[3], m[4] + dx, m[5] + dy], art, ...(follow && { follow }), ...(along && { along }) }); // its link kept
    const next = moved(shape);
    if (next && sameShape(next, shape)) return false;
    if (!next || (this.hasFrames && !this.frames.every(({ changes }) => !isArt(changes.get(key)?.cell) || moved(changes.get(key).cell)))) {
      toast(t('art.tooBig'));
      return false;
    }
    if (this.hasFrames) this.setFramesArt(key, next.art, [dx, dy]);
    else this.updateShapes([[key, next]]);
    return true;
  },

  // Step into an art layer, to draw in it with the usual tools (as you'd edit a symbol in Flash): the drawing is kept
  // aside (_artInside: its edit cells and paint layer, hasPaint, and the cells as you stepped in),
  // and the layer's drawing is the edit cells and paint (loadArt), where it sits on the frame showing (a follower on its
  // path: placedShapes). Each edit is then one step changing the layer on every frame it's on (commitArt), and undo goes
  // back no further than here.
  // What's pending is committed first; the selection and any float go. Leaving the ANSI tab steps out. False for a key
  // that's no art layer, when you're inside one already, or for one someone else in the room is drawing in
  // (lockedBy): one person at a time, and while the vector layer is hidden (a toast says so). An animation playing is paused first (once none of those refuses), on the frame
  // showing, as a press would, which would otherwise step out again; false too if the layer isn't on that frame.
  enterArt(key) {
    if (!isArt(this.shapes.get(key)) || this._artInside || this.lockedBy(key)) return false;
    if (this.layerHidden('vector')) { // inside, every stroke would be refused
      toast(t('layers.hiddenToast'));
      return false;
    }
    usePlayback().pause();
    this.ensureLayer();
    if (!isArt(this.shapes.get(key)) || !this.paintLayer) return false;
    this.commitPending();
    this.noteFrame(); // the frame's drawing as it is, before it's put aside
    this._float = null;
    const workspace = useWorkspaceStore();
    workspace.selection = workspace.wand = null;
    const inside = markRaw({
      key, editCells: this.editCells, paintLayer: this.paintLayer, hasPaint: this.hasPaint, snapshot: this.cells,
      entries: new WeakSet(), entered: [], dimmed: null, dimmedOver: null, writing: false, stop: null,
    });
    this._artInside = inside;
    this.paintLayer = markRaw(new PaintLayer({ cols: this.cols, rows: this.rows, scale: inside.paintLayer.scale }));
    this.loadArt();
    inside.entered = this.cells;
    inside.stop = watch(() => workspace.editorTab, (tab) => {
      if (tab !== 'output') this.leaveArt();
    }, { flush: 'sync' });
    return true;
  },

  // Step out: what's pending is committed, the drawing comes back, the layer's drawn with the shapes again, and it's
  // what's selected on VECTOR.
  leaveArt() {
    const inside = this._artInside;
    if (!inside) return;
    this.commitPending();
    inside.stop?.();
    this._float = null;
    this._frameSwaps++; // autosave: not an edit
    this.editCells = inside.editCells;
    this.paintLayer = inside.paintLayer;
    this.hasPaint = inside.hasPaint;
    this._artInside = null;
    redraw(this);
    if (this.shapes.has(inside.key)) useWorkspaceStore().vectorSelected = [inside.key];
  },

  // An edit inside an art layer, as commitEdit ends it: the edit cells and paint drawn on are read back into the
  // layer, trimmed to what's drawn (it grows past its edges and shrinks to its drawn cells, its cells staying where
  // they are; cells of it past the grid's edge are kept as they were), and that's setArtContent's one step. A follower
  // is drawn in where it shows on its path, and only its cells change: its own place stays (the path decides). The
  // stroke records nothing of its own: none of it went to the ledger (sendSlice), and its paint ends with no runs.
  // Too big for one layer, nothing changes and a toast says so.
  commitArt() {
    const inside = this._artInside, stroke = this._stroke, key = inside.key, shape = this.shapes.get(key);
    this._stroke = null;
    const layer = this.paintLayer, patch = layer.endStroke();
    this.baseLayer?.endStroke(); // nothing on it: the tools inside draw on the edit layer alone (layersFor)
    this.hasPaint = layer.hasPaint;
    if (!stroke || !isArt(shape)) return;
    // What can hold the layer's drawing now: where it was, the edit cells, and the paint this stroke touched.
    const shown = placedShapes(this).get(key) ?? shape, cols = layer.cols, rows = charRowsOf(layer.rows), k = layer.scale, box = artBounds(shown);
    const area = { c0: box.x, r0: box.y / 2, c1: box.x + box.w - 1, r1: box.y / 2 + box.h / 2 - 1 };
    const add = (col, row) => {
      area.c0 = Math.min(area.c0, col);
      area.r0 = Math.min(area.r0, row);
      area.c1 = Math.max(area.c1, col);
      area.r1 = Math.max(area.r1, row);
    };
    for (const at of this.editCells.keys()) {
      const { col, row } = parseKey(at);
      add(col, row);
    }
    for (const { x, y, w, h } of patch?.tiles ?? []) {
      add(Math.floor(x / k), Math.floor(y / k / 2));
      add(Math.ceil((x + w) / k) - 1, Math.ceil((y + h) / k / 2) - 1);
    }
    const onGrid = { c0: Math.max(0, area.c0), r0: Math.max(0, area.r0), c1: Math.min(cols - 1, area.c1), r1: Math.min(rows - 1, area.r1) };
    const drawn = onGrid.c0 <= onGrid.c1 && onGrid.r0 <= onGrid.r1 ? drawnIn(this, onGrid) : [];
    const c0 = shown.m[4], r0 = shown.m[5] / 2;
    for (const [i, ...cell] of shape.art.cells) {
      const col = c0 + i % shape.art.cols, row = r0 + Math.floor(i / shape.art.cols);
      if (col < 0 || row < 0 || col >= cols || row >= rows) drawn.push({ col, row, cell });
    }
    const made = drawn.length ? artOfCells(drawn) : { m: shown.m, art: { cols: 1, rows: 1, cells: [] } }; // all erased: an empty layer, where it was
    const by = shown === shape ? [made.m[4] - shape.m[4], made.m[5] - shape.m[5]] : [0, 0];
    inside.writing = true;
    try {
      this.setArtContent(key, made.art, by); // too big: it says so
    } finally {
      inside.writing = false;
    }
    const now = placedShapes(this).get(key) ?? shown, changed = artBounds(now);
    this.loadArt(union({ x: onGrid.c0, y: 2 * onGrid.r0, w: Math.max(0, onGrid.c1 - onGrid.c0 + 1), h: Math.max(0, 2 * (onGrid.r1 - onGrid.r0 + 1)) }, changed));
  },

  // Inside an art layer: its drawing, as it is on the frame showing, made the edit cells and paint to draw on (a ▄
  // cell its paint halves under a ▄ that's there only to show them, as the Half-block tool leaves, so it shows as ▄
  // and not the character the converter would pick for paint, and erasing a half still takes it; any other an edit
  // cell of its character, its foreground the bottom half's color and its background the top's), and shown: area,
  // the grid pixels that can have changed ({ x, y, w, h }), or null for all.
  // ponytail: the whole grid's paint is reloaded for every edit, undo and redo inside; load only the layer's box if
  // large grids lag there.
  loadArt(area = null) {
    const inside = this._artInside, shape = placedShapes(this).get(inside?.key); // where it shows
    if (!isArt(shape)) return;
    const layer = this.paintLayer, image = new ImageData(layer.cols, layer.rows), cells = new Map();
    const put = (x, y, hex) => {
      if (!hex || y >= layer.rows) return;
      const { r, g, b } = hex2rgb(hex);
      image.data.set([r, g, b, 255], 4 * (y * layer.cols + x));
    };
    const { cols } = shape.art, c0 = shape.m[4], r0 = shape.m[5] / 2;
    for (const [i, char, top, bottom] of shape.art.cells) {
      const col = c0 + i % cols, row = r0 + Math.floor(i / cols);
      if (col < 0 || row < 0 || col >= layer.cols || 2 * row >= layer.rows) continue;
      if (char === '▄') {
        put(col, 2 * row, top);
        put(col, 2 * row + 1, bottom);
        cells.set(cellKey(col, row), { char }); // isPaintBlock: it shows the paint, as ▄
      } else if (char || top || bottom) cells.set(cellKey(col, row), { ...(char && { char }), ...(bottom && { fg: bottom }), ...(top && { bg: top }) });
    }
    this._frameSwaps++; // autosave: not an edit of the document's drawing
    this.editCells = cells;
    layer.loadGrid(image);
    this.hasPaint = layer.hasPaint;
    redraw(this, area);
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
  // and doesn't fill, and selected, as the Shape tool's is. One under two points goes, with no undo step unless
  // some of it went out to a room, and the selection stays.
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
    if (shape && shape.points.length >= 2 && this.shapes.has(key)) workspace.vectorSelected = [key];
  },

  // The shapes keys, every shape beneath one of them whose bounds overlap it where it shows, and the followers of each
  // pressed path or guide named in keys (which would leave it otherwise), and so on: what a merge presses into the base
  // together, so that nothing shown changes. Never a guide, which draws nothing and stays a shape.
  // ponytail: passes until nothing's added, each O(n²) over the shapes' bounds; a stacking-ordered sweep or a spatial
  // index if merges of many shapes lag.
  pressedKeys(keys) {
    const placed = pressable(this), order = stacked(placed).filter(([, shape]) => !shape.guide);
    const named = new Set(keys.filter((key) => placed.has(key))), pressed = new Set([...named].filter((key) => !placed.get(key).guide));
    for (let size = -1; size !== pressed.size;) {
      size = pressed.size;
      for (const [key, shape] of order) if (shape.follow && (pressed.has(shape.follow.key) || named.has(shape.follow.key))) pressed.add(key);
      for (let i = order.length - 1; i >= 0; i--) { // top down: each one added is below, and looked at later
        const [key, shape] = order[i];
        if (!pressed.has(key)) continue;
        const bounds = shapeBounds(shape);
        for (let j = i - 1; j >= 0; j--) if (!pressed.has(order[j][0]) && meets(bounds, shapeBounds(order[j][1]))) pressed.add(order[j][0]);
      }
    }
    return pressed;
  },

  // The layers with the shapes pressed (a Set) in the base, as they're drawn: { base (a snapshot), shapes (the rest, and
  // every guide, which draws nothing), baseRecords (without the pins they cover, since the shapes' pixels are what shows
  // there, and with their art layers' characters) }.
  pressShapes(pressed) {
    this.syncShapeLayers();
    const lower = pressable(this);
    pressed = new Set([...pressed].filter((key) => lower.has(key)));
    const { canvas, covered, pins } = this._shapeLayer.pressed(pressed);
    const shapes = new Map([...this.shapes].filter(([key, shape]) => !pressed.has(key) || shape.guide));
    return { base: { canvas, hasPaint: true }, shapes, baseRecords: withPins(withoutPins(this.baseRecords, covered), pins) };
  },

  // VECTOR's Merge down: the shapes keys (or all of them), with those beneath that overlap them, pressed into the
  // base layer's pixels, where they stop being shapes. One whole-layer step. A still only: in an animation the
  // base is under every frame.
  mergeShapes(keys = null) {
    if (!this.image || this.hasFrames || refusedHidden(this, ['base', 'vector'])) return;
    if (this._artInside) this.leaveArt(); // a whole-layer step: on the drawing, not the art layer you're in
    this.ensureLayer();
    this.commitPending();
    const pressed = this.pressedKeys(keys ?? [...this.shapes.keys()]);
    if (!pressed.size) return; // none, or guides alone with no followers: nothing to press, and no step
    const before = { base: this.baseLayer.snapshot(), shapes: this.shapes, baseRecords: this.baseRecords };
    const after = this.pressShapes(pressed);
    const apply = ({ base, shapes, baseRecords }) => {
      this.baseLayer.restore(base);
      this.shapes = shapes;
      this.setBaseRecords(baseRecords);
      this.render();
    };
    apply(after);
    this.pushWholeLayer(() => apply(before), () => apply(after), bytesHeld(before.base, after.base));
  },

  // Make art layer: the drawing inside the selection (the Select tool's rectangle, or the Magic Wand's cells; the edit
  // layer's cells and paint, as copySelection reads them) becomes one art layer above every shape, at the cells'
  // place and trimmed to the ones that show something, and is taken out of the drawing: one step, with the layer
  // selected on VECTOR. A cell nothing was drawn on stays see-through. The key, or null (no step, and a toast says
  // why) with nothing drawn there, at the most shapes a frame holds, or a drawing too big or too wide for one layer.
  // The record is checked as a file would be, at the stacking it gets, before anything is taken out.
  makeArtLayer() {
    const workspace = useWorkspaceStore();
    const wand = workspace.activeTool === 'wand' && workspace.wand ? wandIn(workspace.wand, 'output', this.rows) : null;
    const picked = wand && unitsOf(wand.mask, wand.width).map(({ x, y }) => ({ col: x, row: y }));
    let box = workspace.selection;
    if (wand) {
      box = picked.length && { c0: Infinity, r0: Infinity, c1: -1, r1: -1 };
      for (const { col, row } of picked) {
        box.c0 = Math.min(box.c0, col);
        box.r0 = Math.min(box.r0, row);
        box.c1 = Math.max(box.c1, col);
        box.r1 = Math.max(box.r1, row);
      }
    }
    const rect = box && this.clipRect(box);
    if (!rect) return null;
    if (this._artInside) this.leaveArt(); // made from the drawing, not the art layer you're in
    const drawn = drawnIn(this, rect, wand ? new Set(picked.map(({ col, row }) => cellKey(col, row))) : null);
    if (!drawn.length) {
      toast(t('art.nothingDrawn')); // the wand's button can't tell beforehand: it's on whenever anything's drawn
      return null;
    }
    if (this.shapes.size >= MOST_SHAPES) {
      toast(t('vector.tooMany', { count: MOST_SHAPES }));
      return null;
    }
    const z = Math.max(0, ...[...this.shapes.values()].map((s) => s.z + 1)); // as addShapes stacks it: its digits count
    const art = artFromStranger({ z, ...artOfCells(drawn) });
    if (!art) {
      toast(t('art.tooBig'));
      return null;
    }
    let key = null;
    this.selectionEdit([rect], () => {
      if (wand) {
        this.eraseEditPixels(picked.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]));
        this.clearEditCells(picked);
      } else {
        this.deleteIn(rect, [this.editId]);
      }
      [key] = this.addShapes([art]);
    });
    workspace.selection = null;
    workspace.wand = null;
    workspace.editorTab = 'vector';
    return key ?? null;
  },

  // Join: the shapes keys made one, the bottom one (its key, style and place) with every outline of the rest, so
  // that an outline inside another is a hole. One step; the key, or null with under two, an art layer among them (it
  // has no outlines: joined, it would be lost), or past a shape's points.
  joinShapes(keys) {
    const order = stacked(this.shapes).filter(([key]) => keys.includes(key));
    if (order.length < 2 || order.some(([, shape]) => isArt(shape))) return null;
    const [[bottomKey, bottom], ...rest] = order, shape = joined(bottom, rest.map(([, s]) => s));
    if (!shape || !keeps(shape)) {
      toast(t('vector.joinTooBig', { count: MOST_POINTS }));
      return null;
    }
    this.updateShapes([[bottomKey, shape], ...rest.map(([key]) => [key, null])]);
    return bottomKey;
  },

  // Add or Subtract (op): the shapes keys made one, their union, or the bottom one with the rest cut out of it
  // (shapeBooleans: loadBooleans first). The result is the bottom one, its key, style and place; the rest go. One
  // step; the key, or null with under two shapes, an open outline or an art layer among them (allClosed: it has no
  // outline), past a shape's points, or nothing left (then they all go).
  combineShapes(keys, op) {
    const order = stacked(this.shapes).filter(([key]) => keys.includes(key));
    if (order.length < 2 || !order.every(([, shape]) => allClosed(shape))) return null;
    const [[bottomKey, bottom], ...rest] = order, shape = combined(bottom, rest.map(([, s]) => s), op);
    if (shape && !keeps(shape)) {
      toast(t('vector.joinTooBig', { count: MOST_POINTS }));
      return null;
    }
    this.updateShapes([[bottomKey, shape], ...rest.map(([key]) => [key, null])]);
    return shape ? bottomKey : null;
  },

  // Separate: each of the shape's outlines a shape of its own, the first keeping its key (and the path it follows, if
  // any), all where it was in the stacking order. One step; the keys, or null for a shape of one outline.
  separateShape(key) {
    const shape = this.shapes.get(key);
    if (!shape?.more) return null;
    const parts = separated(shape).map((part, i) => (i ? withShape(part, { follow: undefined, along: undefined }) : part));
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

  // Follow path: the shape or art layer followerKey follows pathKey's outline for its whole life, every record of it
  // linked (changeEverywhere), and Along keyed with each Transform key, eased as it is, at the share where that frame's
  // path comes nearest the record's own middle (centerOf), so it shows where it was and glides as it did. Elsewhere (a
  // key frame that doesn't key its Transform, whose own place isn't what shows, or a frame without the path) its Along
  // stays as it was. One step; false, with a toast, for
  // an art layer as the path, a path that follows one itself, or a follower other shapes follow (no chains), and with
  // none for a key that isn't here, or the same key twice.
  followPath(followerKey, pathKey) {
    const follower = this.shapes.get(followerKey), path = this.shapes.get(pathKey);
    if (!follower || !path || followerKey === pathKey) return false;
    const refusal = isArt(path) ? 'vector.followArt' : path.follow ? 'vector.followFollower' : followedBy(this, followerKey) ? 'vector.followIsPath' : null;
    if (refusal) {
      toast(t(refusal));
      return false;
    }
    const nearest = (shape, on) => {
      const { x, y } = centerOf(shape), { segment, t: at } = nearestOnOutline(on, x, y);
      return Math.min(1, Math.max(0, measure(on).shareOf(segment, at))); // withShape rounds it
    };
    return this.changeEverywhere([[followerKey, (shape, at) => {
      const on = at === undefined ? path : setPartsAt(this.frames, followerKey, at).has('transform') && this.resolvedOf(at).get(pathKey)?.cell;
      return withShape(shape, { follow: { key: pathKey }, along: on ? nearest(shape, on) : shape.along });
    }]], { keyLike: { along: 'transform' } });
  },

  // Stop following: each of keys back on its own Transform on every frame, its link and Along gone, and Along keyed
  // nowhere. One step.
  stopFollowing(keys) {
    return this.changeEverywhere(keys.map((key) => [key, (shape) => withShape(shape, { follow: undefined, along: undefined })]), { unkey: ['along'] });
  },

  // The link's options ({ ride, face, motion }, makeFollow's; one left out stays as it is) on every record of each of
  // keys that follows a path. One step.
  setFollow(keys, options) {
    return this.changeEverywhere(keys.map((key) => [key, (shape) => (shape.follow ? withShape(shape, { follow: { ...shape.follow, ...options, key: shape.follow.key } }) : shape)]));
  },

  // Guide on (a shape that draws nothing, its outline on VECTOR) or off, on every record of each of keys; an art layer
  // is never one. One step.
  setGuide(keys, on) {
    return this.changeEverywhere(keys.map((key) => [key, (shape) => (isArt(shape) ? shape : withShape(shape, { guide: !!on }))]));
  },
};

// Whether any record of any shape follows key: the frame showing's, and with frames each frame's own.
const followedBy = (project, key) => [...project.shapes.values()].some((shape) => shape.follow?.key === key)
  || (project.hasFrames && project.frames.some((frame) => [...frame.changes.values()].some((state) => state.cell?.follow?.key === key)));

// The cells drawn in a cell rect, by place: [{ col, row, cell }] (artCellOf, of the edit cells and their paint halves as
// copySelection reads them, of the layer in use; a half's paint counts where it's at least half there), only those keep (cell keys) has
// when it's given.
function drawnIn(project, rect, keep = null) {
  const copied = project.copySelection(rect, [project.editId], { shapes: false });
  const block = { w: copied.w, cells: new Array(copied.w * copied.h).fill(null), ...copied.parts[0] }; // none with the base in use: nothing drawn
  const paint = block.paint && ctx2d(block.paint).getImageData(0, 0, block.paint.width, block.paint.height).data, k = project.paintLayer?.scale ?? 1;
  const half = (x, y) => {
    const o = (Math.floor(y * k) * block.paint.width + Math.floor(x * k)) * 4;
    return paint && paint[o + 3] >= 128 ? rgb2hex({ r: paint[o], g: paint[o + 1], b: paint[o + 2] }) : null;
  };
  const drawn = [];
  block.cells.forEach((entry, i) => {
    const x = i % block.w, y = Math.floor(i / block.w), col = rect.c0 + x, row = rect.r0 + y;
    if (keep && !keep.has(cellKey(col, row))) return;
    const cell = artCellOf(entry, half(x, 2 * y), half(x, 2 * y + 1), project.composedCells[cellIndex(col, row, project.cols)]?.char);
    if (cell) drawn.push({ col, row, cell });
  });
  return drawn;
}

// Drawn cells ({ col, row, cell }, at least one) as an art layer's place and drawing, trimmed to them: { m, art }. A
// plain loop: a very large drawing can't overflow a spread.
function artOfCells(drawn) {
  let c0 = Infinity, r0 = Infinity, c1 = -Infinity, r1 = -Infinity;
  for (const { col, row } of drawn) {
    c0 = Math.min(c0, col);
    r0 = Math.min(r0, row);
    c1 = Math.max(c1, col);
    r1 = Math.max(r1, row);
  }
  const cols = c1 - c0 + 1, cells = drawn.map(({ col, row, cell }) => [(row - r0) * cols + col - c0, ...cell]).sort((a, b) => a[0] - b[0]);
  return { m: [1, 0, 0, 1, c0, 2 * r0], art: { cols, rows: r1 - r0 + 1, cells } };
}

// The shape layers caught up, and what shows drawn again: area, the grid pixels that can have changed ({ x, y, w, h }),
// or null for all of them.
function redraw(project, area = null) {
  const { lower, upper } = project.syncShapeLayers();
  redrawRects(project, { lower: area === null ? { x: 0, y: 0, w: project.cols, h: project.rows } : lower ? union(area, lower) : area, upper });
}

// What shows drawn again where the shape layers changed: lower, the lower group's grid rect, through the pipeline (and
// the upper layers over it), and upper, the upper vector layers', over the group's cells alone (recomposeUpper); either
// past a quarter of the grid is drawn whole (a full composite is as quick then). Not while a render's on its way (the
// grid's changed): that draws it. An open edit remembers the rects, for the cells its end works out again.
function redrawRects(project, { lower, upper }) {
  const output = project.renderer.outputCanvas, { cols, rows } = project;
  if (!output || output.width !== cols || output.height !== rows) return;
  const clip = (rect) => {
    if (!rect) return null;
    const x0 = Math.max(0, rect.x), y0 = Math.max(0, rect.y), x1 = Math.min(cols, rect.x + rect.w), y1 = Math.min(rows, rect.y + rect.h);
    return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  };
  const pixelsOf = ({ x, y, w, h }) => {
    const pixels = [];
    for (let py = y; py < y + h; py++) for (let px = x; px < x + w; px++) pixels.push({ x: px, y: py });
    return pixels;
  };
  const low = clip(lower), up = clip(upper), quarter = (cols * rows) / 4;
  if (project._stroke) for (const rect of [low, up]) if (rect) project._stroke.shapeRect = union(project._stroke.shapeRect, rect);
  if (low && low.w * low.h > quarter) { // every cell, the upper layers over them too
    if (!project.composite()) project.rebuildCells();
    return;
  }
  if (low) project.refreshCells(pixelsOf(low));
  if (!up) return;
  if (up.w * up.h > quarter) project.applyEditCells();
  else project.recomposeUpper(pixelsOf(up));
}

// Whether a change opens an edit of its own, committed with it: none's open, or a typing run is, which the
// change ends (beginEdit).
const ownsEdit = (store) => !store._stroke || (store._stroke.typing && !store._typingNow);

function union(a, b) {
  if (!a) return b;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
