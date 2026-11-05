import { shallowRef, markRaw } from 'vue';
import { defineStore, getActivePinia } from 'pinia';
import { EMPTY_BASE } from '@/document/baseRecords.js';
import Renderer from '@/document/Renderer.js';
import History from '@/document/History.js';
import { newFrame } from '@/document/frames.js';
import { ghostedCells } from '@/lib/ghostCells.js';
import { MAX_ANIMATION_CELLS, MAX_FRAME_CELLS, maxFramesFor, MAX_COLS, charRowsOf, lockedGrid, maxColsBeside, maxRowsBeside } from '@/lib/Cells.js';
import { charModeOf } from '@/lib/CharResolver.js';
import { settingsState, slidersAtDefaults } from '@/store/settings.js';
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
import { sharingActions, DRAWING_ACTIONS, HOST_ONLY_ACTIONS } from '@/store/project/sharing.js';
import { sharingHostActions } from '@/store/project/sharingHost.js';
import { sharingArtistActions } from '@/store/project/sharingArtist.js';
import { handoverActions } from '@/store/project/handover.js';
import { animationActions } from '@/store/project/animation.js';
import { vectorActions } from '@/store/project/vector.js';
import { PIPELINE_KEYS, settingsJson, MAX_HISTORY_BYTES, ALONE, newLedger } from '@/store/project/shared.js';

// A cell an edit didn't touch stays the same object, except a wide one, which is laid out again with its row.
const sameLook = (a, b) => a === b || (!!a?.wide && !!b && a.wide === b.wide && a.char === b.char && a.fg.hex === b.fg.hex && a.bg.hex === b.bg.hex);

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
    _shapeLayer: null, // the base layer with the shapes over it (ShapeLayer, markRaw), the renderer's
    baseRecords: shallowRef(EMPTY_BASE), // the base layer's pinned characters (see document/baseRecords.js)

    // Animation (store/project/animation.js): the showing frame's resolved state is editCells and paintLayer.
    frames: shallowRef([newFrame('blank')]),
    frame: 0,    // which one's showing
    fps: 8,
    cellsCarry: true, // a Blank frame shows the cells before it; false: only its own, the frame before its ghost
    ghostBefore: null, // with cells not carrying, { frame, built }: the frame before the one showing, built (buildGhost)
    animate: false, // the bar is up
    _frameSwaps: 0, // how many times the frame showing was swapped in: autosave doesn't count those as edits
    _ghost: markRaw({ memo: new WeakMap() }), // what shownCells worked out last, kept out of what it reacts to

    filename: null,
    cells: shallowRef([]),          // what the ANSI view shows and exports (renderedCells + edit cells + paint)
    composedCells: shallowRef([]),  // the same before the wide-character layout (what partial updates rebuild from)
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
  }),

  getters: {
    canUndo: (state) => state.historyVersion >= 0 && state.history.canUndo,
    // Something to bake: an image, and a Transform, Adjustment or Effect slider off its default.
    // Shapes alone make a still bakeable (Bake presses them in); in an animation they stay shapes.
    canBake: (state) => !!state.image && (!slidersAtDefaults(state) || (state.shapes.size > 0 && state.frames.length <= 1)),
    // The image is still the one loaded, at its own size (the merge dialog says what Into the image costs).
    pictureIsOriginal: (state) => !state.imageIsWorkingCopy,
    canRedo: (state) => state.historyVersion >= 0 && state.history.canRedo,
    // Anything on the edit layer or the vector layer, of any frame (a grid resize is then a canvas resize).
    hasEdits() { return this.hasEditLayer || this.shapes.size > 0; },
    // Anything on the edit layer (or any frame's changes, shapes included), what Clear clears.
    hasEditLayer: (state) => state.editCells.size > 0 || state.hasPaint || (state.frames.length > 1 && state.frames.some((frame, i) => i !== state.frame && frame.changes.size > 0)),
    currentFrame: (state) => state.frames[state.frame],
    // What the ANSI view shows: while playing, the built frame; on a Blank frame, its ghost: what's inherited dimmed, or
    // with cells not carrying, the frame before's picture (ghostBefore) dimmed over this one where it has no cells.
    // cells is never ghosted, so exports can't see one.
    shownCells() {
      const workspace = useWorkspaceStore(), { cells } = this;
      if (workspace.playing && workspace.played) return workspace.played.cells;
      if (!this.animate || (!workspace.ghost && this.cellsCarry) || !this.frame || this.currentFrame?.kind !== 'blank') return cells;
      const before = this.ghostBefore, picture = !this.cellsCarry;
      if (picture && (!this.ghostStrength || before?.frame !== this.frames[this.frame - 1] || before.built.cells.length !== cells.length)) return cells;
      const held = this._ghost, frame = this.currentFrame, version = this.historyVersion, rendered = this.renderedCells;
      const strength = this.ghostStrength, built = picture ? before.built : null;
      if (held.frame !== frame || (!this._stroke && (held.version !== version || held.rendered !== rendered))) {
        Object.assign(held, { frame, version, rendered, cells, inherited: this.inheritedCells() });
        if (picture) held.memo = new WeakMap(); // its ghosts are over this frame's cells, which may have changed
      }
      if (held.strength !== strength || held.built !== built) Object.assign(held, { strength, built, memo: new WeakMap() });
      if (picture) {
        const at = (i) => (built.cells[i].wide === 'trail' ? i - 1 : i);
        const still = (i) => held.inherited.has(i) && cells[i] === held.cells[i]; // drawn on in a stroke: no longer a ghost
        return ghostedCells(cells, (i) => cells[i], (i) => still(at(i)), held.memo, strength, (i) => built.cells[i]);
      }
      const still = (i) => held.inherited.has(i) && sameLook(cells[i], held.cells[i]); // a stroke's new object: no longer a ghost
      const { cols } = this, params = this.processParams;
      return ghostedCells(
        cells,
        (i) => this.renderer.underCell(i % cols, Math.floor(i / cols), params, rendered),
        (i) => (cells[i].wide === 'trail' ? still(i - 1) : still(i)),
        held.memo,
        strength,
      );
    },
    hasFrames: (state) => state.frames.length > 1,
    // How much of its own colors a ghost keeps, 0 to 1: the bar's strength, or with Ghost off none (shownCells only
    // asks then when cells don't carry, and the frame before mustn't show).
    ghostStrength() {
      const workspace = useWorkspaceStore();
      return workspace.ghost ? workspace.ghostStrength / 100 : 0;
    },
    isDirty: (state) => settingsJson(state) !== state.savedSettings || state.editVersion !== state.savedEditVersion,
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
  actions: guarded(guarded(combineActions(
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
  ), DRAWING_ACTIONS, (store) => store._paused), HOST_ONLY_ACTIONS, (store) => !!store._sharing && (store._sharing.role === 'artist' || store._paused) && !store._takingProject),
});
