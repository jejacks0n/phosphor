// Reading the document without changing it: the colors under a grid pixel (the image, the base, the
// paint), what's under a cell, edit cells, and rects on the grid.
import { wholeTile } from '@/document/PaintLayer.js';
import { hashCell } from '@/document/changes.js';
import { cellKey, parseKey, mergeEntry, tintedEntry, shownEntry, isFrozen, isPaintBlock, ownIndexes } from '@/document/editCells.js';
import { isShapeKey } from '@/document/shapes.js';
import { snapCursor } from '@/document/wideChars.js';
import { ctx2d } from '@/lib/Canvas.js';
import { keyLayer } from '@/document/layerInfo.js';
import { TILE } from '@/document/History.js';
import { bakedEntry, blockOver, cellIndex, charRowsOf, isSolidGlyph, mix, opensToPaint, putCellPixels, halfColors } from '@/lib/Cells.js';
import { rgb2hex, hex2rgb, sharedIndex } from '@/lib/ColorUtils.js';
import { effectiveColor, paletteChoices, shownColors, storedShowingAs } from '@/lib/PixelTransforms.js';
import { resolves } from '@/lib/CharResolver.js';
import { layerSum, levelCells, over } from '@/store/project/shared.js';

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

// The cell as it shows up to the upper layer with the id at col, row: shown when that's the layer stopped at (through) or no
// layer above it reaches the cell, else the upper walk stopped there (levelCells): for batch's cells at once ({ indexes,
// levels }: the cells asked for together and each layer's walk over them, kept as it's made), or the one cell.
function levelAt(project, id, col, row, through, shown, batch) {
  if (id === through) return shown;
  const { upper } = project.lowerGroup, key = cellKey(col, row), i = cellIndex(col, row, project.cols);
  const above = upper.slice(upper.indexOf(id) + 1, through ? upper.indexOf(through) + 1 : upper.length);
  const reached = above.some((each) => (project.layerById(each).kind === 'vector'
    ? project._upperShapes.get(each)?.charAt(col, row) !== undefined
    : project.cellsOf(each).has(key) || !!project.paintOf(each)?.pixelAt(col, 2 * row) || !!project.paintOf(each)?.pixelAt(col, 2 * row + 1)));
  if (!reached) return shown;
  if (!batch) return levelCells(project, id, [i])[i];
  let level = batch.levels.get(id);
  if (!level) batch.levels.set(id, level = levelCells(project, id, batch.indexes));
  return level[i];
}

// A color a cell shows as a stored one that shows as it (storedOf), or itself where none does (no palette).
function storedHexOf(project, color) {
  const palette = project.renderer.palette;
  return (palette?.length && storedOf(palette, project.processParams).get(color.hex.toLowerCase())) || color.hex;
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
// that, a stored color that shows as target, or as near it as any can (reaching). memo: a Map kept for one batch of calls
// (a merge asks twice a cell, mostly the same few pairs).
function shownAs(project, hex, target, { reach = false, memo = null } = {}) {
  if (!memo) return nearShowing(project, hex, target, reach);
  const key = `${hex}${target}${reach}`;
  if (!memo.has(key)) memo.set(key, nearShowing(project, hex, target, reach));
  return memo.get(key);
}
function nearShowing(project, hex, target, reach) {
  const params = project.processParams, { r, g, b } = hex2rgb(hex), goal = hex2rgb(target), steps = [0, -1, 1];
  const clamp = (v) => Math.max(0, Math.min(255, v)), near = [];
  for (const dr of steps) for (const dg of steps) for (const db of steps) near.push([clamp(r + dr), clamp(g + dg), clamp(b + db)]);
  const shown = shownColors(near, params, project.renderer.palette); // the 27 at once
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
  const base = project.baseCellAt(col, row);
  // Color ASCII: a pin whose two pixels differ shows them as its background and ink, as ANSI does (Cells.js pinnedCell, R8).
  const pinnedBg = project.renderStyle === 'colorAscii' && project.renderer.pinAt(col, row) !== undefined && base.bg.toLowerCase() !== base.fg.toLowerCase();
  const look = bakedEntry(pinnedBg ? 'ansi' : project.renderStyle, base);
  if (project.renderStyle !== 'colorAscii' || pinnedBg) return look;
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

// The Picker's read of a cell in the ANSI view (and Alt+U's): a wide character's trail reads its lead, and Color ASCII
// never shows a generated background, so only an edit cell's is real (null else). { col, row, char, fg, bg, fgIndex,
// bgIndex, fgFrom, bgFrom }, fgFrom and bgFrom for the status bar.
export function pickedCell(project, at) {
  const { col, row } = snapCursor(project.cells, project.cols, at, 0);
  const under = project.underlyingAt(col, row), { fgFrom, bgFrom, ownBg } = pickedFrom(project, col, row);
  const bg = project.renderStyle === 'colorAscii' && !ownBg ? null : under.bg;
  return { col, row, char: under.char, fg: under.fg, bg, fgFrom, bgFrom, ...pickedIndexes(project, col, row) };
}

// The 256-color indexes a picked cell's colors show as where a lower index shares the color (16, 231), for the color
// pair to keep (workspace.pickColor): { fgIndex, bgIndex }, undefined for any other color.
export function pickedIndexes(project, col, row) {
  const cell = project.cells[cellIndex(col, row, project.cols)], palette = project.renderer.palette;
  return { fgIndex: sharedIndex(cell?.fg.c, palette), bgIndex: sharedIndex(cell?.bg.c, palette) };
}

// look ({ char?, fg, bg }, stored colors) with cells layer id's cell over it: its entry's own attributes, then (withPaint)
// its paint over each half by its alpha, bg the top, fg the bottom. A color set over another drops the index it had
// (mergeEntry). exact: look is a character of someone's own, which a paint block takes the place of in ANSI (blockOver), as
// the Renderer shows it.
function layerOver(project, id, col, row, look, withPaint = true, exact = false) {
  const entry = project.cellsOf(id).get(cellKey(col, row));
  const out = entry ? mergeEntry(exact && isPaintBlock(entry) && project.renderStyle === 'ansi' ? blockOver(look) : look, entry) : look;
  return !withPaint || isFrozen(entry) ? out : paintOver(project, id, col, row, out); // a frozen cell's paint under it is what the entry stands for
}

// look with cells layer id's paint over each half by its alpha, bg the top, fg the bottom.
function paintOver(project, id, col, row, look) {
  const paint = project.paintOf(id);
  if (!paint?.hasPaint) return look;
  const top = paint.pixelAt(col, 2 * row), bottom = paint.pixelAt(col, 2 * row + 1);
  let out = look;
  if (top) out = mergeEntry(out, { bg: rgb2hex(over(hex2rgb(out.bg), top)) });
  if (bottom) out = mergeEntry(out, { fg: rgb2hex(over(hex2rgb(out.fg), bottom)) });
  return out;
}

// The two pixels ([top, bottom], { r, g, b }, stored colors) the cell at col, row shows up to and including the layer in
// use (it even hidden, as rawColorAt reads it): the base's, then each shown cells layer under it and the layer itself,
// its cell and its paint, and the upper vector layers' shapes between them. Paint and a cell the converter drew are
// their two pixels; a character of someone's own on one of those layers is its ink over its background as its glyph
// covers each half (halfColors; on black in the ASCII styles, as ownHalves has it), tinted by the paint over it (R2); a
// frozen cell is the paint under it (R3), and a paint block over a character takes its place in ANSI (blockOver, R5).
// What a plugin brush's paint.shown reads (tools/pluginBrush.js): rawColorAt reads paint alone, so a block of colored
// spaces typed on a layer was the color under it.
export function shownHalves(project, col, row) {
  const ids = [...cellsUnder(project, project.editId), project.editId], upper = project.lowerGroup.upper;
  const last = project.layers.findIndex((layer) => layer.id === project.editId), key = cellKey(col, row);
  let look = { bg: project.baseColorAt(col, 2 * row), fg: project.baseColorAt(col, 2 * row + 1) };
  for (const { id, kind } of project.layers.slice(1, last + 1)) {
    if (kind === 'cells') {
      if (!ids.includes(id)) continue;
      look = isFrozen(project.cellsOf(id).get(key)) ? paintOver(project, id, col, row, look) : layerOver(project, id, col, row, look, true, look.char !== undefined);
      continue;
    }
    if (!upper.includes(id)) continue;
    const shapes = project._upperShapes.get(id), top = project.renderer.upperStoredAt(shapes, col, 2 * row), bottom = project.renderer.upperStoredAt(shapes, col, 2 * row + 1);
    if (top) look = { ...look, bg: rgb2hex(over(hex2rgb(look.bg), top)) };
    if (bottom) look = { ...look, fg: rgb2hex(over(hex2rgb(look.fg), bottom)) };
  }
  const bg = hex2rgb(look.bg), fg = hex2rgb(look.fg);
  if (look.char === undefined) return [bg, fg];
  const ascii = project.renderStyle === 'colorAscii' || project.renderStyle === 'ascii';
  return halfColors({ char: look.char, bg: ascii ? { r: 0, g: 0, b: 0 } : bg, fg });
}

export const readingActions = {
  // What the ledger reads, the first time it meets a position: the value before what's being submitted.
  // sendSlice submits a slice that's already written, so for that long the answer is what the stroke
  // had as of its last slice, and only the tiles this slice touched can be asked for. An artist's change
  // waiting for its frame (sharing.js) is already what's there. Inside an art layer they're the drawing kept aside:
  // what's drawn in the layer goes as the layer, never as cells or paint (sendSlice).
  // Keys and tiles name their layer (layerInfo.js); the baseline is the layer in use's, the one a slice is of.
  readCell(key) {
    return this.cellReader()(key);
  },

  // readCell for many keys while nothing changes (the ledger's reader): the store read once, not a key at a time.
  cellReader() {
    const heard = this._sharing?.heardCells, shapes = this._baseline?.shapes ?? this.shapes, editId = this.editId;
    const own = this._artInside?.editCells ?? this._baseline?.cells ?? this.editCells, others = new Map();
    return (key) => {
      if (heard?.has(key)) return heard.get(key);
      if (isShapeKey(key)) return shapes.get(key);
      const { id, key: at } = keyLayer(key);
      if (id === editId) return own.get(at);
      if (!others.has(id)) others.set(id, this.cellsOf(id));
      return others.get(id).get(at);
    };
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
    for (const id of new Set([this.editId, ...this.layers.slice(1).filter((layer) => layer.kind === 'cells').map((layer) => layer.id)])) sum ^= layerSum(this, id);
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
  // The grid as the PIXEL view shows it, cols × rows and opaque, for the fills and the Wand to read (docs/model.md R11):
  // each character of someone's own as it looks at half-cell scale, not its two stored pixels. All of it: what shows
  // (shownCanvas) with the looks over it (looksCanvas), and the characters of the cells layers that show as the Overlay
  // draws them (R6), at full strength whatever its opacity. baseOnly: the base as it shows with nothing above, its pins
  // as they look (baseLook). Null before the first render.
  // ponytail: worked out whole on every fill and Wand click (each shown layer's cells walked, or each pin's look asked
  // for); keep it per render and cells if a grid that's all pins makes a click slow.
  pixelsAsSeen({ baseOnly = false } = {}) {
    const { renderer, cols, rows } = this;
    if (baseOnly) {
      const base = renderer.basePixels;
      if (!base) return null;
      const image = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height), params = this.processParams;
      for (const key of renderer.baseRecords.pins.keys()) {
        const { col, row } = parseKey(key);
        if (col >= base.width || 2 * row >= base.height) continue;
        renderer.baseLook(col, row, params)?.forEach(({ r, g, b }, half) => { // null under a hidden base, and for a ▄ outside ANSI
          if (2 * row + half < base.height) image.data.set([r, g, b], 4 * ((2 * row + half) * base.width + col));
        });
      }
      return image;
    }
    const shown = renderer.shownCanvas();
    if (!shown) return null;
    const canvas = Object.assign(document.createElement('canvas'), { width: cols, height: rows }), ctx = ctx2d(canvas);
    ctx.drawImage(shown, 0, 0);
    const looks = renderer.looksCanvas(this.processParams);
    if (looks) ctx.drawImage(looks, 0, 0);
    const image = ctx.getImageData(0, 0, cols, rows);
    const cells = this.cells; // read once: a store read a cell adds up over a grid of characters
    for (const i of ownIndexes(this.ownCellMaps(), cols, rows, this.renderStyle)) if (cells[i]) putCellPixels(image.data, cols, i, cells[i]);
    return image;
  },

  // Whether the cell at col, row shows a character of someone's own (typed, opened, pasted, pinned, an art layer's; a
  // paint block too) on the layer in use or under it: what paint laid there tints, where anything else converts over
  // it (docs/model.md R2). The Renderer's walk up to the layer (#exactUnder, #upperCell), the topmost entry deciding.
  ownCharAt(col, row) {
    const key = cellKey(col, row), ids = cellsUnder(this, this.editId);
    let own = this.renderer.pinAt(col, row) !== undefined;
    for (const entry of [...ids.map((id) => this.cellsOf(id).get(key)), this.editId === 'base' ? undefined : this.editCellAt(col, row)]) {
      const shown = shownEntry(entry, this.renderStyle);
      if (shown) own = !isFrozen(shown);
    }
    return own;
  },

  lookUnder(col, row, below = this.editId) {
    let look = baseLook(this, col, row), exact = this.renderer.pinAt(col, row) !== undefined; // as the Renderer's walk
    for (const id of cellsUnder(this, below)) {
      look = layerOver(this, id, col, row, look, true, exact);
      const own = shownEntry(this.cellsOf(id).get(cellKey(col, row)), this.renderStyle);
      if (own) exact = !isFrozen(own);
    }
    return look;
  },

  // A cell as the stack shows it, in stored colors (before adjustments), for a copy of what shapes show: the base's cell with
  // the lower group's shapes (baseCellAt), then each shown layer above, bottom first: a cells layer as lookUnder lays it,
  // an upper vector layer's shapes by their alpha over each half (in the ASCII styles, over the halves of the character's
  // ink on black, then averaged into FG, as buildCell does; an upper cells layer's paint the same way, over an exact cell's
  // BG and FG unless its character is solid, as coverCell does), or under its own Best match or By shape the colors its
  // cell shows there (levelAt), stored. The character is the one that shows. through: only up to
  // the upper layer with that id, its cell as it shows there (shown: the cell as composed up to it, Merge down's freeze).
  // batch: { indexes, levels: new Map() } shared by the calls for the cells at indexes (a copy's, a freeze's), so a layer's
  // level is composed once for them all (levelAt). Its colors show as shown's, or as near as stored colors can.
  storedLookAt(col, row, { through = null, shown = this.cells[cellIndex(col, row, this.cols)], batch = null } = {}) {
    const { cells, upper } = this.lowerGroup, ascii = this.renderStyle === 'colorAscii' || this.renderStyle === 'ascii', key = cellKey(col, row);
    let look = baseLook(this, col, row);
    if (cells) look = layerOver(this, cells, col, row, look, true, this.renderer.pinAt(col, row) !== undefined);
    let exact = !!(cells && tintedEntry(this.cellsOf(cells).get(key), this.renderStyle)) || this.renderer.pinAt(col, row) !== undefined; // as the renderer's upper walk (#exactUnder)
    // The stored pixels under the upper layers, as the PIXEL view shows them (Renderer.#pixelsUnder): the picture's with
    // the lower group's paint, then each upper layer's paint or shapes over them. What paint and shapes convert over.
    const under = [hex2rgb(this.baseColorAt(col, 2 * row)), hex2rgb(this.baseColorAt(col, 2 * row + 1))];
    const lay = (top, bottom) => { if (top) under[0] = over(under[0], top); if (bottom) under[1] = over(under[1], bottom); };
    if (cells) lay(this.paintOf(cells)?.pixelAt(col, 2 * row), this.paintOf(cells)?.pixelAt(col, 2 * row + 1));
    // The look with paint pixels (or shape pixels) top and bottom over base's two halves, as the ASCII styles show it:
    // averaged, no BG. The base: a character's own background and foreground where the paint tints it (coverCell), else
    // the pixels under (#paintOver's convert path).
    const asciiOver = (top, bottom, base = under) => {
      const [t, b] = base.map((half, k) => { const px = k ? bottom : top; return px ? over(half, px) : half; });
      return { char: look.char, fg: rgb2hex(mix(t, b, 0.5)) };
    };
    const tinted = () => exact && !isSolidGlyph(look.char ?? ' ') && !opensToPaint({ char: look.char ?? ' ', fg: { hex: look.fg }, bg: { hex: storedBlack(this.processParams) } }, this.renderStyle);
    for (const id of through ? upper.slice(0, upper.indexOf(through) + 1) : upper) {
      if (this.layerById(id).kind === 'cells') {
        const paint = this.paintOf(id), top = paint?.pixelAt(col, 2 * row), bottom = paint?.pixelAt(col, 2 * row + 1);
        const own = this.cellsOf(id).get(key);
        look = layerOver(this, id, col, row, look, !ascii, exact);
        if (shownEntry(own, this.renderStyle)) exact = !isFrozen(own); // as #upperCell: a frozen cell is paint to what's over it
        if (!ascii) { lay(top, bottom); continue; }
        if (isFrozen(own)) { lay(top, bottom); continue; } // and its own paint under it is what it stands for
        if (top || bottom) look = asciiOver(top, bottom, tinted() ? [hex2rgb(storedBlack(this.processParams)), hex2rgb(look.fg)] : under);
        lay(top, bottom);
        continue;
      }
      const shapes = this._upperShapes.get(id), char = shapes?.charAt(col, row);
      if (char === undefined) continue;
      const top = this.renderer.upperStoredAt(shapes, col, 2 * row), bottom = this.renderer.upperStoredAt(shapes, col, 2 * row + 1);
      exact = char !== null;
      const was = [under[0], under[1]];
      lay(top, bottom);
      const own = this.layerParams.get(id);
      if (char === null && (resolves(own) || (own.dither > 0 && this.renderer.palette?.length))) { // Best match's, By shape's or Dither's colors, not its halves'
        const cell = levelAt(this, id, col, row, through, shown, batch);
        if (cell) {
          look = { char: look.char, fg: storedHexOf(this, cell.fg), bg: ascii ? look.bg : storedHexOf(this, cell.bg) };
          continue;
        }
      }
      if (ascii) { // as buildCell lays them: shapes over the pixels under, averaged, no BG
        look = { ...asciiOver(top, bottom, was), char: char ?? look.char };
        continue;
      }
      if (top) look = { ...look, bg: rgb2hex(over(hex2rgb(look.bg), top)) };
      if (bottom) look = { ...look, fg: rgb2hex(over(hex2rgb(look.fg), bottom)) };
    }
    // Colors that show as shown's: the look in stored colors can show a palette color, or a step, off it under the
    // sliders (the pipeline adjusts pixels before it averages them into a cell). Monochrome ASCII's colors don't show.
    const colored = shown && this.renderStyle !== 'ascii', memo = batch && (batch.asked ??= new Map());
    const fg = colored ? shownAs(this, look.fg, shown.fg.hex, { reach: true, memo }) : look.fg;
    const bg = colored && !ascii && look.bg !== undefined ? shownAs(this, look.bg, shown.bg.hex, { reach: true, memo }) : look.bg;
    return { char: !shown || shown.wide === 'trail' ? ' ' : shown.char, fg, bg };
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
  // where that shows as it, so it follows the adjustments as the picture does, else one that does; and the 256-color index
  // a color shows as when a lower index shares it (fgIndex, bgIndex: a pin's, as 16 and 231 are kept).
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
      const fgIndex = sharedIndex(shown.fg.c, palette), bgIndex = sharedIndex(shown.bg.c, palette);
      return { char: shown.char, bg: as(shown.bg, bg), fg: as(shown.fg, fg), ...(fgIndex !== undefined && { fgIndex }), ...(bgIndex !== undefined && { bgIndex }) };
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
