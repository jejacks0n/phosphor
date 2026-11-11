// PNG export: an indexed PNG written here when the picture has 256 colors or fewer (1, 2, 4 or 8 bits a pixel, so
// a hard-edged drawing stays small), else the browser's own full-color one.
import { canvasPng, ctx2d } from './Canvas.js';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(Array.from(type, (c) => c.charCodeAt(0)), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// zlib format, as IDAT wants it.
const deflate = async (bytes) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());

// rgba (opaque, as a render is) as an indexed PNG's bytes, or null when it has more than 256 colors.
export async function indexedPng(width, height, rgba) {
  const palette = new Map(), indexes = new Uint8Array(width * height);
  for (let p = 0; p < indexes.length; p++) {
    const key = (rgba[4 * p] << 16) | (rgba[4 * p + 1] << 8) | rgba[4 * p + 2];
    let index = palette.get(key);
    if (index === undefined) {
      if (palette.size === 256) return null;
      palette.set(key, index = palette.size);
    }
    indexes[p] = index;
  }
  const depth = [1, 2, 4, 8].find((bits) => palette.size <= 1 << bits);
  const stride = Math.ceil((width * depth) / 8) + 1; // a filter byte (0, none) first
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = x * depth;
      raw[y * stride + 1 + (bit >> 3)] |= indexes[y * width + x] << (8 - depth - (bit & 7));
    }
  }
  const head = new Uint8Array(13), view = new DataView(head.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  head.set([depth, 3, 0, 0, 0], 8); // indexed color, deflate, filter set 0, no interlace
  const colors = new Uint8Array(3 * palette.size);
  for (const [key, i] of palette) colors.set([key >> 16, (key >> 8) & 255, key & 255], 3 * i);
  const parts = [chunk('IHDR', head), chunk('PLTE', colors), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
  return new Uint8Array(await new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...parts]).arrayBuffer());
}

// rgba as a PNG file: indexed when it can be.
export async function pngBlob(width, height, rgba) {
  const indexed = await indexedPng(width, height, rgba);
  if (indexed) return new Blob([indexed], { type: 'image/png' });
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  ctx2d(canvas).putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  return canvasPng(canvas);
}
