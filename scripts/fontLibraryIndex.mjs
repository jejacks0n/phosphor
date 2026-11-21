// Builds the font library's index from the mirrored files. Runs under plain Node: imports only modules that load there.
import { CP437 } from '../src/lib/Cp437.js';
import { findBlocks, fontId, glyphRows, SAMPLE_CHARS } from '../src/lib/BitmapGlyphs.js';
import { LINKED_FONTS } from '../src/lib/linkedFonts.js';

const SAMPLE_SLOTS = [...SAMPLE_CHARS].map((c) => CP437.indexOf(c));

// Machines: VileR's top folders, Mœbius's folders.
const VILER_MACHINES = {
  'PC-IBM': 'IBM PC', 'PC-OTHER': 'PC clones', 'NON-PC': 'Other computers', BIGPILE: 'Big pile',
  SOFTWARE: 'Software', SYSTEM: 'Operating systems', UNSCII: 'Unscii',
};
const MOEBIUS_MACHINES = { amiga: 'Amiga', c64: 'Commodore 64', custom: 'Custom', discmaster: 'Discmaster', ibm: 'IBM PC' };

export function machineOf(path) {
  const [collection, top] = path.split('/');
  if (collection === 'moebius') return MOEBIUS_MACHINES[top] ?? 'Other';
  return VILER_MACHINES[top] ?? 'Other';
}

// Character sets: by folder or file name, falling back to CP437.
export function charsOf(path) {
  const parts = path.split('/');
  const [collection, top] = parts;
  const name = parts[parts.length - 1];
  if (collection === 'moebius') {
    if (top === 'amiga') return 'latin1';
    if (top === 'c64') return 'petscii';
    if (top !== 'discmaster') return 'cp437';
  }
  if (/CPIKOI|RU_UTIL/i.test(path) || /koi|cyr|rus/i.test(name)) return 'cyrillic';
  if (/HEB_UTIL/i.test(path) || /heb/i.test(name)) return 'hebrew';
  if (/VGAGREEK/i.test(path) || /greek|grk/i.test(name)) return 'greek';
  if (/arab/i.test(name)) return 'arabic';
  if (/CPIISO|CPIWIN|CPIMAC/i.test(path) || /topaz|iso|latin/i.test(name)) return 'latin1';
  if (/c64|petscii/i.test(name)) return 'petscii';
  return 'cp437';
}

// The name a person sees: no extension, spaces for underscores, Mœbius's doubled fonts say so.
export function nameOf(path) {
  const file = path.split('/').pop().replace(/\.[^.]*$/, '');
  const doubled = path.startsWith('moebius/') && /_2x$/i.test(file);
  return `${file.replace(/_2x$/i, '').replace(/_/g, ' ')}${doubled ? ' (doubled)' : ''}`;
}

export function buildIndex({ files, about = {}, collections = [], sauceNames = {} }) {
  const fonts = [];
  const seen = new Map(); // fontId -> collection that listed it first
  const byPath = new Map();
  const ordered = [...files].sort((a, b) => (a.path.startsWith('viler/') ? 0 : 1) - (b.path.startsWith('viler/') ? 0 : 1));
  for (const { path, bytes } of ordered) {
    const height = bytes.length / 256;
    if (!Number.isInteger(height) || height < 1 || height > 32) continue;
    const font = { name: nameOf(path), height, bytes };
    const id = fontId(font);
    const collection = path.split('/')[0];
    if (seen.has(id) && seen.get(id) !== collection) continue;
    seen.set(id, collection);
    const sample = new Uint8Array(SAMPLE_SLOTS.length * height);
    SAMPLE_SLOTS.forEach((slot, i) => sample.set(glyphRows(font, slot), i * height));
    const entry = {
      id: path, fontId: id, name: font.name, file: path, height, collection,
      machine: machineOf(path), chars: charsOf(path),
      ready: findBlocks(font).every((s) => s !== null),
      about: about[path], sample: Buffer.from(sample).toString('base64'),
    };
    if (entry.about === undefined) delete entry.about;
    fonts.push(entry);
    byPath.set(path, entry);
  }
  const sauce = {};
  for (const [sauceName, path] of Object.entries(sauceNames)) {
    const e = byPath.get(path);
    if (!e) continue;
    e.sauce = sauceName;
    sauce[sauceName] = { file: path, name: e.name, height: e.height };
  }
  const linked = LINKED_FONTS.map(({ credit, url, license, ...rest }) => {
    delete rest.upstream;
    return { ...rest, linked: { credit, url, license } };
  });
  return { index: { version: 1, collections, fonts, linked }, sauce };
}
