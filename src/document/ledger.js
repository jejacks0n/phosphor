/**
 * Numbers every change to the edit layer and keeps, per position, who drew there in order over what it
 * started with, so undo can take back one person's stroke and leave everyone else's. What it returns is
 * a Numbered, { n, by, stroke, cells, runs }, for the caller to apply and send; nothing here touches the
 * picture, it only reads it. While numbering, one too big for mostBytes takes a number per piece: it comes
 * back whole, to apply, with those pieces as parts, to send. readCell(key) gives a cell's entry, and readTile(x, y) a tile's RGBA pixels:
 * x and y TILE-aligned, always TILE x TILE, transparent past the layer's edge. Both are read the first
 * time a position is touched, so they must show the picture with every Numbered so far applied, and
 * without the change being submitted.
 *
 * Cells: a position's stack is the strokes that wrote it, oldest first, and each stroke holds its values.
 * Paint: per tile, what it started with and a list of entries, oldest first. An entry is one stroke's
 * pixels in that tile as a typed array, so a stroke costs what its tiles do however its pixels are spread.
 */
import { hashCell, hashPixel, eachPixel, pack, changeBytes, splitChange, Tail } from './changes.js';
import { TILE } from './History.js';

// In a room; alone, History's limits decide and tell us through forget.
const MOST_STROKES = 50;
const MOST_BYTES = 64 * 1024 * 1024;

// An entry counts as a before and an after, what a tile costs in History. It really holds less: entries
// in a tile share one start.
const TILE_BYTES = 2 * TILE * TILE * 4;
const CELL_BYTES = 128; // about: a key, an entry and a place in a stack

// In an entry 0 means "this stroke didn't write here", so transparent, which is a value, is held as this.
// It can't be a real color: a pixel without alpha is always packed as 0.
const ERASED = 0x100;
const held = (rgba) => (rgba & 0xff ? rgba : ERASED);
const color = (value) => (value === ERASED ? 0 : value);

const sameCell = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const noStacks = () => ({ cells: new Map(), tiles: new Map(), strokes: new Map(), bytes: 0 });

// A tile's pixels for JSON, mostly nothing: [index, value, index, value...].
const sparse = (px) => {
  const pairs = [];
  for (let i = 0; i < px.length; i++) if (px[i]) pairs.push(i, px[i]);
  return pairs;
};
const filled = (pairs) => {
  const px = new Uint32Array(TILE * TILE);
  for (let i = 0; i < pairs.length; i += 2) px[pairs[i]] = pairs[i + 1];
  return px;
};

// kept() as JSON can carry it, for a handover. A stroke's array is the same array as its entry's in a tile (an
// undo goes by that), so arrays go in a table and are named by place.
export function keptForWire({ n, epoch, limits, sum, stacks, tail }) {
  const places = new Map();
  const place = (px) => {
    if (!places.has(px)) places.set(px, places.size);
    return places.get(px);
  };
  const strokes = [...stacks.strokes.values()].map(({ id, by, undone, bytes, cells, paint }) => ({ id, by, undone, bytes, cells: [...cells], paint: [...paint].map(([name, px]) => [name, place(px)]) }));
  const cells = [...stacks.cells].map(([key, { base, strokes: on }]) => [key, base, on.map(({ id }) => id)]);
  const tiles = [...stacks.tiles].map(([name, { x, y, base, entries }]) => [name, x, y, sparse(base), entries.map(({ stroke, px }) => [stroke, place(px)])]);
  return { n, epoch, limits, sum, tail, bytes: stacks.bytes, strokes, cells, tiles, arrays: [...places.keys()].map(sparse) };
}

export function keptFromWire({ n, epoch, limits, sum, tail, bytes, strokes, cells, tiles, arrays }) {
  const pixels = arrays.map(filled);
  const records = new Map(strokes.map(({ id, by, undone, bytes: held, cells: own, paint }) => [id, { id, by, undone, bytes: held, cells: new Map(own), paint: new Map(paint.map(([name, at]) => [name, pixels[at]])) }]));
  return {
    n, epoch, limits, sum, tail,
    stacks: {
      bytes, strokes: records,
      cells: new Map(cells.map(([key, base, on]) => [key, { base, strokes: on.map((id) => records.get(id)) }])),
      tiles: new Map(tiles.map(([name, x, y, base, entries]) => [name, { x, y, base: filled(base), entries: entries.map(([stroke, at]) => ({ stroke, px: pixels[at] })) }])),
    },
  };
}

export class Ledger {
  // Plain data all the way down, so kept() is just this. Strokes are shared between stacks, which a
  // structured clone keeps.
  #stacks;
  #sum;
  #numbering; // keeping the tail and the sum, which only someone else ever asks for

  constructor({ readCell, readTile, n = 0, epoch, tail = new Tail(), sum = 0, limits = false, numbering = true, mostBytes = Infinity }) {
    this.readCell = readCell;
    this.readTile = readTile;
    this.n = n; // the last number used
    this.epoch = epoch;
    this.tail = tail;
    this.limits = limits;
    this.mostBytes = mostBytes;
    this.#stacks = noStacks();
    this.#sum = sum;
    this.#numbering = numbering;
  }

  // From here on the tail and the sum follow every change: someone drawing alone pays for neither.
  startNumbering({ sum = this.#sum } = {}) {
    this.#numbering = true;
    this.#sum = sum;
  }

  stopNumbering() { this.#numbering = false; }

  // The check over the agreed picture, with every Numbered returned so far already in it. It only means
  // anything while sharing: it follows changes from what it was seeded with, and nothing here scans the
  // picture, so whoever starts sharing or sends a project seeds it.
  get sum() { return this.#sum; }

  seedSum(sum) { this.#sum = sum; }

  // The same person under another name: sharing gives someone drawing alone their id.
  rename(from, to) {
    for (const record of this.#stacks.strokes.values()) if (record.by === from) record.by = to;
  }

  // About what a stroke holds, for History's byte limit.
  bytesOf(stroke) { return this.#stacks.strokes.get(stroke)?.bytes ?? 0; }

  // Null when the stroke is someone else's or was undone: what's asked for can't be recorded honestly.
  submit(by, stroke, { cells = [], runs = [] }) {
    const { strokes } = this.#stacks;
    let record = strokes.get(stroke);
    if (record && (record.by !== by || record.undone)) return null;
    record ??= { id: stroke, by, undone: false, cells: new Map(), paint: new Map(), bytes: 0 };
    // Oldest first means written longest ago, so a stroke still being written isn't what a limit takes.
    // ponytail: one quiet past a limit does go, and its next slice starts over; only what's after that undoes.
    strokes.delete(stroke);
    strokes.set(stroke, record);

    for (const [key, entry] of cells) this.#writeCell(record, key, entry ?? null);
    let tile = null;
    eachPixel(runs, (x, y, rgba) => {
      const tx = Math.floor(x / TILE) * TILE, ty = Math.floor(y / TILE) * TILE;
      if (tile?.x !== tx || tile?.y !== ty) tile = this.#tile(tx, ty);
      this.#writePixel(record, tile, (y - ty) * TILE + (x - tx), rgba);
    });
    this.#trim(stroke);
    return this.#numbered(by, stroke, cells, runs);
  }

  // Each position it's on top of goes to the next value down; where it's buried it just leaves the stack.
  // Lists only what visibly changes, so someone's undo can be nothing at all but still takes a number.
  undo(by, stroke) {
    const record = this.#stacks.strokes.get(stroke);
    if (!record || record.by !== by || record.undone) return null;
    const cells = [];
    for (const [key, value] of record.cells) {
      const stack = this.#stacks.cells.get(key);
      const onTop = stack.strokes.at(-1) === record;
      stack.strokes.splice(stack.strokes.indexOf(record), 1);
      if (onTop) this.#revealCell(cells, key, value, stack);
      if (!stack.strokes.length) this.#stacks.cells.delete(key);
    }
    const runs = [];
    for (const name of record.paint.keys()) this.#undoTile(record, name, runs);
    record.undone = true;
    return this.#numbered(by, stroke, cells, runs);
  }

  // Back on top of each position, as a new change, over whatever was drawn since.
  redo(by, stroke) {
    const record = this.#stacks.strokes.get(stroke);
    if (!record || record.by !== by || !record.undone) return null;
    const cells = [];
    for (const [key, value] of record.cells) {
      const stack = this.#cellStack(key);
      const shown = this.#shownCell(key, stack);
      stack.strokes.push(record);
      if (!sameCell(shown, value)) {
        cells.push([key, value]);
        this.#sumCell(key, shown, value);
      }
    }
    const runs = [];
    for (const [name, px] of record.paint) {
      const [x, y] = name.split(',').map(Number);
      const tile = this.#tile(x, y);
      for (let i = 0; i < px.length; i++) {
        if (!px[i]) continue;
        const shown = shownPixel(tile, i);
        if (shown !== color(px[i])) this.#listPixel(runs, tile, i, shown, color(px[i]));
      }
      tile.entries.push({ stroke: record.id, px });
    }
    record.undone = false;
    return this.#numbered(by, stroke, cells, runs);
  }

  // A number for a settings, base or project message; those go in the tail through their caller.
  note() { return ++this.n; }

  // A project's effect: the positions don't mean what they did. sum, if given, is the check over the new picture.
  reset({ epoch = this.epoch, sum = this.#sum } = {}) {
    this.epoch = epoch;
    this.#sum = sum;
    this.#stacks = noStacks();
  }

  // A merge empties the stacks and its entry keeps them, to put back when it's undone. Neither touches the
  // sum: a merge in a room is followed by a project, which seeds it.
  takeStacks() {
    const stacks = this.#stacks;
    this.#stacks = noStacks();
    return stacks;
  }

  putStacks(stacks) { this.#stacks = stacks; }

  setLimits(on) {
    this.limits = on;
    this.#trim();
  }

  // What it drew becomes part of what's beneath. Anything under it can never show again, so that goes too.
  forget(stroke) {
    const stacks = this.#stacks, record = stacks.strokes.get(stroke);
    if (!record) return;
    if (!record.undone) {
      for (const [key, value] of record.cells) {
        const stack = stacks.cells.get(key);
        const below = stack.strokes.splice(0, stack.strokes.indexOf(record) + 1);
        below.pop();
        for (const other of below) {
          other.cells.delete(key);
          other.bytes -= CELL_BYTES;
          stacks.bytes -= CELL_BYTES;
        }
        stack.base = value;
        if (!stack.strokes.length) stacks.cells.delete(key);
      }
      for (const name of record.paint.keys()) {
        const tile = stacks.tiles.get(name);
        tile.entries.forEach((entry, at) => {
          if (entry.stroke !== stroke) return;
          for (let i = 0; i < entry.px.length; i++) {
            if (!entry.px[i]) continue;
            tile.base[i] = color(entry.px[i]);
            for (let lower = 0; lower < at; lower++) tile.entries[lower].px[i] = 0;
          }
        });
        tile.entries = tile.entries.filter((entry) => entry.stroke !== stroke);
        if (!tile.entries.length) stacks.tiles.delete(name);
      }
    }
    stacks.bytes -= record.bytes;
    stacks.strokes.delete(stroke);
  }

  // Someone else's number for a change, in its place: a host catching up from an artist's tail. The picture must
  // not have it yet. A number doesn't say what it was, so an undo is held as a change like any other: that stroke's
  // redo finds nothing to do, and it's still taken back whole by an undo.
  takeNumbered({ n, by, stroke, cells, runs }) {
    const record = this.#stacks.strokes.get(stroke);
    if (record && (record.by !== by || record.undone)) this.forget(stroke);
    this.n = n - 1;
    this.submit(by, stroke, { cells, runs });
    this.n = n;
  }

  // The strokes of one person that can still be undone, oldest first.
  strokesBy(by) {
    return [...this.#stacks.strokes.values()].filter((record) => record.by === by && !record.undone).map((record) => record.id);
  }

  // Shares what the ledger holds, so store or clone it before the next change; a clone is what restore wants.
  kept() {
    return { n: this.n, epoch: this.epoch, limits: this.limits, sum: this.#sum, stacks: this.#stacks, tail: this.tail.items };
  }

  static restore({ n, epoch, limits, sum, stacks, tail: items }, { readCell, readTile, mostBytes }) {
    const tail = new Tail();
    for (const numbered of items) tail.add(numbered);
    const ledger = new Ledger({ readCell, readTile, n, epoch, tail, sum, limits, mostBytes });
    // As frozen as a live ledger's. They're no longer the picture's own objects, which only sameCell ever meets.
    for (const stack of stacks.cells.values()) Object.freeze(stack.base);
    for (const record of stacks.strokes.values()) for (const value of record.cells.values()) Object.freeze(value);
    ledger.#stacks = stacks;
    return ledger;
  }

  #numbered(by, stroke, cells, runs) {
    if (!this.#numbering) return { n: ++this.n, by, stroke, cells, runs };
    if (this.mostBytes === Infinity || changeBytes({ cells, runs }) <= this.mostBytes) {
      const numbered = { n: ++this.n, by, stroke, cells, runs };
      this.tail.add(numbered);
      return numbered;
    }
    const parts = splitChange({ cells, runs }, this.mostBytes).map((part) => ({ n: ++this.n, by, stroke, ...part }));
    for (const part of parts) this.tail.add(part);
    return { n: this.n, by, stroke, cells, runs, parts };
  }

  #sumCell(key, from, to) {
    if (this.#numbering) this.#sum ^= hashCell(key, from) ^ hashCell(key, to);
  }

  #sumPixel(tile, i, from, to) {
    if (!this.#numbering) return;
    const x = tile.x + i % TILE, y = tile.y + Math.floor(i / TILE);
    this.#sum ^= hashPixel(x, y, from) ^ hashPixel(x, y, to);
  }

  #cellStack(key) {
    const { cells } = this.#stacks;
    let stack = cells.get(key);
    if (!stack) cells.set(key, stack = { base: this.readCell(key) ?? null, strokes: [] });
    return stack;
  }

  #shownCell(key, stack) {
    return stack.strokes.length ? stack.strokes.at(-1).cells.get(key) : stack.base;
  }

  // A stroke has one value per position. Writing again moves it to the top, over whoever drew since.
  #writeCell(record, key, entry) {
    const stack = this.#cellStack(key);
    this.#sumCell(key, this.#shownCell(key, stack), entry);
    const at = stack.strokes.indexOf(record);
    if (at >= 0) stack.strokes.splice(at, 1);
    else this.#charge(record, CELL_BYTES);
    stack.strokes.push(record);
    record.cells.set(key, entry);
  }

  #revealCell(cells, key, value, stack) {
    const shown = this.#shownCell(key, stack);
    if (sameCell(value, shown)) return;
    cells.push([key, shown]);
    this.#sumCell(key, value, shown);
  }

  #tile(x, y) {
    const { tiles } = this.#stacks, name = `${x},${y}`;
    let tile = tiles.get(name);
    if (!tile) {
      const data = this.readTile(x, y), base = new Uint32Array(TILE * TILE);
      for (let i = 0; i < base.length; i++) base[i] = pack(data, i * 4);
      tiles.set(name, tile = { x, y, base, entries: [] });
    }
    return tile;
  }

  // A stroke's pixel goes in its newest entry in the tile, unless someone has drawn that pixel since that
  // entry: then it needs a new entry on top of theirs. So only taking turns on the same pixels costs more
  // entries, and a stroke still has one value per pixel, however many entries it has.
  #writePixel(record, tile, i, rgba) {
    const { entries } = tile;
    if (this.#numbering) this.#sumPixel(tile, i, shownPixel(tile, i), rgba);

    let target = null, covered = false;
    for (let at = entries.length - 1; at >= 0 && !target; at--) {
      if (entries[at].stroke === record.id) target = entries[at];
      else if (entries[at].px[i]) covered = true;
    }
    if (!target || covered) {
      target = { stroke: record.id, px: new Uint32Array(TILE * TILE) };
      entries.push(target);
      this.#charge(record, TILE_BYTES);
      const name = `${tile.x},${tile.y}`;
      if (!record.paint.has(name)) record.paint.set(name, target.px);
    }
    for (const entry of entries) if (entry.stroke === record.id && entry !== target) entry.px[i] = 0;
    target.px[i] = held(rgba);
  }

  // The stroke's entries in a tile leave it, and become one array again for a redo.
  #undoTile(record, name, runs) {
    const tile = this.#stacks.tiles.get(name), own = record.paint.get(name);
    const { entries } = tile;
    for (let i = 0; i < own.length; i++) {
      for (let at = entries.length - 1; at >= 0; at--) {
        const value = entries[at].px[i];
        if (!value) continue;
        if (entries[at].stroke === record.id) { // on top: what's next down shows
          let under = tile.base[i];
          for (let lower = at - 1; lower >= 0; lower--) {
            if (entries[lower].px[i]) { under = color(entries[lower].px[i]); break; }
          }
          if (under !== color(value)) this.#listPixel(runs, tile, i, color(value), under);
        }
        break;
      }
    }
    for (const entry of entries) {
      if (entry.stroke !== record.id || entry.px === own) continue;
      for (let i = 0; i < own.length; i++) if (entry.px[i]) own[i] = entry.px[i];
      this.#charge(record, -TILE_BYTES);
    }
    tile.entries = entries.filter((entry) => entry.stroke !== record.id);
    if (!tile.entries.length) this.#stacks.tiles.delete(name);
  }

  #listPixel(runs, tile, i, from, to) {
    const x = tile.x + i % TILE, y = tile.y + Math.floor(i / TILE);
    this.#sumPixel(tile, i, from, to);
    const last = runs.at(-1);
    if (last && last[1] === y && last[0] + last[2] === x && last[3] === to) last[2]++;
    else runs.push([x, y, 1, to]);
  }

  #charge(record, bytes) {
    record.bytes += bytes;
    this.#stacks.bytes += bytes;
  }

  // The newest stays, however big: it's the edit just made.
  #trim(newest) {
    if (!this.limits) return;
    const { strokes } = this.#stacks, counts = new Map();
    for (const { by } of strokes.values()) counts.set(by, (counts.get(by) ?? 0) + 1);
    for (const { id, by } of strokes.values()) {
      if (id === newest || counts.get(by) <= MOST_STROKES) continue;
      counts.set(by, counts.get(by) - 1);
      this.forget(id);
    }
    for (const { id } of strokes.values()) {
      if (this.#stacks.bytes <= MOST_BYTES) break;
      if (id !== newest) this.forget(id);
    }
  }
}

function shownPixel(tile, i) {
  for (let at = tile.entries.length - 1; at >= 0; at--) {
    const value = tile.entries[at].px[i];
    if (value) return color(value);
  }
  return tile.base[i];
}
