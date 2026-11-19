/**
 * Fonts you load from your computer to draw the art in (FontField). Each must be monospaced (every
 * character a cell holds the same width, as in a terminal); it's kept in this browser (IndexedDB:
 * fonts are too big for localStorage) and never leaves it.
 *
 * A stored font: { id, name, lineHeight, data (the file's bytes) }. lineHeight: its own height
 * (ascent + descent) per em, so a full block fills its cell. A bitmap font (a raw .F## or a PNG sheet)
 * is { id, name, kind: 'bitmap', height, data (its glyph bytes) }; a record with no kind is an outline font.
 */

import { t } from '@/i18n';
import { fontId, fontName, parseRawFont, parseFontSheet } from './BitmapFont.js';
import { ttfOf } from './BitmapTtf.js';

// Checked to be one width: the narrowest and widest characters of a proportional font, and a digit.
export const MONOSPACE_SAMPLE = Object.freeze([...'il.\' MWm@0']);

// The two characters whose widths differ most (the first of any tied, in the widths' order), when
// they differ by more than a hair; null when the widths ({ char: width }) are all the same.
export function widthMismatch(widths) {
  const chars = Object.keys(widths), values = Object.values(widths);
  const narrow = chars[values.indexOf(Math.min(...values))], wide = chars[values.indexOf(Math.max(...values))];
  return widths[wide] - widths[narrow] > widths[wide] * 0.005 ? { narrow, wide } : null;
}

const quoted = (char) => (char === ' ' ? t('font.errors.aSpace') : `“${char}”`);

// What we tell you when a font isn't monospaced (widths in px at 16px).
export function notMonospacedMessage(name, widths, { narrow, wide }) {
  const px = (char) => widths[char].toFixed(1);
  return t('font.errors.notMonospaced', {
    name,
    narrow: quoted(narrow),
    narrowPx: px(narrow),
    wide: quoted(wide),
    widePx: px(wide),
  });
}

// The CSS family a stored font is registered under.
export const familyOf = (id) => `"Phosphor Font ${id}", monospace`;
const faceFamily = (id) => `Phosphor Font ${id}`;

const faces = new Map(); // id -> its FontFace's loading (a promise), from the first register

// Register a font's bytes with the page under its id's family; its FontFace, loaded. Registering
// again while it loads waits for the same face, so an id never gets two.
function register(id, data) {
  if (!faces.has(id)) {
    const face = new FontFace(faceFamily(id), data);
    faces.set(id, face.load().then(() => {
      document.fonts.add(face);
      return face;
    }, (error) => {
      faces.delete(id);
      throw error;
    }));
  }
  return faces.get(id);
}

// A drawing's bitmap font, registered with the page as a TrueType font; its CSS family.
export async function registerBitmapFont(font) {
  const id = fontId(font);
  await register(id, ttfOf(font));
  return familyOf(id);
}

function unregister(id) {
  faces.get(id)?.then((face) => document.fonts.delete(face), () => {});
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

// Every stored font: [{ id, name, kind, lineHeight | height }]. Outline fonts are registered with the page; one that
// no longer loads (the browser stopped accepting it) is left out. Bitmap fonts are only listed: a drawing registers
// the one it uses.
export async function loadFonts() {
  const stored = await inStore('readonly', (fonts) => fonts.getAll());
  const usable = [];
  for (const { id, name, kind, lineHeight, height, data } of stored) {
    if (kind === 'bitmap') {
      usable.push({ id, name, kind, height });
      continue;
    }
    try {
      await register(id, data);
      usable.push({ id, name, kind: 'outline', lineHeight });
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
    throw new Error(t('font.errors.unreadable', { name: file.name }));
  }
  const widths = sampleWidths(id), mismatch = widthMismatch(widths);
  if (mismatch) {
    unregister(id);
    throw new Error(notMonospacedMessage(name, widths, mismatch));
  }
  const font = { id, name, kind: 'outline', lineHeight: naturalLineHeight(id) };
  await inStore('readwrite', (fonts) => fonts.put({ ...font, data }));
  return font;
}

// Load a bitmap font file (a raw .F## or a PNG sheet, told by its name or type) and store it:
// { id, name, kind: 'bitmap', height }. Rejects with the not-a-bitmap-font message. The same font twice is one entry.
export async function addBitmapFont(file) {
  const name = fontName(file.name);
  let font;
  if (/\.png$/i.test(file.name) || file.type === 'image/png') {
    let image;
    try {
      image = await createImageBitmap(file);
    } catch {
      throw new Error(t('font.errors.notBitmap', { name: file.name }));
    }
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    font = parseFontSheet(ctx.getImageData(0, 0, image.width, image.height), name);
  } else {
    font = parseRawFont(new Uint8Array(await file.arrayBuffer()), name);
  }
  const id = fontId(font), entry = { id, name, kind: 'bitmap', height: font.height };
  await inStore('readwrite', (fonts) => fonts.put({ ...entry, data: font.bytes }));
  return entry;
}

// A stored bitmap font as a drawing holds one: { name, height, bytes }.
export async function storedBitmapFont(id) {
  const record = await inStore('readonly', (fonts) => fonts.get(id));
  if (!record) throw new Error(t('font.errors.missing'));
  return { name: record.name, height: record.height, bytes: record.data };
}

// Forget a stored font. keepFace: the drawing still draws in it (its own bitmap font), so the page keeps it registered.
export async function removeFont(id, { keepFace = false } = {}) {
  if (!keepFace) unregister(id);
  await inStore('readwrite', (fonts) => fonts.delete(id));
}
