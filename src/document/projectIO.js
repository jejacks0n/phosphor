/**
 * Getting things in and out of the app: decoding images, the .phosphor project format, and saving files.
 *
 * .phosphor layout: 'PHOSPHOR' (8 bytes), three little-endian uint32 lengths, then the settings
 * JSON, the source image bytes, and the paint layer PNG (empty when there's no paint).
 */
import { serializeEditCells, deserializeEditCells, migrateCharEdits } from './editCells.js';
import { EMPTY_BASE, serializeBase, deserializeBase } from './baseRecords.js';
import { MAX_LAYER_DIM } from './PaintLayer.js';

export const PROJECT_EXTENSION = '.phosphor';
const MAGIC_HEADER = 'PHOSPHOR';

// Decode image bytes; the object URL only lives until the image has loaded.
export function loadImage(source, type) {
  const url = URL.createObjectURL(source instanceof Blob ? source : new Blob([source], type ? { type } : {}));
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not decode image')); };
    image.src = url;
  });
}

// settings: plain JSON-able values (plus hasPaint); paintBlob: PNG of the paint layer, or null;
// baseBlob: PNG of the base layer's own pixels, or null (saved after the paint; its length is in the
// JSON as baseLength, so older readers just ignore it);
// editCells: the edit layer's cells (saved under the file's original key, `cellEdits`);
// baseRecords: the base layer's pinned characters (saved as `base`, left out when there are none).
export async function writeProject({ settings, imageBuffer, paintBlob, baseBlob = null, editCells, baseRecords = EMPTY_BASE }) {
  const base = serializeBase(baseRecords);
  const baseBuffer = baseBlob ? await baseBlob.arrayBuffer() : new ArrayBuffer(0);
  const json = new TextEncoder().encode(JSON.stringify({ ...settings, cellEdits: serializeEditCells(editCells), ...(base && { base }), ...(baseBlob && { baseLength: baseBuffer.byteLength }) }));
  const paintBuffer = paintBlob ? await paintBlob.arrayBuffer() : new ArrayBuffer(0);
  const header = new TextEncoder().encode(MAGIC_HEADER);
  const lengths = new Uint32Array([json.byteLength, imageBuffer.byteLength, paintBuffer.byteLength]);
  return new Blob([header, lengths, json, imageBuffer, paintBuffer, baseBuffer], { type: 'application/octet-stream' });
}

export async function readProject(file) {
  const buffer = await file.arrayBuffer();
  if (new TextDecoder().decode(buffer.slice(0, 8)) !== MAGIC_HEADER) {
    throw new Error('Not a valid Phosphor project file');
  }

  const view = new DataView(buffer);
  const jsonLen = view.getUint32(8, true);
  const imageLen = view.getUint32(12, true);
  const paintLen = view.getUint32(16, true);

  let offset = 20;
  const { cellEdits, charEditMap, hasPaint, base, baseLength, ...settings } = JSON.parse(new TextDecoder().decode(buffer.slice(offset, offset += jsonLen)));
  delete settings.charMode; // older files stored a charMode that's now derived from renderStyle
  // Untrusted: a fit is four numbers with a size, and a paint scale a whole number, both small
  // enough to draw (a layer stays within MAX_LAYER_DIM pixels a side).
  const { fit, paintScale } = settings;
  const size = Math.max(1, settings.cols | 0, settings.rows | 0);
  if (!(fit && ['dx', 'dy', 'dw', 'dh'].every(k => Number.isFinite(fit[k]) && Math.abs(fit[k]) <= MAX_LAYER_DIM) && fit.dw > 0 && fit.dh > 0)) delete settings.fit;
  if (!(Number.isInteger(paintScale) && paintScale > 0 && paintScale * size <= MAX_LAYER_DIM)) delete settings.paintScale;
  if (typeof settings.imageIsWorkingCopy !== 'boolean') delete settings.imageIsWorkingCopy;
  const imageBuffer = buffer.slice(offset, offset += imageLen);
  const paint = buffer.slice(offset, offset += paintLen);
  const baseBuffer = Number.isInteger(baseLength) && baseLength > 0 ? buffer.slice(offset, offset + baseLength) : null;

  // Older files have no hasPaint key: the paint section's presence decides.
  const usePaint = (hasPaint ?? paintLen > 0) && paintLen > 0;
  // Files from before the cell layer have charEditMap (cell index -> char) instead.
  const edits = cellEdits ? deserializeEditCells(cellEdits) : migrateCharEdits(charEditMap || [], settings.cols);
  return { settings, imageBuffer, paintBuffer: usePaint ? paint : null, baseBuffer, editCells: edits, ...readBase(base), migrated: !cellEdits && edits.size > 0 };
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
