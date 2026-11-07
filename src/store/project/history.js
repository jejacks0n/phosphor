// History: each edit is recorded between beginEdit and commitEdit as one undo step: its paint and edit
// cells go in the ledger (_ledger, whose positions keep who drew what), by way of sendSlice (sharing.js),
// its base patch and base records in the entry; undo and redo replay them. Owns _stroke, the edit being
// recorded (a typing run keeps it open across keystrokes: editLayer.js; clearImage and dropEdits drop it
// when the document or the grid changes under it): its editCells is the map as of its last slice, as
// sendSlice leaves it, and _baseline, what a slice being submitted began with (reading.js).
import { markRaw, toRaw } from 'vue';
import { parseKey } from '@/document/editCells.js';
import { isShapeKey } from '@/document/shapes.js';
import { placedShapes } from '@/document/followers.js';
import { keepDrawn, keepMode, withModes } from '@/document/frames.js';
import { carriesError } from '@/lib/CharResolver.js';
import { useWorkspaceStore } from '@/store/WorkspaceStore.js';
import { toast } from '@/composables/useToast';
import { ALONE, bytesHeld, lockedAmong, newLedger, randomId, runsPatch } from '@/store/project/shared.js';

const NO_CHANGE = { cells: [], runs: [] };

export const historyActions = {
  // An edit (stroke, fill, cell edit) records from its first change until commitEdit().
  beginEdit() {
    if (this._stroke?.typing && !this._typingNow) this.commitEdit(); // another edit ends a typing run
    if (this._stroke || !this.paintLayer) return;
    // Raw, so commitEdit's identity checks see the same objects. keys: the cells it's sent. A stroke begun
    // for a float's move is held for an artist (sharing.js). startFrame: the frame showing as it began, for undo to put
    // its keys back (shapesBefore), only when it's noted up to now: an edit before it not noted yet isn't in it.
    const noted = this._noted, current = noted?.frame === this.currentFrame && noted.history === this.history.version && noted.edit === this.editVersion;
    this._stroke = markRaw({ id: randomId(), editCells: this.editCells, shapes: this.shapes, baseRecords: this.baseRecords, keys: [], hold: !!this._floating, startShapes: this.shapes, startFrame: this.hasFrames && current ? { ...this.currentFrame } : null, vectorSelected: useWorkspaceStore().vectorSelected });
    this.paintLayer.beginStroke();
    this.baseLayer.beginStroke();
  },

  // A writer that knows which keys it changes sets the map through this, so a slice looks at those alone
  // (cellChanges takes 20 ms at 500k cells, and a slice is ten times a second). One that just sets editCells
  // breaks the chain and the slice scans, which is only slower: fine for an edit that commits right away.
  setEditCells(next, keys) {
    const stroke = this._stroke;
    if (stroke) {
      const noted = this.editCells === stroke.editCells ? new Set() : stroke.noted?.map === this.editCells ? stroke.noted.keys : null;
      for (const key of keys) noted?.add(key);
      stroke.noted = noted && { map: next, keys: noted };
    }
    this.editCells = next;
  },

  // End of a user edit: what's left of its paint and cells goes in the ledger (alone, that's all of it), and
  // one undo entry undoes them with its base pixel tiles and pin changes, and it counts as unsaved.
  commitEdit() {
    if (this._stroke?.pen) return this.finishPen(); // the Pen's shape, left an open curve
    if (this._stroke && this._artInside && !this._artInside.writing) return this.commitArt(); // drawn in an art layer: it's the layer's
    const stroke = this._stroke;
    this.sendSlice();
    this._stroke = null;
    if (stroke?.drawn) { // what's kept of it for the ghost, even if it changed nothing
      (this.currentFrame.drawn ??= new Map()).set(stroke.id, stroke.drawn);
      this._ghost.frame = null;
    }
    // The mode it drew its cells in, which they keep through undo and redo (frames.js: modes). Only kept once a cell
    // on the frame has stayed: before that, every cell carries.
    const stays = !!(this.animate && useWorkspaceStore().cellsStay);
    const mode = stroke?.cells?.size && (stays || this.currentFrame.modes) ? { stays, keys: stroke.cells } : null;
    if (mode) withModes(this.currentFrame).set(stroke.id, mode);
    const patch = this.paintLayer?.endStroke();
    const basePatch = this.baseLayer?.endStroke();
    this.hasPaint = this.paintLayer?.hasPaint ?? false; // an erase may have left none
    // The Number palette, held still through the stroke, is picked again, and Floyd–Steinberg (Best match's,
    // or the dither's) carries the stroke's change to the base on: when that changed anything else, every
    // cell was rebuilt; when not, only the stroke's cells (shown in its own colors) need catching up.
    if (stroke && (this.quantize === 'count' || carriesError(this.processParams) || this.renderer.holdsDither(this.processParams)) && !this.composite()) {
      const pixels = changedPixels(this.cols, this.rows, [[patch, this.paintLayer], [basePatch, this.baseLayer]], [[stroke.baseRecords.pins, this.baseRecords.pins]], stroke.keys, stroke.shapeRect);
      if (pixels) this.recompose(pixels);
      else this.rebuildCells();
    }
    if (!stroke || (!patch && !basePatch && !stroke.wroteCells && stroke.baseRecords === this.baseRecords)) {
      if (stroke) {
        keepDrawn(this.currentFrame, stroke.id); // no step to undo it
        keepMode(this.currentFrame, stroke.id);
      }
      return;
    }

    // The entry mustn't close over stroke or patch: the old map and the tiles are the ledger's to hold now.
    const { cursor, id, sent, drawn } = stroke, chosen = stroke.startShapes !== this.shapes && stroke.vectorSelected;
    const drawnAsArtist = this._sharing?.role === 'artist';
    const records = { before: stroke.baseRecords, after: this.baseRecords };
    const frame = this.currentFrame, ledger = this._ledger; // undoing goes back to the frame it was drawn on, and its ledger
    // On a frame, its shapes as they were before this edit, for undo (shapesBefore), and as it left them, for redo: a key
    // action since can have changed them with the ledger none the wiser, and its redo puts back only what it thinks differs.
    const changed = stroke.startShapes === this.shapes ? [] : [...new Set([...stroke.startShapes.keys(), ...this.shapes.keys()])].filter((key) => stroke.startShapes.get(key) !== this.shapes.get(key));
    const shapesBefore = this.shapesBefore(changed, stroke.startShapes, stroke.startFrame), shapesAfter = changed.map((key) => [key, this.shapes.get(key) ?? null]);
    const also = { patches: [[basePatch, this.baseLayer]], pins: [records.before.pins, records.after.pins] };
    const apply = (side) => {
      if (!this.frames.includes(frame)) return;
      this.showFrame(this.frames.indexOf(frame));
      if (drawn) {
        if (side === 'before') frame.drawn.delete(id);
        else frame.drawn.set(id, drawn);
        this._ghost.frame = null;
      }
      if (mode) {
        if (side === 'before') frame.modes.delete(id);
        else withModes(frame).set(id, mode);
      }
      if (side === 'before' && cursor) useWorkspaceStore().textCursor = cursor; // typing undone: the cursor goes back to where it started
      if (side === 'before' && chosen) useWorkspaceStore().vectorSelected = chosen; // a shapes edit undone: its selection back
      if (this._sharing?.role === 'artist') { // the host says what happens; an artist has no base edits to put back
        if (sent) this.askForStroke(side === 'before' ? 'undo' : 'redo', id); // or it changed nothing: nothing to ask
        return;
      }
      if (drawnAsArtist) { // and now the host: the stroke's in the ledger, and its pins are from another time
        this.ownStroke(side, id);
        return;
      }
      if (basePatch) this.baseLayer.applyPatch(basePatch, side);
      this.setBaseRecords(records[side]);
      if (basePatch || records.before !== records.after) this.sendBase(basePatch, side);
      this.ownStroke(side, id, also, sent);
      this.putShapesBack(side === 'before' ? shapesBefore : shapesAfter);
    };
    this.pushEdit({
      stroke: id,
      undo: () => apply('before'),
      redo: () => apply('after'),
      onDrop: () => { ledger.forget(id); keepDrawn(frame, id); keepMode(frame, id); }, // or while a merge holds its stacks, not found: see pushWholeLayer
      bytes: this._ledger.bytesOf(id) + bytesHeld(basePatch),
    });
    if (basePatch || records.before !== records.after) this.sendBase(basePatch, 'after');
  },

  // A step for a stroke the ledger came back with, as the host's own: a reload has only its id.
  pushKeptStroke(id) {
    this.history.push({
      stroke: id,
      undo: () => (this._sharing?.role === 'artist' ? this.askForStroke('undo', id) : this.ownStroke('before', id)),
      redo: () => (this._sharing?.role === 'artist' ? this.askForStroke('redo', id) : this.ownStroke('after', id)),
      onDrop: () => this._ledger.forget(id),
      bytes: this._ledger.bytesOf(id),
    });
    this.historyVersion = this.history.version;
  },

  // Take a stroke back, or put it back on top, and show what that changed. also: applyChange's. Null
  // when the ledger has nothing of it, as with a stroke of base pixels alone, whose entry still has also.
  undoStroke(stroke, also) {
    const change = this._ledger.undo(this._by, stroke);
    this.applyChange(change ?? NO_CHANGE, also);
    this.sendNumbered(change);
    return change;
  },

  redoStroke(stroke, also) {
    const change = this._ledger.redo(this._by, stroke);
    this.applyChange(change ?? NO_CHANGE, also);
    this.sendNumbered(change);
    return change;
  },

  // A host's own step. In a room the ledger can have let go of a stroke that went in it (expected: false for one
  // of base pixels alone), and then the step's no use: it goes, and that's said.
  ownStroke(side, id, also, expected = true) {
    const change = side === 'before' ? this.undoStroke(id, also) : this.redoStroke(id, also);
    if (!change && expected && this._sharing) this.strokeRefused(side === 'before' ? 'undo' : 'redo', id);
  },

  // Write a change's cells and runs and refresh only what changed. also: what's changed with it, for
  // one refresh to cover: patches ([patch, layer]) already applied, and pins ([before, after]). Inside an art layer
  // its cells and runs are the drawing's, kept aside: they show on stepping out (leaveArt redraws it all). A change
  // to the layer itself (someone's undo, say), or to where it shows (a follower's path moved it), is drawn on again;
  // anything else leaves an open stroke inside it as it is.
  applyChange({ cells: all, runs }, { patches = [], pins = [] } = {}) {
    const cells = all.filter(([key]) => !isShapeKey(key)), shapes = all.filter(([key]) => isShapeKey(key));
    const placeOf = () => placedShapes(this).get(this._artInside.key)?.m; // where the layer shows: a follower's path can move it
    const was = this._artInside && shapes.length ? placeOf() : null;
    if (shapes.length) {
      const next = new Map(this.shapes);
      for (const [key, shape] of shapes) {
        if (shape) next.set(key, shape);
        else next.delete(key);
      }
      this.shapes = next;
      if (this._stroke) this._stroke.shapes = next;
    }
    const inside = this._artInside, drawing = inside ?? this;
    if (cells.length) {
      const next = new Map(drawing.editCells);
      for (const [key, entry] of cells) {
        if (entry) next.set(key, entry);
        else next.delete(key);
      }
      drawing.editCells = next;
      if (this._stroke && !inside) this._stroke.editCells = next; // another's, written mid-stroke: not part of it (sharing.js)
    }
    drawing.paintLayer.writeRuns(runs);
    drawing.hasPaint = drawing.paintLayer.hasPaint;
    if (!inside) this.refreshChanged([[runsPatch(runs), this.paintLayer], ...patches], pins.length ? [pins] : [], cells.map(([key]) => key));
    else if (pins.length) this.refreshChanged([], [pins]);
    const moved = () => { const m = placeOf(); return !m || !was || m.some((v, i) => v !== was[i]); };
    if (inside && shapes.length && (shapes.some(([key]) => key === inside.key) || moved())) this.loadArt();
    else if (shapes.length) this.refreshShapes();
  },

  // Take back the open edit without recording it (a stroke a pinch interrupted): its paint, base
  // pixels, edit cells and pins go back as they were. A typing run or the Pen's shape isn't interrupted by a
  // pinch: it stays (the Pen takes back the point the press made).
  cancelEdit() {
    const stroke = this._stroke;
    if (!stroke || stroke.typing || stroke.pen) return;
    if (stroke.sent) { // some of it has gone out: it comes back the way any stroke does
      this.commitEdit();
      this.undo();
      return;
    }
    this._stroke = null;
    const patch = this.paintLayer?.endStroke();
    const basePatch = this.baseLayer?.endStroke();
    if (patch) this.paintLayer.applyPatch(patch, 'before');
    if (basePatch) this.baseLayer.applyPatch(basePatch, 'before');
    this.hasPaint = this.paintLayer?.hasPaint ?? false;
    const pairs = [[this.editCells, stroke.editCells], [this.baseRecords.pins, stroke.baseRecords.pins]];
    this.editCells = stroke.editCells;
    this.shapes = stroke.shapes;
    this.setBaseRecords(stroke.baseRecords);
    this.refreshChanged([[patch, this.paintLayer], [basePatch, this.baseLayer]], pairs);
    this.refreshShapes();
  },

  // After an edit was undone, redone or taken back: rebuild what it changed (under its paint and
  // base tiles, every cell whose edit cell or pin differs between a pair of maps, and the cells in
  // keys), or render it all when that's a large part of the grid (a big fill), which is as quick.
  refreshChanged(patches, mapPairs, keys = []) {
    const pixels = changedPixels(this.cols, this.rows, patches, mapPairs, keys);
    if (!pixels) this.render();
    else if (pixels.length) this.refreshCells(pixels);
  },

  // Fold an unfinished stroke into history before an edit that replaces the whole layer.
  commitPending() {
    if (this._stroke) this.commitEdit();
    if (!this._floating) this.sendHeld(); // this is what ends a float someone left where it is
    this.commitSliders(); // a slider move still open
    this.flushHeard(); // whatever comes next reads the map
  },

  pushEdit(entry) {
    this._artInside?.entries.add(entry); // undo inside an art layer goes back as far as these (canUndo)
    this.history.push(entry);
    this.historyVersion = this.history.version;
    this.editVersion++;
    if (this.hasFrames && this.quantize === 'count') this.pickPalette(); // a whole movie's (animation.js); a still's is picked by composite
  },

  // An edit that replaced the whole edit layer, already applied: the strokes under it are out of reach
  // until it's undone, and those after it until it's redone, so the entry holds whichever side isn't
  // showing. History dropping one of those strokes meanwhile finds nothing to forget, so what it holds
  // stays until the next reset; the picture and undo stay right.
  // In a room it's final: artists can't follow it being undone (sharing.js). It's the showing frame's edit layer,
  // and undoing goes back to that frame; everyFrame: all of them's, undone from wherever (a Bake).
  pushWholeLayer(undo, redo, bytes, { everyFrame = false } = {}) {
    if (this._sharing?.role === 'host') {
      this.editVersion++;
      this.shareWholeDocument();
      return;
    }
    const frames = everyFrame ? this.frames : [this.currentFrame];
    const ledgerOf = (frame) => (frame === this.currentFrame ? this._ledger : (frame.ledger ??= newLedger(() => this)));
    let away = frames.map((frame) => ledgerOf(frame).takeStacks());
    const swap = () => {
      if (!everyFrame) this.showFrame(this.frames.indexOf(frames[0]));
      const showing = frames.map((frame) => ledgerOf(frame).takeStacks());
      frames.forEach((frame, i) => {
        ledgerOf(frame).putStacks(away[i]);
        ledgerOf(frame).rename(ALONE, this._by); // drawn before sharing started, and held here through that
      });
      away = showing;
    };
    this.pushEdit({ undo: () => { swap(); undo(); }, redo: () => { swap(); redo(); }, wholeLayer: true, bytes });
  },

  // The last whole-layer step and everything older go: what's left only needs strokes since.
  dropOldUndo() {
    this.history.dropThrough((entry) => entry.wholeLayer);
    this.historyVersion = this.history.version;
  },

  clearHistory() {
    if (this._sharing?.strokesAsked) this._sharing.strokesAsked = [];
    this._ledger.reset(); // first: what History drops next has nothing left to forget
    for (const frame of this.frames) {
      frame.ledger = null;
      keepDrawn(frame); // past undo now
    }
    this.history.clear();
    this.historyVersion = this.history.version;
  },

  undo() {
    if (this._stroke?.pen) return this.penBack(); // while the Pen draws: its last point, as Backspace
    this.commitPending();
    if (this._artInside && !this._artInside.entries.has(this.history.last)) return; // not past where you stepped in
    if (lockedStep(this, this.history.last)) return;
    const entry = this.history.undo();
    if (!entry) return;
    this.historyVersion = this.history.version;
    if (this._artInside) this.loadArt(); // what you're drawing on is the layer, as it now is
    // A selection step (changeSelection) isn't a change to the document. Undoing the one that ended a
    // move or paste picks that up again, so undoing it next puts its selection back too.
    if (entry.selectionOnly) {
      if (entry.float) this._float = { ...entry.float, version: this.history.version };
      return;
    }
    // Undoing a step of a move or paste: the block floats as it was before it, the selection with it
    // (a paste's first step: the selection is dropped; a stamp's goes back to the copy it left).
    if (entry.floats) {
      const { before, after } = entry.floats;
      this._float = before && { ...before, version: this.history.version };
      const workspace = useWorkspaceStore();
      if (toRaw(workspace.selection) === toRaw(after.landed)) workspace.selection = before ? before.landed : after.paste && !after.stamped ? null : after.from;
    }
    this.editVersion++; // undo moves away from what was saved (undoing back to it still counts as dirty)
    if (this.hasFrames && this.quantize === 'count') this.pickPalette();
  },

  redo() {
    this.commitPending();
    if (this._artInside && !this._artInside.entries.has(this.history.next)) return; // only what was done inside
    if (lockedStep(this, this.history.next)) return;
    const entry = this.history.redo();
    if (!entry) return;
    this.historyVersion = this.history.version;
    if (this._artInside) this.loadArt();
    // Redoing a step of a move or paste: the block floats where it landed, selected, to move on from there.
    if (entry.floats) {
      this._float = { ...entry.floats.after, version: this.history.version };
      useWorkspaceStore().selection = entry.floats.after.landed;
    }
    if (!entry.selectionOnly) this.editVersion++;
    if (!entry.selectionOnly && this.hasFrames && this.quantize === 'count') this.pickPalette();
  },
};

// Whether a step can't be undone or redone now: in a room, it reaches an art layer someone else is drawing in (a
// host's, whose steps the ledger holds; an artist's is the host's to refuse). A toast says who.
function lockedStep(project, entry) {
  const words = entry?.stroke && project._sharing && lockedAmong(project, project._ledger.keysOf(entry.stroke));
  if (words) toast(words);
  return !!words;
}

// The grid pixels under patches' tiles ([patch, layer]: tiles in the layer's pixels), in the cells whose
// value differs between each pair of maps ('col,row' keys) or named in keys, and in rect (grid pixels: the
// shapes' area), or null past a quarter of the grid.
function changedPixels(cols, rows, patches, mapPairs, keys = [], rect = null) {
  const limit = cols * rows / 4, seen = new Set(), pixels = [];
  const add = (x, y) => {
    const i = y * cols + x;
    if (x < 0 || y < 0 || x >= cols || y >= rows || seen.has(i)) return;
    seen.add(i);
    pixels.push({ x, y });
  };
  for (const [patch, layer] of patches) {
    if (!patch) continue;
    const k = layer.scale;
    for (const { x, y, w, h } of patch.tiles) {
      for (let gy = Math.floor(y / k); gy < Math.ceil((y + h) / k); gy++) {
        for (let gx = Math.floor(x / k); gx < Math.ceil((x + w) / k); gx++) add(gx, gy);
      }
      if (pixels.length > limit) return null;
    }
  }
  const addCell = (key) => {
    const { col, row } = parseKey(key);
    add(col, 2 * row);
    add(col, 2 * row + 1);
  };
  for (const [a, b] of mapPairs) {
    if (a === b) continue;
    for (const [key, value] of a) if (b.get(key) !== value) addCell(key);
    for (const key of b.keys()) if (!a.has(key)) addCell(key);
    if (pixels.length > limit) return null;
  }
  for (const key of keys) addCell(key);
  if (rect) {
    if (pixels.length + rect.w * rect.h > limit) return null;
    for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) add(x, y);
  }
  return pixels.length > limit ? null : pixels;
}
