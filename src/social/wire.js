/**
 * Cells on the wire: what the host's browser sends watchers over the room's data channel (one per
 * watcher, labeled "room", ordered and reliable). Messages are JSON text, except a snapshot's chunks.
 *
 * Host to watcher:
 *   { t: 'room', name, welcome }                the room, first thing (who hosts it is the server's word)
 *   { t: 'snapshot', chunks: n }                then n binary messages: packSnapshot's chunks
 *   { t: 'cells', at: [index], colors, cells }  changed cells, encodeCells' form, cells[i] at at[i]
 *   { t: 'view', col, row, cols, rows, zoom }   the part of the art the host is looking at, and its zoom: a
 *                                               fraction of the font's cell, 0.25 to 1
 *   { t: 'away' }                               the host's page is going (a reload, or closing): the watcher
 *                                               treats its connection as lost, and the next offer connects it again
 * Watcher to host:
 *   { t: 'tracking', on }
 *
 * There are no edit numbers: the channel keeps changes in order, and a watcher ignores 'cells'
 * until its first snapshot.
 */
import { hex2rgb } from '../lib/ColorUtils.js';
import { DISPLAY_FONTS, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../lib/displayFonts.js';
import { MAX_COLS, MAX_LINES, MAX_CELLS } from '../lib/Cells.js';
import { usableChar } from '../lib/CharWidth.js';

export const CHUNK_BYTES = 65536;
// The most a snapshot may be, for a watcher that doesn't trust its host. The biggest document at its
// worst (500,000 cells, every color different, wide characters) is 20 MB of JSON, 4.5 MB gzipped.
export const MOST_SNAPSHOT_BYTES = 32 * 1024 * 1024;   // unzipped
export const MOST_SNAPSHOT_CHUNKS = (16 * 1024 * 1024) / CHUNK_BYTES;   // zipped: 256

const WIDE = { lead: 1, trail: 2 };
const WIDE_NAMES = [undefined, 'lead', 'trail'];
const HEX = /^#[0-9a-f]{6}$/i;

// The host's displayFontSpec as sent: null for a font loaded from the host's computer.
export const fontOnWire = (spec) => DISPLAY_FONTS.some((f) => f.id === spec.id) ? { id: spec.id, size: spec.size } : null;

// The font a watcher draws in: that one at the sent size (held to the sizes FontField allows; its own
// size for one that isn't a number), or Phosphor's default for null or an unknown id.
export function fontFor(onWire) {
  const font = DISPLAY_FONTS.find((f) => f.id === onWire?.id);
  if (!font) return { ...DISPLAY_FONTS[0] };
  const size = Number.isFinite(onWire.size) ? Math.min(Math.max(Math.round(onWire.size), MIN_FONT_SIZE), MAX_FONT_SIZE) : font.size;
  return { ...font, size };
}

// Cells as [char, fg, bg] (a fourth item for a wide half), the colors as indexes into a table.
export function encodeCells(cells) {
  const colors = [];
  const index = new Map();
  const at = (hex) => {
    if (!index.has(hex)) index.set(hex, colors.push(hex) - 1);
    return index.get(hex);
  };
  return {
    colors,
    cells: cells.map(({ char, fg, bg, wide }) => {
      const out = [char, at(fg.hex), at(bg.hex)];
      if (wide) out.push(WIDE[wide]);
      return out;
    }),
  };
}

// One Color per entry in the table, shared by the cells of that color as the renderer's are (a Color is
// never changed in place). They come from a stranger, so anything that isn't as encodeCells makes it (a
// color that isn't a hex, an index that isn't in the table, a char that isn't a string, a wide half that
// isn't 1 or 2, a table bigger than its cells' two colors each can use) throws.
export function decodeCells({ colors, cells }) {
  if (!Array.isArray(colors) || !Array.isArray(cells) || colors.length > cells.length * 2) throw new Error('Not a table');
  const palette = colors.map((hex) => {
    if (typeof hex !== 'string' || !HEX.test(hex)) throw new Error('Not a color');
    return { ...hex2rgb(hex), hex };
  });
  const colorAt = (i) => {
    if (!(Number.isInteger(i) && i >= 0 && i < palette.length)) throw new Error('No such color');
    return palette[i];
  };
  return cells.map(([char, fg, bg, wide]) => {
    if (typeof char !== 'string') throw new Error('Not a character');
    // More than one character a cell can hold shows as a space, not the whole art refused.
    const cell = { char: usableChar(char) ? char : ' ', fg: colorAt(fg), bg: colorAt(bg) };
    if (wide !== undefined) {
      if (wide !== 1 && wide !== 2) throw new Error('Not a wide half');
      cell.wide = WIDE_NAMES[wide];
    }
    return cell;
  });
}

// A change's places and its cells, or null, before anything is made, when the places don't fit a grid of
// `count` cells or aren't one for each cell.
export function decodeChange({ at, colors, cells }, count) {
  if (!Array.isArray(at) || !Array.isArray(cells) || at.length !== cells.length) return null;
  if (!at.every((i) => Number.isInteger(i) && i >= 0 && i < count)) return null;
  return { at, cells: decodeCells({ colors, cells }) };
}

// The indexes whose char, colors or wide half differ; null when the lengths differ or more than a
// quarter changed (send a snapshot instead).
export function changedCells(prev, next) {
  if (prev.length !== next.length) return null;
  const limit = next.length / 4;
  const at = [];
  for (let i = 0; i < next.length; i++) {
    const a = prev[i];
    const b = next[i];
    if (a === b) continue;
    if (a.char !== b.char || a.fg.hex !== b.fg.hex || a.bg.hex !== b.bg.hex || a.wide !== b.wide) {
      if (at.push(i) > limit) return null;
    }
  }
  return at;
}

const bytesOf = (stream) => new Response(stream).arrayBuffer().then((b) => new Uint8Array(b));

// The whole document gzipped, cut into pieces of CHUNK_BYTES or less.
export async function packSnapshot({ cols, lines, font, cells }) {
  const json = JSON.stringify({ cols, lines, font, ...encodeCells(cells) });
  const bytes = await bytesOf(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip')));
  const chunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) chunks.push(bytes.subarray(i, i + CHUNK_BYTES));
  return chunks;
}

// A grid the app could have made: within its limits, and the cells to fill it.
const fits = (cols, lines, cells) => Number.isInteger(cols) && Number.isInteger(lines) && cols >= 1 && lines >= 1
  && cols <= MAX_COLS && lines <= MAX_LINES && cols * lines <= MAX_CELLS && Array.isArray(cells) && cells.length === cols * lines;

// The document again. Throws for anything a host's packSnapshot wouldn't make: unzipped past
// MOST_SNAPSHOT_BYTES (it stops reading there), or a grid that doesn't fit, before any cell is made.
export async function unpackSnapshot(chunks) {
  const reader = new Blob(chunks).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.length;
    if (size > MOST_SNAPSHOT_BYTES) {
      reader.cancel();
      throw new Error('Snapshot too big');
    }
    parts.push(read.value);
  }
  const { cols, lines, font, colors, cells } = JSON.parse(await new Blob(parts).text());
  if (!fits(cols, lines, cells)) throw new Error('Snapshot doesn\'t fit the grid');
  return { cols, lines, font, cells: decodeCells({ colors, cells }) };
}
