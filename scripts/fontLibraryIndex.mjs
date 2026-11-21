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

// Character sets. Folder rules first (a whole folder is one script), then rules on the file's name, which are matched
// against its words (split on anything but letters and digits) and never against substrings, so BRUSH is not Russian.
const FOLDER_CHARS = [
  [/^(CPIKOI12|RU_UTIL)$/, 'cyrillic'], [/^HEB_UTIL$/, 'hebrew'], [/^VGAGREEK$/, 'greek'],
  [/^(CPIISO12|CPIWIN12|CPIMAC12)$/, 'latin1'],
];
// ISO 8859 parts that are not Latin scripts (FONTS.TXT's FREEBSD fonts are named ISOnn after them); the rest are Latin.
const ISO_SCRIPTS = { 5: 'cyrillic', 6: 'arabic', 7: 'greek', 8: 'hebrew' };
const WORD_CHARS = [
  [/(KOI8)|^(CYR|CYRUS$|RUS$|RUSS|CP866|CP1251|SWIS1251|SWIS1131)/, 'cyrillic'],
  [/^(HEB|OLIPC1HE)/, 'hebrew'],
  [/^(GREEK|GRK$|ACERGR|ATISWGR|MTGRC|OLIPC1GR|OLIVGR|HYUNMGR|GRMONO)/, 'greek'],
  [/^ARAB/, 'arabic'],
  [/^(ARMSCII|HAIK)/, 'armenian'],
  [/^(C64|PETSCII)/, 'petscii'],
  [/TOPAZ/, 'latin1'],
];

export function charsOf(path) {
  const parts = path.split('/');
  const [collection, top] = parts;
  if (collection === 'moebius') {
    if (top === 'amiga') return 'latin1';
    if (top === 'c64') return 'petscii';
    if (top !== 'discmaster') return 'cp437';
  }
  for (const folder of parts.slice(1, -1)) for (const [re, chars] of FOLDER_CHARS) if (re.test(folder)) return chars;
  const words = parts[parts.length - 1].replace(/\.[^.]*$/, '').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  for (const word of words) {
    const iso = /^ISO(\d\d?)(?!\d)/.exec(word);
    if (iso) return ISO_SCRIPTS[+iso[1]] ?? 'latin1';
    for (const [re, chars] of WORD_CHARS) if (re.test(word)) return chars;
  }
  return 'cp437';
}

// The name a person sees: no extension, spaces for underscores, Mœbius's doubled fonts say so.
export function nameOf(path) {
  const file = path.split('/').pop().replace(/\.[^.]*$/, '');
  const doubled = path.startsWith('moebius/') && /_2x$/i.test(file);
  return `${file.replace(/_2x$/i, '').replace(/_/g, ' ')}${doubled ? ' (doubled)' : ''}`;
}

export function buildIndex({ files, about = {}, collections = {}, sauceNames = {} }) {
  const fonts = [];
  const seen = new Map(); // fontId -> collection that listed it first
  const idOfPath = new Map(); // every file's font id, so a name can reach the entry that kept its shape
  const byId = new Map();
  const linkedPaths = LINKED_FONTS.map((f) => f.upstream); // listed as linked, never twice
  const ordered = files.filter((f) => !linkedPaths.includes(f.path)).sort((a, b) => (a.path.startsWith('viler/') ? 0 : 1) - (b.path.startsWith('viler/') ? 0 : 1));
  for (const { path, bytes } of ordered) {
    const height = bytes.length / 256;
    if (!Number.isInteger(height) || height < 1 || height > 32) continue;
    const font = { name: nameOf(path), height, bytes };
    const id = fontId(font);
    idOfPath.set(path, id);
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
    byId.set(id, entry);
  }
  const sauce = {};
  for (const [sauceName, path] of Object.entries(sauceNames)) {
    const e = byId.get(idOfPath.get(path));
    if (!e) continue;
    e.sauce = sauceName;
    sauce[sauceName] = { file: e.file, name: e.name, height: e.height };
  }
  const linked = LINKED_FONTS.map(({ credit, url, license, ...rest }) => {
    delete rest.upstream;
    return { ...rest, linked: { credit, url, license } };
  });
  return { index: { version: 1, collections, fonts, linked }, sauce };
}
