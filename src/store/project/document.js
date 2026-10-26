// The document as a whole: a new image or blank canvas, opening and saving .phosphor projects,
// exporting .ans and .utf8ans, the filename, and what counts as saved.
import { EMPTY_BASE } from '@/document/baseRecords.js';
import { parseKey, withCellEdit } from '@/document/editCells.js';
import { loadImage, readProject, writeProject, downloadBlob, isProjectFile, PROJECT_EXTENSION } from '@/document/projectIO.js';
import { AnsiFile } from '@/lib/AnsiFile.js';
import { gpuMaxSide } from '@/lib/ImageProcessor.js';
import { ctx2d } from '@/lib/Canvas.js';
import { charRowsOf, lockedGrid } from '@/lib/Cells.js';
import { rgb2hex } from '@/lib/ColorUtils.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { settingDefaults } from '@/store/settings.js';
import { DEFAULT_COLS, DEFAULT_ROWS, BLANK_CANVAS_SCALE, SAVED_KEYS, settingsJson } from '@/store/project/shared.js';
import { generateSlug } from 'random-word-slugs';
import { shallowRef } from 'vue';

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

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    this.replaceImage(await loadImage(blob), await blob.arrayBuffer(), {
      cols: Math.max(1, cols),
      rows: Math.max(1, rows),
      filename: 'untitled',
      sauceTitle: '',
    });
    this.markSaved(); // nothing to lose until something is drawn
  },

  // Swap in a new base image and start a fresh document around it.
  replaceImage(image, imageBuffer, patch = {}) {
    this.renderer.reset();
    this.activePalette = [];
    this.$patch({
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
    this.clearHistory();
    const workspace = useWorkspaceStore();
    workspace.selection = workspace.selectionOffset = workspace.lastPick = null;
  },

  // Save and export take the name typed in the save dialog (fileStem: without the extension); it
  // renames the document, so the next save starts from it.
  rename(filename) {
    if (filename?.trim()) this.filename = filename.trim();
  },

  async saveProject(filename = this.filename) {
    if (!this.image || !this.imageBuffer) return;
    this.rename(filename);
    this.commitPending(); // an open typing run counts as saved, not as an edit made after saving

    const settings = { ...Object.fromEntries([...SAVED_KEYS, 'hasPaint', 'fit', 'imageIsWorkingCopy'].map(key => [key, this[key]])), paintScale: this.paintLayer?.scale ?? null, baseScale: this.baseLayer?.scale ?? null };
    const blob = await writeProject({
      settings,
      imageBuffer: this.imageBuffer,
      paintBlob: this.paintLayer ? await this.paintLayer.toBlob() : null,
      baseBlob: this.baseLayer?.hasPaint ? await this.baseLayer.toBlob() : null,
      editCells: this.editCells,
      baseRecords: this.baseRecords,
    });
    downloadBlob(blob, `${this.filename}${PROJECT_EXTENSION}`);
    this.markSaved();
  },

  async loadProject(file) {
    if (!file || !isProjectFile(file.name)) return;

    try {
      const { settings, imageBuffer, paintBuffer, baseBuffer, editCells, baseRecords, erasedCells, migrated } = await readProject(file);
      const image = await loadImage(imageBuffer);
      const paint = paintBuffer && await loadImage(paintBuffer, 'image/png');
      const basePixels = baseBuffer && await loadImage(baseBuffer, 'image/png');

      // A setting the file doesn't have (it's older than the setting) is its default, not the last document's.
      this.replaceImage(image, imageBuffer, { ...settingDefaults(), ...settings, filename: file.name.slice(0, -PROJECT_EXTENSION.length) });
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
      this.render();
      this.markSaved();
    } catch (e) {
      console.error('Failed to load project file', e);
      alert('Failed to load project file: ' + e.message);
    }
  },

  // .ans is CP437: the save dialog lists the characters it can't keep (AnsiFile.unmappable) first.
  async exportFile(ext, { filename = this.filename, ...opts } = {}) {
    this.rename(filename);

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

    const blob = new AnsiFile(this.cols, charRowsOf(this.rows), this.cells).toBlob({
      sauce: {
        use9pxFont: this.sauceUse9pxFont,
        fontName: this.sauceFontName,
        title: this.sauceTitle,
        author: this.sauceAuthor,
        group: this.sauceGroup,
        date: this.sauceDate,
        comments,
      },
      colorMode: this.quantize,
      utf8: ext === 'utf8ans',
      ...opts,
    });
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
