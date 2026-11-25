// A zlib stream written here rather than by the browser, for a .pho a terminal shows (src/document/phoTerminal.js): one
// deflate block with the fixed codes, so its bits come strictly in the order of the bytes they hold, and the writer can
// be marked and rewound to a mark. Bytes written before a mark never change, whatever is written after it. The
// browser's compressor (CompressionStream) picks its own code tables for big blocks, so a byte changed anywhere in one
// rewrites the whole block.
//
// data is read as it is when encode reaches it, so the caller may change bytes past a mark before rewinding to it.
// ponytail: fixed codes and no lazy matching; per-block code tables would make it smaller, at the cost of locality.

const WINDOW = 32768, MASK = WINDOW - 1, HASH = 1 << 15, MIN = 3, MAX = 258, CHAIN = 48, NICE = 128;
const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

const reversed = (code, bits) => {
  let out = 0;
  for (let i = 0; i < bits; i++) out = (out << 1) | ((code >> i) & 1);
  return out;
};
// The fixed code of each literal/length symbol (RFC 1951, 3.2.6), bit-reversed as the stream wants it.
const SYMBOL_CODE = new Uint16Array(288), SYMBOL_BITS = new Uint8Array(288);
for (let s = 0; s < 288; s++) {
  const [code, bits] = s < 144 ? [0x30 + s, 8] : s < 256 ? [0x190 + s - 144, 9] : s < 280 ? [s - 256, 7] : [0xc0 + s - 280, 8];
  SYMBOL_CODE[s] = reversed(code, bits);
  SYMBOL_BITS[s] = bits;
}
const LENGTH_CODE = new Uint8Array(MAX + 1), DIST_CODE = new Uint8Array(WINDOW + 1);
LENGTH_BASE.forEach((base, i) => { for (let n = base; n < (LENGTH_BASE[i + 1] ?? 259); n++) LENGTH_CODE[n] = i; });
LENGTH_CODE[MAX] = 28;
DIST_BASE.forEach((base, i) => { for (let n = base; n < (DIST_BASE[i + 1] ?? WINDOW + 1); n++) DIST_CODE[n] = i; });
const DIST_REVERSED = Array.from({ length: 30 }, (_, i) => reversed(i, 5));

export class FixedDeflater {
  constructor(data) {
    this.data = data;
    this.out = new Uint8Array(Math.max(1024, data.length >> 2));
    this.length = 0;
    this.bits = 0;
    this.count = 0;
    this.head = new Int32Array(HASH).fill(-1);
    this.prev = new Int32Array(WINDOW).fill(-1);
    this.#byte(0x78);
    this.#byte(0x01); // zlib, a 32 KB window, no dictionary
    this.#write(1, 1); // the last block
    this.#write(1, 2); // with the fixed codes
  }

  // The bytes written so far that later writing can't change (not the one being filled).
  get written() {
    return this.out.subarray(0, this.length);
  }

  mark() {
    return { length: this.length, bits: this.bits, count: this.count };
  }

  rewind({ length, bits, count }) {
    Object.assign(this, { length, bits, count });
  }

  // data[from, to) as literals and matches; a match never runs past `to`.
  encode(from, to) {
    const { data, head, prev } = this;
    for (let p = from; p < to;) {
      let best = 0, distance = 0;
      if (p + MIN <= to) {
        const h = ((data[p] << 10) ^ (data[p + 1] << 5) ^ data[p + 2]) & (HASH - 1), most = Math.min(MAX, to - p);
        // A chain can hold places a rewind left past p, or written over by the ring: those are skipped, and it ends
        // where it stops going back.
        for (let at = head[h], chain = CHAIN; at >= 0 && p - at <= WINDOW && chain-- > 0;) {
          if (at < p && data[at + best] === data[p + best]) {
            let n = 0;
            while (n < most && data[at + n] === data[p + n]) n++;
            if (n > best) {
              best = n, distance = p - at;
              if (n >= NICE || n === most) break;
            }
          }
          const next = prev[at & MASK];
          if (next >= at) break;
          at = next;
        }
        prev[p & MASK] = head[h];
        head[h] = p;
      }
      if (best >= MIN) {
        const code = LENGTH_CODE[best], symbol = 257 + code, d = DIST_CODE[distance];
        this.#write(SYMBOL_CODE[symbol], SYMBOL_BITS[symbol]);
        if (LENGTH_EXTRA[code]) this.#write(best - LENGTH_BASE[code], LENGTH_EXTRA[code]);
        this.#write(DIST_REVERSED[d], 5);
        if (DIST_EXTRA[d]) this.#write(distance - DIST_BASE[d], DIST_EXTRA[d]);
        for (let q = p + 1; q < p + best && q + MIN <= to; q++) {
          const h = ((data[q] << 10) ^ (data[q + 1] << 5) ^ data[q + 2]) & (HASH - 1);
          prev[q & MASK] = head[h];
          head[h] = q;
        }
        p += best;
      } else {
        this.#write(SYMBOL_CODE[data[p]], SYMBOL_BITS[data[p]]);
        p++;
      }
    }
  }

  // The stream's end: the block's end code, its last byte, and the Adler-32 of all the data.
  finish() {
    this.#write(SYMBOL_CODE[256], SYMBOL_BITS[256]);
    if (this.count) this.#write(0, 8 - this.count);
    let a = 1, b = 0;
    for (let i = 0; i < this.data.length;) {
      for (const end = Math.min(this.data.length, i + 5552); i < end; i++) b += (a += this.data[i]);
      a %= 65521, b %= 65521;
    }
    for (const byte of [b >> 8, b & 255, a >> 8, a & 255]) this.#byte(byte);
    return this.out.slice(0, this.length);
  }

  #write(value, bits) {
    this.bits |= value << this.count;
    this.count += bits;
    while (this.count >= 8) {
      this.#byte(this.bits & 255);
      this.bits >>>= 8;
      this.count -= 8;
    }
  }

  #byte(byte) {
    if (this.length === this.out.length) {
      const grown = new Uint8Array(this.out.length * 2);
      grown.set(this.out);
      this.out = grown;
    }
    this.out[this.length++] = byte;
  }
}
