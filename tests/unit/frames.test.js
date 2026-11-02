import { test } from 'vitest';
import assert from 'node:assert/strict';
import { EMPTY_STATE, FRAME_KINDS, cellState, foldDeleted, frameDiff, isEmptyState, newFrame, resolveOver } from '../../src/document/frames.js';

const A = Object.freeze({ char: 'A' }), B = Object.freeze({ char: 'B' });
const RED = 0xff0000ff, BLUE = 0x0000ffff;

// Each frame resolved over the one before, as the store does.
function resolveAll(frames) {
  const out = [];
  frames.forEach((frame, i) => out.push(resolveOver(i ? out[i - 1] : new Map(), frame)));
  return out;
}
const blank = (entries = []) => newFrame('blank', new Map(entries));

test('the kinds are blank, duplicate and wipe', () => {
  assert.deepEqual(FRAME_KINDS, ['blank', 'duplicate', 'wipe']);
});

test('a cell state is frozen and empty only with nothing in it', () => {
  assert.ok(Object.isFrozen(cellState(A, 0, 0)));
  assert.ok(isEmptyState(EMPTY_STATE));
  assert.ok(isEmptyState(cellState(null, 0, 0)));
  assert.ok(!isEmptyState(cellState(A, 0, 0)));
  assert.ok(!isEmptyState(cellState(null, 0, RED)));
});

test('a change carries forward until a frame that changed that cell', () => {
  const frames = [blank([['1,1', cellState(A, 0, 0)]]), blank(), blank([['1,1', cellState(B, 0, 0)]]), blank()];
  assert.deepEqual(resolveAll(frames).map((map) => map.get('1,1').cell.char), ['A', 'A', 'B', 'B']);
});

test('an explicit erase on a Blank frame carries forward', () => {
  const frames = [blank([['1,1', cellState(A, 0, 0)]]), blank([['1,1', EMPTY_STATE]]), blank()];
  const resolved = resolveAll(frames);
  assert.ok(resolved[0].has('1,1'));
  assert.ok(!resolved[1].has('1,1'));
  assert.ok(!resolved[2].has('1,1'));
});

test('a Wipe resolves to only its own changes', () => {
  const frames = [blank([['1,1', cellState(A, 0, 0)]]), newFrame('wipe', new Map([['2,2', cellState(B, 0, 0)]]))];
  assert.deepEqual([...resolveAll(frames)[1].keys()], ['2,2']);
});

test('a Duplicate ignores anything added to earlier frames after it was made', () => {
  const first = blank([['1,1', cellState(A, 0, 0)]]);
  const duplicate = newFrame('duplicate', new Map(resolveOver(new Map(), first)));
  first.changes.set('2,2', cellState(B, 0, 0)); // a fix on frame 1, after the Duplicate was made
  const resolved = resolveAll([first, duplicate]);
  assert.ok(resolved[0].has('2,2'));
  assert.ok(!resolved[1].has('2,2'));
  assert.ok(resolved[1].has('1,1'));
});

test('a change owns the whole cell: frame 2 painting one half stops frame 1 fixing the other', () => {
  const first = blank([['1,1', cellState(null, RED, 0)]]);
  const second = blank();
  const live = new Map([['1,1', cellState(null, RED, BLUE)]]); // frame 2 painted the bottom half
  second.changes = frameDiff(resolveOver(new Map(), first), live);
  first.changes.set('1,1', cellState(null, BLUE, 0)); // the fix on frame 1's top half
  const resolved = resolveAll([first, second]);
  assert.equal(resolved[0].get('1,1').top, BLUE);
  assert.equal(resolved[1].get('1,1').top, RED);
  assert.equal(resolved[1].get('1,1').bottom, BLUE);
});

for (const kind of FRAME_KINDS) {
  test(`deleting a ${kind} frame leaves the resolved frames after it unchanged`, () => {
    const first = blank([['1,1', cellState(A, 0, 0)], ['2,2', cellState(A, 0, 0)]]);
    const deleted = newFrame(kind, new Map([['1,1', cellState(B, 0, 0)], ['3,3', EMPTY_STATE]]));
    const next = blank([['4,4', cellState(B, 0, RED)]]);
    const last = newFrame('wipe', new Map([['5,5', cellState(A, 0, 0)]]));
    const before = resolveAll([first, deleted, next, last]);

    const folded = foldDeleted(deleted, next);
    Object.assign(next, folded);
    const after = resolveAll([first, next, last]);

    assert.deepEqual(after[1], before[2]);
    assert.deepEqual(after[2], before[3]);
  });

  test(`deleting a ${kind} frame before a Wipe leaves that frame alone`, () => {
    const deleted = newFrame(kind, new Map([['1,1', cellState(B, 0, 0)]]));
    const next = newFrame('wipe', new Map([['4,4', cellState(B, 0, 0)]]));
    const { kind: was, changes } = foldDeleted(deleted, next);
    assert.equal(was, 'wipe');
    assert.deepEqual([...changes.keys()], ['4,4']);
  });
}

test('deleting frame 0 keeps the next frame looking the same', () => {
  const first = blank([['1,1', cellState(A, 0, 0)], ['2,2', cellState(A, 0, 0)]]);
  const next = blank([['2,2', EMPTY_STATE]]);
  const before = resolveAll([first, next])[1];
  Object.assign(next, foldDeleted(first, next));
  assert.deepEqual(resolveAll([next])[0], before);
});

test('frameDiff records nothing when live equals previous', () => {
  const previous = new Map([['1,1', cellState(A, RED, 0)]]);
  // The same values in new objects, as a file gives them.
  const live = new Map([['1,1', cellState({ char: 'A' }, RED, 0)]]);
  assert.equal(frameDiff(previous, live).size, 0);
});

test('frameDiff records an erase for what live no longer has, and a whole state for what changed', () => {
  const previous = new Map([['1,1', cellState(A, 0, 0)], ['2,2', cellState(A, RED, 0)]]);
  const live = new Map([['2,2', cellState(A, BLUE, 0)], ['3,3', cellState(B, 0, 0)]]);
  const diff = frameDiff(previous, live);
  assert.deepEqual(diff.get('1,1'), EMPTY_STATE);
  assert.equal(diff.get('2,2').top, BLUE);
  assert.equal(diff.get('3,3').cell.char, 'B');
});

test('frameDiff records no erase of nothing', () => {
  assert.equal(frameDiff(new Map(), new Map([['1,1', EMPTY_STATE]])).size, 0);
});
