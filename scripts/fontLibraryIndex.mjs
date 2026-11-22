// Builds the font library's index from the mirrored files. Runs under plain Node: imports only modules that load there.
import { CP437 } from '../src/lib/Cp437.js';
import { findBlocks, fontId, glyphRows, ownWidthOf, SAMPLE_CHARS } from '../src/lib/BitmapGlyphs.js';
import { LINKED_FONTS } from '../src/lib/linkedFonts.js';

const SAMPLE_SLOTS = [...SAMPLE_CHARS].map((c) => CP437.indexOf(c));

// Machines. VileR's folders of PC fonts (its own at the top, the programs', the systems', the big pile) are IBM PC
// fonts; its non-PC and other-PC fonts are named for their machine (FONTS.TXT says which), the rest of those being an
// other computer's or a PC clone's (a video card's or a BIOS's). Mœbius's folders name theirs, but discmaster: none.
const VILER_MACHINES = {
  'PC-IBM': 'IBM PC', BIGPILE: 'IBM PC', SOFTWARE: 'IBM PC', SYSTEM: 'IBM PC',
  'PC-OTHER': 'PC clones', 'NON-PC': 'Other computers', UNSCII: 'Unscii',
};
const MOEBIUS_MACHINES = { amiga: 'Amiga', c64: 'Commodore 64', custom: 'Custom', discmaster: undefined, ibm: 'IBM PC' };
// NON-PC's and PC-OTHER's file names (the start of each, upper case) and the machine they name.
const NAMED_MACHINES = [
  [/^A7100/, 'Robotron A7100'], [/^ACER/, 'Acer'], [/^(APC-III|NEC-MS)/, 'NEC'], [/^APRI/, 'Apricot'],
  [/^AS-100/, 'Canon AS-100'], [/^AST-/, 'AST'], [/^ATARI/, 'Atari'], [/^BBC/, 'BBC Micro'], [/^COMPAQ/, 'Compaq'],
  [/^COMPIS/, 'TeleNova Compis'], [/^DG1/, 'Data General One'], [/^EAGLE/, 'Eagle'], [/^EUROPC/, 'Schneider EuroPC'],
  [/^FM-TOWNS/, 'FM Towns'], [/^HP-LX/, 'HP 200LX'], [/^ITTX/, 'ITT Xtra'], [/^(KAYPRO|KPRO2K)/, 'Kaypro'],
  [/^LBPC/, 'Ampro Little Board'], [/^LE-D/, 'Leading Edge'], [/^MBC/, 'Sanyo'], [/^MBPC230/, 'Micro Byte'],
  [/^MINDSET/, 'Mindset'], [/^NIMBUS/, 'RM Nimbus'], [/^NIX-/, 'Nixdorf'], [/^OLI/, 'Olivetti'], [/^OTRONA/, 'Otrona Attaché'],
  [/^(PC1640|PPC)/, 'Amstrad'], [/^PC6300/, 'AT&T'], [/^PVBGC/, 'Pravetz'], [/^(RB100|VT220)/, 'DEC'],
  [/^SEEQUA/, 'Seequa Chameleon'], [/^SHARP/, 'Sharp'], [/^SIEMPCD/, 'Siemens PC-D'], [/^SPERRY/, 'Sperry'],
  [/^TANDY/, 'Tandy'], [/^TELEPC/, 'Televideo'], [/^TI-PC/, 'TI Professional'], [/^(T3100|TOSH)/, 'Toshiba'],
  [/^VTECH/, 'VTech'], [/^(WANG|WVGA)/, 'Wang'], [/^YES-/, 'Philips :YES'], [/^Z100/, 'Zenith Z-100'],
];

// The machine a font was made for, or undefined when its folder names none.
export function machineOf(path) {
  const parts = path.split('/'), [collection, top] = parts;
  if (collection === 'moebius') return top in MOEBIUS_MACHINES ? MOEBIUS_MACHINES[top] : 'Other';
  if (parts.length === 2) return 'IBM PC'; // VileR's own, at the top
  if (top === 'NON-PC' || top === 'PC-OTHER') {
    const stem = parts[parts.length - 1].toUpperCase();
    const named = NAMED_MACHINES.find(([re]) => re.test(stem));
    if (named) return named[1];
  }
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

// The name a mirrored file is stored under. The dev server and the preview read an address the way decodeURI does,
// leaving %26 (&), %2B (+), %23 (#) and their like as they are, so a file with one of those in its name is never found
// there. The stored name has them escaped already, and % with them, so decodeURIComponent gives the font's own path back.
export const storedPath = (path) => path.replace(/[%;?:@&=+$,#]/g, encodeURIComponent);

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
      id: path, fontId: id, name: font.name, file: storedPath(path), height, width: ownWidthOf(font), collection,
      machine: machineOf(path), chars: charsOf(path),
      ready: findBlocks(font).every((s) => s !== null),
      about: about[path], sample: Buffer.from(sample).toString('base64'),
    };
    if (entry.about === undefined) delete entry.about;
    if (entry.machine === undefined) delete entry.machine;
    fonts.push(entry);
    byId.set(id, entry);
  }
  // Every listed copy of a SAUCE name's font carries the name, so whichever the app finds sets it. Two names for one font
  // (IBM EGA43 and IBM VGA50 are both CP437.F08): the copies carry the first in the table's order; both names open it.
  const sauce = {};
  for (const [sauceName, path] of Object.entries(sauceNames)) {
    const id = idOfPath.get(path), e = byId.get(id);
    if (!e) continue;
    for (const copy of fonts) if (copy.fontId === id) copy.sauce ??= sauceName;
    sauce[sauceName] = { file: e.file, name: e.name, height: e.height };
  }
  const linked = LINKED_FONTS.map(({ credit, url, license, ...rest }) => {
    delete rest.upstream;
    return { ...rest, linked: { credit, url, license } };
  });
  return { index: { version: 1, collections, fonts, linked }, sauce };
}
