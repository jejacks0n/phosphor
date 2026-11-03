// Shapes as data: paths of points and curve handles with a fill, a stroke, a width and a transform.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  makeShape, sameShape, isShape, isShapeKey, newShapeKey, pathData, shapeBounds, dirtyRect, worldPoints,
  multiply, invert, apply, rotation, translation, rectShape, ellipseShape, polygonShape, splitAt, nearestOnOutline,
  moveHandle, setSmooth, deletePoint, shapeFromStranger, deserializeShapes, serializeShapes, transformed, MOST_POINTS,
} from '../../src/document/shapes.js';
import { changeBytes } from '../../src/document/changes.js';
import { MOST_CHANGE_BYTES } from '../../src/social/wire.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

// The cubic of segment i at t, in world grid pixels.
function sample(shape, i, t) {
  const w = worldPoints(shape), a = w[i], b = w[(i + 1) % w.length];
  const p1 = a.out ?? a, p2 = b.in ?? b, u = 1 - t;
  return {
    x: u ** 3 * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * b.x,
    y: u ** 3 * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * b.y,
  };
}

test('makeShape rounds and freezes, and a JSON round trip is the same shape', () => {
  const s = makeShape({ points: [[1.23456, 2, 0, 0, 0.333333, 0, 1], [5, 6, 0, 0, 0, 0, 0]], closed: false, fill: '#ff0000', m: [1, 0, 0, 1, 0.123456789, 0] });
  assert.ok(Object.isFrozen(s));
  assert.equal(s.points[0][0], 1.23);
  assert.equal(s.points[0][4], 0.33);
  assert.equal(s.m[4], 0.1235);
  assert.ok(sameShape(s, JSON.parse(JSON.stringify(s))));
  assert.ok(isShape(s));
  assert.ok(!isShape({ char: 'a' }));
});

test('shape keys are v: and an id', () => {
  const key = newShapeKey();
  assert.ok(isShapeKey(key));
  assert.ok(/^v:[A-Za-z0-9_-]{1,32}$/.test(key));
  assert.ok(!isShapeKey('3,4'));
});

test('pathData draws corners as lines and handled segments as curves, closed with Z', () => {
  assert.equal(pathData(rectShape(0, 0, 4, 2)), 'M0 0L4 0L4 2L0 2Z');
  const curve = makeShape({ points: [[0, 0, 0, 0, 2, 0, 0], [4, 4, 0, -2, 0, 0, 0]], closed: false });
  assert.equal(pathData(curve), 'M0 0C2 0 4 2 4 4');
  assert.equal(pathData(rectShape(0, 0, 4, 2), 2, 3), 'M0 0L8 0L8 6L0 6Z');
});

test('shapeBounds pads a stroke by half its width, and dirtyRect is whole cells', () => {
  assert.deepEqual(shapeBounds(rectShape(1, 1, 3, 3, { stroke: '#ffffff', width: 2 })), { x: 0, y: 0, w: 4, h: 4 });
  assert.deepEqual(shapeBounds(rectShape(1, 1, 3, 3, { fill: '#ffffff' })), { x: 1, y: 1, w: 2, h: 2 });
  assert.deepEqual(dirtyRect({ x: 0.5, y: 1.2, w: 1, h: 1 }), { x: -1, y: 0, w: 4, h: 4 });
  assert.deepEqual(dirtyRect({ x: 0, y: 0, w: 1, h: 1 }, { x: 10, y: 10, w: 1, h: 1 }), { x: -1, y: -2, w: 13, h: 14 });
});

test('a rotation about the center keeps the center, and invert undoes a matrix', () => {
  const r = rotation(Math.PI / 3, 5, 7);
  const c = apply(r, 5, 7);
  close(c.x, 5);
  close(c.y, 7);
  const m = multiply(translation(3, -2), r);
  const p = apply(multiply(invert(m), m), 11, 13);
  close(p.x, 11);
  close(p.y, 13);
});

test('ellipseShape passes through the box edge midpoints, and polygonShape has its corners with the first at the top', () => {
  const e = ellipseShape(0, 0, 10, 6);
  const w = worldPoints(e).map(({ x, y }) => [x, y]);
  assert.deepEqual(w, [[5, 0], [10, 3], [5, 6], [0, 3]]);
  assert.ok(e.closed && e.points.every((p) => p[6] === 1));
  const p = polygonShape(0, 0, 10, 10, 5);
  assert.equal(p.points.length, 5);
  close(worldPoints(p)[0].x, 5, 0.01);
  close(worldPoints(p)[0].y, 0, 0.01);
});

test('splitAt leaves the curve where it was', () => {
  const s = makeShape({ points: [[0, 0, 0, 0, 4, 0, 0], [10, 10, 0, -6, 0, 0, 0], [0, 10, 0, 0, 0, 0, 0]], closed: true });
  const split = splitAt(s, 0, 0.4);
  assert.equal(split.points.length, 4);
  for (let k = 0; k <= 20; k++) {
    const t = k / 20, before = sample(s, 0, t);
    const after = t <= 0.4 ? sample(split, 0, t / 0.4) : sample(split, 1, (t - 0.4) / 0.6);
    close(after.x, before.x, 0.02); // the new point's numbers are rounded to 1/100
    close(after.y, before.y, 0.02);
  }
  const near = nearestOnOutline(s, 5, 2.6);
  assert.equal(near.segment, 0);
  assert.ok(near.distance < 1);
});

test('moveHandle on a smooth point keeps the other handle in line and its length; on a corner it stays put', () => {
  const smooth = makeShape({ points: [[5, 5, -2, 0, 3, 0, 1], [10, 10, 0, 0, 0, 0, 0]], closed: false });
  const moved = moveHandle(smooth, 0, 'out', 5, 9); // out handle now straight down, 4 long
  const [x, y, ix, iy, ox, oy] = moved.points[0];
  assert.deepEqual([x, y, ox, oy], [5, 5, 0, 4]);
  close(ix, 0, 0.01);
  close(iy, -2, 0.01); // in line, opposite, its own length
  const corner = moveHandle(withSmooth(smooth, 0), 0, 'out', 5, 9);
  assert.deepEqual(corner.points[0].slice(2, 4), [-2, 0]);
});
const withSmooth = (shape, i) => setSmooth(shape, i, false);

test('setSmooth lines a corner point\'s handles up, or makes them when it has none', () => {
  const s = makeShape({ points: [[0, 0, 0, 0, 0, 0, 0], [6, 0, 0, 0, 0, 0, 0], [6, 6, 0, 0, 0, 0, 0]], closed: false });
  const smooth = setSmooth(s, 1, true).points[1];
  assert.equal(smooth[6], 1);
  // in and out point in opposite directions
  close(smooth[2] * smooth[5] - smooth[3] * smooth[4], 0, 0.05);
  assert.ok(smooth[2] * smooth[4] + smooth[3] * smooth[5] < 0);
});

test('deletePoint below two points is null', () => {
  const s = makeShape({ points: [[0, 0, 0, 0, 0, 0, 0], [6, 0, 0, 0, 0, 0, 0]], closed: false });
  assert.equal(deletePoint(s, 0), null);
  assert.equal(deletePoint(rectShape(0, 0, 4, 4), 0).points.length, 3);
});

test('transformed moves a shape by a matrix before its own', () => {
  const s = transformed(rectShape(0, 0, 2, 2), translation(5, 1));
  assert.deepEqual(worldPoints(s)[0], { x: 5, y: 1, in: null, out: null });
});

test('shapeFromStranger refuses what a shape can\'t be', () => {
  const good = rectShape(0, 0, 4, 4, { fill: '#ff0000', stroke: '#00ff00', width: 2 });
  const copy = shapeFromStranger(JSON.parse(JSON.stringify(good)));
  assert.ok(Object.isFrozen(copy) && sameShape(copy, good));
  const bad = (changes) => assert.equal(shapeFromStranger({ ...JSON.parse(JSON.stringify(good)), ...changes }), null, JSON.stringify(changes).slice(0, 80));
  bad({ extra: 1 });
  bad({ points: Array.from({ length: MOST_POINTS + 1 }, (_, i) => [i, 0, 0, 0, 0, 0, 0]) });
  bad({ points: [[20001, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0]] });
  bad({ points: [[0, 0, 0, 0, 0, 0, 0]] });
  bad({ points: ['nope', [0, 0, 0, 0, 0, 0, 0]] });
  bad({ m: [0, 0, 0, 0, 0, 0] });
  bad({ width: 65 });
  bad({ fill: 'red' });
  bad({ closed: 'yes' });
  bad({ z: 1.5 });
  assert.equal(shapeFromStranger(null), null);
});

test('deserializeShapes refuses more than MOST_SHAPES and bad keys', () => {
  const s = rectShape(0, 0, 1, 1);
  assert.equal(deserializeShapes([['v:', s]]), null);
  assert.equal(deserializeShapes([['v:a b', s]]), null);
  assert.equal(deserializeShapes(Array.from({ length: 1001 }, (_, i) => [`v:k${i}`, s])), null);
  const map = deserializeShapes(serializeShapes(new Map([['v:abc', s]])));
  assert.ok(sameShape(map.get('v:abc'), s));
  assert.equal(deserializeShapes(undefined).size, 0);
});

test('the biggest legal shape fits in one room message', () => {
  const v = -19999.99;
  const biggest = makeShape({ points: Array.from({ length: MOST_POINTS }, () => [v, v, v, v, v, v, 1]), closed: true, fill: '#ffffff', stroke: '#ffffff', width: 63.99, z: -999999, m: [-9999.9999, -9999.9999, -9999.9999, 9999.9999, -9999.9999, -9999.9999] });
  assert.ok(shapeFromStranger(JSON.parse(JSON.stringify(biggest))));
  assert.ok(changeBytes({ cells: [[`v:${'k'.repeat(32)}`, biggest]], runs: [] }) < MOST_CHANGE_BYTES);
});
