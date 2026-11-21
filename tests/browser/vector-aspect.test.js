// In a font whose cells aren't 1:2 (pixelAspect ≠ 1), a vector shape's stroke is drawn, bounded and hit on screen: as
// wide down as across there, through one transform (shapes.js: onScreen).
import { test, expect } from 'vitest';
import { makeShape, rectShape, shapeBounds } from '@/document/shapes.js';
import ShapeLayer, { paintShape } from '@/document/ShapeLayer.js';
import { ctx2d } from '@/lib/Canvas.js';
import { hitsShape, shapesTouching } from '@/lib/shapeHits.js';

// A 256 × 256 canvas's bytes, and how many pixels (alpha at least 128) are down canvas column x and across canvas row y.
function measured(bytes) {
  const count = (at) => {
    let n = 0;
    for (let i = 0; i < 256; i++) if (bytes[at(i) * 4 + 3] >= 128) n++;
    return n;
  };
  return { bytes, column: (x) => count((y) => y * 256 + x), row: (y) => count((x) => y * 256 + x) };
}

// One shape painted at k = 8 on a 256 × 256 canvas (32 × 32 grid pixels), measured.
function drawn(shape, aspect) {
  const ctx = new OffscreenCanvas(256, 256).getContext('2d');
  paintShape(ctx, shape, 8, undefined, aspect);
  return measured(ctx.getImageData(0, 0, 256, 256).data);
}

test('in an 8×8 font a stroked rect is as thick on top as at its side on screen, centered or inside', async () => {
  for (const align of ['center', 'inside']) {
    const rect = rectShape(4, 4, 20, 20, { stroke: '#ffffff', width: 2, align });
    const eight = drawn(rect, 0.5), square = drawn(rect, 1);
    expect([eight.column(96), eight.row(96)], align).toEqual([64, 32]);  // top and bottom 32 canvas rows each: 16 on screen
    expect([square.column(96), square.row(96)], align).toEqual([32, 32]);
    expect(square.bytes).toEqual(drawn(rect).bytes);                    // aspect 1 is today's, to the byte
  }
});

test('in an 8×11 font the stroke\'s drawn edge, its bounds and a hit agree', async () => {
  const a = 11 / 16, rect = rectShape(4, 4, 20, 20, { stroke: '#ffffff', width: 2 }), reach = 1 / a; // half the width, in grid rows
  expect(hitsShape(rect, 12, 4 - reach + 0.05, 0, a)).toBe(true);
  expect(hitsShape(rect, 12, 4 - reach - 0.05, 0, a)).toBe(false);
  expect(hitsShape(rect, 4 - 1 + 0.05, 12, 0, a)).toBe(true);
  expect(hitsShape(rect, 4 - 1 - 0.05, 12, 0, a)).toBe(false);
  expect(Math.abs(drawn(rect, a).column(96) / 2 - 8 * 2 * reach)).toBeLessThanOrEqual(1); // each of top and bottom
  expect(shapeBounds(rect, a).y).toBeLessThanOrEqual(4 - reach);
  expect(hitsShape(rect, 12, 3.05, 0, 1)).toBe(hitsShape(rect, 12, 3.05, 0)); // aspect 1 is today's
});

test('a shape layer told a new aspect for the same shapes draws them all again, on screen', async () => {
  const shapes = new Map([['v:a', rectShape(4, 4, 20, 20, { stroke: '#ffffff', width: 2 })]]), layer = new ShapeLayer(null);
  layer.grid(32, 32, 8);
  const drawnHere = () => {
    layer.sync();
    const d = measured(ctx2d(layer.canvas).getImageData(0, 0, 256, 256).data);
    return [d.column(96), d.row(96)];
  };
  layer.set(shapes);
  expect(drawnHere()).toEqual([32, 32]);
  expect(layer.set(shapes, null, 0.5)).not.toBeNull();
  expect(drawnHere()).toEqual([64, 32]); // as drawn() at 0.5: on screen
  expect(layer.set(shapes, null, 0.5)).toBeNull();
});

test('in an 8×32 font a marquee over a thin stroke across the middle of a tall shape touches it', async () => {
  // Down to (200, 320), with a thin stroke out along y = 160 to the left: a box over the left meets only that stroke, in
  // the middle of a tall overlap, where samples spaced in grid pixels would fall too far apart on screen to see it.
  const line = (pts) => pts.map(([x, y]) => [x, y, 0, 0, 0, 0, 0]);
  const shape = makeShape({ points: line([[200, 0], [200, 160], [0, 160], [200, 160], [200, 320]]), closed: false, stroke: '#ffffff', width: 0.5 });
  const box = { x0: 0, y0: -10, x1: 150, y1: 330 };
  for (const aspect of [1, 2, 0.5]) expect(shapesTouching(new Map([['v:a', shape]]), box, null, aspect), String(aspect)).toEqual(['v:a']);
});
