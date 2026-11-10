// Reading the document without changing it: the colors under a grid pixel (the image, the base, the
// paint), what's under a cell, edit cells, and rects on the grid.
import { wholeTile } from '@/document/PaintLayer.js';
import { hashCell, hashPixel, pack } from '@/document/changes.js';
import { cellKey, parseKey } from '@/document/editCells.js';
import { isShapeKey } from '@/document/shapes.js';
import { keyLayer, layerKey } from '@/document/layerInfo.js';
import { TILE } from '@/document/History.js';
import { ctx2d } from '@/lib/Canvas.js';
import { bakedEntry, cellIndex, charRowsOf, halfColors, isSolidGlyph, mix } from '@/lib/Cells.js';
import { rgb2hex, hex2rgb } from '@/lib/ColorUtils.js';
import { effectiveColor, paletteChoices, shownColors, storedShowingAs } from '@/lib/PixelTransforms.js';
import { over } from '@/store/project/shared.js';

// For each palette color, a stored color that shows as it under the adjustments (paletteChoices), kept while
// the palette and the settings stay the same: asked once a cell by a whole grid's Merge up.
const storedFor = new WeakMap();
function storedOf(palette, params) {
  let held = storedFor.get(palette);
  if (held?.params !== params) {
    const choices = paletteChoices(params, palette);
    held = { params, map: new Map(palette.map((p, i) => [p.hex.toLowerCase(), choices[i]])) };
    storedFor.set(palette, held);
  }
  return held.map;
}

// A stored color that shows as the ASCII styles' black background under the adjustments: black, or white with Invert.
// ponytail: only those two; an adjustment that lifts black (Contrast, Levels) gets black, a little off. Search a grid if it bites.
const blacks = new WeakMap(); // processParams -> the hex: asked twice a cell by a merge
const storedBlack = (params) => {
  if (!blacks.has(params)) blacks.set(params, ['#000000', '#ffffff'].find((hex) => effectiveColor(hex, params).hex === '#000000') ?? '#000000');
  return blacks.get(params);
};

// The stored color hex, or one a step off it on some channels, that shows as target: Color ASCII's FG is the halves'
// average, and one averaged in stored colors can round the other way from the one shown (Invert turns half up to half down).
// reach: an adjustment that clips (Brightness past 100) or turns hues doesn't average as stored colors do, so failing
// that, a stored color that shows as target, or as near it as any can (reaching).
function shownAs(project, hex, target, { reach = false } = {}) {
  const params = project.processParams, { r, g, b } = hex2rgb(hex), goal = hex2rgb(target), steps = [0, -1, 1];
  const clamp = (v) => Math.max(0, Math.min(255, v)), near = [];
  for (const dr of steps) for (const dg of steps) for (const db of steps) near.push([clamp(r + dr), clamp(g + dg), clamp(b + db)]);
  const shown = shownColors(near, params, project.renderer.palette); // the 27 at once: a merge asks for every cell
  for (let i = 0; i < near.length; i++) {
    if (shown[4 * i] === goal.r && shown[4 * i + 1] === goal.g && shown[4 * i + 2] === goal.b) return rgb2hex({ r: near[i][0], g: near[i][1], b: near[i][2] });
  }
  return reach ? reaching(project, target) : hex;
}

// The stored color that shows as target, or as near it as any can (storedShowingAs), kept per settings and target: a
// merge of a whole picture's paint under such sliders asks once a distinct shown color.
const reached = new WeakMap(); // processParams -> Map(target -> stored)
function reaching(project, target) {
  const params = project.processParams, palette = project.renderer.palette;
  let kept = reached.get(params);
  if (kept?.palette !== palette) reached.set(params, kept = { palette, map: new Map() });
  let stored = kept.map.get(target);
  if (stored === undefined) kept.map.set(target, stored = storedShowingAs(params, target, palette));
  return stored;
}

// The base's cell as the render style shows it, in stored colors (bakedEntry of baseCellAt), its Color ASCII FG one that
// shows as the base's does.
function baseLook(project, col, row) {
  const look = bakedEntry(project.renderStyle, project.baseCellAt(col, row));
  if (project.renderStyle !== 'colorAscii') return look;
  const shown = project.renderer.underCell(col, row, project.processParams, project.renderedCells);
  return shown ? { ...look, fg: shownAs(project, look.fg, shown.fg.hex) } : look;
}

// The shown cells layers above the bottom, bottom first: every one, or only those under the layer with the id below (none
// under the bottom, or under a layer that isn't in the stack).
function cellsUnder(project, below = null) {
  const layers = project.layers, at = below === null ? layers.length : layers.findIndex((layer) => layer.id === below);
  return layers.filter((layer, i) => i > 0 && i < at && layer.kind === 'cells' && !layer.hidden).map((layer) => layer.id);
}

// Where a picked cell's colors came from, for the status bar: 'edit' where a shown cells layer above the base has paint
// or an edit cell's own color there, else 'base'; ownBg: one of those edit cells has a background of its own (all Color
// ASCII shows).
export function pickedFrom(project, col, row) {
  const ids = cellsUnder(project), entries = ids.map((id) => project.cellsOf(id).get(cellKey(col, row))).filter(Boolean);
  const from = (y, attr) => (ids.some((id) => !!project.paintOf(id)?.colorAt(col, y)) || entries.some((entry) => entry[attr] !== undefined) ? 'edit' : 'base');
  return { fgFrom: from(2 * row + 1, 'fg'), bgFrom: from(2 * row, 'bg'), ownBg: entries.some((entry) => entry.bg) };
}

// look ({ char?, fg, bg }, stored colors) with cells layer id's cell over it: its entry's own attributes, then (withPaint)
// its paint over each half by its alpha, bg the top, fg the bottom.
function layerOver(project, id, col, row, look, withPaint = true) {
  const entry = project.cellsOf(id).get(cellKey(col, row));
  let out = entry ? { ...look, ...entry } : look;
  const paint = withPaint && project.paintOf(id);
  if (!paint?.hasPaint) return out;
  const top = paint.pixelAt(col, 2 * row), bottom = paint.pixelAt(col, 2 * row + 1);
  if (top) out = { ...out, bg: rgb2hex(over(hex2rgb(out.bg), top)) };
  if (bottom) out = { ...out, fg: rgb2hex(over(hex2rgb(out.fg), bottom)) };
  return out;
}

export const readingActions = {
  // What the ledger reads, the first time it meets a position: the value before what's being submitted.
  // sendSlice submits a slice that's already written, so for that long the answer is what the stroke
  // had as of its last slice, and only the tiles this slice touched can be asked for. An artist's change
  // waiting for its frame (sharing.js) is already what's there. Inside an art layer they're the drawing kept aside:
  // what's drawn in the layer goes as the layer, never as cells or paint (sendSlice).
  // Keys and tiles name their layer (layerInfo.js); the baseline is the layer in use's, the one a slice is of.
  readCell(key) {
    const heard = this._sharing?.heardCells;
    if (heard?.has(key)) return heard.get(key);
    if (isShapeKey(key)) return (this._baseline?.shapes ?? this.shapes).get(key);
    const { id, key: at } = keyLayer(key);
    if (id !== this.editId) return this.cellsOf(id).get(at);
    return (this._artInside?.editCells ?? this._baseline?.cells ?? this.editCells).get(at);
  },

  readTile(x, y, id = 'edit') {
    if (id !== this.editId) return this.paintOf(id)?.readTile(x, y) ?? new Uint8ClampedArray(TILE * TILE * 4);
    if (this._artInside) return this._artInside.paintLayer.readTile(x, y);
    const before = this._baseline?.tiles.get(`${x},${y}`);
    return before ? wholeTile(before) : this.paintLayer.readTile(x, y);
  },

  // The check over the drawn layers as they are (changes.js), the slow way: what a sum is seeded with. Inside an art layer,
  // over the drawing kept aside.
  editLayerSum() {
    let sum = 0;
    for (const [key, shape] of this.shapes) sum ^= hashCell(key, shape);
    for (const id of new Set([this.editId, ...this.layers.slice(1).filter((layer) => layer.kind === 'cells').map((layer) => layer.id)])) {
      const { editCells, paintLayer } = id === this.editId ? this._artInside ?? this : this._layerData.get(id) ?? {};
      for (const [key, entry] of editCells ?? []) sum ^= hashCell(layerKey(id, key), entry);
      if (!paintLayer?.hasPaint) continue;
      const { width, height } = paintLayer.canvas;
      const { data } = ctx2d(paintLayer.canvas).getImageData(0, 0, width, height);
      for (let i = 3, at = 0; i < data.length; i += 4, at++) {
        if (data[i]) sum ^= hashPixel(at % width, Math.floor(at / width), pack(data, i - 3));
      }
    }
    return sum;
  },

  // The color under grid pixel (x, y) before adjustments, as it shows: the base (with the lower group's shapes), with every
  // shown cells layer's paint and upper vector layer's shapes over it by their alpha, bottom first. upTo: only up to the
  // cells layer with that id, it included even hidden.
  rawColorAt(x, y, { upTo = null } = {}) {
    if (!this.image) return '#000000';
    this.ensureLayer();
    x = Math.floor(x);
    y = Math.floor(y);
    let color = this.baseColorAt(x, y);
    const upper = this.lowerGroup.upper, last = upTo === null ? this.layers.length - 1 : this.layers.findIndex((layer) => layer.id === upTo);
    for (const layer of this.layers.slice(1, last + 1)) {
      if (layer.hidden && layer.id !== upTo) continue;
      const painted = layer.kind === 'cells' ? this.paintOf(layer.id)?.pixelAt(x, y)
        : upper.includes(layer.id) && this.renderer.upperStoredAt(this._upperShapes.get(layer.id), x, y);
      if (painted) color = rgb2hex(over(hex2rgb(color), painted));
    }
    return color;
  },

  // The base layer's color at grid pixel (x, y), as stored (before adjustments): its own pixels
  // (as the Renderer stores them: a moved block of the picture keeps every processed pixel) over
  // the image as the pipeline shows it.
  baseColorAt(x, y) {
    const own = this.renderer.baseStoredAt(x, y);
    if (!own || own.a >= 1) return own ? rgb2hex(own) : this.imageColorAt(x, y);
    return rgb2hex(over(hex2rgb(this.imageColorAt(x, y)), own));
  },

  // The image under grid pixel (x, y) before adjustments, as the pipeline downsamples it.
  imageColorAt(x, y) {
    const source = this.renderer.imageAt(x, y, this.cols, this.rows);
    return source ? rgb2hex(source) : '#000000';
  },

  // What's under a cell, as stored colors (pre-adjustment), for the eyedropper, flip and merge up.
  // Stored, not as displayed: a picked or merged-up color keeps following the adjustments, as the
  // picture's own colors do (picking a displayed color would apply the adjustments twice).
  // The source image (with the lower group's shapes), with every shown layer over it, bottom first: a cells layer's edit
  // cell's attributes, then (withPaint) its paint by its alpha over each half; an upper vector layer's shapes the same
  // way. A hidden layer isn't read (what shows is picked), unless evenHidden: an edit of the layer in use itself, read
  // with the shown layers under it (none above it).
  underlyingAt(col, row, { withPaint = true, evenHidden = false } = {}) {
    const ids = evenHidden ? [...cellsUnder(this, this.editId), this.editId] : cellsUnder(this), upper = this.lowerGroup.upper;
    const last = evenHidden ? this.layers.findIndex((layer) => layer.id === this.editId) : this.layers.length - 1;
    let look = { bg: this.baseColorAt(col, 2 * row), fg: this.baseColorAt(col, 2 * row + 1) };
    for (const { id, kind } of this.layers.slice(1, last + 1)) {
      if (kind === 'cells') {
        if (ids.includes(id)) look = layerOver(this, id, col, row, look, withPaint);
        continue;
      }
      if (!withPaint || !upper.includes(id)) continue;
      const shapes = this._upperShapes.get(id), top = this.renderer.upperStoredAt(shapes, col, 2 * row), bottom = this.renderer.upperStoredAt(shapes, col, 2 * row + 1);
      if (top) look = { ...look, bg: rgb2hex(over(hex2rgb(look.bg), top)) };
      if (bottom) look = { ...look, fg: rgb2hex(over(hex2rgb(look.fg), bottom)) };
    }
    const i = cellIndex(col, row, this.cols);
    const shown = withPaint ? this.cells[i] : null;
    return { char: shown?.char ?? look.char ?? this.renderedCells[i]?.char ?? ' ', bg: look.bg, fg: look.fg };
  },

  // What a cell layer's entry is completed against (completeAt): the base's cell as the render style shows it, with the
  // shown cells layers under the layer with the id below over it, each as underlyingAt lays them.
  lookUnder(col, row, below = this.editId) {
    let look = baseLook(this, col, row);
    for (const id of cellsUnder(this, below)) look = layerOver(this, id, col, row, look);
    return look;
  },

  // A cell as the stack shows it, in stored colors (before adjustments), for a copy of what shapes show: the base's cell with
  // the lower group's shapes (baseCellAt), then each shown layer above, bottom first: a cells layer as lookUnder lays it,
  // an upper vector layer's shapes by their alpha over each half (in the ASCII styles, over the halves of the character's
  // ink on black, then averaged into FG, as buildCell does; an upper cells layer's paint the same way, over an exact cell's
  // BG and FG unless its character is solid, as coverCell does). The character is the one that shows. through: only up to
  // the upper layer with that id, its cell as it shows there (shown: the cell as composed up to it, Merge down's freeze).
  storedLookAt(col, row, { through = null, shown = this.cells[cellIndex(col, row, this.cols)] } = {}) {
    const { cells, upper } = this.lowerGroup, ascii = this.renderStyle === 'colorAscii' || this.renderStyle === 'ascii', key = cellKey(col, row);
    let look = baseLook(this, col, row);
    if (cells) look = layerOver(this, cells, col, row, look);
    let exact = !!(cells && this.cellsOf(cells).has(key)) || this.renderer.pinAt(col, row) !== undefined; // as the renderer's upper walk
    // The look with paint pixels (or shape pixels) top and bottom over the halves, as the ASCII styles show it: averaged, no BG.
    const asciiOver = (top, bottom, halvesOf = halfColors) => {
      const halves = halvesOf({ char: look.char ?? ' ', bg: hex2rgb(storedBlack(this.processParams)), fg: hex2rgb(look.fg) });
      const [t, b] = halves.map((half, k) => { const px = k ? bottom : top; return px ? over(half, px) : half; });
      return { char: look.char, fg: rgb2hex(mix(t, b, 0.5)) };
    };
    for (const id of through ? upper.slice(0, upper.indexOf(through) + 1) : upper) {
      if (this.layerById(id).kind === 'cells') {
        if (!ascii) { look = layerOver(this, id, col, row, look); continue; }
        look = layerOver(this, id, col, row, look, false);
        if (this.cellsOf(id).has(key)) exact = true;
        const paint = this.paintOf(id), top = paint?.pixelAt(col, 2 * row), bottom = paint?.pixelAt(col, 2 * row + 1);
        if (top || bottom) look = asciiOver(top, bottom, exact && !isSolidGlyph(look.char ?? ' ') ? (cell) => [cell.bg, cell.fg] : halfColors);
        continue;
      }
      const shapes = this._upperShapes.get(id), char = shapes?.charAt(col, row);
      if (char === undefined) continue;
      const top = this.renderer.upperStoredAt(shapes, col, 2 * row), bottom = this.renderer.upperStoredAt(shapes, col, 2 * row + 1);
      exact = char !== null;
      if (ascii) { // as buildCell lays them: the halves of the character's ink on black, shapes over each, averaged, no BG
        look = { ...asciiOver(top, bottom), char: char ?? look.char };
        continue;
      }
      if (top) look = { ...look, bg: rgb2hex(over(hex2rgb(look.bg), top)) };
      if (bottom) look = { ...look, fg: rgb2hex(over(hex2rgb(look.fg), bottom)) };
    }
    const fg = shown && this.renderStyle === 'colorAscii' ? shownAs(this, look.fg, shown.fg.hex, { reach: true }) : look.fg;
    return { char: !shown || shown.wide === 'trail' ? ' ' : shown.char, fg, bg: look.bg };
  },

  editCellAt(col, row) {
    return this.editCells.get(cellKey(col, row));
  },

  // The whole grid as a rect (Merge up and Select all with no selection).
  gridRect() {
    return { c0: 0, r0: 0, c1: this.cols - 1, r1: charRowsOf(this.rows) - 1 };
  },

  // The base layer's cell (no edits, no paint), as stored colors (before adjustments): the character it
  // shows (or the pinned one), bg the top half, fg the bottom. With a palette, an ANSI cell's colors are
  // the ones it shows (dithered, or Best match's and By shape's, aren't its two pixels; and a pixel run
  // through the adjustments here can land on another palette color than the pipeline's): its own pixel
  // where that shows as it, so it follows the adjustments as the picture does, else one that does.
  baseCellAt(col, row) {
    const params = this.processParams, palette = this.renderer.palette;
    // underCell: as the cell shows now; the last full render's is stale after a base edit (until the pipeline's redone)
    const shown = this.renderer.underCell(col, row, params, this.renderedCells);
    const bg = this.baseColorAt(col, 2 * row), fg = this.baseColorAt(col, 2 * row + 1);
    if (shown && palette && this.renderStyle === 'ansi') {
      const stored = storedOf(palette, params);
      const as = (color, own) => {
        const hex = color.hex.toLowerCase();
        return this.renderer.effective(own, params).hex.toLowerCase() === hex ? own : stored.get(hex) ?? color.hex;
      };
      return { char: shown.char, bg: as(shown.bg, bg), fg: as(shown.fg, fg) };
    }
    return { char: shown?.char ?? this.renderer.pinAt(col, row) ?? this.renderedCells[cellIndex(col, row, this.cols)]?.char ?? ' ', bg, fg };
  },

  clipRect({ c0, r0, c1, r1 }) {
    const rect = { c0: Math.max(0, c0), r0: Math.max(0, r0), c1: Math.min(this.cols - 1, c1), r1: Math.min(charRowsOf(this.rows) - 1, r1) };
    return rect.c0 <= rect.c1 && rect.r0 <= rect.r1 ? rect : null;
  },

  cellHasPaint(col, row) {
    return !!(this.paintLayer?.colorAt(col, 2 * row) || this.paintLayer?.colorAt(col, 2 * row + 1));
  },

  // Whether anything is drawn inside a cell rect (an edit cell or paint): something to merge.
  hasEditsIn(rect) {
    for (const key of this.editCells.keys()) {
      const { col, row } = parseKey(key);
      if (col >= rect.c0 && col <= rect.c1 && row >= rect.r0 && row <= rect.r1) return true;
    }
    return !!this.paintLayer?.hasPaintIn(rect);
  },
};
