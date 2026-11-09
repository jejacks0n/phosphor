// The layers themselves (document/layerInfo.js): their names, whether they show, new ones, their order, and which cells
// layer the edit layer's fields are. Adding and moving a layer are undo steps (layerOp); a name, an eye and the layer in
// use aren't: they're about the layers, not edits to what's drawn on them.
import { MOST_LAYERS, goodLayerName, legacySlots } from '@/document/layerInfo.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { putLayer, swapLayer, refusedInRoom } from '@/store/project/shared.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';

// id's layer with changes made, or no change when there's no such layer.
function changed(store, id, patch) {
  if (store.layerById(id)) store.layers = store.layers.map((layer) => (layer.id === id ? Object.freeze({ ...layer, ...patch }) : layer));
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
    const layer = putLayer(this, kind, above), { id } = layer, below = this.layers[this.layers.indexOf(layer) - 1].id; // the layer it sits on: the stack can change around it before a redo
    if (this._sharing) return id;
    const without = () => { this.layers = this.layers.filter((each) => each.id !== id); this.render(); };
    const withIt = () => {
      const rest = this.layers.filter((each) => each.id !== id), at = rest.findIndex((each) => each.id === below) + 1 || rest.length;
      this.layers = [...rest.slice(0, at), layer, ...rest.slice(at)];
      this.render();
    };
    this.pushEdit({ layerOp: true, bytes: 0, undo: without, redo: withIt });
    return id;
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
