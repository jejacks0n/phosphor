// Undo/redo stack semantics and the tile math used to record paint strokes.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import History, { TILE, tilesForRect } from '../../src/document/History.js';

test('Undo/redo stack semantics and the tile math used to record paint strokes', async () => {
  const log = [];
  const entry = (n) => ({ undo: () => log.push(`u${n}`), redo: () => log.push(`r${n}`) });
  const h = new History(2);
  assert.equal(h.canUndo, false);
  assert.equal(h.undo(), false);
  const [e2, e3] = [entry(2), entry(3)];
  h.push(entry(1)); h.push(e2); h.push(e3); // limit 2 evicts entry 1
  assert.equal(h.undo(), e3); assert.equal(h.undo(), e2); assert.equal(h.undo(), false); // each returns the entry it undid
  assert.deepEqual(log, ['u3', 'u2']);
  assert.equal(h.redo(), e2); assert.equal(log.at(-1), 'r2');
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
});

test('retain keeps the entries it accepts, in order, on both sides of the cursor', () => {
  const log = [];
  const entry = (n, keep) => ({ keep, undo: () => log.push(`u${n}`), redo: () => log.push(`r${n}`) });
  const h = new History(10);
  [entry(1, true), entry(2, false), entry(3, true), entry(4, true)].forEach((e) => h.push(e));
  h.undo(); // 4 is redoable
  h.retain((e) => e.keep);
  assert.ok(h.undo()); assert.ok(h.undo()); assert.equal(h.undo(), false);
  assert.deepEqual(log, ['u4', 'u3', 'u1']);
  h.redo(); h.redo(); h.redo();
  assert.deepEqual(log.slice(3), ['r1', 'r3', 'r4']);
});

test('past its byte budget, history drops its oldest steps, but never the newest', () => {
  const log = [];
  const entry = (n, bytes) => ({ bytes, undo: () => log.push(`u${n}`), redo: () => log.push(`r${n}`) });
  const h = new History(50, 100);
  h.push(entry(1, 40)); h.push(entry(2, 40)); h.push(entry(3, 40)); // 120 > 100: entry 1 goes
  assert.equal(h.bytes, 80);
  while (h.undo());
  assert.deepEqual(log, ['u3', 'u2']);
  h.push(entry(4, 500)); // the redo tail (2, 3) goes; the newest stays, however big
  assert.equal(h.bytes, 500);
  assert.ok(h.undo());
  assert.equal(h.undo(), false);
  h.push(entry(5)); // a step that holds nothing to speak of
  assert.equal(h.bytes, 0);
});
