/**
 * An artist's own changes the host hasn't numbered yet. They show at once, and each position they're on
 * holds the agreed value beneath, so the screen ends up as the host's order has it. Nothing here touches
 * the picture except through read and write.
 *
 * A position is a cell's key ('col,row'), its value an Entry or null, or a paint pixel's [x, y], its value
 * a packed color (0 transparent). A [x, y] is made for the call and not kept: what's held for paint is in
 * typed arrays per tile, so a stroke costs what its tiles do however its pixels are spread.
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

const startOf = (at) => Math.floor(at / TILE) * TILE;
const indexOf = (x, y) => (y - startOf(y)) * TILE + (x - startOf(x));

export class Pending {
  #changes = []; // oldest first, each { stroke, cells, runs }
  #cells = new Map(); // key -> { claims, agreed }
  #tiles = new Map(); // 'x,y' -> { x, y, held, claims, agreed }: a claim count and the agreed color per pixel
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
    eachPixel(runs, (x, y, rgba) => {
      const tile = this.#tile(x, y), i = indexOf(x, y);
      if (!tile?.claims[i]) {
        this.#sum ^= hashPixel(x, y, this.read([x, y])) ^ hashPixel(x, y, rgba);
        this.write([x, y], rgba);
        const last = applied.runs.at(-1);
        if (last && last[1] === y && last[0] + last[2] === x && last[3] === rgba) last[2]++;
        else applied.runs.push([x, y, 1, rgba]);
        return;
      }
      this.#sum ^= hashPixel(x, y, tile.agreed[i]) ^ hashPixel(x, y, rgba);
      tile.agreed[i] = rgba;
      if (echo && !--tile.claims[i] && !--tile.held) this.#tiles.delete(`${tile.x},${tile.y}`);
    });
    return { applied };
  }

  // The room ended: everyone keeps the last agreed picture.
  dropAll() {
    this.lift();
    this.#changes = [];
  }

  // The agreed picture on screen, with what's mine still held: reapply puts it back.
  lift() {
    for (const [key, { agreed }] of this.#cells) this.write(key, agreed);
    for (const { x, y, claims, agreed } of this.#tiles.values()) {
      for (let i = 0; i < claims.length; i++) {
        if (claims[i]) this.write([x + i % TILE, y + Math.floor(i / TILE)], agreed[i]);
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
    eachPixel(runs, (x, y) => {
      const tile = this.#tile(x, y), i = indexOf(x, y);
      if (--tile.claims[i]) {
        this.write([x, y], this.#newestPixel(x, y));
        return;
      }
      this.write([x, y], tile.agreed[i]);
      if (!--tile.held) this.#tiles.delete(`${tile.x},${tile.y}`);
    });
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
      eachPixel(change.runs, (x, y, rgba) => this.write([x, y], rgba));
    }
  }

  // Only for retract, where a position is held twice, which a stroke's own slices rarely are.
  #newestCell(key) {
    for (let at = this.#changes.length - 1; at >= 0; at--) {
      const found = this.#changes[at].cells.findLast(([other]) => other === key);
      if (found) return found[1];
    }
  }

  #newestPixel(x, y) {
    for (let at = this.#changes.length - 1; at >= 0; at--) {
      const found = this.#changes[at].runs.findLast(([rx, ry, length]) => ry === y && x >= rx && x < rx + length);
      if (found) return found[3];
    }
  }

  #claim({ cells, runs }) {
    for (const [key] of cells) {
      const claim = this.#cells.get(key);
      if (claim) claim.claims++;
      else this.#cells.set(key, { claims: 1, agreed: this.read(key) ?? null });
    }
    eachPixel(runs, (x, y) => {
      const tile = this.#tile(x, y) ?? this.#newTile(x, y), i = indexOf(x, y);
      if (!tile.claims[i]++) {
        tile.held++;
        tile.agreed[i] = this.read([x, y]);
      }
    });
  }

  #tile(x, y) {
    return this.#tiles.get(`${startOf(x)},${startOf(y)}`);
  }

  // Two arrays of TILE x TILE: the same 32 KB History counts for a tile.
  #newTile(x, y) {
    const tile = { x: startOf(x), y: startOf(y), held: 0, claims: new Uint32Array(TILE * TILE), agreed: new Uint32Array(TILE * TILE) };
    this.#tiles.set(`${tile.x},${tile.y}`, tile);
    return tile;
  }

  #forgetClaims() {
    this.#cells.clear();
    this.#tiles.clear();
  }
}
