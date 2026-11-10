// The document as a whole: a new image or blank canvas, opening and saving .phosphor projects,
// exporting .ans and .utf8ans, the filename, and what counts as saved.
import { t } from '@/i18n';
import { EMPTY_BASE } from '@/document/baseRecords.js';
import { layersFromOld, savedLayers, legacySlots, keyLayer, withChars } from '@/document/layerInfo.js';
import PaintLayer from '@/document/PaintLayer.js';
import { parseKey, withCellEdit } from '@/document/editCells.js';
import { frameDuration, serializeFrames } from '@/document/frames.js';
import { loadImage, readProject, writeProject, downloadBlob, isProjectFile, PROJECT_EXTENSION } from '@/document/projectIO.js';
import { AnsiFile } from '@/lib/AnsiFile.js';
import { readArtFile } from '@/lib/ArtFile.js';
import { readSvgFile, svgRefusal } from '@/lib/SvgFile.js';
import { MOST_SHAPES } from '@/document/shapes.js';
import { castText } from '@/lib/CastFile.js';
import { MAX_GIF_PIXELS, gifBytes, gifDelay, gifFrames } from '@/lib/GifFile.js';
import { gpuMaxSide } from '@/lib/ImageProcessor.js';
import { charRowsOf, lockedGrid } from '@/lib/Cells.js';
import { rgb2hex } from '@/lib/ColorUtils.js';
import { userComments } from '@/lib/Sauce.js';
import { toast } from '@/composables/useToast.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { settingDefaults } from '@/store/settings.js';
import { DEFAULT_COLS, DEFAULT_ROWS, BLANK_CANVAS_SCALE, SAVED_KEYS, savedJson, randomId, blackPicture } from '@/store/project/shared.js';
import { generateSlug } from 'random-word-slugs';
import { markRaw, shallowRef } from 'vue';

// A project's pictures, decoded: what can fail before anything has changed.
const loadParts = async ({ imageBuffer, paintBuffer, baseBuffer, layerParts }) => ({
  image: await loadImage(imageBuffer),
  paint: paintBuffer && await loadImage(paintBuffer, 'image/png'),
  basePixels: baseBuffer && await loadImage(baseBuffer, 'image/png'),
  layerPaint: new Map(await Promise.all([...layerParts ?? []].filter(([, part]) => part.paintBuffer).map(async ([id, part]) => [id, await loadImage(part.paintBuffer, 'image/png')]))),
});

const NO_DRAWING = Object.freeze({ editCells: new Map(), paintLayer: null, hasPaint: false });
const withoutLayer = (shape) => {
  if (!shape?.layer) return shape;
  const { layer, ...rest } = shape; // eslint-disable-line no-unused-vars
  return Object.freeze(rest);
};
// The old form's frames: only its cells layer's keys (id's), bare as its cellEdits are, and shapes that name no layer.
const oldFrames = (frames, id) => {
  const bare = (key) => (keyLayer(key).id === id ? keyLayer(key).key : null);
  const kept = (keys) => keys.map(bare).filter((key) => key !== null);
  return frames.map((frame) => ({
    ...frame,
    changes: frame.changes.filter(([key]) => bare(key) !== null).map(([key, ...rest]) => [bare(key), ...rest]),
    ...(frame.stays && { stays: kept(frame.stays) }),
    ...(frame.shapes && { shapes: frame.shapes.map(([key, shape]) => [key, withoutLayer(shape)]) }),
  }));
};

// A new document's layers: the bottom and the edit layer, in use, with the document's character settings. Set, not
// patched: a patch would merge into the last document's. Counted, so the pick that follows the layers (followLayerPick)
// takes it as a new document even under the same id (a version brought back).
function newLayers(project) {
  project.editId = 'edit'; // first: the pick that follows the layers finds it in use
  project._layersStarted++;
  project._layerData.clear();
  project._upperShapes.clear();
  project.layers = withChars(layersFromOld(null, { hasShapes: false }), project.baseChars);
}

// A project's parts as the open document, with its pictures decoded. As `this`, the store.
// A stack file's layers (stack) come with each cells layer's parts (layerParts) and paint (layerPaint), by id.
function showParts({ settings, imageBuffer, editCells, baseRecords, shapes, layers, stack, layerParts, erasedCells, migrated, animation, framesLost }, { image, paint, basePixels, layerPaint }, { filename, documentId }) {
  const own = this.layers; // replaceImage starts them over
  // A setting the file doesn't have (it's older than the setting) is its default, not the last document's.
  this.replaceImage(image, imageBuffer, { ...settingDefaults(), ...settings, filename, savedToFile: false, ...(documentId && { documentId }) });
  try {
    // Saved with its scale: the whole layer, reaching past the grid if it was shrunk. Older
    // files: paint at the image's size or the grid's.
    const loadPaint = (layer, picture) => {
      if (settings.paintScale) layer.extend(Math.round(picture.width / layer.scale), Math.round(picture.height / layer.scale));
      layer.load(picture, settings.paintScale ? null : { width: image.naturalWidth, height: image.naturalHeight }, this.fit);
    };
    // Every layer converts with its own character settings: an old document's, and a stack's layer without them, take the
    // document's (the file's, set above), so it shows as it did.
    let next = withChars(stack ?? layersFromOld(layers, { hasShapes: shapes?.size > 0 }), this.baseChars);
    if (this._takingProject) { // a room's project: the host's names, but whether a layer shows is each person's: kept for the same document, else cleared
      const mine = (id) => this._sameDocument && !!own.find((layer) => layer.id === id)?.hidden;
      next = next.map((layer) => Object.freeze({ ...layer, hidden: mine(layer.id) }));
    }
    if (stack) {
      // In use, the layer a new document's pick takes (followLayerPick): the edit layer, else the topmost cells layer.
      // Every other cells layer waits in _layerData, all of them there before the layers are, which the pick follows.
      const above = stack.filter((layer) => layer.kind === 'cells' && layer.id !== 'base').map((layer) => layer.id);
      this.editId = above.includes('edit') ? 'edit' : above.at(-1) ?? 'edit';
      // The pick replaceImage gave the edit layer it opens with goes to that layer, so it doesn't fall to the base when
      // the stack has no edit layer.
      const workspace = useWorkspaceStore();
      if (workspace.pickedLayer === 'edit' && !above.includes('edit')) workspace.pickedLayer = this.editId;
      if (layerPaint.size) this.ensureLayer();
      for (const id of above) {
        const picture = layerPaint.get(id);
        if (id === this.editId) {
          this.editCells = layerParts.get(id).editCells;
          if (picture) loadPaint(this.paintLayer, picture);
          this.hasPaint = !!picture && this.paintLayer.hasPaint;
          continue;
        }
        const paintLayer = picture ? markRaw(new PaintLayer({ cols: this.paintLayer.cols, rows: this.paintLayer.rows, scale: this.paintLayer.scale })) : null;
        if (paintLayer) loadPaint(paintLayer, picture);
        this._layerData.set(id, { editCells: layerParts.get(id).editCells, paintLayer, hasPaint: !!paintLayer?.hasPaint });
      }
    } else {
      this.editCells = editCells;
    }
    if (shapes?.size) this.shapes = shapes;
    this.layers = next;
    // On VECTOR it opens on the topmost vector layer (the pick at the start over could only be the first one's id).
    const top = next.findLast((layer) => layer.kind === 'vector'), workspace = useWorkspaceStore();
    if (top && workspace.editorTab === 'vector') workspace.pickLayer(top.id);
    this.setBaseRecords(baseRecords);
    if (paint) {
      this.ensureLayer();
      loadPaint(this.paintLayer, paint);
      this.hasPaint = this.paintLayer.hasPaint;
      if (migrated) this.keepMigratedLook();
    }
    if (basePixels) {
      this.ensureLayer();
      // Saved at its scale (settings.baseScale, which the layer was made at). Older files: a pixel
      // per grid pixel, drawn up to the layer's scale.
      const k = settings.baseScale ?? 1;
      this.baseLayer.extend(Math.round(basePixels.width / k), Math.round(basePixels.height / k));
      this.baseLayer.load(basePixels);
    }
    // Every layer reaches as far as any was saved (they're extended together from here on).
    if (this.paintLayer) {
      const all = [this.paintLayer, this.baseLayer, ...[...this._layerData.values()].map((data) => data.paintLayer).filter(Boolean)];
      const cols = Math.max(...all.map((layer) => layer.cols)), rows = Math.max(...all.map((layer) => layer.rows));
      for (const layer of all) layer.extend(cols, rows);
    }
    // Files from before the base had its own pixels kept erased cells as a record: erase them
    // now (as part of loading, not an edit).
    const onGrid = erasedCells.filter(({ col, row }) => col < this.cols && row < charRowsOf(this.rows));
    if (onGrid.length) {
      this.eraseBase(onGrid);
      this.commitEdit();
      this.clearHistory();
    }
    if (animation?.frames.length > 1 && !this._sharing && !this._takingProject) this.openFrames(animation); // a room holds a still: the file's still is what's open
    if (framesLost && !this._sharing && !this._takingProject) toast(t('document.framesLost'));
    this.render();
    this.markSaved();
  } catch (error) {
    this.clearImage(); // the old document is gone by now: not half of this one to draw on or write
    throw error;
  }
}

export const documentActions = {
  // A new random seed for the layer with the id (the bottom's is the document's).
  randomizeSeed(id = 'base') {
    if (this.setLayerChars(id, { seed: generateSlug(2) })) this.commitLayerChars(); // one undo step
  },

  async setImageFromFile(file) {
    if (!file) return;

    const buffer = await file.arrayBuffer();
    let image;
    try {
      image = await loadImage(buffer, file.type);
    } catch (e) {
      const reason = e?.code === 'DECODE_IMAGE_FAILED' ? t('document.decodeImageFailed') : e.message;
      alert(t('document.openImageFailed', { name: file.name, reason }));
      return;
    }
    const ratio = (image.naturalWidth || 1) / (image.naturalHeight || 1);

    this.replaceImage(image, buffer, {
      ...lockedGrid(this.cols, ratio),
      filename: file.name.replace(/\.[^/.]+$/, ''),
      sauceTitle: '',
      savedToFile: false,
    });
    this.markSaved();
  },

  // The blank picture is BLANK_CANVAS_SCALE pixels a grid pixel, or fewer for a long grid: no more than
  // the GPU processes (gpuMaxSide) and Safari draws (16M pixels a canvas). cols, rows: its size
  // (grid pixels), else the grid's; patch: more for replaceImage. False when it couldn't start.
  async setBlankCanvas({ cols = this.cols || DEFAULT_COLS, rows = this.rows || DEFAULT_ROWS, ...patch } = {}) {
    const scale = Math.max(1, Math.min(BLANK_CANVAS_SCALE, Math.floor(gpuMaxSide() / Math.max(cols, rows)), Math.floor(Math.sqrt(16_000_000 / (cols * rows)))));
    let picture;
    try {
      picture = await blackPicture(cols, rows, scale);
    } catch (e) {
      console.error('Failed to start a blank canvas', e);
      alert(t('document.blankFailed'));
      return false;
    }
    this.replaceImage(picture.image, picture.imageBuffer, {
      cols: Math.max(1, cols),
      rows: Math.max(1, rows),
      filename: t('common.untitled'),
      sauceTitle: '',
      savedToFile: false,
      ...patch,
    });
    this.markSaved(); // nothing to lose until something is drawn
    return true;
  },

  // An .ans, .utf8ans, .asc or .txt file as a new document: a blank canvas its size with the art on
  // the base layer (layer 'base', to draw on top of), or as edit cells over the black base ('edit', to
  // edit it), its palette and SAUCE in the settings (the rest at their defaults, so the sliders leave
  // it as the file shows it). Loading, not an edit: nothing to undo or save. A file that can't open
  // throws (with its userMessage) before anything changes.
  async openArtFile(file, { layer = 'base' } = {}) {
    const art = readArtFile(new Uint8Array(await file.arrayBuffer()), file.name);
    const { sauce } = art;
    const opened = await this.setBlankCanvas({
      ...settingDefaults(),
      cols: art.cols,
      rows: 2 * art.rows,
      filename: file.name.replace(/\.[^/.]+$/, ''),
      quantize: art.palette,
      renderStyle: 'ansi',
      savedToFile: false,
      ...(sauce && {
        sauceTitle: sauce.title,
        sauceAuthor: sauce.author,
        sauceGroup: sauce.group,
        sauceDate: sauce.date,
        sauceUserComments: userComments(sauce.comments),
        sauceFontName: sauce.fontName,
        sauceUse9pxFont: sauce.use9pxFont,
      }),
    });
    if (!opened) return;
    const cells = art.cells.map((cell, i) => ({ col: i % art.cols, row: Math.floor(i / art.cols), ...cell }));
    if (layer === 'edit') this.writeEditCells(cells.map(({ col, row, char, fg, bg }) => ({ col, row, attrs: { char, fg, bg } })));
    else this.writeBaseCells(cells);
    this.commitEdit();
    this.clearHistory();
    this.render();
    this.markSaved();
    // The base holds each cell as its two colors (background over foreground), which the PIXEL tab
    // would show as stripes; All cells draws every cell there as it looks.
    useWorkspaceStore().ansiOverlayAll = true;
  },

  // An .svg file as a new document: a blank canvas at the default size, named for the file, on VECTOR with the
  // file's art as shapes (addSvg). A file that isn't SVG throws (with its userMessage) before anything changes.
  async openSvgFile(file) {
    const text = await file.text(), refusal = svgRefusal(readSvgFile(text), MOST_SHAPES);
    if (refusal) return void toast(refusal); // the drawing stays
    if (!(await this.setBlankCanvas({ cols: DEFAULT_COLS, rows: DEFAULT_ROWS, filename: file.name.replace(/\.[^/.]+$/, '') }))) return;
    useWorkspaceStore().editorTab = 'vector';
    this.addSvg(text);
  },

  // Swap in a new base image and start a fresh document around it (out of an art layer first).
  replaceImage(image, imageBuffer, patch = {}) {
    if (this._artInside) this.leaveArt();
    this.renderer.reset();
    this.activePalette = [];
    this.$patch({
      documentId: randomId(),
      fit: null,
      paintScale: null,
      baseScale: null, // a loaded file's comes in the patch
      imageIsWorkingCopy: false,
      ...patch,
      image: shallowRef(image),
      imageBuffer,
      paintLayer: null,
      baseLayer: null,
      editCells: new Map(),
      shapes: new Map(),
      hasPaint: false,
    });
    newLayers(this);
    this.newDocument();
  },

  // The base layer's records, kept in step with the renderer's copy.
  setBaseRecords(records) {
    this.baseRecords = records;
    this.renderer.baseRecords = records;
  },

  // The current settings and edits are what's on disk (or there's nothing to lose).
  markSaved() {
    this.savedSettings = savedJson(this);
    this.savedEditVersion = this.editVersion;
  },

  clearImage() {
    if (this._artInside) this.leaveArt();
    this.renderer.reset();
    this.activePalette = [];
    this.$patch({
      image: null,
      imageBuffer: null,
      documentId: null,
      savedToFile: false,
      fit: null,
      filename: null,
      cells: [],
      composedCells: [],
      lowerCells: [],
      renderedCells: [],
      paintLayer: null,
      baseLayer: null,
      baseScale: null,
      editCells: new Map(),
      shapes: new Map(),
      hasPaint: false,
    });
    newLayers(this);
    this.newDocument();
    this.markSaved();
  },

  // A fresh document: no base records or pixels, no history, and the selection (and the Picker's
  // last pick) dropped.
  newDocument() {
    this._document = (this._document ?? 0) + 1; // Bake and Merge into the image check they're still in the same one
    this.setBaseRecords(EMPTY_BASE);
    this.renderer.baseLayer = this.renderer.shapes = this._shapeLayer = null;
    this._stroke = null;
    this.dropHeard();
    if (this._sameDocument) return; // a host's project bringing this one up to date (openFromHost)
    this.clearHistory();
    this.resetFrames();
    const workspace = useWorkspaceStore();
    workspace.selection = workspace.selectionOffset = workspace.lastPick = workspace.wand = null;
  },

  // Save and export take the name typed in the save dialog (fileStem: without the extension); it
  // renames the document, so the next save starts from it.
  rename(filename) {
    if (filename?.trim()) this.filename = filename.trim();
  },

  async saveProject(filename = this.filename) {
    if (!this.image || !this.imageBuffer) return;
    this.commitPending(); // an open typing run counts as saved, not as an edit made after saving

    const blob = await writeProject({ imageBuffer: this.imageBuffer, ...await this.projectParts() });
    this.rename(filename); // once there's a file to give the name to
    downloadBlob(blob, `${this.filename}${PROJECT_EXTENSION}`);
    this.markSaved();
    this.savedToFile = true;
  },

  // What a .phosphor file holds besides the image, all of it as of the call (a canvas is copied when
  // toBlob is called), since a room's changes go on while the blobs are made. Inside an art layer, the drawing
  // is the one kept aside (enterArt).
  // Layers that fit the old form (legacySlots) are written in it: its cells layer's cells and paint as the edit layer's,
  // whatever its id, its frame keys bare and its shapes naming no layer. Any other stack is written in the stack form,
  // every cells layer with its own cells and paint.
  async projectParts() {
    const slots = legacySlots(this.layers, this.baseChars);
    const drawingOf = (id) => (id === this.editId ? this._artInside ?? this : this._layerData.get(id)) ?? NO_DRAWING;
    const above = this.layers.filter((layer) => layer.kind === 'cells' && layer.id !== 'base');
    const drawings = slots ? [drawingOf(slots.cells)] : above.map(({ id }) => drawingOf(id));
    const scaled = drawings.find((drawing) => drawing.paintLayer) ?? NO_DRAWING;
    const parts = {
      settings: { ...Object.fromEntries([...SAVED_KEYS, 'hasPaint', 'fit', 'imageIsWorkingCopy'].map(key => [key, key === 'hasPaint' ? drawings.some((drawing) => drawing.hasPaint) : this[key]])), paintScale: scaled.paintLayer?.scale ?? null, baseScale: this.baseLayer?.scale ?? null },
      baseRecords: this.baseRecords,
      shapes: slots ? new Map([...this.shapes].map(([key, shape]) => [key, withoutLayer(shape)])) : this.shapes,
    };
    if (this.hasFrames) { // as of the call, as the rest is
      this.noteFrame();
      this.resolvedOf(this.frames.length - 1); // every key frame's shape as it shows, kept on it
      const frames = serializeFrames(this.frames);
      parts.animation = { frames: slots ? oldFrames(frames, slots.cells) : frames, frame: this.frame, fps: this.fps };
    }
    const baseBlob = this.baseLayer?.hasPaint ? this.baseLayer.toBlob() : null;
    if (slots) {
      const paintBlob = drawings[0].paintLayer?.toBlob() ?? null;
      return { ...parts, editCells: drawings[0].editCells, layers: savedLayers(this.layers, { hasShapes: this.shapes.size > 0, baseChars: this.baseChars }), paintBlob: await paintBlob, baseBlob: await baseBlob };
    }
    const paintBlobs = drawings.map((drawing) => (drawing.hasPaint ? drawing.paintLayer.toBlob() : null));
    const stack = await Promise.all(this.layers.map(async (layer) => {
      const at = above.indexOf(layer);
      return at < 0 ? { ...layer } : { ...layer, editCells: drawings[at].editCells, paintBlob: await paintBlobs[at] };
    }));
    return { ...parts, stack, paintBlob: null, baseBlob: await baseBlob };
  },

  async loadProject(file) {
    if (!file || !isProjectFile(file.name)) return;

    try {
      await this.openParts(await readProject(file), { filename: file.name.slice(0, -PROJECT_EXTENSION.length) });
      this.savedToFile = true;
    } catch (e) {
      console.error('Failed to load project file', e);
      const reason = e?.code === 'INVALID_PROJECT' ? t('document.invalidProject') : e?.code === 'DECODE_IMAGE_FAILED' ? t('document.decodeImageFailed') : e.message;
      alert(t('document.loadProjectFailed', { reason }));
    }
  },

  // Autosave's record as the open document, as unsaved as it was. Without a documentId it's a new
  // document, a copy. Throws, for the caller to decide what that means.
  async restoreDocument({ record, imageBuffer }, { documentId }) {
    const parts = await readProject(new Blob([record.rest]));
    await this.openParts({ ...parts, imageBuffer }, { filename: record.filename, documentId });
    this.savedToFile = record.savedToFile;
    if (record.dirty) {
      this.savedSettings = record.savedSettings;
      this.savedEditVersion = this.editVersion - 1;
    }
  },

  // A project's parts (readProject) as the open document. Without a documentId it gets a new one.
  // If it throws, either nothing has changed or no document is open.
  async openParts(parts, options) {
    const pictures = await loadParts(parts);
    if (this._sharing?.role === 'artist') return; // a host's project landed meanwhile (an artist's reload, racing autosave's restore)
    showParts.call(this, parts, pictures, options);
  },

  // The same for the project a host sends an artist (takeProject is the only caller), the one way past
  // HOST_ONLY_ACTIONS, which refuse openParts and what it calls. Open only while it's written, in one go:
  // nothing a person presses can get in. What's open goes first, as it's on the document being replaced.
  // sameDocument: undo and the selection stay (takeProject says when).
  async openFromHost(parts, { sameDocument = false, ...options }) {
    const pictures = await loadParts(parts);
    this.commitPending();
    this._takingProject = true;
    this._sameDocument = sameDocument;
    try {
      showParts.call(this, parts, pictures, options);
    } finally {
      this._takingProject = false;
      this._sameDocument = false;
    }
  },

  // Every frame's cells, built as a still is.
  async animationCells() {
    this.commitPending();
    const cells = [];
    for (let i = 0; i < this.frames.length; i++) cells.push((await this.builtFrame(i)).cells);
    return cells;
  },

  // The animated formats, written from every frame: 'ansimation' (.ans), 'utf8ansimation' (.utf8ans), 'cast' or 'gif'. Throws with userMessage
  // what the save dialog should say.
  async exportAnimation(format, { filename = this.filename } = {}) {
    const frames = await this.animationCells(), lines = charRowsOf(this.rows);
    const durations = this.frames.map((frame) => frameDuration(frame, this.fps));
    let blob, ext = format;
    if (format === 'ansimation' || format === 'utf8ansimation') {
      const utf8 = format === 'utf8ansimation';
      ext = utf8 ? 'utf8ans' : 'ans';
      blob = new Blob([AnsiFile.animationBytes(this.cols, lines, frames, { utf8, colorMode: this.quantize, sauce: this.sauceFields() })], { type: 'application/octet-stream' });
    } else if (format === 'cast') {
      blob = new Blob([castText(this.cols, lines, frames, durations.map((ms) => ms / 1000), { colorMode: this.quantize })], { type: 'application/x-asciicast' });
    } else {
      const shot = await gifFrames(frames, this.cols, lines, durations.map(gifDelay), {
        smooth: useWorkspaceStore().smoothText,
        tooLarge: (pixels) => {
          if (pixels <= MAX_GIF_PIXELS) return;
          throw Object.assign(new Error('Too large for a GIF'), { userMessage: t('save.gifTooLarge') });
        },
      });
      blob = new Blob([gifBytes(shot.width, shot.height, shot.frames)], { type: 'image/gif' });
    }
    this.rename(filename);
    downloadBlob(blob, `${this.filename}.${ext}`);
  },

  // What an art file's SAUCE record says, from the SAUCE tab.
  sauceFields() {
    const comments = [
      `Created with Phosphor`,
      `Params: seed=${this.seed}, smoothing=${this.smoothing}, quantize=${this.quantize}`,
      `Adjust: brightness=${this.brightness}%, contrast=${this.contrast}%, saturation=${this.saturation}%, invert=${this.invert}%`,
      `Effects: blur=${this.blur}, sharpen=${this.sharpen}, flatten=${this.flatten}, edges=${this.edges} (${this.edgeColor}), thickness=${this.edgeThickness}`,
    ];
    if (this.sauceUserComments) {
      comments.push(''); // Spacer
      comments.push(...this.sauceUserComments.split('\n'));
    }
    return {
      use9pxFont: this.sauceUse9pxFont,
      fontName: this.sauceFontName,
      title: this.sauceTitle,
      author: this.sauceAuthor,
      group: this.sauceGroup,
      date: this.sauceDate,
      comments,
    };
  },

  // .ans is CP437: the save dialog lists the characters it can't keep (AnsiFile.unmappable) first. Out of an art layer
  // first: the cells then are the layer's alone, without the drawing.
  async exportFile(ext, { filename = this.filename, ...opts } = {}) {
    if (this._artInside) this.leaveArt();
    const blob = new AnsiFile(this.cols, charRowsOf(this.rows), this.cells).toBlob({
      sauce: this.sauceFields(),
      colorMode: this.quantize,
      utf8: ext === 'utf8ans',
      ...opts,
    });
    this.rename(filename); // once there's a file to give the name to
    downloadBlob(blob, `${this.filename}.${ext}`);
  },

  // Files from before the cell layer drew char edits over paint; now paint draws over edit
  // cells. A migrated char edit on paint takes that paint's colors and the paint is removed, so
  // the file looks as it did. Runs on load, before it's marked saved; not undoable.
  keepMigratedLook() {
    let next = this.editCells;
    const pixels = [];
    for (const [key, entry] of this.editCells) {
      const { col, row } = parseKey(key);
      if (!this.cellHasPaint(col, row)) continue;
      // Only painted halves take the paint's color; an unpainted half keeps showing the image.
      const painted = (y) => {
        const color = this.paintLayer.colorAt(col, y);
        return color ? rgb2hex(color) : undefined;
      };
      next = withCellEdit(next, col, row, { bg: painted(2 * row), fg: painted(2 * row + 1), char: entry.char });
      pixels.push({ x: col, y: 2 * row }, { x: col, y: 2 * row + 1 });
    }
    if (!pixels.length) return;
    this.editCells = next;
    this.paintLayer.erase(pixels);
    this.paintLayer.recheckPaint();
    this.hasPaint = this.paintLayer.hasPaint;
  },
};
