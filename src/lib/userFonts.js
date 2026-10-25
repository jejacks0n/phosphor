/**
 * Fonts you load from your computer to draw the art in (FontField). Each must be monospaced (every
 * character a cell holds the same width, as in a terminal); it's kept in this browser (IndexedDB:
 * fonts are too big for localStorage) and never leaves it.
 *
 * A stored font: { id, name, lineHeight, data (the file's bytes) }. lineHeight: its own height
 * (ascent + descent) per em, so a full block fills its cell.
 */

// Checked to be one width: the narrowest and widest characters of a proportional font, and a digit.
export const MONOSPACE_SAMPLE = Object.freeze([...'il.\' MWm@0']);

// The two characters whose widths differ most (the first of any tied, in the widths' order), when
// they differ by more than a hair; null when the widths ({ char: width }) are all the same.
export function widthMismatch(widths) {
  const chars = Object.keys(widths), values = Object.values(widths);
  const narrow = chars[values.indexOf(Math.min(...values))], wide = chars[values.indexOf(Math.max(...values))];
  return widths[wide] - widths[narrow] > widths[wide] * 0.005 ? { narrow, wide } : null;
}

const quoted = (char) => (char === ' ' ? 'a space' : `“${char}”`);

// What we tell you when a font isn't monospaced (widths in px at 16px).
export function notMonospacedMessage(name, widths, { narrow, wide }) {
  const px = (char) => `${widths[char].toFixed(1)}px`;
  return `“${name}” isn't monospaced: ${quoted(narrow)} is ${px(narrow)} wide and ${quoted(wide)} is ${px(wide)}. `
    + 'Every character has to be the same width, as in a terminal, so it can\'t be used.';
}

// The CSS family a stored font is registered under.
export const familyOf = (id) => `"Phosphor Font ${id}", monospace`;
const faceFamily = (id) => `Phosphor Font ${id}`;

const faces = new Map(); // id -> its FontFace, once registered

// Register a font's bytes with the page under its id's family; its FontFace, loaded.
async function register(id, data) {
  if (faces.has(id)) return faces.get(id);
  const face = new FontFace(faceFamily(id), data);
  await face.load();
  document.fonts.add(face);
  faces.set(id, face);
  return face;
}

function unregister(id) {
  const face = faces.get(id);
  if (face) document.fonts.delete(face);
  faces.delete(id);
}

// The sample's widths in a registered font, at 16px.
function sampleWidths(id) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `100px "${faceFamily(id)}"`;
  return Object.fromEntries(MONOSPACE_SAMPLE.map((char) => [char, ctx.measureText(char).width * 0.16]));
}

// A registered font's height (ascent + descent) per em.
function naturalLineHeight(id) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `100px "${faceFamily(id)}"`;
  const { fontBoundingBoxAscent: ascent, fontBoundingBoxDescent: descent } = ctx.measureText('M');
  return Math.round(ascent + descent) / 100;
}

// The browser's store of fonts.
function database() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('phosphor-fonts', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('fonts', { keyPath: 'id' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function inStore(mode, use) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('fonts', mode), request = use(tx.objectStore('fonts'));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Every stored font, registered with the page: [{ id, name, lineHeight }]. One that no longer loads
// (the browser stopped accepting it) is left out.
export async function loadFonts() {
  const stored = await inStore('readonly', (fonts) => fonts.getAll());
  const usable = [];
  for (const { id, name, lineHeight, data } of stored) {
    try {
      await register(id, data);
      usable.push({ id, name, lineHeight });
    } catch {
      // not usable here: left in the store, unshown
    }
  }
  return usable;
}

// Load a font file, check it, and store it: { id, name, lineHeight }. Rejects with an Error whose
// message says why it can't be used (it isn't a font the browser can read, or isn't monospaced).
export async function addFont(file) {
  const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '');
  const id = `user-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const data = await file.arrayBuffer();
  try {
    await register(id, data);
  } catch {
    throw new Error(`“${file.name}” couldn't be read as a font. Phosphor can use TrueType, OpenType and WOFF fonts.`);
  }
  const widths = sampleWidths(id), mismatch = widthMismatch(widths);
  if (mismatch) {
    unregister(id);
    throw new Error(notMonospacedMessage(name, widths, mismatch));
  }
  const font = { id, name, lineHeight: naturalLineHeight(id) };
  await inStore('readwrite', (fonts) => fonts.put({ ...font, data }));
  return font;
}

// Forget a stored font.
export async function removeFont(id) {
  unregister(id);
  await inStore('readwrite', (fonts) => fonts.delete(id));
}
