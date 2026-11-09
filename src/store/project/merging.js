// Moving things between the layers and into the image: Merge up (what the base shows becomes edit
// cells), Merge down exactly or into the image, and Bake (the picture as it looks becomes the image).
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
import { cellKey, parseKey, rectCells, updateRect, bakeEditCells, bakeEntry, mergeKind } from '@/document/editCells.js';
import { loadImage } from '@/document/projectIO.js';
import { ctx2d, canvasPng } from '@/lib/Canvas.js';
import { cellIndex, charRowsOf, halfColors } from '@/lib/Cells.js';
import { rgb2hex, hex2rgb } from '@/lib/ColorUtils.js';
import { processedImage, workingScale, fittingScale } from '@/lib/ImageProcessor.js';
import { bakedCanvas, getEffectiveColor } from '@/lib/PixelTransforms.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { copyOf, over, bytesHeld, blackPicture, onBottom, refusedHidden, refusedNoCells } from '@/store/project/shared.js';
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

// The clipboard with the color transforms burnt in, as Bake and Flatten leave it (what shapes showed is as it showed).
const bakedClipboard = (clip, params) => clip && {
  ...clip,
  ...(clip.cells && { cells: clip.cells.map(entry => entry && bakeEntry(entry, params)) }),
  ...(clip.looks && { looks: clip.looks.map(entry => bakeEntry(entry, params)) }),
  ...(clip.paint && { paint: bakedCanvas(clip.paint, params) }),
  ...(clip.parts && { parts: clip.parts.map((part) => ({ ...part, cells: part.cells.map((entry) => entry && bakeEntry(entry, params)), ...(part.paint && { paint: bakedCanvas(part.paint, params) }) })) }),
  ...(clip.base && { base: { ...clip.base, pixels: bakedCanvas(clip.base.pixels, params), colors: bakedCanvas(clip.base.colors, params) } }),
};

// The settings Flatten puts back so nothing converts any more: the sliders, the art style, Dither, the character choice.
const FLATTENED = ['renderStyle', 'dither', 'charChoice', 'charChoiceAscii'];

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
    if (!this.canBake || this._baking || refusedHidden(this, ['base', 'vector'])) return;
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
        paint: this.paintLayer.snapshot(), base: this.baseLayer.snapshot(), editCells: this.editCells, shapes: this.shapes, baseRecords: this.baseRecords,
        fg: workspace.editFgColor, bg: workspace.editBgColor, clipboard: clip,
        frames: this.hasFrames && this.frames.map(({ kind, changes }) => ({ kind, changes })),
      };
      // A still's shapes are pressed into the base; an animation's stay shapes, in baked colors.
      const pressed = !this.hasFrames && this.shapes.size ? this.pressShapes(new Set(this.shapes.keys())) : null;
      const after = {
        image, imageBuffer, workingCopy: true, sliders: defaults,
        paint: baked(before.paint), base: baked(pressed?.base ?? before.base), editCells: bakeEditCells(this.editCells, params),
        shapes: pressed ? pressed.shapes : bakedShapes(this.shapes, params), baseRecords: pressed?.baseRecords ?? this.baseRecords,
        fg: getEffectiveColor(before.fg, params), bg: getEffectiveColor(before.bg, params),
        clipboard: bakedClipboard(clip, params),
        frames: before.frames && before.frames.map(({ kind, changes }) => ({ kind, changes: bakedChanges(changes, params) })),
      };

      // The color pair and the clipboard swap only while they hold what the other side left: a
      // color picked or a block copied since is kept.
      const apply = (state, from) => {
        this.$patch({ image: shallowRef(state.image), imageBuffer: state.imageBuffer, imageIsWorkingCopy: state.workingCopy, ...state.sliders });
        this.paintLayer.restore(state.paint);
        this.baseLayer.restore(state.base);
        this.hasPaint = this.paintLayer.hasPaint;
        this.editCells = state.editCells;
        this.shapes = state.shapes;
        this.setBaseRecords(state.baseRecords);
        if (workspace.editFgColor === from.fg) workspace.editFgColor = state.fg;
        if (workspace.editBgColor === from.bg) workspace.editBgColor = state.bg;
        if (toRaw(workspace.clipboard) === from.clipboard) workspace.clipboard = state.clipboard;
        if (state.frames) this.setAllFrames(state.frames);
        this.render();
      };
      apply(after, before);
      this.pushWholeLayer(() => apply(before, after), () => apply(after, before), bytesHeld(before.paint, before.base, before.image, before.imageBuffer, after.paint, after.base, after.image, after.imageBuffer, after.editCells, ...(after.frames || []).map(({ changes }) => changes)), { everyFrame: true });
    } catch (e) {
      console.error('Failed to bake', e);
      alert(t('document.bakeFailed'));
    } finally {
      this._baking = false;
      if (again) await this.bake({ lockPalette });
    }
  },

  // Flatten: everything the drawing shows (the picture as converted, the shapes and art layers, the edit cells, the
  // paint) becomes plain ANSI cells exactly as they show, on the edit layer over a black base (layer 'edit') or
  // stamped onto the base with every character pinned ('base'), and the image is a black picture. The settings that
  // convert go back (the sliders, the art style to ANSI, Dither, the character choice); a Number palette is kept as
  // its colors, so it isn't picked again from the black, and Color ASCII's in-between colors go full color. Nothing on the canvas changes. Edit cells past a shrunk
  // grid's edge stay. Off with frames: the picture is under every one. One undo step; true when it flattened.
  async flattenDrawing({ layer = 'edit' } = {}) {
    if (!this.canFlatten || this._flattening || this._baking || this._merging) return false;
    if (this._artInside) this.leaveArt();
    if (layer === 'edit' && onBottom(this)) { // the base in use: onto the topmost cells layer instead
      const top = this.layers.findLast((each, at) => at && each.kind === 'cells');
      if (top) useWorkspaceStore().pickLayer(top.id);
    }
    if (layer === 'edit' && (onBottom(this) || refusedNoCells(this))) { // onto the cells layer in use: there's none
      if (onBottom(this)) toast(t('layers.noCellsLayer'));
      return false;
    }
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
      const past = [...this.editCells].filter(([key]) => { const { col, row } = parseKey(key); return col >= cols || row >= rows; });

      const defaults = { ...Object.assign({}, ...RESET_GROUPS.map(groupDefaults)), ...Object.fromEntries(FLATTENED.map((key) => [key, getSetting(key).default])) };
      const kept = (from) => ({ ...Object.fromEntries(Object.keys(defaults).map((key) => [key, from[key]])), quantize: from.quantize, palette: from.palette });
      const clip = toRaw(workspace.clipboard);
      const before = {
        image, imageBuffer: this.imageBuffer, workingCopy: this.imageIsWorkingCopy, fit: this.fit && { ...toRaw(this.fit) }, settings: kept(this),
        paint: this.paintLayer.snapshot(), base: this.baseLayer.snapshot(), editCells: this.editCells, shapes: this.shapes, baseRecords: this.baseRecords,
        fg: workspace.editFgColor, bg: workspace.editBgColor, clipboard: clip,
        chars: new Map(this.layers.map((each) => [each.id, each.chars])),
      };
      // The palette stays while it has every color the cells show (a Number palette as its colors, so it isn't picked
      // again from the black); a color off it (Color ASCII's averages, Monochrome ASCII's white) and it'd snap: full color.
      const palette = this.renderer.palette ?? [], inPalette = new Set(palette.map((p) => p.hex.toLowerCase()));
      const offPalette = palette.length > 0 && grid.some(({ fg, bg }) => !inPalette.has(fg.toLowerCase()) || !inPalette.has(bg.toLowerCase()));
      const counted = this.quantize === 'count' && palette.length > 0;
      const settings = { ...defaults, quantize: offPalette ? 'none' : counted ? 'palette' : this.quantize, palette: counted && !offPalette ? palette.map((p) => p.hex.toUpperCase()).join(' ') : this.palette };

      // The base: black for the edit layer's grid, or the grid's cells as Merge down writes them (writeBaseCells).
      base = before.base;
      this.baseLayer.restore(null);
      if (layer === 'base') this.baseLayer.paint(grid.flatMap(({ col, row, fg, bg }) => [{ x: col, y: 2 * row, ...hex2rgb(bg), alpha: 1 }, { x: col, y: 2 * row + 1, ...hex2rgb(fg), alpha: 1 }]));
      const after = {
        image: picture.image, imageBuffer: picture.imageBuffer, workingCopy: true, fit: { dx: 0, dy: 0, dw: cols, dh: this.rows }, settings,
        paint: null, base: this.baseLayer.snapshot(), shapes: new Map(),
        editCells: new Map([...(layer === 'edit' ? grid.map(({ col, row, char, fg, bg }) => [cellKey(col, row), { char, fg, bg }]) : []), ...bakeEditCells(new Map(past), params)]),
        baseRecords: layer === 'base' ? withPins(EMPTY_BASE, grid.map(({ col, row, char }) => ({ col, row, char }))) : EMPTY_BASE,
        fg: getEffectiveColor(before.fg, params), bg: getEffectiveColor(before.bg, params), clipboard: bakedClipboard(clip, params),
        // Nothing converts any more: every layer's character settings are the base's, as they come out.
        chars: new Map(this.layers.map((each) => [each.id, Object.freeze(Object.fromEntries(CHAR_KEYS.map((key) => [key, key in settings ? settings[key] : this[key]])))])),
      };

      // The color pair and the clipboard swap only while they hold what the other side left (as Bake's).
      const apply = (state, from) => {
        this.$patch({ image: shallowRef(state.image), imageBuffer: state.imageBuffer, imageIsWorkingCopy: state.workingCopy, ...state.settings });
        this.fit = state.fit && { ...state.fit }; // set, not patched: a patch would merge into the object before holds
        this.paintLayer.restore(state.paint);
        this.baseLayer.restore(state.base);
        this.hasPaint = this.paintLayer.hasPaint;
        this.editCells = state.editCells;
        this.shapes = state.shapes;
        this.setBaseRecords(state.baseRecords);
        this.layers = this.layers.map((each, at) => (at && state.chars.get(each.id) ? Object.freeze({ ...each, chars: state.chars.get(each.id) }) : each)); // by id: names and eyes since aren't undone
        if (workspace.editFgColor === from.fg) workspace.editFgColor = state.fg;
        if (workspace.editBgColor === from.bg) workspace.editBgColor = state.bg;
        if (toRaw(workspace.clipboard) === from.clipboard) workspace.clipboard = state.clipboard;
        this.render();
      };
      apply(after, before);
      this.pushWholeLayer(() => apply(before, after), () => apply(after, before), bytesHeld(before.paint, before.base, before.image, before.imageBuffer, after.base, after.image, after.imageBuffer, after.editCells));
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

  // Merge up: what the base shows in rect (or the whole grid) becomes edit cells (an edit cell's own
  // attributes stay), and pins there are dropped, since the characters are now edit cells. One undo step.
  mergeUp(rect) {
    if (refusedHidden(this)) return;
    if (this._artInside) this.leaveArt(); // a whole-layer step: on the drawing, not the art layer you're in
    if (refusedNoCells(this)) return;
    const area = rect ?? this.gridRect();
    this.selectionEdit([area], () => {
      this.editCells = updateRect(this.editCells, area, (col, row, entry) => this.completeAt(col, row, entry));
      if (!this.hasFrames) this.setBaseRecords(withoutPins(this.baseRecords, rectCells(area))); // the base is under every frame
    });
  },

  // Merge down: the whole edit layer goes into the base layer's pixels exactly as it shows: each
  // edit cell as its background (top) and foreground (bottom) pixels with its character pinned (a
  // cell that showed a different character, ▄ for a solid one under paint, as its two half colors
  // with the shown character pinned), then the paint over them, a grid pixel at a time as it
  // shows. Paint over a pinned cell (an erased one's space) pins what it shows too. Nothing is
  // resampled or put through the effects.
  // What merging a cell into the base shows: its two halves (top, bottom) under the paint, and
  // the character to pin. Color ASCII shows only the foreground (on black) and rebuilds it as the
  // halves' average; a cell showing another character than its own (▄ for a solid one under
  // paint) goes in as its two half colors.
  mergeCellOf(col, row) {
    const cell = { ...this.baseCellAt(col, row), ...this.editCellAt(col, row) };
    // Before the wide layout: a wide character's trail pins its own character, not its lead's.
    const char = this.composedCells[cellIndex(col, row, this.cols)]?.char ?? cell.char;
    const [top, bottom] = this.renderStyle === 'colorAscii' ? [hex2rgb(cell.fg), hex2rgb(cell.fg)]
      : char === cell.char ? [hex2rgb(cell.bg), hex2rgb(cell.fg)]
        : halfColors({ char: cell.char, fg: hex2rgb(cell.fg), bg: hex2rgb(cell.bg) });
    return { col, row, top, bottom, char };
  },

  // Merge into the picture: the edit layer (inside rect, or all of it) becomes part of the image,
  // so every effect applies to it, live, like the photo. The image becomes the picture at its
  // working size (m processed pixels per grid pixel) with nothing applied, each picture cell
  // painted in as exact m x m blocks: the converter's own characters go in as they are and come
  // back from the picture; solid characters go in as they show, pinned to ▄; any other character,
  // and anything outside the picture's area (the letterbox), merges exactly (mergeKind). The
  // sliders aren't touched. One undo step.
  async mergeIntoPicture(rect = null) {
    if (!this.image || this._merging || this.hasFrames || refusedHidden(this)) return;
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
        this.mergeDown(rect);
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
      const ctx = ctx2d(canvas);
      const exactPixels = [], pictureCells = [], pins = [], unpins = [];
      for (const [key, { col, row }] of covered) {
        const entry = this.editCellAt(col, row);
        const pin = this.baseRecords.pins.get(key);
        const kind = mergeKind({ char: entry?.char ?? pin, renderStyle: this.renderStyle, inPicture: inPicture(col, row) });
        let top, bottom;
        if (kind === 'exact') {
          ({ top, bottom } = this.mergeCellOf(col, row));
          if (entry || pin) pins.push({ col, row, char: entry ? this.mergeCellOf(col, row).char : this.composedCells[cellIndex(col, row, this.cols)]?.char ?? pin });
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
      if (this.image !== params.image || this.history.version !== version || this._sharing !== sharing) {
        again = true;
        return;
      }

      const before = {
        image: this.image, imageBuffer: this.imageBuffer, workingCopy: this.imageIsWorkingCopy,
        base: this.baseLayer.snapshot(), paint: this.paintLayer.snapshot(), editCells: this.editCells, baseRecords: this.baseRecords,
      };

      // The base: exact cells written as they show; picture cells' own pixels cleared (they're the
      // picture now). The edit layer keeps what's outside the rect (and past the grid).
      this.baseLayer.erase([...exactPixels, ...pictureCells.flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }])]);
      this.baseLayer.paint(exactPixels);
      // Paint past a shrunk grid's edge isn't in the picture: it stays, for when the grid grows back.
      this.paintLayer.clearCells(rect ?? this.gridRect());
      const kept = new Map([...this.editCells].filter(([key]) => !covered.has(key)));
      const after = {
        image, imageBuffer, workingCopy: true,
        base: this.baseLayer.snapshot(), paint: this.paintLayer.snapshot(), editCells: kept,
        baseRecords: withPins(withoutPins(this.baseRecords, unpins), pins),
      };
      const apply = (state) => {
        this.$patch({ image: shallowRef(state.image), imageBuffer: state.imageBuffer, imageIsWorkingCopy: state.workingCopy });
        this.baseLayer.restore(state.base);
        this.paintLayer.restore(state.paint);
        this.hasPaint = this.paintLayer.hasPaint;
        this.editCells = state.editCells;
        this.setBaseRecords(state.baseRecords);
        this.render();
      };
      apply(after);
      const bytes = bytesHeld(before.base, before.paint, before.image, before.imageBuffer, after.base, after.paint, after.image, after.imageBuffer, after.editCells);
      this.pushWholeLayer(() => apply(before), () => apply(after), bytes);
    } catch (e) {
      console.error('Failed to merge into the image', e);
      alert(t('document.mergeIntoImageFailed'));
    } finally {
      sharing?.release?.();
      this._merging = false;
      if (again) await this.mergeIntoPicture(rect);
    }
  },

  // rect: only the edit layer inside a cell rect (a selection) is merged; the rest stays. Shapes go first, under
  // the edit cells and paint: every one touching rect (or all), whole, with those beneath that overlap them.
  mergeDown(rect = null) {
    if (!this.image || this.hasFrames || refusedHidden(this)) return; // with frames, it would put one frame in the base, under all of them
    const area = rect && { x: rect.c0, y: 2 * rect.r0, w: rect.c1 - rect.c0 + 1, h: 2 * (rect.r1 - rect.r0 + 1) };
    // The shapes it presses: those touching the area where they show, with those beneath (none for guides alone).
    const pressing = () => this.pressedKeys([...placedShapes(this)].filter(([, shape]) => !area || meets(shapeBounds(shape), area)).map(([key]) => key));
    if (this.layerHidden('vector') && pressing().size && refusedHidden(this, ['vector'])) return; // what's hidden isn't pressed in
    if (this._artInside) this.leaveArt(); // a whole-layer step: on the drawing, not the art layer you're in
    this.ensureLayer();
    this.commitPending();
    const keys = pressing();
    const pressed = keys.size ? this.pressShapes(keys) : null; // guides alone press nothing

    const rows = charRowsOf(this.rows);
    const inRect = (col, row) => !rect || (col >= rect.c0 && col <= rect.c1 && row >= rect.r0 && row <= rect.r1);
    const shownChar = (col, row) => this.composedCells[cellIndex(col, row, this.cols)]?.char;
    const merged = [];   // { col, row, top, bottom, char }: edit cells, under the paint
    const kept = new Map(); // edit cells past the grid (after a canvas resize shrank it) or outside the rect stay on the edit layer
    for (const [key, entry] of this.editCells) {
      const { col, row } = parseKey(key);
      if (col >= this.cols || row >= rows || !inRect(col, row)) {
        kept.set(key, entry);
        continue;
      }
      merged.push(this.mergeCellOf(col, row));
    }
    if (rect && !merged.length && !pressed && !this.paintLayer.hasPaintIn(rect)) return; // nothing drawn inside: no empty undo step
    const paintedPins = [...(pressed?.baseRecords ?? this.baseRecords).pins.keys()].map(parseKey)
      .filter(({ col, row }) => inRect(col, row) && !this.editCells.has(cellKey(col, row)) && this.cellHasPaint(col, row))
      .map(({ col, row }) => ({ col, row, char: shownChar(col, row) ?? '▄' }));

    const before = { base: this.baseLayer.snapshot(), paint: this.paintLayer.snapshot(), editCells: this.editCells, shapes: this.shapes, baseRecords: this.baseRecords };
    if (pressed) this.baseLayer.restore(pressed.base);
    const pixels = merged.flatMap(({ col, row, top, bottom }) => [{ x: col, y: 2 * row, ...top, alpha: 1 }, { x: col, y: 2 * row + 1, ...bottom, alpha: 1 }]);
    this.baseLayer.erase(pixels);
    this.baseLayer.paint(pixels);
    this.baseLayer.drawOver(this.paintLayer, rect);
    if (rect) this.paintLayer.clearCells(rect);
    const pins = [...merged.map(({ col, row, char }) => ({ col, row, char })), ...paintedPins];
    const after = {
      base: this.baseLayer.snapshot(), paint: rect ? this.paintLayer.snapshot() : null, editCells: kept,
      shapes: pressed?.shapes ?? this.shapes, baseRecords: withPins(pressed?.baseRecords ?? before.baseRecords, pins),
    };
    const apply = ({ base, paint, editCells, shapes, baseRecords }) => {
      this.baseLayer.restore(base);
      this.paintLayer.restore(paint);
      this.hasPaint = this.paintLayer.hasPaint;
      this.editCells = editCells;
      this.shapes = shapes;
      this.setBaseRecords(baseRecords);
      this.render();
    };
    apply(after);
    this.pushWholeLayer(() => apply(before), () => apply(after), bytesHeld(before.base, before.paint, after.base, after.paint, after.editCells));
  },
};
