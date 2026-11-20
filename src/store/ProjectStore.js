import { shallowRef, markRaw } from 'vue';
import { defineStore, getActivePinia } from 'pinia';
import { EMPTY_BASE } from '@/document/baseRecords.js';
import Renderer from '@/document/Renderer.js';
import History from '@/document/History.js';
import { newFrame } from '@/document/frames.js';
import { layersFromOld, lowerGroup, sameChars } from '@/document/layerInfo.js';
import { MOST_GHOST_FRAMES, ghostCell, ghostFade, ghostedCells, pictureOwners, tinted } from '@/lib/ghostCells.js';
import { artBounds } from '@/document/artLayers.js';
import { placedShapes } from '@/document/followers.js';
import { MAX_ANIMATION_CELLS, MAX_FRAME_CELLS, maxFramesFor, MAX_COLS, charRowsOf, lockedGrid, maxColsBeside, maxRowsBeside } from '@/lib/Cells.js';
import { charModeOf } from '@/lib/CharResolver.js';
import { isUniform, onGrid } from '@/lib/ImageProcessor.js';
import { isSolverRef, solverFor, standInOf, optionValues, filterFor } from '@/plugins/solvers.js';
import { filterGroups, runningFilters } from '@/plugins/filters.js';
import { usePluginStore } from '@/store/PluginStore.js';
import { useRoomStore } from '@/store/RoomStore.js';
import { ANSI_OF_DOS } from '@/lib/XBinFile.js';
import { PALETTES, parseColorList } from '@/lib/ColorUtils.js';
import { blocksOf, decodeBlocks, decodeFont, fontChars, fontKey, pixelAspectOf } from '@/lib/BitmapFont.js';
import { t } from '@/i18n/index.js';
import { notSetUp } from '@/lib/fontSetup.js';
import { CHAR_KEYS, settingsState, slidersAtDefaults } from '@/store/settings.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { combineActions, guarded } from '@/store/project/combineActions.js';
import { documentActions } from '@/store/project/document.js';
import { mergingActions } from '@/store/project/merging.js';
import { selectionActions } from '@/store/project/selection.js';
import { editLayerActions } from '@/store/project/editLayer.js';
import { renderingActions } from '@/store/project/rendering.js';
import { readingActions } from '@/store/project/reading.js';
import { baseLayerActions } from '@/store/project/baseLayer.js';
import { fontActions } from '@/store/project/font.js';
import { sliderActions } from '@/store/project/sliders.js';
import { historyActions } from '@/store/project/history.js';
import { sharingActions, DRAWING_ACTIONS, HOST_ONLY_ACTIONS, WHOLE_LAYER_ACTIONS, lockedOut } from '@/store/project/sharing.js';
import { sharingHostActions } from '@/store/project/sharingHost.js';
import { sharingArtistActions } from '@/store/project/sharingArtist.js';
import { handoverActions } from '@/store/project/handover.js';
import { animationActions } from '@/store/project/animation.js';
import { vectorActions } from '@/store/project/vector.js';
import { layerActions } from '@/store/project/layers.js';
import { PIPELINE_KEYS, layerName, savedJson, MAX_HISTORY_BYTES, ALONE, newLedger } from '@/store/project/shared.js';

// A cell an edit didn't touch stays the same object, except a wide one, which is laid out again with its row.
const sameLook = (a, b) => a === b || (!!a?.wide && !!b && a.wide === b.wide && a.char === b.char && a.fg.hex === b.fg.hex && a.bg.hex === b.bg.hex);

// Stepped into an art layer: outside its box, and where nothing drawn inside has changed what shows since you stepped
// in (entered), the cells show as they did then (snapshot, the drawing with them), dimmed toward what's under them as
// the ghost is. Inside it, and wherever you've drawn, they show as they are. The drawing outside doesn't change while
// you're in (the settings are off), so the whole snapshot is dimmed once (dimmed, for the render it was made over) and
// an edit only picks, cell by cell, the dimmed one or the one as it is.
// ponytail: still one pass of cheap compares over every cell per edit (about 6 ms at 500k), and an edit big enough to
// rebuild every cell dims the snapshot again; keep the edit's cell range if large grids lag here.
function insideCells(project, inside, cells) {
  const { key, snapshot, entered } = inside, shape = placedShapes(project).get(key); // where it shows: a follower on its path
  if (!shape || snapshot.length !== cells.length) return cells;
  const { cols } = project, rendered = project.renderedCells, { x, y, w, h } = artBounds(shape);
  if (inside.dimmedOver !== rendered) {
    const params = project.processParams;
    inside.dimmed = ghostedCells(snapshot, (i) => project.renderer.underCell(i % cols, Math.floor(i / cols), params, rendered), () => true);
    inside.dimmedOver = rendered;
  }
  const { dimmed } = inside, kept = entered.length === cells.length && entered;
  const same = (a, b) => !b || a === b || (a.char === b.char && a.fg.hex === b.fg.hex && a.bg.hex === b.bg.hex);
  return cells.map((cell, i) => {
    if (dimmed[i] === snapshot[i]) return cell; // nothing under it to dim toward
    const col = i % cols, row = (i - col) / cols;
    const out = col < x || col >= x + w || 2 * row < y || 2 * row >= y + h;
    return out && same(cell, kept && kept[i]) ? dimmed[i] : cell;
  });
}

const NO_CELLS = new Map(); // a hidden or empty layer's cells, never changed
const NO_FILTERS = Object.freeze([]); // no plugin filter runs: one array, so params made again compare the same

// A layer's params: the drawing's (processParams) with its own character settings over them, made once per processParams
// and chars (layerParams), so each keeps its identity while neither changes: the Renderer's caches go by it. With a
// drawing font (params.font) the characters are the font's (fontChars), as processParams' are.
const fitted = (font, chars) => (font ? fontChars(chars, font) : chars);
const OWN_PARAMS = new WeakMap(); // processParams -> WeakMap(chars -> params)

// What a layer's plugin solver comes to in its params: the solver to use (null for a built-in, or a stand-in), its options,
// the script it's from (solverHash: a Reload renders again), the one the layer wants whether or not it's used, and why it
// isn't (plugins/solvers.js standInOf). Reads what the plugin store and the room change, so the params made from it are
// made again when they do (processParams reads them first). No solver's options are one object, so params made again
// with nothing changed compare the same (followParams).
const NO_OPTIONS = Object.freeze({});
function solverParams(chars, renderStyle, inRoom) {
  const plugins = usePluginStore(), choice = renderStyle === 'ansi' ? chars.charChoice : chars.charChoiceAscii;
  if (!isSolverRef(choice)) return { solver: null, solverOptions: NO_OPTIONS, solverHash: null, wantedSolver: null, standIn: null };
  const standIn = standInOf({ ref: choice, renderStyle, inRoom, pluginsOff: plugins.off, pluginState: plugins.pluginState });
  const found = standIn ? null : solverFor(choice);
  return {
    solver: found ? choice : null, solverOptions: found ? optionValues(found.def, chars.solverOptions?.[choice]) : NO_OPTIONS,
    solverHash: found?.hash ?? null, wantedSolver: choice, standIn,
  };
}
function ownParams(params, chars, inRoom, font) {
  let own = OWN_PARAMS.get(params);
  if (!own) OWN_PARAMS.set(params, own = new WeakMap());
  let made = own.get(chars);
  if (!made) {
    const { renderStyle } = params;
    made = {
      ...params,
      chars: fitted(font, renderStyle === 'ansi' ? chars.chars : chars.charsAscii),
      charMode: renderStyle === 'ansi' && font && blocksOf(font)[1] === null ? 'best' : charModeOf(renderStyle, chars.charChoice, chars.charChoiceAscii), // (no lower half: Best match, as the drawing's own)
      charChoice: chars.charChoice,
      ...solverParams(chars, renderStyle, inRoom),
      seed: chars.seed,
      solids: chars.solids,
      patternLight: chars.patternLight,
      ditherStyle: chars.ditherStyle ?? params.ditherStyle, // a cells layer holds none (layerInfo.js layerChars)
      dither: chars.dither ?? params.dither,
    };
    own.set(chars, made);
  }
  return made;
}

// While the state is made there's no store yet, but there is by the time the ledger reads.
function firstLedger() {
  const pinia = getActivePinia();
  return newLedger(() => useProjectStore(pinia));
}

// decodeFont's last answer, so the getter doesn't decode the same string for each store. blocks: the drawing's own
// (fontBlocks), when they decode; else the font has none and they're found.
let lastFont = { text: '', name: '', blocks: '', font: null };
function fontFor(text, name, blocks) {
  if (!text) return null;
  if (lastFont.text !== text || lastFont.name !== name || lastFont.blocks !== blocks) {
    const font = decodeFont(text, name), set = decodeBlocks(blocks);
    lastFont = { text, name, blocks, font: font && set ? { ...font, blocks: set } : font };
  }
  return lastFont.font;
}

export const useProjectStore = defineStore('project', {
  state: () => ({
    image: shallowRef(null),
    imageBuffer: null, // the image's encoded bytes, saved into .phosphor files
    documentId: null, // who the document is to autosave (useAutosave)
    fileId: null, // the drawing, across its saved files and autosave: what this browser keeps for it is kept under it
    savedToFile: false, // saved to, or opened from, a .phosphor file at least once (an export can't reopen as a project)
    asOpened: false, // what's open is a file as it opened, with no change since: autosave keeps it as the As opened version at the first
    filePath: null,     // desktop: the .phosphor file it was opened from or last saved to, which Save writes over
    fileHandle: null,   // web, where the browser has savesInPlace: the same, as the browser's handle to it (marked raw)
    imageIsWorkingCopy: false, // the image is a working-size copy (after a Bake or an Into-the-picture merge), not the one loaded
    ...settingsState(),

    hasPaint: false,
    renderer: markRaw(new Renderer()),
    paintLayer: null, // PaintLayer (markRaw); hasPaint mirrors paintLayer.hasPaint for reactivity
    baseLayer: null,  // the base layer's own pixels: a PaintLayer at the processing scale (markRaw), over the image
    baseScale: null,  // the base layer's scale (the pipeline processes at it), or a loaded file's until the layer exists
    fit: null,        // where the image sits in the grid ({ dx, dy, dw, dh }); fixed while the edit layer has content
    paintScale: null, // the paint layer's scale from a loaded file (its saved paint is at that scale)
    editCells: shallowRef(new Map()), // the edit cells (see document/editCells.js)
    shapes: shallowRef(new Map()), // the vector layer's shapes, 'v:<id>' -> Shape (document/shapes.js), the frame showing's
    layers: layersFromOld(null, { hasShapes: false }), // the drawing's layers, bottom first (document/layerInfo.js; replaced, never changed in place)
    editId: 'edit', // the cells layer editCells, paintLayer and hasPaint are (project/layers.js: useLayer)
    _layerData: markRaw(new Map()), // every other cells layer above the bottom: id -> { editCells, paintLayer, hasPaint }
    _basePaint: null, // the empty paint layer the edit layer's fields hold while the base is the layer in use (shared.js: baseFields)
    _shapeLayer: null, // the base layer with the shapes over it (ShapeLayer, markRaw), the renderer's
    _upperShapes: markRaw(new Map()), // each vector layer above the lower group: id -> its shapes drawn alone (ShapeLayer), the renderer's upper
    baseRecords: shallowRef(EMPTY_BASE), // the base layer's pinned characters (see document/baseRecords.js)

    // Animation (store/project/animation.js): the showing frame's resolved state is editCells and paintLayer.
    frames: shallowRef([newFrame('blank')]),
    frame: 0,    // which one's showing
    fps: 8,
    ghostFrames: [], // [{ frame, built, at }]: frames near the one showing (at: how far, before negative), built for their pictures' ghost (buildGhost)
    animate: false, // the bar is up
    _frameSwaps: 0, // how many times the frame showing was swapped in: autosave doesn't count those as edits
    _ghost: markRaw({ memo: new WeakMap() }), // what shownCells worked out last, kept out of what it reacts to

    filename: null,
    fileExt: null, // the extension of the file it came from or last went to (phosphor, ans, png), for the start screen's list
    cells: shallowRef([]),          // what the ANSI view shows and exports (renderedCells + edit cells + paint)
    composedCells: shallowRef([]),  // the same before the wide-character layout (what partial updates rebuild from)
    lowerCells: shallowRef([]),     // the lower group's alone (renderedCells + its cells layer), which the upper layers are laid over
    renderedCells: shallowRef([]),  // last full render: generated cells only
    activePalette: shallowRef([]),

    // Dirty tracking: settings differ from the last save/load, or edits were committed since then
    savedSettings: null,
    editVersion: 0,
    savedEditVersion: 0,
    pickedUp: null, // picked up from the start screen's list with unsaved changes: its edit version and settings as it came (unsavedChanges)

    // History for undo/redo
    history: markRaw(new History(50, MAX_HISTORY_BYTES)),
    historyVersion: 0, // mirrors history.version so canUndo/canRedo stay reactive

    // Every stroke on the edit layer, position by position; history's entries undo them through it.
    _ledger: firstLedger(),
    _by: ALONE, // who the ledger knows this person as
    _sharing: null, // the room this document is shared with (sharing.js)
    _hosting: false, // a room you host shows this document, with or without anyone drawing in it (RoomStore)
    _paused: false,
    _takingProject: false, // a host's project is being written: the guard below doesn't apply (document.js)
    _sameDocument: false, // and it's this document brought up to date, so undo and the selection stay
    _documentN: null, // the ledger's number the open document was autosaved at, as it came back (useAutosave)
    _layersStarted: 0, // how many times the layers have started over for a document opened (document.js: newLayers)
    _artInside: null, // the art layer stepped into, and the drawing kept aside meanwhile (vector.js: enterArt)
    _locks: {}, // in a room, sub -> { key, name }: the art layer they're drawing in, as their cursors say (DrawingStore keeps it)
    _picks: {}, // in a room, sub -> { layer, name }: the layer they've picked, as their cursors say (DrawingStore keeps it)
  }),

  getters: {
    // The drawing's bitmap font, or null: decoded once for each fontBitmap.
    drawingFont: (state) => fontFor(state.fontBitmap, state.fontName, state.fontBlocks),
    // A grid pixel's height over its width in the drawing's font: 1 with none or an 8x16 one, 0.5 in 8x8.
    pixelAspect() { return pixelAspectOf(this.drawingFont); },
    // Why paint is off, or null: paint is stored as pixels and shown as lower half blocks, so a drawing whose font has none can't show it.
    paintOff() {
      const font = this.drawingFont;
      return font && blocksOf(font)[1] === null ? t('tools.paintOff', { name: font.name }) : null;
    },
    // Why the drawing's font can't go into a room, or null: a room can't edit its blocks, so all eight need a slot.
    fontNotSetUp() {
      return notSetUp(this.drawingFont);
    },
    // The 16 colors an XBin export holds, as hexes in XBin's DOS order, or null when the drawing's palette is more.
    xbinPalette(state) {
      const hexes = (colors) => (colors.length >= 1 && colors.length <= 16 ? colors.map((c) => c.hex) : null);
      if (state.quantize === 'cga') return ANSI_OF_DOS.map((i) => PALETTES.cga[i].hex);
      if (state.quantize === 'count') return state.colorCount <= 16 ? hexes(state.activePalette) : null;
      if (state.quantize === 'palette') return hexes(parseColorList(state.palette));
      return null;
    },
    // Inside an art layer, only as far back as where you stepped in, and on only to what was done inside.
    canUndo: (state) => state.historyVersion >= 0 && state.history.canUndo && (!state._artInside || state._artInside.entries.has(state.history.last)),
    // Something to bake: an image, and a Transform, Adjustment or Effect slider off its default.
    // Shapes on the vector layers directly on the bottom make a still bakeable (Bake presses them in); in an animation,
    // or above a cells layer, they stay shapes.
    canFlatten: (state) => !!state.image && state.frames.length <= 1, // the picture is under every frame
    // A plugin filter counts only while it runs (processParams.pluginFilters): one that isn't there (missing, off, failed)
    // keeps its values, and Bake leaves them.
    canBake(state) {
      if (!state.image) return false;
      if (!slidersAtDefaults({ ...this.sliderValues(), filterOptions: {} }) || this.processParams.pluginFilters.length) return true;
      const { vectors } = lowerGroup(state.layers, state.baseChars);
      return state.frames.length <= 1 && [...state.shapes.values()].some((shape) => vectors.includes(shape.layer ?? 'vector'));
    },
    // The image is still the one loaded, at its own size (the merge dialog says what Into the image costs).
    pictureIsOriginal: (state) => !state.imageIsWorkingCopy,
    canRedo: (state) => state.historyVersion >= 0 && state.history.canRedo && (!state._artInside || state._artInside.entries.has(state.history.next)),
    artInside: (state) => state._artInside?.key ?? null, // the art layer stepped into
    // The layer what's drawn on the edit layer's fields lands on: the cells layer in use, or inside an art layer the vector
    // layer the art layer is on.
    drawsOn: (state) => (state._artInside ? state.shapes.get(state._artInside.key)?.layer ?? 'vector' : state.editId),
    // Who's drawing in an art layer: me while I'm in it, or whoever else the room says is, or null. Only one at a time:
    // no one else steps in (enterArt) or changes it (setShapes, and a host what an artist sends: takeFromArtist).
    lockedBy: (state) => (key) => (state._artInside?.key === key ? state._by
      : Object.keys(state._locks).find((sub) => sub !== state._by && state._locks[sub].key === key) ?? null),
    layerById: (state) => (id) => state.layers.find((layer) => layer.id === id),
    // A shape's vector layer's place in the stack, for stacked(shapes, rank): shapes are numbered (z) across every vector
    // layer in the order they were drawn, so which is over which is its layer's place first, then its z. Everything that
    // asks what's on top (a click, a box, Join's bottom shape, a copy's order) asks with this.
    shapeRank: (state) => (shape) => state.layers.findIndex((layer) => layer.id === (shape.layer ?? 'vector')),
    // The vector layer is there once it's added, or with the drawing's first shape, and stays when its last one goes.
    hasVectorLayer: (state) => state.layers.some((layer) => layer.kind === 'vector'),
    // The bottom's character settings: the document's own fields (settings.js CHAR_KEYS).
    baseChars: (state) => Object.fromEntries(CHAR_KEYS.map((key) => [key, state[key]])),
    // A layer's character settings: its own (layer.chars), the bottom's for the bottom, or for a layer that has none yet;
    // a cells layer's Dither is the bottom's (it holds none: layerChars), so a layer made from it takes that.
    charsOf() {
      return (id) => {
        const layer = id !== 'base' && this.layerById(id);
        if (!layer?.chars) return this.baseChars;
        return layer.kind === 'cells' ? { ...layer.chars, ditherStyle: this.ditherStyle, dither: this.dither } : layer.chars;
      };
    },
    // Each layer's params, by id: processParams with its own character settings over them, or processParams itself for a
    // layer whose settings are the bottom's (ownParams keeps each one's identity while nothing changes).
    layerParams() {
      const params = this.processParams, base = this.baseChars;
      return new Map(this.layers.map((layer) => [layer.id, sameChars(layer.chars, base, layer.kind) ? params : ownParams(params, layer.chars, this.inRoom, this.drawingFont)]));
    },
    // The base and the layers whose characters are a plugin's solver, a stand-in or not, in stack order.
    pluginSolverLayers() {
      return this.layers.filter((layer) => {
        const chars = this.charsOf(layer.id);
        return isSolverRef(this.renderStyle === 'ansi' ? chars.charChoice : chars.charChoiceAscii);
      }).map((layer) => ({ id: layer.id, name: layerName(layer) }));
    },
    // Whether a layer's eye is shut.
    layerHidden() { return (id) => !!this.layerById(id)?.hidden; },
    // A cells layer's cells and paint: the edit layer's fields for editId, else what waits in _layerData.
    cellsOf() { return (id) => (id === this.editId ? this.editCells : this._layerData.get(id)?.editCells ?? NO_CELLS); },
    paintOf() { return (id) => (id === this.editId ? this.paintLayer : this._layerData.get(id)?.paintLayer ?? null); },
    // The layers that show: the bottom always (its eye is the renderer's hideBase), and the rest while their eye is open.
    // Inside an art layer the edit layer's fields hold the art layer's drawing, so its vector layer's eye decides for them.
    shownLayers() { return this.layers.filter((layer, at) => !at || !this.layerHidden(layer.id === this.editId ? this.drawsOn : layer.id)); },
    // The cells of each cells layer that shows, the base left out: whose characters the Overlay draws (ownIndexes).
    ownCellMaps() { return this.shownLayers.filter((layer, at) => at && layer.kind === 'cells').map((layer) => this.cellsOf(layer.id)); },
    // The layers the renderer's pipeline converts as one block, and those laid over it (layerInfo.js: lowerGroup).
    lowerGroup() { return lowerGroup(this.shownLayers, this.baseChars); },
    // The cells layer in use is above the lower group (or hidden): an edit to it leaves the group as it is.
    editIsUpper() { return this.lowerGroup.cells !== this.editId; },
    // Anything on any cells layer or the vector layer, of any frame (a grid resize is then a canvas resize).
    hasEdits() {
      if (this.historyVersion < 0 || this._frameSwaps < 0) return false; // read so this follows them: _layerData isn't reactive, and an undo or a frame shown can fill another layer
      return this.hasEditLayer || this.shapes.size > 0 || [...this._layerData.values()].some((data) => data.editCells.size > 0 || data.hasPaint);
    },
    // A grid change is a canvas resize (rendering.js: ensureLayer): with anything drawn, the base's pinned characters and
    // own pixels too (a new drawing is drawn on the base), or with a step undo or redo could bring back that's tied to where
    // things are, which a rescale would leave pointing at the wrong places. Slider and character settings steps aren't, nor
    // are selection steps or a layer added or moved (a rescale drops those).
    resizesCanvas() {
      return this.hasEdits || this.baseRecords.pins.size > 0 || !!this.baseLayer?.hasPaint
        || (this.historyVersion >= 0 && this.history.some((entry) => !entry.settingsOnly && !entry.selectionOnly && !entry.stackOnly));
    },
    // Anything on the edit layer (or any frame's changes, shapes included), what Clear clears.
    hasEditLayer: (state) => state.editCells.size > 0 || state.hasPaint || (state.frames.length > 1 && state.frames.some((frame, i) => i !== state.frame && frame.changes.size > 0)),
    currentFrame: (state) => state.frames[state.frame],
    // What the ANSI view shows: while playing, the built frame; on a Blank frame, its ghost: what's inherited dimmed,
    // and over it, pictures of the frames near this one (ghostPictures) where they drew and this one shows nothing.
    // cells is never ghosted, so exports can't see one.
    shownCells() {
      const workspace = useWorkspaceStore(), { cells } = this;
      if (workspace.playing && workspace.played) return workspace.played.cells;
      if (this._artInside) return insideCells(this, this._artInside, cells);
      if (!this.animate || !workspace.ghost || !this.frame || this.currentFrame?.kind !== 'blank') return cells;
      const held = this._ghost, frame = this.currentFrame, version = this.historyVersion, rendered = this.renderedCells;
      const strength = this.ghostStrength, pictures = this.ghostPictures;
      if (held.frame !== frame || (!this._stroke && (held.version !== version || held.rendered !== rendered))) {
        Object.assign(held, { frame, version, rendered, cells, inherited: this.inheritedCells(), sets: new Map(), shared: {}, owners: null, over: new Map() });
      }
      if (held.strength !== strength) Object.assign(held, { strength, memo: new WeakMap(), over: new Map() });
      if (held.pictures !== pictures) Object.assign(held, { pictures, owners: null, over: new Map() });
      const still = (i) => held.inherited.has(i) && sameLook(cells[i], held.cells[i]); // a stroke's new object: no longer a ghost
      const { cols } = this, params = this.processParams;
      const shown = ghostedCells(
        cells,
        (i) => this.renderer.underCell(i % cols, Math.floor(i / cols), params, rendered),
        (i) => (cells[i].wide === 'trail' ? still(i - 1) : still(i)),
        held.memo,
        strength,
      );
      if (!pictures.length) return shown;
      // Each index the nearest picture's that has it. The pictures' ghosts are over this frame's cells, so they go (over)
      // when those may have changed.
      held.owners ??= pictureOwners(pictures.map((picture) => {
        if (!held.sets.has(picture.at)) held.sets.set(picture.at, this.pictureCells(this.frame + picture.at, held.shared));
        return { ...picture, cells: held.sets.get(picture.at) };
      }));
      let out = null;
      for (const [i, picture] of held.owners) {
        if (cells[i] !== held.cells[i]) continue; // drawn on in a stroke: no longer a ghost
        const memo = held.over.get(picture.at) ?? held.over.set(picture.at, new WeakMap()).get(picture.at), cell = picture.built.cells[i];
        let ghost = memo.get(cell);
        if (!ghost) memo.set(cell, ghost = ghostCell(picture.tint ? tinted(cell) : cell, cells[i], picture.strength));
        (out ??= shown.slice())[i] = ghost;
      }
      return out ?? shown;
    },
    // The frames near the one showing whose pictures shownCells ghosts, nearest first (the frame before ahead of the
    // frame after at the same distance): ghostFrames as many as the Ghost box asks for, each with its strength, the
    // nearest the ghost's and each further one less, and the frames after tinted.
    ghostPictures() {
      const { before, after } = this.ghostReach, strength = this.ghostStrength, size = this.cols * charRowsOf(this.rows); // not cells: a redraw isn't a new list
      return this.ghostFrames
        .filter(({ frame, built, at }) => (at < 0 ? -at <= before : at <= after) && this.frames[this.frame + at] === frame && built.cells.length === size)
        .map((picture) => ({ ...picture, tint: picture.at > 0, strength: strength * ghostFade(Math.abs(picture.at), picture.at < 0 ? before : after) }))
        .sort((a, b) => Math.abs(a.at) - Math.abs(b.at) || a.at - b.at);
    },
    // How many frames before (1 to 5) and after (0 to 5) the Ghost box asks for.
    ghostReach() {
      const workspace = useWorkspaceStore(), count = (value, least) => Math.min(MOST_GHOST_FRAMES, Math.max(least, Math.round(Number(value)) || least));
      return { before: count(workspace.ghostFramesBefore, 1), after: count(workspace.ghostFramesAfter, 0) };
    },
    hasFrames: (state) => state.frames.length > 1,
    // How much of its own colors a ghost keeps, 0 to 1: the bar's strength, or with Ghost off none.
    ghostStrength() {
      const workspace = useWorkspaceStore();
      return workspace.ghost ? workspace.ghostStrength / 100 : 0;
    },
    isDirty: (state) => savedJson(state) !== state.savedSettings || state.editVersion !== state.savedEditVersion,
    // Unsaved changes to ask about before the drawing is left: dirty, but not a drawing picked up from the start
    // screen's list as it came (it's in the browser already, and leaving it again loses nothing new).
    unsavedChanges() {
      const { pickedUp } = this;
      return this.isDirty && !(pickedUp && pickedUp.editVersion === this.editVersion && pickedUp.settings === savedJson(this));
    },
    imageRatio: (state) => {
      if (!state.image) return 1;
      const w = state.image.naturalWidth || state.image.width || 1;
      const h = state.image.naturalHeight || state.image.height || 1;
      return w / h;
    },
    // A picture made from the grid, whose pixels are grid pixels already: one color all over (a blank canvas, Flatten's
    // black) or a working copy (Bake, Into the image). It fits at its own pixels' shape (fitAspect 1); a photo or a file has
    // square pixels, and fits in the drawing's cell shape (pixelAspect).
    gridPicture: (state) => state.imageIsWorkingCopy || (!!state.image && isUniform(state.image)),
    fitAspect() { return this.gridPicture ? 1 : this.pixelAspect; },
    // The picture's shape in grid pixels: columns over grid-pixel rows.
    gridRatio() { return this.imageRatio * this.fitAspect; },
    // The shape the aspect lock keeps, in grid pixels: the one it was locked at (aspectRatio), or the picture's own.
    lockRatio() { return Number(this.aspectRatio) > 0 ? Number(this.aspectRatio) : this.gridRatio; },
    // The grid's largest size (Cells.js): aspect locked, the biggest that keeps the lock's ratio (lockRatio);
    // otherwise the most there's room for beside the other side.
    // With frames, whichever is less: that and an animation's own limit.
    frameCellLimit: (state) => Math.min(MAX_ANIMATION_CELLS, Math.floor(MAX_FRAME_CELLS / state.frames.length)),
    mostFrames: (state) => maxFramesFor(state.cols * charRowsOf(state.rows)),
    maxCols() {
      if (this.hasFrames) return Math.max(1, Math.min(maxColsBeside(this.rows), Math.floor(this.frameCellLimit / Math.max(1, charRowsOf(this.rows)))));
      return this.aspectLock && this.image ? lockedGrid(MAX_COLS, this.lockRatio).cols : maxColsBeside(this.rows);
    },
    maxRows() {
      if (this.hasFrames) return Math.max(2, Math.min(maxRowsBeside(this.cols), 2 * Math.floor(this.frameCellLimit / Math.max(1, this.cols))));
      return this.aspectLock && this.image ? lockedGrid(MAX_COLS, this.lockRatio).rows : maxRowsBeside(this.cols);
    },
    // In a room: hosting it, or drawing in someone else's.
    inRoom: (state) => !!state._sharing || state._hosting,
    // Why the Animate switch is off, if it is; rooms hold one still document, and frames never travel.
    canAnimate: (state) => !state._sharing && !state._hosting && state.cols * charRowsOf(state.rows) <= MAX_ANIMATION_CELLS,
    // Whether Smoothing changes the drawing, so the panel shows it (#200). It scales the picture to the grid, and the base's
    // own pixels: not a picture with nothing finer than a grid pixel (a blank canvas's, or what Into the image makes of
    // one), nor base pixels laid a grid pixel at a time; a picture merged down onto the base, yes. editVersion: the base's
    // pixels aren't reactive, and every change to them is an edit (or an undo, or a room's).
    smoothingMatters() {
      if (!this.image) return false;
      void this.editVersion;
      return !onGrid(this.image, this.processParams) || !!this.baseLayer?.finerThanGrid();
    },
    // The plugin filters' groups in the settings column (plugins/filters.js): those installed, in the Plugins dialog's
    // order and then each script's, then the drawing's saved ones that aren't. None in a room, where no filter applies.
    filterGroups() {
      if (this.inRoom || useRoomStore().inRoom) return []; // hosting or drawing in one, as the panel goes by the room's role
      const plugins = usePluginStore();
      void plugins.solverStamp; // a script registered again (a Reload) is the same slice with a new hash
      const order = new Map(plugins.plugins.map(({ id }, i) => [id, i]));
      const installed = Object.entries(plugins.filters).map(([ref, { pluginId, index }]) => ({ ref, pluginId, index, found: filterFor(ref) }))
        .filter(({ found }) => found)
        .sort((a, b) => (order.get(a.pluginId) ?? order.size) - (order.get(b.pluginId) ?? order.size) || a.index - b.index)
        .map(({ ref, pluginId, found }) => ({ ref, pluginId, hash: found.hash, def: found.def }));
      return filterGroups({ saved: this.filterOptions, installed, pluginState: plugins.pluginState, pluginsOff: plugins.off, failures: plugins.filterFailures });
    },
    // font: the drawing font's key (BitmapFont.fontKey), or null; with one, chars are only what it holds (fontChars).
    processParams(state) {
      const plugins = usePluginStore();
      void plugins.solverStamp; void plugins.off; void plugins.plugins.map(({ id, enabled }) => id + enabled); // the params made anew when the plugins change
      const running = runningFilters(this.filterGroups);
      return {
        ...Object.fromEntries(PIPELINE_KEYS.map(key => [key, state[key]])),
        font: state.drawingFont && fontKey(state.drawingFont),
        chars: fitted(state.drawingFont, state.renderStyle === 'ansi' ? state.chars : state.charsAscii),
        charMode: state.renderStyle === 'ansi' && state.paintOff ? 'best' : charModeOf(state.renderStyle, state.charChoice, state.charChoiceAscii), // (paint off: Best match) how a cell's character is picked (Cells.js)
        charChoice: state.charChoice,
        ...solverParams(state, state.renderStyle, this.inRoom),
        solids: state.solids,
        patternLight: state.patternLight,
        image: state.image,
        fit: state.fit,
        fitAspect: state.fitAspect, // where the picture fits when fit isn't fixed (fitRect)
        workScale: state.baseScale,
        pluginFilters: running.length ? running : NO_FILTERS, // in run order, as WebGLProcessor takes them
      };
    },
  },

  // One file per area in store/project/ (AGENTS.md, "Where things live").
  actions: guarded(guarded(guarded(combineActions(
    documentActions,
    renderingActions,
    readingActions,
    editLayerActions,
    baseLayerActions,
    selectionActions,
    mergingActions,
    sliderActions,
    fontActions,
    historyActions,
    sharingActions,
    sharingHostActions,
    sharingArtistActions,
    handoverActions,
    animationActions,
    vectorActions,
    layerActions,
  ), WHOLE_LAYER_ACTIONS, lockedOut), DRAWING_ACTIONS, (store) => store._paused), HOST_ONLY_ACTIONS, (store) => !!store._sharing && (store._sharing.role === 'artist' || store._paused) && !store._takingProject),
});
