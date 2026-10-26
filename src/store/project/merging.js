// Moving things between the layers and into the image: Merge up (what the base shows becomes edit
// cells), Merge down exactly or into the image, and Bake (the picture as it looks becomes the image).
// Owns _baking and _merging (one at a time: a second call while one runs is ignored). Both wait on
// image encoding; anything changed meanwhile (an edit, a slider, an undo, the other one landing)
// and they start over from what shows then.
import { withPins, withoutPins } from '@/document/baseRecords.js';
import { cellKey, parseKey, rectCells, updateRect, bakeEditCells, bakeEntry, mergeKind } from '@/document/editCells.js';
import { loadImage } from '@/document/projectIO.js';
import { ctx2d } from '@/lib/Canvas.js';
import { cellIndex, charRowsOf, halfColors } from '@/lib/Cells.js';
import { rgb2hex, hex2rgb } from '@/lib/ColorUtils.js';
import { processedImage, workingScale } from '@/lib/ImageProcessor.js';
import { bakedCanvas, getEffectiveColor } from '@/lib/PixelTransforms.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { copyOf, over, bytesHeld } from '@/store/project/shared.js';
import { RESET_GROUPS, groupDefaults } from '@/store/settings.js';
import { shallowRef, toRaw } from 'vue';

export const mergingActions = {
  // Bake: the picture as it shows becomes the image and the Transform, Adjustment and Effect
  // sliders go back to neutral, with nothing on the canvas changing. The image is what the
  // preview is made from (the processed image at its processing size; the palette isn't baked,
  // it keeps applying). Under CGA/VGA that can tip a cell near a palette boundary (8-bit rounding);
  // lockPalette bakes the palette into the image instead, so nothing moves, but the picture keeps
  // only the palette's colors. The color transforms also tint the drawing when it's shown, so they're
  // burnt into it (paint, the base's own pixels, edit cells) and into the color pair and the
  // clipboard; recent colors are shared across projects and stay. One undo step (slider moves after
  // it are steps of their own).
  async bake({ lockPalette = false } = {}) {
    if (!this.canBake || this._baking) return;
    this._baking = true;
    let again = false;
    try {
      this.ensureLayer();
      this.commitPending();
      const workspace = useWorkspaceStore();
      const params = this.processParams;
      const doc = this._document, version = this.history.version;

      const canvas = await processedImage(this.image, params, { snap: lockPalette });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const image = await loadImage(blob);
      const imageBuffer = await blob.arrayBuffer();
      // Meanwhile: another document is left alone; a change to this one (a stroke begun is closed
      // now, so its undo isn't recorded against the baked layers) means baking what shows now.
      if (this._document !== doc) return;
      this.commitPending();
      if (this.image !== params.image || this.history.version !== version) {
        again = true;
        return;
      }

      const defaults = Object.assign({}, ...RESET_GROUPS.map(groupDefaults));
      const sliders = (from = this) => Object.fromEntries(Object.keys(defaults).map(key => [key, from[key]]));
      const baked = (snapshot) => snapshot && { ...snapshot, canvas: bakedCanvas(snapshot.canvas, params) };
      const clip = toRaw(workspace.clipboard);
      const before = {
        image: this.image, imageBuffer: this.imageBuffer, workingCopy: this.imageIsWorkingCopy, sliders: sliders(params), // what it was baked with
        paint: this.paintLayer.snapshot(), base: this.baseLayer.snapshot(), editCells: this.editCells,
        fg: workspace.editFgColor, bg: workspace.editBgColor, clipboard: clip,
      };
      const after = {
        image, imageBuffer, workingCopy: true, sliders: defaults,
        paint: baked(before.paint), base: baked(before.base), editCells: bakeEditCells(this.editCells, params),
        fg: getEffectiveColor(before.fg, params), bg: getEffectiveColor(before.bg, params),
        clipboard: clip && {
          ...clip,
          ...(clip.cells && { cells: clip.cells.map(entry => entry && bakeEntry(entry, params)) }),
          ...(clip.paint && { paint: bakedCanvas(clip.paint, params) }),
          ...(clip.base && { base: { ...clip.base, pixels: bakedCanvas(clip.base.pixels, params), colors: bakedCanvas(clip.base.colors, params) } }),
        },
      };

      // The color pair and the clipboard swap only while they hold what the other side left: a
      // color picked or a block copied since is kept.
      const apply = (state, from) => {
        this.$patch({ image: shallowRef(state.image), imageBuffer: state.imageBuffer, imageIsWorkingCopy: state.workingCopy, ...state.sliders });
        this.paintLayer.restore(state.paint);
        this.baseLayer.restore(state.base);
        this.hasPaint = this.paintLayer.hasPaint;
        this.editCells = state.editCells;
        if (workspace.editFgColor === from.fg) workspace.editFgColor = state.fg;
        if (workspace.editBgColor === from.bg) workspace.editBgColor = state.bg;
        if (toRaw(workspace.clipboard) === from.clipboard) workspace.clipboard = state.clipboard;
        this.render();
      };
      apply(after, before);
      this.pushEdit({
        undo: () => apply(before, after),
        redo: () => apply(after, before),
        bytes: bytesHeld(before.paint, before.base, before.image, before.imageBuffer, after.paint, after.base, after.image, after.imageBuffer),
      });
    } finally {
      this._baking = false;
      if (again) await this.bake({ lockPalette });
    }
  },

  // Merge up: what the base shows in rect (or the whole grid) becomes edit cells (an edit cell's own
  // attributes stay), and pins there are dropped, since the characters are now edit cells. One undo step.
  mergeUp(rect) {
    const area = rect ?? this.gridRect();
    this.selectionEdit([area], () => {
      this.editCells = updateRect(this.editCells, area, (col, row, entry) => this.completeAt(col, row, entry));
      this.setBaseRecords(withoutPins(this.baseRecords, rectCells(area)));
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
    if (!this.image || this._merging) return;
    this._merging = true;
    let again = false;
    try {
      this.ensureLayer();
      this.commitPending();
      const params = this.processParams;
      const doc = this._document, version = this.history.version;
      const neutral = { ...params, ...Object.assign({}, ...RESET_GROUPS.map(groupDefaults)) };
      const m = workingScale(this.image, params) ?? Math.max(2, Math.floor(400 / Math.max(this.cols, this.rows)));
      const fitNow = params.fit ?? this.fitFor(this.cols, this.rows);
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
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const image = await loadImage(blob);
      const imageBuffer = await blob.arrayBuffer();
      // What's merged was read before encoding: a change since (or an edit still open) means it's stale.
      if (this._document !== doc) return;
      this.commitPending();
      if (this.image !== params.image || this.history.version !== version) {
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
      const bytes = bytesHeld(before.base, before.paint, before.image, before.imageBuffer, after.base, after.paint, after.image, after.imageBuffer);
      this.pushEdit({ undo: () => apply(before), redo: () => apply(after), bytes });
    } finally {
      this._merging = false;
      if (again) await this.mergeIntoPicture(rect);
    }
  },

  // rect: only the edit layer inside a cell rect (a selection) is merged; the rest stays.
  mergeDown(rect = null) {
    if (!this.image) return;
    this.ensureLayer();
    this.commitPending();

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
    if (rect && !merged.length && !this.paintLayer.hasPaintIn(rect)) return; // nothing drawn inside: no empty undo step
    const paintedPins = [...this.baseRecords.pins.keys()].map(parseKey)
      .filter(({ col, row }) => inRect(col, row) && !this.editCells.has(cellKey(col, row)) && this.cellHasPaint(col, row))
      .map(({ col, row }) => ({ col, row, char: shownChar(col, row) ?? '▄' }));

    const before = { base: this.baseLayer.snapshot(), paint: this.paintLayer.snapshot(), editCells: this.editCells, baseRecords: this.baseRecords };
    const pixels = merged.flatMap(({ col, row, top, bottom }) => [{ x: col, y: 2 * row, ...top, alpha: 1 }, { x: col, y: 2 * row + 1, ...bottom, alpha: 1 }]);
    this.baseLayer.erase(pixels);
    this.baseLayer.paint(pixels);
    this.baseLayer.drawOver(this.paintLayer, rect);
    if (rect) this.paintLayer.clearCells(rect);
    const pins = [...merged.map(({ col, row, char }) => ({ col, row, char })), ...paintedPins];
    const after = { base: this.baseLayer.snapshot(), paint: rect ? this.paintLayer.snapshot() : null, editCells: kept, baseRecords: withPins(before.baseRecords, pins) };
    const apply = ({ base, paint, editCells, baseRecords }) => {
      this.baseLayer.restore(base);
      this.paintLayer.restore(paint);
      this.hasPaint = this.paintLayer.hasPaint;
      this.editCells = editCells;
      this.setBaseRecords(baseRecords);
      this.render();
    };
    apply(after);
    this.pushEdit({ undo: () => apply(before), redo: () => apply(after), bytes: bytesHeld(before.base, before.paint, after.base, after.paint) });
  },
};
