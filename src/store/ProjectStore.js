import { shallowRef, markRaw } from 'vue';
import { defineStore } from 'pinia';
import { EMPTY_BASE } from '@/document/baseRecords.js';
import Renderer from '@/document/Renderer.js';
import History from '@/document/History.js';
import { settingsState, slidersAtDefaults } from '@/store/settings.js';
import { combineActions } from '@/store/project/combineActions.js';
import { documentActions } from '@/store/project/document.js';
import { mergingActions } from '@/store/project/merging.js';
import { selectionActions } from '@/store/project/selection.js';
import { editLayerActions } from '@/store/project/editLayer.js';
import { renderingActions } from '@/store/project/rendering.js';
import { readingActions } from '@/store/project/reading.js';
import { baseLayerActions } from '@/store/project/baseLayer.js';
import { sliderActions } from '@/store/project/sliders.js';
import { historyActions } from '@/store/project/history.js';
import { MAX_DIMENSION, PIPELINE_KEYS, settingsJson } from '@/store/project/shared.js';

export const useProjectStore = defineStore('project', {
  state: () => ({
    image: shallowRef(null),
    imageBuffer: null, // the image's encoded bytes, saved into .phosphor files
    imageIsWorkingCopy: false, // the image is a working-size copy (after a Bake or an Into-the-picture merge), not the one loaded
    ...settingsState(),

    hasPaint: false,
    renderer: markRaw(new Renderer()),
    paintLayer: null, // PaintLayer (markRaw); hasPaint mirrors paintLayer.hasPaint for reactivity
    baseLayer: null,  // the base layer's own pixels: a PaintLayer at grid resolution (markRaw), over the image
    fit: null,        // where the image sits in the grid ({ dx, dy, dw, dh }); fixed while the edit layer has content
    paintScale: null, // the paint layer's scale from a loaded file (its saved paint is at that scale)
    editCells: shallowRef(new Map()), // the edit cells (see document/editCells.js)
    baseRecords: shallowRef(EMPTY_BASE), // the base layer's pinned characters (see document/baseRecords.js)

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
    history: markRaw(new History(50)),
    historyVersion: 0, // mirrors history.version so canUndo/canRedo stay reactive
  }),

  getters: {
    canUndo: (state) => state.historyVersion >= 0 && state.history.canUndo,
    // Something to bake: an image, and a Transform, Adjustment or Effect slider off its default.
    canBake: (state) => !!state.image && !slidersAtDefaults(state),
    // The image is still the one loaded, at its own size (the merge dialog says what Into the image costs).
    pictureIsOriginal: (state) => !state.imageIsWorkingCopy,
    canRedo: (state) => state.historyVersion >= 0 && state.history.canRedo,
    hasEdits: (state) => state.editCells.size > 0 || state.hasPaint, // anything on the edit layer (a grid resize is then a canvas resize)
    isDirty: (state) => settingsJson(state) !== state.savedSettings || state.editVersion !== state.savedEditVersion,
    imageRatio: (state) => {
      if (!state.image) return 1;
      const w = state.image.naturalWidth || state.image.width || 1;
      const h = state.image.naturalHeight || state.image.height || 1;
      return w / h;
    },
    maxCols: (state) => {
      if (!state.aspectLock || !state.image || state.editCells.size > 0 || state.hasPaint) return MAX_DIMENSION;
      const w = state.image.naturalWidth || state.image.width || 1;
      const h = state.image.naturalHeight || state.image.height || 1;
      const ratio = w / h;
      return Math.ceil(Math.min(MAX_DIMENSION, MAX_DIMENSION * ratio));
    },
    maxRows: (state) => {
      if (!state.aspectLock || !state.image || state.editCells.size > 0 || state.hasPaint) return MAX_DIMENSION;
      const w = state.image.naturalWidth || state.image.width || 1;
      const h = state.image.naturalHeight || state.image.height || 1;
      const ratio = w / h;
      return Math.ceil(Math.min(MAX_DIMENSION, MAX_DIMENSION / ratio));
    },
    processParams: (state) => ({
      ...Object.fromEntries(PIPELINE_KEYS.map(key => [key, state[key]])),
      chars: state.renderStyle === 'ansi' ? state.chars : state.charsAscii,
      charMode: state.renderStyle === 'ansi' ? 'random' : 'brightness',
      image: state.image,
      fit: state.fit,
    }),
  },

  // One file per area in store/project/ (AGENTS.md, "Where things live").
  actions: combineActions(
    documentActions,
    renderingActions,
    readingActions,
    editLayerActions,
    baseLayerActions,
    selectionActions,
    mergingActions,
    sliderActions,
    historyActions,
  ),
});
