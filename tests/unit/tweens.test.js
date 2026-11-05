// Tweens: a shape worked out part way between two of its versions, and the timing that eases it.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { makeShape, rectShape, rotation, transformed, translation, withShape } from '../../src/document/shapes.js';
import { EASINGS, ease, lifeAt, setPartsAt, shapeAt, spanAt, tweenBands, tweenPart, tweenReach, tweenShape, tweenedAt, workedOutAt } from '../../src/document/tweens.js';
import { EMPTY_STATE, cellState, newFrame } from '../../src/document/frames.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const A = rectShape(0, 0, 4, 4, { fill: '#ff0000' });

test('the easings start at 0 and end at 1, cubic between', () => {
  for (const e of EASINGS) {
    assert.equal(ease(e, 0), 0, e);
    assert.equal(ease(e, 1), 1, e);
  }
  assert.equal(ease('linear', 0.25), 0.25);
  assert.equal(ease('easeIn', 0.5), 0.125);
  assert.equal(ease('easeOut', 0.5), 0.875);
  assert.equal(ease('easeInOut', 0.25), 0.0625);
  assert.equal(ease('easeInOut', 0.75), 0.9375);
});

test('a move, a scale and a turn go part way', () => {
  assert.deepEqual([...tweenShape(A, transformed(A, translation(10, 20)), 0.5).m], [1, 0, 0, 1, 5, 10]);
  const squash = tweenShape(A, withShape(A, { m: [2, 0, 0, 0.5, 0, 0] }), 0.5).m;
  close(squash[0], 1.5);
  close(squash[3], 0.75);
  const turn = tweenShape(A, withShape(A, { m: rotation(Math.PI / 2, 0, 0) }), 0.5).m;
  close(turn[0], Math.SQRT1_2);
  close(turn[1], Math.SQRT1_2);
});

test("a turn goes the short way round, and a mirror doesn't break it", () => {
  const deg = Math.PI / 180;
  const m = tweenShape(withShape(A, { m: rotation(170 * deg) }), withShape(A, { m: rotation(-170 * deg) }), 0.5).m;
  close(m[0], -1);
  const mirrored = tweenShape(withShape(A, { m: [1, 0, 0, 1, 0, 0] }), withShape(A, { m: [-1, 0, 0, 1, 0, 0] }), 0.5).m;
  assert.ok(mirrored.every(Number.isFinite), String(mirrored));
});

test("points go part way when the outlines match, and switch half way when they don't", () => {
  const wide = rectShape(0, 0, 8, 6, { fill: '#ff0000' });
  const mid = tweenShape(A, wide, 0.5);
  mid.points.forEach((p, i) => p.slice(0, 6).forEach((v, j) => close(v, (A.points[i][j] + wide.points[i][j]) / 2)));
  const tri = makeShape({ points: [[0, 0, 0, 0, 0, 0, 0], [4, 0, 0, 0, 0, 0, 0], [2, 4, 0, 0, 0, 0, 0]], closed: true, fill: '#ff0000' });
  assert.deepEqual(tweenShape(A, tri, 0.4).points, A.points);
  assert.deepEqual(tweenShape(A, tri, 0.6).points, tri.points);
  const open = withShape(A, { closed: false });
  assert.equal(tweenShape(open, A, 0.4).closed, false);
  assert.equal(tweenShape(open, A, 0.6).closed, true);
});

test("colors mix in RGB, a width goes part way, and what can't mix switches half way", () => {
  assert.equal(tweenShape(withShape(A, { fill: '#000000' }), withShape(A, { fill: '#ffffff' }), 0.5).fill, '#808080');
  const none = withShape(A, { fill: null }), red = withShape(A, { fill: '#ff0000' });
  assert.equal(tweenShape(none, red, 0.4).fill, null);
  assert.equal(tweenShape(none, red, 0.6).fill, '#ff0000');
  assert.equal(tweenShape(withShape(A, { width: 1 }), withShape(A, { width: 3 }), 0.5).width, 2);
  const butt = withShape(A, { stroke: '#000000', cap: 'butt' }), square = withShape(A, { stroke: '#000000', cap: 'square' });
  assert.equal(tweenShape(butt, square, 0.4).cap, 'butt');
  assert.equal(tweenShape(butt, square, 0.5).cap, 'square');
});

test('a gradient mixes with one of its kind and stop count, else switches', () => {
  const grad = (type, c0, c1, m) => ({ type, stops: [[0, c0], [1, c1]], m });
  const a = withShape(A, { fill: grad('linear', '#000000', '#ffffff', [4, 0, 0, 4, 0, 0]) });
  const b = withShape(A, { fill: grad('linear', '#ffffff', '#000000', [8, 0, 0, 8, 2, 2]) });
  const mid = tweenShape(a, b, 0.5).fill;
  assert.equal(mid.type, 'linear');
  assert.deepEqual(mid.stops.map(([, c]) => c), ['#808080', '#808080']);
  assert.deepEqual([...mid.m], [6, 0, 0, 6, 1, 1]);
  const radial = withShape(A, { fill: grad('radial', '#ffffff', '#000000', [8, 0, 0, 8, 2, 2]) });
  assert.equal(tweenShape(a, radial, 0.4).fill.type, 'linear');
  assert.equal(tweenShape(a, radial, 0.6).fill.type, 'radial');
});

// Frames 0..8: frame 0 owns shape A (its tween easing in), 1 to 5 are Blank and empty, frame 6 owns A moved down 24.
function scene(easing = 'easeIn') {
  const frames = Array.from({ length: 9 }, (_, i) => newFrame(i ? 'blank' : 'wipe'));
  frames[0].changes.set('v:a', cellState(A, 0, 0));
  frames[0].tweens = easing ? new Map([['v:a', easing]]) : null;
  frames[6].changes.set('v:a', cellState(transformed(A, translation(0, 24)), 0, 0));
  return frames;
}

test("a tween runs from a key frame to the shape's next, and puts the eased shape between", () => {
  const frames = scene();
  assert.deepEqual(spanAt(frames, 'v:a', 3), { from: 0, to: 6, easing: 'easeIn' });
  assert.deepEqual(spanAt(frames, 'v:a', 0), { from: 0, to: 6, easing: 'easeIn' });
  assert.equal(spanAt(frames, 'v:a', 6), null);
  assert.equal(tweenedAt(frames, 3).get('v:a').shape.m[5], 3);
  assert.equal(tweenedAt(frames, 3).get('v:a').easing, 'easeIn');
  assert.equal(tweenedAt(frames, 6).size, 0);
  assert.equal(tweenedAt(frames, 7).size, 0);
  assert.deepEqual(tweenBands(frames, 'v:a'), [{ from: 0, to: 6, easing: 'easeIn' }]);
});

test('no easing, a Wipe or Duplicate between, or the shape erased at the far end: no tween', () => {
  const plain = scene(null);
  assert.equal(spanAt(plain, 'v:a', 3).easing, null);
  assert.equal(tweenedAt(plain, 3).size, 0);
  assert.deepEqual(tweenBands(plain, 'v:a'), []);
  for (const kind of ['wipe', 'duplicate']) {
    const cut = scene();
    cut[4].kind = kind;
    assert.equal(spanAt(cut, 'v:a', 3), null, kind);
    assert.equal(tweenedAt(cut, 3).size, 0, kind);
  }
  const erased = scene();
  erased[6].changes.set('v:a', EMPTY_STATE);
  assert.equal(spanAt(erased, 'v:a', 3), null);
});

test('two shapes keep their own tweens', () => {
  const frames = scene();
  frames[0].changes.set('v:b', cellState(A, 0, 0));
  frames[0].tweens.set('v:b', 'linear');
  frames[8].changes.set('v:b', cellState(transformed(A, translation(8, 0)), 0, 0));
  const at4 = tweenedAt(frames, 4);
  assert.equal(at4.get('v:a').shape.m[5], Math.round(24 * ease('easeIn', 4 / 6) * 1e4) / 1e4);
  assert.equal(at4.get('v:b').shape.m[4], 4);
});

test('a change reaches back to the start of the tween it ends or is in', () => {
  const frames = scene();
  assert.equal(tweenReach(frames, 6), 1);
  assert.equal(tweenReach(frames, 3), 1);
  assert.equal(tweenReach(frames, 7), 1); // a part can fade to frame 7 across the shape's whole life
});

test('a shape turned about its center turns in place, wherever it is', () => {
  const box = rectShape(10, 10, 16, 16, { fill: '#ff0000' });
  const m = tweenShape(box, transformed(box, rotation(Math.PI / 2, 13, 13)), 0.5).m;
  close(m[0] * 13 + m[2] * 13 + m[4], 13);
  close(m[1] * 13 + m[3] * 13 + m[5], 13);
});

test('what a frame shows of a shape: its own, the one carried to it, or where a tween puts it', () => {
  const frames = scene();
  assert.equal(shapeAt(frames, 'v:a', 0), frames[0].changes.get('v:a').cell);
  assert.equal(shapeAt(frames, 'v:a', 3).m[5], 3);
  assert.equal(shapeAt(frames, 'v:a', 7).m[5], 24);
  assert.equal(shapeAt(frames, 'v:b', 3), null);
  frames[4].kind = 'wipe';
  assert.equal(shapeAt(frames, 'v:a', 3).m[5], 0); // no tween across a Wipe: carried
  assert.equal(shapeAt(frames, 'v:a', 5), null);
});

// Parts: a key frame sets only some of a shape; the rest comes from the key frames that set it.
const K = 'v:ball', RED = rectShape(2, 2, 6, 6, { fill: '#ff0000' });
const GRADIENT = { type: 'linear', stops: [[0, '#ff0000'], [1, '#0000ff']], m: [1, 0, 0, 1, 0, 0] };
// Frames 0 to 12: the ball red on 0, moved down 12 on 6 and 24 on 12, each of those setting only its transform.
function ball(easings = {}) {
  const frames = Array.from({ length: 13 }, (_, i) => newFrame(i ? 'blank' : 'wipe'));
  frames[0].changes.set(K, cellState(RED, 0, 0));
  for (const at of [6, 12]) {
    frames[at].changes.set(K, cellState(transformed(RED, translation(0, at * 2)), 0, 0));
    frames[at].parts = new Map([[K, new Set(['transform'])]]);
  }
  for (const [at, easing] of Object.entries(easings)) frames[at].tweens = new Map([[K, easing]]);
  return frames;
}

test("a part a key frame didn't set comes from the one before that did", () => {
  const frames = ball();
  frames[0].changes.set(K, cellState(withShape(RED, { fill: GRADIENT }), 0, 0));
  for (const [at, y] of [[3, 0], [6, 12], [9, 12], [12, 24]]) {
    assert.deepEqual(shapeAt(frames, K, at).fill, frames[0].changes.get(K).cell.fill, `frame ${at}`);
    assert.equal(shapeAt(frames, K, at).m[5], y, `frame ${at}`);
  }
  assert.deepEqual([...setPartsAt(frames, K, 6)], ['transform']);
  assert.deepEqual(lifeAt(frames, K, 9), [0, 6, 12]);
});

test('a part fades between the key frames that set it, across one that did not, in step with the tweens', () => {
  const frames = ball({ 0: 'easeIn', 6: 'easeOut' });
  frames[12].changes.set(K, cellState(withShape(transformed(RED, translation(0, 24)), { fill: '#0000ff' }), 0, 0));
  frames[12].parts = new Map([[K, new Set(['transform', 'fill'])]]);
  assert.equal(shapeAt(frames, K, 6).fill, '#800080'); // half the frames, both spans tweened
  assert.equal(shapeAt(frames, K, 3).fill, tweenPart('fill', RED, frames[12].changes.get(K).cell, (6 * ease('easeIn', 0.5)) / 12).fill);
  assert.equal(shapeAt(frames, K, 6).m[5], 12);
  assert.equal(shapeAt(frames, K, 12).fill, '#0000ff');
});

test('a span with no tween holds a part, and with none at all it switches at its key frame', () => {
  const blue = (frames) => {
    frames[12].changes.set(K, cellState(withShape(transformed(RED, translation(0, 24)), { fill: '#0000ff' }), 0, 0));
    frames[12].parts = new Map([[K, new Set(['transform', 'fill'])]]);
    return frames;
  };
  const first = blue(ball({ 0: 'linear' }));
  assert.equal(shapeAt(first, K, 3).fill, '#800080');
  for (const at of [6, 9, 12]) assert.equal(shapeAt(first, K, at).fill, '#0000ff', `frame ${at}`);
  const none = blue(ball());
  for (const at of [3, 6, 11]) assert.equal(shapeAt(none, K, at).fill, '#ff0000', `frame ${at}`);
  assert.equal(shapeAt(none, K, 12).fill, '#0000ff');
});

test("a shape's first key frame, and a Duplicate, set every part", () => {
  const frames = ball();
  frames[0].changes.delete(K);
  assert.deepEqual(shapeAt(frames, K, 6), frames[6].changes.get(K).cell);
  assert.equal(setPartsAt(frames, K, 6).size, 7);
  const dup = ball();
  dup[6].kind = 'duplicate';
  dup[0].changes.set(K, cellState(withShape(RED, { fill: GRADIENT }), 0, 0));
  assert.equal(shapeAt(dup, K, 9).fill, '#ff0000'); // frame 0's fill doesn't reach past the Duplicate
  assert.equal(setPartsAt(dup, K, 6).size, 7);
});

test("a shape first on a later frame shows itself, whatever another shape's key frames do", () => {
  const frames = ball(), late = rectShape(10, 10, 14, 14, { fill: '#00ff00' });
  frames[6].changes.set('v:late', cellState(late, 0, 0));
  frames[0].changes.set(K, cellState(withShape(RED, { fill: GRADIENT }), 0, 0));
  for (const at of [6, 9, 12]) assert.deepEqual(shapeAt(frames, 'v:late', at), late, `frame ${at}`);
  assert.equal(shapeAt(frames, 'v:late', 3), null);
});

test('a change can reach back to the first key frame of a shape with tweens or parts', () => {
  const faded = ball({ 0: 'easeIn', 6: 'easeOut' });
  assert.equal(tweenReach(faded, 12), 1);
  const plain = ball();
  for (const frame of plain) frame.parts = null;
  assert.equal(tweenReach(plain, 12), 12);
});

test('every shape on a frame worked out from its parts or a tween', () => {
  const frames = ball({ 0: 'linear' });
  assert.equal(workedOutAt(frames, 3).get(K).m[5], 6);
  assert.equal(workedOutAt(frames, 9).get(K).m[5], 12);
});
