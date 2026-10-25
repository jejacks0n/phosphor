// The base layer at the pipeline's processing scale: m x m pixels per grid pixel, so a moved block
// of the picture keeps every pixel the converter made from it.
import { test, expect } from 'vitest';
import PaintLayer from '@/document/PaintLayer';
import { ctx2d } from '@/lib/Canvas';

const FIT = { dx: 0, dy: 0, dw: 2, dh: 2 };
const fill = (layer, x, y, hex) => {
  const ctx = ctx2d(layer.canvas);
  ctx.fillStyle = hex;
  ctx.fillRect(x, y, 1, 1);
};

test('averageAt averages a grid pixel\'s block and ignores transparency', () => {
  const layer = new PaintLayer({ cols: 2, rows: 2, scale: 2, smooth: false });
  fill(layer, 0, 0, '#000000');
  fill(layer, 1, 0, '#000000');
  fill(layer, 0, 1, '#ffffff');
  fill(layer, 1, 1, '#ffffff');
  expect(layer.averageAt(0, 0)).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  expect(layer.averageAt(1, 1)).toBe(null);
});

test('version changes with every edit', () => {
  const layer = new PaintLayer({ cols: 2, rows: 2, scale: 2, smooth: false });
  let last = layer.version;
  const changed = () => {
    expect(layer.version).toBeGreaterThan(last);
    last = layer.version;
  };
  layer.paint([{ x: 0, y: 0, r: 255, g: 0, b: 0, alpha: 1 }]);
  changed();
  layer.erase([{ x: 0, y: 0 }]);
  changed();
  layer.pasteCells(layer.copyCells({ c0: 0, r0: 0, c1: 0, r1: 0 }), 1, 0, 1, 1);
  changed();
  layer.restore(null);
  changed();
});

test('resize can change the scale and keeps uniform blocks exact', () => {
  const layer = new PaintLayer({ cols: 2, rows: 2, scale: 2, smooth: false });
  layer.paint([{ x: 1, y: 1, r: 255, g: 0, b: 0, alpha: 1 }]);
  layer.resize(2, 2, FIT, FIT, 3);
  expect(layer.scale).toBe(3);
  expect(layer.averageAt(1, 1)).toEqual({ r: 255, g: 0, b: 0, a: 1 });
});
