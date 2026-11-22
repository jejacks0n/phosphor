import { drawnWidthOf, encodeBlocks, encodeFont, fontId, narrowWidthOf, pixelAspectOf } from '@/lib/BitmapFont.js';
import { storeFontPart, withPart } from '@/lib/userFonts.js';
import { encodeLines, encodeSets } from '@/lib/FontLines.js';
import { notSetUp } from '@/lib/fontSetup.js';
import { fontGrid } from '@/lib/Cells.js';
import { isUniform, workingScale } from '@/lib/ImageProcessor.js';
import { DISPLAY_FONTS, DEFAULT_FONT } from '@/lib/displayFonts.js';
import PaintLayer, { resizeTransform } from '@/document/PaintLayer.js';
import { followPicture, parseKey } from '@/document/editCells.js';
import { isArt } from '@/document/artLayers.js';
import { transformed } from '@/document/shapes.js';
import { bytesHeld, putStack, stackState, stretchedPicture, useBase } from '@/store/project/shared.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { toast } from '@/composables/useToast.js';
import { t } from '@/i18n';
import { markRaw, shallowRef, toRaw } from 'vue';

const heightOf = (font) => font?.height ?? 16;
// A cell's height as the lines count it, drawn at width (nine: Letter spacing 9px): the font's height at a cell 8 wide
// (16 × pixelAspectOf), so a cell of another width is a taller or shorter one.
const tallOf = (font, width, nine) => 16 * pixelAspectOf(font && { ...font, cellWidth: drawnWidthOf(font, width, nine) });
// The settings that hold the drawing's font.
// settings: the step's own, which may carry others along (the SAUCE font name, Letter spacing), so its before does too.
const fontKeysOf = (project, settings = {}) => ({ fontBitmap: project.fontBitmap, fontName: project.fontName, fontWidth: project.fontWidth, fontBlocks: project.fontBlocks, fontLines: project.fontLines, fontSets: project.fontSets, ...Object.fromEntries(Object.keys(settings).map((key) => [key, project[key]])) });
// The parts of the same font a step changes, which undo and redo keep in this browser's copy of it too (keepCopy).
const partsOf = (before, after) => (before.fontBitmap === after.fontBitmap ? Object.keys(PART_KEYS).filter((key) => after[key] !== before[key]) : []);
// A BitmapFont (or none) as the settings that hold it.
export const fontSettingsOf = (font) => ({
  fontBitmap: font ? encodeFont(font) : '',
  fontName: font?.name ?? '',
  fontWidth: font && narrowWidthOf(font) === font.width ? String(font.width) : '',
  fontBlocks: font?.blocks ? encodeBlocks(font.blocks) : '',
  fontLines: font?.lines ? encodeLines(font.lines) : '',
  fontSets: font?.sets ? encodeSets(font.sets) : '',
});
// A font's name for a toast; none is the font picked in the Font field.
function nameOf(font) {
  if (font) return font.name;
  const { displayFont, userFonts } = useWorkspaceStore();
  return (userFonts?.find((f) => f.id === displayFont) ?? DISPLAY_FONTS.find((f) => f.id === displayFont) ?? DEFAULT_FONT).name;
}

// A font of another height (from and to: the cells' heights as tallOf counts them) for a drawing: the columns stay and
// the rows change so the picture keeps its shape (fontGrid). Refused with frames. With nothing drawn (nothing a rescale
// would leave in the wrong place: resizesCanvas), on a picture that isn't a working copy with content (that stretches),
// it's a settings step with the grid in it, and the next render rescales, as a Columns change with the lock on does: the
// picture refits and a later Columns change refits it again. Otherwise regrid. font: the BitmapFont or null;
// settings: its settings (fontStep's). A Promise only while a working copy with content is stretched.
function newHeight(project, font, settings, from, to) {
  if (project.hasFrames) return void toast(t('font.heightFrames', { name: nameOf(font), to: heightOf(font), from: heightOf(project.drawingFont) }));
  project.ensureLayer();
  if (holdsGrid(project)) return regrid(project, font, settings, from, to);
  const ratio = Number(project.aspectRatio), was = project.cols;
  const before = { ...fontKeysOf(project, settings), cols: project.cols, rows: project.rows, aspectRatio: project.aspectRatio };
  const after = { ...settings, ...fontGrid(project.cols, project.rows, from, to), aspectRatio: ratio > 0 ? ratio * to / from : project.aspectRatio };
  const parts = partsOf(before, after);
  project.commitPending();
  project.$patch(after);
  const on = (values, from) => () => { project.$patch(values); keepCopy(project, parts, from); project.render(); };
  project.pushEdit({ settingsOnly: true, undo: on(before, after), redo: on(after, before) }); // settingsOnly: kept through a rescale (dropEdits)
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
  const image = project.image, fitAspect = project.gridPicture ? 1 : to / 16;
  // The old fit stretched down the page by the fonts' heights, so a picture a canvas resize cropped or left in a
  // corner stays under the cells drawn on it; when the columns give way, shrunk across by as much too. A fit that ended
  // on the grid's edge ends on the new one's (fontGrid rounds the lines up).
  const oldFit = project.fit, sx = cols / project.cols, sy = sx * from / to;
  const side = (at, size, was, now, k) => (at + size === was ? now - Math.round(at * k) : Math.max(1, Math.round(size * k)));
  const newFit = {
    dx: Math.round(oldFit.dx * sx), dy: Math.round(oldFit.dy * sy),
    dw: side(oldFit.dx, oldFit.dw, project.cols, cols, sx), dh: side(oldFit.dy, oldFit.dh, project.rows, rows, sy),
  };
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
    settings: { ...fontKeysOf(project, settings), cols: project.cols, rows: project.rows, fit: oldFit, aspectRatio: project.aspectRatio, baseScale: project.baseScale, paintScale: project.paintScale },
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

// The parts of the drawing's font a step changed ('width', 'blocks', 'lines', 'sets'), put in this browser's copy of the font
// too when it has one, as they now are: an undo or redo, so an XBin opened later gets what the drawing shows. Only
// while the copy still holds what the step left there (from: the settings undone or redone from): an edit made to the
// copy since, which has no undo, stays. No from: whatever the copy holds (a width answered). Only the step's maker has
// it (an artist can't change the font, and a watcher takes none), so the copy is always theirs.
function keepCopy(project, parts, from) {
  const workspace = useWorkspaceStore(), font = project.drawingFont, id = font && fontId(font);
  if (!parts.length || !workspace.userFonts?.some((f) => f.id === id)) return;
  for (const setting of parts) {
    const key = PART_KEYS[setting], value = key === 'width' ? font.width ?? 8 : font[key], when = from && ((kept) => (kept ? ENCODE[key](kept) : '') === (setting === 'fontWidth' && !from[setting] ? '8' : from[setting])); // the drawing's '' is a remembered 8
    storeFontPart(id, key, value ?? null, { when }).then((wrote) => {
      if (wrote) workspace.userFonts = workspace.userFonts?.map((f) => (f.id === id ? withPart(toRaw(f), key, value) : f));
    }, () => {}); // the copy removed since: nothing to keep
  }
}
const PART_KEYS = { fontWidth: 'width', fontBlocks: 'blocks', fontLines: 'lines', fontSets: 'sets' };
const ENCODE = { width: String, blocks: encodeBlocks, lines: encodeLines, sets: encodeSets };

// Something drawn a refit would leave in the wrong place (resizesCanvas), or a working copy with content (its pixels are
// grid pixels, so it stretches): newHeight regrids, and a cell of another width alone keeps the grid (with frames too).
const holdsGrid = (project) => project.resizesCanvas || (project.imageIsWorkingCopy && !isUniform(project.image));
const keepsGrid = (project) => project.hasFrames || holdsGrid(project);

// The drawing given these font settings (after: fontSettingsOf's, with any set along). A font of another height changes
// the grid (newHeight); so does a cell of another width with nothing drawn and no frames (the lines refit to the
// picture). Otherwise a settings step on the grid as it is: a width changes how cells look, never which cells hold what.
function fontStep(project, font, after) {
  const was = project.drawingFont, nine = 'sauceLetterSpacing' in after ? after.sauceLetterSpacing === '9' : project.letterSpacing9;
  const from = 16 * project.pixelAspect, to = tallOf(font, after.fontWidth, nine);
  if (heightOf(was) !== heightOf(font) || (from !== to && !keepsGrid(project))) return newHeight(project, font, after, from, to);
  const before = fontKeysOf(project, after);
  // Lines and sets don't change the picture: a step that changes only them draws nothing again.
  const looks = Object.keys(after).some((key) => key !== 'fontLines' && key !== 'fontSets' && after[key] !== before[key]);
  // The same font with other blocks, lines, sets or width: undo and redo keep this browser's copy of it in step too.
  const parts = partsOf(before, after);
  project.commitPending();
  project.$patch(after);
  const on = (values, from) => () => { project.$patch(values); keepCopy(project, parts, from); if (looks) project.render(); };
  project.pushEdit({ settingsOnly: true, undo: on(before, after), redo: on(after, before) });
  if (looks) project.render();
}

// The drawing's bitmap font: kept in the settings as base64 (fontBitmap, with its name and blocks), so it's saved,
// autosaved and fingerprinted like the rest. Changing it is one undo step; before a drawing, the next one's font. In a
// room it can't change to a font that isn't set up (fontNotSetUp). A font of another height changes the grid (newHeight).
export const fontActions = {
  // font: a BitmapFont ({ name, height, bytes }) or null for none, with its remembered width (the browser's copy's
  // answer: its own width or 8) when it has one. The font it already has is no step. A Promise only while a working
  // copy is stretched for a font of another height (newHeight); await it either way.
  // sauceFontName: the SAUCE font name the export writes, set in the same step (before and after both carry it).
  // Another font narrower than 8 with no answer is drawn at its own width until it has one: { ask: true } once it's
  // the drawing's (the question is the caller's). The drawing's own font with no width keeps the width it's drawn at.
  setDrawingFont(font, { sauceFontName } = {}) {
    const after = { ...fontSettingsOf(font), ...(sauceFontName !== undefined && { sauceFontName }) };
    const same = after.fontBitmap === this.fontBitmap, own = font && font.width === undefined && !same && narrowWidthOf(font);
    if (own) after.fontWidth = String(own);
    else if (font && font.width === undefined && same) after.fontWidth = this.fontWidth; // its own font again, unanswered: drawn as it is
    const asked = () => (own && this.fontBitmap === after.fontBitmap ? { ask: true } : undefined);
    if (Object.keys(after).every((key) => after[key] === this[key])) return;
    const reason = this.inRoom && notSetUp(font); // a room can't edit blocks, so it takes no font that needs it (undo and redo patch on their own)
    if (reason) return void toast(reason);
    if (!this.image) { // no drawing yet: the next one's font, with nothing to undo
      this.$patch(after);
      return asked();
    }
    const made = fontStep(this, font, after);
    return made instanceof Promise ? made.then(asked) : asked();
  },

  // The drawing's font drawn at width: its own width (4-7: narrow), 8, or 9 (Letter spacing 9px). One undo step that
  // never moves a drawn cell (fontStep), and the answer kept on this browser's copy of the font: its own width, or 8
  // for 8 and 9 (Letter spacing is the drawing's, and 8 or 9 sets it, so the export writes it, even at the width it's
  // drawn at). Settings it already has are no step; a width it can't take, nothing.
  setDrawingFontWidth(width) {
    const font = this.drawingFont, own = font && narrowWidthOf(font);
    if (!font || !(width === own || width === 8 || width === 9)) return;
    const after = { ...fontKeysOf(this), ...(width === own ? { fontWidth: String(own) } : { fontWidth: '', sauceLetterSpacing: String(width) }) };
    if (!Object.keys(after).every((key) => after[key] === this[key])) {
      if (!this.image) this.$patch(after); // no drawing yet: the next one's, with nothing to undo
      else fontStep(this, font, after); // the same height: never a Promise (keepsGrid has no working copy stretched)
    }
    if (own) keepCopy(this, ['fontWidth']);
  },
};
