// The ANSI view's canvas renderer on real WebGL: aliased output (every pixel exactly its cell's fg or
// bg, no blended edge pixels), a wide character drawn across its two cells, and the backing size
// capped for a large grid.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';
import CellCanvas, { MAX_BACKING_AREA } from '@/lib/CellCanvas';
import { layoutWide } from '@/lib/Cells';

const rgb = (hex) => ({ hex, r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const cell = (char, fg, bg) => ({ char, fg: rgb(fg), bg: rgb(bg) });

// Draw and read the pixels back, top row first, in the same task (the drawing buffer isn't kept).
function drawAndRead(cols, rows, cells, dpr = 1) {
  const canvas = document.createElement('canvas');
  const view = new CellCanvas(canvas);
  view.resize(cols, rows, dpr);
  view.draw(cells);
  const gl = canvas.getContext('webgl2'), { width, height } = canvas;
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const at = (x, y) => { const o = ((height - 1 - y) * width + x) * 4; return [raw[o], raw[o + 1], raw[o + 2]]; };
  view.destroy();
  return { width, height, cw: width / cols, ch: height / rows, at };
}

const GLYPHS = ['A', 'g', '@', '░', '▒', '▓', '█', '▀', '▄', '▌', '─', '╬', 'é', '☺', ' ', '~'];
const COLOURS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ffffff', '#000000', '#808080', '#aa5500'];

test('every pixel is exactly its cell\'s fg or bg', async () => {
  await createTestApp(); // the display font, as the app loads it
  const cols = 16, rows = 4;
  const cells = Array.from({ length: cols * rows }, (_, i) => cell(GLYPHS[i % GLYPHS.length], COLOURS[i % COLOURS.length], COLOURS[(i * 3 + 1) % COLOURS.length]));
  for (const dpr of [1, 2]) {
    const { width, height, cw, ch, at } = drawAndRead(cols, rows, cells, dpr);
    expect(Number.isInteger(cw) && Number.isInteger(ch)).toBe(true);
    let inked = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = cells[Math.floor(y / ch) * cols + Math.floor(x / cw)];
        const p = at(x, y).join();
        const fg = [c.fg.r, c.fg.g, c.fg.b].join(), bg = [c.bg.r, c.bg.g, c.bg.b].join();
        if (p !== fg && p !== bg) throw new Error(`pixel ${x},${y} (dpr ${dpr}) is ${p}: neither fg ${fg} nor bg ${bg} of '${c.char}'`);
        if (p === fg && fg !== bg) inked++;
      }
    }
    expect(inked).toBeGreaterThan(0);
  }
});

test('a wide character is drawn across its two cells', async () => {
  await createTestApp();
  const cells = layoutWide([cell('漢', '#ffffff', '#000000'), cell(' ', '#ffffff', '#000000'), cell(' ', '#ffffff', '#000000')], 3);
  expect(cells[0].wide).toBe('lead');
  const { cw, ch, at } = drawAndRead(3, 1, cells);
  const inkIn = (c0) => { let n = 0; for (let y = 0; y < ch; y++) for (let x = c0 * cw; x < (c0 + 1) * cw; x++) if (at(x, y)[0] === 255) n++; return n; };
  expect(inkIn(0)).toBeGreaterThan(0);
  expect(inkIn(1)).toBeGreaterThan(0); // the trail draws the character's right half
  expect(inkIn(2)).toBe(0);
});

test('a 200×300 grid at dpr 2 stays under the backing cap', async () => {
  await createTestApp();
  const canvas = document.createElement('canvas');
  const view = new CellCanvas(canvas);
  view.resize(200, 300, 2);
  expect(canvas.width * canvas.height).toBeLessThanOrEqual(MAX_BACKING_AREA);
  expect(canvas.width % 200).toBe(0);
  expect(canvas.height % 300).toBe(0);
  view.destroy();
});
