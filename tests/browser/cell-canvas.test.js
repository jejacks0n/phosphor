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
const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff', '#ffffff', '#000000', '#808080', '#aa5500'];

test('every pixel is exactly its cell\'s fg or bg', async () => {
  await createTestApp(); // the display font, as the app loads it
  const cols = 16, rows = 4;
  const cells = Array.from({ length: cols * rows }, (_, i) => cell(GLYPHS[i % GLYPHS.length], COLORS[i % COLORS.length], COLORS[(i * 3 + 1) % COLORS.length]));
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

// ﷽ from a test font (tests/fixtures/fonts/wide.ttf) joined to the display font's family: a solid
// bar exactly 8 columns wide, so these don't depend on the system's fallback fonts (Linux's draws ﷽
// about two columns wide, macOS's about eleven).
const WIDE = 8;
async function useWideFont() {
  const face = new FontFace('JetBrains Mono', 'url(/tests/fixtures/fonts/wide.ttf)', { unicodeRange: 'U+FDFD' });
  document.fonts.add(await face.load());
  const { drawnColumns } = await import('@/lib/DrawnWidth');
  expect(drawnColumns('﷽')).toBe(WIDE); // one column given, eight drawn
}

test('a character drawing wider than its column covers the cells after it, as a terminal draws it', async () => {
  await createTestApp();
  await useWideFont();
  const cols = WIDE + 3;
  const row = [cell('﷽', '#ff0000', '#000000'), ...Array.from({ length: cols - 1 }, (_, i) => cell(i % 2 ? 'x' : ' ', '#ffffff', '#0000ff'))];
  const { cw, ch, at } = drawAndRead(cols, 2, [...row, ...Array.from({ length: cols }, () => cell(' ', '#ffffff', '#0000ff'))]);
  const colorsIn = (c0, r = 0) => {
    const seen = new Set();
    for (let y = r * ch; y < (r + 1) * ch; y++) for (let x = c0 * cw; x < (c0 + 1) * cw; x++) seen.add(at(x, y).join());
    return seen;
  };
  const RED = '255,0,0', WHITE = '255,255,255', BLUE = '0,0,255', BLACK = '0,0,0';
  expect(colorsIn(0).has(RED)).toBe(true);                                  // its own column: the shape's start
  for (let c = 1; c < WIDE; c++) {
    const seen = colorsIn(c);
    expect(seen.has(RED)).toBe(true);                                       // its whole width, column by column
    for (const color of seen) expect([RED, WHITE, BLUE]).toContain(color);  // on top of the cell's own colors, nothing blended
    expect(seen.has(BLACK)).toBe(false);                                    // the spill doesn't bring its own background
  }
  for (let c = WIDE; c < cols; c++) expect(colorsIn(c).has(RED)).toBe(false); // and no further
  for (let c = 0; c < cols; c++) expect(colorsIn(c, 1).has(RED)).toBe(false); // nor into the next row
});

test('an overflowing character stops at the end of its row', async () => {
  await createTestApp();
  await useWideFont();
  const cols = 4; // ﷽ in column 1 would reach column 8: three columns of it fit
  const row = [cell(' ', '#ffffff', '#0000ff'), cell('﷽', '#ff0000', '#000000'), cell(' ', '#ffffff', '#0000ff'), cell(' ', '#ffffff', '#0000ff')];
  const { cw, ch, at } = drawAndRead(cols, 2, [...row, ...Array.from({ length: cols }, () => cell(' ', '#ffffff', '#0000ff'))]);
  const redIn = (c0, r) => {
    for (let y = r * ch; y < (r + 1) * ch; y++) for (let x = c0 * cw; x < (c0 + 1) * cw; x++) if (at(x, y).join() === '255,0,0') return true;
    return false;
  };
  expect([0, 1, 2, 3].map((c) => redIn(c, 0))).toEqual([false, true, true, true]);
  expect([0, 1, 2, 3].map((c) => redIn(c, 1))).toEqual([false, false, false, false]); // not wrapped into the next row
});

test('an overflowing character draws on top of the characters it covers', async () => {
  await createTestApp();
  await useWideFont();
  // Solid blocks after it: drawn under the overflow, so its color shows inside every one of them.
  const row = [cell('﷽', '#ff0000', '#000000'), ...Array.from({ length: WIDE - 1 }, () => cell('█', '#ffffff', '#0000ff'))];
  const { cw, ch, at } = drawAndRead(WIDE, 1, row);
  for (let c = 1; c < WIDE; c++) {
    let red = 0;
    for (let y = 0; y < ch; y++) for (let x = c * cw; x < (c + 1) * cw; x++) if (at(x, y).join() === '255,0,0') red++;
    expect(red).toBeGreaterThan(0);
  }
});
