// The fonts the art is drawn in (displayFonts.js): the 8x16 fonts' cells, that the fonts behind the
// IBM VGA font (Unscii: here, Symbols for Legacy Computing) draw on its grid, so their blocks line up.
import { test, expect, afterEach } from 'vitest';
import { createTestApp } from '../support/app.js';
import { setDisplayFont, DISPLAY_FONT, loadFontFaces, bitmapOf } from '@/lib/displayFonts';
import { fontFor } from '@/social/wire';
import { encodeFont } from '@/lib/BitmapFont';
import { setGlyphRasterizer, rasterizeCoverage, coverageOf } from '@/lib/GlyphCoverage';
import { drawnWidth, fitColumns } from '@/lib/DrawnWidth';
import CellCanvas from '@/lib/CellCanvas';

afterEach(() => setDisplayFont('jetbrains'));

const cellOf = () => {
  const view = new CellCanvas(document.createElement('canvas'));
  view.resize(4, 2, 1);
  const { metrics } = view;
  view.destroy();
  return metrics;
};

test('the IBM VGA font: 8x16 cells, its fallback on the same grid', async () => {
  await createTestApp();
  expect(cellOf()).toEqual({ cellWidth: 10, lineHeight: 20 }); // JetBrains Mono, the default
  await setDisplayFont('vga');
  setGlyphRasterizer(rasterizeCoverage); // measured in it, as App.vue does
  expect(DISPLAY_FONT.name).toBe('IBM VGA');
  expect(cellOf()).toEqual({ cellWidth: 8, lineHeight: 16 });
  // Sextants (from Unscii): the upper third inks only the top half, the lower third only the bottom.
  const [upperTop, upperBottom] = coverageOf('🬂'), [lowerTop, lowerBottom] = coverageOf('🬭');
  expect(upperTop).toBeGreaterThan(0.5);
  expect(upperBottom).toBe(0);
  expect(lowerTop).toBe(0);
  expect(lowerBottom).toBeGreaterThan(0.5);
  // One column exactly: nothing overflows, and the DOM view needn't hold it to its column.
  expect(drawnWidth('🬀')).toBeCloseTo(1, 2);
  expect(fitColumns('🬀')).toBe(0);
});

test('every 8x16 font switches back to JetBrains Mono', async () => {
  await createTestApp();
  for (const id of ['unscii', 'unifont']) {
    await setDisplayFont(id);
    expect(cellOf()).toEqual({ cellWidth: 8, lineHeight: 16 });
    expect(drawnWidth('A')).toBeCloseTo(1, 2);
  }
  await setDisplayFont('jetbrains');
  expect(cellOf()).toEqual({ cellWidth: 10, lineHeight: 20 });
  expect(getComputedStyle(document.documentElement).getPropertyValue('--display-font-size').trim()).toBe('17px');
});

test('the canvas and glyph coverage put the baseline where CSS does, for a font taller than its em', async () => {
  await createTestApp();
  // tests/fixtures/fonts/tall.ttf: ascent 1.1em, descent 0.1em; _ fills exactly the descent.
  document.fonts.add(await new FontFace('Phosphor Test Tall', 'url(/tests/fixtures/fonts/tall.ttf)').load());
  await setDisplayFont({ id: 'tall', name: 'Tall', family: '"Phosphor Test Tall", monospace', size: 20, lineHeight: 1.2 });
  setGlyphRasterizer(rasterizeCoverage);
  // A 24px line holds the 24px font exactly: the baseline 22px down, the descent below it.
  const canvas = document.createElement('canvas'), view = new CellCanvas(canvas);
  view.resize(1, 1, 1);
  const white = { r: 255, g: 255, b: 255 }, black = { r: 0, g: 0, b: 0 };
  view.draw([{ char: '_', fg: white, bg: black }]);
  const gl = canvas.getContext('webgl2'), { width, height } = canvas;
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  view.destroy();
  expect([width, height]).toEqual([12, 24]);
  const inked = []; // the rows mostly inked (its edge anti-aliased)
  for (let y = 0; y < height; y++) if (raw[((height - 1 - y) * width + 6) * 4] > 127) inked.push(y);
  expect(inked).toEqual([22, 23]);
  const [top, bottom] = coverageOf('_');
  expect(top).toBe(0);
  expect(bottom).toBeCloseTo(2 / 12, 2);
});

test('a fresh workspace draws in IBM VGA; a browser that already picked a font keeps it', async () => {
  const { createPinia } = await import('pinia'), { useWorkspaceStore } = await import('@/store/WorkspaceStore');
  localStorage.clear();
  expect(useWorkspaceStore(createPinia()).displayFont).toBe('vga');
  localStorage.setItem('phosphor.displayFont', 'jetbrains');
  expect(useWorkspaceStore(createPinia()).displayFont).toBe('jetbrains');
  localStorage.clear();
});

// A room's host can send font after font: what's kept of them is bounded, and the font the art is drawn in keeps its face.
test('bitmap fonts loaded one after another keep only the last few decoded and registered, and the display font\'s face', async () => {
  await createTestApp();
  const specOf = (n) => fontFor({ bitmap: true, name: `F${n}`, height: 8, size: 8, source: encodeFont({ height: 8, bytes: new Uint8Array(256 * 8).fill(n) }), blocks: '' });
  const faceOf = (spec) => [...document.fonts].some((face) => `"${face.family.replace(/^"|"$/g, '')}", monospace` === spec.family);
  const shown = specOf(200);
  await setDisplayFont(shown);
  const sent = Array.from({ length: 12 }, (_, i) => specOf(i + 1)), decoded = [];
  for (const spec of sent) {
    await loadFontFaces(spec);
    decoded.push(bitmapOf(spec));
  }
  await expect.poll(() => sent.filter(faceOf).length).toBeLessThanOrEqual(4);
  expect(faceOf(sent.at(-1))).toBe(true);
  expect(faceOf(shown)).toBe(true);   // the art is drawn in it
  expect(bitmapOf(sent[11])).toBe(decoded[11]);   // the newest is held
  expect(bitmapOf(sent[7])).not.toBe(decoded[7]);   // the fifth newest was let go, and is decoded again
});
