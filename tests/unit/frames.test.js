import { describe, expect, test } from 'vitest';
import assert from 'node:assert/strict';
import { EMPTY_STATE, FRAME_KINDS, cellState, deserializeFrames, drawnKeys, foldDeleted, frameDiff, isEmptyState, newFrame, passedOn, resolveOver, serializeFrames } from '../../src/document/frames.js';
import { MAX_CELLS, MAX_COLS, MAX_FRAMES, MAX_LINES } from '../../src/lib/Cells.js';
import { rectShape, transformed, translation, withShape } from '../../src/document/shapes.js';
import { shapeAt } from '../../src/document/tweens.js';

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

describe('saving frames', () => {
  const cell = Object.freeze({ char: 'A', fg: '#ffee00' });
  const good = () => {
    const first = newFrame('blank', new Map([['0,0', cellState(cell, 0xff0000ff, 0)], ['3,1', EMPTY_STATE]]));
    const second = newFrame('wipe', new Map([['2,2', cellState(null, 0, 0x00ff00ff)]]));
    second.hold = 0.5;
    first.drawn = new Map([['a stroke', new Set(['0,0', '5,5'])], ['another', new Set(['6,1'])]]);
    return { frames: serializeFrames([first, second, newFrame('duplicate')]), frame: 1, fps: 12 };
  };
  const on = (change) => { const json = JSON.parse(JSON.stringify(good())); change(json); return json; };

  test('frames round-trip through JSON', () => {
    const read = deserializeFrames(JSON.parse(JSON.stringify(good())), 20, 20);
    expect(read.frame).toBe(1);
    expect(read.fps).toBe(12);
    expect(read.frames.map((f) => [f.kind, f.hold])).toEqual([['blank', 0], ['wipe', 0.5], ['duplicate', 0]]);
    expect([...read.frames[0].changes.keys()]).toEqual(['0,0', '3,1']);
    expect(read.frames[0].changes.get('0,0')).toEqual({ cell, top: 0xff0000ff, bottom: 0 });
    expect(isEmptyState(read.frames[0].changes.get('3,1'))).toBe(true);
    expect(read.frames[1].changes.get('2,2')).toEqual({ cell: null, top: 0, bottom: 0x00ff00ff });
  });

  test('what was drawn on a frame without changing it is kept; what it changed is already in its changes', () => {
    const json = JSON.parse(JSON.stringify(good()));
    expect(json.frames[0].drawn).toEqual(['5,5', '6,1']);
    expect(json.frames[1].drawn).toBeUndefined();
    const read = deserializeFrames(json, 20, 20);
    expect([...drawnKeys(read.frames[0])]).toEqual(['5,5', '6,1']);
    expect([...drawnKeys(read.frames[1])]).toEqual([]);
  });

  test('frames keep their shapes in their own field, so frames read without them still open', async () => {
    const { rectShape } = await import('../../src/document/shapes.js');
    const shape = rectShape(1, 1, 5, 5, { fill: '#ff0000' });
    const frame = newFrame('blank', new Map([['0,0', cellState(A, 0, 0)], ['v:one', cellState(shape, 0, 0)], ['v:gone', EMPTY_STATE]]));
    const json = JSON.parse(JSON.stringify({ frames: serializeFrames([frame]), frame: 0, fps: 12 }));
    expect(json.frames[0].changes.map(([key]) => key)).toEqual(['0,0']);
    expect(json.frames[0].shapes).toEqual([['v:one', JSON.parse(JSON.stringify(shape))], ['v:gone', null]]);
    const read = deserializeFrames(json, 20, 20);
    expect(read.frames[0].changes.get('v:one')).toEqual(cellState(shape, 0, 0));
    expect(isEmptyState(read.frames[0].changes.get('v:gone'))).toBe(true);
    delete json.frames[0].shapes; // as a copy of Phosphor from before shapes wrote it
    expect([...deserializeFrames(json, 20, 20).frames[0].changes.keys()]).toEqual(['0,0']);
    json.frames[0].shapes = [['v:one', { ...shape, z: 'top' }]];
    expect(deserializeFrames(json, 20, 20)).toBe(null); // a bad shape refuses the frames, as a bad cell does
  });

  // Blank frames carry shapes forward, so frames that each add MOST_SHAPES would show more and more.
  test('frames that would show more than MOST_SHAPES shapes on one frame are refused', async () => {
    const { rectShape, MOST_SHAPES } = await import('../../src/document/shapes.js');
    const shape = JSON.parse(JSON.stringify(rectShape(1, 1, 5, 5, { fill: '#ff0000' })));
    const adding = (from, n) => ({ kind: 'blank', hold: 0, changes: [], shapes: Array.from({ length: n }, (_, i) => [`v:s${from + i}`, shape]) });
    const json = { frames: [adding(0, MOST_SHAPES), { kind: 'blank', hold: 0, changes: [] }], frame: 0, fps: 12 };
    expect(deserializeFrames(json, 20, 20)).not.toBe(null);
    json.frames[1] = adding(MOST_SHAPES, 1);
    expect(deserializeFrames(json, 20, 20)).toBe(null);
    json.frames[1] = { ...adding(MOST_SHAPES, 1), kind: 'wipe' }; // a Wipe starts over
    expect(deserializeFrames(json, 20, 20)).not.toBe(null);
    json.frames[1] = { ...adding(MOST_SHAPES, 1), shapes: [['v:s0', null], ['v:new', shape]] }; // one goes, one comes
    expect(deserializeFrames(json, 20, 20)).not.toBe(null);
  });

  const damaged = [
    ['frames not a list', (j) => { j.frames = 'x'; }],
    ['no frames', (j) => { j.frames = []; }],
    ['too many frames', (j) => { j.frames = Array(MAX_FRAMES + 1).fill({ kind: 'blank', hold: 0, changes: [] }); }],
    ['a frame not an object', (j) => { j.frames[0] = 3; }],
    ['an unknown kind', (j) => { j.frames[0].kind = 'fade'; }],
    ['a hold that isn’t a number', (j) => { j.frames[0].hold = '1'; }],
    ['a hold too long', (j) => { j.frames[0].hold = 61; }],
    ['a negative hold', (j) => { j.frames[0].hold = -1; }],
    ['fps not whole', (j) => { j.fps = 1.5; }],
    ['fps too high', (j) => { j.fps = 61; }],
    ['frame past the end', (j) => { j.frame = 3; }],
    ['frame negative', (j) => { j.frame = -1; }],
    ['changes not a list', (j) => { j.frames[0].changes = {}; }],
    ['an entry not a list', (j) => { j.frames[0].changes[0] = 'x'; }],
    ['a bad key', (j) => { j.frames[0].changes[0][0] = '../1'; }],
    ['a column past the limit', (j) => { j.frames[0].changes[0][0] = `${MAX_COLS},0`; }],
    ['a line past the limit', (j) => { j.frames[0].changes[0][0] = `0,${MAX_LINES}`; }],
    ['a color that isn’t one', (j) => { j.frames[0].changes[0][1] = { fg: 'red' }; }],
    ['a cell that isn’t one', (j) => { j.frames[0].changes[0][1] = 7; }],
    ['paint not whole', (j) => { j.frames[0].changes[0][2] = 1.5; }],
    ['paint too large', (j) => { j.frames[0].changes[0][3] = 2 ** 32; }],
    ['paint negative', (j) => { j.frames[0].changes[0][2] = -1; }],
    ['drawn not a list', (j) => { j.frames[0].drawn = '5,5'; }],
    ['a drawn key that isn’t one', (j) => { j.frames[0].drawn = ['5;5']; }],
    ['a drawn key past the limit', (j) => { j.frames[0].drawn = [`${MAX_COLS},0`]; }],
  ];
  test.each(damaged)('a damaged frames value is refused: %s', (_, change) => {
    expect(deserializeFrames(on(change), 20, 20)).toBeNull();
  });

  test('too many entries on a frame is refused', () => {
    const changes = { length: MAX_CELLS + 1 };
    expect(deserializeFrames(on((j) => { j.frames[0].changes = Array.from(changes, () => ['0,0', null, 0, 0]); }), 20, 20)).toBeNull();
  });

  test('a grid too large to animate opens as a still', () => {
    expect(deserializeFrames(good(), 300, 400)).toBeNull();
    expect(deserializeFrames(good(), undefined, 20)).toBeNull();
  });

  test('more frames than the grid can have is refused', () => {
    const many = { frames: Array(101).fill({ kind: 'blank', hold: 0, changes: [] }), frame: 0, fps: 8 };
    expect(deserializeFrames(many, 200, 400)).toBeNull();
    expect(deserializeFrames(many, 80, 50)).not.toBeNull();
  });

  test('anything but an object is refused', () => {
    expect(deserializeFrames(null, 20, 20)).toBeNull();
    expect(deserializeFrames({ fps: 8, frame: 0 }, 20, 20)).toBeNull();
  });
});

test("a deleted key frame's tweens fold into the Blank frame after it", () => {
  const shape = Object.freeze({ points: [] });
  const deleted = newFrame('blank', new Map([['v:a', cellState(shape, 0, 0)], ['v:c', cellState(shape, 0, 0)]]));
  deleted.tweens = new Map([['v:a', 'easeIn'], ['v:b', 'easeOut'], ['v:c', 'linear']]);
  const next = newFrame('blank', new Map([['v:b', cellState(shape, 0, 0)], ['v:c', cellState(shape, 0, 0)]]));
  next.tweens = new Map([['v:b', 'linear']]);
  // v:a goes on from the deleted frame; next's own shapes keep their own tweens, or none (v:c).
  assert.deepEqual(foldDeleted(deleted, next).tweens, new Map([['v:a', 'easeIn'], ['v:b', 'linear']]));
  const wipe = newFrame('wipe');
  wipe.tweens = new Map([['v:b', 'linear']]);
  assert.equal(foldDeleted(deleted, wipe).tweens, wipe.tweens);
});

test("tweens are saved for the shapes a frame owns, and read back; what can't be read is left out", () => {
  const ball = rectShape(0, 0, 4, 4, { fill: '#ff0000' });
  const frames = Array.from({ length: 9 }, () => newFrame('blank'));
  frames[0].changes.set('v:a', cellState(ball, 0, 0));
  frames[0].tweens = new Map([['v:a', 'easeIn']]);
  frames[6].changes.set('v:a', cellState(transformed(ball, translation(0, 24)), 0, 0));
  frames[3].tweens = new Map([['v:a', 'linear']]); // left from an edit undone: frame 3 doesn't own v:a
  const saved = serializeFrames(frames);
  assert.deepEqual(saved[0].tweens, [['v:a', 'easeIn']]);
  assert.ok(saved.slice(1).every((frame) => !('tweens' in frame)));
  const read = (list) => deserializeFrames({ frames: list, frame: 0, fps: 8 }, 20, 20);
  assert.deepEqual(read(saved).frames[0].tweens, new Map([['v:a', 'easeIn']]));
  assert.ok(read(saved).frames.slice(1).every((frame) => frame.tweens === null));
  const odd = structuredClone(saved);
  odd[0].tweens = [['v:a', 'bounceOut'], ['notakey', 'linear'], ['v:zz', 'linear'], 'nonsense', ['v:a']];
  odd[1].tweens = [['v:a', 'linear']]; // frame 1 doesn't own v:a
  odd[2].tweens = 'nonsense';
  const opened = read(odd);
  assert.ok(opened);
  assert.ok(opened.frames.every((frame) => frame.tweens === null));
  const old = saved.map((frame) => Object.fromEntries(Object.entries(frame).filter(([name]) => name !== 'tweens')));
  assert.ok(read(old).frames.every((frame) => frame.tweens === null));
});

// Parts: a key frame that sets only some of a shape keeps saying so, folded, saved and read.
const BALL = rectShape(2, 2, 6, 6, { fill: '#ff0000' });
const GRADIENT = { type: 'linear', stops: [[0, '#ff0000'], [1, '#0000ff']], m: [1, 0, 0, 1, 0, 0] };
function ballFrames() {
  const frames = Array.from({ length: 13 }, (_, i) => newFrame(i ? 'blank' : 'wipe'));
  frames[0].changes.set('v:a', cellState(BALL, 0, 0));
  for (const at of [6, 12]) {
    frames[at].changes.set('v:a', cellState(transformed(BALL, translation(0, at * 2)), 0, 0));
    frames[at].parts = new Map([['v:a', new Set(['transform'])]]);
  }
  return frames;
}
const read = (list) => deserializeFrames({ frames: list, frame: 0, fps: 8 }, 20, 20);
const looks = (frames) => frames.map((_, i) => JSON.stringify(shapeAt(frames, 'v:a', i)));

test('a deleted key frame folds what it set into the Blank frame after it', () => {
  const deleted = newFrame('blank', new Map([['v:a', cellState(withShape(BALL, { fill: '#0000ff' }), 0, 0)]]));
  deleted.parts = new Map([['v:a', new Set(['fill'])]]);
  const next = newFrame('blank', new Map([['v:a', cellState(transformed(BALL, translation(0, 4)), 0, 0)]]));
  next.parts = new Map([['v:a', new Set(['transform'])]]);
  const folded = foldDeleted(deleted, next);
  assert.deepEqual(folded.parts.get('v:a'), new Set(['transform', 'fill']));
  assert.equal(folded.changes.get('v:a').cell.fill, '#0000ff');
  assert.equal(folded.changes.get('v:a').cell.m[5], 4);
});

test('which parts a key frame set is saved and read back, and the saved shape is the one it shows', () => {
  const frames = ballFrames();
  frames[0].changes.set('v:a', cellState(withShape(BALL, { fill: GRADIENT }), 0, 0));
  const saved = serializeFrames(frames);
  assert.deepEqual(saved[0].parts, []);
  assert.deepEqual(saved[6].parts, [['v:a', ['transform']]]);
  assert.ok(!('parts' in saved[3]));
  assert.deepEqual(saved[12].shapes[0][1].fill, frames[0].changes.get('v:a').cell.fill); // for a copy that can't read parts
  const opened = read(JSON.parse(JSON.stringify(saved))).frames;
  assert.deepEqual(opened[6].parts, new Map([['v:a', new Set(['transform'])]]));
  assert.equal(opened[0].parts, null);
  assert.deepEqual(looks(opened), looks(frames));
});

test("parts that can't be read are left out, and the file still opens", () => {
  const saved = serializeFrames(ballFrames());
  saved[6].parts = [['v:a', ['nose']], ['v:zz', ['fill']], 'nonsense', ['v:a']];
  saved[12].parts = 'nonsense';
  const opened = read(saved);
  assert.ok(opened);
  assert.equal(opened.frames[6].parts, null);
  assert.equal(opened.frames[12].parts, null);
});

test('a movie saved before parts reads as it looked, its key frames setting only what differs along them', () => {
  const old = (frames) => serializeFrames(frames).map((frame) => Object.fromEntries(Object.entries(frame).filter(([name]) => name !== 'parts')));
  const whole = (fills) => {
    const frames = ballFrames();
    frames[0].tweens = new Map([['v:a', 'easeIn']]);
    frames[6].tweens = new Map([['v:a', 'easeOut']]);
    fills.forEach((fill, j) => {
      const at = j * 6;
      frames[at].changes.set('v:a', cellState(withShape(frames[at].changes.get('v:a').cell, { fill }), 0, 0));
      frames[at].parts = null; // whole shapes, as before parts
    });
    return frames;
  };
  const changing = whole(['#ff0000', '#ff0000', '#0000ff']), opened = read(old(changing)).frames;
  assert.deepEqual(opened[6].parts.get('v:a'), new Set(['transform', 'fill'])); // red as frame 0, not as frame 12
  assert.equal(opened[12].parts.get('v:a').has('fill'), true);
  assert.deepEqual(looks(opened), looks(changing));
  const same = whole(['#ff0000', '#ff0000', '#ff0000']), reopened = read(old(same)).frames;
  assert.deepEqual(reopened[6].parts.get('v:a'), new Set(['transform']));
  assert.deepEqual(reopened[12].parts.get('v:a'), new Set(['transform']));
  assert.deepEqual(looks(reopened), looks(same));
});

test('a key frame saved before parts, the same as its neighbors, stays a key frame', () => {
  const frames = Array.from({ length: 13 }, (_, i) => newFrame(i ? 'blank' : 'wipe'));
  for (const at of [0, 6, 12]) frames[at].changes.set('v:a', cellState(BALL, 0, 0));
  frames[0].tweens = new Map([['v:a', 'easeIn']]);
  const old = serializeFrames(frames).map((frame) => Object.fromEntries(Object.entries(frame).filter(([name]) => name !== 'parts')));
  assert.deepEqual(read(old).frames[6].parts.get('v:a'), new Set(['transform']));
});

test("a tween's motion is saved and read back; one that can't be read is smooth", () => {
  const ball = ballFrames();
  ball[0].tweens = new Map([['v:a', 'easeIn']]);
  ball[0].motions = new Map([['v:a', 'cells']]);
  const frames = serializeFrames(ball);
  assert.deepEqual(frames[0].motions, [['v:a', 'cells']]);
  assert.equal(frames[6].motions, undefined); // smooth isn't written
  const readBack = (json) => deserializeFrames({ frame: 0, fps: 8, ...json }, 20, 20).frames;
  assert.deepEqual([...readBack({ frames })[0].motions], [['v:a', 'cells']]);
  const wobbly = structuredClone(frames);
  wobbly[0].motions = [['v:a', 'wobbly'], ['v:zz', 'cells']];
  assert.equal(readBack({ frames: wobbly })[0].motions, null);
});

test("a file from when motion was the whole movie's gives it to every tween", () => {
  const ball = ballFrames();
  ball[0].tweens = new Map([['v:a', 'easeIn']]);
  const frames = serializeFrames(ball);
  const old = deserializeFrames({ frames, frame: 0, fps: 8, motion: 'half' }, 20, 20).frames;
  assert.deepEqual(old.filter((frame) => frame.tweens).map((frame) => [...frame.motions]), [[['v:a', 'half']]]);
  assert.equal(deserializeFrames({ frames, frame: 0, fps: 8, motion: 'smooth' }, 20, 20).frames[0].motions, null);
});

test('a staying cell shows on its frame, and passes on what was there before it', () => {
  const before = new Map([['1,1', cellState(A, 0, 0)], ['v:a', cellState(BALL, 0, 0)]]);
  const frame = blank([['1,1', cellState(B, 0, 0, true)], ['2,2', cellState(B, 0, 0, true)], ['3,3', cellState(A, 0, 0)]]);
  const shown = resolveOver(before, frame);
  assert.equal(shown.get('1,1').cell, B);
  const passes = passedOn(before, frame, shown);
  assert.equal(passes.get('1,1').cell, A);
  assert.deepEqual([...passes.keys()].sort(), ['1,1', '3,3', 'v:a']);
  assert.equal(passedOn(before, blank([['3,3', cellState(A, 0, 0)]]), shown), shown); // nothing staying: the same map
});

test('which cells stay is saved and read back; a file whose whole movie stayed reads every cell staying', () => {
  const frames = [blank([['1,1', cellState(A, 0, 0, true)], ['2,2', cellState(B, 0, 0)]])];
  const json = serializeFrames(frames);
  assert.deepEqual(json[0].stays, ['1,1']);
  const read = deserializeFrames({ frames: json, frame: 0, fps: 8 }, 20, 20).frames[0];
  assert.equal(read.changes.get('1,1').stays, true);
  assert.equal(read.changes.get('2,2').stays, undefined);
  const old = deserializeFrames({ frames: serializeFrames([blank([['2,2', cellState(B, 0, 0)]])]), frame: 0, fps: 8, cellsCarry: false }, 20, 20).frames[0];
  assert.equal(old.changes.get('2,2').stays, true);
  assert.equal(deserializeFrames({ frames: [{ ...json[0], stays: ['9,9'] }], frame: 0, fps: 8 }, 20, 20), null); // a cell it doesn't change
});

test('a deleted frame\'s staying cells aren\'t folded into the next', () => {
  const deleted = blank([['1,1', cellState(A, 0, 0, true)], ['2,2', cellState(B, 0, 0)]]);
  assert.deepEqual([...foldDeleted(deleted, blank()).changes.keys()], ['2,2']);
});
