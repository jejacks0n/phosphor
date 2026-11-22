import { describe, expect, it } from 'vitest';
import { buildIndex, charsOf, machineOf } from '../../scripts/fontLibraryIndex.mjs';
import { LINKED_FONTS, linkedFontOf } from '../../src/lib/linkedFonts.js';
import { SAMPLE_CHARS } from '../../src/lib/BitmapGlyphs.js';

// 256 glyphs of h rows: slot s's rows are all (s + 1) & 0xff unless given.
const make = (h, fill = (s) => (s + 1) & 0xff) => {
  const bytes = new Uint8Array(256 * h);
  for (let s = 0; s < 256; s++) bytes.fill(fill(s), s * h, (s + 1) * h);
  return bytes;
};
// A font with CP437's blocks drawn at their usual slots (half-block quarters, shades by checker density).
const blocksFont = (h, { skip = -1 } = {}) => {
  const bytes = new Uint8Array(256 * h);
  const set = (s, f) => { if (s !== skip) for (let y = 0; y < h; y++) bytes[s * h + y] = f(y); };
  set(219, () => 0xff);
  set(220, (y) => (y >= h / 2 ? 0xff : 0));
  set(223, (y) => (y < h / 2 ? 0xff : 0));
  set(221, () => 0xf0);
  set(222, () => 0x0f);
  set(176, (y) => (y % 4 === 0 ? 0xaa : 0x00)); // light
  set(177, (y) => (y % 2 ? 0xaa : 0x55)); // medium
  set(178, (y) => (y % 4 === 0 ? 0xaa : 0xff)); // dark
  return bytes;
};
const run = (files, extra = {}) => buildIndex({ files, about: {}, collections: [], sauceNames: {}, ...extra });

describe('buildIndex', () => {
  it('names: drops the extension, underscores become spaces, _2x becomes "(doubled)"', () => {
    const { index } = run([{ path: 'moebius/discmaster/Blobz+_1_2x.f16', bytes: make(16) }]);
    expect(index.fonts[0].name).toBe('Blobz+ 1 (doubled)');
  });

  it('shape comes from the size, not the extension', () => {
    expect(run([{ path: 'viler/PC-IBM/X.F16', bytes: make(14) }]).index.fonts[0].height).toBe(14);
  });

  it('entries carry their own width: a 7-wide font says 7, a full one 8, linked ones 8', () => {
    const { index } = run([
      { path: 'viler/PC-IBM/N.F08', bytes: make(8, () => 0xfe) },
      { path: 'viler/PC-IBM/W.F08', bytes: make(8, () => 0xff) },
    ]);
    expect(index.fonts.map((f) => [f.name, f.width])).toEqual([['N', 7], ['W', 8]]);
    expect(index.linked[0].width).toBe(8);
  });

  it('a file of no font size is left out', () => {
    const { index } = run([
      { path: 'viler/PC-IBM/A.F16', bytes: new Uint8Array(100) },
      { path: 'viler/PC-IBM/B.F16', bytes: new Uint8Array(256 * 33) },
    ]);
    expect(index.fonts).toEqual([]);
  });

  it('the same bytes in both collections are listed once, under VileR', () => {
    const bytes = make(8);
    const { index } = run([
      { path: 'moebius/ibm/Same.F08', bytes },
      { path: 'viler/PC-IBM/Same.F08', bytes },
    ]);
    expect(index.fonts.map((f) => f.id)).toEqual(['viler/PC-IBM/Same.F08']);
  });

  it('ready only when all eight blocks are found', () => {
    const { index } = run([
      { path: 'viler/PC-IBM/Ok.F16', bytes: blocksFont(16) },
      { path: 'viler/PC-IBM/NoLight.F16', bytes: blocksFont(16, { skip: 176 }) },
    ]);
    expect(index.fonts.map((f) => f.ready)).toEqual([true, false]);
  });

  it("the sample is the 12 sample characters' glyphs", () => {
    const bytes = make(14);
    const { index } = run([{ path: 'viler/PC-IBM/S.F14', bytes }]);
    const sample = Uint8Array.from(Buffer.from(index.fonts[0].sample, 'base64'));
    expect(SAMPLE_CHARS).toHaveLength(12);
    expect(sample).toHaveLength(12 * 14);
    [65, 97, 176, 177, 178, 219, 220, 223, 201, 205, 187, 1].forEach((slot, i) => {
      expect([...sample.subarray(i * 14, (i + 1) * 14)]).toEqual([...bytes.subarray(slot * 14, (slot + 1) * 14)]);
    });
  });

  it('linked fonts come from LINKED_FONTS, with no file or sample', () => {
    const { index } = run([]);
    expect(index.linked).toHaveLength(LINKED_FONTS.length);
    const [f] = index.linked;
    expect(f).toMatchObject({ id: 'linked/frogblock', name: 'FROGBLOCK', height: 8, linked: { credit: 'FROGBLOCK font by Polyducks', url: 'https://polyducks.itch.io/frogblock' } });
    expect(f).not.toHaveProperty('file');
    expect(f).not.toHaveProperty('sample');
    expect(f).not.toHaveProperty('upstream');
    expect(f).not.toHaveProperty('collection');
    expect(linkedFontOf(LINKED_FONTS[0].fontId)).toBe(LINKED_FONTS[0]);
    expect(linkedFontOf('nope')).toBeNull();
  });

  it('sauce maps each name to its file, name and height', () => {
    const { sauce, index } = run([{ path: 'viler/PC-IBM/EGA8.F14', bytes: make(14) }], { sauceNames: { 'IBM VGA': 'viler/PC-IBM/EGA8.F14', Gone: 'viler/x/none.F08' } });
    expect(sauce).toEqual({ 'IBM VGA': { file: 'viler/PC-IBM/EGA8.F14', name: 'EGA8', height: 14 } });
    expect(index.fonts[0].sauce).toBe('IBM VGA');
  });

  it('a sauce name whose file was listed once under VileR points at VileR\'s file', () => {
    const { sauce } = run([
      { path: 'viler/PC-IBM/EGA8.F14', bytes: make(14) }, { path: 'moebius/ibm/CP437.F14', bytes: make(14) },
    ], { sauceNames: { 'IBM EGA': 'moebius/ibm/CP437.F14' } });
    expect(sauce['IBM EGA'].file).toBe('viler/PC-IBM/EGA8.F14');
  });

  it('every listed copy of a SAUCE name\'s font carries the name, the first name in the table when two share a font', () => {
    const bytes = make(8);
    const { sauce, index } = run([
      { path: 'viler/PC-IBM/A.F08', bytes }, { path: 'viler/PC-IBM/B.F08', bytes }, { path: 'moebius/ibm/CP437.F08', bytes },
    ], { sauceNames: { 'IBM EGA43': 'moebius/ibm/CP437.F08', 'IBM VGA50': 'moebius/ibm/CP437.F08' } });
    expect(index.fonts.map((f) => [f.id, f.sauce])).toEqual([['viler/PC-IBM/A.F08', 'IBM EGA43'], ['viler/PC-IBM/B.F08', 'IBM EGA43']]);
    expect(Object.keys(sauce)).toEqual(['IBM EGA43', 'IBM VGA50']); // both names still open in the font
  });

  it('a font with no machine carries no machine', () => {
    const { index } = run([{ path: 'moebius/discmaster/X.f08', bytes: make(8) }]);
    expect(index.fonts[0]).not.toHaveProperty('machine');
  });

  it('carries the about text of a VileR font', () => {
    const { index } = run([{ path: 'viler/PC-IBM/A.F08', bytes: make(8) }], { about: { 'viler/PC-IBM/A.F08': 'Hello' } });
    expect(index.fonts[0].about).toBe('Hello');
  });
});

describe('machineOf and charsOf', () => {
  it('Amiga fonts are latin1, C64 fonts petscii, VileR PC fonts cp437', () => {
    expect(charsOf('moebius/amiga/MicroKnight.F16')).toBe('latin1');
    expect(charsOf('moebius/c64/PETSCII shifted.F08')).toBe('petscii');
    expect(charsOf('moebius/discmaster/c641.f08')).toBe('petscii');
    expect(charsOf('viler/PC-IBM/EGA8.F14')).toBe('cp437');
    expect(charsOf('moebius/custom/FROGBLOCK.F08')).toBe('cp437');
  });

  it('other scripts come from the folder or the name', () => {
    expect(charsOf('viler/SYSTEM/FREEDOS/CPIKOI12/CP878.F16')).toBe('cyrillic');
    expect(charsOf('viler/SOFTWARE/HEB_UTIL/LOADHEB.F16')).toBe('hebrew');
    expect(charsOf('viler/SOFTWARE/VGAGREEK/GREEK.F06')).toBe('greek');
    expect(charsOf('moebius/discmaster/Arab_FONT1.f08')).toBe('arabic');
    expect(charsOf('viler/SYSTEM/FREEDOS/CPIISO12/CP819.F08')).toBe('latin1');
  });

  it('ISO fonts take the script of their ISO 8859 part', () => {
    expect(charsOf('viler/SYSTEM/FREEBSD/ISO05.F16')).toBe('cyrillic');
    expect(charsOf('viler/SYSTEM/FREEBSD/ISO06.F16')).toBe('arabic');
    expect(charsOf('viler/SYSTEM/FREEBSD/ISO07.F16')).toBe('greek');
    expect(charsOf('viler/SYSTEM/FREEBSD/ISO08.F16')).toBe('hebrew');
    expect(charsOf('viler/SYSTEM/FREEBSD/ISO01.F16')).toBe('latin1');
    expect(charsOf('viler/SYSTEM/FREEBSD/ISO15_T.F16')).toBe('latin1');
    expect(charsOf('moebius/discmaster/Xen-Wide-ISO9.f08')).toBe('latin1');
    expect(charsOf('moebius/discmaster/ISOTopazPL.f08')).toBe('latin1');
  });

  it('each name rule matches whole words, so unrelated fonts stay cp437', () => {
    for (const p of ['viler/SOFTWARE/FE2/BRUSH.F16', 'viler/BIGPILE/GRUSS.F16', 'viler/BIGPILE/PRISON.F14', 'viler/BIGPILE/SHEBA.F14', 'viler/BIGPILE/CYBER.F16', 'viler/BIGPILE/ORABIC.F16', 'viler/PC-OTHER/PRISM.F16', 'viler/PC-OTHER/AC64.F16', 'viler/PC-OTHER/ISOCP850.F16', 'viler/PC-OTHER/TERMISO80.F16'])
      expect(charsOf(p), p).toBe('cp437');
    expect(charsOf('viler/BIGPILE/KOI8-R.F16')).toBe('cyrillic');
    expect(charsOf('moebius/discmaster/Venuskoi8.f08')).toBe('cyrillic');
    expect(charsOf('viler/BIGPILE/866_RUS.F16')).toBe('cyrillic');
    expect(charsOf('viler/BIGPILE/HEB-BOLD.F16')).toBe('hebrew');
    expect(charsOf('viler/BIGPILE/GREEK2.F14')).toBe('greek');
    expect(charsOf('viler/BIGPILE/ARABKUFI.F14')).toBe('arabic');
    expect(charsOf('viler/SYSTEM/FREEBSD/HAIK8.F16')).toBe('armenian');
    expect(charsOf('moebius/discmaster/Topaz_1.f11')).toBe('latin1');
  });

  it('machines come from the top folder', () => {
    expect(machineOf('viler/PC-IBM/EGA8.F14')).toBe('IBM PC');
    expect(machineOf('moebius/amiga/X.F16')).toBe('Amiga');
    expect(machineOf('moebius/c64/X.F08')).toBe('Commodore 64');
    expect(machineOf('moebius/ibm/CP437.F16')).toBe('IBM PC');
    expect(machineOf('viler/NEW/X.F08')).toBe('Other');
  });

  it('VileR\'s folders of PC fonts and its own fonts are IBM PC fonts', () => {
    for (const p of ['viler/SOFTWARE/FE2/BRUSH.F16', 'viler/SYSTEM/FREEDOS/CPIKOI12/CP878.F16', 'viler/BIGPILE/GRUSS.F16', 'viler/9THWAVE.F14'])
      expect(machineOf(p), p).toBe('IBM PC');
  });

  it('a folder that names no machine gives none', () => {
    expect(machineOf('moebius/discmaster/c641.f08')).toBeUndefined();
  });

  it('non-PC and other PC fonts take their machine from the file name', () => {
    const machines = {
      'viler/NON-PC/ATARIPOF.F08': 'Atari', 'viler/NON-PC/BBC512_D.F16': 'BBC Micro', 'viler/NON-PC/TANDY2K1.F16': 'Tandy',
      'viler/NON-PC/KAYPROII.F10': 'Kaypro', 'viler/NON-PC/WANG437M.F12': 'Wang', 'viler/NON-PC/VT220CRT.F10': 'DEC',
      'viler/NON-PC/RB100ROM.F10': 'DEC', 'viler/NON-PC/APC-III.F08': 'NEC', 'viler/NON-PC/Z100-A_D.F18': 'Zenith Z-100',
      'viler/NON-PC/TOSHT300.F08': 'Toshiba', 'viler/NON-PC/COMPIS.F16': 'TeleNova Compis',
      'viler/PC-OTHER/PC1640AD.F16': 'Amstrad', 'viler/PC-OTHER/PPC-M1.F14': 'Amstrad', 'viler/PC-OTHER/PC6300.F16': 'AT&T',
      'viler/PC-OTHER/MBC775.F08': 'Sanyo', 'viler/PC-OTHER/MBPC230M.F14': 'Micro Byte', 'viler/PC-OTHER/COMPAQP3.F16': 'Compaq',
      'viler/PC-OTHER/TANDY2M9.F14': 'Tandy', 'viler/PC-OTHER/KPRO2K.F08': 'Kaypro', 'viler/PC-OTHER/T3100-A1.F16': 'Toshiba',
      'viler/PC-OTHER/WVGA8.F16': 'Wang', 'viler/PC-OTHER/NEC-MS1A.F08': 'NEC',
    };
    for (const [p, machine] of Object.entries(machines)) expect(machineOf(p), p).toBe(machine);
  });

  it('a video card\'s or a BIOS\'s font is a PC clone\'s; a non-PC font no pattern names stays an other computer\'s', () => {
    for (const p of ['viler/PC-OTHER/ATI8X16.F16', 'viler/PC-OTHER/TRIVGA8.F16', 'viler/PC-OTHER/PHXBIOS.F08', 'viler/PC-OTHER/COPAMX.F08'])
      expect(machineOf(p), p).toBe('PC clones');
    expect(machineOf('viler/NON-PC/NEWONE.F08')).toBe('Other computers');
  });
});

describe('buildIndex and linked fonts', () => {
  it('a file at a linked font\'s upstream path is never listed', () => {
    const { index } = run([{ path: LINKED_FONTS[0].upstream, bytes: make(8) }]);
    expect(index.fonts).toEqual([]);
    expect(index.linked).toHaveLength(1);
  });
});
