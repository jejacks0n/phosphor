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
 *   { t: 'follow', sub }                        look where this artist is looking (null: the host). Only the view
 *                                               of the one followed is sent, unless 'show-everyone' asked for more
 *   { t: 'show-everyone', on }                  ask for the host's view and 'views' of every artist
 * Host to watcher, besides the above:
 *   { t: 'view', ..., who }                     whose view this is, when it isn't the host's (a sub)
 *   { t: 'views', [sub]: view }                 every artist's view, to a watcher who asked
 *
 * There are no edit numbers for watchers: the channel keeps changes in order, and a watcher ignores
 * 'cells' until its first snapshot.
 *
 * Drawing together. Artists send their changes to the host's browser, which numbers every change in one
 * sequence and sends it back to all of them (to the artist who made it too: that is how they learn its
 * number). A change is { stroke, cells: [[key, entry|null]], runs: [[x, y, length, rgba]] } (changes.js);
 * a stroke is one gesture's id. A message is MOST_ARTIST_BYTES at most, so senders split a change at
 * MOST_CHANGE_BYTES, leaving room for the rest of the message.
 *
 * Artist to host:
 *   { t: 'change', stroke, cells, runs }        paint, type, or any edit to the edit layer
 *   { t: 'undo', stroke } / { t: 'redo', stroke }   the whole stroke, the artist's own
 *   { t: 'cursor', at, view, inside }           where the artist's pointer is, the part of the art in view, and the art layer they're in
 *   { t: 'artist-hello', has, epoch }           first thing on a connection: the last number held in that epoch
 *                                               (-1: none, send the project; also what a check that
 *                                               didn't match asks)
 *   { t: 'accept' } / { t: 'decline' }          the answer to an 'invite'
 *   { t: 'hand-over-ok' }                       the 'hand-over' is in, and this artist is ready to be named host
 *   { t: 'catch-up-start', n, epoch, kind, chunks }
 *                                               the answer to 'catch-up', then `chunks` binary messages: kind
 *                                               'tail' is packValue's changes after `has`, and kind 'project' is
 *                                               packProject's agreed document as of n
 * Host to artist:
 *   { t: 'numbered', n, by, stroke, cells, runs }   a change, by the sub who made it
 *   { t: 'settings', n, values }                the document's saved settings, changed
 *   { t: 'font', font }                         the font the art is in (fontOnWire), at hello and when it changes
 *   { t: 'base', n, runs, records }             the base layer's own pixels, and its pinned characters
 *   { t: 'project-failed' }                     the host couldn't pack the project this artist was owed
 *   { t: 'project-start', n, epoch, bytes, chunks, took }
 *                                               then `chunks` binary messages: packProject's chunks, the
 *                                               whole document as of n, and the epoch it's in (a new one only
 *                                               when the document was replaced). `took` is how many of this
 *                                               artist's changes on this connection the host has handled up
 *                                               to n, refused ones too
 *   { t: 'check', n, sum }                      the edit layer's sum as of n, to compare
 *   { t: 'cursors', [sub]: { at, view, name, inside } } where everyone is
 *   { t: 'invite' } / { t: 'withdrawn' }        asked to draw; the ask is gone
 *   { t: 'artists', subs, names }               who may draw now, and the names of those of them who are here ({ sub: name })
 *   { t: 'hand-over', chunks, room }            then `chunks` binary messages: packValue's ledger (keptForWire), for
 *                                               the artist the host wants to be next. It means nothing until
 *                                               the server says new-host. room: { name, welcome }
 *   { t: 'catch-up', has, epoch }               a host back from a reload, behind this artist: what's after has
 *   { t: 'undo-reset' }                         the host's stacks started over: everyone's undo goes with them
 *   { t: 'undo-refused', stroke } / { t: 'redo-refused', stroke }
 *                                               the host can't do that undo or redo, and no number is coming for it
 * Pausing and resuming are the 'away' message and the channel closing.
 */
import { hex2rgb } from '../lib/ColorUtils.js';
import { DISPLAY_FONTS, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../lib/displayFonts.js';
import { MAX_COLS, MAX_LINES, MAX_CELLS } from '../lib/Cells.js';
import { usableChar } from '../lib/CharWidth.js';
import { clampAnsiZoom } from '../lib/zoom.js';
import { writeProject, readProject } from '../document/projectIO.js';
import { isGoodShapeKey, isShapeKey, sameShape, shapeFromStranger } from '../document/shapes.js';

export const CHUNK_BYTES = 65536;
// An artist's message (and the host's numbered one) is a message like any other.
export const MOST_ARTIST_BYTES = CHUNK_BYTES;
export const MOST_CHANGE_BYTES = CHUNK_BYTES - 512;   // what a change may be, with the rest of its message around it
// The most a project may be unzipped, for an artist that doesn't trust its host.
export const MOST_PROJECT_BYTES = 256 * 1024 * 1024;
// The most a snapshot may be, for a watcher that doesn't trust its host. The biggest document at its
// worst (500,000 cells, every color different, wide characters) is 20 MB of JSON, 4.5 MB gzipped.
export const MOST_SNAPSHOT_BYTES = 32 * 1024 * 1024;   // unzipped
export const MOST_SNAPSHOT_CHUNKS = (16 * 1024 * 1024) / CHUNK_BYTES;   // zipped: 256
export const BACKED_UP_BYTES = 8 * 1024 * 1024;   // a channel further behind than this waits: the host's art until it drains, an answer to catch-up
export const MOST_NAME = 60;   // a room's or a person's, as a stranger sends it

export const isWhole = (n) => Number.isInteger(n) && n >= 0;

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

// A Blob gzipped, cut into pieces of CHUNK_BYTES or less.
async function gzipChunks(blob) {
  const bytes = new Uint8Array(await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  const chunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK_BYTES) chunks.push(bytes.subarray(i, i + CHUNK_BYTES));
  return chunks;
}

// What chunks unzip to, as a Blob. It throws for anything packed chunks wouldn't be: missing or repeated or not
// bytes (the gzip's own check catches those), or more than mostBytes unzipped (it stops reading there).
async function unzipped(chunks, mostBytes) {
  if (!Array.isArray(chunks) || !chunks.length || !chunks.every((c) => c instanceof Uint8Array)) throw new Error('Not chunks');
  const reader = new Blob(chunks).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.length;
    if (size > mostBytes) {
      reader.cancel();
      throw new Error('Unzipped too big');
    }
    parts.push(read.value);
  }
  return new Blob(parts);
}

// The whole document, as chunks.
export async function packSnapshot({ cols, lines, font, cells }) {
  return gzipChunks(new Blob([JSON.stringify({ cols, lines, font, ...encodeCells(cells) })]));
}

// A grid the app could have made: within its limits, and the cells to fill it.
const fits = (cols, lines, cells) => Number.isInteger(cols) && Number.isInteger(lines) && cols >= 1 && lines >= 1
  && cols <= MAX_COLS && lines <= MAX_LINES && cols * lines <= MAX_CELLS && Array.isArray(cells) && cells.length === cols * lines;

// The document again. Throws for anything a host's packSnapshot wouldn't make: unzipped past
// MOST_SNAPSHOT_BYTES (it stops reading there), or a grid that doesn't fit, before any cell is made.
export async function unpackSnapshot(chunks) {
  const { cols, lines, font, colors, cells } = JSON.parse(await (await unzipped(chunks, MOST_SNAPSHOT_BYTES)).text());
  if (!fits(cols, lines, cells)) throw new Error('Snapshot doesn\'t fit the grid');
  return { cols, lines, font, cells: decodeCells({ colors, cells }) };
}

const MOST_STROKE = 40;
export const isStroke = (stroke) => typeof stroke === 'string' && !!stroke && stroke.length <= MOST_STROKE;

// 'col,row' as two whole numbers, one pass over its characters, or null when the key isn't what cellKey
// makes: two runs of digits around a comma, neither with a leading zero (01,0 would be stored but never
// shown, and clearing 1,0 would never clear it). (A regex would make a match array a position.)
function placeOf(key) {
  let col = 0, row = -1, digits = 0, zero = false;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i) - 48;
    if (c >= 0 && c <= 9) {
      if (digits === 1 && zero) return null;
      if (digits === 0) zero = c === 0;
      if (++digits > 7) return null;
      if (row < 0) col = col * 10 + c; else row = row * 10 + c;
    } else if (c === -4 && row < 0 && digits) {   // the comma
      row = 0;
      digits = 0;
    } else return null;
  }
  return row >= 0 && digits ? [col, row] : null;
}

// An entry as Watch's cells are held to: only char, fg and bg, a char a cell can hold, colors that are hexes.
function goodEntry(entry) {
  if (typeof entry !== 'object' || Array.isArray(entry)) return false;
  let any = false;
  for (const name in entry) {
    const value = entry[name];
    if (value === undefined) continue;
    if (name === 'char' ? !usableChar(value) : !(name === 'fg' || name === 'bg') || typeof value !== 'string' || !HEX.test(value)) return false;
    any = true;
  }
  return any;
}

// The change in an artist's message, or null (nothing thrown) when anything in it isn't one the app
// could have made on a grid of cols x rows cells over a paint layer layerWidth x layerHeight: a cell off
// the grid, one that can't be drawn, a shape that isn't one, a run off the layer, a stroke id that isn't short text. The same
// arrays come back, so what's sent on as numbered is what was sent.
export function readChange(msg, { cols, rows, layerWidth, layerHeight }) {
  if (!msg || typeof msg !== 'object') return null;
  const { stroke, cells, runs } = msg;
  if (!isStroke(stroke) || !Array.isArray(cells) || !Array.isArray(runs)) return null;
  for (const cell of cells) {
    if (!Array.isArray(cell) || cell.length !== 2 || typeof cell[0] !== 'string') return null;
    if (isShapeKey(cell[0])) { // a shape (or null, its deletion), exactly as the app makes one
      if (!isGoodShapeKey(cell[0])) return null;
      if (cell[1] !== null && (cell[1]?.layer !== undefined || !sameShape(shapeFromStranger(cell[1]), cell[1]))) return null; // a room has the one vector layer, which shapes don't name
      continue;
    }
    const at = placeOf(cell[0]);
    if (!at || at[0] >= cols || at[1] >= rows) return null;
    if (cell[1] !== null && !(cell[1] && goodEntry(cell[1]))) return null;
  }
  for (const run of runs) {
    if (!Array.isArray(run) || run.length !== 4) return null;
    const [x, y, length, rgba] = run;
    if (!isWhole(x) || !isWhole(y) || !Number.isInteger(length) || length < 1 || y >= layerHeight || x + length > layerWidth) return null;
    if (!Number.isInteger(rgba) || rgba < 0 || rgba > 0xffffffff) return null;
  }
  return { stroke, cells, runs };
}

// Whether these could be a document's cells or a ledger's on any grid the app allows: they may be past the one in use.
export const cellsFitAnyGrid = (cells) => !!readChange({ stroke: 'any', cells, runs: [] }, { cols: MAX_COLS, rows: MAX_LINES });

// The whole document, as chunks. The parts are projectParts()'
// (with the imageBuffer, as writeProject has it): the file's own form, so a project that opens from a
// file opens from this, and the blobs become the buffers openParts takes on the other side.
export async function packProject(parts) {
  return gzipChunks(await writeProject(parts));
}

// The parts openParts takes, or null for anything a host's packProject wouldn't make, or that's not a project.
export async function unpackProject(chunks, { mostBytes }) {
  try {
    return await readProject(await unzipped(chunks, mostBytes));
  } catch {
    return null;
  }
}

// Anything JSON can hold, gzipped and cut as a project is; undefined for what packValue wouldn't have made.
export async function packValue(value) {
  return gzipChunks(new Blob([JSON.stringify(value)]));
}

export async function unpackValue(chunks, { mostBytes }) {
  try {
    return JSON.parse(await (await unzipped(chunks, mostBytes)).text());
  } catch {
    return undefined;
  }
}

// Where someone is, for the screen: a cell or null (the pointer's off the art), the cells in their view or null,
// their name, and the art layer they're drawing in (a shape key), or null. Null for anything else: what a host relays
// is a stranger's, and this is drawn on the art. An inside that's no shape key is null: they're inside none.
const MOST_CURSORS = 64;
export function readCursor({ at = null, view = null, name, inside = null } = {}) {
  const goodAt = at === null || (isWhole(at?.col) && isWhole(at?.row));
  const goodView = view === null || ([view?.col, view?.row, view?.cols, view?.rows].every(isWhole) && (view.zoom === undefined || (typeof view.zoom === 'number' && view.zoom > 0)));
  if (!goodAt || !goodView || typeof name !== 'string' || !name || name.length > MOST_NAME) return null;
  return { at, view, name, inside: isGoodShapeKey(inside) ? inside : null };
}

// A view as the watcher draws it, or null for anything that isn't one: a stranger's numbers (a host's, or an
// artist's by way of the host) are whole cells, and a zoom that isn't one is the font's size.
export function readView(view) {
  if (!view || typeof view !== 'object' || ![view.col, view.row, view.cols, view.rows].every(isWhole)) return null;
  const { col, row, cols, rows, zoom } = view;
  return { col, row, cols, rows, zoom: typeof zoom === 'number' && zoom > 0 ? clampAnsiZoom(zoom) : 1 };
}

// A host's cursors message: those that are cursors, by sub.
export function readCursors(all) {
  const read = Object.entries(all ?? {}).slice(0, MOST_CURSORS).map(([sub, cursor]) => [sub, cursor && typeof cursor === 'object' ? readCursor(cursor) : null]);
  return Object.fromEntries(read.filter(([, cursor]) => cursor));
}

// A host's views message: those that are views, by sub (a sub is short text).
const MOST_SUB = 64;
export const isSub = (sub) => typeof sub === 'string' && sub.length > 0 && sub.length <= MOST_SUB;
export function readViews(all) {
  const read = Object.entries(all ?? {}).filter(([sub]) => sub !== 't').slice(0, MOST_CURSORS).map(([sub, view]) => [sub, isSub(sub) ? readView(view) : null]);
  return Object.fromEntries(read.filter(([, view]) => view));
}

// The names in an artists message, for those it lists: those that are names, by sub.
export function readNames(names, subs) {
  if (!names || typeof names !== 'object' || Array.isArray(names)) return {};
  return Object.fromEntries(subs.filter((sub) => typeof names[sub] === 'string' && names[sub] && names[sub].length <= MOST_NAME).map((sub) => [sub, names[sub]]));
}
