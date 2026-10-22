/**
 * Getting things in and out of the app: decoding images, the .phosphor project format, and saving files.
 *
 * .phosphor layout: 'PHOSPHOR' (8 bytes), three little-endian uint32 lengths, then the settings
 * JSON, the source image bytes, and the paint layer PNG (empty when there's no paint).
 */
import { serializeCellEdits, deserializeCellEdits, migrateCharEdits } from './cellEdits.js';

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
// cellEdits: the authored cell layer.
export async function writeProject({ settings, imageBuffer, paintBlob, cellEdits }) {
  const json = new TextEncoder().encode(JSON.stringify({ ...settings, cellEdits: serializeCellEdits(cellEdits) }));
  const paintBuffer = paintBlob ? await paintBlob.arrayBuffer() : new ArrayBuffer(0);
  const header = new TextEncoder().encode(MAGIC_HEADER);
  const lengths = new Uint32Array([json.byteLength, imageBuffer.byteLength, paintBuffer.byteLength]);
  return new Blob([header, lengths, json, imageBuffer, paintBuffer], { type: 'application/octet-stream' });
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
  const { cellEdits, charEditMap, hasPaint, ...settings } = JSON.parse(new TextDecoder().decode(buffer.slice(offset, offset += jsonLen)));
  delete settings.charMode; // older files stored a charMode that's now derived from renderStyle
  const imageBuffer = buffer.slice(offset, offset += imageLen);
  const paint = buffer.slice(offset, offset + paintLen);

  // Older files have no hasPaint key: the paint section's presence decides.
  const usePaint = (hasPaint ?? paintLen > 0) && paintLen > 0;
  // Files from before the cell layer have charEditMap (cell index -> char) instead.
  const edits = cellEdits ? deserializeCellEdits(cellEdits) : migrateCharEdits(charEditMap || [], settings.cols);
  return { settings, imageBuffer, paintBuffer: usePaint ? paint : null, cellEdits: edits, migrated: !cellEdits && edits.size > 0 };
}

// Save via the browser's file picker where available, otherwise as a download.
export async function saveFile(blob, filename, description) {
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept: { 'application/octet-stream': [filename.slice(filename.lastIndexOf('.'))] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Save File Picker failed, falling back to download:', err);
    }
  }
  downloadBlob(blob, filename);
}

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
