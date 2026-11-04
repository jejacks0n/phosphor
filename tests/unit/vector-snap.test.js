// VECTOR's Snap to: points onto cell corners (Cells) or the halves of cells both ways (Half cells), in grid
// pixels, where a cell is one pixel wide and two tall; along a Shift line where it can; off while Cmd/Ctrl is held.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { snapAlong, snapMode, snapPoint } from '../../src/lib/vectorSnap.js';

test('Snap to: None leaves a point, Cells puts it on a cell corner, Half cells on a cell\'s halves both ways', () => {
  assert.deepEqual(snapPoint({ x: 3.4, y: 4.9 }, 'none'), { x: 3.4, y: 4.9 });
  assert.deepEqual(snapPoint({ x: 3.4, y: 4.9 }, 'cells'), { x: 3, y: 4 });
  assert.deepEqual(snapPoint({ x: 3.6, y: 5.1 }, 'cells'), { x: 4, y: 6 });
  assert.deepEqual(snapPoint({ x: 3.4, y: 4.9 }, 'half'), { x: 3.5, y: 5 });
  assert.deepEqual(snapPoint({ x: 3.2, y: 4.4 }, 'half'), { x: 3, y: 4 });
});

test('along a Shift line: across snaps x, up and down snaps y, at 45° the line wins', () => {
  const from = { x: 1.3, y: 2.7 };
  assert.deepEqual(snapAlong(from, { x: 6.8, y: 2.7 }, 'cells'), { x: 7, y: 2.7 });
  assert.deepEqual(snapAlong(from, { x: 1.3, y: 7.4 }, 'cells'), { x: 1.3, y: 8 });
  assert.deepEqual(snapAlong(from, { x: 4.3, y: 5.7 }, 'cells'), { x: 4.3, y: 5.7 });
  assert.deepEqual(snapAlong(from, { x: 6.8, y: 2.7 }, 'none'), { x: 6.8, y: 2.7 });
});

test('Cmd or Ctrl held turns snapping off for the drag', () => {
  assert.equal(snapMode({ vectorSnap: 'half', isCtrlPressed: false, isMetaPressed: false }), 'half');
  assert.equal(snapMode({ vectorSnap: 'half', isCtrlPressed: true, isMetaPressed: false }), 'none');
  assert.equal(snapMode({ vectorSnap: 'cells', isCtrlPressed: false, isMetaPressed: true }), 'none');
});
