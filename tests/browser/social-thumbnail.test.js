// The lobby's picture of a room: the art's full width around the host's view or a pinned line, encoded
// as WebP (JPEG where the browser can't make WebP), as raw base64.
import { test, expect, vi, afterEach } from 'vitest';
import { thumbnailOf, lobbyWindow } from '@/social/thumbnail';
import { fontFor } from '@/social/wire';
import { pictureUrl } from '@/social/lobby';
import CellCanvas from '@/lib/CellCanvas';

const COLS = 300, LINES = 1666;
const black = { hex: '#000000', r: 0, g: 0, b: 0 }, white = { hex: '#ffffff', r: 255, g: 255, b: 255 };
const font = fontFor({ id: 'vga', size: 16 });

// The whole grid black, but for white blocks in the lines from `from` up to `to`: so a window that
// isn't over those lines draws nothing, and a thumbnail shows white only where it should.
const gridOf = (from, to) => ({
  cols: COLS, lines: LINES, font,
  cells: Array.from({ length: COLS * LINES }, (_, i) => {
    const line = Math.floor(i / COLS);
    return { char: line >= from && line < to ? '█' : ' ', fg: white, bg: black };
  }),
});
const blank = gridOf(0, 0);

afterEach(() => vi.restoreAllMocks());

// The thumbnail's pixels, as the browser decodes it.
async function pixelsOf(webp) {
  const image = await createImageBitmap(await (await fetch(pictureUrl(webp))).blob());
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data };
}
const whiteShare = ({ data }) => {
  let white = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) white++;
  return white / (data.length / 4);
};
const BASE64 = /^[A-Za-z0-9+/]+=*$/;
const MIDDLE = { middle: 800 };

test('the window is the art\'s full width at 2:1, around the middle line it\'s given', async () => {
  const webp = await thumbnailOf(gridOf(750, 850), MIDDLE);
  expect(webp).toMatch(BASE64);
  expect(webp.length).toBeLessThanOrEqual(49_152);
  const image = await pixelsOf(webp);
  expect(Math.abs(image.width - 320)).toBeLessThan(40);
  expect(image.width / image.height).toBeGreaterThan(1.6);   // 300 columns are a pixel each, so the cells' whole pixels bend 2:1 a little
  expect(image.width / image.height).toBeLessThan(2.3);
  expect(whiteShare(image)).toBeGreaterThan(0.95);   // the lines around the middle are all in the window

  // Differs from a blank grid's, and a middle elsewhere sees none of those lines.
  expect(webp).not.toBe(await thumbnailOf(blank, MIDDLE));
  expect(whiteShare(await pixelsOf(await thumbnailOf(gridOf(750, 850), { middle: 100 })))).toBe(0);
});

test('a pinned row is the window\'s top; one past the end is held to the last lines', async () => {
  const last = await thumbnailOf(gridOf(LINES - 100, LINES), { row: 1e9 });
  expect(last).toMatch(BASE64);
  expect(whiteShare(await pixelsOf(last))).toBeGreaterThan(0.95);
  const first = await thumbnailOf(gridOf(0, 100), { row: 0 });
  expect(first).toMatch(BASE64);
  expect(whiteShare(await pixelsOf(first))).toBeGreaterThan(0.95);
});

test('lobbyWindow: 2:1 of the art\'s width in lines, centered on a middle or from a pinned row, held to the grid', () => {
  const cell = { cellWidth: 8, lineHeight: 16 };
  expect(lobbyWindow({ cols: 80, lines: 1000 }, cell, { middle: 500 })).toEqual({ row: 490, rows: 20 });
  expect(lobbyWindow({ cols: 80, lines: 1000 }, cell, { row: 995 })).toEqual({ row: 980, rows: 20 });
  expect(lobbyWindow({ cols: 80, lines: 1000 }, cell, { row: 7 })).toEqual({ row: 7, rows: 20 });
  expect(lobbyWindow({ cols: 80, lines: 1000 }, cell, { middle: NaN }).row).toBe(0);
  expect(lobbyWindow({ cols: 80, lines: 1000 }, cell, { middle: 0 }).row).toBe(0);
  expect(lobbyWindow({ cols: 80, lines: 5 }, cell, { middle: 2 })).toEqual({ row: 0, rows: 5 });
});

test('a grid shorter than the window is the whole of it', async () => {
  const small = { ...gridOf(0, 0), cols: 20, lines: 10 };
  small.cells = Array.from({ length: 200 }, () => ({ char: '█', fg: white, bg: black }));
  expect(whiteShare(await pixelsOf(await thumbnailOf(small, MIDDLE)))).toBeGreaterThan(0.95);
});

test('a larger picture that is over the limit at 0.8 is tried again at 0.5; still over, it gives null', async () => {
  const qualities = [];
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (done, type, quality) {
    qualities.push(quality);
    toBlob.call(this, (blob) => done(new Blob([new Uint8Array(40_000)], { type: blob.type })), type, quality);
  });
  expect(await thumbnailOf(blank, MIDDLE)).toBe(null);
  expect(qualities).toEqual([0.8, 0.5]);
});

test('a browser that can\'t encode WebP (Safari makes a PNG instead) gives a JPEG of the same cells', async () => {
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (done, type, quality) {
    toBlob.call(this, done, type === 'image/webp' ? 'image/png' : type, quality);
  });
  const jpeg = await thumbnailOf(gridOf(750, 850), MIDDLE);
  expect(jpeg).toMatch(BASE64);
  expect(pictureUrl(jpeg)).toMatch(/^data:image\/jpeg;/);
  expect(jpeg.length).toBeLessThanOrEqual(49_152);
  expect(whiteShare(await pixelsOf(jpeg))).toBeGreaterThan(0.95);
});

test('a browser that can encode neither WebP nor JPEG gives null', async () => {
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (done, type, quality) {
    toBlob.call(this, done, 'image/png', quality);
  });
  expect(await thumbnailOf(blank, MIDDLE)).toBe(null);
});

test('no WebGL2 gives null, without a context to release', async () => {
  const destroy = vi.spyOn(CellCanvas.prototype, 'destroy');
  const getContext = HTMLCanvasElement.prototype.getContext;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (type, ...rest) {
    return type === 'webgl2' ? null : getContext.call(this, type, ...rest);
  });
  expect(await thumbnailOf(blank, MIDDLE)).toBe(null);
  expect(destroy).not.toHaveBeenCalled();
});

test('the canvas\'s WebGL context is released whether the picture is made, can\'t be encoded, or is too big', async () => {
  const destroy = vi.spyOn(CellCanvas.prototype, 'destroy');
  expect(await thumbnailOf(blank, MIDDLE)).toMatch(BASE64);
  expect(destroy).toHaveBeenCalledTimes(1);

  const toBlob = HTMLCanvasElement.prototype.toBlob;
  const mock = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (done, type, quality) {
    toBlob.call(this, done, 'image/png', quality);
  });
  expect(await thumbnailOf(blank, MIDDLE)).toBe(null);
  expect(destroy).toHaveBeenCalledTimes(2);

  mock.mockImplementation(function (done, type, quality) {
    toBlob.call(this, (blob) => done(new Blob([new Uint8Array(40_000)], { type: blob.type })), type, quality);
  });
  expect(await thumbnailOf(blank, MIDDLE)).toBe(null);
  expect(destroy).toHaveBeenCalledTimes(3);
});
