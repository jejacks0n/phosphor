/**
 * Getting things in and out of the app: decoding images, the .phosphor project format, and saving files.
 *
 * .phosphor layout: 'PHOSPHOR' (8 bytes), three little-endian uint32 lengths, then the settings
 * JSON, the source image bytes, and the paint layer PNG (empty when there's no paint).
 *
 * A drawing whose layers don't fit that form (legacySlots) is written in the stack form: 'PHOSPHR2', the same three
 * lengths (the last, every paint PNG's together), the JSON, the image, the base layer's PNG, then each cells layer's
 * paint PNG in stack order. Older copies refuse it as no project, rather than open some of it.
 */
import { serializeEditCells, deserializeEditCells, migrateCharEdits } from './editCells.js';
import { deserializeFrames, invalidProject } from './frames.js';
import { deserializeShapes, serializeShapes } from './shapes.js';
import { goodLayers } from './layerInfo.js';
import { EMPTY_BASE, serializeBase, deserializeBase } from './baseRecords.js';
import { MAX_LAYER_DIM } from './PaintLayer.js';
import { MAX_COLS, MAX_LINES, maxRowsBeside } from '../lib/Cells.js';

export const PROJECT_EXTENSION = '.phosphor';
export const isProjectFile = (name) => name.toLowerCase().endsWith(PROJECT_EXTENSION);
const MAGIC_HEADER = 'PHOSPHOR', STACK_HEADER = 'PHOSPHR2';

// A fit four numbers with a size, no longer than the longest grid, and a layer's scale a whole number small enough to
// draw: within MAX_LAYER_DIM pixels a side, except that a grid longer than that still has its layers (editScaleFor), a
// paint layer at a pixel a grid pixel and a base layer at the 2 the picture's processed at (ImageProcessor's prepare).
// What's untrusted in a file, and in what another browser sends.
export const goodFit = (fit) => !!fit && ['dx', 'dy', 'dw', 'dh'].every(k => Number.isFinite(fit[k]) && Math.abs(fit[k]) <= 2 * MAX_LINES) && fit.dw > 0 && fit.dh > 0;
export const goodScale = (scale, size, longest = 1) => Number.isInteger(scale) && scale > 0 && scale <= Math.max(longest, Math.floor(MAX_LAYER_DIM / size));
export const goodBaseScale = (scale, size) => goodScale(scale, size, 2);

// Decode image bytes; the object URL only lives until the image has loaded.
export function loadImage(source, type) {
  const url = URL.createObjectURL(source instanceof Blob ? source : new Blob([source], type ? { type } : {}));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(Object.assign(new Error('Could not decode image'), { code: 'DECODE_IMAGE_FAILED' })); };
    image.src = url;
  });
}

// settings: plain JSON-able values (plus hasPaint); paintBlob: PNG of the paint layer, or null;
// baseBlob: PNG of the base layer's own pixels, or null (saved after the paint; its length is in the
// JSON as baseLength, so older readers just ignore it);
// editCells: the edit layer's cells (saved under the file's original key, `cellEdits`);
// baseRecords: the base layer's pinned characters (saved as `base`, left out when there are none);
// animation: { frames (serializeFrames), frame, fps } (motion: the whole movie's, in files from before each tween had its own; cellsCarry false: every cell staying, in files from before each cell had its own), left out for a still. The rest holds the frame
// showing, so older copies open it as a still.
// stack: the stack form, in place of editCells, paintBlob and layers: every layer bottom first, { id, kind, n, name,
// hidden }, a cells layer above the bottom with its editCells and paintBlob (or null).
export async function writeProject({ settings, imageBuffer, paintBlob, baseBlob = null, editCells, baseRecords = EMPTY_BASE, shapes = null, layers = null, animation = null, stack = null }) {
  const base = serializeBase(baseRecords);
  const baseBuffer = baseBlob ? await baseBlob.arrayBuffer() : new ArrayBuffer(0);
  const paints = stack ? await Promise.all(stack.map((layer) => layer.paintBlob?.arrayBuffer() ?? new ArrayBuffer(0))) : [];
  const own = stack
    ? { stack: stack.map(({ id, kind, n, name, hidden, editCells: cells }, i) => ({ id, kind, n, ...(name !== null && { name }), ...(hidden && { hidden }), ...(cells?.size && { cells: serializeEditCells(cells) }), ...(paints[i].byteLength && { paintLength: paints[i].byteLength }) })) }
    : { cellEdits: serializeEditCells(editCells) };
  const json = new TextEncoder().encode(JSON.stringify({ ...settings, ...own, ...(base && { base }), ...(shapes?.size && { shapes: serializeShapes(shapes) }), ...(layers && { layers }), ...(baseBlob && { baseLength: baseBuffer.byteLength }), ...animation }));
  if (stack) {
    const lengths = new Uint32Array([json.byteLength, imageBuffer.byteLength, paints.reduce((sum, paint) => sum + paint.byteLength, 0)]);
    return new Blob([new TextEncoder().encode(STACK_HEADER), lengths, json, imageBuffer, baseBuffer, ...paints], { type: 'application/octet-stream' });
  }
  const paintBuffer = paintBlob ? await paintBlob.arrayBuffer() : new ArrayBuffer(0);
  const header = new TextEncoder().encode(MAGIC_HEADER);
  const lengths = new Uint32Array([json.byteLength, imageBuffer.byteLength, paintBuffer.byteLength]);
  return new Blob([header, lengths, json, imageBuffer, paintBuffer, baseBuffer], { type: 'application/octet-stream' });
}

// The parts of either form: layers (the old form's key) or stack (the stack form's layers, as layers) with layerParts,
// each cells layer's above the bottom by id, { editCells, paintBuffer (or null) }.
export async function readProject(file) {
  const buffer = await file.arrayBuffer();
  const magic = new TextDecoder().decode(buffer.slice(0, 8));
  if (magic !== MAGIC_HEADER && magic !== STACK_HEADER) throw invalidProject();
  const stacked = magic === STACK_HEADER;

  const view = new DataView(buffer);
  const jsonLen = view.getUint32(8, true);
  const imageLen = view.getUint32(12, true);
  const paintLen = view.getUint32(16, true);

  let offset = 20;
  const { cellEdits, charEditMap, hasPaint, base, baseLength, shapes, layers, stack: rawStack, frames, frame, fps, motion, cellsCarry, ...settings } = JSON.parse(new TextDecoder().decode(buffer.slice(offset, offset += jsonLen)));
  delete settings.charMode; // older files stored a charMode that's now derived from renderStyle
  delete settings.documentId; // Untrusted, and autosave's, not the file's: one could overwrite another document's record
  delete settings.savedToFile;
  // Untrusted: a grid within the limits (Cells.js; left out, the columns are the default, which fits
  // any height), and a fit and paint scale that can be drawn.
  if (settings.cols !== undefined) settings.cols = Math.min(MAX_COLS, Math.max(1, settings.cols | 0));
  if (settings.rows !== undefined) settings.rows = Math.min(maxRowsBeside(settings.cols ?? 1), Math.max(1, settings.rows | 0));
  const { fit, paintScale } = settings;
  const size = Math.max(1, settings.cols | 0, settings.rows | 0);
  if (!goodFit(fit)) delete settings.fit;
  if (!goodScale(paintScale, size)) delete settings.paintScale;
  if (typeof settings.imageIsWorkingCopy !== 'boolean') delete settings.imageIsWorkingCopy;
  const imageBuffer = buffer.slice(offset, offset += imageLen);
  const hasBase = Number.isInteger(baseLength) && baseLength > 0;
  if (stacked) return readStack({ buffer, offset, imageBuffer, baseLength: hasBase ? baseLength : 0, settings, base, shapes, rawStack, frames, frame, fps, motion, cellsCarry });
  const paint = buffer.slice(offset, offset += paintLen);
  const baseBuffer = hasBase ? buffer.slice(offset, offset + baseLength) : null;

  // Older files have no hasPaint key: the paint section's presence decides.
  const usePaint = (hasPaint ?? paintLen > 0) && paintLen > 0;
  // Files from before the cell layer have charEditMap (cell index -> char) instead.
  const edits = cellEdits ? deserializeEditCells(cellEdits) : migrateCharEdits(charEditMap || [], settings.cols);
  const animation = frames === undefined ? null : deserializeFrames({ frames, frame, fps, motion, cellsCarry }, settings.cols, settings.rows);
  // Untrusted: a file with a shape that can't be one opens without its shapes, and one on a layer the old form doesn't
  // have (the stack form's) is one.
  const read = deserializeShapes(shapes);
  return { settings, imageBuffer, paintBuffer: usePaint ? paint : null, baseBuffer, editCells: edits, shapes: read && ![...read.values()].some((shape) => shape.layer) ? read : new Map(), layers, ...readBase(base), migrated: !cellEdits && edits.size > 0, animation, framesLost: frames !== undefined && !animation };
}

// The rest of a stack file, from its image on. Its stack, and every shape's and frame key's layer, must be good, or it's
// no project: a newer copy wrote it, so anything else was made by hand.
function readStack({ buffer, offset, imageBuffer, baseLength, settings, base, shapes, rawStack, frames, frame, fps, motion, cellsCarry }) {
  const stack = goodLayers(rawStack);
  if (!stack) throw invalidProject();
  const ids = (kind) => new Set(stack.filter((layer) => layer.kind === kind && layer.id !== 'base').map((layer) => layer.id));
  const layers = { cells: ids('cells'), vector: ids('vector') };
  const read = deserializeShapes(shapes);
  if (read && [...read.values()].some((shape) => !layers.vector.has(shape.layer ?? 'vector'))) throw invalidProject();
  const baseBuffer = baseLength ? buffer.slice(offset, offset += baseLength) : null;
  const layerParts = new Map();
  rawStack.forEach((entry, i) => {
    const length = Number.isInteger(entry.paintLength) && entry.paintLength > 0 ? entry.paintLength : 0;
    const paintBuffer = length ? buffer.slice(offset, offset += length) : null;
    if (layers.cells.has(stack[i].id)) layerParts.set(stack[i].id, { editCells: deserializeEditCells(entry.cells), paintBuffer });
  });
  const animation = frames === undefined ? null : deserializeFrames({ frames, frame, fps, motion, cellsCarry }, settings.cols, settings.rows, layers);
  return {
    settings, imageBuffer, paintBuffer: null, baseBuffer, editCells: new Map(), shapes: read ?? new Map(), stack, layerParts,
    ...readBase(base), migrated: false, animation, framesLost: frames !== undefined && !animation,
  };
}

// The base record, and (from files before the base had its own pixels) the cells to erase.
const readBase = (json) => {
  const { records, erased } = deserializeBase(json);
  return { baseRecords: records, erasedCells: erased };
};

// A filename as typed into the save dialog, without its extension (added back by the caller):
// trimmed, the extension dropped if it was typed, slashes made dashes. '' when nothing's left.
export function fileStem(input, ext) {
  const name = input.trim().replace(/[/\\]/g, '-');
  const suffix = `.${ext}`;
  return (name.toLowerCase().endsWith(suffix.toLowerCase()) ? name.slice(0, -suffix.length) : name).trim();
}

// The name the save dialog offers: the document's, with the time. A browser numbers a download whose name
// is taken, sometimes after the extension (art.phosphor-2), and that file won't open; a new time is a new
// name. A time from an earlier save is replaced, so they don't pile up.
export function timestamped(stem, now = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}`;
  const time = `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `${stem.replace(/-\d{8}-\d{6}$/, '')}-${date}-${time}`;
}

// Every save and export is a download, named as typed in the save dialog (Safari has no save
// picker; every browser honors a download's name).
export function downloadBlob(blob, filename) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 40_000); // some browsers read the URL after click() returns
}
