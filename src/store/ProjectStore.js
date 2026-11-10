import { shallowRef, markRaw } from 'vue';
import { defineStore, getActivePinia } from 'pinia';
import { EMPTY_BASE } from '@/document/baseRecords.js';
import Renderer from '@/document/Renderer.js';
import History from '@/document/History.js';
import { newFrame } from '@/document/frames.js';
import { layersFromOld, legacySlots, lowerGroup, sameChars } from '@/document/layerInfo.js';
import { ghostedCells } from '@/lib/ghostCells.js';
import { artBounds } from '@/document/artLayers.js';
import { placedShapes } from '@/document/followers.js';
import { MAX_ANIMATION_CELLS, MAX_FRAME_CELLS, maxFramesFor, MAX_COLS, charRowsOf, lockedGrid, maxColsBeside, maxRowsBeside } from '@/lib/Cells.js';
import { charModeOf } from '@/lib/CharResolver.js';
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
import { sliderActions } from '@/store/project/sliders.js';
import { historyActions } from '@/store/project/history.js';
import { sharingActions, DRAWING_ACTIONS, HOST_ONLY_ACTIONS, WHOLE_LAYER_ACTIONS, lockedOut } from '@/store/project/sharing.js';
import { sharingHostActions } from '@/store/project/sharingHost.js';
import { sharingArtistActions } from '@/store/project/sharingArtist.js';
import { handoverActions } from '@/store/project/handover.js';
import { animationActions } from '@/store/project/animation.js';
import { vectorActions } from '@/store/project/vector.js';
import { layerActions } from '@/store/project/layers.js';
import { PIPELINE_KEYS, savedJson, MAX_HISTORY_BYTES, ALONE, newLedger } from '@/store/project/shared.js';

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

// A layer's params: the drawing's (processParams) with its own character settings over them, made once per processParams
// and chars (layerParams), so each keeps its identity while neither changes: the Renderer's caches go by it.
const OWN_PARAMS = new WeakMap(); // processParams -> WeakMap(chars -> params)
function ownParams(params, chars) {
  let own = OWN_PARAMS.get(params);
  if (!own) OWN_PARAMS.set(params, own = new WeakMap());
  let made = own.get(chars);
  if (!made) {
    const { renderStyle } = params;
    made = {
      ...params,
      chars: renderStyle === 'ansi' ? chars.chars : chars.charsAscii,
      charMode: charModeOf(renderStyle, chars.charChoice, chars.charChoiceAscii),
      charChoice: chars.charChoice,
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

export const useProjectStore = defineStore('project', {
  state: () => ({
    image: shallowRef(null),
    imageBuffer: null, // the image's encoded bytes, saved into .phosphor files
    documentId: null, // who the document is to autosave (useAutosave)
    savedToFile: false, // saved to, or opened from, a .phosphor file at least once (an export can't reopen as a project)
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
    ghostBefore: null, // { frame, built }: the frame before the one showing, built for its staying cells' ghost (buildGhost)
    animate: false, // the bar is up
    _frameSwaps: 0, // how many times the frame showing was swapped in: autosave doesn't count those as edits
    _ghost: markRaw({ memo: new WeakMap() }), // what shownCells worked out last, kept out of what it reacts to

    filename: null,
    cells: shallowRef([]),          // what the ANSI view shows and exports (renderedCells + edit cells + paint)
    composedCells: shallowRef([]),  // the same before the wide-character layout (what partial updates rebuild from)
    lowerCells: shallowRef([]),     // the lower group's alone (renderedCells + its cells layer), which the upper layers are laid over
    renderedCells: shallowRef([]),  // last full render: generated cells only
    activePalette: shallowRef([]),

    // Dirty tracking: settings differ from the last save/load, or edits were committed since then
    savedSettings: null,
    editVersion: 0,
    savedEditVersion: 0,

    // History for undo/redo
    history: markRaw(new History(50, MAX_HISTORY_BYTES)),
    historyVersion: 0, // mirrors history.version so canUndo/canRedo stay reactive

    // Every stroke on the edit layer, position by position; history's entries undo them through it.
    _ledger: firstLedger(),
    _by: ALONE, // who the ledger knows this person as
    _sharing: null, // the room this document is shared with (sharing.js)
    _paused: false,
    _takingProject: false, // a host's project is being written: the guard below doesn't apply (document.js)
    _sameDocument: false, // and it's this document brought up to date, so undo and the selection stay
    _documentN: null, // the ledger's number the open document was autosaved at, as it came back (useAutosave)
    _layersStarted: 0, // how many times the layers have started over for a document opened (document.js: newLayers)
    _artInside: null, // the art layer stepped into, and the drawing kept aside meanwhile (vector.js: enterArt)
    _locks: {}, // in a room, sub -> { key, name }: the art layer they're drawing in, as their cursors say (DrawingStore keeps it)
  }),

  getters: {
    // Inside an art layer, only as far back as where you stepped in, and on only to what was done inside.
    canUndo: (state) => state.historyVersion >= 0 && state.history.canUndo && (!state._artInside || state._artInside.entries.has(state.history.last)),
    // Something to bake: an image, and a Transform, Adjustment or Effect slider off its default.
    // Shapes on the vector layers directly on the bottom make a still bakeable (Bake presses them in); in an animation,
    // or above a cells layer, they stay shapes.
    canFlatten: (state) => !!state.image && state.frames.length <= 1, // the picture is under every frame
    canBake(state) {
      if (!state.image) return false;
      if (!slidersAtDefaults(state)) return true;
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
    // The vector layer is there once it's added, or with the drawing's first shape, and stays when its last one goes.
    hasVectorLayer: (state) => state.layers.some((layer) => layer.kind === 'vector'),
    // Whether the layers are the ones a room holds: the bottom, at most one vector layer, at most one cells layer above it,
    // all with the bottom's character settings (a room has one set).
    fitsRoom() { return !!legacySlots(this.layers, this.baseChars); },
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
      return new Map(this.layers.map((layer) => [layer.id, sameChars(layer.chars, base, layer.kind) ? params : ownParams(params, layer.chars)]));
    },
    // Whether a layer's eye is shut.
    layerHidden() { return (id) => !!this.layerById(id)?.hidden; },
    // A cells layer's cells and paint: the edit layer's fields for editId, else what waits in _layerData.
    cellsOf() { return (id) => (id === this.editId ? this.editCells : this._layerData.get(id)?.editCells ?? NO_CELLS); },
    paintOf() { return (id) => (id === this.editId ? this.paintLayer : this._layerData.get(id)?.paintLayer ?? null); },
    // The layers that show: the bottom always (its eye is the renderer's hideBase), and the rest while their eye is open.
    // Inside an art layer the edit layer's fields hold the art layer's drawing, so its vector layer's eye decides for them.
    shownLayers() { return this.layers.filter((layer, at) => !at || !this.layerHidden(layer.id === this.editId ? this.drawsOn : layer.id)); },
    // The layers the renderer's pipeline converts as one block, and those laid over it (layerInfo.js: lowerGroup).
    lowerGroup() { return lowerGroup(this.shownLayers, this.baseChars); },
    // The cells layer in use is above the lower group (or hidden): an edit to it leaves the group as it is.
    editIsUpper() { return this.lowerGroup.cells !== this.editId; },
    // Anything on any cells layer or the vector layer, of any frame (a grid resize is then a canvas resize).
    hasEdits() {
      if (this.historyVersion < 0 || this._frameSwaps < 0) return false; // read so this follows them: _layerData isn't reactive, and an undo or a frame shown can fill another layer
      return this.hasEditLayer || this.shapes.size > 0 || [...this._layerData.values()].some((data) => data.editCells.size > 0 || data.hasPaint);
    },
    // Anything on the edit layer (or any frame's changes, shapes included), what Clear clears.
    hasEditLayer: (state) => state.editCells.size > 0 || state.hasPaint || (state.frames.length > 1 && state.frames.some((frame, i) => i !== state.frame && frame.changes.size > 0)),
    currentFrame: (state) => state.frames[state.frame],
    // What the ANSI view shows: while playing, the built frame; on a Blank frame, its ghost: what's inherited dimmed,
    // and where the frame before has cells that stay and this one shows nothing, the frame before's picture
    // (ghostBefore) dimmed over this one. cells is never ghosted, so exports can't see one.
    shownCells() {
      const workspace = useWorkspaceStore(), { cells } = this;
      if (workspace.playing && workspace.played) return workspace.played.cells;
      if (this._artInside) return insideCells(this, this._artInside, cells);
      if (!this.animate || !workspace.ghost || !this.frame || this.currentFrame?.kind !== 'blank') return cells;
      const held = this._ghost, frame = this.currentFrame, version = this.historyVersion, rendered = this.renderedCells;
      const before = this.ghostBefore, strength = this.ghostStrength;
      const built = before?.frame === this.frames[this.frame - 1] && before.built.cells.length === cells.length ? before.built : null;
      if (held.frame !== frame || (!this._stroke && (held.version !== version || held.rendered !== rendered))) {
        Object.assign(held, { frame, version, rendered, cells, inherited: this.inheritedCells(), picture: this.pictureCells(), over: new WeakMap() });
      }
      if (held.strength !== strength) Object.assign(held, { strength, memo: new WeakMap(), over: new WeakMap() });
      if (held.built !== built) Object.assign(held, { built, over: new WeakMap() });
      const still = (i) => held.inherited.has(i) && sameLook(cells[i], held.cells[i]); // a stroke's new object: no longer a ghost
      const { cols } = this, params = this.processParams;
      const shown = ghostedCells(
        cells,
        (i) => this.renderer.underCell(i % cols, Math.floor(i / cols), params, rendered),
        (i) => (cells[i].wide === 'trail' ? still(i - 1) : still(i)),
        held.memo,
        strength,
      );
      if (!built || !held.picture.size) return shown;
      // The picture's ghosts are over this frame's cells, so they go (over) when those may have changed.
      const at = (i) => (built.cells[i].wide === 'trail' ? i - 1 : i);
      const pictured = (i) => held.picture.has(at(i)) && cells[i] === held.cells[i]; // drawn on in a stroke: no longer a ghost
      return ghostedCells(shown, (i) => cells[i], pictured, held.over, strength, (i) => built.cells[i]);
    },
    hasFrames: (state) => state.frames.length > 1,
    // How much of its own colors a ghost keeps, 0 to 1: the bar's strength, or with Ghost off none.
    ghostStrength() {
      const workspace = useWorkspaceStore();
      return workspace.ghost ? workspace.ghostStrength / 100 : 0;
    },
    isDirty: (state) => savedJson(state) !== state.savedSettings || state.editVersion !== state.savedEditVersion,
    imageRatio: (state) => {
      if (!state.image) return 1;
      const w = state.image.naturalWidth || state.image.width || 1;
      const h = state.image.naturalHeight || state.image.height || 1;
      return w / h;
    },
    // The grid's largest size (Cells.js): aspect locked, the biggest that keeps the picture's ratio;
    // otherwise the most there's room for beside the other side.
    // With frames, whichever is less: that and an animation's own limit.
    frameCellLimit: (state) => Math.min(MAX_ANIMATION_CELLS, Math.floor(MAX_FRAME_CELLS / state.frames.length)),
    mostFrames: (state) => maxFramesFor(state.cols * charRowsOf(state.rows)),
    maxCols() {
      if (this.hasFrames) return Math.max(1, Math.min(maxColsBeside(this.rows), Math.floor(this.frameCellLimit / Math.max(1, charRowsOf(this.rows)))));
      return this.aspectLock && this.image && !this.hasEdits ? lockedGrid(MAX_COLS, this.imageRatio).cols : maxColsBeside(this.rows);
    },
    maxRows() {
      if (this.hasFrames) return Math.max(2, Math.min(maxRowsBeside(this.cols), 2 * Math.floor(this.frameCellLimit / Math.max(1, this.cols))));
      return this.aspectLock && this.image && !this.hasEdits ? lockedGrid(MAX_COLS, this.imageRatio).rows : maxRowsBeside(this.cols);
    },
    // Why the Animate switch is off, if it is; rooms hold one still document, and frames never travel.
    canAnimate: (state) => !state._sharing && state.cols * charRowsOf(state.rows) <= MAX_ANIMATION_CELLS,
    processParams: (state) => ({
      ...Object.fromEntries(PIPELINE_KEYS.map(key => [key, state[key]])),
      chars: state.renderStyle === 'ansi' ? state.chars : state.charsAscii,
      charMode: charModeOf(state.renderStyle, state.charChoice, state.charChoiceAscii), // how a cell's character is picked (Cells.js)
      charChoice: state.charChoice,
      solids: state.solids,
      patternLight: state.patternLight,
      image: state.image,
      fit: state.fit,
      workScale: state.baseScale,
    }),
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
