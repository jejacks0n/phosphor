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

test('the PNG is made once while the paint stays, and again after a change or a restore', async () => {
  const layer = layerAt(2);
  layer.loadGrid(gridWith([{ x: 2, y: 3, r: 200, g: 40, b: 90, a: 255 }]));
  const first = layer.toBlob();
  expect(layer.toBlob()).toBe(first); // the same promise: nothing encoded again
  const kept = layer.snapshot();
  layer.paint([{ x: 5, y: 1, r: 1, g: 2, b: 3, alpha: 1 }]);
  const second = layer.toBlob();
  expect(second).not.toBe(first);
  const pixel = async (blob, x, y) => {
    const image = await createImageBitmap(await blob), canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    return [...ctx.getImageData(x * 2, y * 2, 1, 1).data];
  };
  expect(await pixel(second, 5, 1)).toEqual([1, 2, 3, 255]);
  layer.restore(kept); // back to before the paint: the PNG from before can't come back stale
  expect(layer.toBlob()).not.toBe(second);
  expect(await pixel(layer.toBlob(), 5, 1)).toEqual([0, 0, 0, 0]);
});

// A grid pixel of paint is the average of its block (docs/model.md R7): paint drawn finer than the grid (a shape merged
// down at its own detail) reads and shows as its average, as a vector layer's shapes do; paint laid a block at a time
// reads back exactly (above).
test('paint finer than the grid reads as its block\'s average, in pixelAt and gridPixels', () => {
  const layer = layerAt(4), ctx = layer.canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(8, 12, 2, 4); // the left half of grid pixel 2,3
  ctx.fillStyle = 'rgba(0, 0, 255, 0.5)';
  ctx.fillRect(10, 12, 2, 4); // the right half, half-transparent blue
  layer.hasPaint = true;
  const p = layer.pixelAt(2, 3);
  expect(p.a).toBeCloseTo(0.75, 2); // half opaque, half at 0.5
  expect([p.r, p.g, p.b]).toEqual([170, 0, 85]); // red weighted 2:1 over blue
  expect(at(layer.gridPixels(), 2, 3)).toEqual([170, 0, 85, 192]); // the canvas keeps the half-transparent half at 128/255
  expect(layer.pixelAt(3, 3)).toBeNull();
});

for (const scale of [1, 4, 2.5]) {
  test(`pixelsIn reads a region as pixelAt reads each pixel, and nothing outside it, at scale ${scale}`, () => {
    const layer = layerAt(scale);
    layer.paint([{ x: 2, y: 1, r: 200, g: 40, b: 90, alpha: 1 }, { x: 4, y: 4, r: 10, g: 20, b: 30, alpha: 0.5 }, { x: 6, y: 2, r: 9, g: 9, b: 9, alpha: 1 }]);
    const read = layer.pixelsIn(1, 1, 5, 4);
    for (let y = 1; y <= 4; y++) for (let x = 1; x <= 5; x++) expect(read(x, y), `${x},${y}`).toEqual(layer.pixelAt(x, y));
    expect(read(6, 2)).toBe(null); // painted, but outside the region
  });
}
