/**
 * Cells on the wire: what the host's browser sends watchers over the room's data channel (one per
 * watcher, labeled "room", ordered and reliable). Messages are JSON text, except a snapshot's chunks.
 *
 * Host to watcher:
 *   { t: 'room', name, welcome, host }          the room, first thing
 *   { t: 'snapshot', chunks: n }                then n binary messages: packSnapshot's chunks
 *   { t: 'cells', at: [index], colors, cells }  changed cells, encodeCells' form, cells[i] at at[i]
 *   { t: 'view', col, row, cols, rows }         the part of the art the host is looking at
 * Watcher to host:
 *   { t: 'following', on }
 *
 * There are no edit numbers: the channel keeps changes in order, and a watcher ignores 'cells'
 * until its first snapshot.
 */
import { hex2rgb } from '../lib/ColorUtils.js';
import { DISPLAY_FONTS } from '../lib/displayFonts.js';

export const CHUNK_BYTES = 65536;

const WIDE = { lead: 1, trail: 2 };
const WIDE_NAMES = [undefined, 'lead', 'trail'];

// The host's displayFontSpec as sent: null for a font loaded from the host's computer.
export const fontOnWire = (spec) => DISPLAY_FONTS.some((f) => f.id === spec.id) ? { id: spec.id, size: spec.size } : null;

// The font a watcher draws in: that one at the sent size, or Phosphor's default for null or an unknown id.
export function fontFor(onWire) {
  const font = DISPLAY_FONTS.find((f) => f.id === onWire?.id);
  return font ? { ...font, size: onWire.size } : { ...DISPLAY_FONTS[0] };
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

export function decodeCells({ colors, cells }) {
  const palette = colors.map((hex) => ({ ...hex2rgb(hex), hex }));
  return cells.map(([char, fg, bg, wide]) => {
    const cell = { char, fg: { ...palette[fg] }, bg: { ...palette[bg] } };
    if (wide) cell.wide = WIDE_NAMES[wide];
    return cell;
  });
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

export async function unpackSnapshot(chunks) {
  const text = await new Response(new Blob(chunks).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const { cols, lines, font, colors, cells } = JSON.parse(text);
  return { cols, lines, font, cells: decodeCells({ colors, cells }) };
}
