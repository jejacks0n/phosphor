// GIF export: gifBytes writes the file (LZW included, looping forever) and gifFrames draws cells as the ANSI view
// does, offscreen (drawnCells, which the PNG export uses too), onto one palette, so colors don't shimmer from frame
// to frame.
import CellCanvas from './CellCanvas.js';
import { ctx2d } from './Canvas.js';
import quantize from './Quantizer.js';

export const MAX_GIF_PIXELS = 500_000_000; // across frames: an index a pixel is held until the file's written, and it runs at about 20M pixels a second
export const gifDelay = (ms) => Math.max(2, Math.round(ms / 10)); // hundredths of a second; browsers slow anything shorter

const MAX_CODE = 4096;
const table = new Int16Array(1 << 20); // (code << 8 | index) to the code that says it, -1 when none

// The indexes as GIF's LZW: codes from minCode + 1 bits up to 12, least significant bit first, in blocks of up
// to 255 bytes.
function lzw(indexes, minCode, push) {
  const clear = 1 << minCode, end = clear + 1;
  let size = minCode + 1, next = end + 1, bits = 0, held = 0, block = [];
  const emit = (code) => {
    bits |= code << held;
    held += size;
    while (held >= 8) {
      block.push(bits & 255);
      bits >>>= 8;
      held -= 8;
      if (block.length === 255) {
        push(255, ...block);
        block = [];
      }
    }
  };
  const restart = () => {
    table.fill(-1);
    size = minCode + 1;
    next = end + 1;
  };
  push(minCode);
  table.fill(-1);
  emit(clear);
  let code = indexes[0];
  for (let i = 1; i < indexes.length; i++) {
    const index = indexes[i], key = (code << 8) | index, known = table[key];
    if (known !== -1) {
      code = known;
      continue;
    }
    emit(code);
    if (next === MAX_CODE) {
      emit(clear);
      restart();
    } else {
      if (next >= (1 << size)) size++;
      table[key] = next++;
    }
    code = index;
  }
  emit(code);
  emit(end);
  if (held) block.push(bits & 255);
  if (block.length) push(block.length, ...block);
  push(0);
}

// frames: { pixels: an index a pixel (Uint8Array), palette: { r, g, b }[], delayCs }[].
export function gifBytes(width, height, frames) {
  let bytes = new Uint8Array(1 << 20), length = 0;
  const reserve = (more) => {
    if (length + more <= bytes.length) return;
    const grown = new Uint8Array(Math.max(bytes.length * 2, length + more));
    grown.set(bytes.subarray(0, length));
    bytes = grown;
  };
  const push = (...values) => {
    reserve(values.length);
    bytes.set(values, length);
    length += values.length;
  };
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  const text = (s) => Array.from(s, (c) => c.charCodeAt(0));

  push(...text('GIF89a'), ...u16(width), ...u16(height), 0, 0, 0); // no global palette: each frame has its own
  push(0x21, 0xff, 11, ...text('NETSCAPE2.0'), 3, 1, 0, 0, 0); // loops forever
  for (const { pixels, palette, delayCs } of frames) {
    const bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))));
    push(0x21, 0xf9, 4, 1 << 2, ...u16(delayCs), 0, 0); // stays until the next, no transparent color
    push(0x2c, 0, 0, 0, 0, ...u16(width), ...u16(height), 0x80 | (bits - 1));
    const colors = new Uint8Array(3 << bits);
    palette.forEach(({ r, g, b }, i) => colors.set([r, g, b], 3 * i));
    reserve(colors.length);
    bytes.set(colors, length);
    length += colors.length;
    lzw(pixels, Math.max(2, bits), push);
  }
  push(0x3b);
  return bytes.slice(0, length);
}

// The nearest color of a palette, worked out once per color seen.
function indexer(palette) {
  const known = new Map();
  return (r, g, b) => {
    const key = (r << 16) | (g << 8) | b;
    let best = known.get(key);
    if (best !== undefined) return best;
    let bestDistance = Infinity;
    palette.forEach((c, i) => {
      const distance = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    known.set(key, best);
    return best;
  };
}

const SAMPLED_FRAMES = 12; // what the palette's picked from, evenly through the animation

// Cells drawn as the ANSI view draws them, offscreen at one pixel per font pixel: use gets { width, height, rgba },
// rgba(cells) a frame's pixels, while the view's there. Throws if there's no WebGL2 to draw with.
export async function drawnCells(cols, lines, { smooth } = {}, use) {
  const view = new CellCanvas(document.createElement('canvas'));
  try {
    if (smooth !== undefined) view.smooth = smooth;
    view.resize(cols, lines, 1);
    const { width, height } = view.canvas;
    const copy = document.createElement('canvas');
    copy.width = width;
    copy.height = height;
    const ctx = ctx2d(copy);
    // The drawing buffer's only there straight after the draw.
    const rgba = (cells) => {
      view.draw(cells, { cols, rows: lines });
      ctx.drawImage(view.canvas, 0, 0);
      return ctx.getImageData(0, 0, width, height).data;
    };
    return await use({ width, height, rgba });
  } finally {
    view.destroy();
  }
}

// frames: each frame's cells, delays its delayCs. { width, height, frames } for gifBytes. Throws if there's no
// WebGL2 to draw with.
export function gifFrames(frames, cols, lines, delays, { smooth, tooLarge } = {}) {
  return drawnCells(cols, lines, { smooth }, async ({ width, height, rgba }) => {
    tooLarge?.(width * height * frames.length);
    const step = Math.max(1, Math.floor(frames.length / SAMPLED_FRAMES));
    const sampled = [];
    for (let i = 0; i < frames.length; i += step) sampled.push(rgba(frames[i]));
    const all = new Uint8ClampedArray(sampled.reduce((sum, data) => sum + data.length, 0));
    sampled.reduce((at, data) => { all.set(data, at); return at + data.length; }, 0);
    const palette = quantize(all, 256);
    const index = indexer(palette);
    const out = [];
    for (let i = 0; i < frames.length; i++) {
      const data = rgba(frames[i]), pixels = new Uint8Array(width * height);
      for (let p = 0; p < pixels.length; p++) pixels[p] = index(data[4 * p], data[4 * p + 1], data[4 * p + 2]);
      out.push({ pixels, palette, delayCs: delays[i] });
      await new Promise((resolve) => setTimeout(resolve)); // the page stays alive
    }
    return { width, height, frames: out };
  });
}
