// Shapes as data: paths of points and curve handles with a fill, a stroke, a width and a transform.
import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  makeShape, sameShape, isShape, isShapeKey, newShapeKey, pathData, shapeBounds, dirtyRect, worldPoints,
  multiply, invert, apply, rotation, scaling, translation, rectShape, ellipseShape, polygonShape, splitAt, nearestOnOutline,
  moveHandle, setSmooth, deletePoint, shapeFromStranger, localBounds, curveBounds, deserializeShapes, serializeShapes, transformed, MOST_POINTS,
  outlines, withOutlines, locate, allPoints, strokeOf, STROKE_DEFAULTS, withShape, movePoint, joined, separated,
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
  const free = makeShape({ points: [[5, 5, -2, 0, 3, 0, 0], [10, 10, 0, 0, 0, 0, 0]], closed: false }); // handles not in line
  assert.deepEqual(moveHandle(free, 0, 'out', 5, 9).points[0].slice(2, 4), [-2, 0]);
});

// Alt-dragging a handle: it moves on its own, and the point's handles are free of each other from then on.
test('moveHandle alone breaks a smooth point\'s handle from its partner', () => {
  const smooth = makeShape({ points: [[5, 5, -2, 0, 3, 0, 1], [10, 10, 0, 0, 0, 0, 0]], closed: false });
  const broken = moveHandle(smooth, 0, 'out', 5, 9, { alone: true }).points[0];
  assert.deepEqual(broken, [5, 5, -2, 0, 0, 4, 0]);
});

test('setSmooth lines a corner point\'s handles up, or makes them when it has none', () => {
  const s = makeShape({ points: [[0, 0, 0, 0, 0, 0, 0], [6, 0, 0, 0, 0, 0, 0], [6, 6, 0, 0, 0, 0, 0]], closed: false });
  const smooth = setSmooth(s, 1, true).points[1];
  assert.equal(smooth[6], 1);
  // in and out point in opposite directions
  close(smooth[2] * smooth[5] - smooth[3] * smooth[4], 0, 0.05);
  assert.ok(smooth[2] * smooth[4] + smooth[3] * smooth[5] < 0);
});

test('setSmooth off makes the point a sharp corner: its handles go, and Smooth gives it some again', () => {
  const s = makeShape({ points: [[0, 0, 0, 0, 0, 0, 0], [6, 0, -2, 0, 2, 0, 1], [6, 6, 0, 0, 0, 0, 0]], closed: false });
  const corner = setSmooth(s, 1, false).points[1];
  assert.deepEqual(corner, [6, 0, 0, 0, 0, 0, 0]);
  assert.equal(setSmooth(setSmooth(s, 1, false), 1, true).points[1][6], 1);
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
  bad({ points: [] });
  bad({ points: ['nope', [0, 0, 0, 0, 0, 0, 0]] });
  bad({ m: [0, 0, 0, 0, 0, 0] });
  bad({ width: 65 });
  bad({ fill: 'red' });
  bad({ closed: 'yes' });
  bad({ z: 1.5 });
  assert.equal(shapeFromStranger(null), null);
});

// The Pen's shape has one point after its first click, and goes out to a room as it is.
test('shapeFromStranger takes a shape of one point, as the Pen starts one', () => {
  const pen = makeShape({ points: [[3, 4, 0, 0, 0, 0, 0]], closed: false, stroke: '#ffffff' });
  assert.ok(sameShape(shapeFromStranger(JSON.parse(JSON.stringify(pen))), pen));
});

// Turned half round about its middle at the foot of a document 10,000 grid pixels tall, a shape's transform
// moves it 18,000 down; scaled about the same point, further.
test('shapeFromStranger takes the transforms the tools make anywhere on the largest grid', () => {
  const low = rectShape(100, 8990, 120, 9010, { fill: '#ff0000' });
  const turned = transformed(low, rotation(Math.PI, 110, 9000));
  assert.ok(sameShape(shapeFromStranger(JSON.parse(JSON.stringify(turned))), turned));
  const grown = transformed(low, scaling(3, 3, 110, 9000));
  assert.ok(sameShape(shapeFromStranger(JSON.parse(JSON.stringify(grown))), grown));
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

// A curve's handles reach past it: the box goes round the curve, not them. Here both handles pull up 10, and the
// curve between them rises only three quarters of that.
test('localBounds goes round the curve itself, not its handles', () => {
  const arch = makeShape({ points: [[0, 0, 0, 0, 0, -10, 0], [10, 0, 0, -10, 0, 0, 0]], closed: false });
  const { x0, y0, x1, y1 } = localBounds(arch);
  close(y0, -7.5);
  assert.deepEqual([x0, x1, y1], [0, 10, 0]);
  const loop = makeShape({ points: [[0, 0, 0, -10, 0, 0, 0], [10, 0, 0, 0, 0, -10, 0]], closed: true }); // a line there, the arch closing it
  close(localBounds(loop).y0, -7.5);
  assert.equal(localBounds(rectShape(1, 2, 5, 9)).x1, 5);
  const moved = curveBounds(transformed(arch, translation(5, 5))); // several shapes' box: in grid pixels
  close(moved.y0, -2.5);
  assert.deepEqual([moved.x0, moved.x1, moved.y1], [5, 15, 5]);
  assert.deepEqual(localBounds(makeShape({ points: [[3, 4, 0, 0, 0, 0, 0]], closed: false })), { x0: 3, y0: 4, x1: 3, y1: 4 });
});

// A ring: an outer square 0..10 and an inner one 3..7 (wound the other way), filled evenodd.
const sq = (a, b, reverse = false) => {
  const pts = [[a, a, 0, 0, 0, 0, 0], [b, a, 0, 0, 0, 0, 0], [b, b, 0, 0, 0, 0, 0], [a, b, 0, 0, 0, 0, 0]];
  return reverse ? pts.reverse() : pts;
};
const ring = () => makeShape({ points: sq(0, 10), closed: true, more: [[true, sq(3, 7)]], rule: 'evenodd', fill: '#ff0000' });

test('a shape that uses nothing new keeps exactly today\'s JSON', () => {
  const s = makeShape({ points: [[1, 2, 0, 0, 0, 0, 0], [5, 6, 0, 0, 0, 0, 0]], closed: false, stroke: '#00ff00', width: 2 });
  assert.equal(JSON.stringify(s), '{"z":0,"closed":false,"points":[[1,2,0,0,0,0,0],[5,6,0,0,0,0,0]],"fill":null,"stroke":"#00ff00","width":2,"m":[1,0,0,1,0,0]}');
  const defaults = withShape(s, { cap: 'round', join: 'round', miter: 4, rule: 'nonzero', more: [] });
  assert.equal(JSON.stringify(defaults), JSON.stringify(s));
  const butt = withShape(s, { cap: 'butt' });
  assert.equal(butt.cap, 'butt');
  assert.deepEqual(Object.keys(butt), ['z', 'closed', 'points', 'fill', 'stroke', 'width', 'm', 'cap']);
  assert.deepEqual(strokeOf(s), STROKE_DEFAULTS);
  assert.deepEqual(strokeOf(withShape(s, { join: 'miter', miter: 10 })), { rule: 'nonzero', cap: 'round', join: 'miter', miter: 10 });
});

test('shapeFromStranger takes the new fields and refuses bad ones', () => {
  const plain = JSON.parse(JSON.stringify(makeShape({ points: sq(0, 4), closed: true, fill: '#ff0000' })));
  const good = [
    { ...plain, more: [[true, sq(1, 2)]] }, { ...plain, rule: 'evenodd' }, { ...plain, cap: 'square' },
    { ...plain, join: 'bevel' }, { ...plain, miter: 10 }, { ...plain, cap: 'butt', join: 'miter', miter: 1.5 },
  ];
  for (const v of good) {
    const s = shapeFromStranger(v);
    assert.ok(s, JSON.stringify(v));
    assert.ok(sameShape(s, v), JSON.stringify(v));
  }
  const bad = [
    { ...plain, cap: 'flat' }, { ...plain, miter: 0 }, { ...plain, miter: 1000 }, { ...plain, rule: 'winding' },
    { ...plain, more: [[true, []]] }, { ...plain, more: [[1, sq(1, 2)]] }, { ...plain, more: [] }, { ...plain, cap: 'round' },
    { ...plain, extra: 1 },
    { ...plain, points: Array.from({ length: 300 }, (_, i) => [i, 0, 0, 0, 0, 0, 0]), more: [[false, Array.from({ length: 201 }, (_, i) => [i, 1, 0, 0, 0, 0, 0])]] },
  ];
  for (const v of bad) assert.equal(shapeFromStranger(v), null, JSON.stringify(v).slice(0, 80));
});

test('outlines, locate and allPoints read a shape of several outlines flat', () => {
  const r = ring();
  assert.equal(outlines(r).length, 2);
  assert.deepEqual(outlines(r)[1], { closed: true, points: r.more[0][1] });
  assert.deepEqual(locate(r, 5), { o: 1, j: 1 });
  assert.deepEqual(locate(r, 3), { o: 0, j: 3 });
  assert.equal(allPoints(r).length, 8);
  assert.equal(worldPoints(r).length, 8);
  const back = withOutlines(r, outlines(r));
  assert.ok(sameShape(back, r));
  assert.equal(withOutlines(r, outlines(r).slice(0, 1)).more, undefined);
  assert.equal(withOutlines(r, []), null);
});

test('pathData draws every outline, each closed on itself', () => {
  const d = pathData(ring());
  assert.equal(d.match(/M/g).length, 2);
  assert.equal(d.match(/Z/g).length, 2);
  assert.match(d, /^M0 0L10 0L10 10L0 10ZM3 3L7 3L7 7L3 7Z$/);
});

test('editing a ring by flat index stays inside each outline', () => {
  const r = ring();
  const moved = movePoint(r, 5, 1, 0);
  assert.deepEqual(moved.more[0][1][1].slice(0, 2), [8, 3]);
  assert.deepEqual(moved.points, r.points);
  const smooth = setSmooth(r, 4, true); // inner point 0 (3, 3): its neighbors are inner 3 (3, 7) and inner 1 (7, 3)
  const p = smooth.more[0][1][0];
  close(p[4] / Math.hypot(p[4], p[5]), Math.SQRT1_2, 1e-2); // along (7,3) - (3,7): right and up
  close(p[5] / Math.hypot(p[4], p[5]), -Math.SQRT1_2, 1e-2);
  const split = splitAt(r, 7, 0.5); // inner point 3 (3, 7) back to inner point 0 (3, 3)
  assert.equal(split.more[0][1].length, 5);
  assert.deepEqual(split.more[0][1][4].slice(0, 2), [3, 5]);
  assert.equal(split.points.length, 4);
  const near = nearestOnOutline(r, 5, 3.1);
  assert.equal(near.segment, 4);
  close(near.distance, 0.1, 1e-3);
  const handle = moveHandle(setSmooth(r, 6, true), 6, 'out', 8, 8);
  assert.deepEqual(handle.points, r.points);
});

test('deleting points takes an outline away before the shape', () => {
  const s = makeShape({ points: sq(0, 10), closed: true, more: [[false, [[1, 1, 0, 0, 0, 0, 0], [2, 2, 0, 0, 0, 0, 0]]]] });
  const fewer = deletePoint(s, 5);
  assert.equal(fewer.more, undefined);
  assert.equal(fewer.points.length, 4);
  const outerFirst = deletePoint(makeShape({ points: sq(0, 10).slice(0, 2), closed: false, more: [[true, sq(3, 7)]] }), 0);
  assert.deepEqual(outlines(outerFirst).map((o) => o.points.length), [4]);
  assert.equal(deletePoint(makeShape({ points: sq(0, 10).slice(0, 2), closed: false }), 0), null);
  assert.equal(deletePoint(ring(), 5).more[0][1].length, 3);
});

test('curveBounds and localBounds cover every outline', () => {
  const s = makeShape({ points: sq(0, 4), closed: true, more: [[true, sq(10, 12)]] });
  assert.deepEqual(localBounds(s), { x0: 0, y0: 0, x1: 12, y1: 12 });
  assert.deepEqual(curveBounds(transformed(s, translation(1, 2))), { x0: 1, y0: 2, x1: 13, y1: 14 });
});

test('shapeBounds pads for miters and square caps', () => {
  const line = makeShape({ points: [[0, 0, 0, 0, 0, 0, 0], [10, 0, 0, 0, 0, 0, 0]], closed: false, stroke: '#ff0000', width: 4 });
  assert.equal(shapeBounds(line).x, -2);
  close(shapeBounds(withShape(line, { cap: 'square' })).x, -2 * Math.SQRT2, 1e-9);
  assert.equal(shapeBounds(withShape(line, { join: 'miter', miter: 10 })).x, -20);
  assert.equal(shapeBounds(withShape(line, { join: 'miter' })).x, -8); // the default limit, 4
  assert.equal(shapeBounds(withShape(line, { stroke: null })).x, 0);
});

test('joined carries outlines into the bottom shape\'s space and makes holes, and separated takes them apart', () => {
  const big = makeShape({ points: sq(0, 20), closed: true, fill: '#ff0000', stroke: '#00ff00', width: 2, cap: 'butt', m: [2, 0, 0, 1, 5, 5] });
  const small = transformed(makeShape({ points: [[6, 6, 0, 0, 2, 0, 1], [12, 6, -2, 0, 0, 0, 1], [12, 12, 0, 0, 0, 0, 0]], closed: true, fill: '#0000ff' }), rotation(0.4, 9, 9));
  const ring = joined(big, [small]);
  assert.equal(ring.rule, 'evenodd');
  assert.equal(ring.fill, '#ff0000');
  assert.equal(ring.cap, 'butt');
  assert.deepEqual(ring.m, big.m);
  assert.equal(outlines(ring).length, 2);
  const want = worldPoints(small), got = worldPoints(ring).slice(4);
  want.forEach((p, i) => {
    close(got[i].x, p.x, 0.02); close(got[i].y, p.y, 0.02);
    for (const h of ['in', 'out']) {
      assert.equal(!!got[i][h], !!p[h]);
      if (p[h]) { close(got[i][h].x, p[h].x, 0.02); close(got[i][h].y, p[h].y, 0.02); }
    }
  });
  const [a, b] = separated(ring);
  assert.equal(a.more, undefined);
  assert.equal(a.rule, undefined);
  assert.equal(b.fill, '#ff0000');
  assert.deepEqual(worldPoints(a), worldPoints(big));
  worldPoints(b).forEach((p, i) => { close(p.x, want[i].x, 0.02); close(p.y, want[i].y, 0.02); });
  const many = makeShape({ points: Array.from({ length: 300 }, (_, i) => [i, 0, 0, 0, 0, 0, 0]), closed: false });
  assert.equal(joined(many, [many]), null); // past the points a shape may have
});
