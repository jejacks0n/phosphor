import { normalizeGlyphs, fitsGrid } from './charPalettes.js';
import { fileStem } from '../document/projectIO.js';
import { t } from '@/i18n/index.js';

// Palettes as a file: each one's name, its twelve slots ('' for an empty one, or one a cell can't hold) and the font
// it's tied to, if any.

const font = (f) =>
  f && typeof f.id === 'string' && Number.isInteger(f.height) && f.height >= 1 && f.height <= 32
    ? { id: f.id, name: typeof f.name === 'string' ? f.name : '', height: f.height }
    : null;

export function writePaletteFile(palettes) {
  const list = palettes.map((p) => ({ name: p.name, glyphs: normalizeGlyphs(p.glyphs), font: font(p.font) }));
  return JSON.stringify({ phosphor: 'palettes', version: 1, palettes: list }, null, 2) + '\n';
}

export function readPaletteFile(text, fileName) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (data?.phosphor !== 'palettes' || data.version !== 1 || !Array.isArray(data.palettes) || !data.palettes.length) {
    throw new Error(t('palette.file.notPalettes', { name: fileName }));
  }
  return data.palettes.map((p) => ({
    name: typeof p?.name === 'string' && p.name ? p.name : t('palette.untitled'),
    glyphs: normalizeGlyphs(Array.isArray(p?.glyphs) ? p.glyphs.map((g) => (typeof g === 'string' && fitsGrid(g) ? g : '')) : []),
    font: font(p?.font),
  }));
}

export const paletteFileName = (name) => `${fileStem(name, 'json') || 'palettes'}.palettes.json`;
