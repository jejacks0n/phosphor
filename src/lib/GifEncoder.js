// The GIF file itself, with no page to draw on, so the export's worker can run it: gifWriter writes frames as they
// come (LZW included, looping forever), indexer maps a pixel to the nearest color of the palette.

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

// frame(pixels: an index a pixel (Uint8Array), palette: { r, g, b }[], delayCs) adds one; finish() the file's bytes.
export function gifWriter(width, height) {
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
  return {
    frame(pixels, palette, delayCs) {
      const bits = Math.max(1, Math.ceil(Math.log2(Math.max(2, palette.length))));
      push(0x21, 0xf9, 4, 1 << 2, ...u16(delayCs), 0, 0); // stays until the next, no transparent color
      push(0x2c, 0, 0, 0, 0, ...u16(width), ...u16(height), 0x80 | (bits - 1));
      const colors = new Uint8Array(3 << bits);
      palette.forEach(({ r, g, b }, i) => colors.set([r, g, b], 3 * i));
      reserve(colors.length);
      bytes.set(colors, length);
      length += colors.length;
      lzw(pixels, Math.max(2, bits), push);
    },
    finish() {
      push(0x3b);
      return bytes.slice(0, length);
    },
  };
}

// frames: { pixels, palette, delayCs }[], all at once.
export function gifBytes(width, height, frames) {
  const writer = gifWriter(width, height);
  for (const { pixels, palette, delayCs } of frames) writer.frame(pixels, palette, delayCs);
  return writer.finish();
}

// An RGBA frame's pixels as indexes of the palette, the nearest color of it worked out once per color seen.
export function indexer(palette) {
  const known = new Map();
  const nearest = (r, g, b) => {
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
  return (rgba) => {
    const pixels = new Uint8Array(rgba.length / 4);
    for (let p = 0; p < pixels.length; p++) pixels[p] = nearest(rgba[4 * p], rgba[4 * p + 1], rgba[4 * p + 2]);
    return pixels;
  };
}
