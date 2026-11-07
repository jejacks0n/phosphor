// Measuring an outline along its curves: its length, the point and direction at a share, the stretch between two shares.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { makeShape, rotation, scaling, multiply, apply, translation, KAPPA, nearestOnOutline } from '../../src/document/shapes.js';
import { measure } from '../../src/document/pathLength.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const pt = (x, y) => [x, y, 0, 0, 0, 0, 0];
const line = (x0, y0, x1, y1, extra = {}) => makeShape({ points: [pt(x0, y0), pt(x1, y1)], closed: false, ...extra });
// A quarter circle of radius 10 about the origin, from (10, 0) to (0, 10).
const quarter = (extra = {}) => makeShape({
  points: [[10, 0, 0, 0, 0, KAPPA * 10, 0], [0, 10, KAPPA * 10, 0, 0, 0, 0]], closed: false, ...extra,
});
const square = () => makeShape({ points: [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)], closed: true });

test('a straight line\'s length and points', () => {
  const s = measure(line(0, 0, 10, 0));
  close(s.length, 10);
  const mid = s.at(0.5);
  close(mid.x, 5); close(mid.y, 0); close(mid.angle, 0);
  assert.deepEqual(s.at(1.5), s.at(1));
  assert.deepEqual(s.at(-1), s.at(0));
});

test('a curve is measured along it, so equal shares are equal distances', () => {
  const s = measure(quarter());
  close(s.length, 5 * Math.PI, 0.1);
  const q = s.at(0.25);
  close(Math.hypot(q.x, q.y), 10, 0.05);
  const [a, b, c] = [s.at(0), s.at(0.5), s.at(1)];
  close(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - b.x, c.y - b.y), 0.05);
});

test('the transform counts', () => {
  close(measure(line(0, 0, 10, 0, { m: scaling(2, 2) })).length, 20);
  const turned = measure(line(0, 0, 10, 0, { m: rotation(Math.PI / 2) }));
  close(turned.at(0.5).angle, Math.PI / 2);
});

test('a closed outline includes its closing side', () => {
  const s = measure(square());
  close(s.length, 40);
  const last = s.at(0.875);
  close(last.x, 0); close(last.y, 5); close(last.angle, -Math.PI / 2);
});

test('several outlines run in order', () => {
  const s = measure(line(0, 0, 10, 0, { more: [[false, [pt(0, 5), pt(10, 5)]]] }));
  close(s.length, 20);
  close(s.at(0.75).y, 5);
  close(s.at(0.75).x, 5);
});

test('cut keeps the stretch between the shares', () => {
  const [one, ...rest] = measure(line(0, 0, 10, 0)).cut(0.25, 0.75);
  assert.equal(rest.length, 0);
  assert.equal(one.closed, false);
  assert.equal(one.points.length, 2);
  close(one.points[0][0], 2.5); close(one.points[1][0], 7.5);
  close(one.points[0][5], 0); close(one.points[0][4], 0); // a straight stretch stays straight

  const m = multiply(translation(3, 4), scaling(2, 2));
  const arc = quarter({ m }), s = measure(arc);
  const [half] = s.cut(0, 0.5);
  const end = apply(m, half.points.at(-1)[0], half.points.at(-1)[1]), want = s.at(0.5);
  close(end.x, want.x, 0.05); close(end.y, want.y, 0.05);
  const start = apply(m, half.points[0][0], half.points[0][1]);
  close(start.x, s.at(0).x); close(start.y, s.at(0).y);
  close(measure(makeShape({ points: half.points, closed: false, m })).length, s.length / 2, 0.1);
});

test('a cut across outlines gives a stretch of each', () => {
  const s = measure(line(0, 0, 10, 0, { more: [[false, [pt(0, 5), pt(10, 5)]]] }));
  const cut = s.cut(0.25, 0.75);
  assert.equal(cut.length, 2);
  close(cut[0].points[0][0], 5); close(cut[0].points[1][0], 10);
  close(cut[1].points[0][0], 0); close(cut[1].points[1][0], 5);
});

test('nothing to cut', () => {
  const s = measure(line(0, 0, 10, 0));
  assert.deepEqual(s.cut(0.6, 0.4), []);
  assert.deepEqual(s.cut(0.5, 0.5), []);
  const one = measure(makeShape({ points: [pt(3, 4)], closed: false, m: translation(1, 1) }));
  assert.equal(one.length, 0);
  assert.deepEqual(one.at(0.5), { x: 4, y: 5, angle: 0 });
  assert.deepEqual(one.cut(0, 1), []);
  assert.equal(one.shareOf(0, 0.5), 0);
});

test('an art layer measures nothing', () => {
  const s = measure(Object.freeze({ z: 0, m: translation(7, 8), art: {} }));
  assert.equal(s.length, 0);
  assert.deepEqual(s.at(0.5), { x: 7, y: 8, angle: 0 });
  assert.deepEqual(s.cut(0, 1), []);
});

test('a share of the nearest place, in nearestOnOutline\'s numbering', () => {
  close(measure(line(0, 0, 10, 0)).shareOf(0, 0.5), 0.5);
  close(measure(square()).shareOf(3, 0.5), 0.875); // the closing side
  const two = line(0, 0, 10, 0, { more: [[false, [pt(0, 5), pt(10, 5)]]] }), s = measure(two);
  close(s.shareOf(2, 0.5), 0.75);
  const n = nearestOnOutline(two, 4, 6);
  assert.equal(n.segment, 2);
  close(s.shareOf(n.segment, n.t), 0.7, 1e-3);
});

test('a share of the nearest place on a curve', () => {
  const arc = quarter(), n = nearestOnOutline(arc, 12 * Math.SQRT1_2, 12 * Math.SQRT1_2);
  close(measure(arc).shareOf(n.segment, n.t), 0.5, 0.005);
});

test('cached per record', () => {
  const s = line(0, 0, 10, 0);
  assert.equal(measure(s), measure(s));
});
