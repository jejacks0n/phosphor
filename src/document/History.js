/**
 * Undo/redo as a stack of { undo(), redo() } entries. Entries own whatever they need to replay
 * (paint tiles, char-edit maps, images); this class only orders them.
 */
export default class History {
  #entries = [];
  #cursor = 0; // entries before the cursor are undoable, entries after it redoable

  constructor(limit = 50) {
    this.limit = limit;
    this.version = 0; // +1 on every change; mirrored into the store so canUndo/canRedo stay reactive
  }

  get canUndo() { return this.#cursor > 0; }
  get canRedo() { return this.#cursor < this.#entries.length; }

  push(entry) {
    this.#entries.length = this.#cursor; // a new edit drops the redo tail
    this.#entries.push(entry);
    if (this.#entries.length > this.limit) this.#entries.shift();
    this.#cursor = this.#entries.length;
    this.version++;
  }

  undo() {
    if (!this.canUndo) return false;
    this.#entries[--this.#cursor].undo();
    this.version++;
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    this.#entries[this.#cursor++].redo();
    this.version++;
    return true;
  }

  // Drop every entry but those keep(entry) accepts, in order.
  retain(keep) {
    const undoable = this.#entries.slice(0, this.#cursor).filter(keep);
    this.#entries = [...undoable, ...this.#entries.slice(this.#cursor).filter(keep)];
    this.#cursor = undoable.length;
    this.version++;
  }

  clear() {
    this.#entries = [];
    this.#cursor = 0;
    this.version++;
  }
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
