// The layers themselves (document/layerInfo.js): their names, whether they show, new ones, their order, and which cells
// layer the edit layer's fields are. Adding, moving, deleting and duplicating a layer are undo steps (layerOp); a name, an
// eye and the layer in use aren't: they're about the layers, not edits to what's drawn on them. Only a layer in the stack
// has data in _layerData: one taken out (deleted, its add undone) is held by the undo step that can put it back.
import { markRaw } from 'vue';
import { MOST_LAYERS, goodLayerName, legacySlots, newLayerId, nextNumber } from '@/document/layerInfo.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import PaintLayer from '@/document/PaintLayer.js';
import { MOST_SHAPES, copyShapes, isShapeKey } from '@/document/shapes.js';
import { bytesHeld, putLayer, swapLayer, refusedInRoom } from '@/store/project/shared.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { t } from '@/i18n';
import { toast } from '@/composables/useToast';

// id's layer with changes made, or no change when there's no such layer.
function changed(store, id, patch) {
  if (store.layerById(id)) store.layers = store.layers.map((layer) => (layer.id === id ? Object.freeze({ ...layer, ...patch }) : layer));
}

// The layer with the id out of the stack, and what's on it, for putBack: { layer, below, data } for a cells layer (its
// cells and paint), { layer, below, shapes } for a vector layer (the shapes on it showing; a movie's other frames keep
// theirs, layerFrames'). below: the id of the layer it sat on. The layer in use hands the edit layer's fields to the cells
// layer nearest under it, else the topmost, else they start empty (a drawing with no cells layer still has them).
function takeOut(store, id) {
  const at = store.layers.findIndex((layer) => layer.id === id), layer = store.layers[at], held = { layer, below: store.layers[at - 1].id };
  if (layer.kind === 'vector') {
    held.shapes = new Map([...store.shapes].filter(([, shape]) => (shape.layer ?? 'vector') === id));
    if (held.shapes.size) store.shapes = new Map([...store.shapes].filter(([key]) => !held.shapes.has(key)));
  } else if (id !== store.editId) {
    held.data = store._layerData.get(id);
  } else {
    const others = store.layers.filter((each) => each.kind === 'cells' && each.id !== 'base' && each.id !== id);
    const next = others.filter((each) => store.layers.indexOf(each) < at).at(-1) ?? others.at(-1);
    held.data = { editCells: store.editCells, paintLayer: store.paintLayer, hasPaint: store.hasPaint };
    if (next) swapLayer(store, next.id);
    else {
      const was = store.paintLayer;
      store._frameSwaps++; // autosave: the step is the edit
      store.editCells = new Map();
      store.paintLayer = was && markRaw(new PaintLayer({ cols: was.cols, rows: was.rows, scale: was.scale }));
      store.hasPaint = false;
    }
  }
  store._layerData.delete(id);
  store.layers = store.layers.filter((each) => each !== layer);
  return held;
}

// What takeOut took, back in the stack directly above the layer it sat on (on top when that's gone): its data where it
// waits, or in the edit layer's fields when it's still their layer (none left when it went), and its shapes.
function putBack(store, { layer, below, data, shapes }) {
  if (data) {
    if (store.paintLayer) data.paintLayer?.extend(store.paintLayer.cols, store.paintLayer.rows); // the grid can have grown since
    if (layer.id === store.editId) {
      store._frameSwaps++;
      Object.assign(store, data);
    } else store._layerData.set(layer.id, data);
  }
  if (shapes?.size) store.shapes = new Map([...store.shapes, ...shapes]);
  const rest = store.layers.filter((each) => each.id !== layer.id), at = rest.findIndex((each) => each.id === below) + 1 || rest.length;
  store.layers = [...rest.slice(0, at), layer, ...rest.slice(at)];
}

// A layer's name as shown (useLayerName's, in the store).
const shownName = (layer) => layer.name ?? t(layer.kind === 'vector' ? 'layers.vectorDefault' : 'layers.editDefault', { n: layer.n });

// Ready for a step that changes the stack: out of an art layer, the layers made, what's open committed.
function ready(store) {
  if (store._artInside) store.leaveArt();
  store.ensureLayer();
  store.commitPending();
}

// A delete's or a duplicate's step, already done: undo and redo take the layer out or put it back (takeOut's held), each
// with every frame's states (layerFrames' before or after) and everything drawn again. It counts what it holds toward
// undo's budget: the layer's paint and cells, or its shapes, and the frames' changes either side.
function stackStep(store, { held, undo, redo, before, after }) {
  const show = (states) => {
    if (states) store.setAllFrames(states);
    store.render();
  };
  show(after);
  const bytes = bytesHeld(held.data?.paintLayer, held.data?.editCells, held.shapes, ...[...before ?? [], ...after ?? []].map(({ changes }) => changes));
  store.pushWholeLayer(() => { undo(); show(before); }, () => { redo(); show(after); }, bytes, { everyFrame: true, layerOp: true });
}

export const layerActions = {
  // name: as typed; blank is the default name.
  renameLayer(id, name) {
    changed(this, id, { name: goodLayerName(name) });
  },

  // Hidden layers leave the screen and the exports: the whole grid is drawn again (rendering.js hands the renderer only
  // what shows). Drawing on one is refused (tools/index.js).
  setLayerHidden(id, hidden) {
    if (!this.layerById(id) || this.layerHidden(id) === !!hidden) return;
    changed(this, id, { hidden: !!hidden });
    this.render();
  },

  // A new layer of kind directly above the layer with the id above (on top when there's none), and its id. A cells layer
  // starts empty, its paint made when it's first used. One undo step: undone, the layer leaves the stack and what's on it
  // waits in _layerData for a redo. Null, nothing added, when the drawing has the most layers, or when it's shared with a
  // room (the room's toast says so), which holds the layers it always did: the one thing it takes is the vector layer it's
  // missing, directly on the bottom, and that's no undo step (a room's layers aren't undone).
  addLayer(kind, above) {
    if (this.layers.length >= MOST_LAYERS || refusedInRoom(this, { fills: kind === 'vector' && above === 'base' && !this.hasVectorLayer })) return null;
    this.commitPending();
    const { id } = putLayer(this, kind, above);
    if (this._sharing) return id;
    let held = null; // undone: takeOut's, whose layer below (by id) is where a redo puts it, as the stack can change around it meanwhile
    this.pushEdit({ layerOp: true, bytes: 0, undo: () => { held = takeOut(this, id); this.render(); }, redo: () => { putBack(this, held); this.render(); } });
    return id;
  },

  // The layer with the id deleted, on every frame at once, one undo step that puts it back as it was, with what's on it;
  // whether it went. Not the bottom, nor while the drawing's shared with a room (the room's toast says so). The picked
  // layer going picks the one that was under it (followLayerPick).
  deleteLayer(id) {
    if (!(this.layers.findIndex((layer) => layer.id === id) > 0) || refusedInRoom(this)) return false;
    ready(this);
    const { before, after } = this.layerFrames(id);
    let held = takeOut(this, id);
    stackStep(this, { held, before, after, undo: () => putBack(this, held), redo: () => { held = takeOut(this, id); } });
    return true;
  },

  // A copy of the layer with the id directly above it, picked: its cells and paint, or its shapes under new keys (a
  // follower following its path's copy, an art layer's drawing copied), on every frame, named "… copy". One undo step; the
  // copy's id. Null, nothing copied, for the bottom, at the most layers, past a frame's most shapes (a toast says so) and
  // while shared with a room (its toast).
  duplicateLayer(id) {
    const layer = this.layerById(id);
    if (!layer || id === 'base' || this.layers.length >= MOST_LAYERS || refusedInRoom(this)) return null;
    ready(this);
    const to = newLayerId(this.layers, layer.kind), { before, after, keyMap } = this.layerFrames(id, to);
    const everyShape = new Set([...this.shapes.keys(), ...this.frames.flatMap((frame) => [...frame.changes.keys()].filter(isShapeKey))]);
    if (keyMap && everyShape.size + keyMap.size > MOST_SHAPES) {
      toast(t('vector.tooMany', { count: MOST_SHAPES }));
      return null;
    }
    const copy = Object.freeze({ ...layer, id: to, n: nextNumber(this.layers, layer.kind), name: goodLayerName(t('layers.copyName', { name: shownName(layer) })) });
    let held = { layer: copy, below: id };
    if (keyMap) held.shapes = copyShapes(new Map([...this.shapes].filter(([key]) => keyMap.has(key))), to, keyMap).shapes;
    else {
      const paint = this.paintOf(id), own = paint?.hasPaint ? markRaw(new PaintLayer({ cols: paint.cols, rows: paint.rows, scale: paint.scale })) : null;
      own?.restore(paint.snapshot());
      held.data = { editCells: new Map(this.cellsOf(id)), paintLayer: own, hasPaint: !!own?.hasPaint };
    }
    putBack(this, held);
    stackStep(this, { held, before, after, undo: () => { held = takeOut(this, to); }, redo: () => putBack(this, held) });
    useWorkspaceStore().pickLayer(to);
    return to;
  },

  // The layer with the id moved to toIndex in the stack (bottom first), one undo step; whether it moved. Not the bottom,
  // nothing to below it or past the top, nothing while it's shared with a room (the room's toast says so). What's drawn
  // is laid over again in the new order.
  moveLayer(id, toIndex) {
    const from = this.layers.findIndex((layer) => layer.id === id);
    if (from < 1 || toIndex < 1 || toIndex >= this.layers.length || toIndex === from || refusedInRoom(this)) return false;
    this.commitPending();
    const ids = (layers) => layers.map((layer) => layer.id), before = ids(this.layers), moved = [...this.layers];
    moved.splice(toIndex, 0, ...moved.splice(from, 1));
    const after = ids(moved);
    const order = (list) => () => { this.layers = list.map((each) => this.layerById(each)).filter(Boolean); this.render(); }; // by id: names and eyes since aren't undone
    order(after)();
    this.pushEdit({ layerOp: true, bytes: 0, undo: order(before), redo: order(after) });
    return true;
  },

  // Make the document ready to go live, which holds the bottom, at most one vector layer and one cells layer above them
  // (fitsRoom), named as the room knows them. False, nothing changed, for a stack that doesn't fit. Layers with other ids
  // (L1) are reopened from the drawing's own old-form parts, as a file would open: its filename, whether it's saved and
  // the layer picked stay, and undo is cleared (ponytail: re-keying history in place would keep it; do that if it bites).
  // With no cells layer an empty edit layer goes on top; that isn't an undo step.
  async roomLayers() {
    const slots = legacySlots(this.layers);
    if (!slots) return false;
    if ((slots.vector ?? 'vector') !== 'vector' || (slots.cells ?? 'edit') !== 'edit') {
      this.commitPending();
      const workspace = useWorkspaceStore(), picked = workspace.pickedLayer;
      const { filename, documentId, savedToFile, isDirty, savedSettings } = this;
      const parts = await readProject(await writeProject({ imageBuffer: this.imageBuffer, ...await this.projectParts() }));
      await this.openParts(parts, { filename, documentId });
      this.savedToFile = savedToFile;
      if (isDirty) { // as restoreDocument leaves it
        this.savedSettings = savedSettings;
        this.savedEditVersion = this.editVersion - 1;
      }
      const now = picked === slots.vector ? 'vector' : picked === slots.cells ? 'edit' : picked;
      if (workspace.pickedLayer !== now) workspace.pickLayer(now);
    }
    if (!slots.cells) {
      const { id } = putLayer(this, 'cells');
      if (id === this.editId) this._layerData.delete(id); // the layer in use is the fields', and they're empty
      else this.useLayer(id);
    }
    return true;
  },

  // Make the cells layer id the one the edit layer's fields are (editCells, paintLayer, hasPaint), as stepping into an art
  // layer does: what's pending is committed, the one in use waits in _layerData, and autosave doesn't count it as an edit.
  // Nothing for the bottom, a vector layer, or the layer already in use.
  useLayer(id) {
    const next = this._layerData.get(id);
    if (!next || this.layerById(id)?.kind !== 'cells' || id === 'base' || id === this.editId) return;
    if (this._artInside) this.leaveArt();
    this.ensureLayer();
    this.commitPending();
    swapLayer(this, id);
  },
};
