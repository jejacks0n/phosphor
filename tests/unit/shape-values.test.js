// The numbers the Keys panel shows for a shape's Transform, and what typing one does.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { rectShape, multiply, rotation, scaling, transformed, curveBounds } from '../../src/document/shapes.js';
import { transformValues, withTransformValue } from '../../src/lib/shapeValues.js';

const close = (a, b, eps = 0.06) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const style = { fill: '#ff0000', stroke: null, width: 1 };
const middle = (shape) => { const b = curveBounds(shape); return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; };

test('transformValues of a rect turned 90°, scaled 2 wide and 3 high', () => {
  const rect = rectShape(0, 0, 10, 4, style);
  assert.deepEqual(transformValues(rect), { x: 5, y: 2, turn: 0, scaleX: 100, scaleY: 100 });
  const shape = transformed(rect, multiply(rotation(Math.PI / 2, 5, 2), scaling(2, 3, 5, 2)));
  const v = transformValues(shape);
  assert.equal(v.turn, 90);
  assert.equal(v.scaleX, 200);
  assert.equal(v.scaleY, 300);
  close(v.x, 5);
  close(v.y, 2);
});

test('withTransformValue moves, turns and scales about the middle', () => {
  const rect = rectShape(2, 2, 8, 6, style);
  const [mx, my] = middle(rect);
  const moved = withTransformValue(rect, 'x', 20.5);
  assert.equal(transformValues(moved).x, 20.5);
  close(middle(moved)[1], my);
  const lower = withTransformValue(rect, 'y', 9);
  assert.equal(transformValues(lower).y, 9);
  const turned = withTransformValue(rect, 'turn', 45);
  assert.equal(transformValues(turned).turn, 45);
  close(middle(turned)[0], mx);
  close(middle(turned)[1], my);
  assert.equal(transformValues(withTransformValue(turned, 'turn', 0)).turn, 0);
  const wide = withTransformValue(rect, 'scaleX', 250), tall = withTransformValue(rect, 'scaleY', 50);
  assert.equal(transformValues(wide).scaleX, 250);
  assert.equal(transformValues(tall).scaleY, 50);
  close(middle(wide)[0], mx);
  close(middle(tall)[1], my);
});

test('Scale X on a turned shape stretches it along itself, its turn and Scale Y unchanged', () => {
  const turned = withTransformValue(rectShape(0, 0, 10, 4, style), 'turn', 30);
  const wide = withTransformValue(turned, 'scaleX', 200);
  const before = transformValues(turned), after = transformValues(wide);
  assert.equal(after.turn, before.turn);
  assert.equal(after.scaleY, before.scaleY);
  assert.equal(after.scaleX, 200);
  // Its long side doubled along the turn: the first edge's world length.
  const edge = (s) => Math.hypot(s.m[0] * 10, s.m[1] * 10);
  close(edge(wide), edge(turned) * 2, 0.01);
  close(middle(wide)[0], middle(turned)[0]);
  close(middle(wide)[1], middle(turned)[1]);
});

test('a scale of 0 is refused, and a negative Scale Y flips the shape', () => {
  const rect = rectShape(0, 0, 10, 4, style);
  assert.equal(withTransformValue(rect, 'scaleX', 0), rect);
  assert.equal(withTransformValue(rect, 'scaleY', 0), rect);
  assert.equal(withTransformValue(rect, 'scaleX', Number.NaN), rect);
  const flipped = withTransformValue(rect, 'scaleY', -100);
  assert.equal(transformValues(flipped).scaleY, -100);
  assert.equal(transformValues(withTransformValue(flipped, 'scaleY', 100)).scaleY, 100);
});
