// Constants and small helpers the project store's action groups (this folder) and its getters share.
import { getSetting, SETTINGS, SETTING_KEYS, SAUCE_KEYS, RESET_GROUPS } from '@/store/settings.js';
import { markRaw } from 'vue';
import { Ledger } from '@/document/ledger.js';
import PaintLayer from '@/document/PaintLayer.js';
import ShapeLayer from '@/document/ShapeLayer.js';
import { ctx2d, canvasPng } from '@/lib/Canvas.js';
import { loadImage } from '@/document/projectIO.js';
import { findUniform, markUniform } from '@/lib/ImageProcessor.js';
import { MOST_CHANGE_BYTES, cellsFitAnyGrid } from '@/social/wire.js';
import { MAX_CELLS, cellIndex, charRowsOf, halfColors, mix, opensToPaint } from '@/lib/Cells.js';
import { cellWidth } from '@/lib/CharWidth.js';
import { hex2rgb, rgb2hex } from '@/lib/ColorUtils.js';
import { decodeBlocks, decodeFont, drawnWidthOf } from '@/lib/BitmapFont.js';
import { decodeLines, decodeSets } from '@/lib/FontLines.js';
import { isShapeKey } from '@/document/shapes.js';
import { shownShapes } from '@/document/followers.js';
import { layerChars, layerKey, newLayerId, nextNumber } from '@/document/layerInfo.js';
import { hashCell, hashPixel, pack } from '@/document/changes.js';
import { isCharPin, withoutPins } from '@/document/baseRecords.js';
import { cellKey, isFrozen } from '@/document/editCells.js';
import { plainActions } from '@/store/project/combineActions.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { t } from '@/i18n';
import { toast } from '@/composables/useToast';

// The project for one pass of reads that changes nothing between them (a Merge down's freeze, a Cells fill's looks
// on the base): each field and getter read from the store once and kept, and the actions called as written, on this
// view, so the actions they call come here too. Through the store, Pinia's wrapping of every call and Vue's reads were
// most of such a pass's time, half a million cells at the limit (issue #231). A write goes to the store and drops
// what was kept of it.
// The getters that give a function of one id, whose answers are kept by it too.
const BY_ID = new Set(['cellsOf', 'paintOf', 'layerById', 'charsOf', 'layerHidden']);
export function readsOf(project) {
  const kept = new Map();
  const view = new Proxy({}, {
    get(_, key) {
      if (kept.has(key)) return kept.get(key);
      const action = plainActions[key];
      let value = action ? action.bind(view) : project[key];
      if (BY_ID.has(key)) {
        const of = value, answers = new Map();
        value = (id) => {
          if (!answers.has(id)) answers.set(id, of(id));
          return answers.get(id);
        };
      }
      kept.set(key, value);
      return value;
    },
    set(_, key, value) {
      project[key] = value;
      kept.delete(key);
      return true;
    },
  });
  return view;
}

// decodeFont's last answer, so the getter doesn't decode the same string for each store. blocks: the drawing's own
// (fontBlocks), when they decode; else the font has none and they're found.
let lastFont = { text: '', name: '', blocks: '', lines: '', sets: '', width: '', nine: false, font: null };
function fontFor(text, name, blocks, lines, sets, width, nine) {
  if (!text) return null;
  if (lastFont.text !== text || lastFont.name !== name || lastFont.blocks !== blocks || lastFont.lines !== lines || lastFont.sets !== sets || lastFont.width !== width || lastFont.nine !== nine) {
    const font = decodeFont(text, name), set = decodeBlocks(blocks), l = decodeLines(lines), s = decodeSets(sets);
    // width: fontWidth when it's the font's own narrow width (else the font is drawn at 8, or 9 with letter spacing 9)
    const cellWidth = font && drawnWidthOf(font, width, nine), narrow = font && cellWidth < 8 ? cellWidth : null;
    lastFont = { text, name, blocks, lines, sets, width, nine, font: font && { ...font, ...(narrow && { width: narrow }), cellWidth, ...(set && { blocks: set }), ...(l && { lines: l }), ...(s && { sets: s }) } };
  }
  return lastFont.font;
}
// Letter spacing 9px: the SAUCE field, or with it unset, the 9px flag.
export const ninePx = (state) => state.sauceLetterSpacing === '9' || (state.sauceLetterSpacing === '' && state.sauceUse9pxFont);
// The drawing's font as settings (the store's, or a document's about to open) give it: drawingFont.
export const drawingFontOf = (settings) => fontFor(settings.fontBitmap, settings.fontName, settings.fontBlocks, settings.fontLines, settings.fontSets, settings.fontWidth, ninePx(settings));

export const DEFAULT_COLS = getSetting('cols').default;
export const DEFAULT_ROWS = getSetting('rows').default;
export const BLANK_CANVAS_SCALE = 10;
export const TYPING_PAUSE_MS = 1000; // a pause this long ends a typing run (one undo step)

// Settings that feed the image pipeline (processParams); the rest only affect editing, saving or export.
export const PIPELINE_KEYS = SETTINGS.filter(s => s.group !== 'sauce' && s.pipeline !== false).map(s => s.key);
export const SAVED_KEYS = [...SETTING_KEYS, ...SAUCE_KEYS];
export const settingsJson = (state) => JSON.stringify(SAVED_KEYS.map(key => state[key]));
// What isDirty compares with the last save: the settings and every layer's own character settings, name and eye.
export const savedJson = (state) => settingsJson(state) + JSON.stringify(state.layers.map((layer) => [layer.chars ?? null, layer.name, layer.hidden]));
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
  const blob = await canvasPng(canvas), image = await loadImage(blob);
  markUniform(image, 'black');
  return { image, imageBuffer: await blob.arrayBuffer() };
}
// The picture drawn again at scaleY its height, nearest neighbor so a grid pixel stays one color, both sides lowered
// alike to stay within the 16M pixels a canvas can be: { image, imageBuffer }. A working copy taking a font of another
// height (font.js), its pixels grid pixels that change shape with the cells.
export async function stretchedPicture(image, scaleY) {
  const w = image.naturalWidth || image.width, h = Math.max(1, Math.round((image.naturalHeight || image.height) * scaleY));
  const k = Math.min(1, Math.sqrt(16_000_000 / (w * h)));
  const canvas = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.floor(w * k)), height: Math.max(1, Math.floor(h * k)) });
  const ctx = ctx2d(canvas);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await canvasPng(canvas), picture = await loadImage(blob), imageBuffer = await blob.arrayBuffer();
  findUniform(picture, imageBuffer);
  return { image: picture, imageBuffer };
}
// base (a PaintLayer) as the base layer: the renderer draws it, and the base's vector shapes draw over it.
export function useBase(project, base) {
  project.baseLayer = base;
  project.renderer.baseLayer = base;
  project._shapeLayer = markRaw(new ShapeLayer(base));
  project.renderer.shapes = project._shapeLayer;
}
// randomUUID is only there on secure contexts; a plain-http LAN address has getRandomValues.
export const randomId = () => crypto.randomUUID?.()
  ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
// Runs (changes.js) as refreshChanged takes a patch, so a refresh is the pixels they name, not their tiles.
export const runsPatch = (runs) => ({ tiles: runs.map(([x, y, w]) => ({ x, y, w, h: 1 })) });
// Whether a stranger's project's cells, the edit layer's or each layer's in the stack form, are no more than a layer holds
// and all on some grid. MAX_CELLS is one layer's, so layers aren't added together.
export const cellsFit = ({ editCells, layerParts }) => [editCells, ...Array.from(layerParts?.values() ?? [], (part) => part.editCells)]
  .every((cells) => cells.size <= MAX_CELLS && cellsFitAnyGrid([...cells]));
// Every layer of a stack (bottom first: a document's layers, or a layers message's) above the bottom, id to kind: the
// layers a change in a room may name (wire.js readChange).
export const stackKinds = (layers) => new Map(layers.slice(1).map(({ id, kind }) => [id, kind]));
// The stack as a layers message says it (wire.js): each layer's id, kind, name and character settings (none for the bottom,
// whose are the document's, and none for a layer whose own were undone back to none). Hidden stays each person's own.
export const stackOnWire = (project) => project.layers.map(({ id, kind, name, chars }) => ({ id, kind, name, ...(chars && { chars }) }));
// A layer's part of the check (changes.js) as the document has it: a vector layer's shapes, or a cells layer's cells and paint
// (the layer in use's kept aside inside an art layer).
export function layerSum(project, id) {
  let sum = 0;
  if (project.layerById(id)?.kind === 'vector') {
    for (const [key, shape] of project.shapes) if ((shape.layer ?? 'vector') === id) sum ^= hashCell(key, shape);
    return sum;
  }
  const { editCells, paintLayer } = id === project.editId ? project._artInside ?? project : project._layerData.get(id) ?? {};
  for (const [key, entry] of editCells ?? []) sum ^= hashCell(layerKey(id, key), entry);
  if (!paintLayer?.hasPaint) return sum;
  const { width, height } = paintLayer.canvas, { data } = ctx2d(paintLayer.canvas).getImageData(0, 0, width, height);
  for (let i = 3, at = 0; i < data.length; i += 4, at++) {
    if (data[i]) sum ^= hashPixel(at % width, Math.floor(at / width), pack(data, i - 3), id);
  }
  return sum;
}
// In a room, a layer about to leave the stack: the ledger and an artist's Pending let go of what they hold on it, and their
// sums lose its share, read before it goes. A host's own picture is the agreed one once what's heard is written.
export function dropFromSums(project, id) {
  const { pending, screen, role } = project._sharing;
  if (role === 'host') project.flushHeard();
  const share = layerSum(project, id);
  project._ledger.dropLayer(id, share);
  if (!pending) return;
  pending.dropLayer(id, share);
  screen.take(); // only read
}
// runs (changes.js) written on the paint of the layer each names, nothing refreshed: the layer in use's is the drawing's
// (kept aside inside an art layer). A cells layer with no paint yet gets one; a layer that isn't there gets nothing.
export function writeLayerRuns(project, runs) {
  const byLayer = new Map();
  for (const run of runs) {
    const id = run[4] ?? 'edit';
    if (!byLayer.has(id)) byLayer.set(id, []);
    byLayer.get(id).push(run);
  }
  for (const [id, own] of byLayer) {
    const drawing = id === project.editId ? project._artInside ?? project : project._layerData.get(id);
    if (!drawing) continue;
    drawing.paintLayer ??= paintFrom(project.paintLayer);
    drawing.paintLayer.writeRuns(own);
    drawing.hasPaint = drawing.paintLayer.hasPaint;
  }
}
// Who the ledger knows someone drawing alone as.
export const ALONE = 'me';
// A ledger for someone drawing alone, reading the store project() gives.
export const newLedger = (project) => markRaw(new Ledger({
  readCell: (key) => project().readCell(key),
  reader: () => project().cellReader(),
  readTile: (x, y, id) => project().readTile(x, y, id),
  numbering: false,
  mostBytes: MOST_CHANGE_BYTES,
}));
// The bottom's stand-in for the edit layer's fields while it's the layer in use (editId 'base'): no cells (frozen), and an
// empty paint layer nothing paints into, kept while its size is right. What's drawn then goes on the base (onBottom).
const BASE_CELLS = Object.freeze(new Map());
function baseFields(project, was) {
  let paint = project._basePaint;
  if (was && (!paint || paint.hasPaint || paint.cols !== was.cols || paint.rows !== was.rows || paint.scale !== was.scale)) {
    paint = project._basePaint = markRaw(new PaintLayer({ cols: was.cols, rows: was.rows, scale: was.scale }));
  }
  return { editCells: BASE_CELLS, paintLayer: paint, hasPaint: false };
}

// Whether the edit layer's fields are the bottom's (the base picked, outside an art layer): what the tools draw goes on
// the base itself, cells as pins and pixels (writeBaseCells), paint as base pixels.
export const onBottom = (project) => project.editId === 'base' && !project._artInside;

// docs/model.md R13: Monochrome ASCII shows a pin as its character in white on black, so paint (or the Eraser's black)
// laid on the base there can't recolor one: the cells it lands in lose their pins, before the paint, as part of the edit,
// and convert again. Each keeps its look in its two pixels (the halves the PIXEL view draws, R11), not the background
// over foreground it was stored as, so a half the paint misses shows as it did (bare, a pinned space's black over white
// showed as bands along a soft edge). A pinned ▄ is pixels outside ANSI already (Renderer.pinAt), its look its pixels,
// and stays, so what ANSI shows comes back (Colors only pins one); a ▄ that's a character is taken as any (R15). The
// other styles show a pin's colors, and it stays, recolored (R2).
export function takePins(project, pixels) {
  const { pins } = project.baseRecords;
  if (project.renderStyle !== 'ascii' || !pins.size) return;
  const cells = new Map();
  for (const { x, y } of pixels) {
    const key = `${x},${y >> 1}`, pin = pins.get(key);
    if (pin !== undefined && (pin !== '▄' || isCharPin(project.baseRecords, key))) cells.set(key, { col: x, row: y >> 1 });
  }
  if (!cells.size) return;
  project.ensureLayer();
  project.beginEdit();
  const params = project.processParams;
  project.writeBase([...cells.values()].flatMap(({ col, row }) => (project.renderer.baseLook(col, row, params) ?? []).map((half, k) => ({ x: col, y: 2 * row + k, hex: rgb2hex(half) }))));
  project.setBaseRecords(withoutPins(project.baseRecords, [...cells.values()]));
}

// What typing pushes past a row's right edge (Insert and Partial shift the row: shiftCells, shiftBaseCells), remembered so
// a left shift of the row (Backspace there, Delete) brings it back cell for cell: project._pastEdge = { at, rows:
// Map<'layer id|row', slot[]> }, a row's slots nearest the edge first, null for a gap. A layer's slot is { entry, paint }
// (its cell's paint, a canvas, when the paint moved with it); the base's { pin, index, pixels }. In memory only: never
// saved, never sent to a room (what comes back is an edit like any other). It belongs to the canvas width and frame it
// was made on (at) and starts over anywhere else, and after anything that replaces a whole layer (pushWholeLayer); each
// change makes a new one, so an undo step keeps the one before it and the one after (commitEdit). Not inside an art
// layer, whose drawing isn't the canvas's row. Returns the row's slots on the layer in use, and keep(slots), which
// remembers them in their place.
export function pastEdge(project, row) {
  if (project._artInside) return { was: [], keep() {} };
  const at = [project.cols, project.currentFrame];
  const kept = project._pastEdge?.at.every((v, i) => v === at[i]) ? project._pastEdge.rows : new Map();
  const name = `${project.editId}|${row}`, was = kept.get(name) ?? [];
  const keep = (slots) => {
    const next = [...slots];
    while (next.length && !next.at(-1)) next.pop(); // nothing further out: a gap there is no memory
    if (!next.length && !was.length) return;
    const stroke = project._stroke;
    if (stroke && stroke.pastEdge === undefined) stroke.pastEdge = project._pastEdge ?? null;
    const rows = new Map(kept);
    if (next.length) rows.set(name, next);
    else rows.delete(name);
    project._pastEdge = { at, rows };
  };
  return { was, keep };
}

// A line or column step (insertLine, deleteLine, insertColumn, deleteColumn) moves the picked layer's rows out from under
// what typing pushed past their edge (pastEdge), so the layer's memory of it goes, with the step: its undo puts it back.
export function forgetPastEdge(project) {
  const rows = project._pastEdge?.rows, mine = `${project.editId}|`;
  if (project._artInside || !rows || ![...rows.keys()].some((name) => name.startsWith(mine))) return;
  const stroke = project._stroke;
  if (stroke && stroke.pastEdge === undefined) stroke.pastEdge = project._pastEdge;
  project._pastEdge = { at: project._pastEdge.at, rows: new Map([...rows].filter(([name]) => !name.startsWith(mine))) };
}

// The moves a line or column step makes on the picked layer, a line (axis 'row') or column ('col') put in at at (delta 1)
// or taken out there (-1): [{ span, from, dx, dy }], span the cell rect that changes, from the part of it that moves (null:
// none) by dx, dy; what would move past the grid's edge goes, and the line or column left behind is empty. A column
// starts a column early on a row where the layer's own character there (an entry, on the base a pin) is wide, so the
// character moves, or goes, whole. None for a line or column off the grid.
export function lineMoves(project, axis, at, delta) {
  const { cols } = project, last = charRowsOf(project.rows) - 1, rows = axis === 'row';
  const move = (span) => ({ span, from: delta > 0 ? span : project.clipRect(rows ? { ...span, r0: span.r0 + 1 } : { ...span, c0: span.c0 + 1 }), dx: rows ? 0 : delta, dy: rows ? delta : 0 });
  if (rows) return at >= 0 && at <= last ? [move({ c0: 0, r0: at, c1: cols - 1, r1: last })] : [];
  if (at < 0 || at >= cols) return [];
  const own = onBottom(project) ? (col, row) => project.baseRecords.pins.get(cellKey(col, row)) : (col, row) => project.editCells.get(cellKey(col, row))?.char;
  const spans = [];
  for (let row = 0; row <= last; row++) {
    const lead = at > 0 && own(at - 1, row), c0 = lead && cellWidth(lead) === 2 ? at - 1 : at, run = spans.at(-1);
    if (run?.c0 === c0) run.r1 = row;
    else spans.push({ c0, r0: row, c1: cols - 1, r1: row });
  }
  return spans.map(move);
}

// Cells layer id's data (or the bottom's, baseFields) becomes the edit layer's fields (editCells, paintLayer, hasPaint) as
// it is, nothing committed (that's useLayer's), and the layer in use waits in _layerData. A layer with no paint yet gets an
// empty one the size of the one in use. Autosave doesn't count it as an edit.
export function swapLayer(project, id) {
  const was = project.paintLayer;
  // A deleted last cells layer's fields are no layer's (refusedNoCells): not kept, and empty when swapped back to.
  const next = id === 'base' ? baseFields(project, was) : project._layerData.get(id) ?? { editCells: new Map(), paintLayer: null, hasPaint: false };
  if (project.editId !== 'base' && project.layerById(project.editId)) project._layerData.set(project.editId, { editCells: project.editCells, paintLayer: was, hasPaint: project.hasPaint });
  project._layerData.delete(id);
  project.editId = id;
  project._frameSwaps++;
  project.editCells = next.editCells;
  project.paintLayer = next.paintLayer ?? (was && markRaw(new PaintLayer({ cols: was.cols, rows: was.rows, scale: was.scale })));
  project.hasPaint = next.hasPaint;
}

// Whether a layer's data can be swapped into the edit layer's fields: a cells layer waiting in _layerData, or the bottom.
export const swappable = (project, id) => id === 'base' || project._layerData.has(id);

// fn with cells layer id's data in the edit layer's fields, and the layer in use's back after: an undo step made on a layer
// writes there, whatever's picked now. For the layer in use, or one that isn't waiting in _layerData, just fn.
export function withLayer(project, id, fn) {
  const was = project.editId;
  if (id === was || !swappable(project, id)) return fn();
  swapLayer(project, id);
  try {
    return fn();
  } finally {
    swapLayer(project, was);
  }
}

// Whether a merge is refused because one of the layers with the ids is hidden, with a toast saying so: hiding never
// changes the drawing, and what's hidden is never merged (nor lost). A vector layer counts only while it has shapes of its
// own. Refused, nothing changes and there's no undo step.
export function refusedHidden(project, ids) {
  const counts = (id) => {
    const layer = project.layerById(id);
    return !!layer?.hidden && (layer.kind !== 'vector' || [...project.shapes.values()].some((shape) => (shape.layer ?? 'vector') === id));
  };
  if (!ids.some(counts)) return false;
  toast(t('layers.hiddenMergeToast'));
  return true;
}

// Whether the picture runs past the edge of a cols x rows grid: a crop cut it (rendering.js: cropTo), or a canvas
// resize shrank the grid over it. Then a change of size or font holds the grid, as with something drawn (a canvas
// resize, a regrid), rather than refitting the picture whole again. A picture fitted to the grid never runs past it,
// whatever the cell's shape. The grid it's read on is the one the fit was for: ensureLayer reads it after the grid
// has changed.
export function fitHeld(project, cols = project.cols, rows = project.rows) {
  const fit = project.fit;
  return !!fit && !!project.image && (fit.dx < 0 || fit.dy < 0 || fit.dx + fit.dw > cols || fit.dy + fit.dh > rows);
}

// values as the document's settings: patched in, except the object settings (solverOptions, filterOptions), which are
// replaced (a patch merges objects, and keeps a ref that was dropped, or more than a file holds).
const OBJECT_KEYS = SETTINGS.filter((s) => s.object).map((s) => s.key);
export function putSettings(store, values) {
  store.$patch(Object.fromEntries(Object.entries(values).filter(([key]) => !OBJECT_KEYS.includes(key))));
  for (const key of OBJECT_KEYS) if (values[key]) store[key] = values[key];
}

// A layer's name as shown (useLayerName's, in the store): its own, else "Base", "Layer n" or "Vector n".
export const layerName = (layer) => layer.name ?? (layer.id === 'base' ? t('layers.base') : t(layer.kind === 'vector' ? 'layers.vectorDefault' : 'layers.editDefault', { n: layer.n }));

// A new paint layer the size of grid (a PaintLayer), holding snapshot (a snapshot(), or null for none): a layer's paint
// changed by a step that keeps the one before for its undo.
export function paintFrom(grid, snapshot = null) {
  const paint = markRaw(new PaintLayer({ cols: grid.cols, rows: grid.rows, scale: grid.scale }));
  if (snapshot) paint.restore(snapshot);
  return paint;
}

// The cells as they show up to the layer with the id, before the wide layout: the lower group's (lowerCells) for the
// bottom or a layer in that group, else the upper walk stopped at the layer (Renderer.composeUpper) at indexes (every
// cell with null), the lower group's elsewhere. What a merge or Make art layer takes from a layer with others over it.
export function levelCells(project, id, indexes = null) {
  const { cells, vectors } = project.lowerGroup;
  if (id === 'base' || id === cells || vectors.includes(id)) return project.lowerCells;
  project.overLower([]); // the renderer's upper layers as the stack is now
  const all = project.renderer.upper;
  project.renderer.upper = all.slice(0, all.findIndex((u) => u.id === id) + 1);
  try {
    return project.renderer.composeUpper(project.lowerCells, indexes, project.renderer.palette);
  } finally {
    project.renderer.upper = all;
  }
}

// What a step that changes the stack and what's on its cells layers holds either side (Flatten, Bake, the merges): the
// layers, every cells layer's data above the bottom by id ({ editCells, paintLayer, hasPaint }), the one in use's fields
// among them, the layer picked, and the cells layer in use (use: the id the edit layer's fields were, which names no layer
// once the last cells layer is deleted). A step never changes the objects in one: it makes new ones (paintFrom) for the other side.
export function stackState(project) {
  const data = new Map(project._layerData);
  if (project.editId !== 'base' && project.layerById(project.editId)) data.set(project.editId, { editCells: project.editCells, paintLayer: project.paintLayer, hasPaint: project.hasPaint });
  return { layers: project.layers, data, pick: useWorkspaceStore().pickedLayer, use: project.editId };
}

// stackState's state put back (layers: left as they are when it has none): each layer's data where it waits, the one in
// use's in the edit layer's fields (empty ones when it isn't in the stack any more), and the layers last, so a pick that
// left the stack moves to the layer that was under it (followLayerPick), which is then the one in use. A layer picked in
// the state (pick) that this brings back is picked again, and with it the cells layer in use then (use), when its leaving
// had moved the tools to another: a vector layer merged away puts them on the layer under it, and picking it again
// doesn't move them back. That's also the cells layer the art tabs go back to; with none in use then, none is again.
export function putStack(project, { layers = project.layers, data, pick = null, use = null }) {
  const back = pick && !project.layerById(pick);
  const grid = project.paintLayer;
  project._layerData.clear();
  for (const [id, each] of data) {
    if (grid) each.paintLayer?.extend(grid.cols, grid.rows); // the grid can have grown since
    project._layerData.set(id, each);
  }
  const own = project.editId !== 'base' && project._layerData.get(project.editId);
  if (own) {
    project._layerData.delete(project.editId);
    project._frameSwaps++;
    project.editCells = own.editCells;
    project.paintLayer = own.paintLayer ?? (grid && paintFrom(grid));
    project.hasPaint = own.hasPaint;
  } else if (project.editId !== 'base') emptyFields(project);
  project.layers = layers;
  if (!back || !project.layerById(pick)) return;
  const workspace = useWorkspaceStore();
  workspace.pickLayer(pick);
  if (!use || use === project.editId || project._artInside) return;
  const there = project.layerById(use);
  if (there && !swappable(project, use)) return; // (in the stack with nothing waiting for it: not a cells layer's id)
  swapLayer(project, use);
  if (there) workspace.lastCellsPick = use;
}

// Whether a change a room doesn't take yet (a picture on a layer) is refused because the document is shared with a room, with a toast saying so.
export function refusedInRoom(project) {
  if (!project._sharing) return false;
  toast(t('layers.notInRoom'));
  return true;
}

// A new layer of kind directly above the layer with the id above (on top when there's none), in the stack, with nothing
// on it (a cells layer's paint is made when it's first used); the layer. Not an undo step: addLayer's is, and the vector
// layer a first shape brings, or the edit layer a room is missing, has none.
// chars: its character settings (charsOf's), the bottom's unless said.
export function putLayer(project, kind, above, chars = project.baseChars) {
  const id = newLayerId(project.layers, kind), at = project.layers.findIndex((layer) => layer.id === above) + 1 || project.layers.length;
  const layer = Object.freeze({ id, kind, n: nextNumber(project.layers, kind), name: null, hidden: false, chars: layerChars(kind, chars) });
  // The last cells layer was deleted: this one takes the fields, empty (not inside an art layer: they're its drawing then).
  const none = kind === 'cells' && !project._artInside && !project.layerById(project.editId);
  project.layers = [...project.layers.slice(0, at), layer, ...project.layers.slice(at)];
  if (none) {
    project.editId = id;
    emptyFields(project);
  } else if (kind === 'cells') project._layerData.set(id, { editCells: new Map(), paintLayer: null, hasPaint: false });
  return layer;
}

// The edit layer's fields emptied, a paint layer of the same size kept: for a drawing left with no cells layer above the
// bottom, whose fields are no layer's (editId isn't in the stack, refusedNoCells).
export function emptyFields(project) {
  const was = project.paintLayer;
  project._frameSwaps++; // autosave: the step is the edit
  project.editCells = new Map();
  project.paintLayer = was && markRaw(new PaintLayer({ cols: was.cols, rows: was.rows, scale: was.scale }));
  project.hasPaint = false;
}

// Whether drawing on the edit layer's fields is refused because no cells layer above the bottom has them (the last one
// was deleted): what's written there wouldn't show, nor be kept. Inside an art layer they're its drawing. toast: say so,
// where it would look like it worked.
export function refusedNoCells(project, { toast: say = true } = {}) {
  if (project._artInside || project.layerById(project.editId)) return false;
  if (say) toast(t('layers.noCellsLayer'));
  return true;
}

// Drawing on the base in a movie: the base is the same on every frame, so what's drawn there doesn't animate. Said once a
// drawing (by its documentId), the first time a stroke or typing starts on the base with more than one frame.
export function sayBaseOnEveryFrame(project) {
  if (!onBottom(project) || !project.hasFrames || project._saidBaseFrames === project.documentId) return;
  project._saidBaseFrames = project.documentId;
  toast(t('animation.baseEveryFrame'));
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
  for (const [key, shape] of shownShapes(project.shapes, project.pixelAspect)) {
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
// The two halves ([top, bottom], { r, g, b }, stored colors) the layer in use's own cell at col, row shows at pixel
// scale: its character in its foreground over its background, mixed as the glyph covers each half (a color it hasn't
// got from under it; in the ASCII styles, which show characters on black, black under), the layer's paint over that.
// What it becomes as paint: Retouch reads it so, and Colors only lays it under the Brush.
export function ownHalves(project, col, row) {
  const look = project.underlyingAt(col, row, { withPaint: false, evenHidden: true });
  const bg = project.renderStyle === 'colorAscii' || project.renderStyle === 'ascii' ? { r: 0, g: 0, b: 0 } : hex2rgb(look.bg);
  return halfColors({ char: look.char, bg, fg: hex2rgb(look.fg) }).map((half, k) => {
    const paint = project.paintLayer?.pixelAt(col, 2 * row + k);
    return paint ? mix(half, paint, paint.a) : half;
  });
}

// The layer in use's own paint at grid pixel x, y ({ r, g, b, a }, a 0..1), or null where it has none: a cell of its own
// with colors of its own (not a frozen one, whose paint is under it: R3) as it shows (ownHalves), opaque, else its paint
// pixel. What Retouch (cached for its stroke) and a plugin brush's paint.own read. Not the base's.
export function ownPixelAt(project, x, y) {
  const entry = project.editCellAt(x, y >> 1);
  if ((entry?.fg || entry?.bg) && !isFrozen(entry)) return { ...ownHalves(project, x, y >> 1)[y & 1], a: 1 };
  return project.paintLayer?.pixelAt(x, y) ?? null;
}

// Whether the layer in use (not the base, whose cells are pins) has a cell of its own at col, row with a color of its own.
export function ownColored(project, col, row) {
  if (onBottom(project)) return false;
  const entry = project.editCellAt(col, row);
  return !!(entry?.fg || entry?.bg);
}

// Whether paint over the layer in use's own cell at col, row tints its character (docs/model.md R2, R5): one with colors
// of its own and ink to tint, not frozen. Colors only makes paint of the layer's other colored cells (colorsOnlyCells).
export function ownInked(project, col, row) {
  const cell = project.cells[cellIndex(col, row, project.cols)];
  return ownColored(project, col, row) && !isFrozen(project.editCellAt(col, row)) && !!cell && !opensToPaint(cell, project.renderStyle);
}

// What a plugin brush reads as the layer in use's own paint at grid pixel x, y, and so what its writes land on
// (tools/pluginBrush.js): as ownPixelAt, but a character of the layer's own with ink isn't paint (R5: it's kept, and
// tinted by the paint over it), so there it's the paint over the character, or null.
export function ownPaintAt(project, x, y) {
  return ownInked(project, x, y >> 1) ? project.paintLayer?.pixelAt(x, y) ?? null : ownPixelAt(project, x, y);
}

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
  const why = anyoneInsideWhy(project);
  return why && t(...why);
}
// The same as offReasons.js's reasons are: [key, values], or null (the command list's Dimensions).
export function anyoneInsideWhy(project) {
  const holder = holderOf(project, Object.values(project._locks).map(({ key }) => key), project._by);
  return holder ? ['art.someoneInside', { name: nameOf(project, holder) }] : null;
}
