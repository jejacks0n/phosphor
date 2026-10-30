// The ANSI view's canvas renderer on real WebGL: anti-aliased text that only ever blends a cell's fg
// into its bg (blocks and shades exactly one or the other), a wide character drawn across its two
// cells, and the backing size capped for a large grid.
import { test, expect } from 'vitest';
import { createTestApp } from '../support/app.js';
import CellCanvas, { MAX_BACKING_AREA } from '@/lib/CellCanvas';
import { layoutWide } from '@/lib/Cells';
import { fontFor } from '@/social/wire';

const rgb = (hex) => ({ hex, r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });
const cell = (char, fg, bg) => ({ char, fg: rgb(fg), bg: rgb(bg) });

// Draw and read the pixels back, top row first, in the same task (the drawing buffer isn't kept).
function drawAndRead(cols, rows, cells, dpr = 1, { smooth = true } = {}) {
  const canvas = document.createElement('canvas');
  const view = new CellCanvas(canvas);
  view.smooth = smooth;
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

// How far a pixel is from the nearest blend of fg into bg (bg + t * (fg - bg), t in 0..1).
function offBlend(p, fg, bg) {
  const d = [0, 1, 2].map((k) => fg[k] - bg[k]), len = d.reduce((n, v) => n + v * v, 0);
  const t = len ? Math.max(0, Math.min(1, [0, 1, 2].reduce((n, k) => n + (p[k] - bg[k]) * d[k], 0) / len)) : 0;
  return Math.hypot(...[0, 1, 2].map((k) => p[k] - (bg[k] + t * d[k])));
}

test('every pixel is its cell\'s fg, its bg or (smooth) a blend of them; sharp, or a block or shade, exactly one', async () => {
  await createTestApp(); // the display font, as the app loads it
  const cols = 16, rows = 4;
  const blocks = new Set(['░', '▒', '▓', '█', '▀', '▄', '▌', ' ']);
  const cells = Array.from({ length: cols * rows }, (_, i) => cell(GLYPHS[i % GLYPHS.length], COLORS[i % COLORS.length], COLORS[(i * 3 + 1) % COLORS.length]));
  for (const [dpr, smooth] of [[1, true], [2, true], [1, false], [2, false]]) {
    const exact = smooth ? blocks : { has: () => true };
    const { width, height, cw, ch, at } = drawAndRead(cols, rows, cells, dpr, { smooth });
    expect(Number.isInteger(cw) && Number.isInteger(ch)).toBe(true);
    let inked = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = cells[Math.floor(y / ch) * cols + Math.floor(x / cw)];
        const p = at(x, y), fg = [c.fg.r, c.fg.g, c.fg.b], bg = [c.bg.r, c.bg.g, c.bg.b];
        const isFg = p.join() === fg.join(), isBg = p.join() === bg.join();
        if (exact.has(c.char) && !isFg && !isBg) throw new Error(`pixel ${x},${y} (dpr ${dpr}) of '${c.char}' is ${p}: neither fg ${fg} nor bg ${bg}`);
        if (offBlend(p, fg, bg) > 2) throw new Error(`pixel ${x},${y} (dpr ${dpr}) of '${c.char}' is ${p}: not a blend of fg ${fg} and bg ${bg}`);
        if (isFg && !isBg) inked++;
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
  // Any ink (on black): smooth text can draw thin strokes without one fully covered pixel (Linux does).
  const inkIn = (c0) => { let n = 0; for (let y = 0; y < ch; y++) for (let x = c0 * cw; x < (c0 + 1) * cw; x++) if (at(x, y)[0] > 0) n++; return n; };
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

test('a 1000-line grid is never taller than the GPU can draw', async () => {
  await createTestApp();
  const canvas = document.createElement('canvas');
  const view = new CellCanvas(canvas);
  view.resize(80, 1000, 2);
  const gl = canvas.getContext('webgl2');
  expect([gl.drawingBufferWidth, gl.drawingBufferHeight]).toEqual([canvas.width, canvas.height]); // past its limit, the buffer is quietly cut short
  expect(canvas.height % 1000).toBe(0);
  view.destroy();
});

// ﷽ from a test font (tests/fixtures/fonts/wide.ttf) joined to the display font's family: a solid
// bar 7.5 columns wide, drawing over 8, so these don't depend on the system's fallback fonts (Linux's draws ﷽
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
  const RED = '255,0,0';
  expect(colorsIn(0).has(RED)).toBe(true);                                  // its own column: the shape's start
  for (let c = 1; c < WIDE; c++) {
    const seen = colorsIn(c);
    expect(seen.has(RED)).toBe(true);                                       // its whole width, column by column
    // On top of the cell's own colors (white on blue): a mix of red, white and blue only, so the
    // spill doesn't bring its own (black) background. Any black in a mix leaves red + blue under 255.
    for (const color of seen) expect(color.split(',').map(Number).filter((_, k) => k !== 1).reduce((a, b) => a + b), color).toBeGreaterThanOrEqual(253);
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

test('a color glyph (an emoji) draws in its own colors, not the cell\'s fg', async () => {
  await createTestApp();
  // 😀 from a test font (tests/fixtures/fonts/color.ttf): a red bar in its left column, green in its right.
  const face = new FontFace('JetBrains Mono', 'url(/tests/fixtures/fonts/color.ttf)', { unicodeRange: 'U+1F600' });
  document.fonts.add(await face.load());
  const cells = layoutWide([cell('😀', '#ffffff', '#0000ff'), cell(' ', '#ffffff', '#0000ff'), cell(' ', '#ffffff', '#0000ff')], 3);
  const { cw, ch, at } = drawAndRead(3, 1, cells);
  const colorsIn = (c0) => {
    const seen = new Set();
    for (let y = 0; y < ch; y++) for (let x = c0 * cw; x < (c0 + 1) * cw; x++) seen.add(at(x, y).join());
    return [...seen].sort();
  };
  const RED = '255,0,0', GREEN = '0,255,0', BLUE = '0,0,255';
  expect(colorsIn(0)).toEqual([BLUE, RED].sort());   // its colors on the cell's background, nothing blended
  expect(colorsIn(1)).toEqual([BLUE, GREEN].sort()); // the trail: its right half
  expect(colorsIn(2)).toEqual([BLUE]);
});

test('shades are CP437\'s dot patterns, a dot a sixteenth of the cell high, seamless across cells and rows', async () => {
  await createTestApp();
  const { setDisplayFont } = await import('@/lib/displayFonts');
  // ░ a quarter of the dots, ▒ a checkerboard, ▓ the inverse of ░ (CP437's 0xB0-0xB2), laid across
  // the whole grid, not per cell; a dot is the cell's height / 16 (the VGA's rows) in whole pixels.
  const quarter = (x, y) => (y % 2 ? x % 4 === 0 : x % 4 === 2);
  const patterns = { '░': quarter, '▒': (x, y) => (x + y) % 2 === 0, '▓': (x, y) => !quarter(x, y) };
  for (const font of ['jetbrains', 'vga']) {
    await setDisplayFont(font);
    for (const dpr of [1, 2]) {
      for (const [char, inked] of Object.entries(patterns)) {
        const cols = 3, rows = 3;
        const { width, height, ch, at } = drawAndRead(cols, rows, Array.from({ length: cols * rows }, () => cell(char, '#ffffff', '#000000')), dpr);
        const dot = Math.max(1, Math.round(ch / 16));
        if (font === 'vga') expect(dot).toBe(dpr); // the VGA's own pixel: one CSS pixel
        let wrong = 0;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) wrong += (at(x, y)[0] === 255) !== inked(Math.floor(x / dot), Math.floor(y / dot));
        }
        expect(wrong, `${char} in ${font} at dpr ${dpr}`).toBe(0);
      }
    }
  }
  await setDisplayFont('jetbrains');
});

// The canvas's pixels as rows of "r,g,b" strings, read in the same task as the draw.
function readView(view) {
  const gl = view.canvas.getContext('webgl2'), { width, height } = view.canvas;
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  return Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => {
    const o = ((height - 1 - y) * width + x) * 4;
    return `${raw[o]},${raw[o + 1]},${raw[o + 2]}`;
  }));
}

// A 24 x 12 grid with a wide character (漢) as lead and trail at (6, 3) and (7, 3), ﷽ at (2, 4),
// drawing over eight columns, so it spills across the window's left edge, and ░▒▓ in the window's
// first and last rows. The 10 x 6 window starts at (7, 2): an odd column and row, so a shade's dots
// (a 4 x 2 pattern) only line up with the whole grid's if the window's origin is added (at dpr 2 a
// dot is 3 px and a cell 20 x 40, so no offset is a whole number of dots).
const GRID_COLS = 24, GRID_ROWS = 12, WINDOW = { cols: GRID_COLS, rows: GRID_ROWS, col: 7, row: 2 };
function windowGrid() {
  const cells = Array.from({ length: GRID_COLS * GRID_ROWS }, (_, i) => cell(GLYPHS[i % GLYPHS.length], COLORS[i % COLORS.length], COLORS[(i * 3 + 1) % COLORS.length]));
  cells[3 * GRID_COLS + 6] = cell('漢', '#ffffff', '#000080');
  cells[3 * GRID_COLS + 7] = cell(' ', '#ffffff', '#000080');
  cells[4 * GRID_COLS + 2] = cell('﷽', '#ff0000', '#000000');
  for (const r of [2, 7]) ['░', '▒', '▓'].forEach((char, k) => { for (let c = 0; c < 3; c++) cells[r * GRID_COLS + 9 + k * 3 + c] = cell(char, '#ffffff', '#000000'); });
  return layoutWide(cells, GRID_COLS);
}

test('a window draws exactly the pixels the whole grid draws there', async () => {
  await createTestApp();
  await useWideFont();
  const cells = windowGrid();
  expect(cells[3 * GRID_COLS + 6].wide).toBe('lead');
  expect(cells[3 * GRID_COLS + WINDOW.col].wide).toBe('trail'); // the window's left edge
  for (const dpr of [1, 2]) {
    const canvas = document.createElement('canvas');
    const view = new CellCanvas(canvas);
    view.resize(GRID_COLS, GRID_ROWS, dpr);
    view.draw(cells);
    const whole = readView(view), cw = canvas.width / GRID_COLS, ch = canvas.height / GRID_ROWS;
    view.resize(10, 6, dpr);
    view.draw(cells, WINDOW);
    const part = readView(view);
    expect(part.length).toBe(6 * ch);
    for (let y = 0; y < part.length; y++) expect(part[y], `dpr ${dpr} row ${y}`).toEqual(whole[WINDOW.row * ch + y].slice(WINDOW.col * cw, (WINDOW.col + 10) * cw));
    view.destroy();
  }
});

test('at a zoom, the cell is the zoomed size: glyphs drawn at dpr x zoom, in CSS px at the zoom', async () => {
  await createTestApp();
  const c = new CellCanvas(document.createElement('canvas'));
  const full = c.cellSize(1);
  expect(c.cellSize(2, 0.5)).toEqual({ cellWidth: full.cellWidth / 2, lineHeight: full.lineHeight / 2 });
  expect(c.cellSize(2)).toEqual(c.cellSize(2, 1));
  c.resize(10, 4, 2, 0.5);
  expect(c.metrics).toEqual(c.cellSize(2, 0.5));
  expect(parseFloat(c.canvas.style.width)).toBe(10 * c.metrics.cellWidth);
  expect(parseFloat(c.canvas.style.height)).toBe(4 * c.metrics.lineHeight);
  const half = c.canvas.width;
  expect(half).toBe(new CellCanvas(document.createElement('canvas')).cellSize(1).cellWidth * 10); // glyphs drawn at 1 device px per font px
  c.resize(10, 4, 2);
  expect(half).toBe(c.canvas.width / 2); // the zoom reaches the backing store
  c.resize(10, 4, 2, 0.5);
  expect(c.resize(10, 4, 2, 0.5)).toBe(false);
  expect(c.resize(10, 4, 2, 1)).toBe(true); // the same size at another zoom is a change
  c.destroy();
});

test('at any dpr and zoom, metrics is exactly cellSize (float drift would break comparing them)', async () => {
  await createTestApp();
  const c = new CellCanvas(document.createElement('canvas'));
  const cases = [[3, 0.3], [1.5, 0.7408], [2, 0.5], [1, 1], [1.25, 0.6]];
  for (const dpr of [1.25, 1.5, 2, 3]) for (let zoom = 0.25; zoom <= 1; zoom += 0.0137) cases.push([dpr, zoom]); // some of these drift
  for (const [dpr, zoom] of cases) {
    c.resize(10, 4, dpr, zoom);
    expect(c.metrics, `dpr ${dpr} zoom ${zoom}`).toEqual(c.cellSize(dpr, zoom));
  }
  c.destroy();
});

test('a zoomed window draws the pixels the whole grid draws there at the same zoom', async () => {
  await createTestApp();
  await useWideFont();
  const cells = windowGrid();
  for (const [dpr, zoom] of [[2, 0.5], [2, 0.75], [1, 0.5]]) {
    const canvas = document.createElement('canvas');
    const view = new CellCanvas(canvas);
    view.resize(GRID_COLS, GRID_ROWS, dpr, zoom);
    view.draw(cells);
    const whole = readView(view), cw = canvas.width / GRID_COLS, ch = canvas.height / GRID_ROWS;
    view.resize(10, 6, dpr, zoom);
    view.draw(cells, WINDOW);
    const part = readView(view);
    expect(part.length).toBe(6 * ch);
    for (let y = 0; y < part.length; y++) expect(part[y], `dpr ${dpr} zoom ${zoom} row ${y}`).toEqual(whole[WINDOW.row * ch + y].slice(WINDOW.col * cw, (WINDOW.col + 10) * cw));
    view.destroy();
  }
});

test('the canvas is the window\'s size, at full dpr, however long the grid', async () => {
  await createTestApp();
  const canvas = document.createElement('canvas');
  const view = new CellCanvas(canvas);
  view.resize(80, 40, 2);
  const cells = Array.from({ length: 80 * 1000 }, (_, i) => cell(GLYPHS[i % GLYPHS.length], COLORS[i % COLORS.length], '#000000'));
  view.draw(cells, { cols: 80, rows: 1000, col: 0, row: 900 });
  const gl = canvas.getContext('webgl2'), seen = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, seen);
  expect(seen.some((v, i) => i % 4 < 3 && v > 0)).toBe(true); // the window drew
  expect(canvas.height).toBe(40 * view.metrics.lineHeight * 2);
  expect(canvas.width / (80 * view.metrics.cellWidth)).toBe(2);
  expect([gl.drawingBufferWidth, gl.drawingBufferHeight]).toEqual([canvas.width, canvas.height]);
  view.destroy();
});

test('a window that doesn\'t fit the grid, or cells of another grid, draw nothing', async () => {
  await createTestApp();
  const cells = windowGrid();
  const canvas = document.createElement('canvas');
  const view = new CellCanvas(canvas);
  view.resize(10, 6, 1);
  view.draw(cells, WINDOW);
  const before = readView(view);
  expect(new Set(before.flat()).size).toBeGreaterThan(2); // the first draw did draw
  view.draw(cells, { cols: GRID_COLS, rows: GRID_ROWS, col: 20, row: 0 }); // past the right edge
  view.draw(cells, { cols: 32, rows: 12, col: 7, row: 2 });                // 288 cells, but a 32 x 12 grid is 384
  expect(readView(view)).toEqual(before);
  view.destroy();
});

test('cellSize is the cell resize gives at full dpr', async () => {
  await createTestApp();
  const view = new CellCanvas(document.createElement('canvas'));
  const size = view.cellSize(2);
  view.resize(10, 6, 2);
  expect(size).toEqual(view.metrics);
  view.destroy();
});

test('a canvas with a font of its own measures in it, not in the display font', async () => {
  await createTestApp(); // the display font: JetBrains Mono
  const own = new CellCanvas(document.createElement('canvas'), { font: fontFor({ id: 'vga', size: 16 }) });
  const global = new CellCanvas(document.createElement('canvas'));
  expect(own.cellSize(1).lineHeight).toBe(16);
  expect(global.cellSize(1).lineHeight).toBe(20);
  own.destroy();
  global.destroy();
});

test('a full atlas draws what doesn\'t fit as blank, however many characters a grid has, and the next draw starts it over', async () => {
  await createTestApp();
  const { ch } = drawAndRead(1, 1, [cell('A', '#ffffff', '#000000')]);
  const real = WebGL2RenderingContext.prototype.getParameter;
  WebGL2RenderingContext.prototype.getParameter = function getParameter(name) {
    return name === this.MAX_TEXTURE_SIZE ? ch * 2 : real.call(this, name);   // two rows of 64 glyphs
  };
  try {
    const canvas = document.createElement('canvas');
    const view = new CellCanvas(canvas);
    const inked = (cols, rows, x, y) => {
      const gl = canvas.getContext('webgl2'), { width, height } = canvas;
      const [w, h] = [width / cols, height / rows], raw = new Uint8Array(w * h * 4);
      gl.readPixels(x * w, height - (y + 1) * h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      return raw.some((v, i) => i % 4 === 0 && v > 0);
    };
    const many = Array.from({ length: 200 }, (_, i) => cell(String.fromCodePoint(0x410 + i), '#ffffff', '#000000'));
    view.resize(20, 10, 1);
    view.draw(many);
    expect(inked(20, 10, 1, 0)).toBe(true);    // in the atlas
    expect(inked(20, 10, 19, 9)).toBe(false);  // past it
    view.draw(many.map(() => cell('A', '#ffffff', '#000000')));
    expect(inked(20, 10, 19, 9)).toBe(true);   // the atlas started over for what's in view
    view.destroy();
  } finally {
    WebGL2RenderingContext.prototype.getParameter = real;
  }
});
