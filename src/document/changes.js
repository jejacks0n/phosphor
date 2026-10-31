/**
 * A change to the edit layer, as data: { cells: [[key, Entry | null]...], runs: [[x, y, length, rgba]...] }.
 * A cell is set to its entry (null: it went); a run is same-color pixels along one row, the color an
 * unsigned 32-bit number (r, g, b, a from the top byte; 0 is transparent). Only what differs is listed,
 * so a change can be sent, split to fit a message, applied by anyone, and hashed for the check.
 * Nothing here touches a canvas or the DOM.
 */

const encoder = new TextEncoder();
const utf8Length = (text) => encoder.encode(text).length;

// Entries are frozen and copy-on-write, so a different object is a different entry.
export function cellChanges(before, after) {
  if (before === after) return [];
  const changes = [];
  for (const [key, entry] of after) if (before.get(key) !== entry) changes.push([key, entry]);
  for (const key of before.keys()) if (!after.has(key)) changes.push([key, null]);
  return changes;
}

// A transparent pixel is 0 whatever its color channels hold.
export const pack = (px, i) => (px[i + 3] ? ((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0 : 0);

// A pixel as a canvas stores it. Browsers read one stored pixel back differently ([0, 255, 42, 6] or
// [0, 255, 43, 6]), so where another browser's pixel might meet this one's, this is what says they're the same.
const stored = (rgba) => {
  const a = rgba & 0xff;
  if (a === 0xff) return rgba;
  const by = (channel) => Math.round((channel * a) / 255);
  return ((by(rgba >>> 24) << 24) | (by((rgba >>> 16) & 0xff) << 16) | (by((rgba >>> 8) & 0xff) << 8) | a) >>> 0;
};

// The pixels that differ between two width x height RGBA images, as runs at (ox, oy) from the top left.
// Another browser's pixel written mid-stroke reads back as this one's reading of it, which isn't a change.
export function pixelRuns(before, after, width, height, ox, oy) {
  const runs = [];
  for (let y = 0; y < height; y++) {
    let run = null;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const rgba = pack(after, i);
      const was = pack(before, i);
      if (rgba === was || stored(rgba) === stored(was)) { run = null; continue; }
      if (run && run[3] === rgba) run[2]++;
      else runs.push(run = [ox + x, oy + y, 1, rgba]);
    }
  }
  return runs;
}

export function eachPixel(runs, fn) {
  for (const [x, y, length, rgba] of runs) for (let i = 0; i < length; i++) fn(x + i, y, rgba);
}

export const changeBytes = (change) => utf8Length(JSON.stringify(change));

const ENVELOPE = utf8Length(JSON.stringify({ cells: [], runs: [] }));

// Cut a change into several that each fit in mostBytes, by position: a cell or pixel is in exactly one.
// A run too long for what's left of a message is cut into shorter runs. Throws RangeError when one cell
// (or one pixel) can't fit in a message at all.
export function splitChange({ cells, runs }, mostBytes) {
  const parts = [];
  let part = { cells: [], runs: [] }, size = ENVELOPE;
  const empty = () => !part.cells.length && !part.runs.length;
  const flush = () => { if (!empty()) parts.push(part); part = { cells: [], runs: [] }; size = ENVELOPE; };
  const fail = () => { throw new RangeError(`A change position doesn't fit in ${mostBytes} bytes`); };

  for (const cell of cells) {
    const bytes = utf8Length(JSON.stringify(cell));
    if (size + bytes + (part.cells.length ? 1 : 0) > mostBytes) {
      flush();
      if (ENVELOPE + bytes > mostBytes) fail();
    }
    size += bytes + (part.cells.length ? 1 : 0);
    part.cells.push(cell);
  }

  for (let [x, y, length, rgba] of runs) {
    while (length > 0) {
      const whole = utf8Length(JSON.stringify([x, y, length, rgba]));
      if (size + whole + (part.runs.length ? 1 : 0) <= mostBytes) {
        size += whole + (part.runs.length ? 1 : 0);
        part.runs.push([x, y, length, rgba]);
        break;
      }
      if (!empty() && ENVELOPE + whole <= mostBytes) { flush(); continue; }
      // Cut: as many pixels as the digits of the length that still fit.
      const fixed = utf8Length(JSON.stringify([x, y, '', rgba]).replace('""', ''));
      const digits = mostBytes - size - (part.runs.length ? 1 : 0) - fixed;
      if (digits < 1) {
        if (empty()) fail();
        flush();
        continue;
      }
      const piece = Math.min(length, 10 ** Math.min(digits, 15) - 1);
      size += fixed + String(piece).length + (part.runs.length ? 1 : 0);
      part.runs.push([x, y, piece, rgba]);
      x += piece;
      length -= piece;
    }
  }
  flush();
  return parts;
}

// The check sums these with XOR, so each position's hash has to be well mixed and an empty position 0.
function mix(h) {
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return mix(h);
}

// Over the entry's fields in a fixed order, so the same entry hashes the same after a trip through JSON.
export function hashCell(key, entry) {
  const fields = entry ? Object.keys(entry).filter((name) => entry[name] !== undefined).sort() : [];
  if (!fields.length) return 0;
  return hashText(`${key}\n${JSON.stringify(fields.map((name) => [name, entry[name]]))}`);
}

export const hashPixel = (x, y, rgba) => ((rgba & 0xff) === 0 ? 0 : mix(x ^ mix(y ^ mix(stored(rgba)))));

const TAIL_BYTES = 16 * 1024 * 1024;

/**
 * The last TAIL_BYTES of numbered changes, consecutive from the oldest held, so someone who missed a few
 * can be sent just those (a gap in n starts the tail over). An item is { n, bytes? }; bytes defaults to
 * its JSON length. The newest stays however big it is.
 */
export class Tail {
  #items = [];
  #sizes = [];
  #head = 0; // items before this have been dropped
  #bytes = 0;

  constructor(mostBytes = TAIL_BYTES) {
    this.mostBytes = mostBytes;
  }

  add(numbered) {
    // A number the tail didn't get (a project, say) leaves a gap: what's older can't be sent as the changes in between.
    if (this.#head < this.#items.length && numbered.n !== this.#items.at(-1).n + 1) this.#forget();
    const size = numbered.bytes ?? utf8Length(JSON.stringify(numbered));
    this.#items.push(numbered);
    this.#sizes.push(size);
    this.#bytes += size;
    while (this.#items.length - this.#head > 1 && this.#bytes > this.mostBytes) this.#bytes -= this.#sizes[this.#head++];
    if (this.#head > 1024 && this.#head > this.#items.length / 2) { // forget what was dropped
      this.#items.splice(0, this.#head);
      this.#sizes.splice(0, this.#head);
      this.#head = 0;
    }
  }

  #forget() {
    this.#items = [];
    this.#sizes = [];
    this.#head = 0;
    this.#bytes = 0;
  }

  get items() { return this.#items.slice(this.#head); }

  // Everything numbered after n, in order; null when the tail starts after n + 1, and for any n below 0
  // (has: -1 asks for the whole project). An empty tail answers [] for any n: callers rely on the epoch
  // to catch someone who is behind it.
  since(n) {
    if (n < 0) return null;
    if (this.#head >= this.#items.length) return [];
    const at = n + 1 - this.#items[this.#head].n;
    return at < 0 ? null : this.#items.slice(this.#head + at);
  }
}
