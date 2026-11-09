// The layers themselves (document/layerInfo.js): their names, whether they show, new ones, and which cells layer the
// edit layer's fields are. None of it is an undo step: they're about the layers, not edits to what's drawn on them.
import { MOST_LAYERS, goodLayerName, legacySlots, newLayerId, nextNumber } from '@/document/layerInfo.js';
import { readProject, writeProject } from '@/document/projectIO.js';
import { swapLayer, refusedInRoom } from '@/store/project/shared.js';
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
  // starts empty, its paint made when it's first used. Null, nothing added, when the drawing has the most layers, or when it's
  // shared with a room (the room's toast says so), which holds the layers it always did: the one thing it takes is the vector
  // layer it's missing, directly on the bottom.
  addLayer(kind, above) {
    if (this.layers.length >= MOST_LAYERS || refusedInRoom(this, { fills: kind === 'vector' && above === 'base' && !this.hasVectorLayer })) return null;
    const id = newLayerId(this.layers, kind), at = this.layers.findIndex((layer) => layer.id === above) + 1 || this.layers.length;
    const layer = Object.freeze({ id, kind, n: nextNumber(this.layers, kind), name: null, hidden: false });
    this.layers = [...this.layers.slice(0, at), layer, ...this.layers.slice(at)];
    if (kind === 'cells') this._layerData.set(id, { editCells: new Map(), paintLayer: null, hasPaint: false });
    return id;
  },

  // The vector layer, before it has a shape: directly on the bottom.
  addVectorLayer() {
    if (!this.hasVectorLayer) this.addLayer('vector', 'base');
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
      const id = this.addLayer('cells');
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
