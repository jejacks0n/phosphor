// The lobby's picture of a room: the host's view drawn off screen and encoded as WebP, as raw base64.
import { test, expect, vi, afterEach } from 'vitest';
import { thumbnailOf } from '@/social/thumbnail';
import { fontFor } from '@/social/wire';

const COLS = 300, LINES = 1666;
const hex = (n) => `#${((n & 0xff) << 16 | ((n * 7) & 0xff) << 8 | ((n * 13) & 0xff)).toString(16).padStart(6, '0')}`;
const color = (n) => ({ hex: hex(n), r: n & 0xff, g: (n * 7) & 0xff, b: (n * 13) & 0xff });
const cells = Array.from({ length: COLS * LINES }, (_, i) => ({ char: '▒#.'[i % 3], fg: color(i), bg: color(i >> 3) }));
const art = { cells, cols: COLS, lines: LINES, font: fontFor({ id: 'vga', size: 16 }) };

afterEach(() => vi.restoreAllMocks());

const imageOf = async (webp) => createImageBitmap(await (await fetch(`data:image/webp;base64,${webp}`)).blob());

test('the biggest grid gives raw base64 within the limit, an image about 320 px wide and 2:1', async () => {
  const webp = await thumbnailOf(art, { col: 100, row: 800, cols: 80, rows: 25 });
  expect(webp).toMatch(/^[A-Za-z0-9+/]+=*$/);
  expect(webp.length).toBeLessThanOrEqual(49_152);
  const image = await imageOf(webp);
  expect(Math.abs(image.width - 320)).toBeLessThan(40);
  expect(image.width / image.height).toBeGreaterThan(1.7);
  expect(image.width / image.height).toBeLessThan(2.3);
});

test('a view past the grid, or not measured yet, is held to the grid', async () => {
  expect(await thumbnailOf(art, { col: 1e9, row: 1e9, cols: 80, rows: 25 })).toMatch(/^[A-Za-z0-9+/]+=*$/);
  expect(await thumbnailOf(art, { col: 0, row: 0, cols: 0, rows: 0 })).toMatch(/^[A-Za-z0-9+/]+=*$/);
});

test('a larger picture that is over the limit at 0.8 is tried again at 0.5; still over, it gives null', async () => {
  const qualities = [];
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (done, type, quality) {
    qualities.push(quality);
    toBlob.call(this, (blob) => done(new Blob([new Uint8Array(40_000)], { type: blob.type })), type, quality);
  });
  expect(await thumbnailOf(art, { col: 0, row: 0, cols: 80, rows: 25 })).toBe(null);
  expect(qualities).toEqual([0.8, 0.5]);
});

test('a browser that can\'t encode WebP gives null', async () => {
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (done, type, quality) {
    toBlob.call(this, done, 'image/png', quality);
  });
  expect(await thumbnailOf(art, { col: 0, row: 0, cols: 80, rows: 25 })).toBe(null);
});

test('no WebGL2 gives null', async () => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (type, ...rest) {
    return type === 'webgl2' ? null : getContext.call(this, type, ...rest);
  });
  expect(await thumbnailOf(art, { col: 0, row: 0, cols: 80, rows: 25 })).toBe(null);
});
