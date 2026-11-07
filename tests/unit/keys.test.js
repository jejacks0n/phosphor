// Keys as data: each part's keys in a shape's life, and what moving, deleting or adding them changes.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { rectShape, transformed, translation, withShape } from '../../src/document/shapes.js';
import { ease, shapeAt, strayEasings } from '../../src/document/tweens.js';
import { EMPTY_STATE, cellState, deserializeFrames, newFrame, serializeFrames } from '../../src/document/frames.js';
import { PARTS } from '../../src/document/parts.js';
import { addedKey, deletedKeys, listedParts, moveRange, movedKeys, partKeys } from '../../src/document/keys.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const K = 'v:ball', RED = rectShape(2, 2, 6, 6, { fill: '#ff0000' });
const down = (y, shape = RED) => transformed(shape, translation(0, y));
const movie = (length) => Array.from({ length }, (_, i) => newFrame(i ? 'blank' : 'wipe'));
// Frame at has the ball as shape, keying the parts named (all with none), easing the parts in eases.
function put(frames, at, shape, parts = null, eases = null) {
  frames[at].changes.set(K, cellState(shape, 0, 0));
  if (parts) frames[at].parts = new Map([[K, new Set(parts)]]);
  if (eases) frames[at].tweens = new Map([[K, new Map(Object.entries(eases))]]);
}
const applied = (frames, patch) => frames.map((frame, at) => (patch.has(at) ? { ...frame, ...patch.get(at) } : frame));
const ats = (frames, part, i = 0) => partKeys(frames, K, i).rows.get(part).map(({ at }) => at);

test("partKeys lists each part's keys, easing null on the last", () => {
  const frames = movie(16);
  put(frames, 0, RED, null, { transform: 'easeIn', fill: 'linear' });
  frames[0].motions = new Map([[K, 'cells']]);
  put(frames, 6, withShape(down(12), { fill: '#0000ff' }), ['transform', 'fill'], { transform: 'easeOut', fill: 'linear' });
  put(frames, 12, down(24), ['transform'], { transform: 'linear' }); // stray: nothing after it
  frames[14].changes.set(K, EMPTY_STATE);
  const { start, end, rows } = partKeys(frames, K, 3);
  assert.deepEqual([start, end, rows.size], [0, 13, 10]);
  assert.deepEqual(rows.get('transform'), [
    { at: 0, easing: 'easeIn', motion: 'cells', fixed: false },
    { at: 6, easing: 'easeOut', motion: 'smooth', fixed: false },
    { at: 12, easing: null, motion: 'smooth', fixed: false },
  ]);
  assert.deepEqual(rows.get('fill').map(({ at, easing }) => [at, easing]), [[0, 'linear'], [6, null]]);
  assert.deepEqual(rows.get('outline').map(({ at, easing }) => [at, easing]), [[0, null]]);
  assert.equal(partKeys(frames, K, 15), null);
});

// Frames 0 to 15: the ball on 0, a Duplicate of it on 6, moved down 8 on 9, and a Wipe without it on 12.
function duplicated() {
  const frames = movie(16);
  put(frames, 0, RED);
  frames[6].kind = 'duplicate';
  put(frames, 6, RED);
  put(frames, 9, down(8), ['transform']);
  frames[12].kind = 'wipe';
  return frames;
}

test("partKeys marks a Duplicate's keys fixed and ends the life at a Wipe", () => {
  const { start, end, rows } = partKeys(duplicated(), K, 3);
  assert.deepEqual([start, end], [0, 11]);
  assert.deepEqual(rows.get('transform').map(({ at, fixed }) => [at, fixed]), [[0, false], [6, true], [9, false]]);
  assert.deepEqual(rows.get('fill').map(({ at, fixed }) => [at, fixed]), [[0, false], [6, true]]);
  const copy = partKeys(duplicated(), K, 9); // seen from after it, the Duplicate starts a life of its own copy
  assert.deepEqual([copy.start, copy.end, copy.rows.get('transform')[0].fixed], [6, 11, true]);
  const wiped = duplicated();
  wiped[6].kind = 'wipe'; // a Wipe holding the shape holds its own copy too: fixed, but where it starts the life
  assert.equal(partKeys(wiped, K, 3).rows.get('transform')[1].fixed, true);
  assert.equal(partKeys(wiped, K, 9).rows.get('transform')[0].fixed, false);
});

test('listedParts leaves out parts whose keys all hold one value', () => {
  assert.deepEqual(listedParts(duplicated(), K, 3), ['transform']); // the Duplicate's copy repeats every part
  assert.deepEqual(listedParts(movie(4), K, 0), []);
});

test("listedParts lists a part keyed by hand though its value doesn't change", () => {
  const frames = movie(13);
  put(frames, 0, RED);
  put(frames, 6, RED, ['fill']);
  assert.deepEqual(listedParts(frames, K, 3), ['fill']);
});

test('listedParts lists every part of a Blank key frame keyed by hand on all of them, which holds no parts', () => {
  let frames = movie(13);
  put(frames, 0, RED);
  put(frames, 12, down(24), ['transform']);
  for (const part of PARTS) frames = applied(frames, addedKey(frames, K, part, 6));
  assert.equal(frames[6].parts, null); // every part: as setPartsAt has it
  assert.deepEqual(listedParts(frames, K, 3), PARTS);
});

test("moveRange: a key can't cross a Duplicate", () => {
  const frames = movie(16);
  put(frames, 0, RED);
  put(frames, 3, down(6), ['transform']);
  frames[8].kind = 'duplicate';
  put(frames, 8, down(6));
  put(frames, 11, down(20), ['transform']);
  assert.deepEqual(moveRange(frames, K, [{ part: 'transform', at: 3 }]), { least: -3, most: 4 });
  assert.deepEqual(moveRange(frames, K, [{ part: 'transform', at: 11 }]), { least: -2, most: 4 });
});

test('moveRange: the start stops a frame short of the next key of any part, and back to the frame after a Wipe', () => {
  const frames = movie(16);
  frames[2].kind = 'wipe';
  put(frames, 5, RED);
  put(frames, 8, withShape(RED, { fill: '#0000ff' }), ['fill']);
  put(frames, 12, down(8), ['transform']);
  assert.deepEqual(moveRange(frames, K, [{ part: 'transform', at: 5 }]), { least: -2, most: 2 });
  assert.deepEqual(moveRange(frames, K, [{ part: 'outline', at: 5 }, { part: 'fill', at: 8 }]), { least: -2, most: 6 });
});

test('moveRange: the start stops a frame after an erase before it', () => {
  const frames = movie(16);
  put(frames, 0, RED);
  frames[3].changes.set(K, EMPTY_STATE);
  put(frames, 7, RED);
  put(frames, 10, down(8), ['transform']);
  assert.deepEqual(moveRange(frames, K, [{ part: 'fill', at: 7 }]), { least: -3, most: 2 });
});

test("moveRange: a selection with a fixed key doesn't move", () => {
  assert.deepEqual(moveRange(duplicated(), K, [{ part: 'transform', at: 6 }, { part: 'transform', at: 9 }]), { least: 0, most: 0 });
});

// Frames 0 to 12: the ball moved down 12 on 6 and 24 on 12, its Transform eased from 0 and 6.
function moving(first = 'easeIn', second = 'easeOut') {
  const frames = movie(13);
  put(frames, 0, RED, null, { transform: first });
  put(frames, 6, down(12), ['transform'], { transform: second });
  put(frames, 12, down(24), ['transform']);
  return frames;
}

test('movedKeys carries the easing; the tweens either side stretch', () => {
  const frames = moving();
  const { patch, refs } = movedKeys(frames, K, [{ part: 'transform', at: 6 }], 2), next = applied(frames, patch);
  assert.deepEqual(refs, [{ part: 'transform', at: 8 }]);
  close(shapeAt(next, K, 7).m[5], 12 * ease('easeIn', 7 / 8));
  close(shapeAt(next, K, 10).m[5], 12 + 12 * ease('easeOut', 2 / 4));
  assert.equal(next[6].changes.has(K), false);
  assert.equal(next[8].tweens.get(K).get('transform'), 'easeOut');
  assert.deepEqual([...next[8].parts.get(K)], ['transform']);
  assert.equal(next[8].changes.get(K).cell.m[5], 12);
  assert.equal(frames[6].changes.has(K), true); // the frames themselves are as they were
});

test('movedKeys onto a same-part key replaces it', () => {
  const frames = movie(13);
  put(frames, 0, RED, null, { transform: 'linear', fill: 'linear' });
  put(frames, 4, withShape(RED, { fill: '#0000ff' }), ['fill'], { fill: 'linear' });
  put(frames, 8, withShape(RED, { fill: '#00ff00' }), ['fill']);
  put(frames, 12, down(24), ['transform']);
  const next = applied(frames, movedKeys(frames, K, [{ part: 'fill', at: 4 }], 4).patch);
  assert.deepEqual(ats(next, 'fill'), [0, 8]);
  assert.equal(next[8].changes.get(K).cell.fill, '#0000ff');
  assert.equal(next[4].changes.has(K), false);
  assert.deepEqual(strayEasings(next, K), []);
});

test("movedKeys that takes a part's last key past its previous one leaves no stray easing", () => {
  const frames = moving('linear', 'easeIn');
  const next = applied(frames, movedKeys(frames, K, [{ part: 'transform', at: 12 }], -9).patch);
  assert.deepEqual(partKeys(next, K, 0).rows.get('transform').map(({ at, easing }) => [at, easing]), [[0, 'linear'], [3, null], [6, null]]);
  assert.deepEqual(strayEasings(next, K), []);
  assert.equal(next[6].tweens, null);
  assert.equal(shapeAt(next, K, 3).m[5], 24);
});

test("moving the start later: the frames it left don't show the shape", () => {
  const frames = movie(13);
  put(frames, 4, RED, null, { transform: 'linear' });
  put(frames, 10, down(12), ['transform']);
  assert.deepEqual(moveRange(frames, K, [{ part: 'fill', at: 4 }]), { least: -3, most: 5 });
  const next = applied(frames, movedKeys(frames, K, [{ part: 'fill', at: 4 }], 2).patch);
  assert.equal(shapeAt(next, K, 4), null);
  assert.equal(shapeAt(next, K, 5), null);
  assert.deepEqual(shapeAt(next, K, 6), RED);
  assert.equal(next[6].tweens.get(K).get('transform'), 'linear');
  assert.equal(next[6].parts, null);
  close(shapeAt(next, K, 8).m[5], 6);
});

test('deletedKeys: the part tweens from the key before to the key after with the easing before; the start is skipped', () => {
  const frames = moving('easeIn', 'linear');
  const next = applied(frames, deletedKeys(frames, K, [{ part: 'transform', at: 0 }, { part: 'transform', at: 6 }]));
  assert.deepEqual(ats(next, 'transform'), [0, 12]);
  assert.equal(next[6].changes.has(K), false);
  close(shapeAt(next, K, 6).m[5], 24 * ease('easeIn', 0.5));
  const last = applied(frames, deletedKeys(frames, K, [{ part: 'transform', at: 12 }]));
  assert.equal(last[6].tweens, null); // the key that's last now holds
  assert.deepEqual(strayEasings(last, K), []);
});

test('addedKey splits a tween: both halves keep the easing', () => {
  const frames = movie(16);
  put(frames, 0, RED, null, { transform: 'easeInOut' });
  frames[0].motions = new Map([[K, 'half']]);
  put(frames, 12, down(24), ['transform'], { transform: 'linear' }); // stray: nothing after it
  const next = applied(frames, addedKey(frames, K, 'transform', 6));
  assert.deepEqual([...next[6].parts.get(K)], ['transform']);
  assert.equal(next[6].tweens.get(K).get('transform'), 'easeInOut');
  assert.equal(next[6].motions.get(K), 'half');
  assert.deepEqual(shapeAt(next, K, 6).m, shapeAt(frames, K, 6).m);
  for (const i of [3, 9]) assert.equal(shapeAt(next, K, i).m[5], 6 + (i - 3) * 2, `frame ${i}`); // each half eased in and out
  assert.equal(addedKey(next, K, 'transform', 6), null);
  // After the last key: it holds, and the last's easing left over doesn't come back.
  const after = applied(frames, addedKey(frames, K, 'transform', 14));
  assert.equal(after[14].tweens, null);
  assert.equal(after[12].tweens, null);
  assert.equal(shapeAt(after, K, 13).m[5], 24);
  assert.deepEqual(strayEasings(after, K), []);
});

// A key added where an Elastic tween springs past its end stores the shape as it shows, and the movie still reopens.
function springsPast(part, shape, to) {
  const frames = movie(12);
  put(frames, 0, shape, null, { [part]: 'elastic' });
  put(frames, 10, withShape(shape, { [part]: to }), [part]);
  const at = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((i) => ease('elastic', i / 10) > 1);
  const next = applied(frames, addedKey(frames, K, 'transform', at));
  const json = JSON.parse(JSON.stringify({ frames: serializeFrames(next), frame: 0, fps: 12 }));
  const read = deserializeFrames(json, 40, 40);
  assert.ok(read, 'the movie reopens');
  return { kept: read.frames[at].changes.get(K).cell, shown: shapeAt(next, K, at) };
}

test('a key added mid-Elastic on End round-trips, End held to 1', () => {
  const { kept, shown } = springsPast('end', withShape(RED, { end: 0 }), 1);
  assert.deepEqual(kept, shown);
  assert.equal('end' in kept, false);
});

test('a key added mid-Elastic on Along round-trips, past 1', () => {
  const { kept, shown } = springsPast('along', withShape(RED, { follow: { key: 'v:path' } }), 1);
  assert.deepEqual(kept, shown);
  assert.ok(kept.along > 1, `along ${kept.along}`);
});

test('moveRange and movedKeys leave out refs that name no key', () => {
  const frames = moving();
  assert.deepEqual(moveRange(frames, K, [{ part: 'fill', at: 6 }]), { least: 0, most: 0 });
  assert.deepEqual(movedKeys(frames, K, [{ part: 'fill', at: 6 }], 2), { patch: new Map(), refs: [] });
  const { refs } = movedKeys(frames, K, [{ part: 'transform', at: 6 }, { part: 'fill', at: 6 }], 2);
  assert.deepEqual(refs, [{ part: 'transform', at: 8 }]);
});

test("moveRange: a Wipe start can't move earlier", () => {
  const frames = movie(16);
  frames[4].kind = 'wipe';
  put(frames, 4, RED);
  put(frames, 10, down(12), ['transform']);
  assert.deepEqual(moveRange(frames, K, [{ part: 'transform', at: 4 }]), { least: 0, most: 5 });
});

test('the start moves with other selected keys, keeping their spacing', () => {
  const frames = movie(16);
  put(frames, 4, RED, null, { transform: 'linear' });
  put(frames, 8, down(8), ['transform']);
  put(frames, 12, down(16), ['transform']);
  const refs = [{ part: 'fill', at: 4 }, { part: 'transform', at: 8 }];
  assert.deepEqual(moveRange(frames, K, refs), { least: -3, most: 7 });
  const moved = movedKeys(frames, K, refs, -2), next = applied(frames, moved.patch);
  assert.deepEqual(moved.refs, [{ part: 'fill', at: 2 }, { part: 'transform', at: 6 }]);
  assert.deepEqual(ats(next, 'transform', 2), [2, 6, 12]);
  assert.deepEqual(ats(next, 'fill', 2), [2]);
  assert.equal(shapeAt(next, K, 1), null);
  assert.equal(shapeAt(next, K, 4).m[5], 4);
});

test('keys of different parts move together', () => {
  const frames = movie(13);
  put(frames, 0, RED);
  put(frames, 4, withShape(RED, { fill: '#0000ff' }), ['fill']);
  put(frames, 6, down(12), ['transform']);
  put(frames, 12, down(24), ['transform']);
  const refs = [{ part: 'fill', at: 4 }, { part: 'transform', at: 6 }];
  assert.deepEqual(moveRange(frames, K, refs), { least: -4, most: 6 });
  const moved = movedKeys(frames, K, refs, 2), next = applied(frames, moved.patch);
  assert.deepEqual(moved.refs, [{ part: 'fill', at: 6 }, { part: 'transform', at: 8 }]);
  assert.deepEqual([ats(next, 'fill'), ats(next, 'transform')], [[0, 6], [0, 8, 12]]);
  assert.deepEqual([[...next[6].parts.get(K)], [...next[8].parts.get(K)]], [['fill'], ['transform']]);
  assert.equal(next[4].changes.has(K), false);
  assert.equal(next[8].changes.get(K).cell.fill, '#0000ff');
});

test("a key dropped on the start replaces the start's value for its part", () => {
  const frames = movie(13);
  put(frames, 0, RED);
  put(frames, 4, withShape(RED, { fill: '#0000ff' }), ['fill']);
  put(frames, 8, down(8), ['transform']);
  assert.equal(moveRange(frames, K, [{ part: 'fill', at: 4 }]).least, -4);
  const next = applied(frames, movedKeys(frames, K, [{ part: 'fill', at: 4 }], -4).patch);
  assert.deepEqual(ats(next, 'fill'), [0]);
  assert.equal(next[0].changes.get(K).cell.fill, '#0000ff');
  assert.equal(next[0].parts, null);
  assert.equal(next[4].changes.has(K), false);
  assert.equal(shapeAt(next, K, 8).m[5], 8);
});

test('a patch holds only the frames whose state changed', () => {
  const frames = moving();
  assert.deepEqual([...movedKeys(frames, K, [{ part: 'transform', at: 6 }], 2).patch.keys()].sort((a, b) => a - b), [6, 8]);
  assert.deepEqual([...deletedKeys(frames, K, [{ part: 'transform', at: 6 }]).keys()], [6]);
  assert.equal(deletedKeys(frames, K, [{ part: 'fill', at: 0 }]).size, 0);
});
