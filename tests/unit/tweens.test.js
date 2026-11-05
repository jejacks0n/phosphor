// Tweens: a shape worked out part way between two of its versions, and the timing that eases it.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { makeShape, rectShape, rotation, transformed, translation, withShape } from '../../src/document/shapes.js';
import { EASINGS, ease, tweenShape } from '../../src/document/tweens.js';

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
