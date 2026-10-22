// Undo/redo stack semantics and the tile math used to record paint strokes.
// Run: node scripts/check-history.mjs
import assert from 'node:assert/strict';
import History, { TILE, tilesForRect } from '../src/document/History.js';

const log = [];
const entry = (n) => ({ undo: () => log.push(`u${n}`), redo: () => log.push(`r${n}`) });
const h = new History(2);
assert.equal(h.canUndo, false);
assert.equal(h.undo(), false);
h.push(entry(1)); h.push(entry(2)); h.push(entry(3)); // limit 2 evicts entry 1
assert.equal(h.undo(), true); assert.equal(h.undo(), true); assert.equal(h.undo(), false);
assert.deepEqual(log, ['u3', 'u2']);
assert.equal(h.redo(), true); assert.equal(log.at(-1), 'r2');
h.push(entry(4)); // drops the redo tail (3)
assert.equal(h.canRedo, false);
const v = h.version; h.clear();
assert.ok(h.version > v && !h.canUndo && !h.canRedo);

assert.equal(TILE, 64);
assert.deepEqual(tilesForRect({ x: 60, y: 0, w: 10, h: 10 }, 400, 840), [
  { x: 0, y: 0, w: 64, h: 64 }, { x: 64, y: 0, w: 64, h: 64 }]);
assert.deepEqual(tilesForRect({ x: 390, y: 830, w: 10, h: 10 }, 400, 840), [
  { x: 384, y: 768, w: 16, h: 64 }, { x: 384, y: 832, w: 16, h: 8 }]); // clipped at the layer edges
assert.deepEqual(tilesForRect({ x: 401, y: 0, w: 5, h: 5 }, 400, 840), []); // fully outside
assert.deepEqual(tilesForRect({ x: 70, y: 10, w: 0, h: 5 }, 400, 840), []);  // empty
assert.deepEqual(tilesForRect({ x: -10, y: -10, w: 20, h: 20 }, 400, 840), [{ x: 0, y: 0, w: 64, h: 64 }]);
assert.deepEqual(tilesForRect(null, 400, 840), []);
console.log('history ok');
