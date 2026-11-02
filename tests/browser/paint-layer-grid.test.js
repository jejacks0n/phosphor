// Paint read and restored a grid pixel at a time: how a frame's paint leaves and comes back to the layer.
import { test, expect } from 'vitest';
import PaintLayer from '@/document/PaintLayer.js';

const COLS = 8, ROWS = 6;
const layerAt = (scale) => new PaintLayer({ cols: COLS, rows: ROWS, scale });
const at = (image, x, y) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

function gridWith(pixels) {
  const image = new ImageData(COLS, ROWS);
  for (const { x, y, r, g, b, a } of pixels) image.data.set([r, g, b, a], (y * COLS + x) * 4);
  return image;
}

for (const scale of [1, 4]) {
  test(`opaque paint comes back exactly, at scale ${scale}`, () => {
    const layer = layerAt(scale);
    layer.loadGrid(gridWith([{ x: 2, y: 3, r: 200, g: 40, b: 90, a: 255 }, { x: 7, y: 5, r: 1, g: 2, b: 3, a: 255 }]));
    const back = layer.gridPixels();
    expect([back.width, back.height]).toEqual([COLS, ROWS]);
    expect(at(back, 2, 3)).toEqual([200, 40, 90, 255]);
    expect(at(back, 7, 5)).toEqual([1, 2, 3, 255]);
    expect(at(back, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(layer.hasPaint).toBe(true);
  });

  test(`a loaded pixel fills its whole grid pixel with no smoothing at its edges, at scale ${scale}`, () => {
    const layer = layerAt(scale);
    layer.loadGrid(gridWith([{ x: 2, y: 3, r: 200, g: 40, b: 90, a: 255 }]));
    const { data, width } = layer.canvas.getContext('2d').getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    for (let y = 0; y < layer.canvas.height; y++) {
      for (let x = 0; x < layer.canvas.width; x++) {
        const inside = Math.floor(x / scale) === 2 && Math.floor(y / scale) === 3;
        expect(data[(y * width + x) * 4 + 3]).toBe(inside ? 255 : 0);
      }
    }
  });

  test(`soft paint settles: after one trip gridPixels returns the same bytes every further trip, at scale ${scale}`, () => {
    const layer = layerAt(scale);
    // Browsers keep partly transparent pixels premultiplied (changes.js), so what comes back can be a step off once.
    layer.loadGrid(gridWith([
      { x: 1, y: 1, r: 200, g: 40, b: 90, a: 13 },
      { x: 2, y: 1, r: 17, g: 203, b: 111, a: 1 },
      { x: 3, y: 1, r: 255, g: 254, b: 3, a: 128 },
      { x: 4, y: 1, r: 90, g: 91, b: 92, a: 254 },
    ]));
    const settled = layer.gridPixels();
    for (let trip = 0; trip < 4; trip++) {
      layer.loadGrid(layer.gridPixels());
      expect([...layer.gridPixels().data]).toEqual([...settled.data]);
    }
  });
}

test('hasPaint is false after loading an empty grid', () => {
  const layer = layerAt(2);
  layer.paint([{ x: 1, y: 1, r: 9, g: 9, b: 9, alpha: 1 }]);
  expect(layer.hasPaint).toBe(true);
  layer.loadGrid(new ImageData(COLS, ROWS));
  expect(layer.hasPaint).toBe(false);
  expect(at(layer.gridPixels(), 1, 1)).toEqual([0, 0, 0, 0]);
});

test('a load replaces what was there, and tells what is drawn from the layer that all of it changed', () => {
  const layer = layerAt(2);
  layer.paint([{ x: 1, y: 1, r: 9, g: 9, b: 9, alpha: 1 }]);
  const version = layer.version;
  layer.loadGrid(gridWith([{ x: 3, y: 3, r: 5, g: 5, b: 5, a: 255 }]));
  expect(at(layer.gridPixels(), 1, 1)).toEqual([0, 0, 0, 0]);
  expect(layer.changedSince(version)).toBe(null);
});
