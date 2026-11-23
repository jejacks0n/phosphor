// The picture a .pho file shows: cellsPng, the drawing as a PNG's pixels (Export › PNG's, hard-edged), in bands of lines.
import { test, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTestApp } from '../support/app.js';
import { drawnCells } from '@/lib/GifFile.js';
import { cellsPng, MAX_PREVIEW_PIXELS } from '@/lib/PngFile.js';
import { MAX_BACKING_AREA } from '@/lib/CellCanvas.js';
import { colorOf } from '@/lib/Cells.js';
import { setDisplayFont } from '@/lib/displayFonts.js';
import { fontWith } from '../support/blockFonts.js';

// The tests' own font is JetBrains Mono, which isn't 8×16: the default one is.
beforeEach(() => setDisplayFont('vga'));
afterEach(() => setDisplayFont('jetbrains'));

// A PNG's size and pixels, as the browser reads it.
async function decoded(bytes) {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
}

const cell = (char, fg, bg) => ({ char, fg: colorOf(fg), bg: colorOf(bg) });
const grid = (cols, lines, make) => Array.from({ length: cols * lines }, (_, i) => make(i % cols, Math.floor(i / cols)));

test('cellsPng of 10×3 cells in an 8×16 font is a 80×48 PNG whose pixels equal Export › PNG with smooth off', async () => {
  const cells = grid(10, 3, (x, y) => cell((x + y) % 2 ? '█' : '▄', { r: 40 * x, g: 80 * y, b: 200 }, { r: 10, g: 20 * x, b: 30 * y }));
  const png = await decoded(await cellsPng(10, 3, cells));
  const expected = await drawnCells(10, 3, { smooth: false }, ({ rgba }) => [...rgba(cells)]);
  expect([png.width, png.height]).toEqual([80, 48]);
  expect([...png.data]).toEqual(expected);
});

test('a 4×6 font drawn 4 wide gives a PNG 4 pixels a column', async () => {
  const { project, workspace } = await createTestApp();
  const four = fontWith({ 219: (h) => Array(h).fill(0xf0), 220: (h) => Array.from({ length: h }, (_, r) => (r >= h / 2 ? 0xf0 : 0)) }, 6);
  await project.setDrawingFont({ ...four, name: 'Four', width: 4 }); // answered: drawn at its own width
  await project.setBlankCanvas({ withLayer: true, cols: 20, rows: 4 });
  await setDisplayFont(workspace.displayFontSpec);
  expect(project.drawingFont.cellWidth).toBe(4);
  const png = await decoded(await cellsPng(20, 2, grid(20, 2, () => cell('█', { r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }))));
  expect([png.width, png.height]).toEqual([80, 12]);
});

test('a drawing taller than one canvas is drawn in bands at full size', async () => {
  const lines = 1666, fits = Math.min(lines, Math.floor(MAX_PREVIEW_PIXELS / (2400 * 16))); // the lines that fit under the cap
  const band = Math.floor(MAX_BACKING_AREA / (2400 * 16)); // a band's lines, as cellsPng cuts them
  const marks = new Map([[0, 10], [band - 1, 60], [band, 110], [fits - 1, 160]]); // line -> a red of its own
  const black = { r: 0, g: 0, b: 0 };
  const cells = grid(300, lines, (x, y) => (marks.has(y) ? cell('█', { r: marks.get(y), g: 0, b: 0 }, black) : cell(' ', black, black)));
  const png = await decoded(await cellsPng(300, lines, cells));
  expect([png.width, png.height]).toEqual([2400, 16 * fits]);
  expect(fits).toBeGreaterThan(band + 1); // more than one band, and the rest of the drawing cut
  expect(fits).toBeLessThan(lines);
  const pixel = (y) => [...png.data.slice(4 * (y * 2400 + 5), 4 * (y * 2400 + 5) + 3)];
  for (const [line, red] of marks) {
    expect(pixel(16 * line + 8)).toEqual([red, 0, 0]); // in its own line, at its own height
    if (line > 0 && !marks.has(line - 1)) expect(pixel(16 * line - 1)).toEqual([0, 0, 0]); // and not in the one above
  }
});

// Safari refuses a 2D canvas of 16,777,216 pixels or more (CellCanvas.js), so a full-color picture past that is written
// without one: here no canvas that size gets a 2D context, as in Safari.
test('a picture of more than 256 colors and 16,777,216 pixels is written without a canvas that size', async () => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  const refused = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (kind, ...rest) {
    return kind === '2d' && this.width * this.height >= 16_777_216 ? null : getContext.call(this, kind, ...rest);
  });
  const cols = 300, lines = 437; // 2400 × 6992, just past Safari's limit
  const bg = (x, y) => ({ r: x % 256, g: y % 256, b: (x + 3 * y) % 256 });
  const cells = grid(cols, lines, (x, y) => cell(' ', bg(x, y), bg(x, y)));
  let bytes;
  try {
    bytes = await cellsPng(cols, lines, cells);
  } finally {
    refused.mockRestore();
  }
  expect([bytes[24], bytes[25]]).toEqual([8, 2]); // IHDR: 8 bits, RGB
  const png = await decoded(bytes);
  expect([png.width, png.height]).toEqual([8 * cols, 16 * lines]);
  expect(png.width * png.height).toBeGreaterThan(16_777_216);
  const pixel = (x, y) => { const at = 4 * (y * png.width + x); return [png.data[at], png.data[at + 1], png.data[at + 2]]; };
  for (const [x, y] of [[0, 0], [1, 0], [299, 0], [17, 211], [255, 300], [299, 436]]) {
    const { r, g, b } = bg(x, y);
    expect(pixel(8 * x + 4, 16 * y + 8)).toEqual([r, g, b]);
  }
});
