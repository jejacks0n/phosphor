// Placing followers on their paths, and dropping guides from what's drawn.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { apply, localBounds, makeShape, rotation } from '../../src/document/shapes.js';
import { makeArt } from '../../src/document/artLayers.js';
import { placeFollowers, shownShapes } from '../../src/document/followers.js';

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const pt = (x, y) => [x, y, 0, 0, 0, 0, 0];
const line = (x0, y0, x1, y1, extra = {}) => makeShape({ points: [pt(x0, y0), pt(x1, y1)], closed: false, ...extra });
// A 2 by 2 square, its middle at (cx, cy).
const square = (cx = 50, cy = 50, extra = {}) => makeShape({ points: [pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1)], closed: true, m: [1, 0, 0, 1, cx, cy], ...extra });
const ring = () => makeShape({ points: [pt(0, 0), pt(10, 0), pt(10, 10), pt(0, 10)], closed: true }); // 40 long
const center = (shape) => { const b = localBounds(shape); return apply(shape.m, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); };
const placed = (shapes, key = 'v:f') => placeFollowers(new Map(shapes)).get(key);
const at = (shape, x, y) => { const c = center(shape); close(c.x, x); close(c.y, y); };

test('a square riding a 20-long line at along 0.5 has its middle at (10, 0)', () => {
  at(placed([['v:p', line(0, 0, 20, 0)], ['v:f', square(50, 50, { follow: { key: 'v:p' }, along: 0.5 })]]), 10, 0);
});

test('riding the path\'s End puts it where the End is', () => {
  at(placed([['v:p', line(0, 0, 20, 0, { end: 0.25 })], ['v:f', square(50, 50, { follow: { key: 'v:p', ride: 'end' }, along: 0.9 })]]), 5, 0);
});

test('riding the path\'s Start puts it where the Start is', () => {
  at(placed([['v:p', line(0, 0, 20, 0, { start: 0.75 })], ['v:f', square(50, 50, { follow: { key: 'v:p', ride: 'start' } })]]), 15, 0);
});

test('Face the path turns it to a vertical path, on top of its own turn', () => {
  const own = makeShape({ ...square(50, 50), m: rotation(Math.PI / 6, 50, 50) });
  const f = makeShape({ ...own, follow: { key: 'v:p', face: true }, along: 0.5 });
  const shape = placed([['v:p', line(0, 0, 0, 20)], ['v:f', f]]);
  at(shape, 0, 10);
  close(Math.atan2(shape.m[1], shape.m[0]), Math.PI / 2 + Math.PI / 6);
  const still = placed([['v:p', line(0, 0, 0, 20)], ['v:f', makeShape({ ...f, follow: { key: 'v:p' } })]]);
  close(Math.atan2(still.m[1], still.m[0]), Math.PI / 6); // without it, its own turn alone
});

test('a closed path wraps past 100%, an open one holds at its end', () => {
  const on = (path, along) => placed([['v:p', path], ['v:f', square(50, 50, { follow: { key: 'v:p' } })]].map(([k, s]) => [k, k === 'v:f' ? { ...s, along } : s]));
  const wrapped = on(ring(), 1.25), quarter = on(ring(), 0.25);
  at(wrapped, center(quarter).x, center(quarter).y);
  at(wrapped, 10, 0);
  at(on(line(0, 0, 20, 0), 1.25), 20, 0);
  at(on(line(0, 0, 20, 0), -0.5), 0, 0);
  at(on(ring(), -0.25), 0, 10);
});

test('a follower is left as it is with no path to follow', () => {
  const f = square(50, 50, { follow: { key: 'v:p' }, along: 0.5 });
  assert.equal(placed([['v:f', f]]), f); // missing
  const art = makeArt({ m: [1, 0, 0, 1, 0, 0], art: { cols: 2, rows: 1, cells: [[0, 'A', '#ffffff', null]] } });
  assert.equal(placed([['v:p', art], ['v:f', f]]), f); // an art layer has no outline
  const chained = line(0, 0, 20, 0, { follow: { key: 'v:q' } });
  assert.equal(placed([['v:q', line(0, 0, 0, 20)], ['v:p', chained], ['v:f', f]]), f); // no chains
});

test('an art layer follows on whole cells', () => {
  const art = makeArt({ m: [1, 0, 0, 1, 40, 40], art: { cols: 2, rows: 1, cells: [[0, 'A', '#ffffff', null]] }, follow: { key: 'v:p' }, along: 0.5 });
  const shape = placed([['v:p', line(0, 0, 20.6, 3.2)], ['v:f', art]]);
  // the path's middle is (10.3, 1.6), so its corner is at (9.3, 0.6), then on whole cells
  assert.ok(Number.isInteger(shape.m[4]) && shape.m[5] % 2 === 0, `${shape.m}`);
  assert.deepEqual([shape.m[4], shape.m[5]], [9, 0]);
});

test('By whole cells snaps the middle to a whole cell', () => {
  const shape = placed([['v:p', line(0, 0, 20.6, 3.2)], ['v:f', square(50, 50, { follow: { key: 'v:p', motion: 'cells' }, along: 0.5 })]]);
  at(shape, 10, 2);
  const half = placed([['v:p', line(0, 0, 20.6, 3.2)], ['v:f', square(50, 50, { follow: { key: 'v:p', motion: 'half' }, along: 0.5 })]]);
  at(half, 10.5, 2);
});

test('a one-point path places it at the point', () => {
  const shape = placed([['v:p', makeShape({ points: [pt(7, 4)], closed: false })], ['v:f', square(50, 50, { follow: { key: 'v:p', face: true }, along: 0.5 })]]);
  assert.ok(shape.m.every(Number.isFinite), `${shape.m}`);
  at(shape, 7, 4);
});

test('the same records place as the same object', () => {
  const p = line(0, 0, 20, 0), f = square(50, 50, { follow: { key: 'v:p' }, along: 0.5 });
  assert.equal(placed([['v:p', p], ['v:f', f]]), placed([['v:p', p], ['v:f', f]]));
  assert.notEqual(placed([['v:p', p], ['v:f', f]]), placed([['v:p', line(0, 0, 30, 0)], ['v:f', f]]));
});

test('the same Map when nothing follows', () => {
  const shapes = new Map([['v:a', line(0, 0, 20, 0)], ['v:b', square()]]);
  assert.equal(placeFollowers(shapes), shapes);
  assert.equal(shownShapes(shapes), shapes);
});

test('shownShapes drops a guide and keeps its follower placed on it', () => {
  const shapes = new Map([['v:p', line(0, 0, 20, 0, { guide: true })], ['v:f', square(50, 50, { follow: { key: 'v:p' }, along: 0.5 })]]);
  const shown = shownShapes(shapes);
  assert.deepEqual([...shown.keys()], ['v:f']);
  at(shown.get('v:f'), 10, 0);
  assert.ok(placeFollowers(shapes).has('v:p')); // placed keeps it
});
