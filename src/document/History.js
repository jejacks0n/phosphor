/**
 * Undo/redo as a stack of { undo(), redo(), bytes?, onDrop?() } entries. Entries own whatever they need to
 * replay (base tiles, images, or a stroke's id in the ledger); this class only orders them, and drops the
 * oldest past limit entries or past maxBytes of what they hold (bytes: an entry's pixels, about). An entry
 * dropped for any reason hears it through onDrop.
 */
export default class History {
  #entries = [];
  #cursor = 0; // entries before the cursor are undoable, entries after it redoable

  constructor(limit = 50, maxBytes = Infinity) {
    this.limit = limit;
    this.maxBytes = maxBytes;
    this.version = 0; // +1 on every change; mirrored into the store so canUndo/canRedo stay reactive
  }

  get canUndo() { return this.#cursor > 0; }
  get bytes() { return this.#entries.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0); }
  get canRedo() { return this.#cursor < this.#entries.length; }
  get last() { return this.#entries[this.#cursor - 1]; } // the entry undo would take back next

  push(entry) {
    dropped(this.#entries.splice(this.#cursor)); // a new edit drops the redo tail
    this.#entries.push(entry);
    // The newest stays, however big: it's the edit just made.
    while (this.#entries.length > 1 && (this.#entries.length > this.limit || this.bytes > this.maxBytes)) dropped([this.#entries.shift()]);
    this.#cursor = this.#entries.length;
    this.version++;
  }

  // Each returns the entry it undid or redid, or false when there's none.
  undo() {
    if (!this.canUndo) return false;
    const entry = this.#entries[--this.#cursor];
    entry.undo();
    this.version++;
    return entry;
  }

  redo() {
    if (!this.canRedo) return false;
    const entry = this.#entries[this.#cursor++];
    entry.redo();
    this.version++;
    return entry;
  }

  // Drop every entry but those keep(entry) accepts, in order.
  retain(keep) {
    dropped(this.#entries.filter((entry) => !keep(entry)));
    const undoable = this.#entries.slice(0, this.#cursor).filter(keep);
    this.#entries = [...undoable, ...this.#entries.slice(this.#cursor).filter(keep)];
    this.#cursor = undoable.length;
    this.version++;
  }

  clear() {
    dropped(this.#entries);
    this.#entries = [];
    this.#cursor = 0;
    this.version++;
  }

  // Drop the last entry test(entry) accepts and every entry older than it. One waiting to be redone takes
  // the rest of the redo tail too: those were recorded on top of it.
  dropThrough(test) {
    const at = this.#entries.findLastIndex(test);
    if (at < 0) return;
    const end = at < this.#cursor ? at + 1 : this.#entries.length;
    dropped(this.#entries.splice(0, end));
    this.#cursor = Math.max(0, this.#cursor - end);
    this.version++;
  }
}

function dropped(entries) {
  for (const entry of entries) entry.onDrop?.();
}

// Paint strokes are recorded per tile: only tiles a stroke touches are copied.
export const TILE = 64;

// Tiles (layer pixels, TILE-aligned) covering rect, clipped to width x height.
export function tilesForRect(rect, width, height) {
  if (!rect) return [];
  // clip first, then align to the tile grid
  const rx0 = Math.max(0, rect.x), x1 = Math.min(width, rect.x + rect.w);
  const ry0 = Math.max(0, rect.y), y1 = Math.min(height, rect.y + rect.h);
  if (rx0 >= x1 || ry0 >= y1) return [];
  const x0 = Math.floor(rx0 / TILE) * TILE, y0 = Math.floor(ry0 / TILE) * TILE;
  const tiles = [];
  for (let y = y0; y < y1; y += TILE) {
    for (let x = x0; x < x1; x += TILE) {
      tiles.push({ x, y, w: Math.min(TILE, width - x), h: Math.min(TILE, height - y) });
    }
  }
  return tiles;
}
