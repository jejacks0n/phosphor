// A .pho that a terminal shows as its art when it's printed (`cat drawing.pho`), and is still the same PNG
// (docs/pho.md, In a terminal). Whatever a file holds goes to the terminal byte by byte, so the chunks are laid out for it:
//
//   signature, IHDR      unavoidable: a few bytes of noise
//   phCs                 moves back over that noise, erases it, and switches to the alternate screen
//   phPc                 the project, its bytes a terminal reacts to escaped (escapeBytes)
//   PLTE, IDAT           the picture, written on the alternate screen; when the browser's deflate of it says something
//                        harmful, written again with our own (FixedDeflater), rows filtered until it says nothing
//   phCa                 back to the screen, modes undone, the art drawn, then an OSC opened that swallows the rest
//   IEND, ESC \          the OSC closed: two bytes after IEND, which PNG readers leave alone
//
// When it can't come out clean (a palette that happens to spell an escape, say), Save writes the plain form instead
// (withProject), and the file is what it was before this.
import { chunk } from '../lib/PngFile.js';
import { FixedDeflater } from '../lib/Deflate.js';

export const START_CHUNK = 'phCs', PROJECT_CHUNK = 'phPc', ART_CHUNK = 'phCa';
const E = '\x1b', SIGNATURE_AND_IHDR = 33;
const ascii = (text) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const typeOf = (bytes, at) => String.fromCharCode(...bytes.subarray(at + 4, at + 8));

// Where the first sequence at or after `from` starts that a terminal would act on beyond the alternate screen, or -1:
// a reset (ESC c), an identify (ESC Z, which a terminal answers by typing into the prompt), any CSI but those that draw
// on the alternate screen or that RESETS puts back, an OSC with a number (a title, a notification, a color asked or
// set, the clipboard) other than ours, a DCS ending p or q (a question, tmux) and an APC starting G (a kitty picture).
// It's read two ways, and acts if either does: as a terminal that skips bytes 0x80 to 0x9F inside an escape as it does
// other bytes not ASCII, and as Ghostty, which reads them there as C1 controls (0x9A as ESC Z, 0x9B starting a CSI).
// Either way control bytes are skipped (a terminal runs them and carries on), CAN, SUB and ESC end an escape, and
// UTF-8's C1 CSI (C2 9B) counts as ESC [.
export function harmfulAt(bytes, from = 0) {
  for (let i = from; i < bytes.length; i++) {
    const at = bytes[i] === 0x1b ? i + 1 : bytes[i] === 0xc2 && bytes[i + 1] === 0x9b ? i + 2 : -1;
    if (at < 0) continue;
    const state = bytes[i] === 0x1b ? 'escape' : 'csi';
    if (acts(bytes, at, state, false) || acts(bytes, at, state, true)) return i;
  }
  return -1;
}

// What Ghostty starts at each C1 control inside an escape (0x9A is ESC Z); the others end it.
const C1 = { 0x9a: 'Z', 0x9b: 'csi', 0x90: 'dcs', 0x9d: 'osc', 0x98: 'string', 0x9e: 'string', 0x9f: 'apc' };
function acts(bytes, at, state, c1) {
  let held = '';
  for (; at < bytes.length; at++) {
    const b = bytes[at];
    if (b === 0x18 || b === 0x1a || b === 0x1b) return false;
    if (c1 && b >= 0x80 && b <= 0x9f) {
      const next = C1[b];
      if (next === 'Z') return true;
      if (!next) return false;
      if (next === 'osc') return oscActs(bytes, at + 1);
      [state, held] = [next, ''];
      continue;
    }
    if (b < 0x20 || b > 0x7e || state === 'string') continue;
    const c = String.fromCharCode(b);
    if (state === 'apc') {
      if (c === 'G') return true;
      state = 'string';
    } else if (state === 'escape') {
      if (b <= 0x2f) held += c;
      else if (held) return false; // a character set chosen, say
      else if (c === '[') state = 'csi';
      else if (c === ']') return oscActs(bytes, at + 1);
      else if (c === 'P') state = 'dcs';
      else if (c === '_') state = 'apc';
      else if (c === 'X' || c === '^') state = 'string';
      else return c === 'c' || c === 'Z';
    } else if (b <= 0x3f) held += c;
    else return state === 'csi' ? csiActs(held, c) : c === 'p' || c === 'q';
  }
  return false;
}

// The CSIs let through: those with no marker or intermediate that move the cursor, edit, erase, scroll, set colors,
// margins or tab stops (which RESETS puts back), the soft reset, an erase with ?, and the modes RESETS sets back.
const DRAWS = '@ABCDEFGHIJKLMPSTXZ`abdefgmrsu', MODES = new Set(['?1', '?5', '?7', '?25', '?1000', '?1002', '?1003', '?1004', '?1006', '?1015', '?1049', '20']);
function csiActs(held, final) {
  if (held === '!' && final === 'p') return false;
  if (/[ -/]/.test(held)) return true;
  const marker = /^[<=>?]/.test(held) ? held[0] : '';
  if (/[<=>?]/.test(held.slice(marker.length))) return true;
  if (final === 'h' || final === 'l') return !held.slice(marker.length).split(/[;:]/).every((mode) => MODES.has(marker + mode));
  return marker ? !(marker === '?' && (final === 'J' || final === 'K')) : !DRAWS.includes(final);
}

// An OSC acts unless its payload doesn't start with a number, or is ours (artChunk's).
function oscActs(bytes, at) {
  let text = '';
  for (; at < bytes.length && text.length < 5; at++) {
    const b = bytes[at];
    if (b === 0x07 || b === 0x18 || b === 0x1a || b === 0x1b) break;
    if (b >= 0x20) text += String.fromCharCode(b);
  }
  return /^\d/.test(text) && text !== '4242;';
}

// How many such sequences the bytes hold.
export function harmful(bytes) {
  let count = 0;
  for (let at = harmfulAt(bytes); at >= 0; at = harmfulAt(bytes, at + 1)) count++;
  return count;
}

// The project with every byte a terminal reacts to written as MARK and the byte xor 0x40: ENQ (answered), BEL, CAN, SUB,
// ESC, 0xC2 (a C1 control in UTF-8), and MARK itself. About one byte in forty grows to two.
const MARK = 0xfe, ESCAPED = new Uint8Array(256);
for (const byte of [0x05, 0x07, 0x18, 0x1a, 0x1b, 0xc2, MARK]) ESCAPED[byte] = 1;
export function escapeBytes(bytes) {
  let extra = 0;
  for (const byte of bytes) extra += ESCAPED[byte];
  const out = new Uint8Array(bytes.length + extra);
  for (let i = 0, o = 0; i < bytes.length; i++) {
    if (ESCAPED[bytes[i]]) { out[o++] = MARK; out[o++] = bytes[i] ^ 0x40; } else out[o++] = bytes[i];
  }
  return out;
}

// Null for bytes no escapeBytes wrote: one ending in a MARK, or a MARK before a byte it doesn't escape.
export function unescapeBytes(bytes) {
  let marks = 0;
  for (const byte of bytes) if (byte === MARK) marks++;
  const out = new Uint8Array(bytes.length - marks);
  for (let i = 0, o = 0; i < bytes.length; i++) {
    if (bytes[i] !== MARK) { out[o++] = bytes[i]; continue; }
    if (++i === bytes.length || !ESCAPED[bytes[i] ^ 0x40]) return null;
    out[o++] = bytes[i] ^ 0x40;
  }
  return out;
}

// A PNG's chunks, as [type, data].
const chunksOf = (png) => {
  const view = new DataView(png.buffer, png.byteOffset, png.length), out = [];
  for (let at = 8; at + 12 <= png.length; at += 12 + view.getUint32(at)) out.push([typeOf(png, at), png.subarray(at + 8, at + 8 + view.getUint32(at))]);
  return out;
};
const through = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

// The first chunk: back up over what the terminal printed of the signature, IHDR and this chunk's own length and type
// (its line feeds counted, so the count is right whatever the header's bytes), erase it, and go to the alternate screen,
// where nothing reaches the scrollback.
function startChunk(png) {
  let start = new Uint8Array(0), lines = -1;
  for (let seen = 0; seen !== lines;) {
    lines = seen;
    start = chunk(START_CHUNK, ascii(`\r${lines ? `${E}[${lines}A` : ''}${E}[J${E}[?1049h`));
    const head = [...png.subarray(0, SIGNATURE_AND_IHDR), ...start.subarray(0, 8)];
    seen = head.filter((byte) => byte >= 0x0a && byte <= 0x0c).length; // LF, VT and FF each go down a line
  }
  return start;
}

// Back on the screen, the cursor where the alternate screen left it: what the binary may have set put back (only what
// every terminal knows: an escape one doesn't is printed), the tab stops every 8 columns again, the screen below erased (a reset in the binary would have
// left the cursor at the top), the art, then an OSC with a number no terminal uses, to swallow the last CRC and IEND.
// Its CRC can't hold a byte that would end the OSC early, so NULs (which a terminal ignores) pad it until it doesn't.
const RESETS = `${E}[?1049l${E}[!p${E}[0m${E}(B${E})B\x0f${E}[?7h${E}[?25h${E}[?1l${E}>${E}[?1000l${E}[?1002l${E}[?1003l${E}[?1004l${E}[?1006l${E}[?1015l${E}[?5l${E}[20l\r${E}[3g${`${E}[8C${E}H`.repeat(63)}\r${E}[J`;
const OPEN = `${E}[0m${E}]4242;`, CLOSE = ascii(`${E}\\`);
function artChunk(art) {
  for (let pad = 0; ; pad++) {
    const data = new Uint8Array(RESETS.length + pad + art.length + OPEN.length);
    data.set(ascii(RESETS));
    data.set(art, RESETS.length + pad);
    data.set(ascii(OPEN), RESETS.length + pad + art.length);
    const out = chunk(ART_CHUNK, data);
    if (!out.subarray(-4).some((byte) => byte === 0x07 || byte === 0x18 || byte === 0x1a || byte === 0x1b)) return out;
  }
}

// png (as cellsPng writes it: IHDR, PLTE or not, one IDAT, IEND), the project's bytes and the art (UTF-8 ANSI, or an async
// function giving it, called only when it's needed) as a .pho a terminal shows, or null when it can't be made clean.
export async function terminalPho(png, project, art) {
  const chunks = chunksOf(png), ihdr = chunks[0][1], idat = chunks.find(([type]) => type === 'IDAT')[1];
  const head = png.subarray(0, SIGNATURE_AND_IHDR), start = startChunk(png);
  const before = joined([head, start, chunk(PROJECT_CHUNK, escapeBytes(project)), ...chunks.filter(([type]) => !['IHDR', 'IDAT', 'IEND'].includes(type)).map(([type, data]) => chunk(type, data))]);
  if (harmfulAt(before) >= 0) return null;
  const after = joined([artChunk(typeof art === 'function' ? await art() : art), chunk('IEND', new Uint8Array(0)), CLOSE]);
  if (harmfulAt(after) >= 0) return null;
  // before is clean alone, so only a sequence it leaves open can reach the picture: a file is read from where that starts.
  const open = openAt(before, 0, before.length), firstAt = (file) => harmfulAt(file, open);
  const fileWith = (pixels) => joined([before, chunk('IDAT', pixels), after]);
  const plain = fileWith(idat);
  if (firstAt(plain) < 0) return plain; // the browser's own deflate, smaller than ours, when it already is

  // The same picture, other bytes: written row by row with our own deflate, whose bytes before a row never change with
  // what's written after it. When a sequence turns up, the latest row whose bytes reach it is filtered another way (None,
  // Sub or Up, as a PNG reader undoes them) and written again from there; a row whose three are spent passes it back.
  const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.length), height = view.getUint32(4);
  const bits = ihdr[8] * { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr[9]], stride = Math.ceil((view.getUint32(0) * bits) / 8), step = Math.max(1, bits / 8);
  const raw = await through(idat, new DecompressionStream('deflate')), rows = raw.slice(); // cellsPng's rows are all None
  const filter = (y, type) => {
    const at = y * (stride + 1);
    rows[at] = type;
    for (let x = 0; x < stride; x++) {
      const near = type === 1 ? (x >= step ? raw[at + 1 + x - step] : 0) : type === 2 && y ? raw[at - stride + x] : 0;
      rows[at + 1 + x] = raw[at + 1 + x] - near;
    }
  };
  // The stream is read from where a sequence still open at a row's start could start (froms[y]), and the last row is
  // checked in the whole file, the stream's end and the CRCs after it among it.
  const deflater = new FixedDeflater(rows), marks = new Array(height), froms = new Array(height), tried = new Uint8Array(height);
  const idatAt = before.length + 8;
  let readFrom = 0, tries = 0;
  for (let y = 0; y < height;) {
    marks[y] = deflater.mark();
    froms[y] = readFrom;
    tried[y] |= 1 << rows[y * (stride + 1)];
    deflater.encode(y * (stride + 1), (y + 1) * (stride + 1));
    const written = deflater.written;
    let found = harmfulAt(written, readFrom);
    if (found < 0 && y === height - 1) {
      const end = deflater.mark(), file = fileWith(deflater.finish());
      deflater.rewind(end);
      const at = firstAt(file);
      if (at < 0) return file;
      found = Math.max(0, at - idatAt);
    }
    if (found < 0) {
      readFrom = openAt(written, readFrom, written.length);
      y++;
      continue;
    }
    let r = y;
    while (r > 0 && marks[r].length > found) r--;
    while (r >= 0 && tried[r] === 7) r--;
    if (r < 0 || ++tries > MOST_TRIES) return null;
    filter(r, [0, 1, 2].find((type) => !(tried[r] & (1 << type))));
    tried.fill(0, r + 1, y + 1);
    deflater.rewind(marks[r]);
    readFrom = froms[r];
    y = r;
  }
  return null;
}

// Where a sequence still open at `to` could start, looking back no further than `from`, where one last could: the last
// ESC (a C2 after it is inside it or after its end), else the first C2 (one after it is inside it), else `to`.
function openAt(bytes, from, to) {
  let c2 = to;
  for (let i = to - 1; i >= from; i--) {
    if (bytes[i] === 0x1b) return i;
    if (bytes[i] === 0xc2) c2 = i;
  }
  return c2;
}

// The most rows written again in all, past which Save writes the plain form: a picture whose rows can't come out clean.
const MOST_TRIES = 2000; // a 40 MB picture took 179

const joined = (parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((at, part) => (out.set(part, at), at + part.length), 0);
  return out;
};
