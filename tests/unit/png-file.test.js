import { test, expect } from 'vitest';
import { inflateSync, crc32 } from 'node:zlib';
import { indexedPng } from '@/lib/PngFile.js';

// A PNG's chunks, each with its CRC checked against Node's.
function chunks(bytes) {
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer, bytes.byteOffset), out = [];
  for (let at = 8; at < bytes.length;) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const data = bytes.subarray(at + 8, at + 8 + length);
    expect(view.getUint32(at + 8 + length), `${type}'s CRC`).toBe(crc32(bytes.subarray(at + 4, at + 8 + length)));
    out.push({ type, data });
    at += 12 + length;
  }
  return out;
}

// What a reader would see: the size, bit depth, palette and each pixel's color.
function decode(bytes) {
  const parts = chunks(bytes);
  expect(parts.map(({ type }) => type)).toEqual(['IHDR', 'PLTE', 'IDAT', 'IEND']);
  const head = new DataView(parts[0].data.buffer, parts[0].data.byteOffset);
  const width = head.getUint32(0), height = head.getUint32(4), depth = parts[0].data[8];
  expect([...parts[0].data.subarray(9)]).toEqual([3, 0, 0, 0]); // indexed, deflate, filter set 0, no interlace
  const palette = [];
  for (let i = 0; i < parts[1].data.length; i += 3) palette.push([...parts[1].data.subarray(i, i + 3)]);
  const raw = inflateSync(parts[2].data), stride = Math.ceil((width * depth) / 8) + 1;
  expect(raw.length).toBe(stride * height);
  const pixels = [];
  for (let y = 0; y < height; y++) {
    expect(raw[y * stride]).toBe(0); // filter 0
    for (let x = 0; x < width; x++) {
      const bit = x * depth, byte = raw[y * stride + 1 + (bit >> 3)];
      pixels.push(palette[(byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1)]);
    }
  }
  return { width, height, depth, palette, pixels };
}

// width x height pixels of colors.length colors, pixel i colors[i % n], as RGBA.
function picture(width, height, colors) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) rgba.set([...colors[i % colors.length], 255], 4 * i);
  return rgba;
}
const grays = (n) => Array.from({ length: n }, (_, i) => [i, 255 - i, (i * 7) & 255]);

test.each([[2, 1], [3, 2], [16, 4], [17, 8], [256, 8]])('%i colors are written at %i bits, every pixel as it was', async (n, bits) => {
  const colors = grays(n), width = 37, height = 9; // rows that don't end on a byte
  const decoded = decode(await indexedPng(width, height, picture(width, height, colors)));
  expect([decoded.width, decoded.height, decoded.depth]).toEqual([width, height, bits]);
  expect(decoded.palette).toHaveLength(n);
  expect(new Set(decoded.palette.map(String)).size).toBe(n);
  decoded.pixels.forEach((color, i) => expect(color).toEqual(colors[i % n]));
});

test('one color is a 1-bit picture of it', async () => {
  const decoded = decode(await indexedPng(3, 2, picture(3, 2, [[10, 20, 30]])));
  expect(decoded.depth).toBe(1);
  expect(decoded.palette).toEqual([[10, 20, 30]]);
});

test('above 256 colors there is no indexed PNG, for the caller to write a full-color one', async () => {
  expect(await indexedPng(257, 1, picture(257, 1, grays(257)))).toBeNull();
});
