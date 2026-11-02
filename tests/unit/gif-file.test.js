import { test, expect } from 'vitest';
import { gifBytes, gifDelay } from '../../src/lib/GifFile.js';

// The file read back, as a decoder would: LZW included.
function readGif(bytes) {
  let at = 0;
  const u16 = () => { const n = bytes[at] | (bytes[at + 1] << 8); at += 2; return n; };
  const text = (n) => { const s = String.fromCharCode(...bytes.subarray(at, at + n)); at += n; return s; };
  const blocks = () => {
    const out = [];
    for (let n = bytes[at++]; n; n = bytes[at++]) { out.push(...bytes.subarray(at, at + n)); at += n; }
    return out;
  };
  const gif = { signature: text(6), width: u16(), height: u16(), loops: false, images: [] };
  const flags = bytes[at]; at += 3;
  expect(flags & 0x80).toBe(0);
  let delay = null;
  for (;;) {
    const kind = bytes[at++];
    if (kind === 0x3b) { gif.end = at; return gif; }
    if (kind === 0x21) {
      const label = bytes[at++];
      if (label === 0xff) {
        at++; // its block's length
        if (text(11) === 'NETSCAPE2.0') { const body = blocks(); gif.loops = body[0] === 1 && body[1] === 0 && body[2] === 0; }
      } else if (label === 0xf9) {
        const body = blocks();
        delay = body[1] | (body[2] << 8);
      } else blocks();
    } else if (kind === 0x2c) {
      at += 4;
      const width = u16(), height = u16(), f = bytes[at++];
      const palette = 3 << ((f & 7) + 1);
      expect(f & 0x80).toBe(0x80);
      at += palette;
      const minCode = bytes[at++];
      gif.images.push({ width, height, delay, paletteSize: palette / 3, indexes: decodeLzw(blocks(), minCode) });
    } else throw new Error(`a block a GIF can't have: ${kind}`);
  }
}

function decodeLzw(data, minCode) {
  const clear = 1 << minCode, end = clear + 1, out = [];
  let size = minCode + 1, bits = 0, held = 0, table = [], previous = null, clears = 0;
  const reset = () => { table = Array.from({ length: end + 1 }, (_, i) => (i < clear ? [i] : [])); size = minCode + 1; previous = null; };
  reset();
  for (const byte of data) {
    bits |= byte << held;
    held += 8;
    while (held >= size) {
      const code = bits & ((1 << size) - 1);
      bits >>>= size;
      held -= size;
      if (code === clear) { reset(); clears++; continue; }
      if (code === end) { out.clears = clears; return out; }
      let entry;
      if (code < table.length) entry = table[code];
      else if (code === table.length && previous) entry = [...previous, previous[0]];
      else throw new Error(`code ${code} with ${table.length} known`);
      out.push(...entry);
      if (previous && table.length < 4096) table.push([...previous, entry[0]]);
      if (table.length === (1 << size) && size < 12) size++;
      previous = entry;
    }
  }
  throw new Error('no end code');
}

const palette = (n) => Array.from({ length: n }, (_, i) => ({ r: i, g: 0, b: 0 }));
// A repeatable mess, so the codes keep growing.
const noise = (length, range) => { let x = 1; return Uint8Array.from({ length }, () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return (x >> 16) % range; }); };

test('the header, screen size, looping block and one image per frame are right', () => {
  const frames = [{ pixels: new Uint8Array(6), palette: palette(2), delayCs: 12 }, { pixels: new Uint8Array(6).fill(1), palette: palette(2), delayCs: 50 }];
  const bytes = gifBytes(3, 2, frames), gif = readGif(bytes);
  expect(gif.signature).toBe('GIF89a');
  expect([gif.width, gif.height]).toEqual([3, 2]);
  expect(gif.loops).toBe(true);
  expect(gif.end).toBe(bytes.length);
  expect(gif.images.map((image) => [image.width, image.height])).toEqual([[3, 2], [3, 2]]);
  expect([...gif.images[0].indexes]).toEqual([0, 0, 0, 0, 0, 0]);
  expect([...gif.images[1].indexes]).toEqual([1, 1, 1, 1, 1, 1]);
});

test('LZW output decodes back to the same indexes, including across a code-size growth and a clear', () => {
  for (const [size, range] of [[1, 2], [4, 3], [3000, 4], [20000, 16], [120000, 256]]) {
    const pixels = noise(size, range);
    const gif = readGif(gifBytes(size, 1, [{ pixels, palette: palette(range), delayCs: 2 }]));
    const { indexes } = gif.images[0];
    expect(indexes.length).toBe(size);
    expect(indexes.every((v, i) => v === pixels[i])).toBe(true);
    if (size === 120000) expect(indexes.clears).toBeGreaterThan(1); // the opening one, and at least one when the table filled
  }
});

test('the palette table is a power of two, with a palette of any size', () => {
  for (const [n, want] of [[1, 2], [2, 2], [3, 4], [4, 4], [5, 8], [256, 256]]) {
    const gif = readGif(gifBytes(1, 1, [{ pixels: new Uint8Array(1), palette: palette(n), delayCs: 2 }]));
    expect(gif.images[0].paletteSize).toBe(want);
  }
});

test('delays come from fps and holds, in hundredths of a second', () => {
  expect(gifDelay(1000 / 8)).toBe(13);
  expect(gifDelay(500)).toBe(50);
  expect(gifDelay(1000 / 60)).toBe(2);
  expect(gifDelay(5)).toBe(2);
  const gif = readGif(gifBytes(1, 1, [{ pixels: new Uint8Array(1), palette: palette(2), delayCs: 13 }, { pixels: new Uint8Array(1), palette: palette(2), delayCs: 500 }]));
  expect(gif.images.map((image) => image.delay)).toEqual([13, 500]);
});
