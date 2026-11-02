// The document as a whole: a new image or blank canvas, opening and saving .phosphor projects,
// exporting .ans and .utf8ans, the filename, and what counts as saved.
import { EMPTY_BASE } from '@/document/baseRecords.js';
import { parseKey, withCellEdit } from '@/document/editCells.js';
import { frameDuration, serializeFrames } from '@/document/frames.js';
import { loadImage, readProject, writeProject, downloadBlob, isProjectFile, PROJECT_EXTENSION } from '@/document/projectIO.js';
import { AnsiFile } from '@/lib/AnsiFile.js';
import { castText } from '@/lib/CastFile.js';
import { MAX_GIF_PIXELS, gifBytes, gifDelay, gifFrames } from '@/lib/GifFile.js';
import { gpuMaxSide } from '@/lib/ImageProcessor.js';
import { ctx2d, canvasPng } from '@/lib/Canvas.js';
import { charRowsOf, lockedGrid } from '@/lib/Cells.js';
import { rgb2hex } from '@/lib/ColorUtils.js';
import { toast } from '@/composables/useToast.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { settingDefaults } from '@/store/settings.js';
import { DEFAULT_COLS, DEFAULT_ROWS, BLANK_CANVAS_SCALE, SAVED_KEYS, settingsJson, randomId } from '@/store/project/shared.js';
import { generateSlug } from 'random-word-slugs';
import { shallowRef } from 'vue';

// A project's pictures, decoded: what can fail before anything has changed.
const FRAMES_LOST_WORDS = "This file's animation couldn't be opened, so it opened as a still. Saving it keeps only the still.";
const loadParts = async ({ imageBuffer, paintBuffer, baseBuffer }) => ({
  image: await loadImage(imageBuffer),
  paint: paintBuffer && await loadImage(paintBuffer, 'image/png'),
  basePixels: baseBuffer && await loadImage(baseBuffer, 'image/png'),
});

// A project's parts as the open document, with its pictures decoded. As `this`, the store.
function showParts({ settings, imageBuffer, editCells, baseRecords, erasedCells, migrated, animation, framesLost }, { image, paint, basePixels }, { filename, documentId }) {
  // A setting the file doesn't have (it's older than the setting) is its default, not the last document's.
  this.replaceImage(image, imageBuffer, { ...settingDefaults(), ...settings, filename, savedToFile: false, ...(documentId && { documentId }) });
  try {
    this.editCells = editCells;
    this.setBaseRecords(baseRecords);
    if (paint) {
      this.ensureLayer();
      // Saved with its scale: the whole layer, reaching past the grid if it was shrunk. Older
      // files: paint at the image's size or the grid's.
      if (settings.paintScale) this.paintLayer.extend(Math.round(paint.width / this.paintLayer.scale), Math.round(paint.height / this.paintLayer.scale));
      this.paintLayer.load(paint, settings.paintScale ? null : { width: image.naturalWidth, height: image.naturalHeight }, this.fit);
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
    // Both layers reach as far as either was saved (they're extended together from here on).
    if (this.paintLayer) {
      const cols = Math.max(this.paintLayer.cols, this.baseLayer.cols), rows = Math.max(this.paintLayer.rows, this.baseLayer.rows);
      this.paintLayer.extend(cols, rows);
      this.baseLayer.extend(cols, rows);
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
    if (framesLost && !this._sharing && !this._takingProject) toast(FRAMES_LOST_WORDS);
    this.render();
    this.markSaved();
  } catch (error) {
    this.clearImage(); // the old document is gone by now: not half of this one to draw on or write
    throw error;
  }
}

export const documentActions = {
  randomizeSeed() {
    this.seed = generateSlug(2);
  },

  async setImageFromFile(file) {
    if (!file) return;

    const buffer = await file.arrayBuffer();
    let image;
    try {
      image = await loadImage(buffer, file.type);
    } catch (e) {
      alert(`Couldn't open ${file.name}: ${e.message}`);
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
  // the GPU processes (gpuMaxSide) and Safari draws (16M pixels a canvas).
  async setBlankCanvas() {
    const cols = this.cols || DEFAULT_COLS, rows = this.rows || DEFAULT_ROWS;
    const scale = Math.max(1, Math.min(BLANK_CANVAS_SCALE, Math.floor(gpuMaxSide() / Math.max(cols, rows)), Math.floor(Math.sqrt(16_000_000 / (cols * rows)))));
    const canvas = document.createElement('canvas');
    canvas.width = cols * scale;
    canvas.height = rows * scale;
    const ctx = ctx2d(canvas);
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let blob;
    try {
      blob = await canvasPng(canvas);
    } catch (e) {
      console.error('Failed to start a blank canvas', e);
      alert("Couldn't start a blank canvas.");
      return;
    }
    this.replaceImage(await loadImage(blob), await blob.arrayBuffer(), {
      cols: Math.max(1, cols),
      rows: Math.max(1, rows),
      filename: 'untitled',
      sauceTitle: '',
      savedToFile: false,
    });
    this.markSaved(); // nothing to lose until something is drawn
  },

  // Swap in a new base image and start a fresh document around it.
  replaceImage(image, imageBuffer, patch = {}) {
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
      hasPaint: false,
    });
    this.newDocument();
  },

  // The base layer's records, kept in step with the renderer's copy.
  setBaseRecords(records) {
    this.baseRecords = records;
    this.renderer.baseRecords = records;
  },

  // The current settings and edits are what's on disk (or there's nothing to lose).
  markSaved() {
    this.savedSettings = settingsJson(this);
    this.savedEditVersion = this.editVersion;
  },

  clearImage() {
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
      renderedCells: [],
      paintLayer: null,
      baseLayer: null,
      baseScale: null,
      editCells: new Map(),
      hasPaint: false,
    });
    this.newDocument();
    this.markSaved();
  },

  // A fresh document: no base records or pixels, no history, and the selection (and the Picker's
  // last pick) dropped.
  newDocument() {
    this._document = (this._document ?? 0) + 1; // Bake and Merge into the image check they're still in the same one
    this.setBaseRecords(EMPTY_BASE);
    this.renderer.baseLayer = null;
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
  // toBlob is called), since a room's changes go on while the blobs are made.
  async projectParts() {
    const parts = {
      settings: { ...Object.fromEntries([...SAVED_KEYS, 'hasPaint', 'fit', 'imageIsWorkingCopy'].map(key => [key, this[key]])), paintScale: this.paintLayer?.scale ?? null, baseScale: this.baseLayer?.scale ?? null },
      editCells: this.editCells,
      baseRecords: this.baseRecords,
    };
    if (this.hasFrames) { // as of the call, as the rest is
      this.noteFrame();
      parts.animation = { frames: serializeFrames(this.frames), frame: this.frame, fps: this.fps };
    }
    const paintBlob = this.paintLayer?.toBlob() ?? null, baseBlob = this.baseLayer?.hasPaint ? this.baseLayer.toBlob() : null;
    return { ...parts, paintBlob: await paintBlob, baseBlob: await baseBlob };
  },

  async loadProject(file) {
    if (!file || !isProjectFile(file.name)) return;

    try {
      await this.openParts(await readProject(file), { filename: file.name.slice(0, -PROJECT_EXTENSION.length) });
      this.savedToFile = true;
    } catch (e) {
      console.error('Failed to load project file', e);
      alert('Failed to load project file: ' + e.message);
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
          throw Object.assign(new Error('Too large for a GIF'), { userMessage: 'This animation is too large for a GIF. Fewer frames or a smaller canvas would fit; .cast has no limit.' });
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
      `Effects: sharpen=${this.sharpen}, flatten=${this.flatten}, edges=${this.edges} (${this.edgeColor}), thickness=${this.edgeThickness}`,
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

  // .ans is CP437: the save dialog lists the characters it can't keep (AnsiFile.unmappable) first.
  async exportFile(ext, { filename = this.filename, ...opts } = {}) {
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
