// The layers themselves (document/layerInfo.js): their names, whether they show, new ones, and which cells layer the
// edit layer's fields are. None of it is an undo step: they're about the layers, not edits to what's drawn on them.
import { markRaw } from 'vue';
import { goodLayerName, newLayerId, nextNumber } from '@/document/layerInfo.js';
import PaintLayer from '@/document/PaintLayer.js';

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
  // starts empty, its paint made when it's first used.
  addLayer(kind, above) {
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

  // Make the cells layer id the one the edit layer's fields are (editCells, paintLayer, hasPaint), as stepping into an art
  // layer does: what's pending is committed, the one in use waits in _layerData, and autosave doesn't count it as an edit.
  // Nothing for the bottom, a vector layer, or the layer already in use.
  useLayer(id) {
    const next = this._layerData.get(id);
    if (!next || this.layerById(id)?.kind !== 'cells' || id === 'base' || id === this.editId) return;
    if (this._artInside) this.leaveArt();
    this.ensureLayer();
    this.commitPending();
    const was = this.paintLayer;
    this._layerData.set(this.editId, { editCells: this.editCells, paintLayer: was, hasPaint: this.hasPaint });
    this._layerData.delete(id);
    this.editId = id;
    this._frameSwaps++;
    this.editCells = next.editCells;
    this.paintLayer = next.paintLayer ?? (was && markRaw(new PaintLayer({ cols: was.cols, rows: was.rows, scale: was.scale })));
    this.hasPaint = next.hasPaint;
  },
};
