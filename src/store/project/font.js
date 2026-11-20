import { encodeBlocks, encodeFont } from '@/lib/BitmapFont.js';
import { notSetUp } from '@/lib/fontSetup.js';
import { fitRect } from '@/lib/Canvas.js';
import { fontGrid } from '@/lib/Cells.js';
import { isUniform, workingScale } from '@/lib/ImageProcessor.js';
import { DISPLAY_FONTS } from '@/lib/displayFonts.js';
import PaintLayer, { resizeTransform } from '@/document/PaintLayer.js';
import { followPicture, parseKey } from '@/document/editCells.js';
import { isArt } from '@/document/artLayers.js';
import { transformed } from '@/document/shapes.js';
import { bytesHeld, putStack, stackState, stretchedPicture, useBase } from '@/store/project/shared.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { toast } from '@/composables/useToast.js';
import { t } from '@/i18n';
import { markRaw, shallowRef } from 'vue';

const heightOf = (font) => font?.height ?? 16;
// The settings that hold the drawing's font.
const trioOf = (project) => ({ fontBitmap: project.fontBitmap, fontName: project.fontName, fontBlocks: project.fontBlocks });
// A font's name for a toast; none is the font picked in the Font field.
function nameOf(font) {
  if (font) return font.name;
  const { displayFont, userFonts } = useWorkspaceStore();
  return (userFonts?.find((f) => f.id === displayFont) ?? DISPLAY_FONTS.find((f) => f.id === displayFont) ?? DISPLAY_FONTS[0]).name;
}

// A font of another height (from and to, in pixels) for a drawing: the columns stay and the rows change so the picture
// keeps its shape (fontGrid). Refused with frames. With nothing drawn (nothing a rescale would leave in the wrong place:
// resizesCanvas), on a picture that isn't a working copy with content (that stretches), it's a settings step with the
// grid in it, and the next render rescales, as a Columns change with the lock on does: the picture refits and a later
// Columns change refits it again. Otherwise regrid. font: the BitmapFont or null;
// settings: its trio (setDrawingFont's). A Promise only while a working copy with content is stretched.
function newHeight(project, font, settings, from, to) {
  if (project.hasFrames) return void toast(t('font.heightFrames', { name: nameOf(font), to, from }));
  project.ensureLayer();
  const stretches = project.imageIsWorkingCopy && !isUniform(project.image); // a working copy with content: its pixels are grid pixels
  if (project.resizesCanvas || stretches) return regrid(project, font, settings, from, to);
  const ratio = Number(project.aspectRatio), was = project.cols;
  const before = { ...trioOf(project), cols: project.cols, rows: project.rows, aspectRatio: project.aspectRatio };
  const after = { ...settings, ...fontGrid(project.cols, project.rows, from, to), aspectRatio: ratio > 0 ? ratio * to / from : project.aspectRatio };
  project.commitPending();
  project.$patch(after);
  const on = (values) => () => { project.$patch(values); project.render(); };
  project.pushEdit({ settingsOnly: true, undo: on(before), redo: on(after) }); // settingsOnly: kept through a rescale (dropEdits)
  project.render();
  if (after.cols < was) toast(t('font.heightShrunk', { name: nameOf(font), cols: after.cols, rows: after.rows }));
}

// newHeight's with something drawn: paint layers and the base's own pixels follow the picture, a working copy is stretched
// with the grid, vector shapes move with it, and characters, pins (with their two pixels) and art layers keep their
// cells (docs/model.md R1). One whole-layer step that swaps objects, so the steps before it stay undoable.
function regrid(project, font, settings, from, to) {
  if (project._artInside) project.leaveArt(); // a whole-layer step: on the drawing, not the art layer you're in
  project.commitPending();
  const { cols, rows } = fontGrid(project.cols, project.rows, from, to);
  const image = project.image, w0 = image.naturalWidth || image.width, h0 = image.naturalHeight || image.height;
  const grid = project.gridPicture, fitAspect = grid ? 1 : to / 16;
  const oldFit = project.fit, newFit = fitRect(w0, grid ? h0 * from / to : h0, cols, rows, fitAspect);
  const w = resizeTransform(oldFit, newFit);
  const doc = project._document, version = project.history.version, was = { cols: project.cols, rows: project.rows };
  const go = (picture) => {
    if (project._document !== doc || project.history.version !== version || project.image !== image || project.cols !== was.cols || project.rows !== was.rows) return;
    switched(project, { ...settings, cols, rows, fit: newFit }, picture, w, oldFit, fitAspect, from, to);
    if (cols < was.cols) toast(t('font.heightShrunk', { name: nameOf(font), cols, rows }));
  };
  if (project.imageIsWorkingCopy && !isUniform(image)) return stretchedPicture(image, from / to).then(go); // its pixels are grid pixels
  return go({ image, imageBuffer: project.imageBuffer }); // a one-color picture fills any grid: only its fit changes
}

// regrid's step: the after built from the drawing as it is (before: its objects, untouched), put in place and pushed.
function switched(project, settings, picture, w, oldFit, fitAspect, from, to) {
  const { cols, rows, fit: newFit } = settings;
  const params = { ...project.processParams, fit: newFit, cols, rows, fitAspect, workScale: null };
  // A copy of a paint layer moved with the picture onto the new grid, at scale (its own unless said); a cells layer's
  // data with its entries following (followPicture). One helper for the base, the stack and the edit layer.
  // pinned: grid pixels that stay where they are, not following (a pin's two).
  const follow = (paint, scale, pinned = []) => {
    if (!paint) return paint;
    const copy = markRaw(new PaintLayer({ cols: paint.cols, rows: paint.rows, scale: paint.scale, smooth: paint.smooth }));
    copy.restore(paint.snapshot());
    const kept = pinned.length ? paint.gridPixels() : null;
    if (kept) copy.erase(pinned);
    copy.resize(cols, rows, oldFit, newFit, scale);
    if (kept) {
      copy.put(pinned.map(({ x, y }) => {
        const o = (y * kept.width + x) * 4, [r, g, b, a] = kept.data.slice(o, o + 4);
        return { x, y, r, g, b, a: a / 255 };
      }));
    }
    return copy;
  };
  // A pin's two pixels, where both grids have them.
  const pins = [...project.baseRecords.pins.keys()].map(parseKey).filter(({ col, row }) => col < Math.min(cols, project.cols) && 2 * row + 1 < Math.min(rows, project.rows))
    .flatMap(({ col, row }) => [{ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 }]);
  const followData = ({ editCells, paintLayer, hasPaint }) => ({ editCells: editCells.size ? followPicture(editCells, w, cols, rows) : editCells, paintLayer: follow(paintLayer), hasPaint });

  const ratio = Number(project.aspectRatio);
  const before = {
    settings: { ...trioOf(project), cols: project.cols, rows: project.rows, fit: oldFit, aspectRatio: project.aspectRatio, baseScale: project.baseScale, paintScale: project.paintScale },
    image: project.image, imageBuffer: project.imageBuffer, base: project.baseLayer, stack: stackState(project), shapes: project.shapes,
    edit: { editCells: project.editCells, paintLayer: project.paintLayer, hasPaint: project.hasPaint },
  };
  const base = follow(before.base, workingScale(picture.image, params) ?? 1, pins);
  const data = new Map([...before.stack.data].map(([id, each]) => [id, followData(each)]));
  const edit = data.get(project.editId) ?? followData(before.edit); // the base's stand-in, or no layer's, isn't in the stack
  const m = [w.scaleX, 0, 0, w.scaleY, w.offsetX, w.offsetY];
  const after = {
    settings: { ...settings, aspectRatio: ratio > 0 ? ratio * to / from : project.aspectRatio, baseScale: base.scale, paintScale: project.paintScale && edit.paintLayer.scale },
    ...picture, base, stack: { ...before.stack, data }, edit,
    shapes: new Map([...project.shapes].map(([key, shape]) => [key, isArt(shape) ? shape : transformed(shape, m)])),
  };

  // In this order: the grid first (ensureLayer would resize again otherwise), and the edit layer's paint before the stack,
  // which extends every layer to it. Resized layers are swapped as objects, never restored (that draws at the size now).
  const apply = (state) => {
    const { fit, ...settings } = state.settings;
    project.$patch({ ...settings, image: shallowRef(state.image), imageBuffer: state.imageBuffer });
    project.fit = { ...fit }; // a copy: $patch would merge into the fit there, which is the other side's
    project._layerGrid = { cols: state.settings.cols, rows: state.settings.rows };
    useBase(project, state.base);
    project.paintLayer = state.edit.paintLayer;
    putStack(project, state.stack);
    project.editCells = state.edit.editCells;
    project.hasPaint = state.edit.hasPaint;
    project.shapes = state.shapes;
    project.render();
  };
  apply(after);
  const layers = [...data.values(), ...before.stack.data.values()].flatMap(({ paintLayer, editCells }) => [paintLayer, editCells]); // a PaintLayer counts as its canvas
  project.pushWholeLayer(() => apply(before), () => apply(after), bytesHeld(base, before.base, ...layers, after.image !== before.image && after.image), { everyFrame: true });
}

// The drawing's bitmap font: kept in the settings as base64 (fontBitmap, with its name and blocks), so it's saved,
// autosaved and fingerprinted like the rest. Changing it is one undo step; before a drawing, the next one's font. In a
// room it can't change to a font that isn't set up (fontNotSetUp). A font of another height changes the grid (newHeight).
export const fontActions = {
  // font: a BitmapFont ({ name, height, bytes }) or null for none. The font it already has is no step. A Promise only
  // while a working copy is stretched for a font of another height (newHeight); await it either way.
  setDrawingFont(font) {
    const after = font
      ? { fontBitmap: encodeFont(font), fontName: font.name, fontBlocks: font.blocks ? encodeBlocks(font.blocks) : '' }
      : { fontBitmap: '', fontName: '', fontBlocks: '' };
    if (Object.keys(after).every((key) => after[key] === this[key])) return;
    const reason = this.inRoom && notSetUp(font); // a room can't edit blocks, so it takes no font that needs it (undo and redo patch on their own)
    if (reason) return void toast(reason);
    if (!this.image) return void this.$patch(after); // no drawing yet: the next one's font, with nothing to undo
    const from = heightOf(this.drawingFont), to = heightOf(font);
    if (from !== to) return newHeight(this, font, after, from, to);
    const before = trioOf(this);
    this.commitPending();
    this.$patch(after);
    const on = (values) => () => { this.$patch(values); this.render(); };
    this.pushEdit({ settingsOnly: true, undo: on(before), redo: on(after) });
    this.render();
  },
};
