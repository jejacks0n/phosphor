// The layers themselves (document/layerInfo.js): their names, whether they show, their character settings, new ones,
// their order, and which cells layer the edit layer's fields are. Adding, moving, deleting and duplicating a layer are
// undo steps (layerOp; an add, of an empty layer, and a move are stackOnly: they don't tie to where anything is, so the
// grid still rescales with them, ProjectStore resizesCanvas), and so is a change to its character settings (commitLayerChars: _charsBefore, _lastChars); a
// name, an eye and the layer in use aren't: they're about the layers, not edits to what's drawn on them. Only a layer in the stack
// has data in _layerData: one taken out (deleted, its add undone) is held by the undo step that can put it back.
// In a room a change to the stack (an add, a delete, a move, a copy, a name) is no one's undo step: the host makes it and
// says the whole stack (sendLayers), and an artist asks the host for it (askLayerOp) and has it when that comes.
import { markRaw } from 'vue';
import { MOST_LAYERS, goodLayerName, layerChars, layerKey, newLayerId, nextNumber } from '@/document/layerInfo.js';
import { exactly, pixelRuns } from '@/document/changes.js';
import { CHAR_KEYS, DITHER_KEYS, sameSetting } from '@/store/settings.js';
import { loadImage } from '@/document/projectIO.js';
import { ctx2d, fitRect } from '@/lib/Canvas.js';
import PaintLayer from '@/document/PaintLayer.js';
import { MOST_SHAPES, copyShapes, isShapeKey } from '@/document/shapes.js';
import { NUDGE_MS, bytesHeld, dropFromSums, emptyFields, layerName, putLayer, randomId, swapLayer, refusedInRoom } from '@/store/project/shared.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { t } from '@/i18n';
import { toast } from '@/composables/useToast';

// id's layer with changes made, or no change when there's no such layer.
function changed(store, id, patch) {
  if (store.layerById(id)) store.layers = store.layers.map((layer) => (layer.id === id ? Object.freeze({ ...layer, ...patch }) : layer));
}

// own (some of CHAR_KEYS) as the layer with the id's character settings: the document's fields for the bottom.
function putChars(store, id, own) {
  if (id !== 'base') return changed(store, id, { chars: layerChars(store.layerById(id)?.kind, { ...store.charsOf(id), ...own }) });
  store.$patch(own);
}

const pick = (from, keys) => Object.fromEntries(keys.map((key) => [key, from[key]]));

// The layer with the id out of the stack, and what's on it, for putBack: { layer, below, data } for a cells layer (its
// cells and paint), { layer, below, shapes } for a vector layer (the shapes on it showing; a movie's other frames keep
// theirs, layerFrames'). below: the id of the layer it sat on; picked: it was the picked layer. The layer in use hands the
// edit layer's fields to the cells layer nearest under it, else the topmost, else they start empty (a drawing with no cells
// layer still has them).
function takeOut(store, id) {
  const at = store.layers.findIndex((layer) => layer.id === id), layer = store.layers[at];
  const held = { layer, below: store.layers[at - 1].id, picked: useWorkspaceStore().pickedLayer === id };
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
    else emptyFields(store);
  }
  store._layerData.delete(id);
  store.layers = store.layers.filter((each) => each !== layer);
  return held;
}

// What takeOut took, back in the stack directly above the layer it sat on (on top when that's gone): its data where it
// waits, or in the edit layer's fields when it's still their layer (none left when it went), and its shapes. Picked again
// when it was picked as it went.
function putBack(store, { layer, below, data, shapes, picked }) {
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
  if (picked) useWorkspaceStore().pickLayer(layer.id);
}

// What's drawn after change() changed the stack: when the lower group (the layers the pipeline converts as one block) and
// the base's eye are as they were, the cells are read again from the output as it is and the upper layers laid over them
// (rebuildCells: tens of milliseconds at the limit, no pipeline), else a render, as the picture's own conversion changes.
// The group's cells layer counts only with paint: its cells are laid over the output, so one without paint can come or
// go (hidden, shown, moved) leaving the output as it is. Under the Number palette always a render: it counts every
// layer's pixels bottom to top, so a layer moved over another's paint changes the count.
function redrawn(store, change) {
  const group = () => {
    const { vectors, cells } = store.lowerGroup;
    return [store.layerHidden('base'), ...vectors, store.paintOf(cells)?.hasPaint ? cells : ''].join();
  };
  const was = group();
  change();
  if (group() !== was || store.quantize === 'count' || !store.renderedCells.length) return store.render();
  store.syncShapeLayers();
  store.rebuildCells();
}

// Whether this change to the stack (a layer-op's op, wire.js) is an artist's in a room, and so asked of the host instead,
// with nothing changed here.
function asked(store, op) {
  if (store._sharing?.role !== 'artist') return false;
  if (op.kind === 'delete') store.commitPending(); // what's open goes in while its layer's still here
  store.askLayerOp(op);
  return true;
}
// Who a host's change to the stack in a room is for: the artist whose op it's doing (takeLayerOp), else the host.
const askedBy = (store) => store._sharing.asker ?? store._sharing.me;

// In a room, whether someone other than who's deleting it has the layer with the id picked, as their cursor says: a delete
// is refused then, with a toast saying who, but for an artist's ask (takeLayerOp), refused saying nothing.
function pickedElsewhere(store, id) {
  if (!store._sharing) return false;
  const picker = Object.entries(store._picks).find(([sub, { layer }]) => layer === id && sub !== askedBy(store))?.[1];
  if (picker && !store._sharing.asker) toast(t('layers.pickedBySomeone', { name: picker.name }));
  return !!picker;
}

// A copy made in a room: it goes in the stack empty and the room hears the stack (made: the copy), then what's on it
// (held's data or shapes) as a change of the host's, numbered after. No one can undo that: the ledger forgets it at once,
// so it's beneath every stroke, and the host's undo has no step for it.
function shareCopy(store, { layer, below, data, shapes }) {
  const { id } = layer;
  putBack(store, { layer, below, ...(data && { data: { editCells: new Map(), paintLayer: null, hasPaint: false } }) });
  store.render();
  store.sendLayers({ by: askedBy(store), made: id });
  const cells = shapes ? [...shapes] : [...data.editCells].map(([key, entry]) => [layerKey(id, key), entry]);
  const runs = [];
  if (data?.paintLayer) {
    const { canvas } = data.paintLayer, { data: after } = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
    runs.push(...pixelRuns(new Uint8ClampedArray(after.length), after, canvas.width, canvas.height, 0, 0, exactly));
    if (id !== 'edit') for (const run of runs) run.push(id);
  }
  if (!cells.length && !runs.length) return;
  const stroke = randomId(), numbered = store._ledger.submit(store._by, stroke, { cells, runs });
  store._ledger.forget(stroke);
  store.applyChange({ cells, runs });
  store.editVersion++;
  store.sendNumbered(numbered);
}

// Whether a change to the stack that the host is making for an artist (takeLayerOp) leaves what the host is doing alone:
// its open stroke and the art layer it's inside go on, unless the change is to the layer the host draws on or is inside
// (id), whose open stroke is then numbered before the stack goes out.
const asideFromHost = (store, id = null) => !!store._sharing?.asker && id !== store.editId && id !== store.drawsOn;

// Ready for a step that changes the stack (id: the layer it changes): out of an art layer, the layers made, what's open
// committed. The layers made only, for an artist's that's aside from the host's (asideFromHost).
function ready(store, id) {
  if (asideFromHost(store, id)) return store.ensureLayer();
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
    const layer = this.layerById(id), named = goodLayerName(name);
    if (!layer || layer.name === named || asked(this, { kind: 'rename', id, name: named })) return;
    changed(this, id, { name: named });
    if (this._sharing) this.sendLayers({ by: askedBy(this) });
  },

  // Hidden layers leave the screen and the exports: the whole grid is drawn again (rendering.js hands the renderer only
  // what shows). Drawing on one is refused (tools/index.js).
  setLayerHidden(id, hidden) {
    if (!this.layerById(id) || this.layerHidden(id) === !!hidden) return;
    redrawn(this, () => changed(this, id, { hidden: !!hidden }));
  },

  // A layer's own character settings changed: the CHAR_KEYS in patch (the rest is left out; a cells layer has no Dither).
  // The bottom's are the document's fields. They're noted as they were, and commitLayerChars makes the change one undo
  // step (a slider's drag, a pick, a set typed, the seed rolled). What's drawn follows (EditWorkspace renders on a change
  // to layerParams). In a room only the host does it (HOST_ONLY_ACTIONS), and each layer keeps its own. Whether it changed.
  setLayerChars(id, patch) {
    const layer = this.layerById(id), holds = (key) => id === 'base' || layer.kind !== 'cells' || !DITHER_KEYS.includes(key);
    if (!layer) return false;
    const own = Object.fromEntries(CHAR_KEYS.filter((key) => key in patch && holds(key)).map((key) => [key, patch[key]]));
    const was = this.charsOf(id);
    if (Object.keys(own).every((key) => sameSetting(own[key], was[key]))) return false;
    if (this._charsBefore?.id !== id) {
      this.commitLayerChars();
      this._charsBefore = { id, key: Object.keys(own)[0], values: pick(was, CHAR_KEYS), hadNoOwn: id !== 'base' && !layer.chars };
    }
    putChars(this, id, own);
    return true;
  },

  // A change setLayerChars noted ended: one undo step from the values noted to these, none when they're the same. A key
  // nudge on the same setting a moment after the last, with nothing recorded between, extends that step, as a slider's
  // does (sliders.js commitSliders).
  commitLayerChars({ nudge = false } = {}) {
    const before = this._charsBefore;
    this._charsBefore = null;
    if (!before || !this.layerById(before.id)) return;
    const { id, key, values, hadNoOwn } = before, after = pick(this.charsOf(id), CHAR_KEYS), last = this._lastChars;
    if (CHAR_KEYS.every((each) => sameSetting(values[each], after[each]))) return;
    if (this._sharing && id !== 'base') { // a layer's go with the stack, no undo step in a room; the bottom's are the document's settings, which go with them and keep the host's undo, as the sliders do
      this.sendLayers({ by: this._sharing.me });
      return;
    }
    if (nudge && last?.id === id && last.key === key && last.version === this.history.version && Date.now() - last.at < NUDGE_MS) {
      last.at = Date.now();
      last.entry.after = after;
      return;
    }
    this.commitPending();
    // settingsOnly: kept when the grid changes (rendering.js dropEdits). ownChars: a layer's own, which going live drops
    // (startSharing): a room has no undo for it.
    const restoreOwn = hadNoOwn ? () => changed(this, id, { chars: null }) : () => putChars(this, id, values);
    const entry = { settingsOnly: true, ownChars: id !== 'base', after, undo: restoreOwn, redo: () => putChars(this, id, entry.after) };
    this.pushEdit(entry);
    this._lastChars = nudge ? { id, key, entry, version: this.history.version, at: Date.now() } : null;
  },

  // A new layer of kind directly above the layer with the id above (on top when there's none), and its id, with the character
  // settings of the layer it's above (the bottom's when there's none). A cells layer starts empty, its paint made when it's first used. One undo step: undone, the layer leaves the stack and what's on it
  // waits in _layerData for a redo. Null, nothing added, when the drawing has the most layers, and for an artist in a room
  // (it's asked of the host).
  addLayer(kind, above) {
    if (this.layers.length >= MOST_LAYERS || asked(this, { kind: 'add', layer: kind, above })) return null;
    if (!asideFromHost(this)) this.commitPending();
    let id;
    redrawn(this, () => { ({ id } = putLayer(this, kind, above, this.charsOf(above))); }); // the groups can change: a layer put under a painted one leaves that one's paint over it
    if (this._sharing) {
      this.sendLayers({ by: askedBy(this), made: id });
      return id;
    }
    let held = null; // undone: takeOut's, whose layer below (by id) is where a redo puts it, as the stack can change around it meanwhile
    this.pushEdit({ layerOp: true, stackOnly: true, bytes: 0, undo: () => redrawn(this, () => { held = takeOut(this, id); }), redo: () => redrawn(this, () => putBack(this, held)) });
    return id;
  },

  // The layer with the id deleted, on every frame at once, one undo step that puts it back as it was, with what's on it;
  // whether it went. Not the bottom, not one someone else in a room has picked (pickedElsewhere), and not here for an artist
  // in a room (it's asked of the host). The picked layer going picks the one that was under it (followLayerPick). In a room
  // the host remembers it went (removed), for what artists drew on it before they heard (takeFromArtist).
  deleteLayer(id) {
    if (!(this.layers.findIndex((layer) => layer.id === id) > 0) || pickedElsewhere(this, id) || asked(this, { kind: 'delete', id })) return false;
    ready(this, id);
    if (this._sharing) {
      dropFromSums(this, id);
      (this._sharing.removed ??= new Set()).add(id);
      takeOut(this, id);
      this.render();
      this.sendLayers({ by: askedBy(this), gone: [id] });
      return true;
    }
    const { before, after } = this.layerFrames(id);
    let held = takeOut(this, id);
    stackStep(this, { held, before, after, undo: () => putBack(this, held), redo: () => { held = takeOut(this, id); } });
    return true;
  },

  // A copy of the layer with the id directly above it, picked: its cells and paint, or its shapes under new keys (a
  // follower following its path's copy, an art layer's drawing copied), on every frame, named "… copy". One undo step; the
  // copy's id. Null, nothing copied, for the bottom, at the most layers, past a frame's most shapes (a toast says so; for an
  // artist's ask, the host tells them instead: takeLayerOp's 'shapes') and for an artist in a room (it's asked of the host). In a
  // room the copy is picked by whoever asked for it (shareCopy).
  duplicateLayer(id) {
    const layer = this.layerById(id);
    if (!layer || id === 'base' || this.layers.length >= MOST_LAYERS || asked(this, { kind: 'duplicate', id })) return null;
    ready(this, id);
    this.flushHeard(); // what's numbered on it and waiting for its frame is on it, and on the copy (ready doesn't for an artist's ask)
    const to = newLayerId(this.layers, layer.kind), { before, after, keyMap } = this.layerFrames(id, to);
    const everyShape = new Set([...this.shapes.keys(), ...this.frames.flatMap((frame) => [...frame.changes.keys()].filter(isShapeKey))]);
    if (keyMap && everyShape.size + keyMap.size > MOST_SHAPES) {
      if (this._sharing?.asker) this._sharing.refused = 'shapes';
      else toast(t('vector.tooMany', { count: MOST_SHAPES }));
      return null;
    }
    const copy = Object.freeze({ ...layer, id: to, n: nextNumber(this.layers, layer.kind), name: goodLayerName(t('layers.copyName', { name: layerName(layer) })) });
    let held = { layer: copy, below: id };
    if (keyMap) held.shapes = copyShapes(new Map([...this.shapes].filter(([key]) => keyMap.has(key))), to, keyMap).shapes;
    else {
      const paint = this.paintOf(id), own = paint?.hasPaint ? markRaw(new PaintLayer({ cols: paint.cols, rows: paint.rows, scale: paint.scale })) : null;
      own?.restore(paint.snapshot());
      held.data = { editCells: new Map(this.cellsOf(id)), paintLayer: own, hasPaint: !!own?.hasPaint };
    }
    if (this._sharing) shareCopy(this, held);
    else {
      putBack(this, held);
      stackStep(this, { held, before, after, undo: () => { held = takeOut(this, to); }, redo: () => putBack(this, held) });
    }
    if (!this._sharing?.asker) useWorkspaceStore().pickLayer(to);
    return to;
  },

  // A picture (an image file) added to the drawing as paint, fitted to the canvas, over what's painted there: on the cells
  // layer picked, else (the base or a vector layer picked) on a new cells layer above it, named after the file, picked.
  // One undo step; the layer's id. Null, nothing added, on a movie, while shared with a room (its toast), at the most
  // layers, on a hidden layer picked (its toast), or for a file that won't decode.
  async addPictureToLayer(file) {
    const workspace = useWorkspaceStore();
    if (this.hasFrames || refusedInRoom(this) || (!workspace.pickedCells && this.layers.length >= MOST_LAYERS)) return null;
    if (workspace.pickedCells && this.layerHidden(this.editId)) { // as drawing on it is (tools: a hidden layer)
      toast(t('layers.hiddenToast'));
      return null;
    }
    const picture = await loadImage(file).catch(() => null);
    if (!picture || this.hasFrames) return null;
    ready(this);
    const fitted = (snapshot, { cols, rows, scale }) => {
      const canvas = Object.assign(document.createElement('canvas'), { width: cols * scale, height: rows * scale });
      const ctx = ctx2d(canvas), { dx, dy, dw, dh } = fitRect(picture.naturalWidth, picture.naturalHeight, cols, rows);
      if (snapshot) ctx.drawImage(snapshot.canvas, 0, 0);
      ctx.drawImage(picture, dx * scale, dy * scale, dw * scale, dh * scale);
      return { canvas, hasPaint: true };
    };
    if (workspace.pickedCells) {
      const id = this.editId, paint = this.paintLayer, before = paint.snapshot(), after = fitted(before, paint);
      const show = (state) => () => {
        this.paintLayer.restore(state);
        this.hasPaint = this.paintLayer.hasPaint;
        this.render();
      };
      show(after)();
      this.pushWholeLayer(show(before), show(after), bytesHeld(before, after));
      return id;
    }
    const below = workspace.pickedLayer, to = newLayerId(this.layers, 'cells'), grid = this.paintLayer;
    const own = markRaw(new PaintLayer({ cols: grid.cols, rows: grid.rows, scale: grid.scale }));
    own.restore(fitted(null, own));
    const layer = Object.freeze({ id: to, kind: 'cells', n: nextNumber(this.layers, 'cells'), name: goodLayerName(file.name.replace(/\.[^.]*$/, '')), hidden: false, chars: layerChars('cells', this.charsOf(below)) });
    let held = { layer, below, data: { editCells: new Map(), paintLayer: own, hasPaint: true } };
    putBack(this, held);
    stackStep(this, { held, undo: () => { held = takeOut(this, to); }, redo: () => putBack(this, held) });
    workspace.pickLayer(to);
    return to;
  },

  // The layer with the id moved to toIndex in the stack (bottom first), one undo step; whether it moved. Not the bottom,
  // nothing to below it or past the top, and not here for an artist in a room (it's asked of the host). What's drawn is
  // laid over again in the new order.
  moveLayer(id, toIndex) {
    const from = this.layers.findIndex((layer) => layer.id === id);
    if (from < 1 || toIndex < 1 || toIndex >= this.layers.length || toIndex === from || asked(this, { kind: 'move', id, to: toIndex })) return false;
    if (!asideFromHost(this, id)) this.commitPending();
    const ids = (layers) => layers.map((layer) => layer.id), before = ids(this.layers), moved = [...this.layers];
    moved.splice(toIndex, 0, ...moved.splice(from, 1));
    const after = ids(moved);
    const order = (list) => () => redrawn(this, () => { this.layers = list.map((each) => this.layerById(each)).filter(Boolean); }); // by id: names and eyes since aren't undone
    order(after)();
    if (this._sharing) this.sendLayers({ by: askedBy(this) });
    else this.pushEdit({ layerOp: true, stackOnly: true, bytes: 0, undo: order(before), redo: order(after) });
    return true;
  },

  // Make the cells layer id the one the edit layer's fields are (editCells, paintLayer, hasPaint), as stepping into an art
  // layer does: what's pending is committed, the one in use waits in _layerData, and autosave doesn't count it as an edit.
  // The bottom too: its fields hold no cells and no paint, and what the tools draw goes on the base (shared.js: onBottom).
  // Nothing for a vector layer, or the layer already in use.
  useLayer(id) {
    if (id === this.editId || (id !== 'base' && (!this._layerData.has(id) || this.layerById(id)?.kind !== 'cells'))) return;
    if (this._artInside) this.leaveArt();
    this.ensureLayer();
    this.commitPending();
    swapLayer(this, id);
  },
};
