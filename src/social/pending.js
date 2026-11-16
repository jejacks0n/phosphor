/**
 * An artist's own changes the host hasn't numbered yet. They show at once, and each position they're on
 * holds the agreed value beneath, so the screen ends up as the host's order has it. Nothing here touches
 * the picture except through read and write.
 *
 * A position is a cell's key ('col,row', or 'L2:col,row' on another layer: layerInfo.js), its value an Entry or null,
 * or a paint pixel's [x, y, id] (id: its layer's, 'edit' for the edit layer), its value a packed color (0 transparent). An
 * [x, y, id] is made for the call and not kept: what's held for paint is in typed arrays per tile, a layer's tiles apart,
 * so a stroke costs what its tiles do however its pixels are spread.
 *
 * read(position) must show the picture without the change being added, and with every Numbered heard so
 * far: a position not held is read as its agreed value.
 *
 * Why another's change is skipped where a change of mine is pending: channels are ordered, so a change heard
 * while mine is still unechoed was numbered before mine, and mine will land on top of it. Writing it would
 * only flash it under my stroke. Don't "fix" this by comparing numbers or merging: skipping is what makes
 * the screen match the host's when the echo comes, and the agreed value beneath still follows it, for
 * dropAll and the check.
 */
import { eachPixel, hashCell, hashPixel, Tail } from '../document/changes.js';
import { TILE } from '../document/History.js';
import { layerKey, onLayer } from '../document/layerInfo.js';

const startOf = (at) => Math.floor(at / TILE) * TILE;
const indexOf = (x, y) => (y - startOf(y)) * TILE + (x - startOf(x));

export class Pending {
  #changes = []; // oldest first, each { stroke, cells, runs }
  #cells = new Map(); // key -> { claims, agreed }
  #tiles = new Map(); // layerKey(id, 'x,y') -> { x, y, id, held, claims, agreed }: a claim count and the agreed color per pixel
  #sum = 0;
  #older = 0; // how many of the oldest changes are from before this connection, so its count isn't about them
  #handled = 0; // of the changes after those: how many are gone, by an echo or dropTaken

  constructor({ me, read, write, n = 0, tail = new Tail() }) {
    this.me = me;
    this.read = read;
    this.write = write;
    this.n = n; // the last number heard; a project sets it
    this.tail = tail;
  }

  // The check over the agreed picture, not the one on screen. A project seeds it, as with the Ledger.
  get sum() { return this.#sum; }

  seedSum(sum) { this.#sum = sum; }

  get size() { return this.#changes.length; }

  // Add before showing it, or read the position as it was: see read above. Showing it is the caller's.
  add(stroke, { cells = [], runs = [] }) {
    const change = { stroke, cells, runs };
    this.#changes.push(change);
    this.#claim(change);
  }

  // Every number, mine or not, moves the agreed picture. Only what's not held can reach the screen; an
  // echo's positions are held by itself, so the screen has it already. A number of mine that isn't the
  // oldest pending change's stroke (my undo or redo) is an ordinary change. applied is what was written.
  heard(numbered) {
    const { by, stroke, cells, runs } = numbered;
    this.n = numbered.n;
    this.tail.add(numbered);
    const echo = by === this.me && this.#changes[0]?.stroke === stroke;
    if (echo) { // one sent change gets one number, in order
      this.#changes.shift();
      if (this.#older) this.#older--;
      else this.#handled++;
    }

    const applied = { cells: [], runs: [] };
    for (const [key, entry] of cells) {
      const claim = this.#cells.get(key);
      this.#sum ^= hashCell(key, claim ? claim.agreed : this.read(key)) ^ hashCell(key, entry);
      if (!claim) {
        this.write(key, entry);
        applied.cells.push([key, entry]);
        continue;
      }
      claim.agreed = entry;
      if (echo && !--claim.claims) this.#cells.delete(key);
    }
    eachPixel(runs, (x, y, rgba, id = 'edit') => {
      const tile = this.#tile(x, y, id), i = indexOf(x, y);
      if (!tile?.claims[i]) {
        this.#sum ^= hashPixel(x, y, this.read([x, y, id]), id) ^ hashPixel(x, y, rgba, id);
        this.write([x, y, id], rgba);
        const last = applied.runs.at(-1);
        if (last && last[1] === y && last[0] + last[2] === x && last[3] === rgba && (last[4] ?? 'edit') === id) last[2]++;
        else applied.runs.push(id === 'edit' ? [x, y, 1, rgba] : [x, y, 1, rgba, id]);
        return;
      }
      this.#sum ^= hashPixel(x, y, tile.agreed[i], id) ^ hashPixel(x, y, rgba, id);
      tile.agreed[i] = rgba;
      if (echo && !--tile.claims[i] && !--tile.held) this.#forgetTile(tile);
    });
    return { applied, echo };
  }

  // The room ended: everyone keeps the last agreed picture.
  dropAll() {
    this.lift();
    this.#changes = [];
  }

  // The agreed picture on screen, with what's mine still held: reapply puts it back.
  lift() {
    for (const [key, { agreed }] of this.#cells) this.write(key, agreed);
    for (const { x, y, id, claims, agreed } of this.#tiles.values()) {
      for (let i = 0; i < claims.length; i++) {
        if (claims[i]) this.write([x + i % TILE, y + Math.floor(i / TILE), id], agreed[i]);
      }
    }
    this.#forgetClaims();
  }

  // Take back the newest change, one that never went out, so no number will ever come for it: what it
  // held shows what's still pending there or, with nothing, what's agreed.
  retract() {
    const { cells, runs } = this.#changes.pop();
    for (const [key] of cells) {
      const claim = this.#cells.get(key);
      if (--claim.claims) this.write(key, this.#newestCell(key));
      else {
        this.#cells.delete(key);
        this.write(key, claim.agreed);
      }
    }
    eachPixel(runs, (x, y, rgba, id = 'edit') => {
      const tile = this.#tile(x, y, id), i = indexOf(x, y);
      if (--tile.claims[i]) {
        this.write([x, y, id], this.#newestPixel(x, y, id));
        return;
      }
      this.write([x, y, id], tile.agreed[i]);
      if (!--tile.held) this.#forgetTile(tile);
    });
  }

  // A layer gone from the stack: what's held on it is forgotten, and so is what the changes have on it, so nothing here
  // writes it again; the changes stay, for their numbers. share: the layer's part of the check as the screen shows it. The
  // sum loses the agreed picture's, which is the screen's but where mine are held. Read before the layer goes.
  dropLayer(id, share = 0) {
    const gone = new Set();
    for (const { cells } of this.#changes) for (const [key, value] of cells) if (onLayer(key, id, [value])) gone.add(key);
    for (const [key, { agreed }] of this.#cells) if (onLayer(key, id, [agreed])) gone.add(key);
    for (const key of gone) {
      const claim = this.#cells.get(key);
      if (!claim) continue;
      this.#sum ^= hashCell(key, this.read(key)) ^ hashCell(key, claim.agreed);
      this.#cells.delete(key);
    }
    for (const tile of [...this.#tiles.values()]) {
      if (tile.id !== id) continue;
      for (let i = 0; i < tile.claims.length; i++) {
        if (!tile.claims[i]) continue;
        const x = tile.x + i % TILE, y = tile.y + Math.floor(i / TILE);
        this.#sum ^= hashPixel(x, y, this.read([x, y, id]), id) ^ hashPixel(x, y, tile.agreed[i], id);
      }
      this.#forgetTile(tile);
    }
    for (const change of this.#changes) {
      change.cells = change.cells.filter(([key]) => !gone.has(key));
      change.runs = change.runs.filter(([, , , , on = 'edit']) => on !== id);
    }
    this.#sum ^= share;
  }

  // A host came back: what it may never have numbered, oldest first, each with its stroke.
  // The host's count starts from these: they're all this connection's now.
  resend() {
    this.#older = this.#handled = 0;
    return this.#changes.slice();
  }

  // What's held, oldest first, without saying it's being sent.
  get waiting() { return this.#changes.slice(); }

  // A new connection: the host's count starts over, and what's here already isn't in it. Echoes from the tail
  // may yet come for these; none are counted.
  newConnection() {
    this.#older = this.#changes.length;
    this.#handled = 0;
  }

  // A project's `took`: how many changes this artist sent on this connection the host had handled (numbered, or
  // refused) by the project's n. Those are in the project or never will be, so no echo is coming for any
  // this hasn't heard one for: took less #handled of them, the oldest of this connection's. A change numbered
  // after the project isn't counted and stays, for its echo. Before reapply, which claims what's left.
  dropTaken(took) {
    const gone = this.#changes.splice(this.#older, Math.max(0, took - this.#handled));
    this.#handled += gone.length;
  }

  // After a project, which is on screen and is the agreed picture now: what's beneath is read over again.
  // Seed the sum first, from the project's picture: this writes what's mine on top of it.
  reapply() {
    this.#forgetClaims();
    for (const change of this.#changes) {
      this.#claim(change);
      for (const [key, entry] of change.cells) this.write(key, entry);
      eachPixel(change.runs, (x, y, rgba, id = 'edit') => this.write([x, y, id], rgba));
    }
  }

  // Only for retract, where a position is held twice, which a stroke's own slices rarely are.
  #newestCell(key) {
    for (let at = this.#changes.length - 1; at >= 0; at--) {
      const found = this.#changes[at].cells.findLast(([other]) => other === key);
      if (found) return found[1];
    }
  }

  #newestPixel(x, y, id) {
    for (let at = this.#changes.length - 1; at >= 0; at--) {
      const found = this.#changes[at].runs.findLast(([rx, ry, length, , on = 'edit']) => ry === y && x >= rx && x < rx + length && on === id);
      if (found) return found[3];
    }
  }

  #claim({ cells, runs }) {
    for (const [key] of cells) {
      const claim = this.#cells.get(key);
      if (claim) claim.claims++;
      else this.#cells.set(key, { claims: 1, agreed: this.read(key) ?? null });
    }
    eachPixel(runs, (x, y, rgba, id = 'edit') => {
      const tile = this.#tile(x, y, id) ?? this.#newTile(x, y, id), i = indexOf(x, y);
      if (!tile.claims[i]++) {
        tile.held++;
        tile.agreed[i] = this.read([x, y, id]);
      }
    });
  }

  #tile(x, y, id) {
    return this.#tiles.get(layerKey(id, `${startOf(x)},${startOf(y)}`));
  }

  // Two arrays of TILE x TILE: the same 32 KB History counts for a tile.
  #newTile(x, y, id) {
    const tile = { x: startOf(x), y: startOf(y), id, held: 0, claims: new Uint32Array(TILE * TILE), agreed: new Uint32Array(TILE * TILE) };
    this.#tiles.set(layerKey(id, `${tile.x},${tile.y}`), tile);
    return tile;
  }

  #forgetTile({ x, y, id }) {
    this.#tiles.delete(layerKey(id, `${x},${y}`));
  }

  #forgetClaims() {
    this.#cells.clear();
    this.#tiles.clear();
  }
}
