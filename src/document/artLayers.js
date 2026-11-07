/**
 * An art layer's record: a block of hand-drawn cells that lives on the vector layer as another kind of shape.
 *
 * Art = { z, m, art: { cols, rows, cells } }, frozen:
 *   m      [1, 0, 0, 1, e, f]: it only moves, and on whole cells (e an integer, f an even one)
 *   z      stacking order, as a shape's
 *   cells  [[i, char, top, bottom], ...] sorted by i, only cells with something in them: i is row * cols + col in
 *          the layer's own grid; char a one-character string, or null (no character: the converter's, or the
 *          cell's halves only); top and bottom the half-cells' colors, '#rrggbb' or null (see-through)
 *   follow, along  the path it follows and how far along it is (followOf): absent when it follows none, and at 0
 * Nothing here touches a canvas, and shapes.js imports this, not the other way round.
 */

import { MAX_COLS, MAX_LINES } from '../lib/Cells.js';
import { graphemes } from '../lib/CharWidth.js';

export const MOST_ART_BYTES = 60000; // a record as JSON, in UTF-8 bytes: it fits in one room message
const MOST_Z = 1e6;
const MOST_SHIFT = 1e7;
const HEX = /^#[0-9a-f]{6}$/i;
const HALVES = new Set([' ', '█', '▀', '▄']);

export const SHAPE_KEY = /^v:[A-Za-z0-9_-]{1,32}$/; // a shape's key (shapes.js)
const RIDES = ['start', 'end'], MOTIONS = ['half', 'cells']; // the values other than the default: along it, on its own keys; smoothly
const rounded = (v) => Math.round(v * 1e4) / 1e4 || 0; // 1/10000, no -0

export const isArt = (shape) => !!shape && !!shape.art;

const encoder = new TextEncoder();
// The record's size as it travels: its JSON in UTF-8 bytes.
export const artBytes = (shape) => encoder.encode(JSON.stringify(shape)).length;

const whole = (v) => (Math.round(v) || 0); // no -0: it reads back as 0
// A transform's move to the nearest whole cell (e whole, f even), and nothing else.
export const onCells = (m) => Object.freeze([1, 0, 0, 1, whole(m[4]), 2 * whole(m[5] / 2)]);

// A follow link (the path a shape or art layer follows, and how) frozen, its defaults left out. face: only a shape's.
export const makeFollow = ({ key, ride, face, motion }) => Object.freeze({
  key,
  ...(RIDES.includes(ride) && { ride }),
  ...(face && { face: true }),
  ...(MOTIONS.includes(motion) && { motion }),
});
// Whether a stranger's follow link is exactly what makeFollow makes: a path's key, and only values other than the defaults.
export function goodFollow(value, art) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).every((k) => ['key', 'ride', 'face', 'motion'].includes(k))) return false;
  if (typeof value.key !== 'string' || !SHAPE_KEY.test(value.key)) return false;
  if (('ride' in value && !RIDES.includes(value.ride)) || ('motion' in value && !MOTIONS.includes(value.motion))) return false;
  return !('face' in value) || (value.face === true && !art);
}
// How far along its path, a share 0 to 1 (the default 0 left out).
export const goodAlong = (along) => typeof along === 'number' && along > 0 && along <= 1;

export function makeArt({ z = 0, m, art, follow, along }) {
  const cells = art.cells.map((cell) => Object.freeze([...cell]));
  const record = {
    z,
    m: onCells(m),
    art: Object.freeze({ cols: art.cols, rows: art.rows, cells: Object.freeze(cells) }),
  };
  if (follow) record.follow = makeFollow({ ...follow, face: false });
  if (along && rounded(along)) record.along = rounded(along);
  return Object.freeze(record);
}

const goodColor = (c) => c === null || (typeof c === 'string' && HEX.test(c));
const goodCell = (cell, size) => Array.isArray(cell) && cell.length === 4 && Number.isInteger(cell[0]) && cell[0] >= 0 && cell[0] < size
  && (cell[1] === null || (typeof cell[1] === 'string' && graphemes(cell[1]).length === 1)) && goodColor(cell[2]) && goodColor(cell[3]);
const sameKeys = (value, keys) => Object.keys(value).length === keys.length && keys.every((k) => k in value);

// A record from a file, a project or another browser: exactly what makeArt makes, or null.
export function artFromStranger(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['z', 'm', 'art'].every((k) => k in value) || !Object.keys(value).every((k) => ['z', 'm', 'art', 'follow', 'along'].includes(k))) return null;
  const { z, m, art, follow, along } = value;
  if (('follow' in value && !goodFollow(follow, true)) || ('along' in value && !goodAlong(along))) return null;
  if (!Number.isInteger(z) || Math.abs(z) > MOST_Z) return null;
  if (!Array.isArray(m) || m.length !== 6 || m[0] !== 1 || m[1] !== 0 || m[2] !== 0 || m[3] !== 1) return null;
  if (!Number.isInteger(m[4]) || !Number.isInteger(m[5] / 2) || Math.abs(m[4]) > MOST_SHIFT || Math.abs(m[5]) > MOST_SHIFT) return null;
  if (!art || typeof art !== 'object' || Array.isArray(art) || !sameKeys(art, ['cols', 'rows', 'cells'])) return null;
  const { cols, rows, cells } = art;
  if (!Number.isInteger(cols) || cols < 1 || cols > MAX_COLS || !Number.isInteger(rows) || rows < 1 || rows > MAX_LINES || !Array.isArray(cells)) return null;
  let last = -1;
  for (const cell of cells) {
    if (!goodCell(cell, cols * rows) || cell[0] <= last) return null;
    last = cell[0];
  }
  if (artBytes(value) > MOST_ART_BYTES) return null;
  return makeArt(value);
}

// One drawn cell, [char, top, bottom] in the layer's form, from an edit-layer entry { char?, fg?, bg? } (or null)
// and its paint halves (opaque '#rrggbb' or null); null when nothing shows. shown: the character the cell shows, for
// one with no character of its own (paint alone, or colors alone), so it keeps the one the drawing showed there. A
// solid or half glyph becomes '▄' with each half's color; any other character keeps itself, its background on top and
// its foreground below. A painted half replaces that half's color.
// ponytail: soft paint is flattened at the half (taken where its alpha is at least half, opaque); keep alpha if art needs soft edges.
export function artCellOf(entry, top, bottom, shown = null) {
  if (!entry && !top && !bottom) return null; // never drawn on, or erased: see-through
  const { fg = null, bg = null } = entry ?? {}, char = entry?.char ?? shown;
  if (char && !HALVES.has(char)) return [char, top ?? bg, bottom ?? fg];
  const [t, b] = { '▀': [fg, bg], '▄': [bg, fg], '█': [fg, fg] }[char] ?? [bg, bg];
  const cell = ['▄', top ?? t, bottom ?? b];
  return cell[1] === null && cell[2] === null ? null : cell;
}

// The record's box in grid pixels (a cell is a column wide and two grid pixels tall).
export const artBounds = ({ m, art }) => ({ x: m[4], y: m[5], w: art.cols, h: 2 * art.rows });
