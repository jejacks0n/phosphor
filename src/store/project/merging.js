// Moving things between the layers and into the image: Merge down (a layer into the one under it, exactly or into
// the image), Bake (the picture as it looks becomes the image) and Flatten (what shows becomes plain cells).
// Owns _baking and _merging (one at a time: a second call while one runs is ignored). Both wait on
// image encoding; anything changed meanwhile (an edit, a slider, an undo, the other one landing)
// and they start over from what shows then. An artist's change doesn't count as one, as starting over
// for those would never end under steady drawing. Bake reads the layers after it encodes, so what came
// meanwhile is in it; Into the image reads them before, so a host holds artists' changes until the project's gone.
import { t } from '@/i18n';
import { toast } from '@/composables/useToast';
import { EMPTY_BASE, withPins, withoutPins } from '@/document/baseRecords.js';
import { cellState } from '@/document/frames.js';
import { makeArt, isArt } from '@/document/artLayers.js';
import { finerStops, isGradient, isShape, shapeBounds, withShape } from '@/document/shapes.js';
import { cellKey, parseKey, bakeEditCells, bakeEntry, mergeKind } from '@/document/editCells.js';
import { loadImage } from '@/document/projectIO.js';
import { ctx2d, canvasPng } from '@/lib/Canvas.js';
import { cellIndex, charRowsOf, halfColors } from '@/lib/Cells.js';
import { rgb2hex, hex2rgb } from '@/lib/ColorUtils.js';
import { processedImage, workingScale, fittingScale } from '@/lib/ImageProcessor.js';
import { bakedCanvas, getEffectiveColor } from '@/lib/PixelTransforms.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { copyOf, over, bytesHeld, blackPicture, layerName, levelCells, paintFrom, putStack, refusedHidden, refusedInRoom, stackState } from '@/store/project/shared.js';
import { lowerGroup, sameChars } from '@/document/layerInfo.js';
import { placedShapes } from '@/document/followers.js';
import { CHAR_KEYS, RESET_GROUPS, getSetting, groupDefaults } from '@/store/settings.js';
import { shallowRef, toRaw } from 'vue';

const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// A shape with the color transforms burnt into its fill and stroke; a gradient's sampled finer first, since the
// sliders aren't straight between its stops.
const bakedPaint = (paint, params) => (isGradient(paint)
  ? { ...paint, stops: finerStops(paint.stops).map(([o, c]) => [o, getEffectiveColor(c, params)]) }
  : paint && getEffectiveColor(paint, params));
const bakedArt = (shape, params) => makeArt({
  ...shape, art: { ...shape.art, cells: shape.art.cells.map(([i, char, top, bottom]) => [i, char, top && getEffectiveColor(top, params), bottom && getEffectiveColor(bottom, params)]) },
});
const bakedShape = (shape, params) => isArt(shape) ? bakedArt(shape, params) : withShape(shape, { fill: bakedPaint(shape.fill, params), stroke: bakedPaint(shape.stroke, params) });
const bakedShapes = (shapes, params) => new Map([...shapes].map(([key, shape]) => [key, bakedShape(shape, params)]));

// A frame's changes with the color transforms burnt in, as Bake does to the edit layer: a stored color, then
// its paint's alpha back on it.
function bakedChanges(changes, params) {
  const baked = (rgba) => {
    if (!rgba) return 0;
    const { r, g, b } = hex2rgb(getEffectiveColor(rgb2hex({ r: rgba >>> 24, g: (rgba >>> 16) & 0xff, b: (rgba >>> 8) & 0xff }), params));
    return ((r << 24) | (g << 16) | (b << 8) | (rgba & 0xff)) >>> 0;
  };
  const entry = (cell) => cell && (isShape(cell) ? bakedShape(cell, params) : bakeEntry(cell, params));
  return new Map([...changes].map(([key, { cell, top, bottom }]) => [key, cellState(entry(cell), baked(top), baked(bottom))]));
}

// The clipboard with the color transforms burnt in, as Bake and Flatten leave it.
const bakedClipboard = (clip, params) => clip && {
  ...clip,
  ...(clip.cells && { cells: clip.cells.map(entry => entry && bakeEntry(entry, params)) }),
  ...(clip.looks && { looks: clip.looks.map(entry => bakeEntry(entry, params)) }),
  ...(clip.shown && { shown: clip.shown.map((entry) => entry && bakeEntry(entry, params)) }),
  ...(clip.paint && { paint: bakedCanvas(clip.paint, params) }),
  ...(clip.parts && { parts: clip.parts.map((part) => ({ ...part, cells: part.cells.map((entry) => entry && bakeEntry(entry, params)), ...(part.paint && { paint: bakedCanvas(part.paint, params) }) })) }),
  ...(clip.base && { base: { ...clip.base, pixels: bakedCanvas(clip.base.pixels, params), colors: bakedCanvas(clip.base.colors, params) } }),
};

// The settings Flatten puts back so nothing converts any more: the sliders, the art style, Dither, the character choice.
const FLATTENED = ['renderStyle', 'dither', 'charChoice', 'charChoiceAscii'];

// The stack (stackState's) with the layer with the id gone, or with its data replaced.
const without = ({ layers, data }, id) => ({ layers: layers.filter((layer) => layer.id !== id), data: new Map([...data].filter(([key]) => key !== id)) });
const withData = ({ layers, data }, id, own) => ({ layers, data: new Map(data).set(id, own) });
// The stack after a merge took what it could off the layer with the id, own (its data) being what's left: it leaves the
// stack when that's nothing and the whole layer merged (rect: a selection's didn't), outside a room, which keeps its layers.
const leftOn = (project, stack, id, rect, own) => (!rect && !project._sharing && !own.editCells.size && !own.hasPaint ? without(stack, id) : withData(stack, id, own));

// A merge's step, already worked out: before and after hold what it changes (base, a snapshot; baseRecords; shapes; stack,
// stackState's), put in place now. One whole-layer step that can change the stack (layerOp).
function mergeStep(project, before, after, bytes) {
  const apply = (state) => {
    if ('base' in state) project.baseLayer.restore(state.base);
    if (state.baseRecords) project.setBaseRecords(state.baseRecords);
    if (state.shapes) project.shapes = state.shapes;
    putStack(project, state.stack);
    project.render();
  };
  apply(after);
  project.pushWholeLayer(() => apply(before), () => apply(after), bytes, { layerOp: true });
  return true;
}
const onLayerId = (id) => ([, shape]) => (shape.layer ?? 'vector') === id;

// Merge down of the cells layer with the id into the base layer's pixels exactly as it shows: each entry as its background
// (top) and foreground (bottom) pixels with its character pinned (a cell that showed a different character, ▄ for a solid
// one under paint, as its two half colors with the shown character pinned), then its paint over them, a grid pixel at a
// time as it shows. Paint over a pinned cell (an erased one's space) pins what it shows too. Nothing is resampled or put
// through the effects. Entries past the grid (after a canvas resize shrank it) or outside rect stay on the layer.
function onBase(project, id, rect) {
  const cells = project.cellsOf(id), paint = project.paintOf(id), rows = charRowsOf(project.rows);
  const inRect = (col, row) => !rect || (col >= rect.c0 && col <= rect.c1 && row >= rect.r0 && row <= rect.r1);
  const level = levelCells(project, id), shownChar = (col, row) => level[cellIndex(col, row, project.cols)]?.char;
  const painted = (col, row) => !!(paint?.colorAt(col, 2 * row) || paint?.colorAt(col, 2 * row + 1));
  const merged = [];   // { col, row, top, bottom, char }: the entries, under the paint
  const kept = new Map();
  for (const [key, entry] of cells) {
    const { col, row } = parseKey(key);
    if (col >= project.cols || row >= rows || !inRect(col, row)) kept.set(key, entry);
    else merged.push(project.mergeCellOf(col, row, entry, shownChar(col, row)));
  }
  if (rect && !merged.length && !paint?.hasPaintIn(rect)) return false; // nothing drawn inside: no empty undo step
  const paintedPins = [...project.baseRecords.pins.keys()].map(parseKey)
    .filter(({ col, row }) => inRect(col, row) && !cells.has(cellKey(col, row)) && painted(col, row))
    .map(({ col, row }) => ({ col, row, char: shownChar(col, row) ?? '▄' }));

  const before = { base: project.baseLayer.snapshot(), baseRecords: project.baseRecords, stack: stackState(project) };
  const pixels = merged.flatMap(({ col, row, top, bottom }) => [{ x: col, y: 2 * row, ...top, alpha: 1 }, { x: col, y: 2 * row + 1, ...bottom, alpha: 1 }]);
  project.baseLayer.erase(pixels);
  project.baseLayer.paint(pixels);
  if (paint?.hasPaint) project.baseLayer.drawOver(paint, rect);
  const left = paint && paintFrom(paint, rect ? paint.snapshot() : null);
  if (rect) left?.clearCells(rect);
  const pins = [...merged.map(({ col, row, char }) => ({ col, row, char })), ...paintedPins];
  const after = {
    base: project.baseLayer.snapshot(), baseRecords: withPins(before.baseRecords, pins),
    stack: leftOn(project, before.stack, id, rect, { editCells: kept, paintLayer: left, hasPaint: !!left?.hasPaint }),
  };
  return mergeStep(project, before, after, bytesHeld(before.base, after.base, left, kept));
}

// Merge down of the vector layer with the id on the bottom: its shapes (those touching rect where they show, or keys, or
// all), with those beneath on it that overlap them, pressed into the base layer's pixels, where they stop being shapes.
function pressLayer(project, id, rect, keys) {
  const area = rect && { x: rect.c0, y: 2 * rect.r0, w: rect.c1 - rect.c0 + 1, h: 2 * (rect.r1 - rect.r0 + 1) };
  const named = keys ?? [...placedShapes(project)].filter(onLayerId(id)).filter(([, shape]) => !area || meets(shapeBounds(shape), area)).map(([key]) => key);
  // The whole layer goes too, unless it has guides: they're never pressed, so the layer stays with them.
  const guided = [...project.shapes].some((entry) => onLayerId(id)(entry) && entry[1].guide);
  const pressed = project.pressedKeys(named, id), whole = !rect && !keys && !project._sharing && !guided;
  if (!pressed.size && !whole) return false; // none, or guides alone with no followers: nothing to press, and no step
  const before = { base: project.baseLayer.snapshot(), shapes: project.shapes, baseRecords: project.baseRecords, stack: stackState(project) };
  const done = pressed.size ? project.pressShapes(pressed) : { base: before.base, shapes: project.shapes, baseRecords: project.baseRecords };
  const after = { ...done, stack: whole ? without(before.stack, id) : before.stack };
  return mergeStep(project, before, after, bytesHeld(before.base, after.base));
}

// The paint layer under a merged layer, a new one: its own paint (if any) with the cells merged in erased (they show what
// the layer above showed now) and the paint from above (from, if any) drawn over it, inside rect or all of it.
function mergedPaint(project, into, erased, from, rect) {
  const paint = paintFrom(project.paintLayer, into?.hasPaint ? into.snapshot() : null);
  paint.erase(erased);
  if (from?.hasPaint) paint.drawOver(from, rect);
  return paint;
}
const halvesOf = (col, row) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }];

// The cells at indexes as they show up to the upper layer with the id (the renderer's upper walk stopped there), each
// written as an exact cell: the character that shows there, and the stored colors that show as it (storedLookAt up to the
// layer, or a shown color itself where it shows as itself, as at neutral sliders). A later palette or character setting
// doesn't convert it again (frozen). Maps 'col,row' to the cell.
function frozenCells(project, id, indexes) {
  const frozen = new Map();
  if (!indexes.length) return frozen;
  const level = levelCells(project, id, indexes), params = project.processParams, cols = project.cols;
  const as = (stored, target) => (target && project.renderer.effective(target, params).hex.toLowerCase() === target.toLowerCase() ? target : stored);
  for (const i of indexes) {
    const col = i % cols, row = (i - col) / cols, shown = level[i], look = project.storedLookAt(col, row, { through: id, shown });
    frozen.set(cellKey(col, row), { ...look, fg: as(look.fg, shown.fg?.hex), ...(look.bg !== undefined && { bg: as(look.bg, shown.bg?.hex) }) });
  }
  return frozen;
}

// Merge down of the cells layer with the id into the cells layer under it (inside rect, or all of it), so that what shows
// doesn't change: each entry completed against the look under it (completeAt) and written there, where that layer's paint
// is erased, and its paint drawn over the paint under it. Where its paint lies over a cell it has no entry for, that cell
// goes in frozen as it shows (frozenCells) and the paint there with it: laid over again, paint on paint over a converted
// cell would convert once instead of twice, and show otherwise. Entries past the grid go in as they are.
function onCells(project, id, under, rect) {
  const cells = project.cellsOf(id), paint = project.paintOf(id), rows = charRowsOf(project.rows), { cols } = project;
  const inRect = (col, row) => !rect || (col >= rect.c0 && col <= rect.c1 && row >= rect.r0 && row <= rect.r1);
  const next = new Map(project.cellsOf(under)), kept = new Map(), erased = [];
  for (const [key, entry] of cells) {
    const { col, row } = parseKey(key);
    if (!inRect(col, row)) kept.set(key, entry);
    else if (col >= cols || row >= rows) next.set(key, entry);
    else {
      next.set(key, project.completeAt(col, row, entry, id));
      erased.push(...halvesOf(col, row));
    }
  }
  const painted = [];
  if (paint?.hasPaint) {
    const r = rect ?? project.gridRect();
    for (let row = r.r0; row <= r.r1; row++) for (let col = r.c0; col <= r.c1; col++) {
      if (!cells.has(cellKey(col, row)) && (paint.colorAt(col, 2 * row) || paint.colorAt(col, 2 * row + 1))) painted.push(row * cols + col);
    }
  }
  if (rect && !erased.length && !painted.length) return false; // nothing drawn inside: no empty undo step
  const frozen = frozenCells(project, id, painted);
  const from = paint && paintFrom(paint, paint.snapshot());
  for (const [key, cell] of frozen) {
    const { col, row } = parseKey(key);
    next.set(key, cell);
    erased.push(...halvesOf(col, row));
    from.erase(halvesOf(col, row));
  }
  const before = { stack: stackState(project) };
  const into = mergedPaint(project, project.paintOf(under), erased, from, rect);
  const left = rect && paint ? paintFrom(paint, paint.snapshot()) : null;
  left?.clearCells(rect);
  let stack = withData(before.stack, under, { editCells: next, paintLayer: into, hasPaint: into.hasPaint });
  stack = rect ? withData(stack, id, { editCells: kept, paintLayer: left, hasPaint: !!left?.hasPaint }) : without(stack, id);
  return mergeStep(project, before, { stack }, bytesHeld(into, next, left, kept));
}

// Merge down of the vector layer with the id into the cells layer under it: every cell its shapes reach is written there
// frozen, exactly as it shows (frozenCells), where that layer's paint is erased, and the layer and its shapes go (its guides,
// which draw nothing, stay, and the layer with them).
function freezeLayer(project, id, under) {
  project.syncShapeLayers();
  const shapes = project._upperShapes.get(id), { cols } = project, reached = [];
  if (shapes?.drawsShapes) {
    for (let row = 0, rows = charRowsOf(project.rows); row < rows; row++) for (let col = 0; col < cols; col++) if (shapes.charAt(col, row) !== undefined) reached.push(row * cols + col);
  }
  const frozen = frozenCells(project, id, reached), erased = [...frozen.keys()].flatMap((key) => { const { col, row } = parseKey(key); return halvesOf(col, row); });
  const before = { stack: stackState(project), shapes: project.shapes };
  const into = mergedPaint(project, project.paintOf(under), erased, null, null), next = new Map([...project.cellsOf(under), ...frozen]);
  const kept = new Map([...project.shapes].filter((entry) => !onLayerId(id)(entry) || entry[1].guide)); // guides draw nothing: they stay
  const merged = withData(before.stack, under, { editCells: next, paintLayer: into, hasPaint: into.hasPaint });
  const guided = [...kept].some(onLayerId(id));
  const after = { stack: guided ? merged : without(merged, id), shapes: kept };
  return mergeStep(project, before, after, bytesHeld(into, next));
}

export const mergingActions = {
  // Bake: the picture as it shows becomes the image and the Transform, Adjustment and Effect
  // sliders go back to neutral, with nothing on the canvas changing. The image is what the
  // preview is made from (the processed image at its processing size; the palette isn't baked,
  // it keeps applying). Under CGA/VGA that can tip a cell near a palette boundary (8-bit rounding);
  // lockPalette bakes the palette into the image instead, so nothing moves, but the picture keeps
  // only the palette's colors. Dithered, or with Best match or By shape, CGA/VGA snap on the grid (as other palettes do): exact either way. The color transforms also tint the drawing when it's shown, so they're
  // burnt into it (paint, the base's own pixels, edit cells) and into the color pair and the
  // clipboard; recent colors are shared across projects and stay. One undo step (slider moves after
  // it are steps of their own).
  async bake({ lockPalette = false } = {}) {
    // The vector layers on the bottom are pressed in: a hidden one's shapes would be lost, so it's refused (refusedHidden).
    if (!this.canBake || this._baking || refusedHidden(this, ['base', ...lowerGroup(this.layers, this.baseChars).vectors])) return;
    if (this._artInside) this.leaveArt(); // a whole-layer step: on the drawing, not the art layer you're in
    this._baking = true;
    let again = false;
    try {
      this.ensureLayer();
      this.commitPending();
      this.noteFrame();
      const workspace = useWorkspaceStore();
      const params = this.processParams;
      const doc = this._document, version = this.history.version, frame = this.frame;

      const canvas = await processedImage(this.image, params, { snap: lockPalette });
      const blob = await canvasPng(canvas);
      const image = await loadImage(blob);
      const imageBuffer = await blob.arrayBuffer();
      // Meanwhile: another document is left alone; a change to this one (a stroke begun is closed
      // now, so its undo isn't recorded against the baked layers) means baking what shows now.
      if (this._document !== doc) return;
      this.commitPending();
      if (this.image !== params.image || this.history.version !== version || this.frame !== frame) {
        again = true;
        return;
      }

      const defaults = Object.assign({}, ...RESET_GROUPS.map(groupDefaults));
      const sliders = (from = this) => Object.fromEntries(Object.keys(defaults).map(key => [key, from[key]]));
      const baked = (snapshot) => snapshot && { ...snapshot, canvas: bakedCanvas(snapshot.canvas, params) };
      const clip = toRaw(workspace.clipboard);
      const before = {
        image: this.image, imageBuffer: this.imageBuffer, workingCopy: this.imageIsWorkingCopy, sliders: sliders(params), // what it was baked with
        base: this.baseLayer.snapshot(), stack: stackState(this), shapes: this.shapes, baseRecords: this.baseRecords,
        fg: workspace.editFgColor, bg: workspace.editBgColor, clipboard: clip,
        frames: this.hasFrames && this.frames.map(({ kind, changes }) => ({ kind, changes })),
      };
      // A still's shapes on the vector layers on the bottom are pressed into the base (pressShapes takes only those); the
      // rest, and an animation's, stay shapes, in baked colors. Every cells layer's colors are baked.
      const pressed = !this.hasFrames && this.shapes.size ? this.pressShapes(new Set(this.shapes.keys())) : null;
      const bakedData = ({ editCells, paintLayer, hasPaint }) => ({
        editCells: bakeEditCells(editCells, params), hasPaint,
        paintLayer: paintLayer?.hasPaint ? paintFrom(paintLayer, baked(paintLayer.snapshot())) : paintLayer,
      });
      const after = {
        image, imageBuffer, workingCopy: true, sliders: defaults,
        base: baked(pressed?.base ?? before.base), stack: { data: new Map([...before.stack.data].map(([id, data]) => [id, bakedData(data)])) },
        shapes: bakedShapes(pressed ? pressed.shapes : this.shapes, params), baseRecords: pressed?.baseRecords ?? this.baseRecords,
        fg: getEffectiveColor(before.fg, params), bg: getEffectiveColor(before.bg, params),
        clipboard: bakedClipboard(clip, params),
        frames: before.frames && before.frames.map(({ kind, changes }) => ({ kind, changes: bakedChanges(changes, params) })),
      };

      // The color pair and the clipboard swap only while they hold what the other side left: a
      // color picked or a block copied since is kept.
      const apply = (state, from) => {
        this.$patch({ image: shallowRef(state.image), imageBuffer: state.imageBuffer, imageIsWorkingCopy: state.workingCopy, ...state.sliders });
        this.baseLayer.restore(state.base);
        putStack(this, state.stack);
        this.shapes = state.shapes;
        this.setBaseRecords(state.baseRecords);
        if (workspace.editFgColor === from.fg) workspace.editFgColor = state.fg;
        if (workspace.editBgColor === from.bg) workspace.editBgColor = state.bg;
        if (toRaw(workspace.clipboard) === from.clipboard) workspace.clipboard = state.clipboard;
        if (state.frames) this.setAllFrames(state.frames);
        this.render();
      };
      apply(after, before);
      const layersHeld = [...after.stack.data.values()].flatMap(({ editCells, paintLayer }) => [editCells, paintLayer?.hasPaint && paintLayer]);
      this.pushWholeLayer(() => apply(before, after), () => apply(after, before), bytesHeld(before.base, before.image, before.imageBuffer, after.base, after.image, after.imageBuffer, ...layersHeld, ...(after.frames || []).map(({ changes }) => changes)), { everyFrame: true });
    } catch (e) {
      console.error('Failed to bake', e);
      alert(t('document.bakeFailed'));
    } finally {
      this._baking = false;
      if (again) await this.bake({ lockPalette });
    }
  },

  // Flatten: everything the drawing shows (the picture as converted, every shown layer) becomes plain ANSI cells exactly
  // as they show, on a cells layer over a black base (layer 'edit', the layer with that id, made when there's none) or
  // stamped onto the base with every character pinned ('base'), and the image is a black picture. Every other layer goes,
  // hidden ones too (the dialog says so first), what's left shows, and its character settings are the base's. The
  // settings that convert go back (the sliders, the art style to ANSI, Dither, the character choice); a Number palette is
  // kept as its colors, so it isn't picked again from the black, and Color ASCII's in-between colors go full color.
  // Nothing on the canvas changes. Cells past a shrunk grid's edge stay, on the cells layer. Off with frames: the picture
  // is under every one. One undo step; true when it flattened.
  async flattenDrawing({ layer = 'edit' } = {}) {
    if (!this.canFlatten || this._flattening || this._baking || this._merging) return false;
    if (this._artInside) this.leaveArt();
    this._flattening = true;
    let again = false, base = null; // the base as it was, once this starts writing it
    try {
      this.ensureLayer();
      this.commitPending();
      const workspace = useWorkspaceStore();
      const params = this.processParams;
      const doc = this._document, version = this.history.version, image = this.image;
      const picture = await blackPicture(this.cols, this.rows, this.baseLayer.scale); // the same processing scale
      if (this._document !== doc) return false;
      this.commitPending();
      if (this.image !== image || this.history.version !== version || !this.canFlatten) {
        again = true;
        return false;
      }

      const { cols } = this, rows = charRowsOf(this.rows);
      const grid = []; // { col, row, char, fg, bg }: each cell as it shows, a wide character's trail a space in its colors
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = this.cells[row * cols + col];
          grid.push({ col, row, char: cell.wide === 'trail' ? ' ' : cell.char, fg: cell.fg.hex, bg: cell.bg.hex });
        }
      }
      const stack = stackState(this);
      const past = this.layers.flatMap(({ id }) => [...stack.data.get(id)?.editCells ?? []]).filter(([key]) => { const { col, row } = parseKey(key); return col >= cols || row >= rows; });

      const defaults = { ...Object.assign({}, ...RESET_GROUPS.map(groupDefaults)), ...Object.fromEntries(FLATTENED.map((key) => [key, getSetting(key).default])) };
      const kept = (from) => ({ ...Object.fromEntries(Object.keys(defaults).map((key) => [key, from[key]])), quantize: from.quantize, palette: from.palette });
      const clip = toRaw(workspace.clipboard);
      const before = {
        image, imageBuffer: this.imageBuffer, workingCopy: this.imageIsWorkingCopy, fit: this.fit && { ...toRaw(this.fit) }, settings: kept(this),
        base: this.baseLayer.snapshot(), stack, shapes: this.shapes, baseRecords: this.baseRecords,
        fg: workspace.editFgColor, bg: workspace.editBgColor, clipboard: clip,
      };
      // The palette stays while it has every color the cells show (a Number palette as its colors, so it isn't picked
      // again from the black); a color off it (Color ASCII's averages, Monochrome ASCII's white) and it'd snap: full color.
      const palette = this.renderer.palette ?? [], inPalette = new Set(palette.map((p) => p.hex.toLowerCase()));
      const offPalette = palette.length > 0 && grid.some(({ fg, bg }) => !inPalette.has(fg.toLowerCase()) || !inPalette.has(bg.toLowerCase()));
      const counted = this.quantize === 'count' && palette.length > 0;
      const settings = { ...defaults, quantize: offPalette ? 'none' : counted ? 'palette' : this.quantize, palette: counted && !offPalette ? palette.map((p) => p.hex.toUpperCase()).join(' ') : this.palette };

      // The layers left: the bottom, and for 'edit' the edit layer (as it was, or a new one), each shown, with the base's
      // character settings as they come out.
      const chars = Object.freeze(Object.fromEntries(CHAR_KEYS.map((key) => [key, key in settings ? settings[key] : this[key]])));
      const edit = this.layerById('edit') ?? { id: 'edit', kind: 'cells', n: 1, name: null };
      const layers = [Object.freeze({ ...this.layers[0], hidden: false }), ...(layer === 'edit' ? [Object.freeze({ ...edit, hidden: false, chars })] : [])];
      const editCells = new Map([...(layer === 'edit' ? grid.map(({ col, row, char, fg, bg }) => [cellKey(col, row), { char, fg, bg }]) : []), ...bakeEditCells(new Map(past), params)]);

      // The base: black for the edit layer's grid, or the grid's cells as Merge down writes them (writeBaseCells).
      base = before.base;
      this.baseLayer.restore(null);
      if (layer === 'base') this.baseLayer.paint(grid.flatMap(({ col, row, fg, bg }) => [{ x: col, y: 2 * row, ...hex2rgb(bg), alpha: 1 }, { x: col, y: 2 * row + 1, ...hex2rgb(fg), alpha: 1 }]));
      const after = {
        image: picture.image, imageBuffer: picture.imageBuffer, workingCopy: true, fit: { dx: 0, dy: 0, dw: cols, dh: this.rows }, settings,
        base: this.baseLayer.snapshot(), shapes: new Map(),
        stack: { layers, data: new Map(layer === 'edit' ? [['edit', { editCells, paintLayer: paintFrom(this.paintLayer), hasPaint: false }]] : []) },
        baseRecords: layer === 'base' ? withPins(EMPTY_BASE, grid.map(({ col, row, char }) => ({ col, row, char }))) : EMPTY_BASE,
        fg: getEffectiveColor(before.fg, params), bg: getEffectiveColor(before.bg, params), clipboard: bakedClipboard(clip, params),
      };

      // The color pair and the clipboard swap only while they hold what the other side left (as Bake's).
      const apply = (state, from) => {
        this.$patch({ image: shallowRef(state.image), imageBuffer: state.imageBuffer, imageIsWorkingCopy: state.workingCopy, ...state.settings });
        this.fit = state.fit && { ...state.fit }; // set, not patched: a patch would merge into the object before holds
        this.baseLayer.restore(state.base);
        this.shapes = state.shapes;
        this.setBaseRecords(state.baseRecords);
        putStack(this, state.stack);
        if (workspace.editFgColor === from.fg) workspace.editFgColor = state.fg;
        if (workspace.editBgColor === from.bg) workspace.editBgColor = state.bg;
        if (toRaw(workspace.clipboard) === from.clipboard) workspace.clipboard = state.clipboard;
        this.render();
      };
      apply(after, before);
      workspace.pickLayer(layer); // the layer it's on now
      this.pushWholeLayer(() => apply(before, after), () => apply(after, before), bytesHeld(before.base, before.image, before.imageBuffer, after.base, after.image, after.imageBuffer, editCells), { everyFrame: true, layerOp: true });
      // The base layer holds each cell as its two halves, which the PIXEL tab would show as stripes: All cells shows
      // each as it looks, as after opening an ANSI file onto the base.
      if (layer === 'base') workspace.ansiOverlayAll = true;
      return true;
    } catch (e) {
      if (base) this.baseLayer.restore(base); // written before the step was recorded: the drawing stays as it was
      console.error('Failed to flatten', e);
      alert(t('document.flattenFailed'));
      return false;
    } finally {
      this._flattening = false;
      if (again) await this.flattenDrawing({ layer });
    }
  },

  // What merging a cell into the base shows: its two halves (top, bottom) under the paint, and
  // the character to pin. Color ASCII shows only the foreground (on black) and rebuilds it as the
  // halves' average; a cell showing another character than its own (▄ for a solid one under
  // paint) goes in as its two half colors.
  // entry: the cells layer's own there (the one in use's unless said); shown: the character it shows there, before the
  // wide layout, so a wide character's trail pins its own character, not its lead's (levelCells': what's over the layer
  // isn't in it).
  mergeCellOf(col, row, entry = this.editCellAt(col, row), shown = levelCells(this, this.editId)[cellIndex(col, row, this.cols)]?.char) {
    const cell = { ...this.baseCellAt(col, row), ...entry };
    const char = shown ?? cell.char;
    const [top, bottom] = this.renderStyle === 'colorAscii' ? [hex2rgb(cell.fg), hex2rgb(cell.fg)]
      : char === cell.char ? [hex2rgb(cell.bg), hex2rgb(cell.fg)]
        : halfColors({ char: cell.char, fg: hex2rgb(cell.fg), bg: hex2rgb(cell.bg) });
    return { col, row, top, bottom, char };
  },

  // Merge into the picture: the cells layer in use (inside rect, or all of it), directly on the bottom, becomes part of the image,
  // so every effect applies to it, live, like the photo. The image becomes the picture at its
  // working size (m processed pixels per grid pixel) with nothing applied, each picture cell
  // painted in as exact m x m blocks: the converter's own characters go in as they are and come
  // back from the picture; solid characters go in as they show, pinned to ▄; any other character,
  // and anything outside the picture's area (the letterbox), merges exactly (mergeKind). The
  // sliders aren't touched. One undo step, and the layer leaves the stack as Merge down's does.
  async mergeIntoPicture(rect = null) {
    const id = this.editId, below = this.layers[this.layers.findIndex((layer) => layer.id === id) - 1];
    if (!this.image || this._merging || this.hasFrames || !below || refusedHidden(this, [id, 'base'])) return;
    if (below.kind === 'vector') return void toast(t('toolbar.mergeOntoVector'));
    if (below.id !== 'base') return;
    if (this._artInside) this.leaveArt(); // a whole-layer step: on the drawing, not the art layer you're in
    this._merging = true;
    const sharing = this._sharing;
    sharing?.hold?.();
    let again = false;
    try {
      this.ensureLayer();
      this.commitPending();
      const params = this.processParams;
      const doc = this._document, version = this.history.version;
      const neutral = { ...params, ...Object.assign({}, ...RESET_GROUPS.map(groupDefaults)) };
      const fitNow = params.fit ?? this.fitFor(this.cols, this.rows);
      const m = fittingScale(workingScale(this.image, params) ?? Math.max(2, Math.floor(400 / Math.max(this.cols, this.rows))), fitNow.dw, fitNow.dh);
      // A picture too long for the GPU at a pixel a grid pixel can't take the drawing in whole pixels:
      // it merges exactly instead.
      if (m < 1) {
        this.mergeDown(id, rect);
        return;
      }
      const width = this.image.naturalWidth || this.image.width, height = this.image.naturalHeight || this.image.height;
      // Already at its working size (after a Bake or an earlier merge): its own pixels, exactly; a
      // render through the pipeline would round them a level here and there.
      const atSize = width === fitNow.dw * m && height === fitNow.dh * m;
      const canvas = atSize ? copyOf(this.image, width, height) : await processedImage(this.image, neutral, { m });
      // Meanwhile: another document is left alone; a change to this one means merging what shows now.
      if (this._document !== doc) return;
      this.commitPending();
      if (this.image !== params.image || this.history.version !== version) {
        again = true;
        return;
      }

      const fit = params.fit ?? this.fitFor(this.cols, this.rows);
      const rows = charRowsOf(this.rows);
      const inRect = (col, row) => !rect || (col >= rect.c0 && col <= rect.c1 && row >= rect.r0 && row <= rect.r1);
      const inPicture = (col, row) => col >= fit.dx && col < fit.dx + fit.dw && 2 * row >= fit.dy && 2 * row + 1 < fit.dy + fit.dh;

      // The paint at grid resolution, as stored (the Renderer draws it this way before adjusting it).
      const paint = document.createElement('canvas');
      paint.width = this.cols;
      paint.height = this.rows;
      const paintCtx = ctx2d(paint);
      paintCtx.imageSmoothingEnabled = false;
      const k = this.paintLayer.scale;
      paintCtx.drawImage(this.paintLayer.canvas, 0, 0, this.cols * k, this.rows * k, 0, 0, this.cols, this.rows);
      const paintData = paintCtx.getImageData(0, 0, this.cols, this.rows).data;
      const paintAt = (x, y) => {
        const o = (y * this.cols + x) * 4;
        return { r: paintData[o], g: paintData[o + 1], b: paintData[o + 2], a: paintData[o + 3] / 255 };
      };

      // The covered cells: edit cells and cells with paint, in the grid (and the rect).
      const covered = new Map();
      for (const key of this.editCells.keys()) {
        const { col, row } = parseKey(key);
        if (col < this.cols && row < rows && inRect(col, row)) covered.set(key, { col, row });
      }
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          if (inRect(col, row) && (paintAt(col, 2 * row).a || paintAt(col, 2 * row + 1).a)) covered.set(cellKey(col, row), { col, row });
        }
      }

      if (!covered.size) return; // nothing drawn (in the rect): no empty undo step
      const ctx = ctx2d(canvas), level = levelCells(this, id);
      const exactPixels = [], pictureCells = [], pins = [], unpins = [];
      for (const [key, { col, row }] of covered) {
        const entry = this.editCellAt(col, row);
        const pin = this.baseRecords.pins.get(key);
        const kind = mergeKind({ char: entry?.char ?? pin, renderStyle: this.renderStyle, inPicture: inPicture(col, row) });
        let top, bottom;
        if (kind === 'exact') {
          const merged = this.mergeCellOf(col, row, entry, level[cellIndex(col, row, this.cols)]?.char);
          ({ top, bottom } = merged);
          if (entry || pin) pins.push({ col, row, char: entry ? merged.char : level[cellIndex(col, row, this.cols)]?.char ?? pin });
        } else {
          const cell = { ...this.baseCellAt(col, row), ...entry };
          [top, bottom] = kind === 'picture' ? [hex2rgb(cell.bg), hex2rgb(cell.fg)]
            : halfColors({ char: cell.char, fg: hex2rgb(cell.fg), bg: hex2rgb(cell.bg) });
          if (kind === 'picture-pinned') pins.push({ col, row, char: '▄' });
          else unpins.push({ col, row });
          pictureCells.push({ col, row });
        }
        const shown = [over(top, paintAt(col, 2 * row)), over(bottom, paintAt(col, 2 * row + 1))];
        if (kind === 'exact') {
          exactPixels.push({ x: col, y: 2 * row, ...shown[0], alpha: 1 }, { x: col, y: 2 * row + 1, ...shown[1], alpha: 1 });
        } else {
          shown.forEach(({ r, g, b }, half) => {
            ctx.fillStyle = rgb2hex({ r, g, b });
            ctx.fillRect((col - fit.dx) * m, (2 * row + half - fit.dy) * m, m, m);
          });
        }
      }
      const blob = await canvasPng(canvas);
      const image = await loadImage(blob);
      const imageBuffer = await blob.arrayBuffer();
      // What's merged was read before encoding: a change since (or an edit still open) means it's stale.
      if (this._document !== doc) return;
      this.commitPending();
      if (this.image !== params.image || this.history.version !== version || this._sharing !== sharing || this.editId !== id) {
        again = true;
        return;
      }

      const before = {
        image: this.image, imageBuffer: this.imageBuffer, workingCopy: this.imageIsWorkingCopy,
        base: this.baseLayer.snapshot(), stack: stackState(this), baseRecords: this.baseRecords,
      };

      // The base: exact cells written as they show; picture cells' own pixels cleared (they're the
      // picture now). The layer keeps what's outside the rect (and past the grid).
      this.baseLayer.erase([...exactPixels, ...pictureCells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }])]);
      this.baseLayer.paint(exactPixels);
      // Paint past a shrunk grid's edge isn't in the picture: it stays, for when the grid grows back.
      const left = paintFrom(this.paintLayer, this.paintLayer.snapshot());
      left.clearCells(rect ?? this.gridRect());
      const kept = new Map([...this.editCells].filter(([key]) => !covered.has(key)));
      const after = {
        image, imageBuffer, workingCopy: true,
        base: this.baseLayer.snapshot(), stack: leftOn(this, before.stack, id, rect, { editCells: kept, paintLayer: left, hasPaint: left.hasPaint }),
        baseRecords: withPins(withoutPins(this.baseRecords, unpins), pins),
      };
      const apply = (state) => {
        this.$patch({ image: shallowRef(state.image), imageBuffer: state.imageBuffer, imageIsWorkingCopy: state.workingCopy });
        this.baseLayer.restore(state.base);
        this.setBaseRecords(state.baseRecords);
        putStack(this, state.stack);
        this.render();
      };
      apply(after);
      const bytes = bytesHeld(before.base, before.image, before.imageBuffer, after.base, left, after.image, after.imageBuffer, kept);
      this.pushWholeLayer(() => apply(before), () => apply(after), bytes, { layerOp: true });
    } catch (e) {
      console.error('Failed to merge into the image', e);
      alert(t('document.mergeIntoImageFailed'));
    } finally {
      sharing?.release?.();
      this._merging = false;
      if (again) await this.mergeIntoPicture(rect);
    }
  },

  // Merge down: the layer with the id into the one under it (docs/layers.md, "Moving things between layers"); whether it
  // merged. rect: only what's inside a cell rect (a selection's); keys: only those shapes of a vector layer (VECTOR's Merge
  // down of a selection); either way the layer stays with the rest. Off (false) for the bottom, with nothing under it, and
  // in an animation (the base is under every frame). Refused, with a toast saying why: onto a vector layer (Make art layer
  // does that), a hidden layer either side, onto a layer above the bottom in a room (which keeps its layers), a vector
  // layer with its own character settings onto the bottom (its shapes can't be pressed in as they show), and part of a
  // vector layer onto a cells layer above the bottom. Into the bottom: a cells layer exactly as it shows (onBase; the
  // toolbar asks first, Into the image the other way), a vector layer's shapes pressed into the base's pixels (pressLayer).
  // Into another cells layer: each entry completed against what shows under it and written there (onCells), and every
  // cell a vector layer's shapes reach frozen there exactly as it shows (freezeLayer). One whole-layer step; the merged
  // layer leaves the stack when it's left with nothing on it, outside a room (there it stays, emptied).
  mergeDown(id, rect = null, keys = null) {
    const at = this.layers.findIndex((layer) => layer.id === id), layer = this.layers[at], below = this.layers[at - 1];
    if (!(at > 0) || !this.image || this.hasFrames) return false;
    const refuse = (words) => {
      toast(words);
      return false;
    };
    if (refusedHidden(this, [id, below.id])) return false;
    if (below.kind === 'vector') return refuse(t('toolbar.mergeOntoVector'));
    if (below.id !== 'base' && refusedInRoom(this)) return false;
    if (layer.kind === 'vector' && below.id === 'base' && !sameChars(layer.chars, this.baseChars)) return refuse(t('toolbar.mergeOwnChars', { name: layerName(layer) }));
    if (layer.kind === 'vector' && below.id !== 'base' && (rect || keys)) return refuse(t('toolbar.mergeShapesWhole', { name: layerName(layer) }));
    if (this._artInside) this.leaveArt(); // a whole-layer step: on the drawing, not the art layer you're in
    this.ensureLayer();
    this.commitPending();
    if (layer.kind === 'vector') return below.id === 'base' ? pressLayer(this, id, rect, keys) : freezeLayer(this, id, below.id);
    return below.id === 'base' ? onBase(this, id, rect) : onCells(this, id, below.id, rect);
  },
};
