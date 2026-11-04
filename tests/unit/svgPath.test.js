// SVG path data read into outlines (points as shapes have them: [x, y, inX, inY, outX, outY, smooth]).
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePathData, arcToCubics } from '../../src/lib/svgPath.js';

const xy = (outlines) => outlines.map(({ closed, points }) => ({ closed, points: points.map(([x, y]) => [x, y]) }));
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);
// A cubic's point at t.
const at = (p0, c1, c2, p3, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p3[k]);
};

test('every command, absolute and relative, gives the same outline', () => {
  const square = [{ closed: true, points: [[10, 10], [20, 10], [20, 20]] }];
  assert.deepEqual(xy(parsePathData('M10 10 L20 10 L20 20 Z')), square);
  assert.deepEqual(xy(parsePathData('m10 10 l10 0 l0 10 z')), square);
  assert.deepEqual(xy(parsePathData('M10 10 H20 V20 Z')), square);
  assert.deepEqual(xy(parsePathData('M10 10 h10 v10 z')), square);
  // A last point back on the first one is the first one.
  assert.deepEqual(xy(parsePathData('M10 10 L20 10 L20 20 L10 10 Z')), square);
  // Lines after M's first pair; m's are relative.
  assert.deepEqual(xy(parsePathData('M10 10 20 10 20 20z')), square);
  assert.deepEqual(xy(parsePathData('m10 10 10 0 0 10z')), square);
  const [{ points }] = parsePathData('M0 0 C10 0 20 10 20 20');
  assert.deepEqual(points, [[0, 0, 0, 0, 10, 0, 0], [20, 20, 0, -10, 0, 0, 0]]);
  assert.deepEqual(parsePathData('m0 0 c10 0 20 10 20 20')[0].points, points);
});

test('S and T reflect the previous handle', () => {
  const [{ points }] = parsePathData('M0 0 C0 10 10 10 10 0 S20 -10 20 0');
  // The S's first handle is the C's second reflected about (10, 0): (10, -10); the point is smooth.
  assert.deepEqual(points[1], [10, 0, 0, 10, 0, -10, 1]);
  assert.deepEqual(points[2], [20, 0, 0, -10, 0, 0, 0]);
  // S after a line: its first handle is the point itself.
  assert.deepEqual(parsePathData('M0 0 L10 0 S20 10 20 0')[0].points[1], [10, 0, 0, 0, 0, 0, 0]);
  // T reflects the quadratic's control: Q0 0 → control (5, 10), T's is (15, -10).
  const [{ points: q }] = parsePathData('M0 0 Q5 10 10 0 T20 0');
  const twoThirds = (a, b) => a + (2 / 3) * (b - a);
  close(q[1][4], twoThirds(10, 15) - 10);
  close(q[1][5], twoThirds(0, -10));
  close(q[2][2], twoThirds(20, 15) - 20);
  close(q[2][3], twoThirds(0, -10));
  assert.equal(q[1][6], 1);
});

test('a quadratic becomes the exact cubic', () => {
  const [{ points }] = parsePathData('M0 0 Q30 60 60 0');
  // Handles two thirds of the way to the control point.
  assert.deepEqual(points[0].slice(4, 6).map((v) => Math.round(v * 1e9) / 1e9), [20, 40]);
  assert.deepEqual(points[1].slice(2, 4).map((v) => Math.round(v * 1e9) / 1e9), [-20, 40]);
  // The cubic's middle is the quadratic's: (30, 30).
  const p = at([0, 0], [20, 40], [40, 40], [60, 0], 0.5);
  close(p[0], 30);
  close(p[1], 30);
});

test('an arc of a circle stays on the circle', () => {
  // The rose's inner curl: from (532, 330), a half circle of radius 32 about (500, 330).
  for (const [large, sweep, cy] of [[0, 0, 330], [1, 0, 330], [0, 1, 330], [1, 1, 330]]) {
    const pieces = arcToCubics(532, 330, 32, 32, 0, large, sweep, 468, 330);
    assert.ok(pieces.length >= 2 && pieces.length <= 4);
    let from = [532, 330];
    for (const [c1x, c1y, c2x, c2y, x, y] of pieces) {
      for (let t = 0; t <= 1; t += 0.125) {
        const p = at(from, [c1x, c1y], [c2x, c2y], [x, y], t);
        close(Math.hypot(p[0] - 500, p[1] - cy), 32, 0.05);
      }
      from = [x, y];
    }
    close(from[0], 468);
    close(from[1], 330);
  }
  // Sweep 0 goes the negative-angle way: from (532, 330) up through y < 330 (y down).
  const up = arcToCubics(532, 330, 32, 32, 0, 0, 0, 468, 330);
  assert.ok(up[0][5] < 330);
  const down = arcToCubics(532, 330, 32, 32, 0, 0, 1, 468, 330);
  assert.ok(down[0][5] > 330);
  // A quarter: small arc of a radius-10 circle, from (10, 0) to (0, 10); large flag takes the long way round.
  const small = arcToCubics(10, 0, 10, 10, 0, 0, 1, 0, 10);
  assert.equal(small.length, 1);
  const large = arcToCubics(10, 0, 10, 10, 0, 1, 1, 0, 10);
  assert.equal(large.length, 3);
  // The centers differ: the small sweep-1 arc is about (0, 0); the large one about (10, 10).
  const mid = at([10, 0], small[0].slice(0, 2), small[0].slice(2, 4), [0, 10], 0.5);
  close(Math.hypot(mid[0], mid[1]), 10, 0.05);
});

test('radii too small for the endpoints are scaled up, and zero radii are a line', () => {
  const pieces = arcToCubics(0, 0, 1, 1, 0, 0, 1, 20, 0);
  const [, , , , x, y] = pieces.at(-1);
  close(x, 20);
  close(y, 0);
  const p = at([0, 0], pieces[0].slice(0, 2), pieces[0].slice(2, 4), pieces[0].slice(4, 6), 0.5);
  close(Math.hypot(p[0] - 10, p[1]), 10, 0.05);
  assert.deepEqual(xy(parsePathData('M0 0 A0 5 0 0 1 20 0')), [{ closed: false, points: [[0, 0], [20, 0]] }]);
  assert.deepEqual(arcToCubics(5, 5, 10, 10, 0, 0, 1, 5, 5), []);
});

test('an arc in path data is its pieces, the in-between points smooth', () => {
  const [{ points }] = parsePathData('M532,330 A32,32 0 0 0 468,330');
  assert.deepEqual([points[0][0], points[0][1]], [532, 330]);
  assert.deepEqual([points.at(-1)[0], points.at(-1)[1]].map(Math.round), [468, 330]);
  assert.ok(points.length >= 3);
  for (const p of points.slice(1, -1)) assert.equal(p[6], 1);
  // Relative, with the flags run together as minified files have them.
  const [{ points: rel }] = parsePathData('m532,330a32,32 0 00-64,0');
  assert.deepEqual(rel.map((p) => p.map((v) => Math.round(v * 1e6))), points.map((p) => p.map((v) => Math.round(v * 1e6))));
});

test('several subpaths are several outlines, and Z closes each', () => {
  const svg = readFileSync(new URL('../fixtures/svg/belle-verriere-logo.svg', import.meta.url), 'utf8');
  const e = [...svg.matchAll(/ d="([^"]*)"/g)].map((m) => m[1])[10]; // the "e"
  const outlines = parsePathData(e);
  assert.equal(outlines.length, 2);
  assert.ok(outlines.every((o) => o.closed && o.points.length > 3));
  // After Z, a relative move is from the subpath's start.
  assert.deepEqual(xy(parsePathData('M10 10 L20 10 L20 20 Z m5 5 l1 0 l0 1 z')), [
    { closed: true, points: [[10, 10], [20, 10], [20, 20]] },
    { closed: true, points: [[15, 15], [16, 15], [16, 16]] },
  ]);
  // A command right after Z starts a subpath there.
  assert.deepEqual(xy(parsePathData('M0 0 L10 0 L10 10 Z L5 5')), [
    { closed: true, points: [[0, 0], [10, 0], [10, 10]] },
    { closed: false, points: [[0, 0], [5, 5]] },
  ]);
  // A subpath of one point is dropped.
  assert.deepEqual(xy(parsePathData('M0 0 M5 5 L6 6')), [{ closed: false, points: [[5, 5], [6, 6]] }]);
});

test('numbers in every form parse', () => {
  assert.deepEqual(xy(parsePathData('M.5.5L1e1,2E1')), [{ closed: false, points: [[0.5, 0.5], [10, 20]] }]);
  assert.deepEqual(xy(parsePathData('M-1-2l-3-4')), [{ closed: false, points: [[-1, -2], [-4, -6]] }]);
  assert.deepEqual(xy(parsePathData('  M 1 , 2\n\tL3,4  ')), [{ closed: false, points: [[1, 2], [3, 4]] }]);
  assert.deepEqual(xy(parsePathData('M1.5.25.75.125')), [{ closed: false, points: [[1.5, 0.25], [0.75, 0.125]] }]);
  assert.deepEqual(xy(parsePathData('M+1 1e-1L2 2')), [{ closed: false, points: [[1, 0.1], [2, 2]] }]);
});

test('bad data keeps what came before', () => {
  assert.deepEqual(xy(parsePathData('M0 0 L10 0 L10 10 X L20 20')), [{ closed: false, points: [[0, 0], [10, 0], [10, 10]] }]);
  assert.deepEqual(xy(parsePathData('M0 0 L10 0 L10')), [{ closed: false, points: [[0, 0], [10, 0]] }]);
  assert.deepEqual(parsePathData('L10 10'), []); // must start with a move
  assert.deepEqual(parsePathData(''), []);
  assert.deepEqual(parsePathData(null), []);
  assert.deepEqual(xy(parsePathData('M0 0 L10 0 A5 5 0 2 0 20 0')), [{ closed: false, points: [[0, 0], [10, 0]] }]); // a flag of 2
  assert.deepEqual(parsePathData('M0 0 L1e999 0 L5 5'), []); // not a finite number, and one point's no outline
});
