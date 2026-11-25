// A .pho that a terminal shows as its art when it's printed (`cat drawing.pho`), and is still the same PNG
// (docs/pho.md, In a terminal). Whatever a file holds goes to the terminal byte by byte, so the chunks are laid out for it:
//
//   signature, IHDR      unavoidable: a few bytes of noise
//   phCs                 moves back over that noise, erases it, and switches to the alternate screen
//   phPc                 the project, its bytes a terminal reacts to escaped (escapeBytes)
//   PLTE, IDAT           the picture, written on the alternate screen; IDAT's rows filtered until it says nothing harmful
//   phCa                 back to the screen, modes undone, the art drawn, then an OSC opened that swallows the rest
//   IEND, ESC \          the OSC closed: two bytes after IEND, which PNG readers leave alone
//
// When it can't come out clean (a picture too big to search, or a palette that happens to spell an escape), Save writes
// the plain form instead (withProject), and the file is what it was before this.
import { chunk } from '../lib/PngFile.js';

export const START_CHUNK = 'phCs', PROJECT_CHUNK = 'phPc', ART_CHUNK = 'phCa';
const E = '\x1b', SIGNATURE_AND_IHDR = 33;
const ascii = (text) => Uint8Array.from(text, (c) => c.charCodeAt(0));
const typeOf = (bytes, at) => String.fromCharCode(...bytes.subarray(at + 4, at + 8));

// Where the first sequence at or after `from` starts that a terminal would act on beyond the alternate screen, or -1: a
// reset (ESC c), an identify (ESC Z, which a terminal answers by typing into the prompt), and a CSI that answers (c, n, x,
// t) or prints (i). A terminal carries on with an escape past control bytes and anything not ASCII, so this skips those
// as it does, and UTF-8's C1 CSI (C2 9B) counts as ESC [.
export function harmfulAt(bytes, from = 0) {
  let at;
  const skip = () => {
    while (at < bytes.length && (bytes[at] < 0x20 || bytes[at] > 0x7e) && bytes[at] !== 0x18 && bytes[at] !== 0x1a && bytes[at] !== 0x1b) at++;
  };
  for (let i = from; i < bytes.length; i++) {
    const c1 = bytes[i] === 0xc2 && bytes[i + 1] === 0x9b;
    if (bytes[i] !== 0x1b && !c1) continue;
    at = i + (c1 ? 2 : 1);
    if (!c1) {
      for (skip(); bytes[at] >= 0x20 && bytes[at] <= 0x2f; at++, skip());
      if (bytes[at] === 0x63 || bytes[at] === 0x5a) return i;
      if (bytes[at] !== 0x5b) continue;
      at++;
    }
    for (skip(); bytes[at] >= 0x20 && bytes[at] <= 0x3f; at++, skip());
    if (at < bytes.length && 'cnxti'.includes(String.fromCharCode(bytes[at]))) return i;
  }
  return -1;
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
// every terminal knows: an escape one doesn't is printed), the screen below erased (a reset in the binary would have
// left the cursor at the top), the art, then an OSC with a number no terminal uses, to swallow the last CRC and IEND.
// Its CRC can't hold a byte that would end the OSC early, so NULs (which a terminal ignores) pad it until it doesn't.
const RESETS = `${E}[?1049l${E}[!p${E}[0m${E}(B${E})B\x0f${E}[?7h${E}[?25h${E}[?1l${E}>${E}[?1000l${E}[?1002l${E}[?1003l${E}[?1004l${E}[?1006l${E}[?1015l${E}[?5l${E}[20l${E}[J`;
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

// The most sequences a picture may hold to be searched for a clean one (each takes a search of about log2(rows) tries),
// and the most picture bytes deflated in all (each try deflates the whole picture again). Past either Save writes the
// plain form.
// ponytail: deflating the picture in flushed pieces would let a piece be tried alone, when a deflate with flushes is
// worth having.
const MOST_FOUND = 12, MOST_DEFLATED = 64 * 1024 * 1024;

// png (as cellsPng writes it: IHDR, PLTE or not, one IDAT, IEND), the project's bytes and the art (UTF-8 ANSI, or an async
// function giving it, called only when the picture can be searched) as a .pho a terminal shows, or null when it can't
// be made clean.
export async function terminalPho(png, project, art) {
  const chunks = chunksOf(png), ihdr = chunks[0][1];
  let pixels = chunks.find(([type]) => type === 'IDAT')[1];
  if (harmful(pixels) > MOST_FOUND) return null;
  const head = png.subarray(0, SIGNATURE_AND_IHDR), start = startChunk(png);
  const before = joined([head, start, chunk(PROJECT_CHUNK, escapeBytes(project)), ...chunks.filter(([type]) => !['IHDR', 'IDAT', 'IEND'].includes(type)).map(([type, data]) => chunk(type, data))]);
  if (harmfulAt(before) >= 0) return null;
  const after = joined([artChunk(typeof art === 'function' ? await art() : art), chunk('IEND', new Uint8Array(0)), CLOSE]);
  if (harmfulAt(after) >= 0) return null;
  // before is clean alone, so only its last escape can still be open where the picture starts: the search reads from
  // there, and the whole file is put together once, at the end.
  let open = before.length;
  while (open > 0 && before[open - 1] !== 0x1b && before[open - 1] !== 0xc2) open--;
  const tail = open ? before.subarray(open - 1) : new Uint8Array(0), pixelsAt = tail.length + 8;
  const foundIn = (data) => harmfulAt(joined([tail, chunk('IDAT', data), after]));

  // The same picture, other bytes: a row filtered (None, Sub or Up, as a PNG reader undoes them) changes the deflate from
  // where that row's block starts, and nothing before it. So each sequence, first to last, is gone by filtering the
  // latest row whose change reaches back to it, found by halving, and kept when nothing new comes before it.
  const view = new DataView(ihdr.buffer, ihdr.byteOffset, ihdr.length), height = view.getUint32(4);
  const bits = ihdr[8] * { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr[9]], stride = Math.ceil((view.getUint32(0) * bits) / 8), step = Math.max(1, bits / 8);
  let found = foundIn(pixels);
  const raw = found < 0 ? null : await through(pixels, new DecompressionStream('deflate')), rows = raw?.slice(); // cellsPng's rows are all None
  const filter = (y, type) => {
    const at = y * (stride + 1);
    rows[at] = type;
    for (let x = 0; x < stride; x++) {
      const near = type === 1 ? (x >= step ? raw[at + 1 + x - step] : 0) : type === 2 && y ? raw[at - stride + x] : 0;
      rows[at + 1 + x] = raw[at + 1 + x] - near;
    }
  };
  const differsAt = (a, b) => {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i++;
    return i;
  };
  let deflated = 0;
  const more = () => deflated + (raw?.length ?? 0) <= MOST_DEFLATED;
  // Filtered so, does the picture lose the sequence at `found` with none before it? 'kept', 'reached' (it changed from
  // before the sequence, but another came before), or 'past' (it changed only after).
  const attempt = async (y, type) => {
    const was = rows[y * (stride + 1)];
    filter(y, type);
    deflated += raw.length;
    const next = await through(rows, new CompressionStream('deflate')), nextFound = foundIn(next);
    if (nextFound < 0 || nextFound > found) {
      pixels = next, found = nextFound;
      return 'kept';
    }
    filter(y, was);
    return differsAt(next, pixels) <= found - pixelsAt ? 'reached' : 'past';
  };
  while (found >= 0 && more()) {
    let lo = 0, hi = height - 1, kept = false;
    while (lo < hi && !kept && more()) {
      const mid = Math.ceil((lo + hi) / 2), result = await attempt(mid, (rows[mid * (stride + 1)] + 1) % 3);
      if (result === 'kept') kept = true;
      else if (result === 'reached') lo = mid;
      else hi = mid - 1;
    }
    // The latest row that reaches it, then the rows before, each with the other filters.
    for (let y = lo; !kept && y >= Math.max(0, lo - 8) && more(); y--) {
      for (const type of [1, 2, 0]) if (!kept && type !== rows[y * (stride + 1)] && more()) kept = (await attempt(y, type)) === 'kept';
    }
    if (!kept) return null;
  }
  return found < 0 ? joined([before, chunk('IDAT', pixels), after]) : null;
}

const joined = (parts) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  parts.reduce((at, part) => (out.set(part, at), at + part.length), 0);
  return out;
};
