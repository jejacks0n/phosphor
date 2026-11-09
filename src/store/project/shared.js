// Constants and small helpers the project store's action groups (this folder) and its getters share.
import { getSetting, SETTINGS, SETTING_KEYS, SAUCE_KEYS, RESET_GROUPS } from '@/store/settings.js';
import { markRaw } from 'vue';
import { Ledger } from '@/document/ledger.js';
import PaintLayer from '@/document/PaintLayer.js';
import { ctx2d, canvasPng } from '@/lib/Canvas.js';
import { loadImage } from '@/document/projectIO.js';
import { MOST_CHANGE_BYTES } from '@/social/wire.js';
import { isShapeKey } from '@/document/shapes.js';
import { shownShapes } from '@/document/followers.js';
import { newLayerId, nextNumber } from '@/document/layerInfo.js';
import { t } from '@/i18n';
import { toast } from '@/composables/useToast';

export const DEFAULT_COLS = getSetting('cols').default;
export const DEFAULT_ROWS = getSetting('rows').default;
export const BLANK_CANVAS_SCALE = 10;
export const TYPING_PAUSE_MS = 1000; // a pause this long ends a typing run (one undo step)

// Settings that feed the image pipeline (processParams); the rest only affect editing, saving or export.
export const PIPELINE_KEYS = SETTINGS.filter(s => s.group !== 'sauce' && s.pipeline !== false).map(s => s.key);
export const SAVED_KEYS = [...SETTING_KEYS, ...SAUCE_KEYS];
export const settingsJson = (state) => JSON.stringify(SAVED_KEYS.map(key => state[key]));
// An image's pixels on a canvas of its own.
export const copyOf = (image, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  ctx2d(canvas).drawImage(image, 0, 0);
  return canvas;
};
// A black picture cols x rows grid pixels at scale pixels each, as a blank canvas and Flatten have: { image,
// imageBuffer }. Throws when it can't be encoded.
export async function blackPicture(cols, rows, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = cols * scale;
  canvas.height = rows * scale;
  const ctx = ctx2d(canvas);
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const blob = await canvasPng(canvas);
  return { image: await loadImage(blob), imageBuffer: await blob.arrayBuffer() };
}
// randomUUID is only there on secure contexts; a plain-http LAN address has getRandomValues.
export const randomId = () => crypto.randomUUID?.()
  ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
// Runs (changes.js) as refreshChanged takes a patch, so a refresh is the pixels they name, not their tiles.
export const runsPatch = (runs) => ({ tiles: runs.map(([x, y, w]) => ({ x, y, w, h: 1 })) });
// Who the ledger knows someone drawing alone as.
export const ALONE = 'me';
// A ledger for someone drawing alone, reading the store project() gives.
export const newLedger = (project) => markRaw(new Ledger({
  readCell: (key) => project().readCell(key),
  readTile: (x, y, id) => project().readTile(x, y, id),
  numbering: false,
  mostBytes: MOST_CHANGE_BYTES,
}));
// Cells layer id's data becomes the edit layer's fields (editCells, paintLayer, hasPaint) as it is, nothing committed (that's
// useLayer's), and the layer in use waits in _layerData. A layer with no paint yet gets an empty one the size of the one
// in use. Autosave doesn't count it as an edit.
export function swapLayer(project, id) {
  const next = project._layerData.get(id), was = project.paintLayer;
  project._layerData.set(project.editId, { editCells: project.editCells, paintLayer: was, hasPaint: project.hasPaint });
  project._layerData.delete(id);
  project.editId = id;
  project._frameSwaps++;
  project.editCells = next.editCells;
  project.paintLayer = next.paintLayer ?? (was && markRaw(new PaintLayer({ cols: was.cols, rows: was.rows, scale: was.scale })));
  project.hasPaint = next.hasPaint;
}

// fn with cells layer id's data in the edit layer's fields, and the layer in use's back after: an undo step made on a layer
// writes there, whatever's picked now. For the layer in use, or one that isn't waiting in _layerData, just fn.
export function withLayer(project, id, fn) {
  const was = project.editId;
  if (id === was || !project._layerData.has(id)) return fn();
  swapLayer(project, id);
  try {
    return fn();
  } finally {
    swapLayer(project, was);
  }
}

// Whether a merge is refused because one of layers is hidden ('base', 'edit', 'vector'), with a toast saying so: hiding
// never changes the drawing. Merge up, Merge down and Into the image take a layer as it shows into another, so both
// count; Bake and the vector merge write into the base; Bake and the merges that press shapes take the vector layer's,
// so a hidden vector layer counts while it has any. Refused, nothing changes and there's no undo step.
export function refusedHidden(project, layers = ['base', 'edit']) {
  if (!layers.some((id) => project.layerHidden(id) && (project.layerById(id).kind !== 'vector' || project.shapes.size > 0))) return false;
  toast(t('layers.hiddenMergeToast'));
  return true;
}

// Whether a change to the layers' structure (adding, deleting, moving, or a merge that removes one) is refused because the
// document is shared with a room, which holds the layers it always did, with a toast saying so. fills: it adds the vector
// layer the room is missing, which is allowed (directly on the bottom, where a room's one goes).
export function refusedInRoom(project, { fills = false } = {}) {
  if (!project._sharing || fills) return false;
  toast(t('layers.notInRoom'));
  return true;
}

// A new layer of kind directly above the layer with the id above (on top when there's none), in the stack, with nothing
// on it (a cells layer's paint is made when it's first used); the layer. Not an undo step: addLayer's is, and the vector
// layer a first shape brings, or the edit layer a room is missing, has none.
export function putLayer(project, kind, above) {
  const id = newLayerId(project.layers, kind), at = project.layers.findIndex((layer) => layer.id === above) + 1 || project.layers.length;
  const layer = Object.freeze({ id, kind, n: nextNumber(project.layers, kind), name: null, hidden: false });
  project.layers = [...project.layers.slice(0, at), layer, ...project.layers.slice(at)];
  if (kind === 'cells') project._layerData.set(id, { editCells: new Map(), paintLayer: null, hasPaint: false });
  return layer;
}

// The lower group's cells layer's cells and paint (ProjectStore.lowerGroup): what the renderer's pipeline is handed. None
// while the group has no cells layer. Functions, not getters: a layer that isn't in use waits in _layerData, which isn't
// reactive, so a cached value could be stale.
const NO_CELLS = new Map();
export const lowerEdits = (project) => (project.lowerGroup.cells ? project.cellsOf(project.lowerGroup.cells) : NO_CELLS);
export const lowerPaint = (project) => (project.lowerGroup.cells ? project.paintOf(project.lowerGroup.cells) : null);

// The shapes each shape layer draws: followers on their paths and guides left out (followers.js), the art layer stepped
// into left out too (vector.js: enterArt, whose drawing is the edit cells and paint while you're inside it), and each on
// its own vector layer (a shape with no layer is on 'vector'): { lower: Map, upper: Map<id, Map> }, the lower group's
// vector layers' shapes as one map, and each upper vector layer's. A hidden vector layer's shapes are in neither. Each
// map keeps its identity while its shapes don't change, so a ShapeLayer told it redraws nothing (ShapeLayer.set).
const NO_SHAPES = new Map();
const splits = new WeakMap(); // project -> the last result
export function shapesOfStack(project) {
  const { vectors, upper: above } = project.lowerGroup, inside = project._artInside?.key;
  const lower = new Map(), upper = new Map();
  for (const id of above) if (project.layerById(id).kind === 'vector') upper.set(id, new Map());
  for (const [key, shape] of shownShapes(project.shapes)) {
    if (key === inside) continue;
    const id = shape.layer ?? 'vector';
    if (vectors.includes(id)) lower.set(key, shape);
    else upper.get(id)?.set(key, shape);
  }
  const last = splits.get(project), same = (a, b) => !!b && a.size === b.size && [...a].every(([key, shape]) => b.get(key) === shape);
  const kept = (map, was) => (same(map, was) ? was : map.size ? map : NO_SHAPES);
  const result = { lower: kept(lower, last?.lower), upper: new Map([...upper].map(([id, map]) => [id, kept(map, last?.upper.get(id))])) };
  splits.set(project, result);
  return result;
}
// A color ({ r, g, b, a }, a in 0..1) laid over another ({ r, g, b }).
export const over = (under, { r, g, b, a }) => ({ r: Math.round(under.r + (r - under.r) * a), g: Math.round(under.g + (g - under.g) * a), b: Math.round(under.b + (b - under.b) * a) });

// The Transforms, Adjustments and Image Filters settings (sliders and their colors): what a slider
// undo step records. Keyboard nudges on one slider this close together are one step.
export const SLIDER_KEYS = SETTINGS.filter(s => RESET_GROUPS.includes(s.group)).map(s => s.key);
export const NUDGE_MS = 1000;

// The rect of grid pixels ({ x, y }[]) as { x, y, w, h }, whole cells (both pixel rows of each).
export function boundsOf(pixels) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { x, y } of pixels) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  y0 &= ~1; // the cell's top pixel row
  y1 |= 1;  // and its bottom one
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Undo keeps steps up to this many bytes of pixels in all (History drops the oldest past it): a merge,
// a Clear or a Bake on a large grid holds whole copies of the layers.
export const MAX_HISTORY_BYTES = 256 * 2 ** 20;

// About how many bytes an undo step holds, for that budget: stroke patches ({ tiles }), layer
// snapshots ({ canvas }), decoded images, encoded image bytes, and maps of edit cells (a whole-grid
// Merge up makes one with an entry a cell). Missing ones count nothing.
export function bytesHeld(...held) {
  let bytes = 0;
  for (const it of held) {
    if (!it) continue;
    if (it.tiles) for (const { before } of it.tiles) bytes += 2 * before.data.length; // before and after
    else if (it.canvas) bytes += it.canvas.width * it.canvas.height * 4;
    else if (it.naturalWidth) bytes += it.naturalWidth * it.naturalHeight * 4;
    else if (it.byteLength !== undefined) bytes += it.byteLength;
    else if (it instanceof Map) bytes += it.size * 80; // a key, an entry and the map's own slot, about
  }
  return bytes;
}

// In a room, who's drawing in the first of keys that's an art layer someone other than by is drawing in (lockedBy), or
// null; and their name, never a sub.
function holderOf(project, keys, by) {
  for (const key of keys) {
    const holder = isShapeKey(key) && project.lockedBy(key);
    if (holder && holder !== by) return holder;
  }
  return null;
}
const nameOf = (project, sub) => project._locks[sub]?.name || t('social.drawing.someoneElse');

// What refuses an edit to an art layer someone else is drawing in: the words saying who, or null.
export function lockedAmong(project, keys, by = project._by) {
  const holder = holderOf(project, keys, by);
  return holder && t('art.lockedBy', { name: nameOf(project, holder) });
}

// The same for anyone else inside any art layer, which what goes to the room as the project (a whole-layer step, a new
// grid) would step out of it.
export function anyoneInside(project) {
  const holder = holderOf(project, Object.values(project._locks).map(({ key }) => key), project._by);
  return holder && t('art.someoneInside', { name: nameOf(project, holder) });
}
