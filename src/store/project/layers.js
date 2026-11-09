// The layers' own state (document/layerInfo.js): their names, whether they show, and the vector layer added before its
// first shape. None of it is an undo step: they're about the layers, not edits to what's drawn on them.
import { goodLayerName } from '@/document/layerInfo.js';

// id's entry with changes made, or no change when there's no such layer. The vector layer is there from its first shape,
// before it has an entry of its own.
function changed(store, id, patch) {
  const entry = store.layerInfo[id] ?? (id === 'vector' && store.hasVectorLayer ? { name: null, hidden: false } : null);
  if (entry) store.layerInfo = { ...store.layerInfo, [id]: { ...entry, ...patch } };
}

export const layerActions = {
  // name: as typed; blank is the default name.
  renameLayer(id, name) {
    changed(this, id, { name: goodLayerName(name) });
  },

  setLayerHidden(id, hidden) {
    changed(this, id, { hidden: !!hidden });
  },

  // The vector layer, before it has a shape.
  addVectorLayer() {
    if (!this.layerInfo.vector) this.layerInfo = { ...this.layerInfo, vector: { name: null, hidden: false } };
  },
};
