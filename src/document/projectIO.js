/**
 * Getting things in and out of the app: decoding images, the project format, and saving files.
 *
 * Save writes a .pho: a PNG of the drawing with the project in a private chunk near its start, laid out so a terminal
 * shows the art when the file is printed (phoFile; phoTerminal.js), or plain, phPr right after IHDR, when that can't be
 * made clean or the person chose it (withProject). projectChunkOf reads either back, and a .png holding one opens as the project. An older .phosphor is
 * the project alone, and still opens. The project itself, in either file, is the layout below.
 *
 * Project layout: 'PHOSPHOR' (8 bytes), three little-endian uint32 lengths, then the settings
 * JSON, the source image bytes, and the paint layer PNG (empty when there's no paint).
 *
 * A drawing whose layers don't fit that form (legacySlots) is written in the stack form: 'PHOSPHR2', the same three
 * lengths (the last, every paint PNG's together), the JSON, the image, the base layer's PNG, then each cells layer's
 * paint PNG in stack order. Older copies refuse it as no project, rather than open some of it.
 *
 * A saved file is either form gzipped (gzipped). Opening takes it gzipped or not, so files saved before still open.
 */
import { serializeEditCells, deserializeEditCells, migrateCharEdits } from './editCells.js';
import { deserializeFrames, invalidProject } from './frames.js';
import { deserializeShapes, serializeShapes } from './shapes.js';
import { goodLayers } from './layerInfo.js';
import { EMPTY_BASE, serializeBase, deserializeBase } from './baseRecords.js';
import { MAX_LAYER_DIM } from './PaintLayer.js';
import { MAX_COLS, MAX_LINES, maxRowsBeside } from '../lib/Cells.js';
import { chunk, crc32 } from '../lib/PngFile.js';
import { terminalPho, unescapeBytes, START_CHUNK, PROJECT_CHUNK as TERMINAL_PROJECT_CHUNK } from './phoTerminal.js';
import { cleanFilterOptions, cleanSolverNames } from '../plugins/filters.js';

export const PROJECT_EXTENSION = '.pho', OLD_PROJECT_EXTENSION = '.phosphor', PROJECT_MIME = 'image/x-phosphor';
export const isProjectFile = (name) => [PROJECT_EXTENSION, OLD_PROJECT_EXTENSION].some((ext) => name.toLowerCase().endsWith(ext));
// The formats Export offers (ExportModal, and the command list's row for each), in its order: the stills, then those an
// animation makes.
export const EXPORT_FORMATS = [
  { id: 'ans',             ext: 'ans',      group: 'still' },
  { id: 'utf8ans',         ext: 'utf8ans',  group: 'still' },
  { id: 'txt',             ext: 'txt',      group: 'still' },
  { id: 'xb',              ext: 'xb',       group: 'still' },
  { id: 'png',             ext: 'png',      group: 'still' },
  { id: 'gif',             ext: 'gif',      group: 'animated', animated: true },
  { id: 'mp4',             ext: 'mp4',      group: 'animated', animated: true },
  { id: 'ansimation',      ext: 'ans',      group: 'animated', animated: true },
  { id: 'utf8ansimation',  ext: 'utf8ans',  group: 'animated', animated: true },
  { id: 'cast',            ext: 'cast',     group: 'animated', animated: true },
];

// What Save may write over: a .phosphor opened is saved as a new .pho beside it.
export const isSavedForm = (name) => name.toLowerCase().endsWith(PROJECT_EXTENSION);
const MAGIC_HEADER = 'PHOSPHOR', STACK_HEADER = 'PHOSPHR2';
// The most a project may be unzipped: a file, or a host's project for an artist that doesn't trust it.
export const MOST_PROJECT_BYTES = 256 * 1024 * 1024;

// A .pho is a PNG whose image is the drawing, with the project in a private chunk near the start. In the plain form it's
// phPr right after IHDR (the signature is 8 bytes and IHDR's chunk 25, so it starts at 33 and its type is at 37); in the
// form a terminal shows (phoTerminal.js), phCs is there and the project, escaped, is phPc right after it.
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10], PROJECT_CHUNK = 'phPr', CHUNK_AT = 33;
const isPng = (bytes) => bytes.length >= 8 && PNG_SIGNATURE.every((b, i) => bytes[i] === b);
const typeAt = (bytes, at) => String.fromCharCode(...bytes.subarray(at, at + 4));

export function withProject(png, project) {
  const piece = chunk(PROJECT_CHUNK, project), out = new Uint8Array(png.length + piece.length);
  out.set(png.subarray(0, CHUNK_AT));
  out.set(piece, CHUNK_AT);
  out.set(png.subarray(CHUNK_AT), CHUNK_AT + piece.length);
  return out;
}

// The drawing's .pho: the form a terminal shows when it can be made clean, else the plain one. art: its UTF-8 ANSI, or a
// function giving it, asked for only when it's needed.
export const phoFile = async (png, project, art) => (art && await terminalPho(png, project, art)) || withProject(png, project); // no art: plain

// The head of a file (its first 41 bytes) says it's a .pho.
export const startsAsProject = (head) => head.length >= 41 && isPng(head) && [PROJECT_CHUNK, START_CHUNK].includes(typeAt(head, 37));

// A file is a project by its name (.pho, .phosphor), or when it's a PNG (by name or type) that starts as one.
export async function holdsProject(file) {
  if (isProjectFile(file.name)) return true;
  if (!/\.png$/i.test(file.name) && file.type !== 'image/png') return false;
  return startsAsProject(new Uint8Array(await file.slice(0, 41).arrayBuffer()));
}

// The project a .pho holds (phPr's bytes, or phPc's unescaped). It throws for a PNG with neither where it belongs, a chunk
// past the end, a bad CRC, or escaping that isn't escapeBytes'.
export function projectChunkOf(bytes) {
  if (!startsAsProject(bytes.subarray(0, 41))) throw invalidProject();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  const terminal = typeAt(bytes, 37) === START_CHUNK, at = terminal ? CHUNK_AT + 12 + view.getUint32(CHUNK_AT) : CHUNK_AT;
  if (at + 12 > bytes.length || typeAt(bytes, at + 4) !== (terminal ? TERMINAL_PROJECT_CHUNK : PROJECT_CHUNK)) throw invalidProject();
  const end = at + 8 + view.getUint32(at);
  if (end + 4 > bytes.length || crc32(bytes.subarray(at + 4, end)) !== view.getUint32(end)) throw invalidProject();
  if (!terminal) return bytes.slice(at + 8, end);
  const project = unescapeBytes(bytes.subarray(at + 8, end));
  if (!project) throw invalidProject();
  return project;
}

export const gzipped = (blob) => new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();

// What a gzip unzips to, as a Blob. It throws for what isn't one (the gzip's own check), or past mostBytes unzipped (it
// stops reading there, so a small file can't grow into gigabytes).
export async function gunzipped(blob, mostBytes) {
  const reader = blob.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.length;
    if (size > mostBytes) {
      reader.cancel();
      throw new Error('Unzipped too big');
    }
    parts.push(read.value);
  }
  return new Blob(parts);
}

// A fit four numbers with a size, no longer than the longest grid, and a layer's scale a whole number small enough to
// draw: within MAX_LAYER_DIM pixels a side, except that a grid longer than that still has its layers (editScaleFor), a
// paint layer at a pixel a grid pixel and a base layer at the 2 the picture's processed at (ImageProcessor's prepare).
// What's untrusted in a file, and in what another browser sends.
export const goodFit = (fit) => !!fit && ['dx', 'dy', 'dw', 'dh'].every(k => Number.isFinite(fit[k]) && Math.abs(fit[k]) <= 2 * MAX_LINES) && fit.dw > 0 && fit.dh > 0;
export const goodScale = (scale, size, longest = 1) => Number.isInteger(scale) && scale > 0 && scale <= Math.max(longest, Math.floor(MAX_LAYER_DIM / size));
export const goodBaseScale = (scale, size) => goodScale(scale, size, 2);
// A file id is only ever a storage key: a short run of letters, digits, - and _.
export const goodFileId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

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
// hidden, chars }, a cells layer above the bottom with its editCells and paintBlob (or null).
export async function writeProject({ settings, imageBuffer, paintBlob, baseBlob = null, editCells, baseRecords = EMPTY_BASE, shapes = null, layers = null, animation = null, stack = null }) {
  const base = serializeBase(baseRecords);
  const baseBuffer = baseBlob ? await baseBlob.arrayBuffer() : new ArrayBuffer(0);
  const paints = stack ? await Promise.all(stack.map((layer) => layer.paintBlob?.arrayBuffer() ?? new ArrayBuffer(0))) : [];
  const own = stack
    ? { stack: stack.map(({ id, kind, n, name, hidden, chars, editCells: cells }, i) => ({ id, kind, n, ...(name !== null && { name }), ...(hidden && { hidden }), ...(chars && id !== 'base' && { chars }), ...(cells?.size && { cells: serializeEditCells(cells) }), ...(paints[i].byteLength && { paintLength: paints[i].byteLength }) })) }
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
  let buffer = await file.arrayBuffer();
  if (isPng(new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength)))) buffer = projectChunkOf(new Uint8Array(buffer)).buffer;
  const start = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength));
  if (start[0] === 0x1f && start[1] === 0x8b) { // gzip's mark: a saved file
    try {
      buffer = await (await gunzipped(new Blob([buffer]), MOST_PROJECT_BYTES)).arrayBuffer();
    } catch {
      throw invalidProject();
    }
  }
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
  if (!goodFileId(settings.fileId)) delete settings.fileId; // untrusted, and a bad one gets a new id on open
  // Untrusted: a grid within the limits (Cells.js; left out, the columns are the default, which fits
  // any height), and a fit and paint scale that can be drawn.
  if (settings.cols !== undefined) settings.cols = Math.min(MAX_COLS, Math.max(1, settings.cols | 0));
  if (settings.rows !== undefined) settings.rows = Math.min(maxRowsBeside(settings.cols ?? 1), Math.max(1, settings.rows | 0));
  const { fit, paintScale } = settings;
  const size = Math.max(1, settings.cols | 0, settings.rows | 0);
  if (!goodFit(fit)) delete settings.fit;
  if (!goodScale(paintScale, size)) delete settings.paintScale;
  if (typeof settings.imageIsWorkingCopy !== 'boolean') delete settings.imageIsWorkingCopy;
  if ('filterOptions' in settings) settings.filterOptions = cleanFilterOptions(settings.filterOptions); // untrusted: a plugin filter's values, shown and run
  if ('solverNames' in settings) settings.solverNames = cleanSolverNames(settings.solverNames); // untrusted: words shown
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

// Saving in place, in the web build where the browser has the File System Access API (Chromium): a .pho file
// opened or saved keeps its handle (the project's fileHandle) and Save writes over it, as the desktop app writes over
// its path. A function, so tests can give the page the API. Elsewhere Save is a download.
export const savesInPlace = () => import.meta.env.VITE_DESKTOP !== '1' && typeof globalThis.showSaveFilePicker === 'function';

// A handle's file, with the handle on it (fileHandle) when it's a project, for Save to write over.
async function fileOf(handle) {
  const file = await handle.getFile();
  return isProjectFile(file.name) ? Object.assign(file, { fileHandle: handle }) : file;
}

// The open picker's file (fileOf); null when canceled. types: the picker's list.
export async function pickFile(types) {
  try {
    const [handle] = await globalThis.showOpenFilePicker({ types });
    return await fileOf(handle);
  } catch (error) {
    if (error.name === 'AbortError') return null;
    throw error;
  }
}

// The installed web app's files (the manifest's file_handlers: a file double-clicked, or Open With), each to open as
// the picker's is (fileOf). Each opens a window of its own, so a launch has one. Where there's no launchQueue (not
// installed, or a browser without File Handling), nothing comes.
export function onLaunchedFiles(open) {
  globalThis.launchQueue?.setConsumer(async ({ files }) => {
    if (files?.length) open(await fileOf(files[0]));
  });
}

// Where Save writes a project: the handle given, once the browser says it may (after a reload it asks), or else a file
// the save picker names (Save As, a drawing never saved, an older .phosphor, or the asking refused), opening in the
// handle's folder when there's one. Null when the picker's canceled.
export async function projectTarget(handle, { suggestedName, description, as = false }) {
  const mode = { mode: 'readwrite' };
  if (handle && !as && isSavedForm(handle.name) && ((await handle.queryPermission(mode)) === 'granted' || (await handle.requestPermission(mode)) === 'granted')) return handle;
  try {
    return await globalThis.showSaveFilePicker({ suggestedName, ...(handle && { startIn: handle }), types: [{ description, accept: { [PROJECT_MIME]: [PROJECT_EXTENSION] } }] });
  } catch (error) {
    if (error.name === 'AbortError') return null;
    throw error;
  }
}

// The browser writes beside the file and swaps it in at close, so a write that fails leaves the file as it was.
export async function writeFileHandle(handle, blob) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

// Every other save and export is a download, named as typed in the save dialog (Safari has no save
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
